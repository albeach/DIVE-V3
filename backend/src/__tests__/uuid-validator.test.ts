/**
 * UUID Validator Test Suite
 * Target: 100% coverage for uuid-validator.ts
 * 
 * Tests:
 * - RFC 4122 UUID validation
 * - UUID version detection (v1, v3, v4, v5)
 * - Strict mode validation
 * - UUID normalization
 * - Pattern matching
 * - Email/other identifier validation
 */

import {
    validateUUID,
    validateAndNormalizeUUID,
    looksLikeUUID,
    validateIdentifier
} from '../utils/uuid-validator';

// Mock logger
jest.mock('../utils/logger', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    },
}));

describe('UUID Validator', () => {
    describe('validateUUID', () => {
        describe('Valid UUIDs', () => {
            it('should validate UUIDv4', () => {
                const result = validateUUID('550e8400-e29b-41d4-a716-446655440000');

                expect(result.valid).toBe(true);
                expect(result.version).toBe(4);
                expect(result.error).toBeUndefined();
            });

            it('should validate UUIDv5', () => {
                const result = validateUUID('886313e1-3b8a-5372-9b90-0c9aee199e5d');

                expect(result.valid).toBe(true);
                expect(result.version).toBe(5);
            });

            it('should validate UUIDv1', () => {
                const result = validateUUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8');

                expect(result.valid).toBe(true);
                expect(result.version).toBe(1);
            });

            it('should validate UUIDv3', () => {
                const result = validateUUID('6fa459ea-ee8a-3ca4-894e-db77e160355e');

                expect(result.valid).toBe(true);
                expect(result.version).toBe(3);
            });

            it('should handle UUIDs with whitespace', () => {
                const result = validateUUID('  550e8400-e29b-41d4-a716-446655440000  ');

                expect(result.valid).toBe(true);
            });

            it('should handle uppercase UUIDs', () => {
                const result = validateUUID('550E8400-E29B-41D4-A716-446655440000');

                expect(result.valid).toBe(true);
            });
        });

        describe('Invalid UUIDs', () => {
            it('should reject null', () => {
                const result = validateUUID(null as any);

                expect(result.valid).toBe(false);
                expect(result.error).toContain('null, undefined, or not a string');
            });

            it('should reject undefined', () => {
                const result = validateUUID(undefined as any);

                expect(result.valid).toBe(false);
                expect(result.error).toContain('null, undefined, or not a string');
            });

            it('should reject empty string', () => {
                const result = validateUUID('');

                expect(result.valid).toBe(false);
                expect(result.error).toContain('null, undefined, or not a string');
            });

            it('should reject non-string types', () => {
                const result = validateUUID(12345 as any);

                expect(result.valid).toBe(false);
                expect(result.error).toContain('not a string');
            });

            it('should reject invalid format', () => {
                const result = validateUUID('not-a-uuid');

                expect(result.valid).toBe(false);
                expect(result.error).toContain('Invalid UUID format');
            });

            it('should reject UUID-like but invalid', () => {
                const result = validateUUID('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx');

                expect(result.valid).toBe(false);
            });

            it('should reject email addresses', () => {
                const result = validateUUID('user@example.com');

                expect(result.valid).toBe(false);
            });
        });

        describe('Strict Mode', () => {
            it('should accept UUIDv4 in strict mode', () => {
                const result = validateUUID('550e8400-e29b-41d4-a716-446655440000', true);

                expect(result.valid).toBe(true);
                expect(result.version).toBe(4);
            });

            it('should accept UUIDv5 in strict mode', () => {
                const result = validateUUID('886313e1-3b8a-5372-9b90-0c9aee199e5d', true);

                expect(result.valid).toBe(true);
                expect(result.version).toBe(5);
            });

            it('should reject UUIDv1 in strict mode', () => {
                const result = validateUUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8', true);

                expect(result.valid).toBe(false);
                expect(result.version).toBe(1);
                expect(result.error).toContain('version 1 not recommended');
            });

            it('should reject UUIDv3 in strict mode', () => {
                const result = validateUUID('6fa459ea-ee8a-3ca4-894e-db77e160355e', true);

                expect(result.valid).toBe(false);
                expect(result.version).toBe(3);
                expect(result.error).toContain('version 3 not recommended');
            });
        });
    });

    describe('validateAndNormalizeUUID', () => {
        it('should normalize UUID to lowercase', () => {
            const result = validateAndNormalizeUUID('550E8400-E29B-41D4-A716-446655440000');

            expect(result).toBe('550e8400-e29b-41d4-a716-446655440000');
        });

        it('should trim whitespace', () => {
            const result = validateAndNormalizeUUID('  550e8400-e29b-41d4-a716-446655440000  ');

            expect(result).toBe('550e8400-e29b-41d4-a716-446655440000');
        });

        it('should return trimmed UUID when normalize is false', () => {
            const result = validateAndNormalizeUUID('  550E8400-E29B-41D4-A716-446655440000  ', false);

            expect(result).toBe('550E8400-E29B-41D4-A716-446655440000');
        });

        it('should throw error for invalid UUID', () => {
            expect(() => {
                validateAndNormalizeUUID('not-a-uuid');
            }).toThrow('Invalid UUID');
        });

        it('should throw error for empty string', () => {
            expect(() => {
                validateAndNormalizeUUID('');
            }).toThrow();
        });

        it('should throw error with specific message', () => {
            expect(() => {
                validateAndNormalizeUUID('invalid-format');
            }).toThrow('Invalid UUID format');
        });
    });

    describe('looksLikeUUID', () => {
        it('should return true for valid UUID format', () => {
            expect(looksLikeUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
        });

        it('should return true for UUIDv1', () => {
            expect(looksLikeUUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true);
        });

        it('should return true for UUIDv3', () => {
            expect(looksLikeUUID('6fa459ea-ee8a-3ca4-894e-db77e160355e')).toBe(true);
        });

        it('should return true for UUIDv4', () => {
            expect(looksLikeUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
        });

        it('should return true for UUIDv5', () => {
            expect(looksLikeUUID('886313e1-3b8a-5372-9b90-0c9aee199e5d')).toBe(true);
        });

        it('should return true for uppercase UUID', () => {
            expect(looksLikeUUID('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
        });

        it('should handle whitespace', () => {
            expect(looksLikeUUID('  550e8400-e29b-41d4-a716-446655440000  ')).toBe(true);
        });

        it('should return false for null', () => {
            expect(looksLikeUUID(null as any)).toBe(false);
        });

        it('should return false for undefined', () => {
            expect(looksLikeUUID(undefined as any)).toBe(false);
        });

        it('should return false for empty string', () => {
            expect(looksLikeUUID('')).toBe(false);
        });

        it('should return false for non-string', () => {
            expect(looksLikeUUID(12345 as any)).toBe(false);
        });

        it('should return false for invalid format', () => {
            expect(looksLikeUUID('not-a-uuid')).toBe(false);
        });

        it('should return false for UUID without dashes', () => {
            expect(looksLikeUUID('550e8400e29b41d4a716446655440000')).toBe(false);
        });

        it('should return false for invalid version (v6)', () => {
            expect(looksLikeUUID('550e8400-e29b-61d4-a716-446655440000')).toBe(false);
        });

        it('should return false for invalid variant', () => {
            expect(looksLikeUUID('550e8400-e29b-41d4-f716-446655440000')).toBe(false);
        });
    });

    describe('validateIdentifier', () => {
        describe('UUID Identifiers', () => {
            it('should validate UUID as uuid type', () => {
                const result = validateIdentifier('550e8400-e29b-41d4-a716-446655440000');

                expect(result.valid).toBe(true);
                expect(result.type).toBe('uuid');
                expect(result.error).toBeUndefined();
            });

            it('should handle UUID with whitespace', () => {
                const result = validateIdentifier('  550e8400-e29b-41d4-a716-446655440000  ');

                expect(result.valid).toBe(true);
                expect(result.type).toBe('uuid');
            });
        });

        describe('Email Identifiers', () => {
            it('should validate email as email type', () => {
                const result = validateIdentifier('user@example.com');

                expect(result.valid).toBe(true);
                expect(result.type).toBe('email');
            });

            it('should validate email with subdomain', () => {
                const result = validateIdentifier('user@mail.example.com');

                expect(result.valid).toBe(true);
                expect(result.type).toBe('email');
            });

            it('should validate email with plus addressing', () => {
                const result = validateIdentifier('user+tag@example.com');

                expect(result.valid).toBe(true);
                expect(result.type).toBe('email');
            });

            it('should validate email with dots', () => {
                const result = validateIdentifier('first.last@example.com');

                expect(result.valid).toBe(true);
                expect(result.type).toBe('email');
            });
        });

        describe('Other Identifiers', () => {
            it('should accept other string formats', () => {
                const result = validateIdentifier('username123');

                expect(result.valid).toBe(true);
                expect(result.type).toBe('other');
            });

            it('should accept numeric strings', () => {
                const result = validateIdentifier('12345');

                expect(result.valid).toBe(true);
                expect(result.type).toBe('other');
            });
        });

        describe('Invalid Identifiers', () => {
            it('should reject null', () => {
                const result = validateIdentifier(null as any);

                expect(result.valid).toBe(false);
                expect(result.type).toBe('other');
                expect(result.error).toContain('empty or not a string');
            });

            it('should reject undefined', () => {
                const result = validateIdentifier(undefined as any);

                expect(result.valid).toBe(false);
                expect(result.type).toBe('other');
            });

            it('should reject empty string', () => {
                const result = validateIdentifier('');

                expect(result.valid).toBe(false);
                expect(result.type).toBe('other');
            });

            it('should reject non-string types', () => {
                const result = validateIdentifier(12345 as any);

                expect(result.valid).toBe(false);
                expect(result.type).toBe('other');
            });
        });

        describe('Edge Cases', () => {
            it('should handle whitespace-only string', () => {
                const result = validateIdentifier('   ');

                expect(result.valid).toBe(false);
                expect(result.type).toBe('other');
            });

            it('should validate very long identifiers', () => {
                const longId = 'a'.repeat(500) + '@example.com';
                const result = validateIdentifier(longId);

                expect(result.valid).toBe(true);
                expect(result.type).toBe('email');
            });

            it('should handle special characters in other identifiers', () => {
                const result = validateIdentifier('user-name_123');

                expect(result.valid).toBe(true);
                expect(result.type).toBe('other');
            });
        });
    });
});




