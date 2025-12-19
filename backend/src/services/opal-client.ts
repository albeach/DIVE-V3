/**
 * DIVE V3 - OPAL Client
 * 
 * Client wrapper for OPAL (Open Policy Administration Layer) Server API.
 * Provides methods to:
 * - Publish data updates to OPAL Server
 * - Trigger policy refreshes
 * - Check OPAL health status
 * - Manage data topics
 * 
 * OPAL Documentation: https://docs.opal.ac/
 * 
 * @version 1.0.0
 * @date 2025-12-03
 */

import { logger } from '../utils/logger';

// ============================================
// TYPES
// ============================================

export interface IOPALDataUpdate {
  /** Topics to publish to (e.g., "policy_data") */
  topics?: string[];
  /** Entries to update */
  entries: IOPALDataEntry[];
  /** Reason for update (for audit) */
  reason?: string;
}

export interface IOPALDataEntry {
  /** URL to fetch data from (optional if data provided) */
  url?: string;
  /** Path in OPA data store (e.g., "trusted_issuers") */
  dst_path: string;
  /** Data to store (optional if URL provided) */
  data?: unknown;
  /** HTTP method if URL used */
  method?: 'GET' | 'POST';
  /** Headers if URL used */
  headers?: Record<string, string>;
  /** Save method */
  save_method?: 'PUT' | 'PATCH';
}

export interface IOPALHealthStatus {
  healthy: boolean;
  opaConnected: boolean;
  clientsConnected: number;
  lastPolicyUpdate?: string;
  lastDataUpdate?: string;
  version?: string;
}

export interface IOPALPublishResult {
  success: boolean;
  transactionId?: string;
  message: string;
  error?: string;
  timestamp: string;
}

export interface IOPALClientConfig {
  serverUrl: string;
  dataTopics: string[];
  clientToken?: string;
  timeoutMs: number;
  retryAttempts: number;
  retryDelayMs: number;
}

// ============================================
// CONFIGURATION
// ============================================

const DEFAULT_CONFIG: IOPALClientConfig = {
  serverUrl: process.env.OPAL_SERVER_URL || 'http://opal-server:7002',
  dataTopics: (process.env.OPAL_DATA_TOPICS || 'policy_data').split(','),
  clientToken: process.env.OPAL_CLIENT_TOKEN || '',
  timeoutMs: parseInt(process.env.OPAL_TIMEOUT_MS || '10000', 10),
  retryAttempts: parseInt(process.env.OPAL_RETRY_ATTEMPTS || '3', 10),
  retryDelayMs: parseInt(process.env.OPAL_RETRY_DELAY_MS || '1000', 10)
};

// ============================================
// OPAL CLIENT CLASS
// ============================================

class OPALClient {
  private config: IOPALClientConfig;
  private isEnabled: boolean;

  constructor(config: Partial<IOPALClientConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    // OPAL is enabled if OPAL_SERVER_URL is set
    this.isEnabled = process.env.OPAL_ENABLED !== 'false' && 
                     !!process.env.OPAL_SERVER_URL;
    
    if (this.isEnabled) {
      logger.info('OPAL client initialized', {
        serverUrl: this.config.serverUrl,
        topics: this.config.dataTopics,
        timeoutMs: this.config.timeoutMs
      });
    } else {
      logger.info('OPAL client disabled - using static policy data');
    }
  }

  /**
   * Check if OPAL integration is enabled
   */
  isOPALEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Make HTTP request with retry logic
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    const fetchOptions: RequestInit = {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
        ...(this.config.clientToken && { 
          'Authorization': `Bearer ${this.config.clientToken}` 
        })
      }
    };

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const response = await fetch(url, fetchOptions);
        clearTimeout(timeout);
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < this.config.retryAttempts) {
          logger.warn('OPAL request failed, retrying', {
            url,
            attempt,
            maxAttempts: this.config.retryAttempts,
            error: lastError.message
          });
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelayMs));
        }
      }
    }

    clearTimeout(timeout);
    throw lastError || new Error('OPAL request failed');
  }

  /**
   * Check OPAL Server health status
   */
  async checkHealth(): Promise<IOPALHealthStatus> {
    if (!this.isEnabled) {
      return {
        healthy: false,
        opaConnected: false,
        clientsConnected: 0,
        version: 'disabled'
      };
    }

    try {
      const response = await this.fetchWithRetry(
        `${this.config.serverUrl}/healthcheck`
      );

      if (!response.ok) {
        return {
          healthy: false,
          opaConnected: false,
          clientsConnected: 0
        };
      }

      const data = await response.json() as Record<string, unknown>;
      
      return {
        healthy: true,
        opaConnected: (data.opa_connected as boolean) ?? true,
        clientsConnected: (data.clients_connected as number) ?? 0,
        lastPolicyUpdate: data.last_policy_update as string | undefined,
        lastDataUpdate: data.last_data_update as string | undefined,
        version: data.version as string | undefined
      };
    } catch (error) {
      logger.error('OPAL health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return {
        healthy: false,
        opaConnected: false,
        clientsConnected: 0
      };
    }
  }

  /**
   * Publish data update to OPAL Server
   * This triggers all connected OPAL clients to fetch the new data
   */
  async publishDataUpdate(update: IOPALDataUpdate): Promise<IOPALPublishResult> {
    const timestamp = new Date().toISOString();

    if (!this.isEnabled) {
      logger.debug('OPAL disabled - skipping data publish', {
        entriesCount: update.entries.length
      });
      return {
        success: true,
        message: 'OPAL disabled - data not published',
        timestamp
      };
    }

    try {
      const topics = update.topics || this.config.dataTopics;
      
      logger.info('Publishing data update to OPAL', {
        topics,
        entriesCount: update.entries.length,
        reason: update.reason || 'manual update'
      });

      // Construct the data update payload
      // OPAL Server expects a specific format for data updates
      const payload = {
        reason: update.reason || 'DIVE V3 data sync',
        entries: update.entries.map(entry => ({
          url: entry.url,
          dst_path: entry.dst_path,
          data: entry.data,
          save_method: entry.save_method || 'PUT',
          topics: topics
        }))
      };

      const response = await this.fetchWithRetry(
        `${this.config.serverUrl}/data/config`,
        {
          method: 'POST',
          body: JSON.stringify(payload)
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OPAL server returned ${response.status}: ${errorText}`);
      }

      const result = await response.json() as { transaction_id?: string };

      logger.info('OPAL data update published successfully', {
        transactionId: result.transaction_id,
        topics,
        entriesCount: update.entries.length
      });

      return {
        success: true,
        transactionId: result.transaction_id,
        message: 'Data update published successfully',
        timestamp
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Failed to publish OPAL data update', {
        error: errorMessage,
        entriesCount: update.entries.length
      });

      return {
        success: false,
        message: 'Failed to publish data update',
        error: errorMessage,
        timestamp
      };
    }
  }

  /**
   * Trigger policy refresh on all connected clients
   */
  async triggerPolicyRefresh(): Promise<IOPALPublishResult> {
    const timestamp = new Date().toISOString();

    if (!this.isEnabled) {
      return {
        success: true,
        message: 'OPAL disabled - policy refresh skipped',
        timestamp
      };
    }

    try {
      logger.info('Triggering OPAL policy refresh');

      const response = await this.fetchWithRetry(
        `${this.config.serverUrl}/policy/refresh`,
        { method: 'POST' }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Policy refresh failed: ${errorText}`);
      }

      const result = await response.json() as { transaction_id?: string };

      logger.info('OPAL policy refresh triggered successfully', {
        transactionId: result.transaction_id
      });

      return {
        success: true,
        transactionId: result.transaction_id,
        message: 'Policy refresh triggered',
        timestamp
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Failed to trigger OPAL policy refresh', { error: errorMessage });

      return {
        success: false,
        message: 'Failed to trigger policy refresh',
        error: errorMessage,
        timestamp
      };
    }
  }

  /**
   * Publish inline data directly to OPA via OPAL
   * Useful for small data updates that don't need a separate HTTP endpoint
   */
  async publishInlineData(
    path: string,
    data: unknown,
    reason?: string
  ): Promise<IOPALPublishResult> {
    return this.publishDataUpdate({
      entries: [{
        dst_path: path,
        data
      }],
      reason: reason || `Inline data update: ${path}`
    });
  }

  /**
   * Get current OPAL configuration
   */
  getConfig(): Readonly<IOPALClientConfig> {
    return { ...this.config };
  }

  /**
   * Update client configuration
   */
  updateConfig(config: Partial<IOPALClientConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('OPAL client configuration updated', {
      serverUrl: this.config.serverUrl,
      topics: this.config.dataTopics
    });
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const opalClient = new OPALClient();

export default OPALClient;
