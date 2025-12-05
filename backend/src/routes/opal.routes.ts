/**
 * DIVE V3 - OPAL Routes
 *
 * API endpoints for OPAL Server integration:
 *   - Policy data endpoint (for OPAL to fetch)
 *   - Bundle management endpoints
 *   - OPAL health and status
 *
 * @version 1.0.0
 * @date 2025-12-05
 */

import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { policyBundleService } from '../services/policy-bundle.service';
import { opalClient } from '../services/opal-client';
import { policySyncService } from '../services/policy-sync.service';
import { hubSpokeRegistry } from '../services/hub-spoke-registry.service';
import fs from 'fs';
import path from 'path';

const router = Router();

// ============================================
// POLICY DATA ENDPOINT (for OPAL Server)
// ============================================

/**
 * GET /api/opal/policy-data
 * Endpoint for OPAL Server to fetch policy data
 * Called periodically by OPAL to sync data to connected clients
 */
router.get('/policy-data', async (req: Request, res: Response): Promise<void> => {
  try {
    const opalSource = req.headers['x-opal-source'] as string;

    logger.debug('OPAL policy data request', {
      source: opalSource || 'unknown',
      userAgent: req.headers['user-agent'],
    });

    // Get current policy version
    const policyVersion = policySyncService.getCurrentVersion();

    // Get federation data
    const spokes = await hubSpokeRegistry.listActiveSpokes();
    const trustedIssuers = await getTrustedIssuers();
    const federationMatrix = await getFederationMatrix();
    const coiMembership = await getCoiMembership();

    // Build policy data response
    const policyData = {
      // Policy metadata
      policy_version: policyVersion,
      updated_at: new Date().toISOString(),

      // Federation data
      federation: {
        spokes: spokes.map((s) => ({
          spokeId: s.spokeId,
          instanceCode: s.instanceCode,
          status: s.status,
          trustLevel: s.trustLevel,
          allowedPolicyScopes: s.allowedPolicyScopes,
          maxClassificationAllowed: s.maxClassificationAllowed,
        })),
        trusted_issuers: trustedIssuers,
        federation_matrix: federationMatrix,
        coi_membership: coiMembership,
      },

      // Bundle metadata
      bundle: policyBundleService.getCurrentManifest() || {
        revision: policyVersion.version,
        roots: ['dive'],
        files: [],
      },
    };

    res.json(policyData);
  } catch (error) {
    logger.error('Failed to serve policy data', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      error: 'Failed to retrieve policy data',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================
// BUNDLE MANAGEMENT
// ============================================

/**
 * POST /api/opal/bundle/build
 * Build a new policy bundle
 */
router.post('/bundle/build', async (req: Request, res: Response): Promise<void> => {
  try {
    const { scopes, includeData, sign, compress } = req.body;

    logger.info('Building policy bundle', { scopes, includeData, sign });

    const result = await policyBundleService.buildBundle({
      scopes,
      includeData: includeData ?? true,
      sign: sign ?? true,
      compress: compress ?? true,
    });

    if (result.success) {
      res.json({
        success: true,
        bundleId: result.bundleId,
        version: result.version,
        hash: result.hash,
        size: result.size,
        fileCount: result.fileCount,
        signed: !!result.signature,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    logger.error('Bundle build failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Build failed',
    });
  }
});

/**
 * POST /api/opal/bundle/publish
 * Publish current bundle to OPAL Server
 */
router.post('/bundle/publish', async (_req: Request, res: Response): Promise<void> => {
  try {
    logger.info('Publishing policy bundle to OPAL');

    const result = await policyBundleService.publishBundle();

    if (result.success) {
      res.json({
        success: true,
        bundleId: result.bundleId,
        version: result.version,
        publishedAt: result.publishedAt,
        opalTransactionId: result.opalTransactionId,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    logger.error('Bundle publish failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Publish failed',
    });
  }
});

/**
 * POST /api/opal/bundle/build-and-publish
 * Build and publish in one operation
 */
router.post('/bundle/build-and-publish', async (req: Request, res: Response): Promise<void> => {
  try {
    const { scopes, includeData } = req.body;

    logger.info('Building and publishing policy bundle', { scopes });

    const { buildResult, publishResult } = await policyBundleService.buildAndPublish({
      scopes,
      includeData: includeData ?? true,
      sign: true,
      compress: true,
    });

    res.json({
      build: {
        success: buildResult.success,
        bundleId: buildResult.bundleId,
        version: buildResult.version,
        hash: buildResult.hash,
        size: buildResult.size,
        fileCount: buildResult.fileCount,
        error: buildResult.error,
      },
      publish: publishResult
        ? {
            success: publishResult.success,
            publishedAt: publishResult.publishedAt,
            opalTransactionId: publishResult.opalTransactionId,
            error: publishResult.error,
          }
        : undefined,
    });
  } catch (error) {
    logger.error('Build and publish failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Operation failed',
    });
  }
});

/**
 * GET /api/opal/bundle/current
 * Get current bundle metadata
 */
router.get('/bundle/current', async (_req: Request, res: Response): Promise<void> => {
  try {
    const bundle = policyBundleService.getCurrentBundle();

    if (!bundle) {
      res.status(404).json({
        error: 'No bundle available',
        message: 'Build a bundle first using POST /api/opal/bundle/build',
      });
      return;
    }

    res.json({
      bundleId: bundle.bundleId,
      version: bundle.version,
      hash: bundle.hash,
      scopes: bundle.scopes,
      signedAt: bundle.signedAt,
      signedBy: bundle.signedBy,
      manifest: {
        revision: bundle.manifest.revision,
        roots: bundle.manifest.roots,
        fileCount: bundle.manifest.files.length,
        files: bundle.manifest.files.map((f) => ({
          path: f.path,
          hash: f.hash.substring(0, 16) + '...',
          size: f.size,
        })),
      },
      size: bundle.contents.length,
    });
  } catch (error) {
    logger.error('Failed to get current bundle', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      error: 'Failed to retrieve bundle',
    });
  }
});

/**
 * GET /api/opal/bundle/scopes
 * Get available policy scopes
 */
router.get('/bundle/scopes', async (_req: Request, res: Response): Promise<void> => {
  try {
    const scopes = policyBundleService.getAvailableScopes();

    res.json({
      scopes,
      descriptions: {
        'policy:base': 'Base guardrail policies (always included)',
        'policy:fvey': 'Five Eyes organization policies',
        'policy:nato': 'NATO organization policies',
        'policy:usa': 'USA tenant policies',
        'policy:fra': 'France tenant policies',
        'policy:gbr': 'Great Britain tenant policies',
        'policy:deu': 'Germany tenant policies',
      },
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to retrieve scopes',
    });
  }
});

// ============================================
// OPAL STATUS
// ============================================

/**
 * GET /api/opal/health
 * Get OPAL Server health status
 */
router.get('/health', async (_req: Request, res: Response): Promise<void> => {
  try {
    const health = await opalClient.checkHealth();

    res.json({
      opalEnabled: opalClient.isOPALEnabled(),
      ...health,
      config: {
        serverUrl: opalClient.getConfig().serverUrl,
        topics: opalClient.getConfig().dataTopics,
      },
    });
  } catch (error) {
    res.status(500).json({
      healthy: false,
      error: error instanceof Error ? error.message : 'Health check failed',
    });
  }
});

/**
 * POST /api/opal/refresh
 * Trigger OPAL policy refresh
 */
router.post('/refresh', async (_req: Request, res: Response): Promise<void> => {
  try {
    logger.info('Triggering OPAL policy refresh');

    const result = await opalClient.triggerPolicyRefresh();

    res.json({
      success: result.success,
      transactionId: result.transactionId,
      message: result.message,
      timestamp: result.timestamp,
    });
  } catch (error) {
    logger.error('Policy refresh failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Refresh failed',
    });
  }
});

/**
 * POST /api/opal/data/publish
 * Publish inline data to OPAL
 */
router.post('/data/publish', async (req: Request, res: Response): Promise<void> => {
  try {
    const { path: dataPath, data, reason } = req.body;

    if (!dataPath || !data) {
      res.status(400).json({
        success: false,
        error: 'path and data are required',
      });
      return;
    }

    logger.info('Publishing inline data to OPAL', { path: dataPath, reason });

    const result = await opalClient.publishInlineData(dataPath, data, reason);

    res.json({
      success: result.success,
      transactionId: result.transactionId,
      message: result.message,
      timestamp: result.timestamp,
    });
  } catch (error) {
    logger.error('Data publish failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Publish failed',
    });
  }
});

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Load trusted issuers from data file
 */
async function getTrustedIssuers(): Promise<Record<string, unknown>> {
  try {
    const dataPath = path.join(process.env.POLICIES_DIR || '/app/policies', 'data', 'trusted_issuers.json');
    if (fs.existsSync(dataPath)) {
      const content = fs.readFileSync(dataPath, 'utf8');
      return JSON.parse(content);
    }
  } catch (error) {
    logger.warn('Could not load trusted_issuers.json', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
  return {};
}

/**
 * Load federation matrix from data file
 */
async function getFederationMatrix(): Promise<Record<string, unknown>> {
  try {
    const dataPath = path.join(process.env.POLICIES_DIR || '/app/policies', 'data', 'federation_matrix.json');
    if (fs.existsSync(dataPath)) {
      const content = fs.readFileSync(dataPath, 'utf8');
      return JSON.parse(content);
    }
  } catch (error) {
    logger.warn('Could not load federation_matrix.json', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
  return {};
}

/**
 * Load COI membership from data file
 */
async function getCoiMembership(): Promise<Record<string, unknown>> {
  try {
    const dataPath = path.join(process.env.POLICIES_DIR || '/app/policies', 'data', 'coi_membership.json');
    if (fs.existsSync(dataPath)) {
      const content = fs.readFileSync(dataPath, 'utf8');
      return JSON.parse(content);
    }
  } catch (error) {
    logger.warn('Could not load coi_membership.json', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
  return {};
}

export default router;

