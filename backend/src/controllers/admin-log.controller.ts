/**
 * Admin Log Controller
 * 
 * Handles audit log queries and statistics
 * All endpoints require super_admin role
 */

import { Request, Response } from 'express';
import { auditLogService } from '../services/audit-log.service';
import { logger } from '../utils/logger';
import { logAdminAction } from '../middleware/admin-auth.middleware';
import { IAdminAPIResponse } from '../types/admin.types';

interface IAuthenticatedRequest extends Request {
    user?: {
        uniqueID: string;
        sub: string;
        roles?: string[];
    };
}

/**
 * GET /api/admin/logs
 * Query audit logs with filters
 */
export const getLogsHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const authReq = req as IAuthenticatedRequest;

    try {
        const {
            eventType,
            subject,
            resourceId,
            outcome,
            startTime,
            endTime,
            limit,
            offset
        } = req.query;

        logger.info('Admin: Query logs request', {
            requestId,
            admin: authReq.user?.uniqueID,
            filters: { eventType, subject, resourceId, outcome }
        });

        const result = await auditLogService.queryLogs({
            eventType: eventType as string,
            subject: subject as string,
            resourceId: resourceId as string,
            outcome: outcome as 'ALLOW' | 'DENY',
            startTime: startTime as string,
            endTime: endTime as string,
            limit: limit ? parseInt(limit as string) : 50,
            offset: offset ? parseInt(offset as string) : 0
        });

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'view_logs',
            outcome: 'success',
            details: { count: result.logs.length, total: result.total }
        });

        const response: IAdminAPIResponse = {
            success: true,
            data: result,
            requestId
        };

        res.status(200).json(response);
    } catch (error) {
        logger.error('Failed to query logs', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'view_logs',
            outcome: 'failure',
            reason: error instanceof Error ? error.message : 'Unknown error'
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to query logs',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId
        };

        res.status(500).json(response);
    }
};

/**
 * GET /api/admin/logs/violations
 * Get security violations (ACCESS_DENIED events)
 */
export const getViolationsHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const authReq = req as IAuthenticatedRequest;

    try {
        const { limit } = req.query;

        logger.info('Admin: Get violations request', {
            requestId,
            admin: authReq.user?.uniqueID
        });

        const violations = await auditLogService.getSecurityViolations(
            limit ? parseInt(limit as string) : 50
        );

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'view_violations',
            outcome: 'success',
            details: { count: violations.length }
        });

        const response: IAdminAPIResponse = {
            success: true,
            data: { violations, total: violations.length },
            requestId
        };

        res.status(200).json(response);
    } catch (error) {
        logger.error('Failed to get violations', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to get violations',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId
        };

        res.status(500).json(response);
    }
};

/**
 * GET /api/admin/logs/stats
 * Get log statistics
 */
export const getStatsHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const authReq = req as IAuthenticatedRequest;

    try {
        const { days } = req.query;

        logger.info('Admin: Get stats request', {
            requestId,
            admin: authReq.user?.uniqueID,
            days: days || 7
        });

        const stats = await auditLogService.getLogStatistics(
            days ? parseInt(days as string) : 7
        );

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'view_stats',
            outcome: 'success'
        });

        const response: IAdminAPIResponse = {
            success: true,
            data: stats,
            requestId
        };

        res.status(200).json(response);
    } catch (error) {
        logger.error('Failed to get stats', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to get statistics',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId
        };

        res.status(500).json(response);
    }
};

/**
 * GET /api/admin/logs/export
 * Export logs to JSON
 */
export const exportLogsHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const authReq = req as IAuthenticatedRequest;

    try {
        const {
            eventType,
            subject,
            resourceId,
            outcome,
            startTime,
            endTime
        } = req.query;

        logger.info('Admin: Export logs request', {
            requestId,
            admin: authReq.user?.uniqueID
        });

        const json = await auditLogService.exportLogs({
            eventType: eventType as string,
            subject: subject as string,
            resourceId: resourceId as string,
            outcome: outcome as 'ALLOW' | 'DENY',
            startTime: startTime as string,
            endTime: endTime as string
        });

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'export_logs',
            outcome: 'success'
        });

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${Date.now()}.json"`);
        res.status(200).send(json);
    } catch (error) {
        logger.error('Failed to export logs', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'export_logs',
            outcome: 'failure',
            reason: error instanceof Error ? error.message : 'Unknown error'
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to export logs',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId
        };

        res.status(500).json(response);
    }
};

