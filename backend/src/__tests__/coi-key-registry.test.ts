/**
 * COI Key Registry Tests
 * 
 * Tests for ACP-240 Section 5.3: Community of Interest (COI) Keys
 */

import { 
    coiKeyRegistry, 
    getCOIKey, 
    hasCOIKey, 
    selectCOIForResource 
} from '../services/coi-key-registry';

describe('COI Key Registry', () => {
    describe('Default COI Keys', () => {
        test('should initialize with default COI keys', () => {
            const stats = coiKeyRegistry.getStats();
            
            expect(stats.totalKeys).toBeGreaterThanOrEqual(7);
            expect(stats.cois).toContain('FVEY');
            expect(stats.cois).toContain('NATO-COSMIC');
            expect(stats.cois).toContain('US-ONLY');
            expect(stats.cois).toContain('CAN-US');
        });

        test('should have keys for all default COIs', () => {
            const expectedCOIs = ['FVEY', 'NATO-COSMIC', 'US-ONLY', 'CAN-US', 'FRA-US', 'NATO', 'GBR-US'];
            
            for (const coi of expectedCOIs) {
                expect(hasCOIKey(coi)).toBe(true);
            }
        });
    });

    describe('getCOIKey', () => {
        test('should return valid 256-bit key for FVEY', () => {
            const key = getCOIKey('FVEY');
            
            expect(key).toBeInstanceOf(Buffer);
            expect(key.length).toBe(32); // 256 bits
        });

        test('should return consistent key for same COI', () => {
            const key1 = getCOIKey('NATO-COSMIC');
            const key2 = getCOIKey('NATO-COSMIC');
            
            expect(key1.toString('base64')).toBe(key2.toString('base64'));
        });

        test('should return different keys for different COIs', () => {
            const fveyKey = getCOIKey('FVEY');
            const natoKey = getCOIKey('NATO-COSMIC');
            
            expect(fveyKey.toString('base64')).not.toBe(natoKey.toString('base64'));
        });

        test('should generate key on-demand for unknown COI', () => {
            const customCOI = 'CUSTOM-TEST-COI';
            const key = getCOIKey(customCOI);
            
            expect(key).toBeInstanceOf(Buffer);
            expect(key.length).toBe(32);
            expect(hasCOIKey(customCOI)).toBe(true);
        });
    });

    describe('selectCOIForResource', () => {
        test('should select explicit COI when provided', () => {
            const coi = selectCOIForResource(['USA', 'GBR'], ['FVEY']);
            expect(coi).toBe('FVEY');
        });

        test('should select most restrictive COI from multiple tags', () => {
            const coi = selectCOIForResource(['USA', 'GBR'], ['NATO', 'FVEY', 'US-ONLY']);
            expect(coi).toBe('US-ONLY'); // Most restrictive
        });

        test('should infer FVEY from releasability pattern', () => {
            const coi = selectCOIForResource(['USA', 'GBR', 'CAN', 'AUS', 'NZL'], []);
            expect(coi).toBe('FVEY');
        });

        test('should infer CAN-US bilateral from two nations', () => {
            const coi = selectCOIForResource(['USA', 'CAN'], []);
            expect(coi).toBe('CAN-US');
        });

        test('should infer FRA-US bilateral', () => {
            const coi = selectCOIForResource(['USA', 'FRA'], []);
            expect(coi).toBe('FRA-US');
        });

        test('should infer GBR-US bilateral', () => {
            const coi = selectCOIForResource(['USA', 'GBR'], []);
            expect(coi).toBe('GBR-US');
        });

        test('should infer NATO from 3+ NATO countries', () => {
            const coi = selectCOIForResource(['USA', 'GBR', 'FRA', 'DEU'], []);
            expect(coi).toBe('NATO');
        });

        test('should infer country-specific for single nation', () => {
            const coi = selectCOIForResource(['USA'], []);
            expect(coi).toBe('USA-ONLY');
        });

        test('should default to US-ONLY for empty releasability', () => {
            const coi = selectCOIForResource([], []);
            expect(coi).toBe('US-ONLY');
        });
    });

    describe('Key Registry Operations', () => {
        test('should list all registered COIs', () => {
            const cois = coiKeyRegistry.listCOIs();
            
            expect(Array.isArray(cois)).toBe(true);
            expect(cois.length).toBeGreaterThanOrEqual(7);
        });

        test('should provide key entry with metadata', () => {
            const entry = coiKeyRegistry.getKeyEntry('FVEY');
            
            expect(entry).toBeDefined();
            expect(entry?.coi).toBe('FVEY');
            expect(entry?.version).toBeGreaterThanOrEqual(1);
            expect(entry?.algorithm).toBe('AES-256-GCM');
            expect(entry?.createdAt).toBeInstanceOf(Date);
        });

        test('should return undefined for non-existent COI entry', () => {
            const entry = coiKeyRegistry.getKeyEntry('NON-EXISTENT-COI-BEFORE-GENERATION');
            expect(entry).toBeUndefined();
        });
    });

    describe('Key Rotation', () => {
        test('should rotate key and increment version', () => {
            const originalEntry = coiKeyRegistry.getKeyEntry('NATO');
            const originalKey = originalEntry?.key.toString('base64');
            const originalVersion = originalEntry?.version;
            
            const newEntry = coiKeyRegistry.rotateKey('NATO');
            
            expect(newEntry.version).toBeGreaterThan(originalVersion || 0);
            expect(newEntry.key.toString('base64')).not.toBe(originalKey);
        });
    });

    describe('Statistics', () => {
        test('should provide accurate statistics', () => {
            const stats = coiKeyRegistry.getStats();
            
            expect(stats).toHaveProperty('totalKeys');
            expect(stats).toHaveProperty('cois');
            expect(stats).toHaveProperty('currentVersion');
            expect(stats.totalKeys).toBe(stats.cois.length);
        });
    });
});

describe('COI Key Integration', () => {
    test('keys should be usable for encryption', () => {
        const crypto = require('crypto');
        const key = getCOIKey('FVEY');
        const plaintext = 'Test content for FVEY members';
        
        // Encrypt
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        let encrypted = cipher.update(plaintext, 'utf8', 'base64');
        encrypted += cipher.final('base64');
        const authTag = cipher.getAuthTag();
        
        // Decrypt
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encrypted, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        
        expect(decrypted).toBe(plaintext);
    });

    test('different COI keys should produce different ciphertexts', () => {
        const crypto = require('crypto');
        const plaintext = 'Same content';
        const iv = crypto.randomBytes(12); // Same IV for comparison
        
        // Encrypt with FVEY key
        const fveyKey = getCOIKey('FVEY');
        const fveyCipher = crypto.createCipheriv('aes-256-gcm', fveyKey, iv);
        let fveyEncrypted = fveyCipher.update(plaintext, 'utf8', 'base64');
        fveyEncrypted += fveyCipher.final('base64');
        
        // Encrypt with NATO key
        const natoKey = getCOIKey('NATO-COSMIC');
        const natoCipher = crypto.createCipheriv('aes-256-gcm', natoKey, iv);
        let natoEncrypted = natoCipher.update(plaintext, 'utf8', 'base64');
        natoEncrypted += natoCipher.final('base64');
        
        // Ciphertexts should be different
        expect(fveyEncrypted).not.toBe(natoEncrypted);
    });
});

