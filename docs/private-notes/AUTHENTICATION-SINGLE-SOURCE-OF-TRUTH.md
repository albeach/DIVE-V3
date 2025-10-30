# DIVE V3 Authentication - Single Source of Truth

**Date**: October 30, 2025 (Phase 5 Cleanup)  
**Status**: ✅ **Consolidated - Duplicates Removed**

---

## Overview

This document defines the **authoritative** authentication and MFA enrollment implementation for DIVE V3 after Phase 5 cleanup.

**Problem Solved**: Removed duplicate OTP handlers, consolidated to single code path, fixed 6 bugs in MFA enrollment.

---

## Authentication Flows (Keycloak)

### Flow 1: Direct Grant with Conditional MFA  
**Realm**: `dive-v3-broker` (admin-dive only)  
**Type**: Direct Access Grant (username/password via API)  
**MFA**: Conditional (required for TOP_SECRET clearance)  
**Used By**: Admin users logging into broker realm

### Flow 2: Classified Access Browser Flow
**Realms**: All nation realms (dive-v3-usa, dive-v3-esp, dive-v3-fra, etc.)  
**Type**: Browser-based authentication (standard Keycloak)  
**MFA**: AAL2 enforcement (required for CONFIDENTIAL/SECRET/TOP_SECRET)  
**Used By**: National users (alice.general, carlos.garcia, etc.)

**Why Two Flows?**
- Broker realm: Custom login page (Direct Grant)
- Nation realms: Standard browser redirect (Browser Flow)
- Both needed for different use cases ✅

---

## MFA Enrollment Implementation (Single Path)

### File Structure (After Cleanup)

**✅ ACTIVE FILES** (Single Source of Truth):
| File | Purpose | Lines | Used By |
|------|---------|-------|---------|
| `backend/src/controllers/otp.controller.ts` | OTP setup + verify | 559 | `/api/auth/otp/setup`, `/api/auth/otp/verify` |
| `backend/src/controllers/otp-enrollment.controller.ts` | Finalize enrollment via Admin API | 211 | `/api/auth/otp/finalize-enrollment` |
| `backend/src/routes/otp.routes.ts` | Route definitions | 45 | Mounts all OTP endpoints |
| `backend/src/services/otp.service.ts` | OTP secret generation | 413 | Used by controllers |
| `backend/src/services/otp-redis.service.ts` | Redis session management | 290 | Store/retrieve pending secrets |

**❌ REMOVED FILES** (Dead Code):
| File | Reason | Status |
|------|--------|--------|
| `backend/src/controllers/otp-setup.controller.ts` | Duplicate of otp.controller.ts, never executed | ✅ DELETED |

---

## MFA Enrollment Flow (Authoritative)

### Step 1: Login Triggers MFA Setup

**Frontend**: User enters username/password  
**POST**: `/api/auth/custom-login`  
**Handler**: `custom-login.controller.ts:customLoginHandler`

**Backend Response** (if MFA needed):
```json
{
  "success": false,
  "mfaRequired": true,
  "mfaSetupRequired": true,
  "message": "Multi-factor authentication setup required...",
  "requiresOTPSetup": true
}
```

**Detection Logic**:
- Keycloak returns HTTP 400 or 401
- Error: "Account is not fully set up"
- Backend detects and returns `mfaSetupRequired: true`

### Step 2: Generate OTP Secret

**Frontend**: Calls setup endpoint  
**POST**: `/api/auth/otp/setup`  
**Route**: `routes/otp.routes.ts` → `otp.controller.ts:otpSetupHandler`

**Backend Logic**:
1. Verify user exists via Keycloak Admin API (NOT Direct Grant to avoid circular dependency)
2. Generate TOTP secret with `speakeasy`
3. **STORE in Redis**: `otp:pending:{userId}` with 10-minute TTL
4. Return secret + QR code URL + userId

**Backend Response**:
```json
{
  "success": true,
  "data": {
    "secret": "BASE32_SECRET",
    "qrCodeUrl": "otpauth://totp/...",
    "qrCodeDataUrl": "data:image/png;base64,...",
    "userId": "d665c142-1822-41b6-992a-76975b1facd5"
  }
}
```

### Step 3: User Scans QR Code

**Frontend**: Displays QR code in modal  
**User**: Scans with Google Authenticator, Authy, etc.  
**User**: Enters 6-digit TOTP code

### Step 4: Finalize Enrollment

**Frontend**: Submits TOTP code  
**POST**: `/api/auth/otp/finalize-enrollment`  
**Route**: `routes/otp.routes.ts` → `otp-enrollment.controller.ts:finalizeEnrollment`

**Backend Logic**:
1. Convert `idpAlias` → `realmName` (e.g., "usa-realm-broker" → "dive-v3-usa")
2. Get user from Keycloak via Admin API (using **realmName**, not idpAlias)
3. **RETRIEVE secret from Redis**: `otp:pending:{userId}`
4. Verify TOTP code with `speakeasy`
5. Create OTP credential via Keycloak Admin API (using **realmName**)
6. Remove secret from Redis
7. Return success

**Backend Response**:
```json
{
  "success": true,
  "message": "OTP enrolled successfully. You can now authenticate with username, password, and OTP."
}
```

### Step 5: Login with MFA

**Frontend**: User logs in again  
**POST**: `/api/auth/custom-login` with `{username, password, otp}`  
**Backend**: Validates OTP, returns tokens  
**Result**: User redirected to dashboard

---

## Route Mounting Order (Critical)

```typescript
// backend/src/server.ts
app.use('/api/auth/otp', otpRoutes);  // ← Mounted FIRST (all /api/auth/otp/* routes)
app.use('/api/auth', authRoutes);      // ← Mounted SECOND (all other /api/auth/* routes)
```

**Result**:
- `/api/auth/otp/setup` → routed to `otpRoutes`
- `/api/auth/otp/finalize-enrollment` → routed to `otpRoutes`
- `/api/auth/custom-login` → routed to `authRoutes`

**Why This Order?**  
More specific routes (`/api/auth/otp/*`) must be mounted before general routes (`/api/auth/*`) to prevent route hijacking.

---

## Bugs Fixed in Phase 5

### Bug #1: Redis Session Management ✅
**File**: `otp.controller.ts` line 120  
**Fix**: Added `storePendingOTPSecret()` call  
**Impact**: Secret now persists for finalize-enrollment

### Bug #2: Circular Dependency ✅
**File**: `otp.controller.ts` lines 53-123  
**Fix**: Skip Direct Grant password verification (use Admin API instead)  
**Impact**: Users with "Account not set up" can now initiate OTP setup

### Bug #3: HTTP Status Code Detection ✅
**File**: `custom-login.controller.ts` line 333  
**Fix**: Check both 400 AND 401 status codes  
**Impact**: Backend detects MFA requirement correctly

### Bug #4: Error Message Detection ✅
**File**: `custom-login.controller.ts` lines 385-403  
**Fix**: Detect "Account is not fully set up" error  
**Impact**: Frontend shows MFA setup modal

### Bug #5: Performance Middleware Headers ✅
**File**: `performance-config.ts` lines 169-193  
**Fix**: Set headers before `res.end()` instead of in 'finish' event  
**Impact**: No more `ERR_HTTP_HEADERS_SENT` errors

### Bug #6: Realm Name vs IdP Alias ✅
**File**: `otp-enrollment.controller.ts` line 181  
**Fix**: Pass `realmName` to createOTPCredential, not `idpAlias`  
**Impact**: alice.general MFA enrollment now works (was 404 error)

---

## Redis Key Format (Standard)

**Key**: `otp:pending:{userId}`  
**Value** (JSON):
```json
{
  "secret": "BASE32_TOTP_SECRET",
  "createdAt": "2025-10-30T01:18:54.681Z",
  "expiresAt": "2025-10-30T01:28:54.681Z"
}
```

**TTL**: 600 seconds (10 minutes)  
**Cleanup**: Automatic via Redis TTL

---

## Troubleshooting

### "No pending OTP setup found"

**Causes**:
1. Secret expired (>10 minutes since setup)
2. User took too long between setup and finalize
3. Redis connection issue

**Solutions**:
- Retry OTP setup (generates new secret)
- Check Redis: `docker exec dive-v3-redis redis-cli KEYS "otp:pending:*"`
- Increase TTL if needed (line 67 in otp-redis.service.ts)

### "Invalid OTP code"

**Causes**:
1. Time skew between server and authenticator app
2. Wrong code entered
3. Code expired (TOTP codes valid for 30 seconds)

**Solutions**:
- Ensure server time is correct (NTP)
- Try next code from app
- Increase window parameter (currently ±30s)

### "Internal Server Error" on Finalize

**Causes**:
1. Realm name vs idpAlias mismatch (FIXED in Bug #6)
2. User not found in Keycloak
3. Keycloak Admin API permission issue

**Solutions**:
- Check backend logs: `docker logs dive-v3-backend | grep "finalize-enrollment"`
- Verify realm name conversion is correct
- Ensure user exists in realm

---

## Cache Clearing (Development)

**The Issue**:
- `.next` directory owned by root (Docker creates it)
- Your user can't delete it
- Volume mount shares between host and container

**Solution** (pick one):

**Option 1: Docker Down/Up** (Recommended):
```bash
docker-compose down
# Now .next can be deleted (no container using it)
rm -rf frontend/.next  # May need sudo
docker-compose up -d
```

**Option 2: Hard Browser Refresh** (Quickest):
```
Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
```

**Option 3: Clear Browser Storage**:
```
DevTools → Application → Clear Storage → Clear site data
```

---

**Status**: ✅ **Single Source of Truth Established**  
**Next**: Complete MFA enrollment testing end-to-end

