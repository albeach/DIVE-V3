# Performance Testing in CI - Phase 2 Type Safety & Maintainability

**Date**: 2026-02-08  
**Status**: 🟡 Planning Complete - Ready for Week 5-8  
**Priority**: P1 - Should Have (Phase 2: Weeks 5-8)

---

## Executive Summary

DIVE V3 has **performance targets documented** (p95 <200ms) and **baseline measurement scripts**, but **no automated performance testing in CI**:

- ✅ **Performance targets**: p95 <200ms for authorization decisions, 100 req/s throughput
- ✅ **Baseline scripts**: `scripts/phase6-baseline-test.sh` exists
- ✅ **Current performance**: p95 ~75ms (exceeded target)
- ⚠️ **Existing tests**: `external-idp-performance.test.ts` in backend
- ❌ **CI integration**: No performance tests in CI workflows
- ❌ **Regression detection**: Performance regressions not caught

**Target Phase 2**: Add performance tests to CI with automated regression detection and failure thresholds

---

## Current Performance State

### Documented Performance Targets

From codebase documentation:

| Metric | Target | Current (Baseline) | Status |
|--------|--------|-------------------|--------|
| Authorization Latency (p50) | <100ms | ~15ms | ✅ Exceeded |
| Authorization Latency (p95) | <200ms | ~75ms | ✅ Exceeded |
| Authorization Latency (p99) | <300ms | ~120ms | ✅ Exceeded |
| API Response Time (p95) | <500ms | ~200ms | ✅ Met |
| Throughput | 100 req/s | ~50 req/s (estimate) | ⚠️ Below |
| Cache Hit Rate | >80% | ~75% | ⚠️ Below |
| OPA Evaluation | <5ms | ~1-3ms | ✅ Exceeded |

**Sources**:
- `docs/phase6-performance-optimization-report.md`
- `PHASE4_SESSION5_SUMMARY.md`
- `docs/session-management.md`

---

### Existing Performance Test Infrastructure

#### 1. Backend Performance Test

**Location**: `backend/src/__tests__/performance/external-idp-performance.test.ts`

**What it tests**:
- External IdP authentication flows
- Token validation performance
- Session management overhead

**Status**: ⚠️ Not run in CI (requires `RUN_E2E_TESTS=true`)

---

#### 2. Baseline Measurement Script

**Location**: `scripts/phase6-baseline-test.sh`

**What it measures**:
- Authorization decision latency (p50, p95, p99)
- Cache hit rates
- OPA direct evaluation latency
- Database query performance

**Status**: ✅ Working locally, ❌ Not in CI

**Example output**:
```bash
📊 Authorization Performance Test
================================
Requests:     1000
Cache enabled: Yes
Results:
  p50:  15ms
  p95:  75ms
  p99: 120ms
  Cache hit rate: 75%
```

---

#### 3. Frontend Performance Scripts

**Location**: `frontend/package.json`

```json
{
  "test:performance": "playwright test --grep performance",
  "test:performance:auth": "playwright test tests/e2e/auth-flows.test.ts --grep 'performance'"
}
```

**Status**: ⚠️ Tests exist but not comprehensive

---

## Gaps in Performance Testing

### Critical Gaps

1. **No CI Integration** ❌
   - Performance tests not run automatically
   - Regressions not detected
   - No performance gate before merge

2. **No Regression Detection** ❌
   - No baseline comparison
   - No automated alerts on slowdowns
   - Manual verification only

3. **Limited Coverage** ⚠️
   - Only authorization latency tested
   - Missing: Upload performance, search performance, federation latency
   - Missing: Frontend performance (Core Web Vitals)

4. **No Load Testing** ❌
   - Throughput target (100 req/s) not tested
   - No concurrent user simulation
   - No stress testing

5. **No Performance Budgets** ❌
   - No bundle size monitoring
   - No frontend performance budgets
   - No API response time budgets

---

## Recommended Performance Testing Strategy

### Layer 1: Synthetic Performance Tests (Backend)

**Goal**: Measure server-side performance in isolation

**Tool**: Custom Node.js scripts (existing `phase6-baseline-test.sh`)

**What to test**:
1. Authorization decisions (p50, p95, p99)
2. OPA evaluation latency
3. Database query performance
4. Cache hit rates
5. Redis latency

**Run frequency**: Every commit (part of unit tests)

---

### Layer 2: Load Testing (Backend)

**Goal**: Test under realistic concurrent load

**Tool**: k6 (https://k6.io/) or Artillery

**What to test**:
1. Sustained throughput (100 req/s target)
2. Spike testing (sudden traffic surge)
3. Stress testing (find breaking point)
4. Endurance testing (memory leaks)

**Run frequency**: Nightly or on-demand

---

### Layer 3: Frontend Performance (Core Web Vitals)

**Goal**: Measure user experience metrics

**Tool**: Lighthouse CI

**What to test**:
1. Largest Contentful Paint (LCP) <2.5s
2. First Input Delay (FID) <100ms
3. Cumulative Layout Shift (CLS) <0.1
4. Time to Interactive (TTI) <3.8s
5. Bundle size budgets

**Run frequency**: Every PR

---

### Layer 4: E2E Performance (Playwright)

**Goal**: Measure real user flow performance

**Tool**: Playwright Performance API

**What to test**:
1. Login flow duration
2. Page load times
3. Resource search time
4. Upload duration
5. Federation latency

**Run frequency**: Nightly

---

## Phase 2 Implementation Plan (Weeks 5-8)

### Week 5: Baseline & Infrastructure

**Day 1-2**: Baseline Performance Capture
- [ ] Run `phase6-baseline-test.sh` 10 times
- [ ] Calculate average, std dev for p50/p95/p99
- [ ] Document baseline in `docs/testing/PERFORMANCE_BASELINE.md`
- [ ] Set regression thresholds (baseline + 20%)

**Day 3-4**: Setup k6 Load Testing
- [ ] Install k6: `brew install k6` or `apt-get install k6`
- [ ] Create load test script: `backend/performance/authz-load.test.js`
- [ ] Test locally: `k6 run authz-load.test.js`
- [ ] Verify 100 req/s target met

**Day 5**: Setup Lighthouse CI
- [ ] Install: `npm install --save-dev @lhci/cli`
- [ ] Configure: `frontend/lighthouserc.json`
- [ ] Test locally: `lhci autorun`
- [ ] Set budgets (LCP <2.5s, FID <100ms)

**Week 5 Effort**: 40 hours (5 days)

---

### Week 6: Backend Performance Tests

**Day 6-7**: Authorization Performance Tests
- [ ] Create `backend/performance/authorization.test.js` (k6)
- [ ] Test scenarios:
  - Cold cache (OPA only)
  - Warm cache (Redis hit)
  - Complex policy (nested conditions)
  - Federation authz (cross-instance)
- [ ] Set thresholds (p95 <200ms)

**Day 8**: Upload Performance Tests
- [ ] Create `backend/performance/upload.test.js`
- [ ] Test file sizes: 1MB, 10MB, 100MB
- [ ] Measure: Upload time, metadata extraction, storage
- [ ] Set threshold: <10s for 100MB file

**Day 9**: Search Performance Tests
- [ ] Create `backend/performance/search.test.js`
- [ ] Test scenarios:
  - Simple search (title)
  - Full-text search
  - Faceted search (filters)
  - Federated search (multi-instance)
- [ ] Set threshold: <500ms for simple, <2s for federated

**Day 10**: Database Performance Tests
- [ ] Create `backend/performance/database.test.js`
- [ ] Test queries with 10k, 100k, 1M records
- [ ] Measure: Query latency, index efficiency
- [ ] Set threshold: <50ms (p95) for indexed queries

**Week 6 Effort**: 40 hours (5 days)

---

### Week 7: Frontend Performance Tests

**Day 11-12**: Lighthouse CI Integration
- [ ] Add Lighthouse CI to `.github/workflows/performance.yml`
- [ ] Configure budgets:
  - LCP: 2500ms
  - FID: 100ms
  - CLS: 0.1
  - TTI: 3800ms
  - Bundle size: 500KB (main), 200KB (vendor)
- [ ] Test against main pages (/, /dashboard, /resources)

**Day 13-14**: Playwright Performance Tests
- [ ] Create `frontend/tests/performance/page-load.spec.ts`
- [ ] Measure page load times with `performance.timing` API
- [ ] Test scenarios:
  - Home page load
  - Dashboard load (authenticated)
  - Resource list load (100 items)
  - Upload page load
- [ ] Set threshold: <3s for initial load

**Day 15**: Bundle Size Monitoring
- [ ] Install: `npm install --save-dev @next/bundle-analyzer`
- [ ] Configure: `next.config.js` with `ANALYZE=true`
- [ ] Create baseline: Document current bundle sizes
- [ ] Set budgets:
  - Main bundle: <500KB
  - Vendor bundle: <200KB
  - Page bundles: <100KB each

**Week 7 Effort**: 40 hours (5 days)

---

### Week 8: CI Integration & Monitoring

**Day 16-17**: Create Unified Performance CI Workflow
- [ ] Create `.github/workflows/performance.yml`
- [ ] Integrate all performance tests:
  - Backend synthetic tests (p50, p95, p99)
  - k6 load tests (100 req/s)
  - Lighthouse CI (Core Web Vitals)
  - Playwright performance tests
- [ ] Set failure thresholds
- [ ] Add performance summary to PR comments

**Day 18**: Add Performance Regression Detection
- [ ] Store baseline performance data in repo
- [ ] Compare current vs baseline in CI
- [ ] Fail if regression >20%
- [ ] Comment performance diff on PR

**Day 19**: Add Performance Dashboard
- [ ] Create Grafana dashboard for CI metrics
- [ ] Track p50/p95/p99 trends over time
- [ ] Add alerts for sustained regressions

**Day 20**: Documentation & Training
- [ ] Document performance testing in `docs/testing/PERFORMANCE_TESTING_GUIDE.md`
- [ ] Train team on performance budgets
- [ ] Establish performance review process

**Week 8 Effort**: 40 hours (5 days)

---

## k6 Load Test Template

### Authorization Load Test

**Location**: `backend/performance/authz-load.test.js`

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const authzLatency = new Trend('authz_latency');

// Load test configuration
export const options = {
  stages: [
    { duration: '30s', target: 20 },  // Ramp up to 20 users
    { duration: '1m', target: 50 },   // Ramp up to 50 users
    { duration: '2m', target: 100 },  // Sustain 100 users (target)
    { duration: '30s', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'], // 95% of requests < 200ms
    http_req_failed: ['rate<0.01'],   // Error rate < 1%
    errors: ['rate<0.01'],             // Custom error rate < 1%
  },
};

// Test data
const resources = [
  { id: 'doc-1', classification: 'SECRET' },
  { id: 'doc-2', classification: 'TOP_SECRET' },
  { id: 'doc-3', classification: 'CONFIDENTIAL' },
];

// Test scenario
export default function () {
  const resource = resources[Math.floor(Math.random() * resources.length)];
  
  const payload = JSON.stringify({
    resourceId: resource.id,
    userId: 'testuser-us',
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer test-token',
    },
  };

  const res = http.post('http://localhost:4000/api/authorize', payload, params);
  
  // Check response
  const success = check(res, {
    'status is 200': (r) => r.status === 200,
    'response has decision': (r) => r.json('decision') !== undefined,
    'p95 < 200ms': (r) => r.timings.duration < 200,
  });

  // Record metrics
  errorRate.add(!success);
  authzLatency.add(res.timings.duration);

  // Think time (simulate user behavior)
  sleep(1);
}
```

**Run**:
```bash
k6 run backend/performance/authz-load.test.js
```

---

## Lighthouse CI Configuration

### Setup

**Location**: `frontend/lighthouserc.json`

```json
{
  "ci": {
    "collect": {
      "url": [
        "http://localhost:3000/",
        "http://localhost:3000/dashboard",
        "http://localhost:3000/resources"
      ],
      "numberOfRuns": 3,
      "settings": {
        "preset": "desktop",
        "onlyCategories": ["performance", "accessibility"],
        "skipAudits": ["uses-http2"]
      }
    },
    "assert": {
      "assertions": {
        "categories:performance": ["error", {"minScore": 0.9}],
        "categories:accessibility": ["error", {"minScore": 0.9}],
        "first-contentful-paint": ["error", {"maxNumericValue": 2000}],
        "largest-contentful-paint": ["error", {"maxNumericValue": 2500}],
        "cumulative-layout-shift": ["error", {"maxNumericValue": 0.1}],
        "total-blocking-time": ["error", {"maxNumericValue": 300}],
        "speed-index": ["error", {"maxNumericValue": 3000}]
      }
    },
    "upload": {
      "target": "temporary-public-storage"
    }
  }
}
```

**Scripts** (add to `package.json`):
```json
{
  "scripts": {
    "lighthouse": "lhci autorun",
    "lighthouse:report": "lhci open"
  }
}
```

---

## Performance Test Categories

### 1. Synthetic Performance Tests

**Goal**: Measure server performance in isolation

**Tests**:
- Authorization decisions (OPA + cache)
- Database queries (indexed + unindexed)
- Redis cache operations
- JWT validation

**Implementation**: Node.js scripts with `console.time()` or `performance.now()`

**Example**:
```typescript
// backend/performance/synthetic-authz.test.ts
import { performance } from 'perf_hooks';

describe('Authorization Performance', () => {
  it('should authorize request in <200ms (p95)', async () => {
    const latencies: number[] = [];
    
    // Run 1000 requests
    for (let i = 0; i < 1000; i++) {
      const start = performance.now();
      await authzService.authorize(testRequest);
      const end = performance.now();
      latencies.push(end - start);
    }
    
    // Calculate p95
    latencies.sort((a, b) => a - b);
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    
    expect(p95).toBeLessThan(200);
  });
}, { timeout: 60000 });
```

---

### 2. Load Testing

**Goal**: Test under concurrent load

**Tool**: k6 or Artillery

**Tests**:
- Sustained throughput (100 req/s)
- Spike testing (1000 req/s burst)
- Stress testing (find breaking point)
- Endurance testing (2 hour sustained load)

**k6 Scenarios**:

**Scenario 1: Baseline Load**
```javascript
export const options = {
  scenarios: {
    baseline: {
      executor: 'constant-arrival-rate',
      rate: 100,       // 100 req/s
      duration: '2m',  // Sustained for 2 minutes
      preAllocatedVUs: 50,
      maxVUs: 100,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<200', 'p(99)<300'],
  },
};
```

**Scenario 2: Spike Test**
```javascript
export const options = {
  scenarios: {
    spike: {
      executor: 'ramping-arrival-rate',
      startRate: 50,
      stages: [
        { duration: '30s', target: 50 },   // Baseline
        { duration: '10s', target: 500 },  // Spike to 500 req/s
        { duration: '1m', target: 500 },   // Sustain spike
        { duration: '30s', target: 50 },   // Back to baseline
      ],
      preAllocatedVUs: 100,
      maxVUs: 500,
    },
  },
};
```

**Scenario 3: Stress Test**
```javascript
export const options = {
  scenarios: {
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 100 },   // Ramp to normal
        { duration: '5m', target: 200 },   // Above normal
        { duration: '2m', target: 300 },   // Find breaking point
        { duration: '2m', target: 0 },     // Ramp down
      ],
    },
  },
};
```

---

### 3. Frontend Performance Testing

**Goal**: Measure Core Web Vitals

**Tool**: Lighthouse CI

**Budgets** (lighthouse CI config):
```json
{
  "ci": {
    "assert": {
      "assertions": {
        "first-contentful-paint": ["error", {"maxNumericValue": 2000}],
        "largest-contentful-paint": ["error", {"maxNumericValue": 2500}],
        "cumulative-layout-shift": ["error", {"maxNumericValue": 0.1}],
        "total-blocking-time": ["error", {"maxNumericValue": 300}],
        "speed-index": ["error", {"maxNumericValue": 3000}],
        "interactive": ["error", {"maxNumericValue": 3800}]
      }
    }
  }
}
```

**Bundle Size Budgets** (next.config.js):
```javascript
module.exports = {
  experimental: {
    bundlePagesRouterDependencies: true,
  },
  webpack: (config, { dev }) => {
    if (!dev) {
      config.performance = {
        maxEntrypointSize: 512000,   // 500 KB
        maxAssetSize: 512000,         // 500 KB
        hints: 'error',               // Fail build if exceeded
      };
    }
    return config;
  },
};
```

---

### 4. E2E Performance Testing

**Goal**: Measure real user flows

**Tool**: Playwright with Performance API

**Example**:
```typescript
// frontend/tests/performance/auth-flow.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Authentication Performance', () => {
  test('login flow should complete in <5s', async ({ page }) => {
    // Start timing
    const startTime = Date.now();

    // Perform login
    await page.goto('/');
    await page.getByRole('button', { name: 'Log In' }).click();
    await page.waitForURL('/dashboard');

    // End timing
    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log(`Login flow completed in ${duration}ms`);
    
    // Assert performance
    expect(duration).toBeLessThan(5000); // 5 seconds
  });

  test('resource search should return in <2s', async ({ page, context }) => {
    // Login first
    await page.goto('/dashboard');

    // Start performance measurement
    await page.evaluate(() => performance.mark('search-start'));

    // Perform search
    await page.getByRole('textbox', { name: 'Search' }).fill('test query');
    await page.getByRole('button', { name: 'Search' }).click();
    await page.waitForSelector('[data-testid="search-results"]');

    // End measurement
    const metrics = await page.evaluate(() => {
      performance.mark('search-end');
      performance.measure('search-duration', 'search-start', 'search-end');
      const measure = performance.getEntriesByName('search-duration')[0];
      return measure.duration;
    });

    console.log(`Search completed in ${metrics}ms`);
    expect(metrics).toBeLessThan(2000); // 2 seconds
  });
});
```

---

## CI Workflow Integration

### Performance Test Workflow

**Location**: `.github/workflows/performance.yml`

```yaml
name: Performance Tests

on:
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 2 * * *' # Nightly at 2 AM
  workflow_dispatch:

jobs:
  backend-synthetic:
    name: Backend - Synthetic Tests
    runs-on: ubuntu-latest
    timeout-minutes: 10

    services:
      mongodb:
        image: mongo:7.0
        ports:
          - 27017:27017
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json

      - name: Install Dependencies
        run: cd backend && npm ci

      - name: Run Synthetic Performance Tests
        run: |
          cd backend
          npm run test:performance
        env:
          MONGODB_URL: mongodb://localhost:27017/dive-v3-test
          REDIS_URL: redis://localhost:6379

      - name: Parse Performance Results
        run: |
          # Extract p50, p95, p99 from test output
          # Compare against baseline
          # Fail if regression >20%
          node scripts/compare-performance-baseline.js

  backend-load:
    name: Backend - Load Tests (k6)
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - uses: actions/checkout@v4

      - name: Setup k6
        run: |
          sudo gpg -k
          sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
          echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
          sudo apt-get update
          sudo apt-get install k6

      - name: Start Backend Services
        run: docker-compose -f docker-compose.hub.yml up -d backend-usa mongodb-usa redis-usa opa-usa

      - name: Wait for Services
        run: |
          timeout 120 bash -c 'until curl -f http://localhost:4000/api/health; do sleep 2; done'

      - name: Run k6 Load Tests
        run: |
          k6 run backend/performance/authz-load.test.js \
            --out json=performance-results.json

      - name: Check Performance Thresholds
        run: |
          # Parse k6 results
          # Check p95 < 200ms, error rate < 1%
          # Fail if thresholds violated
          node scripts/check-k6-thresholds.js performance-results.json

      - name: Upload Results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: k6-results
          path: performance-results.json

  frontend-lighthouse:
    name: Frontend - Lighthouse CI
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - name: Install Dependencies
        run: cd frontend && npm ci

      - name: Build Frontend
        run: cd frontend && npm run build
        env:
          NEXTAUTH_URL: http://localhost:3000
          NEXTAUTH_SECRET: test-secret

      - name: Start Frontend
        run: |
          cd frontend
          nohup npm start &
          timeout 120 bash -c 'until curl -f http://localhost:3000; do sleep 2; done'

      - name: Run Lighthouse CI
        run: cd frontend && npx @lhci/cli autorun
        env:
          LHCI_GITHUB_APP_TOKEN: ${{ secrets.LHCI_GITHUB_APP_TOKEN }}

      - name: Upload Lighthouse Report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: lighthouse-report
          path: frontend/.lighthouseci/

  performance-summary:
    name: Performance Summary
    runs-on: ubuntu-latest
    needs: [backend-synthetic, backend-load, frontend-lighthouse]
    if: always()

    steps:
      - name: Download All Artifacts
        uses: actions/download-artifact@v4

      - name: Generate Performance Report
        run: |
          echo "## 📊 Performance Test Results" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "| Test Type | Status | Details |" >> $GITHUB_STEP_SUMMARY
          echo "|-----------|--------|---------|" >> $GITHUB_STEP_SUMMARY
          echo "| Backend Synthetic | ${{ needs.backend-synthetic.result == 'success' && '✅ Pass' || '❌ Fail' }} | p95 latency check |" >> $GITHUB_STEP_SUMMARY
          echo "| Backend Load (k6) | ${{ needs.backend-load.result == 'success' && '✅ Pass' || '❌ Fail' }} | 100 req/s sustained |" >> $GITHUB_STEP_SUMMARY
          echo "| Frontend Lighthouse | ${{ needs.frontend-lighthouse.result == 'success' && '✅ Pass' || '❌ Fail' }} | Core Web Vitals |" >> $GITHUB_STEP_SUMMARY
```

**Effort**: 8 hours

---

## Success Metrics

### Week 5 (End)
- ✅ Performance baseline documented
- ✅ k6 installed and load test created
- ✅ Lighthouse CI configured
- ✅ Performance budgets defined

### Week 6 (End)
- ✅ Backend performance tests complete
- ✅ Authorization: p95 <200ms enforced
- ✅ Upload: <10s for 100MB enforced
- ✅ Search: <500ms enforced

### Week 7 (End)
- ✅ Frontend performance tests complete
- ✅ Lighthouse CI: LCP <2.5s enforced
- ✅ Bundle size: <500KB enforced
- ✅ Playwright performance tests created

### Week 8 (End)
- ✅ Performance tests in CI (all types)
- ✅ Regression detection automated
- ✅ Performance dashboard created
- ✅ Team trained on performance budgets

### Long-term (6 months)
- ✅ Zero performance regressions merged
- ✅ p95 <200ms maintained
- ✅ Throughput ≥100 req/s sustained
- ✅ Frontend: LCP <2.5s on all pages

---

## Performance Regression Detection

### Baseline File Format

**Location**: `backend/performance/baseline.json`

```json
{
  "version": "1.0.0",
  "date": "2026-02-08",
  "commit": "abc123",
  "metrics": {
    "authorization": {
      "p50": 15,
      "p95": 75,
      "p99": 120,
      "unit": "ms"
    },
    "upload_100mb": {
      "average": 8500,
      "p95": 9500,
      "unit": "ms"
    },
    "search_simple": {
      "p50": 150,
      "p95": 300,
      "unit": "ms"
    },
    "cache_hit_rate": {
      "value": 75,
      "unit": "%"
    }
  },
  "thresholds": {
    "authorization_p95": 200,
    "upload_100mb_p95": 10000,
    "search_simple_p95": 500,
    "cache_hit_rate_min": 70
  }
}
```

### Comparison Script

**Location**: `scripts/compare-performance-baseline.js`

```javascript
const fs = require('fs');

// Load baseline
const baseline = JSON.parse(fs.readFileSync('backend/performance/baseline.json'));

// Load current results (from test output)
const current = JSON.parse(fs.readFileSync('performance-results.json'));

// Compare
const regressions = [];

if (current.authorization.p95 > baseline.metrics.authorization.p95 * 1.2) {
  regressions.push({
    metric: 'authorization_p95',
    baseline: baseline.metrics.authorization.p95,
    current: current.authorization.p95,
    threshold: baseline.metrics.authorization.p95 * 1.2,
    regression_pct: ((current.authorization.p95 / baseline.metrics.authorization.p95) - 1) * 100,
  });
}

// Check threshold violations
if (current.authorization.p95 > baseline.thresholds.authorization_p95) {
  regressions.push({
    metric: 'authorization_p95_threshold',
    current: current.authorization.p95,
    threshold: baseline.thresholds.authorization_p95,
  });
}

// Report
if (regressions.length > 0) {
  console.error('❌ Performance regressions detected:');
  regressions.forEach(r => {
    console.error(`  - ${r.metric}: ${r.current}ms (baseline: ${r.baseline}ms, +${r.regression_pct.toFixed(1)}%)`);
  });
  process.exit(1);
} else {
  console.log('✅ No performance regressions detected');
}
```

---

## Performance Monitoring Dashboard

### Grafana Dashboard

**Panels to add**:

1. **Authorization Latency Trends**
   - Line chart: p50, p95, p99 over time
   - Source: CI test results + production metrics

2. **Throughput Trends**
   - Line chart: Requests per second
   - Source: k6 test results

3. **Frontend Performance Trends**
   - Line chart: LCP, FID, CLS over time
   - Source: Lighthouse CI results

4. **Cache Performance**
   - Line chart: Hit rate % over time
   - Source: Redis metrics

5. **Performance Regressions**
   - Table: Recent regressions detected
   - Source: CI test failures

**Implementation**: Create `monitoring/grafana/dashboards/performance-ci.json`

**Effort**: 4 hours

---

## Total Effort Summary

| Week | Task | Effort |
|------|------|--------|
| Week 5 | Baseline + Infrastructure | 40 hours |
| Week 6 | Backend Performance Tests | 40 hours |
| Week 7 | Frontend Performance Tests | 40 hours |
| Week 8 | CI Integration + Monitoring | 40 hours |
| **Total** | **Full performance testing** | **160 hours** |

**Timeline**: 4 weeks (Weeks 5-8)  
**Team Size**: 1-2 engineers  
**Cost**: k6 Cloud (optional): ~$100-200/month, Lighthouse CI: Free

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Performance tests slow CI | Developer friction | Run full load tests nightly, not per PR |
| Flaky performance tests | False negatives | Use 3-5 test runs, average results |
| Baseline drift | Incorrect regressions | Update baseline quarterly |
| Load tests break prod | System instability | Run against staging only |
| Cost overruns | Budget exceeded | Use free tiers, self-hosted k6 |

---

## Quick Wins (Week 5, Day 1)

### 1. Add `test:performance` to CI (2 hours)

**Action**: Run existing performance tests in CI

```yaml
# Add to ci-comprehensive.yml
- name: Backend Performance Tests
  run: cd backend && npm run test:performance
```

**Impact**: Immediate visibility into performance

---

### 2. Document Current Performance (1 hour)

**Action**: Run `phase6-baseline-test.sh` and document

```bash
./scripts/phase6-baseline-test.sh | tee docs/testing/PERFORMANCE_BASELINE.md
```

**Impact**: Establish baseline for comparisons

---

### 3. Add Bundle Size Check (2 hours)

**Action**: Add webpack performance hints

```javascript
// frontend/next.config.ts
export default {
  webpack: (config, { dev }) => {
    if (!dev) {
      config.performance = {
        maxEntrypointSize: 512000,
        maxAssetSize: 512000,
        hints: 'error',
      };
    }
    return config;
  },
};
```

**Impact**: Catch bundle bloat immediately

---

## Next Steps (Week 5 Start)

**Day 1**: Quick wins
- [ ] Add performance tests to CI
- [ ] Document current baseline
- [ ] Add bundle size check

**Day 2-3**: k6 setup
- [ ] Install k6
- [ ] Create load test script
- [ ] Test locally

**Day 4-5**: Lighthouse setup
- [ ] Install Lighthouse CI
- [ ] Configure budgets
- [ ] Test locally

---

**Document Owner**: Principal Software Architect  
**Last Updated**: 2026-02-08  
**Review Frequency**: Weekly during Phase 2, monthly thereafter
