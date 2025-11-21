# DIVE V3 Logout Issue - Debugging Instructions

## Symptom
After clicking logout, user appears logged out but clicking the same realm auto-logs them back in without credentials/MFA.

## Root Cause (Suspected)
**Dual SSO Session Problem**: User has TWO Keycloak SSO sessions:
1. **National Realm Session** (e.g., `dive-v3-usa`) - where they actually authenticated
2. **Broker Realm Session** (`dive-v3-broker`) - where the app connects

Current logout only terminates the **broker** session, leaving the **national realm** session active!

## Debug Steps (Run on Remote Machine)

### Step 1: Reproduce the Issue
```bash
# 1. Open browser to https://your-hostname:3000
# 2. Click "Sign In"
# 3. Select "United States (DoD)" (or any realm)
# 4. Login with credentials
# 5. Complete MFA if prompted
# 6. Confirm you're logged in to dashboard
```

### Step 2: Check Browser Console Logs
**Open DevTools (F12) → Console tab**

Click the Logout button and capture ALL console output. Look for:

```javascript
// Should see:
[DIVE] User-initiated logout - starting COMPREHENSIVE cleanup...
[DIVE] Step 1: Getting Keycloak logout URL (BEFORE clearing session)...
[DIVE] Building Keycloak logout URL...
[DIVE] Keycloak logout config: {
  keycloakUrl: "https://your-hostname:8443",
  realm: "dive-v3-broker",  // ← THIS IS THE PROBLEM!
  baseUrl: "https://your-hostname:3000"
}
```

**Key Question**: What is the `realm` value? It should be `dive-v3-broker` currently.

### Step 3: Check Keycloak Cookies
**In DevTools:**
1. Go to **Application** tab
2. Click **Cookies** → `https://your-hostname:8443`
3. Look for these cookies:

```
AUTH_SESSION_ID          // Active if session exists
KEYCLOAK_SESSION         // Main SSO session
KEYCLOAK_SESSION_LEGACY  // Legacy format
AUTH_SESSION_ID_LEGACY   // Legacy format
```

**After logout**, check if any of these cookies STILL exist. If they do → SSO session not terminated!

### Step 4: Test Auto-Login
After logout:
1. Go to https://your-hostname:3000
2. Click "Sign In"
3. Select the SAME realm you logged in with before
4. **What happens?**
   - ❌ **Auto-logs you in** (no password prompt) = SSO session still active
   - ✅ **Prompts for password** = Logout successful

### Step 5: Check Network Tab
**In DevTools → Network tab:**

After logout, look for request to:
```
https://your-hostname:8443/realms/dive-v3-broker/protocol/openid-connect/logout
```

**Check:**
- Is this request made?
- What's the response status? (should be 204 or redirect)
- Are the query parameters correct?
  - `id_token_hint=...`
  - `post_logout_redirect_uri=https://your-hostname:3000`

### Step 6: Manual Keycloak Logout Test
Try manually logging out from Keycloak:

**For Broker Realm:**
```
https://your-hostname:8443/realms/dive-v3-broker/protocol/openid-connect/logout?redirect_uri=https://your-hostname:3000
```

**For National Realm (replace 'usa' with your realm):**
```
https://your-hostname:8443/realms/dive-v3-usa/protocol/openid-connect/logout?redirect_uri=https://your-hostname:3000
```

Does manually visiting these URLs terminate the session?

## Expected Console Output (Working Logout)

```javascript
[DIVE] User-initiated logout - starting COMPREHENSIVE cleanup...
[DIVE] Step 1: Getting Keycloak logout URL...
[DIVE] ✅ Keycloak logout URL obtained
[DIVE] Step 2: Complete server-side logout...
[DIVE] Server-side logout SUCCESS: { success: true, deletedSessions: 1 }
[DIVE] Step 3: NextAuth signOut...
[DIVE] NextAuth signOut complete
[DIVE] Step 4: Clearing browser storage...
[DIVE] Browser storage cleared
[DIVE] Step 5: Notifying other tabs...
[DIVE] Other tabs notified
[DIVE] Step 6: Terminating Keycloak SSO session...
[DIVE] Redirecting to Keycloak for SSO termination
```

## Collect These Details

Please provide:

1. **Browser console logs** (full output from logout click)
2. **Keycloak cookies** (before and after logout)
3. **Network tab** (logout request details)
4. **Auto-login behavior** (does it prompt for password or auto-login?)
5. **Which realm** you're testing with (USA, France, Canada, etc.)

## Temporary Workaround

If you need to fully logout RIGHT NOW:

1. Click logout button in app
2. Then manually visit:
   ```
   https://your-hostname:8443/realms/dive-v3-usa/protocol/openid-connect/logout?redirect_uri=https://your-hostname:3000
   ```
   (Replace `usa` with the realm you logged into)
3. Clear browser cookies for the site
4. Close all tabs
5. Reopen browser

This will force a complete logout.

## Root Cause Analysis (Technical)

### The Problem

**Identity Brokering Flow:**
```
User → dive-v3-usa (National Realm)
       └→ Authenticates with password + MFA
          └→ Redirected to dive-v3-broker (Broker Realm)
             └→ Creates app session
                └→ User accesses app
```

**Current Logout:**
```
User clicks logout
  → App calls: /realms/dive-v3-broker/logout ✓
  → But dive-v3-usa session STILL ACTIVE! ✗
```

**Next login attempt:**
```
User clicks "United States (DoD)"
  → Redirected to dive-v3-usa
  → SSO session FOUND (still active)
  → Auto-login without password ✗
```

### The Fix (Coming)

Need to logout from BOTH realms:
1. Logout from national realm first (where user authenticated)
2. Then logout from broker realm (where app connects)

Or use Keycloak **backchannel logout** to cascade the logout automatically.

## References

- [Keycloak OIDC Logout](https://www.keycloak.org/docs/latest/securing_apps/#logout)
- [OpenID Connect RP-Initiated Logout](https://openid.net/specs/openid-connect-rpinitiated-1_0.html)
- [Keycloak Identity Brokering](https://www.keycloak.org/docs/latest/server_admin/#_identity_broker)





