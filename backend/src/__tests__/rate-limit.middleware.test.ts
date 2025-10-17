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
    let app: Express;

    beforeEach(() => {
        // Set test environment variables
        process.env.API_RATE_LIMIT_MAX = '5';
        process.env.AUTH_RATE_LIMIT_MAX = '3';
        process.env.UPLOAD_RATE_LIMIT_MAX = '2';
        process.env.ADMIN_RATE_LIMIT_MAX = '4';
        process.env.API_RATE_LIMIT_WINDOW_MS = '60000'; // 1 minute for faster testing

        app = express();
        app.use(express.json());
    });

    describe('API Rate Limiter', () => {
        beforeEach(() => {
            app.get('/test-api', apiRateLimiter, (req, res) => {
                res.json({ success: true });
            });
        });

        it('should allow requests within limit', async () => {
            // Make 5 requests (within limit)
            for (let i = 0; i < 5; i++) {
                const response = await request(app).get('/test-api');
                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
            }
        });

        it('should reject requests exceeding limit', async () => {
            // Make 6 requests (exceeds limit of 5)
            for (let i = 0; i < 5; i++) {
                await request(app).get('/test-api');
            }

            const response = await request(app).get('/test-api');
            expect(response.status).toBe(429);
            expect(response.body.error).toBe('Too Many Requests');
        });

        it('should include rate limit headers', async () => {
            const response = await request(app).get('/test-api');
            
            expect(response.headers['ratelimit-limit']).toBeDefined();
            expect(response.headers['ratelimit-remaining']).toBeDefined();
            expect(response.headers['ratelimit-reset']).toBeDefined();
        });

        it('should include retry-after header when limit exceeded', async () => {
            // Exceed limit
            for (let i = 0; i < 5; i++) {
                await request(app).get('/test-api');
            }

            const response = await request(app).get('/test-api');
            expect(response.status).toBe(429);
            expect(response.headers['retry-after']).toBeDefined();
        });

        it('should track requests per IP', async () => {
            // First IP
            const response1 = await request(app)
                .get('/test-api')
                .set('X-Forwarded-For', '192.168.1.1');
            
            expect(response1.status).toBe(200);

            // Different IP should have separate limit
            const response2 = await request(app)
                .get('/test-api')
                .set('X-Forwarded-For', '192.168.1.2');
            
            expect(response2.status).toBe(200);
        });
    });

    describe('Auth Rate Limiter', () => {
        beforeEach(() => {
            app.post('/test-auth', authRateLimiter, (req, res) => {
                // Simulate auth failure
                res.status(401).json({ error: 'Unauthorized' });
            });
        });

        it('should allow multiple auth attempts within limit', async () => {
            // Make 3 attempts (within limit)
            for (let i = 0; i < 3; i++) {
                const response = await request(app).post('/test-auth');
                expect(response.status).toBe(401); // Auth fails but not rate limited
            }
        });

        it('should block after threshold auth failures', async () => {
            // Make 4 attempts (exceeds limit of 3)
            for (let i = 0; i < 3; i++) {
                await request(app).post('/test-auth');
            }

            const response = await request(app).post('/test-auth');
            expect(response.status).toBe(429);
            expect(response.body.error).toBe('Too Many Requests');
            expect(response.body.details.securityIncident).toBe(true);
        });

        it('should include security incident flag in response', async () => {
            // Exceed limit
            for (let i = 0; i < 3; i++) {
                await request(app).post('/test-auth');
            }

            const response = await request(app).post('/test-auth');
            expect(response.body.details.securityIncident).toBe(true);
        });
    });

    describe('Upload Rate Limiter', () => {
        beforeEach(() => {
            app.post('/test-upload', uploadRateLimiter, (req, res) => {
                res.json({ uploaded: true });
            });
        });

        it('should allow uploads within limit', async () => {
            // Make 2 uploads (within limit)
            for (let i = 0; i < 2; i++) {
                const response = await request(app).post('/test-upload');
                expect(response.status).toBe(200);
            }
        });

        it('should reject uploads exceeding limit', async () => {
            // Make 3 uploads (exceeds limit of 2)
            for (let i = 0; i < 2; i++) {
                await request(app).post('/test-upload');
            }

            const response = await request(app).post('/test-upload');
            expect(response.status).toBe(429);
            expect(response.body.message).toContain('file upload');
        });

        it('should include limit and window in response', async () => {
            // Exceed limit
            for (let i = 0; i < 2; i++) {
                await request(app).post('/test-upload');
            }

            const response = await request(app).post('/test-upload');
            expect(response.body.details.limit).toBeDefined();
            expect(response.body.details.window).toBeDefined();
        });
    });

    describe('Admin Rate Limiter', () => {
        beforeEach(() => {
            app.get('/test-admin', adminRateLimiter, (req, res) => {
                res.json({ admin: true });
            });
        });

        it('should allow admin requests within limit', async () => {
            for (let i = 0; i < 4; i++) {
                const response = await request(app).get('/test-admin');
                expect(response.status).toBe(200);
            }
        });

        it('should reject admin requests exceeding limit', async () => {
            for (let i = 0; i < 4; i++) {
                await request(app).get('/test-admin');
            }

            const response = await request(app).get('/test-admin');
            expect(response.status).toBe(429);
        });
    });

    describe('Strict Rate Limiter', () => {
        beforeEach(() => {
            // Use shorter window for testing
            process.env.STRICT_RATE_LIMIT_WINDOW_MS = '60000'; // 1 minute

            app.post('/test-strict', strictRateLimiter, (req, res) => {
                res.json({ success: true });
            });
        });

        it('should allow very few requests', async () => {
            // Only 3 requests per hour
            const response1 = await request(app).post('/test-strict');
            const response2 = await request(app).post('/test-strict');
            const response3 = await request(app).post('/test-strict');

            expect(response1.status).toBe(200);
            expect(response2.status).toBe(200);
            expect(response3.status).toBe(200);
        });

        it('should block after 3 requests', async () => {
            for (let i = 0; i < 3; i++) {
                await request(app).post('/test-strict');
            }

            const response = await request(app).post('/test-strict');
            expect(response.status).toBe(429);
            expect(response.body.details.securityIncident).toBe(true);
        });
    });

    describe('Skip Conditions', () => {
        beforeEach(() => {
            app.get('/health', apiRateLimiter, (req, res) => {
                res.json({ status: 'healthy' });
            });

            app.get('/health/live', apiRateLimiter, (req, res) => {
                res.json({ alive: true });
            });

            app.get('/health/ready', apiRateLimiter, (req, res) => {
                res.json({ ready: true });
            });

            app.get('/metrics', apiRateLimiter, (req, res) => {
                res.json({ metrics: {} });
            });
        });

        it('should skip rate limiting for /health endpoint', async () => {
            // Make many requests to health check
            for (let i = 0; i < 20; i++) {
                const response = await request(app).get('/health');
                expect(response.status).toBe(200);
            }
        });

        it('should skip rate limiting for /health/live endpoint', async () => {
            for (let i = 0; i < 20; i++) {
                const response = await request(app).get('/health/live');
                expect(response.status).toBe(200);
            }
        });

        it('should skip rate limiting for /health/ready endpoint', async () => {
            for (let i = 0; i < 20; i++) {
                const response = await request(app).get('/health/ready');
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
        beforeEach(() => {
            app.get('/test-error', apiRateLimiter, (req, res) => {
                res.json({ success: true });
            });
        });

        it('should return structured error response', async () => {
            // Exceed limit
            for (let i = 0; i < 5; i++) {
                await request(app).get('/test-error');
            }

            const response = await request(app).get('/test-error');
            
            expect(response.status).toBe(429);
            expect(response.body).toHaveProperty('error');
            expect(response.body).toHaveProperty('message');
            expect(response.body).toHaveProperty('details');
            expect(response.body.details).toHaveProperty('retryAfter');
            expect(response.body.details).toHaveProperty('limit');
            expect(response.body.details).toHaveProperty('remaining');
        });
    });

    describe('Rate Limit Stats', () => {
        it('should return rate limit configuration', () => {
            const stats = getRateLimitStats();

            expect(stats.enabled).toBeDefined();
            expect(stats.limits).toBeDefined();
            expect(stats.limits.api).toBeDefined();
            expect(stats.limits.auth).toBeDefined();
            expect(stats.limits.upload).toBeDefined();
            expect(stats.limits.admin).toBeDefined();
            expect(stats.limits.strict).toBeDefined();
        });

        it('should include windowMs and max for each limiter', () => {
            const stats = getRateLimitStats();

            expect(stats.limits.api.windowMs).toBeGreaterThan(0);
            expect(stats.limits.api.max).toBeGreaterThan(0);
            expect(stats.limits.auth.windowMs).toBeGreaterThan(0);
            expect(stats.limits.auth.max).toBeGreaterThan(0);
        });

        it('should respect environment variables', () => {
            process.env.API_RATE_LIMIT_MAX = '999';
            
            const stats = getRateLimitStats();
            expect(stats.limits.api.max).toBe(999);
        });
    });

    describe('Request ID Tracking', () => {
        beforeEach(() => {
            app.get('/test-request-id', apiRateLimiter, (req, res) => {
                res.json({ success: true });
            });
        });

        it('should include requestId in error response when provided', async () => {
            // Exceed limit
            for (let i = 0; i < 5; i++) {
                await request(app)
                    .get('/test-request-id')
                    .set('X-Request-ID', 'test-req-123');
            }

            const response = await request(app)
                .get('/test-request-id')
                .set('X-Request-ID', 'test-req-456');
            
            expect(response.status).toBe(429);
            expect(response.body.requestId).toBe('test-req-456');
        });
    });
});

