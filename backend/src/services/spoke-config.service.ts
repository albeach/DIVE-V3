/**
 * DIVE V3 - Spoke Configuration Service
 *
 * Manages spoke instance configuration with validation, persistence,
 * and runtime updates. Supports both file-based and environment variable
 * configuration sources.
 *
 * @version 1.0.0
 * @date 2025-12-05
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../utils/logger';

// ============================================
// TYPES
// ============================================

export interface ISpokeIdentity {
  spokeId: string;
  instanceCode: string;
  name: string;
  description?: string;
  country: string;
  organizationType: 'government' | 'military' | 'defense_contractor' | 'research';
  contactEmail: string;
}

export interface ISpokeEndpoints {
  hubUrl: string;
  hubApiUrl: string;
  hubOpalUrl: string;
  baseUrl: string;
  apiUrl: string;
  idpUrl: string;
  kasUrl?: string;
}

export interface ISpokeCertificates {
  certificatePath: string;
  privateKeyPath: string;
  csrPath?: string;
  caBundlePath?: string;
  certificateFingerprint?: string;
  certificateExpiresAt?: Date;
}

export interface ISpokeAuthentication {
  spokeToken?: string;
  tokenExpiresAt?: Date;
  tokenScopes?: string[];
  refreshToken?: string;
}

export interface ISpokeFederation {
  status: 'unregistered' | 'pending' | 'approved' | 'suspended' | 'revoked';
  registeredAt?: Date;
  approvedAt?: Date;
  approvedBy?: string;
  suspendedReason?: string;
  requestedScopes: string[];
  allowedPolicyScopes?: string[];
  trustLevel?: 'development' | 'partner' | 'bilateral' | 'national';
  maxClassificationAllowed?: string;
  dataIsolationLevel?: 'full' | 'filtered' | 'minimal';
}

export interface ISpokeOperational {
  heartbeatIntervalMs: number;
  tokenRefreshBufferMs: number;
  offlineGracePeriodMs: number;
  policyCachePath: string;
  auditQueuePath: string;
  maxAuditQueueSize: number;
  auditFlushIntervalMs: number;
}

export interface ISpokeMetadata {
  version: string;
  createdAt: Date;
  lastModified: Date;
  configHash: string;
}

export interface ISpokeFullConfig {
  identity: ISpokeIdentity;
  endpoints: ISpokeEndpoints;
  certificates: ISpokeCertificates;
  authentication: ISpokeAuthentication;
  federation: ISpokeFederation;
  operational: ISpokeOperational;
  metadata: ISpokeMetadata;
}

export interface IConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================
// DEFAULT VALUES
// ============================================

const DEFAULT_OPERATIONAL: ISpokeOperational = {
  heartbeatIntervalMs: 30000, // 30 seconds
  tokenRefreshBufferMs: 300000, // 5 minutes before expiry
  offlineGracePeriodMs: 3600000, // 1 hour
  policyCachePath: '/var/dive/cache/policies',
  auditQueuePath: '/var/dive/cache/audit',
  maxAuditQueueSize: 10000,
  auditFlushIntervalMs: 60000, // 1 minute
};

const DEFAULT_REQUESTED_SCOPES = ['policy:base', 'data:federation_matrix', 'data:trusted_issuers'];

// ============================================
// SPOKE CONFIG SERVICE
// ============================================

class SpokeConfigService {
  private config: ISpokeFullConfig | null = null;
  private configPath: string = '';
  private configLoaded = false;

  /**
   * Initialize configuration from a specific path
   */
  async loadFromFile(configPath: string): Promise<ISpokeFullConfig> {
    this.configPath = configPath;

    try {
      const data = await fs.readFile(configPath, 'utf-8');
      const rawConfig = JSON.parse(data);

      // Transform and validate
      this.config = this.transformRawConfig(rawConfig);
      const validation = this.validateConfig(this.config);

      if (!validation.valid) {
        throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
      }

      if (validation.warnings.length > 0) {
        validation.warnings.forEach((warning) => {
          logger.warn(`Configuration warning: ${warning}`);
        });
      }

      this.configLoaded = true;

      logger.info('Spoke configuration loaded', {
        configPath,
        spokeId: this.config.identity.spokeId,
        instanceCode: this.config.identity.instanceCode,
      });

      return this.config;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Configuration file not found: ${configPath}`);
      }
      throw error;
    }
  }

  /**
   * Initialize configuration for a new spoke
   */
  async initializeNew(
    instanceCode: string,
    name: string,
    options: {
      hubUrl: string;
      baseUrl: string;
      apiUrl: string;
      idpUrl: string;
      contactEmail: string;
      country?: string;
      organizationType?: ISpokeIdentity['organizationType'];
      description?: string;
    }
  ): Promise<ISpokeFullConfig> {
    const code = instanceCode.toUpperCase();
    const spokeId = this.generateSpokeId(code);
    const instanceDir = path.join(process.cwd(), 'instances', code.toLowerCase());

    this.config = {
      identity: {
        spokeId,
        instanceCode: code,
        name,
        description: options.description || `DIVE V3 Spoke Instance for ${name}`,
        country: options.country || code,
        organizationType: options.organizationType || 'government',
        contactEmail: options.contactEmail,
      },
      endpoints: {
        hubUrl: options.hubUrl,
        hubApiUrl: `${options.hubUrl}/api`,
        hubOpalUrl: options.hubUrl.replace(':4000', ':7002').replace(/\/api$/, '') + ':7002',
        baseUrl: options.baseUrl,
        apiUrl: options.apiUrl,
        idpUrl: options.idpUrl,
      },
      certificates: {
        certificatePath: path.join(instanceDir, 'certs', 'spoke.crt'),
        privateKeyPath: path.join(instanceDir, 'certs', 'spoke.key'),
        csrPath: path.join(instanceDir, 'certs', 'spoke.csr'),
        caBundlePath: path.join(instanceDir, 'certs', 'hub-ca.crt'),
      },
      authentication: {},
      federation: {
        status: 'unregistered',
        requestedScopes: DEFAULT_REQUESTED_SCOPES,
      },
      operational: {
        ...DEFAULT_OPERATIONAL,
        policyCachePath: path.join(instanceDir, 'cache', 'policies'),
        auditQueuePath: path.join(instanceDir, 'cache', 'audit'),
      },
      metadata: {
        version: '1.0.0',
        createdAt: new Date(),
        lastModified: new Date(),
        configHash: '',
      },
    };

    // Calculate config hash
    this.config.metadata.configHash = this.calculateConfigHash(this.config);

    this.configPath = path.join(instanceDir, 'config.json');
    this.configLoaded = true;

    logger.info('New spoke configuration initialized', {
      spokeId,
      instanceCode: code,
    });

    return this.config;
  }

  /**
   * Save configuration to file
   */
  async save(configPath?: string): Promise<void> {
    if (!this.config) {
      throw new Error('No configuration to save');
    }

    const savePath = configPath || this.configPath;
    if (!savePath) {
      throw new Error('No configuration path specified');
    }

    // Update metadata
    this.config.metadata.lastModified = new Date();
    this.config.metadata.configHash = this.calculateConfigHash(this.config);

    // Ensure directory exists
    const dir = path.dirname(savePath);
    await fs.mkdir(dir, { recursive: true });

    // Write config
    await fs.writeFile(savePath, JSON.stringify(this.config, null, 2));

    this.configPath = savePath;

    logger.debug('Spoke configuration saved', {
      configPath: savePath,
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): ISpokeFullConfig {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }
    return { ...this.config };
  }

  /**
   * Check if configuration is loaded
   */
  isLoaded(): boolean {
    return this.configLoaded;
  }

  /**
   * Get configuration path
   */
  getConfigPath(): string {
    return this.configPath;
  }

  // ============================================
  // UPDATE METHODS
  // ============================================

  /**
   * Update spoke authentication (after approval)
   */
  async updateAuthentication(auth: Partial<ISpokeAuthentication>): Promise<void> {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }

    this.config.authentication = {
      ...this.config.authentication,
      ...auth,
    };

    await this.save();
  }

  /**
   * Update federation status
   */
  async updateFederationStatus(
    status: ISpokeFullConfig['federation']['status'],
    details?: Partial<ISpokeFederation>
  ): Promise<void> {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }

    this.config.federation.status = status;

    if (details) {
      this.config.federation = {
        ...this.config.federation,
        ...details,
      };
    }

    if (status === 'approved' && !this.config.federation.approvedAt) {
      this.config.federation.approvedAt = new Date();
    }

    await this.save();

    logger.info('Federation status updated', {
      spokeId: this.config.identity.spokeId,
      status,
    });
  }

  /**
   * Update certificate information
   */
  async updateCertificateInfo(info: Partial<ISpokeCertificates>): Promise<void> {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }

    this.config.certificates = {
      ...this.config.certificates,
      ...info,
    };

    await this.save();
  }

  /**
   * Update operational settings
   */
  async updateOperational(settings: Partial<ISpokeOperational>): Promise<void> {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }

    this.config.operational = {
      ...this.config.operational,
      ...settings,
    };

    await this.save();
  }

  // ============================================
  // VALIDATION
  // ============================================

  /**
   * Validate configuration
   */
  validateConfig(config: ISpokeFullConfig): IConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Identity validation
    if (!config.identity.spokeId) {
      errors.push('Missing spokeId');
    }
    if (!config.identity.instanceCode || config.identity.instanceCode.length !== 3) {
      errors.push('instanceCode must be exactly 3 characters (ISO 3166-1 alpha-3)');
    }
    if (!config.identity.name) {
      errors.push('Missing name');
    }
    if (!config.identity.contactEmail) {
      errors.push('Missing contactEmail');
    }

    // Endpoints validation
    if (!config.endpoints.hubUrl) {
      errors.push('Missing hubUrl');
    }
    if (!config.endpoints.baseUrl) {
      errors.push('Missing baseUrl');
    }
    if (!config.endpoints.apiUrl) {
      errors.push('Missing apiUrl');
    }
    if (!config.endpoints.idpUrl) {
      errors.push('Missing idpUrl');
    }

    // URL format validation
    const urlFields = ['hubUrl', 'baseUrl', 'apiUrl', 'idpUrl'];
    for (const field of urlFields) {
      const url = config.endpoints[field as keyof ISpokeEndpoints] as string;
      if (url && !this.isValidUrl(url)) {
        errors.push(`Invalid URL for ${field}: ${url}`);
      }
    }

    // HTTPS validation for production
    if (config.endpoints.hubUrl && !config.endpoints.hubUrl.startsWith('https://')) {
      if (process.env.NODE_ENV === 'production') {
        errors.push('Hub URL must use HTTPS in production');
      } else {
        warnings.push('Hub URL is not using HTTPS (acceptable for development)');
      }
    }

    // Certificate paths (warning if not present)
    if (!config.certificates.certificatePath) {
      warnings.push('Certificate path not configured');
    }
    if (!config.certificates.privateKeyPath) {
      warnings.push('Private key path not configured');
    }

    // Federation validation
    if (!config.federation.requestedScopes || config.federation.requestedScopes.length === 0) {
      warnings.push('No requested scopes configured');
    }

    // Operational validation
    if (config.operational.heartbeatIntervalMs < 10000) {
      warnings.push('Heartbeat interval less than 10 seconds may cause excessive load');
    }
    if (config.operational.heartbeatIntervalMs > 300000) {
      warnings.push('Heartbeat interval greater than 5 minutes may cause stale status');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ============================================
  // HELPERS
  // ============================================

  /**
   * Transform raw JSON config to typed config
   */
  private transformRawConfig(raw: Record<string, unknown>): ISpokeFullConfig {
    // Handle both flat (old format) and nested (new format) configs
    const isNested = raw.identity || raw.endpoints;

    if (isNested) {
      return this.transformNestedConfig(raw);
    } else {
      return this.transformFlatConfig(raw);
    }
  }

  /**
   * Transform flat config format
   */
  private transformFlatConfig(raw: Record<string, unknown>): ISpokeFullConfig {
    const instanceCode = ((raw.instanceCode as string) || (raw.instance_code as string) || '').toUpperCase();
    const instanceDir = path.join(process.cwd(), 'instances', instanceCode.toLowerCase());

    return {
      identity: {
        spokeId: (raw.spokeId as string) || this.generateSpokeId(instanceCode),
        instanceCode,
        name: (raw.name as string) || (raw.instance_name as string) || instanceCode,
        description: raw.description as string | undefined,
        country: (raw.country as string) || instanceCode,
        organizationType: (raw.organizationType as ISpokeIdentity['organizationType']) || 'government',
        contactEmail: (raw.contactEmail as string) || '',
      },
      endpoints: {
        hubUrl: (raw.hubUrl as string) || 'https://hub.dive25.com',
        hubApiUrl: (raw.hubApiUrl as string) || 'https://hub.dive25.com/api',
        hubOpalUrl: (raw.hubOpalUrl as string) || 'https://hub.dive25.com:7002',
        baseUrl: (raw.baseUrl as string) || `https://${instanceCode.toLowerCase()}-app.dive25.com`,
        apiUrl: (raw.apiUrl as string) || `https://${instanceCode.toLowerCase()}-api.dive25.com`,
        idpUrl: (raw.idpUrl as string) || `https://${instanceCode.toLowerCase()}-idp.dive25.com`,
        kasUrl: raw.kasUrl as string | undefined,
      },
      certificates: {
        certificatePath: (raw.certificatePath as string) || path.join(instanceDir, 'certs', 'spoke.crt'),
        privateKeyPath: (raw.privateKeyPath as string) || path.join(instanceDir, 'certs', 'spoke.key'),
        csrPath: (raw.csrPath as string) || path.join(instanceDir, 'certs', 'spoke.csr'),
        caBundlePath: raw.caBundlePath as string | undefined,
      },
      authentication: {
        spokeToken: raw.spokeToken as string | undefined,
        tokenExpiresAt: raw.tokenExpiresAt ? new Date(raw.tokenExpiresAt as string) : undefined,
      },
      federation: {
        status: (raw.status as ISpokeFederation['status']) || 'unregistered',
        registeredAt: raw.registeredAt ? new Date(raw.registeredAt as string) : undefined,
        approvedAt: raw.approvedAt ? new Date(raw.approvedAt as string) : undefined,
        requestedScopes: (raw.requestedScopes as string[]) || DEFAULT_REQUESTED_SCOPES,
        allowedPolicyScopes: raw.allowedPolicyScopes as string[] | undefined,
        trustLevel: raw.trustLevel as ISpokeFederation['trustLevel'],
        maxClassificationAllowed: raw.maxClassificationAllowed as string | undefined,
      },
      operational: {
        ...DEFAULT_OPERATIONAL,
        ...(raw.operational as Partial<ISpokeOperational>),
      },
      metadata: {
        version: (raw.version as string) || '1.0.0',
        createdAt: raw.createdAt ? new Date(raw.createdAt as string) : new Date(),
        lastModified: raw.lastModified ? new Date(raw.lastModified as string) : new Date(),
        configHash: (raw.configHash as string) || '',
      },
    };
  }

  /**
   * Transform nested config format
   */
  private transformNestedConfig(raw: Record<string, unknown>): ISpokeFullConfig {
    const identity = (raw.identity || {}) as Record<string, unknown>;
    const endpoints = (raw.endpoints || {}) as Record<string, unknown>;
    const certificates = (raw.certificates || {}) as Record<string, unknown>;
    const authentication = (raw.authentication || {}) as Record<string, unknown>;
    const federation = (raw.federation || {}) as Record<string, unknown>;
    const operational = (raw.operational || {}) as Record<string, unknown>;
    const metadata = (raw.metadata || {}) as Record<string, unknown>;

    return {
      identity: identity as unknown as ISpokeIdentity,
      endpoints: endpoints as unknown as ISpokeEndpoints,
      certificates: certificates as unknown as ISpokeCertificates,
      authentication: {
        ...authentication,
        tokenExpiresAt: authentication.tokenExpiresAt
          ? new Date(authentication.tokenExpiresAt as string)
          : undefined,
      } as ISpokeAuthentication,
      federation: {
        ...federation,
        registeredAt: federation.registeredAt ? new Date(federation.registeredAt as string) : undefined,
        approvedAt: federation.approvedAt ? new Date(federation.approvedAt as string) : undefined,
      } as ISpokeFederation,
      operational: {
        ...DEFAULT_OPERATIONAL,
        ...operational,
      } as ISpokeOperational,
      metadata: {
        ...metadata,
        createdAt: metadata.createdAt ? new Date(metadata.createdAt as string) : new Date(),
        lastModified: metadata.lastModified ? new Date(metadata.lastModified as string) : new Date(),
      } as ISpokeMetadata,
    };
  }

  /**
   * Generate a unique spoke ID
   */
  private generateSpokeId(instanceCode: string): string {
    const random = crypto.randomBytes(4).toString('hex');
    return `spoke-${instanceCode.toLowerCase()}-${random}`;
  }

  /**
   * Calculate configuration hash for change detection
   */
  private calculateConfigHash(config: ISpokeFullConfig): string {
    // Exclude metadata from hash calculation
    const hashSource = {
      identity: config.identity,
      endpoints: config.endpoints,
      certificates: {
        certificatePath: config.certificates.certificatePath,
        privateKeyPath: config.certificates.privateKeyPath,
      },
      federation: {
        status: config.federation.status,
        requestedScopes: config.federation.requestedScopes,
      },
      operational: config.operational,
    };

    return crypto.createHash('sha256').update(JSON.stringify(hashSource)).digest('hex').substring(0, 16);
  }

  /**
   * Validate URL format
   */
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Merge with environment variables
   */
  applyEnvironmentOverrides(): void {
    if (!this.config) return;

    // Hub URL
    if (process.env.DIVE_HUB_URL) {
      this.config.endpoints.hubUrl = process.env.DIVE_HUB_URL;
      this.config.endpoints.hubApiUrl = `${process.env.DIVE_HUB_URL}/api`;
    }
    if (process.env.DIVE_HUB_OPAL_URL) {
      this.config.endpoints.hubOpalUrl = process.env.DIVE_HUB_OPAL_URL;
    }

    // Token
    if (process.env.DIVE_SPOKE_TOKEN) {
      this.config.authentication.spokeToken = process.env.DIVE_SPOKE_TOKEN;
    }

    // Intervals
    if (process.env.DIVE_HEARTBEAT_INTERVAL_MS) {
      this.config.operational.heartbeatIntervalMs = parseInt(process.env.DIVE_HEARTBEAT_INTERVAL_MS, 10);
    }
    if (process.env.DIVE_TOKEN_REFRESH_BUFFER_MS) {
      this.config.operational.tokenRefreshBufferMs = parseInt(process.env.DIVE_TOKEN_REFRESH_BUFFER_MS, 10);
    }
    if (process.env.DIVE_OFFLINE_GRACE_PERIOD_MS) {
      this.config.operational.offlineGracePeriodMs = parseInt(process.env.DIVE_OFFLINE_GRACE_PERIOD_MS, 10);
    }

    // Cache paths
    if (process.env.DIVE_POLICY_CACHE_PATH) {
      this.config.operational.policyCachePath = process.env.DIVE_POLICY_CACHE_PATH;
    }
    if (process.env.DIVE_AUDIT_QUEUE_PATH) {
      this.config.operational.auditQueuePath = process.env.DIVE_AUDIT_QUEUE_PATH;
    }
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const spokeConfigService = new SpokeConfigService();

export default SpokeConfigService;

