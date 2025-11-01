/**
 * Policy Routes
 * Week 3.2: OPA Policy Viewer
 * 
 * REST API routes for policy management (read-only)
 * All routes require authentication
 */

import { Router } from 'express';
import { authenticateJWT } from '../middleware/authz.middleware';
import {
    listPoliciesHandler,
    getPolicyHandler,
    testDecisionHandler
} from '../controllers/policy.controller';

const router = Router();

/**
 * GET /api/policies
 * List all available policies
 * Returns: Array of policy metadata with statistics
 * 
 * Authentication: Required (JWT token)
 * Authorization: None (read-only access)
 */
router.get('/', authenticateJWT, listPoliciesHandler);

/**
 * GET /api/policies/:id
 * Get policy content by ID
 * Returns: Full Rego source code with metadata
 * 
 * Authentication: Required (JWT token)
 * Authorization: None (read-only access)
 * 
 * Example: GET /api/policies/fuel_inventory_abac_policy
 */
router.get('/:id', authenticateJWT, getPolicyHandler);

/**
 * POST /api/policies/:id/test
 * Test policy decision with custom input
 * Body: IOPAInput (subject, action, resource, context)
 * Returns: Decision (allow/deny) with evaluation details
 * 
 * Authentication: Required (JWT token)
 * Authorization: None (testing endpoint)
 * 
 * Example: POST /api/policies/fuel_inventory_abac_policy/test
 * Body: { input: { subject: {...}, action: {...}, resource: {...}, context: {...} } }
 */
router.post('/:id/test', authenticateJWT, testDecisionHandler);

export default router;

