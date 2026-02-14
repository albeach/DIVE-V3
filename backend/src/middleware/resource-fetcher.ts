/**
 * Resource Fetching & Attribute Extraction for PEP Decisions
 *
 * Loads resources from MongoDB (or cross-instance via federation)
 * and extracts authorization-relevant attributes for OPA evaluation.
 *
 * Extracted from authz.middleware.ts during Phase 4A decomposition.
 */

import { logger } from '../utils/logger';
import type { IZTDFResource } from '../types/ztdf.types';

interface IResourceAttributes {
    resourceId: string;
    classification: string;
    releasabilityTo: string[];
    COI: string[];
    creationDate?: string;
    encrypted: boolean;
    originalClassification?: string;
    originalCountry?: string;
    natoEquivalent?: string;
}

/**
 * Check if resource is ZTDF-enhanced
 */
export function isZTDFResource(resource: IZTDFResource | Record<string, unknown>): resource is IZTDFResource {
    return resource && typeof resource === 'object' && 'ztdf' in resource;
}

/**
 * Extract authorization-relevant attributes from a resource.
 * Handles both ZTDF-enhanced and legacy resource formats.
 */
export function extractResourceAttributes(resource: IZTDFResource | Record<string, unknown>): IResourceAttributes {
    if (isZTDFResource(resource)) {
        return {
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
    }

    // Legacy resource format
    return {
        resourceId: resource.resourceId as string,
        classification: (resource.classification as string) || 'UNCLASSIFIED',
        releasabilityTo: (resource.releasabilityTo as string[]) || [],
        COI: (resource.COI as string[]) || [],
        creationDate: resource.creationDate as string | undefined,
        encrypted: (resource.encrypted as boolean) || false,
    };
}

/**
 * Fetch a resource by ID for authorization evaluation.
 * Supports cross-instance federation via the authorization header.
 */
export async function fetchResourceForAuthz(
    resourceId: string,
    authHeader: string | string[] | undefined
): Promise<IZTDFResource | null> {
    const { getResourceById } = await import('../services/resource.service');
    // Authorization header is always a single string value
    const headerValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    const resource = await getResourceById(resourceId, headerValue);

    if (!resource) {
        logger.debug('Resource not found for authorization', { resourceId });
        return null;
    }

    return resource;
}
