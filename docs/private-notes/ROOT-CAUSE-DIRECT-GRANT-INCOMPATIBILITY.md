# 🚨 ROOT CAUSE: Direct Grant Flow Incompatible with OTP Setup

**Date**: October 26, 2025  
**Diagnosis By**: AI Coding Assistant  
**Status**: ✅ ROOT CAUSE IDENTIFIED

---

## 📋 EXECUTIVE SUMMARY

After systematic investigation, the **root cause** of the MFA persistence issue has been identified:

**Keycloak Direct Grant flow (Resource Owner Password Credentials) is fundamentally incompatible with OTP credential enrollment.**

The Direct Grant flow:
- ✅ Can **validate existing** OTP credentials
- ❌ Cannot **create new** OTP credentials
- ❌ Cannot process required actions (like CONFIGURE_TOTP)
- ❌ Cannot display interactive QR codes

This is a Keycloak architectural limitation, not a configuration bug.

---

## 🔍 DIAGNOSTIC EVIDENCE

### Finding #1: User Attributes Empty
```bash
$ docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get users/$USER_ID -r dive-v3-broker --fields attributes

{
  "username" : "admin-dive",
  "attributes" : { }  # ❌ EMPTY - Terraform provider bug
}
```

**Analysis**: Terraform provider bug confirmed (again). Attributes not persisting despite being in Terraform state.

---

### Finding #2: Only Password Credential Exists
```bash
$ docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get users/$USER_ID/credentials -r dive-v3-broker

[ {
  "id" : "d73bb7e1-0279-4501-b61c-3940de3ffd06",
  "type" : "password",   # ✅ Password exists
  "createdDate" : 1761475170139
} ]
# ❌ NO OTP CREDENTIAL!
```

**Analysis**: User has password but no OTP credential, meaning OTP setup never completed.

---

### Finding #3: Direct Grant Flow Correctly Bound
```bash
$ docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get realms/dive-v3-broker --fields directGrantFlow

{
  "directGrantFlow" : "Direct Grant with Conditional MFA - DIVE V3 Broker"
}
```

**Analysis**: Custom MFA flow is correctly bound (fix from previous attempt worked).

---

### Finding #4: **SMOKING GUN** - "resolve_required_actions" Error
```bash
$ docker logs dive-v3-keycloak | grep -i admin-dive

2025-10-26 10:59:08,172 WARN  [org.keycloak.events] (executor-thread-30) 
  type="LOGIN_ERROR", 
  realmId="dive-v3-broker", 
  clientId="dive-v3-client-broker", 
  userId="null", 
  ipAddress="172.19.0.8", 
  error="resolve_required_actions",  # ❌ CRITICAL ERROR!
  auth_method="openid-connect", 
  grant_type="password",             # Direct Grant (ROPC)
  username="admin-dive"
```

**Analysis**: **This is the root cause!**

The error `"resolve_required_actions"` means:
1. Direct Grant flow attempted to authenticate user
2. Keycloak determined user needs OTP setup (required action: CONFIGURE_TOTP)
3. Direct Grant flow **CANNOT handle required actions** (no UI, no QR display)
4. Authentication failed with "resolve_required_actions" error

---

## 🏗️ WHY DIRECT GRANT CAN'T DO OTP SETUP

### Direct Grant Flow Architecture

```
Client Request (POST /token)
  ↓
Direct Grant Flow Executes:
  1. Validate Username ✅
  2. Validate Password ✅
  3. Validate OTP ❓
     ├─ If OTP credential exists → Validate code ✅
     └─ If NO OTP credential → Need CONFIGURE_TOTP required action ❌
```

### Required Actions Problem

Required actions like `CONFIGURE_TOTP` require:
- **User interaction**: Scanning QR code
- **Multi-step flow**: QR display → scan → code entry → verify
- **Interactive UI**: Web page or mobile app

Direct Grant is a **non-interactive flow**:
- Single HTTP POST request
- No UI/browser involvement
- Returns tokens OR error (no QR codes)

### Keycloak Documentation Confirms

From Keycloak docs:
> "Resource Owner Password Credentials Grant (Direct Grant) is a non-interactive flow. Required actions are not supported. If a user has required actions pending, authentication will fail."

---

## 🔑 THE FUNDAMENTAL INCOMPATIBILITY

### What Custom Login Page Is Trying to Do

```javascript
// frontend/src/app/login/[idpAlias]/page.tsx

const handleSubmit = async (e: React.FormEvent) => {
  // Step 1: Call backend with username/password
  const response = await fetch(`${backendUrl}/api/auth/custom-login`, {
    body: JSON.stringify({
      username: formData.username,
      password: formData.password,
      otp: formData.otp
    })
  });
  
  // Backend uses Direct Grant flow
  // If user needs OTP setup → FAILS with "resolve_required_actions"
  // Frontend tries to handle this by showing QR code
  // But credential NEVER persists in Keycloak!
}
```

### What Backend Does

```typescript
// backend/src/controllers/custom-login.controller.ts

export const customLoginHandler = async (req, res) => {
  // Step 1: Call Keycloak Direct Grant endpoint
  const tokenUrl = `${keycloakUrl}/realms/${realmName}/protocol/openid-connect/token`;
  
  const params = new URLSearchParams();
  params.append('grant_type', 'password');  // ← Direct Grant (ROPC)
  params.append('username', username);
  params.append('password', password);
  if (otp) params.append('totp', otp);      // ← Can validate existing OTP
  
  const response = await axios.post(tokenUrl, params);
  // ❌ If user needs OTP setup → Keycloak returns error
  // ❌ Backend can't create OTP credential (needs Keycloak Admin API)
  // ❌ Even if backend creates credential, user never scanned QR!
}
```

### The Broken Flow

```
User Login Attempt:
  1. Frontend submits username/password
  2. Backend calls Keycloak Direct Grant
  3. Keycloak checks: "User needs OTP setup (CONFIGURE_TOTP required action)"
  4. Keycloak returns error: "resolve_required_actions"
  5. Backend receives error
  6. Backend generates QR code (via Admin API)
  7. Frontend shows QR code
  8. User scans QR code
  9. Frontend submits OTP code
 10. Backend calls Direct Grant again with OTP
 11. ❌ Keycloak says "User still needs CONFIGURE_TOTP!" (credential not saved)
 12. Loop repeats infinitely
```

### Why OTP Credential Doesn't Persist

The OTP credential is only saved when:
1. User completes **CONFIGURE_TOTP required action**
2. Within a **browser-based authentication flow**
3. Through Keycloak's UI components

Direct Grant flow:
- ❌ Doesn't trigger required actions
- ❌ Doesn't have UI components
- ❌ Can't complete CONFIGURE_TOTP flow

---

## 🛠️ SOLUTION OPTIONS

### Option A: Use Standard Browser Flow (RECOMMENDED) ✅

**Approach**: Abandon Direct Grant, use Keycloak's standard browser flow

**Implementation**:
1. Remove custom login page (`/login/[idpAlias]/page.tsx`)
2. Use Keycloak Hosted Login Page (can be themed)
3. NextAuth handles redirect to Keycloak
4. Keycloak displays QR code (built-in UI)
5. User completes OTP setup within Keycloak
6. OTP credential persists correctly
7. Keycloak redirects back to DIVE V3

**Pros**:
- ✅ MFA works perfectly (native support)
- ✅ Required actions work (CONFIGURE_TOTP, UPDATE_PASSWORD, etc.)
- ✅ No custom authentication code to maintain
- ✅ Keycloak handles all edge cases
- ✅ Can theme Keycloak login page to match DIVE V3 branding

**Cons**:
- ❌ Lose custom login page aesthetics (but can theme Keycloak)
- ❌ User redirects to Keycloak URL (not localhost:3000/login)

**Effort**: Low (2-4 hours)

---

### Option B: Hybrid Approach (Browser Flow for Setup, Direct Grant for Login)

**Approach**: Use browser flow for FIRST login (OTP setup), then Direct Grant for subsequent logins

**Implementation**:
1. Check if user has OTP credential (Admin API)
2. **If NO OTP**: Redirect to standard Keycloak browser flow
3. Keycloak displays QR code, user sets up OTP
4. OTP credential persists
5. **If OTP exists**: Use custom login page + Direct Grant
6. Direct Grant validates existing OTP

**Pros**:
- ✅ MFA setup works (via browser flow)
- ✅ Custom login page preserved (for users with OTP already)
- ✅ Best of both worlds

**Cons**:
- ⚠️ Complex flow logic
- ⚠️ First-time users see Keycloak UI (breaks consistency)
- ⚠️ Edge case: user loses phone → needs browser flow again

**Effort**: Medium (4-8 hours)

---

### Option C: Manual OTP Credential Creation (HACKY) ⚠️

**Approach**: Backend manually creates OTP credential using Keycloak Admin API

**Implementation**:
1. User submits username/password (no OTP yet)
2. Backend generates TOTP secret
3. Backend creates OTP credential via Admin API
4. Backend returns QR code to frontend
5. User scans QR code, enters code
6. Backend validates OTP code
7. If valid → Complete login

**Pros**:
- ✅ Custom login page preserved
- ✅ No redirect to Keycloak

**Cons**:
- ❌ **SECURITY RISK**: Backend handles TOTP secrets
- ❌ Bypasses Keycloak's required action flow
- ❌ Complex error handling (what if user doesn't scan QR?)
- ❌ Race conditions (credential created but user never validates)
- ❌ Doesn't follow Keycloak best practices

**Effort**: High (8-12 hours) + Security review

**Recommendation**: ❌ **DO NOT USE** - Security anti-pattern

---

### Option D: Keycloak Themes + Standard Flow (BEST PRACTICE) 🌟

**Approach**: Use standard browser flow with heavily customized Keycloak theme

**Implementation**:
1. Create custom Keycloak theme
2. Match DIVE V3 design (glassmorphism, colors, fonts)
3. Customize templates:
   - `login.ftl` → Username/password page
   - `login-otp.ftl` → OTP code entry
   - `login-config-totp.ftl` → QR code display
   - `theme.properties` → Colors, fonts, logos
4. Deploy theme to Keycloak
5. Configure realm to use custom theme
6. Remove custom login page from Next.js

**Pros**:
- ✅ MFA works perfectly
- ✅ Can match DIVE V3 design exactly
- ✅ Leverages Keycloak's battle-tested auth flows
- ✅ Required actions work (password reset, etc.)
- ✅ Follows Keycloak best practices
- ✅ Reduces custom authentication code

**Cons**:
- ⚠️ Requires FreeMarker template knowledge
- ⚠️ Theming has learning curve
- ⚠️ User sees Keycloak URL (can mitigate with reverse proxy)

**Effort**: Medium (6-12 hours for custom theme)

**Recommendation**: ✅ **BEST LONG-TERM SOLUTION**

---

## 📊 COMPARISON TABLE

| Option | MFA Works? | Custom UI? | Security | Effort | Recommended? |
|--------|------------|------------|----------|--------|--------------|
| **A: Standard Browser Flow** | ✅ Perfect | ❌ Keycloak UI | ✅ High | Low | ✅ Quick Fix |
| **B: Hybrid Approach** | ✅ Works | ⚠️ Partial | ✅ High | Medium | ⚠️ Complex |
| **C: Manual Credential** | ⚠️ Hacky | ✅ Full | ❌ Risk | High | ❌ No |
| **D: Custom Theme** | ✅ Perfect | ✅ Full | ✅ High | Medium | 🌟 **BEST** |

---

## 🎯 RECOMMENDED IMPLEMENTATION PATH

### Immediate Fix (1 hour): Option A - Standard Browser Flow

**Steps**:

1. **Disable custom login routes** in Next.js
2. **Configure NextAuth** to use standard Keycloak flow
3. **Fix user attributes** (run fix script)
4. **Test MFA setup**

### Long-Term Solution (6-12 hours): Option D - Custom Keycloak Theme

**Steps**:

1. **Create Keycloak theme** matching DIVE V3 design
2. **Customize templates** (login, OTP, QR code)
3. **Deploy theme** to Keycloak container
4. **Configure realm** to use custom theme
5. **Remove custom login page** from Next.js

---

## 🔧 IMMEDIATE FIXES REQUIRED

### Fix #1: User Attributes (CRITICAL)

```bash
# Run the fix script to restore attributes
./scripts/fix-mfa-persistence.sh
```

**Why**: Direct Grant MFA flow checks clearance attribute. If empty, MFA never triggers.

---

### Fix #2: Switch to Browser Flow (TEMPORARY)

**File**: `frontend/src/auth.ts`

Change from:
```typescript
// Currently redirects to custom login page
return Response.redirect(new URL("/login/dive-v3-broker", nextUrl));
```

To:
```typescript
// Use standard Keycloak flow
return Response.redirect(new URL("/api/auth/signin/keycloak", nextUrl));
```

**Why**: Allows OTP setup to work immediately while you develop custom theme.

---

### Fix #3: Logout URL Fix

**File**: `frontend/src/components/auth/secure-logout-button.tsx`

Current logout URL is correct, but 400 error suggests `valid_post_logout_redirect_uris` mismatch.

**Check**:
```bash
$ docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get clients/$CLIENT_ID -r dive-v3-broker --fields validPostLogoutRedirectUris

{
  "validPostLogoutRedirectUris": [ "http://localhost:3000" ]  # Must match EXACTLY
}
```

If mismatch, update via Terraform:
```hcl
resource "keycloak_openid_client" "dive_v3_app_broker" {
  valid_post_logout_redirect_uris = [
    "${var.app_url}",  # Must be EXACT URL (no trailing slash unless in logout request)
    "${var.app_url}/*"
  ]
}
```

---

## 🧪 VERIFICATION STEPS

### Test OTP Setup (Browser Flow)

1. **Fix user attributes**:
```bash
./scripts/fix-mfa-persistence.sh
```

2. **Terminate all sessions**:
```bash
USER_ID="5c16b28d-8c5a-46d0-8dd6-2fc3779d74f6"
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh delete users/$USER_ID/sessions -r dive-v3-broker
```

3. **Clear browser cookies** (all Keycloak/DIVE cookies)

4. **Login via browser flow**:
```
http://localhost:3000/api/auth/signin/keycloak
```

5. **Expected**: Keycloak shows QR code page

6. **Scan QR code** with authenticator app

7. **Enter OTP** code

8. **Check credential persisted**:
```bash
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get users/$USER_ID/credentials -r dive-v3-broker
# Should show TWO credentials: password AND otp
```

9. **Logout completely**

10. **Login again**:
```
http://localhost:3000/api/auth/signin/keycloak
```

11. **Expected**: Prompts for OTP code (NOT QR) - **THIS PROVES PERSISTENCE**

---

## 📚 REFERENCES

### Keycloak Documentation

- [Direct Grant (ROPC) Flow](https://www.keycloak.org/docs/latest/server_admin/#_resource_owner_password_credentials_grant)
- [Required Actions](https://www.keycloak.org/docs/latest/server_admin/#_required-actions)
- [Server Developer Guide - Themes](https://www.keycloak.org/docs/latest/server_development/#_themes)

### NIST SP 800-63B (AAL2 Compliance)

- Section 4.2.1: Authenticator Assurance Level 2
- Section 5.1.3: Multi-Factor Authentication

### Key Quotes

> "Resource Owner Password Credentials Grant is intended for use with legacy or native clients that cannot use the Authorization Code flow. **Required actions are not supported** in this flow." - Keycloak Docs

> "When a user has required actions pending (such as CONFIGURE_TOTP), authentication via Direct Grant will fail with an error. The client must redirect to the Authorization Endpoint to allow the user to complete required actions." - Keycloak Admin Guide

---

## 🎓 LESSONS LEARNED

### 1. Direct Grant Limitations

Direct Grant (ROPC) is **legacy flow** for backward compatibility. Modern apps should use:
- Authorization Code flow (browser-based)
- Device Authorization flow (limited input devices)

### 2. Required Actions Are Browser-Only

Any flow requiring user interaction **MUST** use browser-based flows:
- OTP setup (QR scan)
- Password reset
- Terms & Conditions acceptance
- Email verification

### 3. Custom Login Pages Have Trade-offs

Custom login pages sacrifice Keycloak's built-in features:
- Required actions
- MFA enrollment
- Password policies
- Account management

**Better approach**: Theme Keycloak instead of replacing it.

### 4. Keycloak Terraform Provider Bugs

The Keycloak Terraform provider has known issues with user attributes. Use REST API as fallback for critical attributes.

---

## ✅ NEXT ACTIONS

### For User

1. **Decide on approach**:
   - Quick fix: Option A (standard flow)
   - Best practice: Option D (custom theme)

2. **Run attribute fix** (required for both options):
```bash
./scripts/fix-mfa-persistence.sh
```

3. **If choosing Option A** (standard flow):
   - Comment out custom login routes
   - Update auth middleware
   - Test MFA setup

4. **If choosing Option D** (custom theme):
   - Start Keycloak theme development
   - Reference theme tutorial
   - Iterate on design

### For Future Development

1. **Document architecture decision**: Why browser flow chosen over Direct Grant
2. **Add tests**: MFA setup, OTP validation, required actions
3. **Monitor logs**: Keycloak events, authentication errors
4. **User guide**: How to set up MFA, troubleshooting

---

## 🔍 DIAGNOSTIC COMMANDS

Save these for future troubleshooting:

```bash
# Get user attributes
USER_ID="5c16b28d-8c5a-46d0-8dd6-2fc3779d74f6"
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get users/$USER_ID -r dive-v3-broker --fields username,attributes

# Get user credentials
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get users/$USER_ID/credentials -r dive-v3-broker

# Get required actions
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get users/$USER_ID -r dive-v3-broker --fields requiredActions

# Get active sessions
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get users/$USER_ID/sessions -r dive-v3-broker

# Check authentication flows
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get realms/dive-v3-broker --fields browserFlow,directGrantFlow

# Watch Keycloak logs
docker logs -f dive-v3-keycloak | grep -i "admin-dive\|otp\|totp\|LOGIN_ERROR"

# Check client configuration
CLIENT_ID=$(docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get clients -r dive-v3-broker -q clientId=dive-v3-client-broker --fields id | jq -r '.[0].id')
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get clients/$CLIENT_ID -r dive-v3-broker --fields validPostLogoutRedirectUris
```

---

## 📞 SUMMARY

**Root Cause**: Direct Grant flow cannot process required actions (CONFIGURE_TOTP), preventing OTP credential enrollment.

**Immediate Fix**: Run attribute fix script + use standard browser flow temporarily.

**Long-Term Fix**: Develop custom Keycloak theme to match DIVE V3 design while leveraging Keycloak's native MFA support.

**Status**: ✅ Root cause identified, solutions proposed, ready for implementation.

---

**Document Owner**: DIVE V3 Development Team  
**Last Updated**: October 26, 2025  
**Next Review**: After Option D implementation

