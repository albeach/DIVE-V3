/**
 * KAS Routes - Key Access Service Proxy Routes
 * 
 * This module provides routes for KAS operations that are accessible via
 * the /api/kas/* path prefix. These routes proxy to the internal KAS service
 * and are used by KAO (Key Access Object) URLs stored in ZTDF documents.
 * 
 * ACP-240 Compliance: Provides policy-bound key release endpoints
 * ADatP-5663 Compliance: Audit logging for all key operations
 */

import express, { Router, Request, Response, NextFunction } from 'express';
import { authenticateJWT } from '../middleware/authz.middleware';
import { enforceFederationAgreement } from '../middleware/federation-agreement.middleware';
import { requestKeyHandler } from '../controllers/resource.controller';
import { logger } from '../utils/logger';

const router: Router = express.Router();

/**
 * POST /api/kas/request-key
 * 
 * Request decryption key from KAS service.
 * This endpoint is referenced by KAO URLs stored in ZTDF documents.
 * 
 * The request is delegated to the same handler as /api/resources/request-key
 * to maintain consistent policy enforcement and audit logging.
 * 
 * @security JWT Bearer token required
 * @body {resourceId, kaoId, bearerToken}
 * @returns {success, key} on approval, {error, denialReason} on denial
 */
router.post('/request-key', authenticateJWT, enforceFederationAgreement, (req: Request, res: Response, next: NextFunction) => {
    logger.info('KAS route: request-key called', {
        requestId: req.headers['x-request-id'],
        resourceId: req.body?.resourceId,
        kaoId: req.body?.kaoId,
        path: '/api/kas/request-key'
    });
    
    // Delegate to the existing requestKeyHandler
    return requestKeyHandler(req, res, next);
});

/**
 * GET /api/kas/health
 * 
 * KAS health check endpoint for monitoring.
 * Returns status of the KAS proxy route (does not check actual KAS service).
 */
router.get('/health', (_req: Request, res: Response) => {
    res.json({
        service: 'DIVE V3 KAS Proxy',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        endpoint: '/api/kas/request-key'
    });
});

export default router;

