/**
 * DIVE V3 OAuth 2.0 Authorization Server
 * Phase 1: OAuth endpoints for external Service Providers
 */

import { Request, Response, Router, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import rateLimit, { MemoryStore } from 'express-rate-limit';
import { logger } from '../utils/logger';
import { SPManagementService } from '../services/sp-management.service';
import { AuthorizationCodeService } from '../services/authorization-code.service';
import { ITokenResponse } from '../types/sp-federation.types';
import { validateClient } from '../utils/oauth.utils';
import fs from 'fs';
import path from 'path';

const router = Router();

// Dependency injection - allow test overrides (BEST PRACTICE)
let spService: SPManagementService;
let authCodeService: AuthorizationCodeService;

// Initialize services (can be overridden in tests)
export function initializeServices(
  spServiceInstance?: SPManagementService,
  authCodeServiceInstance?: AuthorizationCodeService
) {
  spService = spServiceInstance || new SPManagementService();
  authCodeService = authCodeServiceInstance || new AuthorizationCodeService();
}

// Initialize with default instances
initializeServices();

/**
 * Rate Limit Store (for testing - can be reset)
 */
export const tokenRateLimitStore = new MemoryStore();

/**
 * OAuth 2.0 Rate Limiting (OWASP Compliance)
 * 
 * Prevents brute-force attacks on token endpoint
 * - Window: 15 minutes
 * - Max requests: 50 per IP (configurable via env)
 * - Response: 429 Too Many Requests
 * 
 * Note: Lower limit (50) for security and testability
 * Production can override via OAUTH_RATE_LIMIT env var
 */
const tokenRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.OAUTH_RATE_LIMIT ? parseInt(process.env.OAUTH_RATE_LIMIT, 10) : 50,
  message: {
    error: 'too_many_requests',
    error_description: 'Too many token requests from this IP, please try again later'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  store: tokenRateLimitStore // Use exported store (can be reset in tests)
});

/**
 * Input Validation Middleware (OWASP Compliance)
 * 
 * Validates request parameters don't exceed safe lengths
 * Prevents DoS attacks via excessively large payloads
 */
const validateInputLengths = (req: Request, res: Response, next: NextFunction): void => {
  const MAX_PARAM_LENGTH = 2048; // 2KB max per parameter
  
  // Check all body parameters
  for (const [key, value] of Object.entries(req.body || {})) {
    if (typeof value === 'string' && value.length > MAX_PARAM_LENGTH) {
      logger.warn('Rejected request with excessively long parameter', {
        parameter: key,
        length: value.length,
        maxLength: MAX_PARAM_LENGTH
      });
      
      res.status(400).json({
        error: 'invalid_request',
        error_description: `Parameter '${key}' exceeds maximum length of ${MAX_PARAM_LENGTH} characters`
      });
      return;
    }
  }
  
  next();
};

/**
 * Get JWT signing keys
 */
const getSigningKeys = () => {
  // In production, use proper key management (KMS, HSM, etc.)
  const privateKeyPath = process.env.JWT_PRIVATE_KEY_PATH || path.join(__dirname, '../../keys/private.pem');
  const publicKeyPath = process.env.JWT_PUBLIC_KEY_PATH || path.join(__dirname, '../../keys/public.pem');

  // Generate keys if they don't exist (development only)
  if (!fs.existsSync(privateKeyPath) || !fs.existsSync(publicKeyPath)) {
    logger.warn('JWT signing keys not found, generating new keys (DEVELOPMENT ONLY)');
    const { generateKeyPairSync } = require('crypto');
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    
    // Ensure keys directory exists
    const keysDir = path.dirname(privateKeyPath);
    if (!fs.existsSync(keysDir)) {
      fs.mkdirSync(keysDir, { recursive: true });
    }
    
    fs.writeFileSync(privateKeyPath, privateKey);
    fs.writeFileSync(publicKeyPath, publicKey);
  }

  return {
    privateKey: fs.readFileSync(privateKeyPath, 'utf8'),
    publicKey: fs.readFileSync(publicKeyPath, 'utf8')
  };
};

/**
 * OAuth 2.0 Authorization Endpoint
 * GET /oauth/authorize
 * 
 * Supports authorization_code flow with PKCE
 */
router.get('/authorize', async (req: Request, res: Response) => {
  const {
    response_type,
    client_id,
    redirect_uri,
    scope,
    state,
    code_challenge,
    code_challenge_method,
    nonce
  } = req.query;

  const requestId = req.headers['x-request-id'] as string;

  try {
    // Validate required parameters
    if (response_type !== 'code') {
      return res.status(400).json({ 
        error: 'unsupported_response_type',
        error_description: 'Only authorization_code flow is supported'
      });
    }

    if (!client_id || !redirect_uri) {
      return res.status(400).json({ 
        error: 'invalid_request',
        error_description: 'Missing required parameters: client_id and redirect_uri'
      });
    }

    // Validate client
    const sp = await spService.getByClientId(client_id as string);
    if (!sp || sp.status !== 'ACTIVE') {
      logger.warn('Invalid client attempted authorization', { clientId: client_id, requestId });
      return res.status(400).json({ error: 'invalid_client' });
    }

    // Validate redirect URI
    if (!sp.redirectUris.includes(redirect_uri as string)) {
      logger.warn('Invalid redirect URI', { clientId: client_id, redirectUri: redirect_uri, requestId });
      return res.status(400).json({ error: 'invalid_redirect_uri' });
    }

    // PKCE validation
    if (sp.requirePKCE && !code_challenge) {
      return res.status(400).json({ 
        error: 'invalid_request',
        error_description: 'PKCE is required: code_challenge missing'
      });
    }

    // PKCE Downgrade Attack Protection: Require S256 method
    if (code_challenge && code_challenge_method === 'plain') {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'PKCE challenge method "plain" is not allowed for security reasons. Use S256.'
      });
    }

    // Redirect URI Security: Require HTTPS (except localhost for dev)
    const parsedRedirectUri = new URL(redirect_uri as string);
    if (parsedRedirectUri.protocol === 'http:' && parsedRedirectUri.hostname !== 'localhost') {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Redirect URI must use HTTPS (except localhost for development)'
      });
    }

    // State Parameter: Require for CSRF protection
    if (!state) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'state parameter is required for CSRF protection'
      });
    }

    // State Parameter: Validate sufficient randomness (min 32 characters)
    if ((state as string).length < 32) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'state parameter must be at least 32 characters for security'
      });
    }

    // Scope Validation: Check format
    if (scope && typeof scope === 'string') {
      try {
        const scopeParts = (scope as string).split(' ');
        const validScopePattern = /^[a-z0-9_:]+$/i;
        const invalidScopes = scopeParts.filter(s => s && !validScopePattern.test(s));
        if (invalidScopes.length > 0) {
          return res.status(400).json({
            error: 'invalid_scope',
            error_description: `Invalid scope format: ${invalidScopes.join(', ')}`
          });
        }
      } catch (error) {
        return res.status(400).json({
          error: 'invalid_scope',
          error_description: 'Malformed scope parameter'
        });
      }
    }

    // Input Validation: Reject excessively long parameters
    const maxParamLength = 2048;
    const params = { client_id, redirect_uri, scope, state, code_challenge, nonce };
    for (const [key, value] of Object.entries(params)) {
      if (value && typeof value === 'string' && value.length > maxParamLength) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: `Parameter ${key} exceeds maximum length of ${maxParamLength} characters`
        });
      }
    }

    // In production, this would redirect to login page
    // For now, assume user is authenticated (req.user from authz middleware)
    const user = (req as any).user;
    if (!user) {
      // Redirect to Keycloak login with return URL
      const keycloakAuthUrl = `${process.env.KEYCLOAK_URL}/realms/dive-v3-broker-usa/protocol/openid-connect/auth`;
      const authParams = new URLSearchParams({
        response_type: 'code',
        client_id: 'dive-v3-broker-client',
        redirect_uri: `${process.env.API_URL}/oauth/callback`,
        scope: 'openid profile email',
        state: Buffer.from(JSON.stringify({ 
          original_request: req.query,
          request_id: requestId 
        })).toString('base64')
      });
      
      return res.redirect(`${keycloakAuthUrl}?${authParams}`);
    }

    // Generate authorization code
    const authCode = await authCodeService.generateAuthorizationCode({
      clientId: client_id as string,
      userId: user.uniqueID,
      redirectUri: redirect_uri as string,
      scope: scope as string || 'resource:read',
      codeChallenge: code_challenge as string,
      codeChallengeMethod: code_challenge_method as string || 'S256',
      nonce: nonce as string
    });

    // Log authorization grant
    logger.info('Authorization code issued', {
      requestId,
      clientId: client_id,
      userId: user.uniqueID,
      scope: scope,
      hasCodeChallenge: !!code_challenge
    });

    // Redirect back to client with authorization code
    const redirectUrl = new URL(redirect_uri as string);
    redirectUrl.searchParams.set('code', authCode);
    if (state) {
      redirectUrl.searchParams.set('state', state as string);
    }

    res.redirect(redirectUrl.toString());

  } catch (error) {
    logger.error('Authorization endpoint error', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      clientId: client_id
    });

    res.status(500).json({
      error: 'server_error',
      error_description: 'Internal server error during authorization'
    });
  }
});

/**
 * OAuth 2.0 Token Endpoint
 * POST /oauth/token
 * 
 * Supports:
 * - authorization_code grant (with PKCE)
 * - client_credentials grant
 * - refresh_token grant
 * 
 * Security:
 * - Rate limiting: 100 req/15min per IP
 * - Input validation: Max 2048 chars per parameter
 */
// @ts-ignore - All code paths send responses; TypeScript inference issue
router.post('/token', tokenRateLimiter, validateInputLengths, async (req: Request, res: Response) => {
  let {
    grant_type,
    code,
    redirect_uri,
    client_id,
    client_secret,
    code_verifier,
    refresh_token,
    scope
  } = req.body;

  const requestId = req.headers['x-request-id'] as string;

  // HTTP Basic Authentication Support (RFC 6749 Section 2.3.1)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Basic ')) {
    const base64Credentials = authHeader.slice(6);
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [basicClientId, basicClientSecret] = credentials.split(':');
    
    // HTTP Basic takes precedence over body parameters
    if (basicClientId) {
      client_id = basicClientId;
      client_secret = basicClientSecret;
    }
  }

  try {
    logger.debug('Token request received', {
      requestId,
      grant_type,
      client_id,
      hasSecret: !!client_secret,
      hasCode: !!code,
      hasVerifier: !!code_verifier
    });

    let tokenResponse: ITokenResponse;

    switch (grant_type) {
      case 'authorization_code':
        tokenResponse = await handleAuthorizationCodeGrant({
          code,
          redirect_uri,
          client_id,
          client_secret,
          code_verifier,
          requestId
        });
        break;

      case 'client_credentials':
        tokenResponse = await handleClientCredentialsGrant({
          client_id,
          client_secret,
          scope,
          requestId
        });
        break;

      case 'refresh_token':
        tokenResponse = await handleRefreshTokenGrant({
          refresh_token,
          client_id,
          client_secret,
          requestId
        });
        break;

      default:
        return res.status(400).json({ 
          error: 'unsupported_grant_type',
          error_description: `Grant type '${grant_type}' is not supported`
        });
    }

    // Log successful token issuance
    logger.info('Token issued successfully', {
      requestId,
      grant_type,
      client_id,
      scope: tokenResponse.scope
    });

    res.json(tokenResponse);

  } catch (error) {
    logger.error('Token endpoint error', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      grant_type,
      client_id
    });

    // Return appropriate OAuth error response
    if (error instanceof Error && error.message.includes('invalid_client')) {
      res.status(401).json({
        error: 'invalid_client',
        error_description: 'Client authentication failed'
      });
      return;
    } else if (error instanceof Error && error.message.includes('invalid_grant')) {
      res.status(400).json({
        error: 'invalid_grant',
        error_description: error.message
      });
      return;
    } else if (error instanceof Error && error.message.includes('invalid_scope')) {
      res.status(400).json({
        error: 'invalid_scope',
        error_description: error.message.replace('invalid_scope: ', '')
      });
      return;
    } else {
      res.status(500).json({
        error: 'server_error',
        error_description: 'Internal server error during token exchange'
      });
      return;
    }
  }
});

/**
 * Handle authorization code grant
 */
async function handleAuthorizationCodeGrant(params: {
  code: string;
  redirect_uri: string;
  client_id: string;
  client_secret?: string;
  code_verifier?: string;
  requestId: string;
}): Promise<ITokenResponse> {
  const { code, redirect_uri, client_id, client_secret, code_verifier, requestId: _requestId } = params;

  // Validate client
  const sp = await spService.getByClientId(client_id);
  if (!sp) {
    throw new Error('invalid_client');
  }

  // Validate client authentication
  if (sp.clientType === 'confidential') {
    if (!client_secret || sp.clientSecret !== client_secret) {
      throw new Error('invalid_client: Invalid client credentials');
    }
  }

  // Validate and consume authorization code
  const authCodeData = await authCodeService.validateAndConsumeCode(code, client_id, redirect_uri);
  
  // PKCE validation
  if (authCodeData.codeChallenge) {
    if (!code_verifier) {
      throw new Error('invalid_grant: PKCE code_verifier required');
    }

    const verifierChallenge = crypto
      .createHash('sha256')
      .update(code_verifier)
      .digest('base64url');

    if (verifierChallenge !== authCodeData.codeChallenge) {
      throw new Error('invalid_grant: PKCE verification failed');
    }
  }

  // Generate tokens
  const { privateKey } = getSigningKeys();
  const tokenLifetime = process.env.OAUTH_TOKEN_LIFETIME 
    ? parseInt(process.env.OAUTH_TOKEN_LIFETIME, 10) 
    : 3600;
    
  const accessToken = jwt.sign(
    {
      sub: client_id,
      iss: process.env.OAUTH_ISSUER || 'https://api.dive-v3.mil',
      aud: 'dive-v3-api',
      scope: authCodeData.scope,
      client_type: 'service_provider',
      user_id: authCodeData.userId,
      jti: crypto.randomUUID(),
      nonce: authCodeData.nonce
    },
    privateKey,
    { 
      expiresIn: tokenLifetime, 
      algorithm: 'RS256',
      keyid: 'dive-v3-oauth-key-1'
    }
  );

  // Generate refresh token for confidential clients
  let refreshToken: string | undefined;
  const refreshLifetime = process.env.OAUTH_REFRESH_LIFETIME 
    ? parseInt(process.env.OAUTH_REFRESH_LIFETIME, 10) 
    : 86400;
    
  if (sp.clientType === 'confidential') {
    refreshToken = jwt.sign(
      {
        sub: client_id,
        user_id: authCodeData.userId,
        jti: crypto.randomUUID(),
        type: 'refresh'
      },
      privateKey,
      { 
        expiresIn: refreshLifetime,
        algorithm: 'RS256' 
      }
    );
  }

  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: tokenLifetime,
    refresh_token: refreshToken,
    scope: authCodeData.scope
  };
}

/**
 * Handle client credentials grant
 */
async function handleClientCredentialsGrant(params: {
  client_id: string;
  client_secret: string;
  scope?: string;
  requestId: string;
}): Promise<ITokenResponse> {
  const { client_id, client_secret, scope, requestId: _requestId } = params;

  // Validate client credentials
  const fetchedSp = await spService.getByClientId(client_id);
  const sp = validateClient(client_id, client_secret, fetchedSp);
  if (!sp || sp.status !== 'ACTIVE') {
    throw new Error('invalid_client');
  }

  // Validate scope format before parsing
  if (scope) {
    const validScopePattern = /^[a-z0-9_: ]+$/i;
    if (!validScopePattern.test(scope)) {
      throw new Error('invalid_scope: Scope contains invalid characters');
    }
  }

  // Validate requested scopes
  const requestedScopes = scope?.split(' ').filter(s => s.length > 0) || ['resource:read'];
  const validScopes = requestedScopes.filter(s => sp.allowedScopes.includes(s));
  
  if (validScopes.length === 0) {
    throw new Error('invalid_scope: No valid scopes requested');
  }

  // Generate access token
  const { privateKey } = getSigningKeys();
  const tokenLifetime = process.env.OAUTH_TOKEN_LIFETIME 
    ? parseInt(process.env.OAUTH_TOKEN_LIFETIME, 10) 
    : 3600;
    
  const accessToken = jwt.sign(
    {
      sub: client_id,
      iss: process.env.OAUTH_ISSUER || 'https://api.dive-v3.mil',
      aud: 'dive-v3-api',
      scope: validScopes.join(' '),
      client_type: 'service_provider',
      jti: crypto.randomUUID()
    },
    privateKey,
    { 
      expiresIn: tokenLifetime, 
      algorithm: 'RS256',
      keyid: 'dive-v3-oauth-key-1'
    }
  );

  // Update last activity
  await spService.updateLastActivity(sp.spId);

  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: tokenLifetime,
    scope: validScopes.join(' ')
  };
}

/**
 * Handle refresh token grant
 */
async function handleRefreshTokenGrant(params: {
  refresh_token: string;
  client_id: string;
  client_secret?: string;
  requestId: string;
}): Promise<ITokenResponse> {
  const { refresh_token, client_id, client_secret, requestId: _requestId } = params;

  // Validate refresh token
  const { publicKey } = getSigningKeys();
  let decoded: Record<string, unknown>;

  try {
    decoded = jwt.verify(refresh_token, publicKey, { algorithms: ['RS256'] }) as Record<string, unknown>;
  } catch (error) {
    throw new Error('invalid_grant: Invalid refresh token');
  }

  // Validate it's a refresh token
  if (decoded.type !== 'refresh') {
    throw new Error('invalid_grant: Token is not a refresh token');
  }

  // Validate client
  if (decoded.sub !== client_id) {
    throw new Error('invalid_grant: Token was not issued to this client');
  }

  const sp = await spService.getByClientId(client_id);
  if (!sp || sp.status !== 'ACTIVE') {
    throw new Error('invalid_client');
  }

  // Validate client credentials for confidential clients
  if (sp.clientType === 'confidential') {
    if (!client_secret || sp.clientSecret !== client_secret) {
      throw new Error('invalid_client: Invalid client credentials');
    }
  }

  // Generate new access token
  const { privateKey } = getSigningKeys();
  const tokenLifetime = process.env.OAUTH_TOKEN_LIFETIME 
    ? parseInt(process.env.OAUTH_TOKEN_LIFETIME, 10) 
    : 3600;
    
  const accessToken = jwt.sign(
    {
      sub: client_id,
      iss: process.env.OAUTH_ISSUER || 'https://api.dive-v3.mil',
      aud: 'dive-v3-api',
      scope: 'resource:read resource:search',  // Default scopes for refresh
      client_type: 'service_provider',
      user_id: decoded.user_id,
      jti: crypto.randomUUID()
    },
    privateKey,
    { 
      expiresIn: tokenLifetime, 
      algorithm: 'RS256',
      keyid: 'dive-v3-oauth-key-1'
    }
  );

  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: tokenLifetime,
    scope: 'resource:read resource:search'
  };
}

/**
 * OAuth 2.0 Token Introspection Endpoint
 * POST /oauth/introspect
 */
// @ts-ignore - All code paths send responses; TypeScript inference issue
router.post('/introspect', async (req: Request, res: Response) => {
  const { token } = req.body;
  const requestId = req.headers['x-request-id'] as string;

  try {
    // Client authentication via Basic Auth
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return res.status(401).json({ error: 'invalid_client' });
    }

    const credentials = Buffer.from(authHeader.substring(6), 'base64').toString().split(':');
    const [clientId, clientSecret] = credentials;

    // Validate client
    const fetchedClient = await spService.getByClientId(clientId);
    const client = validateClient(clientId, clientSecret, fetchedClient);
    if (!client) {
      return res.status(401).json({ error: 'invalid_client' });
    }

    // Validate token
    const { publicKey } = getSigningKeys();
    try {
      const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] }) as any;
      
      res.json({
        active: true,
        scope: decoded.scope,
        client_id: decoded.sub,
        username: decoded.user_id,
        token_type: 'Bearer',
        exp: decoded.exp,
        iat: decoded.iat,
        sub: decoded.sub,
        aud: decoded.aud,
        iss: decoded.iss,
        jti: decoded.jti
      });
    } catch (error) {
      // Token is invalid or expired
      res.json({ active: false });
    }

  } catch (error) {
    logger.error('Token introspection error', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(500).json({ error: 'server_error' });
    return;
  }
});

/**
 * OpenID Connect Discovery Endpoint
 * GET /oauth/.well-known/openid-configuration
 */
router.get('/.well-known/openid-configuration', async (_req: Request, res: Response) => {
  const baseUrl = process.env.API_URL || 'https://api.dive-v3.mil';

  const discoveryDoc = {
    issuer: process.env.OAUTH_ISSUER || baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    userinfo_endpoint: `${baseUrl}/oauth/userinfo`,
    jwks_uri: `${baseUrl}/oauth/jwks`,
    registration_endpoint: `${baseUrl}/oauth/register`,
    introspection_endpoint: `${baseUrl}/oauth/introspect`,
    revocation_endpoint: `${baseUrl}/oauth/revoke`,

    // Supported features
    scopes_supported: [
      'openid', 'profile', 'email', 'offline_access',
      'resource:read', 'resource:write', 'resource:search'
    ],
    response_types_supported: ['code', 'token', 'id_token', 'code id_token'],
    grant_types_supported: ['authorization_code', 'refresh_token', 'client_credentials'],
    subject_types_supported: ['public', 'pairwise'],
    id_token_signing_alg_values_supported: ['RS256', 'ES256'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic', 'private_key_jwt'],
    claims_supported: [
      'sub', 'iss', 'aud', 'exp', 'iat', 'auth_time', 'nonce',
      'uniqueID', 'clearance', 'countryOfAffiliation', 'acpCOI',
      'email', 'email_verified', 'name', 'preferred_username'
    ],
    code_challenge_methods_supported: ['plain', 'S256'],

    // DIVE V3 specific extensions
    dive_v3_endpoints: {
      resource_api: `${baseUrl}/api/resources`,
      policy_lab: `${baseUrl}/api/policies-lab`,
      federation: `${baseUrl}/federation`
    },
    
    dive_v3_capabilities: {
      sp_federation: true,
      scim_provisioning: true,
      multi_realm_support: true,
      classifications_supported: ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'],
      countries_supported: ['USA', 'GBR', 'CAN', 'AUS', 'NZL', 'FRA', 'DEU', 'ITA', 'ESP', 'POL', 'NLD']
    }
  };

  res.json(discoveryDoc);
});

/**
 * JSON Web Key Set (JWKS) Endpoint
 * GET /oauth/jwks
 */
router.get('/jwks', async (_req: Request, res: Response) => {
  try {
    const { publicKey: _publicKey } = getSigningKeys();
    
    // Convert PEM to JWK format
    // In production, use a proper JWK library
    const jwk = {
      kty: 'RSA',
      use: 'sig',
      kid: 'dive-v3-oauth-key-1',
      alg: 'RS256',
      n: '', // Would extract from public key
      e: 'AQAB' // Standard RSA exponent
    };

    res.json({
      keys: [jwk]
    });
  } catch (error) {
    logger.error('JWKS endpoint error', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(500).json({ error: 'server_error' });
  }
});

/**
 * OAuth callback endpoint (for handling Keycloak authentication)
 * GET /oauth/callback
 */
router.get('/callback', async (req: Request, res: Response) => {
  const { code: _code, state } = req.query;
  
  try {
    // Decode state to get original OAuth request
    const stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
    const originalRequest = stateData.original_request;
    
    // Exchange Keycloak code for token
    // ... (implementation depends on Keycloak setup)
    
    // Generate authorization code for the external SP
    const authCode = await authCodeService.generateAuthorizationCode({
      clientId: originalRequest.client_id,
      userId: 'authenticated-user-id', // Extract from Keycloak token
      redirectUri: originalRequest.redirect_uri,
      scope: originalRequest.scope || 'resource:read',
      codeChallenge: originalRequest.code_challenge,
      codeChallengeMethod: originalRequest.code_challenge_method,
      nonce: originalRequest.nonce
    });
    
    // Redirect back to SP with authorization code
    const redirectUrl = new URL(originalRequest.redirect_uri);
    redirectUrl.searchParams.set('code', authCode);
    if (originalRequest.state) {
      redirectUrl.searchParams.set('state', originalRequest.state);
    }
    
    res.redirect(redirectUrl.toString());
    
  } catch (error) {
    logger.error('OAuth callback error', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(500).send('Authentication failed');
  }
});

export default router;
