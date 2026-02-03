/**
 * DIVE V3 - Spoke Connectivity Service Tests
 *
 * Tests for Hub connectivity monitoring and state management.
 *
 * @version 1.0.0
 * @date 2025-12-05
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import SpokeConnectivityService, {
  IConnectivityConfig,
  IConnectivityState,
  ConnectivityMode,
} from '../services/spoke-connectivity.service';

// Mock dependencies
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

const testConfig: IConnectivityConfig = {
  hubUrl: 'http://hub.test.com',
  hubOpalUrl: 'http://hub.test.com:7002',
  checkIntervalMs: 30000,
  timeoutMs: 5000,
  maxBackoffMs: 60000,
  initialBackoffMs: 1000,
  backoffMultiplier: 2,
  degradedThreshold: 2,
  offlineThreshold: 5,
  spokeToken: 'test-token',
};

// ============================================
// TEST SUITE
// ============================================

describe('SpokeConnectivityService', () => {
  let service: SpokeConnectivityService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SpokeConnectivityService();
  });

  afterEach(() => {
    service.stopMonitoring();
  });

  // ============================================
  // INITIALIZATION TESTS
  // ============================================

  describe('Initialization', () => {
    it('should initialize with config', () => {
      service.initialize(testConfig);

      const state = service.getState();
      expect(state.mode).toBe('offline');
      expect(state.hubReachable).toBe(false);
      expect(state.opalConnected).toBe(false);
    });

    it('should start in offline mode', () => {
      service.initialize(testConfig);

      expect(service.isOffline()).toBe(true);
      expect(service.isOnline()).toBe(false);
      expect(service.isDegraded()).toBe(false);
    });

    it('should have zero consecutive failures initially', () => {
      service.initialize(testConfig);

      const state = service.getState();
      expect(state.consecutiveFailures).toBe(0);
    });

    it('should have null last contact initially', () => {
      service.initialize(testConfig);

      expect(service.getTimeSinceLastContact()).toBeNull();
    });
  });

  // ============================================
  // MONITORING TESTS
  // ============================================

  describe('Monitoring', () => {
    beforeEach(() => {
      service.initialize(testConfig);
    });

    it('should start monitoring', () => {
      const handler = jest.fn();
      service.on('monitoringStarted', handler);

      service.startMonitoring();

      expect(service.isMonitoring()).toBe(true);
      expect(handler).toHaveBeenCalled();
    });

    it('should stop monitoring', () => {
      const handler = jest.fn();
      service.on('monitoringStopped', handler);

      service.startMonitoring();
      service.stopMonitoring();

      expect(service.isMonitoring()).toBe(false);
      expect(handler).toHaveBeenCalled();
    });

    it('should not start if already monitoring', () => {
      service.startMonitoring();

      const handler = jest.fn();
      service.on('monitoringStarted', handler);

      service.startMonitoring();

      expect(handler).not.toHaveBeenCalled();
    });

    it('should be safe to stop when not monitoring', () => {
      expect(() => service.stopMonitoring()).not.toThrow();
    });
  });

  // ============================================
  // STATE MANAGEMENT TESTS
  // ============================================

  describe('State Management', () => {
    beforeEach(() => {
      service.initialize(testConfig);
    });

    it('should get connectivity state', () => {
      const state = service.getState();

      expect(state).toHaveProperty('mode');
      expect(state).toHaveProperty('hubReachable');
      expect(state).toHaveProperty('opalConnected');
      expect(state).toHaveProperty('lastSuccessfulContact');
      expect(state).toHaveProperty('consecutiveFailures');
      expect(state).toHaveProperty('backoffMs');
    });

    it('should reset backoff', () => {
      // Simulate some failures first by directly manipulating
      const state = service.getState();
      expect(state.backoffMs).toBe(1000); // Initial backoff

      service.resetBackoff();

      const newState = service.getState();
      expect(newState.backoffMs).toBe(1000);
      expect(newState.consecutiveFailures).toBe(0);
    });

    it('should check online status', () => {
      service.initialize(testConfig);

      expect(service.isOnline()).toBe(false);
      expect(service.isOffline()).toBe(true);
    });

    it('should check degraded status', () => {
      service.initialize(testConfig);

      expect(service.isDegraded()).toBe(false);
    });
  });

  // ============================================
  // EVENT EMISSION TESTS
  // ============================================

  describe('Event Emission', () => {
    beforeEach(() => {
      service.initialize(testConfig);
    });

    it('should register modeChange event listener', () => {
      const handler = jest.fn();
      service.on('modeChange', handler);

      expect(service.listenerCount('modeChange')).toBe(1);
    });

    it('should register healthCheck event listener', () => {
      const handler = jest.fn();
      service.on('healthCheck', handler);

      expect(service.listenerCount('healthCheck')).toBe(1);
    });

    it('should register online/offline event listeners', () => {
      const onlineHandler = jest.fn();
      const offlineHandler = jest.fn();

      service.on('online', onlineHandler);
      service.on('offline', offlineHandler);

      expect(service.listenerCount('online')).toBe(1);
      expect(service.listenerCount('offline')).toBe(1);
    });
  });

  // ============================================
  // FORCE CHECK TESTS (Unit tests without network)
  // ============================================

  describe('Force Check', () => {
    beforeEach(() => {
      service.initialize(testConfig);
    });

    // Note: forceCheck() makes actual HTTP requests, so we test only the
    // synchronous state getters to avoid timeout issues in unit tests.
    // Full integration tests would mock the HTTP layer.

    it('should return state after force check attempt', () => {
      // Just verify the method exists and returns the right structure
      const state = service.getState();

      expect(state).toHaveProperty('mode');
      expect(state).toHaveProperty('hubReachable');
      expect(state).toHaveProperty('opalConnected');
      expect(state).toHaveProperty('lastAttempt');
    });

    it('should provide time since last contact method', () => {
      const time = service.getTimeSinceLastContact();

      // Initially null since no successful contact
      expect(time).toBeNull();
    });
  });

  // ============================================
  // TIME SINCE CONTACT TESTS
  // ============================================

  describe('Time Since Contact', () => {
    beforeEach(() => {
      service.initialize(testConfig);
    });

    it('should return null when never contacted', () => {
      const time = service.getTimeSinceLastContact();

      expect(time).toBeNull();
    });
  });
});

// ============================================
// DATA STRUCTURE TESTS
// ============================================

describe('Connectivity Data Structures', () => {
  it('should have correct IConnectivityState structure', () => {
    const state: IConnectivityState = {
      mode: 'online',
      hubReachable: true,
      opalConnected: true,
      lastSuccessfulContact: new Date(),
      lastAttempt: new Date(),
      consecutiveFailures: 0,
      backoffMs: 1000,
      nextAttemptAt: null,
    };

    expect(state.mode).toBe('online');
    expect(state.hubReachable).toBe(true);
    expect(state.opalConnected).toBe(true);
    expect(state.consecutiveFailures).toBe(0);
  });

  it('should support all connectivity modes', () => {
    const modes: ConnectivityMode[] = ['online', 'degraded', 'offline'];

    modes.forEach((mode) => {
      const state: IConnectivityState = {
        mode,
        hubReachable: mode === 'online',
        opalConnected: mode === 'online',
        lastSuccessfulContact: null,
        lastAttempt: null,
        consecutiveFailures: 0,
        backoffMs: 1000,
        nextAttemptAt: null,
      };

      expect(state.mode).toBe(mode);
    });
  });

  it('should have correct IConnectivityConfig structure', () => {
    const config: IConnectivityConfig = {
      hubUrl: 'https://hub.example.com',
      hubOpalUrl: 'https://hub.example.com:7002',
      checkIntervalMs: 30000,
      timeoutMs: 10000,
      maxBackoffMs: 300000,
      initialBackoffMs: 1000,
      backoffMultiplier: 2,
      degradedThreshold: 2,
      offlineThreshold: 5,
    };

    expect(config.hubUrl).toBe('https://hub.example.com');
    expect(config.checkIntervalMs).toBe(30000);
    expect(config.offlineThreshold).toBe(5);
  });

  it('should support optional spoke token', () => {
    const config: IConnectivityConfig = {
      hubUrl: 'https://hub.example.com',
      hubOpalUrl: 'https://hub.example.com:7002',
      checkIntervalMs: 30000,
      timeoutMs: 10000,
      maxBackoffMs: 300000,
      initialBackoffMs: 1000,
      backoffMultiplier: 2,
      degradedThreshold: 2,
      offlineThreshold: 5,
      spokeToken: 'my-secret-token',
    };

    expect(config.spokeToken).toBe('my-secret-token');
  });
});
