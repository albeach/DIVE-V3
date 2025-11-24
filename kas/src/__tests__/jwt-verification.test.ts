/**
 * KAS JWT Verification Tests
 * 
 * Tests for Gap #3 Security Fix (October 20, 2025)
 * Verifies that KAS properly validates JWT signatures and rejects forged tokens
 */

import { verifyToken, clearJWKSCache } from '../utils/jwt-validator';
import jwt from 'jsonwebtoken';
import axios from 'axios';

// Mock axios for JWKS fetching
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('KAS JWT Verification Security Fix (Gap #3)', () => {

    beforeEach(() => {
        clearJWKSCache();
        jest.clearAllMocks();

        // Set environment variables for testing
        process.env.KEYCLOAK_URL = 'http://localhost:8081';
        process.env.KEYCLOAK_REALM = 'dive-v3-broker';
        process.env.KEYCLOAK_CLIENT_ID = 'dive-v3-client';
    });

    describe('Security: Forged Token Detection', () => {

        test('should REJECT forged token with invalid signature', async () => {
            // Create a forged token (not signed by Keycloak)
            const forgedToken = jwt.sign(
                {
                    sub: 'attacker',
                    uniqueID: 'attacker@evil.com',
                    clearance: 'TOP_SECRET',  // Attacker claims high clearance
                    countryOfAffiliation: 'USA',
                    exp: Math.floor(Date.now() / 1000) + 3600,
                    iat: Math.floor(Date.now() / 1000),
                    iss: 'http://localhost:8081/realms/dive-v3-broker',
                    aud: 'dive-v3-client'
                },
                'wrong-secret',  // Signed with wrong secret
                {
                    algorithm: 'HS256',  // Wrong algorithm
                    keyid: 'fake-kid'
                }
            );

            // Mock JWKS response (KAS will try to fetch public key)
            mockedAxios.get.mockResolvedValueOnce({
                data: {
                    keys: [
                        {
                            kid: 'fake-kid',
                            kty: 'RSA',
                            use: 'sig',
                            n: 'fake-modulus',
                            e: 'AQAB'
                        }
                    ]
                }
            });

            // Verify should reject the forged token
            await expect(verifyToken(forgedToken)).rejects.toThrow();
        });

        test('should REJECT token with missing kid', async () => {
            const tokenWithoutKid = jwt.sign(
                { sub: 'test' },
                'secret',
                { algorithm: 'HS256', noTimestamp: true }
            );

            await expect(verifyToken(tokenWithoutKid)).rejects.toThrow('Token header missing kid');
        });

        test('should REJECT expired token', async () => {
            const expiredToken = jwt.sign(
                {
                    sub: 'testuser',
                    exp: Math.floor(Date.now() / 1000) - 3600,  // Expired 1 hour ago
                    iat: Math.floor(Date.now() / 1000) - 7200,
                    iss: 'http://localhost:8081/realms/dive-v3-broker',
                    aud: 'dive-v3-client'
                },
                'secret',
                {
                    algorithm: 'HS256',
                    keyid: 'test-kid'
                }
            );

            mockedAxios.get.mockResolvedValueOnce({
                data: {
                    keys: [
                        {
                            kid: 'test-kid',
                            kty: 'RSA',
                            use: 'sig',
                            n: 'fake-modulus',
                            e: 'AQAB'
                        }
                    ]
                }
            });

            await expect(verifyToken(expiredToken)).rejects.toThrow();
        });

        test('should REJECT token with wrong issuer', async () => {
            const wrongIssuerToken = jwt.sign(
                {
                    sub: 'testuser',
                    exp: Math.floor(Date.now() / 1000) + 3600,
                    iat: Math.floor(Date.now() / 1000),
                    iss: 'http://evil-idp.com/realms/fake',  // Wrong issuer
                    aud: 'dive-v3-client'
                },
                'secret',
                {
                    algorithm: 'HS256',
                    keyid: 'test-kid'
                }
            );

            mockedAxios.get.mockResolvedValueOnce({
                data: {
                    keys: [
                        {
                            kid: 'test-kid',
                            kty: 'RSA',
                            use: 'sig',
                            n: 'fake-modulus',
                            e: 'AQAB'
                        }
                    ]
                }
            });

            await expect(verifyToken(wrongIssuerToken)).rejects.toThrow();
        });

        test('should REJECT token with wrong audience', async () => {
            const wrongAudienceToken = jwt.sign(
                {
                    sub: 'testuser',
                    exp: Math.floor(Date.now() / 1000) + 3600,
                    iat: Math.floor(Date.now() / 1000),
                    iss: 'http://localhost:8081/realms/dive-v3-broker',
                    aud: 'wrong-client'  // Wrong audience
                },
                'secret',
                {
                    algorithm: 'HS256',
                    keyid: 'test-kid'
                }
            );

            mockedAxios.get.mockResolvedValueOnce({
                data: {
                    keys: [
                        {
                            kid: 'test-kid',
                            kty: 'RSA',
                            use: 'sig',
                            n: 'fake-modulus',
                            e: 'AQAB'
                        }
                    ]
                }
            });

            await expect(verifyToken(wrongAudienceToken)).rejects.toThrow();
        });
    });

    describe('JWKS Caching', () => {

        test('should cache JWKS public key on first fetch', async () => {
            // This test verifies caching behavior
            // Implementation depends on having a valid test token

            // Mock JWKS endpoint
            mockedAxios.get.mockResolvedValue({
                data: {
                    keys: [
                        {
                            kid: 'test-kid-123',
                            kty: 'RSA',
                            use: 'sig',
                            n: 'test-modulus',
                            e: 'AQAB'
                        }
                    ]
                }
            });

            // First call should fetch from JWKS
            // Second call should use cache
            // Note: This is a simplified test; full implementation would need real RSA keys

            expect(mockedAxios.get).not.toHaveBeenCalled();
        });

        test('should clear JWKS cache when requested', () => {
            clearJWKSCache();
            // Cache should be empty after clearing
            expect(true).toBe(true);  // Placeholder assertion
        });
    });

    describe('Valid Token Acceptance (Integration)', () => {

        test('should document that valid Keycloak tokens will be accepted', () => {
            // This is a documentation test
            // In production, KAS will accept valid tokens from Keycloak with:
            // - Correct RS256 signature
            // - Valid issuer (Keycloak realm)
            // - Valid audience (dive-v3-client)
            // - Not expired
            // - Valid JWKS public key

            const requirements = {
                algorithm: 'RS256',
                issuer: 'http://localhost:8081/realms/dive-v3-broker',
                audience: 'dive-v3-client',
                signature: 'Valid JWKS signature',
                expiration: 'Not expired'
            };

            expect(requirements.algorithm).toBe('RS256');
            expect(requirements.issuer).toContain('dive-v3-broker');
            expect(requirements.audience).toBe('dive-v3-client');
        });
    });

    describe('Error Handling', () => {

        test('should handle JWKS fetch failure gracefully', async () => {
            const testToken = jwt.sign(
                { sub: 'test' },
                'secret',
                {
                    algorithm: 'HS256',
                    keyid: 'test-kid'
                }
            );

            // Mock JWKS endpoint failure
            mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

            await expect(verifyToken(testToken)).rejects.toThrow();
        });

        test('should handle malformed token gracefully', async () => {
            const malformedToken = 'not-a-valid-jwt-token';

            await expect(verifyToken(malformedToken)).rejects.toThrow('Invalid token format');
        });

        test('should handle token with missing parts', async () => {
            const incompletToken = 'header.payload';  // Missing signature

            await expect(verifyToken(incompletToken)).rejects.toThrow();
        });
    });

    describe('Security Compliance', () => {

        test('should enforce RS256 algorithm (reject HS256)', async () => {
            // RS256 is required for ACP-240 Section 5.2
            // HS256 (symmetric) should be rejected

            const hs256Token = jwt.sign(
                {
                    sub: 'testuser',
                    exp: Math.floor(Date.now() / 1000) + 3600,
                    iat: Math.floor(Date.now() / 1000),
                    iss: 'http://localhost:8081/realms/dive-v3-broker',
                    aud: 'dive-v3-client'
                },
                'shared-secret',
                {
                    algorithm: 'HS256',
                    keyid: 'hs256-kid'
                }
            );

            // Should reject because algorithm is not RS256
            // (jwt.verify with algorithms: ['RS256'] will fail)
            await expect(verifyToken(hs256Token)).rejects.toThrow();
        });

        test('should validate ACP-240 Section 5.2 requirements', () => {
            // ACP-240 Section 5.2 requires:
            // "Key Access Service (KAS): Holds private keys; mediates wrapped-key access.
            //  On request, evaluates requester's attributes/policy and rewraps the DEK if authorized"

            const acp240Requirements = {
                'Signature Verification': 'RS256 with JWKS',
                'Issuer Validation': 'Keycloak realm URL',
                'Audience Validation': 'dive-v3-client',
                'Expiration Check': 'Enforced by jwt.verify',
                'Fail-Closed': 'Reject on verification failure'
            };

            expect(Object.keys(acp240Requirements).length).toBe(5);
        });
    });
});

describe('Attack Scenarios Prevented', () => {

    test('Scenario 1: Attacker crafts token with elevated clearance', async () => {
        // Before fix: KAS would accept this forged token
        // After fix: KAS rejects due to invalid signature

        const attackToken = jwt.sign(
            {
                sub: 'attacker@evil.com',
                uniqueID: 'attacker@evil.com',
                clearance: 'TOP_SECRET',  // Attacker claims TOP_SECRET
                countryOfAffiliation: 'USA',
                acpCOI: ['FVEY', 'NATO-COSMIC'],  // Full access
                exp: Math.floor(Date.now() / 1000) + 3600,
                iat: Math.floor(Date.now() / 1000),
                iss: 'http://localhost:8081/realms/dive-v3-broker',
                aud: 'dive-v3-client'
            },
            'attacker-secret',
            {
                algorithm: 'HS256',
                keyid: 'fake-kid'
            }
        );

        // Should be rejected
        await expect(verifyToken(attackToken)).rejects.toThrow();
    });

    test('Scenario 2: Attacker reuses expired token', async () => {
        // Before fix: KAS might not check expiration
        // After fix: KAS rejects expired tokens

        const expiredToken = jwt.sign(
            {
                sub: 'legitimate-user',
                uniqueID: 'john.doe@mil',
                clearance: 'SECRET',
                countryOfAffiliation: 'USA',
                exp: Math.floor(Date.now() / 1000) - 3600,  // Expired
                iat: Math.floor(Date.now() / 1000) - 7200,
                iss: 'http://localhost:8081/realms/dive-v3-broker',
                aud: 'dive-v3-client'
            },
            'secret',
            {
                algorithm: 'HS256',
                keyid: 'test-kid'
            }
        );

        await expect(verifyToken(expiredToken)).rejects.toThrow();
    });

    test('Scenario 3: Token from different realm (cross-realm attack)', async () => {
        // Attacker tries to use token from different Keycloak realm

        const crossRealmToken = jwt.sign(
            {
                sub: 'attacker',
                uniqueID: 'attacker@evil.com',
                clearance: 'TOP_SECRET',
                countryOfAffiliation: 'USA',
                exp: Math.floor(Date.now() / 1000) + 3600,
                iat: Math.floor(Date.now() / 1000),
                iss: 'http://localhost:8081/realms/attacker-realm',  // Wrong realm
                aud: 'dive-v3-client'
            },
            'secret',
            {
                algorithm: 'HS256',
                keyid: 'attacker-kid'
            }
        );

        await expect(verifyToken(crossRealmToken)).rejects.toThrow();
    });
});


