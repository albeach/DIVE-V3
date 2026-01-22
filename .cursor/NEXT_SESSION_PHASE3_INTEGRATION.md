# DIVE V3 Production Resilience - Phase 3.2+ Session Handoff

**Session Date:** 2026-01-21
**Previous Session Commits:** `8c650c31`, `ab4a113b`, `01eabc8e`, `a58e4557`, `b81b2885`
**Status:** Phase 3.1 COMPLETE ✅ | Phase 3.2+ READY

---

## 🎯 SESSION OBJECTIVE

Continue production resilience enhancement for DIVE V3 federated ICAM system, focusing on **integration enhancement** of existing components rather than creating new modules. All infrastructure already exists - this session focuses on proper integration, testing, and validation.

### CRITICAL CONSTRAINTS

```
✅ DIVE CLI ONLY     - Use ./dive commands exclusively (NO manual docker/docker-compose)
✅ AUDIT FIRST       - Existing logic is robust - enhance, don't duplicate
✅ DATABASE = SSOT   - MongoDB for federation registry, PostgreSQL for orchestration state
✅ EXISTING INFRA    - Prometheus/Grafana/AlertManager already in docker/instances/shared
✅ NO STATIC JSON    - No dual-write needed - database is authoritative
✅ CLEAN SLATE OK    - All data is DUMMY/FAKE - ./dive nuke authorized for testing
✅ BEST PRACTICE     - No shortcuts, workarounds, or "quick fixes"
```

---

## 📋 COMPLETED WORK (This Session)

### ✅ Phase 3.1: Health Check Endpoints & SSL/TLS Fixes

| Commit | Description |
|--------|-------------|
| `8c650c31` | feat(blacklist): Add shared blacklist Redis for cross-instance token revocation |
| `ab4a113b` | fix(ssl): Complete SSL/TLS and mkcert CA management fixes |
| `01eabc8e` | fix(health): Phase 3.1 SSL and port calculation fixes |
| `a58e4557` | fix(health): Phase 3.1 port discovery using Docker as SSOT |
| `b81b2885` | feat(health): Phase 3.1 - Enhanced health check endpoints and alerts |

### Key Accomplishments

#### 1. SSL/TLS Certificate Trust (HTTPS Everywhere)
- **Problem:** Health checks failed with `unable to verify the first certificate`
- **Solution:** Implemented `loadCACertificates()` and `createHealthCheckHttpsAgent()` in `health.service.ts`
- **File:** `backend/src/services/health.service.ts`
- **Result:** All HTTPS calls (OPA, Keycloak, KAS) now properly trust mkcert CA certificates

#### 2. Port Calculation Fix (Custom Test Codes)
- **Problem:** TST spoke health checks targeted wrong port (4063 instead of 4200)
- **Root Cause:** `get_instance_ports()` didn't check `is_custom_test_code()` before hash fallback
- **Solution:** Added explicit checks for custom test codes (TST, DEV, QAA) with predefined offsets
- **File:** `scripts/dive-modules/common.sh`
- **Result:** TST correctly uses offset 200 → backend port 4200

#### 3. Keycloak Health Check Fallback
- **Problem:** `/health/ready` returned 404 when health endpoints not enabled
- **Solution:** Implemented fallback chain: `/health/ready` → `/health` → `/realms/master`
- **File:** `backend/src/services/health.service.ts`
- **Result:** Keycloak health check now succeeds regardless of health endpoint configuration

#### 4. Shared Blacklist Redis (ACP-240 GAP-010)
- **Problem:** Spoke blacklist Redis not configured → "degraded" status
- **Solution:**
  - Added `BLACKLIST_REDIS_URL` to spoke template pointing to Hub's centralized blacklist
  - Added `REDIS_PASSWORD_BLACKLIST` sync in `spoke-secrets.sh`
  - Included `blacklistRedis` in health service response
- **Files:**
  - `templates/spoke/docker-compose.template.yml`
  - `scripts/dive-modules/spoke/pipeline/spoke-secrets.sh`
  - `backend/src/services/health.service.ts`
- **Result:** Cross-instance token revocation works - user logout revokes tokens everywhere

#### 5. mkcert CA Management
- **Problem:** Stale certificates from `mike@mike-NucBox` in 8 instances
- **Solution:** Added `./dive certs sync-ca` command to sync local mkcert CA to all instances
- **File:** `scripts/dive-modules/certificates.sh`
- **Result:** Dynamic certificate generation for current environment

### Final Health Check Results (TST Spoke)

```json
{
  "status": "healthy",
  "services": {
    "mongodb": "up",
    "opa": "up",
    "keycloak": "up",
    "kas": "up",
    "redis": "up",
    "blacklistRedis": "up",
    "cache": "up"
  }
}
```

---

## 🔍 EXISTING INFRASTRUCTURE AUDIT

### ✅ Circuit Breaker - ALREADY EXISTS (Do NOT Create New)

#### TypeScript Implementation
**File:** `backend/src/utils/circuit-breaker.ts`
```typescript
// Pre-configured circuit breakers for all services
export const opaCircuitBreaker = new CircuitBreaker({ name: 'OPA', failureThreshold: 5, timeout: 60000 });
export const keycloakCircuitBreaker = new CircuitBreaker({ name: 'Keycloak', failureThreshold: 3, timeout: 30000 });
export const mongoCircuitBreaker = new CircuitBreaker({ name: 'MongoDB', failureThreshold: 5, timeout: 60000 });
export const kasCircuitBreaker = new CircuitBreaker({ name: 'KAS', failureThreshold: 3, timeout: 30000 });

// States: CLOSED → OPEN → HALF_OPEN → CLOSED
// Already integrated with health.service.ts (getCircuitBreakerInfo())
```

#### Bash Implementation (Database-Persisted)
**File:** `scripts/dive-modules/error-recovery.sh`
```bash
# Configuration
CIRCUIT_FAILURE_THRESHOLD="${CIRCUIT_FAILURE_THRESHOLD:-5}"
CIRCUIT_COOLDOWN_PERIOD="${CIRCUIT_COOLDOWN_PERIOD:-60}"
CIRCUIT_CLOSED="CLOSED"
CIRCUIT_OPEN="OPEN"
CIRCUIT_HALF_OPEN="HALF_OPEN"

# Functions available:
# - orch_circuit_breaker_execute()  # Wrap calls with circuit breaker
# - orch_circuit_breaker_status()   # Get current state
# - orch_circuit_breaker_reset()    # Force reset
```

### ✅ Health Service - ALREADY EXISTS (Enhanced This Session)

**File:** `backend/src/services/health.service.ts`

Features:
- `/health` - Basic health check
- `/health/detailed` - Comprehensive with all services
- `/ready` - Kubernetes readiness probe
- `/live` - Kubernetes liveness probe
- Checks: MongoDB, OPA, Keycloak, KAS, Redis, BlacklistRedis, Cache
- Circuit breaker stats included in response
- Prometheus metrics integration

### ✅ Monitoring Stack - ALREADY EXISTS

**Location:** `docker/instances/shared/`

```
docker/instances/shared/
├── config/
│   ├── prometheus.yml               # Scrape configurations
│   ├── alertmanager.yml             # Alert routing (enhanced Phase 2)
│   ├── prometheus/
│   │   └── rules/
│   │       ├── dive-deployment.yml  # 25+ alert rules (Phase 2)
│   │       ├── kas.yml              # KAS-specific alerts
│   │       └── redis.yml            # Redis alerts
│   └── grafana/
│       └── provisioning/
│           ├── dashboards/
│           │   ├── authorization-decisions.json
│           │   ├── cache-performance.json
│           │   ├── compliance-overview.json
│           │   ├── dive-v3-overview.json
│           │   ├── federation-metrics.json
│           │   ├── hub-overview.json
│           │   ├── kas-dashboard.json
│           │   ├── kas-federation.json
│           │   ├── opal-policy-distribution.json
│           │   └── redis-dashboard.json   (11 dashboards total)
│           └── datasources/
│               └── datasources.yml
└── docker-compose.yml
```

### ✅ Database Connection Pooling - ALREADY EXISTS

**File:** `backend/src/services/connection-pool.service.ts`
- MongoDB connection pooling with retry logic
- PostgreSQL connection management
- Connection event logging

---

## 📊 PROJECT DIRECTORY STRUCTURE

```
DIVE-V3/
├── .cursor/
│   ├── NEXT_SESSION_PHASE3_RESILIENCE.md    # Previous handoff
│   └── NEXT_SESSION_PHASE3_INTEGRATION.md   # THIS DOCUMENT
│
├── scripts/
│   ├── dive                                  # Main CLI entrypoint
│   └── dive-modules/
│       ├── common.sh                         # ✅ MODIFIED: Port calculation fix
│       ├── certificates.sh                   # ✅ MODIFIED: Added sync-ca command
│       ├── error-recovery.sh                 # Circuit breaker (Bash)
│       ├── orchestration-state-db.sh         # PostgreSQL state management
│       ├── hub/
│       │   ├── status.sh                     # Hub health checks
│       │   └── pipeline/
│       │       └── phase-verification.sh
│       └── spoke/
│           └── pipeline/
│               ├── spoke-federation.sh
│               ├── spoke-secrets.sh          # ✅ MODIFIED: Blacklist password sync
│               └── phase-verification.sh     # Health check verification
│
├── backend/
│   └── src/
│       ├── services/
│       │   ├── health.service.ts             # ✅ MODIFIED: SSL, blacklist, fallback
│       │   ├── token-blacklist.service.ts    # Cross-instance revocation
│       │   └── token-introspection.service.ts # ✅ MODIFIED: Interface fix
│       ├── utils/
│       │   └── circuit-breaker.ts            # TypeScript circuit breakers
│       └── controllers/
│           └── health.controller.ts          # Health API endpoints
│
├── templates/
│   └── spoke/
│       └── docker-compose.template.yml       # ✅ MODIFIED: BLACKLIST_REDIS_URL
│
├── docker/
│   └── instances/
│       └── shared/
│           └── config/                       # Monitoring stack (Prometheus/Grafana)
│
├── instances/
│   ├── tst/                                  # Test spoke (TST)
│   ├── fra/                                  # France spoke
│   ├── deu/                                  # Germany spoke
│   └── .../                                  # Other NATO/partner instances
│
├── tests/
│   └── integration/
│       └── test-deployment-resilience.sh     # Integration test suite
│
└── monitoring/
    └── alerts/
        └── dive-v3-alerts.yml
```

---

## 📖 LESSONS LEARNED (This Session)

### 1. **Existing Infrastructure is Comprehensive**
- Circuit breakers already exist in both TypeScript and Bash
- 11 Grafana dashboards already provisioned
- Prometheus alert rules already defined (25+ rules)
- **Action:** ALWAYS audit before implementing - the codebase is more complete than it appears

### 2. **Port Calculation is Complex**
- NATO countries: Predefined offsets (0-29)
- Partner nations: Offsets 30-39
- Custom test codes (TST, DEV, QAA): Offset 200+
- ISO countries: Offsets 40-47
- Unknown: Hash-based fallback (48-67)
- **Action:** Use `get_instance_ports()` from common.sh - it handles all cases

### 3. **Certificate Management Requires Consistency**
- Each developer has their own mkcert CA
- Committed certificates may be from different environments
- **Action:** Run `./dive certs sync-ca` after fresh clone to sync local CA

### 4. **Keycloak Health Varies by Configuration**
- `/health/ready` requires `health-enabled=true` (not always set)
- `/realms/master` always works if Keycloak is running
- **Action:** Use fallback chain for robust health checks

### 5. **Blacklist Redis is Centralized at Hub**
- Spokes connect to Hub's blacklist (not their own)
- Uses `dive-shared` Docker network for connectivity
- Enables cross-instance token revocation (ACP-240 compliance)
- **Action:** Ensure `BLACKLIST_REDIS_URL` points to Hub, not local

### 6. **Health Status Logic**
- `healthy`: All critical services up (MongoDB, OPA)
- `degraded`: Non-critical services down or slow (Keycloak, Redis, blacklist)
- `unhealthy`: Critical services down
- **Action:** blacklistRedis down → degraded, not unhealthy

---

## 🔍 SCOPE GAP ANALYSIS

### ✅ COMPLETED (Phase 1, 2, 3.1)

| Feature | Status | Evidence |
|---------|--------|----------|
| Health check endpoints | ✅ | All 7 services reporting "up" |
| SSL/TLS certificate trust | ✅ | mkcert CA loaded in health checks |
| Port calculation fix | ✅ | TST uses correct port 4200 |
| Keycloak health fallback | ✅ | Works with any Keycloak config |
| Shared blacklist Redis | ✅ | Cross-instance token revocation |
| mkcert CA sync command | ✅ | `./dive certs sync-ca` |
| Prometheus alert rules | ✅ | 25+ rules in dive-deployment.yml |
| AlertManager routing | ✅ | Inhibition rules, severity routing |
| Grafana dashboards | ✅ | 11 dashboards provisioned |

### 🔄 REMAINING (Phase 3.2+)

| Feature | Priority | Complexity | Notes |
|---------|----------|------------|-------|
| **3.2 Circuit Breaker Integration** | HIGH | LOW | Already exists - needs verification/testing |
| **3.3 Database Connection Pooling** | MEDIUM | LOW | Already exists - needs audit |
| **3.4 Prometheus Metrics Enhancement** | MEDIUM | MEDIUM | Add circuit breaker state metrics |
| **3.5 Integration Testing** | HIGH | MEDIUM | Validate all resilience features |
| **4.1 Unit Tests (bats)** | MEDIUM | MEDIUM | Test framework setup |
| **4.2 E2E Resilience Tests** | HIGH | HIGH | Failure injection and recovery |

### ❌ NOT NEEDED (Confirmed)

| Feature | Reason |
|---------|--------|
| Static JSON federation registry | MongoDB is SSOT |
| New circuit breaker module | Already exists in TypeScript and Bash |
| New health check implementation | Already comprehensive |
| Prometheus/Grafana setup | Already in docker/instances/shared |
| Manual docker commands | DIVE CLI handles everything |

---

## 🎯 PHASED IMPLEMENTATION PLAN

### **PHASE 3.2: Circuit Breaker Integration Verification**
**Goal:** Verify existing circuit breakers are properly integrated and add missing metrics.

**Timeline:** 1-2 hours
**Approach:** AUDIT & ENHANCE (not create)

#### Tasks

1. **Audit Circuit Breaker Usage**
   ```bash
   # Check TypeScript usage
   grep -r "opaCircuitBreaker\|keycloakCircuitBreaker\|mongoCircuitBreaker\|kasCircuitBreaker" backend/src/

   # Check Bash usage
   grep -r "orch_circuit_breaker" scripts/dive-modules/
   ```

2. **Verify Health Service Integration**
   - Confirm `getCircuitBreakerInfo()` returns correct states
   - Test circuit breaker transitions (CLOSED → OPEN → HALF_OPEN)
   - Validate metrics are exposed to Prometheus

3. **Add Prometheus Metrics for Circuit State**
   - File: `backend/src/services/prometheus-metrics.service.ts`
   - Metric: `dive_v3_circuit_breaker_state{service="opa|keycloak|mongodb|kas"} 0|1|2`
   - Alert: `CircuitBreakerOpen` when state == 2 (OPEN)

4. **Test Circuit Breaker Behavior**
   ```bash
   # Simulate OPA failure
   ./dive hub logs opa | grep -i "circuit"

   # Check circuit state via health endpoint
   curl -sk https://localhost:4000/health/detailed | jq '.circuitBreakers'
   ```

**Success Criteria:**
- ✅ Circuit breaker states visible in `/health/detailed`
- ✅ Prometheus metric `dive_v3_circuit_breaker_state` exposed
- ✅ Alert rule fires when circuit opens (test with simulated failure)
- ✅ Circuit auto-recovers to CLOSED after service recovery

---

### **PHASE 3.3: Database Connection Resilience Verification**
**Goal:** Audit existing connection pooling and add resilience metrics.

**Timeline:** 1 hour
**Approach:** AUDIT & ENHANCE

#### Tasks

1. **Audit MongoDB Connection Configuration**
   ```bash
   grep -r "MongoClient\|mongodb://" backend/src/
   # Expected: retryWrites=true, w=majority, poolSize settings
   ```

2. **Audit PostgreSQL Connection Logic**
   ```bash
   grep -r "pg_isready\|psql" scripts/dive-modules/orchestration-state-db.sh
   ```

3. **Add Connection Pool Metrics**
   - File: `backend/src/services/prometheus-metrics.service.ts`
   - Metrics:
     - `dive_v3_db_connections_active{type="mongodb|postgres"}`
     - `dive_v3_db_connections_idle{type="mongodb|postgres"}`
   - Alert: `DBConnectionPoolExhausted` when active > 90% max

**Success Criteria:**
- ✅ Connection pool configuration documented
- ✅ Connection metrics exposed to Prometheus
- ✅ Alert rule for pool exhaustion defined

---

### **PHASE 3.4: Integration Test Enhancement**
**Goal:** Validate all Phase 3 resilience features work end-to-end.

**Timeline:** 2-3 hours
**Approach:** EXTEND existing test suite

#### Tasks

1. **Extend test-deployment-resilience.sh**
   - Add: `test_health_check_all_services()` - validates 7 services report "up"
   - Add: `test_circuit_breaker_states()` - validates CB info in health response
   - Add: `test_blacklist_redis_connectivity()` - validates cross-instance connection
   - Add: `test_ssl_certificate_trust()` - validates HTTPS works without errors

2. **Add Failure Injection Tests**
   - Stop OPA → verify circuit opens
   - Restart OPA → verify circuit recovers
   - Stop blacklist Redis → verify degraded (not unhealthy)

3. **Run Full Test Suite**
   ```bash
   ./dive nuke all --confirm
   ./dive hub deploy
   ./dive spoke deploy tst
   ./tests/integration/test-deployment-resilience.sh all
   ```

**Success Criteria:**
- ✅ All health check tests pass
- ✅ Circuit breaker tests pass
- ✅ Failure injection tests demonstrate graceful degradation
- ✅ Test suite completes in < 20 minutes

---

## 🚀 GETTING STARTED

### Step 1: Verify This Session's Changes

```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3

# Verify commits
git log --oneline | head -8
# Expected: 8c650c31, ab4a113b, 01eabc8e, a58e4557, b81b2885

# Verify health endpoint works
curl -sk https://localhost:4200/health/detailed | jq '.status'
# Expected: "healthy"

# Verify all services up
curl -sk https://localhost:4200/health/detailed | jq '.services | to_entries | map(.value.status)'
# Expected: All "up"
```

### Step 2: Verify Circuit Breakers Exist

```bash
# TypeScript circuit breakers
grep -c "CircuitBreaker" backend/src/utils/circuit-breaker.ts
# Expected: 30+ matches

# Bash circuit breakers
grep -c "circuit_breaker" scripts/dive-modules/error-recovery.sh
# Expected: 20+ matches

# Health service integration
grep "circuitBreakers" backend/src/services/health.service.ts
# Expected: Found in detailedHealthCheck()
```

### Step 3: Begin Phase 3.2 Implementation

```bash
# Check current circuit breaker metrics
curl -sk https://localhost:4200/metrics | grep circuit
# If empty: Need to add Prometheus metrics

# Run integration tests to verify current state
./tests/integration/test-deployment-resilience.sh --quick
```

---

## 🛠️ CRITICAL REMINDERS

### ✅ DO:
1. **AUDIT FIRST** - Read existing code before any modifications
2. **Use DIVE CLI** - `./dive hub deploy`, `./dive spoke deploy`, etc.
3. **Test on clean slate** - `./dive nuke all --confirm` before major tests
4. **ENHANCE existing** - Modify functions, don't create parallel implementations
5. **Commit incrementally** - One commit per logical change
6. **Validate YAML** - Check Prometheus rules with promtool

### ❌ DON'T:
1. **NO manual docker commands** - Everything through `./dive`
2. **NO new circuit breaker modules** - They already exist
3. **NO static JSON dual-write** - Database is SSOT
4. **NO shortcuts** - Best practices only
5. **NO skipping tests** - Every change needs validation

---

## 📈 SUCCESS CRITERIA (Phase 3.2+)

### Quantitative
- [ ] All 7 services report "up" status
- [ ] Circuit breaker states visible in health response
- [ ] Prometheus metric `dive_v3_circuit_breaker_state` exposed
- [ ] Connection pool metrics exposed
- [ ] Integration test suite passes (15+ tests)
- [ ] Test execution time < 20 minutes

### Qualitative
- [ ] No new circuit breaker modules created (used existing)
- [ ] No static JSON files introduced
- [ ] All changes via DIVE CLI (no manual docker)
- [ ] Proper exponential backoff in all retry logic
- [ ] Circuit breaker state survives service restarts (if PostgreSQL-backed)

---

## 📞 QUESTIONS TO VALIDATE IN SESSION

1. **Circuit Breakers:** Are the TypeScript circuit breakers being used in actual HTTP calls?
   ```bash
   grep -r "opaCircuitBreaker.call\|keycloakCircuitBreaker.call" backend/src/
   ```

2. **Prometheus Metrics:** Is `dive_v3_circuit_breaker_state` already exposed?
   ```bash
   curl -sk https://localhost:4000/metrics | grep circuit
   ```

3. **Database Connections:** What are the current pool settings?
   ```bash
   grep -A5 "maxPoolSize\|minPoolSize" backend/src/
   ```

---

## 📚 REFERENCE FILES

### Must-Read Before Starting
1. `backend/src/utils/circuit-breaker.ts` - TypeScript implementation
2. `scripts/dive-modules/error-recovery.sh` - Bash implementation
3. `backend/src/services/health.service.ts` - Health check logic
4. `docker/instances/shared/config/prometheus/rules/dive-deployment.yml` - Alert rules
5. `tests/integration/test-deployment-resilience.sh` - Test patterns

### DIVE CLI Commands
```bash
# Hub operations
./dive hub deploy              # Deploy hub
./dive hub status              # Check status
./dive hub down                # Stop hub

# Spoke operations
./dive spoke deploy <code>     # Deploy spoke
./dive spoke status <code>     # Check status
./dive spoke down <code>       # Stop spoke

# Certificate operations
./dive certs sync-ca           # Sync mkcert CA to all instances
./dive certs generate <code>   # Generate certificates for instance

# Testing
./dive nuke all --confirm      # Clean slate
```

---

## ✅ FINAL SESSION CHECKLIST

Before ending the session:
- [ ] Phase 3.2 circuit breaker integration verified
- [ ] Phase 3.3 database resilience verified
- [ ] Phase 3.4 integration tests pass
- [ ] All changes committed with descriptive messages
- [ ] No manual docker commands used
- [ ] No new static JSON files created
- [ ] Next session handoff document created (if needed)

---

## 🔗 RELATED DOCUMENTS

- **Original Requirements:** `.cursor/NEXT_SESSION_DEPLOYMENT_RESILIENCE.md`
- **Previous Handoff:** `.cursor/NEXT_SESSION_PHASE3_RESILIENCE.md`
- **Project Conventions:** `.cursorrules`
- **This Session Commits:** `8c650c31`, `ab4a113b`, `01eabc8e`, `a58e4557`, `b81b2885`

---

## 🏗️ ARCHITECTURE SUMMARY

```
┌─────────────────────────────────────────────────────────────────┐
│                         DIVE V3 FEDERATION                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│    ┌─────────────────────────────────────────────────────────┐  │
│    │                        HUB (USA)                        │  │
│    │  ┌───────────┐  ┌───────────┐  ┌───────────────────┐   │  │
│    │  │  Backend  │  │  Keycloak │  │ Redis Blacklist   │   │  │
│    │  │  :4000    │  │  :8443    │  │ (Centralized)     │   │  │
│    │  │           │  │           │  │                   │   │  │
│    │  │ Circuit   │  │ IdP       │  │ Token Revocation  │   │  │
│    │  │ Breakers: │  │ Broker    │  │ Pub/Sub           │   │  │
│    │  │ - OPA     │  │           │  │                   │   │  │
│    │  │ - Keycloak│  │           │  │                   │   │  │
│    │  │ - MongoDB │  │           │  │                   │   │  │
│    │  │ - KAS     │  │           │  │                   │   │  │
│    │  └───────────┘  └───────────┘  └───────────────────┘   │  │
│    └─────────────────────────────────────────────────────────┘  │
│                              │                                   │
│              ┌───────────────┼───────────────┐                  │
│              │               │               │                  │
│              ▼               ▼               ▼                  │
│    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │
│    │ TST Spoke   │  │ FRA Spoke   │  │ DEU Spoke   │           │
│    │ :4200       │  │ :4010       │  │ :4008       │           │
│    │             │  │             │  │             │           │
│    │ Connects to │  │ Connects to │  │ Connects to │           │
│    │ Hub Redis   │  │ Hub Redis   │  │ Hub Redis   │           │
│    │ Blacklist   │  │ Blacklist   │  │ Blacklist   │           │
│    └─────────────┘  └─────────────┘  └─────────────┘           │
│                                                                  │
│    ┌─────────────────────────────────────────────────────────┐  │
│    │                 MONITORING STACK                        │  │
│    │  ┌───────────┐  ┌───────────┐  ┌───────────┐           │  │
│    │  │Prometheus │  │AlertManager│  │ Grafana   │           │  │
│    │  │ :9090     │  │ :9093     │  │ :3030     │           │  │
│    │  │           │  │           │  │           │           │  │
│    │  │ 25+ Alert │  │ Inhibition│  │ 11        │           │  │
│    │  │ Rules     │  │ Rules     │  │ Dashboards│           │  │
│    │  └───────────┘  └───────────┘  └───────────┘           │  │
│    └─────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

**END OF HANDOFF DOCUMENT**

**Next Action:** Begin with Step 1 (verification), then proceed to Phase 3.2 (Circuit Breaker Integration Verification).
