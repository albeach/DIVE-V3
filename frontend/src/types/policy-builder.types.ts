export type StandardsLens = 'unified' | '5663' | '240';

export interface VisualPolicyConfig {
  policyName: string;
  description: string;
  standardsLens: StandardsLens;
  minimumClearance: 'UNCLASSIFIED' | 'CONFIDENTIAL' | 'SECRET' | 'TOP_SECRET';
  allowedCountries: string[];
  requireAuthentication: boolean;
  minimumAAL: 'AAL1' | 'AAL2' | 'AAL3';
  requireCOI: boolean;
  coiTags: string[];
  enforceEmbargo: boolean;
  embargoHours: number;
  requireEncryptedResources: boolean;
  requireDeviceCompliance: boolean;
  requireKasObligation: boolean;
  enableAuditLog: boolean;
}

export interface VisualPolicyArtifacts {
  name: string;
  description: string;
  standardsLens: StandardsLens;
  code: string;
  summary: string;
}

