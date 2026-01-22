/**
 * DIVE V3 - Spoke Identity Service
 *
 * SINGLE SOURCE OF TRUTH ARCHITECTURE:
 * - Hub MongoDB is the authoritative source for spokeId
 * - Spoke queries Hub at startup to get its identity
 * - Local MongoDB cache used only when Hub is unavailable
 *
 * NO MORE:
 * - Local spokeId generation
 * - SPOKE_ID environment variable
 * - config.json spokeId field
 * - docker-compose.yml SPOKE_ID fallback
 *
 * @version 1.0.0
 * @date 2026-01-22
 */

import axios, { AxiosError } from 'axios';
import https from 'https';
import { logger } from '../utils/logger';
import { spokeIdentityCacheStore, ISpokeIdentityCache } from '../models/spoke-identity-cache.model';

// ============================================
// TYPES
// ============================================

export interface ISpokeIdentity {
  spokeId: string;
  instanceCode: string;
  token: string;
  status: 'pending' | 'approved' | 'suspended' | 'revoked';
  allowedScopes?: string[];
}

export interface IHubSpokeResponse {
  spokeId: string;
  instanceCode: string;
  status: string;
  token?: {
    token: string;
    expiresAt?: string;
  };
  allowedScopes?: string[];
}

// ============================================
// SPOKE IDENTITY SERVICE
// ============================================

class SpokeIdentityService {
  private identity: ISpokeIdentity | null = null;
  private initialized = false;
  private hubUrl: string = '';
  private instanceCode: string = '';

  // HTTPS agent for self-signed certs in development
  private httpsAgent = new https.Agent({
    rejectUnauthorized: false,
  });

  /**
   * Initialize spoke identity by querying Hub
   * This is the ONLY way to get a valid spokeId
   */
  async initialize(): Promise<ISpokeIdentity> {
    // Get instance code from environment (static, never changes)
    this.instanceCode = process.env.INSTANCE_CODE || '';
    this.hubUrl = process.env.HUB_URL || 'https://dive-hub-backend:4000';

    if (!this.instanceCode) {
      throw new Error(
        'INSTANCE_CODE environment variable is required. ' +
        'This identifies the spoke instance (e.g., "TST", "NZL").'
      );
    }

    logger.info('Initializing spoke identity', {
      instanceCode: this.instanceCode,
      hubUrl: this.hubUrl,
    });

    // Try to get identity from Hub (authoritative)
    try {
      this.identity = await this.fetchIdentityFromHub();
      this.initialized = true;

      logger.info('Spoke identity obtained from Hub', {
        spokeId: this.identity.spokeId,
        instanceCode: this.identity.instanceCode,
        status: this.identity.status,
      });

      // Cache for offline resilience
      await this.cacheIdentity(this.identity);

      return this.identity;
    } catch (hubError) {
      logger.warn('Hub unavailable, checking local cache', {
        error: (hubError as Error).message,
        hubUrl: this.hubUrl,
      });

      // Fall back to cached identity
      const cached = await this.loadCachedIdentity();
      if (cached) {
        this.identity = cached;
        this.initialized = true;

        logger.info('Using cached spoke identity (offline mode)', {
          spokeId: this.identity.spokeId,
          instanceCode: this.identity.instanceCode,
          cachedAt: cached.cachedAt,
        });

        return this.identity;
      }

      // No Hub and no cache - cannot start
      throw new Error(
        `Cannot initialize spoke identity: Hub unavailable at ${this.hubUrl} ` +
        `and no cached identity found for ${this.instanceCode}. ` +
        'Ensure Hub is running and spoke is registered.'
      );
    }
  }

  /**
   * Fetch spoke identity from Hub MongoDB (authoritative source)
   */
  private async fetchIdentityFromHub(): Promise<ISpokeIdentity> {
    // First try to get existing registration
    try {
      const response = await axios.get<{ spokes: IHubSpokeResponse[] }>(
        `${this.hubUrl}/api/federation/spokes`,
        {
          params: { instanceCode: this.instanceCode },
          httpsAgent: this.httpsAgent,
          timeout: 10000,
        }
      );

      const spoke = response.data.spokes?.find(
        s => s.instanceCode.toUpperCase() === this.instanceCode.toUpperCase()
      );

      if (spoke && spoke.spokeId) {
        return {
          spokeId: spoke.spokeId,
          instanceCode: spoke.instanceCode,
          token: spoke.token?.token || process.env.SPOKE_TOKEN || '',
          status: spoke.status as ISpokeIdentity['status'],
          allowedScopes: spoke.allowedScopes,
        };
      }

      // Spoke not registered - this is an error
      throw new Error(
        `Spoke ${this.instanceCode} not found in Hub. ` +
        'Register the spoke first using: ./dive spoke register <CODE>'
      );
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        if (axiosError.code === 'ECONNREFUSED' || axiosError.code === 'ETIMEDOUT') {
          throw new Error(`Hub unavailable at ${this.hubUrl}`);
        }
        if (axiosError.response?.status === 404) {
          throw new Error(`Spoke ${this.instanceCode} not registered with Hub`);
        }
      }
      throw error;
    }
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
        allowedScopes: identity.allowedScopes,
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
          token: cached.spokeToken,
          status: cached.status,
          allowedScopes: cached.allowedScopes,
          cachedAt: cached.cachedAt,
        } as ISpokeIdentity & { cachedAt: Date };
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
   * Refresh identity from Hub (called periodically or on demand)
   */
  async refresh(): Promise<ISpokeIdentity> {
    if (!this.initialized) {
      return this.initialize();
    }

    try {
      this.identity = await this.fetchIdentityFromHub();
      await this.cacheIdentity(this.identity);

      logger.debug('Spoke identity refreshed from Hub', {
        spokeId: this.identity.spokeId,
      });

      return this.identity;
    } catch (error) {
      // Keep existing identity on refresh failure
      logger.warn('Failed to refresh identity from Hub', {
        error: (error as Error).message,
        keepingCurrent: this.identity?.spokeId,
      });

      if (!this.identity) {
        throw error;
      }

      return this.identity;
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
   * Get spokeId
   */
  getSpokeId(): string {
    return this.getIdentity().spokeId;
  }

  /**
   * Get token
   */
  getToken(): string {
    return this.getIdentity().token;
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
