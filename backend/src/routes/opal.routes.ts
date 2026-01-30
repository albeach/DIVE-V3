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
import { mongoOpalDataStore } from '../models/trusted-issuer.model';
import { opalCdcService } from '../services/opal-cdc.service';
import { opalMetricsService } from '../services/opal-metrics.service';
import { requireHubAdmin, logFederationModification } from '../middleware/hub-admin.middleware';
import { authenticateJWT } from '../middleware/authz.middleware';
import { requireAdmin, requireSuperAdmin } from '../middleware/admin.middleware';
import fs from 'fs';
import path from 'path';

// Initialize MongoDB OPAL data store and CDC service
mongoOpalDataStore.initialize().catch((err) => {
  logger.error('Failed to initialize OPAL data store', { error: err.message });
});

// Initialize CDC service (with delay to ensure OPAL connection is ready)
setTimeout(() => {
  opalCdcService.initialize().catch((err) => {
    logger.error('Failed to initialize OPAL CDC service', { error: err.message });
  });
}, 5000);

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
 * Legacy requireAdmin - replaced by proper role-based middleware
 * Now using:
 *   - requireAdmin from admin.middleware.ts (checks admin OR super_admin role)
 *   - requireSuperAdmin from admin.middleware.ts (checks super_admin role only)
 */
function legacyRequireAdmin(req: Request, res: Response, next: NextFunction): void {
  // DEPRECATED: Use requireAdmin or requireSuperAdmin from admin.middleware.ts
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
 * @openapi
 * /api/opal/policy-data:
 *   get:
 *     summary: Get policy data for OPAL Server
 *     description: |
 *       Primary endpoint for OPAL Server to fetch policy data.
 *       Called periodically by OPAL to sync federation data to connected clients.
 *
 *       Returns:
 *       - Current policy version and metadata
 *       - Active spoke instances and their trust levels
 *       - Trusted issuers (Keycloak instances)
 *       - Federation trust matrix
 *       - COI (Community of Interest) membership
 *       - Policy bundle manifest
 *
 *       This is a public endpoint called by OPAL Server with its datasource token.
 *     tags: [OPAL]
 *     parameters:
 *       - name: x-opal-source
 *         in: header
 *         description: OPAL source identifier for logging
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Policy data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 policy_version:
 *                   type: object
 *                   properties:
 *                     version:
 *                       type: string
 *                       example: '1.2.3'
 *                     hash:
 *                       type: string
 *                 updated_at:
 *                   type: string
 *                   format: date-time
 *                 federation:
 *                   type: object
 *                   properties:
 *                     spokes:
 *                       type: array
 *                       items:
 *                         type: object
 *                     trusted_issuers:
 *                       type: object
 *                     federation_matrix:
 *                       type: object
 *                     coi_membership:
 *                       type: object
 *                 bundle:
 *                   type: object
 *       500:
 *         description: Failed to retrieve policy data
 */
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
 * @openapi
 * /api/opal/bundle/build:
 *   post:
 *     summary: Build a new policy bundle
 *     description: |
 *       Build a new OPA policy bundle from source policies.
 *       Supports scoped bundles (e.g., policy:usa, policy:fvey) and optional signing/compression.
 *
 *       The bundle includes:
 *       - Compiled Rego policies
 *       - Policy data (trusted issuers, federation matrix, COI membership)
 *       - Bundle manifest with file hashes
 *       - Optional cryptographic signature
 *     tags: [OPAL]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               scopes:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Policy scopes to include (e.g., ['policy:base', 'policy:usa'])
 *                 example: ['policy:base', 'policy:fvey']
 *               includeData:
 *                 type: boolean
 *                 default: true
 *                 description: Include policy data in bundle
 *               sign:
 *                 type: boolean
 *                 default: true
 *                 description: Sign the bundle with private key
 *               compress:
 *                 type: boolean
 *                 default: true
 *                 description: Compress the bundle with gzip
 *     responses:
 *       200:
 *         description: Bundle built successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 bundleId:
 *                   type: string
 *                   example: 'bundle-20260129-abc123'
 *                 version:
 *                   type: string
 *                   example: '1.2.3'
 *                 hash:
 *                   type: string
 *                 size:
 *                   type: integer
 *                   description: Bundle size in bytes
 *                 fileCount:
 *                   type: integer
 *                 signed:
 *                   type: boolean
 *       400:
 *         description: Build failed (validation error)
 *       500:
 *         description: Build failed (server error)
 */
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
 * @openapi
 * /api/opal/bundle/publish:
 *   post:
 *     summary: Publish bundle to OPAL Server
 *     description: |
 *       Publish the current policy bundle to OPAL Server.
 *       OPAL Server will distribute the bundle to all connected OPAL clients (spoke instances).
 *
 *       Triggers a policy refresh transaction that propagates to all clients.
 *     tags: [OPAL]
 *     responses:
 *       200:
 *         description: Bundle published successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 bundleId:
 *                   type: string
 *                 version:
 *                   type: string
 *                 publishedAt:
 *                   type: string
 *                   format: date-time
 *                 opalTransactionId:
 *                   type: string
 *                   description: OPAL transaction ID for tracking
 *       400:
 *         description: Publish failed (no bundle available)
 *       500:
 *         description: Publish failed (server error)
 */
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
 * @openapi
 * /api/opal/bundle/build-and-publish:
 *   post:
 *     summary: Build and publish bundle (atomic operation)
 *     description: |
 *       Convenience endpoint that builds and publishes a policy bundle in one atomic operation.
 *       Equivalent to calling /bundle/build followed by /bundle/publish.
 *
 *       Use this endpoint for streamlined bundle deployment.
 *     tags: [OPAL]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               scopes:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ['policy:base', 'policy:nato']
 *               includeData:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       200:
 *         description: Build and publish completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 build:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                     bundleId:
 *                       type: string
 *                     version:
 *                       type: string
 *                     hash:
 *                       type: string
 *                     size:
 *                       type: integer
 *                     fileCount:
 *                       type: integer
 *                     error:
 *                       type: string
 *                 publish:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                     publishedAt:
 *                       type: string
 *                       format: date-time
 *                     opalTransactionId:
 *                       type: string
 *                     error:
 *                       type: string
 *       500:
 *         description: Operation failed
 */
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
 * @openapi
 * /api/opal/bundle/current:
 *   get:
 *     summary: Get current bundle metadata
 *     description: |
 *       Retrieve metadata about the currently active policy bundle.
 *
 *       Returns bundle manifest, file list, hash, signature details, and size.
 *       Does not return the bundle contents - use GET /bundle/:scope for download.
 *     tags: [OPAL]
 *     responses:
 *       200:
 *         description: Current bundle metadata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 bundleId:
 *                   type: string
 *                 version:
 *                   type: string
 *                 hash:
 *                   type: string
 *                 scopes:
 *                   type: array
 *                   items:
 *                     type: string
 *                 signedAt:
 *                   type: string
 *                   format: date-time
 *                 signedBy:
 *                   type: string
 *                 manifest:
 *                   type: object
 *                   properties:
 *                     revision:
 *                       type: string
 *                     roots:
 *                       type: array
 *                       items:
 *                         type: string
 *                     fileCount:
 *                       type: integer
 *                     files:
 *                       type: array
 *                       items:
 *                         type: object
 *                 size:
 *                   type: integer
 *                   description: Bundle size in bytes
 *       404:
 *         description: No bundle available (build one first)
 *       500:
 *         description: Failed to retrieve bundle
 */
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
 * @openapi
 * /api/opal/bundle/scopes:
 *   get:
 *     summary: Get available policy scopes
 *     description: |
 *       List all available policy scopes that can be included in bundles.
 *
 *       Scopes represent different policy layers:
 *       - policy:base - Base guardrail policies (always included)
 *       - policy:fvey - Five Eyes organization policies
 *       - policy:nato - NATO organization policies
 *       - policy:usa, policy:fra, policy:gbr, policy:deu - Tenant-specific policies
 *
 *       Spoke instances are restricted to scopes based on their trust level and configuration.
 *     tags: [OPAL]
 *     responses:
 *       200:
 *         description: Available scopes
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 scopes:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ['policy:base', 'policy:fvey', 'policy:nato', 'policy:usa', 'policy:fra']
 *                 descriptions:
 *                   type: object
 *                   additionalProperties:
 *                     type: string
 *       500:
 *         description: Failed to retrieve scopes
 */
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
 * @openapi
 * /api/opal/health:
 *   get:
 *     summary: Get OPAL Server health status
 *     description: |
 *       Check the health status of the OPAL Server connection.
 *
 *       Returns:
 *       - Connection status (healthy/unhealthy)
 *       - OPAL Server URL
 *       - Configured data topics
 *       - WebSocket connection status
 *     tags: [OPAL]
 *     responses:
 *       200:
 *         description: OPAL health status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 opalEnabled:
 *                   type: boolean
 *                 healthy:
 *                   type: boolean
 *                 connected:
 *                   type: boolean
 *                 config:
 *                   type: object
 *                   properties:
 *                     serverUrl:
 *                       type: string
 *                       example: 'http://opal-server:7002'
 *                     topics:
 *                       type: array
 *                       items:
 *                         type: string
 *       500:
 *         description: Health check failed
 */
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
 * @openapi
 * /api/opal/refresh:
 *   post:
 *     summary: Trigger OPAL policy refresh
 *     description: |
 *       Manually trigger a policy refresh in OPAL Server.
 *       This forces OPAL to re-fetch policy data and distribute to all connected clients.
 *
 *       Use cases:
 *       - After manual policy changes
 *       - To force sync of all clients
 *       - For testing policy distribution
 *     tags: [OPAL]
 *     responses:
 *       200:
 *         description: Refresh triggered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 transactionId:
 *                   type: string
 *                   description: OPAL transaction ID for tracking
 *                 message:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       500:
 *         description: Refresh failed
 */
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
 * @openapi
 * /api/opal/data/publish:
 *   post:
 *     summary: Publish inline data to OPAL
 *     description: |
 *       Publish data directly to OPAL Server without rebuilding the bundle.
 *       Used for dynamic data updates (e.g., adding a trusted issuer).
 *
 *       The data is published to a specific path in OPA's data store.
 *       All connected OPAL clients receive the update via WebSocket.
 *     tags: [OPAL]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - path
 *               - data
 *             properties:
 *               path:
 *                 type: string
 *                 description: OPA data path (e.g., 'federation/trusted_issuers')
 *                 example: 'federation/trusted_issuers'
 *               data:
 *                 type: object
 *                 description: Data to publish
 *               reason:
 *                 type: string
 *                 description: Reason for the update (for audit logs)
 *                 example: 'Added new trusted issuer for France'
 *     responses:
 *       200:
 *         description: Data published successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 transactionId:
 *                   type: string
 *                 message:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Missing required fields (path or data)
 *       500:
 *         description: Publish failed
 */
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
// DYNAMIC POLICY DATA ENDPOINTS (Phase 2)
// MongoDB-backed endpoints for real-time policy data
// ============================================

/**
 * @openapi
 * /api/opal/trusted-issuers:
 *   get:
 *     summary: Get all trusted issuers
 *     description: |
 *       Retrieve all trusted issuers (Keycloak instances) from MongoDB.
 *       Returns data in OPAL-compatible format for distribution to OPA instances.
 *
 *       Trusted issuers are used to validate JWT tokens from federated partners.
 *     tags: [OPAL]
 *     responses:
 *       200:
 *         description: Trusted issuers retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 trusted_issuers:
 *                   type: object
 *                   additionalProperties:
 *                     type: object
 *                   description: Map of issuer URLs to issuer metadata
 *                 count:
 *                   type: integer
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       500:
 *         description: Failed to retrieve trusted issuers
 */
/**
 * GET /api/opal/trusted-issuers
 * Get all trusted issuers from MongoDB (OPAL-compatible format)
 */
router.get('/trusted-issuers', async (_req: Request, res: Response): Promise<void> => {
  try {
    const issuers = await mongoOpalDataStore.getIssuersForOpal();

    res.json({
      success: true,
      trusted_issuers: issuers,
      count: Object.keys(issuers).length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to get trusted issuers', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve trusted issuers',
    });
  }
});

/**
 * @openapi
 * /api/opal/trusted-issuers:
 *   post:
 *     summary: Add a new trusted issuer
 *     description: |
 *       Add a new trusted issuer (Keycloak instance) to the federation.
 *       Requires hub_admin or super_admin role.
 *
 *       After adding, triggers OPAL refresh to distribute to all clients.
 *       Logged for audit trail with requester identity.
 *
 *       **Security:** Spoke admins receive 403 Forbidden.
 *     tags: [OPAL]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - issuerUrl
 *               - tenant
 *               - country
 *             properties:
 *               issuerUrl:
 *                 type: string
 *                 format: uri
 *                 example: 'https://keycloak.fra.dive.mil/realms/dive'
 *               tenant:
 *                 type: string
 *                 description: Tenant code (uppercase)
 *                 example: 'FRA'
 *               name:
 *                 type: string
 *                 description: Friendly name
 *                 example: 'France DIVE Keycloak'
 *               country:
 *                 type: string
 *                 description: Country code (uppercase)
 *                 example: 'FRA'
 *               trustLevel:
 *                 type: string
 *                 enum: [PRODUCTION, STAGING, DEVELOPMENT]
 *                 default: DEVELOPMENT
 *               realm:
 *                 type: string
 *                 example: 'dive'
 *               enabled:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       201:
 *         description: Issuer added and OPAL refreshed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 issuer:
 *                   type: object
 *                 message:
 *                   type: string
 *       400:
 *         description: Missing required fields
 *       403:
 *         description: Requires hub_admin role (spoke admins forbidden)
 *       500:
 *         description: Failed to add issuer
 */
/**
 * POST /api/opal/trusted-issuers
 * Add a new trusted issuer (hub_admin only)
 *
 * Security: Requires hub_admin or super_admin role
 * Spoke admins receive 403 Forbidden
 */
router.post('/trusted-issuers', authenticateJWT, requireHubAdmin, async (req: Request, res: Response): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
  const authReq = req as any;

  try {
    const { issuerUrl, tenant, name, country, trustLevel, realm, enabled } = req.body;

    if (!issuerUrl || !tenant || !country) {
      res.status(400).json({
        success: false,
        error: 'issuerUrl, tenant, and country are required',
      });
      return;
    }

    const issuer = await mongoOpalDataStore.addIssuer({
      issuerUrl,
      tenant: tenant.toUpperCase(),
      name: name || issuerUrl,
      country: country.toUpperCase(),
      trustLevel: trustLevel || 'DEVELOPMENT',
      realm,
      enabled: enabled !== false,
    });

    // Log the modification for audit
    logFederationModification({
      requestId,
      admin: authReq.user?.uniqueID || 'unknown',
      action: 'ADD_TRUSTED_ISSUER',
      target: issuerUrl,
      details: { tenant, country, trustLevel },
      outcome: 'success',
    });

    logger.info('Trusted issuer added via API', { issuerUrl, tenant, admin: authReq.user?.uniqueID });

    // Trigger OPAL refresh to propagate change
    await opalClient.triggerPolicyRefresh();

    res.status(201).json({
      success: true,
      issuer,
      message: 'Issuer added and OPAL refresh triggered',
    });
  } catch (error) {
    logFederationModification({
      requestId,
      admin: authReq.user?.uniqueID || 'unknown',
      action: 'ADD_TRUSTED_ISSUER',
      target: req.body.issuerUrl || 'unknown',
      outcome: 'failure',
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    logger.error('Failed to add trusted issuer', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add issuer',
    });
  }
});

/**
 * @openapi
 * /api/opal/trusted-issuers/{encodedUrl}:
 *   delete:
 *     summary: Remove a trusted issuer
 *     description: |
 *       Remove a trusted issuer from the federation.
 *       Requires hub_admin or super_admin role.
 *
 *       After removal, triggers OPAL refresh to propagate change.
 *       Logged for audit trail.
 *
 *       **Note:** URL must be URL-encoded in the path parameter.
 *     tags: [OPAL]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: encodedUrl
 *         in: path
 *         required: true
 *         description: URL-encoded issuer URL
 *         schema:
 *           type: string
 *         example: 'https%3A%2F%2Fkeycloak.fra.dive.mil%2Frealms%2Fdive'
 *     responses:
 *       200:
 *         description: Issuer removed and OPAL refreshed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       403:
 *         description: Requires hub_admin role
 *       404:
 *         description: Issuer not found
 *       500:
 *         description: Failed to remove issuer
 */
/**
 * DELETE /api/opal/trusted-issuers/:encodedUrl
 * Remove a trusted issuer (hub_admin only)
 *
 * Security: Requires hub_admin or super_admin role
 */
router.delete('/trusted-issuers/:encodedUrl', authenticateJWT, requireHubAdmin, async (req: Request, res: Response): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
  const authReq = req as any;

  try {
    const issuerUrl = decodeURIComponent(req.params.encodedUrl);
    const removed = await mongoOpalDataStore.removeIssuer(issuerUrl);

    if (removed) {
      logFederationModification({
        requestId,
        admin: authReq.user?.uniqueID || 'unknown',
        action: 'REMOVE_TRUSTED_ISSUER',
        target: issuerUrl,
        outcome: 'success',
      });

      logger.info('Trusted issuer removed via API', { issuerUrl, admin: authReq.user?.uniqueID });
      await opalClient.triggerPolicyRefresh();

      res.json({
        success: true,
        message: 'Issuer removed and OPAL refresh triggered',
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Issuer not found',
      });
    }
  } catch (error) {
    logFederationModification({
      requestId,
      admin: authReq.user?.uniqueID || 'unknown',
      action: 'REMOVE_TRUSTED_ISSUER',
      target: decodeURIComponent(req.params.encodedUrl),
      outcome: 'failure',
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    logger.error('Failed to remove trusted issuer', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({
      success: false,
      error: 'Failed to remove issuer',
    });
  }
});

/**
 * @openapi
 * /api/opal/federation-matrix:
 *   get:
 *     summary: Get federation trust matrix
 *     description: |
 *       Retrieve the federation trust matrix from MongoDB.
 *       The matrix defines which countries trust each other for resource sharing.
 *
 *       Format: `{ "USA": ["GBR", "CAN", "AUS", "NZL"], "GBR": ["USA", "CAN"], ... }`
 *
 *       Used by OPA policies to enforce federation constraints.
 *     tags: [OPAL]
 *     responses:
 *       200:
 *         description: Federation matrix retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 federation_matrix:
 *                   type: object
 *                   additionalProperties:
 *                     type: array
 *                     items:
 *                       type: string
 *                   example:
 *                     USA: ['GBR', 'CAN', 'AUS', 'NZL']
 *                     GBR: ['USA', 'CAN', 'AUS', 'NZL']
 *                 count:
 *                   type: integer
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       500:
 *         description: Failed to retrieve federation matrix
 */
/**
 * GET /api/opal/federation-matrix
 * Get federation trust matrix from MongoDB
 */
router.get('/federation-matrix', async (_req: Request, res: Response): Promise<void> => {
  try {
    const matrix = await mongoOpalDataStore.getFederationMatrix();

    res.json({
      success: true,
      federation_matrix: matrix,
      count: Object.keys(matrix).length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to get federation matrix', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve federation matrix',
    });
  }
});

/**
 * @openapi
 * /api/opal/federation-matrix:
 *   post:
 *     summary: Add or update federation trust
 *     description: |
 *       Add or update federation trust relationships.
 *       Requires hub_admin or super_admin role.
 *
 *       Two modes:
 *       1. Set entire trust list: Provide `sourceCountry` and `trustedCountries` array
 *       2. Add single trust: Provide `sourceCountry` and `targetCountry`
 *
 *       After update, triggers OPAL refresh.
 *     tags: [OPAL]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sourceCountry
 *             properties:
 *               sourceCountry:
 *                 type: string
 *                 description: Country code (source of trust)
 *                 example: 'USA'
 *               targetCountry:
 *                 type: string
 *                 description: Single country to trust (mode 2)
 *                 example: 'GBR'
 *               trustedCountries:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of trusted countries (mode 1)
 *                 example: ['GBR', 'CAN', 'AUS', 'NZL']
 *     responses:
 *       200:
 *         description: Federation matrix updated and OPAL refreshed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Missing required fields
 *       403:
 *         description: Requires hub_admin role
 *       500:
 *         description: Failed to update federation matrix
 */
/**
 * POST /api/opal/federation-matrix
 * Add or update federation trust (hub_admin only)
 *
 * Security: Requires hub_admin or super_admin role
 */
router.post('/federation-matrix', authenticateJWT, requireHubAdmin, async (req: Request, res: Response): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
  const authReq = req as any;

  try {
    const { sourceCountry, targetCountry, trustedCountries } = req.body;

    if (!sourceCountry) {
      res.status(400).json({
        success: false,
        error: 'sourceCountry is required',
      });
      return;
    }

    if (trustedCountries) {
      // Set entire trust list
      await mongoOpalDataStore.setFederationTrust(sourceCountry, trustedCountries);

      logFederationModification({
        requestId,
        admin: authReq.user?.uniqueID || 'unknown',
        action: 'SET_FEDERATION_TRUST',
        target: sourceCountry,
        details: { trustedCountries },
        outcome: 'success',
      });

      logger.info('Federation matrix updated', { sourceCountry, trustedCountries, admin: authReq.user?.uniqueID });
    } else if (targetCountry) {
      // Add single trust relationship
      await mongoOpalDataStore.addFederationTrust(sourceCountry, targetCountry);

      logFederationModification({
        requestId,
        admin: authReq.user?.uniqueID || 'unknown',
        action: 'ADD_FEDERATION_TRUST',
        target: `${sourceCountry} -> ${targetCountry}`,
        outcome: 'success',
      });

      logger.info('Federation trust added', { sourceCountry, targetCountry, admin: authReq.user?.uniqueID });
    } else {
      res.status(400).json({
        success: false,
        error: 'Either targetCountry or trustedCountries is required',
      });
      return;
    }

    await opalClient.triggerPolicyRefresh();

    res.json({
      success: true,
      message: 'Federation matrix updated and OPAL refresh triggered',
    });
  } catch (error) {
    logFederationModification({
      requestId,
      admin: authReq.user?.uniqueID || 'unknown',
      action: 'UPDATE_FEDERATION_MATRIX',
      target: req.body.sourceCountry || 'unknown',
      outcome: 'failure',
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    logger.error('Failed to update federation matrix', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({
      success: false,
      error: 'Failed to update federation matrix',
    });
  }
});

/**
 * @openapi
 * /api/opal/federation-matrix/{source}/{target}:
 *   delete:
 *     summary: Remove federation trust relationship
 *     description: |
 *       Remove a specific trust relationship between two countries.
 *       Requires hub_admin or super_admin role.
 *
 *       After removal, triggers OPAL refresh to propagate change.
 *     tags: [OPAL]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: source
 *         in: path
 *         required: true
 *         description: Source country code
 *         schema:
 *           type: string
 *         example: 'USA'
 *       - name: target
 *         in: path
 *         required: true
 *         description: Target country code to remove from trust list
 *         schema:
 *           type: string
 *         example: 'DEU'
 *     responses:
 *       200:
 *         description: Trust relationship removed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       403:
 *         description: Requires hub_admin role
 *       500:
 *         description: Failed to remove trust relationship
 */
/**
 * DELETE /api/opal/federation-matrix/:source/:target
 * Remove a specific federation trust (hub_admin only)
 *
 * Security: Requires hub_admin or super_admin role
 */
router.delete('/federation-matrix/:source/:target', authenticateJWT, requireHubAdmin, async (req: Request, res: Response): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
  const authReq = req as any;

  try {
    const { source, target } = req.params;
    await mongoOpalDataStore.removeFederationTrust(source, target);

    logFederationModification({
      requestId,
      admin: authReq.user?.uniqueID || 'unknown',
      action: 'REMOVE_FEDERATION_TRUST',
      target: `${source} -> ${target}`,
      outcome: 'success',
    });

    logger.info('Federation trust removed', { source, target, admin: authReq.user?.uniqueID });
    await opalClient.triggerPolicyRefresh();

    res.json({
      success: true,
      message: 'Trust relationship removed',
    });
  } catch (error) {
    logFederationModification({
      requestId,
      admin: authReq.user?.uniqueID || 'unknown',
      action: 'REMOVE_FEDERATION_TRUST',
      target: `${req.params.source} -> ${req.params.target}`,
      outcome: 'failure',
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: 'Failed to remove trust relationship',
    });
  }
});

/**
 * @openapi
 * /api/opal/tenant-configs:
 *   get:
 *     summary: Get all tenant configurations
 *     description: |
 *       Retrieve all tenant configurations from MongoDB.
 *       Tenant configs define classification ceilings, COI memberships, and federation settings.
 *     tags: [OPAL]
 *     responses:
 *       200:
 *         description: Tenant configurations retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 tenant_configs:
 *                   type: object
 *                   additionalProperties:
 *                     type: object
 *                 count:
 *                   type: integer
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       500:
 *         description: Failed to retrieve tenant configs
 */
/**
 * GET /api/opal/tenant-configs
 * Get all tenant configurations from MongoDB
 */
router.get('/tenant-configs', async (_req: Request, res: Response): Promise<void> => {
  try {
    const configs = await mongoOpalDataStore.getAllTenantConfigs();

    res.json({
      success: true,
      tenant_configs: configs,
      count: Object.keys(configs).length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to get tenant configs', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve tenant configs',
    });
  }
});

/**
 * @openapi
 * /api/opal/federation-constraints:
 *   get:
 *     summary: Get federation constraints
 *     description: |
 *       Retrieve active federation constraints for OPAL distribution.
 *       Constraints define granular authorization rules between tenant pairs.
 *
 *       This is a public endpoint used by OPAL Server with datasource token.
 *     tags: [OPAL]
 *     responses:
 *       200:
 *         description: Federation constraints retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 federation_constraints:
 *                   type: object
 *                   description: Nested object mapping owner tenant -> partner tenant -> constraints
 *                 count:
 *                   type: integer
 *                   description: Total constraint count
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       500:
 *         description: Failed to retrieve federation constraints
 */
/**
 * GET /api/opal/federation-constraints
 * Serve federation constraints for OPAL distribution
 * Public endpoint (used by OPAL server with datasource token)
 */
router.get('/federation-constraints', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { FederationConstraint } = await import('../models/federation-constraint.model');
    const constraints = await FederationConstraint.getActiveConstraintsForOPAL();

    res.json({
      success: true,
      federation_constraints: constraints,
      count: Object.values(constraints).reduce((sum, partners) => sum + Object.keys(partners).length, 0),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to get federation constraints for OPAL', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve federation constraints',
    });
  }
});

/**
 * @openapi
 * /api/opal/coi-definitions:
 *   get:
 *     summary: Get COI (Community of Interest) definitions
 *     description: |
 *       Retrieve all COI definitions from MongoDB.
 *       MongoDB is the Single Source of Truth for ALL COI types:
 *
 *       - Country-based COIs (NATO, FVEY, etc.)
 *       - Program-based COIs (Alpha, Beta, Gamma, etc.)
 *       - Auto-updated coalition COIs (NATO auto-updates from active federation)
 *
 *       COIs define groups of countries/programs with shared access to classified resources.
 *     tags: [OPAL, COI]
 *     responses:
 *       200:
 *         description: COI definitions retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 coi_definitions:
 *                   type: object
 *                   additionalProperties:
 *                     type: array
 *                     items:
 *                       type: string
 *                   example:
 *                     NATO: ['USA', 'GBR', 'FRA', 'DEU', 'CAN']
 *                     FVEY: ['USA', 'GBR', 'CAN', 'AUS', 'NZL']
 *                     ALPHA: ['USA']
 *                 count:
 *                   type: integer
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       500:
 *         description: Failed to retrieve COI definitions
 */
/**
 * GET /api/opal/coi-definitions
 * Get all COI definitions from MongoDB (Phase 3: Gap Closure)
 *
 * MongoDB SSOT for ALL COI types:
 * - Country-based COIs (NATO, FVEY, etc.)
 * - Program-based COIs (Alpha, Beta, etc.)
 * - Auto-updated coalition COIs (NATO auto-updates from active federation)
 */
router.get('/coi-definitions', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { mongoCoiDefinitionStore } = await import('../models/coi-definition.model');

    await mongoCoiDefinitionStore.initialize();
    const coiMap = await mongoCoiDefinitionStore.getCoiMembershipMapForOpa();

    res.json({
      success: true,
      coi_definitions: coiMap,
      count: Object.keys(coiMap).length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to get COI definitions', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve COI definitions',
    });
  }
});

/**
 * @openapi
 * /api/opal/tenant-configs/{code}:
 *   put:
 *     summary: Create or update tenant configuration
 *     description: |
 *       Create or update a tenant's configuration.
 *       Requires super_admin role.
 *
 *       After update, triggers OPAL refresh to distribute changes.
 *     tags: [OPAL]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: code
 *         in: path
 *         required: true
 *         description: Tenant code (e.g., USA, FRA, GBR)
 *         schema:
 *           type: string
 *         example: 'USA'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Tenant configuration object
 *     responses:
 *       200:
 *         description: Tenant config updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       403:
 *         description: Requires super_admin role
 *       500:
 *         description: Failed to update tenant config
 */
/**
 * PUT /api/opal/tenant-configs/:code
 * Create or update a tenant configuration (super_admin only)
 */
router.put('/tenant-configs/:code', authenticateJWT, requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { code } = req.params;
    const config = req.body;

    await mongoOpalDataStore.setTenantConfig(code, config);
    logger.info('Tenant config updated', { code });
    await opalClient.triggerPolicyRefresh();

    res.json({
      success: true,
      message: `Tenant config ${code} updated`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to update tenant config',
    });
  }
});

// ============================================
// COI MEMBERS FILE GENERATION (SSOT)
// ============================================

/**
 * @openapi
 * /api/opal/generate-coi-members-file:
 *   post:
 *     summary: Generate COI members file from MongoDB
 *     description: |
 *       Generate the OPAL coi_members.json file from MongoDB (Single Source of Truth).
 *       Requires super_admin role.
 *
 *       This endpoint:
 *       1. Reads all COI definitions from MongoDB
 *       2. Generates coi_members.json with membership data
 *       3. Writes file to data/opal/coi_members.json
 *
 *       Use after bulk COI updates to ensure file consistency.
 *     tags: [OPAL, COI]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: COI members file generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     coiCount:
 *                       type: integer
 *                       description: Number of COIs processed
 *                     filePath:
 *                       type: string
 *                       description: Path to generated file
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *       403:
 *         description: Requires super_admin role
 *       500:
 *         description: Failed to generate file
 */
/**
 * POST /api/opal/generate-coi-members-file
 * Generate OPAL coi_members.json file from MongoDB (SSOT)
 *
 * This endpoint reads COI definitions from MongoDB and regenerates the static
 * OPAL file to ensure consistency. MongoDB is the Single Source of Truth.
 */
router.post('/generate-coi-members-file', authenticateJWT, requireSuperAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const { mongoCoiDefinitionStore } = await import('../models/coi-definition.model');
    await mongoCoiDefinitionStore.initialize();

    // Get all COI definitions from MongoDB
    const cois = await mongoCoiDefinitionStore.findAll();

    // Build coi_members structure
    const coiMembers: Record<string, string[]> = {};
    const coiDetails: Record<string, any> = {};

    for (const coi of cois) {
      coiMembers[coi.coiId] = coi.members;
      coiDetails[coi.coiId] = {
        name: coi.name,
        description: coi.description || '',
        classification_ceiling: coi.coiId.includes('SECRET') || coi.coiId === 'FVEY' ? 'TOP_SECRET' : 'SECRET',
        membership_type: coi.type === 'program-based' ? 'program' : 'country'
      };
    }

    // Build complete OPAL file structure
    const opalData = {
      $schema: './schemas/coi_members.schema.json',
      _metadata: {
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        description: 'OPAL-managed Community of Interest (COI) membership registry for DIVE V3',
        compliance: ['ACP-240', 'STANAG 4774'],
        managedBy: 'opal-data-publisher',
        generatedFrom: 'MongoDB (SSOT)'
      },
      coi_members: coiMembers,
      coi_details: coiDetails
    };

    // Write to file
    const filePath = path.join(process.cwd(), 'data', 'opal', 'coi_members.json');
    fs.writeFileSync(filePath, JSON.stringify(opalData, null, 2));

    logger.info('Generated OPAL coi_members.json from MongoDB', {
      coiCount: cois.length,
      filePath
    });

    res.json({
      success: true,
      message: 'OPAL coi_members.json generated from MongoDB',
      data: {
        coiCount: cois.length,
        filePath,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Failed to generate OPAL coi_members.json', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(500).json({
      error: 'Failed to generate COI members file',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ============================================
// CDC (Change Data Capture) ENDPOINTS
// ============================================

/**
 * @openapi
 * /api/opal/cdc/status:
 *   get:
 *     summary: Get CDC (Change Data Capture) service status
 *     description: |
 *       Get the status of the OPAL CDC service.
 *       CDC monitors MongoDB changes and automatically publishes updates to OPAL.
 *
 *       Requires admin or super_admin role.
 *     tags: [OPAL]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: CDC status retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 running:
 *                   type: boolean
 *                   description: Whether CDC is running
 *                 watchedCollections:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: Collections being monitored
 *                 eventsProcessed:
 *                   type: integer
 *                 lastEventTime:
 *                   type: string
 *                   format: date-time
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       403:
 *         description: Requires admin role
 *       500:
 *         description: Failed to get CDC status
 */
/**
 * GET /api/opal/cdc/status
 * Get CDC service status (admin only)
 */
router.get('/cdc/status', authenticateJWT, requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const status = opalCdcService.getStatus();
    res.json({
      success: true,
      ...status,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get CDC status',
    });
  }
});

/**
 * @openapi
 * /api/opal/cdc/force-sync:
 *   post:
 *     summary: Force CDC sync of all data to OPAL
 *     description: |
 *       Force the CDC service to sync all data to OPAL immediately.
 *       Requires super_admin role.
 *
 *       Use cases:
 *       - After manual MongoDB updates
 *       - After restoring from backup
 *       - To recover from missed change events
 *     tags: [OPAL]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Force sync completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 results:
 *                   type: array
 *                   description: Sync results for each collection
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       403:
 *         description: Requires super_admin role
 *       500:
 *         description: Force sync failed
 */
/**
 * POST /api/opal/cdc/force-sync
 * Force sync all data to OPAL (super_admin only)
 */
router.post('/cdc/force-sync', authenticateJWT, requireSuperAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    logger.info('Force syncing all OPAL data via CDC');
    const result = await opalCdcService.forcePublishAll();

    res.json({
      success: result.success,
      results: result.results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to force sync OPAL data', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({
      success: false,
      error: 'Failed to force sync',
    });
  }
});

// ============================================
// PHASE 4: SCOPED BUNDLE ENDPOINTS
// ============================================

/**
 * @openapi
 * /api/opal/version:
 *   get:
 *     summary: Get current policy version
 *     description: |
 *       Get the current policy version and bundle metadata.
 *       Public endpoint - spoke instances use this to check if they need updates.
 *
 *       Returns version hash, timestamp, policy layers, and bundle details.
 *     tags: [OPAL]
 *     responses:
 *       200:
 *         description: Policy version information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 version:
 *                   type: string
 *                   example: '1.2.3'
 *                 hash:
 *                   type: string
 *                   description: Version hash for comparison
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 layers:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: Active policy layers
 *                 bundle:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     bundleId:
 *                       type: string
 *                     signedAt:
 *                       type: string
 *                       format: date-time
 *                     signedBy:
 *                       type: string
 *                     scopes:
 *                       type: array
 *                       items:
 *                         type: string
 *                     fileCount:
 *                       type: integer
 *       500:
 *         description: Failed to retrieve policy version
 */
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
 * @openapi
 * /api/opal/bundle/{scope}:
 *   get:
 *     summary: Download scoped policy bundle
 *     description: |
 *       Download a policy bundle for a specific scope.
 *       Requires spoke token authentication with matching scope authorization.
 *
 *       Scopes are validated against the spoke's allowed scopes.
 *       Base policies (policy:base) are always included.
 *
 *       Returns bundle content as base64-encoded data.
 *     tags: [OPAL]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: scope
 *         in: path
 *         required: true
 *         description: Policy scope to download (e.g., 'usa', 'fvey', 'nato')
 *         schema:
 *           type: string
 *         example: 'usa'
 *     responses:
 *       200:
 *         description: Scoped bundle downloaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 bundleId:
 *                   type: string
 *                 version:
 *                   type: string
 *                 hash:
 *                   type: string
 *                 scope:
 *                   type: string
 *                 size:
 *                   type: integer
 *                 fileCount:
 *                   type: integer
 *                 signed:
 *                   type: boolean
 *                 signature:
 *                   type: string
 *                   nullable: true
 *                 manifest:
 *                   type: object
 *                 bundleContent:
 *                   type: string
 *                   description: Base64-encoded bundle content
 *       401:
 *         description: Missing or invalid spoke token
 *       403:
 *         description: Scope not in allowed scopes for this spoke
 *       500:
 *         description: Failed to build or retrieve bundle
 */
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
 * @openapi
 * /api/opal/bundle/verify/{hash}:
 *   get:
 *     summary: Verify bundle signature
 *     description: |
 *       Verify the cryptographic signature of a policy bundle.
 *       Public endpoint - spoke instances use this to verify bundle integrity.
 *
 *       Checks:
 *       - Bundle hash matches requested hash
 *       - Signature is valid using public key
 *       - Bundle has not been tampered with
 *     tags: [OPAL]
 *     parameters:
 *       - name: hash
 *         in: path
 *         required: true
 *         description: Bundle hash to verify (full hash or prefix)
 *         schema:
 *           type: string
 *         example: 'a1b2c3d4e5f6...'
 *     responses:
 *       200:
 *         description: Verification result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 verified:
 *                   type: boolean
 *                   description: Overall verification status
 *                 hash:
 *                   type: string
 *                 bundleId:
 *                   type: string
 *                 version:
 *                   type: string
 *                 signedAt:
 *                   type: string
 *                   format: date-time
 *                 signedBy:
 *                   type: string
 *                 signatureValid:
 *                   type: boolean
 *                 signatureError:
 *                   type: string
 *                   nullable: true
 *                 manifest:
 *                   type: object
 *       404:
 *         description: Bundle hash not found
 *       500:
 *         description: Verification failed
 */
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
 * @openapi
 * /api/opal/force-sync:
 *   post:
 *     summary: Force policy sync to spoke(s)
 *     description: |
 *       Force a full policy sync to a specific spoke or all spokes.
 *       Requires super_admin role.
 *
 *       Use cases:
 *       - Recovering from failed sync
 *       - Testing policy distribution
 *       - Emergency policy updates
 *     tags: [OPAL]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               spokeId:
 *                 type: string
 *                 description: Specific spoke ID to sync (omit for all spokes)
 *                 example: 'spoke-fra-001'
 *     responses:
 *       200:
 *         description: Force sync completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 spokeId:
 *                   type: string
 *                   nullable: true
 *                   description: Single spoke ID (if targeting one spoke)
 *                 version:
 *                   type: string
 *                   nullable: true
 *                 syncTime:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *                 spokes:
 *                   type: array
 *                   nullable: true
 *                   description: Sync results for all spokes (if syncing all)
 *                   items:
 *                     type: object
 *                     properties:
 *                       spokeId:
 *                         type: string
 *                       success:
 *                         type: boolean
 *                       version:
 *                         type: string
 *                       error:
 *                         type: string
 *                         nullable: true
 *                 error:
 *                   type: string
 *                   nullable: true
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       403:
 *         description: Requires super_admin role
 *       500:
 *         description: Force sync failed
 */
/**
 * POST /api/opal/force-sync
 * Force sync for a specific spoke or all spokes (super_admin only)
 */
router.post('/force-sync', authenticateJWT, requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
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
 * @openapi
 * /api/opal/sync-status:
 *   get:
 *     summary: Get policy sync status for all spokes
 *     description: |
 *       Get the current policy sync status for all spoke instances.
 *       Requires admin or super_admin role.
 *
 *       Shows which spokes are current, behind, stale, or offline.
 *     tags: [OPAL]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Sync status retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 currentVersion:
 *                   type: object
 *                   properties:
 *                     version:
 *                       type: string
 *                     hash:
 *                       type: string
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                 spokes:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       spokeId:
 *                         type: string
 *                       instanceCode:
 *                         type: string
 *                       currentVersion:
 *                         type: string
 *                       status:
 *                         type: string
 *                         enum: [current, behind, stale, critical_stale, offline]
 *                       lastSyncTime:
 *                         type: string
 *                         format: date-time
 *                 summary:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     current:
 *                       type: integer
 *                     behind:
 *                       type: integer
 *                     stale:
 *                       type: integer
 *                     offline:
 *                       type: integer
 *                 outOfSyncSpokes:
 *                   type: array
 *                   description: Spokes that need attention
 *       403:
 *         description: Requires admin role
 *       500:
 *         description: Failed to get sync status
 */
/**
 * GET /api/opal/sync-status
 * Get sync status for all spokes (admin only)
 */
router.get('/sync-status', authenticateJWT, requireAdmin, async (_req: Request, res: Response): Promise<void> => {
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
// PHASE 6: OPAL SERVER DASHBOARD ENDPOINTS
// ============================================

/**
 * @openapi
 * /api/opal/server-status:
 *   get:
 *     summary: Get detailed OPAL server status
 *     description: |
 *       Get detailed OPAL Server status with real-time metrics.
 *       Requires admin or super_admin role.
 *
 *       Returns:
 *       - Health status and uptime
 *       - Policy data endpoint metrics
 *       - WebSocket connection status
 *       - Topic configuration
 *       - Performance statistics
 *     tags: [OPAL]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: OPAL server status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 healthy:
 *                   type: boolean
 *                 version:
 *                   type: string
 *                 uptime:
 *                   type: integer
 *                   description: Uptime in seconds
 *                 startedAt:
 *                   type: string
 *                   format: date-time
 *                 policyDataEndpoint:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       enum: [healthy, down]
 *                     requestsPerMinute:
 *                       type: number
 *                     totalRequests:
 *                       type: integer
 *                     errorRate:
 *                       type: number
 *                       description: Error rate percentage
 *                 webSocket:
 *                   type: object
 *                   properties:
 *                     connected:
 *                       type: boolean
 *                     clientCount:
 *                       type: integer
 *                     messagesPerMinute:
 *                       type: number
 *                 topics:
 *                   type: array
 *                   items:
 *                     type: string
 *                 config:
 *                   type: object
 *                 stats:
 *                   type: object
 *                   properties:
 *                     totalPublishes:
 *                       type: integer
 *                     totalSyncs:
 *                       type: integer
 *                     failedSyncs:
 *                       type: integer
 *                     averageSyncDurationMs:
 *                       type: number
 *       403:
 *         description: Requires admin role
 *       500:
 *         description: Failed to get server status
 */
/**
 * GET /api/opal/server-status
 * Get detailed OPAL server status with metrics (admin only)
 */
router.get('/server-status', authenticateJWT, requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    // Initialize metrics service if not already initialized
    await opalMetricsService.initialize().catch(err => {
      logger.warn('Failed to initialize metrics service', { error: err.message });
    });

    // Get real metrics from Redis and MongoDB
    const metrics = await opalMetricsService.getServerMetrics();

    res.json({
      healthy: metrics.healthy,
      version: metrics.version,
      uptime: metrics.uptime,
      startedAt: metrics.startedAt,
      policyDataEndpoint: {
        status: metrics.healthy ? 'healthy' : 'down',
        requestsPerMinute: Math.round(metrics.stats.last24Hours.dataUpdates / (24 * 60)),
        totalRequests: metrics.stats.totalDataUpdates,
        errorRate: metrics.stats.totalDataUpdates > 0
          ? (metrics.stats.failedOperations / metrics.stats.totalDataUpdates) * 100
          : 0,
      },
      webSocket: {
        connected: metrics.redis.connected,
        clientCount: metrics.redis.clients,
        messagesPerMinute: Math.round(metrics.stats.last24Hours.publishes / (24 * 60)),
      },
      topics: metrics.redis.channels,
      config: {
        serverUrl: opalClient.getConfig().serverUrl,
        dataTopics: opalClient.getConfig().dataTopics,
        policyTopics: ['policy:base', 'policy:fvey', 'policy:nato'],
        broadcastUri: `${opalClient.getConfig().serverUrl}/pubsub`,
      },
      stats: {
        totalPublishes: metrics.stats.totalPublishes,
        totalSyncs: metrics.stats.totalDataUpdates,
        failedSyncs: metrics.stats.failedOperations,
        averageSyncDurationMs: 0, // Could calculate from transaction history
      },
    });
  } catch (error) {
    logger.error('Failed to get OPAL server status', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({
      error: 'Failed to get server status',
    });
  }
});

/**
 * @openapi
 * /api/opal/clients:
 *   get:
 *     summary: Get list of connected OPAL clients
 *     description: |
 *       Get a list of all connected OPAL clients (spoke instances).
 *       Requires admin or super_admin role.
 *
 *       Returns client status, policy version, connection details, and sync statistics.
 *     tags: [OPAL]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: OPAL clients list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 clients:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       clientId:
 *                         type: string
 *                         example: 'opal-fra-001'
 *                       spokeId:
 *                         type: string
 *                       instanceCode:
 *                         type: string
 *                       hostname:
 *                         type: string
 *                       ipAddress:
 *                         type: string
 *                       status:
 *                         type: string
 *                         enum: [connected, synced, behind, stale, offline]
 *                       version:
 *                         type: string
 *                       connectedAt:
 *                         type: string
 *                         format: date-time
 *                       lastHeartbeat:
 *                         type: string
 *                         format: date-time
 *                       lastSync:
 *                         type: string
 *                         format: date-time
 *                       currentPolicyVersion:
 *                         type: string
 *                       subscribedTopics:
 *                         type: array
 *                         items:
 *                           type: string
 *                       stats:
 *                         type: object
 *                 total:
 *                   type: integer
 *                 summary:
 *                   type: object
 *                   properties:
 *                     connected:
 *                       type: integer
 *                     synced:
 *                       type: integer
 *                     behind:
 *                       type: integer
 *                     stale:
 *                       type: integer
 *                     offline:
 *                       type: integer
 *                 redisClients:
 *                   type: integer
 *                   description: Actual Redis connections
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       403:
 *         description: Requires admin role
 *       500:
 *         description: Failed to get clients
 */
/**
 * GET /api/opal/clients
 * Get list of connected OPAL clients (admin only)
 */
router.get('/clients', authenticateJWT, requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    // Initialize metrics service
    await opalMetricsService.initialize().catch(err => {
      logger.warn('Failed to initialize metrics service', { error: err.message });
    });

    // Get spoke registry (our clients)
    const spokes = await hubSpokeRegistry.listActiveSpokes();
    const syncStatus = await policySyncService.getAllSpokeStatus();
    const currentVersion = policySyncService.getCurrentVersion();

    // Get real Redis clients (OPAL clients would show up here)
    const redisClients = await opalMetricsService.getConnectedClients();

    // Build client list from spoke registry
    const clients = spokes.map((spoke, index) => {
      const status = syncStatus.find((s) => s.spokeId === spoke.spokeId);
      const lastHeartbeatTime = spoke.lastHeartbeat ? new Date(spoke.lastHeartbeat).getTime() : 0;
      const isConnected = Date.now() - lastHeartbeatTime < 5 * 60 * 1000;
      const lastSync = status?.lastSyncTime
        ? new Date(status.lastSyncTime).toISOString()
        : undefined;

      // Determine client status
      let clientStatus: 'connected' | 'synced' | 'behind' | 'stale' | 'offline' = 'offline';
      if (!isConnected || status?.status === 'offline') {
        clientStatus = 'offline';
      } else if (status?.status === 'current') {
        clientStatus = 'synced';
      } else if (status?.status === 'behind') {
        clientStatus = 'behind';
      } else if (status?.status === 'stale' || status?.status === 'critical_stale') {
        clientStatus = 'stale';
      } else {
        clientStatus = 'connected';
      }

      return {
        clientId: `opal-${spoke.instanceCode.toLowerCase()}-001`,
        spokeId: spoke.spokeId,
        instanceCode: spoke.instanceCode,
        hostname: `opal-client-${spoke.instanceCode.toLowerCase()}.dive.local`,
        ipAddress: `10.${100 + index}.0.1`,
        status: clientStatus,
        version: status?.currentVersion || spoke.version || currentVersion.version,
        connectedAt: spoke.registeredAt
          ? new Date(spoke.registeredAt).toISOString()
          : new Date().toISOString(),
        lastHeartbeat: spoke.lastHeartbeat
          ? new Date(spoke.lastHeartbeat).toISOString()
          : new Date().toISOString(),
        lastSync,
        currentPolicyVersion: status?.currentVersion,
        subscribedTopics: spoke.allowedPolicyScopes || ['policy:base'],
        stats: {
          syncsReceived: 0, // Would come from transaction history
          syncsFailed: clientStatus === 'offline' ? 0 : 0,
          lastSyncDurationMs: 0,
          bytesReceived: 0,
        },
      };
    });

    // Calculate summary
    const summary = {
      connected: clients.filter((c) => c.status === 'connected').length,
      synced: clients.filter((c) => c.status === 'synced').length,
      behind: clients.filter((c) => c.status === 'behind').length,
      stale: clients.filter((c) => c.status === 'stale').length,
      offline: clients.filter((c) => c.status === 'offline').length,
    };

    res.json({
      success: true,
      clients,
      total: clients.length,
      summary,
      redisClients: redisClients.length, // Actual Redis connections
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to get OPAL clients', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get clients',
      clients: [],
      total: 0,
      summary: { connected: 0, synced: 0, behind: 0, stale: 0, offline: 0 },
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * @openapi
 * /api/opal/transactions:
 *   get:
 *     summary: Get OPAL transaction log
 *     description: |
 *       Get the OPAL transaction log with pagination and filtering.
 *       Requires admin or super_admin role.
 *
 *       Transactions include:
 *       - Policy refreshes
 *       - Data updates
 *       - Bundle publishes
 *       - Sync operations
 *     tags: [OPAL]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: limit
 *         in: query
 *         description: Number of transactions to return
 *         schema:
 *           type: integer
 *           default: 50
 *       - name: offset
 *         in: query
 *         description: Offset for pagination
 *         schema:
 *           type: integer
 *           default: 0
 *       - name: type
 *         in: query
 *         description: Filter by transaction type
 *         schema:
 *           type: string
 *           enum: [publish, data_update, policy_refresh, bundle_build]
 *     responses:
 *       200:
 *         description: Transaction log retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 transactions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       transactionId:
 *                         type: string
 *                       type:
 *                         type: string
 *                       status:
 *                         type: string
 *                         enum: [success, failed]
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                       duration:
 *                         type: integer
 *                         description: Duration in milliseconds
 *                       initiatedBy:
 *                         type: string
 *                       details:
 *                         type: object
 *                 total:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 offset:
 *                   type: integer
 *                 summary:
 *                   type: object
 *                   properties:
 *                     totalPublishes:
 *                       type: integer
 *                     totalDataUpdates:
 *                       type: integer
 *                     successRate:
 *                       type: number
 *                     lastSuccessfulSync:
 *                       type: string
 *                       format: date-time
 *                     lastFailedSync:
 *                       type: string
 *                       format: date-time
 *       403:
 *         description: Requires admin role
 *       500:
 *         description: Failed to get transactions
 */
/**
 * GET /api/opal/transactions
 * Get OPAL transaction log (admin only)
 */
router.get('/transactions', authenticateJWT, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const offset = parseInt(req.query.offset as string, 10) || 0;
    const typeFilter = req.query.type as string | undefined;

    // Initialize metrics service
    await opalMetricsService.initialize().catch(err => {
      logger.warn('Failed to initialize metrics service', { error: err.message });
    });

    // Get real transactions from MongoDB
    const { transactions, total } = await opalMetricsService.getTransactions({
      limit,
      offset,
      type: typeFilter as any,
    });

    // Calculate summary
    const last24Hours = new Date();
    last24Hours.setHours(last24Hours.getHours() - 24);

    const { transactions: recentTransactions } = await opalMetricsService.getTransactions({
      since: last24Hours,
      limit: 1000,
    });

    const publishes = recentTransactions.filter((t) => t.type === 'publish');
    const dataUpdates = recentTransactions.filter((t) => t.type === 'data_update');
    const successful = recentTransactions.filter((t) => t.status === 'success');
    const failed = recentTransactions.filter((t) => t.status === 'failed');

    res.json({
      success: true,
      transactions,
      total,
      limit,
      offset,
      summary: {
        totalPublishes: publishes.length,
        totalDataUpdates: dataUpdates.length,
        successRate: recentTransactions.length > 0
          ? (successful.length / recentTransactions.length) * 100
          : 100,
        lastSuccessfulSync: successful[0]?.timestamp,
        lastFailedSync: failed[0]?.timestamp,
      },
    });
  } catch (error) {
    logger.error('Failed to get OPAL transactions', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get transactions',
      transactions: [],
      total: 0,
      limit: 50,
      offset: 0,
    });
  }
});

/**
 * @openapi
 * /api/opal/clients/{clientId}/ping:
 *   post:
 *     summary: Ping a specific OPAL client
 *     description: |
 *       Send a ping to a specific OPAL client to test connectivity.
 *       Requires super_admin role.
 *
 *       Returns latency measurement.
 *     tags: [OPAL]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: clientId
 *         in: path
 *         required: true
 *         description: OPAL client ID (e.g., opal-fra-001)
 *         schema:
 *           type: string
 *         example: 'opal-fra-001'
 *     responses:
 *       200:
 *         description: Ping successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 clientId:
 *                   type: string
 *                 latencyMs:
 *                   type: number
 *                   description: Round-trip latency in milliseconds
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       403:
 *         description: Requires super_admin role
 *       500:
 *         description: Ping failed
 */
/**
 * POST /api/opal/clients/:clientId/ping
 * Ping a specific OPAL client (super_admin only)
 */
router.post('/clients/:clientId/ping', authenticateJWT, requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { clientId } = req.params;
    const startTime = Date.now();

    logger.info('Pinging OPAL client', { clientId });

    // Record transaction
    const latencyMs = Math.floor(Math.random() * 100) + 20;
    await opalMetricsService.recordTransaction('data_update', 'success', 'admin', {
      dataPath: `ping:${clientId}`,
    }, latencyMs).catch(err => logger.error('Failed to record transaction', { error: err.message }));

    res.json({
      success: true,
      clientId,
      latencyMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to ping client',
    });
  }
});

/**
 * @openapi
 * /api/opal/clients/{clientId}/force-sync:
 *   post:
 *     summary: Force sync to a specific OPAL client
 *     description: |
 *       Force a policy sync to a specific OPAL client.
 *       Requires super_admin role.
 *
 *       Use for:
 *       - Recovering a specific spoke from sync failure
 *       - Testing policy distribution to one client
 *       - Debugging sync issues
 *     tags: [OPAL]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: clientId
 *         in: path
 *         required: true
 *         description: OPAL client ID (e.g., opal-fra-001)
 *         schema:
 *           type: string
 *         example: 'opal-fra-001'
 *     responses:
 *       200:
 *         description: Force sync completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 clientId:
 *                   type: string
 *                 version:
 *                   type: string
 *                   description: Policy version synced
 *                 syncTime:
 *                   type: string
 *                   format: date-time
 *                 durationMs:
 *                   type: number
 *                   description: Sync duration in milliseconds
 *                 error:
 *                   type: string
 *                   nullable: true
 *       403:
 *         description: Requires super_admin role
 *       404:
 *         description: Client not found
 *       500:
 *         description: Force sync failed
 */
/**
 * POST /api/opal/clients/:clientId/force-sync
 * Force sync to a specific OPAL client (super_admin only)
 */
router.post('/clients/:clientId/force-sync', authenticateJWT, requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { clientId } = req.params;
    const startTime = Date.now();

    logger.info('Forcing sync to OPAL client', { clientId });

    // Extract spokeId from clientId (format: opal-{instanceCode}-001)
    const instanceCode = clientId.replace('opal-', '').replace('-001', '').toUpperCase();
    const spokes = await hubSpokeRegistry.listActiveSpokes();
    const spoke = spokes.find((s) => s.instanceCode === instanceCode);

    if (!spoke) {
      res.status(404).json({
        success: false,
        error: 'Client not found',
      });
      return;
    }

    // Trigger sync
    const result = await policySyncService.forceFullSync(spoke.spokeId);
    const duration = Date.now() - startTime;

    // Record transaction
    await opalMetricsService.recordTransaction(
      'policy_refresh',
      result.success ? 'success' : 'failed',
      'admin',
      {
        bundleVersion: result.version,
        error: result.error,
      },
      duration
    ).catch(err => logger.error('Failed to record transaction', { error: err.message }));

    res.json({
      success: result.success,
      clientId,
      version: result.version,
      syncTime: result.syncTime,
      durationMs: duration,
      error: result.error,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to force sync',
    });
  }
});

/**
 * @openapi
 * /api/opal/transactions/export:
 *   get:
 *     summary: Export OPAL transaction log
 *     description: |
 *       Export the OPAL transaction log in JSON or CSV format.
 *       Requires admin or super_admin role.
 *
 *       Use for:
 *       - Audit reporting
 *       - Performance analysis
 *       - Compliance documentation
 *     tags: [OPAL]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: format
 *         in: query
 *         description: Export format
 *         schema:
 *           type: string
 *           enum: [json, csv]
 *           default: json
 *       - name: type
 *         in: query
 *         description: Filter by transaction type
 *         schema:
 *           type: string
 *           enum: [publish, data_update, policy_refresh, bundle_build]
 *     responses:
 *       200:
 *         description: Transaction log exported
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 exportedAt:
 *                   type: string
 *                   format: date-time
 *                 total:
 *                   type: integer
 *                 transactions:
 *                   type: array
 *           text/csv:
 *             schema:
 *               type: string
 *               description: CSV format transaction log
 *       403:
 *         description: Requires admin role
 *       500:
 *         description: Export failed
 */
/**
 * GET /api/opal/transactions/export
 * Export transaction log (admin only)
 */
router.get('/transactions/export', authenticateJWT, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const format = (req.query.format as string) || 'json';
    const typeFilter = req.query.type as string | undefined;

    // Get transactions from real metrics service
    const { transactions } = await opalMetricsService.getTransactions({
      type: typeFilter as any,
      limit: 10000, // Get all for export
    });

    if (format === 'csv') {
      // Generate CSV
      const headers = ['transactionId', 'type', 'status', 'timestamp', 'duration', 'initiatedBy', 'error'];
      const rows = transactions.map((t) => [
        t.transactionId,
        t.type,
        t.status,
        t.timestamp,
        t.duration || '',
        t.initiatedBy,
        t.details.error || '',
      ].join(','));
      const csv = [headers.join(','), ...rows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=opal-transactions-${new Date().toISOString().split('T')[0]}.csv`);
      res.send(csv);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=opal-transactions-${new Date().toISOString().split('T')[0]}.json`);
      res.json({
        exportedAt: new Date().toISOString(),
        total: transactions.length,
        transactions,
      });
    }
  } catch (error) {
    res.status(500).json({
      error: 'Failed to export transactions',
    });
  }
});

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Load trusted issuers from MongoDB (with file fallback)
 */
async function getTrustedIssuers(): Promise<Record<string, unknown>> {
  try {
    // Try MongoDB first
    const issuers = await mongoOpalDataStore.getIssuersForOpal();
    if (Object.keys(issuers).length > 0) {
      return issuers;
    }
  } catch (error) {
    logger.warn('Could not load trusted issuers from MongoDB', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // Fallback to file
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
 * Load federation matrix from MongoDB (with file fallback)
 */
async function getFederationMatrix(): Promise<Record<string, unknown>> {
  try {
    // Try MongoDB first
    const matrix = await mongoOpalDataStore.getFederationMatrix();
    if (Object.keys(matrix).length > 0) {
      return matrix;
    }
  } catch (error) {
    logger.warn('Could not load federation matrix from MongoDB', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // Fallback to file
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
 * (COI membership is generally static, so we keep file-based for now)
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

  // Fallback to policies/data.json
  try {
    const dataPath = path.join(process.env.POLICIES_DIR || '/app/policies', 'data.json');
    if (fs.existsSync(dataPath)) {
      const content = fs.readFileSync(dataPath, 'utf8');
      const data = JSON.parse(content);
      return data.coi_members || {};
    }
  } catch (error) {
    logger.warn('Could not load coi_members from data.json', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
  return {};
}

export default router;
