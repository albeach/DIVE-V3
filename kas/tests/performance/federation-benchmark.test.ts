/**
 * ACP-240 KAS Phase 3.5: Performance Benchmarking Suite
 * 
 * Tests performance metrics for:
 * - Single KAS operations
 * - 2-KAS federation
 * - 3-KAS federation
 * - Throughput under load
 * - Federation overhead
 * - Circuit breaker recovery
 * - Connection pooling efficiency
 * 
 * Performance Targets:
 * - Single KAS: p95 < 200ms, 100 req/s
 * - 2-KAS: p95 < 350ms, 75 req/s
 * - 3-KAS: p95 < 500ms, 50 req/s
 * - Federation overhead: < 150ms per hop
 * - Circuit breaker recovery: < 60s
 */

import axios from 'axios';
import https from 'https';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { generateKeyPair, generateTestJWT, wrapKey, computePolicyBinding } from '../helpers/test-utilities';

interface IPerformanceMetrics {
    // Latency metrics
    p50: number;
    p95: number;
    p99: number;
    mean: number;
    min: number;
    max: number;
    
    // Throughput metrics
    requestsPerSecond: number;
    concurrentConnections: number;
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    
    // Federation metrics
    localLatency?: number;
    federationOverhead?: number;
    networkLatency?: number;
    
    // Error metrics
    errorRate: number;
    timeoutRate: number;
    circuitBreakerTrips?: number;
    
    // Test metadata
    testDuration: number;
    timestamp: string;
}

describe('Phase 3.5: Performance Benchmarks', () => {
    // Test configuration (localhost is appropriate for test environment)
    // Override with environment variables in CI/CD: KAS_USA_URL, KAS_FRA_URL, KAS_GBR_URL
    const KAS_USA_URL = process.env.KAS_USA_URL || 'https://localhost:8081';
    const KAS_FRA_URL = process.env.KAS_FRA_URL || 'https://localhost:8082';
    const KAS_GBR_URL = process.env.KAS_GBR_URL || 'https://localhost:8083';
    
    const httpsAgent = new https.Agent({
        rejectUnauthorized: false,
        keepAlive: true,
        maxSockets: 100
    });
    
    // Utility to calculate percentiles
    const calculatePercentile = (values: number[], percentile: number): number => {
        const sorted = [...values].sort((a, b) => a - b);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)];
    };
    
    const calculateMetrics = (latencies: number[], startTime: number, endTime: number, successes: number, failures: number): IPerformanceMetrics => {
        const testDuration = endTime - startTime;
        const totalRequests = latencies.length;
        
        return {
            p50: calculatePercentile(latencies, 50),
            p95: calculatePercentile(latencies, 95),
            p99: calculatePercentile(latencies, 99),
            mean: latencies.reduce((a, b) => a + b, 0) / latencies.length,
            min: Math.min(...latencies),
            max: Math.max(...latencies),
            requestsPerSecond: (totalRequests / testDuration) * 1000,
            concurrentConnections: 1, // Will be set by test
            totalRequests,
            successfulRequests: successes,
            failedRequests: failures,
            errorRate: (failures / totalRequests) * 100,
            timeoutRate: 0, // Will be calculated separately
            testDuration,
            timestamp: new Date().toISOString()
        };
    };
    
    const savePerformanceReport = (metrics: Record<string, IPerformanceMetrics>) => {
        const reportPath = path.join(__dirname, '../performance/report.json');
        const reportDir = path.dirname(reportPath);
        
        if (!fs.existsSync(reportDir)) {
            fs.mkdirSync(reportDir, { recursive: true });
        }
        
        fs.writeFileSync(reportPath, JSON.stringify(metrics, null, 2));
        console.log(`\n📊 Performance report saved to: ${reportPath}`);
    };
    
    const performanceReport: Record<string, IPerformanceMetrics> = {};
    
    // ============================================
    // 1. Single-KAS Latency (Target: p95 < 200ms)
    // ============================================
    it('should measure single-KAS latency (p95 < 200ms)', async () => {
        const iterations = 100;
        const latencies: number[] = [];
        let successes = 0;
        let failures = 0;
        
        const { publicKey: clientPublicKey } = generateKeyPair();
        const { publicKey: kasPublicKey } = generateKeyPair();
        
        const testStartTime = Date.now();
        
        for (let i = 0; i < iterations; i++) {
            const startTime = Date.now();
            
            try {
                const keySplit = Buffer.from(crypto.randomBytes(32));
                const policy = {
                    policyId: `policy-perf-${i}`,
                    dissem: {
                        classification: 'SECRET',
                        releasabilityTo: ['USA'],
                        COI: ['US-ONLY']
                    }
                };
                
                const kao = {
                    keyAccessObjectId: `kao-perf-${i}`,
                    wrappedKey: wrapKey(keySplit, kasPublicKey),
                    url: `${KAS_USA_URL}/rewrap`,
                    kid: 'kas-usa-key-001',
                    policyBinding: computePolicyBinding(policy, keySplit),
                    sid: `session-perf-${i}`
                };
                
                const token = generateTestJWT({
                    sub: 'testuser-usa',
                    uniqueID: 'testuser-usa',
                    clearance: 'SECRET',
                    countryOfAffiliation: 'USA',
                    acpCOI: ['US-ONLY']
                });
                
                const response = await axios.post(
                    `${KAS_USA_URL}/rewrap`,
                    {
                        clientPublicKey,
                        requests: [{ policy, keyAccessObjects: [kao] }]
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        httpsAgent,
                        timeout: 5000
                    }
                );
                
                const latency = Date.now() - startTime;
                latencies.push(latency);
                
                if (response.status === 200) {
                    successes++;
                } else {
                    failures++;
                }
            } catch (error) {
                failures++;
                latencies.push(Date.now() - startTime);
            }
        }
        
        const testEndTime = Date.now();
        const metrics = calculateMetrics(latencies, testStartTime, testEndTime, successes, failures);
        metrics.concurrentConnections = 1;
        
        performanceReport['single-kas'] = metrics;
        
        console.log('\n📈 Single-KAS Performance:');
        console.log(`   p50: ${metrics.p50.toFixed(2)}ms`);
        console.log(`   p95: ${metrics.p95.toFixed(2)}ms`);
        console.log(`   p99: ${metrics.p99.toFixed(2)}ms`);
        console.log(`   mean: ${metrics.mean.toFixed(2)}ms`);
        console.log(`   req/s: ${metrics.requestsPerSecond.toFixed(2)}`);
        console.log(`   success rate: ${((successes / iterations) * 100).toFixed(2)}%`);
        
        // Assert performance targets
        expect(metrics.p95).toBeLessThan(200);
        expect(metrics.errorRate).toBeLessThan(5);
    }, 60000); // 60 second timeout
    
    // ============================================
    // 2. 2-KAS Latency (Target: p95 < 350ms)
    // ============================================
    it('should measure 2-KAS latency (p95 < 350ms)', async () => {
        const iterations = 50;
        const latencies: number[] = [];
        let successes = 0;
        let failures = 0;
        
        const { publicKey: clientPublicKey } = generateKeyPair();
        
        const testStartTime = Date.now();
        
        for (let i = 0; i < iterations; i++) {
            const startTime = Date.now();
            
            try {
                const { publicKey: kasUSAPublicKey } = generateKeyPair();
                const { publicKey: kasFRAPublicKey } = generateKeyPair();
                
                const keySplitUSA = Buffer.from(crypto.randomBytes(32));
                const keySplitFRA = Buffer.from(crypto.randomBytes(32));
                
                const policy = {
                    policyId: `policy-2kas-${i}`,
                    dissem: {
                        classification: 'SECRET',
                        releasabilityTo: ['USA', 'FRA'],
                        COI: ['NATO']
                    }
                };
                
                const kaos = [
                    {
                        keyAccessObjectId: `kao-usa-${i}`,
                        wrappedKey: wrapKey(keySplitUSA, kasUSAPublicKey),
                        url: `${KAS_USA_URL}/rewrap`,
                        kid: 'kas-usa-key-001',
                        policyBinding: computePolicyBinding(policy, keySplitUSA),
                        sid: `session-2kas-${i}`
                    },
                    {
                        keyAccessObjectId: `kao-fra-${i}`,
                        wrappedKey: wrapKey(keySplitFRA, kasFRAPublicKey),
                        url: `${KAS_FRA_URL}/rewrap`,
                        kid: 'kas-fra-key-001',
                        policyBinding: computePolicyBinding(policy, keySplitFRA),
                        sid: `session-2kas-${i}`
                    }
                ];
                
                const token = generateTestJWT({
                    sub: 'testuser-usa',
                    uniqueID: 'testuser-usa',
                    clearance: 'SECRET',
                    countryOfAffiliation: 'USA',
                    acpCOI: ['NATO']
                });
                
                const response = await axios.post(
                    `${KAS_USA_URL}/rewrap`,
                    {
                        clientPublicKey,
                        requests: [{ policy, keyAccessObjects: kaos }]
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        httpsAgent,
                        timeout: 15000
                    }
                );
                
                const latency = Date.now() - startTime;
                latencies.push(latency);
                
                if (response.status === 200) {
                    successes++;
                } else {
                    failures++;
                }
            } catch (error) {
                failures++;
                latencies.push(Date.now() - startTime);
            }
        }
        
        const testEndTime = Date.now();
        const metrics = calculateMetrics(latencies, testStartTime, testEndTime, successes, failures);
        metrics.concurrentConnections = 1;
        
        performanceReport['2-kas'] = metrics;
        
        console.log('\n📈 2-KAS Performance:');
        console.log(`   p50: ${metrics.p50.toFixed(2)}ms`);
        console.log(`   p95: ${metrics.p95.toFixed(2)}ms`);
        console.log(`   p99: ${metrics.p99.toFixed(2)}ms`);
        console.log(`   mean: ${metrics.mean.toFixed(2)}ms`);
        console.log(`   req/s: ${metrics.requestsPerSecond.toFixed(2)}`);
        console.log(`   success rate: ${((successes / iterations) * 100).toFixed(2)}%`);
        
        // Assert performance targets
        expect(metrics.p95).toBeLessThan(350);
        expect(metrics.errorRate).toBeLessThan(10);
    }, 120000);
    
    // ============================================
    // 3. 3-KAS Latency (Target: p95 < 500ms)
    // ============================================
    it('should measure 3-KAS latency (p95 < 500ms)', async () => {
        const iterations = 30;
        const latencies: number[] = [];
        let successes = 0;
        let failures = 0;
        
        const { publicKey: clientPublicKey } = generateKeyPair();
        
        const testStartTime = Date.now();
        
        for (let i = 0; i < iterations; i++) {
            const startTime = Date.now();
            
            try {
                const policy = {
                    policyId: `policy-3kas-${i}`,
                    dissem: {
                        classification: 'SECRET',
                        releasabilityTo: ['USA', 'FRA', 'GBR'],
                        COI: ['NATO']
                    }
                };
                
                const kaos = ['USA', 'FRA', 'GBR'].map((country) => {
                    const keySplit = Buffer.from(crypto.randomBytes(32));
                    const { publicKey: kasPublicKey } = generateKeyPair();
                    const kasUrl = country === 'USA' ? KAS_USA_URL :
                                  country === 'FRA' ? KAS_FRA_URL :
                                  KAS_GBR_URL;
                    
                    return {
                        keyAccessObjectId: `kao-${country.toLowerCase()}-${i}`,
                        wrappedKey: wrapKey(keySplit, kasPublicKey),
                        url: `${kasUrl}/rewrap`,
                        kid: `kas-${country.toLowerCase()}-key-001`,
                        policyBinding: computePolicyBinding(policy, keySplit),
                        sid: `session-3kas-${i}`
                    };
                });
                
                const token = generateTestJWT({
                    sub: 'testuser-usa',
                    uniqueID: 'testuser-usa',
                    clearance: 'SECRET',
                    countryOfAffiliation: 'USA',
                    acpCOI: ['NATO']
                });
                
                const response = await axios.post(
                    `${KAS_USA_URL}/rewrap`,
                    {
                        clientPublicKey,
                        requests: [{ policy, keyAccessObjects: kaos }]
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        httpsAgent,
                        timeout: 20000
                    }
                );
                
                const latency = Date.now() - startTime;
                latencies.push(latency);
                
                if (response.status === 200) {
                    successes++;
                } else {
                    failures++;
                }
            } catch (error) {
                failures++;
                latencies.push(Date.now() - startTime);
            }
        }
        
        const testEndTime = Date.now();
        const metrics = calculateMetrics(latencies, testStartTime, testEndTime, successes, failures);
        metrics.concurrentConnections = 1;
        
        performanceReport['3-kas'] = metrics;
        
        console.log('\n📈 3-KAS Performance:');
        console.log(`   p50: ${metrics.p50.toFixed(2)}ms`);
        console.log(`   p95: ${metrics.p95.toFixed(2)}ms`);
        console.log(`   p99: ${metrics.p99.toFixed(2)}ms`);
        console.log(`   mean: ${metrics.mean.toFixed(2)}ms`);
        console.log(`   req/s: ${metrics.requestsPerSecond.toFixed(2)}`);
        console.log(`   success rate: ${((successes / iterations) * 100).toFixed(2)}%`);
        
        // Assert performance targets
        expect(metrics.p95).toBeLessThan(500);
        expect(metrics.errorRate).toBeLessThan(15);
    }, 180000);
    
    // ============================================
    // 4-10: Additional Performance Tests
    // ============================================
    
    it('should measure throughput at 10 req/s', async () => {
        // Target: 0% errors
        // TODO: Implement load test
    });
    
    it('should measure throughput at 50 req/s', async () => {
        // Target: < 1% errors
        // TODO: Implement load test
    });
    
    it('should measure throughput at 100 req/s', async () => {
        // Target: < 5% errors
        // TODO: Implement load test
    });
    
    it('should measure federation overhead', async () => {
        // Target: < 150ms per hop
        // TODO: Compare local vs federated latency
    });
    
    it('should measure circuit breaker recovery', async () => {
        // Target: < 60s recovery time
        // TODO: Trigger circuit breaker and measure recovery
    });
    
    it('should measure connection pooling efficiency', async () => {
        // Target: 90%+ connection reuse
        // TODO: Monitor connection reuse metrics
    });
    
    // ============================================
    // Generate Performance Report
    // ============================================
    afterAll(() => {
        if (Object.keys(performanceReport).length > 0) {
            savePerformanceReport(performanceReport);
            
            console.log('\n📊 Performance Summary:');
            console.log('==================================');
            
            for (const [testName, metrics] of Object.entries(performanceReport)) {
                console.log(`\n${testName}:`);
                console.log(`   p50: ${metrics.p50.toFixed(2)}ms`);
                console.log(`   p95: ${metrics.p95.toFixed(2)}ms (target: ${testName === 'single-kas' ? '200ms' : testName === '2-kas' ? '350ms' : '500ms'})`);
                console.log(`   p99: ${metrics.p99.toFixed(2)}ms`);
                console.log(`   req/s: ${metrics.requestsPerSecond.toFixed(2)}`);
                console.log(`   error rate: ${metrics.errorRate.toFixed(2)}%`);
                
                // Check if targets are met
                const target = testName === 'single-kas' ? 200 : testName === '2-kas' ? 350 : 500;
                const targetMet = metrics.p95 < target;
                console.log(`   target met: ${targetMet ? '✅' : '❌'}`);
            }
            
            console.log('\n==================================');
        }
    });
});
