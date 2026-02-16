/**
 * Presence Manager - Real-time user presence tracking
 * 
 * Tracks which admin users are viewing which pages in real-time using
 * Broadcast Channel API for cross-tab communication.
 * 
 * Features:
 * - Real-time presence updates (<1s latency)
 * - Cross-tab synchronization
 * - Automatic stale user removal (30s timeout)
 * - Heartbeat mechanism (10s interval)
 * - Memory-efficient
 * - TypeScript typed
 * 
 * @version 1.0.0
 * @date 2026-02-06
 * @phase Phase 3.5 - Real-Time Collaboration
 */

'use client';

export type PresenceEvent =
  | { type: 'USER_JOINED'; page: string; userId: string; userName: string; timestamp: number }
  | { type: 'USER_LEFT'; page: string; userId: string; timestamp: number }
  | { type: 'HEARTBEAT'; page: string; userId: string; timestamp: number };

export interface ActiveUser {
  userId: string;
  userName: string;
  page: string;
  lastSeen: number;
}

export interface PresenceStats {
  totalUsers: number;
  usersByPage: Record<string, number>;
  activeUsers: ActiveUser[];
}

/**
 * Presence Manager Class
 * 
 * Manages real-time presence tracking across browser tabs/windows.
 */
class PresenceManager {
  private channel: BroadcastChannel | null = null;
  private listeners: Set<(users: ActiveUser[]) => void> = new Set();
  private activeUsers: Map<string, ActiveUser> = new Map();
  private currentUserId: string;
  private currentUserName: string;
  private currentPage: string = '';
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isInitialized: boolean = false;
  private unloadHandler: (() => void) | null = null;

  constructor(userId: string, userName: string) {
    this.currentUserId = userId;
    this.currentUserName = userName;

    if (typeof window !== 'undefined') {
      this.initialize();
    }
  }

  /**
   * Initialize the presence manager
   */
  private initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      this.channel = new BroadcastChannel('dive-v3-presence');

      this.channel.onmessage = (event: MessageEvent<PresenceEvent>) => {
        this.handlePresenceEvent(event.data);
      };

      // Start heartbeat (every 10s)
      this.startHeartbeat();

      // Start cleanup (every 5s - check for stale users)
      this.startCleanup();

      // Cleanup on page unload
      if (typeof window !== 'undefined') {
        this.unloadHandler = () => this.leave();
        window.addEventListener('beforeunload', this.unloadHandler);
      }

      this.isInitialized = true;

      console.log('[Presence] Manager initialized for user:', this.currentUserId);
    } catch (error) {
      console.error('[Presence] Failed to initialize:', error);
    }
  }

  /**
   * Join a page (broadcast presence)
   */
  join(page: string) {
    this.currentPage = page;
    this.broadcast({
      type: 'USER_JOINED',
      page,
      userId: this.currentUserId,
      userName: this.currentUserName,
      timestamp: Date.now(),
    });

    console.log('[Presence] Joined page:', page);
  }

  /**
   * Leave current page (broadcast departure)
   */
  leave() {
    if (this.currentPage) {
      this.broadcast({
        type: 'USER_LEFT',
        page: this.currentPage,
        userId: this.currentUserId,
        timestamp: Date.now(),
      });

      console.log('[Presence] Left page:', this.currentPage);
      this.currentPage = '';
    }
  }

  /**
   * Start heartbeat interval
   */
  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.currentPage) {
        this.broadcast({
          type: 'HEARTBEAT',
          page: this.currentPage,
          userId: this.currentUserId,
          timestamp: Date.now(),
        });
      }
    }, 10000); // Every 10 seconds
  }

  /**
   * Start cleanup interval (remove stale users)
   */
  private startCleanup() {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      let changed = false;

      for (const [key, user] of this.activeUsers.entries()) {
        // Remove users who haven't sent a heartbeat in 30s
        if (now - user.lastSeen > 30000) {
          this.activeUsers.delete(key);
          changed = true;
          console.log('[Presence] Removed stale user:', user.userName);
        }
      }

      if (changed) {
        this.notifyListeners();
      }
    }, 5000); // Every 5 seconds
  }

  /**
   * Handle incoming presence events
   */
  private handlePresenceEvent(event: PresenceEvent) {
    const key = `${event.page}-${event.userId}`;

    switch (event.type) {
      case 'USER_JOINED':
      case 'HEARTBEAT':
        this.activeUsers.set(key, {
          userId: event.userId,
          userName: (event as Extract<PresenceEvent, { type: 'USER_JOINED' }>).userName || event.userId,
          page: event.page,
          lastSeen: event.timestamp,
        });
        this.notifyListeners();
        break;

      case 'USER_LEFT':
        this.activeUsers.delete(key);
        this.notifyListeners();
        break;
    }
  }

  /**
   * Get active users for a specific page
   */
  getActiveUsers(page: string): ActiveUser[] {
    return Array.from(this.activeUsers.values())
      .filter((user) => user.page === page)
      .filter((user) => user.userId !== this.currentUserId); // Exclude self
  }

  /**
   * Get all active users
   */
  getAllActiveUsers(): ActiveUser[] {
    return Array.from(this.activeUsers.values()).filter(
      (user) => user.userId !== this.currentUserId
    );
  }

  /**
   * Get presence statistics
   */
  getStats(): PresenceStats {
    const activeUsers = this.getAllActiveUsers();
    const usersByPage: Record<string, number> = {};

    for (const user of activeUsers) {
      usersByPage[user.page] = (usersByPage[user.page] || 0) + 1;
    }

    return {
      totalUsers: activeUsers.length,
      usersByPage,
      activeUsers,
    };
  }

  /**
   * Subscribe to presence updates
   */
  subscribe(callback: (users: ActiveUser[]) => void): () => void {
    this.listeners.add(callback);

    // Immediately call with current state
    callback(this.getAllActiveUsers());

    return () => this.listeners.delete(callback);
  }

  /**
   * Broadcast a presence event
   */
  private broadcast(event: PresenceEvent) {
    if (this.channel) {
      try {
        this.channel.postMessage(event);
      } catch (error) {
        console.error('[Presence] Failed to broadcast:', error);
      }
    }
  }

  /**
   * Notify all listeners of presence changes
   */
  private notifyListeners() {
    const users = this.getAllActiveUsers();
    this.listeners.forEach((callback) => {
      try {
        callback(users);
      } catch (error) {
        console.error('[Presence] Listener error:', error);
      }
    });
  }

  /**
   * Destroy the presence manager
   */
  destroy() {
    console.log('[Presence] Destroying manager');

    // Stop intervals
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Remove beforeunload listener
    if (typeof window !== 'undefined' && this.unloadHandler) {
      window.removeEventListener('beforeunload', this.unloadHandler);
      this.unloadHandler = null;
    }

    // Leave current page
    this.leave();

    // Close channel
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }

    // Clear state
    this.activeUsers.clear();
    this.listeners.clear();
    this.isInitialized = false;
  }
}

// Singleton instance
let instance: PresenceManager | null = null;

/**
 * Get or create the presence manager singleton
 */
export function getPresenceManager(userId: string, userName: string): PresenceManager {
  if (!instance) {
    instance = new PresenceManager(userId, userName);
  }
  return instance;
}

/**
 * Destroy the presence manager singleton
 */
export function destroyPresenceManager() {
  if (instance) {
    instance.destroy();
    instance = null;
  }
}
