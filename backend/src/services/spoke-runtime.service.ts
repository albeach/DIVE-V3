/**
 * DIVE V3 - Spoke Runtime Service
 *
 * Core service managing spoke instance lifecycle, Hub communication,
 * and coordination between spoke components.
 *
 * Responsibilities:
 * - Load and validate spoke configuration
 * - Manage spoke lifecycle state machine
 * - Coordinate heartbeat, policy sync, and token refresh
 * - Handle graceful degradation when Hub unreachable
 *
 * @version 1.0.0
 * @date 2025-12-05
 */

import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger';

// ============================================
// TYPES
// ============================================

export type SpokeStatus =
  | 'uninitialized'
  | 'initialized'
  | 'pending'
  | 'approved'
  | 'suspended'
  | 'offline';

export interface ISpokeRuntimeConfig {
  // Identity
  spokeId: string;
  instanceCode: string;
  name: string;
  description?: string;

  // URLs
  hubUrl: string;
  hubOpalUrl: string;
  baseUrl: string;
  apiUrl: string;
  idpUrl: string;

  // Authentication
  spokeToken?: string;
  tokenExpiresAt?: Date;
  certificatePath: string;
  privateKeyPath: string;
  caBundlePath?: string;

  // Federation
  requestedScopes: string[];
  status: SpokeStatus;
  approvedAt?: Date;
  allowedPolicyScopes?: string[];
  trustLevel?: 'development' | 'partner' | 'bilateral' | 'national';
  maxClassificationAllowed?: string;

  // Operational
  heartbeatIntervalMs: number;
  tokenRefreshBufferMs: number;
  offlineGracePeriodMs: number;
  policyCachePath: string;

  // Metadata
  createdAt: Date;
  lastModified: Date;
  version?: string;
}

export interface ISpokeRuntimeState {
  status: SpokeStatus;
  lastHeartbeat: Date | null;
  lastPolicySync: Date | null;
  hubConnected: boolean;
  opalConnected: boolean;
  policyVersion: string | null;
  tokenExpiresAt: Date | null;
  consecutiveHeartbeatFailures: number;
  offlineSince: Date | null;
  queuedHeartbeats: number;
  queuedAuditLogs: number;
}

export interface ISpokeHealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    opa: boolean;
    opalClient: boolean;
    keycloak: boolean;
    mongodb: boolean;
    kas: boolean;
  };
  federation: {
    hubConnected: boolean;
    opalConnected: boolean;
    policyVersion: string | null;
    policySyncStatus: 'current' | 'behind' | 'stale' | 'unknown';
    tokenValid: boolean;
  };
  metrics: {
    uptime: number;
    requestsLastHour: number;
    authDecisionsLastHour: number;
    errorRate: number;
  };
}

// State transitions
const STATE_TRANSITIONS: Record<SpokeStatus, SpokeStatus[]> = {
  uninitialized: ['initialized'],
  initialized: ['pending'],
  pending: ['approved', 'suspended'],
  approved: ['suspended', 'offline'],
  suspended: ['approved', 'offline'],
  offline: ['approved', 'suspended'],
};

// ============================================
// SPOKE RUNTIME SERVICE
// ============================================

class SpokeRuntimeService extends EventEmitter {
  private config: ISpokeRuntimeConfig | null = null;
  private state: ISpokeRuntimeState;
  private configPath: string;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private tokenRefreshTimeout: NodeJS.Timeout | null = null;
  private startTime: Date;

  constructor() {
    super();
    this.configPath = process.env.SPOKE_CONFIG_PATH || '';
    this.startTime = new Date();
    this.state = this.getInitialState();
  }

  private getInitialState(): ISpokeRuntimeState {
    return {
      status: 'uninitialized',
      lastHeartbeat: null,
      lastPolicySync: null,
      hubConnected: false,
      opalConnected: false,
      policyVersion: null,
      tokenExpiresAt: null,
      consecutiveHeartbeatFailures: 0,
      offlineSince: null,
      queuedHeartbeats: 0,
      queuedAuditLogs: 0,
    };
  }

  // ============================================
  // INITIALIZATION
  // ============================================

  /**
   * Initialize the spoke runtime service
   */
  async initialize(configPath?: string): Promise<void> {
    if (configPath) {
      this.configPath = configPath;
    }

    if (!this.configPath) {
      // Try to auto-detect from environment
      const instanceCode = process.env.INSTANCE_CODE || process.env.DIVE_INSTANCE_CODE;
      if (instanceCode) {
        this.configPath = path.join(
          process.env.DIVE_ROOT || process.cwd(),
          'instances',
          instanceCode.toLowerCase(),
          'config.json'
        );
      } else {
        throw new Error('No spoke configuration path specified and INSTANCE_CODE not set');
      }
    }

    logger.info('Initializing Spoke Runtime Service', {
      configPath: this.configPath,
    });

    try {
      await this.loadConfiguration();
      this.transitionState('initialized');

      // If we have a token, we might be already approved
      if (this.config?.spokeToken) {
        if (this.config.status === 'approved') {
          this.transitionState('approved');
        } else if (this.config.status === 'pending') {
          this.transitionState('pending');
        }
      }

      logger.info('Spoke Runtime Service initialized', {
        spokeId: this.config?.spokeId,
        instanceCode: this.config?.instanceCode,
        status: this.state.status,
      });

      this.emit('initialized', this.getState());
    } catch (error) {
      logger.error('Failed to initialize Spoke Runtime Service', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Load spoke configuration from file
   */
  private async loadConfiguration(): Promise<void> {
    try {
      const configData = await fs.readFile(this.configPath, 'utf-8');
      const rawConfig = JSON.parse(configData);

      // Validate and transform configuration
      this.config = this.validateAndTransformConfig(rawConfig);

      // Override with environment variables
      this.applyEnvironmentOverrides();

      logger.debug('Spoke configuration loaded', {
        spokeId: this.config.spokeId,
        instanceCode: this.config.instanceCode,
        hubUrl: this.config.hubUrl,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Spoke configuration not found: ${this.configPath}`);
      }
      throw error;
    }
  }

  /**
   * Validate and transform raw configuration
   */
  private validateAndTransformConfig(raw: Record<string, unknown>): ISpokeRuntimeConfig {
    const requiredFields = ['spokeId', 'instanceCode', 'name', 'hubUrl', 'baseUrl', 'apiUrl', 'idpUrl'];

    for (const field of requiredFields) {
      if (!raw[field]) {
        throw new Error(`Missing required configuration field: ${field}`);
      }
    }

    const instanceCode = (raw.instanceCode as string).toUpperCase();

    return {
      // Identity
      spokeId: raw.spokeId as string,
      instanceCode,
      name: raw.name as string,
      description: raw.description as string | undefined,

      // URLs
      hubUrl: raw.hubUrl as string,
      hubOpalUrl: (raw.hubOpalUrl as string) || `${raw.hubUrl}:7002`,
      baseUrl: raw.baseUrl as string,
      apiUrl: raw.apiUrl as string,
      idpUrl: raw.idpUrl as string,

      // Authentication
      spokeToken: raw.spokeToken as string | undefined,
      tokenExpiresAt: raw.tokenExpiresAt ? new Date(raw.tokenExpiresAt as string) : undefined,
      certificatePath:
        (raw.certificatePath as string) ||
        path.join(process.cwd(), 'instances', instanceCode.toLowerCase(), 'certs', 'spoke.crt'),
      privateKeyPath:
        (raw.privateKeyPath as string) ||
        path.join(process.cwd(), 'instances', instanceCode.toLowerCase(), 'certs', 'spoke.key'),
      caBundlePath: raw.caBundlePath as string | undefined,

      // Federation
      requestedScopes: (raw.requestedScopes as string[]) || [
        'policy:base',
        'data:federation_matrix',
        'data:trusted_issuers',
      ],
      status: (raw.status as SpokeStatus) || 'uninitialized',
      approvedAt: raw.approvedAt ? new Date(raw.approvedAt as string) : undefined,
      allowedPolicyScopes: raw.allowedPolicyScopes as string[] | undefined,
      trustLevel: raw.trustLevel as ISpokeRuntimeConfig['trustLevel'],
      maxClassificationAllowed: raw.maxClassificationAllowed as string | undefined,

      // Operational
      heartbeatIntervalMs: (raw.heartbeatIntervalMs as number) || 30000, // 30 seconds
      tokenRefreshBufferMs: (raw.tokenRefreshBufferMs as number) || 300000, // 5 minutes
      offlineGracePeriodMs: (raw.offlineGracePeriodMs as number) || 3600000, // 1 hour
      policyCachePath:
        (raw.policyCachePath as string) ||
        path.join(process.cwd(), 'instances', instanceCode.toLowerCase(), 'cache'),

      // Metadata
      createdAt: raw.createdAt ? new Date(raw.createdAt as string) : new Date(),
      lastModified: raw.lastModified ? new Date(raw.lastModified as string) : new Date(),
      version: raw.version as string | undefined,
    };
  }

  /**
   * Apply environment variable overrides
   */
  private applyEnvironmentOverrides(): void {
    if (!this.config) return;

    // Hub URL
    if (process.env.DIVE_HUB_URL) {
      this.config.hubUrl = process.env.DIVE_HUB_URL;
      this.config.hubOpalUrl = process.env.DIVE_HUB_OPAL_URL || `${this.config.hubUrl}:7002`;
    }

    // Token
    if (process.env.DIVE_SPOKE_TOKEN) {
      this.config.spokeToken = process.env.DIVE_SPOKE_TOKEN;
    }

    // Intervals
    if (process.env.DIVE_HEARTBEAT_INTERVAL_MS) {
      this.config.heartbeatIntervalMs = parseInt(process.env.DIVE_HEARTBEAT_INTERVAL_MS, 10);
    }
    if (process.env.DIVE_TOKEN_REFRESH_BUFFER_MS) {
      this.config.tokenRefreshBufferMs = parseInt(process.env.DIVE_TOKEN_REFRESH_BUFFER_MS, 10);
    }
    if (process.env.DIVE_OFFLINE_GRACE_PERIOD_MS) {
      this.config.offlineGracePeriodMs = parseInt(process.env.DIVE_OFFLINE_GRACE_PERIOD_MS, 10);
    }

    // Cache path
    if (process.env.DIVE_POLICY_CACHE_PATH) {
      this.config.policyCachePath = process.env.DIVE_POLICY_CACHE_PATH;
    }
  }

  /**
   * Save configuration to file
   */
  async saveConfiguration(): Promise<void> {
    if (!this.config) {
      throw new Error('No configuration to save');
    }

    this.config.lastModified = new Date();

    await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));

    logger.debug('Spoke configuration saved', {
      configPath: this.configPath,
    });
  }

  // ============================================
  // STATE MANAGEMENT
  // ============================================

  /**
   * Transition to a new state
   */
  transitionState(newStatus: SpokeStatus): void {
    const currentStatus = this.state.status;
    const allowedTransitions = STATE_TRANSITIONS[currentStatus];

    if (!allowedTransitions.includes(newStatus)) {
      throw new Error(
        `Invalid state transition: ${currentStatus} → ${newStatus}. ` +
          `Allowed: ${allowedTransitions.join(', ')}`
      );
    }

    const previousStatus = this.state.status;
    this.state.status = newStatus;

    // Update config status
    if (this.config) {
      this.config.status = newStatus;
    }

    // Handle state-specific actions
    switch (newStatus) {
      case 'approved':
        this.onApproved();
        break;
      case 'offline':
        this.onOffline();
        break;
      case 'suspended':
        this.onSuspended();
        break;
    }

    logger.info('Spoke state transition', {
      from: previousStatus,
      to: newStatus,
      spokeId: this.config?.spokeId,
    });

    this.emit('stateChange', { from: previousStatus, to: newStatus });
  }

  /**
   * Force set status (for recovery scenarios)
   */
  forceStatus(status: SpokeStatus): void {
    logger.warn('Force setting spoke status', {
      from: this.state.status,
      to: status,
    });
    this.state.status = status;
    if (this.config) {
      this.config.status = status;
    }
  }

  private onApproved(): void {
    this.state.offlineSince = null;
    this.startHeartbeat();
    this.scheduleTokenRefresh();
  }

  private onOffline(): void {
    this.state.offlineSince = new Date();
    this.state.hubConnected = false;
    this.state.opalConnected = false;
    this.emit('offline');
  }

  private onSuspended(): void {
    this.stopHeartbeat();
    this.cancelTokenRefresh();
    this.emit('suspended');
  }

  // ============================================
  // HEARTBEAT MANAGEMENT
  // ============================================

  /**
   * Start sending heartbeats to Hub
   */
  startHeartbeat(): void {
    if (this.heartbeatInterval) {
      return; // Already running
    }

    const intervalMs = this.config?.heartbeatIntervalMs || 30000;

    logger.info('Starting heartbeat daemon', { intervalMs });

    // Send initial heartbeat
    this.sendHeartbeat().catch((err) => {
      logger.warn('Initial heartbeat failed', { error: err.message });
    });

    // Schedule regular heartbeats
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat().catch((err) => {
        logger.warn('Heartbeat failed', { error: err.message });
      });
    }, intervalMs);
  }

  /**
   * Stop sending heartbeats
   */
  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      logger.info('Heartbeat daemon stopped');
    }
  }

  /**
   * Send a heartbeat to Hub
   */
  async sendHeartbeat(): Promise<void> {
    if (!this.config) {
      throw new Error('Spoke not initialized');
    }

    // Will be implemented by spoke-heartbeat.service.ts
    // This is a placeholder that emits events for testing
    this.emit('heartbeat:sending');

    try {
      // Placeholder: actual HTTP call will be in heartbeat service
      this.state.lastHeartbeat = new Date();
      this.state.consecutiveHeartbeatFailures = 0;
      this.state.hubConnected = true;

      this.emit('heartbeat:success', {
        timestamp: this.state.lastHeartbeat,
      });
    } catch (error) {
      this.state.consecutiveHeartbeatFailures++;

      this.emit('heartbeat:failure', {
        error: error instanceof Error ? error.message : 'Unknown error',
        consecutiveFailures: this.state.consecutiveHeartbeatFailures,
      });

      // Check if we should transition to offline
      const graceMs = this.config.offlineGracePeriodMs;
      const failedDuration = this.state.consecutiveHeartbeatFailures * this.config.heartbeatIntervalMs;

      if (failedDuration >= graceMs && this.state.status === 'approved') {
        this.transitionState('offline');
      }

      throw error;
    }
  }

  // ============================================
  // TOKEN MANAGEMENT
  // ============================================

  /**
   * Schedule token refresh before expiry
   */
  scheduleTokenRefresh(): void {
    this.cancelTokenRefresh();

    if (!this.config?.spokeToken || !this.config.tokenExpiresAt) {
      return;
    }

    const expiresAt = this.config.tokenExpiresAt.getTime();
    const now = Date.now();
    const bufferMs = this.config.tokenRefreshBufferMs;

    const refreshIn = Math.max(0, expiresAt - now - bufferMs);

    logger.debug('Scheduling token refresh', {
      expiresAt: this.config.tokenExpiresAt,
      refreshIn: `${Math.round(refreshIn / 1000)}s`,
    });

    this.tokenRefreshTimeout = setTimeout(() => {
      this.refreshToken().catch((err) => {
        logger.error('Token refresh failed', { error: err.message });
      });
    }, refreshIn);
  }

  /**
   * Cancel scheduled token refresh
   */
  cancelTokenRefresh(): void {
    if (this.tokenRefreshTimeout) {
      clearTimeout(this.tokenRefreshTimeout);
      this.tokenRefreshTimeout = null;
    }
  }

  /**
   * Refresh the spoke token
   */
  async refreshToken(): Promise<void> {
    if (!this.config) {
      throw new Error('Spoke not initialized');
    }

    this.emit('token:refreshing');

    try {
      // Placeholder: actual HTTP call will be in token service
      logger.info('Token refresh requested');

      // Will receive new token and update config
      // this.config.spokeToken = newToken;
      // this.config.tokenExpiresAt = newExpiresAt;
      // await this.saveConfiguration();

      this.scheduleTokenRefresh();

      this.emit('token:refreshed');
    } catch (error) {
      this.emit('token:refreshFailed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Set a new spoke token
   */
  async setToken(token: string, expiresAt: Date): Promise<void> {
    if (!this.config) {
      throw new Error('Spoke not initialized');
    }

    this.config.spokeToken = token;
    this.config.tokenExpiresAt = expiresAt;
    this.state.tokenExpiresAt = expiresAt;

    await this.saveConfiguration();
    this.scheduleTokenRefresh();

    logger.info('Spoke token set', {
      expiresAt,
    });
  }

  /**
   * Check if token is valid
   */
  isTokenValid(): boolean {
    if (!this.config?.spokeToken || !this.config.tokenExpiresAt) {
      return false;
    }

    return this.config.tokenExpiresAt.getTime() > Date.now();
  }

  // ============================================
  // HEALTH & STATUS
  // ============================================

  /**
   * Get current state
   */
  getState(): ISpokeRuntimeState {
    return { ...this.state };
  }

  /**
   * Get current configuration
   */
  getConfig(): ISpokeRuntimeConfig | null {
    return this.config ? { ...this.config } : null;
  }

  /**
   * Get health status
   */
  async getHealthStatus(): Promise<ISpokeHealthStatus> {
    const uptimeMs = Date.now() - this.startTime.getTime();

    // TODO: Actual health checks will be implemented
    const services = {
      opa: true, // Will check http://localhost:8181/health
      opalClient: this.state.opalConnected,
      keycloak: true, // Will check keycloak health
      mongodb: true, // Will check mongodb connection
      kas: true, // Will check KAS health
    };

    const allServicesHealthy = Object.values(services).every((v) => v);

    let policySyncStatus: 'current' | 'behind' | 'stale' | 'unknown' = 'unknown';
    if (this.state.policyVersion) {
      // TODO: Compare with Hub version
      policySyncStatus = 'current';
    }

    return {
      overall: allServicesHealthy ? 'healthy' : this.state.hubConnected ? 'degraded' : 'unhealthy',
      services,
      federation: {
        hubConnected: this.state.hubConnected,
        opalConnected: this.state.opalConnected,
        policyVersion: this.state.policyVersion,
        policySyncStatus,
        tokenValid: this.isTokenValid(),
      },
      metrics: {
        uptime: uptimeMs,
        requestsLastHour: 0, // TODO: Track from metrics
        authDecisionsLastHour: 0,
        errorRate: 0,
      },
    };
  }

  /**
   * Update policy version after sync
   */
  updatePolicyVersion(version: string): void {
    this.state.policyVersion = version;
    this.state.lastPolicySync = new Date();
    this.emit('policySync', { version });
  }

  /**
   * Update OPAL connection state
   */
  updateOPALConnection(connected: boolean): void {
    this.state.opalConnected = connected;
    this.emit('opalConnectionChange', { connected });
  }

  // ============================================
  // LIFECYCLE
  // ============================================

  /**
   * Start the spoke runtime
   */
  async start(): Promise<void> {
    if (this.state.status === 'uninitialized') {
      await this.initialize();
    }

    if (this.state.status === 'approved') {
      this.startHeartbeat();
      this.scheduleTokenRefresh();
    }

    logger.info('Spoke runtime started', {
      status: this.state.status,
    });
  }

  /**
   * Stop the spoke runtime
   */
  async stop(): Promise<void> {
    this.stopHeartbeat();
    this.cancelTokenRefresh();

    logger.info('Spoke runtime stopped');
  }

  /**
   * Shutdown gracefully
   */
  async shutdown(): Promise<void> {
    logger.info('Spoke runtime shutting down');

    await this.stop();

    // Save final state
    if (this.config) {
      await this.saveConfiguration();
    }

    this.emit('shutdown');
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const spokeRuntime = new SpokeRuntimeService();

export default SpokeRuntimeService;





