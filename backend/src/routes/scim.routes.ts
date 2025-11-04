/**
 * DIVE V3 SCIM Routes
 * SCIM 2.0 endpoints for user provisioning
 */

import { Router } from 'express';
import scimController from '../controllers/scim.controller';

const router = Router();

// Mount SCIM controller
router.use('/', scimController);

export default router;









