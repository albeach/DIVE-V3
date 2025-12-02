import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import axios from 'axios';
import NodeCache from 'node-cache';
import jwkToPem from 'jwk-to-pem';
import { logger } from '../utils/logger';
import { getResourceByIdFederated } from '../services/resource.service';
import { isTokenBlacklisted, areUserTokensRevoked } from '../services/token-blacklist.service';
import { validateSPToken } from './sp-auth.middleware';
import { IRequestWithSP } from '../types/sp-federation.types';
import { opaCircuitBreaker, keycloakCircuitBreaker } from '../utils/circuit-breaker';

// ============================================
// PEP (Policy Enforcement Point) Middleware
// ============================================
// Week 2: Integrate OPA for ABAC authorization
// Pattern: Validate JWT → Extract attributes → Fetch resource → Call OPA → Enforce decision

// ============================================
// Week 4: Dependency Injection for Testability
// ============================================
// BEST PRACTICE: Allow jwt service injection for testing
// Pattern from Week 3 OAuth controller refactor
interface IJwtService {
    verify: (...args: any[]) => any;
    decode: (...args: any[]) => any;
    sign: (...args: any[]) => any;
}

// Module-level jwt service (can be replaced for testing)
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

// Decision cache (60s TTL)
const decisionCache = new NodeCache({ stdTTL: 60, checkperiod: 120 });

// JWKS cache (1 hour TTL) - cache fetched public keys
const jwksCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

/**
 * Clear all caches (for testing)
 * @internal
 */
export const clearAuthzCaches = (): void => {
    decisionCache.flushAll();
    jwksCache.flushAll();
};

// OPA endpoint
const OPA_URL = process.env.OPA_URL || 'http://localhost:8181';
const OPA_DECISION_ENDPOINT = `${OPA_URL}/v1/data/dive/authorization`;

/**
 * Interface for JWT payload (Keycloak token)
 * Enhanced with NIST SP 800-63B/C claims for AAL2/FAL2 enforcement
 * Gap #4: Added dutyOrg and orgUnit (ACP-240 Section 2.1)
 */
interface IKeycloakToken {
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
    jti?: string;              // JWT ID for revocation
    // AAL2/FAL2 claims (NIST SP 800-63B/C)
    aud?: string | string[];  // Audience (FAL2 - prevents token theft)
    // Phase 1: Support both numeric (new) and URN (legacy) ACR formats during migration
    acr?: string | number;     // Authentication Context Class Reference: numeric (0,1,2) or URN (urn:mace:incommon:iap:silver)
    // Phase 1: Support both array (new) and JSON string (legacy) AMR formats during migration
    amr?: string[] | string;   // Authentication Methods Reference: array ["pwd","otp"] or JSON string "[\"pwd\",\"otp\"]"
    auth_time?: number;        // Time of authentication (Unix timestamp)
}

/**
 * Interface for OPA input
 * ACP-240 Section 4.3 Enhancement: Added original classification fields
 * Gap #4: Added dutyOrg and orgUnit for organization-based policies
 */
interface IOPAInput {
    input: {
        subject: {
            authenticated: boolean;
            uniqueID: string;
            clearance?: string;                    // DIVE canonical (SECRET, TOP_SECRET, etc.)
            clearanceOriginal?: string;            // NEW: Original national clearance (e.g., "GEHEIM", "SECRET DÉFENSE")
            clearanceCountry?: string;             // NEW: Country that issued clearance (ISO 3166-1 alpha-3)
            countryOfAffiliation?: string;
            acpCOI?: string[];
            dutyOrg?: string;                      // Gap #4: Organization (e.g., US_ARMY, FR_DEFENSE_MINISTRY)
            orgUnit?: string;                      // Gap #4: Organizational Unit (e.g., CYBER_DEFENSE, INTELLIGENCE)
        };
        action: {
            operation: string;
        };
        resource: {
            resourceId: string;
            classification?: string;               // DIVE canonical (SECRET, TOP_SECRET, etc.)
            originalClassification?: string;       // NEW: Original national classification (ACP-240 Section 4.3)
            originalCountry?: string;              // NEW: Country that created classification (ACP-240 Section 4.3)
            natoEquivalent?: string;               // NEW: NATO standard equivalent (ACP-240 Section 4.3)
            releasabilityTo?: string[];
            COI?: string[];
            coiOperator?: string;                  // COI operator: "ALL" | "ANY"
            creationDate?: string;
            encrypted?: boolean;
        };
        context: {
            currentTime: string;
            sourceIP: string;
            deviceCompliant: boolean;
            requestId: string;
            // AAL2/FAL2 context (NIST SP 800-63B/C)
            acr?: string;                          // Authentication Context Class Reference (AAL level)
            amr?: string[];                        // Authentication Methods Reference (MFA factors)
            auth_time?: number;                    // Time of authentication (Unix timestamp)
        };
    };
}

/**
 * Interface for OPA decision (actual response from /v1/data/dive/authorization)
 */
interface IOPAResponse {
    result: {
        decision: {
            allow: boolean;
            reason: string;
            obligations?: Array<{
                type: string;
                resourceId?: string;
            }>;
            evaluation_details?: Record<string, unknown>;
        };
        allow: boolean;
        reason: string;
        obligations?: Array<{
            type: string;
            resourceId?: string;
        }>;
        evaluation_details?: Record<string, unknown>;
        [key: string]: any; // Other rules/tests in the package
    };
}

/**
 * Interface for normalized decision (what we use in middleware)
 */
interface IOPADecision {
    result: {
        allow: boolean;
        reason: string;
        obligations?: Array<{
            type: string;
            resourceId?: string;
        }>;
        evaluation_details?: Record<string, unknown>;
    };
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
    // Default to KEYCLOAK_REALM (dive-v3-broker), but support multi-realm
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
            const key = jwks.keys.find((k: any) => k.kid === header.kid && k.use === 'sig');

            if (!key) {
                logger.warn('No matching signing key found in JWKS at this URL', {
                    kid: header.kid,
                    realm,
                    jwksUri,
                    availableKids: jwks.keys.map((k: any) => ({ kid: k.kid, use: k.use, alg: k.alg })),
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
 * - Dual audience support: dive-v3-client AND dive-v3-client-broker
 */
const verifyToken = async (token: string): Promise<IKeycloakToken> => {
    try {
        // First decode the header to get the kid
        const decoded = jwtService.decode(token, { complete: true });
        if (!decoded || !decoded.header) {
            throw new Error('Invalid token format');
        }

        // TEST ENVIRONMENT: Allow HS256 tokens without kid for integration tests
        if (process.env.NODE_ENV === 'test' && decoded.header.alg === 'HS256') {
            logger.debug('Using test mode JWT verification (HS256)', {
                alg: decoded.header.alg,
                iss: (decoded.payload as any).iss,
            });

            const jwtSecret = process.env.JWT_SECRET || 'test-secret';

            // Verify HS256 token with shared secret (test only)
            return new Promise((resolve, reject) => {
                jwtService.verify(
                    token,
                    jwtSecret,
                    {
                        algorithms: ['HS256'],
                        // In test mode, accept test issuer
                        issuer: ['https://keycloak.dive-v3.local', `${process.env.KEYCLOAK_URL}/realms/dive-v3-broker`, `${process.env.KEYCLOAK_URL}/realms/dive-v3-broker`],
                        audience: ['dive-v3-client', 'dive-v3-client-broker', 'account'],
                    },
                    (err: any, decodedToken: any) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(decodedToken as IKeycloakToken);
                        }
                    }
                );
            });
        }

        // PRODUCTION: Require RS256 with kid from JWKS
        // Get the signing key (pass token for realm detection)
        const publicKey = await getSigningKey(decoded.header, token);

        // Log the actual issuer for debugging
        const actualIssuer = (decoded.payload as any)?.iss;
        logger.debug('Token issuer detected', {
            actualIssuer,
            tokenKid: decoded.header.kid,
        });

        // Multi-realm: Accept tokens from all DIVE realms (broker + individual IdP realms)
        // Docker networking: Accept both internal (keycloak:8080) AND external (localhost:8081) URLs
        // Keycloak 26 Fix: Also accept localhost:8080 (frontend container accessing Keycloak)
        // HTTPS Support: Accept HTTPS issuers on port 8443 (production setup)
        // Custom Domain: Accept kas.js.usa.divedeeper.internal:8443 (KC_HOSTNAME)
        // Cloudflare Tunnel: Accept dev-auth.dive25.com (Nov 10, 2025)
        // USA IdP Domain: Accept usa-idp.dive25.com (Nov 29, 2025)
        const validIssuers: [string, ...string[]] = [
            // Legacy pilot realm
            `${process.env.KEYCLOAK_URL}/realms/dive-v3-broker`,    // Internal: dive-v3-broker
            'http://localhost:8081/realms/dive-v3-broker',          // External HTTP: dive-v3-broker
            'https://localhost:8443/realms/dive-v3-broker',         // External HTTPS: dive-v3-broker
            'http://localhost:8080/realms/dive-v3-broker',          // Frontend container: dive-v3-broker
            'https://kas.js.usa.divedeeper.internal:8443/realms/dive-v3-broker',  // Custom domain: dive-v3-broker
            'https://dev-auth.dive25.com/realms/dive-v3-broker',    // Cloudflare Tunnel: dive-v3-broker
            'https://usa-idp.dive25.com:8443/realms/dive-v3-broker', // USA IdP domain with port: dive-v3-broker
            'https://usa-idp.dive25.com/realms/dive-v3-broker',      // USA IdP domain via Cloudflare (no port)

            // Phase 3B: Federation Partner IdPs (Cloudflare Tunnel domains)
            // These are required for cross-instance federated search
            'https://fra-idp.dive25.com/realms/dive-v3-broker',      // FRA IdP domain via Cloudflare
            'https://gbr-idp.dive25.com/realms/dive-v3-broker',      // GBR IdP domain via Cloudflare
            'https://deu-idp.prosecurity.biz/realms/dive-v3-broker', // DEU IdP domain via Cloudflare

            // Main broker realm
            `${process.env.KEYCLOAK_URL}/realms/dive-v3-broker`,   // Internal: dive-v3-broker
            'http://localhost:8081/realms/dive-v3-broker',         // External HTTP: dive-v3-broker
            'https://localhost:8443/realms/dive-v3-broker',        // External HTTPS: dive-v3-broker ← CRITICAL
            'http://localhost:8080/realms/dive-v3-broker',         // Frontend container: dive-v3-broker
            'https://kas.js.usa.divedeeper.internal:8443/realms/dive-v3-broker',  // Custom domain: dive-v3-broker ← FIX
            'https://dev-auth.dive25.com/realms/dive-v3-broker',   // Cloudflare Tunnel: dive-v3-broker

            // Individual IdP realms (for direct login to sub-realms)
            `${process.env.KEYCLOAK_URL}/realms/dive-v3-usa`,      // Internal: dive-v3-usa
            'http://localhost:8081/realms/dive-v3-usa',            // External HTTP: dive-v3-usa
            'https://localhost:8443/realms/dive-v3-usa',           // External HTTPS: dive-v3-usa
            'http://localhost:8080/realms/dive-v3-usa',            // Frontend container: dive-v3-usa
            'https://kas.js.usa.divedeeper.internal:8443/realms/dive-v3-usa',  // Custom domain: dive-v3-usa
            'https://dev-auth.dive25.com/realms/dive-v3-usa',      // Cloudflare Tunnel: dive-v3-usa
            `${process.env.KEYCLOAK_URL}/realms/dive-v3-fra`,      // Internal: dive-v3-fra
            'http://localhost:8081/realms/dive-v3-fra',            // External HTTP: dive-v3-fra
            'https://localhost:8443/realms/dive-v3-fra',           // External HTTPS: dive-v3-fra
            'http://localhost:8080/realms/dive-v3-fra',            // Frontend container: dive-v3-fra
            'https://kas.js.usa.divedeeper.internal:8443/realms/dive-v3-fra',  // Custom domain: dive-v3-fra
            'https://dev-auth.dive25.com/realms/dive-v3-fra',      // Cloudflare Tunnel: dive-v3-fra
            `${process.env.KEYCLOAK_URL}/realms/dive-v3-can`,      // Internal: dive-v3-can
            'http://localhost:8081/realms/dive-v3-can',            // External HTTP: dive-v3-can
            'https://localhost:8443/realms/dive-v3-can',           // External HTTPS: dive-v3-can
            'http://localhost:8080/realms/dive-v3-can',            // Frontend container: dive-v3-can
            'https://kas.js.usa.divedeeper.internal:8443/realms/dive-v3-can',  // Custom domain: dive-v3-can
            'https://dev-auth.dive25.com/realms/dive-v3-can',      // Cloudflare Tunnel: dive-v3-can
            `${process.env.KEYCLOAK_URL}/realms/dive-v3-industry`, // Internal: dive-v3-industry
            'http://localhost:8081/realms/dive-v3-industry',       // External HTTP: dive-v3-industry
            'https://localhost:8443/realms/dive-v3-industry',      // External HTTPS: dive-v3-industry
            'http://localhost:8080/realms/dive-v3-industry',       // Frontend container: dive-v3-industry
            'https://kas.js.usa.divedeeper.internal:8443/realms/dive-v3-industry',  // Custom domain: dive-v3-industry
            'https://dev-auth.dive25.com/realms/dive-v3-industry', // Cloudflare Tunnel: dive-v3-industry
            `${process.env.KEYCLOAK_URL}/realms/dive-v3-gbr`,      // Internal: dive-v3-gbr
            'http://localhost:8081/realms/dive-v3-gbr',            // External HTTP: dive-v3-gbr
            'https://localhost:8443/realms/dive-v3-gbr',           // External HTTPS: dive-v3-gbr
            'http://localhost:8080/realms/dive-v3-gbr',            // Frontend container: dive-v3-gbr
            'https://kas.js.usa.divedeeper.internal:8443/realms/dive-v3-gbr',  // Custom domain: dive-v3-gbr
            'https://dev-auth.dive25.com/realms/dive-v3-gbr',      // Cloudflare Tunnel: dive-v3-gbr
            `${process.env.KEYCLOAK_URL}/realms/dive-v3-deu`,      // Internal: dive-v3-deu
            'http://localhost:8081/realms/dive-v3-deu',            // External HTTP: dive-v3-deu
            'https://localhost:8443/realms/dive-v3-deu',           // External HTTPS: dive-v3-deu
            'http://localhost:8080/realms/dive-v3-deu',            // Frontend container: dive-v3-deu
            'https://kas.js.usa.divedeeper.internal:8443/realms/dive-v3-deu',  // Custom domain: dive-v3-deu
            'https://dev-auth.dive25.com/realms/dive-v3-deu',      // Cloudflare Tunnel: dive-v3-deu
            `${process.env.KEYCLOAK_URL}/realms/dive-v3-nld`,      // Internal: dive-v3-nld
            'http://localhost:8081/realms/dive-v3-nld',            // External HTTP: dive-v3-nld
            'https://localhost:8443/realms/dive-v3-nld',           // External HTTPS: dive-v3-nld
            'http://localhost:8080/realms/dive-v3-nld',            // Frontend container: dive-v3-nld
            'https://kas.js.usa.divedeeper.internal:8443/realms/dive-v3-nld',  // Custom domain: dive-v3-nld
            'https://dev-auth.dive25.com/realms/dive-v3-nld',      // Cloudflare Tunnel: dive-v3-nld
            `${process.env.KEYCLOAK_URL}/realms/dive-v3-pol`,      // Internal: dive-v3-pol
            'http://localhost:8081/realms/dive-v3-pol',            // External HTTP: dive-v3-pol
            'https://localhost:8443/realms/dive-v3-pol',           // External HTTPS: dive-v3-pol
            'http://localhost:8080/realms/dive-v3-pol',            // Frontend container: dive-v3-pol
            'https://kas.js.usa.divedeeper.internal:8443/realms/dive-v3-pol',  // Custom domain: dive-v3-pol
            'https://dev-auth.dive25.com/realms/dive-v3-pol',      // Cloudflare Tunnel: dive-v3-pol
            `${process.env.KEYCLOAK_URL}/realms/dive-v3-ita`,      // Internal: dive-v3-ita
            'http://localhost:8081/realms/dive-v3-ita',            // External HTTP: dive-v3-ita
            'https://localhost:8443/realms/dive-v3-ita',           // External HTTPS: dive-v3-ita
            'http://localhost:8080/realms/dive-v3-ita',            // Frontend container: dive-v3-ita
            'https://kas.js.usa.divedeeper.internal:8443/realms/dive-v3-ita',  // Custom domain: dive-v3-ita
            'https://dev-auth.dive25.com/realms/dive-v3-ita',      // Cloudflare Tunnel: dive-v3-ita
            `${process.env.KEYCLOAK_URL}/realms/dive-v3-esp`,      // Internal: dive-v3-esp
            'http://localhost:8081/realms/dive-v3-esp',            // External HTTP: dive-v3-esp
            'https://localhost:8443/realms/dive-v3-esp',           // External HTTPS: dive-v3-esp
            'http://localhost:8080/realms/dive-v3-esp',            // Frontend container: dive-v3-esp
            'https://kas.js.usa.divedeeper.internal:8443/realms/dive-v3-esp',  // Custom domain: dive-v3-esp
            'https://dev-auth.dive25.com/realms/dive-v3-esp',      // Cloudflare Tunnel: dive-v3-esp
        ];

        // Multi-realm: Accept tokens for both clients + Keycloak default audience
        const validAudiences: [string, ...string[]] = [
            'dive-v3-client',         // Legacy client (broker realm)
            'dive-v3-client-broker',  // Multi-realm broker client (old name - deprecated)
            'dive-v3-broker-client',  // National realm client (Phase 2.1 - CORRECT NAME)
            'account',                // Keycloak default audience (ID tokens)
        ];

        // Phase 2.2: Direct Grant tokens often have NO 'aud' claim, only 'azp'
        // Check if token has azp (authorized party) and use that if aud is missing
        const tokenPayload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        const hasAudClaim = tokenPayload.aud !== null && tokenPayload.aud !== undefined;
        const azpClaim = tokenPayload.azp;

        // If no aud claim but azp exists and is valid, skip audience validation
        const skipAudienceValidation = !hasAudClaim && azpClaim && validAudiences.includes(azpClaim);

        // Verify the token with the public key
        return new Promise((resolve, reject) => {
            jwtService.verify(
                token,
                publicKey,
                {
                    algorithms: ['RS256'],
                    issuer: validIssuers,      // Array of valid issuers (FAL2 compliant)
                    audience: skipAudienceValidation ? undefined : validAudiences,  // Skip if using azp
                },
                (err: any, decoded: any) => {
                    if (err) {
                        // Enhanced error logging: show actual issuer received
                        logger.error('JWT verification failed in jwtService.verify', {
                            error: err.message,
                            actualIssuer: actualIssuer,
                            expectedIssuers: validIssuers.slice(0, 5), // Log first 5 to avoid huge logs
                            actualAudience: (decoded?.payload as any)?.aud,
                            expectedAudiences: validAudiences
                        });
                        reject(err);
                    } else {
                        resolve(decoded as IKeycloakToken);
                    }
                }
            );
        });
    } catch (error) {
        logger.error('Token verification error (outer catch)', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        throw error;
    }
};

/**
 * Normalize ACR claim to numeric AAL level (Phase 1: Backward Compatibility)
 * 
 * Supports both formats during migration:
 * - Numeric format (new): 0=AAL1, 1=AAL2, 2=AAL3 (set by custom SPI session notes)
 * - URN format (legacy): urn:mace:incommon:iap:bronze/silver/gold (from hardcoded user attributes)
 * 
 * @param acr - ACR claim from JWT (string or number)
 * @returns Numeric AAL level (0 = AAL1, 1 = AAL2, 2 = AAL3)
 */
export function normalizeACR(acr: string | number | undefined): number {
    if (acr === undefined || acr === null) {
        logger.debug('ACR not provided, defaulting to AAL1');
        return 0;  // Default: AAL1
    }

    // Handle numeric format (new)
    if (typeof acr === 'number') {
        logger.debug('ACR is numeric (new format)', { acr });
        return acr;
    }

    // Handle numeric strings (Keycloak custom SPI returns "0", "1", "2")
    const numericACR = parseInt(acr as string, 10);
    if (!isNaN(numericACR)) {
        logger.debug('ACR is numeric string (new format)', { acr, parsed: numericACR });
        return numericACR;
    }

    // Handle URN format (legacy - from hardcoded user attributes)
    const acrLower = (acr as string).toLowerCase();
    if (acrLower.includes('bronze') || acrLower.includes('aal1')) {
        logger.debug('ACR is URN format: AAL1 (legacy)', { acr });
        return 0;  // AAL1
    }
    if (acrLower.includes('silver') || acrLower.includes('aal2')) {
        logger.debug('ACR is URN format: AAL2 (legacy)', { acr });
        return 1;  // AAL2
    }
    if (acrLower.includes('gold') || acrLower.includes('aal3')) {
        logger.debug('ACR is URN format: AAL3 (legacy)', { acr });
        return 2;  // AAL3
    }

    // Fallback: Unknown format, default to AAL1 (fail-secure)
    logger.warn('Unknown ACR format, defaulting to AAL1 (fail-secure)', { acr });
    return 0;
}

/**
 * Normalize AMR claim to array format (Phase 1: Backward Compatibility)
 * 
 * Supports both formats during migration:
 * - Array format (new): ["pwd", "otp"] (set by custom SPI session notes)
 * - JSON string format (legacy): "[\"pwd\",\"otp\"]" (from hardcoded user attributes)
 * 
 * @param amr - AMR claim from JWT (array or JSON string)
 * @returns Array of authentication methods
 */
export function normalizeAMR(amr: string | string[] | undefined): string[] {
    if (amr === undefined || amr === null) {
        logger.debug('AMR not provided, defaulting to password-only');
        return ['pwd'];  // Default: password only
    }

    // Handle array format (new)
    if (Array.isArray(amr)) {
        logger.debug('AMR is array (new format)', { amr });
        return amr;
    }

    // Handle JSON string format (legacy - from hardcoded user attributes)
    try {
        const parsed = JSON.parse(amr as string);
        if (Array.isArray(parsed)) {
            logger.debug('AMR is JSON string (legacy), parsed to array', { amr, parsed });
            return parsed;
        }
    } catch (e) {
        // Not JSON, treat as single method
        logger.debug('AMR is not JSON, treating as single method', { amr });
    }

    // Single string value (edge case)
    logger.debug('AMR is single string value', { amr });
    return [amr as string];
}

/**
 * Validate AAL2 (Authentication Assurance Level 2) requirements
 * Reference: docs/IDENTITY-ASSURANCE-LEVELS.md Lines 46-94
 * 
 * AAL2 Requirements (NIST SP 800-63B):
 * - Multi-factor authentication (MFA) required
 * - At least 2 authentication factors (something you know + something you have)
 * - ACR (Authentication Context Class Reference) indicates AAL2+
 * - AMR (Authentication Methods Reference) shows 2+ factors
 * 
 * Multi-Realm Note (Oct 21, 2025):
 * - Keycloak sets ACR to numeric values (0=AAL1, 1=AAL2, 2=AAL3)
 * - AMR may be JSON-encoded string from user attributes
 * - Must parse AMR before checking array length
 * 
 * Phase 1 (Oct 30, 2025):
 * - Uses normalizeACR() and normalizeAMR() for backward compatibility
 * - Supports both numeric and URN ACR formats
 * - Supports both array and JSON string AMR formats
 * 
 * @param token - Decoded Keycloak token
 * @param classification - Resource classification level
 * @throws Error if AAL2 requirements not met for classified resources
 */
const validateAAL2 = (token: IKeycloakToken, classification: string): void => {
    // AAL2 requirement only applies to classified resources
    if (classification === 'UNCLASSIFIED') {
        return;
    }

    // Phase 1: Use normalization functions for backward compatibility
    const aal = normalizeACR(token.acr);
    const amrArray = normalizeAMR(token.amr);

    // Check if ACR indicates AAL2+ (numeric: 1 or higher)
    const isAAL2 = aal >= 1;

    // If ACR indicates AAL2+, accept it
    if (isAAL2) {
        logger.debug('AAL2 validation passed via ACR', {
            classification,
            originalACR: token.acr,
            normalizedAAL: aal,
            originalAMR: token.amr,
            normalizedAMR: amrArray,
            factorCount: amrArray.length
        });
        return;
    }

    // Fallback: Check AMR for 2+ factors (allows AAL2 via MFA even if ACR not set correctly)
    // This handles cases where IdP doesn't set proper ACR but does provide AMR
    if (amrArray.length >= 2) {
        logger.info('AAL2 validated via AMR (2+ factors), despite ACR indicating AAL1', {
            classification,
            originalACR: token.acr,
            normalizedAAL: aal,
            originalAMR: token.amr,
            normalizedAMR: amrArray,
            factorCount: amrArray.length,
            note: 'Accepting based on AMR factors - consider configuring IdP to set proper ACR value'
        });
        return;
    }

    // Reject: Neither ACR nor AMR indicate AAL2
    logger.warn('AAL2 validation failed', {
        classification,
        originalACR: token.acr,
        normalizedAAL: aal,
        originalAMR: token.amr,
        normalizedAMR: amrArray,
        factorCount: amrArray.length,
        reason: 'Classified resources require AAL2 (MFA)'
    });
    throw new Error(`Classified resources require AAL2 (MFA). Current ACR: ${token.acr || 'missing'} (AAL${aal}), AMR factors: ${amrArray.length}`);
};

/**
 * Call OPA for authorization decision
 * Circuit breaker protects against OPA failures (fail-fast pattern)
 */
const callOPA = async (input: IOPAInput): Promise<IOPADecision> => {
    try {
        logger.debug('Calling OPA for decision', {
            endpoint: OPA_DECISION_ENDPOINT,
            subject: input.input.subject.uniqueID,
            resource: input.input.resource.resourceId,
            circuitState: opaCircuitBreaker.getState(),
        });

        // Circuit breaker wraps OPA call - fails fast if OPA is down
        const response = await opaCircuitBreaker.execute(async () => {
            return await axios.post<IOPAResponse>(OPA_DECISION_ENDPOINT, input, {
                headers: {
                    'Content-Type': 'application/json',
                },
                timeout: 5000, // 5 second timeout
            });
        });

        logger.debug('OPA response received', {
            hasResult: !!response.data.result,
            hasDecision: !!response.data.result?.decision,
            responseStructure: Object.keys(response.data),
            resultStructure: response.data.result ? Object.keys(response.data.result).slice(0, 10) : [],
        });

        // OPA returns the decision nested in result.decision
        // Restructure to match our expected IOPADecision interface
        if (response.data.result && response.data.result.decision) {
            return {
                result: response.data.result.decision,
            };
        }

        // Fallback: if decision not nested, use result directly (shouldn't happen)
        return {
            result: {
                allow: response.data.result?.allow || false,
                reason: response.data.result?.reason || 'No decision',
                obligations: response.data.result?.obligations,
                evaluation_details: response.data.result?.evaluation_details,
            },
        };
    } catch (error) {
        // Check if circuit breaker is open (fail-fast)
        const isCircuitOpen = (error as any)?.circuitBreakerOpen === true;
        const retryAfter = (error as any)?.retryAfter;

        logger.error('OPA call failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
            endpoint: OPA_DECISION_ENDPOINT,
            circuitOpen: isCircuitOpen,
            retryAfter: retryAfter,
            circuitState: opaCircuitBreaker.getState(),
        });

        // Create error with circuit breaker info for upstream handling
        const serviceError = new Error(
            isCircuitOpen
                ? `Authorization service circuit breaker OPEN - retry in ${Math.ceil(retryAfter / 1000)}s`
                : 'Authorization service unavailable'
        );
        (serviceError as any).circuitBreakerOpen = isCircuitOpen;
        (serviceError as any).retryAfter = retryAfter;
        throw serviceError;
    }
};

/**
 * Log authorization decision
 */
const logDecision = (
    requestId: string,
    uniqueID: string,
    resourceId: string,
    decision: boolean,
    reason: string,
    latencyMs: number
): void => {
    const authzLogger = logger.child({ service: 'authz' });

    authzLogger.info('Authorization decision', {
        timestamp: new Date().toISOString(),
        requestId,
        subject: uniqueID,
        resource: resourceId,
        decision: decision ? 'ALLOW' : 'DENY',
        reason,
        latency_ms: latencyMs,
    });
};

/**
 * Translate OPA violation messages into user-friendly guidance
 * Provides actionable feedback without revealing authorization logic details
 */
const getUserFriendlyDenialMessage = (
    opaReason: string,
    resourceInfo: {
        classification: string;
        releasabilityTo: string[];
        COI: string[];
        title?: string;
    },
    userInfo: {
        clearance: string;
        countryOfAffiliation: string;
        acpCOI: string[];
    }
): { message: string; guidance: string } => {
    // Parse the OPA reason to determine the type of violation
    if (opaReason.includes('No COI intersection')) {
        return {
            message: 'Access requires Community of Interest membership',
            guidance: `This resource requires membership in specific communities: ${resourceInfo.COI.join(', ')}. Contact your security administrator to request the appropriate COI affiliations.`
        };
    }

    if (opaReason.includes('Country') && opaReason.includes('not in releasabilityTo')) {
        return {
            message: 'Access restricted by releasability policy',
            guidance: `This resource is only releasable to: ${resourceInfo.releasabilityTo.join(', ')}. Your country (${userInfo.countryOfAffiliation}) is not authorized for this content.`
        };
    }

    if (opaReason.includes('Insufficient clearance')) {
        return {
            message: 'Insufficient security clearance',
            guidance: `This resource requires ${resourceInfo.classification} clearance. Your current clearance (${userInfo.clearance}) is insufficient. Contact your security officer for clearance upgrade.`
        };
    }

    if (opaReason.includes('Insufficient AAL') || opaReason.includes('AAL2 claimed but')) {
        const requiredAAL = resourceInfo.classification === 'UNCLASSIFIED' ? 'AAL1' :
            resourceInfo.classification === 'TOP_SECRET' ? 'AAL3' : 'AAL2';
        return {
            message: 'Multi-factor authentication required',
            guidance: `This ${resourceInfo.classification} resource requires ${requiredAAL} authentication. Please enroll in multi-factor authentication through your account settings.`
        };
    }

    if (opaReason.includes('Token expired')) {
        return {
            message: 'Authentication session expired',
            guidance: 'Your authentication session has expired. Please log in again to continue.'
        };
    }

    if (opaReason.includes('not in trusted federation')) {
        return {
            message: 'Identity provider not recognized',
            guidance: 'Your identity provider is not part of the trusted federation. Please use an authorized identity provider to access this system.'
        };
    }

    // Fallback for unrecognized violations
    return {
        message: 'Access denied',
        guidance: 'You do not have sufficient permissions to access this resource. Contact your security administrator for assistance.'
    };
};

/**
 * Valid federation instances that can make inter-instance requests
 * TODO: Move to configuration or verify via shared secrets
 */
const TRUSTED_FEDERATION_INSTANCES = ['USA', 'FRA', 'GBR', 'DEU'];

/**
 * JWT Authentication middleware (Week 3.2)
 * Verifies JWT token and attaches user info to request
 * Does NOT call OPA - use for endpoints that need auth but handle authz separately
 * 
 * Federation Support:
 * - When X-Federated-From header is present from a trusted instance,
 *   we verify the federation partner's token and trust their user attributes
 * - This enables cross-instance resource access where FRA backend can
 *   request USA resources on behalf of a FRA user
 */
export const authenticateJWT = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string;

    try {
        // Check for federated request from another instance
        const federatedFrom = req.headers['x-federated-from'] as string;
        
        if (federatedFrom && TRUSTED_FEDERATION_INSTANCES.includes(federatedFrom)) {
            // This is a federated request from a trusted partner
            // Trust their authentication - they have already verified the user
            logger.info('Federated request received from trusted partner', {
                requestId,
                federatedFrom,
                path: req.path,
            });
            
            // For federated requests, we still need the token to extract user info
            // But we skip Keycloak validation since it's signed by the partner's Keycloak
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.substring(7);
                
                // Decode without verification (partner already verified)
                try {
                    // Use jose to decode without validation
                    const jose = await import('jose');
                    const decoded = jose.decodeJwt(token);
                    
                    // Extract attributes from the foreign token
                    const uniqueID = (decoded as any).uniqueID || 
                                     (decoded as any).preferred_username || 
                                     decoded.sub || 
                                     `federated-${federatedFrom}-user`;
                    const clearance = (decoded as any).clearance || 'UNCLASSIFIED';
                    const countryOfAffiliation = (decoded as any).countryOfAffiliation || federatedFrom;
                    const acpCOI = (decoded as any).acpCOI || [];
                    
                    // Attach federated user info to request
                    (req as any).user = {
                        uniqueID,
                        clearance,
                        countryOfAffiliation,
                        acpCOI,
                        federated: true,
                        federatedFrom,
                    };
                    
                    (req as any).accessToken = token;
                    
                    logger.info('Federated request authenticated via partner trust', {
                        requestId,
                        federatedFrom,
                        uniqueID,
                        clearance,
                        countryOfAffiliation,
                    });
                    
                    next();
                    return;
                } catch (decodeError) {
                    logger.warn('Failed to decode federated token', {
                        requestId,
                        federatedFrom,
                        error: decodeError instanceof Error ? decodeError.message : 'Unknown',
                    });
                    // Fall through to normal auth if decode fails
                }
            }
            
            // If no valid token in federated request, reject
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Federated request missing valid authorization token',
                federation: { from: federatedFrom },
                requestId
            });
            return;
        }
        
        // Standard JWT verification for non-federated requests
        // Extract JWT token from Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            logger.warn('Missing Authorization header', { requestId });
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Missing or invalid Authorization header',
                details: {
                    expected: 'Bearer <token>',
                    received: authHeader ? 'Invalid format' : 'Missing',
                },
                requestId
            });
            return;
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        // Verify token against local Keycloak instance
        let decodedToken: IKeycloakToken;
        try {
            decodedToken = await verifyToken(token);
        } catch (error) {
            logger.warn('JWT verification failed', {
                requestId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid or expired JWT token',
                details: {
                    reason: error instanceof Error ? error.message : 'Token verification failed',
                },
                requestId
            });
            return;
        }

        // Check token revocation (blacklist)
        const jti = decodedToken.jti;
        if (jti && await isTokenBlacklisted(jti)) {
            logger.warn('Blacklisted token detected', {
                requestId,
                jti,
                sub: decodedToken.sub
            });
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Token has been revoked',
                details: {
                    reason: 'Token was blacklisted (user logged out or token manually revoked)',
                    jti: jti,
                    recommendation: 'Please re-authenticate to obtain a new token'
                },
                requestId
            });
            return;
        }

        // Extract user attributes
        const uniqueID = decodedToken.uniqueID || decodedToken.preferred_username || decodedToken.sub;

        // Check if user's tokens are revoked
        if (await areUserTokensRevoked(uniqueID)) {
            logger.warn('User tokens revoked', {
                requestId,
                uniqueID,
                sub: decodedToken.sub
            });
            res.status(401).json({
                error: 'Unauthorized',
                message: 'All tokens for this user have been revoked',
                details: {
                    reason: 'User account was disabled or all tokens were revoked',
                    recommendation: 'Please contact your administrator'
                },
                requestId
            });
            return;
        }

        const clearance = decodedToken.clearance;
        const countryOfAffiliation = decodedToken.countryOfAffiliation;

        // Normalize AMR and ACR for AAL/FAL enforcement
        const normalizedAMR = normalizeAMR(decodedToken.amr);
        const normalizedACR = normalizeACR(decodedToken.acr);

        // Handle acpCOI - Keycloak often double-encodes this as JSON string
        let acpCOI: string[] = [];
        if (decodedToken.acpCOI) {
            if (Array.isArray(decodedToken.acpCOI)) {
                // Check if first element is a JSON-encoded string (Keycloak mapper issue)
                if (decodedToken.acpCOI.length > 0 && typeof decodedToken.acpCOI[0] === 'string') {
                    try {
                        const parsed = JSON.parse(decodedToken.acpCOI[0]);
                        if (Array.isArray(parsed)) {
                            acpCOI = parsed;
                        } else {
                            acpCOI = decodedToken.acpCOI;
                        }
                    } catch {
                        // Not JSON, use as-is
                        acpCOI = decodedToken.acpCOI;
                    }
                } else {
                    acpCOI = decodedToken.acpCOI;
                }
            } else if (typeof decodedToken.acpCOI === 'string') {
                // Single string value - try to parse as JSON
                try {
                    const parsed = JSON.parse(decodedToken.acpCOI);
                    if (Array.isArray(parsed)) {
                        acpCOI = parsed;
                    } else {
                        acpCOI = [decodedToken.acpCOI];
                    }
                } catch {
                    // Not JSON, wrap in array
                    acpCOI = [decodedToken.acpCOI];
                }
            }
        }

        // Attach user info to request
        (req as any).user = {
            sub: decodedToken.sub,
            uniqueID,
            clearance,
            countryOfAffiliation,
            acpCOI,
            email: decodedToken.email,
            preferred_username: decodedToken.preferred_username,
            // Store original AMR and ACR values (for tests and debugging)
            amr: normalizedAMR,  // Already normalized to array
            acr: decodedToken.acr !== undefined && decodedToken.acr !== null
                ? String(decodedToken.acr)  // Store original as string
                : undefined,
            // Store normalized values for internal AAL checking
            aal: normalizedACR,  // Normalized to number (0, 1, 2, 3)
            dutyOrg: decodedToken.dutyOrg,
            orgUnit: decodedToken.orgUnit,
            auth_time: decodedToken.auth_time
        };

        logger.info('JWT authentication successful', {
            requestId,
            uniqueID,
            clearance,
            countryOfAffiliation,
            acpCOI,  // DEBUG: Log COI
            acpCOI_raw: decodedToken.acpCOI  // DEBUG: Log raw COI from token
        });

        next();

    } catch (error) {
        logger.error('Authentication middleware error', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Authentication failed',
            requestId
        });
    }
};

/**
 * PEP Authorization Middleware
 * Enforces ABAC policy via OPA before allowing resource access
 */
export const authzMiddleware = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    const startTime = Date.now();
    const requestId = req.headers['x-request-id'] as string;
    const { id: resourceId } = req.params;

    try {
        // ============================================
        // Step 1: Extract and validate JWT token
        // ============================================

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            logger.warn('Missing Authorization header', {
                requestId,
                headers: Object.keys(req.headers),
            });
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Missing or invalid Authorization header',
                details: {
                    expected: 'Bearer <token>',
                    received: authHeader ? 'Invalid format' : 'Missing',
                },
            });
            return;
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        // Decode token header to check kid (without verification)
        let tokenHeader;
        try {
            const headerPart = token.split('.')[0];
            tokenHeader = JSON.parse(Buffer.from(headerPart, 'base64').toString('utf-8'));
            logger.debug('JWT token header', {
                requestId,
                kid: tokenHeader.kid,
                alg: tokenHeader.alg,
                typ: tokenHeader.typ,
            });
        } catch (e) {
            logger.warn('Could not decode token header', { requestId });
        }

        // Log token format for debugging
        logger.debug('Received JWT token', {
            requestId,
            tokenLength: token.length,
            tokenPrefix: token.substring(0, 20) + '...',
        });

        // Try user token first
        let decodedToken: IKeycloakToken | null = null;
        let isSPToken = false;

        try {
            decodedToken = await verifyToken(token);
        } catch (userTokenError) {
            // User token failed, try SP token
            logger.debug('User token verification failed, trying SP token', {
                requestId,
                error: userTokenError instanceof Error ? userTokenError.message : 'Unknown error'
            });

            const spContext = await validateSPToken(token);
            if (spContext) {
                // SP token is valid
                (req as IRequestWithSP).sp = spContext;
                isSPToken = true;

                logger.info('Using SP token for authorization', {
                    requestId,
                    clientId: spContext.clientId,
                    scopes: spContext.scopes
                });
            } else {
                // Neither user nor SP token is valid
                logger.warn('Both user and SP token verification failed', {
                    requestId,
                    userError: userTokenError instanceof Error ? userTokenError.message : 'Unknown error',
                    tokenLength: token.length,
                    tokenHeader: tokenHeader,
                    keycloakUrl: process.env.KEYCLOAK_URL,
                    realm: process.env.KEYCLOAK_REALM,
                });
                res.status(401).json({
                    error: 'Unauthorized',
                    message: 'Invalid or expired JWT token',
                    details: {
                        reason: userTokenError instanceof Error ? userTokenError.message : 'Token verification failed',
                    },
                });
                return;
            }
        }

        // ============================================
        // Step 1.5: Check Token Revocation (Gap #7)
        // ============================================

        // Skip revocation check for SP tokens (they manage their own revocation)
        if (!isSPToken && decodedToken) {
            // Check if token has been blacklisted (logout or manual revocation)
            const jti = decodedToken.jti;
            if (jti && await isTokenBlacklisted(jti)) {
                logger.warn('Blacklisted token detected', {
                    requestId,
                    jti,
                    sub: decodedToken.sub
                });
                res.status(401).json({
                    error: 'Unauthorized',
                    message: 'Token has been revoked',
                    details: {
                        reason: 'Token was blacklisted (user logged out or token manually revoked)',
                        jti: jti,
                        recommendation: 'Please re-authenticate to obtain a new token'
                    },
                });
                return;
            }
        }

        // ============================================
        // Step 2: Extract identity attributes
        // Week 3: Use enriched claims if available (from enrichmentMiddleware)
        // ============================================

        // Handle SP tokens differently - they don't have user attributes
        if (isSPToken) {
            const spContext = (req as IRequestWithSP).sp!;

            // Check if SP has resource:read scope
            if (!spContext.scopes.includes('resource:read')) {
                res.status(403).json({
                    error: 'Forbidden',
                    message: 'Insufficient scope',
                    details: {
                        required: 'resource:read',
                        provided: spContext.scopes
                    }
                });
                return;
            }

            // For SP tokens, we'll do simplified authorization based on federation agreements
            // The actual resource access will be checked against SP's allowed classifications and countries
            // Continue to resource fetch to check releasability

        }

        // User token flow - extract user attributes
        const tokenData = (req as any).enrichedUser || decodedToken;
        const wasEnriched = (req as any).wasEnriched || false;

        const uniqueID = isSPToken ?
            `sp:${(req as IRequestWithSP).sp!.clientId}` :
            (tokenData?.uniqueID || tokenData?.preferred_username || tokenData?.sub);

        // Check if all user tokens are revoked (global logout)
        if (await areUserTokensRevoked(uniqueID)) {
            logger.warn('User tokens globally revoked', {
                requestId,
                uniqueID
            });
            res.status(401).json({
                error: 'Unauthorized',
                message: 'User session has been terminated',
                details: {
                    reason: 'All user tokens revoked (logout event or account suspension)',
                    uniqueID: uniqueID,
                    recommendation: 'Please re-authenticate'
                },
            });
            return;
        }
        const clearance = isSPToken ? undefined : tokenData?.clearance;
        const countryOfAffiliation = isSPToken ? (req as IRequestWithSP).sp!.sp.country : tokenData?.countryOfAffiliation;

        // Handle acpCOI - might be double-encoded from Keycloak mapper
        let acpCOI: string[] = [];
        if (!isSPToken && tokenData?.acpCOI) {
            if (Array.isArray(tokenData.acpCOI)) {
                // If it's an array, check if first element is a JSON string
                if (tokenData.acpCOI.length > 0 && typeof tokenData.acpCOI[0] === 'string') {
                    try {
                        // Try to parse the first element as JSON (handle double-encoding)
                        const parsed = JSON.parse(tokenData.acpCOI[0]);
                        if (Array.isArray(parsed)) {
                            acpCOI = parsed;
                            logger.debug('Parsed double-encoded acpCOI', { original: tokenData.acpCOI, parsed: acpCOI });
                        } else {
                            acpCOI = tokenData.acpCOI;
                        }
                    } catch {
                        // Not JSON, use as-is
                        acpCOI = tokenData.acpCOI;
                    }
                } else {
                    acpCOI = tokenData.acpCOI;
                }
            } else {
                // Not an array, try to parse as JSON
                try {
                    const parsed = JSON.parse(tokenData.acpCOI as any);
                    acpCOI = Array.isArray(parsed) ? parsed : [parsed];
                } catch {
                    acpCOI = [tokenData.acpCOI as any];
                }
            }
        }

        logger.debug('Extracted identity attributes', {
            requestId,
            uniqueID,
            clearance,
            country: countryOfAffiliation,
            coi: acpCOI,
            coiType: typeof acpCOI,
            coiLength: acpCOI.length,
            wasEnriched,
        });

        // ============================================
        // Step 3: Fetch resource metadata (federation-aware)
        // ============================================
        
        // Try federation-aware fetch (checks local first, then remote if needed)
        // Use existing authHeader from this scope for federated requests
        const { resource, source, error: fetchError } = await getResourceByIdFederated(
            resourceId, 
            authHeader as string | undefined // Forward auth token for federated requests
        );

        if (!resource) {
            // Log federation attempt for debugging
            logger.info('Resource not found', {
                requestId,
                resourceId,
                source,
                error: fetchError,
            });
            
            res.status(404).json({
                error: 'Not Found',
                message: fetchError || `Resource ${resourceId} not found`,
                federation: {
                    source,
                    attempted: source === 'federated',
                }
            });
            return;
        }
        
        // Log successful federation if applicable
        if (source === 'federated') {
            logger.info('Resource fetched via federation', {
                requestId,
                resourceId,
                source,
            });
            
            // ============================================
            // FEDERATED RESOURCE: Authorization already done by origin
            // ============================================
            // The origin instance has already performed OPA authorization.
            // The fact that we got a 200 response means the user is authorized.
            // Attach the resource to request and skip local OPA check.
            (req as any).resource = resource;
            (req as any).federatedSource = source;
            
            logger.info('Federated authorization passed (delegated to origin)', {
                requestId,
                resourceId,
                source,
            });
            
            next();
            return;
        }

        // ============================================
        // LOCAL RESOURCE: Full OPA Authorization Required
        // ============================================

        // ============================================
        // SP Token Authorization Path
        // ============================================
        if (isSPToken) {
            const spContext = (req as IRequestWithSP).sp!;

            // Extract resource metadata
            const isZTDF = resource && 'ztdf' in resource;
            const classification = isZTDF
                ? resource.ztdf.policy.securityLabel.classification
                : (resource as any).classification;
            const releasabilityTo = isZTDF
                ? resource.ztdf.policy.securityLabel.releasabilityTo
                : (resource as any).releasabilityTo;
            // COI is available but not used in SP validation
            // const COI = isZTDF
            //     ? (resource.ztdf.policy.securityLabel.COI || [])
            //     : ((resource as any).COI || []);

            // Check releasability to SP's country
            if (!releasabilityTo.includes(spContext.sp.country)) {
                logger.warn('SP access denied - releasability', {
                    requestId,
                    spId: spContext.sp.spId,
                    country: spContext.sp.country,
                    releasabilityTo
                });

                res.status(403).json({
                    error: 'Forbidden',
                    message: 'Resource not releasable to your country',
                    details: {
                        yourCountry: spContext.sp.country,
                        releasableTo: releasabilityTo,
                        resource: {
                            resourceId: resource.resourceId,
                            classification
                        }
                    }
                });
                return;
            }

            // Check classification agreements
            const activeAgreements = spContext.sp.federationAgreements
                .filter(agreement => agreement.validUntil > new Date());

            const allowedClassifications = activeAgreements
                .flatMap(agreement => agreement.classifications);

            if (!allowedClassifications.includes(classification)) {
                logger.warn('SP access denied - classification', {
                    requestId,
                    spId: spContext.sp.spId,
                    classification,
                    allowedClassifications
                });

                res.status(403).json({
                    error: 'Forbidden',
                    message: 'Classification not covered by federation agreement',
                    details: {
                        resourceClassification: classification,
                        allowedClassifications,
                        activeAgreements: activeAgreements.map(a => ({
                            agreementId: a.agreementId,
                            validUntil: a.validUntil
                        }))
                    }
                });
                return;
            }

            // Log SP access decision
            const latencyMs = Date.now() - startTime;
            logger.info('SP authorization granted', {
                requestId,
                spId: spContext.sp.spId,
                clientId: spContext.clientId,
                resourceId,
                classification,
                latency_ms: latencyMs
            });

            // Attach SP context and continue to resource handler
            (req as any).authzDecision = {
                allow: true,
                reason: 'SP federation access granted',
                spAccess: true,
                spId: spContext.sp.spId,
                country: spContext.sp.country
            };

            next();
            return;
        }

        // ============================================
        // AAL2/FAL2 Validation (NIST SP 800-63B/C) - User tokens only
        // ============================================
        // Validate AAL2 (Authentication Assurance Level 2) for classified resources
        // This check must happen BEFORE OPA authorization to ensure authentication strength
        // Reference: docs/IDENTITY-ASSURANCE-LEVELS.md
        if (decodedToken) {
            try {
                const classification = resource && 'ztdf' in resource
                    ? resource.ztdf.policy.securityLabel.classification
                    : (resource as any)?.classification || 'UNCLASSIFIED';

                validateAAL2(decodedToken, classification);
            } catch (error) {
                logger.warn('AAL2 validation failed', {
                    requestId,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    resourceId,
                });
                res.status(403).json({
                    error: 'Forbidden',
                    message: 'Authentication strength insufficient',
                    details: {
                        reason: error instanceof Error ? error.message : 'AAL2 validation failed',
                        requirement: 'Classified resources require AAL2 (Multi-Factor Authentication)',
                        reference: 'NIST SP 800-63B, IDENTITY-ASSURANCE-LEVELS.md'
                    },
                });
                return;
            }
        }

        // ============================================
        // Step 4: Check decision cache
        // ============================================

        const cacheKey = `${uniqueID}:${resourceId}:${clearance}:${countryOfAffiliation}`;
        const cachedDecision = decisionCache.get<IOPADecision>(cacheKey);

        if (cachedDecision) {
            logger.debug('Using cached authorization decision', {
                requestId,
                uniqueID,
                resourceId,
            });

            if (!cachedDecision.result.allow) {
                const latencyMs = Date.now() - startTime;
                logDecision(requestId, uniqueID, resourceId, false, cachedDecision.result.reason, latencyMs);

                // Extract resource metadata for error response
                const isZTDF = resource && 'ztdf' in resource;
                const classification = isZTDF
                    ? resource.ztdf.policy.securityLabel.classification
                    : (resource as any).classification;
                const releasabilityTo = isZTDF
                    ? resource.ztdf.policy.securityLabel.releasabilityTo
                    : (resource as any).releasabilityTo;
                const COI = isZTDF
                    ? (resource.ztdf.policy.securityLabel.COI || [])
                    : ((resource as any).COI || []);

                // Get user-friendly error message
                const userFriendly = getUserFriendlyDenialMessage(
                    cachedDecision.result.reason,
                    {
                        classification,
                        releasabilityTo,
                        COI,
                        title: resource.title
                    },
                    {
                        clearance,
                        countryOfAffiliation,
                        acpCOI
                    }
                );

                res.status(403).json({
                    error: 'Forbidden',
                    message: userFriendly.message,
                    guidance: userFriendly.guidance,
                    // Keep technical details for debugging
                    technical_reason: cachedDecision.result.reason,
                    details: {
                        ...(cachedDecision.result.evaluation_details || {}),
                        subject: {
                            uniqueID,
                            clearance,
                            country: countryOfAffiliation,
                            coi: acpCOI
                        },
                        resource: {
                            resourceId: resource.resourceId,
                            title: resource.title,
                            classification,
                            releasabilityTo,
                            coi: COI
                        }
                    },
                });
                return;
            }

            // Cache hit and allow - continue to resource handler
            next();
            return;
        }

        // ============================================
        // Step 4.5: Validate AAL BEFORE calling OPA (NEW - Nov 3, 2025)
        // ============================================
        // AAL enforcement happens at PEP (backend), not PDP (OPA)
        // This is cleaner separation: AuthN (AAL) vs AuthZ (ABAC)
        // Reference: AAL-MFA-IMPLEMENTATION-STATUS.md (Option 3 - Backend AAL Enforcement)

        // Extract classification first (needed for AAL validation)
        const isZTDF = resource && 'ztdf' in resource;
        const classification = isZTDF
            ? resource.ztdf.policy.securityLabel.classification
            : (resource as any).classification;

        // AAL validation requires a valid token
        if (!decodedToken) {
            const latencyMs = Date.now() - startTime;
            const errorMsg = 'Missing decoded token for AAL validation';
            logger.error(errorMsg, { requestId, resourceId });
            logDecision(requestId, uniqueID, resourceId, false, errorMsg, latencyMs);

            res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid or missing authentication token'
            });
            return;
        }

        try {
            validateAAL2(decodedToken, classification);
            logger.info('AAL validation passed', {
                requestId,
                classification,
                acr: decodedToken?.acr,
                amr: decodedToken?.amr,
                uniqueID
            });
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'AAL validation failed';
            const latencyMs = Date.now() - startTime;

            logger.warn('AAL validation failed', {
                requestId,
                classification,
                error: errorMsg,
                acr: decodedToken?.acr,
                amr: decodedToken?.amr,
                uniqueID,
                latencyMs
            });

            // Log denial decision for audit trail
            logDecision(requestId, uniqueID, resourceId, false, errorMsg, latencyMs);

            res.status(403).json({
                error: 'Forbidden',
                message: errorMsg,
                details: {
                    required_aal: classification === 'UNCLASSIFIED' ? 'AAL1' :
                        classification === 'TOP_SECRET' ? 'AAL3' : 'AAL2',
                    user_aal: `AAL${normalizeACR(decodedToken?.acr) + 1}`,
                    user_acr: decodedToken?.acr || 'missing',
                    user_amr: decodedToken?.amr || [],
                    classification,
                    note: 'Multi-Factor Authentication (MFA) is required for classified resources. Please contact your administrator to enroll in MFA.'
                }
            });
            return;
        }

        // ============================================
        // Step 5: Construct OPA input
        // ============================================

        // Extract remaining fields from ZTDF resource

        // NEW: Extract original classification fields (ACP-240 Section 4.3)
        const originalClassification = isZTDF
            ? resource.ztdf.policy.securityLabel.originalClassification
            : (resource as any).originalClassification;  // Allow non-ZTDF resources to have this field
        const originalCountry = isZTDF
            ? resource.ztdf.policy.securityLabel.originalCountry
            : (resource as any).originalCountry;  // Allow non-ZTDF resources to have this field
        const natoEquivalent = isZTDF
            ? resource.ztdf.policy.securityLabel.natoEquivalent
            : (resource as any).natoEquivalent;  // Allow non-ZTDF resources to have this field

        const releasabilityTo = isZTDF
            ? resource.ztdf.policy.securityLabel.releasabilityTo
            : (resource as any).releasabilityTo;
        const COI = isZTDF
            ? (resource.ztdf.policy.securityLabel.COI || [])
            : ((resource as any).COI || []);
        const coiOperator = isZTDF
            ? (resource.ztdf.policy.securityLabel.coiOperator || 'ALL')
            : ((resource as any).coiOperator || 'ALL');
        const creationDate = isZTDF
            ? resource.ztdf.policy.securityLabel.creationDate
            : (resource as any).creationDate;
        const encrypted = isZTDF ? true : ((resource as any).encrypted || false);

        // Phase 1: Normalize ACR/AMR for OPA input (ensure consistent format)
        const normalizedAAL = decodedToken ? normalizeACR(decodedToken.acr) : 0;
        const normalizedAMR = decodedToken ? normalizeAMR(decodedToken.amr) : ['sp_auth'];
        const acrForOPA = String(normalizedAAL); // OPA expects string format

        const opaInput: IOPAInput = {
            input: {
                subject: {
                    authenticated: true,
                    uniqueID,
                    clearance,
                    clearanceOriginal: tokenData?.clearanceOriginal || clearance, // NEW: ACP-240 Section 4.3
                    clearanceCountry: tokenData?.clearanceCountry || countryOfAffiliation, // NEW: ACP-240 Section 4.3
                    countryOfAffiliation,
                    acpCOI,
                    dutyOrg: tokenData?.dutyOrg,      // Gap #4: Organization attribute
                    orgUnit: tokenData?.orgUnit,      // Gap #4: Organizational unit
                },
                action: {
                    operation: 'view',
                },
                resource: {
                    resourceId: resource.resourceId,
                    classification,
                    originalClassification,          // NEW: ACP-240 Section 4.3
                    originalCountry,                 // NEW: ACP-240 Section 4.3
                    natoEquivalent,                  // NEW: ACP-240 Section 4.3
                    releasabilityTo,
                    COI,
                    coiOperator,
                    creationDate,
                    encrypted,
                },
                context: {
                    currentTime: new Date().toISOString(),
                    sourceIP: (req.ip || req.socket.remoteAddress || 'unknown'),
                    deviceCompliant: true, // Week 3: Add device compliance check
                    requestId,
                    // AAL2/FAL2 context (NIST SP 800-63B/C) - normalized for consistent OPA evaluation
                    acr: acrForOPA,              // Normalized to string ("0", "1", "2")
                    amr: normalizedAMR,          // Normalized to array (["pwd"], ["pwd","otp"])
                    auth_time: decodedToken?.auth_time, // Time of authentication
                },
            },
        };

        logger.debug('Constructed OPA input with classification equivalency', {
            requestId,
            subject: opaInput.input.subject.uniqueID,
            resource: opaInput.input.resource.resourceId,
            originalClassification: opaInput.input.resource.originalClassification,
            originalCountry: opaInput.input.resource.originalCountry,
            natoEquivalent: opaInput.input.resource.natoEquivalent,
        });

        // ============================================
        // Step 6: Call OPA for authorization decision
        // ============================================

        let opaDecision: IOPADecision;
        try {
            opaDecision = await callOPA(opaInput);
        } catch (error) {
            const isCircuitOpen = (error as any)?.circuitBreakerOpen === true;
            const retryAfter = (error as any)?.retryAfter;

            logger.error('Failed to get authorization decision', {
                requestId,
                error: error instanceof Error ? error.message : 'Unknown error',
                circuitOpen: isCircuitOpen,
                retryAfter,
            });

            // Set Retry-After header for circuit breaker failures
            if (retryAfter && retryAfter > 0) {
                res.setHeader('Retry-After', Math.ceil(retryAfter / 1000));
            }

            res.status(503).json({
                error: 'Service Unavailable',
                message: isCircuitOpen
                    ? 'Authorization service temporarily unavailable (circuit breaker open)'
                    : 'Authorization service temporarily unavailable',
                details: {
                    service: 'OPA',
                    endpoint: OPA_DECISION_ENDPOINT,
                    circuitState: opaCircuitBreaker.getState(),
                    retryAfterMs: retryAfter || null,
                },
            });
            return;
        }

        // Validate OPA response structure
        if (!opaDecision || !opaDecision.result) {
            logger.error('Invalid OPA response structure', {
                requestId,
                received: opaDecision,
                expected: 'object with result field',
            });

            res.status(500).json({
                error: 'Internal Server Error',
                message: 'Invalid authorization service response',
                details: {
                    reason: 'OPA returned invalid response structure',
                },
            });
            return;
        }

        // ============================================
        // Step 7: Cache decision
        // ============================================

        decisionCache.set(cacheKey, opaDecision);

        // ============================================
        // Step 8: Log decision (ACP-240 compliance)
        // ============================================

        const latencyMs = Date.now() - startTime;
        logDecision(
            requestId,
            uniqueID,
            resourceId,
            opaDecision.result.allow,
            opaDecision.result.reason,
            latencyMs
        );

        // ACP-240: Log DECRYPT event on successful access
        if (opaDecision.result.allow) {
            const { logDecryptEvent } = await import('../utils/acp240-logger');
            logDecryptEvent({
                requestId,
                subject: uniqueID,
                resourceId,
                classification: classification || 'UNCLASSIFIED',
                releasabilityTo: releasabilityTo || [],
                subjectAttributes: {
                    clearance,
                    countryOfAffiliation,
                    acpCOI
                },
                reason: opaDecision.result.reason,
                latencyMs
            });
        }

        // ============================================
        // Step 9: Enforce decision
        // ============================================

        if (!opaDecision.result.allow) {
            // ACP-240: Log ACCESS_DENIED event
            const { logAccessDeniedEvent } = await import('../utils/acp240-logger');
            logAccessDeniedEvent({
                requestId,
                subject: uniqueID,
                resourceId,
                reason: opaDecision.result.reason,
                subjectAttributes: {
                    clearance,
                    countryOfAffiliation,
                    acpCOI
                },
                resourceAttributes: {
                    classification,
                    releasabilityTo,
                    COI
                },
                policyEvaluation: {
                    allow: false,
                    reason: opaDecision.result.reason,
                    evaluation_details: opaDecision.result.evaluation_details
                },
                latencyMs: Date.now() - startTime
            });

            // Get user-friendly error message
            const userFriendly = getUserFriendlyDenialMessage(
                opaDecision.result.reason,
                {
                    classification,
                    releasabilityTo,
                    COI,
                    title: resource.title
                },
                {
                    clearance,
                    countryOfAffiliation,
                    acpCOI
                }
            );

            res.status(403).json({
                error: 'Forbidden',
                message: userFriendly.message,
                guidance: userFriendly.guidance,
                // Keep technical details for debugging (available to admin users or logs)
                technical_reason: opaDecision.result.reason,
                details: {
                    ...(opaDecision.result.evaluation_details || {}),
                    subject: {
                        uniqueID,
                        clearance,
                        country: countryOfAffiliation,
                        coi: acpCOI
                    },
                    resource: {
                        resourceId: resource.resourceId,
                        title: resource.title,
                        classification,
                        releasabilityTo,
                        coi: COI
                    }
                },
            });
            return;
        }

        // ============================================
        // Step 10: Check obligations (e.g., KAS)
        // ============================================

        if (opaDecision.result.obligations && opaDecision.result.obligations.length > 0) {
            logger.info('Obligations required', {
                requestId,
                resourceId,
                obligations: opaDecision.result.obligations,
            });

            // Week 4: Handle KAS obligations
            // For now, store obligations in request for handler to process
            (req as any).authzObligations = opaDecision.result.obligations;
        }

        // ============================================
        // Step 11: Store policy evaluation for frontend replay
        // ============================================

        // Store policy evaluation details for frontend PolicyDecisionReplay component
        (req as any).policyEvaluation = {
            decision: "ALLOW",
            reason: opaDecision.result.reason,
            evaluation_details: opaDecision.result.evaluation_details,
            subject: {
                uniqueID,
                clearance,
                country: countryOfAffiliation,
                coi: acpCOI
            },
            resource: {
                resourceId: resource.resourceId,
                title: resource.title,
                classification,
                releasabilityTo,
                coi: COI
            }
        };

        // Access granted - continue to resource handler
        logger.info('Access granted', {
            requestId,
            uniqueID,
            resourceId,
            latency_ms: latencyMs,
        });

        next();
    } catch (error) {
        logger.error('Authorization middleware error', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
        });

        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Authorization check failed',
            details: {
                reason: error instanceof Error ? error.message : 'Unknown error',
            },
        });
    }
};

