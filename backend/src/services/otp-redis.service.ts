/**
 * OTP Redis Service
 * 
 * Manages pending OTP secrets using Redis with TTL expiration.
 * This replaces storing pending secrets in Keycloak user attributes
 * to avoid conflicts with Terraform-managed resources.
 * 
 * Architecture:
 * 1. Backend validates OTP code and stores secret in Redis (10-min TTL)
 * 2. Custom SPI queries backend API for pending secret on next login
 * 3. SPI creates OTP credential, backend removes from Redis
 * 
 * Benefits:
 * - No conflict with Terraform lifecycle management
 * - Automatic expiration (10 minutes)
 * - Stateless architecture (scales horizontally)
 * - Audit trail via structured logging
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

        logger.info('Initializing Redis client for OTP pending secrets', { redisUrl });

        redisClient = new Redis(redisUrl, {
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                logger.warn('Redis connection retry', { attempt: times, delayMs: delay });
                return delay;
            },
            maxRetriesPerRequest: 3
        });

        redisClient.on('connect', () => {
            logger.info('Redis connected for OTP pending secrets');
        });

        redisClient.on('error', (error) => {
            logger.error('Redis error (OTP service)', { error: error.message });
        });
    }

    return redisClient;
}

/**
 * Store pending OTP secret in Redis
 * 
 * @param userId - User ID from Keycloak
 * @param secret - Base32-encoded TOTP secret
 * @param ttlSeconds - Time to live (default: 600 = 10 minutes)
 * @returns Promise<boolean> - Success status
 */
export const storePendingOTPSecret = async (
    userId: string,
    secret: string,
    ttlSeconds: number = 600
): Promise<boolean> => {
    if (!userId || !secret) {
        logger.warn('Cannot store pending OTP secret without userId and secret');
        return false;
    }

    const redis = getRedisClient();

    try {
        const key = `otp:pending:${userId}`;
        const value = JSON.stringify({
            secret,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString()
        });

        await redis.set(key, value, 'EX', ttlSeconds);

        logger.info('Pending OTP secret stored in Redis', {
            userId,
            ttlSeconds,
            expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString()
        });

        return true;
    } catch (error) {
        logger.error('Failed to store pending OTP secret in Redis', {
            userId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        return false;
    }
};

/**
 * Get pending OTP secret from Redis
 * 
 * @param userId - User ID from Keycloak
 * @returns Promise<string | null> - Base32-encoded secret or null if not found/expired
 */
export const getPendingOTPSecret = async (userId: string): Promise<string | null> => {
    if (!userId) {
        return null;
    }

    const redis = getRedisClient();

    try {
        const key = `otp:pending:${userId}`;
        const value = await redis.get(key);

        if (!value) {
            logger.debug('No pending OTP secret found in Redis', { userId });
            return null;
        }

        const parsed = JSON.parse(value);
        logger.info('Pending OTP secret retrieved from Redis', {
            userId,
            createdAt: parsed.createdAt,
            expiresAt: parsed.expiresAt
        });

        return parsed.secret;
    } catch (error) {
        logger.error('Failed to get pending OTP secret from Redis', {
            userId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        return null;
    }
};

/**
 * Remove pending OTP secret from Redis
 * Called after SPI successfully creates OTP credential
 * 
 * @param userId - User ID from Keycloak
 * @returns Promise<boolean> - Success status
 */
export const removePendingOTPSecret = async (userId: string): Promise<boolean> => {
    if (!userId) {
        return false;
    }

    const redis = getRedisClient();

    try {
        const key = `otp:pending:${userId}`;
        const deleted = await redis.del(key);

        logger.info('Pending OTP secret removed from Redis', {
            userId,
            deleted: deleted > 0
        });

        return deleted > 0;
    } catch (error) {
        logger.error('Failed to remove pending OTP secret from Redis', {
            userId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        return false;
    }
};

/**
 * Check if user has pending OTP secret
 * 
 * @param userId - User ID from Keycloak
 * @returns Promise<boolean> - True if pending secret exists
 */
export const hasPendingOTPSecret = async (userId: string): Promise<boolean> => {
    if (!userId) {
        return false;
    }

    const redis = getRedisClient();

    try {
        const key = `otp:pending:${userId}`;
        const exists = await redis.exists(key);

        return exists === 1;
    } catch (error) {
        logger.error('Failed to check pending OTP secret in Redis', {
            userId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        return false;
    }
};

/**
 * Get OTP pending secrets statistics (for monitoring)
 */
export const getOTPPendingStats = async (): Promise<{
    totalPendingSecrets: number;
    oldestSecret: string | null;
    newestSecret: string | null;
}> => {
    const redis = getRedisClient();

    try {
        const keys = await redis.keys('otp:pending:*');
        
        let oldestSecret: string | null = null;
        let newestSecret: string | null = null;
        let oldestTime: Date | null = null;
        let newestTime: Date | null = null;

        for (const key of keys) {
            const value = await redis.get(key);
            if (value) {
                const parsed = JSON.parse(value);
                const createdAt = new Date(parsed.createdAt);

                if (!oldestTime || createdAt < oldestTime) {
                    oldestTime = createdAt;
                    oldestSecret = parsed.createdAt;
                }

                if (!newestTime || createdAt > newestTime) {
                    newestTime = createdAt;
                    newestSecret = parsed.createdAt;
                }
            }
        }

        return {
            totalPendingSecrets: keys.length,
            oldestSecret,
            newestSecret
        };
    } catch (error) {
        logger.error('Failed to get OTP pending stats', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        return {
            totalPendingSecrets: 0,
            oldestSecret: null,
            newestSecret: null
        };
    }
};

/**
 * Clear all pending OTP secrets (for testing only)
 * @internal
 */
export const clearAllPendingOTPSecrets = async (): Promise<void> => {
    const redis = getRedisClient();

    try {
        const keys = await redis.keys('otp:pending:*');

        if (keys.length > 0) {
            await redis.del(...keys);
        }

        logger.info('All pending OTP secrets cleared', {
            count: keys.length
        });
    } catch (error) {
        logger.error('Failed to clear pending OTP secrets', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        throw error;
    }
};

/**
 * Close Redis connection (for graceful shutdown)
 */
export const closeOTPRedisConnection = async (): Promise<void> => {
    if (redisClient) {
        await redisClient.quit();
        redisClient = null;
        logger.info('OTP Redis connection closed');
    }
};
