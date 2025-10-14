/**
 * Audit Log Service
 * 
 * Queries and analyzes ACP-240 audit logs from MongoDB
 * Supports filtering, pagination, statistics, and export
 */

import { logger } from '../utils/logger';
import { MongoClient, Db, Collection } from 'mongodb';

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGODB_DATABASE || (process.env.NODE_ENV === 'test' ? 'dive-v3-test' : 'dive-v3');
const LOGS_COLLECTION = 'audit_logs';

interface IAuditLogQuery {
    eventType?: string;
    subject?: string;
    resourceId?: string;
    outcome?: 'ALLOW' | 'DENY';
    startTime?: string;
    endTime?: string;
    limit?: number;
    offset?: number;
}

interface IAuditLogEntry {
    timestamp: string;
    eventType: string;
    requestId: string;
    subject: string;
    action: string;
    resourceId: string;
    outcome: 'ALLOW' | 'DENY';
    reason: string;
    subjectAttributes?: any;
    resourceAttributes?: any;
    policyEvaluation?: any;
    context?: any;
    latencyMs?: number;
}

interface IAuditLogStats {
    totalEvents: number;
    eventsByType: Record<string, number>;
    deniedAccess: number;
    successfulAccess: number;
    topDeniedResources: Array<{ resourceId: string; count: number }>;
    topUsers: Array<{ subject: string; count: number }>;
    violationTrend: Array<{ date: string; count: number }>;
}

class AuditLogService {
    private client: MongoClient | null = null;
    private db: Db | null = null;

    /**
     * Connect to MongoDB
     */
    private async connect(): Promise<void> {
        if (this.client && this.db) {
            return;
        }

        try {
            this.client = new MongoClient(MONGODB_URL);
            await this.client.connect();
            this.db = this.client.db(DB_NAME);

            logger.debug('Connected to MongoDB for audit log queries');
        } catch (error) {
            logger.error('Failed to connect to MongoDB', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw new Error('Database connection failed');
        }
    }

    /**
     * Get logs collection
     */
    private async getCollection(): Promise<Collection> {
        await this.connect();
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        return this.db.collection(LOGS_COLLECTION);
    }

    /**
     * Query audit logs with filters
     */
    async queryLogs(query: IAuditLogQuery): Promise<{ logs: IAuditLogEntry[]; total: number }> {
        try {
            const collection = await this.getCollection();

            // Build MongoDB filter
            const filter: any = {};

            if (query.eventType) {
                filter['acp240EventType'] = query.eventType;
            }

            if (query.subject) {
                filter.subject = { $regex: query.subject, $options: 'i' };
            }

            if (query.resourceId) {
                filter.resourceId = { $regex: query.resourceId, $options: 'i' };
            }

            if (query.outcome) {
                filter.outcome = query.outcome;
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

            // Get total count
            const total = await collection.countDocuments(filter);

            // Get paginated results
            const logs = await collection
                .find(filter)
                .sort({ timestamp: -1 })
                .skip(query.offset || 0)
                .limit(query.limit || 50)
                .toArray();

            return {
                logs: logs.map((log: any) => ({
                    timestamp: log.timestamp,
                    eventType: log.acp240EventType,
                    requestId: log.requestId,
                    subject: log.subject,
                    action: log.action,
                    resourceId: log.resourceId,
                    outcome: log.outcome,
                    reason: log.reason,
                    subjectAttributes: log.subjectAttributes,
                    resourceAttributes: log.resourceAttributes,
                    policyEvaluation: log.policyEvaluation,
                    context: log.context,
                    latencyMs: log.latencyMs
                })),
                total
            };
        } catch (error) {
            logger.error('Failed to query audit logs', {
                error: error instanceof Error ? error.message : 'Unknown error',
                query
            });
            throw new Error('Failed to query logs');
        }
    }

    /**
     * Get security violations (ACCESS_DENIED events)
     */
    async getSecurityViolations(limit: number = 50): Promise<IAuditLogEntry[]> {
        const result = await this.queryLogs({
            eventType: 'ACCESS_DENIED',
            limit,
            offset: 0
        });

        return result.logs;
    }

    /**
     * Get ENCRYPT events
     */
    async getEncryptEvents(limit: number = 50): Promise<IAuditLogEntry[]> {
        const result = await this.queryLogs({
            eventType: 'ENCRYPT',
            limit,
            offset: 0
        });

        return result.logs;
    }

    /**
     * Get DECRYPT events
     */
    async getDecryptEvents(limit: number = 50): Promise<IAuditLogEntry[]> {
        const result = await this.queryLogs({
            eventType: 'DECRYPT',
            limit,
            offset: 0
        });

        return result.logs;
    }

    /**
     * Get log statistics
     */
    async getLogStatistics(days: number = 7): Promise<IAuditLogStats> {
        try {
            const collection = await this.getCollection();

            // Calculate start date
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);
            const startTime = startDate.toISOString();

            // Total events
            const totalEvents = await collection.countDocuments({
                timestamp: { $gte: startTime }
            });

            // Events by type
            const eventsByTypeResult = await collection
                .aggregate([
                    { $match: { timestamp: { $gte: startTime } } },
                    { $group: { _id: '$acp240EventType', count: { $sum: 1 } } }
                ])
                .toArray();

            const eventsByType: Record<string, number> = {};
            eventsByTypeResult.forEach((item: any) => {
                eventsByType[item._id] = item.count;
            });

            // Denied vs successful access
            const deniedAccess = await collection.countDocuments({
                timestamp: { $gte: startTime },
                outcome: 'DENY'
            });

            const successfulAccess = await collection.countDocuments({
                timestamp: { $gte: startTime },
                outcome: 'ALLOW'
            });

            // Top denied resources
            const topDeniedResult = await collection
                .aggregate([
                    { $match: { timestamp: { $gte: startTime }, outcome: 'DENY' } },
                    { $group: { _id: '$resourceId', count: { $sum: 1 } } },
                    { $sort: { count: -1 } },
                    { $limit: 10 }
                ])
                .toArray();

            const topDeniedResources = topDeniedResult.map((item: any) => ({
                resourceId: item._id,
                count: item.count
            }));

            // Top users
            const topUsersResult = await collection
                .aggregate([
                    { $match: { timestamp: { $gte: startTime } } },
                    { $group: { _id: '$subject', count: { $sum: 1 } } },
                    { $sort: { count: -1 } },
                    { $limit: 10 }
                ])
                .toArray();

            const topUsers = topUsersResult.map((item: any) => ({
                subject: item._id,
                count: item.count
            }));

            // Violation trend (by day)
            const violationTrendResult = await collection
                .aggregate([
                    { $match: { timestamp: { $gte: startTime }, outcome: 'DENY' } },
                    {
                        $group: {
                            _id: { $dateToString: { format: '%Y-%m-%d', date: { $toDate: '$timestamp' } } },
                            count: { $sum: 1 }
                        }
                    },
                    { $sort: { _id: 1 } }
                ])
                .toArray();

            const violationTrend = violationTrendResult.map((item: any) => ({
                date: item._id,
                count: item.count
            }));

            return {
                totalEvents,
                eventsByType,
                deniedAccess,
                successfulAccess,
                topDeniedResources,
                topUsers,
                violationTrend
            };
        } catch (error) {
            logger.error('Failed to get log statistics', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw new Error('Failed to get statistics');
        }
    }

    /**
     * Export logs to JSON
     */
    async exportLogs(query: IAuditLogQuery): Promise<string> {
        const result = await this.queryLogs({ ...query, limit: 10000 });
        return JSON.stringify(result.logs, null, 2);
    }

    /**
     * Close database connection
     */
    async close(): Promise<void> {
        if (this.client) {
            await this.client.close();
            this.client = null;
            this.db = null;
        }
    }
}

// Export singleton instance
export const auditLogService = new AuditLogService();

