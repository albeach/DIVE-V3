# DIVE V3 - Redis Integration & CLI Alignment Session

## Session Overview

This session focuses on fully integrating Redis configuration and management into the DIVE CLI (`./dive`) and ensuring alignment with the CLI User Guide. The goal is to create a unified, resilient, and persistent Redis infrastructure across the Hub and all Spoke instances.

---

## Part 1: Previous Session Context

### What Was Accomplished

The previous session focused on **Federation Troubleshooting Integration** into the DIVE CLI:

1. **Created `scripts/dive-modules/certificates.sh`** - Certificate management module with:
   - `check_mkcert_ready()` - Verify mkcert prerequisites
   - `prepare_federation_certificates()` - Complete certificate setup
   - `verify_federation_certificates()` - Verification commands
   - `install_mkcert_ca_in_hub/spoke()` - Truststore CA installation

2. **Created `scripts/dive-modules/federation-setup.sh`** - Federation configuration module with:
   - `register_spoke_in_hub()` - 7-step workflow to register spoke as IdP in Hub
   - `configure_spoke_federation()` - 5-step workflow for spoke→Hub federation
   - `sync_opa_trusted_issuers()` - OPA policy synchronization
   - `fix_realm_issuer()` - Realm issuer URL correction
   - Comprehensive verification and batch operations

3. **Fixed Critical Issues**:
   - Federation login/logout flows (redirect URIs, post-logout URIs)
   - PKCE configuration for Hub→Spoke IdP
   - Attribute mapping for federated users (syncMode=FORCE)
   - Keycloak theme detection for federated logins
   - Classification equivalency mapping for all 32 NATO countries
   - COI coherence policy refinement

4. **Updated CLI User Guide** (`DIVE-V3-CLI-USER-GUIDE.md`) with:
   - Certificate Management section (9 commands)
   - Federation Setup section (13 commands)
   - Updated command reference summary

### Key Files Modified/Created

```
scripts/dive-modules/
├── certificates.sh          # NEW - Certificate management
├── federation-setup.sh      # NEW - Federation configuration
├── spoke.sh                 # Modified - Integrated federation steps
└── hub.sh                   # Modified - Hub CA installation

policies/
├── org/nato/classification.rego  # Added 32 NATO country mappings
├── coi_coherence_policy.rego     # Made releasability check a warning
└── org/nato/acp240.rego          # Removed duplicate COI violation rule

keycloak/themes/dive-v3/login/template.ftl  # Fixed federation detection
```

---

## Part 2: Project Directory Structure

```
DIVE-V3/
├── dive                          # Main CLI entrypoint
├── DIVE-V3-CLI-USER-GUIDE.md     # CLI documentation
├── backend/
│   ├── src/
│   │   ├── services/
│   │   │   ├── redis-cluster.service.ts         # Redis Sentinel/Cluster support
│   │   │   ├── token-blacklist.service.ts       # Shared blacklist across instances
│   │   │   ├── decision-cache-cluster.service.ts # OPA decision caching
│   │   │   ├── federation-cache.service.ts      # Federated search caching
│   │   │   ├── otp-redis.service.ts             # OTP pending secrets
│   │   │   ├── authorization-code.service.ts    # OAuth authorization codes
│   │   │   └── connection-pool.service.ts       # Connection pooling
│   │   ├── middleware/
│   │   │   ├── rate-limit.middleware.ts         # API rate limiting (no Redis store)
│   │   │   └── sp-rate-limit.middleware.ts      # SP client rate limiting
│   │   └── config/
│   │       └── performance-config.ts            # Redis configuration
│   └── package.json
├── docker-compose.hub.yml        # Hub Redis configuration
├── docker-compose.yml            # Legacy compose
├── instances/
│   ├── usa/                      # Hub instance
│   ├── rou/                      # Romania spoke (running)
│   ├── bel/                      # Belgium spoke (running)
│   ├── dnk/                      # Denmark spoke (running)
│   └── [other spokes]/
├── scripts/
│   ├── dive-modules/
│   │   ├── common.sh             # REDIS_PASSWORD secret loading
│   │   ├── hub.sh                # Hub Redis health checks
│   │   ├── spoke.sh              # Spoke Redis configuration
│   │   ├── deploy.sh             # Volume management
│   │   ├── core.sh               # Container references
│   │   ├── certificates.sh       # Certificate management
│   │   └── federation-setup.sh   # Federation configuration
│   └── nato-countries.sh         # NATO database with port offsets
├── k8s/
│   ├── base/redis/               # Kubernetes Redis base
│   └── overlays/*/redis/         # Country-specific Redis overlays
├── docker/
│   └── redis-cluster.yml         # Redis cluster configuration
└── monitoring/
    └── prometheus-multi-instance.yml  # Redis metrics
```

---

## Part 3: Existing Redis Code Audit

### Backend Services Using Redis

| Service | File | Purpose | Redis Features Used |
|---------|------|---------|---------------------|
| **RedisClusterService** | `redis-cluster.service.ts` | Core Redis client | Sentinel, connection pooling, health monitoring, pub/sub |
| **TokenBlacklistService** | `token-blacklist.service.ts` | Shared token blacklist | Pub/Sub propagation, TTL expiration, cross-instance sync |
| **DecisionCacheClusterService** | `decision-cache-cluster.service.ts` | OPA decision caching | Classification-based TTL, distributed invalidation |
| **FederationCacheService** | `federation-cache.service.ts` | Federated search caching | User-aware keys, circuit breaker |
| **OTPRedisService** | `otp-redis.service.ts` | OTP pending secrets | TTL expiration (10 min) |
| **AuthorizationCodeService** | `authorization-code.service.ts` | OAuth authorization codes | TTL expiration |

### Docker Compose Redis Configurations

| File | Redis Service | Features |
|------|---------------|----------|
| `docker-compose.hub.yml` | `redis:7-alpine` | Basic standalone, no password |
| `instances/*/docker-compose.yml` | `redis-{code}:alpine` | Password protected, per-spoke volumes |
| `docker/redis-cluster.yml` | Redis Cluster | Multi-node cluster (unused) |

### CLI Redis References

| Module | Commands | Coverage |
|--------|----------|----------|
| `common.sh` | Secret loading | `REDIS_PASSWORD` from GCP |
| `hub.sh` | Health checks | `redis-cli ping` |
| `spoke.sh` | Health checks, deploy | Password generation, volume management |
| `deploy.sh` | Volume cleanup | `redis_data` volume removal |

### Rate Limiting (NOT Redis-backed)

The `rate-limit.middleware.ts` uses **in-memory** store:
```typescript
// Current: express-rate-limit with memory store
export const apiRateLimiter = rateLimit({
    windowMs: 900000,  // 15 minutes
    max: 100,
    // NOTE: Using default memory store, not Redis
});
```

---

## Part 4: Gap Analysis

### ❌ Missing CLI Commands

| Gap | Description | Priority |
|-----|-------------|----------|
| **No `redis` module** | No dedicated CLI module for Redis management | HIGH |
| **No `redis status`** | Cannot check Redis health across instances | HIGH |
| **No `redis flush`** | Cannot clear Redis caches | MEDIUM |
| **No `redis stats`** | Cannot view Redis metrics | MEDIUM |
| **No `redis sentinel`** | Cannot manage Sentinel configuration | LOW |

### ❌ Missing Infrastructure

| Gap | Description | Priority |
|-----|-------------|----------|
| **No shared blacklist Redis** | Hub Redis used locally only | HIGH |
| **No Redis password in Hub** | Hub Redis has no authentication | HIGH |
| **No Redis persistence** | Hub Redis has no AOF/RDB persistence | MEDIUM |
| **No Redis monitoring** | No Prometheus/Grafana integration | MEDIUM |
| **No rate-limit Redis store** | Rate limiting uses memory, doesn't scale | MEDIUM |

### ❌ Missing Integration

| Gap | Description | Priority |
|-----|-------------|----------|
| **Spoke Redis not connected to Hub** | Spokes use isolated Redis | HIGH |
| **No centralized blacklist** | Token revocation doesn't propagate | HIGH |
| **No Redis health in `/health`** | Backend health doesn't check Redis | MEDIUM |
| **No Redis in spoke verification** | `spoke verify` doesn't check Redis deeply | MEDIUM |

### ❌ Documentation Gaps

| Gap | Description | Priority |
|-----|-------------|----------|
| **No Redis section in CLI Guide** | Commands not documented | HIGH |
| **No Redis troubleshooting** | No troubleshooting guide | MEDIUM |
| **No Redis architecture diagram** | No visual documentation | LOW |

---

## Part 5: Phased Implementation Plan

### Phase 1: Redis CLI Module Foundation (Day 1)

**SMART Goals:**
- **S**pecific: Create `scripts/dive-modules/redis.sh` with core commands
- **M**easurable: 6 commands implemented and working
- **A**chievable: Based on existing patterns in `hub.sh` and `spoke.sh`
- **R**elevant: Enables Redis management via CLI
- **T**ime-bound: Complete by end of Day 1

**Tasks:**
1. Create `scripts/dive-modules/redis.sh` with:
   - `module_redis_help()` - Help documentation
   - `redis_status()` - Show Redis status for Hub/Spoke
   - `redis_status_all()` - Show Redis status for all instances
   - `redis_health()` - Detailed health check
   - `redis_flush()` - Flush Redis caches
   - `redis_stats()` - Show Redis statistics

2. Register module in `dive` script

3. Update `DIVE-V3-CLI-USER-GUIDE.md` with Redis section

**Success Criteria:**
- [ ] `./dive redis status` shows Hub Redis status
- [ ] `./dive redis status rou` shows ROU spoke Redis status
- [ ] `./dive redis status-all` shows all instances
- [ ] `./dive redis health` passes for Hub
- [ ] `./dive redis flush usa` clears Hub caches
- [ ] All commands documented in CLI guide

---

### Phase 2: Hub Redis Hardening (Day 2)

**SMART Goals:**
- **S**pecific: Add password, persistence, and monitoring to Hub Redis
- **M**easurable: Hub Redis passes security audit
- **A**chievable: Standard Redis configuration
- **R**elevant: Security requirement for production
- **T**ime-bound: Complete by end of Day 2

**Tasks:**
1. Update `docker-compose.hub.yml`:
   - Add `requirepass` with GCP Secret Manager integration
   - Add AOF persistence configuration
   - Add memory limits
   - Add Prometheus metrics exporter

2. Update `scripts/dive-modules/common.sh`:
   - Add `REDIS_PASSWORD_USA` to Hub secret loading
   - Add validation for Redis password

3. Update backend Redis connections:
   - Add password authentication to all Redis clients
   - Add graceful degradation when Redis unavailable

4. Create Redis health endpoint:
   - Add `/health/redis` endpoint in backend
   - Include Redis in main `/health` check

**Success Criteria:**
- [ ] Hub Redis requires password authentication
- [ ] Hub Redis persists data on restart
- [ ] Backend connects with password
- [ ] `/health` includes Redis status
- [ ] `./dive redis health` shows detailed metrics

---

### Phase 3: Shared Blacklist Redis (Day 3)

**SMART Goals:**
- **S**pecific: Deploy centralized blacklist Redis accessible by all spokes
- **M**easurable: Token revocation propagates in <1 second
- **A**chievable: Redis Pub/Sub already implemented in code
- **R**elevant: Critical security feature for federation
- **T**ime-bound: Complete by end of Day 3

**Tasks:**
1. Create shared blacklist Redis service:
   - Add `redis-blacklist` service to Hub compose
   - Configure for cross-network access
   - Add to `dive-v3-shared-network`

2. Update spoke configurations:
   - Add `BLACKLIST_REDIS_URL` to spoke `.env`
   - Update `_create_spoke_docker_compose()` in `spoke.sh`
   - Integrate into `spoke deploy` workflow

3. Update CLI commands:
   - Add `./dive redis blacklist status`
   - Add `./dive redis blacklist sync`
   - Add `./dive redis blacklist clear`

4. Update token-blacklist.service.ts:
   - Verify Pub/Sub subscription on startup
   - Add health check for blacklist Redis

**Success Criteria:**
- [ ] Shared blacklist Redis running on Hub
- [ ] All spokes connect to shared blacklist
- [ ] Token revocation on USA propagates to ROU in <1s
- [ ] `./dive redis blacklist status` shows all connected instances
- [ ] Logout on one instance invalidates session on all

---

### Phase 4: Rate Limiting with Redis Store (Day 4)

**SMART Goals:**
- **S**pecific: Migrate rate limiting from memory to Redis store
- **M**easurable: Rate limits persist across backend restarts
- **A**chievable: Well-documented express-rate-limit Redis integration
- **R**elevant: Required for horizontal scaling
- **T**ime-bound: Complete by end of Day 4

**Tasks:**
1. Install Redis store package:
   - Add `rate-limit-redis` to backend dependencies
   - Configure with RedisClusterService

2. Update rate-limit.middleware.ts:
   - Add Redis store configuration
   - Add fallback to memory store if Redis unavailable
   - Add distributed rate limit tracking

3. Update CLI commands:
   - Add `./dive redis rate-limits show`
   - Add `./dive redis rate-limits reset <ip>`
   - Add rate limit stats to `./dive redis stats`

4. Add monitoring:
   - Export rate limit metrics to Prometheus
   - Add rate limit dashboard to Grafana

**Success Criteria:**
- [ ] Rate limits survive backend restart
- [ ] Rate limits shared across backend replicas
- [ ] `./dive redis rate-limits show` displays current limits
- [ ] Memory store fallback works when Redis down
- [ ] Prometheus shows rate limit metrics

---

### Phase 5: Redis Monitoring & Observability (Day 5)

**SMART Goals:**
- **S**pecific: Full Redis monitoring with Prometheus and Grafana
- **M**easurable: All Redis instances monitored with alerts
- **A**chievable: Redis Exporter is standard tooling
- **R**elevant: Required for operations and debugging
- **T**ime-bound: Complete by end of Day 5

**Tasks:**
1. Deploy Redis Exporter:
   - Add `redis-exporter` to Hub compose
   - Configure for all Redis instances
   - Add scrape config to Prometheus

2. Create Grafana Dashboard:
   - Memory usage, connections, operations
   - Pub/Sub message rates
   - Cache hit/miss ratios
   - Blacklist token counts

3. Configure Alerts:
   - High memory usage (>80%)
   - Connection failures
   - Replication lag (if Sentinel)
   - Pub/Sub subscription failures

4. Update CLI commands:
   - Add `./dive redis metrics`
   - Add `./dive redis alerts`

**Success Criteria:**
- [ ] Redis Exporter running and accessible
- [ ] Prometheus scraping Redis metrics
- [ ] Grafana dashboard showing all Redis instances
- [ ] Alerts configured for critical Redis issues
- [ ] `./dive redis metrics` shows key statistics

---

## Part 6: Testing Strategy

### Unit Tests

For each phase, create corresponding tests:

```bash
# Phase 1: CLI Module Tests
./dive redis status --dry-run
./dive redis health 2>&1 | grep -q "PONG"
./dive redis stats | grep -q "connected_clients"

# Phase 2: Security Tests
docker exec dive-hub-redis redis-cli AUTH wrong_password 2>&1 | grep -q "NOAUTH"
docker exec dive-hub-redis redis-cli CONFIG GET appendonly | grep -q "yes"

# Phase 3: Blacklist Tests
./dive redis blacklist status | grep -q "connected: 3"
# Revoke token on USA, verify on ROU
curl -X POST https://localhost:4000/api/auth/logout
curl https://localhost:4068/api/auth/check-blacklist/${JTI} | grep -q "blacklisted"

# Phase 4: Rate Limit Tests
for i in {1..110}; do curl -s https://localhost:4000/api/resources; done
curl -s https://localhost:4000/api/resources | grep -q "Too Many Requests"
./dive redis rate-limits show | grep -q "ip: 127.0.0.1"

# Phase 5: Monitoring Tests
curl http://localhost:9121/metrics | grep -q "redis_up 1"
curl http://localhost:3000/grafana/api/dashboards/uid/redis | grep -q "Redis"
```

### Integration Tests

```bash
# Federation + Redis Test Suite
./dive test redis-integration

# Tests:
# 1. Start Hub and 2 spokes (ROU, BEL)
# 2. Login on USA as testuser-usa-1
# 3. Federate to ROU, verify session
# 4. Logout on USA
# 5. Verify token blacklisted on ROU within 1s
# 6. Verify rate limits shared across backends
# 7. Verify cache invalidation propagates
```

### Regression Tests

```bash
# Run after each phase to ensure no regression
./dive test unit           # Backend unit tests
./dive test federation     # Federation E2E tests
./dive health              # Overall health check
./dive hub verify          # Hub 10-point verification
./dive spoke verify-federation  # All spoke verification
```

---

## Part 7: Environment & Permissions

### Available Tools

You have explicit approval to use:
- **gcloud CLI** - GCP Secret Manager, Compute Engine
- **gh CLI** - GitHub operations
- **docker** / **docker compose** - Container management
- **terraform** - Infrastructure as Code
- **kcadm.sh** - Keycloak Admin CLI (via docker exec)
- **redis-cli** - Redis CLI (via docker exec)
- **curl** - HTTP requests
- **jq** - JSON processing

### Key Reminders

1. **All Docker resources contain dummy data** - Feel free to nuke/recreate as needed
2. **Use DIVE CLI** - Always prefer `./dive` commands over direct `docker exec`
3. **Follow NATO port convention** - Redis ports follow offset pattern (6379 + offset)
4. **GCP Secrets** - Never hardcode passwords; use GCP Secret Manager
5. **Persistent solutions** - All changes must survive container restarts

### Running Instances

```bash
# Check current state
./dive ps
./dive hub status
./dive spoke status-all
```

---

## Part 8: Success Criteria Summary

| Phase | Key Deliverable | Verification Command |
|-------|-----------------|---------------------|
| 1 | Redis CLI module | `./dive redis help` |
| 2 | Hub Redis secured | `./dive redis health` |
| 3 | Shared blacklist | `./dive redis blacklist status` |
| 4 | Redis rate limits | `./dive redis rate-limits show` |
| 5 | Redis monitoring | `./dive redis metrics` |

### Definition of Done

- [ ] All CLI commands work for Hub and all running spokes
- [ ] CLI User Guide updated with Redis section
- [ ] All tests passing (unit, integration, regression)
- [ ] No hardcoded secrets
- [ ] Changes committed and pushed to GitHub

---

## Quick Start Commands

```bash
# Start with audit
./dive redis status-all  # (will fail until Phase 1 complete)
docker exec dive-hub-redis redis-cli ping  # Verify Hub Redis running

# Check existing Redis services
docker ps | grep redis
cat instances/rou/.env | grep REDIS

# View existing Redis code
cat backend/src/services/redis-cluster.service.ts
cat backend/src/services/token-blacklist.service.ts
```

---

**Document Version:** 1.0.0  
**Created:** December 16, 2025  
**Based on:** DIVE V3 Federation Integration Session

