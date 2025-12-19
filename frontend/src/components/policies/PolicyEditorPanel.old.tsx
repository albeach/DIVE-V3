'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

import PolicyBuilderWizard from '@/components/policies/PolicyBuilderWizard';
import type { PolicyStatus } from '@/types/policy.types';
import type { StandardsLens, VisualPolicyArtifacts } from '@/types/policy-builder.types';

type UploadState = 'idle' | 'uploading' | 'success' | 'error';

interface PolicyTemplate {
  name: string;
  description: string;
  code: string;
  standardsLens: StandardsLens;
}

interface PolicyInsights {
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
  active: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
  draft: 'bg-amber-50 text-amber-800 border border-amber-200',
  deprecated: 'bg-gray-100 text-gray-600 border border-gray-200',
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
    .trim()
    .concat('\n');
}

function stripDefaultAllow(source: string): string {
  return source.replace(/default\s+allow\s*:=\s*false/gi, '');
}

export function lintPolicySource(source: string): string[] {
  const issues: string[] = [];
  if (!/package\s+[a-zA-Z0-9._]+/.test(source)) {
    issues.push('Missing package declaration');
  }
  if (!/default\s+allow\s*:=\s*false/.test(source)) {
    issues.push('Default deny (default allow := false) not found');
  }
  const sourceWithoutDefault = stripDefaultAllow(source);
  if (!/allow\s+(if|\:=)/.test(sourceWithoutDefault)) {
    issues.push('Allow rule not defined');
  }
  if (!/reason\s+:=/.test(source)) {
    issues.push('reason output is not defined');
  }
  if (!/obligations\s+:=|\bobligations\s*\[:/.test(source)) {
    issues.push('obligations output is not defined');
  }
  if (source.length > 256 * 1024) {
    issues.push('Policy exceeds 256KB upload limit');
  }
  return issues;
}

export function getPolicyInsights(source: string): PolicyInsights {
  const lines = source.split('\n');
  const ruleMatches = source.match(/^[a-zA-Z0-9_]+\s*(?::=|if\s*\{)/gm);
  const sourceWithoutDefault = stripDefaultAllow(source);
  return {
    lineCount: lines.filter((line) => line.trim().length > 0).length,
    ruleCount: ruleMatches ? ruleMatches.length : 0,
    hasDefaultDeny: /default\s+allow\s*:=\s*false/.test(source),
    hasAllowRule: /allow\s+(if|\:=)/.test(sourceWithoutDefault),
  };
}

export default function PolicyEditorPanel() {
  const defaultTemplate = POLICY_TEMPLATES.unifiedKernel;
  const [policyName, setPolicyName] = useState(defaultTemplate.name);
  const [description, setDescription] = useState(defaultTemplate.description);
  const [standardsLens, setStandardsLens] =
    useState<StandardsLens>(defaultTemplate.standardsLens);
  const [source, setSource] = useState(defaultTemplate.code);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadMessage, setUploadMessage] = useState('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [uploadedPolicyId, setUploadedPolicyId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<'visual' | 'code'>('visual');
  const [visualSummary, setVisualSummary] = useState('');

  const lintMessages = useMemo(() => lintPolicySource(source), [source]);
  const insights = useMemo(() => getPolicyInsights(source), [source]);

  const lineNumbers = useMemo(() => {
    const lineCount = source.split('\n').length;
    return Array.from({ length: lineCount }, (_, index) => index + 1);
  }, [source]);

  const selectTemplate = (templateKey: string) => {
    const template = POLICY_TEMPLATES[templateKey];
    if (!template) {
      return;
    }
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
    if (typeof navigator === 'undefined') {
      return;
    }
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
      setUploadMessage(
        error instanceof Error ? error.message : 'Unexpected upload error',
      );
    }
  };

  return (
    <section className="bg-white shadow rounded-lg border border-gray-200">
      <div className="border-b border-gray-200 px-6 py-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-2xl font-semibold text-gray-900">OPA Policy Editor</h3>
          <p className="text-sm text-gray-600">
            Start from a template, run the visual wizard, lint locally, then push straight into Policies Lab without leaving this
            page.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={statusChipStyles.active}>Fail-secure Ready</span>
          <span className={statusChipStyles.draft}>Draft Sandbox</span>
        </div>
      </div>

      <div className="border-b border-gray-100 bg-gray-50 px-6 py-4">
        <div className="grid gap-3 md:grid-cols-2">
          {editorModes.map((mode) => (
            <button
              key={mode.id}
              onClick={() => setEditorMode(mode.id)}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
                editorMode === mode.id
                  ? 'border-blue-500 bg-white shadow-sm'
                  : 'border-gray-200 bg-transparent hover:border-gray-300'
              }`}
              aria-pressed={editorMode === mode.id}
            >
              <div>
                <p className="text-sm font-semibold text-gray-900">{mode.title}</p>
                <p className="text-xs text-gray-600">{mode.description}</p>
              </div>
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  editorMode === mode.id ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {mode.badge}
              </span>
            </button>
          ))}
        </div>
      </div>

      {editorMode === 'visual' ? (
        <div className="p-6">
          <PolicyBuilderWizard onApply={handleWizardApply} />
        </div>
      ) : (
        <div className="p-6 space-y-6">
          {visualSummary && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <p className="text-sm text-emerald-900">{visualSummary}</p>
              <p className="text-xs text-emerald-700 mt-1">Summary from the Visual Builder</p>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Policy Name</label>
                <input
                  type="text"
                  value={policyName}
                  onChange={(event) => setPolicyName(event.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., Coalition Access Control"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Describe what this policy enforces..."
                />
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Standards Lens</p>
                <div className="grid grid-cols-3 gap-2">
                  {(['5663', 'unified', '240'] as StandardsLens[]).map((lens) => (
                    <button
                      key={lens}
                      onClick={() => setStandardsLens(lens)}
                      className={`px-3 py-2 rounded-md border text-sm font-medium transition-colors ${
                        standardsLens === lens
                          ? 'border-blue-500 text-blue-700 bg-blue-50'
                          : 'border-gray-300 text-gray-600 hover:border-gray-400'
                      }`}
                    >
                      {lens === '5663' ? 'Federation' : lens === '240' ? 'Object' : 'Unified'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Templates</p>
                <div className="space-y-2">
                  {Object.entries(POLICY_TEMPLATES).map(([key, template]) => (
                    <button
                      key={key}
                      onClick={() => selectTemplate(key)}
                      className="w-full text-left	border border-gray-200 rounded-md p-3 hover:border-blue-300 transition-colors"
                    >
                      <p className="text-sm font-semibold text-gray-900">{template.name}</p>
                      <p className="text-xs text-gray-500">{template.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Snippets</p>
                <div className="space-y-2">
                  {SNIPPETS.map((snippet) => (
                    <button
                      key={snippet.label}
                      onClick={() => insertSnippet(snippet.code)}
                      className="w-full text-left px-3 py-2 text-sm border border-dashed border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      {snippet.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col space-y-4">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-700">Lines: {insights.lineCount}</span>
                <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-700">Rules: {insights.ruleCount}</span>
                <span
                  className={`px-3 py-1 rounded-full ${
                    insights.hasDefaultDeny ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'
                  }`}
                >
                  Default deny {insights.hasDefaultDeny ? '✅' : '⚠️'}
                </span>
                <span
                  className={`px-3 py-1 rounded-full ${
                    insights.hasAllowRule ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'
                  }`}
                >
                  Allow rule {insights.hasAllowRule ? '✅' : '⚠️'}
                </span>
              </div>

              <div className="border border-gray-200 rounded-lg overflow-hidden flex">
                <div className="bg-gray-50 text-gray-400 text-xs px-3 py-3 text-right select-none">
                  {lineNumbers.map((line) => (
                    <div key={line} className="leading-6">
                      {line}
                    </div>
                  ))}
                </div>
                <textarea
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                  className="flex-1 font-mono text-sm p-3 focus:outline-none resize-y min-h-[480px]"
                  spellCheck={false}
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => setSource((prev) => formatPolicySource(prev))}
                  className="inline-flex items-center px-4 py-2 rounded-md bg-gray-100 text-sm font-medium text-gray-800 hover:bg-gray-200"
                >
                  Format
                </button>
                <button
                  onClick={copyToClipboard}
                  className="inline-flex items-center px-4 py-2 rounded-md bg-gray-100 text-sm font-medium text-gray-800 hover:bg-gray-200"
                >
                  Copy
                </button>
                <button
                  onClick={downloadAsFile}
                  className="inline-flex items-center px-4 py-2 rounded-md bg-gray-100 text-sm font-medium text-gray-800 hover:bg-gray-200"
                >
                  Download
                </button>
                <button
                  onClick={pushToPoliciesLab}
                  disabled={uploadState === 'uploading'}
                  className="inline-flex items-center px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploadState === 'uploading' ? 'Uploading…' : 'Push to Policies Lab'}
                </button>
                <Link
                  href="/policies/lab"
                  className="inline-flex items-center px-4 py-2 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Open Lab →
                </Link>
              </div>

              <div className="space-y-3">
                <div
                  className={`rounded-md p-4 ${
                    lintMessages.length === 0
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                      : 'bg-amber-50 border border-amber-200 text-amber-900'
                  }`}
                >
                  <p className="font-semibold mb-2">
                    {lintMessages.length === 0 ? 'Lint checks passed' : `Lint warnings (${lintMessages.length})`}
                  </p>
                  {lintMessages.length > 0 && (
                    <ul className="list-disc text-sm pl-5 space-y-1">
                      {lintMessages.map((message) => (
                        <li key={message}>{message}</li>
                      ))}
                    </ul>
                  )}
                </div>

                {uploadState !== 'idle' && (
                  <div
                    className={`rounded-md p-4 text-sm ${
                      uploadState === 'success'
                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                        : uploadState === 'error'
                          ? 'bg-red-50 border border-red-200 text-red-900'
                          : 'bg-blue-50 border border-blue-200 text-blue-900'
                    }`}
                  >
                    <p className="font-semibold mb-1">
                      {uploadState === 'success'
                        ? 'Upload successful'
                        : uploadState === 'error'
                          ? 'Upload error'
                          : 'Uploading…'}
                    </p>
                    <p>{uploadMessage}</p>
                    {uploadedPolicyId && (
                      <Link href={`/policies/lab`} className="mt-2 inline-flex items-center text-blue-700 underline">
                        Open in Policies Lab
                      </Link>
                    )}
                  </div>
                )}

                {validationErrors.length > 0 && (
                  <div className="rounded-md bg-red-50 border border-red-200 p-4">
                    <p className="text-sm font-semibold text-red-900 mb-2">Validation errors from backend</p>
                    <ul className="list-disc pl-5 text-sm text-red-800 space-y-1">
                      {validationErrors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
