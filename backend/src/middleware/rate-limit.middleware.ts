import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';
import { Request, Response } from 'express';
import { logger } from '../utils/logger';

// ============================================
// Rate Limiting Middleware (Phase 4 - Redis Store)
// ============================================
// Purpose: Protect against DoS attacks and abuse with distributed rate limiting
// Strategy: Different limits for different endpoint types
// Storage: Redis-backed for horizontal scaling with memory fallback

/**
 * Create Redis store for rate limiting with fallback to memory store
 */
const createRateLimitStore = (prefix: string) => {
    try {
        const redisUrl = process.env.REDIS_URL;

        if (redisUrl) {
            const redisClient = new Redis(redisUrl, {
                keyPrefix: `dive-v3:rate-limit:${prefix}:`,
                retryStrategy: (times) => Math.min(times * 50, 2000),
                maxRetriesPerRequest: 3,
                lazyConnect: false,
                connectTimeout: 5000,
            });

            // Test connection
            redisClient.ping().catch((error) => {
                logger.warn(`Redis store unavailable for ${prefix} rate limiting, falling back to memory`, {
                    error: error.message,
                    prefix
                });
                return null;
            });

            logger.info(`Using Redis store for ${prefix} rate limiting`);
            return new RedisStore({
                // @ts-ignore - rate-limit-redis has type issues with ioredis
                sendCommand: (...args: string[]) => redisClient.call(...args),
                prefix: `dive-v3:rate-limit:${prefix}`,
            });
        } else {
            logger.warn(`REDIS_URL not configured, using memory store for ${prefix} rate limiting`);
            return undefined; // Will use default memory store
        }
    } catch (error) {
        logger.error(`Failed to create Redis store for ${prefix} rate limiting, using memory store`, {
            error: (error as Error).message,
            prefix
        });
        return undefined; // Will use default memory store
    }
};

/**
 * Custom rate limit handler that logs violations and records metrics
 */
const rateLimitHandler = (req: Request, res: Response): void => {
    const requestId = req.headers['x-request-id'] as string;

    logger.warn('Rate limit exceeded', {
        requestId,
        ip: req.ip || req.socket.remoteAddress,
        path: req.path,
        method: req.method,
        userAgent: req.headers['user-agent'],
        timestamp: new Date().toISOString()
    });

    // Record rate limit block metric (async, don't wait)
    try {
        import('../services/prometheus-metrics.service').then(({ prometheusMetrics }) => {
            // Determine limiter type from path
            let limiterType = 'api';
            if (req.path.includes('/auth/') || req.path.includes('/login')) {
                limiterType = 'auth';
            } else if (req.path.includes('/upload')) {
                limiterType = 'upload';
            } else if (req.path.includes('/admin')) {
                limiterType = 'admin';
            }

            prometheusMetrics.recordRateLimitBlock(limiterType);
        }).catch((error) => {
            logger.error('Failed to record rate limit block metric', { error: error.message });
        });
    } catch (error) {
        // Ignore metric recording errors
    }

    res.status(429).json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
        details: {
            retryAfter: res.getHeader('Retry-After'),
            limit: res.getHeader('X-RateLimit-Limit'),
            remaining: res.getHeader('X-RateLimit-Remaining')
        },
        requestId
    });
};

/**
 * Skip rate limiting for certain conditions
 * (e.g., health checks, metrics endpoints)
 */
const skipRateLimiting = (req: Request): boolean => {
    // Skip rate limiting for health checks
    if (req.path === '/health' || req.path === '/health/live' || req.path === '/health/ready') {
        return true;
    }

    // Skip rate limiting for metrics (Prometheus)
    if (req.path === '/metrics') {
        return true;
    }

    // Production: Skip rate limiting for whitelisted IPs (if configured)
    const whitelistedIPs = process.env.RATE_LIMIT_WHITELIST?.split(',') || [];
    const clientIP = req.ip || req.socket.remoteAddress;
    if (clientIP && whitelistedIPs.includes(clientIP)) {
        logger.debug('Skipping rate limit for whitelisted IP', { ip: clientIP });
        return true;
    }

    return false;
};

/**
 * General API rate limiter
 * Applied to most API endpoints
 *
 * Limits: 100 requests per 15 minutes per IP
 */
export const apiRateLimiter: RateLimitRequestHandler = rateLimit({
    windowMs: parseInt(process.env.API_RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    max: parseInt(process.env.API_RATE_LIMIT_MAX || '100', 10),
    message: 'Too many requests from this IP, please try again later',
    standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false, // Disable `X-RateLimit-*` headers
    store: createRateLimitStore('api'),
    skip: skipRateLimiting,
    handler: rateLimitHandler,
    // Use a more sophisticated key generator in production (e.g., user ID + IP)
    keyGenerator: (req: Request): string => {
        // If authenticated, use user ID + IP for better tracking
        const user = (req as any).user;
        if (user && user.uniqueID) {
            return `${user.uniqueID}:${req.ip || req.socket.remoteAddress}`;
        }
        // Otherwise, use IP only
        return req.ip || req.socket.remoteAddress || 'unknown';
    }
});

/**
 * Authentication endpoint rate limiter
 * Applied to auth-related endpoints (login, token refresh, etc.)
 *
 * Limits: 5 requests per 15 minutes per IP
 * Only counts failed authentication attempts
 */
export const authRateLimiter: RateLimitRequestHandler = rateLimit({
    windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '5', 10),
    message: 'Too many authentication attempts, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    store: createRateLimitStore('auth'),
    skipSuccessfulRequests: true, // Only count failed authentication attempts
    skip: skipRateLimiting,
    handler: (req: Request, res: Response): void => {
        const requestId = req.headers['x-request-id'] as string;

        logger.error('Authentication rate limit exceeded - possible brute force attack', {
            requestId,
            ip: req.ip || req.socket.remoteAddress,
            path: req.path,
            method: req.method,
            userAgent: req.headers['user-agent'],
            timestamp: new Date().toISOString(),
            severity: 'HIGH'
        });

        res.status(429).json({
            error: 'Too Many Requests',
            message: 'Too many authentication attempts. Your account has been temporarily locked for security.',
            details: {
                retryAfter: res.getHeader('Retry-After'),
                securityIncident: true
            },
            requestId
        });
    }
});

/**
 * File upload rate limiter
 * Applied to endpoints that handle file uploads
 *
 * Limits: 20 uploads per hour per IP
 */
export const uploadRateLimiter: RateLimitRequestHandler = rateLimit({
    windowMs: parseInt(process.env.UPLOAD_RATE_LIMIT_WINDOW_MS || '3600000', 10), // 1 hour
    max: parseInt(process.env.UPLOAD_RATE_LIMIT_MAX || '20', 10),
    message: 'Too many file uploads, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    store: createRateLimitStore('upload'),
    skip: skipRateLimiting,
    handler: (req: Request, res: Response): void => {
        const requestId = req.headers['x-request-id'] as string;

        logger.warn('Upload rate limit exceeded', {
            requestId,
            ip: req.ip || req.socket.remoteAddress,
            path: req.path,
            contentType: req.headers['content-type'],
            contentLength: req.headers['content-length'],
            timestamp: new Date().toISOString()
        });

        res.status(429).json({
            error: 'Too Many Requests',
            message: 'Too many file uploads. Please try again later.',
            details: {
                retryAfter: res.getHeader('Retry-After'),
                limit: 20,
                window: '1 hour'
            },
            requestId
        });
    }
});

/**
 * Admin endpoint rate limiter
 * Applied to administrative endpoints
 *
 * Limits: 50 requests per 15 minutes per IP
 * Stricter than general API but more lenient than auth
 */
export const adminRateLimiter: RateLimitRequestHandler = rateLimit({
    windowMs: parseInt(process.env.ADMIN_RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    max: parseInt(process.env.ADMIN_RATE_LIMIT_MAX || '50', 10),
    message: 'Too many admin requests, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    store: createRateLimitStore('admin'),
    skip: skipRateLimiting,
    handler: (req: Request, res: Response): void => {
        const requestId = req.headers['x-request-id'] as string;
        const user = (req as any).user;

        logger.warn('Admin rate limit exceeded', {
            requestId,
            ip: req.ip || req.socket.remoteAddress,
            path: req.path,
            method: req.method,
            userId: user?.uniqueID,
            timestamp: new Date().toISOString()
        });

        res.status(429).json({
            error: 'Too Many Requests',
            message: 'Too many administrative requests. Please try again later.',
            details: {
                retryAfter: res.getHeader('Retry-After'),
                limit: 50,
                window: '15 minutes'
            },
            requestId
        });
    }
});

/**
 * Strict rate limiter for sensitive operations
 * Applied to operations like password reset, account deletion, etc.
 *
 * Limits: 3 requests per hour per IP
 */
export const strictRateLimiter: RateLimitRequestHandler = rateLimit({
    windowMs: 3600000, // 1 hour
    max: 3,
    message: 'Too many sensitive operation requests, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    store: createRateLimitStore('strict'),
    skip: skipRateLimiting,
    handler: (req: Request, res: Response): void => {
        const requestId = req.headers['x-request-id'] as string;

        logger.error('Strict rate limit exceeded - possible security threat', {
            requestId,
            ip: req.ip || req.socket.remoteAddress,
            path: req.path,
            method: req.method,
            userAgent: req.headers['user-agent'],
            timestamp: new Date().toISOString(),
            severity: 'CRITICAL'
        });

        res.status(429).json({
            error: 'Too Many Requests',
            message: 'Too many sensitive operation attempts. This incident has been logged.',
            details: {
                retryAfter: res.getHeader('Retry-After'),
                securityIncident: true
            },
            requestId
        });
    }
});

/**
 * Get rate limiting statistics (for monitoring)
 * With Redis store, we can provide more detailed statistics
 */
export const getRateLimitStats = async (): Promise<{
    enabled: boolean;
    store: 'redis' | 'memory';
    limits: Record<string, { windowMs: number; max: number; activeKeys?: number }>;
}> => {
    const enabled = process.env.ENABLE_RATE_LIMITING !== 'false';
    const hasRedis = !!process.env.REDIS_URL;

    const limits: Record<string, { windowMs: number; max: number; activeKeys?: number }> = {
        api: {
            windowMs: parseInt(process.env.API_RATE_LIMIT_WINDOW_MS || '900000', 10),
            max: parseInt(process.env.API_RATE_LIMIT_MAX || '100', 10)
        },
        auth: {
            windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '900000', 10),
            max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '5', 10)
        },
        upload: {
            windowMs: parseInt(process.env.UPLOAD_RATE_LIMIT_WINDOW_MS || '3600000', 10),
            max: parseInt(process.env.UPLOAD_RATE_LIMIT_MAX || '20', 10)
        },
        admin: {
            windowMs: parseInt(process.env.ADMIN_RATE_LIMIT_WINDOW_MS || '900000', 10),
            max: parseInt(process.env.ADMIN_RATE_LIMIT_MAX || '50', 10)
        },
        strict: {
            windowMs: 3600000,
            max: 3
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
                    const keys = await redisClient.keys(`dive-v3:rate-limit:${type}:*`);
                    limits[type].activeKeys = keys.length;
                } catch (error) {
                    logger.warn(`Failed to get active keys for ${type} rate limiter`, {
                        error: (error as Error).message
                    });
                }
            }

            redisClient.disconnect();
        } catch (error) {
            logger.warn('Failed to connect to Redis for rate limit stats', {
                error: (error as Error).message
            });
        }
    }

    return {
        enabled,
        store: hasRedis ? 'redis' : 'memory',
        limits
    };
};

