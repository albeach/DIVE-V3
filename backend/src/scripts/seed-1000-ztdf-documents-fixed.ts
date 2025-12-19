/**
 * Seed 1,000 Valid ZTDF-Encrypted Documents (COI COHERENCE FIX)
 * 
 * CRITICAL FIXES:
 * 1. Deterministic COI → Releasability derivation (no random combos)
 * 2. Enforces mutual exclusivity (US-ONLY ⊥ foreign-sharing COIs)
 * 3. Validates subset/superset with coiOperator (prevents widening)
 * 4. NOFORN → US-ONLY + REL USA only
 * 5. All documents pass strict COI validation
 * 
 * Date: October 21, 2025
 */

import { MongoClient } from 'mongodb';
import { generateDisplayMarking, COIOperator, ClassificationLevel } from '../types/ztdf.types';
import { encryptContent, computeSHA384, computeObjectHash } from '../utils/ztdf.utils';
import { validateCOICoherence } from '../services/coi-validation.service';

// CRITICAL: No hardcoded passwords - use MONGODB_URL from GCP Secret Manager
const MONGODB_URL = process.env.MONGODB_URL || (() => { throw new Error('MONGODB_URL not set'); })();
const DB_NAME = process.env.MONGODB_DATABASE || 'dive-v3';
const KAS_URL = process.env.KAS_URL || 'https://kas:8080';

// Classification levels
const CLASSIFICATIONS: ClassificationLevel[] = ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];

// ============================================
// DETERMINISTIC COI TEMPLATES
// ============================================

/**
 * COI Template with derived releasability
 * Each template is self-consistent and validated
 */
interface ICOITemplate {
    coi: string[];
    coiOperator: COIOperator;
    releasabilityTo: string[];
    caveats: string[];
    description: string;
}

/**
 * Authoritative COI templates (no random generation)
 * Each template passes validation
 */
const COI_TEMPLATES: ICOITemplate[] = [
    // 1. US-ONLY (NOFORN)
    {
        coi: ['US-ONLY'],
        coiOperator: 'ALL',
        releasabilityTo: ['USA'],
        caveats: ['NOFORN'],
        description: 'US-ONLY with NOFORN caveat'
    },

    // 2. CAN-US Bilateral
    {
        coi: ['CAN-US'],
        coiOperator: 'ALL',
        releasabilityTo: ['CAN', 'USA'],
        caveats: [],
        description: 'Canada-US bilateral'
    },

    // 3. GBR-US Bilateral (UKUSA)
    {
        coi: ['GBR-US'],
        coiOperator: 'ALL',
        releasabilityTo: ['GBR', 'USA'],
        caveats: [],
        description: 'UK-US bilateral'
    },

    // 4. FRA-US Bilateral
    {
        coi: ['FRA-US'],
        coiOperator: 'ALL',
        releasabilityTo: ['FRA', 'USA'],
        caveats: [],
        description: 'France-US bilateral'
    },

    // 5. FVEY (Five Eyes)
    {
        coi: ['FVEY'],
        coiOperator: 'ALL',
        releasabilityTo: ['USA', 'GBR', 'CAN', 'AUS', 'NZL'],
        caveats: [],
        description: 'Five Eyes full membership'
    },

    // 6. AUKUS (Australia-UK-US)
    {
        coi: ['AUKUS'],
        coiOperator: 'ALL',
        releasabilityTo: ['AUS', 'GBR', 'USA'],
        caveats: [],
        description: 'AUKUS trilateral'
    },

    // 7. NATO (general)
    {
        coi: ['NATO'],
        coiOperator: 'ALL',
        releasabilityTo: ['USA', 'GBR', 'FRA', 'DEU', 'ITA', 'ESP', 'POL', 'CAN'],
        caveats: [],
        description: 'NATO subset (major partners)'
    },

    // 8. NATO-COSMIC (Top Secret NATO)
    {
        coi: ['NATO-COSMIC'],
        coiOperator: 'ALL',
        releasabilityTo: ['USA', 'GBR', 'FRA', 'DEU'],
        caveats: [],
        description: 'NATO COSMIC TOP SECRET'
    },

    // 9. EU-RESTRICTED (EU-only, no NATO-COSMIC)
    {
        coi: ['EU-RESTRICTED'],
        coiOperator: 'ALL',
        releasabilityTo: ['FRA', 'DEU', 'ITA', 'ESP', 'POL', 'BEL', 'NLD'],
        caveats: [],
        description: 'EU Restricted (no US)'
    },

    // 10. QUAD (Quadrilateral Security Dialogue)
    {
        coi: ['QUAD'],
        coiOperator: 'ALL',
        releasabilityTo: ['USA', 'AUS', 'IND', 'JPN'],
        caveats: [],
        description: 'Quad partnership'
    },

    // 11. NORTHCOM (North America)
    {
        coi: ['NORTHCOM'],
        coiOperator: 'ALL',
        releasabilityTo: ['USA', 'CAN', 'MEX'],
        caveats: [],
        description: 'North American Command'
    },

    // 12. EUCOM (European Command)
    {
        coi: ['EUCOM'],
        coiOperator: 'ALL',
        releasabilityTo: ['USA', 'DEU', 'GBR', 'FRA', 'ITA', 'ESP', 'POL'],
        caveats: [],
        description: 'European Command partners'
    },

    // 13. PACOM (Pacific Command)
    {
        coi: ['PACOM'],
        coiOperator: 'ALL',
        releasabilityTo: ['USA', 'JPN', 'KOR', 'AUS', 'NZL', 'PHL'],
        caveats: [],
        description: 'Pacific Command partners'
    },

    // 14. SOCOM (Special Operations - FVEY)
    {
        coi: ['SOCOM'],
        coiOperator: 'ALL',
        releasabilityTo: ['USA', 'GBR', 'CAN', 'AUS', 'NZL'],
        caveats: [],
        description: 'Special Operations Command (FVEY)'
    },

    // 15. US-only (no NOFORN caveat, general release)
    {
        coi: ['US-ONLY'],
        coiOperator: 'ALL',
        releasabilityTo: ['USA'],
        caveats: [],
        description: 'US-only (no foreign release)'
    },

    // ============================================
    // MULTI-COI TEMPLATES (Creates Multi-KAS)
    // Note: Must avoid subset/superset conflicts with ANY operator
    // ============================================

    // 16. NATO + QUAD (Multi-COI - disjoint sets)
    {
        coi: ['NATO', 'QUAD'],
        coiOperator: 'ANY',
        releasabilityTo: ['USA', 'GBR', 'FRA', 'DEU', 'ITA', 'ESP', 'POL', 'CAN', 'AUS', 'IND', 'JPN'],
        caveats: [],
        description: 'NATO + QUAD (Multi-COI with 2 KAOs)'
    },

    // 17. EUCOM + PACOM (Multi-COI - regional commands)
    {
        coi: ['EUCOM', 'PACOM'],
        coiOperator: 'ANY',
        releasabilityTo: ['USA', 'DEU', 'GBR', 'FRA', 'ITA', 'ESP', 'POL', 'JPN', 'KOR', 'AUS', 'NZL', 'PHL'],
        caveats: [],
        description: 'EUCOM + PACOM (Multi-COI)'
    },

    // 18. NORTHCOM + EUCOM (Multi-COI - regional)
    {
        coi: ['NORTHCOM', 'EUCOM'],
        coiOperator: 'ANY',
        releasabilityTo: ['USA', 'CAN', 'MEX', 'DEU', 'GBR', 'FRA', 'ITA', 'ESP', 'POL'],
        caveats: [],
        description: 'NORTHCOM + EUCOM (Multi-COI)'
    },

    // 19. CAN-US + GBR-US (Multi-COI - bilateral combinations)
    {
        coi: ['CAN-US', 'GBR-US'],
        coiOperator: 'ANY',
        releasabilityTo: ['USA', 'CAN', 'GBR'],
        caveats: [],
        description: 'CAN-US + GBR-US (Multi-bilateral COI)'
    },

    // 20. FRA-US + GBR-US (Multi-COI - European bilaterals)
    {
        coi: ['FRA-US', 'GBR-US'],
        coiOperator: 'ANY',
        releasabilityTo: ['USA', 'FRA', 'GBR'],
        caveats: [],
        description: 'FRA-US + GBR-US (Multi-bilateral COI)'
    }
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

function random<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(startDate: Date, endDate: Date): Date {
    const start = startDate.getTime();
    const end = endDate.getTime();
    return new Date(start + Math.random() * (end - start));
}

/**
 * Create properly formatted ZTDF document with VALIDATED COI coherence
 */
async function createValidZTDFDocument(index: number) {
    const resourceId = `doc-generated-${Date.now()}-${index.toString().padStart(4, '0')}`;

    // Step 1: Pick classification
    const classification = random(CLASSIFICATIONS);

    // Step 2: Pick COI template (deterministic, validated)
    const template = random(COI_TEMPLATES);

    // Step 3: Use template's releasability and COI (already validated)
    const { coi: COI, coiOperator, releasabilityTo, caveats } = template;

    // Step 4: VALIDATE (should always pass, but safety check)
    const validation = await validateCOICoherence({
        classification,
        releasabilityTo,
        COI,
        coiOperator,
        caveats
    });

    if (!validation.valid) {
        throw new Error(
            `Template validation failed for ${template.description}: ${validation.errors.join('; ')}`
        );
    }

    // Random creation date (past 12 months)
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const creationDate = randomDate(oneYearAgo, new Date());
    const currentTimestamp = new Date().toISOString();

    // Generate title
    const title = `${random(TITLE_PREFIXES)} - ${random(TITLE_SUBJECTS)} ${index}`;

    // Generate content
    const content = `${classification} Document: ${title}\n\n` +
        `This document contains ${classification.toLowerCase()} information for coalition operations.\n` +
        `COI: ${COI.join(', ')} (Operator: ${coiOperator})\n` +
        `Releasable to: ${releasabilityTo.join(', ')}\n` +
        `${caveats.length > 0 ? `Caveats: ${caveats.join(', ')}\n` : ''}` +
        `\nDocument ID: ${resourceId}\n` +
        `Created: ${creationDate.toISOString()}\n\n` +
        `OPERATIONAL SUMMARY:\nThis is sample classified content for demonstration purposes.\n` +
        `Template: ${template.description}`;

    // Use COI-based encryption
    const selectedCOI = COI.length > 0 ? COI[0] : 'DEFAULT';
    const encryptionResult = encryptContent(content, resourceId, selectedCOI);

    const wrappedKey = encryptionResult.dek;

    // 1. Manifest
    const manifest = {
        version: '1.0',
        objectId: resourceId,
        objectType: 'document',
        contentType: 'text/plain',
        owner: '550e8400-e29b-41d4-a716-446655440001',
        ownerOrganization: 'US_ARMY',
        createdAt: currentTimestamp,
        payloadSize: Buffer.from(encryptionResult.encryptedData, 'base64').length
    };

    // 2. Security Label (with coiOperator)
    const securityLabel = {
        classification,
        releasabilityTo,
        COI,
        coiOperator,
        caveats,
        originatingCountry: 'USA',
        creationDate: currentTimestamp,
        displayMarking: generateDisplayMarking({
            classification,
            releasabilityTo,
            COI,
            coiOperator,
            caveats,
            originatingCountry: 'USA',
            creationDate: currentTimestamp
        })
    };

    // 3. Policy Assertions
    const policyAssertions = [
        {
            type: 'clearance-required',
            value: classification
        },
        {
            type: 'countries-allowed',
            value: releasabilityTo.join(',')
        },
        {
            type: 'coi-required',
            value: COI.join(',')
        },
        {
            type: 'coi-operator',
            value: coiOperator
        }
    ];

    // 4. Create KAOs (Multi-KAS for 50% of documents)
    let kaoCount: number;
    if (COI.length > 1) {
        // Multi-COI documents always get multiple KAOs (1 per COI)
        kaoCount = COI.length;
    } else {
        // Single-COI documents: 50% get 1 KAO, 30% get 2 KAOs, 20% get 3 KAOs
        const rand = Math.random();
        if (rand < 0.5) {
            kaoCount = 1; // 50% Single KAS
        } else if (rand < 0.8) {
            kaoCount = 2; // 30% Dual KAS
        } else {
            kaoCount = 3; // 20% Triple KAS
        }
    }

    const keyAccessObjects = [];
    // For pilot: all KAOs point to the single running KAS instance
    // In production, these would be separate KAS endpoints
    const kasInstances = [
        { kasId: 'dive-v3-kas-pilot', kasUrl: `${KAS_URL}/request-key`, description: 'Primary KAS' },
        { kasId: 'dive-v3-kas-pilot', kasUrl: `${KAS_URL}/request-key`, description: 'FVEY KAS (pilot: same endpoint)' },
        { kasId: 'dive-v3-kas-pilot', kasUrl: `${KAS_URL}/request-key`, description: 'NATO KAS (pilot: same endpoint)' }
    ];

    for (let i = 0; i < kaoCount; i++) {
        const kasInstance = kasInstances[i % kasInstances.length];
        // Generate unique kaoId by including index to prevent duplicates
        const kaoId = COI.length > 1 && i < COI.length
            ? `kao-${COI[i]}-${resourceId}`
            : `kao-${kasInstance.kasId}-${i}-${resourceId}`;

        keyAccessObjects.push({
            kaoId,
            kasUrl: kasInstance.kasUrl,
            kasId: kasInstance.kasId,
            wrappedKey,
            wrappingAlgorithm: 'RSA-OAEP-256',
            policyBinding: {
                clearanceRequired: classification,
                countriesAllowed: releasabilityTo,
                coiRequired: COI.length > 1 && i < COI.length ? [COI[i]] : COI
            }
        });
    }

    // 5. Policy with hash
    const policy = {
        version: '1.0',
        policyVersion: '1.0',
        securityLabel,
        policyAssertions
    };

    const policyHash = computeObjectHash(policy);
    const policyWithHash = {
        ...policy,
        policyHash
    };

    // 6. Create encrypted chunk
    const chunk = {
        chunkId: 0,
        encryptedData: encryptionResult.encryptedData,
        integrityHash: computeSHA384(encryptionResult.encryptedData)
    };

    // 7. Payload
    const payload = {
        encryptionAlgorithm: 'AES-256-GCM',
        iv: encryptionResult.iv,
        authTag: encryptionResult.authTag,
        keyAccessObjects,
        encryptedChunks: [chunk],
        payloadHash: ''
    };

    const chunksData = payload.encryptedChunks.map(c => c.encryptedData).join('');
    payload.payloadHash = computeSHA384(chunksData);

    // 8. Assemble ZTDF object
    const ztdfObject = {
        manifest,
        policy: policyWithHash,
        payload
    };

    // 9. Return ZTDF resource
    return {
        resourceId,
        title,
        ztdf: ztdfObject,
        legacy: {
            classification,
            releasabilityTo,
            COI,
            coiOperator,
            encrypted: true,
            encryptedContent: chunk.encryptedData
        },
        createdAt: creationDate,
        updatedAt: new Date()
    };
}

async function main() {
    console.log('🔑 Seeding 1,000 VALID ZTDF-Encrypted Documents (COI COHERENCE FIX)');
    console.log('=====================================================================\n');

    // Validate all templates first
    console.log('✅ Validating COI templates...\n');
    for (const template of COI_TEMPLATES) {
        const validation = await validateCOICoherence({
            classification: 'SECRET',
            releasabilityTo: template.releasabilityTo,
            COI: template.coi,
            coiOperator: template.coiOperator,
            caveats: template.caveats
        });

        if (!validation.valid) {
            console.error(`❌ Template validation failed: ${template.description}`);
            console.error(`   Errors: ${validation.errors.join('; ')}`);
            process.exit(1);
        }

        console.log(`   ✅ ${template.description}`);
        console.log(`      COI: [${template.coi.join(', ')}] (${template.coiOperator})`);
        console.log(`      REL: [${template.releasabilityTo.join(', ')}]`);
        console.log('');
    }

    // Credentials should be in MONGODB_URL
    const client = new MongoClient(MONGODB_URL);

    try {
        await client.connect();
        console.log('✅ Connected to MongoDB\n');

        const db = client.db(DB_NAME);
        const collection = db.collection('resources');

        // Clear existing generated documents
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
                documents.push(createValidZTDFDocument(startIdx + i + 1));
            }

            await collection.insertMany(documents);
            console.log(`✅ Batch ${batch + 1}/${TOTAL_DOCS / BATCH_SIZE}: ${BATCH_SIZE} valid ZTDF documents (${startIdx + 1}-${startIdx + BATCH_SIZE})`);
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
        console.log(`\n   Total: ${totalCount} valid ZTDF documents`);

        // Multi-KAS statistics
        const kasStats = await collection.aggregate([
            { $match: { resourceId: { $regex: /^doc-generated-/ } } },
            {
                $project: {
                    kaoCount: { $size: '$ztdf.payload.keyAccessObjects' }
                }
            },
            {
                $group: {
                    _id: '$kaoCount',
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]).toArray();

        console.log('\n🔑 Multi-KAS Distribution:\n');
        kasStats.forEach(stat => {
            const kasType = stat._id === 1 ? 'Single KAS' : `${stat._id} KAS (Multi-KAS)`;
            const percentage = ((stat.count / totalCount) * 100).toFixed(1);
            console.log(`   ${kasType}: ${stat.count} documents (${percentage}%)`);
        });

        console.log('\n✅ ALL DOCUMENTS PASS STRICT COI COHERENCE VALIDATION\n');
        console.log('COI Coherence Features:');
        console.log('  • Deterministic COI → Releasability mapping');
        console.log('  • US-ONLY ⊥ foreign-sharing COIs enforced');
        console.log('  • NOFORN → US-ONLY + REL USA only');
        console.log('  • Subset/superset conflicts prevented');
        console.log('  • coiOperator field (ALL/ANY) included');
        console.log('  • No random COI/REL combinations');
        console.log('  • ' + COI_TEMPLATES.length + ' validated templates');
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
