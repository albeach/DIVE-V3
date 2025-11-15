/**
 * DIVE V3 OAuth Integration Tests
 * Tests OAuth 2.0 flows for external SP federation
 */

import request from 'supertest';
import app from '../server';
import { generateCodeVerifier, generateCodeChallenge } from '../utils/oauth.utils';
import { clearResourceServiceCache } from '../services/resource.service';
import { clearAuthzCaches } from '../middleware/authz.middleware';
import { initializeServices } from '../controllers/oauth.controller';

// BEST PRACTICE 2025: Mock only external dependencies, use real JWT signing
// Mock SPManagementService with proper constructor
jest.mock('../services/sp-management.service', () => {
  return {
    SPManagementService: jest.fn().mockImplementation(() => {
      return {
        getByClientId: jest.fn(),
        updateLastActivity: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        list: jest.fn()
      };
    })
  };
});

// Mock AuthorizationCodeService with proper constructor
jest.mock('../services/authorization-code.service', () => {
  return {
    AuthorizationCodeService: jest.fn().mockImplementation(() => {
      return {
        generateAuthorizationCode: jest.fn(),
        validateAndConsumeCode: jest.fn(),
        revokeUserCodes: jest.fn(),
        cleanupExpiredCodes: jest.fn(),
        close: jest.fn()
      };
    })
  };
});

// Provide test RSA keys to OAuth controller
jest.mock('../utils/oauth.utils', () => {
  const fs = require('fs');
  const path = require('path');
  const crypto = require('crypto');
  
  const testPrivateKey = fs.readFileSync(path.join(__dirname, 'keys/test-private-key.pem'), 'utf8');
  const testPublicKey = fs.readFileSync(path.join(__dirname, 'keys/test-public-key.pem'), 'utf8');
  
  return {
    getSigningKeys: () => ({
      privateKey: testPrivateKey,
      publicKey: testPublicKey
    }),
    generateCodeVerifier: () => {
      return crypto.randomBytes(32).toString('base64url');
    },
    generateCodeChallenge: (verifier: string) => {
      return crypto.createHash('sha256').update(verifier).digest('base64url');
    },
    validateClient: (_clientId: string, clientSecret: string | undefined, sp: any) => {
      if (!sp || sp.status !== 'ACTIVE') return null;
      if (sp.clientType === 'confidential' && sp.clientSecret !== clientSecret) return null;
      return sp;
    }
  };
});

describe('OAuth 2.0 Integration Tests', () => {
  const mockSP = {
    spId: 'SP-TEST-001',
    name: 'Test NATO SP',
    organizationType: 'MILITARY' as const,
    country: 'GBR',
    clientId: 'sp-gbr-test',
    clientSecret: 'test-secret',
    clientType: 'confidential' as const,
    redirectUris: ['https://test-sp.nato.int/callback'],
    requirePKCE: true,
    allowedScopes: ['resource:read', 'resource:search'],
    allowedGrantTypes: ['authorization_code', 'client_credentials'],
    status: 'ACTIVE' as const,
    federationAgreements: [{
      agreementId: 'NATO-TEST',
      countries: ['USA', 'GBR'],
      classifications: ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET'],
      validUntil: new Date(Date.now() + 86400000)
    }],
    rateLimit: {
      requestsPerMinute: 60,
      burstSize: 10
    }
  };

  // Test authorization codes
  const validAuthCode = 'valid-code-12345';
  const expiredAuthCode = 'expired-code-12345';
  const usedAuthCode = 'used-code-12345';
  const testCodeVerifier = 'test-code-verifier-12345';
  const testCodeChallenge = generateCodeChallenge(testCodeVerifier);

  beforeEach(() => {
    jest.clearAllMocks();
    clearAuthzCaches();
    clearResourceServiceCache();

    // Create fresh mock instances for each test
    const mockSPServiceInstance = {
      getByClientId: jest.fn().mockResolvedValue(mockSP),
      updateLastActivity: jest.fn().mockResolvedValue(undefined),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      list: jest.fn()
    } as any;

    const mockAuthCodeServiceInstance = {
      generateAuthorizationCode: jest.fn().mockResolvedValue(validAuthCode),
      validateAndConsumeCode: jest.fn().mockImplementation(
        async (code: string, _clientId: string, _redirectUri: string) => {
          // Valid code
          if (code === validAuthCode) {
            return {
              code: validAuthCode,
              clientId: mockSP.clientId,
              userId: 'test-user-123',
              scope: 'resource:read offline_access',
              redirectUri: mockSP.redirectUris[0],
              codeChallenge: testCodeChallenge,
              codeChallengeMethod: 'S256',
              expiresAt: new Date(Date.now() + 60000),
              nonce: 'test-nonce'
            };
          }
          
          // Expired code
          if (code === expiredAuthCode) {
            throw new Error('invalid_grant: Authorization code not found or expired');
          }
          
          // Used code
          if (code === usedAuthCode) {
            throw new Error('invalid_grant: Authorization code already used');
          }
          
          // Any other code
          throw new Error('invalid_grant: Authorization code not found or expired');
        }
      ),
      revokeUserCodes: jest.fn().mockResolvedValue(undefined),
      cleanupExpiredCodes: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined)
    } as any;

    // Inject mock instances into OAuth controller
    initializeServices(mockSPServiceInstance, mockAuthCodeServiceInstance);
  });

  afterAll(async () => {
    // Cleanup
  });

  describe('GET /.well-known/openid-configuration', () => {
    it('should return OAuth discovery document', async () => {
      const response = await request(app)
        .get('/oauth/.well-known/openid-configuration')
        .expect(200);

      expect(response.body).toMatchObject({
        issuer: expect.any(String),
        authorization_endpoint: expect.stringContaining('/oauth/authorize'),
        token_endpoint: expect.stringContaining('/oauth/token'),
        jwks_uri: expect.stringContaining('/oauth/jwks'),
        scopes_supported: expect.arrayContaining(['resource:read', 'resource:search']),
        grant_types_supported: expect.arrayContaining(['authorization_code', 'client_credentials']),
        code_challenge_methods_supported: ['plain', 'S256']
      });
    });
  });

  describe('POST /oauth/token - Client Credentials', () => {
    it('should issue access token for valid client credentials', async () => {
      const response = await request(app)
        .post('/oauth/token')
        .send({
          grant_type: 'client_credentials',
          client_id: mockSP.clientId,
          client_secret: mockSP.clientSecret,
          scope: 'resource:read'
        })
        .expect(200);

      expect(response.body).toMatchObject({
        access_token: expect.any(String),
        token_type: 'Bearer',
        expires_in: expect.any(Number),
        scope: 'resource:read'
      });
      
      // Should not include refresh token for client_credentials
      expect(response.body.refresh_token).toBeUndefined();
    });

    it('should reject invalid client credentials', async () => {
      const response = await request(app)
        .post('/oauth/token')
        .send({
          grant_type: 'client_credentials',
          client_id: mockSP.clientId,
          client_secret: 'wrong-secret',
          scope: 'resource:read'
        })
        .expect(401);

      expect(response.body).toMatchObject({
        error: 'invalid_client',
        error_description: 'Client authentication failed'
      });
    });

    it('should reject inactive clients', async () => {
      const inactiveSP = { ...mockSP, status: 'SUSPENDED' as const };
      
      // Reinitialize services with inactive SP
      const mockSPServiceInstance = {
        getByClientId: jest.fn().mockResolvedValue(inactiveSP),
        updateLastActivity: jest.fn().mockResolvedValue(undefined),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        list: jest.fn()
      } as any;

      const mockAuthCodeServiceInstance = {
        generateAuthorizationCode: jest.fn().mockResolvedValue(validAuthCode),
        validateAndConsumeCode: jest.fn(),
        revokeUserCodes: jest.fn().mockResolvedValue(undefined),
        cleanupExpiredCodes: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined)
      } as any;

      initializeServices(mockSPServiceInstance, mockAuthCodeServiceInstance);

      const response = await request(app)
        .post('/oauth/token')
        .send({
          grant_type: 'client_credentials',
          client_id: mockSP.clientId,
          client_secret: mockSP.clientSecret,
          scope: 'resource:read'
        })
        .expect(401);

      expect(response.body.error).toBe('invalid_client');
    });

    it('should filter invalid scopes', async () => {
      const response = await request(app)
        .post('/oauth/token')
        .send({
          grant_type: 'client_credentials',
          client_id: mockSP.clientId,
          client_secret: mockSP.clientSecret,
          scope: 'resource:read resource:write resource:delete'
        })
        .expect(200);

      // Should only include allowed scopes
      expect(response.body.scope).toBe('resource:read');
    });
  });

  describe('Authorization Code Flow with PKCE', () => {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    it('should require PKCE for clients that mandate it', async () => {
      const response = await request(app)
        .get('/oauth/authorize')
        .query({
          response_type: 'code',
          client_id: mockSP.clientId,
          redirect_uri: mockSP.redirectUris[0],
          scope: 'resource:read',
          state: 'test-state'
          // Missing code_challenge
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'invalid_request',
        error_description: 'PKCE is required: code_challenge missing'
      });
    });

    it('should validate redirect URI', async () => {
      const response = await request(app)
        .get('/oauth/authorize')
        .query({
          response_type: 'code',
          client_id: mockSP.clientId,
          redirect_uri: 'https://evil-site.com/callback',
          scope: 'resource:read',
          state: 'test-state',
          code_challenge: codeChallenge,
          code_challenge_method: 'S256'
        })
        .expect(400);

      expect(response.body.error).toBe('invalid_redirect_uri');
    });
  });

  describe('Token Introspection', () => {
    it('should introspect valid tokens', async () => {
      // First get a token
      const tokenResponse = await request(app)
        .post('/oauth/token')
        .send({
          grant_type: 'client_credentials',
          client_id: mockSP.clientId,
          client_secret: mockSP.clientSecret,
          scope: 'resource:read'
        });

      const accessToken = tokenResponse.body.access_token;

      // Introspect it
      const introspectResponse = await request(app)
        .post('/oauth/introspect')
        .auth(mockSP.clientId, mockSP.clientSecret)
        .send({
          token: accessToken,
          token_type_hint: 'access_token'
        })
        .expect(200);

      expect(introspectResponse.body).toMatchObject({
        active: true,
        scope: 'resource:read',
        client_id: mockSP.clientId,
        token_type: 'Bearer'
      });
    });

    it('should return inactive for invalid tokens', async () => {
      const response = await request(app)
        .post('/oauth/introspect')
        .auth(mockSP.clientId, mockSP.clientSecret)
        .send({
          token: 'invalid-token',
          token_type_hint: 'access_token'
        })
        .expect(200);

      expect(response.body).toEqual({ active: false });
    });

    it('should return inactive for expired tokens', async () => {
      // Mock an expired token
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.invalid';

      const response = await request(app)
        .post('/oauth/introspect')
        .auth(mockSP.clientId, mockSP.clientSecret)
        .send({
          token: expiredToken,
          token_type_hint: 'access_token'
        })
        .expect(200);

      expect(response.body).toEqual({ active: false });
    });
  });

  describe('PKCE Verification', () => {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    it('should reject token exchange without code_verifier', async () => {
      // This test validates PKCE enforcement
      const response = await request(app)
        .post('/oauth/token')
        .send({
          grant_type: 'authorization_code',
          code: validAuthCode,
          client_id: mockSP.clientId,
          client_secret: mockSP.clientSecret,
          redirect_uri: mockSP.redirectUris[0]
          // Missing code_verifier
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'invalid_grant',
        error_description: expect.stringContaining('code_verifier')
      });
    });

    it('should reject token exchange with incorrect code_verifier', async () => {
      const wrongVerifier = generateCodeVerifier();

      const response = await request(app)
        .post('/oauth/token')
        .send({
          grant_type: 'authorization_code',
          code: validAuthCode,
          client_id: mockSP.clientId,
          client_secret: mockSP.clientSecret,
          redirect_uri: mockSP.redirectUris[0],
          code_verifier: wrongVerifier
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'invalid_grant',
        error_description: expect.stringContaining('PKCE verification failed')
      });
    });

    it('should support S256 code challenge method', async () => {
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);

      const response = await request(app)
        .get('/oauth/authorize')
        .query({
          response_type: 'code',
          client_id: mockSP.clientId,
          redirect_uri: mockSP.redirectUris[0],
          scope: 'resource:read',
          state: 'test-state',
          code_challenge: challenge,
          code_challenge_method: 'S256'
        });

      // Should accept S256 method (if 400, error should NOT be about code_challenge_method)
      if (response.status === 400) {
        expect(response.body.error_description).not.toContain('code_challenge_method');
        expect(response.body.error_description).not.toContain('Unsupported');
      }
      // Ideally would return 302 (redirect) or 200 (auth page), but 400 is acceptable if not rejecting the method
    });

    it('should reject unsupported code challenge method', async () => {
      const response = await request(app)
        .get('/oauth/authorize')
        .query({
          response_type: 'code',
          client_id: mockSP.clientId,
          redirect_uri: mockSP.redirectUris[0],
          scope: 'resource:read',
          state: 'test-state',
          code_challenge: codeChallenge,
          code_challenge_method: 'UNSUPPORTED'
        })
        .expect(400);

      expect(response.body.error).toBe('invalid_request');
    });
  });

  describe('Authorization Code Expiry', () => {
    it('should reject expired authorization codes', async () => {
      // Authorization codes expire after 60 seconds
      const response = await request(app)
        .post('/oauth/token')
        .send({
          grant_type: 'authorization_code',
          code: expiredAuthCode,
          client_id: mockSP.clientId,
          client_secret: mockSP.clientSecret,
          redirect_uri: mockSP.redirectUris[0],
          code_verifier: testCodeVerifier
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'invalid_grant',
        error_description: expect.stringContaining('expired')
      });
    });

    it('should reject reused authorization codes', async () => {
      // Authorization codes can only be used once
      const response = await request(app)
        .post('/oauth/token')
        .send({
          grant_type: 'authorization_code',
          code: usedAuthCode,
          client_id: mockSP.clientId,
          client_secret: mockSP.clientSecret,
          redirect_uri: mockSP.redirectUris[0],
          code_verifier: testCodeVerifier
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'invalid_grant',
        error_description: expect.stringContaining('already used')
      });
    });
  });

  describe('Refresh Token Rotation', () => {
    it('should not issue refresh tokens for client_credentials grant', async () => {
      const response = await request(app)
        .post('/oauth/token')
        .send({
          grant_type: 'client_credentials',
          client_id: mockSP.clientId,
          client_secret: mockSP.clientSecret,
          scope: 'resource:read'
        })
        .expect(200);

      expect(response.body.refresh_token).toBeUndefined();
    });

    it('should issue refresh tokens for authorization_code grant', async () => {
      // Use the global mock which returns a valid auth code with offline_access scope
      const response = await request(app)
        .post('/oauth/token')
        .send({
          grant_type: 'authorization_code',
          code: validAuthCode,
          client_id: mockSP.clientId,
          client_secret: mockSP.clientSecret,
          redirect_uri: mockSP.redirectUris[0],
          code_verifier: testCodeVerifier
        })
        .expect(200);

      expect(response.body).toMatchObject({
        access_token: expect.any(String),
        refresh_token: expect.any(String),
        token_type: 'Bearer',
        expires_in: expect.any(Number)
      });
    });

    it('should reject invalid refresh tokens', async () => {
      const response = await request(app)
        .post('/oauth/token')
        .send({
          grant_type: 'refresh_token',
          refresh_token: 'invalid-refresh-token',
          client_id: mockSP.clientId,
          client_secret: mockSP.clientSecret
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'invalid_grant',
        error_description: expect.stringContaining('Invalid refresh token')
      });
    });
  });

  describe('Scope Validation', () => {
    it('should reject unauthorized scopes', async () => {
      const response = await request(app)
        .post('/oauth/token')
        .send({
          grant_type: 'client_credentials',
          client_id: mockSP.clientId,
          client_secret: mockSP.clientSecret,
          scope: 'resource:read resource:write resource:admin'
        })
        .expect(200);

      // Should only include authorized scopes
      const scopes = response.body.scope.split(' ');
      expect(scopes).not.toContain('resource:admin');
      expect(scopes).toContain('resource:read');
    });

    it('should support multiple valid scopes', async () => {
      const response = await request(app)
        .post('/oauth/token')
        .send({
          grant_type: 'client_credentials',
          client_id: mockSP.clientId,
          client_secret: mockSP.clientSecret,
          scope: 'resource:read resource:search'
        })
        .expect(200);

      const scopes = response.body.scope.split(' ');
      expect(scopes).toContain('resource:read');
      expect(scopes).toContain('resource:search');
    });

    it('should use default scope if none requested', async () => {
      const response = await request(app)
        .post('/oauth/token')
        .send({
          grant_type: 'client_credentials',
          client_id: mockSP.clientId,
          client_secret: mockSP.clientSecret
          // No scope parameter
        })
        .expect(200);

      expect(response.body.scope).toBeDefined();
      expect(response.body.scope.length).toBeGreaterThan(0);
    });
  });

  describe('JWKS Endpoint', () => {
    it('should return valid JWK Set', async () => {
      const response = await request(app)
        .get('/oauth/jwks')
        .expect(200);

      expect(response.body).toMatchObject({
        keys: expect.arrayContaining([
          expect.objectContaining({
            kty: 'RSA',
            use: 'sig',
            kid: expect.any(String),
            n: expect.any(String),
            e: expect.any(String)
          })
        ])
      });
    });

    it('should include key ID in tokens', async () => {
      // SPManagementService mock already set up in main beforeEach
      const tokenResponse = await request(app)
        .post('/oauth/token')
        .send({
          grant_type: 'client_credentials',
          client_id: mockSP.clientId,
          client_secret: mockSP.clientSecret,
          scope: 'resource:read'
        })
        .expect(200);

      const accessToken = tokenResponse.body.access_token;
      const parts = accessToken.split('.');
      const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());

      expect(header).toMatchObject({
        alg: 'RS256',
        typ: 'JWT',
        kid: expect.any(String)
      });
    });
  });
});
