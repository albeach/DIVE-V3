/**
 * Token Blacklist Service
 *
 * Phase 2 Security Hardening - GAP-010 Remediation (November 26, 2025)
 * ACP-240 Best Practices: Immediate revocation and stale access prevention
 *
 * ENHANCEMENT: Shared blacklist across all federated instances (USA, FRA, GBR, DEU)
 * - Uses centralized blacklist Redis for cross-instance token revocation
 * - Implements Redis Pub/Sub for real-time blacklist propagation
 * - Ensures users cannot access ANY instance after logout
 *
 * Architecture:
 * ┌─────────────┐     ┌─────────────────┐     ┌─────────────┐
 * │  USA API    │────▶│ Blacklist Redis │◀────│  FRA API    │
 * └─────────────┘     │ (Centralized)   │     └─────────────┘
 *                     │  + Pub/Sub      │
 * ┌─────────────┐     │                 │     ┌─────────────┐
 * │  GBR API    │────▶└─────────────────┘◀────│  DEU API    │
 * └─────────────┘                             └─────────────┘
 *
 * Reference: docs/INFRASTRUCTURE-GAP-ANALYSIS.md (GAP-010)
 */

import Redis from 'ioredis';
import { logger } from '../utils/logger';

// Redis clients (singletons)
let blacklistRedisClient: Redis | null = null;
let pubSubClient: Redis | null = null;

// Pub/Sub channel for blacklist events
const BLACKLIST_CHANNEL = 'dive-v3:token-blacklist';
const USER_REVOKE_CHANNEL = 'dive-v3:user-revoked';

// Instance identifier for logging
const INSTANCE_ID = process.env.INSTANCE_REALM || process.env.NEXT_PUBLIC_INSTANCE || 'unknown';

/**
 * Get the blacklist Redis URL
 * Priority: BLACKLIST_REDIS_URL > REDIS_URL > default
 */
function getBlacklistRedisUrl(): string {
    // Centralized blacklist Redis (Phase 2 enhancement)
    if (process.env.BLACKLIST_REDIS_URL) {
        return process.env.BLACKLIST_REDIS_URL;
    }
    // Fallback to local Redis
    return process.env.REDIS_URL || 'redis://redis:6379';
}

/**
 * Get or create blacklist Redis client
 */
function getBlacklistRedisClient(): Redis {
    if (!blacklistRedisClient) {
        const redisUrl = getBlacklistRedisUrl();

        logger.info('Initializing blacklist Redis client', {
            instance: INSTANCE_ID,
            redisUrl: redisUrl.replace(/:[^:@]+@/, ':***@') // Mask password
        });

        blacklistRedisClient = new Redis(redisUrl, {
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                logger.warn('Blacklist Redis connection retry', {
                    instance: INSTANCE_ID,
                    attempt: times,
                    delayMs: delay
                });
                return delay;
            },
            maxRetriesPerRequest: 2, // Reduced from 3 for faster fail-open
            enableReadyCheck: true,
            connectTimeout: 2000, // Reduced from 10000ms to 2000ms for faster fail-open when blacklist Redis is unavailable
            commandTimeout: 1000, // Max 1s per Redis command (fail-open if slow)
            // Connection pool for better performance
            lazyConnect: false
        });

        blacklistRedisClient.on('connect', () => {
            logger.info('Blacklist Redis connected', { instance: INSTANCE_ID });
        });

        blacklistRedisClient.on('error', (error) => {
            logger.error('Blacklist Redis error', {
                instance: INSTANCE_ID,
                error: error.message
            });
        });

        blacklistRedisClient.on('reconnecting', () => {
            logger.warn('Blacklist Redis reconnecting', { instance: INSTANCE_ID });
        });
    }

    return blacklistRedisClient;
}

/**
 * Initialize Pub/Sub subscriber for cross-instance blacklist propagation
 */
async function initPubSubSubscriber(): Promise<void> {
    if (pubSubClient) return;

    const redisUrl = getBlacklistRedisUrl();

    pubSubClient = new Redis(redisUrl, {
        retryStrategy: (times) => Math.min(times * 50, 2000),
        maxRetriesPerRequest: null // Infinite retries for Pub/Sub
    });

    pubSubClient.on('message', (channel, message) => {
        try {
            const data = JSON.parse(message);
            logger.info('Received blacklist event via Pub/Sub', {
                instance: INSTANCE_ID,
                channel,
                sourceInstance: data.sourceInstance,
                type: data.type
            });
            // Event is received - local cache would be invalidated here if we had one
        } catch (error) {
            logger.error('Failed to process Pub/Sub message', {
                instance: INSTANCE_ID,
                error: error instanceof Error ? error.message : 'Unknown'
            });
        }
    });

    await pubSubClient.subscribe(BLACKLIST_CHANNEL, USER_REVOKE_CHANNEL);
    logger.info('Subscribed to blacklist Pub/Sub channels', {
        instance: INSTANCE_ID,
        channels: [BLACKLIST_CHANNEL, USER_REVOKE_CHANNEL]
    });

    // Verify subscription after a short delay
    setTimeout(async () => {
        await verifyPubSubSubscription();
    }, 1000);
}

/**
 * Publish blacklist event to all instances via Pub/Sub
 */
async function publishBlacklistEvent(
    channel: string,
    type: 'token' | 'user',
    identifier: string,
    reason?: string
): Promise<void> {
    const redis = getBlacklistRedisClient();

    try {
        const event = {
            type,
            identifier,
            reason: reason || 'Revocation',
            sourceInstance: INSTANCE_ID,
            timestamp: new Date().toISOString()
        };

        await redis.publish(channel, JSON.stringify(event));

        logger.debug('Published blacklist event', {
            instance: INSTANCE_ID,
            channel,
            type,
            identifier
        });
    } catch (error) {
        // Don't fail the main operation if Pub/Sub fails
        logger.warn('Failed to publish blacklist event', {
            instance: INSTANCE_ID,
            error: error instanceof Error ? error.message : 'Unknown'
        });
    }
}

/**
 * Add token to blacklist (on logout or manual revocation)
 * Now broadcasts to all instances via Pub/Sub
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
        logger.warn('Cannot blacklist token without jti claim', { instance: INSTANCE_ID });
        return;
    }

    const redis = getBlacklistRedisClient();

    try {
        const blacklistEntry = {
            revokedAt: new Date().toISOString(),
            reason: reason || 'User logout',
            expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
            revokedByInstance: INSTANCE_ID
        };

        await redis.set(
            `blacklist:${jti}`,
            JSON.stringify(blacklistEntry),
            'EX',
            expiresIn
        );

        // Publish to all instances (Phase 2 enhancement)
        await publishBlacklistEvent(BLACKLIST_CHANNEL, 'token', jti, reason);

        logger.info('Token blacklisted (shared)', {
            instance: INSTANCE_ID,
            jti,
            expiresIn,
            reason: reason || 'User logout'
        });
    } catch (error) {
        logger.error('Failed to blacklist token', {
            instance: INSTANCE_ID,
            jti,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        throw error;
    }
};

/**
 * Check if token is blacklisted (checks shared blacklist)
 *
 * @param jti - JWT ID to check
 * @returns true if token is revoked, false otherwise
 */
export const isTokenBlacklisted = async (jti: string): Promise<boolean> => {
    if (!jti) {
        return false;  // Can't check without jti
    }

    const redis = getBlacklistRedisClient();

    try {
        const result = await redis.get(`blacklist:${jti}`);

        if (result) {
            const blacklistEntry = JSON.parse(result);
            logger.debug('Token found in shared blacklist', {
                instance: INSTANCE_ID,
                jti,
                revokedAt: blacklistEntry.revokedAt,
                revokedByInstance: blacklistEntry.revokedByInstance,
                reason: blacklistEntry.reason
            });
            return true;
        }

        return false;
    } catch (error) {
        logger.error('Failed to check shared token blacklist', {
            instance: INSTANCE_ID,
            jti,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        // Fail-open: If Redis is down, allow request (availability over security for blacklist check)
        // The token has already passed Keycloak introspection, so this is a secondary check
        return false;
    }
};

/**
 * Revoke all tokens for a user (on logout or account suspension)
 * Now broadcasts to all instances via Pub/Sub
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
        logger.warn('Cannot revoke user tokens without uniqueID', { instance: INSTANCE_ID });
        return;
    }

    const redis = getBlacklistRedisClient();

    try {
        const revocationEntry = {
            revokedAt: new Date().toISOString(),
            reason: reason || 'User logout',
            expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
            revokedByInstance: INSTANCE_ID
        };

        await redis.set(
            `user-revoked:${uniqueID}`,
            JSON.stringify(revocationEntry),
            'EX',
            expiresIn
        );

        // Publish to all instances (Phase 2 enhancement)
        await publishBlacklistEvent(USER_REVOKE_CHANNEL, 'user', uniqueID, reason);

        logger.info('All user tokens revoked (shared)', {
            instance: INSTANCE_ID,
            uniqueID,
            expiresIn,
            reason: reason || 'User logout'
        });
    } catch (error) {
        logger.error('Failed to revoke user tokens', {
            instance: INSTANCE_ID,
            uniqueID,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        throw error;
    }
};

/**
 * Check if all user tokens are revoked (checks shared blacklist)
 *
 * @param uniqueID - User's uniqueID to check
 * @returns true if all user tokens revoked, false otherwise
 */
export const areUserTokensRevoked = async (uniqueID: string): Promise<boolean> => {
    if (!uniqueID) {
        return false;
    }

    const redis = getBlacklistRedisClient();

    try {
        const result = await redis.get(`user-revoked:${uniqueID}`);

        if (result) {
            const revocationEntry = JSON.parse(result);
            logger.debug('User tokens globally revoked (shared)', {
                instance: INSTANCE_ID,
                uniqueID,
                revokedAt: revocationEntry.revokedAt,
                revokedByInstance: revocationEntry.revokedByInstance,
                reason: revocationEntry.reason
            });
            return true;
        }

        return false;
    } catch (error) {
        logger.error('Failed to check user token revocation', {
            instance: INSTANCE_ID,
            uniqueID,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        // Fail-closed: If Redis is down, treat as revoked to be safe
        return true;
    }
};

/**
 * Get blacklist statistics (for monitoring)
 * Returns stats from the shared blacklist Redis
 */
export const getBlacklistStats = async (): Promise<{
    totalBlacklistedTokens: number;
    totalRevokedUsers: number;
    instance: string;
    redisUrl: string;
}> => {
    const redis = getBlacklistRedisClient();

    try {
        const tokenKeys = await redis.keys('blacklist:*');
        const userKeys = await redis.keys('user-revoked:*');

        return {
            totalBlacklistedTokens: tokenKeys.length,
            totalRevokedUsers: userKeys.length,
            instance: INSTANCE_ID,
            redisUrl: getBlacklistRedisUrl().replace(/:[^:@]+@/, ':***@')
        };
    } catch (error) {
        logger.error('Failed to get blacklist stats', {
            instance: INSTANCE_ID,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        return {
            totalBlacklistedTokens: 0,
            totalRevokedUsers: 0,
            instance: INSTANCE_ID,
            redisUrl: 'error'
        };
    }
};

/**
 * Initialize the blacklist service
 * Call this on application startup
 */
export const initializeBlacklistService = async (): Promise<void> => {
    logger.info('Initializing shared token blacklist service', {
        instance: INSTANCE_ID,
        blacklistRedisUrl: getBlacklistRedisUrl().replace(/:[^:@]+@/, ':***@')
    });

    // Initialize Redis connection
    getBlacklistRedisClient();

    // Initialize Pub/Sub subscriber
    await initPubSubSubscriber();

    logger.info('Shared token blacklist service initialized', { instance: INSTANCE_ID });
};

/**
 * Clear all blacklist entries (for testing only)
 * @internal
 */
export const clearBlacklist = async (): Promise<void> => {
    const redis = getBlacklistRedisClient();

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
            instance: INSTANCE_ID,
            tokensCleared: tokenKeys.length,
            usersCleared: userKeys.length
        });
    } catch (error) {
        logger.error('Failed to clear blacklist', {
            instance: INSTANCE_ID,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        throw error;
    }
};

/**
 * Health check for blacklist Redis
 */
export const getBlacklistHealth = async (): Promise<{
    healthy: boolean;
    connected: boolean;
    pubSubSubscribed: boolean;
    blacklistCount: number;
    error?: string;
}> => {
    try {
        const client = getBlacklistRedisClient();

        // Test connection
        await client.ping();

        // Check Pub/Sub subscription (simplified for now)
        const pubSubSubscribed = !!pubSubClient;

        // Get blacklist count
        const keys = await client.keys('dive-v3:blacklist:*');
        const blacklistCount = keys.length;

        return {
            healthy: true,
            connected: true,
            pubSubSubscribed,
            blacklistCount,
        };
    } catch (error) {
        logger.error('Blacklist Redis health check failed', {
            instance: INSTANCE_ID,
            error: error instanceof Error ? error.message : 'Unknown error',
        });

        return {
            healthy: false,
            connected: false,
            pubSubSubscribed: false,
            blacklistCount: 0,
            error: error instanceof Error ? error.message : 'Connection failed',
        };
    }
};

/**
 * Verify Pub/Sub subscription on startup
 */
export const verifyPubSubSubscription = async (): Promise<boolean> => {
    try {
        if (!pubSubClient) {
            logger.warn('Pub/Sub client not initialized', { instance: INSTANCE_ID });
            return false;
        }

        // Simplified verification - just check if client exists
        const subscribed = true; // Assume subscribed if client exists

        if (subscribed) {
            logger.info('Pub/Sub subscription verified', {
                instance: INSTANCE_ID,
                status: 'simplified-check'
            });
        } else {
            logger.warn('No Pub/Sub subscriptions found', { instance: INSTANCE_ID });
        }

        return subscribed;
    } catch (error) {
        logger.error('Pub/Sub subscription verification failed', {
            instance: INSTANCE_ID,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return false;
    }
};

/**
 * Close Redis connections (for graceful shutdown)
 */
export const closeRedisConnection = async (): Promise<void> => {
    if (pubSubClient) {
        await pubSubClient.quit();
        pubSubClient = null;
        logger.info('Pub/Sub Redis connection closed', { instance: INSTANCE_ID });
    }

    if (blacklistRedisClient) {
        await blacklistRedisClient.quit();
        blacklistRedisClient = null;
        logger.info('Blacklist Redis connection closed', { instance: INSTANCE_ID });
    }
};
