# DIVE V3 Production Resilience - Phase 4 Session Handoff

**Session Date:** 2026-01-21  
**Previous Session Commits:** `15a319e6`, `8c650c31`, `ab4a113b`, `01eabc8e`, `a58e4557`, `b81b2885`  
**Status:** Phase 3.1-3.4 COMPLETE ✅ | Phase 4+ READY

---

## 🎯 SESSION OBJECTIVE

Continue production resilience testing and validation for DIVE V3 federated ICAM system. All resilience infrastructure has been implemented (circuit breakers, health checks, metrics, alerts). This session focuses on **comprehensive testing, failure injection validation, and documentation of recovery patterns**.

---

## 🚨 CRITICAL CONSTRAINTS (NON-NEGOTIABLE)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ✅ DIVE CLI ONLY     - Use ./dive commands exclusively                     │
│                        NO manual docker/docker-compose commands             │
│                                                                             │
│  ✅ AUDIT FIRST       - Existing logic is robust                            │
│                        ENHANCE existing functions, don't duplicate          │
│                                                                             │
│  ✅ DATABASE = SSOT   - MongoDB: Federation registry                        │
│                        PostgreSQL: Orchestration state                      │
│                        NO static JSON dual-write needed                     │
│                                                                             │
│  ✅ EXISTING INFRA    - Prometheus/Grafana/AlertManager ALREADY EXISTS      │
│                        Location: docker/instances/shared/                   │
│                                                                             │
│  ✅ CLEAN SLATE OK    - All data is DUMMY/FAKE                              │
│                        ./dive nuke all --confirm AUTHORIZED                 │
│                                                                             │
│  ✅ BEST PRACTICE     - No shortcuts, workarounds, or "quick fixes"         │
│                        Full testing suite required for all changes          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## ✅ COMPLETED WORK (Previous Sessions)

### Phase 1: Foundation (Commit `a7ef3636`)
- Federation schema migration to PostgreSQL
- Orchestration state database persistence
- Error recovery framework

### Phase 2: Monitoring Integration (Commit `ca53e28f`)
- Prometheus alert rules (25+ rules in `dive-deployment.yml`)
- AlertManager routing with inhibition rules
- Grafana dashboards (11 dashboards provisioned)

### Phase 3.1: Health Check Endpoints (Commits `b81b2885` → `8c650c31`)
| Feature | Status | File |
|---------|--------|------|
| SSL/TLS certificate trust | ✅ | `backend/src/services/health.service.ts` |
| mkcert CA loading | ✅ | `loadCACertificates()`, `createHealthCheckHttpsAgent()` |
| Port calculation fix (TST) | ✅ | `scripts/dive-modules/common.sh` |
| Keycloak health fallback | ✅ | Fallback chain: `/health/ready` → `/health` → `/realms/master` |
| Shared blacklist Redis | ✅ | Cross-instance token revocation (ACP-240) |
| mkcert CA sync command | ✅ | `./dive certs sync-ca` |

### Phase 3.2: Circuit Breaker Integration (Commit `15a319e6`)
| Feature | Status | Details |
|---------|--------|---------|
| Circuit breaker state metric | ✅ | `dive_v3_circuit_breaker_state{service}` (0=CLOSED, 1=HALF_OPEN, 2=OPEN) |
| Circuit breaker failures metric | ✅ | `dive_v3_circuit_breaker_failures{service}` |
| Circuit breaker rejects counter | ✅ | `dive_v3_circuit_breaker_rejects_total{service}` |
| Circuit breaker transitions counter | ✅ | `dive_v3_circuit_breaker_transitions_total{service,from_state,to_state}` |
| Health service metrics polling | ✅ | 10-second interval publishing to Prometheus |
| CircuitBreakerOpen alert | ✅ | Critical when state == 2 |
| CircuitBreakerHalfOpen alert | ✅ | Warning when testing recovery |
| HighCircuitBreakerRejects alert | ✅ | Warning when >10 rejects in 5 minutes |
| CircuitBreakerFailuresHigh alert | ✅ | Warning when failures >= 3 |

### Phase 3.3: Database Connection Resilience (Commit `15a319e6`)
| Feature | Status | Details |
|---------|--------|---------|
| DB connections active metric | ✅ | `dive_v3_db_connections_active{db_type}` |
| DB connections idle metric | ✅ | `dive_v3_db_connections_idle{db_type}` |
| DB connections total metric | ✅ | `dive_v3_db_connections_total{db_type}` |
| DB connection errors counter | ✅ | `dive_v3_db_connection_errors_total{db_type,error_type}` |
| DBConnectionPoolExhausted alert | ✅ | Critical at 90% pool utilization |
| DBConnectionErrors alert | ✅ | Warning when >5 errors in 5 minutes |
| DBNoIdleConnections alert | ✅ | Warning when pool fully utilized |

### Phase 3.4: Integration Test Enhancement (Commit `15a319e6`)
| Test Suite | Tests Added | Status |
|------------|-------------|--------|
| Suite 6: Circuit Breaker | `test_circuit_breaker_states_in_health` | ✅ PASS |
| Suite 6: Circuit Breaker | `test_health_check_all_services` | ✅ PASS |
| Suite 6: Circuit Breaker | `test_ssl_certificate_trust` | ✅ PASS |
| Suite 6: Circuit Breaker | `test_blacklist_redis_connectivity` | ✅ PASS |
| Suite 7: Failure Injection | `test_graceful_degradation_blacklist_down` | ✅ PASS |

---

## 📊 CURRENT STATE - VERIFIED HEALTH CHECK

```json
// Endpoint: GET https://localhost:4200/health/detailed (TST spoke)
{
  "status": "healthy",
  "services": {
    "mongodb": { "status": "up" },
    "opa": { "status": "up" },
    "keycloak": { "status": "up" },
    "kas": { "status": "up" },
    "redis": { "status": "up" },
    "blacklistRedis": { "status": "up" },
    "cache": { "status": "up" }
  },
  "circuitBreakers": {
    "opa": { "state": "CLOSED", "failures": 0, "rejects": 0 },
    "keycloak": { "state": "CLOSED", "failures": 0, "rejects": 0 },
    "mongodb": { "state": "CLOSED", "failures": 0, "rejects": 0 },
    "kas": { "state": "CLOSED", "failures": 0, "rejects": 0 }
  }
}
```

---

## 🔍 EXISTING INFRASTRUCTURE AUDIT

### ✅ TypeScript Circuit Breakers - COMPLETE

**File:** `backend/src/utils/circuit-breaker.ts`

```typescript
// Pre-configured instances (DO NOT CREATE NEW ONES)
export const opaCircuitBreaker = new CircuitBreaker({
  name: 'OPA', failureThreshold: 5, timeout: 60000, successThreshold: 2
});
export const keycloakCircuitBreaker = new CircuitBreaker({
  name: 'Keycloak', failureThreshold: 3, timeout: 30000, successThreshold: 2
});
export const mongoCircuitBreaker = new CircuitBreaker({
  name: 'MongoDB', failureThreshold: 5, timeout: 60000, successThreshold: 3
});
export const kasCircuitBreaker = new CircuitBreaker({
  name: 'KAS', failureThreshold: 3, timeout: 30000, successThreshold: 2
});

// Stats retrieval function
export function getAllCircuitBreakerStats(): Record<string, ICircuitBreakerStats>;
```

### ✅ Bash Circuit Breakers - COMPLETE

**File:** `scripts/dive-modules/error-recovery.sh`

```bash
# Database-persisted circuit breaker for orchestration
CIRCUIT_FAILURE_THRESHOLD="${CIRCUIT_FAILURE_THRESHOLD:-5}"
CIRCUIT_COOLDOWN_PERIOD="${CIRCUIT_COOLDOWN_PERIOD:-60}"

# Functions available:
# - orch_circuit_breaker_execute()  # Wrap calls with circuit breaker
# - orch_circuit_breaker_status()   # Get current state
# - orch_circuit_breaker_reset()    # Force reset
```

### ✅ Prometheus Metrics - COMPLETE

**File:** `backend/src/services/prometheus-metrics.service.ts`

| Category | Metrics |
|----------|---------|
| Circuit Breakers | `dive_v3_circuit_breaker_state`, `_failures`, `_rejects_total`, `_transitions_total` |
| Database | `dive_v3_db_connections_active`, `_idle`, `_total`, `_errors_total` |
| Authorization | `dive_v3_authorization_decision_latency_seconds`, `_decisions_total` |
| Cache | `dive_v3_cache_operations_total`, `_hit_rate`, `_size`, `_evictions` |
| Federation | `dive_v3_federation_logins_total`, `_latency_seconds`, `_sessions` |
| KAS | `dive_v3_kas_key_operations_total`, `_latency_seconds` |

### ✅ Prometheus Alert Rules - COMPLETE

**File:** `docker/instances/shared/config/prometheus/rules/dive-deployment.yml`

| Alert Group | Alerts |
|-------------|--------|
| `dive_circuit_breaker` | CircuitBreakerOpen, CircuitBreakerHalfOpen, HighCircuitBreakerRejects, CircuitBreakerFailuresHigh |
| `dive_db_connections` | DBConnectionPoolExhausted, DBConnectionErrors, DBNoIdleConnections |
| `dive_health` | DiveServiceUnhealthy, DiveServiceDegraded, HighErrorRate |
| `dive_authorization` | AuthorizationHighLatency, AuthorizationHighDenyRate |
| `dive_federation` | FederationLoginFailures, FederationHighLatency |

### ✅ Grafana Dashboards - COMPLETE

**Location:** `docker/instances/shared/config/grafana/provisioning/dashboards/`

1. `authorization-decisions.json` - Authorization latency and decisions
2. `cache-performance.json` - Cache hit/miss rates
3. `compliance-overview.json` - ACP-240 compliance metrics
4. `dive-v3-overview.json` - System overview
5. `federation-metrics.json` - Federation login metrics
6. `hub-overview.json` - Hub instance health
7. `kas-dashboard.json` - KAS operations
8. `kas-federation.json` - Cross-KAS federation
9. `opal-policy-distribution.json` - Policy sync status
10. `redis-dashboard.json` - Redis performance
11. `dashboard.yml` - Dashboard provisioning config

### ✅ Integration Tests - ENHANCED

**File:** `tests/integration/test-deployment-resilience.sh`

| Suite | Tests | Purpose |
|-------|-------|---------|
| Suite 1: Basic | `test_dive_cli_available`, `test_docker_accessible` | CLI verification |
| Suite 2: Hub | `test_hub_deploy_from_scratch`, `test_hub_services_healthy` | Hub deployment |
| Suite 3: Spoke | `test_spoke_deploy_from_scratch`, `test_spoke_services_healthy` | Spoke deployment |
| Suite 4: Federation | `test_federation_retry_logic`, `test_oidc_endpoints_reachable` | Federation resilience |
| Suite 5: Full Deploy | Full clean slate deployment | End-to-end |
| Suite 6: Circuit Breaker | CB states, all services, SSL, blacklist | Phase 3.2 verification |
| Suite 7: Failure Injection | Graceful degradation | Phase 3.4 |

---

## 📁 PROJECT DIRECTORY STRUCTURE

```
DIVE-V3/
├── .cursor/
│   ├── NEXT_SESSION_DEPLOYMENT_RESILIENCE.md    # Original requirements
│   ├── NEXT_SESSION_PHASE3_RESILIENCE.md        # Phase 2 handoff
│   ├── NEXT_SESSION_PHASE3_INTEGRATION.md       # Phase 3.1 handoff
│   └── NEXT_SESSION_PHASE4_TESTING.md           # THIS DOCUMENT
│
├── scripts/
│   ├── dive                                      # Main CLI entrypoint
│   └── dive-modules/
│       ├── common.sh                             # Port calculation, utilities
│       ├── certificates.sh                       # Certificate management
│       ├── error-recovery.sh                     # ✅ Bash circuit breaker
│       ├── orchestration-state-db.sh             # PostgreSQL state management
│       ├── hub/
│       │   ├── deploy.sh
│       │   ├── status.sh
│       │   └── pipeline/
│       │       └── phase-verification.sh
│       └── spoke/
│           ├── spoke-deploy.sh
│           ├── status.sh
│           └── pipeline/
│               ├── spoke-federation.sh
│               ├── spoke-secrets.sh              # Blacklist password sync
│               └── phase-verification.sh
│
├── backend/
│   └── src/
│       ├── services/
│       │   ├── health.service.ts                 # ✅ Health checks + metrics polling
│       │   ├── prometheus-metrics.service.ts     # ✅ All Prometheus metrics
│       │   ├── token-blacklist.service.ts        # Cross-instance revocation
│       │   └── connection-pool.service.ts        # DB connection pooling
│       ├── utils/
│       │   └── circuit-breaker.ts                # ✅ TypeScript circuit breakers
│       └── controllers/
│           └── health.controller.ts              # Health API endpoints
│
├── templates/
│   └── spoke/
│       └── docker-compose.template.yml           # BLACKLIST_REDIS_URL configured
│
├── docker/
│   └── instances/
│       └── shared/
│           ├── docker-compose.yml                # Monitoring stack
│           └── config/
│               ├── prometheus.yml                # Scrape configs
│               ├── alertmanager.yml              # Alert routing
│               ├── prometheus/
│               │   └── rules/
│               │       ├── dive-deployment.yml   # ✅ 30+ alert rules
│               │       ├── kas.yml
│               │       └── redis.yml
│               └── grafana/
│                   └── provisioning/
│                       ├── dashboards/           # 11 dashboards
│                       └── datasources/
│
├── instances/
│   ├── usa/                                      # Hub instance
│   ├── tst/                                      # Test spoke
│   ├── fra/                                      # France spoke
│   ├── deu/                                      # Germany spoke
│   └── .../                                      # Other NATO/partner instances
│
└── tests/
    └── integration/
        ├── test-deployment-resilience.sh         # ✅ Main resilience test suite
        ├── test-ssot-compliance.sh               # Database SSOT verification
        └── federation-flow.sh                    # Federation E2E
```

---

## 📖 LESSONS LEARNED

### 1. **Existing Infrastructure is Comprehensive**
The codebase has robust implementations that are often more complete than expected.
- **Action:** ALWAYS run `grep -r "function_name" backend/src/` before creating new code
- **Example:** Circuit breakers existed in both TypeScript and Bash before Phase 3

### 2. **Port Calculation Complexity**
Port offsets vary by country type (NATO, partner, custom test codes, ISO, unknown).
- **Predefined:** NATO (0-29), Partner (30-39), Custom (200+), ISO (40-47), Hash (48-67)
- **Action:** Use `get_instance_ports()` from `common.sh` - it handles all edge cases

### 3. **Certificate Management Requires Consistency**
Each developer has their own mkcert CA; committed certificates may not match local environment.
- **Action:** Run `./dive certs sync-ca` after fresh clone
- **Critical:** Health checks fail with `unable to verify the first certificate` without this

### 4. **Keycloak Health Varies by Configuration**
- `/health/ready` requires `health-enabled=true` (not always set in config)
- `/realms/master` always works if Keycloak is running
- **Action:** Fallback chain implemented - no further work needed

### 5. **Blacklist Redis is Centralized**
- All spokes connect to Hub's blacklist Redis (not their own)
- Uses `dive-shared` Docker network for cross-instance connectivity
- Enables ACP-240 compliant cross-instance token revocation

### 6. **Health Status Logic**
| Status | Condition |
|--------|-----------|
| `healthy` | All critical services up (MongoDB, OPA) |
| `degraded` | Non-critical services down (Keycloak, Redis, blacklistRedis) |
| `unhealthy` | Critical services down |

### 7. **Pre-commit Hook Rejects localhost URLs**
- Integration tests must use environment variables for URLs
- Pattern: `HUB_BACKEND_URL="${HUB_BACKEND_URL:-https://localhost:4000}"`

### 8. **Test Environment Variables**
```bash
# Configure test endpoints (defaults shown)
export HUB_BACKEND_URL="https://localhost:4000"
export HUB_KEYCLOAK_URL="https://localhost:8443"
export SPOKE_KEYCLOAK_URL="https://127.0.0.1:8643"
```

---

## 🔍 SCOPE GAP ANALYSIS

### ✅ COMPLETED

| Feature | Phase | Evidence |
|---------|-------|----------|
| Health check endpoints | 3.1 | All 7 services report "up" |
| SSL/TLS certificate trust | 3.1 | mkcert CA loaded in health checks |
| Port calculation fix | 3.1 | TST uses correct port 4200 |
| Keycloak health fallback | 3.1 | Works with any Keycloak config |
| Shared blacklist Redis | 3.1 | Cross-instance token revocation |
| mkcert CA sync command | 3.1 | `./dive certs sync-ca` |
| Circuit breaker metrics | 3.2 | `dive_v3_circuit_breaker_*` exposed |
| Circuit breaker alerts | 3.2 | 4 alert rules in dive-deployment.yml |
| DB connection metrics | 3.3 | `dive_v3_db_connections_*` exposed |
| DB connection alerts | 3.3 | 3 alert rules in dive-deployment.yml |
| Integration tests | 3.4 | Suites 6 & 7 passing |
| Prometheus rules | 2 | 30+ rules defined |
| AlertManager routing | 2 | Inhibition rules configured |
| Grafana dashboards | 2 | 11 dashboards provisioned |

### 🔄 REMAINING (Phase 4+)

| Feature | Priority | Complexity | Notes |
|---------|----------|------------|-------|
| **4.1 Failure Injection Testing** | HIGH | MEDIUM | Stop services, verify circuit opens |
| **4.2 Recovery Validation** | HIGH | MEDIUM | Restart services, verify circuit closes |
| **4.3 Multi-Instance Resilience** | MEDIUM | HIGH | Test with multiple spokes |
| **4.4 Chaos Engineering** | LOW | HIGH | Random failure injection |
| **4.5 Performance Testing** | MEDIUM | MEDIUM | Load test under failure conditions |
| **5.1 Documentation** | MEDIUM | LOW | Runbook for recovery procedures |
| **5.2 Alerting Validation** | HIGH | MEDIUM | Verify alerts fire correctly |

### ❌ NOT NEEDED (Confirmed)

| Feature | Reason |
|---------|--------|
| Static JSON federation registry | MongoDB is SSOT |
| New circuit breaker modules | Already exist in TypeScript and Bash |
| New health check implementation | Already comprehensive |
| Prometheus/Grafana setup | Already in docker/instances/shared |
| Manual docker commands | DIVE CLI handles everything |
| Dual-write to JSON files | Database is authoritative |

---

## 🎯 PHASED IMPLEMENTATION PLAN

### **PHASE 4.1: Failure Injection Testing**

**SMART Goal:** Validate circuit breakers open within 30 seconds when services fail, with 100% test pass rate.

**Timeline:** 2-3 hours  
**Approach:** Extend existing test suite

#### Tasks

1. **Implement OPA Failure Injection Test**
   ```bash
   # In test-deployment-resilience.sh
   test_opa_failure_circuit_opens() {
       # Stop OPA container
       ./dive hub exec docker stop hub-opa-1
       
       # Wait for circuit to open (5 failures * ~5 second health check interval)
       sleep 30
       
       # Verify circuit is OPEN
       curl -sk https://localhost:4000/health/detailed | jq '.circuitBreakers.opa.state'
       # Expected: "OPEN"
       
       # Restart OPA
       ./dive hub exec docker start hub-opa-1
   }
   ```

2. **Implement Keycloak Failure Injection Test**
   - Stop Keycloak container
   - Verify circuit opens after 3 failures
   - System should remain "degraded" (not unhealthy)

3. **Implement MongoDB Failure Injection Test**
   - Stop MongoDB container
   - Verify circuit opens after 5 failures
   - System should become "unhealthy" (critical service)

4. **Implement Redis Failure Injection Test**
   - Stop Redis container
   - Verify graceful degradation (cache disabled)
   - Authorization should still work

**Success Criteria:**
- [ ] OPA circuit opens within 30 seconds of service failure
- [ ] Keycloak circuit opens within 20 seconds
- [ ] MongoDB circuit opens within 30 seconds
- [ ] Redis failure results in degraded (not unhealthy) status
- [ ] All tests run via `./tests/integration/test-deployment-resilience.sh failure-injection`

---

### **PHASE 4.2: Recovery Validation Testing**

**SMART Goal:** Validate circuits recover to CLOSED state within 2 minutes of service restoration, with automatic retry.

**Timeline:** 2 hours  
**Approach:** Extend failure injection tests with recovery verification

#### Tasks

1. **Implement OPA Recovery Test**
   ```bash
   test_opa_circuit_recovery() {
       # After failure injection (circuit is OPEN)
       
       # Restart OPA
       ./dive hub exec docker start hub-opa-1
       
       # Wait for timeout + recovery attempts
       sleep 90
       
       # Verify circuit is CLOSED
       curl -sk https://localhost:4000/health/detailed | jq '.circuitBreakers.opa.state'
       # Expected: "CLOSED"
   }
   ```

2. **Implement All-Service Recovery Test**
   - Stop all non-critical services
   - Verify graceful degradation
   - Restart all services
   - Verify full recovery

3. **Test Partial Recovery**
   - Stop OPA and Keycloak
   - Restart only OPA
   - Verify OPA circuit closes while Keycloak remains open

**Success Criteria:**
- [ ] OPA circuit closes within 90 seconds of service restoration
- [ ] Keycloak circuit closes within 60 seconds
- [ ] System returns to "healthy" status after all services restored
- [ ] Test passes consistently (3 consecutive runs)

---

### **PHASE 4.3: Alert Validation Testing**

**SMART Goal:** Verify all 10 circuit breaker and database alerts fire correctly within 5 minutes of threshold breach.

**Timeline:** 2 hours  
**Approach:** Trigger conditions, check AlertManager

#### Tasks

1. **Test CircuitBreakerOpen Alert**
   ```bash
   # Trigger: Stop OPA until circuit opens
   # Check: AlertManager API for firing alert
   curl -sk http://localhost:9093/api/v2/alerts | jq '.[] | select(.labels.alertname == "CircuitBreakerOpen")'
   ```

2. **Test DBConnectionPoolExhausted Alert**
   - Create load to exhaust connection pool
   - Verify alert fires

3. **Test Inhibition Rules**
   - When CircuitBreakerOpen fires, HighCircuitBreakerRejects should be inhibited
   - Verify inhibition in AlertManager UI

4. **Document Alert Response Procedures**
   - Create runbook for each alert type
   - Include remediation steps

**Success Criteria:**
- [ ] CircuitBreakerOpen alert fires within 5 minutes of circuit opening
- [ ] Alert resolves within 2 minutes of circuit closing
- [ ] Inhibition rules prevent alert storms
- [ ] All alerts documented with remediation steps

---

### **PHASE 5.1: Multi-Instance Resilience Testing**

**SMART Goal:** Validate resilience patterns work correctly with 3+ spokes, including cross-instance token revocation.

**Timeline:** 3-4 hours  
**Approach:** Deploy multiple spokes, test failure scenarios

#### Tasks

1. **Deploy Multiple Spokes**
   ```bash
   ./dive nuke all --confirm
   ./dive hub deploy
   ./dive spoke deploy tst
   ./dive spoke deploy fra
   ./dive spoke deploy deu
   ```

2. **Test Cross-Instance Token Revocation**
   - Login on TST spoke
   - Revoke token on Hub
   - Verify token rejected on FRA spoke

3. **Test Spoke Isolation**
   - Stop TST spoke
   - Verify FRA and DEU continue operating
   - Verify Hub health unaffected

4. **Test Federation Resilience**
   - Stop Hub Keycloak briefly
   - Verify spokes use cached OIDC config
   - Restart Hub Keycloak
   - Verify federation recovers

**Success Criteria:**
- [ ] 3 spokes deploy successfully
- [ ] Token revocation propagates to all spokes within 5 seconds
- [ ] Single spoke failure doesn't affect others
- [ ] Federation recovers after Hub outage

---

## 🚀 GETTING STARTED

### Step 1: Verify Current State

```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3

# Verify recent commits
git log --oneline -6
# Expected: 15a319e6, 8c650c31, ab4a113b, 01eabc8e, a58e4557, b81b2885

# Check if services are running
./dive hub status 2>/dev/null || echo "Hub not running"
./dive spoke status tst 2>/dev/null || echo "TST spoke not running"
```

### Step 2: Deploy Fresh Environment (if needed)

```bash
# Clean slate deployment
./dive nuke all --confirm

# Deploy Hub
./dive hub deploy

# Deploy test spoke
./dive spoke deploy tst

# Verify health
curl -sk https://localhost:4200/health/detailed | jq '.status'
# Expected: "healthy"
```

### Step 3: Run Existing Tests

```bash
# Run circuit breaker suite
./tests/integration/test-deployment-resilience.sh circuit-breaker

# Expected output:
# Test Suite 6: Circuit Breaker Verification (Phase 3.2)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ✓ Circuit breaker states in health response... PASS
# ✓ All 7 services report up status... PASS
# ✓ SSL certificate trust working... PASS
# ✓ Blacklist Redis connectivity... PASS
```

### Step 4: Begin Phase 4.1 Implementation

```bash
# Open test file for editing
# File: tests/integration/test-deployment-resilience.sh

# Add new failure injection tests to suite_failure_injection()
```

---

## 🛠️ DIVE CLI REFERENCE

```bash
# Hub Operations
./dive hub deploy              # Deploy hub instance
./dive hub status              # Check hub health
./dive hub down                # Stop hub
./dive hub logs <service>      # View service logs

# Spoke Operations
./dive spoke deploy <code>     # Deploy spoke (tst, fra, deu, etc.)
./dive spoke status <code>     # Check spoke health
./dive spoke down <code>       # Stop spoke

# Certificate Operations
./dive certs sync-ca           # Sync mkcert CA to all instances
./dive certs generate <code>   # Generate certificates for instance

# Cleanup Operations
./dive nuke all --confirm      # Remove ALL containers, volumes, networks
./dive nuke hub --confirm      # Remove only hub
./dive nuke spoke <code> --confirm  # Remove specific spoke

# Debugging
./dive hub exec <command>      # Execute command in hub context
./dive spoke exec <code> <command>  # Execute in spoke context
```

---

## 📈 SUCCESS CRITERIA (Phase 4+)

### Quantitative
- [ ] Circuit breakers open within specified thresholds (OPA: 30s, Keycloak: 20s)
- [ ] Circuit breakers recover within 2 minutes of service restoration
- [ ] All 10 circuit breaker/DB alerts fire correctly
- [ ] Token revocation propagates to all instances within 5 seconds
- [ ] Test suite passes 100% consistently (3 consecutive runs)
- [ ] Test execution time < 30 minutes (full suite)

### Qualitative
- [ ] No new circuit breaker modules created (used existing)
- [ ] No static JSON files introduced
- [ ] All operations via DIVE CLI (no manual docker)
- [ ] Graceful degradation maintained during partial failures
- [ ] Documentation complete for all failure scenarios

---

## ✅ SESSION CHECKLIST

Before ending the session:
- [ ] Phase 4.1 failure injection tests implemented
- [ ] Phase 4.2 recovery tests implemented
- [ ] Phase 4.3 alert validation completed
- [ ] All tests passing consistently
- [ ] Changes committed with descriptive messages
- [ ] No manual docker commands used
- [ ] Next session handoff document created (if needed)

---

## 🔗 REFERENCE FILES

### Must-Read Before Starting
1. `backend/src/utils/circuit-breaker.ts` - TypeScript implementation
2. `scripts/dive-modules/error-recovery.sh` - Bash implementation
3. `backend/src/services/health.service.ts` - Health check logic
4. `backend/src/services/prometheus-metrics.service.ts` - Metrics definitions
5. `docker/instances/shared/config/prometheus/rules/dive-deployment.yml` - Alert rules
6. `tests/integration/test-deployment-resilience.sh` - Test patterns

### Related Documentation
- **Original Requirements:** `.cursor/NEXT_SESSION_DEPLOYMENT_RESILIENCE.md`
- **Phase 2 Handoff:** `.cursor/NEXT_SESSION_PHASE3_RESILIENCE.md`
- **Phase 3.1 Handoff:** `.cursor/NEXT_SESSION_PHASE3_INTEGRATION.md`
- **Project Conventions:** `.cursorrules`

---

## 🏗️ ARCHITECTURE SUMMARY

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DIVE V3 FEDERATION ARCHITECTURE                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│    ┌────────────────────────────────────────────────────────────────────┐   │
│    │                           HUB (USA) :4000                          │   │
│    │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │   │
│    │  │   Backend   │  │  Keycloak   │  │   Redis     │                │   │
│    │  │             │  │   :8443     │  │  Blacklist  │                │   │
│    │  │ Circuit     │  │             │  │ (Shared)    │                │   │
│    │  │ Breakers:   │  │ IdP Broker  │  │             │                │   │
│    │  │ ├─ OPA      │  │             │  │ Cross-      │                │   │
│    │  │ ├─ Keycloak │  │             │  │ Instance    │                │   │
│    │  │ ├─ MongoDB  │  │             │  │ Token       │                │   │
│    │  │ └─ KAS      │  │             │  │ Revocation  │                │   │
│    │  │             │  │             │  │             │                │   │
│    │  │ Prometheus  │  │             │  │             │                │   │
│    │  │ Metrics:    │  │             │  │             │                │   │
│    │  │ ├─ CB State │  │             │  │             │                │   │
│    │  │ ├─ DB Conns │  │             │  │             │                │   │
│    │  │ └─ Health   │  │             │  │             │                │   │
│    │  └─────────────┘  └─────────────┘  └─────────────┘                │   │
│    └────────────────────────────────────────────────────────────────────┘   │
│                                      │                                       │
│              ┌───────────────────────┼───────────────────────┐              │
│              │                       │                       │              │
│              ▼                       ▼                       ▼              │
│    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐       │
│    │   TST Spoke     │    │   FRA Spoke     │    │   DEU Spoke     │       │
│    │   :4200         │    │   :4010         │    │   :4008         │       │
│    │                 │    │                 │    │                 │       │
│    │ ✓ Connects to   │    │ ✓ Connects to   │    │ ✓ Connects to   │       │
│    │   Hub Redis     │    │   Hub Redis     │    │   Hub Redis     │       │
│    │   Blacklist     │    │   Blacklist     │    │   Blacklist     │       │
│    │                 │    │                 │    │                 │       │
│    │ ✓ Own Circuit   │    │ ✓ Own Circuit   │    │ ✓ Own Circuit   │       │
│    │   Breakers      │    │   Breakers      │    │   Breakers      │       │
│    └─────────────────┘    └─────────────────┘    └─────────────────┘       │
│                                                                              │
│    ┌────────────────────────────────────────────────────────────────────┐   │
│    │                    MONITORING STACK (Shared)                       │   │
│    │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │   │
│    │  │ Prometheus  │  │AlertManager │  │  Grafana    │                │   │
│    │  │   :9090     │  │   :9093     │  │   :3030     │                │   │
│    │  │             │  │             │  │             │                │   │
│    │  │ 30+ Alert   │  │ Inhibition  │  │ 11          │                │   │
│    │  │ Rules       │  │ Rules       │  │ Dashboards  │                │   │
│    │  │             │  │             │  │             │                │   │
│    │  │ Scrapes:    │  │ Routes:     │  │ Panels:     │                │   │
│    │  │ ├─ Hub      │  │ ├─ Critical │  │ ├─ CB State │                │   │
│    │  │ ├─ TST      │  │ ├─ Warning  │  │ ├─ DB Conns │                │   │
│    │  │ ├─ FRA      │  │ └─ Info     │  │ ├─ Health   │                │   │
│    │  │ └─ DEU      │  │             │  │ └─ Latency  │                │   │
│    │  └─────────────┘  └─────────────┘  └─────────────┘                │   │
│    └────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│    ┌────────────────────────────────────────────────────────────────────┐   │
│    │                    DATA STORES (SSOT)                              │   │
│    │                                                                    │   │
│    │  ┌─────────────────────────────┐  ┌─────────────────────────────┐ │   │
│    │  │        MongoDB              │  │       PostgreSQL            │ │   │
│    │  │   Federation Registry       │  │   Orchestration State       │ │   │
│    │  │   Resource Metadata         │  │   Circuit Breaker State     │ │   │
│    │  │   User Attributes           │  │   Deployment History        │ │   │
│    │  └─────────────────────────────┘  └─────────────────────────────┘ │   │
│    └────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

**END OF HANDOFF DOCUMENT**

**Next Action:** Begin with Step 1 (verification), then proceed to Phase 4.1 (Failure Injection Testing).

**Commit History:**
```
15a319e6 feat(resilience): Phase 3.2-3.4 - Circuit breaker metrics and integration tests
8c650c31 feat(blacklist): Add shared blacklist Redis for cross-instance token revocation
ab4a113b fix(ssl): Complete SSL/TLS and mkcert CA management fixes
01eabc8e fix(health): Phase 3.1 SSL and port calculation fixes
a58e4557 fix(health): Phase 3.1 port discovery using Docker as SSOT
b81b2885 feat(health): Phase 3.1 - Enhanced health check endpoints and alerts
ca53e28f feat(monitoring): Phase 2 monitoring and observability enhancement
a7ef3636 feat(resilience): Phase 1 production resilience enhancements
```
