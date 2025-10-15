# Quick Fix Summary - IdP Selector Issues

**Date:** 2025-10-15  
**Branch:** `feature/phase0-hardening-observability`  
**Status:** ✅ **FIXED**

---

## Your Reported Issues

### ❌ Problem 1: "Germany Test IdP" Points to idp.example.com

**What You Saw:**
- IdP button labeled "Germany Test IdP" on main screen
- Clicking it tries to connect to `idp.example.com`  
- Connection fails (invalid/placeholder URL)

**Root Cause:**
- Someone manually created a "germany-idp" in Keycloak during testing
- This IdP is NOT in your Terraform configuration
- It has placeholder configuration (example.com URLs)

**✅ Fix:**
- Added cleanup script: `./scripts/cleanup-test-idps.sh`
- Run this script to remove the rogue IdP
- Alternatively, delete manually in Keycloak Admin Console

---

### ❌ Problem 2: Industry Partner Shows American Flag 🇺🇸

**What You Saw:**
- "Industry Partner (OIDC)" button shows American flag 🇺🇸
- Should show building/company emoji 🏢

**Root Cause:**
- Flag mapping logic checked for `"us"` substring
- "ind**us**try-idp" matched **before** industry check
- Order of checks mattered!

**✅ Fix:**
- Reordered flag mapping in `idp-selector.tsx`
- Now checks `industry` BEFORE `us`
- Tightened US check to `us-`, `-us`, `dod` (not just `us`)

**Result:** Industry Partner now shows 🏢

---

### ❌ Problem 3: dive-v3-pilot Direct Login Missing

**What You Saw:**
- No way to login as test users (testuser-us, testuser-fra, etc.)
- Only federated IdPs shown (Canada, France, Industry)
- Had to manually navigate to Keycloak login page

**Root Cause:**
- IdP selector only displays federated identity providers
- Test users exist in dive-v3-pilot realm (not federated)
- No UI option for direct Keycloak authentication

**✅ Fix:**
- Added "Direct Keycloak Login" button at bottom of IdP list
- Click this to login with test users
- Labeled "For Testing" to distinguish from production IdPs

**Result:** Test users can now login easily

---

## How to Apply Fixes

### 1. Review Changes

```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3

# View what changed
git diff main frontend/src/components/auth/idp-selector.tsx

# Files modified:
# - frontend/src/components/auth/idp-selector.tsx (fixed flag mapping + direct login)
# - docs/troubleshooting/IDP-SELECTOR-FIX.md (diagnosis + cleanup guide)
# - scripts/cleanup-test-idps.sh (automated cleanup script)
```

### 2. Remove Germany Test IdP

**Option A: Run Cleanup Script (Recommended)**

```bash
./scripts/cleanup-test-idps.sh

# Follow prompts:
# - Will list all IdPs in Keycloak
# - Identify germany-idp as "rogue"
# - Ask for confirmation
# - Delete it
# - Verify via backend API
```

**Option B: Manual via Keycloak Console**

```bash
# 1. Open Keycloak Admin
open http://localhost:8081/admin

# 2. Login as admin/admin

# 3. Select dive-v3-pilot realm (dropdown top-left)

# 4. Go to: Identity Providers (left sidebar)

# 5. Find "Germany Test IdP" or "germany-idp"

# 6. Click the "..." menu → Delete

# 7. Confirm deletion
```

**Option C: Via Backend Admin API**

```bash
# Get admin token (login as testuser-us first in browser)
# Copy accessToken from: http://localhost:3000/api/auth/session

export ADMIN_TOKEN="<your_token_here>"

# Delete germany-idp
curl -X DELETE http://localhost:4000/api/admin/idps/germany-idp \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Verify it's gone
curl http://localhost:4000/api/idps/public | jq '.idps[].alias'
# Expected: ["canada-idp", "france-idp", "industry-idp"]
```

### 3. Rebuild Frontend

```bash
# Rebuild with fixes
cd frontend
npm run build

# Restart frontend container
cd ..
docker-compose restart nextjs
```

### 4. Test in Browser

```bash
# Open main page
open http://localhost:3000

# You should see:
# ✅ Canada (OIDC) with 🇨🇦
# ✅ France (SAML) with 🇫🇷
# ✅ Industry Partner (OIDC) with 🏢 (NOT 🇺🇸)
# ✅ "Direct Keycloak Login" button at bottom
# ❌ NO Germany Test IdP (if you ran cleanup)
```

---

## Expected UI (After Fixes)

```
╔══════════════════════════════════════════════════════╗
║        DIVE V3 Coalition Pilot                        ║
║    USA/NATO Identity & Access Management              ║
╚══════════════════════════════════════════════════════╝

Select Your Identity Provider

┌──────────────────────┐  ┌──────────────────────┐
│  🇨🇦                  │  │  🇫🇷                  │
│  Canada (OIDC)       │  │  France (SAML)       │
│  OIDC • canada-idp   │  │  SAML • france-idp   │
│  ● Active            │  │  ● Active            │
└──────────────────────┘  └──────────────────────┘

┌──────────────────────┐
│  🏢                  │  ← FIXED (was 🇺🇸)
│  Industry Partner    │
│  OIDC • industry-idp │
│  ● Active            │
└──────────────────────┘

─────────────────────────────────────────────────────

For Testing: Direct login with dive-v3-pilot realm test users

┌─────────────────────────────────────────────────────┐
│  🔑  Direct Keycloak Login                          │  ← NEW
│     dive-v3-pilot realm                             │
│     (testuser-us, testuser-fra, etc.)               │
└─────────────────────────────────────────────────────┘

Showing 3 federated identity providers
```

---

## Detailed Fix Explanations

### Fix 1: Flag Mapping Logic

**Before (BROKEN):**
```typescript
const getFlagForIdP = (alias: string): string => {
  if (alias.includes('us') || alias.includes('dod')) return '🇺🇸'; // ❌ Too broad
  if (alias.includes('industry') || alias.includes('contractor')) return '🏢';
  // ...
};

// Test: getFlagForIdP('industry-idp')
// Result: 🇺🇸 (WRONG - "industry" contains "us")
```

**After (FIXED):**
```typescript
const getFlagForIdP = (alias: string): string => {
  // Check specific patterns FIRST
  if (alias.includes('germany') || alias.includes('deu')) return '🇩🇪';
  if (alias.includes('france') || alias.includes('fra')) return '🇫🇷';
  if (alias.includes('canada') || alias.includes('can')) return '🇨🇦';
  if (alias.includes('uk') || alias.includes('gbr')) return '🇬🇧';
  if (alias.includes('industry') || alias.includes('contractor')) return '🏢';
  // Check US LAST with stricter pattern
  if (alias.includes('us-') || alias.includes('dod') || alias.includes('-us')) return '🇺🇸';
  return '🌐';
};

// Test: getFlagForIdP('industry-idp')
// Result: 🏢 ✅ CORRECT
```

---

### Fix 2: Direct Keycloak Login

**Added Section:**
```tsx
{/* Direct Keycloak Login (for test users in dive-v3-pilot realm) */}
<div className="mt-6 pt-6 border-t border-gray-200">
  <div className="text-center mb-4">
    <p className="text-sm text-gray-600 mb-3">
      <strong>For Testing:</strong> Direct login with dive-v3-pilot realm test users
    </p>
  </div>
  <button onClick={() => handleIdpClick(undefined)}>  {/* No kc_idp_hint */}
    🔑 Direct Keycloak Login
    dive-v3-pilot realm (testuser-us, testuser-fra, etc.)
  </button>
</div>
```

**Behavior:**
- Clicking calls `signIn("keycloak")` without IdP hint
- Keycloak shows its login form (username/password input)
- Test users can login: `testuser-us` / `Password123!`

---

### Fix 3: Germany IdP Cleanup

**Detection:**
```bash
$ curl http://localhost:4000/api/idps/public | jq '.idps[].alias'
["canada-idp", "france-idp", "germany-idp", "industry-idp"]
                               ^^^^^^^^^^^^ NOT in Terraform!

$ terraform state list | grep germany
# No results - confirms it's a rogue IdP
```

**Cleanup Methods:**

| **Method** | **Ease** | **Recommended For** |
|-----------|----------|---------------------|
| Run cleanup script | ⭐⭐⭐⭐⭐ | DevOps / Automation |
| Keycloak Admin Console | ⭐⭐⭐ | Quick manual fix |
| Backend Admin API | ⭐⭐ | API-first approach |

---

## Testing the Fixes

### Test Case 1: Industry Flag

1. Navigate to http://localhost:3000
2. Find "Industry Partner (OIDC)" button
3. **Expected:** Shows 🏢 building emoji
4. **Before:** Showed 🇺🇸 American flag

**Status:** ✅ Fixed in code, pending frontend rebuild

---

### Test Case 2: Direct Login

1. Navigate to http://localhost:3000
2. Scroll to bottom
3. **Expected:** "Direct Keycloak Login" button visible
4. Click button
5. **Expected:** Keycloak login form appears
6. Login with: `testuser-us` / `Password123!`
7. **Expected:** Redirected to /dashboard

**Status:** ✅ Fixed in code, pending frontend rebuild

---

### Test Case 3: Germany IdP Removed

1. Run cleanup script: `./scripts/cleanup-test-idps.sh`
2. Confirm deletion when prompted
3. Refresh http://localhost:3000 (hard reload: Cmd+Shift+R)
4. **Expected:** Only 3 IdPs shown (Canada, France, Industry)
5. **Before:** 4 IdPs (including Germany)

**Status:** ⏳ Requires running cleanup script

---

## Quick Commands Reference

```bash
# Deploy fixes
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3
docker-compose restart nextjs  # Apply frontend fixes

# Remove germany-idp
./scripts/cleanup-test-idps.sh  # Automated cleanup

# Verify IdPs
curl http://localhost:4000/api/idps/public | jq '.idps[] | {alias, displayName}'

# Test in browser
open http://localhost:3000
```

---

## Summary

| **Issue** | **Status** | **Action Required** |
|-----------|-----------|---------------------|
| Industry Partner flag wrong | ✅ Fixed | Restart frontend |
| Direct Keycloak login missing | ✅ Fixed | Restart frontend |
| Germany Test IdP present | ⏳ Pending | Run cleanup script |

**Next Steps:**
1. Restart frontend: `docker-compose restart nextjs`
2. Run cleanup: `./scripts/cleanup-test-idps.sh`
3. Test in browser: http://localhost:3000
4. Verify all 3 fixes working

---

**All fixes are committed to branch:** `feature/phase0-hardening-observability`  
**Ready to test after frontend restart**

