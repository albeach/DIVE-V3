# DIVE V3 - Resources Page 401 Fix

## Issue Summary

Resources page returning 401 Unauthorized because the Authorization header wasn't being sent to the backend.

## Root Cause

The session object from NextAuth wasn't including the `accessToken` property, or the property wasn't accessible on the client side.

## Fixes Applied

### 1. Added Debug Logging ✅

**File**: `frontend/src/app/resources/page.tsx`

Added comprehensive logging to track:
- Full session structure
- Whether `accessToken` exists
- Available session keys
- Token length when present

### 2. Fixed Metadata Warnings ✅

**File**: `frontend/src/app/layout.tsx`

- Moved `viewport` and `themeColor` to separate `viewport` export
- Follows Next.js 15 best practices
- Eliminates console warnings

### 3. Fixed CSP for Cloudflare ✅

**File**: `frontend/src/middleware.ts`

- Added `https://static.cloudflareinsights.com` to script-src
- Allows Cloudflare analytics beacon
- Eliminates CSP violation warnings

## Debugging Steps

### Check Browser Console

1. Go to: https://dev-app.dive25.com/resources
2. Open Developer Tools (F12)
3. Look for logs starting with `[Resources]`
4. Check the output:

```javascript
[Resources] Session data: {
  session: { user: {...}, expires: "...", accessToken: "..." },
  hasAccessToken: true,  // Should be TRUE
  hasUser: true,
  sessionKeys: ["user", "expires", "accessToken", ...]  // Should include "accessToken"
}
```

### If `hasAccessToken: false`

The session doesn't have the access token. Possible causes:

1. **User not logged in** - Session is null
2. **Token expired** - Refresh failed
3. **Session structure mismatch** - NextAuth isn't storing the token

### Solution: Force Re-authentication

```bash
# Clear browser cache and cookies
# Or use incognito window

# Then login again at:
https://dev-app.dive25.com/login
```

## Expected Flow

1. User logs in via Keycloak
2. NextAuth stores access token in database
3. Session callback adds `accessToken` to session object
4. Resources page reads `session.accessToken`
5. Sends `Authorization: Bearer {token}` header
6. Backend validates JWT and returns resources

## Check Backend Logs

```bash
cd /home/mike/Desktop/DIVE-V3/DIVE-V3
docker compose logs backend --tail=20

# Look for:
# ✅ "Authorization decision" (success)
# ❌ "Missing Authorization header" (failure)
```

## Files Modified

1. `frontend/src/app/resources/page.tsx` - Added debug logging
2. `frontend/src/app/layout.tsx` - Fixed viewport/themeColor exports
3. `frontend/src/middleware.ts` - Updated CSP for Cloudflare

## Next Steps

### If Still Getting 401

1. **Check if logged in**:
   ```javascript
   // Browser console
   console.log(document.cookie);
   // Should see authjs.session-token
   ```

2. **Force token refresh**:
   - Logout: https://dev-app.dive25.com/api/auth/signout
   - Login again
   - Navigate to resources

3. **Check session in database**:
   ```bash
   docker exec -it dive-v3-postgres psql -U postgres -d dive_v3_app
   SELECT * FROM session WHERE "userId" = (SELECT id FROM "user" WHERE email LIKE '%testuser%');
   \q
   ```

4. **Verify backend CORS**:
   ```bash
   curl -I -H "Origin: https://dev-app.dive25.com" \
        -H "Authorization: Bearer FAKE_TOKEN" \
        https://dev-api.dive25.com/api/resources
   
   # Should return 401 (unauthorized) not 403 (forbidden/CORS)
   ```

## Test After Fix

1. Login: https://dev-app.dive25.com/login
2. Select: "United States (DoD)"
3. Credentials: `testuser-usa-unclass` / `Password123!`
4. Navigate to: https://dev-app.dive25.com/resources
5. Should see: List of UNCLASSIFIED resources
6. Should NOT see: 401 errors in console

## Success Criteria

- ✅ No 401 errors in browser console
- ✅ No "Missing Authorization header" in backend logs
- ✅ Resources load successfully
- ✅ Can see UNCLASSIFIED documents
- ✅ Cannot see SECRET/TOP_SECRET documents

---

**Status**: Debugging tools added. Please test and check browser console for session information.



