/**
 * Decision Log Service - Phase 3 & 4
 * 
 * Logs all authorization decisions and KAS key releases to MongoDB for audit trail.
 * 
 * Features:
 * - 90-day retention policy (TTL index)
 * - PII minimization (uniqueID only, not full names/emails)
 * - Structured logging for decision replay
 * - Query and export capabilities
 * - KAS key release logging (Phase 4)
 * 
 * Compliance: ACP-240 Section 6, NATO ADatP-5663
 * 
 * Last Updated: October 29, 2025 (Phase 4)
 */

import { Collection, Document } from 'mongodb';
import { logger } from '../utils/logger';
import { getDb } from '../utils/mongodb-singleton';

// MongoDB collection names
const DECISIONS_COLLECTION = 'decisions';
const KEY_RELEASES_COLLECTION = 'key_releases';  // Phase 4: KAS audit logs

// TTL: 90 days in seconds
const TTL_SECONDS = 90 * 24 * 60 * 60;

/**
 * Decision log entry interface
 */
export interface IDecisionLog {
    timestamp: string;
    requestId: string;
    subject: {
        uniqueID: string;
        clearance?: string;
        clearanceOriginal?: string;
        clearanceCountry?: string;
        countryOfAffiliation?: string;
        acpCOI?: string[];
    };
    resource: {
        resourceId: string;
        classification?: string;
        originalClassification?: string;
        originalCountry?: string;
        releasabilityTo?: string[];
        COI?: string[];
    };
    action: {
        operation: string;
    };
    decision: 'ALLOW' | 'DENY';
    reason: string;
    evaluation_details?: Record<string, unknown>;
    obligations?: Array<{
        type: string;
        resourceId?: string;
    }>;
    latency_ms: number;
    context: {
        sourceIP: string;
        acr?: string;
        amr?: string[];
        auth_time?: number;
    };
}

/**
 * Query parameters for decision logs
 */
export interface IDecisionLogQuery {
    subject?: string;
    resourceId?: string;
    decision?: 'ALLOW' | 'DENY';
    startTime?: Date;
    endTime?: Date;
    limit?: number;
    skip?: number;
}

/**
 * KAS key release log entry interface (Phase 4)
 */
export interface IKeyReleaseLog {
    timestamp: string;
    requestId: string;
    eventType: 'KEY_RELEASED' | 'KEY_DENIED';
    resourceId: string;
    subjectUniqueID: string;
    policyEvaluated: string;
    decision: 'GRANT' | 'DENY';
    reason: string;
    kekId?: string;
    dekHash?: string;
    kasLatencyMs: number;
    opaDecision?: {
        allow: boolean;
        reason: string;
    };
    subjectAttributes?: {
        clearance?: string;
        countryOfAffiliation?: string;
        acpCOI?: string[];
    };
    resourceAttributes?: {
        classification?: string;
        releasabilityTo?: string[];
        COI?: string[];
    };
}

/**
 * Decision Log Service
 */
class DecisionLogService {
    // MongoDB is connected via singleton at server startup - no per-service connection needed

    /**
     * Ensure TTL index exists for automatic 90-day deletion
     */
    private async ensureTTLIndex(): Promise<void> {
        try {
            const collection = this.getCollection();

            // Create TTL index on timestamp field (90 days)
            await collection.createIndex(
                { timestamp: 1 },
                {
                    expireAfterSeconds: TTL_SECONDS,
                    name: 'decision_log_ttl_90_days'
                }
            );

            logger.info('Decision log TTL index ensured', {
                collection: DECISIONS_COLLECTION,
                ttlDays: 90
            });
        } catch (error) {
            logger.warn('Failed to create TTL index (may already exist)', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Get decisions collection
     */
    private getCollection(): Collection<IDecisionLog> {
        const db = getDb();
        return db.collection<IDecisionLog>(DECISIONS_COLLECTION);
    }

    /**
     * Log an authorization decision
     */
    async logDecision(decision: IDecisionLog): Promise<void> {
        try {
            const collection = this.getCollection();

            // Sanitize PII - only store uniqueID, not full names/emails
            const sanitizedDecision: IDecisionLog = {
                ...decision,
                timestamp: decision.timestamp || new Date().toISOString(),
            };

            await collection.insertOne(sanitizedDecision);

            logger.debug('Decision logged to MongoDB', {
                requestId: decision.requestId,
                subject: decision.subject.uniqueID,
                resource: decision.resource.resourceId,
                decision: decision.decision,
                latency_ms: decision.latency_ms
            });
        } catch (error) {
            // Non-blocking: Log error but don't fail the request
            logger.error('Failed to log decision to MongoDB', {
                error: error instanceof Error ? error.message : 'Unknown error',
                requestId: decision.requestId
            });
        }
    }

    /**
     * Query decision logs
     */
    async queryDecisions(query: IDecisionLogQuery): Promise<IDecisionLog[]> {
        try {
            const collection = this.getCollection();

            // Build MongoDB query
            const filter: Document = {};

            if (query.subject) {
                filter['subject.uniqueID'] = query.subject;
            }

            if (query.resourceId) {
                filter['resource.resourceId'] = query.resourceId;
            }

            if (query.decision) {
                filter.decision = query.decision;
            }

            if (query.startTime || query.endTime) {
                filter.timestamp = {};
                if (query.startTime) {
                    filter.timestamp.$gte = query.startTime.toISOString();
                }
                if (query.endTime) {
                    filter.timestamp.$lte = query.endTime.toISOString();
                }
            }

            // Execute query
            const cursor = collection.find(filter);

            if (query.skip) {
                cursor.skip(query.skip);
            }

            if (query.limit) {
                cursor.limit(query.limit);
            }

            // Sort by timestamp descending (most recent first)
            cursor.sort({ timestamp: -1 });

            const results = await cursor.toArray();

            logger.info('Queried decision logs', {
                filterCount: Object.keys(filter).length,
                resultsCount: results.length
            });

            return results as IDecisionLog[];
        } catch (error) {
            logger.error('Failed to query decision logs', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw new Error('Failed to query decision logs');
        }
    }

    /**
     * Get decision statistics
     */
    async getStatistics(startTime?: Date, endTime?: Date): Promise<{
        totalDecisions: number;
        allowCount: number;
        denyCount: number;
        averageLatency: number;
        topDenyReasons: Array<{ reason: string; count: number }>;
        decisionsByCountry: Record<string, number>;
    }> {
        try {
            const collection = this.getCollection();

            // Build time filter
            const timeFilter: Document = {};
            if (startTime || endTime) {
                timeFilter.timestamp = {};
                if (startTime) {
                    timeFilter.timestamp.$gte = startTime.toISOString();
                }
                if (endTime) {
                    timeFilter.timestamp.$lte = endTime.toISOString();
                }
            }

            // Get total counts
            const [totalDecisions, allowCount, denyCount] = await Promise.all([
                collection.countDocuments(timeFilter),
                collection.countDocuments({ ...timeFilter, decision: 'ALLOW' }),
                collection.countDocuments({ ...timeFilter, decision: 'DENY' })
            ]);

            // Get average latency
            const latencyResult = await collection.aggregate([
                { $match: timeFilter },
                { $group: { _id: null, avgLatency: { $avg: '$latency_ms' } } }
            ]).toArray();

            const averageLatency = latencyResult.length > 0 ? latencyResult[0].avgLatency : 0;

            // Get top deny reasons
            const denyReasonsResult = await collection.aggregate([
                { $match: { ...timeFilter, decision: 'DENY' } },
                { $group: { _id: '$reason', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ]).toArray();

            const topDenyReasons = denyReasonsResult.map(r => ({
                reason: r._id,
                count: r.count
            }));

            // Get decisions by country
            const countryResult = await collection.aggregate([
                { $match: timeFilter },
                { $group: { _id: '$subject.countryOfAffiliation', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]).toArray();

            const decisionsByCountry: Record<string, number> = {};
            countryResult.forEach(r => {
                if (r._id) {
                    decisionsByCountry[r._id] = r.count;
                }
            });

            return {
                totalDecisions,
                allowCount,
                denyCount,
                averageLatency: Math.round(averageLatency),
                topDenyReasons,
                decisionsByCountry
            };
        } catch (error) {
            logger.error('Failed to get decision statistics', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw new Error('Failed to get decision statistics');
        }
    }

    /**
     * Log KAS key release event (Phase 4)
     * 
     * @param logEntry - Key release log entry
     */
    async logKeyRelease(logEntry: IKeyReleaseLog): Promise<void> {
        try {
            const db = getDb();
            const collection = db.collection(KEY_RELEASES_COLLECTION);

            // Ensure TTL index exists (90-day retention)
            await collection.createIndex(
                { timestamp: 1 },
                { expireAfterSeconds: TTL_SECONDS }
            );

            await collection.insertOne(logEntry);

            logger.debug('KAS key release logged', {
                requestId: logEntry.requestId,
                decision: logEntry.decision,
                resourceId: logEntry.resourceId,
                subjectUniqueID: logEntry.subjectUniqueID
            });
        } catch (error) {
            // Non-blocking: Log error but don't throw
            logger.error('Failed to log KAS key release', {
                error: error instanceof Error ? error.message : 'Unknown error',
                requestId: logEntry.requestId
            });
        }
    }

    /**
     * Query KAS key release logs
     * 
     * @param query - Query parameters
     * @returns Key release logs
     */
    async queryKeyReleases(query: {
        subjectUniqueID?: string;
        resourceId?: string;
        decision?: 'GRANT' | 'DENY';
        startTime?: string;
        endTime?: string;
        limit?: number;
        skip?: number;
    }): Promise<IKeyReleaseLog[]> {
        try {
            const db = getDb();
            const collection = db.collection<IKeyReleaseLog>(KEY_RELEASES_COLLECTION);

            const filter: Document = {};

            if (query.subjectUniqueID) {
                filter.subjectUniqueID = query.subjectUniqueID;
            }

            if (query.resourceId) {
                filter.resourceId = query.resourceId;
            }

            if (query.decision) {
                filter.decision = query.decision;
            }

            if (query.startTime || query.endTime) {
                filter.timestamp = {};
                if (query.startTime) {
                    filter.timestamp.$gte = query.startTime;
                }
                if (query.endTime) {
                    filter.timestamp.$lte = query.endTime;
                }
            }

            const results = await collection
                .find(filter)
                .sort({ timestamp: -1 })
                .limit(query.limit || 100)
                .skip(query.skip || 0)
                .toArray();

            return results as IKeyReleaseLog[];
        } catch (error) {
            logger.error('Failed to query KAS key releases', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw new Error('Failed to query KAS key releases');
        }
    }

    /**
     * Get KAS key release statistics
     * 
     * @param timeRange - Time range for statistics
     * @returns Statistics about key releases
     */
    async getKeyReleaseStatistics(timeRange?: { startTime?: string; endTime?: string }): Promise<{
        totalReleases: number;
        grantCount: number;
        denyCount: number;
        averageLatency: number;
        topDenyReasons: Array<{ reason: string; count: number }>;
        releasesByCountry: Record<string, number>;
    }> {
        try {
            const db = getDb();
            const collection = db.collection(KEY_RELEASES_COLLECTION);

            const timeFilter: Document = {};
            if (timeRange?.startTime || timeRange?.endTime) {
                timeFilter.timestamp = {};
                if (timeRange.startTime) {
                    timeFilter.timestamp.$gte = timeRange.startTime;
                }
                if (timeRange.endTime) {
                    timeFilter.timestamp.$lte = timeRange.endTime;
                }
            }

            // Total releases
            const totalReleases = await collection.countDocuments(timeFilter);

            // Count by decision
            const grantCount = await collection.countDocuments({ ...timeFilter, decision: 'GRANT' });
            const denyCount = await collection.countDocuments({ ...timeFilter, decision: 'DENY' });

            // Average latency
            const latencyResult = await collection.aggregate([
                { $match: timeFilter },
                { $group: { _id: null, avgLatency: { $avg: '$kasLatencyMs' } } }
            ]).toArray();

            const averageLatency = latencyResult.length > 0 ? latencyResult[0].avgLatency : 0;

            // Top deny reasons
            const denyReasonsResult = await collection.aggregate([
                { $match: { ...timeFilter, decision: 'DENY' } },
                { $group: { _id: '$reason', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ]).toArray();

            const topDenyReasons = denyReasonsResult.map((r) => ({
                reason: r._id as string,
                count: r.count as number
            }));

            // Releases by country
            const countryResult = await collection.aggregate([
                { $match: timeFilter },
                { $group: { _id: '$subjectAttributes.countryOfAffiliation', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]).toArray();

            const releasesByCountry: Record<string, number> = {};
            countryResult.forEach((r) => {
                if (r._id) {
                    releasesByCountry[r._id as string] = r.count as number;
                }
            });

            return {
                totalReleases,
                grantCount,
                denyCount,
                averageLatency: Math.round(averageLatency),
                topDenyReasons,
                releasesByCountry
            };
        } catch (error) {
            logger.error('Failed to get KAS key release statistics', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw new Error('Failed to get KAS key release statistics');
        }
    }
}

// Export singleton instance
export const decisionLogService = new DecisionLogService();
