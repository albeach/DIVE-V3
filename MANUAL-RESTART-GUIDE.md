# 🔄 Manual Restart Guide (Your Normal Workflow)

**Date**: October 21, 2025  
**Status**: All processes killed, ready to restart

---

## ✅ Services Stopped

All Node.js processes have been killed:
- ✅ Backend (PID 50955) - STOPPED
- ✅ Frontend (PID 50980) - STOPPED
- ✅ No duplicate processes running

---

## 🚀 Restart in Your Normal Terminals

### Terminal 1: Backend

```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/backend
npm run dev
```

**Wait for**:
```
[DIVE] Backend API starting...
[DIVE] Keycloak Configuration: { realm: 'dive-v3-broker', ... }
Server listening on port 4000
```

**Key Log to Watch For** (confirms dual-issuer code loaded):
```
[DIVE] Getting signing key for token { realm: 'dive-v3-broker' }
```

---

### Terminal 2: Frontend

```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/frontend
npm run dev
```

**Wait for**:
```
▲ Next.js 15.x.x
- Local:        http://localhost:3000
- ready in X.Xs
```

**Important**: Next.js will **rebuild** the navigation.tsx file with the new pseudonym code.

---

## 🧪 Verification After Restart

### Step 1: Clear Browser State

**CRITICAL**: You must clear your browser session to get a new token:

1. Open http://localhost:3000
2. If logged in, click "Sign Out"
3. Open DevTools (F12)
4. Go to: **Application > Storage > Clear site data**
5. Click "Clear site data" button
6. Close DevTools
7. Refresh page (Cmd+R or Ctrl+R)

### Step 2: Login Fresh

1. Click "Login"
2. Authenticate (any IdP)
3. You'll be redirected to dashboard

### Step 3: Check Navigation Bar

**Expected**:
```
🌊  Azure Whale  [SECRET]  🇺🇸
```

**NOT**:
```
john.doe  [SECRET]  🇺🇸
```

If you still see email, the frontend didn't rebuild. Try:
```bash
# Force rebuild
cd frontend
rm -rf .next
npm run dev
```

### Step 4: Check Session Details

**Expand "Session Details (Development Only)"**

**Expected**:
```json
{
  "user": {
    "uniqueID": "550e8400...",
    "name": "*** REDACTED (PII) ***",
    "email": "*** REDACTED (PII) ***",
    "clearance": "SECRET",
    ...
  }
}
```

### Step 5: Test Document Access

1. Go to "Browse Documents"
2. Click on any document
3. Should load successfully

**If you see "Invalid JWT"**:
- Check backend terminal for errors
- Look for "JWT verification failed"
- Share the error with me

---

## 🐛 If Navigation Still Shows Email

The frontend didn't rebuild the navigation.tsx file. Force it:

```bash
# Terminal 2 (stop frontend with Ctrl+C)
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/frontend

# Delete build cache
rm -rf .next

# Rebuild
npm run dev
```

Then hard refresh browser: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)

---

## 🐛 If Documents Show "Invalid JWT"

Check backend terminal for errors. You should see:

**GOOD** (dual-issuer working):
```
[DIVE] Getting signing key for token { realm: 'dive-v3-broker', kid: '...' }
[DIVE] JWT verification successful
```

**BAD** (dual-issuer not working):
```
[DIVE] JWT verification failed { error: 'invalid issuer' }
```

If you see "invalid issuer":
1. Share the backend error log
2. Tell me which realm your token is from (check jwt.io)

---

## 📊 What Changed (Code Already Fixed)

### Frontend (3 files modified):
1. ✅ `navigation.tsx` - Shows pseudonym instead of email
2. ✅ `secure-logout-button.tsx` - Uses broker realm for logout
3. ✅ `dashboard/page.tsx` - Redacts PII in session details

### Backend (1 file - already modified):
1. ✅ `authz.middleware.ts` - Dual-issuer JWT validation

### All Changes:
- ✅ PII minimization (ocean pseudonyms)
- ✅ Multi-realm logout support
- ✅ Session details redaction
- ✅ Dual-issuer JWT validation (accepts both realms)

---

## ✅ Success Indicators

After restart and fresh login:

- [x] Navigation shows "Azure Whale" (or similar ocean pseudonym)
- [x] Avatar shows 🌊 emoji
- [x] Sign Out button works
- [x] Session Details shows "*** REDACTED (PII) ***"
- [x] Documents load without "Invalid JWT" errors

---

## 📞 If Still Having Issues

**Share with me**:

1. **Backend logs** (from Terminal 1):
   - Copy/paste any errors about JWT verification
   
2. **Frontend build output** (from Terminal 2):
   - Did it rebuild navigation.tsx?
   - Any errors during build?

3. **Browser console** (F12 > Console):
   - Any errors when clicking on documents?

4. **Token issuer** (optional):
   - Login to app
   - F12 > Application > Cookies
   - Copy "authjs.session-token" value
   - Decode at jwt.io
   - Tell me the "iss" claim value

---

**END OF GUIDE**

**Next**: Restart backend (Terminal 1), restart frontend (Terminal 2), clear browser, login fresh.


