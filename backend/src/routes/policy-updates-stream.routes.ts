/**
 * Policy Updates Stream Routes (SSE)
 *
 * Server-Sent Events endpoint for real-time policy update notifications.
 * Best practice approach for event-driven UI updates.
 *
 * Phase 5, Task 5.5
 * Date: 2026-01-29
 */

import { Router, Request, Response } from 'express';
import { policyUpdateStream } from '../services/policy-update-stream.service';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/policies/stream
 *
 * Server-Sent Events endpoint for real-time policy update notifications.
 * Clients connect and receive events when policies or data change.
 *
 * No authentication required (policy metadata is not sensitive)
 */
router.get('/stream', (req: Request, res: Response): void => {
  logger.info('New SSE connection request for policy updates', {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  // Register client for policy update events
  policyUpdateStream.registerClient(res);

  // Connection will stay open until client disconnects
});

/**
 * GET /api/policies/stream/status
 *
 * Get policy update stream service status (for monitoring)
 */
router.get('/stream/status', (req: Request, res: Response): void => {
  const status = policyUpdateStream.getStatus();

  res.json({
    success: true,
    ...status,
    timestamp: new Date().toISOString(),
  });
});

export default router;
