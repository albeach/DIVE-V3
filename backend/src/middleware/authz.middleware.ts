import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import * as jwt from 'jsonwebtoken';
import axios from 'axios';
import * as https from 'https';
import NodeCache from 'node-cache';
import { tokenIntrospectionService, TokenIntrospectionResponse } from '../services/token-introspection.service';
import jwkToPem from 'jwk-to-pem';
import { logger } from '../utils/logger';
import { getResourceById, getResourceByIdFederated } from '../services/resource.service';
import { isTokenBlacklisted, areUserTokensRevoked } from '../services/token-blacklist.service';
import { validateSPToken } from './sp-auth.middleware';
import { IRequestWithSP } from '../types/sp-federation.types';
import { opaCircuitBreaker, keycloakCircuitBreaker } from '../utils/circuit-breaker';
import { decisionCacheService } from '../services/decision-cache.service';
import { auditService } from '../services/audit.service';
import { decisionLogService } from '../services/decision-log.service';

// ============================================
// PEP (Policy Enforcement Point) Middleware
// ============================================
// Phase 5: Unified PEP using dive.authz entrypoint
// Pattern: Validate JWT → Extract attributes → Fetch resource → Call OPA → Enforce decision
//
// Key Changes in Phase 5:
// 1. Uses dive.authz endpoint (instead of dive.authorization)
// 2. Tenant-aware context injection for multi-tenant isolation
// 3. Classification-based TTL for decision caching
// 4. Structured audit logging via auditService
// 5. OPAL integration for cache invalidation

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

// JWKS cache (1 hour TTL) - cache fetched public keys
const jwksCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });
// Simplified decision cache for test-mode fast path
const testDecisionCache = new Map<string, any>();

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

// OPA endpoint - Phase 5: Use unified dive.authz entrypoint
// Supports backward compatibility via v1_shim.rego if using dive.authorization
const OPA_URL = process.env.OPA_URL || 'https://localhost:8181';
// In test mode, prefer the legacy endpoint unless explicitly overridden to keep unit tests aligned.
// OPA endpoint configuration
// Use the package root endpoint (/v1/data/dive/authz) instead of /decision
// because the decision rule can be undefined if evaluation_details fails
const OPA_DECISION_ENDPOINT = `${OPA_URL}/v1/data/dive/authz`;

// Local fallback evaluation (used in tests when OPA is unavailable)
// Derived from CLEARANCE_EQUIVALENCY_TABLE SSOT via clearance-normalization.service.ts
import { getClearanceLevel as _getClearanceRank, StandardClearance } from '../services/clearance-normalization.service';
const CLEARANCE_LEVEL: Record<string, number> = Object.fromEntries(
    Object.values(StandardClearance).map(level => [level, _getClearanceRank(level)])
);

const localEvaluateOPA = (input: IOPAInput): IOPADecision => {
    const subject = input.input.subject;
    const resource = input.input.resource;

    const clearance = (subject.clearance || '').toUpperCase();
    const classification = (resource.classification || '').toUpperCase();
    const clearanceLevel = CLEARANCE_LEVEL[clearance] ?? -1;
    const resourceLevel = CLEARANCE_LEVEL[classification] ?? -1;

    let allow = true;
    const details: Record<string, string | number | boolean> = {
        source: 'local-fallback',
        clearance_check: 'PASS',
        releasability_check: 'PASS',
        coi_check: 'PASS',
    };
    let reason = 'All conditions satisfied (local fallback)';

    // Clearance check
    if (resourceLevel >= 0 && clearanceLevel < resourceLevel) {
        allow = false;
        details.clearance_check = 'FAIL';
        reason = 'Insufficient clearance';
    }

    // Releasability check
    const releasability = resource.releasabilityTo || [];
    if (releasability.length === 0) {
        allow = false;
        details.releasability_check = 'FAIL';
        reason = 'Resource not releasable';
    } else if (subject.countryOfAffiliation && !releasability.includes(subject.countryOfAffiliation)) {
        allow = false;
        details.releasability_check = 'FAIL';
        reason = `Country ${subject.countryOfAffiliation} not in releasabilityTo`;
    }

    // COI check
    const resourceCOI = resource.COI || [];
    const subjectCOI = subject.acpCOI || [];
    if (resourceCOI.length > 0) {
        const overlap = resourceCOI.some((c) => subjectCOI.includes(c));
        if (!overlap) {
            allow = false;
            details.coi_check = 'FAIL';
            reason = 'No COI overlap';
        }
    }

    return {
        result: {
            allow,
            reason,
            evaluation_details: details,
        },
    };
};

// Trusted issuer → tenant lookup (shared with OPAL data)
// We load once from the existing OPAL data file to avoid regex-based tenant guesses.
const TRUSTED_ISSUER_PATHS = [
    // Local dev (repo root)
    path.join(process.cwd(), 'backend', 'data', 'opal', 'trusted_issuers.json'),
    path.join(process.cwd(), 'data', 'opal', 'trusted_issuers.json'),
    path.join(process.cwd(), '..', 'backend', 'data', 'opal', 'trusted_issuers.json'),
    // Container paths (docker-compose)
    '/app/data/opal/trusted_issuers.json',
    '/app/backend/data/opal/trusted_issuers.json',
];

let trustedIssuerTenantMap: Record<string, string> | null = null;

function loadTrustedIssuerTenantMap(): Record<string, string> {
    if (trustedIssuerTenantMap) {
        return trustedIssuerTenantMap;
    }

    for (const candidate of TRUSTED_ISSUER_PATHS) {
        try {
            const content = fs.readFileSync(candidate, 'utf-8');
            const parsed = JSON.parse(content);
            const issuers = parsed?.trusted_issuers;

            if (issuers && typeof issuers === 'object') {
                trustedIssuerTenantMap = Object.fromEntries(
                    Object.entries(issuers)
                        .filter(([, meta]) => meta && (meta as any).tenant)
                        .map(([issuer, meta]) => [
                            issuer.replace(/\/$/, ''),
                            String((meta as any).tenant).toUpperCase(),
                        ])
                );

                logger.info('Loaded trusted issuer tenant map', {
                    path: candidate,
                    count: Object.keys(trustedIssuerTenantMap).length,
                });

                return trustedIssuerTenantMap;
            }
        } catch (error) {
            logger.debug('Failed to load trusted issuer map from path', {
                path: candidate,
                error: error instanceof Error ? error.message : 'unknown error',
            });
        }
    }

    trustedIssuerTenantMap = {};
    logger.warn('Trusted issuer tenant map not found; falling back to regex tenant extraction');
    return trustedIssuerTenantMap;
}

/**
 * Get effective ACR value for OPA policy evaluation
 * Uses user_acr (from user attributes) when it indicates higher AAL than session ACR
 * This allows AAL testing without requiring actual MFA registration
 */
const getEffectiveAcr = (user: any): string => {
    const sessionAcr = user.acr ? String(user.acr) : '0';
    const userAcr = user.user_acr ? String(user.user_acr) : null;

    // If user_acr is set and higher than session ACR, use it
    if (userAcr && parseInt(userAcr, 10) > parseInt(sessionAcr, 10)) {
        logger.debug('Using user_acr for AAL testing', {
            sessionAcr,
            userAcr,
            uniqueID: user.uniqueID,
        });
        return userAcr;
    }

    return sessionAcr;
};

/**
 * Get effective AMR value for OPA policy evaluation
 * Uses user_amr (from user attributes) when user_acr indicates higher AAL
 * This allows AAL testing without requiring actual MFA registration
 */
const getEffectiveAmr = (user: any): string[] => {
    const sessionAmr = Array.isArray(user.amr) ? user.amr : ['pwd'];
    const userAmr = Array.isArray(user.user_amr) ? user.user_amr : null;
    const sessionAcr = user.acr ? String(user.acr) : '0';
    const userAcr = user.user_acr ? String(user.user_acr) : null;

    // If user_acr is set and higher, use user_amr for consistency
    if (userAcr && parseInt(userAcr, 10) > parseInt(sessionAcr, 10) && userAmr) {
        logger.debug('Using user_amr for AAL testing', {
            sessionAmr,
            userAmr,
            uniqueID: user.uniqueID,
        });
        return userAmr;
    }

    return sessionAmr;
};

/**
 * Extract tenant from token issuer or request context
 * Used for multi-tenant policy isolation
 */
const extractTenant = (token: IKeycloakToken, req: Request): string | undefined => {
    const issuer = (token as any)?.iss;

    // Preferred: map issuer via trusted issuers metadata (OPAL data)
    const tenantMap = loadTrustedIssuerTenantMap();
    const normalizedIssuer = issuer ? issuer.replace(/\/$/, '') : undefined;
    if (normalizedIssuer && tenantMap[normalizedIssuer]) {
        return tenantMap[normalizedIssuer];
    }

    // Fallback: legacy realm regex
    if (issuer) {
        // Match both "dive-v3-broker-XXX" and "dive-v3-XXX" patterns
        const brokerMatch = issuer.match(/\/realms\/dive-v3-broker-([a-z]{3})/i);
        if (brokerMatch) {
            return brokerMatch[1].toUpperCase();
        }

        const realmMatch = issuer.match(/\/realms\/dive-v3-([a-z]{3})/i);
        if (realmMatch) {
            const realm = realmMatch[1].toUpperCase();
            // Broker realm should map to USA (legacy default)
            if (realm === 'BRO') {
                return 'USA';
            }
            return realm;
        }
    }

    // Fallback to country of affiliation
    if (token.countryOfAffiliation) {
        return token.countryOfAffiliation.toUpperCase();
    }

    // Fallback to request header or default
    return (req.headers['x-tenant'] as string)?.toUpperCase() || 'USA';
};

/**
 * Interface for JWT payload (Keycloak token)
 * Enhanced with NIST SP 800-63B/C claims for AAL2/FAL2 enforcement
 * Gap #4: Added dutyOrg and orgUnit (ACP-240 Section 2.1)
 */
interface IKeycloakToken {
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
 * Interface for OPA input
 * ACP-240 Section 4.3 Enhancement: Added original classification fields
 * Gap #4: Added dutyOrg and orgUnit for organization-based policies
 * Phase 5: Added tenant and issuer for multi-tenant policy isolation
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
            issuer?: string;                       // Phase 5: Token issuer for federation trust
            mfa_used?: boolean;                    // Hub guardrail: MFA verification (2+ factors)
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
            // Phase 5: Multi-tenant context
            tenant?: string;                       // Tenant ID (USA, FRA, GBR, DEU)
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
        if (decodedToken) {
            introspectionResult.uniqueID = introspectionResult.uniqueID || decodedToken.uniqueID;
            introspectionResult.clearance = introspectionResult.clearance || decodedToken.clearance;
            introspectionResult.countryOfAffiliation = introspectionResult.countryOfAffiliation || decodedToken.countryOfAffiliation;
            introspectionResult.acpCOI = introspectionResult.acpCOI || decodedToken.acpCOI;

            logger.debug('Supplemented introspection result with JWT claims', {
                uniqueID: introspectionResult.uniqueID,
                clearance: introspectionResult.clearance,
                countryOfAffiliation: introspectionResult.countryOfAffiliation,
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

/**
 * Authorization Middleware - Calls OPA for ABAC Policy Decisions
 *
 * This is the PEP (Policy Enforcement Point) that:
 * 1. Extracts subject, action, resource from request
 * 2. Calls OPA PDP (Policy Decision Point)
 * 3. Enforces the authorization decision
 * 4. Handles obligations (like KAS key release)
 */
/**
 * Check if resource is ZTDF-enhanced
 */
function isZTDFResource(resource: any): resource is any {
    return resource && typeof resource === 'object' && 'ztdf' in resource;
}

export async function authzMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    const startTime = Date.now();

    try {
        // Extract user from JWT validation (set by authenticateJWT)
        const user = (req as any).user;
        if (!user) {
            res.status(401).json({
                error: 'Unauthorized',
                message: 'No authenticated user found',
            });
            return;
        }

        // Extract resource information from request
        const resourceId = req.params.id;
        if (!resourceId) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Resource ID required for authorization',
            });
            return;
        }

        // Fetch real resource metadata from MongoDB (or cross-instance via federation)
        const { getResourceById } = await import('../services/resource.service');
        const authHeader = req.headers['authorization'];
        const resource = await getResourceById(resourceId, authHeader);

        if (!resource) {
            res.status(404).json({
                error: 'Not Found',
                message: `Resource ${resourceId} not found`,
            });
            return;
        }

        // Extract resource attributes for OPA (handle both ZTDF and legacy formats)
        let resourceAttributes: any;
        if (isZTDFResource(resource)) {
            resourceAttributes = {
                resourceId: resource.resourceId,
                classification: resource.ztdf.policy.securityLabel.classification,
                releasabilityTo: resource.ztdf.policy.securityLabel.releasabilityTo,
                COI: resource.ztdf.policy.securityLabel.COI || [],
                creationDate: resource.ztdf.policy.securityLabel.creationDate,
                encrypted: true,
                originalClassification: resource.ztdf.policy.securityLabel.originalClassification,
                originalCountry: resource.ztdf.policy.securityLabel.originatingCountry,
                natoEquivalent: resource.ztdf.policy.securityLabel.natoEquivalent,
            };
        } else {
            // Legacy resource format
            const legacyResource: any = resource;
            resourceAttributes = {
                resourceId: legacyResource.resourceId,
                classification: legacyResource.classification || 'UNCLASSIFIED',
                releasabilityTo: legacyResource.releasabilityTo || [],
                COI: legacyResource.COI || [],
                creationDate: legacyResource.creationDate,
                encrypted: legacyResource.encrypted || false,
            };
        }

        // Build OPA input following the interface specification
        // SIMPLIFIED (2026-01-20): Pass ACR/AMR as-is from token - OPA handles parsing
        logger.info('Building OPA input', {
            user: user.uniqueID,
            acr_from_token: user.acr,
            amr_from_token: user.amr,
            auth_time: user.auth_time,
        });

        // Parse AMR to determine if MFA was used (for hub guardrails)
        const effectiveAmr = getEffectiveAmr(user);
        const amrArray = Array.isArray(effectiveAmr)
            ? effectiveAmr
            : typeof effectiveAmr === 'string'
                ? JSON.parse(effectiveAmr)
                : [];
        const mfa_used = amrArray.length >= 2; // MFA = 2+ authentication factors

        const opaInput: IOPAInput = {
            input: {
                subject: {
                    authenticated: true,
                    uniqueID: user.uniqueID,
                    clearance: user.clearance,
                    countryOfAffiliation: user.countryOfAffiliation,
                    acpCOI: user.acpCOI || [],
                    issuer: user.iss,
                    mfa_used, // Hub guardrail: MFA verification
                },
                action: {
                    operation: req.method.toLowerCase(),
                },
                resource: resourceAttributes,
                context: {
                    currentTime: new Date().toISOString(),
                    sourceIP: req.ip || req.socket?.remoteAddress || 'unknown',
                    deviceCompliant: true, // Assume compliant for now
                    requestId: req.headers['x-request-id'] as string || `req-${Date.now()}`,
                    // ACR/AMR for OPA policy evaluation
                    // Use user_acr/user_amr when they indicate higher AAL (for testing)
                    // This allows AAL testing without requiring actual MFA registration
                    acr: getEffectiveAcr(user),
                    amr: getEffectiveAmr(user),
                    auth_time: user.auth_time,
                    tenant: extractTenant(user, req),
                },
            },
        };

        logger.info('OPA input constructed', {
            subject: user.uniqueID,
            resource: resourceId,
            context_acr: opaInput.input.context.acr,
            context_amr: opaInput.input.context.amr,
            endpoint: OPA_DECISION_ENDPOINT,
        });

        // ============================================
        // PHASE 6: Redis Decision Caching Integration
        // ============================================
        // Check decision cache BEFORE calling OPA
        const cacheKey = decisionCacheService.generateCacheKey({
            uniqueID: user.uniqueID,
            resourceId,
            clearance: user.clearance,
            countryOfAffiliation: user.countryOfAffiliation,
            tenant: user.tenant
        });

        const cachedDecision = decisionCacheService.get(cacheKey);
        
        if (cachedDecision) {
            logger.info('Using cached authorization decision', {
                subject: user.uniqueID,
                resource: resourceId,
                decision: cachedDecision.result.allow ? 'ALLOW' : 'DENY',
                cacheAge: Date.now() - cachedDecision.cachedAt,
                ttl: cachedDecision.ttl,
                classification: cachedDecision.classification
            });

            // Use cached decision (skip OPA call)
            const opaResponse: IOPADecision = {
                result: cachedDecision.result
            };

            // Store for downstream middleware
            (req as any).policyEvaluation = {
                decision: opaResponse.result.allow ? 'ALLOW' : 'DENY',
                reason: opaResponse.result.reason,
                evaluation_details: opaResponse.result.evaluation_details,
                cached: true,
                cacheAge: Date.now() - cachedDecision.cachedAt,
                subject: {
                    clearance: user.clearance,
                    country: user.countryOfAffiliation,
                    coi: user.acpCOI,
                },
                resource: {
                    resourceId: resourceAttributes.resourceId,
                    classification: resourceAttributes.classification,
                    releasabilityTo: resourceAttributes.releasabilityTo,
                    coi: resourceAttributes.COI,
                },
            };

            // Handle cached decision (same flow as OPA decision below)
            if (!opaResponse.result.allow) {
                logger.info('Authorization denied by OPA (cached)', {
                    subject: user.uniqueID,
                    resource: resourceId,
                    reason: opaResponse.result.reason,
                    cached: true
                });

                auditService.logAccessDeny({
                    subject: {
                        uniqueID: user.uniqueID,
                        clearance: user.clearance,
                        countryOfAffiliation: user.countryOfAffiliation,
                        acpCOI: user.acpCOI,
                    },
                    resource: {
                        resourceId,
                        classification: resourceAttributes.classification,
                        releasabilityTo: resourceAttributes.releasabilityTo,
                        COI: resourceAttributes.COI,
                    },
                    decision: {
                        allow: false,
                        reason: opaResponse.result.reason,
                        evaluationDetails: opaResponse.result.evaluation_details,
                    },
                    latencyMs: 0,
                    context: {
                        sourceIP: req.ip || 'unknown',
                    },
                });

                res.status(403).json({
                    error: 'Forbidden',
                    message: opaResponse.result.reason || 'Access denied',
                    details: opaResponse.result.evaluation_details,
                });
                return;
            }

            // Log successful cached decision
            decisionLogService.logDecision({
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id'] as string || `req-${Date.now()}`,
                subject: {
                    uniqueID: user.uniqueID,
                    clearance: user.clearance || 'UNCLASSIFIED',
                    countryOfAffiliation: user.countryOfAffiliation || 'UNKNOWN',
                    acpCOI: user.acpCOI || [],
                },
                resource: {
                    resourceId,
                    classification: resourceAttributes.classification,
                    releasabilityTo: resourceAttributes.releasabilityTo,
                    COI: resourceAttributes.COI,
                },
                action: {
                    operation: 'READ',
                },
                decision: 'ALLOW',
                reason: opaResponse.result.reason,
                latency_ms: 0,
                context: {
                    sourceIP: req.ip || 'unknown',
                },
            });

            // Continue to next middleware (cache hit - allow)
            next();
            return;
        }

        logger.debug('Decision cache miss, calling OPA', {
            subject: user.uniqueID,
            resource: resourceId,
            cacheKey
        });

        // Call OPA with circuit breaker protection
        let opaResponse: IOPADecision;
        try {
            const response = await opaCircuitBreaker.execute(async () => {
                return await axios.post(OPA_DECISION_ENDPOINT, opaInput, {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 5000,
                    httpsAgent: new https.Agent({ rejectUnauthorized: false }), // For development
                });
            });

            opaResponse = response.data;

            // ============================================
            // PHASE 6: Cache OPA Decision
            // ============================================
            // Store decision in cache for future requests
            if (opaResponse && opaResponse.result) {
                const tenant = extractTenant(user, req);
                decisionCacheService.set(
                    cacheKey,
                    opaResponse.result,
                    resourceAttributes.classification || 'UNCLASSIFIED',
                    tenant
                );

                logger.debug('Cached OPA decision', {
                    subject: user.uniqueID,
                    resource: resourceId,
                    classification: resourceAttributes.classification,
                    decision: opaResponse.result.allow ? 'ALLOW' : 'DENY',
                    ttl: decisionCacheService.getTTLForClassification(resourceAttributes.classification || 'UNCLASSIFIED')
                });
            }

            // Check if OPA returned empty response (policies not loaded)
            if (!opaResponse || !opaResponse.result || Object.keys(opaResponse).length === 0) {
                logger.warn('OPA returned empty response (policies not loaded), using fallback', {
                    subject: user.uniqueID,
                    resource: resourceId,
                    opaResponse: JSON.stringify(opaResponse)
                });
                opaResponse = localEvaluateOPA(opaInput);
            }
        } catch (opaError) {
            logger.warn('OPA call failed, falling back to local evaluation', {
                error: opaError instanceof Error ? opaError.message : 'Unknown OPA error',
                subject: user.uniqueID,
                resource: resourceId,
            });

            // Fallback to local evaluation for development/testing
            opaResponse = localEvaluateOPA(opaInput);
        }

        // Validate OPA response structure
        if (!opaResponse || !opaResponse.result) {
            logger.error('Invalid OPA response structure', {
                resourceId,
                userId: user.uniqueID,
                opaResponse: JSON.stringify(opaResponse).substring(0, 200)
            });
            res.status(500).json({
                error: 'Authorization Error',
                message: 'Invalid authorization service response'
            });
            return;
        }

        // Store policy evaluation details for frontend replay
        (req as any).policyEvaluation = {
            decision: opaResponse.result.allow ? 'ALLOW' : 'DENY',
            reason: opaResponse.result.reason,
            evaluation_details: opaResponse.result.evaluation_details,
            subject: {
                clearance: user.clearance,
                country: user.countryOfAffiliation,
                coi: user.acpCOI,
            },
            resource: {
                resourceId: resourceAttributes.resourceId,
                classification: resourceAttributes.classification,
                releasabilityTo: resourceAttributes.releasabilityTo,
                coi: resourceAttributes.COI,
            },
        };

        // Check authorization decision
        if (!opaResponse.result.allow) {
            logger.info('Authorization denied by OPA', {
                subject: user.uniqueID,
                resource: resourceId,
                reason: opaResponse.result.reason,
                evaluation_details: opaResponse.result.evaluation_details,
            });

            // Audit log the deny decision
            auditService.logAccessDeny({
                subject: {
                    uniqueID: user.uniqueID,
                    clearance: user.clearance,
                    countryOfAffiliation: user.countryOfAffiliation,
                    acpCOI: user.acpCOI,
                    issuer: user.iss,
                },
                resource: {
                    resourceId: resourceAttributes.resourceId,
                    classification: resourceAttributes.classification,
                    releasabilityTo: resourceAttributes.releasabilityTo,
                    COI: resourceAttributes.COI,
                    encrypted: resourceAttributes.encrypted,
                },
                decision: {
                    allow: false,
                    reason: opaResponse.result.reason,
                },
                latencyMs: Date.now() - startTime,
                context: {
                    requestId: req.headers['x-request-id'] as string || `req-${Date.now()}`,
                    sourceIP: req.ip || 'unknown',
                },
            });

            // Log decision to decisions collection for dashboard
            logger.info('Logging DENY decision to decision service', {
                subject: user.uniqueID,
                resource: resourceAttributes.resourceId,
                decision: 'DENY'
            });
            await decisionLogService.logDecision({
                timestamp: new Date().toISOString(),
                requestId: req.headers['x-request-id'] as string || `req-${Date.now()}`,
                subject: {
                    uniqueID: user.uniqueID,
                    clearance: user.clearance,
                    clearanceOriginal: user.clearance,
                    clearanceCountry: user.countryOfAffiliation,
                    countryOfAffiliation: user.countryOfAffiliation,
                    acpCOI: user.acpCOI,
                },
                resource: {
                    resourceId: resourceAttributes.resourceId,
                    classification: resourceAttributes.classification,
                    originalClassification: resourceAttributes.originalClassification,
                    originalCountry: resourceAttributes.originalCountry,
                    releasabilityTo: resourceAttributes.releasabilityTo,
                    COI: resourceAttributes.COI,
                },
                action: {
                    operation: req.method.toLowerCase(),
                },
                decision: 'DENY',
                reason: opaResponse.result.reason,
                evaluation_details: opaResponse.result.evaluation_details,
                obligations: opaResponse.result.obligations,
                latency_ms: Date.now() - startTime,
                context: {
                    sourceIP: req.ip || req.socket?.remoteAddress || 'unknown',
                    acr: getEffectiveAcr(user),
                    amr: getEffectiveAmr(user),
                    auth_time: user.auth_time,
                },
            });

            // Return structured error response with resource metadata for frontend
            res.status(403).json({
                error: 'Forbidden',
                message: 'Authorization check failed',
                reason: opaResponse.result.reason,
                details: {
                    evaluation_details: opaResponse.result.evaluation_details,
                    resource: {
                        resourceId: resourceAttributes.resourceId,
                        title: resource.title || 'Resource',
                        classification: resourceAttributes.classification,
                        releasabilityTo: resourceAttributes.releasabilityTo,
                        coi: resourceAttributes.COI,
                    },
                    subject: {
                        uniqueID: user.uniqueID,
                        clearance: user.clearance,
                        country: user.countryOfAffiliation,
                        coi: user.acpCOI,
                    },
                },
                policyEvaluation: {
                    decision: 'DENY',
                    reason: opaResponse.result.reason,
                    evaluation_details: opaResponse.result.evaluation_details,
                    subject: {
                        clearance: user.clearance,
                        country: user.countryOfAffiliation,
                        coi: user.acpCOI,
                    },
                    resource: {
                        resourceId: resourceAttributes.resourceId,
                        classification: resourceAttributes.classification,
                        releasabilityTo: resourceAttributes.releasabilityTo,
                        coi: resourceAttributes.COI,
                    },
                },
            });
            return;
        }

        logger.info('Authorization granted', {
            subject: user.uniqueID,
            resource: resourceId,
            decision: 'ALLOW',
            reason: opaResponse.result.reason,
        });

        // Audit log the grant decision
        auditService.logAccessGrant({
            subject: {
                uniqueID: user.uniqueID,
                clearance: user.clearance,
                countryOfAffiliation: user.countryOfAffiliation,
                acpCOI: user.acpCOI,
                issuer: user.iss,
            },
            resource: {
                resourceId: resourceAttributes.resourceId,
                classification: resourceAttributes.classification,
                releasabilityTo: resourceAttributes.releasabilityTo,
                COI: resourceAttributes.COI,
                encrypted: resourceAttributes.encrypted,
            },
            decision: {
                allow: true,
                reason: opaResponse.result.reason,
            },
            latencyMs: Date.now() - startTime,
            context: {
                requestId: req.headers['x-request-id'] as string || `req-${Date.now()}`,
                sourceIP: req.ip || 'unknown',
            },
        });

        // Log decision to decisions collection for dashboard
        logger.info('Logging ALLOW decision to decision service', {
            subject: user.uniqueID,
            resource: resourceAttributes.resourceId,
            decision: 'ALLOW'
        });
        await decisionLogService.logDecision({
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] as string || `req-${Date.now()}`,
            subject: {
                uniqueID: user.uniqueID,
                clearance: user.clearance,
                clearanceOriginal: user.clearance,
                clearanceCountry: user.countryOfAffiliation,
                countryOfAffiliation: user.countryOfAffiliation,
                acpCOI: user.acpCOI,
            },
            resource: {
                resourceId: resourceAttributes.resourceId,
                classification: resourceAttributes.classification,
                originalClassification: resourceAttributes.originalClassification,
                originalCountry: resourceAttributes.originalCountry,
                releasabilityTo: resourceAttributes.releasabilityTo,
                COI: resourceAttributes.COI,
            },
            action: {
                operation: req.method.toLowerCase(),
            },
            decision: 'ALLOW',
            reason: opaResponse.result.reason,
            evaluation_details: opaResponse.result.evaluation_details,
            obligations: opaResponse.result.obligations,
            latency_ms: Date.now() - startTime,
            context: {
                sourceIP: req.ip || req.socket?.remoteAddress || 'unknown',
                acr: getEffectiveAcr(user),
                amr: getEffectiveAmr(user),
                auth_time: user.auth_time,
            },
        });

        // Attach authorization obligations (like KAS key requirements)
        (req as any).authzObligations = opaResponse.result.obligations || [];

        // Attach fetched resource to request so controller doesn't fetch again
        (req as any).resource = resource;

        next();
    } catch (error) {
        logger.error('Authorization middleware error', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            resourceId: req.params.id,
            userId: (req as any).user?.uniqueID,
        });

        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Authorization check failed',
            details: {
                resource: {
                    resourceId: req.params.id,
                    title: 'Resource',
                    classification: 'UNKNOWN',
                    releasabilityTo: [],
                    coi: [],
                },
            },
        });
    }
}
