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
 * @openapi
 * /api/spoke/failover/status:
 *   get:
 *     summary: Get circuit breaker status
 *     description: |
 *       Returns the current circuit breaker state and metrics for the spoke instance.
 *
 *       Circuit breaker states:
 *       - CLOSED: Normal operation, Hub is reachable
 *       - OPEN: Hub is unreachable, failover mode active
 *       - HALF_OPEN: Testing recovery, probing Hub connectivity
 *
 *       Also returns maintenance mode status and connectivity health.
 *     tags: [Spoke Management]
 *     responses:
 *       200:
 *         description: Circuit breaker status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 state:
 *                   type: string
 *                   enum: [CLOSED, OPEN, HALF_OPEN]
 *                   description: Current circuit breaker state
 *                 fullState:
 *                   type: object
 *                   description: Detailed circuit breaker state
 *                 hubHealthy:
 *                   type: boolean
 *                   description: Whether Hub is reachable
 *                 opalHealthy:
 *                   type: boolean
 *                   description: Whether OPAL connection is active
 *                 isInMaintenanceMode:
 *                   type: boolean
 *                 maintenanceReason:
 *                   type: string
 *                 maintenanceEnteredAt:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *                 consecutiveFailures:
 *                   type: integer
 *                 lastFailureTime:
 *                   type: string
 *                   format: date-time
 *                 totalRequests:
 *                   type: integer
 *                 failedRequests:
 *                   type: integer
 *       500:
 *         description: Failed to get failover status
 */
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
 * @openapi
 * /api/spoke/failover/force:
 *   post:
 *     summary: Force circuit breaker to specific state
 *     description: |
 *       Manually override the circuit breaker state.
 *
 *       Use cases:
 *       - Force OPEN: Immediately enter failover mode for testing or maintenance
 *       - Force CLOSED: Exit failover mode and resume normal operation
 *       - Force HALF_OPEN: Test Hub connectivity recovery
 *
 *       **Caution:** This bypasses automatic failover logic.
 *     tags: [Spoke Management]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - state
 *             properties:
 *               state:
 *                 type: string
 *                 enum: [OPEN, CLOSED, HALF_OPEN]
 *                 description: Target circuit breaker state
 *                 example: 'OPEN'
 *     responses:
 *       200:
 *         description: Circuit breaker state changed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 state:
 *                   type: string
 *                   enum: [CLOSED, OPEN, HALF_OPEN]
 *       400:
 *         description: Invalid state provided
 *       500:
 *         description: Failed to force circuit breaker state
 */
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
 * @openapi
 * /api/spoke/failover/reset:
 *   post:
 *     summary: Reset circuit breaker
 *     description: |
 *       Reset circuit breaker to CLOSED state and clear all metrics.
 *
 *       This:
 *       - Returns circuit to CLOSED state
 *       - Clears failure counters
 *       - Resets outage timers
 *       - Resumes normal Hub communication
 *
 *       Use after resolving Hub connectivity issues.
 *     tags: [Spoke Management]
 *     responses:
 *       200:
 *         description: Circuit breaker reset successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 state:
 *                   type: string
 *                   enum: [CLOSED]
 *       500:
 *         description: Failed to reset circuit breaker
 */
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
 * @openapi
 * /api/spoke/failover/events:
 *   get:
 *     summary: Get failover event history
 *     description: |
 *       Returns historical record of circuit breaker state transitions.
 *
 *       Tracks all failover events including:
 *       - Circuit opened (Hub unreachable)
 *       - Circuit half-open (recovery probes)
 *       - Circuit closed (Hub recovered)
 *       - Manual overrides
 *
 *       Useful for troubleshooting connectivity issues and failover patterns.
 *     tags: [Spoke Management]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *         description: Number of events to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Pagination offset
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *           enum: [CLOSED, OPEN, HALF_OPEN]
 *         description: Filter events by state
 *     responses:
 *       200:
 *         description: Failover event history
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 events:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                       previousState:
 *                         type: string
 *                         enum: [CLOSED, HALF_OPEN, OPEN]
 *                       newState:
 *                         type: string
 *                         enum: [CLOSED, HALF_OPEN, OPEN]
 *                       reason:
 *                         type: string
 *                       triggeredBy:
 *                         type: string
 *                         enum: [automatic, manual, hub]
 *                       duration:
 *                         type: integer
 *                         description: Outage duration in milliseconds (if applicable)
 *                 total:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 offset:
 *                   type: integer
 *       500:
 *         description: Failed to get failover events
 */
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
 * @openapi
 * /api/spoke/maintenance/enter:
 *   post:
 *     summary: Enter maintenance mode
 *     description: |
 *       Put the spoke instance into maintenance mode.
 *
 *       In maintenance mode:
 *       - Circuit breaker remains OPEN
 *       - Hub communication is suspended
 *       - All requests are served from local cache
 *       - Audit events are queued but not synced
 *
 *       Use for planned maintenance, upgrades, or testing.
 *     tags: [Spoke Management]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Reason for entering maintenance mode
 *                 example: 'Planned system upgrade'
 *     responses:
 *       200:
 *         description: Entered maintenance mode
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 reason:
 *                   type: string
 *       500:
 *         description: Failed to enter maintenance mode
 */
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
 * @openapi
 * /api/spoke/maintenance/exit:
 *   post:
 *     summary: Exit maintenance mode
 *     description: |
 *       Exit maintenance mode and resume normal spoke operations.
 *
 *       This:
 *       - Exits maintenance mode
 *       - Resets circuit breaker to CLOSED
 *       - Resumes Hub communication
 *       - Triggers audit queue sync
 *       - Refreshes policy cache
 *     tags: [Spoke Management]
 *     responses:
 *       200:
 *         description: Exited maintenance mode
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       500:
 *         description: Failed to exit maintenance mode
 */
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
 * @openapi
 * /api/spoke/maintenance/history:
 *   get:
 *     summary: Get maintenance mode history
 *     description: |
 *       Returns historical record of maintenance mode sessions.
 *
 *       Tracks:
 *       - When maintenance mode was entered/exited
 *       - Reason for each maintenance session
 *       - Duration of each session
 *       - Current active session (if in maintenance mode)
 *
 *       Useful for compliance auditing and incident tracking.
 *     tags: [Spoke Management]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 50
 *         description: Number of sessions to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Pagination offset
 *     responses:
 *       200:
 *         description: Maintenance history
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 history:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       enteredAt:
 *                         type: string
 *                         format: date-time
 *                       exitedAt:
 *                         type: string
 *                         format: date-time
 *                       reason:
 *                         type: string
 *                       duration:
 *                         type: integer
 *                         description: Session duration in milliseconds
 *                       exitReason:
 *                         type: string
 *                 currentSession:
 *                   type: object
 *                   nullable: true
 *                   description: Active maintenance session (if in maintenance mode)
 *                 total:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 offset:
 *                   type: integer
 *       500:
 *         description: Failed to get maintenance history
 */
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
 * @openapi
 * /api/spoke/maintenance/status:
 *   get:
 *     summary: Get maintenance mode status
 *     description: |
 *       Returns current maintenance mode status.
 *
 *       Indicates whether spoke is in maintenance mode, the reason, and when it was entered.
 *     tags: [Spoke Management]
 *     responses:
 *       200:
 *         description: Maintenance mode status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 isInMaintenanceMode:
 *                   type: boolean
 *                 maintenanceReason:
 *                   type: string
 *                 maintenanceEnteredAt:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *                 currentSession:
 *                   type: object
 *                   nullable: true
 *                   description: Current maintenance session details
 *       500:
 *         description: Failed to get maintenance status
 */
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

/**
 * @openapi
 * /api/spoke/audit/status:
 *   get:
 *     summary: Get audit queue status
 *     description: |
 *       Returns audit queue status and metrics.
 *
 *       The audit queue buffers authorization decisions locally when Hub is unreachable.
 *       When connectivity is restored, queued events sync to Hub for centralized auditing.
 *
 *       Metrics include:
 *       - Current queue size
 *       - Sync success/failure rates
 *       - Last sync timestamp
 *       - Queue health
 *     tags: [Spoke Management]
 *     responses:
 *       200:
 *         description: Audit queue status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 queueSize:
 *                   type: integer
 *                   description: Number of events in queue
 *                 state:
 *                   type: object
 *                   description: Queue operational state
 *                 totalSynced:
 *                   type: integer
 *                 totalFailed:
 *                   type: integer
 *                 lastSyncTime:
 *                   type: string
 *                   format: date-time
 *                 isHealthy:
 *                   type: boolean
 *       500:
 *         description: Failed to get audit status
 */

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
 * @openapi
 * /api/spoke/audit/sync:
 *   post:
 *     summary: Force audit queue sync to Hub
 *     description: |
 *       Immediately sync all queued audit events to Hub.
 *
 *       Normally, the audit queue syncs automatically:
 *       - Every 30 seconds (if queue has events)
 *       - When queue reaches capacity threshold
 *       - When exiting maintenance mode
 *
 *       Use this endpoint to force immediate sync for:
 *       - Urgent audit requirements
 *       - Testing sync functionality
 *       - Manual queue management
 *     tags: [Spoke Management]
 *     responses:
 *       200:
 *         description: Audit sync completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 result:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                     count:
 *                       type: integer
 *                       description: Number of events synced
 *                     duration:
 *                       type: integer
 *                       description: Sync duration in milliseconds
 *       500:
 *         description: Failed to sync audit queue
 */
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
 * @openapi
 * /api/spoke/audit/clear:
 *   post:
 *     summary: Clear audit queue
 *     description: |
 *       **CAUTION:** Clears the entire audit queue without syncing to Hub.
 *
 *       This **permanently deletes** all queued audit events.
 *       Use only in exceptional circumstances:
 *       - Queue corruption recovery
 *       - Testing/development
 *       - Emergency queue reset
 *
 *       **Requires explicit confirmation** with `{ "confirm": "yes" }` in request body.
 *
 *       ⚠️ Data Loss Warning: All unsynced audit events will be lost permanently.
 *     tags: [Spoke Management]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - confirm
 *             properties:
 *               confirm:
 *                 type: string
 *                 enum: ['yes']
 *                 description: Must be "yes" to confirm destructive action
 *     responses:
 *       200:
 *         description: Audit queue cleared
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
 *         description: Missing confirmation
 *       500:
 *         description: Failed to clear audit queue
 */
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
 * @openapi
 * /api/spoke/audit/history:
 *   get:
 *     summary: Get audit sync event history
 *     description: |
 *       Returns historical record of audit queue sync operations.
 *
 *       Tracks:
 *       - Successful syncs (count, duration, bytes transferred)
 *       - Failed syncs (error details)
 *       - Queue clears and overflow events
 *       - Connection status changes
 *
 *       Includes summary statistics for monitoring queue health.
 *     tags: [Spoke Management]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 200
 *         description: Number of events to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Pagination offset
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [sync_success, sync_failed, sync_partial, queue_cleared, queue_overflow, connection_lost, connection_restored]
 *         description: Filter by event type
 *     responses:
 *       200:
 *         description: Audit sync history
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 events:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                       type:
 *                         type: string
 *                       eventCount:
 *                         type: integer
 *                       duration:
 *                         type: integer
 *                       bytesTransferred:
 *                         type: integer
 *                       error:
 *                         type: string
 *                 total:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 offset:
 *                   type: integer
 *                 summary:
 *                   type: object
 *                   properties:
 *                     totalSyncs:
 *                       type: integer
 *                     successfulSyncs:
 *                       type: integer
 *                     failedSyncs:
 *                       type: integer
 *                     totalEventsProcessed:
 *                       type: integer
 *                     lastSuccessfulSync:
 *                       type: string
 *                       format: date-time
 *                     lastFailedSync:
 *                       type: string
 *                       format: date-time
 *       500:
 *         description: Failed to get audit history
 */
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
 * @openapi
 * /api/spoke/audit/export:
 *   get:
 *     summary: Export audit queue data
 *     description: |
 *       Export audit queue data for backup, analysis, or compliance reporting.
 *
 *       Includes:
 *       - Current queue size and metrics
 *       - Sync history (last 100 events)
 *       - Spoke instance information
 *
 *       Supports JSON or CSV format.
 *     tags: [Spoke Management]
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, csv]
 *           default: json
 *         description: Export format
 *     responses:
 *       200:
 *         description: Audit data exported
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 exportedAt:
 *                   type: string
 *                   format: date-time
 *                 spokeId:
 *                   type: string
 *                 instanceCode:
 *                   type: string
 *                 queueSize:
 *                   type: integer
 *                 metrics:
 *                   type: object
 *                 history:
 *                   type: array
 *           text/csv:
 *             schema:
 *               type: string
 *               description: CSV format audit history
 *       500:
 *         description: Failed to export audit data
 */
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
 * @openapi
 * /api/spoke/sync:
 *   post:
 *     summary: Trigger policy sync
 *     description: |
 *       Trigger immediate policy sync from Hub.
 *
 *       This reloads the policy cache which:
 *       - Fetches latest policy bundle from Hub
 *       - Updates local OPA instance
 *       - Refreshes authorization rules
 *
 *       Automatic sync occurs:
 *       - Every 5 minutes (configurable)
 *       - When OPAL pushes updates
 *       - On spoke startup
 *
 *       Use manual sync for:
 *       - Testing policy changes
 *       - Emergency policy updates
 *       - Troubleshooting authorization issues
 *     tags: [Spoke Management]
 *     responses:
 *       200:
 *         description: Policy sync triggered
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 cacheState:
 *                   type: object
 *                   description: Policy cache state after sync
 *       500:
 *         description: Failed to sync policies
 */
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
 * @openapi
 * /api/spoke/heartbeat:
 *   post:
 *     summary: Send heartbeat to Hub
 *     description: |
 *       Send immediate heartbeat to Hub.
 *
 *       Heartbeats communicate spoke health to Hub:
 *       - Spoke instance status
 *       - Policy version
 *       - Resource counts
 *       - Health metrics
 *
 *       Automatic heartbeats occur every 60 seconds.
 *
 *       Use manual heartbeat for:
 *       - Testing Hub connectivity
 *       - Verifying spoke registration
 *       - Troubleshooting Hub-spoke communication
 *     tags: [Spoke Management]
 *     responses:
 *       200:
 *         description: Heartbeat sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 result:
 *                   type: object
 *                   description: Heartbeat response from Hub
 *       500:
 *         description: Failed to send heartbeat
 */
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
 * @openapi
 * /api/spoke/metrics:
 *   get:
 *     summary: Get Prometheus metrics
 *     description: |
 *       Returns metrics in Prometheus format for monitoring and alerting.
 *
 *       Metrics include:
 *       - HTTP request counts and latencies
 *       - Authorization decision counts (allow/deny)
 *       - Circuit breaker state transitions
 *       - Audit queue size
 *       - Policy cache hit rates
 *       - Hub connectivity status
 *
 *       Scraped by Prometheus for monitoring dashboards.
 *     tags: [Spoke Management, Metrics]
 *     responses:
 *       200:
 *         description: Prometheus-formatted metrics
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: |
 *                 # HELP spoke_http_requests_total Total HTTP requests
 *                 # TYPE spoke_http_requests_total counter
 *                 spoke_http_requests_total 12345
 *       500:
 *         description: Failed to get metrics
 */
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
 * @openapi
 * /api/spoke/health-score:
 *   get:
 *     summary: Get spoke health score
 *     description: |
 *       Returns calculated health score for the spoke instance.
 *
 *       Health score (0-100) is calculated from:
 *       - Hub connectivity (30%)
 *       - OPAL connectivity (20%)
 *       - Circuit breaker state (20%)
 *       - Audit queue health (15%)
 *       - Authorization success rate (15%)
 *
 *       Thresholds:
 *       - 90-100: Healthy (green)
 *       - 70-89: Warning (yellow)
 *       - Below 70: Critical (red)
 *     tags: [Spoke Management]
 *     responses:
 *       200:
 *         description: Health score calculated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 overallScore:
 *                   type: number
 *                   description: Health score (0-100)
 *                   example: 87.5
 *                 status:
 *                   type: string
 *                   enum: [healthy, warning, critical]
 *                 components:
 *                   type: object
 *                   properties:
 *                     hubConnectivity:
 *                       type: number
 *                     opalConnectivity:
 *                       type: number
 *                     circuitBreaker:
 *                       type: number
 *                     auditQueue:
 *                       type: number
 *                     authorization:
 *                       type: number
 *                 recommendations:
 *                   type: array
 *                   items:
 *                     type: string
 *       500:
 *         description: Failed to calculate health score
 */
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
 * @openapi
 * /api/spoke/status:
 *   get:
 *     summary: Get comprehensive spoke status
 *     description: |
 *       Returns complete spoke instance status including all subsystems.
 *
 *       Provides a single endpoint for comprehensive spoke diagnostics:
 *       - Runtime information (uptime, version, environment)
 *       - Connectivity status (Hub, OPAL)
 *       - Failover/circuit breaker state
 *       - Audit queue status
 *       - Health score
 *
 *       Useful for:
 *       - Health checks
 *       - Troubleshooting
 *       - Monitoring dashboards
 *       - Incident response
 *     tags: [Spoke Management]
 *     responses:
 *       200:
 *         description: Comprehensive spoke status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 runtime:
 *                   type: object
 *                   properties:
 *                     spokeId:
 *                       type: string
 *                     instanceCode:
 *                       type: string
 *                     version:
 *                       type: string
 *                     uptime:
 *                       type: integer
 *                       description: Uptime in seconds
 *                     startedAt:
 *                       type: string
 *                       format: date-time
 *                 connectivity:
 *                   type: object
 *                   properties:
 *                     hubReachable:
 *                       type: boolean
 *                     opalConnected:
 *                       type: boolean
 *                 failover:
 *                   type: object
 *                   properties:
 *                     state:
 *                       type: string
 *                       enum: [CLOSED, OPEN, HALF_OPEN]
 *                     fullState:
 *                       type: object
 *                     metrics:
 *                       type: object
 *                 auditQueue:
 *                   type: object
 *                   properties:
 *                     size:
 *                       type: integer
 *                 health:
 *                   type: object
 *                   description: Health score breakdown
 *       500:
 *         description: Failed to get spoke status
 */
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
