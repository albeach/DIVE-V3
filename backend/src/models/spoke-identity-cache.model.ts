/**
 * DIVE V3 - Spoke Identity Cache Model
 *
 * Caches the Hub-assigned spokeId in local MongoDB for offline resilience.
 * Hub MongoDB is the SINGLE SOURCE OF TRUTH - this is only a cache.
 *
 * Architecture:
 * - Hub MongoDB: Authoritative source for spokeId, token, federation status
 * - Spoke MongoDB: Cache only - used when Hub is unavailable
 * - Backend: Queries Hub at startup, falls back to cache if offline
 *
 * @version 1.0.0
 * @date 2026-01-22
 */

import { Collection, Db, MongoClient } from 'mongodb';
import { logger } from '../utils/logger';

// ============================================
// INTERFACE
// ============================================

export interface ISpokeIdentityCache {
  instanceCode: string;           // The spoke's instance code (e.g., "TST")
  spokeId: string;                // Hub-assigned spokeId
  spokeToken: string;             // Federation token from Hub
  tokenExpiresAt?: Date;          // Token expiration
  status: 'pending' | 'approved' | 'suspended' | 'revoked';
  hubUrl: string;                 // Hub URL this identity was obtained from
  cachedAt: Date;                 // When this was cached
  lastVerifiedAt?: Date;          // Last successful verification with Hub
  allowedScopes?: string[];       // Scopes allowed by Hub
}

// ============================================
// CONSTANTS
// ============================================

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGODB_DATABASE || 'dive-v3';
const COLLECTION_NAME = 'spoke_identity_cache';

// ============================================
// SPOKE IDENTITY CACHE STORE
// ============================================

class SpokeIdentityCacheStore {
  private db: Db | null = null;
  private collection: Collection<ISpokeIdentityCache> | null = null;
  private initialized = false;

  /**
   * Initialize MongoDB connection and create indexes
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      logger.debug('Initializing Spoke Identity Cache Store', {
        database: DB_NAME,
        collection: COLLECTION_NAME,
      });

      const client = new MongoClient(MONGODB_URL);
      await client.connect();
      this.db = client.db(DB_NAME);
      this.collection = this.db.collection<ISpokeIdentityCache>(COLLECTION_NAME);

      // Create indexes
      await this.collection.createIndex({ instanceCode: 1 }, { unique: true });
      await this.collection.createIndex({ spokeId: 1 });
      await this.collection.createIndex({ cachedAt: 1 });

      this.initialized = true;
      logger.debug('Spoke Identity Cache Store initialized');
    } catch (error) {
      logger.error('Failed to initialize Spoke Identity Cache Store', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Ensure initialized before operations
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Get cached identity for an instance
   */
  async getForInstance(instanceCode: string): Promise<ISpokeIdentityCache | null> {
    await this.ensureInitialized();

    const cached = await this.collection!.findOne({
      instanceCode: instanceCode.toUpperCase(),
    });

    return cached;
  }

  /**
   * Update cached identity from Hub response
   */
  async updateFromHub(
    instanceCode: string,
    hubResponse: {
      spokeId: string;
      token: string;
      status: string;
      hubUrl: string;
      allowedScopes?: string[];
      tokenExpiresAt?: Date;
    }
  ): Promise<ISpokeIdentityCache> {
    await this.ensureInitialized();

    const update: ISpokeIdentityCache = {
      instanceCode: instanceCode.toUpperCase(),
      spokeId: hubResponse.spokeId,
      spokeToken: hubResponse.token,
      status: hubResponse.status as ISpokeIdentityCache['status'],
      hubUrl: hubResponse.hubUrl,
      cachedAt: new Date(),
      lastVerifiedAt: new Date(),
      allowedScopes: hubResponse.allowedScopes,
      tokenExpiresAt: hubResponse.tokenExpiresAt,
    };

    await this.collection!.updateOne(
      { instanceCode: instanceCode.toUpperCase() },
      { $set: update },
      { upsert: true }
    );

    logger.debug('Spoke identity cache updated', {
      instanceCode: instanceCode.toUpperCase(),
      spokeId: hubResponse.spokeId,
    });

    return update;
  }

  /**
   * Clear cached identity (used during nuke/reset)
   */
  async clearForInstance(instanceCode: string): Promise<void> {
    await this.ensureInitialized();

    await this.collection!.deleteOne({
      instanceCode: instanceCode.toUpperCase(),
    });

    logger.debug('Spoke identity cache cleared', {
      instanceCode: instanceCode.toUpperCase(),
    });
  }

  /**
   * Check if cached identity is valid
   */
  isValid(cached: ISpokeIdentityCache): boolean {
    // Check if token has expired
    if (cached.tokenExpiresAt && new Date() > cached.tokenExpiresAt) {
      return false;
    }

    // Check if status is approved
    if (cached.status !== 'approved') {
      return false;
    }

    return true;
  }

  /**
   * Check if cache is stale (not verified recently)
   */
  isStale(cached: ISpokeIdentityCache, maxAgeMs: number = 3600000): boolean {
    if (!cached.lastVerifiedAt) {
      return true;
    }

    const age = Date.now() - cached.lastVerifiedAt.getTime();
    return age > maxAgeMs;
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const spokeIdentityCacheStore = new SpokeIdentityCacheStore();

// Also export class for testing
export { SpokeIdentityCacheStore };
