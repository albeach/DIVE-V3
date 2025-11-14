/**
 * Clearance Mapper Service Tests
 * 
 * Comprehensive tests for national clearance level mappings
 * Task 3: Multi-Realm MFA Expansion
 * Date: October 24, 2025
 */

import {
    mapNationalClearance,
    mapClearanceFromToken,
    isMFARequired,
    getNationalEquivalents,
    getCountryFromRealm,
    validateClearanceMapping,
    DiveClearanceLevel,
    NationalClearanceSystem
} from '../services/clearance-mapper.service';

describe('Clearance Mapper Service', () => {
    // ============================================
    // 1. USA Clearance Mapping Tests (5 tests)
    // ============================================

    describe('USA Clearance Mappings', () => {
        it('should map USA UNCLASSIFIED correctly', () => {
            const result = mapNationalClearance('UNCLASSIFIED', 'USA');
            expect(result).toBe('UNCLASSIFIED');
        });

        it('should map USA CONFIDENTIAL correctly', () => {
            const result = mapNationalClearance('CONFIDENTIAL', 'USA');
            expect(result).toBe('CONFIDENTIAL');
        });

        it('should map USA SECRET correctly', () => {
            const result = mapNationalClearance('SECRET', 'USA');
            expect(result).toBe('SECRET');
        });

        it('should map USA TOP SECRET correctly', () => {
            const result = mapNationalClearance('TOP SECRET', 'USA');
            expect(result).toBe('TOP_SECRET');
        });

        it('should map USA abbreviations (TS, S, C)', () => {
            expect(mapNationalClearance('TS', 'USA')).toBe('TOP_SECRET');
            expect(mapNationalClearance('S', 'USA')).toBe('SECRET');
            expect(mapNationalClearance('C', 'USA')).toBe('CONFIDENTIAL');
            expect(mapNationalClearance('U', 'USA')).toBe('UNCLASSIFIED');
        });
    });

    // ============================================
    // 2. French Clearance Mapping Tests (6 tests)
    // ============================================

    describe('French Clearance Mappings', () => {
        it('should map French NON CLASSIFIÉ to UNCLASSIFIED', () => {
            const result = mapNationalClearance('NON CLASSIFIÉ', 'FRA');
            expect(result).toBe('UNCLASSIFIED');
        });

        it('should handle French accents (CLASSIFIÉ vs CLASSIFIE)', () => {
            expect(mapNationalClearance('NON CLASSIFIÉ', 'FRA')).toBe('UNCLASSIFIED');
            expect(mapNationalClearance('NON CLASSIFIE', 'FRA')).toBe('UNCLASSIFIED');
        });

        it('should map CONFIDENTIEL DÉFENSE to CONFIDENTIAL', () => {
            const result = mapNationalClearance('CONFIDENTIEL DÉFENSE', 'FRA');
            expect(result).toBe('CONFIDENTIAL');
        });

        it('should handle CONFIDENTIEL with/without accents and hyphens', () => {
            expect(mapNationalClearance('CONFIDENTIEL DÉFENSE', 'FRA')).toBe('CONFIDENTIAL');
            expect(mapNationalClearance('CONFIDENTIEL DEFENSE', 'FRA')).toBe('CONFIDENTIAL');
            expect(mapNationalClearance('CONFIDENTIEL-DÉFENSE', 'FRA')).toBe('CONFIDENTIAL');
            expect(mapNationalClearance('CONFIDENTIEL-DEFENSE', 'FRA')).toBe('CONFIDENTIAL');
        });

        it('should map SECRET DÉFENSE to SECRET', () => {
            expect(mapNationalClearance('SECRET DÉFENSE', 'FRA')).toBe('SECRET');
            expect(mapNationalClearance('SECRET DEFENSE', 'FRA')).toBe('SECRET');
            expect(mapNationalClearance('SECRET-DÉFENSE', 'FRA')).toBe('SECRET');
        });

        it('should map TRÈS SECRET DÉFENSE to TOP_SECRET', () => {
            expect(mapNationalClearance('TRÈS SECRET DÉFENSE', 'FRA')).toBe('TOP_SECRET');
            expect(mapNationalClearance('TRES SECRET DEFENSE', 'FRA')).toBe('TOP_SECRET');
            expect(mapNationalClearance('TRÈS-SECRET-DÉFENSE', 'FRA')).toBe('TOP_SECRET');
        });
    });

    // ============================================
    // 3. Canadian Clearance Mapping Tests (5 tests)
    // ============================================

    describe('Canadian Clearance Mappings', () => {
        it('should map Canadian UNCLASSIFIED correctly', () => {
            const result = mapNationalClearance('UNCLASSIFIED', 'CAN');
            expect(result).toBe('UNCLASSIFIED');
        });

        it('should map Canadian PROTECTED B to CONFIDENTIAL', () => {
            expect(mapNationalClearance('PROTECTED B', 'CAN')).toBe('CONFIDENTIAL');
            expect(mapNationalClearance('PROTECTED-B', 'CAN')).toBe('CONFIDENTIAL');
        });

        it('should map Canadian PROTECTED C to SECRET', () => {
            expect(mapNationalClearance('PROTECTED C', 'CAN')).toBe('SECRET');
            expect(mapNationalClearance('PROTECTED-C', 'CAN')).toBe('SECRET');
        });

        it('should map Canadian SECRET correctly', () => {
            const result = mapNationalClearance('SECRET', 'CAN');
            expect(result).toBe('SECRET');
        });

        it('should map Canadian TOP SECRET correctly', () => {
            expect(mapNationalClearance('TOP SECRET', 'CAN')).toBe('TOP_SECRET');
            expect(mapNationalClearance('TS', 'CAN')).toBe('TOP_SECRET');
        });
    });

    // ============================================
    // 4. UK Clearance Mapping Tests (4 tests)
    // ============================================

    describe('UK Clearance Mappings', () => {
        it('should map UK UNCLASSIFIED and OFFICIAL', () => {
            expect(mapNationalClearance('UNCLASSIFIED', 'GBR')).toBe('UNCLASSIFIED');
            expect(mapNationalClearance('OFFICIAL', 'GBR')).toBe('UNCLASSIFIED');
        });

        it('should map UK CONFIDENTIAL correctly', () => {
            const result = mapNationalClearance('CONFIDENTIAL', 'GBR');
            expect(result).toBe('CONFIDENTIAL');
        });

        it('should map UK SECRET correctly', () => {
            const result = mapNationalClearance('SECRET', 'GBR');
            expect(result).toBe('SECRET');
        });

        it('should map UK TOP SECRET correctly', () => {
            expect(mapNationalClearance('TOP SECRET', 'GBR')).toBe('TOP_SECRET');
            expect(mapNationalClearance('TS', 'GBR')).toBe('TOP_SECRET');
        });
    });

    // ============================================
    // 5. Germany (DEU) Clearance Mapping Tests (4 tests)
    // ============================================

    describe('German Clearance Mappings', () => {
        it('should map German OFFEN to UNCLASSIFIED', () => {
            const result = mapNationalClearance('OFFEN', 'DEU');
            expect(result).toBe('UNCLASSIFIED');
        });

        it('should map German VS-VERTRAULICH to CONFIDENTIAL', () => {
            expect(mapNationalClearance('VS-VERTRAULICH', 'DEU')).toBe('CONFIDENTIAL');
            // VS-NUR FÜR DEN DIENSTGEBRAUCH is RESTRICTED, not CONFIDENTIAL
            expect(mapNationalClearance('VS-NUR FÜR DEN DIENSTGEBRAUCH', 'DEU')).toBe('RESTRICTED');
            expect(mapNationalClearance('VS-NUR FUR DEN DIENSTGEBRAUCH', 'DEU')).toBe('RESTRICTED');
        });

        it('should map German GEHEIM to SECRET', () => {
            const result = mapNationalClearance('GEHEIM', 'DEU');
            expect(result).toBe('SECRET');
        });

        it('should map German STRENG GEHEIM to TOP_SECRET', () => {
            const result = mapNationalClearance('STRENG GEHEIM', 'DEU');
            expect(result).toBe('TOP_SECRET');
        });
    });

    // ============================================
    // 6. Italy (ITA) Clearance Mapping Tests (4 tests)
    // ============================================

    describe('Italian Clearance Mappings', () => {
        it('should map Italian NON CLASSIFICATO to UNCLASSIFIED', () => {
            const result = mapNationalClearance('NON CLASSIFICATO', 'ITA');
            expect(result).toBe('UNCLASSIFIED');
        });

        it('should map Italian RISERVATO to CONFIDENTIAL', () => {
            expect(mapNationalClearance('RISERVATO', 'ITA')).toBe('CONFIDENTIAL');
            expect(mapNationalClearance('RISERVATISSIMO', 'ITA')).toBe('CONFIDENTIAL');
        });

        it('should map Italian SEGRETO to SECRET', () => {
            const result = mapNationalClearance('SEGRETO', 'ITA');
            expect(result).toBe('SECRET');
        });

        it('should map Italian SEGRETISSIMO to TOP_SECRET', () => {
            const result = mapNationalClearance('SEGRETISSIMO', 'ITA');
            expect(result).toBe('TOP_SECRET');
        });
    });

    // ============================================
    // 7. Spain (ESP) Clearance Mapping Tests (4 tests)
    // ============================================

    describe('Spanish Clearance Mappings', () => {
        it('should map Spanish NO CLASIFICADO to UNCLASSIFIED', () => {
            const result = mapNationalClearance('NO CLASIFICADO', 'ESP');
            expect(result).toBe('UNCLASSIFIED');
        });

        it('should map Spanish CONFIDENCIAL to CONFIDENTIAL', () => {
            // DIFUSIÓN LIMITADA is RESTRICTED, not CONFIDENTIAL
            expect(mapNationalClearance('DIFUSIÓN LIMITADA', 'ESP')).toBe('RESTRICTED');
            expect(mapNationalClearance('DIFUSION LIMITADA', 'ESP')).toBe('RESTRICTED');
            expect(mapNationalClearance('CONFIDENCIAL', 'ESP')).toBe('CONFIDENTIAL');
        });

        it('should map Spanish SECRETO to SECRET', () => {
            const result = mapNationalClearance('SECRETO', 'ESP');
            expect(result).toBe('SECRET');
        });

        it('should map Spanish ALTO SECRETO to TOP_SECRET', () => {
            const result = mapNationalClearance('ALTO SECRETO', 'ESP');
            expect(result).toBe('TOP_SECRET');
        });
    });

    // ============================================
    // 8. Poland (POL) Clearance Mapping Tests (4 tests)
    // ============================================

    describe('Polish Clearance Mappings', () => {
        it('should map Polish NIEJAWNE to UNCLASSIFIED', () => {
            const result = mapNationalClearance('NIEJAWNE', 'POL');
            expect(result).toBe('UNCLASSIFIED');
        });

        it('should map Polish POUFNE to CONFIDENTIAL', () => {
            expect(mapNationalClearance('ZASTRZEŻONE', 'POL')).toBe('CONFIDENTIAL');
            expect(mapNationalClearance('ZASTRZEZIONE', 'POL')).toBe('CONFIDENTIAL');
            expect(mapNationalClearance('POUFNE', 'POL')).toBe('CONFIDENTIAL');
        });

        it('should map Polish TAJNE to SECRET', () => {
            const result = mapNationalClearance('TAJNE', 'POL');
            expect(result).toBe('SECRET');
        });

        it('should map Polish ŚCIŚLE TAJNE to TOP_SECRET', () => {
            expect(mapNationalClearance('ŚCIŚLE TAJNE', 'POL')).toBe('TOP_SECRET');
            expect(mapNationalClearance('SCISLE TAJNE', 'POL')).toBe('TOP_SECRET');
        });
    });

    // ============================================
    // 9. Netherlands (NLD) Clearance Mapping Tests (4 tests)
    // ============================================

    describe('Dutch Clearance Mappings', () => {
        it('should map Dutch NIET-GERUBRICEERD to UNCLASSIFIED', () => {
            const result = mapNationalClearance('NIET-GERUBRICEERD', 'NLD');
            expect(result).toBe('UNCLASSIFIED');
        });

        it('should map Dutch VERTROUWELIJK to CONFIDENTIAL', () => {
            // DEPARTEMENTAAL VERTROUWELIJK is RESTRICTED, not CONFIDENTIAL
            expect(mapNationalClearance('DEPARTEMENTAAL VERTROUWELIJK', 'NLD')).toBe('RESTRICTED');
            expect(mapNationalClearance('VERTROUWELIJK', 'NLD')).toBe('CONFIDENTIAL');
        });

        it('should map Dutch GEHEIM to SECRET', () => {
            const result = mapNationalClearance('GEHEIM', 'NLD');
            expect(result).toBe('SECRET');
        });

        it('should map Dutch ZEER GEHEIM to TOP_SECRET', () => {
            const result = mapNationalClearance('ZEER GEHEIM', 'NLD');
            expect(result).toBe('TOP_SECRET');
        });
    });

    // ============================================
    // 10. Industry Clearance Mapping Tests (4 tests)
    // ============================================

    describe('Industry Partner Clearance Mappings', () => {
        it('should map Industry PUBLIC to UNCLASSIFIED', () => {
            expect(mapNationalClearance('PUBLIC', 'INDUSTRY')).toBe('UNCLASSIFIED');
            expect(mapNationalClearance('UNCLASSIFIED', 'INDUSTRY')).toBe('UNCLASSIFIED');
        });

        it('should map Industry PROPRIETARY to CONFIDENTIAL', () => {
            expect(mapNationalClearance('PROPRIETARY', 'INDUSTRY')).toBe('CONFIDENTIAL');
            expect(mapNationalClearance('CONFIDENTIAL', 'INDUSTRY')).toBe('CONFIDENTIAL');
        });

        it('should map Industry TRADE SECRET to SECRET', () => {
            expect(mapNationalClearance('TRADE SECRET', 'INDUSTRY')).toBe('SECRET');
            expect(mapNationalClearance('SECRET', 'INDUSTRY')).toBe('SECRET');
        });

        it('should map Industry HIGHLY CONFIDENTIAL to TOP_SECRET', () => {
            expect(mapNationalClearance('HIGHLY CONFIDENTIAL', 'INDUSTRY')).toBe('TOP_SECRET');
            expect(mapNationalClearance('TOP SECRET', 'INDUSTRY')).toBe('TOP_SECRET');
        });
    });

    // ============================================
    // 6. Case Insensitivity Tests (3 tests)
    // ============================================

    describe('Case Insensitivity', () => {
        it('should handle lowercase clearance levels', () => {
            expect(mapNationalClearance('secret', 'USA')).toBe('SECRET');
            expect(mapNationalClearance('confidentiel défense', 'FRA')).toBe('CONFIDENTIAL');
            expect(mapNationalClearance('protected b', 'CAN')).toBe('CONFIDENTIAL');
        });

        it('should handle mixed case clearance levels', () => {
            expect(mapNationalClearance('Top Secret', 'USA')).toBe('TOP_SECRET');
            expect(mapNationalClearance('Secret Défense', 'FRA')).toBe('SECRET');
        });

        it('should handle whitespace variations', () => {
            expect(mapNationalClearance('  SECRET  ', 'USA')).toBe('SECRET');
            // Multiple spaces collapsed to single space
            expect(mapNationalClearance('TOP  SECRET', 'USA')).toBe('TOP_SECRET');
        });
    });

    // ============================================
    // 7. MFA Requirement Tests (4 tests)
    // ============================================

    describe('MFA Requirements', () => {
        it('should NOT require MFA for UNCLASSIFIED', () => {
            const result = isMFARequired('UNCLASSIFIED');
            expect(result).toBe(false);
        });

        it('should require MFA for CONFIDENTIAL', () => {
            const result = isMFARequired('CONFIDENTIAL');
            expect(result).toBe(true);
        });

        it('should require MFA for SECRET', () => {
            const result = isMFARequired('SECRET');
            expect(result).toBe(true);
        });

        it('should require MFA for TOP_SECRET', () => {
            const result = isMFARequired('TOP_SECRET');
            expect(result).toBe(true);
        });
    });

    // ============================================
    // 8. Token Mapping Tests (5 tests)
    // ============================================

    describe('Token Clearance Mapping', () => {
        it('should map clearance from string attribute', () => {
            const result = mapClearanceFromToken('SECRET', 'dive-v3-usa');
            expect(result).toBe('SECRET');
        });

        it('should map clearance from array attribute', () => {
            const result = mapClearanceFromToken(['CONFIDENTIEL DÉFENSE'], 'dive-v3-fra');
            expect(result).toBe('CONFIDENTIAL');
        });

        it('should handle undefined clearance attribute', () => {
            const result = mapClearanceFromToken(undefined, 'dive-v3-usa');
            expect(result).toBe('UNCLASSIFIED');
        });

        it('should handle empty array clearance attribute', () => {
            const result = mapClearanceFromToken([], 'dive-v3-usa');
            expect(result).toBe('UNCLASSIFIED');
        });

        it('should auto-detect country from realm name', () => {
            expect(mapClearanceFromToken('CONFIDENTIEL DÉFENSE', 'dive-v3-fra')).toBe('CONFIDENTIAL');
            expect(mapClearanceFromToken('PROTECTED B', 'dive-v3-can')).toBe('CONFIDENTIAL');
            expect(mapClearanceFromToken('SECRET', 'dive-v3-usa')).toBe('SECRET');
        });
    });

    // ============================================
    // 12. Realm Detection Tests (11 tests)
    // ============================================

    describe('Realm to Country Detection', () => {
        it('should detect USA from realm name', () => {
            expect(getCountryFromRealm('dive-v3-usa')).toBe('USA');
            expect(getCountryFromRealm('usa-realm-broker')).toBe('USA');
            expect(getCountryFromRealm('us-idp')).toBe('USA');
        });

        it('should detect France from realm name', () => {
            expect(getCountryFromRealm('dive-v3-fra')).toBe('FRA');
            expect(getCountryFromRealm('fra-realm-broker')).toBe('FRA');
            expect(getCountryFromRealm('france-idp')).toBe('FRA');
        });

        it('should detect Canada from realm name', () => {
            expect(getCountryFromRealm('dive-v3-can')).toBe('CAN');
            expect(getCountryFromRealm('can-realm-broker')).toBe('CAN');
            expect(getCountryFromRealm('canada-idp')).toBe('CAN');
        });

        it('should detect UK from realm name', () => {
            expect(getCountryFromRealm('dive-v3-gbr')).toBe('GBR');
            expect(getCountryFromRealm('gbr-realm-broker')).toBe('GBR');
            expect(getCountryFromRealm('uk-idp')).toBe('GBR');
            expect(getCountryFromRealm('britain-idp')).toBe('GBR');
        });

        it('should detect Germany from realm name', () => {
            expect(getCountryFromRealm('dive-v3-deu')).toBe('DEU');
            expect(getCountryFromRealm('deu-realm-broker')).toBe('DEU');
            expect(getCountryFromRealm('germany-idp')).toBe('DEU');
            expect(getCountryFromRealm('german-idp')).toBe('DEU');
        });

        it('should detect Italy from realm name', () => {
            expect(getCountryFromRealm('dive-v3-ita')).toBe('ITA');
            expect(getCountryFromRealm('ita-realm-broker')).toBe('ITA');
            expect(getCountryFromRealm('italy-idp')).toBe('ITA');
            expect(getCountryFromRealm('italian-idp')).toBe('ITA');
        });

        it('should detect Spain from realm name', () => {
            expect(getCountryFromRealm('dive-v3-esp')).toBe('ESP');
            expect(getCountryFromRealm('esp-realm-broker')).toBe('ESP');
            expect(getCountryFromRealm('spain-idp')).toBe('ESP');
            expect(getCountryFromRealm('spanish-idp')).toBe('ESP');
        });

        it('should detect Poland from realm name', () => {
            expect(getCountryFromRealm('dive-v3-pol')).toBe('POL');
            expect(getCountryFromRealm('pol-realm-broker')).toBe('POL');
            expect(getCountryFromRealm('poland-idp')).toBe('POL');
            expect(getCountryFromRealm('polish-idp')).toBe('POL');
        });

        it('should detect Netherlands from realm name', () => {
            expect(getCountryFromRealm('dive-v3-nld')).toBe('NLD');
            expect(getCountryFromRealm('nld-realm-broker')).toBe('NLD');
            expect(getCountryFromRealm('netherlands-idp')).toBe('NLD');
            expect(getCountryFromRealm('dutch-idp')).toBe('NLD');
        });

        it('should detect Industry from realm name', () => {
            expect(getCountryFromRealm('dive-v3-industry')).toBe('INDUSTRY');
            expect(getCountryFromRealm('industry-realm-broker')).toBe('INDUSTRY');
            expect(getCountryFromRealm('partner-idp')).toBe('INDUSTRY');
        });

        it('should default to USA for broker realm', () => {
            expect(getCountryFromRealm('dive-v3-broker')).toBe('USA');
            expect(getCountryFromRealm('unknown-realm')).toBe('USA');
        });
    });

    // ============================================
    // 10. National Equivalents Tests (6 tests)
    // ============================================

    describe('National Equivalents Lookup', () => {
        it('should return French equivalents for CONFIDENTIAL', () => {
            const equivalents = getNationalEquivalents('CONFIDENTIAL', 'FRA');
            expect(equivalents).toContain('CONFIDENTIEL DÉFENSE');
            expect(equivalents).toContain('CONFIDENTIEL DEFENSE');
        });

        it('should return Canadian equivalents for SECRET', () => {
            const equivalents = getNationalEquivalents('SECRET', 'CAN');
            expect(equivalents).toContain('SECRET');
            expect(equivalents).toContain('PROTECTED C');
        });

        it('should return German equivalents for SECRET', () => {
            const equivalents = getNationalEquivalents('SECRET', 'DEU');
            expect(equivalents).toContain('GEHEIM');
        });

        it('should return Italian equivalents for TOP_SECRET', () => {
            const equivalents = getNationalEquivalents('TOP_SECRET', 'ITA');
            expect(equivalents).toContain('SEGRETISSIMO');
        });

        it('should return all equivalents when country not specified', () => {
            const equivalents = getNationalEquivalents('SECRET');
            expect(equivalents.length).toBeGreaterThan(8); // Now includes all 10 countries
            expect(equivalents).toContain('SECRET'); // USA/GBR/CAN
            expect(equivalents).toContain('SECRET DÉFENSE'); // France
            expect(equivalents).toContain('GEHEIM'); // Germany/Netherlands
            expect(equivalents).toContain('SEGRETO'); // Italy
            expect(equivalents).toContain('SECRETO'); // Spain
            expect(equivalents).toContain('TAJNE'); // Poland
            expect(equivalents).toContain('PROTECTED C'); // Canadian
        });

        it('should return empty array for invalid level', () => {
            const equivalents = getNationalEquivalents('INVALID' as DiveClearanceLevel);
            expect(equivalents).toEqual([]);
        });
    });

    // ============================================
    // 14. Validation Tests (3 tests)
    // ============================================

    describe('Clearance Mapping Validation', () => {
        it('should validate clearance mapping successfully', () => {
            const result = validateClearanceMapping();
            expect(result.valid).toBe(true);
            expect(result.errors).toEqual([]);
        });

        it('should have mappings for all standard levels', () => {
            const result = validateClearanceMapping();
            expect(result.valid).toBe(true);

            // Verify all levels are present
            const levels: DiveClearanceLevel[] = [
                'UNCLASSIFIED',
                'CONFIDENTIAL',
                'SECRET',
                'TOP_SECRET'
            ];

            levels.forEach(level => {
                const equivalents = getNationalEquivalents(level, 'USA');
                expect(equivalents.length).toBeGreaterThan(0);
            });
        });

        it('should have equivalents for all 10 countries', () => {
            const countries: NationalClearanceSystem[] = [
                'USA', 'FRA', 'CAN', 'GBR', 'DEU', 'ITA', 'ESP', 'POL', 'NLD', 'INDUSTRY'
            ];

            countries.forEach(country => {
                const result = mapNationalClearance('SECRET', country);
                expect(result).toBe('SECRET');
            });
        });
    });

    // ============================================
    // 12. Edge Cases and Error Handling (5 tests)
    // ============================================

    describe('Edge Cases and Error Handling', () => {
        it('should handle unknown clearance levels gracefully', () => {
            const result = mapNationalClearance('INVALID_LEVEL', 'USA');
            expect(result).toBe('UNCLASSIFIED');
        });

        it('should handle empty string clearance', () => {
            const result = mapNationalClearance('', 'USA');
            expect(result).toBe('UNCLASSIFIED');
        });

        it('should handle special characters in clearance', () => {
            const result = mapNationalClearance('SECRET-DÉFENSE!!!', 'FRA');
            // Should not match due to special chars, fallback to UNCLASSIFIED
            expect(result).toBe('UNCLASSIFIED');
        });

        it('should handle numeric clearance values', () => {
            const result = mapNationalClearance('123', 'USA');
            expect(result).toBe('UNCLASSIFIED');
        });

        it('should handle very long clearance strings', () => {
            const longString = 'A'.repeat(1000);
            const result = mapNationalClearance(longString, 'USA');
            expect(result).toBe('UNCLASSIFIED');
        });
    });
});

// ============================================
// Test Summary
// ============================================

/**
 * Total Tests: 78 tests
 * 
 * Coverage:
 * - USA Clearance Mappings: 5 tests
 * - French Clearance Mappings: 6 tests
 * - Canadian Clearance Mappings: 5 tests
 * - UK Clearance Mappings: 4 tests
 * - German Clearance Mappings: 4 tests (NEW)
 * - Italian Clearance Mappings: 4 tests (NEW)
 * - Spanish Clearance Mappings: 4 tests (NEW)
 * - Polish Clearance Mappings: 4 tests (NEW)
 * - Dutch Clearance Mappings: 4 tests (NEW)
 * - Industry Clearance Mappings: 4 tests
 * - Case Insensitivity: 3 tests
 * - MFA Requirements: 4 tests
 * - Token Mapping: 5 tests
 * - Realm Detection: 11 tests (expanded from 6)
 * - National Equivalents: 6 tests (expanded from 4)
 * - Validation: 3 tests
 * - Edge Cases: 5 tests
 * 
 * All 10 national systems tested: USA, France, Canada, UK, Germany, Italy, Spain, Poland, Netherlands, Industry
 * All 4 clearance levels tested: UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET
 * All 6 new NATO nations fully covered: DEU, GBR, ITA, ESP, POL, NLD
 */

