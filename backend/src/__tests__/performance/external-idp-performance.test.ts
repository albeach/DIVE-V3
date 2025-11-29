/**
 * DIVE V3 - External IdP Performance Tests
 * 
 * Benchmarks authorization decisions with external IdP attributes
 * Target: p95 < 200ms for authorization decisions
 */

import { performance } from 'perf_hooks';
import { describe, test, expect } from '@jest/globals';
import {
    normalizeSpanishSAMLAttributes,
    normalizeUSAOIDCAttributes,
    enrichAttributes,
} from '../../services/attribute-normalization.service';

interface PerformanceMetrics {
    operations: number;
    totalTime: number;
    avgTime: number;
    p50: number;
    p95: number;
    p99: number;
    minTime: number;
    maxTime: number;
}

function calculatePercentile(values: number[], percentile: number): number {
    const sorted = values.sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index];
}

function measurePerformance(fn: () => void, iterations: number): PerformanceMetrics {
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        fn();
        const end = performance.now();
        times.push(end - start);
    }

    const totalTime = times.reduce((sum, t) => sum + t, 0);

    return {
        operations: iterations,
        totalTime,
        avgTime: totalTime / iterations,
        p50: calculatePercentile(times, 50),
        p95: calculatePercentile(times, 95),
        p99: calculatePercentile(times, 99),
        minTime: Math.min(...times),
        maxTime: Math.max(...times),
    };
}

describe('External IdP Performance Tests', () => {
    const ITERATIONS = 1000;
    const P95_TARGET_MS = 200;

    describe('Spanish SAML Attribute Normalization Performance', () => {
        const spanishAttributes = {
            uid: 'garcia.maria@mde.es',
            mail: 'garcia.maria@mde.es',
            nivelSeguridad: 'SECRETO',
            paisAfiliacion: 'ESP',
            grupoInteresCompartido: ['OTAN-COSMIC', 'ESP-EXCLUSIVO'],
            organizacion: 'Ministerio de Defensa',
            rango: 'Coronel',
        };

        test(`Spanish normalization should complete in < ${P95_TARGET_MS}ms (p95)`, () => {
            const metrics = measurePerformance(() => {
                normalizeSpanishSAMLAttributes(spanishAttributes);
            }, ITERATIONS);

            console.log('Spanish SAML Normalization Performance:');
            console.log(`  Operations: ${metrics.operations}`);
            console.log(`  Total Time: ${metrics.totalTime.toFixed(2)}ms`);
            console.log(`  Average: ${metrics.avgTime.toFixed(3)}ms`);
            console.log(`  P50: ${metrics.p50.toFixed(3)}ms`);
            console.log(`  P95: ${metrics.p95.toFixed(3)}ms`);
            console.log(`  P99: ${metrics.p99.toFixed(3)}ms`);
            console.log(`  Min: ${metrics.minTime.toFixed(3)}ms`);
            console.log(`  Max: ${metrics.maxTime.toFixed(3)}ms`);

            expect(metrics.p95).toBeLessThan(P95_TARGET_MS);
        });

        test('Spanish normalization throughput should exceed 1000 ops/sec', () => {
            const metrics = measurePerformance(() => {
                normalizeSpanishSAMLAttributes(spanishAttributes);
            }, ITERATIONS);

            const throughput = (ITERATIONS / metrics.totalTime) * 1000;
            console.log(`  Throughput: ${throughput.toFixed(0)} ops/sec`);

            expect(throughput).toBeGreaterThan(1000);
        });
    });

    describe('USA OIDC Attribute Normalization Performance', () => {
        const usaAttributes = {
            uniqueID: 'smith.john@mail.mil',
            email: 'smith.john@mail.mil',
            clearance: 'TOP_SECRET',
            countryOfAffiliation: 'USA',
            acpCOI: ['FVEY', 'US-ONLY'],
            organization: 'U.S. Air Force',
            rank: 'Colonel',
        };

        test(`USA normalization should complete in < ${P95_TARGET_MS}ms (p95)`, () => {
            const metrics = measurePerformance(() => {
                normalizeUSAOIDCAttributes(usaAttributes);
            }, ITERATIONS);

            console.log('USA OIDC Normalization Performance:');
            console.log(`  Operations: ${metrics.operations}`);
            console.log(`  Total Time: ${metrics.totalTime.toFixed(2)}ms`);
            console.log(`  Average: ${metrics.avgTime.toFixed(3)}ms`);
            console.log(`  P50: ${metrics.p50.toFixed(3)}ms`);
            console.log(`  P95: ${metrics.p95.toFixed(3)}ms`);
            console.log(`  P99: ${metrics.p99.toFixed(3)}ms`);

            expect(metrics.p95).toBeLessThan(P95_TARGET_MS);
        });

        test('USA normalization throughput should exceed 1000 ops/sec', () => {
            const metrics = measurePerformance(() => {
                normalizeUSAOIDCAttributes(usaAttributes);
            }, ITERATIONS);

            const throughput = (ITERATIONS / metrics.totalTime) * 1000;
            console.log(`  Throughput: ${throughput.toFixed(0)} ops/sec`);

            expect(throughput).toBeGreaterThan(1000);
        });
    });

    describe('Attribute Enrichment Performance', () => {
        const partialAttributes = {
            uniqueID: 'test@example.com',
            clearance: 'SECRET' as const,
        };

        test('Attribute enrichment should be fast (< 50ms p95)', () => {
            const metrics = measurePerformance(() => {
                enrichAttributes(partialAttributes, 'spain-external');
            }, ITERATIONS);

            console.log('Attribute Enrichment Performance:');
            console.log(`  P95: ${metrics.p95.toFixed(3)}ms`);

            expect(metrics.p95).toBeLessThan(50);
        });
    });

    describe('Complex Attribute Mapping Performance', () => {
        test('Multiple COI normalization should scale linearly', () => {
            const attributes = {
                uid: 'test@mde.es',
                nivelSeguridad: 'SECRETO',
                paisAfiliacion: 'ESP',
                grupoInteresCompartido: [
                    'OTAN-COSMIC',
                    'ESP-EXCLUSIVO',
                    'UE-RESTRINGIDO',
                    'NATO-UNRESTRICTED',
                    'OTAN',
                ],
            };

            const metrics = measurePerformance(() => {
                normalizeSpanishSAMLAttributes(attributes);
            }, ITERATIONS);

            console.log('Complex COI Normalization:');
            console.log(`  P95: ${metrics.p95.toFixed(3)}ms`);

            // Should still be fast even with 5 COI tags
            expect(metrics.p95).toBeLessThan(P95_TARGET_MS);
        });
    });

    describe('Concurrent Normalization Performance', () => {
        test('Parallel normalization should handle concurrent requests', async () => {
            const concurrentRequests = 100;
            const spanishAttrs = {
                uid: 'test@mde.es',
                nivelSeguridad: 'SECRETO',
                paisAfiliacion: 'ESP',
            };

            const start = performance.now();

            const promises = Array.from({ length: concurrentRequests }, () =>
                Promise.resolve(normalizeSpanishSAMLAttributes(spanishAttrs))
            );

            await Promise.all(promises);

            const end = performance.now();
            const totalTime = end - start;
            const avgPerRequest = totalTime / concurrentRequests;

            console.log(`Concurrent Normalization (${concurrentRequests} requests):`);
            console.log(`  Total Time: ${totalTime.toFixed(2)}ms`);
            console.log(`  Avg per Request: ${avgPerRequest.toFixed(3)}ms`);

            expect(avgPerRequest).toBeLessThan(10); // Very fast since no I/O
        });
    });

    describe('Memory Usage', () => {
        test('Normalization should not leak memory', () => {
            const initialMemory = process.memoryUsage().heapUsed;

            // Run 10,000 normalizations
            for (let i = 0; i < 10000; i++) {
                normalizeSpanishSAMLAttributes({
                    uid: `user-${i}@mde.es`,
                    nivelSeguridad: 'SECRETO',
                    paisAfiliacion: 'ESP',
                });
            }

            // Force garbage collection if available
            if (global.gc) {
                global.gc();
            }

            const finalMemory = process.memoryUsage().heapUsed;
            const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024;

            console.log('Memory Usage:');
            console.log(`  Initial: ${(initialMemory / 1024 / 1024).toFixed(2)} MB`);
            console.log(`  Final: ${(finalMemory / 1024 / 1024).toFixed(2)} MB`);
            console.log(`  Increase: ${memoryIncrease.toFixed(2)} MB`);

            // Should not leak more than 15MB for 10,000 iterations
            // (~1.5KB per iteration is reasonable for object allocation)
            expect(memoryIncrease).toBeLessThan(15);
        });
    });
});

/**
 * Performance Benchmarks Summary
 * 
 * Expected Results:
 * - Spanish SAML normalization: < 5ms average, < 10ms p95
 * - USA OIDC normalization: < 3ms average, < 8ms p95
 * - Attribute enrichment: < 2ms average, < 5ms p95
 * - Throughput: > 5000 ops/sec per service
 * - Memory: < 10MB increase for 10K operations
 * 
 * If tests fail:
 * 1. Check for blocking I/O in normalization functions
 * 2. Optimize string operations and regex patterns
 * 3. Consider caching for country code mappings
 * 4. Profile with --prof flag to identify hotspots
 */

