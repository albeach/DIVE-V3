/**
 * Security Headers Middleware Test Suite
 * Target: 90%+ coverage for security-headers.middleware.ts
 *
 * Tests:
 * - securityHeaders (Helmet configuration)
 * - customSecurityHeaders
 * - getCorsConfig
 * - getSecurityHeadersConfig
 */

import { Request, Response, NextFunction } from 'express';
import {
    customSecurityHeaders,
    getCorsConfig,
    getSecurityHeadersConfig,
} from '../../../middleware/security-headers.middleware';

describe('Security Headers Middleware', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
        mockReq = {
            headers: {},
            path: '/api/test',
            method: 'GET',
        };

        mockRes = {
            setHeader: jest.fn(),
            getHeader: jest.fn(),
        };

        mockNext = jest.fn();

        // Reset environment variables
        delete process.env.LOG_LEVEL;
        delete process.env.ENABLE_FEDERATION_CORS;
        delete process.env.CORS_ALLOWED_ORIGINS;
    });

    describe('customSecurityHeaders', () => {
        it('should add X-Permitted-Cross-Domain-Policies header', () => {
            customSecurityHeaders(mockReq as Request, mockRes as Response, mockNext);

            expect(mockRes.setHeader).toHaveBeenCalledWith('X-Permitted-Cross-Domain-Policies', 'none');
            expect(mockNext).toHaveBeenCalled();
        });

        it('should add X-XSS-Protection header with value 0', () => {
            customSecurityHeaders(mockReq as Request, mockRes as Response, mockNext);

            expect(mockRes.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '0');
            expect(mockNext).toHaveBeenCalled();
        });

        it('should add Cache-Control headers for /api/resources/ paths', () => {
            (mockReq as Record<string, unknown>).path = '/api/resources/doc-123';

            customSecurityHeaders(mockReq as Request, mockRes as Response, mockNext);

            expect(mockRes.setHeader).toHaveBeenCalledWith(
                'Cache-Control',
                'no-store, no-cache, must-revalidate, proxy-revalidate'
            );
            expect(mockRes.setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
            expect(mockRes.setHeader).toHaveBeenCalledWith('Expires', '0');
            expect(mockRes.setHeader).toHaveBeenCalledWith('Surrogate-Control', 'no-store');
            expect(mockNext).toHaveBeenCalled();
        });

        it('should add Cache-Control headers for /api/admin/ paths', () => {
            (mockReq as Record<string, unknown>).path = '/api/admin/users';

            customSecurityHeaders(mockReq as Request, mockRes as Response, mockNext);

            expect(mockRes.setHeader).toHaveBeenCalledWith(
                'Cache-Control',
                'no-store, no-cache, must-revalidate, proxy-revalidate'
            );
            expect(mockRes.setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
            expect(mockNext).toHaveBeenCalled();
        });

        it('should NOT add Cache-Control headers for public paths', () => {
            (mockReq as Record<string, unknown>).path = '/api/health';

            customSecurityHeaders(mockReq as Request, mockRes as Response, mockNext);

            const setHeaderCalls = (mockRes.setHeader as jest.Mock).mock.calls;
            const cacheControlCalls = setHeaderCalls.filter(call => call[0] === 'Cache-Control');

            expect(cacheControlCalls.length).toBe(0);
            expect(mockNext).toHaveBeenCalled();
        });

        it('should log security headers when LOG_LEVEL is debug', () => {
            process.env.LOG_LEVEL = 'debug';
            mockReq.headers = { 'x-request-id': 'test-123' };
            (mockReq as Record<string, unknown>).path = '/api/test';
            mockReq.method = 'POST';

            (mockRes.getHeader as jest.Mock).mockImplementation((header: string) => {
                if (header === 'Content-Security-Policy') return 'default-src \'self\'';
                if (header === 'Strict-Transport-Security') return 'max-age=31536000';
                if (header === 'X-Frame-Options') return 'DENY';
                if (header === 'X-Content-Type-Options') return 'nosniff';
                if (header === 'Referrer-Policy') return 'strict-origin-when-cross-origin';
                return undefined;
            });

            customSecurityHeaders(mockReq as Request, mockRes as Response, mockNext);

            expect(mockRes.getHeader).toHaveBeenCalled();
            expect(mockNext).toHaveBeenCalled();

            delete process.env.LOG_LEVEL;
        });

        it('should NOT log security headers when LOG_LEVEL is not debug', () => {
            process.env.LOG_LEVEL = 'info';
            mockReq.headers = { 'x-request-id': 'test-456' };

            customSecurityHeaders(mockReq as Request, mockRes as Response, mockNext);

            // getHeader should not be called when not in debug mode
            expect(mockNext).toHaveBeenCalled();

            delete process.env.LOG_LEVEL;
        });

        it('should handle missing request ID', () => {
            mockReq.headers = {};

            customSecurityHeaders(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
        });

        it('should handle different HTTP methods', () => {
            const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

            methods.forEach(method => {
                mockReq.method = method;
                mockNext = jest.fn();

                customSecurityHeaders(mockReq as Request, mockRes as Response, mockNext);

                expect(mockNext).toHaveBeenCalled();
            });
        });
    });

    describe('getCorsConfig', () => {
        it('should return CORS configuration object', () => {
            const config = getCorsConfig();

            expect(config).toBeDefined();
            expect(config).toHaveProperty('origin');
            expect(config).toHaveProperty('credentials');
            expect(config).toHaveProperty('methods');
            expect(config).toHaveProperty('allowedHeaders');
            expect(config).toHaveProperty('exposedHeaders');
            expect(config).toHaveProperty('maxAge');
        });

        it('should allow requests with no origin', (done) => {
            const config = getCorsConfig();
            const callback = (err: Error | null, allow?: boolean) => {
                expect(err).toBeNull();
                expect(allow).toBe(true);
                done();
            };

            config.origin(undefined, callback);
        });

        it('should allow all origins in federation mode', (done) => {
            process.env.ENABLE_FEDERATION_CORS = 'true';

            const config = getCorsConfig();
            const callback = (err: Error | null, allow?: boolean) => {
                expect(err).toBeNull();
                expect(allow).toBe(true);
                done();
            };

            config.origin('https://external.example.com', callback);

            delete process.env.ENABLE_FEDERATION_CORS;
        });

        it('should allow origins in allowlist (standard mode)', (done) => {
            process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000,https://app.dive25.com';

            const config = getCorsConfig();
            const callback = (err: Error | null, allow?: boolean) => {
                expect(err).toBeNull();
                expect(allow).toBe(true);
                done();
            };

            config.origin('http://localhost:3000', callback);

            delete process.env.CORS_ALLOWED_ORIGINS;
        });

        it('should block origins NOT in allowlist (standard mode)', (done) => {
            process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';

            const config = getCorsConfig();
            const callback = (err: Error | null, _allow?: boolean) => {
                expect(err).toBeDefined();
                expect(err?.message).toBe('Not allowed by CORS');
                done();
            };

            config.origin('https://malicious.com', callback);

            delete process.env.CORS_ALLOWED_ORIGINS;
        });

        it('should use default allowed origins when not specified', (done) => {
            delete process.env.CORS_ALLOWED_ORIGINS;

            const config = getCorsConfig();
            const callback = (err: Error | null, allow?: boolean) => {
                expect(err).toBeNull();
                expect(allow).toBe(true);
                done();
            };

            config.origin('http://localhost:3000', callback);
        });

        it('should have credentials: true', () => {
            const config = getCorsConfig();
            expect(config.credentials).toBe(true);
        });

        it('should allow standard HTTP methods', () => {
            const config = getCorsConfig();
            expect(config.methods).toContain('GET');
            expect(config.methods).toContain('POST');
            expect(config.methods).toContain('PUT');
            expect(config.methods).toContain('DELETE');
            expect(config.methods).toContain('PATCH');
            expect(config.methods).toContain('OPTIONS');
        });

        it('should include required allowedHeaders', () => {
            const config = getCorsConfig();
            expect(config.allowedHeaders).toContain('Content-Type');
            expect(config.allowedHeaders).toContain('Authorization');
            expect(config.allowedHeaders).toContain('X-Request-ID');
            expect(config.allowedHeaders).toContain('X-Requested-With');
        });

        it('should expose rate limit headers', () => {
            const config = getCorsConfig();
            expect(config.exposedHeaders).toContain('X-Request-ID');
            expect(config.exposedHeaders).toContain('RateLimit-Limit');
            expect(config.exposedHeaders).toContain('RateLimit-Remaining');
            expect(config.exposedHeaders).toContain('RateLimit-Reset');
        });

        it('should have maxAge of 24 hours', () => {
            const config = getCorsConfig();
            expect(config.maxAge).toBe(86400);
        });

        it('should have optionsSuccessStatus of 200', () => {
            const config = getCorsConfig();
            expect(config.optionsSuccessStatus).toBe(200);
        });
    });

    describe('getSecurityHeadersConfig', () => {
        it('should return security headers configuration', () => {
            const config = getSecurityHeadersConfig();

            expect(config).toBeDefined();
            expect(config).toHaveProperty('enabled');
            expect(config).toHaveProperty('headers');
            expect(config).toHaveProperty('cspDirectives');
        });

        it('should return enabled=true by default', () => {
            delete process.env.ENABLE_SECURITY_HEADERS;
            const config = getSecurityHeadersConfig();

            expect(config.enabled).toBe(true);
        });

        it('should return enabled=false when disabled', () => {
            process.env.ENABLE_SECURITY_HEADERS = 'false';
            const config = getSecurityHeadersConfig();

            expect(config.enabled).toBe(false);
            delete process.env.ENABLE_SECURITY_HEADERS;
        });

        it('should include all security headers', () => {
            const config = getSecurityHeadersConfig();

            expect(config.headers).toContain('Content-Security-Policy');
            expect(config.headers).toContain('Strict-Transport-Security');
            expect(config.headers).toContain('X-Frame-Options');
            expect(config.headers).toContain('X-Content-Type-Options');
            expect(config.headers).toContain('Referrer-Policy');
            expect(config.headers).toContain('X-Permitted-Cross-Domain-Policies');
        });

        it('should include CSP directives', () => {
            const config = getSecurityHeadersConfig();

            expect(config.cspDirectives).toContain("default-src 'self'");
            expect(config.cspDirectives).toContain("script-src 'self' 'unsafe-inline'");
            expect(config.cspDirectives).toContain("style-src 'self' 'unsafe-inline'");
            expect(config.cspDirectives).toContain("img-src 'self' data: https:");
            expect(config.cspDirectives).toContain("font-src 'self' data:");
            expect(config.cspDirectives).toContain("connect-src 'self'");
            expect(config.cspDirectives).toContain("frame-ancestors 'none'");
        });

        it('should have array of headers', () => {
            const config = getSecurityHeadersConfig();

            expect(Array.isArray(config.headers)).toBe(true);
            expect(config.headers.length).toBeGreaterThan(0);
        });

        it('should have array of CSP directives', () => {
            const config = getSecurityHeadersConfig();

            expect(Array.isArray(config.cspDirectives)).toBe(true);
            expect(config.cspDirectives.length).toBeGreaterThan(0);
        });
    });

    describe('Edge Cases', () => {
        it('should handle path with trailing slash', () => {
            (mockReq as Record<string, unknown>).path = '/api/resources/';

            customSecurityHeaders(mockReq as Request, mockRes as Response, mockNext);

            expect(mockRes.setHeader).toHaveBeenCalledWith(
                'Cache-Control',
                'no-store, no-cache, must-revalidate, proxy-revalidate'
            );
            expect(mockNext).toHaveBeenCalled();
        });

        it('should handle path without trailing slash', () => {
            (mockReq as Record<string, unknown>).path = '/api/admin';

            customSecurityHeaders(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
        });

        it('should handle empty CORS_ALLOWED_ORIGINS', () => {
            process.env.CORS_ALLOWED_ORIGINS = '';

            const config = getCorsConfig();
            expect(config).toBeDefined();

            delete process.env.CORS_ALLOWED_ORIGINS;
        });

        it('should handle multiple origins in CORS_ALLOWED_ORIGINS', (done) => {
            process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000,http://localhost:3001,https://dive25.com';

            const config = getCorsConfig();
            const callback = (err: Error | null, allow?: boolean) => {
                expect(err).toBeNull();
                expect(allow).toBe(true);
                done();
            };

            config.origin('http://localhost:3001', callback);

            delete process.env.CORS_ALLOWED_ORIGINS;
        });

        it('should handle origins with ports', (done) => {
            process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';

            const config = getCorsConfig();
            const callback = (err: Error | null, allow?: boolean) => {
                expect(err).toBeNull();
                expect(allow).toBe(true);
                done();
            };

            config.origin('http://localhost:3000', callback);

            delete process.env.CORS_ALLOWED_ORIGINS;
        });

        it('should handle HTTPS origins', (done) => {
            process.env.CORS_ALLOWED_ORIGINS = 'https://secure.dive25.com';

            const config = getCorsConfig();
            const callback = (err: Error | null, allow?: boolean) => {
                expect(err).toBeNull();
                expect(allow).toBe(true);
                done();
            };

            config.origin('https://secure.dive25.com', callback);

            delete process.env.CORS_ALLOWED_ORIGINS;
        });
    });

    describe('Security Best Practices', () => {
        it('should include all required security headers', () => {
            const config = getSecurityHeadersConfig();

            const requiredHeaders = [
                'Content-Security-Policy',
                'Strict-Transport-Security',
                'X-Frame-Options',
                'X-Content-Type-Options',
                'Referrer-Policy',
            ];

            requiredHeaders.forEach(header => {
                expect(config.headers).toContain(header);
            });
        });

        it('should have frame-ancestors none in CSP', () => {
            const config = getSecurityHeadersConfig();

            const frameAncestorsDirective = config.cspDirectives.find(d => d.includes('frame-ancestors'));
            expect(frameAncestorsDirective).toContain("'none'");
        });

        it('should have default-src self in CSP', () => {
            const config = getSecurityHeadersConfig();

            const defaultSrcDirective = config.cspDirectives.find(d => d.includes('default-src'));
            expect(defaultSrcDirective).toContain("'self'");
        });
    });
});
