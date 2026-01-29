/**
 * Federation Constraint Routes
 *
 * API routes for managing bilateral federation constraints.
 * Phase 2, Task 1.5
 */

import { Router } from 'express';
import { authenticateJWT } from '../middleware/authz.middleware';
import {
  validateFederationConstraintModification,
  requireFederationConstraintRole,
} from '../middleware/federation-constraints.middleware';
import {
  listConstraints,
  getConstraint,
  getBilateralConstraints,
  createConstraint,
  updateConstraint,
  deleteConstraint,
} from '../controllers/federation-constraint.controller';

const router = Router();

// All routes require authentication + admin role
router.use(authenticateJWT, requireFederationConstraintRole);

// ============================================
// Federation Constraint CRUD Routes
// ============================================

/**
 * GET /api/federation-constraints
 * List all constraints (tenant-filtered for non-super_admin)
 */
router.get('/', listConstraints);

/**
 * GET /api/federation-constraints/bilateral/:tenantA/:tenantB
 * Get bilateral constraints (both directions) with effective-min calculation
 */
router.get('/bilateral/:tenantA/:tenantB', getBilateralConstraints);

/**
 * GET /api/federation-constraints/:ownerTenant/:partnerTenant
 * Get specific unilateral constraint
 */
router.get('/:ownerTenant/:partnerTenant', getConstraint);

/**
 * POST /api/federation-constraints
 * Create new constraint (RBAC enforced via middleware)
 */
router.post('/', validateFederationConstraintModification, createConstraint);

/**
 * PUT /api/federation-constraints/:ownerTenant/:partnerTenant
 * Update existing constraint (RBAC enforced via middleware)
 */
router.put('/:ownerTenant/:partnerTenant', validateFederationConstraintModification, updateConstraint);

/**
 * DELETE /api/federation-constraints/:ownerTenant/:partnerTenant
 * Delete constraint (soft delete - sets status to suspended)
 */
router.delete('/:ownerTenant/:partnerTenant', validateFederationConstraintModification, deleteConstraint);

export default router;
