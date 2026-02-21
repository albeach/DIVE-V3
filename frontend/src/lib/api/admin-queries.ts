/**
 * DIVE V3 Admin React Query Hooks
 *
 * Provides optimized data fetching with caching, automatic
 * refetching, and mutation support for admin operations.
 *
 * Usage:
 *   import { useUsers, useCreateUser, useIdPs } from '@/lib/api/admin-queries';
 *
 *   const { data: users, isLoading, error } = useUsers({ search: 'john' });
 *   const createMutation = useCreateUser();
 *
 *   createMutation.mutate({ username: 'jane.doe', ... });
 */

import { useQuery, useMutation, useQueryClient, UseQueryOptions } from '@tanstack/react-query';

// ============================================
// Query Keys
// ============================================

export const adminQueryKeys = {
  all: ['admin'] as const,

  // Users
  users: () => [...adminQueryKeys.all, 'users'] as const,
  usersList: (params?: UserQueryParams) => [...adminQueryKeys.users(), 'list', params] as const,
  user: (id: string) => [...adminQueryKeys.users(), 'detail', id] as const,

  // IdPs
  idps: () => [...adminQueryKeys.all, 'idps'] as const,
  idpsList: (params?: IdPQueryParams) => [...adminQueryKeys.idps(), 'list', params] as const,
  idp: (alias: string) => [...adminQueryKeys.idps(), 'detail', alias] as const,
  idpHealth: (alias: string) => [...adminQueryKeys.idps(), 'health', alias] as const,

  // Logs
  logs: () => [...adminQueryKeys.all, 'logs'] as const,
  logsList: (params?: LogsQueryParams) => [...adminQueryKeys.logs(), 'list', params] as const,
  logsStats: (days?: number) => [...adminQueryKeys.logs(), 'stats', days] as const,
  violations: (limit?: number) => [...adminQueryKeys.logs(), 'violations', limit] as const,

  // Analytics
  analytics: () => [...adminQueryKeys.all, 'analytics'] as const,
  analyticsOverview: () => [...adminQueryKeys.analytics(), 'overview'] as const,
  analyticsAuthz: (params?: AnalyticsParams) => [...adminQueryKeys.analytics(), 'authz', params] as const,

  // Spokes (Federation)
  spokes: () => [...adminQueryKeys.all, 'spokes'] as const,
  spokesList: () => [...adminQueryKeys.spokes(), 'list'] as const,
  spoke: (id: string) => [...adminQueryKeys.spokes(), 'detail', id] as const,

  // OPA
  opa: () => [...adminQueryKeys.all, 'opa'] as const,
  opaStatus: () => [...adminQueryKeys.opa(), 'status'] as const,
  opaPolicies: () => [...adminQueryKeys.opa(), 'policies'] as const,

  // OPAL (Policy Data Management)
  opal: () => [...adminQueryKeys.all, 'opal'] as const,
  opalHealth: () => [...adminQueryKeys.opal(), 'health'] as const,
  opalServerStatus: () => [...adminQueryKeys.opal(), 'server-status'] as const,
  opalClients: () => [...adminQueryKeys.opal(), 'clients'] as const,
  opalTransactions: (params?: OpalTransactionParams) => [...adminQueryKeys.opal(), 'transactions', params] as const,

  // Trusted Issuers
  trustedIssuers: () => [...adminQueryKeys.opal(), 'trusted-issuers'] as const,

  // Federation Matrix
  federationMatrix: () => [...adminQueryKeys.opal(), 'federation-matrix'] as const,

  // Tenant Configs
  tenantConfigs: () => [...adminQueryKeys.opal(), 'tenant-configs'] as const,

  // CDC Status
  cdcStatus: () => [...adminQueryKeys.opal(), 'cdc-status'] as const,

  // Sync Status
  syncStatus: () => [...adminQueryKeys.opal(), 'sync-status'] as const,

  // OPAL Bundles
  opalBundleCurrent: () => [...adminQueryKeys.opal(), 'bundle-current'] as const,
  opalBundleScopes: () => [...adminQueryKeys.opal(), 'bundle-scopes'] as const,

  // Notifications
  notifications: () => [...adminQueryKeys.all, 'notifications'] as const,
  notificationsList: (params?: NotificationQueryParams) => [...adminQueryKeys.notifications(), 'list', params] as const,
  notificationsCount: () => [...adminQueryKeys.notifications(), 'count'] as const,
  notificationPreferences: () => [...adminQueryKeys.notifications(), 'preferences'] as const,

  // Compliance Reports
  compliance: () => [...adminQueryKeys.all, 'compliance'] as const,
  complianceNist: () => [...adminQueryKeys.compliance(), 'nist'] as const,
  complianceNato: () => [...adminQueryKeys.compliance(), 'nato'] as const,

  // Approvals
  approvals: () => [...adminQueryKeys.all, 'approvals'] as const,
  approvalsPending: () => [...adminQueryKeys.approvals(), 'pending'] as const,

  // Decision Replay
  decisionReplay: () => [...adminQueryKeys.all, 'decision-replay'] as const,

  // Drift Detection
  drift: () => [...adminQueryKeys.all, 'drift'] as const,
  driftStatus: () => [...adminQueryKeys.drift(), 'status'] as const,
  driftReport: () => [...adminQueryKeys.drift(), 'report'] as const,
  driftEvents: () => [...adminQueryKeys.drift(), 'events'] as const,

  // Federation Audit
  federationAudit: () => [...adminQueryKeys.all, 'federation-audit'] as const,
  federationAuditAggregated: () => [...adminQueryKeys.federationAudit(), 'aggregated'] as const,
  federationAuditStats: () => [...adminQueryKeys.federationAudit(), 'statistics'] as const,

  // Clearance Management
  clearance: () => [...adminQueryKeys.all, 'clearance'] as const,
  clearanceMappings: () => [...adminQueryKeys.clearance(), 'mappings'] as const,
  clearanceCountries: () => [...adminQueryKeys.clearance(), 'countries'] as const,
  clearanceStats: () => [...adminQueryKeys.clearance(), 'stats'] as const,
  clearanceAudit: (country: string) => [...adminQueryKeys.clearance(), 'audit', country] as const,

  // Admin Analytics
  analyticsRisk: () => [...adminQueryKeys.analytics(), 'risk-distribution'] as const,
  analyticsComplianceTrends: () => [...adminQueryKeys.analytics(), 'compliance-trends'] as const,
  analyticsSla: () => [...adminQueryKeys.analytics(), 'sla-metrics'] as const,
  analyticsAuthzMetrics: () => [...adminQueryKeys.analytics(), 'authz-metrics'] as const,
  analyticsSecurityPosture: () => [...adminQueryKeys.analytics(), 'security-posture'] as const,

  // Phase 6.2: Session Analytics
  sessions: () => [...adminQueryKeys.all, 'sessions'] as const,
  sessionsAnalytics: () => [...adminQueryKeys.sessions(), 'analytics'] as const,
  sessionsList: (params?: SessionQueryParams) => [...adminQueryKeys.sessions(), 'list', params] as const,
  sessionDetail: (id: string) => [...adminQueryKeys.sessions(), 'detail', id] as const,

  // Phase 6.2: Resource Health
  resources: () => [...adminQueryKeys.all, 'resources'] as const,
  resourcesHealth: () => [...adminQueryKeys.resources(), 'health'] as const,
  resourceMetrics: (id: string) => [...adminQueryKeys.resources(), 'metrics', id] as const,
  resourcesList: (params?: ResourceQueryParams) => [...adminQueryKeys.resources(), 'list', params] as const,

  // Phase 6.2: Tenant Bulk Operations
  tenants: () => [...adminQueryKeys.all, 'tenants'] as const,
  tenantsList: (params?: TenantQueryParams) => [...adminQueryKeys.tenants(), 'list', params] as const,

  // Phase 6.2: Federation Statistics
  federationStats: () => [...adminQueryKeys.all, 'federation-stats'] as const,
  federationStatistics: () => [...adminQueryKeys.federationStats(), 'statistics'] as const,
  federationTraffic: () => [...adminQueryKeys.federationStats(), 'traffic'] as const,

  // Phase 6.2: Logs Export & Retention
  logsExport: () => [...adminQueryKeys.logs(), 'export'] as const,
  logsRetention: () => [...adminQueryKeys.logs(), 'retention'] as const,

  // Phase 6.2: User Provisioning
  provisioning: () => [...adminQueryKeys.all, 'provisioning'] as const,
  provisioningStatus: () => [...adminQueryKeys.provisioning(), 'status'] as const,
  provisioningHistory: () => [...adminQueryKeys.provisioning(), 'history'] as const,

  // Phase 6.2: Policy Simulation
  policySimulation: () => [...adminQueryKeys.all, 'policy-simulation'] as const,
  policyDiff: () => [...adminQueryKeys.policySimulation(), 'diff'] as const,

  // Phase 6.2: Certificate Management
  certificates: () => [...adminQueryKeys.all, 'certificates'] as const,
  certificatesList: () => [...adminQueryKeys.certificates(), 'list'] as const,
  certificatesHealth: () => [...adminQueryKeys.certificates(), 'health'] as const,
  certificateDetail: (id: string) => [...adminQueryKeys.certificates(), 'detail', id] as const,
};

// ============================================
// Types
// ============================================

interface UserQueryParams {
  search?: string;
  limit?: number;
  offset?: number;
}

interface IdPQueryParams {
  enabled?: boolean;
}

interface LogsQueryParams {
  eventType?: string;
  subject?: string;
  resourceId?: string;
  outcome?: string;
  startTime?: string;
  endTime?: string;
  limit?: number;
  offset?: number;
}

interface AnalyticsParams {
  startDate?: string;
  endDate?: string;
  groupBy?: string;
}

interface OpalTransactionParams {
  limit?: number;
  offset?: number;
  type?: string;
}

// Phase 6.2 Query Params
interface SessionQueryParams {
  userId?: string;
  status?: 'active' | 'expired' | 'revoked';
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
}

interface ResourceQueryParams {
  type?: string;
  status?: 'healthy' | 'warning' | 'critical' | 'unknown';
  limit?: number;
  offset?: number;
}

interface TenantQueryParams {
  search?: string;
  status?: 'enabled' | 'disabled' | 'suspended';
  limit?: number;
  offset?: number;
}

interface NotificationQueryParams {
  unreadOnly?: boolean;
  limit?: number;
}

// ============================================
// OPAL / Federation Types
// ============================================

interface TrustedIssuer {
  issuerUrl: string;
  tenant: string;
  name: string;
  country: string;
  trustLevel: 'DEVELOPMENT' | 'PARTNER' | 'BILATERAL' | 'NATIONAL';
  realm?: string;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface TrustedIssuersResponse {
  success: boolean;
  trusted_issuers: Record<string, TrustedIssuer>;
  count: number;
  timestamp: string;
}

interface AddIssuerRequest {
  issuerUrl: string;
  tenant: string;
  name?: string;
  country: string;
  trustLevel?: string;
  realm?: string;
  enabled?: boolean;
}

interface FederationMatrixResponse {
  success: boolean;
  federation_matrix: Record<string, string[]>;
  count: number;
  timestamp: string;
}

interface TenantConfig {
  country: string;
  mfaRequired?: boolean;
  maxClassification?: string;
  allowedCOIs?: string[];
  timeZone?: string;
  locale?: string;
}

interface TenantConfigsResponse {
  success: boolean;
  tenant_configs: Record<string, TenantConfig>;
  count: number;
  timestamp: string;
}

interface CdcStatus {
  running: boolean;
  watchersActive: number;
  lastSync?: string;
  totalChangesProcessed: number;
  errors: number;
}

interface CdcStatusResponse {
  success: boolean;
  running: boolean;
  watchersActive: number;
  lastSync?: string;
  totalChangesProcessed: number;
  errors: number;
  timestamp: string;
}

interface ForceSyncResponse {
  success: boolean;
  results?: Record<string, { success: boolean; error?: string }>;
  timestamp: string;
}

interface OpalHealthResponse {
  healthy: boolean;
  opalEnabled: boolean;
  serverUrl?: string;
  topics?: string[];
  error?: string;
}

interface SyncStatusResponse {
  currentVersion: {
    version: string;
    hash: string;
    timestamp: string;
    layers: string[];
  };
  spokes: Array<{
    spokeId: string;
    instanceCode: string;
    status: 'current' | 'behind' | 'stale' | 'critical_stale' | 'offline';
    currentVersion?: string;
    hubVersion: string;
    lastSyncTime?: string;
    versionsBehind: number;
  }>;
  summary: {
    total: number;
    current: number;
    behind: number;
    stale: number;
    offline: number;
  };
}

interface User {
  id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled: boolean;
  attributes?: Record<string, string[]>;
  realmRoles?: string[];
}

interface IdP {
  alias: string;
  displayName?: string;
  providerId: string;
  enabled: boolean;
  config?: Record<string, string>;
}

// ============================================
// API Functions
// ============================================

async function fetchUsers(params?: UserQueryParams): Promise<{ users: User[]; total: number }> {
  const queryString = new URLSearchParams(
    Object.entries(params || {}).filter(([, v]) => v !== undefined) as [string, string][]
  ).toString();

  const response = await fetch(`/api/admin/users?${queryString}`);
  if (!response.ok) throw new Error('Failed to fetch users');

  const data = await response.json();
  return data.data || { users: [], total: 0 };
}

async function fetchIdPs(params?: IdPQueryParams): Promise<IdP[]> {
  const response = await fetch('/api/admin/idps');
  if (!response.ok) throw new Error('Failed to fetch IdPs');

  const data = await response.json();
  return data.data || [];
}

async function fetchLogs(params?: LogsQueryParams): Promise<{ logs: unknown[]; total: number }> {
  const queryString = new URLSearchParams(
    Object.entries(params || {}).filter(([, v]) => v !== undefined) as [string, string][]
  ).toString();

  const response = await fetch(`/api/admin/logs?${queryString}`);
  if (!response.ok) throw new Error('Failed to fetch logs');

  const data = await response.json();
  return data.data || { logs: [], total: 0 };
}

async function fetchViolations(limit = 50): Promise<{ violations: unknown[]; total: number }> {
  const response = await fetch(`/api/admin/logs/violations?limit=${limit}`);
  if (!response.ok) throw new Error('Failed to fetch violations');

  const data = await response.json();
  return data.data || { violations: [], total: 0 };
}

async function fetchLogsStats(days = 7): Promise<unknown> {
  const response = await fetch(`/api/admin/logs/stats?days=${days}`);
  if (!response.ok) throw new Error('Failed to fetch log stats');

  const data = await response.json();
  return data.data || {};
}

async function fetchOPAStatus(): Promise<unknown> {
  const response = await fetch('/api/admin/opa/status');
  if (!response.ok) throw new Error('Failed to fetch OPA status');

  const data = await response.json();
  return data.data || {};
}

// ============================================
// OPAL API Functions
// ============================================

async function fetchOpalHealth(): Promise<OpalHealthResponse> {
  const response = await fetch('/api/opal/health');
  if (!response.ok) throw new Error('Failed to fetch OPAL health');
  return response.json();
}

async function fetchTrustedIssuers(): Promise<TrustedIssuersResponse> {
  const response = await fetch('/api/opal/trusted-issuers');
  if (!response.ok) throw new Error('Failed to fetch trusted issuers');
  return response.json();
}

async function addTrustedIssuer(issuer: AddIssuerRequest): Promise<{ success: boolean; issuer: TrustedIssuer; message: string }> {
  const response = await fetch('/api/opal/trusted-issuers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(issuer),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to add trusted issuer');
  }

  return response.json();
}

async function removeTrustedIssuer(issuerUrl: string): Promise<{ success: boolean; message: string }> {
  const encodedUrl = encodeURIComponent(issuerUrl);
  const response = await fetch(`/api/opal/trusted-issuers/${encodedUrl}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to remove trusted issuer');
  }

  return response.json();
}

async function fetchFederationMatrix(): Promise<FederationMatrixResponse> {
  const response = await fetch('/api/opal/federation-matrix');
  if (!response.ok) throw new Error('Failed to fetch federation matrix');
  return response.json();
}

async function addFederationTrust(sourceCountry: string, targetCountry: string): Promise<{ success: boolean; message: string }> {
  const response = await fetch('/api/opal/federation-matrix', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceCountry, targetCountry }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to add federation trust');
  }

  return response.json();
}

async function removeFederationTrust(source: string, target: string): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`/api/opal/federation-matrix/${source}/${target}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to remove federation trust');
  }

  return response.json();
}

async function fetchTenantConfigs(): Promise<TenantConfigsResponse> {
  const response = await fetch('/api/opal/tenant-configs');
  if (!response.ok) throw new Error('Failed to fetch tenant configs');
  return response.json();
}

async function fetchCdcStatus(): Promise<CdcStatusResponse> {
  const response = await fetch('/api/opal/cdc/status');
  if (!response.ok) throw new Error('Failed to fetch CDC status');
  return response.json();
}

async function triggerForceSync(): Promise<ForceSyncResponse> {
  const response = await fetch('/api/opal/cdc/force-sync', {
    method: 'POST',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to trigger force sync');
  }

  return response.json();
}

async function fetchSyncStatus(): Promise<SyncStatusResponse> {
  const response = await fetch('/api/opal/sync-status');
  if (!response.ok) throw new Error('Failed to fetch sync status');
  return response.json();
}

// ============================================
// Query Hooks
// ============================================

/**
 * Fetch users with caching
 */
export function useUsers(params?: UserQueryParams, options?: Omit<UseQueryOptions<{ users: User[]; total: number }>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.usersList(params),
    queryFn: () => fetchUsers(params),
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  });
}

/**
 * Fetch IdPs with caching
 */
export function useIdPs(params?: IdPQueryParams, options?: Omit<UseQueryOptions<IdP[]>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.idpsList(params),
    queryFn: () => fetchIdPs(params),
    staleTime: 60 * 1000, // 1 minute
    gcTime: 10 * 60 * 1000, // 10 minutes
    ...options,
  });
}

/**
 * Fetch audit logs with caching
 */
export function useLogs(params?: LogsQueryParams, options?: Omit<UseQueryOptions<{ logs: unknown[]; total: number }>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.logsList(params),
    queryFn: () => fetchLogs(params),
    staleTime: 10 * 1000, // 10 seconds (more real-time)
    gcTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  });
}

/**
 * Fetch security violations
 */
export function useViolations(limit = 50, options?: Omit<UseQueryOptions<{ violations: unknown[]; total: number }>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.violations(limit),
    queryFn: () => fetchViolations(limit),
    staleTime: 15 * 1000, // 15 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  });
}

/**
 * Fetch log statistics
 */
export function useLogsStats(days = 7, options?: Omit<UseQueryOptions<unknown>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.logsStats(days),
    queryFn: () => fetchLogsStats(days),
    staleTime: 60 * 1000, // 1 minute
    gcTime: 10 * 60 * 1000, // 10 minutes
    ...options,
  });
}

/**
 * Fetch OPA status
 */
export function useOPAStatus(options?: Omit<UseQueryOptions<unknown>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.opaStatus(),
    queryFn: fetchOPAStatus,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 30 * 1000, // Auto-refresh every 30 seconds
    ...options,
  });
}

// ============================================
// OPAL Query Hooks
// ============================================

/**
 * Fetch OPAL health status
 */
export function useOpalHealth(options?: Omit<UseQueryOptions<OpalHealthResponse>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.opalHealth(),
    queryFn: fetchOpalHealth,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 30 * 1000,
    ...options,
  });
}

/**
 * Fetch trusted issuers with caching
 */
export function useTrustedIssuers(options?: Omit<UseQueryOptions<TrustedIssuersResponse>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.trustedIssuers(),
    queryFn: fetchTrustedIssuers,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 10 * 60 * 1000, // 10 minutes
    ...options,
  });
}

/**
 * Fetch federation matrix with caching
 */
export function useFederationMatrix(options?: Omit<UseQueryOptions<FederationMatrixResponse>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.federationMatrix(),
    queryFn: fetchFederationMatrix,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    ...options,
  });
}

/**
 * Fetch tenant configurations
 */
export function useTenantConfigs(options?: Omit<UseQueryOptions<TenantConfigsResponse>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.tenantConfigs(),
    queryFn: fetchTenantConfigs,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    ...options,
  });
}

/**
 * Fetch CDC status
 */
export function useCdcStatus(options?: Omit<UseQueryOptions<CdcStatusResponse>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.cdcStatus(),
    queryFn: fetchCdcStatus,
    staleTime: 15 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 15 * 1000,
    ...options,
  });
}

/**
 * Fetch sync status for all spokes
 */
export function useSyncStatus(options?: Omit<UseQueryOptions<SyncStatusResponse>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.syncStatus(),
    queryFn: fetchSyncStatus,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 30 * 1000,
    ...options,
  });
}

// ============================================
// Mutation Hooks
// ============================================

/**
 * Create user mutation
 */
export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userData: Partial<User> & { password?: string }) => {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create user');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.users() });
    },
  });
}

/**
 * Update user mutation
 */
export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, ...userData }: Partial<User> & { userId: string }) => {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update user');
      }

      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.users() });
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.user(variables.userId) });
    },
  });
}

/**
 * Delete user mutation
 */
export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete user');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.users() });
    },
  });
}

/**
 * Reset user password mutation
 */
export function useResetPassword() {
  return useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      const response = await fetch(`/api/admin/users/${userId}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to reset password');
      }

      return response.json();
    },
  });
}

/**
 * Update IdP mutation
 */
export function useUpdateIdP() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ alias, ...updates }: Partial<IdP> & { alias: string }) => {
      const response = await fetch(`/api/admin/idps/${alias}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update IdP');
      }

      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.idps() });
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.idp(variables.alias) });
    },
  });
}

// ============================================
// OPAL Mutation Hooks
// ============================================

/**
 * Add trusted issuer mutation
 */
export function useAddTrustedIssuer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: addTrustedIssuer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.trustedIssuers() });
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.opalHealth() });
    },
  });
}

/**
 * Remove trusted issuer mutation
 */
export function useRemoveTrustedIssuer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: removeTrustedIssuer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.trustedIssuers() });
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.opalHealth() });
    },
  });
}

/**
 * Add federation trust mutation
 */
export function useAddFederationTrust() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sourceCountry, targetCountry }: { sourceCountry: string; targetCountry: string }) =>
      addFederationTrust(sourceCountry, targetCountry),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.federationMatrix() });
    },
  });
}

/**
 * Remove federation trust mutation
 */
export function useRemoveFederationTrust() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ source, target }: { source: string; target: string }) =>
      removeFederationTrust(source, target),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.federationMatrix() });
    },
  });
}

/**
 * Force sync mutation
 */
export function useForceSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: triggerForceSync,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.cdcStatus() });
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.syncStatus() });
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.trustedIssuers() });
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.federationMatrix() });
    },
  });
}

// ============================================
// Prefetching Functions
// ============================================

/**
 * Prefetch users data
 */
export function usePrefetchUsers(queryClient: ReturnType<typeof useQueryClient>) {
  return () => {
    queryClient.prefetchQuery({
      queryKey: adminQueryKeys.usersList(),
      queryFn: () => fetchUsers(),
      staleTime: 30 * 1000,
    });
  };
}

/**
 * Prefetch IdPs data
 */
export function usePrefetchIdPs(queryClient: ReturnType<typeof useQueryClient>) {
  return () => {
    queryClient.prefetchQuery({
      queryKey: adminQueryKeys.idpsList(),
      queryFn: () => fetchIdPs(),
      staleTime: 60 * 1000,
    });
  };
}

export default {
  // User hooks
  useUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useResetPassword,

  // IdP hooks
  useIdPs,
  useUpdateIdP,

  // Logs hooks
  useLogs,
  useViolations,
  useLogsStats,

  // OPA hooks
  useOPAStatus,

  // OPAL hooks
  useOpalHealth,
  useTrustedIssuers,
  useAddTrustedIssuer,
  useRemoveTrustedIssuer,
  useFederationMatrix,
  useAddFederationTrust,
  useRemoveFederationTrust,
  useTenantConfigs,
  useCdcStatus,
  useSyncStatus,
  useForceSync,

  // Query keys
  adminQueryKeys,
};

// ============================================
// Phase 6.1 Types
// ============================================

interface Notification {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

interface NotificationsResponse {
  success: boolean;
  notifications: Notification[];
  total: number;
}

interface NotificationCountResponse {
  count: number;
}

interface NotificationPreferences {
  email: boolean;
  inApp: boolean;
  securityAlerts: boolean;
  complianceAlerts: boolean;
  systemAlerts: boolean;
  federationAlerts: boolean;
}

interface ComplianceReport {
  success: boolean;
  report: {
    title: string;
    standard: string;
    generatedAt: string;
    overallScore: number;
    controlFamilies: Array<{
      id: string;
      name: string;
      status: 'compliant' | 'partial' | 'non_compliant' | 'not_applicable';
      score: number;
      controls: Array<{
        id: string;
        title: string;
        status: string;
        evidence?: string;
      }>;
    }>;
    summary: {
      total: number;
      compliant: number;
      partial: number;
      nonCompliant: number;
      notApplicable: number;
    };
  };
}

interface ApprovalItem {
  submissionId: string;
  alias: string;
  displayName: string;
  description?: string;
  providerId: string;
  submittedBy: string;
  submittedAt: string;
  config?: Record<string, string>;
}

interface ApprovalsResponse {
  success: boolean;
  data: {
    pending: ApprovalItem[];
    total: number;
  };
}

interface DecisionReplayRequest {
  resourceId: string;
  subject: {
    id: string;
    roles?: string[];
    clearance?: string;
    country?: string;
  };
  resource?: {
    classification?: string;
    releasableTo?: string[];
    coi?: string;
  };
}

interface DecisionReplayResponse {
  success: boolean;
  result: {
    allowed: boolean;
    reason: string;
    policyTrace: Array<{
      rule: string;
      result: boolean;
      input: Record<string, unknown>;
    }>;
    evaluationTimeMs: number;
    policiesEvaluated: string[];
  };
}

interface DriftStatus {
  success: boolean;
  status: 'in_sync' | 'drift_detected' | 'unknown';
  components: Array<{
    name: string;
    status: 'in_sync' | 'drift_detected' | 'error';
    lastCheck: string;
    details?: string;
  }>;
  lastCheck: string;
}

interface DriftReport {
  success: boolean;
  report: {
    generatedAt: string;
    overallStatus: string;
    components: Array<{
      name: string;
      status: string;
      expected: string;
      actual: string;
      drift: boolean;
      details: string;
    }>;
  };
}

interface DriftEvent {
  id: string;
  component: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  detectedAt: string;
  resolvedAt?: string;
  resolved: boolean;
}

interface DriftEventsResponse {
  success: boolean;
  events: DriftEvent[];
  total: number;
}

interface FederationAuditResponse {
  success: boolean;
  logs: Array<{
    id: string;
    spokeId: string;
    instanceCode: string;
    eventType: string;
    subject: string;
    outcome: string;
    timestamp: string;
    details?: Record<string, unknown>;
  }>;
  total: number;
}

interface FederationAuditStatsResponse {
  success: boolean;
  stats: {
    totalEvents: number;
    bySpoke: Record<string, number>;
    byEventType: Record<string, number>;
    byOutcome: Record<string, number>;
    timeRange: { start: string; end: string };
  };
}

interface ClearanceMapping {
  level: string;
  classifications: string[];
  countries: string[];
}

interface ClearanceCountry {
  code: string;
  name: string;
  mappings: Record<string, string>;
}

interface OpalBundle {
  scope: string;
  version: string;
  hash: string;
  createdAt: string;
  layers: string[];
  size: number;
}

interface AnalyticsMetric {
  success: boolean;
  data: Record<string, unknown>;
  timestamp: string;
}

// ============================================
// Phase 6.2 Types
// ============================================

interface SessionAnalytics {
  success: boolean;
  analytics: {
    totalSessions: number;
    activeSessions: number;
    averageSessionDuration: number;
    peakConcurrentSessions: number;
    sessionsToday: number;
    sessionsByHour: Array<{ hour: number; count: number }>;
    sessionsByDevice: Record<string, number>;
    sessionsByCountry: Record<string, number>;
    sessionsByBrowser: Record<string, number>;
    trends: {
      sessions7d: number;
      sessions30d: number;
      change7d: number;
      change30d: number;
    };
  };
  timestamp: string;
}

interface ActiveSession {
  id: string;
  userId: string;
  username: string;
  email?: string;
  ipAddress: string;
  userAgent: string;
  device: string;
  browser: string;
  country?: string;
  city?: string;
  createdAt: string;
  lastActivity: string;
  expiresAt: string;
  clearance?: string;
  roles: string[];
}

interface SessionsListResponse {
  success: boolean;
  sessions: ActiveSession[];
  total: number;
  page: number;
  pageSize: number;
}

interface ResourceHealth {
  success: boolean;
  health: {
    overallStatus: 'healthy' | 'degraded' | 'critical';
    lastCheck: string;
    resources: Array<{
      id: string;
      name: string;
      type: 'database' | 'cache' | 'queue' | 'api' | 'storage';
      status: 'healthy' | 'warning' | 'critical' | 'unknown';
      responseTime: number;
      uptime: number;
      lastError?: string;
      metrics: {
        cpu?: number;
        memory?: number;
        connections?: number;
        latency?: number;
      };
    }>;
    summary: {
      total: number;
      healthy: number;
      warning: number;
      critical: number;
      unknown: number;
    };
  };
  timestamp: string;
}

interface ResourceMetrics {
  success: boolean;
  metrics: {
    resourceId: string;
    resourceName: string;
    type: string;
    history: Array<{
      timestamp: string;
      responseTime: number;
      status: string;
      errorRate: number;
    }>;
    current: {
      cpu: number;
      memory: number;
      connections: number;
      throughput: number;
      errorRate: number;
    };
  };
  timestamp: string;
}

interface Tenant {
  id: string;
  name: string;
  code: string;
  country: string;
  status: 'enabled' | 'disabled' | 'suspended';
  createdAt: string;
  lastSyncAt?: string;
  usersCount: number;
  resourcesCount: number;
  config: Record<string, unknown>;
}

interface TenantsListResponse {
  success: boolean;
  tenants: Tenant[];
  total: number;
}

interface BulkOperationResponse {
  success: boolean;
  results: Array<{
    tenantId: string;
    success: boolean;
    error?: string;
  }>;
  summary: {
    total: number;
    succeeded: number;
    failed: number;
  };
}

interface FederationStatistics {
  success: boolean;
  statistics: {
    totalSpokes: number;
    activeSpokes: number;
    totalRequests24h: number;
    successRate: number;
    averageLatency: number;
    peakLatency: number;
    requestsBySpoke: Record<string, number>;
    latencyBySpoke: Record<string, number>;
    errorsBySpoke: Record<string, number>;
    trends: {
      requestsChange7d: number;
      latencyChange7d: number;
      errorRateChange7d: number;
    };
  };
  timestamp: string;
}

interface FederationTraffic {
  success: boolean;
  traffic: {
    timeRange: { start: string; end: string };
    totalRequests: number;
    totalBytes: number;
    history: Array<{
      timestamp: string;
      requests: number;
      bytes: number;
      errors: number;
      latency: number;
    }>;
    bySpoke: Array<{
      spokeId: string;
      spokeName: string;
      requests: number;
      bytes: number;
      avgLatency: number;
    }>;
    topEndpoints: Array<{
      endpoint: string;
      count: number;
      avgLatency: number;
    }>;
  };
  timestamp: string;
}

interface LogsRetentionConfig {
  success: boolean;
  retention: {
    auditLogs: number; // days
    securityLogs: number;
    accessLogs: number;
    systemLogs: number;
    maxStorageGB: number;
    currentUsageGB: number;
    autoArchiveEnabled: boolean;
    archiveDestination?: string;
  };
}

interface LogsExportRequest {
  format: 'csv' | 'json' | 'pdf';
  dateRange: { start: string; end: string };
  filters?: {
    eventTypes?: string[];
    subjects?: string[];
    outcomes?: string[];
  };
}

interface ProvisioningRequest {
  users: Array<{
    username: string;
    email: string;
    firstName?: string;
    lastName?: string;
    roles?: string[];
    clearance?: string;
    country?: string;
    attributes?: Record<string, string[]>;
  }>;
  options?: {
    sendWelcomeEmail?: boolean;
    requirePasswordChange?: boolean;
    defaultRoles?: string[];
  };
}

interface ProvisioningResponse {
  success: boolean;
  results: Array<{
    username: string;
    success: boolean;
    userId?: string;
    error?: string;
  }>;
  summary: {
    total: number;
    created: number;
    failed: number;
    skipped: number;
  };
}

interface ProvisioningHistory {
  success: boolean;
  history: Array<{
    id: string;
    timestamp: string;
    initiatedBy: string;
    type: 'single' | 'bulk' | 'csv_import';
    totalUsers: number;
    successCount: number;
    failedCount: number;
    status: 'completed' | 'partial' | 'failed';
  }>;
  total: number;
}

interface PolicySimulationRequest {
  policy: string;
  input: {
    subject: Record<string, unknown>;
    resource: Record<string, unknown>;
    action: string;
    context?: Record<string, unknown>;
  };
  options?: {
    trace?: boolean;
    explain?: boolean;
    coverage?: boolean;
  };
}

interface PolicySimulationResponse {
  success: boolean;
  result: {
    allowed: boolean;
    decision: string;
    trace?: Array<{
      rule: string;
      result: boolean;
      message?: string;
    }>;
    coverage?: {
      total: number;
      covered: number;
      percentage: number;
    };
    evaluationTimeMs: number;
  };
}

interface PolicyDiffRequest {
  policyA: string;
  policyB: string;
  testCases?: Array<{
    name: string;
    input: Record<string, unknown>;
    expectedResult?: boolean;
  }>;
}

interface PolicyDiffResponse {
  success: boolean;
  diff: {
    added: string[];
    removed: string[];
    modified: Array<{
      line: number;
      before: string;
      after: string;
    }>;
    testResults?: Array<{
      name: string;
      policyAResult: boolean;
      policyBResult: boolean;
      match: boolean;
    }>;
  };
}

interface Certificate {
  id: string;
  type: 'root' | 'intermediate' | 'signing' | 'tls';
  subject: string;
  issuer: string;
  serialNumber: string;
  validFrom: string;
  validTo: string;
  status: 'valid' | 'expiring_soon' | 'expired' | 'revoked';
  daysUntilExpiry: number;
  keySize: number;
  algorithm: string;
  fingerprint: string;
  usages: string[];
}

interface CertificatesListResponse {
  success: boolean;
  certificates: Certificate[];
  total: number;
}

interface CertificatesHealth {
  success: boolean;
  health: {
    overallStatus: 'healthy' | 'warning' | 'critical';
    lastCheck: string;
    certificates: {
      total: number;
      valid: number;
      expiringSoon: number;
      expired: number;
      revoked: number;
    };
    nextExpiry?: {
      certificate: string;
      daysRemaining: number;
    };
    alerts: Array<{
      severity: 'info' | 'warning' | 'critical';
      message: string;
      certificateId: string;
    }>;
    recommendations: string[];
  };
  timestamp: string;
}

interface CertificateRotationRequest {
  certificateId: string;
  options?: {
    force?: boolean;
    notifyOnComplete?: boolean;
    overlapDays?: number;
  };
}

interface CertificateRotationResponse {
  success: boolean;
  rotation: {
    oldCertificate: string;
    newCertificate: string;
    status: 'initiated' | 'in_progress' | 'completed' | 'failed';
    startedAt: string;
    completedAt?: string;
    error?: string;
  };
}

// ============================================
// Phase 6.1 API Functions
// ============================================

async function fetchNotifications(params?: NotificationQueryParams): Promise<NotificationsResponse> {
  const queryString = new URLSearchParams(
    Object.entries(params || {}).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
  ).toString();
  const response = await fetch(`/api/notifications?${queryString}`);
  if (!response.ok) throw new Error('Failed to fetch notifications');
  return response.json();
}

async function fetchNotificationCount(): Promise<NotificationCountResponse> {
  const response = await fetch('/api/notifications-count');
  if (!response.ok) throw new Error('Failed to fetch notification count');
  return response.json();
}

async function markNotificationRead(id: string): Promise<{ success: boolean }> {
  const response = await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
  if (!response.ok) throw new Error('Failed to mark notification read');
  return response.json();
}

async function markAllNotificationsRead(): Promise<{ success: boolean; count: number }> {
  const response = await fetch('/api/notifications/read-all', { method: 'POST' });
  if (!response.ok) throw new Error('Failed to mark all notifications read');
  return response.json();
}

async function fetchNotificationPreferences(): Promise<NotificationPreferences> {
  const response = await fetch('/api/notifications/preferences/me');
  if (!response.ok) throw new Error('Failed to fetch notification preferences');
  const data = await response.json();
  return data.preferences || data;
}

async function updateNotificationPreferences(prefs: Partial<NotificationPreferences>): Promise<{ success: boolean }> {
  const response = await fetch('/api/notifications/preferences/me', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prefs),
  });
  if (!response.ok) throw new Error('Failed to update notification preferences');
  return response.json();
}

async function fetchComplianceReport(type: 'nist' | 'nato'): Promise<ComplianceReport> {
  const response = await fetch(`/api/admin/compliance/reports/${type}`);
  if (!response.ok) throw new Error(`Failed to fetch ${type.toUpperCase()} compliance report`);
  return response.json();
}

async function exportComplianceReport(format: string, reportType: string): Promise<Blob> {
  const response = await fetch(`/api/admin/compliance/reports/export?format=${format}&report_type=${reportType}`);
  if (!response.ok) throw new Error('Failed to export compliance report');
  return response.blob();
}

async function fetchPendingApprovals(): Promise<ApprovalsResponse> {
  const response = await fetch('/api/admin/approvals/pending');
  if (!response.ok) throw new Error('Failed to fetch pending approvals');
  return response.json();
}

async function approveIdP(alias: string, config?: { allowedScopes?: string[]; trustLevel?: string }): Promise<{ success: boolean }> {
  const response = await fetch(`/api/admin/approvals/${alias}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config || {}),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to approve IdP');
  }
  return response.json();
}

async function rejectIdP(alias: string, reason: string): Promise<{ success: boolean }> {
  const response = await fetch(`/api/admin/approvals/${alias}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to reject IdP');
  }
  return response.json();
}

async function replayDecision(input: DecisionReplayRequest): Promise<DecisionReplayResponse> {
  const response = await fetch('/api/decision-replay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error('Failed to replay decision');
  return response.json();
}

async function fetchDriftStatus(): Promise<DriftStatus> {
  const response = await fetch('/api/drift/status');
  if (!response.ok) throw new Error('Failed to fetch drift status');
  return response.json();
}

async function fetchDriftReport(): Promise<DriftReport> {
  const response = await fetch('/api/drift/report');
  if (!response.ok) throw new Error('Failed to fetch drift report');
  return response.json();
}

async function fetchDriftEvents(): Promise<DriftEventsResponse> {
  const response = await fetch('/api/drift/events');
  if (!response.ok) throw new Error('Failed to fetch drift events');
  return response.json();
}

async function reconcileDrift(): Promise<{ success: boolean; message: string }> {
  const response = await fetch('/api/drift/reconcile', { method: 'POST' });
  if (!response.ok) throw new Error('Failed to reconcile drift');
  return response.json();
}

async function resolveDriftEvent(eventId: string): Promise<{ success: boolean }> {
  const response = await fetch(`/api/drift/events/${eventId}/resolve`, { method: 'POST' });
  if (!response.ok) throw new Error('Failed to resolve drift event');
  return response.json();
}

async function fetchFederationAuditAggregated(): Promise<FederationAuditResponse> {
  const response = await fetch('/api/federation/audit/aggregated');
  if (!response.ok) throw new Error('Failed to fetch federation audit logs');
  return response.json();
}

async function fetchFederationAuditStats(): Promise<FederationAuditStatsResponse> {
  const response = await fetch('/api/federation/audit/statistics');
  if (!response.ok) throw new Error('Failed to fetch federation audit statistics');
  return response.json();
}

async function fetchClearanceMappings(): Promise<{ success: boolean; mappings: ClearanceMapping[] }> {
  const response = await fetch('/api/admin/clearance/mappings');
  if (!response.ok) throw new Error('Failed to fetch clearance mappings');
  return response.json();
}

async function fetchClearanceCountries(): Promise<{ success: boolean; countries: ClearanceCountry[] }> {
  const response = await fetch('/api/admin/clearance/countries');
  if (!response.ok) throw new Error('Failed to fetch clearance countries');
  return response.json();
}

async function fetchClearanceStats(): Promise<{ success: boolean; stats: Record<string, unknown> }> {
  const response = await fetch('/api/admin/clearance/stats');
  if (!response.ok) throw new Error('Failed to fetch clearance stats');
  return response.json();
}

async function addClearanceCountry(country: { countryCode: string; name: string; mappings: Record<string, string> }): Promise<{ success: boolean }> {
  const response = await fetch('/api/admin/clearance/countries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(country),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to add country');
  }
  return response.json();
}

async function updateClearanceCountry(countryCode: string, mappings: Record<string, string>): Promise<{ success: boolean }> {
  const response = await fetch(`/api/admin/clearance/countries/${countryCode}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mappings }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update country mappings');
  }
  return response.json();
}

async function deleteClearanceCountry(countryCode: string): Promise<{ success: boolean }> {
  const response = await fetch(`/api/admin/clearance/countries/${countryCode}`, { method: 'DELETE' });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to delete country');
  }
  return response.json();
}

async function validateClearance(data: { clearance: string; classification: string; country: string }): Promise<{ success: boolean; valid: boolean; reason?: string }> {
  const response = await fetch('/api/admin/clearance/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to validate clearance');
  return response.json();
}

async function fetchClearanceAudit(country: string): Promise<{ success: boolean; audit: unknown[] }> {
  const response = await fetch(`/api/admin/clearance/audit/${country}`);
  if (!response.ok) throw new Error('Failed to fetch clearance audit');
  return response.json();
}

async function fetchOpalBundleCurrent(): Promise<{ success: boolean; bundle: OpalBundle }> {
  const response = await fetch('/api/opal/bundle/current');
  if (!response.ok) throw new Error('Failed to fetch current bundle');
  return response.json();
}

async function fetchOpalBundleScopes(): Promise<{ success: boolean; scopes: string[] }> {
  const response = await fetch('/api/opal/bundle/scopes');
  if (!response.ok) throw new Error('Failed to fetch bundle scopes');
  return response.json();
}

async function buildOpalBundle(scope: string): Promise<{ success: boolean; bundle: OpalBundle }> {
  const response = await fetch('/api/opal/bundle/build', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope }),
  });
  if (!response.ok) throw new Error('Failed to build bundle');
  return response.json();
}

async function publishOpalBundle(): Promise<{ success: boolean; results: Record<string, { success: boolean; error?: string }> }> {
  const response = await fetch('/api/opal/bundle/publish', { method: 'POST' });
  if (!response.ok) throw new Error('Failed to publish bundle');
  return response.json();
}

async function buildAndPublishOpalBundle(scope: string): Promise<{ success: boolean; bundle: OpalBundle; publishResults: Record<string, { success: boolean }> }> {
  const response = await fetch('/api/opal/bundle/build-and-publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope }),
  });
  if (!response.ok) throw new Error('Failed to build and publish bundle');
  return response.json();
}

async function pushFederationPolicy(version: string): Promise<{ success: boolean; message: string }> {
  const response = await fetch('/api/federation/policy/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version }),
  });
  if (!response.ok) throw new Error('Failed to push federation policy');
  return response.json();
}

async function unsuspendSpoke(spokeId: string): Promise<{ success: boolean }> {
  const response = await fetch(`/api/federation/spokes/${spokeId}/unsuspend`, { method: 'POST' });
  if (!response.ok) throw new Error('Failed to unsuspend spoke');
  return response.json();
}

async function revokeSpoke(spokeId: string): Promise<{ success: boolean }> {
  const response = await fetch(`/api/federation/spokes/${spokeId}/revoke`, { method: 'POST' });
  if (!response.ok) throw new Error('Failed to revoke spoke');
  return response.json();
}

async function fetchAnalyticsMetric(metric: string): Promise<AnalyticsMetric> {
  const response = await fetch(`/api/admin/analytics/${metric}`);
  if (!response.ok) throw new Error(`Failed to fetch ${metric}`);
  return response.json();
}

// ============================================
// Phase 6.1 Query Hooks
// ============================================

export function useNotifications(params?: NotificationQueryParams, options?: Omit<UseQueryOptions<NotificationsResponse>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.notificationsList(params),
    queryFn: () => fetchNotifications(params),
    staleTime: 15 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 30 * 1000,
    ...options,
  });
}

export function useNotificationCount(options?: Omit<UseQueryOptions<NotificationCountResponse>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.notificationsCount(),
    queryFn: fetchNotificationCount,
    staleTime: 10 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 15 * 1000,
    ...options,
  });
}

export function useNotificationPreferences(options?: Omit<UseQueryOptions<NotificationPreferences>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.notificationPreferences(),
    queryFn: fetchNotificationPreferences,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    ...options,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.notifications() });
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.notificationsCount() });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.notifications() });
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.notificationsCount() });
    },
  });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateNotificationPreferences,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.notificationPreferences() });
    },
  });
}

export function useComplianceReport(type: 'nist' | 'nato', options?: Omit<UseQueryOptions<ComplianceReport>, 'queryKey' | 'queryFn'>) {
  const key = type === 'nist' ? adminQueryKeys.complianceNist() : adminQueryKeys.complianceNato();
  return useQuery({
    queryKey: key,
    queryFn: () => fetchComplianceReport(type),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    ...options,
  });
}

export function useExportComplianceReport() {
  return useMutation({
    mutationFn: ({ format, reportType }: { format: string; reportType: string }) =>
      exportComplianceReport(format, reportType),
  });
}

export function usePendingApprovals(options?: Omit<UseQueryOptions<ApprovalsResponse>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.approvalsPending(),
    queryFn: fetchPendingApprovals,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 60 * 1000,
    ...options,
  });
}

export function useApproveIdP() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ alias, config }: { alias: string; config?: { allowedScopes?: string[]; trustLevel?: string } }) =>
      approveIdP(alias, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.approvals() });
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.idps() });
    },
  });
}

export function useRejectIdP() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ alias, reason }: { alias: string; reason: string }) =>
      rejectIdP(alias, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.approvals() });
    },
  });
}

export function useDecisionReplay() {
  return useMutation({
    mutationFn: replayDecision,
  });
}

export function useDriftStatus(options?: Omit<UseQueryOptions<DriftStatus>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.driftStatus(),
    queryFn: fetchDriftStatus,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 60 * 1000,
    ...options,
  });
}

export function useDriftReport(options?: Omit<UseQueryOptions<DriftReport>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.driftReport(),
    queryFn: fetchDriftReport,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    ...options,
  });
}

export function useDriftEvents(options?: Omit<UseQueryOptions<DriftEventsResponse>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.driftEvents(),
    queryFn: fetchDriftEvents,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    ...options,
  });
}

export function useReconcileDrift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: reconcileDrift,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.drift() });
    },
  });
}

export function useResolveDriftEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: resolveDriftEvent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.driftEvents() });
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.driftStatus() });
    },
  });
}

export function useFederationAuditAggregated(options?: Omit<UseQueryOptions<FederationAuditResponse>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.federationAuditAggregated(),
    queryFn: fetchFederationAuditAggregated,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    ...options,
  });
}

export function useFederationAuditStats(options?: Omit<UseQueryOptions<FederationAuditStatsResponse>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.federationAuditStats(),
    queryFn: fetchFederationAuditStats,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    ...options,
  });
}

export function useClearanceMappings(options?: Omit<UseQueryOptions<{ success: boolean; mappings: ClearanceMapping[] }>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.clearanceMappings(),
    queryFn: fetchClearanceMappings,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    ...options,
  });
}

export function useClearanceCountries(options?: Omit<UseQueryOptions<{ success: boolean; countries: ClearanceCountry[] }>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.clearanceCountries(),
    queryFn: fetchClearanceCountries,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    ...options,
  });
}

export function useClearanceStats(options?: Omit<UseQueryOptions<{ success: boolean; stats: Record<string, unknown> }>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.clearanceStats(),
    queryFn: fetchClearanceStats,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    ...options,
  });
}

export function useAddClearanceCountry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: addClearanceCountry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.clearance() });
    },
  });
}

export function useUpdateClearanceCountry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ countryCode, mappings }: { countryCode: string; mappings: Record<string, string> }) =>
      updateClearanceCountry(countryCode, mappings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.clearance() });
    },
  });
}

export function useDeleteClearanceCountry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteClearanceCountry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.clearance() });
    },
  });
}

export function useValidateClearance() {
  return useMutation({ mutationFn: validateClearance });
}

export function useClearanceAudit(country: string, options?: Omit<UseQueryOptions<{ success: boolean; audit: unknown[] }>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.clearanceAudit(country),
    queryFn: () => fetchClearanceAudit(country),
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: !!country,
    ...options,
  });
}

export function useOpalBundleCurrent(options?: Omit<UseQueryOptions<{ success: boolean; bundle: OpalBundle }>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.opalBundleCurrent(),
    queryFn: fetchOpalBundleCurrent,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    ...options,
  });
}

export function useOpalBundleScopes(options?: Omit<UseQueryOptions<{ success: boolean; scopes: string[] }>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.opalBundleScopes(),
    queryFn: fetchOpalBundleScopes,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    ...options,
  });
}

export function useBuildOpalBundle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: buildOpalBundle,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.opalBundleCurrent() });
    },
  });
}

export function usePublishOpalBundle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: publishOpalBundle,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.syncStatus() });
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.opalClients() });
    },
  });
}

export function useBuildAndPublishOpalBundle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: buildAndPublishOpalBundle,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.opal() });
    },
  });
}

export function usePushFederationPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: pushFederationPolicy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.syncStatus() });
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.spokes() });
    },
  });
}

export function useUnsuspendSpoke() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: unsuspendSpoke,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.spokes() });
    },
  });
}

export function useRevokeSpoke() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revokeSpoke,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.spokes() });
    },
  });
}

export function useAnalyticsRiskDistribution(options?: Omit<UseQueryOptions<AnalyticsMetric>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.analyticsRisk(),
    queryFn: () => fetchAnalyticsMetric('risk-distribution'),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    ...options,
  });
}

export function useAnalyticsComplianceTrends(options?: Omit<UseQueryOptions<AnalyticsMetric>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.analyticsComplianceTrends(),
    queryFn: () => fetchAnalyticsMetric('compliance-trends'),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    ...options,
  });
}

export function useAnalyticsSlaMetrics(options?: Omit<UseQueryOptions<AnalyticsMetric>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.analyticsSla(),
    queryFn: () => fetchAnalyticsMetric('sla-metrics'),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    ...options,
  });
}

export function useAnalyticsAuthzMetrics(options?: Omit<UseQueryOptions<AnalyticsMetric>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.analyticsAuthzMetrics(),
    queryFn: () => fetchAnalyticsMetric('authz-metrics'),
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    ...options,
  });
}

export function useAnalyticsSecurityPosture(options?: Omit<UseQueryOptions<AnalyticsMetric>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.analyticsSecurityPosture(),
    queryFn: () => fetchAnalyticsMetric('security-posture'),
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    ...options,
  });
}

// ============================================
// Phase 6.2 API Functions
// ============================================

async function fetchSessionAnalytics(): Promise<SessionAnalytics> {
  const response = await fetch('/api/admin/sessions/analytics');
  if (!response.ok) throw new Error('Failed to fetch session analytics');
  return response.json();
}

async function fetchSessionsList(params?: SessionQueryParams): Promise<SessionsListResponse> {
  const queryString = new URLSearchParams(
    Object.entries(params || {}).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
  ).toString();
  const response = await fetch(`/api/admin/sessions?${queryString}`);
  if (!response.ok) throw new Error('Failed to fetch sessions');
  return response.json();
}

async function revokeSession(sessionId: string): Promise<{ success: boolean }> {
  const response = await fetch(`/api/admin/sessions/${sessionId}/revoke`, { method: 'POST' });
  if (!response.ok) throw new Error('Failed to revoke session');
  return response.json();
}

async function revokeAllUserSessions(userId: string): Promise<{ success: boolean; count: number }> {
  const response = await fetch(`/api/admin/sessions/revoke-all/${userId}`, { method: 'POST' });
  if (!response.ok) throw new Error('Failed to revoke user sessions');
  return response.json();
}

async function fetchResourceHealth(): Promise<ResourceHealth> {
  const response = await fetch('/api/admin/resources/health');
  if (!response.ok) throw new Error('Failed to fetch resource health');
  return response.json();
}

async function fetchResourceMetrics(resourceId: string): Promise<ResourceMetrics> {
  const response = await fetch(`/api/admin/resources/${resourceId}/metrics`);
  if (!response.ok) throw new Error('Failed to fetch resource metrics');
  return response.json();
}

async function fetchTenantsList(params?: TenantQueryParams): Promise<TenantsListResponse> {
  const queryString = new URLSearchParams(
    Object.entries(params || {}).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
  ).toString();
  const response = await fetch(`/api/admin/tenants?${queryString}`);
  if (!response.ok) throw new Error('Failed to fetch tenants');
  return response.json();
}

async function bulkEnableTenants(tenantIds: string[]): Promise<BulkOperationResponse> {
  const response = await fetch('/api/admin/tenants/bulk/enable', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantIds }),
  });
  if (!response.ok) throw new Error('Failed to enable tenants');
  return response.json();
}

async function bulkDisableTenants(tenantIds: string[]): Promise<BulkOperationResponse> {
  const response = await fetch('/api/admin/tenants/bulk/disable', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantIds }),
  });
  if (!response.ok) throw new Error('Failed to disable tenants');
  return response.json();
}

async function bulkSyncTenants(tenantIds: string[]): Promise<BulkOperationResponse> {
  const response = await fetch('/api/admin/tenants/bulk/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantIds }),
  });
  if (!response.ok) throw new Error('Failed to sync tenants');
  return response.json();
}

async function fetchFederationStatistics(): Promise<FederationStatistics> {
  const response = await fetch('/api/federation/statistics');
  if (!response.ok) throw new Error('Failed to fetch federation statistics');
  return response.json();
}

async function fetchFederationTraffic(): Promise<FederationTraffic> {
  const response = await fetch('/api/federation/traffic');
  if (!response.ok) throw new Error('Failed to fetch federation traffic');
  return response.json();
}

async function fetchLogsRetention(): Promise<LogsRetentionConfig> {
  const response = await fetch('/api/admin/logs/retention');
  if (!response.ok) throw new Error('Failed to fetch logs retention config');
  return response.json();
}

async function updateLogsRetention(config: Partial<LogsRetentionConfig['retention']>): Promise<{ success: boolean }> {
  const response = await fetch('/api/admin/logs/retention', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!response.ok) throw new Error('Failed to update logs retention config');
  return response.json();
}

async function exportLogs(request: LogsExportRequest): Promise<Blob> {
  const response = await fetch('/api/admin/logs/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error('Failed to export logs');
  return response.blob();
}

async function provisionUsers(request: ProvisioningRequest): Promise<ProvisioningResponse> {
  const response = await fetch('/api/admin/users/provision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error('Failed to provision users');
  return response.json();
}

async function bulkImportUsers(file: File): Promise<ProvisioningResponse> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch('/api/admin/users/bulk-import', {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) throw new Error('Failed to bulk import users');
  return response.json();
}

async function fetchProvisioningHistory(): Promise<ProvisioningHistory> {
  const response = await fetch('/api/admin/users/provisioning-history');
  if (!response.ok) throw new Error('Failed to fetch provisioning history');
  return response.json();
}

async function simulatePolicy(request: PolicySimulationRequest): Promise<PolicySimulationResponse> {
  const response = await fetch('/api/admin/policies/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error('Failed to simulate policy');
  return response.json();
}

async function diffPolicies(request: PolicyDiffRequest): Promise<PolicyDiffResponse> {
  const response = await fetch('/api/admin/policies/diff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error('Failed to diff policies');
  return response.json();
}

async function fetchCertificatesList(): Promise<CertificatesListResponse> {
  const response = await fetch('/api/admin/certificates');
  if (!response.ok) throw new Error('Failed to fetch certificates');
  return response.json();
}

async function fetchCertificatesHealth(): Promise<CertificatesHealth> {
  const response = await fetch('/api/admin/certificates/health');
  if (!response.ok) throw new Error('Failed to fetch certificates health');
  return response.json();
}

async function rotateCertificate(request: CertificateRotationRequest): Promise<CertificateRotationResponse> {
  const response = await fetch('/api/admin/certificates/rotate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error('Failed to rotate certificate');
  return response.json();
}

// ============================================
// Phase 6.2 Query Hooks
// ============================================

/**
 * Fetch session analytics dashboard data
 */
export function useSessionAnalytics(options?: Omit<UseQueryOptions<SessionAnalytics>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.sessionsAnalytics(),
    queryFn: fetchSessionAnalytics,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 60 * 1000,
    ...options,
  });
}

/**
 * Fetch paginated list of active sessions
 */
export function useSessionsList(params?: SessionQueryParams, options?: Omit<UseQueryOptions<SessionsListResponse>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.sessionsList(params),
    queryFn: () => fetchSessionsList(params),
    staleTime: 15 * 1000,
    gcTime: 5 * 60 * 1000,
    ...options,
  });
}

/**
 * Revoke a single session
 */
export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revokeSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.sessions() });
    },
  });
}

/**
 * Revoke all sessions for a user
 */
export function useRevokeAllUserSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revokeAllUserSessions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.sessions() });
    },
  });
}

/**
 * Fetch resource health overview
 */
export function useResourceHealth(options?: Omit<UseQueryOptions<ResourceHealth>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.resourcesHealth(),
    queryFn: fetchResourceHealth,
    staleTime: 15 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 30 * 1000,
    ...options,
  });
}

/**
 * Fetch detailed metrics for a specific resource
 */
export function useResourceMetrics(resourceId: string, options?: Omit<UseQueryOptions<ResourceMetrics>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.resourceMetrics(resourceId),
    queryFn: () => fetchResourceMetrics(resourceId),
    staleTime: 15 * 1000,
    gcTime: 5 * 60 * 1000,
    enabled: !!resourceId,
    ...options,
  });
}

/**
 * Fetch paginated list of tenants
 */
export function useTenantsList(params?: TenantQueryParams, options?: Omit<UseQueryOptions<TenantsListResponse>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.tenantsList(params),
    queryFn: () => fetchTenantsList(params),
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    ...options,
  });
}

/**
 * Bulk enable tenants
 */
export function useBulkEnableTenants() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: bulkEnableTenants,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.tenants() });
    },
  });
}

/**
 * Bulk disable tenants
 */
export function useBulkDisableTenants() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: bulkDisableTenants,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.tenants() });
    },
  });
}

/**
 * Bulk sync tenants
 */
export function useBulkSyncTenants() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: bulkSyncTenants,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.tenants() });
    },
  });
}

/**
 * Fetch federation statistics
 */
export function useFederationStatistics(options?: Omit<UseQueryOptions<FederationStatistics>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.federationStatistics(),
    queryFn: fetchFederationStatistics,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 60 * 1000,
    ...options,
  });
}

/**
 * Fetch federation traffic data
 */
export function useFederationTraffic(options?: Omit<UseQueryOptions<FederationTraffic>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.federationTraffic(),
    queryFn: fetchFederationTraffic,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    ...options,
  });
}

/**
 * Fetch logs retention configuration
 */
export function useLogsRetention(options?: Omit<UseQueryOptions<LogsRetentionConfig>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.logsRetention(),
    queryFn: fetchLogsRetention,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    ...options,
  });
}

/**
 * Update logs retention configuration
 */
export function useUpdateLogsRetention() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateLogsRetention,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.logsRetention() });
    },
  });
}

/**
 * Export logs mutation
 */
export function useExportLogs() {
  return useMutation({
    mutationFn: exportLogs,
  });
}

/**
 * Provision users mutation
 */
export function useProvisionUsers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: provisionUsers,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.users() });
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.provisioning() });
    },
  });
}

/**
 * Bulk import users from CSV
 */
export function useBulkImportUsers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: bulkImportUsers,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.users() });
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.provisioning() });
    },
  });
}

/**
 * Fetch provisioning history
 */
export function useProvisioningHistory(options?: Omit<UseQueryOptions<ProvisioningHistory>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.provisioningHistory(),
    queryFn: fetchProvisioningHistory,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    ...options,
  });
}

/**
 * Simulate policy mutation
 */
export function useSimulatePolicy() {
  return useMutation({
    mutationFn: simulatePolicy,
  });
}

/**
 * Policy diff mutation
 */
export function useDiffPolicies() {
  return useMutation({
    mutationFn: diffPolicies,
  });
}

/**
 * Fetch certificates list
 */
export function useCertificatesList(options?: Omit<UseQueryOptions<CertificatesListResponse>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.certificatesList(),
    queryFn: fetchCertificatesList,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    ...options,
  });
}

/**
 * Fetch certificates health
 */
export function useCertificatesHealth(options?: Omit<UseQueryOptions<CertificatesHealth>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: adminQueryKeys.certificatesHealth(),
    queryFn: fetchCertificatesHealth,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 60 * 1000,
    ...options,
  });
}

/**
 * Rotate certificate mutation
 */
export function useRotateCertificate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: rotateCertificate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.certificates() });
    },
  });
}

// Export types for external use
export type {
  TrustedIssuer,
  TrustedIssuersResponse,
  AddIssuerRequest,
  FederationMatrixResponse,
  TenantConfig,
  TenantConfigsResponse,
  CdcStatus,
  CdcStatusResponse,
  ForceSyncResponse,
  OpalHealthResponse,
  SyncStatusResponse,
  Notification,
  NotificationsResponse,
  NotificationCountResponse,
  NotificationPreferences,
  NotificationQueryParams,
  ComplianceReport,
  ApprovalItem,
  ApprovalsResponse,
  DecisionReplayRequest,
  DecisionReplayResponse,
  DriftStatus,
  DriftReport,
  DriftEvent,
  DriftEventsResponse,
  FederationAuditResponse,
  FederationAuditStatsResponse,
  ClearanceMapping,
  ClearanceCountry,
  OpalBundle,
  AnalyticsMetric,
  // Phase 6.2 Types
  SessionAnalytics,
  ActiveSession,
  SessionsListResponse,
  SessionQueryParams,
  ResourceHealth,
  ResourceMetrics,
  ResourceQueryParams,
  Tenant,
  TenantsListResponse,
  TenantQueryParams,
  BulkOperationResponse,
  FederationStatistics,
  FederationTraffic,
  LogsRetentionConfig,
  LogsExportRequest,
  ProvisioningRequest,
  ProvisioningResponse,
  ProvisioningHistory,
  PolicySimulationRequest,
  PolicySimulationResponse,
  PolicyDiffRequest,
  PolicyDiffResponse,
  Certificate,
  CertificatesListResponse,
  CertificatesHealth,
  CertificateRotationRequest,
  CertificateRotationResponse,
};
