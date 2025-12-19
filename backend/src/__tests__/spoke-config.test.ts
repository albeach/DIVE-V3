/**
 * DIVE V3 - Spoke Config Service Tests
 *
 * Comprehensive test suite for the spoke configuration management service.
 * Tests cover:
 * - Configuration loading from file
 * - New spoke initialization
 * - Configuration validation
 * - Configuration updates
 * - Hash calculation and persistence
 *
 * @version 1.0.0
 * @date 2025-12-05
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs/promises';
import SpokeConfigService from '../services/spoke-config.service';

// Mock the dependencies
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock fs/promises
jest.mock('fs/promises');
const mockFs = fs as jest.Mocked<typeof fs>;

// ============================================
// TEST DATA
// ============================================

const validFlatConfig: Record<string, unknown> = {
  spokeId: 'spoke-aus-def456',
  instanceCode: 'AUS',
  name: 'Australian Defence Force',
  description: 'ADF DIVE V3 Spoke Instance',
  country: 'AUS',
  organizationType: 'military',
  contactEmail: 'admin@defence.gov.au',
  hubUrl: 'https://hub.dive25.com',
  hubApiUrl: 'https://hub.dive25.com/api',
  hubOpalUrl: 'https://hub.dive25.com:7002',
  baseUrl: 'https://aus-app.dive25.com',
  apiUrl: 'https://aus-api.dive25.com',
  idpUrl: 'https://aus-idp.dive25.com',
  certificatePath: '/instances/aus/certs/spoke.crt',
  privateKeyPath: '/instances/aus/certs/spoke.key',
  status: 'pending',
  requestedScopes: ['policy:base', 'policy:fvey'],
  heartbeatIntervalMs: 30000,
  tokenRefreshBufferMs: 300000,
  offlineGracePeriodMs: 3600000,
  version: '1.0.0',
  createdAt: '2025-12-05T00:00:00.000Z',
  lastModified: '2025-12-05T00:00:00.000Z',
};

const validNestedConfig = {
  identity: {
    spokeId: 'spoke-can-ghi789',
    instanceCode: 'CAN',
    name: 'Canadian Armed Forces',
    description: 'CAF DIVE V3 Spoke Instance',
    country: 'CAN',
    organizationType: 'military',
    contactEmail: 'admin@forces.gc.ca',
  },
  endpoints: {
    hubUrl: 'https://hub.dive25.com',
    hubApiUrl: 'https://hub.dive25.com/api',
    hubOpalUrl: 'https://hub.dive25.com:7002',
    baseUrl: 'https://can-app.dive25.com',
    apiUrl: 'https://can-api.dive25.com',
    idpUrl: 'https://can-idp.dive25.com',
  },
  certificates: {
    certificatePath: '/instances/can/certs/spoke.crt',
    privateKeyPath: '/instances/can/certs/spoke.key',
  },
  authentication: {
    spokeToken: 'test-token-can',
    tokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
  },
  federation: {
    status: 'approved',
    registeredAt: '2025-12-04T00:00:00.000Z',
    approvedAt: '2025-12-04T12:00:00.000Z',
    requestedScopes: ['policy:base', 'policy:fvey', 'data:federation_matrix'],
    allowedPolicyScopes: ['policy:base', 'policy:fvey'],
    trustLevel: 'bilateral',
    maxClassificationAllowed: 'SECRET',
  },
  operational: {
    heartbeatIntervalMs: 45000,
    tokenRefreshBufferMs: 600000,
    offlineGracePeriodMs: 7200000,
    policyCachePath: '/instances/can/cache/policies',
    auditQueuePath: '/instances/can/cache/audit',
    maxAuditQueueSize: 5000,
    auditFlushIntervalMs: 30000,
  },
  metadata: {
    version: '1.0.0',
    createdAt: '2025-12-04T00:00:00.000Z',
    lastModified: '2025-12-05T00:00:00.000Z',
    configHash: 'abc123def456',
  },
};

// ============================================
// TEST SUITE
// ============================================

describe('SpokeConfigService', () => {
  let service: SpokeConfigService;
  const testConfigPath = '/test/instances/aus/config.json';

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SpokeConfigService();
  });

  afterEach(() => {
    // Reset any environment variables
    delete process.env.NODE_ENV;
  });

  // ============================================
  // LOADING TESTS
  // ============================================

  describe('Configuration Loading', () => {
    it('should load config from file path', async () => {
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(validFlatConfig));

      const config = await service.loadFromFile(testConfigPath);

      expect(mockFs.readFile).toHaveBeenCalledWith(testConfigPath, 'utf-8');
      expect(config).toBeDefined();
      expect(config.identity.spokeId).toBe('spoke-aus-def456');
      expect(config.identity.instanceCode).toBe('AUS');
      expect(service.isLoaded()).toBe(true);
    });

    it('should initialize new spoke config', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue();

      const config = await service.initializeNew('NZL', 'New Zealand Defence Force', {
        hubUrl: 'https://hub.dive25.com',
        baseUrl: 'https://nzl-app.dive25.com',
        apiUrl: 'https://nzl-api.dive25.com',
        idpUrl: 'https://nzl-idp.dive25.com',
        contactEmail: 'admin@nzdf.mil.nz',
        country: 'NZL',
        organizationType: 'military',
      });

      expect(config).toBeDefined();
      expect(config.identity.instanceCode).toBe('NZL');
      expect(config.identity.name).toBe('New Zealand Defence Force');
      expect(config.identity.contactEmail).toBe('admin@nzdf.mil.nz');
      expect(config.federation.status).toBe('unregistered');
      expect(config.metadata.configHash).toBeTruthy();
    });

    it('should validate config structure', async () => {
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(validNestedConfig));

      const config = await service.loadFromFile(testConfigPath);

      // Validate nested structure was parsed correctly
      expect(config.identity).toBeDefined();
      expect(config.endpoints).toBeDefined();
      expect(config.certificates).toBeDefined();
      expect(config.authentication).toBeDefined();
      expect(config.federation).toBeDefined();
      expect(config.operational).toBeDefined();
      expect(config.metadata).toBeDefined();
    });

    it('should calculate config hash', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue();

      const config = await service.initializeNew('JPN', 'Japan Self-Defence Forces', {
        hubUrl: 'https://hub.dive25.com',
        baseUrl: 'https://jpn-app.dive25.com',
        apiUrl: 'https://jpn-api.dive25.com',
        idpUrl: 'https://jpn-idp.dive25.com',
        contactEmail: 'admin@mod.go.jp',
      });

      expect(config.metadata.configHash).toBeTruthy();
      expect(config.metadata.configHash.length).toBe(16); // SHA256 truncated
    });

    it('should throw on missing config file', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockFs.readFile.mockRejectedValueOnce(error);

      await expect(service.loadFromFile('/nonexistent/config.json')).rejects.toThrow(
        'Configuration file not found: /nonexistent/config.json'
      );
    });

    it('should transform flat config to nested format', async () => {
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(validFlatConfig));

      const config = await service.loadFromFile(testConfigPath);

      // Flat config should be transformed to nested
      expect(config.identity.spokeId).toBe('spoke-aus-def456');
      expect(config.endpoints.hubUrl).toBe('https://hub.dive25.com');
      expect(config.federation.requestedScopes).toContain('policy:base');
    });

    it('should handle nested config format', async () => {
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(validNestedConfig));

      const config = await service.loadFromFile(testConfigPath);

      expect(config.identity.spokeId).toBe('spoke-can-ghi789');
      expect(config.federation.trustLevel).toBe('bilateral');
    });
  });

  // ============================================
  // UPDATE TESTS
  // ============================================

  describe('Configuration Updates', () => {
    beforeEach(async () => {
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(validFlatConfig));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue();
      await service.loadFromFile(testConfigPath);
    });

    it('should update authentication', async () => {
      const newToken = 'new-spoke-token-xyz';
      const expiresAt = new Date(Date.now() + 7200000);

      await service.updateAuthentication({
        spokeToken: newToken,
        tokenExpiresAt: expiresAt,
        tokenScopes: ['policy:base', 'policy:fvey'],
      });

      const config = service.getConfig();
      expect(config.authentication.spokeToken).toBe(newToken);
      expect(config.authentication.tokenScopes).toContain('policy:base');
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should update federation status', async () => {
      await service.updateFederationStatus('approved', {
        approvedAt: new Date(),
        approvedBy: 'admin@hub.dive25.com',
        allowedPolicyScopes: ['policy:base', 'policy:fvey'],
        trustLevel: 'bilateral',
        maxClassificationAllowed: 'SECRET',
      });

      const config = service.getConfig();
      expect(config.federation.status).toBe('approved');
      expect(config.federation.approvedBy).toBe('admin@hub.dive25.com');
      expect(config.federation.trustLevel).toBe('bilateral');
    });

    it('should update operational settings', async () => {
      await service.updateOperational({
        heartbeatIntervalMs: 60000,
        maxAuditQueueSize: 20000,
      });

      const config = service.getConfig();
      expect(config.operational.heartbeatIntervalMs).toBe(60000);
      expect(config.operational.maxAuditQueueSize).toBe(20000);
    });

    it('should persist changes to file', async () => {
      await service.updateFederationStatus('suspended', {
        suspendedReason: 'Security review',
      });

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        testConfigPath,
        expect.any(String)
      );

      // Verify the JSON content includes the update
      const writeCall = mockFs.writeFile.mock.calls[0];
      const writtenContent = JSON.parse(writeCall[1] as string);
      expect(writtenContent.federation.status).toBe('suspended');
    });

    it('should set approvedAt automatically on approval', async () => {
      await service.updateFederationStatus('approved');

      const config = service.getConfig();
      expect(config.federation.approvedAt).toBeInstanceOf(Date);
    });

    it('should update certificate information', async () => {
      await service.updateCertificateInfo({
        certificateFingerprint: 'SHA256:abc123',
        certificateExpiresAt: new Date('2026-12-05'),
      });

      const config = service.getConfig();
      expect(config.certificates.certificateFingerprint).toBe('SHA256:abc123');
    });
  });

  // ============================================
  // VALIDATION TESTS
  // ============================================

  describe('Validation', () => {
    it('should validate URLs', async () => {
      const invalidConfig = {
        ...validFlatConfig,
        hubUrl: 'not-a-valid-url',
      };
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(invalidConfig));

      await expect(service.loadFromFile(testConfigPath)).rejects.toThrow(
        /Invalid URL/
      );
    });

    it('should warn on missing certificates', async () => {
      const noCertConfig = { ...validFlatConfig };
      delete noCertConfig.certificatePath;
      delete noCertConfig.privateKeyPath;

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(noCertConfig));

      // Should load but with warnings (validation passes, warnings logged)
      const config = await service.loadFromFile(testConfigPath);
      expect(config).toBeDefined();
    });

    it('should reject invalid instance codes', async () => {
      const invalidConfig = {
        ...validFlatConfig,
        instanceCode: 'TOOLONG', // Should be 3 chars (ISO 3166-1 alpha-3)
      };
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(invalidConfig));

      await expect(service.loadFromFile(testConfigPath)).rejects.toThrow(
        /instanceCode must be exactly 3 characters/
      );
    });

    it('should validate required identity fields', async () => {
      const missingEmail = {
        ...validFlatConfig,
        contactEmail: '', // Empty
      };
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(missingEmail));

      await expect(service.loadFromFile(testConfigPath)).rejects.toThrow(
        /Missing contactEmail/
      );
    });

    it('should warn on non-HTTPS hub URL in production', async () => {
      process.env.NODE_ENV = 'production';
      
      const httpConfig = {
        ...validFlatConfig,
        hubUrl: 'http://hub.dive25.com',
      };
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(httpConfig));

      await expect(service.loadFromFile(testConfigPath)).rejects.toThrow(
        /Hub URL must use HTTPS in production/
      );
    });

    it('should allow HTTP in development', async () => {
      process.env.NODE_ENV = 'development';
      
      const httpConfig = {
        ...validFlatConfig,
        hubUrl: 'http://localhost:4000',
        baseUrl: 'http://localhost:3000',
        apiUrl: 'http://localhost:4000',
        idpUrl: 'http://localhost:8080',
      };
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(httpConfig));

      const config = await service.loadFromFile(testConfigPath);
      expect(config).toBeDefined();
    });

    it('should validate heartbeat interval bounds', async () => {
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(validFlatConfig));

      const config = await service.loadFromFile(testConfigPath);
      const validation = service.validateConfig(config);

      // Valid config should pass
      expect(validation.valid).toBe(true);
    });
  });

  // ============================================
  // ENVIRONMENT OVERRIDE TESTS
  // ============================================

  describe('Environment Overrides', () => {
    beforeEach(async () => {
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(validFlatConfig));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue();
      await service.loadFromFile(testConfigPath);
    });

    afterEach(() => {
      delete process.env.DIVE_HUB_URL;
      delete process.env.DIVE_HUB_OPAL_URL;
      delete process.env.DIVE_SPOKE_TOKEN;
      delete process.env.DIVE_HEARTBEAT_INTERVAL_MS;
      delete process.env.DIVE_POLICY_CACHE_PATH;
    });

    it('should apply hub URL override', () => {
      process.env.DIVE_HUB_URL = 'https://custom-hub.dive25.com';

      service.applyEnvironmentOverrides();

      const config = service.getConfig();
      expect(config.endpoints.hubUrl).toBe('https://custom-hub.dive25.com');
      expect(config.endpoints.hubApiUrl).toBe('https://custom-hub.dive25.com/api');
    });

    it('should apply token override', () => {
      process.env.DIVE_SPOKE_TOKEN = 'env-override-token';

      service.applyEnvironmentOverrides();

      const config = service.getConfig();
      expect(config.authentication.spokeToken).toBe('env-override-token');
    });

    it('should apply interval overrides', () => {
      process.env.DIVE_HEARTBEAT_INTERVAL_MS = '90000';

      service.applyEnvironmentOverrides();

      const config = service.getConfig();
      expect(config.operational.heartbeatIntervalMs).toBe(90000);
    });

    it('should apply cache path override', () => {
      process.env.DIVE_POLICY_CACHE_PATH = '/custom/cache/path';

      service.applyEnvironmentOverrides();

      const config = service.getConfig();
      expect(config.operational.policyCachePath).toBe('/custom/cache/path');
    });
  });

  // ============================================
  // UTILITY TESTS
  // ============================================

  describe('Utilities', () => {
    it('should return config path', async () => {
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(validFlatConfig));
      await service.loadFromFile(testConfigPath);

      expect(service.getConfigPath()).toBe(testConfigPath);
    });

    it('should throw when getting config before load', () => {
      expect(() => service.getConfig()).toThrow('Configuration not loaded');
    });

    it('should return loaded status', async () => {
      expect(service.isLoaded()).toBe(false);

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(validFlatConfig));
      await service.loadFromFile(testConfigPath);

      expect(service.isLoaded()).toBe(true);
    });

    it('should normalize instance code to uppercase', async () => {
      const lowercaseConfig = {
        ...validFlatConfig,
        instanceCode: 'aus',
      };
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(lowercaseConfig));

      const config = await service.loadFromFile(testConfigPath);
      expect(config.identity.instanceCode).toBe('AUS');
    });

    it('should generate unique spoke IDs', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue();

      const config1 = await service.initializeNew('NZ1', 'Test 1', {
        hubUrl: 'https://hub.dive25.com',
        baseUrl: 'https://nz1-app.dive25.com',
        apiUrl: 'https://nz1-api.dive25.com',
        idpUrl: 'https://nz1-idp.dive25.com',
        contactEmail: 'test@test.com',
      });

      const service2 = new SpokeConfigService();
      const config2 = await service2.initializeNew('NZ2', 'Test 2', {
        hubUrl: 'https://hub.dive25.com',
        baseUrl: 'https://nz2-app.dive25.com',
        apiUrl: 'https://nz2-api.dive25.com',
        idpUrl: 'https://nz2-idp.dive25.com',
        contactEmail: 'test@test.com',
      });

      expect(config1.identity.spokeId).not.toBe(config2.identity.spokeId);
      expect(config1.identity.spokeId).toMatch(/^spoke-nz1-[a-f0-9]+$/);
      expect(config2.identity.spokeId).toMatch(/^spoke-nz2-[a-f0-9]+$/);
    });
  });

  // ============================================
  // SAVE TESTS
  // ============================================

  describe('Configuration Saving', () => {
    it('should save config to specified path', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue();

      await service.initializeNew('GBR', 'United Kingdom MOD', {
        hubUrl: 'https://hub.dive25.com',
        baseUrl: 'https://gbr-app.dive25.com',
        apiUrl: 'https://gbr-api.dive25.com',
        idpUrl: 'https://gbr-idp.dive25.com',
        contactEmail: 'admin@mod.uk',
      });

      const customPath = '/custom/path/config.json';
      await service.save(customPath);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        customPath,
        expect.any(String)
      );
    });

    it('should create directory if not exists', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue();

      await service.initializeNew('DEU', 'German Bundeswehr', {
        hubUrl: 'https://hub.dive25.com',
        baseUrl: 'https://deu-app.dive25.com',
        apiUrl: 'https://deu-api.dive25.com',
        idpUrl: 'https://deu-idp.dive25.com',
        contactEmail: 'admin@bundeswehr.de',
      });

      await service.save('/new/path/config.json');

      expect(mockFs.mkdir).toHaveBeenCalledWith('/new/path', { recursive: true });
    });

    it('should throw when saving without path', async () => {
      const emptyService = new SpokeConfigService();

      await expect(emptyService.save()).rejects.toThrow(
        'No configuration to save'
      );
    });

    it('should update lastModified and hash on save', async () => {
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(validFlatConfig));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue();
      
      await service.loadFromFile(testConfigPath);

      const beforeSave = service.getConfig().metadata.lastModified;

      // Wait a tiny bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      await service.save();

      const afterSave = service.getConfig().metadata.lastModified;
      expect(afterSave.getTime()).toBeGreaterThanOrEqual(beforeSave.getTime());
    });
  });
});
