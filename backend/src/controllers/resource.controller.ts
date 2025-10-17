import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { getResourceById, getAllResources } from '../services/resource.service';
import { NotFoundError } from '../middleware/error.middleware';
import { IZTDFResource } from '../types/ztdf.types';
import { validateZTDFIntegrity, decryptContent } from '../utils/ztdf.utils';
import axios from 'axios';

/**
 * Check if resource is ZTDF-enhanced
 */
function isZTDFResource(resource: any): resource is IZTDFResource {
    return resource && typeof resource === 'object' && 'ztdf' in resource;
}

/**
 * List all resources
 * Week 3.1: Enhanced with ZTDF support and STANAG 4774 display markings
 */
export const listResourcesHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string;

    try {
        logger.info('Listing resources', { requestId });

        const resources = await getAllResources();

        // Return basic metadata with STANAG 4774 display markings
        const resourceList = resources.map(r => {
            if (isZTDFResource(r)) {
                // ZTDF-enhanced resource
                return {
                    resourceId: r.resourceId,
                    title: r.title,
                    classification: r.ztdf.policy.securityLabel.classification,
                    releasabilityTo: r.ztdf.policy.securityLabel.releasabilityTo,
                    COI: r.ztdf.policy.securityLabel.COI || [],
                    encrypted: true, // ZTDF is always encrypted
                    creationDate: r.ztdf.policy.securityLabel.creationDate,
                    displayMarking: r.ztdf.policy.securityLabel.displayMarking, // ACP-240 STANAG 4774
                    ztdfVersion: r.ztdf.manifest.version
                };
            } else {
                // Legacy resource (should not happen after migration)
                const legacyResource: any = r;
                return {
                    resourceId: legacyResource.resourceId,
                    title: legacyResource.title,
                    classification: legacyResource.classification,
                    releasabilityTo: legacyResource.releasabilityTo,
                    COI: legacyResource.COI || [],
                    encrypted: legacyResource.encrypted || false,
                    creationDate: legacyResource.creationDate
                };
            }
        });

        res.json({
            resources: resourceList,
            count: resourceList.length,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Get a specific resource by ID
 * Week 3.1: Enhanced with ZTDF support and KAS obligations
 */
export const getResourceHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string;
    const { id } = req.params;

    try {
        logger.info('Fetching resource', { requestId, resourceId: id });

        const resource = await getResourceById(id);

        if (!resource) {
            throw new NotFoundError(`Resource ${id} not found`);
        }

        // Check if PEP set any obligations (e.g., KAS key request required)
        const obligations = (req as any).authzObligations || [];
        const kasObligation = obligations.find((o: any) => o.type === 'kas');

        if (isZTDFResource(resource)) {
            // ZTDF-enhanced resource
            const response: any = {
                resourceId: resource.resourceId,
                title: resource.title,
                classification: resource.ztdf.policy.securityLabel.classification,
                releasabilityTo: resource.ztdf.policy.securityLabel.releasabilityTo,
                COI: resource.ztdf.policy.securityLabel.COI || [],
                encrypted: true,
                creationDate: resource.ztdf.policy.securityLabel.creationDate,

                // ACP-240: STANAG 4774 Display Marking (prominent)
                displayMarking: resource.ztdf.policy.securityLabel.displayMarking,

                // ZTDF metadata
                ztdf: {
                    version: resource.ztdf.manifest.version,
                    objectType: resource.ztdf.manifest.objectType,
                    contentType: resource.ztdf.manifest.contentType,
                    policyVersion: resource.ztdf.policy.policyVersion,
                    encryptionAlgorithm: resource.ztdf.payload.encryptionAlgorithm,
                    kaoCount: resource.ztdf.payload.keyAccessObjects.length
                },

                metadata: {
                    createdAt: resource.createdAt,
                    updatedAt: resource.updatedAt
                }
            };

            // If KAS obligation present, include KAS endpoint info
            if (kasObligation) {
                response.kasObligation = {
                    required: true,
                    kasUrl: resource.ztdf.payload.keyAccessObjects[0]?.kasUrl,
                    wrappedKey: resource.ztdf.payload.keyAccessObjects[0]?.wrappedKey, // PILOT: Expose for KAS to use
                    message: 'Decryption key must be requested from KAS'
                };
                // CRITICAL: Set content to sentinel value so frontend knows to show KAS UI
                response.content = '[Encrypted - KAS key request required]';
            } else {
                // Return decrypted content (if available from legacy)
                if (resource.legacy?.content) {
                    response.content = resource.legacy.content;
                } else {
                    response.content = '[Encrypted - KAS key request required]';
                }
            }

            res.json(response);

        } else {
            // Legacy resource (should not happen after migration)
            const legacyResource: any = resource;
            res.json({
                resourceId: legacyResource.resourceId,
                title: legacyResource.title,
                classification: legacyResource.classification,
                releasabilityTo: legacyResource.releasabilityTo,
                COI: legacyResource.COI || [],
                encrypted: legacyResource.encrypted || false,
                creationDate: legacyResource.creationDate,
                content: legacyResource.content,
                metadata: {
                    createdAt: legacyResource.createdAt,
                    updatedAt: legacyResource.updatedAt
                }
            });
        }

    } catch (error) {
        next(error);
    }
};

/**
 * Get ZTDF details for a resource
 * Week 3.4.3: UI/UX transparency for ZTDF structure and integrity validation
 */
export const getZTDFDetailsHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string;
    const { id } = req.params;

    try {
        logger.info('Fetching ZTDF details', { requestId, resourceId: id });

        const resource = await getResourceById(id);

        if (!resource) {
            throw new NotFoundError(`Resource ${id} not found`);
        }

        if (!isZTDFResource(resource)) {
            // Legacy resource without ZTDF
            res.status(400).json({
                error: 'Bad Request',
                message: 'This resource is not in ZTDF format'
            });
            return;
        }

        // Validate ZTDF integrity
        const integrityResult = validateZTDFIntegrity(resource.ztdf);

        logger.info('ZTDF integrity validation completed', {
            requestId,
            resourceId: id,
            valid: integrityResult.valid,
            policyHashValid: integrityResult.policyHashValid,
            payloadHashValid: integrityResult.payloadHashValid,
            allChunksValid: integrityResult.allChunksValid
        });

        // Build comprehensive ZTDF details response
        const response = {
            resourceId: resource.resourceId,
            title: resource.title,
            ztdfDetails: {
                // Manifest Section
                manifest: {
                    objectId: resource.ztdf.manifest.objectId,
                    objectType: resource.ztdf.manifest.objectType,
                    version: resource.ztdf.manifest.version,
                    contentType: resource.ztdf.manifest.contentType,
                    payloadSize: resource.ztdf.manifest.payloadSize,
                    owner: resource.ztdf.manifest.owner,
                    ownerOrganization: resource.ztdf.manifest.ownerOrganization || 'N/A',
                    createdAt: resource.ztdf.manifest.createdAt,
                    modifiedAt: resource.ztdf.manifest.modifiedAt || resource.ztdf.manifest.createdAt
                },

                // Policy Section
                policy: {
                    policyVersion: resource.ztdf.policy.policyVersion,
                    policyHash: resource.ztdf.policy.policyHash || 'N/A',
                    policyHashValid: integrityResult.policyHashValid,

                    // Security Label (STANAG 4774)
                    securityLabel: {
                        classification: resource.ztdf.policy.securityLabel.classification,
                        releasabilityTo: resource.ztdf.policy.securityLabel.releasabilityTo,
                        COI: resource.ztdf.policy.securityLabel.COI || [],
                        caveats: resource.ztdf.policy.securityLabel.caveats || [],
                        originatingCountry: resource.ztdf.policy.securityLabel.originatingCountry,
                        creationDate: resource.ztdf.policy.securityLabel.creationDate,
                        displayMarking: resource.ztdf.policy.securityLabel.displayMarking || 'N/A'
                    },

                    // Policy Assertions
                    policyAssertions: resource.ztdf.policy.policyAssertions.map(assertion => ({
                        type: assertion.type,
                        value: assertion.value,
                        condition: assertion.condition
                    }))
                },

                // Payload Section
                payload: {
                    encryptionAlgorithm: resource.ztdf.payload.encryptionAlgorithm,
                    iv: resource.ztdf.payload.iv,
                    authTag: resource.ztdf.payload.authTag,
                    payloadHash: resource.ztdf.payload.payloadHash,
                    payloadHashValid: integrityResult.payloadHashValid,

                    // Key Access Objects (redact wrapped key for security)
                    keyAccessObjects: resource.ztdf.payload.keyAccessObjects.map(kao => ({
                        kaoId: kao.kaoId,
                        kasUrl: kao.kasUrl,
                        kasId: kao.kasId,
                        wrappingAlgorithm: kao.wrappingAlgorithm,
                        policyBinding: {
                            clearanceRequired: kao.policyBinding.clearanceRequired || 'N/A',
                            countriesAllowed: kao.policyBinding.countriesAllowed || [],
                            coiRequired: kao.policyBinding.coiRequired || []
                        },
                        createdAt: kao.createdAt
                        // Note: wrappedKey intentionally omitted for security
                    })),

                    // Encrypted Chunks
                    encryptedChunks: resource.ztdf.payload.encryptedChunks.map((chunk, idx) => ({
                        chunkId: chunk.chunkId,
                        size: chunk.size,
                        integrityHash: chunk.integrityHash,
                        integrityHashValid: integrityResult.chunkHashesValid[idx] !== undefined
                            ? integrityResult.chunkHashesValid[idx]
                            : false
                    }))
                },

                // Integrity Status Summary
                integrityStatus: {
                    overallValid: integrityResult.valid,
                    policyHashValid: integrityResult.policyHashValid,
                    payloadHashValid: integrityResult.payloadHashValid,
                    allChunkHashesValid: integrityResult.allChunksValid,
                    validationTimestamp: new Date().toISOString(),
                    issues: integrityResult.issues,
                    errors: integrityResult.errors,
                    warnings: integrityResult.warnings
                }
            }
        };

        res.json(response);

    } catch (error) {
        logger.error('Failed to get ZTDF details', {
            requestId,
            resourceId: id,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        next(error);
    }
};

/**
 * Get KAS flow status for a resource
 * Week 3.4.3: KAS Flow Visualizer - shows 6-step access flow
 */
export const getKASFlowHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string;
    const { id } = req.params;

    try {
        logger.info('Fetching KAS flow status', { requestId, resourceId: id });

        const resource = await getResourceById(id);

        if (!resource) {
            throw new NotFoundError(`Resource ${id} not found`);
        }

        if (!isZTDFResource(resource)) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'This resource is not in ZTDF format'
            });
            return;
        }

        const encrypted = resource.ztdf.payload.keyAccessObjects.length > 0;
        const kasRequired = encrypted;

        // Build 6-step KAS flow
        const flow = {
            step1: {
                name: 'Resource Access Request',
                status: 'COMPLETE' as const,
                timestamp: new Date().toISOString(),
                details: 'User requested access to encrypted resource'
            },
            step2: {
                name: 'OPA Policy Evaluation',
                status: 'COMPLETE' as const,
                timestamp: new Date().toISOString(),
                details: 'OPA detected KAS obligation',
                opaDecision: {
                    allow: true,
                    obligations: [
                        { type: 'kas', resourceId: resource.resourceId }
                    ]
                }
            },
            step3: {
                name: 'Key Request to KAS',
                status: 'PENDING' as const,
                timestamp: null,
                details: 'Ready to request key from KAS',
                kasUrl: encrypted ? resource.ztdf.payload.keyAccessObjects[0].kasUrl : null
            },
            step4: {
                name: 'KAS Policy Re-evaluation',
                status: 'PENDING' as const,
                timestamp: null,
                details: 'Awaiting policy re-evaluation',
                policyCheck: null
            },
            step5: {
                name: 'Key Release',
                status: 'PENDING' as const,
                timestamp: null,
                details: 'Awaiting key release from KAS'
            },
            step6: {
                name: 'Content Decryption',
                status: 'PENDING' as const,
                timestamp: null,
                details: 'Will decrypt content with released key'
            }
        };

        // Get KAO details if available
        const kaoDetails = encrypted ? {
            kaoId: resource.ztdf.payload.keyAccessObjects[0].kaoId,
            kasUrl: resource.ztdf.payload.keyAccessObjects[0].kasUrl,
            policyBinding: resource.ztdf.payload.keyAccessObjects[0].policyBinding
        } : null;

        const response = {
            resourceId: resource.resourceId,
            encrypted,
            kasRequired,
            flow,
            kaoDetails
        };

        res.json(response);

    } catch (error) {
        logger.error('Failed to get KAS flow status', {
            requestId,
            resourceId: id,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        next(error);
    }
};

/**
 * Request decryption key from KAS
 * Week 3.4.3: KAS Request Modal - handles live key request and decryption
 */
export const requestKeyHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string;
    const { resourceId, kaoId } = req.body;
    const startTime = Date.now();

    try {
        logger.info('Key request initiated', { requestId, resourceId, kaoId });

        // Validate inputs
        if (!resourceId || !kaoId) {
            res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'resourceId and kaoId are required'
            });
            return;
        }

        // Get bearer token from request
        const bearerToken = req.headers.authorization?.replace('Bearer ', '');
        if (!bearerToken) {
            res.status(401).json({
                success: false,
                error: 'Unauthorized',
                message: 'JWT token required'
            });
            return;
        }

        // Fetch resource
        const resource = await getResourceById(resourceId);
        if (!resource) {
            throw new NotFoundError(`Resource ${resourceId} not found`);
        }

        if (!isZTDFResource(resource)) {
            res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'Resource is not in ZTDF format'
            });
            return;
        }

        // Find the KAO
        const kao = resource.ztdf.payload.keyAccessObjects.find(k => k.kaoId === kaoId);
        if (!kao) {
            res.status(404).json({
                success: false,
                error: 'Not Found',
                message: `KAO ${kaoId} not found in resource`
            });
            return;
        }

        // Call KAS to request key
        const kasUrl = kao.kasUrl || 'http://localhost:8080';
        logger.info('Calling KAS', { requestId, kasUrl, kaoId });

        // CRITICAL: Get the wrappedKey (actual DEK used during encryption)
        const wrappedKey = kao.wrappedKey;
        logger.info('Passing wrappedKey to KAS', {
            requestId,
            resourceId,
            hasWrappedKey: !!wrappedKey,
            wrappedKeyLength: wrappedKey?.length
        });

        let kasResponse;
        try {
            kasResponse = await axios.post(
                `${kasUrl}/request-key`,
                {
                    resourceId,
                    kaoId,
                    wrappedKey, // CRITICAL: Pass the actual DEK so KAS doesn't regenerate
                    bearerToken,
                    requestTimestamp: new Date().toISOString(),
                    requestId
                },
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 10000 // 10 seconds
                }
            );
        } catch (error) {
            logger.error('KAS request failed', {
                requestId,
                resourceId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });

            // Check if it's a 403 (denial) vs network error
            if (axios.isAxiosError(error) && error.response?.status === 403) {
                // KAS denied - return detailed denial info
                const kasData = error.response.data;
                res.status(403).json({
                    success: false,
                    error: 'Forbidden',
                    denialReason: kasData.denialReason || 'Access denied by KAS',
                    kasDecision: kasData.kasDecision,
                    executionTimeMs: Date.now() - startTime
                });
                return;
            }

            // Network error or KAS unavailable
            res.status(503).json({
                success: false,
                error: 'Service Unavailable',
                message: 'KAS service is unavailable or timed out',
                executionTimeMs: Date.now() - startTime
            });
            return;
        }

        // KAS allowed - decrypt content
        if (kasResponse.data.success && kasResponse.data.dek) {
            logger.info('Key released by KAS', { requestId, resourceId });

            // Decrypt content using DEK
            const encryptedChunk = resource.ztdf.payload.encryptedChunks[0];
            if (!encryptedChunk) {
                res.status(500).json({
                    success: false,
                    error: 'Internal Server Error',
                    message: 'No encrypted chunks found in resource'
                });
                return;
            }

            try {
                // ============================================
                // CRITICAL: Validate ZTDF Integrity Before Decryption
                // ACP-240 Requirement: STANAG 4778 Cryptographic Binding
                // ============================================
                const { validateZTDFIntegrity } = await import('../utils/ztdf.utils');
                const integrityResult = validateZTDFIntegrity(resource.ztdf);

                if (!integrityResult.valid) {
                    // FAIL-CLOSED: Deny access on integrity violation
                    logger.error('ZTDF integrity violation - DENY', {
                        requestId,
                        resourceId,
                        subject: (req as any).user?.uniqueID,
                        errors: integrityResult.errors,
                        issues: integrityResult.issues,
                        policyHashValid: integrityResult.policyHashValid,
                        payloadHashValid: integrityResult.payloadHashValid,
                        allChunksValid: integrityResult.allChunksValid
                    });

                    // 🚨 SECURITY ALERT: Possible tampering detected
                    logger.error('SECURITY ALERT: Possible ZTDF tampering detected', {
                        alertLevel: 'CRITICAL',
                        eventType: 'INTEGRITY_VIOLATION',
                        requestId,
                        resourceId,
                        subject: (req as any).user?.uniqueID,
                        timestamp: new Date().toISOString(),
                        details: integrityResult
                    });

                    res.status(403).json({
                        success: false,
                        error: 'Forbidden',
                        message: 'Resource integrity check failed',
                        reason: 'Cryptographic binding violation - possible tampering detected',
                        details: {
                            policyHashValid: integrityResult.policyHashValid,
                            payloadHashValid: integrityResult.payloadHashValid,
                            allChunksValid: integrityResult.allChunksValid,
                            issues: integrityResult.issues
                        },
                        executionTimeMs: Date.now() - startTime
                    });
                    return;
                }

                logger.info('ZTDF integrity validated successfully', {
                    requestId,
                    resourceId,
                    policyHashValid: integrityResult.policyHashValid,
                    payloadHashValid: integrityResult.payloadHashValid,
                    allChunksValid: integrityResult.allChunksValid
                });

                // Integrity validated - safe to decrypt
                const decryptedContent = decryptContent({
                    encryptedData: encryptedChunk.encryptedData,
                    iv: resource.ztdf.payload.iv,
                    authTag: resource.ztdf.payload.authTag,
                    dek: kasResponse.data.dek
                });

                logger.info('Content decrypted successfully', { requestId, resourceId });

                res.json({
                    success: true,
                    content: decryptedContent,
                    kasDecision: kasResponse.data.kasDecision,
                    executionTimeMs: Date.now() - startTime
                });

            } catch (decryptError) {
                logger.error('Decryption failed', {
                    requestId,
                    resourceId,
                    error: decryptError instanceof Error ? decryptError.message : 'Unknown error'
                });

                res.status(500).json({
                    success: false,
                    error: 'Internal Server Error',
                    message: 'Failed to decrypt content',
                    executionTimeMs: Date.now() - startTime
                });
            }
        } else {
            // Unexpected response from KAS
            logger.error('Unexpected KAS response', {
                requestId,
                resourceId,
                kasResponse: kasResponse.data
            });

            res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: 'Unexpected response from KAS',
                executionTimeMs: Date.now() - startTime
            });
        }

    } catch (error) {
        logger.error('Key request handler error', {
            requestId,
            resourceId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        next(error);
    }
};

