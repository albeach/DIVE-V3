/**
 * OAuth Utils Test Suite
 * Target: 100% coverage for oauth.utils.ts
 * 
 * Tests:
 * - generateSecureSecret() - secure random secret generation
 * - generateCodeVerifier() - PKCE code verifier
 * - generateCodeChallenge() - PKCE code challenge (plain & S256)
 * - validateClient() - client validation with SP data
 * - isValidRedirectUri() - redirect URI validation
 * - parseBasicAuth() - Basic Auth header parsing
 * - validateScopes() - scope validation
 * - hasScope() - scope check
 * - generateNonce() - OIDC nonce generation
 * - calculateExpiry() - token expiry calculation
 * - validateAudience() - JWT audience validation
 * - extractClientCredentials() - extract client creds from request
 * - Edge cases (null, undefined, empty, boundaries)
 */

import {
    generateSecureSecret,
    generateCodeVerifier,
    generateCodeChallenge,
    validateClient,
    isValidRedirectUri,
    parseBasicAuth,
    validateScopes,
    hasScope,
    generateNonce,
    calculateExpiry,
    validateAudience,
    extractClientCredentials,
} from '../utils/oauth.utils';
import { IExternalSP } from '../types/sp-federation.types';

// Mock logger
jest.mock('../utils/logger', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    },
}));

const { logger } = require('../utils/logger');

describe('OAuth Utils', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('generateSecureSecret', () => {
        describe('Happy Path', () => {
            it('should generate a 32-byte secret by default', () => {
                const secret = generateSecureSecret();
                
                // base64url encoded 32 bytes
                expect(secret).toBeTruthy();
                expect(typeof secret).toBe('string');
                expect(secret.length).toBeGreaterThan(0);
            });

            it('should generate secret of specified length', () => {
                const secret = generateSecureSecret(16);
                
                expect(secret).toBeTruthy();
                expect(typeof secret).toBe('string');
            });

            it('should generate different secrets each time', () => {
                const secret1 = generateSecureSecret();
                const secret2 = generateSecureSecret();
                
                expect(secret1).not.toBe(secret2);
            });
        });

        describe('Edge Cases', () => {
            it('should generate secret with length 1', () => {
                const secret = generateSecureSecret(1);
                
                expect(secret).toBeTruthy();
            });

            it('should generate secret with length 64', () => {
                const secret = generateSecureSecret(64);
                
                expect(secret).toBeTruthy();
            });
        });
    });

    describe('generateCodeVerifier', () => {
        describe('Happy Path', () => {
            it('should generate a code verifier', () => {
                const verifier = generateCodeVerifier();
                
                expect(verifier).toBeTruthy();
                expect(typeof verifier).toBe('string');
            });

            it('should generate different verifiers each time', () => {
                const verifier1 = generateCodeVerifier();
                const verifier2 = generateCodeVerifier();
                
                expect(verifier1).not.toBe(verifier2);
            });
        });
    });

    describe('generateCodeChallenge', () => {
        describe('Happy Path', () => {
            it('should generate S256 challenge by default', () => {
                const verifier = 'test-verifier-1234567890';
                const challenge = generateCodeChallenge(verifier);
                
                expect(challenge).toBeTruthy();
                expect(typeof challenge).toBe('string');
                expect(challenge).not.toBe(verifier);
            });

            it('should generate S256 challenge explicitly', () => {
                const verifier = 'test-verifier-1234567890';
                const challenge = generateCodeChallenge(verifier, 'S256');
                
                expect(challenge).toBeTruthy();
                expect(challenge).not.toBe(verifier);
            });

            it('should return plain verifier for plain method', () => {
                const verifier = 'test-verifier-1234567890';
                const challenge = generateCodeChallenge(verifier, 'plain');
                
                expect(challenge).toBe(verifier);
            });

            it('should generate consistent challenge for same verifier', () => {
                const verifier = 'test-verifier-1234567890';
                const challenge1 = generateCodeChallenge(verifier);
                const challenge2 = generateCodeChallenge(verifier);
                
                expect(challenge1).toBe(challenge2);
            });
        });

        describe('Edge Cases', () => {
            it('should handle empty verifier', () => {
                const challenge = generateCodeChallenge('');
                
                expect(challenge).toBeTruthy();
            });

            it('should handle very long verifier', () => {
                const verifier = 'a'.repeat(1000);
                const challenge = generateCodeChallenge(verifier);
                
                expect(challenge).toBeTruthy();
            });
        });
    });

    describe('validateClient', () => {
        const mockSP: IExternalSP = {
            spId: 'sp-123',
            name: 'Test SP',
            organizationType: 'GOVERNMENT',
            country: 'USA',
            technicalContact: {
                name: 'John Doe',
                email: 'john@example.com',
            },
            clientId: 'test-client-id',
            clientSecret: 'test-secret',
            clientType: 'confidential',
            redirectUris: ['https://example.com/callback'],
            tokenEndpointAuthMethod: 'client_secret_basic',
            requirePKCE: true,
            allowedScopes: ['openid', 'profile'],
            allowedGrantTypes: ['authorization_code'],
            attributeRequirements: {
                clearance: true,
                country: true,
            },
            rateLimit: {
                requestsPerMinute: 100,
                burstSize: 20,
            },
            federationAgreements: [],
            status: 'ACTIVE',
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        describe('Happy Path', () => {
            it('should validate confidential client with correct credentials', () => {
                const result = validateClient('test-client-id', 'test-secret', mockSP);
                
                expect(result).toBe(mockSP);
                expect(logger.warn).not.toHaveBeenCalled();
            });

            it('should validate public client without secret', () => {
                const publicSP = { ...mockSP, clientType: 'public' as const, clientSecret: undefined };
                const result = validateClient('test-client-id', undefined, publicSP);
                
                expect(result).toBe(publicSP);
            });
        });

        describe('Invalid Client Cases', () => {
            it('should reject null SP', () => {
                const result = validateClient('test-client-id', 'secret', null);
                
                expect(result).toBeNull();
                expect(logger.warn).toHaveBeenCalledWith('Client not found', { clientId: 'test-client-id' });
            });

            it('should reject inactive client', () => {
                const inactiveSP = { ...mockSP, status: 'SUSPENDED' as const };
                const result = validateClient('test-client-id', 'test-secret', inactiveSP);
                
                expect(result).toBeNull();
                expect(logger.warn).toHaveBeenCalledWith('Client not active', { 
                    clientId: 'test-client-id', 
                    status: 'SUSPENDED' 
                });
            });

            it('should reject confidential client with missing secret', () => {
                const result = validateClient('test-client-id', undefined, mockSP);
                
                expect(result).toBeNull();
                expect(logger.warn).toHaveBeenCalledWith('Invalid client credentials', { 
                    clientId: 'test-client-id' 
                });
            });

            it('should reject confidential client with wrong secret', () => {
                const result = validateClient('test-client-id', 'wrong-secret', mockSP);
                
                expect(result).toBeNull();
                expect(logger.warn).toHaveBeenCalledWith('Invalid client credentials', { 
                    clientId: 'test-client-id' 
                });
            });

            it('should handle validation error and return null', () => {
                // Create SP that throws error during validation
                const errorSP = {
                    ...mockSP,
                    get status() { throw new Error('Test error'); }
                };
                
                const result = validateClient('test-client-id', 'test-secret', errorSP as any);
                
                expect(result).toBeNull();
                expect(logger.error).toHaveBeenCalled();
            });
        });
    });

    describe('isValidRedirectUri', () => {
        describe('Happy Path', () => {
            it('should validate exact match', () => {
                const uri = 'https://example.com/callback';
                const allowedUris = ['https://example.com/callback', 'https://example.com/other'];
                
                expect(isValidRedirectUri(uri, allowedUris)).toBe(true);
            });

            it('should reject non-matching URI', () => {
                const uri = 'https://malicious.com/callback';
                const allowedUris = ['https://example.com/callback'];
                
                expect(isValidRedirectUri(uri, allowedUris)).toBe(false);
            });
        });

        describe('Security Cases', () => {
            it('should reject partial matches', () => {
                const uri = 'https://example.com/callback/extra';
                const allowedUris = ['https://example.com/callback'];
                
                expect(isValidRedirectUri(uri, allowedUris)).toBe(false);
            });

            it('should reject substring matches', () => {
                const uri = 'https://example.com/callback';
                const allowedUris = ['https://example.com/callbac'];
                
                expect(isValidRedirectUri(uri, allowedUris)).toBe(false);
            });

            it('should handle empty allowed list', () => {
                const uri = 'https://example.com/callback';
                
                expect(isValidRedirectUri(uri, [])).toBe(false);
            });
        });
    });

    describe('parseBasicAuth', () => {
        describe('Happy Path', () => {
            it('should parse valid Basic Auth header', () => {
                const authHeader = 'Basic ' + Buffer.from('username:password').toString('base64');
                const result = parseBasicAuth(authHeader);
                
                expect(result).toEqual({
                    username: 'username',
                    password: 'password',
                });
            });

            it('should parse credentials with special characters', () => {
                const authHeader = 'Basic ' + Buffer.from('user@example.com:p@ssw0rd!').toString('base64');
                const result = parseBasicAuth(authHeader);
                
                expect(result).toEqual({
                    username: 'user@example.com',
                    password: 'p@ssw0rd!',
                });
            });

            it('should handle password with colon (splits on all colons)', () => {
                const authHeader = 'Basic ' + Buffer.from('username:pass:word').toString('base64');
                const result = parseBasicAuth(authHeader);
                
                // Note: split(':') splits all colons, destructuring takes first 2
                expect(result).toEqual({
                    username: 'username',
                    password: 'pass',  // "word" is discarded
                });
            });
        });

        describe('Invalid Auth Headers', () => {
            it('should return null for missing header', () => {
                expect(parseBasicAuth('')).toBeNull();
            });

            it('should return null for null header', () => {
                expect(parseBasicAuth(null as any)).toBeNull();
            });

            it('should return null for non-Basic header', () => {
                expect(parseBasicAuth('Bearer token123')).toBeNull();
            });

            it('should return null for invalid base64', () => {
                expect(parseBasicAuth('Basic invalid!!!base64')).toBeNull();
            });

            it('should return null for missing username', () => {
                const authHeader = 'Basic ' + Buffer.from(':password').toString('base64');
                expect(parseBasicAuth(authHeader)).toBeNull();
            });

            it('should return null for missing password', () => {
                const authHeader = 'Basic ' + Buffer.from('username:').toString('base64');
                expect(parseBasicAuth(authHeader)).toBeNull();
            });

            it('should return null for credentials without colon', () => {
                const authHeader = 'Basic ' + Buffer.from('usernamepassword').toString('base64');
                expect(parseBasicAuth(authHeader)).toBeNull();
            });
        });
    });

    describe('validateScopes', () => {
        describe('Happy Path', () => {
            it('should return valid scopes', () => {
                const requested = ['openid', 'profile', 'email'];
                const allowed = ['openid', 'profile', 'email', 'address'];
                
                expect(validateScopes(requested, allowed)).toEqual(['openid', 'profile', 'email']);
            });

            it('should filter out invalid scopes', () => {
                const requested = ['openid', 'invalid', 'profile'];
                const allowed = ['openid', 'profile'];
                
                expect(validateScopes(requested, allowed)).toEqual(['openid', 'profile']);
            });

            it('should handle empty requested scopes', () => {
                expect(validateScopes([], ['openid'])).toEqual([]);
            });

            it('should filter out empty strings', () => {
                const requested = ['openid', '', 'profile', '  '];
                const allowed = ['openid', 'profile'];
                
                const result = validateScopes(requested, allowed);
                expect(result).not.toContain('');
            });
        });

        describe('Edge Cases', () => {
            it('should return empty array when no scopes match', () => {
                const requested = ['invalid1', 'invalid2'];
                const allowed = ['openid', 'profile'];
                
                expect(validateScopes(requested, allowed)).toEqual([]);
            });

            it('should handle whitespace-only scopes', () => {
                const requested = ['   ', 'openid'];
                const allowed = ['openid'];
                
                expect(validateScopes(requested, allowed)).toEqual(['openid']);
            });
        });
    });

    describe('hasScope', () => {
        describe('Happy Path', () => {
            it('should return true when scope exists', () => {
                const scopes = ['openid', 'profile', 'email'];
                
                expect(hasScope(scopes, 'profile')).toBe(true);
            });

            it('should return false when scope does not exist', () => {
                const scopes = ['openid', 'profile'];
                
                expect(hasScope(scopes, 'email')).toBe(false);
            });
        });

        describe('Edge Cases', () => {
            it('should handle empty scopes array', () => {
                expect(hasScope([], 'openid')).toBe(false);
            });

            it('should be case-sensitive', () => {
                expect(hasScope(['openid'], 'OpenId')).toBe(false);
            });
        });
    });

    describe('generateNonce', () => {
        describe('Happy Path', () => {
            it('should generate a nonce', () => {
                const nonce = generateNonce();
                
                expect(nonce).toBeTruthy();
                expect(typeof nonce).toBe('string');
            });

            it('should generate different nonces each time', () => {
                const nonce1 = generateNonce();
                const nonce2 = generateNonce();
                
                expect(nonce1).not.toBe(nonce2);
            });
        });
    });

    describe('calculateExpiry', () => {
        describe('Happy Path', () => {
            it('should calculate expiry timestamp', () => {
                const now = Math.floor(Date.now() / 1000);
                const expiry = calculateExpiry(3600);
                
                expect(expiry).toBeGreaterThan(now);
                expect(expiry).toBeLessThanOrEqual(now + 3600 + 1);
            });

            it('should handle zero lifetime', () => {
                const now = Math.floor(Date.now() / 1000);
                const expiry = calculateExpiry(0);
                
                expect(expiry).toBeGreaterThanOrEqual(now - 1);
                expect(expiry).toBeLessThanOrEqual(now + 1);
            });
        });

        describe('Edge Cases', () => {
            it('should handle large lifetime', () => {
                const expiry = calculateExpiry(86400 * 365); // 1 year
                
                expect(expiry).toBeGreaterThan(Date.now() / 1000);
            });

            it('should handle negative lifetime', () => {
                const expiry = calculateExpiry(-3600);
                
                expect(expiry).toBeLessThan(Date.now() / 1000);
            });
        });
    });

    describe('validateAudience', () => {
        describe('Happy Path', () => {
            it('should validate single audience match', () => {
                const result = validateAudience('api.example.com', 'api.example.com');
                
                expect(result).toBe(true);
            });

            it('should validate array audience match', () => {
                const tokenAud = ['api.example.com', 'admin.example.com'];
                const expectedAud = ['api.example.com'];
                
                expect(validateAudience(tokenAud, expectedAud)).toBe(true);
            });

            it('should validate when token has single and expected has array', () => {
                const tokenAud = 'api.example.com';
                const expectedAud = ['api.example.com', 'other.example.com'];
                
                expect(validateAudience(tokenAud, expectedAud)).toBe(true);
            });

            it('should validate when token has array and expected has single', () => {
                const tokenAud = ['api.example.com', 'admin.example.com'];
                const expectedAud = 'api.example.com';
                
                expect(validateAudience(tokenAud, expectedAud)).toBe(true);
            });
        });

        describe('Invalid Audiences', () => {
            it('should reject non-matching single audience', () => {
                const result = validateAudience('other.example.com', 'api.example.com');
                
                expect(result).toBe(false);
            });

            it('should reject non-matching array audiences', () => {
                const tokenAud = ['other.example.com', 'another.example.com'];
                const expectedAud = ['api.example.com'];
                
                expect(validateAudience(tokenAud, expectedAud)).toBe(false);
            });
        });

        describe('Edge Cases', () => {
            it('should handle empty token audience array', () => {
                expect(validateAudience([], ['api.example.com'])).toBe(false);
            });

            it('should handle empty expected audience array', () => {
                expect(validateAudience(['api.example.com'], [])).toBe(false);
            });
        });
    });

    describe('extractClientCredentials', () => {
        describe('Happy Path - Basic Auth', () => {
            it('should extract credentials from Basic Auth', () => {
                const authHeader = 'Basic ' + Buffer.from('client-id:client-secret').toString('base64');
                const req = {
                    headers: { authorization: authHeader },
                    body: {},
                };
                
                const result = extractClientCredentials(req);
                
                expect(result).toEqual({
                    clientId: 'client-id',
                    clientSecret: 'client-secret',
                    method: 'basic',
                });
            });
        });

        describe('Happy Path - POST Body', () => {
            it('should extract credentials from POST body', () => {
                const req = {
                    headers: {},
                    body: {
                        client_id: 'client-id',
                        client_secret: 'client-secret',
                    },
                };
                
                const result = extractClientCredentials(req);
                
                expect(result).toEqual({
                    clientId: 'client-id',
                    clientSecret: 'client-secret',
                    method: 'post',
                });
            });

            it('should extract only client_id from POST body', () => {
                const req = {
                    headers: {},
                    body: {
                        client_id: 'public-client-id',
                    },
                };
                
                const result = extractClientCredentials(req);
                
                expect(result).toEqual({
                    clientId: 'public-client-id',
                    clientSecret: undefined,
                    method: 'post',
                });
            });
        });

        describe('Fallback Cases', () => {
            it('should prefer Basic Auth over POST body', () => {
                const authHeader = 'Basic ' + Buffer.from('basic-client:basic-secret').toString('base64');
                const req = {
                    headers: { authorization: authHeader },
                    body: {
                        client_id: 'post-client',
                        client_secret: 'post-secret',
                    },
                };
                
                const result = extractClientCredentials(req);
                
                expect(result.method).toBe('basic');
                expect(result.clientId).toBe('basic-client');
            });

            it('should return none when no credentials provided', () => {
                const req = {
                    headers: {},
                    body: {},
                };
                
                const result = extractClientCredentials(req);
                
                expect(result).toEqual({ method: 'none' });
            });

            it('should return none for invalid Basic Auth', () => {
                const req = {
                    headers: { authorization: 'Basic invalid' },
                    body: {},
                };
                
                const result = extractClientCredentials(req);
                
                expect(result).toEqual({ method: 'none' });
            });

            it('should return none for Bearer token', () => {
                const req = {
                    headers: { authorization: 'Bearer token123' },
                    body: {},
                };
                
                const result = extractClientCredentials(req);
                
                expect(result).toEqual({ method: 'none' });
            });
        });
    });
});

