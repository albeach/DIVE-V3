/**
 * Seed 1,000 Random ZTDF-Encrypted Documents
 * 
 * Generates diverse test data with:
 * - All 4 classification levels
 * - Random country combinations
 * - Random COI combinations
 * - All documents KAS-encrypted with ZTDF format
 * 
 * Date: October 21, 2025
 */

import { MongoClient } from 'mongodb';
import crypto from 'crypto';

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://admin:password@localhost:27017';
const DB_NAME = 'dive-v3';
const KAS_URL = 'http://kas:8080/request-key';

// Classification levels
const CLASSIFICATIONS = ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];

// Countries (NATO + Partners)
const COUNTRIES = [
    'USA', 'GBR', 'FRA', 'DEU', 'CAN', 'ITA', 'ESP', 'POL',
    'NLD', 'BEL', 'NOR', 'DNK', 'PRT', 'TUR', 'GRC', 'CZE',
    'HUN', 'ROU', 'BGR', 'SVK', 'SVN', 'HRV', 'ALB', 'MNE',
    'LTU', 'LVA', 'EST', 'ISL', 'LUX', 'MKD', 'FIN', 'SWE',
    'AUS', 'NZL', 'JPN', 'KOR'
];

// Communities of Interest
const COIS = [
    'FVEY',           // Five Eyes
    'NATO-COSMIC',    // NATO Top Secret
    'US-ONLY',        // US Only
    'CAN-US',         // Canada-US
    'EU-RESTRICTED',  // EU Restricted
    'QUAD',           // Quadrilateral Security Dialogue
    'AUKUS',          // Australia-UK-US
    'NORTHCOM',       // North American Command
    'EUCOM',          // European Command
    'PACOM',          // Pacific Command
    'CENTCOM',        // Central Command
    'SOCOM',          // Special Operations Command
];

// Document title templates
const TITLE_PREFIXES = [
    'Operational Plan', 'Intelligence Report', 'Strategic Assessment', 'Tactical Brief',
    'Defense White Paper', 'Logistics Plan', 'Training Manual', 'Field Report',
    'Threat Analysis', 'Joint Exercise', 'Maritime Operations', 'Air Defense',
    'Cyber Security', 'Command Brief', 'Coalition Strategy', 'Mission Summary'
];

const TITLE_SUBJECTS = [
    'Northern Flank', 'Southern Theater', 'Eastern Border', 'Western Alliance',
    'Arctic Operations', 'Mediterranean', 'Baltic Sea', 'North Atlantic',
    'Pacific Region', 'Middle East', 'Central Europe', 'Balkans',
    'Cyber Domain', 'Space Operations', 'Maritime Security', 'Air Superiority'
];

// Helper: Random element from array
function random<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

// Helper: Random subset of array (1 to max elements)
function randomSubset<T>(arr: T[], min: number = 1, max?: number): T[] {
    const count = Math.floor(Math.random() * ((max || arr.length) - min + 1)) + min;
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

// Helper: Generate random date within range
function randomDate(startDate: Date, endDate: Date): Date {
    const start = startDate.getTime();
    const end = endDate.getTime();
    return new Date(start + Math.random() * (end - start));
}

// Helper: Create ZTDF-encrypted document
function createZTDFDocument(index: number) {
    const resourceId = `doc-generated-${Date.now()}-${index.toString().padStart(4, '0')}`;
    const classification = random(CLASSIFICATIONS);

    // Releasability: Higher classifications = fewer countries
    let releasabilityCount;
    switch (classification) {
        case 'TOP_SECRET': releasabilityCount = [1, 2, 3]; break;
        case 'SECRET': releasabilityCount = [2, 3, 4, 5]; break;
        case 'CONFIDENTIAL': releasabilityCount = [3, 4, 5, 6]; break;
        case 'UNCLASSIFIED': releasabilityCount = [5, 10, 15, 20]; break;
        default: releasabilityCount = [3, 5];
    }

    const releasabilityTo = randomSubset(
        COUNTRIES,
        releasabilityCount[0],
        releasabilityCount[releasabilityCount.length - 1]
    );

    // COI: 0-3 COIs per document (some have none)
    const hasCOI = Math.random() > 0.3; // 70% have COI
    const COI = hasCOI ? randomSubset(COIS, 0, 3) : [];

    // Creation date: Random within last 12 months
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const creationDate = randomDate(oneYearAgo, new Date());

    // Generate unique title
    const title = `${random(TITLE_PREFIXES)} - ${random(TITLE_SUBJECTS)} ${index}`;

    // Generate encryption keys
    const dek = crypto.randomBytes(32); // 256-bit DEK
    const wrappedKey = dek.toString('base64');

    // Generate sample content (encrypted placeholder)
    const content = `This is classified ${classification} content for ${title}. ` +
        `Releasable to: ${releasabilityTo.join(', ')}. ` +
        `${COI.length > 0 ? `COI: ${COI.join(', ')}.` : ''} ` +
        `This document contains sensitive information related to coalition operations.`;

    const encryptedContent = crypto.randomBytes(128).toString('base64'); // Mock encrypted content
    const payloadHash = crypto.createHash('sha384').update(encryptedContent).digest('hex');

    // Build ZTDF security label display marking (STANAG 4774)
    let displayMarking = classification;
    if (COI.length > 0) {
        displayMarking += `//${COI.join('/')}`;
    }
    displayMarking += `//REL ${releasabilityTo.join(', ')}`;

    // Build KAOs (1-2 per document for redundancy)
    const kaoCount = Math.random() > 0.5 ? 2 : 1;
    const keyAccessObjects = [];

    for (let i = 0; i < kaoCount; i++) {
        const kaoId = `kao-${i === 0 ? '' : 'fvey-'}${resourceId}`;
        keyAccessObjects.push({
            kaoId,
            kasUrl: KAS_URL,
            kasId: 'dive-v3-kas-pilot',
            wrappedKey,
            wrappingAlgorithm: 'RSA-OAEP-256',
            policyBinding: {
                clearanceRequired: classification,
                countriesAllowed: releasabilityTo,
                coiRequired: COI
            }
        });
    }

    // Build complete ZTDF document
    return {
        resourceId,
        title,
        ztdf: {
            version: '1.0',
            manifest: {
                version: '1.0',
                objectId: resourceId,  // REQUIRED: Unique object identifier
                objectType: 'document',
                createdAt: creationDate.toISOString(),  // REQUIRED
                owner: '550e8400-e29b-41d4-a716-446655440001',  // john.doe UUID
                ownerOrganization: 'US_ARMY',
                contentType: 'text/plain',
                payloadSize: Buffer.byteLength(encryptedContent, 'base64'),  // REQUIRED
                resourceId  // Legacy field for compatibility
            },
            policy: {
                version: '1.0',
                policyVersion: '1.0',
                encryptionAlgorithm: 'AES-256-GCM',
                kaoCount,
                securityLabel: {
                    classification,
                    releasabilityTo,
                    COI,
                    creationDate: creationDate.toISOString(),
                    displayMarking
                },
                policyAssertions: [  // REQUIRED: Machine-readable policy assertions
                    {
                        type: 'clearance-required',
                        value: classification
                    },
                    {
                        type: 'countries-allowed',
                        value: releasabilityTo.join(',')
                    }
                ]
            },
            payload: {
                encryptedContent,
                payloadHash,
                keyAccessObjects
            },
            integrity: {
                algorithm: 'SHA-384',  // Use SHA-384 to match validation
                manifestHash: crypto.createHash('sha384').update(JSON.stringify({})).digest('hex'),
                policyHash: crypto.createHash('sha384').update(JSON.stringify({})).digest('hex'),
                payloadHash,
                timestamp: new Date().toISOString()
            }
        },
        // Legacy fields for compatibility
        legacy: {
            content: `[ZTDF Encrypted - ${kaoCount} KAO(s)]`
        },
        createdAt: creationDate,
        updatedAt: new Date()
    };
}

async function main() {
    console.log('🔑 Seeding 1,000 ZTDF-Encrypted Documents');
    console.log('==========================================\n');

    const client = new MongoClient(MONGODB_URL, {
        authSource: 'admin',
        auth: {
            username: 'admin',
            password: 'password'
        }
    });

    try {
        await client.connect();
        console.log('✅ Connected to MongoDB\n');

        const db = client.db(DB_NAME);
        const collection = db.collection('resources');

        // Clear existing generated documents (keep seeded examples)
        const deleteResult = await collection.deleteMany({
            resourceId: { $regex: /^doc-generated-/ }
        });
        console.log(`🗑️  Cleared ${deleteResult.deletedCount} existing generated documents\n`);

        // Generate 1,000 documents in batches
        const BATCH_SIZE = 100;
        const TOTAL_DOCS = 1000;

        for (let batch = 0; batch < TOTAL_DOCS / BATCH_SIZE; batch++) {
            const documents = [];
            const startIdx = batch * BATCH_SIZE;

            for (let i = 0; i < BATCH_SIZE; i++) {
                documents.push(createZTDFDocument(startIdx + i + 1));
            }

            await collection.insertMany(documents);
            console.log(`✅ Batch ${batch + 1}/${TOTAL_DOCS / BATCH_SIZE}: Inserted ${BATCH_SIZE} documents (${startIdx + 1}-${startIdx + BATCH_SIZE})`);
        }

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Statistics
        const stats = await collection.aggregate([
            { $match: { resourceId: { $regex: /^doc-generated-/ } } },
            {
                $group: {
                    _id: '$ztdf.policy.securityLabel.classification',
                    count: { $sum: 1 }
                }
            }
        ]).toArray();

        console.log('📊 Document Statistics:\n');
        stats.forEach(stat => {
            console.log(`   ${stat._id}: ${stat.count} documents`);
        });

        const totalCount = await collection.countDocuments({ resourceId: { $regex: /^doc-generated-/ } });
        console.log(`\n   Total Generated: ${totalCount} documents`);

        // Sample some documents
        console.log('\n📄 Sample Documents:\n');
        const samples = await collection.find({ resourceId: { $regex: /^doc-generated-/ } })
            .limit(5)
            .toArray();

        samples.forEach((doc, idx) => {
            console.log(`   ${idx + 1}. ${doc.title}`);
            console.log(`      Classification: ${doc.ztdf.policy.securityLabel.classification}`);
            console.log(`      Releasable to: ${doc.ztdf.policy.securityLabel.releasabilityTo.join(', ')}`);
            console.log(`      COI: ${doc.ztdf.policy.securityLabel.COI.join(', ') || 'None'}`);
            console.log(`      KAO Count: ${doc.ztdf.policy.kaoCount}`);
            console.log('');
        });

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('✅ Seeding complete!\n');
        console.log('🎯 Test Features:');
        console.log('   • Browse 1,000+ documents at /resources');
        console.log('   • Filter by classification');
        console.log('   • Filter by country');
        console.log('   • Filter by COI');
        console.log('   • All documents have KAS encryption');
        console.log('   • All documents use ZTDF format');
        console.log('   • Pagination (25/50/100 per page)');
        console.log('');

    } catch (error) {
        console.error('❌ Error seeding documents:', error);
        throw error;
    } finally {
        await client.close();
        console.log('🔌 MongoDB connection closed\n');
    }
}

main();

