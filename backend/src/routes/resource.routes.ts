import { Router } from 'express';
import {
    listResourcesHandler,
    getResourceHandler,
    getZTDFDetailsHandler,
    getKASFlowHandler,
    requestKeyHandler,
    downloadZTDFHandler
} from '../controllers/resource.controller';
import { authzMiddleware, authenticateJWT } from '../middleware/authz.middleware';
import { enrichmentMiddleware } from '../middleware/enrichment.middleware';

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
 * GET /api/resources/:id
 * Get a specific resource
 * Week 2: PEP middleware enforces ABAC authorization via OPA
 * Week 3: Enrichment middleware fills missing attributes BEFORE authz
 * 
 * IMPORTANT: This catch-all route MUST be LAST to avoid shadowing specific routes above
 */
router.get('/:id', enrichmentMiddleware, authzMiddleware, getResourceHandler);

/**
 * POST /api/resources/request-key
 * Request decryption key from KAS (Week 3.4.3 KAS Request Modal)
 * Calls KAS service and decrypts content if approved
 */
router.post('/request-key', authenticateJWT, requestKeyHandler);

export default router;

