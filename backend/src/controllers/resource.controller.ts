import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { getResourceById, getAllResources } from '../services/resource.service';
import { NotFoundError } from '../middleware/error.middleware';

/**
 * List all resources
 * Week 1: Return all resources
 * Week 2: Filter based on user's clearance/country after PEP integration
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

        // Week 1: Return basic metadata (no content)
        const resourceList = resources.map(r => ({
            resourceId: r.resourceId,
            title: r.title,
            classification: r.classification,
            releasabilityTo: r.releasabilityTo,
            COI: r.COI,
            encrypted: r.encrypted || false,
            creationDate: r.creationDate
        }));

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
 * Week 1: Basic retrieval
 * Week 2: Add PEP authorization middleware before this handler
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

        // Week 1: Return resource without authorization check
        // Week 2: This will be called AFTER authzMiddleware approves access
        res.json({
            resourceId: resource.resourceId,
            title: resource.title,
            classification: resource.classification,
            releasabilityTo: resource.releasabilityTo,
            COI: resource.COI || [],
            encrypted: resource.encrypted || false,
            creationDate: resource.creationDate,
            content: resource.content, // Week 1: Always return; Week 2: Only if authorized
            metadata: {
                createdAt: resource.createdAt,
                updatedAt: resource.updatedAt
            }
        });

    } catch (error) {
        next(error);
    }
};

