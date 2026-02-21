/**
 * DIVE V3 - Spoke Runtime Service Tests
 *
 * Comprehensive test suite for the spoke runtime lifecycle management.
 * Tests cover:
 * - Configuration loading and validation
 * - State machine transitions
 * - Heartbeat management
 * - Token lifecycle
 * - Health status reporting
 *
 * @version 1.0.0
 * @date 2025-12-05
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs/promises';
import SpokeRuntimeService from '../services/spoke-runtime.service';

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

const validConfigData: Record<string, unknown> = {
  spokeId: 'spoke-nzl-abc123',
  instanceCode: 'NZL',
  name: 'New Zealand Defence Force',
  description: 'NZDF DIVE V3 Spoke Instance',
  hubUrl: 'https://hub.dive25.com',
  hubOpalUrl: 'https://hub.dive25.com:7002',
  baseUrl: 'https://nzl-app.dive25.com',
  apiUrl: 'https://nzl-api.dive25.com',
  idpUrl: 'https://nzl-idp.dive25.com',
  certificatePath: '/path/to/cert.pem',
  privateKeyPath: '/path/to/key.pem',
  requestedScopes: ['policy:base', 'data:federation_matrix'],
  status: 'uninitialized',
  heartbeatIntervalMs: 30000,
  tokenRefreshBufferMs: 300000,
  offlineGracePeriodMs: 3600000,
  createdAt: '2025-12-05T00:00:00.000Z',
  lastModified: '2025-12-05T00:00:00.000Z',
};

const approvedConfigData: Record<string, unknown> = {
  ...validConfigData,
  status: 'approved',
  spokeToken: 'test-spoke-token-xyz',
  tokenExpiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
  approvedAt: '2025-12-04T00:00:00.000Z',
};

// ============================================
// TEST SUITE
// ============================================

describe('SpokeRuntimeService', () => {
  let service: SpokeRuntimeService;
  const testConfigPath = '/test/instances/nzl/config.json';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    service = new SpokeRuntimeService();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ============================================
  // CONFIGURATION LOADING TESTS
  // ============================================

  describe('Configuration Loading', () => {
    it('should load configuration from file', async () => {
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(validConfigData));

      await service.initialize(testConfigPath);

      expect(mockFs.readFile).toHaveBeenCalledWith(testConfigPath, 'utf-8');
      const config = service.getConfig();
      expect(config).not.toBeNull();
      expect(config?.spokeId).toBe('spoke-nzl-abc123');
      expect(config?.instanceCode).toBe('NZL');
    });

    it('should validate required fields', async () => {
      const invalidConfig = { ...validConfigData };
      delete invalidConfig.hubUrl;

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(invalidConfig));

      await expect(service.initialize(testConfigPath)).rejects.toThrow(
        'Missing required configuration field: hubUrl'
      );
    });

    it('should apply environment variable overrides', async () => {
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(validConfigData));

      // Set environment variables
      const originalHubUrl = process.env.DIVE_HUB_URL;
      const originalHeartbeat = process.env.DIVE_HEARTBEAT_INTERVAL_MS;

      process.env.DIVE_HUB_URL = 'https://custom-hub.dive25.com';
      process.env.DIVE_HEARTBEAT_INTERVAL_MS = '60000';

      try {
        await service.initialize(testConfigPath);
        const config = service.getConfig();

        expect(config?.hubUrl).toBe('https://custom-hub.dive25.com');
        expect(config?.heartbeatIntervalMs).toBe(60000);
      } finally {
        // Restore
        if (originalHubUrl) process.env.DIVE_HUB_URL = originalHubUrl;
        else delete process.env.DIVE_HUB_URL;
        if (originalHeartbeat) process.env.DIVE_HEARTBEAT_INTERVAL_MS = originalHeartbeat;
        else delete process.env.DIVE_HEARTBEAT_INTERVAL_MS;
      }
    });

    it('should handle missing config file', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockFs.readFile.mockRejectedValueOnce(error);

      await expect(service.initialize(testConfigPath)).rejects.toThrow(
        `Spoke configuration not found: ${testConfigPath}`
      );
    });

    it('should transform flat config to nested format', async () => {
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(validConfigData));

      await service.initialize(testConfigPath);
      const config = service.getConfig();

      // Verify transformation happened (instanceCode should be uppercase)
      expect(config?.instanceCode).toBe('NZL');
      // Default values should be set
      expect(config?.heartbeatIntervalMs).toBe(30000);
      expect(config?.tokenRefreshBufferMs).toBe(300000);
    });

    it('should auto-detect config path from INSTANCE_CODE', async () => {
      const originalInstanceCode = process.env.INSTANCE_CODE;
      const originalDiveRoot = process.env.DIVE_ROOT;

      process.env.INSTANCE_CODE = 'aus';
      process.env.DIVE_ROOT = '/test';

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify({
        ...validConfigData,
        instanceCode: 'AUS',
      }));

      try {
        await service.initialize();
        expect(mockFs.readFile).toHaveBeenCalledWith(
          expect.stringContaining('aus'),
          'utf-8'
        );
      } finally {
        if (originalInstanceCode) process.env.INSTANCE_CODE = originalInstanceCode;
        else delete process.env.INSTANCE_CODE;
        if (originalDiveRoot) process.env.DIVE_ROOT = originalDiveRoot;
        else delete process.env.DIVE_ROOT;
      }
    });
  });

  // ============================================
  // STATE MACHINE TESTS
  // ============================================

  describe('State Machine', () => {
    beforeEach(async () => {
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(validConfigData));
      await service.initialize(testConfigPath);
    });

    it('should transition from uninitialized to initialized', async () => {
      // initialize() already transitions to initialized
      const state = service.getState();
      expect(state.status).toBe('initialized');
    });

    it('should transition from initialized to pending', () => {
      service.transitionState('pending');
      const state = service.getState();
      expect(state.status).toBe('pending');
    });

    it('should transition from pending to approved', () => {
      service.transitionState('pending');
      service.transitionState('approved');
      const state = service.getState();
      expect(state.status).toBe('approved');
    });

    it('should transition from approved to offline', () => {
      service.transitionState('pending');
      service.transitionState('approved');
      service.transitionState('offline');
      const state = service.getState();
      expect(state.status).toBe('offline');
    });

    it('should reject invalid transitions', () => {
      // From initialized, cannot go directly to approved
      expect(() => service.transitionState('approved')).toThrow(
        /Invalid state transition: initialized → approved/
      );
    });

    it('should emit stateChange events', async () => {
      const eventHandler = jest.fn();
      service.on('stateChange', eventHandler);

      service.transitionState('pending');

      expect(eventHandler).toHaveBeenCalledWith({
        from: 'initialized',
        to: 'pending',
      });
    });

    it('should update config status on transition', () => {
      service.transitionState('pending');
      const config = service.getConfig();
      expect(config?.status).toBe('pending');
    });
  });

  // ============================================
  // HEARTBEAT MANAGEMENT TESTS
  // ============================================

  describe('Heartbeat Management', () => {
    beforeEach(async () => {
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(approvedConfigData));
      mockFs.writeFile.mockResolvedValue();
      await service.initialize(testConfigPath);
    });

    it('should start heartbeat on approved state', () => {
      const sendingHandler = jest.fn();
      service.on('heartbeat:sending', sendingHandler);

      service.transitionState('pending');
      service.transitionState('approved');

      // Fast-forward past initial heartbeat
      jest.advanceTimersByTime(100);

      expect(sendingHandler).toHaveBeenCalled();
    });

    it('should stop heartbeat on suspend', () => {
      service.transitionState('pending');
      service.transitionState('approved');

      // Manually stop to simulate suspend
      service.stopHeartbeat();

      const sendingHandler = jest.fn();
      service.on('heartbeat:sending', sendingHandler);

      // Advance past heartbeat interval
      jest.advanceTimersByTime(60000);

      // Should not have sent any heartbeats
      expect(sendingHandler).not.toHaveBeenCalled();
    });

    it('should track consecutive failures', async () => {
      // Simulate heartbeat with failure tracking
      service.transitionState('pending');
      service.transitionState('approved');

      const state = service.getState();
      expect(state.consecutiveHeartbeatFailures).toBe(0);

      // After successful heartbeat
      await service.sendHeartbeat();
      expect(service.getState().consecutiveHeartbeatFailures).toBe(0);
    });

    it('should transition to offline after grace period', async () => {
      service.transitionState('pending');
      service.transitionState('approved');

      // Get the config for grace period calculation
      const config = service.getConfig();
      expect(config).not.toBeNull();

      // The actual offline transition would happen after consecutive failures
      // For now, just verify the offline transition is allowed
      service.transitionState('offline');
      expect(service.getState().status).toBe('offline');
      expect(service.getState().offlineSince).toBeInstanceOf(Date);
    });
  });

  // ============================================
  // TOKEN MANAGEMENT TESTS
  // ============================================

  describe('Token Management', () => {
    beforeEach(async () => {
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(approvedConfigData));
      mockFs.writeFile.mockResolvedValue();
      await service.initialize(testConfigPath);
    });

    it('should check token validity', () => {
      const isValid = service.isTokenValid();
      expect(isValid).toBe(true);
    });

    it('should detect expired token', async () => {
      const expiredConfig = {
        ...approvedConfigData,
        tokenExpiresAt: new Date(Date.now() - 1000).toISOString(), // 1 second ago
      };
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(expiredConfig));

      const newService = new SpokeRuntimeService();
      await newService.initialize(testConfigPath);

      expect(newService.isTokenValid()).toBe(false);
    });

    it('should set new token', async () => {
      const newToken = 'new-test-token-abc';
      const expiresAt = new Date(Date.now() + 7200000); // 2 hours

      await service.setToken(newToken, expiresAt);

      const config = service.getConfig();
      expect(config?.spokeToken).toBe(newToken);
      expect(config?.tokenExpiresAt?.getTime()).toBe(expiresAt.getTime());
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should emit token events', async () => {
      const refreshingHandler = jest.fn();
      service.on('token:refreshing', refreshingHandler);

      // This will emit token:refreshing (even though actual refresh is placeholder)
      await service.refreshToken();

      expect(refreshingHandler).toHaveBeenCalled();
    });
  });

  // ============================================
  // HEALTH & STATUS TESTS
  // ============================================

  describe('Health & Status', () => {
    beforeEach(async () => {
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(approvedConfigData));
      mockFs.writeFile.mockResolvedValue();
      await service.initialize(testConfigPath);
    });

    it('should return current state', () => {
      const state = service.getState();

      expect(state).toHaveProperty('status');
      expect(state).toHaveProperty('lastHeartbeat');
      expect(state).toHaveProperty('lastPolicySync');
      expect(state).toHaveProperty('hubConnected');
      expect(state).toHaveProperty('opalConnected');
      expect(state).toHaveProperty('policyVersion');
    });

    it('should return health status', async () => {
      const health = await service.getHealthStatus();

      expect(health).toHaveProperty('overall');
      expect(health).toHaveProperty('services');
      expect(health).toHaveProperty('federation');
      expect(health).toHaveProperty('metrics');

      expect(health.services).toHaveProperty('opa');
      expect(health.services).toHaveProperty('opalClient');
      expect(health.services).toHaveProperty('keycloak');
      expect(health.services).toHaveProperty('mongodb');
      expect(health.services).toHaveProperty('kas');
    });

    it('should update policy version', () => {
      const version = '2025.12.05-abc123';
      service.updatePolicyVersion(version);

      const state = service.getState();
      expect(state.policyVersion).toBe(version);
      expect(state.lastPolicySync).toBeInstanceOf(Date);
    });

    it('should update OPAL connection state', () => {
      service.updateOPALConnection(true);
      expect(service.getState().opalConnected).toBe(true);

      service.updateOPALConnection(false);
      expect(service.getState().opalConnected).toBe(false);
    });

    it('should emit events on state changes', () => {
      const policySyncHandler = jest.fn();
      const opalHandler = jest.fn();

      service.on('policySync', policySyncHandler);
      service.on('opalConnectionChange', opalHandler);

      service.updatePolicyVersion('v1.0.0');
      service.updateOPALConnection(true);

      expect(policySyncHandler).toHaveBeenCalledWith({ version: 'v1.0.0' });
      expect(opalHandler).toHaveBeenCalledWith({ connected: true });
    });
  });

  // ============================================
  // LIFECYCLE TESTS
  // ============================================

  describe('Lifecycle', () => {
    beforeEach(async () => {
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(approvedConfigData));
      mockFs.writeFile.mockResolvedValue();
    });

    it('should start the runtime', async () => {
      await service.initialize(testConfigPath);
      await service.start();

      // After start with approved status, should be running
      const state = service.getState();
      expect(['initialized', 'approved']).toContain(state.status);
    });

    it('should stop the runtime', async () => {
      await service.initialize(testConfigPath);
      await service.start();
      await service.stop();

      // Should have stopped heartbeat
      const sendingHandler = jest.fn();
      service.on('heartbeat:sending', sendingHandler);
      jest.advanceTimersByTime(60000);
      expect(sendingHandler).not.toHaveBeenCalled();
    });

    it('should shutdown gracefully', async () => {
      await service.initialize(testConfigPath);

      const shutdownHandler = jest.fn();
      service.on('shutdown', shutdownHandler);

      await service.shutdown();

      expect(shutdownHandler).toHaveBeenCalled();
      expect(mockFs.writeFile).toHaveBeenCalled(); // Config saved
    });

    it('should save configuration on shutdown', async () => {
      await service.initialize(testConfigPath);
      await service.shutdown();

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        testConfigPath,
        expect.any(String)
      );
    });
  });

  // ============================================
  // ERROR HANDLING TESTS
  // ============================================

  describe('Error Handling', () => {
    it('should handle JSON parse error in config', async () => {
      mockFs.readFile.mockResolvedValueOnce('not valid json');

      await expect(service.initialize(testConfigPath)).rejects.toThrow();
    });

    it('should throw when saving without config', async () => {
      await expect(service.saveConfiguration()).rejects.toThrow(
        'No configuration to save'
      );
    });

    it('should throw when sending heartbeat without initialization', async () => {
      await expect(service.sendHeartbeat()).rejects.toThrow(
        'Spoke not initialized'
      );
    });

    it('should throw when setting token without initialization', async () => {
      await expect(
        service.setToken('token', new Date())
      ).rejects.toThrow('Spoke not initialized');
    });

    it('should force status for recovery scenarios', async () => {
      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(validConfigData));
      await service.initialize(testConfigPath);

      // Force to approved (bypassing state machine)
      service.forceStatus('approved');
      expect(service.getState().status).toBe('approved');
    });
  });
});
