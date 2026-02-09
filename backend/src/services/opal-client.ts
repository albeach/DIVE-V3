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
 * AUTHENTICATION:
 * This client uses JWT-based authentication. The raw OPAL_AUTH_MASTER_TOKEN
 * is NOT sent directly to OPAL endpoints. Instead, we use opalTokenService
 * to obtain a proper JWT from the OPAL server's /token endpoint.
 *
 * Token Flow:
 * 1. On startup, initializeJwt() requests a JWT from OPAL server /token endpoint
 * 2. opalTokenService.generateClientToken() uses OPAL_AUTH_MASTER_TOKEN internally
 * 3. The returned JWT (eyJ...) is cached and used for all subsequent API calls
 * 4. JWT is auto-refreshed before expiry (5 minute buffer)
 *
 * OPAL Documentation: https://docs.opal.ac/
 *
 * @version 2.0.0
 * @date 2026-01-22
 */

import { logger } from '../utils/logger';
import { opalTokenService } from './opal-token.service';
import { opalMetricsService } from './opal-metrics.service';

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
// OPAL DATA URL MAPPING
// ============================================
// OPAL server expects URL-based data entries - it fetches data from these URLs
// Map dst_path to the corresponding backend API endpoint
// The backend exposes /api/opal/* endpoints that serve data from MongoDB (SSOT)

const BACKEND_BASE_URL = process.env.OPAL_DATA_BACKEND_URL ||
  'https://host.docker.internal:4000';

const DATA_PATH_TO_URL: Record<string, { url: string; topics: string[] }> = {
  'trusted_issuers': {
    url: `${BACKEND_BASE_URL}/api/opal/trusted-issuers`,
    topics: ['trusted_issuers', 'policy_data']
  },
  'federation_matrix': {
    url: `${BACKEND_BASE_URL}/api/opal/federation-matrix`,
    topics: ['federation_matrix', 'policy_data']
  },
  'tenant_configs': {
    url: `${BACKEND_BASE_URL}/api/opal/tenant-configs`,
    topics: ['tenant_configs', 'policy_data']
  },
  'dive/federation': {
    url: `${BACKEND_BASE_URL}/api/opal/policy-data`,
    topics: ['policy_data']
  },
  // Additional OPAL data sources (FIX 2026-02-07: Eliminate "No URL mapping" warnings)
  'kas_registry': {
    url: `${BACKEND_BASE_URL}/api/kas/registry`,
    topics: ['kas_registry', 'policy_data']
  },
  'coi_definitions': {
    url: `${BACKEND_BASE_URL}/api/opal/coi-definitions`,
    topics: ['coi_definitions', 'policy_data']
  },
  'federation_constraints': {
    url: `${BACKEND_BASE_URL}/api/opal/federation-constraints`,
    topics: ['federation_constraints', 'policy_data']
  },
  // NOTE: authorized_spokes data is already included in /api/opal/policy-data response
  // No separate data source needed - spokes list is part of federation.spokes
  // If dedicated endpoint needed: add public /api/opal/spokes endpoint (no auth required)
  // Note: coi_members data is included in /policy-data response
  // If dedicated endpoint needed, add: 'coi_members': { url: '.../coi-members', topics: [...] }
};

// ============================================
// OPAL CLIENT CLASS
// ============================================

class OPALClient {
  private config: IOPALClientConfig;
  private isEnabled: boolean;

  // JWT Management: Store cached JWT and expiry for OPAL server authentication
  // The JWT is obtained from OPAL server's /token endpoint via opalTokenService
  private jwt: string | null = null;
  private jwtExpiry: Date | null = null;
  private jwtInitPromise: Promise<void> | null = null;

  constructor(config: Partial<IOPALClientConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    // OPAL is enabled if OPAL_SERVER_URL is set
    this.isEnabled = process.env.OPAL_ENABLED !== 'false' &&
      !!process.env.OPAL_SERVER_URL;

    if (this.isEnabled) {
      logger.info('OPAL client initialized (JWT will be fetched on first use)', {
        serverUrl: this.config.serverUrl,
        topics: this.config.dataTopics,
        timeoutMs: this.config.timeoutMs
      });

      // DO NOT eagerly initialize JWT here - it causes startup race conditions
      // JWT will be lazily initialized on first actual use (ensureAuthenticated)
    } else {
      logger.info('OPAL client disabled - using static policy data');
    }
  }

  /**
   * Ensure JWT is initialized before making OPAL requests.
   * Lazy initialization avoids startup timing issues with OPAL server.
   * @private
   */
  private async ensureAuthenticated(): Promise<void> {
    if (this.jwt && this.jwtExpiry && new Date() < this.jwtExpiry) {
      // JWT still valid
      return;
    }

    // Initialize or refresh JWT
    if (!this.jwtInitPromise) {
      this.jwtInitPromise = this.refreshJwt().finally(() => {
        this.jwtInitPromise = null; // Allow retry on next call
      });
    }

    await this.jwtInitPromise;

    if (!this.jwt) {
      throw new Error('Failed to authenticate with OPAL server');
    }
  }

  /**
   * Initialize JWT with retry logic (DEPRECATED - now handled by ensureAuthenticated).
   * Kept for backward compatibility but no longer called from constructor.
   * @deprecated Use ensureAuthenticated() instead
   */
  private async initializeJwt(): Promise<void> {
    // This method is no longer used but kept for backward compatibility
    logger.warn('initializeJwt() is deprecated - JWT is now lazily initialized');
  }

  /**
   * Refresh JWT from OPAL server using opalTokenService.
   *
   * IMPORTANT: For data publishing, we need a DATASOURCE type token, not CLIENT.
   * - CLIENT tokens: For OPAL clients to subscribe to updates
   * - DATASOURCE tokens: For services to publish data updates
   *
   * This method calls opalTokenService.generateDatasourceToken() which:
   * 1. Uses OPAL_AUTH_MASTER_TOKEN to authenticate with OPAL /token endpoint
   * 2. Requests type: 'datasource' token
   * 3. Returns a signed JWT with peer_type: 'datasource'
   */
  private async refreshJwt(): Promise<void> {
    try {
      const tokenData = await opalTokenService.generateDatasourceToken(
        'hub-backend-publisher'
      );

      this.jwt = tokenData.token;
      this.jwtExpiry = tokenData.expiresAt;

      logger.debug('OPAL datasource JWT refreshed', {
        clientId: tokenData.clientId,
        expiresAt: this.jwtExpiry.toISOString()
      });
    } catch (error) {
      logger.error('Failed to refresh OPAL datasource JWT', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Ensure we have a valid JWT, refreshing if necessary.
   * Returns null if JWT cannot be obtained (graceful degradation).
   *
   * This method handles:
   * - Waiting for initial JWT acquisition (constructor race condition)
   * - Checking JWT expiry with 5-minute buffer
   * - Auto-refreshing expired JWTs
   */
  private async ensureJwt(): Promise<string | null> {
    // Wait for initialization if in progress
    if (this.jwtInitPromise) {
      await this.jwtInitPromise;
    }

    // Check if JWT exists and is not expired (with 5 minute buffer)
    if (this.jwt && this.jwtExpiry) {
      const bufferMs = 5 * 60 * 1000; // 5 minutes
      const now = new Date();
      const expiryWithBuffer = new Date(this.jwtExpiry.getTime() - bufferMs);

      if (now < expiryWithBuffer) {
        return this.jwt;
      }

      logger.info('OPAL JWT expiring soon, refreshing');
    }

    // Try to refresh JWT
    try {
      await this.refreshJwt();
      return this.jwt;
    } catch (error) {
      logger.warn('Could not refresh OPAL JWT, operating without push capability', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Check if OPAL integration is enabled
   */
  isOPALEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Make HTTP request with retry logic.
   * ENHANCED: Uses JWT from ensureJwt() instead of raw master token.
   *
   * The JWT is obtained from OPAL server's /token endpoint and cached.
   * This fixes the 401 error that occurred when sending raw master token
   * directly to OPAL API endpoints.
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    // Ensure JWT is available (lazy initialization on first use)
    try {
      await this.ensureAuthenticated();
    } catch (error) {
      logger.warn('Could not authenticate with OPAL server, request may fail', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    const fetchOptions: RequestInit = {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
        // Use JWT if available
        ...(this.jwt && { 'Authorization': `Bearer ${this.jwt}` })
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
   *
   * OPAL DATA/CONFIG API:
   * The OPAL /data/config endpoint expects URL-based entries, not inline data.
   * Each entry must have a `url` field pointing to where OPAL should fetch the data from.
   * We map dst_path to backend API URLs using DATA_PATH_TO_URL mapping.
   */
  async publishDataUpdate(update: IOPALDataUpdate): Promise<IOPALPublishResult> {
    const timestamp = new Date().toISOString();
    const startTime = Date.now();

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
      // Transform entries to use URLs instead of inline data
      // OPAL /data/config endpoint requires URL-based entries
      const urlBasedEntries = update.entries.map(entry => {
        // If entry already has a URL, use it directly
        if (entry.url) {
          return {
            url: entry.url,
            dst_path: entry.dst_path,
            save_method: entry.save_method || 'PUT',
            topics: update.topics || this.config.dataTopics
          };
        }

        // Look up URL mapping for this dst_path
        const mapping = DATA_PATH_TO_URL[entry.dst_path];
        if (mapping) {
          return {
            url: mapping.url,
            dst_path: entry.dst_path,
            save_method: entry.save_method || 'PUT',
            topics: mapping.topics
          };
        }

        // No URL available - log warning and skip this entry
        logger.warn('No URL mapping for OPAL data path - entry will be skipped', {
          dst_path: entry.dst_path,
          hint: 'Add mapping to DATA_PATH_TO_URL or provide url in entry'
        });
        return null;
      }).filter((entry): entry is NonNullable<typeof entry> => entry !== null);

      if (urlBasedEntries.length === 0) {
        logger.warn('No valid entries to publish - all entries lacked URL mappings');

        // Record failed transaction
        await opalMetricsService.recordTransaction(
          'data_update',
          'failed',
          'system',
          {
            dataPath: update.entries.map(e => e.dst_path).join(', '),
            error: 'No valid entries - missing URL mappings',
          },
          Date.now() - startTime
        ).catch(err => logger.error('Failed to record transaction', { error: err.message }));

        return {
          success: false,
          message: 'No valid entries to publish - missing URL mappings',
          timestamp
        };
      }

      logger.info('Publishing URL-based data update to OPAL', {
        entriesCount: urlBasedEntries.length,
        paths: urlBasedEntries.map(e => e.dst_path),
        reason: update.reason || 'manual update'
      });

      // Construct the data update payload with URL-based entries
      // OPAL Server will fetch data from these URLs
      const payload = {
        reason: update.reason || 'DIVE V3 data sync',
        entries: urlBasedEntries
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
      const duration = Date.now() - startTime;

      logger.info('OPAL data update published successfully', {
        transactionId: result.transaction_id,
        entriesCount: urlBasedEntries.length,
        duration
      });

      // Record successful transaction
      await opalMetricsService.recordTransaction(
        'data_update',
        'success',
        'system',
        {
          topics: Array.from(new Set(urlBasedEntries.flatMap(e => e.topics || []))),
          dataPath: urlBasedEntries.map(e => e.dst_path).join(', '),
        },
        duration
      ).catch(err => logger.error('Failed to record transaction', { error: err.message }));

      return {
        success: true,
        transactionId: result.transaction_id,
        message: 'Data update published successfully',
        timestamp
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const duration = Date.now() - startTime;

      logger.error('Failed to publish OPAL data update', {
        error: errorMessage,
        entriesCount: update.entries.length
      });

      // Record failed transaction
      await opalMetricsService.recordTransaction(
        'data_update',
        'failed',
        'system',
        {
          dataPath: update.entries.map(e => e.dst_path).join(', '),
          error: errorMessage,
        },
        duration
      ).catch(err => logger.error('Failed to record transaction', { error: err.message }));

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
   * Trigger OPAL to re-fetch data for a specific path.
   *
   * IMPORTANT: This does NOT send inline data to OPAL.
   * Instead, it tells OPAL to fetch fresh data from the mapped URL.
   *
   * Prerequisites:
   * 1. The data must already be stored in MongoDB (SSOT)
   * 2. The backend /api/opal/* endpoint must serve this data
   * 3. The path must have a URL mapping in DATA_PATH_TO_URL
   *
   * Flow:
   * 1. Caller updates data in MongoDB
   * 2. Caller calls publishInlineData('trusted_issuers', data, reason)
   * 3. This method tells OPAL to fetch from /api/opal/trusted-issuers
   * 4. OPAL fetches fresh data and pushes to connected OPA clients
   *
   * @param path - The OPA data path (e.g., 'trusted_issuers', 'federation_matrix')
   * @param _data - DEPRECATED: Data is ignored (fetched from URL instead)
   * @param reason - Audit reason for the update
   */
  async publishInlineData(
    path: string,
    _data: unknown,
    reason?: string
  ): Promise<IOPALPublishResult> {
    // Check if we have a URL mapping for this path
    const mapping = DATA_PATH_TO_URL[path];
    if (!mapping) {
      logger.warn('No URL mapping for path - cannot trigger OPAL refresh', {
        path,
        availablePaths: Object.keys(DATA_PATH_TO_URL)
      });
      return {
        success: false,
        message: `No URL mapping for path: ${path}`,
        error: 'Missing URL mapping in DATA_PATH_TO_URL',
        timestamp: new Date().toISOString()
      };
    }

    return this.publishDataUpdate({
      entries: [{
        dst_path: path,
        url: mapping.url  // Use URL-based update, not inline data
      }],
      topics: mapping.topics,
      reason: reason || `Data update: ${path}`
    });
  }

  /**
   * Trigger OPAL to re-fetch all registered data paths.
   * Useful for forcing a full data sync after bulk MongoDB updates.
   */
  async triggerFullDataRefresh(reason?: string): Promise<IOPALPublishResult> {
    const entries = Object.entries(DATA_PATH_TO_URL).map(([path, mapping]) => ({
      dst_path: path,
      url: mapping.url,
      topics: mapping.topics
    }));

    logger.info('Triggering full OPAL data refresh', {
      paths: Object.keys(DATA_PATH_TO_URL),
      reason: reason || 'full data refresh'
    });

    return this.publishDataUpdate({
      entries,
      reason: reason || 'Full data refresh'
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
