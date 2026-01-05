/**
 * Clearance Management Routes
 *
 * Admin routes for managing national clearance mappings
 * Phase 3: MongoDB SSOT Admin UI
 * Date: 2026-01-04
 */

import { Router } from 'express';
import * as clearanceController from '../controllers/clearance-management.controller';
import { authenticateJWT } from '../middleware/authz.middleware';

const router = Router();

// All routes require authentication
router.use(authenticateJWT);

/**
 * GET /api/admin/clearance/mappings
 * Get all clearance mappings (all 5 levels)
 */
router.get('/mappings', clearanceController.getAllMappings);

/**
 * GET /api/admin/clearance/mappings/:level
 * Get mapping for a specific clearance level
 */
router.get('/mappings/:level', clearanceController.getMappingByLevel);

/**
 * GET /api/admin/clearance/countries
 * Get all supported countries
 */
router.get('/countries', clearanceController.getSupportedCountries);

/**
 * GET /api/admin/clearance/stats
 * Get statistics about clearance mappings
 */
router.get('/stats', clearanceController.getStats);

/**
 * PUT /api/admin/clearance/countries/:country
 * Update mappings for a specific country
 *
 * Body: { mappings: { "SECRET": ["SALAJANE", "..."], ... } }
 */
router.put('/countries/:country', clearanceController.updateCountryMappings);

/**
 * POST /api/admin/clearance/countries
 * Add a new country with all 5 clearance levels
 *
 * Body: {
 *   country: "NEW",
 *   mappings: {
 *     "UNCLASSIFIED": [...],
 *     "RESTRICTED": [...],
 *     "CONFIDENTIAL": [...],
 *     "SECRET": [...],
 *     "TOP_SECRET": [...]
 *   }
 * }
 */
router.post('/countries', clearanceController.addCountry);

/**
 * DELETE /api/admin/clearance/countries/:country
 * Remove a country from all clearance levels
 */
router.delete('/countries/:country', clearanceController.removeCountry);

/**
 * POST /api/admin/clearance/validate
 * Validate all clearance mappings
 */
router.post('/validate', clearanceController.validateMappings);

/**
 * POST /api/admin/clearance/test
 * Test a national clearance mapping
 *
 * Body: { nationalClearance: "SALAJANE", country: "EST" }
 */
router.post('/test', clearanceController.testMapping);

/**
 * GET /api/admin/clearance/audit/:country
 * Get audit history for a specific country
 */
router.get('/audit/:country', clearanceController.getAuditHistory);

export default router;
