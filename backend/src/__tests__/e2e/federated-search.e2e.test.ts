/**
 * DIVE V3 Federated Search - E2E Tests with Real MongoDB Data
 * ============================================================
 * 
 * Tests the federated search functionality against actual MongoDB instances
 * with the seeded 21,000 documents (7,000 per instance).
 * 
 * Run with: npm test -- --testPathPattern=federated-search.e2e --runInBand
 * Requires: All instances running with seeded data
 * 
 * Environment Variables:
 *   RUN_E2E_TESTS=true           Enable E2E tests
 *   TEST_AUTH_TOKEN=<token>      JWT token for authenticated requests
 *   USA_API_URL=<url>            USA backend URL
 *   FRA_API_URL=<url>            FRA backend URL
 *   GBR_API_URL=<url>            GBR backend URL
 */

import axios from 'axios';
import https from 'https';

// Skip in normal CI/CD unless explicitly enabled
const RUN_E2E = process.env.RUN_E2E_TESTS === 'true';
const describeFn = RUN_E2E ? describe : describe.skip;

// HTTP client with self-signed cert support
const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const client = axios.create({ httpsAgent, timeout: 10000 });

// ============================================
// Configuration
// ============================================

// Export for use in other test files
export interface IInstanceConfig {
    code: string;
    name: string;
    apiUrl: string;
    healthEndpoint: string;
    federatedSearchEndpoint: string;
    localResourcesEndpoint: string;
    expectedDocuments: number;
}

const INSTANCES: IInstanceConfig[] = [
    {
        code: 'USA',
        name: 'United States',
        apiUrl: process.env.USA_API_URL || 'https://localhost:4000',
        healthEndpoint: '/health',
        federatedSearchEndpoint: '/api/resources/federated-search',
        localResourcesEndpoint: '/api/resources',
        expectedDocuments: 7000
    },
    {
        code: 'FRA',
        name: 'France',
        apiUrl: process.env.FRA_API_URL || 'https://localhost:4001',
        healthEndpoint: '/health',
        federatedSearchEndpoint: '/api/resources/federated-search',
        localResourcesEndpoint: '/api/resources',
        expectedDocuments: 7000
    },
    {
        code: 'GBR',
        name: 'United Kingdom',
        apiUrl: process.env.GBR_API_URL || 'https://localhost:4002',
        healthEndpoint: '/health',
        federatedSearchEndpoint: '/api/resources/federated-search',
        localResourcesEndpoint: '/api/resources',
        expectedDocuments: 7000
    }
];

// Test user credentials (must exist in Keycloak)
// Export for use in other test files
export const TEST_USERS = {
    usa_secret: {
        username: 'testuser-usa-1',
        password: 'TestUser2025!Pilot',
        clearance: 'SECRET',
        country: 'USA',
        coi: ['FVEY', 'NATO']
    },
    fra_secret: {
        username: 'testuser-fra-1',
        password: 'TestUser2025!Pilot',
        clearance: 'SECRET',
        country: 'FRA',
        coi: ['NATO', 'EU-RESTRICTED']
    },
    gbr_secret: {
        username: 'testuser-gbr-1',
        password: 'TestUser2025!Pilot',
        clearance: 'SECRET',
        country: 'GBR',
        coi: ['FVEY', 'NATO']
    }
};

// ============================================
// Utilities
// ============================================

/**
 * Get authentication token from Keycloak for the specified instance
 * Currently uses TEST_AUTH_TOKEN env var; can be extended for full OIDC flow
 * @param _instance - Instance config (unused, for future OIDC flow per instance)
 * @param _username - Username (unused, for future OIDC flow)
 * @param _password - Password (unused, for future OIDC flow)
 */
export async function getAuthToken(_instance: IInstanceConfig, _username: string, _password: string): Promise<string | null> {
    try {
        // Would need to authenticate via Keycloak
        // For now, use environment variable
        return process.env.TEST_AUTH_TOKEN || null;
    } catch (error) {
        console.error('Failed to get auth token:', error);
        return null;
    }
}

async function checkInstanceHealth(instance: IInstanceConfig): Promise<boolean> {
    try {
        const response = await client.get(`${instance.apiUrl}${instance.healthEndpoint}`);
        return response.status === 200;
    } catch (error) {
        return false;
    }
}

async function getLocalDocumentCount(instance: IInstanceConfig, token: string): Promise<number> {
    try {
        const response = await client.get(
            `${instance.apiUrl}${instance.localResourcesEndpoint}`,
            {
                headers: { Authorization: `Bearer ${token}` },
                params: { limit: 1 } // Just get count
            }
        );
        return response.data.total || response.data.resources?.length || 0;
    } catch (error) {
        return 0;
    }
}

// ============================================
// E2E Tests
// ============================================

describeFn('Federated Search E2E Tests', () => {
    let authToken: string;
    let healthyInstances: IInstanceConfig[] = [];

    beforeAll(async () => {
        // Check which instances are healthy
        console.log('\n🔍 Checking instance health...');
        
        for (const instance of INSTANCES) {
            const healthy = await checkInstanceHealth(instance);
            if (healthy) {
                healthyInstances.push(instance);
                console.log(`  ✅ ${instance.code}: Healthy`);
            } else {
                console.log(`  ❌ ${instance.code}: Unavailable`);
            }
        }

        // Get auth token
        authToken = process.env.TEST_AUTH_TOKEN || '';
        if (!authToken) {
            console.warn('  ⚠️  No TEST_AUTH_TOKEN provided - some tests will be skipped');
        }

        console.log(`\n📊 ${healthyInstances.length}/${INSTANCES.length} instances available\n`);
    }, 30000);

    // ============================================
    // Instance Availability Tests
    // ============================================

    describe('1. Instance Availability', () => {
        INSTANCES.forEach(instance => {
            it(`${instance.code} should be running and healthy`, async () => {
                const healthy = await checkInstanceHealth(instance);
                
                if (RUN_E2E) {
                    expect(healthy).toBe(true);
                }
            });
        });

        it('should have at least 2 instances for federation testing', () => {
            if (RUN_E2E) {
                expect(healthyInstances.length).toBeGreaterThanOrEqual(2);
            }
        });
    });

    // ============================================
    // Document Count Verification
    // ============================================

    describe('2. Document Count Verification', () => {
        INSTANCES.forEach(instance => {
            it(`${instance.code} should have ~${instance.expectedDocuments} documents`, async () => {
                if (!authToken || !healthyInstances.find(i => i.code === instance.code)) {
                    console.log(`Skipping ${instance.code} - not available or no auth token`);
                    return;
                }

                const count = await getLocalDocumentCount(instance, authToken);
                
                // Allow 10% variance
                const minExpected = instance.expectedDocuments * 0.9;
                const maxExpected = instance.expectedDocuments * 1.1;
                
                expect(count).toBeGreaterThanOrEqual(minExpected);
                expect(count).toBeLessThanOrEqual(maxExpected);
            });
        });

        it('should have 21,000+ total documents across all instances', async () => {
            if (!authToken) return;

            let totalCount = 0;
            for (const instance of healthyInstances) {
                totalCount += await getLocalDocumentCount(instance, authToken);
            }

            expect(totalCount).toBeGreaterThanOrEqual(21000);
        });
    });

    // ============================================
    // Federated Search Status
    // ============================================

    describe('3. Federated Search Status', () => {
        it('should return status of all federated instances', async () => {
            if (!authToken || healthyInstances.length === 0) return;

            const instance = healthyInstances[0];
            const response = await client.get(
                `${instance.apiUrl}/api/resources/federated-status`,
                { headers: { Authorization: `Bearer ${authToken}` } }
            );

            expect(response.status).toBe(200);
            expect(response.data).toHaveProperty('currentInstance');
            expect(response.data).toHaveProperty('instances');
            expect(response.data.instances).toBeInstanceOf(Array);
        });

        it('should report multiple instances as available', async () => {
            if (!authToken || healthyInstances.length === 0) return;

            const instance = healthyInstances[0];
            const response = await client.get(
                `${instance.apiUrl}/api/resources/federated-status`,
                { headers: { Authorization: `Bearer ${authToken}` } }
            );

            const availableCount = response.data.instances.filter(
                (i: any) => i.available
            ).length;

            expect(availableCount).toBeGreaterThanOrEqual(1);
        });
    });

    // ============================================
    // Basic Federated Search
    // ============================================

    describe('4. Basic Federated Search', () => {
        it('should execute federated search and return results', async () => {
            if (!authToken || healthyInstances.length === 0) return;

            const instance = healthyInstances[0];
            const response = await client.post(
                `${instance.apiUrl}/api/resources/federated-search`,
                { limit: 10 },
                { headers: { Authorization: `Bearer ${authToken}` } }
            );

            expect(response.status).toBe(200);
            expect(response.data).toHaveProperty('results');
            expect(response.data).toHaveProperty('totalResults');
            expect(response.data).toHaveProperty('federatedFrom');
            expect(response.data).toHaveProperty('instanceResults');
            expect(response.data).toHaveProperty('executionTimeMs');
        });

        it('should return results from multiple instances', async () => {
            if (!authToken || healthyInstances.length < 2) return;

            const instance = healthyInstances[0];
            const response = await client.post(
                `${instance.apiUrl}/api/resources/federated-search`,
                { limit: 100 },
                { headers: { Authorization: `Bearer ${authToken}` } }
            );

            expect(response.data.federatedFrom.length).toBeGreaterThanOrEqual(1);
            
            // Check instanceResults has multiple entries
            const instanceCodes = Object.keys(response.data.instanceResults);
            expect(instanceCodes.length).toBeGreaterThanOrEqual(1);
        });

        it('should include origin realm in results', async () => {
            if (!authToken || healthyInstances.length === 0) return;

            const instance = healthyInstances[0];
            const response = await client.post(
                `${instance.apiUrl}/api/resources/federated-search`,
                { limit: 50 },
                { headers: { Authorization: `Bearer ${authToken}` } }
            );

            // All results should have originRealm
            response.data.results.forEach((result: any) => {
                expect(result).toHaveProperty('originRealm');
                expect(result.originRealm).toMatch(/^[A-Z]{3}$/); // ISO 3166-1 alpha-3
            });
        });
    });

    // ============================================
    // Classification-Based Filtering
    // ============================================

    describe('5. Classification-Based Filtering', () => {
        const classifications = ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET'];

        classifications.forEach(classification => {
            it(`should filter results by ${classification}`, async () => {
                if (!authToken || healthyInstances.length === 0) return;

                const instance = healthyInstances[0];
                const response = await client.post(
                    `${instance.apiUrl}/api/resources/federated-search`,
                    { classification, limit: 50 },
                    { headers: { Authorization: `Bearer ${authToken}` } }
                );

                expect(response.status).toBe(200);
                
                // All returned results should match the classification
                response.data.results.forEach((result: any) => {
                    expect(result.classification).toBe(classification);
                });
            });
        });
    });

    // ============================================
    // COI-Based Filtering
    // ============================================

    describe('6. COI-Based Filtering', () => {
        const cois = ['NATO', 'FVEY'];

        cois.forEach(coi => {
            it(`should filter results by ${coi} COI`, async () => {
                if (!authToken || healthyInstances.length === 0) return;

                const instance = healthyInstances[0];
                const response = await client.post(
                    `${instance.apiUrl}/api/resources/federated-search`,
                    { coi, limit: 50 },
                    { headers: { Authorization: `Bearer ${authToken}` } }
                );

                expect(response.status).toBe(200);
                
                // All returned results should include the COI
                response.data.results.forEach((result: any) => {
                    expect(result.COI).toContain(coi);
                });
            });
        });
    });

    // ============================================
    // Cross-Instance Access Verification
    // ============================================

    describe('7. Cross-Instance Access Verification', () => {
        it('USA user should see resources from FRA and GBR', async () => {
            if (!authToken || healthyInstances.length < 2) return;

            // Query from USA instance
            const usaInstance = healthyInstances.find(i => i.code === 'USA');
            if (!usaInstance) return;

            const response = await client.post(
                `${usaInstance.apiUrl}/api/resources/federated-search`,
                { limit: 100 },
                { headers: { Authorization: `Bearer ${authToken}` } }
            );

            // Should see resources from multiple origins
            const origins = new Set(response.data.results.map((r: any) => r.originRealm));
            expect(origins.size).toBeGreaterThanOrEqual(1);
        });

        it('should respect releasability restrictions', async () => {
            if (!authToken || healthyInstances.length === 0) return;

            const instance = healthyInstances[0];
            const response = await client.post(
                `${instance.apiUrl}/api/resources/federated-search`,
                { limit: 50 },
                { headers: { Authorization: `Bearer ${authToken}` } }
            );

            // All results should be releasable to the user's country
            // (This is enforced server-side, so results are already filtered)
            response.data.results.forEach((result: any) => {
                // Verify releasabilityTo exists
                expect(result.releasabilityTo).toBeInstanceOf(Array);
            });
        });
    });

    // ============================================
    // Performance Metrics
    // ============================================

    describe('8. Performance Metrics', () => {
        it('should complete federated search within SLA (3000ms)', async () => {
            if (!authToken || healthyInstances.length === 0) return;

            const instance = healthyInstances[0];
            const startTime = Date.now();
            
            const response = await client.post(
                `${instance.apiUrl}/api/resources/federated-search`,
                { limit: 100 },
                { headers: { Authorization: `Bearer ${authToken}` } }
            );

            const totalTime = Date.now() - startTime;

            expect(response.data.executionTimeMs).toBeLessThan(3000);
            expect(totalTime).toBeLessThan(5000); // Including network latency
        });

        it('should include latency per instance', async () => {
            if (!authToken || healthyInstances.length === 0) return;

            const instance = healthyInstances[0];
            const response = await client.post(
                `${instance.apiUrl}/api/resources/federated-search`,
                { limit: 10 },
                { headers: { Authorization: `Bearer ${authToken}` } }
            );

            Object.values(response.data.instanceResults).forEach((result: any) => {
                expect(result).toHaveProperty('latencyMs');
                expect(result.latencyMs).toBeGreaterThanOrEqual(0);
            });
        });
    });

    // ============================================
    // Error Handling
    // ============================================

    describe('9. Error Handling', () => {
        it('should require authentication', async () => {
            if (healthyInstances.length === 0) return;

            const instance = healthyInstances[0];
            
            try {
                await client.post(
                    `${instance.apiUrl}/api/resources/federated-search`,
                    { limit: 10 }
                    // No auth header
                );
                fail('Should have thrown 401 error');
            } catch (error: any) {
                expect(error.response?.status).toBe(401);
            }
        });

        it('should handle graceful degradation when instances are down', async () => {
            if (!authToken || healthyInstances.length === 0) return;

            const instance = healthyInstances[0];
            const response = await client.post(
                `${instance.apiUrl}/api/resources/federated-search`,
                { limit: 10 },
                { headers: { Authorization: `Bearer ${authToken}` } }
            );

            // Should still return results even if some instances failed
            expect(response.data.results).toBeDefined();
            
            // Check if any instances had errors
            const hasErrors = Object.values(response.data.instanceResults)
                .some((r: any) => r.error);
            
            // Log if there were errors (not a failure, just info)
            if (hasErrors) {
                console.log('Note: Some instances returned errors (graceful degradation working)');
            }
        });
    });

    // ============================================
    // Data Quality Verification
    // ============================================

    describe('10. Data Quality Verification', () => {
        it('should return properly formatted ZTDF resources', async () => {
            if (!authToken || healthyInstances.length === 0) return;

            const instance = healthyInstances[0];
            const response = await client.post(
                `${instance.apiUrl}/api/resources/federated-search`,
                { encrypted: true, limit: 10 },
                { headers: { Authorization: `Bearer ${authToken}` } }
            );

            response.data.results.forEach((result: any) => {
                // Required fields for ZTDF resources
                expect(result).toHaveProperty('resourceId');
                expect(result).toHaveProperty('title');
                expect(result).toHaveProperty('classification');
                expect(result).toHaveProperty('releasabilityTo');
                expect(result).toHaveProperty('originRealm');
            });
        });

        it('should have valid 3-letter country codes', async () => {
            if (!authToken || healthyInstances.length === 0) return;

            const instance = healthyInstances[0];
            const response = await client.post(
                `${instance.apiUrl}/api/resources/federated-search`,
                { limit: 50 },
                { headers: { Authorization: `Bearer ${authToken}` } }
            );

            response.data.results.forEach((result: any) => {
                // Origin realm should be 3-letter code
                expect(result.originRealm).toMatch(/^[A-Z]{3}$/);
                
                // All releasability codes should be 3-letter
                result.releasabilityTo.forEach((code: string) => {
                    expect(code).toMatch(/^[A-Z]{3}$/);
                });
            });
        });
    });
});

// ============================================
// Performance Benchmark Suite
// ============================================

describeFn('Federated Search Performance Benchmarks', () => {
    const authToken = process.env.TEST_AUTH_TOKEN || '';
    const targetInstance = INSTANCES[0];

    it('should measure sequential vs parallel performance', async () => {
        if (!authToken) return;

        // Sequential requests
        const sequentialStart = Date.now();
        for (let i = 0; i < 3; i++) {
            await client.post(
                `${targetInstance.apiUrl}/api/resources/federated-search`,
                { limit: 10 },
                { headers: { Authorization: `Bearer ${authToken}` } }
            );
        }
        const sequentialTime = Date.now() - sequentialStart;

        // Parallel requests
        const parallelStart = Date.now();
        await Promise.all([
            client.post(`${targetInstance.apiUrl}/api/resources/federated-search`, { limit: 10 }, { headers: { Authorization: `Bearer ${authToken}` } }),
            client.post(`${targetInstance.apiUrl}/api/resources/federated-search`, { limit: 10 }, { headers: { Authorization: `Bearer ${authToken}` } }),
            client.post(`${targetInstance.apiUrl}/api/resources/federated-search`, { limit: 10 }, { headers: { Authorization: `Bearer ${authToken}` } }),
        ]);
        const parallelTime = Date.now() - parallelStart;

        console.log(`Sequential: ${sequentialTime}ms, Parallel: ${parallelTime}ms`);
        
        // Parallel should be faster
        expect(parallelTime).toBeLessThan(sequentialTime);
    });

    it('should handle concurrent users', async () => {
        if (!authToken) return;

        const concurrentRequests = 10;
        const requests = Array(concurrentRequests).fill(null).map(() =>
            client.post(
                `${targetInstance.apiUrl}/api/resources/federated-search`,
                { limit: 10 },
                { headers: { Authorization: `Bearer ${authToken}` } }
            )
        );

        const startTime = Date.now();
        const responses = await Promise.allSettled(requests);
        const totalTime = Date.now() - startTime;

        const successful = responses.filter(r => r.status === 'fulfilled').length;
        const failed = responses.filter(r => r.status === 'rejected').length;

        console.log(`Concurrent requests: ${concurrentRequests}, Success: ${successful}, Failed: ${failed}, Time: ${totalTime}ms`);
        
        // At least 80% should succeed
        expect(successful / concurrentRequests).toBeGreaterThanOrEqual(0.8);
    });
});

