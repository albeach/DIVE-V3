/**
 * DIVE V3 - Spoke Policy Cache Service Tests
 *
 * Tests for local policy caching and offline operation support.
 *
 * @version 1.0.0
 * @date 2025-12-05
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import fs from 'fs/promises';
import SpokePolicyCacheService, {
  IPolicyBundle,
  ICacheConfig,
} from '../services/spoke-policy-cache.service';

// Mock dependencies
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('fs/promises');
const mockFs = fs as jest.Mocked<typeof fs>;

// ============================================
// TEST DATA
// ============================================

const validPolicyBundle: IPolicyBundle = {
  version: '2025.12.05-abc123',
  timestamp: new Date().toISOString(),
  policies: [
    {
      path: 'dive/authorization',
      content: 'package dive.authorization\n\ndefault allow := false',
      hash: 'abc123',
    },
  ],
  data: [
    {
      path: 'federation_matrix',
      content: { USA: { FRA: true, GBR: true } },
      hash: 'def456',
    },
  ],
  metadata: {
    hubVersion: '2025.12.05',
    tenantId: 'spoke-nzl-001',
    scopes: ['policy:base', 'policy:fvey'],
    sourceHub: 'hub.dive25.com',
  },
};

const testConfig: ICacheConfig = {
  cachePath: '/test/cache/policies',
  maxCacheAgeMs: 24 * 60 * 60 * 1000,
  opaUrl: 'http://localhost:8181',
  verifySignatures: false,
};

// ============================================
// TEST SUITE
// ============================================

describe('SpokePolicyCacheService', () => {
  let service: SpokePolicyCacheService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SpokePolicyCacheService();

    // Default mocks
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue();
    mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });
    mockFs.unlink.mockResolvedValue();
  });

  // ============================================
  // INITIALIZATION TESTS
  // ============================================

  describe('Initialization', () => {
    it('should initialize with config', async () => {
      await service.initialize(testConfig);

      expect(mockFs.mkdir).toHaveBeenCalledWith(testConfig.cachePath, { recursive: true });
    });

    it('should create cache directory', async () => {
      await service.initialize(testConfig);

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        '/test/cache/policies',
        expect.objectContaining({ recursive: true })
      );
    });

    it('should load CA certificate if path provided', async () => {
      const configWithCert: ICacheConfig = {
        ...testConfig,
        caCertPath: '/path/to/ca.crt',
      };

      mockFs.readFile.mockResolvedValueOnce('-----BEGIN CERTIFICATE-----');

      await service.initialize(configWithCert);

      expect(mockFs.readFile).toHaveBeenCalledWith('/path/to/ca.crt', 'utf-8');
    });

    it('should handle missing CA certificate gracefully', async () => {
      const configWithCert: ICacheConfig = {
        ...testConfig,
        caCertPath: '/path/to/missing.crt',
      };

      mockFs.readFile.mockRejectedValueOnce(new Error('File not found'));

      // Should not throw
      await expect(service.initialize(configWithCert)).resolves.not.toThrow();
    });
  });

  // ============================================
  // CACHE OPERATIONS TESTS
  // ============================================

  describe('Cache Operations', () => {
    beforeEach(async () => {
      await service.initialize(testConfig);
    });

    it('should cache policy bundle', async () => {
      await service.cachePolicy(validPolicyBundle);

      expect(mockFs.writeFile).toHaveBeenCalledTimes(2); // bundle.json and metadata.json
    });

    it('should write bundle to correct path', async () => {
      await service.cachePolicy(validPolicyBundle);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '/test/cache/policies/bundle.json',
        expect.any(String)
      );
    });

    it('should write metadata to correct path', async () => {
      await service.cachePolicy(validPolicyBundle);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '/test/cache/policies/metadata.json',
        expect.any(String)
      );
    });

    it('should get cached policy', async () => {
      // First cache it
      await service.cachePolicy(validPolicyBundle);

      const cached = await service.getCachedPolicy();

      expect(cached).not.toBeNull();
      expect(cached?.version).toBe(validPolicyBundle.version);
    });

    it('should return null when no cache exists', async () => {
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });

      const cached = await service.getCachedPolicy();

      expect(cached).toBeNull();
    });

    it('should emit cached event', async () => {
      const handler = jest.fn();
      service.on('cached', handler);

      await service.cachePolicy(validPolicyBundle);

      expect(handler).toHaveBeenCalledWith({ version: validPolicyBundle.version });
    });
  });

  // ============================================
  // CACHE VALIDITY TESTS
  // ============================================

  describe('Cache Validity', () => {
    beforeEach(async () => {
      await service.initialize(testConfig);
    });

    it('should report cache as invalid when empty', () => {
      expect(service.isCacheValid()).toBe(false);
    });

    it('should report cache as valid after caching', async () => {
      await service.cachePolicy(validPolicyBundle);

      expect(service.isCacheValid()).toBe(true);
    });

    it('should return cache age', async () => {
      await service.cachePolicy(validPolicyBundle);

      const age = service.getCacheAge();

      expect(age).toBeLessThan(1000); // Should be very recent
    });

    it('should return Infinity age when no cache', () => {
      const age = service.getCacheAge();

      expect(age).toBe(Infinity);
    });
  });

  // ============================================
  // VERSIONING TESTS
  // ============================================

  describe('Versioning', () => {
    beforeEach(async () => {
      await service.initialize(testConfig);
    });

    it('should get current version', async () => {
      await service.cachePolicy(validPolicyBundle);

      const version = service.getCurrentVersion();

      expect(version).toBe(validPolicyBundle.version);
    });

    it('should return null version when no cache', () => {
      const version = service.getCurrentVersion();

      expect(version).toBeNull();
    });

    it('should check if version is current', async () => {
      await service.cachePolicy(validPolicyBundle);

      expect(service.isVersionCurrent(validPolicyBundle.version)).toBe(true);
      expect(service.isVersionCurrent('different-version')).toBe(false);
    });

    it('should get sync status', async () => {
      await service.cachePolicy(validPolicyBundle);

      expect(service.getSyncStatus(validPolicyBundle.version)).toBe('current');
      expect(service.getSyncStatus('newer-version')).toBe('behind');
    });

    it('should return unknown sync status when no cache', () => {
      expect(service.getSyncStatus('any-version')).toBe('unknown');
    });
  });

  // ============================================
  // CACHE STATE TESTS
  // ============================================

  describe('Cache State', () => {
    beforeEach(async () => {
      await service.initialize(testConfig);
    });

    it('should get cache state', async () => {
      const state = service.getCacheState();

      expect(state).toHaveProperty('hasCachedPolicy');
      expect(state).toHaveProperty('currentVersion');
      expect(state).toHaveProperty('lastCacheTime');
      expect(state).toHaveProperty('cacheAgeMs');
      expect(state).toHaveProperty('isValid');
      expect(state).toHaveProperty('signatureVerified');
    });

    it('should reflect cache state after caching', async () => {
      await service.cachePolicy(validPolicyBundle);

      const state = service.getCacheState();

      expect(state.hasCachedPolicy).toBe(true);
      expect(state.currentVersion).toBe(validPolicyBundle.version);
      expect(state.lastCacheTime).toBeInstanceOf(Date);
      expect(state.isValid).toBe(true);
    });

    it('should clear cache', async () => {
      await service.cachePolicy(validPolicyBundle);
      await service.clearCache();

      const state = service.getCacheState();

      expect(state.hasCachedPolicy).toBe(false);
      expect(state.currentVersion).toBeNull();
    });

    it('should emit cacheCleared event', async () => {
      const handler = jest.fn();
      service.on('cacheCleared', handler);

      await service.cachePolicy(validPolicyBundle);
      await service.clearCache();

      expect(handler).toHaveBeenCalled();
    });
  });

  // ============================================
  // HASH CALCULATION TESTS
  // ============================================

  describe('Hash Calculation', () => {
    beforeEach(async () => {
      await service.initialize(testConfig);
    });

    it('should calculate hash of content', () => {
      const content = 'test content';
      const hash = service.calculateHash(content);

      expect(hash).toBeTruthy();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64); // SHA256 hex
    });

    it('should produce consistent hashes', () => {
      const content = 'test content';
      const hash1 = service.calculateHash(content);
      const hash2 = service.calculateHash(content);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different content', () => {
      const hash1 = service.calculateHash('content 1');
      const hash2 = service.calculateHash('content 2');

      expect(hash1).not.toBe(hash2);
    });
  });

  // ============================================
  // SIGNATURE VERIFICATION TESTS
  // ============================================

  describe('Signature Verification', () => {
    beforeEach(async () => {
      await service.initialize(testConfig);
    });

    it('should return false for bundle without signature', async () => {
      const result = await service.verifyBundleSignature(validPolicyBundle);

      expect(result).toBe(false);
    });

    it('should return false when no CA certificate loaded', async () => {
      const bundleWithSig: IPolicyBundle = {
        ...validPolicyBundle,
        signature: {
          algorithm: 'SHA256',
          value: 'fakesignature',
          keyId: 'hub-001',
          signedAt: new Date().toISOString(),
        },
      };

      const result = await service.verifyBundleSignature(bundleWithSig);

      expect(result).toBe(false);
    });
  });

  // ============================================
  // ERROR HANDLING TESTS
  // ============================================

  describe('Error Handling', () => {
    it('should throw when caching without initialization', async () => {
      await expect(service.cachePolicy(validPolicyBundle)).rejects.toThrow(
        'Policy cache service not initialized'
      );
    });

    it('should handle file write errors', async () => {
      await service.initialize(testConfig);
      mockFs.writeFile.mockRejectedValue(new Error('Write failed'));

      await expect(service.cachePolicy(validPolicyBundle)).rejects.toThrow('Write failed');
    });

    it('should handle clear cache when files do not exist', async () => {
      await service.initialize(testConfig);
      mockFs.unlink.mockRejectedValue({ code: 'ENOENT' });

      // Should not throw
      await expect(service.clearCache()).resolves.not.toThrow();
    });
  });
});

// ============================================
// DATA STRUCTURE TESTS
// ============================================

describe('Policy Bundle Structure', () => {
  it('should have correct IPolicyBundle structure', () => {
    const bundle: IPolicyBundle = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      policies: [
        {
          path: 'test/policy',
          content: 'package test',
          hash: 'abc123',
        },
      ],
      metadata: {
        hubVersion: '1.0.0',
        tenantId: 'tenant-001',
        scopes: ['policy:base'],
        sourceHub: 'hub.example.com',
      },
    };

    expect(bundle.version).toBe('1.0.0');
    expect(bundle.policies).toHaveLength(1);
    expect(bundle.metadata.tenantId).toBe('tenant-001');
  });

  it('should support optional data files', () => {
    const bundle: IPolicyBundle = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      policies: [],
      data: [
        {
          path: 'test/data',
          content: { key: 'value' },
          hash: 'def456',
        },
      ],
      metadata: {
        hubVersion: '1.0.0',
        tenantId: 'tenant-001',
        scopes: [],
        sourceHub: 'hub.example.com',
      },
    };

    expect(bundle.data).toHaveLength(1);
    expect(bundle.data![0].content).toEqual({ key: 'value' });
  });

  it('should support optional signature', () => {
    const bundle: IPolicyBundle = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      policies: [],
      signature: {
        algorithm: 'SHA256withRSA',
        value: 'base64signature',
        keyId: 'key-001',
        signedAt: new Date().toISOString(),
      },
      metadata: {
        hubVersion: '1.0.0',
        tenantId: 'tenant-001',
        scopes: [],
        sourceHub: 'hub.example.com',
      },
    };

    expect(bundle.signature?.algorithm).toBe('SHA256withRSA');
    expect(bundle.signature?.keyId).toBe('key-001');
  });
});

