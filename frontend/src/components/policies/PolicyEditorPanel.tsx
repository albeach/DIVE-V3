'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

import PolicyBuilderWizard from '@/components/policies/PolicyBuilderWizard';
import { PolicyMetadataForm } from '@/components/policies/PolicyMetadataForm';
import { PolicyCodeEditor } from '@/components/policies/PolicyCodeEditor';
import { PolicyInsights } from '@/components/policies/PolicyInsights';
import { PolicyTemplatesSidebar } from '@/components/policies/PolicyTemplatesSidebar';
import type { PolicyStatus } from '@/types/policy.types';
import type { StandardsLens, VisualPolicyArtifacts } from '@/types/policy-builder.types';

type UploadState = 'idle' | 'uploading' | 'success' | 'error';

interface PolicyTemplate {
  name: string;
  description: string;
  code: string;
  standardsLens: StandardsLens;
}

interface PolicyInsightsData {
  lineCount: number;
  ruleCount: number;
  hasDefaultDeny: boolean;
  hasAllowRule: boolean;
}

const POLICY_TEMPLATES: Record<string, PolicyTemplate> = {
  unifiedKernel: {
    name: 'Coalition Unified Kernel',
    description: 'Fail-secure ABAC core used in production fuel inventory policy.',
    standardsLens: 'unified',
    code: `package dive.authorization

import rego.v1

default allow := false

clearance_levels := {
  "UNCLASSIFIED": 0,
  "CONFIDENTIAL": 1,
  "SECRET": 2,
  "TOP_SECRET": 3
}

is_not_authenticated := msg if {
  not input.subject.authenticated
  msg := "Subject is not authenticated"
}

is_missing_required_attributes := msg if {
  not input.subject.uniqueID
  not input.subject.clearance
  not input.subject.countryOfAffiliation
  msg := "Missing required subject attributes"
}

is_insufficient_clearance := msg if {
  clearance_levels[input.subject.clearance] < clearance_levels[input.resource.classification]
  msg := sprintf("Insufficient clearance: %s < %s", [input.subject.clearance, input.resource.classification])
}

is_not_releasable_to_country := msg if {
  not input.resource.releasabilityTo[_] == input.subject.countryOfAffiliation
  msg := sprintf("Country %s not in releasability list %v", [input.subject.countryOfAffiliation, input.resource.releasabilityTo])
}

allow if {
  not is_not_authenticated
  not is_missing_required_attributes
  not is_insufficient_clearance
  not is_not_releasable_to_country
}

reason := msg if {
  allow
  msg := "All ACP-240 checks satisfied"
}

reason := msg if {
  not allow
  msg := first([
    is_not_authenticated,
    is_missing_required_attributes,
    is_insufficient_clearance,
    is_not_releasable_to_country,
  ][_] != "")
}

obligations := [
  {
    "type": "LOG_ACCESS",
    "params": {
      "resourceId": input.resource.resourceId,
      "requestId": input.context.requestId
    }
  }
] if {
  allow
}
`,
  },
  federationLens: {
    name: 'Federation (5663) Focus',
    description: 'Highlights AAL, IdP trust, and token lifetime checks.',
    standardsLens: '5663',
    code: `package dive.federation

import rego.v1

default allow := false

trusted_idps := {
  "us-idp": true,
  "france-idp": true,
  "canada-idp": true,
  "industry-idp": true
}

aal_priority := {
  "AAL1": 1,
  "AAL2": 2,
  "AAL3": 3
}

is_idp_not_trusted := msg if {
  not trusted_idps[input.subject.idp]
  msg := sprintf("IdP %s not trusted", [input.subject.idp])
}

is_insufficient_aal := msg if {
  aal_priority[input.subject.aal] < 2
  msg := sprintf("AAL %s is below coalition requirement", [input.subject.aal])
}

is_token_expired := msg if {
  input.context.currentTime > input.subject.tokenExpiresAt
  msg := "Token expired"
}

allow if {
  not is_idp_not_trusted
  not is_insufficient_aal
  not is_token_expired
}

reason := msg if {
  allow
  msg := "Federation controls satisfied (trusted IdP, AAL≥2, token valid)"
}
`,
  },
  objectLens: {
    name: 'Object (240) Focus',
    description: 'ZTDF integrity, COI gating, and embargo enforcement.',
    standardsLens: '240',
    code: `package dive.object

import rego.v1

default allow := false

five_min := 300

is_under_embargo := msg if {
  input.resource.creationDate
  parsed := time.parse_rfc3339_ns(input.resource.creationDate)
  now := time.now_ns()
  parsed + five_min * 1000000000 > now
  msg := "Resource is still under embargo"
}

is_coi_violation := msg if {
  input.resource.COI
  count({coi | coi := input.resource.COI[_]; coi == input.subject.acpCOI[_]}) == 0
  msg := "No COI intersection"
}

is_ztdf_integrity_violation := msg if {
  input.resource.ztdfEnabled
  not input.resource.ztdfIntegrity.valid
  msg := "ZTDF integrity failure"
}

allow if {
  not is_under_embargo
  not is_coi_violation
  not is_ztdf_integrity_violation
}

reason := msg if {
  allow
  msg := "Object security controls satisfied"
}
`,
  },
};

const SNIPPETS: Array<{ label: string; code: string }> = [
  {
    label: 'Clearance Hierarchy',
    code: `clearance_levels := {
  "UNCLASSIFIED": 0,
  "CONFIDENTIAL": 1,
  "SECRET": 2,
  "TOP_SECRET": 3
}`,
  },
  {
    label: 'COI Intersection Check',
    code: `is_coi_violation := msg if {
  input.resource.COI
  count({coi |
    coi := input.resource.COI[_]
    coi == input.subject.acpCOI[_]
  }) == 0
  msg := "Required COI missing"
}`,
  },
  {
    label: 'Decision Envelope',
    code: `decision := {
  "allow": allow,
  "reason": reason,
  "obligations": obligations,
  "evaluation_details": {
    "policy_version": "draft",
    "latency_ms": 0
  }
}`,
  },
];

const statusChipStyles: Record<PolicyStatus, string> = {
  active: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800',
  draft: 'bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
  deprecated: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700',
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 64) || 'opa-policy';
}

function formatPolicySource(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/\s+$/u, ''))
    .join('\n')
    .trim();
}

function stripDefaultAllow(source: string): string {
  return source.replace(/default\s+allow\s*:=\s*false/gi, '');
}

export function lintPolicySource(source: string): string[] {
  const issues: string[] = [];
  const stripped = stripDefaultAllow(source);

  if (!stripped.includes('package ')) {
    issues.push('Missing package declaration');
  }
  if (!source.match(/default\s+allow\s*:=\s*false/i)) {
    issues.push('Missing "default allow := false" (fail-secure pattern)');
  }
  if (!stripped.match(/allow\s+(if|:=)/i)) {
    issues.push('No allow rule defined');
  }
  return issues;
}

export function getPolicyInsights(source: string): PolicyInsightsData {
  const stripped = stripDefaultAllow(source);
  const ruleCount = (stripped.match(/\w+\s+(if|:=)/g) || []).length;

  return {
    lineCount: source.split('\n').length,
    ruleCount,
    hasDefaultDeny: /default\s+allow\s*:=\s*false/i.test(source),
    hasAllowRule: /allow\s+(if|:=)/i.test(stripped),
  };
}

export default function PolicyEditorPanel() {
  const defaultTemplate = POLICY_TEMPLATES.unifiedKernel;
  const [policyName, setPolicyName] = useState(defaultTemplate.name);
  const [description, setDescription] = useState(defaultTemplate.description);
  const [standardsLens, setStandardsLens] = useState<StandardsLens>(defaultTemplate.standardsLens);
  const [source, setSource] = useState(defaultTemplate.code);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadMessage, setUploadMessage] = useState('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [uploadedPolicyId, setUploadedPolicyId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<'visual' | 'code'>('visual');
  const [visualSummary, setVisualSummary] = useState('');

  const lintMessages = useMemo(() => lintPolicySource(source), [source]);
  const insights = useMemo(() => getPolicyInsights(source), [source]);

  const selectTemplate = (templateKey: string) => {
    const template = POLICY_TEMPLATES[templateKey];
    if (!template) return;
    
    setPolicyName(template.name);
    setDescription(template.description);
    setStandardsLens(template.standardsLens);
    setSource(template.code);
    setUploadState('idle');
    setUploadMessage('');
    setValidationErrors([]);
    setUploadedPolicyId(null);
    setEditorMode('code');
  };

  const insertSnippet = (code: string) => {
    setSource((prev) => `${prev.trimEnd()}\n\n${code.trim()}\n`);
  };

  const copyToClipboard = async () => {
    if (typeof navigator === 'undefined') return;
    await navigator.clipboard.writeText(source);
    setUploadState('success');
    setUploadMessage('Policy copied to clipboard');
    setTimeout(() => setUploadState('idle'), 1500);
  };

  const downloadAsFile = () => {
    const blob = new Blob([source], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slugify(policyName)}.rego`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleWizardApply = (artifacts: VisualPolicyArtifacts) => {
    setPolicyName(artifacts.name);
    setDescription(artifacts.description);
    setStandardsLens(artifacts.standardsLens);
    setSource(artifacts.code);
    setVisualSummary(artifacts.summary);
    setUploadState('idle');
    setUploadMessage('Visual builder synced with raw editor');
    setValidationErrors([]);
    setUploadedPolicyId(null);
    setEditorMode('code');
  };

  const editorModes = [
    {
      id: 'visual' as const,
      title: 'Visual Builder',
      description: 'No-code wizard with ACP-240 guardrails',
      badge: '✨ Guided',
    },
    {
      id: 'code' as const,
      title: 'Raw Editor',
      description: 'Full Rego control with linting & uploads',
      badge: '</> Pro',
    },
  ];

  const pushToPoliciesLab = async () => {
    if (!policyName.trim()) {
      setUploadState('error');
      setUploadMessage('Policy name is required before uploading.');
      return;
    }

    setUploadState('uploading');
    setUploadMessage('');
    setValidationErrors([]);
    setUploadedPolicyId(null);

    try {
      const filename = `${slugify(policyName)}.rego`;
      const file = new File([source], filename, { type: 'text/plain' });
      const formData = new FormData();
      formData.append('file', file);
      formData.append(
        'metadata',
        JSON.stringify({
          name: policyName,
          description,
          standardsLens,
        }),
      );

      const response = await fetch('/api/policies-lab/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.validated) {
        setUploadState('error');
        setUploadMessage(data.message || 'Validation failed');
        setValidationErrors(data.validationErrors || []);
        return;
      }

      setUploadState('success');
      setUploadMessage(`Policy uploaded! ID: ${data.policyId}`);
      setUploadedPolicyId(data.policyId);
    } catch (error) {
      setUploadState('error');
      setUploadMessage(error instanceof Error ? error.message : 'Unexpected upload error');
    }
  };

  return (
    <section className="bg-white dark:bg-gray-900 shadow-lg rounded-lg border border-gray-200 dark:border-gray-700 transition-colors">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">OPA Policy Editor</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Start from a template, run the visual wizard, lint locally, then push straight into Policies Lab without
            leaving this page.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`${statusChipStyles.active} px-3 py-1 rounded-full text-xs font-semibold`}>
            Fail-secure Ready
          </span>
          <span className={`${statusChipStyles.draft} px-3 py-1 rounded-full text-xs font-semibold`}>Draft Sandbox</span>
        </div>
      </div>

      {/* Editor Mode Selector */}
      <div className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 px-6 py-4">
        <div className="grid gap-3 md:grid-cols-2">
          {editorModes.map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setEditorMode(mode.id)}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-all duration-200 ${
                editorMode === mode.id
                  ? 'border-blue-500 bg-white dark:bg-gray-900 shadow-md'
                  : 'border-gray-200 dark:border-gray-700 bg-transparent hover:border-gray-300 dark:hover:border-gray-600'
              }`}
              aria-pressed={editorMode === mode.id}
            >
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{mode.title}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">{mode.description}</p>
              </div>
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  editorMode === mode.id
                    ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}
              >
                {mode.badge}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      {editorMode === 'visual' ? (
        <div className="p-6">
          <PolicyBuilderWizard onApply={handleWizardApply} />
        </div>
      ) : (
        <div className="p-6 space-y-6">
          {/* Visual Summary */}
          {visualSummary && (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
              <p className="text-sm text-emerald-900 dark:text-emerald-300">{visualSummary}</p>
              <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">Summary from the Visual Builder</p>
            </div>
          )}

          {/* Main Editor Grid */}
          <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
            {/* Left Sidebar: Metadata + Templates */}
            <div className="space-y-6">
              <PolicyMetadataForm
                name={policyName}
                description={description}
                standardsLens={standardsLens}
                onNameChange={setPolicyName}
                onDescriptionChange={setDescription}
                onStandardsLensChange={setStandardsLens}
              />
              <PolicyTemplatesSidebar
                templates={POLICY_TEMPLATES}
                snippets={SNIPPETS}
                onSelectTemplate={selectTemplate}
                onInsertSnippet={insertSnippet}
              />
            </div>

            {/* Right Content: Editor + Actions */}
            <div className="flex flex-col space-y-4">
              <PolicyInsights
                lineCount={insights.lineCount}
                ruleCount={insights.ruleCount}
                hasDefaultDeny={insights.hasDefaultDeny}
                hasAllowRule={insights.hasAllowRule}
              />

              <PolicyCodeEditor source={source} onSourceChange={setSource} lintMessages={lintMessages} />

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={pushToPoliciesLab}
                  disabled={uploadState === 'uploading'}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 
                    text-white font-semibold rounded-lg transition-colors duration-200
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50
                    disabled:cursor-not-allowed"
                >
                  {uploadState === 'uploading' ? 'Uploading...' : 'Push to Policies Lab'}
                </button>
                <button
                  type="button"
                  onClick={copyToClipboard}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 
                    hover:bg-gray-50 dark:hover:bg-gray-800 
                    text-gray-700 dark:text-gray-300 font-medium rounded-lg 
                    transition-colors duration-200
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                >
                  Copy
                </button>
                <button
                  type="button"
                  onClick={downloadAsFile}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 
                    hover:bg-gray-50 dark:hover:bg-gray-800 
                    text-gray-700 dark:text-gray-300 font-medium rounded-lg 
                    transition-colors duration-200
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                >
                  Download
                </button>
              </div>

              {/* Upload Status Messages */}
              {uploadMessage && (
                <div
                  className={`p-4 rounded-lg border ${
                    uploadState === 'success'
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-300'
                      : uploadState === 'error'
                      ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-900 dark:text-red-300'
                      : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-300'
                  }`}
                  role={uploadState === 'error' ? 'alert' : 'status'}
                >
                  <p className="text-sm font-medium">{uploadMessage}</p>
                  {uploadedPolicyId && (
                    <Link
                      href={`/policies-lab/${uploadedPolicyId}`}
                      className="text-sm underline hover:no-underline mt-2 inline-block"
                    >
                      View in Policies Lab →
                    </Link>
                  )}
                </div>
              )}

              {/* Validation Errors */}
              {validationErrors.length > 0 && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <p className="text-sm font-semibold text-red-900 dark:text-red-300 mb-2">Validation Errors:</p>
                  <ul className="text-sm text-red-800 dark:text-red-400 space-y-1 list-disc list-inside">
                    {validationErrors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
