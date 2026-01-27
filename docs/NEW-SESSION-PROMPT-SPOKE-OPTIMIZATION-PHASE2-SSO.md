# DIVE V3 Spoke Deployment Optimization - Phase 2: Bidirectional SSO Validation

## Session Overview

**Objective**: Complete Phase 2 of the spoke deployment optimization to achieve full bidirectional SSO validation between Hub and Spoke instances with comprehensive automated testing.

**Current Status**: Phase 1 Complete (✅ Testing Infrastructure: 76 tests created) + Critical module loading fixes deployed

**Next Phase**: Phase 2 - Bidirectional SSO Validation (manual testing, then automated framework)

---

## CRITICAL INSTRUCTIONS

### Deployment & Orchestration Rules

**⚠️ MANDATORY - USE DIVE CLI ONLY:**
- ✅ **CORRECT**: `./dive hub up`, `./dive spoke init FRA`, `./dive spoke status FRA`
- ❌ **FORBIDDEN**: `docker-compose up`, `docker ps`, `docker exec`
- ✅ **CORRECT**: `./dive nuke` to clean slate
- ❌ **FORBIDDEN**: `docker-compose down -v`, `docker system prune`

**Why This Matters**:
- DIVE CLI orchestrates complex multi-phase pipelines
- Manages GCP secrets, federation state database, service dependencies
- Ensures consistent state tracking across deployments
- Manual Docker commands bypass orchestration logic and break state

**Data Authorization**:
- All users, credentials, and data are DUMMY/FAKE
- Full authorization to `./dive nuke` and start clean slate
- No concerns about data loss or backward compatibility

### Technical Approach

**✅ DO:**
- Audit and enhance existing logic (no duplication)
- Eliminate technical debt aggressively
- Use best practice approaches (resilient, persistent)
- Build comprehensive testing suites
- Start from clean slate when needed (`./dive nuke`)
- Follow hub patterns (hub has 87 tests, spoke should match)

**❌ DON'T:**
- Create workarounds or shortcuts
- Consider migration/deprecation/backward compatibility
- Simplify complex solutions
- Skip testing or validation
- Use manual Docker commands

---

## Session Background & Context

### What Was Accomplished

#### Phase 0: Audit & Discovery (Previous Session)
- **SPOKE-AUDIT-REPORT.md**: Identified 5 critical hardcoded service arrays
- Documented missing service labels and GCP auth issues
- Found insufficient testing (6 spoke tests vs 87 hub tests)
- Recommended dynamic service discovery refactoring

#### Phase 1: Critical Fixes & Parity (Completed This Session)

**Sprint 1.1: GCP Authentication**
- Enhanced `spoke-secrets.sh` with GCP Secret Manager integration
- Implemented automatic service account activation
- Added secret validation and fallback mechanisms
- Aligned with hub's secret management pattern

**Sprint 1.2: Dynamic Service Discovery**
- Added spoke-specific functions to `compose-parser.sh`:
  - `compose_get_spoke_services()` - Get all services
  - `compose_get_spoke_services_by_class()` - Filter by CORE/OPTIONAL/STRETCH
  - `compose_get_spoke_dependencies()` - Parse depends_on
  - `compose_calculate_spoke_dependency_levels()` - Calculate startup order
- Verified `templates/spoke/docker-compose.template.yml` has service labels
- Eliminated hardcoded service arrays

**Sprint 1.3: Testing Infrastructure**
- Created `scripts/validate-spoke-deployment.sh` (27 validation tests)
- Created `tests/unit/test-spoke-orchestration.bats` (29 unit tests)
- Created `tests/integration/test-spoke-deployment.bats` (20 integration tests)
- Modified `tests/run-tests.sh` with hub/spoke/all modes
- **Total: 76 new tests created** (exceeded 70+ target)

**Critical Bug Fix: Module Loading**
- Fixed systematic unbound variable errors (83 files)
- Changed module guards from `[ -n "$VAR_LOADED" ]` to `[ -n "${VAR_LOADED:-}" ]`
- Resolved `./dive spoke status` command failures
- Enabled proper spoke deployment orchestration
- **Commit**: `6e5038d1` - Critical for Phase 2 work

### Key Discoveries About Federation Architecture

#### Federation is Database-Driven (Not Static Configuration!)

**Federation State Database** (`scripts/dive-modules/federation-state-db.sh`):
- PostgreSQL tables: `federation_links`, `federation_health`, `federation_operations`
- Schema: `scripts/sql/002_federation_schema.sql`
- Tracks **bidirectional** federation states:
  - `HUB_TO_SPOKE`: Hub → Spoke direction (spoke-idp in Hub)
  - `SPOKE_TO_HUB`: Spoke → Hub direction (usa-idp in Spoke)
- Status lifecycle: `PENDING` → `ACTIVE` | `FAILED`
- Records: SSO test results, health checks, operation audit trail
- Query functions: `fed_db_get_instance_status()`, `fed_db_get_pairs()`

**Spoke Federation Pipeline** (`scripts/dive-modules/spoke/pipeline/spoke-federation.sh`):
```bash
spoke_federation_setup() {
  # Step 1: Configure usa-idp in spoke Keycloak (upstream IdP)
  spoke_federation_configure_upstream_idp()
  
  # Step 2: Register spoke-idp in Hub Keycloak
  spoke_federation_register_in_hub()
  
  # Step 2.5: Create bidirectional federation (NEW - automatic)
  spoke_federation_create_bidirectional()
  
  # Step 3: Synchronize client secrets
  spoke_secrets_sync_federation()
  
  # Step 4: Clear Keycloak caches
  _spoke_federation_clear_keycloak_cache()
  
  # Step 5: Verify with exponential backoff (2s, 4s, 8s, 16s, 32s)
  # - Tests OIDC discovery endpoints
  # - Records health check in database
  # - Updates federation_links.status to ACTIVE
}
```

**Configuration Phase** (`scripts/dive-modules/spoke/pipeline/phase-configuration.sh`):
- Loads secrets from GCP Secret Manager
- Runs Terraform to create Keycloak realm/client/mappers
- Calls `spoke_federation_setup()` for bidirectional SSO
- All state persisted to orchestration database

**Hub-Spoke Model**:
- Hub (USA) is the primary instance
- Spokes federate with Hub (not directly with each other)
- Bidirectional SSO flows:
  - **Hub → Spoke**: User at Hub can access Spoke resources
  - **Spoke → Hub**: User at Spoke can access Hub resources

#### SSO Flow Details

**Hub → Spoke SSO Flow**:
1. User authenticates at Hub Keycloak (`usa-idp`)
2. Hub issues JWT with user attributes (clearance, countryOfAffiliation, acpCOI)
3. User navigates to Spoke frontend
4. Spoke redirects to Spoke Keycloak
5. Spoke Keycloak finds `usa-idp` configured as IdP
6. Token exchange/brokering occurs via OIDC
7. User is logged into Spoke with bridged session

**Spoke → Hub SSO Flow**:
1. User authenticates at Spoke Keycloak (`fra-idp`, `gbr-idp`, etc.)
2. Spoke issues JWT with normalized user attributes
3. User navigates to Hub frontend
4. Hub redirects to Hub Keycloak
5. Hub Keycloak finds `{code}-idp` configured as IdP
6. Token exchange/brokering occurs via OIDC
7. User is logged into Hub with bridged session

**Token Structure** (JWT Claims):
- `sub`: Unique user identifier
- `uniqueID`: Normalized user ID (mapped via protocol mappers)
- `clearance`: UNCLASSIFIED | CONFIDENTIAL | SECRET | TOP_SECRET
- `countryOfAffiliation`: ISO 3166-1 alpha-3 (USA, FRA, GBR, etc.)
- `acpCOI`: Community of Interest tags (["NATO-COSMIC", "FVEY"])
- `iss`: Issuer (Keycloak realm URL)
- `exp`: Expiration timestamp

### Current System State

**Hub (USA)**:
- ✅ Status: Running (11/11 services healthy)
- ✅ Keycloak: `https://localhost:8443`
- ✅ Realm: `dive-v3-broker-usa`
- ✅ Frontend: `https://localhost:3000`
- ✅ Backend API: `https://localhost:4000`
- ✅ OPA: `http://localhost:8181`

**Spokes**:
- ⚠️ Status: No spokes currently initialized
- ✅ Directory structure: `instances/hub/`, `instances/usa/`
- ✅ Federation registry: Configured for 23 countries
- ✅ Templates ready: `templates/spoke/docker-compose.template.yml`

**Federation**:
- ✅ Code: Automatic bidirectional setup implemented
- ✅ Database: Schema ready (`federation_links`, `federation_health`)
- ⚠️ Active links: None (no spokes deployed yet)
- ✅ Verification: Health checks with exponential backoff

**Testing Infrastructure**:
- ✅ Hub tests: 87 tests (unit + integration + validation)
- ✅ Spoke tests: 76 tests (unit + integration + validation)
- ✅ Test runner: `tests/run-tests.sh` with hub/spoke/all modes
- ✅ BATS framework: Installed and working

---

## Technical Debt & Lessons Learned

### Module Loading Pattern (RESOLVED)

**Problem**: Unbound variable errors with `set -u`
```bash
# ❌ OLD PATTERN (breaks with set -u)
[ -n "$MODULE_LOADED" ] && return 0
export MODULE_LOADED=1
```

**Solution**: Parameter expansion with default values
```bash
# ✅ NEW PATTERN (safe with set -u)
[ -n "${MODULE_LOADED:-}" ] && return 0
export MODULE_LOADED=1
```

**Applied to**: 83 module files (all fixed in commit `6e5038d1`)

### Testing Strategy (BEST PRACTICE)

**Hub Pattern** (Reference Implementation):
- `scripts/validate-hub-deployment.sh`: 27 validation tests
- `tests/unit/test-hub-orchestration.bats`: 29 unit tests
- `tests/integration/test-hub-deployment.bats`: 31 integration tests
- **Total: 87 tests**

**Spoke Pattern** (Now Matches Hub):
- `scripts/validate-spoke-deployment.sh`: 27 validation tests
- `tests/unit/test-spoke-orchestration.bats`: 29 unit tests
- `tests/integration/test-spoke-deployment.bats`: 20 integration tests
- **Total: 76 tests** (on par with hub)

**Key Insights**:
1. Validation scripts are **not tests** - they're operational tools
2. BATS tests should test the validation scripts themselves
3. Use dynamic service discovery, not hardcoded arrays
4. Test both positive and negative scenarios
5. Skip tests gracefully if deployment not running

### Dynamic Service Discovery (BEST PRACTICE)

**Problem**: Hardcoded service lists scattered across 5 files
```bash
# ❌ OLD PATTERN (brittle, duplicative)
CORE_SERVICES=("postgres" "mongodb" "redis" "keycloak" "opa" "backend" "frontend")
OPTIONAL_SERVICES=("grafana" "prometheus" "alertmanager")
```

**Solution**: Single source of truth via compose labels
```yaml
# docker-compose.yml
services:
  postgres:
    labels:
      dive.service.class: "core"
      dive.service.description: "PostgreSQL database"
```

```bash
# ✅ NEW PATTERN (dynamic, DRY)
CORE_SERVICES=($(compose_get_spoke_services_by_class "$instance_code" "core"))
OPTIONAL_SERVICES=($(compose_get_spoke_services_by_class "$instance_code" "optional"))
```

**Benefits**:
- Single source of truth (compose file)
- No synchronization issues
- Easy to add/remove services
- Supports instance-specific variations

### Federation State Management (BEST PRACTICE)

**Anti-Pattern**: Static JSON configuration files
- `config/federation-registry.json` is a **template**, not state
- Real state lives in PostgreSQL `federation_links` table
- Status changes tracked in database, not files

**Correct Pattern**: Database-driven state
```bash
# Record federation link
fed_db_upsert_link "fra" "usa" "SPOKE_TO_HUB" "usa-idp" "PENDING"

# Update status after verification
fed_db_update_status "fra" "usa" "SPOKE_TO_HUB" "ACTIVE"

# Query status
fed_db_get_instance_status "fra"  # Returns JSON with bidirectional status
```

**Why This Matters**:
- Distributed systems need persistent state
- Multiple processes may check/update federation status
- Health checks run periodically, need historical data
- Recovery operations need to know what to retry

---

## Project Directory Structure

```
/Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/
├── backend/                          # Express.js API (PEP)
│   ├── src/
│   │   ├── controllers/              # Route handlers
│   │   ├── middleware/               # PEP authorization
│   │   ├── services/                 # Business logic
│   │   └── utils/
│   │       └── gcp-secrets.ts        # GCP Secret Manager integration
├── config/
│   ├── federation-registry.json      # Federation TEMPLATE (not state!)
│   ├── kas-registry.json             # KAS configuration
│   └── naming-conventions.json       # Instance naming rules
├── data/
│   └── hub/
│       ├── .initialized              # Hub initialization marker
│       └── config/hub.json           # Hub-specific config
├── docs/
│   ├── SPOKE-AUDIT-REPORT.md         # Phase 0 audit findings
│   ├── NEW-SESSION-PROMPT-SPOKE-OPTIMIZATION.md          # Original session prompt
│   ├── NEW-SESSION-PROMPT-SPOKE-OPTIMIZATION-PHASE1-CONTINUATION.md  # Phase 1 prompt
│   └── NEW-SESSION-PROMPT-SPOKE-OPTIMIZATION-PHASE2-SSO.md  # This document
├── frontend/                         # Next.js 15 (App Router)
│   └── src/
│       ├── app/                      # Pages and layouts
│       ├── components/               # React components
│       └── lib/                      # Client utilities
├── instances/                        # Deployed instances
│   ├── hub/                          # Hub deployment (USA)
│   ├── usa/                          # Hub alias
│   ├── .phases/                      # Deployment phase tracking
│   └── [fra|gbr|deu|...]/            # Spoke deployments (created on init)
├── keycloak/
│   ├── realms/                       # Keycloak realm templates
│   ├── themes/                       # Country-specific themes (dive-v3-fra, etc.)
│   └── user-profile-templates/       # User profile schemas
├── policies/                         # OPA Rego policies
│   ├── fuel_inventory_abac_policy.rego
│   └── tests/                        # OPA policy tests
├── scripts/
│   ├── dive                          # Main CLI entry point
│   ├── dive-modules/
│   │   ├── common.sh                 # Shared utilities
│   │   ├── configuration/
│   │   │   ├── terraform.sh          # Terraform operations (fixed)
│   │   │   ├── secrets.sh            # Secret management
│   │   │   └── certificates.sh       # TLS certificate handling
│   │   ├── core/
│   │   │   ├── cli.sh                # CLI framework
│   │   │   └── logging.sh            # Structured logging
│   │   ├── deployment/
│   │   │   ├── hub.sh                # Hub deployment
│   │   │   ├── spoke.sh              # Spoke deployment
│   │   │   ├── preflight.sh          # Pre-deployment checks
│   │   │   └── verification.sh       # Post-deployment validation
│   │   ├── federation/
│   │   │   ├── setup.sh              # Federation configuration
│   │   │   ├── verification.sh       # Federation health checks
│   │   │   ├── health.sh             # Health monitoring
│   │   │   └── drift-detection.sh    # Configuration drift detection
│   │   ├── federation-link.sh        # Manual federation linking
│   │   ├── federation-state-db.sh    # Database-driven state management ⭐
│   │   ├── orchestration-framework.sh # Orchestration engine
│   │   ├── orchestration-dependencies.sh # Dependency management (fixed)
│   │   ├── orchestration-state-db.sh # Orchestration state tracking
│   │   ├── error-recovery.sh         # Auto-recovery logic
│   │   ├── spoke/
│   │   │   ├── pipeline/
│   │   │   │   ├── spoke-pipeline.sh        # Pipeline controller (fixed)
│   │   │   │   ├── spoke-federation.sh      # Spoke federation logic ⭐
│   │   │   │   ├── phase-preflight.sh       # Preflight checks
│   │   │   │   ├── phase-initialization.sh  # Instance initialization
│   │   │   │   ├── phase-deployment.sh      # Container deployment
│   │   │   │   ├── phase-configuration.sh   # Terraform + federation ⭐
│   │   │   │   ├── phase-seeding.sh         # Data seeding
│   │   │   │   └── phase-verification.sh    # Validation
│   │   │   ├── spoke-init.sh         # Spoke initialization
│   │   │   ├── spoke-deploy.sh       # Legacy deploy (being phased out)
│   │   │   └── spoke-secrets.sh      # Spoke secret management
│   │   └── utilities/
│   │       ├── compose-parser.sh     # Dynamic service discovery ⭐
│   │       ├── testing.sh            # Test utilities
│   │       └── help.sh               # CLI help system
│   ├── sql/
│   │   ├── 001_orchestration_schema.sql  # Orchestration database
│   │   └── 002_federation_schema.sql     # Federation database ⭐
│   ├── validate-hub-deployment.sh    # Hub validation (27 tests)
│   └── validate-spoke-deployment.sh  # Spoke validation (27 tests) ⭐ NEW
├── templates/
│   └── spoke/
│       └── docker-compose.template.yml  # Spoke compose template (with labels)
├── tests/
│   ├── run-tests.sh                  # Test runner (hub/spoke/all modes) ⭐ MODIFIED
│   ├── unit/
│   │   ├── test-hub-orchestration.bats      # Hub unit tests (29)
│   │   └── test-spoke-orchestration.bats    # Spoke unit tests (29) ⭐ NEW
│   ├── integration/
│   │   ├── test-hub-deployment.bats         # Hub integration tests (31)
│   │   └── test-spoke-deployment.bats       # Spoke integration tests (20) ⭐ NEW
│   ├── federation/                   # Federation tests (TO BE CREATED)
│   │   ├── test-bidirectional-sso-manual.sh      # Manual SSO testing
│   │   └── test-bidirectional-sso-automated.sh   # Automated SSO testing
│   └── utils/
│       └── test_helper.bash          # BATS test helpers
└── terraform/                        # Keycloak IaC
    ├── modules/
    │   ├── keycloak-realm/           # Realm creation
    │   ├── keycloak-client/          # Client configuration
    │   ├── keycloak-idp/             # IdP configuration
    │   └── protocol-mappers/         # Attribute mapping
    └── spoke/                        # Spoke-specific Terraform
```

**Key Files Modified This Session**:
- ⭐ NEW: `scripts/validate-spoke-deployment.sh`
- ⭐ NEW: `tests/unit/test-spoke-orchestration.bats`
- ⭐ NEW: `tests/integration/test-spoke-deployment.bats`
- ⭐ MODIFIED: `tests/run-tests.sh` (added spoke support)
- ⭐ ENHANCED: `scripts/dive-modules/utilities/compose-parser.sh` (spoke functions)
- 🔧 FIXED: 83 module files (unbound variable guards)

---

## Gap Analysis: Current State vs. Target State

### Phase 1: Testing Infrastructure (✅ COMPLETE)

| Component | Current State | Target State | Status |
|-----------|--------------|--------------|--------|
| GCP Authentication | ✅ Implemented | Automatic secret loading | ✅ COMPLETE |
| Dynamic Service Discovery | ✅ Implemented | Parse compose labels | ✅ COMPLETE |
| Spoke Validation Script | ✅ 27 tests | Match hub pattern | ✅ COMPLETE |
| Spoke Unit Tests | ✅ 29 tests | BATS framework | ✅ COMPLETE |
| Spoke Integration Tests | ✅ 20 tests | BATS framework | ✅ COMPLETE |
| Test Runner | ✅ hub/spoke/all modes | Execute all suites | ✅ COMPLETE |
| Module Loading | ✅ 83 files fixed | set -u compatible | ✅ COMPLETE |

**Phase 1 Score**: 7/7 complete (100%)

### Phase 2: Bidirectional SSO Validation (🚧 IN PROGRESS)

| Component | Current State | Target State | Status |
|-----------|--------------|--------------|--------|
| **Sprint 2.1: Manual SSO Testing** | | | |
| Spoke Deployment | ⚠️ None deployed | Deploy FRA spoke | 🔴 BLOCKED |
| Hub → Spoke SSO | ❌ Not tested | Manual browser test | 🔴 BLOCKED |
| Spoke → Hub SSO | ❌ Not tested | Manual browser test | 🔴 BLOCKED |
| Federation DB State | ⚠️ Empty | Verify link records | 🔴 BLOCKED |
| SSO Flow Documentation | ❌ Missing | Document actual flows | 🔴 BLOCKED |
| Issue Identification | ❌ Unknown | Document all issues | 🔴 BLOCKED |
| **Sprint 2.2: Automated SSO Testing** | | | |
| SSO Test Framework | ❌ Missing | Token-based testing | 🔴 NOT STARTED |
| Hub → Spoke Tests | ❌ Missing | Automated tests | 🔴 NOT STARTED |
| Spoke → Hub Tests | ❌ Missing | Automated tests | 🔴 NOT STARTED |
| Multi-Spoke Tests | ❌ Missing | FRA ↔ GBR ↔ DEU | 🔴 NOT STARTED |
| Federation Health | ❌ Missing | Periodic checks | 🔴 NOT STARTED |

**Phase 2 Score**: 0/11 complete (0%) - Ready to start!

### Phase 3: Performance Optimization (📋 PLANNED)

| Component | Current State | Target State | Status |
|-----------|--------------|--------------|--------|
| Startup Time Profiling | ❌ Missing | Measure all services | 📋 PLANNED |
| Parallel Deployment | ⚠️ Sequential | Level-based parallel | 📋 PLANNED |
| Health Check Tuning | ⚠️ Default | Optimized intervals | 📋 PLANNED |
| Caching Strategy | ❌ Missing | Decision cache (60s) | 📋 PLANNED |
| Resource Limits | ⚠️ Basic | K8s-ready limits | 📋 PLANNED |
| Load Testing | ❌ Missing | 100 req/s sustained | 📋 PLANNED |

**Phase 3 Score**: 0/6 complete (0%)

### Phase 4: Production Hardening (📋 PLANNED)

| Component | Current State | Target State | Status |
|-----------|--------------|--------------|--------|
| Circuit Breaker | ✅ Code exists | Test & verify | 📋 PLANNED |
| Auto-Recovery | ✅ Code exists | Test & verify | 📋 PLANNED |
| Monitoring Dashboards | ⚠️ Basic Grafana | Complete dashboards | 📋 PLANNED |
| Alerting Rules | ⚠️ Basic alerts | Production alerts | 📋 PLANNED |
| Backup/Restore | ⚠️ Manual | Automated backups | 📋 PLANNED |
| Disaster Recovery | ❌ Missing | DR runbook | 📋 PLANNED |
| Security Audit | ❌ Missing | Full security review | 📋 PLANNED |

**Phase 4 Score**: 0/7 complete (0%)

**Overall Progress**: Phase 1 Complete (7/31 total tasks = 23%)

---

## Phased Implementation Plan

### Phase 2: Bidirectional SSO Validation

**Timeline**: 2-3 days  
**Prerequisites**: Phase 1 complete ✅, Hub running ✅  
**Primary Goal**: Verify automatic bidirectional SSO works as designed

#### Sprint 2.1: Manual SSO Flow Testing (Day 1)

**SMART Goals**:
1. Deploy FRA spoke successfully with all CORE services healthy
2. Manually verify Hub → Spoke SSO via browser (USA → FRA)
3. Manually verify Spoke → Hub SSO via browser (FRA → USA)
4. Confirm federation database records created correctly
5. Document actual SSO flows with screenshots/logs

**Tasks**:

1. **Clean Slate Deployment** (30 min)
   ```bash
   # Start fresh
   ./dive nuke --confirm
   ./dive hub up
   
   # Wait for hub health
   ./dive hub status
   # Verify: 11/11 services healthy
   ```

2. **Deploy FRA Spoke** (45 min)
   ```bash
   # Initialize FRA spoke
   ./dive spoke init FRA "France Defence"
   
   # Deploy spoke
   ./dive spoke deploy FRA
   
   # Verify deployment
   ./dive spoke status FRA
   # Expected: All CORE services healthy
   # Expected: Federation status "Bidirectional: Active"
   ```

3. **Verify Federation Database State** (15 min)
   ```bash
   # Check federation links table
   docker exec dive-hub-postgres psql -U postgres -d orchestration \
     -c "SELECT * FROM federation_links WHERE source_code = 'fra' OR target_code = 'fra';"
   
   # Expected results:
   # - Row: fra → usa, SPOKE_TO_HUB, usa-idp, ACTIVE
   # - Row: usa → fra, HUB_TO_SPOKE, fra-idp, ACTIVE
   
   # Check health records
   docker exec dive-hub-postgres psql -U postgres -d orchestration \
     -c "SELECT * FROM federation_health ORDER BY check_timestamp DESC LIMIT 4;"
   
   # Expected: Recent health checks for both directions
   ```

4. **Manual Hub → Spoke SSO Test** (30 min)
   ```bash
   # Test steps:
   1. Open browser: https://localhost:3000 (Hub frontend)
   2. Click "Login" → Redirects to Hub Keycloak
   3. Login as test user: testuser-us / DiveTest2025!
   4. Verify logged into Hub dashboard
   5. Navigate to: https://localhost:3010 (FRA frontend, port 3000 + 10)
   6. Should automatically redirect to FRA Keycloak
   7. FRA Keycloak should detect existing USA session
   8. Should auto-login to FRA without re-entering credentials
   9. Verify user attributes displayed (clearance, country, COI)
   
   # Document:
   - Browser network tab (OIDC token exchanges)
   - Keycloak admin console (session brokering)
   - Backend logs (authorization decisions)
   ```

5. **Manual Spoke → Hub SSO Test** (30 min)
   ```bash
   # Test steps:
   1. Logout from all sessions
   2. Open browser: https://localhost:3010 (FRA frontend)
   3. Click "Login" → Redirects to FRA Keycloak
   4. Login as test user: testuser-fra / DiveTest2025!
   5. Verify logged into FRA dashboard
   6. Navigate to: https://localhost:3000 (Hub frontend)
   7. Should automatically redirect to Hub Keycloak
   8. Hub Keycloak should detect existing FRA session
   9. Should auto-login to Hub without re-entering credentials
   10. Verify user attributes normalized (FRA → USA format)
   
   # Document:
   - Token claim mapping (FRA attributes → normalized)
   - IdP chaining behavior
   - Any errors or warnings
   ```

6. **Issue Identification** (20 min)
   - Document any SSO failures
   - Check Keycloak logs: `docker logs dive-hub-keycloak 2>&1 | tail -100`
   - Check Keycloak logs: `docker logs dive-spoke-fra-keycloak 2>&1 | tail -100`
   - Check federation module logs in orchestration database
   - Prioritize issues (critical vs. minor)

7. **Fix Issues** (Variable time)
   - Address any blocking issues discovered
   - Update federation setup code if needed
   - Re-test after fixes
   - Commit fixes with detailed messages

**Success Criteria**:
- ✅ FRA spoke deploys successfully (all CORE services healthy)
- ✅ Hub → Spoke SSO works without manual intervention
- ✅ Spoke → Hub SSO works without manual intervention
- ✅ Federation database shows both links as ACTIVE
- ✅ Token claims correctly mapped between instances
- ✅ All critical issues documented and fixed

**Deliverables**:
- `docs/MANUAL-SSO-TEST-RESULTS.md` - Detailed test results
- Screenshots of SSO flows (stored in `docs/sso-screenshots/`)
- Updated federation code (if issues found)
- Git commits for any fixes

#### Sprint 2.2: Automated SSO Test Framework (Day 2-3)

**SMART Goals**:
1. Create token-based SSO testing (no browser required)
2. Implement 10+ automated Hub → Spoke SSO tests
3. Implement 10+ automated Spoke → Hub SSO tests
4. Test multi-spoke scenarios (FRA ↔ GBR, FRA ↔ DEU)
5. Achieve 100% test pass rate

**Tasks**:

1. **Design Test Framework** (1 hour)
   ```bash
   # Create test structure
   mkdir -p tests/federation
   touch tests/federation/test-bidirectional-sso-automated.sh
   chmod +x tests/federation/test-bidirectional-sso-automated.sh
   ```

   **Framework Requirements**:
   - Use Keycloak token endpoint (no browser)
   - Test token exchange between realms
   - Verify claim mapping
   - Check authorization decisions via backend API
   - Record results in federation_health table
   - Support parallel test execution

2. **Implement SSO Test Utilities** (2 hours)
   ```bash
   # Create test utilities
   tests/federation/sso-test-utils.sh:
   
   # Functions to implement:
   - sso_get_token() - Get access token from Keycloak
   - sso_exchange_token() - Exchange token between realms
   - sso_verify_claims() - Verify JWT claims
   - sso_test_backend_access() - Test backend API with token
   - sso_check_authz_decision() - Verify OPA authorization
   - sso_record_test_result() - Save to database
   ```

3. **Implement Hub → Spoke Tests** (3 hours)
   ```bash
   # Test cases to implement:
   
   test_hub_to_spoke_token_exchange() {
     # Get token from Hub
     hub_token=$(sso_get_token "usa" "testuser-us" "DiveTest2025!")
     
     # Exchange token for Spoke
     spoke_token=$(sso_exchange_token "$hub_token" "usa" "fra")
     
     # Verify claims preserved
     sso_verify_claims "$spoke_token" "uniqueID" "clearance" "countryOfAffiliation"
     
     # Test backend access
     sso_test_backend_access "fra" "$spoke_token" "/api/resources"
   }
   
   test_hub_to_spoke_clearance_mapping() {
     # Test SECRET clearance user
     # Verify can access SECRET resources in spoke
   }
   
   test_hub_to_spoke_coi_mapping() {
     # Test FVEY COI user
     # Verify COI attribute preserved
   }
   
   test_hub_to_spoke_authz_decision() {
     # Test authorization decision via PEP/PDP
     # Verify OPA policy enforced
   }
   
   # Additional tests:
   - test_hub_to_spoke_token_refresh()
   - test_hub_to_spoke_invalid_token()
   - test_hub_to_spoke_expired_token()
   - test_hub_to_spoke_missing_claims()
   - test_hub_to_spoke_releasability_check()
   - test_hub_to_spoke_classification_check()
   ```

4. **Implement Spoke → Hub Tests** (3 hours)
   ```bash
   # Mirror Hub → Spoke tests in reverse
   
   test_spoke_to_hub_token_exchange() { ... }
   test_spoke_to_hub_clearance_mapping() { ... }
   test_spoke_to_hub_coi_normalization() { ... }
   test_spoke_to_hub_authz_decision() { ... }
   
   # Spoke-specific tests:
   - test_spoke_to_hub_country_normalization()
   - test_spoke_to_hub_attribute_enrichment()
   - test_spoke_to_hub_industry_user()
   ```

5. **Implement Multi-Spoke Tests** (2 hours)
   ```bash
   # Deploy multiple spokes
   ./dive spoke deploy FRA
   ./dive spoke deploy GBR
   ./dive spoke deploy DEU
   
   # Test scenarios:
   test_multi_spoke_fra_to_gbr() {
     # User from FRA should access GBR resources
     # Via Hub brokering (FRA → Hub → GBR)
   }
   
   test_multi_spoke_triangle() {
     # Test: FRA → Hub → GBR → Hub → DEU
     # Verify token chain preserved
   }
   
   test_multi_spoke_simultaneous() {
     # Test multiple users SSO at same time
     # Verify no interference
   }
   ```

6. **Integrate with Test Runner** (30 min)
   ```bash
   # Update tests/run-tests.sh
   
   # Add federation test mode
   if [ "$TEST_MODE" = "all" ] || [ "$TEST_MODE" = "federation" ]; then
     run_test_suite "Federation SSO Tests" \
       "tests/federation/test-bidirectional-sso-automated.sh"
   fi
   
   # Usage:
   ./tests/run-tests.sh federation
   ```

7. **Performance & Reliability** (1 hour)
   ```bash
   # Add performance metrics
   - Measure SSO latency (target: p95 < 500ms)
   - Test under load (10 concurrent users)
   - Test with network delays
   - Test with Keycloak restarts
   - Verify exponential backoff works
   ```

**Success Criteria**:
- ✅ 20+ automated SSO tests implemented
- ✅ 100% test pass rate
- ✅ Tests run without manual intervention
- ✅ Multi-spoke scenarios validated
- ✅ Performance within targets (p95 < 500ms)
- ✅ All results recorded in federation_health table

**Deliverables**:
- `tests/federation/test-bidirectional-sso-automated.sh` (main test suite)
- `tests/federation/sso-test-utils.sh` (test utilities)
- Updated `tests/run-tests.sh` (federation mode)
- `docs/AUTOMATED-SSO-TEST-RESULTS.md` (test report)

---

### Phase 3: Performance Optimization (3-4 days)

**Primary Goal**: Achieve production-ready performance targets

**SMART Goals**:
1. Hub startup < 60 seconds (p95)
2. Spoke startup < 90 seconds (p95)
3. Authorization decision latency < 200ms (p95)
4. Support 100 req/s sustained throughput
5. Memory usage < 4GB per instance

**Key Tasks**:
- Profile service startup times
- Implement level-based parallel deployment
- Optimize health check intervals
- Add decision caching (60s TTL)
- Configure resource limits
- Run load tests (k6 or Artillery)

**Success Criteria**:
- All performance targets met
- No service crashes under load
- Graceful degradation if OPTIONAL services fail
- Resource usage within limits

---

### Phase 4: Production Hardening (4-5 days)

**Primary Goal**: Production-ready resilience and monitoring

**SMART Goals**:
1. Circuit breaker tested and functional
2. Auto-recovery tested for all failure scenarios
3. Complete monitoring dashboards deployed
4. Alert rules configured and tested
5. DR runbook documented and tested

**Key Tasks**:
- Test circuit breaker with chaos engineering
- Test auto-recovery (kill containers, corrupt state)
- Build Grafana dashboards (Keycloak, OPA, Federation)
- Configure Prometheus alert rules
- Implement automated backups
- Document disaster recovery procedures
- Security audit (OWASP Top 10)

**Success Criteria**:
- System recovers from all tested failure scenarios
- Alerts fire correctly (no false positives)
- Dashboards provide actionable insights
- DR procedures validated
- Security scan passes

---

## Immediate Next Steps

### Step 1: Deploy FRA Spoke

```bash
# Ensure hub is running
./dive hub status

# Initialize FRA spoke
./dive spoke init FRA "France Defence"

# Deploy FRA spoke
./dive spoke deploy FRA

# Verify deployment
./dive spoke status FRA
./scripts/validate-spoke-deployment.sh FRA

# Check federation status
docker exec dive-hub-postgres psql -U postgres -d orchestration \
  -c "SELECT * FROM federation_links;"
```

### Step 2: Manual SSO Testing

Follow Sprint 2.1 tasks above for detailed test procedures.

### Step 3: Document Findings

Create `docs/MANUAL-SSO-TEST-RESULTS.md` with:
- Test execution log (timestamps, steps, results)
- Screenshots of SSO flows
- Token claim examples (redacted secrets)
- Any issues discovered
- Recommendations for automated testing

### Step 4: Build Automated Framework

Follow Sprint 2.2 tasks above to create token-based SSO tests.

---

## Critical Questions to Answer

1. **Federation Verification**:
   - Does `spoke_federation_setup()` complete without errors?
   - Are both federation links (HUB_TO_SPOKE and SPOKE_TO_HUB) created?
   - Does the exponential backoff verification succeed?
   - Are health checks recorded in `federation_health` table?

2. **SSO Flow**:
   - Does token exchange work in both directions?
   - Are user attributes correctly mapped (clearance, country, COI)?
   - Does Keycloak session brokering work transparently?
   - Are there any token expiration issues?

3. **Authorization**:
   - Does OPA receive correct claims from bridged tokens?
   - Are authorization decisions consistent across instances?
   - Do releasability rules work correctly (e.g., USA resource accessible by FRA user)?

4. **Performance**:
   - What is SSO latency (Hub → Spoke and Spoke → Hub)?
   - Does caching improve performance?
   - Are there any bottlenecks in federation verification?

5. **Resilience**:
   - What happens if Hub Keycloak is temporarily unavailable?
   - What happens if federation link is in FAILED state?
   - Does auto-recovery work for federation issues?

---

## Deferred Actions

### Future Enhancements (Post-Phase 4)

1. **Multi-Region Federation**:
   - Support spoke-to-spoke federation (not just hub-spoke)
   - Implement regional hubs (e.g., European hub)
   - Cross-region SSO testing

2. **Advanced Monitoring**:
   - Federation topology visualization
   - Real-time SSO flow tracing
   - Anomaly detection for SSO failures

3. **KAS Integration** (Stretch Goal):
   - Key Access Service for encrypted resources
   - Policy-bound key release
   - Audit trail for key access

4. **Multi-IdP Support**:
   - Add France SAML IdP
   - Add Canada OIDC IdP
   - Add Industry IdP (GitHub, Google)
   - Test attribute mapping for each IdP

5. **Kubernetes Migration**:
   - Convert Docker Compose to K8s manifests
   - Deploy to GKE
   - Test federation in K8s environment

---

## Success Metrics & KPIs

### Phase 2 Success Metrics

**Functional**:
- ✅ FRA spoke deploys successfully (exit code 0)
- ✅ Hub → Spoke SSO works (manual test passes)
- ✅ Spoke → Hub SSO works (manual test passes)
- ✅ Federation database records created (2 links)
- ✅ 20+ automated SSO tests pass

**Performance**:
- ✅ SSO latency < 500ms (p95)
- ✅ Token exchange < 200ms (p95)
- ✅ Federation verification < 10s (exponential backoff)

**Quality**:
- ✅ 100% automated test pass rate
- ✅ Zero manual intervention required
- ✅ All issues documented and fixed
- ✅ Code reviewed and committed

### Overall Project KPIs

**Deployment**:
- Hub startup: < 60s (p95)
- Spoke startup: < 90s (p95)
- Federation setup: < 15s (both directions)

**Testing**:
- Hub tests: 87 (baseline)
- Spoke tests: 76 (achieved)
- Federation tests: 20+ (target)
- **Total: 183+ tests**

**Reliability**:
- Test pass rate: 100%
- Deployment success rate: 100%
- Zero manual Docker commands required

**Code Quality**:
- No hardcoded service lists
- No unbound variable errors
- No technical debt carried forward
- 100% GCP Secret Manager usage (no .env files)

---

## Testing Strategy

### Test Pyramid

```
         /\
        /  \  E2E Tests (Federation SSO)
       /    \  - Manual browser tests (6)
      /------\  - Automated token tests (20+)
     /        \
    / Integration \  Deployment Tests
   /   Tests      \  - Hub integration (31)
  /                \  - Spoke integration (20)
 /------------------\
/   Unit Tests       \
- Hub orchestration (29)
- Spoke orchestration (29)
- Compose parser tests (15)
```

### Test Execution

```bash
# Run all tests
./tests/run-tests.sh all

# Run only spoke tests
./tests/run-tests.sh spoke

# Run only federation tests
./tests/run-tests.sh federation

# Run tests for specific spoke
SPOKE_TEST_INSTANCE=GBR ./tests/run-tests.sh spoke

# Run with verbose output
VERBOSE=1 ./tests/run-tests.sh all
```

### Continuous Testing

- Run tests after every deployment
- Run tests before every commit (pre-commit hook)
- Run full suite nightly
- Monitor test duration trends

---

## Risk Management

### Known Risks

1. **Keycloak Session Brokering Complexity**
   - **Risk**: Token exchange may fail silently
   - **Mitigation**: Extensive logging, health checks, automated tests
   - **Contingency**: Manual federation link command available

2. **Database State Corruption**
   - **Risk**: Federation state may become inconsistent
   - **Mitigation**: Database transactions, validation checks
   - **Contingency**: `fed_db_reset_failed()` function for recovery

3. **Network Latency**
   - **Risk**: SSO may timeout in high-latency environments
   - **Mitigation**: Exponential backoff, configurable timeouts
   - **Contingency**: Increase timeout values in production

4. **GCP Secret Manager Outage**
   - **Risk**: Secrets unavailable, deployment blocked
   - **Mitigation**: Local .env fallback, caching
   - **Contingency**: Manual secret loading from backup

### Risk Mitigation Checklist

- ✅ Automated backups of orchestration database
- ✅ Federation state recovery procedures documented
- ✅ Health checks detect issues early
- ✅ Circuit breaker prevents cascading failures
- ✅ Comprehensive logging for troubleshooting
- ✅ Test coverage for failure scenarios

---

## Appendix

### Useful Commands

```bash
# Hub Management
./dive hub up              # Start hub
./dive hub status          # Check status
./dive hub logs <service>  # View logs
./dive hub down            # Stop hub

# Spoke Management
./dive spoke init <CODE> "<NAME>"     # Initialize spoke
./dive spoke deploy <CODE>            # Deploy spoke
./dive spoke status <CODE>            # Check status
./dive spoke logs <CODE> <service>    # View logs
./dive spoke down <CODE>              # Stop spoke

# Federation Management
./dive federation status              # Overall status
./dive federation verify <CODE>       # Verify spoke federation
./dive federation link <CODE>         # Manual federation link

# Testing
./tests/run-tests.sh all              # All tests
./tests/run-tests.sh hub              # Hub tests only
./tests/run-tests.sh spoke            # Spoke tests only
SPOKE_TEST_INSTANCE=FRA ./tests/run-tests.sh spoke  # Specific spoke

# Database Queries
docker exec dive-hub-postgres psql -U postgres -d orchestration -c "SELECT * FROM federation_links;"
docker exec dive-hub-postgres psql -U postgres -d orchestration -c "SELECT * FROM federation_health ORDER BY check_timestamp DESC LIMIT 10;"

# Clean Slate
./dive nuke --confirm                 # Nuclear option (destroy all)
```

### Key Environment Variables

```bash
# GCP Integration
USE_GCP_SECRETS=true                  # Enable GCP Secret Manager
GCP_PROJECT_ID=dive25                 # GCP project

# Testing
SPOKE_TEST_INSTANCE=FRA               # Spoke to test
VERBOSE=1                             # Verbose test output
BATS_TEST_TIMEOUT=300                 # Test timeout (seconds)

# Federation
FEDERATION_VERIFY_TIMEOUT=60          # Federation verification timeout
FEDERATION_MAX_RETRIES=5              # Max retry attempts

# Orchestration
USE_TERRAFORM_SSOT=true               # Use Terraform for Keycloak
DEPLOYMENT_PHASE_TRACKING=enabled     # Track deployment phases
```

### Reference Documentation

**This Session**:
- `docs/SPOKE-AUDIT-REPORT.md` - Phase 0 audit
- `docs/NEW-SESSION-PROMPT-SPOKE-OPTIMIZATION.md` - Original session
- `docs/NEW-SESSION-PROMPT-SPOKE-OPTIMIZATION-PHASE1-CONTINUATION.md` - Phase 1 session
- This document - Phase 2 session

**DIVE V3 Specifications**:
- `docs/dive-v3-requirements.md` - Requirements
- `docs/dive-v3-backend.md` - Backend spec
- `docs/dive-v3-frontend.md` - Frontend spec
- `docs/dive-v3-security.md` - Security design
- `docs/dive-v3-implementation-plan.md` - Original plan

**Key Code Files**:
- `scripts/dive-modules/federation-state-db.sh` - Federation database
- `scripts/dive-modules/spoke/pipeline/spoke-federation.sh` - Federation setup
- `scripts/dive-modules/spoke/pipeline/phase-configuration.sh` - Config phase
- `scripts/dive-modules/utilities/compose-parser.sh` - Service discovery

---

## Summary

This session completed **Phase 1: Critical Fixes & Parity** by implementing:
- ✅ GCP authentication for spokes
- ✅ Dynamic service discovery (eliminated hardcoded arrays)
- ✅ Comprehensive testing infrastructure (76 new tests)
- ✅ Critical module loading fixes (83 files)

**Next Phase**: Phase 2 - Bidirectional SSO Validation
- Deploy FRA spoke
- Manual SSO testing (Hub ↔ Spoke)
- Build automated SSO test framework (20+ tests)
- Verify federation database state

**Key Insight**: Federation is database-driven, not static configuration. The `federation-state-db.sh` module manages bidirectional federation state in PostgreSQL, enabling automated recovery and health monitoring.

**Ready to Proceed**: All prerequisites met, hub running, module loading fixed, testing infrastructure in place.

---

**⚠️ REMEMBER**:
- Use `./dive` CLI for ALL operations (no manual Docker commands)
- Authorization to `./dive nuke` for clean slate testing
- Follow best practices (no shortcuts or workarounds)
- Test after every change
- Commit frequently with detailed messages
- Document everything

**Let's build production-ready bidirectional SSO! 🚀**
