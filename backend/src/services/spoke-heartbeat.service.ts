/**
 * DIVE V3 - Spoke Heartbeat Service
 *
 * Manages periodic heartbeat communication with the Hub.
 * Reports spoke health status, policy version, and receives commands.
 *
 * Features:
 * - Periodic heartbeat sending (configurable interval)
 * - Local service health aggregation
 * - Hub command processing
 * - Offline queue for failed heartbeats
 * - Automatic recovery on reconnection
 *
 * @version 1.0.0
 * @date 2025-12-05
 */

import { EventEmitter } from 'events';
import https from 'https';
import http from 'http';
import fs from 'fs';
import { logger } from '../utils/logger';

// ============================================
// TYPES
// ============================================

export interface IHeartbeatPayload {
  spokeId: string;
  instanceCode: string;
  timestamp: string;
  policyVersion: string | null;
  services: {
    opa: IServiceHealth;
    opalClient: IServiceHealth;
    keycloak: IServiceHealth;
    mongodb: IServiceHealth;
    kas: IServiceHealth;
  };
  metrics: {
    uptime: number;
    requestsLastHour: number;
    authDecisionsLastHour: number;
    authDeniesLastHour: number;
    errorRate: number;
    avgLatencyMs: number;
  };
  queues: {
    pendingAuditLogs: number;
    pendingHeartbeats: number;
  };
}

export interface IServiceHealth {
  healthy: boolean;
  latencyMs?: number;
  lastCheck: string;
  error?: string;
}

export interface IHeartbeatResponse {
  success: boolean;
  serverTime: string;
  currentPolicyVersion: string;
  syncStatus: 'current' | 'behind' | 'stale';
  actions?: IHubAction[];
  message?: string;
}

export interface IHubAction {
  type: 'force_sync' | 'suspend' | 'revoke' | 'update_config' | 'clear_cache' | 'restart';
  payload?: Record<string, unknown>;
  urgent: boolean;
  message: string;
}

export interface IQueuedHeartbeat {
  payload: IHeartbeatPayload;
  timestamp: Date;
  attempts: number;
}

export interface IHeartbeatConfig {
  hubUrl: string;
  spokeId: string;
  instanceCode: string;
  spokeToken: string;
  intervalMs: number;
  timeoutMs: number;
  maxQueueSize: number;
  maxRetries: number;
  certificatePath?: string;
  privateKeyPath?: string;
  caBundlePath?: string;
}

// ============================================
// SPOKE HEARTBEAT SERVICE
// ============================================

class SpokeHeartbeatService extends EventEmitter {
  private config: IHeartbeatConfig | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private running = false;
  private queue: IQueuedHeartbeat[] = [];
  private consecutiveFailures = 0;
  private lastSuccessfulHeartbeat: Date | null = null;
  private lastHeartbeatResponse: IHeartbeatResponse | null = null;
  private startTime: Date = new Date();

  // Health check cache
  private serviceHealth: IHeartbeatPayload['services'] = {
    opa: { healthy: false, lastCheck: new Date().toISOString() },
    opalClient: { healthy: false, lastCheck: new Date().toISOString() },
    keycloak: { healthy: false, lastCheck: new Date().toISOString() },
    mongodb: { healthy: false, lastCheck: new Date().toISOString() },
    kas: { healthy: false, lastCheck: new Date().toISOString() },
  };

  // Metrics
  private metrics = {
    requestsLastHour: 0,
    authDecisionsLastHour: 0,
    authDeniesLastHour: 0,
    errorRate: 0,
    avgLatencyMs: 0,
  };

  // Policy version tracking
  private currentPolicyVersion: string | null = null;

  /**
   * Initialize the heartbeat service
   */
  initialize(config: IHeartbeatConfig): void {
    this.config = config;
    this.startTime = new Date();

    logger.info('Spoke Heartbeat Service initialized', {
      hubUrl: config.hubUrl,
      spokeId: config.spokeId,
      intervalMs: config.intervalMs,
    });
  }

  /**
   * Start sending heartbeats
   */
  start(): void {
    if (this.running) {
      logger.warn('Heartbeat service already running');
      return;
    }

    if (!this.config) {
      throw new Error('Heartbeat service not initialized');
    }

    this.running = true;

    logger.info('Starting heartbeat service', {
      intervalMs: this.config.intervalMs,
    });

    // Send initial heartbeat
    this.sendHeartbeat().catch((err) => {
      logger.warn('Initial heartbeat failed', { error: err.message });
    });

    // Schedule periodic heartbeats
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat().catch((err) => {
        logger.warn('Periodic heartbeat failed', { error: err.message });
      });
    }, this.config.intervalMs);

    this.emit('started');
  }

  /**
   * Stop sending heartbeats
   */
  stop(): void {
    if (!this.running) {
      return;
    }

    this.running = false;

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    logger.info('Heartbeat service stopped');
    this.emit('stopped');
  }

  /**
   * Send a heartbeat to the Hub
   */
  async sendHeartbeat(): Promise<IHeartbeatResponse> {
    if (!this.config) {
      throw new Error('Heartbeat service not initialized');
    }

    // Refresh service health checks
    await this.refreshServiceHealth();

    // Build payload
    const payload = this.buildHeartbeatPayload();

    this.emit('sending', payload);

    try {
      const response = await this.postHeartbeat(payload);

      // Success
      this.consecutiveFailures = 0;
      this.lastSuccessfulHeartbeat = new Date();
      this.lastHeartbeatResponse = response;

      // Process any actions from Hub
      if (response.actions && response.actions.length > 0) {
        await this.processHubActions(response.actions);
      }

      // Update sync status
      if (response.syncStatus !== 'current') {
        this.emit('syncNeeded', {
          status: response.syncStatus,
          currentVersion: response.currentPolicyVersion,
          localVersion: this.currentPolicyVersion,
        });
      }

      // Flush queued heartbeats on successful connection
      await this.flushQueue();

      this.emit('success', response);

      logger.debug('Heartbeat sent successfully', {
        syncStatus: response.syncStatus,
        serverTime: response.serverTime,
      });

      return response;
    } catch (error) {
      this.consecutiveFailures++;

      // Queue the failed heartbeat
      this.queueHeartbeat(payload);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.emit('failure', {
        error: errorMessage,
        consecutiveFailures: this.consecutiveFailures,
        queueSize: this.queue.length,
      });

      logger.warn('Heartbeat failed', {
        error: errorMessage,
        consecutiveFailures: this.consecutiveFailures,
        queueSize: this.queue.length,
      });

      throw error;
    }
  }

  /**
   * Build heartbeat payload
   */
  private buildHeartbeatPayload(): IHeartbeatPayload {
    const uptime = Date.now() - this.startTime.getTime();

    return {
      spokeId: this.config!.spokeId,
      instanceCode: this.config!.instanceCode,
      timestamp: new Date().toISOString(),
      policyVersion: this.currentPolicyVersion,
      services: { ...this.serviceHealth },
      metrics: {
        uptime,
        ...this.metrics,
      },
      queues: {
        pendingAuditLogs: 0, // Will be updated by audit service
        pendingHeartbeats: this.queue.length,
      },
    };
  }

  /**
   * POST heartbeat to Hub
   */
  private async postHeartbeat(payload: IHeartbeatPayload): Promise<IHeartbeatResponse> {
    return new Promise((resolve, reject) => {
      const url = new URL(`${this.config!.hubUrl}/api/federation/heartbeat`);

      const isHttps = url.protocol === 'https:';
      const httpModule = isHttps ? https : http;

      const requestOptions: https.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config!.spokeToken}`,
          'X-Spoke-ID': this.config!.spokeId,
          'X-Instance-Code': this.config!.instanceCode,
        },
        timeout: this.config!.timeoutMs,
      };

      // Add mTLS configuration if certificates are provided
      if (isHttps && this.config!.certificatePath && this.config!.privateKeyPath) {
        try {
          requestOptions.cert = fs.readFileSync(this.config!.certificatePath);
          requestOptions.key = fs.readFileSync(this.config!.privateKeyPath);
          if (this.config!.caBundlePath) {
            requestOptions.ca = fs.readFileSync(this.config!.caBundlePath);
          }
          // In development, allow self-signed certs
          if (process.env.NODE_ENV !== 'production') {
            requestOptions.rejectUnauthorized = false;
          }
        } catch (certError) {
          logger.warn('Failed to load certificates for mTLS', {
            error: certError instanceof Error ? certError.message : 'Unknown error',
          });
          // Continue without mTLS
        }
      }

      const req = httpModule.request(requestOptions, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode === 200 || res.statusCode === 201) {
            try {
              const response = JSON.parse(data) as IHeartbeatResponse;
              resolve(response);
            } catch {
              reject(new Error(`Invalid JSON response: ${data.substring(0, 100)}`));
            }
          } else if (res.statusCode === 401) {
            reject(new Error('Unauthorized: Token may be invalid or expired'));
          } else if (res.statusCode === 403) {
            reject(new Error('Forbidden: Spoke may be suspended or revoked'));
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout (${this.config!.timeoutMs}ms)`));
      });

      req.write(JSON.stringify(payload));
      req.end();
    });
  }

  /**
   * Queue a failed heartbeat for later retry
   */
  private queueHeartbeat(payload: IHeartbeatPayload): void {
    if (this.queue.length >= this.config!.maxQueueSize) {
      // Remove oldest entry
      this.queue.shift();
      logger.warn('Heartbeat queue full, dropping oldest entry');
    }

    this.queue.push({
      payload,
      timestamp: new Date(),
      attempts: 1,
    });
  }

  /**
   * Flush queued heartbeats
   */
  private async flushQueue(): Promise<void> {
    if (this.queue.length === 0) return;

    logger.info('Flushing heartbeat queue', { count: this.queue.length });

    // Send queued heartbeats (up to 10 at a time)
    const batch = this.queue.splice(0, 10);

    for (const queued of batch) {
      if (queued.attempts >= this.config!.maxRetries) {
        logger.warn('Dropping heartbeat after max retries', {
          timestamp: queued.timestamp,
          attempts: queued.attempts,
        });
        continue;
      }

      try {
        await this.postHeartbeat(queued.payload);
        logger.debug('Queued heartbeat sent', {
          originalTimestamp: queued.timestamp,
        });
      } catch (error) {
        queued.attempts++;
        this.queue.push(queued);
        break; // Stop trying if we fail again
      }
    }
  }

  /**
   * Process actions received from Hub
   */
  private async processHubActions(actions: IHubAction[]): Promise<void> {
    for (const action of actions) {
      logger.info('Processing Hub action', {
        type: action.type,
        urgent: action.urgent,
        message: action.message,
      });

      try {
        this.emit('action', action);

        switch (action.type) {
          case 'force_sync':
            this.emit('forceSync', action.payload);
            break;

          case 'suspend':
            this.emit('suspended', { reason: action.message });
            break;

          case 'revoke':
            this.emit('revoked', { reason: action.message });
            this.stop();
            break;

          case 'update_config':
            this.emit('configUpdate', action.payload);
            break;

          case 'clear_cache':
            this.emit('clearCache', action.payload);
            break;

          case 'restart':
            this.emit('restartRequested', { reason: action.message });
            break;
        }
      } catch (error) {
        logger.error('Failed to process Hub action', {
          action: action.type,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  // ============================================
  // SERVICE HEALTH CHECKS
  // ============================================

  /**
   * Refresh all service health checks
   */
  async refreshServiceHealth(): Promise<void> {
    const checks = await Promise.allSettled([
      this.checkOPA(),
      this.checkOPALClient(),
      this.checkKeycloak(),
      this.checkMongoDB(),
      this.checkKAS(),
    ]);

    // Update health cache
    const [opa, opalClient, keycloak, mongodb, kas] = checks;

    this.serviceHealth.opa = this.extractHealthResult(opa);
    this.serviceHealth.opalClient = this.extractHealthResult(opalClient);
    this.serviceHealth.keycloak = this.extractHealthResult(keycloak);
    this.serviceHealth.mongodb = this.extractHealthResult(mongodb);
    this.serviceHealth.kas = this.extractHealthResult(kas);
  }

  private extractHealthResult(result: PromiseSettledResult<IServiceHealth>): IServiceHealth {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    return {
      healthy: false,
      lastCheck: new Date().toISOString(),
      error: result.reason?.message || 'Unknown error',
    };
  }

  /**
   * Check OPA health
   */
  private async checkOPA(): Promise<IServiceHealth> {
    const start = Date.now();
    const url = process.env.OPA_URL || 'http://localhost:8181';

    try {
      const response = await this.httpGet(`${url}/health`);
      return {
        healthy: response.status === 200,
        latencyMs: Date.now() - start,
        lastCheck: new Date().toISOString(),
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        lastCheck: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check OPAL Client health
   */
  private async checkOPALClient(): Promise<IServiceHealth> {
    const start = Date.now();
    const url = process.env.OPAL_CLIENT_URL || 'http://localhost:7000';

    try {
      const response = await this.httpGet(`${url}/health`);
      return {
        healthy: response.status === 200,
        latencyMs: Date.now() - start,
        lastCheck: new Date().toISOString(),
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        lastCheck: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check Keycloak health
   */
  private async checkKeycloak(): Promise<IServiceHealth> {
    const start = Date.now();
    const url = process.env.KEYCLOAK_URL || 'http://localhost:8080';

    try {
      const response = await this.httpGet(`${url}/health`);
      return {
        healthy: response.status === 200,
        latencyMs: Date.now() - start,
        lastCheck: new Date().toISOString(),
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        lastCheck: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check MongoDB health
   */
  private async checkMongoDB(): Promise<IServiceHealth> {
    const start = Date.now();

    try {
      // Simple ping - actual implementation would use MongoDB client
      // This is a placeholder
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        lastCheck: new Date().toISOString(),
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        lastCheck: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check KAS health
   */
  private async checkKAS(): Promise<IServiceHealth> {
    const start = Date.now();
    const url = process.env.KAS_URL || 'http://localhost:8090';

    try {
      const response = await this.httpGet(`${url}/health`);
      return {
        healthy: response.status === 200,
        latencyMs: Date.now() - start,
        lastCheck: new Date().toISOString(),
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        lastCheck: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Simple HTTP GET for health checks
   */
  private httpGet(url: string): Promise<{ status: number; data: string }> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';
      const httpModule = isHttps ? https : http;

      const options: http.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname,
        method: 'GET',
        timeout: 5000,
      };

      if (isHttps && process.env.NODE_ENV !== 'production') {
        (options as https.RequestOptions).rejectUnauthorized = false;
      }

      const req = httpModule.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          resolve({ status: res.statusCode || 500, data });
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout'));
      });
      req.end();
    });
  }

  // ============================================
  // PUBLIC API
  // ============================================

  /**
   * Update policy version
   */
  setPolicyVersion(version: string): void {
    this.currentPolicyVersion = version;
  }

  /**
   * Update metrics
   */
  updateMetrics(metrics: Partial<IHeartbeatPayload['metrics']>): void {
    this.metrics = { ...this.metrics, ...metrics };
  }

  /**
   * Get current service health
   */
  getServiceHealth(): IHeartbeatPayload['services'] {
    return { ...this.serviceHealth };
  }

  /**
   * Get consecutive failure count
   */
  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Get last successful heartbeat time
   */
  getLastSuccessfulHeartbeat(): Date | null {
    return this.lastSuccessfulHeartbeat;
  }

  /**
   * Get last heartbeat response
   */
  getLastResponse(): IHeartbeatResponse | null {
    return this.lastHeartbeatResponse;
  }

  /**
   * Check if service is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Force a health check refresh
   */
  async forceHealthRefresh(): Promise<IHeartbeatPayload['services']> {
    await this.refreshServiceHealth();
    return this.getServiceHealth();
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const spokeHeartbeat = new SpokeHeartbeatService();

export default SpokeHeartbeatService;



