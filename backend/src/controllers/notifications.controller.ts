import { Request, Response } from 'express';
import { notificationService } from '../services/notification.service';
import { logger } from '../utils/logger';

interface IRequestWithUser extends Request {
    user?: {
        sub: string;
        uniqueID: string;
        clearance?: string;
        countryOfAffiliation?: string;
        acpCOI?: string[];
        email?: string;
        preferred_username?: string;
        roles?: string[];
    };
}

export const listNotificationsHandler = async (req: Request, res: Response): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string;
    const authReq = req as IRequestWithUser;
    const userId = authReq.user?.uniqueID;

    if (!userId) {
        res.status(401).json({ error: 'Unauthorized', requestId });
        return;
    }

    try {
        const limit = Math.min(parseInt((req.query.limit as string) || '50', 10), 200);
        const cursor = req.query.cursor as string | undefined;
        const result = await notificationService.list(userId, limit, cursor);
        res.status(200).json({ success: true, ...result, requestId });
    } catch (error) {
        logger.error('Failed to list notifications', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        res.status(500).json({ error: 'Failed to load notifications', requestId });
    }
};

export const markNotificationReadHandler = async (req: Request, res: Response): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string;
    const authReq = req as IRequestWithUser;
    const userId = authReq.user?.uniqueID;

    if (!userId) {
        res.status(401).json({ error: 'Unauthorized', requestId });
        return;
    }

    try {
        const { id } = req.params;
        const ok = await notificationService.markRead(userId, id);
        if (!ok) {
            res.status(404).json({ error: 'Not found', requestId });
            return;
        }
        res.status(200).json({ success: true, requestId });
    } catch (error) {
        logger.error('Failed to mark notification read', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        res.status(500).json({ error: 'Failed to mark notification read', requestId });
    }
};

export const markAllNotificationsReadHandler = async (req: Request, res: Response): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string;
    const authReq = req as IRequestWithUser;
    const userId = authReq.user?.uniqueID;

    if (!userId) {
        res.status(401).json({ error: 'Unauthorized', requestId });
        return;
    }

    try {
        const modified = await notificationService.markAllRead(userId);
        res.status(200).json({ success: true, modified, requestId });
    } catch (error) {
        logger.error('Failed to mark all notifications read', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        res.status(500).json({ error: 'Failed to mark all notifications read', requestId });
    }
};

export const deleteNotificationHandler = async (req: Request, res: Response): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string;
    const authReq = req as IRequestWithUser;
    const userId = authReq.user?.uniqueID;

    if (!userId) {
        res.status(401).json({ error: 'Unauthorized', requestId });
        return;
    }

    try {
        const { id } = req.params;
        const ok = await notificationService.delete(userId, id);
        if (!ok) {
            res.status(404).json({ error: 'Not found', requestId });
            return;
        }
        res.status(200).json({ success: true, requestId });
    } catch (error) {
        logger.error('Failed to delete notification', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        res.status(500).json({ error: 'Failed to delete notification', requestId });
    }
};

export const getPreferencesHandler = async (req: Request, res: Response): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string;
    const authReq = req as IRequestWithUser;
    const userId = authReq.user?.uniqueID;

    if (!userId) {
        res.status(401).json({ error: 'Unauthorized', requestId });
        return;
    }

    try {
        const prefs = await notificationService.getPreferences(userId);
        res.status(200).json({ success: true, data: prefs, requestId });
    } catch (error) {
        logger.error('Failed to get notification preferences', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        res.status(500).json({ error: 'Failed to get notification preferences', requestId });
    }
};

export const updatePreferencesHandler = async (req: Request, res: Response): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string;
    const authReq = req as IRequestWithUser;
    const userId = authReq.user?.uniqueID;

    if (!userId) {
        res.status(401).json({ error: 'Unauthorized', requestId });
        return;
    }

    try {
        const { emailOptIn } = req.body || {};
        const prefs = await notificationService.upsertPreferences(userId, {
            emailOptIn: !!emailOptIn
        });
        res.status(200).json({ success: true, data: prefs, requestId });
    } catch (error) {
        logger.error('Failed to update notification preferences', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        res.status(500).json({ error: 'Failed to update notification preferences', requestId });
    }
};

export const seedNotificationsHandler = async (req: Request, res: Response): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string;
    const authReq = req as IRequestWithUser;
    const userId = authReq.user?.uniqueID;

    if (!userId) {
        res.status(401).json({ error: 'Unauthorized', requestId });
        return;
    }

    if (process.env.NODE_ENV === 'production') {
        res.status(403).json({ error: 'Forbidden', message: 'Seeding disabled in production', requestId });
        return;
    }

    try {
        const now = new Date().toISOString();
        const payloads = [
            {
                userId,
                type: 'access_granted' as const,
                title: 'Access Granted',
                message: 'Your request to access "NATO Exercise Plan Alpha" has been approved.',
                timestamp: now,
                read: false,
                actionUrl: '/resources/doc-123'
            },
            {
                userId,
                type: 'access_denied' as const,
                title: 'Access Denied',
                message: 'Access denied for "TOP SECRET briefing" due to clearance.',
                timestamp: now,
                read: false
            },
            {
                userId,
                type: 'upload_complete' as const,
                title: 'Upload Complete',
                message: 'Your document "Field Operations Report" has been uploaded.',
                timestamp: now,
                read: true
            },
            {
                userId,
                type: 'system' as const,
                title: 'System Maintenance',
                message: 'Scheduled maintenance on Dec 5th, 02:00-04:00 UTC.',
                timestamp: now,
                read: true
            }
        ];

        for (const p of payloads) {
            await notificationService.create(p);
        }

        res.status(201).json({ success: true, created: payloads.length, requestId });
    } catch (error) {
        logger.error('Failed to seed notifications', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        res.status(500).json({ error: 'Failed to seed notifications', requestId });
    }
};


