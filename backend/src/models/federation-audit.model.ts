/**
 * DIVE V3 - Federation Audit Model
 *
 * Phase 4: Complete audit trail for federation changes.
 *
 * Compliance Requirements:
 * - ACP-240 Section 5.3: "Access control decisions MUST reflect current federation agreements"
 * - ADatP-5663 Section 6.8: "Federation changes MUST be auditable"
 *
 * Audit Events:
 * - SPOKE_REGISTERED: New spoke registration received
 * - SPOKE_APPROVED: Spoke approved by admin
 * - SPOKE_SUSPENDED: Spoke temporarily suspended
 * - SPOKE_REVOKED: Spoke permanently revoked
 * - FEDERATION_LINK_CREATED: Bidirectional IdP federation established
 * - RESOURCE_RELEASABILITY_UPDATED: Resources updated with new partner
 * - CACHE_INVALIDATED: Authorization cache cleared
 *
 * @version 1.0.0
 * @date 2025-12-20
 */

import { Collection, Db, ObjectId } from 'mongodb';
import { logger } from '../utils/logger';
import { getDb, mongoSingleton } from '../utils/mongodb-singleton';

// ============================================
// TYPES
// ============================================

/**
 * Federation audit event types
 */
export type FederationEventType =
    | 'SPOKE_REGISTERED'
    | 'SPOKE_APPROVED'
    | 'SPOKE_SUSPENDED'
    | 'SPOKE_REVOKED'
    | 'FEDERATION_LINK_CREATED'
    | 'FEDERATION_LINK_REMOVED'
    | 'RESOURCE_RELEASABILITY_UPDATED'
    | 'TRUSTED_ISSUER_ADDED'
    | 'TRUSTED_ISSUER_REMOVED'
    | 'CACHE_INVALIDATED'
    | 'CASCADE_COMPLETED'
    | 'CASCADE_FAILED';

/**
 * Federation audit entry
 */
export interface IFederationAuditEntry {
    _id?: ObjectId;

    /**
     * Event type
     */
    eventType: FederationEventType;

    /**
     * Actor who performed the action
     */
    actorId: string;           // uniqueID of admin or system
    actorInstance: string;     // Instance code of actor (e.g., USA)

    /**
     * Target of the action (if applicable)
     */
    targetSpokeId?: string;
    targetInstanceCode?: string;

    /**
     * State changes
     */
    previousState?: Record<string, unknown>;
    newState?: Record<string, unknown>;

    /**
     * Impact metrics
     */
    resourcesAffected?: number;
    cachesInvalidated?: string[];

    /**
     * Cascade result (for CASCADE_COMPLETED/CASCADE_FAILED)
     */
    cascadeResult?: {
        opaUpdated: boolean;
        keycloakUpdated: boolean;
        resourcesUpdated: boolean;
        cacheInvalidated: boolean;
        webhooksSent: boolean;
        errors?: string[];
        durationMs?: number;
    };

    /**
     * Correlation ID for tracing
     */
    correlationId: string;

    /**
     * Timestamp
     */
    timestamp: Date;

    /**
     * Compliance standards this audit supports
     */
    compliantWith: string[];  // ['ACP-240', 'ADatP-5663']

    /**
     * Additional metadata
     */
    metadata?: Record<string, unknown>;
}

/**
 * Query options for audit entries
 */
export interface IAuditQueryOptions {
    eventTypes?: FederationEventType[];
    actorId?: string;
    actorInstance?: string;
    targetInstanceCode?: string;
    correlationId?: string;
    startTime?: Date;
    endTime?: Date;
    limit?: number;
    skip?: number;
}

// ============================================
// FEDERATION AUDIT STORE
// ============================================

const COLLECTION_NAME = 'federation_audits';

class FederationAuditStore {
    private db: Db | null = null;
    private collection: Collection<IFederationAuditEntry> | null = null;
    private initialized = false;

    /**
     * Initialize MongoDB connection and create indexes
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            await mongoSingleton.connect();
            this.db = getDb();
            this.collection = this.db.collection<IFederationAuditEntry>(COLLECTION_NAME);

            // Create indexes for efficient querying
            await this.collection.createIndex({ eventType: 1 });
            await this.collection.createIndex({ timestamp: -1 });
            await this.collection.createIndex({ actorInstance: 1 });
            await this.collection.createIndex({ targetInstanceCode: 1 });
            await this.collection.createIndex({ correlationId: 1 });
            await this.collection.createIndex({ 'compliantWith': 1 });

            // TTL index - keep audit entries for 90 days (compliance requirement)
            await this.collection.createIndex(
                { timestamp: 1 },
                { expireAfterSeconds: 90 * 24 * 60 * 60 }
            );

            this.initialized = true;

            logger.info('Federation Audit Store initialized', {
                collection: COLLECTION_NAME,
                retentionDays: 90
            });
        } catch (error) {
            logger.error('Failed to initialize Federation Audit Store', {
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

    /**
     * Create a new audit entry
     */
    async create(entry: Omit<IFederationAuditEntry, '_id'>): Promise<IFederationAuditEntry> {
        await this.ensureInitialized();

        const document: IFederationAuditEntry = {
            ...entry,
            timestamp: entry.timestamp || new Date(),
            compliantWith: entry.compliantWith || ['ACP-240', 'ADatP-5663']
        };

        const result = await this.collection!.insertOne(document as IFederationAuditEntry & { _id?: ObjectId });

        logger.info('Federation audit entry created', {
            eventType: entry.eventType,
            correlationId: entry.correlationId,
            targetInstanceCode: entry.targetInstanceCode,
            id: result.insertedId
        });

        return { ...document, _id: result.insertedId };
    }

    /**
     * Query audit entries
     */
    async query(options: IAuditQueryOptions = {}): Promise<IFederationAuditEntry[]> {
        await this.ensureInitialized();

        const filter: Record<string, unknown> = {};

        if (options.eventTypes?.length) {
            filter.eventType = { $in: options.eventTypes };
        }

        if (options.actorId) {
            filter.actorId = options.actorId;
        }

        if (options.actorInstance) {
            filter.actorInstance = options.actorInstance;
        }

        if (options.targetInstanceCode) {
            filter.targetInstanceCode = options.targetInstanceCode;
        }

        if (options.correlationId) {
            filter.correlationId = options.correlationId;
        }

        if (options.startTime || options.endTime) {
            const ts: Record<string, Date> = {};
            if (options.startTime) {
                ts.$gte = options.startTime;
            }
            if (options.endTime) {
                ts.$lte = options.endTime;
            }
            filter.timestamp = ts;
        }

        const cursor = this.collection!
            .find(filter)
            .sort({ timestamp: -1 })
            .skip(options.skip || 0)
            .limit(options.limit || 100);

        return cursor.toArray();
    }

    /**
     * Get audit entries for a specific correlation ID
     */
    async getByCorrelationId(correlationId: string): Promise<IFederationAuditEntry[]> {
        return this.query({ correlationId });
    }

    /**
     * Get recent audit entries for a spoke
     */
    async getForSpoke(instanceCode: string, limit: number = 50): Promise<IFederationAuditEntry[]> {
        return this.query({ targetInstanceCode: instanceCode, limit });
    }

    /**
     * Get audit statistics
     */
    async getStats(): Promise<{
        totalEntries: number;
        eventCounts: Record<string, number>;
        oldestEntry?: Date;
        newestEntry?: Date;
    }> {
        await this.ensureInitialized();

        const totalEntries = await this.collection!.countDocuments();

        const eventCountsPipeline = [
            { $group: { _id: '$eventType', count: { $sum: 1 } } }
        ];
        const eventCountsResult = await this.collection!.aggregate(eventCountsPipeline).toArray();
        const eventCounts: Record<string, number> = {};
        for (const item of eventCountsResult) {
            eventCounts[item._id] = item.count;
        }

        const oldest = await this.collection!.findOne({}, { sort: { timestamp: 1 } });
        const newest = await this.collection!.findOne({}, { sort: { timestamp: -1 } });

        return {
            totalEntries,
            eventCounts,
            oldestEntry: oldest?.timestamp,
            newestEntry: newest?.timestamp
        };
    }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const federationAuditStore = new FederationAuditStore();

export default FederationAuditStore;

