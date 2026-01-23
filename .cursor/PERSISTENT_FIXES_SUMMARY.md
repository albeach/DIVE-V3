# Persistent Fixes Summary - Best Practice Solutions

**Date:** 2026-01-24  
**Status:** ✅ **All Persistent Fixes Implemented**  

---

## 🎯 ROBUST SOLUTIONS IMPLEMENTED

### **Fix #1: Logout Redirect URIs (Terraform)** ✅

**Problem:** Hardcoded URLs are NOT best practice and won't work across environments.

**WRONG Approach (Initially Attempted):**
```hcl
valid_post_logout_redirect_uris = [
  "https://localhost:3000",     # ❌ Hardcoded
  "https://localhost:3000/",    # ❌ Hardcoded
  ...
]
```

**CORRECT Approach (Implemented):**
```hcl
valid_post_logout_redirect_uris = concat(
  [
    var.app_url,              # ✅ Variable-based
    "${var.app_url}/",        # ✅ Handles trailing slash
    "${var.app_url}/*",       # ✅ Wildcard for all paths
    var.api_url,
    "${var.api_url}/",
    var.idp_url,
    "${var.idp_url}/",
  ],
  # Instance-specific ports for local development
  var.local_frontend_port != null ? [
    "https://localhost:${var.local_frontend_port}",
    "https://localhost:${var.local_frontend_port}/",
    "https://localhost:${var.local_frontend_port}/*"
  ] : []
)
```

**Benefits:**
- ✅ Works for localhost, Cloudflare, production domains
- ✅ NO hardcoded values
- ✅ Configurable per instance via tfvars
- ✅ Handles trailing slashes automatically
- ✅ Wildcard support for all paths

**File:** `terraform/modules/federated-instance/main.tf`  
**Commit:** `1d39c71a`

---

### **Fix #2: Container Restart with Environment Variables** ✅

**Problem:** Direct `docker compose up -d` doesn't load .env files properly.

**Solution:** Created `scripts/helpers/restart-with-env.sh`

**Usage:**
```bash
# Hub services
./scripts/helpers/restart-with-env.sh hub frontend
./scripts/helpers/restart-with-env.sh hub backend

# Spoke services
./scripts/helpers/restart-with-env.sh spoke backend fra
./scripts/helpers/restart-with-env.sh spoke keycloak gbr
```

**What It Does:**
1. Sources appropriate .env file (.env.hub or instances/{code}/.env.{code})
2. Exports all variables (set -a)
3. Runs docker compose with variables loaded
4. Verifies container health after restart

**Benefits:**
- ✅ No missing variable warnings
- ✅ Consistent behavior across all environments
- ✅ Single source of truth (.env files)
- ✅ Reusable for all services

**File:** `scripts/helpers/restart-with-env.sh`  
**Commit:** `1d39c71a`

---

### **Fix #3: Automatic Account Linking for Federation** ✅

**Problem:** OAuthAccountNotLinked errors when Keycloak user deleted but PostgreSQL remains.

**Solution:** Automatic linking in `frontend/src/auth.ts` signIn() callback

**How It Works:**
```typescript
// For federated users only (provider='keycloak')
if (account?.provider === 'keycloak' && user?.email) {
    // Check if user with same email exists
    const existingUser = await db.select()...
    
    if (existingUser && existingUser.id !== user.id) {
        // Delete duplicate user
        await db.delete(users).where(eq(users.id, user.id));
        
        // Link account to existing user
        await db.update(accounts).set({ userId: existingUser.id })...
        
        // Update session reference
        user.id = existingUser.id;
    }
}
```

**Handles:**
- ✅ Orphaned accounts (Keycloak user deleted)
- ✅ Multi-IdP authentication (same user, different IdPs)
- ✅ Realm rebuilds (user IDs change)
- ✅ Database migrations

**File:** `frontend/src/auth.ts`  
**Commit:** `93a19f04`

---

### **Fix #4: DIVE Custom Scopes in Federation** ✅

**Problem:** IdP not requesting custom scopes, so attributes not propagated.

**Solution:** Updated `keycloak-federation.service.ts`

```typescript
// BEFORE (BROKEN):
defaultScope: 'openid profile email'

// AFTER (FIXED):
defaultScope: 'openid profile email clearance countryOfAffiliation uniqueID acpCOI dive_acr dive_amr user_acr user_amr'
```

**Why This Matters:**
- Protocol mappers on client don't execute unless scope is requested
- Without scope request, token missing claims
- IdP mappers have nothing to import

**File:** `backend/src/services/keycloak-federation.service.ts`  
**Commit:** `0ee9c4bc`

---

## 🚀 HOW TO APPLY PERSISTENT FIXES

### **Step 1: Update Keycloak Client (Terraform)**

The Terraform configuration is already fixed (commit `1d39c71a`).

**To apply:**
```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3
./dive hub deploy
# OR targeted Terraform apply:
cd terraform/hub
terraform init
terraform apply -var-file=hub.tfvars -auto-approve
```

**What This Updates:**
- dive-v3-broker-usa client in Hub
- valid_post_logout_redirect_uris with trailing slash variants
- Uses variables (app_url, api_url, idp_url) - NO hardcoded values

---

### **Step 2: Verify Deployment Scripts Source .env**

**Hub deployment already correct:**
```bash
# scripts/dive-modules/deployment/hub.sh line 191-198
if [ -f "${DIVE_ROOT}/.env.hub" ]; then
    log_verbose "Loading secrets from .env.hub"
    set -a
    source "${DIVE_ROOT}/.env.hub"
    set +a
fi
```

**For manual restarts, use helper:**
```bash
./scripts/helpers/restart-with-env.sh hub frontend
```

---

### **Step 3: Test End-to-End**

**Full clean slate test:**
```bash
# 1. Nuke and redeploy
./dive nuke all --confirm
./dive hub deploy
./dive spoke deploy fra "France"

# 2. Test federation login
# - Use Incognito window
# - Navigate to https://localhost:3000
# - Click "FRA Instance"
# - Login: testuser-fra-1 / TestUser2025!Pilot
# - Verify: countryOfAffiliation: "FRA"

# 3. Test logout
# - Click logout button
# - Should redirect cleanly (no error)
```

---

## 📋 VERIFICATION CHECKLIST

**Before declaring complete:**

- [ ] Terraform updated and applied (logout redirect URIs)
- [ ] Frontend restarted with new auth.ts code
- [ ] Fra-idp has DIVE custom scopes
- [ ] Test login via FRA IdP (Incognito window)
- [ ] Verify countryOfAffiliation: "FRA"
- [ ] Test logout (should redirect cleanly)
- [ ] No OAuthAccountNotLinked errors
- [ ] No invalid_redirect_uri errors

---

## 🎓 BEST PRACTICES APPLIED

### **1. Infrastructure as Code (Terraform)**
- ✅ Use variables, not hardcoded values
- ✅ Single module for all instances (federated-instance)
- ✅ Configuration in tfvars files
- ✅ Apply updates via Terraform (idempotent)

### **2. Environment Variable Management**
- ✅ Single source of truth (.env files)
- ✅ Deployment scripts source .env before docker compose
- ✅ Helper script for manual restarts
- ✅ No inline variable passing

### **3. Automatic Error Recovery**
- ✅ Account linking handles orphaned users
- ✅ Non-fatal error handling (log and continue)
- ✅ Self-healing architecture

### **4. Security-First Design**
- ✅ Automatic linking only for trusted federated broker
- ✅ NOT enabled for direct OAuth providers
- ✅ Comprehensive logging for audit

---

## ⚠️ IMMEDIATE ACTION

**For current testing session:**

1. **Clear browser completely** (Incognito window recommended)
2. **Wait for Hub redeploy** OR apply Terraform manually
3. **Test fresh login** via FRA IdP
4. **Verify both fixes:**
   - Login succeeds (account linking)
   - Attributes correct (custom scopes)
   - Logout works (redirect URIs)

---

**Status:** ✅ **All persistent fixes implemented, awaiting deployment**  
**Next:** Apply Terraform and test end-to-end  
