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
 * @openapi
 * /api/resources/{id}/download:
 *   get:
 *     summary: Download ZTDF file
 *     description: |
 *       Downloads the resource as an OpenTDF-compliant ZIP archive (.ztdf).
 *       Compatible with OpenTDF CLI/SDK tools. Requires authentication only.
 *     tags: [Resources, KAS]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Resource ID to download
 *         example: doc-usa-001
 *     responses:
 *       200:
 *         description: ZTDF file download
 *         content:
 *           application/zip:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id/download', authenticateJWT, downloadZTDFHandler);

/**
 * @openapi
 * /api/resources/{id}/kas-flow:
 *   get:
 *     summary: Get KAS flow visualization
 *     description: |
 *       Returns the 6-step KAS access flow with current status for visualization.
 *       Includes authentication, authorization, key request, policy binding, decryption, and access logging steps.
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
 *         description: KAS flow status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 resourceId:
 *                   type: string
 *                 steps:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       step:
 *                         type: string
 *                       status:
 *                         type: string
 *                         enum: [pending, complete, failed]
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id/kas-flow', authenticateJWT, getKASFlowHandler);

/**
 * @openapi
 * /api/resources/count:
 *   get:
 *     summary: Get document count
 *     description: |
 *       Returns count of accessible documents for federated dashboard statistics.
 *       Used by Hub to aggregate document counts across federation.
 *       Requires trusted federation partner header.
 *     tags: [Resources, Federation]
 *     parameters:
 *       - in: query
 *         name: releasableTo
 *         schema:
 *           type: string
 *         description: Filter by releasability country (ISO 3166-1 alpha-3)
 *       - in: header
 *         name: x-federated-from
 *         required: true
 *         schema:
 *           type: string
 *         description: Source federation instance code
 *     responses:
 *       200:
 *         description: Document count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                 accessibleCount:
 *                   type: integer
 *                 releasableTo:
 *                   type: string
 *                 instance:
 *                   type: string
 *       403:
 *         description: Federated access required from trusted instance
 *       500:
 *         description: Server error
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
 * @openapi
 * /api/resources/search:
 *   post:
 *     summary: Paginated resource search
 *     description: |
 *       Cursor-based paginated search optimized for 28K+ documents.
 *       Supports complex filters, full-text search, and faceted navigation.
 *     tags: [Resources]
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
 *               filters:
 *                 type: object
 *                 properties:
 *                   classification:
 *                     type: array
 *                     items:
 *                       type: string
 *                   countries:
 *                     type: array
 *                     items:
 *                       type: string
 *                   coi:
 *                     type: array
 *                     items:
 *                       type: string
 *               cursor:
 *                 type: string
 *                 description: Pagination cursor from previous response
 *               limit:
 *                 type: integer
 *                 default: 20
 *                 maximum: 100
 *     responses:
 *       200:
 *         description: Search results with pagination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Resource'
 *                 nextCursor:
 *                   type: string
 *                   nullable: true
 *                 total:
 *                   type: integer
 *                 facets:
 *                   type: object
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/search', authenticateJWT, paginatedSearchHandler);

/**
 * @openapi
 * /api/resources/search/facets:
 *   get:
 *     summary: Get search facets
 *     description: |
 *       Returns facet counts for filter UI without fetching full results.
 *       Includes counts for classification levels, countries, COIs, and other filterable fields.
 *     tags: [Resources]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Facet counts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 classification:
 *                   type: object
 *                   additionalProperties:
 *                     type: integer
 *                   example:
 *                     UNCLASSIFIED: 5000
 *                     CONFIDENTIAL: 1200
 *                     SECRET: 800
 *                     TOP_SECRET: 50
 *                 countries:
 *                   type: object
 *                   additionalProperties:
 *                     type: integer
 *                 coi:
 *                   type: object
 *                   additionalProperties:
 *                     type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/search/facets', authenticateJWT, getFacetsHandler);

/**
 * Phase 4: Federated Search Routes
 * These must come BEFORE the /:id catch-all route
 */

/**
 * @openapi
 * /api/resources/federated-search:
 *   get:
 *     summary: Federated search (GET)
 *     description: |
 *       Search across all federated coalition instances using query parameters.
 *       Returns aggregated results from USA, FRA, GBR, DEU with source attribution.
 *     tags: [Resources, Federation]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *         description: Full-text search query
 *       - in: query
 *         name: classification
 *         schema:
 *           type: string
 *           enum: [UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
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
 * @openapi
 * /api/resources/federated-status:
 *   get:
 *     summary: Get federation instance status
 *     description: |
 *       Returns availability status of all federated coalition instances.
 *       Indicates which instances are currently reachable for federated search.
 *     tags: [Resources, Federation]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Federation instance status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 instances:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       code:
 *                         type: string
 *                         description: Instance code (USA, FRA, GBR, DEU)
 *                       name:
 *                         type: string
 *                       available:
 *                         type: boolean
 *                       lastCheck:
 *                         type: string
 *                         format: date-time
 *                       responseTime:
 *                         type: integer
 *                         description: Response time in milliseconds
 *                 totalInstances:
 *                   type: integer
 *                 availableInstances:
 *                   type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
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
router.post('/request-key', authenticateJWT, enrichmentMiddleware, enforceFederationAgreement, requestKeyHandler);

export default router;
