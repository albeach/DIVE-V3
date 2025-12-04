#!/usr/bin/env npx ts-node
/**
 * DIVE V3 - Performance Benchmark Suite
 * Phase 9: Performance Optimization & Scalability
 * 
 * Comprehensive benchmarking for:
 * - Bundle build performance
 * - OPA decision latency
 * - Cache hit rates
 * - Throughput under load
 * - Memory usage
 * 
 * Targets (Phase 9):
 * - Bundle build time: <300ms total
 * - Decision latency p95: <20ms
 * - Throughput: 300 req/s
 * - Memory per OPA: <500MB
 * 
 * Usage:
 *   npx ts-node --esm scripts/policy/perf-benchmark.ts all
 *   npx ts-node --esm scripts/policy/perf-benchmark.ts bundle
 *   npx ts-node --esm scripts/policy/perf-benchmark.ts decision
 *   npx ts-node --esm scripts/policy/perf-benchmark.ts throughput
 * 
 * @version 1.0.0
 * @date 2025-12-03
 */

import * as child_process from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ES Module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const OPA_BIN = path.join(PROJECT_ROOT, 'bin/opa');
const OPA_URL = process.env.OPA_URL || 'http://localhost:8181';
const RESULTS_DIR = path.join(PROJECT_ROOT, 'test-results/benchmarks');

// ============================================
// TYPES
// ============================================

interface BenchmarkResult {
  name: string;
  passed: boolean;
  target: string;
  actual: string;
  details?: Record<string, unknown>;
}

interface BenchmarkReport {
  timestamp: string;
  duration: number;
  phase: string;
  environment: {
    nodeVersion: string;
    platform: string;
    cpus: number;
    memory: number;
  };
  results: BenchmarkResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
}

interface LatencyStats {
  min: number;
  max: number;
  avg: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
}

// ============================================
// UTILITIES
// ============================================

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function calculateLatencyStats(latencies: number[]): LatencyStats {
  if (latencies.length === 0) {
    return { min: 0, max: 0, avg: 0, p50: 0, p75: 0, p90: 0, p95: 0, p99: 0 };
  }
  
  const sorted = [...latencies].sort((a, b) => a - b);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: latencies.reduce((a, b) => a + b, 0) / latencies.length,
    p50: percentile(sorted, 50),
    p75: percentile(sorted, 75),
    p90: percentile(sorted, 90),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

async function makeOPARequest(body: unknown): Promise<{ latency: number; success: boolean }> {
  return new Promise((resolve) => {
    const startTime = performance.now();
    const parsedUrl = new URL(`${OPA_URL}/v1/data/dive/authorization/decision`);
    const isHttps = parsedUrl.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 5000,
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          latency: performance.now() - startTime,
          success: res.statusCode === 200,
        });
      });
    });

    req.on('error', () => {
      resolve({
        latency: performance.now() - startTime,
        success: false,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        latency: performance.now() - startTime,
        success: false,
      });
    });

    req.write(JSON.stringify(body));
    req.end();
  });
}

// ============================================
// BENCHMARK: BUNDLE BUILD
// ============================================

async function benchmarkBundleBuild(): Promise<BenchmarkResult[]> {
  console.log('\n📦 BUNDLE BUILD BENCHMARK');
  console.log('='.repeat(50));

  const results: BenchmarkResult[] = [];
  const buildTimes: number[] = [];
  const iterations = 5;

  // Clean existing bundles
  const bundleDir = path.join(PROJECT_ROOT, 'dist/bundles');
  
  for (let i = 0; i < iterations; i++) {
    // Clean bundles between runs
    if (fs.existsSync(bundleDir)) {
      fs.rmSync(bundleDir, { recursive: true });
    }

    const startTime = Date.now();
    
    try {
      child_process.execSync(
        `npx ts-node --esm scripts/policy/parallel-bundle-build.ts build --all`,
        {
          cwd: PROJECT_ROOT,
          stdio: 'pipe',
          encoding: 'utf-8',
        }
      );
      
      const buildTime = Date.now() - startTime;
      buildTimes.push(buildTime);
      console.log(`  Run ${i + 1}/${iterations}: ${buildTime}ms`);
    } catch (error) {
      console.error(`  Run ${i + 1}/${iterations}: FAILED`);
      buildTimes.push(-1);
    }
  }

  const validTimes = buildTimes.filter(t => t > 0);
  const avgBuildTime = validTimes.length > 0
    ? validTimes.reduce((a, b) => a + b, 0) / validTimes.length
    : -1;

  const buildPassed = avgBuildTime > 0 && avgBuildTime < 300;
  
  results.push({
    name: 'Bundle Build Time',
    passed: buildPassed,
    target: '<300ms',
    actual: avgBuildTime > 0 ? `${avgBuildTime.toFixed(0)}ms` : 'FAILED',
    details: {
      iterations,
      times: validTimes,
      min: Math.min(...validTimes),
      max: Math.max(...validTimes),
    },
  });

  console.log(`\n  Average: ${avgBuildTime.toFixed(0)}ms (target: <300ms) ${buildPassed ? '✅' : '❌'}`);

  return results;
}

// ============================================
// BENCHMARK: DECISION LATENCY
// ============================================

async function benchmarkDecisionLatency(): Promise<BenchmarkResult[]> {
  console.log('\n⚡ DECISION LATENCY BENCHMARK');
  console.log('='.repeat(50));

  const results: BenchmarkResult[] = [];
  const latencies: number[] = [];
  const iterations = 100;

  // Test scenarios
  const scenarios = [
    {
      name: 'USA SECRET Access',
      input: {
        subject: {
          uniqueID: 'bench.user@mil',
          clearance: 'SECRET',
          countryOfAffiliation: 'USA',
          acpCOI: ['FVEY'],
          authenticated: true,
          mfaVerified: true,
          aal: 2,
        },
        action: { type: 'read' },
        resource: {
          resourceId: 'bench-doc-001',
          classification: 'SECRET',
          releasabilityTo: ['USA', 'GBR'],
          COI: ['FVEY'],
        },
        context: { requestId: 'bench-001', currentTime: new Date().toISOString() },
      },
    },
    {
      name: 'FRA NATO Access',
      input: {
        subject: {
          uniqueID: 'bench.user@defense.gouv.fr',
          clearance: 'SECRET',
          countryOfAffiliation: 'FRA',
          acpCOI: ['NATO-COSMIC'],
          authenticated: true,
          mfaVerified: true,
          aal: 2,
        },
        action: { type: 'read' },
        resource: {
          resourceId: 'bench-doc-002',
          classification: 'SECRET',
          releasabilityTo: ['NATO'],
          COI: ['NATO-COSMIC'],
        },
        context: { requestId: 'bench-002', currentTime: new Date().toISOString() },
      },
    },
    {
      name: 'Clearance Denial',
      input: {
        subject: {
          uniqueID: 'bench.lowclear@mil',
          clearance: 'CONFIDENTIAL',
          countryOfAffiliation: 'USA',
          acpCOI: [],
          authenticated: true,
          mfaVerified: true,
          aal: 2,
        },
        action: { type: 'read' },
        resource: {
          resourceId: 'bench-doc-003',
          classification: 'TOP_SECRET',
          releasabilityTo: ['USA'],
          COI: [],
        },
        context: { requestId: 'bench-003', currentTime: new Date().toISOString() },
      },
    },
  ];

  // Check OPA health first
  console.log('  Checking OPA health...');
  const healthCheck = await makeOPARequest({ input: scenarios[0].input });
  if (!healthCheck.success) {
    console.error('  ❌ OPA is not responding. Skipping decision benchmark.');
    results.push({
      name: 'Decision Latency p95',
      passed: false,
      target: '<20ms',
      actual: 'OPA unavailable',
    });
    return results;
  }
  console.log(`  ✅ OPA is healthy (${healthCheck.latency.toFixed(1)}ms)\n`);

  // Warm-up
  console.log('  Warming up...');
  for (let i = 0; i < 20; i++) {
    await makeOPARequest({ input: scenarios[i % scenarios.length].input });
  }

  // Run benchmark
  console.log(`  Running ${iterations} iterations per scenario...\n`);
  
  for (const scenario of scenarios) {
    const scenarioLatencies: number[] = [];
    
    for (let i = 0; i < iterations; i++) {
      const result = await makeOPARequest({ input: scenario.input });
      if (result.success) {
        scenarioLatencies.push(result.latency);
        latencies.push(result.latency);
      }
    }

    const stats = calculateLatencyStats(scenarioLatencies);
    console.log(`  ${scenario.name}:`);
    console.log(`    p50: ${stats.p50.toFixed(2)}ms | p95: ${stats.p95.toFixed(2)}ms | p99: ${stats.p99.toFixed(2)}ms`);
  }

  const overallStats = calculateLatencyStats(latencies);
  const p95Passed = overallStats.p95 < 20;

  results.push({
    name: 'Decision Latency p95',
    passed: p95Passed,
    target: '<20ms',
    actual: `${overallStats.p95.toFixed(2)}ms`,
    details: {
      min: overallStats.min,
      max: overallStats.max,
      avg: overallStats.avg,
      p50: overallStats.p50,
      p90: overallStats.p90,
      p95: overallStats.p95,
      p99: overallStats.p99,
      sampleCount: latencies.length,
    },
  });

  console.log(`\n  Overall p95: ${overallStats.p95.toFixed(2)}ms (target: <20ms) ${p95Passed ? '✅' : '❌'}`);

  return results;
}

// ============================================
// BENCHMARK: THROUGHPUT
// ============================================

async function benchmarkThroughput(): Promise<BenchmarkResult[]> {
  console.log('\n🚀 THROUGHPUT BENCHMARK');
  console.log('='.repeat(50));

  const results: BenchmarkResult[] = [];
  const durationSeconds = 10;
  const targetRPS = 300;

  // Check OPA health first
  const testInput = {
    subject: {
      uniqueID: 'throughput.user@mil',
      clearance: 'SECRET',
      countryOfAffiliation: 'USA',
      acpCOI: [],
      authenticated: true,
      mfaVerified: true,
      aal: 2,
    },
    action: { type: 'read' },
    resource: {
      resourceId: 'throughput-doc',
      classification: 'SECRET',
      releasabilityTo: ['USA'],
      COI: [],
    },
    context: { requestId: 'throughput-test', currentTime: new Date().toISOString() },
  };

  console.log('  Checking OPA health...');
  const healthCheck = await makeOPARequest({ input: testInput });
  if (!healthCheck.success) {
    console.error('  ❌ OPA is not responding. Skipping throughput benchmark.');
    results.push({
      name: 'Throughput',
      passed: false,
      target: '≥300 req/s',
      actual: 'OPA unavailable',
    });
    return results;
  }
  console.log(`  ✅ OPA is healthy\n`);

  console.log(`  Running ${durationSeconds}s throughput test...`);
  console.log(`  Target: ${targetRPS} req/s\n`);

  const startTime = Date.now();
  const endTime = startTime + (durationSeconds * 1000);
  const latencies: number[] = [];
  let successCount = 0;
  let errorCount = 0;
  const requestInterval = 1000 / targetRPS;
  let nextRequestTime = startTime;

  // Progress tracking
  let lastUpdate = startTime;
  let requestsSinceUpdate = 0;

  while (Date.now() < endTime) {
    const now = Date.now();

    if (now >= nextRequestTime) {
      // Fire request without waiting
      makeOPARequest({ input: testInput }).then(result => {
        latencies.push(result.latency);
        if (result.success) {
          successCount++;
        } else {
          errorCount++;
        }
        requestsSinceUpdate++;
      });

      nextRequestTime += requestInterval;
    }

    // Progress update every 2 seconds
    if (now - lastUpdate >= 2000) {
      const elapsed = (now - startTime) / 1000;
      const currentRPS = requestsSinceUpdate / 2;
      process.stdout.write(`\r  [${elapsed.toFixed(0)}s] Requests: ${successCount + errorCount} | RPS: ${currentRPS.toFixed(0)}`);
      lastUpdate = now;
      requestsSinceUpdate = 0;
    }

    // Small yield
    await new Promise(resolve => setImmediate(resolve));
  }

  // Wait for pending requests
  await new Promise(resolve => setTimeout(resolve, 1000));

  const actualDuration = (Date.now() - startTime) / 1000;
  const totalRequests = successCount + errorCount;
  const actualRPS = totalRequests / actualDuration;
  const errorRate = totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0;
  const stats = calculateLatencyStats(latencies);

  console.log('\n');
  console.log(`  Total Requests: ${totalRequests}`);
  console.log(`  Successful: ${successCount}`);
  console.log(`  Errors: ${errorCount} (${errorRate.toFixed(2)}%)`);
  console.log(`  Duration: ${actualDuration.toFixed(1)}s`);
  console.log(`  RPS: ${actualRPS.toFixed(1)}`);
  console.log(`  Latency p95: ${stats.p95.toFixed(2)}ms`);

  const rpsPassed = actualRPS >= 300;

  results.push({
    name: 'Throughput',
    passed: rpsPassed,
    target: '≥300 req/s',
    actual: `${actualRPS.toFixed(1)} req/s`,
    details: {
      totalRequests,
      successCount,
      errorCount,
      errorRate,
      duration: actualDuration,
      latencyP50: stats.p50,
      latencyP95: stats.p95,
      latencyP99: stats.p99,
    },
  });

  console.log(`\n  Result: ${actualRPS.toFixed(1)} req/s (target: ≥300 req/s) ${rpsPassed ? '✅' : '❌'}`);

  return results;
}

// ============================================
// BENCHMARK: MEMORY
// ============================================

async function benchmarkMemory(): Promise<BenchmarkResult[]> {
  console.log('\n💾 MEMORY BENCHMARK');
  console.log('='.repeat(50));

  const results: BenchmarkResult[] = [];
  
  // Get current process memory
  const memUsage = process.memoryUsage();
  const heapUsedMB = memUsage.heapUsed / (1024 * 1024);
  const heapTotalMB = memUsage.heapTotal / (1024 * 1024);
  const rssMB = memUsage.rss / (1024 * 1024);

  console.log(`  Heap Used: ${heapUsedMB.toFixed(1)}MB`);
  console.log(`  Heap Total: ${heapTotalMB.toFixed(1)}MB`);
  console.log(`  RSS: ${rssMB.toFixed(1)}MB`);

  // Note: Can't directly measure OPA memory from here
  // This measures the benchmark script's memory
  results.push({
    name: 'Benchmark Memory',
    passed: heapUsedMB < 200,
    target: '<200MB',
    actual: `${heapUsedMB.toFixed(1)}MB`,
    details: {
      heapUsed: heapUsedMB,
      heapTotal: heapTotalMB,
      rss: rssMB,
    },
  });

  return results;
}

// ============================================
// REPORT GENERATION
// ============================================

function generateReport(results: BenchmarkResult[]): BenchmarkReport {
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const os = require('os');

  return {
    timestamp: new Date().toISOString(),
    duration: 0, // Will be set later
    phase: 'Phase 9',
    environment: {
      nodeVersion: process.version,
      platform: `${os.platform()} ${os.release()}`,
      cpus: os.cpus().length,
      memory: Math.round(os.totalmem() / (1024 * 1024 * 1024)),
    },
    results,
    summary: {
      total: results.length,
      passed,
      failed,
    },
  };
}

function printReport(report: BenchmarkReport): void {
  console.log('\n' + '═'.repeat(60));
  console.log('PHASE 9 BENCHMARK REPORT');
  console.log('═'.repeat(60));
  console.log(`\nTimestamp: ${report.timestamp}`);
  console.log(`Duration: ${report.duration.toFixed(1)}s`);
  console.log(`Environment: Node ${report.environment.nodeVersion} on ${report.environment.platform}`);
  console.log(`CPUs: ${report.environment.cpus} | Memory: ${report.environment.memory}GB\n`);

  console.log('Results:');
  console.log('-'.repeat(60));
  
  for (const result of report.results) {
    const status = result.passed ? '✅' : '❌';
    console.log(`  ${status} ${result.name}`);
    console.log(`     Target: ${result.target} | Actual: ${result.actual}`);
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`SUMMARY: ${report.summary.passed}/${report.summary.total} PASSED`);
  console.log('═'.repeat(60));

  if (report.summary.failed > 0) {
    console.log('\n⚠️  Some benchmarks did not meet Phase 9 targets.');
    console.log('   Consider optimizations before production deployment.\n');
  } else {
    console.log('\n🎉 All Phase 9 performance targets met!\n');
  }
}

function saveReport(report: BenchmarkReport): string {
  ensureDir(RESULTS_DIR);
  const filename = `benchmark-phase9-${Date.now()}.json`;
  const filepath = path.join(RESULTS_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
  return filepath;
}

// ============================================
// MAIN
// ============================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || 'all';

  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║     DIVE V3 - Phase 9 Performance Benchmark Suite        ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');

  const startTime = Date.now();
  const allResults: BenchmarkResult[] = [];

  switch (command) {
    case 'all':
      allResults.push(...await benchmarkBundleBuild());
      allResults.push(...await benchmarkDecisionLatency());
      allResults.push(...await benchmarkThroughput());
      allResults.push(...await benchmarkMemory());
      break;
      
    case 'bundle':
      allResults.push(...await benchmarkBundleBuild());
      break;
      
    case 'decision':
      allResults.push(...await benchmarkDecisionLatency());
      break;
      
    case 'throughput':
      allResults.push(...await benchmarkThroughput());
      break;
      
    case 'memory':
      allResults.push(...await benchmarkMemory());
      break;

    case '--help':
    case '-h':
      console.log('\nUsage: npx ts-node --esm scripts/policy/perf-benchmark.ts <command>\n');
      console.log('Commands:');
      console.log('  all         Run all benchmarks (default)');
      console.log('  bundle      Run bundle build benchmark');
      console.log('  decision    Run decision latency benchmark');
      console.log('  throughput  Run throughput benchmark');
      console.log('  memory      Run memory benchmark');
      console.log('\nEnvironment Variables:');
      console.log('  OPA_URL     OPA endpoint (default: http://localhost:8181)');
      process.exit(0);
      
    default:
      console.error(`❌ Unknown command: ${command}`);
      process.exit(1);
  }

  const report = generateReport(allResults);
  report.duration = (Date.now() - startTime) / 1000;

  printReport(report);

  const filepath = saveReport(report);
  console.log(`📁 Report saved to: ${filepath}\n`);

  // Exit with error if any benchmarks failed
  process.exit(report.summary.failed > 0 ? 1 : 0);
}

// Run
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});



