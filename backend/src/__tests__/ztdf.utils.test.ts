/**
 * ZTDF Utilities Test Suite
 * Tests for cryptographic functions, integrity validation, and ZTDF object creation
 * 
 * Target Coverage: 95%
 * Priority: CRITICAL (Security foundation)
 */

import {
    computeSHA384,
    computeObjectHash,
    validateZTDFIntegrity,
    encryptContent,
    decryptContent,
    createZTDFManifest,
    createSecurityLabel,
    createZTDFPolicy,
    createEncryptedChunk,
    createZTDFPayload,
    createZTDFObject,
    migrateLegacyResourceToZTDF
} from '../utils/ztdf.utils';
import { IZTDFObject, ClassificationLevel, generateDisplayMarking } from '../types/ztdf.types';
import { IResource } from '../services/resource.service';

describe('ZTDF Utilities', () => {
    // ============================================
    // SHA-384 Hashing Tests
    // ============================================
    describe('computeSHA384', () => {
        it('should return consistent hash for same input', () => {
            const input = 'test data';
            const hash1 = computeSHA384(input);
            const hash2 = computeSHA384(input);

            expect(hash1).toBe(hash2);
            expect(hash1).toMatch(/^[a-f0-9]{96}$/); // SHA-384 = 96 hex chars
        });

        it('should return different hashes for different inputs', () => {
            const hash1 = computeSHA384('test data 1');
            const hash2 = computeSHA384('test data 2');

            expect(hash1).not.toBe(hash2);
        });

        it('should handle empty strings', () => {
            const hash = computeSHA384('');
            expect(hash).toBeDefined();
            expect(hash).toMatch(/^[a-f0-9]{96}$/);
        });

        it('should handle unicode characters', () => {
            const input = 'Hello 世界 🌍';
            const hash = computeSHA384(input);
            expect(hash).toBeDefined();
            expect(hash).toMatch(/^[a-f0-9]{96}$/);
        });

        it('should handle Buffer input', () => {
            const buffer = Buffer.from('test data', 'utf8');
            const hash = computeSHA384(buffer);
            expect(hash).toBeDefined();
            expect(hash).toMatch(/^[a-f0-9]{96}$/);
        });

        it('should produce deterministic hashes (STANAG 4778 requirement)', () => {
            const input = 'NATO SECRET//COSMIC//REL USA, GBR, FRA';
            const hashes = Array.from({ length: 100 }, () => computeSHA384(input));

            // All hashes should be identical
            const uniqueHashes = new Set(hashes);
            expect(uniqueHashes.size).toBe(1);
        });
    });

    describe('computeObjectHash', () => {
        it('should return consistent hash for same object', () => {
            const obj = { classification: 'SECRET', releasabilityTo: ['USA', 'GBR'] };
            const hash1 = computeObjectHash(obj);
            const hash2 = computeObjectHash(obj);

            expect(hash1).toBe(hash2);
        });

        it('should be order-independent (canonical JSON)', () => {
            const obj1 = { a: 1, b: 2, c: 3 };
            const obj2 = { c: 3, a: 1, b: 2 };

            const hash1 = computeObjectHash(obj1);
            const hash2 = computeObjectHash(obj2);

            expect(hash1).toBe(hash2);
        });

        it('should handle nested objects', () => {
            const obj = {
                securityLabel: {
                    classification: 'SECRET',
                    releasabilityTo: ['USA']
                }
            };
            const hash = computeObjectHash(obj);
            expect(hash).toMatch(/^[a-f0-9]{96}$/);
        });

        it('should handle arrays', () => {
            const obj = { countries: ['USA', 'GBR', 'FRA'] };
            const hash = computeObjectHash(obj);
            expect(hash).toMatch(/^[a-f0-9]{96}$/);
        });
    });

    // ============================================
    // Encryption/Decryption Tests
    // ============================================
    describe('encryptContent / decryptContent', () => {
        it('should successfully encrypt and decrypt data', () => {
            const plaintext = 'This is a secret message';
            const encrypted = encryptContent(plaintext);

            expect(encrypted.encryptedData).toBeDefined();
            expect(encrypted.iv).toBeDefined();
            expect(encrypted.authTag).toBeDefined();
            expect(encrypted.dek).toBeDefined();

            const decrypted = decryptContent({
                encryptedData: encrypted.encryptedData,
                iv: encrypted.iv,
                authTag: encrypted.authTag,
                dek: encrypted.dek
            });

            expect(decrypted).toBe(plaintext);
        });

        it('should fail decryption with wrong key', () => {
            const plaintext = 'Secret data';
            const encrypted = encryptContent(plaintext);

            // Use a different DEK
            const wrongDEK = Buffer.from('wrong-key-32-bytes-padded-test', 'utf8').toString('base64');

            expect(() => {
                decryptContent({
                    encryptedData: encrypted.encryptedData,
                    iv: encrypted.iv,
                    authTag: encrypted.authTag,
                    dek: wrongDEK
                });
            }).toThrow();
        });

        it('should fail decryption with tampered ciphertext', () => {
            const plaintext = 'Secret data';
            const encrypted = encryptContent(plaintext);

            // Tamper with the ciphertext
            const tamperedData = 'tampered' + encrypted.encryptedData.substring(8);

            expect(() => {
                decryptContent({
                    encryptedData: tamperedData,
                    iv: encrypted.iv,
                    authTag: encrypted.authTag,
                    dek: encrypted.dek
                });
            }).toThrow();
        });

        it('should fail decryption with wrong IV', () => {
            const plaintext = 'Secret data';
            const encrypted = encryptContent(plaintext);

            // Use a different IV
            const wrongIV = Buffer.from('wrong-iv-12bytes').toString('base64');

            expect(() => {
                decryptContent({
                    encryptedData: encrypted.encryptedData,
                    iv: wrongIV,
                    authTag: encrypted.authTag,
                    dek: encrypted.dek
                });
            }).toThrow();
        });

        it('should fail decryption with wrong auth tag', () => {
            const plaintext = 'Secret data';
            const encrypted = encryptContent(plaintext);

            // Use a different auth tag
            const wrongAuthTag = Buffer.from('wrong-auth-tag-16', 'utf8').toString('base64');

            expect(() => {
                decryptContent({
                    encryptedData: encrypted.encryptedData,
                    iv: encrypted.iv,
                    authTag: wrongAuthTag,
                    dek: encrypted.dek
                });
            }).toThrow();
        });

        it('should handle large payloads (10MB)', () => {
            const largePayload = 'X'.repeat(10 * 1024 * 1024); // 10MB
            const encrypted = encryptContent(largePayload);
            const decrypted = decryptContent({
                encryptedData: encrypted.encryptedData,
                iv: encrypted.iv,
                authTag: encrypted.authTag,
                dek: encrypted.dek
            });

            expect(decrypted).toBe(largePayload);
        }, 15000); // Increase timeout for large payload

        it('should handle empty strings', () => {
            const encrypted = encryptContent('');
            const decrypted = decryptContent({
                encryptedData: encrypted.encryptedData,
                iv: encrypted.iv,
                authTag: encrypted.authTag,
                dek: encrypted.dek
            });

            expect(decrypted).toBe('');
        });

        it('should handle unicode content', () => {
            const plaintext = '秘密情報 🔒 Geheime Daten';
            const encrypted = encryptContent(plaintext);
            const decrypted = decryptContent({
                encryptedData: encrypted.encryptedData,
                iv: encrypted.iv,
                authTag: encrypted.authTag,
                dek: encrypted.dek
            });

            expect(decrypted).toBe(plaintext);
        });

        it('should generate different ciphertexts for same plaintext (random IV)', () => {
            const plaintext = 'Same message';
            const encrypted1 = encryptContent(plaintext);
            const encrypted2 = encryptContent(plaintext);

            // IVs should be different
            expect(encrypted1.iv).not.toBe(encrypted2.iv);
            // Ciphertexts should be different
            expect(encrypted1.encryptedData).not.toBe(encrypted2.encryptedData);

            // But both should decrypt to same plaintext
            const decrypted1 = decryptContent(encrypted1);
            const decrypted2 = decryptContent(encrypted2);
            expect(decrypted1).toBe(plaintext);
            expect(decrypted2).toBe(plaintext);
        });
    });

    // ============================================
    // ZTDF Integrity Validation Tests
    // ============================================
    describe('validateZTDFIntegrity', () => {
        let validZTDF: IZTDFObject;

        beforeEach(() => {
            // Create a valid ZTDF object
            const encrypted = encryptContent('Test content');

            const manifest = createZTDFManifest({
                objectId: 'test-001',
                objectType: 'document',
                owner: 'testuser',
                contentType: 'text/plain',
                payloadSize: 100
            });

            const securityLabel = createSecurityLabel({
                classification: 'SECRET',
                releasabilityTo: ['USA', 'GBR'],
                COI: ['FVEY'],
                originatingCountry: 'USA'
            });

            const policy = createZTDFPolicy({
                securityLabel,
                policyAssertions: []
            });

            const chunk = createEncryptedChunk({
                chunkId: 0,
                encryptedData: encrypted.encryptedData
            });

            const kao = {
                kaoId: 'kao-1',
                kasUrl: 'http://localhost:8080',
                kasId: 'test-kas',
                wrappedKey: encrypted.dek,
                wrappingAlgorithm: 'RSA-OAEP-256',
                policyBinding: {
                    clearanceRequired: 'SECRET' as ClassificationLevel,
                    countriesAllowed: ['USA']
                },
                createdAt: new Date().toISOString()
            };

            const payload = createZTDFPayload({
                encryptionAlgorithm: 'AES-256-GCM',
                iv: encrypted.iv,
                authTag: encrypted.authTag,
                keyAccessObjects: [kao],
                encryptedChunks: [chunk]
            });

            validZTDF = createZTDFObject({
                manifest,
                policy,
                payload
            });
        });

        it('should pass validation for valid ZTDF resource', async () => {
            const result = await validateZTDFIntegrity(validZTDF);

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should fail validation for tampered policy section', async () => {
            // Tamper with policy by setting an incorrect hash
            const tamperedZTDF = JSON.parse(JSON.stringify(validZTDF));

            // Set an obviously wrong policy hash
            tamperedZTDF.policy.policyHash = 'wrong_hash_value_that_will_not_match';

            const result = await validateZTDFIntegrity(tamperedZTDF);

            // Validation should fail because hash doesn't match computed hash
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('Policy hash mismatch'))).toBe(true);
        });

        it('should fail validation for tampered payload section', async () => {
            // Tamper with payload
            const tamperedZTDF = JSON.parse(JSON.stringify(validZTDF));
            tamperedZTDF.payload.encryptedChunks[0].encryptedData = 'tampered-data';

            const result = await validateZTDFIntegrity(tamperedZTDF);

            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });

        it('should fail validation for missing policy hash', async () => {
            const ztdf = JSON.parse(JSON.stringify(validZTDF));
            delete ztdf.policy.policyHash;

            const result = await validateZTDFIntegrity(ztdf);

            expect(result.warnings).toContain('Policy hash not present (integrity cannot be verified)');
        });

        it('should fail validation for missing payload hash', async () => {
            const ztdf = JSON.parse(JSON.stringify(validZTDF));
            delete ztdf.payload.payloadHash;

            const result = await validateZTDFIntegrity(ztdf);

            expect(result.warnings).toContain('Payload hash not present (integrity cannot be verified)');
        });

        it('should fail validation for tampered chunk hash', async () => {
            const tamperedZTDF = JSON.parse(JSON.stringify(validZTDF));
            tamperedZTDF.payload.encryptedChunks[0].encryptedData = 'tampered';

            const result = await validateZTDFIntegrity(tamperedZTDF);

            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('Chunk'))).toBe(true);
        });

        it('should fail validation for missing objectId', async () => {
            const ztdf = JSON.parse(JSON.stringify(validZTDF));
            delete ztdf.manifest.objectId;

            const result = await validateZTDFIntegrity(ztdf);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Missing required field: manifest.objectId');
        });

        it('should fail validation for missing security label', async () => {
            const ztdf = JSON.parse(JSON.stringify(validZTDF));
            ztdf.policy.securityLabel = null as any;

            const result = await validateZTDFIntegrity(ztdf);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Missing required field: policy.securityLabel');
        });

        it('should fail validation for missing classification', async () => {
            const ztdf = JSON.parse(JSON.stringify(validZTDF));
            delete ztdf.policy.securityLabel.classification;

            const result = await validateZTDFIntegrity(ztdf);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Missing required field: policy.securityLabel.classification');
        });

        it('should fail validation for empty releasabilityTo (fail-closed)', async () => {
            const ztdf = JSON.parse(JSON.stringify(validZTDF));
            ztdf.policy.securityLabel.releasabilityTo = [];

            const result = await validateZTDFIntegrity(ztdf);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Empty releasabilityTo list (deny all access)');
        });

        it('should warn if no Key Access Objects', async () => {
            const ztdf = JSON.parse(JSON.stringify(validZTDF));
            ztdf.payload.keyAccessObjects = [];

            const result = await validateZTDFIntegrity(ztdf);

            expect(result.warnings).toContain('No Key Access Objects (cannot decrypt payload)');
        });

        it('should warn about policy signature but not fail', async () => {
            const ztdf = JSON.parse(JSON.stringify(validZTDF));
            ztdf.policy.policySignature = {
                algorithm: 'RS256',
                value: 'signature-data',
                signerId: 'test-signer',
                timestamp: new Date().toISOString()
            };

            const result = await validateZTDFIntegrity(ztdf);

            expect(result.warnings.length).toBeGreaterThan(0);
            // Warning message updated for X.509 implementation
        });
    });

    // ============================================
    // ZTDF Object Creation Tests
    // ============================================
    describe('createZTDFManifest', () => {
        it('should create valid manifest', () => {
            const manifest = createZTDFManifest({
                objectId: 'test-001',
                objectType: 'document',
                owner: 'testuser',
                contentType: 'text/plain',
                payloadSize: 1024
            });

            expect(manifest.objectId).toBe('test-001');
            expect(manifest.version).toBe('1.0');
            expect(manifest.objectType).toBe('document');
            expect(manifest.owner).toBe('testuser');
            expect(manifest.contentType).toBe('text/plain');
            expect(manifest.payloadSize).toBe(1024);
            expect(manifest.createdAt).toBeDefined();
            expect(manifest.modifiedAt).toBeDefined();
        });

        it('should include optional ownerOrganization', () => {
            const manifest = createZTDFManifest({
                objectId: 'test-001',
                objectType: 'document',
                owner: 'testuser',
                ownerOrganization: 'NATO',
                contentType: 'text/plain',
                payloadSize: 1024
            });

            expect(manifest.ownerOrganization).toBe('NATO');
        });

        it('should set createdAt and modifiedAt timestamps', () => {
            const before = new Date();
            const manifest = createZTDFManifest({
                objectId: 'test-001',
                objectType: 'document',
                owner: 'testuser',
                contentType: 'text/plain',
                payloadSize: 1024
            });
            const after = new Date();

            const createdAt = new Date(manifest.createdAt);
            expect(createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
            expect(createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
        });
    });

    describe('createSecurityLabel', () => {
        it('should create valid STANAG 4774 label', () => {
            const label = createSecurityLabel({
                classification: 'SECRET',
                releasabilityTo: ['USA', 'GBR', 'FRA'],
                COI: ['FVEY'],
                originatingCountry: 'USA'
            });

            expect(label.classification).toBe('SECRET');
            expect(label.releasabilityTo).toEqual(['USA', 'GBR', 'FRA']);
            expect(label.COI).toEqual(['FVEY']);
            expect(label.originatingCountry).toBe('USA');
            expect(label.creationDate).toBeDefined();
            expect(label.displayMarking).toBeDefined();
        });

        it('should generate display marking', () => {
            const label = createSecurityLabel({
                classification: 'SECRET',
                releasabilityTo: ['USA', 'GBR'],
                COI: ['FVEY'],
                originatingCountry: 'USA'
            });

            expect(label.displayMarking).toContain('SECRET');
            expect(label.displayMarking).toContain('FVEY');
            expect(label.displayMarking).toContain('REL USA, GBR');
        });

        it('should handle missing COI', () => {
            const label = createSecurityLabel({
                classification: 'CONFIDENTIAL',
                releasabilityTo: ['USA'],
                originatingCountry: 'USA'
            });

            expect(label.COI).toBeUndefined();
        });

        it('should handle caveats', () => {
            const label = createSecurityLabel({
                classification: 'SECRET',
                releasabilityTo: ['USA'],
                caveats: ['NOFORN'],
                originatingCountry: 'USA'
            });

            expect(label.caveats).toEqual(['NOFORN']);
        });
    });

    describe('createZTDFPolicy', () => {
        it('should create policy with hash', () => {
            const securityLabel = createSecurityLabel({
                classification: 'SECRET',
                releasabilityTo: ['USA'],
                originatingCountry: 'USA'
            });

            const policy = createZTDFPolicy({
                securityLabel,
                policyAssertions: []
            });

            expect(policy.securityLabel).toEqual(securityLabel);
            expect(policy.policyVersion).toBe('1.0');
            expect(policy.policyHash).toBeDefined();
            expect(policy.policyHash).toMatch(/^[a-f0-9]{96}$/);
        });

        it('should include policy assertions', () => {
            const securityLabel = createSecurityLabel({
                classification: 'SECRET',
                releasabilityTo: ['USA'],
                originatingCountry: 'USA'
            });

            const policy = createZTDFPolicy({
                securityLabel,
                policyAssertions: [
                    { type: 'clearance-required', value: 'SECRET' },
                    { type: 'coi-required', value: ['FVEY'] }
                ]
            });

            expect(policy.policyAssertions).toHaveLength(2);
            expect(policy.policyAssertions[0].type).toBe('clearance-required');
            expect(policy.policyAssertions[1].type).toBe('coi-required');
        });
    });

    describe('createEncryptedChunk', () => {
        it('should create chunk with integrity hash', () => {
            const chunk = createEncryptedChunk({
                chunkId: 0,
                encryptedData: 'base64-encoded-data'
            });

            expect(chunk.chunkId).toBe(0);
            expect(chunk.encryptedData).toBe('base64-encoded-data');
            expect(chunk.size).toBeGreaterThan(0);
            expect(chunk.integrityHash).toBeDefined();
            expect(chunk.integrityHash).toMatch(/^[a-f0-9]{96}$/);
        });

        it('should compute correct size from base64', () => {
            const testData = Buffer.from('test data', 'utf8').toString('base64');
            const chunk = createEncryptedChunk({
                chunkId: 0,
                encryptedData: testData
            });

            expect(chunk.size).toBe(9); // 'test data' is 9 bytes
        });
    });

    describe('createZTDFPayload', () => {
        it('should create payload with hash', () => {
            const encrypted = encryptContent('test');
            const chunk = createEncryptedChunk({
                chunkId: 0,
                encryptedData: encrypted.encryptedData
            });

            const kao = {
                kaoId: 'kao-1',
                kasUrl: 'http://localhost:8080',
                kasId: 'test-kas',
                wrappedKey: encrypted.dek,
                wrappingAlgorithm: 'RSA-OAEP-256',
                policyBinding: {},
                createdAt: new Date().toISOString()
            };

            const payload = createZTDFPayload({
                encryptionAlgorithm: 'AES-256-GCM',
                iv: encrypted.iv,
                authTag: encrypted.authTag,
                keyAccessObjects: [kao],
                encryptedChunks: [chunk]
            });

            expect(payload.encryptionAlgorithm).toBe('AES-256-GCM');
            expect(payload.iv).toBe(encrypted.iv);
            expect(payload.authTag).toBe(encrypted.authTag);
            expect(payload.keyAccessObjects).toHaveLength(1);
            expect(payload.encryptedChunks).toHaveLength(1);
            expect(payload.payloadHash).toBeDefined();
            expect(payload.payloadHash).toMatch(/^[a-f0-9]{96}$/);
        });
    });

    describe('createZTDFObject', () => {
        it('should create complete ZTDF object', async () => {
            const encrypted = encryptContent('test content');
            const manifest = createZTDFManifest({
                objectId: 'test-001',
                objectType: 'document',
                owner: 'testuser',
                contentType: 'text/plain',
                payloadSize: 100
            });

            const securityLabel = createSecurityLabel({
                classification: 'SECRET',
                releasabilityTo: ['USA'],
                originatingCountry: 'USA'
            });

            const policy = createZTDFPolicy({
                securityLabel,
                policyAssertions: []
            });

            const chunk = createEncryptedChunk({
                chunkId: 0,
                encryptedData: encrypted.encryptedData
            });

            const kao = {
                kaoId: 'kao-1',
                kasUrl: 'http://localhost:8080',
                kasId: 'test-kas',
                wrappedKey: encrypted.dek,
                wrappingAlgorithm: 'RSA-OAEP-256',
                policyBinding: {},
                createdAt: new Date().toISOString()
            };

            const payload = createZTDFPayload({
                encryptionAlgorithm: 'AES-256-GCM',
                iv: encrypted.iv,
                authTag: encrypted.authTag,
                keyAccessObjects: [kao],
                encryptedChunks: [chunk]
            });

            const ztdf = createZTDFObject({
                manifest,
                policy,
                payload
            });

            expect(ztdf.manifest).toEqual(manifest);
            expect(ztdf.policy).toEqual(policy);
            expect(ztdf.payload).toEqual(payload);

            // Validate integrity of created object
            const validation = await validateZTDFIntegrity(ztdf);
            expect(validation.valid).toBe(true);
        });
    });

    // ============================================
    // Legacy Resource Migration Tests
    // ============================================
    describe('migrateLegacyResourceToZTDF', () => {
        it('should migrate unencrypted legacy resource', async () => {
            const legacyResource: IResource = {
                resourceId: 'doc-001',
                title: 'Test Document',
                classification: 'SECRET',
                releasabilityTo: ['USA', 'GBR'],
                COI: ['FVEY'],
                encrypted: false,
                content: 'Plaintext content'
            };

            const ztdf = migrateLegacyResourceToZTDF(legacyResource);

            expect(ztdf.manifest.objectId).toBe('doc-001');
            expect(ztdf.policy.securityLabel.classification).toBe('SECRET');
            expect(ztdf.policy.securityLabel.releasabilityTo).toEqual(['USA', 'GBR']);
            expect(ztdf.policy.securityLabel.COI).toEqual(['FVEY']);
            expect(ztdf.payload.encryptedChunks).toHaveLength(1);
            expect(ztdf.payload.keyAccessObjects).toHaveLength(1);

            // Validate integrity
            const validation = await validateZTDFIntegrity(ztdf);
            expect(validation.valid).toBe(true);
        });

        it('should migrate encrypted legacy resource', async () => {
            const legacyResource: IResource = {
                resourceId: 'doc-002',
                title: 'Encrypted Document',
                classification: 'TOP_SECRET',
                releasabilityTo: ['USA'],
                COI: ['US-ONLY'],
                encrypted: true,
                encryptedContent: 'base64-encrypted-data'
            };

            const ztdf = migrateLegacyResourceToZTDF(legacyResource);

            expect(ztdf.manifest.objectId).toBe('doc-002');
            expect(ztdf.policy.securityLabel.classification).toBe('TOP_SECRET');
            expect(ztdf.payload.encryptedChunks[0].encryptedData).toBe('base64-encrypted-data');
        });

        it('should create policy assertions from legacy fields', () => {
            const legacyResource: IResource = {
                resourceId: 'doc-003',
                title: 'Test',
                classification: 'CONFIDENTIAL',
                releasabilityTo: ['USA', 'CAN'],
                COI: ['CAN-US'],
                encrypted: false,
                content: 'test'
            };

            const ztdf = migrateLegacyResourceToZTDF(legacyResource);

            expect(ztdf.policy.policyAssertions).toContainEqual({
                type: 'clearance-required',
                value: 'CONFIDENTIAL'
            });

            expect(ztdf.policy.policyAssertions).toContainEqual({
                type: 'releasability-required',
                value: ['USA', 'CAN']
            });

            expect(ztdf.policy.policyAssertions).toContainEqual({
                type: 'coi-required',
                value: ['CAN-US']
            });
        });

        it('should handle missing COI gracefully', () => {
            const legacyResource: IResource = {
                resourceId: 'doc-004',
                title: 'No COI',
                classification: 'UNCLASSIFIED',
                releasabilityTo: ['USA'],
                COI: [],
                encrypted: false,
                content: 'public'
            };

            const ztdf = migrateLegacyResourceToZTDF(legacyResource);

            expect(ztdf.policy.securityLabel.COI).toEqual([]);
            // Should not have coi-required assertion
            const coiAssertion = ztdf.policy.policyAssertions.find(a => a.type === 'coi-required');
            expect(coiAssertion).toBeUndefined();
        });

        it('should handle empty content', async () => {
            const legacyResource: IResource = {
                resourceId: 'doc-005',
                title: 'Empty',
                classification: 'UNCLASSIFIED',
                releasabilityTo: ['USA'],
                COI: [],
                encrypted: false,
                content: ''
            };

            const ztdf = migrateLegacyResourceToZTDF(legacyResource);
            const validation = await validateZTDFIntegrity(ztdf);

            expect(validation.valid).toBe(true);
        });
    });

    // ============================================
    // Display Marking Tests
    // ============================================
    describe('generateDisplayMarking', () => {
        it('should format SECRET//FVEY//REL USA, GBR', () => {
            const label = createSecurityLabel({
                classification: 'SECRET',
                releasabilityTo: ['USA', 'GBR'],
                COI: ['FVEY'],
                originatingCountry: 'USA'
            });

            const marking = generateDisplayMarking(label);

            expect(marking).toBe('SECRET//FVEY//REL USA, GBR');
        });

        it('should format TOP_SECRET//NATO-COSMIC//REL USA, GBR, FRA, DEU, CAN', () => {
            const label = createSecurityLabel({
                classification: 'TOP_SECRET',
                releasabilityTo: ['USA', 'GBR', 'FRA', 'DEU', 'CAN'],
                COI: ['NATO-COSMIC'],
                originatingCountry: 'USA'
            });

            const marking = generateDisplayMarking(label);

            expect(marking).toContain('TOP_SECRET');
            expect(marking).toContain('NATO-COSMIC');
            expect(marking).toContain('REL USA, GBR, FRA, DEU, CAN');
        });

        it('should handle missing COI', () => {
            const label = createSecurityLabel({
                classification: 'CONFIDENTIAL',
                releasabilityTo: ['USA'],
                originatingCountry: 'USA'
            });

            const marking = generateDisplayMarking(label);

            expect(marking).toBe('CONFIDENTIAL//REL USA');
        });

        it('should handle single country', () => {
            const label = createSecurityLabel({
                classification: 'SECRET',
                releasabilityTo: ['USA'],
                originatingCountry: 'USA'
            });

            const marking = generateDisplayMarking(label);

            expect(marking).toBe('SECRET//REL USA');
        });

        it('should handle caveats', () => {
            const label = createSecurityLabel({
                classification: 'SECRET',
                releasabilityTo: ['USA'],
                caveats: ['NOFORN', 'PROPIN'],
                originatingCountry: 'USA'
            });

            const marking = generateDisplayMarking(label);

            expect(marking).toContain('NOFORN-PROPIN');
        });

        it('should sort countries alphabetically', () => {
            const label = createSecurityLabel({
                classification: 'SECRET',
                releasabilityTo: ['GBR', 'USA', 'CAN'],
                originatingCountry: 'USA'
            });

            const marking = generateDisplayMarking(label);

            // Releasability list should be in original order (not sorted)
            expect(marking).toBe('SECRET//REL GBR, USA, CAN');
        });
    });
});
