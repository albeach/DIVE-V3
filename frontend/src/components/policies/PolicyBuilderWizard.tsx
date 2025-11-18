'use client';

import { useMemo, useState } from 'react';

import type {
  StandardsLens,
  VisualPolicyArtifacts,
  VisualPolicyConfig,
} from '@/types/policy-builder.types';

const CLEARANCE_OPTIONS: Array<'UNCLASSIFIED' | 'CONFIDENTIAL' | 'SECRET' | 'TOP_SECRET'> = [
  'UNCLASSIFIED',
  'CONFIDENTIAL',
  'SECRET',
  'TOP_SECRET',
];

const AAL_OPTIONS: Array<'AAL1' | 'AAL2' | 'AAL3'> = ['AAL1', 'AAL2', 'AAL3'];

const COUNTRY_OPTIONS = ['USA', 'GBR', 'CAN', 'AUS', 'NZL', 'FRA', 'DEU', 'ITA', 'POL'] as const;
const COI_OPTIONS = ['FVEY', 'NATO-COSMIC', 'CAN-US', 'US-ONLY'] as const;

const DEFAULT_CONFIG: VisualPolicyConfig = {
  policyName: 'Coalition Visual Policy',
  description: 'Generated via visual builder',
  standardsLens: 'unified',
  minimumClearance: 'SECRET',
  allowedCountries: ['USA', 'GBR', 'CAN'],
  requireAuthentication: true,
  minimumAAL: 'AAL2',
  requireCOI: true,
  coiTags: ['FVEY'],
  enforceEmbargo: false,
  embargoHours: 24,
  requireEncryptedResources: false,
  requireDeviceCompliance: true,
  requireKasObligation: false,
  enableAuditLog: true,
};

const statusBadgeStyles = {
  enabled:
    'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200',
  disabled:
    'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200',
};

function toRegoIdentifier(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '') || 'custom_policy';
}

function fmtList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function buildAllowedCountriesBlock(countries: string[]): string {
  if (countries.length === 0) return '';
  const entries = countries.map((c) => `"${c}": true`).join(', ');
  const label = JSON.stringify(countries);
  return `allowed_countries := { ${entries} }

is_not_releasable_to_country := msg if {
  not allowed_countries[input.subject.countryOfAffiliation]
  msg := sprintf("Country %s not in ${label}", [input.subject.countryOfAffiliation])
}
`;
}

function buildCoiBlock(cois: string[]): string {
  if (cois.length === 0) return '';
  const list = cois.map((coi) => `"${coi}"`).join(', ');
  return `required_coi := [${list}]

is_coi_violation := msg if {
  required_coi[_]
  count({coi |
    coi := input.subject.acpCOI[_]
    required_coi[_] == coi
  }) == 0
  msg := "No Community of Interest intersection"
}
`;
}

function buildEmbargoBlock(hours: number): string {
  return `is_under_embargo := msg if {
  input.resource.creationDate
  parsed := time.parse_rfc3339_ns(input.resource.creationDate)
  now := time.now_ns()
  embargo_window := ${hours} * 3600 * 1000000000
  parsed + embargo_window > now
  msg := sprintf("Resource under ${hours}h embargo window", [])
}
`;
}

function buildEncryptionBlock(): string {
  return `is_encryption_required_but_missing := msg if {
  not input.resource.encrypted
  msg := "Resource must be encrypted for release"
}
`;
}

function buildDeviceComplianceBlock(): string {
  return `is_device_non_compliant := msg if {
  not input.context.deviceCompliant
  msg := "Device posture not compliant"
}
`;
}

function buildAalBlock(minAal: 'AAL1' | 'AAL2' | 'AAL3'): string {
  return `aal_levels := {
  "AAL1": 1,
  "AAL2": 2,
  "AAL3": 3
}

is_insufficient_aal := msg if {
  aal_levels[input.subject.aal] < aal_levels["${minAal}"]
  msg := sprintf("AAL %s below required ${minAal}", [input.subject.aal])
}
`;
}

function buildClearanceBlock(minClearance: VisualPolicyConfig['minimumClearance']): string {
  return `clearance_levels := {
  "UNCLASSIFIED": 0,
  "CONFIDENTIAL": 1,
  "SECRET": 2,
  "TOP_SECRET": 3
}

is_insufficient_clearance := msg if {
  clearance_levels[input.subject.clearance] < clearance_levels["${minClearance}"]
  msg := sprintf("Clearance %s below required ${minClearance}", [input.subject.clearance])
}
`;
}

function buildAuthBlock(): string {
  return `is_not_authenticated := msg if {
  not input.subject.authenticated
  msg := "Subject is not authenticated"
}
`;
}

export function generateRegoFromConfig(config: VisualPolicyConfig): string {
  const packageName = `dive.visual.${toRegoIdentifier(config.policyName)}`;
  const violationNames: string[] = [];
  const blocks: string[] = [];

  if (config.requireAuthentication) {
    violationNames.push('is_not_authenticated');
    blocks.push(buildAuthBlock());
  }

  violationNames.push('is_insufficient_clearance');
  blocks.push(buildClearanceBlock(config.minimumClearance));

  if (config.minimumAAL !== 'AAL1') {
    violationNames.push('is_insufficient_aal');
    blocks.push(buildAalBlock(config.minimumAAL));
  }

  if (config.allowedCountries.length > 0) {
    violationNames.push('is_not_releasable_to_country');
    blocks.push(buildAllowedCountriesBlock(config.allowedCountries));
  }

  if (config.requireCOI && config.coiTags.length > 0) {
    violationNames.push('is_coi_violation');
    blocks.push(buildCoiBlock(config.coiTags));
  }

  if (config.enforceEmbargo) {
    violationNames.push('is_under_embargo');
    blocks.push(buildEmbargoBlock(config.embargoHours));
  }

  if (config.requireEncryptedResources) {
    violationNames.push('is_encryption_required_but_missing');
    blocks.push(buildEncryptionBlock());
  }

  if (config.requireDeviceCompliance) {
    violationNames.push('is_device_non_compliant');
    blocks.push(buildDeviceComplianceBlock());
  }

  const allowBlock = `allow if {
  ${violationNames.map((name) => `not ${name}`).join('\n  ')}
}
`;

  const reasonBlock = `reason := "All configured guardrails satisfied" if {
  allow
}

reason := msg if {
  not allow
  msg := first([${violationNames.join(', ')}][_] != "")
}
`;

  const obligations: string[] = [];
  if (config.enableAuditLog) {
    obligations.push(`{
    "type": "LOG_DECISION",
    "params": {
      "resourceId": input.resource.resourceId,
      "requestId": input.context.requestId
    }
  }`);
  }
  if (config.requireKasObligation) {
    obligations.push(`{
    "type": "REQUEST_KAS_KEY",
    "params": {
      "resourceId": input.resource.resourceId
    }
  }`);
  }

  const obligationBlock = `obligations := [
${obligations.length > 0 ? obligations.join(',\n') : ''}
] if {
  allow
}
`;

  return `package ${packageName}

import rego.v1

default allow := false

${blocks.filter(Boolean).join('\n')}
${allowBlock}
${reasonBlock}
${obligationBlock}`.trim() + '\n';
}

export function summarizeConfig(config: VisualPolicyConfig): string {
  const parts: string[] = [];
  parts.push(
    `Requires at least ${config.minimumClearance} clearance with ${config.minimumAAL} authentication assurance`,
  );
  if (config.allowedCountries.length > 0) {
    parts.push(`Shareable with ${fmtList(config.allowedCountries)}`);
  }
  if (config.requireCOI && config.coiTags.length > 0) {
    parts.push(`COI membership needed for ${fmtList(config.coiTags)}`);
  }
  if (config.enforceEmbargo) {
    parts.push(`Embargo window enforced for ${config.embargoHours}h`);
  }
  if (config.requireEncryptedResources) {
    parts.push('Only encrypted resources allowed');
  }
  if (config.requireDeviceCompliance) {
    parts.push('Device compliance verification required');
  }
  if (config.requireKasObligation) {
    parts.push('KAS key request triggered on allow');
  }
  return parts.join('. ') + '.';
}

interface PolicyBuilderWizardProps {
  onApply: (artifacts: VisualPolicyArtifacts) => void;
  defaultConfig?: VisualPolicyConfig;
}

const standardsLensOptions: StandardsLens[] = ['5663', 'unified', '240'];

export default function PolicyBuilderWizard({
  onApply,
  defaultConfig = DEFAULT_CONFIG,
}: PolicyBuilderWizardProps) {
  const [config, setConfig] = useState<VisualPolicyConfig>(defaultConfig);
  const [copied, setCopied] = useState(false);

  const previewCode = useMemo(() => generateRegoFromConfig(config), [config]);
  const summary = useMemo(() => summarizeConfig(config), [config]);

  const handleApply = () => {
    const artifacts: VisualPolicyArtifacts = {
      name: config.policyName,
      description: config.description,
      standardsLens: config.standardsLens,
      code: previewCode,
      summary,
    };
    onApply(artifacts);
  };

  const toggleArrayValue = (array: string[], value: string): string[] =>
    array.includes(value) ? array.filter((item) => item !== value) : [...array, value];

  const updateConfig = <K extends keyof VisualPolicyConfig>(key: K, value: VisualPolicyConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const copyPreview = async () => {
    await navigator.clipboard.writeText(previewCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex-1 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Policy title</label>
              <input
                value={config.policyName}
                onChange={(event) => updateConfig('policyName', event.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., Allied SECRET Document Guard"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                rows={3}
                value={config.description}
                onChange={(event) => updateConfig('description', event.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                placeholder="Describe the mission or guardrails for this policy..."
              />
            </div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 w-full lg:w-64">
            <p className="text-sm	font-medium text-gray-700 mb-2">Standards lens</p>
            <div className="grid grid-cols-3 gap-2">
              {standardsLensOptions.map((lens) => (
                <button
                  key={lens}
                  onClick={() => updateConfig('standardsLens', lens)}
                  className={`px-3 py-2 rounded-md text-sm font-medium border transition-colors ${
                    config.standardsLens === lens
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-300 text-gray-600 hover:border-gray-400'
                  }`}
                >
                  {lens === '5663' ? 'Federation' : lens === '240' ? 'Object' : 'Unified'}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Choose the primary compliance lens to highlight when sharing with partners.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="space-y-6">
          <section className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <header className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm uppercase tracking-wide text-gray-500">Identity Guardrails</p>
                <h3 className="text-lg font-semibold text-gray-900">Subjects & Credentials</h3>
              </div>
              <span
                className={
                  config.requireAuthentication ? statusBadgeStyles.enabled : statusBadgeStyles.disabled
                }
              >
                {config.requireAuthentication ? 'Auth enforced' : 'Auth optional'}
              </span>
            </header>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">Require authentication</p>
                  <p className="text-xs text-gray-500">Enforces fail-secure pattern for every request.</p>
                </div>
                <button
                  onClick={() => updateConfig('requireAuthentication', !config.requireAuthentication)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    config.requireAuthentication ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                  aria-pressed={config.requireAuthentication}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      config.requireAuthentication ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Minimum clearance</label>
                  <select
                    value={config.minimumClearance}
                    onChange={(event) =>
                      updateConfig('minimumClearance', event.target.value as VisualPolicyConfig['minimumClearance'])
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  >
                    {CLEARANCE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Minimum AAL (NIST 800-63B)
                  </label>
                  <select
                    value={config.minimumAAL}
                    onChange={(event) =>
                      updateConfig('minimumAAL', event.target.value as VisualPolicyConfig['minimumAAL'])
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  >
                    {AAL_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Shareable countries</p>
                <div className="flex flex-wrap gap-2">
                  {COUNTRY_OPTIONS.map((country) => (
                    <button
                      key={country}
                      onClick={() =>
                        updateConfig('allowedCountries', toggleArrayValue(config.allowedCountries, country))
                      }
                      className={`px-3 py-1 rounded-full text-sm border ${
                        config.allowedCountries.includes(country)
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-300 text-gray-600 hover:border-gray-400'
                      }`}
                    >
                      {country}
                    </button>
                  ))}
                </div>
                {config.allowedCountries.length === 0 && (
                  <p className="text-xs text-red-600 mt-2">Select at least one releasable country.</p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-800">Require COI membership</p>
                    <p className="text-xs text-gray-500">Gate access to specific communities of interest.</p>
                  </div>
                  <button
                    onClick={() => updateConfig('requireCOI', !config.requireCOI)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      config.requireCOI ? 'bg-blue-600' : 'bg-gray-200'
                    }`}
                    aria-pressed={config.requireCOI}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        config.requireCOI ? 'translate-x-5' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                {config.requireCOI && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {COI_OPTIONS.map((coi) => (
                      <button
                        key={coi}
                        onClick={() => updateConfig('coiTags', toggleArrayValue(config.coiTags, coi))}
                        className={`px-3 py-1 rounded-full text-sm border ${
                          config.coiTags.includes(coi)
                            ? 'border-purple-500 bg-purple-50 text-purple-800'
                            : 'border-gray-300 text-gray-600 hover:border-gray-400'
                        }`}
                      >
                        {coi}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <header className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm uppercase tracking-wide text-gray-500">Context Controls</p>
                <h3 className="text-lg font-semibold text-gray-900">Session & Device</h3>
              </div>
              <span
                className={
                  config.requireDeviceCompliance ? statusBadgeStyles.enabled : statusBadgeStyles.disabled
                }
              >
                {config.requireDeviceCompliance ? 'Device posture enforced' : 'Device optional'}
              </span>
            </header>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">Require device compliance</p>
                  <p className="text-xs text-gray-500">Blocks access if the endpoint posture fails ZTNA checks.</p>
                </div>
                <button
                  onClick={() =>
                    updateConfig('requireDeviceCompliance', !config.requireDeviceCompliance)
                  }
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    config.requireDeviceCompliance ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                  aria-pressed={config.requireDeviceCompliance}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      config.requireDeviceCompliance ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">Trigger KAS obligation</p>
                  <p className="text-xs text-gray-500">Automatically request a key from KAS for encrypted payloads.</p>
                </div>
                <button
                  onClick={() => updateConfig('requireKasObligation', !config.requireKasObligation)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    config.requireKasObligation ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                  aria-pressed={config.requireKasObligation}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      config.requireKasObligation ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">Enable audit log obligations</p>
                  <p className="text-xs text-gray-500">Adds LOG_DECISION obligations on every allow.</p>
                </div>
                <button
                  onClick={() => updateConfig('enableAuditLog', !config.enableAuditLog)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    config.enableAuditLog ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                  aria-pressed={config.enableAuditLog}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      config.enableAuditLog ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <header className="mb-4">
              <p className="text-sm uppercase tracking-wide text-gray-500">Resource Guardrails</p>
              <h3 className="text-lg font-semibold text-gray-900">Zero-Trust Data Fencing</h3>
            </header>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">Enforce embargo window</p>
                  <p className="text-xs text-gray-500">Blocks access until creationDate + configured window.</p>
                </div>
                <button
                  onClick={() => updateConfig('enforceEmbargo', !config.enforceEmbargo)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    config.enforceEmbargo ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                  aria-pressed={config.enforceEmbargo}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      config.enforceEmbargo ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              {config.enforceEmbargo && (
                <div className="pl-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Embargo hours</label>
                  <input
                    type="number"
                    min={1}
                    max={168}
                    value={config.embargoHours}
                    onChange={(event) =>
                      updateConfig(
                        'embargoHours',
                        Math.min(168, Math.max(1, Number(event.target.value))),
                      )}
                    className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">Allow encrypted resources only</p>
                  <p className="text-xs text-gray-500">Denies if `input.resource.encrypted` is false.</p>
                </div>
                <button
                  onClick={() =>
                    updateConfig('requireEncryptedResources', !config.requireEncryptedResources)
                  }
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    config.requireEncryptedResources ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                  aria-pressed={config.requireEncryptedResources}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      config.requireEncryptedResources ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </section>

          <section className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <header className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-wide text-gray-500">Preview</p>
                <h3 className="text-lg font-semibold text-gray-900">Visual Builder Artifacts</h3>
              </div>
              <span className="text-xs text-gray-500">
                {copied ? 'Copied!' : 'Auto-syncs into raw editor'}
              </span>
            </header>

            <p className="text-sm text-gray-600 mb-3">{summary}</p>

            <div className="bg-gray-900 rounded-lg p-4 text-gray-100 font-mono text-xs max-h-72 overflow-auto shadow-inner">
              <pre className="whitespace-pre-wrap">{previewCode}</pre>
            </div>

            <div className="flex flex-wrap gap-3 mt-4">
              <button
                onClick={handleApply}
                className="inline-flex items-center px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
              >
                Sync to Raw Editor
              </button>
              <button
                onClick={copyPreview}
                className="inline-flex items-center px-4 py-2 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {copied ? 'Copied' : 'Copy Preview'}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}


