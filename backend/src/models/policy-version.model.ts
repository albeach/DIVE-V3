/**
 * DIVE V3 - Policy Version MongoDB Model
 *
 * Persists policy versions and sync status to MongoDB for durability.
 * Collections:
 *   - policy_versions: Tracks all policy version releases
 *   - policy_sync_status: Tracks spoke sync progress
 *
 * @version 1.0.0
 * @date 2025-12-05
 */

import { Collection, Db, MongoClient, ObjectId } from 'mongodb';
import { logger } from '../utils/logger';
import { IPolicyVersion, ISpokeSync } from '../services/policy-sync.service';

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGODB_DATABASE || 'dive-v3';
const COLLECTION_VERSIONS = 'policy_versions';
const COLLECTION_SYNC_STATUS = 'policy_sync_status';

// ============================================
// TYPES
// ============================================

/**
 * Policy version document stored in MongoDB
 */
export interface IPolicyVersionDocument extends IPolicyVersion {
  _id?: ObjectId;
  createdAt: Date;
  releasedBy?: string;
  description?: string;
  bundleHash?: string;
  bundleSize?: number;
  bundleSigned: boolean;
}

/**
 * Spoke sync status document stored in MongoDB
 */
export interface ISpokeSyncDocument extends ISpokeSync {
  _id?: ObjectId;
  createdAt: Date;
  updatedAt: Date;
  syncHistory: ISyncHistoryEntry[];
}

/**
 * Sync history entry
 */
export interface ISyncHistoryEntry {
  timestamp: Date;
  version: string;
  status: string;
  deltaSize?: number;
  latencyMs?: number;
}

// ============================================
// POLICY VERSION STORE
// ============================================

export class PolicyVersionStore {
  private db: Db | null = null;
  private versionsCollection: Collection<IPolicyVersionDocument> | null = null;
  private syncCollection: Collection<ISpokeSyncDocument> | null = null;
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

      this.versionsCollection = this.db.collection<IPolicyVersionDocument>(COLLECTION_VERSIONS);
      this.syncCollection = this.db.collection<ISpokeSyncDocument>(COLLECTION_SYNC_STATUS);

      // Create indexes for versions collection
      await this.versionsCollection.createIndex({ version: 1 }, { unique: true });
      await this.versionsCollection.createIndex({ timestamp: -1 });
      await this.versionsCollection.createIndex({ hash: 1 });
      // TTL index - keep versions for 1 year (also serves as createdAt index)
      await this.versionsCollection.createIndex(
        { createdAt: 1 },
        { expireAfterSeconds: 365 * 24 * 60 * 60 }
      );

      // Create indexes for sync status collection
      await this.syncCollection.createIndex({ spokeId: 1 }, { unique: true });
      await this.syncCollection.createIndex({ instanceCode: 1 });
      await this.syncCollection.createIndex({ status: 1 });
      await this.syncCollection.createIndex({ lastSyncTime: -1 });
      await this.syncCollection.createIndex({ currentVersion: 1 });

      this.initialized = true;
      logger.info('Policy Version Store initialized', {
        database: DB_NAME,
        versionsCollection: COLLECTION_VERSIONS,
        syncCollection: COLLECTION_SYNC_STATUS,
      });
    } catch (error) {
      logger.error('Failed to initialize Policy Version Store', {
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

  // ============================================
  // POLICY VERSION OPERATIONS
  // ============================================

  /**
   * Save a new policy version
   */
  async saveVersion(version: IPolicyVersion, metadata?: {
    releasedBy?: string;
    description?: string;
    bundleHash?: string;
    bundleSize?: number;
    bundleSigned?: boolean;
  }): Promise<void> {
    await this.ensureInitialized();

    const doc: IPolicyVersionDocument = {
      ...version,
      createdAt: new Date(),
      releasedBy: metadata?.releasedBy || 'system',
      description: metadata?.description,
      bundleHash: metadata?.bundleHash,
      bundleSize: metadata?.bundleSize,
      bundleSigned: metadata?.bundleSigned ?? false,
    };

    await this.versionsCollection!.updateOne(
      { version: version.version },
      { $set: doc },
      { upsert: true }
    );

    logger.debug('Policy version saved', {
      version: version.version,
      hash: version.hash,
    });
  }

  /**
   * Get the latest policy version
   */
  async getLatestVersion(): Promise<IPolicyVersionDocument | null> {
    await this.ensureInitialized();
    return this.versionsCollection!.findOne({}, { sort: { timestamp: -1 } });
  }

  /**
   * Get a specific version by version string
   */
  async getVersion(version: string): Promise<IPolicyVersionDocument | null> {
    await this.ensureInitialized();
    return this.versionsCollection!.findOne({ version });
  }

  /**
   * Get all versions since a specific version
   */
  async getVersionsSince(fromVersion: string): Promise<IPolicyVersionDocument[]> {
    await this.ensureInitialized();
    return this.versionsCollection!
      .find({ version: { $gt: fromVersion } })
      .sort({ version: 1 })
      .toArray();
  }

  /**
   * Get version history (most recent first)
   */
  async getVersionHistory(limit = 100): Promise<IPolicyVersionDocument[]> {
    await this.ensureInitialized();
    return this.versionsCollection!.find().sort({ timestamp: -1 }).limit(limit).toArray();
  }

  /**
   * Delete old versions (keep last N)
   */
  async pruneOldVersions(keepCount = 100): Promise<number> {
    await this.ensureInitialized();

    const versions = await this.versionsCollection!
      .find()
      .sort({ timestamp: -1 })
      .skip(keepCount)
      .project({ _id: 1 })
      .toArray();

    if (versions.length === 0) return 0;

    const idsToDelete = versions.map((v) => v._id);
    const result = await this.versionsCollection!.deleteMany({
      _id: { $in: idsToDelete },
    });

    logger.info('Pruned old policy versions', {
      deletedCount: result.deletedCount,
      keepCount,
    });

    return result.deletedCount;
  }

  // ============================================
  // SYNC STATUS OPERATIONS
  // ============================================

  /**
   * Save or update spoke sync status
   */
  async saveSyncStatus(status: ISpokeSync): Promise<void> {
    await this.ensureInitialized();

    const now = new Date();
    const existing = await this.syncCollection!.findOne({ spokeId: status.spokeId });

    const doc: Partial<ISpokeSyncDocument> = {
      ...status,
      updatedAt: now,
    };

    // Add to sync history
    const historyEntry: ISyncHistoryEntry = {
      timestamp: now,
      version: status.currentVersion,
      status: status.status,
    };

    if (existing) {
      // Update existing record
      await this.syncCollection!.updateOne(
        { spokeId: status.spokeId },
        {
          $set: doc,
          $push: {
            syncHistory: {
              $each: [historyEntry],
              $slice: -100, // Keep last 100 entries
            },
          },
        }
      );
    } else {
      // Insert new record
      await this.syncCollection!.insertOne({
        ...status,
        createdAt: now,
        updatedAt: now,
        syncHistory: [historyEntry],
      } as ISpokeSyncDocument);
    }

    logger.debug('Spoke sync status saved', {
      spokeId: status.spokeId,
      version: status.currentVersion,
      status: status.status,
    });
  }

  /**
   * Get sync status for a spoke
   */
  async getSyncStatus(spokeId: string): Promise<ISpokeSyncDocument | null> {
    await this.ensureInitialized();
    return this.syncCollection!.findOne({ spokeId });
  }

  /**
   * Get all sync statuses
   */
  async getAllSyncStatus(): Promise<ISpokeSyncDocument[]> {
    await this.ensureInitialized();
    return this.syncCollection!.find().sort({ lastSyncTime: -1 }).toArray();
  }

  /**
   * Get spokes by status
   */
  async getSpokesByStatus(status: ISpokeSync['status']): Promise<ISpokeSyncDocument[]> {
    await this.ensureInitialized();
    return this.syncCollection!.find({ status }).toArray();
  }

  /**
   * Get spokes that are behind or stale
   */
  async getOutOfSyncSpokes(): Promise<ISpokeSyncDocument[]> {
    await this.ensureInitialized();
    return this.syncCollection!
      .find({
        status: { $in: ['behind', 'stale', 'critical_stale', 'offline'] },
      })
      .toArray();
  }

  /**
   * Get spokes that haven't synced recently
   */
  async getStaleSpokes(maxAgeMs: number): Promise<ISpokeSyncDocument[]> {
    await this.ensureInitialized();
    const cutoff = new Date(Date.now() - maxAgeMs);
    return this.syncCollection!
      .find({
        lastSyncTime: { $lt: cutoff },
      })
      .toArray();
  }

  /**
   * Delete sync status for a spoke
   */
  async deleteSyncStatus(spokeId: string): Promise<boolean> {
    await this.ensureInitialized();
    const result = await this.syncCollection!.deleteOne({ spokeId });
    return result.deletedCount === 1;
  }

  /**
   * Update sync status field
   */
  async updateSyncStatusField(
    spokeId: string,
    field: keyof ISpokeSync,
    value: unknown
  ): Promise<void> {
    await this.ensureInitialized();
    await this.syncCollection!.updateOne(
      { spokeId },
      {
        $set: {
          [field]: value,
          updatedAt: new Date(),
        },
      }
    );
  }

  // ============================================
  // STATISTICS
  // ============================================

  /**
   * Get version statistics
   */
  async getVersionStatistics(): Promise<{
    totalVersions: number;
    latestVersion: string;
    oldestVersion: string;
    versionsLast24h: number;
    versionsLast7d: number;
  }> {
    await this.ensureInitialized();

    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [total, latest, oldest, count24h, count7d] = await Promise.all([
      this.versionsCollection!.countDocuments(),
      this.versionsCollection!.findOne({}, { sort: { timestamp: -1 } }),
      this.versionsCollection!.findOne({}, { sort: { timestamp: 1 } }),
      this.versionsCollection!.countDocuments({ timestamp: { $gte: last24h } }),
      this.versionsCollection!.countDocuments({ timestamp: { $gte: last7d } }),
    ]);

    return {
      totalVersions: total,
      latestVersion: latest?.version || 'none',
      oldestVersion: oldest?.version || 'none',
      versionsLast24h: count24h,
      versionsLast7d: count7d,
    };
  }

  /**
   * Get sync statistics
   */
  async getSyncStatistics(): Promise<{
    totalSpokes: number;
    byStatus: Record<string, number>;
    averageSyncAge: number;
    mostRecentSync: Date | null;
    oldestSync: Date | null;
  }> {
    await this.ensureInitialized();

    const [statusAgg, syncTimes] = await Promise.all([
      this.syncCollection!
        .aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }])
        .toArray(),
      this.syncCollection!
        .aggregate([
          {
            $group: {
              _id: null,
              avgAge: { $avg: { $subtract: [new Date(), '$lastSyncTime'] } },
              mostRecent: { $max: '$lastSyncTime' },
              oldest: { $min: '$lastSyncTime' },
            },
          },
        ])
        .toArray(),
    ]);

    const byStatus: Record<string, number> = {};
    let total = 0;
    statusAgg.forEach((s) => {
      byStatus[s._id] = s.count;
      total += s.count;
    });

    const times = syncTimes[0] || {};

    return {
      totalSpokes: total,
      byStatus,
      averageSyncAge: times.avgAge || 0,
      mostRecentSync: times.mostRecent || null,
      oldestSync: times.oldest || null,
    };
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const policyVersionStore = new PolicyVersionStore();

export default PolicyVersionStore;

