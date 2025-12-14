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
  outOfSyncSpokes?: Array<{
    spokeId: string;
    instanceCode: string;
    currentVersion?: string;
    status: SyncStatus;
    lastSyncTime?: string;
  }>;
}

// =============================================================================
// POLICY BUNDLE MANAGEMENT (Phase 4)
// =============================================================================

export interface IBundleManifest {
  revision: string;
  roots: string[];
  files: Array<{
    path: string;
    hash: string;
    size: number;
  }>;
}

export interface IBundleMetadata {
  bundleId: string;
  version: string;
  hash: string;
  scopes: string[];
  size: number;
  signedAt?: string;
  signedBy?: string;
  manifest: IBundleManifest;
}

export interface IBuildOptions {
  scopes: string[];
  includeData?: boolean;
  sign?: boolean;
  compress?: boolean;
}

export interface IBuildResult {
  success: boolean;
  bundleId?: string;
  version?: string;
  hash?: string;
  size?: number;
  fileCount?: number;
  signed?: boolean;
  error?: string;
}

export interface IPublishResult {
  success: boolean;
  bundleId?: string;
  version?: string;
  publishedAt?: string;
  opalTransactionId?: string;
  error?: string;
}

export interface IBuildAndPublishResult {
  build: IBuildResult;
  publish?: IPublishResult;
}

export interface IOPALHealth {
  healthy: boolean;
  opalEnabled: boolean;
  serverUrl?: string;
  topics?: string[];
  error?: string;
  config?: {
    serverUrl: string;
    topics: string[];
  };
}

export interface IScopeDefinition {
  id: string;
  label: string;
  description: string;
  required?: boolean;
}

export interface IForceSyncResult {
  success: boolean;
  spokeId?: string;
  version?: string;
  syncTime?: string;
  error?: string;
}

export interface IForceSyncAllResult {
  success: boolean;
  spokes: Array<{
    spokeId: string;
    success: boolean;
    version?: string;
    error?: string;
  }>;
  timestamp: string;
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
// FAILOVER EVENTS
// =============================================================================

export interface IFailoverEvent {
  id: string;
  timestamp: string;
  previousState: CircuitBreakerState;
  newState: CircuitBreakerState;
  reason: string;
  triggeredBy: 'automatic' | 'manual' | 'hub';
  duration?: number;
}

export interface IFailoverEventsResponse {
  success: boolean;
  events: IFailoverEvent[];
  total: number;
  limit: number;
  offset: number;
}

// =============================================================================
// MAINTENANCE HISTORY
// =============================================================================

export interface IMaintenanceEvent {
  id: string;
  enteredAt: string;
  exitedAt?: string;
  reason: string;
  duration?: number;
  exitReason?: string;
}

export interface IMaintenanceHistoryResponse {
  success: boolean;
  history: IMaintenanceEvent[];
  currentSession: IMaintenanceEvent | null;
  total: number;
  limit: number;
  offset: number;
}

// =============================================================================
// TOKEN MANAGEMENT (Phase 5)
// =============================================================================

export interface ITokenInfo {
  tokenId?: string;
  expiresAt: string;
  scopes: string[];
  status: 'valid' | 'expiring' | 'expired' | 'none';
  daysUntilExpiry?: number;
  hoursUntilExpiry?: number;
  issuedAt?: string;
  lastUsed?: string;
}

export interface ITokenRotationRequest {
  validityDays?: number;
  notifyAdmin?: boolean;
  revokeExisting?: boolean;
}

export interface ITokenRotationResponse {
  success: boolean;
  token?: string;
  expiresAt?: string;
  scopes?: string[];
  spokeId?: string;
  error?: string;
  isOneTimeView?: boolean;
}

// =============================================================================
// AUDIT MANAGEMENT (Phase 5)
// =============================================================================

export type AuditEventType = 
  | 'sync_success'
  | 'sync_failed'
  | 'sync_partial'
  | 'queue_cleared'
  | 'queue_overflow'
  | 'connection_lost'
  | 'connection_restored';

export type AuditQueueState = 'idle' | 'syncing' | 'error' | 'blocked';

export interface IAuditEvent {
  id: string;
  timestamp: string;
  type: AuditEventType;
  eventCount?: number;
  duration?: number;
  bytesTransferred?: number;
  error?: string;
  hubResponse?: {
    status: number;
    message?: string;
  };
}

export interface IAuditHistoryResponse {
  success: boolean;
  events: IAuditEvent[];
  total: number;
  limit: number;
  offset: number;
  summary?: {
    totalSyncs: number;
    successfulSyncs: number;
    failedSyncs: number;
    totalEventsProcessed: number;
    lastSuccessfulSync?: string;
    lastFailedSync?: string;
  };
}

export interface IAuditSyncResult {
  success: boolean;
  eventsProcessed?: number;
  duration?: number;
  bytesTransferred?: number;
  error?: string;
  nextSyncTime?: string;
}

export interface IAuditExportOptions {
  format: 'csv' | 'json';
  dateFrom?: string;
  dateTo?: string;
  eventTypes?: AuditEventType[];
  limit?: number;
}

// =============================================================================
// OPAL SERVER DASHBOARD (Phase 6)
// =============================================================================

export type OPALClientStatus = 'connected' | 'synced' | 'behind' | 'stale' | 'offline';
export type OPALTransactionType = 'publish' | 'sync' | 'refresh' | 'data_update' | 'policy_update';
export type OPALTransactionStatus = 'success' | 'failed' | 'pending' | 'partial';

/**
 * Extended OPAL Server status with metrics
 */
export interface IOPALServerStatus {
  healthy: boolean;
  version: string;
  uptime: number;            // seconds since server started
  startedAt: string;         // ISO timestamp
  policyDataEndpoint: {
    status: 'healthy' | 'degraded' | 'down';
    lastRequest?: string;
    requestsPerMinute: number;
    totalRequests: number;
    errorRate: number;        // percentage (0-100)
  };
  webSocket: {
    connected: boolean;
    clientCount: number;
    lastMessage?: string;
    messagesPerMinute: number;
  };
  topics: string[];
  config: {
    serverUrl: string;
    dataTopics: string[];
    policyTopics: string[];
    broadcastUri?: string;
  };
  stats: {
    totalPublishes: number;
    totalSyncs: number;
    failedSyncs: number;
    averageSyncDurationMs: number;
  };
}

/**
 * Connected OPAL client information
 */
export interface IOPALClient {
  clientId: string;
  spokeId?: string;
  instanceCode?: string;
  hostname?: string;
  ipAddress?: string;
  status: OPALClientStatus;
  version: string;
  connectedAt: string;
  lastHeartbeat: string;
  lastSync?: string;
  currentPolicyVersion?: string;
  subscribedTopics: string[];
  stats: {
    syncsReceived: number;
    syncsFailed: number;
    lastSyncDurationMs?: number;
    bytesReceived: number;
  };
}

/**
 * OPAL transaction log entry
 */
export interface IOPALTransaction {
  transactionId: string;
  type: OPALTransactionType;
  status: OPALTransactionStatus;
  timestamp: string;
  duration?: number;         // milliseconds
  initiatedBy: 'system' | 'admin' | 'schedule' | 'api';
  details: {
    bundleVersion?: string;
    bundleHash?: string;
    affectedClients?: number;
    successfulClients?: number;
    failedClients?: number;
    topics?: string[];
    dataPath?: string;
    error?: string;
  };
}

/**
 * OPAL client list response
 */
export interface IOPALClientListResponse {
  success: boolean;
  clients: IOPALClient[];
  total: number;
  summary: {
    connected: number;
    synced: number;
    behind: number;
    stale: number;
    offline: number;
  };
  timestamp: string;
}

/**
 * OPAL transaction log response
 */
export interface IOPALTransactionLogResponse {
  success: boolean;
  transactions: IOPALTransaction[];
  total: number;
  limit: number;
  offset: number;
  summary?: {
    totalPublishes: number;
    totalSyncs: number;
    successRate: number;      // percentage (0-100)
    lastSuccessfulSync?: string;
    lastFailedSync?: string;
  };
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

export const POLICY_SCOPES: readonly { id: string; label: string; description: string; required?: boolean }[] = [
  { id: 'policy:base', label: 'Base Guardrails', description: 'Core security guardrails (always included)', required: true },
  { id: 'policy:fvey', label: 'Five Eyes', description: 'FVEY organization policies', required: false },
  { id: 'policy:nato', label: 'NATO', description: 'NATO organization policies', required: false },
  { id: 'policy:usa', label: 'USA Tenant', description: 'United States tenant policies', required: false },
  { id: 'policy:fra', label: 'France Tenant', description: 'France tenant policies', required: false },
  { id: 'policy:gbr', label: 'UK Tenant', description: 'United Kingdom tenant policies', required: false },
  { id: 'policy:deu', label: 'Germany Tenant', description: 'Germany tenant policies', required: false },
  { id: 'policy:nzl', label: 'New Zealand Tenant', description: 'New Zealand tenant policies', required: false },
  { id: 'policy:aus', label: 'Australia Tenant', description: 'Australia tenant policies', required: false },
  { id: 'policy:can', label: 'Canada Tenant', description: 'Canada tenant policies', required: false },
];

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

