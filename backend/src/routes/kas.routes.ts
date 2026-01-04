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
import { mongoKasRegistryStore, IKasInstance } from '../models/kas-registry.model';
import { kasRouterService } from '../services/kas-router.service';
import { logger } from '../utils/logger';

const router: Router = express.Router();

// Initialize KAS registry store
mongoKasRegistryStore.initialize().catch((err) => {
  logger.error('Failed to initialize KAS registry store', { error: err.message });
});

/**
 * Require admin key for management endpoints
 */
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const adminKey = req.headers['x-admin-key'];

  if (adminKey !== process.env.FEDERATION_ADMIN_KEY && process.env.NODE_ENV === 'production') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  next();
}

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

// ============================================
// KAS REGISTRY MANAGEMENT (Phase 3)
// ============================================

/**
 * @openapi
 * /api/kas/register:
 *   post:
 *     summary: Register a new KAS instance
 *     description: |
 *       Register a new Key Access Service instance with the federation.
 *       The registration will be in 'pending' status until approved by an admin.
 *       
 *       **Phase 3**: KAS Auto-Registration API
 *     tags: [KAS, Federation]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - kasId
 *               - organization
 *               - kasUrl
 *             properties:
 *               kasId:
 *                 type: string
 *                 example: kas-fra
 *               organization:
 *                 type: string
 *                 example: France
 *               kasUrl:
 *                 type: string
 *                 example: https://fra-kas.dive25.com/request-key
 *               jwtIssuer:
 *                 type: string
 *                 example: https://fra-idp.dive25.com/realms/dive-v3-broker
 *               supportedCountries:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: [FRA, DEU, BEL]
 *               supportedCOIs:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: [NATO, EU-RESTRICTED]
 *     responses:
 *       201:
 *         description: KAS registration submitted
 *       400:
 *         description: Invalid request
 */
router.post('/register', async (req: Request, res: Response): Promise<void> => {
    try {
        const {
            kasId,
            organization,
            kasUrl,
            jwtIssuer,
            supportedCountries,
            supportedCOIs,
            capabilities,
            contact
        } = req.body;

        // Validate required fields
        if (!kasId || !organization || !kasUrl) {
            res.status(400).json({
                success: false,
                error: 'kasId, organization, and kasUrl are required'
            });
            return;
        }

        // Check if already registered
        const existing = await mongoKasRegistryStore.findById(kasId);
        if (existing) {
            res.status(409).json({
                success: false,
                error: 'KAS instance already registered',
                kasId,
                status: existing.status
            });
            return;
        }

        // Create registration
        const kasInstance: Omit<IKasInstance, 'status'> = {
            kasId,
            organization,
            kasUrl,
            authMethod: 'jwt',
            authConfig: {
                jwtIssuer: jwtIssuer || undefined
            },
            trustLevel: 'medium',
            supportedCountries: supportedCountries || [],
            supportedCOIs: supportedCOIs || ['NATO'],
            enabled: false, // Disabled until approved
            metadata: {
                version: '1.0.0',
                capabilities: capabilities || ['acp240', 'ztdf'],
                contact: contact
            }
        };

        const registered = await mongoKasRegistryStore.register(kasInstance);

        logger.info('KAS registration submitted', {
            kasId,
            organization,
            kasUrl,
            status: 'pending'
        });

        res.status(201).json({
            success: true,
            message: 'KAS registration submitted. Awaiting admin approval.',
            kasId: registered.kasId,
            status: registered.status
        });
    } catch (error) {
        logger.error('KAS registration failed', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        res.status(500).json({
            success: false,
            error: 'Registration failed'
        });
    }
});

/**
 * @openapi
 * /api/kas/registry:
 *   get:
 *     summary: List all registered KAS instances
 *     description: Returns all KAS instances in the federation registry
 *     tags: [KAS, Federation]
 *     responses:
 *       200:
 *         description: List of KAS instances
 */
router.get('/registry', async (_req: Request, res: Response): Promise<void> => {
    try {
        const instances = await mongoKasRegistryStore.findAll();
        const activeCount = instances.filter(i => i.status === 'active').length;

        res.json({
            success: true,
            kasInstances: instances.map(kas => ({
                kasId: kas.kasId,
                organization: kas.organization,
                kasUrl: kas.kasUrl,
                status: kas.status,
                enabled: kas.enabled,
                trustLevel: kas.trustLevel,
                supportedCountries: kas.supportedCountries,
                supportedCOIs: kas.supportedCOIs,
                lastHeartbeat: kas.metadata.lastHeartbeat,
                registeredAt: kas.metadata.registeredAt
            })),
            total: instances.length,
            active: activeCount,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve registry'
        });
    }
});

/**
 * @openapi
 * /api/kas/registry/:kasId/approve:
 *   post:
 *     summary: Approve a pending KAS registration
 *     description: Admin endpoint to approve a pending KAS registration
 *     tags: [KAS, Admin]
 *     security:
 *       - AdminKey: []
 */
router.post('/registry/:kasId/approve', requireAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
        const { kasId } = req.params;
        const approved = await mongoKasRegistryStore.approve(kasId);

        if (approved) {
            logger.info('KAS registration approved', { kasId });
            res.json({
                success: true,
                message: `KAS ${kasId} approved and activated`,
                kasId: approved.kasId,
                status: approved.status
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'KAS not found or not in pending status'
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Approval failed'
        });
    }
});

/**
 * @openapi
 * /api/kas/registry/:kasId/suspend:
 *   post:
 *     summary: Suspend a KAS instance
 *     description: Admin endpoint to suspend a KAS instance
 *     tags: [KAS, Admin]
 */
router.post('/registry/:kasId/suspend', requireAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
        const { kasId } = req.params;
        const { reason } = req.body;

        const suspended = await mongoKasRegistryStore.suspend(kasId, reason || 'Administrative action');

        if (suspended) {
            logger.warn('KAS instance suspended', { kasId, reason });
            res.json({
                success: true,
                message: `KAS ${kasId} suspended`,
                kasId: suspended.kasId,
                status: suspended.status
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'KAS not found'
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Suspension failed'
        });
    }
});

/**
 * @openapi
 * /api/kas/registry/:kasId/heartbeat:
 *   post:
 *     summary: KAS heartbeat
 *     description: Update heartbeat timestamp for a KAS instance
 *     tags: [KAS]
 */
router.post('/registry/:kasId/heartbeat', async (req: Request, res: Response): Promise<void> => {
    try {
        const { kasId } = req.params;

        await mongoKasRegistryStore.heartbeat(kasId);

        res.json({
            success: true,
            kasId,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Heartbeat failed'
        });
    }
});

/**
 * @openapi
 * /api/kas/registry/:kasId:
 *   delete:
 *     summary: Remove a KAS instance
 *     description: Admin endpoint to remove a KAS from the registry
 *     tags: [KAS, Admin]
 */
router.delete('/registry/:kasId', requireAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
        const { kasId } = req.params;
        const removed = await mongoKasRegistryStore.remove(kasId);

        if (removed) {
            logger.info('KAS instance removed', { kasId });
            res.json({
                success: true,
                message: `KAS ${kasId} removed from registry`
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'KAS not found'
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Removal failed'
        });
    }
});

/**
 * @openapi
 * /api/kas/lookup/:country:
 *   get:
 *     summary: Find KAS instances for a country
 *     description: Returns KAS instances that support a specific country
 *     tags: [KAS]
 */
router.get('/lookup/:country', async (req: Request, res: Response): Promise<void> => {
    try {
        const { country } = req.params;
        const instances = await mongoKasRegistryStore.findByCountry(country);

        res.json({
            success: true,
            country: country.toUpperCase(),
            kasInstances: instances.map(kas => ({
                kasId: kas.kasId,
                organization: kas.organization,
                kasUrl: kas.kasUrl,
                trustLevel: kas.trustLevel
            })),
            count: instances.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Lookup failed'
        });
    }
});

// ============================================
// CROSS-KAS ROUTING (Phase 3.4)
// ============================================

/**
 * @openapi
 * /api/kas/routing-table:
 *   get:
 *     summary: Get KAS routing table
 *     description: Returns the current KAS routing table with all instances and federation agreements
 *     tags: [KAS, Federation]
 */
router.get('/routing-table', async (_req: Request, res: Response): Promise<void> => {
    try {
        const routingTable = await kasRouterService.getRoutingTable();

        res.json({
            success: true,
            ...routingTable,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to get routing table'
        });
    }
});

/**
 * @openapi
 * /api/kas/route:
 *   post:
 *     summary: Find route for a cross-KAS key request
 *     description: Determines which KAS should handle a key request based on origin and requester
 *     tags: [KAS, Federation]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - originInstance
 *               - requesterInstance
 *             properties:
 *               originInstance:
 *                 type: string
 *                 example: USA
 *               requesterInstance:
 *                 type: string
 *                 example: FRA
 */
router.post('/route', async (req: Request, res: Response): Promise<void> => {
    try {
        const { originInstance, requesterInstance } = req.body;

        if (!originInstance || !requesterInstance) {
            res.status(400).json({
                success: false,
                error: 'originInstance and requesterInstance are required'
            });
            return;
        }

        const routeResult = await kasRouterService.findKasForRequest(originInstance, requesterInstance);

        res.json({
            success: routeResult.success,
            route: routeResult.success ? {
                kasId: routeResult.kasInstance?.kasId,
                organization: routeResult.kasInstance?.organization,
                kasUrl: routeResult.routedToUrl,
                reason: routeResult.reason,
                fallbackUsed: routeResult.fallbackUsed
            } : null,
            reason: routeResult.reason,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Route determination failed'
        });
    }
});

/**
 * @openapi
 * /api/kas/test-connectivity/:kasId:
 *   post:
 *     summary: Test connectivity to a KAS instance
 *     description: Pings a KAS instance to verify it's reachable
 *     tags: [KAS, Admin]
 */
router.post('/test-connectivity/:kasId', requireAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
        const { kasId } = req.params;
        const result = await kasRouterService.testKasConnectivity(kasId);

        res.json({
            success: result.success,
            kasId,
            latencyMs: result.latencyMs,
            error: result.error,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Connectivity test failed'
        });
    }
});

/**
 * @openapi
 * /api/kas/federated-request:
 *   post:
 *     summary: Execute a cross-KAS key request
 *     description: |
 *       Routes a key request to the appropriate KAS based on federation agreements.
 *       Used when accessing encrypted content from a different nation.
 *     tags: [KAS, Federation]
 *     security:
 *       - BearerAuth: []
 */
router.post('/federated-request', authenticateJWT, enforceFederationAgreement, async (req: Request, res: Response): Promise<void> => {
    try {
        const { resourceId, kaoId, originInstance, wrappedKey } = req.body;
        const requestId = req.headers['x-request-id'] as string || `kas-${Date.now()}`;
        const bearerToken = req.headers.authorization?.replace('Bearer ', '') || '';
        const requesterInstance = process.env.INSTANCE_CODE || 'USA';

        if (!resourceId || !originInstance) {
            res.status(400).json({
                success: false,
                error: 'resourceId and originInstance are required'
            });
            return;
        }

        logger.info('Federated KAS request initiated', {
            requestId,
            resourceId,
            originInstance,
            requesterInstance
        });

        const kasResponse = await kasRouterService.routeKeyRequest({
            resourceId,
            kaoId,
            originInstance,
            requesterInstance,
            bearerToken,
            wrappedKey,
            requestId
        });

        if (kasResponse.success) {
            res.json({
                success: true,
                decryptedContent: kasResponse.decryptedContent,
                key: kasResponse.key,
                kasId: kasResponse.kasId,
                requestId
            });
        } else {
            res.status(403).json({
                success: false,
                error: kasResponse.error || 'Key access denied',
                denialReason: kasResponse.denialReason,
                kasId: kasResponse.kasId,
                requestId
            });
        }
    } catch (error) {
        logger.error('Federated KAS request failed', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        res.status(500).json({
            success: false,
            error: 'Federated request failed'
        });
    }
});

export default router;
