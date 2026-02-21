/**
 * Authentication Controller
 * 
 * Gap #7 Remediation (October 20, 2025)
 * Handles authentication-related operations including token revocation
 * 
 * Endpoints:
 * - POST /api/auth/revoke - Revoke current token
 * - POST /api/auth/logout - Revoke all user tokens (global logout)
 * - GET /api/auth/blacklist-stats - Get blacklist statistics
 */

import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import rateLimit, { MemoryStore } from 'express-rate-limit';
import { logger } from '../utils/logger';
import {
    blacklistToken,
    revokeAllUserTokens,
    areUserTokensRevoked,
    getBlacklistStats
} from '../services/token-blacklist.service';
import { authenticateJWT } from '../middleware/authz.middleware';
import { requireAdmin } from '../middleware/admin.middleware';

const router = Router();

/**
 * POST /api/auth/revoke
 * Revoke the current token (single token revocation)
 */
router.post('/revoke', authenticateJWT, async (req: Request, res: Response) => {
    const requestId = req.headers['x-request-id'] as string;
    const user = (req as any).user;
    const authHeader = req.headers.authorization;

    try {
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Missing Authorization header',
                requestId
            });
            return;
        }

        const token = authHeader.substring(7);
        const decoded = jwt.decode(token) as any;

        if (!decoded || !decoded.jti) {
            logger.warn('Token missing jti claim - cannot blacklist', {
                requestId,
                uniqueID: user.uniqueID
            });
            res.status(400).json({
                error: 'Bad Request',
                message: 'Token missing jti claim (cannot revoke)',
                details: {
                    reason: 'JWT must include jti (JWT ID) claim for revocation',
                    recommendation: 'Use newer token with jti claim'
                },
                requestId
            });
            return;
        }

        // Calculate time until token expires
        const exp = decoded.exp;
        const now = Math.floor(Date.now() / 1000);
        const expiresIn = Math.max(0, exp - now);

        // Blacklist the token
        await blacklistToken(decoded.jti, expiresIn, 'User-requested revocation');

        logger.info('Token revoked', {
            requestId,
            uniqueID: user.uniqueID,
            jti: decoded.jti,
            expiresIn,
            triggeredBy: 'manual_revoke'
        });

        res.json({
            success: true,
            message: 'Token revoked successfully',
            details: {
                jti: decoded.jti,
                revokedAt: new Date().toISOString(),
                expiresIn: expiresIn,
                expiresAt: new Date(exp * 1000).toISOString()
            },
            requestId
        });

    } catch (error) {
        logger.error('Token revocation failed', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to revoke token',
            requestId
        });
    }
});

/**
 * POST /api/auth/logout
 * Revoke ALL tokens for the user (global logout)
 */
router.post('/logout', authenticateJWT, async (req: Request, res: Response) => {
    const requestId = req.headers['x-request-id'] as string;
    const user = (req as any).user;

    try {
        // Revoke all user tokens (15-minute window)
        await revokeAllUserTokens(user.uniqueID, 900, 'User logout');

        logger.info('User logged out - all tokens revoked', {
            requestId,
            uniqueID: user.uniqueID,
            triggeredBy: 'user_logout'
        });

        res.json({
            success: true,
            message: 'Logged out successfully',
            details: {
                uniqueID: user.uniqueID,
                revokedAt: new Date().toISOString(),
                allTokensRevokedFor: 900,  // 15 minutes
                recommendation: 'All active sessions terminated. Please clear browser cookies.'
            },
            requestId
        });

    } catch (error) {
        logger.error('Logout failed', {
            requestId,
            uniqueID: user.uniqueID,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to logout',
            requestId
        });
    }
});

/**
 * GET /api/auth/blacklist-stats
 * Get token blacklist statistics (admin only)
 */
router.get('/blacklist-stats', authenticateJWT, requireAdmin, async (req: Request, res: Response) => {
    const requestId = req.headers['x-request-id'] as string;
    const user = (req as any).user;

    try {

        const stats = await getBlacklistStats();

        logger.debug('Blacklist stats requested', {
            requestId,
            uniqueID: user.uniqueID
        });

        res.json({
            success: true,
            stats: {
                totalBlacklistedTokens: stats.totalBlacklistedTokens,
                totalRevokedUsers: stats.totalRevokedUsers,
                timestamp: new Date().toISOString()
            },
            requestId
        });

    } catch (error) {
        logger.error('Failed to get blacklist stats', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to retrieve blacklist statistics',
            requestId
        });
    }
});

/**
 * POST /api/auth/check-revocation
 * Check if a user's tokens are revoked (for debugging)
 */
router.post('/check-revocation', authenticateJWT, async (req: Request, res: Response) => {
    const requestId = req.headers['x-request-id'] as string;
    const user = (req as any).user;
    const { uniqueID: targetUniqueID } = req.body;

    try {
        // Check if specified user (or self) is revoked
        const checkUniqueID = targetUniqueID || user.uniqueID;

        const isRevoked = await areUserTokensRevoked(checkUniqueID);

        logger.debug('Revocation check', {
            requestId,
            checkedUser: checkUniqueID,
            isRevoked
        });

        res.json({
            success: true,
            uniqueID: checkUniqueID,
            isRevoked,
            timestamp: new Date().toISOString(),
            requestId
        });

    } catch (error) {
        logger.error('Revocation check failed', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to check revocation status',
            requestId
        });
    }
});

// ============================================
// Custom Login Routes (Phase 4.2)
// ============================================

import { customLoginHandler, customLoginMFAHandler } from './custom-login.controller';
import { initiateOTPSetup, verifyAndEnableOTP } from './otp-setup.controller';

/**
 * Rate Limit Store for Custom Login (for testing - can be reset)
 */
export const customLoginRateLimitStore = new MemoryStore();

/**
 * Rate Limiting for Custom Login (Brute-Force Protection)
 * - Window: 15 minutes
 * - Max attempts: 5 per IP (stricter than token endpoint)
 * - Response: 429 Too Many Requests
 */
const customLoginRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 login attempts per windowMs
    message: {
        error: 'Too Many Requests',
        message: 'Too many login attempts from this IP, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false,
    store: customLoginRateLimitStore // Use exported store (can be reset in tests)
});

/**
 * POST /api/auth/custom-login
 * Custom login page authentication
 * 
 * Security:
 * - Rate limiting: 5 attempts/15min per IP (brute-force protection)
 */
router.post('/custom-login', customLoginRateLimiter, customLoginHandler);

/**
 * POST /api/auth/custom-login/mfa
 * MFA verification for custom login
 */
router.post('/custom-login/mfa', customLoginMFAHandler);

/**
 * POST /api/auth/otp/setup
 * Initiate OTP setup - returns QR code and secret
 */
router.post('/otp/setup', initiateOTPSetup);

/**
 * POST /api/auth/otp/verify
 * Verify and enable OTP for user
 */
router.post('/otp/verify', verifyAndEnableOTP);

export default router;
