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
const OPA_URL = process.env.OPA_URL || 'http://localhost:8181';
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
        try {
            // SECURE: Verify JWT signature with JWKS (RS256)
            decodedToken = await verifyToken(keyRequest.bearerToken);

            kasLogger.info('JWT signature verified successfully', {
                requestId,
                sub: decodedToken.sub,
                iss: `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}`,
                aud: decodedToken.aud,
                exp: decodedToken.exp,
                iat: decodedToken.iat
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

        const uniqueID = decodedToken.uniqueID || decodedToken.preferred_username || decodedToken.sub;
        const clearance = decodedToken.clearance;
        const countryOfAffiliation = decodedToken.countryOfAffiliation;
        const dutyOrg = decodedToken.dutyOrg;        // Gap #4: Organization attribute
        const orgUnit = decodedToken.orgUnit;        // Gap #4: Organizational unit

        // Parse acpCOI - handle string or array (same fix as upload controller)
        let acpCOI: string[] = [];
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
        // 3. Fetch Resource Metadata (from backend)
        // ============================================
        let resource: any;
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

        // ============================================
        // 4. Re-Evaluate OPA Policy (Defense in Depth)
        // ============================================
        // Ensure arrays are properly typed for OPA (same fix as upload)
        const userCOI = Array.isArray(acpCOI) ? acpCOI : [];
        const resourceCOI = Array.isArray(resource.COI) ? resource.COI : [];

        const opaInput = {
            input: {
                subject: {
                    authenticated: true,
                    uniqueID,
                    clearance,
                    countryOfAffiliation,
                    acpCOI: userCOI,  // ✅ Guaranteed array
                    dutyOrg,          // Gap #4: Organization attribute
                    orgUnit           // Gap #4: Organizational unit
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
            const opaResponse = await axios.post(
                `${OPA_URL}/v1/data/dive/authorization`,
                opaInput,
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 5000
                }
            );

            // Extract decision from OPA response
            opaDecision = opaResponse.data.result?.decision || opaResponse.data.result;
            
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
// Start Server (HTTP or HTTPS)
// ============================================
if (HTTPS_ENABLED) {
    try {
        const certPath = process.env.CERT_PATH || '/opt/app/certs';
        const httpsOptions = {
            key: fs.readFileSync(path.join(certPath, process.env.KEY_FILE || 'key.pem')),
            cert: fs.readFileSync(path.join(certPath, process.env.CERT_FILE || 'certificate.pem')),
        };

        https.createServer(httpsOptions, app).listen(PORT, () => {
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
            });
        });
    } catch (error) {
        kasLogger.error('Failed to start HTTPS server, falling back to HTTP', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        // Fallback to HTTP if certificates are missing
        app.listen(PORT, () => {
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
            });
        });
    }
} else {
    app.listen(PORT, () => {
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
        });
    });
}

