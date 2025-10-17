# QA Automation Guide - DIVE V3

**Phase 4 - CI/CD & QA Automation**  
**Date:** October 17, 2025  
**Version:** 1.0.0

## Table of Contents

1. [Overview](#overview)
2. [Smoke Test Suite](#smoke-test-suite)
3. [Performance Benchmark Suite](#performance-benchmark-suite)
4. [QA Validation Suite](#qa-validation-suite)
5. [E2E Test Suite](#e2e-test-suite)
6. [Testing Strategy](#testing-strategy)
7. [Troubleshooting](#troubleshooting)
8. [Best Practices](#best-practices)

---

## Overview

DIVE V3 implements comprehensive QA automation to ensure system reliability, performance, and security. This guide covers all automated testing tools and procedures.

### QA Automation Stack

```
┌─────────────────────────────────────────────┐
│         QA Automation Pyramid               │
│                                             │
│  ┌─────────────────────────────────────┐  │
│  │   E2E Tests (11 scenarios)          │  │  Comprehensive
│  │   Full system integration          │  │  Few, Slow
│  └─────────────────────────────────────┘  │
│                                             │
│  ┌─────────────────────────────────────┐  │
│  │   Integration Tests                 │  │  API-level
│  │   Service interactions              │  │  Moderate
│  └─────────────────────────────────────┘  │
│                                             │
│  ┌─────────────────────────────────────┐  │
│  │   Unit Tests (609 tests)            │  │  Component-level
│  │   Individual functions/classes      │  │  Many, Fast
│  └─────────────────────────────────────┘  │
│                                             │
│  ┌─────────────────────────────────────┐  │
│  │   QA Scripts (Smoke, Perf, Val)     │  │  System-level
│  │   Automated validation              │  │  Fast checks
│  └─────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### Test Coverage

| Test Type | Count | Coverage | Duration |
|-----------|-------|----------|----------|
| Unit Tests | 609 | 98% | ~5 min |
| Integration Tests | Subset | Full stack | ~4 min |
| E2E Tests | 11 scenarios | End-to-end | ~8 min |
| OPA Policy Tests | 87 | 100% | ~30 sec |
| Smoke Tests | 15+ checks | Critical paths | ~2 min |
| Performance Tests | 5 benchmarks | SLO validation | ~5 min |
| **Total** | **700+** | **>95%** | **<30 min** |

---

## Smoke Test Suite

### Purpose
Quick verification that all critical functionality works after deployment.

### Script
`scripts/smoke-test.sh` (250 lines)

### Usage
```bash
# Local testing
./scripts/smoke-test.sh

# Custom backend URL
BACKEND_URL=https://staging.dive-v3.mil ./scripts/smoke-test.sh

# Custom timeout
TIMEOUT=20 ./scripts/smoke-test.sh
```

### Tests Performed

#### 1. Health Checks (4 tests)
- **Basic Health** (`GET /health`)
  - Expected: HTTP 200
  - Purpose: Quick status for load balancers
  - Target: <10ms response time

- **Detailed Health** (`GET /health/detailed`)
  - Expected: HTTP 200 with JSON body
  - Purpose: Full system diagnostics
  - Checks: Services, metrics, memory, circuit breakers

- **Readiness Probe** (`GET /health/ready`)
  - Expected: HTTP 200
  - Purpose: Kubernetes-compatible dependency check
  - Validates: MongoDB, OPA connectivity

- **Liveness Probe** (`GET /health/live`)
  - Expected: HTTP 200
  - Purpose: Process health validation

#### 2. Authentication Endpoints (2 tests)
- **Admin Dashboard** - Expected: HTTP 401 (requires auth)
- **Admin Submissions** - Expected: HTTP 401 (requires auth)

#### 3. Analytics Endpoints (5 tests)
- **Risk Distribution** - Expected: HTTP 401 (requires auth)
- **Compliance Trends** - Expected: HTTP 401 (requires auth)
- **SLA Metrics** - Expected: HTTP 401 (requires auth)
- **Authz Metrics** - Expected: HTTP 401 (requires auth)
- **Security Posture** - Expected: HTTP 401 (requires auth)

#### 4. Frontend Pages (3 tests)
- **Home Page** (`/`) - Expected: HTTP 200
- **Admin Dashboard** (`/admin/dashboard`) - Expected: HTTP 200
- **Analytics Dashboard** (`/admin/analytics`) - Expected: HTTP 200

#### 5. Database Connectivity (1 test)
- **MongoDB Ping** - Uses Docker to verify MongoDB responding
- Command: `mongosh --eval "db.adminCommand('ping')"`

#### 6. OPA Policy Service (1 test)
- **OPA Health** - HTTP 200 from http://localhost:8181/health

#### 7. Service Metrics (1 test)
- **Cache Hit Rate** - Extracted from `/health/detailed`
- **Uptime** - System uptime verification

### Exit Codes
- `0` - All tests passed
- `1` - 1-2 tests failed (warnings)
- `1` - 3+ tests failed (critical failures)

### Output Format
```
🧪 DIVE V3 - Smoke Test Suite
================================

📊 Health Checks
----------------
  Testing Basic Health... ✓ PASS (HTTP 200)
  Testing Detailed Health... ✓ PASS (HTTP 200)
  Testing Readiness Probe... ✓ PASS (HTTP 200)
  Testing Liveness Probe... ✓ PASS (HTTP 200)

🔐 Authentication Endpoints
----------------------------
  Testing Admin Dashboard... ✓ PASS (HTTP 401)
  Testing Admin Submissions... ✓ PASS (HTTP 401)

================================
Summary: 15 passed, 0 failed, 0 warnings
================================

✅ All smoke tests passed!
```

---

## Performance Benchmark Suite

### Purpose
Automated performance testing and reporting to verify system meets Phase 3 SLOs.

### Script
`scripts/performance-benchmark.sh` (310 lines)

### Requirements
- **autocannon** - `npm install -g autocannon`
- **jq** - JSON parsing (usually pre-installed)

### Usage
```bash
# Run all benchmarks
./scripts/performance-benchmark.sh

# Custom backend URL
BACKEND_URL=https://staging.dive-v3.mil ./scripts/performance-benchmark.sh

# Custom duration
DURATION=60 ./scripts/performance-benchmark.sh

# Custom connections
CONNECTIONS=100 ./scripts/performance-benchmark.sh
```

### Performance Targets (Phase 3)
| Metric | Target | Actual |
|--------|--------|--------|
| P95 Latency | <200ms | ~45ms ✅ |
| Throughput | >100 req/s | ~150 req/s ✅ |
| Cache Hit Rate | >80% | 85.3% ✅ |
| DB Query Time | <100ms | <50ms ✅ |

### Benchmarks Performed

#### Test 1: Health Endpoint Throughput
**Target:** >100 req/s

```bash
autocannon -c 50 -d 30 http://localhost:4000/health
```

**Metrics:**
- Requests per second
- P95 latency
- Total requests
- Error rate

**Pass Criteria:** Throughput > 100 req/s

#### Test 2: Detailed Health Endpoint
**Purpose:** Test complex endpoint performance

```bash
autocannon -c 20 -d 10 http://localhost:4000/health/detailed
```

**Metrics:**
- Throughput
- P95 latency
- Response size

#### Test 3: Cache Hit Rate
**Target:** >80%

**Method:**
1. Query `/health/detailed`
2. Extract `metrics.cacheHitRate`
3. Compare against target

**Pass Criteria:** Hit rate ≥ 80%

#### Test 4: Backend Test Suite Performance
**Purpose:** Verify test execution time

**Method:**
```bash
time npm run test
```

**Metrics:**
- Total tests
- Passed tests
- Duration (seconds)
- Avg time per test

#### Test 5: Database Query Performance
**Target:** <100ms

**Method:**
```bash
docker exec dive-v3-mongodb mongosh --quiet --eval "db.adminCommand('ping')"
```

**Metrics:**
- Ping response time

**Pass Criteria:** Response time < 100ms

### Report Output
```
⚡ DIVE V3 - Performance Benchmark Suite
==========================================

Test 1: Health Endpoint Throughput
-----------------------------------
Target: >100 req/s

Results:
  Throughput: 152 req/s
  P95 Latency: 45 ms
  ✓ PASS (exceeds target)

==========================================
Performance Benchmark Report
==========================================

Test Results:

1. Health Endpoint Throughput
   - Throughput: 152 req/s (target: >100)
   - P95 Latency: 45 ms (target: <200)

2. Detailed Health Endpoint
   - Throughput: 85 req/s
   - P95 Latency: 78 ms

3. Cache Performance
   - Hit Rate: 85.3% (target: >80%)

4. Test Suite Performance
   - Total Tests: 609
   - Pass Rate: 609/609
   - Duration: 120s

5. Database Performance
   - Query Time: 35ms (target: <100 ms)

==========================================

✅ Performance benchmarks PASSED
System meets or exceeds all performance targets.
```

---

## QA Validation Suite

### Purpose
Comprehensive pre-deployment validation to ensure system quality.

### Script
`scripts/qa-validation.sh` (380 lines)

### Usage
```bash
# Run full validation
./scripts/qa-validation.sh
```

### Validation Checks (10 Total)

#### Check 1: All Tests Passing
**Command:** `npm test`

**Validation:**
- All tests pass (100% pass rate)
- No test failures or skipped tests
- Test output parseable

**Fail Conditions:**
- Any test failures
- Test suite doesn't run

#### Check 2: TypeScript Compilation
**Command:** `npx tsc --noEmit`

**Checks:**
- Backend TypeScript (0 errors)
- Frontend TypeScript (0 errors)

**Fail Conditions:**
- Type errors
- Missing type definitions
- Configuration errors

#### Check 3: ESLint Checks
**Command:** `npm run lint`

**Standards:**
- Backend: 0 errors (warnings tolerated)
- Frontend: 0 errors

**Fail Conditions:**
- ESLint errors
- Severe linting violations

#### Check 4: Security Audit
**Command:** `npm audit --production --audit-level=high`

**Checks:**
- Backend: No high/critical vulnerabilities
- Frontend: <10 total vulnerabilities

**Fail Conditions:**
- High or critical vulnerabilities in production dependencies
- Large vulnerability count

#### Check 5: Performance Benchmarks
**Checks:**
- Cache hit rate >80%
- Backend running and responding

**Skip:** If backend not running locally

#### Check 6: Database Indexes
**Command:** MongoDB index inspection via Docker

**Expected:**
- At least 15 indexes across collections
- 7 indexes on `idp_submissions`
- 7 indexes on `audit_logs`
- 7 indexes on `resources`

**Fail Conditions:**
- Missing critical indexes
- Index count too low

#### Check 7: Documentation
**Required Files:**
- `CHANGELOG.md` (>100 chars)
- `README.md` (>100 chars)
- `docs/IMPLEMENTATION-PLAN.md`
- `docs/PRODUCTION-DEPLOYMENT-GUIDE.md`
- `docs/PERFORMANCE-BENCHMARKING-GUIDE.md`

**Fail Conditions:**
- Missing required documentation
- Files exist but are too small (stub files)

#### Check 8: Build Verification
**Commands:**
- Backend: `npm run build` → verify `dist/server.js` exists
- Frontend: `npm run build` → verify `.next` directory exists

**Fail Conditions:**
- Build fails
- Build artifacts missing

#### Check 9: Docker Images
**Checks:**
- `dive-v3-mongodb` container running
- `dive-v3-opa` container running

**Status:** Warn if not running (not critical for local dev)

#### Check 10: Environment Configuration
**Checks:**
- Backend `.env` or `.env.local` exists
- Frontend `.env.local` exists (optional)

**Fail Conditions:**
- Backend environment file missing

### Exit Codes
- `0` - All checks passed
- `0` - 1-2 checks failed (warnings, acceptable)
- `1` - 3+ checks failed (deployment not recommended)

### Output Format
```
🔍 DIVE V3 - QA Validation Suite
=================================

Check 1: Running Full Test Suite
-----------------------------------

Running backend tests... ✓ PASS
  Total tests: 609
  Passed: 609

Check 2: TypeScript Compilation
--------------------------------

Backend TypeScript... ✓ PASS
Frontend TypeScript... ✓ PASS

[... more checks ...]

=================================
QA Validation Summary
=================================

Checks Passed: 10
Checks Failed: 0

✅ QA VALIDATION PASSED

All quality checks passed!
System is ready for deployment.
```

---

## E2E Test Suite

### Purpose
Comprehensive end-to-end testing covering all critical user flows and system integration.

### Test File
`backend/src/__tests__/qa/e2e-full-system.test.ts` (820 lines)

### Usage
```bash
cd backend
npm test -- e2e-full-system.test.ts
```

### Test Scenarios (11 Total)

#### Scenario 1: Gold Tier IdP Lifecycle
**Steps:**
1. Create IdP submission with perfect configuration
2. Phase 1 validation (TLS, crypto, OIDC, MFA)
3. Phase 2 risk scoring (expect ≥85 points)
4. Phase 2 compliance validation
5. Auto-approval decision
6. Verify IdP would be created in Keycloak
7. Verify metrics recorded
8. Verify audit logs

**Expected:** Auto-approve, gold tier, score ≥85

#### Scenario 2: Silver Tier IdP Lifecycle
**Steps:**
1. Create IdP with good (not perfect) configuration
2. Risk scoring (expect 70-84 points)
3. Fast-track decision
4. Verify 2-hour SLA deadline set

**Expected:** Fast-track, silver tier, 2hr SLA

#### Scenario 3: Bronze Tier IdP Lifecycle
**Steps:**
1. Create IdP with acceptable configuration
2. Risk scoring (expect 50-69 points)
3. Standard review decision
4. Verify 24-hour SLA deadline
5. Test SLA status transitions (within → approaching → exceeded)

**Expected:** Standard review, bronze tier, 24hr SLA

#### Scenario 4: Fail Tier IdP Lifecycle
**Steps:**
1. Create IdP with poor configuration (HTTP, weak crypto, no MFA)
2. Validation failures (TLS, crypto)
3. Risk scoring (expect <50 points)
4. Auto-reject decision
5. Verify rejection reason and improvement steps provided
6. Verify IdP NOT created

**Expected:** Auto-reject, fail tier, guidance provided

#### Scenario 5: Authorization Flow - Allow
**Steps:**
1. Create authorization input (valid clearance, releasability, COI)
2. Mock OPA decision (allow)
3. Verify decision cached
4. Repeat request (cache hit)
5. Verify cache statistics

**Expected:** ALLOW decision, cache utilization

#### Scenario 6: Authorization Flow - Deny (Clearance)
**Steps:**
1. Create authorization input (CONFIDENTIAL clearance, SECRET resource)
2. Mock OPA decision (deny - insufficient clearance)
3. Verify detailed error response

**Expected:** DENY with clearance reason

#### Scenario 7: Authorization Flow - Deny (Releasability)
**Steps:**
1. Create authorization input (FRA user, USA-only resource)
2. Mock OPA decision (deny - releasability mismatch)
3. Verify detailed error response

**Expected:** DENY with releasability reason

#### Scenario 8: Performance Under Load
**Steps:**
1. Create 100 concurrent authorization requests
2. Execute in parallel
3. Measure total duration
4. Verify all requests complete
5. Calculate success rate

**Targets:**
- Duration: <5 seconds for 100 requests
- Average latency: <50ms
- Success rate: 100%

#### Scenario 9: Circuit Breaker Resilience
**Steps:**
1. Simulate 5 service failures
2. Verify circuit opens
3. Verify subsequent requests rejected immediately (fail-fast)
4. Simulate service recovery
5. Verify circuit transitions: open → half-open → closed

**Expected:** Fail-fast when open, recovery when service returns

#### Scenario 10: Analytics Accuracy
**Steps:**
1. Seed known test data (2 gold, 2 silver, 1 bronze, 1 fail)
2. Calculate expected distribution
3. Verify analytics match expected values
4. Test analytics caching (5-minute TTL)

**Expected:** Analytics accurate, caching functional

#### Scenario 11: Health Monitoring
**Steps:**
1. Query detailed health endpoint
2. Verify service health reported
3. Simulate service failure (mock)
4. Verify degraded status detected

**Expected:** Health accurately reflects system state

### Test Infrastructure

**MongoDB Memory Server:**
- In-memory database for isolation
- Fast test execution
- No cleanup required

**Service Mocking:**
- Keycloak Admin Service
- External IdP endpoints
- KAS (optional)

**Assertions:**
- TypeScript type checking
- Jest matchers
- Performance thresholds

---

## Testing Strategy

### Test Pyramid

**Unit Tests (Base - 609 tests):**
- Fast execution (<5 minutes)
- High coverage (98%)
- Test individual functions/classes
- Mocked dependencies
- Run on every commit (pre-commit hook)

**Integration Tests (Middle):**
- Test service interactions
- Real databases (MongoDB, OPA)
- API-level testing
- Run in CI on every PR

**E2E Tests (Top - 11 scenarios):**
- Test complete user flows
- All phases integrated (1, 2, 3)
- MongoDB Memory Server for isolation
- Run in CI and before major releases

**QA Scripts (Continuous):**
- Smoke tests after every deployment
- Performance benchmarks weekly
- QA validation before merges

### When to Run Each Test Type

| Test Type | Frequency | Duration | Trigger |
|-----------|-----------|----------|---------|
| Unit | Every commit | ~5 min | Pre-commit hook |
| Integration | Every PR | ~4 min | GitHub Actions |
| E2E | Every PR + releases | ~8 min | GitHub Actions |
| OPA Policy | Every PR | ~30 sec | GitHub Actions |
| Smoke | After deployment | ~2 min | Manual/CD |
| Performance | Weekly + PRs | ~5 min | Manual/CI |
| QA Validation | Before merge | ~15 min | Manual |

### Coverage Targets

| Component | Target | Actual |
|-----------|--------|--------|
| Backend Services | 95% | 98% ✅ |
| Critical Services | 100% | 100% ✅ |
| Middleware | 95% | 97% ✅ |
| Controllers | 95% | 96% ✅ |
| OPA Policies | 100% | 100% ✅ |
| E2E Scenarios | All critical flows | 11/11 ✅ |

---

## Troubleshooting

### Smoke Tests Failing

**Issue:** Health endpoints return 500
- **Check:** Is backend running? `curl http://localhost:4000/health`
- **Fix:** Start backend with `cd backend && npm run dev`

**Issue:** MongoDB ping fails
- **Check:** Is MongoDB container running? `docker ps | grep mongo`
- **Fix:** Start with `docker-compose up -d mongodb`

**Issue:** OPA health check fails
- **Check:** Is OPA container running? `docker ps | grep opa`
- **Fix:** Start with `docker-compose up -d opa`

### Performance Benchmarks Failing

**Issue:** Throughput below target (<100 req/s)
- **Check:** System load, resource constraints
- **Fix:** Close unnecessary applications, increase resources

**Issue:** Cache hit rate below 80%
- **Check:** Cache warming, recent restarts
- **Fix:** Run load test first to warm cache

**Issue:** Database queries slow
- **Check:** Indexes present? `npm run optimize-database`
- **Fix:** Run optimization script to create indexes

### QA Validation Failures

**Issue:** TypeScript compilation errors
- **Check:** Run `npx tsc --noEmit` locally
- **Fix:** Address type errors before pushing

**Issue:** ESLint errors
- **Check:** Run `npm run lint` locally
- **Fix:** Auto-fix with `npm run lint -- --fix`

**Issue:** Security vulnerabilities
- **Check:** Run `npm audit`
- **Fix:** Update vulnerable packages with `npm audit fix`

### E2E Tests Failing

**Issue:** MongoDB Memory Server won't start
- **Check:** MongoDB binaries downloaded?
- **Fix:** Clear cache: `rm -rf node_modules/.cache/mongodb-memory-server`

**Issue:** Timeout errors
- **Check:** Test timeout setting (default: 15s)
- **Fix:** Increase in jest.config.js: `testTimeout: 30000`

**Issue:** Flaky tests (random failures)
- **Check:** Async operations, race conditions
- **Fix:** Add proper `await`, increase timeouts, add retry logic

---

## Best Practices

### Writing Effective Tests

**DO:**
- ✅ Test one thing per test
- ✅ Use descriptive test names
- ✅ Follow AAA pattern (Arrange, Act, Assert)
- ✅ Clean up resources after tests
- ✅ Use TypeScript types
- ✅ Mock external dependencies
- ✅ Make tests deterministic

**DON'T:**
- ❌ Test implementation details
- ❌ Rely on test execution order
- ❌ Use real external APIs
- ❌ Leave resources open (connections, files)
- ❌ Hard-code sensitive data
- ❌ Write flaky tests

### Test Data Management

**Good Test Data:**
```typescript
const testUser = {
  uniqueID: 'test.user@mil',
  clearance: 'SECRET',
  countryOfAffiliation: 'USA',
  acpCOI: ['NATO-COSMIC']
};

const testResource = {
  resourceId: 'test-doc-123',
  classification: 'SECRET',
  releasabilityTo: ['USA'],
  COI: ['NATO-COSMIC']
};
```

**Bad Test Data:**
```typescript
// ❌ Real user data
const testUser = {
  uniqueID: 'john.smith@pentagon.mil', // Real email
  clearance: 'TOP_SECRET' // Real clearance
};

// ❌ Production resource IDs
const testResource = {
  resourceId: 'doc-20241017-classified' // Looks like production
};
```

### Continuous Improvement

**Track Metrics:**
- Test execution time (target: decreasing)
- Flaky test count (target: 0)
- Coverage percentage (target: >95%)
- CI pass rate (target: >95%)

**Regular Maintenance:**
- Remove obsolete tests
- Update test data
- Refactor slow tests
- Add tests for new features

**Review Process:**
- Every PR must include tests
- Reviewers check test quality
- Reject PRs that decrease coverage

---

## Resources

### Documentation
- `docs/CI-CD-GUIDE.md` - CI/CD pipeline documentation
- `docs/PRODUCTION-DEPLOYMENT-GUIDE.md` - Deployment procedures
- `docs/PERFORMANCE-BENCHMARKING-GUIDE.md` - Performance testing
- `backend/TESTING-GUIDE.md` - Backend testing guide

### Tools
- [Jest](https://jestjs.io/) - Test framework
- [Supertest](https://github.com/visionmedia/supertest) - HTTP assertions
- [autocannon](https://github.com/mcollina/autocannon) - Load testing
- [MongoDB Memory Server](https://github.com/nodkz/mongodb-memory-server) - In-memory database

### External References
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [GitHub Actions Testing](https://docs.github.com/en/actions/automating-builds-and-tests)

---

**Last Updated:** October 17, 2025  
**Phase 4 - CI/CD & QA Automation**

