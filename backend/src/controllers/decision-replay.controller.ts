import { Request, Response } from 'express';
import { DecisionReplayService } from '../services/decision-replay.service';
import { IDecisionReplayRequest } from '../types/decision-replay.types';
import { logger } from '../utils/logger';

/**
 * Decision Replay Controller
 * 
 * Handles POST /api/decision-replay requests for UI visualization
 */
export class DecisionReplayController {
    /**
     * POST /api/decision-replay
     * 
     * Returns full OPA evaluation details for decision replay UI
     */
    static async replayDecision(req: Request, res: Response): Promise<void> {
        const startTime = Date.now();

        try {
            const { resourceId, userId, context }: IDecisionReplayRequest = req.body;

            // Validate request
            if (!resourceId) {
                res.status(400).json({
                    error: 'Bad Request',
                    message: 'resourceId is required'
                });
                return;
            }

            // Get user token from request (set by auth middleware)
            const userToken = (req as any).user;
            if (!userToken) {
                res.status(401).json({
                    error: 'Unauthorized',
                    message: 'No valid JWT token'
                });
                return;
            }

            // Call service
            const result = await DecisionReplayService.replayDecision(
                { resourceId, userId, context },
                userToken
            );

            // Log replay request
            logger.info('Decision replay completed', {
                resourceId,
                userId: userId || userToken.sub,
                decision: result.decision,
                latency_ms: Date.now() - startTime,
            });

            res.status(200).json(result);
        } catch (error: any) {
            logger.error('Decision replay controller error', {
                error: error.message,
                stack: error.stack
            });

            if (error.message.includes('not found')) {
                res.status(404).json({
                    error: 'Not Found',
                    message: error.message
                });
            } else {
                res.status(500).json({
                    error: 'Internal Server Error',
                    message: 'Decision replay failed'
                });
            }
        }
    }
}
