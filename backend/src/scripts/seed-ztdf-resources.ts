import { MongoClient } from 'mongodb';
import { config } from 'dotenv';
import crypto from 'crypto';

// Load environment variables
config({ path: '.env.local' });

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGODB_DATABASE || 'dive-v3';
const COLLECTION = 'resources';

// ============================================
// Configuration
// ============================================

const NUM_RESOURCES = 500;

// Classification levels
const CLASSIFICATIONS = ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];

// Countries (ISO 3166-1 alpha-3)
const COUNTRIES = ['USA', 'GBR', 'FRA', 'DEU', 'CAN', 'ITA', 'ESP', 'NLD', 'POL', 'AUS', 'NZL'];

// Communities of Interest
const COIS = ['NATO-COSMIC', 'FVEY', 'US-ONLY', 'CAN-US', 'EU-RESTRICTED', 'QUAD'];

// Resource types
const RESOURCE_TYPES = [
    'Operational Plan',
    'Intelligence Summary',
    'Tactical Brief',
    'Logistics Plan',
    'Strategic Assessment',
    'Technical Manual',
    'Policy Document',
    'Training Material',
    'Threat Analysis',
    'Situational Report'
];

// Organizations
const ORGANIZATIONS = [
    'U.S. Department of Defense',
    'NATO Allied Command Operations',
    'UK Ministry of Defence',
    'French Ministry of Armed Forces',
    'German Federal Ministry of Defence',
    'Canadian Department of National Defence',
    'Australian Department of Defence',
    'New Zealand Defence Force'
];

// ============================================
// Utility Functions
// ============================================

function randomItem<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
}

function randomSubset<T>(array: T[], minSize: number = 1, maxSize?: number): T[] {
    const size = Math.floor(Math.random() * (maxSize || array.length - minSize + 1)) + minSize;
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, size);
}

function generateBase64(length: number): string {
    return crypto.randomBytes(length).toString('base64');
}

/**
 * Compute SHA-384 hash (matches ztdf.utils.ts)
 */
function computeSHA384(data: string | Buffer): string {
    const hash = crypto.createHash('sha384');
    hash.update(data);
    return hash.digest('hex');
}

/**
 * Compute hash of JSON object (canonical, matches ztdf.utils.ts)
 */
function computeObjectHash(obj: any): string {
    const canonical = JSON.stringify(obj, Object.keys(obj).sort());
    return computeSHA384(canonical);
}

function encryptContent(content: string, resourceId: string): { encryptedData: string; iv: string; authTag: string; dek: string } {
    // Generate DETERMINISTIC DEK based on resourceId (for pilot consistency)
    // In production, this would be a true random DEK wrapped by KEK
    // For pilot: Use SHA256(resourceId + salt) to ensure seed and KAS generate same DEK
    const salt = 'dive-v3-pilot-dek-salt';
    const dekHash = crypto.createHash('sha256').update(resourceId + salt).digest();
    const dek = dekHash; // 32 bytes (256 bits) for AES-256-GCM

    // Generate IV (Initialization Vector)
    const iv = crypto.randomBytes(12); // 96-bit IV for GCM

    // Create cipher
    const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);

    // Encrypt content
    let encrypted = cipher.update(content, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    // Get auth tag
    const authTag = cipher.getAuthTag();

    return {
        encryptedData: encrypted,
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        dek: dek.toString('base64')
    };
}

function generateClassificationMarking(classification: string, releasabilityTo: string[], coi: string[]): string {
    let marking = classification.replace('_', ' ');

    if (coi.length > 0) {
        marking += '//' + coi.join('//');
    }

    if (releasabilityTo.length > 0 && releasabilityTo.length < 11) {
        marking += '//REL ' + releasabilityTo.join(', ');
    }

    return marking;
}

function generateContent(resourceId: string, classification: string, type: string): string {
    const classLevel = CLASSIFICATIONS.indexOf(classification);
    const sensitivity = ['Public', 'Sensitive', 'Highly Sensitive', 'Extremely Sensitive'][classLevel];

    return `${type.toUpperCase()} - ${resourceId}

Classification: ${classification}
Sensitivity: ${sensitivity}

EXECUTIVE SUMMARY:
This ${type.toLowerCase()} provides comprehensive analysis and operational guidance 
for coalition forces conducting joint operations. The information contained herein 
is derived from multiple intelligence sources and operational assessments.

SITUATION OVERVIEW:
Current operational environment requires coordinated response from coalition partners.
Intelligence indicates evolving threat landscape requiring adaptive countermeasures.
Logistical considerations include supply chain management and force projection capabilities.

OPERATIONAL REQUIREMENTS:
- Multi-domain operations coordination
- Intelligence sharing protocols
- Secure communications infrastructure
- Resource allocation and prioritization
- Risk mitigation strategies

SECURITY CONSIDERATIONS:
This document contains ${sensitivity.toLowerCase()} information that requires appropriate
handling and protection measures. Unauthorized disclosure could cause ${classLevel === 0 ? 'minimal' :
            classLevel === 1 ? 'serious' :
                classLevel === 2 ? 'grave' : 'exceptionally grave'
        } damage to national security.

DISTRIBUTION:
Releasability determined by security classification and community of interest requirements.
All handlers must adhere to information protection protocols and access control policies.

VALIDATION:
Document authenticity verified through cryptographic integrity controls.
Zero Trust Data Format (ZTDF) ensures policy-bound protection.

END OF DOCUMENT

Generated: ${new Date().toISOString()}
Document ID: ${resourceId}
`;
}

// ============================================
// ZTDF Resource Generator
// ============================================

function generateZTDFResource(index: number) {
    const resourceId = `doc-ztdf-${String(index).padStart(4, '0')}`;
    const resourceType = randomItem(RESOURCE_TYPES);
    const classification = randomItem(CLASSIFICATIONS);
    const encrypted = Math.random() > 0.3; // 70% encrypted

    // Determine releasability based on classification
    let releasabilityTo: string[];
    if (classification === 'UNCLASSIFIED') {
        releasabilityTo = randomSubset(COUNTRIES, 3, 11); // 3-11 countries
    } else if (classification === 'CONFIDENTIAL') {
        releasabilityTo = randomSubset(COUNTRIES, 1, 5); // 1-5 countries
    } else if (classification === 'SECRET') {
        releasabilityTo = randomSubset(COUNTRIES, 1, 3); // 1-3 countries
    } else {
        releasabilityTo = randomSubset(COUNTRIES, 1, 2); // 1-2 countries (TOP_SECRET)
    }

    // Determine COI
    const coi = Math.random() > 0.5 ? randomSubset(COIS, 0, 2) : [];

    // Generate content
    const plainContent = generateContent(resourceId, classification, resourceType);

    // Encrypt if necessary
    let encryptedChunk;
    let dek: string | undefined;
    let iv: string;
    let authTag: string;

    if (encrypted) {
        const encResult = encryptContent(plainContent, resourceId);
        encryptedChunk = encResult.encryptedData;
        dek = encResult.dek;
        iv = encResult.iv;
        authTag = encResult.authTag;
    } else {
        iv = generateBase64(12);
        authTag = generateBase64(16);
    }

    // Generate KAO if encrypted
    const keyAccessObjects = encrypted && dek ? [{
        kaoId: `kao-${resourceId}`,
        kasUrl: 'http://localhost:8080',
        kasId: 'dive-v3-kas',
        wrappedKey: generateBase64(256), // Mock wrapped DEK
        wrappingAlgorithm: 'RSA-OAEP-256',
        policyBinding: {
            clearanceRequired: classification,
            countriesAllowed: releasabilityTo,
            coiRequired: coi
        },
        createdAt: new Date().toISOString()
    }] : [];

    // Create STANAG 4774 display marking
    const displayMarking = generateClassificationMarking(classification, releasabilityTo, coi);

    // Build policy object WITHOUT hash first (for correct hash computation)
    const policyWithoutHash: any = {
        policyVersion: '1.0',
        securityLabel: {
            classification,
            releasabilityTo,
            COI: coi,
            caveats: [],
            originatingCountry: releasabilityTo[0],
            creationDate: new Date().toISOString(),
            displayMarking
        },
        policyAssertions: [
            {
                type: 'clearance_required',
                value: classification,
                condition: 'user.clearance >= resource.classification'
            },
            {
                type: 'country_releasable',
                value: releasabilityTo,
                condition: 'user.country in resource.releasabilityTo'
            }
        ]
    };

    // Compute policy hash from the complete policy object (matches validation logic)
    const policyHash = computeObjectHash(policyWithoutHash);

    // Build encrypted chunks array
    const encryptedChunks = encrypted ? [{
        chunkId: 1,
        encryptedData: encryptedChunk!,
        size: encryptedChunk!.length,
        integrityHash: computeSHA384(encryptedChunk!) // Compute chunk hash
    }] : [];

    // Compute payload hash from concatenated chunk data (matches validation logic lines 113-116)
    // The validation function does: chunksData = chunks.map(c => c.encryptedData).join('')
    const chunksData = encryptedChunks.map(chunk => chunk.encryptedData).join('');
    const payloadHash = computeSHA384(chunksData);

    // Build complete payload object with computed hash
    const payload = {
        encryptionAlgorithm: 'AES-256-GCM',
        iv,
        authTag,
        payloadHash,
        keyAccessObjects,
        encryptedChunks
    };

    // Build complete ZTDF structure with computed hashes
    const ztdf = {
        manifest: {
            objectId: resourceId,
            objectType: 'resource',
            version: '1.0',
            contentType: 'text/plain',
            payloadSize: plainContent.length,
            owner: `user-${Math.floor(Math.random() * 100)}@mil`,
            ownerOrganization: randomItem(ORGANIZATIONS),
            createdAt: new Date().toISOString(),
            modifiedAt: new Date().toISOString()
        },
        policy: {
            ...policyWithoutHash,
            policyHash
        },
        payload
    };

    // Build complete resource
    return {
        resourceId,
        title: `${resourceType} - ${resourceId}`,
        classification,
        releasabilityTo,
        COI: coi,
        encrypted,
        creationDate: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(), // Random date in last 30 days
        ztdf,
        // Legacy fields for backward compatibility
        legacy: {
            content: encrypted ? null : plainContent
        },
        createdAt: new Date(),
        updatedAt: new Date()
    };
}

// ============================================
// Seed Database
// ============================================

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

        // Generate resources
        console.log(`\n🏭 Generating ${NUM_RESOURCES} ZTDF resources...`);
        const resources = [];

        for (let i = 1; i <= NUM_RESOURCES; i++) {
            resources.push(generateZTDFResource(i));
            if (i % 50 === 0) {
                console.log(`   Generated ${i}/${NUM_RESOURCES} resources...`);
            }
        }

        // Insert in batches
        const BATCH_SIZE = 100;
        let inserted = 0;

        console.log(`\n📊 Inserting resources in batches of ${BATCH_SIZE}...`);
        for (let i = 0; i < resources.length; i += BATCH_SIZE) {
            const batch = resources.slice(i, i + BATCH_SIZE);
            await collection.insertMany(batch);
            inserted += batch.length;
            console.log(`   Inserted ${inserted}/${NUM_RESOURCES} resources...`);
        }

        // Create indexes
        console.log('\n📇 Creating indexes...');
        await collection.createIndex({ resourceId: 1 }, { unique: true });
        await collection.createIndex({ classification: 1 });
        await collection.createIndex({ releasabilityTo: 1 });
        await collection.createIndex({ COI: 1 });
        await collection.createIndex({ 'ztdf.manifest.objectId': 1 });
        await collection.createIndex({ encrypted: 1 });
        console.log('✅ Indexes created');

        // Generate statistics
        console.log('\n📊 Database Statistics:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        const stats = {
            total: await collection.countDocuments({}),
            byClassification: {} as Record<string, number>,
            encrypted: await collection.countDocuments({ encrypted: true }),
            unencrypted: await collection.countDocuments({ encrypted: false })
        };

        for (const classification of CLASSIFICATIONS) {
            stats.byClassification[classification] = await collection.countDocuments({ classification });
        }

        console.log(`\n  Total Resources: ${stats.total}`);
        console.log(`  Encrypted: ${stats.encrypted} (${Math.round(stats.encrypted / stats.total * 100)}%)`);
        console.log(`  Unencrypted: ${stats.unencrypted} (${Math.round(stats.unencrypted / stats.total * 100)}%)`);
        console.log('\n  By Classification:');
        for (const [classification, count] of Object.entries(stats.byClassification)) {
            console.log(`    ${classification}: ${count} (${Math.round(count / stats.total * 100)}%)`);
        }

        // Sample resources
        console.log('\n📋 Sample Resources:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        const samples = await collection.find({}).limit(5).toArray();

        for (const resource of samples) {
            console.log(`\n  📄 ${resource.resourceId}`);
            console.log(`     Title: ${resource.title}`);
            console.log(`     Classification: ${resource.classification}`);
            console.log(`     Releasability: ${resource.releasabilityTo.join(', ')}`);
            console.log(`     COI: ${resource.COI.length > 0 ? resource.COI.join(', ') : 'None'}`);
            console.log(`     Encrypted: ${resource.encrypted ? 'Yes' : 'No'}`);
            if (resource.encrypted && resource.ztdf?.payload?.keyAccessObjects?.length > 0) {
                console.log(`     KAO ID: ${resource.ztdf.payload.keyAccessObjects[0].kaoId}`);
            }
        }
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        console.log('\n✅ Database seeded successfully!');
        console.log(`\n💡 ${NUM_RESOURCES} resources created with full ZTDF structures`);
        console.log('   - All resources have complete manifest, policy, and payload');
        console.log('   - Encrypted resources have KAO IDs and wrapped keys');
        console.log('   - Varied classifications, countries, and COIs for stress testing');
        console.log('   - Ready for OPA policy testing and KAS flow visualization');

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

