/**
 * Clearance Equivalency Database Service
 *
 * MongoDB-based SSOT (Single Source of Truth) for national clearance mappings
 *
 * Phase 2: Strategic Implementation
 * Date: 2026-01-04
 */

import { Db, Collection } from 'mongodb';
import { logger } from '../utils/logger';
import {
    CLEARANCE_EQUIVALENCY_TABLE,
    DiveClearanceLevel,
    NationalClearanceSystem
} from './clearance-mapper.service';

/**
 * MongoDB document schema for clearance equivalency
 */
export interface IClearanceEquivalencyDocument {
    _id?: string;
    standardLevel: DiveClearanceLevel;
    nationalEquivalents: Record<string, string[]>;
    mfaRequired: boolean;
    aalLevel: 1 | 2 | 3;
    acrLevel: 0 | 1 | 2;
    description: string;
    updatedAt: Date;
    updatedBy?: string;
    version?: number;
}

/**
 * Clearance Equivalency Database Service
 *
 * Provides MongoDB-backed storage and retrieval of clearance mappings
 * Enables operational updates without code deployment
 */
export class ClearanceEquivalencyDBService {
    private collection: Collection<IClearanceEquivalencyDocument>;
    private db: Db;

    constructor(db: Db) {
        this.db = db;
        this.collection = db.collection('clearance_equivalency');
    }

    /**
     * Initialize clearance equivalency collection from TypeScript definitions
     *
     * Run once during deployment to populate MongoDB with mappings
     * Safe to run multiple times (idempotent)
     */
    async initialize(): Promise<void> {
        try {
            const existingCount = await this.collection.countDocuments();

            if (existingCount > 0) {
                logger.info('Clearance equivalency already initialized', {
                    count: existingCount,
                    collection: 'clearance_equivalency'
                });
                return;
            }

            logger.info('Initializing clearance equivalency table in MongoDB...', {
                mappings: CLEARANCE_EQUIVALENCY_TABLE.length,
                collection: 'clearance_equivalency'
            });

            // Convert TypeScript mappings to MongoDB documents
            const documents: IClearanceEquivalencyDocument[] = CLEARANCE_EQUIVALENCY_TABLE.map((entry, index) => ({
                standardLevel: entry.standardLevel,
                nationalEquivalents: entry.nationalEquivalents,
                mfaRequired: entry.mfaRequired,
                aalLevel: this.getAALLevel(entry.standardLevel, entry.mfaRequired),
                acrLevel: this.getACRLevel(entry.standardLevel),
                description: entry.description,
                updatedAt: new Date(),
                updatedBy: 'system',
                version: 1
            }));

            // Insert all documents
            const result = await this.collection.insertMany(documents);

            logger.info('Clearance equivalency initialized successfully', {
                count: result.insertedCount,
                levels: documents.map(d => d.standardLevel),
                collection: 'clearance_equivalency'
            });

            // Create indexes for fast lookup
            await this.createIndexes();

        } catch (error) {
            logger.error('Failed to initialize clearance equivalency', {
                error: error instanceof Error ? error.message : String(error),
                collection: 'clearance_equivalency'
            });
            throw error;
        }
    }

    /**
     * Create indexes for optimized queries
     */
    private async createIndexes(): Promise<void> {
        try {
            // Index on standardLevel for fast lookup
            await this.collection.createIndex({ standardLevel: 1 }, { unique: true });

            // Index on updatedAt for audit queries
            await this.collection.createIndex({ updatedAt: -1 });

            logger.info('Created indexes for clearance_equivalency collection');
        } catch (error) {
            logger.warn('Failed to create indexes (may already exist)', {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * Get AAL (Authentication Assurance Level) for a clearance level
     *
     * AAL mapping:
     * - UNCLASSIFIED, RESTRICTED: AAL1 (no MFA)
     * - CONFIDENTIAL, SECRET: AAL2 (MFA required)
     * - TOP_SECRET: AAL3 (MFA + hardware token recommended)
     */
    private getAALLevel(level: DiveClearanceLevel, mfaRequired: boolean): 1 | 2 | 3 {
        if (level === 'TOP_SECRET') {
            return 3;
        }
        if (mfaRequired || level === 'CONFIDENTIAL' || level === 'SECRET') {
            return 2;
        }
        return 1;
    }

    /**
     * Get ACR (Authentication Context Reference) level
     *
     * ACR mapping (for NIST 800-63):
     * - UNCLASSIFIED, RESTRICTED: ACR 0
     * - CONFIDENTIAL, SECRET: ACR 1
     * - TOP_SECRET: ACR 2
     */
    private getACRLevel(level: DiveClearanceLevel): 0 | 1 | 2 {
        if (level === 'TOP_SECRET') {
            return 2;
        }
        if (level === 'CONFIDENTIAL' || level === 'SECRET') {
            return 1;
        }
        return 0;
    }

    /**
     * Map national clearance to DIVE standard level
     *
     * Primary lookup method - queries MongoDB for mapping
     *
     * @param nationalClearance - National clearance level (e.g., "SALAJANE")
     * @param country - ISO 3166 alpha-3 country code (e.g., "EST")
     * @returns DIVE standard clearance level
     */
    async getNationalMapping(
        nationalClearance: string,
        country: string
    ): Promise<DiveClearanceLevel> {
        try {
            // Normalize input
            const normalized = nationalClearance.trim().replace(/\s+/g, ' ').toUpperCase();

            logger.debug('Looking up national clearance in MongoDB', {
                nationalClearance,
                country,
                normalized
            });

            // Query MongoDB for matching clearance
            const mapping = await this.collection.findOne({
                [`nationalEquivalents.${country}`]: {
                    $in: [normalized, nationalClearance]
                }
            });

            if (mapping) {
                logger.info('National clearance mapped successfully (MongoDB)', {
                    nationalClearance,
                    country,
                    standardLevel: mapping.standardLevel,
                    source: 'mongodb'
                });

                return mapping.standardLevel;
            }

            // Not found - log warning and return fallback
            logger.warn('Unknown national clearance, defaulting to UNCLASSIFIED', {
                nationalClearance,
                country,
                normalized,
                source: 'mongodb'
            });

            return 'UNCLASSIFIED';

        } catch (error) {
            logger.error('MongoDB lookup failed for national clearance', {
                error: error instanceof Error ? error.message : String(error),
                nationalClearance,
                country
            });
            throw error;
        }
    }

    /**
     * Get all national equivalents for a standard level
     *
     * @param standardLevel - DIVE standard clearance level
     * @param country - Optional country filter
     * @returns Array of national clearance equivalents
     */
    async getEquivalents(
        standardLevel: DiveClearanceLevel,
        country?: string
    ): Promise<string[]> {
        try {
            const doc = await this.collection.findOne({ standardLevel });

            if (!doc) {
                logger.warn('No equivalents found for standard level', {
                    standardLevel,
                    source: 'mongodb'
                });
                return [];
            }

            if (country) {
                return doc.nationalEquivalents[country] || [];
            }

            // Return all equivalents from all countries
            return Object.values(doc.nationalEquivalents).flat();

        } catch (error) {
            logger.error('Failed to get equivalents from MongoDB', {
                error: error instanceof Error ? error.message : String(error),
                standardLevel,
                country
            });
            throw error;
        }
    }

    /**
     * Get complete mapping document for a standard level
     *
     * @param standardLevel - DIVE standard clearance level
     * @returns Complete clearance equivalency document
     */
    async getMapping(standardLevel: DiveClearanceLevel): Promise<IClearanceEquivalencyDocument | null> {
        try {
            return await this.collection.findOne({ standardLevel });
        } catch (error) {
            logger.error('Failed to get mapping from MongoDB', {
                error: error instanceof Error ? error.message : String(error),
                standardLevel
            });
            throw error;
        }
    }

    /**
     * Get all mappings (all 5 clearance levels)
     *
     * @returns Array of all clearance equivalency documents
     */
    async getAllMappings(): Promise<IClearanceEquivalencyDocument[]> {
        try {
            return await this.collection.find({}).sort({ standardLevel: 1 }).toArray();
        } catch (error) {
            logger.error('Failed to get all mappings from MongoDB', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * Update mappings for a specific country
     *
     * Admin endpoint for operational updates without code deployment
     *
     * @param country - ISO 3166 alpha-3 country code
     * @param mappings - Record of standard level → national equivalents
     * @param updatedBy - User/system making the update
     */
    async updateCountryMappings(
        country: string,
        mappings: Record<string, string[]>,
        updatedBy: string = 'system'
    ): Promise<void> {
        try {
            logger.info('Updating country clearance mappings', {
                country,
                levels: Object.keys(mappings).length,
                updatedBy
            });

            for (const [standardLevel, equivalents] of Object.entries(mappings)) {
                const result = await this.collection.updateOne(
                    { standardLevel: standardLevel as DiveClearanceLevel },
                    {
                        $set: {
                            [`nationalEquivalents.${country}`]: equivalents,
                            updatedAt: new Date(),
                            updatedBy
                        },
                        $inc: { version: 1 }
                    }
                );

                if (result.matchedCount === 0) {
                    logger.warn('Standard level not found for country update', {
                        country,
                        standardLevel
                    });
                }
            }

            logger.info('Successfully updated country clearance mappings', {
                country,
                levels: Object.keys(mappings).length,
                updatedBy
            });

        } catch (error) {
            logger.error('Failed to update country mappings', {
                error: error instanceof Error ? error.message : String(error),
                country,
                updatedBy
            });
            throw error;
        }
    }

    /**
     * Add a new country to all clearance levels
     *
     * @param country - ISO 3166 alpha-3 country code
     * @param mappings - Complete set of clearance mappings (5 levels)
     * @param updatedBy - User/system making the addition
     */
    async addCountry(
        country: NationalClearanceSystem,
        mappings: Record<DiveClearanceLevel, string[]>,
        updatedBy: string = 'system'
    ): Promise<void> {
        try {
            logger.info('Adding new country to clearance mappings', {
                country,
                levels: Object.keys(mappings).length,
                updatedBy
            });

            // Validate that all 5 levels are provided
            const requiredLevels: DiveClearanceLevel[] = [
                'UNCLASSIFIED',
                'RESTRICTED',
                'CONFIDENTIAL',
                'SECRET',
                'TOP_SECRET'
            ];

            for (const level of requiredLevels) {
                if (!mappings[level] || mappings[level].length === 0) {
                    throw new Error(`Missing mapping for ${country} at level ${level}`);
                }
            }

            // Add to each clearance level
            await this.updateCountryMappings(country, mappings as Record<string, string[]>, updatedBy);

            logger.info('Successfully added new country', {
                country,
                levels: Object.keys(mappings).length,
                updatedBy
            });

        } catch (error) {
            logger.error('Failed to add country', {
                error: error instanceof Error ? error.message : String(error),
                country,
                updatedBy
            });
            throw error;
        }
    }

    /**
     * Remove a country from all clearance levels
     *
     * Use with caution - this is irreversible without backup
     *
     * @param country - ISO 3166 alpha-3 country code
     * @param updatedBy - User/system making the removal
     */
    async removeCountry(
        country: string,
        updatedBy: string = 'system'
    ): Promise<void> {
        try {
            logger.warn('Removing country from clearance mappings', {
                country,
                updatedBy
            });

            const result = await this.collection.updateMany(
                {},
                {
                    $unset: { [`nationalEquivalents.${country}`]: '' },
                    $set: { updatedAt: new Date(), updatedBy },
                    $inc: { version: 1 }
                }
            );

            logger.info('Successfully removed country', {
                country,
                modifiedCount: result.modifiedCount,
                updatedBy
            });

        } catch (error) {
            logger.error('Failed to remove country', {
                error: error instanceof Error ? error.message : String(error),
                country,
                updatedBy
            });
            throw error;
        }
    }

    /**
     * Get list of all supported countries
     *
     * @returns Array of ISO 3166 alpha-3 country codes
     */
    async getSupportedCountries(): Promise<string[]> {
        try {
            // Get any clearance level document (they all have same countries)
            const doc = await this.collection.findOne({ standardLevel: 'SECRET' });

            if (!doc) {
                return [];
            }

            return Object.keys(doc.nationalEquivalents).sort();

        } catch (error) {
            logger.error('Failed to get supported countries', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * Validate that all required mappings exist
     *
     * @returns Validation result with any errors found
     */
    async validate(): Promise<{ valid: boolean; errors: string[] }> {
        const errors: string[] = [];

        try {
            // Check that all 5 standard levels exist
            const requiredLevels: DiveClearanceLevel[] = [
                'UNCLASSIFIED',
                'RESTRICTED',
                'CONFIDENTIAL',
                'SECRET',
                'TOP_SECRET'
            ];

            for (const level of requiredLevels) {
                const doc = await this.collection.findOne({ standardLevel: level });
                if (!doc) {
                    errors.push(`Missing mapping for standard level: ${level}`);
                }
            }

            // Check that all documents have equivalents
            const allDocs = await this.collection.find({}).toArray();

            for (const doc of allDocs) {
                const countryCount = Object.keys(doc.nationalEquivalents).length;
                if (countryCount === 0) {
                    errors.push(`No countries mapped for level: ${doc.standardLevel}`);
                }
            }

            const valid = errors.length === 0;

            if (valid) {
                logger.info('MongoDB clearance equivalency validation successful', {
                    levelsCount: allDocs.length,
                    countriesCount: allDocs[0] ? Object.keys(allDocs[0].nationalEquivalents).length : 0
                });
            } else {
                logger.error('MongoDB clearance equivalency validation failed', { errors });
            }

            return { valid, errors };

        } catch (error) {
            errors.push(`Validation error: ${error instanceof Error ? error.message : String(error)}`);
            return { valid: false, errors };
        }
    }

    /**
     * Get statistics about the clearance equivalency collection
     *
     * @returns Statistics object
     */
    async getStats(): Promise<{
        totalLevels: number;
        totalCountries: number;
        totalMappings: number;
        lastUpdated: Date | null;
    }> {
        try {
            const allDocs = await this.collection.find({}).toArray();

            if (allDocs.length === 0) {
                return {
                    totalLevels: 0,
                    totalCountries: 0,
                    totalMappings: 0,
                    lastUpdated: null
                };
            }

            const totalLevels = allDocs.length;
            const totalCountries = Object.keys(allDocs[0].nationalEquivalents).length;
            const totalMappings = totalLevels * totalCountries;

            // Find most recent update
            const mostRecent = allDocs.reduce((latest, doc) => {
                return doc.updatedAt > latest ? doc.updatedAt : latest;
            }, allDocs[0].updatedAt);

            return {
                totalLevels,
                totalCountries,
                totalMappings,
                lastUpdated: mostRecent
            };

        } catch (error) {
            logger.error('Failed to get stats', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * Reset collection (remove all documents)
     *
     * Use with caution - typically only for testing/development
     */
    async reset(): Promise<void> {
        try {
            logger.warn('Resetting clearance equivalency collection');
            await this.collection.deleteMany({});
            logger.info('Clearance equivalency collection reset complete');
        } catch (error) {
            logger.error('Failed to reset collection', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }
}
