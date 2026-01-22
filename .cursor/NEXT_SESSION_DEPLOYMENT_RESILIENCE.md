# DIVE V3 Production Resilience Enhancement - Next Session Prompt

## Session Context & Background

### What Was Accomplished
In the previous session (2026-01-21), we successfully deployed a complete DIVE V3 federated ICAM system using **ONLY the DIVE CLI** (`@dive`):

**Deployment Results:**
- ✅ **Hub (USA):** 11 containers, 5,000 ZTDF resources, 6 test users
- ✅ **Spoke FRA (France):** 9 containers, 5,000 ZTDF resources, 6 test users
- ✅ **Spoke DEU (Germany):** 9 containers, 9,000 ZTDF resources, 6 test users
- ✅ **Total:** 29/29 containers healthy, bidirectional federation operational
- ⏱️ **Deployment Time:** ~12 minutes (Hub: 3min, FRA: 4.5min, DEU: 4.5min)

**Commands Used (CLI Only):**
```bash
./dive nuke all --confirm         # Clean slate
./dive hub deploy                 # Deploy hub
./dive spoke deploy fra           # Deploy France spoke
./dive spoke deploy deu           # Deploy Germany spoke
```

### Issues Identified (Non-Blocking Warnings)

All services are operational, but we identified **5 areas for production resilience enhancement**:

1. **Environment Variable Verification** (⚠️ Low) - False positives in env checks
2. **Federation Status Timing** (⚠️ Low) - Eventual consistency not handled gracefully
3. **Database Schema Migration** (⚠️ Low) - Idempotency warnings during concurrent operations
4. **MongoDB SSOT Gap** (⚠️ Medium) - Federation registry uses JSON file, not database
5. **Docker Build Cache** (ℹ️ Info) - Cosmetic warnings during image builds

### Artifacts Created

Three comprehensive documents were generated:

1. **`DEPLOYMENT_ISSUES_ANALYSIS.md`** (12,000 words)
   - Deep dive into each issue with root cause analysis
   - Comprehensive resilient solutions with code examples
   - Testing strategy, monitoring recommendations, deployment checklist

2. **`DEPLOYMENT_QUICK_REFERENCE.md`** (Operator's guide)
   - Expected warnings and how to handle them
   - Health check commands and troubleshooting procedures
   - Emergency procedures and functional testing

3. **`DEPLOYMENT_SUMMARY_20260121_165705.md`** (Executive overview)
   - Deployment results, verification, access information
   - Network topology, resource distribution
   - Compliance/security status

---

## Current System State

### Directory Structure
```
DIVE-V3/
├── dive                          # Main CLI entry point
├── scripts/
│   └── dive-modules/             # Modular CLI components
│       ├── common.sh             # Shared utilities
│       ├── core.sh               # up/down/restart/logs/ps/exec
│       ├── status.sh             # status/health/validate/info
│       ├── deploy.sh             # deploy/reset/clean/nuke
│       ├── hub.sh                # Hub deployment/management
│       ├── spoke.sh              # Spoke pipeline orchestration
│       ├── federation.sh         # Federation management
│       ├── secrets.sh            # GCP Secret Manager integration
│       ├── orchestration-state-db.sh  # State database operations
│       └── [40+ other modules]
├── docker/
│   └── instances/
│       └── shared/               # ⚠️ EXISTING: Prometheus, Grafana, AlertManager
│           ├── docker-compose.yml
│           └── config/
│               ├── prometheus.yml
│               ├── grafana/      # Dashboards already configured
│               │   └── provisioning/
│               │       ├── dashboards/
│               │       │   ├── hub-overview.json
│               │       │   ├── federation-metrics.json
│               │       │   ├── kas-dashboard.json
│               │       │   ├── authorization-decisions.json
│               │       │   └── [7+ more dashboards]
│               │       └── datasources/
│               └── alertmanager.yml
├── instances/
│   ├── hub/                      # USA hub instance
│   ├── fra/                      # France spoke
│   ├── deu/                      # Germany spoke
│   └── [27 other NATO instances]
├── backend/                      # Express.js API (PEP)
├── frontend/                     # Next.js UI
├── kas/                          # Key Access Service
├── keycloak/                     # IdP broker
├── policies/                     # OPA Rego policies
└── terraform/                    # Infrastructure as Code
```

### Existing Monitoring Infrastructure

**CRITICAL DISCOVERY:** Prometheus, Grafana, and AlertManager **already exist** at `docker/instances/shared/`:

```yaml
# docker/instances/shared/docker-compose.yml
services:
  prometheus:           # Port 9090 - Metrics collection
  grafana:              # Port 3333 - Visualization
  alertmanager:         # Port 9093 - Alert routing
  hub-redis-exporter:   # Port 9121 - Hub Redis metrics
  blacklist-redis-exporter: # Port 9122 - Blacklist Redis metrics
```

**Pre-configured Grafana Dashboards:**
- `hub-overview.json` - Hub system overview
- `federation-metrics.json` - Federation health
- `kas-dashboard.json` - KAS operations
- `authorization-decisions.json` - OPA policy decisions
- `cache-performance.json` - Redis performance
- `compliance-overview.json` - Security compliance
- `opal-policy-distribution.json` - Policy sync status

**Prometheus Alerting Rules:**
- `rules/kas.yml` - KAS service alerts
- `rules/redis.yml` - Redis health alerts

### Database State (SSOT)

**PostgreSQL (Hub):**
- `orchestration` database with state tracking tables:
  - `deployment_states` - Deployment lifecycle tracking
  - `state_transitions` - State change history
  - `deployment_locks` - Concurrent deployment prevention

**MongoDB (Hub):**
- `dive_v3` database:
  - `resources` collection (15,000 ZTDF-encrypted documents)
  - `federation_spokes` collection ⚠️ **EMPTY** (gap identified)
  - `kas_registry` collection (KAS instances registered)

**JSON Files (Legacy SSOT):**
- `config/federation-registry.json` ✅ Contains FRA, DEU
- `config/kas-registry.json` ✅ Contains all KAS endpoints

---

## Deferred Actions & Next Steps

### CRITICAL: Use Database as SSOT (NOT Dual-Write)

**Previous analysis incorrectly suggested dual-write.** The correct approach:

1. **MongoDB is SSOT** for federation registry
2. **PostgreSQL is SSOT** for orchestration state
3. **Migrate from JSON files to database** (one-way migration)
4. **Read-through cache pattern:** If DB empty, populate from JSON, then delete JSON
5. **NO dual-write** - introduces consistency issues

### Implementation Priorities

#### **Phase 1: Production Resilience Foundations** (Week 1)
**SMART Goal:** Eliminate all false-positive warnings and implement database SSOT migration with 100% test coverage by Week 1 end.

**Success Criteria:**
- [ ] Zero false-positive warnings during deployment
- [ ] Federation registry fully migrated to MongoDB
- [ ] Orchestration state 100% in PostgreSQL
- [ ] All verification checks use functional testing
- [ ] 100% passing integration test suite

**Tasks:**
1. **MongoDB Federation Registry Migration**
   - Audit current `scripts/spoke-init/register-spoke-federation.sh`
   - Implement `migrate_federation_to_mongodb()` function
   - Add read-through cache: if MongoDB empty, populate from JSON
   - Delete JSON files after successful migration
   - Verify federated search reads from MongoDB
   - Priority: 🟠 **HIGH**

2. **Environment Verification Overhaul**
   - Replace env var inspection with functional tests in `scripts/dive-modules/spoke/pipeline/spoke-verify-env.sh`
   - Test PostgreSQL connectivity: `pg_isready`
   - Test MongoDB connectivity: `mongosh --eval "db.adminCommand('ping')"`
   - Test API health: `curl /health` endpoints
   - Test Keycloak: Verify realm exists via API
   - Priority: 🟡 **MEDIUM**

3. **Schema Migration Resilience**
   - Add PostgreSQL advisory locks in `scripts/dive-modules/orchestration-state-db.sh`
   - Use `CREATE TABLE IF NOT EXISTS` consistently
   - Add pre-flight health check before schema operations
   - Verify table count before declaring success/failure
   - Priority: 🟡 **MEDIUM**

#### **Phase 2: Monitoring & Observability Integration** (Week 2)
**SMART Goal:** Integrate all DIVE instances with existing Prometheus/Grafana stack and achieve 100% service visibility by Week 2 end.

**Success Criteria:**
- [ ] All 29 containers expose Prometheus metrics
- [ ] Grafana dashboards show real-time data for all instances
- [ ] AlertManager triggers on critical failures
- [ ] Deployment metrics captured (duration, success rate)
- [ ] Federation health continuously monitored

**Tasks:**
1. **Enable Prometheus Metrics Exporters**
   - **Backend API** (Express.js): Add `prom-client` library
     ```typescript
     import promClient from 'prom-client';
     const register = new promClient.Registry();
     promClient.collectDefaultMetrics({ register });
     // Custom metrics
     const deploymentDuration = new promClient.Histogram({
       name: 'dive_spoke_deployment_duration_seconds',
       help: 'Time taken to deploy a spoke',
       labelNames: ['instance_code', 'phase']
     });
     ```
   - **Keycloak**: Enable built-in metrics endpoint (JBoss metrics)
   - **OPA**: Already exposes metrics at `:8181/metrics`
   - **MongoDB**: Add `mongodb_exporter` sidecar
   - **PostgreSQL**: Add `postgres_exporter` sidecar

2. **Integrate Shared Monitoring Stack**
   - Audit `docker/instances/shared/docker-compose.yml`
   - Verify network connectivity: shared services need access to `dive-shared` network
   - Update `prometheus.yml` scrape configs to include:
     - Hub backend: `http://dive-hub-backend:4000/metrics`
     - FRA backend: `http://dive-spoke-fra-backend:4000/metrics`
     - DEU backend: `http://dive-spoke-deu-backend:4000/metrics`
     - All OPA instances: `:8181/metrics`
     - All Keycloak instances (if enabled)
   - Test Grafana dashboards load real data
   - Priority: 🟡 **MEDIUM**

3. **AlertManager Configuration**
   - Define critical alerts in `config/alertmanager.yml`:
     ```yaml
     - alert: SpokeDeploymentFailed
       expr: dive_spoke_deployment_success == 0
       for: 1m
       annotations:
         summary: "Spoke {{ $labels.instance_code }} deployment failed"

     - alert: FederationDown
       expr: dive_federation_verification_status{direction="bidirectional"} == 0
       for: 5m
       annotations:
         summary: "Federation {{ $labels.source }} → {{ $labels.target }} is down"
     ```
   - Configure notification channels (Slack, PagerDuty, email)
   - Test alert firing and routing
   - Priority: 🟢 **LOW**

#### **Phase 3: Federation Verification Resilience** (Week 2-3)
**SMART Goal:** Achieve 100% reliable federation verification with zero false negatives and graceful eventual consistency handling.

**Success Criteria:**
- [ ] Federation verification retries with exponential backoff
- [ ] OIDC discovery endpoints tested before declaring success
- [ ] SSO flow initiation simulated (pre-flight check)
- [ ] Clear messaging about eventual consistency
- [ ] 100% success rate on fresh deployments (tested 10x)

**Tasks:**
1. **Implement Retry Logic with Backoff**
   - Modify `scripts/dive-modules/federation/verify-federation.sh`
   - Add exponential backoff: 5s, 10s, 20s, 40s, 60s (5 attempts)
   - Test OIDC discovery endpoint before declaring success:
     ```bash
     curl -sk "https://localhost:8443/realms/dive-v3-broker-usa/broker/fra-idp/endpoint"
     ```
   - Simulate SSO initiation (expect 302 redirect):
     ```bash
     curl -I -sk "https://localhost:8443/realms/dive-v3-broker-usa/broker/fra-idp/login"
     ```
   - Priority: 🟢 **LOW** (functional, just improve UX)

2. **Keycloak Cache Refresh Trigger**
   - After IdP creation, trigger cache refresh via Admin API:
     ```bash
     # Clear Keycloak realm cache
     curl -X POST "https://localhost:8443/admin/realms/dive-v3-broker-usa/clear-realm-cache" \
       -H "Authorization: Bearer $ADMIN_TOKEN"
     ```
   - Wait for cache refresh confirmation
   - Re-verify federation immediately after

#### **Phase 4: Comprehensive Testing Suite** (Week 3)
**SMART Goal:** Achieve 80% code coverage and 100% critical path coverage with automated CI/CD integration.

**Success Criteria:**
- [ ] Unit tests: 80%+ coverage for CLI modules
- [ ] Integration tests: All deployment scenarios (hub, spoke, concurrent)
- [ ] E2E tests: Complete user journeys (SSO, resource access, KAS decryption)
- [ ] Resilience tests: Container failures, network partitions, concurrent deployments
- [ ] Performance tests: 100 req/s sustained, p95 latency < 200ms

**Tasks:**
1. **Unit Testing Framework**
   - Create `tests/unit/` directory structure
   - Test each CLI module in isolation:
     ```bash
     # tests/unit/test-environment-verification.sh
     test_backend_env_functional() {
       # Mock container
       docker run -d --name test-backend postgres:15-alpine
       # Test connectivity
       result=$(verify_backend_env_functional "TEST")
       assert_success "$result"
       # Cleanup
       docker rm -f test-backend
     }
     ```
   - Use `bats` (Bash Automated Testing System) framework
   - Priority: 🟡 **MEDIUM**

2. **Integration Testing Suite**
   - Test complete deployment scenarios:
     ```bash
     # tests/integration/test-full-deployment.sh
     test_clean_deployment() {
       ./dive nuke all --confirm
       ./dive hub deploy
       assert_all_containers_healthy "HUB"
       ./dive spoke deploy tst
       assert_all_containers_healthy "TST"
       assert_federation_bidirectional "USA" "TST"
     }

     test_idempotent_deployment() {
       ./dive spoke deploy tst  # First deploy
       ./dive spoke deploy tst  # Re-deploy (should succeed)
       assert_no_errors
     }

     test_concurrent_deployment() {
       ./dive spoke deploy abc &
       ./dive spoke deploy xyz &
       wait
       assert_all_containers_healthy "ABC"
       assert_all_containers_healthy "XYZ"
     }
     ```
   - Priority: 🟠 **HIGH**

3. **E2E Testing with Playwright**
   - User journey tests:
     - Login via Hub → Redirect to FRA Keycloak → Authenticate → Return to Hub
     - Search resources across spokes (federated search)
     - View ZTDF resource → Request key from KAS → Decrypt → Display
   - Already exists at `frontend/src/__tests__/e2e/`
   - Enhance with multi-spoke scenarios
   - Priority: 🟢 **LOW**

4. **Resilience Testing**
   - Container failure simulation:
     ```bash
     # Kill Keycloak mid-deployment
     docker kill dive-hub-keycloak
     # Verify deployment continues/fails gracefully
     ```
   - Network partition simulation (disconnect spoke from hub)
   - Concurrent deployment stress test (10 spokes simultaneously)
   - Priority: 🟡 **MEDIUM**

---

## Scope Gap Analysis

### Gap 1: Federation Registry SSOT Migration ⚠️ **HIGH**

**Current State:**
- JSON file: `config/federation-registry.json` (populated)
- MongoDB: `federation_spokes` collection (empty)
- Backend reads from JSON file

**Gap:**
- Spokes register in JSON but not MongoDB
- Future services expecting MongoDB will fail
- Inconsistent SSOT (file vs database)

**Solution:**
1. Audit `scripts/spoke-init/register-spoke-federation.sh`
2. Implement MongoDB-first registration
3. Add migration script: `./dive federation migrate-to-mongodb`
4. Delete JSON file after successful migration
5. Update backend to read from MongoDB with JSON fallback (transition period)

**Test:**
```bash
# Verify MongoDB contains all spokes
docker exec dive-hub-mongodb mongosh --quiet --eval "
  db.getSiblingDB('dive_v3').federation_spokes.find().pretty()
"
# Should show FRA, DEU with all metadata

# Verify federated search works
curl -sk "https://localhost:4000/api/resources/federated-search?instance=FRA" \
  -H "Authorization: Bearer $TOKEN" | jq '.spokes[]'
# Should include FRA results
```

---

### Gap 2: Monitoring Integration ⚠️ **MEDIUM**

**Current State:**
- Shared monitoring stack exists but not integrated
- Prometheus running but no scrape targets configured for DIVE instances
- Grafana dashboards exist but show no data

**Gap:**
- No metrics being collected from DIVE services
- Alerts not configured for deployment failures
- No visibility into system health

**Solution:**
1. Add Prometheus exporters to all services
2. Update `docker/instances/shared/config/prometheus.yml`:
   ```yaml
   scrape_configs:
     - job_name: 'hub-backend'
       static_configs:
         - targets: ['dive-hub-backend:4000']

     - job_name: 'fra-backend'
       static_configs:
         - targets: ['dive-spoke-fra-backend:4000']

     - job_name: 'deu-backend'
       static_configs:
         - targets: ['dive-spoke-deu-backend:4000']

     - job_name: 'opa-hub'
       static_configs:
         - targets: ['dive-hub-opa:8181']
   ```
3. Verify dashboards populate with real data
4. Configure AlertManager for critical alerts

**Test:**
```bash
# Verify Prometheus targets are UP
curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | {job, health}'

# Verify Grafana shows data
open http://localhost:3333/d/hub-overview
# Should show metrics for all containers
```

---

### Gap 3: Environment Verification Accuracy ⚠️ **LOW**

**Current State:**
- Verification checks for suffixed env vars (e.g., `POSTGRES_PASSWORD_FRA`)
- Docker Compose uses non-suffixed vars (e.g., `POSTGRES_PASSWORD`)
- Results in false-positive warnings

**Gap:**
- Operators see alarming warnings despite services being healthy
- Confusion about whether deployment succeeded
- No functional testing to confirm actual connectivity

**Solution:**
1. Replace env var inspection with functional tests
2. Test actual service connectivity instead of checking environment
3. Clear pass/fail criteria based on functionality

**Test:**
```bash
# Functional test: Can backend connect to PostgreSQL?
docker exec dive-spoke-fra-backend pg_isready -h postgres-fra -U postgres
# Exit code 0 = success

# Functional test: Can backend reach MongoDB?
docker exec dive-spoke-fra-backend mongosh --host mongodb-fra --eval "db.adminCommand('ping')"
# Returns: { ok: 1 }

# Functional test: Is backend API responding?
curl -sk https://localhost:4010/health | jq '.status'
# Returns: "healthy"
```

---

### Gap 4: Schema Migration Idempotency ⚠️ **LOW**

**Current State:**
- Orchestration DB schema created during hub deployment
- Spokes attempt to recreate schema (fails silently)
- Warning messages confuse operators

**Gap:**
- No advisory locks prevent concurrent schema modification
- `CREATE TABLE` fails if table exists (not using `IF NOT EXISTS`)
- No verification that tables actually exist before declaring failure

**Solution:**
1. Add PostgreSQL advisory locks during schema operations
2. Use `CREATE TABLE IF NOT EXISTS` consistently
3. Add health check before attempting schema modification
4. Verify table count after operation

**Test:**
```bash
# Test concurrent schema initialization
./dive hub deploy &
./dive spoke deploy fra &
wait
# Both should succeed without errors

# Verify tables exist
docker exec dive-hub-postgres psql -U postgres -d orchestration -c \
  "SELECT tablename FROM pg_tables WHERE tablename IN ('deployment_states', 'state_transitions', 'deployment_locks');"
# Should return 3 rows
```

---

### Gap 5: Federation Verification Timing ⚠️ **LOW**

**Current State:**
- Verification runs immediately after IdP creation
- Keycloak realm cache has 60-second TTL
- False "incomplete" status during rapid deployment

**Gap:**
- No retry logic with appropriate wait times
- No testing of OIDC discovery endpoints
- No simulation of SSO flow initialization

**Solution:**
1. Add exponential backoff retry (5 attempts, 10s delays)
2. Test OIDC discovery endpoint before declaring success
3. Simulate SSO initiation (expect 302 redirect)
4. Clear messaging about eventual consistency

**Test:**
```bash
# Verify retry logic works
./dive spoke deploy tst
# Should show: "Verification attempt 1/5..." then "✅ Federation verified"

# Verify OIDC endpoint is reachable
curl -sk "https://localhost:8443/realms/dive-v3-broker-usa/broker/tst-idp/endpoint"
# Should return IdP metadata JSON

# Verify SSO initiation returns redirect
curl -I -sk "https://localhost:8443/realms/dive-v3-broker-usa/broker/tst-idp/login"
# Should return: HTTP/1.1 302 Found
```

---

## Phased Implementation Plan

### Phase 1: Production Resilience Foundations (Days 1-5)

**Day 1: MongoDB SSOT Migration**
- [ ] Audit `scripts/spoke-init/register-spoke-federation.sh`
- [ ] Implement `migrate_federation_to_mongodb()` function
- [ ] Create CLI command: `./dive federation migrate-to-mongodb`
- [ ] Test migration: `./dive nuke all --confirm && ./dive hub deploy && ./dive spoke deploy tst`
- [ ] Verify MongoDB contains TST spoke
- [ ] Delete JSON files after successful migration

**Day 2: Environment Verification Overhaul**
- [ ] Modify `scripts/dive-modules/spoke/pipeline/spoke-verify-env.sh`
- [ ] Replace env inspection with functional tests:
  - PostgreSQL: `pg_isready`
  - MongoDB: `mongosh --eval "db.adminCommand('ping')"`
  - Backend API: `curl /health`
  - Keycloak: `curl /health/ready`
- [ ] Test fresh deployment: `./dive spoke deploy abc`
- [ ] Verify zero false-positive warnings

**Day 3: Schema Migration Resilience**
- [ ] Modify `scripts/dive-modules/orchestration-state-db.sh`
- [ ] Add PostgreSQL advisory locks:
  ```sql
  SELECT pg_advisory_lock(1234567890);
  CREATE TABLE IF NOT EXISTS deployment_states (...);
  SELECT pg_advisory_unlock(1234567890);
  ```
- [ ] Add pre-flight health check
- [ ] Test concurrent deployments:
  ```bash
  ./dive hub deploy &
  ./dive spoke deploy fra &
  ./dive spoke deploy deu &
  wait
  ```
- [ ] Verify no schema errors

**Day 4-5: Integration Testing Suite**
- [ ] Create `tests/integration/` directory
- [ ] Write deployment scenario tests:
  - Clean deployment (nuke → hub → spoke)
  - Idempotent deployment (deploy twice)
  - Concurrent deployment (2+ spokes simultaneously)
  - Federation verification (bidirectional SSO)
- [ ] Run full test suite: `./tests/integration/run-all.sh`
- [ ] Achieve 100% passing tests

**Success Metrics:**
- ✅ Zero false-positive warnings during deployment
- ✅ Federation registry 100% in MongoDB
- ✅ Schema operations fully idempotent
- ✅ 100% passing integration tests

---

### Phase 2: Monitoring & Observability (Days 6-10)

**Day 6: Prometheus Exporter Integration**
- [ ] Add `prom-client` to backend:
  ```bash
  cd backend && npm install prom-client
  ```
- [ ] Implement metrics in `backend/src/index.ts`:
  ```typescript
  import promClient from 'prom-client';
  const register = new promClient.Registry();
  promClient.collectDefaultMetrics({ register });

  app.get('/metrics', (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(register.metrics());
  });
  ```
- [ ] Deploy changes: `./dive hub restart`
- [ ] Verify metrics endpoint: `curl http://localhost:4000/metrics`

**Day 7: Prometheus Configuration**
- [ ] Update `docker/instances/shared/config/prometheus.yml`
- [ ] Add scrape configs for all DIVE instances
- [ ] Restart Prometheus: `cd docker/instances/shared && docker compose restart prometheus`
- [ ] Verify targets UP: `curl http://localhost:9090/api/v1/targets`

**Day 8: Grafana Dashboard Verification**
- [ ] Access Grafana: `open http://localhost:3333`
- [ ] Login: `admin / <GRAFANA_PASSWORD from GCP>`
- [ ] Verify dashboards populate with real data:
  - Hub Overview: Should show CPU, memory, request rates
  - Federation Metrics: Should show spoke health
  - KAS Dashboard: Should show key requests
- [ ] Create custom dashboard for deployment metrics

**Day 9: AlertManager Configuration**
- [ ] Update `docker/instances/shared/config/alertmanager.yml`
- [ ] Configure notification channels (Slack webhook)
- [ ] Create alert rules in `config/prometheus/rules/dive.yml`:
  ```yaml
  groups:
    - name: dive_alerts
      rules:
        - alert: SpokeDeploymentFailed
          expr: dive_spoke_deployment_success == 0
          for: 1m
        - alert: FederationDown
          expr: dive_federation_status == 0
          for: 5m
  ```
- [ ] Test alert firing: Manually set metric to 0

**Day 10: Monitoring Validation**
- [ ] Deploy fresh spoke: `./dive spoke deploy xyz`
- [ ] Verify Prometheus captures deployment metrics
- [ ] Verify Grafana dashboard updates
- [ ] Simulate failure and confirm alert fires
- [ ] Document monitoring access in README

**Success Metrics:**
- ✅ All 29 containers expose Prometheus metrics
- ✅ Grafana shows real-time data for all instances
- ✅ Alerts fire on simulated failures
- ✅ Deployment duration tracked in Prometheus

---

### Phase 3: Federation Resilience (Days 11-13)

**Day 11: Retry Logic Implementation**
- [ ] Modify `scripts/dive-modules/federation/verify-federation.sh`
- [ ] Add exponential backoff:
  ```bash
  for attempt in 1 2 3 4 5; do
    delay=$((5 * 2**(attempt-1)))  # 5s, 10s, 20s, 40s, 80s
    verify_federation "$INSTANCE"
    [ $? -eq 0 ] && break
    sleep $delay
  done
  ```
- [ ] Test with fresh deployment

**Day 12: OIDC Discovery Testing**
- [ ] Add `test_oidc_discovery()` function:
  ```bash
  curl -sk "https://localhost:8443/realms/dive-v3-broker-usa/broker/${idp_alias}/endpoint"
  ```
- [ ] Add `test_sso_initiation()` function:
  ```bash
  curl -I -sk "https://localhost:8443/realms/dive-v3-broker-usa/broker/${idp_alias}/login" | grep "302"
  ```
- [ ] Integrate into verification pipeline

**Day 13: Keycloak Cache Management**
- [ ] Research Keycloak cache clear API
- [ ] Implement post-IdP-creation cache clear
- [ ] Test immediate verification after cache clear
- [ ] Measure verification success rate (target: 100%)

**Success Metrics:**
- ✅ 100% federation verification success on fresh deployments
- ✅ Clear operator messaging about eventual consistency
- ✅ OIDC endpoints tested before declaring success

---

### Phase 4: Testing & Validation (Days 14-21)

**Day 14-16: Unit Testing**
- [ ] Install `bats` framework: `brew install bats-core`
- [ ] Create `tests/unit/` directory structure
- [ ] Write tests for each CLI module:
  - `test-environment-verification.bats`
  - `test-federation-registration.bats`
  - `test-schema-migration.bats`
  - `test-secrets-loading.bats`
- [ ] Run tests: `bats tests/unit/*.bats`
- [ ] Target: 80% code coverage

**Day 17-18: Integration Testing**
- [ ] Create `tests/integration/` directory
- [ ] Write scenario tests:
  - `test-clean-deployment.sh`
  - `test-idempotent-deployment.sh`
  - `test-concurrent-deployment.sh`
  - `test-federation-bidirectional.sh`
- [ ] Implement test harness with assertions
- [ ] Run full suite: `./tests/integration/run-all.sh`

**Day 19: E2E Testing Enhancement**
- [ ] Enhance existing Playwright tests at `frontend/src/__tests__/e2e/`
- [ ] Add multi-spoke scenarios:
  - User logs in via FRA → Searches DEU resources
  - User requests KAS key → Decrypts ZTDF document
- [ ] Run E2E suite: `cd frontend && npm run test:e2e`

**Day 20: Resilience Testing**
- [ ] Container failure simulation:
  ```bash
  docker kill dive-hub-keycloak  # Kill mid-deployment
  # Verify graceful failure/recovery
  ```
- [ ] Network partition simulation:
  ```bash
  docker network disconnect dive-shared dive-spoke-fra-backend
  # Verify federation degrades gracefully
  ```
- [ ] Concurrent deployment stress test:
  ```bash
  for i in {1..10}; do
    ./dive spoke deploy "tst$i" &
  done
  wait
  # Verify all succeed or fail gracefully
  ```

**Day 21: CI/CD Integration**
- [ ] Create `.github/workflows/test.yml`:
  ```yaml
  name: DIVE V3 Tests
  on: [push, pull_request]
  jobs:
    unit:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v3
        - run: bats tests/unit/*.bats
    integration:
      runs-on: ubuntu-latest
      steps:
        - run: ./tests/integration/run-all.sh
  ```
- [ ] Test CI pipeline runs successfully

**Success Metrics:**
- ✅ 80%+ unit test coverage
- ✅ 100% integration test scenarios passing
- ✅ E2E tests cover critical user journeys
- ✅ Resilience tests validate failure handling
- ✅ CI/CD pipeline integrated

---

## Lessons Learned

### ✅ What Went Well

1. **DIVE CLI Abstraction**
   - Clean separation between user commands and implementation
   - Modular design enables rapid enhancement
   - Consistent logging and error handling

2. **Database SSOT Pattern**
   - PostgreSQL for orchestration state (deployment lifecycle)
   - MongoDB for application data (resources, federation)
   - GCP Secret Manager for credentials (no secrets in code)

3. **Deployment Pipeline Architecture**
   - Phased approach: PREFLIGHT → INIT → DEPLOY → CONFIG → SEED → VERIFY
   - Checkpoint system enables resume on failure
   - Advisory locks prevent concurrent deployments

4. **Federation Design**
   - Hub-spoke model scales well (tested with 2 spokes)
   - Bidirectional SSO works correctly (8/8 checks passed)
   - ZTDF encryption integrates seamlessly with federation

### ⚠️ Areas for Improvement

1. **Verification Logic Needs Functional Testing**
   - Current: Checks environment variables exist
   - Better: Tests actual service connectivity
   - Impact: Eliminates false-positive warnings

2. **Eventual Consistency Not Handled Gracefully**
   - Current: Immediate verification after IdP creation
   - Better: Retry with exponential backoff + cache clearing
   - Impact: 100% verification success rate

3. **MongoDB SSOT Migration Incomplete**
   - Current: Dual-tracking (JSON file + MongoDB)
   - Better: Single source of truth (MongoDB only)
   - Impact: Eliminates consistency issues

4. **Monitoring Not Integrated**
   - Current: Shared stack exists but not connected
   - Better: All services expose metrics to Prometheus
   - Impact: Real-time visibility into system health

5. **Testing Coverage Gaps**
   - Current: Manual testing only
   - Better: Automated unit/integration/E2E test suite
   - Impact: Catch regressions before production

---

## Critical Rules & Constraints

### ⚠️ MUST Use DIVE CLI Only

**FORBIDDEN:**
```bash
# ❌ DO NOT use direct Docker commands
docker compose up -d
docker exec dive-hub-backend sh
docker network create dive-shared

# ❌ DO NOT use Terraform directly
cd terraform && terraform apply

# ❌ DO NOT modify .env files directly
echo "NEW_VAR=value" >> instances/fra/.env
```

**REQUIRED:**
```bash
# ✅ ONLY use DIVE CLI commands
./dive hub deploy
./dive spoke deploy fra
./dive --instance fra spoke restart
./dive federation verify FRA
./dive secrets load --instance fra
./dive orch-db status
```

**Rationale:**
- DIVE CLI provides orchestration, state management, logging
- Direct Docker commands bypass state tracking
- Terraform managed through CLI ensures consistency
- Secrets always loaded from GCP Secret Manager

### ⚠️ Database is Single Source of Truth

**NO Dual-Write Pattern:**
```bash
# ❌ DO NOT update both JSON and MongoDB
update_federation_json "FRA"
update_federation_mongodb "FRA"  # Dual-write = consistency issues
```

**Correct Approach:**
```bash
# ✅ Migrate JSON → MongoDB (one-time)
migrate_federation_to_mongodb()  # Read JSON, populate MongoDB, delete JSON

# ✅ Always read from MongoDB (with fallback)
get_federation_spokes() {
  # Try MongoDB first
  spokes=$(mongo_query "federation_spokes")
  if [ -z "$spokes" ]; then
    # Fallback: read JSON and migrate
    spokes=$(jq '.spokes' federation-registry.json)
    migrate_federation_to_mongodb
  fi
  echo "$spokes"
}
```

### ⚠️ All Data is DUMMY/FAKE

**You are AUTHORIZED to:**
- Nuke all containers: `./dive nuke all --confirm`
- Delete all volumes: `docker volume prune -af`
- Reset databases: Drop collections, truncate tables
- Regenerate test users: Delete and recreate
- Clean slate testing: Full deploy/nuke/deploy cycles

**Test data only:**
- Users: `testuser-usa-1` through `testuser-deu-5` (FAKE)
- Resources: 15,000 generated ZTDF documents (DUMMY)
- Passwords: All use `DivePilot2025!` (TEST ONLY)

### ⚠️ No Simplification or Workarounds

**Principles:**
1. **Best Practice Architecture** - Use industry-standard patterns
2. **Production-Ready Code** - No TODO comments, no placeholders
3. **Full Error Handling** - Graceful degradation, clear error messages
4. **Comprehensive Testing** - Unit, integration, E2E, resilience
5. **Monitoring & Observability** - Metrics, logs, traces, alerts
6. **Security by Design** - Secrets in GCP, TLS everywhere, least privilege
7. **Idempotency** - Safe to run operations multiple times
8. **Resilience** - Handle failures gracefully, retry with backoff

**Examples:**
```bash
# ❌ Quick fix / workaround
if [ "$error" ]; then
  echo "Ignoring error, continuing..."  # BAD
fi

# ✅ Proper error handling
if ! verify_federation "$INSTANCE"; then
  log_error "Federation verification failed for $INSTANCE"
  log_info "Attempting recovery..."

  # Clear Keycloak cache
  clear_keycloak_cache "dive-v3-broker-usa"

  # Retry with backoff
  for attempt in {1..5}; do
    log_debug "Retry attempt $attempt/5..."
    if verify_federation "$INSTANCE"; then
      log_success "Federation verified after $attempt attempts"
      return 0
    fi
    sleep $((10 * attempt))
  done

  log_error "Federation verification failed after 5 attempts"
  log_info "Manual verification required: ./dive federation verify $INSTANCE"
  return 1
fi
```

---

## Success Criteria (Overall)

### Phase 1 Success (Week 1)
- [ ] Zero false-positive warnings during any deployment
- [ ] Federation registry 100% in MongoDB (JSON files deleted)
- [ ] Orchestration state 100% in PostgreSQL
- [ ] Environment verification uses functional tests only
- [ ] Schema migration fully idempotent (tested with concurrent deploys)
- [ ] 100% passing integration test suite (10+ scenarios)

### Phase 2 Success (Week 2)
- [ ] All 29 containers expose Prometheus metrics
- [ ] Prometheus scraping all targets successfully
- [ ] Grafana dashboards show real-time data
- [ ] AlertManager configured with critical alerts
- [ ] Alerts fire correctly on simulated failures
- [ ] Monitoring documented in operator guide

### Phase 3 Success (Week 2-3)
- [ ] Federation verification retry logic implemented
- [ ] OIDC discovery endpoint tested before success
- [ ] SSO flow initiation simulated in verification
- [ ] 100% verification success rate on fresh deployments (tested 10x)
- [ ] Clear operator messaging about eventual consistency

### Phase 4 Success (Week 3)
- [ ] Unit tests: 80%+ coverage for CLI modules
- [ ] Integration tests: 100% passing (clean, idempotent, concurrent)
- [ ] E2E tests: Critical user journeys covered
- [ ] Resilience tests: Container failures handled gracefully
- [ ] Performance tests: 100 req/s sustained, p95 < 200ms
- [ ] CI/CD pipeline integrated and passing

---

## Next Session Action Items

### Immediate (Start Here)
1. **Audit Federation Registration Logic**
   ```bash
   # Review current implementation
   cat scripts/spoke-init/register-spoke-federation.sh

   # Check MongoDB collection
   docker exec dive-hub-mongodb mongosh --quiet --eval "
     db.getSiblingDB('dive_v3').federation_spokes.find().pretty()
   "

   # Check JSON file
   cat config/federation-registry.json | jq .
   ```

2. **Design MongoDB Migration Strategy**
   - Create `scripts/dive-modules/federation/migrate-to-mongodb.sh`
   - Implement read-through cache pattern
   - Add CLI command: `./dive federation migrate-to-mongodb`

3. **Test Clean Slate Deployment**
   ```bash
   # Verify current deployment works
   ./dive nuke all --confirm
   ./dive hub deploy
   ./dive spoke deploy fra
   ./dive spoke deploy deu
   ./dive status
   ```

### Week 1 Deliverables
- [ ] MongoDB migration script completed and tested
- [ ] Environment verification using functional tests
- [ ] Schema migration with advisory locks
- [ ] Integration test suite (10+ scenarios)
- [ ] Documentation: Updated `DEPLOYMENT_ISSUES_ANALYSIS.md` with solutions

### Week 2 Deliverables
- [ ] Prometheus exporters in all services
- [ ] Grafana dashboards populated with real data
- [ ] AlertManager configured and tested
- [ ] Federation retry logic implemented
- [ ] Documentation: Monitoring runbook created

### Week 3 Deliverables
- [ ] Unit test suite (80% coverage)
- [ ] E2E test enhancements (multi-spoke)
- [ ] Resilience test suite
- [ ] CI/CD pipeline integrated
- [ ] Documentation: Testing guide created

---

## Reference Materials

### Key Files to Review
```bash
# CLI entry point
dive

# CLI modules (review these for enhancement)
scripts/dive-modules/
├── spoke.sh                    # Spoke deployment pipeline
├── federation.sh               # Federation management
├── orchestration-state-db.sh   # Database state tracking
└── hub.sh                      # Hub deployment

# Monitoring configuration
docker/instances/shared/
├── docker-compose.yml          # Prometheus, Grafana, AlertManager
└── config/
    ├── prometheus.yml          # Scrape configs
    ├── grafana/                # Dashboards
    └── alertmanager.yml        # Alert routing

# Backend API (add metrics here)
backend/src/
├── index.ts                    # Express server
├── services/                   # Business logic
└── middleware/                 # PEP authorization

# Testing (create/enhance)
tests/
├── unit/                       # CLI module tests
├── integration/                # Deployment scenarios
└── frontend/src/__tests__/e2e/ # User journey tests

# Documentation
DEPLOYMENT_ISSUES_ANALYSIS.md    # Comprehensive issue analysis
DEPLOYMENT_QUICK_REFERENCE.md    # Operator guide
DEPLOYMENT_SUMMARY_20260121_*.md # Deployment results
```

### Useful Commands
```bash
# Check current state
./dive status
./dive federation status
./dive orch-db status

# Monitoring
open http://localhost:9090          # Prometheus
open http://localhost:3333          # Grafana (admin/admin)
open http://localhost:9093          # AlertManager

# Database inspection
docker exec dive-hub-postgres psql -U postgres -d orchestration -c "SELECT * FROM deployment_states LIMIT 10;"
docker exec dive-hub-mongodb mongosh --quiet --eval "db.getSiblingDB('dive_v3').federation_spokes.find().pretty()"

# Logs
docker logs dive-hub-backend --tail=100
docker logs dive-spoke-fra-keycloak --tail=100

# Clean slate testing
./dive nuke all --confirm
./dive hub deploy
./dive spoke deploy tst
```

---

## Final Notes

**This session successfully deployed:**
- ✅ 1 Hub + 2 Spokes (29 containers)
- ✅ 15,000 ZTDF-encrypted resources
- ✅ Bidirectional federation (USA ↔ FRA, USA ↔ DEU)
- ✅ All services healthy and operational

**Identified 5 enhancement areas:**
1. MongoDB SSOT migration (HIGH priority)
2. Monitoring integration (MEDIUM priority)
3. Environment verification (MEDIUM priority)
4. Schema idempotency (MEDIUM priority)
5. Federation retry logic (LOW priority)

**All solutions must be:**
- Production-ready (no workarounds)
- Resilient (handle failures gracefully)
- Persistent (survive restarts)
- Tested (unit + integration + E2E)
- Monitored (Prometheus metrics)
- Documented (operator guides)

**Remember:**
- ONLY use `./dive` CLI commands
- Database is SSOT (no dual-write)
- Prometheus/Grafana already exist
- All data is DUMMY/FAKE (safe to nuke)
- No simplification or workarounds

---

**Generated:** 2026-01-21
**Session:** Deployment Resilience Enhancement
**Status:** Ready for Implementation
