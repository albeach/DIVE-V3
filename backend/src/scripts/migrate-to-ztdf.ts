/**
 * Migration Script: Legacy Resources → ZTDF Format
 * 
 * Migrates existing 8 resources from simple format to ACP-240 ZTDF format
 * 
 * Usage:
 *   npx ts-node src/scripts/migrate-to-ztdf.ts [--dry-run] [--resource-id=<id>]
 * 
 * Options:
 *   --dry-run: Preview changes without modifying database
 *   --resource-id=<id>: Migrate only specific resource (for testing)
 */

import { MongoClient } from 'mongodb';
import { IResource } from '../services/resource.service';
import { IZTDFResource } from '../types/ztdf.types';
import { migrateLegacyResourceToZTDF, validateZTDFIntegrity } from '../utils/ztdf.utils';
import { logger } from '../utils/logger';

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGODB_DATABASE || 'dive-v3';
const COLLECTION_NAME = 'resources';

interface IMigrationResult {
    resourceId: string;
    success: boolean;
    error?: string;
    validationResult?: {
        valid: boolean;
        errors: string[];
        warnings: string[];
    };
}

/**
 * Migrate single resource to ZTDF format
 */
async function migrateResource(
    resource: IResource,
    _dryRun: boolean
): Promise<IMigrationResult> {
    try {
        logger.info(`Migrating resource: ${resource.resourceId}`, {
            classification: resource.classification,
            encrypted: resource.encrypted
        });

        // ============================================
        // 1. Convert to ZTDF format
        // ============================================
        const ztdfObject = migrateLegacyResourceToZTDF(resource);

        // ============================================
        // 2. Validate ZTDF integrity
        // ============================================
        const validationResult = await validateZTDFIntegrity(ztdfObject);

        if (!validationResult.valid) {
            logger.error(`ZTDF validation failed for ${resource.resourceId}`, {
                errors: validationResult.errors
            });

            return {
                resourceId: resource.resourceId,
                success: false,
                error: `Validation failed: ${validationResult.errors.join(', ')}`,
                validationResult
            };
        }

        // Log warnings if any
        if (validationResult.warnings.length > 0) {
            logger.warn(`ZTDF validation warnings for ${resource.resourceId}`, {
                warnings: validationResult.warnings
            });
        }

        // ============================================
        // 3. Log successful migration
        // ============================================
        logger.info(`Successfully migrated ${resource.resourceId}`, {
            manifestId: ztdfObject.manifest.objectId,
            policyVersion: ztdfObject.policy.policyVersion,
            payloadSize: ztdfObject.manifest.payloadSize,
            kaoCount: ztdfObject.payload.keyAccessObjects.length,
            displayMarking: ztdfObject.policy.securityLabel.displayMarking,
            dryRun: _dryRun
        });

        return {
            resourceId: resource.resourceId,
            success: true,
            validationResult
        };

    } catch (error) {
        logger.error(`Failed to migrate ${resource.resourceId}`, {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
        });

        return {
            resourceId: resource.resourceId,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Main migration function
 */
async function runMigration() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const resourceIdArg = args.find(arg => arg.startsWith('--resource-id='));
    const specificResourceId = resourceIdArg ? resourceIdArg.split('=')[1] : null;

    logger.info('Starting ZTDF migration', {
        dryRun,
        specificResourceId: specificResourceId || 'all',
        mongoUrl: MONGODB_URL,
        database: DB_NAME
    });

    let client: MongoClient | null = null;

    try {
        // ============================================
        // 1. Connect to MongoDB
        // ============================================
        client = new MongoClient(MONGODB_URL);
        await client.connect();
        logger.info('Connected to MongoDB');

        const db = client.db(DB_NAME);
        const collection = db.collection<IResource>(COLLECTION_NAME);

        // ============================================
        // 2. Fetch resources to migrate
        // ============================================
        const query = specificResourceId ? { resourceId: specificResourceId } : {};
        const resources = await collection.find(query).toArray();

        if (resources.length === 0) {
            logger.warn('No resources found to migrate', { query });
            return;
        }

        logger.info(`Found ${resources.length} resource(s) to migrate`);

        // ============================================
        // 3. Migrate each resource
        // ============================================
        const results: IMigrationResult[] = [];

        for (const resource of resources) {
            const result = await migrateResource(resource, dryRun);
            results.push(result);

            // If not dry run, update database
            if (!dryRun && result.success) {
                // Convert resource to ZTDF format
                const ztdfObject = migrateLegacyResourceToZTDF(resource);

                const ztdfResourceDoc: IZTDFResource = {
                    resourceId: resource.resourceId,
                    title: resource.title,
                    ztdf: ztdfObject,
                    legacy: {
                        classification: resource.classification,
                        releasabilityTo: resource.releasabilityTo,
                        COI: resource.COI || [],
                        creationDate: resource.creationDate,
                        encrypted: resource.encrypted || false,
                        content: resource.content,
                        encryptedContent: resource.encryptedContent
                    },
                    createdAt: resource.createdAt || new Date(),
                    updatedAt: new Date()
                };

                await collection.replaceOne(
                    { resourceId: resource.resourceId },
                    ztdfResourceDoc as any
                );

                logger.info(`Database updated for ${resource.resourceId}`);
            }
        }

        // ============================================
        // 4. Print summary
        // ============================================
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        logger.info('Migration completed', {
            total: results.length,
            successful,
            failed,
            dryRun
        });

        console.log('\n' + '='.repeat(60));
        console.log('ZTDF MIGRATION SUMMARY');
        console.log('='.repeat(60));
        console.log(`Mode: ${dryRun ? 'DRY RUN (no changes made)' : 'LIVE (database updated)'}`);
        console.log(`Total resources: ${results.length}`);
        console.log(`Successful: ${successful}`);
        console.log(`Failed: ${failed}`);
        console.log('='.repeat(60));

        if (failed > 0) {
            console.log('\nFailed resources:');
            results
                .filter(r => !r.success)
                .forEach(r => {
                    console.log(`  - ${r.resourceId}: ${r.error}`);
                });
        }

        console.log('\nValidation details:');
        results.forEach(r => {
            if (r.validationResult) {
                console.log(`\n${r.resourceId}:`);
                console.log(`  Valid: ${r.validationResult.valid}`);
                if (r.validationResult.errors.length > 0) {
                    console.log(`  Errors: ${r.validationResult.errors.length}`);
                    r.validationResult.errors.forEach(err => console.log(`    - ${err}`));
                }
                if (r.validationResult.warnings.length > 0) {
                    console.log(`  Warnings: ${r.validationResult.warnings.length}`);
                    r.validationResult.warnings.forEach(warn => console.log(`    - ${warn}`));
                }
            }
        });

        console.log('\n' + '='.repeat(60));

        if (dryRun) {
            console.log('\n✅ Dry run completed. Run without --dry-run to apply changes.');
        } else {
            console.log('\n✅ Migration completed successfully!');
        }

        process.exit(failed > 0 ? 1 : 0);

    } catch (error) {
        logger.error('Migration failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
        });

        console.error('\n❌ Migration failed:', error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);

    } finally {
        if (client) {
            await client.close();
            logger.info('MongoDB connection closed');
        }
    }
}

// Run migration
if (require.main === module) {
    runMigration().catch(error => {
        console.error('Unhandled error:', error);
        process.exit(1);
    });
}
