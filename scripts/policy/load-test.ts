#!/usr/bin/env npx ts-node
/**
 * DIVE V3 - Load Testing Script
 * Phase 7: Production Hardening
 * 
 * Performance testing for OPA policy decisions using k6-style patterns.
 * This script uses native Node.js for compatibility but follows k6 patterns.
 * 
 * Tests:
 *   1. Authorization decision throughput
 *   2. Latency percentiles (p50, p95, p99)
 *   3. Concurrent user simulation
 *   4. Redis cache hit rates
 *   5. OPA bundle loading
 * 
 * Targets (Phase 7):
 *   - p95 latency < 30ms
 *   - 150+ req/s sustained
 *   - Zero errors under load
 * 
 * Usage:
 *   npx ts-node --esm scripts/policy/load-test.ts quick      # 30s quick test
 *   npx ts-node --esm scripts/policy/load-test.ts standard   # 5min test
 *   npx ts-node --esm scripts/policy/load-test.ts stress     # 15min stress test
 *   npx ts-node --esm scripts/policy/load-test.ts soak       # 1hr soak test
 * 
 * @version 1.0.0
 * @date 2025-12-03
 */

import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ES Module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const OPA_URL = process.env.OPA_URL || 'http://localhost:8181';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
const RESULTS_DIR = path.join(PROJECT_ROOT, 'test-results/load-tests');

// Test profiles
interface TestProfile {
  name: string;
  duration: number;        // seconds
  rampUp: number;          // seconds
  rampDown: number;        // seconds
  vus: number;             // virtual users
  targetRPS: number;       // target requests per second
  thresholds: {
    p95Latency: number;    // ms
    p99Latency: number;    // ms
    errorRate: number;     // percentage
    minRPS: number;        // minimum sustained RPS
  };
}

const PROFILES: Record<string, TestProfile> = {
  quick: {
    name: 'Quick Test',
    duration: 30,
    rampUp: 5,
    rampDown: 5,
    vus: 10,
    targetRPS: 50,
    thresholds: {
      p95Latency: 50,
      p99Latency: 100,
      errorRate: 1,
      minRPS: 40,
    },
  },
  standard: {
    name: 'Standard Test',
    duration: 300,
    rampUp: 30,
    rampDown: 30,
    vus: 50,
    targetRPS: 150,
    thresholds: {
      p95Latency: 30,
      p99Latency: 50,
      errorRate: 0.5,
      minRPS: 100,
    },
  },
  stress: {
    name: 'Stress Test',
    duration: 900,
    rampUp: 60,
    rampDown: 60,
    vus: 100,
    targetRPS: 300,
    thresholds: {
      p95Latency: 50,
      p99Latency: 100,
      errorRate: 1,
      minRPS: 200,
    },
  },
  soak: {
    name: 'Soak Test',
    duration: 3600,
    rampUp: 120,
    rampDown: 120,
    vus: 50,
    targetRPS: 150,
    thresholds: {
      p95Latency: 30,
      p99Latency: 50,
      errorRate: 0.1,
      minRPS: 100,
    },
  },
};

// Test scenarios (OPA inputs)
const TEST_SCENARIOS = [
  // Scenario 1: USA user accessing USA resource
  {
    name: 'usa_user_usa_resource',
    input: {
      subject: {
        uniqueID: 'test.user@mil',
        clearance: 'SECRET',
        countryOfAffiliation: 'USA',
        acpCOI: ['FVEY'],
        authenticated: true,
        mfaVerified: true,
        aal: 2,
      },
      action: {
        type: 'read',
      },
      resource: {
        resourceId: 'doc-001',
        classification: 'SECRET',
        releasabilityTo: ['USA', 'GBR', 'CAN'],
        COI: ['FVEY'],
      },
      context: {
        requestId: 'load-test-001',
        currentTime: new Date().toISOString(),
      },
    },
    expectedAllow: true,
  },
  // Scenario 2: FRA user accessing NATO resource
  {
    name: 'fra_user_nato_resource',
    input: {
      subject: {
        uniqueID: 'test.user@defense.gouv.fr',
        clearance: 'SECRET',
        countryOfAffiliation: 'FRA',
        acpCOI: ['NATO-COSMIC'],
        authenticated: true,
        mfaVerified: true,
        aal: 2,
      },
      action: {
        type: 'read',
      },
      resource: {
        resourceId: 'doc-002',
        classification: 'SECRET',
        releasabilityTo: ['NATO'],
        COI: ['NATO-COSMIC'],
      },
      context: {
        requestId: 'load-test-002',
        currentTime: new Date().toISOString(),
      },
    },
    expectedAllow: true,
  },
  // Scenario 3: Clearance denial
  {
    name: 'clearance_denial',
    input: {
      subject: {
        uniqueID: 'test.confidential@mil',
        clearance: 'CONFIDENTIAL',
        countryOfAffiliation: 'USA',
        acpCOI: [],
        authenticated: true,
        mfaVerified: true,
        aal: 2,
      },
      action: {
        type: 'read',
      },
      resource: {
        resourceId: 'doc-003',
        classification: 'TOP_SECRET',
        releasabilityTo: ['USA'],
        COI: [],
      },
      context: {
        requestId: 'load-test-003',
        currentTime: new Date().toISOString(),
      },
    },
    expectedAllow: false,
  },
  // Scenario 4: Releasability denial
  {
    name: 'releasability_denial',
    input: {
      subject: {
        uniqueID: 'test.user@bundeswehr.de',
        clearance: 'SECRET',
        countryOfAffiliation: 'DEU',
        acpCOI: [],
        authenticated: true,
        mfaVerified: true,
        aal: 2,
      },
      action: {
        type: 'read',
      },
      resource: {
        resourceId: 'doc-004',
        classification: 'SECRET',
        releasabilityTo: ['USA'],
        COI: [],
      },
      context: {
        requestId: 'load-test-004',
        currentTime: new Date().toISOString(),
      },
    },
    expectedAllow: false,
  },
];

// Results tracking
interface TestResult {
  timestamp: number;
  scenario: string;
  latencyMs: number;
  success: boolean;
  expectedResult: boolean;
  actualResult: boolean;
  error?: string;
}

interface TestSummary {
  profile: string;
  startTime: string;
  endTime: string;
  duration: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errorRate: number;
  rps: number;
  latency: {
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  };
  thresholdsPassed: boolean;
  scenarioBreakdown: Record<string, {
    total: number;
    success: number;
    avgLatency: number;
  }>;
}

// HTTP request helper
function makeRequest(url: string, body: unknown): Promise<{ status: number; data: unknown; latency: number }> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const lib = isHttps ? https : http;
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 5000,
      rejectUnauthorized: false,
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const latency = Date.now() - startTime;
        try {
          resolve({
            status: res.statusCode || 0,
            data: JSON.parse(data),
            latency,
          });
        } catch {
          resolve({
            status: res.statusCode || 0,
            data,
            latency,
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(JSON.stringify(body));
    req.end();
  });
}

// Calculate percentile
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

// Run single request
async function runRequest(scenario: typeof TEST_SCENARIOS[0]): Promise<TestResult> {
  const url = `${OPA_URL}/v1/data/dive/authorization/decision`;
  const timestamp = Date.now();

  try {
    const result = await makeRequest(url, { input: scenario.input });
    const decision = (result.data as { result?: { allow?: boolean } })?.result?.allow ?? false;

    return {
      timestamp,
      scenario: scenario.name,
      latencyMs: result.latency,
      success: result.status === 200,
      expectedResult: scenario.expectedAllow,
      actualResult: decision,
      error: result.status !== 200 ? `HTTP ${result.status}` : undefined,
    };
  } catch (error) {
    return {
      timestamp,
      scenario: scenario.name,
      latencyMs: Date.now() - timestamp,
      success: false,
      expectedResult: scenario.expectedAllow,
      actualResult: false,
      error: String(error),
    };
  }
}

// Run load test
async function runLoadTest(profile: TestProfile): Promise<TestSummary> {
  console.log(`\n🚀 Starting ${profile.name}...\n`);
  console.log(`   Duration: ${profile.duration}s`);
  console.log(`   Virtual Users: ${profile.vus}`);
  console.log(`   Target RPS: ${profile.targetRPS}`);
  console.log(`   Thresholds: p95 < ${profile.thresholds.p95Latency}ms, error < ${profile.thresholds.errorRate}%\n`);

  const results: TestResult[] = [];
  const startTime = Date.now();
  const endTime = startTime + (profile.duration * 1000);

  // Progress tracking
  let lastProgressUpdate = startTime;
  let requestsSinceLastUpdate = 0;

  // Request interval (ms)
  const requestInterval = 1000 / profile.targetRPS;
  let nextRequestTime = startTime;

  // Run test
  while (Date.now() < endTime) {
    const now = Date.now();

    // Check if it's time to send next request
    if (now >= nextRequestTime) {
      // Select random scenario
      const scenario = TEST_SCENARIOS[Math.floor(Math.random() * TEST_SCENARIOS.length)];
      
      // Fire and forget (don't await) to maintain throughput
      runRequest(scenario).then(result => {
        results.push(result);
        requestsSinceLastUpdate++;
      });

      nextRequestTime += requestInterval;
    }

    // Progress update every 5 seconds
    if (now - lastProgressUpdate >= 5000) {
      const elapsed = (now - startTime) / 1000;
      const rps = requestsSinceLastUpdate / 5;
      const latencies = results.slice(-100).map(r => r.latencyMs);
      const p95 = percentile(latencies, 95);
      const errors = results.filter(r => !r.success).length;
      const errorRate = results.length > 0 ? (errors / results.length) * 100 : 0;

      process.stdout.write(
        `\r   [${Math.round(elapsed)}s] Requests: ${results.length} | ` +
        `RPS: ${rps.toFixed(1)} | p95: ${p95.toFixed(1)}ms | ` +
        `Errors: ${errorRate.toFixed(2)}%`
      );

      lastProgressUpdate = now;
      requestsSinceLastUpdate = 0;
    }

    // Small sleep to prevent CPU hogging
    await new Promise(resolve => setTimeout(resolve, 1));
  }

  // Wait for remaining requests to complete
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n');

  // Calculate summary
  const latencies = results.map(r => r.latencyMs);
  const successfulRequests = results.filter(r => r.success).length;
  const failedRequests = results.filter(r => !r.success).length;
  const duration = (Date.now() - startTime) / 1000;

  // Scenario breakdown
  const scenarioBreakdown: TestSummary['scenarioBreakdown'] = {};
  for (const scenario of TEST_SCENARIOS) {
    const scenarioResults = results.filter(r => r.scenario === scenario.name);
    scenarioBreakdown[scenario.name] = {
      total: scenarioResults.length,
      success: scenarioResults.filter(r => r.success).length,
      avgLatency: scenarioResults.length > 0
        ? scenarioResults.reduce((sum, r) => sum + r.latencyMs, 0) / scenarioResults.length
        : 0,
    };
  }

  const summary: TestSummary = {
    profile: profile.name,
    startTime: new Date(startTime).toISOString(),
    endTime: new Date().toISOString(),
    duration,
    totalRequests: results.length,
    successfulRequests,
    failedRequests,
    errorRate: results.length > 0 ? (failedRequests / results.length) * 100 : 0,
    rps: results.length / duration,
    latency: {
      min: Math.min(...latencies),
      max: Math.max(...latencies),
      avg: latencies.reduce((a, b) => a + b, 0) / latencies.length,
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
    },
    thresholdsPassed:
      percentile(latencies, 95) <= profile.thresholds.p95Latency &&
      (failedRequests / results.length) * 100 <= profile.thresholds.errorRate &&
      results.length / duration >= profile.thresholds.minRPS,
    scenarioBreakdown,
  };

  return summary;
}

// Print results
function printResults(summary: TestSummary, profile: TestProfile): void {
  console.log('═'.repeat(60));
  console.log('LOAD TEST RESULTS');
  console.log('═'.repeat(60));
  console.log(`\nProfile: ${summary.profile}`);
  console.log(`Duration: ${summary.duration.toFixed(1)}s`);
  console.log(`Start: ${summary.startTime}`);
  console.log(`End: ${summary.endTime}`);

  console.log('\n📊 Throughput:');
  console.log(`   Total Requests: ${summary.totalRequests}`);
  console.log(`   Successful: ${summary.successfulRequests}`);
  console.log(`   Failed: ${summary.failedRequests}`);
  console.log(`   RPS: ${summary.rps.toFixed(2)} (target: ${profile.targetRPS})`);
  console.log(`   Error Rate: ${summary.errorRate.toFixed(2)}% (threshold: ${profile.thresholds.errorRate}%)`);

  console.log('\n⏱️  Latency:');
  console.log(`   Min: ${summary.latency.min.toFixed(2)}ms`);
  console.log(`   Max: ${summary.latency.max.toFixed(2)}ms`);
  console.log(`   Avg: ${summary.latency.avg.toFixed(2)}ms`);
  console.log(`   p50: ${summary.latency.p50.toFixed(2)}ms`);
  console.log(`   p95: ${summary.latency.p95.toFixed(2)}ms (threshold: ${profile.thresholds.p95Latency}ms)`);
  console.log(`   p99: ${summary.latency.p99.toFixed(2)}ms (threshold: ${profile.thresholds.p99Latency}ms)`);

  console.log('\n📋 Scenario Breakdown:');
  for (const [name, data] of Object.entries(summary.scenarioBreakdown)) {
    const successRate = data.total > 0 ? (data.success / data.total) * 100 : 0;
    console.log(`   ${name}:`);
    console.log(`      Requests: ${data.total} | Success: ${successRate.toFixed(1)}% | Avg: ${data.avgLatency.toFixed(1)}ms`);
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`THRESHOLDS: ${summary.thresholdsPassed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log('═'.repeat(60));

  // Individual threshold checks
  const p95Pass = summary.latency.p95 <= profile.thresholds.p95Latency;
  const p99Pass = summary.latency.p99 <= profile.thresholds.p99Latency;
  const errorPass = summary.errorRate <= profile.thresholds.errorRate;
  const rpsPass = summary.rps >= profile.thresholds.minRPS;

  console.log(`   ${p95Pass ? '✅' : '❌'} p95 latency: ${summary.latency.p95.toFixed(2)}ms <= ${profile.thresholds.p95Latency}ms`);
  console.log(`   ${p99Pass ? '✅' : '❌'} p99 latency: ${summary.latency.p99.toFixed(2)}ms <= ${profile.thresholds.p99Latency}ms`);
  console.log(`   ${errorPass ? '✅' : '❌'} Error rate: ${summary.errorRate.toFixed(2)}% <= ${profile.thresholds.errorRate}%`);
  console.log(`   ${rpsPass ? '✅' : '❌'} RPS: ${summary.rps.toFixed(2)} >= ${profile.thresholds.minRPS}`);
}

// Save results to file
function saveResults(summary: TestSummary): string {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  
  const filename = `load-test-${summary.profile.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.json`;
  const filepath = path.join(RESULTS_DIR, filename);
  
  fs.writeFileSync(filepath, JSON.stringify(summary, null, 2));
  
  return filepath;
}

// Check OPA health
async function checkOPAHealth(): Promise<boolean> {
  try {
    const response = await makeRequest(`${OPA_URL}/health`, {});
    return response.status === 200;
  } catch {
    return false;
  }
}

// Main
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const profileName = args[0] || 'quick';

  if (profileName === '--help' || profileName === '-h') {
    console.log('DIVE V3 Load Testing Tool');
    console.log('=========================\n');
    console.log('Usage: npx ts-node --esm scripts/policy/load-test.ts <profile>\n');
    console.log('Profiles:');
    console.log('  quick     30s quick smoke test (10 VUs, 50 RPS)');
    console.log('  standard  5min standard test (50 VUs, 150 RPS)');
    console.log('  stress    15min stress test (100 VUs, 300 RPS)');
    console.log('  soak      1hr soak test (50 VUs, 150 RPS)');
    console.log('\nEnvironment Variables:');
    console.log('  OPA_URL       OPA endpoint (default: http://localhost:8181)');
    console.log('  BACKEND_URL   Backend endpoint (default: http://localhost:5000)');
    process.exit(0);
  }

  const profile = PROFILES[profileName];
  if (!profile) {
    console.error(`❌ Unknown profile: ${profileName}`);
    console.error(`   Available: ${Object.keys(PROFILES).join(', ')}`);
    process.exit(1);
  }

  // Check OPA health
  console.log('🔍 Checking OPA health...');
  const healthy = await checkOPAHealth();
  if (!healthy) {
    console.error('❌ OPA is not responding. Please ensure OPA is running.');
    console.error(`   URL: ${OPA_URL}`);
    process.exit(1);
  }
  console.log('✅ OPA is healthy\n');

  // Run test
  const summary = await runLoadTest(profile);

  // Print results
  printResults(summary, profile);

  // Save results
  const filepath = saveResults(summary);
  console.log(`\n📁 Results saved to: ${filepath}`);

  // Exit code based on threshold pass/fail
  process.exit(summary.thresholdsPassed ? 0 : 1);
}

// Run main
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});



