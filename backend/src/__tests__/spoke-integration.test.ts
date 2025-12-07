/**
 * DIVE V3 - Spoke Integration Tests
 *
 * Integration tests for spoke-side policy sync and offline operation.
 * Tests the interaction between:
 * - SpokePolicyCacheService
 * - SpokeConnectivityService
 * - SpokeOPALService
 *
 * @version 1.0.0
 * @date 2025-12-05
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs/promises';
import SpokePolicyCacheService, { IPolicyBundle } from '../services/spoke-policy-cache.service';
import SpokeConnectivityService from '../services/spoke-connectivity.service';
import SpokeOPALService from '../services/spoke-opal.service';

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

const testPolicyBundle: IPolicyBundle = {
  version: '2025.12.05-integration-test',
  timestamp: new Date().toISOString(),
  policies: [
    {
      path: 'dive/authorization',
      content: 'package dive.authorization\n\ndefault allow := false',
      hash: 'test-hash-001',
    },
    {
      path: 'dive/guardrails',
      content: 'package dive.guardrails\n\ndefault compliant := true',
      hash: 'test-hash-002',
    },
  ],
  data: [
    {
      path: 'federation_matrix',
      content: { USA: { FRA: true, GBR: true }, FRA: { USA: true } },
      hash: 'data-hash-001',
    },
  ],
  metadata: {
    hubVersion: '2025.12.05',
    tenantId: 'spoke-nzl-001',
    scopes: ['policy:base', 'policy:fvey', 'data:federation_matrix'],
    sourceHub: 'hub.dive25.com',
  },
};

// ============================================
// INTEGRATION TEST SUITE
// ============================================

describe('Spoke Integration Tests', () => {
  // ============================================
  // POLICY CACHE + CONNECTIVITY INTEGRATION
  // ============================================

  describe('Policy Cache + Connectivity', () => {
    let policyCache: SpokePolicyCacheService;
    let connectivity: SpokeConnectivityService;

    beforeEach(async () => {
      jest.clearAllMocks();
      
      policyCache = new SpokePolicyCacheService();
      connectivity = new SpokeConnectivityService();

      // Setup mocks
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue();
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });

      await policyCache.initialize({
        cachePath: '/test/cache',
        maxCacheAgeMs: 3600000,
        opaUrl: 'http://localhost:8181',
        verifySignatures: false,
      });

      connectivity.initialize({
        hubUrl: 'http://hub.test.com',
        hubOpalUrl: 'http://hub.test.com:7002',
        checkIntervalMs: 30000,
        timeoutMs: 5000,
        maxBackoffMs: 60000,
        initialBackoffMs: 1000,
        backoffMultiplier: 2,
        degradedThreshold: 2,
        offlineThreshold: 5,
      });
    });

    afterEach(() => {
      connectivity.stopMonitoring();
    });

    it('should cache policy when online', async () => {
      // Simulate being online (via direct state - in real scenario, health checks would update this)
      await policyCache.cachePolicy(testPolicyBundle);

      const cached = await policyCache.getCachedPolicy();
      expect(cached?.version).toBe(testPolicyBundle.version);
    });

    it('should report cache as fallback when offline', async () => {
      // Cache a policy first
      await policyCache.cachePolicy(testPolicyBundle);

      // Verify cache is available
      expect(policyCache.isCacheValid()).toBe(true);
      expect(policyCache.getCurrentVersion()).toBe(testPolicyBundle.version);

      // Connectivity reports offline (default state)
      expect(connectivity.isOffline()).toBe(true);

      // Cache should still be valid for fallback
      const state = policyCache.getCacheState();
      expect(state.hasCachedPolicy).toBe(true);
    });

    it('should track sync status relative to hub version', async () => {
      await policyCache.cachePolicy(testPolicyBundle);

      // Same version = current
      expect(policyCache.getSyncStatus(testPolicyBundle.version)).toBe('current');

      // Different version = behind
      expect(policyCache.getSyncStatus('2025.12.06-newer')).toBe('behind');
    });

    it('should emit events on cache operations', async () => {
      const cachedHandler = jest.fn();
      policyCache.on('cached', cachedHandler);

      await policyCache.cachePolicy(testPolicyBundle);

      expect(cachedHandler).toHaveBeenCalledWith({
        version: testPolicyBundle.version,
      });
    });

    it('should clear cache and update state', async () => {
      await policyCache.cachePolicy(testPolicyBundle);
      expect(policyCache.getCacheState().hasCachedPolicy).toBe(true);

      await policyCache.clearCache();
      expect(policyCache.getCacheState().hasCachedPolicy).toBe(false);
    });
  });

  // ============================================
  // OPAL + POLICY CACHE INTEGRATION
  // ============================================

  describe('OPAL + Policy Cache', () => {
    let opal: SpokeOPALService;
    let policyCache: SpokePolicyCacheService;

    beforeEach(async () => {
      jest.clearAllMocks();
      
      opal = new SpokeOPALService();
      policyCache = new SpokePolicyCacheService();

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue();
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });

      opal.initialize({
        opalClientUrl: 'http://localhost:7000',
        hubOpalServerUrl: 'http://hub.test.com:7002',
        spokeId: 'spoke-nzl-001',
        spokeToken: 'test-token',
        subscriptionId: 'sub-001',
        policyTopics: ['policy:base'],
        dataTopics: ['data:federation_matrix'],
        opaUrl: 'http://localhost:8181',
      });

      await policyCache.initialize({
        cachePath: '/test/cache',
        maxCacheAgeMs: 3600000,
        opaUrl: 'http://localhost:8181',
        verifySignatures: false,
      });
    });

    afterEach(() => {
      opal.stopPolling();
      opal.disconnect();
    });

    it('should coordinate policy version tracking', async () => {
      // Cache a policy
      await policyCache.cachePolicy(testPolicyBundle);
      
      // OPAL receives update
      opal.handlePolicyUpdate({
        version: testPolicyBundle.version,
        timestamp: new Date().toISOString(),
        transactionId: 'tx-001',
        changes: [],
      });

      // Both should report same version
      expect(policyCache.getCurrentVersion()).toBe(testPolicyBundle.version);
      expect(opal.getStatus().currentPolicyVersion).toBe(testPolicyBundle.version);
    });

    it('should handle policy update events', () => {
      const updateHandler = jest.fn();
      opal.on('policyUpdate', updateHandler);

      opal.handlePolicyUpdate({
        version: '2025.12.05-new',
        timestamp: new Date().toISOString(),
        transactionId: 'tx-002',
        changes: [
          { type: 'update', path: 'dive/authorization', hash: 'new-hash' },
        ],
      });

      expect(updateHandler).toHaveBeenCalled();
      expect(opal.getStatus().currentPolicyVersion).toBe('2025.12.05-new');
    });

    it('should track data sources configuration', async () => {
      await opal.configureDataSources();

      const status = opal.getStatus();
      expect(status.dataSourcesConfigured).toBeGreaterThan(0);
    });
  });

  // ============================================
  // FULL SPOKE FLOW INTEGRATION
  // ============================================

  describe('Full Spoke Flow', () => {
    let policyCache: SpokePolicyCacheService;
    let connectivity: SpokeConnectivityService;
    let opal: SpokeOPALService;

    beforeEach(async () => {
      jest.clearAllMocks();

      policyCache = new SpokePolicyCacheService();
      connectivity = new SpokeConnectivityService();
      opal = new SpokeOPALService();

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue();
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });

      await policyCache.initialize({
        cachePath: '/test/cache',
        maxCacheAgeMs: 3600000,
        opaUrl: 'http://localhost:8181',
        verifySignatures: false,
      });

      connectivity.initialize({
        hubUrl: 'http://hub.test.com',
        hubOpalUrl: 'http://hub.test.com:7002',
        checkIntervalMs: 30000,
        timeoutMs: 5000,
        maxBackoffMs: 60000,
        initialBackoffMs: 1000,
        backoffMultiplier: 2,
        degradedThreshold: 2,
        offlineThreshold: 5,
      });

      opal.initialize({
        opalClientUrl: 'http://localhost:7000',
        hubOpalServerUrl: 'http://hub.test.com:7002',
        spokeId: 'spoke-nzl-001',
        spokeToken: 'test-token',
        subscriptionId: 'sub-001',
        policyTopics: ['policy:base'],
        dataTopics: ['data:federation_matrix'],
        opaUrl: 'http://localhost:8181',
      });
    });

    afterEach(() => {
      connectivity.stopMonitoring();
      opal.stopPolling();
      opal.disconnect();
    });

    it('should handle offline scenario with cached policies', async () => {
      // 1. Cache policy when "online"
      await policyCache.cachePolicy(testPolicyBundle);
      expect(policyCache.isCacheValid()).toBe(true);

      // 2. Simulate going offline
      expect(connectivity.isOffline()).toBe(true);

      // 3. Verify cache is available
      const cached = await policyCache.getCachedPolicy();
      expect(cached).not.toBeNull();
      expect(cached?.version).toBe(testPolicyBundle.version);

      // 4. Get cache state
      const cacheState = policyCache.getCacheState();
      expect(cacheState.hasCachedPolicy).toBe(true);
      expect(cacheState.isValid).toBe(true);
    });

    it('should track version across all services', async () => {
      const version = '2025.12.05-unified';

      // Cache with specific version
      const bundleWithVersion: IPolicyBundle = {
        ...testPolicyBundle,
        version,
      };
      await policyCache.cachePolicy(bundleWithVersion);

      // OPAL reports same version
      opal.handlePolicyUpdate({
        version,
        timestamp: new Date().toISOString(),
        transactionId: 'tx-unified',
        changes: [],
      });

      // All services report same version
      expect(policyCache.getCurrentVersion()).toBe(version);
      expect(opal.getStatus().currentPolicyVersion).toBe(version);
    });

    it('should emit coordinated events', async () => {
      const cacheHandler = jest.fn();
      const opalHandler = jest.fn();
      const connectivityHandler = jest.fn();

      policyCache.on('cached', cacheHandler);
      opal.on('policyUpdate', opalHandler);
      connectivity.on('modeChange', connectivityHandler);

      // Trigger events
      await policyCache.cachePolicy(testPolicyBundle);
      opal.handlePolicyUpdate({
        version: testPolicyBundle.version,
        timestamp: new Date().toISOString(),
        transactionId: 'tx-coord',
        changes: [],
      });

      expect(cacheHandler).toHaveBeenCalled();
      expect(opalHandler).toHaveBeenCalled();
    });
  });
});

// ============================================
// OFFLINE RESILIENCE TESTS
// ============================================

describe('Offline Resilience', () => {
  let policyCache: SpokePolicyCacheService;

  beforeEach(async () => {
    jest.clearAllMocks();
    policyCache = new SpokePolicyCacheService();

    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue();
  });

  it('should handle cache expiry gracefully', async () => {
    // Initialize with very short cache TTL
    await policyCache.initialize({
      cachePath: '/test/cache',
      maxCacheAgeMs: 1, // 1ms - will expire immediately
      opaUrl: 'http://localhost:8181',
      verifySignatures: false,
    });

    await policyCache.cachePolicy(testPolicyBundle);

    // Wait for cache to "expire"
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Cache should exist but be invalid
    const cached = await policyCache.getCachedPolicy();
    expect(cached).not.toBeNull();
    expect(policyCache.isCacheValid()).toBe(false);
  });

  it('should emit warning on expired cache', async () => {
    await policyCache.initialize({
      cachePath: '/test/cache',
      maxCacheAgeMs: 1,
      opaUrl: 'http://localhost:8181',
      verifySignatures: false,
    });

    await policyCache.cachePolicy(testPolicyBundle);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const expiredHandler = jest.fn();
    policyCache.on('cacheExpired', expiredHandler);

    await policyCache.loadFromCache();

    expect(expiredHandler).toHaveBeenCalled();
  });

  it('should return false when loading from empty cache', async () => {
    await policyCache.initialize({
      cachePath: '/test/cache',
      maxCacheAgeMs: 3600000,
      opaUrl: 'http://localhost:8181',
      verifySignatures: false,
    });

    mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });

    const loaded = await policyCache.loadFromCache();
    expect(loaded).toBe(false);
  });
});



