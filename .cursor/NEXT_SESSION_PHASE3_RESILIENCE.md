# DIVE V3 Production Resilience Enhancement - Phase 3+ Session Handoff

**Session Date:** 2026-01-21
**Previous Commits:** `a7ef3636`, `ca53e28f`
**Status:** Phase 1 & 2 Complete, Phase 3+ Ready

---

## 🎯 SESSION OBJECTIVE

Continue production resilience enhancement for the DIVE V3 federated ICAM system. **CRITICAL:** This session focuses on implementing remaining resilience features using **ONLY** the DIVE CLI (`./dive` and `@scripts/dive-modules`). Absolutely NO manual Docker commands are permitted.

**Core Principles:**
- ✅ **Audit & Enhance:** Review existing logic, enhance functions (never duplicate)
- ✅ **Database as SSOT:** MongoDB for federation registry, PostgreSQL for orchestration state
- ✅ **Monitoring Infrastructure:** Prometheus/Grafana/AlertManager already exist in `docker/instances/shared`
- ✅ **Best Practices Only:** No shortcuts, workarounds, or "quick fixes"
- ✅ **Clean Slate Testing:** All data is DUMMY/FAKE - authorized to `./dive nuke` for testing
- ✅ **DIVE CLI Exclusive:** Use `./dive` commands only - never raw `docker` or `docker-compose`

---

## 📋 COMPLETED WORK (Phase 1 & 2)

### ✅ Phase 1: Production Resilience Foundations
**Commit:** `a7ef3636` - feat(resilience): Phase 1 production resilience enhancements

#### 1.1 Federation Verification with Exponential Backoff
**Modified Files:**
- `scripts/dive-modules/spoke/pipeline/spoke-federation.sh`
  - Added `_spoke_federation_clear_keycloak_cache()` - clears realm/user caches
  - Added `_spoke_federation_verify_oidc_endpoints()` - tests OIDC discovery
  - Upgraded retry logic: 5 attempts (2s, 4s, 8s, 16s, 32s exponential backoff)

- `scripts/dive-modules/spoke/pipeline/phase-verification.sh`
  - Added `_spoke_verify_federation_oidc_endpoints()` - tests OIDC discovery
  - Added `_spoke_verify_federation_fallback()` - fallback IdP checks
  - Upgraded retry logic: 4 attempts (3s, 6s, 12s, 24s exponential backoff)

**Key Improvements:**
- Keycloak cache clearing ensures immediate visibility of federation changes
- OIDC endpoint testing validates functional readiness (not just configuration)
- Exponential backoff handles eventual consistency gracefully

#### 1.2 Schema Migration Resilience
**Modified File:** `scripts/dive-modules/orchestration-state-db.sh`

**Enhanced Function:** `orch_db_init_schema()`
- Added `orch_db_schema_preflight_check()` - verifies PostgreSQL health before migration
- Implemented PostgreSQL advisory locks (lock ID: `1234567890`) to prevent concurrent schema modifications
- Added table count verification before/after migration
- Ensures true idempotency (can run multiple times safely)

**Key Improvements:**
- Prevents race conditions during parallel spoke deployments
- Pre-flight checks abort early if database is unhealthy
- Post-flight validation ensures migration success

#### 1.3 Integration Test Suite
**New File:** `tests/integration/test-deployment-resilience.sh` (executable)

**Test Suites:**
1. **Clean Slate Deployment** - Hub → Spoke from `./dive nuke`
2. **Idempotent Deployment** - Redeploy without errors
3. **Concurrent Deployment** - Multiple spokes simultaneously
4. **Federation Resilience** - Verify retry logic and OIDC endpoints
5. **Database Operations** - Advisory locks and state persistence

**Usage:**
```bash
./tests/integration/test-deployment-resilience.sh all       # Full suite
./tests/integration/test-deployment-resilience.sh --quick   # Fast validation
./tests/integration/test-deployment-resilience.sh federation # Single suite
```

**Stats:** ~450 lines added, 15+ test cases

---

### ✅ Phase 2: Monitoring & Observability Integration
**Commit:** `ca53e28f` - feat(monitoring): Phase 2 monitoring and observability enhancement

#### 2.1 Prometheus Configuration Fix
**Modified File:** `docker/instances/shared/config/prometheus.yml`
- Fixed `rule_files` path: `rules/*.yml` → `prometheus/rules/*.yml`

#### 2.2 Comprehensive Alert Rules
**New File:** `docker/instances/shared/config/prometheus/rules/dive-deployment.yml`

**Alert Groups:**
- `dive_deployment`: SpokeDeploymentFailed, HubNotReady, DeploymentDurationHigh, DIVEContainerUnhealthy
- `dive_federation`: FederationLinkDown, FederationVerificationFailing, IdPNotConfigured, FederationLatencyHigh
- `dive_database`: OrchestrationDBDown, MongoDBConnectionIssues, StateTransitionFailures
- `dive_service_health`: BackendAPIDown, OPADown, KeycloakDegraded, HighErrorRate, HighRequestLatency
- `dive_security`: CertificateExpiringSoon, HighInvalidTokenRate

**Thresholds:**
- Federation down: 5m before alert
- Deployment failed: 1m before alert
- High latency: p95 > 1s for 5m
- Certificate expiry: < 30 days

#### 2.3 AlertManager Enhancement
**Modified File:** `docker/instances/shared/config/alertmanager.yml`

**Features:**
- **Inhibition Rules:** Suppress dependent alerts (e.g., spoke alerts when hub is down)
- **Routing Tree:** Routes by severity and component (federation, deployment, security, database)
- **Multiple Receivers:** Ready for Slack/email integration (currently commented out)
- **Repeat Intervals:** Critical: 1h, Warning: 4h

**Stats:** ~400 lines added, 25+ alert rules, 6 receivers

---

## 📊 PROJECT STRUCTURE (Relevant Files)

```
DIVE-V3/
├── .cursor/
│   ├── NEXT_SESSION_DEPLOYMENT_RESILIENCE.md  # Original requirements (1167 lines)
│   └── NEXT_SESSION_PHASE3_RESILIENCE.md      # This handoff document
│
├── scripts/
│   ├── dive                                    # Main CLI entrypoint
│   └── dive-modules/
│       ├── common.sh                           # Shared utilities
│       ├── orchestration-state-db.sh           # ✅ Phase 1: Enhanced schema init
│       ├── federation-link.sh                  # Federation linking logic
│       ├── federation-state-db.sh              # Federation state management
│       ├── hub/
│       │   └── pipeline/
│       │       ├── phase-*.sh                  # Hub deployment phases
│       │       └── hub-services.sh
│       └── spoke/
│           └── pipeline/
│               ├── spoke-federation.sh         # ✅ Phase 1: Enhanced verification
│               ├── phase-verification.sh       # ✅ Phase 1: Enhanced OIDC checks
│               ├── phase-*.sh                  # Other spoke phases
│               └── spoke-services.sh
│
├── tests/
│   └── integration/
│       ├── test-deployment-resilience.sh       # ✅ Phase 1: New test suite
│       ├── test-bidirectional-federation.sh
│       └── test-full-deployment.sh
│
├── docker/
│   └── instances/
│       └── shared/
│           └── config/
│               ├── prometheus.yml              # ✅ Phase 2: Fixed rule path
│               ├── alertmanager.yml            # ✅ Phase 2: Enhanced routing
│               ├── prometheus/
│               │   └── rules/
│               │       ├── dive-deployment.yml # ✅ Phase 2: New alert rules
│               │       ├── kas.yml             # Existing KAS alerts
│               │       └── redis.yml           # Existing Redis alerts
│               └── grafana/
│                   └── provisioning/
│                       ├── dashboards/
│                       │   ├── hub-overview.json
│                       │   ├── federation-metrics.json
│                       │   └── ...
│                       └── datasources/
│                           └── datasources.yml
│
├── instances/
│   ├── usa/                                    # Hub instance (USA)
│   │   ├── config.json
│   │   └── docker-compose.yml
│   ├── fra/                                    # Spoke instance (France)
│   ├── deu/                                    # Spoke instance (Germany)
│   └── .../                                    # Other spokes
│
├── backend/
│   └── src/
│       ├── services/
│       │   ├── audit.service.ts
│       │   ├── upload.service.ts
│       │   └── spif-parser.service.ts
│       └── middleware/
│           └── upload.middleware.ts
│
├── data/
│   └── hub/
│       └── config/
│           └── hub.json                        # Hub configuration
│
└── monitoring/                                 # Monitoring stack configs
    ├── prometheus.yml
    ├── alertmanager.yml
    └── grafana.yml
```

---

## 🔍 SCOPE GAP ANALYSIS

### ✅ COMPLETED (Phase 1 & 2)
| Feature | Status | Evidence |
|---------|--------|----------|
| Exponential backoff for federation verification | ✅ | `spoke-federation.sh`, `phase-verification.sh` |
| Keycloak cache clearing | ✅ | `_spoke_federation_clear_keycloak_cache()` |
| OIDC discovery endpoint testing | ✅ | `_spoke_federation_verify_oidc_endpoints()` |
| Schema migration idempotency | ✅ | `orch_db_init_schema()` with advisory locks |
| PostgreSQL advisory locks | ✅ | Lock ID 1234567890 in `orchestration-state-db.sh` |
| Pre-flight health checks | ✅ | `orch_db_schema_preflight_check()` |
| Integration test suite | ✅ | `test-deployment-resilience.sh` (5 suites) |
| Prometheus alert rules | ✅ | `dive-deployment.yml` (25+ rules) |
| AlertManager routing | ✅ | Enhanced `alertmanager.yml` |
| Monitoring documentation | ✅ | Inline comments and annotations |

### 🔄 IN PROGRESS (Deferred to Phase 3+)
| Feature | Priority | Complexity | Blockers |
|---------|----------|------------|----------|
| **3.1 Health Check Endpoints** | High | Medium | Need to audit existing health checks |
| **3.2 Circuit Breaker for Federation** | High | High | Depends on health checks |
| **3.3 Database Connection Pooling** | Medium | Medium | Need to audit existing connection logic |
| **3.4 Grafana Dashboard Automation** | Medium | Low | Monitoring stack exists |
| **3.5 Metrics Instrumentation** | High | Medium | Need to identify metric gaps |
| **4.1 Unit Tests (bats framework)** | High | Medium | Test framework setup |
| **4.2 E2E Resilience Tests** | High | High | Requires full environment |
| **4.3 Chaos Engineering Tests** | Low | High | Advanced - stretch goal |
| **5.1 CI/CD Integration** | Medium | Medium | GitHub Actions |

### ❌ NOT NEEDED (Scope Clarifications)
| Feature | Reason |
|---------|--------|
| Static JSON migration (federation registry) | Database is already SSOT - no dual-write needed |
| Manual docker commands | DIVE CLI (`./dive`) handles all orchestration |
| Prometheus/Grafana setup | Already exists in `docker/instances/shared` |
| Secret rotation logic | GCP Secret Manager handles this |
| Custom metrics exporters | Standard exporters sufficient |

---

## 📖 LESSONS LEARNED

### 1. **Existing Logic is Robust**
- The codebase already has sophisticated retry logic in many places
- MongoDB was **already** the SSOT for federation registry
- Monitoring infrastructure (Prometheus/Grafana/AlertManager) **already exists**
- **Action:** Always audit before implementing - avoid duplication

### 2. **Enhancement Over Creation**
- `spoke-federation.sh` already had retry logic - we upgraded it to exponential backoff
- `orchestration-state-db.sh` already had schema init - we added pre-flight checks and locks
- **Action:** Modify existing functions rather than creating parallel implementations

### 3. **DIVE CLI is the Interface**
- All Docker operations go through `./dive` commands
- Direct `docker` or `docker-compose` commands bypass orchestration state tracking
- **Action:** Never bypass the CLI - extend it if needed

### 4. **Eventual Consistency is Real**
- Keycloak IdP changes take 5-30 seconds to propagate
- Federation verification must retry with backoff
- **Action:** Always implement exponential backoff for distributed operations

### 5. **Testing Requires Clean Slate**
- Integration tests need `./dive nuke` to start fresh
- Pre-existing state causes flaky tests
- **Action:** Document cleanup steps in test suites

### 6. **Advisory Locks Prevent Races**
- PostgreSQL advisory locks prevent concurrent schema modifications
- Critical for parallel spoke deployments
- **Action:** Use advisory locks for all stateful critical sections

### 7. **Monitoring is Multi-Layered**
- Prometheus scrapes metrics
- AlertManager routes notifications
- Grafana visualizes trends
- **Action:** Define metrics → alerts → dashboards in sequence

---

## 🎯 PHASED IMPLEMENTATION PLAN (Phase 3+)

### **PHASE 3: Enhanced Service Health & Circuit Breaking**
**Goal:** Implement comprehensive health checks and circuit breaker patterns for federation resilience.

**Timeline:** 2-3 hours
**Dependencies:** Phase 1 & 2 complete

#### 3.1 Health Check Endpoints (Priority: HIGH)
**SMART Goal:** Implement standardized `/health` and `/ready` endpoints for all DIVE services with 100% coverage.

**Tasks:**
1. **Audit Existing Health Checks**
   - [ ] Read `backend/src/controllers/*.ts` to identify existing health endpoints
   - [ ] Check `scripts/dive-modules/*/pipeline/phase-verification.sh` for health check patterns
   - [ ] Document current health check coverage (expected: partial)

2. **Enhance Backend Health Endpoint**
   - [ ] Modify `backend/src/controllers/health.controller.ts` (if exists) or create
   - [ ] Add checks: MongoDB connection, OPA reachability, Keycloak reachability, Redis blacklist
   - [ ] Return JSON: `{ status: "healthy"|"degraded"|"unhealthy", checks: {...} }`

3. **Add Health Checks to Verification Scripts**
   - [ ] Enhance `scripts/dive-modules/hub/pipeline/phase-verification.sh`
   - [ ] Enhance `scripts/dive-modules/spoke/pipeline/phase-verification.sh`
   - [ ] Use `curl -sf http://localhost:3000/health` with retries

4. **Prometheus Health Metric**
   - [ ] Instrument backend to expose `dive_v3_service_health{component="backend"} 1|0`
   - [ ] Update Prometheus scrape config to collect health metrics
   - [ ] Add alert rule: `ServiceUnhealthy` when metric == 0 for 5m

**Success Criteria:**
- ✅ All services (hub backend, spoke backend, KAS) have `/health` endpoints
- ✅ Health checks return structured JSON with sub-component status
- ✅ Verification scripts call health endpoints before declaring success
- ✅ Prometheus alert fires when service unhealthy for 5m
- ✅ Integration test validates health endpoint responses

**Files to Modify:**
- `backend/src/controllers/health.controller.ts` (create or enhance)
- `scripts/dive-modules/hub/pipeline/phase-verification.sh`
- `scripts/dive-modules/spoke/pipeline/phase-verification.sh`
- `docker/instances/shared/config/prometheus/rules/dive-deployment.yml`

---

#### 3.2 Circuit Breaker for Federation (Priority: HIGH)
**SMART Goal:** Implement circuit breaker pattern to prevent cascading failures when federation endpoints are unavailable.

**Tasks:**
1. **Audit Federation Request Patterns**
   - [ ] Read `scripts/dive-modules/federation-link.sh` to understand HTTP call patterns
   - [ ] Identify all places where federation makes HTTP requests to Keycloak admin API
   - [ ] Document retry/timeout behavior (expected: basic retries exist)

2. **Create Circuit Breaker Helper Module**
   - [ ] Create `scripts/dive-modules/circuit-breaker.sh`
   - [ ] Implement functions: `cb_init()`, `cb_call()`, `cb_get_state()`, `cb_reset()`
   - [ ] States: CLOSED (normal), OPEN (failing), HALF_OPEN (testing recovery)
   - [ ] Store state in PostgreSQL `orchestration.circuit_breaker_state` table

3. **Integrate Circuit Breaker into Federation**
   - [ ] Modify `scripts/dive-modules/spoke/pipeline/spoke-federation.sh`
   - [ ] Wrap Keycloak admin API calls with `cb_call "federation-link" "curl ..."`
   - [ ] If circuit OPEN, fail fast with clear message (don't retry)
   - [ ] Add `./dive federation reset-circuit <spoke>` command

4. **Prometheus Circuit Breaker Metrics**
   - [ ] Expose `dive_v3_circuit_breaker_state{circuit="federation-link",instance="FRA"} 0|1|2`
   - [ ] Add alert rule: `CircuitBreakerOpen` when state == 2 for 1m

**Success Criteria:**
- ✅ Circuit breaker module is idempotent and stateful (uses PostgreSQL)
- ✅ Federation fails fast when circuit is OPEN (no wasted retries)
- ✅ Circuit auto-recovers to HALF_OPEN after cooldown (60s)
- ✅ Prometheus alert fires when circuit opens
- ✅ Integration test simulates failure and validates circuit opens

**Files to Create/Modify:**
- `scripts/dive-modules/circuit-breaker.sh` (NEW)
- `scripts/dive-modules/spoke/pipeline/spoke-federation.sh` (MODIFY)
- `scripts/dive-modules/orchestration-state-db.sh` (ADD circuit_breaker_state table)
- `docker/instances/shared/config/prometheus/rules/dive-deployment.yml` (ADD alert)

---

#### 3.3 Database Connection Pooling Resilience (Priority: MEDIUM)
**SMART Goal:** Ensure MongoDB and PostgreSQL connection pools are configured for high availability with automatic recovery.

**Tasks:**
1. **Audit Backend Database Connections**
   - [ ] Read `backend/src/config/database.ts` (or similar) for MongoDB connection logic
   - [ ] Read `scripts/dive-modules/orchestration-state-db.sh` for PostgreSQL connection logic
   - [ ] Document current pooling config (min/max connections, timeouts)

2. **Enhance MongoDB Connection Resilience**
   - [ ] Verify `retryWrites=true` and `w=majority` in connection string
   - [ ] Set `maxPoolSize=50`, `minPoolSize=5`, `serverSelectionTimeoutMS=5000`
   - [ ] Add connection retry logic with exponential backoff (5 attempts)
   - [ ] Log connection events: `connected`, `disconnected`, `reconnect_failed`

3. **Enhance PostgreSQL Connection Resilience**
   - [ ] Wrap all `psql` calls in `scripts/dive-modules/orchestration-state-db.sh` with retry logic
   - [ ] Use `pg_isready` for health checks before connection attempts
   - [ ] Set connection timeout: `--set=statement_timeout=5000`
   - [ ] Add connection event logging

4. **Add Database Connection Metrics**
   - [ ] Backend: Expose `dive_v3_db_connections{type="mongodb"|"postgres",state="active"|"idle"}`
   - [ ] Add alert rule: `DBConnectionPoolExhausted` when active > 45 (90% of max)

**Success Criteria:**
- ✅ MongoDB connections auto-retry on transient failures
- ✅ PostgreSQL connections timeout after 5s (no indefinite hangs)
- ✅ Connection pool metrics visible in Prometheus
- ✅ Alert fires when connection pool nears exhaustion
- ✅ Integration test validates recovery from database restart

**Files to Modify:**
- `backend/src/config/database.ts` (or equivalent)
- `scripts/dive-modules/orchestration-state-db.sh`
- `docker/instances/shared/config/prometheus/rules/dive-deployment.yml`

---

### **PHASE 4: Comprehensive Testing Suite**
**Goal:** Achieve 80%+ test coverage for resilience features with automated testing.

**Timeline:** 3-4 hours
**Dependencies:** Phase 3 complete

#### 4.1 Unit Tests with bats Framework (Priority: HIGH)
**SMART Goal:** Implement unit tests for all Bash modules using bats-core framework with 80%+ function coverage.

**Tasks:**
1. **Install bats Framework**
   - [ ] Add bats-core as dev dependency: `git submodule add https://github.com/bats-core/bats-core.git tests/lib/bats`
   - [ ] Create `tests/unit/` directory structure
   - [ ] Add `tests/run-unit-tests.sh` wrapper script

2. **Unit Test: orchestration-state-db.sh**
   - [ ] Create `tests/unit/test-orchestration-state-db.bats`
   - [ ] Test: `orch_db_init_schema()` idempotency (run twice, check success)
   - [ ] Test: `orch_db_acquire_lock()` prevents concurrent access
   - [ ] Test: `orch_db_set_state()` persists correctly
   - [ ] Test: `orch_db_get_state()` returns correct value
   - [ ] Mock PostgreSQL with Docker test container

3. **Unit Test: circuit-breaker.sh**
   - [ ] Create `tests/unit/test-circuit-breaker.bats`
   - [ ] Test: Circuit transitions CLOSED → OPEN after 5 failures
   - [ ] Test: Circuit transitions OPEN → HALF_OPEN after cooldown
   - [ ] Test: Circuit transitions HALF_OPEN → CLOSED on success
   - [ ] Test: `cb_call()` fails fast when circuit OPEN

4. **Unit Test: spoke-federation.sh**
   - [ ] Create `tests/unit/test-spoke-federation.bats`
   - [ ] Test: `_spoke_federation_clear_keycloak_cache()` calls correct endpoints
   - [ ] Test: `_spoke_federation_verify_oidc_endpoints()` validates OIDC discovery
   - [ ] Test: Exponential backoff delays are correct (2s, 4s, 8s, 16s, 32s)
   - [ ] Mock Keycloak API responses

5. **CI Integration**
   - [ ] Add GitHub Actions workflow: `.github/workflows/unit-tests.yml`
   - [ ] Run unit tests on every PR
   - [ ] Fail PR if tests fail or coverage < 80%

**Success Criteria:**
- ✅ bats framework installed and runnable: `./tests/run-unit-tests.sh`
- ✅ 80%+ function coverage for critical modules
- ✅ All unit tests pass in isolation (no external dependencies)
- ✅ Tests run in CI pipeline on every PR
- ✅ Test execution time < 5 minutes

**Files to Create:**
- `tests/lib/bats/` (git submodule)
- `tests/unit/test-orchestration-state-db.bats`
- `tests/unit/test-circuit-breaker.bats`
- `tests/unit/test-spoke-federation.bats`
- `tests/run-unit-tests.sh`
- `.github/workflows/unit-tests.yml`

---

#### 4.2 E2E Resilience Tests (Priority: HIGH)
**SMART Goal:** Extend integration test suite to cover failure scenarios and recovery paths.

**Tasks:**
1. **Extend test-deployment-resilience.sh**
   - [ ] Add suite: `suite_failure_recovery()`
   - [ ] Test: Hub restart during spoke deployment (expect graceful failure)
   - [ ] Test: Network partition between hub and spoke (circuit breaker opens)
   - [ ] Test: MongoDB restart during resource upload (connection pool recovers)
   - [ ] Test: Keycloak restart during federation link (retries succeed)

2. **Create test-chaos-engineering.sh**
   - [ ] Random service kill: `docker kill dive-hub-backend` (expect recovery)
   - [ ] Random network delay: `tc qdisc add dev eth0 root netem delay 2000ms`
   - [ ] Random disk full: Fill `/tmp` to 100% (expect graceful degradation)
   - [ ] Random CPU spike: Stress test with `stress-ng`

3. **Automate E2E Test Execution**
   - [ ] Add `./dive test resilience` command to main CLI
   - [ ] Run full suite: clean slate → deploy → failure injection → recovery
   - [ ] Generate HTML test report: `tests/reports/resilience-report.html`

**Success Criteria:**
- ✅ All failure scenarios tested and documented
- ✅ Tests validate recovery within defined SLOs (e.g., < 2 min)
- ✅ Chaos engineering tests pass (no permanent failures)
- ✅ Test report generated and saved to `tests/reports/`
- ✅ E2E tests runnable via `./dive test resilience`

**Files to Modify/Create:**
- `tests/integration/test-deployment-resilience.sh` (EXTEND)
- `tests/integration/test-chaos-engineering.sh` (NEW)
- `scripts/dive-modules/test-runner.sh` (NEW)
- `scripts/dive` (ADD `test resilience` command)

---

#### 4.3 Performance & Load Testing (Priority: LOW - Stretch Goal)
**SMART Goal:** Validate DIVE can handle 100 concurrent users with p95 latency < 500ms under load.

**Tasks:**
1. **Install k6 Load Testing Framework**
   - [ ] Add k6 to dev dependencies
   - [ ] Create `tests/performance/` directory

2. **Create Load Test Scenarios**
   - [ ] Scenario 1: 100 concurrent logins (federated SSO)
   - [ ] Scenario 2: 1000 resource downloads (with OPA authorization)
   - [ ] Scenario 3: 50 concurrent deployments (spoke creation)

3. **Run Load Tests and Analyze**
   - [ ] Execute: `k6 run tests/performance/federation-load.js`
   - [ ] Validate: p95 latency < 500ms, error rate < 1%
   - [ ] Generate report: `tests/reports/load-test-report.html`

**Success Criteria:**
- ✅ k6 installed and runnable
- ✅ 3 load test scenarios implemented
- ✅ System meets SLOs under load
- ✅ Load test report generated

**Files to Create:**
- `tests/performance/federation-load.js`
- `tests/performance/resource-download-load.js`
- `tests/performance/deployment-load.js`

---

### **PHASE 5: CI/CD Pipeline Integration**
**Goal:** Automate testing and deployment validation in GitHub Actions.

**Timeline:** 2 hours
**Dependencies:** Phase 4 complete

#### 5.1 GitHub Actions Workflows (Priority: MEDIUM)
**SMART Goal:** Implement CI pipeline that runs unit tests, integration tests, and linting on every PR.

**Tasks:**
1. **Create Unit Test Workflow**
   - [ ] Create `.github/workflows/unit-tests.yml`
   - [ ] Trigger: On PR to `main`
   - [ ] Steps: Checkout, setup bats, run `./tests/run-unit-tests.sh`
   - [ ] Fail if tests fail or coverage < 80%

2. **Create Integration Test Workflow**
   - [ ] Create `.github/workflows/integration-tests.yml`
   - [ ] Trigger: On PR to `main` (manual approval for resource usage)
   - [ ] Steps: Checkout, `./dive nuke`, `./dive hub deploy`, run integration tests
   - [ ] Upload test reports as artifacts

3. **Create Linting Workflow**
   - [ ] Create `.github/workflows/lint.yml`
   - [ ] Steps: ShellCheck for Bash, ESLint for TypeScript, yamllint for YAML
   - [ ] Fail if linting errors found

4. **Branch Protection Rules**
   - [ ] Require: All tests pass before merge
   - [ ] Require: 1 approval from code owner
   - [ ] Block: Direct commits to `main`

**Success Criteria:**
- ✅ Unit tests run automatically on every PR
- ✅ Integration tests run on-demand with manual approval
- ✅ Linting enforced on all PRs
- ✅ Branch protection prevents broken code from merging
- ✅ Test reports available as downloadable artifacts

**Files to Create:**
- `.github/workflows/unit-tests.yml`
- `.github/workflows/integration-tests.yml`
- `.github/workflows/lint.yml`

---

## 📈 SUCCESS CRITERIA (Overall)

### Phase 3: Service Health & Circuit Breaking
- [ ] All services have `/health` endpoints returning structured JSON
- [ ] Circuit breaker prevents cascading failures during federation issues
- [ ] Database connection pools auto-recover from transient failures
- [ ] Prometheus alerts fire for unhealthy services and open circuits
- [ ] Integration tests validate failure injection and recovery

### Phase 4: Comprehensive Testing
- [ ] Unit test coverage > 80% for critical modules (orchestration, federation, circuit-breaker)
- [ ] E2E tests cover 10+ failure scenarios (service kill, network partition, disk full)
- [ ] Chaos engineering tests validate graceful degradation
- [ ] All tests runnable via `./dive test` commands
- [ ] Test reports generated automatically

### Phase 5: CI/CD Pipeline
- [ ] Unit tests run on every PR (pass required for merge)
- [ ] Integration tests runnable on-demand
- [ ] Linting enforced (ShellCheck, ESLint, yamllint)
- [ ] Branch protection prevents direct commits to `main`

### Overall Resilience Metrics
- [ ] **MTTR (Mean Time To Recovery):** < 2 minutes for service failures
- [ ] **Deployment Success Rate:** > 95% on first attempt
- [ ] **Federation Uptime:** > 99.9% (excluding planned maintenance)
- [ ] **Schema Migration:** 100% idempotent (no errors on re-run)
- [ ] **Test Execution Time:** Unit tests < 5 min, Integration tests < 20 min

---

## 🚀 GETTING STARTED (Phase 3)

### Step 1: Verify Phase 1 & 2 Changes
```bash
# Pull latest changes
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3
git pull origin main

# Verify commits exist
git log --oneline | head -5
# Expected: ca53e28f feat(monitoring): Phase 2...
# Expected: a7ef3636 feat(resilience): Phase 1...

# Verify test suite exists
ls -lh tests/integration/test-deployment-resilience.sh
# Expected: -rwxr-xr-x ... test-deployment-resilience.sh

# Verify alert rules exist
ls -lh docker/instances/shared/config/prometheus/rules/dive-deployment.yml
# Expected: dive-deployment.yml (should exist)
```

### Step 2: Test Clean Slate Deployment
```bash
# Nuke all existing resources (data is DUMMY/FAKE)
./dive nuke all --confirm

# Deploy hub
./dive hub deploy

# Wait for hub to stabilize
sleep 60

# Check hub status
./dive hub status
# Expected: All services healthy

# Deploy test spoke
./dive spoke deploy tst

# Wait for spoke to stabilize
sleep 90

# Verify federation
./dive federation verify TST
# Expected: Bidirectional federation confirmed
```

### Step 3: Run Phase 1 Integration Tests
```bash
# Run quick test suite (skips deployment tests)
./tests/integration/test-deployment-resilience.sh --quick

# Expected output:
# ✓ Federation verify completes with retries
# ✓ OIDC discovery endpoints reachable
# ✓ Advisory locks work correctly
# ✓ State persists in database
# Total: 4-6 tests, All PASS

# Run full test suite (includes deployment from scratch)
./tests/integration/test-deployment-resilience.sh all

# Expected duration: 15-20 minutes
# Expected: 15+ tests, All PASS
```

### Step 4: Verify Monitoring Stack
```bash
# Check Prometheus is scraping
curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | {job: .labels.job, health: .health}'

# Check AlertManager is running
curl -s http://localhost:9093/api/v2/status | jq '.cluster.status'

# Check alert rules loaded
curl -s http://localhost:9090/api/v1/rules | jq '.data.groups[].name'
# Expected: dive_deployment, dive_federation, dive_database, dive_service_health, dive_security
```

### Step 5: Begin Phase 3 Implementation
```bash
# Start with health check endpoints (Task 3.1)
# Read existing health controller
cat backend/src/controllers/health.controller.ts 2>/dev/null || echo "File does not exist - needs creation"

# Read verification scripts
cat scripts/dive-modules/hub/pipeline/phase-verification.sh | grep -A 10 "health"
cat scripts/dive-modules/spoke/pipeline/phase-verification.sh | grep -A 10 "health"

# Document findings in implementation notes
```

---

## 🛠️ CRITICAL REMINDERS

### ✅ DO:
1. **Always audit existing logic first** - Read files before modifying
2. **Use DIVE CLI exclusively** - `./dive hub deploy`, `./dive spoke deploy`, etc.
3. **Test on clean slate** - Run `./dive nuke all --confirm` before major tests
4. **Enhance existing functions** - Modify, don't duplicate
5. **Use exponential backoff** - For all retry logic (2s, 4s, 8s, 16s, 32s)
6. **Log decisions** - Every deployment decision should be logged
7. **Commit after each phase** - Incremental commits with descriptive messages
8. **Validate YAML** - Use `yamllint` or `python -c "import yaml; yaml.safe_load(...)"`
9. **Document changes** - Update comments and README where applicable
10. **Test idempotency** - Run operations twice, expect same outcome

### ❌ DON'T:
1. **Never use manual docker commands** - No `docker ps`, `docker exec`, `docker-compose up`
2. **Never bypass DIVE CLI** - It tracks orchestration state in PostgreSQL
3. **Never hardcode secrets** - Use GCP Secret Manager
4. **Never assume eventual consistency is instant** - Always retry with backoff
5. **Never skip pre-flight checks** - Verify dependencies before starting
6. **Never ignore advisory locks** - Race conditions are real
7. **Never simplify/workaround** - Use best practices, no shortcuts
8. **Never skip testing** - Every change needs a test
9. **Never commit without running tests** - Run `./tests/integration/test-deployment-resilience.sh --quick`
10. **Never leave debug code** - Remove `set -x`, console logs before commit

---

## 📞 QUESTIONS TO ANSWER IN SESSION

### Architecture Questions
1. Do health check endpoints already exist? If so, where?
2. Is there existing circuit breaker logic anywhere in the codebase?
3. What is the current database connection pool configuration?
4. Are there any existing metrics exporters beyond Prometheus?

### Implementation Questions
1. Should circuit breaker state persist across service restarts? (Recommendation: YES, use PostgreSQL)
2. Should health checks be synchronous or asynchronous? (Recommendation: Sync for critical, async for optional)
3. What is the acceptable SLO for federation verification? (Recommendation: < 2 min)
4. Should we implement graceful degradation for non-critical services? (Recommendation: YES)

### Testing Questions
1. Is there a staging environment for integration tests? (Assumption: NO, test locally with `./dive nuke`)
2. Should chaos engineering tests run automatically or on-demand? (Recommendation: On-demand only)
3. What is the acceptable test execution time? (Recommendation: Unit < 5 min, Integration < 20 min)

---

## 📚 REFERENCE DOCUMENTATION

### Key Files to Read First
1. `scripts/dive-modules/common.sh` - Shared utilities
2. `scripts/dive-modules/orchestration-state-db.sh` - State management
3. `scripts/dive-modules/spoke/pipeline/spoke-federation.sh` - Federation logic
4. `tests/integration/test-deployment-resilience.sh` - Test patterns
5. `docker/instances/shared/config/prometheus/rules/dive-deployment.yml` - Alert patterns

### External Documentation
- **Bash Best Practices:** https://google.github.io/styleguide/shellguide.html
- **bats Testing:** https://bats-core.readthedocs.io/
- **Prometheus Alerting:** https://prometheus.io/docs/alerting/latest/
- **Circuit Breaker Pattern:** https://martinfowler.com/bliki/CircuitBreaker.html
- **PostgreSQL Advisory Locks:** https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS

### DIVE CLI Commands Reference
```bash
# Hub operations
./dive hub deploy              # Deploy hub
./dive hub status              # Check hub status
./dive hub logs <service>      # View hub service logs
./dive hub down                # Stop hub

# Spoke operations
./dive spoke deploy <code>     # Deploy spoke
./dive spoke status <code>     # Check spoke status
./dive spoke logs <code>       # View spoke logs
./dive spoke down <code>       # Stop spoke

# Federation operations
./dive federation link <code>  # Link spoke to hub
./dive federation verify <code> # Verify federation
./dive federation status       # Check all federation links

# Orchestration database
./dive orch-db status          # Check orchestration database
./dive orch-db init            # Initialize schema
./dive orch-db query <sql>     # Run SQL query

# Testing
./dive test resilience         # Run resilience tests (Phase 4)
./dive nuke all --confirm      # Destroy all resources
```

---

## 🎯 SESSION OUTPUT EXPECTATIONS

At the end of this session, the following should be complete:

### Deliverables
1. **Health check endpoints** implemented for all services
2. **Circuit breaker module** (`circuit-breaker.sh`) created and integrated
3. **Database connection pooling** enhanced with retry logic
4. **Unit test framework** (bats) installed and 3+ test files created
5. **Extended integration tests** covering 10+ failure scenarios
6. **New alert rules** for health checks and circuit breakers
7. **Git commits** for Phase 3 & 4 (separate commits per phase)

### Documentation
1. **Implementation notes** documenting any deviations from plan
2. **Test results** showing all tests passing
3. **Metrics validation** confirming new metrics are exposed
4. **Runbook updates** for new operational procedures

### Git Commits
```
Expected commits (chronologically):
1. feat(health): Phase 3.1 - Implement health check endpoints
2. feat(circuit-breaker): Phase 3.2 - Add circuit breaker for federation
3. feat(db-pool): Phase 3.3 - Enhance database connection resilience
4. test(unit): Phase 4.1 - Add bats unit test framework
5. test(e2e): Phase 4.2 - Extend resilience integration tests
```

---

## ✅ FINAL CHECKLIST

Before ending the session, confirm:
- [ ] All Phase 3 tasks complete and tested
- [ ] All Phase 4 tasks complete (or documented as deferred)
- [ ] All changes committed to `main` branch
- [ ] All changes pushed to `origin/main`
- [ ] Integration tests pass: `./tests/integration/test-deployment-resilience.sh --quick`
- [ ] Unit tests pass: `./tests/run-unit-tests.sh` (if implemented)
- [ ] No manual docker commands were used (all via `./dive`)
- [ ] No hardcoded secrets introduced
- [ ] No shortcuts or workarounds applied
- [ ] Handoff document created for Phase 5+ (if not complete)

---

## 🔗 RELATED DOCUMENTS

- **Original Requirements:** `.cursor/NEXT_SESSION_DEPLOYMENT_RESILIENCE.md` (1167 lines)
- **Project Conventions:** `.cursorrules` (coding standards, tech stack)
- **Previous Session Transcript:** `/Users/aubreybeach/.cursor/projects/.../agent-transcripts/c8d028c1-fa30-4dde-a6cc-7bde13b82679.txt`
- **Phase 1 Commit:** `a7ef3636` - feat(resilience): Phase 1 production resilience enhancements
- **Phase 2 Commit:** `ca53e28f` - feat(monitoring): Phase 2 monitoring and observability enhancement

---

**END OF HANDOFF DOCUMENT**

**Next Action:** Read this document carefully, verify Phase 1 & 2 are complete, then begin Phase 3 Task 3.1 (Health Check Endpoints).
