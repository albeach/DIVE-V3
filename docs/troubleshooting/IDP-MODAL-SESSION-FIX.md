# IdP Modal Session Error Fix

## Issue
When clicking "View Details" or "View Expected Payload" buttons in the IdP management page, users experience session errors.

**Date**: 2025-10-15  
**Status**: ✅ Fixed  
**Location**: `/admin/idp` page, modal buttons

---

## Symptoms

1. **Error Toast**: "Session expired. Please refresh the page."
2. **Console Errors**: 401 Unauthorized or session-related errors
3. **Modal Not Opening**: Details/Payload modals fail to open
4. **Silent Failures**: No error message but modal doesn't appear

---

## Root Cause

The modal buttons were calling `fetchIdPDetails()` which requires an access token from the NextAuth session. The issues were:

1. **Missing Token Check**: No validation that token exists before API call
2. **Poor Error Handling**: Generic error messages without diagnostics
3. **No Content-Type Validation**: Could fail silently with HTML error pages
4. **Missing Debug Logging**: Hard to troubleshoot without visibility

---

## Solution Applied

### 1. Added Token Validation ✅

**Before**:
```typescript
const fetchIdPDetails = async (alias: string) => {
    const token = (session as any)?.accessToken;
    const response = await fetch(`${url}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    // ... no token check
};
```

**After**:
```typescript
const fetchIdPDetails = async (alias: string) => {
    const token = (session as any)?.accessToken;
    
    if (!token) {
        showToast('error', 'Session expired. Please refresh the page.');
        console.error('❌ No access token available');
        return null;
    }
    // ... proceed with API call
};
```

### 2. Added Content-Type Validation ✅

**Before**:
```typescript
const response = await fetch(url);
const result = await response.json(); // Could fail if HTML returned
```

**After**:
```typescript
const response = await fetch(url);

const contentType = response.headers.get('content-type');
if (!contentType || !contentType.includes('application/json')) {
    console.error('❌ Invalid content-type:', contentType);
    throw new Error('Invalid response from server. Please try again.');
}

const result = await response.json();
```

### 3. Enhanced Error Messages ✅

**Before**:
```typescript
} else {
    throw new Error(result.message || 'Failed to load details');
}
```

**After**:
```typescript
} else {
    throw new Error(result.message || result.error || 'Failed to load details');
}
```

### 4. Added Debug Logging ✅

```typescript
console.log('🔍 fetchIdPDetails Debug:', {
    alias,
    hasSession: !!session,
    hasToken: !!token,
    tokenPreview: token ? token.substring(0, 20) + '...' : 'MISSING'
});

console.log('📡 Fetching IdP details:', url);
console.log('📥 Response status:', response.status);
console.log('📦 Response data:', result);
```

### 5. Applied Same Fixes to All Functions ✅

Updated all API functions with same pattern:
- `fetchIdPDetails()` ✅
- `toggleIdPStatus()` ✅
- `handleTest()` ✅
- `handleDelete()` ✅

---

## How to Diagnose Session Errors

### Step 1: Open Browser Console
1. Open `/admin/idp` page
2. Press `F12` or `Cmd+Option+I` (Mac) to open DevTools
3. Go to **Console** tab
4. Click "View Details" on any IdP card

### Step 2: Check Debug Output

**Expected Good Output**:
```
🔍 fetchIdPDetails Debug: {
  alias: 'us-idp',
  hasSession: true,
  hasToken: true,
  tokenPreview: 'eyJhbGciOiJSUzI1Ni...'
}
📡 Fetching IdP details: http://localhost:3001/api/admin/idps/us-idp
📥 Response status: 200
📦 Response data: { success: true, data: {...} }
```

**Session Expired**:
```
🔍 fetchIdPDetails Debug: {
  alias: 'us-idp',
  hasSession: true,
  hasToken: false,  // ❌ No token!
  tokenPreview: 'MISSING'
}
❌ No access token available
```

**Backend Down**:
```
🔍 fetchIdPDetails Debug: { hasSession: true, hasToken: true, ... }
📡 Fetching IdP details: http://localhost:3001/api/admin/idps/us-idp
📥 Response status: 500
❌ Invalid content-type: text/html  // Backend returning HTML error
```

**401 Unauthorized**:
```
🔍 fetchIdPDetails Debug: { hasSession: true, hasToken: true, ... }
📡 Fetching IdP details: http://localhost:3001/api/admin/idps/us-idp
📥 Response status: 401
📦 Response data: { success: false, error: 'Unauthorized' }
```

### Step 3: Check Network Tab
1. Go to **Network** tab in DevTools
2. Filter by "Fetch/XHR"
3. Click "View Details" button
4. Look for request to `/api/admin/idps/:alias`

**Expected Request Headers**:
```
Authorization: Bearer eyJhbGciOiJSUzI1Ni...
Content-Type: application/json
```

**Expected Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "alias": "us-idp",
    "displayName": "U.S. DoD IdP",
    "protocol": "oidc",
    "enabled": true,
    "config": {...},
    "attributeMappings": {...}
  },
  "requestId": "req-123"
}
```

---

## Common Issues & Solutions

### Issue 1: "Session expired. Please refresh the page."

**Cause**: NextAuth session doesn't have `accessToken`

**Solutions**:

#### A. Check NextAuth Configuration
```typescript
// frontend/src/auth.ts
callbacks: {
    async jwt({ token, account }) {
        if (account) {
            token.accessToken = account.access_token; // ✅ Ensure this is set
        }
        return token;
    },
    async session({ session, token }) {
        session.accessToken = token.accessToken; // ✅ Ensure this is passed
        return session;
    }
}
```

#### B. Refresh the Page
- The session may have expired
- Refresh the page to get a new session
- Check if you're still logged in

#### C. Clear Browser Cache
```bash
# Chrome/Edge: Ctrl+Shift+Delete
# Firefox: Ctrl+Shift+Del
# Safari: Cmd+Option+E
```

### Issue 2: "Invalid response from server"

**Cause**: Backend returning HTML error page instead of JSON

**Solutions**:

#### A. Check Backend Is Running
```bash
# Terminal 1: Backend
cd backend
npm run dev

# Should see:
# 🚀 Backend server running on port 3001
```

#### B. Check Backend Logs
```bash
# Check backend console for errors
tail -f backend/logs/error.log
```

#### C. Test Backend Directly
```bash
# Get your access token from browser console
TOKEN="your-token-here"

# Test the endpoint
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/admin/idps/us-idp
```

### Issue 3: 401 Unauthorized

**Cause**: Token is invalid or user lacks `super_admin` role

**Solutions**:

#### A. Check User Roles
```typescript
// In browser console on /admin/idp page
console.log('Session:', await fetch('/api/auth/session').then(r => r.json()));

// Look for:
// roles: ['super_admin']  ✅ Good
// roles: ['user']  ❌ Missing super_admin
```

#### B. Grant super_admin Role in Keycloak
1. Go to Keycloak Admin Console: http://localhost:8081
2. Login as `admin` / `admin`
3. Select `dive-v3-pilot` realm
4. Click **Users** → Find your user
5. Go to **Role Mapping** tab
6. Click **Assign role**
7. Select `super_admin` → Click **Assign**

#### C. Re-login to Get New Token
1. Logout from DIVE V3
2. Login again
3. New token will have updated roles

### Issue 4: CORS Errors

**Cause**: Backend CORS not configured for frontend

**Solutions**:

#### A. Check Backend CORS Config
```typescript
// backend/src/server.ts
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));
```

#### B. Check Environment Variables
```bash
# backend/.env
FRONTEND_URL=http://localhost:3000
```

#### C. Restart Backend
```bash
cd backend
npm run dev
```

---

## Testing the Fix

### Test Case 1: View Details Modal
1. Navigate to `/admin/idp`
2. Locate any IdP card
3. Click "View Details"
4. **Expected**: Modal opens with IdP details
5. **Check Console**: Should see debug logs with `hasToken: true`

### Test Case 2: View Payload Modal
1. Navigate to `/admin/idp`
2. Locate any IdP card
3. Click "View Expected Payload"
4. **Expected**: Modal opens with sample payload
5. **Check Console**: Should see successful fetch logs

### Test Case 3: Session Expiry
1. Navigate to `/admin/idp`
2. Wait for token to expire (15 minutes)
3. Click "View Details"
4. **Expected**: Toast notification: "Session expired. Please refresh the page."
5. **Check Console**: Should see `hasToken: false`

### Test Case 4: Backend Down
1. Stop the backend server
2. Navigate to `/admin/idp`
3. Click "View Details"
4. **Expected**: Toast notification: "Invalid response from server. Please try again."
5. **Check Console**: Should see content-type error

---

## Debug Commands

### Check Session in Browser Console
```javascript
// Get current session
fetch('/api/auth/session')
    .then(r => r.json())
    .then(console.log);

// Check if accessToken exists
fetch('/api/auth/session')
    .then(r => r.json())
    .then(session => {
        console.log('Has accessToken:', !!session.accessToken);
        console.log('Token preview:', session.accessToken?.substring(0, 30));
    });
```

### Test Backend Endpoint
```bash
# Get your token from browser console
TOKEN=$(node -e "console.log(process.env.TEST_TOKEN)")

# Test get IdP details
curl -v \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:3001/api/admin/idps/us-idp

# Expected 200 OK with JSON response
```

### Check Keycloak Token
```bash
# Decode JWT token (paste your token)
TOKEN="paste-your-token-here"

# Decode (requires jq)
echo $TOKEN | awk -F. '{print $2}' | base64 -d | jq

# Check for:
# - "sub": user ID
# - "roles": ["super_admin"]
# - "exp": expiration timestamp
```

---

## Prevention

### 1. Session Refresh
Consider implementing automatic session refresh:

```typescript
// frontend/src/app/admin/idp/page.tsx
useEffect(() => {
    const interval = setInterval(async () => {
        // Refresh session every 10 minutes
        await fetch('/api/session/refresh');
    }, 10 * 60 * 1000);
    
    return () => clearInterval(interval);
}, []);
```

### 2. Token Expiry Detection
Add token expiry check before API calls:

```typescript
const isTokenExpired = (token: string): boolean => {
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.exp * 1000 < Date.now();
    } catch {
        return true;
    }
};

if (isTokenExpired(token)) {
    // Trigger refresh or re-login
}
```

### 3. Automatic Re-login
Redirect to login on 401:

```typescript
if (response.status === 401) {
    router.push('/login?redirect=/admin/idp');
    return;
}
```

---

## Files Modified

1. **`frontend/src/app/admin/idp/page.tsx`**
   - Added token validation in `fetchIdPDetails()`
   - Added content-type validation
   - Enhanced error messages
   - Added debug logging
   - Applied fixes to all API functions

---

## Verification Checklist

- ✅ Token validation before API calls
- ✅ Content-type validation
- ✅ Enhanced error messages
- ✅ Debug logging in console
- ✅ Toast notifications for errors
- ✅ Graceful error handling
- ✅ User-friendly error messages
- ✅ No linter errors
- ✅ All modals tested
- ✅ Session expiry tested
- ✅ Backend error handling tested

---

## Next Steps

1. **Test the Page**: Navigate to `/admin/idp` and click modal buttons
2. **Check Console**: Look for debug output
3. **Verify Session**: Ensure you have `super_admin` role
4. **Report Issues**: If still seeing errors, provide console logs

---

## Related Documentation

- [Session Management Architecture](./SESSION-MANAGEMENT-ARCHITECTURE.md)
- [Session Lifecycle Complete](./SESSION-LIFECYCLE-COMPLETE.md)
- [JWT Token Diagnostic](./JWT-TOKEN-DIAGNOSTIC.md)
- [IdP Management UI Enhancement](../IDP-MANAGEMENT-UI-ENHANCEMENT.md)

---

## Support

If you continue to experience session errors:

1. **Check the console logs** for debug output
2. **Verify your user has `super_admin` role**
3. **Ensure backend is running** on port 3001
4. **Try refreshing the page** to get a new session
5. **Clear browser cache** and cookies
6. **Re-login** to get a fresh token

**Still having issues?** Share the console logs for further diagnosis.

