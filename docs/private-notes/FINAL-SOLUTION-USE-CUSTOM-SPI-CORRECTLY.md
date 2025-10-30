# ✅ FINAL SOLUTION: Use Custom SPI Correctly

**Date**: October 27, 2025  
**Status**: **RECOMMENDED APPROACH**

---

## 🎯 Key Realization

After reviewing the Keycloak documentation and our architecture:

**For Direct Grant Flow (Custom Login Pages):**
- ✅ **Custom Authenticator SPI** is the **CORRECT** solution
- ❌ **Required Action SPI** is designed for **browser-based flows**, not Direct Grant

**Why?**
- Direct Grant (Resource Owner Password Credentials) is a **headless** flow
- Required Actions need browser redirects and session management
- Custom Authenticators can handle credentials directly in the authentication chain

---

## ✅ What We Already Have (CORRECT!)

### Custom SPI: `DirectGrantOTPAuthenticator.java`

**This SPI is ALREADY CORRECT!** It:

✅ Generates OTP secrets using `HmacOTP.generateSecret(20)`  
✅ Validates OTP codes using `TimeBasedOTP`  
✅ Creates credentials via `OTPCredentialProvider`  
✅ Uses `user.credentialManager().createStoredCredential()`  
✅ Sets ACR/AMR session notes for AAL2 compliance  
✅ Returns QR data in Direct Grant response  

**This is the PROPER, production-ready solution for Direct Grant flows!**

---

## ❌ What Went Wrong

### The Real Problem

The custom SPI debug logs showed:
```
[DIVE SPI] Form Data - OTP Code present: false
[DIVE SPI] Form Data - OTP Secret present: false
[DIVE SPI] Form Data - Setup Mode: null
[DIVE SPI] All form parameters: [username, password, grant_type, client_id, scope]
```

**Root Cause**: The frontend/backend weren't sending the parameters to Keycloak's token endpoint!

### The Attempted Fixes (Wrong Approach)

1. ❌ **Hybrid Approach** - Tried to bypass Keycloak with shell commands (INSECURE)
2. ❌ **Required Action SPI** - Wrong pattern for Direct Grant flow

---

## ✅ CORRECT SOLUTION: Fix Parameter Passing

### The Issue

The frontend was calling `/api/auth/custom-login` → backend → Keycloak token endpoint.

But during OTP enrollment, the parameters (`totp`, `totp_secret`, `totp_setup`) weren't being passed to Keycloak!

### The Fix

**Backend must pass ALL form parameters to Keycloak**, not just username/password:

```typescript
// backend/src/controllers/custom-login.controller.ts

const params = new URLSearchParams();
params.append('grant_type', 'password');
params.append('client_id', clientId);
if (clientSecret) params.append('client_secret', clientSecret);
params.append('username', username);
params.append('password', password);
params.append('scope', 'openid profile email');

// ============================================
// KEY FIX: Pass OTP-related parameters to Keycloak
// ============================================
if (otp) {
    params.append('totp', otp);  // Pass OTP code
}
if (totp_secret) {
    params.append('totp_secret', totp_secret);  // Pass secret (enrollment)
}
if (totp_setup) {
    params.append('totp_setup', totp_setup);  // Pass setup flag
}

const response = await axios.post(tokenUrl, params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
});
```

**That's it!** The custom SPI will now receive the parameters and handle enrollment correctly!

---

## 📋 Implementation Steps

### Step 1: Update Backend Controller

**File**: `backend/src/controllers/custom-login.controller.ts`

**Find the section** where we build the `params` for Keycloak authentication (around line 400-420).

**Add these lines** after the standard parameters:

```typescript
        // Pass OTP-related parameters to Keycloak's Direct Grant authenticator
        // These will be picked up by our custom SPI (DirectGrantOTPAuthenticator)
        if (otp) {
            params.append('totp', otp);
        }
        if (totp_secret) {
            params.append('totp_secret', totp_secret);
        }
        if (totp_setup) {
            params.append('totp_setup', totp_setup);
        }
```

### Step 2: Remove Hybrid Code

**Remove**:
- Lines 231-393: Entire hybrid OTP enrollment block
- Lines 97-162: `getKeycloakAdminToken()` and `createOTPCredential()` functions
- Line 17: `import * as speakeasy from 'speakeasy';`

**Uninstall**:
```bash
cd backend
npm uninstall speakeasy
```

### Step 3: Test!

1. **Restart backend**:
```bash
docker-compose restart backend
```

2. **Test OTP enrollment**:
   - Login with `admin-dive` / `DiveAdmin2025!`
   - Should see QR code (from custom SPI)
   - Submit OTP code
   - Custom SPI validates and creates credential
   - Returns AAL2 token with ACR/AMR claims

---

## 🔍 Why This Works

### The Flow

```
1. Frontend → Backend
   POST /api/auth/custom-login
   {
     username: "admin-dive",
     password: "DiveAdmin2025!",
     otp: "123456",
     totp_secret: "ABC...XYZ",
     totp_setup: "true"
   }
   ↓
2. Backend → Keycloak Token Endpoint
   POST /realms/{realm}/protocol/openid-connect/token
   grant_type=password
   username=admin-dive
   password=DiveAdmin2025!
   totp=123456
   totp_secret=ABC...XYZ
   totp_setup=true
   ↓
3. Keycloak Direct Grant Flow
   - Executes Password authenticator ✅
   - Executes Custom OTP authenticator (DirectGrantOTPAuthenticator) ✅
   ↓
4. Custom SPI (DirectGrantOTPAuthenticator)
   - Reads form parameters: totp, totp_secret, totp_setup ✅
   - Validates OTP with TimeBasedOTP ✅
   - Creates credential with OTPCredentialProvider ✅
   - Sets ACR/AMR session notes ✅
   - Calls context.success() ✅
   ↓
5. Keycloak
   - Generates access token
   - Includes ACR="1", AMR=["pwd","otp"]
   - Returns token to backend
   ↓
6. Backend → Frontend
   {
     success: true,
     data: {
       accessToken: "...",
       acr: "1",
       amr: ["pwd", "otp"]
     }
   }
```

---

## ✅ This is The Correct Solution Because:

1. **✅ Uses Keycloak's Authentication SPI** - Proper pattern for Direct Grant
2. **✅ No external dependencies** - Pure Keycloak internal APIs
3. **✅ Transactional** - Credential creation is atomic
4. **✅ Secure** - Uses `CredentialProvider` SPI
5. **✅ Auditable** - All actions logged through Keycloak events
6. **✅ Production-ready** - Used by enterprises for custom login pages
7. **✅ Already implemented!** - Just needs parameter passing fixed!

---

## 🎯 Comparison

| Solution | Correct For | Status |
|----------|------------|--------|
| Custom Authenticator SPI | ✅ Direct Grant (Custom Login) | **RECOMMENDED** |
| Required Action SPI | ✅ Browser Flows (Account Console) | Not for Direct Grant |
| Hybrid (Shell Commands) | ❌ Nothing | Insecure, don't use |

---

## 🚀 Next Steps

1. **Update backend** - Add parameter passing (3 lines of code!)
2. **Remove hybrid code** - Clean up unnecessary complexity
3. **Test** - Should work immediately with custom SPI
4. **Enjoy** - Production-ready OTP enrollment! 🎉

---

**This is the simplest, most correct solution!**

The custom SPI we built is exactly what's needed. We just need to pass the parameters to it correctly!

