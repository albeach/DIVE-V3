/**
 * Purge Invalid COI Documents
 *
 * Safely removes documents with COI coherence violations
 * Creates backup before deletion
 *
 * Date: October 21, 2025
 */

import { validateCOICoherence } from '../services/coi-validation.service';
import { getDb, mongoSingleton } from '../utils/mongodb-singleton';
// import { logger } from '../utils/logger';  // Commented out - not used in this script
import * as fs from 'fs';

// CRITICAL: No hardcoded passwords - use MONGODB_URL from GCP Secret Manager
const MONGODB_URL = process.env.MONGODB_URL || (() => { throw new Error('MONGODB_URL not set'); })();
const DB_NAME = process.env.MONGODB_DATABASE || 'dive-v3';

async function main() {
    console.log('🧹 Purging Invalid COI Documents');
    console.log('==================================\n');

    try {
        await mongoSingleton.connect();
        console.log('✅ Connected to MongoDB\n');

        const db = getDb();
        const collection = db.collection('resources');

        // Get all resources
        const totalCount = await collection.countDocuments();
        console.log(`📊 Total documents: ${totalCount}\n`);

        const resources = await collection.find({}).toArray();

        const invalidIds: string[] = [];
        const validCount = { count: 0 };

        console.log('🔍 Validating documents...\n');

        for (const resource of resources) {
            const resourceId = resource.resourceId;

            // Extract security label
            let securityLabel;
            if (resource.ztdf?.policy?.securityLabel) {
                securityLabel = {
                    classification: resource.ztdf.policy.securityLabel.classification,
                    releasabilityTo: resource.ztdf.policy.securityLabel.releasabilityTo,
                    COI: resource.ztdf.policy.securityLabel.COI || [],
                    coiOperator: resource.ztdf.policy.securityLabel.coiOperator || 'ALL',
                    caveats: resource.ztdf.policy.securityLabel.caveats || []
                };
            } else {
                console.log(`⚠️  Skipping ${resourceId}: No ZTDF security label found`);
                invalidIds.push(resourceId);
                continue;
            }

            // Validate COI coherence
            const validation = await validateCOICoherence(securityLabel);

            if (!validation.valid) {
                invalidIds.push(resourceId);
            } else {
                validCount.count++;
            }
        }

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('📊 Validation Results:\n');
        console.log(`   Total documents:   ${totalCount}`);
        console.log(`   Valid:             ${validCount.count} (${((validCount.count / totalCount) * 100).toFixed(1)}%)`);
        console.log(`   Invalid:           ${invalidIds.length} (${((invalidIds.length / totalCount) * 100).toFixed(1)}%)`);
        console.log('');

        if (invalidIds.length === 0) {
            console.log('✅ No invalid documents found. Database is clean!\n');
            process.exit(0);
        }

        // Create backup
        console.log('💾 Creating backup of invalid documents...\n');
        const invalidDocs = await collection.find({ resourceId: { $in: invalidIds } }).toArray();
        const backupFilename = `backup-invalid-coi-${Date.now()}.json`;
        fs.writeFileSync(backupFilename, JSON.stringify(invalidDocs, null, 2));
        console.log(`   ✅ Backup saved to: ${backupFilename}\n`);

        // Confirm deletion
        console.log('🗑️  Deleting invalid documents...\n');
        const deleteResult = await collection.deleteMany({ resourceId: { $in: invalidIds } });
        console.log(`   ✅ Deleted ${deleteResult.deletedCount} invalid documents\n`);

        // Verify
        const remainingCount = await collection.countDocuments();
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('✅ Purge Complete!\n');
        console.log(`   Documents before:  ${totalCount}`);
        console.log(`   Documents deleted: ${deleteResult.deletedCount}`);
        console.log(`   Documents after:   ${remainingCount}`);
        console.log(`   Backup file:       ${backupFilename}`);
        console.log('');

        console.log('🎯 Next Steps:\n');
        console.log('   1. Run: npm run seed:fixed');
        console.log('   2. Run: npm run lint:coi');
        console.log('   3. Verify: All tests pass');
        console.log('');

    } catch (error) {
        console.error('❌ Error purging documents:', error);
        throw error;
    }
}

main();
