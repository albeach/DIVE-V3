import { Router } from 'express';
import { authenticateJWT } from '../middleware/authz.middleware';
import {
    deleteNotificationHandler,
    listNotificationsHandler,
    markAllNotificationsReadHandler,
    markNotificationReadHandler,
    getPreferencesHandler,
    updatePreferencesHandler,
    seedNotificationsHandler
} from '../controllers/notifications.controller';

const router = Router();

router.get('/', authenticateJWT, listNotificationsHandler);
router.post('/read-all', authenticateJWT, markAllNotificationsReadHandler);
router.post('/:id/read', authenticateJWT, markNotificationReadHandler);
router.delete('/:id', authenticateJWT, deleteNotificationHandler);
router.get('/preferences/me', authenticateJWT, getPreferencesHandler);
router.post('/preferences/me', authenticateJWT, updatePreferencesHandler);
router.post('/seed', authenticateJWT, seedNotificationsHandler);

export default router;


