/**
 * DIVE V3 - Spoke Identity Service
 *
 * SINGLE SOURCE OF TRUTH ARCHITECTURE:
 * - Hub MongoDB is the authoritative source for spokeId
 * - Spoke uses SPOKE_TOKEN for authentication
 * - Hub validates token on heartbeat and returns authoritative spokeId
 * - Local MongoDB cache used only when Hub is unavailable
 *
 * FLOW:
 * 1. Shell scripts register spoke with Hub → Hub generates spokeId + token
 * 2. Shell scripts store SPOKE_TOKEN in .env
 * 3. Backend starts heartbeat with SPOKE_TOKEN
 * 4. Hub validates token → returns spokeId in heartbeat response
 * 5. Backend caches spokeId for local use
 *
 * @version 2.0.0
 * @date 2026-01-22
 */

import { logger } from '../utils/logger';
import { spokeIdentityCacheStore } from '../models/spoke-identity-cache.model';
import { spokeHeartbeat } from './spoke-heartbeat.service';

// ============================================
// TYPES
// ============================================

export interface ISpokeIdentity {
  spokeId: string;
  instanceCode: string;
  token: string;
  status: 'pending' | 'approved' | 'suspended' | 'revoked';
  verifiedByHub: boolean;
  cachedAt?: Date;
}

// ============================================
// SPOKE IDENTITY SERVICE
// ============================================

class SpokeIdentityService {
  private identity: ISpokeIdentity | null = null;
  private initialized = false;
  private instanceCode: string = '';
  private spokeToken: string = '';
  private hubUrl: string = '';

  /**
   * Initialize spoke identity from environment and heartbeat
   * 
   * SPOKE_TOKEN is the identity - Hub knows which spokeId it belongs to.
   * On first heartbeat, Hub returns the authoritative spokeId.
   */
  async initialize(): Promise<ISpokeIdentity> {
    // Get configuration from environment
    this.instanceCode = process.env.INSTANCE_CODE || '';
    this.spokeToken = process.env.SPOKE_TOKEN || '';
    this.hubUrl = process.env.HUB_URL || 'https://dive-hub-backend:4000';

    if (!this.instanceCode) {
      throw new Error(
        'INSTANCE_CODE environment variable is required. ' +
        'This identifies the spoke instance (e.g., "TST", "NZL").'
      );
    }

    if (!this.spokeToken) {
      throw new Error(
        'SPOKE_TOKEN environment variable is required. ' +
        'Register the spoke first using: ./dive spoke deploy <CODE>'
      );
    }

    logger.info('Initializing spoke identity', {
      instanceCode: this.instanceCode,
      hasToken: !!this.spokeToken,
      hubUrl: this.hubUrl,
    });

    // Try to load cached identity first (for quick startup)
    const cached = await this.loadCachedIdentity();
    if (cached) {
      this.identity = cached;
      logger.info('Loaded cached spoke identity', {
        spokeId: cached.spokeId,
        instanceCode: cached.instanceCode,
        cachedAt: cached.cachedAt,
      });
    }

    // Initialize heartbeat service to get Hub-verified identity
    try {
      // Start heartbeat service if not already running
      if (!spokeHeartbeat.isRunning()) {
        // Listen for identity verification from heartbeat
        spokeHeartbeat.on('identityVerified', async (verified: { spokeId: string; instanceCode: string }) => {
          await this.handleIdentityVerified(verified);
        });

        // Heartbeat is started by server.ts, not here
        // But we can check if Hub has already verified identity
      }

      // Check if heartbeat already verified identity
      if (spokeHeartbeat.isIdentityVerified()) {
        const hubSpokeId = spokeHeartbeat.getHubAssignedSpokeId();
        const hubInstanceCode = spokeHeartbeat.getHubAssignedInstanceCode();
        
        if (hubSpokeId) {
          this.identity = {
            spokeId: hubSpokeId,
            instanceCode: hubInstanceCode || this.instanceCode,
            token: this.spokeToken,
            status: 'approved', // If heartbeat succeeded, spoke is approved
            verifiedByHub: true,
          };

          await this.cacheIdentity(this.identity);
        }
      }

      // If we have any identity (cached or Hub-verified), we can proceed
      if (this.identity) {
        this.initialized = true;
        return this.identity;
      }

      // No cached identity - wait for first heartbeat to verify
      // This is handled by server.ts starting heartbeat
      logger.info('No cached identity, waiting for Hub verification via heartbeat');
      
      // Return a temporary identity with SPOKE_TOKEN
      // The actual spokeId will be updated when heartbeat succeeds
      this.identity = {
        spokeId: `pending-${this.instanceCode.toLowerCase()}`,
        instanceCode: this.instanceCode,
        token: this.spokeToken,
        status: 'pending',
        verifiedByHub: false,
      };
      this.initialized = true;
      
      return this.identity;
    } catch (error) {
      logger.error('Failed to initialize spoke identity', {
        error: (error as Error).message,
        instanceCode: this.instanceCode,
      });
      throw error;
    }
  }

  /**
   * Handle identity verification from heartbeat service
   * Called when Hub validates SPOKE_TOKEN and returns spokeId
   */
  private async handleIdentityVerified(verified: { spokeId: string; instanceCode: string }): Promise<void> {
    logger.info('Identity verified by Hub via heartbeat', {
      spokeId: verified.spokeId,
      instanceCode: verified.instanceCode,
      previousSpokeId: this.identity?.spokeId,
    });

    this.identity = {
      spokeId: verified.spokeId,
      instanceCode: verified.instanceCode,
      token: this.spokeToken,
      status: 'approved',
      verifiedByHub: true,
    };

    await this.cacheIdentity(this.identity);
  }

  /**
   * Cache identity in local MongoDB for offline resilience
   */
  private async cacheIdentity(identity: ISpokeIdentity): Promise<void> {
    try {
      await spokeIdentityCacheStore.updateFromHub(identity.instanceCode, {
        spokeId: identity.spokeId,
        token: identity.token,
        status: identity.status,
        hubUrl: this.hubUrl,
      });

      logger.debug('Spoke identity cached locally', {
        instanceCode: identity.instanceCode,
        spokeId: identity.spokeId,
      });
    } catch (error) {
      // Cache failure is not fatal - log and continue
      logger.warn('Failed to cache spoke identity', {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Load cached identity from local MongoDB
   */
  private async loadCachedIdentity(): Promise<ISpokeIdentity | null> {
    try {
      const cached = await spokeIdentityCacheStore.getForInstance(this.instanceCode);

      if (cached && spokeIdentityCacheStore.isValid(cached)) {
        return {
          spokeId: cached.spokeId,
          instanceCode: cached.instanceCode,
          token: cached.spokeToken || this.spokeToken,
          status: cached.status,
          verifiedByHub: true, // Cached means it was previously verified
          cachedAt: cached.cachedAt,
        };
      }

      return null;
    } catch (error) {
      logger.warn('Failed to load cached identity', {
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Wait for Hub verification (for services that need confirmed spokeId)
   */
  async waitForHubVerification(timeoutMs = 30000): Promise<ISpokeIdentity> {
    if (this.identity?.verifiedByHub) {
      return this.identity;
    }

    logger.info('Waiting for Hub to verify identity via heartbeat', {
      timeoutMs,
      instanceCode: this.instanceCode,
    });

    try {
      const verified = await spokeHeartbeat.waitForIdentityVerification(timeoutMs);
      
      this.identity = {
        spokeId: verified.spokeId,
        instanceCode: verified.instanceCode,
        token: this.spokeToken,
        status: 'approved',
        verifiedByHub: true,
      };

      await this.cacheIdentity(this.identity);
      return this.identity;
    } catch (error) {
      // If timeout, fall back to cached if available
      if (this.identity) {
        logger.warn('Hub verification timed out, using current identity', {
          spokeId: this.identity.spokeId,
          verifiedByHub: this.identity.verifiedByHub,
        });
        return this.identity;
      }
      throw error;
    }
  }

  /**
   * Get current spoke identity
   */
  getIdentity(): ISpokeIdentity {
    if (!this.identity) {
      throw new Error(
        'Spoke identity not initialized. Call initialize() first.'
      );
    }
    return { ...this.identity };
  }

  /**
   * Get spokeId (may be pending if not yet verified by Hub)
   */
  getSpokeId(): string {
    // Prefer Hub-verified spokeId from heartbeat
    const hubVerified = spokeHeartbeat.getHubAssignedSpokeId();
    if (hubVerified) {
      return hubVerified;
    }
    return this.getIdentity().spokeId;
  }

  /**
   * Get token
   */
  getToken(): string {
    return this.spokeToken || this.getIdentity().token;
  }

  /**
   * Get instance code
   */
  getInstanceCode(): string {
    return this.instanceCode;
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if identity has been verified by Hub
   */
  isVerifiedByHub(): boolean {
    return this.identity?.verifiedByHub || spokeHeartbeat.isIdentityVerified();
  }

  /**
   * Check if spoke is approved
   */
  isApproved(): boolean {
    return this.identity?.status === 'approved';
  }

  /**
   * Clear cached identity (used during reset)
   */
  async clearCache(): Promise<void> {
    if (this.instanceCode) {
      await spokeIdentityCacheStore.clearForInstance(this.instanceCode);
      logger.info('Cleared cached spoke identity', {
        instanceCode: this.instanceCode,
      });
    }
    this.identity = null;
    this.initialized = false;
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const spokeIdentityService = new SpokeIdentityService();

export default SpokeIdentityService;
