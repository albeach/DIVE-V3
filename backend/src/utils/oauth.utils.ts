/**
 * DIVE V3 OAuth Utility Functions
 */

import crypto from 'crypto';
import { IExternalSP } from '../types/sp-federation.types';
import { logger } from './logger';

/**
 * Generate a cryptographically secure secret
 */
export function generateSecureSecret(length: number = 32): string {
  return crypto.randomBytes(length).toString('base64url');
}

/**
 * Generate code verifier for PKCE
 */
export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Generate code challenge from verifier
 */
export function generateCodeChallenge(verifier: string, method: string = 'S256'): string {
  if (method === 'plain') {
    return verifier;
  }
  
  return crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
}

/**
 * Validate client credentials
 * @param clientId - The client ID to validate
 * @param clientSecret - The client secret (optional for public clients)
 * @param sp - The Service Provider data to validate against
 */
export function validateClient(
  clientId: string, 
  clientSecret: string | undefined,
  sp: IExternalSP | null
): IExternalSP | null {
  try {
    if (!sp) {
      logger.warn('Client not found', { clientId });
      return null;
    }
    
    if (sp.status !== 'ACTIVE') {
      logger.warn('Client not active', { clientId, status: sp.status });
      return null;
    }
    
    // Validate secret for confidential clients
    if (sp.clientType === 'confidential') {
      if (!clientSecret || sp.clientSecret !== clientSecret) {
        logger.warn('Invalid client credentials', { clientId });
        return null;
      }
    }
    
    return sp;
  } catch (error) {
    logger.error('Client validation error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      clientId
    });
    return null;
  }
}

/**
 * Validate redirect URI
 */
export function isValidRedirectUri(uri: string, allowedUris: string[]): boolean {
  // Exact match required for security
  return allowedUris.includes(uri);
}

/**
 * Parse Basic Auth header
 */
export function parseBasicAuth(authHeader: string): { username: string; password: string } | null {
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return null;
  }
  
  try {
    const credentials = Buffer.from(authHeader.substring(6), 'base64').toString();
    const [username, password] = credentials.split(':');
    
    if (!username || !password) {
      return null;
    }
    
    return { username, password };
  } catch (error) {
    return null;
  }
}

/**
 * Validate scope against allowed scopes
 */
export function validateScopes(requested: string[], allowed: string[]): string[] {
  const requestedScopes = requested.filter(s => s.trim() !== '');
  return requestedScopes.filter(scope => allowed.includes(scope));
}

/**
 * Check if client has required scope
 */
export function hasScope(clientScopes: string[], requiredScope: string): boolean {
  return clientScopes.includes(requiredScope);
}

/**
 * Generate a nonce for OIDC
 */
export function generateNonce(): string {
  return crypto.randomBytes(16).toString('base64url');
}

/**
 * Calculate token expiry timestamp
 */
export function calculateExpiry(lifetimeSeconds: number): number {
  return Math.floor(Date.now() / 1000) + lifetimeSeconds;
}

/**
 * Validate token audience
 */
export function validateAudience(tokenAud: string | string[], expectedAud: string | string[]): boolean {
  const tokenAudiences = Array.isArray(tokenAud) ? tokenAud : [tokenAud];
  const expectedAudiences = Array.isArray(expectedAud) ? expectedAud : [expectedAud];
  
  return tokenAudiences.some(aud => expectedAudiences.includes(aud));
}

/**
 * Extract client credentials from request
 */
export function extractClientCredentials(req: { headers: Record<string, string | string[] | undefined>; body: Record<string, unknown> }): {
  clientId?: string;
  clientSecret?: string;
  method: 'basic' | 'post' | 'none'
} {
  // Try Basic Auth first
  const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
  if (authHeader && authHeader.startsWith('Basic ')) {
    const creds = parseBasicAuth(authHeader);
    if (creds) {
      return {
        clientId: creds.username,
        clientSecret: creds.password,
        method: 'basic'
      };
    }
  }

  // Try POST body
  if (req.body.client_id) {
    return {
      clientId: req.body.client_id as string,
      clientSecret: req.body.client_secret as string,
      method: 'post'
    };
  }

  return { method: 'none' };
}
