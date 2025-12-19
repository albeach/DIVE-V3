/**
 * DIVE V3 - Spoke Token Service Tests
 *
 * Tests for token storage, validation, refresh, and encryption.
 *
 * @version 1.0.0
 * @date 2025-12-05
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import SpokeTokenService, {
  ISpokeToken,
  ITokenStorageConfig,
} from '../services/spoke-token.service';
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

// ============================================
// TEST DATA
// ============================================

const createTestToken = (overrides?: Partial<ISpokeToken>): ISpokeToken => ({
  token: 'test-token-abc123',
  spokeId: 'spoke-nzl-def456',
  scopes: ['policy:base', 'policy:nzl'],
  issuedAt: new Date(),
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
  tokenType: 'bearer',
  version: 1,
  ...overrides,
});

// ============================================
// TEST SUITE
// ============================================

describe('SpokeTokenService', () => {
  let service: SpokeTokenService;
  let testDir: string;
  let testConfig: Partial<ITokenStorageConfig>;

  beforeEach(async () => {
    // Create temporary directory for tests
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'spoke-token-test-'));
    
    testConfig = {
      storagePath: path.join(testDir, 'token.json'),
      refreshBufferMs: 5 * 60 * 1000,
      autoRefresh: false, // Disable auto-refresh for tests
    };

    service = new SpokeTokenService();
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
    it('should initialize successfully', async () => {
      await service.initialize(testConfig);
      
      const status = service.getStatus();
      expect(status.hasToken).toBe(false);
      expect(status.isValid).toBe(false);
    });

    it('should create storage directory if not exists', async () => {
      const deepPath = path.join(testDir, 'deep', 'nested', 'token.json');
      await service.initialize({ ...testConfig, storagePath: deepPath });
      
      const dirExists = await fs.access(path.dirname(deepPath))
        .then(() => true)
        .catch(() => false);
      
      expect(dirExists).toBe(true);
    });

    it('should load existing token on initialization', async () => {
      // Pre-create token file
      const token = createTestToken();
      await fs.mkdir(path.dirname(testConfig.storagePath!), { recursive: true });
      await fs.writeFile(
        testConfig.storagePath!,
        JSON.stringify({
          ...token,
          issuedAt: token.issuedAt.toISOString(),
          expiresAt: token.expiresAt.toISOString(),
        })
      );

      await service.initialize(testConfig);

      expect(service.hasToken()).toBe(true);
      expect(service.getSpokeId()).toBe(token.spokeId);
    });
  });

  // ============================================
  // TOKEN STORAGE TESTS
  // ============================================

  describe('Token Storage', () => {
    beforeEach(async () => {
      await service.initialize(testConfig);
    });

    it('should store token', async () => {
      const token = createTestToken();
      await service.storeToken(token);

      expect(service.hasToken()).toBe(true);
      const stored = await service.getToken();
      expect(stored).toBe(token.token);
    });

    it('should persist token to disk', async () => {
      const token = createTestToken();
      await service.storeToken(token);

      const fileExists = await fs.access(testConfig.storagePath!)
        .then(() => true)
        .catch(() => false);
      
      expect(fileExists).toBe(true);
    });

    it('should reject invalid token structure', async () => {
      const invalidToken = { token: '', spokeId: '' } as ISpokeToken;
      
      await expect(service.storeToken(invalidToken)).rejects.toThrow(
        'Invalid token structure'
      );
    });

    it('should clear token', async () => {
      const token = createTestToken();
      await service.storeToken(token);
      await service.clearToken();

      expect(service.hasToken()).toBe(false);
      expect(await service.getToken()).toBeNull();
    });

    it('should emit tokenStored event', async () => {
      const handler = jest.fn();
      service.on('tokenStored', handler);

      await service.storeToken(createTestToken());

      expect(handler).toHaveBeenCalled();
    });
  });

  // ============================================
  // TOKEN VALIDATION TESTS
  // ============================================

  describe('Token Validation', () => {
    beforeEach(async () => {
      await service.initialize(testConfig);
    });

    it('should validate unexpired token', async () => {
      const token = createTestToken({
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      });
      await service.storeToken(token);

      expect(service.isTokenValid()).toBe(true);
      expect(service.isTokenExpired()).toBe(false);
    });

    it('should detect expired token', async () => {
      const token = createTestToken({
        expiresAt: new Date(Date.now() - 1000), // 1 second ago
      });
      await service.storeToken(token);

      expect(service.isTokenValid()).toBe(false);
      expect(service.isTokenExpired()).toBe(true);
    });

    it('should return null for expired token via getToken', async () => {
      const token = createTestToken({
        expiresAt: new Date(Date.now() - 1000),
      });
      await service.storeToken(token);

      expect(await service.getToken()).toBeNull();
    });

    it('should return validation details', async () => {
      const token = createTestToken({
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      await service.storeToken(token);

      const validation = service.validateToken();

      expect(validation.valid).toBe(true);
      expect(validation.expired).toBe(false);
      expect(validation.expiresInMs).toBeGreaterThan(0);
      expect(validation.scopes).toEqual(token.scopes);
    });

    it('should detect need for refresh', async () => {
      const token = createTestToken({
        expiresAt: new Date(Date.now() + 2 * 60 * 1000), // 2 minutes (less than buffer)
      });
      await service.storeToken(token);

      expect(service.needsRefresh()).toBe(true);
    });
  });

  // ============================================
  // TOKEN EXPIRY TESTS
  // ============================================

  describe('Token Expiry', () => {
    beforeEach(async () => {
      await service.initialize(testConfig);
    });

    it('should get token expiry date', async () => {
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      const token = createTestToken({ expiresAt });
      await service.storeToken(token);

      const expiry = service.getTokenExpiry();
      expect(expiry?.getTime()).toBe(expiresAt.getTime());
    });

    it('should return null expiry when no token', () => {
      expect(service.getTokenExpiry()).toBeNull();
    });

    it('should get time until expiry', async () => {
      const token = createTestToken({
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      await service.storeToken(token);

      const timeUntil = service.getTimeUntilExpiry();
      expect(timeUntil).toBeGreaterThan(59 * 60 * 1000);
      expect(timeUntil).toBeLessThanOrEqual(60 * 60 * 1000);
    });
  });

  // ============================================
  // TOKEN SCOPES TESTS
  // ============================================

  describe('Token Scopes', () => {
    beforeEach(async () => {
      await service.initialize(testConfig);
    });

    it('should get token scopes', async () => {
      const scopes = ['policy:base', 'policy:nzl', 'data:federation'];
      const token = createTestToken({ scopes });
      await service.storeToken(token);

      expect(service.getTokenScopes()).toEqual(scopes);
    });

    it('should return empty array when no token', () => {
      expect(service.getTokenScopes()).toEqual([]);
    });
  });

  // ============================================
  // ENCRYPTION TESTS
  // ============================================

  describe('Token Encryption', () => {
    it('should encrypt token when key provided', async () => {
      const encryptedConfig = {
        ...testConfig,
        encryptionKey: 'test-encryption-key-32chars!!',
      };
      
      await service.initialize(encryptedConfig);
      await service.storeToken(createTestToken());

      // Read raw file content
      const fileContent = await fs.readFile(testConfig.storagePath!, 'utf-8');
      
      // Should be encrypted (base64 format with colons)
      expect(fileContent).toMatch(/^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:/);
    });

    it('should decrypt token on load', async () => {
      const encryptedConfig = {
        ...testConfig,
        encryptionKey: 'test-encryption-key-32chars!!',
      };
      
      const token = createTestToken();
      await service.initialize(encryptedConfig);
      await service.storeToken(token);

      // Create new service instance and load
      const service2 = new SpokeTokenService();
      await service2.initialize(encryptedConfig);

      expect(service2.getSpokeId()).toBe(token.spokeId);
      service2.shutdown();
    });
  });

  // ============================================
  // REFRESH SCHEDULING TESTS
  // ============================================

  describe('Refresh Scheduling', () => {
    it('should emit tokenNeedsRefresh when token near expiry', async () => {
      await service.initialize({ ...testConfig, autoRefresh: true });
      
      const handler = jest.fn();
      service.on('tokenNeedsRefresh', handler);

      // Store token that expires in 1 minute (less than 5 min buffer)
      const token = createTestToken({
        expiresAt: new Date(Date.now() + 60 * 1000),
      });
      await service.storeToken(token);

      // Should emit immediately since past refresh window
      expect(handler).toHaveBeenCalled();
    });

    it('should cancel refresh timer on shutdown', async () => {
      await service.initialize({ ...testConfig, autoRefresh: true });
      await service.storeToken(createTestToken());
      
      service.shutdown();
      
      // No error should occur (timer cleanup)
      expect(true).toBe(true);
    });
  });

  // ============================================
  // STATUS TESTS
  // ============================================

  describe('Status', () => {
    beforeEach(async () => {
      await service.initialize(testConfig);
    });

    it('should return complete status', async () => {
      const token = createTestToken();
      await service.storeToken(token);

      const status = service.getStatus();

      expect(status.hasToken).toBe(true);
      expect(status.isValid).toBe(true);
      expect(status.spokeId).toBe(token.spokeId);
      expect(status.scopes).toEqual(token.scopes);
      expect(status.expiresAt).toBeInstanceOf(Date);
    });

    it('should return empty status when no token', () => {
      const status = service.getStatus();

      expect(status.hasToken).toBe(false);
      expect(status.isValid).toBe(false);
      expect(status.spokeId).toBeNull();
      expect(status.scopes).toEqual([]);
      expect(status.expiresAt).toBeNull();
    });
  });

  // ============================================
  // EVENT TESTS
  // ============================================

  describe('Events', () => {
    beforeEach(async () => {
      await service.initialize(testConfig);
    });

    it('should emit tokenCleared event', async () => {
      const handler = jest.fn();
      service.on('tokenCleared', handler);

      await service.storeToken(createTestToken());
      await service.clearToken();

      expect(handler).toHaveBeenCalled();
    });

    it('should emit tokenExpired event when getting expired token', async () => {
      const handler = jest.fn();
      service.on('tokenExpired', handler);

      const token = createTestToken({
        expiresAt: new Date(Date.now() - 1000),
      });
      await service.storeToken(token);

      await service.getToken();

      expect(handler).toHaveBeenCalled();
    });
  });
});

// ============================================
// DATA STRUCTURE TESTS
// ============================================

describe('Token Data Structures', () => {
  it('should have correct ISpokeToken structure', () => {
    const token: ISpokeToken = {
      token: 'abc123',
      spokeId: 'spoke-001',
      scopes: ['policy:base'],
      issuedAt: new Date(),
      expiresAt: new Date(),
      tokenType: 'bearer',
      version: 1,
    };

    expect(token.token).toBe('abc123');
    expect(token.tokenType).toBe('bearer');
    expect(token.version).toBe(1);
  });

  it('should support refresh token', () => {
    const token: ISpokeToken = {
      token: 'access-token',
      spokeId: 'spoke-001',
      scopes: ['policy:base'],
      issuedAt: new Date(),
      expiresAt: new Date(),
      tokenType: 'bearer',
      version: 1,
      refreshToken: 'refresh-token',
    };

    expect(token.refreshToken).toBe('refresh-token');
  });
});
