/**
 * Federated Query Routes
 * Phase 3: Direct MongoDB Federation for high-performance cross-instance queries
 *
 * Provides two modes of federated search:
 * 1. /api/resources/federated-search (HTTP relay - existing)
 * 2. /api/resources/federated-query (Direct MongoDB - new, faster for local instances)
 *
 * NATO Compliance: ACP-240 §5.4 (Federated Resource Access)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { federatedResourceService, IFederatedSearchOptions, IUserAttributes } from '../services/federated-resource.service';
import { authenticateJWT } from '../middleware/authz.middleware';
import { logger } from '../utils/logger';

const router = Router();

// ============================================
// Initialize Service on Import
// ============================================

// Async initialization - will complete before first request if possible
federatedResourceService.initialize().catch(err => {
    logger.warn('FederatedResourceService initialization failed on import', {
        error: err instanceof Error ? err.message : 'Unknown error'
    });
});

// ============================================
// Routes
// ============================================

/**
 * POST /api/resources/federated-query
 * Execute federated search using direct MongoDB connections
 *
 * Request body:
 * {
 *   query?: string,           // Text search
 *   classification?: string[], // Filter by classification(s)
 *   releasableTo?: string[],  // Filter by releasability
 *   coi?: string[],           // Filter by COI(s)
 *   encrypted?: boolean,      // Filter by encryption status
 *   instances?: string[],     // Target specific instances (e.g., ["USA", "FRA"])
 *   limit?: number,           // Max results (default: 100)
 *   offset?: number           // Pagination offset
 * }
 */
router.post('/federated-query', authenticateJWT, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `fed-q-${Date.now()}`;
    const user = (req as any).user;

    try {
        // Enrich user attributes if missing (fallback for tokens without proper mappers)
        // This matches the enrichment done in auth middleware
        if (!user?.clearance) {
            // Try to get clearance from preferred_username pattern (e.g., testuser-usa-2 → CONFIDENTIAL)
            const username = user?.preferred_username || user?.uniqueID || '';
            const clearanceByUser: Record<string, string> = {
                'testuser-usa-1': 'UNCLASSIFIED',
                'testuser-usa-2': 'CONFIDENTIAL',
                'testuser-usa-3': 'SECRET',
                'testuser-usa-4': 'TOP_SECRET',
                'admin-usa': 'TOP_SECRET',
            };
            // Check for pattern matches (any country)
            const match = username.match(/testuser-\w+-(\d)/);
            if (match) {
                const level = parseInt(match[1]);
                const levels = ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];
                user.clearance = levels[Math.min(level - 1, 3)] || 'UNCLASSIFIED';
            } else if (username.startsWith('admin-')) {
                user.clearance = 'TOP_SECRET';
            } else if (clearanceByUser[username]) {
                user.clearance = clearanceByUser[username];
            } else {
                // Ultimate fallback for authenticated users
                user.clearance = 'UNCLASSIFIED';
            }
            logger.info('Enriched user clearance for federated query', {
                requestId,
                username,
                enrichedClearance: user.clearance
            });
        }

        if (!user?.countryOfAffiliation) {
            // Infer country from email or username
            const email = user?.email || '';
            const username = user?.preferred_username || user?.uniqueID || '';
            if (email.endsWith('.mil') || username.includes('-usa-')) {
                user.countryOfAffiliation = 'USA';
            } else if (email.endsWith('.gouv.fr') || username.includes('-fra-')) {
                user.countryOfAffiliation = 'FRA';
            } else if (email.endsWith('.mod.uk') || username.includes('-gbr-')) {
                user.countryOfAffiliation = 'GBR';
            } else if (username.includes('-nzl-')) {
                user.countryOfAffiliation = 'NZL';
            } else {
                user.countryOfAffiliation = 'USA'; // Default
            }
            logger.info('Enriched user country for federated query', {
                requestId,
                username,
                enrichedCountry: user.countryOfAffiliation
            });
        }

        // Final validation after enrichment
        if (!user?.clearance) {
            res.status(403).json({
                error: 'Forbidden',
                message: 'User clearance not available',
                requestId
            });
            return;
        }

        if (!user?.countryOfAffiliation) {
            res.status(403).json({
                error: 'Forbidden',
                message: 'User countryOfAffiliation not available',
                requestId
            });
            return;
        }

        // Build search options
        const searchOptions: IFederatedSearchOptions = {
            query: req.body.query,
            classification: req.body.classification ?
                (Array.isArray(req.body.classification) ? req.body.classification : [req.body.classification]) :
                undefined,
            releasableTo: req.body.releasableTo ?
                (Array.isArray(req.body.releasableTo) ? req.body.releasableTo : [req.body.releasableTo]) :
                undefined,
            coi: req.body.coi ?
                (Array.isArray(req.body.coi) ? req.body.coi : [req.body.coi]) :
                undefined,
            encrypted: req.body.encrypted,
            instances: req.body.instances,
            limit: parseInt(req.body.limit || '100'),
            offset: parseInt(req.body.offset || '0'),
            // Forward auth header for API-based federation to remote instances
            authHeader: req.headers.authorization
        };

        // Build user attributes for ABAC filtering
        const userAttributes: IUserAttributes = {
            uniqueID: user.uniqueID || user.sub || user.preferred_username,
            clearance: user.clearance,
            countryOfAffiliation: user.countryOfAffiliation,
            acpCOI: user.acpCOI || []
        };

        logger.info('Federated query initiated', {
            requestId,
            user: userAttributes.uniqueID,
            country: userAttributes.countryOfAffiliation,
            clearance: userAttributes.clearance,
            searchOptions: {
                query: searchOptions.query,
                classification: searchOptions.classification,
                instances: searchOptions.instances,
                limit: searchOptions.limit
            }
        });

        // Execute federated search
        const response = await federatedResourceService.search(searchOptions, userAttributes);

        logger.info('Federated query completed', {
            requestId,
            totalResults: response.totalResults,
            totalAccessible: response.totalAccessible, // Sum of ABAC-accessible docs
            returnedResults: response.results.length,
            executionTimeMs: response.executionTimeMs,
            instanceResults: Object.entries(response.instanceResults).map(([k, v]) => ({
                instance: k,
                count: v.count,
                accessibleCount: v.accessibleCount,  // Include accessibleCount
                latencyMs: v.latencyMs,
                error: v.error
            }))
        });

        res.json({
            requestId,
            ...response,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Federated query failed', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        next(error);
    }
});

/**
 * GET /api/resources/federated-query
 * Alias for POST (convenience for simple queries)
 */
router.get('/federated-query', authenticateJWT, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `fed-q-${Date.now()}`;
    const user = (req as any).user;

    try {
        if (!user?.clearance || !user?.countryOfAffiliation) {
            res.status(403).json({
                error: 'Forbidden',
                message: 'User attributes not available',
                requestId
            });
            return;
        }

        // Parse query params
        const searchOptions: IFederatedSearchOptions = {
            query: req.query.query as string,
            classification: req.query.classification ?
                (Array.isArray(req.query.classification) ? req.query.classification as string[] : [req.query.classification as string]) :
                undefined,
            releasableTo: req.query.releasableTo ?
                (Array.isArray(req.query.releasableTo) ? req.query.releasableTo as string[] : [req.query.releasableTo as string]) :
                undefined,
            coi: req.query.coi ?
                (Array.isArray(req.query.coi) ? req.query.coi as string[] : [req.query.coi as string]) :
                undefined,
            instances: req.query.instances ?
                (Array.isArray(req.query.instances) ? req.query.instances as string[] : [req.query.instances as string]) :
                undefined,
            limit: parseInt(req.query.limit as string || '100'),
            offset: parseInt(req.query.offset as string || '0')
        };

        const userAttributes: IUserAttributes = {
            uniqueID: user.uniqueID || user.sub,
            clearance: user.clearance,
            countryOfAffiliation: user.countryOfAffiliation,
            acpCOI: user.acpCOI || []
        };

        const response = await federatedResourceService.search(searchOptions, userAttributes);

        res.json({
            requestId,
            ...response,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Federated query (GET) failed', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        next(error);
    }
});

/**
 * GET /api/resources/federated-status
 * Get status of all federated instances
 */
router.get('/federated-status', authenticateJWT, async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const status = federatedResourceService.getInstanceStatus();
        const available = federatedResourceService.getAvailableInstances();

        res.json({
            currentInstance: process.env.INSTANCE_REALM || 'USA',
            federatedQueryEnabled: true,
            mode: 'direct-mongodb',
            instances: status,
            availableInstances: available,
            totalInstances: Object.keys(status).length,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/resources/federated-reconnect
 * Force reconnection to specific instance(s)
 */
router.post('/federated-reconnect', authenticateJWT, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = (req as any).user;

    try {
        // Admin-only operation
        if (!user?.preferred_username?.includes('admin')) {
            res.status(403).json({
                error: 'Forbidden',
                message: 'Admin privileges required'
            });
            return;
        }

        // Reinitialize the service (will reconnect all instances)
        await federatedResourceService.shutdown();
        await federatedResourceService.initialize();

        const status = federatedResourceService.getInstanceStatus();

        res.json({
            message: 'Reconnection initiated',
            instances: status,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        next(error);
    }
});

export default router;
