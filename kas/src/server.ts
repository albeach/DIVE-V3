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
import cors from 'cors';
import { config } from 'dotenv';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import NodeCache from 'node-cache';

import { kasLogger, logKASAuditEvent } from './utils/kas-logger';
import {
    IKASKeyRequest,
    IKASKeyResponse,
    IKASAuditEvent,
    IDEKCacheEntry
} from './types/kas.types';

config({ path: '.env.local' });

const app: Application = express();
const PORT = process.env.KAS_PORT || 8080;
const OPA_URL = process.env.OPA_URL || 'http://localhost:8181';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

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
            'Fail-closed enforcement'
        ]
    });
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
        let decodedToken: any;
        try {
            // For pilot: Decode without verification (production: verify with JWKS)
            decodedToken = jwt.decode(keyRequest.bearerToken);
            if (!decodedToken) {
                throw new Error('Invalid token');
            }
        } catch (error) {
            kasLogger.error('JWT verification failed', {
                requestId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });

            const auditEvent: IKASAuditEvent = {
                eventType: 'KEY_DENIED',
                timestamp: new Date().toISOString(),
                requestId,
                subject: 'unknown',
                resourceId: keyRequest.resourceId,
                kaoId: keyRequest.kaoId,
                outcome: 'DENY',
                reason: 'Invalid JWT token',
                latencyMs: Date.now() - startTime
            };
            logKASAuditEvent(auditEvent);

            res.status(401).json({
                success: false,
                error: 'Unauthorized',
                denialReason: 'Invalid or expired JWT token',
                responseTimestamp: new Date().toISOString()
            } as IKASKeyResponse);
            return;
        }

        const uniqueID = decodedToken.uniqueID || decodedToken.preferred_username || decodedToken.sub;
        const clearance = decodedToken.clearance;
        const countryOfAffiliation = decodedToken.countryOfAffiliation;
        const acpCOI = decodedToken.acpCOI || [];

        kasLogger.info('Token validated', {
            requestId,
            uniqueID,
            clearance,
            country: countryOfAffiliation
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
        const opaInput = {
            input: {
                subject: {
                    authenticated: true,
                    uniqueID,
                    clearance,
                    countryOfAffiliation,
                    acpCOI
                },
                action: {
                    operation: 'decrypt' // KAS-specific action
                },
                resource: {
                    resourceId: resource.resourceId,
                    classification: resource.classification,
                    releasabilityTo: resource.releasabilityTo,
                    COI: resource.COI || [],
                    creationDate: resource.creationDate,
                    encrypted: true
                },
                context: {
                    currentTime: new Date().toISOString(),
                    sourceIP: req.ip || 'unknown',
                    deviceCompliant: true,
                    requestId
                }
            }
        };

        let opaDecision: any;
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

            kasLogger.info('OPA policy re-evaluation completed', {
                requestId,
                allow: opaDecision.allow,
                reason: opaDecision.reason
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

            const auditEvent: IKASAuditEvent = {
                eventType: 'KEY_DENIED',
                timestamp: new Date().toISOString(),
                requestId,
                subject: uniqueID,
                resourceId: keyRequest.resourceId,
                kaoId: keyRequest.kaoId,
                outcome: 'DENY',
                reason: opaDecision.reason,
                subjectAttributes: { clearance, countryOfAffiliation, acpCOI },
                resourceAttributes: {
                    classification: resource.classification,
                    releasabilityTo: resource.releasabilityTo,
                    COI: resource.COI
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
                responseTimestamp: new Date().toISOString()
            } as IKASKeyResponse);
            return;
        }

        // ============================================
        // 6. Retrieve/Unwrap DEK
        // ============================================
        // In pilot: Mock DEK retrieval (production: HSM-backed unwrap)
        const cacheKey = `dek:${keyRequest.resourceId}:${keyRequest.kaoId}`;
        let dekEntry: IDEKCacheEntry | undefined = dekCache.get(cacheKey);

        if (!dekEntry) {
            // Generate mock DEK (in production: retrieve from HSM)
            const dek = crypto.randomBytes(32).toString('base64');

            dekEntry = {
                resourceId: keyRequest.resourceId,
                dek,
                kekId: 'mock-kek-001',
                wrappedDEK: crypto.randomBytes(256).toString('base64'), // Mock wrapped DEK
                wrappingAlgorithm: 'RSA-OAEP-256',
                createdAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 3600000).toISOString() // 1 hour
            };

            dekCache.set(cacheKey, dekEntry);
            kasLogger.info('DEK generated and cached (mock)', { requestId, resourceId: keyRequest.resourceId });
        } else {
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
            subjectAttributes: { clearance, countryOfAffiliation, acpCOI },
            resourceAttributes: {
                classification: resource.classification,
                releasabilityTo: resource.releasabilityTo,
                COI: resource.COI
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

        res.json({
            success: true,
            dek: dekEntry.dek,
            authzDecision: {
                allow: true,
                reason: opaDecision.reason
            },
            responseTimestamp: new Date().toISOString()
        } as IKASKeyResponse);

    } catch (error) {
        kasLogger.error('KAS request failed', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
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
// Start Server
// ============================================
app.listen(PORT, () => {
    kasLogger.info(`🔑 KAS Service started`, {
        port: PORT,
        version: '1.0.0-acp240',
        opaUrl: OPA_URL,
        backendUrl: BACKEND_URL
    });
    console.log(`🔑 KAS Service started on port ${PORT}`);
    console.log(`   Version: 1.0.0-acp240 (NATO ACP-240 Compliant)`);
    console.log(`   OPA: ${OPA_URL}`);
    console.log(`   Backend: ${BACKEND_URL}`);
});

