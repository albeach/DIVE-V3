/**
 * DIVE V3 SP Management Routes
 * Service Provider registry endpoints
 * 
 * All routes require admin authentication (enforced by adminAuthMiddleware)
 * 
 * Routes:
 * - GET /api/sp-management/sps - List all SPs
 * - GET /api/sp-management/sps/:spId - Get SP details
 * - POST /api/sp-management/register - Register new SP
 * - PUT /api/sp-management/sps/:spId - Update SP
 * - DELETE /api/sp-management/sps/:spId - Delete SP
 * - POST /api/sp-management/sps/:spId/approve - Approve/Reject SP
 * - POST /api/sp-management/sps/:spId/suspend - Suspend/Reactivate SP
 * - POST /api/sp-management/sps/:spId/regenerate-secret - Regenerate client secret
 * - GET /api/sp-management/sps/:spId/activity - Get activity logs
 */

import { Router } from 'express';
import { adminAuthMiddleware } from '../middleware/admin-auth.middleware';
import {
  listSPs,
  getSPById,
  registerSP,
  updateSP,
  deleteSP,
  approveSP,
  suspendSP,
  regenerateSecret,
  getSPActivity
} from '../controllers/sp-management.controller';

const router = Router();

// ============================================
// Apply admin authentication to all routes
// ============================================
router.use(adminAuthMiddleware);

// ============================================
// Service Provider Management Routes
// ============================================

/**
 * GET /api/sp-management/sps
 * List all Service Providers
 * Query params:
 * - status: PENDING | ACTIVE | SUSPENDED | REVOKED
 * - country: ISO 3166-1 alpha-3 (USA, FRA, CAN, etc.)
 * - organizationType: GOVERNMENT | MILITARY | INDUSTRY | ACADEMIC
 * - search: Search by name, client ID, or technical contact
 * - page: Page number (default: 1)
 * - limit: Results per page (default: 20)
 */
router.get('/sps', listSPs);

/**
 * GET /api/sp-management/sps/:spId
 * Get specific Service Provider details
 */
router.get('/sps/:spId', getSPById);

/**
 * POST /api/sp-management/register
 * Register new Service Provider
 */
router.post('/register', registerSP);

/**
 * PUT /api/sp-management/sps/:spId
 * Update Service Provider configuration
 */
router.put('/sps/:spId', updateSP);

/**
 * DELETE /api/sp-management/sps/:spId
 * Delete Service Provider
 */
router.delete('/sps/:spId', deleteSP);

/**
 * POST /api/sp-management/sps/:spId/approve
 * Approve or reject pending Service Provider
 * Body:
 * - action: "approve" | "reject"
 * - reason: Approval/rejection reason
 * - approvedBy: Admin user ID
 */
router.post('/sps/:spId/approve', approveSP);

/**
 * POST /api/sp-management/sps/:spId/suspend
 * Suspend or reactivate Service Provider
 * Body:
 * - reason: Suspension reason (minimum 10 characters)
 * - suspendedBy: Admin user ID
 */
router.post('/sps/:spId/suspend', suspendSP);

/**
 * POST /api/sp-management/sps/:spId/regenerate-secret
 * Regenerate client secret for confidential clients
 * Body:
 * - regeneratedBy: Admin user ID
 */
router.post('/sps/:spId/regenerate-secret', regenerateSecret);

/**
 * GET /api/sp-management/sps/:spId/activity
 * Get activity logs for Service Provider
 * Query params:
 * - limit: Maximum number of logs (default: 50)
 * - offset: Pagination offset (default: 0)
 */
router.get('/sps/:spId/activity', getSPActivity);

export default router;












