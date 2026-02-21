/**
 * Federation Constraint Routes
 *
 * API routes for managing bilateral federation constraints.
 * Phase 2, Task 1.5
 *
 * @swagger
 * tags:
 *   - name: Federation Constraints
 *     description: Bilateral federation constraint management for tenant relationships
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
 * @swagger
 * /api/federation-constraints:
 *   get:
 *     summary: List all federation constraints
 *     description: Returns all federation constraints. Automatically filtered by tenant for non-super_admin users.
 *     tags: [Federation Constraints]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of federation constraints
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   owner_tenant:
 *                     type: string
 *                     description: Tenant that owns this constraint
 *                   partner_tenant:
 *                     type: string
 *                     description: Partner tenant in federation relationship
 *                   min_clearance:
 *                     type: string
 *                     description: Minimum clearance level required
 *                   allowed_cois:
 *                     type: array
 *                     items:
 *                       type: string
 *                     description: Allowed Communities of Interest
 *                   status:
 *                     type: string
 *                     enum: [active, suspended]
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Insufficient permissions
 *       500:
 *         description: Server error
 */
router.get('/', listConstraints);

/**
 * @swagger
 * /api/federation-constraints/bilateral/{tenantA}/{tenantB}:
 *   get:
 *     summary: Get bilateral constraints
 *     description: Retrieves constraints in both directions (A→B and B→A) and calculates the effective minimum clearance level
 *     tags: [Federation Constraints]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantA
 *         required: true
 *         schema:
 *           type: string
 *         description: First tenant identifier
 *       - in: path
 *         name: tenantB
 *         required: true
 *         schema:
 *           type: string
 *         description: Second tenant identifier
 *     responses:
 *       200:
 *         description: Bilateral constraint information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tenantA_to_tenantB:
 *                   type: object
 *                   description: Constraint from tenant A to B
 *                 tenantB_to_tenantA:
 *                   type: object
 *                   description: Constraint from tenant B to A
 *                 effective_min_clearance:
 *                   type: string
 *                   description: The stricter of the two minimum clearances
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Constraints not found
 *       500:
 *         description: Server error
 */
router.get('/bilateral/:tenantA/:tenantB', getBilateralConstraints);

/**
 * @swagger
 * /api/federation-constraints/{ownerTenant}/{partnerTenant}:
 *   get:
 *     summary: Get specific unilateral constraint
 *     description: Retrieves a single directional constraint from owner tenant to partner tenant
 *     tags: [Federation Constraints]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ownerTenant
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant that owns this constraint
 *       - in: path
 *         name: partnerTenant
 *         required: true
 *         schema:
 *           type: string
 *         description: Partner tenant in the relationship
 *     responses:
 *       200:
 *         description: Constraint details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 owner_tenant:
 *                   type: string
 *                 partner_tenant:
 *                   type: string
 *                 min_clearance:
 *                   type: string
 *                 allowed_cois:
 *                   type: array
 *                   items:
 *                     type: string
 *                 status:
 *                   type: string
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *                 updated_at:
 *                   type: string
 *                   format: date-time
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Constraint not found
 *       500:
 *         description: Server error
 */
router.get('/:ownerTenant/:partnerTenant', getConstraint);

/**
 * @swagger
 * /api/federation-constraints:
 *   post:
 *     summary: Create new federation constraint
 *     description: Creates a new unidirectional constraint between two tenants. RBAC enforcement ensures users can only create constraints for their own tenant.
 *     tags: [Federation Constraints]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - owner_tenant
 *               - partner_tenant
 *               - min_clearance
 *             properties:
 *               owner_tenant:
 *                 type: string
 *                 description: Tenant creating this constraint
 *               partner_tenant:
 *                 type: string
 *                 description: Partner tenant in federation
 *               min_clearance:
 *                 type: string
 *                 enum: [UNCLASSIFIED, RESTRICTED, CONFIDENTIAL, SECRET, TOP_SECRET]
 *                 description: Minimum required clearance level
 *               allowed_cois:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Optional list of allowed COI keys
 *               status:
 *                 type: string
 *                 enum: [active, suspended]
 *                 default: active
 *     responses:
 *       201:
 *         description: Constraint created successfully
 *       400:
 *         description: Invalid request body or duplicate constraint
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Insufficient permissions
 *       500:
 *         description: Server error
 */
router.post('/', validateFederationConstraintModification, createConstraint);

/**
 * @swagger
 * /api/federation-constraints/{ownerTenant}/{partnerTenant}:
 *   put:
 *     summary: Update federation constraint
 *     description: Updates an existing constraint. Can modify clearance level, allowed COIs, or status. RBAC ensures users can only update their own tenant's constraints.
 *     tags: [Federation Constraints]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ownerTenant
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant that owns the constraint
 *       - in: path
 *         name: partnerTenant
 *         required: true
 *         schema:
 *           type: string
 *         description: Partner tenant
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               min_clearance:
 *                 type: string
 *                 enum: [UNCLASSIFIED, RESTRICTED, CONFIDENTIAL, SECRET, TOP_SECRET]
 *               allowed_cois:
 *                 type: array
 *                 items:
 *                   type: string
 *               status:
 *                 type: string
 *                 enum: [active, suspended]
 *     responses:
 *       200:
 *         description: Constraint updated successfully
 *       400:
 *         description: Invalid request body
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Constraint not found
 *       500:
 *         description: Server error
 */
router.put('/:ownerTenant/:partnerTenant', validateFederationConstraintModification, updateConstraint);

/**
 * @swagger
 * /api/federation-constraints/{ownerTenant}/{partnerTenant}:
 *   delete:
 *     summary: Delete federation constraint
 *     description: Soft deletes a constraint by setting its status to 'suspended'. Does not remove historical data. RBAC ensures users can only delete their own tenant's constraints.
 *     tags: [Federation Constraints]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ownerTenant
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant that owns the constraint
 *       - in: path
 *         name: partnerTenant
 *         required: true
 *         schema:
 *           type: string
 *         description: Partner tenant
 *     responses:
 *       200:
 *         description: Constraint suspended successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Constraint suspended successfully
 *                 status:
 *                   type: string
 *                   enum: [suspended]
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Constraint not found
 *       500:
 *         description: Server error
 */
router.delete('/:ownerTenant/:partnerTenant', validateFederationConstraintModification, deleteConstraint);

export default router;
