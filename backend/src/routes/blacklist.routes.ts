/**
 * Token Blacklist Routes
 * Phase 2 GAP-007: Session Synchronization
 *
 * @swagger
 * tags:
 *   - name: Authentication
 *     description: Token management and session operations
 */

import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { blacklistToken, revokeAllUserTokens, getBlacklistStats, isTokenBlacklisted } from '../services/token-blacklist.service';
import { logger } from '../utils/logger';

const router = Router();

/**
 * @swagger
 * /api/auth/blacklist-token:
 *   post:
 *     summary: Add token to shared blacklist
 *     description: Called during logout to ensure cross-instance token revocation
 *     tags: [Authentication]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Reason for blacklisting
 *                 example: User logout
 *     responses:
 *       200:
 *         description: Token successfully blacklisted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 jti:
 *                   type: string
 *                 ttl:
 *                   type: number
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/api/auth/blacklist-token', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ error: 'Missing or invalid authorization header' });
            return;
        }

        const token = authHeader.substring(7);
        const reason = req.body.reason || 'User logout';

        // Decode the token to get jti and exp
        const decoded = jwt.decode(token) as jwt.JwtPayload | null;
        if (!decoded) {
            res.status(400).json({ error: 'Invalid token format' });
            return;
        }

        const jti = decoded.jti;
        const uniqueID = decoded.uniqueID || decoded.sub || decoded.preferred_username;
        const exp = decoded.exp;

        if (!jti) {
            // If no JTI, revoke all tokens for the user
            if (uniqueID) {
                logger.info('Revoking all tokens for user (no jti)', {
                    uniqueID,
                    reason,
                    instance: process.env.INSTANCE_REALM
                });
                await revokeAllUserTokens(uniqueID, 900, reason);
                res.json({
                    message: 'All user tokens revoked',
                    uniqueID,
                    reason
                });
                return;
            }
            res.status(400).json({ error: 'Token has no jti claim and no user identifier' });
            return;
        }

        // Calculate TTL (time until token expires)
        const now = Math.floor(Date.now() / 1000);
        const ttl = exp ? Math.max(exp - now, 60) : 900; // Default 15 minutes if no exp

        // Add to shared blacklist
        await blacklistToken(jti, ttl, reason);

        // Also revoke all user tokens if we have uniqueID
        if (uniqueID) {
            await revokeAllUserTokens(uniqueID, ttl, reason);
        }

        logger.info('Token blacklisted via API', {
            jti,
            uniqueID,
            ttl,
            reason,
            instance: process.env.INSTANCE_REALM
        });

        res.json({
            message: 'Token blacklisted',
            jti,
            uniqueID,
            ttl,
            reason
        });
    } catch (error) {
        logger.error('Token blacklist API error', {
            error: error instanceof Error ? error.message : 'Unknown error',
            instance: process.env.INSTANCE_REALM
        });
        next(error);
    }
});

/**
 * GET /api/blacklist/stats
 * Get blacklist statistics for monitoring
 */
router.get('/api/blacklist/stats', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const stats = await getBlacklistStats();
        res.json(stats);
    } catch (error) {
        logger.error('Blacklist stats error', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        next(error);
    }
});

/**
 * POST /api/blacklist/check
 * Check if a token is blacklisted (for debugging/testing)
 */
router.post('/api/blacklist/check', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { jti } = req.body;
        if (!jti) {
            res.status(400).json({ error: 'jti is required' });
            return;
        }

        const isBlacklisted = await isTokenBlacklisted(jti);
        res.json({
            jti,
            isBlacklisted
        });
    } catch (error) {
        logger.error('Blacklist check error', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        next(error);
    }
});

export default router;
