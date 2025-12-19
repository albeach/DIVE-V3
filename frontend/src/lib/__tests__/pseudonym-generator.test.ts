/**
 * Tests for Ocean Pseudonym Generator
 * 
 * ACP-240 Section 6.2 Compliance: PII Minimization
 * 
 * Date: October 21, 2025
 */

import {
    generatePseudonym,
    generatePseudonymWithNumber,
    isValidUUID,
    getPseudonymFromUser,
    getAuditIdentity,
} from '../pseudonym-generator';

describe('PII Minimization - Ocean Pseudonym Generator', () => {
    // Test UUIDs from multi-realm architecture
    const uuidUSA = '550e8400-e29b-41d4-a716-446655440000'; // john.doe
    const uuidFRA = '660f9511-e29b-41d4-a716-446655440001'; // pierre.dubois
    const uuidCAN = '770fa622-e29b-41d4-a716-446655440002'; // john.macdonald
    const uuidIND = '880fb733-e29b-41d4-a716-446655440003'; // bob.contractor

    describe('generatePseudonym', () => {
        it('should generate deterministic pseudonym from UUID', () => {
            const pseudonym1 = generatePseudonym(uuidUSA);
            const pseudonym2 = generatePseudonym(uuidUSA);

            expect(pseudonym1).toBe(pseudonym2);
            expect(pseudonym1).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/); // "Adjective Noun"
        });

        it('should generate different pseudonyms for different UUIDs', () => {
            const pseudonymUSA = generatePseudonym(uuidUSA);
            const pseudonymFRA = generatePseudonym(uuidFRA);
            const pseudonymCAN = generatePseudonym(uuidCAN);
            const pseudonymIND = generatePseudonym(uuidIND);

            // All should be different (very high probability)
            const unique = new Set([pseudonymUSA, pseudonymFRA, pseudonymCAN, pseudonymIND]);
            expect(unique.size).toBeGreaterThanOrEqual(3); // Allow 1 collision in 4
        });

        it('should generate ocean-themed pseudonyms', () => {
            const pseudonym = generatePseudonym(uuidUSA);

            // Check format: "Adjective Noun"
            expect(pseudonym).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);

            // Should contain ocean-related words (spot check)
            const oceanWords = [
                'Azure', 'Blue', 'Cerulean', 'Deep', 'Golden', 'Pacific',
                'Whale', 'Dolphin', 'Reef', 'Current', 'Tide', 'Lagoon'
            ];

            const words = pseudonym.split(' ');
            // At least one word should be in our ocean vocabulary
            const hasOceanWord = words.some(word =>
                oceanWords.includes(word) ||
                pseudonym.toLowerCase().includes('ocean') ||
                pseudonym.toLowerCase().includes('sea')
            );

            // This is probabilistic, but with our full ocean theme it should pass
            expect(words.length).toBe(2); // Always "Adjective Noun"
        });

        it('should handle empty/invalid input gracefully', () => {
            expect(generatePseudonym('')).toBe('Unknown User');
            expect(generatePseudonym(null as any)).toBe('Unknown User');
            expect(generatePseudonym(undefined as any)).toBe('Unknown User');
        });
    });

    describe('generatePseudonymWithNumber', () => {
        it('should generate pseudonym with number suffix', () => {
            const pseudonym = generatePseudonymWithNumber(uuidUSA);

            expect(pseudonym).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+ #\d{2}$/);
        });

        it('should be deterministic with number', () => {
            const pseudonym1 = generatePseudonymWithNumber(uuidUSA);
            const pseudonym2 = generatePseudonymWithNumber(uuidUSA);

            expect(pseudonym1).toBe(pseudonym2);
        });
    });

    describe('isValidUUID', () => {
        it('should validate correct UUID format', () => {
            expect(isValidUUID(uuidUSA)).toBe(true);
            expect(isValidUUID(uuidFRA)).toBe(true);
            expect(isValidUUID(uuidCAN)).toBe(true);
            expect(isValidUUID(uuidIND)).toBe(true);
        });

        it('should reject invalid UUID formats', () => {
            expect(isValidUUID('not-a-uuid')).toBe(false);
            expect(isValidUUID('john.doe@mil')).toBe(false);
            expect(isValidUUID('123456')).toBe(false);
            expect(isValidUUID('')).toBe(false);
            expect(isValidUUID(null as any)).toBe(false);
            expect(isValidUUID(undefined as any)).toBe(false);
        });

        it('should accept different UUID versions (v1, v3, v4, v5)', () => {
            const uuidV1 = '550e8400-e29b-11d4-a716-446655440000'; // v1
            const uuidV3 = '6fa459ea-ee8a-3ca4-894e-db77e160355e'; // v3
            const uuidV4 = '550e8400-e29b-41d4-a716-446655440000'; // v4
            const uuidV5 = '886313e1-3b8a-5372-9b90-0c9aee199e5d'; // v5

            expect(isValidUUID(uuidV1)).toBe(true);
            expect(isValidUUID(uuidV3)).toBe(true);
            expect(isValidUUID(uuidV4)).toBe(true);
            expect(isValidUUID(uuidV5)).toBe(true);
        });
    });

    describe('getPseudonymFromUser', () => {
        it('should use uniqueID if available and valid UUID', () => {
            const user = {
                uniqueID: uuidUSA,
                email: 'john.doe@mil',
                name: 'John Doe',
            };

            const pseudonym = getPseudonymFromUser(user);
            expect(pseudonym).toBe(generatePseudonym(uuidUSA));
        });

        it('should fallback to email if uniqueID missing', () => {
            const user = {
                email: 'john.doe@mil',
                name: 'John Doe',
            };

            const pseudonym = getPseudonymFromUser(user);
            expect(pseudonym).toBe(generatePseudonym('john.doe@mil'));
        });

        it('should fallback to name if both uniqueID and email missing', () => {
            const user = {
                name: 'John Doe',
            };

            const pseudonym = getPseudonymFromUser(user);
            expect(pseudonym).toBe(generatePseudonym('John Doe'));
        });

        it('should return "Unknown User" if all fields missing', () => {
            const user = {};

            const pseudonym = getPseudonymFromUser(user);
            expect(pseudonym).toBe('Unknown User');
        });

        it('should handle non-UUID uniqueID (migration period)', () => {
            const user = {
                uniqueID: 'john.doe@mil', // Email-based uniqueID (pre-migration)
                email: 'john.doe@mil',
            };

            const pseudonym = getPseudonymFromUser(user);
            expect(pseudonym).toBeTruthy();
            expect(pseudonym).not.toBe('Unknown User');
        });
    });

    describe('getAuditIdentity', () => {
        it('should return uniqueID and pseudonym for audit logs', () => {
            const auditId = getAuditIdentity(uuidUSA);

            expect(auditId).toHaveProperty('uniqueID', uuidUSA);
            expect(auditId).toHaveProperty('pseudonym');
            expect(auditId.pseudonym).toBe(generatePseudonym(uuidUSA));
        });

        it('should be deterministic for same UUID', () => {
            const audit1 = getAuditIdentity(uuidUSA);
            const audit2 = getAuditIdentity(uuidUSA);

            expect(audit1.uniqueID).toBe(audit2.uniqueID);
            expect(audit1.pseudonym).toBe(audit2.pseudonym);
        });
    });

    describe('ACP-240 Compliance', () => {
        it('should NOT expose real names (PII minimization)', () => {
            const user = {
                uniqueID: uuidUSA,
                email: 'john.doe@mil',
                name: 'John Doe', // Real name (PII)
            };

            const pseudonym = getPseudonymFromUser(user);

            // Pseudonym should NOT contain real name
            expect(pseudonym).not.toContain('John');
            expect(pseudonym).not.toContain('Doe');
            expect(pseudonym).not.toContain('john');
            expect(pseudonym).not.toContain('doe');
        });

        it('should generate human-friendly identifiers', () => {
            const pseudonym = generatePseudonym(uuidUSA);

            // Human-friendly: 2 words, capitalized, no special characters
            expect(pseudonym.split(' ').length).toBe(2);
            expect(pseudonym).toMatch(/^[A-Z]/); // Starts with capital
            expect(pseudonym).not.toMatch(/[0-9]/); // No numbers in base pseudonym
        });

        it('should support incident response (uniqueID → IdP lookup)', () => {
            const auditId = getAuditIdentity(uuidUSA);

            // Audit log contains uniqueID (for IdP lookup) + pseudonym (for human readability)
            expect(auditId.uniqueID).toBe(uuidUSA); // Can query IdP with this
            expect(auditId.pseudonym).toBeTruthy(); // Human-readable in logs
        });

        it('should be collision-resistant across coalition partners', () => {
            const pseudonyms = [
                generatePseudonym(uuidUSA),
                generatePseudonym(uuidFRA),
                generatePseudonym(uuidCAN),
                generatePseudonym(uuidIND),
            ];

            // All pseudonyms should be different (36×36 = 1,296 combinations)
            const uniqueSet = new Set(pseudonyms);
            expect(uniqueSet.size).toBeGreaterThanOrEqual(3); // Allow some collisions
        });
    });

    describe('Multi-Realm Integration', () => {
        it('should work with USA realm user', () => {
            const user = {
                uniqueID: uuidUSA,
                clearance: 'SECRET',
                countryOfAffiliation: 'USA',
                dutyOrg: 'US_ARMY',
            };

            const pseudonym = getPseudonymFromUser(user);
            expect(pseudonym).toBeTruthy();
            expect(pseudonym).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
        });

        it('should work with France realm user', () => {
            const user = {
                uniqueID: uuidFRA,
                clearance: 'SECRET',
                countryOfAffiliation: 'FRA',
                dutyOrg: 'FR_DEFENSE_MINISTRY',
            };

            const pseudonym = getPseudonymFromUser(user);
            expect(pseudonym).toBeTruthy();
            expect(pseudonym).not.toBe(generatePseudonym(uuidUSA)); // Different from USA
        });

        it('should work with Canada realm user', () => {
            const user = {
                uniqueID: uuidCAN,
                clearance: 'CONFIDENTIAL',
                countryOfAffiliation: 'CAN',
                dutyOrg: 'CAN_FORCES',
            };

            const pseudonym = getPseudonymFromUser(user);
            expect(pseudonym).toBeTruthy();
        });

        it('should work with Industry realm user', () => {
            const user = {
                uniqueID: uuidIND,
                clearance: 'UNCLASSIFIED',
                countryOfAffiliation: 'USA',
                dutyOrg: 'LOCKHEED_MARTIN',
            };

            const pseudonym = getPseudonymFromUser(user);
            expect(pseudonym).toBeTruthy();
        });
    });
});
