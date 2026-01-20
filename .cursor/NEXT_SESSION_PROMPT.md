# DIVE V3 Federation & Spoke Deployment - Complete End-to-End Workflow

## Context & Background

You are continuing work on DIVE V3, a coalition-friendly federated identity and access management (ICAM) system. A comprehensive **6-phase orchestration architecture review** was just completed (2026-01-18) that resolved 11 architectural gaps and created a robust drift detection system.

### What Was Already Accomplished

The recent architecture review successfully delivered:

1. **Phase 1**: Gap analysis - Identified 11 architectural gaps across state management, error handling, service dependencies, and federation state
2. **Phase 2**: State management consolidation - Implemented `ORCH_DB_ONLY_MODE=true` (database-only, no dual-write)
3. **Phase 3**: Error handling - Circuit breaker persistence, 15 auto-recoverable error types
4. **Phase 4**: Service dependencies - Parallel startup, dynamic timeouts, circular dependency detection
5. **Phase 5**: Federation drift detection - Three-layer state monitoring (Keycloak/MongoDB/Docker)
6. **Phase 6**: Testing & validation - 86 test cases, 16/16 drift detection tests passing

**Key Deliverables from Architecture Review**:
- `docs/architecture/` - Comprehensive documentation (2,702 lines)
- `scripts/orch-db-cli.sh` - State management CLI tool
- `backend/src/services/federation-sync.service.ts` - Drift detection service
- `backend/src/routes/federation-sync.routes.ts` - Drift API (`/api/drift/*`)
- 5 test suites with 86 total test cases
- All TypeScript compilation errors fixed
- Clean build status

### Current System State

**Hub (USA)**: ✅ Deployed and healthy
- 11 containers running
- 5,000 test documents seeded
- Orchestration database created with schema
- Federation drift detection active at `/api/drift/*`

**FRA Spoke**: ⚠️ Partially deployed
- 9 containers running and healthy
- Detected by drift detection system
- **Terraform configuration incomplete** (environment variable loading issue)
- **Not registered in MongoDB** (shows as "orphaned_idp" in drift detection)
- **Cannot log in FRA → USA** (IdP config incomplete)

## Your Mission

**Primary Objective**: Fix the spoke deployment pipeline to enable **complete end-to-end federation** where a user can successfully:
1. Navigate to https://localhost:3000 (USA Hub)
2. Select "France" IdP from login page
3. Authenticate with FRA credentials
4. Access USA Hub resources based on clearance/releasability

**Success Criteria**:
- ✅ FRA spoke fully deployed with complete Terraform configuration
- ✅ Test users exist in FRA Keycloak realm
- ✅ Bidirectional federation configured (FRA ↔ USA)
- ✅ User can authenticate via FRA IdP and access USA Hub
- ✅ Drift detection shows FRA as "synchronized" (not "orphaned_idp")
- ✅ Clean deployment from scratch works reliably
- ✅ All changes tested with clean slate (nuke + redeploy)

## Critical Issues to Fix

### Issue 1: Spoke Environment Variables Not Loading

**Evidence**:
```
❌ Backend missing suffixed env var: POSTGRES_PASSWORD_FRA
❌ Backend missing suffixed env var: AUTH_SECRET_FRA
❌ Backend missing suffixed env var: KEYCLOAK_CLIENT_SECRET_FRA
❌ Backend missing suffixed env var: MONGO_PASSWORD_FRA
```

**Root Cause**: Environment variable loading mechanism in spoke deployment not working

**Impact**: Spoke containers can't connect to their databases, Terraform can't get required variables

### Issue 2: Terraform Apply Failing for Spokes

**Evidence**:
```
environment: line 10: [: 1: unary operator expected
⚠️  Terraform apply failed after retries
❌ CRITICAL: Terraform apply failed - cannot continue without Keycloak realm
```

**Root Cause**: Terraform variables (TF_VAR_*) not being exported properly

**Impact**: FRA realm not created, no test users, IdP configuration incomplete

### Issue 3: Bidirectional Federation Not Completing

**Evidence**:
```
fra-idp in USA Hub: {authorizationUrl: null, tokenUrl: null}
```

**Root Cause**: Dependencies for auto-linking not met (Terraform incomplete)

**Impact**: Cannot authenticate from FRA to USA

## CRITICAL CONSTRAINTS

### You MUST Use DIVE CLI Only

**✅ CORRECT**:
```bash
./dive hub up
./dive hub deploy
./dive spoke deploy FRA "France"
./dive spoke register FRA
./dive nuke all --confirm
```

**❌ FORBIDDEN**:
```bash
docker compose up      # Never use directly
docker restart         # Use ./dive restart instead
docker exec           # Only for inspection, never for deployment
```

**Rationale**: DIVE CLI includes orchestration logic, state management, error recovery that manual Docker commands bypass.

### Clean Slate Testing Required

All data is DUMMY/FAKE. You are **authorized and required** to:
- Nuke entire environment for clean testing: `./dive nuke all --confirm`
- Test from scratch multiple times
- Validate reproducible deployments

### No Workarounds Allowed

- ❌ NO manual configuration fixes
- ❌ NO "skip this step" logic
- ❌ NO hardcoded values
- ✅ ONLY systematic root cause fixes
- ✅ ONLY persistent, resilient solutions
- ✅ ONLY solutions that work on clean deployment

## Project Structure

```
DIVE-V3/
├── dive                              # Main CLI entry point
├── scripts/
│   ├── dive-modules/
│   │   ├── common.sh                # Shared functions
│   │   ├── orchestration-state-db.sh # Phase 2: DB-only state
│   │   ├── orchestration-framework.sh # Phase 4: Service dependencies
│   │   ├── error-recovery.sh        # Phase 3: Circuit breakers
│   │   ├── hub/
│   │   │   ├── deploy.sh           # Hub deployment logic
│   │   │   └── services.sh         # Hub service management
│   │   └── spoke/
│   │       ├── spoke-deploy.sh     # Spoke deployment orchestrator
│   │       ├── spoke-register.sh   # Spoke registration with Hub
│   │       └── pipeline/
│   │           ├── spoke-pipeline.sh       # Main pipeline controller
│   │           ├── phase-preflight.sh      # Pre-deployment checks
│   │           ├── phase-deployment.sh     # Container deployment
│   │           ├── phase-configuration.sh  # Terraform apply
│   │           ├── phase-initialization.sh # Post-config setup
│   │           └── phase-verification.sh   # Health checks
│   ├── orch-db-cli.sh              # Phase 2: State management CLI
│   └── apply-phase2-migration.sh   # Orchestration DB schema
├── backend/
│   └── src/
│       ├── services/
│       │   ├── hub-spoke-registry.service.ts # Spoke registration
│       │   ├── federation-sync.service.ts    # Phase 5: Drift detection
│       │   └── keycloak-federation.service.ts # Bidirectional federation
│       └── routes/
│           ├── federation.routes.ts          # Federation management
│           └── federation-sync.routes.ts     # Phase 5: Drift API
├── docs/
│   └── architecture/
│       ├── ARCHITECTURE_REVIEW_REPORT.md  # Full review summary
│       ├── SCOPE_CLARIFICATION.md         # What was/wasn't delivered
│       ├── gap-registry.md                # All 11 gaps documented
│       └── README.md                      # Architecture index
├── tests/
│   └── orchestration/
│       ├── test-federation-sync.sh        # 16/16 passing
│       ├── test-state-management.sh       # 17 tests
│       ├── test-error-recovery.sh         # 24 tests
│       └── run-all-tests.sh              # Unified runner
├── docker-compose.hub.yml              # Hub services
└── instances/
    └── fra/
        ├── docker-compose.yml          # FRA spoke services
        └── config.json                 # Spoke configuration
```

## Recommended Approach

### Phase 1: Investigate Spoke Deployment Pipeline

**Objective**: Understand why environment variables aren't loading during spoke deployment

**Steps**:
1. Read `@scripts/dive-modules/spoke/pipeline/phase-configuration.sh` - Focus on how TF_VAR_* are exported
2. Check `@scripts/dive-modules/spoke/spoke-deploy.sh` - Understand secret loading
3. Trace the flow from `./dive spoke deploy FRA` through all pipeline phases
4. Identify where POSTGRES_PASSWORD_FRA, AUTH_SECRET_FRA should be set

**Expected Findings**:
- Missing secret loading step
- Incorrect environment variable scoping
- Terraform variable export happening too late

### Phase 2: Fix Environment Variable Loading

**Objective**: Ensure all instance-specific secrets are available to Terraform and containers

**Requirements**:
- Must work with `ALLOW_INSECURE_LOCAL_DEVELOPMENT=true`
- Must NOT store spoke passwords in Hub environment
- Spokes should generate/provide their own passwords
- Changes must be persistent (survive nuke + redeploy)

### Phase 3: Complete FRA Deployment End-to-End

**Objective**: Deploy FRA spoke completely from clean slate

**Test Plan**:
```bash
# 1. Clean slate
./dive nuke all --confirm

# 2. Deploy Hub
export ALLOW_INSECURE_LOCAL_DEVELOPMENT=true
./dive hub deploy

# 3. Deploy FRA spoke
./dive spoke deploy FRA "France"

# 4. Verify Terraform completed
curl -k https://localhost:8453/realms/dive-v3-broker-fra
# Should show enabled realm

# 5. Verify test users exist
# Check FRA Keycloak has testuser-fra-1 through testuser-fra-5

# 6. Verify IdP configuration
curl -k https://localhost:8443/admin/realms/dive-v3-broker-usa/identity-provider/instances/fra-idp
# Should show complete authorizationUrl, tokenUrl, etc.

# 7. Test login flow
# Open https://localhost:3000
# Select "France" IdP
# Login with testuser-fra-1
# Should successfully access USA Hub
```

### Phase 4: Validate with Drift Detection

**Objective**: Confirm drift detection shows FRA as synchronized

**Expected Result**:
```json
{
  "instanceCode": "FRA",
  "synchronized": true,  // ← Should be true after proper registration
  "keycloak": {"exists": true, "enabled": true},
  "mongodb": {"exists": true, "status": "approved"},  // ← Should exist
  "docker": {"running": true, "healthy": true}
}
```

### Phase 5: Deploy Second Spoke (DEU)

**Objective**: Validate solution works for multiple spokes

**Test**: Deploy DEU from clean slate, verify both FRA and DEU work

## Important Files to Review

### Spoke Deployment Pipeline
- `@scripts/dive-modules/spoke/pipeline/phase-configuration.sh` (lines 575-610) - TF_VAR export logic
- `@scripts/dive-modules/spoke/spoke-deploy.sh` - Main deployment orchestrator
- `@scripts/dive-modules/spoke/pipeline/phase-deployment.sh` - Container deployment

### Secret Management
- Check how secrets are loaded for spokes vs. Hub
- Understand `ALLOW_INSECURE_LOCAL_DEVELOPMENT=true` behavior

### Terraform
- `@terraform/spoke/` - Spoke Terraform configuration
- Understand what variables are required and how they're passed

## Key Principles

1. **Use DIVE CLI Exclusively** - Never bypass with manual Docker
2. **Root Cause Analysis** - Don't fix symptoms, fix causes
3. **Test from Clean Slate** - Every fix must work with nuke + redeploy
4. **No Workarounds** - Only persistent, production-ready solutions
5. **Comprehensive Testing** - Validate each fix thoroughly

## Expected Deliverables

1. **Working FRA → USA Login Flow**
   - User can select France IdP and authenticate
   - Access USA Hub based on clearance level

2. **Fixed Spoke Deployment Pipeline**
   - Environment variables load correctly
   - Terraform completes successfully
   - Test users created automatically

3. **Validated Multi-Spoke Federation**
   - Deploy FRA and DEU from clean slate
   - Both show as synchronized in drift detection
   - Cross-spoke authentication works

4. **Updated Documentation**
   - Document root causes and fixes
   - Update deployment procedures
   - Add troubleshooting guide

## Starting Point

Your first actions should be:

1. Read `@docs/architecture/SCOPE_CLARIFICATION.md` to understand what was delivered
2. Review the spoke deployment logs to identify exact failure points
3. Trace environment variable flow from deployment command to Terraform
4. Systematically fix the root cause
5. Test with clean deployment: `./dive nuke all --confirm && ./dive hub deploy && ./dive spoke deploy FRA "France"`

## Success Validation

The session is complete when:
- [ ] `./dive spoke deploy FRA "France"` completes without errors
- [ ] Terraform apply succeeds and creates realm + users
- [ ] FRA shows status="approved" in MongoDB
- [ ] Drift detection shows FRA as "synchronized"
- [ ] User can log in via FRA IdP at https://localhost:3000
- [ ] Same process works for DEU spoke
- [ ] All tested from clean slate (nuke + redeploy)
- [ ] No manual workarounds required

---

**Data Notice**: All users, passwords, and data are DUMMY/FAKE for testing purposes. You are authorized to nuke Docker resources as needed.

**Critical Reminder**: ONLY use `@dive` (DIVE CLI) and `@scripts/dive-modules` for ALL operations. NO manual docker commands except for inspection.

**Quality Bar**: Best practice, persistent, resilient solutions only. No shortcuts.
