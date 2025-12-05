/**
 * Spoke Management API Routes
 * 
 * Provides REST endpoints for spoke operations including:
 * - Failover/circuit breaker management
 * - Maintenance mode control
 * - Audit queue status and operations
 * - Sync and heartbeat triggers
 * 
 * @module routes/spoke
 */

import { Router, Request, Response } from 'express';
import { spokeFailover } from '../services/spoke-failover.service';
import { spokeAuditQueue } from '../services/spoke-audit-queue.service';
import { spokeMetrics } from '../services/spoke-metrics.service';
import { spokeConnectivity } from '../services/spoke-connectivity.service';
import { spokeRuntime } from '../services/spoke-runtime.service';
import { spokeHeartbeat } from '../services/spoke-heartbeat.service';
import { spokePolicyCache } from '../services/spoke-policy-cache.service';
import { logger } from '../utils/logger';

const router = Router();

// =============================================================================
// FAILOVER ENDPOINTS
// =============================================================================

/**
 * GET /api/spoke/failover/status
 * Returns the current circuit breaker state and metrics
 */
router.get('/failover/status', async (_req: Request, res: Response) => {
  try {
    const state = spokeFailover.getState();
    const circuitState = spokeFailover.getCircuitState();
    const metrics = spokeFailover.getMetrics();
    const isMaintenanceMode = spokeFailover.isInMaintenanceMode();
    const maintenanceReason = (spokeFailover as any)._maintenanceReason || '';
    const maintenanceEnteredAt = (spokeFailover as any)._maintenanceEnteredAt || null;
    
    // Get connection health from connectivity service if available
    let hubHealthy = false;
    let opalHealthy = false;
    try {
      const connectivity = spokeConnectivity.getState();
      hubHealthy = connectivity.hubReachable;
      opalHealthy = connectivity.opalConnected;
    } catch (_e) {
      // Connectivity service might not be initialized
    }
    
    res.json({
      success: true,
      state: circuitState,
      fullState: state,
      hubHealthy,
      opalHealthy,
      isInMaintenanceMode: isMaintenanceMode,
      maintenanceReason,
      maintenanceEnteredAt,
      ...metrics
    });
  } catch (error) {
    logger.error('Failed to get failover status', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get failover status'
    });
  }
});

/**
 * POST /api/spoke/failover/force
 * Forces the circuit breaker to a specific state
 */
router.post('/failover/force', async (req: Request, res: Response): Promise<void> => {
  try {
    const { state } = req.body;
    
    if (!state || !['OPEN', 'CLOSED', 'HALF_OPEN'].includes(state.toUpperCase())) {
      res.status(400).json({
        success: false,
        error: 'Invalid state. Must be OPEN, CLOSED, or HALF_OPEN'
      });
      return;
    }
    
    const targetState = state.toUpperCase();
    
    // Use the public force methods
    if (targetState === 'OPEN') {
      spokeFailover.forceOpen('Manual force via API');
    } else if (targetState === 'CLOSED') {
      spokeFailover.forceClose();
    } else {
      // For HALF_OPEN, use internal method
      (spokeFailover as any).transitionState('HALF_OPEN');
    }
    
    logger.info('Circuit breaker state forced', { targetState });
    
    res.json({
      success: true,
      message: `Circuit breaker forced to ${targetState}`,
      state: spokeFailover.getCircuitState()
    });
  } catch (error) {
    logger.error('Failed to force circuit breaker state', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to force circuit breaker state'
    });
  }
});

/**
 * POST /api/spoke/failover/reset
 * Resets circuit breaker metrics and returns to CLOSED state
 */
router.post('/failover/reset', async (_req: Request, res: Response) => {
  try {
    // Use the reset method
    spokeFailover.reset();
    
    logger.info('Circuit breaker reset');
    
    res.json({
      success: true,
      message: 'Circuit breaker reset to CLOSED with metrics cleared',
      state: spokeFailover.getCircuitState()
    });
  } catch (error) {
    logger.error('Failed to reset circuit breaker', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to reset circuit breaker'
    });
  }
});

// =============================================================================
// MAINTENANCE MODE ENDPOINTS
// =============================================================================

/**
 * POST /api/spoke/maintenance/enter
 * Enters maintenance mode
 */
router.post('/maintenance/enter', async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    
    spokeFailover.enterMaintenanceMode(reason || 'Manual maintenance');
    
    // Store additional metadata
    (spokeFailover as any)._maintenanceReason = reason || 'Manual maintenance';
    (spokeFailover as any)._maintenanceEnteredAt = new Date().toISOString();
    
    logger.info('Entered maintenance mode', { reason });
    
    res.json({
      success: true,
      message: 'Entered maintenance mode',
      reason: reason || 'Manual maintenance'
    });
  } catch (error) {
    logger.error('Failed to enter maintenance mode', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to enter maintenance mode'
    });
  }
});

/**
 * POST /api/spoke/maintenance/exit
 * Exits maintenance mode
 */
router.post('/maintenance/exit', async (_req: Request, res: Response) => {
  try {
    spokeFailover.exitMaintenanceMode();
    
    // Clear metadata
    (spokeFailover as any)._maintenanceReason = '';
    (spokeFailover as any)._maintenanceEnteredAt = null;
    
    logger.info('Exited maintenance mode');
    
    res.json({
      success: true,
      message: 'Exited maintenance mode'
    });
  } catch (error) {
    logger.error('Failed to exit maintenance mode', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to exit maintenance mode'
    });
  }
});

// =============================================================================
// AUDIT QUEUE ENDPOINTS
// =============================================================================

/**
 * GET /api/spoke/audit/status
 * Returns audit queue status and metrics
 */
router.get('/audit/status', async (_req: Request, res: Response) => {
  try {
    const queueSize = spokeAuditQueue.getQueueSize();
    const state = spokeAuditQueue.getState();
    const metrics = spokeAuditQueue.getMetrics();
    
    res.json({
      success: true,
      queueSize,
      state,
      ...metrics
    });
  } catch (error) {
    logger.error('Failed to get audit status', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get audit status'
    });
  }
});

/**
 * POST /api/spoke/audit/sync
 * Forces immediate sync of audit queue to Hub
 */
router.post('/audit/sync', async (_req: Request, res: Response) => {
  try {
    const result = await spokeAuditQueue.syncToHub();
    
    logger.info('Audit queue sync triggered', { result });
    
    res.json({
      success: true,
      message: 'Audit sync completed',
      result
    });
  } catch (error) {
    logger.error('Failed to sync audit queue', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to sync audit queue'
    });
  }
});

/**
 * POST /api/spoke/audit/clear
 * Clears the audit queue (use with caution!)
 * Note: This removes all pending audit entries without syncing
 */
router.post('/audit/clear', async (req: Request, res: Response): Promise<void> => {
  try {
    const { confirm } = req.body;
    
    if (confirm !== 'yes') {
      res.status(400).json({
        success: false,
        error: 'Must confirm clear with { "confirm": "yes" }'
      });
      return;
    }
    
    // Use internal clear method if available
    if (typeof (spokeAuditQueue as any).clear === 'function') {
      (spokeAuditQueue as any).clear();
    } else {
      // Re-initialize to clear queue
      await spokeAuditQueue.initialize({});
    }
    
    logger.warn('Audit queue cleared');
    
    res.json({
      success: true,
      message: 'Audit queue cleared'
    });
  } catch (error) {
    logger.error('Failed to clear audit queue', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to clear audit queue'
    });
  }
});

// =============================================================================
// SYNC & HEARTBEAT ENDPOINTS
// =============================================================================

/**
 * POST /api/spoke/sync
 * Triggers immediate policy sync
 */
router.post('/sync', async (_req: Request, res: Response) => {
  try {
    // Attempt to reload from cache (which triggers sync if needed)
    const loaded = await spokePolicyCache.loadFromCache();
    
    logger.info('Policy sync triggered', { loaded });
    
    res.json({
      success: true,
      message: loaded ? 'Policy cache reloaded' : 'No cached policy found',
      cacheState: spokePolicyCache.getCacheState()
    });
  } catch (error) {
    logger.error('Failed to sync policies', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to sync policies'
    });
  }
});

/**
 * POST /api/spoke/heartbeat
 * Sends immediate heartbeat to Hub
 */
router.post('/heartbeat', async (_req: Request, res: Response) => {
  try {
    const result = await spokeHeartbeat.sendHeartbeat();
    
    res.json({
      success: true,
      message: 'Heartbeat sent',
      result
    });
  } catch (error) {
    logger.error('Failed to send heartbeat', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to send heartbeat'
    });
  }
});

// =============================================================================
// METRICS & STATUS ENDPOINTS
// =============================================================================

/**
 * GET /api/spoke/metrics
 * Returns Prometheus-formatted metrics
 */
router.get('/metrics', async (_req: Request, res: Response) => {
  try {
    const metrics = spokeMetrics.exportPrometheus();
    res.contentType('text/plain');
    res.send(metrics);
  } catch (error) {
    logger.error('Failed to get metrics', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get metrics'
    });
  }
});

/**
 * GET /api/spoke/health-score
 * Returns calculated health score
 */
router.get('/health-score', async (_req: Request, res: Response) => {
  try {
    const healthScore = spokeMetrics.calculateHealthScore();
    
    res.json({
      success: true,
      ...healthScore
    });
  } catch (error) {
    logger.error('Failed to calculate health score', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to calculate health score'
    });
  }
});

/**
 * GET /api/spoke/status
 * Returns comprehensive spoke status
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const runtime = spokeRuntime.getState();
    const failoverState = spokeFailover.getState();
    const circuitState = spokeFailover.getCircuitState();
    const failoverMetrics = spokeFailover.getMetrics();
    const auditQueueSize = spokeAuditQueue.getQueueSize();
    const healthScore = spokeMetrics.calculateHealthScore();
    
    let connectivityStatus: { hubReachable: boolean; opalConnected: boolean } = { hubReachable: false, opalConnected: false };
    try {
      const state = spokeConnectivity.getState();
      connectivityStatus = { hubReachable: state.hubReachable, opalConnected: state.opalConnected };
    } catch (_e) {
      // Service might not be initialized
    }
    
    res.json({
      success: true,
      runtime,
      connectivity: connectivityStatus,
      failover: {
        state: circuitState,
        fullState: failoverState,
        metrics: failoverMetrics
      },
      auditQueue: {
        size: auditQueueSize
      },
      health: healthScore
    });
  } catch (error) {
    logger.error('Failed to get spoke status', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get spoke status'
    });
  }
});

export default router;
