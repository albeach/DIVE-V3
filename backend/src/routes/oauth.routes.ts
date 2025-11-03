/**
 * DIVE V3 OAuth Routes
 * OAuth 2.0 endpoints for external SPs
 */

import { Router } from 'express';
import oauthController from '../controllers/oauth.controller';

const router = Router();

// Mount OAuth controller
router.use('/', oauthController);

export default router;
