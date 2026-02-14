/**
 * DIVE V3 - Hub-Spoke Registry Service
 *
 * Central registry for managing federated spoke instances.
 * The Hub validates, authorizes, and tracks all spoke deployments.
 *
 * This file is the thin orchestrator that delegates to focused sub-modules:
 * - registry-types.ts — Types, interfaces, store implementations
 * - federation-cascade.ts — Federation side-effects (IdP, KAS, COI, certs)
 * - opal-trust.ts — OPAL/OPA trust management
 * - spoke-lifecycle.ts — Spoke status transitions (approve/suspend/unsuspend/revoke)
 *
 * @version 2.0.0
 * @date 2026-02-14
 */

import crypto from 'crypto';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { idpValidationService } from './idp-validation.service';

// Sub-module imports
import {
  createSpokeStore,
  type ISpokeRegistration,
  type ICertificateValidation,
  type ISpokeToken,
  type ISpokeHealthStatus,
  type IRegistrationRequest,
  type IHubStatistics,
  type ISpokeStore,
} from './registry-types';
import {
  validateCertificate,
  extractCertificateDetails,
} from './federation-cascade';
import { pushPolicyUpdate } from './opal-trust';
import {
  approveSpoke as approveSpokeFn,
  suspendSpoke as suspendSpokeFn,
  unsuspendSpoke as unsuspendSpokeFn,
  revokeSpoke as revokeSpokeFn,
  type LifecycleContext,
} from './spoke-lifecycle';

// ============================================
// RE-EXPORTS (preserve all existing import paths)
// ============================================

export type {
  ISpokeRegistration,
  ICertificateValidation,
  ISpokeToken,
  ISpokeHealthStatus,
  IRegistrationRequest,
  IHubStatistics,
  ISpokeStore,
} from './registry-types';

export { createSpokeStore } from './registry-types';

export {
  validateCertificate,
  extractCertificateDetails,
  getPortOffsetForCountry,
  getHubIdpUrl,
  getInstanceName,
  getSpokePublicIdpUrl,
  getSpokeKeycloakPassword,
  createFederationIdP,
  regenerateHubFederation,
  generateHubAutoTfvars,
  registerSpokeKAS,
  mapKASTrustLevel,
  suspendSpokeKAS,
  reactivateSpokeKAS,
  removeSpokeKAS,
  updateCoiMembershipsForFederation,
} from './federation-cascade';

export {
  notifyOPALOfSpokeChange,
  updateOPATrustForSpoke,
  mapTrustLevel,
  getCurrentFederationPartners,
  pushPolicyUpdate,
} from './opal-trust';

export {
  approveSpoke as approveSpokeLifecycle,
  suspendSpoke as suspendSpokeLifecycle,
  unsuspendSpoke as unsuspendSpokeLifecycle,
  revokeSpoke as revokeSpokeLifecycle,
  type LifecycleContext,
} from './spoke-lifecycle';

// ============================================
// HUB-SPOKE REGISTRY SERVICE
// ============================================

class HubSpokeRegistryService extends EventEmitter {
  private store: ISpokeStore;
  private readonly hubSecret: string;
  private tokenValidityMs: number;

  constructor(store?: ISpokeStore) {
    super();

    this.store = store || createSpokeStore();
    this.hubSecret = process.env.HUB_SPOKE_SECRET || crypto.randomBytes(32).toString('hex');
    this.tokenValidityMs = parseInt(process.env.SPOKE_TOKEN_VALIDITY_MS || '86400000', 10);

    logger.info('Hub-Spoke Registry Service initialized', {
      storeType: this.store.constructor.name
    });
  }

  /** Lifecycle context for spoke-lifecycle functions */
  private get lifecycleCtx(): LifecycleContext {
    return { store: this.store, emit: this.emit.bind(this) };
  }

  /**
   * Get hub signing secret (for JWT signing in future)
   */
  getHubSecret(): string {
    return this.hubSecret;
  }

  // ============================================
  // REGISTRATION
  // ============================================

  /**
   * Register a new spoke instance
   * Initially in 'pending' status until manually approved
   *
   * IDEMPOTENT: Returns existing registration if already registered (not revoked)
   */
  async registerSpoke(request: IRegistrationRequest): Promise<ISpokeRegistration> {
    // Check if instance code already registered
    const existing = await this.store.findByInstanceCode(request.instanceCode);
    if (existing) {
      if (existing.status !== 'revoked') {
        logger.info('Spoke already registered, returning existing registration', {
          spokeId: existing.spokeId,
          instanceCode: existing.instanceCode,
          status: existing.status
        });
        return existing;
      }
      logger.info('Deleting revoked spoke to allow re-registration', {
        spokeId: existing.spokeId,
        instanceCode: existing.instanceCode,
      });
      await this.store.delete(existing.spokeId);
    }

    const spokeId = this.generateSpokeId(request.instanceCode);

    // PHASE 4: HUB CA CERTIFICATE ISSUANCE
    let certValidation: ICertificateValidation | undefined;
    let certSubject: string | undefined;
    let certIssuer: string | undefined;
    let certNotBefore: Date | undefined;
    let certNotAfter: Date | undefined;
    let certFingerprint: string | undefined;
    let certSerialNumber: string | undefined;
    let certIssuedByHub: boolean = false;
    let hubIssuedCertPEM: string | undefined;

    if (request.certificateCSR) {
      try {
        const { certificateManager } = await import('../utils/certificate-manager');

        const signedCert = await certificateManager.signCSR(
          request.certificateCSR,
          request.instanceCode,
          365
        );

        hubIssuedCertPEM = signedCert.certificatePEM;
        certSubject = signedCert.issuer;
        certIssuer = signedCert.issuer;
        certNotBefore = signedCert.validFrom;
        certNotAfter = signedCert.validTo;
        certSerialNumber = signedCert.serialNumber;
        certIssuedByHub = true;

        certValidation = await validateCertificate(hubIssuedCertPEM);
        certFingerprint = certValidation.fingerprint;

        logger.info('Hub CA signed spoke certificate', {
          instanceCode: request.instanceCode,
          serialNumber: certSerialNumber,
          validUntil: signedCert.validTo.toISOString()
        });

      } catch (error) {
        logger.error('Failed to sign spoke CSR', {
          instanceCode: request.instanceCode,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        throw new Error(`CSR signing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else if (request.certificatePEM) {
      certValidation = await validateCertificate(request.certificatePEM);

      if (!certValidation.valid && certValidation.errors.length > 0) {
        logger.warn('Spoke certificate validation failed', {
          instanceCode: request.instanceCode,
          errors: certValidation.errors
        });
      }

      try {
        const certDetails = extractCertificateDetails(request.certificatePEM);
        certSubject = certDetails.subject;
        certIssuer = certDetails.issuer;
        certNotBefore = certDetails.validFrom;
        certNotAfter = certDetails.validTo;
        certFingerprint = certValidation.fingerprint;
      } catch (err) {
        logger.warn('Failed to extract certificate details', {
          error: err instanceof Error ? err.message : 'Unknown error'
        });
      }
    }

    // Validate IdP endpoint if requested
    if (request.validateEndpoints !== false) {
      try {
        const tlsResult = await idpValidationService.validateTLS(request.idpUrl, request.instanceCode);
        if (!tlsResult.pass) {
          logger.warn('Spoke IdP TLS validation failed', {
            instanceCode: request.instanceCode,
            idpUrl: request.idpUrl,
            errors: tlsResult.errors
          });
        }

        if (!certValidation) {
          certValidation = {
            valid: tlsResult.pass,
            fingerprint: '',
            algorithm: '',
            tlsVersion: tlsResult.version,
            tlsScore: tlsResult.score,
            warnings: tlsResult.warnings,
            errors: tlsResult.errors,
            validatedAt: new Date()
          };
        } else {
          certValidation.tlsVersion = tlsResult.version;
          certValidation.tlsScore = tlsResult.score;
        }
      } catch (err) {
        logger.warn('Failed to validate spoke IdP endpoint', {
          error: err instanceof Error ? err.message : 'Unknown error'
        });
      }
    }

    const spoke: ISpokeRegistration = {
      spokeId,
      instanceCode: request.instanceCode.toUpperCase(),
      name: request.name,
      description: request.description,
      baseUrl: request.baseUrl,
      apiUrl: request.apiUrl,
      idpUrl: request.idpUrl,
      idpPublicUrl: request.idpPublicUrl,
      internalApiUrl: `https://dive-spoke-${request.instanceCode.toLowerCase()}-backend:4000`,
      publicKey: request.publicKey,
      certificatePEM: hubIssuedCertPEM || request.certificatePEM,
      certificateSerialNumber: certSerialNumber,
      certificateIssuedByHub: certIssuedByHub,
      certificateFingerprint: certFingerprint,
      certificateSubject: certSubject,
      certificateIssuer: certIssuer,
      certificateNotBefore: certNotBefore,
      certificateNotAfter: certNotAfter,
      certificateValidationResult: certValidation,

      status: 'pending',

      allowedPolicyScopes: [],
      dataIsolationLevel: 'minimal',

      registeredAt: new Date(),
      heartbeatIntervalMs: 30000,

      trustLevel: 'development',
      maxClassificationAllowed: 'UNCLASSIFIED',

      rateLimit: {
        requestsPerMinute: 60,
        burstSize: 10
      },

      auditRetentionDays: 90,

      keycloakAdminPassword: request.keycloakAdminPassword,
    };

    await this.store.save(spoke);

    logger.info('New spoke registration', {
      spokeId,
      instanceCode: spoke.instanceCode,
      name: spoke.name,
      requestedScopes: request.requestedScopes,
      contactEmail: request.contactEmail,
      certificateProvided: !!request.certificatePEM,
      certValidation: certValidation?.valid,
      keycloakPasswordProvided: !!request.keycloakAdminPassword,
    });

    const correlationId = `spoke-registration-${uuidv4()}`;
    this.emit('spoke:registered', {
      spoke,
      timestamp: new Date(),
      requiresApproval: true,
      contactEmail: request.contactEmail,
      correlationId
    });

    return spoke;
  }

  // ============================================
  // LIFECYCLE (delegated to spoke-lifecycle.ts)
  // ============================================

  async approveSpoke(
    spokeId: string,
    approvedBy: string,
    options: {
      allowedScopes: string[];
      trustLevel: ISpokeRegistration['trustLevel'];
      maxClassification: string;
      dataIsolationLevel: ISpokeRegistration['dataIsolationLevel'];
      autoLinkIdP?: boolean;
      autoRegenFederation?: boolean;
    }
  ): Promise<ISpokeRegistration> {
    return approveSpokeFn(this.lifecycleCtx, spokeId, approvedBy, options);
  }

  async suspendSpoke(spokeId: string, reason: string): Promise<ISpokeRegistration> {
    return suspendSpokeFn(this.lifecycleCtx, spokeId, reason);
  }

  async unsuspendSpoke(
    spokeId: string,
    unsuspendedBy: string,
    options: { retryFederation?: boolean } = {}
  ): Promise<ISpokeRegistration> {
    return unsuspendSpokeFn(this.lifecycleCtx, spokeId, unsuspendedBy, options);
  }

  async revokeSpoke(spokeId: string, reason: string): Promise<void> {
    return revokeSpokeFn(this.lifecycleCtx, spokeId, reason);
  }

  /**
   * Update spoke's Keycloak admin password
   */
  async updateSpokeKeycloakPassword(spokeId: string, keycloakAdminPassword: string): Promise<void> {
    const spoke = await this.store.findById(spokeId);
    if (!spoke) {
      throw new Error(`Spoke ${spokeId} not found`);
    }

    const updatedSpoke = {
      ...spoke,
      keycloakAdminPassword,
      updatedAt: new Date()
    };

    await this.store.save(updatedSpoke);

    logger.info('Updated spoke Keycloak admin password', {
      spokeId,
      instanceCode: spoke.instanceCode,
      hasPassword: !!keycloakAdminPassword
    });
  }

  // ============================================
  // TOKEN MANAGEMENT
  // ============================================

  async generateSpokeToken(spokeId: string): Promise<ISpokeToken> {
    const spoke = await this.store.findById(spokeId);
    if (!spoke) {
      throw new Error(`Spoke ${spokeId} not found`);
    }

    if (spoke.status !== 'approved') {
      throw new Error(`Spoke ${spokeId} is not approved (status: ${spoke.status})`);
    }

    const token: ISpokeToken = {
      token: this.generateToken(),
      spokeId,
      scopes: spoke.allowedPolicyScopes,
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + this.tokenValidityMs)
    };

    await this.store.saveToken(token);

    logger.info('Spoke token generated', {
      spokeId,
      scopes: token.scopes,
      expiresAt: token.expiresAt
    });

    return token;
  }

  async validateToken(tokenString: string): Promise<{
    valid: boolean;
    spoke?: ISpokeRegistration;
    scopes?: string[];
    error?: string;
  }> {
    const token = await this.store.findToken(tokenString);

    if (!token) {
      return { valid: false, error: 'Token not found' };
    }

    if (new Date() > token.expiresAt) {
      return { valid: false, error: 'Token expired' };
    }

    const spoke = await this.store.findById(token.spokeId);
    if (!spoke || spoke.status !== 'approved') {
      return { valid: false, error: 'Spoke not authorized' };
    }

    return {
      valid: true,
      spoke,
      scopes: token.scopes
    };
  }

  // ============================================
  // HEARTBEAT & HEALTH
  // ============================================

  async recordHeartbeat(spokeId: string, healthData?: Partial<ISpokeHealthStatus>): Promise<void> {
    const spoke = await this.store.findById(spokeId);
    if (!spoke) {
      throw new Error(`Spoke ${spokeId} not found`);
    }

    spoke.lastHeartbeat = new Date();
    await this.store.save(spoke);

    logger.debug('Spoke heartbeat', {
      spokeId,
      instanceCode: spoke.instanceCode,
      healthData
    });
  }

  async checkSpokeHealth(spokeId: string): Promise<ISpokeHealthStatus> {
    const spoke = await this.store.findById(spokeId);
    if (!spoke) {
      throw new Error(`Spoke ${spokeId} not found`);
    }

    const healthy = spoke.lastHeartbeat
      ? (Date.now() - spoke.lastHeartbeat.getTime()) < (spoke.heartbeatIntervalMs * 3)
      : false;

    return {
      spokeId,
      healthy,
      lastCheck: new Date(),
      opaHealthy: healthy,
      opalClientConnected: healthy
    };
  }

  async getUnhealthySpokes(): Promise<ISpokeRegistration[]> {
    const all = await this.store.findByStatus('approved');
    const now = Date.now();

    return all.filter(spoke => {
      if (!spoke.lastHeartbeat) return true;
      return (now - spoke.lastHeartbeat.getTime()) > (spoke.heartbeatIntervalMs * 3);
    });
  }

  // ============================================
  // QUERIES
  // ============================================

  async getSpoke(spokeId: string): Promise<ISpokeRegistration | null> {
    return this.store.findById(spokeId);
  }

  async getSpokeByInstanceCode(code: string): Promise<ISpokeRegistration | null> {
    return this.store.findByInstanceCode(code.toUpperCase());
  }

  async listAllSpokes(): Promise<ISpokeRegistration[]> {
    return this.store.findAll();
  }

  async listActiveSpokes(): Promise<ISpokeRegistration[]> {
    return this.store.findByStatus('approved');
  }

  async listPendingApprovals(): Promise<ISpokeRegistration[]> {
    return this.store.findByStatus('pending');
  }

  async getActiveToken(spokeId: string): Promise<ISpokeToken | null> {
    const tokens = await this.store.findAllTokensBySpokeId(spokeId);

    if (!tokens || tokens.length === 0) {
      return null;
    }

    const now = new Date();
    const activeToken = tokens.find(t => new Date(t.expiresAt) > now);

    return activeToken || null;
  }

  async getStatistics(): Promise<IHubStatistics> {
    const all = await this.store.findAll();

    return {
      totalSpokes: all.length,
      activeSpokes: all.filter(s => s.status === 'approved').length,
      pendingApprovals: all.filter(s => s.status === 'pending').length,
      suspendedSpokes: all.filter(s => s.status === 'suspended').length,
      revokedSpokes: all.filter(s => s.status === 'revoked').length,
      policySyncErrors: 0
    };
  }

  // ============================================
  // OPAL INTEGRATION (delegated to opal-trust.ts)
  // ============================================

  async pushPolicyUpdate(spokeId?: string): Promise<void> {
    return pushPolicyUpdate(spokeId);
  }

  // ============================================
  // FEDERATION VALIDATION (MongoDB as Source of Truth)
  // ============================================

  async getActiveSpokeCodes(): Promise<string[]> {
    try {
      const activeSpokes = await this.store.findByStatus('approved');
      const codes = activeSpokes.map(spoke => spoke.instanceCode.toUpperCase());

      logger.debug('Retrieved active spoke codes from MongoDB', {
        count: codes.length,
        codes
      });

      return codes;
    } catch (error) {
      logger.error('Failed to get active spoke codes from MongoDB', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }

  async validateIdPAgainstSpokes(idpAlias: string): Promise<boolean> {
    const instanceCode = this.extractInstanceCodeFromAlias(idpAlias);
    if (!instanceCode) {
      logger.warn('Could not extract instance code from IdP alias', { idpAlias });
      return false;
    }

    const spoke = await this.store.findByInstanceCode(instanceCode);
    const isValid = spoke !== null && spoke.status === 'approved';

    logger.debug('IdP validation against MongoDB spokes', {
      idpAlias,
      instanceCode,
      spokeFound: spoke !== null,
      spokeStatus: spoke?.status,
      isValid
    });

    return isValid;
  }

  async filterIdPsByActiveSpokes<T extends { alias: string }>(idps: T[]): Promise<T[]> {
    const activeCodes = await this.getActiveSpokeCodes();

    return idps.filter(idp => {
      const instanceCode = this.extractInstanceCodeFromAlias(idp.alias);
      return instanceCode && activeCodes.includes(instanceCode);
    });
  }

  extractInstanceCodeFromAlias(alias: string): string | null {
    const match = alias.match(/^([a-z]+)-idp$/i);
    return match ? match[1].toUpperCase() : null;
  }

  // ============================================
  // RUNTIME HEALTH STATUS
  // ============================================

  getSpokeRuntimeHealth(spoke: ISpokeRegistration): 'online' | 'degraded' | 'offline' {
    if (spoke.status !== 'approved') {
      return 'offline';
    }

    if (!spoke.lastHeartbeat) {
      const registrationAge = Date.now() - spoke.registeredAt.getTime();
      if (registrationAge < 5 * 60 * 1000) {
        return 'degraded';
      }
      return 'offline';
    }

    const heartbeatAge = Date.now() - spoke.lastHeartbeat.getTime();
    const intervalMs = spoke.heartbeatIntervalMs || 30000;

    if (heartbeatAge < intervalMs * 2) {
      return 'online';
    }

    if (heartbeatAge < intervalMs * 5) {
      return 'degraded';
    }

    return 'offline';
  }

  async getActiveSpokesWithHealth(): Promise<Array<{
    instanceCode: string;
    name: string;
    status: string;
    runtimeHealth: 'online' | 'degraded' | 'offline';
    lastHeartbeat: Date | null;
    heartbeatAgeSeconds: number | null;
  }>> {
    try {
      const activeSpokes = await this.store.findByStatus('approved');

      return activeSpokes.map(spoke => ({
        instanceCode: spoke.instanceCode,
        name: spoke.name,
        status: spoke.status,
        runtimeHealth: this.getSpokeRuntimeHealth(spoke),
        lastHeartbeat: spoke.lastHeartbeat || null,
        heartbeatAgeSeconds: spoke.lastHeartbeat
          ? Math.floor((Date.now() - spoke.lastHeartbeat.getTime()) / 1000)
          : null,
      }));
    } catch (error) {
      logger.error('Failed to get active spokes with health', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }

  async getSpokeHealthByCode(instanceCode: string): Promise<'online' | 'degraded' | 'offline' | 'not_found'> {
    const spoke = await this.store.findByInstanceCode(instanceCode.toUpperCase());
    if (!spoke) {
      return 'not_found';
    }
    return this.getSpokeRuntimeHealth(spoke);
  }

  // ============================================
  // CERTIFICATE VALIDATION (delegated)
  // ============================================

  async validateCertificate(certificatePEM: string): Promise<ICertificateValidation> {
    return validateCertificate(certificatePEM);
  }

  // ============================================
  // HELPERS
  // ============================================

  private generateSpokeId(instanceCode: string): string {
    const random = crypto.randomBytes(4).toString('hex');
    return `spoke-${instanceCode.toLowerCase()}-${random}`;
  }

  private generateToken(): string {
    return crypto.randomBytes(32).toString('base64url');
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const hubSpokeRegistry = new HubSpokeRegistryService();

export default HubSpokeRegistryService;
