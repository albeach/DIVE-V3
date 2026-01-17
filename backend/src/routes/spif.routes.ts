/**
 * SPIF Routes
 *
 * API endpoints for STANAG 4774 Security Policy Information File data.
 * Provides marking rules and classification information to the frontend.
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
 * GET /api/spif/marking-rules
 * Returns cached SPIF marking rules for frontend use
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
 * POST /api/spif/generate-marking
 * Generate marking text from resource attributes
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
 * GET /api/spif/classifications
 * Returns list of valid classifications with their properties
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
 * GET /api/spif/countries
 * Returns list of valid country codes with names
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
 * GET /api/spif/memberships
 * Returns coalition/partnership memberships
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
 * GET /api/spif/membership/:name/expand
 * Expand a membership to its member country codes
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
 * GET /api/spif/validate/classification/:classification
 * Validate if a classification is valid
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
 * GET /api/spif/country/:code
 * Get country name from ISO code
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
 * GET /api/spif/raw (admin only)
 * Returns raw SPIF data for debugging
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
