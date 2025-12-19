/**
 * COI Keys API Routes
 * 
 * RESTful routes for COI Keys management
 * 
 * Date: October 21, 2025
 */

import { Router } from 'express';
import {
    getAllCOIKeysHandler,
    getCOIKeyByIdHandler,
    createCOIKeyHandler,
    updateCOIKeyHandler,
    deprecateCOIKeyHandler,
    getCOIsForCountryHandler,
    getAllCOICountriesHandler,
    getCOIKeyStatisticsHandler
} from '../controllers/coi-keys.controller';
// Note: Admin routes protected by validateAdminToken middleware
// For now, POST/PUT/DELETE routes are public for initial setup
// TODO: Add proper authentication middleware when ready

const router = Router();

/**
 * GET /api/coi-keys
 * Get all COI Keys (optionally filtered by status)
 * Query params: ?status=active|deprecated|pending
 */
router.get('/', getAllCOIKeysHandler);

/**
 * GET /api/coi-keys/statistics
 * Get COI Keys statistics (must come before /:coiId route)
 */
router.get('/statistics', getCOIKeyStatisticsHandler);

/**
 * GET /api/coi-keys/countries
 * Get all distinct countries across all COIs
 */
router.get('/countries', getAllCOICountriesHandler);

/**
 * GET /api/coi-keys/country/:countryCode
 * Get all COIs that a specific country is a member of
 */
router.get('/country/:countryCode', getCOIsForCountryHandler);

/**
 * GET /api/coi-keys/:coiId
 * Get a single COI Key by ID
 */
router.get('/:coiId', getCOIKeyByIdHandler);

/**
 * POST /api/coi-keys
 * Create a new COI Key (admin only - TODO: add authentication)
 */
router.post('/', createCOIKeyHandler);

/**
 * PUT /api/coi-keys/:coiId
 * Update a COI Key (admin only - TODO: add authentication)
 */
router.put('/:coiId', updateCOIKeyHandler);

/**
 * DELETE /api/coi-keys/:coiId
 * Deprecate a COI Key (admin only - TODO: add authentication)
 */
router.delete('/:coiId', deprecateCOIKeyHandler);

export default router;
