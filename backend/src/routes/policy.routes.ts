/**
 * Policy Routes
 * Week 3.2: OPA Policy Viewer
 * Enhanced with modular policy hierarchy support
 *
 * REST API routes for SYSTEM policy management (read-only)
 * These are the built-in OPA Rego policies that power DIVE's authorization
 *
 * NOTE: This is different from /api/policies-lab (user-uploaded policies)
 * - /api/policies → System OPA policies (filesystem) - Public read-only
 * - /api/policies-lab → User-uploaded policies (database) - Requires authentication
 */

import { Router } from 'express';
import { authenticateJWT } from '../middleware/authz.middleware';
import {
    listPoliciesHandler,
    getHierarchyHandler,
    getPolicyHandler,
    testDecisionHandler,
    listUnitTestsHandler,
    runUnitTestsHandler
} from '../controllers/policy.controller';

const router = Router();

/**
 * @openapi
 * /api/policies:
 *   get:
 *     summary: List all OPA policies
 *     description: |
 *       Returns metadata for all system OPA Rego policies that power DIVE's ABAC engine.
 *       Includes policies from base/, org/, tenant/, and entrypoints/ directories.
 *     tags: [Policies]
 *     security: []
 *     responses:
 *       200:
 *         description: List of policies
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 policies:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: fuel_inventory_abac_policy
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       layer:
 *                         type: string
 *                         enum: [base, org, tenant, entrypoints]
 *                       ruleCount:
 *                         type: integer
 *                 total:
 *                   type: integer
 */
router.get('/', listPoliciesHandler);

/**
 * @openapi
 * /api/policies/hierarchy:
 *   get:
 *     summary: Get policy hierarchy
 *     description: |
 *       Returns the complete policy hierarchy with dependency graph.
 *       Includes layered structure, import relationships, and visualization data.
 *     tags: [Policies]
 *     security: []
 *     responses:
 *       200:
 *         description: Policy hierarchy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 version:
 *                   type: object
 *                   properties:
 *                     bundleVersion:
 *                       type: string
 *                 layers:
 *                   type: object
 *                   properties:
 *                     base:
 *                       type: array
 *                     org:
 *                       type: array
 *                     tenant:
 *                       type: array
 *                     entrypoints:
 *                       type: array
 *                 dependencyGraph:
 *                   type: object
 *                   description: Import relationships for visualization
 *                 stats:
 *                   type: object
 */
router.get('/hierarchy', getHierarchyHandler);

/**
 * GET /api/policies/:id
 * Get SYSTEM policy content by ID
 * Returns: Full Rego source code with metadata
 *
 * Authentication: None (system policies are public information)
 * Authorization: None (read-only access)
 *
 * Example: GET /api/policies/federation_abac_policy
 * Example: GET /api/policies/base_clearance_clearance (hierarchical path as underscore-separated)
 */
router.get('/:id', getPolicyHandler);

/**
 * @openapi
 * /api/policies/{id}/test:
 *   post:
 *     summary: Test policy decision
 *     description: |
 *       Tests a policy with custom input data. Returns the authorization decision
 *       with detailed evaluation results including which rules passed or failed.
 *     tags: [Policies]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: fuel_inventory_abac_policy
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               input:
 *                 type: object
 *                 properties:
 *                   subject:
 *                     type: object
 *                     properties:
 *                       uniqueID:
 *                         type: string
 *                       clearance:
 *                         type: string
 *                       countryOfAffiliation:
 *                         type: string
 *                   action:
 *                     type: object
 *                   resource:
 *                     type: object
 *                   context:
 *                     type: object
 *     responses:
 *       200:
 *         description: Policy evaluation result
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthorizationDecision'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/:id/test', authenticateJWT, testDecisionHandler);

/**
 * GET /api/policies/:id/unit-tests
 * List all unit tests associated with a SYSTEM policy
 * Returns: Array of test metadata (name, description, location)
 *
 * Authentication: None (test metadata is public information)
 * Authorization: None (read-only access)
 *
 * Example: GET /api/policies/tenant_base/unit-tests
 */
router.get('/:id/unit-tests', listUnitTestsHandler);

/**
 * POST /api/policies/:id/run-tests
 * Run OPA unit tests for a specific SYSTEM policy
 * Returns: Test results with pass/fail status and execution time
 *
 * Authentication: None (running tests on public policies is safe)
 * Authorization: None (read-only operation)
 *
 * Example: POST /api/policies/tenant_base/run-tests
 */
router.post('/:id/run-tests', runUnitTestsHandler);

export default router;
