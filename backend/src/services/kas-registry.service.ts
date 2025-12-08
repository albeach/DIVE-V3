/**
 * KAS Registry Service
 * Phase 4, Task 1.3-1.4: Cross-Instance KAS Integration
 * 
 * Loads KAS registry configuration and provides cross-instance
 * key access functionality for federated encrypted resources.
 * 
 * NATO Compliance: ACP-240 Section 5.3 (Multi-KAS Architecture)
 */

import fs from 'fs';
import path from 'path';
import axios, { AxiosInstance } from 'axios';
import https from 'https';
import { logger } from '../utils/logger';

// ============================================
// Interfaces
// ============================================

export interface IKASAuthConfig {
  jwtIssuer?: string;
  jwtAudience?: string;
  apiKey?: string;
  apiKeyHeader?: string;
  clientCert?: string;
  clientKey?: string;
  caCert?: string;
  oauth2ClientId?: string;
  oauth2ClientSecret?: string;
  oauth2TokenUrl?: string;
}

export interface IKASServer {
  kasId: string;
  organization: string;
  countryCode: string;
  kasUrl: string;
  internalKasUrl?: string;
  authMethod: 'jwt' | 'apikey' | 'mtls' | 'oauth2';
  authConfig: IKASAuthConfig;
  trustLevel: 'high' | 'medium' | 'low';
  supportedCountries: string[];
  supportedCOIs: string[];
  policyTranslation?: {
    clearanceMapping?: Record<string, string>;
    countryMapping?: Record<string, string>;
    coiMapping?: Record<string, string>;
  };
  metadata: {
    version: string;
    capabilities: string[];
    contact: string;
    lastVerified: string;
    healthEndpoint?: string;
    requestKeyEndpoint?: string;
  };
}

export interface IKASRegistry {
  version: string;
  metadata: {
    lastUpdated: string;
    maintainer: string;
    description: string;
    compliance: string[];
  };
  kasServers: IKASServer[];
  federationTrust: {
    model: string;
    defaultTrustLevel: string;
    trustMatrix: Record<string, string[]>;
    crossKASEnabled: boolean;
    failClosedOnKASUnavailable: boolean;
    maxCrossKASLatencyMs: number;
    retryPolicy: {
      maxRetries: number;
      backoffMs: number;
      exponentialBackoff: boolean;
    };
  };
  monitoring: {
    healthCheckIntervalSeconds: number;
    alertOnKASDown: boolean;
    logCrossKASRequests: boolean;
    auditRetentionDays: number;
  };
}

export interface ICrossKASRequest {
  resourceId: string;
  kaoId: string;
  wrappedKey?: string;
  bearerToken: string;
  subject: {
    uniqueID: string;
    clearance: string;
    countryOfAffiliation: string;
    acpCOI?: string[];
  };
  requestId: string;
}

export interface ICrossKASResponse {
  success: boolean;
  dek?: string;
  error?: string;
  denialReason?: string;
  auditEventId?: string;
  kasId: string;
  organization: string;
  latencyMs?: number;
}

// ============================================
// KAS Registry Service
// ============================================

class KASRegistryService {
  private registry: IKASRegistry | null = null;
  private kasClients: Map<string, AxiosInstance> = new Map();
  private kasHealthStatus: Map<string, { healthy: boolean; lastCheck: Date }> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private instanceRealm: string;

  constructor() {
    this.instanceRealm = process.env.INSTANCE_REALM || 'USA';
  }

  /**
   * Load KAS registry from configuration file
   */
  async loadRegistry(): Promise<void> {
    const registryPath = path.join(process.cwd(), '..', 'config', 'kas-registry.json');
    const altRegistryPath = path.join(process.cwd(), 'config', 'kas-registry.json');
    
    let actualPath = registryPath;
    
    try {
      // Try primary path first, then alternative
      if (!fs.existsSync(registryPath)) {
        if (fs.existsSync(altRegistryPath)) {
          actualPath = altRegistryPath;
        } else {
          logger.warn('KAS registry not found, cross-instance KAS disabled', {
            primaryPath: registryPath,
            altPath: altRegistryPath
          });
          return;
        }
      }

      const registryContent = fs.readFileSync(actualPath, 'utf-8');
      this.registry = JSON.parse(registryContent) as IKASRegistry;

      logger.info('KAS registry loaded successfully', {
        version: this.registry.version,
        kasCount: this.registry.kasServers.length,
        kasIds: this.registry.kasServers.map(k => k.kasId),
        crossKASEnabled: this.registry.federationTrust.crossKASEnabled
      });

      // Initialize HTTP clients for each KAS
      for (const kas of this.registry.kasServers) {
        this.initializeKASClient(kas);
      }

      // Start health check monitoring
      this.startHealthChecks();

    } catch (error) {
      logger.error('Failed to load KAS registry', {
        error: error instanceof Error ? error.message : 'Unknown error',
        path: actualPath
      });
    }
  }

  /**
   * Initialize authenticated HTTP client for a KAS server
   */
  private initializeKASClient(kas: IKASServer): void {
    // Determine URL to use (internal for same network, external otherwise)
    const isLocal = kas.kasId === `${this.instanceRealm.toLowerCase()}-kas`;
    const baseURL = isLocal && kas.internalKasUrl ? kas.internalKasUrl : kas.kasUrl;

    const config: any = {
      baseURL,
      timeout: this.registry?.federationTrust.maxCrossKASLatencyMs || 5000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'DIVE-V3-CrossKAS-Client/1.0',
        'X-Origin-Realm': this.instanceRealm
      }
    };

    // Configure authentication based on method
    switch (kas.authMethod) {
      case 'mtls':
        if (kas.authConfig.clientCert && kas.authConfig.clientKey) {
          try {
            config.httpsAgent = new https.Agent({
              cert: fs.readFileSync(kas.authConfig.clientCert),
              key: fs.readFileSync(kas.authConfig.clientKey),
              ca: kas.authConfig.caCert ? fs.readFileSync(kas.authConfig.caCert) : undefined,
              rejectUnauthorized: true
            });
          } catch (certError) {
            logger.warn('mTLS certificate loading failed for KAS', {
              kasId: kas.kasId,
              error: certError instanceof Error ? certError.message : 'Unknown error'
            });
          }
        }
        break;

      case 'apikey':
        const headerName = kas.authConfig.apiKeyHeader || 'X-API-Key';
        config.headers[headerName] = kas.authConfig.apiKey || process.env[`${kas.kasId.toUpperCase().replace('-', '_')}_API_KEY`];
        break;

      case 'jwt':
        // JWT token added per-request from bearer token
        break;

      case 'oauth2':
        // OAuth2 token obtained separately per-request
        break;
    }

    this.kasClients.set(kas.kasId, axios.create(config));
    this.kasHealthStatus.set(kas.kasId, { healthy: true, lastCheck: new Date() });

    logger.debug('KAS client initialized', {
      kasId: kas.kasId,
      baseURL,
      authMethod: kas.authMethod,
      isLocal
    });
  }

  /**
   * Start periodic health checks for all KAS servers
   */
  private startHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    const intervalMs = (this.registry?.monitoring.healthCheckIntervalSeconds || 30) * 1000;

    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, intervalMs);

    // Perform initial health check
    this.performHealthChecks().catch(err => {
      logger.warn('Initial KAS health check failed', { error: err.message });
    });
  }

  /**
   * Perform health checks on all KAS servers
   */
  private async performHealthChecks(): Promise<void> {
    if (!this.registry) return;

    for (const kas of this.registry.kasServers) {
      try {
        const client = this.kasClients.get(kas.kasId);
        if (!client) continue;

        const healthEndpoint = kas.metadata.healthEndpoint || '/health';
        const response = await client.get(healthEndpoint, { timeout: 3000 });

        this.kasHealthStatus.set(kas.kasId, {
          healthy: response.status === 200,
          lastCheck: new Date()
        });

      } catch {
        const wasHealthy = this.kasHealthStatus.get(kas.kasId)?.healthy ?? true;
        
        this.kasHealthStatus.set(kas.kasId, {
          healthy: false,
          lastCheck: new Date()
        });

        if (wasHealthy) {
          logger.warn('KAS server became unhealthy', {
            kasId: kas.kasId,
            organization: kas.organization,
            alerting: this.registry?.monitoring.alertOnKASDown
          });
        }
      }
    }
  }

  /**
   * Get KAS server by ID
   */
  getKAS(kasId: string): IKASServer | undefined {
    return this.registry?.kasServers.find(k => k.kasId === kasId);
  }

  /**
   * Get KAS server by country code (e.g., "USA" → "usa-kas")
   */
  getKASByCountry(countryCode: string): IKASServer | undefined {
    const kasId = `${countryCode.toLowerCase()}-kas`;
    return this.getKAS(kasId);
  }

  /**
   * Determine KAS authority for a resource based on originRealm
   */
  getKASAuthority(resource: any): string {
    // Priority: explicit kasAuthority > originRealm-derived > local instance
    if (resource.kasAuthority) {
      return resource.kasAuthority;
    }

    if (resource.originRealm) {
      return `${resource.originRealm.toLowerCase()}-kas`;
    }

    // Default to local instance KAS
    return `${this.instanceRealm.toLowerCase()}-kas`;
  }

  /**
   * Check if resource requires cross-instance KAS access
   */
  isCrossInstanceResource(resource: any): boolean {
    const kasAuthority = this.getKASAuthority(resource);
    const localKasId = `${this.instanceRealm.toLowerCase()}-kas`;
    return kasAuthority !== localKasId;
  }

  /**
   * Request key from remote KAS (cross-instance)
   */
  async requestCrossKASKey(
    kasId: string,
    request: ICrossKASRequest
  ): Promise<ICrossKASResponse> {
    const startTime = Date.now();
    const kas = this.getKAS(kasId);

    if (!kas) {
      return {
        success: false,
        error: 'KAS_NOT_FOUND',
        denialReason: `KAS server ${kasId} not found in registry`,
        kasId,
        organization: 'Unknown'
      };
    }

    // Check if KAS is healthy
    const health = this.kasHealthStatus.get(kasId);
    if (health && !health.healthy && this.registry?.federationTrust.failClosedOnKASUnavailable) {
      logger.warn('Cross-KAS request blocked - KAS unhealthy (fail-closed)', {
        kasId,
        organization: kas.organization,
        lastHealthCheck: health.lastCheck
      });

      return {
        success: false,
        error: 'KAS_UNAVAILABLE',
        denialReason: `KAS server ${kasId} is unavailable (fail-closed security)`,
        kasId,
        organization: kas.organization,
        latencyMs: Date.now() - startTime
      };
    }

    // Check trust relationship
    const localKasId = `${this.instanceRealm.toLowerCase()}-kas`;
    const trustedKases = this.registry?.federationTrust.trustMatrix[localKasId] || [];
    
    if (!trustedKases.includes(kasId)) {
      logger.warn('Cross-KAS request blocked - no trust relationship', {
        localKas: localKasId,
        targetKas: kasId,
        trustedKases
      });

      return {
        success: false,
        error: 'TRUST_NOT_ESTABLISHED',
        denialReason: `No trust relationship between ${localKasId} and ${kasId}`,
        kasId,
        organization: kas.organization,
        latencyMs: Date.now() - startTime
      };
    }

    const client = this.kasClients.get(kasId);
    if (!client) {
      return {
        success: false,
        error: 'CLIENT_NOT_INITIALIZED',
        denialReason: `HTTP client not initialized for KAS ${kasId}`,
        kasId,
        organization: kas.organization,
        latencyMs: Date.now() - startTime
      };
    }

    // Translate clearance if needed
    let translatedClearance = request.subject.clearance;
    if (kas.policyTranslation?.clearanceMapping) {
      translatedClearance = kas.policyTranslation.clearanceMapping[request.subject.clearance] 
        || request.subject.clearance;
    }

    logger.info('Initiating cross-KAS key request', {
      requestId: request.requestId,
      resourceId: request.resourceId,
      kasId,
      organization: kas.organization,
      subject: {
        uniqueID: request.subject.uniqueID,
        clearance: request.subject.clearance,
        translatedClearance,
        country: request.subject.countryOfAffiliation
      },
      originInstance: this.instanceRealm
    });

    // Build request payload
    const payload = {
      resourceId: request.resourceId,
      kaoId: request.kaoId,
      wrappedKey: request.wrappedKey,
      bearerToken: request.bearerToken,
      requestTimestamp: new Date().toISOString(),
      requestId: request.requestId,
      originInstance: this.instanceRealm,
      subject: {
        uniqueID: request.subject.uniqueID,
        clearance: translatedClearance,
        countryOfAffiliation: request.subject.countryOfAffiliation,
        acpCOI: request.subject.acpCOI || []
      }
    };

    // Retry logic
    const retryPolicy = this.registry?.federationTrust.retryPolicy;
    const maxRetries = retryPolicy?.maxRetries || 2;
    let lastError: any = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const requestKeyEndpoint = kas.metadata.requestKeyEndpoint || '/request-key';
        
        const response = await client.post(requestKeyEndpoint, payload, {
          headers: {
            'Authorization': `Bearer ${request.bearerToken}`,
            'X-Request-ID': request.requestId,
            'X-Origin-Realm': this.instanceRealm
          }
        });

        const latencyMs = Date.now() - startTime;

        logger.info('Cross-KAS key request successful', {
          requestId: request.requestId,
          resourceId: request.resourceId,
          kasId,
          organization: kas.organization,
          latencyMs,
          attempt
        });

        return {
          success: true,
          dek: response.data.dek,
          auditEventId: response.data.auditEventId,
          kasId,
          organization: kas.organization,
          latencyMs
        };

      } catch (error: any) {
        lastError = error;

        // Check if it's a 403 denial (don't retry)
        if (axios.isAxiosError(error) && error.response?.status === 403) {
          const latencyMs = Date.now() - startTime;
          
          logger.warn('Cross-KAS key request denied', {
            requestId: request.requestId,
            resourceId: request.resourceId,
            kasId,
            organization: kas.organization,
            denialReason: error.response.data?.denialReason,
            latencyMs
          });

          return {
            success: false,
            error: 'ACCESS_DENIED',
            denialReason: error.response.data?.denialReason || 'Access denied by remote KAS',
            kasId,
            organization: kas.organization,
            latencyMs
          };
        }

        // Retry on network/timeout errors
        if (attempt < maxRetries) {
          const backoffMs = retryPolicy?.exponentialBackoff
            ? (retryPolicy.backoffMs || 500) * Math.pow(2, attempt)
            : (retryPolicy?.backoffMs || 500);

          logger.warn('Cross-KAS request failed, retrying', {
            requestId: request.requestId,
            kasId,
            attempt: attempt + 1,
            maxRetries,
            backoffMs,
            error: error.message
          });

          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }

    // All retries exhausted
    const latencyMs = Date.now() - startTime;

    logger.error('Cross-KAS key request failed after retries', {
      requestId: request.requestId,
      resourceId: request.resourceId,
      kasId,
      organization: kas.organization,
      error: lastError?.message,
      latencyMs,
      maxRetries
    });

    return {
      success: false,
      error: 'KAS_REQUEST_FAILED',
      denialReason: `Failed to contact KAS ${kasId}: ${lastError?.message || 'Unknown error'}`,
      kasId,
      organization: kas.organization,
      latencyMs
    };
  }

  /**
   * Get all registered KAS servers
   */
  getAllKAS(): IKASServer[] {
    return this.registry?.kasServers || [];
  }

  /**
   * Get KAS health status
   */
  getKASHealth(): Record<string, { healthy: boolean; lastCheck: Date }> {
    const status: Record<string, { healthy: boolean; lastCheck: Date }> = {};
    this.kasHealthStatus.forEach((value, key) => {
      status[key] = value;
    });
    return status;
  }

  /**
   * Check if cross-KAS is enabled
   */
  isCrossKASEnabled(): boolean {
    return this.registry?.federationTrust.crossKASEnabled ?? false;
  }

  /**
   * Cleanup resources
   */
  shutdown(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    this.kasClients.clear();
    this.kasHealthStatus.clear();
  }
}

// Singleton instance
export const kasRegistryService = new KASRegistryService();

// Export for initialization
export default kasRegistryService;










