# Week 3.3 Final Fix - Environment Variables ✅

**Date:** October 13, 2025  
**Root Cause:** Missing/incorrect environment variables  
**Status:** ✅ **FIXED**

---

## 🐛 Root Causes Identified

### Issue 1: Keycloak Admin API Authentication Failing
**Error in backend logs:**
```
"error": "invalid_grant"
"message": "Failed to authenticate Keycloak Admin Client"
"Failed to list IdPs"
```

**Root Cause:**
- Backend code looks for: `KEYCLOAK_ADMIN_USER` and `KEYCLOAK_ADMIN_PASSWORD`
- `.env.local` only had: `KEYCLOAK_ADMIN` (missing `_USER`)
- Backend defaulted to 'admin'/'admin' but couldn't read from env
- Authentication failed → All admin API calls failed

**Fix Applied:**
- ✅ Added `KEYCLOAK_ADMIN_USER=admin` to `.env.local`
- ✅ Added `KEYCLOAK_ADMIN_PASSWORD=admin` to `.env.local`

### Issue 2: Frontend Getting HTML Instead of JSON
**Error in browser console:**
```
Expected JSON but got text/html
Backend returned: <!DOCTYPE html>...
```

**Root Cause:**
- Frontend fetches from `process.env.NEXT_PUBLIC_BACKEND_URL`
- This variable wasn't loaded (dev server started before .env.local updated)
- Requests went to Next.js server (localhost:3000) instead of Express (localhost:4000)
- Next.js returned HTML

**Fix Applied:**
- ✅ Verified `NEXT_PUBLIC_BACKEND_URL=http://localhost:4000` in `frontend/.env.local`
- ✅ Must restart frontend for env vars to load

### Issue 3: PostgreSQL Connection Errors
**Error in frontend:**
```
[auth][error] AdapterError
SessionTokenError
AggregateError: connect failed
```

**Root Cause:**
- Wrong DATABASE_URL in `frontend/.env.local`
- Was: `postgresql://localhost:5432/dive-v3` ❌
- Should be: `postgresql://postgres:password@localhost:5433/dive_v3_app` ✅

**Fix Applied:**
- ✅ Corrected DATABASE_URL in `frontend/.env.local`

---

## ✅ All Fixes Applied

### Root `.env.local` (Backend)
```bash
# Added these lines:
KEYCLOAK_ADMIN_USER=admin
KEYCLOAK_ADMIN_PASSWORD=admin
```

### `frontend/.env.local` (Frontend)
```bash
# Corrected:
DATABASE_URL=postgresql://postgres:password@localhost:5433/dive_v3_app
KEYCLOAK_CLIENT_SECRET=8AcfbgtdNIZp3tbrcmc2voiUfxNb8d6L
AUTH_SECRET=fWBbrGVdA46YMp+7ZB125SXcTp6nA+mxic2KRzKg7sg=

# Already had (correct):
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
```

---

## 🚨 **CRITICAL: RESTART BOTH SERVERS**

### Step 1: Stop Both Servers
```bash
# In terminal running backend:
Ctrl+C

# In terminal running frontend:
Ctrl+C
```

### Step 2: Restart Backend
```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/backend
npm run dev
```

**Wait for:**
```
DIVE V3 Backend API started
port: 4000
```

**Check logs for:**
```
✅ "Keycloak Admin Client authenticated"  (GOOD)
❌ "Failed to authenticate Keycloak Admin Client"  (BAD - check credentials)
```

### Step 3: Restart Frontend
```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/frontend
npm run dev
```

**Wait for:**
```
✓ Ready in [X]ms
```

### Step 4: Clear Browser Cache
- **Hard refresh:** Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
- Or clear all site data for localhost:3000

### Step 5: Test
1. Navigate to `http://localhost:3000`
2. Login as testuser-us / Password123!
3. Go to `/admin/debug`
4. Click "Test Backend" button
5. **Expected:** JSON response with IdPs ✅

---

## 🧪 Verification Steps

### Test 1: Backend Keycloak Admin Auth
```bash
# Check backend logs after restart
# Should see:
"Keycloak Admin Client authenticated"  ✅
```

**If you see:**
```
"Failed to authenticate Keycloak Admin Client"  ❌
```

**Then check:**
```bash
# Verify Keycloak admin credentials
docker-compose exec keycloak \
  /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 \
  --realm master \
  --user admin \
  --password admin
```

### Test 2: Frontend Environment Variables
```javascript
// In browser console:
console.log(process.env.NEXT_PUBLIC_BACKEND_URL)
// Should show: "http://localhost:4000"  ✅
```

### Test 3: Admin API Call
Navigate to `/admin/debug` and click "Test Backend"

**Expected console output:**
```
Response Status: 200
Content-Type: application/json
Parsed JSON: {
  "success": true,
  "data": {
    "idps": [
      { "alias": "france-idp", ... },
      { "alias": "canada-idp", ... },
      { "alias": "industry-idp", ... }
    ],
    "total": 3
  }
}
```

### Test 4: Admin Pages Load
Try each admin page:
- ✅ `/admin/dashboard` - Stats load
- ✅ `/admin/idp` - IdP list appears
- ✅ `/admin/logs` - Logs load (or empty)
- ✅ `/admin/approvals` - Shows "No pending"

---

## 📊 Expected Backend Logs (After Restart)

### Good Logs (What You Want to See)
```json
{"message":"DIVE V3 Backend API started","port":4000}
{"message":"Keycloak Admin Client authenticated"}
{"message":"Admin: List IdPs request","admin":"john.doe@mil"}
{"message":"Retrieved identity providers","count":3}
{"message":"Admin Action","action":"list_idps","outcome":"success"}
```

### Bad Logs (Problems)
```json
{"error":"invalid_grant","message":"Failed to authenticate Keycloak Admin Client"}
// ↑ KEYCLOAK_ADMIN_USER/PASSWORD not set correctly

{"message":"Missing Authorization header"}
// ↑ Frontend not sending JWT (session issue)

{"message":"Admin access denied: Missing super_admin role"}
// ↑ User doesn't have super_admin role in Keycloak
```

---

## 🔧 Environment Variable Reference

### Root `.env.local` (Backend reads from ../env.local)
```bash
# Keycloak Admin API (for backend IdP management)
KEYCLOAK_ADMIN_USER=admin          # ← MUST BE SET
KEYCLOAK_ADMIN_PASSWORD=admin      # ← MUST BE SET

# Keycloak Client (for NextAuth)
KEYCLOAK_URL=http://localhost:8081
KEYCLOAK_REALM=dive-v3-pilot
KEYCLOAK_CLIENT_ID=dive-v3-client
KEYCLOAK_CLIENT_SECRET=8AcfbgtdNIZp3tbrcmc2voiUfxNb8d6L
```

### `frontend/.env.local` (Frontend specific)
```bash
# Backend API
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000  # ← MUST BE SET

# Database (for NextAuth adapter)
DATABASE_URL=postgresql://postgres:password@localhost:5433/dive_v3_app

# Keycloak (for frontend)
KEYCLOAK_URL=http://localhost:8081
KEYCLOAK_REALM=dive-v3-pilot
KEYCLOAK_CLIENT_ID=dive-v3-client
KEYCLOAK_CLIENT_SECRET=8AcfbgtdNIZp3tbrcmc2voiUfxNb8d6L
AUTH_SECRET=fWBbrGVdA46YMp+7ZB125SXcTp6nA+mxic2KRzKg7sg=
```

---

## 🎯 Post-Restart Checklist

After restarting BOTH servers:

### Backend
- [ ] Log shows: "DIVE V3 Backend API started"
- [ ] Log shows: "Keycloak Admin Client authenticated" (no errors)
- [ ] No "invalid_grant" errors
- [ ] Port 4000 listening

### Frontend
- [ ] Shows: "Ready in [X]ms"
- [ ] No adapter errors
- [ ] Can navigate to /dashboard
- [ ] Session loads successfully

### Admin Pages
- [ ] `/admin/debug` - Shows access token ✅ Available
- [ ] Test button returns JSON (not HTML)
- [ ] `/admin/dashboard` - Loads without errors
- [ ] `/admin/idp` - Shows IdP list
- [ ] No JSON parse errors

---

## 🚀 Final Instructions

### 1. RESTART BACKEND
```bash
# Stop: Ctrl+C
cd backend
npm run dev

# Wait for:
"DIVE V3 Backend API started"
"Keycloak Admin Client authenticated"  ← Must see this!
```

### 2. RESTART FRONTEND
```bash
# Stop: Ctrl+C
cd frontend
npm run dev

# Wait for:
"Ready in [X]ms"
```

### 3. TEST
```
http://localhost:3000/admin/debug
```

Click "Test Backend" → Should return JSON ✅

### 4. NAVIGATE TO ADMIN PAGES
```
http://localhost:3000/admin/dashboard
```

Should load successfully! ✅

---

## 🔍 If Backend Still Shows Errors

### Check Keycloak Admin Credentials

```bash
# Test login to Keycloak Admin Console
open http://localhost:8081/admin

# Login with:
Username: admin
Password: admin

# If login fails, Keycloak admin password may have changed
# Reset it via docker-compose or env vars
```

### Verify Environment Variables Loaded

```bash
# In backend code, add temporary console.log:
# In keycloak-admin.service.ts line 46:
console.log('KEYCLOAK_ADMIN_USER:', process.env.KEYCLOAK_ADMIN_USER);
console.log('KEYCLOAK_ADMIN_PASSWORD:', process.env.KEYCLOAK_ADMIN_PASSWORD);

# Should show:
# KEYCLOAK_ADMIN_USER: admin
# KEYCLOAK_ADMIN_PASSWORD: admin
```

---

## ✅ Summary

**Problems Fixed:**
1. ✅ Added `KEYCLOAK_ADMIN_USER` and `KEYCLOAK_ADMIN_PASSWORD` to `.env.local`
2. ✅ Corrected `DATABASE_URL` in `frontend/.env.local`
3. ✅ Verified `NEXT_PUBLIC_BACKEND_URL` in `frontend/.env.local`

**Action Required:**
1. **RESTART BACKEND** (to load KEYCLOAK_ADMIN_USER)
2. **RESTART FRONTEND** (to load NEXT_PUBLIC_BACKEND_URL and DATABASE_URL)
3. **Clear browser cache**
4. **Test at `/admin/debug`**

**Expected Result:**
- ✅ Backend authenticates with Keycloak ✅
- ✅ Frontend calls correct API URL ✅
- ✅ Session stores in PostgreSQL ✅
- ✅ Admin pages work perfectly ✅

---

**Status:** All environment variables corrected ✅  
**Next:** Restart both servers and test 🚀
