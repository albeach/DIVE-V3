/**
 * Authorization E2E Tests - 10 NATO Countries
 * Phase 5 Task 5.3: Comprehensive E2E Test Suite
 * 
 * Tests authorization decisions across all 10 NATO nations with various
 * clearance levels, classifications, and releasability scenarios.
 * 
 * Countries tested:
 * - USA, Spain (ESP), France (FRA), UK (GBR), Germany (DEU)
 * - Italy (ITA), Netherlands (NLD), Poland (POL), Canada (CAN), Industry
 * 
 * NOTE: These tests require seeded test database with specific resource IDs.
 * Tests skip gracefully when resources are not available.
 */

import request from 'supertest';
import app from '../../server';
import { createE2EJWT } from '../helpers/mock-jwt-rs256';
import { mockKeycloakJWKS, cleanupJWKSMock } from '../helpers/mock-jwks';
import { mockOPAServer, cleanupOPAMock } from '../helpers/mock-opa-server';

// MongoDB is ALWAYS available via MongoDB Memory Server (globalSetup)
// No need for conditional test suites anymore!

describe('Authorization E2E Tests - 10 Countries (requires seeded database)', () => {
    // Mock Keycloak JWKS endpoint and OPA server before all tests
    beforeAll(async () => {
        await mockKeycloakJWKS();
        mockOPAServer();            // Mock OPA for authorization decisions
    });

    // Cleanup mocks after all tests
    afterAll(() => {
        cleanupJWKSMock();
        cleanupOPAMock();
    });

    describe('USA Authorization Scenarios', () => {
        it('should allow USA TOP_SECRET user to access SECRET resource', async () => {
            const token = await generateTestJWT({
                uniqueID: 'alice.general@af.mil',
                clearance: 'TOP_SECRET',
                countryOfAffiliation: 'USA',
                acpCOI: ['US-ONLY']  // Match the resource's COI requirement
            });

            const response = await request(app)
                .get('/api/resources/test-secret-usa')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('resourceId');
        });

        it('should deny USA CONFIDENTIAL user to access SECRET resource', async () => {
            const token = await generateTestJWT({
                uniqueID: 'jane.smith@af.mil',
                clearance: 'CONFIDENTIAL',
                countryOfAffiliation: 'USA',
                acpCOI: ['US-ONLY']  // Has COI but insufficient clearance
            });

            const response = await request(app)
                .get('/api/resources/test-secret-usa')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(403);
            expect(response.body.reason).toContain('clearance');
        });

        it('should allow USA UNCLASSIFIED user to access UNCLASSIFIED resource', async () => {
            const token = await generateTestJWT({
                uniqueID: 'bob.contractor@contractor.com',
                clearance: 'UNCLASSIFIED',
                countryOfAffiliation: 'USA',
                acpCOI: []  // UNCLASSIFIED resource has no COI requirement
            });

            const response = await request(app)
                .get('/api/resources/test-unclassified-doc')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('resourceId');
        });
    });

    describe('Spain (ESP) Authorization Scenarios', () => {
        it('should allow ESP SECRETO user to access SECRET resource (classification equivalency)', async () => {
            const token = await generateTestJWT({
                uniqueID: 'carlos.garcia@mde.es',
                clearance: 'SECRET',  // SECRETO maps to SECRET (normalized)
                clearanceOriginal: 'SECRETO',
                clearanceCountry: 'ESP',
                countryOfAffiliation: 'ESP',
                acpCOI: ['NATO']  // Match NATO resource COI
            });

            const response = await request(app)
                .get('/api/resources/test-secret-nato')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('resourceId');
        });

        it('should deny ESP user to access USA-only resource', async () => {
            const token = await generateTestJWT({
                uniqueID: 'maria.lopez@mde.es',
                clearance: 'SECRET',  // Has sufficient clearance
                clearanceOriginal: 'SECRETO',
                clearanceCountry: 'ESP',
                countryOfAffiliation: 'ESP',  // But wrong country
                acpCOI: ['US-ONLY']  // Even with COI, wrong country
            });

            const response = await request(app)
                .get('/api/resources/test-secret-usa')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(403);
            expect(response.body.reason).toContain('releasability');
        });

        it('should allow ESP ALTO_SECRETO user to access SECRET NATO resource (higher clearance)', async () => {
            const token = await generateTestJWT({
                uniqueID: 'isabel.general@mde.es',
                clearance: 'TOP_SECRET',  // ALTO_SECRETO maps to TOP_SECRET
                clearanceOriginal: 'ALTO SECRETO',
                clearanceCountry: 'ESP',
                countryOfAffiliation: 'ESP',
                acpCOI: ['NATO']  // Match NATO resource COI
            });

            const response = await request(app)
                .get('/api/resources/test-secret-nato')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('resourceId');
        });
    });

    describe('France (FRA) Authorization Scenarios', () => {
        it('should allow FRA SECRET_DEFENSE user to access SECRET resource', async () => {
            const token = await generateTestJWT({
                uniqueID: 'jean.dupont@defense.gouv.fr',
                clearance: 'SECRET',  // SECRET_DEFENSE maps to SECRET
                clearanceOriginal: 'SECRET DÉFENSE',
                clearanceCountry: 'FRA',
                countryOfAffiliation: 'FRA',
                acpCOI: ['NATO']  // Match NATO resource COI
            });

            const response = await request(app)
                .get('/api/resources/test-secret-nato')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('resourceId');
        });

        it('should deny FRA CONFIDENTIEL_DEFENSE user to access SECRET resource', async () => {
            const token = await generateTestJWT({
                uniqueID: 'marie.martin@defense.gouv.fr',
                clearance: 'CONFIDENTIAL',  // CONFIDENTIEL_DEFENSE maps to CONFIDENTIAL
                clearanceOriginal: 'CONFIDENTIEL DÉFENSE',
                clearanceCountry: 'FRA',
                countryOfAffiliation: 'FRA',
                acpCOI: ['NATO']  // Has COI but insufficient clearance
            });

            const response = await request(app)
                .get('/api/resources/test-secret-nato')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(403);
            expect(response.body.reason).toContain('clearance');
        });
    });

    describe('UK (GBR) Authorization Scenarios', () => {
        it('should allow GBR user with FVEY COI to access FVEY resource', async () => {
            const token = await generateTestJWT({
                uniqueID: 'james.smith@mod.uk',
                clearance: 'SECRET',
                clearanceOriginal: 'SECRET',
                clearanceCountry: 'GBR',
                countryOfAffiliation: 'GBR',
                acpCOI: ['FVEY']
            });

            const response = await request(app)
                .get('/api/resources/test-secret-fvey')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('resourceId');
        });

        it('should deny GBR user without FVEY COI to access FVEY-only resource', async () => {
            const token = await generateTestJWT({
                uniqueID: 'sarah.jones@mod.uk',
                clearance: 'SECRET',
                clearanceOriginal: 'SECRET',
                clearanceCountry: 'GBR',
                countryOfAffiliation: 'GBR',
                acpCOI: ['NATO-COSMIC']  // Has NATO but not FVEY
            });

            const response = await request(app)
                .get('/api/resources/test-secret-fvey-only')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(403);
            expect(response.body.reason).toContain('COI');
        });
    });

    describe('Germany (DEU) Authorization Scenarios', () => {
        it('should allow DEU GEHEIM user to access SECRET NATO resource', async () => {
            const token = await generateTestJWT({
                uniqueID: 'hans.mueller@bundeswehr.de',
                clearance: 'SECRET',  // GEHEIM maps to SECRET
                clearanceOriginal: 'GEHEIM',
                clearanceCountry: 'DEU',
                countryOfAffiliation: 'DEU',
                acpCOI: ['NATO']  // Match NATO resource COI
            });

            const response = await request(app)
                .get('/api/resources/test-secret-nato')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('resourceId');
        });

        it('should deny DEU user to access USA-GBR bilateral resource', async () => {
            const token = await generateTestJWT({
                uniqueID: 'petra.schmidt@bundeswehr.de',
                clearance: 'SECRET',  // GEHEIM maps to SECRET
                clearanceOriginal: 'GEHEIM',
                clearanceCountry: 'DEU',
                countryOfAffiliation: 'DEU',  // Wrong country
                acpCOI: ['GBR-US']  // Even with COI, wrong country
            });

            const response = await request(app)
                .get('/api/resources/test-secret-usa-gbr-only')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(403);
            expect(response.body.reason).toContain('releasability');
        });
    });

    describe('Canada (CAN) Authorization Scenarios', () => {
        it('should allow CAN user with FVEY COI to access FVEY resource', async () => {
            const token = await generateTestJWT({
                uniqueID: 'john.macdonald@forces.gc.ca',
                clearance: 'SECRET',
                clearanceOriginal: 'SECRET',
                clearanceCountry: 'CAN',
                countryOfAffiliation: 'CAN',
                acpCOI: ['FVEY']
            });

            const response = await request(app)
                .get('/api/resources/test-secret-fvey')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('resourceId');
        });

        it('should allow CAN user to access FVEY resource (bilateral equivalent)', async () => {
            const token = await generateTestJWT({
                uniqueID: 'sarah.tremblay@forces.gc.ca',
                clearance: 'SECRET',
                clearanceOriginal: 'SECRET',
                clearanceCountry: 'CAN',
                countryOfAffiliation: 'CAN',
                acpCOI: ['FVEY']  // CAN is part of FVEY
            });

            const response = await request(app)
                .get('/api/resources/test-secret-fvey')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('resourceId');
        });
    });

    describe('Italy (ITA), Netherlands (NLD), Poland (POL) Authorization Scenarios', () => {
        it('should allow ITA SEGRETO user to access SECRET NATO resource', async () => {
            const token = await generateTestJWT({
                uniqueID: 'marco.rossi@difesa.it',
                clearance: 'SECRET',  // SEGRETO maps to SECRET
                clearanceOriginal: 'SEGRETO',
                clearanceCountry: 'ITA',
                countryOfAffiliation: 'ITA',
                acpCOI: ['NATO']  // Match NATO resource COI
            });

            const response = await request(app)
                .get('/api/resources/test-secret-nato')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('resourceId');
        });

        it('should allow NLD GEHEIM user to access SECRET NATO resource', async () => {
            const token = await generateTestJWT({
                uniqueID: 'jan.devries@mindef.nl',
                clearance: 'SECRET',  // GEHEIM maps to SECRET
                clearanceOriginal: 'GEHEIM',
                clearanceCountry: 'NLD',
                countryOfAffiliation: 'NLD',
                acpCOI: ['NATO']  // Match NATO resource COI
            });

            const response = await request(app)
                .get('/api/resources/test-secret-nato')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('resourceId');
        });

        it('should allow POL TAJNE user to access SECRET NATO resource', async () => {
            const token = await generateTestJWT({
                uniqueID: 'piotr.kowalski@mon.gov.pl',
                clearance: 'SECRET',  // TAJNE maps to SECRET
                clearanceOriginal: 'TAJNE',
                clearanceCountry: 'POL',
                countryOfAffiliation: 'POL',
                acpCOI: ['NATO']  // Match NATO resource COI
            });

            const response = await request(app)
                .get('/api/resources/test-secret-nato')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('resourceId');
        });
    });

    describe('Industry User Authorization Scenarios', () => {
        it('should allow industry user to access UNCLASSIFIED public resource', async () => {
            const token = await generateTestJWT({
                uniqueID: 'bob.contractor@contractor.com',
                clearance: 'UNCLASSIFIED',
                countryOfAffiliation: 'USA',  // Enriched from email domain
                acpCOI: []  // UNCLASSIFIED resource has no COI requirement
            });

            const response = await request(app)
                .get('/api/resources/test-unclassified-doc')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('resourceId');
        });

        it('should deny industry user to access SECRET resource', async () => {
            const token = await generateTestJWT({
                uniqueID: 'contractor@company.com',
                clearance: 'CONFIDENTIAL',  // Insufficient clearance
                countryOfAffiliation: 'USA',
                acpCOI: ['NATO']  // Has COI but insufficient clearance
            });

            const response = await request(app)
                .get('/api/resources/test-secret-nato')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(403);
            expect(response.body.reason).toContain('clearance');
        });
    });

    describe('Complex Authorization Scenarios', () => {
        it('should handle multiple COI memberships correctly', async () => {
            const token = await generateTestJWT({
                uniqueID: 'multi.coi@af.mil',
                clearance: 'TOP_SECRET',
                countryOfAffiliation: 'USA',
                acpCOI: ['FVEY', 'NATO', 'US-ONLY']  // Multiple COI memberships
            });

            // Should access FVEY resource
            const response1 = await request(app)
                .get('/api/resources/test-secret-fvey')
                .set('Authorization', `Bearer ${token}`);
            expect(response1.status).toBe(200);

            // Should access NATO resource
            const response2 = await request(app)
                .get('/api/resources/test-secret-nato')
                .set('Authorization', `Bearer ${token}`);
            expect(response2.status).toBe(200);

            // Should access US-ONLY resource
            const response3 = await request(app)
                .get('/api/resources/test-top-secret-restricted')
                .set('Authorization', `Bearer ${token}`);
            expect(response3.status).toBe(200);
        });

        it('should enforce strict releasability across all countries', async () => {
            const countries = [
                { code: 'USA', user: 'test.usa@af.mil' },
                { code: 'ESP', user: 'test.esp@mde.es' },
                { code: 'FRA', user: 'test.fra@defense.gouv.fr' },
                { code: 'GBR', user: 'test.gbr@mod.uk' },
                { code: 'DEU', user: 'test.deu@bundeswehr.de' }
            ];

            for (const country of countries) {
                const token = await generateTestJWT({
                    uniqueID: country.user,
                    clearance: 'SECRET',
                    countryOfAffiliation: country.code,
                    acpCOI: ['GBR-US']  // All have COI, releasability is the differentiator
                });

                // Resource releasable only to USA and GBR
                const response = await request(app)
                    .get('/api/resources/test-secret-usa-gbr-only')
                    .set('Authorization', `Bearer ${token}`);

                if (country.code === 'USA' || country.code === 'GBR') {
                    expect(response.status).toBe(200);
                } else {
                    expect(response.status).toBe(403);
                    expect(response.body.reason).toContain('releasability');
                }
            }
        });
    });
});

// Helper function to generate test JWT tokens - uses RS256 signing for E2E tests
async function generateTestJWT(claims: any): Promise<string> {
    // Use the RS256 JWT generation logic for production-like testing
    return createE2EJWT(claims);
}

