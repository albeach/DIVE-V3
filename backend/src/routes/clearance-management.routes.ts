/**
 * Clearance Management Routes
 *
 * Admin routes for managing national clearance mappings
 * Phase 3: MongoDB SSOT Admin UI
 * Date: 2026-01-04
 *
 * @swagger
 * tags:
 *   - name: Clearance Management
 *     description: National security clearance mapping administration
 */

import { Router } from 'express';
import * as clearanceController from '../controllers/clearance-management.controller';
import { authenticateJWT } from '../middleware/authz.middleware';

const router = Router();

// All routes require authentication
router.use(authenticateJWT);

/**
 * @swagger
 * /api/admin/clearance/mappings:
 *   get:
 *     summary: Get all clearance mappings
 *     description: Retrieves clearance mappings for all 5 classification levels (UNCLASSIFIED, RESTRICTED, CONFIDENTIAL, SECRET, TOP_SECRET) across all countries
 *     tags: [Clearance Management]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Complete clearance mappings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties:
 *                 type: object
 *                 description: Mapping by clearance level
 *                 additionalProperties:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: National clearance equivalents
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         description: Server error
 */
router.get('/mappings', clearanceController.getAllMappings);

/**
 * @swagger
 * /api/admin/clearance/mappings/{level}:
 *   get:
 *     summary: Get mapping for specific clearance level
 *     description: Retrieves national clearance mappings for a single classification level
 *     tags: [Clearance Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: level
 *         required: true
 *         schema:
 *           type: string
 *           enum: [UNCLASSIFIED, RESTRICTED, CONFIDENTIAL, SECRET, TOP_SECRET]
 *         description: Classification level to query
 *     responses:
 *       200:
 *         description: Clearance mappings for the specified level
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: National clearance equivalents
 *       400:
 *         description: Invalid clearance level
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         description: Server error
 */
router.get('/mappings/:level', clearanceController.getMappingByLevel);

/**
 * @swagger
 * /api/admin/clearance/countries:
 *   get:
 *     summary: Get all supported countries
 *     description: Returns a list of all countries with configured clearance mappings
 *     tags: [Clearance Management]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of country codes with clearance mappings
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: string
 *                 description: ISO 3166-1 alpha-3 country code
 *               example: ["USA", "EST", "SVK", "DEU", "FRA"]
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         description: Server error
 */
router.get('/countries', clearanceController.getSupportedCountries);

/**
 * @swagger
 * /api/admin/clearance/stats:
 *   get:
 *     summary: Get clearance mapping statistics
 *     description: Returns aggregated statistics about clearance mappings including country counts, total mappings, and coverage metrics
 *     tags: [Clearance Management]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Clearance mapping statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_countries:
 *                   type: integer
 *                   description: Number of countries with mappings
 *                 total_mappings:
 *                   type: integer
 *                   description: Total number of national clearance mappings
 *                 by_level:
 *                   type: object
 *                   description: Mapping counts per classification level
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         description: Server error
 */
router.get('/stats', clearanceController.getStats);

/**
 * @swagger
 * /api/admin/clearance/countries/{country}:
 *   put:
 *     summary: Update country clearance mappings
 *     description: Updates the clearance mappings for a specific country. Can modify mappings for one or more classification levels.
 *     tags: [Clearance Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: country
 *         required: true
 *         schema:
 *           type: string
 *         description: ISO 3166-1 alpha-3 country code
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - mappings
 *             properties:
 *               mappings:
 *                 type: object
 *                 description: Clearance level mappings to update
 *                 additionalProperties:
 *                   type: array
 *                   items:
 *                     type: string
 *                 example:
 *                   SECRET: ["SALAJANE", "TOP SECRET"]
 *                   TOP_SECRET: ["ÄRA_SALAJANE"]
 *     responses:
 *       200:
 *         description: Mappings updated successfully
 *       400:
 *         description: Invalid request body or country code
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: Country not found
 *       500:
 *         description: Server error
 */
router.put('/countries/:country', clearanceController.updateCountryMappings);

/**
 * @swagger
 * /api/admin/clearance/countries:
 *   post:
 *     summary: Add new country with clearance mappings
 *     description: Registers a new country with clearance mappings for all 5 classification levels
 *     tags: [Clearance Management]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - country
 *               - mappings
 *             properties:
 *               country:
 *                 type: string
 *                 description: ISO 3166-1 alpha-3 country code
 *                 example: POL
 *               mappings:
 *                 type: object
 *                 description: Clearance mappings for all 5 levels
 *                 required:
 *                   - UNCLASSIFIED
 *                   - RESTRICTED
 *                   - CONFIDENTIAL
 *                   - SECRET
 *                   - TOP_SECRET
 *                 properties:
 *                   UNCLASSIFIED:
 *                     type: array
 *                     items:
 *                       type: string
 *                   RESTRICTED:
 *                     type: array
 *                     items:
 *                       type: string
 *                   CONFIDENTIAL:
 *                     type: array
 *                     items:
 *                       type: string
 *                   SECRET:
 *                     type: array
 *                     items:
 *                       type: string
 *                   TOP_SECRET:
 *                     type: array
 *                     items:
 *                       type: string
 *     responses:
 *       201:
 *         description: Country added successfully
 *       400:
 *         description: Invalid request body or duplicate country
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         description: Server error
 */
router.post('/countries', clearanceController.addCountry);

/**
 * @swagger
 * /api/admin/clearance/countries/{country}:
 *   delete:
 *     summary: Remove country clearance mappings
 *     description: Removes a country and all its clearance mappings from all 5 classification levels
 *     tags: [Clearance Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: country
 *         required: true
 *         schema:
 *           type: string
 *         description: ISO 3166-1 alpha-3 country code to remove
 *     responses:
 *       200:
 *         description: Country removed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Country EST removed from all clearance levels
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: Country not found
 *       500:
 *         description: Server error
 */
router.delete('/countries/:country', clearanceController.removeCountry);

/**
 * @swagger
 * /api/admin/clearance/validate:
 *   post:
 *     summary: Validate all clearance mappings
 *     description: Performs comprehensive validation of all clearance mappings, checking for consistency, completeness, and data integrity
 *     tags: [Clearance Management]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Validation results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valid:
 *                   type: boolean
 *                   description: Overall validation status
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       country:
 *                         type: string
 *                       level:
 *                         type: string
 *                       message:
 *                         type: string
 *                 warnings:
 *                   type: array
 *                   items:
 *                     type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         description: Server error
 */
router.post('/validate', clearanceController.validateMappings);

/**
 * @swagger
 * /api/admin/clearance/test:
 *   post:
 *     summary: Test national clearance mapping
 *     description: Tests a specific national clearance to determine its equivalent NATO classification level
 *     tags: [Clearance Management]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nationalClearance
 *               - country
 *             properties:
 *               nationalClearance:
 *                 type: string
 *                 description: National clearance designation to test
 *                 example: SALAJANE
 *               country:
 *                 type: string
 *                 description: ISO 3166-1 alpha-3 country code
 *                 example: EST
 *     responses:
 *       200:
 *         description: Mapping test result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 matched:
 *                   type: boolean
 *                   description: Whether a mapping was found
 *                 level:
 *                   type: string
 *                   description: Equivalent NATO classification level
 *                   example: SECRET
 *                 nationalClearance:
 *                   type: string
 *                 country:
 *                   type: string
 *       400:
 *         description: Invalid request body
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: No mapping found
 *       500:
 *         description: Server error
 */
router.post('/test', clearanceController.testMapping);

/**
 * @swagger
 * /api/admin/clearance/audit/{country}:
 *   get:
 *     summary: Get country audit history
 *     description: Retrieves the audit log of all clearance mapping changes for a specific country
 *     tags: [Clearance Management]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: country
 *         required: true
 *         schema:
 *           type: string
 *         description: ISO 3166-1 alpha-3 country code
 *     responses:
 *       200:
 *         description: Audit history for the country
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   timestamp:
 *                     type: string
 *                     format: date-time
 *                   action:
 *                     type: string
 *                     enum: [created, updated, deleted]
 *                   user:
 *                     type: string
 *                   changes:
 *                     type: object
 *                     description: Details of what changed
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: Country not found
 *       500:
 *         description: Server error
 */
router.get('/audit/:country', clearanceController.getAuditHistory);

export default router;
