/**
 * Activity Routes
 *
 * MEMORY LEAK FIX (2026-02-16): Refactored to use MongoDB singleton
 * OLD: Created new MongoClient() with connection caching (connection leak)
 * NEW: Uses shared singleton connection pool via getDb()
 * IMPACT: Prevents connection leaks during activity log queries
 *
 * User activity endpoints for tracking document interactions and authorization decisions
 *
 * IMPORTANT: This route queries the `audit_logs` collection (populated by ACP-240 audit logger)
 * NOT the `decisions` collection. The authz middleware writes to audit_logs via auditService.
 */

import { Router } from 'express';
import { Collection } from 'mongodb';
import { authenticateJWT } from '../middleware/authz.middleware';
import { logger } from '../utils/logger';
import { getDb } from '../utils/mongodb-singleton';
import type { Request, Response } from 'express';

const router = Router();

/**
 * Get audit logs collection using singleton
 */
function getAuditLogsCollection(): Collection {
    const db = getDb();
    return db.collection(process.env.ACP240_LOGS_COLLECTION || 'audit_logs');
}

interface IAuthenticatedRequest extends Request {
    user?: {
        uniqueID: string;
        sub: string;
        clearance?: string;
        countryOfAffiliation?: string;
        acpCOI?: string[];
    };
}

/**
 * GET /api/activity
 * Get current user's activity logs from audit_logs collection
 * Query params:
 * - limit: Maximum number of logs (default: 50)
 * - offset: Pagination offset (default: 0)
 * - timeRange: 24h | 7d | 30d | all (default: 7d)
 * - type: view | download | upload | access_granted | access_denied | all (default: all)
 */
router.get('/', authenticateJWT, async (req: IAuthenticatedRequest, res: Response) => {
    try {
        const { uniqueID } = req.user || {};

        if (!uniqueID) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'User not authenticated'
            });
        }

        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;
        const timeRange = (req.query.timeRange as string) || '7d';
        const type = (req.query.type as string) || 'all';

        // Calculate time range
        const now = new Date();
        let startTime: Date | undefined;

        switch (timeRange) {
            case '24h':
                startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                break;
            case '7d':
                startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case '30d':
                startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            case 'all':
            default:
                startTime = undefined;
        }

        // Build MongoDB filter for audit_logs collection
        const filter: Record<string, unknown> = {
            subject: uniqueID
        };

        if (startTime) {
            filter.timestamp = { $gte: startTime.toISOString() };
        }

        // Filter by decision outcome if specified
        if (type === 'access_granted' || type === 'view' || type === 'download') {
            filter.outcome = 'ALLOW';
        } else if (type === 'access_denied') {
            filter.outcome = 'DENY';
        }

        // Query audit_logs collection
        const collection = getAuditLogsCollection();
        const auditLogs = await collection
            .find(filter)
            .sort({ timestamp: -1 })
            .skip(offset)
            .limit(limit)
            .toArray();

        // Transform audit_logs to activity format
        const activities = auditLogs.map((log: Record<string, unknown>) => {
            // Determine activity type from event type and outcome
            let activityType: 'view' | 'download' | 'upload' | 'access_granted' | 'access_denied' | 'request_submitted';

            const eventType = log.acp240EventType || log.eventType;
            const outcome = log.outcome || ((log.policyEvaluation as Record<string, unknown>)?.allow ? 'ALLOW' : 'DENY');
            const action = log.action || 'access';

            if (outcome === 'ALLOW') {
                if (action === 'download' || eventType === 'DOWNLOAD') {
                    activityType = 'download';
                } else if (action === 'upload' || eventType === 'UPLOAD') {
                    activityType = 'upload';
                } else if (eventType === 'DECRYPT' || action === 'access') {
                    activityType = 'view';
                } else {
                    activityType = 'access_granted';
                }
            } else {
                activityType = 'access_denied';
            }

            // Extract resource title if available
            const resourceId = log.resourceId || 'unknown';
            let resourceTitle = resourceId;
            const resourceAttributes = log.resourceAttributes as Record<string, unknown> | undefined;
            if (resourceAttributes?.title) {
                resourceTitle = resourceAttributes.title as string;
            }

            return {
                id: (log._id as { toString(): string })?.toString() || log.requestId || `activity-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                type: activityType,
                resourceId: resourceId,
                resourceTitle: resourceTitle,
                classification: resourceAttributes?.classification || 'UNCLASSIFIED',
                timestamp: new Date(log.timestamp as string),
                details: outcome === 'DENY' ? log.reason : undefined,
                decision: outcome
            };
        });

        logger.info('User activity queried from audit_logs', {
            uniqueID,
            count: activities.length,
            timeRange,
            type
        });

        res.status(200).json({
            activities,
            total: activities.length,
            limit,
            offset
        });
    } catch (error) {
        logger.error('Failed to get user activity', {
            error: error instanceof Error ? error.message : 'Unknown error',
            uniqueID: (req as IAuthenticatedRequest).user?.uniqueID
        });
        res.status(500).json({
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Failed to get activity'
        });
    }
});

export default router;

