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
 * @openapi
 * /api/kas/request-key:
 *   post:
 *     summary: Request decryption key from KAS
 *     description: |
 *       Requests a decryption key from the Key Access Service for ZTDF-encrypted content.
 *       KAS re-evaluates authorization policy before releasing the key.
 *       This endpoint is referenced by KAO (Key Access Object) URLs in ZTDF documents.
 *
 *       **ACP-240 Compliance**: Policy-bound key release
 *       **ADatP-5663 Compliance**: Full audit logging
 *     tags: [KAS]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - resourceId
 *             properties:
 *               resourceId:
 *                 type: string
 *                 description: ID of the encrypted resource
 *                 example: doc-usa-encrypted-001
 *               kaoId:
 *                 type: string
 *                 description: Key Access Object identifier
 *               reason:
 *                 type: string
 *                 description: Justification for key request
 *     responses:
 *       200:
 *         description: Key released successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 key:
 *                   type: string
 *                   description: Base64-encoded decryption key
 *                 decryptedContent:
 *                   type: string
 *                   description: Decrypted resource content
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Key access denied
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Key access denied
 *                 denialReason:
 *                   type: string
 *                   example: Insufficient clearance level
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
 * @openapi
 * /api/kas/health:
 *   get:
 *     summary: KAS health check
 *     description: Returns the health status of the KAS proxy service
 *     tags: [KAS, Health]
 *     security: []
 *     responses:
 *       200:
 *         description: KAS service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 service:
 *                   type: string
 *                   example: DIVE V3 KAS Proxy
 *                 status:
 *                   type: string
 *                   example: healthy
 *                 timestamp:
 *                   type: string
 *                   format: date-time
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
