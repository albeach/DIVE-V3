# DIVE V3 Federation - Complete Handoff & Implementation Prompt

**Project**: DIVE V3 - Coalition ICAM Platform
**Session Date**: December 19, 2025
**Status**: Infrastructure deployed, federation partially working, E2E automation incomplete
**Authorization**: All data is DUMMY/FAKE - you are authorized to nuke Docker resources for clean slate testing

---

## 📋 EXECUTIVE SUMMARY

DIVE V3 is a coalition-friendly Identity & Access Management web application demonstrating federated identity across USA/NATO partners. The project uses a Hub-and-Spoke architecture where a central USA Hub federates with multiple NATO nation Spokes for cross-border Single Sign-On (SSO).

**Current State**:
- ✅ USA Hub + ESP (Spain) + ITA (Italy) deployed and federating
- ❌ Federation is NOT 100% resilient or automated with `@dive` CLI
- ❌ New spoke deployment (Poland) revealed critical automation gaps
- ❌ Keycloak authentication failures preventing auto-linking of IdPs

**Your Mission**: Fix federation automation to be 100% resilient, persistent, and aligned with `@dive` CLI best practices, then implement comprehensive testing.

---

## 🎯 CONTEXT: WHAT WAS ACCOMPLISHED

### Session 1: Initial Deployment (Dec 19, 2025)

1. **Deployed USA Hub + 2 Spokes (ESP, ITA)**
   - Used: `./dive hub up`, `./dive --instance esp spoke up`, `./dive --instance ita spoke up`
   - Result: 29 containers running (11 hub + 9 ESP + 9 ITA)

2. **Fixed Infrastructure Issues**
   - **Container Health Check Timeouts**: Fixed naming pattern mismatch in `_spoke_wait_for_services()`
   - **KAS HTTPS Configuration**: Added `CERT_PATH`, `KEY_FILE`, `CERT_FILE` environment variables
   - **OPAL Client Hub Connectivity**: Changed default from production URL to `dive-hub-opal-server:7002`
   - **Federation Status Display**: Made environment-aware to show localhost URLs

3. **Discovered Critical Bug: USA Hub Had No IdPs**
   - Root Cause: `./dive federation register-spoke` only updated JSON file, NOT hub MongoDB database
   - Fix: Manually registered ESP/ITA via `/api/federation/register` and approved with `autoLinkIdP: true`
   - Result: `esp-idp` and `ita-idp` successfully created in Hub Keycloak

4. **Tested Resilience: Deployed Poland (POL) Spoke**
   - ❌ **FAILED**: POL did NOT auto-register with hub
   - ❌ `autoLinkIdP: true` failed with "HTTP 401 Unauthorized"
   - ❌ `./dive federation link POL` also failed with 401
   - **Conclusion**: Federation is NOT 100% resilient or automated

### Key Files Modified:
- `docker/base/services.yml` - Fixed health checks, KAS HTTPS config
- `scripts/dive-modules/spoke.sh` - Fixed container naming patterns, OPAL DNS
- `scripts/dive-modules/federation.sh` - Environment-aware status display
- `instances/esp/.env`, `instances/ita/.env` - Removed hardcoded `HUB_OPAL_URL`

### Documentation Created:
- `DEPLOYMENT_COMPLETE.md` - Infrastructure deployment summary
- `FEDERATION_BUG_FIX.md` - Manual ESP/ITA federation setup
- `FEDERATION_RESILIENCE_ASSESSMENT.md` - E2E test results and identified bugs
- `HANDOFF_PROMPT.md` - This document

---

## 🐛 CRITICAL BUGS IDENTIFIED

### Bug #1: `spoke up` Does NOT Auto-Register with Hub
**Location**: `scripts/dive-modules/spoke.sh` → `spoke_up()` → `scripts/spoke-init/init-all.sh`

**Issue**:
- `./dive spoke up` creates containers and runs `init-all.sh`
- `init-all.sh` only syncs federation secrets (if hub running)
- Does NOT call `/api/federation/register` to register in hub database
- Does NOT call `spoke_register()` function

**Evidence**:
```bash
$ ./dive --instance pol spoke up  # Deploys successfully
$ curl -sk https://localhost:4000/api/federation/spokes | jq '.spokes[].instanceCode'
"ITA"
"ESP"
# POL is missing - not registered
```

**Impact**: Every new spoke requires manual API calls to register, defeating the purpose of `@dive` CLI automation.

---

### Bug #2: Backend Keycloak Authentication Fails During Auto-Link
**Location**: `backend/src/services/hub-spoke-registry.service.ts` → `createFederationIdP()`

**Issue**:
- When `autoLinkIdP: true` is set during spoke approval
- Backend tries to create `{spoke}-idp` in Hub Keycloak
- Gets admin token using "fallback password for development"
- Keycloak returns "HTTP 401 Unauthorized"
- IdP creation silently fails (warning logged, but spoke approved anyway)

**Evidence**:
```json
{
  "error": "HTTP 401 Unauthorized",
  "level": "error",
  "message": "Failed to auto-link IdP during spoke approval",
  "spokeId": "spoke-pol-91f65044",
  "warning": "Spoke approved but IdP not linked - use `dive federation link` manually"
}
```

**Root Cause**: `getKeycloakAdminPassword()` function returns wrong password or wrong admin URL is used.

**Impact**: `autoLinkIdP` feature is broken, no IdPs created automatically.

---

### Bug #3: `federation link` Command Also Fails
**Location**: `scripts/dive-modules/federation.sh` → `federation_link()`

**Issue**: The `./dive federation link POL` command also fails with 401 when calling `/api/federation/link-idp`.

**Evidence**:
```bash
$ ./dive federation link POL
Step 1: Adding POL IdP to USA Keycloak
⚠️  Step 1 result: {"success":false,"error":"Failed to link Identity Provider","message":"HTTP 401 Unauthorized"}
```

**Impact**: No CLI-based workaround available - must use Keycloak admin UI manually.

---

### Bug #4: Two-Layer Registration Confusion
**Issue**: DIVE has TWO separate registration systems that aren't integrated:

1. **`register_spoke_in_hub()`** in `federation-setup.sh`:
   - Directly manipulates Hub Keycloak via admin API
   - Creates `{spoke}-idp` manually
   - Used by: Step 7 of `spoke_init_start()` (but often unavailable)

2. **`/api/federation/register`** backend API:
   - Registers spoke in MongoDB `hub-spoke-registry`
   - Requires approval workflow
   - Can auto-link IdP via `autoLinkIdP: true`
   - Used by: `spoke_register()` function (Step 8, but not called automatically)

**Problem**: These aren't unified in the `spoke up` workflow, causing manual intervention.

---

## 📁 PROJECT DIRECTORY STRUCTURE

```
DIVE-V3/
├── dive                                    # Main CLI entry point
├── docker-compose.hub.yml                  # Hub deployment
├── docker-compose.pilot.yml                # Pilot VM deployment
├── docker-compose.prod.yml                 # Production deployment
│
├── docker/
│   └── base/
│       └── services.yml                    # Base service definitions (health checks, env vars)
│
├── scripts/
│   ├── dive-modules/                       # Modular CLI components
│   │   ├── common.sh                       # Shared utilities
│   │   ├── core.sh                         # up, down, restart, logs, ps, exec
│   │   ├── status.sh                       # status, health, validate, info
│   │   ├── deploy.sh                       # deploy, reset, clean, nuke
│   │   ├── spoke.sh                        # spoke init, up, down, register ⚠️ BUG HERE
│   │   ├── hub.sh                          # hub start, status, bootstrap
│   │   ├── federation.sh                   # federation link, status, list-idps ⚠️ BUG HERE
│   │   ├── federation-setup.sh             # register_spoke_in_hub() function
│   │   ├── secrets.sh                      # GCP secret management
│   │   ├── certificates.sh                 # mkcert certificate management
│   │   └── [other modules]
│   │
│   └── spoke-init/                         # Spoke initialization scripts
│       ├── init-all.sh                     # Master init script ⚠️ MISSING REGISTRATION
│       ├── init-keycloak.sh                # Keycloak setup
│       ├── init-databases.sh               # PostgreSQL/MongoDB setup
│       ├── seed-users.sh                   # Test users
│       ├── seed-resources.sh               # Test resources
│       └── sync-federation-secrets.sh      # Federation secret sync
│
├── backend/
│   └── src/
│       ├── routes/
│       │   └── federation.routes.ts        # /api/federation/* endpoints ⚠️ AUTH BUG
│       ├── services/
│       │   ├── hub-spoke-registry.service.ts   # MongoDB spoke registry ⚠️ AUTH BUG
│       │   ├── keycloak-federation.service.ts  # Keycloak IdP management
│       │   └── gcp-secrets.ts              # GCP Secret Manager integration
│       └── types/
│           └── [TypeScript interfaces]
│
├── frontend/
│   └── src/
│       ├── app/                            # Next.js App Router
│       ├── components/                     # React components
│       └── lib/                            # NextAuth.js configuration
│
├── kas/
│   └── src/
│       └── server.ts                       # Key Access Service (ZTDF)
│
├── policies/
│   ├── fuel_inventory_abac_policy.rego    # OPA ABAC policy
│   └── tests/                              # OPA unit tests
│
├── instances/                              # Deployed instances
│   ├── hub/                                # USA Hub instance
│   ├── esp/                                # Spain spoke
│   │   ├── docker-compose.yml
│   │   ├── .env
│   │   └── .initialized                    # Marker file
│   ├── ita/                                # Italy spoke
│   └── pol/                                # Poland spoke ⚠️ NOT FEDERATED
│
├── config/
│   └── federation-registry.json            # Static metadata (federated search)
│
└── docs/
    ├── TARGET_ARCHITECTURE.md              # System architecture
    ├── GAP_ANALYSIS.md                     # Gap analysis
    ├── CI_CD_PLAN.md                       # CI/CD plan
    ├── DEPLOYMENT_COMPLETE.md              # Deployment summary
    ├── FEDERATION_BUG_FIX.md               # ESP/ITA manual setup
    ├── FEDERATION_RESILIENCE_ASSESSMENT.md # E2E test results
    └── HANDOFF_PROMPT.md                   # This document
```

---

## 🔍 FULL SCOPE GAP ANALYSIS

### Phase 1: Infrastructure (COMPLETE ✅)
| Component | Status | Notes |
|-----------|--------|-------|
| Docker Compose | ✅ | Hub + spoke deployment working |
| Networks | ✅ | `dive-v3-shared-network` for federation |
| Health Checks | ✅ | Fixed container naming, increased timeouts |
| HTTPS/TLS | ✅ | mkcert certificates, KAS using HTTPS |
| OPAL Connectivity | ✅ | Using Docker DNS `dive-hub-opal-server:7002` |
| Secrets Management | ✅ | GCP Secret Manager integration |

### Phase 2: Keycloak Federation (PARTIAL ⚠️)
| Component | Status | Notes |
|-----------|--------|-------|
| Hub Keycloak | ✅ | Running, `dive-v3-broker` realm |
| Spoke Keycloak | ✅ | ESP/ITA/POL running |
| IdP Creation (Manual) | ✅ | ESP/ITA IdPs created via manual API calls |
| IdP Creation (Auto) | ❌ | `autoLinkIdP: true` fails with 401 |
| Protocol Mappers | ⚠️ | Created for ESP/ITA, unknown for POL |
| Cross-Border SSO | ✅ | ESP/ITA users can login at hub |

### Phase 3: Backend API (PARTIAL ⚠️)
| Component | Status | Notes |
|-----------|--------|-------|
| `/api/federation/register` | ✅ | Registration endpoint works |
| `/api/federation/spokes` | ✅ | Spoke listing works |
| `/api/federation/spokes/{id}/approve` | ⚠️ | Approval works, but autoLinkIdP fails |
| `/api/federation/link-idp` | ❌ | Returns 401, authentication broken |
| `/api/idps/public` | ✅ | IdP listing works |
| MongoDB Persistence | ✅ | Spoke data persists |
| Keycloak Admin Auth | ❌ | **CRITICAL BUG** - 401 errors |

### Phase 4: CLI Automation (INCOMPLETE ❌)
| Component | Status | Notes |
|-----------|--------|-------|
| `./dive hub up` | ✅ | Hub deployment works |
| `./dive spoke init` | ✅ | Spoke initialization works |
| `./dive spoke up` | ⚠️ | Containers start, but NO auto-registration |
| `./dive spoke register` | ⚠️ | Function exists but not called by `spoke up` |
| `./dive federation link` | ❌ | Fails with 401 |
| `./dive federation status` | ✅ | Shows correct localhost URLs |
| `./dive federation list-idps` | ✅ | Shows registered IdPs |
| E2E Automation | ❌ | **CRITICAL GAP** - Manual steps required |

### Phase 5: Resilience & Testing (NOT STARTED ❌)
| Component | Status | Notes |
|-----------|--------|-------|
| Automated Testing | ❌ | No test suite exists |
| Clean Slate Testing | ❌ | Not tested |
| Rollback on Failure | ❌ | Spoke approved even if IdP fails |
| Error Handling | ❌ | Silent failures in multiple places |
| Retry Logic | ❌ | No retries for 401 errors |
| Integration Tests | ❌ | No tests for federation flow |
| E2E Tests | ❌ | No tests for full spoke deployment |

---

## 🎯 PHASED IMPLEMENTATION PLAN

### **PHASE 1: Fix Critical Bugs (Week 1)**

#### Goal 1.1: Fix Backend Keycloak Authentication
**Objective**: Resolve 401 errors preventing auto IdP linking
**Success Criteria**:
- Backend can successfully authenticate to Hub Keycloak
- `autoLinkIdP: true` creates IdPs without errors
- Zero 401 errors in backend logs

**Tasks**:
1. [ ] Debug `getKeycloakAdminPassword()` in `hub-spoke-registry.service.ts`
2. [ ] Verify correct Keycloak admin URL (docker vs localhost)
3. [ ] Add retry logic for transient authentication failures
4. [ ] Test authentication with ESP/ITA/POL
5. [ ] Add comprehensive error logging

**Files to Modify**:
- `backend/src/services/hub-spoke-registry.service.ts`
- `backend/src/services/keycloak-federation.service.ts`

**Testing**:
```bash
# Test 1: Approve new spoke with autoLinkIdP
curl -X POST https://localhost:4000/api/federation/spokes/{id}/approve \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"autoLinkIdP": true, ...}'
# Expected: IdP created successfully, no 401 errors

# Test 2: Check IdP was created
curl -sk https://localhost:4000/api/idps/public | jq '.idps[] | select(.alias == "pol-idp")'
# Expected: POL IdP exists
```

**SMART Metrics**:
- **Specific**: Fix 401 authentication errors in Keycloak admin API calls
- **Measurable**: 100% success rate for `autoLinkIdP: true`
- **Achievable**: Root cause is known (password/URL issue)
- **Relevant**: Blocks all automatic IdP creation
- **Time-bound**: 2 days

---

#### Goal 1.2: Integrate Auto-Registration into `spoke up`
**Objective**: Make `./dive spoke up` automatically register spoke with hub
**Success Criteria**:
- Fresh spoke deployment calls `/api/federation/register`
- Spoke appears in hub database without manual API calls
- Deployment fails gracefully if registration fails

**Tasks**:
1. [ ] Modify `spoke_up()` in `spoke.sh` to call `spoke_register()`
2. [ ] Add hub detection logic (only register if hub running locally)
3. [ ] Implement `--poll` mode by default for local dev
4. [ ] Add `--no-register` flag to skip registration (for testing)
5. [ ] Update `init-all.sh` to include registration as Step 6

**Files to Modify**:
- `scripts/dive-modules/spoke.sh` (lines 2250-2290)
- `scripts/spoke-init/init-all.sh` (add Step 6)

**Code Changes**:
```bash
# In spoke_up() after docker compose up:
if docker ps --format '{{.Names}}' | grep -q "dive-hub-backend"; then
    log_step "Registering spoke with Hub..."

    if [ "$SKIP_REGISTRATION" != "true" ]; then
        INSTANCE="$code_lower" spoke_register --poll --poll-timeout=300

        if [ $? -eq 0 ]; then
            log_success "Spoke registered and approved by Hub"
        else
            log_error "Spoke registration failed - federation will not work"
            return 1  # Fail deployment if registration fails
        fi
    fi
fi
```

**Testing**:
```bash
# Test 1: Deploy new spoke (clean slate)
./dive --instance gbr spoke init GBR "United Kingdom"
./dive --instance gbr spoke up

# Expected: GBR automatically registered in hub database
curl -sk https://localhost:4000/api/federation/spokes | jq '.spokes[] | select(.instanceCode == "GBR")'

# Test 2: Verify IdP created
curl -sk https://localhost:4000/api/idps/public | jq '.idps[] | select(.alias == "gbr-idp")'
```

**SMART Metrics**:
- **Specific**: Integrate `spoke_register()` into `spoke_up()` workflow
- **Measurable**: 100% of new spokes registered automatically
- **Achievable**: Function exists, just needs to be called
- **Relevant**: Core automation requirement
- **Time-bound**: 3 days

---

#### Goal 1.3: Make `autoLinkIdP` Mandatory and Fail-Fast
**Objective**: Spoke approval must fail if IdP linking fails
**Success Criteria**:
- Approval endpoint returns 500 if IdP creation fails
- Spoke status set to 'suspended' on IdP failure
- No silent failures in logs

**Tasks**:
1. [ ] Modify `/api/federation/spokes/{id}/approve` endpoint
2. [ ] Call `suspendSpoke()` if `createFederationIdP()` fails
3. [ ] Return HTTP 500 with detailed error message
4. [ ] Add transaction rollback logic

**Files to Modify**:
- `backend/src/routes/federation.routes.ts` (approval endpoint)
- `backend/src/services/hub-spoke-registry.service.ts`

**Code Changes**:
```typescript
// In spoke approval endpoint:
try {
    await hubSpokeRegistry.createFederationIdP(spoke);
    logger.info('IdP auto-linked successfully', { spokeId, instanceCode: spoke.instanceCode });
} catch (error) {
    // FAIL the approval if IdP linking fails
    await hubSpokeRegistry.suspendSpoke(
        spoke.spokeId,
        `Failed to create IdP: ${error.message}`
    );

    res.status(500).json({
        success: false,
        error: 'Approval failed',
        message: `IdP linking failed - spoke suspended: ${error.message}`,
        details: { spokeId: spoke.spokeId }
    });
    return;
}
```

**Testing**:
```bash
# Test 1: Approve spoke with broken Keycloak password
# Expected: Approval fails, spoke status = suspended, HTTP 500 returned

# Test 2: Fix password and retry approval
# Expected: Approval succeeds, spoke status = approved, IdP created
```

**SMART Metrics**:
- **Specific**: Fail spoke approval if IdP linking fails
- **Measurable**: Zero silent failures
- **Achievable**: Simple error handling logic
- **Relevant**: Prevents broken federation states
- **Time-bound**: 1 day

---

### **PHASE 2: Comprehensive Testing Suite (Week 2)**

#### Goal 2.1: Clean Slate Testing Script
**Objective**: Create script to nuke all DIVE resources and test from scratch
**Success Criteria**:
- Single command removes all DIVE containers, networks, volumes
- Test script deploys hub + 3 spokes automatically
- Full E2E test completes in under 10 minutes

**Tasks**:
1. [ ] Create `scripts/test-e2e-clean-slate.sh`
2. [ ] Implement Docker cleanup (containers, networks, volumes, images)
3. [ ] Implement database cleanup (MongoDB, PostgreSQL)
4. [ ] Deploy hub from scratch
5. [ ] Deploy 3 spokes sequentially (ESP, ITA, POL)
6. [ ] Verify federation status
7. [ ] Test cross-border login for each spoke

**Script Structure**:
```bash
#!/usr/bin/env bash
# scripts/test-e2e-clean-slate.sh

set -e

echo "Step 1: Nuke all DIVE resources..."
./dive nuke --force --all

echo "Step 2: Deploy USA Hub..."
./dive hub up
sleep 30  # Wait for hub to stabilize

echo "Step 3: Deploy ESP spoke..."
./dive spoke init ESP "Spain"
./dive --instance esp spoke up
# Verify registration and IdP

echo "Step 4: Deploy ITA spoke..."
./dive spoke init ITA "Italy"
./dive --instance ita spoke up
# Verify registration and IdP

echo "Step 5: Deploy POL spoke..."
./dive spoke init POL "Poland"
./dive --instance pol spoke up
# Verify registration and IdP

echo "Step 6: Verify federation..."
./dive federation status
./dive federation list-idps

echo "Step 7: Test cross-border SSO..."
# Test ESP user can login at USA hub
# Test ITA user can login at USA hub
# Test POL user can login at USA hub
```

**SMART Metrics**:
- **Specific**: Create clean slate E2E test script
- **Measurable**: Script completes without errors in <10 mins
- **Achievable**: All commands exist, just need orchestration
- **Relevant**: Proves resilience from scratch
- **Time-bound**: 2 days

---

#### Goal 2.2: Integration Tests for Federation API
**Objective**: Test all `/api/federation/*` endpoints with Jest
**Success Criteria**:
- >90% code coverage on federation routes
- Tests for success and failure scenarios
- Automated tests run in CI/CD

**Tasks**:
1. [ ] Create `backend/src/__tests__/integration/federation-e2e.test.ts`
2. [ ] Test spoke registration flow
3. [ ] Test spoke approval with autoLinkIdP
4. [ ] Test IdP linking failures
5. [ ] Test federation status queries
6. [ ] Mock Keycloak admin API responses

**Test Cases**:
```typescript
describe('Federation E2E Flow', () => {
    it('should register spoke', async () => {
        const response = await request(app)
            .post('/api/federation/register')
            .send(spokeData);
        expect(response.status).toBe(200);
        expect(response.body.spoke.status).toBe('pending');
    });

    it('should approve spoke with autoLinkIdP', async () => {
        const response = await request(app)
            .post(`/api/federation/spokes/${spokeId}/approve`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ autoLinkIdP: true, ... });
        expect(response.status).toBe(200);
        expect(response.body.spoke.status).toBe('approved');
        expect(response.body.spoke.federationIdPAlias).toBe('gbr-idp');
    });

    it('should fail approval if IdP linking fails', async () => {
        // Mock Keycloak to return 401
        const response = await request(app)
            .post(`/api/federation/spokes/${spokeId}/approve`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ autoLinkIdP: true, ... });
        expect(response.status).toBe(500);
        expect(response.body.error).toContain('IdP linking failed');
    });
});
```

**SMART Metrics**:
- **Specific**: Create Jest integration tests for federation API
- **Measurable**: >90% code coverage
- **Achievable**: Test framework already exists
- **Relevant**: Prevents regressions
- **Time-bound**: 3 days

---

#### Goal 2.3: CLI E2E Tests with BATS
**Objective**: Test `@dive` CLI commands end-to-end
**Success Criteria**:
- All critical commands tested (hub up, spoke up, federation link)
- Tests run in isolated Docker environment
- Tests verify both success and failure paths

**Tasks**:
1. [ ] Install BATS (Bash Automated Testing System)
2. [ ] Create `tests/cli/test-spoke-deployment.bats`
3. [ ] Create `tests/cli/test-federation-linking.bats`
4. [ ] Test error handling and rollback
5. [ ] Integrate into CI/CD pipeline

**Example BATS Tests**:
```bash
#!/usr/bin/env bats

@test "dive spoke up registers spoke with hub" {
    run ./dive spoke init TST "Test"
    [ "$status" -eq 0 ]

    run ./dive --instance tst spoke up
    [ "$status" -eq 0 ]

    # Verify spoke is registered
    run curl -sk https://localhost:4000/api/federation/spokes
    [[ "$output" =~ "TST" ]]
}

@test "dive federation link creates IdP" {
    run ./dive federation link TST
    [ "$status" -eq 0 ]

    # Verify IdP created
    run curl -sk https://localhost:4000/api/idps/public
    [[ "$output" =~ "tst-idp" ]]
}
```

**SMART Metrics**:
- **Specific**: Create BATS tests for CLI commands
- **Measurable**: All 15+ critical commands tested
- **Achievable**: BATS is simple bash testing
- **Relevant**: Ensures CLI reliability
- **Time-bound**: 2 days

---

### **PHASE 3: Resilience & Production Readiness (Week 3)**

#### Goal 3.1: Implement Retry Logic & Circuit Breakers
**Objective**: Add resilience for transient failures
**Success Criteria**:
- 401 errors trigger 3 retries with exponential backoff
- Circuit breaker opens after 5 consecutive failures
- Health check endpoints for all services

**Tasks**:
1. [ ] Add retry wrapper in `backend/src/utils/retry.ts`
2. [ ] Wrap Keycloak admin calls with retry logic
3. [ ] Implement circuit breaker for external services
4. [ ] Add health check aggregation endpoint
5. [ ] Monitor and alert on circuit breaker state

**SMART Metrics**:
- **Specific**: Add retry logic and circuit breakers
- **Measurable**: <1% failure rate for transient errors
- **Achievable**: Standard resilience patterns
- **Relevant**: Production requirement
- **Time-bound**: 3 days

---

#### Goal 3.2: Comprehensive Error Handling
**Objective**: No silent failures, all errors logged and surfaced
**Success Criteria**:
- Structured JSON logging for all errors
- User-friendly error messages in CLI
- Errors include request IDs for tracing

**Tasks**:
1. [ ] Audit all `try/catch` blocks for proper error handling
2. [ ] Add request ID middleware
3. [ ] Standardize error response format
4. [ ] Add correlation IDs across services
5. [ ] Implement error aggregation dashboard

**SMART Metrics**:
- **Specific**: Eliminate silent failures
- **Measurable**: Zero silent failures in logs
- **Achievable**: Systematic code review
- **Relevant**: Operational requirement
- **Time-bound**: 3 days

---

#### Goal 3.3: Rollback & Transaction Management
**Objective**: Failed operations fully roll back state
**Success Criteria**:
- Spoke approval failure rolls back to pending
- IdP creation failure removes partial IdP config
- Database operations use transactions

**Tasks**:
1. [ ] Implement transaction wrapper for MongoDB operations
2. [ ] Add rollback logic to spoke approval
3. [ ] Test rollback scenarios
4. [ ] Document rollback procedures

**SMART Metrics**:
- **Specific**: Implement rollback on failure
- **Measurable**: 100% of failed operations rolled back
- **Achievable**: Standard transaction patterns
- **Relevant**: Data consistency requirement
- **Time-bound**: 2 days

---

### **PHASE 4: Documentation & Knowledge Transfer (Week 4)**

#### Goal 4.1: Update Architecture Documentation
**Objective**: Document actual implementation vs design
**Success Criteria**:
- Architecture diagrams updated
- Sequence diagrams for federation flow
- API documentation complete

**SMART Metrics**:
- **Specific**: Update architecture docs
- **Measurable**: 100% of flows documented
- **Achievable**: Implementation is complete
- **Relevant**: Knowledge transfer requirement
- **Time-bound**: 2 days

---

#### Goal 4.2: Create Runbooks for Operations
**Objective**: Provide step-by-step guides for common tasks
**Success Criteria**:
- Runbook for deploying new spoke
- Runbook for troubleshooting federation issues
- Runbook for disaster recovery

**SMART Metrics**:
- **Specific**: Create operational runbooks
- **Measurable**: 10+ runbooks created
- **Achievable**: Based on working system
- **Relevant**: Operational readiness
- **Time-bound**: 2 days

---

#### Goal 4.3: Record Demo Videos
**Objective**: Visual demonstration of system capabilities
**Success Criteria**:
- Clean slate deployment demo
- Cross-border SSO demo
- Troubleshooting demo

**SMART Metrics**:
- **Specific**: Record 3 demo videos
- **Measurable**: 3 videos, 5-10 mins each
- **Achievable**: System working
- **Relevant**: Stakeholder communication
- **Time-bound**: 2 days

---

## 🧪 TESTING STRATEGY

### Level 1: Unit Tests
- **Backend**: Jest tests for all services, >90% coverage
- **OPA**: Rego tests for all policy rules
- **CLI**: BATS tests for all functions

### Level 2: Integration Tests
- **API**: Test all `/api/federation/*` endpoints
- **Keycloak**: Test IdP creation and SSO flow
- **Database**: Test MongoDB and PostgreSQL operations

### Level 3: E2E Tests
- **Clean Slate**: Full deployment from scratch
- **Multi-Spoke**: Deploy 5+ spokes simultaneously
- **Failure Scenarios**: Test rollback and recovery

### Level 4: Resilience Tests
- **Chaos Engineering**: Kill random containers
- **Network Partitions**: Test federation with network delays
- **Load Testing**: 100 concurrent spoke registrations

---

## 📊 SUCCESS CRITERIA MATRIX

| Phase | Deliverable | Success Metric | Verification |
|-------|-------------|----------------|--------------|
| **Phase 1** | Fix Keycloak Auth | Zero 401 errors | Backend logs, API tests |
| **Phase 1** | Auto-Registration | 100% spokes registered automatically | E2E test script |
| **Phase 1** | Fail-Fast | Zero silent failures | Error logs, API tests |
| **Phase 2** | Clean Slate Test | Script completes in <10 mins | Automated test run |
| **Phase 2** | Integration Tests | >90% code coverage | Jest coverage report |
| **Phase 2** | CLI Tests | All 15+ commands tested | BATS test results |
| **Phase 3** | Retry Logic | <1% transient failure rate | Production metrics |
| **Phase 3** | Error Handling | Zero silent failures | Log audit |
| **Phase 3** | Rollback | 100% rollback success | Rollback tests |
| **Phase 4** | Documentation | 100% flows documented | Doc review |
| **Phase 4** | Runbooks | 10+ runbooks created | Runbook review |
| **Phase 4** | Demo Videos | 3 videos recorded | Video review |

---

## 🚀 QUICK START COMMANDS

### Current State Verification
```bash
# Check what's running
./dive ps

# Check federation status
./dive federation status
./dive federation list-idps

# Check hub database
curl -sk https://localhost:4000/api/federation/spokes | jq '.spokes[] | {instanceCode, status}'
```

### Clean Slate Testing (After Fixes)
```bash
# 1. Nuke everything
./dive nuke --force --all

# 2. Deploy hub
./dive hub up

# 3. Deploy spoke (should auto-register)
./dive spoke init GBR "United Kingdom"
./dive --instance gbr spoke up

# 4. Verify (should show gbr-idp)
./dive federation list-idps
```

### Manual Workaround (Current Broken State)
```bash
# If auto-registration fails, use manual workaround:

# 1. Register spoke
curl -X POST https://localhost:4000/api/federation/register \
  -H "Content-Type: application/json" \
  -d '{
    "instanceCode": "GBR",
    "name": "United Kingdom",
    "baseUrl": "https://localhost:3046",
    "apiUrl": "https://dive-spoke-gbr-backend:4000",
    "idpUrl": "https://dive-spoke-gbr-keycloak:8443",
    "idpPublicUrl": "https://localhost:8446",
    "requestedScopes": ["policy:base", "policy:gbr"]
  }'

# 2. Get admin token
ADMIN_TOKEN=$(curl -sk -X POST https://localhost:8443/realms/master/protocol/openid-connect/token \
  -d "client_id=admin-cli" \
  -d "username=admin" \
  -d "password=$(docker exec dive-hub-keycloak env | grep KEYCLOAK_ADMIN_PASSWORD | cut -d'=' -f2)" \
  -d "grant_type=password" | jq -r '.access_token')

# 3. Approve spoke
curl -X POST https://localhost:4000/api/federation/spokes/{spoke-id}/approve \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "allowedScopes": ["policy:base", "policy:gbr"],
    "trustLevel": "bilateral",
    "maxClassification": "SECRET",
    "dataIsolationLevel": "filtered",
    "autoLinkIdP": true
  }'
```

---

## 📚 REFERENCE DOCUMENTATION

### Key Files to Read First:
1. `FEDERATION_RESILIENCE_ASSESSMENT.md` - Complete bug analysis
2. `docs/TARGET_ARCHITECTURE.md` - System architecture
3. `scripts/dive-modules/spoke.sh` - Spoke deployment logic
4. `backend/src/services/hub-spoke-registry.service.ts` - Registration service

### Port Allocation:
- **USA Hub**: Frontend 3000, Backend 4000, Keycloak 8443
- **ESP**: Frontend 3008, Backend 4008, Keycloak 8451
- **ITA**: Frontend 3025, Backend 4025, Keycloak 8468
- **POL**: Frontend 3042, Backend 4042, Keycloak 8485

### Docker Networks:
- `dive-v3-shared-network` - Cross-instance communication
- `dive-hub_hub-internal` - Hub internal
- `esp_dive-esp-network` - ESP internal
- `ita_dive-ita-network` - ITA internal

---

## ⚠️ CRITICAL NOTES

1. **All data is DUMMY/FAKE** - You are authorized to nuke everything for testing
2. **Start with Phase 1 Bug Fixes** - Nothing else works until authentication is fixed
3. **Test Clean Slate Frequently** - Don't assume persistence without testing
4. **Document All Changes** - Update this prompt for next handoff
5. **Focus on Automation** - Manual steps are failures, not workarounds

---

## 🎯 YOUR FIRST ACTIONS

1. **Read this entire prompt** - Understand context and current state
2. **Verify current deployment**: Run `./dive ps` and `./dive federation status`
3. **Review bug reports**: Read `FEDERATION_RESILIENCE_ASSESSMENT.md` in detail
4. **Start with Bug #2**: Fix Keycloak authentication in `hub-spoke-registry.service.ts`
5. **Test incrementally**: Deploy test spoke after each fix
6. **Update this prompt**: Document what you learn and change

---

## 📝 PROMPT FOR AI ASSISTANT

```
I'm working on DIVE V3, a coalition ICAM platform with Hub-and-Spoke federation architecture. The infrastructure is deployed (USA Hub + ESP/ITA spokes working), but federation automation is broken.

**Current Issues**:
1. `./dive spoke up` does NOT auto-register spokes with hub
2. Backend Keycloak authentication fails with 401 during auto IdP linking
3. Poland (POL) spoke deployed but NOT federated

**Your Mission**:
Fix federation automation to be 100% resilient and aligned with @dive CLI, then implement comprehensive testing.

**Start Here**:
1. Read FEDERATION_RESILIENCE_ASSESSMENT.md for complete bug analysis
2. Fix Bug #2: Keycloak authentication in backend/src/services/hub-spoke-registry.service.ts
3. Fix Bug #1: Integrate spoke_register() into spoke_up() in scripts/dive-modules/spoke.sh
4. Test with clean slate: Nuke everything and deploy fresh GBR spoke
5. Implement Phase 2 testing suite

**Success Criteria**:
- `./dive spoke up` automatically registers spoke and creates IdP
- Zero manual API calls required
- Clean slate test completes in <10 minutes
- >90% test coverage

All data is DUMMY/FAKE - nuke Docker resources as needed for testing.

Project location: /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3
```

---

**END OF HANDOFF PROMPT**

