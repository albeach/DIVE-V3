/**
 * Clearance SSOT Cross-File Consistency Tests
 *
 * Verifies that all clearance mapping consumers remain consistent
 * with the canonical CLEARANCE_EQUIVALENCY_TABLE in clearance-mapper.service.ts.
 */

import { CLEARANCE_EQUIVALENCY_TABLE, IClearanceMapping } from '../services/clearance-mapper.service';
import { getClearanceLevel, StandardClearance } from '../services/clearance-normalization.service';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const STANDARD_LEVELS = ['UNCLASSIFIED', 'RESTRICTED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];

describe('Clearance SSOT Consistency', () => {
    // ── SSOT Table Structure ──────────────────────────────────────────────

    describe('SSOT Table Structure', () => {
        it('should have exactly 5 clearance levels', () => {
            expect(CLEARANCE_EQUIVALENCY_TABLE).toHaveLength(5);
            const levels = CLEARANCE_EQUIVALENCY_TABLE.map(e => e.standardLevel);
            expect(levels).toEqual(STANDARD_LEVELS);
        });

        it('should have every country at all 5 levels', () => {
            const countries = new Set<string>();
            for (const entry of CLEARANCE_EQUIVALENCY_TABLE) {
                for (const country of Object.keys(entry.nationalEquivalents)) {
                    countries.add(country);
                }
            }

            for (const country of countries) {
                for (const entry of CLEARANCE_EQUIVALENCY_TABLE) {
                    expect(entry.nationalEquivalents).toHaveProperty(
                        country,
                        expect.any(Array)
                    );
                }
            }
        });

        it('should have at least 32 countries (NATO members + partners)', () => {
            const countries = new Set<string>();
            for (const entry of CLEARANCE_EQUIVALENCY_TABLE) {
                for (const country of Object.keys(entry.nationalEquivalents)) {
                    countries.add(country);
                }
            }
            expect(countries.size).toBeGreaterThanOrEqual(32);
        });

        it('should have at least one variant per country per level', () => {
            for (const entry of CLEARANCE_EQUIVALENCY_TABLE) {
                for (const [country, variants] of Object.entries(entry.nationalEquivalents)) {
                    expect(variants.length).toBeGreaterThanOrEqual(1);
                }
            }
        });

        it('should not have duplicate variants within the same level', () => {
            for (const entry of CLEARANCE_EQUIVALENCY_TABLE) {
                for (const [country, variants] of Object.entries(entry.nationalEquivalents)) {
                    const upperVariants = variants.map(v => v.toUpperCase());
                    const unique = new Set(upperVariants);
                    expect(unique.size).toBe(upperVariants.length);
                }
            }
        });
    });

    // ── Rank Consistency ──────────────────────────────────────────────────

    describe('Rank Consistency', () => {
        it('should have RESTRICTED rank = 1 in clearance-normalization.service', () => {
            expect(getClearanceLevel(StandardClearance.RESTRICTED)).toBe(1);
        });

        it('should have strictly ordered hierarchy (0 < 1 < 2 < 3 < 4)', () => {
            const expected = [
                { level: StandardClearance.UNCLASSIFIED, rank: 0 },
                { level: StandardClearance.RESTRICTED, rank: 1 },
                { level: StandardClearance.CONFIDENTIAL, rank: 2 },
                { level: StandardClearance.SECRET, rank: 3 },
                { level: StandardClearance.TOP_SECRET, rank: 4 },
            ];
            for (const { level, rank } of expected) {
                expect(getClearanceLevel(level)).toBe(rank);
            }
        });

        it('should have RESTRICTED rank = 1 in OPA classification.rego', () => {
            const regoPath = resolve(__dirname, '../../../policies/org/nato/classification.rego');
            const content = readFileSync(regoPath, 'utf-8');
            expect(content).toMatch(/"NATO_RESTRICTED":\s*1/);
        });

        it('should have all 5 NATO levels in OPA classification.rego', () => {
            const regoPath = resolve(__dirname, '../../../policies/org/nato/classification.rego');
            const content = readFileSync(regoPath, 'utf-8');
            expect(content).toMatch(/"NATO_UNCLASSIFIED":\s*0/);
            expect(content).toMatch(/"NATO_RESTRICTED":\s*1/);
            expect(content).toMatch(/"NATO_CONFIDENTIAL":\s*2/);
            expect(content).toMatch(/"NATO_SECRET":\s*3/);
            expect(content).toMatch(/"COSMIC_TOP_SECRET":\s*4/);
        });
    });

    // ── Generated OPA JSON ────────────────────────────────────────────────

    describe('Generated OPA JSON', () => {
        let opaData: Record<string, Record<string, string>>;

        beforeAll(() => {
            const opaPath = resolve(__dirname, '../../../policies/classification_equivalency/data.json');
            opaData = JSON.parse(readFileSync(opaPath, 'utf-8'));
        });

        it('should have country count matching SSOT (minus INDUSTRY, plus NATO)', () => {
            const ssotCountries = new Set<string>();
            for (const entry of CLEARANCE_EQUIVALENCY_TABLE) {
                for (const country of Object.keys(entry.nationalEquivalents)) {
                    if (country !== 'INDUSTRY') ssotCountries.add(country);
                }
            }
            ssotCountries.add('NATO'); // generator adds NATO pseudo-country
            expect(Object.keys(opaData).length).toBe(ssotCountries.size);
        });

        it('should include all SSOT countries (except INDUSTRY)', () => {
            for (const entry of CLEARANCE_EQUIVALENCY_TABLE) {
                for (const country of Object.keys(entry.nationalEquivalents)) {
                    if (country === 'INDUSTRY') continue;
                    expect(opaData).toHaveProperty(country);
                }
            }
        });

        it('should map all SSOT variants to correct NATO levels', () => {
            const DIVE_TO_NATO: Record<string, string> = {
                UNCLASSIFIED: 'NATO_UNCLASSIFIED',
                RESTRICTED: 'NATO_RESTRICTED',
                CONFIDENTIAL: 'NATO_CONFIDENTIAL',
                SECRET: 'NATO_SECRET',
                TOP_SECRET: 'COSMIC_TOP_SECRET',
            };

            for (const entry of CLEARANCE_EQUIVALENCY_TABLE) {
                const natoLevel = DIVE_TO_NATO[entry.standardLevel];
                for (const [country, variants] of Object.entries(entry.nationalEquivalents)) {
                    if (country === 'INDUSTRY') continue;
                    for (const variant of variants) {
                        expect(opaData[country]?.[variant]).toBe(natoLevel);
                    }
                }
            }
        });
    });

    // ── Generated National JSON ───────────────────────────────────────────

    describe('Generated National JSON', () => {
        let nationalData: Record<string, Record<string, string>>;

        beforeAll(() => {
            const natPath = resolve(__dirname, '../../../scripts/data/national-clearance-mappings.json');
            nationalData = JSON.parse(readFileSync(natPath, 'utf-8'));
        });

        it('should have country count matching SSOT', () => {
            const ssotCountries = new Set<string>();
            for (const entry of CLEARANCE_EQUIVALENCY_TABLE) {
                for (const country of Object.keys(entry.nationalEquivalents)) {
                    ssotCountries.add(country);
                }
            }
            expect(Object.keys(nationalData).length).toBe(ssotCountries.size);
        });

        it('should have all 5 levels for each country', () => {
            for (const [country, levels] of Object.entries(nationalData)) {
                for (const level of STANDARD_LEVELS) {
                    expect(levels).toHaveProperty(level);
                }
            }
        });

        it('should use first variant as canonical display label', () => {
            for (const entry of CLEARANCE_EQUIVALENCY_TABLE) {
                for (const [country, variants] of Object.entries(entry.nationalEquivalents)) {
                    expect(nationalData[country]?.[entry.standardLevel]).toBe(variants[0]);
                }
            }
        });
    });

    // ── KAS Static Fallback ───────────────────────────────────────────────

    describe('KAS Static Fallback', () => {
        it('should exist in kas/src/server.ts as defense-in-depth', () => {
            const kasPath = resolve(__dirname, '../../../kas/src/server.ts');
            const content = readFileSync(kasPath, 'utf-8');
            expect(content).toContain('CLEARANCE_NORMALIZATION_MAP');
            // Verify the static fallback covers all 5 standard levels
            for (const level of STANDARD_LEVELS) {
                expect(content).toContain(`'${level}'`);
            }
        });

        it('should have MongoDB loader function', () => {
            const kasPath = resolve(__dirname, '../../../kas/src/server.ts');
            const content = readFileSync(kasPath, 'utf-8');
            expect(content).toContain('loadClearanceMappingsFromMongoDB');
        });
    });

    // ── OPA Default Fallback ──────────────────────────────────────────────

    describe('OPA Default Fallback', () => {
        it('should have default_classification_equivalency covering FVEY countries', () => {
            const regoPath = resolve(__dirname, '../../../policies/org/nato/classification.rego');
            const content = readFileSync(regoPath, 'utf-8');
            // FVEY countries in fallback
            for (const country of ['USA', 'GBR', 'CAN', 'NZL']) {
                expect(content).toMatch(new RegExp(`"${country}":\\s*\\{`));
            }
        });

        it('should prefer OPAL data over defaults', () => {
            const regoPath = resolve(__dirname, '../../../policies/org/nato/classification.rego');
            const content = readFileSync(regoPath, 'utf-8');
            expect(content).toContain('data.classification_equivalency');
            expect(content).toContain('default_classification_equivalency');
        });
    });

    // ── Security-Critical Mappings ────────────────────────────────────────

    describe('Security-Critical Mappings', () => {
        function findMapping(country: string, variant: string): string | undefined {
            for (const entry of CLEARANCE_EQUIVALENCY_TABLE) {
                const variants = entry.nationalEquivalents[country];
                if (variants?.some(v => v.toUpperCase() === variant.toUpperCase())) {
                    return entry.standardLevel;
                }
            }
            return undefined;
        }

        it('should map DIFFUSION_RESTREINTE (FRA) to RESTRICTED', () => {
            expect(findMapping('FRA', 'DIFFUSION RESTREINTE')).toBe('RESTRICTED');
        });

        it('should map VS_NUR_FUER_DEN_DIENSTGEBRAUCH (DEU) to RESTRICTED', () => {
            expect(findMapping('DEU', 'VS-NUR FÜR DEN DIENSTGEBRAUCH')).toBe('RESTRICTED');
        });

        it('should map OFFICIAL_SENSITIVE (GBR) to RESTRICTED', () => {
            expect(findMapping('GBR', 'OFFICIAL-SENSITIVE')).toBe('RESTRICTED');
        });

        it('should map OFFICIAL (GBR) to RESTRICTED', () => {
            expect(findMapping('GBR', 'OFFICIAL')).toBe('RESTRICTED');
        });

        it('should require MFA for CONFIDENTIAL and above', () => {
            for (const entry of CLEARANCE_EQUIVALENCY_TABLE) {
                if (['CONFIDENTIAL', 'SECRET', 'TOP_SECRET'].includes(entry.standardLevel)) {
                    expect(entry.mfaRequired).toBe(true);
                }
            }
        });

        it('should not require MFA for UNCLASSIFIED and RESTRICTED', () => {
            for (const entry of CLEARANCE_EQUIVALENCY_TABLE) {
                if (['UNCLASSIFIED', 'RESTRICTED'].includes(entry.standardLevel)) {
                    expect(entry.mfaRequired).toBe(false);
                }
            }
        });
    });
});
