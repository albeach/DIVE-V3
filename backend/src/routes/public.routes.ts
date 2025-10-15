/**
 * Public Routes
 * 
 * Unauthenticated endpoints for public-facing features
 * 
 * Routes:
 * - GET /api/idps/public - List enabled IdPs for login page
 */

import { Router, Request, Response } from 'express';
import { keycloakAdminService } from '../services/keycloak-admin.service';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/idps/public
 * Public endpoint to list enabled Identity Providers for login page
 * No authentication required - this is for unauthenticated users selecting their IdP
 */
router.get('/idps/public', async (req: Request, res: Response): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;

    try {
        logger.info('Public: List enabled IdPs request', { requestId });

        // Get all IdPs from Keycloak
        const result = await keycloakAdminService.listIdentityProviders();

        // Filter to only enabled IdPs (users should only see active options)
        const enabledIdps = result.idps.filter(idp => idp.enabled);

        logger.info('Public: Returning enabled IdPs', {
            requestId,
            total: result.total,
            enabled: enabledIdps.length
        });

        res.status(200).json({
            success: true,
            idps: enabledIdps.map(idp => ({
                alias: idp.alias,
                displayName: idp.displayName,
                protocol: idp.protocol,
                enabled: idp.enabled
            })),
            total: enabledIdps.length
        });
    } catch (error) {
        logger.error('Failed to list public IdPs', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        res.status(500).json({
            success: false,
            error: 'Failed to retrieve identity providers',
            message: error instanceof Error ? error.message : 'Unknown error',
            idps: [], // Return empty array for graceful fallback
            total: 0
        });
    }
});

export default router;

