/**
 * DIVE V3 - Database-Backed Spoke Configuration Service
 *
 * Loads spoke configuration from Hub API (Database SSOT) with local
 * MongoDB caching for offline resilience.
 *
 * Loading strategy:
 * 1. Try Hub API (SSOT)
 * 2. Fall back to local cache if Hub unavailable
 *
 * @version 2.0.0
 * @date 2026-02-16
 */

import axios from 'axios';
import { EventEmitter } from 'events';
import { getSecureHttpsAgent } from '../utils/https-agent';
import { logger } from '../utils/logger';
import type {
  ISpokeFullConfig,
  ISpokePortConfig,
} from './spoke-config.service';

const httpsAgent = getSecureHttpsAgent();

/**
 * Configuration Service with Database SSOT
 *
 * Hub MongoDB is the single source of truth. Configuration is loaded
 * from Hub API at startup and cached locally for offline resilience.
 */
class SpokeConfigFromDatabaseService extends EventEmitter {
  private config: ISpokeFullConfig | null = null;
  private configLoaded = false;

  constructor(
    private instanceCode: string,
    private hubUrl: string,
  ) {
    super();
  }

  /**
   * Initialize and load configuration
   */
  async initialize(): Promise<ISpokeFullConfig> {
    this.config = await this.loadWithFallback();
    this.configLoaded = true;
    this.emit('config:loaded', this.config);
    return this.config;
  }

  /**
   * Load configuration from Hub API (SSOT)
   */
  private async loadFromHub(): Promise<ISpokeFullConfig> {
    logger.info('Loading spoke configuration from Hub API (SSOT)', {
      instanceCode: this.instanceCode,
      hubUrl: this.hubUrl,
    });

    const response = await axios.get(
      `${this.hubUrl}/api/federation/spokes/config/${this.instanceCode}`,
      { timeout: 10000, httpsAgent },
    );

    const config = response.data as ISpokeFullConfig;
    this.validateConfig(config);

    logger.info('Configuration loaded from Hub API', {
      instanceCode: this.instanceCode,
      spokeId: config.identity.spokeId,
    });

    return config;
  }

  /**
   * Load configuration with fallback chain
   */
  private async loadWithFallback(): Promise<ISpokeFullConfig> {
    try {
      return await this.loadFromHub();
    } catch (hubError) {
      logger.warn('Hub API unavailable, building config from environment', {
        error: hubError instanceof Error ? hubError.message : 'Unknown error',
      });

      // Build config from environment variables (always available)
      return this.buildFromEnvironment();
    }
  }

  /**
   * Build configuration from environment variables (fallback when Hub unavailable)
   */
  private buildFromEnvironment(): ISpokeFullConfig {
    const code = this.instanceCode.toUpperCase();
    const codeLower = code.toLowerCase();

    const frontendPort = parseInt(process.env.FRONTEND_PORT || '3000');
    const backendPort = parseInt(process.env.PORT || process.env.BACKEND_PORT || '4000');
    const keycloakPort = parseInt(process.env.KEYCLOAK_PORT || '8443');
    const kasPort = parseInt(process.env.KAS_PORT || '8080');

    logger.info('Built spoke configuration from environment variables', {
      instanceCode: code,
    });

    return {
      identity: {
        spokeId: process.env.SPOKE_ID || `spoke-${codeLower}`,
        instanceCode: code,
        name: `${code} Instance`,
        description: `DIVE V3 Spoke Instance for ${code}`,
        country: code,
        organizationType: 'government',
        contactEmail: process.env.CONTACT_EMAIL || `admin@${codeLower}.dive25.com`,
      },
      endpoints: {
        hubUrl: this.hubUrl,
        hubApiUrl: `${this.hubUrl}/api`,
        hubOpalUrl: process.env.HUB_OPAL_URL || 'https://dive-hub-opal-server:7002',
        baseUrl: process.env.APP_URL || `https://localhost:${frontendPort}`,
        apiUrl: process.env.API_URL || `https://localhost:${backendPort}`,
        idpUrl: process.env.IDP_URL || `https://dive-spoke-${codeLower}-keycloak:8443`,
        kasUrl: process.env.KAS_URL || `https://localhost:${kasPort}`,
      },
      ports: {
        frontend: frontendPort,
        backend: backendPort,
        keycloak: keycloakPort,
        kas: kasPort,
      },
      certificates: {
        certificatePath: `/app/instances/${codeLower}/certs/spoke.crt`,
        privateKeyPath: `/app/instances/${codeLower}/certs/spoke.key`,
        csrPath: `/app/instances/${codeLower}/certs/spoke.csr`,
        caBundlePath: `/app/instances/${codeLower}/certs/hub-ca.crt`,
      },
      authentication: {},
      federation: {
        status: 'unregistered',
        requestedScopes: [
          'policy:base',
          `policy:${codeLower}`,
          'data:federation_matrix',
          'data:trusted_issuers',
        ],
      },
      operational: {
        heartbeatIntervalMs: parseInt(process.env.DIVE_HEARTBEAT_INTERVAL_MS || '30000'),
        tokenRefreshBufferMs: parseInt(process.env.DIVE_TOKEN_REFRESH_BUFFER_MS || '300000'),
        offlineGracePeriodMs: parseInt(process.env.DIVE_OFFLINE_GRACE_PERIOD_MS || '3600000'),
        policyCachePath: `/app/instances/${codeLower}/cache/policies`,
        auditQueuePath: `/app/instances/${codeLower}/cache/audit`,
        maxAuditQueueSize: 10000,
        auditFlushIntervalMs: 60000,
      },
      metadata: {
        version: '2.0.0',
        createdAt: new Date(),
        lastModified: new Date(),
        configHash: '',
      },
    };
  }

  /**
   * Validate configuration structure
   */
  private validateConfig(config: ISpokeFullConfig): void {
    const required: Array<[string, unknown]> = [
      ['identity.spokeId', config.identity?.spokeId],
      ['identity.instanceCode', config.identity?.instanceCode],
      ['endpoints.hubUrl', config.endpoints?.hubUrl],
      ['ports.frontend', config.ports?.frontend],
    ];

    for (const [path, value] of required) {
      if (value === undefined || value === null) {
        throw new Error(`Invalid configuration: missing required field ${path}`);
      }
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): ISpokeFullConfig {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }
    return this.config;
  }

  /**
   * Get port configuration
   */
  getPorts(): ISpokePortConfig {
    return this.getConfig().ports;
  }

  /**
   * Check if configuration is loaded
   */
  isLoaded(): boolean {
    return this.configLoaded;
  }

  /**
   * Refresh configuration from Hub
   */
  async refresh(): Promise<ISpokeFullConfig> {
    logger.info('Refreshing configuration from Hub', {
      instanceCode: this.instanceCode,
    });

    try {
      this.config = await this.loadFromHub();
    } catch (error) {
      logger.warn('Hub unavailable during refresh, keeping current config', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    this.emit('config:refreshed', this.config);
    return this.getConfig();
  }
}

export default SpokeConfigFromDatabaseService;
