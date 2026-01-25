# User Creation SSOT (Single Source of Truth)

**Date:** 2026-01-25  
**Status:** ✅ ACTIVE (Enforced in code and documentation)  
**Decision Owner:** Hub Deployment Architecture

---

## Executive Summary

**USER CREATION SSOT: `scripts/hub-init/seed-hub-users.sh`**

All test user creation for the Hub (USA) instance is handled by the bash script `scripts/hub-init/seed-hub-users.sh`. Terraform user creation is **DISABLED** and must not be re-enabled without architectural review.

---

## The Problem (Historical Context)

Prior to 2026-01-25, DIVE V3 had **three conflicting** approaches to user creation:

1. **Terraform** (`terraform/modules/federated-instance/test-users.tf`)
   - Created `pilot_users[1-5]` + `admin_user` via Keycloak provider
   - State-managed, declarative
   - Issues: State conflicts, "resource already exists" errors

2. **TypeScript** (`backend/src/scripts/setup-demo-users.ts`)
   - Created `demo-{instance}-[1-4]` via API
   - Wrong naming convention (demo- vs testuser-)
   - Only created 4 users, not 5

3. **Bash Script** (`scripts/hub-init/seed-hub-users.sh`)
   - Created `testuser-usa-[1-5]` + `admin-usa` via Keycloak Admin API
   - Correct naming, 5 users + admin
   - Idempotent (checks before creating)

**Result:** Chaos. Users may or may not exist after deployment. Login failures. No one knew which was authoritative.

---

## The Solution

### Single Source of Truth

**SSOT:** `scripts/hub-init/seed-hub-users.sh`

**When it runs:** Phase 7 of `./dive hub deploy` (via `hub_seed()` function)

**What it creates:**

| Username | Clearance | AAL | COI | Role | Password |
|----------|-----------|-----|-----|------|----------|
| testuser-usa-1 | UNCLASSIFIED | 1 | - | dive-user | TestUser2025!Pilot |
| testuser-usa-2 | RESTRICTED | 1 | - | dive-user | TestUser2025!Pilot |
| testuser-usa-3 | CONFIDENTIAL | 2 | - | dive-user | TestUser2025!Pilot |
| testuser-usa-4 | SECRET | 2 | NATO | dive-user | TestUser2025!Pilot |
| testuser-usa-5 | TOP_SECRET | 3 | NATO,FVEY | dive-user | TestUser2025!Pilot |
| admin-usa | TOP_SECRET | 3 | NATO,FVEY | super_admin, hub_admin, dive-admin | TestUser2025!SecureAdmin |

**Why this script?**

1. ✅ **Idempotent**: Safe to run multiple times (checks if user exists)
2. ✅ **Flexible**: Can update attributes on existing users
3. ✅ **No state conflicts**: Independent of Terraform state
4. ✅ **Comprehensive**: Configures User Profile, protocol mappers, AMR claims
5. ✅ **Development-friendly**: Works with clean slate deployments
6. ✅ **Correct naming**: Uses testuser-usa-X convention (spec-compliant)
7. ✅ **Complete users**: Creates 5 testusers + admin (not 4)

---

## Terraform User Creation: DISABLED

### Code Enforcement

**File:** `terraform/hub/main.tf`

```hcl
module "instance" {
  source = "../modules/federated-instance"
  
  # SSOT ENFORCEMENT: User creation handled by bash script
  create_test_users = false  # SSOT: scripts/hub-init/seed-hub-users.sh
  
  # ... rest of configuration
}
```

**File:** `terraform/hub/hub.tfvars`

```hcl
# ⚠️  CRITICAL: User creation DISABLED in Terraform
# SSOT: scripts/hub-init/seed-hub-users.sh
create_test_users = false
```

**File:** `terraform/hub/variables.tf`

```hcl
variable "create_test_users" {
  description = "DEPRECATED: User creation via Terraform (SSOT: bash script)"
  type        = bool
  default     = false  # SSOT: bash script
}
```

### Why Terraform is Disabled

**Problem 1: State Conflicts**
- Terraform thinks users exist in state
- Users don't exist in Keycloak (nuked)
- Terraform apply: "User already exists" error
- Must manually edit state or destroy resources

**Problem 2: Inflexibility**
- Can't easily update user attributes after creation
- Requires `terraform apply` to change clearance
- State must be kept in sync with reality

**Problem 3: Development Friction**
- Clean slate deployments fail if state exists
- Requires `./dive nuke` to clean state
- Extra step, more complexity

**Solution:** Use idempotent bash script that always works.

---

## Deployment Workflow

### Phase 7: Database Seeding

```bash
# In scripts/dive-modules/deployment/hub.sh
hub_deploy() {
  # ... Phase 1-6 (infrastructure, Keycloak, Terraform)
  
  # Phase 7: Seed database with test users and resources
  log_info "Phase 7: Database seeding"
  if ! hub_seed 5000; then
    log_error "Database seeding failed"
    # Don't fail deployment - seeding can be done manually
  fi
}
```

### hub_seed() Function

```bash
# In scripts/dive-modules/hub/seed.sh
hub_seed() {
  local resource_count="${1:-5000}"
  
  # Step 1: Initialize COI Keys (35 COIs)
  docker exec dive-hub-backend npx tsx src/scripts/initialize-coi-keys.ts
  
  # Step 2: Seed test users (SSOT)
  bash "${DIVE_ROOT}/scripts/hub-init/seed-hub-users.sh"
  
  # Step 3: Seed ZTDF encrypted resources
  docker exec dive-hub-backend npx tsx src/scripts/seed-instance-resources.ts \
    --instance=USA --count="${resource_count}" --replace
}
```

### Manual User Creation

If deployment fails or users need to be recreated:

```bash
# After hub is deployed and Keycloak is running:
./dive hub seed

# Or just users (skip resource seeding):
bash scripts/hub-init/seed-hub-users.sh
```

---

## Verification

### After Deployment

```bash
# 1. Check users exist in Keycloak
docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 --realm master --user admin --password "$KC_ADMIN_PASSWORD"

docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh get users \
  -r dive-v3-broker-usa --fields username,enabled | jq -r '.[] | .username'

# Expected output:
# testuser-usa-1
# testuser-usa-2
# testuser-usa-3
# testuser-usa-4
# testuser-usa-5
# admin-usa

# 2. Test login
open https://localhost:3000
# Username: testuser-usa-1
# Password: TestUser2025!Pilot
```

### Verify Attributes

```bash
# Check user attributes (clearance, COI, etc.)
docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh get users \
  -r dive-v3-broker-usa -q username=testuser-usa-5 | \
  jq '.[] | {username, attributes}'

# Expected:
# {
#   "username": "testuser-usa-5",
#   "attributes": {
#     "clearance": ["TOP_SECRET"],
#     "countryOfAffiliation": ["USA"],
#     "uniqueID": ["testuser-usa-5"],
#     "acpCOI": ["NATO", "FVEY"],
#     "aal_level": ["3"]
#   }
# }
```

---

## Maintenance & Updates

### Adding New Test Users

**DO:**
1. Edit `scripts/hub-init/seed-hub-users.sh`
2. Add new `create_user` call with correct parameters
3. Run `./dive hub seed` or script directly
4. Test login

**DON'T:**
1. ❌ Enable Terraform user creation
2. ❌ Create users manually via Keycloak UI (not reproducible)
3. ❌ Use TypeScript scripts (wrong naming, incomplete)

### Changing User Attributes

**DO:**
1. Edit `scripts/hub-init/seed-hub-users.sh`
2. Update `create_user` parameters (clearance, COI, etc.)
3. Re-run script (it updates existing users)

**DON'T:**
1. ❌ Edit users manually in Keycloak UI
2. ❌ Use Terraform (state conflicts)

### Debugging User Issues

```bash
# 1. Check if script ran during deployment
grep "seed-hub-users" logs/hub-deploy-*.log

# 2. Check for errors
grep -i "error.*user\|failed.*seed" logs/hub-deploy-*.log

# 3. Check Keycloak logs
docker logs dive-hub-keycloak | grep -i "user.*created"

# 4. Re-run script manually
bash scripts/hub-init/seed-hub-users.sh
```

---

## Future Considerations

### Production Deployment

For **production**, consider switching to Terraform SSOT:

**Rationale:**
- Declarative infrastructure as code
- State management ensures consistency
- Passwords from GCP Secret Manager
- Immutable infrastructure pattern

**Requirements:**
1. Remote Terraform backend (GCS)
2. Proper state locking
3. Secret management integration
4. CI/CD pipeline for updates

**How to Switch:**
1. Set `create_test_users = true` in `terraform/hub/main.tf`
2. Remove bash script call from `hub_seed()`
3. Update `.cursorrules` SSOT section
4. Document in this file
5. Test thoroughly

### Multi-Environment Support

For **multiple environments** (dev, staging, prod):

**Option 1: Environment-specific scripts**
- `seed-hub-users-dev.sh`
- `seed-hub-users-staging.sh`
- `seed-hub-users-prod.sh`

**Option 2: Terraform with workspaces**
- `terraform workspace select prod`
- `create_test_users = true` in prod only

**Recommendation:** Keep bash script for dev/staging, Terraform for prod.

---

## Related Documentation

- **Implementation Plan:** `docs/dive-v3-implementation-plan.md`
- **Deployment Guide:** `docs/DEPLOYMENT.md`
- **Hub Deployment Fix:** `NEXT_SESSION_HUB_DEPLOYMENT_FIX.md`
- **Project Conventions:** `.cursorrules`

---

## Change Log

| Date | Change | Author | Reason |
|------|--------|--------|--------|
| 2026-01-25 | Established bash script as SSOT | AI Assistant | Fix user creation conflicts |
| 2026-01-25 | Disabled Terraform user creation | AI Assistant | Prevent state conflicts |
| 2026-01-25 | Created this documentation | AI Assistant | Codify architectural decision |

---

## Decision Record

**Decision:** Use `scripts/hub-init/seed-hub-users.sh` as SSOT for test user creation

**Alternatives Considered:**
1. ❌ Terraform (rejected: state conflicts, inflexible)
2. ❌ TypeScript (rejected: wrong naming, incomplete)
3. ✅ Bash script (chosen: idempotent, flexible, works)

**Trade-offs:**
- **Pro:** Reliable, flexible, no state management
- **Con:** Not declarative, manual execution in some cases
- **Mitigation:** Automated via deployment workflow

**Review Date:** 2026-03-01 (reassess after 4-week pilot)

---

**Status: ENFORCED** ✅

This SSOT is now enforced in code, documentation, and deployment workflows. Do not deviate without architectural review and approval.
