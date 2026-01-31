/**
 * KAS (Key Access Service) Server
 *
 * Implements NATO ACP-240 Key Access Service
 * - Policy-bound encryption: Re-evaluates OPA policy before key release
 * - DEK/KEK management: Hybrid encryption (mock for pilot, HSM for production)
 * - Audit logging: All key requests logged per ACP-240 section 6
 * - Fail-closed: Deny on policy failure, integrity failure, or service unavailable
 *
 * Reference: ACP240-llms.txt section 5.2 (Hybrid Encryption & Key Management)
 */

import express, { Application, Request, Response } from 'express';
import https from 'https';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import { config } from 'dotenv';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import NodeCache from 'node-cache';

import { kasLogger, logKASAuditEvent } from './utils/kas-logger';
import { verifyToken, IKeycloakToken } from './utils/jwt-validator';
import {
    IKASKeyRequest,
    IKASKeyResponse,
    IKASAuditEvent,
    IDEKCacheEntry
} from './types/kas.types';
import {
    recordKeyRequest,
    recordFederationRequest,
    recordOPAEvaluation,
    recordDEKCacheOperation,
    updateDEKCacheSize,
    getPrometheusMetrics,
    getMetricsJSON,
} from './utils/kas-metrics';

config({ path: '.env.local' });

const app: Application = express();
const PORT = process.env.KAS_PORT || 8080;
const HTTPS_ENABLED = process.env.HTTPS_ENABLED === 'true';
const OPA_URL = process.env.OPA_URL || 'https://localhost:8181';
const BACKEND_URL = process.env.BACKEND_URL || 'https://localhost:4000';

// ============================================
// DEK Cache (In-Memory)
// NOTE: Production should use HSM for key custody
// ============================================
const dekCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 }); // 1 hour TTL

app.use(cors());
app.use(express.json());

// Request ID middleware
app.use((req, res, next) => {
    req.headers['x-request-id'] = req.headers['x-request-id'] || `kas-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    next();
});

// ============================================
// Health Check
// ============================================
app.get('/health', (req, res) => {
    // Update DEK cache size metric
    updateDEKCacheSize(dekCache.keys().length);

    res.json({
        status: 'healthy',
        service: 'dive-v3-kas',
        version: '1.0.0-acp240',
        timestamp: new Date().toISOString(),
        message: 'KAS Service Operational (ACP-240 Compliant)',
        features: [
            'Policy re-evaluation via OPA',
            'DEK/KEK management (mock)',
            'ACP-240 audit logging',
            'Fail-closed enforcement',
            'Prometheus metrics',
            'Multi-KAS federation'
        ],
        dekCacheSize: dekCache.keys().length,
    });
});

// ============================================
// Prometheus Metrics Endpoint
// ============================================
app.get('/metrics', (req, res) => {
    // Update cache size before export
    updateDEKCacheSize(dekCache.keys().length);

    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(getPrometheusMetrics());
});

// Metrics JSON endpoint (for debugging)
app.get('/metrics/json', (req, res) => {
    updateDEKCacheSize(dekCache.keys().length);
    res.json(getMetricsJSON());
});

// ============================================
// Key Request Endpoint (ACP-240 Core)
// ============================================
app.post('/request-key', async (req: Request, res: Response) => {
    const startTime = Date.now();
    const requestId = req.headers['x-request-id'] as string;

    kasLogger.info('KAS key request received', {
        requestId,
        body: req.body
    });

    try {
        // ============================================
        // 1. Validate Request
        // ============================================
        const keyRequest: IKASKeyRequest = req.body;

        if (!keyRequest.resourceId || !keyRequest.kaoId || !keyRequest.bearerToken) {
            kasLogger.warn('Invalid KAS request: missing required fields', { requestId });
            res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'Missing required fields: resourceId, kaoId, bearerToken',
                responseTimestamp: new Date().toISOString()
            } as IKASKeyResponse);
            return;
        }

        // ============================================
        // 2. Verify JWT Token (extract identity attributes)
        // ============================================
        // SECURITY FIX (Oct 20, 2025): Gap #3 - KAS JWT Verification
        // Replaced jwt.decode() with verifyToken() for signature verification
        // This prevents forged token attacks on the Key Access Service
        let decodedToken: IKeycloakToken;
        let isServiceAccountToken = false;
        try {
            // SECURE: Verify JWT signature with JWKS (RS256)
            decodedToken = await verifyToken(keyRequest.bearerToken);

            // Check if this is a service account token (Issue B fix)
            isServiceAccountToken = decodedToken.aud === 'kas' || decodedToken.aud === 'dive-v3-backend-client';

            kasLogger.info('JWT signature verified successfully', {
                requestId,
                sub: decodedToken.sub,
                iss: `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}`,
                aud: decodedToken.aud,
                exp: decodedToken.exp,
                iat: decodedToken.iat,
                isServiceAccountToken
            });

        } catch (error) {
            kasLogger.error('JWT verification failed', {
                requestId,
                error: error instanceof Error ? error.message : 'Unknown error',
                errorType: error instanceof Error ? error.name : 'UnknownError'
            });

            const auditEvent: IKASAuditEvent = {
                eventType: 'KEY_DENIED',
                timestamp: new Date().toISOString(),
                requestId,
                subject: 'unknown',
                resourceId: keyRequest.resourceId,
                kaoId: keyRequest.kaoId,
                outcome: 'DENY',
                reason: `JWT verification failed: ${error instanceof Error ? error.message : 'Invalid or expired token'}`,
                latencyMs: Date.now() - startTime
            };
            logKASAuditEvent(auditEvent);

            res.status(401).json({
                success: false,
                error: 'Unauthorized',
                denialReason: 'Invalid or expired JWT token',
                details: {
                    reason: error instanceof Error ? error.message : 'Token verification failed',
                    requirement: 'Valid RS256 signed JWT from Keycloak',
                    reference: 'ACP-240 Section 5.2 (Key Access Service)'
                },
                responseTimestamp: new Date().toISOString()
            } as IKASKeyResponse);
            return;
        }

        // Extract user identity - handle both user tokens and service account tokens
        let uniqueID: string;
        let clearance: string;
        let countryOfAffiliation: string;
        let dutyOrg: string | undefined;
        let orgUnit: string | undefined;
        let acpCOI: string[];

        // PRIORITY: Always use userIdentity from request if provided (backend sends this with service account tokens)
        if (keyRequest.userIdentity) {
            // Service account token: extract user identity from request body (Issue B fix)
            const userIdentity = keyRequest.userIdentity as any;
            uniqueID = userIdentity.uniqueID || 'service-account-user';
            clearance = userIdentity.clearance || 'UNCLASSIFIED';
            countryOfAffiliation = userIdentity.countryOfAffiliation || 'USA';
            acpCOI = Array.isArray(userIdentity.acpCOI) ? userIdentity.acpCOI : [];
            dutyOrg = userIdentity.dutyOrg;
            orgUnit = userIdentity.orgUnit;

            kasLogger.info('Using user identity from request body (service account flow)', {
                requestId,
                uniqueID,
                clearance,
                countryOfAffiliation,
                acpCOI,
                source: 'request-userIdentity',
                isServiceAccountToken
            });
        } else {
            // Regular user token: extract from JWT claims
            uniqueID = decodedToken.uniqueID || decodedToken.preferred_username || decodedToken.sub || 'unknown';
            clearance = decodedToken.clearance || 'UNCLASSIFIED';
            countryOfAffiliation = decodedToken.countryOfAffiliation || 'USA';
            dutyOrg = decodedToken.dutyOrg;        // Gap #4: Organization attribute
            orgUnit = decodedToken.orgUnit;        // Gap #4: Organizational unit

            // Parse acpCOI - handle string or array (same fix as upload controller)
            acpCOI = [];
            if (decodedToken.acpCOI) {
                if (typeof decodedToken.acpCOI === 'string') {
                    try {
                        acpCOI = JSON.parse(decodedToken.acpCOI);
                    } catch {
                        acpCOI = [decodedToken.acpCOI];
                    }
                } else if (Array.isArray(decodedToken.acpCOI)) {
                    acpCOI = decodedToken.acpCOI;
                }
            }

            kasLogger.info('Using user identity from JWT token', {
                requestId,
                uniqueID,
                clearance,
                countryOfAffiliation,
                acpCOI,
                source: 'jwt-claims'
            });
        }

        kasLogger.info('Token validated', {
            requestId,
            uniqueID,
            clearance,
            country: countryOfAffiliation,
            acpCOI,  // DEBUG: Log parsed COI
            acpCOI_type: typeof acpCOI,
            acpCOI_isArray: Array.isArray(acpCOI),
            dutyOrg,  // Gap #4: Log organization
            orgUnit   // Gap #4: Log organizational unit
        });

        // ============================================
        // 3. Get Resource Metadata (from request or backend)
        // ============================================
        let resource: any;
        if (keyRequest.resourceMetadata) {
            // Use resource metadata passed from backend
            resource = keyRequest.resourceMetadata;
            kasLogger.info('Using resource metadata from request', {
                requestId,
                resourceId: keyRequest.resourceId,
                classification: resource.classification,
                releasabilityTo: resource.releasabilityTo?.length || 0,
                coiCount: resource.COI?.length || 0
            });
        } else {
            // Fallback: fetch from backend (deprecated - should not happen)
            kasLogger.warn('Resource metadata not provided in request, falling back to backend fetch', {
                requestId,
                resourceId: keyRequest.resourceId
            });
            try {
                const resourceResponse = await axios.get(
                    `${BACKEND_URL}/api/resources/${keyRequest.resourceId}`,
                    {
                        headers: {
                            'Authorization': `Bearer ${keyRequest.bearerToken}`,
                            'x-request-id': requestId
                        },
                        timeout: 5000
                    }
                );
                resource = resourceResponse.data;
            } catch (error) {
                kasLogger.error('Failed to fetch resource metadata', {
                    requestId,
                    resourceId: keyRequest.resourceId,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });

                const auditEvent: IKASAuditEvent = {
                    eventType: 'KEY_DENIED',
                    timestamp: new Date().toISOString(),
                    requestId,
                    subject: uniqueID,
                    resourceId: keyRequest.resourceId,
                    kaoId: keyRequest.kaoId,
                    outcome: 'DENY',
                    reason: 'Resource metadata unavailable',
                    latencyMs: Date.now() - startTime
                };
                logKASAuditEvent(auditEvent);

                res.status(503).json({
                    success: false,
                    error: 'Service Unavailable',
                    denialReason: 'Unable to fetch resource metadata',
                    responseTimestamp: new Date().toISOString()
                } as IKASKeyResponse);
                return;
            }
        }

        // ============================================
        // 4. Re-Evaluate OPA Policy (Defense in Depth)
        // ============================================
        // Ensure arrays are properly typed for OPA (same fix as upload)
        const userCOI = Array.isArray(acpCOI) ? acpCOI : [];
        const resourceCOI = Array.isArray(resource.COI) ? resource.COI : [];

        // Parse AMR to determine if MFA was used
        const amrArray = Array.isArray(decodedToken.amr)
            ? decodedToken.amr
            : typeof decodedToken.amr === 'string'
                ? JSON.parse(decodedToken.amr)
                : [];
        const mfa_used = amrArray.length >= 2; // MFA = 2+ authentication factors

        const opaInput = {
            input: {
                subject: {
                    authenticated: true,
                    uniqueID,
                    clearance,
                    countryOfAffiliation,
                    acpCOI: userCOI,  // ✅ Guaranteed array
                    dutyOrg,          // Gap #4: Organization attribute
                    orgUnit,          // Gap #4: Organizational unit
                    mfa_used          // Hub guardrail: MFA verification
                },
                action: {
                    operation: 'decrypt' // KAS-specific action
                },
                resource: {
                    resourceId: resource.resourceId,
                    classification: resource.classification,
                    releasabilityTo: resource.releasabilityTo,
                    COI: resourceCOI,  // ✅ Guaranteed array
                    creationDate: resource.creationDate,
                    encrypted: true
                },
                context: {
                    currentTime: new Date().toISOString(),
                    sourceIP: req.ip || 'unknown',
                    deviceCompliant: true,
                    requestId,
                    // AAL2/FAL2 context (NIST SP 800-63B/C) - CRITICAL for KAS policy re-evaluation
                    acr: decodedToken.acr,        // Authentication Context Class Reference
                    amr: decodedToken.amr,        // Authentication Methods Reference (may be JSON string)
                    auth_time: decodedToken.auth_time  // Time of authentication
                }
            }
        };

        // DEBUG: Log OPA input to verify all attributes including AAL2 context
        kasLogger.info('KAS Policy Re-Evaluation Input', {
            requestId,
            subject: {
                uniqueID,
                clearance,
                countryOfAffiliation,
                acpCOI: userCOI,
                acpCOI_isArray: Array.isArray(userCOI),
                dutyOrg,
                orgUnit
            },
            resource: {
                resourceId: resource.resourceId,
                classification: resource.classification,
                releasabilityTo: resource.releasabilityTo,
                COI: resourceCOI,
                COI_isArray: Array.isArray(resourceCOI)
            },
            context: {
                acr: decodedToken.acr,
                amr: decodedToken.amr,
                auth_time: decodedToken.auth_time,
                amr_type: typeof decodedToken.amr,
                acr_type: typeof decodedToken.acr
            }
        });

        let opaDecision: any;
        const opaStartTime = Date.now();
        try {
            // Configure axios for HTTPS with self-signed certs (local dev)
            const httpsAgent = new https.Agent({
                rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0'
            });

            const opaResponse = await axios.post(
                `${OPA_URL}/v1/data/dive/authz`,
                opaInput,
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 5000,
                    httpsAgent: OPA_URL.startsWith('https') ? httpsAgent : undefined
                }
            );

            // Extract decision from OPA response
            // Query /v1/data/dive/authz (not /decision) to get individual fields
            // OPA returns: { result: { allow, reason, obligations, ... } }
            opaDecision = opaResponse.data.result;

            // Validate OPA response structure
            if (!opaDecision || typeof opaDecision.allow === 'undefined') {
                kasLogger.error('Invalid OPA response structure - missing allow field', {
                    requestId,
                    fullResponse: JSON.stringify(opaResponse.data),
                    resultKeys: opaDecision ? Object.keys(opaDecision) : [],
                    allowValue: opaDecision?.allow,
                    allowType: typeof opaDecision?.allow
                });
                throw new Error(`Invalid OPA response structure: ${JSON.stringify(opaResponse.data)}`);
            }

            // Record OPA evaluation time
            recordOPAEvaluation(Date.now() - opaStartTime);

            kasLogger.info('OPA policy re-evaluation completed', {
                requestId,
                allow: opaDecision.allow,
                reason: opaDecision.reason,
                opaLatencyMs: Date.now() - opaStartTime,
            });

        } catch (error) {
            kasLogger.error('OPA re-evaluation failed', {
                requestId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });

            // Fail-closed: Deny if OPA unavailable
            const auditEvent: IKASAuditEvent = {
                eventType: 'KEY_DENIED',
                timestamp: new Date().toISOString(),
                requestId,
                subject: uniqueID,
                resourceId: keyRequest.resourceId,
                kaoId: keyRequest.kaoId,
                outcome: 'DENY',
                reason: 'Policy evaluation service unavailable',
                latencyMs: Date.now() - startTime
            };
            logKASAuditEvent(auditEvent);

            res.status(503).json({
                success: false,
                error: 'Service Unavailable',
                denialReason: 'Policy evaluation service unavailable (fail-closed)',
                responseTimestamp: new Date().toISOString()
            } as IKASKeyResponse);
            return;
        }

        // ============================================
        // 5. Enforce OPA Decision (Fail-Closed)
        // ============================================
        if (!opaDecision.allow) {
            kasLogger.warn('KAS policy denial', {
                requestId,
                uniqueID,
                resourceId: keyRequest.resourceId,
                reason: opaDecision.reason
            });

            // Record metrics for denied request
            const clearancePass = opaDecision.evaluation_details?.checks?.clearance_sufficient;
            const countryPass = opaDecision.evaluation_details?.checks?.country_releasable;
            const coiPass = opaDecision.evaluation_details?.checks?.coi_satisfied;

            recordKeyRequest({
                outcome: 'denied',
                durationMs: Date.now() - startTime,
                kasId: 'kas-local',
                clearanceCheck: clearancePass ? 'pass' : 'fail',
                countryCheck: countryPass ? 'pass' : 'fail',
                coiCheck: coiPass ? 'pass' : 'fail',
            });

            const auditEvent: IKASAuditEvent = {
                eventType: 'KEY_DENIED',
                timestamp: new Date().toISOString(),
                requestId,
                subject: uniqueID,
                resourceId: keyRequest.resourceId,
                kaoId: keyRequest.kaoId,
                outcome: 'DENY',
                reason: opaDecision.reason,
                subjectAttributes: { clearance: clearance as any, countryOfAffiliation, acpCOI: userCOI },
                resourceAttributes: {
                    classification: resource.classification as any,
                    releasabilityTo: resource.releasabilityTo,
                    COI: resourceCOI
                },
                opaEvaluation: opaDecision.evaluation_details,
                latencyMs: Date.now() - startTime
            };
            logKASAuditEvent(auditEvent);

            res.status(403).json({
                success: false,
                error: 'Forbidden',
                denialReason: opaDecision.reason,
                authzDecision: opaDecision,
                kasDecision: {
                    allow: false,
                    reason: opaDecision.reason,
                    timestamp: new Date().toISOString(),
                    evaluationDetails: {
                        clearanceCheck: opaDecision.evaluation_details?.checks?.clearance_sufficient ? 'PASS' : 'FAIL',
                        releasabilityCheck: opaDecision.evaluation_details?.checks?.country_releasable ? 'PASS' : 'FAIL',
                        coiCheck: opaDecision.evaluation_details?.checks?.coi_satisfied ? 'PASS' : 'FAIL',
                        policyBinding: {
                            required: {
                                clearance: resource.classification,
                                countries: resource.releasabilityTo,
                                coi: resourceCOI
                            },
                            provided: {
                                clearance: clearance,
                                country: countryOfAffiliation,
                                coi: userCOI
                            }
                        }
                    }
                },
                auditEventId: requestId,
                executionTimeMs: Date.now() - startTime,
                responseTimestamp: new Date().toISOString()
            } as IKASKeyResponse);
            return;
        }

        // ============================================
        // 6. Retrieve/Unwrap DEK
        // ============================================
        // In pilot: Deterministic DEK generation (production: HSM-backed unwrap)
        const cacheKey = `dek:${keyRequest.resourceId}:${keyRequest.kaoId}`;
        let dekEntry: IDEKCacheEntry | undefined = dekCache.get(cacheKey);

        if (!dekEntry) {
            // Record cache miss
            recordDEKCacheOperation(false);
            // PILOT FIX: Use the wrappedKey provided in request (plaintext DEK in pilot)
            // In production, this would unwrap the wrappedKey using KEK/HSM
            let dek: string;

            if (keyRequest.wrappedKey) {
                // Use the provided wrappedKey (which is plaintext DEK in pilot)
                dek = keyRequest.wrappedKey;
                kasLogger.info('Using provided wrappedKey as DEK (pilot mode)', {
                    requestId,
                    resourceId: keyRequest.resourceId,
                    wrappedKeyLength: keyRequest.wrappedKey.length
                });
            } else {
                // Fallback: Generate deterministic DEK (for backward compatibility)
                const salt = 'dive-v3-broker-dek-salt';
                const dekHash = crypto.createHash('sha256').update(keyRequest.resourceId + salt).digest();
                dek = dekHash.toString('base64');
                kasLogger.warn('No wrappedKey provided, using deterministic DEK (legacy mode)', {
                    requestId,
                    resourceId: keyRequest.resourceId
                });
            }

            dekEntry = {
                resourceId: keyRequest.resourceId,
                dek,
                kekId: 'mock-kek-001',
                wrappedDEK: dek, // Store the actual DEK used
                wrappingAlgorithm: 'RSA-OAEP-256',
                createdAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 3600000).toISOString() // 1 hour
            };

            dekCache.set(cacheKey, dekEntry);
            kasLogger.info('DEK cached', { requestId, resourceId: keyRequest.resourceId });
        } else {
            // Record cache hit
            recordDEKCacheOperation(true);
            kasLogger.info('DEK retrieved from cache', { requestId, resourceId: keyRequest.resourceId });
        }

        // ============================================
        // 7. Return DEK (Success)
        // ============================================
        const auditEvent: IKASAuditEvent = {
            eventType: 'KEY_RELEASED',
            timestamp: new Date().toISOString(),
            requestId,
            subject: uniqueID,
            resourceId: keyRequest.resourceId,
            kaoId: keyRequest.kaoId,
            outcome: 'ALLOW',
            reason: 'Policy authorization successful',
            subjectAttributes: { clearance: clearance as any, countryOfAffiliation, acpCOI: userCOI },
            resourceAttributes: {
                classification: resource.classification as any,
                releasabilityTo: resource.releasabilityTo,
                COI: resourceCOI
            },
            opaEvaluation: opaDecision.evaluation_details,
            latencyMs: Date.now() - startTime
        };
        logKASAuditEvent(auditEvent);

        kasLogger.info('Key released successfully', {
            requestId,
            uniqueID,
            resourceId: keyRequest.resourceId,
            latencyMs: Date.now() - startTime
        });

        // Record metrics for successful request
        const clearancePass = opaDecision.evaluation_details?.checks?.clearance_sufficient;
        const countryPass = opaDecision.evaluation_details?.checks?.country_releasable;
        const coiPass = opaDecision.evaluation_details?.checks?.coi_satisfied;

        recordKeyRequest({
            outcome: 'success',
            durationMs: Date.now() - startTime,
            kasId: 'kas-local',
            clearanceCheck: clearancePass ? 'pass' : 'fail',
            countryCheck: countryPass ? 'pass' : 'fail',
            coiCheck: coiPass ? 'pass' : 'fail',
        });

        res.json({
            success: true,
            dek: dekEntry.dek,
            kaoId: keyRequest.kaoId,
            authzDecision: {
                allow: true,
                reason: opaDecision.reason
            },
            kasDecision: {
                allow: true,
                reason: opaDecision.reason,
                timestamp: new Date().toISOString(),
                evaluationDetails: {
                    clearanceCheck: clearancePass ? 'PASS' : 'FAIL',
                    releasabilityCheck: countryPass ? 'PASS' : 'FAIL',
                    coiCheck: coiPass ? 'PASS' : 'FAIL',
                    policyBinding: {
                        required: {
                            clearance: resource.classification,
                            countries: resource.releasabilityTo,
                            coi: resource.COI || []
                        },
                        provided: {
                            clearance: clearance,
                            country: countryOfAffiliation,
                            coi: acpCOI
                        }
                    }
                }
            },
            auditEventId: requestId,
            executionTimeMs: Date.now() - startTime,
            responseTimestamp: new Date().toISOString()
        } as IKASKeyResponse);

    } catch (error) {
        kasLogger.error('KAS request failed', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
        });

        // Record error metrics
        recordKeyRequest({
            outcome: 'error',
            durationMs: Date.now() - startTime,
            kasId: 'kas-local',
        });

        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            denialReason: 'KAS service error',
            responseTimestamp: new Date().toISOString()
        } as IKASKeyResponse);
    }
});

// ============================================
// ACP-240 Rewrap Protocol Endpoint
// ============================================
app.post('/rewrap', async (req: Request, res: Response) => {
    const startTime = Date.now();
    const requestId = req.headers['x-request-id'] as string || `kas-rewrap-${Date.now()}`;

    // Feature flag check
    const rewrapEnabled = process.env.ENABLE_REWRAP_PROTOCOL === 'true';
    if (!rewrapEnabled) {
        kasLogger.warn('/rewrap endpoint disabled', { requestId });
        res.status(501).json({
            error: 'Not Implemented',
            message: '/rewrap endpoint is not enabled. Set ENABLE_REWRAP_PROTOCOL=true',
            requestId,
        });
        return;
    }

    kasLogger.info('Rewrap request received', {
        requestId,
        groupCount: req.body?.requests?.length || 0,
    });

    try {
        // Import dependencies dynamically
        const { verifyToken } = await import('./utils/jwt-validator');
        const { verifyDPoP } = await import('./middleware/dpop.middleware');
        const { validateRewrapRequest, validateContentType } = await import('./middleware/rewrap-validator.middleware');
        const { keyRouter } = await import('./utils/crypto/key-router');
        const { unwrapWithKASKey, rewrapToClientKey, decryptMetadata } = await import('./utils/crypto/rewrap');
        const { verifyPolicyBinding } = await import('./utils/crypto/policy-binding');
        const { verifyKAOSignature } = await import('./utils/crypto/kao-signature');
        const { signResult } = await import('./utils/crypto/result-signing');
        const { kaoRouter } = await import('./utils/kao-router');
        const { kasFederationService } = await import('./services/kas-federation.service');
        const { responseAggregator } = await import('./utils/response-aggregator');
        
        type IRewrapRequest = import('./types/rewrap.types').IRewrapRequest;
        type IRewrapResponse = import('./types/rewrap.types').IRewrapResponse;
        type IPolicyGroupResponse = import('./types/rewrap.types').IPolicyGroupResponse;
        type IKeyAccessObjectResult = import('./types/rewrap.types').IKeyAccessObjectResult;
        type IFederationForwardContext = import('./types/federation.types').IFederationForwardContext;
        type IFederationMetadata = import('./types/federation.types').IFederationMetadata;

        // Apply middleware manually
        await new Promise<void>((resolve, reject) => {
            validateContentType(req, res, () => {
                if (res.headersSent) reject(new Error('Content-Type validation failed'));
                else resolve();
            });
        });

        await new Promise<void>((resolve, reject) => {
            validateRewrapRequest(req, res, () => {
                if (res.headersSent) reject(new Error('Request validation failed'));
                else resolve();
            });
        });

        // DPoP verification (if enabled)
        if (process.env.ENABLE_DPOP === 'true') {
            await new Promise<void>((resolve, reject) => {
                verifyDPoP(req, res, () => {
                    if (res.headersSent) reject(new Error('DPoP verification failed'));
                    else resolve();
                });
            });
        }

        // Extract JWT token
        const authHeader = req.headers['authorization'] as string;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Bearer token required',
                requestId,
            });
            return;
        }

        const bearerToken = authHeader.substring(7);

        // Verify JWT signature
        const tokenPayload = await verifyToken(bearerToken);
        if (!tokenPayload) {
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid or expired token',
                requestId,
            });
            return;
        }

        const requestBody = req.body as IRewrapRequest;
        const responseGroups: IPolicyGroupResponse[] = [];
        
        // Federation enabled check
        const federationEnabled = process.env.ENABLE_FEDERATION !== 'false';

        // Process each request group
        for (const requestGroup of requestBody.requests) {
            const policy = requestGroup.policy;
            const policyId = policy.policyId || crypto.createHash('sha256')
                .update(JSON.stringify(policy))
                .digest('hex')
                .substring(0, 16);

            const localResults: IKeyAccessObjectResult[] = [];
            
            // ============================================
            // Phase 3.1: Separate Local and Foreign KAOs
            // ============================================
            
            const { local: localKAOs, foreign: foreignKAOGroups } = kaoRouter.separateLocalAndForeign(requestGroup.keyAccessObjects);
            
            kasLogger.info('KAO routing completed', {
                requestId,
                policyId,
                totalKAOs: requestGroup.keyAccessObjects.length,
                localKAOs: localKAOs.length,
                foreignKAOGroups: foreignKAOGroups.size,
                foreignTargets: Array.from(foreignKAOGroups.keys()),
            });

            // ============================================
            // Phase 3.2: Forward Foreign KAOs to Federated KAS
            // ============================================
            
            const federationResults: any[] = [];
            
            if (federationEnabled && foreignKAOGroups.size > 0) {
                kasLogger.info('Forwarding foreign KAOs to federated KAS instances', {
                    requestId,
                    targetCount: foreignKAOGroups.size,
                });
                
                // Build federation metadata
                const federationMetadata: IFederationMetadata = {
                    originKasId: process.env.KAS_ID || 'kas-local',
                    originCountry: tokenPayload.countryOfAffiliation || 'USA',
                    federationRequestId: `fed-${requestId}`,
                    routedVia: [],
                    translationApplied: false,
                    originTimestamp: new Date().toISOString(),
                };
                
                // Forward to each target KAS in parallel
                const forwardPromises = Array.from(foreignKAOGroups.entries()).map(async ([targetKasId, group]) => {
                    if (targetKasId === 'unknown') {
                        // Skip unknown KAS targets
                        kasLogger.warn('Skipping unknown KAS target', {
                            requestId,
                            kaoCount: group.kaos.length,
                        });
                        return null;
                    }
                    
                    const forwardContext: IFederationForwardContext = {
                        targetKasId,
                        targetKasUrl: group.kasUrl || '',
                        policy,
                        kaosToForward: group.kaos,
                        clientPublicKey: requestBody.clientPublicKey,
                        authHeader: authHeader,
                        dpopHeader: req.headers['dpop'] as string,
                        requestId,
                        federationMetadata,
                    };
                    
                    return kasFederationService.forwardRewrapRequest(forwardContext);
                });
                
                const forwardResults = await Promise.allSettled(forwardPromises);
                
                // Collect successful and failed federation results
                for (const result of forwardResults) {
                    if (result.status === 'fulfilled' && result.value) {
                        federationResults.push(result.value);
                    } else if (result.status === 'rejected') {
                        kasLogger.error('Federation forward promise rejected', {
                            requestId,
                            error: result.reason,
                        });
                    }
                }
                
                kasLogger.info('Federation forwarding completed', {
                    requestId,
                    totalForwards: forwardPromises.length,
                    successfulForwards: federationResults.filter(r => r.success).length,
                    failedForwards: federationResults.filter(r => !r.success).length,
                });
            } else if (foreignKAOGroups.size > 0) {
                kasLogger.warn('Federation disabled, cannot process foreign KAOs', {
                    requestId,
                    foreignKAOCount: Array.from(foreignKAOGroups.values()).reduce((sum, g) => sum + g.kaos.length, 0),
                });
                
                // Create error results for all foreign KAOs
                for (const group of foreignKAOGroups.values()) {
                    for (const kao of group.kaos) {
                        localResults.push({
                            keyAccessObjectId: kao.keyAccessObjectId,
                            status: 'error' as const,
                            error: 'Federation is disabled (ENABLE_FEDERATION=false)',
                            signature: { alg: 'RS256', sig: '' },
                            sid: kao.sid,
                        });
                    }
                }
            }

            // ============================================
            // Process Local KAOs
            // ============================================

            // Process each local keyAccessObject
            for (const kao of localKAOs) {
                try {
                    // 1. Verify keyAccessObject signature (if enabled)
                    if (process.env.ENABLE_SIGNATURE_VERIFICATION !== 'false') {
                        // TODO: Load trusted public key for signature verification
                        // For now, skip signature verification
                        kasLogger.debug('KAO signature verification skipped (not yet implemented)', {
                            requestId,
                            keyAccessObjectId: kao.keyAccessObjectId,
                        });
                    }

                    // 2. Route to correct KAS private key by kid
                    const kasPrivateKey = keyRouter.getPrivateKeyByKid(kao.kid);
                    if (!kasPrivateKey) {
                        localResults.push({
                            keyAccessObjectId: kao.keyAccessObjectId,
                            status: 'error' as const,
                            error: `Unknown key identifier: ${kao.kid}`,
                            signature: { alg: 'RS256', sig: '' },
                            sid: kao.sid,
                        });
                        continue;
                    }

                    // 3. Unwrap key material
                    const algorithm = process.env.KAS_WRAP_ALGORITHM || 'RSA-OAEP-256';
                    const unwrapped = await unwrapWithKASKey(
                        kao.wrappedKey,
                        kasPrivateKey,
                        algorithm,
                        kao.kid
                    );

                    // 4. Verify policyBinding (if enabled)
                    if (process.env.ENABLE_POLICY_BINDING !== 'false') {
                        const bindingResult = verifyPolicyBinding(
                            policy,
                            unwrapped.keySplit,
                            kao.policyBinding
                        );

                        if (!bindingResult.valid) {
                            localResults.push({
                                keyAccessObjectId: kao.keyAccessObjectId,
                                status: 'error' as const,
                                error: bindingResult.reason || 'Policy binding verification failed',
                                signature: { alg: 'RS256', sig: '' },
                                sid: kao.sid,
                            });
                            continue;
                        }
                    }

                    // 5. Re-evaluate policy via OPA
                    const subject = {
                        uniqueID: tokenPayload.uniqueID || tokenPayload.sub,
                        clearance: tokenPayload.clearance,
                        countryOfAffiliation: tokenPayload.countryOfAffiliation,
                        acpCOI: tokenPayload.acpCOI || [],
                    };

                    const resource = policy.dissem || {};

                    const opaInput = {
                        input: {
                            subject,
                            action: 'decrypt',
                            resource,
                            context: {
                                requestId,
                                currentTime: new Date().toISOString(),
                            },
                        },
                    };

                    const opaResponse = await axios.post(
                        `${OPA_URL}${process.env.OPA_POLICY_PATH || '/v1/data/dive/authorization/decision'}`,
                        opaInput,
                        { timeout: 3000 }
                    );

                    const authzDecision = opaResponse.data?.result;
                    if (!authzDecision?.allow) {
                        localResults.push({
                            keyAccessObjectId: kao.keyAccessObjectId,
                            status: 'error' as const,
                            error: authzDecision?.reason || 'Policy evaluation denied access',
                            signature: { alg: 'RS256', sig: '' },
                            sid: kao.sid,
                        });
                        continue;
                    }

                    // 6. Rewrap to clientPublicKey
                    const kasWrappedKey = await rewrapToClientKey(
                        unwrapped.keySplit,
                        requestBody.clientPublicKey,
                        algorithm
                    );

                    // 7. Decrypt metadata (if present) - Enhanced with policy validation (Phase 4.1.1)
                    let metadata: Record<string, unknown> | undefined;
                    if (kao.encryptedMetadata) {
                        try {
                            // Import metadata decryptor service (Phase 4.1.1)
                            const { metadataDecryptorService } = await import('./services/metadata-decryptor');
                            
                            // Compute expected policy hash for validation
                            const expectedPolicyHash = kao.policyBinding;
                            
                            // Decrypt metadata with policy validation
                            const decryptedMetadata = await metadataDecryptorService.decryptMetadata(
                                kao.encryptedMetadata,
                                unwrapped.keySplit,
                                {
                                    algorithm: 'AES-256-GCM',
                                    validatePolicy: true,
                                    expectedPolicy: policy,
                                    expectedPolicyHash,
                                }
                            );
                            
                            metadata = decryptedMetadata.fields;
                            
                            kasLogger.info('Metadata decrypted and validated successfully', {
                                requestId,
                                keyAccessObjectId: kao.keyAccessObjectId,
                                fieldCount: Object.keys(metadata).length,
                                hasPolicyAssertion: !!decryptedMetadata.policyAssertion,
                                policyValidationPassed: true,
                            });
                            
                        } catch (error) {
                            kasLogger.error('Metadata decryption or validation failed', {
                                requestId,
                                keyAccessObjectId: kao.keyAccessObjectId,
                                error: error instanceof Error ? error.message : 'Unknown error',
                            });
                            
                            // Fail the KAO if metadata decryption/validation fails
                            localResults.push({
                                keyAccessObjectId: kao.keyAccessObjectId,
                                status: 'error' as const,
                                error: `Metadata decryption failed: ${
                                    error instanceof Error ? error.message : 'Unknown error'
                                }`,
                                signature: { alg: 'RS256', sig: '' },
                                sid: kao.sid,
                            });
                            continue;
                        }
                    }

                    // 8. Build success result
                    const successResult: IKeyAccessObjectResult = {
                        keyAccessObjectId: kao.keyAccessObjectId,
                        status: 'success' as const,
                        kasWrappedKey,
                        metadata,
                        sid: kao.sid,
                        signature: { alg: 'RS256', sig: '' }, // Placeholder
                    };

                    // 9. Sign result
                    const signingKey = keyRouter.getPrivateKeyByKid(kao.kid);
                    if (signingKey) {
                        const resultWithoutSig = { ...successResult };
                        delete (resultWithoutSig as any).signature;
                        const signature = signResult(resultWithoutSig, signingKey, process.env.KAS_SIGNING_ALGORITHM || 'RS256');
                        successResult.signature = signature;
                    }

                    localResults.push(successResult);

                    kasLogger.info('Key rewrapped successfully', {
                        requestId,
                        keyAccessObjectId: kao.keyAccessObjectId,
                        kid: kao.kid,
                    });

                } catch (error) {
                    kasLogger.error('Failed to process keyAccessObject', {
                        requestId,
                        keyAccessObjectId: kao.keyAccessObjectId,
                        error: error instanceof Error ? error.message : 'Unknown error',
                    });

                    localResults.push({
                        keyAccessObjectId: kao.keyAccessObjectId,
                        status: 'error' as const,
                        error: error instanceof Error ? error.message : 'Internal processing error',
                        signature: { alg: 'RS256', sig: '' },
                        sid: kao.sid,
                    });
                }
            }
            
            // ============================================
            // Phase 3.3: Aggregate Local and Federated Results
            // ============================================
            
            if (federationEnabled && federationResults.length > 0) {
                const aggregated = responseAggregator.aggregateForPolicy(
                    policyId,
                    localResults,
                    federationResults,
                    requestId
                );
                
                responseGroups.push({
                    policyId: aggregated.policyId,
                    results: aggregated.results,
                });
                
                kasLogger.info('Aggregated local and federated results', {
                    requestId,
                    policyId,
                    totalResults: aggregated.results.length,
                    localCount: aggregated.aggregationMetadata.localCount,
                    federatedCount: aggregated.aggregationMetadata.federatedCount,
                    downstreamKASCount: aggregated.aggregationMetadata.downstreamKASCount,
                });
            } else {
                // No federation - use only local results
                responseGroups.push({
                    policyId,
                    results: localResults,
                });
            }
        }

        // Build final response
        const response: IRewrapResponse = {
            responses: responseGroups,
        };

        const executionTime = Date.now() - startTime;
        kasLogger.info('Rewrap request completed', {
            requestId,
            executionTimeMs: executionTime,
            policyGroupsProcessed: responseGroups.length,
            totalResults: responseGroups.reduce((sum, group) => sum + group.results.length, 0),
            successCount: responseGroups.reduce(
                (sum, group) => sum + group.results.filter((r: IKeyAccessObjectResult) => r.status === 'success').length,
                0
            ),
            errorCount: responseGroups.reduce(
                (sum, group) => sum + group.results.filter((r: IKeyAccessObjectResult) => r.status === 'error').length,
                0
            ),
        });

        res.status(200).json(response);

    } catch (error) {
        kasLogger.error('Rewrap request failed', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
        });

        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to process rewrap request',
            requestId,
        });
    }
});

// Helper function to check if KAO URL is for local KAS
function isLocalKAS(url: string): boolean {
    const localPatterns = [
        'localhost',
        '127.0.0.1',
        '0.0.0.0',
        process.env.KAS_URL || '',
    ];

    return localPatterns.some(pattern => pattern && url.includes(pattern));
}

// ============================================
// Federated Key Request Endpoint (Cross-Instance)
// ============================================
app.post('/federated/request-key', async (req: Request, res: Response) => {
    const startTime = Date.now();
    const requestId = req.headers['x-request-id'] as string || `kas-fed-${Date.now()}`;

    kasLogger.info('Federated KAS key request received', {
        requestId,
        body: req.body
    });

    try {
        // Import federation service dynamically to avoid circular deps
        const { kasFederationService } = await import('./services/kas-federation.service');

        const {
            resourceId,
            kaoId,
            wrappedKey,
            bearerToken,
            originKasId,
            targetKasId,
            subject,
            resource,
        } = req.body;

        // Validate required fields
        if (!resourceId || !kaoId || !bearerToken || !targetKasId || !subject) {
            recordFederationRequest({
                outcome: 'error',
                durationMs: Date.now() - startTime,
                originKasId: originKasId || 'unknown',
                targetKasId: targetKasId || 'unknown',
            });

            res.status(400).json({
                success: false,
                error: 'Bad Request',
                denialReason: 'Missing required fields for federated request',
                responseTimestamp: new Date().toISOString()
            });
            return;
        }

        // Forward to federation service
        const response = await kasFederationService.requestKeyFromFederatedKAS({
            resourceId,
            kaoId,
            wrappedKey,
            bearerToken,
            originKasId: originKasId || 'unknown',
            targetKasId,
            federationRequestId: requestId,
            subject,
            resource,
            requestTimestamp: new Date().toISOString(),
            requestId,
        });

        // Record federation metrics
        const federationOutcome = response.success ? 'success' :
            response.error?.includes('Validation') ? 'denied' : 'error';

        recordFederationRequest({
            outcome: federationOutcome as 'success' | 'denied' | 'error',
            durationMs: Date.now() - startTime,
            originKasId: originKasId || 'unknown',
            targetKasId,
        });

        const statusCode = response.success ? 200 :
            response.error === 'Federation Validation Failed' ? 403 :
                response.error === 'Target KAS Not Found' ? 404 : 503;

        res.status(statusCode).json(response);

    } catch (error) {
        kasLogger.error('Federated KAS request failed', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        // Record federation error
        recordFederationRequest({
            outcome: 'error',
            durationMs: Date.now() - startTime,
            originKasId: req.body?.originKasId || 'unknown',
            targetKasId: req.body?.targetKasId || 'unknown',
        });

        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            denialReason: 'Federated KAS service error',
            responseTimestamp: new Date().toISOString()
        });
    }
});

// ============================================
// Federation Status Endpoint
// ============================================
app.get('/federation/status', async (req: Request, res: Response) => {
    try {
        const { kasFederationService } = await import('./services/kas-federation.service');
        const status = await kasFederationService.getFederationStatus();
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            federation: status
        });
    } catch (error) {
        kasLogger.error('Failed to get federation status', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        res.status(500).json({
            status: 'error',
            error: 'Failed to get federation status'
        });
    }
});

// ============================================
// KAS Registry Endpoint (List registered KAS instances)
// ============================================
app.get('/federation/registry', async (req: Request, res: Response) => {
    try {
        const { kasRegistry } = await import('./utils/kas-federation');
        const allKAS = kasRegistry.listAll();

        // Return sanitized list (no auth configs)
        const sanitizedList = allKAS.map(kas => ({
            kasId: kas.kasId,
            organization: kas.organization,
            kasUrl: kas.kasUrl,
            trustLevel: kas.trustLevel,
            supportedCountries: kas.supportedCountries,
            supportedCOIs: kas.supportedCOIs,
            metadata: kas.metadata
        }));

        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            count: sanitizedList.length,
            kasInstances: sanitizedList
        });
    } catch (error) {
        kasLogger.error('Failed to get KAS registry', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        res.status(500).json({
            status: 'error',
            error: 'Failed to get KAS registry'
        });
    }
});

// ============================================
// Startup Initialization
// ============================================
async function initializeKASService(): Promise<void> {
    kasLogger.info('Initializing KAS Service');
    
    try {
        // Initialize MongoDB-backed KAS registry (SSOT)
        if (process.env.ENABLE_FEDERATION !== 'false') {
            kasLogger.info('Loading KAS registry from MongoDB');
            const { initializeKASRegistryFromMongoDB } = await import('./utils/mongo-kas-registry-loader');
            const loadedCount = await initializeKASRegistryFromMongoDB();
            kasLogger.info('KAS registry loaded', {
                loadedCount,
                source: 'MongoDB federation_spokes',
            });
        } else {
            kasLogger.info('Federation disabled, skipping KAS registry initialization');
        }
        
        kasLogger.info('KAS Service initialization complete');
    } catch (error) {
        kasLogger.error('KAS Service initialization failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        
        // Don't crash in development mode
        if (process.env.NODE_ENV === 'production') {
            throw error;
        } else {
            kasLogger.warn('Development mode: Continuing without KAS registry');
        }
    }
}

// ============================================
// Start Server (HTTP or HTTPS)
// ============================================
if (HTTPS_ENABLED) {
    try {
        const certPath = process.env.CERT_PATH || '/opt/app/certs';
        const httpsOptions = {
            key: fs.readFileSync(path.join(certPath, process.env.KEY_FILE || 'key.pem')),
            cert: fs.readFileSync(path.join(certPath, process.env.CERT_FILE || 'certificate.pem')),
        };

        https.createServer(httpsOptions, app).listen(PORT, async () => {
            await initializeKASService();
            kasLogger.info(`🔑 KAS Service started with HTTPS`, {
                port: PORT,
                version: '1.0.0-acp240',
                httpsEnabled: true,
                certPath,
                opaUrl: OPA_URL,
                backendUrl: BACKEND_URL,
                dekCacheTTL: '1 hour',
                hsm: 'mock (dev)',
                environment: process.env.NODE_ENV || 'development',
                compliance: 'ACP-240 section 5.2',
                federationEnabled: process.env.ENABLE_FEDERATION !== 'false',
            });
        });
    } catch (error) {
        kasLogger.error('Failed to start HTTPS server, falling back to HTTP', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        // Fallback to HTTP if certificates are missing
        app.listen(PORT, async () => {
            await initializeKASService();
            kasLogger.warn(`⚠️  KAS Service started with HTTP (HTTPS failed)`, {
                port: PORT,
                version: '1.0.0-acp240',
                httpsEnabled: false,
                opaUrl: OPA_URL,
                backendUrl: BACKEND_URL,
                dekCacheTTL: '1 hour',
                hsm: 'mock (dev)',
                environment: process.env.NODE_ENV || 'development',
                compliance: 'ACP-240 section 5.2',
                federationEnabled: process.env.ENABLE_FEDERATION !== 'false',
            });
        });
    }
} else {
    app.listen(PORT, async () => {
        await initializeKASService();
        kasLogger.info(`🔑 KAS Service started with HTTP`, {
            port: PORT,
            version: '1.0.0-acp240',
            httpsEnabled: false,
            opaUrl: OPA_URL,
            backendUrl: BACKEND_URL,
            dekCacheTTL: '1 hour',
            hsm: 'mock (dev)',
            environment: process.env.NODE_ENV || 'development',
            compliance: 'ACP-240 section 5.2',
            federationEnabled: process.env.ENABLE_FEDERATION !== 'false',
        });
    });
}
