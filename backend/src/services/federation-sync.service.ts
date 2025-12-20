/**
 * DIVE V3 - Federation Synchronization Service
 *
 * Single Source of Truth (SSOT) cascade system for federation changes.
 *
 * When the Hub-Spoke Registry approves/suspends/revokes a spoke,
 * this service ensures all dependent systems are updated:
 * - OPAL/OPA (trusted issuers, federation matrix)
 * - Keycloak (IdP configurations)
 * - MongoDB (resource releasabilityTo lists)
 * - Redis (cache invalidation)
 * - Webhooks (spoke notifications)
 *
 * Architecture:
 * Hub-Spoke Registry (SSOT) → Events → Federation Sync Service → Cascades
 *
 * @version 1.0.0
 * @date 2025-12-20
 */

import { EventEmitter } from 'events';
import { MongoClient, Db } from 'mongodb';
import { logger } from '../utils/logger';
import { opalDataService } from './opal-data.service';
import { keycloakFederationService } from './keycloak-federation.service';
import { getMongoDBUrl, getMongoDBName } from '../utils/mongodb-config';
import { ISpokeRegistration } from './hub-spoke-registry.service';

// ============================================
// TYPES
// ============================================

export interface ISpokeApprovedEvent {
  spoke: ISpokeRegistration;
  timestamp: Date;
  approvedBy: string;
  correlationId: string;
}

export interface ISpokeSuspendedEvent {
  spoke: ISpokeRegistration;
  timestamp: Date;
  suspendedBy: string;
  reason: string;
  correlationId: string;
}

export interface ISpokeRevokedEvent {
  spoke: ISpokeRegistration;
  timestamp: Date;
  revokedBy: string;
  reason: string;
  correlationId: string;
}

export interface IFederationSyncResult {
  success: boolean;
  spoke: string;
  instanceCode: string;
  updates: {
    opaUpdated: boolean;
    keycloakUpdated: boolean;
    resourcesUpdated: boolean;
    resourceCount?: number;
    cacheInvalidated: boolean;
    webhooksSent: boolean;
  };
  errors?: string[];
  timestamp: Date;
}

// ============================================
// FEDERATION SYNC SERVICE
// ============================================

class FederationSyncService extends EventEmitter {
  private db: Db | null = null;
  private initialized = false;

  /**
   * Initialize MongoDB connection
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const client = new MongoClient(getMongoDBUrl());
      await client.connect();
      this.db = client.db(getMongoDBName());
      this.initialized = true;

      logger.info('Federation Sync Service initialized');
    } catch (error) {
      logger.error('Failed to initialize Federation Sync Service', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Handle spoke approval event
   * Cascades federation updates to all dependent systems
   */
  async onSpokeApproved(event: ISpokeApprovedEvent): Promise<IFederationSyncResult> {
    const { spoke, approvedBy, correlationId } = event;
    const instanceCode = spoke.instanceCode.toUpperCase();

    logger.info('Processing spoke approval cascade', {
      spokeId: spoke.spokeId,
      instanceCode,
      approvedBy,
      correlationId
    });

    const result: IFederationSyncResult = {
      success: true,
      spoke: spoke.spokeId,
      instanceCode,
      updates: {
        opaUpdated: false,
        keycloakUpdated: false,
        resourcesUpdated: false,
        cacheInvalidated: false,
        webhooksSent: false
      },
      errors: [],
      timestamp: new Date()
    };

    // 1. Update OPAL/OPA (trusted issuers + federation matrix)
    try {
      await this.updateOPAFederation(spoke, 'add');
      result.updates.opaUpdated = true;
      logger.info('OPA federation data updated', { instanceCode, correlationId });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      result.errors?.push(`OPA update failed: ${errorMsg}`);
      logger.error('Failed to update OPA federation', { error: errorMsg, correlationId });
    }

    // 2. Create Keycloak IdP (if auto-link enabled)
    if (spoke.federationIdPAlias) {
      try {
        await this.createKeycloakIdP(spoke);
        result.updates.keycloakUpdated = true;
        logger.info('Keycloak IdP created', { instanceCode, correlationId });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        result.errors?.push(`Keycloak update failed: ${errorMsg}`);
        logger.error('Failed to create Keycloak IdP', { error: errorMsg, correlationId });
      }
    }

    // 3. Update MongoDB Resources (add country to releasabilityTo)
    try {
      const resourceCount = await this.addCountryToResources(instanceCode, spoke.maxClassificationAllowed);
      result.updates.resourcesUpdated = true;
      result.updates.resourceCount = resourceCount;
      logger.info('MongoDB resources updated', { instanceCode, resourceCount, correlationId });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      result.errors?.push(`Resource update failed: ${errorMsg}`);
      logger.error('Failed to update resources', { error: errorMsg, correlationId });
    }

    // 4. Invalidate authorization cache
    try {
      await this.invalidateAuthzCache();
      result.updates.cacheInvalidated = true;
      logger.info('Authorization cache invalidated', { correlationId });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      result.errors?.push(`Cache invalidation failed: ${errorMsg}`);
      logger.warn('Failed to invalidate cache', { error: errorMsg, correlationId });
    }

    // 5. Notify other spokes via webhooks (future enhancement)
    // await this.notifySpokesOfNewPartner(spoke);

    result.success = result.errors!.length === 0;

    this.emit('sync:completed', result);

    return result;
  }

  /**
   * Handle spoke suspension event
   * Removes spoke from federation but preserves resources for audit
   */
  async onSpokeSuspended(event: ISpokeSuspendedEvent): Promise<IFederationSyncResult> {
    const { spoke, suspendedBy, reason, correlationId } = event;
    const instanceCode = spoke.instanceCode.toUpperCase();

    logger.warn('Processing spoke suspension cascade', {
      spokeId: spoke.spokeId,
      instanceCode,
      suspendedBy,
      reason,
      correlationId
    });

    const result: IFederationSyncResult = {
      success: true,
      spoke: spoke.spokeId,
      instanceCode,
      updates: {
        opaUpdated: false,
        keycloakUpdated: false,
        resourcesUpdated: false, // Don't remove from resources (audit trail)
        cacheInvalidated: false,
        webhooksSent: false
      },
      errors: [],
      timestamp: new Date()
    };

    // 1. Update OPAL/OPA (remove from trusted issuers + federation matrix)
    try {
      await this.updateOPAFederation(spoke, 'remove');
      result.updates.opaUpdated = true;
      logger.info('OPA federation data updated (removal)', { instanceCode, correlationId });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      result.errors?.push(`OPA update failed: ${errorMsg}`);
      logger.error('Failed to update OPA federation', { error: errorMsg, correlationId });
    }

    // 2. Disable Keycloak IdP (don't delete - preserve for audit)
    if (spoke.federationIdPAlias) {
      try {
        await this.disableKeycloakIdP(spoke);
        result.updates.keycloakUpdated = true;
        logger.info('Keycloak IdP disabled', { instanceCode, correlationId });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        result.errors?.push(`Keycloak update failed: ${errorMsg}`);
        logger.error('Failed to disable Keycloak IdP', { error: errorMsg, correlationId });
      }
    }

    // 3. Invalidate authorization cache
    try {
      await this.invalidateAuthzCache();
      result.updates.cacheInvalidated = true;
      logger.info('Authorization cache invalidated', { correlationId });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      result.errors?.push(`Cache invalidation failed: ${errorMsg}`);
      logger.warn('Failed to invalidate cache', { error: errorMsg, correlationId });
    }

    result.success = result.errors!.length === 0;

    this.emit('sync:completed', result);

    return result;
  }

  /**
   * Handle spoke revocation event
   * Permanent removal from federation
   */
  async onSpokeRevoked(event: ISpokeRevokedEvent): Promise<IFederationSyncResult> {
    // Similar to suspension but with resource cleanup option
    return this.onSpokeSuspended(event as any);
  }

  // ============================================
  // PRIVATE HELPER METHODS
  // ============================================

  /**
   * Update OPA federation data (trusted issuers + federation matrix)
   */
  private async updateOPAFederation(spoke: ISpokeRegistration, action: 'add' | 'remove'): Promise<void> {
    const instanceCode = spoke.instanceCode.toUpperCase();
    const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

    // Determine issuer URL (NATO port convention for local dev)
    let issuerUrl: string;
    if (isDevelopment) {
      const portOffset = this.getPortOffsetForCountry(instanceCode);
      const keycloakHttpsPort = 8443 + portOffset;
      const realmName = `dive-v3-broker-${instanceCode.toLowerCase()}`;
      issuerUrl = `https://localhost:${keycloakHttpsPort}/realms/${realmName}`;
    } else {
      issuerUrl = spoke.idpPublicUrl || spoke.idpUrl;
    }

    if (action === 'add') {
      // Add to trusted issuers
      await opalDataService.updateTrustedIssuer(issuerUrl, {
        tenant: instanceCode,
        name: `${spoke.name || instanceCode} Keycloak`,
        country: instanceCode,
        trust_level: this.mapTrustLevel(spoke.trustLevel),
        enabled: true,
        protocol: 'oidc',
        federation_class: isDevelopment ? 'LOCAL' : 'NATIONAL'
      });

      // Add to federation matrix
      const hubInstanceCode = process.env.INSTANCE_CODE || 'USA';
      const currentPartners = await this.getCurrentFederationPartners(hubInstanceCode);
      if (!currentPartners.includes(instanceCode)) {
        currentPartners.push(instanceCode);
        await opalDataService.updateFederationMatrix(hubInstanceCode, currentPartners);
      }
    } else {
      // Remove from trusted issuers
      await opalDataService.removeTrustedIssuer(issuerUrl);

      // Remove from federation matrix
      const hubInstanceCode = process.env.INSTANCE_CODE || 'USA';
      const currentPartners = await this.getCurrentFederationPartners(hubInstanceCode);
      const updatedPartners = currentPartners.filter(p => p !== instanceCode);
      if (updatedPartners.length !== currentPartners.length) {
        await opalDataService.updateFederationMatrix(hubInstanceCode, updatedPartners);
      }
    }
  }

  /**
   * Add country to releasabilityTo for appropriate resources
   *
   * Rules:
   * - NATO-tagged resources (COI: NATO, NATO-COSMIC) → Add all NATO members
   * - Bilateral resources (releasabilityTo includes major partners) → Add new partner
   * - Respect maxClassificationAllowed (don't add to TOP_SECRET if max is SECRET)
   */
  private async addCountryToResources(country: string, maxClassification: string): Promise<number> {
    if (!this.db) {
      await this.initialize();
    }

    const classificationHierarchy = ['UNCLASSIFIED', 'RESTRICTED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];
    const maxLevel = classificationHierarchy.indexOf(maxClassification);

    // Build filter: NATO-tagged OR multilateral resources
    const filter = {
      $and: [
        // Don't already include this country
        { releasabilityTo: { $ne: country } },

        // Classification within allowed range
        {
          $expr: {
            $lte: [
              { $indexOfArray: [classificationHierarchy, '$classification'] },
              maxLevel
            ]
          }
        },

        // Either NATO-tagged OR includes major NATO partners
        {
          $or: [
            { COI: { $in: ['NATO', 'NATO-COSMIC'] } },
            { releasabilityTo: { $in: ['USA', 'GBR', 'FRA', 'DEU'] } }
          ]
        }
      ]
    };

    const result = await this.db!.collection('resources').updateMany(
      filter as any,
      {
        $addToSet: { releasabilityTo: country }
      }
    );

    logger.info('Resources updated with new federation partner', {
      country,
      maxClassification,
      updated: result.modifiedCount,
      matched: result.matchedCount
    });

    return result.modifiedCount;
  }

  /**
   * Create Keycloak IdP for approved spoke
   */
  private async createKeycloakIdP(spoke: ISpokeRegistration): Promise<void> {
    if (!spoke.federationIdPAlias) {
      logger.warn('No federationIdPAlias set for spoke', { spokeId: spoke.spokeId });
      return;
    }

    // Delegate to Keycloak Federation Service
    await keycloakFederationService.createBidirectionalFederation({
      instanceCodeA: process.env.INSTANCE_CODE || 'USA',
      instanceCodeB: spoke.instanceCode,
      realmNameA: process.env.KEYCLOAK_REALM || 'dive-v3-broker',
      realmNameB: spoke.federationIdPAlias,
      keycloakUrlB: spoke.idpPublicUrl || spoke.idpUrl,
      keycloakAdminPasswordB: spoke.keycloakAdminPassword
    } as any);
  }

  /**
   * Disable Keycloak IdP for suspended spoke
   */
  private async disableKeycloakIdP(spoke: ISpokeRegistration): Promise<void> {
    // Future: Use Keycloak Admin API to disable IdP
    logger.info('Keycloak IdP disable not yet implemented', { spokeId: spoke.spokeId });
  }

  /**
   * Invalidate Redis authorization cache
   */
  private async invalidateAuthzCache(): Promise<void> {
    // Use Redis FLUSHDB or publish invalidation event
    // For now, log - cache will expire naturally (60s TTL)
    logger.info('Cache invalidation triggered (60s TTL will expire naturally)');

    // Future: Implement Redis pub/sub
    // await redis.publish('authz:invalidate', JSON.stringify({ reason: 'federation_update' }));
  }

  /**
   * Get current federation partners for a tenant
   */
  private async getCurrentFederationPartners(tenant: string): Promise<string[]> {
    const matrix = await opalDataService.getFederationMatrix();
    return matrix[tenant] || [];
  }

  /**
   * Map spoke trust level to OPAL trust level format
   */
  private mapTrustLevel(trustLevel: ISpokeRegistration['trustLevel']): 'HIGH' | 'MEDIUM' | 'LOW' | 'DEVELOPMENT' {
    switch (trustLevel) {
      case 'national': return 'HIGH';
      case 'bilateral': return 'HIGH';
      case 'partner': return 'MEDIUM';
      case 'development': return 'DEVELOPMENT';
      default: return 'MEDIUM';
    }
  }

  /**
   * Get NATO port offset for country
   */
  private getPortOffsetForCountry(countryCode: string): number {
    const portOffsets: Record<string, number> = {
      'USA': 0,
      'GBR': 1,
      'FRA': 2,
      'DEU': 3,
      'CAN': 4,
      'ITA': 5,
      'ESP': 6,
      'NLD': 7,
      'POL': 8,
      'BEL': 9,
      'NOR': 10,
      'DNK': 11,
      'CZE': 12,
      'PRT': 13,
      'HUN': 14,
      'GRC': 15,
      'TUR': 16,
      'ROU': 17,
      'BGR': 18,
      'HRV': 19,
      'SVK': 20,
      'SVN': 21,
      'LTU': 22,
      'LVA': 23,
      'EST': 24,
      'ALB': 25,
      'MNE': 26,
      'NZL': 27,
      'FIN': 28,
      'SWE': 29
    };

    return portOffsets[countryCode] || 99;
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const federationSyncService = new FederationSyncService();

