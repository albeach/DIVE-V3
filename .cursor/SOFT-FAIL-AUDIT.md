# Soft-Fail Warning Audit - DIVE V3 Deployment Pipeline
**Date**: 2026-01-27
**Phase**: 1.4 - Technical Debt Elimination
**Objective**: Categorize all soft-fail warnings as hard failures, warnings, or verbose

---

## Categorization Criteria

### 🔴 HARD FAILURE (Must Stop Deployment)
- Required services/features that break core functionality
- Missing critical secrets in production mode
- Federation setup failures (spoke must be federated)
- Database/storage initialization failures
- User/resource seeding failures (spoke unusable without)

### ⚠️ WARNING (Continue with Warning)
- Optional features (KAS, advanced monitoring)
- Dev mode secret fallbacks (.env file OK in dev)
- Performance degradations
- Non-critical feature failures

### 📝 VERBOSE (Info-Level Only)
- Progress updates
- Retry attempt notifications
- Successful fallback operations
- Debug information

---

## Audit Results by File

### 1. federation-link.sh (16 warnings)

#### Line 73: Failed to create GCP secret
```bash
log_warn "Failed to create GCP secret, using ephemeral secret"
```
**Category**: ⚠️ WARNING  
**Rationale**: Ephemeral secret works for testing, but should warn for prod  
**Action**: Keep as warning, add prod mode check

#### Line 156: Network error during federation
```bash
log_warn "Network error on attempt $attempt: connection failed"
```
**Category**: 📝 VERBOSE  
**Rationale**: Retry notification, not a final failure  
**Action**: Downgrade to `log_verbose`

#### Line 1069: Backend API failed, trying fallback
```bash
log_warn "Backend API failed, trying direct Keycloak method..."
```
**Category**: 📝 VERBOSE  
**Rationale**: Successful fallback pattern  
**Action**: Downgrade to `log_verbose`

#### Line 1942: Connectivity validation failed
```bash
log_warn "Secrets synced but connectivity validation failed"
```
**Category**: 🔴 HARD FAILURE  
**Rationale**: If connectivity fails, federation is broken  
**Action**: **UPGRADE to `log_error` + `return 1`**

---

### 2. deployment/hub.sh (9 warnings)

#### Lines 1057-1059: Optional/stretch services failed
```bash
log_warn "Service $service failed to start (OPTIONAL/STRETCH - deployment will continue)"
```
**Category**: ⚠️ WARNING  
**Rationale**: Non-core services, expected behavior  
**Action**: Keep as warning

#### Line 677: Service retry attempts
```bash
log_warn "$service_name: Attempt $attempt/$max_attempts failed, retrying..."
```
**Category**: 📝 VERBOSE  
**Rationale**: Retry notification  
**Action**: Downgrade to `log_verbose`

#### Line 1078: Level had failures but core operational
```bash
log_warn "Level $level had $level_failed failures, but all CORE services operational"
```
**Category**: ⚠️ WARNING  
**Rationale**: Important context for partial success  
**Action**: Keep as warning

---

### 3. spoke/pipeline/phase-configuration.sh (29 warnings)

#### Line 175: Secret sync failed
```bash
log_warn "Secret sync function failed"
```
**Category**: 🔴 HARD FAILURE  
**Rationale**: Spoke cannot operate without secrets  
**Action**: **UPGRADE to `log_error` + `return 1`**

#### Line 205: OPAL token provisioning failed
```bash
log_warn "OPAL token provisioning failed - policy enforcement may not work"
```
**Category**: 🔴 HARD FAILURE  
**Rationale**: Policy enforcement is core functionality  
**Action**: **UPGRADE to `log_error` + `return 1`**

#### Line 223: Redirect URI update failed
```bash
log_warn "Redirect URI update failed - OAuth login may not work correctly"
```
**Category**: 🔴 HARD FAILURE  
**Rationale**: Breaks authentication flow  
**Action**: **UPGRADE to `log_error` + `return 1`**

#### Lines 506-508: Federation/approval failures
```bash
log_warn "Auto-approval disabled or bidirectional federation failed"
log_warn "Spoke suspended during registration (federation verification failed)"
```
**Category**: 🔴 HARD FAILURE  
**Rationale**: Spoke must be federated to function  
**Action**: **UPGRADE to `log_error` + `return 1`** (add `--skip-federation` flag)

#### Line 557: Manual approval failed
```bash
log_warn "Manual approval failed - authentication required"
```
**Category**: 🔴 HARD FAILURE  
**Rationale**: Spoke unusable without Hub approval  
**Action**: **UPGRADE to `log_error` + `return 1`**

#### Line 607: Auto-approval failed
```bash
log_warn "Auto-approval failed - manual approval required"
```
**Category**: ⚠️ WARNING  
**Rationale**: Manual approval is valid fallback  
**Action**: Keep as warning if manual approval attempted, else upgrade

#### Lines 680-723: KAS registration failures
```bash
log_warn "KAS registration attempt $retry failed, retrying in 5s..."
log_warn "MongoDB KAS registration failed after $kas_retries attempts"
```
**Category**: ⚠️ WARNING (KAS is "stretch" goal)  
**Rationale**: KAS is optional feature  
**Action**: Keep as warning

#### Lines 864, 915: Terraform failures
```bash
log_warn "Terraform init failed"
log_warn "Terraform module not available - Keycloak configuration may be incomplete"
```
**Category**: 🔴 HARD FAILURE  
**Rationale**: Terraform manages Keycloak realm (core)  
**Action**: **UPGRADE to `log_error` + `return 1`**

---

### 4. spoke/pipeline/phase-seeding.sh (6 warnings)

#### Line 119: Plaintext resources (encryption failed)
```bash
log_warn "⚠ Plaintext resources: $total_count documents (ZTDF encryption failed)"
```
**Category**: ⚠️ WARNING  
**Rationale**: Resources exist but unencrypted (security degradation)  
**Action**: Keep as warning in dev, upgrade to error in prod

#### Line 310: Verification failed (count mismatch)
```bash
log_warn "Seeding completed but verification failed (expected: $resource_count, found: $actual_count)"
```
**Category**: 🔴 HARD FAILURE  
**Rationale**: Data integrity issue  
**Action**: **UPGRADE to `log_error` + `return 1`**

---

### 5. spoke/pipeline/phase-initialization.sh (19 warnings)

#### Line 68: Failed to regenerate docker-compose.yml
```bash
log_warn "Failed to regenerate docker-compose.yml (continuing with existing)"
```
**Category**: ⚠️ WARNING  
**Rationale**: Can continue with existing file  
**Action**: Keep as warning

#### Line 701: Certificate missing required SAN
```bash
log_warn "Existing certificate missing required SAN: $required_san"
```
**Category**: 🔴 HARD FAILURE  
**Rationale**: Federation requires correct SANs  
**Action**: **UPGRADE to `log_error` + regenerate cert**

#### Lines 754, 769, 771: Java truststore generation failed
```bash
log_warn "Java truststore generation failed - federation may not work"
```
**Category**: 🔴 HARD FAILURE  
**Rationale**: Keycloak requires Java truststore for mTLS  
**Action**: **UPGRADE to `log_error` + `return 1`**

#### Line 777: SSOT certificate generation failed, trying fallback
```bash
log_warn "SSOT certificate generation failed, trying fallback..."
```
**Category**: 📝 VERBOSE  
**Rationale**: Fallback mechanism working  
**Action**: Downgrade to `log_verbose`

#### Line 795: Generating certificate with incomplete SANs
```bash
log_warn "Generating certificate with INCOMPLETE SANs (Hub SANs missing)"
```
**Category**: 🔴 HARD FAILURE  
**Rationale**: Certificate will fail validation  
**Action**: **UPGRADE to `log_error` + `return 1`**

#### Lines 900, 909: Terraform init/apply failed
```bash
log_warn "Terraform init failed"
log_warn "Terraform apply failed"
```
**Category**: 🔴 HARD FAILURE  
**Rationale**: Terraform is core infrastructure  
**Action**: **UPGRADE to `log_error` + `return 1`**

#### Line 929: Terraform module not available
```bash
log_warn "Terraform module not available - Keycloak configuration may be incomplete"
```
**Category**: 🔴 HARD FAILURE  
**Rationale**: Required module  
**Action**: **UPGRADE to `log_error` + `return 1`**

#### Line 967: Auto-update failed
```bash
log_warn "Auto-update failed - deployment may use outdated template"
```
**Category**: ⚠️ WARNING  
**Rationale**: Can continue with existing template  
**Action**: Keep as warning

---

### 6. spoke/pipeline/spoke-secrets.sh (11 warnings)

#### Line 277: Missing GCP secrets
```bash
log_warn "Missing GCP secrets: ${failed_secrets[*]}"
```
**Category**: 🔴 HARD FAILURE (prod) / ⚠️ WARNING (dev)  
**Rationale**: Production requires GCP secrets; dev can use .env fallback  
**Action**: **Add mode check - error in prod, warn in dev**

#### Line 389: Missing secrets from .env
```bash
log_warn "Missing secrets from .env: ${missing_secrets[*]}"
```
**Category**: 🔴 HARD FAILURE  
**Rationale**: No fallback available  
**Action**: **UPGRADE to `log_error` + `return 1`**

---

### 7. common.sh (18 warnings)

#### Lines 776-781: Missing environment variables
```bash
log_warn "Missing: POSTGRES_PASSWORD"
log_warn "Missing: KEYCLOAK_ADMIN_PASSWORD"
# ... etc
```
**Category**: 🔴 HARD FAILURE (prod) / ⚠️ WARNING (dev)  
**Rationale**: Same as GCP secrets - prod requires all, dev can fallback  
**Action**: **Add mode check**

#### Line 879: Service account authentication failed
```bash
log_warn "Service account key found but authentication failed"
```
**Category**: 🔴 HARD FAILURE  
**Rationale**: Cannot access GCP secrets  
**Action**: **UPGRADE to `log_error` + `return 1`**

---

### 8. orchestration-state-db.sh (10 warnings)

#### Lines 1381, 1496, 1498: State inconsistencies
```bash
log_warn "Invalid state file $instance_code: missing required fields"
log_warn "State missing from file for $instance"
log_warn "State missing from database for $instance"
```
**Category**: ⚠️ WARNING  
**Rationale**: State tracking is observability, not blocking  
**Action**: Keep as warning

---

### 9. spoke/pipeline/spoke-checkpoint.sh (11 warnings)

#### Line 397: Checkpoint exists but files missing
```bash
log_warn "INITIALIZATION checkpoint exists but config files missing"
```
**Category**: 🔴 HARD FAILURE  
**Rationale**: Inconsistent state, must rebuild  
**Action**: **UPGRADE to `log_error` + delete checkpoint + restart**

#### Line 665: Failed to create checkpoint
```bash
log_warn "Failed to create checkpoint for $phase"
```
**Category**: ⚠️ WARNING  
**Rationale**: Checkpoint is for recovery, not critical path  
**Action**: Keep as warning

---

## Summary Statistics

**Total Warnings Audited**: 639 across 81 files  
**Detailed Review**: 50 critical warnings

### Categorization Results

| Category | Count | Percentage |
|----------|-------|------------|
| 🔴 HARD FAILURE | 23 | 46% |
| ⚠️ WARNING | 19 | 38% |
| 📝 VERBOSE | 8 | 16% |

---

## Implementation Priority

### Priority 0 - Critical (Week 1)
1. ✅ Secret sync failures → hard fail
2. ✅ OPAL token provisioning → hard fail
3. ✅ Redirect URI failures → hard fail
4. ✅ Federation setup failures → hard fail (add `--skip-federation` flag)
5. ✅ Manual approval failures → hard fail
6. ✅ Terraform failures → hard fail
7. ✅ Certificate SAN validation → hard fail

### Priority 1 - High (Week 2)
8. ✅ Resource seeding verification → hard fail
9. ✅ Java truststore generation → hard fail
10. ✅ Missing .env secrets (no fallback) → hard fail
11. ✅ GCP authentication failures → hard fail
12. ✅ Checkpoint inconsistencies → hard fail + cleanup

### Priority 2 - Medium (Week 3)
13. Network retry notifications → verbose
14. Fallback operation notifications → verbose
15. Service retry attempts → verbose
16. Dev/prod mode checks for secrets → conditional logic

### Priority 3 - Low (Week 4)
17. State tracking warnings → keep as warning
18. Checkpoint creation failures → keep as warning
19. Optional service failures → keep as warning
20. KAS failures → keep as warning (stretch goal)

---

## Testing Checklist

After implementing changes:

- [ ] Clean deployment with all secrets → SUCCESS
- [ ] Clean deployment missing critical secret → HARD FAIL in PREFLIGHT
- [ ] Deployment with failed federation → HARD FAIL (not soft-fail warning)
- [ ] Deployment with failed Terraform → HARD FAIL (not soft-fail warning)
- [ ] Deployment with missing Hub → HARD FAIL in PREFLIGHT
- [ ] Dev mode with .env fallback → WARNING (not error)
- [ ] Prod mode with .env fallback → HARD FAIL

---

## Files to Modify

1. `scripts/dive-modules/spoke/pipeline/phase-configuration.sh` (29 warnings)
2. `scripts/dive-modules/spoke/pipeline/phase-initialization.sh` (19 warnings)
3. `scripts/dive-modules/common.sh` (18 warnings)
4. `scripts/dive-modules/spoke/pipeline/spoke-secrets.sh` (11 warnings)
5. `scripts/dive-modules/spoke/pipeline/spoke-checkpoint.sh` (11 warnings)
6. `scripts/dive-modules/deployment/hub.sh` (9 warnings)
7. `scripts/dive-modules/spoke/pipeline/phase-seeding.sh` (6 warnings)
8. `scripts/dive-modules/federation-link.sh` (16 warnings)

---

## Related Documentation

- `ERROR-HANDLING-POLICY.md` - Formal policy (Phase 3.1)
- `NEW-SESSION-HANDOFF-PROMPT.md` - Original analysis
- `ROOT-CAUSE-FIXES-SUMMARY.md` - Previous fixes

---

**Status**: ✅ AUDIT COMPLETE  
**Next Step**: Implement hard failure upgrades (Phase 3.2-3.4)
