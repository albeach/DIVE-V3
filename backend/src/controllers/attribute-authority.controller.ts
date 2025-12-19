/**
 * Attribute Authority API Endpoints
 * NATO Compliance: ADatP-5663 §3.4, §5.4.2
 * Phase 4, Task 4.1
 */

import { Router, Request, Response } from 'express';
import { attributeAuthorityService } from '../services/attribute-authority.service';
import { authenticateJWT } from '../middleware/authz.middleware';
import { logger } from '../utils/logger';

const router = Router();

/**
 * POST /api/aa/attributes
 * Request signed attributes from Attribute Authority
 * 
 * ADatP-5663 §5.4.2: AA retrieval requires valid access token
 */
router.post('/attributes', authenticateJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const { accessToken, attributeNames } = req.body;

    if (!accessToken || !attributeNames) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'accessToken and attributeNames required',
      });
      return;
    }

    if (!Array.isArray(attributeNames)) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'attributeNames must be an array',
      });
      return;
    }

    const result = await attributeAuthorityService.getSignedAttributes({
      accessToken,
      attributeNames,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    logger.error(`Attribute Authority request failed: ${error}`);
    res.status(500).json({
      error: 'Internal Server Error',
      message: (error as Error).message,
    });
  }
});

/**
 * POST /api/aa/verify
 * Verifies signed attributes
 */
router.post('/verify', async (req: Request, res: Response): Promise<void> => {
  try {
    const { jws } = req.body;

    if (!jws) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'jws (signed attributes) required',
      });
      return;
    }

    const result = await attributeAuthorityService.verifySignedAttributes(jws);

    if (!result.valid) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid signature',
        details: result.error,
      });
      return;
    }

    res.json({
      success: true,
      valid: true,
      attributes: result.attributes,
    });
  } catch (error) {
    logger.error(`Attribute verification failed: ${error}`);
    res.status(500).json({
      error: 'Internal Server Error',
      message: (error as Error).message,
    });
  }
});

/**
 * GET /api/aa/.well-known/jwks.json
 * AA public key in JWKS format (for SPs to verify signatures)
 */
router.get('/.well-known/jwks.json', async (_req: Request, res: Response): Promise<void> => {
  try {
    const jwks = await attributeAuthorityService.getPublicJWKS();
    res.json(jwks);
  } catch (error) {
    logger.error(`JWKS endpoint error: ${error}`);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to generate JWKS',
    });
  }
});

export default router;
