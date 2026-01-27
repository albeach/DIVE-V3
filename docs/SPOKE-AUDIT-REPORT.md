# DIVE V3 Spoke Deployment Audit Report

**Date**: 2026-01-27  
**Status**: Phase 0 - Comprehensive Analysis  
**Purpose**: Document current state before optimization

---

## Executive Summary

The spoke deployment system uses a modular 6-phase pipeline architecture with checkpoint/resume capability. While the architecture is sound, there are **5 critical locations with hardcoded service arrays** that prevent dynamic service discovery. This technical debt must be eliminated to achieve parity with the hub deployment (which uses 100% dynamic discovery).

### Key Findings

| Metric | Current State | Target | Status |
|--------|--------------|--------|--------|
| **Hardcoded Service Arrays** | 5 locations | 0 | ❌ Critical |
| **Service Labels in Compose** | None | Full coverage | ❌ Missing |
| **Dynamic Service Discovery** | 0% | 100% | ❌ Not implemented |
| **GCP Authentication** | Forces production mode | Automatic fallback | ⚠️ Needs enhancement |
| **Testing Coverage** | 6 spoke tests | 70+ tests | ❌ Insufficient |
| **Performance Baseline** | Unknown | <90s | ⚠️ Needs measurement |

---

## Architecture Overview

### Pipeline Phases

The spoke deployment uses a **6-phase pipeline** coordinated by `spoke-pipeline.sh`:

1. **PREFLIGHT** - Secret loading, network setup, conflict detection
2. **INITIALIZATION** - Directory creation, compose generation, cert generation
3. **DEPLOYMENT** - 4-stage container startup with health monitoring
4. **CONFIGURATION** - Terraform, federation setup, hub registration
5. **SEEDING** - Data seeding (MongoDB, Keycloak users)
6. **VERIFICATION** - Health checks, federation validation

**Strengths**:
- ✅ Modular, well-organized code structure
- ✅ Checkpoint/resume capability for error recovery
- ✅ State tracking via orchestration database
- ✅ Deployment locks prevent concurrent conflicts
- ✅ Error recovery with retry logic framework

**Weaknesses**:
- ❌ Hardcoded service arrays in 5 files
- ❌ No dynamic service discovery from compose files
- ❌ Missing service classification (CORE/OPTIONAL/STRETCH)
- ❌ Insufficient test coverage (only 6 tests vs hub's 87)

---

## Technical Debt Inventory

### 1. Hardcoded Service Arrays (CRITICAL)

#### Location 1: `spoke-containers.sh` (Lines 29-39)

```bash
# Service startup order (respects dependencies)
readonly SPOKE_SERVICE_ORDER=(
    "postgres"
    "mongodb"
    "redis"
    "keycloak"
    "opa"
    "backend"
    "frontend"
    "kas"
    "opal-client"
)
```

**Impact**: Adding/removing a spoke service requires editing this array.

**Solution**: Replace with:
```bash
SPOKE_SERVICE_ORDER=($(compose_get_spoke_services "$INSTANCE_CODE"))
```

---

#### Location 2: `spoke-containers.sh` (Lines 42-52)

```bash
# Service dependencies (what must be healthy before starting)
declare -A SPOKE_SERVICE_DEPS=(
    ["postgres"]=""
    ["mongodb"]=""
    ["redis"]=""
    ["keycloak"]="postgres"
    ["opa"]=""
    ["backend"]="postgres mongodb redis keycloak opa"
    ["frontend"]="backend"
    ["kas"]="mongodb backend"
    ["opal-client"]="backend"
)
```

**Impact**: Dependencies duplicated instead of parsed from compose `depends_on`.

**Solution**: Parse dynamically:
```bash
compose_get_dependencies "$service" "$compose_file"
```

---

#### Location 3: `phase-deployment.sh` (Line 198)

```bash
# Core services required before proceeding
local core_services=("postgres" "mongodb" "redis" "keycloak")
```

**Impact**: Core service classification hardcoded, can't distinguish from optional services.

**Solution**: Use service labels:
```bash
local core_services=($(compose_get_services_by_class "core" "$compose_file"))
```

---

#### Location 4: `phase-verification.sh` (Line 121)

```bash
# Check each expected service
local services=("postgres" "mongodb" "redis" "keycloak" "backend" "frontend" "opa")
```

**Impact**: Verification doesn't include all services (missing kas, opal-client).

**Solution**: Discover dynamically:
```bash
local services=($(compose_get_spoke_services "$instance_code"))
```

---

#### Location 5: `phase-preflight.sh` (Line 425)

```bash
# Clean up containers stuck in "Created" state
local services="frontend backend redis keycloak postgres mongodb opa kas opal-client"
```

**Impact**: Cleanup logic needs to know all service names.

**Solution**: Discover dynamically from compose file or use docker commands.

---

### 2. Missing Service Labels in Spoke Compose Template

**Current State**: The spoke template `templates/spoke/docker-compose.template.yml` has **NO service labels**.

**Hub Comparison**: Hub compose file has complete labeling:
```yaml
postgres:
  labels:
    dive.service.class: "core"
    dive.service.description: "PostgreSQL database for Keycloak user/realm storage"
```

**Labels Found in Hub**:
- **CORE services** (8): postgres, mongodb, redis, redis-blacklist, keycloak, opa, backend, frontend
- **OPTIONAL services** (1): otel-collector
- **STRETCH services** (2): kas, opal-server

**Required Labels for Spokes**:
```yaml
# CORE - Required for basic operation
postgres, mongodb, redis, keycloak, opa, backend, frontend

# OPTIONAL - Enhanced features, deployment continues if they fail
opal-client (dynamic policy sync)

# STRETCH - Pilot demo features, warnings only
kas (key access service for encrypted resources)
```

---

### 3. GCP Authentication Issues

**Current Issue**: `spoke-deploy.sh` line 394 forces `DIVE_ENV="gcp"` which requires service account keys even in development.

**Hub Comparison**: Hub uses automatic fallback:
1. Try service account key (`gcp/usa-sa-key.json`)
2. Fall back to user authentication
3. Fall back to local `.env.hub` (dev only)

**Spoke Behavior**:
- ❌ Forces production authentication mode
- ❌ Requires service account key even for local dev
- ⚠️ Service account activation likely works (uses `common.sh:activate_gcp_service_account()`)
- ⚠️ But no fallback for development environments

**Solution**: Remove hardcoded `DIVE_ENV="gcp"` and use same environment detection as hub.

---

### 4. Testing Coverage Gaps

| Test Type | Hub | Spoke | Gap |
|-----------|-----|-------|-----|
| **Validation Script** | `validate-hub-deployment.sh` (43 tests) | None | -43 |
| **Unit Tests** | `test_dynamic_orchestration.bats` (23 tests) | None | -23 |
| **Integration Tests** | `test_deployment.bats` (21 tests) | None | -21 |
| **E2E Federation** | 6 test files | 6 test files | ✅ Equal |
| **Total** | **87 tests** | **6 tests** | **-81 tests** |

**Existing Spoke Tests** (6 files):
1. `tests/e2e/federation/spoke-deployment.test.sh` - Basic deployment E2E
2. `tests/e2e/federation/multi-spoke.test.sh` - Multi-spoke concurrent operations
3. `tests/federation/test-spoke-registration.sh` - Registration workflow
4. `tests/integration/test-hub-spoke-full-automation.sh` - Hub-spoke automation
5. `tests/e2e/spoke-admin/spoke-dashboard.spec.ts` - Playwright spoke admin UI
6. `tests/orchestration/test-spoke-secrets-fix.sh` - Spoke secrets management

**Missing Tests**:
- ❌ Spoke validation script (40+ tests needed)
- ❌ Spoke unit tests (15+ tests needed)
- ❌ Spoke integration tests (15+ tests needed)
- ❌ Automated bidirectional SSO tests

---

## Hub vs Spoke Comparison Matrix

### Architecture

| Feature | Hub | Spoke | Parity |
|---------|-----|-------|--------|
| **Pipeline Phases** | 7 phases (Preflight → Seeding) | 6 phases (Preflight → Verification) | ✅ Similar |
| **Modular Design** | Yes (deployment/hub.sh + utilities) | Yes (pipeline/*.sh modules) | ✅ Equal |
| **Checkpoint/Resume** | No | Yes | ✅ Spoke better |
| **State Tracking** | Orchestration DB | Orchestration DB | ✅ Equal |
| **Deployment Locks** | Yes | Yes | ✅ Equal |

### Service Discovery

| Feature | Hub | Spoke | Parity |
|---------|-----|-------|--------|
| **Hardcoded Arrays** | 0 | 5 | ❌ Critical gap |
| **Dynamic Discovery** | ✅ 100% from compose | ❌ None | ❌ Critical gap |
| **Service Labels** | ✅ All services labeled | ❌ No labels | ❌ Critical gap |
| **Dependency Calculation** | ✅ Dynamic from `depends_on` | ❌ Hardcoded | ❌ Critical gap |
| **Service Classification** | ✅ CORE/OPTIONAL/STRETCH | ❌ None | ❌ Critical gap |

### Authentication

| Feature | Hub | Spoke | Parity |
|---------|-----|-------|--------|
| **GCP Service Account** | ✅ Automatic activation | ⚠️ Likely works | ⚠️ Needs verification |
| **Fallback to User Auth** | ✅ Automatic | ❌ Not allowed | ❌ Gap |
| **Dev Mode (.env files)** | ✅ Automatic | ❌ Not allowed | ❌ Gap |
| **Secret Loading** | ✅ From GCP Secret Manager | ✅ From GCP Secret Manager | ✅ Equal |

### Performance

| Feature | Hub | Spoke | Parity |
|---------|-----|-------|--------|
| **Deployment Time** | 67s (EXCELLENT) | Unknown | ⚠️ Needs baseline |
| **Parallel Startup** | ✅ Dependency-level groups | ⚠️ 4-stage approach | ⚠️ May need optimization |
| **Adaptive Polling** | ✅ MongoDB replica (500ms→2s) | ⚠️ Unknown | ⚠️ Needs review |
| **Health Check Optimization** | ✅ Tuned intervals | ⚠️ Unknown | ⚠️ Needs review |

### Testing

| Feature | Hub | Spoke | Parity |
|---------|-----|-------|--------|
| **Validation Script** | ✅ 43 tests | ❌ None | ❌ Critical gap |
| **Unit Tests** | ✅ 23 tests (BATS) | ❌ None | ❌ Critical gap |
| **Integration Tests** | ✅ 21 tests (BATS) | ❌ None | ❌ Critical gap |
| **E2E Tests** | ✅ Multiple suites | ✅ 6 test files | ⚠️ Spoke has fewer |
| **Test Coverage** | **87 tests (100% passing)** | **6 tests** | ❌ **81-test gap** |

---

## Refactoring Strategy

### Priority 1: Service Labels (Required for Dynamic Discovery)

**Action**: Add `dive.service.class` and `dive.service.description` labels to spoke template.

**File**: `templates/spoke/docker-compose.template.yml`

**Example Labels**:
```yaml
postgres-{{INSTANCE_CODE_LOWER}}:
  labels:
    dive.service.class: "core"
    dive.service.description: "PostgreSQL database for Keycloak"
  # ... rest of service config

# All CORE services: postgres, mongodb, redis, keycloak, opa, backend, frontend
# OPTIONAL: opal-client
# STRETCH: kas
```

---

### Priority 2: Dynamic Service Discovery Functions

**Action**: Extend `utilities/compose-parser.sh` with spoke-specific functions.

**New Functions**:
```bash
# Get all services from spoke compose file
compose_get_spoke_services() {
  local instance_code="$1"
  local compose_file="${DIVE_ROOT}/instances/${instance_code}/docker-compose.yml"
  compose_get_services "$compose_file"
}

# Get services by classification
compose_get_spoke_services_by_class() {
  local instance_code="$1"
  local class="$2"  # core|optional|stretch
  # Implementation...
}
```

---

### Priority 3: Replace Hardcoded Arrays

**Action**: Update 5 files to use dynamic discovery.

**Files to Modify**:
1. `scripts/dive-modules/spoke/pipeline/spoke-containers.sh`
2. `scripts/dive-modules/spoke/pipeline/phase-deployment.sh`
3. `scripts/dive-modules/spoke/pipeline/phase-verification.sh`
4. `scripts/dive-modules/spoke/pipeline/phase-preflight.sh`

---

### Priority 4: Testing Infrastructure

**Action**: Create spoke test suite matching hub structure.

**Files to Create**:
1. `scripts/validate-spoke-deployment.sh` (40+ validation tests)
2. `tests/unit/test-spoke-orchestration.bats` (15+ unit tests)
3. `tests/integration/test-spoke-deployment.bats` (15+ integration tests)

---

## Code Complexity Analysis

### Spoke Deployment Modules

| File | Lines | Functions | Complexity |
|------|-------|-----------|------------|
| `spoke-deploy.sh` | 2,500+ | 50+ | Very High |
| `spoke-pipeline.sh` | 615 | 15 | Medium |
| `phase-preflight.sh` | 516 | 10 | Medium |
| `phase-initialization.sh` | 400+ | 8 | Medium |
| `phase-deployment.sh` | 850+ | 12 | High |
| `phase-configuration.sh` | 600+ | 10 | High |
| `phase-verification.sh` | 850+ | 15 | High |
| `spoke-containers.sh` | 850+ | 20 | High |

**Total Spoke Pipeline Code**: ~7,500 lines

**Hub Deployment Code**: ~1,500 lines (`deployment/hub.sh`)

**Analysis**: Spoke deployment is more complex due to:
- Multiple instances vs single hub
- Federation setup and registration
- Terraform integration for realm creation
- Checkpointing and state management

---

## Recommendations

### Immediate Actions (Phase 1)

1. ✅ **Add service labels to spoke compose template**
   - Priority: CRITICAL
   - Effort: 2-3 hours
   - Blocks: All dynamic discovery work

2. ✅ **Implement dynamic service discovery functions**
   - Priority: CRITICAL
   - Effort: 4-6 hours
   - Enables: Removal of hardcoded arrays

3. ✅ **Replace all 5 hardcoded service arrays**
   - Priority: CRITICAL
   - Effort: 3-4 hours
   - Result: Zero technical debt

4. ✅ **Fix GCP authentication fallback**
   - Priority: HIGH
   - Effort: 1-2 hours
   - Improves: Developer experience

5. ✅ **Create spoke testing infrastructure**
   - Priority: HIGH
   - Effort: 6-8 hours
   - Result: 70+ tests

### Medium-Term Actions (Phase 2-3)

6. ⚠️ **Measure performance baseline**
   - Priority: MEDIUM
   - Effort: 2-3 hours
   - Needed: For optimization

7. ⚠️ **Apply hub performance optimizations**
   - Priority: MEDIUM
   - Effort: 4-6 hours
   - Target: <90s deployment

8. ⚠️ **Automated bidirectional SSO testing**
   - Priority: MEDIUM
   - Effort: 4-6 hours
   - Ensures: Federation reliability

### Long-Term Actions (Phase 4)

9. 📋 **Production hardening**
   - Retry logic, circuit breaker, rollback
   - Effort: 2-3 days

10. 📋 **Comprehensive documentation**
    - Architecture, troubleshooting, operations
    - Effort: 1-2 days

---

## Success Criteria

Upon completion of optimization, spoke deployment must achieve:

1. ✅ **Zero hardcoded service arrays** (100% dynamic discovery)
2. ✅ **Service labels in all compose files** (CORE/OPTIONAL/STRETCH)
3. ✅ **70+ spoke tests passing** (validation + unit + integration)
4. ✅ **GCP authentication automatic** (service account → user → local)
5. ✅ **Deployment time <90s** (comparable to hub's 67s)
6. ✅ **Bidirectional SSO validated** (automated tests for hub ↔ spokes)
7. ✅ **Production-ready resilience** (retry, circuit breaker, rollback)
8. ✅ **Comprehensive documentation** (architecture + troubleshooting)

---

## Conclusion

The spoke deployment system has a **solid modular architecture** with good separation of concerns and error recovery mechanisms. However, it suffers from **technical debt in the form of 5 hardcoded service arrays** that prevent dynamic service discovery.

By applying the same patterns used in hub optimization (dynamic discovery, service classification, comprehensive testing), we can bring spoke deployment to **production-ready quality** with **zero technical debt** and **<90s deployment time**.

**Estimated Total Effort**: 12-15 days (Phases 0-4)

**Current Phase**: Phase 0 (Audit) - ✅ COMPLETE
