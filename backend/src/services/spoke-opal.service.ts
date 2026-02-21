/**
 * DIVE V3 - Spoke OPAL Service
 *
 * Wrapper service for OPAL client integration on spoke instances.
 * Manages policy subscription, data sync, and coordination with the
 * Hub's OPAL server.
 *
 * Features:
 * - OPAL client lifecycle management
 * - Policy subscription to Hub topics
 * - Data source configuration
 * - Event-driven policy updates
 * - Integration with policy cache for offline support
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

export interface IOPALConfig {
  opalClientUrl: string;
  hubOpalServerUrl: string;
  spokeId: string;
  spokeToken: string;
  subscriptionId: string;
  policyTopics: string[];
  dataTopics: string[];
  opaUrl: string;
}

export interface IOPALClientStatus {
  connected: boolean;
  serverUrl: string;
  lastUpdate: Date | null;
  currentPolicyVersion: string | null;
  subscriptionActive: boolean;
  dataSourcesConfigured: number;
}

export interface IPolicyUpdate {
  version: string;
  timestamp: string;
  transactionId: string;
  changes: IPolicyChange[];
}

export interface IPolicyChange {
  type: 'add' | 'update' | 'delete';
  path: string;
  hash?: string;
}

export interface IDataSourceConfig {
  name: string;
  url: string;
  topics: string[];
  fetchOnConnect: boolean;
  periodicRefreshMs?: number;
}

// Default configuration
const DEFAULT_CONFIG: Partial<IOPALConfig> = {
  opalClientUrl: 'http://localhost:7000',
  opaUrl: 'http://localhost:8181',
  policyTopics: ['policy:base', 'policy:tenant'],
  dataTopics: ['data:federation_matrix', 'data:trusted_issuers', 'data:coi_membership'],
};

// ============================================
// SPOKE OPAL SERVICE
// ============================================

class SpokeOPALService extends EventEmitter {
  private config: IOPALConfig | null = null;
  private status: IOPALClientStatus;
  private pollInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.status = this.getInitialStatus();
  }

  private getInitialStatus(): IOPALClientStatus {
    return {
      connected: false,
      serverUrl: '',
      lastUpdate: null,
      currentPolicyVersion: null,
      subscriptionActive: false,
      dataSourcesConfigured: 0,
    };
  }

  /**
   * Initialize the OPAL service
   */
  initialize(config: IOPALConfig): void {
    this.config = { ...DEFAULT_CONFIG, ...config } as IOPALConfig;
    this.status.serverUrl = this.config.hubOpalServerUrl;

    logger.info('Spoke OPAL Service initialized', {
      opalClientUrl: this.config.opalClientUrl,
      hubOpalServerUrl: this.config.hubOpalServerUrl,
      spokeId: this.config.spokeId,
      policyTopics: this.config.policyTopics,
    });
  }

  // ============================================
  // CONNECTION MANAGEMENT
  // ============================================

  /**
   * Connect to Hub OPAL server
   * Note: Actual OPAL client is a Docker container that connects automatically.
   * This method verifies the connection and sets up data sources.
   */
  async connect(): Promise<boolean> {
    if (!this.config) {
      throw new Error('OPAL service not initialized');
    }

    try {
      // Check OPAL client health
      const clientHealth = await this.checkOPALClientHealth();
      if (!clientHealth.success) {
        throw new Error(`OPAL client not healthy: ${clientHealth.error}`);
      }

      // Verify subscription is active
      const subscriptionStatus = await this.checkSubscriptionStatus();
      this.status.subscriptionActive = subscriptionStatus.active;

      // Configure data sources
      await this.configureDataSources();

      this.status.connected = true;

      logger.info('Connected to OPAL server', {
        serverUrl: this.config.hubOpalServerUrl,
        subscriptionActive: this.status.subscriptionActive,
      });

      this.emit('connected');
      return true;
    } catch (error) {
      logger.error('Failed to connect to OPAL server', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      this.status.connected = false;
      this.emit('connectionFailed', { error });
      return false;
    }
  }

  /**
   * Disconnect from Hub OPAL server
   */
  disconnect(): void {
    this.status.connected = false;
    this.status.subscriptionActive = false;

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    logger.info('Disconnected from OPAL server');
    this.emit('disconnected');
  }

  // ============================================
  // POLICY MANAGEMENT
  // ============================================

  /**
   * Trigger a policy refresh from Hub
   */
  async triggerPolicyRefresh(): Promise<boolean> {
    if (!this.config) {
      throw new Error('OPAL service not initialized');
    }

    try {
      const result = await this.httpPost(
        `${this.config.opalClientUrl}/policy-refresh`,
        JSON.stringify({
          reason: 'manual_refresh',
          spokeId: this.config.spokeId,
        })
      );

      if (result.success) {
        this.emit('policyRefreshTriggered');
        logger.info('Policy refresh triggered');
      }

      return result.success;
    } catch (error) {
      logger.error('Failed to trigger policy refresh', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Get current policy version from local OPA
   */
  async getCurrentPolicyVersion(): Promise<string | null> {
    if (!this.config) {
      return null;
    }

    try {
      const result = await this.httpGet(`${this.config.opaUrl}/v1/data/system/version`);
      if (result.success && result.data) {
        const data = JSON.parse(result.data);
        this.status.currentPolicyVersion = data.result?.policy_version || null;
        return this.status.currentPolicyVersion;
      }
      return null;
    } catch (error) {
      logger.warn('Failed to get policy version', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Force reload policies from cache to OPA
   */
  async forcePolicyReload(): Promise<boolean> {
    // This triggers the OPAL client to re-push policies to OPA
    return this.triggerPolicyRefresh();
  }

  // ============================================
  // DATA MANAGEMENT
  // ============================================

  /**
   * Trigger a data refresh from Hub
   */
  async triggerDataRefresh(topics?: string[]): Promise<boolean> {
    if (!this.config) {
      throw new Error('OPAL service not initialized');
    }

    const refreshTopics = topics || this.config.dataTopics;

    try {
      const result = await this.httpPost(
        `${this.config.opalClientUrl}/data-refresh`,
        JSON.stringify({
          topics: refreshTopics,
          reason: 'manual_refresh',
        })
      );

      if (result.success) {
        this.emit('dataRefreshTriggered', { topics: refreshTopics });
        logger.info('Data refresh triggered', { topics: refreshTopics });
      }

      return result.success;
    } catch (error) {
      logger.error('Failed to trigger data refresh', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Configure data sources for OPAL client
   */
  async configureDataSources(): Promise<void> {
    if (!this.config) {
      throw new Error('OPAL service not initialized');
    }

    // Standard data sources for DIVE spokes
    const dataSources: IDataSourceConfig[] = [
      {
        name: 'federation_matrix',
        url: `${this.config.hubOpalServerUrl}/data/federation_matrix`,
        topics: ['policy:federation'],
        fetchOnConnect: true,
      },
      {
        name: 'trusted_issuers',
        url: `${this.config.hubOpalServerUrl}/data/trusted_issuers`,
        topics: ['policy:trust'],
        fetchOnConnect: true,
      },
      {
        name: 'coi_membership',
        url: `${this.config.hubOpalServerUrl}/data/coi_membership`,
        topics: ['policy:coi'],
        fetchOnConnect: true,
      },
    ];

    this.status.dataSourcesConfigured = dataSources.length;

    logger.debug('Data sources configured', {
      count: dataSources.length,
    });
  }

  // ============================================
  // STATUS & MONITORING
  // ============================================

  /**
   * Get current OPAL client status
   */
  getStatus(): IOPALClientStatus {
    return { ...this.status };
  }

  /**
   * Check OPAL client health
   */
  async checkOPALClientHealth(): Promise<{ success: boolean; error?: string }> {
    if (!this.config) {
      return { success: false, error: 'Not initialized' };
    }

    try {
      const result = await this.httpGet(`${this.config.opalClientUrl}/health`);
      return { success: result.success };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check subscription status
   */
  async checkSubscriptionStatus(): Promise<{ active: boolean; topics: string[] }> {
    if (!this.config) {
      return { active: false, topics: [] };
    }

    try {
      const result = await this.httpGet(`${this.config.opalClientUrl}/subscription-status`);
      if (result.success && result.data) {
        const data = JSON.parse(result.data);
        return {
          active: data.active || false,
          topics: data.topics || [],
        };
      }
      return { active: false, topics: [] };
    } catch {
      // Default to inactive if can't check
      return { active: false, topics: [] };
    }
  }

  /**
   * Start polling for updates
   */
  startPolling(intervalMs: number = 30000): void {
    if (this.pollInterval) {
      return;
    }

    this.pollInterval = setInterval(async () => {
      try {
        const version = await this.getCurrentPolicyVersion();
        this.emit('versionPoll', { version });
      } catch (error) {
        logger.warn('Version poll failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }, intervalMs);

    logger.info('Started OPAL version polling', { intervalMs });
  }

  /**
   * Stop polling
   */
  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      logger.info('Stopped OPAL version polling');
    }
  }

  /**
   * Handle policy update event from OPAL
   */
  handlePolicyUpdate(update: IPolicyUpdate): void {
    this.status.lastUpdate = new Date();
    this.status.currentPolicyVersion = update.version;

    logger.info('Policy update received', {
      version: update.version,
      transactionId: update.transactionId,
      changes: update.changes.length,
    });

    this.emit('policyUpdate', update);
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.status.connected;
  }

  /**
   * Check if subscription is active
   */
  isSubscriptionActive(): boolean {
    return this.status.subscriptionActive;
  }

  /**
   * Update the spoke token for Hub authentication
   * This token is used in all requests to the Hub OPAL server
   */
  updateToken(token: string): void {
    if (!this.config) {
      throw new Error('OPAL service not initialized');
    }

    this.config.spokeToken = token;

    logger.info('OPAL client token updated', {
      spokeId: this.config.spokeId,
    });

    this.emit('tokenUpdated', { spokeId: this.config.spokeId });
  }

  /**
   * Get current token (for passing to OPAL client container)
   */
  getToken(): string | null {
    return this.config?.spokeToken || null;
  }

  // ============================================
  // HELPERS
  // ============================================

  /**
   * HTTP GET helper
   */
  private httpGet(url: string): Promise<{ success: boolean; data?: string; error?: string }> {
    return new Promise((resolve) => {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';
      const httpModule = isHttps ? https : http;

      const options: http.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname,
        method: 'GET',
        timeout: 5000,
        headers: {},
      };

      if (this.config?.spokeToken) {
        (options.headers as Record<string, string>)['Authorization'] = `Bearer ${this.config.spokeToken}`;
      }

      if (isHttps && process.env.NODE_ENV !== 'production') {
        (options as https.RequestOptions).rejectUnauthorized = false;
      }

      const req = httpModule.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          resolve({
            success: res.statusCode === 200,
            data,
          });
        });
      });

      req.on('error', (error) => {
        resolve({ success: false, error: error.message });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, error: 'Timeout' });
      });

      req.end();
    });
  }

  /**
   * HTTP POST helper
   */
  private httpPost(url: string, body: string): Promise<{ success: boolean; data?: string; error?: string }> {
    return new Promise((resolve) => {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';
      const httpModule = isHttps ? https : http;

      const options: http.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname,
        method: 'POST',
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      };

      if (this.config?.spokeToken) {
        (options.headers as Record<string, string>)['Authorization'] = `Bearer ${this.config.spokeToken}`;
      }

      if (isHttps && process.env.NODE_ENV !== 'production') {
        (options as https.RequestOptions).rejectUnauthorized = false;
      }

      const req = httpModule.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          resolve({
            success: res.statusCode === 200 || res.statusCode === 201,
            data,
          });
        });
      });

      req.on('error', (error) => {
        resolve({ success: false, error: error.message });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, error: 'Timeout' });
      });

      req.write(body);
      req.end();
    });
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const spokeOPAL = new SpokeOPALService();

export default SpokeOPALService;
