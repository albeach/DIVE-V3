# Admin Pages Troubleshooting Guide

**Issue:** Console errors when accessing /admin pages  
**Status:** 🔍 DIAGNOSING

---

## 🔍 Quick Diagnostic Steps

### Step 1: Check What Error Message You're Seeing

The stack trace shows `console.error` was called, but **what is the actual error message?**

**Look in the browser console for the FULL error text above the stack trace:**

It should say something like:
- `"fetchIdPs error: No access token available. Please refresh the page."`
- `"fetchIdPs error: Expected JSON but got text/html..."`
- `"fetchIdPs error: API error: 401 Unauthorized"`
- `"fetchIdPs error: API error: 403 Forbidden"`

**Please copy the EXACT error message text.**

---

### Step 2: Check Frontend Console for Environment Variables

**In browser console, type:**
```javascript
console.log('BACKEND_URL:', process.env.NEXT_PUBLIC_BACKEND_URL);
console.log('Session:', session);
console.log('Access Token:', session?.accessToken ? 'Present' : 'Missing');
console.log('Roles:', session?.user?.roles);
```

**Expected output:**
```
BACKEND_URL: "http://localhost:4000"  ✅
Session: { user: {...}, accessToken: "eyJ..." }  ✅
Access Token: "Present"  ✅
Roles: ["user", "super_admin"]  ✅
```

---

### Step 3: Navigate to Debug Page

```
http://localhost:3000/admin/debug
```

This page will show you:
- ✅ or ❌ Access Token status
- ✅ or ❌ Super Admin role
- Test button to check backend API

**Screenshot or copy what it shows.**

---

### Step 4: Test Backend Directly

**In terminal:**
```bash
# Get your JWT token from browser console:
# console.log(session.accessToken)
# Copy the token, then:

TOKEN="paste_your_token_here"

curl -i -H "Authorization: Bearer $TOKEN" \
  http://localhost:4000/api/admin/idps
```

**Expected:**
```
HTTP/1.1 200 OK
Content-Type: application/json

{"success":true,"data":{"idps":[...]}}
```

**If you get 401/403:**
```
{"error":"Unauthorized","message":"Missing super_admin role"}
```

---

## 🔧 Common Issues & Solutions

### Issue A: "No access token available"
**Cause:** Session doesn't have accessToken  
**Fix:**
1. Logout completely
2. Close all browser tabs
3. Clear browser cache
4. Login fresh
5. Check `/admin/debug` shows token ✅

### Issue B: "Expected JSON but got text/html"
**Cause:** NEXT_PUBLIC_BACKEND_URL not loaded  
**Fix:**
1. Verify `frontend/.env.local` has: `NEXT_PUBLIC_BACKEND_URL=http://localhost:4000`
2. **RESTART frontend dev server** (Ctrl+C, npm run dev)
3. Hard refresh browser (Cmd+Shift+R)

### Issue C: "API error: 401 Unauthorized"
**Cause:** Invalid or expired JWT  
**Fix:**
1. Logout and login again
2. Check Keycloak is running: `http://localhost:8081`

### Issue D: "API error: 403 Forbidden"
**Cause:** Missing super_admin role  
**Fix:**
1. Check Keycloak: Users → testuser-us → Role Mappings
2. Verify "super_admin" is assigned
3. Logout and login again (to get new token with role)

---

## 📊 Verification Matrix

| Check | Command | Expected | Status |
|-------|---------|----------|--------|
| Backend running | `curl http://localhost:4000/health` | `{"status":"healthy"}` | ? |
| Frontend running | Open `http://localhost:3000` | Page loads | ? |
| PostgreSQL running | `docker-compose ps \| grep postgres` | Up (healthy) | ✅ |
| MongoDB running | `docker-compose ps \| grep mongodb` | Up | ✅ |
| Keycloak running | `curl http://localhost:8081` | HTML | ? |
| Env var loaded | Console: `process.env.NEXT_PUBLIC_BACKEND_URL` | `"http://localhost:4000"` | ? |
| Session has token | Console: `session.accessToken` | Long JWT string | ? |
| User has role | Console: `session.user.roles` | `["user", "super_admin"]` | ? |

---

## 🎯 Next Steps

1. **Navigate to:** `http://localhost:3000/admin/debug`

2. **Look at the page and tell me:**
   - Does it show "Access Token: ✅ Available" or "❌ Missing"?
   - Does it show "✅ Super Admin" or "❌ Not Super Admin"?
   - What happens when you click "Test Backend" button?

3. **Check browser console and tell me:**
   - The EXACT error message (full text)
   - What `process.env.NEXT_PUBLIC_BACKEND_URL` shows
   - Whether `session.accessToken` is present

This will help me pinpoint the exact issue! 🔍

---

**Current Status:** Backend ✅ Running | Frontend ⏳ Needs verification  
**Debug Page:** http://localhost:3000/admin/debug 🔍
