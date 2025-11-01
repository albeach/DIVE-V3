/**
 * Policy Routes
 * Week 3.2: OPA Policy Viewer
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
    getPolicyHandler,
    testDecisionHandler
} from '../controllers/policy.controller';

const router = Router();

/**
 * GET /api/policies
 * List all SYSTEM OPA policies (built-in authorization policies)
 * Returns: Array of policy metadata with statistics
 * 
 * Authentication: None (system policies are public information)
 * Authorization: None (read-only access to system policies)
 * 
 * NOTE: Shows policies from policies/*.rego directory
 */
router.get('/', listPoliciesHandler);

/**
 * GET /api/policies/:id
 * Get SYSTEM policy content by ID
 * Returns: Full Rego source code with metadata
 * 
 * Authentication: None (system policies are public information)
 * Authorization: None (read-only access)
 * 
 * Example: GET /api/policies/fuel_inventory_abac_policy
 */
router.get('/:id', getPolicyHandler);

/**
 * POST /api/policies/:id/test
 * Test SYSTEM policy decision with custom input
 * Body: IOPAInput (subject, action, resource, context)
 * Returns: Decision (allow/deny) with evaluation details
 * 
 * Authentication: Required (JWT token for testing)
 * Authorization: None (any authenticated user can test policies)
 * 
 * Example: POST /api/policies/fuel_inventory_abac_policy/test
 * Body: { input: { subject: {...}, action: {...}, resource: {...}, context: {...} } }
 */
router.post('/:id/test', authenticateJWT, testDecisionHandler);

export default router;

