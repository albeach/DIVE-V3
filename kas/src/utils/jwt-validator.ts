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
 * Get signing key from JWKS with FEDERATION support
 * Uses direct JWKS fetch with caching
 *
 * CRITICAL FIX (Dec 2, 2025):
 * For cross-instance federation, the JWKS must be fetched from the TOKEN'S ISSUER,
 * not the local Keycloak. A GBR-issued JWT needs GBR Keycloak's public key!
 *
 * Flow:
 * 1. Extract issuer URL from JWT's `iss` claim
 * 2. Fetch JWKS from issuer's /protocol/openid-connect/certs endpoint
 * 3. Verify signature with issuer's public key
 */
const getSigningKey = async (header: jwt.JwtHeader, token?: string): Promise<string> => {
    const requestId = `kas-jwks-${Date.now()}`;

    // CRITICAL: For federation, we must fetch JWKS from the TOKEN'S issuer, not local Keycloak
    let issuerJwksUri: string | null = null;
    const rewriteToInternal = (uri: string): string => {
        // FEDERATION FIX: Map localhost URLs to correct instance Keycloak based on realm
        // A token from USA Hub (localhost:8443/.../dive-v3-broker-usa) should map to keycloak-usa, not local keycloak-fra
        
        // Extract realm from URL if present (e.g., /realms/dive-v3-broker-usa -> usa)
        const realmMatch = uri.match(/\/realms\/dive-v3-broker-([a-z]{3})/i);
        if (realmMatch) {
            const realmCountry = realmMatch[1].toLowerCase(); // usa, fra, gbr, deu
            const keycloakHost = `https://keycloak-${realmCountry}:8443`;
            
            if (uri.startsWith('https://localhost:8443/realms/')) {
                return uri.replace('https://localhost:8443', keycloakHost);
            }
            if (uri.startsWith('http://localhost:8081/realms/')) {
                return uri.replace('http://localhost:8081', keycloakHost);
            }
        }
        
        // Fallback: if no realm country, use local Keycloak (for base realm)
        if (uri.startsWith('https://localhost:8443/realms/')) {
            return uri.replace('https://localhost:8443', process.env.KEYCLOAK_URL || 'https://keycloak:8443');
        }
        if (uri.startsWith('http://localhost:8081/realms/')) {
            return uri.replace('http://localhost:8081', process.env.KEYCLOAK_URL || 'https://keycloak:8443');
        }
        return uri;
    };

    if (token) {
        try {
            const decoded = jwt.decode(token, { complete: true }) as jwt.Jwt | null;
            const payload = decoded?.payload as jwt.JwtPayload;
            if (payload?.iss) {
                // The issuer is the Keycloak realm URL, append JWKS path
                // e.g., https://gbr-idp.dive25.com/realms/dive-v3-broker -> https://gbr-idp.dive25.com/realms/dive-v3-broker/protocol/openid-connect/certs
                issuerJwksUri = rewriteToInternal(`${payload.iss}/protocol/openid-connect/certs`);
                kasLogger.debug('Using issuer JWKS for federation', { issuer: payload.iss, jwksUri: issuerJwksUri });
            }
        } catch (err) {
            kasLogger.warn('Failed to extract issuer from token, falling back to local JWKS', { error: (err as Error).message });
        }
    }

    // Determine which realm to fetch JWKS from (fallback for local tokens)
    const realm = token ? getRealmFromToken(token) : (process.env.KEYCLOAK_REALM || 'dive-v3-broker');

    // Try JWKS URLs in priority order:
    // 1. Issuer's JWKS (for federated tokens) - CRITICAL for cross-instance!
    // 2. Local Keycloak internal (Docker network)
    // 3. Local Keycloak external (localhost)
    const jwksUris = [
        ...(issuerJwksUri ? [issuerJwksUri] : []),  // Priority: issuer's JWKS
        `${process.env.KEYCLOAK_URL || 'https://keycloak:8443'}/realms/${realm}/protocol/openid-connect/certs`,  // Internal service
        `http://keycloak:8080/realms/${realm}/protocol/openid-connect/certs`,        // Internal HTTP
        `http://localhost:8081/realms/${realm}/protocol/openid-connect/certs`,        // Host-exposed HTTP
        `https://localhost:8443/realms/${realm}/protocol/openid-connect/certs`,       // Host-exposed HTTPS
    ].map(rewriteToInternal);

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
 * - Dual audience support: dive-v3-client AND dive-v3-broker
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

        // Multi-realm: Accept tokens from all federated partner Keycloak instances
        // Each KAS must accept JWTs from ALL coalition partners for cross-instance access
        //
        // CRITICAL: Federation requires accepting JWTs from ANY partner IdP
        // A GBR user accessing FRA resources presents a GBR-issued JWT to FRA KAS
        //
        // Valid issuers include:
        // 1. Local instance Keycloak (process.env.KEYCLOAK_URL)
        // 2. All coalition partner public IdPs (dive25.com domain)
        // 3. DEU uses prosecurity.biz domain
        // 4. Legacy/dev issuers for backward compatibility
        // Get current realm (supports both instance-specific and base realms)
        const currentRealm = process.env.KEYCLOAK_REALM || 'dive-v3-broker-usa';

        const validIssuers: [string, ...string[]] = [
            // Local instance (dynamic based on deployment) - supports both formats
            `${process.env.KEYCLOAK_URL}/realms/${currentRealm}`,
            `${process.env.KEYCLOAK_URL}/realms/dive-v3-broker`,

            // === COALITION PARTNER IdPs (Cloudflare Tunnels) ===
            // USA - supports both instance-specific and base realm names
            'https://usa-idp.dive25.com/realms/dive-v3-broker-usa',
            'https://usa-idp.dive25.com:8443/realms/dive-v3-broker-usa',
            'https://usa-idp.dive25.com/realms/dive-v3-broker',
            'https://usa-idp.dive25.com:8443/realms/dive-v3-broker',
            // FRA
            'https://fra-idp.dive25.com/realms/dive-v3-broker-fra',
            'https://fra-idp.dive25.com:8443/realms/dive-v3-broker-fra',
            'https://fra-idp.dive25.com/realms/dive-v3-broker',
            'https://fra-idp.dive25.com:8443/realms/dive-v3-broker',
            // GBR
            'https://gbr-idp.dive25.com/realms/dive-v3-broker-gbr',
            'https://gbr-idp.dive25.com:8443/realms/dive-v3-broker-gbr',
            'https://gbr-idp.dive25.com/realms/dive-v3-broker',
            'https://gbr-idp.dive25.com:8443/realms/dive-v3-broker',
            // DEU (uses prosecurity.biz domain)
            'https://deu-idp.prosecurity.biz/realms/dive-v3-broker-deu',
            'https://deu-idp.prosecurity.biz:8443/realms/dive-v3-broker-deu',
            'https://deu-idp.prosecurity.biz/realms/dive-v3-broker',
            'https://deu-idp.prosecurity.biz:8443/realms/dive-v3-broker',

            // === LEGACY/DEV ISSUERS ===
            'http://localhost:8081/realms/dive-v3-broker-usa',
            'http://localhost:8081/realms/dive-v3-broker',
            'https://localhost:8443/realms/dive-v3-broker-usa',
            'https://localhost:8443/realms/dive-v3-broker',
            'https://keycloak:8443/realms/dive-v3-broker-usa',
            'https://keycloak:8443/realms/dive-v3-broker',
            'https://kas.js.usa.divedeeper.internal:8443/realms/dive-v3-broker-usa',
            'https://kas.js.usa.divedeeper.internal:8443/realms/dive-v3-broker',
            'https://dev-auth.dive25.com/realms/dive-v3-broker-usa',
            'https://dev-auth.dive25.com/realms/dive-v3-broker',
        ];

        // Multi-realm: Accept tokens for both clients + Keycloak default audience + backend service accounts
        const validAudiences: [string, ...string[]] = [
            'dive-v3-client',         // Legacy client (broker realm)
            'dive-v3-broker',  // Multi-realm broker client (old name - deprecated)
            'dive-v3-broker-client',  // National realm client (Phase 2.1 - CORRECT NAME)
            'account',                // Keycloak default audience (ID tokens)
            'kas',                    // Backend service account for KAS calls (Issue B fix)
            'dive-v3-backend-client', // Backend service account client ID
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
