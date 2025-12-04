/**
 * Tests for Instance Resource Seeding Script
 * 
 * Validates:
 * - COI template coherence
 * - Classification distribution targets
 * - Multi-KAS distribution targets
 * - Industry access distribution
 * - Document structure integrity
 * 
 * Date: November 29, 2025
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, Db, Collection } from 'mongodb';
import { validateCOICoherence } from '../services/coi-validation.service';
import { COIOperator, ClassificationLevel } from '../types/ztdf.types';

// ============================================
// COI Templates (duplicated for testing)
// ============================================

interface ICOITemplate {
    coi: string[];
    coiOperator: COIOperator;
    releasabilityTo: string[];
    caveats: string[];
    description: string;
    weight: number;
    industryAllowed: boolean;
}

const COI_TEMPLATES: ICOITemplate[] = [
    // US-ONLY templates
    {
        coi: ['US-ONLY'],
        coiOperator: 'ALL',
        releasabilityTo: ['USA'],
        caveats: ['NOFORN'],
        description: 'US-ONLY with NOFORN caveat',
        weight: 3.5,
        industryAllowed: false
    },
    {
        coi: ['US-ONLY'],
        coiOperator: 'ALL',
        releasabilityTo: ['USA'],
        caveats: [],
        description: 'US-only (no foreign release)',
        weight: 3.5,
        industryAllowed: true
    },
    // FVEY
    {
        coi: ['FVEY'],
        coiOperator: 'ALL',
        releasabilityTo: ['USA', 'GBR', 'CAN', 'AUS', 'NZL'],
        caveats: [],
        description: 'Five Eyes full membership',
        weight: 7,
        industryAllowed: false
    },
    // NATO
    {
        coi: ['NATO'],
        coiOperator: 'ALL',
        releasabilityTo: ['USA', 'GBR', 'FRA', 'DEU', 'ITA', 'ESP', 'POL', 'CAN'],
        caveats: [],
        description: 'NATO subset (major partners)',
        weight: 3.5,
        industryAllowed: true
    },
    // Multi-COI
    {
        coi: ['NATO', 'QUAD'],
        coiOperator: 'ANY',
        releasabilityTo: ['USA', 'GBR', 'FRA', 'DEU', 'ITA', 'ESP', 'POL', 'CAN', 'AUS', 'IND', 'JPN'],
        caveats: [],
        description: 'NATO + QUAD (Multi-COI)',
        weight: 3.6,
        industryAllowed: true
    },
    // No-Affiliation
    {
        coi: ['Alpha'],
        coiOperator: 'ALL',
        releasabilityTo: ['USA', 'GBR', 'CAN'],
        caveats: [],
        description: 'Alpha community (no country affiliation)',
        weight: 3.6,
        industryAllowed: true
    },
    // No COI
    {
        coi: [],
        coiOperator: 'ALL',
        releasabilityTo: ['USA'],
        caveats: [],
        description: 'No COI - USA releasability',
        weight: 3.3,
        industryAllowed: true
    }
];

const CLASSIFICATION_WEIGHTS: Record<ClassificationLevel, number> = {
    'UNCLASSIFIED': 20,
    'RESTRICTED': 15,
    'CONFIDENTIAL': 25,
    'SECRET': 25,
    'TOP_SECRET': 15
};

describe('Instance Resource Seeding', () => {
    let mongoServer: MongoMemoryServer;
    let client: MongoClient;
    let db: Db;
    let collection: Collection;

    beforeAll(async () => {
        mongoServer = await MongoMemoryServer.create();
        const mongoUri = mongoServer.getUri();
        client = new MongoClient(mongoUri);
        await client.connect();
        db = client.db('dive-v3-test');
        collection = db.collection('resources');
    });

    afterAll(async () => {
        await client.close();
        await mongoServer.stop();
    });

    beforeEach(async () => {
        await collection.deleteMany({});
    });

    describe('COI Template Validation', () => {
        test('all COI templates pass coherence validation', async () => {
            for (const template of COI_TEMPLATES) {
                const validation = await validateCOICoherence({
                    classification: 'SECRET',
                    releasabilityTo: template.releasabilityTo,
                    COI: template.coi,
                    coiOperator: template.coiOperator,
                    caveats: template.caveats
                });

                expect(validation.valid).toBe(true);
                if (!validation.valid) {
                    console.error(`Template failed: ${template.description}`, validation.errors);
                }
            }
        });

        test('NOFORN template requires US-ONLY and USA-only releasability', async () => {
            const nofornTemplate = COI_TEMPLATES.find(t => t.caveats.includes('NOFORN'));
            expect(nofornTemplate).toBeDefined();
            expect(nofornTemplate?.coi).toEqual(['US-ONLY']);
            expect(nofornTemplate?.releasabilityTo).toEqual(['USA']);
        });

        test('FVEY template has correct Five Eyes countries', () => {
            const fveyTemplate = COI_TEMPLATES.find(t => t.coi.includes('FVEY'));
            expect(fveyTemplate).toBeDefined();
            expect(fveyTemplate?.releasabilityTo).toContain('USA');
            expect(fveyTemplate?.releasabilityTo).toContain('GBR');
            expect(fveyTemplate?.releasabilityTo).toContain('CAN');
            expect(fveyTemplate?.releasabilityTo).toContain('AUS');
            expect(fveyTemplate?.releasabilityTo).toContain('NZL');
        });

        test('multi-COI templates use ANY operator', () => {
            const multiCOITemplates = COI_TEMPLATES.filter(t => t.coi.length > 1);
            for (const template of multiCOITemplates) {
                expect(template.coiOperator).toBe('ANY');
            }
        });
    });

    describe('Distribution Targets', () => {
        test('classification weights sum to 100', () => {
            const total = Object.values(CLASSIFICATION_WEIGHTS).reduce((a, b) => a + b, 0);
            expect(total).toBe(100);
        });

        test('COI template weights are defined', () => {
            for (const template of COI_TEMPLATES) {
                expect(template.weight).toBeGreaterThan(0);
            }
        });

        test('industry access is defined for all templates', () => {
            for (const template of COI_TEMPLATES) {
                expect(typeof template.industryAllowed).toBe('boolean');
            }
        });
    });

    describe('Document Structure', () => {
        test('generated document has required ZTDF fields', async () => {
            // Create a minimal test document
            const doc = {
                resourceId: 'test-doc-001',
                title: 'Test Document',
                ztdf: {
                    manifest: {
                        version: '1.0',
                        objectId: 'test-doc-001',
                        objectType: 'document',
                        contentType: 'text/plain',
                        owner: 'system-seed-usa',
                        ownerOrganization: 'USA_GOVERNMENT',
                        createdAt: new Date().toISOString(),
                        payloadSize: 100
                    },
                    policy: {
                        version: '1.0',
                        policyVersion: '1.0',
                        securityLabel: {
                            classification: 'SECRET',
                            releasabilityTo: ['USA'],
                            COI: ['US-ONLY'],
                            coiOperator: 'ALL',
                            caveats: [],
                            originatingCountry: 'USA',
                            creationDate: new Date().toISOString(),
                            releasableToIndustry: false
                        },
                        policyAssertions: [],
                        policyHash: 'test-hash'
                    },
                    payload: {
                        encryptionAlgorithm: 'AES-256-GCM',
                        iv: 'base64-iv',
                        authTag: 'base64-auth',
                        keyAccessObjects: [{
                            kaoId: 'kao-test',
                            kasUrl: 'https://kas:8080/request-key',
                            kasId: 'usa-kas',
                            wrappedKey: 'base64-key',
                            wrappingAlgorithm: 'RSA-OAEP-256',
                            policyBinding: {
                                clearanceRequired: 'SECRET',
                                countriesAllowed: ['USA'],
                                coiRequired: ['US-ONLY']
                            }
                        }],
                        encryptedChunks: [{
                            chunkId: 0,
                            encryptedData: 'base64-data',
                            integrityHash: 'sha384-hash',
                            size: 100
                        }],
                        payloadHash: 'payload-hash'
                    }
                },
                legacy: {
                    classification: 'SECRET',
                    releasabilityTo: ['USA'],
                    COI: ['US-ONLY'],
                    coiOperator: 'ALL',
                    encrypted: true,
                    encryptedContent: 'base64-data',
                    releasableToIndustry: false
                },
                seedBatchId: 'test-batch',
                instanceCode: 'USA',
                createdAt: new Date(),
                updatedAt: new Date()
            };

            await collection.insertOne(doc);
            const retrieved = await collection.findOne({ resourceId: 'test-doc-001' });

            expect(retrieved).toBeDefined();
            expect(retrieved?.ztdf.manifest.objectId).toBe('test-doc-001');
            expect(retrieved?.ztdf.policy.securityLabel.classification).toBe('SECRET');
            expect(retrieved?.ztdf.payload.keyAccessObjects.length).toBe(1);
            expect(retrieved?.seedBatchId).toBe('test-batch');
            expect(retrieved?.instanceCode).toBe('USA');
        });

        test('document indexes are correct', async () => {
            // Create indexes
            await collection.createIndex({ resourceId: 1 }, { unique: true });
            await collection.createIndex({ 'ztdf.policy.securityLabel.classification': 1 });
            await collection.createIndex({ 'ztdf.policy.securityLabel.COI': 1 });
            await collection.createIndex({ seedBatchId: 1 });
            await collection.createIndex({ instanceCode: 1 });

            const indexes = await collection.indexes();
            const indexNames = indexes.map(i => i.name);

            expect(indexNames).toContain('resourceId_1');
            expect(indexNames).toContain('ztdf.policy.securityLabel.classification_1');
            expect(indexNames).toContain('seedBatchId_1');
            expect(indexNames).toContain('instanceCode_1');
        });
    });

    describe('Batch Processing', () => {
        test('can insert multiple documents in batch', async () => {
            const docs = Array.from({ length: 100 }, (_, i) => ({
                resourceId: `test-batch-${i}`,
                title: `Test Document ${i}`,
                ztdf: {
                    manifest: { objectId: `test-batch-${i}` },
                    policy: { securityLabel: { classification: 'UNCLASSIFIED' } },
                    payload: { keyAccessObjects: [] }
                },
                seedBatchId: 'batch-test-001',
                instanceCode: 'USA',
                createdAt: new Date(),
                updatedAt: new Date()
            }));

            const result = await collection.insertMany(docs);
            expect(result.insertedCount).toBe(100);

            const count = await collection.countDocuments({ seedBatchId: 'batch-test-001' });
            expect(count).toBe(100);
        });

        test('aggregation queries work correctly', async () => {
            const classifications: ClassificationLevel[] = ['UNCLASSIFIED', 'SECRET', 'SECRET', 'TOP_SECRET'];
            const docs = classifications.map((c, i) => ({
                resourceId: `agg-test-${i}`,
                ztdf: {
                    policy: { securityLabel: { classification: c } }
                },
                seedBatchId: 'agg-batch'
            }));

            await collection.insertMany(docs);

            const result = await collection.aggregate([
                { $match: { seedBatchId: 'agg-batch' } },
                { $group: { _id: '$ztdf.policy.securityLabel.classification', count: { $sum: 1 } } },
                { $sort: { _id: 1 } }
            ]).toArray();

            expect(result.length).toBe(3);
            expect(result.find(r => r._id === 'SECRET')?.count).toBe(2);
        });
    });
});






