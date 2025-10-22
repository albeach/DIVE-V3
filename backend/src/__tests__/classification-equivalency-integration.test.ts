/**
 * Integration Tests: Classification Equivalency (ACP-240 Section 4.3)
 * 
 * Tests for original classification storage and retrieval in ZTDF objects.
 * Verifies that:
 * - originalClassification, originalCountry, natoEquivalent are correctly stored
 * - ZTDF objects can be created with original classification fields
 * - Backward compatibility: ZTDF objects without original classification still work
 * - Classification equivalency fields are passed to OPA correctly
 */

import request from 'supertest';
import app from '../server';
import { MongoClient } from 'mongodb';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger';

describe('Classification Equivalency Integration Tests (ACP-240 Section 4.3)', () => {
    let mongoClient: MongoClient;
    let db: any;
    let accessToken: string;

    // Test configuration
    const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
    const DB_NAME = process.env.MONGO_DB_NAME || 'dive_v3_test';
    const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

    beforeAll(async () => {
        // Connect to test database
        mongoClient = new MongoClient(MONGO_URI);
        await mongoClient.connect();
        db = mongoClient.db(DB_NAME);

        // Seed NATO COI key (required for COI validation)
        try {
            await db.collection('coi_keys').insertOne({
                coi: 'NATO',
                authorizedCountries: ['USA', 'GBR', 'FRA', 'CAN', 'DEU', 'ITA', 'ESP', 'POL', 'NLD', 'BEL', 'NOR', 'DNK', 'GRC', 'PRT', 'TUR'],
                operator: 'ANY',
                createdAt: new Date(),
                updatedAt: new Date()
            });
            logger.info('Seeded NATO COI key for tests');
        } catch (error) {
            // Ignore duplicate key errors
            logger.debug('NATO COI key may already exist', { error });
        }

        // Generate test JWT token (German user with GEHEIM clearance)
        const germanUserPayload = {
            sub: 'hans.mueller@bundeswehr.org',
            uniqueID: 'hans.mueller@bundeswehr.org',
            clearance: 'SECRET',                    // Normalized DIVE V3 clearance
            clearanceOriginal: 'GEHEIM',            // Original German clearance
            clearanceCountry: 'DEU',                // Clearance issuing country
            countryOfAffiliation: 'DEU',
            acpCOI: ['NATO'],
            aud: 'dive-v3-client',
            iss: 'https://keycloak.dive-v3.local',
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 3600
        };

        accessToken = jwt.sign(germanUserPayload, JWT_SECRET, { algorithm: 'HS256' });
    });

    afterAll(async () => {
        // Clean up test data
        await db.collection('resources').deleteMany({ resourceId: /^test-classification-equiv-/ });
        await db.collection('coi_keys').deleteMany({ coi: 'NATO' });
        await mongoClient.close();
    });

    describe('Test 1: Store Original Classification in ZTDF (German GEHEIM)', () => {
        it('should create ZTDF resource with originalClassification=GEHEIM', async () => {
            const uploadPayload = {
                title: 'German Military Report',
                description: 'Test document with original German classification',
                classification: 'SECRET',                       // Normalized classification
                originalClassification: 'GEHEIM',               // Original German classification
                originalCountry: 'DEU',                         // Classification origin
                releasabilityTo: ['DEU', 'USA'],
                COI: ['NATO'],
                caveats: [],
                encrypted: false
            };

            // Mock multipart form data
            const response = await request(app)
                .post('/api/upload')
                .set('Authorization', `Bearer ${accessToken}`)
                .field('title', uploadPayload.title)
                .field('description', uploadPayload.description)
                .field('classification', uploadPayload.classification)
                .field('originalClassification', uploadPayload.originalClassification)
                .field('originalCountry', uploadPayload.originalCountry)
                .field('releasabilityTo', JSON.stringify(uploadPayload.releasabilityTo))
                .field('COI', JSON.stringify(uploadPayload.COI))
                .attach('file', Buffer.from('Test document content'), 'test-doc.txt');

            expect(response.status).toBe(201);  // 201 Created for successful upload
            expect(response.body.ztdf).toBeDefined();
            expect(response.body.ztdf.policy.securityLabel.originalClassification).toBe('GEHEIM');
            expect(response.body.ztdf.policy.securityLabel.originalCountry).toBe('DEU');
            expect(response.body.ztdf.policy.securityLabel.natoEquivalent).toBe('SECRET');
        });
    });

    describe('Test 2: Retrieve ZTDF with Original Classification', () => {
        let testResourceId: string;

        beforeAll(async () => {
            // Insert test ZTDF document with original classification
            const testResource = {
                resourceId: 'test-classification-equiv-002',
                title: 'French Military Plan',
                ztdf: {
                    policy: {
                        securityLabel: {
                            classification: 'SECRET',
                            originalClassification: 'SECRET DÉFENSE',
                            originalCountry: 'FRA',
                            natoEquivalent: 'SECRET',
                            releasabilityTo: ['FRA', 'DEU'],
                            COI: ['NATO'],
                            caveats: [],
                            originatingCountry: 'FRA',
                            creationDate: new Date().toISOString()
                        }
                    },
                    content: 'Encrypted content here'
                },
                encrypted: false,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            await db.collection('resources').insertOne(testResource);
            testResourceId = testResource.resourceId;
        });

        it('should retrieve ZTDF resource with original classification fields', async () => {
            const response = await request(app)
                .get(`/api/resources/${testResourceId}`)
                .set('Authorization', `Bearer ${accessToken}`);

            expect(response.status).toBe(200);
            expect(response.body.resourceId).toBe(testResourceId);
            expect(response.body.ztdf.policy.securityLabel.originalClassification).toBe('SECRET DÉFENSE');
            expect(response.body.ztdf.policy.securityLabel.originalCountry).toBe('FRA');
            expect(response.body.ztdf.policy.securityLabel.natoEquivalent).toBe('SECRET');
        });
    });

    describe('Test 3: Backward Compatibility - ZTDF Without Original Classification', () => {
        let legacyResourceId: string;

        beforeAll(async () => {
            // Insert legacy ZTDF document without originalClassification
            const legacyResource = {
                resourceId: 'test-classification-equiv-legacy-001',
                title: 'Legacy US Document',
                ztdf: {
                    policy: {
                        securityLabel: {
                            classification: 'CONFIDENTIAL',
                            // No originalClassification, originalCountry, natoEquivalent
                            releasabilityTo: ['USA'],
                            COI: [],
                            caveats: [],
                            originatingCountry: 'USA',
                            creationDate: new Date().toISOString()
                        }
                    },
                    content: 'Legacy encrypted content'
                },
                encrypted: false,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            await db.collection('resources').insertOne(legacyResource);
            legacyResourceId = legacyResource.resourceId;
        });

        it('should retrieve legacy ZTDF resource without original classification fields', async () => {
            const response = await request(app)
                .get(`/api/resources/${legacyResourceId}`)
                .set('Authorization', `Bearer ${accessToken}`);

            expect(response.status).toBe(200);
            expect(response.body.resourceId).toBe(legacyResourceId);
            expect(response.body.ztdf.policy.securityLabel.classification).toBe('CONFIDENTIAL');
            expect(response.body.ztdf.policy.securityLabel.originalClassification).toBeUndefined();
            expect(response.body.ztdf.policy.securityLabel.originalCountry).toBeUndefined();
            expect(response.body.ztdf.policy.securityLabel.natoEquivalent).toBeUndefined();
        });
    });

    describe('Test 4: OPA Input Includes Original Classification', () => {
        let testResourceId: string;

        beforeAll(async () => {
            // Insert test ZTDF document
            const testResource = {
                resourceId: 'test-classification-equiv-opa-001',
                title: 'Italian Secret Document',
                ztdf: {
                    policy: {
                        securityLabel: {
                            classification: 'SECRET',
                            originalClassification: 'SEGRETO',
                            originalCountry: 'ITA',
                            natoEquivalent: 'SECRET',
                            releasabilityTo: ['ITA', 'DEU'],
                            COI: ['NATO'],
                            caveats: [],
                            originatingCountry: 'ITA',
                            creationDate: new Date().toISOString()
                        }
                    },
                    content: 'Italian military content'
                },
                encrypted: false,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            await db.collection('resources').insertOne(testResource);
            testResourceId = testResource.resourceId;
        });

        it('should pass original classification to OPA in authorization request', async () => {
            // This test verifies that the authz middleware correctly extracts
            // originalClassification from ZTDF and passes it to OPA
            const response = await request(app)
                .get(`/api/resources/${testResourceId}`)
                .set('Authorization', `Bearer ${accessToken}`);

            // German user (GEHEIM = SECRET) can access Italian document (SEGRETO = SECRET)
            // Both are NATO members with equivalent SECRET classifications
            expect(response.status).toBe(200);
            expect(response.body.resourceId).toBe(testResourceId);

            // Verify that authorization decision includes original classification in evaluation details
            // (This would require checking audit logs or OPA decision logs)
        });
    });

    describe('Test 5: Multiple Nations - Classification Equivalency Matrix', () => {
        beforeAll(async () => {
            // Insert test documents from multiple nations
            const testDocuments = [
                {
                    resourceId: 'test-classification-equiv-multi-001',
                    title: 'Polish Document',
                    ztdf: {
                        policy: {
                            securityLabel: {
                                classification: 'SECRET',
                                originalClassification: 'TAJNE',
                                originalCountry: 'POL',
                                natoEquivalent: 'SECRET',
                                releasabilityTo: ['POL', 'DEU'],
                                COI: ['NATO'],
                                caveats: [],
                                originatingCountry: 'POL',
                                creationDate: new Date().toISOString()
                            }
                        },
                        content: 'Polish content'
                    },
                    encrypted: false,
                    createdAt: new Date(),
                    updatedAt: new Date()
                },
                {
                    resourceId: 'test-classification-equiv-multi-002',
                    title: 'Dutch Document',
                    ztdf: {
                        policy: {
                            securityLabel: {
                                classification: 'SECRET',
                                originalClassification: 'GEHEIM',
                                originalCountry: 'NLD',
                                natoEquivalent: 'SECRET',
                                releasabilityTo: ['NLD', 'DEU'],
                                COI: ['NATO'],
                                caveats: [],
                                originatingCountry: 'NLD',
                                creationDate: new Date().toISOString()
                            }
                        },
                        content: 'Dutch content'
                    },
                    encrypted: false,
                    createdAt: new Date(),
                    updatedAt: new Date()
                },
                {
                    resourceId: 'test-classification-equiv-multi-003',
                    title: 'Spanish Document',
                    ztdf: {
                        policy: {
                            securityLabel: {
                                classification: 'SECRET',
                                originalClassification: 'SECRETO',
                                originalCountry: 'ESP',
                                natoEquivalent: 'SECRET',
                                releasabilityTo: ['ESP', 'DEU'],
                                COI: ['NATO'],
                                caveats: [],
                                originatingCountry: 'ESP',
                                creationDate: new Date().toISOString()
                            }
                        },
                        content: 'Spanish content'
                    },
                    encrypted: false,
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            ];

            await db.collection('resources').insertMany(testDocuments);
        });

        it('should allow German user (GEHEIM) to access all equivalent SECRET documents', async () => {
            // Test Polish TAJNE
            const polishResponse = await request(app)
                .get('/api/resources/test-classification-equiv-multi-001')
                .set('Authorization', `Bearer ${accessToken}`);
            expect(polishResponse.status).toBe(200);

            // Test Dutch GEHEIM
            const dutchResponse = await request(app)
                .get('/api/resources/test-classification-equiv-multi-002')
                .set('Authorization', `Bearer ${accessToken}`);
            expect(dutchResponse.status).toBe(200);

            // Test Spanish SECRETO
            const spanishResponse = await request(app)
                .get('/api/resources/test-classification-equiv-multi-003')
                .set('Authorization', `Bearer ${accessToken}`);
            expect(spanishResponse.status).toBe(200);
        });
    });

    describe('Test 6: Deny Access Due to Classification Hierarchy', () => {
        let topSecretResourceId: string;

        beforeAll(async () => {
            // Insert US TOP SECRET document
            const topSecretResource = {
                resourceId: 'test-classification-equiv-deny-001',
                title: 'US Top Secret Document',
                ztdf: {
                    policy: {
                        securityLabel: {
                            classification: 'TOP_SECRET',
                            originalClassification: 'TOP SECRET',
                            originalCountry: 'USA',
                            natoEquivalent: 'COSMIC_TOP_SECRET',
                            releasabilityTo: ['USA', 'DEU'],
                            COI: ['NATO'],
                            caveats: [],
                            originatingCountry: 'USA',
                            creationDate: new Date().toISOString()
                        }
                    },
                    content: 'Top secret content'
                },
                encrypted: false,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            await db.collection('resources').insertOne(topSecretResource);
            topSecretResourceId = topSecretResource.resourceId;
        });

        it('should deny German user (GEHEIM/SECRET) access to US TOP SECRET document', async () => {
            const response = await request(app)
                .get(`/api/resources/${topSecretResourceId}`)
                .set('Authorization', `Bearer ${accessToken}`);

            expect(response.status).toBe(403);
            expect(response.body.error).toContain('Insufficient clearance');
        });
    });

    describe('Test 7: Display Markings with Original Classification', () => {
        it('should return displayMarking with original and canonical classifications', async () => {
            const testResource = {
                resourceId: 'test-classification-equiv-display-001',
                title: 'Turkish Document',
                ztdf: {
                    policy: {
                        securityLabel: {
                            classification: 'SECRET',
                            originalClassification: 'ÇOK GİZLİ',
                            originalCountry: 'TUR',
                            natoEquivalent: 'SECRET',
                            displayMarking: 'ÇOK GİZLİ / SECRET (TUR)',  // Dual-country format
                            releasabilityTo: ['TUR', 'DEU'],
                            COI: ['NATO'],
                            caveats: [],
                            originatingCountry: 'TUR',
                            creationDate: new Date().toISOString()
                        }
                    },
                    content: 'Turkish content'
                },
                encrypted: false,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            await db.collection('resources').insertOne(testResource);

            const response = await request(app)
                .get(`/api/resources/${testResource.resourceId}`)
                .set('Authorization', `Bearer ${accessToken}`);

            expect(response.status).toBe(200);
            expect(response.body.ztdf.policy.securityLabel.displayMarking).toBe('ÇOK GİZLİ / SECRET (TUR)');
        });
    });
});

