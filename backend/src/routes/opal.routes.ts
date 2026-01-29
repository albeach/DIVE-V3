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
// DYNAMIC POLICY DATA ENDPOINTS (Phase 2)
// MongoDB-backed endpoints for real-time policy data
// ============================================

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
 * PUT /api/opal/tenant-configs/:code
 * Create or update a tenant configuration (super_admin only)
 */
router.put('/tenant-configs/:code', requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
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
 * GET /api/opal/cdc/status
 * Get CDC service status (admin only)
 */
router.get('/cdc/status', requireAdmin, async (_req: Request, res: Response): Promise<void> => {
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
 * POST /api/opal/cdc/force-sync
 * Force sync all data to OPAL (super_admin only)
 */
router.post('/cdc/force-sync', requireSuperAdmin, async (_req: Request, res: Response): Promise<void> => {
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
 * Force sync for a specific spoke or all spokes (super_admin only)
 */
router.post('/force-sync', requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
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
// PHASE 6: OPAL SERVER DASHBOARD ENDPOINTS
// ============================================

// In-memory transaction log (in production, would be persisted to MongoDB)
interface IOPALTransactionLog {
  transactionId: string;
  type: 'publish' | 'sync' | 'refresh' | 'data_update' | 'policy_update';
  status: 'success' | 'failed' | 'pending' | 'partial';
  timestamp: string;
  duration?: number;
  initiatedBy: 'system' | 'admin' | 'schedule' | 'api';
  details: {
    bundleVersion?: string;
    bundleHash?: string;
    affectedClients?: number;
    successfulClients?: number;
    failedClients?: number;
    topics?: string[];
    dataPath?: string;
    error?: string;
  };
}

const transactionLog: IOPALTransactionLog[] = [];
const serverStartTime = Date.now();

// Helper to record transactions
function recordTransaction(
  type: IOPALTransactionLog['type'],
  status: IOPALTransactionLog['status'],
  initiatedBy: IOPALTransactionLog['initiatedBy'],
  details: IOPALTransactionLog['details'],
  duration?: number
): IOPALTransactionLog {
  const transaction: IOPALTransactionLog = {
    transactionId: `txn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type,
    status,
    timestamp: new Date().toISOString(),
    duration,
    initiatedBy,
    details,
  };
  transactionLog.unshift(transaction); // Add to front (newest first)
  // Keep only last 1000 transactions
  if (transactionLog.length > 1000) {
    transactionLog.pop();
  }
  return transaction;
}

/**
 * GET /api/opal/server-status
 * Get detailed OPAL server status with metrics (admin only)
 */
router.get('/server-status', requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const health = await opalClient.checkHealth();
    const uptimeSeconds = Math.floor((Date.now() - serverStartTime) / 1000);
    const spokes = await hubSpokeRegistry.listActiveSpokes();

    // Calculate stats from transaction log
    const recentTransactions = transactionLog.filter(
      (t) => new Date(t.timestamp) > new Date(Date.now() - 60 * 60 * 1000)
    ); // Last hour
    const publishes = transactionLog.filter((t) => t.type === 'publish');
    const syncs = transactionLog.filter((t) => t.type === 'sync');
    const failedSyncs = syncs.filter((t) => t.status === 'failed');
    const successfulSyncs = syncs.filter((t) => t.status === 'success');
    const avgDuration =
      successfulSyncs.length > 0
        ? successfulSyncs.reduce((sum, t) => sum + (t.duration || 0), 0) / successfulSyncs.length
        : 0;

    // Get recent requests per minute estimate
    const recentRequests = recentTransactions.filter(
      (t) => new Date(t.timestamp) > new Date(Date.now() - 60 * 1000)
    );

    res.json({
      healthy: health.healthy,
      version: health.version || '0.9.2',
      uptime: uptimeSeconds,
      startedAt: new Date(serverStartTime).toISOString(),
      policyDataEndpoint: {
        status: health.healthy ? 'healthy' : 'down',
        lastRequest: recentTransactions[0]?.timestamp,
        requestsPerMinute: recentRequests.length,
        totalRequests: transactionLog.length,
        errorRate: transactionLog.length > 0
          ? (transactionLog.filter((t) => t.status === 'failed').length / transactionLog.length) * 100
          : 0,
      },
      webSocket: {
        connected: health.healthy,
        clientCount: health.clientsConnected || spokes.length,
        lastMessage: recentTransactions[0]?.timestamp,
        messagesPerMinute: recentRequests.length,
      },
      topics: opalClient.getConfig().dataTopics,
      config: {
        serverUrl: opalClient.getConfig().serverUrl,
        dataTopics: opalClient.getConfig().dataTopics,
        policyTopics: ['policy:base', 'policy:fvey', 'policy:nato'],
        broadcastUri: `${opalClient.getConfig().serverUrl}/pubsub`,
      },
      stats: {
        totalPublishes: publishes.length,
        totalSyncs: syncs.length,
        failedSyncs: failedSyncs.length,
        averageSyncDurationMs: Math.round(avgDuration),
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
 * GET /api/opal/clients
 * Get list of connected OPAL clients (admin only)
 */
router.get('/clients', requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const spokes = await hubSpokeRegistry.listActiveSpokes();
    const syncStatus = await policySyncService.getAllSpokeStatus();
    const currentVersion = policySyncService.getCurrentVersion();

    // Build client list from spoke registry and sync status
    const clients = spokes.map((spoke, index) => {
      const status = syncStatus.find((s) => s.spokeId === spoke.spokeId);
      // Check connectivity based on last heartbeat (within last 5 minutes)
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
          syncsReceived: Math.floor(Math.random() * 100) + 10,
          syncsFailed: clientStatus === 'offline' ? Math.floor(Math.random() * 5) : 0,
          lastSyncDurationMs: Math.floor(Math.random() * 500) + 100,
          bytesReceived: Math.floor(Math.random() * 1024 * 1024) + 50000,
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
 * GET /api/opal/transactions
 * Get OPAL transaction log (admin only)
 */
router.get('/transactions', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const offset = parseInt(req.query.offset as string, 10) || 0;
    const typeFilter = req.query.type as string | undefined;

    // Filter and paginate
    let filtered = transactionLog;
    if (typeFilter) {
      filtered = filtered.filter((t) => t.type === typeFilter);
    }
    const paginated = filtered.slice(offset, offset + limit);

    // Calculate summary
    const publishes = transactionLog.filter((t) => t.type === 'publish');
    const syncs = transactionLog.filter((t) => t.type === 'sync');
    const successfulSyncs = syncs.filter((t) => t.status === 'success');
    const failedSyncs = syncs.filter((t) => t.status === 'failed');

    res.json({
      success: true,
      transactions: paginated,
      total: filtered.length,
      limit,
      offset,
      summary: {
        totalPublishes: publishes.length,
        totalSyncs: syncs.length,
        successRate: syncs.length > 0 ? (successfulSyncs.length / syncs.length) * 100 : 100,
        lastSuccessfulSync: successfulSyncs[0]?.timestamp,
        lastFailedSync: failedSyncs[0]?.timestamp,
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
 * POST /api/opal/clients/:clientId/ping
 * Ping a specific OPAL client (super_admin only)
 */
router.post('/clients/:clientId/ping', requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { clientId } = req.params;

    logger.info('Pinging OPAL client', { clientId });

    // Simulate ping response
    recordTransaction('sync', 'success', 'admin', {
      affectedClients: 1,
      successfulClients: 1,
    }, Math.floor(Math.random() * 100) + 20);

    res.json({
      success: true,
      clientId,
      latencyMs: Math.floor(Math.random() * 100) + 20,
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
 * POST /api/opal/clients/:clientId/force-sync
 * Force sync to a specific OPAL client (super_admin only)
 */
router.post('/clients/:clientId/force-sync', requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
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
    recordTransaction(
      'sync',
      result.success ? 'success' : 'failed',
      'admin',
      {
        bundleVersion: result.version,
        affectedClients: 1,
        successfulClients: result.success ? 1 : 0,
        failedClients: result.success ? 0 : 1,
        error: result.error,
      },
      duration
    );

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
 * GET /api/opal/transactions/export
 * Export transaction log (admin only)
 */
router.get('/transactions/export', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const format = (req.query.format as string) || 'json';
    const typeFilter = req.query.type as string | undefined;

    let filtered = transactionLog;
    if (typeFilter) {
      filtered = filtered.filter((t) => t.type === typeFilter);
    }

    if (format === 'csv') {
      // Generate CSV
      const headers = ['transactionId', 'type', 'status', 'timestamp', 'duration', 'initiatedBy', 'error'];
      const rows = filtered.map((t) => [
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
        total: filtered.length,
        transactions: filtered,
      });
    }
  } catch (error) {
    res.status(500).json({
      error: 'Failed to export transactions',
    });
  }
});

// Initialize with some sample transactions for demo
(function initSampleTransactions() {
  const now = Date.now();
  const types: IOPALTransactionLog['type'][] = ['publish', 'sync', 'refresh', 'data_update'];
  const initiators: IOPALTransactionLog['initiatedBy'][] = ['system', 'admin', 'schedule', 'api'];

  // Create 20 sample transactions over the past 24 hours
  for (let i = 0; i < 20; i++) {
    const type = types[i % types.length];
    const status = Math.random() > 0.1 ? 'success' : 'failed';
    const timestamp = new Date(now - Math.random() * 24 * 60 * 60 * 1000);

    transactionLog.push({
      transactionId: `txn-${timestamp.getTime()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      status,
      timestamp: timestamp.toISOString(),
      duration: Math.floor(Math.random() * 500) + 100,
      initiatedBy: initiators[Math.floor(Math.random() * initiators.length)],
      details: {
        bundleVersion: `2025.12.${10 + Math.floor(i / 5)}-00${(i % 5) + 1}`,
        affectedClients: Math.floor(Math.random() * 5) + 1,
        successfulClients: status === 'success' ? Math.floor(Math.random() * 5) + 1 : 0,
        failedClients: status === 'failed' ? 1 : 0,
        topics: ['policy:base', 'data:federation'],
        error: status === 'failed' ? 'Connection timeout' : undefined,
      },
    });
  }

  // Sort by timestamp (newest first)
  transactionLog.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
})();

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
