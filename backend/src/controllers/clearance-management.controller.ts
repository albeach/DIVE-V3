/**
 * Clearance Management Controller
 *
 * Admin API endpoints for managing national clearance mappings
 * Phase 3: MongoDB SSOT Admin UI
 * Date: 2026-01-04
 */

import { Request, Response } from 'express';
import { getDb, mongoSingleton } from '../utils/mongodb-singleton';
import { Db } from 'mongodb';
import { ClearanceEquivalencyDBService, IClearanceEquivalencyDocument } from '../services/clearance-equivalency-db.service';
import { logger } from '../utils/logger';
import { DiveClearanceLevel, NationalClearanceSystem } from '../services/clearance-mapper.service';

async function getDatabase(): Promise<Db> {
    await mongoSingleton.connect();
    return getDb();
}

/**
 * Get all clearance mappings (all 5 levels)
 */
export async function getAllMappings(req: Request, res: Response): Promise<void> {
    try {
        const db = await getDatabase();
        const service = new ClearanceEquivalencyDBService(db);

        const mappings = await service.getAllMappings();

        res.status(200).json({
            success: true,
            data: mappings,
            count: mappings.length
        });

    } catch (error) {
        logger.error('Failed to get all clearance mappings', {
            error: error instanceof Error ? error.message : String(error)
        });

        res.status(500).json({
            success: false,
            error: 'Failed to retrieve clearance mappings',
            message: error instanceof Error ? error.message : String(error)
        });
    }
}

/**
 * Get mapping for a specific clearance level
 */
export async function getMappingByLevel(req: Request, res: Response): Promise<void> {
    try {
        const { level } = req.params;

        const db = await getDatabase();
        const service = new ClearanceEquivalencyDBService(db);

        const mapping = await service.getMapping(level as DiveClearanceLevel);

        if (!mapping) {
            res.status(404).json({
                success: false,
                error: 'Clearance level not found',
                level
            });
            return;
        }

        res.status(200).json({
            success: true,
            data: mapping
        });

    } catch (error) {
        logger.error('Failed to get clearance mapping', {
            error: error instanceof Error ? error.message : String(error),
            level: req.params.level
        });

        res.status(500).json({
            success: false,
            error: 'Failed to retrieve clearance mapping',
            message: error instanceof Error ? error.message : String(error)
        });
    }
}

/**
 * Get all supported countries
 */
export async function getSupportedCountries(req: Request, res: Response): Promise<void> {
    try {
        const db = await getDatabase();
        const service = new ClearanceEquivalencyDBService(db);

        const countries = await service.getSupportedCountries();

        res.status(200).json({
            success: true,
            data: countries,
            count: countries.length
        });

    } catch (error) {
        logger.error('Failed to get supported countries', {
            error: error instanceof Error ? error.message : String(error)
        });

        res.status(500).json({
            success: false,
            error: 'Failed to retrieve supported countries',
            message: error instanceof Error ? error.message : String(error)
        });
    }
}

/**
 * Get statistics about clearance mappings
 */
export async function getStats(req: Request, res: Response): Promise<void> {
    try {
        const db = await getDatabase();
        const service = new ClearanceEquivalencyDBService(db);

        const stats = await service.getStats();

        res.status(200).json({
            success: true,
            data: stats
        });

    } catch (error) {
        logger.error('Failed to get clearance mapping stats', {
            error: error instanceof Error ? error.message : String(error)
        });

        res.status(500).json({
            success: false,
            error: 'Failed to retrieve statistics',
            message: error instanceof Error ? error.message : String(error)
        });
    }
}

/**
 * Update mappings for a specific country
 */
export async function updateCountryMappings(req: Request, res: Response): Promise<void> {
    try {
        const { country } = req.params;
        const { mappings } = req.body;

        // Validate input
        if (!mappings || typeof mappings !== 'object') {
            res.status(400).json({
                success: false,
                error: 'Invalid request body',
                message: 'mappings object is required'
            });
            return;
        }

        // Get user from JWT (set by auth middleware)
        const user = (req as any).user;
        const updatedBy = user?.uniqueID || user?.email || 'unknown';

        const db = await getDatabase();
        const service = new ClearanceEquivalencyDBService(db);

        await service.updateCountryMappings(country, mappings, updatedBy);

        logger.info('Country clearance mappings updated', {
            country,
            levels: Object.keys(mappings).length,
            updatedBy
        });

        res.status(200).json({
            success: true,
            message: `Updated clearance mappings for ${country}`,
            data: {
                country,
                levelsUpdated: Object.keys(mappings).length,
                updatedBy,
                updatedAt: new Date()
            }
        });

    } catch (error) {
        logger.error('Failed to update country clearance mappings', {
            error: error instanceof Error ? error.message : String(error),
            country: req.params.country
        });

        res.status(500).json({
            success: false,
            error: 'Failed to update clearance mappings',
            message: error instanceof Error ? error.message : String(error)
        });
    }
}

/**
 * Add a new country with all 5 clearance levels
 */
export async function addCountry(req: Request, res: Response): Promise<void> {
    try {
        const { country, mappings } = req.body;

        // Validate input
        if (!country || !mappings) {
            res.status(400).json({
                success: false,
                error: 'Invalid request body',
                message: 'country and mappings are required'
            });
            return;
        }

        // Validate that all 5 levels are provided
        const requiredLevels: DiveClearanceLevel[] = [
            'UNCLASSIFIED',
            'RESTRICTED',
            'CONFIDENTIAL',
            'SECRET',
            'TOP_SECRET'
        ];

        const missingLevels = requiredLevels.filter(level => !mappings[level]);
        if (missingLevels.length > 0) {
            res.status(400).json({
                success: false,
                error: 'Incomplete mapping',
                message: `Missing mappings for levels: ${missingLevels.join(', ')}`,
                missingLevels
            });
            return;
        }

        // Get user from JWT
        const user = (req as any).user;
        const updatedBy = user?.uniqueID || user?.email || 'unknown';

        const db = await getDatabase();
        const service = new ClearanceEquivalencyDBService(db);

        await service.addCountry(country as NationalClearanceSystem, mappings, updatedBy);

        logger.info('New country added to clearance mappings', {
            country,
            levels: Object.keys(mappings).length,
            updatedBy
        });

        res.status(201).json({
            success: true,
            message: `Successfully added ${country} to clearance mappings`,
            data: {
                country,
                levels: Object.keys(mappings).length,
                updatedBy,
                createdAt: new Date()
            }
        });

    } catch (error) {
        logger.error('Failed to add country to clearance mappings', {
            error: error instanceof Error ? error.message : String(error),
            country: req.body.country
        });

        res.status(500).json({
            success: false,
            error: 'Failed to add country',
            message: error instanceof Error ? error.message : String(error)
        });
    }
}

/**
 * Remove a country from all clearance levels
 */
export async function removeCountry(req: Request, res: Response): Promise<void> {
    try {
        const { country } = req.params;

        // Get user from JWT
        const user = (req as any).user;
        const updatedBy = user?.uniqueID || user?.email || 'unknown';

        const db = await getDatabase();
        const service = new ClearanceEquivalencyDBService(db);

        await service.removeCountry(country, updatedBy);

        logger.warn('Country removed from clearance mappings', {
            country,
            updatedBy
        });

        res.status(200).json({
            success: true,
            message: `Successfully removed ${country} from clearance mappings`,
            data: {
                country,
                updatedBy,
                removedAt: new Date()
            }
        });

    } catch (error) {
        logger.error('Failed to remove country from clearance mappings', {
            error: error instanceof Error ? error.message : String(error),
            country: req.params.country
        });

        res.status(500).json({
            success: false,
            error: 'Failed to remove country',
            message: error instanceof Error ? error.message : String(error)
        });
    }
}

/**
 * Validate all clearance mappings
 */
export async function validateMappings(req: Request, res: Response): Promise<void> {
    try {
        const db = await getDatabase();
        const service = new ClearanceEquivalencyDBService(db);

        const result = await service.validate();

        res.status(result.valid ? 200 : 400).json({
            success: result.valid,
            data: result
        });

    } catch (error) {
        logger.error('Failed to validate clearance mappings', {
            error: error instanceof Error ? error.message : String(error)
        });

        res.status(500).json({
            success: false,
            error: 'Failed to validate clearance mappings',
            message: error instanceof Error ? error.message : String(error)
        });
    }
}

/**
 * Test a national clearance mapping
 */
export async function testMapping(req: Request, res: Response): Promise<void> {
    try {
        const { nationalClearance, country } = req.body;

        if (!nationalClearance || !country) {
            res.status(400).json({
                success: false,
                error: 'Invalid request body',
                message: 'nationalClearance and country are required'
            });
            return;
        }

        const db = await getDatabase();
        const service = new ClearanceEquivalencyDBService(db);

        const result = await service.getNationalMapping(nationalClearance, country);

        res.status(200).json({
            success: true,
            data: {
                input: {
                    nationalClearance,
                    country
                },
                output: {
                    standardLevel: result
                },
                mapping: `${nationalClearance} (${country}) → ${result}`
            }
        });

    } catch (error) {
        logger.error('Failed to test clearance mapping', {
            error: error instanceof Error ? error.message : String(error),
            input: req.body
        });

        res.status(500).json({
            success: false,
            error: 'Failed to test clearance mapping',
            message: error instanceof Error ? error.message : String(error)
        });
    }
}

/**
 * Get audit history for a specific country
 * (Would require additional collection tracking changes)
 */
export async function getAuditHistory(req: Request, res: Response): Promise<void> {
    try {
        const { country } = req.params;
        const { limit = 50 } = req.query;

        // For now, return empty array as audit history tracking
        // would require a separate collection
        res.status(200).json({
            success: true,
            data: [],
            message: 'Audit history tracking not yet implemented',
            todo: 'Implement clearance_equivalency_audit collection'
        });

    } catch (error) {
        logger.error('Failed to get audit history', {
            error: error instanceof Error ? error.message : String(error),
            country: req.params.country
        });

        res.status(500).json({
            success: false,
            error: 'Failed to retrieve audit history',
            message: error instanceof Error ? error.message : String(error)
        });
    }
}
