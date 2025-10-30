/**
 * ZTDF Crypto Service Tests - Phase 4
 * 
 * Tests for STANAG 4778 cryptographic binding functionality.
 * 
 * Test Coverage:
 * - Metadata signing (RSA-SHA256)
 * - Signature verification (valid/invalid)
 * - Key wrapping (DEK with KEK)
 * - Key unwrapping
 * - Invalid key handling
 * - Metadata tampering detection
 * 
 * Created: October 29, 2025 (Phase 4)
 */

import { ztdfCryptoService, IZTDFMetadata } from '../services/ztdf-crypto.service';
import crypto from 'crypto';

describe('ZTDFCryptoService', () => {
    // ============================================
    // Test Data
    // ============================================

    const sampleMetadata: IZTDFMetadata = {
        resourceId: 'test-resource-001',
        classification: 'SECRET',
        originalClassification: 'SECRET',
        originalCountry: 'USA',
        releasabilityTo: ['USA', 'GBR', 'CAN'],
        COI: ['FVEY'],
        policy: {
            clearanceRequired: 'SECRET',
            countriesAllowed: ['USA', 'GBR', 'CAN'],
            coiRequired: ['FVEY']
        },
        creationDate: '2025-10-29T12:00:00.000Z'
    };

    // ============================================
    // Metadata Signing Tests
    // ============================================

    describe('signMetadata', () => {
        it('should sign metadata with RSA-SHA256', async () => {
            const result = await ztdfCryptoService.signMetadata(sampleMetadata);

            expect(result.signature).toBeDefined();
            expect(result.algorithm).toBe('RSA-SHA256');
            expect(result.timestamp).toBeDefined();
            expect(result.keyId).toBe('sig-key-001');
            expect(result.signature.length).toBeGreaterThan(0);
        });

        it('should produce deterministic signatures for same metadata', async () => {
            const result1 = await ztdfCryptoService.signMetadata(sampleMetadata);
            const result2 = await ztdfCryptoService.signMetadata(sampleMetadata);

            // Signatures should be identical for same metadata
            expect(result1.signature).toBe(result2.signature);
        });

        it('should produce different signatures for different metadata', async () => {
            const modifiedMetadata: IZTDFMetadata = {
                ...sampleMetadata,
                classification: 'TOP_SECRET'  // Changed classification
            };

            const result1 = await ztdfCryptoService.signMetadata(sampleMetadata);
            const result2 = await ztdfCryptoService.signMetadata(modifiedMetadata);

            expect(result1.signature).not.toBe(result2.signature);
        });

        it('should handle metadata with optional fields missing', async () => {
            const minimalMetadata: IZTDFMetadata = {
                resourceId: 'minimal-001',
                classification: 'UNCLASSIFIED',
                releasabilityTo: ['USA'],
                policy: {}
            };

            const result = await ztdfCryptoService.signMetadata(minimalMetadata);

            expect(result.signature).toBeDefined();
            expect(result.algorithm).toBe('RSA-SHA256');
        });
    });

    // ============================================
    // Signature Verification Tests
    // ============================================

    describe('verifyMetadata', () => {
        it('should verify valid signature', async () => {
            // Sign metadata
            const signResult = await ztdfCryptoService.signMetadata(sampleMetadata);

            // Verify signature
            const verifyResult = await ztdfCryptoService.verifyMetadata(
                sampleMetadata,
                signResult.signature
            );

            expect(verifyResult.valid).toBe(true);
            expect(verifyResult.algorithm).toBe('RSA-SHA256');
        });

        it('should reject tampered metadata', async () => {
            // Sign original metadata
            const signResult = await ztdfCryptoService.signMetadata(sampleMetadata);

            // Tamper with metadata
            const tamperedMetadata: IZTDFMetadata = {
                ...sampleMetadata,
                classification: 'TOP_SECRET'  // Changed after signing
            };

            // Verify signature (should fail)
            const verifyResult = await ztdfCryptoService.verifyMetadata(
                tamperedMetadata,
                signResult.signature
            );

            expect(verifyResult.valid).toBe(false);
        });

        it('should reject invalid signature format', async () => {
            const verifyResult = await ztdfCryptoService.verifyMetadata(
                sampleMetadata,
                'invalid-base64-signature!!!'
            );

            expect(verifyResult.valid).toBe(false);
            // Note: error field is optional, but verification should fail
        });

        it('should reject forged signature', async () => {
            // Create a random signature (not from signing)
            const forgedSignature = crypto.randomBytes(256).toString('base64');

            const verifyResult = await ztdfCryptoService.verifyMetadata(
                sampleMetadata,
                forgedSignature
            );

            expect(verifyResult.valid).toBe(false);
        });

        it('should detect releasability list tampering', async () => {
            // Sign original metadata
            const signResult = await ztdfCryptoService.signMetadata(sampleMetadata);

            // Tamper with releasability (try to add unauthorized country)
            const tamperedMetadata: IZTDFMetadata = {
                ...sampleMetadata,
                releasabilityTo: ['USA', 'GBR', 'CAN', 'RUS']  // Added RUS
            };

            // Verify signature (should fail - tampering detected)
            const verifyResult = await ztdfCryptoService.verifyMetadata(
                tamperedMetadata,
                signResult.signature
            );

            expect(verifyResult.valid).toBe(false);
        });

        it('should detect COI tampering', async () => {
            // Sign original metadata
            const signResult = await ztdfCryptoService.signMetadata(sampleMetadata);

            // Tamper with COI
            const tamperedMetadata: IZTDFMetadata = {
                ...sampleMetadata,
                COI: []  // Removed COI requirement
            };

            // Verify signature (should fail)
            const verifyResult = await ztdfCryptoService.verifyMetadata(
                tamperedMetadata,
                signResult.signature
            );

            expect(verifyResult.valid).toBe(false);
        });
    });

    // ============================================
    // Key Wrapping Tests (AES-256-KW)
    // ============================================

    describe('wrapDEK', () => {
        it('should wrap DEK with KEK (RFC 3394)', async () => {
            const dek = ztdfCryptoService.generateDEK();

            const result = await ztdfCryptoService.wrapDEK(dek);

            expect(result.wrappedKey).toBeDefined();
            expect(result.kekId).toBe('kek-001');
            expect(result.algorithm).toBe('AES-256-KW');
            expect(result.timestamp).toBeDefined();
            expect(result.wrappedKey.length).toBeGreaterThan(0);
        });

        it('should produce different wrapped keys for different DEKs', async () => {
            const dek1 = ztdfCryptoService.generateDEK();
            const dek2 = ztdfCryptoService.generateDEK();

            const result1 = await ztdfCryptoService.wrapDEK(dek1);
            const result2 = await ztdfCryptoService.wrapDEK(dek2);

            expect(result1.wrappedKey).not.toBe(result2.wrappedKey);
        });

        it('should reject invalid DEK length', async () => {
            const invalidDEK = crypto.randomBytes(16);  // Only 128 bits (need 256)

            await expect(ztdfCryptoService.wrapDEK(invalidDEK)).rejects.toThrow('Invalid DEK length');
        });

        it('should wrap and unwrap same DEK successfully', async () => {
            // NOTE: Wrapping is NOT deterministic due to random IV (security feature)
            // Each wrap produces different ciphertext but same unwrapped key
            const dek = crypto.randomBytes(32);

            const result1 = await ztdfCryptoService.wrapDEK(dek);
            const result2 = await ztdfCryptoService.wrapDEK(dek);

            // Different wrapped keys (random IV)
            expect(result1.wrappedKey).not.toBe(result2.wrappedKey);

            // But both unwrap to same original DEK
            const unwrap1 = await ztdfCryptoService.unwrapDEK(result1.wrappedKey);
            const unwrap2 = await ztdfCryptoService.unwrapDEK(result2.wrappedKey);

            expect(unwrap1.unwrappedKey).toEqual(dek);
            expect(unwrap2.unwrappedKey).toEqual(dek);
        });
    });

    // ============================================
    // Key Unwrapping Tests
    // ============================================

    describe('unwrapDEK', () => {
        it('should unwrap DEK correctly', async () => {
            const originalDEK = ztdfCryptoService.generateDEK();

            // Wrap DEK
            const wrapResult = await ztdfCryptoService.wrapDEK(originalDEK);

            // Unwrap DEK
            const unwrapResult = await ztdfCryptoService.unwrapDEK(wrapResult.wrappedKey);

            expect(unwrapResult.unwrappedKey).toEqual(originalDEK);
            expect(unwrapResult.kekId).toBe('kek-001');
            expect(unwrapResult.algorithm).toBe('AES-256-KW');
        });

        it('should reject tampered wrapped key', async () => {
            const dek = ztdfCryptoService.generateDEK();

            // Wrap DEK
            const wrapResult = await ztdfCryptoService.wrapDEK(dek);

            // Tamper with wrapped key (flip a bit)
            const wrappedBuffer = Buffer.from(wrapResult.wrappedKey, 'base64');
            wrappedBuffer[0] ^= 0x01;  // Flip bit
            const tamperedWrappedKey = wrappedBuffer.toString('base64');

            // Unwrap should fail
            await expect(ztdfCryptoService.unwrapDEK(tamperedWrappedKey)).rejects.toThrow();
        });

        it('should reject invalid base64 wrapped key', async () => {
            await expect(ztdfCryptoService.unwrapDEK('invalid-base64!!!')).rejects.toThrow();
        });

        it('should complete full wrap/unwrap cycle', async () => {
            const dek1 = ztdfCryptoService.generateDEK();

            // Wrap
            const wrapped = await ztdfCryptoService.wrapDEK(dek1);

            // Unwrap
            const unwrapped = await ztdfCryptoService.unwrapDEK(wrapped.wrappedKey);

            // Should get back original DEK
            expect(unwrapped.unwrappedKey).toEqual(dek1);
        });
    });

    // ============================================
    // Hashing Tests (SHA-384)
    // ============================================

    describe('computeSHA384', () => {
        it('should compute SHA-384 hash of string', () => {
            const data = 'test data';
            const hash = ztdfCryptoService.computeSHA384(data);

            expect(hash).toBeDefined();
            expect(hash.length).toBe(96);  // SHA-384 produces 96 hex characters
        });

        it('should compute SHA-384 hash of buffer', () => {
            const data = Buffer.from('test data', 'utf8');
            const hash = ztdfCryptoService.computeSHA384(data);

            expect(hash).toBeDefined();
            expect(hash.length).toBe(96);
        });

        it('should produce deterministic hashes', () => {
            const data = 'test data';
            const hash1 = ztdfCryptoService.computeSHA384(data);
            const hash2 = ztdfCryptoService.computeSHA384(data);

            expect(hash1).toBe(hash2);
        });

        it('should produce different hashes for different data', () => {
            const hash1 = ztdfCryptoService.computeSHA384('data1');
            const hash2 = ztdfCryptoService.computeSHA384('data2');

            expect(hash1).not.toBe(hash2);
        });
    });

    describe('computeObjectHash', () => {
        it('should compute hash of object (canonical JSON)', () => {
            const obj = { b: 2, a: 1, c: 3 };
            const hash = ztdfCryptoService.computeObjectHash(obj);

            expect(hash).toBeDefined();
            expect(hash.length).toBe(96);
        });

        it('should produce same hash regardless of property order', () => {
            const obj1 = { a: 1, b: 2, c: 3 };
            const obj2 = { c: 3, b: 2, a: 1 };

            const hash1 = ztdfCryptoService.computeObjectHash(obj1);
            const hash2 = ztdfCryptoService.computeObjectHash(obj2);

            expect(hash1).toBe(hash2);
        });
    });

    // ============================================
    // DEK Generation Tests
    // ============================================

    describe('generateDEK', () => {
        it('should generate 32-byte DEK', () => {
            const dek = ztdfCryptoService.generateDEK();

            expect(dek).toBeInstanceOf(Buffer);
            expect(dek.length).toBe(32);  // 256 bits for AES-256
        });

        it('should generate different DEKs each time', () => {
            const dek1 = ztdfCryptoService.generateDEK();
            const dek2 = ztdfCryptoService.generateDEK();

            expect(dek1).not.toEqual(dek2);
        });

        it('should generate cryptographically random DEKs', () => {
            const deks = new Set<string>();
            for (let i = 0; i < 100; i++) {
                const dek = ztdfCryptoService.generateDEK();
                deks.add(dek.toString('hex'));
            }

            // All DEKs should be unique
            expect(deks.size).toBe(100);
        });
    });

    // ============================================
    // Integration Tests (Full Flow)
    // ============================================

    describe('Integration: Sign + Verify + Wrap + Unwrap', () => {
        it('should complete full cryptographic flow', async () => {
            // 1. Sign metadata
            const signResult = await ztdfCryptoService.signMetadata(sampleMetadata);
            expect(signResult.signature).toBeDefined();

            // 2. Verify signature
            const verifyResult = await ztdfCryptoService.verifyMetadata(
                sampleMetadata,
                signResult.signature
            );
            expect(verifyResult.valid).toBe(true);

            // 3. Generate DEK
            const dek = ztdfCryptoService.generateDEK();
            expect(dek.length).toBe(32);

            // 4. Wrap DEK
            const wrapResult = await ztdfCryptoService.wrapDEK(dek);
            expect(wrapResult.wrappedKey).toBeDefined();

            // 5. Unwrap DEK
            const unwrapResult = await ztdfCryptoService.unwrapDEK(wrapResult.wrappedKey);
            expect(unwrapResult.unwrappedKey).toEqual(dek);
        });

        it('should detect and reject tampered metadata in full flow', async () => {
            // 1. Sign original metadata
            const signResult = await ztdfCryptoService.signMetadata(sampleMetadata);

            // 2. Attacker tampers with metadata
            const tamperedMetadata: IZTDFMetadata = {
                ...sampleMetadata,
                releasabilityTo: ['USA', 'GBR', 'CAN', 'RUS']  // Added unauthorized country
            };

            // 3. Verification should fail (tampering detected)
            const verifyResult = await ztdfCryptoService.verifyMetadata(
                tamperedMetadata,
                signResult.signature
            );
            expect(verifyResult.valid).toBe(false);

            // 4. Access should be denied (fail-closed)
            // (This would be enforced in the resource controller)
        });
    });
});

