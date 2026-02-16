/**
 * DIVE V3 - OPAL Metrics Service
 *
 * Provides real metrics for OPAL operations by:
 * - Tracking publish transactions in MongoDB
 * - Querying Redis for connected clients
 * - Monitoring OPAL server health
 * - Recording data update operations
 *
 * @version 1.0.0
 * @date 2026-01-29
 */

import { logger } from '../utils/logger';
import Redis from 'ioredis';
import { MongoClient, Db, Collection } from 'mongodb';

// ============================================
// TYPES
// ============================================

export interface IOPALTransaction {
  transactionId: string;
  type: 'publish' | 'data_update' | 'policy_refresh' | 'bundle_publish';
  status: 'success' | 'failed' | 'pending';
  timestamp: string;
  duration?: number;
  initiatedBy: 'system' | 'admin' | 'cdc' | 'api';
  details: {
    topics?: string[];
    dataPath?: string;
    bundleVersion?: string;
    bundleHash?: string;
    affectedClients?: number;
    error?: string;
  };
}

export interface IOPALClientMetrics {
  clientId: string;
  spokeId?: string;
  instanceCode?: string;
  hostname?: string;
  ipAddress?: string;
  status: 'connected' | 'disconnected';
  connectedAt: string;
  lastSeen: string;
  subscriptions: string[];
  stats: {
    messagesReceived: number;
    lastMessageAt?: string;
  };
}

export interface IOPALServerMetrics {
  healthy: boolean;
  version: string;
  uptime: number;
  startedAt: string;
  redis: {
    connected: boolean;
    clients: number;
    channels: string[];
  };
  stats: {
    totalPublishes: number;
    totalDataUpdates: number;
    failedOperations: number;
    last24Hours: {
      publishes: number;
      dataUpdates: number;
    };
  };
}

// ============================================
// OPAL METRICS SERVICE
// ============================================

class OPALMetricsService {
  private redis: Redis | null = null;
  private mongoClient: MongoClient | null = null;
  private db: Db | null = null;
  private transactionsCollection: Collection<IOPALTransaction> | null = null;
  private initialized = false;
  private serverStartTime = Date.now();

  /**
   * Initialize connections to Redis and MongoDB
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Connect to Redis using REDIS_URL (supports TLS via rediss:// protocol)
      const redisUrl = process.env.REDIS_URL;

      const redisOpts: Record<string, unknown> = {
        retryStrategy: (times: number) => {
          if (times > 3) return null;
          return Math.min(times * 1000, 3000);
        },
        tls: redisUrl?.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
      };

      this.redis = redisUrl
        ? new Redis(redisUrl, redisOpts)
        : new Redis({
            host: process.env.REDIS_HOST || 'redis',
            port: parseInt(process.env.REDIS_PORT || '6379', 10),
            password: process.env.REDIS_PASSWORD || '',
            ...redisOpts,
          });

      this.redis.on('error', (err) => {
        logger.error('OPAL Metrics Redis error', { error: err.message });
      });

      // Connect to MongoDB for transaction storage
      const mongoUrl = process.env.MONGODB_URL || 'mongodb://localhost:27017';
      const mongoDbName = process.env.MONGODB_DATABASE || 'dive-v3';
      this.mongoClient = new MongoClient(mongoUrl);
      await this.mongoClient.connect();
      this.db = this.mongoClient.db(mongoDbName);
      this.transactionsCollection = this.db.collection<IOPALTransaction>('opal_transactions');

      // Create indexes
      await this.transactionsCollection.createIndex({ timestamp: -1 });
      await this.transactionsCollection.createIndex({ type: 1, timestamp: -1 });
      await this.transactionsCollection.createIndex({ status: 1, timestamp: -1 });

      this.initialized = true;
      logger.info('OPAL Metrics Service initialized', {
        redis: redisUrl ? redisUrl.replace(/\/\/:[^@]*@/, '//***@') : `${process.env.REDIS_HOST || 'redis'}:${process.env.REDIS_PORT || '6379'}`,
        mongo: mongoDbName,
      });
    } catch (error) {
      logger.error('Failed to initialize OPAL Metrics Service', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Record a transaction
   */
  async recordTransaction(
    type: IOPALTransaction['type'],
    status: IOPALTransaction['status'],
    initiatedBy: IOPALTransaction['initiatedBy'],
    details: IOPALTransaction['details'],
    duration?: number
  ): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }

    const transaction: IOPALTransaction = {
      transactionId: `txn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      status,
      timestamp: new Date().toISOString(),
      duration,
      initiatedBy,
      details,
    };

    try {
      await this.transactionsCollection!.insertOne(transaction as any);
      logger.debug('OPAL transaction recorded', {
        transactionId: transaction.transactionId,
        type,
        status,
      });
      return transaction.transactionId;
    } catch (error) {
      logger.error('Failed to record OPAL transaction', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get transactions with filtering and pagination
   */
  async getTransactions(options: {
    limit?: number;
    offset?: number;
    type?: IOPALTransaction['type'];
    status?: IOPALTransaction['status'];
    since?: Date;
  } = {}): Promise<{ transactions: IOPALTransaction[]; total: number }> {
    if (!this.initialized) {
      await this.initialize();
    }

    const { limit = 50, offset = 0, type, status, since } = options;

    const filter: Record<string, unknown> = {};
    if (type) filter.type = type;
    if (status) filter.status = status;
    if (since) filter.timestamp = { $gte: since.toISOString() };

    try {
      const total = await this.transactionsCollection!.countDocuments(filter);
      const transactions = await this.transactionsCollection!
        .find(filter)
        .sort({ timestamp: -1 })
        .skip(offset)
        .limit(limit)
        .toArray();

      return {
        transactions: transactions as unknown as IOPALTransaction[],
        total,
      };
    } catch (error) {
      logger.error('Failed to get OPAL transactions', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get connected Redis clients (proxy for OPAL clients)
   */
  async getConnectedClients(): Promise<IOPALClientMetrics[]> {
    if (!this.initialized || !this.redis) {
      await this.initialize();
    }

    try {
      // Get Redis client list
      const clientList = await this.redis!.client('LIST') as string;
      const lines = clientList.split('\n').filter((line: string) => line.trim());

      const clients: IOPALClientMetrics[] = [];
      const now = new Date().toISOString();

      for (const line of lines) {
        const parts: Record<string, string> = {};
        line.split(' ').forEach((part) => {
          const [key, value] = part.split('=');
          if (key && value) parts[key] = value;
        });

        // Only include clients with pub/sub subscriptions (likely OPAL clients)
        if (parts.name && parts.name.includes('opal')) {
          clients.push({
            clientId: parts.id || 'unknown',
            hostname: parts.addr?.split(':')[0] || 'unknown',
            ipAddress: parts.addr || 'unknown',
            status: 'connected',
            connectedAt: now,
            lastSeen: now,
            subscriptions: [], // Would need to query PUBSUB CHANNELS
            stats: {
              messagesReceived: 0,
            },
          });
        }
      }

      return clients;
    } catch (error) {
      logger.error('Failed to get connected clients', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Get Redis pub/sub channels (OPAL topics)
   */
  async getPubSubChannels(): Promise<string[]> {
    if (!this.initialized || !this.redis) {
      await this.initialize();
    }

    try {
      const channels = await this.redis!.pubsub('CHANNELS') as string[];
      return channels;
    } catch (error) {
      logger.error('Failed to get pub/sub channels', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Get server metrics
   */
  async getServerMetrics(): Promise<IOPALServerMetrics> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Get Redis info
      const redisInfo = await this.redis!.info('clients');
      const clientCount = parseInt(
        redisInfo.match(/connected_clients:(\d+)/)?.[1] || '0',
        10
      );

      // Get pub/sub channels
      const channels = await this.getPubSubChannels();

      // Get transaction stats
      const now = new Date();
      const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const [totalPublishes, totalDataUpdates, failedOps, recentPublishes, recentDataUpdates] =
        await Promise.all([
          this.transactionsCollection!.countDocuments({ type: 'publish' }),
          this.transactionsCollection!.countDocuments({ type: 'data_update' }),
          this.transactionsCollection!.countDocuments({ status: 'failed' }),
          this.transactionsCollection!.countDocuments({
            type: 'publish',
            timestamp: { $gte: last24Hours.toISOString() },
          }),
          this.transactionsCollection!.countDocuments({
            type: 'data_update',
            timestamp: { $gte: last24Hours.toISOString() },
          }),
        ]);

      const uptime = Math.floor((Date.now() - this.serverStartTime) / 1000);

      return {
        healthy: this.redis?.status === 'ready',
        version: process.env.OPAL_SERVER_VERSION || '0.9.2',
        uptime,
        startedAt: new Date(this.serverStartTime).toISOString(),
        redis: {
          connected: this.redis?.status === 'ready',
          clients: clientCount,
          channels,
        },
        stats: {
          totalPublishes,
          totalDataUpdates,
          failedOperations: failedOps,
          last24Hours: {
            publishes: recentPublishes,
            dataUpdates: recentDataUpdates,
          },
        },
      };
    } catch (error) {
      logger.error('Failed to get server metrics', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return {
        healthy: false,
        version: 'unknown',
        uptime: 0,
        startedAt: new Date().toISOString(),
        redis: {
          connected: false,
          clients: 0,
          channels: [],
        },
        stats: {
          totalPublishes: 0,
          totalDataUpdates: 0,
          failedOperations: 0,
          last24Hours: {
            publishes: 0,
            dataUpdates: 0,
          },
        },
      };
    }
  }

  /**
   * Clean up old transactions (keep last 90 days)
   */
  async cleanupOldTransactions(): Promise<number> {
    if (!this.initialized) {
      await this.initialize();
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);

    try {
      const result = await this.transactionsCollection!.deleteMany({
        timestamp: { $lt: cutoffDate.toISOString() },
      });

      logger.info('Cleaned up old OPAL transactions', {
        deleted: result.deletedCount,
        cutoffDate: cutoffDate.toISOString(),
      });

      return result.deletedCount || 0;
    } catch (error) {
      logger.error('Failed to cleanup old transactions', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return 0;
    }
  }

  /**
   * Cleanup connections
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
    if (this.mongoClient) {
      await this.mongoClient.close();
      this.mongoClient = null;
    }
    this.initialized = false;
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const opalMetricsService = new OPALMetricsService();
