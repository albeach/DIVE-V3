/**
 * DIVE V3 Federation Routes
 * Federation endpoints for resource exchange
 */

import { Router } from 'express';
import federationController from '../controllers/federation.controller';

const router = Router();

// Mount Federation controller
router.use('/', federationController);

export default router;
