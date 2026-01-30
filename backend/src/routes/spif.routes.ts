/**
 * SPIF Routes
 *
 * API endpoints for STANAG 4774 Security Policy Information File data.
 * Provides marking rules and classification information to the frontend.
 *
 * @swagger
 * tags:
 *   - name: SPIF
 *     description: STANAG 4774 Security Policy Information File management
 */

import { Router, Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import {
    getSPIFMarkingRules,
    generateMarking,
    getCountryName,
    getClassificationLevel,
    isValidClassification,
    getValidCountryCodes,
    expandMembership,
    getRawSPIFData,
} from '../services/spif-parser.service';
import { CLASSIFICATION_COLORS, PORTION_MARKING_MAP } from '../types/stanag.types';

const router = Router();

/**
 * @swagger
 * /api/spif/marking-rules:
 *   get:
 *     summary: Get SPIF marking rules
 *     description: Returns complete SPIF marking rules including classifications, countries, releasability qualifiers, special categories, and color codes
 *     tags: [SPIF]
 *     responses:
 *       200:
 *         description: Complete marking rules
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     classifications:
 *                       type: object
 *                       description: Classification levels and their properties
 *                     countries:
 *                       type: object
 *                       description: Country codes and names
 *                     releasableToQualifier:
 *                       type: string
 *                     specialCategories:
 *                       type: object
 *                     memberships:
 *                       type: object
 *                       description: Coalition memberships
 *                     colors:
 *                       type: object
 *                       description: Classification color codes
 *                     portionMarkings:
 *                       type: object
 *       500:
 *         description: Server error
 */
router.get('/marking-rules', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const rules = await getSPIFMarkingRules();

        // Convert Maps to plain objects for JSON serialization
        const response = {
            classifications: Object.fromEntries(rules.classifications),
            countries: Object.fromEntries(rules.countries),
            releasableToQualifier: rules.releasableToQualifier,
            specialCategories: Object.fromEntries(rules.specialCategories),
            memberships: Object.fromEntries(rules.memberships),
            colors: CLASSIFICATION_COLORS,
            portionMarkings: PORTION_MARKING_MAP,
        };

        res.json({
            success: true,
            data: response,
        });
    } catch (error) {
        logger.error('Failed to get SPIF marking rules', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        next(error);
    }
});

/**
 * @swagger
 * /api/spif/generate-marking:
 *   post:
 *     summary: Generate classification marking
 *     description: Generates STANAG 4774 compliant classification marking text from resource attributes
 *     tags: [SPIF]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - classification
 *             properties:
 *               classification:
 *                 type: string
 *                 description: Classification level
 *                 example: SECRET
 *               releasabilityTo:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Countries resource is releasable to
 *                 example: ["USA", "GBR", "CAN"]
 *               COI:
 *                 type: string
 *                 description: Community of Interest
 *               caveats:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Additional handling caveats
 *               language:
 *                 type: string
 *                 enum: [en, fr]
 *                 description: Marking language
 *     responses:
 *       200:
 *         description: Generated marking text
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     pageTopBottom:
 *                       type: string
 *                     portionMarking:
 *                       type: string
 *       400:
 *         description: Missing required classification field
 *       500:
 *         description: Server error
 */
router.post('/generate-marking', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { classification, releasabilityTo, COI, caveats, language } = req.body;

        if (!classification) {
            res.status(400).json({
                success: false,
                error: 'Missing required field: classification',
            });
            return;
        }

        const marking = await generateMarking(
            classification,
            releasabilityTo || [],
            { COI, caveats, language }
        );

        res.json({
            success: true,
            data: marking,
        });
    } catch (error) {
        logger.error('Failed to generate marking', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        next(error);
    }
});

/**
 * @swagger
 * /api/spif/classifications:
 *   get:
 *     summary: Get valid classifications
 *     description: Returns list of all valid classification levels with display names, portion markings, hierarchy, and colors
 *     tags: [SPIF]
 *     parameters:
 *       - in: query
 *         name: language
 *         schema:
 *           type: string
 *           enum: [en, fr]
 *           default: en
 *         description: Language for display names
 *     responses:
 *       200:
 *         description: List of classifications sorted by hierarchy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                       displayName:
 *                         type: string
 *                       portionMarking:
 *                         type: string
 *                       hierarchy:
 *                         type: integer
 *                       color:
 *                         type: string
 *       500:
 *         description: Server error
 */
router.get('/classifications', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const rules = await getSPIFMarkingRules();
        const language = (req.query.language as 'en' | 'fr') || 'en';

        const classifications = Array.from(rules.classifications.entries()).map(([key, value]) => ({
            name: key,
            displayName: value.pageTopBottom[language],
            portionMarking: value.portionMarking,
            hierarchy: value.hierarchy,
            color: CLASSIFICATION_COLORS[key] || CLASSIFICATION_COLORS['SECRET'],
        }));

        // Sort by hierarchy
        classifications.sort((a, b) => a.hierarchy - b.hierarchy);

        res.json({
            success: true,
            data: classifications,
        });
    } catch (error) {
        logger.error('Failed to get classifications', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        next(error);
    }
});

/**
 * @swagger
 * /api/spif/countries:
 *   get:
 *     summary: Get valid countries
 *     description: Returns list of all valid ISO 3166-1 alpha-3 country codes with names in English and French
 *     tags: [SPIF]
 *     parameters:
 *       - in: query
 *         name: language
 *         schema:
 *           type: string
 *           enum: [en, fr]
 *           default: en
 *         description: Preferred language for sorting
 *     responses:
 *       200:
 *         description: List of countries sorted alphabetically
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       code:
 *                         type: string
 *                         description: ISO 3166-1 alpha-3 code
 *                       name:
 *                         type: string
 *                         description: Name in requested language
 *                       nameEn:
 *                         type: string
 *                       nameFr:
 *                         type: string
 *       500:
 *         description: Server error
 */
router.get('/countries', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const rules = await getSPIFMarkingRules();
        const language = (req.query.language as 'en' | 'fr') || 'en';

        const countries = Array.from(rules.countries.entries()).map(([code, names]) => ({
            code,
            name: names[language],
            nameEn: names.en,
            nameFr: names.fr,
        }));

        // Sort alphabetically by name
        countries.sort((a, b) => a.name.localeCompare(b.name));

        res.json({
            success: true,
            data: countries,
        });
    } catch (error) {
        logger.error('Failed to get countries', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        next(error);
    }
});

/**
 * @swagger
 * /api/spif/memberships:
 *   get:
 *     summary: Get coalition memberships
 *     description: Returns all defined coalition and partnership memberships with their member country lists
 *     tags: [SPIF]
 *     responses:
 *       200:
 *         description: List of coalition memberships
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                         description: Coalition name (e.g., FVEY, NATO)
 *                       memberCount:
 *                         type: integer
 *                       members:
 *                         type: array
 *                         items:
 *                           type: string
 *                         description: Array of ISO 3166-1 alpha-3 country codes
 *       500:
 *         description: Server error
 */
router.get('/memberships', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const rules = await getSPIFMarkingRules();

        const memberships = Array.from(rules.memberships.entries()).map(([name, members]) => ({
            name,
            memberCount: members.length,
            members,
        }));

        res.json({
            success: true,
            data: memberships,
        });
    } catch (error) {
        logger.error('Failed to get memberships', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        next(error);
    }
});

/**
 * @swagger
 * /api/spif/membership/{name}/expand:
 *   get:
 *     summary: Expand coalition membership
 *     description: Returns the list of member country codes for a specific coalition or partnership
 *     tags: [SPIF]
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Coalition name (e.g., FVEY, NATO)
 *     responses:
 *       200:
 *         description: Member country codes
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     membership:
 *                       type: string
 *                     members:
 *                       type: array
 *                       items:
 *                         type: string
 *       404:
 *         description: Membership not found
 *       500:
 *         description: Server error
 */
router.get('/membership/:name/expand', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name } = req.params;
        const members = await expandMembership(name);

        if (members.length === 0) {
            res.status(404).json({
                success: false,
                error: `Membership "${name}" not found`,
            });
            return;
        }

        res.json({
            success: true,
            data: {
                membership: name,
                members,
            },
        });
    } catch (error) {
        logger.error('Failed to expand membership', {
            name: req.params.name,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        next(error);
    }
});

/**
 * @swagger
 * /api/spif/validate/classification/{classification}:
 *   get:
 *     summary: Validate classification
 *     description: Validates whether a classification level is valid according to STANAG 4774 rules
 *     tags: [SPIF]
 *     parameters:
 *       - in: path
 *         name: classification
 *         required: true
 *         schema:
 *           type: string
 *         description: Classification level to validate
 *         example: SECRET
 *     responses:
 *       200:
 *         description: Validation result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     classification:
 *                       type: string
 *                     valid:
 *                       type: boolean
 *                     level:
 *                       type: integer
 *                       nullable: true
 *                       description: Hierarchy level if valid
 *       500:
 *         description: Server error
 */
router.get('/validate/classification/:classification', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { classification } = req.params;
        const valid = await isValidClassification(classification);
        const level = getClassificationLevel(classification);

        res.json({
            success: true,
            data: {
                classification,
                valid,
                level: valid ? level : null,
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /api/spif/country/{code}:
 *   get:
 *     summary: Get country name
 *     description: Returns the country name for a given ISO 3166-1 alpha-3 country code
 *     tags: [SPIF]
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *         description: ISO 3166-1 alpha-3 country code
 *         example: USA
 *       - in: query
 *         name: language
 *         schema:
 *           type: string
 *           enum: [en, fr]
 *           default: en
 *         description: Language for country name
 *     responses:
 *       200:
 *         description: Country name
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                     name:
 *                       type: string
 *                     language:
 *                       type: string
 *       500:
 *         description: Server error
 */
router.get('/country/:code', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { code } = req.params;
        const language = (req.query.language as 'en' | 'fr') || 'en';

        const name = await getCountryName(code, language);

        res.json({
            success: true,
            data: {
                code,
                name,
                language,
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /api/spif/raw:
 *   get:
 *     summary: Get raw SPIF data (admin only)
 *     description: Returns the complete raw SPIF data structure for debugging and administrative purposes
 *     tags: [SPIF]
 *     responses:
 *       200:
 *         description: Raw SPIF data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     policyName:
 *                       type: string
 *                     policyId:
 *                       type: string
 *                     version:
 *                       type: string
 *                     creationDate:
 *                       type: string
 *                       format: date-time
 *                     classifications:
 *                       type: object
 *                       description: Complete classification definitions
 *                     categorySets:
 *                       type: object
 *                       description: Category sets with tags
 *                     memberships:
 *                       type: object
 *                       description: Coalition membership definitions
 *       500:
 *         description: Server error
 */
router.get('/raw', async (req: Request, res: Response, next: NextFunction) => {
    try {
        // In production, this should be restricted to admins
        const data = await getRawSPIFData();

        // Convert Maps for JSON serialization
        const response = {
            policyName: data.policyName,
            policyId: data.policyId,
            version: data.version,
            creationDate: data.creationDate,
            classifications: Object.fromEntries(data.classifications),
            categorySets: Object.fromEntries(
                Array.from(data.categorySets.entries()).map(([key, value]) => [
                    key,
                    {
                        ...value,
                        tags: value.tags.map(tag => ({
                            ...tag,
                            categories: Object.fromEntries(tag.categories),
                        })),
                    },
                ])
            ),
            memberships: Object.fromEntries(data.memberships),
        };

        res.json({
            success: true,
            data: response,
        });
    } catch (error) {
        logger.error('Failed to get raw SPIF data', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        next(error);
    }
});

export default router;
