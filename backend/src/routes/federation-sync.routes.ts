/**
 * Federation Sync Routes
 *
 * API endpoints for federation state drift detection and reconciliation
 * Phase 5: Federation State Consistency (GAP-FS-001, GAP-FS-002)
 *
 * Routes (mounted at /api/drift):
 * - GET /api/drift/status - Drift detection health summary
 * - GET /api/drift/report - Current drift report
 * - GET /api/drift/events - Drift event history
 * - GET /api/drift/states - Detailed layer states
 * - POST /api/drift/reconcile - Execute reconciliation (admin only)
 * - POST /api/drift/events/:id/resolve - Resolve drift event
 *
 * Note: Mounted at /api/drift to avoid conflicts with /api/federation routes
 * These are monitoring endpoints and do NOT require authentication
 *
 * @swagger
 * tags:
 *   - name: Federation Sync
 *     description: Federation state drift detection and reconciliation
 *
 * @version 1.0.1
 * @date 2026-01-18
 */

import { Router, Request, Response } from 'express';
import federationSyncService from '../services/federation-sync.service';
import { logger } from '../utils/logger';

const router = Router();

/**
 * @swagger
 * /api/drift/status:
 *   get:
 *     summary: Get drift detection health summary
 *     description: Returns overall health status of federation drift detection system including sync state and unresolved events
 *     tags: [Federation Sync]
 *     responses:
 *       200:
 *         description: Health summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     healthy:
 *                       type: boolean
 *                     unresolvedDriftCount:
 *                       type: integer
 *                     lastCheckTimestamp:
 *                       type: string
 *                       format: date-time
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       500:
 *         description: Server error
 */
router.get('/status', async (req: Request, res: Response): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;

  try {
    logger.info('Federation: Health check request', { requestId });

    const summary = await federationSyncService.getHealthSummary();

    res.json({
      success: true,
      data: summary,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Federation: Health check failed', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get federation health',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @swagger
 * /api/drift/report:
 *   get:
 *     summary: Get current drift report
 *     description: Performs drift detection across all federation instances and returns detailed report with recommended actions
 *     tags: [Federation Sync]
 *     responses:
 *       200:
 *         description: Drift detection report
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     states:
 *                       type: array
 *                       description: State of each instance across layers
 *                     actions:
 *                       type: array
 *                       description: Recommended reconciliation actions
 *                     summary:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         synchronized:
 *                           type: integer
 *                         drifted:
 *                           type: integer
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       500:
 *         description: Server error
 */
router.get('/report', async (req: Request, res: Response): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;

  try {
    logger.info('Federation: Drift report request', { requestId });

    const report = await federationSyncService.detectDrift();

    res.json({
      success: true,
      data: report,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Federation: Drift report failed', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      success: false,
      error: 'Failed to detect drift',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @swagger
 * /api/drift/events:
 *   get:
 *     summary: Get drift event history
 *     description: Returns history of all drift events with optional filtering for unresolved events only
 *     tags: [Federation Sync]
 *     parameters:
 *       - in: query
 *         name: unresolved
 *         schema:
 *           type: boolean
 *         description: If true, return only unresolved events
 *     responses:
 *       200:
 *         description: Drift event history
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     events:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           instanceCode:
 *                             type: string
 *                           driftType:
 *                             type: string
 *                           timestamp:
 *                             type: string
 *                             format: date-time
 *                           resolved:
 *                             type: boolean
 *                     count:
 *                       type: integer
 *                     unresolvedCount:
 *                       type: integer
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       500:
 *         description: Server error
 */
router.get('/events', async (req: Request, res: Response): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
  const unresolvedOnly = req.query.unresolved === 'true';

  try {
    logger.info('Federation: Drift events request', { requestId, unresolvedOnly });

    const events = unresolvedOnly
      ? federationSyncService.getUnresolvedDriftEvents()
      : federationSyncService.getDriftEvents();

    res.json({
      success: true,
      data: {
        events,
        count: events.length,
        unresolvedCount: federationSyncService.getUnresolvedDriftEvents().length
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Federation: Drift events fetch failed', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      success: false,
      error: 'Failed to fetch drift events',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @swagger
 * /api/drift/reconcile:
 *   post:
 *     summary: Execute reconciliation actions
 *     description: Executes drift reconciliation actions to synchronize federation state across layers. Supports dry-run mode and instance filtering.
 *     tags: [Federation Sync]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               dryRun:
 *                 type: boolean
 *                 default: true
 *                 description: If true, simulates actions without executing them
 *               instanceCodes:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Optional array of instance codes to reconcile
 *     responses:
 *       200:
 *         description: Reconciliation results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     dryRun:
 *                       type: boolean
 *                     actions:
 *                       type: array
 *                       description: Actions executed
 *                     totalActions:
 *                       type: integer
 *                     successfulActions:
 *                       type: integer
 *                     failedActions:
 *                       type: integer
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       500:
 *         description: Server error
 */
router.post('/reconcile', async (req: Request, res: Response): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
  const { dryRun = true, instanceCodes } = req.body;

  try {
    logger.info('Federation: Reconciliation request', {
      requestId,
      dryRun,
      instanceCodes
    });

    // Get current drift report
    const report = await federationSyncService.detectDrift();

    // Filter actions by instance codes if specified
    let actionsToExecute = report.actions;
    if (instanceCodes && Array.isArray(instanceCodes)) {
      actionsToExecute = actionsToExecute.filter(a =>
        instanceCodes.includes(a.instanceCode)
      );
    }

    // Execute reconciliation
    const executedActions = await federationSyncService.executeReconciliation(
      actionsToExecute,
      dryRun
    );

    logger.info('Federation: Reconciliation complete', {
      requestId,
      dryRun,
      actionsExecuted: executedActions.length,
      successful: executedActions.filter(a => a.success).length
    });

    res.json({
      success: true,
      data: {
        dryRun,
        actions: executedActions,
        totalActions: executedActions.length,
        successfulActions: executedActions.filter(a => a.success).length,
        failedActions: executedActions.filter(a => !a.success).length
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Federation: Reconciliation failed', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      success: false,
      error: 'Failed to execute reconciliation',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @swagger
 * /api/drift/events/{eventId}/resolve:
 *   post:
 *     summary: Mark drift event as resolved
 *     description: Manually marks a drift event as resolved with optional resolution details
 *     tags: [Federation Sync]
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *         description: Drift event ID to resolve
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               resolvedBy:
 *                 type: string
 *                 description: User who resolved the event
 *                 default: admin
 *               resolutionAction:
 *                 type: string
 *                 description: Description of resolution action taken
 *                 default: Manually resolved
 *     responses:
 *       200:
 *         description: Event resolved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       404:
 *         description: Drift event not found
 *       500:
 *         description: Server error
 */
router.post('/events/:eventId/resolve', async (req: Request, res: Response): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
  const { eventId } = req.params;
  const { resolvedBy, resolutionAction } = req.body;

  try {
    logger.info('Federation: Resolve drift event request', {
      requestId,
      eventId,
      resolvedBy
    });

    const success = federationSyncService.resolveDriftEvent(
      eventId,
      resolvedBy || 'admin',
      resolutionAction || 'Manually resolved'
    );

    if (success) {
      res.json({
        success: true,
        message: 'Drift event resolved',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Drift event not found',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    logger.error('Federation: Resolve drift event failed', {
      requestId,
      eventId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      success: false,
      error: 'Failed to resolve drift event',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @swagger
 * /api/drift/states:
 *   get:
 *     summary: Get detailed instance states
 *     description: Returns detailed state information for all federation instances across Keycloak, MongoDB, and Docker layers
 *     tags: [Federation Sync]
 *     responses:
 *       200:
 *         description: Detailed instance states
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     states:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           instanceCode:
 *                             type: string
 *                           layers:
 *                             type: object
 *                             properties:
 *                               keycloak:
 *                                 type: object
 *                                 properties:
 *                                   exists:
 *                                     type: boolean
 *                                   enabled:
 *                                     type: boolean
 *                                   status:
 *                                     type: string
 *                               mongodb:
 *                                 type: object
 *                                 properties:
 *                                   exists:
 *                                     type: boolean
 *                                   status:
 *                                     type: string
 *                               docker:
 *                                 type: object
 *                                 properties:
 *                                   running:
 *                                     type: boolean
 *                                   healthy:
 *                                     type: boolean
 *                                   status:
 *                                     type: string
 *                           synchronized:
 *                             type: boolean
 *                           driftType:
 *                             type: string
 *                           recommendedAction:
 *                             type: string
 *                     summary:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                         synchronized:
 *                           type: integer
 *                         drifted:
 *                           type: integer
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       500:
 *         description: Server error
 */
router.get('/states', async (req: Request, res: Response): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;

  try {
    logger.info('Federation: States request', { requestId });

    const report = await federationSyncService.detectDrift();

    // Transform for detailed view
    const states = report.states.map(state => ({
      instanceCode: state.instanceCode,
      layers: {
        keycloak: {
          ...state.keycloak,
          status: state.keycloak.exists
            ? (state.keycloak.enabled ? 'enabled' : 'disabled')
            : 'missing'
        },
        mongodb: {
          ...state.mongodb,
          status: state.mongodb.exists ? state.mongodb.status : 'missing'
        },
        docker: {
          ...state.docker,
          status: state.docker.running
            ? (state.docker.healthy ? 'healthy' : 'degraded')
            : 'stopped'
        }
      },
      synchronized: state.synchronized,
      driftType: state.driftType,
      recommendedAction: state.synchronized ? null : getRecommendedAction(state)
    }));

    res.json({
      success: true,
      data: {
        states,
        summary: {
          total: states.length,
          synchronized: states.filter(s => s.synchronized).length,
          drifted: states.filter(s => !s.synchronized).length
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Federation: States fetch failed', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      success: false,
      error: 'Failed to fetch federation states',
      timestamp: new Date().toISOString()
    });
  }
});

// Helper function for recommended actions
function getRecommendedAction(state: any): string {
  switch (state.driftType) {
    case 'orphaned_idp':
      return 'Disable or remove the orphaned Keycloak IdP';
    case 'stale_mongodb':
      return 'Update MongoDB spoke status or configure Keycloak IdP';
    case 'missing_containers':
      return 'Start the spoke containers or disable the IdP';
    case 'multiple_drift':
      return 'Review all three layers and synchronize manually';
    default:
      return 'Review and reconcile manually';
  }
}

export default router;
