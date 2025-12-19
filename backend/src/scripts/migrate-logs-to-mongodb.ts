/**
 * Migration Script: Backfill Audit Logs to MongoDB
 * 
 * Reads existing authz.log file and imports all ACP-240 events into MongoDB
 * so they appear in the admin dashboard.
 * 
 * Usage: npx ts-node src/scripts/migrate-logs-to-mongodb.ts
 */

import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';
const DB_NAME = 'dive-v3';
const LOGS_COLLECTION = 'audit_logs';
const LOG_FILE_PATH = path.join(process.cwd(), 'logs', 'authz.log');

interface LogEntry {
    acp240EventType?: string;
    timestamp?: string;
    requestId?: string;
    subject?: string;
    action?: string;
    resourceId?: string;
    outcome?: 'ALLOW' | 'DENY';
    reason?: string;
    subjectAttributes?: any;
    resourceAttributes?: any;
    policyEvaluation?: any;
    context?: any;
    latencyMs?: number;
}

async function migrateLogsToMongoDB() {
    console.log('🔄 Starting log migration to MongoDB...\n');

    // Check if log file exists
    if (!fs.existsSync(LOG_FILE_PATH)) {
        console.error(`❌ Log file not found: ${LOG_FILE_PATH}`);
        console.log('No logs to migrate. Exiting.');
        return;
    }

    // Connect to MongoDB
    console.log('📡 Connecting to MongoDB...');
    const client = new MongoClient(MONGODB_URL);

    try {
        await client.connect();
        const db = client.db(DB_NAME);
        const collection = db.collection(LOGS_COLLECTION);

        console.log('✅ Connected to MongoDB\n');

        // Create indexes for better query performance
        console.log('📊 Creating indexes...');
        await collection.createIndex({ timestamp: -1 });
        await collection.createIndex({ acp240EventType: 1 });
        await collection.createIndex({ subject: 1 });
        await collection.createIndex({ resourceId: 1 });
        await collection.createIndex({ outcome: 1 });
        await collection.createIndex({ requestId: 1 });
        console.log('✅ Indexes created\n');

        // Read and parse log file
        console.log(`📖 Reading log file: ${LOG_FILE_PATH}`);
        const fileStream = fs.createReadStream(LOG_FILE_PATH);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        let processedCount = 0;
        let insertedCount = 0;
        let skippedCount = 0;
        const batch: LogEntry[] = [];
        const BATCH_SIZE = 100;

        for await (const line of rl) {
            try {
                // Parse JSON log entry
                const logEntry = JSON.parse(line);

                // Check if this is an ACP-240 audit event
                if (logEntry.acp240EventType) {
                    // Create document for MongoDB
                    const document: LogEntry = {
                        acp240EventType: logEntry.acp240EventType,
                        timestamp: logEntry.timestamp,
                        requestId: logEntry.requestId,
                        subject: logEntry.subject,
                        action: logEntry.action,
                        resourceId: logEntry.resourceId,
                        outcome: logEntry.outcome,
                        reason: logEntry.reason,
                        subjectAttributes: logEntry.subjectAttributes,
                        resourceAttributes: logEntry.resourceAttributes,
                        policyEvaluation: logEntry.policyEvaluation,
                        context: logEntry.context,
                        latencyMs: logEntry.latencyMs
                    };

                    batch.push(document);
                    processedCount++;

                    // Insert batch when size reached
                    if (batch.length >= BATCH_SIZE) {
                        await collection.insertMany(batch);
                        insertedCount += batch.length;
                        batch.length = 0;
                        process.stdout.write(`\r📥 Inserted ${insertedCount} events...`);
                    }
                } else {
                    skippedCount++;
                }
            } catch (error) {
                // Skip malformed lines
                skippedCount++;
            }
        }

        // Insert remaining batch
        if (batch.length > 0) {
            await collection.insertMany(batch);
            insertedCount += batch.length;
        }

        console.log(`\n\n✅ Migration complete!`);
        console.log(`   Total ACP-240 events: ${processedCount}`);
        console.log(`   Inserted to MongoDB: ${insertedCount}`);
        console.log(`   Skipped (non-audit): ${skippedCount}`);
        console.log(`\n📊 Database Stats:`);

        const stats = await collection.countDocuments();
        console.log(`   Total documents in collection: ${stats}`);

        // Show sample stats
        const eventTypeCounts = await collection
            .aggregate([
                { $group: { _id: '$acp240EventType', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ])
            .toArray();

        console.log(`\n📈 Event Type Breakdown:`);
        eventTypeCounts.forEach((item) => {
            console.log(`   ${item._id}: ${item.count}`);
        });

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await client.close();
        console.log('\n🔌 MongoDB connection closed');
    }
}

// Run migration
migrateLogsToMongoDB()
    .then(() => {
        console.log('\n✨ Migration successful! Your admin dashboard should now show logs.');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
