import { Router } from 'express';
import { authenticateJWT } from '../middleware/authz.middleware';
import { notificationService } from '../services/notification.service';

const router = Router();

router.get('/', authenticateJWT, async (req: any, res) => {
    const requestId = req.headers['x-request-id'] as string;
    const userId = req.user?.uniqueID;

    if (!userId) {
        res.status(401).json({ error: 'Unauthorized', requestId });
        return;
    }

    try {
        const unreadCount = await notificationService.unreadCount(userId);
        res.status(200).json({ success: true, unreadCount, requestId });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get unread count', requestId });
    }
});

export default router;




