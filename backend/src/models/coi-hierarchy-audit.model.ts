/**
 * DIVE V3 - COI Hierarchy Audit Log MongoDB Model
 *
 * Logs all COI hierarchy-based authorization decisions for audit trail.
 * Captures which parent COIs granted access, hierarchy paths, and evaluation details.
 *
 * Collection: coi_hierarchy_audit
 *
 * Features:
 * - 90-day TTL retention (auto-expire old logs)
 * - Comprehensive hierarchy decision metadata
 * - Path tracing from user COI to resource COI
 * - Conditional evaluation results
 *
 * Compliance: ACP-240 Section 6, NATO ADatP-5663
 *
 * @version 2.0.0
 * @date 2026-01-25
 */

import { Collection, Db, MongoClient } from 'mongodb';
import { logger } from '../utils/logger';
import { connectToMongoDBWithRetry, retryMongoOperation } from '../utils/mongodb-connection';

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGODB_DATABASE || 'dive-v3';
const COLLECTION_COI_HIERARCHY_AUDIT = 'coi_hierarchy_audit';

// TTL: 90 days in seconds
const TTL_SECONDS = 90 * 24 * 60 * 60;

/**
 * COI Hierarchy Audit Log Entry
 */
export interface ICoiHierarchyAuditLog {
  timestamp: Date;
  requestId: string;
  eventType: 'hierarchy_access' | 'hierarchy_denied' | 'hierarchy_config_change';

  // Authorization context
  subject: {
    uniqueID: string;
    userCois: string[]; // Direct COI tags from token
    effectiveCois: string[]; // After hierarchy expansion
  };

  resource: {
    resourceId: string;
    requiredCois: string[]; // COI tags on resource
    coiOperator?: 'ALL' | 'ANY';
  };

  // Hierarchy decision details
  hierarchyDecision: {
    granted: boolean;
    grantingParents: string[]; // Which parent COIs granted access
    hierarchyPaths: string[][]; // All paths from user COI to resource COI
    expansionApplied: boolean; // Was hierarchy expansion needed?
    multiLevelExpansion: boolean; // Was multi-level expansion used?
    conditionalEvaluations?: Array<{
      rule: string;
      ruleType: 'time_window' | 'context' | 'classification' | 'operation';
      result: boolean;
      details?: any;
    }>;
  };

  // Performance metrics
  latencyMs: number;

  // Context
  context: {
    sourceIP?: string;
    operation?: string;
    classification?: string;
  };

  // TTL for auto-expiration
  expiresAt: Date; // 90 days from timestamp
}

/**
 * Query parameters for audit logs
 */
export interface IHierarchyAuditQuery {
  requestId?: string;
  uniqueID?: string;
  resourceId?: string;
  eventType?: ICoiHierarchyAuditLog['eventType'];
  granted?: boolean;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  skip?: number;
}

/**
 * Hierarchy configuration change audit log
 */
export interface IHierarchyConfigAuditLog {
  timestamp: Date;
  requestId: string;
  eventType: 'hierarchy_config_change';
  changeType: 'create' | 'update' | 'delete' | 'recompute';

  affectedNode: {
    coiId: string;
    type: string;
    level: number;
  };

  changes?: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];

  actor: {
    uniqueID: string;
    role: string;
  };

  reason?: string;

  expiresAt: Date; // 90 days
}

/**
 * MongoDB store for COI hierarchy audit logs
 */
export class MongoCoiHierarchyAuditStore {
  private db: Db | null = null;
  private client: MongoClient | null = null;
  private collection: Collection<ICoiHierarchyAuditLog | IHierarchyConfigAuditLog> | null = null;
  private initialized = false;

  /**
   * Initialize MongoDB connection and indexes
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.client = await connectToMongoDBWithRetry(MONGODB_URL);
      this.db = this.client.db(DB_NAME);
      this.collection = this.db.collection(COLLECTION_COI_HIERARCHY_AUDIT);

      // Create indexes with retry logic
      await retryMongoOperation(async () => {
        // TTL index for auto-expiration (90 days)
        await this.collection!.createIndex(
          { expiresAt: 1 },
          { expireAfterSeconds: 0 }
        );

        // Query indexes
        await this.collection!.createIndex({ timestamp: -1 });
        await this.collection!.createIndex({ requestId: 1 });
        await this.collection!.createIndex({ eventType: 1 });
        await this.collection!.createIndex({ 'subject.uniqueID': 1 });
        await this.collection!.createIndex({ 'resource.resourceId': 1 });
        await this.collection!.createIndex({ 'hierarchyDecision.granted': 1 });
        await this.collection!.createIndex({ 'hierarchyDecision.grantingParents': 1 });

        // Compound indexes for common queries
        await this.collection!.createIndex({
          'subject.uniqueID': 1,
          timestamp: -1
        });
        await this.collection!.createIndex({
          'resource.resourceId': 1,
          timestamp: -1
        });
      });

      this.initialized = true;
      logger.info('MongoDB COI Hierarchy Audit Store initialized', {
        database: DB_NAME,
        collection: COLLECTION_COI_HIERARCHY_AUDIT,
        ttlDays: 90
      });
    } catch (error) {
      logger.error('Failed to initialize MongoDB COI Hierarchy Audit Store', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  // ============================================
  // LOG OPERATIONS
  // ============================================

  /**
   * Log a hierarchy-based authorization decision
   */
  async logDecision(log: Omit<ICoiHierarchyAuditLog, 'timestamp' | 'expiresAt'>): Promise<void> {
    await this.ensureInitialized();

    const doc: ICoiHierarchyAuditLog = {
      ...log,
      timestamp: new Date(),
      expiresAt: new Date(Date.now() + TTL_SECONDS * 1000)
    };

    await this.collection!.insertOne(doc as any);

    logger.debug('COI hierarchy decision logged', {
      requestId: log.requestId,
      uniqueID: log.subject.uniqueID,
      resourceId: log.resource.resourceId,
      granted: log.hierarchyDecision.granted,
      grantingParents: log.hierarchyDecision.grantingParents
    });
  }

  /**
   * Log a hierarchy configuration change
   */
  async logConfigChange(log: Omit<IHierarchyConfigAuditLog, 'timestamp' | 'expiresAt'>): Promise<void> {
    await this.ensureInitialized();

    const doc: IHierarchyConfigAuditLog = {
      ...log,
      timestamp: new Date(),
      expiresAt: new Date(Date.now() + TTL_SECONDS * 1000)
    };

    await this.collection!.insertOne(doc as any);

    logger.info('COI hierarchy config change logged', {
      changeType: log.changeType,
      coiId: log.affectedNode.coiId,
      actor: log.actor.uniqueID
    });
  }

  // ============================================
  // QUERY OPERATIONS
  // ============================================

  /**
   * Query audit logs
   */
  async query(query: IHierarchyAuditQuery): Promise<ICoiHierarchyAuditLog[]> {
    await this.ensureInitialized();

    const filter: any = {};

    if (query.requestId) filter.requestId = query.requestId;
    if (query.uniqueID) filter['subject.uniqueID'] = query.uniqueID;
    if (query.resourceId) filter['resource.resourceId'] = query.resourceId;
    if (query.eventType) filter.eventType = query.eventType;
    if (query.granted !== undefined) filter['hierarchyDecision.granted'] = query.granted;

    if (query.startTime || query.endTime) {
      filter.timestamp = {};
      if (query.startTime) filter.timestamp.$gte = query.startTime;
      if (query.endTime) filter.timestamp.$lte = query.endTime;
    }

    const cursor = this.collection!
      .find(filter)
      .sort({ timestamp: -1 })
      .limit(query.limit || 100)
      .skip(query.skip || 0);

    return cursor.toArray() as Promise<ICoiHierarchyAuditLog[]>;
  }

  /**
   * Get logs for a specific user
   */
  async getLogsForUser(uniqueID: string, limit: number = 100): Promise<ICoiHierarchyAuditLog[]> {
    return this.query({ uniqueID, limit });
  }

  /**
   * Get logs for a specific resource
   */
  async getLogsForResource(resourceId: string, limit: number = 100): Promise<ICoiHierarchyAuditLog[]> {
    return this.query({ resourceId, limit });
  }

  /**
   * Get denied access attempts
   */
  async getDeniedAttempts(limit: number = 100): Promise<ICoiHierarchyAuditLog[]> {
    return this.query({ granted: false, limit });
  }

  /**
   * Get logs by request ID
   */
  async getLogsByRequestId(requestId: string): Promise<ICoiHierarchyAuditLog[]> {
    return this.query({ requestId });
  }

  // ============================================
  // ANALYTICS OPERATIONS
  // ============================================

  /**
   * Get hierarchy usage statistics
   */
  async getHierarchyStats(startTime?: Date, endTime?: Date): Promise<any> {
    await this.ensureInitialized();

    const match: any = { eventType: { $in: ['hierarchy_access', 'hierarchy_denied'] } };
    if (startTime || endTime) {
      match.timestamp = {};
      if (startTime) match.timestamp.$gte = startTime;
      if (endTime) match.timestamp.$lte = endTime;
    }

    const stats = await this.collection!.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalDecisions: { $sum: 1 },
          allowedCount: {
            $sum: { $cond: [{ $eq: ['$hierarchyDecision.granted', true] }, 1, 0] }
          },
          deniedCount: {
            $sum: { $cond: [{ $eq: ['$hierarchyDecision.granted', false] }, 1, 0] }
          },
          avgLatencyMs: { $avg: '$latencyMs' },
          multiLevelCount: {
            $sum: { $cond: ['$hierarchyDecision.multiLevelExpansion', 1, 0] }
          },
          conditionalCount: {
            $sum: { $cond: [{ $gt: [{ $size: { $ifNull: ['$hierarchyDecision.conditionalEvaluations', []] } }, 0] }, 1, 0] }
          }
        }
      }
    ]).toArray();

    return stats[0] || {
      totalDecisions: 0,
      allowedCount: 0,
      deniedCount: 0,
      avgLatencyMs: 0,
      multiLevelCount: 0,
      conditionalCount: 0
    };
  }

  /**
   * Get top granting parents (which COIs most commonly grant access)
   */
  async getTopGrantingParents(limit: number = 10): Promise<Array<{ parent: string; count: number }>> {
    await this.ensureInitialized();

    const result = await this.collection!.aggregate([
      {
        $match: {
          eventType: 'hierarchy_access',
          'hierarchyDecision.granted': true
        }
      },
      { $unwind: '$hierarchyDecision.grantingParents' },
      {
        $group: {
          _id: '$hierarchyDecision.grantingParents',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          parent: '$_id',
          count: 1
        }
      }
    ]).toArray();

    return result as Array<{ parent: string; count: number }>;
  }

  /**
   * Get most accessed resources via hierarchy
   */
  async getTopResourcesByHierarchy(limit: number = 10): Promise<Array<{ resourceId: string; count: number }>> {
    await this.ensureInitialized();

    const result = await this.collection!.aggregate([
      {
        $match: {
          eventType: 'hierarchy_access',
          'hierarchyDecision.expansionApplied': true
        }
      },
      {
        $group: {
          _id: '$resource.resourceId',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          resourceId: '$_id',
          count: 1
        }
      }
    ]).toArray();

    return result as Array<{ resourceId: string; count: number }>;
  }

  /**
   * Shutdown (close MongoDB connection)
   */
  async shutdown(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      this.collection = null;
      this.initialized = false;
      logger.info('MongoDB COI Hierarchy Audit Store shutdown');
    }
  }
}

// Export singleton
export const mongoCoiHierarchyAuditStore = new MongoCoiHierarchyAuditStore();

export default MongoCoiHierarchyAuditStore;
