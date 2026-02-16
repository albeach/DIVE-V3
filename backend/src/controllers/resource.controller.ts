import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { getResourceById, getAllResources, getResourcesPaginated } from '../services/resource.service';
import { NotFoundError } from '../middleware/error.middleware';
import { IZTDFResource } from '../types/ztdf.types';
import { validateZTDFIntegrity, decryptContent } from '../utils/ztdf.utils';
import { convertToOpenTDFFormat } from '../services/ztdf-export.service';
import { mongoKasRegistryStore } from '../models/kas-registry.model';
import { kasRouterService } from '../services/kas-router.service';
import { generateMarking } from '../services/spif-parser.service';

// Helper: Get instance code for cross-instance checks
// CRITICAL FIX: Use INSTANCE_CODE (set by spoke deployment) with INSTANCE_REALM fallback
const INSTANCE_REALM = process.env.INSTANCE_CODE || process.env.INSTANCE_REALM || 'USA';

/**
 * Check if resource requires cross-instance KAS access
 * MongoDB SSOT replacement for legacy kasRegistryService.isCrossInstanceResource
 */
function isCrossInstanceResource(resource: Record<string, unknown>): boolean {
    const kasAuthority = getKASAuthority(resource);
    const localKasId = `${INSTANCE_REALM.toLowerCase()}-kas`;
    return kasAuthority !== localKasId;
}

/**
 * Determine KAS authority for a resource based on originRealm
 * MongoDB SSOT replacement for legacy kasRegistryService.getKASAuthority
 */
function getKASAuthority(resource: Record<string, unknown>): string {
    // Priority: explicit kasAuthority > originRealm-derived > local instance
    if (resource.kasAuthority) {
        return resource.kasAuthority as string;
    }
    if (resource.originRealm) {
        return `${(resource.originRealm as string).toLowerCase()}-kas`;
    }
    // Default to local instance KAS
    return `${INSTANCE_REALM.toLowerCase()}-kas`;
}
import axios from 'axios';

/**
 * Check if resource is ZTDF-enhanced
 */
function isZTDFResource(resource: unknown): resource is IZTDFResource {
    return !!resource && typeof resource === 'object' && 'ztdf' in resource;
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

        // Extract pagination params from query string
        const page = parseInt(req.query.page as string) || 1;
        const pageSize = parseInt(req.query.pageSize as string) || 50;

        // Use paginated fetch to prevent OOM
        const { resources, total } = await getResourcesPaginated(page, pageSize);

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
                    const classification = r.ztdf.policy.securityLabel.classification;
                    const displayMarking = r.stanag?.displayMarking || r.ztdf.policy.securityLabel.displayMarking;

                    return {
                        resourceId: r.resourceId,
                        title: r.title,
                        classification,
                        releasabilityTo: r.ztdf.policy.securityLabel.releasabilityTo,
                        COI: r.ztdf.policy.securityLabel.COI || [],
                        encrypted: true, // ZTDF is always encrypted
                        creationDate: r.ztdf.policy.securityLabel.creationDate,
                        displayMarking, // ACP-240 STANAG 4774
                        ztdfVersion: r.ztdf.manifest.version,
                        // STANAG metadata for list display
                        stanag: r.stanag ? {
                            displayMarking: r.stanag.displayMarking,
                            watermarkText: r.stanag.watermarkText,
                        } : undefined,
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
                    const legacyResource = r as unknown as Record<string, unknown>;
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
            total, // Total count before filtering
            page,
            pageSize,
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
    const INSTANCE_REALM = process.env.INSTANCE_CODE || process.env.INSTANCE_REALM || 'USA';

    try {
        logger.info('Fetching resource', { requestId, resourceId: id });

        // Check if authz middleware already fetched the resource (federated case)
        let resource = (req as any).resource;
        const federatedSource = (req as any).federatedSource;

        if (!resource) {
            // Local resource: fetch from MongoDB (or cross-instance via federation)
            const authHeader = req.headers['authorization'];
            resource = await getResourceById(id, authHeader);
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
        const kasObligation = obligations.find((o: { type: string }) => o.type === 'kas');

        // Phase 4: Check if this is a cross-instance resource (MongoDB SSOT)
        const crossInstance = isCrossInstanceResource(resource);
        const kasAuthority = getKASAuthority(resource);

        if (crossInstance) {
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
            const classification = resource.ztdf.policy.securityLabel.classification;
            const releasabilityTo = resource.ztdf.policy.securityLabel.releasabilityTo || [];
            const COI = resource.ztdf.policy.securityLabel.COI || [];

            // Generate STANAG-compliant marking if not already stored
            let stanagMarkings = resource.stanag;
            if (!stanagMarkings) {
                try {
                    // Detect language based on user's country for localized classification labels
                    const user = (req as any).enrichedUser || (req as any).user;
                    const userCountry = user?.countryOfAffiliation || 'USA';
                    const language = userCountry === 'FRA' ? 'fr' : 'en';

                    const marking = await generateMarking(
                        classification,
                        releasabilityTo,
                        { COI, caveats: resource.ztdf.policy.securityLabel.caveats, language }
                    );
                    stanagMarkings = {
                        displayMarking: marking.displayMarking,
                        watermarkText: marking.watermarkText,
                        portionMarkings: undefined,
                    };
                } catch (markingError) {
                    logger.warn('Failed to generate STANAG marking', {
                        requestId,
                        resourceId: id,
                        error: markingError instanceof Error ? markingError.message : 'Unknown error',
                    });
                    stanagMarkings = {
                        displayMarking: resource.ztdf.policy.securityLabel.displayMarking || `${classification} // REL TO ${releasabilityTo.join(', ')}`,
                        watermarkText: classification,
                    };
                }
            }

            const response: Record<string, unknown> = {
                resourceId: resource.resourceId,
                title: resource.title,
                classification,
                releasabilityTo,
                COI,
                encrypted: true,
                creationDate: resource.ztdf.policy.securityLabel.creationDate,

                // ACP-240: STANAG 4774 Display Marking (prominent)
                displayMarking: stanagMarkings.displayMarking || resource.ztdf.policy.securityLabel.displayMarking,

                // STANAG 4774/4778 marking metadata for frontend rendering
                stanag: {
                    displayMarking: stanagMarkings.displayMarking,
                    watermarkText: stanagMarkings.watermarkText,
                    portionMarkings: stanagMarkings.portionMarkings,
                    bdo: resource.stanag?.bdo,
                    originalClassification: resource.stanag?.originalClassification,
                    originalCountry: resource.stanag?.originalCountry,
                    natoEquivalent: resource.stanag?.natoEquivalent,
                },

                // ZTDF object (full for classification equivalency tests)
                ztdf: resource.ztdf,

                // Include policy evaluation details for frontend replay
                policyEvaluation: (req as any).policyEvaluation,

                // Phase 4: Cross-instance metadata (MongoDB SSOT)
                originRealm: (resource as any).originRealm || INSTANCE_REALM,
                kasAuthority,
                isCrossInstance: crossInstance,

                metadata: {
                    createdAt: resource.createdAt,
                    updatedAt: resource.updatedAt
                }
            };

            // If KAS obligation present, include KAS endpoint info
            if (kasObligation) {
                // Phase 4: Determine correct KAS URL for cross-instance access (MongoDB SSOT)
                let kasUrl = resource.ztdf.payload.keyAccessObjects[0]?.kasUrl;

                if (crossInstance) {
                    // Look up KAS from MongoDB registry
                    const remoteKas = await mongoKasRegistryStore.findById(kasAuthority);
                    if (remoteKas && remoteKas.status === 'active' && remoteKas.enabled) {
                        kasUrl = remoteKas.kasUrl;
                        logger.debug('Using cross-instance KAS URL from MongoDB', {
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
                    isCrossInstance: crossInstance,
                    wrappedKey: resource.ztdf.payload.keyAccessObjects[0]?.wrappedKey,
                    message: crossInstance
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
            const legacyResource = resource as Record<string, unknown>;
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

        // First try local (or cross-instance via federation)
        const authHeader = req.headers['authorization'];
        let resource = await getResourceById(id, authHeader);

        // If not found locally, check if it's a federated resource
        if (!resource) {
            const { extractOriginFromResourceId, FEDERATION_API_URLS } = await import('../services/resource.service');
            const originInstance = extractOriginFromResourceId(id);
            const CURRENT_INSTANCE = process.env.INSTANCE_CODE || process.env.INSTANCE_REALM || 'USA';

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

        // First try local (or cross-instance via federation)
        const authHeader = req.headers['authorization'];
        let resource = await getResourceById(id, authHeader);

        // If not found locally, check if it's a federated resource
        if (!resource) {
            const { extractOriginFromResourceId, FEDERATION_API_URLS } = await import('../services/resource.service');
            const originInstance = extractOriginFromResourceId(id);
            const CURRENT_INSTANCE = process.env.INSTANCE_CODE || process.env.INSTANCE_REALM || 'USA';

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
                timestamp: null as string | null,
                details: 'Ready to request key from KAS',
                kasUrl: encrypted ? resource.ztdf.payload.keyAccessObjects[0].kasUrl : null
            },
            step4: {
                name: 'KAS Policy Re-evaluation',
                status: 'PENDING' as const,
                timestamp: null as string | null,
                details: 'Awaiting policy re-evaluation',
                policyCheck: null as Record<string, unknown> | null
            },
            step5: {
                name: 'Key Release',
                status: 'PENDING' as const,
                timestamp: null as string | null,
                details: 'Awaiting key release from KAS'
            },
            step6: {
                name: 'Content Decryption',
                status: 'PENDING' as const,
                timestamp: null as string | null,
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
    const INSTANCE_REALM = process.env.INSTANCE_CODE || process.env.INSTANCE_REALM || 'USA';

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

        // Fetch resource - first try local MongoDB (or cross-instance via federation)
        const authHeader = req.headers['authorization'];
        let resource = await getResourceById(resourceId, authHeader);

        // Phase 4: If not found locally, check if it's a federated resource
        if (!resource) {
            const { extractOriginFromResourceId, FEDERATION_API_URLS } = await import('../services/resource.service');
            const originInstance = extractOriginFromResourceId(resourceId);
            const CURRENT_INSTANCE = process.env.INSTANCE_CODE || process.env.INSTANCE_REALM || 'USA';

            if (originInstance && originInstance !== CURRENT_INSTANCE) {
                // Proxy the key request to origin instance's backend
                const originApiUrl = FEDERATION_API_URLS[originInstance];

                if (originApiUrl) {
                    logger.info('Proxying key request to federated instance', {
                        requestId,
                        resourceId,
                        kaoId,
                        originInstance,
                        currentInstance: CURRENT_INSTANCE,
                    });

                    try {
                        const axios = (await import('axios')).default;
                        const fedResponse = await axios.post(
                            `${originApiUrl}/api/resources/request-key`,
                            { resourceId, kaoId },
                            {
                                headers: {
                                    'Authorization': `Bearer ${bearerToken}`,
                                    'Content-Type': 'application/json',
                                    'X-Federated-From': CURRENT_INSTANCE,
                                    'X-Request-Id': requestId,
                                },
                                timeout: 30000, // Longer timeout for KAS operations
                                validateStatus: (status) => status < 500,
                            }
                        );

                        logger.info('Federated key request completed', {
                            requestId,
                            resourceId,
                            originInstance,
                            status: fedResponse.status,
                            success: fedResponse.data?.success,
                        });

                        // Forward response from origin instance
                        res.status(fedResponse.status).json(fedResponse.data);
                        return;
                    } catch (fedError) {
                        logger.error('Federated key request failed', {
                            requestId,
                            resourceId,
                            originInstance,
                            error: fedError instanceof Error ? fedError.message : 'Unknown',
                        });

                        res.status(502).json({
                            success: false,
                            error: 'Bad Gateway',
                            message: `Failed to proxy key request to ${originInstance} instance`,
                            details: fedError instanceof Error ? fedError.message : 'Unknown error',
                        });
                        return;
                    }
                }
            }

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

        // Phase 4: Check if this is a cross-instance resource (MongoDB SSOT)
        const crossInstanceRes = isCrossInstanceResource(resource as unknown as Record<string, unknown>);
        const kasAuth = getKASAuthority(resource as unknown as Record<string, unknown>);

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
            isCrossInstance: crossInstanceRes,
            kasAuthority: kasAuth,
            originRealm: (resource as any).originRealm,
            currentRealm: INSTANCE_REALM,
            hasWrappedKey: !!wrappedKey,
            subject: {
                uniqueID: subject.uniqueID,
                clearance: subject.clearance,
                country: subject.countryOfAffiliation
            }
        });

        let kasResponse: { data: Record<string, unknown> };

        // Phase 4: Use cross-KAS client for remote resources (MongoDB SSOT via kasRouterService)
        if (crossInstanceRes) {
            logger.info('Initiating cross-instance KAS request via MongoDB registry', {
                requestId,
                resourceId,
                kasAuthority: kasAuth,
                subject: subject.uniqueID
            });

            // Use kasRouterService which is backed by MongoDB
            const crossKASResult = await kasRouterService.routeKeyRequest({
                resourceId,
                kaoId,
                originInstance: (resource as any).originRealm || kasAuth.replace('-kas', '').toUpperCase(),
                requesterInstance: INSTANCE_REALM,
                bearerToken,
                wrappedKey,
                requestId
            });

            if (!crossKASResult.success) {
                logger.warn('Cross-KAS key request denied', {
                    requestId,
                    resourceId,
                    kasAuthority: kasAuth,
                    denialReason: crossKASResult.denialReason,
                    kasId: crossKASResult.kasId
                });

                res.status(403).json({
                    success: false,
                    error: 'Forbidden',
                    denialReason: crossKASResult.denialReason,
                    kasAuthority: kasAuth,
                    kasId: crossKASResult.kasId,
                    isCrossInstance: true
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
                        kasAuthority: kasAuth,
                        organization: crossKASResult.organization,
                        isCrossInstance: true
                    }
                }
            };

            logger.info('Cross-KAS key released successfully', {
                requestId,
                resourceId,
                kasAuthority: kasAuth,
                organization: crossKASResult.organization,
                latencyMs: crossKASResult.latencyMs
            });

        } else {
            // Local KAS request with USER token (preserves AAL/MFA context)
            // CRITICAL: We must use the user's original token to preserve:
            // - acr (Authentication Context Class Reference) for AAL level
            // - amr (Authentication Methods Reference) for MFA validation
            // - auth_time for session validation
            
            // CRITICAL: Always use internal KAS URL for local requests
            // The KAO's kasUrl is the external URL for frontend clients
            // Backend should use internal Docker network URL to avoid Cloudflare loop
            // Use KAS_URL env var, or try container name (dive-hub-kas) as fallback, then service name (kas)
            const kasUrl = `${process.env.KAS_URL || 'https://dive-hub-kas:8080'}/request-key`;

            logger.info('Calling local KAS with user token (preserves AAL/MFA)', {
                requestId,
                kasUrl,
                kaoKasUrl: kao.kasUrl,  // External URL (for reference)
                internalKasUrl: kasUrl,  // Actual URL being called
                subject: subject.uniqueID,
                preservesUserContext: true
            });

            try {
                // Extract resource metadata from ZTDF format (from securityLabel, not top-level)
                const securityLabel = isZTDFResource(resource)
                    ? resource.ztdf.policy.securityLabel
                    : null;

                const resourceMetadata = {
                    classification: securityLabel?.classification || (resource as any).classification || 'UNCLASSIFIED',
                    releasabilityTo: securityLabel?.releasabilityTo || (resource as any).releasabilityTo || [],
                    COI: securityLabel?.COI || (resource as any).COI || [],
                    creationDate: securityLabel?.creationDate || (resource as any).creationDate
                };

                logger.info('Sending resourceMetadata to KAS', {
                    requestId,
                    resourceId,
                    isZTDF: !!securityLabel,
                    classification: resourceMetadata.classification,
                    releasabilityTo: resourceMetadata.releasabilityTo,
                    coiCount: resourceMetadata.COI?.length || 0
                });

                kasResponse = await axios.post(
                    kasUrl,
                    {
                        resourceId,
                        kaoId,
                        wrappedKey,
                        bearerToken, // Use original user token to preserve AAL/MFA context
                        userIdentity: subject, // Include original user identity for audit
                        requestTimestamp: new Date().toISOString(),
                        requestId,
                        resourceMetadata
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

            // Retrieve encrypted data (from GridFS if needed)
            let encryptedData: string;

            if (encryptedChunk.storageMode === 'gridfs' && encryptedChunk.gridfsFileId) {
                // Large file stored in GridFS - retrieve it
                logger.info('Retrieving encrypted payload from GridFS', {
                    requestId,
                    resourceId,
                    gridfsFileId: encryptedChunk.gridfsFileId
                });

                const { downloadFromGridFS } = await import('../services/gridfs.service');
                encryptedData = await downloadFromGridFS(encryptedChunk.gridfsFileId);

                logger.info('Retrieved encrypted payload from GridFS', {
                    requestId,
                    resourceId,
                    size: Buffer.from(encryptedData, 'base64').length
                });
            } else if (encryptedChunk.storageMode === 'inline' && encryptedChunk.encryptedData) {
                // Small file stored inline
                encryptedData = encryptedChunk.encryptedData;
            } else {
                // Invalid storage configuration
                logger.error('Invalid encrypted chunk storage configuration', {
                    requestId,
                    resourceId,
                    storageMode: encryptedChunk.storageMode,
                    hasEncryptedData: !!encryptedChunk.encryptedData,
                    hasGridfsFileId: !!encryptedChunk.gridfsFileId
                });

                res.status(500).json({
                    success: false,
                    error: 'Internal Server Error',
                    message: 'Invalid resource storage configuration'
                });
                return;
            }

            try {
                // ============================================
                // CRITICAL: Validate ZTDF Integrity Before Decryption
                // ACP-240 Requirement: STANAG 4778 Cryptographic Binding
                // ============================================
                const { validateZTDFIntegrity } = await import('../utils/ztdf.utils');
                const integrityResult = await validateZTDFIntegrity(resource.ztdf, encryptedData);

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
                    encryptedData,
                    iv: resource.ztdf.payload.iv,
                    authTag: resource.ztdf.payload.authTag,
                    dek: kasResponse.data.dek as string
                });

                logger.info('Content decrypted successfully', {
                    requestId,
                    resourceId,
                    isCrossInstance: crossInstanceRes,
                    kasAuthority: (kasResponse.data.kasDecision as Record<string, unknown>)?.kasAuthority
                });

                res.json({
                    success: true,
                    content: decryptedContent,
                    kasDecision: kasResponse.data.kasDecision,
                    isCrossInstance: crossInstanceRes,
                    kasAuthority: crossInstanceRes ? kasAuth : undefined,
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

        // 1. Fetch resource from MongoDB (or cross-instance via federation)
        const authHeader = req.headers['authorization'];
        const resource = await getResourceById(id, authHeader);

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
            validateIntegrity: process.env.SKIP_ZTDF_VALIDATION === 'true' ? false : true,
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
