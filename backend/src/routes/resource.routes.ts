import { Router } from 'express';
import {
    listResourcesHandler,
    getResourceHandler,
    getZTDFDetailsHandler,
    getKASFlowHandler,
    requestKeyHandler
} from '../controllers/resource.controller';
import { authzMiddleware, authenticateJWT } from '../middleware/authz.middleware';
import { enrichmentMiddleware } from '../middleware/enrichment.middleware';

const router = Router();

/**
 * GET /api/resources
 * List all resources (no fine-grained authz in Week 1)
 * Week 2: Returns basic metadata for all resources
 */
router.get('/', listResourcesHandler);

/**
 * GET /api/resources/:id
 * Get a specific resource
 * Week 2: PEP middleware enforces ABAC authorization via OPA
 * Week 3: Enrichment middleware fills missing attributes BEFORE authz
 */
router.get('/:id', enrichmentMiddleware, authzMiddleware, getResourceHandler);

/**
 * GET /api/resources/:id/ztdf
 * Get ZTDF details for a resource (Week 3.4.3 UI/UX transparency)
 * Returns full ZTDF structure with integrity validation results
 */
router.get('/:id/ztdf', authenticateJWT, getZTDFDetailsHandler);

/**
 * GET /api/resources/:id/kas-flow
 * Get KAS flow status for a resource (Week 3.4.3 KAS Flow Visualizer)
 * Returns 6-step KAS access flow with current status
 */
router.get('/:id/kas-flow', authenticateJWT, getKASFlowHandler);

/**
 * POST /api/resources/request-key
 * Request decryption key from KAS (Week 3.4.3 KAS Request Modal)
 * Calls KAS service and decrypts content if approved
 */
router.post('/request-key', authenticateJWT, requestKeyHandler);

export default router;

