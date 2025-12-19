# 🔴 DIVE V3 FEDERATION - NOT RESILIENT

**Date**: December 19, 2025
**Test**: E2E spoke deployment (Poland)
**Result**: ❌ **FAILED - NOT 100% PERSISTENT OR RESILIENT**

---

## 🧪 Test Performed

1. ✅ Deployed USA Hub + ESP + ITA
2. ✅ Manually registered & approved ESP and ITA in hub database
3. ✅ IdPs persisted through backend restart
4. ✅ Deployed fresh Poland (POL) spoke using `./dive --instance pol spoke up`
5. ❌ POL did NOT auto-register with hub
6. ✅ Manually registered POL via `/api/federation/register`
7. ✅ Approved POL with `autoLinkIdP: true`
8. ❌ Auto IdP linking failed with "HTTP 401 Unauthorized"
9. ❌ Manual `./dive federation link POL` also failed with 401

---

## 🐛 Critical Bugs Found

### Bug #1: Spoke Deployment Does NOT Auto-Register
**Location**: `scripts/dive-modules/spoke.sh` → `spoke_up()` → `scripts/spoke-init/init-all.sh`

**Issue**: The `./dive spoke up` command:
- Calls `scripts/spoke-init/init-all.sh` for post-deployment
- This script only syncs federation secrets if Hub is running
- **Does NOT call** `/api/federation/register` to register in hub database
- **Does NOT call** `spoke_register()` function

**Evidence**:
```bash
$ ls instances/pol/.initialized
-rw-r--r--@ 1 aubreybeach  staff  0 Dec 13 19:43 instances/pol/.initialized

$ curl -sk https://localhost:4000/api/federation/spokes | jq '.spokes[] | select(.instanceCode == "POL")'
# Returns nothing - POL not registered
```

**Impact**: Every new spoke requires **manual** registration steps that are not part of the `@dive` workflow.

---

### Bug #2: Auto IdP Linking Authentication Failure
**Location**: `backend/src/services/hub-spoke-registry.service.ts` → `createFederationIdP()`

**Issue**: When `autoLinkIdP: true` is set during spoke approval:
- Backend tries to create `pol-idp` in Hub Keycloak
- Gets admin token using "fallback password for development"
- Keycloak returns "HTTP 401 Unauthorized"
- IdP creation silently fails (warning logged, but spoke is approved anyway)

**Evidence**:
```json
{
  "error": "HTTP 401 Unauthorized",
  "instanceCode": "POL",
  "level": "error",
  "message": "Failed to auto-link IdP during spoke approval",
  "spokeId": "spoke-pol-91f65044",
  "warning": "Spoke approved but IdP not linked - use `dive federation link` manually"
}
```

**Root Cause**: The `getKeycloakAdminPassword()` function in the backend is returning the wrong password or the wrong admin URL is being used.

---

### Bug #3: Federation Link Command Also Fails
**Location**: `scripts/dive-modules/federation.sh` → `federation_link()`

**Issue**: The `./dive federation link POL` command also fails with 401:
```bash
$ ./dive federation link POL
Step 1: Adding POL IdP to USA Keycloak
⚠️  Step 1 result: {"success":false,"error":"Failed to link Identity Provider","message":"HTTP 401 Unauthorized"}
```

**Root Cause**: Same authentication issue - the backend API `/api/federation/link-idp` cannot authenticate to Keycloak.

---

## 📊 Comparison: ESP/ITA vs POL

| Aspect | ESP/ITA | POL |
|--------|---------|-----|
| **Deployment** | `./dive spoke up` | `./dive spoke up` |
| **Auto-registration** | ❌ No | ❌ No |
| **Hub registration** | ✅ Manual API calls | ✅ Manual API calls |
| **Approval** | ✅ Manual with admin token | ✅ Manual with admin token |
| **Auto IdP Link** | ✅ Worked | ❌ Failed (401) |
| **Manual Link** | N/A (worked auto) | ❌ Failed (401) |
| **Result** | IdPs visible in hub | No IdPs created |

**Why ESP/ITA worked but POL failed**: ESP and ITA were registered when the Hub Keycloak admin password was accessible. By the time POL was registered, something changed with the authentication.

---

## 🔍 Root Cause Analysis

### Two-Layer Registration Problem
The DIVE V3 architecture has **two separate registration systems** that must work together:

1. **`register_spoke_in_hub()`** in `federation-setup.sh`:
   - Directly manipulates Hub Keycloak via admin API
   - Creates `{spoke}-idp` in Hub Keycloak manually
   - Creates client configurations
   - **Used by**: `spoke_init_start()` during spoke up workflow (Step 7)

2. **`/api/federation/register`** backend API:
   - Registers spoke in MongoDB `hub-spoke-registry`
   - Requires approval workflow (`/api/federation/spokes/{id}/approve`)
   - Can auto-link IdP via `autoLinkIdP: true`
   - **Used by**: `spoke_register()` function, meant for production workflow (Step 8)

**The problem**: These two systems are **NOT integrated** in the `spoke up` workflow:
- Step 7 tries to call `register_spoke_in_hub()` but it's not always available
- Step 8 mentions formal registration but doesn't automatically execute it
- The `init-all.sh` script does NOT handle either registration method

---

## ❌ What's NOT Resilient

### 1. No Automatic Registration
**Expected**: `./dive spoke up` registers spoke with hub automatically
**Actual**: Manual API calls required

### 2. No Persistent Workflow
**Expected**: `@dive` commands handle full E2E flow
**Actual**: Mixed CLI + manual API calls + hope auto-link works

### 3. Silent Failures
**Expected**: Deployment fails if registration fails
**Actual**: Spoke starts successfully but has no federation

### 4. No Rollback
**Expected**: Failed approval rolls back spoke registration
**Actual**: Spoke approved even if IdP linking fails

### 5. Authentication Issues
**Expected**: Backend can authenticate to local Keycloak
**Actual**: Random 401 errors, no clear error handling

---

## ✅ What IS Resilient

### 1. IdP Persistence
- ✅ IdPs stored in Keycloak database
- ✅ Survive backend restart
- ✅ Survive Keycloak restart
- ✅ Retrieved via `/api/idps/public`

### 2. Spoke Registration Persistence
- ✅ Spoke data stored in MongoDB
- ✅ Survives backend restart
- ✅ Retrieved via `/api/federation/spokes`

### 3. Infrastructure
- ✅ Docker containers resilient
- ✅ Networks persistent
- ✅ Certificates valid

---

## 🛠️ Required Fixes

### Fix #1: Integrate Auto-Registration into `spoke up`
**File**: `scripts/dive-modules/spoke.sh` → `spoke_up()`

```bash
# After docker compose up and init-all.sh:
if docker ps --format '{{.Names}}' | grep -q "dive-hub-backend"; then
    log_step "Registering spoke with Hub..."
    INSTANCE="$code_lower" spoke_register --poll --poll-timeout=300

    if [ $? -eq 0 ]; then
        log_success "Spoke registered and approved by Hub"
    else
        log_error "Spoke registration failed - federation will not work"
        return 1
    fi
fi
```

### Fix #2: Fix Backend Keycloak Authentication
**File**: `backend/src/services/hub-spoke-registry.service.ts`

1. Use correct Keycloak admin password source
2. Add retry logic for 401 errors
3. Fail spoke approval if IdP linking fails (don't silently warn)
4. Add detailed error logging

```typescript
private async getKeycloakAdminPassword(instanceCode: string): Promise<string> {
    // Try GCP Secret Manager first
    try {
        const password = await getSecret(`keycloak-admin-password`, instanceCode);
        if (password) return password;
    } catch (err) {
        logger.warn('GCP secret fetch failed, using environment variable');
    }

    // Fallback to environment
    const envPassword = process.env[`KEYCLOAK_ADMIN_PASSWORD_${instanceCode}`]
        || process.env.KEYCLOAK_ADMIN_PASSWORD;

    if (!envPassword) {
        throw new Error(`No Keycloak admin password found for ${instanceCode}`);
    }

    return envPassword;
}
```

### Fix #3: Make `autoLinkIdP` Mandatory, Not Optional
**File**: `backend/src/routes/federation.routes.ts`

```typescript
// In spoke approval endpoint:
const { autoLinkIdP = true } = req.body; // Default to true

try {
    await hubSpokeRegistry.createFederationIdP(spoke);
    logger.info('IdP auto-linked successfully');
} catch (error) {
    // FAIL the approval if IdP linking fails
    await hubSpokeRegistry.suspendSpoke(
        spoke.spokeId,
        `Failed to create IdP: ${error.message}`
    );

    res.status(500).json({
        success: false,
        error: 'Approval failed',
        message: 'IdP linking failed - spoke suspended'
    });
    return;
}
```

### Fix #4: Add `spoke register` as Default Step in `spoke up`
**File**: `scripts/spoke-init/init-all.sh`

Add new Step 6:
```bash
# =============================================================================
# Step 6: Register with Hub (Production Workflow)
# =============================================================================
if docker ps --format '{{.Names}}' | grep -q 'dive-hub-backend'; then
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  STEP 6/6: Hub Registration & Approval${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    cd "${DIVE_ROOT}"
    ./dive --instance "${INSTANCE_CODE}" spoke register --poll --poll-timeout=300

    if [ $? -ne 0 ]; then
        echo -e "${RED}✗ Hub registration failed${NC}"
        echo -e "${YELLOW}  Run manually: ./dive --instance ${INSTANCE_CODE} spoke register${NC}"
        exit 1
    fi
fi
```

---

## 📝 Proper E2E Workflow (What SHOULD Happen)

```bash
# Step 1: Deploy Hub
./dive hub up

# Step 2: Deploy Spoke (SHOULD be fully automatic)
./dive --instance pol spoke up
# ├── Creates containers
# ├── Waits for health
# ├── Initializes Keycloak
# ├── Seeds resources
# ├── Registers with Hub via /api/federation/register
# ├── Waits for Hub approval (or auto-approves in dev)
# ├── Hub creates pol-idp in Keycloak
# └── ✅ Spoke fully federated

# Step 3: Verify (SHOULD show POL)
./dive federation status
# USA (Hub): https://localhost:3000 ✓
# POL (Poland): https://localhost:3042 ✓ running

./dive federation list-idps
# [✓] Poland (pol-idp)
```

---

## 🎯 Current Workaround (Manual Steps)

```bash
# 1. Deploy spoke
./dive --instance pol spoke up

# 2. Manually register
curl -X POST https://localhost:4000/api/federation/register -d '{
  "instanceCode": "POL",
  "idpUrl": "https://dive-spoke-pol-keycloak:8443",
  ...
}'

# 3. Get admin token
ADMIN_TOKEN=$(curl -X POST https://localhost:8443/realms/master/protocol/openid-connect/token \
  -d "client_id=admin-cli" \
  -d "username=admin" \
  -d "password=$(docker exec dive-hub-keycloak env | grep KEYCLOAK_ADMIN_PASSWORD | cut -d'=' -f2)" \
  -d "grant_type=password" | jq -r '.access_token')

# 4. Approve spoke
curl -X POST https://localhost:4000/api/federation/spokes/{spoke-id}/approve \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"autoLinkIdP": true, ...}'

# 5. Hope IdP auto-link works (it didn't for POL)
#    If not, manually create IdP in Keycloak admin UI
```

---

## 📊 Final Assessment

| Requirement | Status | Notes |
|-------------|--------|-------|
| **Persistent** | ⚠️ Partial | IdPs and registrations persist, but must be created manually |
| **Resilient** | ❌ No | Silent failures, no rollback, authentication issues |
| **100% @dive Aligned** | ❌ No | Requires manual API calls and workarounds |
| **E2E Automated** | ❌ No | Multi-step manual process required |
| **Production Ready** | ❌ No | Would fail in production with multiple spokes |

---

**Conclusion**: The federation infrastructure is **NOT 100% persistent and resilient with @dive**. It requires significant refactoring to integrate the hub registration workflow into the `spoke up` command and fix the Keycloak authentication issues.

