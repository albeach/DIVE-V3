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
};
