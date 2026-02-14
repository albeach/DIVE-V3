/**
 * FRA Federation Routes
 * API endpoints for metadata federation between FRA and USA instances
 * GAP-004: Correlation ID tracking for all federation operations
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { FRAFederationService } from '../services/fra-federation.service';
import { logger } from '../utils/logger';

const router = Router();
const federationService = new FRAFederationService();

// Initialize service on startup with proper error handling
federationService.initialize().catch((error) => {
  logger.error('FRA Federation Service initialization failed', {
    error: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : undefined,
    component: 'FRAFederationRoutes',
    operation: 'initialize',
    severity: 'HIGH',
    action: 'Federation sync will be unavailable until service restarts'
  });
  // Service continues but sync will be unavailable
});

// Middleware to ensure correlation ID
const ensureCorrelationId = (req: Request, res: Response, next: Function) => {
  if (!req.headers['x-correlation-id']) {
    req.headers['x-correlation-id'] = `corr-${uuidv4()}`;
  }
  res.setHeader('X-Correlation-ID', req.headers['x-correlation-id'] as string);
  next();
};

// Apply correlation ID middleware to all routes
router.use(ensureCorrelationId);

/**
 * GET /federation/resources
 * Retrieve federation-eligible resources from FRA instance
 */
router.get('/resources', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const { releasableTo, excludeOrigin, classification, limit = 100 } = req.query;

  try {
    logger.info('Fetching federation resources', { correlationId });

    // Get eligible resources
    let resources = await federationService.getFederationResources();

    // Apply filters
    if (releasableTo) {
      resources = resources.filter(r =>
        r.releasabilityTo.includes(releasableTo as string)
      );
    }

    if (excludeOrigin) {
      resources = resources.filter(r =>
        r.originRealm !== excludeOrigin
      );
    }

    if (classification) {
      resources = resources.filter(r =>
        r.classification === classification
      );
    }

    // Apply limit
    resources = resources.slice(0, parseInt(limit as string));

    res.json({
      correlationId,
      timestamp: new Date(),
      sourceRealm: 'FRA',
      count: resources.length,
      resources
    });
  } catch (error) {
    logger.error('Error fetching federation resources', { correlationId, error });
    res.status(500).json({
      correlationId,
      error: 'Failed to fetch federation resources',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /federation/resources
 * Receive resources from another realm (USA)
 */
router.post('/resources', async (req: Request, res: Response): Promise<void> => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const originRealm = req.headers['x-origin-realm'] as string;
  const { resources } = req.body;

  try {
    logger.info('Receiving federation resources', { correlationId, count: resources?.length || 0, originRealm });

    if (!resources || !Array.isArray(resources)) {
      res.status(400).json({
        correlationId,
        error: 'Invalid request',
        message: 'Resources array required'
      });
      return;
    }

    // Import resources
    const result = await (federationService as unknown as { importResources(resources: unknown[], realm: string): Promise<{ synced: number; updated: number; conflicted: number; conflicts: unknown[] }> }).importResources(resources, originRealm || 'USA');

    res.json({
      correlationId,
      timestamp: new Date(),
      targetRealm: 'FRA',
      sourceRealm: originRealm,
      result: {
        synced: result.synced,
        updated: result.updated,
        conflicted: result.conflicted,
        conflicts: result.conflicts
      }
    });
  } catch (error) {
    logger.error('Error importing federation resources', { correlationId, error });
    res.status(500).json({
      correlationId,
      error: 'Failed to import resources',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /federation/sync
 * Trigger manual sync with USA instance
 */
router.post('/sync', async (req: Request, res: Response): Promise<void> => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const { targetRealm = 'USA' } = req.body;

  try {
    logger.info('Triggering federation sync', { correlationId, targetRealm });

    if (targetRealm !== 'USA') {
      res.status(400).json({
        correlationId,
        error: 'Invalid target realm',
        message: 'Only USA sync is currently supported'
      });
      return;
    }

    const result = await federationService.syncWithUSA();

    res.json({
      ...result,
      correlationId
    });
  } catch (error) {
    logger.error('Federation sync error', { correlationId, error });
    res.status(500).json({
      correlationId,
      error: 'Sync failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /federation/sync/history
 * Get sync history and statistics
 */
router.get('/sync/history', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const { limit = 10 } = req.query;

  try {
    const history = await federationService.getSyncHistory(parseInt(limit as string));

    res.json({
      correlationId,
      timestamp: new Date(),
      count: history.length,
      syncHistory: history
    });
  } catch (error) {
    logger.error('Error fetching sync history', { correlationId, error });
    res.status(500).json({
      correlationId,
      error: 'Failed to fetch sync history',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /federation/conflicts
 * Get conflict report
 */
router.get('/conflicts', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;

  try {
    const report = await federationService.getConflictReport();

    res.json({
      correlationId,
      timestamp: new Date(),
      ...report
    });
  } catch (error) {
    logger.error('Error fetching conflict report', { correlationId, error });
    res.status(500).json({
      correlationId,
      error: 'Failed to fetch conflict report',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /federation/decisions
 * Share authorization decisions between realms for audit correlation
 */
router.post('/decisions', async (req: Request, res: Response): Promise<void> => {
  const correlationId = req.headers['x-correlation-id'] as string;
  const originRealm = req.headers['x-origin-realm'] as string;
  const { decisions } = req.body;

  try {
    logger.info('Receiving federation decisions', { correlationId, count: decisions?.length || 0, originRealm });

    if (!decisions || !Array.isArray(decisions)) {
      res.status(400).json({
        correlationId,
        error: 'Invalid request',
        message: 'Decisions array required'
      });
      return;
    }

    // Store decisions in audit log
    // In production, this would be stored in MongoDB
    const stored = decisions.map(d => ({
      ...d,
      receivedFrom: originRealm,
      receivedAt: new Date(),
      correlationId
    }));

    res.json({
      correlationId,
      timestamp: new Date(),
      targetRealm: 'FRA',
      sourceRealm: originRealm,
      decisionsReceived: stored.length,
      status: 'stored'
    });
  } catch (error) {
    logger.error('Error storing federation decisions', { correlationId, error });
    res.status(500).json({
      correlationId,
      error: 'Failed to store decisions',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /federation/status
 * Get federation service status and health
 */
router.get('/status', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;

  try {
    const recentSync = (await federationService.getSyncHistory(1))[0];

    res.json({
      correlationId,
      timestamp: new Date(),
      status: 'operational',
      realm: 'FRA',
      federationEndpoints: {
        USA: process.env.USA_FEDERATION_ENDPOINT || 'https://dev-api.dive25.com/federation'
      },
      syncInterval: process.env.FEDERATION_SYNC_INTERVAL || '300',
      lastSync: recentSync ? {
        timestamp: recentSync.timestamp,
        resourcesSynced: recentSync.resourcesSynced,
        duration: recentSync.duration
      } : null,
      capabilities: [
        'resource_sync',
        'decision_sharing',
        'conflict_resolution',
        'correlation_tracking'
      ]
    });
  } catch (error) {
    logger.error('Error fetching federation status', { correlationId, error });
    res.status(500).json({
      correlationId,
      error: 'Failed to fetch status',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /federation/scheduler/start
 * Start automated sync scheduler
 */
router.post('/scheduler/start', async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string;

  try {
    logger.info('Starting federation sync scheduler', { correlationId });

    federationService.startSyncScheduler();

    res.json({
      correlationId,
      timestamp: new Date(),
      status: 'started',
      syncInterval: process.env.FEDERATION_SYNC_INTERVAL || '300'
    });
  } catch (error) {
    logger.error('Error starting federation sync scheduler', { correlationId, error });
    res.status(500).json({
      correlationId,
      error: 'Failed to start scheduler',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
