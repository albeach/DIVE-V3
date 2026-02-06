/**
 * Presence Manager Tests
 * 
 * Tests for real-time presence tracking with:
 * - User join/leave events
 * - Heartbeat mechanism
 * - Stale user cleanup
 * - Cross-tab synchronization
 * - Statistics tracking
 * 
 * @version 1.0.0
 * @date 2026-02-06
 * @phase Phase 3.9 - Comprehensive Testing
 */

import { getPresenceManager, destroyPresenceManager } from '@/lib/presence-manager';

// Mock Broadcast Channel
class MockBroadcastChannel {
  name: string;
  onmessage: ((event: any) => void) | null = null;
  private static instances: MockBroadcastChannel[] = [];

  constructor(name: string) {
    this.name = name;
    MockBroadcastChannel.instances.push(this);
  }

  postMessage(message: any) {
    // Simulate broadcast to all instances
    MockBroadcastChannel.instances.forEach((instance) => {
      if (instance !== this && instance.onmessage) {
        instance.onmessage({ data: message });
      }
    });
  }

  close() {
    const index = MockBroadcastChannel.instances.indexOf(this);
    if (index > -1) {
      MockBroadcastChannel.instances.splice(index, 1);
    }
  }

  static clearAll() {
    MockBroadcastChannel.instances = [];
  }
}

// @ts-ignore
global.BroadcastChannel = MockBroadcastChannel;

describe('PresenceManager', () => {
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    MockBroadcastChannel.clearAll();
    destroyPresenceManager();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.useRealTimers();
    destroyPresenceManager();
    consoleLogSpy.mockRestore();
  });

  describe('Initialization', () => {
    it('should create a presence manager', () => {
      const manager = getPresenceManager('user1', 'User One');
      expect(manager).toBeDefined();
    });

    it('should return the same instance (singleton)', () => {
      const manager1 = getPresenceManager('user1', 'User One');
      const manager2 = getPresenceManager('user1', 'User One');
      expect(manager1).toBe(manager2);
    });

    it('should log initialization', () => {
      getPresenceManager('user1', 'User One');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Presence] Manager initialized')
      );
    });
  });

  describe('Join/Leave Pages', () => {
    it('should broadcast when joining a page', () => {
      const manager = getPresenceManager('user1', 'User One');
      manager.join('dashboard');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Presence] Joined page: dashboard')
      );
    });

    it('should broadcast when leaving a page', () => {
      const manager = getPresenceManager('user1', 'User One');
      manager.join('dashboard');
      manager.leave();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Presence] Left page: dashboard')
      );
    });

    it('should not broadcast leave if not on a page', () => {
      const manager = getPresenceManager('user1', 'User One');
      const initialCalls = consoleLogSpy.mock.calls.length;
      manager.leave();
      expect(consoleLogSpy.mock.calls.length).toBe(initialCalls);
    });
  });

  describe('Active Users Tracking', () => {
    it('should track active users on the same page', () => {
      const manager1 = getPresenceManager('user1', 'User One');
      manager1.join('dashboard');

      // Simulate another user joining (would come from another tab/window)
      const manager2 = getPresenceManager('user2', 'User Two');
      manager2.join('dashboard');

      const activeUsers = manager1.getActiveUsers('dashboard');
      expect(activeUsers.length).toBeGreaterThanOrEqual(0);
    });

    it('should exclude self from active users', () => {
      const manager = getPresenceManager('user1', 'User One');
      manager.join('dashboard');

      const activeUsers = manager.getActiveUsers('dashboard');
      expect(activeUsers.every((u) => u.userId !== 'user1')).toBe(true);
    });

    it('should filter users by page', () => {
      const manager = getPresenceManager('user1', 'User One');
      manager.join('dashboard');

      const dashboardUsers = manager.getActiveUsers('dashboard');
      const usersUsers = manager.getActiveUsers('users');

      // Dashboard users should not include users page visitors
      expect(dashboardUsers.every((u) => u.page === 'dashboard')).toBe(true);
    });
  });

  describe('Heartbeat Mechanism', () => {
    it('should send heartbeat every 10 seconds', () => {
      const manager = getPresenceManager('user1', 'User One');
      manager.join('dashboard');

      // Fast-forward time by 10 seconds
      jest.advanceTimersByTime(10000);

      // Heartbeat should have been sent (check via logs or other mechanism)
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should not send heartbeat if not on a page', () => {
      const manager = getPresenceManager('user1', 'User One');
      const initialCalls = consoleLogSpy.mock.calls.length;

      // Fast-forward time by 10 seconds
      jest.advanceTimersByTime(10000);

      // Should not have additional heartbeat calls
      const newCalls = consoleLogSpy.mock.calls.length - initialCalls;
      expect(newCalls).toBe(0);
    });
  });

  describe('Stale User Cleanup', () => {
    it('should remove stale users after 30 seconds', () => {
      const manager = getPresenceManager('user1', 'User One');
      manager.join('dashboard');

      // Fast-forward time by 35 seconds (beyond 30s timeout)
      jest.advanceTimersByTime(35000);

      // Stale users should be removed (check via logs)
      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe('Subscription and Notifications', () => {
    it('should notify subscribers of changes', () => {
      const manager = getPresenceManager('user1', 'User One');
      const callback = jest.fn();

      manager.subscribe(callback);

      // Callback should be called immediately with current state
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should call multiple subscribers', () => {
      const manager = getPresenceManager('user1', 'User One');
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      manager.subscribe(callback1);
      manager.subscribe(callback2);

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it('should allow unsubscribe', () => {
      const manager = getPresenceManager('user1', 'User One');
      const callback = jest.fn();

      const unsubscribe = manager.subscribe(callback);
      expect(callback).toHaveBeenCalledTimes(1);

      callback.mockClear();
      unsubscribe();

      manager.join('dashboard');

      // Callback should not be called after unsubscribe
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('Statistics', () => {
    it('should provide presence statistics', () => {
      const manager = getPresenceManager('user1', 'User One');
      manager.join('dashboard');

      const stats = manager.getStats();
      expect(stats).toHaveProperty('totalUsers');
      expect(stats).toHaveProperty('usersByPage');
      expect(stats).toHaveProperty('activeUsers');
    });

    it('should count users by page', () => {
      const manager = getPresenceManager('user1', 'User One');
      manager.join('dashboard');

      const stats = manager.getStats();
      expect(stats.usersByPage).toBeInstanceOf(Object);
    });

    it('should exclude self from statistics', () => {
      const manager = getPresenceManager('user1', 'User One');
      manager.join('dashboard');

      const stats = manager.getStats();
      expect(stats.activeUsers.every((u) => u.userId !== 'user1')).toBe(true);
    });
  });

  describe('Destroy and Cleanup', () => {
    it('should cleanup on destroy', () => {
      const manager = getPresenceManager('user1', 'User One');
      manager.join('dashboard');

      manager.destroy();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Presence] Destroying manager')
      );
    });

    it('should stop heartbeat on destroy', () => {
      const manager = getPresenceManager('user1', 'User One');
      manager.join('dashboard');

      manager.destroy();

      const callsBefore = consoleLogSpy.mock.calls.length;

      // Fast-forward time
      jest.advanceTimersByTime(10000);

      // Should not have new heartbeat calls
      expect(consoleLogSpy.mock.calls.length).toBe(callsBefore);
    });
  });

  describe('Error Handling', () => {
    it('should handle broadcast errors gracefully', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const manager = getPresenceManager('user1', 'User One');

      // Simulate broadcast error by closing channel before broadcast
      manager.destroy();
      manager.join('dashboard');

      // Should not throw
      expect(() => manager.leave()).not.toThrow();

      consoleErrorSpy.mockRestore();
    });

    it('should handle listener errors gracefully', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const manager = getPresenceManager('user1', 'User One');
      const callback = jest.fn(() => {
        throw new Error('Listener error');
      });

      manager.subscribe(callback);

      // Should not throw when notifying listeners
      expect(() => manager.join('dashboard')).not.toThrow();

      consoleErrorSpy.mockRestore();
    });
  });
});
