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

// In-memory event stores (would be persisted to MongoDB in production)
const failoverEvents: IFailoverEvent[] = [];
const maintenanceHistory: IMaintenanceEvent[] = [];

interface IFailoverEvent {
  id: string;
  timestamp: string;
  previousState: 'CLOSED' | 'HALF_OPEN' | 'OPEN';
  newState: 'CLOSED' | 'HALF_OPEN' | 'OPEN';
  reason: string;
  triggeredBy: 'automatic' | 'manual' | 'hub';
  duration?: number;
}

interface IMaintenanceEvent {
  id: string;
  enteredAt: string;
  exitedAt?: string;
  reason: string;
  duration?: number;
  exitReason?: string;
}

// Track current maintenance session for history
let currentMaintenanceSession: IMaintenanceEvent | null = null;

// Subscribe to failover events
spokeFailover.on('circuitOpened', (data) => {
  const event: IFailoverEvent = {
    id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: data.timestamp.toISOString(),
    previousState: 'CLOSED',
    newState: 'OPEN',
    reason: `Circuit opened after ${data.failures} consecutive failures`,
    triggeredBy: 'automatic',
  };
  failoverEvents.unshift(event);
  if (failoverEvents.length > 100) failoverEvents.pop();
});

spokeFailover.on('circuitHalfOpen', (data) => {
  const event: IFailoverEvent = {
    id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: data.timestamp.toISOString(),
    previousState: 'OPEN',
    newState: 'HALF_OPEN',
    reason: `Recovery probe initiated (attempt ${data.recoveryAttempts})`,
    triggeredBy: 'automatic',
  };
  failoverEvents.unshift(event);
  if (failoverEvents.length > 100) failoverEvents.pop();
});

spokeFailover.on('circuitClosed', (data) => {
  const event: IFailoverEvent = {
    id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: data.timestamp.toISOString(),
    previousState: 'HALF_OPEN',
    newState: 'CLOSED',
    reason: 'Circuit recovered successfully',
    triggeredBy: 'automatic',
    duration: data.outageMs,
  };
  failoverEvents.unshift(event);
  if (failoverEvents.length > 100) failoverEvents.pop();
});

spokeFailover.on('forceClosed', (data) => {
  const event: IFailoverEvent = {
    id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: data.timestamp.toISOString(),
    previousState: spokeFailover.getCircuitState().toUpperCase() as 'CLOSED' | 'HALF_OPEN' | 'OPEN',
    newState: 'CLOSED',
    reason: 'Manual force close',
    triggeredBy: 'manual',
  };
  failoverEvents.unshift(event);
  if (failoverEvents.length > 100) failoverEvents.pop();
});

spokeFailover.on('forceOpened', (data) => {
  const event: IFailoverEvent = {
    id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: data.timestamp.toISOString(),
    previousState: spokeFailover.getCircuitState().toUpperCase() as 'CLOSED' | 'HALF_OPEN' | 'OPEN',
    newState: 'OPEN',
    reason: data.reason || 'Manual force open',
    triggeredBy: 'manual',
  };
  failoverEvents.unshift(event);
  if (failoverEvents.length > 100) failoverEvents.pop();
});

spokeFailover.on('maintenanceStarted', (data) => {
  currentMaintenanceSession = {
    id: `maint-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    enteredAt: data.timestamp.toISOString(),
    reason: data.reason,
  };
});

spokeFailover.on('maintenanceEnded', (data) => {
  if (currentMaintenanceSession) {
    const enteredAt = new Date(currentMaintenanceSession.enteredAt);
    const exitedAt = data.timestamp;
    currentMaintenanceSession.exitedAt = exitedAt.toISOString();
    currentMaintenanceSession.duration = exitedAt.getTime() - enteredAt.getTime();
    currentMaintenanceSession.exitReason = 'Manual exit';
    maintenanceHistory.unshift(currentMaintenanceSession);
    if (maintenanceHistory.length > 50) maintenanceHistory.pop();
    currentMaintenanceSession = null;
  }
});

/**
 * GET /api/spoke/failover/events
 * Returns failover event history
 */
router.get('/failover/events', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const state = req.query.state as string;
    
    let filteredEvents = [...failoverEvents];
    
    // Filter by state if provided
    if (state && ['CLOSED', 'HALF_OPEN', 'OPEN'].includes(state.toUpperCase())) {
      filteredEvents = filteredEvents.filter(
        e => e.newState === state.toUpperCase() || e.previousState === state.toUpperCase()
      );
    }
    
    const paginatedEvents = filteredEvents.slice(offset, offset + limit);
    
    res.json({
      success: true,
      events: paginatedEvents,
      total: filteredEvents.length,
      limit,
      offset,
    });
  } catch (error) {
    logger.error('Failed to get failover events', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get failover events'
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

/**
 * GET /api/spoke/maintenance/history
 * Returns maintenance mode history
 */
router.get('/maintenance/history', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = parseInt(req.query.offset as string) || 0;
    
    const paginatedHistory = maintenanceHistory.slice(offset, offset + limit);
    
    // Include current maintenance session if active
    const currentSession = currentMaintenanceSession ? {
      ...currentMaintenanceSession,
      duration: Date.now() - new Date(currentMaintenanceSession.enteredAt).getTime(),
    } : null;
    
    res.json({
      success: true,
      history: paginatedHistory,
      currentSession,
      total: maintenanceHistory.length,
      limit,
      offset,
    });
  } catch (error) {
    logger.error('Failed to get maintenance history', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get maintenance history'
    });
  }
});

/**
 * GET /api/spoke/maintenance/status
 * Returns current maintenance mode status
 */
router.get('/maintenance/status', async (_req: Request, res: Response) => {
  try {
    const isInMaintenanceMode = spokeFailover.isInMaintenanceMode();
    const maintenanceReason = (spokeFailover as any)._maintenanceReason || '';
    const maintenanceEnteredAt = (spokeFailover as any)._maintenanceEnteredAt || null;
    
    res.json({
      success: true,
      isInMaintenanceMode,
      maintenanceReason,
      maintenanceEnteredAt,
      currentSession: currentMaintenanceSession,
    });
  } catch (error) {
    logger.error('Failed to get maintenance status', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get maintenance status'
    });
  }
});

// =============================================================================
// AUDIT QUEUE ENDPOINTS
// =============================================================================

// In-memory audit event history (would be persisted to MongoDB in production)
interface IAuditHistoryEvent {
  id: string;
  timestamp: string;
  type: 'sync_success' | 'sync_failed' | 'sync_partial' | 'queue_cleared' | 'queue_overflow' | 'connection_lost' | 'connection_restored';
  eventCount?: number;
  duration?: number;
  bytesTransferred?: number;
  error?: string;
  hubResponse?: {
    status: number;
    message?: string;
  };
}

const auditHistory: IAuditHistoryEvent[] = [];

// Subscribe to audit queue events for history
spokeAuditQueue.on('syncComplete', (data: { count: number; durationMs: number; bytesTransferred?: number }) => {
  const event: IAuditHistoryEvent = {
    id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    type: 'sync_success',
    eventCount: data.count,
    duration: data.durationMs,
    bytesTransferred: data.bytesTransferred,
  };
  auditHistory.unshift(event);
  if (auditHistory.length > 200) auditHistory.pop();
});

spokeAuditQueue.on('syncFailed', (data: { error: string; durationMs?: number }) => {
  const event: IAuditHistoryEvent = {
    id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    type: 'sync_failed',
    error: data.error,
    duration: data.durationMs,
  };
  auditHistory.unshift(event);
  if (auditHistory.length > 200) auditHistory.pop();
});

spokeAuditQueue.on('queueCleared', () => {
  const event: IAuditHistoryEvent = {
    id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    type: 'queue_cleared',
  };
  auditHistory.unshift(event);
  if (auditHistory.length > 200) auditHistory.pop();
});

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

/**
 * GET /api/spoke/audit/history
 * Returns audit sync event history
 */
router.get('/audit/history', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;
    const typeFilter = req.query.type as string;
    
    let filteredHistory = [...auditHistory];
    
    // Filter by type if provided
    if (typeFilter && ['sync_success', 'sync_failed', 'sync_partial', 'queue_cleared', 'queue_overflow', 'connection_lost', 'connection_restored'].includes(typeFilter)) {
      filteredHistory = filteredHistory.filter(e => e.type === typeFilter);
    }
    
    const paginatedHistory = filteredHistory.slice(offset, offset + limit);
    
    // Calculate summary statistics
    const successfulSyncs = auditHistory.filter(e => e.type === 'sync_success').length;
    const failedSyncs = auditHistory.filter(e => e.type === 'sync_failed').length;
    const totalEventsProcessed = auditHistory
      .filter(e => e.type === 'sync_success')
      .reduce((sum, e) => sum + (e.eventCount || 0), 0);
    
    const lastSuccessfulSync = auditHistory.find(e => e.type === 'sync_success')?.timestamp;
    const lastFailedSync = auditHistory.find(e => e.type === 'sync_failed')?.timestamp;
    
    res.json({
      success: true,
      events: paginatedHistory,
      total: filteredHistory.length,
      limit,
      offset,
      summary: {
        totalSyncs: successfulSyncs + failedSyncs,
        successfulSyncs,
        failedSyncs,
        totalEventsProcessed,
        lastSuccessfulSync,
        lastFailedSync,
      },
    });
  } catch (error) {
    logger.error('Failed to get audit history', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get audit history'
    });
  }
});

/**
 * GET /api/spoke/audit/export
 * Export audit queue for backup
 */
router.get('/audit/export', async (req: Request, res: Response) => {
  try {
    const format = (req.query.format as string) || 'json';
    const queueSize = spokeAuditQueue.getQueueSize();
    const metrics = spokeAuditQueue.getMetrics();
    
    const exportData = {
      exportedAt: new Date().toISOString(),
      spokeId: process.env.SPOKE_ID || 'local',
      instanceCode: process.env.INSTANCE_CODE || 'USA',
      queueSize,
      metrics,
      history: auditHistory.slice(0, 100),
    };
    
    if (format === 'csv') {
      // Generate CSV from history
      const headers = ['id', 'timestamp', 'type', 'eventCount', 'duration', 'bytesTransferred', 'error'];
      const rows = auditHistory.map(e => [
        e.id,
        e.timestamp,
        e.type,
        e.eventCount || '',
        e.duration || '',
        e.bytesTransferred || '',
        e.error || '',
      ].join(','));
      
      const csv = [headers.join(','), ...rows].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=audit-export-${new Date().toISOString().split('T')[0]}.csv`);
      res.send(csv);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=audit-export-${new Date().toISOString().split('T')[0]}.json`);
      res.json(exportData);
    }
  } catch (error) {
    logger.error('Failed to export audit data', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to export audit data'
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
