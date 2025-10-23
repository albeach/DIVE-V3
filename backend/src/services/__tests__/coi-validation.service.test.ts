/**
 * COI Validation Service Tests
 * 
 * Comprehensive tests for COI coherence validation
 * Tests all invariants and edge cases
 * 
 * Date: October 21, 2025
 */

import {
    validateCOICoherence,
    getAllowedCOIs,
    getAllowedCountriesForCOIs,
    suggestCOIOperator
} from '../coi-validation.service';
import { MongoClient, Db } from 'mongodb';

describe('COI Validation Service', () => {
    let mongoClient: MongoClient;
    let db: Db;

    // Test database configuration
    const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
    const DB_NAME = process.env.MONGODB_DATABASE || 'dive_v3_test';

    // Static COI membership map for testing (matches coi-validation.service.ts)
    const COI_MEMBERSHIP_STATIC: Record<string, string[]> = {
        'US-ONLY': ['USA'],
        'CAN-US': ['CAN', 'USA'],
        'GBR-US': ['GBR', 'USA'],
        'FRA-US': ['FRA', 'USA'],
        'FVEY': ['USA', 'GBR', 'CAN', 'AUS', 'NZL'],
        'NATO': [
            'ALB', 'BEL', 'BGR', 'CAN', 'HRV', 'CZE', 'DNK', 'EST', 'FIN', 'FRA',
            'DEU', 'GBR', 'GRC', 'HUN', 'ISL', 'ITA', 'LVA', 'LTU', 'LUX', 'MNE', 'NLD',
            'MKD', 'NOR', 'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'ESP', 'SWE', 'TUR', 'USA'
        ],
        'NATO-COSMIC': [
            'ALB', 'BEL', 'BGR', 'CAN', 'HRV', 'CZE', 'DNK', 'EST', 'FIN', 'FRA',
            'DEU', 'GBR', 'GRC', 'HUN', 'ISL', 'ITA', 'LVA', 'LTU', 'LUX', 'MNE', 'NLD',
            'MKD', 'NOR', 'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'ESP', 'SWE', 'TUR', 'USA'
        ],
        'EU-RESTRICTED': [
            'AUT', 'BEL', 'BGR', 'HRV', 'CYP', 'CZE', 'DNK', 'EST', 'FIN', 'FRA',
            'DEU', 'GRC', 'HUN', 'IRL', 'ITA', 'LVA', 'LTU', 'LUX', 'MLT', 'NLD',
            'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'ESP', 'SWE'
        ],
        'AUKUS': ['AUS', 'GBR', 'USA'],
        'QUAD': ['USA', 'AUS', 'IND', 'JPN'],
        'NORTHCOM': ['USA', 'CAN', 'MEX'],
        'EUCOM': ['USA', 'DEU', 'GBR', 'FRA', 'ITA', 'ESP', 'POL'],
        'PACOM': ['USA', 'JPN', 'KOR', 'AUS', 'NZL', 'PHL'],
        'CENTCOM': ['USA', 'SAU', 'ARE', 'QAT', 'KWT', 'BHR', 'JOR', 'EGY'],
        'SOCOM': ['USA', 'GBR', 'CAN', 'AUS', 'NZL']
    };

    beforeAll(async () => {
        // Set environment variables for services to use same test database
        process.env.MONGODB_DATABASE = DB_NAME;
        process.env.MONGODB_URL = MONGO_URI;

        // Connect to test database
        mongoClient = new MongoClient(MONGO_URI);
        await mongoClient.connect();
        db = mongoClient.db(DB_NAME);

        // Seed required COI keys for tests (use bulkWrite with upsert to avoid duplicates)
        const coiKeys = Object.keys(COI_MEMBERSHIP_STATIC).map(coiId => ({
            coiId,
            name: coiId,
            description: `COI: ${coiId}`,
            memberCountries: COI_MEMBERSHIP_STATIC[coiId],
            status: 'active',
            color: '#6B7280',
            icon: '🔑',
            resourceCount: 0,
            algorithm: 'AES-256-GCM',
            keyVersion: 1,
            createdAt: new Date(),
            updatedAt: new Date()
        }));

        // Use bulkWrite with upsert to handle existing keys gracefully
        const bulkOps = coiKeys.map(key => ({
            updateOne: {
                filter: { coiId: key.coiId },
                update: { $set: key },
                upsert: true
            }
        }));
        
        await db.collection('coi_keys').bulkWrite(bulkOps);
    });

    afterAll(async () => {
        // Don't delete COI keys - they may be used by other tests
        // The test database will be cleaned between full test runs
        await mongoClient.close();
    });

    // ============================================
    // INVARIANT 1: Mutual Exclusivity
    // ============================================

    describe('Mutual Exclusivity', () => {
        test('US-ONLY cannot be combined with CAN-US', async () => {
            const result = await validateCOICoherence({
                classification: 'SECRET',
                releasabilityTo: ['USA', 'CAN'],
                COI: ['US-ONLY', 'CAN-US'],
                coiOperator: 'ALL'
            });

            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(
                expect.stringContaining('US-ONLY')
            );
            expect(result.errors).toContainEqual(
                expect.stringContaining('CAN-US')
            );
        });

        test('US-ONLY cannot be combined with FVEY', async () => {
            const result = await validateCOICoherence({
                classification: 'SECRET',
                releasabilityTo: ['USA'],
                COI: ['US-ONLY', 'FVEY'],
                coiOperator: 'ALL'
            });

            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(
                expect.stringContaining('US-ONLY')
            );
            expect(result.errors).toContainEqual(
                expect.stringContaining('FVEY')
            );
        });

        test('EU-RESTRICTED cannot be combined with NATO-COSMIC', async () => {
            const result = await validateCOICoherence({
                classification: 'SECRET',
                releasabilityTo: ['FRA', 'DEU'],
                COI: ['EU-RESTRICTED', 'NATO-COSMIC'],
                coiOperator: 'ALL'
            });

            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(
                expect.stringContaining('EU-RESTRICTED')
            );
            expect(result.errors).toContainEqual(
                expect.stringContaining('NATO-COSMIC')
            );
        });

        test('EU-RESTRICTED cannot be combined with US-ONLY', async () => {
            const result = await validateCOICoherence({
                classification: 'SECRET',
                releasabilityTo: ['FRA'],
                COI: ['EU-RESTRICTED', 'US-ONLY'],
                coiOperator: 'ALL'
            });

            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(
                expect.stringContaining('EU-RESTRICTED')
            );
            expect(result.errors).toContainEqual(
                expect.stringContaining('US-ONLY')
            );
        });
    });

    // ============================================
    // INVARIANT 2: Subset/Superset (ANY operator)
    // ============================================

    describe('Subset/Superset with ANY operator', () => {
        test('CAN-US + FVEY invalid with ANY operator', async () => {
            const result = await validateCOICoherence({
                classification: 'SECRET',
                releasabilityTo: ['USA', 'CAN'],
                COI: ['CAN-US', 'FVEY'],
                coiOperator: 'ANY'
            });

            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(
                expect.stringContaining('Subset+superset COIs [CAN-US, FVEY]')
            );
        });

        test('GBR-US + FVEY invalid with ANY operator', async () => {
            const result = await validateCOICoherence({
                classification: 'SECRET',
                releasabilityTo: ['USA', 'GBR'],
                COI: ['GBR-US', 'FVEY'],
                coiOperator: 'ANY'
            });

            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(
                expect.stringContaining('Subset+superset COIs [GBR-US, FVEY]')
            );
        });

        test('AUKUS + FVEY invalid with ANY operator', async () => {
            const result = await validateCOICoherence({
                classification: 'SECRET',
                releasabilityTo: ['AUS', 'GBR', 'USA'],
                COI: ['AUKUS', 'FVEY'],
                coiOperator: 'ANY'
            });

            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(
                expect.stringContaining('Subset+superset COIs [AUKUS, FVEY]')
            );
        });

        test('NATO-COSMIC + NATO invalid with ANY operator', async () => {
            const result = await validateCOICoherence({
                classification: 'TOP_SECRET',
                releasabilityTo: ['USA', 'GBR', 'FRA'],
                COI: ['NATO-COSMIC', 'NATO'],
                coiOperator: 'ANY'
            });

            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(
                expect.stringContaining('Subset+superset COIs [NATO-COSMIC, NATO]')
            );
        });

        test('CAN-US + FVEY with ALL operator requires intersection', async () => {
            const result = await validateCOICoherence({
                classification: 'SECRET',
                releasabilityTo: ['USA', 'CAN'],
                COI: ['CAN-US', 'FVEY'],
                coiOperator: 'ALL'
            });

            // With ALL operator, releasability must be subset of BOTH COI memberships
            // CAN-US: {CAN, USA}, FVEY: {USA, GBR, CAN, AUS, NZL}
            // Intersection: {CAN, USA}
            // REL TO {USA, CAN} is valid (subset of intersection)
            expect(result.valid).toBe(true);
        });
    });

    // ============================================
    // INVARIANT 3: Releasability ⊆ COI Membership
    // ============================================

    describe('Releasability Alignment', () => {
        test('COI=CAN-US requires REL TO ⊆ {CAN, USA}', async () => {
            const result = await validateCOICoherence({
                classification: 'SECRET',
                releasabilityTo: ['USA', 'CAN', 'GBR'], // GBR not in CAN-US
                COI: ['CAN-US'],
                coiOperator: 'ALL'
            });

            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(
                expect.stringMatching(/Releasability countries \[GBR\] not in COI union/)
            );
        });

        test('COI=FVEY requires REL TO ⊆ {USA, GBR, CAN, AUS, NZL}', async () => {
            const result = await validateCOICoherence({
                classification: 'SECRET',
                releasabilityTo: ['USA', 'GBR', 'FRA'], // FRA not in FVEY
                COI: ['FVEY'],
                coiOperator: 'ALL'
            });

            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(
                expect.stringMatching(/Releasability countries \[FRA\] not in COI union/)
            );
        });

        test('COI=US-ONLY requires REL TO = {USA}', async () => {
            const result = await validateCOICoherence({
                classification: 'SECRET',
                releasabilityTo: ['USA', 'CAN'], // CAN not allowed
                COI: ['US-ONLY'],
                coiOperator: 'ALL'
            });

            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(
                expect.stringMatching(/Releasability countries \[CAN\] not in COI union/)
            );
        });

        test('Valid: COI=FVEY with REL TO ⊆ FVEY members', async () => {
            const result = await validateCOICoherence({
                classification: 'SECRET',
                releasabilityTo: ['USA', 'GBR', 'CAN'],
                COI: ['FVEY'],
                coiOperator: 'ALL'
            });

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });
    });

    // ============================================
    // INVARIANT 4: Caveat Enforcement (NOFORN)
    // ============================================

    describe('NOFORN Caveat Enforcement', () => {
        test('NOFORN requires COI=[US-ONLY]', async () => {
            const result = await validateCOICoherence({
                classification: 'SECRET',
                releasabilityTo: ['USA'],
                COI: ['CAN-US'],
                coiOperator: 'ALL',
                caveats: ['NOFORN']
            });

            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(
                expect.stringContaining('NOFORN caveat requires COI=[US-ONLY]')
            );
        });

        test('NOFORN requires REL TO=[USA]', async () => {
            const result = await validateCOICoherence({
                classification: 'SECRET',
                releasabilityTo: ['USA', 'CAN'],
                COI: ['US-ONLY'],
                coiOperator: 'ALL',
                caveats: ['NOFORN']
            });

            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(
                expect.stringContaining('NOFORN caveat requires releasabilityTo=[USA]')
            );
        });

        test('Valid: NOFORN with US-ONLY and REL USA', async () => {
            const result = await validateCOICoherence({
                classification: 'SECRET',
                releasabilityTo: ['USA'],
                COI: ['US-ONLY'],
                coiOperator: 'ALL',
                caveats: ['NOFORN']
            });

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });
    });

    // ============================================
    // INVARIANT 5: Empty Releasability
    // ============================================

    describe('Empty Releasability', () => {
        test('Empty releasabilityTo is invalid', async () => {
            const result = await validateCOICoherence({
                classification: 'SECRET',
                releasabilityTo: [],
                COI: ['FVEY'],
                coiOperator: 'ALL'
            });

            expect(result.valid).toBe(false);
            expect(result.errors).toContainEqual(
                expect.stringContaining('Empty releasabilityTo')
            );
        });
    });

    // ============================================
    // Helper Functions
    // ============================================

    describe('getAllowedCOIs', () => {
        test('Returns all COIs when none selected', async () => {
            const allowed = await getAllowedCOIs([]);
            expect(allowed.length).toBeGreaterThan(10);
            expect(allowed).toContain('FVEY');
            expect(allowed).toContain('NATO');
        });

        test('Excludes foreign-sharing COIs when US-ONLY selected', async () => {
            const allowed = await getAllowedCOIs(['US-ONLY']);
            expect(allowed).not.toContain('CAN-US');
            expect(allowed).not.toContain('FVEY');
            expect(allowed).not.toContain('NATO');
        });

        test('Excludes US-ONLY when CAN-US selected', async () => {
            const allowed = await getAllowedCOIs(['CAN-US']);
            expect(allowed).not.toContain('US-ONLY');
        });

        test('Excludes NATO-COSMIC when EU-RESTRICTED selected', async () => {
            const allowed = await getAllowedCOIs(['EU-RESTRICTED']);
            expect(allowed).not.toContain('NATO-COSMIC');
            expect(allowed).not.toContain('US-ONLY');
        });
    });

    describe('getAllowedCountriesForCOIs', () => {
        test('Returns FVEY members for FVEY COI', async () => {
            const countries = await getAllowedCountriesForCOIs(['FVEY']);
            expect(countries).toContain('USA');
            expect(countries).toContain('GBR');
            expect(countries).toContain('CAN');
            expect(countries).toContain('AUS');
            expect(countries).toContain('NZL');
            expect(countries).not.toContain('FRA');
        });

        test('Returns USA for US-ONLY COI', async () => {
            const countries = await getAllowedCountriesForCOIs(['US-ONLY']);
            expect(countries).toEqual(['USA']);
        });

        test('Returns union for multiple COIs', async () => {
            const countries = await getAllowedCountriesForCOIs(['CAN-US', 'GBR-US']);
            expect(countries).toContain('USA');
            expect(countries).toContain('CAN');
            expect(countries).toContain('GBR');
            expect(countries.length).toBe(3);
        });

        test('Returns empty for no COIs', async () => {
            const countries = await getAllowedCountriesForCOIs([]);
            expect(countries).toEqual([]);
        });
    });

    describe('suggestCOIOperator', () => {
        test('Suggests ALL for no COIs', async () => {
            const { operator, reason } = suggestCOIOperator([]);
            expect(operator).toBe('ALL');
            expect(reason).toContain('no COIs selected');
        });

        test('Suggests ALL for single COI', async () => {
            const { operator, reason } = suggestCOIOperator(['FVEY']);
            expect(operator).toBe('ALL');
            expect(reason).toContain('Single COI');
        });

        test('Suggests ALL for subset+superset pairs', async () => {
            const { operator, reason } = suggestCOIOperator(['CAN-US', 'FVEY']);
            expect(operator).toBe('ALL');
            expect(reason).toContain('subset+superset');
            expect(reason).toContain('prevent widening');
        });

        test('Suggests ALL (safer) for multiple independent COIs', async () => {
            const { operator, reason } = suggestCOIOperator(['NATO', 'QUAD']);
            expect(operator).toBe('ALL');
            expect(reason).toContain('Recommended');
        });
    });

    // ============================================
    // Complex Scenarios
    // ============================================

    describe('Complex Valid Scenarios', () => {
        test('Valid: NATO with subset of NATO countries', async () => {
            const result = await validateCOICoherence({
                classification: 'SECRET',
                releasabilityTo: ['USA', 'GBR', 'FRA', 'DEU'],
                COI: ['NATO'],
                coiOperator: 'ALL'
            });

            expect(result.valid).toBe(true);
        });

        test('Valid: AUKUS with all AUKUS members', async () => {
            const result = await validateCOICoherence({
                classification: 'SECRET',
                releasabilityTo: ['AUS', 'GBR', 'USA'],
                COI: ['AUKUS'],
                coiOperator: 'ALL'
            });

            expect(result.valid).toBe(true);
        });

        test('Valid: Multiple COIs with ALL operator (intersection)', async () => {
            const result = await validateCOICoherence({
                classification: 'SECRET',
                releasabilityTo: ['USA', 'GBR', 'CAN'],
                COI: ['FVEY', 'NATO'],
                coiOperator: 'ALL'
            });

            expect(result.valid).toBe(true);
        });
    });

    describe('Complex Invalid Scenarios', () => {
        test('Invalid: Multiple violations at once', async () => {
            const result = await validateCOICoherence({
                classification: 'SECRET',
                releasabilityTo: ['USA', 'FRA', 'KOR'], // KOR not in US-ONLY
                COI: ['US-ONLY', 'FVEY'], // Mutual exclusivity violation
                coiOperator: 'ANY', // Subset+superset violation
                caveats: ['NOFORN'] // Caveat violation
            });

            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(2);
        });

        test('Invalid: Nonsensical combo from audit example', async () => {
            const result = await validateCOICoherence({
                classification: 'CONFIDENTIAL',
                releasabilityTo: ['NOR', 'SVN', 'EST', 'KOR'],
                COI: ['CAN-US', 'US-ONLY', 'EU-RESTRICTED'],
                coiOperator: 'ANY'
            });

            expect(result.valid).toBe(false);
            // Should have multiple violations (at least 3)
            expect(result.errors.length).toBeGreaterThanOrEqual(3);
        });
    });
});

