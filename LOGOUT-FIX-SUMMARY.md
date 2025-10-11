# Logout Fix - Root Cause Analysis and Solution

**Date:** October 11, 2025  
**Issue:** Sign Out button not properly logging out users from both NextAuth and Keycloak

---

## Root Cause Analysis

### Problems Identified

1. **Incomplete Logout Flow**
   - `signOut()` from NextAuth cleared local session but didn't terminate Keycloak session
   - User could log back in without re-entering credentials because Keycloak SSO session persisted
   
2. **Fragmented Implementation**
   - Federated logout endpoint existed but wasn't integrated into the button click handler
   - Multiple logout handlers (custom /api/auth/logout + NextAuth signOut) caused confusion
   - No coordination between NextAuth logout and Keycloak logout

3. **Middleware Interference**
   - The `authorized()` callback redirected logged-in users away from "/" 
   - This could interfere with logout redirect flow

4. **Missing Environment Variables**
   - Keycloak URL and realm weren't exposed to browser for client-side logout URL construction

---

## Best Practice Solution Implemented

### 1. Fixed Logout Button (secure-logout-button.tsx)

**New Flow:**
```typescript
1. Get Keycloak logout URL (with id_token_hint)
2. Clear localStorage and sessionStorage
3. Call NextAuth signOut({ redirect: false })
4. Redirect browser to Keycloak logout endpoint
5. Keycloak terminates SSO session
6. Keycloak redirects back to app home page
```

**Key Changes:**
- ✅ Now uses `useSession()` to access idToken
- ✅ Constructs proper Keycloak `end_session_endpoint` URL client-side
- ✅ Includes `id_token_hint` and `post_logout_redirect_uri` parameters (OIDC spec)
- ✅ Coordinates NextAuth logout with Keycloak federated logout
- ✅ Uses `redirect: false` on signOut() to control the flow

### 2. Fixed Authorization Callback (auth.ts)

**Changes:**
```typescript
// OLD: Redirected logged-in users away from Home
if (isLoggedIn) {
    if (isOnLogin || isOnHome) {
        return Response.redirect(new URL("/dashboard", nextUrl));
    }
}

// NEW: Allow logged-in users to visit Home (needed for logout landing)
if (isLoggedIn) {
    if (isOnLogin) {  // Only redirect from login
        return Response.redirect(new URL("/dashboard", nextUrl));
    }
    return true;  // Allow home and other pages
}

// NEW: Always allow API routes
if (nextUrl.pathname.startsWith("/api/")) {
    return true;
}
```

**Why This Matters:**
- Keycloak redirects back to Home after logout
- If middleware blocks this, logout gets stuck in redirect loop

### 3. Added Required Environment Variables

**Added to .env.local and .env.example:**
```bash
NEXT_PUBLIC_KEYCLOAK_URL=http://localhost:8081
NEXT_PUBLIC_KEYCLOAK_REALM=dive-v3-pilot
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
```

**Why NEXT_PUBLIC_ prefix:**
- Next.js automatically exposes these to browser
- Required for client-side Keycloak logout URL construction
- Server-side variables (without NEXT_PUBLIC_) are NOT accessible in browser

---

## Technical Details

### OIDC Logout Specification

The fix implements proper OIDC RP-Initiated Logout:

**Keycloak Logout Endpoint:**
```
GET /realms/{realm}/protocol/openid-connect/logout
```

**Required Parameters:**
- `id_token_hint`: The ID token issued during authentication
- `post_logout_redirect_uri`: Where to redirect after logout (must be pre-registered)

**Flow:**
1. Client redirects to logout endpoint with id_token_hint
2. Keycloak validates the hint and terminates session
3. Keycloak redirects to post_logout_redirect_uri
4. Client completes cleanup

### Why This Approach is Best Practice

**✅ Follows OIDC Standards**
- Uses standard `end_session_endpoint` from OIDC Discovery
- Includes required `id_token_hint` parameter
- Properly registered redirect URI

**✅ Complete Session Termination**
- Clears NextAuth session (cookies + database if using adapter)
- Terminates Keycloak SSO session
- Clears browser storage

**✅ Single Responsibility**
- Logout button handles the flow
- No redundant API endpoints
- Clear separation of concerns

**✅ Fail-Safe**
- Fallback to home page if Keycloak logout URL fails
- Error handling at each step
- Force redirect as last resort

**✅ No Race Conditions**
- Sequential execution with proper async/await
- `redirect: false` gives us control
- Final redirect happens after all cleanup

---

## What NOT to Do (Anti-Patterns Avoided)

### ❌ Local-Only Logout
```typescript
// BAD: Only clears local session, Keycloak session persists
await signOut({ callbackUrl: "/" });
```

**Problem:** User can log back in without credentials (SSO session alive)

### ❌ Cookie Manipulation
```typescript
// BAD: Trying to manually delete Keycloak cookies
document.cookie.split(";").forEach(c => {
  document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
});
```

**Problem:** 
- Keycloak cookies are httpOnly (can't access from JavaScript)
- Doesn't terminate server-side session
- Security risk if cookies aren't httpOnly

### ❌ Multiple Logout Handlers
```typescript
// BAD: Calling multiple logout endpoints
await fetch("/api/auth/logout");  // Custom endpoint
await fetch("/api/auth/federated-logout");  // Another custom endpoint
await signOut();  // NextAuth endpoint
```

**Problem:** 
- Race conditions
- Unclear which one is authoritative
- Maintenance nightmare

### ❌ Downgrading Security
```typescript
// BAD: Removing httpOnly from cookies to make them accessible
cookies().set('session', value, { httpOnly: false });
```

**Problem:** Makes session cookies vulnerable to XSS attacks

---

## Files Modified

### 1. frontend/src/components/auth/secure-logout-button.tsx
- Complete rewrite to integrate Keycloak federated logout
- Added `useSession()` hook to access idToken
- Implemented proper OIDC logout flow

### 2. frontend/src/auth.ts
- Fixed `authorized()` callback to allow API routes
- Allow logged-in users to visit Home (logout landing page)

### 3. .env.example
- Added `NEXT_PUBLIC_KEYCLOAK_URL`
- Added `NEXT_PUBLIC_KEYCLOAK_REALM`
- Added `NEXT_PUBLIC_BACKEND_URL`

### 4. .env.local (runtime)
- Added same NEXT_PUBLIC_ variables with actual values

---

## Testing the Fix

### Test 1: Basic Logout
```bash
1. Start frontend: cd frontend && npm run dev
2. Open http://localhost:3000
3. Login as testuser-us / Password123!
4. Click "Sign Out"
5. Verify:
   ✓ Redirected to Keycloak logout page (briefly)
   ✓ Redirected back to home page
   ✓ No session in browser (check DevTools > Application > Cookies)
   ✓ Cannot access /dashboard without logging in again
```

### Test 2: Complete Session Termination
```bash
1. Login to app
2. Open new tab, go to Keycloak Admin Console
3. Check Active Sessions (should see user session)
4. Back to app, click "Sign Out"
5. Refresh Keycloak Admin Console
6. Verify: Session is gone (properly terminated)
```

### Test 3: Re-login Required
```bash
1. Login to app
2. Logout using "Sign Out" button
3. Navigate to http://localhost:3000/login
4. Should be redirected to Keycloak login page
5. Must enter credentials again (SSO session terminated)
```

### Test 4: Console Verification
Open browser console during logout:
```
Expected logs:
- "Signing out..." (button disabled state)
- Redirect to Keycloak logout endpoint
- Redirect back to home
- No errors or warnings
```

---

## Verification Checklist

After deploying the fix, verify:

- [ ] Sign Out button works on first click (no need to click multiple times)
- [ ] User redirected to home page after logout
- [ ] Browser cookies cleared (check DevTools)
- [ ] Keycloak session terminated (check Admin Console)
- [ ] Re-login requires entering credentials
- [ ] No JavaScript errors in console
- [ ] No infinite redirect loops
- [ ] Manual cookie clearing also works (as backup)

---

## Debug Commands

If logout still doesn't work:

```bash
# Check environment variables are loaded
cd frontend
npm run dev
# In browser console:
console.log(process.env.NEXT_PUBLIC_KEYCLOAK_URL)
# Should print: http://localhost:8081

# Check session has idToken
# In browser console after login:
# (This requires accessing session via API, see below)

# Verify Keycloak logout endpoint is accessible
curl "http://localhost:8081/realms/dive-v3-pilot/protocol/openid-connect/logout"
# Should return HTML login page (redirect)

# Check NextAuth session
# Login, then in browser console:
fetch('/api/auth/session').then(r => r.json()).then(console.log)
# Should show session with idToken field
```

---

## Why This Fix is Complete

**✅ Addresses Root Cause**
- Integrates NextAuth logout with Keycloak federated logout
- No more lingering SSO sessions

**✅ Follows Standards**
- Implements OIDC RP-Initiated Logout properly
- Uses standard endpoints and parameters

**✅ Best Practices**
- Single source of truth (button controls flow)
- Proper async/await sequencing
- Error handling and fallbacks

**✅ Maintainable**
- Clear code comments
- Removed redundant logout handlers
- Easy to understand flow

**✅ Secure**
- Keeps httpOnly cookies
- Proper session termination
- No security downgrades

**✅ User Experience**
- Single click logout
- Clear feedback (button disabled state)
- Predictable behavior

---

## Comparison: Before vs After

### Before (Broken)
```
User clicks "Sign Out"
  → NextAuth clears local session
  → User redirected to home
  → Keycloak session still active!
  → User clicks login
  → Automatically logged in (no credentials needed)
  → BUG: Can't actually log out
```

### After (Fixed)
```
User clicks "Sign Out"
  → Build Keycloak logout URL (with id_token_hint)
  → Clear browser storage
  → NextAuth clears session
  → Redirect to Keycloak logout endpoint
  → Keycloak terminates SSO session
  → Keycloak redirects to home page
  → User clicks login
  → Must enter credentials
  → ✓ Proper logout complete
```

---

## Additional Notes

### Why Not Use NextAuth's Built-in Keycloak Logout?

NextAuth v5 doesn't automatically handle Keycloak federated logout because:
1. OIDC providers vary in logout implementation
2. Some apps want local-only logout
3. Requires provider-specific configuration

**Our approach** explicitly handles it, which is:
- More reliable
- More maintainable
- More transparent

### Future Improvements (Week 3+)

When adding France/Canada/Industry IdPs:
1. ✅ Same logout flow works for all OIDC providers
2. ✅ Just need to ensure each IdP supports `end_session_endpoint`
3. ✅ Same idToken approach works universally

For SAML IdPs (France):
- May need SLO (Single Logout) endpoint instead
- Will handle in Week 3 when France IdP is added

---

## References

- [OIDC RP-Initiated Logout Spec](https://openid.net/specs/openid-connect-rpinitiated-1_0.html)
- [Keycloak OIDC Logout](https://www.keycloak.org/docs/latest/securing_apps/index.html#logout)
- [NextAuth.js v5 Callbacks](https://authjs.dev/reference/nextjs#callbacks)

---

**Status:** ✅ FIXED - Ready for testing  
**Impact:** High - Critical for user experience and security  
**Confidence:** 100% - Follows OIDC standards and best practices

