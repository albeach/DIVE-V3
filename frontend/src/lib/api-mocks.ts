/**
 * API Mocking Utilities
 * 
 * Standardized mock data and fallback handlers for admin APIs.
 * Used when:
 * - Backend is unavailable
 * - Development/testing without full stack
 * - Demonstrating features
 */

// ============================================
// Configuration
// ============================================

const ENABLE_MOCKS = process.env.NEXT_PUBLIC_ENABLE_API_MOCKS === 'true';
const MOCK_DELAY_MIN = 100;
const MOCK_DELAY_MAX = 500;

// ============================================
// Utilities
// ============================================

/**
 * Simulate network delay
 */
async function simulateDelay(): Promise<void> {
  const delay = Math.random() * (MOCK_DELAY_MAX - MOCK_DELAY_MIN) + MOCK_DELAY_MIN;
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Generate a random ID
 */
function generateId(): string {
  return `mock-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Get current timestamp
 */
function now(): string {
  return new Date().toISOString();
}

/**
 * Random item from array
 */
function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ============================================
// Mock Data Generators
// ============================================

export const mockGenerators = {
  /**
   * Generate mock users
   */
  users: (count: number = 10) => {
    const roles = ['user', 'admin', 'security_admin', 'auditor'];
    const clearances = ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];
    const countries = ['USA', 'GBR', 'FRA', 'DEU', 'CAN'];

    return Array.from({ length: count }, (_, i) => ({
      id: generateId(),
      username: `user-${i + 1}`,
      email: `user${i + 1}@dive.mil`,
      firstName: `User`,
      lastName: `${i + 1}`,
      enabled: Math.random() > 0.1,
      roles: [randomItem(roles)],
      clearance: randomItem(clearances),
      countryOfAffiliation: randomItem(countries),
      createdAt: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString(),
      lastLogin: Math.random() > 0.3 ? now() : null,
    }));
  },

  /**
   * Generate mock audit logs
   */
  auditLogs: (count: number = 50) => {
    const eventTypes = ['ACCESS_GRANTED', 'ACCESS_DENIED', 'USER_LOGIN', 'USER_LOGOUT', 'POLICY_CHANGE', 'RESOURCE_ACCESS'];
    const outcomes = ['success', 'failure'];
    const subjects = ['testuser-usa-1', 'testuser-fra-2', 'admin-usa', 'testuser-gbr-3'];
    const resources = ['doc-001', 'doc-002', 'policy-base', 'idp-usa'];

    return Array.from({ length: count }, () => ({
      id: generateId(),
      timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
      eventType: randomItem(eventTypes),
      subject: randomItem(subjects),
      resourceId: randomItem(resources),
      outcome: randomItem(outcomes),
      sourceIp: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
      details: {
        action: 'read',
        clearanceRequired: 'SECRET',
        userClearance: 'TOP_SECRET',
      },
    }));
  },

  /**
   * Generate mock IdPs
   */
  idps: (count: number = 5) => {
    const types = ['oidc', 'saml'];
    const statuses = ['enabled', 'disabled'];
    const countries = ['USA', 'GBR', 'FRA', 'DEU', 'CAN'];

    return Array.from({ length: count }, (_, i) => ({
      alias: `${countries[i % countries.length].toLowerCase()}-idp`,
      displayName: `${countries[i % countries.length]} Identity Provider`,
      providerId: randomItem(types),
      enabled: randomItem(statuses) === 'enabled',
      trustLevel: randomItem(['national', 'bilateral', 'partner']),
      config: {
        authorizationUrl: `https://idp-${i}.example.com/auth`,
        tokenUrl: `https://idp-${i}.example.com/token`,
        clientId: `dive-client-${i}`,
      },
      createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
      lastSync: now(),
    }));
  },

  /**
   * Generate mock sessions
   */
  sessions: (count: number = 10) => {
    const users = ['testuser-usa-1', 'testuser-fra-2', 'admin-usa', 'testuser-gbr-3'];

    return Array.from({ length: count }, () => ({
      id: generateId(),
      userId: generateId(),
      username: randomItem(users),
      ipAddress: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      startedAt: new Date(Date.now() - Math.random() * 8 * 60 * 60 * 1000).toISOString(),
      lastActivity: now(),
      expiresAt: new Date(Date.now() + Math.random() * 2 * 60 * 60 * 1000).toISOString(),
    }));
  },

  /**
   * Generate mock policy rules
   */
  policyRules: () => [
    { name: 'clearance_check', enabled: true, impact: 'critical', description: 'Verify user clearance meets resource requirement' },
    { name: 'country_releasability', enabled: true, impact: 'high', description: 'Check user country is in releasability list' },
    { name: 'coi_membership', enabled: true, impact: 'medium', description: 'Verify COI membership for restricted resources' },
    { name: 'embargo_check', enabled: true, impact: 'high', description: 'Check resource embargo date has passed' },
    { name: 'time_of_day_access', enabled: false, impact: 'low', description: 'Restrict access to business hours' },
    { name: 'device_compliance', enabled: false, impact: 'medium', description: 'Require compliant device' },
  ],

  /**
   * Generate mock spokes
   */
  spokes: (count: number = 5) => {
    const countries = ['USA', 'GBR', 'FRA', 'DEU', 'CAN', 'AUS', 'NZL'];
    const statuses = ['active', 'pending', 'suspended'];

    return Array.from({ length: count }, (_, i) => ({
      spokeId: generateId(),
      instanceCode: countries[i % countries.length],
      name: `${countries[i % countries.length]} DIVE Instance`,
      baseUrl: `https://dive-${countries[i % countries.length].toLowerCase()}.mil`,
      status: i === 0 ? 'pending' : randomItem(statuses),
      trustLevel: randomItem(['national', 'bilateral', 'partner']),
      maxClassificationAllowed: randomItem(['SECRET', 'TOP_SECRET']),
      registeredAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
      approvedAt: i === 0 ? null : now(),
      lastHeartbeat: now(),
      opaHealthy: Math.random() > 0.1,
      opalClientConnected: Math.random() > 0.1,
      currentPolicyVersion: 'v2.3.1-abc123',
      lastPolicySync: now(),
    }));
  },

  /**
   * Generate mock analytics
   */
  analytics: {
    riskDistribution: () => ({
      gold: Math.floor(Math.random() * 20) + 10,
      silver: Math.floor(Math.random() * 30) + 15,
      bronze: Math.floor(Math.random() * 20) + 5,
      fail: Math.floor(Math.random() * 5),
    }),

    complianceTrends: () => ({
      dates: Array.from({ length: 7 }, (_, i) =>
        new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      ),
      acp240: Array.from({ length: 7 }, () => 85 + Math.random() * 15),
      stanag4774: Array.from({ length: 7 }, () => 80 + Math.random() * 20),
      nist80063: Array.from({ length: 7 }, () => 90 + Math.random() * 10),
    }),

    authzMetrics: () => ({
      totalDecisions: Math.floor(Math.random() * 10000) + 5000,
      allowRate: 85 + Math.random() * 10,
      denyRate: 5 + Math.random() * 5,
      averageLatency: 20 + Math.random() * 30,
      cacheHitRate: 70 + Math.random() * 25,
    }),
  },

  /**
   * Generate mock certificates
   */
  certificates: () => [
    { id: '1', name: 'DIVE Root CA', type: 'root', expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), status: 'valid' },
    { id: '2', name: 'OPAL Server', type: 'server', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), status: 'expiring_soon' },
    { id: '3', name: 'Keycloak TLS', type: 'server', expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(), status: 'valid' },
    { id: '4', name: 'Backend API', type: 'server', expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), status: 'valid' },
  ],
};

// ============================================
// Mock API Handler
// ============================================

export interface MockApiOptions {
  delay?: boolean;
  failureRate?: number; // 0-1
}

/**
 * Wrap an API call with mock fallback
 */
export async function withMockFallback<T>(
  apiCall: () => Promise<T>,
  mockData: () => T,
  options: MockApiOptions = {}
): Promise<T> {
  const { delay = true, failureRate = 0 } = options;

  // Simulate random failures
  if (Math.random() < failureRate) {
    throw new Error('Simulated API failure');
  }

  try {
    // Try real API first
    return await apiCall();
  } catch (error) {
    console.warn('[API Mock] Backend unavailable, using mock data');

    if (delay) {
      await simulateDelay();
    }

    return mockData();
  }
}

/**
 * Create a mock API response
 */
export function createMockResponse<T>(
  data: T,
  options: { status?: number; total?: number; page?: number; pageSize?: number; pendingCount?: number } = {}
) {
  const { status = 200, total, page, pageSize, pendingCount } = options;

  return {
    success: status >= 200 && status < 300,
    data,
    ...(total !== undefined && { total }),
    ...(page !== undefined && { page }),
    ...(pageSize !== undefined && { pageSize }),
    ...(pendingCount !== undefined && { pendingCount }),
    timestamp: now(),
    mock: true,
  };
}

// ============================================
// Pre-built Mock Handlers
// ============================================

export const mockHandlers = {
  users: {
    list: (params?: { page?: number; limit?: number }) =>
      createMockResponse(mockGenerators.users(params?.limit || 25), {
        total: 150,
        page: params?.page || 1,
        pageSize: params?.limit || 25,
      }),
    get: (id: string) => createMockResponse(mockGenerators.users(1)[0]),
    create: (data: unknown) => createMockResponse({ id: generateId(), ...data as object }),
    delete: (id: string) => createMockResponse({ deleted: true }),
  },

  auditLogs: {
    list: (params?: { limit?: number }) =>
      createMockResponse(mockGenerators.auditLogs(params?.limit || 50), {
        total: 1000,
      }),
    stats: () => createMockResponse({
      totalEvents: 15234,
      deniedAccess: 423,
      successfulLogins: 8921,
      policyChanges: 12,
    }),
    violations: () => createMockResponse(
      mockGenerators.auditLogs(20).filter(l => l.eventType === 'ACCESS_DENIED')
    ),
  },

  idps: {
    list: () => createMockResponse(mockGenerators.idps()),
    get: (alias: string) => createMockResponse(mockGenerators.idps(1)[0]),
    health: (alias: string) => createMockResponse({
      healthy: Math.random() > 0.1,
      status: 'online',
      latency: Math.floor(Math.random() * 100) + 20,
    }),
  },

  sessions: {
    list: () => createMockResponse(mockGenerators.sessions()),
    terminate: (id: string) => createMockResponse({ terminated: true }),
  },

  spokes: {
    list: () => createMockResponse(mockGenerators.spokes(), { total: 5, pendingCount: 1 }),
    get: (id: string) => createMockResponse(mockGenerators.spokes(1)[0]),
  },

  analytics: {
    riskDistribution: () => createMockResponse(mockGenerators.analytics.riskDistribution()),
    complianceTrends: () => createMockResponse(mockGenerators.analytics.complianceTrends()),
    authzMetrics: () => createMockResponse(mockGenerators.analytics.authzMetrics()),
  },

  security: {
    certificates: () => createMockResponse(mockGenerators.certificates()),
    passwordPolicy: () => createMockResponse({
      minLength: 12,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecial: true,
      historyCount: 5,
      maxAgeDays: 90,
    }),
    mfaConfig: () => createMockResponse({
      totpEnabled: true,
      webauthnEnabled: true,
      smsEnabled: false,
      requiredForAdmins: true,
      requiredForAllUsers: false,
    }),
  },
};

export default {
  mockGenerators,
  withMockFallback,
  createMockResponse,
  mockHandlers,
  ENABLE_MOCKS,
};

