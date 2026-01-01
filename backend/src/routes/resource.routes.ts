import { Router } from 'express';
import {
    listResourcesHandler,
    getResourceHandler,
    getZTDFDetailsHandler,
    getKASFlowHandler,
    requestKeyHandler,
    downloadZTDFHandler
} from '../controllers/resource.controller';
import {
    federatedSearchHandler,
    federatedSearchGetHandler,
    federatedStatusHandler
} from '../controllers/federated-search.controller';
import {
    paginatedSearchHandler,
    getFacetsHandler
} from '../controllers/paginated-search.controller';
import { authzMiddleware, authenticateJWT } from '../middleware/authz.middleware';
import { enrichmentMiddleware } from '../middleware/enrichment.middleware';
import { enforceFederationAgreement } from '../middleware/federation-agreement.middleware';

const router = Router();

/**
 * @openapi
 * /api/resources:
 *   get:
 *     summary: List all resources
 *     description: |
 *       Returns metadata for all resources. Individual resource access
 *       is enforced by GET /api/resources/:id with OPA policy evaluation.
 *       UI should filter resources based on user's clearance level.
 *     tags: [Resources]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: classification
 *         schema:
 *           type: string
 *           enum: [UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET]
 *         description: Filter by classification level
 *       - in: query
 *         name: country
 *         schema:
 *           type: string
 *         description: Filter by releasability country (ISO 3166-1 alpha-3)
 *     responses:
 *       200:
 *         description: List of resources
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 resources:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Resource'
 *                 total:
 *                   type: integer
 *                   example: 150
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/', authenticateJWT, listResourcesHandler);

/**
 * CRITICAL: Specific routes MUST come BEFORE generic /:id route
 * Express matches routes in order - put specific paths first!
 */

/**
 * @openapi
 * /api/resources/{id}/ztdf:
 *   get:
 *     summary: Get ZTDF details
 *     description: |
 *       Returns Zero Trust Data Format (ZTDF) structure with integrity validation.
 *       Includes encryption metadata, policy bindings, and integrity status.
 *     tags: [Resources, KAS]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Resource ID
 *         example: doc-usa-001
 *     responses:
 *       200:
 *         description: ZTDF details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 resourceId:
 *                   type: string
 *                 encrypted:
 *                   type: boolean
 *                 ztdfStructure:
 *                   type: object
 *                 integrityValid:
 *                   type: boolean
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id/ztdf', authenticateJWT, getZTDFDetailsHandler);

/**
 * GET /api/resources/:id/download
 * Download ZTDF file in OpenTDF-compliant format (Week 4)
 * Returns ZIP archive (.ztdf) compatible with OpenTDF CLI/SDK tools
 * Authentication only (no authorization) - download requires valid JWT
 */
router.get('/:id/download', authenticateJWT, downloadZTDFHandler);

/**
 * GET /api/resources/:id/kas-flow
 * Get KAS flow status for a resource (Week 3.4.3 KAS Flow Visualizer)
 * Returns 6-step KAS access flow with current status
 */
router.get('/:id/kas-flow', authenticateJWT, getKASFlowHandler);

/**
 * GET /api/resources/count
 * Get count of accessible documents (for federated dashboard stats)
 * Used by Hub to aggregate document counts across federation
 */
router.get('/count', async (req, res) => {
    try {
        const { releasableTo } = req.query;
        const federatedFrom = req.headers['x-federated-from'] as string;

        // Only allow from trusted federation partners
        const trustedInstances = (process.env.TRUSTED_FEDERATION_INSTANCES || 'USA,FRA,GBR,DEU').split(',');
        if (!federatedFrom || !trustedInstances.includes(federatedFrom.toUpperCase())) {
            res.status(403).json({ error: 'Federated access required' });
            return;
        }

        // Dynamically import to avoid circular dependencies
        const { getMongoDBUrl, getMongoDBName } = await import('../utils/mongodb-config');
        const { MongoClient } = await import('mongodb');

        const client = new MongoClient(getMongoDBUrl());
        await client.connect();

        try {
            const db = client.db(getMongoDBName());
            const collection = db.collection('resources');

            // Build filter based on releasability
            const filter: any = {};
            if (releasableTo) {
                filter.releasabilityTo = releasableTo.toString().toUpperCase();
            }

            const count = await collection.countDocuments(filter);

            res.status(200).json({
                success: true,
                count,
                accessibleCount: count,
                releasableTo: releasableTo || 'all',
                instance: process.env.INSTANCE_CODE || 'USA'
            });
        } finally {
            await client.close();
        }
    } catch (error) {
        console.error('Error counting resources:', error);
        res.status(500).json({ error: 'Internal server error', count: 0 });
    }
});

/**
 * Phase 1: Performance Foundation - Paginated Search Routes
 * Server-side cursor pagination for 28K+ documents
 */

/**
 * POST /api/resources/search
 * Paginated search with cursor-based pagination and facets
 * Supports complex filters in request body
 */
router.post('/search', authenticateJWT, paginatedSearchHandler);

/**
 * GET /api/resources/search/facets
 * Get facet counts without results (for filter UI)
 */
router.get('/search/facets', authenticateJWT, getFacetsHandler);

/**
 * Phase 4: Federated Search Routes
 * These must come BEFORE the /:id catch-all route
 */

/**
 * GET /api/resources/federated-search
 * Phase 4, Task 3.2: Search across all federated instances
 * Returns aggregated results from USA, FRA, GBR, DEU
 */
router.get('/federated-search', authenticateJWT, federatedSearchGetHandler);

/**
 * @openapi
 * /api/resources/federated-search:
 *   post:
 *     summary: Federated search across all instances
 *     description: |
 *       Search across all federated coalition instances (USA, FRA, GBR, DEU).
 *       Returns aggregated results with source instance attribution.
 *     tags: [Resources, Federation]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               query:
 *                 type: string
 *                 description: Full-text search query
 *                 example: fuel inventory
 *               classification:
 *                 type: string
 *                 enum: [UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET]
 *               countries:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: [USA, GBR]
 *               limit:
 *                 type: integer
 *                 default: 20
 *     responses:
 *       200:
 *         description: Federated search results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Resource'
 *                 sources:
 *                   type: object
 *                   description: Results count per instance
 *                 totalResults:
 *                   type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/federated-search', authenticateJWT, federatedSearchHandler);

/**
 * GET /api/resources/federated-status
 * Phase 4, Task 3.2: Get federation instance availability
 * Returns which instances are currently reachable
 */
router.get('/federated-status', authenticateJWT, federatedStatusHandler);

/**
 * @openapi
 * /api/resources/{id}:
 *   get:
 *     summary: Get a specific resource
 *     description: |
 *       Retrieves a single resource with full ABAC authorization via OPA.
 *       Evaluates clearance, releasability, and COI membership.
 *       Returns decrypted content for ZTDF resources if authorized.
 *     tags: [Resources]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Resource ID
 *         example: doc-usa-001
 *     responses:
 *       200:
 *         description: Resource with authorization decision
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Resource'
 *                 - type: object
 *                   properties:
 *                     content:
 *                       type: string
 *                       description: Decrypted content (if authorized)
 *                     authorizationDecision:
 *                       $ref: '#/components/schemas/AuthorizationDecision'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', authenticateJWT, enrichmentMiddleware, authzMiddleware, enforceFederationAgreement, getResourceHandler);

/**
 * @openapi
 * /api/resources/request-key:
 *   post:
 *     summary: Request decryption key from KAS
 *     description: |
 *       Requests a decryption key from the Key Access Service (KAS).
 *       KAS re-evaluates authorization before releasing the key.
 *       Returns decrypted content if authorized.
 *     tags: [Resources, KAS]
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
 *                 description: Resource to decrypt
 *                 example: doc-usa-001
 *               reason:
 *                 type: string
 *                 description: Justification for access
 *                 example: Mission planning requirement
 *     responses:
 *       200:
 *         description: Key released and content decrypted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 decryptedContent:
 *                   type: string
 *                 kasDecision:
 *                   type: object
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post('/request-key', authenticateJWT, enforceFederationAgreement, requestKeyHandler);

export default router;
