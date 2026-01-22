# DIVE V3 - OPAL JWT Authentication Implementation

**Session Date:** 2026-01-22  
**Previous Commits:** `ed9c50de`, `7dc301eb`, `c53b8324`  
**Status:** OPAL Data Service MongoDB Integration COMPLETE ✅ | JWT-based OPAL Push Auth REQUIRED

---

## 🎯 SESSION OBJECTIVE

Implement proper JWT-based OPAL authentication for real-time data push from Hub backend to OPAL server. Currently, `opalClient.publishInlineData()` returns 401 because the OPAL server expects a JWT token, not the raw master token.

**Current State:** OPAL client polling works (data syncs on restart); push notifications fail with 401.  
**Target State:** Hub backend can push real-time data updates to OPAL server, which propagates to all connected spoke OPAL clients in real-time.

---

## 🚨 CRITICAL CONSTRAINTS (NON-NEGOTIABLE)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         NON-NEGOTIABLE REQUIREMENTS                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ✅ DIVE CLI ONLY     - Use ./dive commands exclusively for ALL operations  │
│                        NO manual docker/docker-compose commands              │
│                        Scripts location: scripts/dive-modules/               │
│                                                                              │
│  ✅ DATABASE = SSOT   - MongoDB for all dynamic configuration data          │
│                        NO static JSON files for runtime data (NO DUAL-WRITE)│
│                        .env files ONLY for secrets/environment config       │
│                                                                              │
│  ✅ EXISTING INFRA    - Prometheus/Grafana/AlertManager ALREADY EXISTS      │
│                        Location: docker/instances/shared/                    │
│                        DO NOT recreate or duplicate                          │
│                                                                              │
│  ✅ ENHANCE EXISTING  - OPAL token logic already exists in opal-token.service│
│                        DO NOT create duplicate implementations               │
│                        AUDIT existing code FIRST, then enhance               │
│                                                                              │
│  ✅ BEST PRACTICE     - No shortcuts, workarounds, or "quick fixes"         │
│                        Full testing suite required for all changes           │
│                        Solutions must be resilient and persistent            │
│                                                                              │
│  ✅ CLEAN SLATE OK    - All data is DUMMY/FAKE                              │
│                        ./dive nuke all --confirm AUTHORIZED                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📋 BACKGROUND CONTEXT

### Recent Session Work (2026-01-22)

1. **MongoDB SSOT Refactor (Commit `ed9c50de`):**
   - Refactored `opal-data.service.ts` to use `mongoOpalDataStore` instead of static JSON files
   - Eliminated `EROFS: read-only file system` errors
   - All trusted issuers, federation matrix, tenant configs now stored in MongoDB

2. **Trusted Issuer URL Fix (Commit `7dc301eb`):**
   - Fixed issuer URL registration to use public URLs (e.g., `https://localhost:8643`) instead of Docker internal URLs
   - Added test country code support (`TST`, `DEV`, `STG`, `QA1`, `QA2`) to `nato-attribute-mappings.json`

3. **Current Issue Discovered:**
   - Hub backend's `opal-client.ts` sends raw `OPAL_AUTH_MASTER_TOKEN` to OPAL server
   - OPAL server expects a JWT obtained from `/token` endpoint
   - Push notifications fail with 401: `{"error":"Could not decode access token"}`

### OPAL Authentication Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    OPAL TOKEN AUTHENTICATION FLOW                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  MASTER TOKEN (Secret):                                                      │
│    - Stored in .env as OPAL_AUTH_MASTER_TOKEN                               │
│    - Used ONLY to request JWTs from /token endpoint                         │
│    - NEVER sent directly to /data/config or other API endpoints             │
│    - Example: "b4016abc123..."                                              │
│                                                                              │
│  JWT TOKEN (Client credential):                                              │
│    - Obtained by POSTing to /token with master token                        │
│    - Contains claims: { peer_type: 'client', expired: '<timestamp>' }       │
│    - Signed with RS256 algorithm                                            │
│    - Has expiration (typically 1 year)                                      │
│    - Example: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."                     │
│    - Used in Authorization header for all OPAL API calls                    │
│                                                                              │
│  Correct Flow:                                                               │
│    1. Client sends: POST /token { Authorization: Bearer <master_token> }    │
│    2. Server returns: { token: "eyJ...", details: { expired: "..." } }      │
│    3. Client uses JWT: POST /data/config { Authorization: Bearer <jwt> }    │
│                                                                              │
│  Current Bug (Hub Backend):                                                  │
│    1. Client sends: POST /data/config { Authorization: Bearer <master> }    │
│    2. Server returns: 401 "Could not decode access token"                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔍 EXISTING LOGIC AUDIT

### ✅ WORKING - opal-token.service.ts (REUSE THIS)

**File:** `backend/src/services/opal-token.service.ts`  
**Status:** COMPLETE - Correctly fetches JWT from OPAL server

```typescript
class OPALTokenService {
  private masterToken: string;
  private opalServerUrl: string;

  constructor() {
    this.masterToken = process.env.OPAL_AUTH_MASTER_TOKEN || '';
    this.opalServerUrl = process.env.OPAL_SERVER_URL || 'https://opal-server:7002';
  }

  // CORRECTLY uses master token to get JWT
  async generateClientToken(spokeId: string, instanceCode: string): Promise<IOPALClientToken> {
    const response = await this.fetchOPALToken();
    return {
      token: response.token,  // This IS the JWT (eyJ...)
      expiresAt: new Date(response.details.expired),
      clientId: response.details.id,
      type: 'opal_client'
    };
  }

  private async fetchOPALToken(): Promise<IOPALTokenResponse> {
    const response = await fetch(`${this.opalServerUrl}/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.masterToken}`,  // Master token HERE
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ type: 'client' })
    });
    return await response.json();  // Returns JWT
  }
}

export const opalTokenService = new OPALTokenService();
```

### ❌ BROKEN - opal-client.ts (NEEDS FIX)

**File:** `backend/src/services/opal-client.ts`  
**Status:** Uses raw master token instead of JWT

```typescript
class OPALClient {
  private config: IOPALClientConfig;

  constructor(config: Partial<IOPALClientConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    // BUG: this.config.clientToken = OPAL_CLIENT_TOKEN = raw master token
  }

  private async fetchWithRetry(url: string, options: RequestInit = {}): Promise<Response> {
    const fetchOptions: RequestInit = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
        // BUG: Uses raw master token - OPAL expects JWT here!
        ...(this.config.clientToken && { 
          'Authorization': `Bearer ${this.config.clientToken}` 
        })
      }
    };
    // ...
  }
}
```

### ✅ COMPLETE - opal-data.service.ts (MongoDB SSOT)

**File:** `backend/src/services/opal-data.service.ts`  
**Status:** Already refactored to use MongoDB - NO CHANGES NEEDED

```typescript
// Uses mongoOpalDataStore for all operations
import { mongoOpalDataStore } from '../models/trusted-issuer.model';

async updateTrustedIssuer(issuerUrl: string, issuer: ITrustedIssuer): Promise<IOPALPublishResult> {
  // SSOT: Uses MongoDB
  await mongoOpalDataStore.addIssuer({ ... });
  const allIssuers = await mongoOpalDataStore.getIssuersForOpal();
  return opalClient.publishInlineData('trusted_issuers', allIssuers, ...);
}
```

### ✅ COMPLETE - mongoOpalDataStore (MongoDB SSOT)

**File:** `backend/src/models/trusted-issuer.model.ts`  
**Status:** COMPLETE - All OPAL data stored in MongoDB

| Method | Purpose |
|--------|---------|
| `addIssuer()` | Add trusted issuer to MongoDB |
| `updateIssuer()` | Update existing issuer |
| `removeIssuer()` | Remove issuer |
| `getIssuersForOpal()` | Get all issuers formatted for OPAL |
| `setFederationTrust()` | Set federation matrix |
| `addFederationTrust()` | Add bidirectional trust |
| `getFederationMatrix()` | Get full federation matrix |
| `setTenantConfig()` | Set tenant configuration |
| `getAllTenantConfigs()` | Get all tenant configs |

---

## 📊 EXISTING INFRASTRUCTURE (DO NOT RECREATE)

### Monitoring Stack (docker/instances/shared/)

```
docker/instances/shared/
├── docker-compose.yml              # Prometheus, Grafana, AlertManager
└── config/
    ├── prometheus.yml               # Scrape configs for all instances
    ├── alertmanager.yml             # Alert routing with inhibition rules
    ├── prometheus/
    │   └── rules/
    │       ├── dive-deployment.yml  # 30+ alert rules (CB, DB, health)
    │       ├── kas.yml              # KAS-specific alerts
    │       └── redis.yml            # Redis alerts
    └── grafana/
        └── provisioning/
            ├── dashboards/          # 11 dashboards
            │   ├── authorization-decisions.json
            │   ├── cache-performance.json
            │   ├── compliance-overview.json
            │   ├── dive-v3-overview.json
            │   ├── federation-metrics.json
            │   ├── hub-overview.json
            │   ├── kas-dashboard.json
            │   ├── kas-federation.json
            │   ├── opal-policy-distribution.json
            │   └── redis-dashboard.json
            └── datasources/
                └── datasources.yml  # Prometheus datasource
```

### Prometheus Metrics (backend/src/services/prometheus-metrics.service.ts)

| Category | Metrics |
|----------|---------|
| Circuit Breakers | `dive_v3_circuit_breaker_state`, `_failures`, `_rejects_total` |
| Database | `dive_v3_db_connections_active`, `_idle`, `_total`, `_errors_total` |
| Authorization | `dive_v3_authorization_decision_latency_seconds`, `_decisions_total` |
| Cache | `dive_v3_cache_operations_total`, `_hit_rate`, `_size`, `_evictions` |
| Federation | `dive_v3_federation_logins_total`, `_latency_seconds`, `_sessions` |
| KAS | `dive_v3_kas_key_operations_total`, `_latency_seconds` |

### Circuit Breakers (backend/src/utils/circuit-breaker.ts)

```typescript
// Pre-configured instances - DO NOT CREATE NEW ONES
export const opaCircuitBreaker = new CircuitBreaker({ name: 'OPA', failureThreshold: 5, timeout: 60000 });
export const keycloakCircuitBreaker = new CircuitBreaker({ name: 'Keycloak', failureThreshold: 3, timeout: 30000 });
export const mongoCircuitBreaker = new CircuitBreaker({ name: 'MongoDB', failureThreshold: 5, timeout: 60000 });
export const kasCircuitBreaker = new CircuitBreaker({ name: 'KAS', failureThreshold: 3, timeout: 30000 });
```

---

## 📁 PROJECT DIRECTORY STRUCTURE

```
DIVE-V3/
├── .cursor/
│   ├── NEXT_SESSION_OPAL_JWT_AUTH.md         # THIS DOCUMENT
│   ├── NEXT_SESSION_PHASE4_TESTING.md        # Previous phase testing
│   └── NEXT_SESSION_DEPLOYMENT_RESILIENCE.md # Original resilience requirements
│
├── scripts/
│   ├── dive                                   # Main CLI entrypoint (USE THIS)
│   └── dive-modules/
│       ├── common.sh                          # Port calculation, utilities
│       ├── certificates.sh                    # Certificate management
│       ├── error-recovery.sh                  # Bash circuit breaker
│       ├── orchestration-framework.sh         # Deployment orchestration
│       ├── orchestration-state-db.sh          # PostgreSQL state management
│       ├── hub/
│       │   ├── deploy.sh                      # ./dive hub deploy
│       │   ├── status.sh                      # ./dive hub status
│       │   └── ...
│       └── spoke/
│           ├── spoke-deploy.sh                # ./dive spoke deploy <code>
│           ├── status.sh                      # ./dive spoke status <code>
│           ├── pipeline/
│           │   ├── phase-configuration.sh     # Spoke config phases
│           │   ├── phase-deployment.sh        # Container deployment
│           │   ├── phase-federation.sh        # Federation setup
│           │   └── spoke-secrets.sh           # Secret synchronization
│           └── ...
│
├── backend/
│   └── src/
│       ├── services/
│       │   ├── opal-client.ts                 # ❌ NEEDS FIX - Use JWT
│       │   ├── opal-token.service.ts          # ✅ WORKING - Fetches JWT
│       │   ├── opal-data.service.ts           # ✅ COMPLETE - MongoDB SSOT
│       │   ├── health.service.ts              # Health checks + metrics
│       │   ├── prometheus-metrics.service.ts  # All Prometheus metrics
│       │   ├── federation-bootstrap.service.ts# Federation initialization
│       │   ├── hub-spoke-registry.service.ts  # Spoke management
│       │   └── token-blacklist.service.ts     # Cross-instance revocation
│       ├── models/
│       │   └── trusted-issuer.model.ts        # ✅ MongoDB SSOT store
│       ├── utils/
│       │   └── circuit-breaker.ts             # TypeScript circuit breakers
│       └── controllers/
│           └── health.controller.ts           # Health API endpoints
│
├── docker/
│   └── instances/
│       └── shared/
│           ├── docker-compose.yml             # Monitoring stack
│           └── config/                        # Prometheus, Grafana, AlertManager
│
├── templates/
│   └── spoke/
│       └── docker-compose.template.yml        # Spoke container template
│
├── instances/
│   ├── usa/                                   # Hub instance
│   ├── tst/                                   # Test spoke
│   └── .../                                   # Other spokes
│
└── tests/
    ├── integration/
    │   ├── test-deployment-resilience.sh      # Main resilience test suite
    │   ├── test-ssot-compliance.sh            # Database SSOT verification
    │   └── federation-flow.sh                 # Federation E2E
    ├── federation/
    │   ├── test-clean-slate.sh                # Clean slate deployment
    │   └── test-federation-e2e.sh             # Federation tests
    └── e2e/
        └── federation/                        # Playwright/E2E tests
```

---

## 📖 LESSONS LEARNED

### 1. Existing Infrastructure is Comprehensive
The codebase has robust implementations. **ALWAYS audit before creating new code.**
- Circuit breakers exist in both TypeScript and Bash
- Prometheus/Grafana/AlertManager already configured
- `opalTokenService` already correctly fetches JWTs

### 2. SSOT Architecture is Established
MongoDB is the single source of truth. **NO static JSON files for runtime data.**
- `mongoOpalDataStore` handles all OPAL data
- No dual-write patterns needed
- `.env` files only for secrets

### 3. Port Calculation Complexity
Port offsets vary by country type. **Use `get_instance_ports()` from `common.sh`.**
- NATO: 0-29, Partner: 30-39, Custom (TST): 200+

### 4. Certificate Management
Each developer has their own mkcert CA. **Run `./dive certs sync-ca` after clone.**

### 5. DIVE CLI is Mandatory
**NO manual docker commands.** All operations via `./dive`:
```bash
./dive hub deploy              # Deploy hub
./dive spoke deploy tst        # Deploy spoke
./dive nuke all --confirm      # Clean slate
./dive hub status              # Health check
```

### 6. OPAL Token Flow
- **Master token** → Request JWT from `/token` endpoint
- **JWT** → Use for all subsequent API calls
- **Never** send master token directly to `/data/config`

---

## 🔍 SCOPE GAP ANALYSIS

### ✅ COMPLETED (No Changes Needed)

| Feature | Status | Evidence |
|---------|--------|----------|
| MongoDB SSOT for OPAL data | ✅ | `opal-data.service.ts` uses `mongoOpalDataStore` |
| Trusted issuer URL fix | ✅ | Public URLs registered (`localhost:8643`) |
| Test country code support | ✅ | TST, DEV, STG, QA1, QA2 in mappings |
| Prometheus metrics | ✅ | `prometheus-metrics.service.ts` complete |
| Grafana dashboards | ✅ | 11 dashboards in `docker/instances/shared/` |
| Circuit breakers | ✅ | TypeScript + Bash implementations |
| Health check endpoints | ✅ | All 7 services report status |

### ❌ REQUIRED (This Session)

| Feature | Priority | Complexity | Description |
|---------|----------|------------|-------------|
| **JWT Authentication for opal-client.ts** | HIGH | LOW | Import `opalTokenService`, use JWT instead of master token |
| **JWT Caching and Refresh** | HIGH | MEDIUM | Cache JWT, refresh before expiry |
| **Startup Timing Handling** | MEDIUM | MEDIUM | Retry JWT init if OPAL server not ready |

### ❌ NOT NEEDED (Confirmed)

| Feature | Reason |
|---------|--------|
| Static JSON files | MongoDB is SSOT |
| New circuit breaker modules | Already exist |
| New Prometheus/Grafana setup | Already in `docker/instances/shared/` |
| Dual-write patterns | Database is authoritative |
| Manual docker commands | DIVE CLI handles everything |

---

## 🛠️ PHASED IMPLEMENTATION PLAN

### PHASE 1: Enhance opal-client.ts with JWT Support

**SMART Goal:** Implement JWT authentication in `opal-client.ts` within 1 hour, achieving 100% success rate for OPAL publish operations.

**Tasks:**

1. **Import opalTokenService** (5 min)
   ```typescript
   // backend/src/services/opal-client.ts
   import { opalTokenService } from './opal-token.service';
   ```

2. **Add JWT State Management** (15 min)
   ```typescript
   class OPALClient {
     private jwt: string | null = null;
     private jwtExpiry: Date | null = null;
     private jwtInitPromise: Promise<void> | null = null;
   }
   ```

3. **Implement JWT Refresh Method** (15 min)
   ```typescript
   private async refreshJwt(): Promise<void> {
     const tokenData = await opalTokenService.generateClientToken(
       'hub-backend',
       process.env.INSTANCE_CODE || 'USA'
     );
     this.jwt = tokenData.token;
     this.jwtExpiry = tokenData.expiresAt;
   }
   ```

4. **Implement ensureJwt() with Auto-Refresh** (15 min)
   ```typescript
   private async ensureJwt(): Promise<string | null> {
     // Check expiry with 5-minute buffer
     if (this.jwt && this.jwtExpiry) {
       const bufferMs = 5 * 60 * 1000;
       if (new Date() < new Date(this.jwtExpiry.getTime() - bufferMs)) {
         return this.jwt;
       }
     }
     await this.refreshJwt();
     return this.jwt;
   }
   ```

5. **Modify fetchWithRetry() to Use JWT** (10 min)
   ```typescript
   private async fetchWithRetry(url: string, options: RequestInit = {}): Promise<Response> {
     const jwt = await this.ensureJwt();
     const fetchOptions: RequestInit = {
       ...options,
       headers: {
         'Content-Type': 'application/json',
         ...options.headers,
         ...(jwt && { 'Authorization': `Bearer ${jwt}` })  // JWT, not master token
       }
     };
     // ...
   }
   ```

**Success Criteria:**
- [ ] `opal-client.ts` imports and uses `opalTokenService`
- [ ] JWT is cached and refreshed before expiry
- [ ] No compilation errors

---

### PHASE 2: Add Startup Initialization with Retry

**SMART Goal:** Implement robust JWT initialization that handles OPAL server startup timing, with 5 retry attempts over 25 seconds.

**Tasks:**

1. **Implement initializeJwt() with Retry** (20 min)
   ```typescript
   private async initializeJwt(): Promise<void> {
     if (this.jwtInitPromise) return this.jwtInitPromise;
     
     this.jwtInitPromise = (async () => {
       for (let attempt = 1; attempt <= 5; attempt++) {
         try {
           await this.refreshJwt();
           if (this.jwt) {
             logger.info('OPAL client JWT initialized', { attempt, expiresAt: this.jwtExpiry });
             return;
           }
         } catch (error) {
           logger.warn(`OPAL JWT init attempt ${attempt}/5 failed`, { error: error.message });
           await new Promise(r => setTimeout(r, 5000));
         }
       }
       logger.error('Failed to initialize OPAL JWT after 5 attempts');
     })();
     
     return this.jwtInitPromise;
   }
   ```

2. **Call initializeJwt() in Constructor** (5 min)
   ```typescript
   constructor(config: Partial<IOPALClientConfig> = {}) {
     // ... existing code ...
     if (this.isEnabled) {
       this.initializeJwt();  // Async init
     }
   }
   ```

3. **Ensure ensureJwt() Waits for Init** (5 min)
   ```typescript
   private async ensureJwt(): Promise<string | null> {
     if (this.jwtInitPromise) {
       await this.jwtInitPromise;
     }
     // ... rest of method
   }
   ```

**Success Criteria:**
- [ ] JWT initialization retries up to 5 times
- [ ] Backend starts successfully even if OPAL server is slow
- [ ] Graceful degradation if JWT cannot be obtained

---

### PHASE 3: Clean Slate Testing

**SMART Goal:** Verify JWT authentication works end-to-end with a clean slate deployment, achieving 100% pass rate on OPAL publish operations.

**Verification Steps:**

```bash
# Step 1: Clean slate
./dive nuke all --confirm

# Step 2: Deploy Hub
./dive hub deploy

# Step 3: Verify JWT acquisition
docker logs dive-hub-backend 2>&1 | grep -i "OPAL.*JWT"
# Expected: "OPAL client JWT initialized"

# Step 4: Deploy spoke
./dive spoke deploy tst

# Step 5: Verify no 401 errors
docker logs dive-hub-backend 2>&1 | grep "401" | grep -i opal
# Expected: No output

# Step 6: Verify publish success
docker logs dive-hub-backend 2>&1 | grep -i "published successfully"
# Expected: "OPAL data update published successfully"

# Step 7: Verify spoke OPA has all issuers
curl -ks https://localhost:10181/v1/data/trusted_issuers | jq '.result.trusted_issuers | keys'
# Expected: ["https://localhost:8443/...", "https://localhost:8643/..."]
```

**Success Criteria:**
- [ ] Hub deploys with 11/11 healthy containers
- [ ] Spoke deploys with 9/9 healthy containers
- [ ] Backend logs show "OPAL client JWT initialized"
- [ ] No 401 errors in backend logs
- [ ] Spoke OPA has all trusted issuers without restart

---

### PHASE 4: Integration Test Suite

**SMART Goal:** Create automated tests for OPAL JWT authentication, achieving 100% test coverage for the new functionality.

**File:** `tests/integration/test-opal-jwt-auth.sh`

```bash
#!/bin/bash
# OPAL JWT Authentication Integration Tests

source "$(dirname "$0")/../../scripts/dive-modules/common.sh"

test_jwt_initialization() {
    echo "Testing JWT initialization..."
    docker logs dive-hub-backend 2>&1 | grep -q "OPAL client JWT initialized"
    assert_exit_code 0 "JWT initialization should succeed"
}

test_no_401_errors() {
    echo "Testing no 401 errors..."
    local errors=$(docker logs dive-hub-backend 2>&1 | grep "401" | grep -i opal | wc -l)
    assert_equals 0 "$errors" "Should have no OPAL 401 errors"
}

test_publish_success() {
    echo "Testing OPAL publish success..."
    docker logs dive-hub-backend 2>&1 | grep -q "published successfully"
    assert_exit_code 0 "OPAL publish should succeed"
}

test_spoke_receives_data() {
    echo "Testing spoke receives trusted issuers..."
    local count=$(curl -ks https://localhost:10181/v1/data/trusted_issuers | jq '.result.trusted_issuers | keys | length')
    assert_greater_than "$count" 1 "Spoke should have multiple trusted issuers"
}

# Run all tests
run_test_suite "OPAL JWT Authentication"
```

**Success Criteria:**
- [ ] All 4 tests pass consistently
- [ ] Tests integrated into `tests/integration/test-deployment-resilience.sh`

---

### PHASE 5: Commit and Push

**Commit Message:**
```
fix(opal): Use JWT for Hub backend OPAL authentication

- Enhanced opal-client.ts to use opalTokenService for JWT generation
- Added JWT caching with automatic refresh before expiry
- Added retry logic for OPAL server startup timing
- Removed dependency on OPAL_CLIENT_TOKEN environment variable

This fixes the 401 error when Hub backend publishes data to OPAL server,
enabling real-time push notifications to spoke OPAL clients.

Tested with clean slate deployment:
- Hub: 11/11 containers healthy
- Spoke: 9/9 containers healthy
- JWT acquired successfully
- OPAL publish operations succeed without 401 errors
- Spoke OPA receives all trusted issuers in real-time
```

---

## ✅ SUCCESS CRITERIA (Complete Session)

### Quantitative
- [ ] `opal-client.ts` uses `opalTokenService` for JWT
- [ ] JWT cached and refreshed with 5-minute buffer before expiry
- [ ] Startup retry: 5 attempts over 25 seconds
- [ ] `publishInlineData()` returns `success: true` (not 401)
- [ ] New trusted issuers appear in spoke OPA within 30 seconds
- [ ] All integration tests pass (100%)
- [ ] Clean slate deployment succeeds: Hub 11/11, Spoke 9/9 containers

### Qualitative
- [ ] No static JSON files for OPAL data (MongoDB is SSOT)
- [ ] Uses existing `opalTokenService` (no duplicate code)
- [ ] Proper error handling and logging
- [ ] Graceful degradation if OPAL server unavailable
- [ ] All operations via DIVE CLI (no manual docker commands)

---

## 🚀 GETTING STARTED

### Step 1: Verify Current State

```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3

# Check latest commit
git log --oneline -1
# Expected: c53b8324 docs: Comprehensive OPAL JWT Auth session handoff

# Verify DIVE CLI works
./dive --help
```

### Step 2: Read Existing Services

```bash
# Understand existing token service (WORKING - USE IT)
code backend/src/services/opal-token.service.ts

# Understand current opal-client (NEEDS FIX)
code backend/src/services/opal-client.ts
```

### Step 3: Implement Phase 1

```bash
# Edit opal-client.ts to import and use opalTokenService
# Follow Phase 1 implementation plan above
```

### Step 4: Test with Clean Slate

```bash
./dive nuke all --confirm
./dive hub deploy
./dive spoke deploy tst

# Verify
docker logs dive-hub-backend 2>&1 | grep -i "OPAL.*JWT"
docker logs dive-hub-backend 2>&1 | grep "401" | grep -i opal
```

### Step 5: Commit and Push

```bash
git add backend/src/services/opal-client.ts
git commit -m "fix(opal): Use JWT for Hub backend OPAL authentication"
git push
```

---

## 🔗 DIVE CLI REFERENCE

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

# Cleanup Operations
./dive nuke all --confirm      # Remove ALL containers, volumes, networks
./dive nuke hub --confirm      # Remove only hub
./dive nuke spoke <code> --confirm  # Remove specific spoke

# Testing
./tests/integration/test-deployment-resilience.sh  # Run resilience tests
```

---

## 📊 DATA FLOW (After Fix)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CORRECTED DATA FLOW                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. BACKEND STARTUP                                                          │
│     ┌─────────────┐    ┌───────────────┐    ┌──────────────┐                │
│     │  OPALClient │───▶│opalTokenService│───▶│ OPAL Server  │               │
│     │ constructor │    │generateClient │    │   /token     │               │
│     │             │    │Token()        │    │              │               │
│     │             │◀───│               │◀───│ Returns JWT  │               │
│     │ Store JWT   │    │               │    │ (eyJ...)     │               │
│     └─────────────┘    └───────────────┘    └──────────────┘               │
│                                                                              │
│  2. DATA PUBLISH (NOW WORKS)                                                 │
│     ┌─────────────────────────────────────────────────────────┐             │
│     │            opal-data.service.ts                         │             │
│     │  updateTrustedIssuer() -> MongoDB + opal-client.ts      │             │
│     └─────────────────────────────────────────────────────────┘             │
│                           │                                                  │
│                           ▼                                                  │
│     ┌─────────────────────────────────────────────────────────┐             │
│     │              opal-client.ts                             │             │
│     │  publishInlineData()                                    │             │
│     │  ✅ ensureJwt() gets valid JWT                         │             │
│     │  ✅ Sends: Authorization: Bearer <JWT>                 │             │
│     └─────────────────────────────────────────────────────────┘             │
│                           │                                                  │
│                           ▼ (200 OK)                                         │
│     ┌─────────────────────────────────────────────────────────┐             │
│     │              OPAL Server (:7002)                        │             │
│     │  /data/config endpoint                                  │             │
│     │  Validates JWT ✓                                        │             │
│     │  Notifies connected clients via pub/sub                 │             │
│     └─────────────────────────────────────────────────────────┘             │
│                           │                                                  │
│                           ▼ (Push notification)                              │
│     ┌─────────────────────────────────────────────────────────┐             │
│     │          Spoke OPAL Clients                             │             │
│     │  Receive push notification                              │             │
│     │  Fetch updated data from Hub /api/opal/* endpoints      │             │
│     └─────────────────────────────────────────────────────────┘             │
│                           │                                                  │
│                           ▼                                                  │
│     ┌─────────────────────────────────────────────────────────┐             │
│     │              Spoke OPA                                  │             │
│     │  Updated trusted_issuers, federation_matrix             │             │
│     │  REAL-TIME SYNC ✓                                      │             │
│     └─────────────────────────────────────────────────────────┘             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🏗️ ARCHITECTURE CONTEXT

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DIVE V3 FEDERATION ARCHITECTURE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│    HUB (USA) - Port 4000                                                     │
│    ┌────────────────────────────────────────────────────────────────────┐   │
│    │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │   │
│    │  │ Backend  │  │ Keycloak │  │  MongoDB │  │ Redis    │           │   │
│    │  │  :4000   │  │  :8443   │  │  :27017  │  │ Blacklist│           │   │
│    │  └──────────┘  └──────────┘  └──────────┘  └──────────┘           │   │
│    │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │   │
│    │  │   OPA    │  │  OPAL    │  │   KAS    │  │Authzforce│           │   │
│    │  │  :8181   │  │ Server   │  │  :65432  │  │          │           │   │
│    │  │          │  │  :7002   │  │          │  │          │           │   │
│    │  └──────────┘  └──────────┘  └──────────┘  └──────────┘           │   │
│    │  ┌──────────┐  ┌──────────┐  ┌──────────┐                         │   │
│    │  │ Frontend │  │PostgreSQL│  │  Redis   │                         │   │
│    │  │  :3000   │  │  :5432   │  │  :6379   │                         │   │
│    │  └──────────┘  └──────────┘  └──────────┘                         │   │
│    └────────────────────────────────────────────────────────────────────┘   │
│                                      │                                       │
│              ┌───────────────────────┼───────────────────────┐              │
│              │                       │                       │              │
│              ▼                       ▼                       ▼              │
│    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐       │
│    │   TST Spoke     │    │   FRA Spoke     │    │   DEU Spoke     │       │
│    │   Port 4200     │    │   Port 4010     │    │   Port 4008     │       │
│    │                 │    │                 │    │                 │       │
│    │ 9 containers:   │    │ 9 containers:   │    │ 9 containers:   │       │
│    │ - Backend       │    │ - Backend       │    │ - Backend       │       │
│    │ - Keycloak      │    │ - Keycloak      │    │ - Keycloak      │       │
│    │ - OPA           │    │ - OPA           │    │ - OPA           │       │
│    │ - OPAL Client   │    │ - OPAL Client   │    │ - OPAL Client   │       │
│    │ - MongoDB       │    │ - MongoDB       │    │ - MongoDB       │       │
│    │ - PostgreSQL    │    │ - PostgreSQL    │    │ - PostgreSQL    │       │
│    │ - Redis         │    │ - Redis         │    │ - Redis         │       │
│    │ - KAS           │    │ - KAS           │    │ - KAS           │       │
│    │ - Frontend      │    │ - Frontend      │    │ - Frontend      │       │
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
│    │  └─────────────┘  └─────────────┘  └─────────────┘                │   │
│    └────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

**END OF SESSION HANDOFF**

**Next Action:** Implement JWT-based authentication in `opal-client.ts` using existing `opalTokenService`. Follow Phase 1 implementation plan.

**Commit History:**
```
c53b8324 docs: Comprehensive OPAL JWT Auth session handoff
ed9c50de refactor(opal): Use MongoDB instead of static JSON files for OPAL data
7dc301eb fix(federation): Correct trusted issuer URL and add test code support
5dd20ca9 feat(ssot): remove static JSON seeding - MongoDB is single source of truth
```
