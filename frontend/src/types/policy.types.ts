/**
 * Policy Management Types
 * Enhanced with modular policy hierarchy support
 *
 * Type definitions for displaying OPA Rego policies in the frontend
 */

/**
 * Policy status
 */
export type PolicyStatus = 'active' | 'draft' | 'deprecated';

/**
 * Policy layer classification
 */
export type PolicyLayer = 'base' | 'org' | 'tenant' | 'entrypoints' | 'standalone';

/**
 * NATO compliance standards
 */
export type NATOCompliance = 'ACP-240' | 'STANAG 4774' | 'STANAG 4778' | 'STANAG 5636' | 'ADatP-5663';

/**
 * Tenant codes (ISO 3166-1 alpha-3)
 */
export type TenantCode = 'USA' | 'FRA' | 'GBR' | 'DEU' | 'CAN' | 'ITA' | 'ESP' | 'POL' | 'NLD';

/**
 * Policy metadata (list view)
 */
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
  // New fields for modular architecture
  layer: PolicyLayer;
  imports: string[];
  natoCompliance: NATOCompliance[];
  tenant?: TenantCode;
  relativePath: string;
}

/**
 * Policy statistics
 */
export interface IPolicyStats {
  totalPolicies: number;
  activeRules: number;
  totalTests: number;
  lastUpdated: string;
}

/**
 * Dependency edge for graph visualization
 */
export interface IDependencyEdge {
  source: string;
  target: string;
}

/**
 * Policy bundle version metadata
 */
export interface IPolicyBundleVersion {
  version: string;
  bundleId: string;
  timestamp: string;
  gitCommit?: string;
  modules: string[];
  compliance: NATOCompliance[];
  features: Record<string, boolean>;
}

/**
 * Complete policy hierarchy with dependency graph
 */
export interface IPolicyHierarchy {
  version: IPolicyBundleVersion;
  layers: {
    base: IPolicyMetadata[];
    org: IPolicyMetadata[];
    tenant: IPolicyMetadata[];
    entrypoints: IPolicyMetadata[];
    standalone: IPolicyMetadata[];
  };
  dependencyGraph: IDependencyEdge[];
  stats: {
    totalPolicies: number;
    totalRules: number;
    totalTests: number;
    byLayer: Record<PolicyLayer, number>;
    byTenant: Record<TenantCode | 'none', number>;
  };
  timestamp: string;
}

/**
 * Layer display configuration
 */
export interface ILayerConfig {
  id: PolicyLayer;
  name: string;
  description: string;
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

/**
 * Layer configurations for UI display
 */
export const LAYER_CONFIGS: Record<PolicyLayer, ILayerConfig> = {
  entrypoints: {
    id: 'entrypoints',
    name: 'Entrypoints',
    description: 'Primary authorization decision endpoints',
    icon: '🎯',
    color: 'text-purple-400',
    bgColor: 'bg-purple-900/20',
    borderColor: 'border-purple-500/30'
  },
  org: {
    id: 'org',
    name: 'Organization',
    description: 'NATO/FVEY organization-specific rules',
    icon: '🏛️',
    color: 'text-blue-400',
    bgColor: 'bg-blue-900/20',
    borderColor: 'border-blue-500/30'
  },
  tenant: {
    id: 'tenant',
    name: 'Tenant',
    description: 'Nation-specific configurations',
    icon: '🌍',
    color: 'text-teal-400',
    bgColor: 'bg-teal-900/20',
    borderColor: 'border-teal-500/30'
  },
  base: {
    id: 'base',
    name: 'Base',
    description: 'Core utilities and shared functions',
    icon: '🧱',
    color: 'text-amber-400',
    bgColor: 'bg-amber-900/20',
    borderColor: 'border-amber-500/30'
  },
  standalone: {
    id: 'standalone',
    name: 'Standalone',
    description: 'Independent policy modules',
    icon: '📄',
    color: 'text-gray-400',
    bgColor: 'bg-gray-800/40',
    borderColor: 'border-gray-600/30'
  }
};

/**
 * NATO compliance badge configuration
 */
export interface IComplianceBadgeConfig {
  id: NATOCompliance;
  shortName: string;
  fullName: string;
  color: string;
  bgColor: string;
}

/**
 * Compliance badge configurations
 */
export const COMPLIANCE_CONFIGS: Record<NATOCompliance, IComplianceBadgeConfig> = {
  'ACP-240': {
    id: 'ACP-240',
    shortName: 'ACP-240',
    fullName: 'Allied Communications Publication 240 - Data-Centric Security',
    color: 'text-cyan-300',
    bgColor: 'bg-cyan-900/30'
  },
  'STANAG 4774': {
    id: 'STANAG 4774',
    shortName: '4774',
    fullName: 'STANAG 4774 - Confidentiality Metadata Label Syntax',
    color: 'text-emerald-300',
    bgColor: 'bg-emerald-900/30'
  },
  'STANAG 4778': {
    id: 'STANAG 4778',
    shortName: '4778',
    fullName: 'STANAG 4778 - Zero Trust Data Format (ZTDF)',
    color: 'text-orange-300',
    bgColor: 'bg-orange-900/30'
  },
  'STANAG 5636': {
    id: 'STANAG 5636',
    shortName: '5636',
    fullName: 'STANAG 5636 - Security Label Binding',
    color: 'text-rose-300',
    bgColor: 'bg-rose-900/30'
  },
  'ADatP-5663': {
    id: 'ADatP-5663',
    shortName: '5663',
    fullName: 'ADatP-5663 - Identity, Credential and Access Management',
    color: 'text-indigo-300',
    bgColor: 'bg-indigo-900/30'
  }
};

/**
 * Tenant display configuration
 */
export const TENANT_CONFIGS: Record<TenantCode, { name: string; flag: string }> = {
  USA: { name: 'United States', flag: '🇺🇸' },
  FRA: { name: 'France', flag: '🇫🇷' },
  GBR: { name: 'United Kingdom', flag: '🇬🇧' },
  DEU: { name: 'Germany', flag: '🇩🇪' },
  CAN: { name: 'Canada', flag: '🇨🇦' },
  ITA: { name: 'Italy', flag: '🇮🇹' },
  ESP: { name: 'Spain', flag: '🇪🇸' },
  POL: { name: 'Poland', flag: '🇵🇱' },
  NLD: { name: 'Netherlands', flag: '🇳🇱' }
};

/**
 * Individual unit test metadata
 */
export interface IUnitTest {
  name: string;
  description?: string;
  lineNumber: number;
  sourceFile: string;
}

/**
 * Unit test result
 */
export interface IUnitTestResult {
  name: string;
  passed: boolean;
  duration?: string;
  error?: string;
  location?: string;
}

/**
 * Policy unit tests list response
 */
export interface IPolicyUnitTests {
  policyId: string;
  packageName: string;
  tests: IUnitTest[];
  testFiles: string[];
  totalTests: number;
  timestamp: string;
}

/**
 * OPA test run result
 */
export interface IOPATestRunResult {
  policyId: string;
  passed: number;
  failed: number;
  skipped: number;
  duration: string;
  results: IUnitTestResult[];
  timestamp: string;
}
