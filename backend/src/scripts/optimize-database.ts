#!/usr/bin/env tsx

/**
 * Database Optimization Script (Phase 3)
 * 
 * Purpose: Create indexes for hot queries to improve performance
 * Usage: npm run optimize-database
 * 
 * Collections optimized:
 * - idp_submissions: Status queries, SLA queries, tier filtering
 * - audit_logs: Time-series queries, event filtering
 * - resources: Resource lookup, classification filtering
 * 
 * Expected improvements:
 * - 50-90% reduction in query time for indexed fields
 * - Better support for pagination and sorting
 * - Improved performance under load
 */

import { MongoClient, Db } from 'mongodb';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/dive-v3';

/**
 * Index definitions for each collection
 */
const INDEX_DEFINITIONS = {
    idp_submissions: [
        {
            name: 'status_slaDeadline_idx',
            keys: { status: 1, slaDeadline: 1 },
            description: 'Query submissions by status and SLA deadline (for SLA monitoring)',
        },
        {
            name: 'comprehensiveRiskScore_tier_idx',
            keys: { 'comprehensiveRiskScore.tier': 1 },
            description: 'Filter submissions by risk tier (gold/silver/bronze/fail)',
        },
        {
            name: 'fastTrack_slaDeadline_idx',
            keys: { fastTrack: 1, slaDeadline: 1 },
            description: 'Query fast-track submissions with upcoming deadlines',
        },
        {
            name: 'submittedAt_idx',
            keys: { submittedAt: -1 },
            description: 'Sort submissions by submission date (most recent first)',
        },
        {
            name: 'status_submittedAt_idx',
            keys: { status: 1, submittedAt: -1 },
            description: 'Filter by status and sort by date',
        },
        {
            name: 'alias_unique_idx',
            keys: { alias: 1 },
            unique: true,
            description: 'Ensure unique IdP aliases',
        },
        {
            name: 'slaStatus_slaDeadline_idx',
            keys: { slaStatus: 1, slaDeadline: 1 },
            description: 'Query submissions by SLA status (within/approaching/exceeded)',
        },
    ],

    audit_logs: [
        {
            name: 'timestamp_idx',
            keys: { timestamp: -1 },
            description: 'Time-series queries (most recent first)',
        },
        {
            name: 'acp240EventType_timestamp_idx',
            keys: { acp240EventType: 1, timestamp: -1 },
            description: 'Filter by event type and sort by time',
        },
        {
            name: 'subject_timestamp_idx',
            keys: { subject: 1, timestamp: -1 },
            description: 'User activity queries',
        },
        {
            name: 'outcome_timestamp_idx',
            keys: { outcome: 1, timestamp: -1 },
            description: 'Query by outcome (success/failure/violation)',
        },
        {
            name: 'resourceId_timestamp_idx',
            keys: { resourceId: 1, timestamp: -1 },
            description: 'Resource access history',
        },
        {
            name: 'classification_timestamp_idx',
            keys: { classification: 1, timestamp: -1 },
            description: 'Filter by classification level',
        },
        {
            name: 'timestamp_ttl_idx',
            keys: { timestamp: 1 },
            expireAfterSeconds: 7776000, // 90 days (ACP-240 compliance)
            description: 'TTL index for log retention (90 days)',
        },
    ],

    resources: [
        {
            name: 'resourceId_unique_idx',
            keys: { resourceId: 1 },
            unique: true,
            description: 'Unique resource identifier lookup',
        },
        {
            name: 'ztdf_policy_classification_idx',
            keys: { 'ztdf.policy.securityLabel.classification': 1 },
            description: 'Filter by ZTDF classification level',
        },
        {
            name: 'ztdf_policy_releasabilityTo_idx',
            keys: { 'ztdf.policy.securityLabel.releasabilityTo': 1 },
            description: 'Filter by ZTDF releasability countries',
        },
        {
            name: 'createdAt_idx',
            keys: { createdAt: -1 },
            description: 'Sort resources by creation date',
        },
        {
            name: 'classification_idx',
            keys: { classification: 1 },
            description: 'Filter by legacy classification level',
        },
        {
            name: 'releasabilityTo_idx',
            keys: { releasabilityTo: 1 },
            description: 'Filter by legacy releasability',
        },
        {
            name: 'encrypted_idx',
            keys: { encrypted: 1 },
            description: 'Filter encrypted vs plaintext resources',
        },
    ],
};

/**
 * Create indexes for a collection
 */
async function createIndexesForCollection(
    db: Db,
    collectionName: string,
    indexes: any[]
): Promise<void> {
    console.log(`\n📊 Optimizing collection: ${collectionName}`);
    console.log('─'.repeat(60));

    const collection = db.collection(collectionName);

    // Check if collection exists
    const collections = await db.listCollections({ name: collectionName }).toArray();
    if (collections.length === 0) {
        console.log(`⚠️  Collection '${collectionName}' does not exist. Skipping...`);
        return;
    }

    // Get existing indexes
    const existingIndexes = await collection.indexes();
    const existingIndexNames = existingIndexes.map(idx => idx.name);

    console.log(`📋 Existing indexes: ${existingIndexNames.join(', ')}`);

    let created = 0;
    let skipped = 0;

    for (const indexDef of indexes) {
        try {
            if (existingIndexNames.includes(indexDef.name)) {
                console.log(`  ✓ ${indexDef.name} (already exists)`);
                skipped++;
                continue;
            }

            const options: any = { name: indexDef.name };
            if (indexDef.unique) {
                options.unique = true;
            }
            if (indexDef.expireAfterSeconds) {
                options.expireAfterSeconds = indexDef.expireAfterSeconds;
            }

            await collection.createIndex(indexDef.keys, options);

            console.log(`  ✅ Created: ${indexDef.name}`);
            console.log(`     Keys: ${JSON.stringify(indexDef.keys)}`);
            console.log(`     Purpose: ${indexDef.description}`);
            created++;
        } catch (error) {
            console.error(`  ❌ Failed to create ${indexDef.name}:`, error);
        }
    }

    console.log(`\n📈 Summary for ${collectionName}:`);
    console.log(`   Created: ${created}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Total: ${existingIndexNames.length + created}`);
}

/**
 * Analyze index usage
 */
async function analyzeIndexUsage(db: Db, collectionName: string): Promise<void> {
    console.log(`\n🔍 Analyzing index usage: ${collectionName}`);
    console.log('─'.repeat(60));

    const collection = db.collection(collectionName);

    try {
        // Get index statistics
        const stats = await collection.aggregate([
            { $indexStats: {} }
        ]).toArray();

        if (stats.length === 0) {
            console.log('  No index statistics available');
            return;
        }

        console.log(`\n📊 Index Usage Statistics:`);
        for (const stat of stats) {
            const usage = stat.accesses?.ops || 0;
            const name = stat.name;
            const usageIndicator = usage === 0 ? '⚠️ ' : usage < 10 ? '⚡' : '✨';
            
            console.log(`  ${usageIndicator} ${name}: ${usage} operations`);
        }
    } catch (error) {
        console.log('  Index statistics not available (requires admin privileges)');
    }
}

/**
 * Get collection statistics
 */
async function getCollectionStats(db: Db, collectionName: string): Promise<void> {
    console.log(`\n📊 Collection Statistics: ${collectionName}`);
    console.log('─'.repeat(60));

    const collection = db.collection(collectionName);

    try {
        const stats = await collection.stats();
        const docCount = stats.count || 0;
        const avgDocSize = stats.avgObjSize ? (stats.avgObjSize / 1024).toFixed(2) : 0;
        const totalSize = stats.size ? (stats.size / 1024 / 1024).toFixed(2) : 0;
        const indexSize = stats.totalIndexSize ? (stats.totalIndexSize / 1024 / 1024).toFixed(2) : 0;

        console.log(`  Documents: ${docCount.toLocaleString()}`);
        console.log(`  Avg Doc Size: ${avgDocSize} KB`);
        console.log(`  Total Size: ${totalSize} MB`);
        console.log(`  Index Size: ${indexSize} MB`);
    } catch (error) {
        console.log('  Statistics not available');
    }
}

/**
 * Main optimization function
 */
async function optimizeDatabase(): Promise<void> {
    console.log('╔═════════════════════════════════════════════════════════╗');
    console.log('║    DIVE V3 - Database Optimization Script (Phase 3)    ║');
    console.log('╚═════════════════════════════════════════════════════════╝');
    console.log(`\nConnecting to: ${MONGODB_URI}\n`);

    let client: MongoClient | null = null;

    try {
        // Connect to MongoDB
        client = new MongoClient(MONGODB_URI);
        await client.connect();
        console.log('✅ Connected to MongoDB\n');

        const db = client.db();

        // Create indexes for each collection
        for (const [collectionName, indexes] of Object.entries(INDEX_DEFINITIONS)) {
            await createIndexesForCollection(db, collectionName, indexes);
            await getCollectionStats(db, collectionName);
            await analyzeIndexUsage(db, collectionName);
        }

        // Summary
        console.log('\n╔═════════════════════════════════════════════════════════╗');
        console.log('║                  Optimization Complete                  ║');
        console.log('╚═════════════════════════════════════════════════════════╝');
        console.log('\n📋 Collections Optimized:');
        console.log(`   • idp_submissions: ${INDEX_DEFINITIONS.idp_submissions.length} indexes`);
        console.log(`   • audit_logs: ${INDEX_DEFINITIONS.audit_logs.length} indexes`);
        console.log(`   • resources: ${INDEX_DEFINITIONS.resources.length} indexes`);
        console.log('\n💡 Tips:');
        console.log('   • Monitor query performance using .explain()');
        console.log('   • Check index usage with db.collection.aggregate([{$indexStats:{}}])');
        console.log('   • Drop unused indexes to save space');
        console.log('   • Re-run this script after schema changes\n');

    } catch (error) {
        console.error('\n❌ Error during optimization:', error);
        process.exit(1);
    } finally {
        if (client) {
            await client.close();
            console.log('Disconnected from MongoDB\n');
        }
    }
}

// Run if executed directly
if (require.main === module) {
    optimizeDatabase()
        .then(() => {
            console.log('✅ Database optimization completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Database optimization failed:', error);
            process.exit(1);
        });
}

export { optimizeDatabase, INDEX_DEFINITIONS };

