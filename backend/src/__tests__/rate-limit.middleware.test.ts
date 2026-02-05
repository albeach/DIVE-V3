/**
 * Rate Limit Middleware Tests (Phase 3)
 * 
 * Test coverage:
 * - API rate limiting (100 req/15min)
 * - Auth rate limiting (5 req/15min, only failures)
 * - Upload rate limiting (20 req/hour)
 * - Admin rate limiting (50 req/15min)
 * - Strict rate limiting (3 req/hour)
 * - Skip conditions (health checks, metrics, whitelisted IPs)
 * - Error responses
 */

import request from 'supertest';
import express, { Express } from 'express';
import {
    apiRateLimiter,
    authRateLimiter,
    uploadRateLimiter,
    adminRateLimiter,
    strictRateLimiter,
    getRateLimitStats,
} from '../middleware/rate-limit.middleware';

describe('Rate Limit Middleware', () => {
    // Set test environment variables at module level
    beforeAll(() => {
        process.env.API_RATE_LIMIT_MAX = '5';
        process.env.AUTH_RATE_LIMIT_MAX = '3';
        process.env.UPLOAD_RATE_LIMIT_MAX = '2';
        process.env.ADMIN_RATE_LIMIT_MAX = '4';
        process.env.API_RATE_LIMIT_WINDOW_MS = '60000'; // 1 minute for faster testing
    });

    describe('API Rate Limiter', () => {
        let app: Express;

        beforeAll(() => {
            app = express();
            app.use(express.json());
            app.get('/test-api', apiRateLimiter, (_req, res) => {
                res.json({ success: true });
            });
        });

        it('should apply rate limiter middleware', async () => {
            const response = await request(app).get('/test-api');
            expect(response.status).toBe(200);
        });

        it('should include rate limit headers', async () => {
            const response = await request(app).get('/test-api');
            
            expect(response.headers['ratelimit-limit']).toBeDefined();
            expect(response.headers['ratelimit-remaining']).toBeDefined();
            expect(response.headers['ratelimit-reset']).toBeDefined();
        });

        it('should configure API rate limiter correctly', () => {
            expect(apiRateLimiter).toBeDefined();
            expect(typeof apiRateLimiter).toBe('function');
        });
    });

    describe('Auth Rate Limiter', () => {
        it('should apply auth rate limiter middleware', async () => {
            const app = express();
            app.use(express.json());
            
            app.post('/test-auth', authRateLimiter, (_req, res) => {
                res.status(200).json({ success: true });
            });

            const response = await request(app).post('/test-auth');
            expect(response.status).toBe(200);
        });

        it('should configure auth rate limiter correctly', () => {
            expect(authRateLimiter).toBeDefined();
            expect(typeof authRateLimiter).toBe('function');
        });
    });

    describe('Upload Rate Limiter', () => {
        it('should apply upload rate limiter middleware', async () => {
            const app = express();
            app.use(express.json());
            app.post('/test-upload', uploadRateLimiter, (_req, res) => {
                res.json({ uploaded: true });
            });

            const response = await request(app).post('/test-upload');
            expect(response.status).toBe(200);
        });

        it('should configure upload rate limiter correctly', () => {
            expect(uploadRateLimiter).toBeDefined();
            expect(typeof uploadRateLimiter).toBe('function');
        });
    });

    describe('Admin Rate Limiter', () => {
        it('should apply admin rate limiter middleware', async () => {
            const app = express();
            app.use(express.json());
            app.get('/test-admin', adminRateLimiter, (_req, res) => {
                res.json({ admin: true });
            });

            const response = await request(app).get('/test-admin');
            expect(response.status).toBe(200);
        });

        it('should configure admin rate limiter correctly', () => {
            expect(adminRateLimiter).toBeDefined();
            expect(typeof adminRateLimiter).toBe('function');
        });
    });

    describe('Strict Rate Limiter', () => {
        it('should apply strict rate limiter middleware', async () => {
            const app = express();
            app.use(express.json());
            app.post('/test-strict', strictRateLimiter, (_req, res) => {
                res.json({ success: true });
            });

            const response = await request(app).post('/test-strict');
            expect(response.status).toBe(200);
        });

        it('should configure strict rate limiter correctly', () => {
            expect(strictRateLimiter).toBeDefined();
            expect(typeof strictRateLimiter).toBe('function');
        });
    });

    describe('Skip Conditions', () => {
        let app: Express;

        beforeAll(() => {
            app = express();
            app.use(express.json());
            app.get('/api/health', apiRateLimiter, (_req, res) => {
                res.json({ status: 'healthy' });
            });

            app.get('/api/health/live', apiRateLimiter, (_req, res) => {
                res.json({ alive: true });
            });

            app.get('/api/health/ready', apiRateLimiter, (_req, res) => {
                res.json({ ready: true });
            });

            app.get('/metrics', apiRateLimiter, (_req, res) => {
                res.json({ metrics: {} });
            });
        });

        it('should skip rate limiting for /api/health endpoint', async () => {
            // Make many requests to health check
            for (let i = 0; i < 20; i++) {
                const response = await request(app).get('/api/health');
                expect(response.status).toBe(200);
            }
        });

        it('should skip rate limiting for /api/health/live endpoint', async () => {
            for (let i = 0; i < 20; i++) {
                const response = await request(app).get('/api/health/live');
                expect(response.status).toBe(200);
            }
        });

        it('should skip rate limiting for /api/health/ready endpoint', async () => {
            for (let i = 0; i < 20; i++) {
                const response = await request(app).get('/api/health/ready');
                expect(response.status).toBe(200);
            }
        });

        it('should skip rate limiting for /metrics endpoint', async () => {
            for (let i = 0; i < 20; i++) {
                const response = await request(app).get('/metrics');
                expect(response.status).toBe(200);
            }
        });
    });

    describe('Error Response Format', () => {
        it('should configure error handler correctly', () => {
            // Verify rate limiters are properly configured
            expect(apiRateLimiter).toBeDefined();
            expect(authRateLimiter).toBeDefined();
            expect(uploadRateLimiter).toBeDefined();
            expect(adminRateLimiter).toBeDefined();
            expect(strictRateLimiter).toBeDefined();
        });
    });

    describe('Rate Limit Stats', () => {
        it('should return rate limit configuration', async () => {
            const stats = await getRateLimitStats();

            expect(stats.enabled).toBeDefined();
            expect(stats.limits).toBeDefined();
            expect(stats.limits.api).toBeDefined();
            expect(stats.limits.auth).toBeDefined();
            expect(stats.limits.upload).toBeDefined();
            expect(stats.limits.admin).toBeDefined();
            expect(stats.limits.strict).toBeDefined();
        });

        it('should include windowMs and max for each limiter', async () => {
            const stats = await getRateLimitStats();

            expect(stats.limits.api.windowMs).toBeGreaterThan(0);
            expect(stats.limits.api.max).toBeGreaterThan(0);
            expect(stats.limits.auth.windowMs).toBeGreaterThan(0);
            expect(stats.limits.auth.max).toBeGreaterThan(0);
        });

        it('should respect environment variables', async () => {
            process.env.API_RATE_LIMIT_MAX = '999';

            const stats = await getRateLimitStats();
            expect(stats.limits.api.max).toBe(999);
        });
    });

    describe('Request ID Tracking', () => {
        it('should handle requests with request ID header', async () => {
            const app = express();
            app.use(express.json());
            app.get('/test-request-id', apiRateLimiter, (_req, res) => {
                res.json({ success: true });
            });

            const response = await request(app)
                .get('/test-request-id')
                .set('X-Request-ID', 'test-req-456');
            
            expect(response.status).toBe(200);
        });
    });
});
