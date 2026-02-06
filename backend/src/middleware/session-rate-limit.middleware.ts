import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';
import { Request, Response } from 'express';
import { logger } from '../utils/logger';

/**
 * Session Management Rate Limiters
 * Phase 2: Security Hardening
 * 
 * BEST PRACTICE: Stricter limits for session operations to prevent:
 * - Brute force token refresh attacks
 * - DoS via session manipulation
 * - Automated session harvesting
 * 
 * Reference: docs/session-management.md
 */

// Instance identifier for distributed logging
const INSTANCE_ID = process.env.INSTANCE_CODE || process.env.NEXT_PUBLIC_INSTANCE || 'unknown';

/**
 * Create Redis store for rate limiting with fallback to memory store
 */
const createSessionRateLimitStore = (prefix: string) => {
    try {
        const redisUrl = process.env.REDIS_URL;

        if (redisUrl) {
            const redisClient = new Redis(redisUrl, {
                keyPrefix: `dive-v3:rate-limit:session:${prefix}:`,
                retryStrategy: (times) => Math.min(times * 50, 2000),
                maxRetriesPerRequest: 3,
                lazyConnect: false,
                connectTimeout: 5000,
            });

            // Test connection
            redisClient.ping().catch((error) => {
                logger.warn(`Redis store unavailable for session ${prefix} rate limiting`, {
                    error: error.message,
                    prefix,
                    instance: INSTANCE_ID
                });
                return null;
            });

            logger.info(`Using Redis store for session ${prefix} rate limiting`, { instance: INSTANCE_ID });
            return new RedisStore({
                // @ts-ignore - rate-limit-redis has type issues with ioredis
                sendCommand: (...args: string[]) => redisClient.call(...args),
                prefix: `dive-v3:rate-limit:session:${prefix}`,
            });
        } else {
            logger.warn(`REDIS_URL not configured, using memory store for session ${prefix} rate limiting`, { instance: INSTANCE_ID });
            return undefined; // Will use default memory store
        }
    } catch (error) {
        logger.error(`Failed to create Redis store for session ${prefix} rate limiting`, {
            error: (error as Error).message,
            prefix,
            instance: INSTANCE_ID
        });
        return undefined; // Will use default memory store
    }
};

/**
 * Skip rate limiting for health checks and whitelisted IPs
 */
const skipSessionRateLimiting = (req: Request): boolean => {
    // Skip for health checks
    if (req.path === '/api/health' || req.path.includes('/health')) {
        return true;
    }

    // Skip for whitelisted IPs (if configured)
    const whitelistedIPs = process.env.RATE_LIMIT_WHITELIST?.split(',') || [];
    const clientIP = req.ip || req.socket.remoteAddress;
    if (clientIP && whitelistedIPs.includes(clientIP)) {
        logger.debug('Skipping session rate limit for whitelisted IP', { 
            ip: clientIP,
            instance: INSTANCE_ID
        });
        return true;
    }

    return false;
};

/**
 * Session Refresh Rate Limiter
 * Applied to: POST /api/session/refresh
 * 
 * Limits: 10 refresh attempts per 5 minutes per user
 * Rationale: Normal token lifetime is 15 min, auto-refresh at 7 min remaining
 *            10 attempts allows for retries but prevents abuse
 * 
 * SECURITY: Uses user ID + IP for accurate tracking
 */
export const sessionRefreshRateLimiter: RateLimitRequestHandler = rateLimit({
    windowMs: parseInt(process.env.SESSION_REFRESH_RATE_LIMIT_WINDOW_MS || '300000', 10), // 5 minutes
    max: parseInt(process.env.SESSION_REFRESH_RATE_LIMIT_MAX || '10', 10), // 10 attempts
    message: 'Too many session refresh attempts',
    standardHeaders: true,
    legacyHeaders: false,
    store: createSessionRateLimitStore('refresh'),
    skip: skipSessionRateLimiting,
    skipSuccessfulRequests: false, // Count all refresh attempts (including successful)
    
    // Key generator: Use user ID from session or IP as fallback
    keyGenerator: (req: Request): string => {
        // For session routes, we need to extract user ID from NextAuth session
        // This requires reading session from database or cookie
        // For now, use IP + session cookie hash as key
        const sessionCookie = req.cookies?.['authjs.session-token'];
        
        if (sessionCookie) {
            // Hash the session cookie for privacy
            const crypto = require('crypto');
            const sessionHash = crypto.createHash('sha256').update(sessionCookie).digest('hex').substring(0, 16);
            return `session:${sessionHash}:${req.ip || 'unknown'}`;
        }
        
        // Fallback to IP only
        return `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
    },
    
    handler: (req: Request, res: Response): void => {
        const requestId = req.headers['x-request-id'] as string;
        const sessionCookie = req.cookies?.['authjs.session-token'];

        logger.warn('Session refresh rate limit exceeded', {
            requestId,
            ip: req.ip || req.socket.remoteAddress,
            hasSession: !!sessionCookie,
            userAgent: req.headers['user-agent'],
            timestamp: new Date().toISOString(),
            instance: INSTANCE_ID,
            severity: 'MEDIUM'
        });

        // Record rate limit block metric
        try {
            import('../services/prometheus-metrics.service').then(({ prometheusMetrics }) => {
                prometheusMetrics.recordRateLimitBlock('session_refresh');
            }).catch(() => {
                // Ignore metric recording errors
            });
        } catch {
            // Ignore
        }

        res.status(429).json({
            success: false,
            error: 'TooManyRequests',
            message: 'Too many session refresh attempts. Please wait a few minutes and try again.',
            details: {
                retryAfter: res.getHeader('Retry-After'),
                limit: 10,
                window: '5 minutes',
                code: 'SESSION_REFRESH_RATE_LIMIT'
            },
            requestId
        });
    }
});

/**
 * Session Health Check Rate Limiter
 * Applied to: GET /api/session/refresh (heartbeat)
 * 
 * Limits: 60 checks per 2 minutes per user (30 req/min)
 * Rationale: Normal heartbeat is 2 minutes (0.5 req/min), critical is 30 seconds (2 req/min)
 *            60 checks allows for multiple tabs and retries
 * 
 * SECURITY: More lenient than refresh since it's read-only
 */
export const sessionHealthRateLimiter: RateLimitRequestHandler = rateLimit({
    windowMs: parseInt(process.env.SESSION_HEALTH_RATE_LIMIT_WINDOW_MS || '120000', 10), // 2 minutes
    max: parseInt(process.env.SESSION_HEALTH_RATE_LIMIT_MAX || '60', 10), // 60 checks
    message: 'Too many session health checks',
    standardHeaders: true,
    legacyHeaders: false,
    store: createSessionRateLimitStore('health'),
    skip: skipSessionRateLimiting,
    skipSuccessfulRequests: false,
    
    keyGenerator: (req: Request): string => {
        const sessionCookie = req.cookies?.['authjs.session-token'];
        
        if (sessionCookie) {
            const crypto = require('crypto');
            const sessionHash = crypto.createHash('sha256').update(sessionCookie).digest('hex').substring(0, 16);
            return `session:${sessionHash}:${req.ip || 'unknown'}`;
        }
        
        return `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
    },
    
    handler: (req: Request, res: Response): void => {
        const requestId = req.headers['x-request-id'] as string;

        logger.warn('Session health check rate limit exceeded', {
            requestId,
            ip: req.ip || req.socket.remoteAddress,
            userAgent: req.headers['user-agent'],
            timestamp: new Date().toISOString(),
            instance: INSTANCE_ID
        });

        res.status(429).json({
            authenticated: false,
            message: 'Too many health check requests. Please reduce polling frequency.',
            details: {
                retryAfter: res.getHeader('Retry-After'),
                limit: 60,
                window: '2 minutes',
                code: 'SESSION_HEALTH_RATE_LIMIT'
            },
            requestId
        });
    }
});

/**
 * Get session rate limiting statistics (for monitoring)
 */
export const getSessionRateLimitStats = async (): Promise<{
    enabled: boolean;
    store: 'redis' | 'memory';
    limits: Record<string, { windowMs: number; max: number; activeKeys?: number }>;
    instance: string;
}> => {
    const enabled = process.env.ENABLE_RATE_LIMITING !== 'false';
    const hasRedis = !!process.env.REDIS_URL;

    const limits: Record<string, { windowMs: number; max: number; activeKeys?: number }> = {
        session_refresh: {
            windowMs: parseInt(process.env.SESSION_REFRESH_RATE_LIMIT_WINDOW_MS || '300000', 10),
            max: parseInt(process.env.SESSION_REFRESH_RATE_LIMIT_MAX || '10', 10)
        },
        session_health: {
            windowMs: parseInt(process.env.SESSION_HEALTH_RATE_LIMIT_WINDOW_MS || '120000', 10),
            max: parseInt(process.env.SESSION_HEALTH_RATE_LIMIT_MAX || '60', 10)
        }
    };

    // If using Redis, try to get active key counts
    if (hasRedis && enabled) {
        try {
            const redisClient = new Redis(process.env.REDIS_URL!, {
                connectTimeout: 5000,
                commandTimeout: 5000,
            });

            for (const [type] of Object.entries(limits)) {
                try {
                    const keys = await redisClient.keys(`dive-v3:rate-limit:session:${type}:*`);
                    limits[type].activeKeys = keys.length;
                } catch (error) {
                    logger.warn(`Failed to get active keys for ${type} session rate limiter`, {
                        error: (error as Error).message,
                        instance: INSTANCE_ID
                    });
                }
            }

            redisClient.disconnect();
        } catch (error) {
            logger.warn('Failed to connect to Redis for session rate limit stats', {
                error: (error as Error).message,
                instance: INSTANCE_ID
            });
        }
    }

    return {
        enabled,
        store: hasRedis ? 'redis' : 'memory',
        limits,
        instance: INSTANCE_ID
    };
};
