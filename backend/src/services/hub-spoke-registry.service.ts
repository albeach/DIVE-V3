/**
 * DIVE V3 - Hub-Spoke Registry Service
 *
 * Central registry for managing federated spoke instances.
 * The Hub validates, authorizes, and tracks all spoke deployments.
 *
 * Features:
 * - Spoke registration with certificate-based identity
 * - X.509 certificate validation and fingerprint tracking
 * - Spoke authorization/revocation
 * - Policy scope assignment per spoke
 * - Health monitoring of spokes
 * - Audit logging of all federation events
 *
 * Security:
 * - mTLS for spoke communication
 * - X.509 certificate validation (TLS, algorithm strength)
 * - JWT tokens with limited scope
 * - Bilateral trust establishment
 *
 * @version 1.1.0
 * @date 2025-12-04
 */

import crypto from 'crypto';
import { X509Certificate } from 'crypto';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { opalClient } from './opal-client';
import { opalDataService } from './opal-data.service';
import { idpValidationService } from './idp-validation.service';

// ============================================
// TYPES
// ============================================

export interface ISpokeRegistration {
  spokeId: string;
  instanceCode: string;  // USA, FRA, GBR, DEU, etc.
  name: string;
  description?: string;
  baseUrl: string;
  apiUrl: string;
  internalApiUrl?: string; // Internal Docker network API URL
  idpUrl: string;         // Internal Docker network URL (for backend validation)
  idpPublicUrl?: string;  // Public browser-accessible URL (for federation)

  // Certificate/Auth
  publicKey?: string;
  certificateFingerprint?: string;
  certificatePEM?: string;  // Full certificate for mTLS
  certificateSubject?: string;
  certificateIssuer?: string;
  certificateNotBefore?: Date;
  certificateNotAfter?: Date;
  certificateValidationResult?: ICertificateValidation;

  // Authorization
  status: 'pending' | 'approved' | 'suspended' | 'revoked';
  approvedAt?: Date;
  approvedBy?: string;
  suspendedReason?: string;
  revokedReason?: string;

  // Policy Scope
  allowedPolicyScopes: string[];  // Which tenant data they can receive
  dataIsolationLevel: 'full' | 'filtered' | 'minimal';

  // Metadata
  registeredAt: Date;
  lastHeartbeat?: Date;
  heartbeatIntervalMs: number;
  version?: string;

  // Trust
  trustLevel: 'development' | 'partner' | 'bilateral' | 'national';
  maxClassificationAllowed: string;

  // Federation (Phase 3 Enhancement)
  federationIdPAlias?: string;  // IdP alias in hub Keycloak (e.g., 'gbr-idp')

  // BIDIRECTIONAL FEDERATION CREDENTIALS
  // Spoke's Keycloak admin password for creating reverse IdP
  // NOTE: This is stored encrypted and cleared after bidirectional federation is established
  keycloakAdminPassword?: string;  // Encrypted or base64-encoded

  // Rate Limiting
  rateLimit: {
    requestsPerMinute: number;
    burstSize: number;
  };

  // Audit
  auditRetentionDays: number;
  lastAuditSync?: Date;
}

export interface ICertificateValidation {
  valid: boolean;
  fingerprint: string;
  algorithm: string;
  tlsVersion?: string;
  tlsScore?: number;
  warnings: string[];
  errors: string[];
  validatedAt: Date;
}

export interface ISpokeToken {
  token: string;
  spokeId: string;
  scopes: string[];
  expiresAt: Date;
  issuedAt: Date;
}

export interface ISpokeHealthStatus {
  spokeId: string;
  healthy: boolean;
  lastCheck: Date;
  opaHealthy: boolean;
  opalClientConnected: boolean;
  lastPolicySync?: Date;
  latencyMs?: number;
}

export interface IRegistrationRequest {
  instanceCode: string;
  name: string;
  description?: string;
  baseUrl: string;
  apiUrl: string;
  idpUrl: string;
  idpPublicUrl?: string; // Public-facing IdP URL (localhost or domain)
  publicKey?: string;
  certificatePEM?: string;  // X.509 certificate for mTLS
  requestedScopes: string[];
  contactEmail: string;
  validateEndpoints?: boolean;  // Whether to validate IdP endpoints

  // CRITICAL FOR BIDIRECTIONAL FEDERATION:
  // Spoke must provide its Keycloak admin credentials so Hub can create reverse IdP
  keycloakAdminPassword?: string;  // Spoke's Keycloak admin password (for bidirectional federation)
}

export interface IHubStatistics {
  totalSpokes: number;
  activeSpokes: number;
  pendingApprovals: number;
  suspendedSpokes: number;
  revokedSpokes: number;
  lastPolicyPush?: Date;
  policySyncErrors: number;
}

// ============================================
// STORE INTERFACE
// ============================================

interface ISpokeStore {
  save(spoke: ISpokeRegistration): Promise<void>;
  findById(spokeId: string): Promise<ISpokeRegistration | null>;
  findByInstanceCode(code: string): Promise<ISpokeRegistration | null>;
  findAll(): Promise<ISpokeRegistration[]>;
  findByStatus(status: ISpokeRegistration['status']): Promise<ISpokeRegistration[]>;
  delete(spokeId: string): Promise<boolean>;
  saveToken(token: ISpokeToken): Promise<void>;
  findToken(token: string): Promise<ISpokeToken | null>;
  findAllTokensBySpokeId(spokeId: string): Promise<ISpokeToken[]>;
  revokeTokensForSpoke(spokeId: string): Promise<void>;
}

// ============================================
// IN-MEMORY STORE (For testing and development)
// ============================================

class InMemorySpokeStore implements ISpokeStore {
  private spokes: Map<string, ISpokeRegistration> = new Map();
  private tokens: Map<string, ISpokeToken> = new Map();

  async save(spoke: ISpokeRegistration): Promise<void> {
    this.spokes.set(spoke.spokeId, spoke);
  }

  async findById(spokeId: string): Promise<ISpokeRegistration | null> {
    return this.spokes.get(spokeId) || null;
  }

  async findByInstanceCode(code: string): Promise<ISpokeRegistration | null> {
    for (const spoke of this.spokes.values()) {
      if (spoke.instanceCode === code) return spoke;
    }
    return null;
  }

  async findAll(): Promise<ISpokeRegistration[]> {
    return Array.from(this.spokes.values());
  }

  async findByStatus(status: ISpokeRegistration['status']): Promise<ISpokeRegistration[]> {
    return Array.from(this.spokes.values()).filter(s => s.status === status);
  }

  async delete(spokeId: string): Promise<boolean> {
    return this.spokes.delete(spokeId);
  }

  async saveToken(token: ISpokeToken): Promise<void> {
    this.tokens.set(token.token, token);
  }

  async findToken(token: string): Promise<ISpokeToken | null> {
    return this.tokens.get(token) || null;
  }

  async findAllTokensBySpokeId(spokeId: string): Promise<ISpokeToken[]> {
    const result: ISpokeToken[] = [];
    for (const token of this.tokens.values()) {
      if (token.spokeId === spokeId) {
        result.push(token);
      }
    }
    return result;
  }

  async revokeTokensForSpoke(spokeId: string): Promise<void> {
    for (const [key, token] of this.tokens.entries()) {
      if (token.spokeId === spokeId) {
        this.tokens.delete(key);
      }
    }
  }
}

// ============================================
// MONGODB STORE ADAPTER
// ============================================

class MongoDBSpokeStoreAdapter implements ISpokeStore {
  private mongoStore: import('../models/federation-spoke.model').MongoSpokeStore | null = null;
  private initPromise: Promise<void> | null = null;

  private async ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initialize();
    }
    await this.initPromise;
  }

  private async initialize(): Promise<void> {
    try {
      const { mongoSpokeStore } = await import('../models/federation-spoke.model');
      this.mongoStore = mongoSpokeStore;
      await this.mongoStore.initialize();
      logger.info('MongoDB Spoke Store adapter initialized');
    } catch (error) {
      logger.error('Failed to initialize MongoDB adapter, falling back to in-memory', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async save(spoke: ISpokeRegistration): Promise<void> {
    await this.ensureInitialized();
    await this.mongoStore!.save(spoke);
  }

  async findById(spokeId: string): Promise<ISpokeRegistration | null> {
    await this.ensureInitialized();
    return this.mongoStore!.findById(spokeId);
  }

  async findByInstanceCode(code: string): Promise<ISpokeRegistration | null> {
    await this.ensureInitialized();
    return this.mongoStore!.findByInstanceCode(code);
  }

  async findAll(): Promise<ISpokeRegistration[]> {
    await this.ensureInitialized();
    return this.mongoStore!.findAll();
  }

  async findByStatus(status: ISpokeRegistration['status']): Promise<ISpokeRegistration[]> {
    await this.ensureInitialized();
    return this.mongoStore!.findByStatus(status);
  }

  async delete(spokeId: string): Promise<boolean> {
    await this.ensureInitialized();
    return this.mongoStore!.delete(spokeId);
  }

  async saveToken(token: ISpokeToken): Promise<void> {
    await this.ensureInitialized();
    await this.mongoStore!.saveToken(token);
  }

  async findToken(tokenString: string): Promise<ISpokeToken | null> {
    await this.ensureInitialized();
    return this.mongoStore!.findToken(tokenString);
  }

  async findAllTokensBySpokeId(spokeId: string): Promise<ISpokeToken[]> {
    await this.ensureInitialized();
    return this.mongoStore!.findAllTokensBySpokeId(spokeId);
  }

  async revokeTokensForSpoke(spokeId: string): Promise<void> {
    await this.ensureInitialized();
    await this.mongoStore!.revokeTokensForSpoke(spokeId);
  }
}

// ============================================
// STORE FACTORY
// ============================================

function createSpokeStore(): ISpokeStore {
  // Use MongoDB in production, in-memory for tests
  const useMemory = process.env.NODE_ENV === 'test' ||
    process.env.SPOKE_STORE === 'memory' ||
    !process.env.MONGODB_URL;

  if (useMemory) {
    logger.info('Using in-memory spoke store');
    return new InMemorySpokeStore();
  }

  logger.info('Using MongoDB spoke store');
  return new MongoDBSpokeStoreAdapter();
}

// ============================================
// HUB-SPOKE REGISTRY SERVICE
// ============================================

class HubSpokeRegistryService extends EventEmitter {
  private store: ISpokeStore;
  private readonly hubSecret: string;
  private tokenValidityMs: number;

  constructor(store?: ISpokeStore) {
    super(); // Required for EventEmitter inheritance

    // Allow injecting a store for testing
    this.store = store || createSpokeStore();
    this.hubSecret = process.env.HUB_SPOKE_SECRET || crypto.randomBytes(32).toString('hex');
    this.tokenValidityMs = parseInt(process.env.SPOKE_TOKEN_VALIDITY_MS || '86400000', 10); // 24h

    logger.info('Hub-Spoke Registry Service initialized', {
      storeType: this.store.constructor.name
    });
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
        // CRITICAL FIX (2026-01-15): Return existing registration (idempotent behavior)
        // Previous: throw Error → HTTP 500
        // Fixed: Return existing → HTTP 201 with existing data
        // Best practice: Registration endpoints should be idempotent
        logger.info('Spoke already registered, returning existing registration', {
          spokeId: existing.spokeId,
          instanceCode: existing.instanceCode,
          status: existing.status
        });
        return existing;
      }
      // Delete the revoked registration to allow re-registration
      logger.info('Deleting revoked spoke to allow re-registration', {
        spokeId: existing.spokeId,
        instanceCode: existing.instanceCode,
      });
      await this.store.delete(existing.spokeId);
    }

    const spokeId = this.generateSpokeId(request.instanceCode);

    // Validate X.509 certificate if provided
    let certValidation: ICertificateValidation | undefined;
    let certSubject: string | undefined;
    let certIssuer: string | undefined;
    let certNotBefore: Date | undefined;
    let certNotAfter: Date | undefined;
    let certFingerprint: string | undefined;

    if (request.certificatePEM) {
      certValidation = await this.validateCertificate(request.certificatePEM);

      if (!certValidation.valid && certValidation.errors.length > 0) {
        logger.warn('Spoke certificate validation failed', {
          instanceCode: request.instanceCode,
          errors: certValidation.errors
        });
        // We don't reject - just log warning. Admin can decide during approval.
      }

      // Extract certificate details
      try {
        const certDetails = this.extractCertificateDetails(request.certificatePEM);
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

        // Store TLS validation in cert validation
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
      idpPublicUrl: request.idpPublicUrl, // Add public-facing IdP URL
      publicKey: request.publicKey,
      certificatePEM: request.certificatePEM,
      certificateFingerprint: certFingerprint,
      certificateSubject: certSubject,
      certificateIssuer: certIssuer,
      certificateNotBefore: certNotBefore,
      certificateNotAfter: certNotAfter,
      certificateValidationResult: certValidation,

      status: 'pending',

      // Default to minimal scope until approved
      allowedPolicyScopes: [],
      dataIsolationLevel: 'minimal',

      registeredAt: new Date(),
      heartbeatIntervalMs: 30000, // 30 seconds

      trustLevel: 'development',
      maxClassificationAllowed: 'UNCLASSIFIED',

      // Default rate limits
      rateLimit: {
        requestsPerMinute: 60,
        burstSize: 10
      },

      // Default audit retention
      auditRetentionDays: 90,

      // BIDIRECTIONAL FEDERATION: Store spoke's Keycloak admin password
      // This is REQUIRED for creating the reverse IdP (hub-idp in spoke Keycloak)
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

    return spoke;
  }

  /**
   * Validate an X.509 certificate
   */
  async validateCertificate(certificatePEM: string): Promise<ICertificateValidation> {
    const result: ICertificateValidation = {
      valid: false,
      fingerprint: '',
      algorithm: '',
      warnings: [],
      errors: [],
      validatedAt: new Date()
    };

    try {
      // Parse the certificate
      const cert = new X509Certificate(certificatePEM);

      // Calculate fingerprint
      result.fingerprint = crypto
        .createHash('sha256')
        .update(Buffer.from(certificatePEM))
        .digest('hex')
        .toUpperCase();

      // Get public key algorithm
      const pubKey = cert.publicKey;
      result.algorithm = pubKey.asymmetricKeyType || 'unknown';

      // Check validity dates
      const now = new Date();
      const validFrom = new Date(cert.validFrom);
      const validTo = new Date(cert.validTo);

      if (now < validFrom) {
        result.errors.push(`Certificate not yet valid (valid from: ${validFrom.toISOString()})`);
      }

      if (now > validTo) {
        result.errors.push(`Certificate has expired (expired: ${validTo.toISOString()})`);
      }

      // Warn if expiring soon (30 days)
      const daysUntilExpiry = (validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      if (daysUntilExpiry > 0 && daysUntilExpiry < 30) {
        result.warnings.push(`Certificate expires in ${Math.floor(daysUntilExpiry)} days`);
      }

      // Check key size
      if (result.algorithm === 'rsa') {
        const keyDetails = pubKey.export({ type: 'spki', format: 'der' });
        // RSA key size approximation from DER length
        if (keyDetails.length < 270) {
          result.warnings.push('RSA key size may be less than 2048 bits');
        }
      }

      // Check for self-signed
      if (cert.issuer === cert.subject) {
        result.warnings.push('Certificate is self-signed');
      }

      result.valid = result.errors.length === 0;

    } catch (error) {
      result.errors.push(`Certificate parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      result.valid = false;
    }

    return result;
  }

  /**
   * Extract details from X.509 certificate
   */
  private extractCertificateDetails(certificatePEM: string): {
    subject: string;
    issuer: string;
    validFrom: Date;
    validTo: Date;
  } {
    const cert = new X509Certificate(certificatePEM);

    return {
      subject: cert.subject,
      issuer: cert.issuer,
      validFrom: new Date(cert.validFrom),
      validTo: new Date(cert.validTo)
    };
  }

  /**
   * Approve a pending spoke registration
   *
   * Phase 3 Enhancement: Automatically creates Keycloak IdP federation
   * This enables cross-border SSO immediately upon approval.
   */
  async approveSpoke(
    spokeId: string,
    approvedBy: string,
    options: {
      allowedScopes: string[];
      trustLevel: ISpokeRegistration['trustLevel'];
      maxClassification: string;
      dataIsolationLevel: ISpokeRegistration['dataIsolationLevel'];
      autoLinkIdP?: boolean; // Default true
    }
  ): Promise<ISpokeRegistration> {
    const spoke = await this.store.findById(spokeId);
    if (!spoke) {
      throw new Error(`Spoke ${spokeId} not found`);
    }

    if (spoke.status === 'approved') {
      throw new Error(`Spoke ${spokeId} is already approved`);
    }

    spoke.status = 'approved';
    spoke.approvedAt = new Date();
    spoke.approvedBy = approvedBy;
    spoke.allowedPolicyScopes = options.allowedScopes;
    spoke.trustLevel = options.trustLevel;
    spoke.maxClassificationAllowed = options.maxClassification;
    spoke.dataIsolationLevel = options.dataIsolationLevel;

    await this.store.save(spoke);

    const correlationId = `spoke-approval-${uuidv4()}`;

    logger.info('Spoke approved', {
      spokeId,
      instanceCode: spoke.instanceCode,
      approvedBy,
      allowedScopes: options.allowedScopes,
      trustLevel: options.trustLevel,
      correlationId
    });

    // Notify OPAL to include this spoke in policy distribution
    await this.notifyOPALOfSpokeChange(spoke, 'approved');

    // ============================================
    // EVENT-DRIVEN CASCADE (Phase 1)
    // ============================================
    // Emit event for Federation Sync Service to cascade updates
    // to OPAL/OPA, Keycloak, MongoDB resources, Redis cache, webhooks
    this.emit('spoke:approved', {
      spoke,
      timestamp: new Date(),
      approvedBy,
      correlationId
    });

    // AUTO-LINK IDENTITY PROVIDER (Phase 3 Enhancement)
    // Create BIDIRECTIONAL Keycloak IdP trust for SSO
    //
    // FAIL-FAST BEHAVIOR - BIDIRECTIONAL IS MANDATORY:
    // - Both directions MUST succeed for approval to complete
    // - Direction 1: Hub → Spoke (spoke-idp in Hub Keycloak)
    // - Direction 2: Spoke → Hub (hub-idp in Spoke Keycloak)
    // - If EITHER fails, suspend spoke and throw error
    if (options.autoLinkIdP !== false) {
      try {
        await this.createFederationIdP(spoke);

        // Store the IdP alias for reference
        spoke.federationIdPAlias = `${spoke.instanceCode.toLowerCase()}-idp`;
        await this.store.save(spoke);

        // Clear the Keycloak password after successful federation (security best practice)
        // The password was only needed for creating the reverse IdP
        spoke.keycloakAdminPassword = undefined;
        await this.store.save(spoke);

        logger.info('BIDIRECTIONAL IdP federation established successfully', {
          spokeId,
          instanceCode: spoke.instanceCode,
          hubIdpAlias: spoke.federationIdPAlias,
          spokeIdpAlias: `${(process.env.INSTANCE_CODE || 'usa').toLowerCase()}-idp`,
          bidirectional: true,
          passwordCleared: true,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        // BIDIRECTIONAL FEDERATION IS REQUIRED - any failure is critical
        logger.error('CRITICAL: Bidirectional federation failed - suspending spoke', {
          spokeId,
          instanceCode: spoke.instanceCode,
          error: errorMessage,
          impact: 'Cross-border SSO will NOT work in both directions',
        });

        // Suspend the spoke since bidirectional federation failed
        await this.suspendSpoke(spokeId, `Bidirectional federation failed: ${errorMessage}`);

        // FIXED (Dec 2025): Re-fetch spoke to get updated status after suspension
        // This fixes race condition where local variable still shows 'approved'
        const suspendedSpoke = await this.store.findById(spokeId);
        if (suspendedSpoke) {
          // Update local variable to reflect true DB state
          Object.assign(spoke, suspendedSpoke);
        }

        // Create error with accurate status information
        const statusError = new Error(
          `Spoke approval failed: Bidirectional federation is REQUIRED. ` +
          `Spoke status is now '${spoke.status}'. Error: ${errorMessage}`
        );
        // Attach spoke to error for caller to access
        (statusError as any).spoke = spoke;
        throw statusError;
      }
    }

    // DYNAMIC TRUSTED ISSUER UPDATE (Phase 4 Enhancement)
    // Update OPA's trusted_issuers and federation_matrix dynamically
    try {
      await this.updateOPATrustForSpoke(spoke, 'add');
    } catch (error) {
      logger.error('Failed to update OPA trust data during spoke approval', {
        spokeId,
        instanceCode: spoke.instanceCode,
        error: error instanceof Error ? error.message : 'Unknown error',
        warning: 'Spoke approved but OPA trust not updated - tokens may be rejected'
      });
      // Don't fail spoke approval, but log warning
    }

    return spoke;
  }

  /**
   * Create Keycloak Identity Provider configuration for approved spoke
   *
   * This is called automatically during spoke approval.
   * Creates bidirectional OIDC trust: Hub ↔ Spoke
   *
   * What it does:
   * 1. Creates `{spoke}-idp` in Hub Keycloak → Points to Spoke Keycloak
   * 2. Configures protocol mappers for DIVE attributes
   * 3. Enables IdP immediately (shows in login page IdP selector)
   *
   * Example:
   * - Spoke: GBR
   * - Creates: `gbr-idp` in USA Hub Keycloak
   * - Discovery: https://localhost:8446/realms/dive-v3-broker-gbr/.well-known/openid-configuration
   * - Result: "United Kingdom" button appears on USA Hub login page
   */
  private async createFederationIdP(spoke: ISpokeRegistration): Promise<void> {
    const { keycloakFederationService } = await import('./keycloak-federation.service');

    const hubInstanceCode = process.env.INSTANCE_CODE || 'USA';
    const spokeInstanceCode = spoke.instanceCode;

    logger.info('Auto-linking IdP for approved spoke', {
      spokeId: spoke.spokeId,
      hubInstance: hubInstanceCode,
      spokeInstance: spokeInstanceCode,
      spokeName: spoke.name,
      spokeIdpUrl: spoke.idpUrl
    });

    // Determine spoke realm name
    // Pattern: dive-v3-broker-{code} (e.g., dive-v3-broker-gbr)
    const spokeRealm = `dive-v3-broker-${spokeInstanceCode.toLowerCase()}`;

    // Determine hub (local) details for reverse IdP creation
    const hubRealmName = process.env.KEYCLOAK_REALM || 'dive-v3-broker';
    const hubIdpUrl = this.getHubIdpUrl();
    const hubName = this.getInstanceName(hubInstanceCode);

    // Get spoke's Keycloak admin password for remote IdP creation
    const spokeKeycloakPassword = await this.getSpokeKeycloakPassword(spokeInstanceCode);

    // Determine URLs for different use cases
    // Development: Internal Docker network + localhost
    // Production: External domains
    const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

    let spokeIdpUrlForValidation: string;
    let spokeIdpUrlForBrowser: string;
    let spokeKeycloakAdminUrl: string;

    if (isDevelopment) {
      // Local dev: Use Docker internal names for Admin API, localhost for browser
      spokeIdpUrlForValidation = spoke.idpUrl;  // Internal (gbr-keycloak-gbr-1:8443)
      spokeIdpUrlForBrowser = spoke.idpPublicUrl || this.getSpokePublicIdpUrl(spokeInstanceCode);  // Localhost
      spokeKeycloakAdminUrl = spoke.idpUrl;  // Internal for Admin API (same network)
    } else {
      // Production: Use external domains for everything
      spokeIdpUrlForValidation = spoke.idpPublicUrl || spoke.idpUrl;  // External domain
      spokeIdpUrlForBrowser = spoke.idpPublicUrl || spoke.idpUrl;  // Same for browser
      spokeKeycloakAdminUrl = spoke.idpPublicUrl || spoke.idpUrl;  // Same for Admin API
    }

    logger.info('Federation URL strategy', {
      environment: isDevelopment ? 'development' : 'production',
      validationUrl: spokeIdpUrlForValidation,
      browserUrl: spokeIdpUrlForBrowser,
      adminUrl: spokeKeycloakAdminUrl,
      spokeInstance: spokeInstanceCode,
    });

    // Create TRUE BIDIRECTIONAL IdP (both directions)
    const result = await keycloakFederationService.createBidirectionalFederation({
      localInstanceCode: hubInstanceCode,
      remoteInstanceCode: spokeInstanceCode,
      remoteName: spoke.name,
      remoteIdpUrl: spokeIdpUrlForBrowser,  // Use PUBLIC URL for browser redirects
      remoteKeycloakAdminUrl: spokeKeycloakAdminUrl,  // Use INTERNAL URL for Admin API
      remoteRealm: spokeRealm,
      localName: hubName,
      localIdpUrl: hubIdpUrl,
      localRealm: hubRealmName,
      remoteKeycloakAdminPassword: spokeKeycloakPassword,
      // Hub (USA) uses dive-v3-broker-usa on the spoke for federation
      federationClientId: 'dive-v3-broker-usa'
    });

    logger.info('IdP federation auto-linked successfully (BIDIRECTIONAL)', {
      spokeId: spoke.spokeId,
      spokeInstance: spokeInstanceCode,
      direction1: `${result.local.alias} in ${hubInstanceCode}`,
      direction2: `${result.remote.alias} in ${spokeInstanceCode}`,
      bidirectional: true
    });

    // Store IdP alias in spoke metadata for future reference
    spoke.federationIdPAlias = result.local.alias;
    await this.store.save(spoke);
  }

  /**
   * Get hub IdP URL for reverse federation
   */
  private getHubIdpUrl(): string {
    // Try explicit environment variable
    if (process.env.HUB_IDP_URL) {
      return process.env.HUB_IDP_URL;
    }

    // Fallback to KEYCLOAK_URL with localhost mapping
    const keycloakUrl = process.env.KEYCLOAK_URL || 'https://localhost:8443';

    // Map container names to localhost for inter-spoke communication
    if (keycloakUrl.includes('keycloak:')) {
      return 'https://localhost:8443';  // USA Hub default (FIXED: was 8081)
    }

    return keycloakUrl;
  }

  /**
   * Get instance display name
   */
  private getInstanceName(instanceCode: string): string {
    const names: Record<string, string> = {
      'USA': 'United States',
      'FRA': 'France',
      'GBR': 'United Kingdom',
      'DEU': 'Germany',
      'CAN': 'Canada',
    };
    return names[instanceCode.toUpperCase()] || instanceCode;
  }

  /**
   * Get spoke's Keycloak admin password
   *
   * SECURITY BEST PRACTICE: Only retrieves password from spoke registration (MongoDB).
   * Spokes provide their admin password during registration for bidirectional federation.
   * 
   * REMOVED: Environment variable and GCP Secret Manager fallbacks (legacy/insecure)
   * The Hub should NOT store spoke admin passwords - only the spoke itself should know it.
   *
   * CRITICAL: For bidirectional federation, the spoke MUST provide its
   * Keycloak admin password during registration. Without it, we cannot
   * create the reverse IdP (hub-idp in spoke Keycloak).
   */
  private async getSpokeKeycloakPassword(spokeInstanceCode: string): Promise<string> {
    const code = spokeInstanceCode.toUpperCase();

    // ONLY SOURCE: Spoke registration in MongoDB
    const spoke = await this.store.findByInstanceCode(code);
    if (spoke?.keycloakAdminPassword) {
      logger.info('Using Keycloak password from spoke registration', {
        spokeInstanceCode: code,
        source: 'spoke_registration',
        passwordLength: spoke.keycloakAdminPassword.length
      });
      return spoke.keycloakAdminPassword;
    }

    // No password available - spoke must provide during registration
    throw new Error(
      `No Keycloak admin password available for spoke ${code}. ` +
      `Spoke must provide 'keycloakAdminPassword' field during registration. ` +
      `Security: Hub does NOT store spoke passwords in environment or GCP.`
    );
  }

  /**
   * Get spoke's public IdP URL (browser-accessible)
   *
   * This is different from the internal Docker network URL.
   * Used for federation redirects where user's browser needs access.
   */
  private getSpokePublicIdpUrl(spokeInstanceCode: string): string {
    const code = spokeInstanceCode.toUpperCase();

    // Check environment variable first
    const envVar = `${code}_KEYCLOAK_PUBLIC_URL`;
    if (process.env[envVar]) {
      return process.env[envVar];
    }

    // For local development, use localhost port mapping
    if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
      const portMap: Record<string, string> = {
        'USA': '8443',  // Hub Keycloak
        'FRA': '8444',
        'GBR': '8446',
        'DEU': '8447',
        'CAN': '8448',
      };
      const port = portMap[code] || '8443';
      return `https://localhost:${port}`;
    }

    // Production: Use instance's public domain
    const domainMap: Record<string, string> = {
      'USA': 'usa-idp.dive25.com',
      'FRA': 'fra-idp.dive25.com',
      'GBR': 'gbr-idp.dive25.com',
      'DEU': 'deu-idp.dive25.com',
      'CAN': 'can-idp.dive25.com',
    };
    const domain = domainMap[code] || `${code.toLowerCase()}-idp.dive25.com`;
    return `https://${domain}`;
  }

  /**
   * Suspend a spoke (temporary block)
   */
  async suspendSpoke(spokeId: string, reason: string): Promise<ISpokeRegistration> {
    const spoke = await this.store.findById(spokeId);
    if (!spoke) {
      throw new Error(`Spoke ${spokeId} not found`);
    }

    spoke.status = 'suspended';
    await this.store.save(spoke);

    // Revoke all tokens for this spoke
    await this.store.revokeTokensForSpoke(spokeId);

    logger.warn('Spoke suspended', {
      spokeId,
      instanceCode: spoke.instanceCode,
      reason
    });

    await this.notifyOPALOfSpokeChange(spoke, 'suspended');

    // DYNAMIC TRUSTED ISSUER UPDATE
    // Remove spoke from trusted_issuers and federation_matrix
    try {
      await this.updateOPATrustForSpoke(spoke, 'remove');
    } catch (error) {
      logger.error('Failed to remove OPA trust data during spoke suspension', {
        spokeId,
        instanceCode: spoke.instanceCode,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    // ============================================
    // EVENT-DRIVEN CASCADE (Phase 1)
    // ============================================
    // Emit event for Federation Sync Service to cascade updates
    // to OPAL/OPA removal, Keycloak IdP disable, cache invalidation
    const correlationId = `spoke-suspension-${uuidv4()}`;
    this.emit('spoke:suspended', {
      spoke,
      timestamp: new Date(),
      suspendedBy: 'admin', // TODO: Pass actual admin from controller
      reason,
      correlationId
    });

    return spoke;
  }

  /**
   * Unsuspend a spoke (reactivate after suspension)
   * ADDED (Dec 2025): Provides programmatic way to reactivate suspended spokes
   *
   * @param spokeId - The spoke ID to unsuspend
   * @param unsuspendedBy - Who is unsuspending (for audit)
   * @param retryFederation - Whether to retry bidirectional federation setup
   */
  async unsuspendSpoke(
    spokeId: string,
    unsuspendedBy: string,
    options: { retryFederation?: boolean } = {}
  ): Promise<ISpokeRegistration> {
    const spoke = await this.store.findById(spokeId);
    if (!spoke) {
      throw new Error(`Spoke ${spokeId} not found`);
    }

    if (spoke.status !== 'suspended') {
      throw new Error(`Spoke ${spokeId} is not suspended (current status: ${spoke.status})`);
    }

    // Set status back to approved
    spoke.status = 'approved';
    spoke.suspendedReason = undefined;
    await this.store.save(spoke);

    logger.info('Spoke unsuspended', {
      spokeId,
      instanceCode: spoke.instanceCode,
      unsuspendedBy,
      retryFederation: options.retryFederation,
    });

    // Re-add to OPAL
    await this.notifyOPALOfSpokeChange(spoke, 'approved');

    // Re-add to OPA trust
    try {
      await this.updateOPATrustForSpoke(spoke, 'add');
    } catch (error) {
      logger.error('Failed to restore OPA trust data during spoke unsuspension', {
        spokeId,
        instanceCode: spoke.instanceCode,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Optionally retry bidirectional federation
    if (options.retryFederation) {
      logger.info('Retrying bidirectional federation for unsuspended spoke', {
        spokeId,
        instanceCode: spoke.instanceCode,
      });

      try {
        await this.createFederationIdP(spoke);
        spoke.federationIdPAlias = `${spoke.instanceCode.toLowerCase()}-idp`;
        await this.store.save(spoke);

        logger.info('Bidirectional federation restored successfully', {
          spokeId,
          instanceCode: spoke.instanceCode,
        });
      } catch (error) {
        // Don't re-suspend - just log warning
        logger.warn('Federation retry failed but spoke remains approved', {
          spokeId,
          instanceCode: spoke.instanceCode,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Emit event
    const correlationId = `spoke-unsuspension-${uuidv4()}`;
    this.emit('spoke:unsuspended', {
      spoke,
      timestamp: new Date(),
      unsuspendedBy,
      correlationId,
    });

    return spoke;
  }

  /**
   * Update spoke's Keycloak admin password
   * Used for federation setup when password wasn't captured during registration
   */
  async updateSpokeKeycloakPassword(spokeId: string, keycloakAdminPassword: string): Promise<void> {
    const spoke = await this.store.findById(spokeId);
    if (!spoke) {
      throw new Error(`Spoke ${spokeId} not found`);
    }

    // Update the spoke with the new password
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

  /**
   * Permanently revoke a spoke
   */
  async revokeSpoke(spokeId: string, reason: string): Promise<void> {
    const spoke = await this.store.findById(spokeId);
    if (!spoke) {
      throw new Error(`Spoke ${spokeId} not found`);
    }

    spoke.status = 'revoked';
    await this.store.save(spoke);

    // Revoke all tokens
    await this.store.revokeTokensForSpoke(spokeId);

    logger.error('Spoke revoked', {
      spokeId,
      instanceCode: spoke.instanceCode,
      reason
    });

    await this.notifyOPALOfSpokeChange(spoke, 'revoked');

    // DYNAMIC TRUSTED ISSUER UPDATE
    // Permanently remove spoke from trusted_issuers and federation_matrix
    try {
      await this.updateOPATrustForSpoke(spoke, 'remove');
    } catch (error) {
      logger.error('Failed to remove OPA trust data during spoke revocation', {
        spokeId,
        instanceCode: spoke.instanceCode,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    // ============================================
    // EVENT-DRIVEN CASCADE (Phase 1)
    // ============================================
    // Emit event for Federation Sync Service to cascade permanent removal
    // Includes: OPAL/OPA removal, Keycloak IdP deletion, cache invalidation
    const correlationId = `spoke-revocation-${uuidv4()}`;
    this.emit('spoke:revoked', {
      spoke,
      timestamp: new Date(),
      revokedBy: 'admin', // TODO: Pass actual admin from controller
      reason,
      correlationId
    });
  }

  // ============================================
  // TOKEN MANAGEMENT
  // ============================================

  /**
   * Generate a scoped token for an approved spoke
   */
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

  /**
   * Validate a spoke token
   */
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

  /**
   * Record a heartbeat from a spoke
   */
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

  /**
   * Check health of a specific spoke
   */
  async checkSpokeHealth(spokeId: string): Promise<ISpokeHealthStatus> {
    const spoke = await this.store.findById(spokeId);
    if (!spoke) {
      throw new Error(`Spoke ${spokeId} not found`);
    }

    // In production, this would actually probe the spoke's health endpoint
    const healthy = spoke.lastHeartbeat
      ? (Date.now() - spoke.lastHeartbeat.getTime()) < (spoke.heartbeatIntervalMs * 3)
      : false;

    return {
      spokeId,
      healthy,
      lastCheck: new Date(),
      opaHealthy: healthy, // Simplified
      opalClientConnected: healthy
    };
  }

  /**
   * Get unhealthy spokes (missed heartbeats)
   */
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

  /**
   * Get active (non-expired) token for a spoke
   * Returns null if no active token exists
   */
  async getActiveToken(spokeId: string): Promise<ISpokeToken | null> {
    const tokens = await this.store.findAllTokensBySpokeId(spokeId);

    if (!tokens || tokens.length === 0) {
      return null;
    }

    // Find a non-expired token
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
      policySyncErrors: 0 // TODO: Track from OPAL
    };
  }

  // ============================================
  // OPAL INTEGRATION
  // ============================================

  /**
   * Notify OPAL of spoke status change
   * This triggers policy scope updates
   */
  private async notifyOPALOfSpokeChange(
    spoke: ISpokeRegistration,
    event: 'approved' | 'suspended' | 'revoked'
  ): Promise<void> {
    if (!opalClient.isOPALEnabled()) {
      logger.debug('OPAL disabled, skipping spoke notification');
      return;
    }

    try {
      // Update the authorized_spokes data in OPA
      const allApproved = await this.store.findByStatus('approved');
      const authorizedSpokes: Record<string, {
        instance_code: string;
        scopes: string[];
        trust_level: string;
        max_classification: string;
      }> = {};

      for (const s of allApproved) {
        authorizedSpokes[s.spokeId] = {
          instance_code: s.instanceCode,
          scopes: s.allowedPolicyScopes,
          trust_level: s.trustLevel,
          max_classification: s.maxClassificationAllowed
        };
      }

      await opalClient.publishInlineData(
        'authorized_spokes',
        authorizedSpokes,
        `Spoke ${event}: ${spoke.instanceCode}`
      );

      logger.info('OPAL notified of spoke change', {
        event,
        spokeId: spoke.spokeId,
        instanceCode: spoke.instanceCode
      });
    } catch (error) {
      logger.error('Failed to notify OPAL of spoke change', {
        error: error instanceof Error ? error.message : 'Unknown error',
        event,
        spokeId: spoke.spokeId
      });
    }
  }

  /**
   * Update OPA trusted issuers and federation matrix for a spoke
   *
   * This method dynamically updates OPA's policy data when:
   * - A spoke is approved: Add its Keycloak as a trusted issuer
   * - A spoke is suspended/revoked: Remove its Keycloak from trusted issuers
   *
   * This ensures federation tokens are immediately valid/invalid without
   * requiring manual policy file updates or container restarts.
   */
  private async updateOPATrustForSpoke(
    spoke: ISpokeRegistration,
    action: 'add' | 'remove'
  ): Promise<void> {
    const instanceCode = spoke.instanceCode.toUpperCase();

    // Determine the spoke's Keycloak issuer URL
    // Development: localhost with NATO port convention
    // Production: External domain
    const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
    let issuerUrl: string;

    if (isDevelopment) {
      // Use NATO port convention for local development
      const portOffset = this.getPortOffsetForCountry(instanceCode);
      const keycloakHttpsPort = 8443 + portOffset;
      const realmName = `dive-v3-broker-${instanceCode.toLowerCase()}`;
      issuerUrl = `https://localhost:${keycloakHttpsPort}/realms/${realmName}`;
    } else {
      // Production: Use the IdP public URL from spoke registration
      issuerUrl = spoke.idpPublicUrl || spoke.idpUrl;
    }

    logger.info(`${action === 'add' ? 'Adding' : 'Removing'} trusted issuer for spoke`, {
      spokeId: spoke.spokeId,
      instanceCode,
      issuerUrl,
      action
    });

    if (action === 'add') {
      // Add spoke's Keycloak as trusted issuer
      await opalDataService.updateTrustedIssuer(issuerUrl, {
        tenant: instanceCode,
        name: `${spoke.name || instanceCode} Keycloak`,
        country: instanceCode,
        trust_level: this.mapTrustLevel(spoke.trustLevel),
        enabled: true,
        protocol: 'oidc',
        federation_class: isDevelopment ? 'LOCAL' : 'NATIONAL'
      });

      // Update federation matrix to include this spoke
      const hubInstanceCode = process.env.INSTANCE_CODE || 'USA';
      const currentPartners = await this.getCurrentFederationPartners(hubInstanceCode);
      if (!currentPartners.includes(instanceCode)) {
        currentPartners.push(instanceCode);
        await opalDataService.updateFederationMatrix(hubInstanceCode, currentPartners);
      }

      logger.info('OPA trust data updated for approved spoke', {
        spokeId: spoke.spokeId,
        instanceCode,
        issuerUrl,
        federationPartners: currentPartners
      });
    } else {
      // Remove spoke's Keycloak from trusted issuers
      await opalDataService.removeTrustedIssuer(issuerUrl);

      // Update federation matrix to exclude this spoke
      const hubInstanceCode = process.env.INSTANCE_CODE || 'USA';
      const currentPartners = await this.getCurrentFederationPartners(hubInstanceCode);
      const updatedPartners = currentPartners.filter(p => p !== instanceCode);
      if (updatedPartners.length !== currentPartners.length) {
        await opalDataService.updateFederationMatrix(hubInstanceCode, updatedPartners);
      }

      logger.info('OPA trust data removed for suspended/revoked spoke', {
        spokeId: spoke.spokeId,
        instanceCode,
        issuerUrl,
        federationPartners: updatedPartners
      });
    }
  }

  /**
   * Get port offset for a country based on NATO convention
   */
  private getPortOffsetForCountry(countryCode: string): number {
    // NATO port offset convention (from nato-countries.sh)
    const portOffsets: Record<string, number> = {
      'USA': 0, 'ALB': 1, 'BEL': 2, 'BGR': 3, 'CAN': 4,
      'HRV': 5, 'CZE': 6, 'DNK': 7, 'EST': 8, 'FRA': 9,
      'DEU': 10, 'GRC': 11, 'HUN': 12, 'ISL': 13, 'ITA': 14,
      'LVA': 15, 'LTU': 16, 'LUX': 17, 'MNE': 18, 'NLD': 19,
      'MKD': 20, 'NOR': 21, 'POL': 22, 'PRT': 23, 'ROU': 24,
      'SVK': 25, 'SVN': 26, 'ESP': 27, 'TUR': 28, 'GBR': 29,
      'FIN': 30, 'SWE': 31, 'NZL': 32
    };
    return portOffsets[countryCode.toUpperCase()] || 0;
  }

  /**
   * Map spoke trust level to OPA trust level
   */
  private mapTrustLevel(trustLevel: string): 'HIGH' | 'MEDIUM' | 'LOW' | 'DEVELOPMENT' {
    switch (trustLevel?.toUpperCase()) {
      case 'FULL': return 'HIGH';
      case 'PARTIAL': return 'MEDIUM';
      case 'MINIMAL': return 'LOW';
      default: return 'DEVELOPMENT';
    }
  }

  /**
   * Get current federation partners from OPA data
   */
  private async getCurrentFederationPartners(instanceCode: string): Promise<string[]> {
    try {
      const federationMatrix = await opalDataService.getFederationMatrix();
      return federationMatrix[instanceCode] || [];
    } catch (error) {
      logger.warn('Could not get current federation partners, starting with empty list', {
        instanceCode,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }

  /**
   * Push policy update to specific spoke (or all)
   */
  async pushPolicyUpdate(spokeId?: string): Promise<void> {
    const result = await opalClient.triggerPolicyRefresh();

    logger.info('Policy push triggered', {
      targetSpoke: spokeId || 'all',
      success: result.success,
      transactionId: result.transactionId
    });
  }

  // ============================================
  // FEDERATION VALIDATION (MongoDB as Source of Truth)
  // ============================================

  /**
   * Get list of active spoke instance codes from MongoDB
   * This is the SOURCE OF TRUTH for which federation partners are active
   *
   * Used by:
   * - /api/idps/public endpoint to filter IdPs
   * - Dashboard for "Active Federation Partners" count
   * - Federated search for available spokes
   *
   * @returns Array of uppercase instance codes (e.g., ['DEU', 'FRA', 'GBR'])
   */
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

  /**
   * Validate if a Keycloak IdP alias has a corresponding active spoke in MongoDB
   *
   * @param idpAlias - The IdP alias (e.g., 'deu-idp', 'fra-idp')
   * @returns true if the spoke is registered and active in MongoDB
   */
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

  /**
   * Filter a list of IdPs to only include those with active spokes in MongoDB
   *
   * @param idps - Array of IdP objects with 'alias' property
   * @returns Filtered array with only IdPs that have active spokes
   */
  async filterIdPsByActiveSpokes<T extends { alias: string }>(idps: T[]): Promise<T[]> {
    const activeCodes = await this.getActiveSpokeCodes();

    return idps.filter(idp => {
      const instanceCode = this.extractInstanceCodeFromAlias(idp.alias);
      return instanceCode && activeCodes.includes(instanceCode);
    });
  }

  /**
   * Extract instance code from IdP alias
   * @example 'deu-idp' -> 'DEU'
   * @example 'fra-idp' -> 'FRA'
   */
  extractInstanceCodeFromAlias(alias: string): string | null {
    const match = alias.match(/^([a-z]+)-idp$/i);
    return match ? match[1].toUpperCase() : null;
  }

  // ============================================
  // RUNTIME HEALTH STATUS
  // ============================================

  /**
   * Runtime health status for a spoke based on heartbeat freshness
   */
  getSpokeRuntimeHealth(spoke: ISpokeRegistration): 'online' | 'degraded' | 'offline' {
    // If not approved, it's offline
    if (spoke.status !== 'approved') {
      return 'offline';
    }

    // Check heartbeat freshness
    if (!spoke.lastHeartbeat) {
      // Never received heartbeat - consider offline unless just registered
      const registrationAge = Date.now() - spoke.registeredAt.getTime();
      if (registrationAge < 5 * 60 * 1000) { // 5 minutes grace period for new registrations
        return 'degraded';
      }
      return 'offline';
    }

    const heartbeatAge = Date.now() - spoke.lastHeartbeat.getTime();
    const intervalMs = spoke.heartbeatIntervalMs || 30000; // Default 30s

    // Online: heartbeat within 2x interval
    if (heartbeatAge < intervalMs * 2) {
      return 'online';
    }

    // Degraded: heartbeat within 5x interval (missed a few)
    if (heartbeatAge < intervalMs * 5) {
      return 'degraded';
    }

    // Offline: heartbeat too old
    return 'offline';
  }

  /**
   * Get active spokes with their runtime health status
   * Returns both registration status AND runtime health
   */
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

  /**
   * Get spoke health status by instance code
   */
  async getSpokeHealthByCode(instanceCode: string): Promise<'online' | 'degraded' | 'offline' | 'not_found'> {
    const spoke = await this.store.findByInstanceCode(instanceCode.toUpperCase());
    if (!spoke) {
      return 'not_found';
    }
    return this.getSpokeRuntimeHealth(spoke);
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
