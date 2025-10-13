/**
 * Admin Routes
 * 
 * All routes require super_admin role (enforced by adminAuthMiddleware)
 * 
 * Routes:
 * - GET /api/admin/idps - List all IdPs
 * - GET /api/admin/idps/:alias - Get specific IdP
 * - POST /api/admin/idps - Create new IdP
 * - PUT /api/admin/idps/:alias - Update IdP
 * - DELETE /api/admin/idps/:alias - Delete IdP
 * - POST /api/admin/idps/:alias/test - Test IdP connectivity
 */

import { Router } from 'express';
import { adminAuthMiddleware } from '../middleware/admin-auth.middleware';
import {
    listIdPsHandler,
    getIdPHandler,
    createIdPHandler,
    updateIdPHandler,
    deleteIdPHandler,
    testIdPHandler,
    getPendingApprovalsHandler,
    approveIdPHandler,
    rejectIdPHandler
} from '../controllers/admin.controller';
import {
    getLogsHandler,
    getViolationsHandler,
    getStatsHandler,
    exportLogsHandler
} from '../controllers/admin-log.controller';

const router = Router();

// ============================================
// Apply admin authentication to all routes
// ============================================
router.use(adminAuthMiddleware);

// ============================================
// Identity Provider Management Routes
// ============================================

/**
 * GET /api/admin/idps
 * List all Identity Providers
 */
router.get('/idps', listIdPsHandler);

/**
 * GET /api/admin/idps/:alias
 * Get specific Identity Provider
 */
router.get('/idps/:alias', getIdPHandler);

/**
 * POST /api/admin/idps
 * Create new Identity Provider
 */
router.post('/idps', createIdPHandler);

/**
 * PUT /api/admin/idps/:alias
 * Update Identity Provider
 */
router.put('/idps/:alias', updateIdPHandler);

/**
 * DELETE /api/admin/idps/:alias
 * Delete Identity Provider
 */
router.delete('/idps/:alias', deleteIdPHandler);

/**
 * POST /api/admin/idps/:alias/test
 * Test Identity Provider connectivity
 */
router.post('/idps/:alias/test', testIdPHandler);

// ============================================
// Audit Log Management Routes
// ============================================

/**
 * GET /api/admin/logs
 * Query audit logs
 */
router.get('/logs', getLogsHandler);

/**
 * GET /api/admin/logs/violations
 * Get security violations
 */
router.get('/logs/violations', getViolationsHandler);

/**
 * GET /api/admin/logs/stats
 * Get log statistics
 */
router.get('/logs/stats', getStatsHandler);

/**
 * GET /api/admin/logs/export
 * Export logs to JSON
 */
router.get('/logs/export', exportLogsHandler);

// ============================================
// IdP Approval Workflow Routes
// ============================================

/**
 * GET /api/admin/approvals/pending
 * Get pending IdP submissions
 */
router.get('/approvals/pending', getPendingApprovalsHandler);

/**
 * POST /api/admin/approvals/:alias/approve
 * Approve pending IdP
 */
router.post('/approvals/:alias/approve', approveIdPHandler);

/**
 * POST /api/admin/approvals/:alias/reject
 * Reject pending IdP
 */
router.post('/approvals/:alias/reject', rejectIdPHandler);

export default router;

