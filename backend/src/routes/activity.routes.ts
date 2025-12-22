/**
 * Activity Routes
 *
 * User activity endpoints for tracking document interactions and authorization decisions
 */

import { Router } from 'express';
import { authenticateJWT } from '../middleware/authz.middleware';
import { decisionLogService } from '../services/decision-log.service';
import { logger } from '../utils/logger';
import type { Request, Response } from 'express';

const router = Router();

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
 * Get current user's activity logs
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

        // Build query
        const query: any = {
            subject: uniqueID,
            limit,
            skip: offset
        };

        if (startTime) {
            query.startTime = startTime;
        }

        // Filter by decision type if specified
        if (type === 'access_granted') {
            query.decision = 'ALLOW';
        } else if (type === 'access_denied') {
            query.decision = 'DENY';
        }

        // Query decision logs
        const decisions = await decisionLogService.queryDecisions(query);

        // Transform to activity format
        const activities = decisions.map((decision) => {
            // Determine activity type from decision and action
            let activityType: 'view' | 'download' | 'upload' | 'access_granted' | 'access_denied' | 'request_submitted';

            if (decision.decision === 'ALLOW') {
                // Check action.operation to determine type
                if (decision.action.operation === 'download' || decision.action.operation === 'GET' && decision.resource.resourceId.includes('download')) {
                    activityType = 'download';
                } else if (decision.action.operation === 'upload' || decision.action.operation === 'POST') {
                    activityType = 'upload';
                } else {
                    activityType = decision.decision === 'ALLOW' ? 'access_granted' : 'access_denied';
                }
            } else {
                activityType = 'access_denied';
            }

            // Default to 'view' if operation is GET and decision is ALLOW
            if (decision.action.operation === 'GET' && decision.decision === 'ALLOW' && activityType === 'access_granted') {
                activityType = 'view';
            }

            // Try to extract title from resource metadata if available
            // Resource metadata may be in evaluation_details or resource attributes
            let resourceTitle = decision.resource.resourceId;
            const resourceMetadata = (decision.evaluation_details as any)?.resource || decision.resource;
            if (resourceMetadata?.title) {
                resourceTitle = resourceMetadata.title;
            } else if (resourceMetadata?.name) {
                resourceTitle = resourceMetadata.name;
            }

            return {
                id: decision.requestId,
                type: activityType,
                resourceId: decision.resource.resourceId,
                resourceTitle: resourceTitle,
                classification: decision.resource.classification || 'UNCLASSIFIED',
                timestamp: new Date(decision.timestamp),
                details: decision.decision === 'DENY' ? decision.reason : undefined,
                decision: decision.decision
            };
        });

        logger.info('User activity queried', {
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

