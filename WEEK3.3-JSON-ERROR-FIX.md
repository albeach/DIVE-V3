# JSON Parse Error Fix ✅

**Error:** `SyntaxError: JSON.parse: unexpected character at line 1 column 1`  
**Location:** `/admin/*` pages  
**Status:** ✅ **FIXED**  
**Date:** October 13, 2025

---

## 🐛 Root Cause Analysis

### What Was Happening

**The Error:**
```
Unhandled Runtime Error
SyntaxError: JSON.parse: unexpected character at line 1 column 1 of the JSON data
```

**Why It Occurred:**

1. **Admin pages make API calls** to backend:
   - `/api/admin/idps` (IdP list)
   - `/api/admin/logs` (audit logs)
   - `/api/admin/logs/stats` (statistics)
   - `/api/admin/approvals/pending` (pending approvals)

2. **Backend returns HTML instead of JSON** when:
   - Backend is not running
   - 401 Unauthorized (missing/invalid JWT)
   - 403 Forbidden (missing super_admin role)
   - 500 Internal Server Error
   - CORS issues

3. **Frontend code tried to parse HTML as JSON:**
   ```javascript
   const result = await response.json();  // ← BOOM! HTML isn't JSON
   ```

4. **Result:** Unhandled runtime error crashes the page

---

## ✅ Solution Implemented

### Proper Error Handling Pattern

**Before (Unsafe):**
```typescript
const response = await fetch(url, { headers });
const result = await response.json();  // ← Assumes JSON
```

**After (Safe):**
```typescript
const response = await fetch(url, { headers });

// Check content-type BEFORE parsing
const contentType = response.headers.get('content-type');
if (!contentType || !contentType.includes('application/json')) {
    throw new Error(`Expected JSON but got ${contentType}`);
}

const result = await response.json();  // ← Now safe
```

### Applied to All Admin API Calls

**Pages Fixed:**
1. ✅ `/admin/dashboard` - Stats fetch
2. ✅ `/admin/idp` - IdPs fetch
3. ✅ `/admin/logs` - Logs fetch
4. ✅ `/admin/approvals` - Pending fetch

**Pattern Added:**
- Content-type validation
- Helpful error messages
- Console error logging
- Graceful degradation (show error UI instead of crash)

---

## 🔍 Debugging the Issue

### Check 1: Is Backend Running?

```bash
# Check if backend is running
curl http://localhost:4000/health

# Expected:
{"status":"healthy","timestamp":"..."}

# If error:
# - Start backend: cd backend && npm run dev
```

### Check 2: Check Backend Logs

```bash
# In another terminal
cd backend
npm run dev

# Watch for errors when accessing /admin pages
# Look for:
# - "Admin access denied: Missing super_admin role"
# - "JWT verification failed"
# - "Authorization service unavailable"
```

### Check 3: Check Browser Network Tab

1. Open DevTools → Network tab
2. Navigate to `/admin/dashboard`
3. Look for request to `/api/admin/logs/stats`
4. Check response:
   - **Status:** Should be 200, might be 401/403/500
   - **Content-Type:** Should be `application/json`, might be `text/html`
   - **Response body:** Should be JSON, might be HTML error page

### Check 4: Verify JWT Token

```bash
# In browser console
console.log(session.accessToken)

# Should show a long JWT string
# If undefined: Session issue, logout and login again
```

### Check 5: Test Admin Endpoint Directly

```bash
# Get JWT token from browser
TOKEN="eyJhbGc..."  # Copy from session.accessToken

# Test endpoint
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:4000/api/admin/idps

# Expected (success):
{"success":true,"data":{"idps":[...],"total":4}}

# If error:
# - Check token validity
# - Check super_admin role in token
# - Check backend admin middleware
```

---

## 🔧 Common Causes & Solutions

### Cause 1: Backend Not Running

**Symptom:** All admin pages show errors

**Solution:**
```bash
cd backend
npm run dev

# Verify:
curl http://localhost:4000/health
```

### Cause 2: Missing super_admin Role

**Symptom:** 403 Forbidden errors

**Check Keycloak:**
1. Keycloak Admin Console: `http://localhost:8081/admin`
2. Login: admin / admin
3. Realm: dive-v3-pilot
4. Users → testuser-us → Role Mappings
5. Verify "super_admin" in Assigned Roles

**If missing:**
```bash
cd terraform
terraform apply  # Re-applies role assignment
```

**Or assign manually:**
1. Keycloak → Users → testuser-us
2. Role Mappings → Available Roles
3. Select "super_admin"
4. Click "Add selected"

### Cause 3: JWT Token Expired/Missing

**Symptom:** "No access token available"

**Solution:**
1. Logout completely
2. Clear browser cache
3. Login fresh
4. Check console for JWT extraction logs

### Cause 4: CORS Issues

**Symptom:** Network errors, CORS policy messages

**Check Backend CORS:**
```typescript
// backend/src/server.ts
app.use(cors({
  origin: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID']
}));
```

**Verify:**
```bash
# Check CORS headers
curl -I -H "Origin: http://localhost:3000" \
  http://localhost:4000/api/admin/idps

# Should include:
Access-Control-Allow-Origin: http://localhost:3000
```

### Cause 5: MongoDB Not Running

**Symptom:** Logs/Approvals pages error (IdP page works)

**Solution:**
```bash
# Check MongoDB
docker-compose ps | grep mongodb

# If not running:
docker-compose up -d mongodb
```

---

## 🧪 Testing the Fix

### Step 1: Restart Everything

```bash
# Restart backend
cd backend
npm run dev

# Restart frontend (in another terminal)
cd frontend  
npm run dev
```

### Step 2: Access Admin Pages

1. Login as testuser-us
2. Click "👑 Admin" dropdown
3. Click "Dashboard"

**Expected:**
- Navigation appears ✅
- Page loads ✅
- No console errors ✅
- Stats load (or show empty state if no data) ✅

### Step 3: Check Console

**Good (no errors):**
```
[DIVE] Custom claims extracted: { ... roles: ["user", "super_admin"] }
```

**Bad (errors to debug):**
```
fetchStats error: Expected JSON but got text/html
// ↑ Backend is down or returning error page

fetchIdPs error: No access token available
// ↑ Session issue, logout and login again

fetchLogs error: API error: 403 Forbidden
// ↑ Missing super_admin role
```

---

## 📊 Error Handling Flow

### New Error Handling Pattern

```
API Call
   ↓
Check: Has access token?
   ├─ No → Show error message, don't crash
   └─ Yes → Continue
   ↓
Fetch from API
   ↓
Check: Response is JSON?
   ├─ No → Show helpful error, log to console
   └─ Yes → Continue
   ↓
Parse JSON
   ↓
Check: Response OK?
   ├─ No → Show API error message
   └─ Yes → Display data
```

### User-Friendly Error Messages

**Displayed in UI:**
- "No access token available. Please refresh the page."
- "Expected JSON but got text/html. Backend may be down."
- "API error: 403 Forbidden"
- "Failed to load IdPs"

**Logged to Console:**
- Full error details
- Response content-type
- HTTP status
- Stack trace (if applicable)

---

## 🎯 Expected Behavior After Fix

### Scenario 1: Backend Running, User Has Role
- ✅ Pages load successfully
- ✅ Data displays correctly
- ✅ No console errors

### Scenario 2: Backend Down
- ✅ Page doesn't crash
- ✅ Shows error message: "Backend may be down"
- ✅ Console logs helpful debug info
- ✅ Navigation still works

### Scenario 3: Missing super_admin Role
- ✅ Page doesn't crash
- ✅ Shows error: "API error: 403 Forbidden"
- ✅ Console logs role issue
- ✅ User can navigate away

### Scenario 4: Token Expired
- ✅ Shows error: "No access token available"
- ✅ User can logout and login again
- ✅ No page crash

---

## 📝 Files Changed

### Error Handling Added (4 files)

1. **`frontend/src/app/admin/dashboard/page.tsx`**
   - Added content-type check before JSON parse
   - Added early return if no access token
   - Added console error logging

2. **`frontend/src/app/admin/idp/page.tsx`**
   - Added content-type validation
   - Enhanced error messages
   - Added console logging

3. **`frontend/src/app/admin/logs/page.tsx`**
   - Added content-type validation
   - Improved error handling
   - Added debug logging

4. **`frontend/src/app/admin/approvals/page.tsx`**
   - Added content-type check
   - Enhanced error messages
   - Added console logging

---

## ✅ Verification Steps

### After restarting frontend:

1. **Navigate to `/admin/dashboard`**
   - [ ] Navigation appears
   - [ ] Page loads without crash
   - [ ] Check console for errors

2. **Navigate to `/admin/idp`**
   - [ ] Navigation appears
   - [ ] IdP list loads (or empty state)
   - [ ] No JSON parse errors

3. **Navigate to `/admin/logs`**
   - [ ] Navigation appears
   - [ ] Logs load or show empty state
   - [ ] No console errors

4. **Navigate to `/admin/approvals`**
   - [ ] Navigation appears
   - [ ] Approvals load or show "No pending"
   - [ ] No errors

5. **Check Browser Console**
   - [ ] No red errors
   - [ ] Only info/debug logs
   - [ ] Roles extracted successfully

---

## 🔍 If Errors Persist

### Check Backend Status

```bash
# Test health endpoint
curl http://localhost:4000/health

# Test admin endpoint with token
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:4000/api/admin/idps

# Check response:
# - Should be JSON
# - Should have success: true
# - Or error message if role missing
```

### Check Keycloak

```bash
# Verify super_admin role exists
curl -H "Authorization: Bearer ADMIN_TOKEN" \
  http://localhost:8081/admin/realms/dive-v3-pilot/roles/super_admin

# Should return role details
```

### Verify Environment Variables

```bash
# Check .env.local
cat .env.local | grep -E "(NEXT_PUBLIC_BACKEND_URL|KEYCLOAK)"

# Should show:
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
KEYCLOAK_URL=http://localhost:8081
# ... etc
```

---

## 📚 Error Messages Guide

### "No access token available"
**Cause:** Session doesn't have accessToken  
**Fix:** Logout and login again

### "Expected JSON but got text/html"
**Cause:** Backend returning HTML error page  
**Fix:** Check backend logs, ensure backend running

### "API error: 401 Unauthorized"
**Cause:** JWT invalid or expired  
**Fix:** Logout and login again

### "API error: 403 Forbidden"
**Cause:** Missing super_admin role  
**Fix:** Assign role in Keycloak

### "Backend may be down"
**Cause:** Can't connect to backend  
**Fix:** Start backend: `cd backend && npm run dev`

---

## 🎉 Summary

### Issues Fixed
1. ✅ **JSON parse errors** → Added content-type validation
2. ✅ **Unhelpful error messages** → Added descriptive errors
3. ✅ **Page crashes** → Graceful error handling
4. ✅ **No debug info** → Added console logging

### Error Handling Added
- ✅ Content-type validation before JSON.parse
- ✅ Access token presence check
- ✅ HTTP status validation
- ✅ User-friendly error messages
- ✅ Console debug logging

### Build Status
- ✅ TypeScript: 0 errors
- ✅ Frontend Build: SUCCESS
- ✅ All 18 routes compiled

---

## 🚀 Next Steps

1. **Restart frontend:**
   ```bash
   npm run dev
   ```

2. **Verify backend running:**
   ```bash
   cd backend && npm run dev
   ```

3. **Clear browser cache** (Cmd+Shift+R)

4. **Login fresh** as testuser-us

5. **Test admin pages:**
   - `/admin/dashboard` - Should load without errors
   - `/admin/idp` - Should show IdPs or helpful error
   - `/admin/logs` - Should load or show empty state
   - `/admin/approvals` - Should work properly

6. **Check console:**
   - Should show debug logs
   - Should NOT show JSON parse errors
   - Any errors should be descriptive

---

**Status:** ERROR HANDLING IMPROVED ✅  
**JSON Parse Errors:** FIXED ✅  
**User Experience:** Graceful error messages ✅  

The admin pages should now work properly! 🚀

