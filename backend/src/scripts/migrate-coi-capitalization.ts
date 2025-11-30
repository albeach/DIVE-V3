/**
 * Migrate COI Capitalization
 * 
 * Updates all MongoDB documents to reflect the new COI capitalization:
 * - ALPHA → Alpha
 * - BETA → Beta
 * - GAMMA → Gamma
 * 
 * This migration affects:
 * 1. resources collection (document COI arrays)
 * 2. coi_keys collection (coiId and name fields)
 * 3. authorization_logs collection (COI references in decision logs)
 * 4. kas_keys collection (COI references)
 * 
 * Date: November 6, 2025
 */

import { MongoClient } from 'mongodb';
import { logger } from '../utils/logger';

// CRITICAL: No hardcoded passwords - use MONGODB_URL from GCP Secret Manager
const MONGODB_URL = process.env.MONGODB_URL || (() => { throw new Error('MONGODB_URL not set'); })();
const DB_NAME = process.env.MONGODB_DATABASE || 'dive-v3';

// COI capitalization mapping
const COI_MAPPING: Record<string, string> = {
    'ALPHA': 'Alpha',
    'BETA': 'Beta',
    'GAMMA': 'Gamma'
};

interface MigrationStats {
    resources: number;
    coiKeys: number;
    authLogs: number;
    kasKeys: number;
    errors: string[];
}

async function migrateCOICapitalization(): Promise<MigrationStats> {
    const client = new MongoClient(MONGODB_URL);
    const stats: MigrationStats = {
        resources: 0,
        coiKeys: 0,
        authLogs: 0,
        kasKeys: 0,
        errors: []
    };

    try {
        await client.connect();
        console.log('✅ Connected to MongoDB\n');

        const db = client.db(DB_NAME);

        // ============================================
        // 1. Update Resources Collection
        // ============================================
        console.log('📄 Migrating resources collection...');
        const resourcesCollection = db.collection('resources');

        // Find all documents with old COI capitalization (both ZTDF and legacy paths)
        const resourcesWithOldCOI = await resourcesCollection.find({
            $or: [
                { 'ztdf.policy.securityLabel.COI': { $in: ['ALPHA', 'BETA', 'GAMMA'] } },
                { 'legacy.COI': { $in: ['ALPHA', 'BETA', 'GAMMA'] } },
                { 'securityLabel.COI': { $in: ['ALPHA', 'BETA', 'GAMMA'] } }
            ]
        }).toArray();

        console.log(`   Found ${resourcesWithOldCOI.length} documents with old COI capitalization`);

        for (const doc of resourcesWithOldCOI) {
            try {
                const updateFields: any = { updatedAt: new Date() };

                // Update ZTDF path if it exists
                if (doc.ztdf?.policy?.securityLabel?.COI) {
                    const updatedZtdfCOI = doc.ztdf.policy.securityLabel.COI.map((coi: string) => 
                        COI_MAPPING[coi] || coi
                    );
                    updateFields['ztdf.policy.securityLabel.COI'] = updatedZtdfCOI;
                    
                    // Update display marking
                    if (doc.ztdf.policy.securityLabel.displayMarking) {
                        let displayMarking = doc.ztdf.policy.securityLabel.displayMarking;
                        Object.entries(COI_MAPPING).forEach(([oldCOI, newCOI]) => {
                            displayMarking = displayMarking.replace(new RegExp(oldCOI, 'g'), newCOI);
                        });
                        updateFields['ztdf.policy.securityLabel.displayMarking'] = displayMarking;
                    }
                }

                // Update legacy path if it exists
                if (doc.legacy?.COI) {
                    const updatedLegacyCOI = doc.legacy.COI.map((coi: string) => 
                        COI_MAPPING[coi] || coi
                    );
                    updateFields['legacy.COI'] = updatedLegacyCOI;
                }

                // Update old securityLabel path if it exists
                if (doc.securityLabel?.COI) {
                    const updatedSecurityCOI = doc.securityLabel.COI.map((coi: string) => 
                        COI_MAPPING[coi] || coi
                    );
                    updateFields['securityLabel.COI'] = updatedSecurityCOI;
                }

                await resourcesCollection.updateOne(
                    { _id: doc._id },
                    { $set: updateFields }
                );

                stats.resources++;
                
                if (stats.resources % 100 === 0) {
                    console.log(`   Updated ${stats.resources} documents...`);
                }
            } catch (error) {
                const errorMsg = `Failed to update resource ${doc.resourceId}: ${error}`;
                console.error(`   ❌ ${errorMsg}`);
                stats.errors.push(errorMsg);
            }
        }

        console.log(`✅ Updated ${stats.resources} resources\n`);

        // ============================================
        // 2. Update COI Keys Collection
        // ============================================
        console.log('🔑 Migrating coi_keys collection...');
        const coiKeysCollection = db.collection('coi_keys');

        for (const [oldCOI, newCOI] of Object.entries(COI_MAPPING)) {
            try {
                const result = await coiKeysCollection.updateOne(
                    { coiId: oldCOI },
                    { 
                        $set: { 
                            coiId: newCOI,
                            name: newCOI,
                            updatedAt: new Date()
                        } 
                    }
                );

                if (result.modifiedCount > 0) {
                    stats.coiKeys++;
                    console.log(`   ✅ Updated ${oldCOI} → ${newCOI}`);
                } else {
                    console.log(`   ℹ️  ${oldCOI} not found (may already be migrated or doesn't exist)`);
                }
            } catch (error) {
                const errorMsg = `Failed to update COI key ${oldCOI}: ${error}`;
                console.error(`   ❌ ${errorMsg}`);
                stats.errors.push(errorMsg);
            }
        }

        console.log(`✅ Updated ${stats.coiKeys} COI keys\n`);

        // ============================================
        // 3. Update Authorization Logs Collection
        // ============================================
        console.log('📋 Migrating authorization_logs collection...');
        const authLogsCollection = db.collection('authorization_logs');

        // Update logs with COI references in input.resource.COI
        const logsWithOldCOI = await authLogsCollection.find({
            $or: [
                { 'input.resource.COI': { $in: ['ALPHA', 'BETA', 'GAMMA'] } }
            ]
        }).toArray();

        console.log(`   Found ${logsWithOldCOI.length} logs with old COI capitalization`);

        for (const log of logsWithOldCOI) {
            try {
                const updatedCOI = log.input.resource.COI.map((coi: string) => 
                    COI_MAPPING[coi] || coi
                );

                await authLogsCollection.updateOne(
                    { _id: log._id },
                    { 
                        $set: { 
                            'input.resource.COI': updatedCOI
                        } 
                    }
                );

                stats.authLogs++;
                
                if (stats.authLogs % 100 === 0) {
                    console.log(`   Updated ${stats.authLogs} logs...`);
                }
            } catch (error) {
                const errorMsg = `Failed to update log ${log._id}: ${error}`;
                console.error(`   ❌ ${errorMsg}`);
                stats.errors.push(errorMsg);
            }
        }

        console.log(`✅ Updated ${stats.authLogs} authorization logs\n`);

        // ============================================
        // 4. Update KAS Keys Collection
        // ============================================
        console.log('🔐 Migrating kas_keys collection...');
        const kasKeysCollection = db.collection('kas_keys');

        // Find all KAS keys with old COI references
        const kasKeysWithOldCOI = await kasKeysCollection.find({
            $or: [
                { coiId: { $in: ['ALPHA', 'BETA', 'GAMMA'] } }
            ]
        }).toArray();

        console.log(`   Found ${kasKeysWithOldCOI.length} KAS keys with old COI capitalization`);

        for (const kasKey of kasKeysWithOldCOI) {
            try {
                const newCOI = COI_MAPPING[kasKey.coiId] || kasKey.coiId;

                await kasKeysCollection.updateOne(
                    { _id: kasKey._id },
                    { 
                        $set: { 
                            coiId: newCOI,
                            updatedAt: new Date()
                        } 
                    }
                );

                stats.kasKeys++;
                console.log(`   ✅ Updated KAS key for ${kasKey.coiId} → ${newCOI}`);
            } catch (error) {
                const errorMsg = `Failed to update KAS key ${kasKey._id}: ${error}`;
                console.error(`   ❌ ${errorMsg}`);
                stats.errors.push(errorMsg);
            }
        }

        console.log(`✅ Updated ${stats.kasKeys} KAS keys\n`);

    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        await client.close();
        console.log('👋 MongoDB connection closed\n');
    }

    return stats;
}

async function main() {
    console.log('🚀 COI Capitalization Migration');
    console.log('================================\n');
    console.log('Migrating:');
    console.log('  ALPHA → Alpha');
    console.log('  BETA → Beta');
    console.log('  GAMMA → Gamma\n');

    const DRY_RUN = process.argv.includes('--dry-run');
    
    if (DRY_RUN) {
        console.log('⚠️  DRY RUN MODE - No changes will be made\n');
        console.log('Migration would update the following collections:');
        console.log('  1. resources (document COI arrays)');
        console.log('  2. coi_keys (coiId and name fields)');
        console.log('  3. authorization_logs (COI references)');
        console.log('  4. kas_keys (COI references)\n');
        console.log('Run without --dry-run to apply changes.\n');
        process.exit(0);
    }

    try {
        const stats = await migrateCOICapitalization();

        console.log('📊 Migration Summary:');
        console.log('===================');
        console.log(`✅ Resources updated: ${stats.resources}`);
        console.log(`✅ COI keys updated: ${stats.coiKeys}`);
        console.log(`✅ Auth logs updated: ${stats.authLogs}`);
        console.log(`✅ KAS keys updated: ${stats.kasKeys}`);
        
        if (stats.errors.length > 0) {
            console.log(`\n⚠️  Errors encountered: ${stats.errors.length}`);
            stats.errors.forEach((err, idx) => {
                console.log(`   ${idx + 1}. ${err}`);
            });
        }

        console.log('\n✅ Migration completed successfully!\n');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

// Run migration
main();

