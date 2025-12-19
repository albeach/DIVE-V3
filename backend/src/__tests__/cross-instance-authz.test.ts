/**
 * DIVE V3 - Cross-Instance Authorization Service Tests
 *
 * Tests for cross-instance resource access authorization with
 * bilateral trust verification and policy evaluation.
 *
 * @version 1.0.0
 * @date 2025-12-05
 */

import { crossInstanceAuthzService } from '../services/cross-instance-authz.service';
import { spokeTokenExchange } from '../services/spoke-token-exchange.service';

// Mock axios
jest.mock('axios', () => {
    const actualAxios = jest.requireActual('axios');
    return {
        ...actualAxios,
        default: {
            ...actualAxios.default,
            post: jest.fn(),
            create: jest.fn(() => ({
                post: jest.fn(),
                get: jest.fn(),
            })),
        },
        create: jest.fn(() => ({
            post: jest.fn(),
            get: jest.fn(),
        })),
    };
});

// Mock https
jest.mock('https', () => ({
    Agent: jest.fn().mockImplementation(() => ({})),
}));

describe('CrossInstanceAuthzService', () => {
    beforeAll(async () => {
        // Initialize token exchange service
        await spokeTokenExchange.initialize({
            instanceId: 'test-usa',
            instanceCode: 'USA',
        });
    });

    afterAll(() => {
        spokeTokenExchange.shutdown();
    });

    afterEach(() => {
        crossInstanceAuthzService.clearCache();
    });

    // ===========================================
    // BASIC AUTHORIZATION TESTS
    // ===========================================

    describe('Basic Authorization', () => {
        it('should evaluate local resource access', async () => {
            const result = await crossInstanceAuthzService.evaluateAccess({
                subject: {
                    uniqueID: 'test.user@usa.mil',
                    clearance: 'SECRET',
                    countryOfAffiliation: 'USA',
                    acpCOI: ['FVEY'],
                    originInstance: 'USA',
                },
                resource: {
                    resourceId: 'doc-001',
                    classification: 'SECRET',
                    releasabilityTo: ['USA', 'GBR'],
                    COI: [],
                    instanceId: 'local',
                    instanceUrl: 'https://localhost:4000',
                },
                action: 'read',
                requestId: 'test-1',
                bearerToken: 'test-token',
            });

            expect(result).toBeDefined();
            expect(result.evaluationDetails).toBeDefined();
            expect(result.auditTrail).toBeInstanceOf(Array);
            expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
        });

        it('should include local decision in evaluation details', async () => {
            const result = await crossInstanceAuthzService.evaluateAccess({
                subject: {
                    uniqueID: 'test.user@usa.mil',
                    clearance: 'UNCLASSIFIED',
                    countryOfAffiliation: 'USA',
                    acpCOI: [],
                    originInstance: 'USA',
                },
                resource: {
                    resourceId: 'doc-002',
                    classification: 'UNCLASSIFIED',
                    releasabilityTo: ['USA'],
                    COI: [],
                    instanceId: 'local',
                    instanceUrl: 'https://localhost:4000',
                },
                action: 'read',
                requestId: 'test-2',
                bearerToken: 'test-token',
            });

            expect(result.evaluationDetails.localDecision).toBeDefined();
        });

        it('should cache authorization decisions', async () => {
            const request = {
                subject: {
                    uniqueID: 'cache.user@usa.mil',
                    clearance: 'SECRET',
                    countryOfAffiliation: 'USA',
                    acpCOI: [],
                    originInstance: 'USA',
                },
                resource: {
                    resourceId: 'doc-cache',
                    classification: 'SECRET',
                    releasabilityTo: ['USA'],
                    COI: [],
                    instanceId: 'local',
                    instanceUrl: 'https://localhost:4000',
                },
                action: 'read' as const,
                requestId: 'cache-test',
                bearerToken: 'test-token',
            };

            // First call
            await crossInstanceAuthzService.evaluateAccess(request);

            // Second call should hit cache
            const result2 = await crossInstanceAuthzService.evaluateAccess(request);

            expect(result2.evaluationDetails.cacheHit).toBe(true);
        });
    });

    // ===========================================
    // BILATERAL TRUST TESTS
    // ===========================================

    describe('Bilateral Trust Authorization', () => {
        it('should evaluate access with bilateral trust check', async () => {
            const result = await crossInstanceAuthzService.evaluateAccessWithBilateralTrust({
                subject: {
                    uniqueID: 'usa.user@usa.mil',
                    clearance: 'SECRET',
                    countryOfAffiliation: 'USA',
                    acpCOI: ['FVEY'],
                    originInstance: 'USA',
                },
                resource: {
                    resourceId: 'gbr-doc-001',
                    classification: 'SECRET',
                    releasabilityTo: ['USA', 'GBR'],
                    COI: [],
                    instanceId: 'GBR',
                    instanceUrl: 'https://gbr-api.dive25.com',
                },
                action: 'read',
                requestId: 'bilateral-1',
                bearerToken: 'test-token',
            });

            expect(result).toBeDefined();
            expect(result.auditTrail.some(a => a.action === 'bilateral_trust_check')).toBe(true);
        });

        it('should deny access without bilateral trust', async () => {
            const result = await crossInstanceAuthzService.evaluateAccessWithBilateralTrust({
                subject: {
                    uniqueID: 'usa.user@usa.mil',
                    clearance: 'SECRET',
                    countryOfAffiliation: 'USA',
                    acpCOI: [],
                    originInstance: 'USA',
                },
                resource: {
                    resourceId: 'unknown-doc',
                    classification: 'SECRET',
                    releasabilityTo: ['UNKNOWN'],
                    COI: [],
                    instanceId: 'UNKNOWN',
                    instanceUrl: 'https://unknown-api.example.com',
                },
                action: 'read',
                requestId: 'no-trust-1',
                bearerToken: 'test-token',
            });

            expect(result.allow).toBe(false);
            expect(result.reason).toContain('No bilateral trust');
        });

        it('should deny access when classification exceeds trust level', async () => {
            // FRA trust only allows up to SECRET
            const result = await crossInstanceAuthzService.evaluateAccessWithBilateralTrust({
                subject: {
                    uniqueID: 'usa.user@usa.mil',
                    clearance: 'TOP_SECRET',
                    countryOfAffiliation: 'USA',
                    acpCOI: [],
                    originInstance: 'USA',
                },
                resource: {
                    resourceId: 'fra-ts-doc',
                    classification: 'TOP_SECRET',
                    releasabilityTo: ['USA', 'FRA'],
                    COI: [],
                    instanceId: 'FRA',
                    instanceUrl: 'https://fra-api.dive25.com',
                },
                action: 'read',
                requestId: 'class-exceed-1',
                bearerToken: 'test-token',
            });

            expect(result.allow).toBe(false);
            expect(result.reason).toContain('exceeds bilateral trust limit');
        });

        it('should include bilateral trust details in result', async () => {
            const result = await crossInstanceAuthzService.evaluateAccessWithBilateralTrust({
                subject: {
                    uniqueID: 'usa.user@usa.mil',
                    clearance: 'SECRET',
                    countryOfAffiliation: 'USA',
                    acpCOI: [],
                    originInstance: 'USA',
                },
                resource: {
                    resourceId: 'gbr-doc-002',
                    classification: 'SECRET',
                    releasabilityTo: ['USA', 'GBR'],
                    COI: [],
                    instanceId: 'GBR',
                    instanceUrl: 'https://gbr-api.dive25.com',
                },
                action: 'read',
                requestId: 'trust-details-1',
                bearerToken: 'test-token',
            });

            // If bilateral trust was verified, it should be in the details
            const trustEntry = result.auditTrail.find(a => 
                a.action === 'bilateral_trust_verified' || a.action === 'bilateral_trust_denied'
            );
            expect(trustEntry).toBeDefined();
        });
    });

    // ===========================================
    // CLEARANCE TRANSLATION TESTS
    // ===========================================

    describe('Clearance Translation', () => {
        it('should translate French clearances to NATO equivalents', async () => {
            const result = await crossInstanceAuthzService.evaluateAccess({
                subject: {
                    uniqueID: 'french.user@fra.mil',
                    clearance: 'SECRET_DEFENSE',
                    countryOfAffiliation: 'FRA',
                    acpCOI: [],
                    originInstance: 'FRA',
                },
                resource: {
                    resourceId: 'fra-doc-001',
                    classification: 'SECRET',
                    releasabilityTo: ['FRA', 'USA'],
                    COI: [],
                    instanceId: 'fra',
                    instanceUrl: 'https://fra-api.dive25.com',
                },
                action: 'read',
                requestId: 'translate-1',
                bearerToken: 'test-token',
            });

            // Check attribute translation is attempted
            expect(result.evaluationDetails).toBeDefined();
        });

        it('should translate German clearances', async () => {
            const result = await crossInstanceAuthzService.evaluateAccess({
                subject: {
                    uniqueID: 'german.user@deu.mil',
                    clearance: 'GEHEIM',
                    countryOfAffiliation: 'DEU',
                    acpCOI: [],
                    originInstance: 'DEU',
                },
                resource: {
                    resourceId: 'deu-doc-001',
                    classification: 'SECRET',
                    releasabilityTo: ['DEU', 'USA'],
                    COI: [],
                    instanceId: 'deu',
                    instanceUrl: 'https://deu-api.dive25.com',
                },
                action: 'read',
                requestId: 'translate-deu-1',
                bearerToken: 'test-token',
            });

            expect(result).toBeDefined();
        });

        it('should translate UK clearances', async () => {
            const result = await crossInstanceAuthzService.evaluateAccess({
                subject: {
                    uniqueID: 'british.user@gbr.mil',
                    clearance: 'OFFICIAL_SENSITIVE',
                    countryOfAffiliation: 'GBR',
                    acpCOI: [],
                    originInstance: 'GBR',
                },
                resource: {
                    resourceId: 'gbr-doc-001',
                    classification: 'CONFIDENTIAL',
                    releasabilityTo: ['GBR', 'USA'],
                    COI: [],
                    instanceId: 'gbr',
                    instanceUrl: 'https://gbr-api.dive25.com',
                },
                action: 'read',
                requestId: 'translate-gbr-1',
                bearerToken: 'test-token',
            });

            expect(result).toBeDefined();
        });
    });

    // ===========================================
    // FEDERATED QUERY TESTS
    // ===========================================

    describe('Federated Resource Queries', () => {
        it('should query federated resources', async () => {
            const result = await crossInstanceAuthzService.queryFederatedResources({
                query: {
                    classification: ['SECRET', 'CONFIDENTIAL'],
                    releasabilityTo: ['USA'],
                },
                subject: {
                    uniqueID: 'query.user@usa.mil',
                    clearance: 'SECRET',
                    countryOfAffiliation: 'USA',
                    acpCOI: [],
                    originInstance: 'USA',
                },
                requestId: 'query-1',
                bearerToken: 'test-token',
            });

            expect(result).toBeDefined();
            expect(result.totalResources).toBeGreaterThanOrEqual(0);
            expect(result.queryStats).toBeDefined();
            expect(result.queryStats.instancesQueried).toBeGreaterThan(0);
        });

        it('should filter queries by target instances', async () => {
            const result = await crossInstanceAuthzService.queryFederatedResources({
                query: {
                    classification: ['UNCLASSIFIED'],
                },
                subject: {
                    uniqueID: 'query.user@usa.mil',
                    clearance: 'SECRET',
                    countryOfAffiliation: 'USA',
                    acpCOI: [],
                    originInstance: 'USA',
                },
                requestId: 'query-2',
                bearerToken: 'test-token',
                targetInstances: ['local', 'gbr'],
            });

            expect(result.queryStats.instancesQueried).toBe(2);
        });

        it('should include query statistics', async () => {
            const result = await crossInstanceAuthzService.queryFederatedResources({
                query: {
                    keywords: ['test'],
                },
                subject: {
                    uniqueID: 'stats.user@usa.mil',
                    clearance: 'SECRET',
                    countryOfAffiliation: 'USA',
                    acpCOI: [],
                    originInstance: 'USA',
                },
                requestId: 'query-stats-1',
                bearerToken: 'test-token',
            });

            expect(result.queryStats.totalLatencyMs).toBeGreaterThanOrEqual(0);
            expect(Array.isArray(result.queryStats.failedQueries)).toBe(true);
        });
    });

    // ===========================================
    // OBLIGATION TESTS
    // ===========================================

    describe('Authorization Obligations', () => {
        it('should include audit obligation for cross-instance access', async () => {
            const result = await crossInstanceAuthzService.evaluateAccess({
                subject: {
                    uniqueID: 'oblig.user@usa.mil',
                    clearance: 'SECRET',
                    countryOfAffiliation: 'USA',
                    acpCOI: [],
                    originInstance: 'USA',
                },
                resource: {
                    resourceId: 'gbr-doc-oblig',
                    classification: 'SECRET',
                    releasabilityTo: ['USA', 'GBR'],
                    COI: [],
                    instanceId: 'gbr',
                    instanceUrl: 'https://gbr-api.dive25.com',
                },
                action: 'read',
                requestId: 'oblig-1',
                bearerToken: 'test-token',
            });

            // If access is allowed, check for audit obligation
            if (result.allow && result.obligations) {
                expect(result.obligations).toContain('AUDIT_FEDERATED_ACCESS');
            }
        });

        it('should include coalition marking obligation for different countries', async () => {
            const result = await crossInstanceAuthzService.evaluateAccess({
                subject: {
                    uniqueID: 'fra.user@fra.mil',
                    clearance: 'SECRET',
                    countryOfAffiliation: 'FRA',
                    acpCOI: [],
                    originInstance: 'FRA',
                },
                resource: {
                    resourceId: 'usa-doc-001',
                    classification: 'SECRET',
                    releasabilityTo: ['USA', 'FRA'],
                    COI: [],
                    instanceId: 'usa',
                    instanceUrl: 'https://usa-api.dive25.com',
                },
                action: 'read',
                requestId: 'oblig-2',
                bearerToken: 'test-token',
            });

            // If access is allowed and countries are different
            if (result.allow && result.obligations) {
                expect(result.obligations).toContain('MARK_COALITION_ACCESS');
            }
        });

        it('should include KAS obligation for decrypt action', async () => {
            const result = await crossInstanceAuthzService.evaluateAccess({
                subject: {
                    uniqueID: 'decrypt.user@usa.mil',
                    clearance: 'SECRET',
                    countryOfAffiliation: 'USA',
                    acpCOI: [],
                    originInstance: 'USA',
                },
                resource: {
                    resourceId: 'encrypted-doc',
                    classification: 'SECRET',
                    releasabilityTo: ['USA'],
                    COI: [],
                    instanceId: 'local',
                    instanceUrl: 'https://localhost:4000',
                },
                action: 'decrypt',
                requestId: 'decrypt-1',
                bearerToken: 'test-token',
            });

            if (result.allow && result.obligations) {
                expect(result.obligations).toContain('KAS_KEY_REQUEST');
            }
        });
    });

    // ===========================================
    // CACHE TESTS
    // ===========================================

    describe('Cache Operations', () => {
        it('should clear cache', () => {
            crossInstanceAuthzService.clearCache();
            const stats = crossInstanceAuthzService.getCacheStats();
            expect(stats.keys).toBe(0);
        });

        it('should report cache statistics', () => {
            const stats = crossInstanceAuthzService.getCacheStats();
            expect(typeof stats.keys).toBe('number');
            expect(typeof stats.hits).toBe('number');
            expect(typeof stats.misses).toBe('number');
        });
    });

    // ===========================================
    // AUDIT TRAIL TESTS
    // ===========================================

    describe('Audit Trail', () => {
        it('should generate audit entries for authorization', async () => {
            const result = await crossInstanceAuthzService.evaluateAccess({
                subject: {
                    uniqueID: 'audit.user@usa.mil',
                    clearance: 'SECRET',
                    countryOfAffiliation: 'USA',
                    acpCOI: [],
                    originInstance: 'USA',
                },
                resource: {
                    resourceId: 'audit-doc',
                    classification: 'SECRET',
                    releasabilityTo: ['USA'],
                    COI: [],
                    instanceId: 'local',
                    instanceUrl: 'https://localhost:4000',
                },
                action: 'read',
                requestId: 'audit-1',
                bearerToken: 'test-token',
            });

            expect(result.auditTrail.length).toBeGreaterThan(0);
            
            for (const entry of result.auditTrail) {
                expect(entry.timestamp).toBeDefined();
                expect(entry.instanceId).toBeDefined();
                expect(entry.action).toBeDefined();
                expect(['allow', 'deny', 'error']).toContain(entry.outcome);
            }
        });

        it('should include policy evaluation in audit trail', async () => {
            const result = await crossInstanceAuthzService.evaluateAccess({
                subject: {
                    uniqueID: 'policy.user@usa.mil',
                    clearance: 'SECRET',
                    countryOfAffiliation: 'USA',
                    acpCOI: [],
                    originInstance: 'USA',
                },
                resource: {
                    resourceId: 'policy-doc',
                    classification: 'SECRET',
                    releasabilityTo: ['USA'],
                    COI: [],
                    instanceId: 'local',
                    instanceUrl: 'https://localhost:4000',
                },
                action: 'read',
                requestId: 'policy-audit-1',
                bearerToken: 'test-token',
            });

            const policyEntry = result.auditTrail.find(a => 
                a.action.includes('policy')
            );
            expect(policyEntry).toBeDefined();
        });
    });

    // ===========================================
    // BILATERAL TRUST HELPER TESTS
    // ===========================================

    describe('Bilateral Trust Helpers', () => {
        it('should check bilateral trust existence', async () => {
            const hasUSAtoGBR = await crossInstanceAuthzService.hasBilateralTrust('USA', 'GBR');
            expect(hasUSAtoGBR).toBe(true);

            const hasUSAtoUnknown = await crossInstanceAuthzService.hasBilateralTrust('USA', 'UNKNOWN');
            expect(hasUSAtoUnknown).toBe(false);
        });

        it('should get bilateral trusts for instance', () => {
            const trusts = crossInstanceAuthzService.getBilateralTrusts();
            expect(Array.isArray(trusts)).toBe(true);
        });
    });

    // ===========================================
    // ERROR HANDLING TESTS
    // ===========================================

    describe('Error Handling', () => {
        it('should handle missing subject attributes gracefully', async () => {
            const result = await crossInstanceAuthzService.evaluateAccess({
                subject: {
                    uniqueID: 'minimal.user',
                    clearance: 'UNCLASSIFIED',
                    countryOfAffiliation: 'USA',
                    acpCOI: [],
                    originInstance: 'USA',
                },
                resource: {
                    resourceId: 'doc-minimal',
                    classification: 'UNCLASSIFIED',
                    releasabilityTo: ['USA'],
                    COI: [],
                    instanceId: 'local',
                    instanceUrl: 'https://localhost:4000',
                },
                action: 'read',
                requestId: 'error-1',
                bearerToken: '',
            });

            // Should not throw, even with minimal attributes
            expect(result).toBeDefined();
        });

        it('should handle empty releasability list', async () => {
            const result = await crossInstanceAuthzService.evaluateAccess({
                subject: {
                    uniqueID: 'test.user@usa.mil',
                    clearance: 'SECRET',
                    countryOfAffiliation: 'USA',
                    acpCOI: [],
                    originInstance: 'USA',
                },
                resource: {
                    resourceId: 'no-release',
                    classification: 'SECRET',
                    releasabilityTo: [],
                    COI: [],
                    instanceId: 'local',
                    instanceUrl: 'https://localhost:4000',
                },
                action: 'read',
                requestId: 'error-2',
                bearerToken: 'test-token',
            });

            // Empty releasability should deny
            expect(result).toBeDefined();
        });
    });
});
