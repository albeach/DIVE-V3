import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { getResourceById, getAllResources } from '../services/resource.service';
import { NotFoundError } from '../middleware/error.middleware';
import { IZTDFResource } from '../types/ztdf.types';
import { validateZTDFIntegrity } from '../utils/ztdf.utils';

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
                    message: 'Decryption key must be requested from KAS'
                };
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

