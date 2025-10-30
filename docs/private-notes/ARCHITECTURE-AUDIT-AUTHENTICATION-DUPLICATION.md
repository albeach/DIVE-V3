# Authentication Architecture Audit - Duplication Analysis

**Date**: October 30, 2025  
**Status**: 🔴 **CRITICAL - MULTIPLE CONFLICTING IMPLEMENTATIONS**

---

## 🚨 Problem Summary

**DIVE V3 has DUPLICATE authentication implementations** causing:
- ❌ Two different OTP setup handlers (conflicting logic)
- ❌ Three separate OTP controller files (1,111 lines of duplicated code)
- ❌ Unclear which code path is actually used
- ❌ MFA enrollment failures due to handler conflicts
- ❌ "No pending OTP setup found" errors
- ❌ 500 Internal Server Errors on finalize-enrollment

---

## 📊 Current State (Duplication Identified)

### OTP Controller Files (3 Files, 1,111 Lines Total)

| File | Lines | Purpose | Status |
|------|-------|---------|--------|
| `backend/src/controllers/otp.controller.ts` | 559 | OTP setup + verify (Phase 5 fixed) | ✅ **ACTIVE** |
| `backend/src/controllers/otp-setup.controller.ts` | 341 | OTP setup (Phase 4.2 original) | ⚠️ **DUPLICATE** |
| `backend/src/controllers/otp-enrollment.controller.ts` | 211 | Finalize enrollment (Option B) | ✅ **ACTIVE** |

### Route Mounting (Causing Conflicts)

```typescript
// backend/src/server.ts (lines 95-96)
app.use('/api/auth/otp', otpRoutes);  // ← Mounted FIRST (wins)
app.use('/api/auth', authRoutes);      // ← Mounted SECOND (ignored)
```

**Result**: When frontend calls `/api/auth/otp/setup`:
1. ✅ **Routes to**: `otpRoutes` → `otpSetupHandler` (otp.controller.ts)
2. ❌ **Never reaches**: `authRoutes` → `initiateOTPSetup` (otp-setup.controller.ts)

### Endpoint Analysis

| Endpoint | Handler 1 (otp.controller.ts) | Handler 2 (otp-setup.controller.ts) | Which Wins? |
|----------|-------------------------------|--------------------------------------|-------------|
| `POST /api/auth/otp/setup` | `otpSetupHandler` (Phase 5 fixed) | `initiateOTPSetup` (unused) | **Handler 1** ✅ |
| `POST /api/auth/otp/verify` | `otpVerifyHandler` | `verifyAndEnableOTP` (unused) | **Handler 1** ✅ |
| `POST /api/auth/otp/finalize-enrollment` | (none) | (none - in otp-enrollment.controller.ts) | **OTPEnrollmentController** ✅ |

**Conclusion**: `otp-setup.controller.ts` is **DEAD CODE** (never executed due to route mounting order)

---

## 🔍 Authentication Flows in Keycloak

### Current Flows (From Terraform)

| Flow Name | Realm | Purpose | Status |
|-----------|-------|---------|--------|
| **Direct Grant with Conditional MFA** | dive-v3-broker | Custom login page for admin-dive | ✅ ENABLED |
| **Classified Access Browser Flow** | All nation realms | Browser-based auth with AAL2 enforcement | ✅ ENABLED |
| **Built-in Browser Flow** | All realms | Standard Keycloak browser auth | 🔴 NOT USED |

### Flow Logic

**dive-v3-broker Realm** (admin-dive):
- Uses: **Direct Grant with Conditional MFA**
- Custom SPI checks clearance
- If TOP_SECRET → Requires OTP setup first
- Returns: "Account is not fully set up"

**Nation Realms** (usa, esp, fra, etc.):
- Uses: **Classified Access Browser Flow**  
- AAL2 enforcement: MFA for CONFIDENTIAL/SECRET/TOP_SECRET
- Browser-based, not Direct Grant

### Why Two Flows?

**Direct Grant** (dive-v3-broker):
- Custom login page (username/password in frontend)
- Used for broker realm (admin-dive, etc.)
- Stateless, API-based

**Browser Flow** (nation realms):
- Standard Keycloak browser redirect
- Used for national users
- Session-based, cookie-based

**Verdict**: ✅ **BOTH NEEDED** (different realms, different use cases)

---

## 🐛 Root Cause of Current Failures

### Issue #1: "Page refreshed and generated new QR code"

**Cause**: Form submission triggers page reload, clearing state

**Location**: `frontend/src/app/login/[idpAlias]/page.tsx`

**Fix Needed**: Prevent default form submission or use controlled state

### Issue #2: "No pending OTP setup found"

**Cause**: Secret stored with userId from `otp.controller.ts`, but finalize-enrollment uses userId from keycloak-admin lookup

**Potential Mismatch**:
```
Setup stores: otp:pending:050aac8d-da0a-4eac-a95e-707e87554c15
Finalize looks for: otp:pending:d665c142-1822-41b6-992a-76975b1facd5
```

**Root Cause**: TWO DIFFERENT user IDs for admin-dive!

### Issue #3: alice.general 500 Error

**Error**: "Internal server error during OTP enrollment"

**Likely Cause**: Similar userId mismatch or Keycloak Admin API error

---

## 🎯 Recommended Architecture (Single Source of Truth)

### OTP Enrollment Flow (CORRECT)

**Files to KEEP**:
1. ✅ `backend/src/controllers/otp.controller.ts` - Setup + verify (Phase 5 fixed)
2. ✅ `backend/src/controllers/otp-enrollment.controller.ts` - Finalize via Admin API
3. ✅ `backend/src/routes/otp.routes.ts` - Route definitions

**Files to REMOVE**:
1. ❌ `backend/src/controllers/otp-setup.controller.ts` - DEAD CODE (never executed)

### Flow Sequence (Single Path)

```
1. Frontend → POST /api/auth/custom-login
   ↓
2. Backend detects "Account is not fully set up"
   ↓
3. Backend returns: {mfaSetupRequired: true}
   ↓
4. Frontend → POST /api/auth/otp/setup (otp.controller.ts:otpSetupHandler)
   ↓
5. Backend:
   - Verifies user exists (Admin API, no Direct Grant)
   - Generates secret
   - Stores in Redis: otp:pending:{userId}
   - Returns: {secret, qrCodeUrl, userId}
   ↓
6. Frontend shows QR code modal
   ↓
7. User scans QR, enters TOTP code
   ↓
8. Frontend → POST /api/auth/otp/finalize-enrollment
   ↓
9. Backend:
   - Gets userId from Keycloak (same realm!)
   - Retrieves secret from Redis: otp:pending:{userId}
   - Verifies TOTP code
   - Creates OTP credential via Admin API
   - Removes secret from Redis
   ↓
10. User can now login with username + password + OTP
```

---

## 🔧 Fixes Required

### Fix #1: Remove Duplicate Code

Delete `backend/src/controllers/otp-setup.controller.ts` (dead code)

### Fix #2: Ensure Consistent userId

Both setup and finalize must use **same realm** and **same lookup method**

**Problem**: 
- Setup uses: `otpService.generateOTPSecret()` which gets userId from realm
- Finalize uses: `keycloakAdminService.getUserByUsername()` which might use different realm

**Fix**: Use consistent realm mapping in both

### Fix #3: Fix Frontend Form Submission

Prevent page reload when submitting MFA code

### Fix #4: Fix .next Permissions

Run frontend as node user, not root

---

## 🔨 Implementation Plan

1. ✅ Audit complete (this document)
2. Fix userId consistency
3. Remove duplicate otp-setup.controller.ts
4. Fix frontend form handling
5. Fix Docker permissions
6. Test complete flow end-to-end
7. Document single source of truth

---

**Status**: AUDIT COMPLETE - Ready for cleanup

