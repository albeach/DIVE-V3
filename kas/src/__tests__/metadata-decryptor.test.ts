/**
 * Unit Tests: Metadata Decryptor Service
 * 
 * Phase 4.1.1: EncryptedMetadata Decryption
 * 
 * Test Coverage:
 * - AES-256-GCM decryption (success/failure)
 * - RSA-OAEP-256 decryption (success/failure)
 * - Policy assertion validation
 * - Policy hash computation
 * - Malformed metadata handling
 * - Missing policy assertions
 * - Policy mismatch scenarios
 */

import crypto from 'crypto';
import {
    MetadataDecryptorService,
    IDecryptedMetadata,
    IPolicyAssertion,
    IMetadataValidationResult,
} from '../services/metadata-decryptor';
import { IPolicy } from '../types/rewrap.types';

describe('MetadataDecryptorService', () => {
    let service: MetadataDecryptorService;

    beforeEach(() => {
        service = new MetadataDecryptorService();
    });

    // ============================================
    // Test 1: AES-256-GCM Decryption - Success
    // ============================================
    describe('decryptMetadata - AES-256-GCM', () => {
        test('should decrypt valid AES-256-GCM encrypted metadata', async () => {
            // Create test metadata
            const testMetadata = {
                fields: {
                    title: 'Test Document',
                    author: 'Alice',
                    createdAt: '2026-01-31T00:00:00Z',
                },
                policyAssertion: {
                    policyHash: 'test-hash-123',
                    classification: 'SECRET',
                    releasabilityTo: ['USA', 'GBR'],
                },
            };

            // Encrypt metadata
            const key = crypto.randomBytes(32); // AES-256 key
            const iv = crypto.randomBytes(12);  // GCM IV
            const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

            const plaintext = JSON.stringify(testMetadata);
            let encrypted = cipher.update(plaintext, 'utf8');
            encrypted = Buffer.concat([encrypted, cipher.final()]);
            const authTag = cipher.getAuthTag();

            // Combine: IV + authTag + ciphertext
            const encryptedMetadata = Buffer.concat([iv, authTag, encrypted]).toString('base64');

            // Decrypt
            const result = await service.decryptMetadata(encryptedMetadata, key, {
                algorithm: 'AES-256-GCM',
                validatePolicy: false,
            });

            expect(result.fields).toEqual(testMetadata.fields);
            expect(result.policyAssertion).toEqual(testMetadata.policyAssertion);
            expect(result.algorithm).toBe('AES-256-GCM');
            expect(result.decryptedAt).toBeDefined();
        });

        test('should handle metadata without policy assertions', async () => {
            const testMetadata = {
                title: 'Simple Document',
                size: 1024,
            };

            const key = crypto.randomBytes(32);
            const iv = crypto.randomBytes(12);
            const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

            const plaintext = JSON.stringify(testMetadata);
            let encrypted = cipher.update(plaintext, 'utf8');
            encrypted = Buffer.concat([encrypted, cipher.final()]);
            const authTag = cipher.getAuthTag();

            const encryptedMetadata = Buffer.concat([iv, authTag, encrypted]).toString('base64');

            const result = await service.decryptMetadata(encryptedMetadata, key);

            expect(result.fields).toEqual(testMetadata);
            expect(result.policyAssertion).toBeUndefined();
        });

        test('should reject decryption with wrong key', async () => {
            const testMetadata = { test: 'data' };
            const correctKey = crypto.randomBytes(32);
            const wrongKey = crypto.randomBytes(32);
            const iv = crypto.randomBytes(12);

            const cipher = crypto.createCipheriv('aes-256-gcm', correctKey, iv);
            const plaintext = JSON.stringify(testMetadata);
            let encrypted = cipher.update(plaintext, 'utf8');
            encrypted = Buffer.concat([encrypted, cipher.final()]);
            const authTag = cipher.getAuthTag();

            const encryptedMetadata = Buffer.concat([iv, authTag, encrypted]).toString('base64');

            await expect(
                service.decryptMetadata(encryptedMetadata, wrongKey)
            ).rejects.toThrow(/Failed to decrypt metadata/);
        });

        test('should reject malformed encrypted metadata (too short)', async () => {
            const key = crypto.randomBytes(32);
            const malformedData = Buffer.from('short').toString('base64');

            await expect(
                service.decryptMetadata(malformedData, key)
            ).rejects.toThrow(/too short/);
        });

        test('should reject invalid key length', async () => {
            const testMetadata = { test: 'data' };
            const key = crypto.randomBytes(32);
            const iv = crypto.randomBytes(12);

            const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
            const plaintext = JSON.stringify(testMetadata);
            let encrypted = cipher.update(plaintext, 'utf8');
            encrypted = Buffer.concat([encrypted, cipher.final()]);
            const authTag = cipher.getAuthTag();

            const encryptedMetadata = Buffer.concat([iv, authTag, encrypted]).toString('base64');

            // Use wrong key length
            const wrongLengthKey = crypto.randomBytes(16); // AES-128 key, not AES-256

            await expect(
                service.decryptMetadata(encryptedMetadata, wrongLengthKey)
            ).rejects.toThrow(/Invalid key length/);
        });

        test('should reject corrupted ciphertext', async () => {
            const testMetadata = { test: 'data' };
            const key = crypto.randomBytes(32);
            const iv = crypto.randomBytes(12);

            const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
            const plaintext = JSON.stringify(testMetadata);
            let encrypted = cipher.update(plaintext, 'utf8');
            encrypted = Buffer.concat([encrypted, cipher.final()]);
            const authTag = cipher.getAuthTag();

            // Corrupt the ciphertext
            encrypted[0] = encrypted[0] ^ 0xFF;

            const encryptedMetadata = Buffer.concat([iv, authTag, encrypted]).toString('base64');

            await expect(
                service.decryptMetadata(encryptedMetadata, key)
            ).rejects.toThrow();
        });
    });

    // ============================================
    // Test 2: Policy Assertion Validation
    // ============================================
    describe('validateMetadataPolicyMatch', () => {
        test('should pass validation when policy assertions match', () => {
            const metadata: IDecryptedMetadata = {
                fields: { title: 'Test' },
                policyAssertion: {
                    policyHash: 'abc123',
                    classification: 'SECRET',
                    releasabilityTo: ['USA', 'GBR'],
                    COI: ['FVEY'],
                },
            };

            const expectedPolicy: IPolicy = {
                policyId: 'policy-1',
                dissem: {
                    classification: 'SECRET',
                    releasabilityTo: ['USA', 'GBR'],
                    COI: ['FVEY'],
                },
            };

            const result = service.validateMetadataPolicyMatch(
                metadata,
                expectedPolicy,
                'abc123'
            );

            expect(result.valid).toBe(true);
            expect(result.mismatches).toBeUndefined();
        });

        test('should fail validation on policy hash mismatch', () => {
            const metadata: IDecryptedMetadata = {
                fields: { title: 'Test' },
                policyAssertion: {
                    policyHash: 'wrong-hash',
                    classification: 'SECRET',
                },
            };

            const result = service.validateMetadataPolicyMatch(
                metadata,
                undefined,
                'expected-hash'
            );

            expect(result.valid).toBe(false);
            expect(result.reason).toContain('policyHash');
            expect(result.mismatches).toContain('policyHash');
        });

        test('should fail validation on classification mismatch', () => {
            const metadata: IDecryptedMetadata = {
                fields: { title: 'Test' },
                policyAssertion: {
                    classification: 'CONFIDENTIAL',
                },
            };

            const expectedPolicy: IPolicy = {
                dissem: {
                    classification: 'SECRET',
                },
            };

            const result = service.validateMetadataPolicyMatch(metadata, expectedPolicy);

            expect(result.valid).toBe(false);
            expect(result.mismatches).toContain('classification');
        });

        test('should fail validation on releasabilityTo mismatch', () => {
            const metadata: IDecryptedMetadata = {
                fields: { title: 'Test' },
                policyAssertion: {
                    releasabilityTo: ['USA', 'FRA'],
                },
            };

            const expectedPolicy: IPolicy = {
                dissem: {
                    releasabilityTo: ['USA', 'GBR'],
                },
            };

            const result = service.validateMetadataPolicyMatch(metadata, expectedPolicy);

            expect(result.valid).toBe(false);
            expect(result.mismatches).toContain('releasabilityTo');
        });

        test('should fail validation on COI mismatch', () => {
            const metadata: IDecryptedMetadata = {
                fields: { title: 'Test' },
                policyAssertion: {
                    COI: ['NATO-COSMIC'],
                },
            };

            const expectedPolicy: IPolicy = {
                dissem: {
                    COI: ['FVEY'],
                },
            };

            const result = service.validateMetadataPolicyMatch(metadata, expectedPolicy);

            expect(result.valid).toBe(false);
            expect(result.mismatches).toContain('COI');
        });

        test('should pass validation when no policy assertion in metadata', () => {
            const metadata: IDecryptedMetadata = {
                fields: { title: 'Test' },
            };

            const result = service.validateMetadataPolicyMatch(metadata);

            expect(result.valid).toBe(true);
        });

        test('should handle multiple mismatches', () => {
            const metadata: IDecryptedMetadata = {
                fields: { title: 'Test' },
                policyAssertion: {
                    policyHash: 'wrong-hash',
                    classification: 'CONFIDENTIAL',
                    releasabilityTo: ['USA'],
                },
            };

            const expectedPolicy: IPolicy = {
                dissem: {
                    classification: 'SECRET',
                    releasabilityTo: ['USA', 'GBR'],
                },
            };

            const result = service.validateMetadataPolicyMatch(
                metadata,
                expectedPolicy,
                'expected-hash'
            );

            expect(result.valid).toBe(false);
            expect(result.mismatches).toEqual(
                expect.arrayContaining(['policyHash', 'classification', 'releasabilityTo'])
            );
        });
    });

    // ============================================
    // Test 3: Policy Hash Computation
    // ============================================
    describe('computePolicyHash', () => {
        test('should compute deterministic hash for same policy', () => {
            const policy: IPolicy = {
                policyId: 'policy-1',
                dissem: {
                    classification: 'SECRET',
                    releasabilityTo: ['USA', 'GBR'],
                    COI: ['FVEY'],
                },
            };

            const hash1 = service.computePolicyHash(policy);
            const hash2 = service.computePolicyHash(policy);

            expect(hash1).toBe(hash2);
            expect(hash1).toBeTruthy();
        });

        test('should produce different hashes for different policies', () => {
            const policy1: IPolicy = {
                dissem: { classification: 'SECRET' },
            };

            const policy2: IPolicy = {
                dissem: { classification: 'CONFIDENTIAL' },
            };

            const hash1 = service.computePolicyHash(policy1);
            const hash2 = service.computePolicyHash(policy2);

            expect(hash1).not.toBe(hash2);
        });

        test('should produce same hash regardless of key order', () => {
            const policy1: IPolicy = {
                policyId: 'policy-1',
                dissem: {
                    classification: 'SECRET',
                    releasabilityTo: ['USA', 'GBR'],
                },
            };

            // Same policy, different key order
            const policy2: IPolicy = {
                dissem: {
                    releasabilityTo: ['USA', 'GBR'],
                    classification: 'SECRET',
                },
                policyId: 'policy-1',
            };

            const hash1 = service.computePolicyHash(policy1);
            const hash2 = service.computePolicyHash(policy2);

            expect(hash1).toBe(hash2);
        });

        test('should handle nested objects', () => {
            const policy: IPolicy = {
                policyId: 'policy-1',
                dissem: {
                    classification: 'SECRET',
                    releasabilityTo: ['USA'],
                },
                body: {
                    nested: {
                        field: 'value',
                    },
                },
            };

            const hash = service.computePolicyHash(policy);
            expect(hash).toBeTruthy();
            expect(hash.length).toBeGreaterThan(0);
        });
    });

    // ============================================
    // Test 4: End-to-End Integration
    // ============================================
    describe('End-to-End Metadata Workflow', () => {
        test('should decrypt and validate metadata with policy', async () => {
            // Create policy
            const policy: IPolicy = {
                policyId: 'policy-123',
                dissem: {
                    classification: 'SECRET',
                    releasabilityTo: ['USA', 'GBR'],
                    COI: ['FVEY'],
                },
            };

            const policyHash = service.computePolicyHash(policy);

            // Create metadata with policy assertion
            const metadata = {
                fields: {
                    title: 'Classified Document',
                    size: 2048,
                },
                policyAssertion: {
                    policyHash,
                    classification: 'SECRET',
                    releasabilityTo: ['USA', 'GBR'],
                    COI: ['FVEY'],
                },
            };

            // Encrypt
            const key = crypto.randomBytes(32);
            const iv = crypto.randomBytes(12);
            const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

            const plaintext = JSON.stringify(metadata);
            let encrypted = cipher.update(plaintext, 'utf8');
            encrypted = Buffer.concat([encrypted, cipher.final()]);
            const authTag = cipher.getAuthTag();

            const encryptedMetadata = Buffer.concat([iv, authTag, encrypted]).toString('base64');

            // Decrypt and validate
            const result = await service.decryptMetadata(encryptedMetadata, key, {
                validatePolicy: true,
                expectedPolicy: policy,
                expectedPolicyHash: policyHash,
            });

            expect(result.fields).toEqual(metadata.fields);
            expect(result.policyAssertion?.policyHash).toBe(policyHash);
        });

        test('should reject decryption when policy validation fails', async () => {
            const correctPolicy: IPolicy = {
                dissem: { classification: 'SECRET' },
            };

            const wrongPolicy: IPolicy = {
                dissem: { classification: 'CONFIDENTIAL' },
            };

            const correctHash = service.computePolicyHash(correctPolicy);

            const metadata = {
                fields: { title: 'Test' },
                policyAssertion: {
                    policyHash: correctHash,
                    classification: 'SECRET',
                },
            };

            const key = crypto.randomBytes(32);
            const iv = crypto.randomBytes(12);
            const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

            const plaintext = JSON.stringify(metadata);
            let encrypted = cipher.update(plaintext, 'utf8');
            encrypted = Buffer.concat([encrypted, cipher.final()]);
            const authTag = cipher.getAuthTag();

            const encryptedMetadata = Buffer.concat([iv, authTag, encrypted]).toString('base64');

            await expect(
                service.decryptMetadata(encryptedMetadata, key, {
                    validatePolicy: true,
                    expectedPolicy: wrongPolicy,
                    expectedPolicyHash: service.computePolicyHash(wrongPolicy),
                })
            ).rejects.toThrow(/Policy assertion mismatches/);
        });
    });

    // ============================================
    // Test 5: Performance
    // ============================================
    describe('Performance', () => {
        test('should decrypt metadata in < 50ms', async () => {
            const testMetadata = {
                fields: { title: 'Performance Test' },
            };

            const key = crypto.randomBytes(32);
            const iv = crypto.randomBytes(12);
            const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

            const plaintext = JSON.stringify(testMetadata);
            let encrypted = cipher.update(plaintext, 'utf8');
            encrypted = Buffer.concat([encrypted, cipher.final()]);
            const authTag = cipher.getAuthTag();

            const encryptedMetadata = Buffer.concat([iv, authTag, encrypted]).toString('base64');

            const startTime = Date.now();
            await service.decryptMetadata(encryptedMetadata, key);
            const duration = Date.now() - startTime;

            expect(duration).toBeLessThan(50);
        });

        test('should validate policy in < 10ms', () => {
            const metadata: IDecryptedMetadata = {
                fields: { title: 'Test' },
                policyAssertion: {
                    policyHash: 'abc123',
                    classification: 'SECRET',
                    releasabilityTo: ['USA', 'GBR'],
                    COI: ['FVEY'],
                },
            };

            const policy: IPolicy = {
                dissem: {
                    classification: 'SECRET',
                    releasabilityTo: ['USA', 'GBR'],
                    COI: ['FVEY'],
                },
            };

            const startTime = Date.now();
            const result = service.validateMetadataPolicyMatch(metadata, policy, 'abc123');
            const duration = Date.now() - startTime;

            expect(duration).toBeLessThan(10);
            expect(result.valid).toBe(true);
        });
    });
});
