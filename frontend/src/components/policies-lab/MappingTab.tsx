'use client';

export default function MappingTab() {
  const mappings = [
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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          🗺️ XACML ↔ Rego Mapping Guide
        </h2>
        <p className="text-gray-600">
          Understanding how XACML 3.0 constructs map to OPA Rego policy language. 
          Both implement attribute-based access control (ABAC), but with different syntax and paradigms.
        </p>
      </div>

      {/* Comparison Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-300 border border-gray-300">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
                XACML Construct
              </th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-300">
                Rego Equivalent
              </th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                Notes
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {mappings.map((mapping, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-mono text-purple-700 border-r border-gray-300">
                  {mapping.xacml}
                </td>
                <td className="px-4 py-3 text-sm font-mono text-blue-700 border-r border-gray-300">
                  {mapping.rego}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {mapping.notes}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detailed Examples */}
      <div>
        <h3 className="text-xl font-bold text-gray-900 mb-4">
          📝 Detailed Code Examples
        </h3>
        <div className="space-y-6">
          {mappings.map((mapping, index) => (
            <div key={index} className="border border-gray-300 rounded-lg overflow-hidden">
              <div className="bg-gray-100 px-4 py-3 border-b border-gray-300">
                <h4 className="text-sm font-bold text-gray-900">
                  {mapping.xacml} ↔ {mapping.rego}
                </h4>
                <p className="text-xs text-gray-600 mt-1">{mapping.notes}</p>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-300">
                {/* XACML Example */}
                <div className="p-4 bg-purple-50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-purple-700">XACML 3.0</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(mapping.xacmlExample)}
                      className="text-xs text-purple-600 hover:text-purple-800"
                    >
                      📋 Copy
                    </button>
                  </div>
                  <pre className="bg-white p-3 rounded border border-purple-200 text-xs overflow-x-auto">
                    <code className="text-purple-900">{mapping.xacmlExample}</code>
                  </pre>
                </div>

                {/* Rego Example */}
                <div className="p-4 bg-blue-50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-blue-700">OPA Rego</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(mapping.regoExample)}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      📋 Copy
                    </button>
                  </div>
                  <pre className="bg-white p-3 rounded border border-blue-200 text-xs overflow-x-auto">
                    <code className="text-blue-900">{mapping.regoExample}</code>
                  </pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Evaluation Flow Diagrams */}
      <div>
        <h3 className="text-xl font-bold text-gray-900 mb-4">
          📊 Evaluation Flow Comparison
        </h3>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* XACML Flow */}
          <div className="border border-purple-300 rounded-lg p-6 bg-purple-50">
            <h4 className="text-lg font-bold text-purple-900 mb-4">XACML Evaluation Flow</h4>
            <pre className="bg-white p-4 rounded border border-purple-200 text-xs font-mono text-purple-900 overflow-x-auto">
{`┌─────────────────────────┐
│   XACML Request         │
│   (XML Attributes)      │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   PolicySet             │
│   (Combining Algorithm) │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   Policy 1, 2, 3...     │
│   (Target matching)     │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   Rules (Conditions)    │
│   Effect: Permit/Deny   │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   Combining Algorithm   │
│   (permit-overrides,    │
│    deny-overrides, etc) │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   Decision:             │
│   Permit/Deny/          │
│   NotApplicable/        │
│   Indeterminate         │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   Obligations (MUST)    │
│   Advice (MAY)          │
└─────────────────────────┘`}
            </pre>
          </div>

          {/* Rego Flow */}
          <div className="border border-blue-300 rounded-lg p-6 bg-blue-50">
            <h4 className="text-lg font-bold text-blue-900 mb-4">OPA Rego Evaluation Flow</h4>
            <pre className="bg-white p-4 rounded border border-blue-200 text-xs font-mono text-blue-900 overflow-x-auto">
{`┌─────────────────────────┐
│   Input (JSON)          │
│   { subject, action,    │
│     resource, context } │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   Package Imports       │
│   (rego.v1, helpers)    │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   Violation Checks      │
│   is_not_authenticated  │
│   is_insufficient_...   │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   Allow Rule            │
│   allow := true if {    │
│     not violation_1     │
│     not violation_2     │
│   }                     │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   Decision:             │
│   true (ALLOW)          │
│   false (DENY)          │
│   undefined (DENY)      │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   Obligations Array     │
│   obligations := [...]  │
└─────────────────────────┘`}
            </pre>
          </div>
        </div>
      </div>

      {/* Key Differences */}
      <div className="bg-amber-50 border border-amber-300 rounded-lg p-6">
        <h3 className="text-lg font-bold text-amber-900 mb-4">
          ⚠️ Key Differences
        </h3>
        <div className="space-y-3 text-sm text-amber-900">
          <div className="flex items-start">
            <span className="font-bold mr-2">1.</span>
            <div>
              <strong>Default Behavior:</strong> XACML typically uses NotApplicable as default; 
              Rego uses explicit <code className="bg-white px-1 rounded">default allow := false</code> (fail-secure).
            </div>
          </div>
          <div className="flex items-start">
            <span className="font-bold mr-2">2.</span>
            <div>
              <strong>Combining Logic:</strong> XACML has built-in combining algorithms (permit-overrides, deny-overrides); 
              Rego requires explicit boolean logic with multiple rules or operators.
            </div>
          </div>
          <div className="flex items-start">
            <span className="font-bold mr-2">3.</span>
            <div>
              <strong>Syntax:</strong> XACML is XML-based (verbose); Rego is a declarative logic language (concise).
            </div>
          </div>
          <div className="flex items-start">
            <span className="font-bold mr-2">4.</span>
            <div>
              <strong>Data Model:</strong> XACML uses AttributeDesignators with Categories; 
              Rego uses JSON input with dot notation (<code className="bg-white px-1 rounded">input.subject.clearance</code>).
            </div>
          </div>
          <div className="flex items-start">
            <span className="font-bold mr-2">5.</span>
            <div>
              <strong>Functions:</strong> XACML has standardized functions (string-equal, integer-greater-than); 
              Rego has built-in functions plus custom helper rules.
            </div>
          </div>
          <div className="flex items-start">
            <span className="font-bold mr-2">6.</span>
            <div>
              <strong>Obligations vs Advice:</strong> XACML distinguishes MUST (obligations) vs MAY (advice); 
              Rego typically only has obligations (but advice can be added as custom field).
            </div>
          </div>
        </div>
      </div>

      {/* External Resources */}
      <div className="bg-gray-50 border border-gray-300 rounded-lg p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">
          📚 External Resources
        </h3>
        <div className="space-y-2">
          <a
            href="https://www.openpolicyagent.org/docs/latest/"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-blue-600 hover:text-blue-800 hover:underline"
          >
            → OPA Documentation (openpolicyagent.org)
          </a>
          <a
            href="https://www.openpolicyagent.org/docs/latest/policy-language/"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-blue-600 hover:text-blue-800 hover:underline"
          >
            → Rego Policy Language Reference
          </a>
          <a
            href="https://docs.oasis-open.org/xacml/3.0/xacml-3.0-core-spec-os-en.html"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-purple-600 hover:text-purple-800 hover:underline"
          >
            → XACML 3.0 Core Specification (OASIS)
          </a>
          <a
            href="https://www.axiomatics.com/blog/xacml-tutorial/"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-purple-600 hover:text-purple-800 hover:underline"
          >
            → XACML Tutorial (Axiomatics)
          </a>
          <a
            href="https://github.com/authzforce/core"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-purple-600 hover:text-purple-800 hover:underline"
          >
            → AuthzForce CE (XACML PDP)
          </a>
        </div>
      </div>
    </div>
  );
}

