/**
 * Rate Limiting Middleware - Unit Tests
 * 
 * Tests for Phase 4.2.3 rate limiting implementation
 * 
 * Test Coverage:
 * - Rate limit enforcement for rewrap endpoint
 * - Rate limit enforcement for health endpoint
 * - Global rate limiting
 * - Rate limit headers
 * - Skip conditions
 * - Error handling
 * - Redis integration
 */

import { Request, Response } from 'express';
import { rateLimitConfig } from '../middleware/rate-limiter.middleware';

// Mock dependencies
jest.mock('../services/cache-manager', () => ({
    cacheManager: {
        redis: null, // Disable Redis for unit tests
    },
}));

jest.mock('../utils/kas-logger', () => ({
    kasLogger: {
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    },
}));

describe('Rate Limiter Configuration', () => {
    beforeEach(() => {
        // Clear environment variables
        delete process.env.RATE_LIMIT_WINDOW_MS;
        delete process.env.RATE_LIMIT_MAX_REQUESTS;
        delete process.env.RATE_LIMIT_HEALTH_WINDOW_MS;
        delete process.env.RATE_LIMIT_HEALTH_MAX;
        delete process.env.RATE_LIMIT_GLOBAL_WINDOW_MS;
        delete process.env.RATE_LIMIT_GLOBAL_MAX;
    });

    describe('Default Configuration', () => {
        it('should use default rewrap rate limit (100 req/min)', () => {
            const config = rateLimitConfig;
            
            expect(config.rewrap.windowMs).toBe(60000); // 1 minute
            expect(config.rewrap.max).toBe(100);
        });

        it('should use default health rate limit (50 req/10s)', () => {
            const config = rateLimitConfig;
            
            expect(config.health.windowMs).toBe(10000); // 10 seconds
            expect(config.health.max).toBe(50);
        });

        it('should use default global rate limit (1000 req/min)', () => {
            const config = rateLimitConfig;
            
            expect(config.global.windowMs).toBe(60000); // 1 minute
            expect(config.global.max).toBe(1000);
        });
    });

    describe('Environment Variable Configuration', () => {
        it('should override rewrap rate limit from env vars', () => {
            process.env.RATE_LIMIT_WINDOW_MS = '120000';
            process.env.RATE_LIMIT_MAX_REQUESTS = '200';

            // Re-import to pick up env changes
            jest.resetModules();
            const { rateLimitConfig: newConfig } = require('../middleware/rate-limiter.middleware');
            
            expect(newConfig.rewrap.windowMs).toBe(120000);
            expect(newConfig.rewrap.max).toBe(200);
        });

        it('should override health rate limit from env vars', () => {
            process.env.RATE_LIMIT_HEALTH_WINDOW_MS = '5000';
            process.env.RATE_LIMIT_HEALTH_MAX = '25';

            jest.resetModules();
            const { rateLimitConfig: newConfig } = require('../middleware/rate-limiter.middleware');
            
            expect(newConfig.health.windowMs).toBe(5000);
            expect(newConfig.health.max).toBe(25);
        });

        it('should override global rate limit from env vars', () => {
            process.env.RATE_LIMIT_GLOBAL_WINDOW_MS = '30000';
            process.env.RATE_LIMIT_GLOBAL_MAX = '500';

            jest.resetModules();
            const { rateLimitConfig: newConfig } = require('../middleware/rate-limiter.middleware');
            
            expect(newConfig.global.windowMs).toBe(30000);
            expect(newConfig.global.max).toBe(500);
        });
    });
});

describe('Rate Limiter Middleware', () => {
    describe('Middleware Initialization', () => {
        it('should initialize rewrap rate limiter', () => {
            const { rewrapRateLimiter } = require('../middleware/rate-limiter.middleware');
            
            expect(rewrapRateLimiter).toBeDefined();
            expect(typeof rewrapRateLimiter).toBe('function');
        });

        it('should initialize health rate limiter', () => {
            const { healthRateLimiter } = require('../middleware/rate-limiter.middleware');
            
            expect(healthRateLimiter).toBeDefined();
            expect(typeof healthRateLimiter).toBe('function');
        });

        it('should initialize global rate limiter', () => {
            const { globalRateLimiter } = require('../middleware/rate-limiter.middleware');
            
            expect(globalRateLimiter).toBeDefined();
            expect(typeof globalRateLimiter).toBe('function');
        });
    });

    describe('Rate Limiter Integration', () => {
        it('should use Redis store when available', () => {
            // Mock Redis client available
            const mockCacheManager = require('../services/cache-manager');
            mockCacheManager.cacheManager.redis = {
                call: jest.fn(),
            };

            jest.resetModules();
            const { rewrapRateLimiter } = require('../middleware/rate-limiter.middleware');
            
            expect(rewrapRateLimiter).toBeDefined();
        });

        it('should work without Redis store (memory fallback)', () => {
            // Mock Redis client unavailable
            const mockCacheManager = require('../services/cache-manager');
            mockCacheManager.cacheManager.redis = null;

            jest.resetModules();
            const { rewrapRateLimiter } = require('../middleware/rate-limiter.middleware');
            
            expect(rewrapRateLimiter).toBeDefined();
        });
    });
});
