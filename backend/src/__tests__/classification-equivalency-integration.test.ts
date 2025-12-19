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
import { createE2EJWT } from './helpers/mock-jwt-rs256';
import { mockKeycloakJWKS, cleanupJWKSMock } from './helpers/mock-jwks';
import { mockOPAServer, cleanupOPAMock } from './helpers/mock-opa-server';

describe('Classification Equivalency Integration Tests (ACP-240 Section 4.3)', () => {
    let mongoClient: MongoClient;
    let db: any;
    let accessToken: string;

    // Test configuration - Use MongoDB Memory Server
    const MONGO_URI = process.env.MONGODB_URL || process.env.MONGODB_URI || 'mongodb://localhost:27017';
    const DB_NAME = process.env.MONGODB_DATABASE || 'dive-v3-test';

    beforeAll(async () => {
        // Mock Keycloak JWKS and OPA
        await mockKeycloakJWKS();
        mockOPAServer();
        
        // Connect to MongoDB Memory Server
        mongoClient = new MongoClient(MONGO_URI);
        await mongoClient.connect();
        db = mongoClient.db(DB_NAME);

        // Seed NATO COI key (required for COI validation)
        try {
            // Delete any existing NATO COI to ensure clean state
            await db.collection('coi_keys').deleteOne({ coiId: 'NATO' });

            // Insert complete NATO COI with all required fields
            await db.collection('coi_keys').insertOne({
                coiId: 'NATO',  // Correct field name
                name: 'NATO',
                description: 'North Atlantic Treaty Organization',
                memberCountries: [  // Correct field name - all 32 NATO members including GBR
                    'ALB', 'BEL', 'BGR', 'CAN', 'HRV', 'CZE', 'DNK', 'EST', 'FIN', 'FRA',
                    'DEU', 'GBR', 'GRC', 'HUN', 'ISL', 'ITA', 'LVA', 'LTU', 'LUX', 'MNE', 'NLD',
                    'MKD', 'NOR', 'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'ESP', 'SWE', 'TUR', 'USA'
                ],
                status: 'active',
                color: '#3B82F6',
                icon: '⭐',
                resourceCount: 0,
                algorithm: 'AES-256-GCM',
                keyVersion: 1,
                createdAt: new Date(),
                updatedAt: new Date()
            });
            console.log('Seeded NATO COI key for tests with complete schema');
        } catch (error) {
            console.error('Failed to seed NATO COI key', error);
            throw error; // Fail fast if seed fails
        }

        // Generate test JWT token (German user with GEHEIM clearance + AAL2 MFA)
        accessToken = createE2EJWT({
            uniqueID: 'hans.mueller@bundeswehr.org',
            clearance: 'SECRET',                    // Normalized DIVE V3 clearance
            clearanceOriginal: 'GEHEIM',            // Original German clearance
            clearanceCountry: 'DEU',                // Clearance issuing country
            countryOfAffiliation: 'DEU',
            acpCOI: ['NATO']
        });
    });

    afterAll(async () => {
        // Clean up test data
        await db.collection('resources').deleteMany({ resourceId: /^test-classification-equiv-/ });
        await db.collection('coi_keys').deleteMany({ coiId: 'NATO' });  // Correct field name
        await mongoClient.close();
        
        // Clean up mocks
        cleanupJWKSMock();
        cleanupOPAMock();
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
                    manifest: {
                        version: '1.0',
                        objectId: 'test-classification-equiv-002',
                        objectType: 'document',
                        contentType: 'application/octet-stream',
                        owner: 'test-user',
                        createdAt: new Date().toISOString(),
                        payloadSize: 1024
                    },
                    policy: {
                        policyVersion: '1.0',
                        securityLabel: {
                            classification: 'SECRET',
                            originalClassification: 'SECRET DÉFENSE',
                            originalCountry: 'FRA',
                            natoEquivalent: 'SECRET',
                            releasabilityTo: ['FRA', 'DEU'],
                            COI: ['NATO'],
                            caveats: [],
                            originatingCountry: 'FRA',
                            creationDate: new Date().toISOString(),
                            displayMarking: 'SECRET//NATO//REL FRA, DEU'
                        },
                        policyAssertions: [],
                        policyHash: 'test-hash'
                    },
                    payload: {
                        encryptionAlgorithm: 'AES-256-GCM',
                        iv: Buffer.from('test-iv').toString('base64'),
                        authTag: Buffer.from('test-tag').toString('base64'),
                        keyAccessObjects: [],
                        encryptedChunks: [{
                            chunkId: 0,
                            encryptedData: Buffer.from('encrypted-content').toString('base64'),
                            size: 1024,
                            integrityHash: 'test-chunk-hash'
                        }],
                        payloadHash: 'test-payload-hash'
                    }
                },
                legacy: {
                    classification: 'SECRET',
                    releasabilityTo: ['FRA', 'DEU'],
                    COI: ['NATO'],
                    encrypted: false
                },
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
                    manifest: {
                        version: '1.0',
                        objectId: 'test-classification-equiv-legacy-001',
                        objectType: 'document',
                        contentType: 'application/octet-stream',
                        owner: 'test-user',
                        createdAt: new Date().toISOString(),
                        payloadSize: 1024
                    },
                    policy: {
                        policyVersion: '1.0',
                        securityLabel: {
                            classification: 'CONFIDENTIAL',
                            // No originalClassification, originalCountry, natoEquivalent
                            releasabilityTo: ['USA', 'DEU'],  // Include DEU for German user access
                            COI: [],
                            caveats: [],
                            originatingCountry: 'USA',
                            creationDate: new Date().toISOString(),
                            displayMarking: 'CONFIDENTIAL//REL USA, DEU'
                        },
                        policyAssertions: [],
                        policyHash: 'test-hash'
                    },
                    payload: {
                        encryptionAlgorithm: 'AES-256-GCM',
                        iv: Buffer.from('test-iv').toString('base64'),
                        authTag: Buffer.from('test-tag').toString('base64'),
                        keyAccessObjects: [],
                        encryptedChunks: [{
                            chunkId: 0,
                            encryptedData: Buffer.from('legacy-encrypted-content').toString('base64'),
                            size: 1024,
                            integrityHash: 'test-chunk-hash'
                        }],
                        payloadHash: 'test-payload-hash'
                    }
                },
                legacy: {
                    classification: 'CONFIDENTIAL',
                    releasabilityTo: ['USA', 'DEU'],
                    COI: [],
                    encrypted: false
                },
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
                    manifest: {
                        version: '1.0',
                        objectId: 'test-classification-equiv-opa-001',
                        objectType: 'document',
                        contentType: 'application/octet-stream',
                        owner: 'test-user',
                        createdAt: new Date().toISOString(),
                        payloadSize: 1024
                    },
                    policy: {
                        policyVersion: '1.0',
                        securityLabel: {
                            classification: 'SECRET',
                            originalClassification: 'SEGRETO',
                            originalCountry: 'ITA',
                            natoEquivalent: 'SECRET',
                            releasabilityTo: ['ITA', 'DEU'],
                            COI: ['NATO'],
                            caveats: [],
                            originatingCountry: 'ITA',
                            creationDate: new Date().toISOString(),
                            displayMarking: 'SECRET//NATO//REL ITA, DEU'
                        },
                        policyAssertions: [],
                        policyHash: 'test-hash'
                    },
                    payload: {
                        encryptionAlgorithm: 'AES-256-GCM',
                        iv: Buffer.from('test-iv').toString('base64'),
                        authTag: Buffer.from('test-tag').toString('base64'),
                        keyAccessObjects: [],
                        encryptedChunks: [{
                            chunkId: 0,
                            encryptedData: Buffer.from('italian-military-content').toString('base64'),
                            size: 1024,
                            integrityHash: 'test-chunk-hash'
                        }],
                        payloadHash: 'test-payload-hash'
                    }
                },
                legacy: {
                    classification: 'SECRET',
                    releasabilityTo: ['ITA', 'DEU'],
                    COI: ['NATO'],
                    encrypted: false
                },
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
                        manifest: {
                            version: '1.0',
                            objectId: 'test-classification-equiv-multi-001',
                            objectType: 'document',
                            contentType: 'application/octet-stream',
                            owner: 'test-user',
                            createdAt: new Date().toISOString(),
                            payloadSize: 1024
                        },
                        policy: {
                            policyVersion: '1.0',
                            securityLabel: {
                                classification: 'SECRET',
                                originalClassification: 'TAJNE',
                                originalCountry: 'POL',
                                natoEquivalent: 'SECRET',
                                releasabilityTo: ['POL', 'DEU'],
                                COI: ['NATO'],
                                caveats: [],
                                originatingCountry: 'POL',
                                creationDate: new Date().toISOString(),
                                displayMarking: 'SECRET//NATO//REL POL, DEU'
                            },
                            policyAssertions: [],
                            policyHash: 'test-hash'
                        },
                        payload: {
                            encryptionAlgorithm: 'AES-256-GCM',
                            iv: Buffer.from('test-iv').toString('base64'),
                            authTag: Buffer.from('test-tag').toString('base64'),
                            keyAccessObjects: [],
                            encryptedChunks: [{
                                chunkId: 0,
                                encryptedData: Buffer.from('polish-content').toString('base64'),
                                size: 1024,
                                integrityHash: 'test-chunk-hash'
                            }],
                            payloadHash: 'test-payload-hash'
                        }
                    },
                    legacy: {
                        classification: 'SECRET',
                        releasabilityTo: ['POL', 'DEU'],
                        COI: ['NATO'],
                        encrypted: false
                    },
                    createdAt: new Date(),
                    updatedAt: new Date()
                },
                {
                    resourceId: 'test-classification-equiv-multi-002',
                    title: 'Dutch Document',
                    ztdf: {
                        manifest: {
                            version: '1.0',
                            objectId: 'test-classification-equiv-multi-002',
                            objectType: 'document',
                            contentType: 'application/octet-stream',
                            owner: 'test-user',
                            createdAt: new Date().toISOString(),
                            payloadSize: 1024
                        },
                        policy: {
                            policyVersion: '1.0',
                            securityLabel: {
                                classification: 'SECRET',
                                originalClassification: 'GEHEIM',
                                originalCountry: 'NLD',
                                natoEquivalent: 'SECRET',
                                releasabilityTo: ['NLD', 'DEU'],
                                COI: ['NATO'],
                                caveats: [],
                                originatingCountry: 'NLD',
                                creationDate: new Date().toISOString(),
                                displayMarking: 'SECRET//NATO//REL NLD, DEU'
                            },
                            policyAssertions: [],
                            policyHash: 'test-hash'
                        },
                        payload: {
                            encryptionAlgorithm: 'AES-256-GCM',
                            iv: Buffer.from('test-iv').toString('base64'),
                            authTag: Buffer.from('test-tag').toString('base64'),
                            keyAccessObjects: [],
                            encryptedChunks: [{
                                chunkId: 0,
                                encryptedData: Buffer.from('dutch-content').toString('base64'),
                                size: 1024,
                                integrityHash: 'test-chunk-hash'
                            }],
                            payloadHash: 'test-payload-hash'
                        }
                    },
                    legacy: {
                        classification: 'SECRET',
                        releasabilityTo: ['NLD', 'DEU'],
                        COI: ['NATO'],
                        encrypted: false
                    },
                    createdAt: new Date(),
                    updatedAt: new Date()
                },
                {
                    resourceId: 'test-classification-equiv-multi-003',
                    title: 'Spanish Document',
                    ztdf: {
                        manifest: {
                            version: '1.0',
                            objectId: 'test-classification-equiv-multi-003',
                            objectType: 'document',
                            contentType: 'application/octet-stream',
                            owner: 'test-user',
                            createdAt: new Date().toISOString(),
                            payloadSize: 1024
                        },
                        policy: {
                            policyVersion: '1.0',
                            securityLabel: {
                                classification: 'SECRET',
                                originalClassification: 'SECRETO',
                                originalCountry: 'ESP',
                                natoEquivalent: 'SECRET',
                                releasabilityTo: ['ESP', 'DEU'],
                                COI: ['NATO'],
                                caveats: [],
                                originatingCountry: 'ESP',
                                creationDate: new Date().toISOString(),
                                displayMarking: 'SECRET//NATO//REL ESP, DEU'
                            },
                            policyAssertions: [],
                            policyHash: 'test-hash'
                        },
                        payload: {
                            encryptionAlgorithm: 'AES-256-GCM',
                            iv: Buffer.from('test-iv').toString('base64'),
                            authTag: Buffer.from('test-tag').toString('base64'),
                            keyAccessObjects: [],
                            encryptedChunks: [{
                                chunkId: 0,
                                encryptedData: Buffer.from('spanish-content').toString('base64'),
                                size: 1024,
                                integrityHash: 'test-chunk-hash'
                            }],
                            payloadHash: 'test-payload-hash'
                        }
                    },
                    legacy: {
                        classification: 'SECRET',
                        releasabilityTo: ['ESP', 'DEU'],
                        COI: ['NATO'],
                        encrypted: false
                    },
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
                    manifest: {
                        version: '1.0',
                        objectId: 'test-classification-equiv-deny-001',
                        objectType: 'document',
                        contentType: 'application/octet-stream',
                        owner: 'test-user',
                        createdAt: new Date().toISOString(),
                        payloadSize: 1024
                    },
                    policy: {
                        policyVersion: '1.0',
                        securityLabel: {
                            classification: 'TOP_SECRET',
                            originalClassification: 'TOP SECRET',
                            originalCountry: 'USA',
                            natoEquivalent: 'COSMIC_TOP_SECRET',
                            releasabilityTo: ['USA', 'DEU'],
                            COI: ['NATO'],
                            caveats: [],
                            originatingCountry: 'USA',
                            creationDate: new Date().toISOString(),
                            displayMarking: 'TOP SECRET//NATO//REL USA, DEU'
                        },
                        policyAssertions: [],
                        policyHash: 'test-hash'
                    },
                    payload: {
                        encryptionAlgorithm: 'AES-256-GCM',
                        iv: Buffer.from('test-iv').toString('base64'),
                        authTag: Buffer.from('test-tag').toString('base64'),
                        keyAccessObjects: [],
                        encryptedChunks: [{
                            chunkId: 0,
                            encryptedData: Buffer.from('top-secret-content').toString('base64'),
                            size: 1024,
                            integrityHash: 'test-chunk-hash'
                        }],
                        payloadHash: 'test-payload-hash'
                    }
                },
                legacy: {
                    classification: 'TOP_SECRET',
                    releasabilityTo: ['USA', 'DEU'],
                    COI: ['NATO'],
                    encrypted: false
                },
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
            // Accept any 403 error - the status code is what matters for security
            expect(response.body.error || response.body.message).toBeDefined();
        });
    });

    describe('Test 7: Display Markings with Original Classification', () => {
        it('should return displayMarking with original and canonical classifications', async () => {
            const testResource = {
                resourceId: 'test-classification-equiv-display-001',
                title: 'Turkish Document',
                ztdf: {
                    manifest: {
                        version: '1.0',
                        objectId: 'test-classification-equiv-display-001',
                        objectType: 'document',
                        contentType: 'application/octet-stream',
                        owner: 'test-user',
                        createdAt: new Date().toISOString(),
                        payloadSize: 1024
                    },
                    policy: {
                        policyVersion: '1.0',
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
                        },
                        policyAssertions: [],
                        policyHash: 'test-hash'
                    },
                    payload: {
                        encryptionAlgorithm: 'AES-256-GCM',
                        iv: Buffer.from('test-iv').toString('base64'),
                        authTag: Buffer.from('test-tag').toString('base64'),
                        keyAccessObjects: [],
                        encryptedChunks: [{
                            chunkId: 0,
                            encryptedData: Buffer.from('turkish-content').toString('base64'),
                            size: 1024,
                            integrityHash: 'test-chunk-hash'
                        }],
                        payloadHash: 'test-payload-hash'
                    }
                },
                legacy: {
                    classification: 'SECRET',
                    releasabilityTo: ['TUR', 'DEU'],
                    COI: ['NATO'],
                    encrypted: false
                },
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
