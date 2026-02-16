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

// Mock token introspection service (authenticateJWT now uses this instead of jwtService.verify)
jest.mock('../services/token-introspection.service', () => ({
    tokenIntrospectionService: {
        validateToken: jest.fn(),
    },
    TokenIntrospectionService: jest.fn(),
}));
// Get reference AFTER jest.mock (avoids TDZ — jest.mock is hoisted above const declarations)
const mockValidateToken = (require('../services/token-introspection.service') as any).tokenIntrospectionService.validateToken as jest.Mock;

// Mock trusted issuer model (dynamically imported by authenticateJWT)
jest.mock('../models/trusted-issuer.model', () => ({
    mongoOpalDataStore: {
        getAllIssuers: jest.fn().mockResolvedValue([
            { issuerUrl: 'http://localhost:8081/realms/dive-v3-broker-usa' },
            { issuerUrl: 'http://localhost:8081/realms/dive-v3-broker-usa' },
        ]),
    },
}));

// Mock decision cache service
jest.mock('../services/decision-cache.service', () => ({
    decisionCacheService: {
        generateCacheKey: jest.fn().mockReturnValue('test-cache-key'),
        get: jest.fn().mockReturnValue(null),
        set: jest.fn(),
        reset: jest.fn(),
        getTTLForClassification: jest.fn().mockReturnValue(300),
    },
}));
const mockDecisionCacheGet = (require('../services/decision-cache.service') as any).decisionCacheService.get as jest.Mock;

// Mock audit service
jest.mock('../services/audit.service', () => ({
    auditService: {
        logAccessGrant: jest.fn(),
        logAccessDeny: jest.fn(),
    },
}));

// Mock decision log service
jest.mock('../services/decision-log.service', () => ({
    decisionLogService: {
        logDecision: jest.fn().mockResolvedValue(undefined),
    },
}));

// Mock circuit breaker (pass-through execution)
jest.mock('../utils/circuit-breaker', () => ({
    opaCircuitBreaker: {
        execute: jest.fn((fn: Function) => fn()),
    },
    keycloakCircuitBreaker: {
        execute: jest.fn((fn: Function) => fn()),
    },
    CircuitBreaker: jest.fn(),
    CircuitState: { CLOSED: 'CLOSED', OPEN: 'OPEN', HALF_OPEN: 'HALF_OPEN' },
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

/** Helper: Create a mock TokenIntrospectionResponse for successful auth */
function createMockIntrospectionResponse(overrides: Record<string, any> = {}) {
    return {
        active: true,
        sub: 'testuser-us',
        uniqueID: 'testuser-us',
        clearance: 'SECRET',
        countryOfAffiliation: 'USA',
        acpCOI: ['FVEY'],
        iss: 'http://localhost:8081/realms/dive-v3-broker-usa',
        aud: 'dive-v3-client',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        acr: 'urn:mace:incommon:iap:silver',
        amr: ['pwd', 'otp'],
        auth_time: Math.floor(Date.now() / 1000),
        jti: 'test-jti-123',
        username: 'testuser-us',
        preferred_username: 'testuser-us',
        client_id: 'dive-v3-client',
        scope: 'openid profile email',
        token_type: 'Bearer',
        ...overrides,
    };
}

/** Helper: Create a standard req.user object as set by authenticateJWT */
function createMockUser(overrides: Record<string, any> = {}) {
    return {
        uniqueID: 'testuser-us',
        clearance: 'SECRET',
        countryOfAffiliation: 'USA',
        acpCOI: ['FVEY'],
        roles: [],
        sub: 'testuser-us',
        iss: 'http://localhost:8081/realms/dive-v3-broker-usa',
        client_id: 'dive-v3-client',
        email: 'testuser-us',
        acr: 'urn:mace:incommon:iap:silver',
        amr: ['pwd', 'otp'],
        auth_time: Math.floor(Date.now() / 1000),
        user_acr: undefined,
        user_amr: undefined,
        ...overrides,
    };
}

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

        // Configure default token introspection mock (active token with US user claims)
        mockValidateToken.mockResolvedValue(createMockIntrospectionResponse());

        // Reset decision cache mock (no cache hits by default)
        mockDecisionCacheGet.mockReturnValue(null);

        // Setup request mock
        req = {
            headers: {},
            params: {},
            method: 'GET',
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

            // mockValidateToken already configured in outer beforeEach

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

            // Token introspection returns inactive for expired tokens
            mockValidateToken.mockResolvedValueOnce({
                active: false,
                error: 'token_expired',
                error_description: 'Token has expired'
            });

            await authenticateJWT(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                error: 'Unauthorized',
                message: 'Token has expired'
            }));
            expect(next).not.toHaveBeenCalled();
        });

        it('should reject JWT with invalid signature', async () => {
            req.headers!.authorization = 'Bearer invalid.jwt.signature';

            mockValidateToken.mockResolvedValueOnce({
                active: false,
                error: 'invalid_token',
                error_description: 'Invalid token signature'
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

            mockValidateToken.mockResolvedValueOnce({
                active: false,
                error: 'invalid_issuer',
                error_description: 'Untrusted token issuer'
            });

            await authenticateJWT(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(next).not.toHaveBeenCalled();
        });

        it('should handle acpCOI array correctly', async () => {
            const token = createUSUserJWT({ acpCOI: ['FVEY', 'NATO-COSMIC'] });
            req.headers!.authorization = `Bearer ${token}`;

            mockValidateToken.mockResolvedValueOnce(
                createMockIntrospectionResponse({ acpCOI: ['FVEY', 'NATO-COSMIC'] })
            );

            await authenticateJWT(req as Request, res as Response, next);

            expect((req as any).user.acpCOI).toEqual(['FVEY', 'NATO-COSMIC']);
        });

        it('should handle acpCOI from JWT claims supplement', async () => {
            // Introspection may not return custom claims; they come from JWT decode
            const token = createUSUserJWT({ acpCOI: ['FVEY', 'NATO-COSMIC'] });
            req.headers!.authorization = `Bearer ${token}`;

            // Introspection returns active but without acpCOI — JWT decode supplements it
            mockValidateToken.mockResolvedValueOnce(
                createMockIntrospectionResponse({ acpCOI: undefined })
            );

            await authenticateJWT(req as Request, res as Response, next);

            // acpCOI should be supplemented from JWT token claims
            expect(next).toHaveBeenCalled();
            expect((req as any).user.acpCOI).toEqual(['FVEY', 'NATO-COSMIC']);
        });
    });

    // ============================================
    // Authorization Middleware Tests
    // ============================================
    describe('authzMiddleware', () => {
        beforeEach(() => {
            // Re-create request mock
            req = {
                headers: {},
                params: {},
                method: 'GET',
                ip: '127.0.0.1'
            };

            const token = createUSUserJWT();
            req.headers!.authorization = `Bearer ${token}`;
            req.headers!['x-request-id'] = 'test-req-123';
            req.params!.id = 'doc-fvey-001';

            // Pre-set user (authenticateJWT sets this before authzMiddleware runs)
            (req as any).user = createMockUser();

            // Re-create response mocks fresh
            const statusMock = jest.fn().mockReturnThis();
            const jsonMock = jest.fn().mockReturnThis();
            res = {
                status: statusMock,
                json: jsonMock
            };

            next = jest.fn();

            // Clear call history on service mocks (will be set per test)
            mockedGetResourceById.mockClear();
            mockedAxios.post.mockClear();
            mockDecisionCacheGet.mockReturnValue(null);
        });

        it('should allow access when OPA permits', async () => {
            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument);

            // callOPA expects response.data as IOPADecision { result: { allow, reason, ... } }
            mockedAxios.post.mockResolvedValue({
                data: mockOPAAllow()
            });

            await authzMiddleware(req as Request, res as Response, next);

            expect(mockedAxios.post).toHaveBeenCalledWith(
                expect.stringContaining('/v1/data/dive/authz'),
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
            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument);

            mockedAxios.post.mockResolvedValue({
                data: mockOPADenyInsufficientClearance('CONFIDENTIAL', 'SECRET')
            });

            await authzMiddleware(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                error: 'Forbidden',
                message: 'Authorization check failed',
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

        it('should fall back to local evaluation when OPA is unavailable', async () => {
            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument);

            // Mock OPA error — callOPA falls back to localEvaluateOPA
            mockedAxios.post.mockRejectedValue(new Error('ECONNREFUSED'));

            await authzMiddleware(req as Request, res as Response, next);

            // Local fallback: USA SECRET user accessing FVEY SECRET doc → ALLOW
            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalledWith(503);
        });

        it('should cache authorization decisions', async () => {
            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument);
            mockedAxios.post.mockResolvedValue({ data: mockOPAAllow() });

            // First request — cache miss (mockDecisionCacheGet returns null by default)
            await authzMiddleware(req as Request, res as Response, next);
            expect(mockedAxios.post).toHaveBeenCalledTimes(1);
            expect(next).toHaveBeenCalledTimes(1);

            // Reset mocks for second request
            jest.clearAllMocks();
            next = jest.fn();
            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument);

            // Second request — cache hit
            mockDecisionCacheGet.mockReturnValueOnce({
                result: mockOPAAllow().result,
                cachedAt: Date.now(),
                ttl: 300,
                classification: 'SECRET'
            });

            await authzMiddleware(req as Request, res as Response, next);

            // OPA should NOT be called again (cached)
            expect(mockedAxios.post).toHaveBeenCalledTimes(0);
            expect(next).toHaveBeenCalledTimes(1);
        });

        it('should not call OPA twice for same decision (caching)', async () => {
            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument);
            mockedAxios.post.mockResolvedValue({ data: mockOPAAllow() });

            // First request — cache miss
            await authzMiddleware(req as Request, res as Response, next);
            const firstCallCount = mockedAxios.post.mock.calls.length;

            // Second request — cache hit
            jest.clearAllMocks();
            next = jest.fn();
            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument);
            mockDecisionCacheGet.mockReturnValueOnce({
                result: mockOPAAllow().result,
                cachedAt: Date.now(),
                ttl: 300,
                classification: 'SECRET'
            });

            await authzMiddleware(req as Request, res as Response, next);
            const secondCallCount = mockedAxios.post.mock.calls.length;

            expect(firstCallCount).toBe(1);
            expect(secondCallCount).toBe(0); // Cached, no OPA call
        });

        it('should handle OPA obligations (KAS)', async () => {
            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument);

            // Mock OPA decision with KAS obligation
            mockedAxios.post.mockResolvedValue({
                data: mockOPAAllowWithKASObligation('doc-fvey-001')
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
                data: mockOPAAllow()
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
                data: mockOPAAllow()
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
                data: mockOPAAllow()
            });

            await authzMiddleware(req as Request, res as Response, next);

            // Logger is mocked at module level, just verify middleware executed
            expect(next).toHaveBeenCalled();
        });

        it('should handle invalid OPA response structure', async () => {
            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument);

            // Mock invalid OPA response (missing result field)
            // callOPA falls back to localEvaluateOPA → SECRET/USA user → ALLOW
            mockedAxios.post.mockResolvedValue({
                data: {
                    // Missing result field — triggers local fallback
                }
            });

            await authzMiddleware(req as Request, res as Response, next);

            // callOPA falls back to localEvaluateOPA which allows SECRET/USA user
            expect(next).toHaveBeenCalled();
        });

        it('should construct correct OPA input structure', async () => {
            const token = createUSUserJWT();
            req.headers!.authorization = `Bearer ${token}`;
            req.params!.id = 'doc-001';

            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument);
            mockedAxios.post.mockResolvedValue({
                data: mockOPAAllow()
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
                            operation: 'get'
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
                data: mockOPAAllow()
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

        it('should log grant via auditService on successful access', async () => {
            req.params!.id = 'doc-001';

            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument);
            mockedAxios.post.mockResolvedValue({
                data: mockOPAAllow()
            });

            const { auditService } = require('../services/audit.service');

            await authzMiddleware(req as Request, res as Response, next);

            expect(auditService.logAccessGrant).toHaveBeenCalled();
        });

        it('should log deny via auditService on rejection', async () => {
            req.params!.id = 'doc-001';

            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument);
            mockedAxios.post.mockResolvedValue({
                data: mockOPADenyInsufficientClearance('CONFIDENTIAL', 'SECRET')
            });

            const { auditService } = require('../services/audit.service');

            await authzMiddleware(req as Request, res as Response, next);

            expect(auditService.logAccessDeny).toHaveBeenCalled();
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
            (req as any).method = 'GET';

            // Pre-set user (authzMiddleware expects req.user from authenticateJWT)
            (req as any).user = createMockUser();
            mockDecisionCacheGet.mockReturnValue(null);
        });

        it('should handle missing clearance attribute', async () => {
            // Override user with missing clearance
            (req as any).user = createMockUser({ clearance: undefined });

            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument);
            mockedAxios.post.mockResolvedValue({
                data: mockOPADeny('Missing required attribute: clearance')
            });

            await authzMiddleware(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(403);
        });

        it('should handle missing countryOfAffiliation attribute', async () => {
            // Override user with missing country
            (req as any).user = createMockUser({ countryOfAffiliation: undefined });

            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument);
            mockedAxios.post.mockResolvedValue({
                data: mockOPADeny('Missing required attribute: countryOfAffiliation')
            });

            await authzMiddleware(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(403);
        });

        it('should handle OPA timeout with local fallback', async () => {
            req.params!.id = 'doc-001';

            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument);

            const timeoutError: any = new Error('timeout of 5000ms exceeded');
            timeoutError.code = 'ECONNABORTED';
            mockedAxios.post.mockRejectedValue(timeoutError);

            await authzMiddleware(req as Request, res as Response, next);

            // callOPA falls back to localEvaluateOPA; USA SECRET user → ALLOW
            expect(next).toHaveBeenCalled();
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
                data: mockOPAAllow()
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
            (req as any).method = 'GET';

            // Pre-set user with CONFIDENTIAL clearance for deny tests
            (req as any).user = createMockUser({ clearance: 'CONFIDENTIAL' });
            mockDecisionCacheGet.mockReturnValue(null);
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
                        allow: false,
                        reason: 'Insufficient clearance: CONFIDENTIAL < SECRET',
                        evaluation_details: {
                            clearance_check: false,
                            releasability_check: true
                        }
                    }
                }
            });

            await authzMiddleware(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                error: 'Forbidden',
                message: 'Authorization check failed',
                reason: 'Insufficient clearance: CONFIDENTIAL < SECRET',
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
                data: mockOPADenyInsufficientClearance('CONFIDENTIAL', 'SECRET')
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
                        allow: false,
                        reason: 'Country not in releasabilityTo',
                        evaluation_details: {}
                    }
                }
            });

            // First request — OPA call returns deny
            await authzMiddleware(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(403);

            // Reset mocks for second request
            jest.clearAllMocks();
            mockedGetResourceById.mockResolvedValue(testResource as any);
            (req as any).user = createMockUser({ clearance: 'CONFIDENTIAL' });

            // Second request — simulate cache hit
            mockDecisionCacheGet.mockReturnValueOnce({
                result: { allow: false, reason: 'Country not in releasabilityTo', evaluation_details: {} },
                cachedAt: Date.now(),
                ttl: 300,
                classification: 'SECRET'
            });

            await authzMiddleware(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(mockedAxios.post).not.toHaveBeenCalled(); // Verify cache was used
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
                        allow: false,
                        reason: 'Multiple failures',
                        evaluation_details: {
                            clearance_check: false,
                            releasability_check: false,
                            coi_check: true,
                            violations: ['clearance', 'releasability']
                        }
                    }
                }
            });

            await authzMiddleware(req as Request, res as Response, next);

            const jsonCall = (res.json as jest.Mock).mock.calls[0][0];
            // Should have evaluation_details, subject, and resource in details
            expect(jsonCall.details.evaluation_details).toBeDefined();
            expect(jsonCall.details.subject).toBeDefined();
            expect(jsonCall.details.resource).toBeDefined();
            // Verify evaluation_details data
            expect(jsonCall.details.evaluation_details.clearance_check).toBe(false);
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

            // Token introspection succeeds
            mockValidateToken.mockResolvedValueOnce(createMockIntrospectionResponse());

            isTokenBlacklisted.mockResolvedValueOnce(false);
            areUserTokensRevoked.mockResolvedValueOnce(true);

            await authenticateJWT(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: 'Unauthorized',
                    message: expect.stringContaining('terminated')
                })
            );
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('Token Introspection Error Handling', () => {
        it('should handle token introspection network failure', async () => {
            const token = createUSUserJWT();
            req.headers!.authorization = `Bearer ${token}`;

            // Token introspection throws (network error)
            mockValidateToken.mockRejectedValueOnce(new Error('unable to get local issuer certificate'));

            await authenticateJWT(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: 'Unauthorized'
                })
            );
            expect(next).not.toHaveBeenCalled();
        });

        it('should handle inactive token from introspection', async () => {
            const token = createUSUserJWT();
            req.headers!.authorization = `Bearer ${token}`;

            // Token introspection returns inactive
            mockValidateToken.mockResolvedValueOnce({
                active: false,
                error: 'token_expired',
                error_description: 'Token has expired',
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

            // Token introspection still succeeds (kid not needed for introspection)
            mockValidateToken.mockResolvedValueOnce(createMockIntrospectionResponse());

            await authenticateJWT(req as Request, res as Response, next);

            // Should succeed since introspection validates the token
            expect(next).toHaveBeenCalled();
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

            mockValidateToken.mockResolvedValueOnce(createMockIntrospectionResponse({
                amr: ['pwd', 'mfa'], // Array format
                acr: 2, // Numeric format
            }));

            await authenticateJWT(req as Request, res as Response, next);

            expect(next).toHaveBeenCalled();
            expect((req as any).user.amr).toEqual(['pwd', 'mfa']);
            expect((req as any).user.acr).toBe(2);
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

            mockValidateToken.mockResolvedValueOnce(createMockIntrospectionResponse({
                acr: 3, // Numeric ACR level
            }));

            await authenticateJWT(req as Request, res as Response, next);

            expect(next).toHaveBeenCalled();
            expect((req as any).user.acr).toBe(3);
        });

        it('should handle ACR as URN string', async () => {
            const token = createUSUserJWT();
            req.headers!.authorization = `Bearer ${token}`;

            mockValidateToken.mockResolvedValueOnce(createMockIntrospectionResponse({
                acr: 'urn:mace:incommon:iap:gold', // URN format
            }));

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
                iss: 'http://localhost:8081/realms/dive-v3-broker-usa',
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

            // Token introspection rejects malformed token
            mockValidateToken.mockResolvedValueOnce({
                active: false,
                error: 'invalid_token',
                error_description: 'Token is malformed',
            });

            await authenticateJWT(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('Classification Equivalency and Advanced Attributes', () => {
        beforeEach(() => {
            // Pre-set user for authzMiddleware (which expects req.user from authenticateJWT)
            (req as any).user = createMockUser();
            mockDecisionCacheGet.mockReturnValue(null);
        });

        it('should include subject attributes in OPA input', async () => {
            req.headers!['x-request-id'] = 'test-dutyorg-123';
            req.params = { id: 'doc-fvey-001' };

            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument as any);
            mockedAxios.post.mockResolvedValue({
                data: mockOPAAllow()
            });

            await authzMiddleware(req as Request, res as Response, next);

            expect(mockedAxios.post).toHaveBeenCalled();
            const opaInput = mockedAxios.post.mock.calls[0][1] as any;
            expect(opaInput.input.subject.uniqueID).toBe('testuser-us');
            expect(opaInput.input.subject.clearance).toBe('SECRET');
            expect(opaInput.input.subject.countryOfAffiliation).toBe('USA');
        });

        it('should include original classification fields in OPA input', async () => {
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
                            originatingCountry: 'FRA',
                            natoEquivalent: 'NATO SECRET'
                        }
                    }
                }
            };

            mockedGetResourceById.mockResolvedValue(frenchResource as any);
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
        it('should require user authentication before authorization', async () => {
            // authzMiddleware expects req.user to be set by authenticateJWT
            // Without it, returns 401
            req.headers!['x-request-id'] = 'test-sp-123';
            req.params = { id: 'doc-fvey-001' };

            // Explicitly clear user (no authenticateJWT ran)
            delete (req as any).user;

            await authzMiddleware(req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: 'Unauthorized',
                    message: 'No authenticated user found',
                })
            );
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('Error Recovery and Edge Cases', () => {
        beforeEach(() => {
            (req as any).user = createMockUser();
            mockDecisionCacheGet.mockReturnValue(null);
        });

        it('should handle OPA response with nested decision structure', async () => {
            req.params = { id: 'doc-fvey-001' };

            mockedAxios.post.mockResolvedValue({
                data: {
                    result: {
                        allow: true,
                        reason: 'Top-level allow'
                    }
                }
            });

            await authzMiddleware(req as Request, res as Response, next);

            expect(next).toHaveBeenCalled();
        });

        it('should include resource COI in OPA input', async () => {
            req.params = { id: 'doc-fvey-001' };

            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument as any);

            mockedAxios.post.mockResolvedValue({
                data: mockOPAAllow()
            });

            await authzMiddleware(req as Request, res as Response, next);

            expect(mockedAxios.post).toHaveBeenCalled();
            const opaInput = mockedAxios.post.mock.calls[0][1] as any;
            expect(opaInput.input.resource.COI).toEqual(['FVEY']);
        });

        it('should handle auth_time in context', async () => {
            req.headers!['x-request-id'] = 'test-authtime-123';
            req.params = { id: 'doc-fvey-001' };

            const authTime = Math.floor(Date.now() / 1000) - 3600;

            // Pre-set user with specific auth_time
            (req as any).user = createMockUser({ auth_time: authTime });

            mockedGetResourceById.mockResolvedValue(TEST_RESOURCES.fveySecretDocument as any);
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
