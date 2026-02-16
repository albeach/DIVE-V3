/**
 * Migration Script: Backfill Classification Equivalency Fields
 * 
 * ACP-240 Section 4.3 Compliance Enhancement
 * 
 * Purpose:
 * Backfill existing ZTDF objects with originalClassification, originalCountry,
 * and natoEquivalent fields to achieve full ACP-240 Section 4.3 compliance.
 * 
 * Strategy:
 * - For existing ZTDF objects without originalClassification:
 *   - Infer originalClassification from originatingCountry + classification
 *   - Map classification to NATO equivalent using classification-equivalency functions
 *   - Update ZTDF security label with new fields
 * 
 * Safety:
 * - Dry-run mode by default (no changes made)
 * - Validation before updates
 * - Rollback capability
 * - Comprehensive logging
 * 
 * Usage:
 *   # Dry run (no changes)
 *   npm run migrate:classification-equivalency
 * 
 *   # Execute migration
 *   npm run migrate:classification-equivalency -- --execute
 * 
 *   # Execute with rollback capability
 *   npm run migrate:classification-equivalency -- --execute --create-rollback
 */

import { MongoClient } from 'mongodb';
import { logger } from '../utils/logger';
import { mapToNATOLevel, mapFromNATOLevel } from '../utils/classification-equivalency';
import type { NationalClassificationSystem } from '../utils/classification-equivalency';

// Command-line arguments
const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--execute');
const CREATE_ROLLBACK = args.includes('--create-rollback');

// MongoDB connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGO_DB_NAME || 'dive_v3';
const COLLECTION_NAME = 'resources';

interface IMigrationStats {
    total: number;
    alreadyMigrated: number;
    needsMigration: number;
    migrated: number;
    failed: number;
    errors: Array<{ resourceId: string; error: string }>;
}

/**
 * Main migration function
 */
async function migrateClassificationEquivalency(): Promise<void> {
    logger.info('Starting classification equivalency migration', {
        dryRun: DRY_RUN,
        createRollback: CREATE_ROLLBACK,
        mongoUri: MONGO_URI,
        dbName: DB_NAME
    });

    const client = new MongoClient(MONGO_URI);
    let rollbackData: Record<string, unknown>[] = [];

    try {
        await client.connect();
        logger.info('Connected to MongoDB');

        const db = client.db(DB_NAME);
        const collection = db.collection(COLLECTION_NAME);

        // Fetch all ZTDF resources
        const resources = await collection.find({
            'ztdf': { $exists: true }
        }).toArray();

        logger.info(`Found ${resources.length} ZTDF resources`);

        const stats: IMigrationStats = {
            total: resources.length,
            alreadyMigrated: 0,
            needsMigration: 0,
            migrated: 0,
            failed: 0,
            errors: []
        };

        for (const resource of resources) {
            try {
                const resourceId = resource.resourceId || resource._id.toString();
                const securityLabel = resource.ztdf?.policy?.securityLabel;

                if (!securityLabel) {
                    logger.warn('Resource missing security label', { resourceId });
                    continue;
                }

                // Check if already migrated
                if (securityLabel.originalClassification &&
                    securityLabel.originalCountry &&
                    securityLabel.natoEquivalent) {
                    stats.alreadyMigrated++;
                    logger.debug('Resource already migrated', { resourceId });
                    continue;
                }

                stats.needsMigration++;

                // Infer original classification from originating country + classification
                const originatingCountry = securityLabel.originatingCountry || 'USA';
                const classification = securityLabel.classification;

                // Map DIVE canonical to national format
                const originalClassification = mapFromNATOLevel(
                    mapToNATOLevel(classification, originatingCountry as NationalClassificationSystem) || classification as any,
                    originatingCountry as NationalClassificationSystem
                );

                // Map to NATO equivalent
                const natoEquivalent = mapToNATOLevel(
                    originalClassification,
                    originatingCountry as NationalClassificationSystem
                );

                if (!natoEquivalent) {
                    logger.warn('Failed to map to NATO equivalent', {
                        resourceId,
                        classification,
                        originatingCountry,
                        originalClassification
                    });
                    stats.failed++;
                    stats.errors.push({
                        resourceId,
                        error: 'Failed to map to NATO equivalent'
                    });
                    continue;
                }

                // Prepare update
                const update = {
                    $set: {
                        'ztdf.policy.securityLabel.originalClassification': originalClassification,
                        'ztdf.policy.securityLabel.originalCountry': originatingCountry,
                        'ztdf.policy.securityLabel.natoEquivalent': natoEquivalent
                    }
                };

                // Save rollback data
                if (CREATE_ROLLBACK) {
                    rollbackData.push({
                        resourceId,
                        originalSecurityLabel: securityLabel
                    });
                }

                if (!DRY_RUN) {
                    // Execute update
                    await collection.updateOne(
                        { resourceId },
                        update
                    );

                    logger.info('Migrated resource', {
                        resourceId,
                        classification,
                        originalClassification,
                        originatingCountry,
                        natoEquivalent
                    });
                } else {
                    logger.info('[DRY RUN] Would migrate resource', {
                        resourceId,
                        classification,
                        originalClassification,
                        originatingCountry,
                        natoEquivalent
                    });
                }

                stats.migrated++;

            } catch (error) {
                const resourceId = resource.resourceId || resource._id.toString();
                logger.error('Failed to migrate resource', {
                    resourceId,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
                stats.failed++;
                stats.errors.push({
                    resourceId,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }

        // Save rollback file
        if (CREATE_ROLLBACK && !DRY_RUN && rollbackData.length > 0) {
            const fs = require('fs');
            const rollbackFile = `rollback-classification-equivalency-${Date.now()}.json`;
            fs.writeFileSync(rollbackFile, JSON.stringify(rollbackData, null, 2));
            logger.info(`Rollback data saved to ${rollbackFile}`);
        }

        // Print summary
        logger.info('Migration complete', {
            dryRun: DRY_RUN,
            stats: {
                total: stats.total,
                alreadyMigrated: stats.alreadyMigrated,
                needsMigration: stats.needsMigration,
                migrated: stats.migrated,
                failed: stats.failed,
                successRate: stats.needsMigration > 0
                    ? ((stats.migrated / stats.needsMigration) * 100).toFixed(2) + '%'
                    : '0%'
            }
        });

        if (stats.errors.length > 0) {
            logger.warn('Migration errors', {
                count: stats.errors.length,
                errors: stats.errors
            });
        }

        if (DRY_RUN) {
            logger.info('🔍 DRY RUN MODE: No changes were made');
            logger.info('To execute migration, run: npm run migrate:classification-equivalency -- --execute');
        } else {
            logger.info('✅ Migration executed successfully');
        }

    } catch (error) {
        logger.error('Migration failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
        });
        throw error;
    } finally {
        await client.close();
        logger.info('Disconnected from MongoDB');
    }
}

/**
 * Rollback migration
 * 
 * Usage:
 *   npm run migrate:classification-equivalency:rollback -- rollback-file.json
 */
async function rollbackMigration(rollbackFile: string): Promise<void> {
    logger.info('Starting rollback', { rollbackFile });

    const fs = require('fs');
    const rollbackData = JSON.parse(fs.readFileSync(rollbackFile, 'utf8'));

    const client = new MongoClient(MONGO_URI);

    try {
        await client.connect();
        const db = client.db(DB_NAME);
        const collection = db.collection(COLLECTION_NAME);

        let restored = 0;
        let failed = 0;

        for (const item of rollbackData) {
            try {
                await collection.updateOne(
                    { resourceId: item.resourceId },
                    { $set: { 'ztdf.policy.securityLabel': item.originalSecurityLabel } }
                );
                restored++;
                logger.info('Rolled back resource', { resourceId: item.resourceId });
            } catch (error) {
                failed++;
                logger.error('Failed to rollback resource', {
                    resourceId: item.resourceId,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }

        logger.info('Rollback complete', {
            total: rollbackData.length,
            restored,
            failed
        });

    } finally {
        await client.close();
    }
}

// Execute migration or rollback
if (require.main === module) {
    const rollbackArg = args.find(arg => arg.endsWith('.json'));

    if (rollbackArg) {
        rollbackMigration(rollbackArg)
            .then(() => process.exit(0))
            .catch(error => {
                logger.error('Rollback failed', { error });
                process.exit(1);
            });
    } else {
        migrateClassificationEquivalency()
            .then(() => process.exit(0))
            .catch(error => {
                logger.error('Migration failed', { error });
                process.exit(1);
            });
    }
}

export { migrateClassificationEquivalency, rollbackMigration };
