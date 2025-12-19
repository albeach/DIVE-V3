# DIVE V3: KAS CLI Integration Implementation Plan

## Session Initialization Prompt

**Copy this entire document as context for a new Cursor chat session.**

---

## 1. Previous Session Context

### 1.1 Completed Work: Redis Infrastructure Integration

The previous session successfully implemented comprehensive Redis infrastructure integration for DIVE V3:

**Phase 1: CLI Foundation** ✅
- Created dedicated `scripts/dive-modules/redis.sh` CLI module (914 lines)
- Implemented commands: `status`, `status-all`, `health`, `flush`, `stats`
- Integrated Redis management into main DIVE CLI with help documentation

**Phase 2: Hub Hardening** ✅
- Password authentication via GCP Secret Manager (`dive-v3-redis-usa`)
- AOF persistence with 60s sync intervals and RDB snapshots
- Memory limits (512MB) with LRU eviction policy
- Prometheus Redis Exporter integration
- Enhanced backend health checks

**Phase 3: Shared Blacklist** ✅
- Centralized Redis instance (`shared-blacklist-redis`) for cross-instance token blacklisting
- Real-time synchronization via Redis Pub/Sub
- CLI management commands: `blacklist-status`, `blacklist-sync`, `blacklist-clear`
- Backend `token-blacklist.service.ts` integration
- Federation-ready architecture

**Phase 4: Rate Limiting** ✅
- Redis-backed distributed rate limiting (migrated from in-memory)
- Multiple limiter types: API, Auth, Upload, Admin, Strict
- Prometheus metrics for rate limit hits/blocks/active keys
- CLI monitoring commands for real-time statistics

**Phase 5: Monitoring & Observability** ✅
- Complete monitoring stack: Prometheus + Grafana + Alertmanager
- Redis exporters for both Hub and Blacklist Redis instances
- Alert rules: `RedisInstanceDown`, `RedisHighMemoryUsage`, `RedisConnectionIssues`, `RedisHighKeyspaceMisses`
- CLI commands: `redis metrics`, `redis alerts`

**Architecture Delivered:**
```
DIVE V3 Redis Infrastructure
├── Hub Compose (dive-hub)
│   └── redis (main instance)
├── Shared Compose (shared)
│   ├── blacklist-redis (federation sync)
│   ├── hub-redis-exporter (main monitoring)
│   ├── blacklist-redis-exporter (blacklist monitoring)
│   ├── prometheus (metrics collection)
│   ├── grafana (visualization)
│   └── alertmanager (alert routing)
└── CLI Integration
    └── ./dive redis [commands] (complete management)
```

**Key Files Modified/Created:**
- `scripts/dive-modules/redis.sh` - Complete Redis CLI module
- `docker-compose.hub.yml` - Redis service hardening
- `docker/instances/shared/docker-compose.yml` - Monitoring stack
- `backend/src/services/health.service.ts` - Health check integration
- `backend/src/middleware/rate-limit.middleware.ts` - Redis-backed rate limiting
- `backend/src/services/token-blacklist.service.ts` - Pub/Sub integration
- `.gitignore` - Updated with comprehensive patterns

**Branch Status:**
- Feature branch `feature/redis-cli-integration` merged to `origin/main`
- Commit: `dbea549d`

---

## 2. Project Directory Structure

```
DIVE-V3/
├── dive                                    # Main CLI entrypoint script
├── DIVE-V3-CLI-USER-GUIDE.md              # CLI documentation (1902 lines)
├── scripts/
│   └── dive-modules/
│       ├── common.sh                       # Common utilities, GCP secrets
│       ├── core.sh                         # Core Docker operations
│       ├── db.sh                           # Database operations
│       ├── deploy.sh                       # Deployment workflows
│       ├── federation.sh                   # Federation commands
│       ├── federation-setup.sh             # Federation configuration
│       ├── hub.sh                          # Hub management
│       ├── spoke.sh                        # Spoke management (NATO 32)
│       ├── redis.sh                        # Redis management ✅ NEW
│       ├── certificates.sh                 # SSL/TLS management
│       ├── terraform.sh                    # Terraform operations
│       ├── secrets.sh                      # GCP secrets management
│       ├── policy.sh                       # OPA policy management
│       ├── pilot.sh                        # Pilot VM management
│       ├── sp.sh                           # SP client registration
│       ├── status.sh                       # Status & diagnostics
│       ├── test.sh                         # Testing suite
│       └── help.sh                         # Help documentation
├── kas/                                    # Key Access Service
│   ├── src/
│   │   ├── server.ts                       # KAS main server (840 lines)
│   │   ├── fra-kas-server.ts               # France KAS variant
│   │   ├── services/
│   │   │   └── kas-federation.service.ts   # Multi-KAS federation
│   │   ├── types/
│   │   │   └── kas.types.ts                # KAS type definitions
│   │   ├── utils/
│   │   │   ├── jwt-validator.ts            # RS256 JWT verification
│   │   │   ├── kas-logger.ts               # Structured logging
│   │   │   ├── kas-metrics.ts              # Prometheus metrics
│   │   │   ├── kas-federation.ts           # Federation utilities
│   │   │   ├── kas-registry-loader.ts      # Registry loading
│   │   │   ├── circuit-breaker.ts          # Resilience pattern
│   │   │   ├── rate-limiter.ts             # Token bucket limiter
│   │   │   ├── replay-protection.ts        # Nonce validation
│   │   │   ├── retry.ts                    # Exponential backoff
│   │   │   └── hsm-provider.ts             # HSM abstraction
│   │   └── __tests__/
│   │       ├── dek-generation.test.ts      # DEK tests (14 tests)
│   │       ├── jwt-verification.test.ts    # JWT tests (13 tests)
│   │       └── kas-federation.test.ts      # Federation tests (32 tests)
│   ├── config/
│   │   └── kas-registry.json               # Local KAS registry
│   ├── certs/                              # KAS certificates
│   ├── logs/                               # KAS log files
│   ├── Dockerfile                          # Production Dockerfile
│   ├── Dockerfile.dev                      # Development Dockerfile
│   ├── Dockerfile.fra                      # France variant
│   ├── package.json                        # Dependencies
│   └── tsconfig.json                       # TypeScript config
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── kas.routes.ts               # KAS proxy routes
│   │   │   └── health.routes.ts            # Health endpoints (includes KAS)
│   │   ├── services/
│   │   │   ├── kas-registry.service.ts     # Cross-instance KAS registry
│   │   │   ├── ztdf-multi-kas.service.ts   # Multi-KAS ZTDF support
│   │   │   ├── ztdf-export.service.ts      # ZTDF export
│   │   │   └── health.service.ts           # Health checks
│   │   ├── utils/
│   │   │   ├── cross-kas-client.ts         # Cross-KAS HTTP client
│   │   │   └── ztdf.utils.ts               # ZTDF utilities
│   │   └── controllers/
│   │       └── resource.controller.ts      # Resource + KAS integration
├── frontend/
│   ├── src/
│   │   ├── components/ztdf/
│   │   │   ├── KASRequestModal.tsx         # KAS key request UI
│   │   │   ├── KASFlowVisualizer.tsx       # KAS flow visualization
│   │   │   ├── KASExplainer.tsx            # KAS education
│   │   │   └── KAOSelector.tsx             # KAO selection
│   │   └── app/api/kas/
│   │       └── request-key/route.ts        # Next.js KAS API route
├── config/
│   ├── kas-registry.json                   # Global KAS registry
│   └── kas-registry.json.example           # Registry template
├── docker-compose.hub.yml                  # Hub services (includes KAS)
├── policies/
│   └── org/nato/
│       ├── acp240.rego                     # ACP-240 policy (KAS rules)
│       └── classification.rego             # Classification policy
└── monitoring/
    └── grafana/dashboards/
        └── kas-federation.json             # KAS Grafana dashboard
```

---

## 3. Current KAS Implementation Status

### 3.1 Fully Implemented Features

#### Core KAS Server (`kas/src/server.ts`)
- **Policy-Bound Key Release**: Re-evaluates OPA authorization before key release
- **ACP-240 Compliance**: Implements NATO data-centric security
- **Fail-Closed Enforcement**: Denies on policy failure or service unavailability
- **Comprehensive Audit Logging**: Per ACP-240 Section 6

#### Key Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/request-key` | POST | Main key request endpoint |
| `/federated/request-key` | POST | Cross-instance federation |
| `/federation/status` | GET | Federation health status |
| `/federation/registry` | GET | List registered KAS instances |
| `/health` | GET | Health check with dependency verification |
| `/metrics` | GET | Prometheus metrics |
| `/metrics/json` | GET | JSON metrics (debugging) |

#### Security Implementation
- **RS256 JWT Verification**: JWKS-based signature verification
- **Token Expiration Validation**: Prevents replay attacks
- **Issuer/Audience Validation**: Cross-realm attack prevention
- **Circuit Breaker**: Prevents cascading failures
- **Rate Limiting**: Token bucket algorithm (100 req/min per subject)
- **Replay Protection**: Nonce validation with TTL caching

#### Multi-KAS Federation
- **Cross-Instance Key Requests**: Distributed KAS architectures
- **Policy Translation**: Automatic clearance mapping between nations
- **Federation Agreements**: Bilateral trust relationships
- **KAS Registry**: Dynamic discovery of trusted KAS instances
- **Multi-KAO ZTDF**: Support for multiple Key Access Objects

#### Test Coverage
```
Test Suites: 3 passed, 3 total
Tests:       59 passed, 59 total
- DEK Generation: 14 tests ✅
- JWT Verification: 13 tests ✅
- KAS Federation: 32 tests ✅
```

### 3.2 Docker Compose Integration

**Current KAS service in `docker-compose.hub.yml`:**
```yaml
kas:
  build:
    context: ./kas
    dockerfile: Dockerfile
  container_name: ${COMPOSE_PROJECT_NAME}-kas
  restart: unless-stopped
  healthcheck:
    test: ["CMD-SHELL", "wget --no-check-certificate -q -O- https://localhost:8080/health || exit 1"]
  environment:
    NODE_ENV: development
    KAS_PORT: 8080
    HTTPS_ENABLED: "true"
    # ... environment variables
  networks:
    - hub-internal
  volumes:
    - ./kas/certs:/opt/app/certs:ro
    - ./kas/src:/app/src
    - ./kas/logs:/app/logs
  command: npm run dev
```

### 3.3 Backend Integration Points

#### KAS Routes (`backend/src/routes/kas.routes.ts`)
- `POST /api/kas/request-key` - Proxies to internal KAS
- `GET /api/kas/health` - KAS proxy health check

#### KAS Registry Service (`backend/src/services/kas-registry.service.ts`)
- Loads `config/kas-registry.json` for cross-instance discovery
- Initializes authenticated HTTP clients per KAS
- Periodic health checks (30s interval)
- Cross-KAS key requests with retry logic

### 3.4 What's Missing from CLI

**CRITICAL GAP: The DIVE CLI (`./dive`) has NO KAS management commands!**

Current CLI modules:
- ✅ `hub` - Hub management
- ✅ `spoke` - Spoke management
- ✅ `redis` - Redis management
- ✅ `federation` - Federation commands
- ✅ `policy` - Policy management
- ✅ `certs` - Certificate management
- ❌ **`kas` - NO KAS module exists**

---

## 4. Gap Analysis: CLI Integration Requirements

### 4.1 Missing CLI Commands

#### Core KAS Management
| Command | Priority | Description |
|---------|----------|-------------|
| `./dive kas status` | P0 | Show KAS service status (health, version, features) |
| `./dive kas health` | P0 | Detailed health check (deps, metrics, connectivity) |
| `./dive kas logs` | P0 | View KAS logs (with follow mode) |
| `./dive kas restart` | P1 | Restart KAS service |
| `./dive kas config` | P1 | Show current KAS configuration |

#### Registry Management
| Command | Priority | Description |
|---------|----------|-------------|
| `./dive kas registry list` | P0 | List all registered KAS instances |
| `./dive kas registry show <id>` | P1 | Show details for a KAS instance |
| `./dive kas registry health` | P0 | Health check all registered KAS |
| `./dive kas registry add <config>` | P2 | Add new KAS to registry |
| `./dive kas registry remove <id>` | P2 | Remove KAS from registry |

#### Federation Management
| Command | Priority | Description |
|---------|----------|-------------|
| `./dive kas federation status` | P0 | Show federation status |
| `./dive kas federation verify` | P0 | Verify cross-KAS connectivity |
| `./dive kas federation trust show` | P1 | Show trust matrix |
| `./dive kas federation test <target>` | P1 | Test key request to target KAS |

#### Key Operations (Admin/Debug)
| Command | Priority | Description |
|---------|----------|-------------|
| `./dive kas cache status` | P1 | Show DEK cache statistics |
| `./dive kas cache flush` | P2 | Flush DEK cache (dangerous) |
| `./dive kas metrics` | P1 | Query KAS Prometheus metrics |
| `./dive kas audit [filter]` | P2 | Query KAS audit logs |

#### Spoke KAS Deployment
| Command | Priority | Description |
|---------|----------|-------------|
| `./dive spoke kas init <code>` | P0 | Initialize KAS for a spoke |
| `./dive spoke kas status <code>` | P0 | Check spoke KAS status |
| `./dive spoke kas register <code>` | P1 | Register spoke KAS with Hub |

### 4.2 Missing Configuration

1. **GCP Secrets for KAS**
   - `dive-v3-kas-signing-key` - KAS JWT signing key
   - `dive-v3-kas-encryption-key` - KEK for DEK wrapping
   - Need to verify/create these secrets

2. **Spoke KAS Docker Compose**
   - Template for spoke KAS deployment
   - Port allocation per NATO country

3. **KAS Registry Auto-Update**
   - Spoke registration should update `kas-registry.json`
   - Federation setup should configure trust matrix

### 4.3 Missing User Guide Documentation

The CLI User Guide (`DIVE-V3-CLI-USER-GUIDE.md`) needs a new "KAS Management" section:
- All KAS CLI commands
- Usage examples
- Troubleshooting guide
- Architecture reference

---

## 5. Phased Implementation Plan

### Phase 1: KAS CLI Module Foundation (Days 1-2)

**SMART Goal:** Create `scripts/dive-modules/kas.sh` with core status/health/logs commands, achieving 100% basic functionality coverage.

**Success Criteria:**
- [ ] `./dive kas status` returns KAS service status
- [ ] `./dive kas health` performs detailed health check
- [ ] `./dive kas logs` displays KAS logs with follow mode
- [ ] `./dive kas config` shows KAS configuration
- [ ] All commands work for Hub and Spoke instances
- [ ] CLI User Guide updated with KAS section

**Tasks:**
1. Create `scripts/dive-modules/kas.sh` with module structure
2. Implement `get_kas_container()` helper (Hub vs Spoke)
3. Implement `kas_status` function
4. Implement `kas_health` function (check OPA, backend, JWKS)
5. Implement `kas_logs` function
6. Implement `kas_config` function
7. Add `kas)` case to main `dive` script
8. Update `DIVE-V3-CLI-USER-GUIDE.md`

**Testing:**
```bash
./dive kas status
./dive kas health
./dive kas logs -f
./dive kas config
./dive --instance pol kas status  # Spoke test
```

---

### Phase 2: Registry Management (Days 3-4)

**SMART Goal:** Implement full KAS registry management with list/show/health commands, supporting all 4 initially configured KAS instances.

**Success Criteria:**
- [ ] `./dive kas registry list` shows all 4 KAS instances (USA, FRA, GBR, DEU)
- [ ] `./dive kas registry show usa-kas` displays detailed info
- [ ] `./dive kas registry health` checks all KAS health
- [ ] Registry can be viewed from any instance (Hub or Spoke)
- [ ] Health check results color-coded (green/red)

**Tasks:**
1. Implement `kas_registry_list` function (parse `config/kas-registry.json`)
2. Implement `kas_registry_show` function
3. Implement `kas_registry_health` function (parallel health checks)
4. Add registry subcommand parsing to `kas.sh`
5. Format output with tables and colors
6. Update CLI User Guide

**Testing:**
```bash
./dive kas registry list
./dive kas registry show usa-kas
./dive kas registry show fra-kas
./dive kas registry health
```

---

### Phase 3: Federation Verification (Days 5-6)

**SMART Goal:** Implement federation status and verification commands with cross-KAS connectivity testing, achieving <500ms average test latency.

**Success Criteria:**
- [ ] `./dive kas federation status` shows federation health
- [ ] `./dive kas federation verify` tests all trust relationships
- [ ] `./dive kas federation test usa-kas fra-kas` verifies bilateral trust
- [ ] Federation verification completes in <10 seconds
- [ ] Clear reporting of pass/fail with reasons

**Tasks:**
1. Implement `kas_federation_status` function
2. Implement `kas_federation_verify` function (tests trust matrix)
3. Implement `kas_federation_test` function (specific KAS pair)
4. Query KAS `/federation/status` endpoint
5. Query KAS `/federation/registry` endpoint
6. Parse and display trust matrix
7. Update CLI User Guide

**Testing:**
```bash
./dive kas federation status
./dive kas federation verify
./dive kas federation test usa-kas fra-kas
./dive kas federation test usa-kas gbr-kas
```

---

### Phase 4: Spoke KAS Deployment (Days 7-9)

**SMART Goal:** Enable automated KAS deployment for any of the 32 NATO spoke instances with registry auto-registration.

**Success Criteria:**
- [ ] `./dive spoke kas init POL` initializes Poland KAS
- [ ] `./dive spoke kas status POL` shows KAS status
- [ ] KAS registry automatically updated on spoke registration
- [ ] Trust matrix automatically configured for new spokes
- [ ] Spoke KAS accessible from Hub

**Tasks:**
1. Create KAS spoke Docker Compose template
2. Implement `spoke_kas_init` function in `spoke.sh`
3. Implement `spoke_kas_status` function
4. Implement `spoke_kas_register` function
5. Update `kas-registry.json` on spoke registration
6. Update trust matrix on spoke registration
7. Create GCP secrets for spoke KAS
8. Update CLI User Guide

**Testing:**
```bash
./dive spoke kas init POL
./dive spoke up --with-kas
./dive spoke kas status POL
./dive spoke kas register POL
./dive kas registry list  # Should show pol-kas
./dive kas federation verify  # Should include POL
```

---

### Phase 5: Metrics & Observability (Days 10-11)

**SMART Goal:** Implement comprehensive KAS monitoring integration with Prometheus/Grafana and CLI metrics commands.

**Success Criteria:**
- [ ] `./dive kas metrics` shows real-time KAS metrics
- [ ] `./dive kas cache status` shows DEK cache statistics
- [ ] KAS metrics visible in Grafana dashboard
- [ ] Prometheus alerts for KAS issues
- [ ] Audit log querying available

**Tasks:**
1. Implement `kas_metrics` function (query Prometheus)
2. Implement `kas_cache_status` function
3. Implement `kas_audit` function (query logs)
4. Add KAS exporter to shared monitoring stack
5. Update Prometheus scrape config for KAS
6. Add KAS panels to Grafana dashboard
7. Define KAS alert rules
8. Update CLI User Guide

**Testing:**
```bash
./dive kas metrics
./dive kas cache status
./dive kas audit --last 100
./dive kas alerts
```

---

### Phase 6: Production Hardening (Days 12-14)

**SMART Goal:** Harden KAS for production with complete GCP secrets integration, secure certificate management, and comprehensive testing.

**Success Criteria:**
- [ ] All KAS secrets stored in GCP Secret Manager
- [ ] KAS certificates properly managed
- [ ] Zero hardcoded credentials anywhere
- [ ] All 59 KAS tests passing
- [ ] E2E federation test passing
- [ ] Performance targets met (<200ms p95)

**Tasks:**
1. Verify/create all GCP secrets for KAS
2. Update KAS to use GCP secrets utility
3. Implement certificate rotation for KAS
4. Run full KAS test suite
5. Run E2E federation test
6. Performance testing (latency, throughput)
7. Security audit (no hardcoded secrets)
8. Final CLI User Guide update

**Testing:**
```bash
# Full test suite
cd kas && npm test

# E2E federation test
./dive test kas-federation

# Performance test
./dive kas stress-test --concurrent 100

# Security audit
./dive kas audit-secrets
```

---

## 6. Testing Suite Requirements

### 6.1 Unit Tests
- All CLI functions should have basic input validation tests
- Mock KAS endpoints for offline testing

### 6.2 Integration Tests
- KAS ↔ OPA connectivity
- KAS ↔ Backend connectivity
- KAS ↔ Keycloak JWKS
- Cross-KAS federation

### 6.3 E2E Tests
- Full key request flow
- Multi-KAS resource access
- Federation trust verification
- Audit log generation

### 6.4 Regression Tests
After each phase, run:
```bash
# Existing KAS tests
cd kas && npm test

# Redis integration (ensure no regression)
./dive redis status-all
./dive redis health

# Federation tests
./dive federation status
./dive spoke verify-federation

# Full health check
./dive health
```

---

## 7. Important Instructions

### 7.1 Environment & Permissions

You have explicit approval to use:
- ✅ **GCloud CLI** - Secret management, compute operations
- ✅ **GitHub CLI** - Branch management, commits, PRs
- ✅ **Keycloak CLI/API** - Realm configuration, client management
- ✅ **Docker/Docker Compose** - Container orchestration
- ✅ **Terraform** - Infrastructure as code
- ✅ **curl/wget** - API testing

### 7.2 Docker Resources

**ALL Docker resources contain fake/dummy data and can be nuked/recreated as needed:**
- Containers, volumes, networks can be destroyed and rebuilt
- Use `./dive nuke` if environment is in bad state
- Use `./dive reset` for clean redeployment

### 7.3 Code Standards

Follow DIVE V3 conventions from `.cursorrules`:
- TypeScript strict mode
- No hardcoded secrets (use GCP Secret Manager)
- Structured logging with Winston/Pino
- Fail-closed security model
- ISO 3166-1 alpha-3 country codes (USA, FRA, GBR, DEU)

### 7.4 Git Workflow

1. Create feature branch: `feature/kas-cli-integration`
2. Small, focused commits with conventional format
3. Test each phase before moving to next
4. Merge to `main` when complete

### 7.5 Secrets Management

**GCP Project:** `dive25`
**Naming Convention:** `dive-v3-<type>-<instance>`

Existing KAS-related secrets to verify:
- `dive-v3-kas-signing-key`
- `dive-v3-keycloak-client-secret`

New secrets to create if needed:
- `dive-v3-kas-<country>` for spoke KAS instances

---

## 8. Quick Reference

### Start Hub with KAS
```bash
./dive hub deploy
# KAS runs on port 8080 inside hub-internal network
```

### Check KAS Health (current method)
```bash
docker exec -it dive-hub-kas wget -qO- http://localhost:8080/health | jq
```

### View KAS Logs
```bash
docker logs -f dive-hub-kas
```

### Test Key Request
```bash
curl -X POST https://localhost:8080/request-key \
  -H "Content-Type: application/json" \
  -d '{
    "resourceId": "doc-123",
    "kaoId": "kao-1",
    "bearerToken": "eyJ..."
  }'
```

### KAS Registry Location
```bash
cat config/kas-registry.json | jq '.kasServers[].kasId'
# Output: "usa-kas", "fra-kas", "gbr-kas", "deu-kas"
```

---

## 9. Begin Implementation

**Your mission:** Implement comprehensive KAS CLI integration following the phased plan above. Start with Phase 1 (KAS CLI Module Foundation) and proceed through each phase, running extensive testing after each to ensure no regression.

**First step:** Create the feature branch and begin implementing `scripts/dive-modules/kas.sh`.

```bash
git checkout -b feature/kas-cli-integration
```

Good luck! 🔑🚀
