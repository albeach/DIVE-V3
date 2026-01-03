/**
 * Custom Login Controller Tests
 * 
 * Comprehensive test suite covering:
 * - Rate limiting (5 tests)
 * - MFA enforcement (8 tests)
 * - Error handling (6 tests)
 * - Keycloak integration (4 tests)
 * 
 * Total: 23 unit tests
 */

import request from 'supertest';
import express, { Express } from 'express';
import axios from 'axios';
import { customLoginHandler, loginAttempts } from '../controllers/custom-login.controller';

// Mock dependencies
jest.mock('axios');
jest.mock('../utils/logger', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
    }
}));

// Mock KeycloakConfigSyncService for dynamic rate limiting
jest.mock('../services/keycloak-config-sync.service', () => ({
    KeycloakConfigSyncService: {
        getMaxAttempts: jest.fn().mockResolvedValue(8),
        getWindowMs: jest.fn().mockResolvedValue(15 * 60 * 1000), // 15 minutes
        getConfig: jest.fn().mockResolvedValue({
            maxLoginFailures: 8,
            failureResetTimeSeconds: 900,
            waitIncrementSeconds: 60,
            maxFailureWaitSeconds: 300,
            lastSynced: Date.now()
        }),
        forceSync: jest.fn().mockResolvedValue(undefined),
        syncAllRealms: jest.fn().mockResolvedValue(undefined),
        clearCaches: jest.fn(),
        getCacheStats: jest.fn().mockReturnValue({
            realms: ['dive-v3-broker'],
            adminTokenExpiry: null
        })
    }
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

// ============================================
// Test Setup
// ============================================

let app: Express;

beforeAll(() => {
    app = express();
    app.use(express.json());
    app.post('/api/auth/custom-login', customLoginHandler);
});

// Helper to reset rate limiting between tests
function resetRateLimiting() {
    loginAttempts.length = 0;
}

beforeEach(() => {
    jest.clearAllMocks();
    resetRateLimiting();
    // Reset environment variables
    process.env.KEYCLOAK_URL = 'http://localhost:8080';
    process.env.KEYCLOAK_CLIENT_ID = 'dive-v3-broker';
    process.env.KEYCLOAK_CLIENT_SECRET = 'test-secret';
});

// ============================================
// Test Data
// ============================================

const validCredentials = {
    idpAlias: 'dive-v3-broker',
    username: 'testuser',
    password: 'ValidPassword123!'
};

const topSecretUser = {
    id: 'user-123',
    username: 'admin-dive',
    totp: false,
    attributes: {
        clearance: ['TOP_SECRET'],
        countryOfAffiliation: ['USA'],
        uniqueID: ['admin-dive@dive.mil']
    }
};

const unclassifiedUser = {
    id: 'user-456',
    username: 'public-user',
    totp: false,
    attributes: {
        clearance: ['UNCLASSIFIED'],
        countryOfAffiliation: ['USA'],
        uniqueID: ['public@dive.mil']
    }
};

const mockKeycloakTokenResponse = {
    access_token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
    refresh_token: 'refresh_token_here',
    expires_in: 300,
    token_type: 'Bearer'
};

const mockAdminTokenResponse = {
    access_token: 'admin_token_here',
    token_type: 'Bearer',
    expires_in: 60
};

// ============================================
// 1. Rate Limiting Tests (5 tests)
// ============================================

describe('Rate Limiting', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should allow 8 login attempts within 15-minute window', async () => {
        // Mock authentication failure for all attempts
        mockedAxios.post.mockRejectedValue({
            response: {
                status: 401,
                data: {
                    error: 'invalid_grant',
                    error_description: 'Invalid user credentials'
                }
            }
        });

        // Make 8 failed login attempts
        for (let i = 0; i < 8; i++) {
            const response = await request(app)
                .post('/api/auth/custom-login')
                .send(validCredentials);

            expect(response.status).toBe(401);
            expect(response.body.error).toBe('Invalid username or password');
        }
    });

    it('should block 9th attempt within 15-minute window', async () => {
        // Mock authentication failure
        mockedAxios.post.mockRejectedValue({
            response: {
                status: 401,
                data: {
                    error: 'invalid_grant',
                    error_description: 'Invalid user credentials'
                }
            }
        });

        // Make 8 failed attempts
        for (let i = 0; i < 8; i++) {
            await request(app)
                .post('/api/auth/custom-login')
                .send(validCredentials);
        }

        // 9th attempt should be rate limited
        const response = await request(app)
            .post('/api/auth/custom-login')
            .send(validCredentials);

        expect(response.status).toBe(429);
        expect(response.body.error).toContain('Too many login attempts');
    });

    it('should reset rate limit after 15-minute window expires', async () => {
        // This test would require time manipulation or mocking Date.now()
        // For simplicity, we'll test that the cleanup logic works

        // Make 8 failed attempts
        mockedAxios.post.mockRejectedValue({
            response: {
                status: 401,
                data: {
                    error: 'invalid_grant',
                    error_description: 'Invalid user credentials'
                }
            }
        });

        for (let i = 0; i < 8; i++) {
            await request(app)
                .post('/api/auth/custom-login')
                .send(validCredentials);
        }

        // Mock Date.now() to simulate time passing
        const originalDateNow = Date.now;
        Date.now = jest.fn(() => originalDateNow() + (16 * 60 * 1000)); // 16 minutes later

        // This attempt should succeed (not be rate limited)
        const response = await request(app)
            .post('/api/auth/custom-login')
            .send(validCredentials);

        expect(response.status).not.toBe(429);

        // Restore Date.now
        Date.now = originalDateNow;
    });

    it('should track attempts per username + IP combination', async () => {
        mockedAxios.post.mockRejectedValue({
            response: {
                status: 401,
                data: {
                    error: 'invalid_grant',
                    error_description: 'Invalid user credentials'
                }
            }
        });

        // Make 8 failed attempts for user1
        for (let i = 0; i < 8; i++) {
            await request(app)
                .post('/api/auth/custom-login')
                .send({ ...validCredentials, username: 'user1' });
        }

        // Attempt for user1 should be blocked
        const response1 = await request(app)
            .post('/api/auth/custom-login')
            .send({ ...validCredentials, username: 'user1' });
        expect(response1.status).toBe(429);

        // Attempt for user2 should still work (different username)
        const response2 = await request(app)
            .post('/api/auth/custom-login')
            .send({ ...validCredentials, username: 'user2' });
        expect(response2.status).not.toBe(429);
    });

    it('should handle concurrent requests safely', async () => {
        mockedAxios.post.mockRejectedValue({
            response: {
                status: 401,
                data: {
                    error: 'invalid_grant',
                    error_description: 'Invalid user credentials'
                }
            }
        });

        // Make 10 concurrent requests
        const promises = [];
        for (let i = 0; i < 10; i++) {
            promises.push(
                request(app)
                    .post('/api/auth/custom-login')
                    .send(validCredentials)
            );
        }

        const responses = await Promise.all(promises);

        // At least 2 requests should be rate limited
        const rateLimited = responses.filter(r => r.status === 429);
        expect(rateLimited.length).toBeGreaterThanOrEqual(2);
    });
});

// ============================================
// 2. MFA Enforcement Tests (8 tests)
// ============================================

describe('MFA Enforcement', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should require MFA for CONFIDENTIAL clearance', async () => {
        // Mock successful authentication
        mockedAxios.post
            .mockResolvedValueOnce({ data: mockKeycloakTokenResponse })
            .mockResolvedValueOnce({ data: mockAdminTokenResponse });

        mockedAxios.get.mockResolvedValueOnce({
            data: [{
                ...topSecretUser,
                attributes: { ...topSecretUser.attributes, clearance: ['CONFIDENTIAL'] }
            }]
        });

        const response = await request(app)
            .post('/api/auth/custom-login')
            .send(validCredentials);

        expect(response.status).toBe(200);
        expect(response.body.mfaRequired).toBe(true);
        expect(response.body.mfaSetupRequired).toBe(true);
    });

    it('should require MFA for SECRET clearance', async () => {
        mockedAxios.post
            .mockResolvedValueOnce({ data: mockKeycloakTokenResponse })
            .mockResolvedValueOnce({ data: mockAdminTokenResponse });

        mockedAxios.get.mockResolvedValueOnce({
            data: [{
                ...topSecretUser,
                attributes: { ...topSecretUser.attributes, clearance: ['SECRET'] }
            }]
        });

        const response = await request(app)
            .post('/api/auth/custom-login')
            .send(validCredentials);

        expect(response.status).toBe(200);
        expect(response.body.mfaRequired).toBe(true);
        expect(response.body.mfaSetupRequired).toBe(true);
    });

    it('should require MFA for TOP_SECRET clearance', async () => {
        mockedAxios.post
            .mockResolvedValueOnce({ data: mockKeycloakTokenResponse })
            .mockResolvedValueOnce({ data: mockAdminTokenResponse });

        mockedAxios.get.mockResolvedValueOnce({
            data: [topSecretUser]
        });

        const response = await request(app)
            .post('/api/auth/custom-login')
            .send(validCredentials);

        expect(response.status).toBe(200);
        expect(response.body.mfaRequired).toBe(true);
        expect(response.body.mfaSetupRequired).toBe(true);
        expect(response.body.clearance).toBe('TOP_SECRET');
    });

    it('should NOT require MFA for UNCLASSIFIED clearance', async () => {
        mockedAxios.post
            .mockResolvedValueOnce({ data: mockKeycloakTokenResponse })
            .mockResolvedValueOnce({ data: mockAdminTokenResponse });

        mockedAxios.get.mockResolvedValueOnce({
            data: [unclassifiedUser]
        });

        const response = await request(app)
            .post('/api/auth/custom-login')
            .send(validCredentials);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.mfaRequired).toBeUndefined();
        expect(response.body.data.accessToken).toBeDefined();
    });

    it('should detect missing OTP configuration via totp_configured attribute', async () => {
        mockedAxios.post
            .mockResolvedValueOnce({ data: mockKeycloakTokenResponse })
            .mockResolvedValueOnce({ data: mockAdminTokenResponse });

        mockedAxios.get.mockResolvedValueOnce({
            data: [{
                ...topSecretUser,
                attributes: {
                    ...topSecretUser.attributes,
                    totp_configured: ['false'] // Explicitly not configured
                }
            }]
        });

        const response = await request(app)
            .post('/api/auth/custom-login')
            .send(validCredentials);

        expect(response.status).toBe(200);
        expect(response.body.mfaSetupRequired).toBe(true);
    });

    it('should detect existing OTP configuration via user.totp flag', async () => {
        mockedAxios.post
            .mockResolvedValueOnce({ data: mockKeycloakTokenResponse })
            .mockResolvedValueOnce({ data: mockAdminTokenResponse });

        mockedAxios.get.mockResolvedValueOnce({
            data: [{
                ...topSecretUser,
                totp: true, // Already configured
                attributes: {
                    ...topSecretUser.attributes,
                    totp_configured: ['true']
                }
            }]
        });

        const response = await request(app)
            .post('/api/auth/custom-login')
            .send(validCredentials);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.mfaSetupRequired).toBeUndefined();
    });

    it('should return mfaSetupRequired: true when user needs OTP configuration', async () => {
        mockedAxios.post
            .mockResolvedValueOnce({ data: mockKeycloakTokenResponse })
            .mockResolvedValueOnce({ data: mockAdminTokenResponse });

        mockedAxios.get.mockResolvedValueOnce({
            data: [topSecretUser] // No OTP configured
        });

        const response = await request(app)
            .post('/api/auth/custom-login')
            .send(validCredentials);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(false);
        expect(response.body.mfaRequired).toBe(true);
        expect(response.body.mfaSetupRequired).toBe(true);
        expect(response.body.message).toContain('Multi-factor authentication setup required');
        expect(response.body.setupToken).toBeDefined();
    });

    it('should accept OTP parameter in Direct Grant request', async () => {
        const otp = '123456';

        mockedAxios.post
            .mockResolvedValueOnce({ data: mockKeycloakTokenResponse })
            .mockResolvedValueOnce({ data: mockAdminTokenResponse });

        mockedAxios.get.mockResolvedValueOnce({
            data: [{
                ...topSecretUser,
                totp: true,
                attributes: {
                    ...topSecretUser.attributes,
                    totp_configured: ['true']
                }
            }]
        });

        const response = await request(app)
            .post('/api/auth/custom-login')
            .send({ ...validCredentials, otp });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);

        // Verify OTP was included in Keycloak request
        const keycloakCall = mockedAxios.post.mock.calls[0];
        const params = keycloakCall[1] as URLSearchParams;
        expect(params.get('totp')).toBe(otp);
    });
});

// ============================================
// 3. Error Handling Tests (6 tests)
// ============================================

describe('Error Handling', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return generic error for invalid credentials (prevent account enumeration)', async () => {
        mockedAxios.post.mockRejectedValue({
            response: {
                status: 401,
                data: {
                    error: 'invalid_grant',
                    error_description: 'Invalid user credentials'
                }
            }
        });

        const response = await request(app)
            .post('/api/auth/custom-login')
            .send(validCredentials);

        expect(response.status).toBe(401);
        expect(response.body.error).toBe('Invalid username or password');
        // Should NOT reveal whether username exists
        expect(response.body.error).not.toContain('user not found');
    });

    it('should handle Keycloak connection failures gracefully', async () => {
        mockedAxios.post.mockRejectedValue(new Error('ECONNREFUSED'));

        const response = await request(app)
            .post('/api/auth/custom-login')
            .send(validCredentials);

        expect(response.status).toBe(500);
        expect(response.body.error).toContain('Authentication failed');
    });

    it('should handle Admin API failures with fallback to allow login', async () => {
        // First call succeeds (authentication), second call fails (admin API)
        mockedAxios.post
            .mockResolvedValueOnce({ data: mockKeycloakTokenResponse })
            .mockRejectedValueOnce(new Error('Admin API unavailable'));

        const response = await request(app)
            .post('/api/auth/custom-login')
            .send(validCredentials);

        // Should still allow login (fail open for availability)
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
    });

    it('should validate required fields (idpAlias, username, password)', async () => {
        const missingUsername = await request(app)
            .post('/api/auth/custom-login')
            .send({ idpAlias: 'dive-v3-broker', password: 'test' });

        expect(missingUsername.status).toBe(400);
        expect(missingUsername.body.error).toContain('Missing required fields');

        const missingPassword = await request(app)
            .post('/api/auth/custom-login')
            .send({ idpAlias: 'dive-v3-broker', username: 'test' });

        expect(missingPassword.status).toBe(400);

        const missingIdpAlias = await request(app)
            .post('/api/auth/custom-login')
            .send({ username: 'test', password: 'test' });

        expect(missingIdpAlias.status).toBe(400);
    });

    it('should handle malformed OTP (non-numeric, wrong length)', async () => {
        mockedAxios.post.mockRejectedValue({
            response: {
                status: 401,
                data: {
                    error: 'invalid_grant',
                    error_description: 'Invalid OTP code'
                }
            }
        });

        // Non-numeric OTP - Keycloak will reject it with 401
        const response1 = await request(app)
            .post('/api/auth/custom-login')
            .send({ ...validCredentials, otp: 'abcdef' });

        // Backend treats all auth failures as 401 (invalid credentials) or 500 (server error)
        expect([401, 500]).toContain(response1.status);

        // Wrong length OTP
        const response2 = await request(app)
            .post('/api/auth/custom-login')
            .send({ ...validCredentials, otp: '123' });

        expect([401, 500]).toContain(response2.status);
    });

    it('should log all security-relevant events', async () => {
        const { logger } = require('../utils/logger');

        mockedAxios.post.mockRejectedValue({
            response: {
                status: 401,
                data: {
                    error: 'invalid_grant',
                    error_description: 'Invalid user credentials'
                }
            }
        });

        await request(app)
            .post('/api/auth/custom-login')
            .send(validCredentials);

        // Verify logging - updated to match actual log message
        expect(logger.info).toHaveBeenCalledWith(
            'Attempting Keycloak authentication',
            expect.objectContaining({
                username: validCredentials.username,
                idpAlias: validCredentials.idpAlias,
                realmName: 'dive-v3-broker'
            })
        );

        expect(logger.warn).toHaveBeenCalledWith(
            'Custom login failed - invalid credentials',
            expect.any(Object)
        );
    });
});

// ============================================
// 4. Keycloak Integration Tests (4 tests)
// ============================================

describe('Keycloak Integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should successfully authenticate with valid credentials', async () => {
        mockedAxios.post
            .mockResolvedValueOnce({ data: mockKeycloakTokenResponse })
            .mockResolvedValueOnce({ data: mockAdminTokenResponse });

        mockedAxios.get.mockResolvedValueOnce({
            data: [unclassifiedUser]
        });

        const response = await request(app)
            .post('/api/auth/custom-login')
            .send(validCredentials);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.accessToken).toBe(mockKeycloakTokenResponse.access_token);
        expect(response.body.data.refreshToken).toBe(mockKeycloakTokenResponse.refresh_token);
        expect(response.body.data.expiresIn).toBe(mockKeycloakTokenResponse.expires_in);
    });

    it('should include TOTP parameter when OTP is provided', async () => {
        mockedAxios.post
            .mockResolvedValueOnce({ data: mockKeycloakTokenResponse })
            .mockResolvedValueOnce({ data: mockAdminTokenResponse });

        mockedAxios.get.mockResolvedValueOnce({
            data: [{
                ...topSecretUser,
                totp: true,
                attributes: { ...topSecretUser.attributes, totp_configured: ['true'] }
            }]
        });

        await request(app)
            .post('/api/auth/custom-login')
            .send({ ...validCredentials, otp: '123456' });

        // Check that 'totp' parameter was included in token request
        expect(mockedAxios.post.mock.calls.length).toBeGreaterThan(0);
        const tokenRequestCall = mockedAxios.post.mock.calls[0];
        expect(tokenRequestCall).toBeDefined();
        const params = tokenRequestCall[1] as URLSearchParams;
        expect(params.get('totp')).toBe('123456');
    });

    it('should parse access token and refresh token correctly', async () => {
        const customTokens = {
            access_token: 'custom_access_token',
            refresh_token: 'custom_refresh_token',
            expires_in: 600,
            token_type: 'Bearer'
        };

        mockedAxios.post
            .mockResolvedValueOnce({ data: customTokens })
            .mockResolvedValueOnce({ data: mockAdminTokenResponse });

        mockedAxios.get.mockResolvedValueOnce({
            data: [unclassifiedUser]
        });

        const response = await request(app)
            .post('/api/auth/custom-login')
            .send(validCredentials);

        expect(response.body.data.accessToken).toBe('custom_access_token');
        expect(response.body.data.refreshToken).toBe('custom_refresh_token');
        expect(response.body.data.expiresIn).toBe(600);
    });

    it('should query Keycloak Admin API for user attributes', async () => {
        mockedAxios.post
            .mockResolvedValueOnce({ data: mockKeycloakTokenResponse })
            .mockResolvedValueOnce({ data: mockAdminTokenResponse });

        mockedAxios.get.mockResolvedValueOnce({
            data: [topSecretUser]
        });

        await request(app)
            .post('/api/auth/custom-login')
            .send(validCredentials);

        // Verify Admin API was called
        expect(mockedAxios.get).toHaveBeenCalledWith(
            expect.stringContaining('/admin/realms/dive-v3-broker/users'),
            expect.objectContaining({
                headers: { Authorization: 'Bearer admin_token_here' }
            })
        );
    });
});

// ============================================
// 5. Realm Detection Tests (Bonus)
// ============================================

describe('Realm Detection', () => {
    it('should map dive-v3-broker correctly', async () => {
        mockedAxios.post.mockResolvedValueOnce({ data: mockKeycloakTokenResponse });

        await request(app)
            .post('/api/auth/custom-login')
            .send({ ...validCredentials, idpAlias: 'dive-v3-broker' });

        expect(mockedAxios.post.mock.calls.length).toBeGreaterThan(0);
        const tokenRequestCall = mockedAxios.post.mock.calls[0];
        expect(tokenRequestCall).toBeDefined();
        const tokenUrl = tokenRequestCall[0] as string;
        expect(tokenUrl).toContain('/realms/dive-v3-broker/');
    });

    it('should return redirect for usa-realm-broker (federated IdP)', async () => {
        const response = await request(app)
            .post('/api/auth/custom-login')
            .send({ ...validCredentials, idpAlias: 'usa-realm-broker' });

        // IdP brokers trigger federation redirect, not Direct Grant
        expect(response.status).toBe(200);
        expect(response.body.requiresRedirect).toBe(true);
        expect(response.body.redirectUrl).toContain('kc_idp_hint=usa-realm-broker');
        expect(response.body.redirectUrl).toContain('/realms/dive-v3-broker/');
    });

    it('should return redirect for can-realm-broker (federated IdP)', async () => {
        const response = await request(app)
            .post('/api/auth/custom-login')
            .send({ ...validCredentials, idpAlias: 'can-realm-broker' });

        // IdP brokers trigger federation redirect, not Direct Grant
        expect(response.status).toBe(200);
        expect(response.body.requiresRedirect).toBe(true);
        expect(response.body.redirectUrl).toContain('kc_idp_hint=can-realm-broker');
        expect(response.body.redirectUrl).toContain('/realms/dive-v3-broker/');
    });

    it('should return redirect for fra-realm-broker (federated IdP)', async () => {
        const response = await request(app)
            .post('/api/auth/custom-login')
            .send({ ...validCredentials, idpAlias: 'fra-realm-broker' });

        // IdP brokers trigger federation redirect, not Direct Grant
        expect(response.status).toBe(200);
        expect(response.body.requiresRedirect).toBe(true);
        expect(response.body.redirectUrl).toContain('kc_idp_hint=fra-realm-broker');
        expect(response.body.redirectUrl).toContain('/realms/dive-v3-broker/');
    });

    it('should return redirect for industry-realm-broker (federated IdP)', async () => {
        const response = await request(app)
            .post('/api/auth/custom-login')
            .send({ ...validCredentials, idpAlias: 'industry-realm-broker' });

        // IdP brokers trigger federation redirect, not Direct Grant
        expect(response.status).toBe(200);
        expect(response.body.requiresRedirect).toBe(true);
        expect(response.body.redirectUrl).toContain('kc_idp_hint=industry-realm-broker');
        expect(response.body.redirectUrl).toContain('/realms/dive-v3-broker/');
    });
});

// ============================================
// 6. Clearance Mapping Tests (Multi-Realm)
// ============================================

describe('Clearance Mapping for Multi-Realm', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should handle USA clearances (SECRET, TOP_SECRET)', async () => {
        mockedAxios.post
            .mockResolvedValueOnce({ data: mockKeycloakTokenResponse })
            .mockResolvedValueOnce({ data: mockAdminTokenResponse });

        mockedAxios.get.mockResolvedValueOnce({
            data: [{
                ...topSecretUser,
                attributes: { ...topSecretUser.attributes, clearance: ['SECRET'] }
            }]
        });

        const response = await request(app)
            .post('/api/auth/custom-login')
            .send({ ...validCredentials, idpAlias: 'dive-v3-broker' }); // Use broker realm for Direct Grant

        expect(response.status).toBe(200);
        expect(response.body.clearance).toBe('SECRET');
        expect(response.body.mfaRequired).toBe(true);
    });

    it('should handle French clearances (CONFIDENTIEL DÉFENSE, SECRET DÉFENSE)', async () => {
        mockedAxios.post
            .mockResolvedValueOnce({ data: mockKeycloakTokenResponse })
            .mockResolvedValueOnce({ data: mockAdminTokenResponse });

        const frenchUser = {
            id: 'user-fra-123',
            username: 'pierre.dubois',
            totp: false,
            attributes: {
                clearance: ['CONFIDENTIEL DÉFENSE'],
                countryOfAffiliation: ['FRA'],
                uniqueID: ['pierre.dubois@defense.gouv.fr']
            }
        };

        mockedAxios.get.mockResolvedValueOnce({
            data: [frenchUser]
        });

        const response = await request(app)
            .post('/api/auth/custom-login')
            .send({ ...validCredentials, idpAlias: 'dive-v3-broker', username: 'pierre.dubois' }); // Use broker realm

        expect(response.status).toBe(200);
        // The clearance mapper service should normalize this to CONFIDENTIAL
        expect(response.body.mfaRequired).toBe(true);
    });

    it('should handle Canadian clearances (PROTECTED B, PROTECTED C)', async () => {
        mockedAxios.post
            .mockResolvedValueOnce({ data: mockKeycloakTokenResponse })
            .mockResolvedValueOnce({ data: mockAdminTokenResponse });

        const canadianUser = {
            id: 'user-can-123',
            username: 'john.smith',
            totp: false,
            attributes: {
                clearance: ['PROTECTED B'],
                countryOfAffiliation: ['CAN'],
                uniqueID: ['john.smith@forces.gc.ca']
            }
        };

        mockedAxios.get.mockResolvedValueOnce({
            data: [canadianUser]
        });

        const response = await request(app)
            .post('/api/auth/custom-login')
            .send({ ...validCredentials, idpAlias: 'dive-v3-broker', username: 'john.smith' }); // Use broker realm

        expect(response.status).toBe(200);
        // The clearance mapper service should normalize PROTECTED B to CONFIDENTIAL
        expect(response.body.mfaRequired).toBe(true);
    });

    it('should handle Industry clearances (PROPRIETARY, TRADE SECRET)', async () => {
        mockedAxios.post
            .mockResolvedValueOnce({ data: mockKeycloakTokenResponse })
            .mockResolvedValueOnce({ data: mockAdminTokenResponse });

        const industryUser = {
            id: 'user-ind-123',
            username: 'bob.contractor',
            totp: false,
            attributes: {
                clearance: ['PROPRIETARY'],
                countryOfAffiliation: ['USA'],
                uniqueID: ['bob.contractor@lockheed.com']
            }
        };

        mockedAxios.get.mockResolvedValueOnce({
            data: [industryUser]
        });

        const response = await request(app)
            .post('/api/auth/custom-login')
            .send({ ...validCredentials, idpAlias: 'dive-v3-broker', username: 'bob.contractor' }); // Use broker realm

        expect(response.status).toBe(200);
        // The clearance mapper service should normalize PROPRIETARY to CONFIDENTIAL
        expect(response.body.mfaRequired).toBe(true);
    });

    it('should not require MFA for Industry UNCLASSIFIED users', async () => {
        mockedAxios.post
            .mockResolvedValueOnce({ data: mockKeycloakTokenResponse })
            .mockResolvedValueOnce({ data: mockAdminTokenResponse });

        const industryUnclassified = {
            id: 'user-ind-456',
            username: 'jane.contractor',
            totp: false,
            attributes: {
                clearance: ['UNCLASSIFIED'],
                countryOfAffiliation: ['USA'],
                uniqueID: ['jane.contractor@boeing.com']
            }
        };

        mockedAxios.get.mockResolvedValueOnce({
            data: [industryUnclassified]
        });

        const response = await request(app)
            .post('/api/auth/custom-login')
            .send({ ...validCredentials, idpAlias: 'dive-v3-broker', username: 'jane.contractor' }); // Use broker realm

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.mfaRequired).toBeUndefined();
        expect(response.body.data.accessToken).toBeDefined();
    });
});

// ============================================
// 6. Dynamic Rate Limiting Tests (Task 4)
// ============================================

describe('Dynamic Rate Limiting', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetRateLimiting();
    });

    it('should fetch rate limit config from KeycloakConfigSyncService', async () => {
        const { KeycloakConfigSyncService } = require('../services/keycloak-config-sync.service');

        mockedAxios.post.mockRejectedValue({
            response: {
                status: 401,
                data: {
                    error: 'invalid_grant',
                    error_description: 'Invalid user credentials'
                }
            }
        });

        await request(app)
            .post('/api/auth/custom-login')
            .send(validCredentials);

        // Verify that the service was called with the correct realm
        expect(KeycloakConfigSyncService.getMaxAttempts).toHaveBeenCalledWith('dive-v3-broker');
        expect(KeycloakConfigSyncService.getWindowMs).toHaveBeenCalledWith('dive-v3-broker');
    });

    it('should use dynamic maxAttempts from config service', async () => {
        const { KeycloakConfigSyncService } = require('../services/keycloak-config-sync.service');

        // Mock config service to return only 3 attempts
        KeycloakConfigSyncService.getMaxAttempts.mockResolvedValue(3);
        KeycloakConfigSyncService.getWindowMs.mockResolvedValue(15 * 60 * 1000);

        mockedAxios.post.mockRejectedValue({
            response: {
                status: 401,
                data: {
                    error: 'invalid_grant',
                    error_description: 'Invalid user credentials'
                }
            }
        });

        // Make 3 failed attempts (should all return 401 - invalid creds)
        for (let i = 0; i < 3; i++) {
            const response = await request(app)
                .post('/api/auth/custom-login')
                .send(validCredentials);
            // May be 401 (invalid creds) or 200 (federation redirect for broker IdPs)
            expect([200, 401]).toContain(response.status);
        }

        // 4th attempt should be rate limited (since max is 3)
        const response = await request(app)
            .post('/api/auth/custom-login')
            .send(validCredentials);

        expect(response.status).toBe(429);
        expect(response.body.error).toContain('Too many login attempts');
    });

    it('should use dynamic windowMs from config service', async () => {
        const { KeycloakConfigSyncService } = require('../services/keycloak-config-sync.service');

        // Mock config service to return custom window message
        KeycloakConfigSyncService.getMaxAttempts.mockResolvedValue(1);
        KeycloakConfigSyncService.getWindowMs.mockResolvedValue(30 * 60 * 1000); // 30 minutes

        mockedAxios.post.mockRejectedValue({
            response: {
                status: 401,
                data: {
                    error: 'invalid_grant',
                    error_description: 'Invalid user credentials'
                }
            }
        });

        // Make 1 failed attempt
        await request(app)
            .post('/api/auth/custom-login')
            .send(validCredentials);

        // 2nd attempt should be rate limited
        const response = await request(app)
            .post('/api/auth/custom-login')
            .send(validCredentials);

        expect(response.status).toBe(429);
        expect(response.body.error).toContain('30 minutes'); // Should show 30 minutes, not 15
    });

    it('should call config service with correct realm for different IdPs', async () => {
        const { KeycloakConfigSyncService } = require('../services/keycloak-config-sync.service');

        mockedAxios.post.mockRejectedValue({
            response: {
                status: 401,
                data: {
                    error: 'invalid_grant',
                    error_description: 'Invalid user credentials'
                }
            }
        });

        // Test broker realm (all IdP brokers use broker realm for Direct Grant)
        await request(app)
            .post('/api/auth/custom-login')
            .send({ ...validCredentials, idpAlias: 'dive-v3-broker' });
        expect(KeycloakConfigSyncService.getMaxAttempts).toHaveBeenCalledWith('dive-v3-broker');

        jest.clearAllMocks();

        // Test direct USA realm access (bypasses federation - testing only)
        await request(app)
            .post('/api/auth/custom-login')
            .send({ ...validCredentials, idpAlias: 'dive-v3-usa' });
        expect(KeycloakConfigSyncService.getMaxAttempts).toHaveBeenCalledWith('dive-v3-usa');

        jest.clearAllMocks();

        // Test direct France realm access
        await request(app)
            .post('/api/auth/custom-login')
            .send({ ...validCredentials, idpAlias: 'dive-v3-fra' });
        expect(KeycloakConfigSyncService.getMaxAttempts).toHaveBeenCalledWith('dive-v3-fra');
    });

    it('should track rate limiting per realm', async () => {
        const { KeycloakConfigSyncService } = require('../services/keycloak-config-sync.service');

        KeycloakConfigSyncService.getMaxAttempts.mockResolvedValue(2);
        KeycloakConfigSyncService.getWindowMs.mockResolvedValue(15 * 60 * 1000);

        mockedAxios.post.mockRejectedValue({
            response: {
                status: 401,
                data: {
                    error: 'invalid_grant',
                    error_description: 'Invalid user credentials'
                }
            }
        });

        // Make 2 failed attempts to USA realm (direct access, not broker)
        for (let i = 0; i < 2; i++) {
            await request(app)
                .post('/api/auth/custom-login')
                .send({ ...validCredentials, idpAlias: 'dive-v3-usa' });
        }

        // 3rd attempt to USA should be rate limited
        const usaResponse = await request(app)
            .post('/api/auth/custom-login')
            .send({ ...validCredentials, idpAlias: 'dive-v3-usa' });
        expect(usaResponse.status).toBe(429);

        // But attempt to France realm should still work (different realm)
        const fraResponse = await request(app)
            .post('/api/auth/custom-login')
            .send({ ...validCredentials, idpAlias: 'dive-v3-fra' });
        expect(fraResponse.status).toBe(401); // Not rate limited, just invalid creds
    });
});
