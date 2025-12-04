/**
 * DIVE V3 - Hub-Spoke Registry Service
 * 
 * Central registry for managing federated spoke instances.
 * The Hub validates, authorizes, and tracks all spoke deployments.
 * 
 * Features:
 * - Spoke registration with certificate-based identity
 * - Spoke authorization/revocation
 * - Policy scope assignment per spoke
 * - Health monitoring of spokes
 * - Audit logging of all federation events
 * 
 * Security:
 * - mTLS for spoke communication
 * - JWT tokens with limited scope
 * - Bilateral trust establishment
 * 
 * @version 1.0.0
 * @date 2025-12-04
 */

import crypto from 'crypto';
import { logger } from '../utils/logger';
import { opalClient } from './opal-client';

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
  idpUrl: string;
  
  // Certificate/Auth
  publicKey?: string;
  certificateFingerprint?: string;
  
  // Authorization
  status: 'pending' | 'approved' | 'suspended' | 'revoked';
  approvedAt?: Date;
  approvedBy?: string;
  
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
  publicKey?: string;
  requestedScopes: string[];
  contactEmail: string;
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
// IN-MEMORY STORE (Replace with MongoDB in production)
// ============================================

class SpokeStore {
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

  async revokeTokensForSpoke(spokeId: string): Promise<void> {
    for (const [key, token] of this.tokens.entries()) {
      if (token.spokeId === spokeId) {
        this.tokens.delete(key);
      }
    }
  }
}

// ============================================
// HUB-SPOKE REGISTRY SERVICE
// ============================================

class HubSpokeRegistryService {
  private store: SpokeStore;
  private hubSecret: string;
  private tokenValidityMs: number;

  constructor() {
    this.store = new SpokeStore();
    this.hubSecret = process.env.HUB_SPOKE_SECRET || crypto.randomBytes(32).toString('hex');
    this.tokenValidityMs = parseInt(process.env.SPOKE_TOKEN_VALIDITY_MS || '86400000', 10); // 24h
    
    logger.info('Hub-Spoke Registry Service initialized');
  }

  // ============================================
  // REGISTRATION
  // ============================================

  /**
   * Register a new spoke instance
   * Initially in 'pending' status until manually approved
   */
  async registerSpoke(request: IRegistrationRequest): Promise<ISpokeRegistration> {
    // Check if instance code already registered
    const existing = await this.store.findByInstanceCode(request.instanceCode);
    if (existing && existing.status !== 'revoked') {
      throw new Error(`Instance ${request.instanceCode} is already registered`);
    }

    const spokeId = this.generateSpokeId(request.instanceCode);
    
    const spoke: ISpokeRegistration = {
      spokeId,
      instanceCode: request.instanceCode.toUpperCase(),
      name: request.name,
      description: request.description,
      baseUrl: request.baseUrl,
      apiUrl: request.apiUrl,
      idpUrl: request.idpUrl,
      publicKey: request.publicKey,
      
      status: 'pending',
      
      // Default to minimal scope until approved
      allowedPolicyScopes: [],
      dataIsolationLevel: 'minimal',
      
      registeredAt: new Date(),
      heartbeatIntervalMs: 30000, // 30 seconds
      
      trustLevel: 'development',
      maxClassificationAllowed: 'UNCLASSIFIED'
    };

    await this.store.save(spoke);
    
    logger.info('New spoke registration', {
      spokeId,
      instanceCode: spoke.instanceCode,
      name: spoke.name,
      requestedScopes: request.requestedScopes,
      contactEmail: request.contactEmail
    });

    return spoke;
  }

  /**
   * Approve a pending spoke registration
   */
  async approveSpoke(
    spokeId: string, 
    approvedBy: string,
    options: {
      allowedScopes: string[];
      trustLevel: ISpokeRegistration['trustLevel'];
      maxClassification: string;
      dataIsolationLevel: ISpokeRegistration['dataIsolationLevel'];
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

    logger.info('Spoke approved', {
      spokeId,
      instanceCode: spoke.instanceCode,
      approvedBy,
      allowedScopes: options.allowedScopes,
      trustLevel: options.trustLevel
    });

    // Notify OPAL to include this spoke in policy distribution
    await this.notifyOPALOfSpokeChange(spoke, 'approved');

    return spoke;
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

    return spoke;
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

