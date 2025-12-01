import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { getResourceById, getAllResources } from '../services/resource.service';
import { NotFoundError } from '../middleware/error.middleware';
import { IZTDFResource } from '../types/ztdf.types';
import { validateZTDFIntegrity, decryptContent } from '../utils/ztdf.utils';
import { convertToOpenTDFFormat } from '../services/ztdf-export.service';
import { kasRegistryService } from '../services/kas-registry.service';
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
 * Week 3.2: Filter by user clearance to prevent information disclosure
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

        // Get user's clearance from JWT token (set by authenticateJWT middleware)
        const token = (req as any).user;
        const userClearance = token?.clearance || 'UNCLASSIFIED';

        // Clearance hierarchy for filtering
        // CRITICAL: RESTRICTED is now a separate level above UNCLASSIFIED
        // - UNCLASSIFIED users CANNOT access RESTRICTED content
        // - RESTRICTED users CAN access UNCLASSIFIED content
        const clearanceHierarchy: Record<string, number> = {
            'UNCLASSIFIED': 0,
            'RESTRICTED': 0.5,
            'CONFIDENTIAL': 1,
            'SECRET': 2,
            'TOP_SECRET': 3
        };

        const userClearanceLevel = clearanceHierarchy[userClearance] ?? 0;

        logger.debug('Filtering resources by clearance', {
            requestId,
            userClearance,
            userClearanceLevel,
            totalResources: resources.length
        });

        // Return basic metadata with STANAG 4774 display markings
        const resourceList = resources
            .filter(r => {
                // Determine resource classification
                const resourceClassification = isZTDFResource(r)
                    ? r.ztdf.policy.securityLabel.classification
                    : (r as any).classification || 'UNCLASSIFIED';

                const resourceLevel = clearanceHierarchy[resourceClassification] ?? 0;

                // Only show resources at or below user's clearance
                return resourceLevel <= userClearanceLevel;
            })
            .map(r => {
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
                        ztdfVersion: r.ztdf.manifest.version,
                        // Multi-KAS support: Include KAO count and basic KAO info
                        kaoCount: r.ztdf.payload.keyAccessObjects.length,
                        kaos: r.ztdf.payload.keyAccessObjects.map(kao => ({
                            kaoId: kao.kaoId,
                            kasId: kao.kasId,
                            policyBinding: {
                                coiRequired: kao.policyBinding.coiRequired || [],
                                countriesAllowed: kao.policyBinding.countriesAllowed || []
                            }
                        }))
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
 * Phase 4: Cross-instance KAS integration for federated encrypted resources
 */
export const getResourceHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string;
    const { id } = req.params;
    const INSTANCE_REALM = process.env.INSTANCE_REALM || 'USA';

    try {
        logger.info('Fetching resource', { requestId, resourceId: id });

        // Check if authz middleware already fetched the resource (federated case)
        let resource = (req as any).resource;
        const federatedSource = (req as any).federatedSource;
        
        if (!resource) {
            // Local resource: fetch from MongoDB
            resource = await getResourceById(id);
        }

        if (!resource) {
            throw new NotFoundError(`Resource ${id} not found`);
        }
        
        // Handle federated resource response
        if (federatedSource === 'federated') {
            logger.info('Returning federated resource', {
                requestId,
                resourceId: id,
                federatedSource,
            });
            
            // The federated response is already in the expected format
            // Return it directly (it was authorized by the origin instance)
            res.status(200).json(resource);
            return;
        }

        // Check if PEP set any obligations (e.g., KAS key request required)
        const obligations = (req as any).authzObligations || [];
        const kasObligation = obligations.find((o: any) => o.type === 'kas');

        // Phase 4: Check if this is a cross-instance resource
        const isCrossInstance = kasRegistryService.isCrossInstanceResource(resource);
        const kasAuthority = kasRegistryService.getKASAuthority(resource);

        if (isCrossInstance && kasRegistryService.isCrossKASEnabled()) {
            logger.info('Cross-instance encrypted resource detected', {
                requestId,
                resourceId: resource.resourceId,
                originRealm: (resource as any).originRealm || 'unknown',
                currentRealm: INSTANCE_REALM,
                kasAuthority
            });
        }

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

                // ZTDF object (full for classification equivalency tests)
                ztdf: resource.ztdf,

                // Include policy evaluation details for frontend replay
                policyEvaluation: (req as any).policyEvaluation,

                // Phase 4: Cross-instance metadata
                originRealm: (resource as any).originRealm || INSTANCE_REALM,
                kasAuthority,
                isCrossInstance,

                metadata: {
                    createdAt: resource.createdAt,
                    updatedAt: resource.updatedAt
                }
            };

            // If KAS obligation present, include KAS endpoint info
            if (kasObligation) {
                // Phase 4: Determine correct KAS URL for cross-instance access
                let kasUrl = resource.ztdf.payload.keyAccessObjects[0]?.kasUrl;

                if (isCrossInstance && kasRegistryService.isCrossKASEnabled()) {
                    const remoteKas = kasRegistryService.getKAS(kasAuthority);
                    if (remoteKas) {
                        kasUrl = remoteKas.kasUrl;
                        logger.debug('Using cross-instance KAS URL', {
                            requestId,
                            kasAuthority,
                            kasUrl,
                            organization: remoteKas.organization
                        });
                    }
                }

                response.kasObligation = {
                    required: true,
                    kasUrl,
                    kasAuthority,
                    isCrossInstance,
                    wrappedKey: resource.ztdf.payload.keyAccessObjects[0]?.wrappedKey,
                    message: isCrossInstance
                        ? `Decryption key must be requested from ${kasAuthority}`
                        : 'Decryption key must be requested from KAS'
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

                // Include policy evaluation details for frontend replay
                policyEvaluation: (req as any).policyEvaluation,

                // Phase 4: Origin tracking for legacy resources
                originRealm: legacyResource.originRealm || INSTANCE_REALM,

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

        // First try local
        let resource = await getResourceById(id);
        
        // If not found locally, check if it's a federated resource
        if (!resource) {
            const { extractOriginFromResourceId, FEDERATION_API_URLS } = await import('../services/resource.service');
            const originInstance = extractOriginFromResourceId(id);
            const CURRENT_INSTANCE = process.env.INSTANCE_REALM || 'USA';
            
            if (originInstance && originInstance !== CURRENT_INSTANCE) {
                // Proxy to origin instance's ZTDF endpoint
                const originApiUrl = FEDERATION_API_URLS[originInstance];
                const authHeader = req.headers['authorization'];
                
                if (originApiUrl && authHeader) {
                    logger.info('Proxying ZTDF details request to federated instance', {
                        requestId,
                        resourceId: id,
                        originInstance,
                    });
                    
                    try {
                        const axios = (await import('axios')).default;
                        const fedResponse = await axios.get(`${originApiUrl}/api/resources/${id}/ztdf`, {
                            headers: {
                                'Authorization': authHeader,
                                'Content-Type': 'application/json',
                                'X-Federated-From': CURRENT_INSTANCE,
                            },
                            timeout: 10000,
                            validateStatus: (status) => status < 500,
                        });
                        
                        if (fedResponse.status === 200) {
                            res.status(200).json(fedResponse.data);
                            return;
                        }
                        
                        // Forward error from origin
                        res.status(fedResponse.status).json(fedResponse.data);
                        return;
                    } catch (fedError) {
                        logger.error('Federated ZTDF request failed', {
                            requestId,
                            resourceId: id,
                            error: fedError instanceof Error ? fedError.message : 'Unknown',
                        });
                    }
                }
            }
            
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
        const integrityResult = await validateZTDFIntegrity(resource.ztdf);

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

        // First try local
        let resource = await getResourceById(id);
        
        // If not found locally, check if it's a federated resource
        if (!resource) {
            const { extractOriginFromResourceId, FEDERATION_API_URLS } = await import('../services/resource.service');
            const originInstance = extractOriginFromResourceId(id);
            const CURRENT_INSTANCE = process.env.INSTANCE_REALM || 'USA';
            
            if (originInstance && originInstance !== CURRENT_INSTANCE) {
                // Proxy to origin instance's KAS flow endpoint
                const originApiUrl = FEDERATION_API_URLS[originInstance];
                const authHeader = req.headers['authorization'];
                
                if (originApiUrl && authHeader) {
                    logger.info('Proxying KAS flow request to federated instance', {
                        requestId,
                        resourceId: id,
                        originInstance,
                    });
                    
                    try {
                        const axios = (await import('axios')).default;
                        const fedResponse = await axios.get(`${originApiUrl}/api/resources/${id}/kas-flow`, {
                            headers: {
                                'Authorization': authHeader,
                                'Content-Type': 'application/json',
                                'X-Federated-From': CURRENT_INSTANCE,
                            },
                            timeout: 10000,
                            validateStatus: (status) => status < 500,
                        });
                        
                        if (fedResponse.status === 200) {
                            res.status(200).json(fedResponse.data);
                            return;
                        }
                        
                        // Forward error from origin
                        res.status(fedResponse.status).json(fedResponse.data);
                        return;
                    } catch (fedError) {
                        logger.error('Federated KAS flow request failed', {
                            requestId,
                            resourceId: id,
                            error: fedError instanceof Error ? fedError.message : 'Unknown',
                        });
                    }
                }
            }
            
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
 * Phase 4: Cross-instance KAS support for federated encrypted resources
 */
export const requestKeyHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const { resourceId, kaoId } = req.body;
    const startTime = Date.now();
    const INSTANCE_REALM = process.env.INSTANCE_REALM || 'USA';

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

        // Phase 4: Check if this is a cross-instance resource
        const isCrossInstance = kasRegistryService.isCrossInstanceResource(resource);
        const kasAuthority = kasRegistryService.getKASAuthority(resource);

        // Get user info from request (set by JWT middleware)
        const user = (req as any).user || {};
        const subject = {
            uniqueID: user.uniqueID || user.sub || 'unknown',
            clearance: user.clearance || 'UNCLASSIFIED',
            countryOfAffiliation: user.countryOfAffiliation || INSTANCE_REALM,
            acpCOI: user.acpCOI || []
        };

        // CRITICAL: Get the wrappedKey (actual DEK used during encryption)
        const wrappedKey = kao.wrappedKey;

        logger.info('Processing key request', {
            requestId,
            resourceId,
            isCrossInstance,
            kasAuthority,
            originRealm: (resource as any).originRealm,
            currentRealm: INSTANCE_REALM,
            hasWrappedKey: !!wrappedKey,
            subject: {
                uniqueID: subject.uniqueID,
                clearance: subject.clearance,
                country: subject.countryOfAffiliation
            }
        });

        let kasResponse: any;

        // Phase 4: Use cross-KAS client for remote resources
        if (isCrossInstance && kasRegistryService.isCrossKASEnabled()) {
            logger.info('Initiating cross-instance KAS request', {
                requestId,
                resourceId,
                kasAuthority,
                subject: subject.uniqueID
            });

            const crossKASResult = await kasRegistryService.requestCrossKASKey(
                kasAuthority,
                {
                    resourceId,
                    kaoId,
                    wrappedKey,
                    bearerToken,
                    subject,
                    requestId
                }
            );

            if (!crossKASResult.success) {
                logger.warn('Cross-KAS key request denied', {
                    requestId,
                    resourceId,
                    kasAuthority,
                    denialReason: crossKASResult.denialReason,
                    latencyMs: crossKASResult.latencyMs
                });

                res.status(403).json({
                    success: false,
                    error: 'Forbidden',
                    denialReason: crossKASResult.denialReason,
                    kasAuthority,
                    organization: crossKASResult.organization,
                    isCrossInstance: true,
                    executionTimeMs: crossKASResult.latencyMs
                });
                return;
            }

            // Cross-KAS success - build response similar to local KAS
            kasResponse = {
                data: {
                    success: true,
                    dek: crossKASResult.dek,
                    auditEventId: crossKASResult.auditEventId,
                    kasDecision: {
                        allow: true,
                        kasAuthority,
                        organization: crossKASResult.organization,
                        isCrossInstance: true
                    }
                }
            };

            logger.info('Cross-KAS key released successfully', {
                requestId,
                resourceId,
                kasAuthority,
                organization: crossKASResult.organization,
                latencyMs: crossKASResult.latencyMs
            });

        } else {
            // Local KAS request (original implementation)
            // CRITICAL: Always use internal KAS URL for local requests
            // The KAO's kasUrl is the external URL for frontend clients
            // Backend should use internal Docker network URL to avoid Cloudflare loop
            const kasUrl = `${process.env.KAS_URL || 'https://kas:8080'}/request-key`;

            logger.info('Calling local KAS', {
                requestId,
                kasUrl,
                kaoKasUrl: kao.kasUrl,  // External URL (for reference)
                internalKasUrl: kasUrl  // Actual URL being called
            });

            try {
                kasResponse = await axios.post(
                    kasUrl,
                    {
                        resourceId,
                        kaoId,
                        wrappedKey,
                        bearerToken,
                        requestTimestamp: new Date().toISOString(),
                        requestId
                    },
                    {
                        headers: { 'Content-Type': 'application/json' },
                        timeout: 10000
                    }
                );
            } catch (error) {
                logger.error('Local KAS request failed', {
                    requestId,
                    resourceId,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });

                // Check if it's a 403 (denial) vs network error
                if (axios.isAxiosError(error) && error.response?.status === 403) {
                    const kasData = error.response.data;
                    res.status(403).json({
                        success: false,
                        error: 'Forbidden',
                        denialReason: kasData.denialReason || 'Access denied by KAS',
                        kasDecision: kasData.kasDecision,
                        isCrossInstance: false,
                        executionTimeMs: Date.now() - startTime
                    });
                    return;
                }

                // Network error or KAS unavailable
                res.status(503).json({
                    success: false,
                    error: 'Service Unavailable',
                    message: 'KAS service is unavailable or timed out',
                    isCrossInstance: false,
                    executionTimeMs: Date.now() - startTime
                });
                return;
            }
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
                const integrityResult = await validateZTDFIntegrity(resource.ztdf);

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

                logger.info('Content decrypted successfully', {
                    requestId,
                    resourceId,
                    isCrossInstance,
                    kasAuthority: kasResponse.data.kasDecision?.kasAuthority
                });

                res.json({
                    success: true,
                    content: decryptedContent,
                    kasDecision: kasResponse.data.kasDecision,
                    isCrossInstance,
                    kasAuthority: isCrossInstance ? kasAuthority : undefined,
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

/**
 * Download ZTDF file in OpenTDF-compliant format
 * Week 4: Export ZTDF as ZIP archive (0.manifest.json + 0.payload)
 * 
 * This endpoint converts DIVE V3 internal ZTDF format to OpenTDF spec 4.3.0
 * format for interoperability with OpenTDF CLI and SDK tools.
 * 
 * @route GET /api/resources/:id/download
 * @returns ZIP file (.ztdf) compatible with OpenTDF tools
 */
export const downloadZTDFHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string;
    const { id } = req.params;

    try {
        logger.info('ZTDF download requested', {
            requestId,
            resourceId: id,
            userAgent: req.headers['user-agent']
        });

        // 1. Fetch resource from MongoDB
        const resource = await getResourceById(id);

        if (!resource) {
            throw new NotFoundError(`Resource ${id} not found`);
        }

        // 2. Verify resource is ZTDF-enhanced
        if (!isZTDFResource(resource)) {
            logger.warn('Attempted to download non-ZTDF resource', {
                requestId,
                resourceId: id
            });

            res.status(400).json({
                error: 'Bad Request',
                message: 'This resource is not in ZTDF format. Only ZTDF-enhanced resources can be downloaded.'
            });
            return;
        }

        // 3. Convert to OpenTDF format (ZIP archive)
        const exportResult = await convertToOpenTDFFormat(resource.ztdf, {
            includeAssertionSignatures: true,
            validateIntegrity: true,
            compressionLevel: 0, // STORE (no compression) per OpenTDF spec
            includeLegacyFields: false
        });

        logger.info('ZTDF export successful', {
            requestId,
            resourceId: id,
            exportedAt: exportResult.metadata.exportedAt,
            zipSize: exportResult.fileSize,
            manifestSize: exportResult.metadata.manifestSize,
            payloadSize: exportResult.metadata.payloadSize,
            zipHash: exportResult.zipHash
        });

        // 4. Set response headers for file download
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
        res.setHeader('Content-Length', exportResult.fileSize.toString());
        res.setHeader('X-ZTDF-Spec-Version', exportResult.metadata.tdfSpecVersion);
        res.setHeader('X-ZTDF-Hash', exportResult.zipHash);
        res.setHeader('X-Export-Timestamp', exportResult.metadata.exportedAt);

        // 5. Send ZIP buffer
        res.send(exportResult.zipBuffer);

        logger.info('ZTDF file sent to client', {
            requestId,
            resourceId: id,
            filename: exportResult.filename,
            bytesSent: exportResult.fileSize
        });

    } catch (error) {
        logger.error('ZTDF download failed', {
            requestId,
            resourceId: id,
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
        });
        next(error);
    }
};

