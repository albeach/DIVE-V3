import {
  generateRegoFromConfig,
  summarizeConfig,
} from '@/components/policies/PolicyBuilderWizard';
import type { VisualPolicyConfig } from '@/types/policy-builder.types';

const baseConfig: VisualPolicyConfig = {
  policyName: 'Test Visual Policy',
  description: 'Generated in tests',
  standardsLens: 'unified',
  minimumClearance: 'SECRET',
  allowedCountries: ['USA'],
  requireAuthentication: true,
  minimumAAL: 'AAL2',
  requireCOI: true,
  coiTags: ['FVEY'],
  enforceEmbargo: true,
  embargoHours: 12,
  requireEncryptedResources: true,
  requireDeviceCompliance: true,
  requireKasObligation: true,
  enableAuditLog: true,
};

describe('PolicyBuilderWizard helpers', () => {
  it('generates Rego with selected guardrails', () => {
    const rego = generateRegoFromConfig(baseConfig);
    expect(rego).toContain('package dive.visual.test_visual_policy');
    expect(rego).toContain('allowed_countries := { "USA": true }');
    expect(rego).toContain('required_coi := ["FVEY"]');
    expect(rego).toContain('is_under_embargo');
    expect(rego).toContain('REQUEST_KAS_KEY');
    expect(rego).toContain('LOG_DECISION');
    expect(rego).toMatch(/allow if \{\s+not is_not_authenticated/);
  });

  it('omits optional blocks when toggles disabled', () => {
    const rego = generateRegoFromConfig({
      ...baseConfig,
      requireAuthentication: false,
      requireCOI: false,
      coiTags: [],
      enforceEmbargo: false,
      requireEncryptedResources: false,
      requireDeviceCompliance: false,
      requireKasObligation: false,
      enableAuditLog: false,
      allowedCountries: [],
    });

    expect(rego).not.toContain('is_not_authenticated');
    expect(rego).not.toContain('required_coi');
    expect(rego).not.toContain('REQUEST_KAS_KEY');
    expect(rego).not.toContain('LOG_DECISION');
  });

  it('summarizes the visual config in plain English', () => {
    const summary = summarizeConfig(baseConfig);
    expect(summary).toContain('SECRET clearance');
    expect(summary).toContain('FVEY');
    expect(summary).toContain('12h');
    expect(summary).toContain('KAS key request');
  });
});

