/**
 * DIVE V3 - Spoke Registration Service
 *
 * Client service for managing spoke registration with the Hub.
 * Handles the full registration workflow from CSR generation to token receipt.
 *
 * Registration Flow:
 * 1. Generate CSR and certificates locally
 * 2. Submit registration request to Hub
 * 3. Wait for Hub admin approval
 * 4. Receive signed certificate and token
 * 5. Store credentials and configure OPAL client
 *
 * Features:
 * - CSR generation with multiple algorithms
 * - Registration request submission
 * - Status polling while pending
 * - Certificate installation
 * - Token receipt and storage
 * - Configuration update after approval
 *
 * @version 1.0.0
 * @date 2025-12-05
 */

import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';
import { spokeMTLS, ICSRInfo } from './spoke-mtls.service';
import { spokeToken, ISpokeToken } from './spoke-token.service';
import { logger } from '../utils/logger';

// ============================================
// TYPES
// ============================================

export type RegistrationStatus =
  | 'unregistered'
  | 'csr_generated'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'suspended'
  | 'revoked';

export interface IRegistrationConfig {
  hubUrl: string;
  configPath: string;
  certsDir: string;
  timeoutMs: number;
  pollIntervalMs: number;
}

export interface IRegistrationRequest {
  instanceCode: string;
  name: string;
  description?: string;
  baseUrl: string;
  apiUrl: string;
  idpUrl: string;
  certificatePEM?: string;
  requestedScopes: string[];
  contactEmail: string;
}

export interface IRegistrationResponse {
  success: boolean;
  spokeId?: string;
  status?: RegistrationStatus;
  message?: string;
  error?: string;
  certificatePEM?: string;
  token?: {
    token: string;
    expiresAt: string;
    scopes: string[];
  };
}

export interface ISpokeConfig {
  identity: {
    spokeId: string;
    instanceCode: string;
    name: string;
    description?: string;
    country: string;
    organizationType: string;
    contactEmail: string;
  };
  endpoints: {
    hubUrl: string;
    hubApiUrl: string;
    hubOpalUrl: string;
    baseUrl: string;
    apiUrl: string;
    idpUrl: string;
    idpPublicUrl?: string; // Public-facing IdP URL (localhost or domain)
    kasUrl?: string;
  };
  certificates: {
    certificatePath: string;
    privateKeyPath: string;
    csrPath: string;
    caBundlePath: string;
  };
  authentication: {
    spokeToken?: string;
    tokenExpiresAt?: string;
    tokenScopes?: string[];
  };
  federation: {
    status: RegistrationStatus;
    registeredAt?: string;
    approvedAt?: string;
    approvedBy?: string;
    requestedScopes: string[];
    allowedScopes?: string[];
    trustLevel?: string;
    maxClassification?: string;
  };
  operational: {
    heartbeatIntervalMs: number;
    tokenRefreshBufferMs: number;
    offlineGracePeriodMs: number;
    policyCachePath: string;
    auditQueuePath: string;
    maxAuditQueueSize: number;
    auditFlushIntervalMs: number;
  };
  metadata: {
    version: string;
    createdAt: string;
    lastModified: string;
    configHash?: string;
  };
}

// Default configuration
const DEFAULT_CONFIG: IRegistrationConfig = {
  hubUrl: 'https://hub.dive25.com',
  configPath: '/var/dive/spoke/config.json',
  certsDir: '/var/dive/spoke/certs',
  timeoutMs: 30000,
  pollIntervalMs: 30000,
};

// ============================================
// SPOKE REGISTRATION SERVICE
// ============================================

class SpokeRegistrationService extends EventEmitter {
  private config: IRegistrationConfig;
  private spokeConfig: ISpokeConfig | null = null;
  private statusPollTimer: NodeJS.Timeout | null = null;
  private initialized = false;

  constructor() {
    super();
    this.config = { ...DEFAULT_CONFIG };
  }

  /**
   * Initialize the registration service
   */
  async initialize(config: Partial<IRegistrationConfig>): Promise<void> {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Load existing configuration if present
    await this.loadSpokeConfig();

    this.initialized = true;

    logger.info('Spoke Registration Service initialized', {
      hubUrl: this.config.hubUrl,
      configPath: this.config.configPath,
      status: this.spokeConfig?.federation.status || 'no_config',
    });
  }

  // ============================================
  // CONFIGURATION MANAGEMENT
  // ============================================

  /**
   * Load spoke configuration from disk
   */
  private async loadSpokeConfig(): Promise<void> {
    try {
      const data = await fs.readFile(this.config.configPath, 'utf-8');
      this.spokeConfig = JSON.parse(data) as ISpokeConfig;

      logger.debug('Spoke configuration loaded', {
        spokeId: this.spokeConfig.identity.spokeId,
        status: this.spokeConfig.federation.status,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn('Failed to load spoke configuration', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  /**
   * Save spoke configuration to disk
   */
  private async saveSpokeConfig(): Promise<void> {
    if (!this.spokeConfig) {
      throw new Error('No spoke configuration to save');
    }

    // Update metadata
    this.spokeConfig.metadata.lastModified = new Date().toISOString();

    // Ensure directory exists
    const configDir = path.dirname(this.config.configPath);
    await fs.mkdir(configDir, { recursive: true });

    await fs.writeFile(
      this.config.configPath,
      JSON.stringify(this.spokeConfig, null, 2)
    );

    logger.debug('Spoke configuration saved');
  }

  /**
   * Get current spoke configuration
   */
  getSpokeConfig(): ISpokeConfig | null {
    return this.spokeConfig;
  }

  /**
   * Update spoke configuration
   */
  async updateSpokeConfig(updates: Partial<ISpokeConfig>): Promise<void> {
    if (!this.spokeConfig) {
      throw new Error('No spoke configuration loaded');
    }

    // Deep merge updates
    this.spokeConfig = this.deepMerge(this.spokeConfig, updates);

    await this.saveSpokeConfig();
    this.emit('configUpdated', this.spokeConfig);
  }

  // ============================================
  // CSR GENERATION
  // ============================================

  /**
   * Generate Certificate Signing Request
   */
  async generateCSR(options?: {
    algorithm?: 'rsa' | 'ec';
    keySize?: number;
  }): Promise<ICSRInfo> {
    if (!this.initialized || !this.spokeConfig) {
      throw new Error('Spoke not initialized. Run spoke init first.');
    }

    const csrInfo = await spokeMTLS.generateCSR({
      spokeId: this.spokeConfig.identity.spokeId,
      instanceCode: this.spokeConfig.identity.instanceCode,
      organization: 'DIVE Federation',
      country: this.spokeConfig.identity.country,
      algorithm: options?.algorithm || 'rsa',
      keySize: options?.keySize || 4096,
      outputDir: this.config.certsDir,
    });

    // Update config with cert paths
    await this.updateSpokeConfig({
      certificates: {
        ...this.spokeConfig.certificates,
        privateKeyPath: csrInfo.privateKeyPath,
        csrPath: path.join(this.config.certsDir, 'spoke.csr'),
      },
      federation: {
        ...this.spokeConfig.federation,
        status: 'csr_generated',
      },
    });

    this.emit('csrGenerated', csrInfo);
    return csrInfo;
  }

  // ============================================
  // REGISTRATION
  // ============================================

  /**
   * Submit registration request to Hub
   */
  async submitRegistration(): Promise<IRegistrationResponse> {
    if (!this.spokeConfig) {
      throw new Error('Spoke not initialized');
    }

    // Load certificate if available
    let certificatePEM: string | undefined;
    try {
      certificatePEM = await fs.readFile(
        this.spokeConfig.certificates.certificatePath,
        'utf-8'
      );
    } catch {
      // Certificate may not exist yet (development mode)
    }

    const request: IRegistrationRequest = {
      instanceCode: this.spokeConfig.identity.instanceCode,
      name: this.spokeConfig.identity.name,
      description: this.spokeConfig.identity.description,
      baseUrl: this.spokeConfig.endpoints.baseUrl,
      apiUrl: this.spokeConfig.endpoints.apiUrl,
      idpUrl: this.spokeConfig.endpoints.idpUrl,
      certificatePEM,
      requestedScopes: this.spokeConfig.federation.requestedScopes,
      contactEmail: this.spokeConfig.identity.contactEmail,
    };

    logger.info('Submitting registration to Hub', {
      instanceCode: request.instanceCode,
      hubUrl: this.config.hubUrl,
    });

    try {
      const response = await spokeMTLS.makeRequest<IRegistrationResponse>(
        `${this.config.hubUrl}/api/federation/register`,
        {
          method: 'POST',
          body: request,
          timeout: this.config.timeoutMs,
        }
      );

      if (response.statusCode === 201 && response.data?.success) {
        // Update local config with registration info
        await this.updateSpokeConfig({
          identity: {
            ...this.spokeConfig.identity,
            spokeId: response.data.spokeId || this.spokeConfig.identity.spokeId,
          },
          federation: {
            ...this.spokeConfig.federation,
            status: 'pending',
            registeredAt: new Date().toISOString(),
          },
        });

        logger.info('Registration submitted successfully', {
          spokeId: response.data.spokeId,
          status: response.data.status,
        });

        this.emit('registrationSubmitted', response.data);
        return response.data;
      }

      const errorMsg = response.data?.error || response.error || 'Registration failed';
      logger.error('Registration failed', {
        statusCode: response.statusCode,
        error: errorMsg,
      });

      return {
        success: false,
        error: errorMsg,
      };
    } catch (error) {
      logger.error('Registration request error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check registration status with Hub
   */
  async checkRegistrationStatus(): Promise<IRegistrationResponse> {
    if (!this.spokeConfig) {
      throw new Error('Spoke not initialized');
    }

    const spokeId = this.spokeConfig.identity.spokeId;

    try {
      const response = await spokeMTLS.makeRequest<{
        spoke: {
          spokeId: string;
          status: RegistrationStatus;
          approvedAt?: string;
          approvedBy?: string;
          allowedPolicyScopes?: string[];
          trustLevel?: string;
          maxClassificationAllowed?: string;
        };
        token?: {
          token: string;
          expiresAt: string;
          scopes: string[];
        };
      }>(`${this.config.hubUrl}/api/federation/spokes/${spokeId}`, {
        method: 'GET',
        timeout: this.config.timeoutMs,
      });

      if (response.statusCode === 200 && response.data) {
        const status = response.data.spoke.status;

        // Update local status if changed
        if (status !== this.spokeConfig.federation.status) {
          await this.updateSpokeConfig({
            federation: {
              ...this.spokeConfig.federation,
              status,
              approvedAt: response.data.spoke.approvedAt,
              approvedBy: response.data.spoke.approvedBy,
              allowedScopes: response.data.spoke.allowedPolicyScopes,
              trustLevel: response.data.spoke.trustLevel,
              maxClassification: response.data.spoke.maxClassificationAllowed,
            },
          });

          this.emit('statusChanged', { from: this.spokeConfig.federation.status, to: status });
        }

        // If approved and token provided, store it
        if (status === 'approved' && response.data.token) {
          await this.receiveToken(response.data.token);
        }

        return {
          success: true,
          spokeId,
          status,
          token: response.data.token,
        };
      }

      return {
        success: false,
        error: 'Failed to get status',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Start polling for registration status
   */
  startStatusPolling(): void {
    if (this.statusPollTimer) {
      return;
    }

    this.statusPollTimer = setInterval(async () => {
      const result = await this.checkRegistrationStatus();

      if (result.status === 'approved') {
        this.stopStatusPolling();
        this.emit('registrationApproved', result);
      } else if (result.status === 'rejected') {
        this.stopStatusPolling();
        this.emit('registrationRejected', result);
      }
    }, this.config.pollIntervalMs);

    logger.info('Started registration status polling', {
      intervalMs: this.config.pollIntervalMs,
    });
  }

  /**
   * Stop polling for registration status
   */
  stopStatusPolling(): void {
    if (this.statusPollTimer) {
      clearInterval(this.statusPollTimer);
      this.statusPollTimer = null;
      logger.info('Stopped registration status polling');
    }
  }

  // ============================================
  // TOKEN MANAGEMENT
  // ============================================

  /**
   * Receive and store token from Hub
   */
  async receiveToken(tokenData: {
    token: string;
    expiresAt: string;
    scopes: string[];
  }): Promise<void> {
    if (!this.spokeConfig) {
      throw new Error('Spoke not initialized');
    }

    const token: ISpokeToken = {
      token: tokenData.token,
      spokeId: this.spokeConfig.identity.spokeId,
      scopes: tokenData.scopes,
      issuedAt: new Date(),
      expiresAt: new Date(tokenData.expiresAt),
      tokenType: 'bearer',
      version: 1,
    };

    // Store token using token service
    await spokeToken.storeToken(token);

    // Update spoke config
    await this.updateSpokeConfig({
      authentication: {
        spokeToken: tokenData.token,
        tokenExpiresAt: tokenData.expiresAt,
        tokenScopes: tokenData.scopes,
      },
    });

    logger.info('Token received and stored', {
      scopes: tokenData.scopes,
      expiresAt: tokenData.expiresAt,
    });

    this.emit('tokenReceived', token);
  }

  /**
   * Request token refresh from Hub
   */
  async refreshToken(): Promise<IRegistrationResponse> {
    if (!this.spokeConfig) {
      throw new Error('Spoke not initialized');
    }

    const currentToken = await spokeToken.getToken();
    if (!currentToken) {
      return {
        success: false,
        error: 'No token to refresh',
      };
    }

    try {
      const response = await spokeMTLS.makeRequest<{
        success: boolean;
        token?: {
          token: string;
          expiresAt: string;
          scopes: string[];
        };
        error?: string;
      }>(`${this.config.hubUrl}/api/federation/spokes/${this.spokeConfig.identity.spokeId}/token`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${currentToken}`,
        },
        timeout: this.config.timeoutMs,
      });

      if (response.statusCode === 200 && response.data?.success && response.data.token) {
        await this.receiveToken(response.data.token);

        return {
          success: true,
          token: response.data.token,
        };
      }

      return {
        success: false,
        error: response.data?.error || 'Token refresh failed',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ============================================
  // CERTIFICATE MANAGEMENT
  // ============================================

  /**
   * Submit CSR to Hub for signing
   */
  async submitCSRForSigning(): Promise<{ success: boolean; error?: string }> {
    if (!this.spokeConfig) {
      throw new Error('Spoke not initialized');
    }

    const csrPath = this.spokeConfig.certificates.csrPath;
    let csr: string;

    try {
      csr = await fs.readFile(csrPath, 'utf-8');
    } catch {
      return {
        success: false,
        error: 'CSR not found. Generate CSR first.',
      };
    }

    const currentToken = await spokeToken.getToken();

    try {
      const response = await spokeMTLS.makeRequest<{
        success: boolean;
        certificatePEM?: string;
        error?: string;
      }>(`${this.config.hubUrl}/api/federation/spokes/${this.spokeConfig.identity.spokeId}/sign-csr`, {
        method: 'POST',
        body: { csr },
        headers: currentToken ? { Authorization: `Bearer ${currentToken}` } : {},
        timeout: this.config.timeoutMs,
      });

      if (response.statusCode === 200 && response.data?.success && response.data.certificatePEM) {
        await this.installSignedCertificate(response.data.certificatePEM);
        return { success: true };
      }

      return {
        success: false,
        error: response.data?.error || 'CSR signing failed',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Install signed certificate from Hub
   */
  async installSignedCertificate(certPEM: string): Promise<void> {
    if (!this.spokeConfig) {
      throw new Error('Spoke not initialized');
    }

    // Install certificate via mTLS service
    await spokeMTLS.installSignedCertificate(certPEM);

    // Update config
    await this.updateSpokeConfig({
      certificates: {
        ...this.spokeConfig.certificates,
        certificatePath: path.join(this.config.certsDir, 'spoke.crt'),
      },
    });

    logger.info('Signed certificate installed');
    this.emit('certificateInstalled');
  }

  // ============================================
  // PUBLIC API
  // ============================================

  /**
   * Get current registration status
   */
  getStatus(): {
    status: RegistrationStatus;
    spokeId: string | null;
    hasToken: boolean;
    tokenExpiry: Date | null;
  } {
    return {
      status: this.spokeConfig?.federation.status || 'unregistered',
      spokeId: this.spokeConfig?.identity.spokeId || null,
      hasToken: spokeToken.hasToken(),
      tokenExpiry: spokeToken.getTokenExpiry(),
    };
  }

  /**
   * Check if registration is complete
   */
  isRegistered(): boolean {
    return this.spokeConfig?.federation.status === 'approved' && spokeToken.isTokenValid();
  }

  /**
   * Get Hub URL
   */
  getHubUrl(): string {
    return this.config.hubUrl;
  }

  /**
   * Shutdown the service
   */
  shutdown(): void {
    this.stopStatusPolling();
    this.spokeConfig = null;
    this.initialized = false;

    logger.info('Spoke Registration Service shutdown');
  }

  // ============================================
  // HELPERS
  // ============================================

  /**
   * Deep merge two objects
   */
  private deepMerge<T>(target: T, source: Partial<T>): T {
    const result = { ...target };

    for (const key in source) {
      const sourceValue = source[key];
      const targetValue = result[key];

      if (
        sourceValue !== undefined &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue !== undefined &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        (result as Record<string, unknown>)[key] = this.deepMerge(
          targetValue as Record<string, unknown>,
          sourceValue as Record<string, unknown>
        );
      } else if (sourceValue !== undefined) {
        (result as Record<string, unknown>)[key] = sourceValue;
      }
    }

    return result;
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const spokeRegistration = new SpokeRegistrationService();

export default SpokeRegistrationService;
