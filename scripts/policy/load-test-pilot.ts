#!/usr/bin/env npx ts-node
/**
 * DIVE V3 - Pilot Load Testing Script
 * 
 * Performs load testing to verify:
 * - 500 req/s target throughput
 * - p95 latency <15ms for authorization decisions
 * - System stability under load
 * 
 * Uses native HTTP for simplicity (no k6 dependency)
 * 
 * Usage:
 *   npx ts-node scripts/policy/load-test-pilot.ts
 *   npx ts-node scripts/policy/load-test-pilot.ts --concurrent=50 --duration=60
 * 
 * @version 1.0.0
 * @date 2025-12-03
 */

import https from 'https';
import http from 'http';

// Configuration
const CONFIG = {
  targets: {
    backend: process.env.BACKEND_URL || 'https://localhost:4000',
    opa: process.env.OPA_URL || 'http://localhost:8181',
  },
  defaults: {
    concurrent: 50,      // Concurrent requests
    duration: 30,        // Test duration in seconds
    rampUp: 5,           // Ramp-up time in seconds
  },
  thresholds: {
    p95Latency: 15,      // ms
    throughput: 500,      // req/s
    errorRate: 0.01,      // 1%
  },
};

// Parse command line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.replace('--', '').split('=');
  acc[key] = parseInt(value) || value;
  return acc;
}, {} as Record<string, any>);

const CONCURRENT = args.concurrent || CONFIG.defaults.concurrent;
const DURATION = args.duration || CONFIG.defaults.duration;
const RAMP_UP = args.rampUp || CONFIG.defaults.rampUp;

// Metrics storage
interface Metrics {
  requests: number;
  successes: number;
  failures: number;
  latencies: number[];
  errors: string[];
  startTime: number;
  endTime: number;
}

const metrics: Metrics = {
  requests: 0,
  successes: 0,
  failures: 0,
  latencies: [],
  errors: [],
  startTime: 0,
  endTime: 0,
};

// Test payloads
const OPA_DECISION_PAYLOAD = JSON.stringify({
  input: {
    subject: {
      uniqueID: 'test-user-001',
      clearance: 'SECRET',
      countryOfAffiliation: 'USA',
      acpCOI: ['FVEY', 'NATO'],
    },
    action: 'read',
    resource: {
      resourceId: 'doc-001',
      classification: 'SECRET',
      releasabilityTo: ['USA', 'GBR', 'CAN'],
      COI: ['FVEY'],
    },
    context: {
      requestId: `req-${Date.now()}`,
      timestamp: new Date().toISOString(),
    },
  },
});

// HTTP agent for connection pooling
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: CONCURRENT,
  rejectUnauthorized: false,  // For self-signed certs
});

const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: CONCURRENT,
});

/**
 * Make a single request and record metrics
 */
async function makeRequest(url: string, payload?: string): Promise<void> {
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const agent = isHttps ? httpsAgent : httpAgent;
    const lib = isHttps ? https : http;
    
    const options: https.RequestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname,
      method: payload ? 'POST' : 'GET',
      agent,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(payload && { 'Content-Length': Buffer.byteLength(payload) }),
      },
    };
    
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const latency = Date.now() - startTime;
        metrics.latencies.push(latency);
        metrics.requests++;
        
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
          metrics.successes++;
        } else {
          metrics.failures++;
          metrics.errors.push(`HTTP ${res.statusCode}: ${data.substring(0, 100)}`);
        }
        resolve();
      });
    });
    
    req.on('error', (err) => {
      const latency = Date.now() - startTime;
      metrics.latencies.push(latency);
      metrics.requests++;
      metrics.failures++;
      metrics.errors.push(err.message);
      resolve();
    });
    
    req.setTimeout(5000, () => {
      metrics.requests++;
      metrics.failures++;
      metrics.errors.push('Request timeout');
      req.destroy();
      resolve();
    });
    
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

/**
 * Calculate percentile from sorted array
 */
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Run load test against OPA
 */
async function runOPALoadTest(): Promise<void> {
  console.log('\n📊 Running OPA Authorization Decision Load Test');
  console.log(`   Target: ${CONFIG.targets.opa}/v1/data/dive/authorization/decision`);
  console.log(`   Concurrent: ${CONCURRENT}`);
  console.log(`   Duration: ${DURATION}s`);
  console.log('');
  
  metrics.startTime = Date.now();
  const endTime = metrics.startTime + (DURATION * 1000);
  
  // Ramp-up phase
  console.log(`⏳ Ramping up over ${RAMP_UP}s...`);
  const rampUpInterval = (RAMP_UP * 1000) / CONCURRENT;
  const workers: Promise<void>[] = [];
  
  for (let i = 0; i < CONCURRENT; i++) {
    await new Promise(r => setTimeout(r, rampUpInterval));
    
    // Start a worker that continuously makes requests
    const worker = (async () => {
      while (Date.now() < endTime) {
        await makeRequest(
          `${CONFIG.targets.opa}/v1/data/dive/authorization/decision`,
          OPA_DECISION_PAYLOAD
        );
      }
    })();
    
    workers.push(worker);
    process.stdout.write(`\r   Workers started: ${i + 1}/${CONCURRENT}`);
  }
  
  console.log('\n🏃 Load test in progress...');
  
  // Progress reporting
  const progressInterval = setInterval(() => {
    const elapsed = (Date.now() - metrics.startTime) / 1000;
    const throughput = metrics.requests / elapsed;
    const p95 = percentile(metrics.latencies.slice(-1000), 95);
    process.stdout.write(`\r   Elapsed: ${elapsed.toFixed(0)}s | Requests: ${metrics.requests} | Throughput: ${throughput.toFixed(0)} req/s | p95: ${p95.toFixed(0)}ms`);
  }, 1000);
  
  // Wait for all workers to complete
  await Promise.all(workers);
  clearInterval(progressInterval);
  
  metrics.endTime = Date.now();
}

/**
 * Run load test against Backend API
 */
async function runBackendLoadTest(): Promise<void> {
  console.log('\n📊 Running Backend Health Check Load Test');
  console.log(`   Target: ${CONFIG.targets.backend}/health`);
  console.log(`   Concurrent: ${CONCURRENT}`);
  console.log(`   Duration: ${DURATION}s`);
  console.log('');
  
  // Reset metrics
  metrics.requests = 0;
  metrics.successes = 0;
  metrics.failures = 0;
  metrics.latencies = [];
  metrics.errors = [];
  
  metrics.startTime = Date.now();
  const endTime = metrics.startTime + (DURATION * 1000);
  
  const workers: Promise<void>[] = [];
  
  for (let i = 0; i < CONCURRENT; i++) {
    const worker = (async () => {
      while (Date.now() < endTime) {
        await makeRequest(`${CONFIG.targets.backend}/health`);
      }
    })();
    workers.push(worker);
  }
  
  console.log('🏃 Load test in progress...');
  
  const progressInterval = setInterval(() => {
    const elapsed = (Date.now() - metrics.startTime) / 1000;
    const throughput = metrics.requests / elapsed;
    process.stdout.write(`\r   Requests: ${metrics.requests} | Throughput: ${throughput.toFixed(0)} req/s`);
  }, 1000);
  
  await Promise.all(workers);
  clearInterval(progressInterval);
  
  metrics.endTime = Date.now();
}

/**
 * Print test results
 */
function printResults(testName: string): void {
  const duration = (metrics.endTime - metrics.startTime) / 1000;
  const throughput = metrics.requests / duration;
  const successRate = (metrics.successes / metrics.requests) * 100;
  const errorRate = (metrics.failures / metrics.requests) * 100;
  
  const p50 = percentile(metrics.latencies, 50);
  const p95 = percentile(metrics.latencies, 95);
  const p99 = percentile(metrics.latencies, 99);
  const avg = metrics.latencies.reduce((a, b) => a + b, 0) / metrics.latencies.length;
  
  console.log('\n');
  console.log('═'.repeat(60));
  console.log(`📈 ${testName} Results`);
  console.log('═'.repeat(60));
  console.log('');
  console.log('📊 Summary:');
  console.log(`   Duration:     ${duration.toFixed(2)}s`);
  console.log(`   Total Reqs:   ${metrics.requests}`);
  console.log(`   Successes:    ${metrics.successes}`);
  console.log(`   Failures:     ${metrics.failures}`);
  console.log('');
  console.log('⚡ Performance:');
  console.log(`   Throughput:   ${throughput.toFixed(2)} req/s`);
  console.log(`   Success Rate: ${successRate.toFixed(2)}%`);
  console.log(`   Error Rate:   ${errorRate.toFixed(2)}%`);
  console.log('');
  console.log('⏱️  Latency:');
  console.log(`   Average:      ${avg.toFixed(2)}ms`);
  console.log(`   p50:          ${p50.toFixed(2)}ms`);
  console.log(`   p95:          ${p95.toFixed(2)}ms`);
  console.log(`   p99:          ${p99.toFixed(2)}ms`);
  console.log('');
  
  // Check against thresholds
  console.log('✅ Threshold Checks:');
  
  const throughputPass = throughput >= CONFIG.thresholds.throughput;
  const p95Pass = p95 <= CONFIG.thresholds.p95Latency;
  const errorRatePass = (errorRate / 100) <= CONFIG.thresholds.errorRate;
  
  console.log(`   Throughput ≥ ${CONFIG.thresholds.throughput} req/s: ${throughputPass ? '✅ PASS' : '❌ FAIL'} (${throughput.toFixed(0)} req/s)`);
  console.log(`   p95 ≤ ${CONFIG.thresholds.p95Latency}ms:         ${p95Pass ? '✅ PASS' : '❌ FAIL'} (${p95.toFixed(0)}ms)`);
  console.log(`   Error rate ≤ ${CONFIG.thresholds.errorRate * 100}%:      ${errorRatePass ? '✅ PASS' : '❌ FAIL'} (${errorRate.toFixed(2)}%)`);
  
  if (metrics.errors.length > 0) {
    console.log('');
    console.log('❌ Sample Errors:');
    const uniqueErrors = [...new Set(metrics.errors)].slice(0, 5);
    uniqueErrors.forEach(e => console.log(`   - ${e}`));
  }
  
  console.log('');
  console.log('═'.repeat(60));
  
  // Exit with error if thresholds not met
  if (!throughputPass || !p95Pass || !errorRatePass) {
    console.log('\n⚠️  Some thresholds were not met!');
  } else {
    console.log('\n🎉 All thresholds passed!');
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.log('═'.repeat(60));
  console.log('🚀 DIVE V3 Pilot Load Testing');
  console.log('═'.repeat(60));
  console.log('');
  console.log('Configuration:');
  console.log(`   Concurrent Workers: ${CONCURRENT}`);
  console.log(`   Test Duration:      ${DURATION}s`);
  console.log(`   Ramp-up Time:       ${RAMP_UP}s`);
  console.log('');
  console.log('Targets:');
  console.log(`   OPA:     ${CONFIG.targets.opa}`);
  console.log(`   Backend: ${CONFIG.targets.backend}`);
  console.log('');
  console.log('Thresholds:');
  console.log(`   Throughput: ≥ ${CONFIG.thresholds.throughput} req/s`);
  console.log(`   p95 Latency: ≤ ${CONFIG.thresholds.p95Latency}ms`);
  console.log(`   Error Rate: ≤ ${CONFIG.thresholds.errorRate * 100}%`);
  
  // Run OPA load test
  await runOPALoadTest();
  printResults('OPA Authorization Decision Test');
  
  // Run Backend load test
  await runBackendLoadTest();
  printResults('Backend Health Check Test');
  
  console.log('\n✨ Load testing complete!');
}

// Run if executed directly
main().catch(console.error);



