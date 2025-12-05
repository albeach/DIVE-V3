/**
 * DIVE V3 - Spoke Connectivity Service
 *
 * Monitors connectivity to the Hub and manages online/offline transitions.
 * Implements exponential backoff for reconnection attempts and emits
 * events for state changes.
 *
 * Features:
 * - Hub health endpoint monitoring
 * - OPAL server connection monitoring
 * - Online/degraded/offline state management
 * - Exponential backoff with jitter
 * - Automatic recovery on reconnection
 *
 * @version 1.0.0
 * @date 2025-12-05
 */

import { EventEmitter } from 'events';
import http from 'http';
import https from 'https';
import { logger } from '../utils/logger';

// ============================================
// TYPES
// ============================================

export type ConnectivityMode = 'online' | 'degraded' | 'offline';

export interface IConnectivityState {
  mode: ConnectivityMode;
  hubReachable: boolean;
  opalConnected: boolean;
  lastSuccessfulContact: Date | null;
  lastAttempt: Date | null;
  consecutiveFailures: number;
  backoffMs: number;
  nextAttemptAt: Date | null;
}

export interface IConnectivityConfig {
  hubUrl: string;
  hubOpalUrl: string;
  checkIntervalMs: number;
  timeoutMs: number;
  maxBackoffMs: number;
  initialBackoffMs: number;
  backoffMultiplier: number;
  degradedThreshold: number;
  offlineThreshold: number;
  spokeToken?: string;
}

export interface IHealthCheckResult {
  success: boolean;
  latencyMs: number;
  statusCode?: number;
  error?: string;
}

// Default configuration
const DEFAULT_CONFIG: IConnectivityConfig = {
  hubUrl: 'https://hub.dive25.com',
  hubOpalUrl: 'https://hub.dive25.com:7002',
  checkIntervalMs: 30000, // 30 seconds
  timeoutMs: 10000, // 10 seconds
  maxBackoffMs: 300000, // 5 minutes
  initialBackoffMs: 1000, // 1 second
  backoffMultiplier: 2,
  degradedThreshold: 2, // Degraded after 2 failures
  offlineThreshold: 5, // Offline after 5 failures
};

// ============================================
// SPOKE CONNECTIVITY SERVICE
// ============================================

class SpokeConnectivityService extends EventEmitter {
  private config: IConnectivityConfig;
  private state: IConnectivityState;
  private checkInterval: NodeJS.Timeout | null = null;
  private running = false;

  constructor() {
    super();
    this.config = { ...DEFAULT_CONFIG };
    this.state = this.getInitialState();
  }

  private getInitialState(): IConnectivityState {
    return {
      mode: 'offline',
      hubReachable: false,
      opalConnected: false,
      lastSuccessfulContact: null,
      lastAttempt: null,
      consecutiveFailures: 0,
      backoffMs: DEFAULT_CONFIG.initialBackoffMs,
      nextAttemptAt: null,
    };
  }

  /**
   * Initialize the connectivity service
   */
  initialize(config: Partial<IConnectivityConfig>): void {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = this.getInitialState();

    logger.info('Spoke Connectivity Service initialized', {
      hubUrl: this.config.hubUrl,
      hubOpalUrl: this.config.hubOpalUrl,
      checkIntervalMs: this.config.checkIntervalMs,
    });
  }

  /**
   * Start connectivity monitoring
   */
  startMonitoring(): void {
    if (this.running) {
      logger.warn('Connectivity monitoring already running');
      return;
    }

    this.running = true;

    logger.info('Starting connectivity monitoring', {
      intervalMs: this.config.checkIntervalMs,
    });

    // Perform initial check
    this.performHealthCheck().catch((err) => {
      logger.warn('Initial health check failed', { error: err.message });
    });

    // Schedule periodic checks
    this.checkInterval = setInterval(() => {
      this.performHealthCheck().catch((err) => {
        logger.warn('Health check failed', { error: err.message });
      });
    }, this.config.checkIntervalMs);

    this.emit('monitoringStarted');
  }

  /**
   * Stop connectivity monitoring
   */
  stopMonitoring(): void {
    if (!this.running) {
      return;
    }

    this.running = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    logger.info('Connectivity monitoring stopped');
    this.emit('monitoringStopped');
  }

  // ============================================
  // HEALTH CHECKS
  // ============================================

  /**
   * Perform health check against Hub
   */
  async performHealthCheck(): Promise<void> {
    this.state.lastAttempt = new Date();

    // Check Hub API health
    const hubResult = await this.checkHubHealth();

    // Check OPAL server
    const opalResult = await this.checkOpalConnection();

    // Update state
    const wasOffline = this.state.mode === 'offline';

    this.state.hubReachable = hubResult.success;
    this.state.opalConnected = opalResult.success;

    if (hubResult.success && opalResult.success) {
      // Both healthy
      this.state.lastSuccessfulContact = new Date();
      this.state.consecutiveFailures = 0;
      this.state.backoffMs = this.config.initialBackoffMs;
      this.state.nextAttemptAt = null;
      this.transitionMode('online');

      if (wasOffline) {
        this.emit('recovered', {
          hubLatency: hubResult.latencyMs,
          opalLatency: opalResult.latencyMs,
        });
      }
    } else if (hubResult.success || opalResult.success) {
      // Partial connectivity
      this.state.consecutiveFailures++;
      this.transitionMode('degraded');
    } else {
      // Both failed
      this.state.consecutiveFailures++;
      this.updateBackoff();

      if (this.state.consecutiveFailures >= this.config.offlineThreshold) {
        this.transitionMode('offline');
      } else if (this.state.consecutiveFailures >= this.config.degradedThreshold) {
        this.transitionMode('degraded');
      }
    }

    this.emit('healthCheck', {
      hub: hubResult,
      opal: opalResult,
      state: this.getState(),
    });
  }

  /**
   * Check Hub health endpoint
   */
  async checkHubHealth(): Promise<IHealthCheckResult> {
    const url = `${this.config.hubUrl}/api/health`;
    return this.httpGet(url);
  }

  /**
   * Check OPAL server connection
   */
  async checkOpalConnection(): Promise<IHealthCheckResult> {
    const url = `${this.config.hubOpalUrl}/healthz`;
    return this.httpGet(url);
  }

  // ============================================
  // STATE MANAGEMENT
  // ============================================

  /**
   * Transition to a new connectivity mode
   */
  private transitionMode(newMode: ConnectivityMode): void {
    const previousMode = this.state.mode;

    if (previousMode === newMode) {
      return;
    }

    this.state.mode = newMode;

    logger.info('Connectivity mode changed', {
      from: previousMode,
      to: newMode,
      consecutiveFailures: this.state.consecutiveFailures,
    });

    this.emit('modeChange', {
      from: previousMode,
      to: newMode,
    });

    // Emit specific events for each mode
    switch (newMode) {
      case 'online':
        this.emit('online');
        break;
      case 'degraded':
        this.emit('degraded', {
          hubReachable: this.state.hubReachable,
          opalConnected: this.state.opalConnected,
        });
        break;
      case 'offline':
        this.emit('offline', {
          consecutiveFailures: this.state.consecutiveFailures,
          lastSuccessfulContact: this.state.lastSuccessfulContact,
        });
        break;
    }
  }

  /**
   * Update backoff time with exponential increase
   */
  private updateBackoff(): void {
    const jitter = Math.random() * 0.3 + 0.85; // 0.85-1.15
    this.state.backoffMs = Math.min(
      this.state.backoffMs * this.config.backoffMultiplier * jitter,
      this.config.maxBackoffMs
    );
    this.state.nextAttemptAt = new Date(Date.now() + this.state.backoffMs);
  }

  /**
   * Reset backoff after successful connection
   */
  resetBackoff(): void {
    this.state.backoffMs = this.config.initialBackoffMs;
    this.state.consecutiveFailures = 0;
    this.state.nextAttemptAt = null;
  }

  // ============================================
  // PUBLIC API
  // ============================================

  /**
   * Get current connectivity state
   */
  getState(): IConnectivityState {
    return { ...this.state };
  }

  /**
   * Check if spoke is online
   */
  isOnline(): boolean {
    return this.state.mode === 'online';
  }

  /**
   * Check if spoke is degraded (partial connectivity)
   */
  isDegraded(): boolean {
    return this.state.mode === 'degraded';
  }

  /**
   * Check if spoke is offline
   */
  isOffline(): boolean {
    return this.state.mode === 'offline';
  }

  /**
   * Force an immediate health check
   */
  async forceCheck(): Promise<IConnectivityState> {
    await this.performHealthCheck();
    return this.getState();
  }

  /**
   * Get time since last successful contact
   */
  getTimeSinceLastContact(): number | null {
    if (!this.state.lastSuccessfulContact) {
      return null;
    }
    return Date.now() - this.state.lastSuccessfulContact.getTime();
  }

  /**
   * Check if monitoring is running
   */
  isMonitoring(): boolean {
    return this.running;
  }

  // ============================================
  // HELPERS
  // ============================================

  /**
   * HTTP GET with timeout
   */
  private httpGet(url: string): Promise<IHealthCheckResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';
      const httpModule = isHttps ? https : http;

      const options: http.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname,
        method: 'GET',
        timeout: this.config.timeoutMs,
        headers: {},
      };

      // Add token if configured
      if (this.config.spokeToken) {
        (options.headers as Record<string, string>)['Authorization'] = `Bearer ${this.config.spokeToken}`;
      }

      // Allow self-signed certs in development
      if (isHttps && process.env.NODE_ENV !== 'production') {
        (options as https.RequestOptions).rejectUnauthorized = false;
      }

      const req = httpModule.request(options, (res) => {
        const latencyMs = Date.now() - startTime;
        let data = '';

        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          resolve({
            success: res.statusCode === 200,
            latencyMs,
            statusCode: res.statusCode,
          });
        });
      });

      req.on('error', (error) => {
        resolve({
          success: false,
          latencyMs: Date.now() - startTime,
          error: error.message,
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          success: false,
          latencyMs: this.config.timeoutMs,
          error: 'Request timeout',
        });
      });

      req.end();
    });
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const spokeConnectivity = new SpokeConnectivityService();

export default SpokeConnectivityService;

