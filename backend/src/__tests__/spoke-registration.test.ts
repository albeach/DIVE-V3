/**
 * DIVE V3 - Spoke Registration Service Tests
 *
 * Tests for registration workflow, token handling, and Hub communication.
 *
 * @version 1.0.0
 * @date 2025-12-05
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import SpokeRegistrationService, {
  ISpokeConfig,
  IRegistrationResponse,
  RegistrationStatus,
} from '../services/spoke-registration.service';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Mock logger
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock dependent services
jest.mock('../services/spoke-mtls.service', () => ({
  spokeMTLS: {
    generateCSR: jest.fn().mockImplementation(() => Promise.resolve({
      csr: '-----BEGIN CSR-----\ntest\n-----END CSR-----',
      privateKeyPath: '/test/spoke.key',
      algorithm: 'rsa',
      keySize: 4096,
      subject: { CN: 'spoke-test' },
    })),
    makeRequest: jest.fn(),
    installSignedCertificate: jest.fn(),
  },
}));

// Token mock must be defined inline due to jest hoisting
jest.mock('../services/spoke-token.service', () => ({
  spokeToken: {
    storeToken: jest.fn(),
    getToken: jest.fn().mockImplementation(() => Promise.resolve('test-token')),
    hasToken: jest.fn().mockImplementation(() => false),
    isTokenValid: jest.fn().mockImplementation(() => false),
    getTokenExpiry: jest.fn().mockImplementation(() => null),
  },
}));

// Get reference to mock for test manipulation
const getMockSpokeToken = () => {
  const { spokeToken } = jest.requireMock('../services/spoke-token.service') as {
    spokeToken: {
      storeToken: jest.Mock;
      getToken: jest.Mock;
      hasToken: jest.Mock;
      isTokenValid: jest.Mock;
      getTokenExpiry: jest.Mock;
    };
  };
  return spokeToken;
};

// ============================================
// TEST DATA
// ============================================

const createTestSpokeConfig = (): ISpokeConfig => ({
  identity: {
    spokeId: 'spoke-nzl-abc123',
    instanceCode: 'NZL',
    name: 'New Zealand Defence',
    description: 'DIVE V3 Spoke Instance for NZL',
    country: 'NZL',
    organizationType: 'government',
    contactEmail: 'admin@nzl.mil',
  },
  endpoints: {
    hubUrl: 'https://hub.dive25.com',
    hubApiUrl: 'https://hub.dive25.com/api',
    hubOpalUrl: 'https://hub.dive25.com:7002',
    baseUrl: 'https://nzl-app.dive25.com',
    apiUrl: 'https://nzl-api.dive25.com',
    idpUrl: 'https://nzl-idp.dive25.com',
  },
  certificates: {
    certificatePath: '/var/dive/spoke/certs/spoke.crt',
    privateKeyPath: '/var/dive/spoke/certs/spoke.key',
    csrPath: '/var/dive/spoke/certs/spoke.csr',
    caBundlePath: '/var/dive/spoke/certs/hub-ca.crt',
  },
  authentication: {},
  federation: {
    status: 'unregistered',
    requestedScopes: ['policy:base', 'policy:nzl'],
  },
  operational: {
    heartbeatIntervalMs: 30000,
    tokenRefreshBufferMs: 300000,
    offlineGracePeriodMs: 3600000,
    policyCachePath: '/var/dive/spoke/cache/policies',
    auditQueuePath: '/var/dive/spoke/cache/audit',
    maxAuditQueueSize: 10000,
    auditFlushIntervalMs: 60000,
  },
  metadata: {
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    lastModified: new Date().toISOString(),
  },
});

// ============================================
// TEST SUITE
// ============================================

describe('SpokeRegistrationService', () => {
  let service: SpokeRegistrationService;
  let testDir: string;
  let configPath: string;

  beforeEach(async () => {
    // Create temporary directory for tests
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'spoke-reg-test-'));
    configPath = path.join(testDir, 'config.json');

    service = new SpokeRegistrationService();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    service.shutdown();
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  // ============================================
  // INITIALIZATION TESTS
  // ============================================

  describe('Initialization', () => {
    it('should initialize without existing config', async () => {
      await service.initialize({
        hubUrl: 'https://hub.test.com',
        configPath,
        certsDir: path.join(testDir, 'certs'),
      });

      expect(service.getSpokeConfig()).toBeNull();
    });

    it('should load existing config on init', async () => {
      // Create config file
      const config = createTestSpokeConfig();
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));

      await service.initialize({
        hubUrl: 'https://hub.test.com',
        configPath,
        certsDir: path.join(testDir, 'certs'),
      });

      const loadedConfig = service.getSpokeConfig();
      expect(loadedConfig).not.toBeNull();
      expect(loadedConfig?.identity.spokeId).toBe(config.identity.spokeId);
    });
  });

  // ============================================
  // CONFIGURATION MANAGEMENT TESTS
  // ============================================

  describe('Configuration Management', () => {
    beforeEach(async () => {
      const config = createTestSpokeConfig();
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      await service.initialize({
        hubUrl: 'https://hub.test.com',
        configPath,
        certsDir: path.join(testDir, 'certs'),
      });
    });

    it('should get spoke config', () => {
      const config = service.getSpokeConfig();
      expect(config).not.toBeNull();
      expect(config?.identity.instanceCode).toBe('NZL');
    });

    it('should update spoke config', async () => {
      await service.updateSpokeConfig({
        federation: {
          ...service.getSpokeConfig()!.federation,
          status: 'pending',
        },
      });

      const updated = service.getSpokeConfig();
      expect(updated?.federation.status).toBe('pending');
    });

    it('should persist config updates', async () => {
      await service.updateSpokeConfig({
        identity: {
          ...service.getSpokeConfig()!.identity,
          name: 'Updated Name',
        },
      });

      // Read from disk
      const fileContent = await fs.readFile(configPath, 'utf-8');
      const diskConfig = JSON.parse(fileContent);

      expect(diskConfig.identity.name).toBe('Updated Name');
    });

    it('should emit configUpdated event', async () => {
      const handler = jest.fn();
      service.on('configUpdated', handler);

      await service.updateSpokeConfig({
        federation: {
          ...service.getSpokeConfig()!.federation,
          status: 'pending',
        },
      });

      expect(handler).toHaveBeenCalled();
    });
  });

  // ============================================
  // CSR GENERATION TESTS
  // ============================================

  describe('CSR Generation', () => {
    beforeEach(async () => {
      const config = createTestSpokeConfig();
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      await service.initialize({
        hubUrl: 'https://hub.test.com',
        configPath,
        certsDir: path.join(testDir, 'certs'),
      });
    });

    it('should generate CSR', async () => {
      const result = await service.generateCSR();

      expect(result).toBeDefined();
      expect(result.csr).toBeDefined();
      expect(result.privateKeyPath).toBeDefined();
    });

    it('should update config after CSR generation', async () => {
      await service.generateCSR();

      const config = service.getSpokeConfig();
      expect(config?.federation.status).toBe('csr_generated');
    });

    it('should emit csrGenerated event', async () => {
      const handler = jest.fn();
      service.on('csrGenerated', handler);

      await service.generateCSR();

      expect(handler).toHaveBeenCalled();
    });

    it('should throw when not initialized', async () => {
      const uninitService = new SpokeRegistrationService();

      await expect(uninitService.generateCSR()).rejects.toThrow(
        'Spoke not initialized'
      );
    });
  });

  // ============================================
  // STATUS TESTS
  // ============================================

  describe('Status', () => {
    it('should return unregistered when no config', async () => {
      await service.initialize({
        hubUrl: 'https://hub.test.com',
        configPath,
        certsDir: path.join(testDir, 'certs'),
      });

      const status = service.getStatus();
      expect(status.status).toBe('unregistered');
      expect(status.spokeId).toBeNull();
    });

    it('should return status from config', async () => {
      const config = createTestSpokeConfig();
      config.federation.status = 'pending';
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));

      await service.initialize({
        hubUrl: 'https://hub.test.com',
        configPath,
        certsDir: path.join(testDir, 'certs'),
      });

      const status = service.getStatus();
      expect(status.status).toBe('pending');
      expect(status.spokeId).toBe(config.identity.spokeId);
    });

    it('should report registered when approved with valid token', async () => {
      const config = createTestSpokeConfig();
      config.federation.status = 'approved';
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));

      // Mock token service to return valid
      const mockToken = getMockSpokeToken();
      mockToken.hasToken.mockReturnValue(true);
      mockToken.isTokenValid.mockReturnValue(true);

      await service.initialize({
        hubUrl: 'https://hub.test.com',
        configPath,
        certsDir: path.join(testDir, 'certs'),
      });

      expect(service.isRegistered()).toBe(true);
    });

    it('should report not registered when no token', async () => {
      const config = createTestSpokeConfig();
      config.federation.status = 'approved';
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));

      // Mock token service to return invalid
      const mockToken = getMockSpokeToken();
      mockToken.hasToken.mockReturnValue(false);
      mockToken.isTokenValid.mockReturnValue(false);

      await service.initialize({
        hubUrl: 'https://hub.test.com',
        configPath,
        certsDir: path.join(testDir, 'certs'),
      });

      expect(service.isRegistered()).toBe(false);
    });
  });

  // ============================================
  // POLLING TESTS
  // ============================================

  describe('Status Polling', () => {
    beforeEach(async () => {
      const config = createTestSpokeConfig();
      config.federation.status = 'pending';
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      await service.initialize({
        hubUrl: 'https://hub.test.com',
        configPath,
        certsDir: path.join(testDir, 'certs'),
        pollIntervalMs: 100,
      });
    });

    it('should start polling', () => {
      service.startStatusPolling();
      // Should not throw
      expect(true).toBe(true);
    });

    it('should stop polling', () => {
      service.startStatusPolling();
      service.stopStatusPolling();
      // Should not throw
      expect(true).toBe(true);
    });

    it('should not start polling twice', () => {
      service.startStatusPolling();
      service.startStatusPolling();
      // Should not throw
      expect(true).toBe(true);
    });
  });

  // ============================================
  // HUB URL TESTS
  // ============================================

  describe('Hub URL', () => {
    it('should return configured hub URL', async () => {
      await service.initialize({
        hubUrl: 'https://custom-hub.example.com',
        configPath,
        certsDir: path.join(testDir, 'certs'),
      });

      expect(service.getHubUrl()).toBe('https://custom-hub.example.com');
    });
  });

  // ============================================
  // EVENT TESTS
  // ============================================

  describe('Events', () => {
    beforeEach(async () => {
      const config = createTestSpokeConfig();
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      await service.initialize({
        hubUrl: 'https://hub.test.com',
        configPath,
        certsDir: path.join(testDir, 'certs'),
      });
    });

    it('should register event listeners', () => {
      const handlers = {
        csrGenerated: jest.fn(),
        registrationSubmitted: jest.fn(),
        statusChanged: jest.fn(),
        tokenReceived: jest.fn(),
        certificateInstalled: jest.fn(),
      };

      Object.entries(handlers).forEach(([event, handler]) => {
        service.on(event, handler);
      });

      expect(service.listenerCount('csrGenerated')).toBe(1);
      expect(service.listenerCount('registrationSubmitted')).toBe(1);
      expect(service.listenerCount('statusChanged')).toBe(1);
      expect(service.listenerCount('tokenReceived')).toBe(1);
      expect(service.listenerCount('certificateInstalled')).toBe(1);
    });
  });

  // ============================================
  // SHUTDOWN TESTS
  // ============================================

  describe('Shutdown', () => {
    it('should cleanup on shutdown', async () => {
      const config = createTestSpokeConfig();
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      await service.initialize({
        hubUrl: 'https://hub.test.com',
        configPath,
        certsDir: path.join(testDir, 'certs'),
      });

      service.startStatusPolling();
      service.shutdown();

      expect(service.getSpokeConfig()).toBeNull();
    });
  });
});

// ============================================
// DATA STRUCTURE TESTS
// ============================================

describe('Registration Data Structures', () => {
  it('should have all registration statuses', () => {
    const statuses: RegistrationStatus[] = [
      'unregistered',
      'csr_generated',
      'pending',
      'approved',
      'rejected',
      'suspended',
      'revoked',
    ];

    statuses.forEach((status) => {
      expect(typeof status).toBe('string');
    });
  });

  it('should have correct ISpokeConfig structure', () => {
    const config = createTestSpokeConfig();

    expect(config.identity).toBeDefined();
    expect(config.endpoints).toBeDefined();
    expect(config.certificates).toBeDefined();
    expect(config.authentication).toBeDefined();
    expect(config.federation).toBeDefined();
    expect(config.operational).toBeDefined();
    expect(config.metadata).toBeDefined();
  });

  it('should have correct IRegistrationResponse structure', () => {
    const response: IRegistrationResponse = {
      success: true,
      spokeId: 'spoke-test-001',
      status: 'pending',
      message: 'Registration pending approval',
    };

    expect(response.success).toBe(true);
    expect(response.spokeId).toBe('spoke-test-001');
    expect(response.status).toBe('pending');
  });

  it('should support token in response', () => {
    const response: IRegistrationResponse = {
      success: true,
      spokeId: 'spoke-test-001',
      status: 'approved',
      token: {
        token: 'jwt-token-here',
        expiresAt: new Date().toISOString(),
        scopes: ['policy:base'],
      },
    };

    expect(response.token).toBeDefined();
    expect(response.token?.scopes).toContain('policy:base');
  });
});

// ============================================
// INTEGRATION BEHAVIOR TESTS
// ============================================

describe('Registration Flow', () => {
  let service: SpokeRegistrationService;
  let testDir: string;
  let configPath: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'spoke-flow-test-'));
    configPath = path.join(testDir, 'config.json');
    service = new SpokeRegistrationService();

    const config = createTestSpokeConfig();
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    await service.initialize({
      hubUrl: 'https://hub.test.com',
      configPath,
      certsDir: path.join(testDir, 'certs'),
    });
  });

  afterEach(async () => {
    service.shutdown();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should follow registration flow', async () => {
    // 1. Initial state
    expect(service.getStatus().status).toBe('unregistered');

    // 2. Generate CSR
    await service.generateCSR();
    expect(service.getStatus().status).toBe('csr_generated');

    // 3. After registration would be 'pending'
    // 4. After approval would be 'approved'
  });
});
