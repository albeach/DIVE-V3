# OTP Enrollment Troubleshooting - "Missing required fields" Error

**Issue:** User receives "Missing required fields" error after entering 6-digit OTP code during enrollment.

---

## 🔍 Root Cause Analysis

### Possible Causes

The error occurs when the frontend sends an incomplete payload to `POST /api/auth/otp/verify`. The backend expects **5 required fields**:

1. **`idpAlias`** - Identity provider alias (e.g., `"dive-v3-broker"`)
2. **`username`** - User's username (e.g., `"admin-dive"`)
3. **`secret`** - Base32-encoded TOTP secret (generated during setup)
4. **`otp`** - 6-digit OTP code from authenticator app
5. **`userId`** - Keycloak user ID (UUID)

**Most Likely Culprits:**
- ❌ **`userId` is empty string** - Not set during OTP setup phase
- ❌ **`otpSecret` is empty string** - Not properly stored after setup
- ❌ **`username` is cleared** - Form data reset between setup and verification

---

## 🛠️ Diagnostic Steps

### Step 1: Check Browser Console (Frontend)

1. Open browser Developer Tools (F12)
2. Go to Console tab
3. Look for debug log: **"OTP verification payload"**

**Expected Output:**
```javascript
OTP verification payload: {
  idpAlias: "dive-v3-broker",        // ✅ Should be present
  username: "admin-dive",            // ✅ Should be present
  secret: "[REDACTED]",              // ✅ Should NOT be "MISSING"
  otp: "[REDACTED]",                 // ✅ Should NOT be "MISSING"
  userId: "50242513-9d1c-4842-..."  // ✅ Should NOT be "MISSING" or empty string
}
```

**If you see "MISSING" for any field:**
- That field is the problem!
- The frontend state is not properly initialized

### Step 2: Check Backend Logs

```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3
docker-compose logs -f backend | grep "OTP verification failed"
```

**Expected Log:**
```json
{
  "level": "warn",
  "message": "OTP verification failed - missing fields",
  "missingFields": ["userId"],  // ← This shows WHICH field is missing
  "receivedFields": {
    "idpAlias": "dive-v3-broker",
    "username": "admin-dive",
    "secret": "[REDACTED]",
    "otp": "[REDACTED]",
    "userId": "MISSING"           // ← Problem identified!
  }
}
```

### Step 3: Check Network Request (Browser DevTools)

1. Open Developer Tools (F12)
2. Go to **Network** tab
3. Filter by "verify"
4. Look for `POST /api/auth/otp/verify`
5. Click on the request → **Payload** tab

**Expected Payload:**
```json
{
  "idpAlias": "dive-v3-broker",
  "username": "admin-dive",
  "secret": "JBSWY3DPEHPK3PXP",
  "otp": "123456",
  "userId": "50242513-9d1c-4842-909d-fa1c0800c3a1"
}
```

**If any field is missing or empty string `""`:**
- That's the root cause!

---

## 🔧 Solutions Based on Root Cause

### Solution 1: `userId` is Missing

**Root Cause:** `userId` state variable is not being set during OTP setup.

**Check Frontend Code:**
```typescript
// In initiateOTPSetup function - around line 435
setUserId(result.data.userId);  // ← Make sure this line exists
```

**Verify Setup Response:**
The `/api/auth/otp/setup` response must include `userId`:
```json
{
  "success": true,
  "data": {
    "secret": "JBSWY3DPEHPK3PXP",
    "qrCodeUrl": "otpauth://totp/...",
    "qrCodeDataUrl": "data:image/png;base64,...",
    "userId": "50242513-9d1c-4842-909d-fa1c0800c3a1"  // ← Must be present
  }
}
```

**Fix:** Ensure backend returns `userId` in setup response. Check `backend/src/controllers/otp.controller.ts`:

```typescript
res.status(200).json({
    success: true,
    data: {
        secret: otpData.secret,
        qrCodeUrl: otpData.qrCodeUrl,
        qrCodeDataUrl: otpData.qrCodeDataUrl,
        userId: otpData.userId  // ← Must be included
    },
    message: 'Scan the QR code with your authenticator app and enter the 6-digit code'
});
```

### Solution 2: `otpSecret` is Missing

**Root Cause:** `otpSecret` state variable is not being set during OTP setup.

**Check Frontend Code:**
```typescript
// In initiateOTPSetup function - around line 436
setOtpSecret(result.data.secret);  // ← Make sure this line exists
```

**Verify:** The secret from `/api/auth/otp/setup` should be stored in `otpSecret` state.

### Solution 3: `username` is Missing

**Root Cause:** Form data is being reset or cleared between setup and verification.

**Check:** Ensure `formData.username` is not cleared after setup:
```typescript
// DON'T do this after setup:
setFormData({ username: '', password: '', otp: '' });  // ❌ Clears username

// DO this instead:
setFormData(prev => ({ ...prev, password: '', otp: '' }));  // ✅ Preserves username
```

### Solution 4: State Variables Not Persisting

**Root Cause:** React state is being reset due to component re-render.

**Check:** Ensure `otpSecret`, `userId`, and `qrCodeUrl` are declared with `useState`:
```typescript
const [otpSecret, setOtpSecret] = useState<string>('');
const [userId, setUserId] = useState<string>('');
const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
```

---

## 🚀 Quick Fix Implementation

Based on the most common issue (`userId` missing), here's the fix:

### Backend Fix (Already Applied ✅)

The backend now logs exactly which field is missing:

```typescript
// backend/src/controllers/otp.controller.ts (Line 139-165)
const missingFields: string[] = [];
if (!idpAlias) missingFields.push('idpAlias');
if (!username) missingFields.push('username');
if (!secret) missingFields.push('secret');
if (!otp) missingFields.push('otp');
if (!userId) missingFields.push('userId');

if (missingFields.length > 0) {
    logger.warn('OTP verification failed - missing fields', {
        requestId,
        missingFields,
        receivedFields: { 
            idpAlias: idpAlias || 'MISSING',
            username: username || 'MISSING',
            secret: secret ? '[REDACTED]' : 'MISSING',
            otp: otp ? '[REDACTED]' : 'MISSING',
            userId: userId || 'MISSING'
        }
    });
    
    res.status(400).json({
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`
    });
    return;
}
```

### Frontend Debug Logging (Already Applied ✅)

The frontend now logs the payload before sending:

```typescript
// frontend/src/app/login/[idpAlias]/page.tsx (Line 485-491)
console.log('OTP verification payload:', {
    idpAlias: payload.idpAlias || 'MISSING',
    username: payload.username || 'MISSING',
    secret: payload.secret ? '[REDACTED]' : 'MISSING',
    otp: payload.otp ? '[REDACTED]' : 'MISSING',
    userId: payload.userId || 'MISSING'
});
```

---

## 📊 Testing the Fix

### Test 1: Restart Services
```bash
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3

# Rebuild backend
cd backend && npm run build

# Restart backend (if running in dev mode)
# Ctrl+C and run: npm run dev

# Or restart Docker
docker-compose restart backend
```

### Test 2: Attempt OTP Enrollment Again

1. Navigate to `http://localhost:3000`
2. Click "DIVE V3 Super Administrator"
3. Login: `admin-dive` / `DiveAdmin2025!`
4. **Open Browser Console (F12)** before clicking "Sign In"
5. Enter 6-digit OTP code
6. Click "Verify & Complete Setup"

### Test 3: Check Console Output

**Browser Console (F12 → Console tab):**
```
OTP verification payload: {
  idpAlias: "dive-v3-broker",
  username: "admin-dive",
  secret: "[REDACTED]",
  otp: "[REDACTED]",
  userId: "50242513-9d1c-4842-909d-fa1c0800c3a1"  // ← Should NOT be "MISSING"
}
```

**Backend Logs:**
```bash
docker-compose logs -f backend | tail -20
```

Look for:
- ✅ "OTP code verified successfully"
- ✅ "OTP credential created successfully"
- ❌ "OTP verification failed - missing fields" (should NOT appear)

---

## 🔍 Full Stack Trace

### Frontend Request Flow

1. **User Action:** Clicks "Verify & Complete Setup"
2. **React Handler:** `verifyOTPSetup()` function triggered
3. **State Check:**
   ```typescript
   const payload = {
       idpAlias,              // From useParams()
       username: formData.username,  // From form state
       secret: otpSecret,     // From useState (set during setup)
       otp: formData.otp,     // From form input
       userId                 // From useState (set during setup)
   };
   ```
4. **HTTP Request:**
   ```
   POST http://localhost:4000/api/auth/otp/verify
   Content-Type: application/json
   Body: { idpAlias, username, secret, otp, userId }
   ```

### Backend Request Flow

1. **Express Route:** `/api/auth/otp/verify` → `otpVerifyHandler`
2. **Request Validation:**
   ```typescript
   const { idpAlias, username, secret, otp, userId } = req.body;
   
   // Check each field
   if (!idpAlias) missingFields.push('idpAlias');
   if (!username) missingFields.push('username');
   if (!secret) missingFields.push('secret');
   if (!otp) missingFields.push('otp');
   if (!userId) missingFields.push('userId');
   ```
3. **Error Response (if fields missing):**
   ```json
   {
     "success": false,
     "error": "Missing required fields: userId"  // ← Exact field name
   }
   ```

### Stack Trace Example (Missing userId)

```
[Frontend] verifyOTPSetup() called
  ↓
[Frontend] Prepare payload
  ↓ idpAlias: "dive-v3-broker" ✅
  ↓ username: "admin-dive" ✅
  ↓ secret: "JBSWY3DPEHPK3PXP" ✅
  ↓ otp: "123456" ✅
  ↓ userId: "" ❌ EMPTY STRING!
  ↓
[Frontend] POST /api/auth/otp/verify
  ↓
[Backend] otpVerifyHandler receives request
  ↓
[Backend] Extract: { idpAlias, username, secret, otp, userId }
  ↓ userId = "" (empty string, treated as falsy)
  ↓
[Backend] Validation: !userId → TRUE
  ↓
[Backend] missingFields = ["userId"]
  ↓
[Backend] Response: { success: false, error: "Missing required fields: userId" }
  ↓
[Frontend] Receives error response
  ↓
[Frontend] Display: "Missing required fields: userId"
```

---

## ✅ Expected Success Flow

When all fields are present:

```
[Frontend] Prepare payload with all fields ✅
  ↓
[Frontend] POST /api/auth/otp/verify
  ↓
[Backend] Validate: All fields present ✅
  ↓
[Backend] Call otpService.verifyOTPCode(secret, otp)
  ↓
[Backend] Speakeasy validates OTP ✅
  ↓
[Backend] Call otpService.createOTPCredential(userId, realmName, secret)
  ↓
[Backend] Keycloak Admin API: POST /admin/realms/{realm}/users/{userId}/credentials
  ↓
[Keycloak] OTP credential created ✅
  ↓
[Backend] Response: { success: true, message: "OTP enrollment completed successfully" }
  ↓
[Frontend] Proceed to Step 2: Authenticate with username + password + OTP
  ↓
[Frontend] Call POST /api/auth/custom-login
  ↓
[Backend] Direct Grant authentication with OTP ✅
  ↓
[Keycloak] Returns JWT with acr="1", amr=["pwd","otp"] ✅
  ↓
[Frontend] Create NextAuth session ✅
  ↓
[Frontend] Redirect to dashboard ✅
```

---

## 🎯 Action Items

### For User

1. **Open Browser Console (F12)**
2. **Attempt OTP enrollment again**
3. **Check console log for "OTP verification payload"**
4. **Identify which field shows "MISSING"**
5. **Report back with:**
   - Console log output
   - Backend log output (if accessible)
   - Network request payload (F12 → Network → verify → Payload tab)

### For Developer

1. **Review the diagnostic logs** (console + backend)
2. **Identify the missing field** from improved error message
3. **Apply the appropriate solution** from "Solutions Based on Root Cause" section above
4. **Verify the fix** by checking:
   - Backend returns `userId` in setup response
   - Frontend stores `userId` in state: `setUserId(result.data.userId)`
   - Frontend sends `userId` in verify request

---

## 📚 Related Files

### Frontend
- **`frontend/src/app/login/[idpAlias]/page.tsx`** (Line 460-550)
  - `initiateOTPSetup()` - Line 410-458
  - `verifyOTPSetup()` - Line 460-550

### Backend
- **`backend/src/controllers/otp.controller.ts`**
  - `otpSetupHandler()` - Line 24-125
  - `otpVerifyHandler()` - Line 131-225
- **`backend/src/services/otp.service.ts`**
  - `generateOTPSecret()` - Line 50-89
  - `verifyOTPCode()` - Line 97-145
  - `createOTPCredential()` - Line 154-225

---

## 🚨 Common Mistakes to Avoid

1. **Empty String vs Undefined:** Backend treats empty string `""` as falsy
2. **State Not Persisting:** Ensure `useState` variables are not reset between setup and verify
3. **Form Data Reset:** Don't clear `username` after showing QR code
4. **Missing Backend Response Field:** Ensure setup response includes all required data
5. **Async Race Conditions:** Ensure `setUserId()` completes before user clicks verify

---

## 📞 Support

If issue persists after following this guide:
1. Collect console logs (frontend)
2. Collect backend logs: `docker-compose logs backend | tail -100`
3. Collect network request payload (F12 → Network → verify)
4. Share all three in support request

**Documentation References:**
- `OTP-ENROLLMENT-PRODUCTION-SOLUTION.md` - Complete architecture
- `OTP-MFA-TESTING-CHECKLIST.md` - Testing procedures
- `README.md` - Quick start guide

---

**🔍 With improved logging, the exact missing field will now be identified!**

