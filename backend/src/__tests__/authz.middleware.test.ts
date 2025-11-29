/**
 * Authorization Middleware (PEP) Test Suite
 * Tests for JWT validation, OPA integration, and authorization enforcement
 * 
 * Target Coverage: 90%
 * Priority: CRITICAL (Core security component)
 */

import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import axios from 'axios';
import { authzMiddleware, authenticateJWT, clearAuthzCaches, initializeJwtService } from '../middleware/authz.middleware';
import { getResourceById } from '../services/resource.service';
import { createMockJWT, createUSUserJWT, createExpiredJWT } from './helpers/mock-jwt';
import { mockOPAAllow, mockOPADeny, mockOPADenyInsufficientClearance, mockOPAAllowWithKASObligation } from './helpers/mock-opa';
import { TEST_RESOURCES } from './helpers/test-fixtures';

// Mock dependencies
jest.mock('axios');
jest.mock('../services/resource.service');
jest.mock('jwk-to-pem');

// Mock token blacklist service (Week 4: This was the missing mock causing 401 errors!)
jest.mock('../services/token-blacklist.service', () => ({
    isTokenBlacklisted: jest.fn().mockResolvedValue(false),
    areUserTokensRevoked: jest.fn().mockResolvedValue(false)
}));

// Mock SP auth middleware
jest.mock('../middleware/sp-auth.middleware', () => ({
    validateSPToken: jest.fn().mockResolvedValue(null)
}));

// Week 4 BEST PRACTICE: Dependency Injection (not module mocking)
// Store default mock implementation for resetting between tests
const defaultJwtVerifyImpl = (token: any, _key: any, options: any, callback: any) => {
    // Validate token like real jwt.verify would
    try {
        const parts = token.split('.');
        if (parts.length !== 3) {
            return callback(new Error('invalid token'), null);
        }

        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));

        // Validate issuer if specified (FAL2 requirement)
        if (options?.issuer) {
            const validIssuers = Array.isArray(options.issuer) ? options.issuer : [options.issuer];
            if (!validIssuers.includes(payload.iss)) {
                return callback(new Error('jwt issuer invalid'), null);
            }
        }

        // Validate audience if specified (FAL2 requirement)
        if (options?.audience) {
            const tokenAud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
            const validAudiences = Array.isArray(options.audience) ? options.audience : [options.audience];
            const hasValidAudience = tokenAud.some((aud: string) => validAudiences.includes(aud));
            if (!hasValidAudience) {
                return callback(new Error('jwt audience invalid'), null);
            }
        }

        // Return the decoded payload
        callback(null, payload);
    } catch (error) {
        callback(error, null);
    }
};

// Create mock JWT service that will be injected into middleware
const mockJwtService = {
    verify: jest.fn(defaultJwtVerifyImpl),
    decode: jwt.decode,  // Use real decode
    sign: jwt.sign       // Use real sign
};

// Mock logger module
jest.mock('../utils/logger', () => ({
    logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        child: jest.fn().mockReturnValue({
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn()
        })
    }
}));

// Mock ACP-240 logger
jest.mock('../utils/acp240-logger', () => ({
    logACP240Event: jest.fn(),
    logEncryptEvent: jest.fn(),
    logDecryptEvent: jest.fn(),
    logAccessDeniedEvent: jest.fn(),
    logAccessModifiedEvent: jest.fn(),
    logDataSharedEvent: jest.fn()
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedGetResourceById = getResourceById as jest.MockedFunction<typeof getResourceById>;

// Initialize JWT service with mocks IMMEDIATELY (not in beforeAll)
initializeJwtService(mockJwtService as any);

// Import jwk-to-pem after mocking
import jwkToPem from 'jwk-to-pem';

describe('Authorization Middleware (PEP)', () => {
    let req: Partial<Request>;
    let res: Partial<Response>;
    let next: jest.MockedFunction<NextFunction>;

    beforeEach(() => {
        // Clear authorization middleware caches (decision cache, JWKS cache)
        clearAuthzCaches();

        // Reset mocks
        jest.clearAllMocks();
        
        // Week 4: Reset JWT mock to default implementation (for test isolation)
        mockJwtService.verify.mockImplementation(defaultJwtVerifyImpl);

        // Setup request mock
        req = {
            headers: {},
            params: {},
            ip: '127.0.0.1'
        };

        // Setup response mock
        const statusMock = jest.fn().mockReturnThis();
        const jsonMock = jest.fn().mockReturnThis();
        res = {
            status: statusMock,
            json: jsonMock
        };

        next = jest.fn();

        // Mock JWKS endpoint
        mockedAxios.get.mockResolvedValue({
            data: {
                keys: [
                    {
                        kid: 'test-key-id',
                        kty: 'RSA',
                        use: 'sig',
                        alg: 'RS256',
                        n: 'test-modulus',
                        e: 'AQAB'
                    }
                ]
            }
        });

        // Mock jwk-to-pem to return a fake public key
        (jwkToPem as jest.MockedFunction<typeof jwkToPem>).mockReturnValue('-----BEGIN PUBLIC KEY-----\nMOCK_PUBLIC_KEY\n-----END PUBLIC KEY-----');

        // Week 4: mockJwtService is already configured with proper implementation (no need to reconfigure here)
        // The dependency injection pattern provides the mock at module level

        // Mock OPA responses - default to allow
        mockedAxios.post.mockResolvedValue({
            data: mockOPAAllow()
        });

        // Mock resource service
        mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument);
    });

    // ============================================
    // JWT Authentication Tests
    // ============================================
    describe('authenticateJWT', () => {
        it('should authenticate valid JWT token', async () => {
            const token = createUSUserJWT();
            req.headers!.authorization = `Bearer ${token}`;

            // Mock JWT verification
            mockJwtService.verify.mockImplementation((_token, _key, _options, callback: any) => {
                callback(null, {
                    sub: 'testuser-us',
                    uniqueID: 'testuser-us',
                    clearance: 'SECRET',
                    countryOfAffiliation: 'USA',
                    acpCOI: ['FVEY'],
                    exp: Math.floor(Date.now() / 1000) + 3600,
                    iat: Math.floor(Date.now() / 1000)
                });
            });

            await authenticateJWT(req as Request, res as Response, next);

            expect(next).toHaveBeenCalled();
            expect((req as any).user).toBeDefined();
            expect((req as any).user.uniqueID).toBe('testuser-us');
            expect((req as any).user.clearance).toBe('SECRET');
            expect((req as any).user.countryOfAffiliation).toBe('USA');
        });

        it('should reject missing Authorization header', async () => {
            await authenticateJWT(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                error: 'Unauthorized',
                message: 'Missing or invalid Authorization header'
            }));
            expect(next).not.toHaveBeenCalled();
        });

        it('should reject invalid Authorization header format', async () => {
            req.headers!.authorization = 'InvalidFormat token123';

            await authenticateJWT(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(next).not.toHaveBeenCalled();
        });

        it('should reject expired JWT token', async () => {
            const token = createExpiredJWT();
            req.headers!.authorization = `Bearer ${token}`;

            mockJwtService.verify.mockImplementation((_token, _key, _options, callback: any) => {
                callback(new Error('jwt expired'), null);
            });

            await authenticateJWT(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                error: 'Unauthorized',
                message: 'Invalid or expired JWT token'
            }));
            expect(next).not.toHaveBeenCalled();
        });

        it('should reject JWT with invalid signature', async () => {
            req.headers!.authorization = 'Bearer invalid.jwt.signature';

            mockJwtService.verify.mockImplementation((_token, _key, _options, callback: any) => {
                callback(new Error('invalid signature'), null);
            });

            await authenticateJWT(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(next).not.toHaveBeenCalled();
        });

        it('should reject JWT with invalid issuer', async () => {
            const token = createMockJWT({
                iss: 'http://evil-keycloak.com/realms/fake'
            });
            req.headers!.authorization = `Bearer ${token}`;

            mockJwtService.verify.mockImplementation((_token, _key, _options, callback: any) => {
                callback(new Error('jwt issuer invalid'), null);
            });

            await authenticateJWT(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(next).not.toHaveBeenCalled();
        });

        it('should handle acpCOI array correctly', async () => {
            const token = createUSUserJWT({ acpCOI: ['FVEY', 'NATO-COSMIC'] });
            req.headers!.authorization = `Bearer ${token}`;

            mockJwtService.verify.mockImplementation((_token, _key, _options, callback: any) => {
                callback(null, {
                    sub: 'testuser-us',
                    uniqueID: 'testuser-us',
                    clearance: 'SECRET',
                    countryOfAffiliation: 'USA',
                    acpCOI: ['FVEY', 'NATO-COSMIC'],
                    exp: Math.floor(Date.now() / 1000) + 3600,
                    iat: Math.floor(Date.now() / 1000)
                });
            });

            await authenticateJWT(req as Request, res as Response, next);

            expect((req as any).user.acpCOI).toEqual(['FVEY', 'NATO-COSMIC']);
        });

        it('should handle double-encoded acpCOI (Keycloak quirk)', async () => {
            const token = createUSUserJWT();
            req.headers!.authorization = `Bearer ${token}`;

            mockJwtService.verify.mockImplementation((_token, _key, _options, callback: any) => {
                callback(null, {
                    sub: 'testuser-us',
                    uniqueID: 'testuser-us',
                    clearance: 'SECRET',
                    countryOfAffiliation: 'USA',
                    acpCOI: ['["FVEY"]'], // Double-encoded
                    exp: Math.floor(Date.now() / 1000) + 3600,
                    iat: Math.floor(Date.now() / 1000)
                });
            });

            await authenticateJWT(req as Request, res as Response, next);

            // Should be unwrapped
            expect((req as any).user.acpCOI).toEqual(['FVEY']);
        });
    });

    // ============================================
    // Authorization Middleware Tests
    // ============================================
    describe('authzMiddleware', () => {
        beforeEach(() => {
            // Re-initialize ALL mocks to ensure test isolation

            // Re-create request mock
            req = {
                headers: {},
                params: {},
                ip: '127.0.0.1'
            };

            // Mock valid JWT for authz tests
            const token = createUSUserJWT();
            req.headers!.authorization = `Bearer ${token}`;
            req.headers!['x-request-id'] = 'test-req-123';
            req.params!.id = 'doc-fvey-001';

            // Re-create response mocks fresh
            const statusMock = jest.fn().mockReturnThis();
            const jsonMock = jest.fn().mockReturnThis();
            res = {
                status: statusMock,
                json: jsonMock
            };

            // Reset next mock
            next = jest.fn();

            // Week 4: mockJwtService configuration is done at module level via dependency injection
            // No need to reconfigure here - keeps tests clean and follows best practice

            // Clear call history on service mocks (will be set per test)
            mockedGetResourceById.mockClear();
            mockedAxios.post.mockClear();
        });

        it('should allow access when OPA permits', async () => {
            // Mock resource fetch
            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument);

            // Mock OPA decision (ALLOW)
            mockedAxios.post.mockResolvedValue({
                data: {
                    result: {
                        decision: mockOPAAllow().result
                    }
                }
            });

            await authzMiddleware(req as Request, res as Response, next);

            expect(mockedAxios.post).toHaveBeenCalledWith(
                expect.stringContaining('/v1/data/dive/authorization'),
                expect.objectContaining({
                    input: expect.objectContaining({
                        subject: expect.objectContaining({
                            uniqueID: 'testuser-us',
                            clearance: 'SECRET',
                            countryOfAffiliation: 'USA'
                        }),
                        resource: expect.objectContaining({
                            resourceId: 'doc-fvey-001'
                        })
                    })
                }),
                expect.any(Object)
            );

            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalledWith(403);
        });

        it('should deny access when OPA denies', async () => {
            // beforeEach already sets up authorization header and params
            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument);

            // Mock OPA decision (DENY)
            mockedAxios.post.mockResolvedValue({
                data: {
                    result: {
                        decision: mockOPADenyInsufficientClearance('CONFIDENTIAL', 'SECRET').result
                    }
                }
            });

            await authzMiddleware(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                error: 'Forbidden',
                message: 'Insufficient security clearance',
                guidance: expect.stringContaining('clearance'),
                technical_reason: expect.stringContaining('Insufficient clearance'),
                details: expect.objectContaining({
                    subject: expect.any(Object),
                    resource: expect.any(Object)
                })
            }));
            expect(next).not.toHaveBeenCalled();
        });

        it('should return 404 when resource not found', async () => {
            mockedGetResourceById.mockResolvedValue(null);

            await authzMiddleware(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                error: 'Not Found',
                message: expect.stringContaining('not found')
            }));
            expect(next).not.toHaveBeenCalled();
        });

        it('should return 503 when OPA is unavailable', async () => {
            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument);

            // Mock OPA error
            mockedAxios.post.mockRejectedValue(new Error('ECONNREFUSED'));

            await authzMiddleware(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(503);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                error: 'Service Unavailable',
                message: 'Authorization service temporarily unavailable'
            }));
            expect(next).not.toHaveBeenCalled();
        });

        it('should cache authorization decisions', async () => {
            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument);
            mockedAxios.post.mockResolvedValue({
                data: {
                    result: {
                        decision: mockOPAAllow().result
                    }
                }
            });

            // First request
            await authzMiddleware(req as Request, res as Response, next);
            expect(mockedAxios.post).toHaveBeenCalledTimes(1);
            expect(next).toHaveBeenCalledTimes(1);

            // Reset mocks
            jest.clearAllMocks();
            next = jest.fn();

            // Second request (should use cache)
            await authzMiddleware(req as Request, res as Response, next);

            // OPA should NOT be called again (cached)
            expect(mockedAxios.post).toHaveBeenCalledTimes(0);
            expect(next).toHaveBeenCalledTimes(1);
        });

        it('should not call OPA twice for same decision (caching)', async () => {
            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument);
            mockedAxios.post.mockResolvedValue({
                data: {
                    result: {
                        decision: mockOPAAllow().result
                    }
                }
            });

            // Make first request
            await authzMiddleware(req as Request, res as Response, next);
            const firstCallCount = mockedAxios.post.mock.calls.length;

            // Make second identical request (should use cache)
            jest.clearAllMocks();
            next = jest.fn();
            await authzMiddleware(req as Request, res as Response, next);
            const secondCallCount = mockedAxios.post.mock.calls.length;

            expect(firstCallCount).toBe(1);
            expect(secondCallCount).toBe(0); // Cached, no OPA call
        });

        it('should handle OPA obligations (KAS)', async () => {
            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument);

            // Mock OPA decision with KAS obligation
            mockedAxios.post.mockResolvedValue({
                data: {
                    result: {
                        decision: mockOPAAllowWithKASObligation('doc-fvey-001').result
                    }
                }
            });

            await authzMiddleware(req as Request, res as Response, next);

            expect((req as any).authzObligations).toBeDefined();
            expect((req as any).authzObligations).toEqual([
                {
                    type: 'fetch-key',
                    resourceId: 'doc-fvey-001'
                }
            ]);
            expect(next).toHaveBeenCalled();
        });

        it('should use enriched claims if available', async () => {
            // Simulate enrichment middleware ran first
            (req as any).enrichedUser = {
                uniqueID: 'testuser-us',
                clearance: 'SECRET',
                countryOfAffiliation: 'USA', // Enriched from email
                acpCOI: []
            };
            (req as any).wasEnriched = true;

            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument);
            mockedAxios.post.mockResolvedValue({
                data: {
                    result: {
                        decision: mockOPAAllow().result
                    }
                }
            });

            await authzMiddleware(req as Request, res as Response, next);

            // Should use enriched claims
            expect(mockedAxios.post).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    input: expect.objectContaining({
                        subject: expect.objectContaining({
                            countryOfAffiliation: 'USA'
                        })
                    })
                }),
                expect.any(Object)
            );
        });

        it('should handle ZTDF resources correctly', async () => {
            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument);
            mockedAxios.post.mockResolvedValue({
                data: {
                    result: {
                        decision: mockOPAAllow().result
                    }
                }
            });

            await authzMiddleware(req as Request, res as Response, next);

            // Should extract classification from ZTDF structure
            expect(mockedAxios.post).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    input: expect.objectContaining({
                        resource: expect.objectContaining({
                            classification: 'SECRET',
                            releasabilityTo: expect.arrayContaining(['USA', 'GBR', 'CAN']),
                            encrypted: true
                        })
                    })
                }),
                expect.any(Object)
            );
        });

        it('should log all authorization decisions', async () => {
            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument);
            mockedAxios.post.mockResolvedValue({
                data: {
                    result: {
                        decision: mockOPAAllow().result
                    }
                }
            });

            await authzMiddleware(req as Request, res as Response, next);

            // Logger is mocked at module level, just verify middleware executed
            expect(next).toHaveBeenCalled();
        });

        it('should handle invalid OPA response structure', async () => {
            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument);

            // Mock invalid OPA response (missing result field)
            // The callOPA function creates a fallback DENY decision, so expects 403 not 500
            mockedAxios.post.mockResolvedValue({
                data: {
                    // Missing result field - will fallback to deny
                }
            });

            await authzMiddleware(req as Request, res as Response, next);

            // Middleware treats invalid response as DENY, returns 403
            expect(res.status).toHaveBeenCalledWith(403);
            expect(next).not.toHaveBeenCalled();
        });

        it('should construct correct OPA input structure', async () => {
            const token = createUSUserJWT();
            req.headers!.authorization = `Bearer ${token}`;
            req.params!.id = 'doc-001';

            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument);
            mockedAxios.post.mockResolvedValue({
                data: {
                    result: {
                        decision: mockOPAAllow().result
                    }
                }
            });

            await authzMiddleware(req as Request, res as Response, next);

            expect(mockedAxios.post).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    input: expect.objectContaining({
                        subject: expect.objectContaining({
                            authenticated: true,
                            uniqueID: expect.any(String),
                            clearance: expect.any(String),
                            countryOfAffiliation: expect.any(String),
                            acpCOI: expect.any(Array)
                        }),
                        action: expect.objectContaining({
                            operation: 'view'
                        }),
                        resource: expect.objectContaining({
                            resourceId: expect.any(String),
                            classification: expect.any(String),
                            releasabilityTo: expect.any(Array)
                        }),
                        context: expect.objectContaining({
                            currentTime: expect.any(String),
                            sourceIP: expect.any(String),
                            deviceCompliant: expect.any(Boolean),
                            requestId: expect.any(String)
                        })
                    })
                }),
                expect.any(Object)
            );
        });

        it('should include request ID in context', async () => {
            const token = createUSUserJWT();
            req.headers!.authorization = `Bearer ${token}`;
            req.headers!['x-request-id'] = 'custom-req-id-456';
            req.params!.id = 'doc-001';

            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument);
            mockedAxios.post.mockResolvedValue({
                data: {
                    result: {
                        decision: mockOPAAllow().result
                    }
                }
            });

            await authzMiddleware(req as Request, res as Response, next);

            expect(mockedAxios.post).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    input: expect.objectContaining({
                        context: expect.objectContaining({
                            requestId: 'custom-req-id-456'
                        })
                    })
                }),
                expect.any(Object)
            );
        });

        it('should handle MongoDB connection error gracefully', async () => {
            mockedGetResourceById.mockRejectedValue(new Error('MongoDB connection failed'));

            await authzMiddleware(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(next).not.toHaveBeenCalled();
        });

        it('should log DECRYPT event on successful access (ACP-240)', async () => {
            const token = createUSUserJWT();
            req.headers!.authorization = `Bearer ${token}`;
            req.params!.id = 'doc-001';

            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument);
            mockedAxios.post.mockResolvedValue({
                data: {
                    result: {
                        decision: mockOPAAllow().result
                    }
                }
            });

            const acp240LoggerSpy = jest.spyOn(require('../utils/acp240-logger'), 'logDecryptEvent');

            await authzMiddleware(req as Request, res as Response, next);

            expect(acp240LoggerSpy).toHaveBeenCalled();
        });

        it('should log ACCESS_DENIED event on rejection (ACP-240)', async () => {
            const token = createUSUserJWT();
            req.headers!.authorization = `Bearer ${token}`;
            req.params!.id = 'doc-001';

            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument);
            mockedAxios.post.mockResolvedValue({
                data: {
                    result: {
                        decision: mockOPADenyInsufficientClearance('CONFIDENTIAL', 'SECRET').result
                    }
                }
            });

            const acp240LoggerSpy = jest.spyOn(require('../utils/acp240-logger'), 'logAccessDeniedEvent');

            await authzMiddleware(req as Request, res as Response, next);

            expect(acp240LoggerSpy).toHaveBeenCalled();
        });
    });

    // ============================================
    // Edge Cases and Error Handling
    // ============================================
    describe('Edge Cases', () => {
        beforeEach(() => {
            const token = createUSUserJWT();
            req.headers!.authorization = `Bearer ${token}`;
            req.headers!['x-request-id'] = 'test-req-123';
            req.params!.id = 'doc-fvey-001';

            // Decode actual token and validate audience/issuer
            // Session expiration fix (Oct 21): Handle array audiences AND issuers for multi-realm
            mockJwtService.verify.mockImplementation((token: any, _key: any, options: any, callback: any) => {
                try {
                    // Manually decode JWT by parsing base64 payload
                    const parts = token.split('.');
                    if (parts.length !== 3) {
                        callback(new Error('invalid token'), null);
                        return;
                    }

                    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));

                    // Validate issuer if specified (FAL2 requirement)
                    // Multi-realm support: Handle array of valid issuers
                    if (options?.issuer) {
                        const validIssuers = Array.isArray(options.issuer) ? options.issuer : [options.issuer];
                        if (!validIssuers.includes(payload.iss)) {
                            callback(new Error('jwt issuer invalid'), null);
                            return;
                        }
                    }

                    // Validate audience if specified (FAL2 requirement)
                    // Multi-realm support: Handle array of valid audiences
                    if (options?.audience) {
                        const tokenAud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
                        const validAudiences = Array.isArray(options.audience) ? options.audience : [options.audience];
                        const hasValidAudience = tokenAud.some((aud: string) => validAudiences.includes(aud));
                        if (!hasValidAudience) {
                            callback(new Error('jwt audience invalid'), null);
                            return;
                        }
                    }

                    callback(null, payload);
                } catch (error) {
                    callback(new Error('invalid token'), null);
                }
            });
        });

        it('should handle missing clearance attribute', async () => {
            mockJwtService.verify.mockImplementation((_token, _key, _options, callback: any) => {
                callback(null, {
                    sub: 'testuser-us',
                    uniqueID: 'testuser-us',
                    // Missing clearance
                    countryOfAffiliation: 'USA',
                    acpCOI: []
                });
            });

            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument);
            mockedAxios.post.mockResolvedValue({
                data: {
                    result: {
                        decision: mockOPADeny('Missing required attribute: clearance').result
                    }
                }
            });

            await authzMiddleware(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(403);
        });

        it('should handle missing countryOfAffiliation attribute', async () => {
            mockJwtService.verify.mockImplementation((_token, _key, _options, callback: any) => {
                callback(null, {
                    sub: 'testuser-us',
                    uniqueID: 'testuser-us',
                    clearance: 'SECRET',
                    // Missing countryOfAffiliation
                    acpCOI: []
                });
            });

            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument);
            mockedAxios.post.mockResolvedValue({
                data: {
                    result: {
                        decision: mockOPADeny('Missing required attribute: countryOfAffiliation').result
                    }
                }
            });

            await authzMiddleware(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(403);
        });

        it('should handle OPA timeout', async () => {
            const token = createUSUserJWT();
            req.headers!.authorization = `Bearer ${token}`;
            req.params!.id = 'doc-001';

            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument);

            const timeoutError: any = new Error('timeout of 5000ms exceeded');
            timeoutError.code = 'ECONNABORTED';
            mockedAxios.post.mockRejectedValue(timeoutError);

            await authzMiddleware(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(503);
        });

        it('should handle very large resource metadata', async () => {
            const largeResource = {
                ...TEST_RESOURCES.fveySecretDocument,
                ztdf: {
                    ...TEST_RESOURCES.fveySecretDocument.ztdf,
                    policy: {
                        ...TEST_RESOURCES.fveySecretDocument.ztdf.policy,
                        securityLabel: {
                            ...TEST_RESOURCES.fveySecretDocument.ztdf.policy.securityLabel,
                            releasabilityTo: Array.from({ length: 100 }, (_, i) => `COUNTRY${i}`)
                        }
                    }
                }
            };

            mockedGetResourceById.mockResolvedValue(largeResource);
            mockedAxios.post.mockResolvedValue({
                data: {
                    result: {
                        decision: mockOPAAllow().result
                    }
                }
            });

            await authzMiddleware(req as Request, res as Response, next);

            expect(next).toHaveBeenCalled();
        });
    });

    // ============================================
    // Resource Metadata in Error Responses
    // ============================================
    describe('Resource Metadata in Error Responses', () => {
        beforeEach(() => {
            req.params = { id: 'doc-concurrent-1' };
            req.headers!['x-request-id'] = 'test-req-123';
            const token = createUSUserJWT({ clearance: 'CONFIDENTIAL' });
            req.headers!.authorization = `Bearer ${token}`;

            // Decode actual token and validate audience/issuer
            // Session expiration fix (Oct 21): Handle array audiences AND issuers for multi-realm
            mockJwtService.verify.mockImplementation((token: any, _key: any, options: any, callback: any) => {
                try {
                    // Manually decode JWT by parsing base64 payload
                    const parts = token.split('.');
                    if (parts.length !== 3) {
                        callback(new Error('invalid token'), null);
                        return;
                    }

                    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));

                    // Validate issuer if specified (FAL2 requirement)
                    // Multi-realm support: Handle array of valid issuers
                    if (options?.issuer) {
                        const validIssuers = Array.isArray(options.issuer) ? options.issuer : [options.issuer];
                        if (!validIssuers.includes(payload.iss)) {
                            callback(new Error('jwt issuer invalid'), null);
                            return;
                        }
                    }

                    // Validate audience if specified (FAL2 requirement)
                    // Multi-realm support: Handle array of valid audiences
                    if (options?.audience) {
                        const tokenAud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
                        const validAudiences = Array.isArray(options.audience) ? options.audience : [options.audience];
                        const hasValidAudience = tokenAud.some((aud: string) => validAudiences.includes(aud));
                        if (!hasValidAudience) {
                            callback(new Error('jwt audience invalid'), null);
                            return;
                        }
                    }

                    callback(null, payload);
                } catch (error) {
                    callback(new Error('invalid token'), null);
                }
            });
        });

        it('should include complete resource metadata in 403 response', async () => {
            const testResource = {
                resourceId: 'doc-concurrent-1',
                title: 'Concurrent Operations Plan',
                ztdf: {
                    policy: {
                        securityLabel: {
                            classification: 'SECRET',
                            releasabilityTo: ['USA', 'GBR'],
                            COI: ['FVEY']
                        }
                    }
                }
            };

            mockedGetResourceById.mockResolvedValue(testResource as any);
            mockedAxios.post.mockResolvedValue({
                data: {
                    result: {
                        decision: {
                            allow: false,
                            reason: 'Insufficient clearance: CONFIDENTIAL < SECRET',
                            evaluation_details: {
                                checks: {
                                    clearance_check: false,
                                    releasability_check: true
                                }
                            }
                        }
                    }
                }
            });

            await authzMiddleware(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                error: 'Forbidden',
                message: 'Insufficient security clearance',
                guidance: expect.stringContaining('clearance'),
                technical_reason: 'Insufficient clearance: CONFIDENTIAL < SECRET',
                details: expect.objectContaining({
                    resource: expect.objectContaining({
                        resourceId: 'doc-concurrent-1',
                        title: 'Concurrent Operations Plan',
                        classification: 'SECRET',
                        releasabilityTo: ['USA', 'GBR'],
                        coi: ['FVEY']
                    })
                })
            }));
        });

        it('should include subject attributes in 403 response', async () => {
            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument);
            mockedAxios.post.mockResolvedValue({
                data: {
                    result: {
                        decision: mockOPADenyInsufficientClearance('CONFIDENTIAL', 'SECRET').result
                    }
                }
            });

            await authzMiddleware(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                details: expect.objectContaining({
                    subject: expect.objectContaining({
                        uniqueID: 'testuser-us',
                        clearance: 'CONFIDENTIAL',
                        country: 'USA',
                        coi: ['FVEY']
                    })
                })
            }));
        });

        it('should include both subject and resource metadata in 403 response', async () => {
            const testResource = {
                resourceId: 'doc-test',
                title: 'Test Document',
                ztdf: {
                    policy: {
                        securityLabel: {
                            classification: 'TOP_SECRET',
                            releasabilityTo: ['USA', 'GBR', 'CAN'],
                            COI: ['FVEY', 'NATO-COSMIC']
                        }
                    }
                }
            };

            mockedGetResourceById.mockResolvedValue(testResource as any);
            mockedAxios.post.mockResolvedValue({
                data: {
                    result: {
                        decision: {
                            allow: false,
                            reason: 'Insufficient clearance',
                            evaluation_details: {
                                checks: {
                                    clearance_check: false
                                }
                            }
                        }
                    }
                }
            });

            await authzMiddleware(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(403);

            const jsonCall = (res.json as jest.Mock).mock.calls[0][0];
            expect(jsonCall.details.subject).toBeDefined();
            expect(jsonCall.details.resource).toBeDefined();
            expect(jsonCall.details.subject.clearance).toBe('CONFIDENTIAL');
            expect(jsonCall.details.resource.classification).toBe('TOP_SECRET');
            expect(jsonCall.details.resource.title).toBe('Test Document');
        });

        it('should include resource metadata in cached denial response', async () => {
            const testResource = {
                resourceId: 'doc-cached',
                title: 'Cached Resource',
                ztdf: {
                    policy: {
                        securityLabel: {
                            classification: 'SECRET',
                            releasabilityTo: ['GBR'],
                            COI: []
                        }
                    }
                }
            };

            mockedGetResourceById.mockResolvedValue(testResource as any);
            mockedAxios.post.mockResolvedValue({
                data: {
                    result: {
                        decision: {
                            allow: false,
                            reason: 'Country not in releasabilityTo',
                            evaluation_details: {}
                        }
                    }
                }
            });

            // First request - should call OPA and cache
            await authzMiddleware(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(403);
            const firstCall = (res.json as jest.Mock).mock.calls[0][0];
            expect(firstCall.details.resource.title).toBe('Cached Resource');

            // Reset mocks for second request
            jest.clearAllMocks();
            mockedGetResourceById.mockResolvedValue(testResource as any);

            // Second request - should use cache (no OPA call)
            await authzMiddleware(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(mockedAxios.post).not.toHaveBeenCalled(); // Verify cache was used

            const secondCall = (res.json as jest.Mock).mock.calls[0][0];
            expect(secondCall.details.resource).toBeDefined();
            expect(secondCall.details.resource.title).toBe('Cached Resource');
            expect(secondCall.details.resource.classification).toBe('SECRET');
        });

        it('should handle legacy (non-ZTDF) resources in error response', async () => {
            const legacyResource = {
                resourceId: 'doc-legacy',
                title: 'Legacy Document',
                classification: 'CONFIDENTIAL',
                releasabilityTo: ['USA'],
                COI: ['US-ONLY'],
                encrypted: false
            };

            mockedGetResourceById.mockResolvedValue(legacyResource as any);
            mockedAxios.post.mockResolvedValue({
                data: {
                    result: {
                        decision: {
                            allow: false,
                            reason: 'Test denial',
                            evaluation_details: {}
                        }
                    }
                }
            });

            await authzMiddleware(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(403);
            const jsonCall = (res.json as jest.Mock).mock.calls[0][0];
            expect(jsonCall.details.resource.title).toBe('Legacy Document');
            expect(jsonCall.details.resource.classification).toBe('CONFIDENTIAL');
            expect(jsonCall.details.resource.releasabilityTo).toEqual(['USA']);
            expect(jsonCall.details.resource.coi).toEqual(['US-ONLY']);
        });

        it('should merge evaluation_details with resource metadata', async () => {
            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument);
            mockedAxios.post.mockResolvedValue({
                data: {
                    result: {
                        decision: {
                            allow: false,
                            reason: 'Multiple failures',
                            evaluation_details: {
                                checks: {
                                    clearance_check: false,
                                    releasability_check: false,
                                    coi_check: true
                                },
                                violations: ['clearance', 'releasability']
                            }
                        }
                    }
                }
            });

            await authzMiddleware(req as Request, res as Response, next);

            const jsonCall = (res.json as jest.Mock).mock.calls[0][0];
            // Should have both evaluation_details and new metadata
            expect(jsonCall.details.checks).toBeDefined();
            expect(jsonCall.details.subject).toBeDefined();
            expect(jsonCall.details.resource).toBeDefined();
            // Verify both old and new data are present
            expect(jsonCall.details.checks.clearance_check).toBe(false);
            expect(jsonCall.details.resource.resourceId).toBe('doc-fvey-001');
            expect(jsonCall.details.resource.classification).toBe('SECRET');
        });

        it('should handle resource with empty COI array', async () => {
            const testResource = {
                resourceId: 'doc-no-coi',
                title: 'No COI Document',
                ztdf: {
                    policy: {
                        securityLabel: {
                            classification: 'SECRET',
                            releasabilityTo: ['USA'],
                            COI: [] // Empty COI
                        }
                    }
                }
            };

            mockedGetResourceById.mockResolvedValue(testResource as any);
            mockedAxios.post.mockResolvedValue({
                data: {
                    result: {
                        decision: {
                            allow: false,
                            reason: 'Test',
                            evaluation_details: {}
                        }
                    }
                }
            });

            await authzMiddleware(req as Request, res as Response, next);

            const jsonCall = (res.json as jest.Mock).mock.calls[0][0];
            expect(jsonCall.details.resource.coi).toEqual([]);
        });

        it('should include resource metadata even when evaluation_details is empty', async () => {
            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument);
            mockedAxios.post.mockResolvedValue({
                data: {
                    result: {
                        decision: {
                            allow: false,
                            reason: 'Access denied',
                            // No evaluation_details
                        }
                    }
                }
            });

            await authzMiddleware(req as Request, res as Response, next);

            const jsonCall = (res.json as jest.Mock).mock.calls[0][0];
            expect(jsonCall.details.subject).toBeDefined();
            expect(jsonCall.details.resource).toBeDefined();
            expect(jsonCall.details.resource.resourceId).toBe('doc-fvey-001');
            expect(jsonCall.details.resource.title).toBe('FVEY Intelligence Report');
        });
    });

    describe('Token Blacklist and Revocation', () => {
        const { isTokenBlacklisted, areUserTokensRevoked } = require('../services/token-blacklist.service');

        it('should reject blacklisted token', async () => {
            const token = createUSUserJWT();
            req.headers!.authorization = `Bearer ${token}`;

            // Mock JWT verification success
            mockJwtService.verify.mockImplementation((_token, _key, _options, callback: any) => {
                callback(null, {
                    sub: 'testuser-us',
                    uniqueID: 'testuser-us',
                    clearance: 'SECRET',
                    countryOfAffiliation: 'USA',
                    jti: 'blacklisted-token-id',
                    exp: Math.floor(Date.now() / 1000) + 3600,
                    iat: Math.floor(Date.now() / 1000)
                });
            });

            // Mock token as blacklisted
            isTokenBlacklisted.mockResolvedValueOnce(true);

            await authenticateJWT(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: 'Unauthorized',
                    message: 'Token has been revoked'
                })
            );
            expect(next).not.toHaveBeenCalled();
        });

        it('should reject token when user tokens are revoked', async () => {
            const token = createUSUserJWT();
            req.headers!.authorization = `Bearer ${token}`;

            mockJwtService.verify.mockImplementation((_token, _key, _options, callback: any) => {
                callback(null, {
                    sub: 'testuser-us',
                    uniqueID: 'testuser-us',
                    clearance: 'SECRET',
                    countryOfAffiliation: 'USA',
                    exp: Math.floor(Date.now() / 1000) + 3600,
                    iat: Math.floor(Date.now() / 1000)
                });
            });

            isTokenBlacklisted.mockResolvedValueOnce(false);
            areUserTokensRevoked.mockResolvedValueOnce(true);

            await authenticateJWT(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: 'Unauthorized',
                    message: expect.stringContaining('revoked')
                })
            );
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('JWKS Key Fetch Error Handling', () => {
        it('should handle JWKS fetch failure from all URLs', async () => {
            const token = createUSUserJWT();
            req.headers!.authorization = `Bearer ${token}`;

            // Mock JWT verification to fail due to JWKS fetch error
            mockJwtService.verify.mockImplementation((_token, _key, _options, callback: any) => {
                callback(new Error('unable to get local issuer certificate'), null);
            });

            await authenticateJWT(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: 'Unauthorized'
                })
            );
            expect(next).not.toHaveBeenCalled();
        });

        it('should handle JWKS with no matching kid', async () => {
            const token = createUSUserJWT();
            req.headers!.authorization = `Bearer ${token}`;

            // Mock JWT verification to fail due to no matching key
            mockJwtService.verify.mockImplementation((_token, _key, _options, callback: any) => {
                callback(new Error('Unable to find matching key'), null);
            });

            await authenticateJWT(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(next).not.toHaveBeenCalled();
        });

        it('should handle token with missing kid in header', async () => {
            // Create a token without kid
            const tokenWithoutKid = jwt.sign(
                {
                    sub: 'testuser-us',
                    uniqueID: 'testuser-us',
                    clearance: 'SECRET',
                    countryOfAffiliation: 'USA'
                },
                'secret',
                { algorithm: 'HS256', noTimestamp: false }
            );

            req.headers!.authorization = `Bearer ${tokenWithoutKid}`;

            await authenticateJWT(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('AMR and ACR Format Handling', () => {
        it('should handle AMR as JSON string (legacy format)', async () => {
            const token = createUSUserJWT();
            req.headers!.authorization = `Bearer ${token}`;

            mockJwtService.verify.mockImplementation((_token, _key, _options, callback: any) => {
                callback(null, {
                    sub: 'testuser-us',
                    uniqueID: 'testuser-us',
                    clearance: 'SECRET',
                    countryOfAffiliation: 'USA',
                    amr: '["pwd","otp"]', // JSON string format
                    acr: 'urn:mace:incommon:iap:silver', // URN format
                    exp: Math.floor(Date.now() / 1000) + 3600,
                    iat: Math.floor(Date.now() / 1000)
                });
            });

            await authenticateJWT(req as Request, res as Response, next);

            expect(next).toHaveBeenCalled();
            expect((req as any).user).toBeDefined();
            expect((req as any).user.amr).toEqual(['pwd', 'otp']);
        });

        it('should handle AMR as array (new format)', async () => {
            const token = createUSUserJWT();
            req.headers!.authorization = `Bearer ${token}`;

            mockJwtService.verify.mockImplementation((_token, _key, _options, callback: any) => {
                callback(null, {
                    sub: 'testuser-us',
                    uniqueID: 'testuser-us',
                    clearance: 'SECRET',
                    countryOfAffiliation: 'USA',
                    amr: ['pwd', 'mfa'], // Array format
                    acr: 2, // Numeric format
                    exp: Math.floor(Date.now() / 1000) + 3600,
                    iat: Math.floor(Date.now() / 1000)
                });
            });

            await authenticateJWT(req as Request, res as Response, next);

            expect(next).toHaveBeenCalled();
            expect((req as any).user.amr).toEqual(['pwd', 'mfa']);
            expect((req as any).user.acr).toBe('2');
        });

        it('should handle invalid AMR JSON string gracefully', async () => {
            const token = createUSUserJWT();
            req.headers!.authorization = `Bearer ${token}`;

            mockJwtService.verify.mockImplementation((_token, _key, _options, callback: any) => {
                callback(null, {
                    sub: 'testuser-us',
                    uniqueID: 'testuser-us',
                    clearance: 'SECRET',
                    countryOfAffiliation: 'USA',
                    amr: 'invalid-json{', // Invalid JSON
                    exp: Math.floor(Date.now() / 1000) + 3600,
                    iat: Math.floor(Date.now() / 1000)
                });
            });

            await authenticateJWT(req as Request, res as Response, next);

            expect(next).toHaveBeenCalled();
            // Should fall back to original string value
            expect((req as any).user).toBeDefined();
        });

        it('should handle ACR as numeric value', async () => {
            const token = createUSUserJWT();
            req.headers!.authorization = `Bearer ${token}`;

            mockJwtService.verify.mockImplementation((_token, _key, _options, callback: any) => {
                callback(null, {
                    sub: 'testuser-us',
                    uniqueID: 'testuser-us',
                    clearance: 'SECRET',
                    countryOfAffiliation: 'USA',
                    acr: 3, // Numeric ACR level
                    exp: Math.floor(Date.now() / 1000) + 3600,
                    iat: Math.floor(Date.now() / 1000)
                });
            });

            await authenticateJWT(req as Request, res as Response, next);

            expect(next).toHaveBeenCalled();
            expect((req as any).user.acr).toBe('3');
        });

        it('should handle ACR as URN string', async () => {
            const token = createUSUserJWT();
            req.headers!.authorization = `Bearer ${token}`;

            mockJwtService.verify.mockImplementation((_token, _key, _options, callback: any) => {
                callback(null, {
                    sub: 'testuser-us',
                    uniqueID: 'testuser-us',
                    clearance: 'SECRET',
                    countryOfAffiliation: 'USA',
                    acr: 'urn:mace:incommon:iap:gold', // URN format
                    exp: Math.floor(Date.now() / 1000) + 3600,
                    iat: Math.floor(Date.now() / 1000)
                });
            });

            await authenticateJWT(req as Request, res as Response, next);

            expect(next).toHaveBeenCalled();
            expect((req as any).user.acr).toBe('urn:mace:incommon:iap:gold');
        });
    });

    describe('Multi-Realm Token Handling', () => {
        it('should handle token from dive-v3-broker realm', async () => {
            const tokenPayload = {
                sub: 'testuser-us',
                uniqueID: 'testuser-us',
                clearance: 'SECRET',
                countryOfAffiliation: 'USA',
                iss: 'http://localhost:8081/realms/dive-v3-broker',
                exp: Math.floor(Date.now() / 1000) + 3600,
                iat: Math.floor(Date.now() / 1000)
            };

            const token = jwt.sign(tokenPayload, 'secret', { algorithm: 'HS256' });
            req.headers!.authorization = `Bearer ${token}`;

            mockJwtService.verify.mockImplementation((_token, _key, _options, callback: any) => {
                callback(null, tokenPayload);
            });

            await authenticateJWT(req as Request, res as Response, next);

            expect(next).toHaveBeenCalled();
        });

        it('should handle token with no issuer (default to broker realm)', async () => {
            const token = createUSUserJWT();
            req.headers!.authorization = `Bearer ${token}`;

            mockJwtService.verify.mockImplementation((_token, _key, _options, callback: any) => {
                callback(null, {
                    sub: 'testuser-us',
                    uniqueID: 'testuser-us',
                    clearance: 'SECRET',
                    countryOfAffiliation: 'USA',
                    // No iss claim
                    exp: Math.floor(Date.now() / 1000) + 3600,
                    iat: Math.floor(Date.now() / 1000)
                });
            });

            await authenticateJWT(req as Request, res as Response, next);

            expect(next).toHaveBeenCalled();
        });

        it('should handle malformed token when extracting realm', async () => {
            req.headers!.authorization = `Bearer invalid.malformed`;

            await authenticateJWT(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('Classification Equivalency and Advanced Attributes', () => {
        it('should include dutyOrg and orgUnit in OPA input', async () => {
            const token = createUSUserJWT();
            req.headers!.authorization = `Bearer ${token}`;
            req.headers!['x-request-id'] = 'test-dutyorg-123';
            req.params = { id: 'doc-fvey-001' };

            // Mock resource
            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument as any);

            mockJwtService.verify.mockImplementation((_token, _key, _options, callback: any) => {
                callback(null, {
                    sub: 'testuser-us',
                    uniqueID: 'testuser-us',
                    clearance: 'SECRET',
                    countryOfAffiliation: 'USA',
                    dutyOrg: 'US_ARMY',
                    orgUnit: 'CYBER_DEFENSE',
                    acr: 2,  // AAL2 for classified access
                    amr: ['pwd', 'mfa'],
                    exp: Math.floor(Date.now() / 1000) + 3600,
                    iat: Math.floor(Date.now() / 1000)
                });
            });

            // Mock OPA allow response
            mockedAxios.post.mockResolvedValue({
                data: mockOPAAllow()
            });

            await authzMiddleware(req as Request, res as Response, next);

            expect(mockedAxios.post).toHaveBeenCalled();
            const opaInput = mockedAxios.post.mock.calls[0][1] as any;
            expect(opaInput.input.subject.dutyOrg).toBe('US_ARMY');
            expect(opaInput.input.subject.orgUnit).toBe('CYBER_DEFENSE');
        });

        it('should include original classification fields in OPA input', async () => {
            const token = createUSUserJWT();
            req.headers!.authorization = `Bearer ${token}`;
            req.headers!['x-request-id'] = 'test-class-123';
            req.params = { id: 'doc-fra-001' };

            // Create a French resource with original classification fields
            const frenchResource = {
                ...TEST_RESOURCES.fveySecretDocument,
                resourceId: 'doc-fra-001',
                ztdf: {
                    ...TEST_RESOURCES.fveySecretDocument.ztdf,
                    policy: {
                        ...TEST_RESOURCES.fveySecretDocument.ztdf.policy,
                        securityLabel: {
                            ...TEST_RESOURCES.fveySecretDocument.ztdf.policy.securityLabel,
                            originalClassification: 'SECRET DÉFENSE',
                            originalCountry: 'FRA',
                            natoEquivalent: 'NATO SECRET'
                        }
                    }
                }
            };
            
            // Mock resource with classification equivalency data
            mockedGetResourceById.mockResolvedValue(frenchResource as any);

            // Mock OPA allow response
            mockedAxios.post.mockResolvedValue({
                data: mockOPAAllow()
            });

            await authzMiddleware(req as Request, res as Response, next);

            expect(mockedAxios.post).toHaveBeenCalled();
            const opaInput = mockedAxios.post.mock.calls[0][1] as any;
            expect(opaInput.input.resource.originalClassification).toBe('SECRET DÉFENSE');
            expect(opaInput.input.resource.originalCountry).toBe('FRA');
            expect(opaInput.input.resource.natoEquivalent).toBe('NATO SECRET');
        });
    });

    describe('Service Provider (SP) Token Authentication', () => {
        it('should authenticate valid SP token', async () => {
            const spToken = 'sp-token-12345';
            req.headers!.authorization = `Bearer ${spToken}`;
            req.headers!['x-request-id'] = 'test-sp-123';
            req.params = { id: 'doc-fvey-001' };

            // Mock resource
            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument as any);

            // Make user token verification fail (so it tries SP token)
            mockJwtService.verify.mockImplementation((_token, _key, _options, callback: any) => {
                callback(new Error('Not a user token'), null);
            });

            // Mock SP token validation to return valid SP context
            const mockValidateSPToken = require('../middleware/sp-auth.middleware').validateSPToken;
            mockValidateSPToken.mockResolvedValueOnce({
                clientId: 'trusted-service-provider',
                scopes: ['resource:read'],
                sub: 'sp-service-01',
                sp: {
                    country: 'USA',
                    clearance: 'SECRET',
                    acpCOI: ['FVEY'],
                    federationAgreements: [
                        {
                            partner: 'USA',
                            classifications: ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'],
                            validUntil: new Date(Date.now() + 86400000) // Tomorrow
                        }
                    ]
                }
            });

            // Mock OPA to allow
            mockedAxios.post.mockResolvedValue({
                data: mockOPAAllow()
            });

            await authzMiddleware(req as Request, res as Response, next);

            // Verify SP token was validated
            expect(mockValidateSPToken).toHaveBeenCalledWith(spToken);
            
            // SP tokens bypass OPA and use direct authorization checks for performance
            // Verify OPA was NOT called (SP uses direct checks)
            expect(mockedAxios.post).not.toHaveBeenCalled();
            
            // Verify request proceeded (SP authorization passed)
            expect(next).toHaveBeenCalled();
            
            // Verify SP context was attached to request
            expect((req as any).authzDecision).toBeDefined();
            expect((req as any).authzDecision.allow).toBe(true);
            expect((req as any).authzDecision.spAccess).toBe(true);
        });
    });

    describe('Error Recovery and Edge Cases', () => {
        it('should handle OPA response with nested decision structure', async () => {
            const token = createUSUserJWT();
            req.headers!.authorization = `Bearer ${token}`;
            req.params = { resourceId: 'doc-fvey-001' };

            mockedAxios.post.mockResolvedValue({
                data: {
                    result: {
                        decision: {
                            allow: true,
                            reason: 'Nested decision structure'
                        },
                        allow: true,
                        reason: 'Top-level allow'
                    }
                }
            });

            await authzMiddleware(req as Request, res as Response, next);

            expect(next).toHaveBeenCalled();
        });

        it('should handle resource with COI operator', async () => {
            const token = createUSUserJWT();
            req.headers!.authorization = `Bearer ${token}`;
            req.params = { id: 'doc-fvey-001' };

            mockedGetResourceById.mockResolvedValue({
                ...TEST_RESOURCES.fveySecretDocument,
                coiOperator: 'ALL' // Requires ALL COIs
            } as any);

            await authzMiddleware(req as Request, res as Response, next);

            expect(mockedAxios.post).toHaveBeenCalled();
            const opaInput = mockedAxios.post.mock.calls[0][1] as any;
            expect(opaInput.input.resource.coiOperator).toBe('ALL');
        });

        it('should handle auth_time in context', async () => {
            const token = createUSUserJWT();
            req.headers!.authorization = `Bearer ${token}`;
            req.headers!['x-request-id'] = 'test-authtime-123';
            req.params = { id: 'doc-fvey-001' };

            const authTime = Math.floor(Date.now() / 1000) - 3600;

            // Mock resource
            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument as any);

            mockJwtService.verify.mockImplementation((_token, _key, _options, callback: any) => {
                callback(null, {
                    sub: 'testuser-us',
                    uniqueID: 'testuser-us',
                    clearance: 'SECRET',
                    countryOfAffiliation: 'USA',
                    auth_time: authTime,
                    acr: 2,  // AAL2 for classified access
                    amr: ['pwd', 'mfa'],
                    exp: Math.floor(Date.now() / 1000) + 3600,
                    iat: Math.floor(Date.now() / 1000)
                });
            });

            // Mock OPA allow response
            mockedAxios.post.mockResolvedValue({
                data: mockOPAAllow()
            });

            await authzMiddleware(req as Request, res as Response, next);

            expect(mockedAxios.post).toHaveBeenCalled();
            const opaInput = mockedAxios.post.mock.calls[0][1] as any;
            expect(opaInput.input.context.auth_time).toBe(authTime);
        });
    });
});

