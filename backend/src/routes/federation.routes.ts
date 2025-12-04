/**
 * DIVE V3 - Federation API Routes
 * 
 * Hub-Spoke federation management endpoints.
 * 
 * Public endpoints (spoke → hub):
 * - POST /api/federation/register - Register new spoke
 * - POST /api/federation/heartbeat - Spoke heartbeat
 * - GET /api/federation/policy/version - Current policy version
 * - GET /api/federation/policy/bundle - Download policy bundle
 * 
 * Admin endpoints (hub management):
 * - GET /api/federation/spokes - List all spokes
 * - GET /api/federation/spokes/:spokeId - Get spoke details
 * - POST /api/federation/spokes/:spokeId/approve - Approve spoke
 * - POST /api/federation/spokes/:spokeId/suspend - Suspend spoke
 * - POST /api/federation/spokes/:spokeId/revoke - Revoke spoke
 * - POST /api/federation/spokes/:spokeId/token - Generate spoke token
 * - POST /api/federation/policy/push - Push policy update
 * 
 * @version 1.0.0
 * @date 2025-12-04
 */

import { Router, Request, Response, NextFunction } from 'express';
import { hubSpokeRegistry, IRegistrationRequest } from '../services/hub-spoke-registry.service';
import { policySyncService } from '../services/policy-sync.service';
import { idpValidationService } from '../services/idp-validation.service';
import { logger } from '../utils/logger';
import { z } from 'zod';

const router = Router();

// ============================================
// VALIDATION SCHEMAS
// ============================================

const registrationSchema = z.object({
  instanceCode: z.string().length(3).toUpperCase(),
  name: z.string().min(3).max(100),
  description: z.string().optional(),
  baseUrl: z.string().url(),
  apiUrl: z.string().url(),
  idpUrl: z.string().url(),
  publicKey: z.string().optional(),
  requestedScopes: z.array(z.string()).min(1),
  contactEmail: z.string().email()
});

const approvalSchema = z.object({
  allowedScopes: z.array(z.string()).min(1),
  trustLevel: z.enum(['development', 'partner', 'bilateral', 'national']),
  maxClassification: z.enum(['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET']),
  dataIsolationLevel: z.enum(['full', 'filtered', 'minimal'])
});

const heartbeatSchema = z.object({
  spokeId: z.string(),
  policyVersion: z.string().optional(),
  opaHealthy: z.boolean().optional(),
  opalClientConnected: z.boolean().optional(),
  latencyMs: z.number().optional()
});

// ============================================
// MIDDLEWARE
// ============================================

/**
 * Validate spoke token for protected endpoints
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
  // TODO: Integrate with actual auth middleware
  // For now, check for admin header or session
  const adminKey = req.headers['x-admin-key'];
  
  if (adminKey !== process.env.FEDERATION_ADMIN_KEY && process.env.NODE_ENV === 'production') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  
  next();
}

// ============================================
// PUBLIC ENDPOINTS (Spoke → Hub)
// ============================================

/**
 * POST /api/federation/register
 * Register a new spoke instance
 */
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = registrationSchema.safeParse(req.body);
    
    if (!parsed.success) {
      res.status(400).json({ 
        error: 'Validation failed', 
        details: parsed.error.issues 
      });
      return;
    }
    
    const request: IRegistrationRequest = parsed.data;
    
    // Validate IdP endpoint before registration
    logger.info('Validating IdP endpoint for spoke registration', { 
      instanceCode: request.instanceCode,
      idpUrl: request.idpUrl
    });
    
    const tlsResult = await idpValidationService.validateTLS(request.idpUrl);
    
    if (!tlsResult.pass) {
      res.status(400).json({
        error: 'IdP endpoint validation failed',
        details: {
          tls: tlsResult.errors,
          warnings: tlsResult.warnings
        }
      });
      return;
    }
    
    const spoke = await hubSpokeRegistry.registerSpoke(request);
    
    logger.info('Spoke registration successful', {
      spokeId: spoke.spokeId,
      instanceCode: spoke.instanceCode,
      status: spoke.status
    });
    
    res.status(201).json({
      success: true,
      spoke: {
        spokeId: spoke.spokeId,
        instanceCode: spoke.instanceCode,
        name: spoke.name,
        status: spoke.status,
        message: 'Registration pending approval. You will receive a token once approved.'
      }
    });
    
  } catch (error) {
    logger.error('Spoke registration failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    res.status(500).json({
      error: 'Registration failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/federation/heartbeat
 * Spoke heartbeat with health status
 */
router.post('/heartbeat', requireSpokeToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = heartbeatSchema.safeParse(req.body);
    
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid heartbeat data' });
      return;
    }
    
    const spoke = (req as any).spoke;
    
    // Record heartbeat
    await hubSpokeRegistry.recordHeartbeat(spoke.spokeId, {
      opaHealthy: parsed.data.opaHealthy,
      opalClientConnected: parsed.data.opalClientConnected,
      latencyMs: parsed.data.latencyMs
    });
    
    // Record policy sync status
    if (parsed.data.policyVersion) {
      await policySyncService.recordSpokeSync(spoke.spokeId, parsed.data.policyVersion);
    }
    
    // Get current version for comparison
    const currentVersion = policySyncService.getCurrentVersion();
    
    res.json({
      success: true,
      serverTime: new Date().toISOString(),
      currentPolicyVersion: currentVersion.version,
      syncStatus: parsed.data.policyVersion === currentVersion.version ? 'current' : 'behind'
    });
    
  } catch (error) {
    logger.error('Heartbeat processing failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    res.status(500).json({ error: 'Heartbeat failed' });
  }
});

/**
 * GET /api/federation/policy/version
 * Get current policy version
 */
router.get('/policy/version', async (_req: Request, res: Response): Promise<void> => {
  const version = policySyncService.getCurrentVersion();
  
  res.json({
    version: version.version,
    timestamp: version.timestamp,
    hash: version.hash,
    layers: version.layers
  });
});

/**
 * GET /api/federation/policy/bundle
 * Download policy bundle (scope-filtered by spoke token)
 */
router.get('/policy/bundle', requireSpokeToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const spoke = (req as any).spoke;
    const fromVersion = req.query.from as string | undefined;
    
    // Get delta update filtered by spoke's scopes
    const delta = await policySyncService.getDeltaUpdate(spoke.spokeId, fromVersion || '');
    
    res.json({
      spokeId: spoke.spokeId,
      scopes: spoke.allowedPolicyScopes,
      currentVersion: delta.currentVersion,
      updates: delta.updates,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Policy bundle request failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    res.status(500).json({ error: 'Failed to get policy bundle' });
  }
});

// ============================================
// ADMIN ENDPOINTS (Hub Management)
// ============================================

/**
 * GET /api/federation/spokes
 * List all registered spokes
 */
router.get('/spokes', requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const spokes = await hubSpokeRegistry.listAllSpokes();
    const stats = await hubSpokeRegistry.getStatistics();
    
    res.json({
      spokes,
      statistics: stats
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to list spokes' });
  }
});

/**
 * GET /api/federation/spokes/pending
 * List spokes pending approval
 */
router.get('/spokes/pending', requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const pending = await hubSpokeRegistry.listPendingApprovals();
    
    res.json({ pending });
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to list pending approvals' });
  }
});

/**
 * GET /api/federation/spokes/:spokeId
 * Get spoke details
 */
router.get('/spokes/:spokeId', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const spoke = await hubSpokeRegistry.getSpoke(req.params.spokeId);
    
    if (!spoke) {
      res.status(404).json({ error: 'Spoke not found' });
      return;
    }
    
    // Get health status
    const health = await hubSpokeRegistry.checkSpokeHealth(spoke.spokeId);
    
    // Get sync status
    const syncStatus = policySyncService.getSpokeStatus(spoke.spokeId);
    
    res.json({
      spoke,
      health,
      syncStatus
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to get spoke details' });
  }
});

/**
 * POST /api/federation/spokes/:spokeId/approve
 * Approve a pending spoke
 */
router.post('/spokes/:spokeId/approve', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = approvalSchema.safeParse(req.body);
    
    if (!parsed.success) {
      res.status(400).json({ 
        error: 'Invalid approval data', 
        details: parsed.error.issues 
      });
      return;
    }
    
    const approvedBy = (req as any).user?.uniqueID || 'admin';
    
    const spoke = await hubSpokeRegistry.approveSpoke(
      req.params.spokeId,
      approvedBy,
      parsed.data
    );
    
    // Generate initial token
    const token = await hubSpokeRegistry.generateSpokeToken(spoke.spokeId);
    
    logger.info('Spoke approved', {
      spokeId: spoke.spokeId,
      instanceCode: spoke.instanceCode,
      approvedBy,
      allowedScopes: parsed.data.allowedScopes
    });
    
    res.json({
      success: true,
      spoke,
      token: {
        token: token.token,
        expiresAt: token.expiresAt,
        scopes: token.scopes
      }
    });
    
  } catch (error) {
    logger.error('Spoke approval failed', {
      spokeId: req.params.spokeId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    res.status(500).json({
      error: 'Approval failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/federation/spokes/:spokeId/suspend
 * Suspend an approved spoke
 */
router.post('/spokes/:spokeId/suspend', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { reason } = req.body;
    
    if (!reason) {
      res.status(400).json({ error: 'Reason is required' });
      return;
    }
    
    const spoke = await hubSpokeRegistry.suspendSpoke(req.params.spokeId, reason);
    
    logger.warn('Spoke suspended', {
      spokeId: spoke.spokeId,
      instanceCode: spoke.instanceCode,
      reason
    });
    
    res.json({
      success: true,
      spoke,
      message: 'Spoke suspended. All tokens revoked.'
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Suspension failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/federation/spokes/:spokeId/revoke
 * Permanently revoke a spoke
 */
router.post('/spokes/:spokeId/revoke', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { reason } = req.body;
    
    if (!reason) {
      res.status(400).json({ error: 'Reason is required' });
      return;
    }
    
    await hubSpokeRegistry.revokeSpoke(req.params.spokeId, reason);
    
    logger.error('Spoke revoked', {
      spokeId: req.params.spokeId,
      reason
    });
    
    res.json({
      success: true,
      message: 'Spoke permanently revoked.'
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Revocation failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/federation/spokes/:spokeId/token
 * Generate new token for spoke
 */
router.post('/spokes/:spokeId/token', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const token = await hubSpokeRegistry.generateSpokeToken(req.params.spokeId);
    
    res.json({
      success: true,
      token: {
        token: token.token,
        expiresAt: token.expiresAt,
        scopes: token.scopes
      }
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Token generation failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/federation/policy/push
 * Push policy update to all or specific spoke
 */
router.post('/policy/push', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { layers, priority = 'normal', description, spokeId } = req.body;
    
    if (!layers || !Array.isArray(layers) || layers.length === 0) {
      res.status(400).json({ error: 'Layers array is required' });
      return;
    }
    
    const update = await policySyncService.pushPolicyUpdate({
      layers,
      priority,
      description: description || `Policy update: ${layers.join(', ')}`
    });
    
    logger.info('Policy update pushed', {
      updateId: update.updateId,
      version: update.version,
      layers,
      priority
    });
    
    res.json({
      success: true,
      update
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Policy push failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/federation/sync/status
 * Get sync status for all spokes
 */
router.get('/sync/status', requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const allStatus = await policySyncService.getAllSpokeStatus();
    const outOfSync = await policySyncService.getOutOfSyncSpokes();
    const currentVersion = policySyncService.getCurrentVersion();
    
    res.json({
      currentVersion,
      spokes: allStatus,
      outOfSync: outOfSync.length,
      summary: {
        total: allStatus.length,
        current: allStatus.filter(s => s.status === 'current').length,
        behind: allStatus.filter(s => s.status === 'behind').length,
        stale: allStatus.filter(s => s.status === 'stale').length,
        offline: allStatus.filter(s => s.status === 'offline').length
      }
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to get sync status' });
  }
});

/**
 * GET /api/federation/health
 * Get overall federation health
 */
router.get('/health', async (_req: Request, res: Response): Promise<void> => {
  try {
    const stats = await hubSpokeRegistry.getStatistics();
    const unhealthy = await hubSpokeRegistry.getUnhealthySpokes();
    const currentVersion = policySyncService.getCurrentVersion();
    
    res.json({
      healthy: unhealthy.length === 0,
      statistics: stats,
      unhealthySpokes: unhealthy.map(s => ({
        spokeId: s.spokeId,
        instanceCode: s.instanceCode,
        lastHeartbeat: s.lastHeartbeat
      })),
      policyVersion: currentVersion.version,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Health check failed' });
  }
});

export default router;
