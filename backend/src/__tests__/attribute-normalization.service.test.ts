/**
 * Attribute Normalization Service Test Suite
 * Tests for IdP attribute normalization (Spanish SAML, USA OIDC)
 * 
 * Target Coverage: 95%+
 * Priority: HIGH (Federation critical)
 */

import {
    normalizeSpanishSAMLAttributes,
    normalizeUSAOIDCAttributes,
    normalizeExternalIdPAttributes,
    enrichAttributes,
    ExternalIdPAttributes,
    NormalizedDIVEAttributes,
} from '../services/attribute-normalization.service';

// Mock logger
jest.mock('../utils/logger', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    },
}));

describe('Attribute Normalization Service', () => {
    // ============================================
    // Spanish SAML Normalization Tests
    // ============================================
    describe('normalizeSpanishSAMLAttributes', () => {
        describe('Happy Path', () => {
            it('should normalize Spanish SAML attributes with TOP_SECRET clearance', () => {
                const samlAttrs: ExternalIdPAttributes = {
                    uid: 'juan.garcia@mde.es',
                    nivelSeguridad: 'SECRETO',
                    paisAfiliacion: 'ESP',
                    grupoInteresCompartido: ['OTAN-COSMIC', 'ESP-EXCLUSIVO'],
                    organizacion: 'Ministerio de Defensa',
                };

                const result = normalizeSpanishSAMLAttributes(samlAttrs);

                expect(result.uniqueID).toBe('juan.garcia@mde.es');
                expect(result.clearance).toBe('TOP_SECRET');
                expect(result.countryOfAffiliation).toBe('ESP');
                expect(result.acpCOI).toEqual(['NATO-COSMIC', 'ESP-ONLY']);
                expect(result.organization).toBe('Ministerio de Defensa');
            });

            it('should normalize Spanish CONFIDENTIAL-DEFENSA to SECRET', () => {
                const samlAttrs: ExternalIdPAttributes = {
                    uid: 'maria.lopez@mde.es',
                    nivelSeguridad: 'CONFIDENCIAL-DEFENSA',
                    paisAfiliacion: 'ESP',
                };

                const result = normalizeSpanishSAMLAttributes(samlAttrs);

                expect(result.clearance).toBe('SECRET');
            });

            it('should normalize Spanish CONFIDENCIAL to CONFIDENTIAL', () => {
                const samlAttrs: ExternalIdPAttributes = {
                    uid: 'carlos.rodriguez@mde.es',
                    nivelSeguridad: 'CONFIDENCIAL',
                    paisAfiliacion: 'ESP',
                };

                const result = normalizeSpanishSAMLAttributes(samlAttrs);

                expect(result.clearance).toBe('CONFIDENTIAL');
            });

            it('should normalize Spanish NO-CLASIFICADO to UNCLASSIFIED', () => {
                const samlAttrs: ExternalIdPAttributes = {
                    uid: 'ana.martinez@mde.es',
                    nivelSeguridad: 'NO-CLASIFICADO',
                    paisAfiliacion: 'ESP',
                };

                const result = normalizeSpanishSAMLAttributes(samlAttrs);

                expect(result.clearance).toBe('UNCLASSIFIED');
            });

            it('should normalize Spanish RESERVADO to CONFIDENTIAL', () => {
                const samlAttrs: ExternalIdPAttributes = {
                    uid: 'pedro.sanchez@mde.es',
                    nivelSeguridad: 'RESERVADO',
                    paisAfiliacion: 'ESP',
                };

                const result = normalizeSpanishSAMLAttributes(samlAttrs);

                expect(result.clearance).toBe('CONFIDENTIAL');
            });

            it('should use email as fallback for uniqueID', () => {
                const samlAttrs: ExternalIdPAttributes = {
                    mail: 'test@mde.es',
                    nivelSeguridad: 'SECRETO',
                    pais: 'ESP',
                };

                const result = normalizeSpanishSAMLAttributes(samlAttrs);

                expect(result.uniqueID).toBe('test@mde.es');
            });

            it('should normalize Spanish COI tags', () => {
                const samlAttrs: ExternalIdPAttributes = {
                    uid: 'test@mde.es',
                    nivelSeguridad: 'SECRETO',
                    paisAfiliacion: 'ESP',
                    grupoInteresCompartido: ['OTAN', 'ESP-OTAN', 'UE-RESTRINGIDO'],
                };

                const result = normalizeSpanishSAMLAttributes(samlAttrs);

                expect(result.acpCOI).toEqual(['NATO-COSMIC', 'NATO-COSMIC', 'EU-RESTRICTED']);
            });

            it('should normalize various country code formats to ESP', () => {
                const testCases = ['ES', 'ESP', 'SPAIN'];

                testCases.forEach(countryCode => {
                    const samlAttrs: ExternalIdPAttributes = {
                        uid: 'test@mde.es',
                        nivelSeguridad: 'SECRETO',
                        paisAfiliacion: countryCode,
                    };

                    const result = normalizeSpanishSAMLAttributes(samlAttrs);
                    expect(result.countryOfAffiliation).toBe('ESP');
                });
            });

            it('should handle array values for attributes', () => {
                const samlAttrs: ExternalIdPAttributes = {
                    uid: ['juan.garcia@mde.es', 'juan.garcia.alt@mde.es'],
                    nivelSeguridad: ['SECRETO'],
                    paisAfiliacion: ['ESP'],
                    grupoInteresCompartido: ['OTAN-COSMIC', 'ESP-EXCLUSIVO'],
                };

                const result = normalizeSpanishSAMLAttributes(samlAttrs);

                expect(result.uniqueID).toBe('juan.garcia@mde.es');
                expect(result.clearance).toBe('TOP_SECRET');
                expect(result.countryOfAffiliation).toBe('ESP');
            });
        });

        describe('Edge Cases', () => {
            it('should handle empty attributes object and default to ESP', () => {
                const result = normalizeSpanishSAMLAttributes({});

                // Spanish IdP defaults countryOfAffiliation to ESP
                expect(result.countryOfAffiliation).toBe('ESP');
            });

            it('should handle missing uid and email', () => {
                const samlAttrs: ExternalIdPAttributes = {
                    nivelSeguridad: 'SECRETO',
                    paisAfiliacion: 'ESP',
                };

                const result = normalizeSpanishSAMLAttributes(samlAttrs);

                expect(result.uniqueID).toBeUndefined();
            });

            it('should default to UNCLASSIFIED for unknown clearance', () => {
                const samlAttrs: ExternalIdPAttributes = {
                    uid: 'test@mde.es',
                    nivelSeguridad: 'UNKNOWN_LEVEL',
                    paisAfiliacion: 'ESP',
                };

                const result = normalizeSpanishSAMLAttributes(samlAttrs);

                expect(result.clearance).toBe('UNCLASSIFIED');
            });

            it('should default to ESP when country code is missing', () => {
                const samlAttrs: ExternalIdPAttributes = {
                    uid: 'test@mde.es',
                    nivelSeguridad: 'SECRETO',
                };

                const result = normalizeSpanishSAMLAttributes(samlAttrs);

                expect(result.countryOfAffiliation).toBe('ESP');
            });

            it('should handle unmapped COI tags as-is', () => {
                const samlAttrs: ExternalIdPAttributes = {
                    uid: 'test@mde.es',
                    nivelSeguridad: 'SECRETO',
                    paisAfiliacion: 'ESP',
                    grupoInteresCompartido: ['UNKNOWN_TAG', 'OTAN-COSMIC'],
                };

                const result = normalizeSpanishSAMLAttributes(samlAttrs);

                expect(result.acpCOI).toEqual(['UNKNOWN_TAG', 'NATO-COSMIC']);
            });
        });

        describe('Error Handling', () => {
            it('should handle null attributes', () => {
                const result = normalizeSpanishSAMLAttributes(null as any);

                expect(result).toEqual({});
            });

            it('should handle undefined attributes', () => {
                const result = normalizeSpanishSAMLAttributes(undefined as any);

                expect(result).toEqual({});
            });
        });
    });

    // ============================================
    // USA OIDC Normalization Tests
    // ============================================
    describe('normalizeUSAOIDCAttributes', () => {
        describe('Happy Path', () => {
            it('should normalize USA OIDC attributes', () => {
                const oidcAttrs: ExternalIdPAttributes = {
                    uniqueID: 'alice.general@af.mil',
                    clearance: 'SECRET',
                    countryOfAffiliation: 'USA',
                    acpCOI: ['FVEY', 'NATO-COSMIC'],
                    organization: 'US Air Force',
                    rank: 'Captain',
                };

                const result = normalizeUSAOIDCAttributes(oidcAttrs);

                expect(result.uniqueID).toBe('alice.general@af.mil');
                expect(result.clearance).toBe('SECRET');
                expect(result.countryOfAffiliation).toBe('USA');
                expect(result.acpCOI).toEqual(['FVEY', 'NATO-COSMIC']);
                expect(result.organization).toBe('US Air Force');
                expect(result.rank).toBe('Captain');
            });

            it('should use email as fallback for uniqueID', () => {
                const oidcAttrs: ExternalIdPAttributes = {
                    email: 'test@mil.gov',
                    clearance: 'CONFIDENTIAL',
                    countryOfAffiliation: 'USA',
                };

                const result = normalizeUSAOIDCAttributes(oidcAttrs);

                expect(result.uniqueID).toBe('test@mil.gov');
            });

            it('should normalize all clearance levels', () => {
                const levels = [
                    'TOP_SECRET',
                    'SECRET',
                    'CONFIDENTIAL',
                    'UNCLASSIFIED',
                ];

                levels.forEach(level => {
                    const oidcAttrs: ExternalIdPAttributes = {
                        uniqueID: 'test@mil.gov',
                        clearance: level,
                        countryOfAffiliation: 'USA',
                    };

                    const result = normalizeUSAOIDCAttributes(oidcAttrs);
                    expect(result.clearance).toBe(level as any);
                });
            });

            it('should normalize various US country formats', () => {
                const testCases = ['US', 'USA', 'UNITED STATES'];

                testCases.forEach(countryCode => {
                    const oidcAttrs: ExternalIdPAttributes = {
                        uniqueID: 'test@mil.gov',
                        clearance: 'SECRET',
                        countryOfAffiliation: countryCode,
                    };

                    const result = normalizeUSAOIDCAttributes(oidcAttrs);
                    expect(result.countryOfAffiliation).toBe('USA');
                });
            });
        });

        describe('Edge Cases', () => {
            it('should handle empty attributes object and default to USA', () => {
                const result = normalizeUSAOIDCAttributes({});

                // USA IdP defaults countryOfAffiliation to USA
                expect(result.countryOfAffiliation).toBe('USA');
            });

            it('should handle missing sub and email', () => {
                const oidcAttrs: ExternalIdPAttributes = {
                    clearance: 'SECRET',
                    countryOfAffiliation: 'USA',
                };

                const result = normalizeUSAOIDCAttributes(oidcAttrs);

                expect(result.uniqueID).toBeUndefined();
            });

            it('should not set clearance for unknown level', () => {
                const oidcAttrs: ExternalIdPAttributes = {
                    uniqueID: 'test@mil.gov',
                    clearance: 'UNKNOWN',
                    countryOfAffiliation: 'USA',
                };

                const result = normalizeUSAOIDCAttributes(oidcAttrs);

                expect(result.clearance).toBeUndefined();
            });
        });
    });

    // ============================================
    // Generic OIDC Normalization Tests
    // ============================================
    describe('normalizeExternalIdPAttributes', () => {
        it('should route Spanish IdP to Spanish normalization', () => {
            const attrs: ExternalIdPAttributes = {
                uid: 'test@mde.es',
                nivelSeguridad: 'SECRETO',
                paisAfiliacion: 'ESP',
            };

            const result = normalizeExternalIdPAttributes('spain-saml', attrs);

            expect(result.uniqueID).toBe('test@mde.es');
            expect(result.clearance).toBe('TOP_SECRET');
            expect(result.countryOfAffiliation).toBe('ESP');
        });

        it('should route USA IdP to USA normalization', () => {
            const attrs: ExternalIdPAttributes = {
                uniqueID: 'test@mil.gov',
                clearance: 'SECRET',
                countryOfAffiliation: 'USA',
            };

            const result = normalizeExternalIdPAttributes('usa-oidc', attrs);

            expect(result.uniqueID).toBe('test@mil.gov');
            expect(result.clearance).toBe('SECRET');
            expect(result.countryOfAffiliation).toBe('USA');
        });

        it('should handle various Spanish IdP aliases', () => {
            const attrs: ExternalIdPAttributes = {
                uid: 'test@mde.es',
                nivelSeguridad: 'SECRETO',
                paisAfiliacion: 'ESP',
            };

            const aliases = ['spain-external', 'spain-saml', 'esp-idp'];

            aliases.forEach(alias => {
                const result = normalizeExternalIdPAttributes(alias, attrs);
                expect(result.countryOfAffiliation).toBe('ESP');
            });
        });

        it('should handle various USA IdP aliases', () => {
            const attrs: ExternalIdPAttributes = {
                uniqueID: 'test@mil.gov',
                clearance: 'SECRET',
                countryOfAffiliation: 'USA',
            };

            const aliases = ['usa-external', 'usa-oidc', 'us-dod'];

            aliases.forEach(alias => {
                const result = normalizeExternalIdPAttributes(alias, attrs);
                expect(result.countryOfAffiliation).toBe('USA');
            });
        });

        it('should use generic normalization for unknown IdP', () => {
            const attrs: ExternalIdPAttributes = {
                uniqueID: 'test@example.com',
                clearance: 'SECRET',
                country: 'GBR',
            };

            const result = normalizeExternalIdPAttributes('unknown-idp', attrs);

            expect(result.uniqueID).toBe('test@example.com');
            expect(result.clearance).toBe('SECRET');
        });

        it('should handle French IdP', () => {
            const attrs: ExternalIdPAttributes = {
                uid: 'test@defense.gouv.fr',
                niveauSecret: 'SECRET-DEFENSE',
                pays: 'FRA',
            };

            const result = normalizeExternalIdPAttributes('france-idp', attrs);

            expect(result.uniqueID).toBe('test@defense.gouv.fr');
        });

        it('should handle Canadian IdP', () => {
            const attrs: ExternalIdPAttributes = {
                uniqueID: 'test@forces.gc.ca',
                clearance: 'SECRET',
                countryOfAffiliation: 'CAN',
            };

            const result = normalizeExternalIdPAttributes('canada-idp', attrs);

            expect(result.uniqueID).toBe('test@forces.gc.ca');
        });
    });

    // ============================================
    // Attribute Enrichment Tests
    // ============================================
    describe('enrichAttributes', () => {
        it('should enrich complete attributes', () => {
            const attrs: Partial<NormalizedDIVEAttributes> = {
                uniqueID: 'test@mil.gov',
                clearance: 'SECRET',
                countryOfAffiliation: 'USA',
            };

            const result = enrichAttributes(attrs, 'usa-oidc');

            expect(result.uniqueID).toBe('test@mil.gov');
            expect(result.clearance).toBe('SECRET');
            expect(result.countryOfAffiliation).toBe('USA');
        });

        it('should throw error if uniqueID is missing', () => {
            const attrs: Partial<NormalizedDIVEAttributes> = {
                clearance: 'SECRET',
                countryOfAffiliation: 'USA',
            };

            expect(() => enrichAttributes(attrs, 'usa-oidc')).toThrow('uniqueID is required but missing');
        });

        it('should default clearance to UNCLASSIFIED if missing', () => {
            const attrs: Partial<NormalizedDIVEAttributes> = {
                uniqueID: 'test@example.com',
                countryOfAffiliation: 'USA',
            };

            const result = enrichAttributes(attrs, 'usa-oidc');

            expect(result.clearance).toBe('UNCLASSIFIED');
        });

        it('should infer country from email domain if missing', () => {
            const attrs: Partial<NormalizedDIVEAttributes> = {
                uniqueID: 'test@af.mil',
                clearance: 'SECRET',
            };

            const result = enrichAttributes(attrs, 'usa-oidc');

            expect(result.countryOfAffiliation).toBe('USA');
        });

        it('should throw error if country cannot be determined', () => {
            const attrs: Partial<NormalizedDIVEAttributes> = {
                uniqueID: 'test@example.com',
                clearance: 'SECRET',
            };

            expect(() => enrichAttributes(attrs, 'unknown-idp')).toThrow();
        });

        it('should handle IdP with known country defaults', () => {
            const attrs: Partial<NormalizedDIVEAttributes> = {
                uniqueID: 'test@example.com',
                clearance: 'SECRET',
            };

            const result = enrichAttributes(attrs, 'usa-oidc');

            expect(result.countryOfAffiliation).toBeDefined();
        });
    });

    // ============================================
    // Validation Tests (if validation function exists)
    // ============================================
    describe('Validation Edge Cases', () => {
        it('should handle complete Spanish attributes', () => {
            const attrs: ExternalIdPAttributes = {
                uid: 'test@mde.es',
                nivelSeguridad: 'SECRETO',
                pais: 'ESP',
                coiTags: ['OTAN-COSMIC'],
                organizacion: 'MDE',
            };

            const normalized = normalizeSpanishSAMLAttributes(attrs);

            expect(normalized.uniqueID).toBeDefined();
            expect(normalized.clearance).toBeDefined();
            expect(normalized.countryOfAffiliation).toBeDefined();
        });

        it('should handle complete USA attributes', () => {
            const attrs: ExternalIdPAttributes = {
                uniqueID: 'test@mil.gov',
                clearance: 'SECRET',
                countryOfAffiliation: 'USA',
                acpCOI: ['FVEY'],
                organization: 'USAF',
            };

            const normalized = normalizeUSAOIDCAttributes(attrs);

            expect(normalized.uniqueID).toBeDefined();
            expect(normalized.clearance).toBeDefined();
            expect(normalized.countryOfAffiliation).toBeDefined();
        });

        it('should handle minimal attributes', () => {
            const attrs: ExternalIdPAttributes = {
                uid: 'test@example.com',
            };

            const normalized = normalizeSpanishSAMLAttributes(attrs);

            expect(normalized.uniqueID).toBe('test@example.com');
        });
    });
});

