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
 * GET /api/resources
 * List all resources with JWT authentication
 * NOTE: Returns all resources metadata - UI should hide resources user cannot access
 * Individual resource access is enforced by GET /api/resources/:id (with OPA)
 */
router.get('/', authenticateJWT, listResourcesHandler);

/**
 * CRITICAL: Specific routes MUST come BEFORE generic /:id route
 * Express matches routes in order - put specific paths first!
 */

/**
 * GET /api/resources/:id/ztdf
 * Get ZTDF details for a resource (Week 3.4.3 UI/UX transparency)
 * Returns full ZTDF structure with integrity validation results
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
 * POST /api/resources/federated-search
 * Phase 4, Task 3.2: Search across all federated instances (POST variant)
 * Supports complex query parameters in request body
 */
router.post('/federated-search', authenticateJWT, federatedSearchHandler);

/**
 * GET /api/resources/federated-status
 * Phase 4, Task 3.2: Get federation instance availability
 * Returns which instances are currently reachable
 */
router.get('/federated-status', authenticateJWT, federatedStatusHandler);

/**
 * GET /api/resources/:id
 * Get a specific resource
 * Week 2: PEP middleware enforces ABAC authorization via OPA
 * Week 3: Enrichment middleware fills missing attributes BEFORE authz
 * Phase 4: Federation agreement enforcement for SP access
 * 
 * IMPORTANT: This catch-all route MUST be LAST to avoid shadowing specific routes above
 */
router.get('/:id', authenticateJWT, enrichmentMiddleware, authzMiddleware, enforceFederationAgreement, getResourceHandler);

/**
 * POST /api/resources/request-key
 * Request decryption key from KAS (Week 3.4.3 KAS Request Modal)
 * Calls KAS service and decrypts content if approved
 * Phase 4: Federation agreement enforcement for SP access
 */
router.post('/request-key', authenticateJWT, enforceFederationAgreement, requestKeyHandler);

export default router;
