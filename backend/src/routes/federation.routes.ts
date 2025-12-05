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
import { SPManagementService } from '../services/sp-management.service';
import { logger } from '../utils/logger';
import { z } from 'zod';

// Initialize SP Management Service
const spManagement = new SPManagementService();

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

// SP Client Registration Schema
const spRegistrationSchema = z.object({
  name: z.string().min(3).max(100),
  description: z.string().optional(),
  organizationType: z.enum(['government', 'military', 'defense_contractor', 'research', 'other']),
  country: z.string().length(3).toUpperCase(),
  technicalContact: z.object({
    name: z.string().optional(),
    email: z.string().email()
  }),
  clientType: z.enum(['confidential', 'public']).default('confidential'),
  redirectUris: z.array(z.string().url()).min(1),
  postLogoutRedirectUris: z.array(z.string().url()).optional(),
  jwksUri: z.string().url().optional().nullable(),
  tokenEndpointAuthMethod: z.enum([
    'client_secret_basic',
    'client_secret_post',
    'private_key_jwt',
    'none'
  ]).default('client_secret_basic'),
  requirePKCE: z.boolean().default(true),
  allowedScopes: z.array(z.string()).min(1),
  allowedGrantTypes: z.array(z.enum([
    'authorization_code',
    'refresh_token',
    'client_credentials'
  ])).default(['authorization_code', 'refresh_token']),
  attributeRequirements: z.object({
    clearance: z.object({
      required: z.boolean(),
      allowedValues: z.array(z.string()).optional()
    }).optional(),
    countryOfAffiliation: z.object({
      required: z.boolean()
    }).optional()
  }).optional(),
  maxClassification: z.enum(['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET']).default('UNCLASSIFIED'),
  rateLimit: z.object({
    requestsPerMinute: z.number().default(60),
    burstSize: z.number().default(10),
    quotaPerDay: z.number().default(10000)
  }).optional()
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

// ============================================
// SP CLIENT ENDPOINTS (Pilot Mode)
// ============================================

/**
 * POST /api/federation/sp/register
 * Register a new SP Client (OAuth/OIDC client)
 * This is for partners who want to integrate with DIVE without deploying a full spoke
 */
router.post('/sp/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = spRegistrationSchema.safeParse(req.body);
    
    if (!parsed.success) {
      res.status(400).json({ 
        error: 'Validation failed', 
        details: parsed.error.issues 
      });
      return;
    }
    
    logger.info('Processing SP Client registration', {
      name: parsed.data.name,
      country: parsed.data.country,
      organizationType: parsed.data.organizationType
    });
    
    // Register the SP using SPManagementService
    // Map organization type to expected enum values
    const orgTypeMap: Record<string, 'GOVERNMENT' | 'MILITARY' | 'CONTRACTOR' | 'ACADEMIC'> = {
      'government': 'GOVERNMENT',
      'military': 'MILITARY',
      'defense_contractor': 'CONTRACTOR',
      'research': 'ACADEMIC',
      'other': 'CONTRACTOR'
    };
    
    // Map token auth method to expected enum values
    const authMethodMap: Record<string, 'client_secret_basic' | 'client_secret_post' | 'private_key_jwt'> = {
      'client_secret_basic': 'client_secret_basic',
      'client_secret_post': 'client_secret_post',
      'private_key_jwt': 'private_key_jwt',
      'none': 'client_secret_basic'
    };
    
    const sp = await spManagement.registerSP({
      name: parsed.data.name,
      description: parsed.data.description || `SP Client for ${parsed.data.name}`,
      organizationType: orgTypeMap[parsed.data.organizationType] || 'GOVERNMENT',
      country: parsed.data.country,
      technicalContact: {
        name: parsed.data.technicalContact.name || 'Admin',
        email: parsed.data.technicalContact.email,
        phone: ''
      },
      clientType: parsed.data.clientType,
      redirectUris: parsed.data.redirectUris,
      postLogoutRedirectUris: parsed.data.postLogoutRedirectUris,
      jwksUri: parsed.data.jwksUri || undefined,
      tokenEndpointAuthMethod: authMethodMap[parsed.data.tokenEndpointAuthMethod] || 'client_secret_basic',
      requirePKCE: parsed.data.requirePKCE,
      allowedScopes: parsed.data.allowedScopes,
      allowedGrantTypes: parsed.data.allowedGrantTypes,
      attributeRequirements: {
        clearance: parsed.data.attributeRequirements?.clearance?.required ?? true,
        country: parsed.data.attributeRequirements?.countryOfAffiliation?.required ?? true
      },
      rateLimit: parsed.data.rateLimit
    });
    
    logger.info('SP Client registered successfully', {
      spId: sp.spId,
      clientId: sp.clientId,
      name: sp.name,
      country: sp.country,
      status: sp.status
    });
    
    res.status(201).json({
      success: true,
      sp: {
        spId: sp.spId,
        clientId: sp.clientId,
        clientSecret: sp.clientSecret, // Only returned on initial registration
        name: sp.name,
        country: sp.country,
        status: sp.status,
        message: sp.status === 'PENDING' 
          ? 'Registration pending approval. You will be notified when approved.'
          : 'Registration successful.'
      },
      endpoints: {
        issuer: `${process.env.KEYCLOAK_URL || 'https://usa-idp.dive25.com'}/realms/dive-v3-broker`,
        authorization: `${process.env.KEYCLOAK_URL || 'https://usa-idp.dive25.com'}/realms/dive-v3-broker/protocol/openid-connect/auth`,
        token: `${process.env.KEYCLOAK_URL || 'https://usa-idp.dive25.com'}/realms/dive-v3-broker/protocol/openid-connect/token`,
        userinfo: `${process.env.KEYCLOAK_URL || 'https://usa-idp.dive25.com'}/realms/dive-v3-broker/protocol/openid-connect/userinfo`,
        jwks: `${process.env.KEYCLOAK_URL || 'https://usa-idp.dive25.com'}/realms/dive-v3-broker/protocol/openid-connect/certs`
      }
    });
    
  } catch (error) {
    logger.error('SP Client registration failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    res.status(500).json({
      error: 'Registration failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/federation/sp/:spId
 * Get SP Client details
 */
router.get('/sp/:spId', async (req: Request, res: Response): Promise<void> => {
  try {
    const sp = await spManagement.getById(req.params.spId);
    
    if (!sp) {
      res.status(404).json({ error: 'SP not found' });
      return;
    }
    
    // Don't return client secret
    const { clientSecret, ...safesp } = sp as any;
    
    res.json({
      sp: safesp
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to get SP details' });
  }
});

/**
 * GET /api/federation/sp
 * List SP Clients (admin)
 */
router.get('/sp', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await spManagement.listSPs({
      status: req.query.status as string | undefined,
      country: req.query.country as string | undefined,
      organizationType: req.query.organizationType as string | undefined,
      search: req.query.search as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined
    });
    
    res.json(result);
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to list SPs' });
  }
});

/**
 * POST /api/federation/sp/:spId/approve
 * Approve a pending SP Client
 */
router.post('/sp/:spId/approve', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const approvedBy = (req as any).user?.uniqueID || 'admin';
    const sp = await spManagement.approveSP(req.params.spId, true, undefined, approvedBy);
    
    if (!sp) {
      res.status(404).json({ error: 'SP not found' });
      return;
    }
    
    logger.info('SP Client approved', {
      spId: sp.spId,
      name: sp.name,
      approvedBy
    });
    
    res.json({
      success: true,
      sp: {
        spId: sp.spId,
        clientId: sp.clientId,
        name: sp.name,
        status: sp.status
      }
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Approval failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/federation/sp/:spId/suspend
 * Suspend an SP Client
 */
router.post('/sp/:spId/suspend', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { reason } = req.body;
    const suspendedBy = (req as any).user?.uniqueID || 'admin';
    
    const sp = await spManagement.suspendSP(req.params.spId, reason || 'No reason provided', suspendedBy);
    
    if (!sp) {
      res.status(404).json({ error: 'SP not found' });
      return;
    }
    
    logger.warn('SP Client suspended', {
      spId: sp.spId,
      name: sp.name,
      reason,
      suspendedBy
    });
    
    res.json({
      success: true,
      sp: {
        spId: sp.spId,
        clientId: sp.clientId,
        name: sp.name,
        status: sp.status
      },
      message: 'SP Client suspended. OAuth client disabled in Keycloak.'
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Suspension failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/federation/sp/:spId/regenerate-secret
 * Regenerate client secret for an SP
 */
router.post('/sp/:spId/regenerate-secret', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await spManagement.regenerateClientSecret(req.params.spId);
    
    if (!result) {
      res.status(404).json({ error: 'SP not found or is public client' });
      return;
    }
    
    logger.info('SP Client secret regenerated', {
      spId: req.params.spId
    });
    
    res.json({
      success: true,
      clientSecret: result.clientSecret,
      message: 'New client secret generated. Previous secret is now invalid.'
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Secret regeneration failed',
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
    const { layers, priority = 'normal', description } = req.body;
    
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
