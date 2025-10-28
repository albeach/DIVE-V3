/**
 * DIVE V3 - External IdP Integration Tests: Spain SAML
 * 
 * Tests federation with Spain SAML IdP (SimpleSAMLphp)
 * Tests attribute normalization from Spanish military attributes to DIVE claims
 */

import { describe, test, expect } from '@jest/globals';
import {
    normalizeSpanishSAMLAttributes,
    enrichAttributes,
} from '../../services/attribute-normalization.service';

describe('External IdP Integration - Spain SAML', () => {
    describe('Spanish SAML Attribute Normalization', () => {
        test('should normalize Spanish TOP SECRET clearance', () => {
            const spanishAttributes = {
                uid: 'garcia.maria@mde.es',
                mail: 'garcia.maria@mde.es',
                nivelSeguridad: 'SECRETO',
                paisAfiliacion: 'ESP',
                grupoInteresCompartido: ['OTAN-COSMIC', 'ESP-EXCLUSIVO'],
                organizacion: 'Ministerio de Defensa',
                rango: 'Coronel',
            };

            const normalized = normalizeSpanishSAMLAttributes(spanishAttributes);

            expect(normalized.uniqueID).toBe('garcia.maria@mde.es');
            expect(normalized.clearance).toBe('TOP_SECRET');
            expect(normalized.countryOfAffiliation).toBe('ESP');
            expect(normalized.acpCOI).toEqual(['NATO-COSMIC', 'ESP-ONLY']);
            expect(normalized.organization).toBe('Ministerio de Defensa');
            expect(normalized.rank).toBe('Coronel');
        });

        test('should normalize Spanish SECRET clearance (CONFIDENCIAL-DEFENSA)', () => {
            const spanishAttributes = {
                uid: 'rodriguez.juan@mde.es',
                nivelSeguridad: 'CONFIDENCIAL-DEFENSA',
                paisAfiliacion: 'ESP',
                grupoInteresCompartido: 'NATO-COSMIC',
            };

            const normalized = normalizeSpanishSAMLAttributes(spanishAttributes);

            expect(normalized.clearance).toBe('SECRET');
            expect(normalized.acpCOI).toEqual(['NATO-COSMIC']);
        });

        test('should normalize Spanish CONFIDENTIAL clearance', () => {
            const spanishAttributes = {
                uid: 'lopez.ana@mde.es',
                nivelSeguridad: 'CONFIDENCIAL',
                paisAfiliacion: 'ESP',
                grupoInteresCompartido: ['ESP-EXCLUSIVO'],
            };

            const normalized = normalizeSpanishSAMLAttributes(spanishAttributes);

            expect(normalized.clearance).toBe('CONFIDENTIAL');
            expect(normalized.acpCOI).toEqual(['ESP-ONLY']);
        });

        test('should normalize Spanish UNCLASSIFIED clearance', () => {
            const spanishAttributes = {
                uid: 'fernandez.carlos@mde.es',
                nivelSeguridad: 'NO-CLASIFICADO',
                paisAfiliacion: 'ESP',
                grupoInteresCompartido: 'NATO-UNRESTRICTED',
            };

            const normalized = normalizeSpanishSAMLAttributes(spanishAttributes);

            expect(normalized.clearance).toBe('UNCLASSIFIED');
        });

        test('should default to ESP country when paisAfiliacion is missing', () => {
            const spanishAttributes = {
                uid: 'test@mde.es',
                nivelSeguridad: 'SECRETO',
                // paisAfiliacion is missing
            };

            const normalized = normalizeSpanishSAMLAttributes(spanishAttributes);

            expect(normalized.countryOfAffiliation).toBe('ESP');
        });

        test('should handle missing COI tags gracefully', () => {
            const spanishAttributes = {
                uid: 'test@mde.es',
                nivelSeguridad: 'CONFIDENCIAL',
                paisAfiliacion: 'ESP',
                // grupoInteresCompartido is missing
            };

            const normalized = normalizeSpanishSAMLAttributes(spanishAttributes);

            expect(normalized.acpCOI).toBeUndefined();
        });

        test('should use mail as fallback for uniqueID', () => {
            const spanishAttributes = {
                // uid is missing
                mail: 'user@mde.es',
                nivelSeguridad: 'SECRETO',
                paisAfiliacion: 'ESP',
            };

            const normalized = normalizeSpanishSAMLAttributes(spanishAttributes);

            expect(normalized.uniqueID).toBe('user@mde.es');
        });
    });

    describe('Spanish Attribute Enrichment', () => {
        test('should enrich attributes with defaults', () => {
            const partial = {
                uniqueID: 'garcia.maria@mde.es',
                clearance: 'TOP_SECRET' as const,
                // countryOfAffiliation is missing
            };

            const enriched = enrichAttributes(partial, 'spain-external');

            expect(enriched.uniqueID).toBe('garcia.maria@mde.es');
            expect(enriched.clearance).toBe('TOP_SECRET');
            expect(enriched.countryOfAffiliation).toBe('ESP');
        });

        test('should throw error when uniqueID is missing', () => {
            const partial = {
                clearance: 'SECRET' as const,
                countryOfAffiliation: 'ESP',
            };

            expect(() => {
                enrichAttributes(partial as any, 'spain-external');
            }).toThrow('uniqueID is required but missing');
        });

        test('should default clearance to UNCLASSIFIED when missing', () => {
            const partial = {
                uniqueID: 'test@mde.es',
                countryOfAffiliation: 'ESP',
            };

            const enriched = enrichAttributes(partial, 'spain-external');

            expect(enriched.clearance).toBe('UNCLASSIFIED');
        });
    });

    describe('Spanish COI Tag Normalization', () => {
        test('should normalize OTAN-COSMIC to NATO-COSMIC', () => {
            const spanishAttributes = {
                uid: 'test@mde.es',
                nivelSeguridad: 'SECRETO',
                paisAfiliacion: 'ESP',
                grupoInteresCompartido: ['OTAN-COSMIC', 'OTAN'],
            };

            const normalized = normalizeSpanishSAMLAttributes(spanishAttributes);

            expect(normalized.acpCOI).toEqual(['NATO-COSMIC', 'NATO-COSMIC']);
        });

        test('should normalize ESP-EXCLUSIVO to ESP-ONLY', () => {
            const spanishAttributes = {
                uid: 'test@mde.es',
                nivelSeguridad: 'CONFIDENCIAL',
                paisAfiliacion: 'ESP',
                grupoInteresCompartido: 'ESP-EXCLUSIVO',
            };

            const normalized = normalizeSpanishSAMLAttributes(spanishAttributes);

            expect(normalized.acpCOI).toEqual(['ESP-ONLY']);
        });

        test('should pass through unknown COI tags unchanged', () => {
            const spanishAttributes = {
                uid: 'test@mde.es',
                nivelSeguridad: 'SECRETO',
                paisAfiliacion: 'ESP',
                grupoInteresCompartido: ['CUSTOM-TAG'],
            };

            const normalized = normalizeSpanishSAMLAttributes(spanishAttributes);

            expect(normalized.acpCOI).toEqual(['CUSTOM-TAG']);
        });
    });

    describe('Spanish Test Users', () => {
        const testUsers = [
            {
                name: 'COL María García',
                uid: 'garcia.maria@mde.es',
                nivelSeguridad: 'SECRETO',
                expectedClearance: 'TOP_SECRET',
                expectedCOI: ['NATO-COSMIC', 'ESP-ONLY'],
            },
            {
                name: 'CPT Juan Rodríguez',
                uid: 'rodriguez.juan@mde.es',
                nivelSeguridad: 'CONFIDENCIAL-DEFENSA',
                expectedClearance: 'SECRET',
                expectedCOI: ['NATO-COSMIC'],
            },
            {
                name: 'LT Ana López',
                uid: 'lopez.ana@mde.es',
                nivelSeguridad: 'CONFIDENCIAL',
                expectedClearance: 'CONFIDENTIAL',
                expectedCOI: ['ESP-ONLY'],
            },
            {
                name: 'SGT Carlos Fernández',
                uid: 'fernandez.carlos@mde.es',
                nivelSeguridad: 'NO-CLASIFICADO',
                expectedClearance: 'UNCLASSIFIED',
                expectedCOI: ['NATO-UNRESTRICTED'],
            },
        ];

        testUsers.forEach((user) => {
            test(`should normalize ${user.name} attributes correctly`, () => {
                const spanishAttributes = {
                    uid: user.uid,
                    mail: user.uid,
                    nivelSeguridad: user.nivelSeguridad,
                    paisAfiliacion: 'ESP',
                    grupoInteresCompartido: user.expectedCOI.map((coi) => {
                        // Map expected back to Spanish tags
                        if (coi === 'NATO-COSMIC') return 'OTAN-COSMIC';
                        if (coi === 'ESP-ONLY') return 'ESP-EXCLUSIVO';
                        return coi;
                    }),
                };

                const normalized = normalizeSpanishSAMLAttributes(spanishAttributes);

                expect(normalized.uniqueID).toBe(user.uid);
                expect(normalized.clearance).toBe(user.expectedClearance);
                expect(normalized.countryOfAffiliation).toBe('ESP');
                expect(normalized.acpCOI).toEqual(user.expectedCOI);
            });
        });
    });

    describe('Edge Cases', () => {
        test('should handle empty attribute object', () => {
            const normalized = normalizeSpanishSAMLAttributes({});

            expect(normalized.uniqueID).toBeUndefined();
            expect(normalized.clearance).toBeUndefined();
            expect(normalized.countryOfAffiliation).toBe('ESP'); // Default
        });

        test('should handle unknown clearance level with fallback', () => {
            const spanishAttributes = {
                uid: 'test@mde.es',
                nivelSeguridad: 'UNKNOWN-LEVEL',
                paisAfiliacion: 'ESP',
            };

            const normalized = normalizeSpanishSAMLAttributes(spanishAttributes);

            expect(normalized.clearance).toBe('UNCLASSIFIED'); // Fallback
        });

        test('should handle both single and array COI values', () => {
            // Test single value
            const single = normalizeSpanishSAMLAttributes({
                uid: 'test@mde.es',
                nivelSeguridad: 'SECRETO',
                grupoInteresCompartido: 'OTAN-COSMIC',
            });

            expect(single.acpCOI).toEqual(['NATO-COSMIC']);

            // Test array value
            const array = normalizeSpanishSAMLAttributes({
                uid: 'test@mde.es',
                nivelSeguridad: 'SECRETO',
                grupoInteresCompartido: ['OTAN-COSMIC', 'ESP-EXCLUSIVO'],
            });

            expect(array.acpCOI).toEqual(['NATO-COSMIC', 'ESP-ONLY']);
        });
    });
});

/**
 * NOTE: Live integration tests require external IdP to be running
 * Run: cd external-idps && docker-compose up -d
 * Then: npm run test:integration:external-idp
 */
describe('External IdP Integration - Spain SAML Live Tests', () => {
    const SPAIN_SAML_URL = process.env.SPAIN_SAML_URL || 'https://localhost:8443';

    beforeAll(() => {
        if (!process.env.RUN_LIVE_TESTS) {
            console.log('⏭️  Skipping live tests (set RUN_LIVE_TESTS=true to enable)');
        }
    });

    test.skip('should fetch Spain SAML metadata', async () => {
        if (!process.env.RUN_LIVE_TESTS) {
            return;
        }

        const response = await fetch(
            `${SPAIN_SAML_URL}/simplesaml/saml2/idp/metadata.php`,
            {
                method: 'GET',
                // @ts-ignore - allow self-signed cert in tests
                rejectUnauthorized: false,
            }
        );

        expect(response.ok).toBe(true);
        const metadata = await response.text();
        expect(metadata).toContain('EntityDescriptor');
        expect(metadata).toContain('spain-saml');
    }, 10000);

    test.skip('should have Spain SAML IdP accessible', async () => {
        if (!process.env.RUN_LIVE_TESTS) {
            return;
        }

        const response = await fetch(`${SPAIN_SAML_URL}/simplesaml/`, {
            method: 'GET',
            // @ts-ignore
            rejectUnauthorized: false,
        });

        expect(response.ok).toBe(true);
    }, 10000);
});

