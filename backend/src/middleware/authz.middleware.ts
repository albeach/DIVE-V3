/**
 * PEP (Policy Enforcement Point) Middleware
 *
 * Orchestrates the authorization flow:
 * Validate JWT → Extract attributes → Fetch resource → Call OPA → Enforce decision
 *
 * Sub-modules:
 * - jwt-verifier.ts: JWT validation, token introspection, JWKS key fetching
 * - opa-enforcer.ts: OPA REST API calls, decision caching, circuit breaker
 * - resource-fetcher.ts: Resource loading and attribute extraction for PEP
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { decisionCacheService } from '../services/decision-cache.service';
import { auditService } from '../services/audit.service';
import { decisionLogService } from '../services/decision-log.service';

// Re-export public API from sub-modules (preserves all existing imports)
export { authenticateJWT, initializeJwtService, clearAuthzCaches, normalizeACR, normalizeAMR } from './jwt-verifier';
export type { IKeycloakToken } from './jwt-verifier';
export { getEffectiveAcr, getEffectiveAmr, extractTenant, buildOPAInput, callOPA } from './opa-enforcer';
export type { IOPAInput, IOPAResponse, IOPADecision } from './opa-enforcer';
export { extractResourceAttributes, fetchResourceForAuthz, isZTDFResource } from './resource-fetcher';

// Import helpers used by authzMiddleware
import { getEffectiveAcr, getEffectiveAmr, extractTenant, buildOPAInput, callOPA, IOPADecision } from './opa-enforcer';
import { fetchResourceForAuthz, extractResourceAttributes } from './resource-fetcher';

/**
 * Authorization Middleware - Calls OPA for ABAC Policy Decisions
 *
 * This is the PEP (Policy Enforcement Point) that:
 * 1. Extracts subject, action, resource from request
 * 2. Calls OPA PDP (Policy Decision Point)
 * 3. Enforces the authorization decision
 * 4. Handles obligations (like KAS key release)
 */
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
        const authHeader = req.headers['authorization'];
        const resource = await fetchResourceForAuthz(resourceId, authHeader);

        if (!resource) {
            res.status(404).json({
                error: 'Not Found',
                message: `Resource ${resourceId} not found`,
            });
            return;
        }

        // Extract resource attributes for OPA (handle both ZTDF and legacy formats)
        const resourceAttributes = extractResourceAttributes(resource);

        // Build OPA input following the interface specification
        logger.info('Building OPA input', {
            user: user.uniqueID,
            acr_from_token: user.acr,
            amr_from_token: user.amr,
            auth_time: user.auth_time,
        });

        const opaInput = buildOPAInput(user, resourceAttributes, req);

        logger.info('OPA input constructed', {
            subject: user.uniqueID,
            resource: resourceId,
            context_acr: opaInput.input.context.acr,
            context_amr: opaInput.input.context.amr,
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

        // Call OPA with circuit breaker + caching + fallback
        const opaResponse = await callOPA(
            opaInput,
            cacheKey,
            resourceAttributes.classification || 'UNCLASSIFIED',
            extractTenant(user, req),
            user.uniqueID,
            resourceId
        );

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
