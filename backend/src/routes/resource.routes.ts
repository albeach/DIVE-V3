import { Router } from 'express';
import {
    listResourcesHandler,
    getResourceHandler
} from '../controllers/resource.controller';

const router = Router();

/**
 * GET /api/resources
 * List all resources (no fine-grained authz in Week 1)
 * Week 2: Add filtering based on user clearance
 */
router.get('/', listResourcesHandler);

/**
 * GET /api/resources/:id
 * Get a specific resource
 * Week 2: Add PEP middleware for authorization
 */
router.get('/:id', getResourceHandler);

/**
 * POST /api/resources/request-key
 * Request decryption key from KAS (Week 4 stretch)
 */
// router.post('/request-key', requestKeyHandler);

export default router;

