/**
 * Token Blacklist Service
 * 
 * Gap #7 Remediation (October 20, 2025)
 * ACP-240 Best Practices: Immediate revocation and stale access prevention
 * 
 * Implements Redis-based token blacklist for real-time revocation.
 * Ensures users cannot access resources after logout.
 * 
 * Reference: docs/KEYCLOAK-CONFIGURATION-AUDIT.md (Gap #7)
 */

import Redis from 'ioredis';
import { logger } from '../utils/logger';

// Redis client (singleton)
let redisClient: Redis | null = null;

/**
 * Get or create Redis client
 */
function getRedisClient(): Redis {
    if (!redisClient) {
        const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';

        logger.info('Initializing Redis client for token blacklist', { redisUrl });

        redisClient = new Redis(redisUrl, {
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                logger.warn('Redis connection retry', { attempt: times, delayMs: delay });
                return delay;
            },
            maxRetriesPerRequest: 3
        });

        redisClient.on('connect', () => {
            logger.info('Redis connected for token blacklist');
        });

        redisClient.on('error', (error) => {
            logger.error('Redis error', { error: error.message });
        });
    }

    return redisClient;
}

/**
 * Add token to blacklist (on logout or manual revocation)
 * 
 * @param jti - JWT ID (jti claim from token)
 * @param expiresIn - Seconds until token naturally expires
 * @param reason - Reason for revocation (optional)
 */
export const blacklistToken = async (
    jti: string,
    expiresIn: number,
    reason?: string
): Promise<void> => {
    if (!jti) {
        logger.warn('Cannot blacklist token without jti claim');
        return;
    }

    const redis = getRedisClient();

    try {
        await redis.set(
            `blacklist:${jti}`,
            JSON.stringify({
                revokedAt: new Date().toISOString(),
                reason: reason || 'User logout',
                expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString()
            }),
            'EX',
            expiresIn
        );

        logger.info('Token blacklisted', {
            jti,
            expiresIn,
            reason: reason || 'User logout'
        });
    } catch (error) {
        logger.error('Failed to blacklist token', {
            jti,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        throw error;
    }
};

/**
 * Check if token is blacklisted
 * 
 * @param jti - JWT ID to check
 * @returns true if token is revoked, false otherwise
 */
export const isTokenBlacklisted = async (jti: string): Promise<boolean> => {
    if (!jti) {
        return false;  // Can't check without jti
    }

    const redis = getRedisClient();

    try {
        const result = await redis.get(`blacklist:${jti}`);

        if (result) {
            const blacklistEntry = JSON.parse(result);
            logger.debug('Token found in blacklist', {
                jti,
                revokedAt: blacklistEntry.revokedAt,
                reason: blacklistEntry.reason
            });
            return true;
        }

        return false;
    } catch (error) {
        logger.error('Failed to check token blacklist', {
            jti,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        // Fail-closed: If Redis is down, treat as blacklisted to be safe
        return true;
    }
};

/**
 * Revoke all tokens for a user (on logout or account suspension)
 * 
 * @param uniqueID - User's uniqueID
 * @param expiresIn - Seconds until revocation expires (default: 900 = 15 minutes)
 * @param reason - Reason for revocation
 */
export const revokeAllUserTokens = async (
    uniqueID: string,
    expiresIn: number = 900,
    reason?: string
): Promise<void> => {
    if (!uniqueID) {
        logger.warn('Cannot revoke user tokens without uniqueID');
        return;
    }

    const redis = getRedisClient();

    try {
        await redis.set(
            `user-revoked:${uniqueID}`,
            JSON.stringify({
                revokedAt: new Date().toISOString(),
                reason: reason || 'User logout',
                expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString()
            }),
            'EX',
            expiresIn
        );

        logger.info('All user tokens revoked', {
            uniqueID,
            expiresIn,
            reason: reason || 'User logout'
        });
    } catch (error) {
        logger.error('Failed to revoke user tokens', {
            uniqueID,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        throw error;
    }
};

/**
 * Check if all user tokens are revoked
 * 
 * @param uniqueID - User's uniqueID to check
 * @returns true if all user tokens revoked, false otherwise
 */
export const areUserTokensRevoked = async (uniqueID: string): Promise<boolean> => {
    if (!uniqueID) {
        return false;
    }

    const redis = getRedisClient();

    try {
        const result = await redis.get(`user-revoked:${uniqueID}`);

        if (result) {
            const revocationEntry = JSON.parse(result);
            logger.debug('User tokens globally revoked', {
                uniqueID,
                revokedAt: revocationEntry.revokedAt,
                reason: revocationEntry.reason
            });
            return true;
        }

        return false;
    } catch (error) {
        logger.error('Failed to check user token revocation', {
            uniqueID,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        // Fail-closed: If Redis is down, treat as revoked to be safe
        return true;
    }
};

/**
 * Get blacklist statistics (for monitoring)
 */
export const getBlacklistStats = async (): Promise<{
    totalBlacklistedTokens: number;
    totalRevokedUsers: number;
}> => {
    const redis = getRedisClient();

    try {
        const tokenKeys = await redis.keys('blacklist:*');
        const userKeys = await redis.keys('user-revoked:*');

        return {
            totalBlacklistedTokens: tokenKeys.length,
            totalRevokedUsers: userKeys.length
        };
    } catch (error) {
        logger.error('Failed to get blacklist stats', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        return {
            totalBlacklistedTokens: 0,
            totalRevokedUsers: 0
        };
    }
};

/**
 * Clear all blacklist entries (for testing only)
 * @internal
 */
export const clearBlacklist = async (): Promise<void> => {
    const redis = getRedisClient();

    try {
        const tokenKeys = await redis.keys('blacklist:*');
        const userKeys = await redis.keys('user-revoked:*');

        if (tokenKeys.length > 0) {
            await redis.del(...tokenKeys);
        }

        if (userKeys.length > 0) {
            await redis.del(...userKeys);
        }

        logger.info('Blacklist cleared', {
            tokensCleared: tokenKeys.length,
            usersCleared: userKeys.length
        });
    } catch (error) {
        logger.error('Failed to clear blacklist', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        throw error;
    }
};

/**
 * Close Redis connection (for graceful shutdown)
 */
export const closeRedisConnection = async (): Promise<void> => {
    if (redisClient) {
        await redisClient.quit();
        redisClient = null;
        logger.info('Redis connection closed');
    }
};


