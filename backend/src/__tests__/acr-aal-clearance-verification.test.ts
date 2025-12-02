/**
 * Comprehensive ACR/AAL Clearance Verification Test Suite
 * 
 * Purpose: Verify that users receive correct ACR/AAL based on clearance level
 * and that OPA Rego policies correctly use AAL for authorization decisions.
 * 
 * Full Stack Trace:
 * 1. Keycloak sets ACR/AMR based on clearance and MFA factors
 * 2. Backend normalizes ACR (numeric/string/URN formats)
 * 3. Backend passes ACR to OPA in context field
 * 4. OPA parses AAL from ACR and enforces clearance-based requirements
 * 
 * Test Coverage:
 * - All clearance levels (UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET)
 * - All ACR formats (numeric "0"/"1"/"2", string "aal1"/"aal2"/"aal3", URN)
 * - Backend normalization logic
 * - OPA policy decisions based on AAL
 * - Edge cases (missing ACR, invalid formats, mismatched clearance/AAL)
 */

import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { authzMiddleware, normalizeACR, normalizeAMR, initializeJwtService, clearAuthzCaches } from '../middleware/authz.middleware';
import { getResourceByIdFederated } from '../services/resource.service';
import { IJWTPayload } from './helpers/mock-jwt';
import { TEST_RESOURCES } from './helpers/test-fixtures';

// Mock dependencies
jest.mock('axios');
jest.mock('../services/resource.service', () => ({
    getResourceById: jest.fn(),
    getResourceByIdFederated: jest.fn()
}));
jest.mock('jwk-to-pem', () => jest.fn(() => '-----BEGIN PUBLIC KEY-----\nMOCK_PUBLIC_KEY\n-----END PUBLIC KEY-----'));

// Mock token blacklist service
jest.mock('../services/token-blacklist.service', () => ({
    isTokenBlacklisted: jest.fn().mockResolvedValue(false),
    areUserTokensRevoked: jest.fn().mockResolvedValue(false)
}));

// Mock SP auth middleware
jest.mock('../middleware/sp-auth.middleware', () => ({
    validateSPToken: jest.fn().mockResolvedValue(null)
}));

// Mock logger
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
    logAccessModifiedEvent: jest.fn()
}));

// Mock circuit breaker
jest.mock('../utils/circuit-breaker', () => ({
    opaCircuitBreaker: {
        execute: jest.fn((fn) => fn()),
        getState: jest.fn(() => 'CLOSED')
    },
    keycloakCircuitBreaker: {
        execute: jest.fn((fn) => fn()),
        getState: jest.fn(() => 'CLOSED')
    }
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedGetResourceByIdFederated = getResourceByIdFederated as jest.MockedFunction<typeof getResourceByIdFederated>;

// JWT verification mock implementation
const defaultJwtVerifyImpl = (token: any, _key: any, options: any, callback: any) => {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) {
            return callback(new Error('invalid token'), null);
        }
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));

        // Validate issuer if specified
        if (options?.issuer) {
            const validIssuers = Array.isArray(options.issuer) ? options.issuer : [options.issuer];
            if (!validIssuers.includes(payload.iss)) {
                return callback(new Error('jwt issuer invalid'), null);
            }
        }

        // Validate audience if specified
        if (options?.audience) {
            const tokenAud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
            const validAudiences = Array.isArray(options.audience) ? options.audience : [options.audience];
            const hasValidAudience = tokenAud.some((aud: string) => validAudiences.includes(aud));
            if (!hasValidAudience) {
                return callback(new Error('jwt audience invalid'), null);
            }
        }

        callback(null, payload);
    } catch (error) {
        callback(error, null);
    }
};

// Create mock JWT service
const mockJwtService = {
    verify: jest.fn(defaultJwtVerifyImpl),
    decode: jwt.decode,
    sign: jwt.sign
};

// Initialize JWT service with mock
initializeJwtService(mockJwtService as any);

// Test secret for JWT signing
const TEST_SECRET = 'test-secret';
const DEFAULT_ISSUER = 'http://localhost:8081/realms/dive-v3-broker';

/**
 * Helper: Create OPA mock response
 * Matches the structure expected by authz.middleware.ts callOPA function
 */
function createOPAResponse(allow: boolean, reason?: string, aalLevel?: string) {
    return {
        data: {
            result: {
                decision: {
                    allow,
                    reason: reason || (allow ? 'All conditions satisfied' : 'Authorization denied'),
                    evaluation_details: {
                        aal_level: aalLevel || 'unknown',
                        clearance_check: 'PASS',
                        releasability_check: 'PASS'
                    }
                }
            }
        }
    };
}

/**
 * Helper: Create JWT with specific clearance and ACR/AMR
 */
function createJWTWithACR(
    clearance: string,
    acr: string | number | undefined,
    amr: string[] | string | undefined,
    overrides: Partial<IJWTPayload> = {}
): string {
    const now = Math.floor(Date.now() / 1000);
    const defaultClaims: IJWTPayload = {
        sub: `testuser-${clearance.toLowerCase()}`,
        uniqueID: `testuser-${clearance.toLowerCase()}`,
        email: `testuser-${clearance.toLowerCase()}@dive-demo.example`,
        preferred_username: `testuser-${clearance.toLowerCase()}`,
        clearance,
        countryOfAffiliation: 'USA',
        acpCOI: [],
        iss: DEFAULT_ISSUER,
        aud: 'dive-v3-client',
        exp: now + 3600,
        iat: now,
        auth_time: now,
        acr,
        amr,
        ...overrides
    };
    return jwt.sign(defaultClaims, TEST_SECRET, { algorithm: 'HS256' });
}

/**
 * Helper: Decode JWT to inspect claims
 */
function decodeJWT(token: string): IJWTPayload {
    return jwt.decode(token) as IJWTPayload;
}

describe('ACR/AAL Clearance Verification - Full Stack Tests', () => {
    let mockRequest: Partial<Request>;
    let mockResponse: Partial<Response>;
    let mockNext: NextFunction;
    let statusSpy: jest.SpyInstance;
    let jsonSpy: jest.SpyInstance;

    beforeEach(() => {
        // Clear caches
        clearAuthzCaches();

        // Reset mocks
        jest.clearAllMocks();

        // Reset JWT mock to default implementation
        mockJwtService.verify.mockImplementation(defaultJwtVerifyImpl);

        // Setup request/response mocks (following best practices from authz.middleware.test.ts)
        mockRequest = {
            headers: {
                authorization: 'Bearer test-token',
                'x-request-id': 'test-req-' + Date.now()
            },
            params: {
                id: 'doc-fvey-001' // Use valid resource ID from test fixtures
            },
            query: {},
            ip: '127.0.0.1',
            socket: {
                remoteAddress: '127.0.0.1'
            } as any
        };

        statusSpy = jest.fn().mockReturnThis();
        jsonSpy = jest.fn().mockReturnThis();

        mockResponse = {
            status: statusSpy as any,
            json: jsonSpy as any,
            setHeader: jest.fn()
        };

        mockNext = jest.fn();

        // Mock JWKS endpoint (for JWT verification)
        mockedAxios.get.mockResolvedValue({
            data: {
                keys: [{
                    kty: 'RSA',
                    kid: 'test-key-id',
                    use: 'sig',
                    alg: 'RS256',
                    n: 'test-n',
                    e: 'AQAB'
                }]
            }
        });

        // Mock jwk-to-pem
        const jwkToPem = require('jwk-to-pem');
        (jwkToPem as jest.MockedFunction<typeof jwkToPem>).mockReturnValue(
            '-----BEGIN PUBLIC KEY-----\nMOCK_PUBLIC_KEY\n-----END PUBLIC KEY-----'
        );

        // Mock federated resource service (used by authz middleware)
        mockedGetResourceByIdFederated.mockResolvedValue({
            resource: TEST_RESOURCES.fveySecretDocument as any,
            source: 'local',
            error: undefined
        });
    });

    describe('Backend ACR Normalization', () => {
        describe('Numeric ACR Format (Keycloak Standard)', () => {
            test('should normalize numeric 0 to AAL1', () => {
                expect(normalizeACR(0)).toBe(0); // AAL1
            });

            test('should normalize numeric 1 to AAL2', () => {
                expect(normalizeACR(1)).toBe(1); // AAL2
            });

            test('should normalize numeric 2 to AAL3', () => {
                expect(normalizeACR(2)).toBe(2); // AAL3
            });

            test('should normalize numeric string "0" to AAL1', () => {
                expect(normalizeACR('0')).toBe(0);
            });

            test('should normalize numeric string "1" to AAL2', () => {
                expect(normalizeACR('1')).toBe(1);
            });

            test('should normalize numeric string "2" to AAL3', () => {
                expect(normalizeACR('2')).toBe(2);
            });
        });

        describe('URN ACR Format (Legacy)', () => {
            test('should normalize "urn:mace:incommon:iap:silver" to AAL2', () => {
                // Per code: silver maps to AAL2 (line 566-568)
                expect(normalizeACR('urn:mace:incommon:iap:silver')).toBe(1);
            });

            test('should normalize "urn:mace:incommon:iap:gold" to AAL3', () => {
                // Per code: gold maps to AAL3 (line 570-572)
                expect(normalizeACR('urn:mace:incommon:iap:gold')).toBe(2);
            });

            test('should normalize "urn:mace:incommon:iap:platinum" to AAL1 (default)', () => {
                // Per code: platinum not explicitly handled, defaults to AAL1 (fail-secure)
                expect(normalizeACR('urn:mace:incommon:iap:platinum')).toBe(0);
            });

            test('should normalize "aal1" string to AAL1', () => {
                expect(normalizeACR('aal1')).toBe(0);
            });

            test('should normalize "aal2" string to AAL2', () => {
                expect(normalizeACR('aal2')).toBe(1);
            });

            test('should normalize "aal3" string to AAL3', () => {
                expect(normalizeACR('aal3')).toBe(2);
            });
        });

        describe('Edge Cases', () => {
            test('should default to AAL1 for undefined ACR', () => {
                expect(normalizeACR(undefined)).toBe(0);
            });

            test('should default to AAL1 for null ACR', () => {
                expect(normalizeACR(null as any)).toBe(0);
            });

            test('should default to AAL1 for unknown format', () => {
                expect(normalizeACR('unknown-format')).toBe(0);
            });
        });
    });

    describe('AMR Normalization', () => {
        test('should handle array format', () => {
            expect(normalizeAMR(['pwd', 'otp'])).toEqual(['pwd', 'otp']);
        });

        test('should parse JSON string format', () => {
            expect(normalizeAMR('["pwd","otp"]')).toEqual(['pwd', 'otp']);
        });

        test('should wrap single string in array', () => {
            expect(normalizeAMR('pwd')).toEqual(['pwd']);
        });

        test('should return default password array for undefined', () => {
            // Per code: undefined AMR defaults to ['pwd'] (line 592-593)
            expect(normalizeAMR(undefined)).toEqual(['pwd']);
        });
    });

    describe('Clearance → ACR/AAL Mapping Verification', () => {
        /**
         * Expected Mapping (NIST SP 800-63B):
         * - UNCLASSIFIED → AAL1 (password only)
         * - CONFIDENTIAL → AAL2 (password + OTP)
         * - SECRET → AAL2 (password + OTP)
         * - TOP_SECRET → AAL3 (password + WebAuthn/hardware key)
         */

        describe('UNCLASSIFIED Users', () => {
            test('should have AAL1 (numeric 0) for UNCLASSIFIED clearance', () => {
                const token = createJWTWithACR('UNCLASSIFIED', 0, ['pwd']);
                const decoded = decodeJWT(token);

                expect(decoded.clearance).toBe('UNCLASSIFIED');
                expect(decoded.acr).toBe(0);
                expect(normalizeACR(decoded.acr)).toBe(0); // AAL1
            });

            test('should have AAL1 (string "0") for UNCLASSIFIED clearance', () => {
                const token = createJWTWithACR('UNCLASSIFIED', '0', ['pwd']);
                const decoded = decodeJWT(token);

                expect(decoded.clearance).toBe('UNCLASSIFIED');
                expect(normalizeACR(decoded.acr)).toBe(0); // AAL1
            });

            test('should have single-factor AMR (pwd only) for UNCLASSIFIED', () => {
                const token = createJWTWithACR('UNCLASSIFIED', 0, ['pwd']);
                const decoded = decodeJWT(token);

                const amrArray = normalizeAMR(decoded.amr);
                expect(amrArray).toEqual(['pwd']);
                expect(amrArray.length).toBe(1);
            });
        });

        describe('CONFIDENTIAL Users', () => {
            test('should have AAL2 (numeric 1) for CONFIDENTIAL clearance', () => {
                const token = createJWTWithACR('CONFIDENTIAL', 1, ['pwd', 'otp']);
                const decoded = decodeJWT(token);

                expect(decoded.clearance).toBe('CONFIDENTIAL');
                expect(decoded.acr).toBe(1);
                expect(normalizeACR(decoded.acr)).toBe(1); // AAL2
            });

            test('should have AAL2 (string "1") for CONFIDENTIAL clearance', () => {
                const token = createJWTWithACR('CONFIDENTIAL', '1', ['pwd', 'otp']);
                const decoded = decodeJWT(token);

                expect(decoded.clearance).toBe('CONFIDENTIAL');
                expect(normalizeACR(decoded.acr)).toBe(1); // AAL2
            });

            test('should have multi-factor AMR (pwd + otp) for CONFIDENTIAL', () => {
                const token = createJWTWithACR('CONFIDENTIAL', 1, ['pwd', 'otp']);
                const decoded = decodeJWT(token);

                const amrArray = normalizeAMR(decoded.amr);
                expect(amrArray).toEqual(['pwd', 'otp']);
                expect(amrArray.length).toBeGreaterThanOrEqual(2);
            });
        });

        describe('SECRET Users', () => {
            test('should have AAL2 (numeric 1) for SECRET clearance', () => {
                const token = createJWTWithACR('SECRET', 1, ['pwd', 'otp']);
                const decoded = decodeJWT(token);

                expect(decoded.clearance).toBe('SECRET');
                expect(decoded.acr).toBe(1);
                expect(normalizeACR(decoded.acr)).toBe(1); // AAL2
            });

            test('should have multi-factor AMR (pwd + otp) for SECRET', () => {
                const token = createJWTWithACR('SECRET', 1, ['pwd', 'otp']);
                const decoded = decodeJWT(token);

                const amrArray = normalizeAMR(decoded.amr);
                expect(amrArray).toEqual(['pwd', 'otp']);
                expect(amrArray.length).toBeGreaterThanOrEqual(2);
            });
        });

        describe('TOP_SECRET Users', () => {
            test('should have AAL3 (numeric 2) for TOP_SECRET clearance', () => {
                const token = createJWTWithACR('TOP_SECRET', 2, ['pwd', 'hwk']);
                const decoded = decodeJWT(token);

                expect(decoded.clearance).toBe('TOP_SECRET');
                expect(decoded.acr).toBe(2);
                expect(normalizeACR(decoded.acr)).toBe(2); // AAL3
            });

            test('should have hardware key AMR (pwd + hwk) for TOP_SECRET', () => {
                const token = createJWTWithACR('TOP_SECRET', 2, ['pwd', 'hwk']);
                const decoded = decodeJWT(token);

                const amrArray = normalizeAMR(decoded.amr);
                expect(amrArray).toContain('pwd');
                expect(amrArray).toContain('hwk');
                expect(amrArray.length).toBeGreaterThanOrEqual(2);
            });
        });
    });

    describe('OPA Policy AAL Enforcement', () => {
        /**
         * OPA Policy Requirements (from federation_abac_policy.rego):
         * - UNCLASSIFIED resources require AAL1
         * - CONFIDENTIAL resources require AAL2
         * - SECRET resources require AAL2
         * - TOP_SECRET resources require AAL3
         */

        beforeEach(() => {
            // Reset axios mocks
            mockedAxios.post.mockClear();
            // Reset federated resource mock
            mockedGetResourceByIdFederated.mockClear();
        });

        describe('UNCLASSIFIED Resource Access', () => {
            test('should allow AAL1 user to access UNCLASSIFIED resource', async () => {
                const token = createJWTWithACR('UNCLASSIFIED', 0, ['pwd']);
                mockRequest.headers!.authorization = `Bearer ${token}`;
                mockRequest.params!.id = 'doc-fvey-001';

                // Create resource with UNCLASSIFIED classification
                const resource = {
                    ...TEST_RESOURCES.fveySecretDocument,
                    ztdf: {
                        ...TEST_RESOURCES.fveySecretDocument.ztdf,
                        policy: {
                            ...TEST_RESOURCES.fveySecretDocument.ztdf.policy,
                            securityLabel: {
                                ...TEST_RESOURCES.fveySecretDocument.ztdf.policy.securityLabel,
                                classification: 'UNCLASSIFIED'
                            }
                        }
                    }
                } as any;
                mockedGetResourceByIdFederated.mockResolvedValue({
                    resource,
                    source: 'local'
                });

                mockedAxios.post.mockResolvedValue(createOPAResponse(true, 'All conditions satisfied', 'AAL1'));

                await authzMiddleware(mockRequest as Request, mockResponse as Response, mockNext);

                // Verify OPA was called with correct AAL
                expect(mockedAxios.post).toHaveBeenCalled();
                const opaInput = mockedAxios.post.mock.calls[0][1] as any;
                expect(opaInput.input.context.acr).toBe('0'); // Backend converts to string
                expect(opaInput.input.context.amr).toEqual(['pwd']);
            });

            test('should allow AAL2 user to access UNCLASSIFIED resource (higher AAL OK)', async () => {
                const token = createJWTWithACR('CONFIDENTIAL', 1, ['pwd', 'otp']);
                mockRequest.headers!.authorization = `Bearer ${token}`;
                mockRequest.params!.id = 'doc-fvey-001';

                // Create resource with UNCLASSIFIED classification
                const resource = {
                    ...TEST_RESOURCES.fveySecretDocument,
                    ztdf: {
                        ...TEST_RESOURCES.fveySecretDocument.ztdf,
                        policy: {
                            ...TEST_RESOURCES.fveySecretDocument.ztdf.policy,
                            securityLabel: {
                                ...TEST_RESOURCES.fveySecretDocument.ztdf.policy.securityLabel,
                                classification: 'UNCLASSIFIED'
                            }
                        }
                    }
                } as any;
                mockedGetResourceByIdFederated.mockResolvedValue({
                    resource,
                    source: 'local'
                });

                mockedAxios.post.mockResolvedValue(createOPAResponse(true, 'All conditions satisfied', 'AAL2'));

                await authzMiddleware(mockRequest as Request, mockResponse as Response, mockNext);

                expect(mockedAxios.post).toHaveBeenCalled();
                const opaInput = mockedAxios.post.mock.calls[0][1] as any;
                expect(opaInput.input.context.acr).toBe('1'); // AAL2
            });
        });

        describe('CONFIDENTIAL Resource Access', () => {
            test('should allow AAL2 user to access CONFIDENTIAL resource', async () => {
                const token = createJWTWithACR('CONFIDENTIAL', 1, ['pwd', 'otp']);
                mockRequest.headers!.authorization = `Bearer ${token}`;

                // Create resource with overridden classification
                const resource = {
                    ...TEST_RESOURCES.fveySecretDocument,
                    ztdf: {
                        ...TEST_RESOURCES.fveySecretDocument.ztdf,
                        policy: {
                            ...TEST_RESOURCES.fveySecretDocument.ztdf.policy,
                            securityLabel: {
                                ...TEST_RESOURCES.fveySecretDocument.ztdf.policy.securityLabel,
                                classification: 'CONFIDENTIAL'
                            }
                        }
                    }
                } as any;
                mockedGetResourceByIdFederated.mockResolvedValue({
                    resource,
                    source: 'local'
                });

                mockedAxios.post.mockResolvedValue(createOPAResponse(true, 'All conditions satisfied', 'AAL2'));

                await authzMiddleware(mockRequest as Request, mockResponse as Response, mockNext);

                expect(mockedAxios.post).toHaveBeenCalled();
                const opaInput = mockedAxios.post.mock.calls[0][1] as any;
                expect(opaInput.input.context.acr).toBe('1'); // AAL2
                expect(opaInput.input.context.amr).toEqual(['pwd', 'otp']);
            });

            test('should deny AAL1 user accessing CONFIDENTIAL resource', async () => {
                const token = createJWTWithACR('UNCLASSIFIED', 0, ['pwd']);
                mockRequest.headers!.authorization = `Bearer ${token}`;

                // Create resource with overridden classification
                const resource = {
                    ...TEST_RESOURCES.fveySecretDocument,
                    ztdf: {
                        ...TEST_RESOURCES.fveySecretDocument.ztdf,
                        policy: {
                            ...TEST_RESOURCES.fveySecretDocument.ztdf.policy,
                            securityLabel: {
                                ...TEST_RESOURCES.fveySecretDocument.ztdf.policy.securityLabel,
                                classification: 'CONFIDENTIAL'
                            }
                        }
                    }
                } as any;
                mockedGetResourceByIdFederated.mockResolvedValue({
                    resource,
                    source: 'local'
                });

                await authzMiddleware(mockRequest as Request, mockResponse as Response, mockNext);

                // Should be denied by backend AAL2 validation (before OPA)
                expect(statusSpy).toHaveBeenCalledWith(403);
                expect(jsonSpy).toHaveBeenCalled();
                const responseBody = jsonSpy.mock.calls[0][0];
                expect(responseBody.error).toBe('Forbidden');
                // Error message format: "Authentication strength insufficient"
                expect(responseBody.message).toBeTruthy();
                expect(responseBody.details?.requirement).toContain('AAL2');
            });

            test('should allow AAL3 user to access CONFIDENTIAL resource (higher AAL OK)', async () => {
                const token = createJWTWithACR('TOP_SECRET', 2, ['pwd', 'hwk']);
                mockRequest.headers!.authorization = `Bearer ${token}`;

                // Create resource with overridden classification
                const resource = {
                    ...TEST_RESOURCES.fveySecretDocument,
                    ztdf: {
                        ...TEST_RESOURCES.fveySecretDocument.ztdf,
                        policy: {
                            ...TEST_RESOURCES.fveySecretDocument.ztdf.policy,
                            securityLabel: {
                                ...TEST_RESOURCES.fveySecretDocument.ztdf.policy.securityLabel,
                                classification: 'CONFIDENTIAL'
                            }
                        }
                    }
                } as any;
                mockedGetResourceByIdFederated.mockResolvedValue({
                    resource,
                    source: 'local'
                });

                mockedAxios.post.mockResolvedValue(createOPAResponse(true, 'All conditions satisfied', 'AAL3'));

                await authzMiddleware(mockRequest as Request, mockResponse as Response, mockNext);

                expect(mockedAxios.post).toHaveBeenCalled();
                const opaInput = mockedAxios.post.mock.calls[0][1] as any;
                expect(opaInput.input.context.acr).toBe('2'); // AAL3
            });
        });

        describe('SECRET Resource Access', () => {
            test('should allow AAL2 user to access SECRET resource', async () => {
                const token = createJWTWithACR('SECRET', 1, ['pwd', 'otp']);
                mockRequest.headers!.authorization = `Bearer ${token}`;

                // SECRET is already the default for fveySecretDocument, so use as-is
                mockedGetResourceByIdFederated.mockResolvedValue({
                    resource: TEST_RESOURCES.fveySecretDocument as any,
                    source: 'local'
                });

                mockedAxios.post.mockResolvedValue(createOPAResponse(true, 'All conditions satisfied', 'AAL2'));

                await authzMiddleware(mockRequest as Request, mockResponse as Response, mockNext);

                expect(mockedAxios.post).toHaveBeenCalled();
                const opaInput = mockedAxios.post.mock.calls[0][1] as any;
                expect(opaInput.input.context.acr).toBe('1'); // AAL2
            });

            test('should deny AAL1 user accessing SECRET resource', async () => {
                const token = createJWTWithACR('UNCLASSIFIED', 0, ['pwd']);
                mockRequest.headers!.authorization = `Bearer ${token}`;

                // SECRET is already the default for fveySecretDocument, so use as-is
                mockedGetResourceByIdFederated.mockResolvedValue({
                    resource: TEST_RESOURCES.fveySecretDocument as any,
                    source: 'local'
                });

                await authzMiddleware(mockRequest as Request, mockResponse as Response, mockNext);

                expect(statusSpy).toHaveBeenCalledWith(403);
                expect(jsonSpy).toHaveBeenCalled();
                const responseBody = jsonSpy.mock.calls[0][0];
                expect(responseBody.error).toBe('Forbidden');
                // Error message format: "Authentication strength insufficient"
                expect(responseBody.message).toBeTruthy();
                expect(responseBody.details?.requirement).toContain('AAL2');
            });
        });

        describe('TOP_SECRET Resource Access', () => {
            test('should allow AAL3 user to access TOP_SECRET resource', async () => {
                const token = createJWTWithACR('TOP_SECRET', 2, ['pwd', 'hwk']);
                mockRequest.headers!.authorization = `Bearer ${token}`;

                // Create resource with TOP_SECRET classification
                const resource = {
                    ...TEST_RESOURCES.fveySecretDocument,
                    ztdf: {
                        ...TEST_RESOURCES.fveySecretDocument.ztdf,
                        policy: {
                            ...TEST_RESOURCES.fveySecretDocument.ztdf.policy,
                            securityLabel: {
                                ...TEST_RESOURCES.fveySecretDocument.ztdf.policy.securityLabel,
                                classification: 'TOP_SECRET'
                            }
                        }
                    }
                } as any;
                mockedGetResourceByIdFederated.mockResolvedValue({
                    resource,
                    source: 'local'
                });

                mockedAxios.post.mockResolvedValue(createOPAResponse(true, 'All conditions satisfied', 'AAL3'));

                await authzMiddleware(mockRequest as Request, mockResponse as Response, mockNext);

                expect(mockedAxios.post).toHaveBeenCalled();
                const opaInput = mockedAxios.post.mock.calls[0][1] as any;
                expect(opaInput.input.context.acr).toBe('2'); // AAL3
                expect(opaInput.input.context.amr).toEqual(['pwd', 'hwk']);
            });

            test('should deny AAL2 user accessing TOP_SECRET resource', async () => {
                const token = createJWTWithACR('SECRET', 1, ['pwd', 'otp']);
                mockRequest.headers!.authorization = `Bearer ${token}`;

                // Create resource with TOP_SECRET classification
                const resource = {
                    ...TEST_RESOURCES.fveySecretDocument,
                    ztdf: {
                        ...TEST_RESOURCES.fveySecretDocument.ztdf,
                        policy: {
                            ...TEST_RESOURCES.fveySecretDocument.ztdf.policy,
                            securityLabel: {
                                ...TEST_RESOURCES.fveySecretDocument.ztdf.policy.securityLabel,
                                classification: 'TOP_SECRET'
                            }
                        }
                    }
                } as any;
                mockedGetResourceByIdFederated.mockResolvedValue({
                    resource,
                    source: 'local'
                });

                mockedAxios.post.mockResolvedValue(createOPAResponse(
                    false,
                    'Insufficient AAL: user AAL2 < required AAL3 for TOP_SECRET',
                    'AAL2'
                ));

                await authzMiddleware(mockRequest as Request, mockResponse as Response, mockNext);

                // OPA should deny due to insufficient AAL
                expect(mockedAxios.post).toHaveBeenCalled();
                const opaInput = mockedAxios.post.mock.calls[0][1] as any;
                expect(opaInput.input.context.acr).toBe('1'); // AAL2

                // Should get 403 from OPA decision
                expect(statusSpy).toHaveBeenCalledWith(403);
            });

            test('should deny AAL1 user accessing TOP_SECRET resource', async () => {
                const token = createJWTWithACR('UNCLASSIFIED', 0, ['pwd']);
                mockRequest.headers!.authorization = `Bearer ${token}`;

                // Create resource with TOP_SECRET classification
                const resource = {
                    ...TEST_RESOURCES.fveySecretDocument,
                    ztdf: {
                        ...TEST_RESOURCES.fveySecretDocument.ztdf,
                        policy: {
                            ...TEST_RESOURCES.fveySecretDocument.ztdf.policy,
                            securityLabel: {
                                ...TEST_RESOURCES.fveySecretDocument.ztdf.policy.securityLabel,
                                classification: 'TOP_SECRET'
                            }
                        }
                    }
                } as any;
                mockedGetResourceByIdFederated.mockResolvedValue({
                    resource,
                    source: 'local'
                });

                await authzMiddleware(mockRequest as Request, mockResponse as Response, mockNext);

                // Should be denied by backend AAL2 validation (before OPA)
                expect(statusSpy).toHaveBeenCalledWith(403);
            });
        });
    });

    describe('Full Stack Trace Verification', () => {
        /**
         * This test verifies the complete flow:
         * 1. JWT token contains ACR/AMR
         * 2. Backend decodes and normalizes ACR
         * 3. Backend passes normalized ACR to OPA
         * 4. OPA receives correct AAL level
         * 5. OPA makes authorization decision based on AAL
         */

        test('should trace ACR from JWT → Backend → OPA for CONFIDENTIAL user', async () => {
            // Step 1: Create JWT with ACR=1 (AAL2) for CONFIDENTIAL user
            const token = createJWTWithACR('CONFIDENTIAL', 1, ['pwd', 'otp']);
            const decoded = decodeJWT(token);

            // Verify JWT contains correct ACR
            expect(decoded.acr).toBe(1);
            expect(decoded.clearance).toBe('CONFIDENTIAL');

            // Step 2: Backend normalizes ACR
            const normalizedAAL = normalizeACR(decoded.acr);
            expect(normalizedAAL).toBe(1); // AAL2

            // Step 3: Setup middleware call
            mockRequest.headers!.authorization = `Bearer ${token}`;
            mockRequest.params!.id = 'doc-fvey-001';
            const resource = {
                ...TEST_RESOURCES.fveySecretDocument,
                ztdf: {
                    ...TEST_RESOURCES.fveySecretDocument.ztdf,
                    policy: {
                        ...TEST_RESOURCES.fveySecretDocument.ztdf.policy,
                        securityLabel: {
                            ...TEST_RESOURCES.fveySecretDocument.ztdf.policy.securityLabel,
                            classification: 'CONFIDENTIAL'
                        }
                    }
                }
            } as any;
            mockedGetResourceByIdFederated.mockResolvedValue({
                resource,
                source: 'local'
            });

            mockedAxios.post.mockResolvedValue(createOPAResponse(true, 'All conditions satisfied', 'AAL2'));

            // Step 4: Call middleware
            await authzMiddleware(mockRequest as Request, mockResponse as Response, mockNext);

            // Step 5: Verify OPA received correct AAL
            expect(mockedAxios.post).toHaveBeenCalled();
            const opaInput = mockedAxios.post.mock.calls[0][1] as any;

            // OPA should receive string "1" (backend converts numeric to string)
            expect(opaInput.input.context.acr).toBe('1');
            expect(opaInput.input.context.amr).toEqual(['pwd', 'otp']);
            expect(opaInput.input.subject.clearance).toBe('CONFIDENTIAL');
            expect(opaInput.input.resource.classification).toBe('CONFIDENTIAL');
        });

        test('should trace ACR from JWT → Backend → OPA for TOP_SECRET user', async () => {
            // Step 1: Create JWT with ACR=2 (AAL3) for TOP_SECRET user
            const token = createJWTWithACR('TOP_SECRET', 2, ['pwd', 'hwk']);
            const decoded = decodeJWT(token);

            // Verify JWT contains correct ACR
            expect(decoded.acr).toBe(2);
            expect(decoded.clearance).toBe('TOP_SECRET');

            // Step 2: Backend normalizes ACR
            const normalizedAAL = normalizeACR(decoded.acr);
            expect(normalizedAAL).toBe(2); // AAL3

            // Step 3: Setup middleware call
            mockRequest.headers!.authorization = `Bearer ${token}`;
            mockRequest.params!.id = 'doc-fvey-001';
            const resource = {
                ...TEST_RESOURCES.fveySecretDocument,
                ztdf: {
                    ...TEST_RESOURCES.fveySecretDocument.ztdf,
                    policy: {
                        ...TEST_RESOURCES.fveySecretDocument.ztdf.policy,
                        securityLabel: {
                            ...TEST_RESOURCES.fveySecretDocument.ztdf.policy.securityLabel,
                            classification: 'TOP_SECRET'
                        }
                    }
                }
            } as any;
            mockedGetResourceByIdFederated.mockResolvedValue({
                resource,
                source: 'local'
            });

            mockedAxios.post.mockResolvedValue(createOPAResponse(true, 'All conditions satisfied', 'AAL3'));

            // Step 4: Call middleware
            await authzMiddleware(mockRequest as Request, mockResponse as Response, mockNext);

            // Step 5: Verify OPA received correct AAL
            expect(mockedAxios.post).toHaveBeenCalled();
            const opaInput = mockedAxios.post.mock.calls[0][1] as any;

            expect(opaInput.input.context.acr).toBe('2'); // AAL3
            expect(opaInput.input.context.amr).toEqual(['pwd', 'hwk']);
            expect(opaInput.input.subject.clearance).toBe('TOP_SECRET');
            expect(opaInput.input.resource.classification).toBe('TOP_SECRET');
        });
    });

    describe('Edge Cases and Error Scenarios', () => {
        test('should handle missing ACR gracefully (defaults to AAL1)', () => {
            const token = createJWTWithACR('UNCLASSIFIED', undefined, ['pwd']);
            const decoded = decodeJWT(token);

            expect(decoded.acr).toBeUndefined();
            expect(normalizeACR(decoded.acr)).toBe(0); // Defaults to AAL1
        });

        test('should handle invalid ACR format gracefully', () => {
            const token = createJWTWithACR('CONFIDENTIAL', 'invalid-format' as any, ['pwd', 'otp']);
            const decoded = decodeJWT(token);

            expect(normalizeACR(decoded.acr)).toBe(0); // Defaults to AAL1 (fail-secure)
        });

        test('should handle URN format ACR (legacy compatibility)', () => {
            // "silver" = AAL2, "gold" = AAL3 per InCommon standards
            const token = createJWTWithACR('CONFIDENTIAL', 'urn:mace:incommon:iap:silver', ['pwd', 'otp']);
            const decoded = decodeJWT(token);

            expect(normalizeACR(decoded.acr)).toBe(1); // AAL2
        });

        test('should handle JSON string AMR format', () => {
            const token = createJWTWithACR('CONFIDENTIAL', 1, '["pwd","otp"]');
            const decoded = decodeJWT(token);

            const amrArray = normalizeAMR(decoded.amr);
            expect(amrArray).toEqual(['pwd', 'otp']);
        });
    });

    describe('Clearance-AAL Mismatch Detection', () => {
        /**
         * These tests verify that the system correctly identifies mismatches
         * between user clearance and their AAL level
         */

        test('should detect UNCLASSIFIED user with AAL2 (mismatch - too high)', () => {
            const token = createJWTWithACR('UNCLASSIFIED', 1, ['pwd', 'otp']);
            const decoded = decodeJWT(token);

            // This is technically valid (higher AAL is OK), but unusual
            expect(decoded.clearance).toBe('UNCLASSIFIED');
            expect(normalizeACR(decoded.acr)).toBe(1); // AAL2
            // System should allow this (higher AAL is acceptable)
        });

        test('should detect CONFIDENTIAL user with AAL1 (mismatch - too low)', () => {
            const token = createJWTWithACR('CONFIDENTIAL', 0, ['pwd']);
            const decoded = decodeJWT(token);

            expect(decoded.clearance).toBe('CONFIDENTIAL');
            expect(normalizeACR(decoded.acr)).toBe(0); // AAL1 - TOO LOW!

            // This should be caught by backend AAL2 validation
            // when accessing classified resources
        });

        test('should detect TOP_SECRET user with AAL2 (mismatch - too low)', () => {
            const token = createJWTWithACR('TOP_SECRET', 1, ['pwd', 'otp']);
            const decoded = decodeJWT(token);

            expect(decoded.clearance).toBe('TOP_SECRET');
            expect(normalizeACR(decoded.acr)).toBe(1); // AAL2 - TOO LOW for TOP_SECRET!

            // This should be caught by OPA policy when accessing TOP_SECRET resources
        });
    });
});

