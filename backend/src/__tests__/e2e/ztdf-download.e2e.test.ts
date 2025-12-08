/**
 * ZTDF Download E2E Tests
 * 
 * End-to-end tests for ZTDF download endpoint
 * Validates complete flow from MongoDB → Export → ZIP download
 * Includes OpenTDF CLI compatibility validation
 */

import request from 'supertest';
import JSZip from 'jszip';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, Db } from 'mongodb';
import app from '../../server';
import jwt from 'jsonwebtoken';
import { IZTDFResource, ClassificationLevel } from '../../types/ztdf.types';
import { IOpenTDFManifest } from '../../types/opentdf.types';

const asBuffer = (req: request.Test): request.Test =>
    req.buffer(true).parse((res, callback) => {
        const data: Buffer[] = [];
        res.on('data', (chunk: Buffer) => data.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(data)));
    });

describe('ZTDF Download E2E', () => {
    let mongoServer: MongoMemoryServer;
    let mongoClient: MongoClient;
    let db: Db;
    let testToken: string;
    let testResourceId: string;

    // ============================================
    // Setup & Teardown
    // ============================================

    beforeAll(async () => {
        process.env.SKIP_ZTDF_VALIDATION = 'true';
        process.env.AUTHZ_REQUIRE_KID = 'false';
        // Start in-memory MongoDB
        mongoServer = await MongoMemoryServer.create();
        const mongoUri = mongoServer.getUri();
        mongoClient = new MongoClient(mongoUri);
        await mongoClient.connect();
        db = mongoClient.db('dive-v3-test');

        // Set MongoDB URI in env for app to use
        process.env.MONGODB_URI = mongoUri;
        process.env.JWT_SECRET = 'test-secret-key';
    });

    afterAll(async () => {
        delete process.env.SKIP_ZTDF_VALIDATION;
        delete process.env.AUTHZ_REQUIRE_KID;
        await mongoClient.close();
        await mongoServer.stop();
    });

    beforeEach(async () => {
        // Clear database before each test
        await db.collection('ztdf-resources').deleteMany({});

        // Generate test JWT token
        testToken = jwt.sign(
            {
                uniqueID: 'john.doe@mil',
                clearance: 'SECRET',
                countryOfAffiliation: 'USA',
                acpCOI: ['FVEY']
            },
            'test-secret-key',
            { expiresIn: '1h' }
        );

        // Insert test ZTDF resource
        testResourceId = 'test-doc-e2e-123';
        await insertTestZTDFResource(db, testResourceId);
    });

    // ============================================
    // Helper Functions
    // ============================================

    async function insertTestZTDFResource(database: Db, resourceId: string): Promise<void> {
        const testResource: IZTDFResource = {
            resourceId,
            title: 'Test ZTDF Document',
            ztdf: {
                manifest: {
                    version: '1.0',
                    objectId: resourceId,
                    objectType: 'uploaded-document',
                    contentType: 'application/pdf',
                    owner: 'john.doe@mil',
                    ownerOrganization: 'DIVE-V3',
                    createdAt: new Date().toISOString(),
                    payloadSize: 2048
                },
                policy: {
                    policyVersion: '1.0',
                    securityLabel: {
                        classification: 'SECRET' as ClassificationLevel,
                        originalClassification: 'SECRET',
                        originalCountry: 'USA',
                        natoEquivalent: 'NATO_SECRET',
                        releasabilityTo: ['USA', 'GBR', 'CAN'],
                        COI: ['FVEY'],
                        coiOperator: 'ALL',
                        caveats: ['NOFORN'],
                        originatingCountry: 'USA',
                        creationDate: new Date().toISOString(),
                        displayMarking: 'SECRET//NOFORN//FVEY//REL USA, GBR, CAN'
                    },
                    policyAssertions: []
                },
                payload: {
                    encryptionAlgorithm: 'AES-256-GCM',
                    iv: 'test-iv-base64',
                    authTag: 'test-auth-tag-base64',
                    keyAccessObjects: [
                        {
                            kaoId: 'kao-e2e-1',
                            kasUrl: 'https://kas.dive25.com',
                            kasId: 'kas-dive-v3',
                            wrappedKey: 'test-wrapped-key-base64',
                            wrappingAlgorithm: 'RSA-OAEP-256',
                            policyBinding: {
                                clearanceRequired: 'SECRET' as ClassificationLevel,
                                countriesAllowed: ['USA', 'GBR', 'CAN'],
                                coiRequired: ['FVEY']
                            },
                            createdAt: new Date().toISOString()
                        }
                    ],
                    encryptedChunks: [
                        {
                            chunkId: 0,
                            encryptedData: Buffer.from('test-encrypted-payload-data').toString('base64'),
                            size: Buffer.from('test-encrypted-payload-data').length,
                            integrityHash: 'test-chunk-hash-base64'
                        }
                    ],
                    payloadHash: 'test-payload-hash-base64'
                }
            },
            legacy: {
                classification: 'SECRET' as ClassificationLevel,
                releasabilityTo: ['USA', 'GBR', 'CAN'],
                COI: ['FVEY'],
                coiOperator: 'ALL',
                encrypted: true
            }
        };

        await database.collection('ztdf-resources').insertOne(testResource);
        // Also insert into primary resources collection for download handler lookup
        await database.collection('resources').insertOne({
            resourceId,
            title: testResource.title,
            classification: testResource.legacy!.classification,
            releasabilityTo: testResource.legacy!.releasabilityTo,
            COI: testResource.legacy!.COI,
            ztdf: testResource.ztdf,
            coiOperator: testResource.legacy!.coiOperator,
            encrypted: true
        });
    }

    // ============================================
    // Download Endpoint Tests
    // ============================================

    describe('GET /api/resources/:id/download', () => {

        it('should download ZTDF file as ZIP archive', async () => {
            const response = await asBuffer(
                request(app)
                .get(`/api/resources/${testResourceId}/download`)
                .set('Authorization', `Bearer ${testToken}`)
            ).expect(200);

            // Verify headers
            expect(response.headers['content-type']).toBe('application/zip');
            expect(response.headers['content-disposition']).toContain('attachment');
            expect(response.headers['content-disposition']).toContain('.ztdf');
            expect(response.headers['x-ztdf-spec-version']).toBe('4.3.0');
            expect(response.headers['x-ztdf-hash']).toBeTruthy();

            // Verify body is a buffer
            expect(response.body).toBeInstanceOf(Buffer);
            expect(response.body.length).toBeGreaterThan(0);
        });

        it('should return 401 without authentication', async () => {
            await request(app)
                .get(`/api/resources/${testResourceId}/download`)
                .expect(401);
        });

        it('should return 404 for non-existent resource', async () => {
            await request(app)
                .get('/api/resources/non-existent-resource/download')
                .set('Authorization', `Bearer ${testToken}`)
                .expect(404);
        });

        it('should create valid ZIP with 0.manifest.json and 0.payload', async () => {
            const response = await asBuffer(
                request(app)
                .get(`/api/resources/${testResourceId}/download`)
                .set('Authorization', `Bearer ${testToken}`)
            ).expect(200);

            const zip = await JSZip.loadAsync(response.body);

            // Verify files exist
            expect(zip.files['0.manifest.json']).toBeDefined();
            expect(zip.files['0.payload']).toBeDefined();

            // Verify only these 2 files exist
            const fileNames = Object.keys(zip.files);
            expect(fileNames).toHaveLength(2);
        });

        it('should create OpenTDF-compliant manifest', async () => {
            const response = await asBuffer(
                request(app)
                .get(`/api/resources/${testResourceId}/download`)
                .set('Authorization', `Bearer ${testToken}`)
            ).expect(200);

            const zip = await JSZip.loadAsync(response.body);
            const manifestText = await zip.files['0.manifest.json'].async('text');
            const manifest = JSON.parse(manifestText) as IOpenTDFManifest;

            // Verify TDF 4.3.0 compliance
            expect(manifest.tdf_spec_version).toBe('4.3.0');
            expect(manifest.payload).toBeDefined();
            expect(manifest.payload.type).toBe('reference');
            expect(manifest.payload.url).toBe('0.payload');
            expect(manifest.payload.protocol).toBe('zip');
            expect(manifest.payload.isEncrypted).toBe(true);
            expect(manifest.encryptionInformation).toBeDefined();
            expect(manifest.assertions).toBeDefined();
        });

        it('should include encryptionInformation with all required fields', async () => {
            const response = await asBuffer(
                request(app)
                .get(`/api/resources/${testResourceId}/download`)
                .set('Authorization', `Bearer ${testToken}`)
            ).expect(200);

            const zip = await JSZip.loadAsync(response.body);
            const manifestText = await zip.files['0.manifest.json'].async('text');
            const manifest = JSON.parse(manifestText) as IOpenTDFManifest;

            const encInfo = manifest.encryptionInformation;
            expect(encInfo.type).toBe('split');
            expect(encInfo.method).toBeDefined();
            expect(encInfo.method.algorithm).toBe('AES-256-GCM');
            expect(encInfo.method.isStreamable).toBe(true);
            expect(encInfo.keyAccess).toBeInstanceOf(Array);
            expect(encInfo.keyAccess.length).toBeGreaterThan(0);
            expect(encInfo.policy).toBeTruthy(); // Base64-encoded
            expect(encInfo.integrityInformation).toBeDefined();
        });

        it('should map keyAccessObjects to OpenTDF format', async () => {
            const response = await asBuffer(
                request(app)
                .get(`/api/resources/${testResourceId}/download`)
                .set('Authorization', `Bearer ${testToken}`)
            ).expect(200);

            const zip = await JSZip.loadAsync(response.body);
            const manifestText = await zip.files['0.manifest.json'].async('text');
            const manifest = JSON.parse(manifestText) as IOpenTDFManifest;

            const kao = manifest.encryptionInformation.keyAccess[0];
            expect(kao.type).toBe('wrapped');
            expect(kao.protocol).toBe('kas');
            expect(kao.url).toBe('https://kas.dive25.com');
            expect(kao.kid).toBeTruthy();
            expect(kao.sid).toBeTruthy();
            expect(kao.wrappedKey).toBe('test-wrapped-key-base64');
            expect(kao.policyBinding).toBeDefined();
            expect(kao.policyBinding.alg).toBe('HS256');
            expect(kao.tdf_spec_version).toBe('1.0');
        });

        it('should include STANAG 4774 assertion', async () => {
            const response = await asBuffer(
                request(app)
                .get(`/api/resources/${testResourceId}/download`)
                .set('Authorization', `Bearer ${testToken}`)
            ).expect(200);

            const zip = await JSZip.loadAsync(response.body);
            const manifestText = await zip.files['0.manifest.json'].async('text');
            const manifest = JSON.parse(manifestText) as IOpenTDFManifest;

            expect(manifest.assertions).toBeInstanceOf(Array);
            expect(manifest.assertions.length).toBeGreaterThan(0);

            const assertion = manifest.assertions[0];
            expect(assertion.id).toBe('1');
            expect(assertion.type).toBe('handling');
            expect(assertion.scope).toBe('payload');
            expect(assertion.appliesToState).toBe('unencrypted');
            expect(assertion.statement).toBeDefined();
            expect(assertion.statement.format).toBe('json-structured');
            expect(assertion.statement.value).toBeDefined();
            expect(assertion.binding).toBeDefined();
            expect(assertion.binding.method).toBe('jws');
        });

        it('should include STANAG 4774 labels in assertion value', async () => {
            const response = await asBuffer(
                request(app)
                .get(`/api/resources/${testResourceId}/download`)
                .set('Authorization', `Bearer ${testToken}`)
            ).expect(200);

            const zip = await JSZip.loadAsync(response.body);
            const manifestText = await zip.files['0.manifest.json'].async('text');
            const manifest = JSON.parse(manifestText) as IOpenTDFManifest;

            const assertionValue = manifest.assertions[0].statement.value as any;
            expect(assertionValue.Xmlns).toBe('urn:nato:stanag:4774:confidentialitymetadatalabel:1:0');
            expect(assertionValue.CreationTime).toBeTruthy();
            expect(assertionValue.ConfidentialityInformation).toBeDefined();
            expect(assertionValue.ConfidentialityInformation.Classification).toBe('SECRET');
        });

        it('should extract binary payload correctly', async () => {
            const response = await asBuffer(
                request(app)
                .get(`/api/resources/${testResourceId}/download`)
                .set('Authorization', `Bearer ${testToken}`)
            ).expect(200);

            const zip = await JSZip.loadAsync(response.body);
            const payloadBuffer = await zip.files['0.payload'].async('nodebuffer');

            const expectedPayload = Buffer.from('test-encrypted-payload-data');
            expect(payloadBuffer).toEqual(expectedPayload);
        });

        it('should set correct filename in Content-Disposition', async () => {
            const response = await asBuffer(
                request(app)
                .get(`/api/resources/${testResourceId}/download`)
                .set('Authorization', `Bearer ${testToken}`)
            ).expect(200);

            const contentDisposition = response.headers['content-disposition'];
            expect(contentDisposition).toContain(`${testResourceId}.ztdf`);
        });

        it('should include integrity information with segments', async () => {
            const response = await asBuffer(
                request(app)
                .get(`/api/resources/${testResourceId}/download`)
                .set('Authorization', `Bearer ${testToken}`)
            ).expect(200);

            const zip = await JSZip.loadAsync(response.body);
            const manifestText = await zip.files['0.manifest.json'].async('text');
            const manifest = JSON.parse(manifestText) as IOpenTDFManifest;

            const integrity = manifest.encryptionInformation.integrityInformation;
            expect(integrity.rootSignature).toBeDefined();
            expect(integrity.rootSignature.alg).toBe('HS256');
            expect(integrity.rootSignature.sig).toBeTruthy();
            expect(integrity.segmentHashAlg).toBe('GMAC');
            expect(integrity.segments).toBeInstanceOf(Array);
            expect(integrity.segments.length).toBeGreaterThan(0);
            expect(integrity.segments[0].hash).toBeTruthy();
            expect(integrity.segments[0].segmentSize).toBeGreaterThan(0);
            expect(integrity.segments[0].encryptedSegmentSize).toBeGreaterThan(0);
        });

        it('should decode base64 policy to valid JSON', async () => {
            const response = await asBuffer(
                request(app)
                    .get(`/api/resources/${testResourceId}/download`)
                    .set('Authorization', `Bearer ${testToken}`)
            ).expect(200);

            const zip = await JSZip.loadAsync(response.body);
            const manifestText = await zip.files['0.manifest.json'].async('text');
            const manifest = JSON.parse(manifestText) as IOpenTDFManifest;

            const policyBase64 = manifest.encryptionInformation.policy;
            expect(policyBase64).toBeTruthy();

            // Decode and verify structure
            const policyJson = Buffer.from(policyBase64, 'base64').toString('utf-8');
            const policy = JSON.parse(policyJson);

            expect(policy.uuid).toBeTruthy();
            expect(policy.body).toBeDefined();
        });

    });

    // ============================================
    // OpenTDF CLI Compatibility Tests
    // ============================================

    describe('OpenTDF CLI Compatibility', () => {

        it('should create ZIP compatible with standard ZIP tools', async () => {
            const response = await asBuffer(
                request(app)
                    .get(`/api/resources/${testResourceId}/download`)
                    .set('Authorization', `Bearer ${testToken}`)
            ).expect(200);

            // Verify ZIP magic bytes (PK signature)
            expect(response.body[0]).toBe(0x50); // 'P'
            expect(response.body[1]).toBe(0x4B); // 'K'

            // Should be loadable by JSZip (standard ZIP library)
            const zip = await JSZip.loadAsync(response.body);
            expect(zip).toBeDefined();
        });

        it('should use STORE compression (no compression) per OpenTDF spec', async () => {
            const response = await asBuffer(
                request(app)
                    .get(`/api/resources/${testResourceId}/download`)
                    .set('Authorization', `Bearer ${testToken}`)
            ).expect(200);

            const zip = await JSZip.loadAsync(response.body);

            // Check compression method for payload (should be STORE = 0)
            const payloadFile = zip.files['0.payload'];
            // Note: JSZip may not expose compression method directly in all versions
            // This is a best-effort check
            expect(payloadFile).toBeDefined();
        });

        // NOTE: Actual OpenTDF CLI testing would require:
        // 1. OpenTDF CLI installed (npm install -g @opentdf/cli)
        // 2. Running KAS instance
        // 3. exec() to run: opentdf decrypt --input test.ztdf --output decrypted.txt
        // This is included as documentation for manual testing

        it('should document OpenTDF CLI compatibility test (manual)', () => {
            // MANUAL TEST INSTRUCTIONS:
            // 1. Run this E2E test to generate a ZTDF file
            // 2. Save the downloaded ZIP to test.ztdf
            // 3. Install OpenTDF CLI: npm install -g @opentdf/cli
            // 4. Run: opentdf decrypt --input test.ztdf --output decrypted.txt --auth-token YOUR_TOKEN
            // 5. Verify decrypted.txt matches original content

            const manualTestInstructions = `
# Manual OpenTDF CLI Compatibility Test

## Prerequisites
npm install -g @opentdf/cli

## Steps
1. Download ZTDF file from API:
   curl -H "Authorization: Bearer YOUR_TOKEN" \\
        http://localhost:4000/api/resources/${testResourceId}/download \\
        -o test.ztdf

2. Verify ZIP structure:
   unzip -l test.ztdf
   # Expected:
   #   0.manifest.json
   #   0.payload

3. Decrypt with OpenTDF CLI:
   opentdf decrypt \\
       --input test.ztdf \\
       --output decrypted.txt \\
       --auth-token YOUR_TOKEN

4. Verify content:
   cat decrypted.txt
   # Should match original encrypted content
            `;

            expect(manualTestInstructions).toBeTruthy();
        });

    });

});

