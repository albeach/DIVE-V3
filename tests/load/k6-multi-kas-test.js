/**
 * DIVE V3 Multi-KAS API Performance Tests with k6
 * 
 * Tests the Multi-KAS compliance API endpoint that fetches live data
 * from MongoDB (SSOT). Validates response times meet p95 < 200ms target.
 * 
 * Performance Targets:
 * - p95 response time < 200ms
 * - p99 response time < 500ms
 * - 99.9% success rate
 * - Support 50+ concurrent users
 * 
 * @version 1.0.0
 * @date 2026-01-16
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

// Custom metrics for Multi-KAS
const multiKasSuccessRate = new Rate('multi_kas_success');
const multiKasLatency = new Trend('multi_kas_latency_ms');
const kasFederationSuccessRate = new Rate('kas_federation_success');
const kasFederationLatency = new Trend('kas_federation_latency_ms');
const healthSuccessRate = new Rate('health_success');
const healthLatency = new Trend('health_latency_ms');
const errorRate = new Counter('errors');
const activeKasCount = new Gauge('active_kas_count');

// Test configuration - optimized for API performance testing
export const options = {
  scenarios: {
    // Scenario 1: Constant load for baseline measurement
    constant_load: {
      executor: 'constant-vus',
      vus: 10,
      duration: '2m',
      startTime: '0s',
      tags: { scenario: 'constant' },
    },
    // Scenario 2: Ramping load for stress testing
    ramping_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 25 },  // Ramp up
        { duration: '2m', target: 50 },   // Peak load
        { duration: '30s', target: 0 },   // Ramp down
      ],
      startTime: '2m',
      tags: { scenario: 'ramping' },
    },
    // Scenario 3: Spike test
    spike: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 100,
      stages: [
        { duration: '10s', target: 10 },  // Normal
        { duration: '5s', target: 100 },  // Spike
        { duration: '30s', target: 100 }, // Hold spike
        { duration: '10s', target: 10 },  // Back to normal
      ],
      startTime: '5m',
      tags: { scenario: 'spike' },
    },
  },
  thresholds: {
    // Multi-KAS API targets
    'multi_kas_latency_ms': [
      'p(95)<200',  // p95 < 200ms (primary target)
      'p(99)<500',  // p99 < 500ms
      'avg<100',    // Average < 100ms
    ],
    'multi_kas_success': ['rate>0.999'],  // 99.9% success rate
    
    // KAS Federation health targets
    'kas_federation_latency_ms': [
      'p(95)<150',  // Faster endpoint
      'p(99)<300',
    ],
    'kas_federation_success': ['rate>0.999'],
    
    // General health targets
    'health_latency_ms': ['p(95)<100'],
    'health_success': ['rate>0.999'],
    
    // Overall
    'http_req_duration': ['p(95)<300'],
    'http_req_failed': ['rate<0.001'],
    'errors': ['count<10'],
  },
};

// Base URLs
const BASE_URL = __ENV.BASE_URL || 'https://localhost:4000';

// HTTP options for self-signed certs
const httpOptions = {
  insecureSkipTLSVerify: true,
  timeout: '10s',
};

/**
 * Test Multi-KAS compliance API endpoint
 * Target: p95 < 200ms
 */
function testMultiKasApi() {
  const url = `${BASE_URL}/api/compliance/multi-kas`;
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Request-ID': `k6-multikas-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    },
    ...httpOptions,
  };

  const startTime = Date.now();
  const response = http.get(url, params);
  const duration = Date.now() - startTime;

  const success = check(response, {
    'multi-kas status 200': (r) => r.status === 200,
    'multi-kas response time < 200ms': (r) => r.timings.duration < 200,
    'multi-kas has title': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.title && body.title.length > 0;
      } catch {
        return false;
      }
    },
    'multi-kas has kasEndpoints': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.kasEndpoints && Array.isArray(body.kasEndpoints);
      } catch {
        return false;
      }
    },
    'multi-kas has summary': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.summary && typeof body.summary.totalKAS === 'number';
      } catch {
        return false;
      }
    },
    'multi-kas has timestamp': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.timestamp && body.timestamp.length > 0;
      } catch {
        return false;
      }
    },
  });

  multiKasSuccessRate.add(success);
  multiKasLatency.add(response.timings.duration);

  // Track active KAS count
  if (response.status === 200) {
    try {
      const body = JSON.parse(response.body);
      if (body.summary && typeof body.summary.activeKAS === 'number') {
        activeKasCount.add(body.summary.activeKAS);
      }
    } catch {
      // Ignore parse errors
    }
  }

  if (!success) {
    errorRate.add(1);
    console.log(`Multi-KAS API failed: status=${response.status}, duration=${duration}ms`);
  }

  return response;
}

/**
 * Test KAS federation health endpoint
 * Target: p95 < 150ms
 */
function testKasFederationHealth() {
  const url = `${BASE_URL}/api/health/kas-federation`;
  const params = {
    headers: {
      'Accept': 'application/json',
      'X-Request-ID': `k6-kasfed-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    },
    ...httpOptions,
  };

  const response = http.get(url, params);

  const success = check(response, {
    'kas-federation status 200': (r) => r.status === 200,
    'kas-federation response time < 150ms': (r) => r.timings.duration < 150,
    'kas-federation has kasServers': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.kasServers && Array.isArray(body.kasServers);
      } catch {
        return false;
      }
    },
    'kas-federation has summary': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.summary && typeof body.summary.total === 'number';
      } catch {
        return false;
      }
    },
  });

  kasFederationSuccessRate.add(success);
  kasFederationLatency.add(response.timings.duration);

  if (!success) {
    errorRate.add(1);
  }

  return response;
}

/**
 * Test general health endpoint for baseline
 * Target: p95 < 100ms
 */
function testHealthEndpoint() {
  const url = `${BASE_URL}/api/health`;
  const params = {
    headers: {
      'Accept': 'application/json',
    },
    ...httpOptions,
  };

  const response = http.get(url, params);

  const success = check(response, {
    'health status 200': (r) => r.status === 200,
    'health response time < 100ms': (r) => r.timings.duration < 100,
  });

  healthSuccessRate.add(success);
  healthLatency.add(response.timings.duration);

  if (!success) {
    errorRate.add(1);
  }

  return response;
}

/**
 * Main test function
 */
export default function () {
  // Weighted request distribution
  const rand = Math.random();
  
  if (rand < 0.6) {
    // 60% - Multi-KAS API (primary target)
    testMultiKasApi();
  } else if (rand < 0.85) {
    // 25% - KAS Federation Health
    testKasFederationHealth();
  } else {
    // 15% - General Health (baseline)
    testHealthEndpoint();
  }

  // Small delay between requests (simulates real user behavior)
  sleep(0.5 + Math.random() * 0.5);
}

/**
 * Setup function
 */
export function setup() {
  console.log('='.repeat(60));
  console.log('DIVE V3 Multi-KAS Performance Test');
  console.log('='.repeat(60));
  console.log(`Base URL: ${BASE_URL}`);
  console.log('');
  console.log('Performance Targets:');
  console.log('  - Multi-KAS API:    p95 < 200ms');
  console.log('  - KAS Federation:   p95 < 150ms');
  console.log('  - Health Endpoint:  p95 < 100ms');
  console.log('  - Success Rate:     99.9%+');
  console.log('='.repeat(60));

  // Warm-up request
  const warmupResponse = http.get(`${BASE_URL}/api/health`, httpOptions);
  if (warmupResponse.status !== 200) {
    console.log(`WARNING: Health check failed (status=${warmupResponse.status})`);
    console.log('Backend may not be running. Tests will proceed but may fail.');
  } else {
    console.log('Backend is healthy. Starting tests...');
  }

  return {};
}

/**
 * Teardown function
 */
export function teardown(data) {
  console.log('='.repeat(60));
  console.log('Multi-KAS Performance Test Complete');
  console.log('='.repeat(60));
}

/**
 * Custom summary handler
 */
export function handleSummary(data) {
  // Extract key metrics
  const multiKasP95 = data.metrics.multi_kas_latency_ms?.values?.['p(95)'] || 'N/A';
  const multiKasP99 = data.metrics.multi_kas_latency_ms?.values?.['p(99)'] || 'N/A';
  const multiKasAvg = data.metrics.multi_kas_latency_ms?.values?.avg || 'N/A';
  const multiKasSuccessRate = data.metrics.multi_kas_success?.values?.rate || 'N/A';
  
  const kasFedP95 = data.metrics.kas_federation_latency_ms?.values?.['p(95)'] || 'N/A';
  const healthP95 = data.metrics.health_latency_ms?.values?.['p(95)'] || 'N/A';

  // Build summary text
  let summary = `
================================================================================
                     DIVE V3 MULTI-KAS PERFORMANCE RESULTS
================================================================================

MULTI-KAS API (/api/compliance/multi-kas)
  Response Time:
    - p95:     ${typeof multiKasP95 === 'number' ? multiKasP95.toFixed(2) + 'ms' : multiKasP95} ${typeof multiKasP95 === 'number' && multiKasP95 < 200 ? '✓ PASS' : '✗ FAIL'}
    - p99:     ${typeof multiKasP99 === 'number' ? multiKasP99.toFixed(2) + 'ms' : multiKasP99}
    - Average: ${typeof multiKasAvg === 'number' ? multiKasAvg.toFixed(2) + 'ms' : multiKasAvg}
  Success Rate: ${typeof multiKasSuccessRate === 'number' ? (multiKasSuccessRate * 100).toFixed(2) + '%' : multiKasSuccessRate}

KAS FEDERATION HEALTH (/api/health/kas-federation)
  Response Time:
    - p95:     ${typeof kasFedP95 === 'number' ? kasFedP95.toFixed(2) + 'ms' : kasFedP95}

GENERAL HEALTH (/api/health)
  Response Time:
    - p95:     ${typeof healthP95 === 'number' ? healthP95.toFixed(2) + 'ms' : healthP95}

================================================================================
TARGET: p95 < 200ms for Multi-KAS API
================================================================================
`;

  console.log(summary);

  return {
    'stdout': summary,
    'multi-kas-perf-results.json': JSON.stringify(data, null, 2),
  };
}
