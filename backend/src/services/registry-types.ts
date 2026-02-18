/**
 * DIVE V3 - Hub-Spoke Registry Types & Store
 *
 * Shared types, interfaces, and store implementations for the hub-spoke registry.
 * Extracted from hub-spoke-registry.service.ts for modularity.
 *
 * @version 1.0.0
 * @date 2026-02-14
 */

import { logger } from '../utils/logger';

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

  // Port configuration (Database SSOT)
  frontendPort?: number;
  backendPort?: number;
  keycloakPort?: number;
  kasPort?: number;

  // Operational settings (from config — Database SSOT)
  operationalSettings?: {
    heartbeatIntervalMs: number;
    tokenRefreshBufferMs: number;
    offlineGracePeriodMs: number;
    policyCachePath: string;
    auditQueuePath: string;
    maxAuditQueueSize: number;
    auditFlushIntervalMs: number;
  };

  // Additional identity metadata
  country?: string;
  organizationType?: 'government' | 'military' | 'commercial';
  contactEmail?: string;
  hubUrl?: string;

  // Certificate/Auth
  publicKey?: string;
  certificateFingerprint?: string;
  certificatePEM?: string;  // Full certificate for mTLS (Hub-signed or self-signed)
  certificateSerialNumber?: string;  // Phase 4: Serial number of Hub-issued certificate
  certificateIssuedByHub?: boolean;  // Phase 4: True if Hub CA signed this certificate
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
  certificatePEM?: string;  // X.509 certificate for mTLS (self-signed or existing)
  certificateCSR?: string;  // Phase 4: CSR for Hub CA to sign
  requestedScopes: string[];
  contactEmail: string;
  validateEndpoints?: boolean;  // Whether to validate IdP endpoints

  // CRITICAL FOR BIDIRECTIONAL FEDERATION:
  // Spoke must provide its Keycloak admin credentials so Hub can create reverse IdP
  keycloakAdminPassword?: string;  // Spoke's Keycloak admin password (for bidirectional federation)

  // Pre-approved partner metadata (from Vault KV, set by shell pipeline)
  partnerPreApproved?: boolean;
  partnerTrustLevel?: 'development' | 'partner' | 'bilateral' | 'national';
  partnerMaxClassification?: 'UNCLASSIFIED' | 'CONFIDENTIAL' | 'SECRET' | 'TOP_SECRET';
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

export interface ISpokeStore {
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

export function createSpokeStore(): ISpokeStore {
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
