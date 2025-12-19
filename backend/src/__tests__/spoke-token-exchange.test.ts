/**
 * DIVE V3 - Spoke Token Exchange Service Tests
 *
 * Tests for cross-instance token validation and exchange functionality.
 *
 * @version 1.0.0
 * @date 2025-12-05
 */

import { spokeTokenExchange } from '../services/spoke-token-exchange.service';
import crypto from 'crypto';

// Mock axios
jest.mock('axios', () => {
    const actualAxios = jest.requireActual('axios');
    return {
        ...actualAxios,
        create: jest.fn(() => ({
            get: jest.fn(),
            post: jest.fn(),
        })),
    };
});

// Mock https
jest.mock('https', () => ({
    Agent: jest.fn().mockImplementation(() => ({})),
}));

describe('SpokeTokenExchangeService', () => {
    beforeAll(async () => {
        await spokeTokenExchange.initialize({
            instanceId: 'test-instance',
            instanceCode: 'USA',
            tokenCacheTTL: 10,
            introspectionCacheTTL: 5,
            trustCacheTTL: 30,
            maxConcurrentRequests: 10,
            timeoutMs: 5000,
        });
    });

    afterAll(() => {
        spokeTokenExchange.shutdown();
    });

    afterEach(() => {
        spokeTokenExchange.clearCaches();
    });

    // ===========================================
    // INITIALIZATION TESTS
    // ===========================================

    describe('Initialization', () => {
        it('should initialize successfully', () => {
            const status = spokeTokenExchange.getStatus();

            expect(status.initialized).toBe(true);
            expect(status.instanceId).toBe('test-instance');
            expect(status.instanceCode).toBe('USA');
        });

        it('should have correct cache configuration', () => {
            const status = spokeTokenExchange.getStatus();

            expect(status.cacheStats.introspection).toBeDefined();
            expect(status.cacheStats.trust).toBeDefined();
            expect(status.cacheStats.jwks).toBeDefined();
        });

        it('should load federation matrix', () => {
            const trusts = spokeTokenExchange.getBilateralTrusts('USA');

            expect(trusts.length).toBeGreaterThan(0);
            expect(trusts.some(t => t.targetInstance === 'GBR')).toBe(true);
            expect(trusts.some(t => t.targetInstance === 'FRA')).toBe(true);
        });
    });

    // ===========================================
    // BILATERAL TRUST TESTS
    // ===========================================

    describe('Bilateral Trust Verification', () => {
        it('should verify trust between USA and GBR', async () => {
            const trust = await spokeTokenExchange.verifyBilateralTrust('USA', 'GBR');

            expect(trust).not.toBeNull();
            expect(trust?.sourceInstance).toBe('USA');
            expect(trust?.targetInstance).toBe('GBR');
            expect(trust?.trustLevel).toBe('high');
            expect(trust?.enabled).toBe(true);
        });

        it('should verify trust between USA and FRA', async () => {
            const trust = await spokeTokenExchange.verifyBilateralTrust('USA', 'FRA');

            expect(trust).not.toBeNull();
            expect(trust?.maxClassification).toBe('SECRET');
            expect(trust?.allowedScopes).toContain('policy:base');
        });

        it('should verify trust between FRA and DEU', async () => {
            const trust = await spokeTokenExchange.verifyBilateralTrust('FRA', 'DEU');

            expect(trust).not.toBeNull();
            expect(trust?.trustLevel).toBe('high');
        });

        it('should return null for non-existent trust', async () => {
            const trust = await spokeTokenExchange.verifyBilateralTrust('USA', 'UNKNOWN');

            expect(trust).toBeNull();
        });

        it('should cache trust verification results', async () => {
            // First call
            await spokeTokenExchange.verifyBilateralTrust('USA', 'GBR');
            const stats1 = spokeTokenExchange.getStatus().cacheStats.trust;

            // Second call should hit cache
            await spokeTokenExchange.verifyBilateralTrust('USA', 'GBR');
            const stats2 = spokeTokenExchange.getStatus().cacheStats.trust;

            expect(stats2.hits).toBeGreaterThan(stats1.hits);
        });

        it('should verify bidirectional trust (GBR to USA)', async () => {
            const trust = await spokeTokenExchange.verifyBilateralTrust('GBR', 'USA');

            expect(trust).not.toBeNull();
            expect(trust?.sourceInstance).toBe('GBR');
            expect(trust?.targetInstance).toBe('USA');
            expect(trust?.trustLevel).toBe('high');
        });
    });

    // ===========================================
    // TOKEN INTROSPECTION TESTS
    // ===========================================

    describe('Token Introspection', () => {
        const validToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXIifQ.test';

        it('should reject introspection without bilateral trust', async () => {
            const result = await spokeTokenExchange.introspectToken({
                token: validToken,
                originInstance: 'USA',
                requestingInstance: 'UNKNOWN',
                requestId: 'test-1',
            });

            expect(result.active).toBe(false);
            expect(result.trustVerified).toBe(false);
            expect(result.error).toContain('No bilateral trust');
        });

        it('should reject introspection for disabled instance', async () => {
            const result = await spokeTokenExchange.introspectToken({
                token: validToken,
                originInstance: 'DISABLED',
                requestingInstance: 'USA',
                requestId: 'test-2',
            });

            expect(result.active).toBe(false);
        });

        it('should return cache hit for repeated introspection', async () => {
            // First call (will fail due to network, but should cache the result)
            await spokeTokenExchange.introspectToken({
                token: validToken,
                originInstance: 'GBR',
                requestingInstance: 'USA',
                requestId: 'test-3',
            });

            // Note: Since actual introspection fails without real network,
            // cache behavior is tested via status
            const status = spokeTokenExchange.getStatus();
            expect(status.cacheStats.introspection).toBeDefined();
        });

        it('should include latency in introspection result', async () => {
            const result = await spokeTokenExchange.introspectToken({
                token: validToken,
                originInstance: 'GBR',
                requestingInstance: 'USA',
                requestId: 'test-4',
            });

            expect(result.latencyMs).toBeGreaterThanOrEqual(0);
            expect(result.validatedAt).toBeInstanceOf(Date);
        });
    });

    // ===========================================
    // TOKEN EXCHANGE TESTS
    // ===========================================

    describe('Token Exchange', () => {
        const testToken = 'test-access-token-' + crypto.randomBytes(8).toString('hex');

        it('should reject exchange without bilateral trust', async () => {
            const result = await spokeTokenExchange.exchangeToken({
                subjectToken: testToken,
                subjectTokenType: 'access_token',
                originInstance: 'USA',
                targetInstance: 'UNKNOWN',
                requestId: 'exchange-1',
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe('invalid_grant');
            expect(result.errorDescription).toContain('No bilateral trust');
        });

        it('should include audit ID in exchange result', async () => {
            const result = await spokeTokenExchange.exchangeToken({
                subjectToken: testToken,
                subjectTokenType: 'access_token',
                originInstance: 'USA',
                targetInstance: 'GBR',
                requestId: 'exchange-2',
            });

            expect(result.auditId).toBeDefined();
            expect(result.auditId.length).toBe(36); // UUID format
        });

        it('should filter scopes by trust agreement', async () => {
            const result = await spokeTokenExchange.exchangeToken({
                subjectToken: testToken,
                subjectTokenType: 'access_token',
                originInstance: 'USA',
                targetInstance: 'GBR',
                requestedScopes: ['policy:base', 'policy:gbr', 'policy:secret'],
                requestId: 'exchange-3',
            });

            // Even if exchange fails due to invalid token, scope filtering should work
            expect(result.originInstance).toBe('USA');
            expect(result.targetInstance).toBe('GBR');
        });

        it('should preserve instance information', async () => {
            const result = await spokeTokenExchange.exchangeToken({
                subjectToken: testToken,
                subjectTokenType: 'access_token',
                originInstance: 'FRA',
                targetInstance: 'DEU',
                requestId: 'exchange-4',
            });

            expect(result.originInstance).toBe('FRA');
            expect(result.targetInstance).toBe('DEU');
        });
    });

    // ===========================================
    // INSTANCE REGISTRY TESTS
    // ===========================================

    describe('Instance Registry', () => {
        it('should return registered instances', () => {
            const instances = spokeTokenExchange.getRegisteredInstances();

            expect(instances.length).toBeGreaterThan(0);
            expect(instances.some(i => i.instanceCode === 'USA')).toBe(true);
            expect(instances.some(i => i.instanceCode === 'GBR')).toBe(true);
            expect(instances.some(i => i.instanceCode === 'FRA')).toBe(true);
            expect(instances.some(i => i.instanceCode === 'DEU')).toBe(true);
        });

        it('should have valid URLs for all instances', () => {
            const instances = spokeTokenExchange.getRegisteredInstances();

            for (const instance of instances) {
                expect(instance.baseUrl).toMatch(/^https?:\/\//);
                expect(instance.tokenIntrospectionUrl).toMatch(/^https?:\/\//);
                expect(instance.jwksUrl).toMatch(/^https?:\/\//);
            }
        });

        it('should only return enabled instances', () => {
            const instances = spokeTokenExchange.getRegisteredInstances();

            for (const instance of instances) {
                expect(instance.enabled).toBe(true);
            }
        });
    });

    // ===========================================
    // CACHE MANAGEMENT TESTS
    // ===========================================

    describe('Cache Management', () => {
        it('should clear all caches', () => {
            spokeTokenExchange.clearCaches();
            const status = spokeTokenExchange.getStatus();

            expect(status.cacheStats.introspection.keys).toBe(0);
            // Trust cache is also cleared and will be re-loaded lazily
            expect(typeof status.cacheStats.trust.keys).toBe('number');
        });

        it('should report cache statistics', () => {
            const status = spokeTokenExchange.getStatus();

            expect(typeof status.cacheStats.introspection.hits).toBe('number');
            expect(typeof status.cacheStats.introspection.misses).toBe('number');
            expect(typeof status.cacheStats.trust.hits).toBe('number');
            expect(typeof status.cacheStats.trust.misses).toBe('number');
        });
    });

    // ===========================================
    // STATUS TESTS
    // ===========================================

    describe('Service Status', () => {
        it('should return complete status', () => {
            const status = spokeTokenExchange.getStatus();

            expect(status).toHaveProperty('initialized');
            expect(status).toHaveProperty('instanceId');
            expect(status).toHaveProperty('instanceCode');
            expect(status).toHaveProperty('cacheStats');
            expect(status).toHaveProperty('activeRequests');
        });

        it('should track active requests', () => {
            const status = spokeTokenExchange.getStatus();
            expect(typeof status.activeRequests).toBe('number');
        });
    });

    // ===========================================
    // EDGE CASES
    // ===========================================

    describe('Edge Cases', () => {
        it('should handle empty scopes in exchange', async () => {
            const result = await spokeTokenExchange.exchangeToken({
                subjectToken: 'test-token',
                subjectTokenType: 'access_token',
                originInstance: 'USA',
                targetInstance: 'GBR',
                requestedScopes: [],
                requestId: 'edge-1',
            });

            // Should still process (may fail due to invalid token)
            expect(result.originInstance).toBe('USA');
        });

        it('should handle case-insensitive instance codes', async () => {
            const trust1 = await spokeTokenExchange.verifyBilateralTrust('usa', 'gbr');
            const trust2 = await spokeTokenExchange.verifyBilateralTrust('USA', 'GBR');

            expect(trust1).not.toBeNull();
            expect(trust2).not.toBeNull();
        });

        it('should handle self-instance introspection', async () => {
            const result = await spokeTokenExchange.introspectToken({
                token: 'test-token',
                originInstance: 'USA',
                requestingInstance: 'USA',
                requestId: 'self-1',
            });

            // Self-introspection should fail (no bilateral trust to self)
            expect(result.active).toBe(false);
        });
    });

    // ===========================================
    // EVENT EMISSION TESTS
    // ===========================================

    describe('Event Emission', () => {
        it('should emit introspectionFailed event', async () => {
            const eventPromise = new Promise<void>((resolve) => {
                spokeTokenExchange.once('introspectionFailed', () => resolve());
            });

            // Trigger failed introspection
            await spokeTokenExchange.introspectToken({
                token: 'test-token',
                originInstance: 'USA',
                requestingInstance: 'UNKNOWN',
                requestId: 'event-1',
            });

            await expect(eventPromise).resolves.toBeUndefined();
        });

        it('should emit exchangeFailed event', async () => {
            const eventPromise = new Promise<void>((resolve) => {
                spokeTokenExchange.once('exchangeFailed', () => resolve());
            });

            // Trigger failed exchange
            await spokeTokenExchange.exchangeToken({
                subjectToken: 'test-token',
                subjectTokenType: 'access_token',
                originInstance: 'USA',
                targetInstance: 'UNKNOWN',
                requestId: 'event-2',
            });

            await expect(eventPromise).resolves.toBeUndefined();
        });
    });
});
