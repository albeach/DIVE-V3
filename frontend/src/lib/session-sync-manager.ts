/**
 * Session Sync Manager
 * 
 * Handles cross-tab synchronization using Broadcast Channel API
 * Ensures all tabs in same browser stay in sync for:
 * - Token refresh events
 * - Logout events
 * - Session status updates
 * - Warning modal states
 * 
 * Week 3.4+: Advanced Session Management
 */

export type SessionSyncEvent =
    | { type: 'TOKEN_REFRESHED', expiresAt: number, timestamp: number }
    | { type: 'SESSION_EXPIRED', timestamp: number }
    | { type: 'USER_LOGOUT', timestamp: number }
    | { type: 'WARNING_SHOWN', timestamp: number }
    | { type: 'WARNING_DISMISSED', timestamp: number }
    | { type: 'SESSION_EXTENDED', expiresAt: number, timestamp: number }
    | { type: 'HEARTBEAT_RESPONSE', expiresAt: number, isValid: boolean, timestamp: number };

export type SessionStatusCallback = (event: SessionSyncEvent) => void;

class SessionSyncManager {
    private channel: BroadcastChannel | null = null;
    private listeners: Set<SessionStatusCallback> = new Set();
    private isInitialized = false;
    private tabId: string;

    constructor() {
        // Generate unique tab ID for debugging
        this.tabId = `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        if (typeof window !== 'undefined') {
            this.initialize();
        }
    }

    private initialize() {
        if (this.isInitialized) return;

        try {
            // Create broadcast channel for cross-tab communication
            this.channel = new BroadcastChannel('dive-v3-session-sync');

            this.channel.onmessage = (event: MessageEvent<SessionSyncEvent>) => {
                console.log('[SessionSync]', this.tabId, 'Received:', event.data);

                // Notify all listeners
                this.listeners.forEach(callback => {
                    try {
                        callback(event.data);
                    } catch (error) {
                        console.error('[SessionSync] Listener error:', error);
                    }
                });
            };

            this.channel.onmessageerror = (error) => {
                console.error('[SessionSync] Message error:', error);
            };

            this.isInitialized = true;
            console.log('[SessionSync]', this.tabId, 'Initialized');

            // Announce this tab's presence
            this.broadcast({
                type: 'HEARTBEAT_RESPONSE',
                expiresAt: 0,
                isValid: true,
                timestamp: Date.now()
            });

        } catch (error) {
            console.error('[SessionSync] Failed to initialize:', error);
            // BroadcastChannel not supported or error - continue without sync
        }
    }

    /**
     * Subscribe to session sync events
     */
    subscribe(callback: SessionStatusCallback): () => void {
        this.listeners.add(callback);

        // Return unsubscribe function
        return () => {
            this.listeners.delete(callback);
        };
    }

    /**
     * Broadcast event to all other tabs
     */
    broadcast(event: SessionSyncEvent) {
        if (!this.channel) {
            console.warn('[SessionSync] Channel not available, cannot broadcast');
            return;
        }

        try {
            console.log('[SessionSync]', this.tabId, 'Broadcasting:', event.type);
            this.channel.postMessage(event);
        } catch (error) {
            console.error('[SessionSync] Failed to broadcast:', error);
        }
    }

    /**
     * Notify all tabs that token was refreshed
     */
    notifyTokenRefreshed(expiresAt: number) {
        this.broadcast({
            type: 'TOKEN_REFRESHED',
            expiresAt,
            timestamp: Date.now()
        });
    }

    /**
     * Notify all tabs that session expired
     */
    notifySessionExpired() {
        this.broadcast({
            type: 'SESSION_EXPIRED',
            timestamp: Date.now()
        });
    }

    /**
     * Notify all tabs that user logged out
     */
    notifyUserLogout() {
        this.broadcast({
            type: 'USER_LOGOUT',
            timestamp: Date.now()
        });
    }

    /**
     * Notify all tabs that warning was shown
     */
    notifyWarningShown() {
        this.broadcast({
            type: 'WARNING_SHOWN',
            timestamp: Date.now()
        });
    }

    /**
     * Notify all tabs that warning was dismissed
     */
    notifyWarningDismissed() {
        this.broadcast({
            type: 'WARNING_DISMISSED',
            timestamp: Date.now()
        });
    }

    /**
     * Notify all tabs that session was extended
     */
    notifySessionExtended(expiresAt: number) {
        this.broadcast({
            type: 'SESSION_EXTENDED',
            expiresAt,
            timestamp: Date.now()
        });
    }

    /**
     * Clean up resources
     */
    destroy() {
        if (this.channel) {
            console.log('[SessionSync]', this.tabId, 'Destroying');
            this.channel.close();
            this.channel = null;
        }
        this.listeners.clear();
        this.isInitialized = false;
    }

    /**
     * Get tab identifier for debugging
     */
    getTabId(): string {
        return this.tabId;
    }
}

// Singleton instance
let instance: SessionSyncManager | null = null;

export function getSessionSyncManager(): SessionSyncManager {
    if (!instance) {
        instance = new SessionSyncManager();
    }
    return instance;
}

// For testing: reset singleton
export function resetSessionSyncManager() {
    if (instance) {
        instance.destroy();
        instance = null;
    }
}
