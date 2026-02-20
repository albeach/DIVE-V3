/**
 * Session Analytics Controller
 *
 * Provides real session data from Keycloak admin API:
 * - Active session counts from Keycloak realm
 * - Session duration statistics
 * - User/client distribution
 */

import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { IAdminAPIResponse } from '../types/admin.types';
import { keycloakAdminService } from '../services/keycloak-admin.service';

/**
 * GET /api/admin/sessions/analytics
 * Get session analytics dashboard data
 */
export const getSessionAnalyticsHandler = async (
    _req: Request,
    res: Response
): Promise<void> => {
    const requestId = _req.headers['x-request-id'] as string || `req-${Date.now()}`;

    try {
        logger.info('Admin: Get session analytics', { requestId });

        const stats = await keycloakAdminService.getSessionStats();

        const analytics = {
            totalSessions: stats.totalActive as number,
            activeSessions: stats.totalActive as number,
            averageSessionDuration: Math.round(((stats.averageDuration as number) || 0) / 60), // seconds → minutes
            peakConcurrentSessions: stats.peakConcurrent24h as number,
            sessionsToday: stats.totalActive as number,
            sessionsByHour: [],
            sessionsByDevice: {},
            sessionsByCountry: {},
            sessionsByBrowser: {},
            sessionsByClient: stats.byClient || {},
            sessionsByUser: stats.byUser || {},
            trends: {
                sessions7d: 0,
                sessions30d: 0,
                change7d: 0,
                change30d: 0,
            },
        };

        const response: IAdminAPIResponse = {
            success: true,
            data: {
                analytics,
                timestamp: new Date().toISOString(),
            },
            requestId,
        };

        res.status(200).json(response);
    } catch (error) {
        logger.error('Failed to get session analytics', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error',
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to get session analytics',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId,
        };

        res.status(500).json(response);
    }
};

/**
 * GET /api/admin/sessions
 * Get list of active sessions with filters
 */
export const getSessionsListHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const { page = '1', limit = '50', userId, status } = req.query;

    try {
        logger.info('Admin: Get sessions list', {
            requestId,
            page,
            limit,
            userId,
            status,
        });

        const pageNum = parseInt(page as string, 10);
        const limitNum = parseInt(limit as string, 10);

        const filters: Record<string, unknown> = {};
        if (userId) filters.username = userId;
        if (status) filters.status = status;

        const sessions = await keycloakAdminService.getActiveSessions(undefined, filters);

        // Paginate
        const total = sessions.length;
        const start = (pageNum - 1) * limitNum;
        const paginatedSessions = sessions.slice(start, start + limitNum).map(s => ({
            id: s.id,
            userId: s.userId,
            username: s.username,
            ipAddress: s.ipAddress,
            createdAt: s.start ? new Date(s.start as number).toISOString() : undefined,
            lastActivity: s.lastAccess ? new Date(s.lastAccess as number).toISOString() : undefined,
            clients: s.clients || {},
        }));

        const response: IAdminAPIResponse = {
            success: true,
            data: {
                sessions: paginatedSessions,
                total,
                page: pageNum,
                pageSize: limitNum,
            },
            requestId,
        };

        res.status(200).json(response);
    } catch (error) {
        logger.error('Failed to get sessions list', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error',
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to get sessions list',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId,
        };

        res.status(500).json(response);
    }
};

/**
 * POST /api/admin/sessions/:id/revoke
 * Revoke a specific session
 */
export const revokeSessionHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const { id } = req.params;

    try {
        logger.info('Admin: Revoke session', { requestId, sessionId: id });

        await keycloakAdminService.revokeSession(id);

        const response: IAdminAPIResponse = {
            success: true,
            message: `Session ${id} revoked successfully`,
            requestId,
        };

        res.status(200).json(response);
    } catch (error) {
        logger.error('Failed to revoke session', {
            requestId,
            sessionId: id,
            error: error instanceof Error ? error.message : 'Unknown error',
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to revoke session',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId,
        };

        res.status(500).json(response);
    }
};

/**
 * POST /api/admin/sessions/revoke-all/:userId
 * Revoke all sessions for a specific user
 */
export const revokeAllUserSessionsHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const { userId } = req.params;

    try {
        logger.info('Admin: Revoke all user sessions', { requestId, userId });

        const revokedCount = await keycloakAdminService.revokeUserSessions(userId);

        const response: IAdminAPIResponse = {
            success: true,
            data: {
                count: revokedCount,
            },
            message: `Revoked ${revokedCount} session(s) for user ${userId}`,
            requestId,
        };

        res.status(200).json(response);
    } catch (error) {
        logger.error('Failed to revoke user sessions', {
            requestId,
            userId,
            error: error instanceof Error ? error.message : 'Unknown error',
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to revoke user sessions',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId,
        };

        res.status(500).json(response);
    }
};
