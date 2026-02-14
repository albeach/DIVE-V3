/**
 * OPA Policy Enforcement — REST API calls, decision caching, circuit breaker
 *
 * Handles OPA input construction, tenant extraction, ACR/AMR effective value
 * computation, trusted issuer loading, local fallback evaluation, and the
 * OPA REST call with circuit breaker + decision cache integration.
 *
 * Extracted from authz.middleware.ts during Phase 4A decomposition.
 */

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import * as https from 'https';
import { Request } from 'express';
import { logger } from '../utils/logger';
import { opaCircuitBreaker } from '../utils/circuit-breaker';
import { decisionCacheService } from '../services/decision-cache.service';
import { getClearanceLevel as _getClearanceRank, StandardClearance } from '../services/clearance-normalization.service';
import { IKeycloakToken } from './jwt-verifier';

// ============================================
// OPA Endpoint Configuration
// ============================================

// OPA endpoint - Phase 5: Use unified dive.authz entrypoint
const OPA_URL = process.env.OPA_URL || 'https://localhost:8181';
// OPA endpoint configuration
// Use the package root endpoint (/v1/data/dive/authz) instead of /decision
// because the decision rule can be undefined if evaluation_details fails
const OPA_DECISION_ENDPOINT = `${OPA_URL}/v1/data/dive/authz`;

// ============================================
// Local Fallback Evaluation
// ============================================

// Derived from CLEARANCE_EQUIVALENCY_TABLE SSOT via clearance-normalization.service.ts
const CLEARANCE_LEVEL: Record<string, number> = Object.fromEntries(
    Object.values(StandardClearance).map(level => [level, _getClearanceRank(level)])
);

export const localEvaluateOPA = (input: IOPAInput): IOPADecision => {
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

// ============================================
// Trusted Issuer → Tenant Mapping
// ============================================

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

// ============================================
// Effective ACR / AMR Helpers
// ============================================

/**
 * Get effective ACR value for OPA policy evaluation
 * Uses user_acr (from user attributes) when it indicates higher AAL than session ACR
 * This allows AAL testing without requiring actual MFA registration
 */
export const getEffectiveAcr = (user: Record<string, unknown>): string => {
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
 * Get effective AMR value for OPA policy evaluation.
 *
 * Priority: user_amr (federated) > session amr (local) > empty.
 *
 * Keycloak 26.5 AMR mechanism (via AmrProtocolMapper):
 * - Reads AUTHENTICATORS_COMPLETED user session note (persistent)
 * - Looks up each execution's "default.reference.value" config
 * - Enforces "default.reference.maxAge" (defaults to 0 = immediate expiry)
 *
 * For federated users, the hub's native AMR is always empty (hub only sees
 * the IdP broker execution). The spoke's AMR is forwarded via user_amr
 * attribute mapper.
 */
export const getEffectiveAmr = (user: Record<string, unknown>): string[] => {
    const sessionAmr = Array.isArray(user.amr) && user.amr.length > 0 ? user.amr : null;
    const userAmr = Array.isArray(user.user_amr) && user.user_amr.length > 0 ? user.user_amr : null;
    const sessionAcr = user.acr ? String(user.acr) : '0';
    const userAcr = user.user_acr ? String(user.user_acr) : null;

    // For federated users: use user_amr when user_acr indicates higher AAL
    if (userAcr && parseInt(userAcr, 10) > parseInt(sessionAcr, 10) && userAmr) {
        logger.debug('Using user_amr (federated)', {
            sessionAmr,
            userAmr,
            uniqueID: user.uniqueID,
        });
        return userAmr;
    }

    // For local users: use session AMR from oidc-amr-mapper
    if (sessionAmr) {
        return sessionAmr;
    }

    // AMR genuinely empty — return empty array (OPA will use ACR fallback)
    return [];
};

/**
 * Extract tenant from token issuer or request context
 * Used for multi-tenant policy isolation
 */
export const extractTenant = (token: IKeycloakToken, req: Request): string | undefined => {
    const issuer = token?.iss;

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

// ============================================
// OPA Type Interfaces
// ============================================

/**
 * Interface for OPA input
 * ACP-240 Section 4.3 Enhancement: Added original classification fields
 * Gap #4: Added dutyOrg and orgUnit for organization-based policies
 * Phase 5: Added tenant and issuer for multi-tenant policy isolation
 */
export interface IOPAInput {
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
export interface IOPAResponse {
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
        [key: string]: unknown; // Other rules/tests in the package
    };
}

/**
 * Interface for normalized decision (what we use in middleware)
 */
export interface IOPADecision {
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

// ============================================
// OPA Input Builder
// ============================================

/**
 * Build OPA input from user, resource attributes, and request context.
 */
export function buildOPAInput(
    user: Record<string, unknown>,
    resourceAttributes: Record<string, unknown>,
    req: Request
): IOPAInput {
    const effectiveAmr = getEffectiveAmr(user);
    const amrArray = Array.isArray(effectiveAmr)
        ? effectiveAmr
        : typeof effectiveAmr === 'string'
            ? JSON.parse(effectiveAmr)
            : [];
    const mfa_used = amrArray.length >= 2; // MFA = 2+ authentication factors

    return {
        input: {
            subject: {
                authenticated: true,
                uniqueID: user.uniqueID as string,
                clearance: user.clearance as string,
                countryOfAffiliation: user.countryOfAffiliation as string,
                acpCOI: (user.acpCOI as string[]) || [],
                issuer: user.iss as string,
                mfa_used, // Hub guardrail: MFA verification
            },
            action: {
                operation: req.method.toLowerCase(),
            },
            resource: resourceAttributes as IOPAInput['input']['resource'],
            context: {
                currentTime: new Date().toISOString(),
                sourceIP: req.ip || req.socket?.remoteAddress || 'unknown',
                deviceCompliant: true, // Assume compliant for now
                requestId: req.headers['x-request-id'] as string || `req-${Date.now()}`,
                // ACR/AMR for OPA policy evaluation
                acr: getEffectiveAcr(user),
                amr: getEffectiveAmr(user),
                auth_time: user.auth_time as number,
                tenant: extractTenant(user as unknown as IKeycloakToken, req),
            },
        },
    };
}

// ============================================
// OPA REST Call with Circuit Breaker + Cache
// ============================================

/**
 * Call OPA for an authorization decision with circuit breaker protection,
 * decision caching, and local fallback on failure.
 */
export async function callOPA(
    opaInput: IOPAInput,
    cacheKey: string,
    classification: string,
    tenant: string | undefined,
    userId: string,
    resourceId: string
): Promise<IOPADecision> {
    try {
        const response = await opaCircuitBreaker.execute(async () => {
            return await axios.post(OPA_DECISION_ENDPOINT, opaInput, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 5000,
                httpsAgent: new https.Agent({ rejectUnauthorized: false }), // For development
            });
        });

        let opaResponse: IOPADecision = response.data;

        // Cache OPA Decision
        if (opaResponse && opaResponse.result) {
            decisionCacheService.set(
                cacheKey,
                opaResponse.result,
                classification,
                tenant
            );

            logger.debug('Cached OPA decision', {
                subject: userId,
                resource: resourceId,
                classification,
                decision: opaResponse.result.allow ? 'ALLOW' : 'DENY',
                ttl: decisionCacheService.getTTLForClassification(classification)
            });
        }

        // Check if OPA returned empty response (policies not loaded)
        if (!opaResponse || !opaResponse.result || Object.keys(opaResponse).length === 0) {
            logger.warn('OPA returned empty response (policies not loaded), using fallback', {
                subject: userId,
                resource: resourceId,
                opaResponse: JSON.stringify(opaResponse)
            });
            opaResponse = localEvaluateOPA(opaInput);
        }

        return opaResponse;
    } catch (opaError) {
        logger.warn('OPA call failed, falling back to local evaluation', {
            error: opaError instanceof Error ? opaError.message : 'Unknown OPA error',
            subject: userId,
            resource: resourceId,
        });

        // Fallback to local evaluation for development/testing
        return localEvaluateOPA(opaInput);
    }
}
