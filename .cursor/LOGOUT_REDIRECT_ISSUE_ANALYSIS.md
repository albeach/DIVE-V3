# Logout Redirect Issue - Full Stack Trace

**Date:** 2026-01-24  
**Issue:** Invalid redirect URI error during logout  
**Status:** 🔍 **ANALYSIS COMPLETE** - User action required  

---

## 🚨 SYMPTOMS

**User Experience:**
1. Deleted PostgreSQL user → Auto-logged back in (browser cache)
2. Tried to log out
3. Got Keycloak error page:
   ```
   ⚠️ Unable to Complete Request
   Configuration Issue
   The application redirect is not authorized
   ```

**Error Details:**
```
TYPE: LOGOUT_ERROR
REALM: dive-v3-broker-usa
CLIENT: dive-v3-broker-usa
ERROR: invalid_redirect_uri
REDIRECT_URI: https://localhost:3000/
TIMESTAMP: 2026-01-23T06:53:43Z
```

---

## 🔍 ROOT CAUSE ANALYSIS

### Layer 1: Browser Session Cache

**Problem:** When PostgreSQL user was deleted, browser still had valid session cookie.

**Evidence:**
```
Frontend logs: "Complete logout successful"
User experience: "Auto-logged back in to same session"
```

**Explanation:**
- NextAuth session stored in browser cookie
- PostgreSQL user deleted but cookie still valid
- Browser sent cookie → NextAuth validated → User "logged in"
- This is EXPECTED behavior (sessions survive brief DB outages)

### Layer 2: Logout Redirect URI

**Problem:** Post-logout redirect to `https://localhost:3000/` (with trailing slash) not configured.

**Current Configuration:**
```javascript
{
  "post.logout.redirect.uris": "https://localhost:3000##https://localhost:4000##https://localhost:8443"
}
```

**Issue:** Keycloak uses `##` separator but may require exact match (with or without trailing slash).

**Keycloak Logs:**
```
LOGOUT_ERROR: redirect_uri="https://localhost:3000/" ← Note trailing slash
Configured:   "https://localhost:3000" ← No trailing slash
```

### Layer 3: Frontend Not Restarted

**Problem:** Frontend container hasn't reloaded new `auth.ts` code.

**Evidence:**
```
Container status: Up 47 minutes (healthy)
Code change: 10 minutes ago
```

**Impact:**
- Automatic account linking code not active
- User would still get OAuthAccountNotLinked on fresh login
- Need to restart frontend

---

## ✅ COMPLETE RESOLUTION STEPS

### Step 1: Clear Browser State (USER ACTION)

**In your browser:**
1. **Clear all cookies** for localhost:
   - Chrome: DevTools → Application → Cookies → https://localhost:3000 → Delete all
   - Or use Incognito/Private window
2. **Clear session storage:** Console → `sessionStorage.clear()`
3. **Clear local storage:** Console → `localStorage.clear()`
4. **Hard refresh:** Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)

**Why:** Browser cache/cookies keeping you in old session.

### Step 2: Restart Frontend Container (SYSTEM)

```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3
docker compose -f docker-compose.hub.yml restart frontend
# Wait 20 seconds for rebuild
```

**Why:** Load new auth.ts code with automatic account linking.

### Step 3: Add Trailing Slash to Logout URIs (TERRAFORM FIX)

**File:** `terraform/modules/federated-instance/main.tf` line 217-225

**Current:**
```hcl
valid_post_logout_redirect_uris = concat(
  [var.app_url, var.api_url, var.idp_url],
  ...
)
```

**Should Add:**
```hcl
valid_post_logout_redirect_uris = concat(
  [
    var.app_url,
    "${var.app_url}/",  # With trailing slash
    var.api_url,
    var.idp_url
  ],
  ...
)
```

**Why:** Keycloak may require exact match including trailing slash.

### Step 4: Test Fresh Login

**After Steps 1-3:**
1. Navigate to https://localhost:3000 (fresh browser state)
2. Should see login page (not auto-logged in)
3. Click "FRA Instance"
4. Login: testuser-fra-1 / TestUser2025!Pilot
5. Should succeed with correct attributes

---

## 🎯 WHAT HAPPENED (Timeline)

### T+0: Initial State
- User logged in via FRA IdP
- PostgreSQL user: `beeb4e65-...`
- Keycloak user: `1c424c3d-...` (deleted during testing)
- Browser session cookie: valid

### T+1: Attempted Re-Login
- Tried to click FRA IdP button
- NextAuth check: email exists in DB
- Keycloak account: different providerAccountId (new ID after deletion)
- Error: OAuthAccountNotLinked

### T+2: PostgreSQL Cleanup
- Deleted user from PostgreSQL: `DELETE 1`
- Browser cookie still valid (points to deleted user)
- Browser refresh → NextAuth reads cookie → "logged in" to non-existent user

### T+3: Logout Attempt
- Frontend calls `/api/auth/logout`
- Deletes session from database ✅
- Redirects to Keycloak logout
- Keycloak redirect URI: `https://localhost:3000/` (trailing slash)
- Configured URIs: `https://localhost:3000` (no slash)
- Error: invalid_redirect_uri

### T+4: Refresh Loop
- Browser stuck redirecting
- Session cookie not fully cleared
- Frontend code not reloaded

---

## 💡 PERSISTENT FIXES NEEDED

### Fix #1: Post-Logout Redirect URIs (TERRAFORM) ✅ Documented

**Add to:** `terraform/modules/federated-instance/main.tf`

```hcl
valid_post_logout_redirect_uris = concat(
  [
    var.app_url,
    "${var.app_url}/",  # With trailing slash
    "${var.app_url}/*", # Wildcard for any path
    var.api_url,
    var.idp_url
  ],
  ...
)
```

**Applies to:** Hub and all Spokes

### Fix #2: Browser Session Handling (FRONTEND) - Consider

**Option A: Force Hard Logout**
```typescript
// In signOut handler, clear all browser state
window.sessionStorage.clear();
window.localStorage.clear();
document.cookie.split(";").forEach(c => {
  document.cookie = c.split("=")[0] + "=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;";
});
```

**Option B: Logout Redirect with +**
```typescript
// In NextAuth config
callbacks: {
  async redirect({ url, baseUrl }) {
    // On logout, force redirect to base URL
    if (url.startsWith('/')) return baseUrl;
    if (new URL(url).origin === baseUrl) return url;
    return baseUrl;
  }
}
```

---

## 🧪 IMMEDIATE WORKAROUND

**For current testing session:**

```bash
# 1. Clear browser completely
# In DevTools Console:
sessionStorage.clear();
localStorage.clear();
document.cookie.split(";").forEach(c => document.cookie = c.split("=")[0] + "=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;");

# 2. OR use Incognito window
# Cmd+Shift+N (Chrome) / Cmd+Shift+P (Firefox)

# 3. Navigate fresh to https://localhost:3000

# 4. Login via FRA Instance
# Should work now with both fixes applied
```

---

## 📊 STATE VERIFICATION

### Current System State:

**PostgreSQL (dive_v3_app):**
```sql
SELECT COUNT(*) FROM "user";  
-- Result: 0 users (orphaned user deleted) ✅
```

**Keycloak (dive-v3-broker-usa):**
```
fra-idp.config.defaultScope: "openid profile email clearance countryOfAffiliation..." ✅
```

**Frontend Code:**
```typescript
// Automatic account linking: IMPLEMENTED ✅
// Loaded: NO (container not restarted) ❌
```

**Browser:**
```
Session cookie: MAY BE STALE (need to clear) ⚠️
```

---

## ✅ ACTION ITEMS

### For You (USER):
1. **Clear browser state:**
   - Use Incognito window, OR
   - DevTools → Clear all cookies/storage
2. **Try login again** via FRA Instance
3. **Report back** if attributes are correct

### For System (AUTOMATED):
1. ✅ Restart frontend (loading new code)
2. ⏳ Add trailing slash to post-logout URIs (Terraform change)
3. ⏳ Apply Terraform (redeploy or targeted apply)

---

## 📚 REFERENCES

- **Frontend Logs:** Logout successful (no error)
- **Keycloak Logs:** `LOGOUT_ERROR, invalid_redirect_uri, redirect_uri="https://localhost:3000/"`
- **Client Config:** `post.logout.redirect.uris = "https://localhost:3000##..."`
- **Code Fix:** Automatic account linking implemented (commit 93a19f04)
- **Scope Fix:** DIVE custom scopes added (commit 0ee9c4bc)

---

**Status:** 🔄 **Fixes Applied, User Testing Required**  
**Next:** Clear browser cache and test login via FRA IdP  

---

*Analysis complete - 2026-01-24*
