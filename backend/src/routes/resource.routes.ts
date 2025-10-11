import { Router } from 'express';
import {
    listResourcesHandler,
    getResourceHandler
} from '../controllers/resource.controller';
import { authzMiddleware } from '../middleware/authz.middleware';

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
 */
router.get('/:id', authzMiddleware, getResourceHandler);

/**
 * POST /api/resources/request-key
 * Request decryption key from KAS (Week 4 stretch)
 */
// router.post('/request-key', requestKeyHandler);

export default router;

