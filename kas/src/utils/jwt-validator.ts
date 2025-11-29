/**
 * JWT Validator for KAS (Key Access Service)
 * 
 * Implements secure JWT signature verification using JWKS
 * Adapted from backend/src/middleware/authz.middleware.ts
 * 
 * CRITICAL SECURITY FIX: Gap #3 - KAS JWT Verification
 * Date: October 20, 2025
 * 
 * This module replaces the insecure jwt.decode() with proper signature verification
 * to prevent forged token attacks on the Key Access Service.
 */

import jwt from 'jsonwebtoken';
import axios from 'axios';
import NodeCache from 'node-cache';
import jwkToPem from 'jwk-to-pem';
import { kasLogger } from './kas-logger';

// JWKS cache (1 hour TTL) - cache fetched public keys
const jwksCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

/**
 * Interface for JWT payload (Keycloak token)
 * Gap #4: Added dutyOrg and orgUnit (ACP-240 Section 2.1)
 */
export interface IKeycloakToken {
    sub: string;
    email?: string;
    preferred_username?: string;
    uniqueID?: string;
    clearance?: string;
    countryOfAffiliation?: string;
    acpCOI?: string[];
    dutyOrg?: string;          // Gap #4: User's duty organization
    orgUnit?: string;          // Gap #4: User's organizational unit
    exp?: number;
    iat?: number;
    jti?: string;  // JWT ID for revocation
    // AAL2/FAL2 claims (NIST SP 800-63B/C)
    aud?: string | string[];
    acr?: string;
    amr?: string[];
    auth_time?: number;
}

/**
 * Extract realm name from token issuer
 * Multi-realm support: Determine which realm issued the token
 */
const getRealmFromToken = (token: string): string => {
    try {
        const decoded = jwt.decode(token, { complete: true });
        if (!decoded || !decoded.payload) {
            return process.env.KEYCLOAK_REALM || 'dive-v3-broker';
        }

        const payload = decoded.payload as any;
        const issuer = payload.iss;

        if (!issuer) {
            return process.env.KEYCLOAK_REALM || 'dive-v3-broker';
        }

        // Extract realm from issuer URL: http://localhost:8081/realms/{realm}
        const match = issuer.match(/\/realms\/([^\/]+)/);
        if (match && match[1]) {
            return match[1];
        }

        return process.env.KEYCLOAK_REALM || 'dive-v3-broker';
    } catch (error) {
        kasLogger.warn('Could not extract realm from token, using default', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return process.env.KEYCLOAK_REALM || 'dive-v3-broker';
    }
};

/**
 * Get signing key from JWKS with multi-realm support
 * Uses direct JWKS fetch with caching
 * 
 * Multi-Realm Migration (Oct 21, 2025):
 * - Dynamically determines JWKS URL based on token issuer
 * - Supports both dive-v3-broker and dive-v3-broker realms
 * - Caches keys per kid (realm-independent caching)
 */
const getSigningKey = async (header: jwt.JwtHeader, token?: string): Promise<string> => {
    const requestId = `kas-jwks-${Date.now()}`;

    // Determine which realm to fetch JWKS from
    const realm = token ? getRealmFromToken(token) : (process.env.KEYCLOAK_REALM || 'dive-v3-broker');
    
    // Try multiple JWKS URLs (Docker internal, HTTP external, HTTPS external)
    const jwksUris = [
        `${process.env.KEYCLOAK_URL}/realms/${realm}/protocol/openid-connect/certs`,  // Internal
        `http://localhost:8081/realms/${realm}/protocol/openid-connect/certs`,        // External HTTP
        `https://localhost:8443/realms/${realm}/protocol/openid-connect/certs`,       // External HTTPS
    ];
    
    const jwksUri = jwksUris[0]; // Primary URI for logging

    kasLogger.debug('Getting signing key for token', {
        requestId,
        kid: header.kid,
        alg: header.alg,
        realm,
        jwksUri,
    });

    if (!header.kid) {
        kasLogger.error('Token header missing kid (key ID)', { requestId });
        throw new Error('Token header missing kid');
    }

    try {
        // Check cache first (keys cached by kid, not realm-specific)
        const cachedKey = jwksCache.get<string>(header.kid);
        if (cachedKey) {
            kasLogger.debug('Using cached JWKS public key', { requestId, kid: header.kid, realm });
            return cachedKey;
        }

        // Fetch JWKS directly from Keycloak (try multiple URIs)
        let jwks: any = null;
        let lastError: Error | null = null;
        
        for (const uri of jwksUris) {
            try {
                const response = await axios.get(uri, { timeout: 5000 });
                jwks = response.data;
                kasLogger.debug('Successfully fetched JWKS', { uri, realm });
                break;
            } catch (err) {
                lastError = err as Error;
                kasLogger.debug('JWKS fetch failed, trying next URI', { uri, error: lastError.message });
            }
        }
        
        if (!jwks) {
            throw new Error(`Failed to fetch JWKS from all URIs. Last error: ${lastError?.message}`);
        }

        // Find the key with matching kid and use="sig"
        const key = jwks.keys.find((k: any) => k.kid === header.kid && k.use === 'sig');

        if (!key) {
            kasLogger.error('No matching signing key found in JWKS', {
                requestId,
                kid: header.kid,
                realm,
                jwksUri,
                availableKids: jwks.keys.map((k: any) => ({ kid: k.kid, use: k.use, alg: k.alg })),
            });
            throw new Error(`No signing key found for kid: ${header.kid}`);
        }

        // Convert JWK to PEM format
        const publicKey = jwkToPem(key);

        // Cache the public key
        jwksCache.set(header.kid, publicKey);

        kasLogger.debug('Signing key retrieved successfully', {
            requestId,
            kid: header.kid,
            alg: key.alg,
            realm,
            hasKey: !!publicKey,
        });

        return publicKey;
    } catch (error) {
        kasLogger.error('Failed to fetch signing key', {
            requestId,
            kid: header.kid,
            realm,
            jwksUri,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        throw error;
    }
};

/**
 * Verify JWT token with signature verification and dual-issuer support
 * 
 * SECURITY FIX: This replaces jwt.decode() with proper signature verification
 * 
 * Multi-Realm Migration (Oct 21, 2025):
 * - Supports both dive-v3-broker (legacy single-realm) AND dive-v3-broker (multi-realm federation)
 * - Backward compatible: Existing tokens from dive-v3-broker still work
 * - Forward compatible: New tokens from dive-v3-broker federation accepted
 * - Dual audience support: dive-v3-client AND dive-v3-client-broker
 * 
 * @param token - JWT bearer token from request
 * @returns Decoded and verified token payload
 * @throws Error if token is invalid, expired, or signature verification fails
 */
export const verifyToken = async (token: string): Promise<IKeycloakToken> => {
    const requestId = `kas-verify-${Date.now()}`;

    try {
        // First decode the header to get the kid
        const decoded = jwt.decode(token, { complete: true });
        if (!decoded || !decoded.header) {
            kasLogger.error('Invalid token format', { requestId });
            throw new Error('Invalid token format');
        }

        kasLogger.debug('JWT token header decoded', {
            requestId,
            kid: decoded.header.kid,
            alg: decoded.header.alg,
            typ: decoded.header.typ,
        });

        // Get the signing key from JWKS (pass token for realm detection)
        const publicKey = await getSigningKey(decoded.header, token);

        // Multi-realm: Accept tokens from both dive-v3-broker AND dive-v3-broker
        // Docker networking: Accept both internal (keycloak:8080) AND external (localhost:8081) URLs
        // HTTPS Support: Accept HTTPS issuers on port 8443 (production setup)
        // Custom Domain: Accept kas.js.usa.divedeeper.internal:8443 (KC_HOSTNAME) - Nov 6, 2025 fix
        // Cloudflare Tunnel: Accept dev-auth.dive25.com (Nov 10, 2025)
        // USA IdP Domain: Accept usa-idp.dive25.com (Nov 29, 2025)
        const validIssuers: [string, ...string[]] = [
            `${process.env.KEYCLOAK_URL}/realms/dive-v3-broker`,    // Internal: dive-v3-broker
            `${process.env.KEYCLOAK_URL}/realms/dive-v3-broker`,   // Internal: dive-v3-broker
            'http://localhost:8081/realms/dive-v3-broker',          // External HTTP: dive-v3-broker
            'http://localhost:8081/realms/dive-v3-broker',         // External HTTP: dive-v3-broker
            'https://localhost:8443/realms/dive-v3-broker',         // External HTTPS: dive-v3-broker
            'https://localhost:8443/realms/dive-v3-broker',        // External HTTPS: dive-v3-broker
            'https://kas.js.usa.divedeeper.internal:8443/realms/dive-v3-broker',   // Custom domain: dive-v3-broker
            'https://kas.js.usa.divedeeper.internal:8443/realms/dive-v3-broker',  // Custom domain: dive-v3-broker
            'https://dev-auth.dive25.com/realms/dive-v3-broker',    // Cloudflare Tunnel: dive-v3-broker
            'https://dev-auth.dive25.com/realms/dive-v3-broker',   // Cloudflare Tunnel: dive-v3-broker
            'https://usa-idp.dive25.com:8443/realms/dive-v3-broker', // USA IdP domain with port
            'https://usa-idp.dive25.com/realms/dive-v3-broker',      // USA IdP via Cloudflare (no port)
        ];

        // Multi-realm: Accept tokens for both clients + Keycloak default audience
        const validAudiences: [string, ...string[]] = [
            'dive-v3-client',         // Legacy client (broker realm)
            'dive-v3-client-broker',  // Multi-realm broker client (old name - deprecated)
            'dive-v3-broker-client',  // National realm client (Phase 2.1 - CORRECT NAME)
            'account',                // Keycloak default audience (ID tokens)
        ];

        // Verify the token with the public key
        return new Promise((resolve, reject) => {
            jwt.verify(
                token,
                publicKey,
                {
                    algorithms: ['RS256'],
                    issuer: validIssuers,      // Array of valid issuers (FAL2 compliant)
                    audience: validAudiences,  // Array of valid audiences (FAL2 compliant)
                },
                (err: jwt.VerifyErrors | null, decoded: string | jwt.JwtPayload | undefined) => {
                    if (err) {
                        kasLogger.error('JWT verification failed', {
                            requestId,
                            error: err.message,
                            name: err.name,
                        });
                        reject(err);
                    } else {
                        kasLogger.debug('JWT verification successful', {
                            requestId,
                            sub: (decoded as any).sub,
                            exp: (decoded as any).exp,
                            iat: (decoded as any).iat,
                            iss: (decoded as any).iss,
                            aud: (decoded as any).aud,
                        });
                        resolve(decoded as IKeycloakToken);
                    }
                }
            );
        });
    } catch (error) {
        kasLogger.error('Token verification error', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        throw error;
    }
};

/**
 * Clear JWKS cache (for testing)
 * @internal
 */
export const clearJWKSCache = (): void => {
    jwksCache.flushAll();
    kasLogger.info('JWKS cache cleared');
};

