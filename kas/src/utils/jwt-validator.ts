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
 * - Supports both dive-v3-pilot and dive-v3-broker realms
 * - Caches keys per kid (realm-independent caching)
 */
const getSigningKey = async (header: jwt.JwtHeader, token?: string): Promise<string> => {
    const requestId = `kas-jwks-${Date.now()}`;

    // Determine which realm to fetch JWKS from
    const realm = token ? getRealmFromToken(token) : (process.env.KEYCLOAK_REALM || 'dive-v3-broker');
    const jwksUri = `${process.env.KEYCLOAK_URL}/realms/${realm}/protocol/openid-connect/certs`;

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

        // Fetch JWKS directly from Keycloak
        const response = await axios.get(jwksUri, { timeout: 5000 });
        const jwks = response.data;

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
 * - Supports both dive-v3-pilot (legacy single-realm) AND dive-v3-broker (multi-realm federation)
 * - Backward compatible: Existing tokens from dive-v3-pilot still work
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

        // Multi-realm: Accept tokens from both dive-v3-pilot AND dive-v3-broker
        // Docker networking: Accept both internal (keycloak:8080) AND external (localhost:8081) URLs
        const validIssuers: [string, ...string[]] = [
            `${process.env.KEYCLOAK_URL}/realms/dive-v3-pilot`,    // Internal: dive-v3-pilot
            `${process.env.KEYCLOAK_URL}/realms/dive-v3-broker`,   // Internal: dive-v3-broker
            'http://localhost:8081/realms/dive-v3-pilot',          // External: dive-v3-pilot
            'http://localhost:8081/realms/dive-v3-broker',         // External: dive-v3-broker
        ];

        // Multi-realm: Accept tokens for both clients + Keycloak default audience
        const validAudiences: [string, ...string[]] = [
            'dive-v3-client',         // Legacy client
            'dive-v3-client-broker',  // Multi-realm broker client
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

