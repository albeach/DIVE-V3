/**
 * Remove Legacy COI Fields Migration
 *
 * Removes all legacy.COI fields from existing resources since we now use
 * ztdf.policy.securityLabel.COI as the single source of truth.
 *
 * This migration:
 * 1. Removes legacy.COI from all resources
 * 2. Removes entire legacy object if it has no other useful fields
 * 3. Reports on documents cleaned
 *
 * Usage:
 *   npm run migrate:remove-legacy-coi
 *   docker exec dive-hub-backend npx tsx src/scripts/remove-legacy-coi-fields.ts
 *   docker exec dive-hub-backend npx tsx src/scripts/remove-legacy-coi-fields.ts --dry-run
 *
 * @date 2026-01-29
 */

import { logger } from '../utils/logger';
import { getMongoDBName } from '../utils/mongodb-config';
import { getDb, mongoSingleton } from '../utils/mongodb-singleton';

interface MigrationStats {
    totalDocuments: number;
    documentsWithLegacyCOI: number;
    legacyFieldsRemoved: number;
    errors: string[];
}

async function removeLegacyCOIFields(dryRun: boolean = false): Promise<MigrationStats> {
    const DB_NAME = getMongoDBName();

    const stats: MigrationStats = {
        totalDocuments: 0,
        documentsWithLegacyCOI: 0,
        legacyFieldsRemoved: 0,
        errors: []
    };

    try {
        await mongoSingleton.connect();
        console.log('✅ Connected to MongoDB');
        console.log(`   Database: ${DB_NAME}`);
        console.log(`   Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE'}\n`);

        const db = getDb();
        const resourcesCollection = db.collection('resources');

        // Count total documents
        stats.totalDocuments = await resourcesCollection.countDocuments();
        console.log(`📄 Total resources: ${stats.totalDocuments}`);

        // Find documents with legacy.COI field
        const documentsWithLegacy = await resourcesCollection.find({
            'legacy.COI': { $exists: true }
        }).toArray();

        stats.documentsWithLegacyCOI = documentsWithLegacy.length;
        console.log(`🔍 Documents with legacy.COI: ${stats.documentsWithLegacyCOI}\n`);

        if (stats.documentsWithLegacyCOI === 0) {
            console.log('✅ No legacy.COI fields found - database is clean!\n');
            return stats;
        }

        if (dryRun) {
            console.log('⚠️  DRY RUN MODE - Would clean the following:\n');

            // Sample first 5 documents
            const samples = documentsWithLegacy.slice(0, 5);
            for (const doc of samples) {
                console.log(`   Document: ${doc.resourceId}`);
                console.log(`      legacy.COI: [${doc.legacy?.COI?.join(', ') || 'empty'}]`);
                console.log(`      ztdf.COI: [${doc.ztdf?.policy?.securityLabel?.COI?.join(', ') || 'none'}]`);
                console.log('');
            }

            if (documentsWithLegacy.length > 5) {
                console.log(`   ... and ${documentsWithLegacy.length - 5} more documents\n`);
            }

            console.log('Run without --dry-run to apply changes.\n');
            return stats;
        }

        // Actual migration - remove legacy.COI fields
        console.log('🧹 Cleaning legacy.COI fields...\n');

        for (const doc of documentsWithLegacy) {
            try {
                // Check what other legacy fields exist
                const legacyKeys = doc.legacy ? Object.keys(doc.legacy) : [];

                // If legacy only contains COI (and maybe nothing else useful), remove entire legacy object
                // Otherwise, just remove the COI field
                const hasOtherLegacyFields = legacyKeys.some(key =>
                    key !== 'COI' &&
                    key !== 'coiOperator' &&
                    doc.legacy[key] !== undefined
                );

                let updateOperation;
                if (!hasOtherLegacyFields) {
                    // Remove entire legacy object
                    updateOperation = {
                        $unset: { legacy: '' },
                        $set: { updatedAt: new Date() }
                    };
                } else {
                    // Just remove COI field
                    updateOperation = {
                        $unset: { 'legacy.COI': '' },
                        $set: { updatedAt: new Date() }
                    };
                }

                await resourcesCollection.updateOne(
                    { _id: doc._id },
                    updateOperation
                );

                stats.legacyFieldsRemoved++;

                if (stats.legacyFieldsRemoved % 500 === 0) {
                    console.log(`   Cleaned ${stats.legacyFieldsRemoved} documents...`);
                }
            } catch (error) {
                const errorMsg = `Failed to update ${doc.resourceId}: ${error}`;
                console.error(`   ❌ ${errorMsg}`);
                stats.errors.push(errorMsg);
            }
        }

        console.log(`\n✅ Cleaned ${stats.legacyFieldsRemoved} documents\n`);

    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        // Singleton manages lifecycle - no need to close
        console.log('👋 Migration cleanup complete\n');
    }

    return stats;
}

async function main() {
    console.log('🚀 Remove Legacy COI Fields Migration');
    console.log('=====================================\n');
    console.log('This migration removes redundant legacy.COI fields.');
    console.log('ZTDF (ztdf.policy.securityLabel.COI) is the single source of truth.\n');

    const DRY_RUN = process.argv.includes('--dry-run');

    try {
        const stats = await removeLegacyCOIFields(DRY_RUN);

        if (!DRY_RUN) {
            console.log('📊 Migration Summary:');
            console.log('====================');
            console.log(`📄 Total resources: ${stats.totalDocuments}`);
            console.log(`🔍 Had legacy.COI: ${stats.documentsWithLegacyCOI}`);
            console.log(`🧹 Fields removed: ${stats.legacyFieldsRemoved}`);

            if (stats.errors.length > 0) {
                console.log(`\n⚠️  Errors: ${stats.errors.length}`);
                stats.errors.slice(0, 10).forEach((err, idx) => {
                    console.log(`   ${idx + 1}. ${err}`);
                });
                if (stats.errors.length > 10) {
                    console.log(`   ... and ${stats.errors.length - 10} more errors`);
                }
            }

            console.log('\n✅ Migration completed successfully!\n');
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

// Run migration
main();
