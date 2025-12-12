/**
 * DIVE V3 - Federation Types
 * 
 * Type definitions for Hub-Spoke Federation management.
 * 
 * @version 1.0.0
 * @date 2025-12-12
 */

// =============================================================================
// SPOKE TYPES
// =============================================================================

export type SpokeStatus = 'pending' | 'active' | 'suspended' | 'revoked';
export type TrustLevel = 'development' | 'partner' | 'bilateral' | 'national';
export type DataIsolationLevel = 'full' | 'filtered' | 'minimal';
export type ClassificationLevel = 'UNCLASSIFIED' | 'CONFIDENTIAL' | 'SECRET' | 'TOP_SECRET';
export type CircuitBreakerState = 'CLOSED' | 'HALF_OPEN' | 'OPEN';
export type SyncStatus = 'current' | 'behind' | 'stale' | 'critical_stale' | 'offline';

export interface ISpoke {
  spokeId: string;
  instanceCode: string;
  name: string;
  description?: string;
  status: SpokeStatus;
  
  // Connection info
  baseUrl: string;
  apiUrl: string;
  idpUrl: string;
  
  // Trust configuration
  trustLevel: TrustLevel;
  allowedPolicyScopes: string[];
  maxClassificationAllowed: ClassificationLevel;
  dataIsolationLevel: DataIsolationLevel;
  
  // Registration info
  registeredAt: string;
  approvedAt?: string;
  approvedBy?: string;
  contactEmail: string;
  publicKey?: string;
  
  // Health & sync
  lastHeartbeat?: string;
  lastPolicySync?: string;
  currentPolicyVersion?: string;
  opaHealthy?: boolean;
  opalClientConnected?: boolean;
  
  // Token info
  tokenExpiresAt?: string;
  tokenScopes?: string[];
}

export interface ISpokeListFilter {
  status?: SpokeStatus;
  trustLevel?: TrustLevel;
  search?: string;
  page?: number;
  limit?: number;
}

export interface ISpokeListResponse {
  spokes: ISpoke[];
  total: number;
  page: number;
  limit: number;
  pendingCount: number;
}

// =============================================================================
// REGISTRATION & APPROVAL
// =============================================================================

export interface IRegistrationRequest {
  instanceCode: string;
  name: string;
  description?: string;
  baseUrl: string;
  apiUrl: string;
  idpUrl: string;
  publicKey?: string;
  requestedScopes: string[];
  contactEmail: string;
}

export interface IApprovalRequest {
  allowedScopes: string[];
  trustLevel: TrustLevel;
  maxClassification: ClassificationLevel;
  dataIsolationLevel: DataIsolationLevel;
  notes?: string;
}

export interface ISuspensionRequest {
  reason: string;
  notifySpoke?: boolean;
}

export interface ITokenResponse {
  token: string;
  expiresAt: string;
  scopes: string[];
  spokeId: string;
}

// =============================================================================
// POLICY SYNC
// =============================================================================

export interface IPolicyVersion {
  version: string;
  hash: string;
  timestamp: string;
  layers: string[];
}

export interface ISpokeSyncStatus {
  spokeId: string;
  instanceCode: string;
  status: SyncStatus;
  currentVersion?: string;
  hubVersion: string;
  lastSyncTime?: string;
  versionsBehind: number;
}

export interface ISyncStatusResponse {
  currentVersion: IPolicyVersion;
  spokes: ISpokeSyncStatus[];
  summary: {
    total: number;
    current: number;
    behind: number;
    stale: number;
    offline: number;
  };
}

// =============================================================================
// FAILOVER & MAINTENANCE
// =============================================================================

export interface IFailoverStatus {
  state: CircuitBreakerState;
  hubHealthy: boolean;
  opalHealthy: boolean;
  isInMaintenanceMode: boolean;
  maintenanceReason?: string;
  maintenanceEnteredAt?: string;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastFailure?: string;
  lastSuccess?: string;
  totalFailures: number;
  totalRecoveries: number;
  uptimePercentage: number;
}

export interface IAuditQueueStatus {
  queueSize: number;
  oldestEntry?: string;
  newestEntry?: string;
  lastSyncAttempt?: string;
  lastSyncSuccess?: string;
  pendingBytes: number;
}

// =============================================================================
// FEDERATION HEALTH
// =============================================================================

export interface IFederationHealth {
  healthy: boolean;
  statistics: {
    totalSpokes: number;
    activeSpokes: number;
    pendingApprovals: number;
    suspendedSpokes: number;
    revokedSpokes: number;
    policySyncErrors: number;
  };
  unhealthySpokes: Array<{
    spokeId: string;
    instanceCode: string;
    reason?: string;
  }>;
  policyVersion: string;
  timestamp: string;
}

// =============================================================================
// UI COMPONENT PROPS
// =============================================================================

export interface ISpokeTableProps {
  spokes: ISpoke[];
  loading?: boolean;
  onApprove?: (spoke: ISpoke) => void;
  onSuspend?: (spoke: ISpoke) => void;
  onRevoke?: (spoke: ISpoke) => void;
  onViewDetails?: (spoke: ISpoke) => void;
  onRotateToken?: (spoke: ISpoke) => void;
}

export interface ISpokeApprovalModalProps {
  spoke: ISpoke;
  isOpen: boolean;
  onClose: () => void;
  onApprove: (request: IApprovalRequest) => Promise<void>;
}

export interface ISpokeDetailPanelProps {
  spoke: ISpoke | null;
  isOpen: boolean;
  onClose: () => void;
  onAction?: (action: string, spoke: ISpoke) => void;
}

// =============================================================================
// POLICY SCOPE DEFINITIONS
// =============================================================================

export const POLICY_SCOPES = [
  { id: 'policy:base', label: 'Base Guardrails', description: 'Core security guardrails (always included)', required: true },
  { id: 'policy:fvey', label: 'Five Eyes', description: 'FVEY organization policies' },
  { id: 'policy:nato', label: 'NATO', description: 'NATO organization policies' },
  { id: 'policy:usa', label: 'USA Tenant', description: 'United States tenant policies' },
  { id: 'policy:fra', label: 'France Tenant', description: 'France tenant policies' },
  { id: 'policy:gbr', label: 'UK Tenant', description: 'United Kingdom tenant policies' },
  { id: 'policy:deu', label: 'Germany Tenant', description: 'Germany tenant policies' },
  { id: 'policy:nzl', label: 'New Zealand Tenant', description: 'New Zealand tenant policies' },
  { id: 'policy:aus', label: 'Australia Tenant', description: 'Australia tenant policies' },
  { id: 'policy:can', label: 'Canada Tenant', description: 'Canada tenant policies' },
] as const;

export const TRUST_LEVELS: { id: TrustLevel; label: string; description: string }[] = [
  { id: 'development', label: 'Development', description: 'Non-production testing only' },
  { id: 'partner', label: 'Partner', description: 'Limited operational access' },
  { id: 'bilateral', label: 'Bilateral', description: 'Full bilateral sharing agreement' },
  { id: 'national', label: 'National', description: 'Full national-level trust' },
];

export const CLASSIFICATION_LEVELS: { id: ClassificationLevel; label: string }[] = [
  { id: 'UNCLASSIFIED', label: 'Unclassified' },
  { id: 'CONFIDENTIAL', label: 'Confidential' },
  { id: 'SECRET', label: 'Secret' },
  { id: 'TOP_SECRET', label: 'Top Secret' },
];

export const DATA_ISOLATION_LEVELS: { id: DataIsolationLevel; label: string; description: string }[] = [
  { id: 'full', label: 'Full Access', description: 'Access to all releasable data' },
  { id: 'filtered', label: 'Filtered', description: 'Access based on COI membership' },
  { id: 'minimal', label: 'Minimal', description: 'Only explicitly shared data' },
];

