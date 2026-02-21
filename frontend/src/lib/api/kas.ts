/**
 * KAS API Client
 * 
 * Fetches live KAS data from the backend API (MongoDB SSOT).
 * Used by the Multi-KAS compliance dashboard for real-time metrics.
 * 
 * @version 1.0.0
 * @date 2026-01-16
 */

// ============================================
// Type Definitions
// ============================================

export interface IKASFederationTrust {
  trustedPartners: string[];
  maxClassification: string;
  allowedCOIs: string[];
}

export interface IKASMetadata {
  version: string;
  capabilities: string[];
  registeredAt?: string;
  lastVerified?: string;
}

export interface IKASEndpoint {
  id: string;
  name: string;
  url: string;
  country: string;
  status: 'active' | 'pending' | 'suspended' | 'offline';
  uptime: number;
  requestsToday: number;
  // Extended metrics (2025 design patterns)
  enabled?: boolean;
  lastHeartbeat?: string | null;
  successRate?: number;
  p95ResponseTime?: number;
  circuitBreakerState?: 'CLOSED' | 'OPEN' | 'HALF_OPEN' | 'UNKNOWN';
  federationTrust?: IKASFederationTrust;
  metadata?: IKASMetadata;
}

export interface IKASBenefit {
  title: string;
  description: string;
  icon: string;
}

export interface IKASFlowStep {
  step: number;
  title: string;
  description: string;
}

export interface IKASKAO {
  id: string;
  kasEndpoint: string;
  wrappedKey: string;
  coi: string;
}

export interface IKASExampleScenario {
  resourceId: string;
  title: string;
  classification: string;
  releasabilityTo: string[];
  COI: string[];
  kaoCount: number;
  kaos: IKASKAO[];
}

export interface IKASSummary {
  totalKAS: number;
  activeKAS: number;
  pendingKAS: number;
  suspendedKAS: number;
  offlineKAS: number;
  totalRequestsToday: number;
  averageUptime: number;
  averageSuccessRate: number;
}

export interface IMultiKASData {
  title: string;
  description: string;
  kasEndpoints: IKASEndpoint[];
  benefits: IKASBenefit[];
  flowSteps: IKASFlowStep[];
  summary?: IKASSummary;
  timestamp?: string;
  exampleScenario?: IKASExampleScenario;
}

// ============================================
// API Client Functions
// ============================================

const getBackendUrl = (): string => {
  return process.env.NEXT_PUBLIC_BACKEND_URL || 'https://localhost:4000';
};

/**
 * Fetch Multi-KAS data from the backend
 * Returns live data from MongoDB (SSOT)
 */
export async function fetchMultiKASData(): Promise<IMultiKASData> {
  const backendUrl = getBackendUrl();
  
  const response = await fetch(`${backendUrl}/api/compliance/multi-kas`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    cache: 'no-store', // Always fetch fresh data
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Multi-KAS data: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch KAS federation health status
 * Returns detailed health information for all KAS instances
 */
export async function fetchKASFederationHealth(): Promise<{
  instance: string;
  crossKASEnabled: boolean;
  kasServers: Array<{
    kasId: string;
    organization: string;
    countryCode: string;
    trustLevel: string;
    status: string;
    enabled: boolean;
    lastHeartbeat: string | null;
    health: {
      healthy: boolean;
      lastCheck: string | null;
    };
  }>;
  summary: {
    total: number;
    active: number;
    pending: number;
    suspended: number;
  };
  timestamp: string;
}> {
  const backendUrl = getBackendUrl();
  
  const response = await fetch(`${backendUrl}/api/health/kas-federation`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch KAS federation health: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Check if a KAS heartbeat is stale (older than threshold)
 */
export function isHeartbeatStale(lastHeartbeat: string | null, thresholdMinutes: number = 2): boolean {
  if (!lastHeartbeat) return true;
  
  const heartbeatTime = new Date(lastHeartbeat).getTime();
  const now = Date.now();
  const thresholdMs = thresholdMinutes * 60 * 1000;
  
  return (now - heartbeatTime) > thresholdMs;
}

/**
 * Get human-readable time since last heartbeat
 */
export function getTimeSinceHeartbeat(lastHeartbeat: string | null): string {
  if (!lastHeartbeat) return 'Never';
  
  const heartbeatTime = new Date(lastHeartbeat).getTime();
  const now = Date.now();
  const diffMs = now - heartbeatTime;
  
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  if (seconds > 10) return `${seconds}s ago`;
  return 'Just now';
}

/**
 * Get status color class based on KAS status
 */
export function getStatusColorClass(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-green-100 text-green-800 border-green-300';
    case 'pending':
      return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    case 'suspended':
      return 'bg-orange-100 text-orange-800 border-orange-300';
    case 'offline':
      return 'bg-red-100 text-red-800 border-red-300';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-300';
  }
}

/**
 * Get circuit breaker status color class
 */
export function getCircuitBreakerColorClass(state: string): string {
  switch (state) {
    case 'CLOSED':
      return 'bg-green-100 text-green-800';
    case 'HALF_OPEN':
      return 'bg-yellow-100 text-yellow-800';
    case 'OPEN':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

/**
 * Format uptime percentage for display
 */
export function formatUptime(uptime: number): string {
  return `${uptime.toFixed(2)}%`;
}

/**
 * Format response time for display
 */
export function formatResponseTime(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Get country flag emoji from ISO 3166-1 alpha-3 code
 */
export function getCountryFlag(countryCode: string): string {
  const flagMap: Record<string, string> = {
    'USA': '🇺🇸',
    'GBR': '🇬🇧',
    'FRA': '🇫🇷',
    'DEU': '🇩🇪',
    'CAN': '🇨🇦',
    'AUS': '🇦🇺',
    'NZL': '🇳🇿',
    'ITA': '🇮🇹',
    'ESP': '🇪🇸',
    'NLD': '🇳🇱',
    'BEL': '🇧🇪',
    'POL': '🇵🇱',
    'HUN': '🇭🇺',
    'CZE': '🇨🇿',
    'SVK': '🇸🇰',
    'BGR': '🇧🇬',
    'ROU': '🇷🇴',
    'GRC': '🇬🇷',
    'TUR': '🇹🇷',
    'NOR': '🇳🇴',
    'DNK': '🇩🇰',
    'EST': '🇪🇪',
    'LVA': '🇱🇻',
    'LTU': '🇱🇹',
    'PRT': '🇵🇹',
    'SVN': '🇸🇮',
    'HRV': '🇭🇷',
    'ALB': '🇦🇱',
    'MNE': '🇲🇪',
    'MKD': '🇲🇰',
    'LUX': '🇱🇺',
    'ISL': '🇮🇸',
    'FIN': '🇫🇮',
    'SWE': '🇸🇪',
    'NATO': '🛡️',
    'FVEY': '👁️',
  };
  
  return flagMap[countryCode] || '🏳️';
}

// ============================================
// React Query / SWR Hooks Support
// ============================================

/**
 * Key generator for caching
 */
export const KAS_QUERY_KEYS = {
  multiKAS: ['compliance', 'multi-kas'] as const,
  federationHealth: ['health', 'kas-federation'] as const,
  kasMetrics: (kasId: string) => ['kas', 'metrics', kasId] as const,
};

/**
 * Default polling interval for real-time updates (30 seconds)
 */
export const KAS_POLLING_INTERVAL = 30000;

/**
 * Stale time for KAS data (10 seconds)
 */
export const KAS_STALE_TIME = 10000;
