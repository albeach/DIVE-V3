export type PolicyStatus = 'active' | 'draft' | 'deprecated';

export interface IPolicyMetadata {
  policyId: string;
  name: string;
  description: string;
  version: string;
  package: string;
  ruleCount: number;
  testCount: number;
  lastModified: string;
  status: PolicyStatus;
}

export interface IPolicyStats {
  totalPolicies: number;
  activeRules: number;
  totalTests: number;
  lastUpdated: string;
}


