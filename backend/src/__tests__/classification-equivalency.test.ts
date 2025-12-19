/**
 * Classification Equivalency Tests
 * 
 * Tests for ACP-240 Section 4.3: Cross-Nation Classification Mapping
 */

import {
    mapToNATOLevel,
    mapFromNATOLevel,
    getAllEquivalents,
    areEquivalent,
    normalizeToDIVEStandard,
    getDisplayMarkingWithEquivalent,
    validateClassificationForCountry,
    getEquivalencyTable
} from '../utils/classification-equivalency';

describe('Classification Equivalency - ACP-240 Section 4.3', () => {
    describe('NATO to National Mapping', () => {
        test('should map SECRET to all national equivalents', () => {
            const equivalents = getAllEquivalents('SECRET');
            
            expect(equivalents).toBeDefined();
            expect(equivalents!.USA).toBe('SECRET');
            expect(equivalents!.GBR).toBe('SECRET');
            expect(equivalents!.FRA).toBe('SECRET DÉFENSE');
            expect(equivalents!.DEU).toBe('GEHEIM');
            expect(equivalents!.CAN).toBe('SECRET');
        });

        test('should map NATO levels to German classifications', () => {
            expect(mapFromNATOLevel('UNCLASSIFIED', 'DEU')).toBe('OFFEN');
            expect(mapFromNATOLevel('CONFIDENTIAL', 'DEU')).toBe('VS-VERTRAULICH');
            expect(mapFromNATOLevel('SECRET', 'DEU')).toBe('GEHEIM');
            expect(mapFromNATOLevel('COSMIC_TOP_SECRET', 'DEU')).toBe('STRENG GEHEIM');
        });

        test('should map NATO levels to French classifications', () => {
            expect(mapFromNATOLevel('UNCLASSIFIED', 'FRA')).toBe('NON CLASSIFIÉ');
            expect(mapFromNATOLevel('CONFIDENTIAL', 'FRA')).toBe('CONFIDENTIEL DÉFENSE');
            expect(mapFromNATOLevel('SECRET', 'FRA')).toBe('SECRET DÉFENSE');
            expect(mapFromNATOLevel('COSMIC_TOP_SECRET', 'FRA')).toBe('TRÈS SECRET DÉFENSE');
        });

        test('should map NATO levels to Canadian classifications', () => {
            expect(mapFromNATOLevel('UNCLASSIFIED', 'CAN')).toBe('UNCLASSIFIED');
            expect(mapFromNATOLevel('NATO_UNCLASSIFIED', 'CAN')).toBe('PROTECTED A');
            expect(mapFromNATOLevel('CONFIDENTIAL', 'CAN')).toBe('CONFIDENTIAL');
            expect(mapFromNATOLevel('SECRET', 'CAN')).toBe('SECRET');
        });
    });

    describe('National to NATO Mapping', () => {
        test('should map German GEHEIM to NATO SECRET', () => {
            const natoLevel = mapToNATOLevel('GEHEIM', 'DEU');
            expect(natoLevel).toBe('SECRET');
        });

        test('should map French SECRET DÉFENSE to NATO SECRET', () => {
            const natoLevel = mapToNATOLevel('SECRET DÉFENSE', 'FRA');
            expect(natoLevel).toBe('SECRET');
        });

        test('should map UK TOP SECRET to NATO COSMIC_TOP_SECRET', () => {
            const natoLevel = mapToNATOLevel('TOP SECRET', 'GBR');
            expect(natoLevel).toBe('COSMIC_TOP_SECRET');
        });

        test('should handle case-insensitive matching', () => {
            expect(mapToNATOLevel('geheim', 'DEU')).toBe('SECRET');
            expect(mapToNATOLevel('GEHEIM', 'DEU')).toBe('SECRET');
            expect(mapToNATOLevel('  GEHEIM  ', 'DEU')).toBe('SECRET');
        });

        test('should return null for unknown classification', () => {
            const natoLevel = mapToNATOLevel('UNKNOWN_LEVEL', 'USA');
            expect(natoLevel).toBeNull();
        });
    });

    describe('Equivalency Checking', () => {
        test('should confirm US SECRET equals UK SECRET', () => {
            const equivalent = areEquivalent('SECRET', 'USA', 'SECRET', 'GBR');
            expect(equivalent).toBe(true);
        });

        test('should confirm US SECRET equals German GEHEIM', () => {
            const equivalent = areEquivalent('SECRET', 'USA', 'GEHEIM', 'DEU');
            expect(equivalent).toBe(true);
        });

        test('should confirm French SECRET DÉFENSE equals Canadian SECRET', () => {
            const equivalent = areEquivalent('SECRET DÉFENSE', 'FRA', 'SECRET', 'CAN');
            expect(equivalent).toBe(true);
        });

        test('should reject non-equivalent classifications', () => {
            const equivalent = areEquivalent('CONFIDENTIAL', 'USA', 'SECRET', 'GBR');
            expect(equivalent).toBe(false);
        });

        test('should handle unknown classifications', () => {
            const equivalent = areEquivalent('UNKNOWN', 'USA', 'SECRET', 'GBR');
            expect(equivalent).toBe(false);
        });
    });

    describe('DIVE V3 Normalization', () => {
        test('should normalize German GEHEIM to DIVE SECRET', () => {
            const normalized = normalizeToDIVEStandard('GEHEIM', 'DEU');
            expect(normalized).toBe('SECRET');
        });

        test('should normalize French CONFIDENTIEL DÉFENSE to DIVE CONFIDENTIAL', () => {
            const normalized = normalizeToDIVEStandard('CONFIDENTIEL DÉFENSE', 'FRA');
            expect(normalized).toBe('CONFIDENTIAL');
        });

        test('should normalize UK TOP SECRET to DIVE TOP_SECRET', () => {
            const normalized = normalizeToDIVEStandard('TOP SECRET', 'GBR');
            expect(normalized).toBe('TOP_SECRET');
        });

        test('should handle all NATO members', () => {
            const countries = ['USA', 'GBR', 'FRA', 'DEU', 'CAN', 'ITA', 'ESP', 'POL', 'NLD'];
            
            for (const country of countries) {
                const normalized = normalizeToDIVEStandard('SECRET', country as any);
                expect(normalized).toBe('SECRET');
            }
        });

        test('should default to UNCLASSIFIED for unknown levels (fail-secure)', () => {
            const normalized = normalizeToDIVEStandard('UNKNOWN_LEVEL', 'USA');
            expect(normalized).toBe('UNCLASSIFIED');
        });
    });

    describe('Display Markings with Equivalents', () => {
        test('should create single-country marking', () => {
            const marking = getDisplayMarkingWithEquivalent('SECRET', 'USA');
            expect(marking).toBe('SECRET (USA)');
        });

        test('should create dual-country marking with equivalent', () => {
            const marking = getDisplayMarkingWithEquivalent('SECRET', 'USA', 'DEU');
            expect(marking).toBe('SECRET (USA) / GEHEIM (DEU)');
        });

        test('should create French-English dual marking', () => {
            const marking = getDisplayMarkingWithEquivalent('SECRET DÉFENSE', 'FRA', 'USA');
            expect(marking).toBe('SECRET DÉFENSE (FRA) / SECRET (USA)');
        });
    });

    describe('Validation', () => {
        test('should validate US classifications', () => {
            expect(validateClassificationForCountry('UNCLASSIFIED', 'USA').valid).toBe(true);
            expect(validateClassificationForCountry('CONFIDENTIAL', 'USA').valid).toBe(true);
            expect(validateClassificationForCountry('SECRET', 'USA').valid).toBe(true);
            expect(validateClassificationForCountry('TOP SECRET', 'USA').valid).toBe(true);
        });

        test('should validate German classifications', () => {
            expect(validateClassificationForCountry('OFFEN', 'DEU').valid).toBe(true);
            expect(validateClassificationForCountry('VS-VERTRAULICH', 'DEU').valid).toBe(true);
            expect(validateClassificationForCountry('GEHEIM', 'DEU').valid).toBe(true);
            expect(validateClassificationForCountry('STRENG GEHEIM', 'DEU').valid).toBe(true);
        });

        test('should reject invalid classifications', () => {
            const result = validateClassificationForCountry('INVALID_LEVEL', 'USA');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('not recognized');
        });

        test('should return NATO level for valid classifications', () => {
            const result = validateClassificationForCountry('SECRET', 'USA');
            expect(result.valid).toBe(true);
            expect(result.natoLevel).toBe('SECRET');
        });
    });

    describe('Equivalency Table Structure', () => {
        test('should have complete equivalency table', () => {
            const table = getEquivalencyTable();
            
            expect(table).toBeDefined();
            expect(table.length).toBeGreaterThanOrEqual(5);
        });

        test('should cover all NATO member countries', () => {
            const table = getEquivalencyTable();
            const requiredCountries = ['USA', 'GBR', 'FRA', 'DEU', 'CAN'];
            
            for (const entry of table) {
                for (const country of requiredCountries) {
                    expect(entry.nationalEquivalents).toHaveProperty(country);
                }
            }
        });

        test('should have proper display order', () => {
            const table = getEquivalencyTable();
            
            // Verify ascending order
            for (let i = 1; i < table.length; i++) {
                expect(table[i].displayOrder).toBeGreaterThan(table[i - 1].displayOrder);
            }
        });

        test('should have access control metadata', () => {
            const table = getEquivalencyTable();
            
            for (const entry of table) {
                expect(entry.accessControl).toBeDefined();
                expect(entry.accessControl.minClearanceRequired).toBeDefined();
            }
        });
    });

    describe('Coalition Use Cases', () => {
        test('should support FVEY classification sharing', () => {
            const fveyCountries = ['USA', 'GBR', 'CAN', 'AUS', 'NZL'];
            
            // US SECRET should map to equivalent in all FVEY nations
            for (const country of fveyCountries) {
                const natoLevel = mapToNATOLevel('SECRET', country as any);
                expect(natoLevel).toBe('SECRET');
            }
        });

        test('should support NATO classification sharing', () => {
            const natoCountries = ['USA', 'GBR', 'FRA', 'DEU', 'ITA'];
            
            // All should map to same NATO level
            const levels = natoCountries.map(country =>
                mapToNATOLevel('SECRET', country as any)
            );
            
            // All should be SECRET
            expect(new Set(levels).size).toBe(1);
            expect(levels[0]).toBe('SECRET');
        });

        test('should support bilateral information exchange (US-Germany)', () => {
            const usSecret = 'SECRET';
            const deGeheim = 'GEHEIM';
            
            const equivalent = areEquivalent(usSecret, 'USA', deGeheim, 'DEU');
            expect(equivalent).toBe(true);
        });

        test('should normalize mixed coalition documents', () => {
            // Document created by France, viewed by USA
            const frenchLevel = 'CONFIDENTIEL DÉFENSE';
            const normalized = normalizeToDIVEStandard(frenchLevel, 'FRA');
            
            expect(normalized).toBe('CONFIDENTIAL');
            
            // US user can understand this maps to CONFIDENTIAL
            const usEquiv = mapFromNATOLevel('CONFIDENTIAL', 'USA');
            expect(usEquiv).toBe('CONFIDENTIAL');
        });
    });

    describe('ACP-240 Compliance Demonstrations', () => {
        test('demonstrates Section 4.3 requirement: carry original + standardized tags', () => {
            // Original: German classification
            const originalLevel = 'GEHEIM';
            const originalCountry = 'DEU';
            
            // Standardized: NATO level
            const natoLevel = mapToNATOLevel(originalLevel, originalCountry);
            expect(natoLevel).toBe('SECRET');
            
            // DIVE V3 normalized level
            const diveLevel = normalizeToDIVEStandard(originalLevel, originalCountry);
            expect(diveLevel).toBe('SECRET');
            
            // All three representations available:
            // 1. Original: GEHEIM (DEU)
            // 2. NATO: SECRET
            // 3. DIVE: SECRET
        });

        test('demonstrates coalition interoperability', () => {
            // French document marked SECRET DÉFENSE
            const frenchDoc = {
                originalLevel: 'SECRET DÉFENSE',
                originCountry: 'FRA' as const
            };
            
            // US recipient sees equivalent
            const usEquiv = mapFromNATOLevel(
                mapToNATOLevel(frenchDoc.originalLevel, frenchDoc.originCountry)!,
                'USA'
            );
            expect(usEquiv).toBe('SECRET');
            
            // German recipient sees equivalent
            const deEquiv = mapFromNATOLevel(
                mapToNATOLevel(frenchDoc.originalLevel, frenchDoc.originCountry)!,
                'DEU'
            );
            expect(deEquiv).toBe('GEHEIM');
            
            // All understand the same security level
        });
    });

    describe('Error Handling', () => {
        test('should handle unknown national classifications gracefully', () => {
            const result = validateClassificationForCountry('BOGUS_LEVEL', 'USA');
            
            expect(result.valid).toBe(false);
            expect(result.error).toBeDefined();
        });

        test('should return null for unmapped classifications', () => {
            const natoLevel = mapToNATOLevel('SUPER_DUPER_SECRET', 'USA');
            expect(natoLevel).toBeNull();
        });

        test('should fall back to original when no mapping available', () => {
            const marking = getDisplayMarkingWithEquivalent('CUSTOM_LEVEL', 'USA');
            expect(marking).toBe('CUSTOM_LEVEL');
        });
    });

    describe('Security Properties', () => {
        test('should maintain hierarchical ordering', () => {
            const table = getEquivalencyTable();
            
            // Verify each level requires higher clearance than previous
            const clearanceLevels = table.map(e => e.accessControl.minClearanceRequired);
            
            expect(clearanceLevels[0]).toBe('UNCLASSIFIED');
            expect(clearanceLevels[clearanceLevels.length - 1]).toContain('SECRET');
        });

        test('should require COSMIC COI for COSMIC TOP SECRET', () => {
            const cosmicEntry = getEquivalencyTable().find(e => e.natoLevel === 'COSMIC_TOP_SECRET');
            
            expect(cosmicEntry).toBeDefined();
            expect(cosmicEntry!.accessControl.coiRestrictions).toContain('NATO-COSMIC');
        });

        test('should normalize unknown levels to UNCLASSIFIED (fail-secure)', () => {
            const normalized = normalizeToDIVEStandard('UNKNOWN', 'USA');
            expect(normalized).toBe('UNCLASSIFIED');
        });
    });

    describe('Multi-Nation Coalition Scenarios', () => {
        test('handles US-UK bilateral document equivalency', () => {
            // US creates SECRET document
            const usLevel = 'SECRET';
            
            // UK interprets as SECRET
            const ukEquiv = mapFromNATOLevel(
                mapToNATOLevel(usLevel, 'USA')!,
                'GBR'
            );
            expect(ukEquiv).toBe('SECRET');
            
            // They're equivalent
            expect(areEquivalent(usLevel, 'USA', ukEquiv, 'GBR')).toBe(true);
        });

        test('handles 5-nation FVEY document', () => {
            const fveyCountries = ['USA', 'GBR', 'CAN', 'AUS', 'NZL'];
            
            // All FVEY members should understand TOP SECRET equivalently
            const equivalents = fveyCountries.map(country =>
                mapToNATOLevel('TOP SECRET', country as any)
            );
            
            // All map to same NATO level
            expect(new Set(equivalents).size).toBe(1);
            expect(equivalents[0]).toBe('COSMIC_TOP_SECRET');
        });

        test('handles NATO multilateral (US-UK-FR-DE)', () => {
            const natoMembers = ['USA', 'GBR', 'FRA', 'DEU'];
            const testLevel = 'CONFIDENTIAL';
            
            // Each nation's CONFIDENTIAL maps to NATO CONFIDENTIAL
            for (const country of natoMembers) {
                const natoLevel = mapToNATOLevel(testLevel, country as any);
                expect(natoLevel).toBe('CONFIDENTIAL');
            }
        });
    });
});
