/**
 * Initialize Clearance Equivalency Collection
 *
 * Populates MongoDB with clearance mappings from TypeScript SSOT
 * Run during deployment to seed clearance_equivalency collection
 *
 * Phase 2: MongoDB SSOT Implementation
 * Date: 2026-01-04
 */

import { getMongoDBUrl, getMongoDBName } from '../utils/mongodb-config';
import { MongoClient, Db } from 'mongodb';
import { ClearanceEquivalencyDBService } from '../services/clearance-equivalency-db.service';
import { logger } from '../utils/logger';

/**
 * Main initialization function
 */
async function main(): Promise<void> {
    let db: Db | undefined;
    let client: MongoClient | undefined;

    try {
        console.log('🔧 Initializing Clearance Equivalency Collection...\n');

        // Connect to MongoDB
        console.log('📡 Connecting to MongoDB...');
        const mongoUrl = getMongoDBUrl();
        const dbName = getMongoDBName();
        client = new MongoClient(mongoUrl);
        await client.connect();
        db = client.db(dbName);
        console.log('✅ Connected to MongoDB\n');

        // Create service instance
        const service = new ClearanceEquivalencyDBService(db);

        // Initialize collection
        console.log('📝 Populating clearance_equivalency collection...');
        await service.initialize();
        console.log('✅ Collection initialized\n');

        // Validate mappings
        console.log('🔍 Validating clearance mappings...');
        const validation = await service.validate();

        if (validation.valid) {
            console.log('✅ Validation successful\n');
        } else {
            console.error('❌ Validation failed:');
            validation.errors.forEach(err => console.error(`   - ${err}`));
            console.log('');
            process.exit(1);
        }

        // Get and display statistics
        console.log('📊 Collection Statistics:');
        const stats = await service.getStats();
        console.log(`   - Clearance Levels: ${stats.totalLevels}`);
        console.log(`   - Countries Supported: ${stats.totalCountries}`);
        console.log(`   - Total Mappings: ${stats.totalMappings}`);
        console.log(`   - Last Updated: ${stats.lastUpdated?.toISOString() || 'N/A'}`);
        console.log('');

        // Get list of supported countries
        console.log('🌍 Supported Countries:');
        const countries = await service.getSupportedCountries();
        console.log(`   ${countries.join(', ')}`);
        console.log(`   Total: ${countries.length} countries\n`);

        console.log('✅ Clearance equivalency initialization complete!');
        console.log('');
        console.log('Next steps:');
        console.log('1. Verify with: db.clearance_equivalency.find().pretty()');
        console.log('2. Backend will now use MongoDB for clearance mappings');
        console.log('3. Update mappings without code deployment using admin API');

        process.exit(0);

    } catch (error) {
        console.error('❌ Initialization failed:');
        console.error(error instanceof Error ? error.message : String(error));

        logger.error('Clearance equivalency initialization failed', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        });

        process.exit(1);

    } finally {
        // Close database connection
        if (client) {
            await client.close();
        }
    }
}

// Run if executed directly
if (require.main === module) {
    main();
}

export { main };
