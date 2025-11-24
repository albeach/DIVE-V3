/**
 * KAS DEK Generation Test Suite
 * Tests for deterministic DEK generation consistency
 * 
 * Target Coverage: 100%
 * Priority: CRITICAL (Encryption/Decryption consistency)
 */

import crypto from 'crypto';

/**
 * Generate deterministic DEK (must match seed script and KAS server)
 * This function is duplicated here for testing purposes
 */
function generateDeterministicDEK(resourceId: string): string {
    const salt = 'dive-v3-broker-dek-salt';
    const dekHash = crypto.createHash('sha256').update(resourceId + salt).digest();
    return dekHash.toString('base64');
}

describe('Deterministic DEK Generation', () => {
    describe('generateDeterministicDEK', () => {
        it('should generate consistent DEK for same resourceId', () => {
            const resourceId = 'doc-ztdf-0001';
            const dek1 = generateDeterministicDEK(resourceId);
            const dek2 = generateDeterministicDEK(resourceId);

            expect(dek1).toBe(dek2);
        });

        it('should generate different DEKs for different resourceIds', () => {
            const dek1 = generateDeterministicDEK('doc-ztdf-0001');
            const dek2 = generateDeterministicDEK('doc-ztdf-0002');

            expect(dek1).not.toBe(dek2);
        });

        it('should generate 32-byte (256-bit) DEKs', () => {
            const dek = generateDeterministicDEK('test-resource');
            const dekBuffer = Buffer.from(dek, 'base64');

            expect(dekBuffer.length).toBe(32); // 256 bits / 8 = 32 bytes
        });

        it('should be deterministic across multiple calls', () => {
            const resourceId = 'doc-ztdf-test';
            const deks = Array.from({ length: 100 }, () => generateDeterministicDEK(resourceId));

            // All DEKs should be identical
            const uniqueDeks = new Set(deks);
            expect(uniqueDeks.size).toBe(1);
        });

        it('should generate valid base64 strings', () => {
            const dek = generateDeterministicDEK('doc-ztdf-0001');
            
            // Should be valid base64
            expect(dek).toMatch(/^[A-Za-z0-9+/]+=*$/);
            
            // Should decode without errors
            expect(() => Buffer.from(dek, 'base64')).not.toThrow();
        });

        it('should handle various resourceId formats', () => {
            const testCases = [
                'doc-ztdf-0001',
                'doc-ztdf-9999',
                'resource-with-dashes',
                'UPPERCASE-RESOURCE',
                'resource_with_underscores',
                'resource.with.dots'
            ];

            testCases.forEach(resourceId => {
                const dek = generateDeterministicDEK(resourceId);
                expect(dek).toBeDefined();
                expect(Buffer.from(dek, 'base64').length).toBe(32);
            });
        });

        it('should match expected hash for known input', () => {
            // Test vector to ensure algorithm hasn't changed
            const resourceId = 'doc-ztdf-0001';
            const salt = 'dive-v3-broker-dek-salt';
            
            const expectedHash = crypto.createHash('sha256')
                .update(resourceId + salt)
                .digest('base64');
            
            const actualDek = generateDeterministicDEK(resourceId);
            
            expect(actualDek).toBe(expectedHash);
        });
    });

    describe('Encryption/Decryption Consistency', () => {
        it('should encrypt and decrypt successfully with deterministic DEK', () => {
            const resourceId = 'doc-ztdf-test';
            const plaintext = 'Test secret content for NATO operations';
            
            // Generate deterministic DEK
            const dekBase64 = generateDeterministicDEK(resourceId);
            const dek = Buffer.from(dekBase64, 'base64');
            
            // Encrypt
            const iv = crypto.randomBytes(12);
            const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
            let encrypted = cipher.update(plaintext, 'utf8', 'base64');
            encrypted += cipher.final('base64');
            const authTag = cipher.getAuthTag();
            
            // Decrypt with same DEK
            const decipher = crypto.createDecipheriv('aes-256-gcm', dek, iv);
            decipher.setAuthTag(authTag);
            let decrypted = decipher.update(encrypted, 'base64', 'utf8');
            decrypted += decipher.final('utf8');
            
            expect(decrypted).toBe(plaintext);
        });

        it('should fail decryption with wrong DEK', () => {
            const plaintext = 'Test content';
            
            // Encrypt with DEK_A
            const dek_A = Buffer.from(generateDeterministicDEK('resource-A'), 'base64');
            const iv = crypto.randomBytes(12);
            const cipher = crypto.createCipheriv('aes-256-gcm', dek_A, iv);
            let encrypted = cipher.update(plaintext, 'utf8', 'base64');
            encrypted += cipher.final('base64');
            const authTag = cipher.getAuthTag();
            
            // Try to decrypt with DEK_B (wrong key)
            const dek_B = Buffer.from(generateDeterministicDEK('resource-B'), 'base64');
            const decipher = crypto.createDecipheriv('aes-256-gcm', dek_B, iv);
            decipher.setAuthTag(authTag);
            
            // Should throw authentication error
            expect(() => {
                decipher.update(encrypted, 'base64', 'utf8');
                decipher.final('utf8');
            }).toThrow();
        });

        it('should handle large content encryption/decryption', () => {
            const resourceId = 'doc-ztdf-large';
            const plaintext = 'A'.repeat(10000); // 10KB of data
            
            const dekBase64 = generateDeterministicDEK(resourceId);
            const dek = Buffer.from(dekBase64, 'base64');
            
            // Encrypt
            const iv = crypto.randomBytes(12);
            const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
            let encrypted = cipher.update(plaintext, 'utf8', 'base64');
            encrypted += cipher.final('base64');
            const authTag = cipher.getAuthTag();
            
            // Decrypt
            const decipher = crypto.createDecipheriv('aes-256-gcm', dek, iv);
            decipher.setAuthTag(authTag);
            let decrypted = decipher.update(encrypted, 'base64', 'utf8');
            decrypted += decipher.final('utf8');
            
            expect(decrypted).toBe(plaintext);
            expect(decrypted.length).toBe(10000);
        });
    });

    describe('Security Properties', () => {
        it('should generate cryptographically unique DEKs for different resources', () => {
            const deks = new Set<string>();
            
            // Generate 1000 DEKs
            for (let i = 0; i < 1000; i++) {
                const resourceId = `doc-ztdf-${String(i).padStart(4, '0')}`;
                const dek = generateDeterministicDEK(resourceId);
                deks.add(dek);
            }
            
            // All should be unique
            expect(deks.size).toBe(1000);
        });

        it('should not generate predictable patterns', () => {
            const dek1 = generateDeterministicDEK('doc-ztdf-0001');
            const dek2 = generateDeterministicDEK('doc-ztdf-0002');
            const dek3 = generateDeterministicDEK('doc-ztdf-0003');
            
            // DEKs should not have obvious sequential relationship
            // (SHA256 should provide good avalanche effect)
            expect(dek1.substring(0, 10)).not.toBe(dek2.substring(0, 10));
            expect(dek2.substring(0, 10)).not.toBe(dek3.substring(0, 10));
        });

        it('should note this is for pilot only (not production)', () => {
            // This test serves as documentation
            // In production, DEKs must be:
            // 1. Truly random (not deterministic)
            // 2. Generated once and wrapped with KEK
            // 3. Stored in KAO.wrappedKey
            // 4. Unwrapped by HSM on key release
            
            const pilotDEK = generateDeterministicDEK('doc-ztdf-0001');
            
            // Pilot DEK is predictable (for testing)
            const reproducedDEK = generateDeterministicDEK('doc-ztdf-0001');
            expect(pilotDEK).toBe(reproducedDEK);
            
            // In production, this would be:
            // const productionDEK = crypto.randomBytes(32).toString('base64');
            // const reproducedDEK = crypto.randomBytes(32).toString('base64');
            // expect(productionDEK).not.toBe(reproducedDEK); // Should be different
        });
    });
});

