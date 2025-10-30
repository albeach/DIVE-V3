# OTP MFA Authentication Flow - PROPER Solution

## 🎯 User's Correct Insight

**User's Question:** "Why would we generate a secret without authentication first? I do not get why we would create an unauthenticated endpoint."

**Answer:** You're absolutely right! The solution is NOT to create an unauthenticated endpoint. The proper solution is to:

1. **Allow password-only authentication (AAL1)** when user doesn't have OTP configured yet
2. User authenticates with password → gets AAL1 token
3. Uses AAL1 token to access OTP setup endpoint
4. Setup endpoint generates secret & QR code (with authentication!)
5. User scans QR, enters first OTP code
6. Backend creates credential via Keycloak Admin API
7. Next login requires OTP → gets AAL2 token

## 🔍 Root Causes Identified

### Issue #1: Custom SPI Rejecting Password-Only Auth
**Problem:** The Custom SPI was calling `context.challenge()` when user didn't have OTP, preventing ANY authentication.

**Fix Applied:**
```java
if (!hasOTP && (otpCode == null || otpCode.isEmpty())) {
    // Allow password-only authentication (AAL1) for enrollment
    context.getAuthenticationSession().setAuthNote("AUTH_CONTEXT_CLASS_REF", "0"); // AAL1
    context.getAuthenticationSession().setAuthNote("AUTH_METHODS_REF", "[\"pwd\"]");
    context.success(); // KEY: Allow auth to succeed!
    return;
}
```

### Issue #2: Terraform Flow Configuration
**Problem:** The OTP subflow was set to `requirement = "REQUIRED"`, which means Keycloak's authentication engine won't allow ANY authentication to succeed without OTP - **even if the Custom SPI calls `context.success()`!**

**Location:** `terraform/modules/realm-mfa/direct-grant.tf`

**Fix Applied:**
```terraform
resource "keycloak_authentication_subflow" "direct_grant_otp_conditional" {
  requirement = "ALTERNATIVE"  # Changed from "REQUIRED"
}
```

**Why This Matters:**
- `REQUIRED`: Flow MUST succeed for authentication to proceed
- `ALTERNATIVE`: Flow CAN succeed, but authentication proceeds even if it doesn't
- `CONDITIONAL`: Flow evaluation depends on conditions

## 📐 Proper Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  FIRST LOGIN (No OTP Configured)                                │
└─────────────────────────────────────────────────────────────────┘

1. User → POST /api/auth/otp/setup { username, password }
   │
   ├─ Backend calls Keycloak Direct Grant (no OTP param)
   │
   ├─ Keycloak validates username + password ✓
   │
   ├─ Custom SPI detects: hasOTP=false, otpCode=null
   │
   ├─ Custom SPI allows password-only auth (AAL1) ✓
   │
   ├─ Terraform flow: ALTERNATIVE allows success ✓
   │
   └─ Returns: AAL1 token + OTP secret + QR code

2. User scans QR code in authenticator app

3. User → POST /api/auth/otp/finalize-enrollment { username, otpCode }
   │
   ├─ Backend verifies OTP code against pending secret
   │
   └─ Backend creates credential via Keycloak Admin API ✓

┌─────────────────────────────────────────────────────────────────┐
│  SUBSEQUENT LOGINS (OTP Configured)                             │
└─────────────────────────────────────────────────────────────────┘

4. User → POST /api/auth/custom-login { username, password, otp }
   │
   ├─ Keycloak validates username + password ✓
   │
   ├─ Custom SPI detects: hasOTP=true, otpCode=provided
   │
   ├─ Custom SPI validates OTP with SHA256 ✓
   │
   ├─ Custom SPI sets AAL2 session notes ✓
   │
   └─ Returns: AAL2 token (Multi-Factor Authentication)
```

## ✅ Proper Implementation Checklist

### Custom SPI Logic
- [x] Allow `context.success()` when `!hasOTP && !otpCode` → AAL1
- [x] Reject when `!hasOTP && otpCode` → Error (invalid state)
- [x] Validate when `hasOTP && otpCode` → AAL2 or reject
- [x] Require OTP when `hasOTP && !otpCode` → Error (OTP required)

### Terraform Configuration
- [x] Set OTP subflow to `ALTERNATIVE` (not `REQUIRED`)
- [ ] Apply Terraform changes to Keycloak
- [ ] Verify flow configuration in Keycloak Admin Console

### Backend API
- [x] `/api/auth/otp/setup` authenticates user (password-only, gets AAL1)
- [x] `/api/auth/otp/finalize-enrollment` creates credential via Admin API
- [x] Backend detects AAL1 vs AAL2 from token claims

### Frontend
- [x] Updated to call `/api/auth/otp/finalize-enrollment`
- [x] Handles enrollment before allowing full login

## 🔧 Key Technical Details

### AAL Levels (NIST SP 800-63B)
- **AAL1**: Single-factor (password only)
- **AAL2**: Multi-factor (password + OTP)

### Keycloak Flow Requirements
| Requirement    | Behavior |
|---------------|----------|
| `REQUIRED`    | Must succeed for auth to proceed |
| `ALTERNATIVE` | Auth succeeds even if this doesn't |
| `CONDITIONAL` | Evaluated based on conditions |
| `DISABLED`    | Skipped entirely |

### Session Notes (Keycloak 26+)
```java
// AAL1 (Password only)
context.getAuthenticationSession().setAuthNote("AUTH_CONTEXT_CLASS_REF", "0");
context.getAuthenticationSession().setAuthNote("AUTH_METHODS_REF", "[\"pwd\"]");

// AAL2 (Password + OTP)
context.getAuthenticationSession().setAuthNote("AUTH_CONTEXT_CLASS_REF", "1");
context.getAuthenticationSession().setAuthNote("AUTH_METHODS_REF", "[\"pwd\",\"otp\"]");
```

## 🎓 Lessons Learned

1. **User was right:** Unauthenticated endpoints don't make sense for OTP enrollment
2. **Terraform configuration matters:** Flow `requirement` setting overrides Custom SPI logic
3. **Direct Grant limitations:** Can't handle Required Actions, but CAN handle optional MFA
4. **AAL levels are important:** Allow AAL1 for enrollment, require AAL2 for classified access

## 📚 References

- User's GitHub Reference: https://github.com/w0l1d/keycloak-extensions/tree/master/realm-resource-extensions/src/main/java/org/keycloak/rest/totpvalidator
- Keycloak Direct Grant: https://www.keycloak.org/docs/latest/securing_apps/index.html#_resource_owner_password_credentials_flow
- NIST SP 800-63B: Digital Identity Guidelines (Authentication and Lifecycle Management)
- Keycloak Authentication Flows: https://www.keycloak.org/docs/latest/server_admin/index.html#_authentication-flows

## 🚀 Next Steps

1. ✅ Fixed Custom SPI to allow password-only auth
2. ✅ Fixed Terraform flow requirement to ALTERNATIVE
3. ⏳ Apply Terraform changes to Keycloak
4. ⏳ Test full enrollment flow in browser
5. ⏳ Verify AAL1 → AAL2 transition

---

**Implementation Date:** October 27-28, 2025  
**Key Insight:** User correctly identified architectural flaw  
**Status:** Core fixes complete, testing in progress

