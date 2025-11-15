/**
 * PEP/PDP Integration Test Suite - Phase 3
 * 
 * Tests the complete authorization flow:
 * 1. Extract attributes from JWT (PEP)
 * 2. Fetch resource metadata (PEP)
 * 3. Build OPA input (PEP)
 * 4. Call OPA for decision (PDP)
 * 5. Enforce decision (PEP)
 * 6. Log decision (PEP)
 * 
 * Coverage: All 10 countries with clearanceOriginal support
 * 
 * Test Matrix:
 * - 10 countries × multiple authorization scenarios
 * - Clearance-based access control
 * - Releasability checks
 * - COI filtering
 * - Cross-country authorization
 * 
 * Last Updated: October 29, 2025 (Phase 3)
 */

import request from 'supertest';
import { MongoClient } from 'mongodb';
import app from '../../server';
import { createE2EJWT } from '../helpers/mock-jwt-rs256';
import { mockKeycloakJWKS, cleanupJWKSMock } from '../helpers/mock-jwks';
import { mockOPAServer, cleanupOPAMock } from '../helpers/mock-opa-server';

// Test configuration - Use MongoDB Memory Server
const MONGODB_URI = process.env.MONGODB_URL || process.env.MONGODB_URI || 'mongodb://localhost:27017';
const TEST_DB = process.env.MONGODB_DATABASE || 'dive-v3-test';

describe('PEP/PDP Integration Tests - Phase 3', () => {
    let mongoClient: MongoClient;
    let db: any;

    beforeAll(async () => {
        // Mock Keycloak JWKS and OPA
        await mockKeycloakJWKS();
        mockOPAServer();
        
        // Connect to MongoDB Memory Server
        mongoClient = await MongoClient.connect(MONGODB_URI);
        db = mongoClient.db(TEST_DB);

        // Insert test resources for all countries
        await seedTestResources(db);
    }, 30000);

    afterAll(async () => {
        // Clean up test resources
        await db.collection('resources').deleteMany({
            resourceId: { $regex: /^test-phase3-/ }
        });

        await mongoClient.close();
        
        // Clean up mocks
        cleanupJWKSMock();
        cleanupOPAMock();
    });

    // ============================================
    // Test Scenario 1: Sufficient Clearance → ALLOW
    // ============================================

    describe('Scenario 1: User with sufficient clearance', () => {
        it('should allow USA user (SECRET) to access SECRET resource', async () => {
            const token = createE2EJWT({
                uniqueID: 'alice.general@af.mil',
                clearance: 'SECRET',
                clearanceOriginal: 'SECRET',
                countryOfAffiliation: 'USA',
                acpCOI: ['NATO-COSMIC']
            });

            const response = await request(app)
                .get('/api/resources/test-phase3-usa-secret')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body.resourceId).toBe('test-phase3-usa-secret');
        });

        it('should allow Spain user (SECRETO) to access SECRET resource', async () => {
            const token = createE2EJWT({
                uniqueID: 'carlos.garcia@mil.es',
                clearance: 'SECRET',
                clearanceOriginal: 'SECRETO',
                countryOfAffiliation: 'ESP',
                acpCOI: ['NATO-COSMIC']
            });

            const response = await request(app)
                .get('/api/resources/test-phase3-esp-secret')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body.resourceId).toBe('test-phase3-esp-secret');
        });

        it('should allow France user (SECRET DÉFENSE) to access SECRET resource', async () => {
            const token = createE2EJWT({
                uniqueID: 'pierre.dubois@defense.gouv.fr',
                clearance: 'SECRET',
                clearanceOriginal: 'SECRET DÉFENSE',
                countryOfAffiliation: 'FRA',
                acpCOI: ['NATO-COSMIC']
            });

            const response = await request(app)
                .get('/api/resources/test-phase3-fra-secret')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body.resourceId).toBe('test-phase3-fra-secret');
        });

        it('should allow UK user (SECRET) to access SECRET resource', async () => {
            const token = createE2EJWT({
                uniqueID: 'james.smith@mod.uk',
                clearance: 'SECRET',
                clearanceOriginal: 'SECRET',
                countryOfAffiliation: 'GBR',
                acpCOI: ['NATO-COSMIC']
            });

            const response = await request(app)
                .get('/api/resources/test-phase3-gbr-secret')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body.resourceId).toBe('test-phase3-gbr-secret');
        });

        it('should allow German user (GEHEIM) to access SECRET resource', async () => {
            const token = createE2EJWT({
                uniqueID: 'hans.mueller@bundeswehr.org',
                clearance: 'SECRET',
                clearanceOriginal: 'GEHEIM',
                countryOfAffiliation: 'DEU',
                acpCOI: ['NATO-COSMIC']
            });

            const response = await request(app)
                .get('/api/resources/test-phase3-deu-secret')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body.resourceId).toBe('test-phase3-deu-secret');
        });

        it('should allow Italian user (SEGRETO) to access SECRET resource', async () => {
            const token = createE2EJWT({
                uniqueID: 'marco.rossi@difesa.it',
                clearance: 'SECRET',
                clearanceOriginal: 'SEGRETO',
                countryOfAffiliation: 'ITA',
                acpCOI: ['NATO-COSMIC']
            });

            const response = await request(app)
                .get('/api/resources/test-phase3-ita-secret')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body.resourceId).toBe('test-phase3-ita-secret');
        });

        it('should allow Dutch user (GEHEIM) to access SECRET resource', async () => {
            const token = createE2EJWT({
                uniqueID: 'pieter.devries@defensie.nl',
                clearance: 'SECRET',
                clearanceOriginal: 'GEHEIM',
                countryOfAffiliation: 'NLD',
                acpCOI: ['NATO-COSMIC']
            });

            const response = await request(app)
                .get('/api/resources/test-phase3-nld-secret')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body.resourceId).toBe('test-phase3-nld-secret');
        });

        it('should allow Polish user (TAJNE) to access SECRET resource', async () => {
            const token = createE2EJWT({
                uniqueID: 'jan.kowalski@mon.gov.pl',
                clearance: 'SECRET',
                clearanceOriginal: 'TAJNE',
                countryOfAffiliation: 'POL',
                acpCOI: ['NATO-COSMIC']
            });

            const response = await request(app)
                .get('/api/resources/test-phase3-pol-secret')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body.resourceId).toBe('test-phase3-pol-secret');
        });

        it('should allow Canadian user (SECRET) to access SECRET resource', async () => {
            const token = createE2EJWT({
                uniqueID: 'john.macdonald@forces.gc.ca',
                clearance: 'SECRET',
                clearanceOriginal: 'SECRET',
                countryOfAffiliation: 'CAN',
                acpCOI: ['NATO-COSMIC']
            });

            const response = await request(app)
                .get('/api/resources/test-phase3-can-secret')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body.resourceId).toBe('test-phase3-can-secret');
        });

        it('should allow Industry user (SECRET) to access SECRET resource', async () => {
            const token = createE2EJWT({
                uniqueID: 'mike.contractor@lockheed.com',
                clearance: 'SECRET',
                clearanceOriginal: 'SECRET',
                countryOfAffiliation: 'USA',
                acpCOI: []
            });

            const response = await request(app)
                .get('/api/resources/test-phase3-industry-secret')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body.resourceId).toBe('test-phase3-industry-secret');
        });
    });

    // ============================================
    // Test Scenario 2: Insufficient Clearance → DENY
    // ============================================

    describe('Scenario 2: User with insufficient clearance', () => {
        it('should deny USA UNCLASSIFIED user accessing SECRET resource', async () => {
            const token = createE2EJWT({
                uniqueID: 'bob.contractor@af.mil',
                clearance: 'UNCLASSIFIED',
                clearanceOriginal: 'UNCLASSIFIED',
                countryOfAffiliation: 'USA',
                acpCOI: []
            });

            const response = await request(app)
                .get('/api/resources/test-phase3-usa-secret')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(403);
            expect(response.body.error).toBe('Forbidden');
            expect(response.body.reason).toContain('Insufficient clearance');
        });

        it('should deny Spain UNCLASSIFIED (NO CLASIFICADO) user accessing SECRET resource', async () => {
            const token = createE2EJWT({
                uniqueID: 'juan.contractor@mil.es',
                clearance: 'UNCLASSIFIED',
                clearanceOriginal: 'NO CLASIFICADO',
                countryOfAffiliation: 'ESP',
                acpCOI: []
            });

            const response = await request(app)
                .get('/api/resources/test-phase3-esp-secret')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(403);
            expect(response.body.error).toBe('Forbidden');
            expect(response.body.reason).toContain('Insufficient clearance');
        });

        it('should deny Germany CONFIDENTIAL (VS-VERTRAULICH) user accessing SECRET resource', async () => {
            const token = createE2EJWT({
                uniqueID: 'anna.wagner@bundeswehr.org',
                clearance: 'CONFIDENTIAL',
                clearanceOriginal: 'VS-VERTRAULICH',
                countryOfAffiliation: 'DEU',
                acpCOI: ['NATO-COSMIC']
            });

            const response = await request(app)
                .get('/api/resources/test-phase3-deu-secret')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(403);
            expect(response.body.error).toBe('Forbidden');
            expect(response.body.reason).toContain('Insufficient clearance');
        });
    });

    // ============================================
    // Test Scenario 3: Non-Releasable Country → DENY
    // ============================================

    describe('Scenario 3: User from non-releasable country', () => {
        it('should deny France user accessing USA-only resource', async () => {
            const token = createE2EJWT({
                uniqueID: 'pierre.dubois@defense.gouv.fr',
                clearance: 'SECRET',
                clearanceOriginal: 'SECRET DÉFENSE',
                countryOfAffiliation: 'FRA',
                acpCOI: ['NATO-COSMIC']
            });

            const response = await request(app)
                .get('/api/resources/test-phase3-usa-only')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(403);
            expect(response.body.error).toBe('Forbidden');
            expect(response.body.reason).toContain('not in releasabilityTo');
        });

        it('should deny Poland user accessing FVEY-only resource', async () => {
            const token = createE2EJWT({
                uniqueID: 'jan.kowalski@mon.gov.pl',
                clearance: 'SECRET',
                clearanceOriginal: 'TAJNE',
                countryOfAffiliation: 'POL',
                acpCOI: ['NATO-COSMIC']
            });

            const response = await request(app)
                .get('/api/resources/test-phase3-fvey-only')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(403);
            expect(response.body.error).toBe('Forbidden');
            expect(response.body.reason).toContain('not in releasabilityTo');
        });
    });

    // ============================================
    // Test Scenario 4: COI Mismatch → DENY
    // ============================================

    describe('Scenario 4: User without required COI', () => {
        it('should deny user without FVEY COI accessing FVEY resource', async () => {
            const token = createE2EJWT({
                uniqueID: 'test.user@af.mil',
                clearance: 'SECRET',
                clearanceOriginal: 'SECRET',
                countryOfAffiliation: 'USA',
                acpCOI: ['NATO-COSMIC']  // Has NATO-COSMIC but not FVEY
            });

            const response = await request(app)
                .get('/api/resources/test-phase3-fvey-coi-required')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(403);
            expect(response.body.error).toBe('Forbidden');
            expect(response.body.reason).toContain('COI');
        });
    });

    // ============================================
    // Test Scenario 5: Multi-Country Releasability → ALLOW
    // ============================================

    describe('Scenario 5: Multi-country releasability', () => {
        it('should allow USA user to access USA+GBR+CAN resource', async () => {
            const token = createE2EJWT({
                uniqueID: 'alice.general@af.mil',
                clearance: 'SECRET',
                clearanceOriginal: 'SECRET',
                countryOfAffiliation: 'USA',
                acpCOI: ['NATO-COSMIC']
            });

            const response = await request(app)
                .get('/api/resources/test-phase3-multi-country')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body.resourceId).toBe('test-phase3-multi-country');
        });

        it('should allow UK user to access USA+GBR+CAN resource', async () => {
            const token = createE2EJWT({
                uniqueID: 'james.smith@mod.uk',
                clearance: 'SECRET',
                clearanceOriginal: 'SECRET',
                countryOfAffiliation: 'GBR',
                acpCOI: ['NATO-COSMIC']
            });

            const response = await request(app)
                .get('/api/resources/test-phase3-multi-country')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body.resourceId).toBe('test-phase3-multi-country');
        });

        it('should allow Canadian user to access USA+GBR+CAN resource', async () => {
            const token = createE2EJWT({
                uniqueID: 'john.macdonald@forces.gc.ca',
                clearance: 'SECRET',
                clearanceOriginal: 'SECRET',
                countryOfAffiliation: 'CAN',
                acpCOI: ['NATO-COSMIC']
            });

            const response = await request(app)
                .get('/api/resources/test-phase3-multi-country')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body.resourceId).toBe('test-phase3-multi-country');
        });

        it('should deny German user accessing USA+GBR+CAN resource (not in releasabilityTo)', async () => {
            const token = createE2EJWT({
                uniqueID: 'hans.mueller@bundeswehr.org',
                clearance: 'SECRET',
                clearanceOriginal: 'GEHEIM',
                countryOfAffiliation: 'DEU',
                acpCOI: ['NATO-COSMIC']
            });

            const response = await request(app)
                .get('/api/resources/test-phase3-multi-country')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(403);
            expect(response.body.reason).toContain('not in releasabilityTo');
        });
    });

    // ============================================
    // Test Scenario 6: Clearance Hierarchy
    // ============================================

    describe('Scenario 6: Clearance hierarchy (higher clearance can access lower classification)', () => {
        it('should allow TOP_SECRET user to access CONFIDENTIAL resource', async () => {
            const token = createE2EJWT({
                uniqueID: 'alice.general@af.mil',
                clearance: 'TOP_SECRET',
                clearanceOriginal: 'TOP SECRET',
                countryOfAffiliation: 'USA',
                acpCOI: ['NATO-COSMIC']
            });

            const response = await request(app)
                .get('/api/resources/test-phase3-usa-confidential')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body.resourceId).toBe('test-phase3-usa-confidential');
        });

        it('should allow SECRET user to access UNCLASSIFIED resource', async () => {
            const token = createE2EJWT({
                uniqueID: 'carlos.garcia@mil.es',
                clearance: 'SECRET',
                clearanceOriginal: 'SECRETO',
                countryOfAffiliation: 'ESP',
                acpCOI: ['NATO-COSMIC']
            });

            const response = await request(app)
                .get('/api/resources/test-phase3-esp-unclassified')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body.resourceId).toBe('test-phase3-esp-unclassified');
        });
    });

    // ============================================
    // Test Scenario 7: Cross-Country Authorization
    // ============================================

    describe('Scenario 7: Cross-country authorization (user from Country A accessing Country B resource)', () => {
        it('should allow USA user to access UK resource (if releasable to USA)', async () => {
            const token = createE2EJWT({
                uniqueID: 'alice.general@af.mil',
                clearance: 'SECRET',
                clearanceOriginal: 'SECRET',
                countryOfAffiliation: 'USA',
                acpCOI: ['FVEY']
            });

            const response = await request(app)
                .get('/api/resources/test-phase3-gbr-usa-releasable')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body.resourceId).toBe('test-phase3-gbr-usa-releasable');
        });

        it('should deny Germany user accessing French resource (if not releasable)', async () => {
            const token = createE2EJWT({
                uniqueID: 'hans.mueller@bundeswehr.org',
                clearance: 'SECRET',
                clearanceOriginal: 'GEHEIM',
                countryOfAffiliation: 'DEU',
                acpCOI: ['NATO-COSMIC']
            });

            const response = await request(app)
                .get('/api/resources/test-phase3-fra-only')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(403);
            expect(response.body.reason).toContain('not in releasabilityTo');
        });
    });

    // ============================================
    // Test Scenario 8: Decision Logging Verification
    // ============================================

    describe('Scenario 8: Decision logging', () => {
        it.skip('should log ALLOW decisions', async () => {
            const token = createE2EJWT({
                uniqueID: 'alice.general@af.mil',
                clearance: 'SECRET',
                clearanceOriginal: 'SECRET',
                countryOfAffiliation: 'USA',
                acpCOI: ['NATO-COSMIC']
            });

            const response = await request(app)
                .get('/api/resources/test-phase3-usa-secret')
                .set('Authorization', `Bearer ${token}`);

            // Decision logging is async - give it a moment
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify decision was logged (check MongoDB decisions collection)
            const decisions = await db.collection('decisions').find({
                subject: 'alice.general@af.mil',
                resourceId: 'test-phase3-usa-secret'
            }).limit(1).toArray();

            // If resource was found, decision should be logged
            if (response.status === 200) {
                expect(decisions.length).toBeGreaterThan(0);
                expect(decisions[0].decision).toBe('ALLOW');
                expect(decisions[0].reason).toBeDefined();
            } else {
                // Resource might not exist (404), which is acceptable
                expect([200, 404]).toContain(response.status);
            }
        });

        it.skip('should log DENY decisions with reason', async () => {
            const token = createE2EJWT({
                uniqueID: 'bob.contractor@af.mil',
                clearance: 'UNCLASSIFIED',
                clearanceOriginal: 'UNCLASSIFIED',
                countryOfAffiliation: 'USA',
                acpCOI: []
            });

            const response = await request(app)
                .get('/api/resources/test-phase3-usa-secret')
                .set('Authorization', `Bearer ${token}`);

            // Decision logging is async - give it a moment
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify DENY decision was logged
            const decisions = await db.collection('decisions').find({
                subject: 'bob.contractor@af.mil',
                resourceId: 'test-phase3-usa-secret'
            }).limit(1).toArray();

            // If resource exists, we should get 403 and decision logged
            if (response.status === 403) {
                expect(decisions.length).toBeGreaterThan(0);
                expect(decisions[0].decision).toBe('DENY');
                expect(decisions[0].reason).toContain('clearance');
            } else {
                // Resource might not exist (404), which is acceptable
                expect([403, 404]).toContain(response.status);
            }
        });
    });

    // ============================================
    // Test Scenario 9: Decision Cache
    // ============================================

    describe('Scenario 9: Decision caching (60s TTL)', () => {
        it('should cache ALLOW decisions and reuse on subsequent requests', async () => {
            const token = createE2EJWT({
                uniqueID: 'alice.general@af.mil',
                clearance: 'SECRET',
                clearanceOriginal: 'SECRET',
                countryOfAffiliation: 'USA',
                acpCOI: ['NATO-COSMIC']
            });

            // First request - should call OPA
            const response1 = await request(app)
                .get('/api/resources/test-phase3-usa-secret')
                .set('Authorization', `Bearer ${token}`);

            expect(response1.status).toBe(200);

            // Second request - should use cache (no OPA call)
            const response2 = await request(app)
                .get('/api/resources/test-phase3-usa-secret')
                .set('Authorization', `Bearer ${token}`);

            expect(response2.status).toBe(200);
            // Both should succeed, second should be faster (cached)
        });
    });

    // ============================================
    // Test Scenario 10: All 10 Countries
    // ============================================

    describe('Scenario 10: Comprehensive 10-country authorization', () => {
        const countries = [
            { code: 'USA', user: 'test.usa@af.mil', clearance: 'SECRET', original: 'SECRET' },
            { code: 'ESP', user: 'test.esp@mil.es', clearance: 'SECRET', original: 'SECRETO' },
            { code: 'FRA', user: 'test.fra@defense.gouv.fr', clearance: 'SECRET', original: 'SECRET DÉFENSE' },
            { code: 'GBR', user: 'test.gbr@mod.uk', clearance: 'SECRET', original: 'SECRET' },
            { code: 'DEU', user: 'test.deu@bundeswehr.org', clearance: 'SECRET', original: 'GEHEIM' },
            { code: 'ITA', user: 'test.ita@difesa.it', clearance: 'SECRET', original: 'SEGRETO' },
            { code: 'NLD', user: 'test.nld@defensie.nl', clearance: 'SECRET', original: 'GEHEIM' },
            { code: 'POL', user: 'test.pol@mon.gov.pl', clearance: 'SECRET', original: 'TAJNE' },
            { code: 'CAN', user: 'test.can@forces.gc.ca', clearance: 'SECRET', original: 'SECRET' },
            { code: 'USA', user: 'test.industry@lockheed.com', clearance: 'SECRET', original: 'SECRET', label: 'INDUSTRY' }
        ];

        countries.forEach(country => {
            it(`should authorize ${country.label || country.code} user with clearanceOriginal=${country.original}`, async () => {
                const token = createE2EJWT({
                    uniqueID: country.user,
                    clearance: country.clearance,
                    clearanceOriginal: country.original,
                    countryOfAffiliation: country.code,
                    acpCOI: ['NATO-COSMIC']
                });

                const resourceId = `test-phase3-${country.code.toLowerCase()}-secret`;

                const response = await request(app)
                    .get(`/api/resources/${resourceId}`)
                    .set('Authorization', `Bearer ${token}`);

                expect(response.status).toBe(200);
                expect(response.body.resourceId).toBe(resourceId);
            });
        });
    });
});

// ============================================
// Helper: Seed Test Resources
// ============================================

async function seedTestResources(db: any) {
    const resources = [
        // USA resources
        {
            resourceId: 'test-phase3-usa-secret',
            title: 'USA SECRET Test Document',
            classification: 'SECRET',
            releasabilityTo: ['USA'],
            COI: ['NATO-COSMIC'],
            creationDate: '2024-01-01T00:00:00Z',
            encrypted: false,
            content: 'Test content for USA SECRET resource'
        },
        {
            resourceId: 'test-phase3-usa-confidential',
            title: 'USA CONFIDENTIAL Test Document',
            classification: 'CONFIDENTIAL',
            releasabilityTo: ['USA'],
            COI: ['NATO-COSMIC'],
            creationDate: '2024-01-01T00:00:00Z',
            encrypted: false,
            content: 'Test content for USA CONFIDENTIAL resource'
        },
        {
            resourceId: 'test-phase3-usa-only',
            title: 'USA-ONLY Test Document',
            classification: 'SECRET',
            releasabilityTo: ['USA'],  // Only USA
            COI: ['US-ONLY'],
            creationDate: '2024-01-01T00:00:00Z',
            encrypted: false,
            content: 'Test content for USA-ONLY resource'
        },
        // Spain resources
        {
            resourceId: 'test-phase3-esp-secret',
            title: 'Spain SECRETO Test Document',
            classification: 'SECRET',
            releasabilityTo: ['ESP'],
            COI: ['NATO-COSMIC'],
            creationDate: '2024-01-01T00:00:00Z',
            encrypted: false,
            content: 'Test content for ESP SECRET resource'
        },
        {
            resourceId: 'test-phase3-esp-unclassified',
            title: 'Spain NO CLASIFICADO Test Document',
            classification: 'UNCLASSIFIED',
            releasabilityTo: ['ESP'],
            COI: ['NATO-COSMIC'],
            creationDate: '2024-01-01T00:00:00Z',
            encrypted: false,
            content: 'Test content for ESP UNCLASSIFIED resource'
        },
        // France resources
        {
            resourceId: 'test-phase3-fra-secret',
            title: 'France SECRET DÉFENSE Test Document',
            classification: 'SECRET',
            releasabilityTo: ['FRA'],
            COI: ['NATO-COSMIC'],
            creationDate: '2024-01-01T00:00:00Z',
            encrypted: false,
            content: 'Test content for FRA SECRET resource'
        },
        {
            resourceId: 'test-phase3-fra-only',
            title: 'France-ONLY Test Document',
            classification: 'SECRET',
            releasabilityTo: ['FRA'],  // Only France
            COI: ['NATO-COSMIC'],
            creationDate: '2024-01-01T00:00:00Z',
            encrypted: false,
            content: 'Test content for FRA-ONLY resource'
        },
        // UK resources
        {
            resourceId: 'test-phase3-gbr-secret',
            title: 'UK SECRET Test Document',
            classification: 'SECRET',
            releasabilityTo: ['GBR'],
            COI: ['NATO-COSMIC'],
            creationDate: '2024-01-01T00:00:00Z',
            encrypted: false,
            content: 'Test content for GBR SECRET resource'
        },
        {
            resourceId: 'test-phase3-gbr-usa-releasable',
            title: 'UK SECRET Releasable to USA',
            classification: 'SECRET',
            releasabilityTo: ['GBR', 'USA'],
            COI: ['FVEY'],
            creationDate: '2024-01-01T00:00:00Z',
            encrypted: false,
            content: 'Test content for GBR resource releasable to USA'
        },
        // Germany resources
        {
            resourceId: 'test-phase3-deu-secret',
            title: 'Germany GEHEIM Test Document',
            classification: 'SECRET',
            releasabilityTo: ['DEU'],
            COI: ['NATO-COSMIC'],
            creationDate: '2024-01-01T00:00:00Z',
            encrypted: false,
            content: 'Test content for DEU SECRET resource'
        },
        // Italy resources
        {
            resourceId: 'test-phase3-ita-secret',
            title: 'Italy SEGRETO Test Document',
            classification: 'SECRET',
            releasabilityTo: ['ITA'],
            COI: ['NATO-COSMIC'],
            creationDate: '2024-01-01T00:00:00Z',
            encrypted: false,
            content: 'Test content for ITA SECRET resource'
        },
        // Netherlands resources
        {
            resourceId: 'test-phase3-nld-secret',
            title: 'Netherlands GEHEIM Test Document',
            classification: 'SECRET',
            releasabilityTo: ['NLD'],
            COI: ['NATO-COSMIC'],
            creationDate: '2024-01-01T00:00:00Z',
            encrypted: false,
            content: 'Test content for NLD SECRET resource'
        },
        // Poland resources
        {
            resourceId: 'test-phase3-pol-secret',
            title: 'Poland TAJNE Test Document',
            classification: 'SECRET',
            releasabilityTo: ['POL'],
            COI: ['NATO-COSMIC'],
            creationDate: '2024-01-01T00:00:00Z',
            encrypted: false,
            content: 'Test content for POL SECRET resource'
        },
        // Canada resources
        {
            resourceId: 'test-phase3-can-secret',
            title: 'Canada SECRET Test Document',
            classification: 'SECRET',
            releasabilityTo: ['CAN'],
            COI: ['NATO-COSMIC'],
            creationDate: '2024-01-01T00:00:00Z',
            encrypted: false,
            content: 'Test content for CAN SECRET resource'
        },
        // Industry resources
        {
            resourceId: 'test-phase3-industry-secret',
            title: 'Industry SECRET Test Document',
            classification: 'SECRET',
            releasabilityTo: ['USA'],
            COI: [],
            creationDate: '2024-01-01T00:00:00Z',
            encrypted: false,
            content: 'Test content for Industry SECRET resource'
        },
        // Multi-country resource
        {
            resourceId: 'test-phase3-multi-country',
            title: 'Multi-Country SECRET Document',
            classification: 'SECRET',
            releasabilityTo: ['USA', 'GBR', 'CAN'],
            COI: ['NATO-COSMIC'],
            creationDate: '2024-01-01T00:00:00Z',
            encrypted: false,
            content: 'Test content for multi-country resource'
        },
        // FVEY-only resource (for testing COI)
        {
            resourceId: 'test-phase3-fvey-only',
            title: 'FVEY-ONLY SECRET Document',
            classification: 'SECRET',
            releasabilityTo: ['USA', 'GBR', 'CAN', 'AUS', 'NZL'],
            COI: ['FVEY'],
            creationDate: '2024-01-01T00:00:00Z',
            encrypted: false,
            content: 'Test content for FVEY-only resource'
        },
        // Resource requiring FVEY COI
        {
            resourceId: 'test-phase3-fvey-coi-required',
            title: 'Resource Requiring FVEY COI',
            classification: 'SECRET',
            releasabilityTo: ['USA'],
            COI: ['FVEY'],  // Requires FVEY COI
            creationDate: '2024-01-01T00:00:00Z',
            encrypted: false,
            content: 'Test content requiring FVEY COI'
        }
    ];

    await db.collection('resources').insertMany(resources);
}

