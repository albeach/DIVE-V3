import { Router } from 'express';
import { DecisionReplayController } from '../controllers/decision-replay.controller';
import { authenticateJWT } from '../middleware/authz.middleware';

const router = Router();

/**
 * Decision Replay Routes
 * 
 * All routes require valid JWT authentication
 */

/**
 * POST /api/decision-replay
 * 
 * Replay authorization decision with full evaluation details
 * 
 * Body:
 * {
 *   "resourceId": "doc-123",
 *   "userId": "john.doe@mil",  // Optional
 *   "context": {               // Optional
 *     "currentTime": "2025-10-26T14:00:00Z",
 *     "sourceIP": "192.168.1.100"
 *   }
 * }
 * 
 * Response: IDecisionReplayResponse (see decision-replay.types.ts)
 */
router.post('/', authenticateJWT, DecisionReplayController.replayDecision);

export default router;

