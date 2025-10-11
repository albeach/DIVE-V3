import { MongoClient } from 'mongodb';
import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.local' });

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGODB_DATABASE || 'dive-v3';
const COLLECTION = 'resources';

interface SampleResource {
    resourceId: string;
    title: string;
    classification: string;
    releasabilityTo: string[];
    COI: string[];
    creationDate?: string;
    encrypted: boolean;
    content?: string;
    encryptedContent?: string;
}

const sampleResources: SampleResource[] = [
    {
        resourceId: 'doc-nato-ops-001',
        title: 'NATO Operational Plan - EXAMPLE',
        classification: 'SECRET',
        releasabilityTo: ['USA', 'GBR', 'FRA', 'DEU', 'CAN'],
        COI: ['NATO-COSMIC'],
        creationDate: '2025-09-15T00:00:00Z',
        encrypted: false,
        content: 'This is a sample NATO operational plan for coalition exercises. Contains strategic planning information for multinational operations in accordance with NATO protocols and procedures.'
    },
    {
        resourceId: 'doc-us-only-tactical',
        title: 'U.S. Tactical Brief - EXAMPLE',
        classification: 'SECRET',
        releasabilityTo: ['USA'],
        COI: ['US-ONLY'],
        creationDate: '2025-10-01T00:00:00Z',
        encrypted: false,
        content: 'U.S.-only tactical brief for operational planning. Contains sensitive information restricted to United States personnel only. NOT RELEASABLE TO FOREIGN NATIONALS.'
    },
    {
        resourceId: 'doc-fvey-intel',
        title: 'FVEY Intelligence Summary - EXAMPLE',
        classification: 'TOP_SECRET',
        releasabilityTo: ['USA', 'GBR', 'CAN', 'AUS', 'NZL'],
        COI: ['FVEY'],
        creationDate: '2025-10-10T00:00:00Z',
        encrypted: true,
        encryptedContent: 'aGF2Mko3RnNkZjg5c2RmODlzZGY4OXNkZjg5c2RmODk=:YXV0aFRhZzEyMw==:Y2lwaGVydGV4dDQ1Ng==',
        content: null as any
    },
    {
        resourceId: 'doc-fra-defense',
        title: 'French Defense White Paper - EXAMPLE',
        classification: 'CONFIDENTIAL',
        releasabilityTo: ['FRA'],
        COI: [],
        creationDate: '2025-09-20T00:00:00Z',
        encrypted: false,
        content: 'French defense strategic priorities and force modernization plans. CONFIDENTIEL DÉFENSE - Releasable to France only. Contains French national security information.'
    },
    {
        resourceId: 'doc-can-logistics',
        title: 'Canadian Logistics Plan - EXAMPLE',
        classification: 'CONFIDENTIAL',
        releasabilityTo: ['CAN', 'USA'],
        COI: ['CAN-US'],
        creationDate: '2025-10-05T00:00:00Z',
        encrypted: false,
        content: 'Canadian Forces logistics support plan for joint operations with United States. Covers supply chain coordination and resource sharing agreements.'
    },
    {
        resourceId: 'doc-unclass-public',
        title: 'Unclassified Coalition Brief - EXAMPLE',
        classification: 'UNCLASSIFIED',
        releasabilityTo: ['USA', 'GBR', 'FRA', 'DEU', 'CAN', 'ITA', 'ESP', 'NLD', 'POL'],
        COI: [],
        creationDate: '2025-08-01T00:00:00Z',
        encrypted: false,
        content: 'Public coalition briefing materials for multinational training exercises. UNCLASSIFIED / PUBLICLY RELEASABLE. General information on coalition cooperation and joint exercises.'
    },
    {
        resourceId: 'doc-future-embargo',
        title: 'Future Intelligence Report (Embargoed) - EXAMPLE',
        classification: 'SECRET',
        releasabilityTo: ['USA', 'GBR', 'CAN'],
        COI: ['FVEY'],
        creationDate: '2025-11-01T00:00:00Z', // Future date - embargoed until Nov 1
        encrypted: false,
        content: 'Intelligence report not yet approved for release. EMBARGOED UNTIL 2025-11-01. Contains time-sensitive intelligence requiring delayed release approval.'
    },
    {
        resourceId: 'doc-industry-partner',
        title: 'Industry Partnership Agreement - EXAMPLE',
        classification: 'CONFIDENTIAL',
        releasabilityTo: ['USA'],
        COI: [], // No COI required for industry documents
        creationDate: '2025-09-25T00:00:00Z',
        encrypted: false,
        content: 'Partnership agreement between Department of Defense and industry partners for technology collaboration. CONFIDENTIAL - U.S. Government and approved contractors only.'
    }
];

async function seedDatabase() {
    let client: MongoClient | null = null;

    try {
        console.log('🔌 Connecting to MongoDB...');
        console.log(`   URL: ${MONGODB_URL}`);
        console.log(`   Database: ${DB_NAME}`);

        client = new MongoClient(MONGODB_URL);
        await client.connect();
        console.log('✅ Connected to MongoDB');

        const db = client.db(DB_NAME);
        const collection = db.collection(COLLECTION);

        // Clear existing data
        const deleteResult = await collection.deleteMany({});
        console.log(`🗑️  Cleared ${deleteResult.deletedCount} existing resources`);

        // Insert sample resources with timestamps
        const resourcesWithTimestamps = sampleResources.map(r => ({
            ...r,
            createdAt: new Date(),
            updatedAt: new Date()
        }));

        const result = await collection.insertMany(resourcesWithTimestamps);
        console.log(`📊 Inserted ${result.insertedCount} resources`);

        // Create indexes
        await collection.createIndex({ resourceId: 1 }, { unique: true });
        await collection.createIndex({ classification: 1 });
        await collection.createIndex({ releasabilityTo: 1 });
        await collection.createIndex({ COI: 1 });
        console.log('📇 Created indexes');

        // Display seeded resources
        console.log('\n📋 Seeded Resources:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        for (const resource of sampleResources) {
            console.log(`\n  📄 ${resource.resourceId}`);
            console.log(`     Title: ${resource.title}`);
            console.log(`     Classification: ${resource.classification}`);
            console.log(`     Releasability: ${resource.releasabilityTo.join(', ')}`);
            console.log(`     COI: ${resource.COI.length > 0 ? resource.COI.join(', ') : 'None'}`);
            console.log(`     Encrypted: ${resource.encrypted ? 'Yes' : 'No'}`);
            if (resource.creationDate) {
                console.log(`     Creation Date: ${resource.creationDate}`);
            }
        }
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        console.log('\n✅ Database seeded successfully!');
        console.log('\n💡 Test Scenarios:');
        console.log('   1. U.S. SECRET user → doc-nato-ops-001 (ALLOW)');
        console.log('   2. U.S. SECRET user → doc-us-only-tactical (ALLOW)');
        console.log('   3. FRA SECRET user → doc-us-only-tactical (DENY - releasability)');
        console.log('   4. U.S. CONFIDENTIAL user → doc-fvey-intel (DENY - clearance)');
        console.log('   5. Any user → doc-future-embargo (DENY - embargo until Nov 1)');
        console.log('   6. FRA user → doc-fra-defense (ALLOW if FRA)');
        console.log('   7. Any user → doc-unclass-public (ALLOW)');
        console.log('   8. Industry user → doc-industry-partner (ALLOW if USA)');

    } catch (error) {
        console.error('❌ Seed failed:', error);
        process.exit(1);
    } finally {
        if (client) {
            await client.close();
            console.log('\n🔌 MongoDB connection closed');
        }
    }
}

// Run seed function
seedDatabase().catch(console.error);

