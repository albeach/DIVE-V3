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
 * GET /api/policies
 * List all SYSTEM OPA policies (built-in authorization policies)
 * Returns: Array of policy metadata with statistics
 *
 * Authentication: None (system policies are public information)
 * Authorization: None (read-only access to system policies)
 *
 * NOTE: Now includes policies from all subdirectories (base/, org/, tenant/, entrypoints/)
 */
router.get('/', listPoliciesHandler);

/**
 * GET /api/policies/hierarchy
 * Get complete policy hierarchy with dependency graph
 * Returns: Layered policy structure with imports, compliance, and visualization data
 *
 * Authentication: None (system policies are public information)
 * Authorization: None (read-only access)
 *
 * Response includes:
 * - version: Bundle version metadata
 * - layers: Policies grouped by layer (base, org, tenant, entrypoints, standalone)
 * - dependencyGraph: Import relationships for visualization
 * - stats: Aggregated statistics
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
