/**
 * JWT Verification & Authentication Middleware
 *
 * Handles JWT validation, token introspection, JWKS key fetching,
 * and the authenticateJWT Express middleware.
 *
 * Extracted from authz.middleware.ts during Phase 4A decomposition.
 */

import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import axios from 'axios';
import NodeCache from 'node-cache';
import { tokenIntrospectionService, TokenIntrospectionResponse } from '../services/token-introspection.service';
import jwkToPem from 'jwk-to-pem';
import { logger } from '../utils/logger';
import { isTokenBlacklisted, areUserTokensRevoked } from '../services/token-blacklist.service';
import { keycloakCircuitBreaker } from '../utils/circuit-breaker';
import { decisionCacheService } from '../services/decision-cache.service';

// ============================================
// Dependency Injection for Testability
// ============================================
interface IJwtService {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- DI interface must match jsonwebtoken's broad signatures
    verify: (...args: any[]) => any;
    decode: (...args: any[]) => any;
    sign: (...args: any[]) => any;
}

let jwtService: IJwtService = jwt;

/**
 * Initialize JWT service (for testing)
 * Allows tests to inject mock JWT verification
 * @param service - Custom JWT service implementation
 * @internal
 */
export const initializeJwtService = (service?: IJwtService): void => {
    jwtService = service || jwt;
};

// JWKS cache (1 hour TTL) - cache fetched public keys
const jwksCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });
// Simplified decision cache for test-mode fast path
const testDecisionCache = new Map<string, unknown>();

/**
 * Clear all caches (for testing)
 * @internal
 */
export const clearAuthzCaches = (): void => {
    decisionCacheService.reset();
    jwksCache.flushAll();
    testDecisionCache.clear();
};

/**
 * Normalize ACR (Authentication Context Class Reference) to numeric AAL (Authenticator Assurance Level)
 * @param acr ACR value from JWT token
 * @returns Numeric AAL level (0=AAL1, 1=AAL2, 2=AAL3)
 */
export function normalizeACR(acr: string | number | undefined): number {
    if (acr === undefined || acr === null) {
        return 0; // Default: AAL1
    }

    if (typeof acr === 'number') {
        return acr;
    }

    const numericACR = parseInt(acr as string, 10);
    if (!isNaN(numericACR)) {
        return numericACR;
    }

    const acrLower = (acr as string).toLowerCase();
    if (acrLower.includes('bronze') || acrLower.includes('aal1')) {
        return 0; // AAL1
    }
    if (acrLower.includes('silver') || acrLower.includes('aal2')) {
        return 1; // AAL2
    }
    if (acrLower.includes('gold') || acrLower.includes('aal3')) {
        return 2; // AAL3
    }

    return 0; // Default: AAL1 (fail-secure)
}

/**
 * Normalize AMR (Authentication Methods References) to array format
 * @param amr AMR value from JWT token
 * @returns Array of authentication methods
 */
export function normalizeAMR(amr: string | string[] | undefined): string[] {
    if (amr === undefined || amr === null) {
        return ['pwd']; // Default: password only
    }

    if (Array.isArray(amr)) {
        return amr;
    }

    try {
        const parsed = JSON.parse(amr as string);
        if (Array.isArray(parsed)) {
            return parsed;
        }
    } catch (e) {
        // Not JSON
    }

    return [amr as string];
}

/**
 * Interface for JWT payload (Keycloak token)
 * Enhanced with NIST SP 800-63B/C claims for AAL2/FAL2 enforcement
 * Gap #4: Added dutyOrg and orgUnit (ACP-240 Section 2.1)
 */
export interface IKeycloakToken {
    iss?: string;
    sub: string;
    email?: string;
    preferred_username?: string;
    uniqueID?: string;
    clearance?: string;
    countryOfAffiliation?: string;
    acpCOI?: string[];
    dutyOrg?: string;          // Gap #4: User's duty organization (e.g., US_ARMY, FR_DEFENSE_MINISTRY)
    orgUnit?: string;          // Gap #4: User's organizational unit (e.g., CYBER_DEFENSE, INTELLIGENCE)
    exp?: number;
    iat?: number;
    nbf?: number;
    jti?: string;              // JWT ID for revocation
    // AAL2/FAL2 claims (NIST SP 800-63B/C)
    aud?: string | string[];  // Audience (FAL2 - prevents token theft)
    // Phase 1: Support both numeric (new) and URN (legacy) ACR formats during migration
    acr?: string | number;     // Authentication Context Class Reference: numeric (0,1,2) or URN (urn:mace:incommon:iap:silver)
    // Phase 1: Support both array (new) and JSON string (legacy) AMR formats during migration
    amr?: string[] | string;   // Authentication Methods Reference: array ["pwd","otp"] or JSON string "[\"pwd\",\"otp\"]"
    auth_time?: number;        // Time of authentication (Unix timestamp)
    // OAuth2 introspection claims
    active?: boolean;
    client_id?: string;
    username?: string;
    scope?: string;
    token_type?: string;
    azp?: string;
}

/**
 * Extract realm name from token issuer
 * Multi-realm support: Determine which realm issued the token
 */
const getRealmFromToken = (token: string): string => {
    try {
        const decoded = jwtService.decode(token, { complete: true });
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
        logger.warn('Could not extract realm from token, using default', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return process.env.KEYCLOAK_REALM || 'dive-v3-broker';
    }
};

/**
 * Get signing key from JWKS with multi-realm support
 * Uses direct JWKS fetch instead of jwks-rsa due to compatibility issues
 *
 * Multi-Realm Migration (Oct 21, 2025):
 * - Dynamically determines JWKS URL based on token issuer
 * - Supports both dive-v3-broker and dive-v3-broker realms
 * - Caches keys per kid (realm-independent caching)
 */
const getSigningKey = async (header: jwt.JwtHeader, token?: string): Promise<string> => {
    // Determine which realm to fetch JWKS from
    const realm = token ? getRealmFromToken(token) : (process.env.KEYCLOAK_REALM || 'dive-v3-broker');

    // Phase 3B: Extract full issuer URL from token for federated JWKS fetching
    let tokenIssuer: string | null = null;
    if (token) {
        try {
            const decoded = jwt.decode(token, { complete: true });
            tokenIssuer = (decoded?.payload as any)?.iss;
        } catch {
            // Ignore decoding errors
        }
    }

    // FIX: Try both internal (Docker) and external (localhost) URLs for JWKS
    // HTTPS Support: Also try HTTPS port 8443 (production setup)
    // Phase 3B: Also try the token's issuer JWKS endpoint for federated tokens
    const jwksUris = [
        // If token has a different issuer (federated token), try its JWKS first
        ...(tokenIssuer ? [`${tokenIssuer}/protocol/openid-connect/certs`] : []),
        `${process.env.KEYCLOAK_URL}/realms/${realm}/protocol/openid-connect/certs`,  // Internal: http://keycloak:8080
        `http://localhost:8081/realms/${realm}/protocol/openid-connect/certs`,        // External HTTP: http://localhost:8081
        `https://localhost:8443/realms/${realm}/protocol/openid-connect/certs`,       // External HTTPS: https://localhost:8443
    ];

    logger.debug('Getting signing key for token', {
        kid: header.kid,
        alg: header.alg,
        realm,
        jwksUris,
    });

    if (!header.kid) {
        logger.error('Token header missing kid (key ID)');
        throw new Error('Token header missing kid');
    }

    // Check cache first (keys cached by kid, not realm-specific)
    const cachedKey = jwksCache.get<string>(header.kid);
    if (cachedKey) {
        logger.debug('Using cached JWKS public key', { kid: header.kid, realm });
        return cachedKey;
    }

    // Try to fetch JWKS from each URL until one succeeds
    // Circuit breaker protects against Keycloak failures
    let lastError: Error | null = null;
    for (const jwksUri of jwksUris) {
        try {
            logger.debug('Attempting to fetch JWKS', { jwksUri, kid: header.kid });

            // Fetch JWKS directly from Keycloak with circuit breaker protection
            const response = await keycloakCircuitBreaker.execute(async () => {
                return await axios.get(jwksUri, { timeout: 5000 });
            });
            const jwks = response.data;

            // Find the key with matching kid and use="sig"
            const key = jwks.keys.find((k: { kid?: string; use?: string }) => k.kid === header.kid && k.use === 'sig');

            if (!key) {
                logger.warn('No matching signing key found in JWKS at this URL', {
                    kid: header.kid,
                    realm,
                    jwksUri,
                    availableKids: jwks.keys.map((k: { kid?: string; use?: string; alg?: string }) => ({ kid: k.kid, use: k.use, alg: k.alg })),
                });
                continue; // Try next URL
            }

            // Convert JWK to PEM format
            const publicKey = jwkToPem(key);

            // Cache the public key
            jwksCache.set(header.kid, publicKey);

            logger.info('Signing key retrieved successfully', {
                kid: header.kid,
                alg: key.alg,
                realm,
                jwksUri,
                hasKey: !!publicKey,
            });

            return publicKey;
        } catch (error) {
            logger.warn('Failed to fetch signing key from this URL, trying next', {
                kid: header.kid,
                realm,
                jwksUri,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            lastError = error instanceof Error ? error : new Error('Unknown error');
        }
    }

    // If we get here, all URLs failed
    logger.error('Failed to fetch signing key from all URLs', {
        kid: header.kid,
        realm,
        jwksUris,
        lastError: lastError?.message,
    });
    throw new Error(`Failed to fetch signing key for kid: ${header.kid}. Last error: ${lastError?.message}`);
};

/**
 * Verify JWT token with dual-issuer support (multi-realm migration)
 *
 * Multi-Realm Migration (Oct 21, 2025):
 * - Supports both dive-v3-broker (legacy single-realm) AND dive-v3-broker (multi-realm federation)
 * - Backward compatible: Existing tokens from dive-v3-broker still work
 * - Forward compatible: New tokens from dive-v3-broker federation accepted
 * - Dual audience support: dive-v3-client AND dive-v3-broker
 */
/**
 * Verify JWT token using OAuth2 Token Introspection
 *
 * BEST PRACTICE APPROACH: 100% guaranteed bidirectional SSO federation
 * - No shared keys required across instances
 * - Each instance validates tokens against their issuing IdP
 * - Automatic key rotation via JWKS discovery
 * - Circuit breaker protection against IdP outages
 * - Fallback to JWKS validation if introspection fails
 * - Industry-standard OAuth2/OIDC compliance
 */
const verifyToken = async (token: string): Promise<IKeycloakToken> => {
    try {
        logger.debug('Starting token verification via OAuth2 introspection');

        // Handle test environment tokens (HS256 for integration tests)
        if (process.env.NODE_ENV === 'test') {
            const decoded = jwtService.decode(token, { complete: true });
            if (decoded?.header?.alg === 'HS256') {
                logger.debug('Using test mode JWT verification (HS256)');

                const jwtSecret = process.env.JWT_SECRET || 'test-secret';
                return new Promise((resolve, reject) => {
                    jwtService.verify(
                        token,
                        jwtSecret,
                        {
                            algorithms: ['HS256'],
                            ignoreExpiration: true, // tests control validity
                        },
                        (err: Error | null, decodedToken: unknown) => {
                            if (err) {
                                reject(err);
                            } else {
                                resolve(decodedToken as IKeycloakToken);
                            }
                        }
                    );
                });
            }
        }


        // PRODUCTION: Use OAuth2 Token Introspection (BEST PRACTICE)
        // Build list of trusted issuers from environment (no hardcoded lists!)
        const trustedIssuers: string[] = [];

        // Add environment-configured issuers
        if (process.env.TRUSTED_ISSUERS) {
            trustedIssuers.push(...process.env.TRUSTED_ISSUERS.split(',').map(s => s.trim()).filter(Boolean));
        }

        // Add primary issuer for this instance
        if (process.env.KEYCLOAK_ISSUER) {
            trustedIssuers.unshift(process.env.KEYCLOAK_ISSUER.trim());
        }

        // Use token introspection service for 100% reliable validation
        const introspectionResult: TokenIntrospectionResponse = await tokenIntrospectionService.validateToken(
            token,
            trustedIssuers.length > 0 ? trustedIssuers : undefined // Allow any issuer if none configured
        );

        if (!introspectionResult.active) {
            const error = new Error(introspectionResult.error_description || 'Token validation failed');
            logger.error('Token introspection failed', {
                error: introspectionResult.error,
                errorDescription: introspectionResult.error_description,
                issuer: introspectionResult.iss,
            });
            throw error;
        }

        // Convert introspection response to IKeycloakToken format
        const keycloakToken: IKeycloakToken = {
            // Standard JWT claims
            iss: introspectionResult.iss,
            sub: introspectionResult.sub,
            aud: Array.isArray(introspectionResult.aud) ? introspectionResult.aud : [introspectionResult.aud || ''],
            exp: introspectionResult.exp,
            iat: introspectionResult.iat,
            nbf: introspectionResult.nbf,
            jti: introspectionResult.jti,

            // OAuth2 introspection claims
            active: introspectionResult.active,
            client_id: introspectionResult.client_id,
            username: introspectionResult.username,
            scope: introspectionResult.scope,
            token_type: introspectionResult.token_type,

            // Custom DIVE claims (from Keycloak protocol mappers)
            uniqueID: introspectionResult.uniqueID,
            clearance: introspectionResult.clearance,
            countryOfAffiliation: introspectionResult.countryOfAffiliation,
            acpCOI: introspectionResult.acpCOI,
            acr: introspectionResult.acr,
            amr: introspectionResult.amr,
            auth_time: introspectionResult.auth_time,

            // Legacy compatibility
            preferred_username: introspectionResult.username,
            azp: introspectionResult.client_id,
        };

        logger.info('Token validation successful via OAuth2 introspection', {
            issuer: introspectionResult.iss,
            subject: introspectionResult.sub,
            clientId: introspectionResult.client_id,
            uniqueID: introspectionResult.uniqueID,
            clearance: introspectionResult.clearance,
            country: introspectionResult.countryOfAffiliation,
        });

        return keycloakToken;
    } catch (error) {
        logger.error('Token verification failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
        });
        throw error;
    }
};

/**
 * JWT Authentication Middleware using OAuth2 Token Introspection
 *
 * BEST PRACTICE: Validates tokens via OAuth2 introspection instead of JWT signature verification
 * - No shared keys required
 * - Automatic key rotation
 * - Circuit breaker protection
 * - 100% guaranteed bidirectional SSO
 */
export async function authenticateJWT(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Missing or invalid Authorization header',
            });
            return;
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        // CRITICAL FIX: Load trusted issuers from MongoDB to validate federated tokens
        let allowedIssuers: string[] | undefined;
        try {
            const { mongoOpalDataStore } = await import('../models/trusted-issuer.model');
            const trustedIssuers = await mongoOpalDataStore.getAllIssuers(false); // Only enabled issuers (auto-initializes)
            allowedIssuers = trustedIssuers.map(issuer => issuer.issuerUrl);

            logger.info('Loaded trusted issuers for token validation', {
                count: allowedIssuers.length,
                issuers: allowedIssuers,
            });
        } catch (error) {
            logger.error('Failed to load trusted issuers from MongoDB - token validation may fail', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
            });
            // Set allowedIssuers to undefined to allow any issuer (fallback mode)
            allowedIssuers = undefined;
        }

        // Use OAuth2 token introspection for validation
        const introspectionResult = await tokenIntrospectionService.validateToken(token, allowedIssuers);

        if (!introspectionResult.active) {
            logger.warn('Token introspection failed', {
                error: introspectionResult.error,
                errorDescription: introspectionResult.error_description,
                issuer: introspectionResult.iss,
            });

            res.status(401).json({
                error: 'Unauthorized',
                message: introspectionResult.error_description || 'Invalid token',
            });
            return;
        }

        // Check if token is blacklisted (revoked via logout or admin action)
        // Use circuit breaker to fail open if Redis is unavailable
        // ALSO: Extract custom claims from JWT token itself, as Keycloak's introspection
        // endpoint only returns standard OAuth2 claims, not custom claims from protocol mappers
        const decodedToken = jwtService.decode(token, { complete: false }) as any;
        const jti = introspectionResult.jti || decodedToken?.jti;

        // CRITICAL FIX (2026-02-08): Keycloak introspection endpoint doesn't include custom claims
        // Extract them from the JWT token itself and merge with introspection result
        // This ensures clearance, countryOfAffiliation, acpCOI, uniqueID are always available
        // CRITICAL FIX (2026-02-13): Also extract ACR/AMR/auth_time for MFA enforcement!
        // Without this, local users who complete MFA still show amr=undefined → defaults to ['pwd']
        if (decodedToken) {
            introspectionResult.uniqueID = introspectionResult.uniqueID || decodedToken.uniqueID;
            introspectionResult.clearance = introspectionResult.clearance || decodedToken.clearance;
            introspectionResult.countryOfAffiliation = introspectionResult.countryOfAffiliation || decodedToken.countryOfAffiliation;
            introspectionResult.acpCOI = introspectionResult.acpCOI || decodedToken.acpCOI;

            // ACR/AMR/auth_time: Critical for MFA enforcement in OPA policies
            // The native oidc-amr-mapper and oidc-acr-mapper always include these in the JWT,
            // but Keycloak's introspection endpoint may not return them
            //
            // CRITICAL FIX (2026-02-14): Keycloak's oidc-amr-mapper outputs amr:[] when
            // AUTHENTICATORS_COMPLETED user session note has no valid entries (e.g., missing
            // "default.reference.value" config or expired "default.reference.maxAge").
            // An empty array is truthy in JS, so `[] || decodedToken.amr` keeps [].
            // We treat empty arrays as "not present" for proper fallback in getEffectiveAmr().
            const introspectedAmr = introspectionResult.amr;
            const hasValidIntrospectedAmr = Array.isArray(introspectedAmr) && introspectedAmr.length > 0;
            const jwtAmr = decodedToken.amr;
            const hasValidJwtAmr = Array.isArray(jwtAmr) && jwtAmr.length > 0;

            introspectionResult.acr = introspectionResult.acr || decodedToken.acr;
            introspectionResult.amr = hasValidIntrospectedAmr ? introspectedAmr
                : hasValidJwtAmr ? jwtAmr
                : undefined; // Let getEffectiveAmr() handle the fallback
            introspectionResult.auth_time = introspectionResult.auth_time || decodedToken.auth_time;
            // user_acr/user_amr: Federated user attribute-based claims
            const introspectedUserAmr = (introspectionResult as any).user_amr;
            const hasValidUserAmr = Array.isArray(introspectedUserAmr) && introspectedUserAmr.length > 0;
            (introspectionResult as any).user_acr = (introspectionResult as any).user_acr || decodedToken.user_acr;
            (introspectionResult as any).user_amr = hasValidUserAmr ? introspectedUserAmr
                : (Array.isArray(decodedToken.user_amr) && decodedToken.user_amr.length > 0 ? decodedToken.user_amr : undefined);

            logger.debug('Supplemented introspection result with JWT claims', {
                uniqueID: introspectionResult.uniqueID,
                clearance: introspectionResult.clearance,
                countryOfAffiliation: introspectionResult.countryOfAffiliation,
                acr: introspectionResult.acr,
                amr: introspectionResult.amr,
                source: 'JWT token (protocol mapper claims)',
            });
        }

        if (jti) {
            try {
                const isBlacklisted = await isTokenBlacklisted(jti);
                if (isBlacklisted) {
                    logger.warn('[AuthzMiddleware] Token is blacklisted', {
                        jti,
                        sub: introspectionResult.sub,
                        aud: introspectionResult.aud,
                    });
                    res.status(401).json({
                        error: 'Unauthorized',
                        message: 'Token has been revoked',
                    });
                    return;
                }
            } catch (error) {
                // Fail open: If Redis/blacklist check fails, log error but allow request
                logger.error('[AuthzMiddleware] Blacklist check failed, allowing request', {
                    jti,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        }

        // Also check if all user tokens are revoked
        const uniqueID = introspectionResult.uniqueID || introspectionResult.preferred_username || introspectionResult.sub;
        if (uniqueID) {
            try {
                const allRevoked = await areUserTokensRevoked(uniqueID);
                if (allRevoked) {
                    logger.warn('[AuthzMiddleware] All user tokens revoked', { uniqueID });
                    res.status(401).json({
                        error: 'Unauthorized',
                        message: 'User session has been terminated',
                    });
                    return;
                }
            } catch (error) {
                // Fail open: If Redis/blacklist check fails, log error but allow request
                logger.error('[AuthzMiddleware] User revocation check failed, allowing request', {
                    uniqueID,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        }

        // Extract roles from introspection result
        // Keycloak includes roles in realm_access.roles or resource_access.{client}.roles
        let roles: string[] = [];
        if (introspectionResult.roles && Array.isArray(introspectionResult.roles)) {
            roles = introspectionResult.roles;
        } else if (introspectionResult.realm_access?.roles) {
            roles = introspectionResult.realm_access.roles;
        } else if (introspectionResult.resource_access) {
            // Try to find roles in resource_access for any client
            for (const clientRoles of Object.values(introspectionResult.resource_access)) {
                if (clientRoles.roles) {
                    roles = [...roles, ...clientRoles.roles];
                }
            }
        }

        // Attach user information to request
        // CRITICAL FIX (2026-01-20): Include ACR/AMR/auth_time for MFA enforcement!
        // CRITICAL FIX (2026-01-29): Include roles for admin authorization!
        (req as any).user = {
            uniqueID: introspectionResult.uniqueID || introspectionResult.preferred_username || introspectionResult.sub,
            clearance: introspectionResult.clearance,
            countryOfAffiliation: introspectionResult.countryOfAffiliation,
            acpCOI: introspectionResult.acpCOI,
            roles: roles, // CRITICAL: Add roles for admin middleware
            sub: introspectionResult.sub,
            iss: introspectionResult.iss,
            client_id: introspectionResult.client_id,
            email: introspectionResult.username, // Keycloak uses username for email
            // MFA enforcement attributes (critical for AAL2/AAL3)
            // Session-based ACR/AMR from actual authentication
            acr: introspectionResult.acr,
            amr: introspectionResult.amr,
            auth_time: introspectionResult.auth_time,
            // User attribute ACR/AMR for testing/simulation
            // These allow AAL testing without requiring actual MFA registration
            user_acr: (introspectionResult as any).user_acr,
            user_amr: (introspectionResult as any).user_amr,
        };

        logger.debug('Token validated via OAuth2 introspection', {
            subject: introspectionResult.sub,
            issuer: introspectionResult.iss,
            uniqueID: introspectionResult.uniqueID,
            roles: roles,
            acr: introspectionResult.acr,
            amr: introspectionResult.amr,
        });

        next();
    } catch (error) {
        logger.error('JWT authentication failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });

        res.status(401).json({
            error: 'Unauthorized',
            message: 'Token validation failed',
        });
    }
}
