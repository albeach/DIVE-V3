/**
 * DIVE V3 - Clearance Normalization Service Tests
 * 
 * Comprehensive test suite for Spanish, French, Canadian clearance normalization
 */

import {
    normalizeClearance,
    normalizeClearances,
    StandardClearance,
    getSupportedCountries,
    getCountryMappings,
    hasCountryMappings,
    isValidStandardClearance,
    getClearanceLevel,
    compareClearances,
} from '../clearance-normalization.service';

describe('ClearanceNormalizationService', () => {
    describe('normalizeClearance', () => {
        describe('Spanish clearances (ESP)', () => {
            it('should normalize SECRETO to SECRET', () => {
                const result = normalizeClearance('SECRETO', 'ESP');

                expect(result.original).toBe('SECRETO');
                expect(result.normalized).toBe(StandardClearance.SECRET);
                expect(result.country).toBe('ESP');
                expect(result.wasNormalized).toBe(true);
                expect(result.confidence).toBe('exact');
            });

            it('should normalize CONFIDENCIAL to CONFIDENTIAL', () => {
                const result = normalizeClearance('CONFIDENCIAL', 'ESP');

                expect(result.normalized).toBe(StandardClearance.CONFIDENTIAL);
                expect(result.confidence).toBe('exact');
            });

            it('should normalize NO_CLASIFICADO to UNCLASSIFIED', () => {
                const result = normalizeClearance('NO_CLASIFICADO', 'ESP');

                expect(result.normalized).toBe(StandardClearance.UNCLASSIFIED);
                expect(result.confidence).toBe('exact');
            });

            it('should normalize ALTO_SECRETO to TOP_SECRET', () => {
                const result = normalizeClearance('ALTO_SECRETO', 'ESP');

                expect(result.normalized).toBe(StandardClearance.TOP_SECRET);
                expect(result.confidence).toBe('exact');
            });

            it('should handle lowercase Spanish clearance', () => {
                const result = normalizeClearance('secreto', 'ESP');

                expect(result.normalized).toBe(StandardClearance.SECRET);
                expect(result.confidence).toBe('exact');
            });

            it('should handle Spanish clearance with spaces', () => {
                const result = normalizeClearance('NO CLASIFICADO', 'ESP');

                expect(result.normalized).toBe(StandardClearance.UNCLASSIFIED);
                expect(result.confidence).toBe('exact');
            });

            it('should handle mixed case and whitespace', () => {
                const result = normalizeClearance('  Alto Secreto  ', 'ESP');

                expect(result.normalized).toBe(StandardClearance.TOP_SECRET);
                expect(result.confidence).toBe('exact'); // Uppercase+trim handles this as exact match
            });
        });

        describe('French clearances (FRA)', () => {
            it('should normalize SECRET_DEFENSE to SECRET', () => {
                const result = normalizeClearance('SECRET_DEFENSE', 'FRA');

                expect(result.normalized).toBe(StandardClearance.SECRET);
                expect(result.confidence).toBe('exact');
            });

            it('should normalize CONFIDENTIEL_DEFENSE to CONFIDENTIAL', () => {
                const result = normalizeClearance('CONFIDENTIEL_DEFENSE', 'FRA');

                expect(result.normalized).toBe(StandardClearance.CONFIDENTIAL);
                expect(result.confidence).toBe('exact');
            });

            it('should normalize TRES_SECRET_DEFENSE to TOP_SECRET', () => {
                const result = normalizeClearance('TRES_SECRET_DEFENSE', 'FRA');

                expect(result.normalized).toBe(StandardClearance.TOP_SECRET);
                expect(result.confidence).toBe('exact');
            });

            it('should normalize NON_PROTEGE to UNCLASSIFIED', () => {
                const result = normalizeClearance('NON_PROTEGE', 'FRA');

                expect(result.normalized).toBe(StandardClearance.UNCLASSIFIED);
                expect(result.confidence).toBe('exact');
            });
        });

        describe('Canadian clearances (CAN)', () => {
            it('should pass through already-English clearances', () => {
                const result = normalizeClearance('SECRET', 'CAN');

                expect(result.normalized).toBe(StandardClearance.SECRET);
                expect(result.wasNormalized).toBe(false);
                expect(result.confidence).toBe('passthrough');
            });

            it('should normalize PROTECTED_B to CONFIDENTIAL', () => {
                const result = normalizeClearance('PROTECTED_B', 'CAN');

                expect(result.normalized).toBe(StandardClearance.CONFIDENTIAL);
                expect(result.confidence).toBe('exact');
            });
        });

        describe('NATO clearances', () => {
            it('should normalize NATO_SECRET to SECRET', () => {
                const result = normalizeClearance('NATO_SECRET', 'NATO');

                expect(result.normalized).toBe(StandardClearance.SECRET);
                expect(result.confidence).toBe('exact');
            });

            it('should normalize COSMIC_TOP_SECRET to TOP_SECRET', () => {
                const result = normalizeClearance('COSMIC_TOP_SECRET', 'NATO');

                expect(result.normalized).toBe(StandardClearance.TOP_SECRET);
                expect(result.confidence).toBe('exact');
            });
        });

        describe('USA/GBR clearances (already English)', () => {
            it('should pass through USA clearances unchanged', () => {
                const result = normalizeClearance('SECRET', 'USA');

                expect(result.normalized).toBe(StandardClearance.SECRET);
                expect(result.wasNormalized).toBe(false);
                expect(result.confidence).toBe('passthrough');
            });

            it('should pass through GBR clearances unchanged', () => {
                const result = normalizeClearance('TOP_SECRET', 'GBR');

                expect(result.normalized).toBe(StandardClearance.TOP_SECRET);
                expect(result.wasNormalized).toBe(false);
                expect(result.confidence).toBe('passthrough');
            });
        });

        describe('Edge cases and error handling', () => {
            it('should handle unknown clearance with fallback', () => {
                const result = normalizeClearance('UNKNOWN_LEVEL', 'ESP');

                expect(result.normalized).toBe(StandardClearance.UNCLASSIFIED);
                expect(result.confidence).toBe('fallback');
                expect(result.wasNormalized).toBe(true);
            });

            it('should handle unknown country with fallback', () => {
                const result = normalizeClearance('SECRET', 'XXX');

                expect(result.normalized).toBe(StandardClearance.SECRET);
                expect(result.confidence).toBe('passthrough');
            });

            it('should handle empty clearance', () => {
                const result = normalizeClearance('', 'ESP');

                expect(result.normalized).toBe(StandardClearance.UNCLASSIFIED);
                expect(result.confidence).toBe('fallback');
            });

            it('should handle null clearance', () => {
                const result = normalizeClearance(null as any, 'ESP');

                expect(result.normalized).toBe(StandardClearance.UNCLASSIFIED);
                expect(result.confidence).toBe('fallback');
            });

            it('should handle undefined clearance', () => {
                const result = normalizeClearance(undefined as any, 'ESP');

                expect(result.normalized).toBe(StandardClearance.UNCLASSIFIED);
                expect(result.confidence).toBe('fallback');
            });

            it('should handle empty country', () => {
                const result = normalizeClearance('SECRET', '');

                expect(result.normalized).toBe(StandardClearance.SECRET);
                expect(result.country).toBe('');
            });

            it('should handle lowercase country code', () => {
                const result = normalizeClearance('SECRETO', 'esp');

                expect(result.normalized).toBe(StandardClearance.SECRET);
                expect(result.country).toBe('ESP');
            });

            it('should handle clearance with leading/trailing whitespace', () => {
                const result = normalizeClearance('  SECRETO  ', 'ESP');

                expect(result.normalized).toBe(StandardClearance.SECRET);
                expect(result.confidence).toBe('exact');
            });
        });
    });

    describe('normalizeClearances', () => {
        it('should normalize multiple clearances', () => {
            const clearances = [
                { clearance: 'SECRETO', country: 'ESP' },
                { clearance: 'SECRET_DEFENSE', country: 'FRA' },
                { clearance: 'SECRET', country: 'USA' },
            ];

            const results = normalizeClearances(clearances);

            expect(results).toHaveLength(3);
            expect(results[0].normalized).toBe(StandardClearance.SECRET);
            expect(results[1].normalized).toBe(StandardClearance.SECRET);
            expect(results[2].normalized).toBe(StandardClearance.SECRET);
        });

        it('should handle empty array', () => {
            const results = normalizeClearances([]);
            expect(results).toHaveLength(0);
        });
    });

    describe('getSupportedCountries', () => {
        it('should return array of supported countries', () => {
            const countries = getSupportedCountries();

            expect(countries).toContain('ESP');
            expect(countries).toContain('FRA');
            expect(countries).toContain('CAN');
            expect(countries).toContain('USA');
            expect(countries).toContain('GBR');
            expect(countries).toContain('NATO');
        });
    });

    describe('getCountryMappings', () => {
        it('should return Spanish mappings', () => {
            const mappings = getCountryMappings('ESP');

            expect(mappings.SECRETO).toBe(StandardClearance.SECRET);
            expect(mappings.CONFIDENCIAL).toBe(StandardClearance.CONFIDENTIAL);
            expect(mappings.NO_CLASIFICADO).toBe(StandardClearance.UNCLASSIFIED);
        });

        it('should return empty object for unsupported country', () => {
            const mappings = getCountryMappings('XXX');

            expect(mappings).toEqual({});
        });

        it('should handle lowercase country code', () => {
            const mappings = getCountryMappings('esp');

            expect(mappings.SECRETO).toBe(StandardClearance.SECRET);
        });
    });

    describe('hasCountryMappings', () => {
        it('should return true for Spain', () => {
            expect(hasCountryMappings('ESP')).toBe(true);
        });

        it('should return true for France', () => {
            expect(hasCountryMappings('FRA')).toBe(true);
        });

        it('should return true for USA (has mappings via SSOT)', () => {
            expect(hasCountryMappings('USA')).toBe(true);
        });

        it('should return false for unknown country', () => {
            expect(hasCountryMappings('XXX')).toBe(false);
        });
    });

    describe('isValidStandardClearance', () => {
        it('should return true for UNCLASSIFIED', () => {
            expect(isValidStandardClearance('UNCLASSIFIED')).toBe(true);
        });

        it('should return true for CONFIDENTIAL', () => {
            expect(isValidStandardClearance('CONFIDENTIAL')).toBe(true);
        });

        it('should return true for SECRET', () => {
            expect(isValidStandardClearance('SECRET')).toBe(true);
        });

        it('should return true for TOP_SECRET', () => {
            expect(isValidStandardClearance('TOP_SECRET')).toBe(true);
        });

        it('should return false for foreign clearance', () => {
            expect(isValidStandardClearance('SECRETO')).toBe(false);
        });

        it('should return false for unknown clearance', () => {
            expect(isValidStandardClearance('INVALID')).toBe(false);
        });
    });

    describe('getClearanceLevel', () => {
        it('should return 0 for UNCLASSIFIED', () => {
            expect(getClearanceLevel(StandardClearance.UNCLASSIFIED)).toBe(0);
        });

        it('should return 1 for RESTRICTED (integer hierarchy)', () => {
            expect(getClearanceLevel(StandardClearance.RESTRICTED)).toBe(1);
        });

        it('should return 2 for CONFIDENTIAL', () => {
            expect(getClearanceLevel(StandardClearance.CONFIDENTIAL)).toBe(2);
        });

        it('should return 3 for SECRET', () => {
            expect(getClearanceLevel(StandardClearance.SECRET)).toBe(3);
        });

        it('should return 4 for TOP_SECRET', () => {
            expect(getClearanceLevel(StandardClearance.TOP_SECRET)).toBe(4);
        });

        it('should confirm RESTRICTED > UNCLASSIFIED', () => {
            const restrictedLevel = getClearanceLevel(StandardClearance.RESTRICTED);
            const unclassifiedLevel = getClearanceLevel(StandardClearance.UNCLASSIFIED);
            expect(restrictedLevel).toBeGreaterThan(unclassifiedLevel);
        });
    });

    describe('compareClearances', () => {
        it('should return 1 when first clearance is higher', () => {
            const result = compareClearances(
                StandardClearance.SECRET,
                StandardClearance.CONFIDENTIAL
            );
            expect(result).toBe(1);
        });

        it('should return -1 when first clearance is lower', () => {
            const result = compareClearances(
                StandardClearance.CONFIDENTIAL,
                StandardClearance.SECRET
            );
            expect(result).toBe(-1);
        });

        it('should return 0 when clearances are equal', () => {
            const result = compareClearances(
                StandardClearance.SECRET,
                StandardClearance.SECRET
            );
            expect(result).toBe(0);
        });

        it('should correctly compare UNCLASSIFIED vs TOP_SECRET', () => {
            const result = compareClearances(
                StandardClearance.UNCLASSIFIED,
                StandardClearance.TOP_SECRET
            );
            expect(result).toBe(-1);
        });

        // CRITICAL: RESTRICTED clearance comparison tests
        it('should return 1 when RESTRICTED > UNCLASSIFIED', () => {
            const result = compareClearances(
                StandardClearance.RESTRICTED,
                StandardClearance.UNCLASSIFIED
            );
            expect(result).toBe(1);
        });

        it('should return -1 when UNCLASSIFIED < RESTRICTED', () => {
            const result = compareClearances(
                StandardClearance.UNCLASSIFIED,
                StandardClearance.RESTRICTED
            );
            expect(result).toBe(-1);
        });

        it('should return 0 when RESTRICTED = RESTRICTED', () => {
            const result = compareClearances(
                StandardClearance.RESTRICTED,
                StandardClearance.RESTRICTED
            );
            expect(result).toBe(0);
        });

        it('should return -1 when RESTRICTED < CONFIDENTIAL', () => {
            const result = compareClearances(
                StandardClearance.RESTRICTED,
                StandardClearance.CONFIDENTIAL
            );
            expect(result).toBe(-1);
        });

        it('should return 1 when CONFIDENTIAL > RESTRICTED', () => {
            const result = compareClearances(
                StandardClearance.CONFIDENTIAL,
                StandardClearance.RESTRICTED
            );
            expect(result).toBe(1);
        });
    });

    describe('Real-world test scenarios', () => {
        describe('Spanish military users', () => {
            it('should normalize Juan García (SECRETO)', () => {
                const result = normalizeClearance('SECRETO', 'ESP');

                expect(result.normalized).toBe(StandardClearance.SECRET);
                expect(result.wasNormalized).toBe(true);
            });

            it('should normalize María Rodríguez (CONFIDENCIAL)', () => {
                const result = normalizeClearance('CONFIDENCIAL', 'ESP');

                expect(result.normalized).toBe(StandardClearance.CONFIDENTIAL);
                expect(result.wasNormalized).toBe(true);
            });

            it('should normalize Carlos Fernández (NO_CLASIFICADO)', () => {
                const result = normalizeClearance('NO_CLASIFICADO', 'ESP');

                expect(result.normalized).toBe(StandardClearance.UNCLASSIFIED);
                expect(result.wasNormalized).toBe(true);
            });

            it('should normalize Elena Sánchez (ALTO_SECRETO)', () => {
                const result = normalizeClearance('ALTO_SECRETO', 'ESP');

                expect(result.normalized).toBe(StandardClearance.TOP_SECRET);
                expect(result.wasNormalized).toBe(true);
            });
        });

        describe('French military users', () => {
            it('should normalize French SECRET', () => {
                const result = normalizeClearance('SECRET_DEFENSE', 'FRA');

                expect(result.normalized).toBe(StandardClearance.SECRET);
            });

            it('should normalize French CONFIDENTIAL', () => {
                const result = normalizeClearance('CONFIDENTIEL_DEFENSE', 'FRA');

                expect(result.normalized).toBe(StandardClearance.CONFIDENTIAL);
            });
        });

        describe('Multi-country batch normalization', () => {
            it('should normalize coalition users', () => {
                const users = [
                    { clearance: 'SECRETO', country: 'ESP' },
                    { clearance: 'SECRET_DEFENSE', country: 'FRA' },
                    { clearance: 'SECRET', country: 'USA' },
                    { clearance: 'SECRET', country: 'CAN' },
                    { clearance: 'SECRET', country: 'GBR' },
                ];

                const results = normalizeClearances(users);

                // All should normalize to SECRET
                results.forEach(result => {
                    expect(result.normalized).toBe(StandardClearance.SECRET);
                });

                // ESP and FRA should be normalized
                expect(results[0].wasNormalized).toBe(true);
                expect(results[1].wasNormalized).toBe(true);

                // USA, CAN, GBR should be passthrough
                expect(results[2].wasNormalized).toBe(false);
                expect(results[3].wasNormalized).toBe(false);
                expect(results[4].wasNormalized).toBe(false);
            });
        });
    });

    describe('Audit trail preservation', () => {
        it('should preserve original clearance value', () => {
            const result = normalizeClearance('SECRETO', 'ESP');

            expect(result.original).toBe('SECRETO');
            expect(result.normalized).toBe(StandardClearance.SECRET);
        });

        it('should preserve country code', () => {
            const result = normalizeClearance('SECRETO', 'ESP');

            expect(result.country).toBe('ESP');
        });

        it('should indicate when normalization was applied', () => {
            const resultNormalized = normalizeClearance('SECRETO', 'ESP');
            const resultPassthrough = normalizeClearance('SECRET', 'USA');

            expect(resultNormalized.wasNormalized).toBe(true);
            expect(resultPassthrough.wasNormalized).toBe(false);
        });

        it('should provide confidence level for audit', () => {
            const exactMatch = normalizeClearance('SECRETO', 'ESP');
            const fuzzyMatch = normalizeClearance('  Secreto  ', 'ESP');
            const passthrough = normalizeClearance('SECRET', 'USA');
            const fallback = normalizeClearance('UNKNOWN', 'ESP');

            expect(exactMatch.confidence).toBe('exact');
            expect(fuzzyMatch.confidence).toBe('exact'); // uppercase handles this
            expect(passthrough.confidence).toBe('passthrough');
            expect(fallback.confidence).toBe('fallback');
        });
    });
});
