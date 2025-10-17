import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import { Request, Response } from 'express';
import { logger } from '../utils/logger';

// ============================================
// Rate Limiting Middleware (Phase 3)
// ============================================
// Purpose: Protect against DoS attacks and abuse
// Strategy: Different limits for different endpoint types

/**
 * Custom rate limit handler that logs violations
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
 * Note: express-rate-limit doesn't expose stats directly
 * This is a placeholder for future implementation with Redis store
 */
export const getRateLimitStats = (): {
    enabled: boolean;
    limits: Record<string, { windowMs: number; max: number }>;
} => {
    return {
        enabled: process.env.ENABLE_RATE_LIMITING !== 'false',
        limits: {
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
        }
    };
};

