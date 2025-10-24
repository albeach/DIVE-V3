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
    process.env.KEYCLOAK_CLIENT_ID = 'dive-v3-client-broker';
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

        // Verify logging
        expect(logger.info).toHaveBeenCalledWith(
            'Custom login attempt',
            expect.objectContaining({
                username: validCredentials.username,
                idpAlias: validCredentials.idpAlias
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
        const tokenRequestCall = mockedAxios.post.mock.calls[0];
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

        const tokenRequestCall = mockedAxios.post.mock.calls[0];
        const tokenUrl = tokenRequestCall[0] as string;
        expect(tokenUrl).toContain('/realms/dive-v3-broker/');
    });

    it('should map usa-realm-broker to dive-v3-usa', async () => {
        mockedAxios.post.mockResolvedValueOnce({ data: mockKeycloakTokenResponse });

        await request(app)
            .post('/api/auth/custom-login')
            .send({ ...validCredentials, idpAlias: 'usa-realm-broker' });

        const tokenRequestCall = mockedAxios.post.mock.calls[0];
        const tokenUrl = tokenRequestCall[0] as string;
        expect(tokenUrl).toContain('/realms/dive-v3-usa/');
    });

    it('should map can-realm-broker to dive-v3-can', async () => {
        mockedAxios.post.mockResolvedValueOnce({ data: mockKeycloakTokenResponse });

        await request(app)
            .post('/api/auth/custom-login')
            .send({ ...validCredentials, idpAlias: 'can-realm-broker' });

        const tokenRequestCall = mockedAxios.post.mock.calls[0];
        const tokenUrl = tokenRequestCall[0] as string;
        expect(tokenUrl).toContain('/realms/dive-v3-can/');
    });

    it('should map fra-realm-broker to dive-v3-fra', async () => {
        mockedAxios.post.mockResolvedValueOnce({ data: mockKeycloakTokenResponse });

        await request(app)
            .post('/api/auth/custom-login')
            .send({ ...validCredentials, idpAlias: 'fra-realm-broker' });

        const tokenRequestCall = mockedAxios.post.mock.calls[0];
        const tokenUrl = tokenRequestCall[0] as string;
        expect(tokenUrl).toContain('/realms/dive-v3-fra/');
    });
});

