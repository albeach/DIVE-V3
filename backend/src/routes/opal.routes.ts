/**
 * DIVE V3 - OPAL Routes
 *
 * API endpoints for OPAL Server integration:
 *   - Policy data endpoint (for OPAL to fetch)
 *   - Bundle management endpoints
 *   - OPAL health and status
 *   - Scoped bundle downloads (Phase 4)
 *   - Version tracking (Phase 4)
 *   - Bundle signature verification (Phase 4)
 *
 * @version 2.0.0
 * @date 2025-12-11
 */

import { Router, Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { policyBundleService } from '../services/policy-bundle.service';
import { opalClient } from '../services/opal-client';
import { policySyncService } from '../services/policy-sync.service';
import { hubSpokeRegistry } from '../services/hub-spoke-registry.service';
import fs from 'fs';
import path from 'path';

const router = Router();

// ============================================
// MIDDLEWARE
// ============================================

/**
 * Validate spoke token for scoped bundle downloads
 */
async function requireSpokeToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.substring(7);
  const validation = await hubSpokeRegistry.validateToken(token);

  if (!validation.valid) {
    res.status(401).json({ error: validation.error || 'Invalid token' });
    return;
  }

  // Attach spoke info to request
  (req as any).spoke = validation.spoke;
  (req as any).spokeScopes = validation.scopes;

  next();
}

/**
 * Require admin role for management endpoints
 */
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const adminKey = req.headers['x-admin-key'];

  if (adminKey !== process.env.FEDERATION_ADMIN_KEY && process.env.NODE_ENV === 'production') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  next();
}

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
// PHASE 4: SCOPED BUNDLE ENDPOINTS
// ============================================

/**
 * GET /api/opal/version
 * Get current policy version (public - for spokes to check)
 */
router.get('/version', async (_req: Request, res: Response): Promise<void> => {
  try {
    const version = policySyncService.getCurrentVersion();
    const bundle = policyBundleService.getCurrentBundle();

    res.json({
      version: version.version,
      hash: version.hash,
      timestamp: version.timestamp,
      layers: version.layers,
      bundle: bundle
        ? {
          bundleId: bundle.bundleId,
          signedAt: bundle.signedAt,
          signedBy: bundle.signedBy,
          scopes: bundle.scopes,
          fileCount: bundle.manifest.files.length,
        }
        : null,
    });
  } catch (error) {
    logger.error('Failed to get policy version', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      error: 'Failed to retrieve policy version',
    });
  }
});

/**
 * GET /api/opal/bundle/:scope
 * Download scoped policy bundle (requires spoke token with matching scope)
 */
router.get('/bundle/:scope', requireSpokeToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const requestedScope = req.params.scope;
    const spoke = (req as any).spoke;
    const spokeScopes = (req as any).spokeScopes || [];

    // Normalize scope format (e.g., "usa" -> "policy:usa")
    const normalizedScope = requestedScope.startsWith('policy:')
      ? requestedScope
      : `policy:${requestedScope}`;

    // Check if spoke has access to this scope
    // Base policies are always included
    const hasAccess =
      normalizedScope === 'policy:base' ||
      spokeScopes.includes(normalizedScope) ||
      spokeScopes.includes('policy:all');

    if (!hasAccess) {
      logger.warn('Spoke requested unauthorized scope', {
        spokeId: spoke.spokeId,
        instanceCode: spoke.instanceCode,
        requestedScope: normalizedScope,
        allowedScopes: spokeScopes,
      });

      res.status(403).json({
        error: 'Access denied',
        message: `Scope '${normalizedScope}' not in allowed scopes`,
        allowedScopes: spokeScopes,
      });
      return;
    }

    logger.info('Building scoped bundle for spoke', {
      spokeId: spoke.spokeId,
      instanceCode: spoke.instanceCode,
      scope: normalizedScope,
    });

    // Build bundle with requested scope
    const buildResult = await policyBundleService.getBundleForScopes([normalizedScope]);

    if (!buildResult.success) {
      res.status(500).json({
        success: false,
        error: buildResult.error || 'Failed to build bundle',
      });
      return;
    }

    // Get the bundle
    const bundle = policyBundleService.getCurrentBundle();
    if (!bundle) {
      res.status(500).json({
        success: false,
        error: 'Bundle not available after build',
      });
      return;
    }

    // Record sync
    await policySyncService.recordSpokeSync(spoke.spokeId, buildResult.version);

    res.json({
      success: true,
      bundleId: buildResult.bundleId,
      version: buildResult.version,
      hash: buildResult.hash,
      scope: normalizedScope,
      size: buildResult.size,
      fileCount: buildResult.fileCount,
      signed: !!buildResult.signature,
      signature: buildResult.signature,
      manifest: {
        revision: bundle.manifest.revision,
        roots: bundle.manifest.roots,
        files: bundle.manifest.files.map((f) => ({
          path: f.path,
          hash: f.hash.substring(0, 16) + '...',
          size: f.size,
        })),
      },
      // Include base64-encoded bundle content for spoke to apply
      bundleContent: bundle.contents.toString('base64'),
    });
  } catch (error) {
    logger.error('Failed to serve scoped bundle', {
      error: error instanceof Error ? error.message : 'Unknown error',
      scope: req.params.scope,
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve bundle',
    });
  }
});

/**
 * GET /api/opal/bundle/verify/:hash
 * Verify bundle signature (public endpoint)
 */
router.get('/bundle/verify/:hash', async (req: Request, res: Response): Promise<void> => {
  try {
    const { hash } = req.params;
    const bundle = policyBundleService.getCurrentBundle();

    if (!bundle) {
      res.status(404).json({
        verified: false,
        error: 'No bundle available',
      });
      return;
    }

    // Check if hash matches
    if (bundle.hash !== hash && !bundle.hash.startsWith(hash)) {
      res.status(404).json({
        verified: false,
        error: 'Bundle hash not found',
        expectedHash: bundle.hash.substring(0, 16) + '...',
      });
      return;
    }

    // Verify signature
    const publicKeyPath =
      process.env.BUNDLE_SIGNING_PUBLIC_KEY_PATH ||
      path.join(process.cwd(), 'certs', 'bundle-signing', 'bundle-signing.pub');

    let signatureValid = false;
    let signatureError: string | undefined;

    if (bundle.signature && fs.existsSync(publicKeyPath)) {
      const verifyResult = await policyBundleService.verifyBundleSignature(bundle, publicKeyPath);
      signatureValid = verifyResult.valid;
      signatureError = verifyResult.error;
    } else if (!bundle.signature) {
      signatureError = 'Bundle not signed';
    } else {
      signatureError = 'Public key not found for verification';
    }

    res.json({
      verified: signatureValid,
      hash: bundle.hash,
      bundleId: bundle.bundleId,
      version: bundle.version,
      signedAt: bundle.signedAt,
      signedBy: bundle.signedBy,
      signatureValid,
      signatureError,
      manifest: {
        revision: bundle.manifest.revision,
        roots: bundle.manifest.roots,
        fileCount: bundle.manifest.files.length,
      },
    });
  } catch (error) {
    logger.error('Failed to verify bundle', {
      error: error instanceof Error ? error.message : 'Unknown error',
      hash: req.params.hash,
    });

    res.status(500).json({
      verified: false,
      error: error instanceof Error ? error.message : 'Verification failed',
    });
  }
});

/**
 * POST /api/opal/force-sync
 * Force sync for a specific spoke or all spokes (admin only)
 */
router.post('/force-sync', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { spokeId } = req.body;

    logger.info('Forcing policy sync', { spokeId: spokeId || 'all' });

    if (spokeId) {
      // Force sync for specific spoke
      const result = await policySyncService.forceFullSync(spokeId);
      res.json({
        success: result.success,
        spokeId: result.spokeId,
        version: result.version,
        syncTime: result.syncTime,
        error: result.error,
      });
    } else {
      // Force sync for all spokes
      const spokes = await hubSpokeRegistry.listActiveSpokes();
      const results = await Promise.all(spokes.map((s) => policySyncService.forceFullSync(s.spokeId)));

      res.json({
        success: results.every((r) => r.success),
        spokes: results.map((r) => ({
          spokeId: r.spokeId,
          success: r.success,
          version: r.version,
          error: r.error,
        })),
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    logger.error('Force sync failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Force sync failed',
    });
  }
});

/**
 * GET /api/opal/sync-status
 * Get sync status for all spokes (admin only)
 */
router.get('/sync-status', requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const allStatus = await policySyncService.getAllSpokeStatus();
    const outOfSync = await policySyncService.getOutOfSyncSpokes();
    const currentVersion = policySyncService.getCurrentVersion();

    res.json({
      currentVersion,
      spokes: allStatus,
      summary: {
        total: allStatus.length,
        current: allStatus.filter((s) => s.status === 'current').length,
        behind: allStatus.filter((s) => s.status === 'behind').length,
        stale: allStatus.filter((s) => s.status === 'stale' || s.status === 'critical_stale').length,
        offline: allStatus.filter((s) => s.status === 'offline').length,
      },
      outOfSyncSpokes: outOfSync.map((s) => ({
        spokeId: s.spokeId,
        instanceCode: s.instanceCode,
        currentVersion: s.currentVersion,
        status: s.status,
        lastSyncTime: s.lastSyncTime,
      })),
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get sync status',
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

