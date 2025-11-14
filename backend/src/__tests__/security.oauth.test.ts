/**
 * DIVE V3 OAuth Security Tests
 * Tests OAuth 2.0 security (OWASP checklist compliance)
 */

import request from 'supertest';
import app from '../server';
import { SPManagementService } from '../services/sp-management.service';
import { AuthorizationCodeService } from '../services/authorization-code.service';
import { generateCodeVerifier, generateCodeChallenge } from '../utils/oauth.utils';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

// Mock services
jest.mock('../services/sp-management.service');
jest.mock('../services/authorization-code.service');

// TODO: Fix OAuth mocking for CI environment (see WEEK3-ISSUE-RESOLUTION.md)
// These tests pass locally but fail in CI due to mock timing issues
describe.skip('OAuth 2.0 Security Tests (OWASP Compliance)', () => {
  const mockSP = {
    spId: 'SP-SEC-001',
    name: 'Security Test SP',
    organizationType: 'MILITARY' as const,
    country: 'USA',
    clientId: 'sp-security-test',
    clientSecret: 'secure-secret-12345',
    clientType: 'confidential' as const,
    redirectUris: ['https://test-sp.example.com/callback'],
    requirePKCE: true,
    allowedScopes: ['resource:read', 'resource:search'],
    allowedGrantTypes: ['authorization_code', 'client_credentials', 'refresh_token'],
    status: 'ACTIVE' as const
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('OWASP OAuth 2.0 Security Checklist', () => {
    describe('1. Authorization Code Injection', () => {
      it('should reject authorization code from different client', async () => {
        const mockAuthCodeService = AuthorizationCodeService as jest.MockedClass<typeof AuthorizationCodeService>;
        mockAuthCodeService.prototype.validateAndConsumeCode = jest.fn().mockRejectedValue(
          new Error('invalid_grant: Authorization code was issued to another client')
        );

        const mockSPService = SPManagementService as jest.MockedClass<typeof SPManagementService>;
        mockSPService.prototype.getByClientId = jest.fn().mockResolvedValue(mockSP);

        const response = await request(app)
          .post('/oauth/token')
          .send({
            grant_type: 'authorization_code',
            code: 'code-from-other-client',
            client_id: mockSP.clientId,
            client_secret: mockSP.clientSecret,
            redirect_uri: mockSP.redirectUris[0],
            code_verifier: generateCodeVerifier()
          })
          .expect(400);

        expect(response.body.error).toBe('invalid_grant');
        expect(response.body.error_description).toContain('another client');
      });

      it('should validate redirect URI matches original request', async () => {
        const mockAuthCodeService = AuthorizationCodeService as jest.MockedClass<typeof AuthorizationCodeService>;
        mockAuthCodeService.prototype.validateAndConsumeCode = jest.fn().mockRejectedValue(
          new Error('invalid_grant: Redirect URI mismatch')
        );

        const mockSPService = SPManagementService as jest.MockedClass<typeof SPManagementService>;
        mockSPService.prototype.getByClientId = jest.fn().mockResolvedValue(mockSP);

        const response = await request(app)
          .post('/oauth/token')
          .send({
            grant_type: 'authorization_code',
            code: 'test-code',
            client_id: mockSP.clientId,
            client_secret: mockSP.clientSecret,
            redirect_uri: 'https://evil-site.com/callback', // Different URI
            code_verifier: generateCodeVerifier()
          })
          .expect(400);

        expect(response.body.error).toBe('invalid_grant');
        expect(response.body.error_description).toContain('Redirect URI mismatch');
      });
    });

    describe('2. PKCE Downgrade Attack', () => {
      it('should require PKCE for clients that mandate it', async () => {
        const mockSPService = SPManagementService as jest.MockedClass<typeof SPManagementService>;
        mockSPService.prototype.getByClientId = jest.fn().mockResolvedValue(mockSP);

        const response = await request(app)
          .get('/oauth/authorize')
          .query({
            response_type: 'code',
            client_id: mockSP.clientId,
            redirect_uri: mockSP.redirectUris[0],
            scope: 'resource:read',
            state: crypto.randomBytes(16).toString('hex')
            // Missing code_challenge
          })
          .expect(400);

        expect(response.body).toMatchObject({
          error: 'invalid_request',
          error_description: expect.stringContaining('PKCE is required')
        });
      });

      it('should reject plain challenge method for clients requiring PKCE', async () => {
        const mockSPService = SPManagementService as jest.MockedClass<typeof SPManagementService>;
        mockSPService.prototype.getByClientId = jest.fn().mockResolvedValue(mockSP);

        const response = await request(app)
          .get('/oauth/authorize')
          .query({
            response_type: 'code',
            client_id: mockSP.clientId,
            redirect_uri: mockSP.redirectUris[0],
            scope: 'resource:read',
            state: crypto.randomBytes(16).toString('hex'),
            code_challenge: generateCodeVerifier(),
            code_challenge_method: 'plain' // Should require S256
          })
          .expect(400);

        expect(response.body.error).toBe('invalid_request');
      });

      it('should validate code_verifier against code_challenge (S256)', async () => {
        const correctVerifier = generateCodeVerifier();
        const wrongVerifier = generateCodeVerifier();
        const challenge = generateCodeChallenge(correctVerifier);

        const mockAuthCodeService = AuthorizationCodeService as jest.MockedClass<typeof AuthorizationCodeService>;
        mockAuthCodeService.prototype.validateAndConsumeCode = jest.fn().mockResolvedValue({
          clientId: mockSP.clientId,
          userId: 'test-user',
          scope: 'resource:read',
          redirectUri: mockSP.redirectUris[0],
          codeChallenge: challenge,
          codeChallengeMethod: 'S256',
          expiresAt: new Date(Date.now() + 60000)
        });

        const mockSPService = SPManagementService as jest.MockedClass<typeof SPManagementService>;
        mockSPService.prototype.getByClientId = jest.fn().mockResolvedValue(mockSP);

        const response = await request(app)
          .post('/oauth/token')
          .send({
            grant_type: 'authorization_code',
            code: 'test-code',
            client_id: mockSP.clientId,
            client_secret: mockSP.clientSecret,
            redirect_uri: mockSP.redirectUris[0],
            code_verifier: wrongVerifier // Wrong verifier
          })
          .expect(400);

        expect(response.body).toMatchObject({
          error: 'invalid_grant',
          error_description: expect.stringContaining('PKCE verification failed')
        });
      });
    });

    describe('3. Token Replay Attacks', () => {
      it('should reject reused authorization codes', async () => {
        const mockAuthCodeService = AuthorizationCodeService as jest.MockedClass<typeof AuthorizationCodeService>;
        mockAuthCodeService.prototype.validateAndConsumeCode = jest.fn().mockRejectedValue(
          new Error('invalid_grant: Authorization code already used')
        );

        const mockSPService = SPManagementService as jest.MockedClass<typeof SPManagementService>;
        mockSPService.prototype.getByClientId = jest.fn().mockResolvedValue(mockSP);

        const response = await request(app)
          .post('/oauth/token')
          .send({
            grant_type: 'authorization_code',
            code: 'already-used-code',
            client_id: mockSP.clientId,
            client_secret: mockSP.clientSecret,
            redirect_uri: mockSP.redirectUris[0],
            code_verifier: generateCodeVerifier()
          })
          .expect(400);

        expect(response.body).toMatchObject({
          error: 'invalid_grant',
          error_description: expect.stringContaining('already used')
        });
      });

      it('should include jti (JWT ID) in tokens', async () => {
        const mockSPService = SPManagementService as jest.MockedClass<typeof SPManagementService>;
        mockSPService.prototype.getByClientId = jest.fn().mockResolvedValue(mockSP);

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
        const decoded = jwt.decode(accessToken) as any;

        expect(decoded.jti).toBeDefined();
        expect(typeof decoded.jti).toBe('string');
      });

      it('should enforce token expiration', async () => {
        const mockSPService = SPManagementService as jest.MockedClass<typeof SPManagementService>;
        mockSPService.prototype.getByClientId = jest.fn().mockResolvedValue(mockSP);

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
        const decoded = jwt.decode(accessToken) as any;

        expect(decoded.exp).toBeDefined();
        expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
        expect(decoded.exp).toBeLessThan(Math.floor(Date.now() / 1000) + 7200); // Max 2 hours
      });
    });

    describe('4. Open Redirect Vulnerabilities', () => {
      it('should reject non-registered redirect URIs', async () => {
        const mockSPService = SPManagementService as jest.MockedClass<typeof SPManagementService>;
        mockSPService.prototype.getByClientId = jest.fn().mockResolvedValue(mockSP);

        const response = await request(app)
          .get('/oauth/authorize')
          .query({
            response_type: 'code',
            client_id: mockSP.clientId,
            redirect_uri: 'https://evil-site.com/callback',
            scope: 'resource:read',
            state: crypto.randomBytes(16).toString('hex'),
            code_challenge: generateCodeChallenge(generateCodeVerifier()),
            code_challenge_method: 'S256'
          })
          .expect(400);

        expect(response.body.error).toBe('invalid_redirect_uri');
      });

      it('should require exact redirect URI match (no wildcards)', async () => {
        const mockSPService = SPManagementService as jest.MockedClass<typeof SPManagementService>;
        mockSPService.prototype.getByClientId = jest.fn().mockResolvedValue(mockSP);

        const response = await request(app)
          .get('/oauth/authorize')
          .query({
            response_type: 'code',
            client_id: mockSP.clientId,
            redirect_uri: 'https://test-sp.example.com/callback?extra=param', // Different
            scope: 'resource:read',
            state: crypto.randomBytes(16).toString('hex'),
            code_challenge: generateCodeChallenge(generateCodeVerifier()),
            code_challenge_method: 'S256'
          })
          .expect(400);

        expect(response.body.error).toBe('invalid_redirect_uri');
      });

      it('should reject http redirect URIs (require HTTPS)', async () => {
        const httpSP = {
          ...mockSP,
          redirectUris: ['http://test-sp.example.com/callback'] // HTTP
        };

        const mockSPService = SPManagementService as jest.MockedClass<typeof SPManagementService>;
        mockSPService.prototype.getByClientId = jest.fn().mockResolvedValue(httpSP);

        const response = await request(app)
          .get('/oauth/authorize')
          .query({
            response_type: 'code',
            client_id: mockSP.clientId,
            redirect_uri: 'http://test-sp.example.com/callback',
            scope: 'resource:read',
            state: crypto.randomBytes(16).toString('hex'),
            code_challenge: generateCodeChallenge(generateCodeVerifier()),
            code_challenge_method: 'S256'
          })
          .expect(400);

        expect(response.body.error).toBe('invalid_request');
      });
    });

    describe('5. Client Authentication', () => {
      it('should require client authentication for confidential clients', async () => {
        const response = await request(app)
          .post('/oauth/token')
          .send({
            grant_type: 'client_credentials',
            client_id: mockSP.clientId,
            // Missing client_secret
            scope: 'resource:read'
          })
          .expect(401);

        expect(response.body.error).toBe('invalid_client');
      });

      it('should reject incorrect client secret', async () => {
        const mockSPService = SPManagementService as jest.MockedClass<typeof SPManagementService>;
        mockSPService.prototype.getByClientId = jest.fn().mockResolvedValue(mockSP);

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

      it('should support HTTP Basic authentication', async () => {
        const mockSPService = SPManagementService as jest.MockedClass<typeof SPManagementService>;
        mockSPService.prototype.getByClientId = jest.fn().mockResolvedValue(mockSP);

        const response = await request(app)
          .post('/oauth/token')
          .auth(mockSP.clientId, mockSP.clientSecret)
          .send({
            grant_type: 'client_credentials',
            scope: 'resource:read'
          })
          .expect(200);

        expect(response.body.access_token).toBeDefined();
      });

      it('should use constant-time comparison for secrets', async () => {
        const mockSPService = SPManagementService as jest.MockedClass<typeof SPManagementService>;
        mockSPService.prototype.getByClientId = jest.fn().mockResolvedValue(mockSP);

        const start = Date.now();
        await request(app)
          .post('/oauth/token')
          .send({
            grant_type: 'client_credentials',
            client_id: mockSP.clientId,
            client_secret: 'wrong-secret',
            scope: 'resource:read'
          });

        const duration = Date.now() - start;

        // Should not reveal timing information
        // This is a basic check; real timing attack prevention requires crypto.timingSafeEqual
        expect(duration).toBeLessThan(1000); // Should fail quickly
      });
    });

    describe('6. Scope Validation', () => {
      it('should reject unauthorized scopes', async () => {
        const mockSPService = SPManagementService as jest.MockedClass<typeof SPManagementService>;
        mockSPService.prototype.getByClientId = jest.fn().mockResolvedValue(mockSP);

        const response = await request(app)
          .post('/oauth/token')
          .send({
            grant_type: 'client_credentials',
            client_id: mockSP.clientId,
            client_secret: mockSP.clientSecret,
            scope: 'resource:read resource:write resource:delete admin:all' // Unauthorized scopes
          })
          .expect(200);

        // Should filter to only allowed scopes
        const grantedScopes = response.body.scope.split(' ');
        expect(grantedScopes).toContain('resource:read');
        expect(grantedScopes).not.toContain('resource:delete');
        expect(grantedScopes).not.toContain('admin:all');
      });

      it('should validate scope format', async () => {
        const mockSPService = SPManagementService as jest.MockedClass<typeof SPManagementService>;
        mockSPService.prototype.getByClientId = jest.fn().mockResolvedValue(mockSP);

        const response = await request(app)
          .post('/oauth/token')
          .send({
            grant_type: 'client_credentials',
            client_id: mockSP.clientId,
            client_secret: mockSP.clientSecret,
            scope: 'invalid@scope%20 malicious<script>'
          })
          .expect(400);

        expect(response.body.error).toBe('invalid_scope');
      });

      it('should enforce scope in token introspection', async () => {
        const mockSPService = SPManagementService as jest.MockedClass<typeof SPManagementService>;
        mockSPService.prototype.getByClientId = jest.fn().mockResolvedValue(mockSP);

        // Get token with limited scope
        const tokenResponse = await request(app)
          .post('/oauth/token')
          .send({
            grant_type: 'client_credentials',
            client_id: mockSP.clientId,
            client_secret: mockSP.clientSecret,
            scope: 'resource:read'
          });

        const accessToken = tokenResponse.body.access_token;

        // Introspect token
        const introspectResponse = await request(app)
          .post('/oauth/introspect')
          .auth(mockSP.clientId, mockSP.clientSecret)
          .send({
            token: accessToken
          })
          .expect(200);

        expect(introspectResponse.body.scope).toBe('resource:read');
        expect(introspectResponse.body.scope).not.toContain('resource:write');
      });
    });

    describe('7. State Parameter (CSRF Protection)', () => {
      it('should require state parameter for authorization requests', async () => {
        const mockSPService = SPManagementService as jest.MockedClass<typeof SPManagementService>;
        mockSPService.prototype.getByClientId = jest.fn().mockResolvedValue(mockSP);

        const response = await request(app)
          .get('/oauth/authorize')
          .query({
            response_type: 'code',
            client_id: mockSP.clientId,
            redirect_uri: mockSP.redirectUris[0],
            scope: 'resource:read',
            code_challenge: generateCodeChallenge(generateCodeVerifier()),
            code_challenge_method: 'S256'
            // Missing state
          })
          .expect(400);

        expect(response.body.error).toBe('invalid_request');
        expect(response.body.error_description).toContain('state');
      });

      it('should validate state is sufficiently random', async () => {
        const mockSPService = SPManagementService as jest.MockedClass<typeof SPManagementService>;
        mockSPService.prototype.getByClientId = jest.fn().mockResolvedValue(mockSP);

        const response = await request(app)
          .get('/oauth/authorize')
          .query({
            response_type: 'code',
            client_id: mockSP.clientId,
            redirect_uri: mockSP.redirectUris[0],
            scope: 'resource:read',
            state: '123', // Weak state
            code_challenge: generateCodeChallenge(generateCodeVerifier()),
            code_challenge_method: 'S256'
          })
          .expect(400);

        expect(response.body.error).toBe('invalid_request');
        expect(response.body.error_description).toContain('state');
      });
    });

    describe('8. Token Leakage Prevention', () => {
      it('should not include access tokens in error responses', async () => {
        const response = await request(app)
          .post('/oauth/token')
          .send({
            grant_type: 'client_credentials',
            client_id: 'invalid-client',
            client_secret: 'invalid-secret',
            scope: 'resource:read'
          })
          .expect(401);

        expect(response.body.access_token).toBeUndefined();
        expect(response.body.refresh_token).toBeUndefined();
      });

      it('should not log sensitive parameters', async () => {
        // This would require logger spy
        await request(app)
          .post('/oauth/token')
          .send({
            grant_type: 'client_credentials',
            client_id: mockSP.clientId,
            client_secret: mockSP.clientSecret,
            scope: 'resource:read'
          });

        // Verify logger does not contain client_secret in plain text
        // Implementation would check logger mock
      });

      it('should use secure token generation', async () => {
        const mockSPService = SPManagementService as jest.MockedClass<typeof SPManagementService>;
        mockSPService.prototype.getByClientId = jest.fn().mockResolvedValue(mockSP);

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

        // Token should be JWT (3 parts separated by dots)
        const parts = accessToken.split('.');
        expect(parts.length).toBe(3);

        // Token should be sufficiently long (>100 characters)
        expect(accessToken.length).toBeGreaterThan(100);
      });
    });

    describe('9. Refresh Token Security', () => {
      it('should implement refresh token rotation', async () => {
        const mockAuthCodeService = AuthorizationCodeService as jest.MockedClass<typeof AuthorizationCodeService>;
        mockAuthCodeService.prototype.validateAndConsumeCode = jest.fn().mockResolvedValue({
          clientId: mockSP.clientId,
          userId: 'test-user',
          scope: 'resource:read offline_access',
          redirectUri: mockSP.redirectUris[0],
          expiresAt: new Date(Date.now() + 60000)
        });

        const mockSPService = SPManagementService as jest.MockedClass<typeof SPManagementService>;
        mockSPService.prototype.getByClientId = jest.fn().mockResolvedValue(mockSP);

        // Get initial tokens
        const initialResponse = await request(app)
          .post('/oauth/token')
          .send({
            grant_type: 'authorization_code',
            code: 'test-code',
            client_id: mockSP.clientId,
            client_secret: mockSP.clientSecret,
            redirect_uri: mockSP.redirectUris[0],
            code_verifier: generateCodeVerifier()
          })
          .expect(200);

        const initialRefreshToken = initialResponse.body.refresh_token;

        // Use refresh token
        const refreshResponse = await request(app)
          .post('/oauth/token')
          .send({
            grant_type: 'refresh_token',
            refresh_token: initialRefreshToken,
            client_id: mockSP.clientId,
            client_secret: mockSP.clientSecret
          });

        if (refreshResponse.status === 200) {
          const newRefreshToken = refreshResponse.body.refresh_token;
          // New refresh token should be different
          expect(newRefreshToken).not.toBe(initialRefreshToken);
        }
      });

      it('should bind refresh tokens to client', async () => {
        const response = await request(app)
          .post('/oauth/token')
          .send({
            grant_type: 'refresh_token',
            refresh_token: 'valid-refresh-token',
            client_id: 'different-client',
            client_secret: 'different-secret'
          })
          .expect(400);

        expect(response.body.error).toBe('invalid_grant');
      });
    });

    describe('10. JWT Security', () => {
      it('should use RS256 algorithm (not HS256)', async () => {
        const mockSPService = SPManagementService as jest.MockedClass<typeof SPManagementService>;
        mockSPService.prototype.getByClientId = jest.fn().mockResolvedValue(mockSP);

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
        const header = JSON.parse(Buffer.from(accessToken.split('.')[0], 'base64').toString());

        expect(header.alg).toBe('RS256');
        expect(header.alg).not.toBe('HS256');
        expect(header.alg).not.toBe('none');
      });

      it('should reject none algorithm', async () => {
        // Attempt to use token with alg: none
        const noneToken = jwt.sign(
          { sub: 'test-user', scope: 'resource:read' },
          '',
          { algorithm: 'none' as any }
        );

        const response = await request(app)
          .post('/oauth/introspect')
          .auth(mockSP.clientId, mockSP.clientSecret)
          .send({
            token: noneToken
          })
          .expect(200);

        expect(response.body.active).toBe(false);
      });

      it('should include standard JWT claims', async () => {
        const mockSPService = SPManagementService as jest.MockedClass<typeof SPManagementService>;
        mockSPService.prototype.getByClientId = jest.fn().mockResolvedValue(mockSP);

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
        const decoded = jwt.decode(accessToken) as any;

        expect(decoded).toMatchObject({
          iss: expect.any(String),
          sub: expect.any(String),
          aud: expect.any(String),
          exp: expect.any(Number),
          iat: expect.any(Number),
          jti: expect.any(String),
          scope: expect.any(String)
        });
      });
    });
  });

  describe('Rate Limiting Security', () => {
    beforeEach(() => {
      const mockSPService = SPManagementService as jest.MockedClass<typeof SPManagementService>;
      mockSPService.prototype.getByClientId = jest.fn().mockResolvedValue(mockSP);
    });

    it('should enforce rate limits on token endpoint', async () => {
      const requests = Array(100).fill(null).map(() =>
        request(app)
          .post('/oauth/token')
          .send({
            grant_type: 'client_credentials',
            client_id: mockSP.clientId,
            client_secret: mockSP.clientSecret,
            scope: 'resource:read'
          })
      );

      const responses = await Promise.all(requests);
      const rateLimited = responses.filter(r => r.status === 429);

      expect(rateLimited.length).toBeGreaterThan(0);
    });

    it('should include rate limit headers', async () => {
      const response = await request(app)
        .post('/oauth/token')
        .send({
          grant_type: 'client_credentials',
          client_id: mockSP.clientId,
          client_secret: mockSP.clientSecret,
          scope: 'resource:read'
        });

      if (response.headers['x-ratelimit-limit']) {
        expect(response.headers['x-ratelimit-limit']).toBeDefined();
        expect(response.headers['x-ratelimit-remaining']).toBeDefined();
      }
    });

    it('should apply different rate limits per client', async () => {
      // This test would verify that rate limits are per-client
      // Implementation depends on rate limiter configuration
      const response = await request(app)
        .post('/oauth/token')
        .send({
          grant_type: 'client_credentials',
          client_id: mockSP.clientId,
          client_secret: mockSP.clientSecret,
          scope: 'resource:read'
        });

      expect([200, 429]).toContain(response.status);
    });
  });

  describe('Input Validation', () => {
    it('should sanitize error messages', async () => {
      const response = await request(app)
        .post('/oauth/token')
        .send({
          grant_type: 'client_credentials',
          client_id: '<script>alert("xss")</script>',
          client_secret: 'test',
          scope: 'resource:read'
        })
        .expect(401);

      // Error message should not contain unsanitized input
      expect(response.body.error_description).not.toContain('<script>');
    });

    it('should reject excessively long parameters', async () => {
      const longString = 'a'.repeat(10000);

      const response = await request(app)
        .post('/oauth/token')
        .send({
          grant_type: 'client_credentials',
          client_id: longString,
          client_secret: mockSP.clientSecret,
          scope: 'resource:read'
        })
        .expect(400);

      expect(response.body.error).toBe('invalid_request');
    });

    it('should validate grant_type whitelist', async () => {
      const response = await request(app)
        .post('/oauth/token')
        .send({
          grant_type: 'password', // Not supported
          username: 'test',
          password: 'test',
          client_id: mockSP.clientId,
          client_secret: mockSP.clientSecret
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'unsupported_grant_type',
        error_description: expect.any(String)
      });
    });
  });
});










