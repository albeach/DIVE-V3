/**
 * Seed MongoDB with sample ZTDF resources
 * 
 * This script creates a set of test resources with various classifications,
 * releasability, and COI tags for demonstration and testing purposes.
 * 
 * Usage:
 *   npm run seed-database
 *   or
 *   tsx src/scripts/seed-resources.ts
 */

import { MongoClient } from 'mongodb';
import { TEST_RESOURCES } from '../__tests__/helpers/test-fixtures';

// Use environment variable or fallback
const MONGODB_URL = process.env.MONGODB_URI || process.env.MONGODB_URL || 'mongodb://admin:password@localhost:27017';
const DB_NAME = 'dive-v3';

async function main() {
    console.log('🌱 Seeding MongoDB with Sample ZTDF Resources');
    console.log('================================================\n');

    const client = new MongoClient(MONGODB_URL);

    try {
        await client.connect();
        console.log('✅ Connected to MongoDB\n');

        const db = client.db(DB_NAME);
        const collection = db.collection('resources');

        // Clear existing test resources
        const deleteResult = await collection.deleteMany({
            resourceId: { $in: Object.values(TEST_RESOURCES).map(r => r.resourceId) }
        });
        console.log(`🗑️  Deleted ${deleteResult.deletedCount} existing test resources\n`);

        // Insert test resources
        const resources = Object.values(TEST_RESOURCES);
        const insertResult = await collection.insertMany(resources);
        console.log(`✅ Inserted ${insertResult.insertedCount} sample resources\n`);

        // Display summary
        console.log('📊 Sample Resources Created:');
        console.log('============================\n');

        for (const resource of resources) {
            const classification = resource.ztdf.policy.securityLabel.classification;
            const releasability = resource.ztdf.policy.securityLabel.releasabilityTo.join(', ');
            const coi = resource.ztdf.policy.securityLabel.COI?.length 
                ? resource.ztdf.policy.securityLabel.COI.join(', ') 
                : 'None';

            console.log(`📄 ${resource.resourceId}`);
            console.log(`   Title: ${resource.title}`);
            console.log(`   Classification: ${classification}`);
            console.log(`   Releasability: ${releasability}`);
            console.log(`   COI: ${coi}`);
            console.log('');
        }

        // Verify final count
        const totalCount = await collection.countDocuments({});
        console.log(`\n✅ Total resources in database: ${totalCount}`);
        console.log('\n🎉 Database seeding complete!');

    } catch (error) {
        console.error('❌ Error seeding database:', error);
        throw error;
    } finally {
        await client.close();
        console.log('\n✅ MongoDB connection closed');
    }
}

// Run if called directly
if (require.main === module) {
    main()
        .then(() => {
            console.log('\n✅ Seed script completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Seed script failed:', error);
            process.exit(1);
        });
}

export { main as seedResources };



