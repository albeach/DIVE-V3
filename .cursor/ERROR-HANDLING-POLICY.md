# DIVE V3 Error Handling Policy
**Version**: 1.0  
**Date**: 2026-01-27  
**Status**: ACTIVE  

---

## Purpose

This document defines the canonical error handling policy for the DIVE V3 deployment pipeline. It categorizes all failure scenarios into **hard failures** (must stop deployment), **warnings** (continue with caution), or **verbose info** (progress updates).

## Motivation

The deployment pipeline previously had inconsistent error handling:
- Critical failures treated as warnings (soft-fail)
- Deployments marked "complete" while actually broken
- Difficult to debug due to masked failures
- No clear policy on what should stop vs. continue

This policy eliminates ambiguity and ensures fail-fast behavior for critical issues.

---

## Error Categories

### 🔴 HARD FAILURE (Must Stop Deployment)

**Definition**: Issues that break core functionality or leave the system in an unusable state.

**Behavior**:
- Log error message with `log_error`
- Return non-zero exit code (`return 1` or `exit 1`)
- Stop deployment immediately
- Set deployment state to FAILED
- Rollback if safe to do so

**Examples**:
- Missing required secrets (production mode)
- Database connection failures
- Container start failures (core services)
- Federation setup failures
- Terraform apply failures
- Certificate validation failures
- User seeding failures
- Resource seeding verification failures

**Code Pattern**:
```bash
if [ condition_failed ]; then
    log_error "Critical failure: <description>"
    log_error "Impact: <what is broken>"
    log_error "Fix: <how to resolve>"
    return 1
fi
```

---

### ⚠️ WARNING (Continue with Caution)

**Definition**: Non-critical issues that don't prevent core functionality but indicate degraded state or missing optional features.

**Behavior**:
- Log warning message with `log_warn`
- Continue deployment
- Mark warning in deployment summary
- Return zero exit code

**Examples**:
- Optional services failed to start (KAS, monitoring)
- Dev mode secret fallbacks (.env instead of GCP)
- Performance degradations
- Non-critical feature failures
- State tracking issues (observability)
- Checkpoint creation failures

**Code Pattern**:
```bash
if [ optional_feature_failed ]; then
    log_warn "Optional feature failed: <description>"
    log_warn "Impact: <what is degraded>"
    # Continue deployment
fi
```

---

### 📝 VERBOSE INFO (Progress Updates)

**Definition**: Informational messages for debugging and progress tracking. Not errors or warnings.

**Behavior**:
- Log with `log_verbose` or `log_info`
- Only shown when verbose mode enabled
- No impact on deployment success
- Return zero exit code

**Examples**:
- Retry attempt notifications
- Successful fallback operations
- Progress updates ("Waiting for X... 30s elapsed")
- Debug information
- Successful operations

**Code Pattern**:
```bash
log_verbose "Waiting for service to be ready... ${elapsed}s elapsed"
log_info "Successful operation: <description>"
```

---

## Categorization Matrix

### Secrets & Configuration

| Scenario | Category | Mode | Rationale |
|----------|----------|------|-----------|
| Missing GCP secret (required) | 🔴 HARD FAILURE | Prod | System unusable |
| Missing GCP secret (required) | ⚠️ WARNING | Dev | .env fallback OK for dev |
| Missing .env secret (no fallback) | 🔴 HARD FAILURE | All | No way to proceed |
| GCP authentication failed | 🔴 HARD FAILURE | Prod | Cannot access secrets |
| Secret sync failed | 🔴 HARD FAILURE | All | Containers won't have credentials |

### Authentication & Federation

| Scenario | Category | Flag | Rationale |
|----------|----------|------|-----------|
| Federation setup failed | 🔴 HARD FAILURE | None | Spoke unusable without federation |
| Federation setup failed | ⚠️ WARNING | `--skip-federation` | User explicitly skipped |
| Hub registration failed | 🔴 HARD FAILURE | None | Spoke must be registered |
| Manual approval failed | 🔴 HARD FAILURE | None | User approval required |
| Auto-approval failed, manual fallback works | ⚠️ WARNING | None | Manual approval valid |
| Keycloak admin API not ready | 🔴 HARD FAILURE | None | Blocks configuration |
| OPAL token provisioning failed | 🔴 HARD FAILURE | None | Policy enforcement broken |
| Redirect URI update failed | 🔴 HARD FAILURE | None | OAuth login broken |

### Infrastructure

| Scenario | Category | Rationale |
|----------|----------|-----------|
| Core service failed to start | 🔴 HARD FAILURE | System unusable |
| Optional service failed to start (KAS) | ⚠️ WARNING | Stretch goal, not critical |
| Stretch service failed to start | ⚠️ WARNING | Experimental feature |
| MongoDB not PRIMARY | 🔴 HARD FAILURE | Cannot write data |
| PostgreSQL not accessible | 🔴 HARD FAILURE | NextAuth broken |
| Redis not accessible | 🔴 HARD FAILURE | Session management broken |
| Terraform init failed | 🔴 HARD FAILURE | Infrastructure not configured |
| Terraform apply failed | 🔴 HARD FAILURE | Keycloak realm not created |
| Terraform module not available | 🔴 HARD FAILURE | Required for Keycloak |

### Certificates & Trust

| Scenario | Category | Rationale |
|----------|----------|-----------|
| Certificate missing required SAN | 🔴 HARD FAILURE | Federation will fail validation |
| Java truststore generation failed | 🔴 HARD FAILURE | Keycloak mTLS broken |
| Certificate incomplete SANs (Hub missing) | 🔴 HARD FAILURE | Hub federation will fail |
| SSOT cert generation failed, fallback works | 📝 VERBOSE | Fallback succeeded |
| Cert regeneration failed, existing OK | ⚠️ WARNING | Can use existing |

### Seeding & Data

| Scenario | Category | Rationale |
|----------|----------|-----------|
| User seeding failed | 🔴 HARD FAILURE | Cannot login |
| Resource seeding failed | 🔴 HARD FAILURE | No data to access |
| Resource verification failed (count mismatch) | 🔴 HARD FAILURE | Data integrity issue |
| Plaintext resources (encryption failed) | ⚠️ WARNING (dev) | Security degradation |
| Plaintext resources (encryption failed) | 🔴 HARD FAILURE (prod) | Security requirement |
| COI initialization failed | 🔴 HARD FAILURE | ABAC policy broken |

### State & Checkpoints

| Scenario | Category | Rationale |
|----------|----------|-----------|
| Checkpoint exists but files missing | 🔴 HARD FAILURE | Inconsistent state, must rebuild |
| Failed to create checkpoint | ⚠️ WARNING | Checkpoint for recovery, not critical |
| State tracking DB unavailable | ⚠️ WARNING | Observability feature |
| State missing from file vs. DB | ⚠️ WARNING | Tracking inconsistency |

### Networking & Connectivity

| Scenario | Category | Rationale |
|----------|----------|-----------|
| Hub unreachable (preflight) | 🔴 HARD FAILURE | Spoke needs Hub |
| Port conflict detected (preflight) | 🔴 HARD FAILURE | Services won't start |
| Docker not available | 🔴 HARD FAILURE | Cannot deploy anything |
| Network connectivity lost mid-deployment | 🔴 HARD FAILURE | Undefined state |

---

## Mode-Specific Behavior

### Production Mode
**Detection**: `DIVE_ENV=production` or deployed to cloud

- All security failures are HARD FAILURES
- Must use GCP Secret Manager (no .env fallback)
- Plaintext resources not allowed
- Strict certificate validation
- No optional service failures allowed (all services required)

### Development Mode
**Detection**: `DIVE_ENV=development` or `DIVE_ENV` unset

- Security warnings allowed (use .env fallback)
- Plaintext resources allowed (with warning)
- Optional services can fail (KAS, monitoring)
- Looser certificate validation

### Test/CI Mode
**Detection**: `DIVE_ENV=test` or `CI=true`

- Similar to production for failures
- Allows test-specific mocks
- Stricter timeouts (fail fast)

---

## Flag-Based Overrides

### --skip-federation
**Usage**: `./dive spoke deploy EST --skip-federation`

**Effect**: Downgrades federation failures from HARD FAILURE → WARNING

**Use Cases**:
- Troubleshooting spoke deployment issues
- Testing spoke in isolation
- Hub unavailable temporarily

**Warnings**:
- Spoke will be unusable without federation
- Must run `./dive spoke register EST` afterward

### --force
**Usage**: `./dive spoke deploy EST --force`

**Effect**: Skips preflight validation checks

**Use Cases**:
- Emergency deployments
- Known issues being bypassed

**Warnings**:
- Dangerous - can lead to broken deployments
- Only use when absolutely necessary

### --dev-mode
**Usage**: `./dive spoke deploy EST --dev-mode`

**Effect**: Enables development mode overrides

**Use Cases**:
- Local development
- Testing without GCP access

---

## Implementation Guidelines

### 1. Use Mode Detection

```bash
# Detect deployment mode
is_production_mode() {
    [ "${DIVE_ENV:-}" = "production" ] || [ -n "${KUBERNETES_SERVICE_HOST:-}" ]
}

# Apply mode-specific policy
if is_production_mode; then
    # Strict validation
    if [ -z "$GCP_SECRET" ]; then
        log_error "Production requires GCP secrets"
        return 1
    fi
else
    # Dev mode fallback
    if [ -z "$GCP_SECRET" ]; then
        log_warn "Using .env fallback (dev mode only)"
        SECRET="${ENV_SECRET}"
    fi
fi
```

### 2. Implement Preflight Validation

All HARD FAILURE conditions should be checked in **PREFLIGHT phase** when possible:

```bash
spoke_preflight_validation() {
    local instance_code="$1"
    
    log_step "Running preflight validation..."
    
    # Check 1: Hub reachable
    if ! curl -sf "$HUB_URL/health" >/dev/null 2>&1; then
        log_error "Hub unreachable at $HUB_URL"
        log_error "Spoke deployment requires Hub to be running"
        return 1
    fi
    
    # Check 2: Required secrets available
    if ! verify_required_secrets "$instance_code"; then
        log_error "Required secrets missing"
        return 1
    fi
    
    # Check 3: Port conflicts
    if ! verify_ports_available "$instance_code"; then
        log_error "Port conflicts detected"
        return 1
    fi
    
    log_success "Preflight validation passed"
}
```

### 3. Fail Fast Strategy

- Check conditions **before** expensive operations
- Return immediately on HARD FAILURE
- Don't attempt recovery for critical failures
- Clear error messages with fix instructions

### 4. Error Message Format

```bash
log_error "ERROR: <one-line summary>"
log_error "Impact: <what is broken / what won't work>"
log_error "Cause: <why this happened>"
log_error "Fix: <how to resolve>"
```

**Example**:
```bash
log_error "ERROR: Keycloak admin API not ready after 180s"
log_error "Impact: Federation setup cannot proceed"
log_error "Cause: Keycloak container healthy but admin console not initialized"
log_error "Fix: Check Keycloak logs: docker logs dive-spoke-est-keycloak"
```

---

## Testing Requirements

### Test Scenarios

Each category must have test coverage:

1. **Hard Failure Test**: Verify deployment stops
   ```bash
   # Simulate missing secret
   unset KEYCLOAK_ADMIN_PASSWORD
   ./dive spoke deploy EST
   # Expected: Exit code 1, deployment FAILED
   ```

2. **Warning Test**: Verify deployment continues
   ```bash
   # Simulate KAS failure
   ./dive spoke deploy EST  # KAS fails to start
   # Expected: Exit code 0, deployment COMPLETE with warnings
   ```

3. **Mode Test**: Verify mode-specific behavior
   ```bash
   # Prod mode requires GCP
   DIVE_ENV=production ./dive spoke deploy EST
   # Expected: Fails if GCP secrets missing
   
   # Dev mode allows .env
   DIVE_ENV=development ./dive spoke deploy EST
   # Expected: Warns but continues with .env
   ```

---

## Migration Path

### Phase 3.2-3.4 Implementation

Based on `.cursor/SOFT-FAIL-AUDIT.md`, upgrade these to HARD FAILURES:

**Priority 0 (Week 1)**:
1. Secret sync failures → hard fail
2. OPAL token provisioning → hard fail
3. Redirect URI failures → hard fail
4. Federation setup failures → hard fail (add `--skip-federation` flag)
5. Manual approval failures → hard fail
6. Terraform failures → hard fail
7. Certificate SAN validation → hard fail

**Priority 1 (Week 2)**:
8. Resource seeding verification → hard fail
9. Java truststore generation → hard fail
10. Missing .env secrets (no fallback) → hard fail
11. GCP authentication failures → hard fail
12. Checkpoint inconsistencies → hard fail + cleanup

---

## Success Metrics

### Before Policy Implementation
- ❌ Deployments marked "complete" but broken
- ❌ Soft-fail warnings mask critical failures
- ❌ Debugging requires log archaeology
- ❌ No clear policy on error handling

### After Policy Implementation
- ✅ Deployments fail fast on critical issues
- ✅ Clear distinction between errors and warnings
- ✅ Preflight catches issues before deployment
- ✅ Error messages include fix instructions
- ✅ Mode-specific behavior documented and tested

---

## Compliance

This policy aligns with:
- ✅ Fail-fast principle (stop early on critical errors)
- ✅ Clear error messages (what, why, how to fix)
- ✅ Best practices (preflight validation)
- ✅ Production readiness (strict in prod, flexible in dev)

---

## References

- **Soft-Fail Audit**: `.cursor/SOFT-FAIL-AUDIT.md`
- **Handoff Document**: `.cursor/NEW-SESSION-HANDOFF-PROMPT.md`
- **Root Cause Analysis**: `ROOT-CAUSE-FIXES-SUMMARY.md`
