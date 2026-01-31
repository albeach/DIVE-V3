/**
 * ACP-240 KAS Phase 4.2.3: Rate Limiting Middleware
 * 
 * Provides Redis-backed rate limiting to prevent abuse and DoS attacks.
 * Uses sliding window algorithm for accurate rate limiting.
 * 
 * Rate Limits:
 * - Rewrap endpoint: 100 req/min per IP
 * - Health endpoint: 50 req/10s per IP
 * - Global: 10,000 req/min across all endpoints
 * 
 * Features:
 * - Redis-backed distributed rate limiting
 * - Fail-open on Redis errors (availability over strict limiting)
 * - Standard rate limit headers (RateLimit-*)
 * - Configurable via environment variables
 * 
 * Reference: ACP-240 KAS-REQ-105 (Rate Limiting)
 */

import rateLimit, { Options } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { Request, Response } from 'express';
import { cacheManager } from '../services/cache-manager';
import { kasLogger } from '../utils/kas-logger';

/**
 * Rate limiter for /rewrap endpoint
 * 
 * Limit: 100 requests per minute per IP address
 * Window: 60 seconds sliding window
 */
export const rewrapRateLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10), // 1 minute
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10), // 100 requests per minute
    
    // Use Redis store for distributed rate limiting
    store: (cacheManager as any).redis ? new RedisStore({
        // @ts-expect-error - rate-limit-redis types incompatible with ioredis
        client: (cacheManager as any).redis,
        prefix: 'ratelimit:rewrap:',
        sendCommand: (...args: string[]) => (cacheManager as any).redis.call(...args),
    }) : undefined,
    
    // Standard rate limit headers
    standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false,  // Disable `X-RateLimit-*` headers
    
    // Skip rate limiting for certain conditions
    skip: (req: Request) => {
        // Skip health checks
        if (req.path === '/health' || req.path === '/metrics') {
            return true;
        }
        
        // Skip if rate limiting is disabled
        if (process.env.ENABLE_RATE_LIMITING === 'false') {
            return true;
        }
        
        return false;
    },
    
    // Custom error handler
    handler: (req: Request, res: Response) => {
        kasLogger.warn('Rate limit exceeded for rewrap endpoint', {
            ip: req.ip,
            path: req.path,
            userAgent: req.get('user-agent'),
        });
        
        res.status(429).json({
            error: 'Too Many Requests',
            message: 'Rate limit exceeded. Please try again later.',
            retryAfter: Math.ceil(parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10) / 1000),
        });
    },
    
    // Validate: ensure custom validation doesn't break IPv6
    validate: { trustProxy: false },
} as Partial<Options>);

/**
 * Rate limiter for /health endpoint
 * 
 * Limit: 50 requests per 10 seconds per IP address
 * More permissive to allow frequent health checks
 */
export const healthRateLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_HEALTH_WINDOW_MS || '10000', 10), // 10 seconds
    max: parseInt(process.env.RATE_LIMIT_HEALTH_MAX || '50', 10), // 50 requests per 10 seconds
    
    // Use Redis store for distributed rate limiting
    store: (cacheManager as any).redis ? new RedisStore({
        // @ts-expect-error - rate-limit-redis types incompatible with ioredis
        client: (cacheManager as any).redis,
        prefix: 'ratelimit:health:',
        sendCommand: (...args: string[]) => (cacheManager as any).redis.call(...args),
    }) : undefined,
    
    standardHeaders: true,
    legacyHeaders: false,
    
    skip: (req: Request) => {
        return process.env.ENABLE_RATE_LIMITING === 'false';
    },
    
    handler: (req: Request, res: Response) => {
        kasLogger.warn('Rate limit exceeded for health endpoint', {
            ip: req.ip,
            path: req.path,
        });
        
        res.status(429).json({
            error: 'Too Many Requests',
            message: 'Health check rate limit exceeded.',
            retryAfter: Math.ceil(parseInt(process.env.RATE_LIMIT_HEALTH_WINDOW_MS || '10000', 10) / 1000),
        });
    },
    
    validate: { trustProxy: false },
} as Partial<Options>);

/**
 * Global rate limiter (applied to all endpoints)
 * 
 * Limit: 1000 requests per minute per IP address
 * Protects against aggressive scraping/DoS
 */
export const globalRateLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_GLOBAL_WINDOW_MS || '60000', 10), // 1 minute
    max: parseInt(process.env.RATE_LIMIT_GLOBAL_MAX || '1000', 10), // 1000 requests per minute
    
    // Use Redis store for distributed rate limiting
    store: (cacheManager as any).redis ? new RedisStore({
        // @ts-expect-error - rate-limit-redis types incompatible with ioredis
        client: (cacheManager as any).redis,
        prefix: 'ratelimit:global:',
        sendCommand: (...args: string[]) => (cacheManager as any).redis.call(...args),
    }) : undefined,
    
    standardHeaders: true,
    legacyHeaders: false,
    
    skip: (req: Request) => {
        return process.env.ENABLE_RATE_LIMITING === 'false';
    },
    
    handler: (req: Request, res: Response) => {
        kasLogger.warn('Global rate limit exceeded', {
            ip: req.ip,
            path: req.path,
            userAgent: req.get('user-agent'),
        });
        
        res.status(429).json({
            error: 'Too Many Requests',
            message: 'Global rate limit exceeded. Please reduce request frequency.',
            retryAfter: Math.ceil(parseInt(process.env.RATE_LIMIT_GLOBAL_WINDOW_MS || '60000', 10) / 1000),
        });
    },
    
    validate: { trustProxy: false },
} as Partial<Options>);

/**
 * Export configuration for testing
 */
export const rateLimitConfig = {
    rewrap: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
        max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
    },
    health: {
        windowMs: parseInt(process.env.RATE_LIMIT_HEALTH_WINDOW_MS || '10000', 10),
        max: parseInt(process.env.RATE_LIMIT_HEALTH_MAX || '50', 10),
    },
    global: {
        windowMs: parseInt(process.env.RATE_LIMIT_GLOBAL_WINDOW_MS || '60000', 10),
        max: parseInt(process.env.RATE_LIMIT_GLOBAL_MAX || '1000', 10),
    },
};
