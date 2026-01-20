/**
 * DIVE V3 - Federation Spoke MongoDB Model
 * 
 * Persists spoke registrations to MongoDB for durability across restarts.
 * Collection: federation_spokes
 * 
 * @version 1.0.0
 * @date 2025-12-05
 */

import { Collection, Db, MongoClient } from 'mongodb';
import { logger } from '../utils/logger';
import {
  ISpokeRegistration,
  ISpokeToken
  // ICertificateValidation - reserved for future certificate validation
} from '../services/hub-spoke-registry.service';

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGODB_DATABASE || 'dive-v3';
const COLLECTION_SPOKES = 'federation_spokes';
const COLLECTION_TOKENS = 'federation_tokens';

/**
 * MongoDB-backed store for spoke registrations
 */
export class MongoSpokeStore {
  private db: Db | null = null;
  private spokesCollection: Collection<ISpokeRegistration> | null = null;
  private tokensCollection: Collection<ISpokeToken> | null = null;
  private initialized = false;

  /**
   * Initialize MongoDB connection and create indexes
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const client = new MongoClient(MONGODB_URL);
      await client.connect();
      this.db = client.db(DB_NAME);

      this.spokesCollection = this.db.collection<ISpokeRegistration>(COLLECTION_SPOKES);
      this.tokensCollection = this.db.collection<ISpokeToken>(COLLECTION_TOKENS);

      // Create indexes for spokes
      await this.spokesCollection.createIndex({ spokeId: 1 }, { unique: true });
      await this.spokesCollection.createIndex({ instanceCode: 1 }, { unique: true, sparse: true });
      await this.spokesCollection.createIndex({ status: 1 });
      await this.spokesCollection.createIndex({ trustLevel: 1 });
      await this.spokesCollection.createIndex({ 'certificateFingerprint': 1 }, { sparse: true });
      await this.spokesCollection.createIndex({ lastHeartbeat: 1 }, { sparse: true });
      await this.spokesCollection.createIndex({ registeredAt: 1 });

      // Create indexes for tokens
      await this.tokensCollection.createIndex({ token: 1 }, { unique: true });
      await this.tokensCollection.createIndex({ spokeId: 1 });
      await this.tokensCollection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

      this.initialized = true;
      logger.info('MongoDB Spoke Store initialized', {
        database: DB_NAME,
        spokesCollection: COLLECTION_SPOKES,
        tokensCollection: COLLECTION_TOKENS
      });
    } catch (error) {
      logger.error('Failed to initialize MongoDB Spoke Store', {
        error: error instanceof Error ? error.message : 'Unknown error'
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

  // ============================================
  // SPOKE OPERATIONS
  // ============================================

  /**
   * Save or update a spoke registration
   */
  async save(spoke: ISpokeRegistration): Promise<void> {
    await this.ensureInitialized();

    await this.spokesCollection!.updateOne(
      { spokeId: spoke.spokeId },
      { $set: spoke },
      { upsert: true }
    );

    logger.debug('Spoke saved to MongoDB', {
      spokeId: spoke.spokeId,
      instanceCode: spoke.instanceCode
    });
  }

  /**
   * Find spoke by ID
   */
  async findById(spokeId: string): Promise<ISpokeRegistration | null> {
    await this.ensureInitialized();
    return this.spokesCollection!.findOne({ spokeId });
  }

  /**
   * Find spoke by instance code
   */
  async findByInstanceCode(code: string): Promise<ISpokeRegistration | null> {
    await this.ensureInitialized();
    return this.spokesCollection!.findOne({
      instanceCode: code.toUpperCase()
    });
  }

  /**
   * Find spoke by certificate fingerprint
   */
  async findByFingerprint(fingerprint: string): Promise<ISpokeRegistration | null> {
    await this.ensureInitialized();
    return this.spokesCollection!.findOne({
      certificateFingerprint: fingerprint.toUpperCase()
    });
  }

  /**
   * Get all spokes
   */
  async findAll(): Promise<ISpokeRegistration[]> {
    await this.ensureInitialized();
    return this.spokesCollection!.find().sort({ registeredAt: -1 }).toArray();
  }

  /**
   * Find spokes by status
   */
  async findByStatus(status: ISpokeRegistration['status']): Promise<ISpokeRegistration[]> {
    await this.ensureInitialized();
    return this.spokesCollection!.find({ status }).sort({ registeredAt: -1 }).toArray();
  }

  /**
   * Find spokes by trust level
   */
  async findByTrustLevel(trustLevel: ISpokeRegistration['trustLevel']): Promise<ISpokeRegistration[]> {
    await this.ensureInitialized();
    return this.spokesCollection!.find({ trustLevel }).sort({ registeredAt: -1 }).toArray();
  }

  /**
   * Delete a spoke
   */
  async delete(spokeId: string): Promise<boolean> {
    await this.ensureInitialized();
    const result = await this.spokesCollection!.deleteOne({ spokeId });
    return result.deletedCount === 1;
  }

  /**
   * Update spoke heartbeat timestamp
   */
  async updateHeartbeat(spokeId: string): Promise<void> {
    await this.ensureInitialized();
    await this.spokesCollection!.updateOne(
      { spokeId },
      { $set: { lastHeartbeat: new Date() } }
    );
  }

  /**
   * Get unhealthy spokes (missed heartbeats)
   */
  async findUnhealthySpokes(maxHeartbeatAge: number): Promise<ISpokeRegistration[]> {
    await this.ensureInitialized();
    const cutoff = new Date(Date.now() - maxHeartbeatAge);

    return this.spokesCollection!.find({
      status: 'approved',
      $or: [
        { lastHeartbeat: { $lt: cutoff } },
        { lastHeartbeat: { $exists: false } }
      ]
    }).toArray();
  }

  /**
   * Get statistics
   */
  async getStatistics(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byTrustLevel: Record<string, number>;
  }> {
    await this.ensureInitialized();

    const [statusAgg, trustAgg] = await Promise.all([
      this.spokesCollection!.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]).toArray(),
      this.spokesCollection!.aggregate([
        { $group: { _id: '$trustLevel', count: { $sum: 1 } } }
      ]).toArray()
    ]);

    const byStatus: Record<string, number> = {};
    statusAgg.forEach(s => { byStatus[s._id] = s.count; });

    const byTrustLevel: Record<string, number> = {};
    trustAgg.forEach(t => { byTrustLevel[t._id] = t.count; });

    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);

    return { total, byStatus, byTrustLevel };
  }

  // ============================================
  // TOKEN OPERATIONS
  // ============================================

  /**
   * Save a spoke token
   */
  async saveToken(token: ISpokeToken): Promise<void> {
    await this.ensureInitialized();

    await this.tokensCollection!.updateOne(
      { token: token.token },
      { $set: token },
      { upsert: true }
    );
  }

  /**
   * Find a token
   */
  async findToken(tokenString: string): Promise<ISpokeToken | null> {
    await this.ensureInitialized();
    
    logger.debug('Finding token in MongoDB', {
      tokenPrefix: tokenString.substring(0, 20),
      collection: this.tokensCollection?.collectionName,
      database: this.tokensCollection?.dbName
    });
    
    const result = await this.tokensCollection!.findOne({
      token: tokenString,
      expiresAt: { $gt: new Date() }
    });
    
    logger.debug('Token findOne result', {
      found: !!result,
      spokeId: result?.spokeId
    });
    
    return result;
  }

  /**
   * Find all tokens for a spoke (including expired)
   */
  async findAllTokensBySpokeId(spokeId: string): Promise<ISpokeToken[]> {
    await this.ensureInitialized();
    return this.tokensCollection!.find({ spokeId }).toArray();
  }

  /**
   * Revoke all tokens for a spoke
   */
  async revokeTokensForSpoke(spokeId: string): Promise<number> {
    await this.ensureInitialized();
    const result = await this.tokensCollection!.deleteMany({ spokeId });
    return result.deletedCount;
  }

  /**
   * Clean up expired tokens (called by TTL index automatically, but can force)
   */
  async cleanupExpiredTokens(): Promise<number> {
    await this.ensureInitialized();
    const result = await this.tokensCollection!.deleteMany({
      expiresAt: { $lt: new Date() }
    });
    return result.deletedCount;
  }
}

// Export singleton instance
export const mongoSpokeStore = new MongoSpokeStore();

export default MongoSpokeStore;
