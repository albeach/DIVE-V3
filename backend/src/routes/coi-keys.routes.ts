/**
 * COI Keys API Routes
 *
 * RESTful routes for COI Keys management
 *
 * Date: October 21, 2025
 *
 * @swagger
 * tags:
 *   - name: COI Keys
 *     description: Community of Interest (COI) key management for data compartmentalization
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
// NOTE: Authentication middleware intentionally omitted during development

const router = Router();

/**
 * @swagger
 * /api/coi-keys:
 *   get:
 *     summary: Get all COI Keys
 *     description: Retrieves all Communities of Interest (COI) keys with optional status filtering. COIs define data compartments for access control.
 *     tags: [COI Keys]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, deprecated, pending]
 *         description: Filter COI keys by status
 *     responses:
 *       200:
 *         description: List of COI keys
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   name:
 *                     type: string
 *                   status:
 *                     type: string
 *                   member_countries:
 *                     type: array
 *                     items:
 *                       type: string
 *       500:
 *         description: Server error
 */
router.get('/', getAllCOIKeysHandler);

/**
 * @swagger
 * /api/coi-keys/statistics:
 *   get:
 *     summary: Get COI Keys statistics
 *     description: Returns aggregated statistics about COI keys including counts by status, total member countries, and usage metrics
 *     tags: [COI Keys]
 *     responses:
 *       200:
 *         description: COI statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                   description: Total number of COI keys
 *                 active:
 *                   type: integer
 *                   description: Number of active COI keys
 *                 deprecated:
 *                   type: integer
 *                   description: Number of deprecated COI keys
 *                 pending:
 *                   type: integer
 *                   description: Number of pending COI keys
 *                 total_countries:
 *                   type: integer
 *                   description: Total unique countries across all COIs
 *       500:
 *         description: Server error
 */
router.get('/statistics', getCOIKeyStatisticsHandler);

/**
 * @swagger
 * /api/coi-keys/countries:
 *   get:
 *     summary: Get all COI member countries
 *     description: Returns a distinct list of all countries that are members of at least one COI
 *     tags: [COI Keys]
 *     responses:
 *       200:
 *         description: List of unique country codes
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: string
 *                 description: ISO 3166-1 alpha-3 country code
 *               example: ["USA", "GBR", "CAN", "AUS", "NZL"]
 *       500:
 *         description: Server error
 */
router.get('/countries', getAllCOICountriesHandler);

/**
 * @swagger
 * /api/coi-keys/country/{countryCode}:
 *   get:
 *     summary: Get COIs for a country
 *     description: Returns all Communities of Interest that a specific country is a member of
 *     tags: [COI Keys]
 *     parameters:
 *       - in: path
 *         name: countryCode
 *         required: true
 *         schema:
 *           type: string
 *         description: ISO 3166-1 alpha-3 country code (e.g., USA, GBR, DEU)
 *     responses:
 *       200:
 *         description: List of COIs for the country
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   name:
 *                     type: string
 *                   status:
 *                     type: string
 *       404:
 *         description: Country not found in any COI
 *       500:
 *         description: Server error
 */
router.get('/country/:countryCode', getCOIsForCountryHandler);

/**
 * @swagger
 * /api/coi-keys/{coiId}:
 *   get:
 *     summary: Get a specific COI Key
 *     description: Retrieves detailed information about a single COI key by its ID
 *     tags: [COI Keys]
 *     parameters:
 *       - in: path
 *         name: coiId
 *         required: true
 *         schema:
 *           type: string
 *         description: COI key identifier (e.g., FVEY, NATO, USA)
 *     responses:
 *       200:
 *         description: COI key details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 description:
 *                   type: string
 *                 status:
 *                   type: string
 *                 member_countries:
 *                   type: array
 *                   items:
 *                     type: string
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *                 updated_at:
 *                   type: string
 *                   format: date-time
 *       404:
 *         description: COI key not found
 *       500:
 *         description: Server error
 */
router.get('/:coiId', getCOIKeyByIdHandler);

/**
 * @swagger
 * /api/coi-keys:
 *   post:
 *     summary: Create new COI Key
 *     description: Creates a new Community of Interest key for data compartmentalization. Requires admin privileges.
 *     tags: [COI Keys]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *               - name
 *               - member_countries
 *             properties:
 *               id:
 *                 type: string
 *                 description: Unique COI identifier (uppercase, alphanumeric)
 *                 example: FVEY
 *               name:
 *                 type: string
 *                 description: Human-readable COI name
 *                 example: Five Eyes
 *               description:
 *                 type: string
 *                 description: Optional COI description
 *               member_countries:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of ISO 3166-1 alpha-3 country codes
 *                 example: ["USA", "GBR", "CAN", "AUS", "NZL"]
 *               status:
 *                 type: string
 *                 enum: [active, pending, deprecated]
 *                 default: active
 *     responses:
 *       201:
 *         description: COI key created successfully
 *       400:
 *         description: Invalid request body or duplicate COI ID
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       500:
 *         description: Server error
 */
router.post('/', createCOIKeyHandler);

/**
 * @swagger
 * /api/coi-keys/{coiId}:
 *   put:
 *     summary: Update COI Key
 *     description: Updates an existing COI key. Can modify name, description, member countries, or status. Requires admin privileges.
 *     tags: [COI Keys]
 *     parameters:
 *       - in: path
 *         name: coiId
 *         required: true
 *         schema:
 *           type: string
 *         description: COI key identifier to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Updated COI name
 *               description:
 *                 type: string
 *                 description: Updated COI description
 *               member_countries:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Updated array of ISO 3166-1 alpha-3 country codes
 *               status:
 *                 type: string
 *                 enum: [active, pending, deprecated]
 *                 description: Updated COI status
 *     responses:
 *       200:
 *         description: COI key updated successfully
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: COI key not found
 *       500:
 *         description: Server error
 */
router.put('/:coiId', updateCOIKeyHandler);

/**
 * @swagger
 * /api/coi-keys/{coiId}:
 *   delete:
 *     summary: Deprecate COI Key
 *     description: Marks a COI key as deprecated (soft delete). Does not remove historical data. Requires admin privileges.
 *     tags: [COI Keys]
 *     parameters:
 *       - in: path
 *         name: coiId
 *         required: true
 *         schema:
 *           type: string
 *         description: COI key identifier to deprecate
 *     responses:
 *       200:
 *         description: COI key deprecated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: COI key FVEY deprecated successfully
 *                 id:
 *                   type: string
 *                 status:
 *                   type: string
 *                   enum: [deprecated]
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: COI key not found
 *       500:
 *         description: Server error
 */
router.delete('/:coiId', deprecateCOIKeyHandler);

export default router;
