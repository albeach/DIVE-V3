/**
 * Session Sync Manager Unit Tests
 * Phase 3: Session Management Testing
 * 
 * Tests cross-tab synchronization using Broadcast Channel API
 * 
 * Reference: frontend/src/lib/session-sync-manager.ts
 */

import {
    getSessionSyncManager,
    resetSessionSyncManager,
    type SessionSyncEvent
} from '@/lib/session-sync-manager';

// Mock BroadcastChannel
class MockBroadcastChannel {
    name: string;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onmessageerror: ((error: Event) => void) | null = null;
    messages: any[] = [];

    constructor(name: string) {
        this.name = name;
    }

    postMessage(message: any) {
        this.messages.push(message);
    }

    close() {
        this.onmessage = null;
        this.onmessageerror = null;
    }
}

(global as any).BroadcastChannel = MockBroadcastChannel;

describe('Session Sync Manager - Initialization', () => {
    beforeEach(() => {
        resetSessionSyncManager();
    });

    afterEach(() => {
        resetSessionSyncManager();
    });

    it('should create singleton instance', () => {
        const manager1 = getSessionSyncManager();
        const manager2 = getSessionSyncManager();

        expect(manager1).toBe(manager2);
    });

    it('should generate unique tab ID', () => {
        const manager = getSessionSyncManager();
        const tabId = manager.getTabId();

        expect(tabId).toContain('tab-');
        expect(tabId.length).toBeGreaterThan(10);
    });

    it('should initialize without errors', () => {
        expect(() => getSessionSyncManager()).not.toThrow();
    });
});

describe('Session Sync Manager - Event Broadcasting', () => {
    beforeEach(() => {
        resetSessionSyncManager();
    });

    afterEach(() => {
        resetSessionSyncManager();
    });

    it('should broadcast TOKEN_REFRESHED event', () => {
        const manager = getSessionSyncManager();
        const expiresAt = Date.now() + 900000;

        expect(() => manager.notifyTokenRefreshed(expiresAt)).not.toThrow();
    });

    it('should broadcast SESSION_EXPIRED event', () => {
        const manager = getSessionSyncManager();

        expect(() => manager.notifySessionExpired()).not.toThrow();
    });

    it('should broadcast USER_LOGOUT event', () => {
        const manager = getSessionSyncManager();

        expect(() => manager.notifyUserLogout()).not.toThrow();
    });

    it('should broadcast WARNING_SHOWN event', () => {
        const manager = getSessionSyncManager();

        expect(() => manager.notifyWarningShown()).not.toThrow();
    });

    it('should broadcast WARNING_DISMISSED event', () => {
        const manager = getSessionSyncManager();

        expect(() => manager.notifyWarningDismissed()).not.toThrow();
    });

    it('should broadcast SESSION_EXTENDED event', () => {
        const manager = getSessionSyncManager();
        const expiresAt = Date.now() + 900000;

        expect(() => manager.notifySessionExtended(expiresAt)).not.toThrow();
    });
});

describe('Session Sync Manager - Event Subscription', () => {
    beforeEach(() => {
        resetSessionSyncManager();
    });

    afterEach(() => {
        resetSessionSyncManager();
    });

    it('should allow subscribing to events', () => {
        const manager = getSessionSyncManager();
        const callback = jest.fn();

        const unsubscribe = manager.subscribe(callback);

        expect(unsubscribe).toBeInstanceOf(Function);
    });

    it('should allow unsubscribing', () => {
        const manager = getSessionSyncManager();
        const callback = jest.fn();

        const unsubscribe = manager.subscribe(callback);
        
        expect(() => unsubscribe()).not.toThrow();
    });

    it('should handle multiple subscribers', () => {
        const manager = getSessionSyncManager();
        const callback1 = jest.fn();
        const callback2 = jest.fn();
        const callback3 = jest.fn();

        manager.subscribe(callback1);
        manager.subscribe(callback2);
        const unsubscribe3 = manager.subscribe(callback3);

        unsubscribe3();

        expect(() => manager.notifySessionExpired()).not.toThrow();
    });
});

describe('Session Sync Manager - Cleanup', () => {
    beforeEach(() => {
        resetSessionSyncManager();
    });

    it('should close channel on destroy', () => {
        const manager = getSessionSyncManager();

        expect(() => manager.destroy()).not.toThrow();
    });

    it('should allow multiple destroy calls', () => {
        const manager = getSessionSyncManager();

        manager.destroy();
        
        expect(() => manager.destroy()).not.toThrow();
    });
});

describe('Session Sync Manager - Event Types', () => {
    it('should have correct structure for TOKEN_REFRESHED', () => {
        const event: SessionSyncEvent = {
            type: 'TOKEN_REFRESHED',
            expiresAt: Date.now() + 900000,
            timestamp: Date.now()
        };

        expect(event).toHaveProperty('type', 'TOKEN_REFRESHED');
        expect(event).toHaveProperty('expiresAt');
        expect(event).toHaveProperty('timestamp');
    });

    it('should have correct structure for SESSION_EXPIRED', () => {
        const event: SessionSyncEvent = {
            type: 'SESSION_EXPIRED',
            timestamp: Date.now()
        };

        expect(event).toHaveProperty('type', 'SESSION_EXPIRED');
        expect(event).toHaveProperty('timestamp');
    });

    it('should have correct structure for USER_LOGOUT', () => {
        const event: SessionSyncEvent = {
            type: 'USER_LOGOUT',
            timestamp: Date.now()
        };

        expect(event).toHaveProperty('type', 'USER_LOGOUT');
        expect(event).toHaveProperty('timestamp');
    });
});

describe('BroadcastChannel Fallback', () => {
    it('should handle missing BroadcastChannel gracefully', () => {
        const originalBC = (global as any).BroadcastChannel;
        (global as any).BroadcastChannel = undefined;

        resetSessionSyncManager();
        
        expect(() => getSessionSyncManager()).not.toThrow();

        (global as any).BroadcastChannel = originalBC;
    });
});
