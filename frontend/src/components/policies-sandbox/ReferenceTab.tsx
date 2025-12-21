'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  BookOpen,
  Copy,
  Check,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  ArrowRightLeft,
  AlertTriangle,
  Lightbulb
} from 'lucide-react';

interface Mapping {
  xacml: string;
  rego: string;
  notes: string;
  xacmlExample: string;
  regoExample: string;
}

const MAPPINGS: Mapping[] = [
  {
    xacml: '<Target>',
    rego: 'Input guards (input.action == "read")',
    notes: 'Policy applicability scoping',
    xacmlExample: `<Target>
  <AnyOf>
    <AllOf>
      <Match MatchId="string-equal">
        <AttributeValue>read</AttributeValue>
        <AttributeDesignator
          Category="action"
          AttributeId="action-id"/>
      </Match>
    </AllOf>
  </AnyOf>
</Target>`,
    regoExample: `# Policy only applies to read actions
package dive.lab.example

import rego.v1

default allow := false

allow if {
  input.action == "read"
  # ... other conditions
}`
  },
  {
    xacml: '<Condition>',
    rego: 'Rule predicates',
    notes: 'Boolean expressions for decision logic',
    xacmlExample: `<Condition>
  <Apply FunctionId="string-equal">
    <Apply FunctionId="string-one-and-only">
      <AttributeDesignator
        Category="subject"
        AttributeId="clearance"/>
    </Apply>
    <AttributeValue>SECRET</AttributeValue>
  </Apply>
</Condition>`,
    regoExample: `# Check clearance level
allow if {
  input.subject.clearance == "SECRET"
  # ... other checks
}

# Or as a violation check (fail-secure)
is_insufficient_clearance := msg if {
  clearance_hierarchy[input.subject.clearance] <
    clearance_hierarchy[input.resource.classification]
  msg := "Insufficient clearance"
}`
  },
  {
    xacml: '<Rule Effect="Permit">',
    rego: 'allow := true',
    notes: 'Explicit permit decision',
    xacmlExample: `<Rule RuleId="permit-rule" Effect="Permit">
  <Target>...</Target>
  <Condition>...</Condition>
</Rule>`,
    regoExample: `default allow := false

allow := true if {
  # All conditions met
  not is_not_authenticated
  not is_insufficient_clearance
}`
  },
  {
    xacml: 'Policy Combining Algorithms',
    rego: 'Multiple rules with OR/AND logic',
    notes: 'XACML uses combining algorithms (permit-overrides, deny-overrides); Rego uses explicit boolean logic',
    xacmlExample: `<PolicySet PolicyCombiningAlgId=
  "permit-overrides">
  <Policy>...</Policy>
  <Policy>...</Policy>
</PolicySet>`,
    regoExample: `# Explicit OR logic
allow if {
  condition_a
}

allow if {
  condition_b
}

# Explicit AND logic
allow if {
  condition_a
  condition_b
  condition_c
}`
  },
  {
    xacml: '<Obligations>',
    rego: 'obligations := [...]',
    notes: 'Post-decision actions that MUST be performed',
    xacmlExample: `<Obligations>
  <Obligation ObligationId="log-access">
    <AttributeAssignment
      AttributeId="resource-id">
      doc-123
    </AttributeAssignment>
  </Obligation>
</Obligations>`,
    regoExample: `obligations := [
  {
    "type": "LOG_ACCESS",
    "params": {
      "resourceId": input.resource.resourceId,
      "timestamp": time.now_ns()
    }
  }
] if {
  allow
}`
  },
  {
    xacml: '<Advice>',
    rego: 'advice field',
    notes: 'Non-binding suggestions (XACML concept, Rego can mimic)',
    xacmlExample: `<AssociatedAdvice>
  <Advice AdviceId="mfa-recommended">
    <AttributeAssignment
      AttributeId="reason">
      High-value resource
    </AttributeAssignment>
  </Advice>
</AssociatedAdvice>`,
    regoExample: `advice := [
  {
    "type": "MFA_RECOMMENDED",
    "params": {
      "reason": "High-value resource"
    }
  }
] if {
  input.resource.classification == "TOP_SECRET"
  input.subject.aal != "AAL3"
}`
  }
];

const KEY_DIFFERENCES = [
  {
    title: 'Default Behavior',
    content: 'XACML typically uses NotApplicable as default; Rego uses explicit `default allow := false` (fail-secure).'
  },
  {
    title: 'Combining Logic',
    content: 'XACML has built-in combining algorithms (permit-overrides, deny-overrides); Rego requires explicit boolean logic with multiple rules or operators.'
  },
  {
    title: 'Syntax',
    content: 'XACML is XML-based (verbose); Rego is a declarative logic language (concise).'
  },
  {
    title: 'Data Model',
    content: 'XACML uses AttributeDesignators with Categories; Rego uses JSON input with dot notation (input.subject.clearance).'
  },
  {
    title: 'Functions',
    content: 'XACML has standardized functions (string-equal, integer-greater-than); Rego has built-in functions plus custom helper rules.'
  },
  {
    title: 'Obligations vs Advice',
    content: 'XACML distinguishes MUST (obligations) vs MAY (advice); Rego typically only has obligations (but advice can be added as custom field).'
  }
];

const EXTERNAL_RESOURCES = [
  { name: 'OPA Documentation', url: 'https://www.openpolicyagent.org/docs/latest/', category: 'rego' },
  { name: 'Rego Policy Language Reference', url: 'https://www.openpolicyagent.org/docs/latest/policy-language/', category: 'rego' },
  { name: 'XACML 3.0 Core Specification', url: 'https://docs.oasis-open.org/xacml/3.0/xacml-3.0-core-spec-os-en.html', category: 'xacml' },
  { name: 'XACML Tutorial (Axiomatics)', url: 'https://www.axiomatics.com/blog/xacml-tutorial/', category: 'xacml' },
  { name: 'AuthzForce CE (XACML PDP)', url: 'https://github.com/authzforce/core', category: 'xacml' }
];

export default function ReferenceTab() {
  const [expandedMapping, setExpandedMapping] = useState<number | null>(0);
  const [copiedIndex, setCopiedIndex] = useState<{ index: number; type: 'xacml' | 'rego' } | null>(null);

  const handleCopy = async (text: string, index: number, type: 'xacml' | 'rego') => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex({ index, type });
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-100 flex items-center gap-3">
          <ArrowRightLeft className="w-6 h-6 text-amber-400" />
          XACML to Rego Mapping Guide
        </h2>
        <p className="text-sm text-gray-400 mt-2 max-w-3xl">
          Understanding how XACML 3.0 constructs map to OPA Rego policy language.
          Both implement attribute-based access control (ABAC), but with different syntax and paradigms.
        </p>
      </div>

      {/* Quick Reference Table */}
      <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="px-4 py-3 bg-slate-800/50 border-b border-slate-700/50">
          <h3 className="text-sm font-semibold text-gray-300">Quick Reference</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-purple-400 uppercase tracking-wide">XACML</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-cyan-400 uppercase tracking-wide">Rego</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Notes</th>
              </tr>
            </thead>
            <tbody>
              {MAPPINGS.map((mapping, index) => (
                <tr key={index} className="border-b border-slate-700/30 hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-sm text-purple-300">{mapping.xacml}</td>
                  <td className="px-4 py-3 font-mono text-sm text-cyan-300">{mapping.rego}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">{mapping.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Examples */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-200 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-amber-400" />
          Detailed Code Examples
        </h3>

        <div className="space-y-3">
          {MAPPINGS.map((mapping, index) => (
            <div
              key={index}
              className="bg-slate-900/50 rounded-xl border border-slate-700/50 overflow-hidden"
            >
              <button
                onClick={() => setExpandedMapping(expandedMapping === index ? null : index)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <code className="px-2 py-1 rounded bg-purple-500/20 text-purple-300 text-xs font-mono">
                    {mapping.xacml}
                  </code>
                  <span className="text-gray-500">↔</span>
                  <code className="px-2 py-1 rounded bg-cyan-500/20 text-cyan-300 text-xs font-mono">
                    {mapping.rego}
                  </code>
                </div>
                {expandedMapping === index ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </button>

              {expandedMapping === index && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-700/50"
                >
                  {/* XACML */}
                  <div className="p-4 bg-purple-900/10">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-purple-400">XACML 3.0</span>
                      <button
                        onClick={() => handleCopy(mapping.xacmlExample, index, 'xacml')}
                        className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors"
                      >
                        {copiedIndex?.index === index && copiedIndex?.type === 'xacml' ? (
                          <>
                            <Check className="w-3 h-3" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            Copy
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="p-3 rounded-lg bg-slate-800/50 border border-purple-500/20 text-xs font-mono text-purple-200 overflow-x-auto">
                      <code>{mapping.xacmlExample}</code>
                    </pre>
                  </div>

                  {/* Rego */}
                  <div className="p-4 bg-cyan-900/10">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-cyan-400">OPA Rego</span>
                      <button
                        onClick={() => handleCopy(mapping.regoExample, index, 'rego')}
                        className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                      >
                        {copiedIndex?.index === index && copiedIndex?.type === 'rego' ? (
                          <>
                            <Check className="w-3 h-3" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            Copy
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="p-3 rounded-lg bg-slate-800/50 border border-cyan-500/20 text-xs font-mono text-cyan-200 overflow-x-auto">
                      <code>{mapping.regoExample}</code>
                    </pre>
                  </div>
                </motion.div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Key Differences */}
      <div className="bg-amber-900/20 rounded-xl border border-amber-500/30 p-6">
        <h3 className="text-lg font-semibold text-amber-300 flex items-center gap-2 mb-4">
          <AlertTriangle className="w-5 h-5" />
          Key Differences
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {KEY_DIFFERENCES.map((diff, index) => (
            <div key={index} className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-xs font-bold text-amber-300">
                {index + 1}
              </span>
              <div>
                <h4 className="text-sm font-medium text-amber-200">{diff.title}</h4>
                <p className="text-xs text-amber-200/70 mt-1">{diff.content}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Evaluation Flow Diagrams */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* XACML Flow */}
        <div className="bg-slate-900/50 rounded-xl border border-purple-500/20 p-6">
          <h4 className="text-sm font-semibold text-purple-300 mb-4">XACML Evaluation Flow</h4>
          <pre className="text-[10px] font-mono text-purple-200/80 leading-relaxed">
{`┌─────────────────────────┐
│   XACML Request         │
│   (XML Attributes)      │
└───────────┬─────────────┘
            ▼
┌─────────────────────────┐
│   PolicySet             │
│   (Combining Algorithm) │
└───────────┬─────────────┘
            ▼
┌─────────────────────────┐
│   Policy 1, 2, 3...     │
│   (Target matching)     │
└───────────┬─────────────┘
            ▼
┌─────────────────────────┐
│   Rules (Conditions)    │
│   Effect: Permit/Deny   │
└───────────┬─────────────┘
            ▼
┌─────────────────────────┐
│   Combining Algorithm   │
└───────────┬─────────────┘
            ▼
┌─────────────────────────┐
│   Decision + Obligations│
└─────────────────────────┘`}
          </pre>
        </div>

        {/* Rego Flow */}
        <div className="bg-slate-900/50 rounded-xl border border-cyan-500/20 p-6">
          <h4 className="text-sm font-semibold text-cyan-300 mb-4">OPA Rego Evaluation Flow</h4>
          <pre className="text-[10px] font-mono text-cyan-200/80 leading-relaxed">
{`┌─────────────────────────┐
│   Input (JSON)          │
│   { subject, action,    │
│     resource, context } │
└───────────┬─────────────┘
            ▼
┌─────────────────────────┐
│   Package Imports       │
│   (rego.v1, helpers)    │
└───────────┬─────────────┘
            ▼
┌─────────────────────────┐
│   Violation Checks      │
│   is_not_authenticated  │
│   is_insufficient_...   │
└───────────┬─────────────┘
            ▼
┌─────────────────────────┐
│   Allow Rule            │
│   allow := true if {    │
│     not violation_1     │
│   }                     │
└───────────┬─────────────┘
            ▼
┌─────────────────────────┐
│   Decision + Obligations│
└─────────────────────────┘`}
          </pre>
        </div>
      </div>

      {/* External Resources */}
      <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-6">
        <h3 className="text-lg font-semibold text-gray-200 flex items-center gap-2 mb-4">
          <Lightbulb className="w-5 h-5 text-amber-400" />
          External Resources
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {EXTERNAL_RESOURCES.map((resource, index) => (
            <a
              key={index}
              href={resource.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                resource.category === 'rego'
                  ? 'border-cyan-500/20 hover:border-cyan-500/40 hover:bg-cyan-500/10'
                  : 'border-purple-500/20 hover:border-purple-500/40 hover:bg-purple-500/10'
              }`}
            >
              <ExternalLink className={`w-4 h-4 ${
                resource.category === 'rego' ? 'text-cyan-400' : 'text-purple-400'
              }`} />
              <span className={`text-sm font-medium ${
                resource.category === 'rego' ? 'text-cyan-300' : 'text-purple-300'
              }`}>
                {resource.name}
              </span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

