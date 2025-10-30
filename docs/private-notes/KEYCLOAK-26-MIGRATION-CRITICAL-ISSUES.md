# 🚨 Keycloak 26 Migration - Critical AAL2/FAL2 Issues

**Date**: October 27, 2025  
**Status**: ⚠️ **CRITICAL - AAL2/FAL2 BROKEN**  
**Keycloak Upgrade**: v23 → v26.4.2  

---

## 📋 Executive Summary

Your AAL2/FAL2 (Authentication/Federation Assurance Level) implementation is **broken** after upgrading to Keycloak 26 due to **critical breaking changes** in how Keycloak handles authentication context claims (`acr`, `amr`, `auth_time`).

### Impact

| Component | Status | Severity |
|-----------|--------|----------|
| **ACR Claims** | ❌ Not automatically set | 🔴 Critical |
| **AMR Claims** | ❌ May not propagate correctly | 🔴 Critical |
| **auth_time** | ⚠️ Missing from tokens | 🟡 High |
| **sub claim** | ⚠️ Now requires mapper | 🟡 High |
| **session_state** | ⚠️ Removed from tokens | 🟠 Medium |

---

## 🔍 Root Cause: Keycloak 26 Breaking Changes

### 1. **ACR/AMR No Longer Automatic** 🔴 CRITICAL

**From Keycloak-LLMS.txt (Line 1311-1339)**:

> **Keycloak 26.0.0**: "New default client scope `basic` is added as a realm 'default' client scope... This scope contains preconfigured protocol mappers for the following claims: `sub`, `auth_time`"

**What Changed**:
- Keycloak 26 introduced a new `basic` client scope
- The `auth_time` claim is now added via this scope
- **BUT**: There is **NO default mapper for `acr` or `amr` claims**
- Your custom mappers rely on **user attributes** being set during authentication
- **Your custom Direct Grant OTP flow is NOT setting ACR/AMR attributes**

**Your Current Implementation** (from `terraform/realms/broker-realm.tf:205-237`):
```terraform
# Custom mapper that reads from user.attributes.acr
resource "keycloak_generic_protocol_mapper" "broker_acr" {
  protocol_mapper = "oidc-usermodel-attribute-mapper"
  config = {
    "user.attribute" = "acr"     # ❌ NOT being set by authentication flow
    "claim.name"     = "acr"
  }
}

# Custom mapper that reads from user.attributes.amr
resource "keycloak_generic_protocol_mapper" "broker_amr" {
  protocol_mapper = "oidc-usermodel-attribute-mapper"
  config = {
    "user.attribute" = "amr"     # ❌ NOT being set by authentication flow
    "claim.name"     = "amr"
  }
}
```

**Why It's Broken**:
1. Your mappers expect user attributes `acr` and `amr` to exist
2. Your custom Direct Grant OTP flow **does NOT set these attributes**
3. Even your workaround script (`fix-aal2-claims.sh`) only fixes it **one-time**
4. Every new login should set ACR/AMR based on **authentication strength**, but it doesn't

---

### 2. **auth_time Claim Missing** 🟡 HIGH

**From Keycloak-LLMS.txt (Line 1316)**:
> "This scope contains preconfigured protocol mappers for the following claims: `sub` (See the details below in the dedicated section), `auth_time`"

**Your Configuration**:
- ❌ You **do NOT include the `basic` client scope** in your client configuration
- ❌ You have **NO auth_time mapper** defined
- ✅ Your backend **expects `auth_time`** (from `backend/src/middleware/authz.middleware.ts:57`)

**Missing Mapper**:
```typescript
// backend/src/middleware/authz.middleware.ts:57
interface IKeycloakToken {
  auth_time?: number;  // ❌ This is NOT in your tokens
  acr?: string;        // ❌ Also missing
  amr?: string[];      // ❌ Also missing
}
```

---

### 3. **session_state Claim Removed from Tokens** 🟠 MEDIUM

**From Keycloak-LLMS.txt (Line 1323-1330)**:
> **Removed session_state claim**: "The `session_state` claim, which contains the same value as the `sid` claim, is now removed from all tokens... The `session_state` claim remains present in the Access Token Response in accordance with OpenID Connect Session Management specification."

**Impact**:
- If your frontend or backend relies on `session_state` in the JWT payload, it will be missing
- You can re-add it via a custom mapper if needed

---

## 🔧 Required Fixes

### Fix #1: Add `basic` Client Scope (auth_time)

**Update**: `terraform/realms/broker-realm.tf`

```terraform
# Default scopes for broker client
resource "keycloak_openid_client_default_scopes" "broker_client_scopes" {
  realm_id  = keycloak_realm.dive_v3_broker.id
  client_id = keycloak_openid_client.dive_v3_app_broker.id

  default_scopes = [
    "openid",
    "profile",
    "email",
    "roles",
    "web-origins",
    "basic",  # ✅ ADD THIS - includes auth_time and sub mappers
    keycloak_openid_client_scope.broker_dive_attributes.name
  ]
}
```

**Why**: The `basic` scope includes the built-in `auth_time` mapper required by NIST SP 800-63B.

---

### Fix #2: Replace Custom ACR/AMR Mappers with Native Keycloak Authentication Context

**Problem**: Your current mappers try to read user attributes that are **never set** by your authentication flow.

**Solution**: Use Keycloak's **native authentication context** instead of user attributes.

#### Option A: Authentication Session Note Mapper ⭐ **RECOMMENDED**

Keycloak stores authentication context in **session notes** during the authentication flow. Use a session note mapper instead:

```terraform
# Replace broker_acr mapper
resource "keycloak_generic_protocol_mapper" "broker_acr_session" {
  realm_id   = keycloak_realm.dive_v3_broker.id
  client_id  = keycloak_openid_client.dive_v3_app_broker.id
  name       = "acr-from-session"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usersessionmodel-note-mapper"  # ✅ Changed from usermodel-attribute

  config = {
    "user.session.note" = "AUTH_CONTEXT_CLASS_REF"  # ✅ Keycloak's internal ACR storage
    "claim.name"        = "acr"
    "jsonType.label"    = "String"
    "id.token.claim"    = "true"
    "access.token.claim" = "true"
  }
}

# Replace broker_amr mapper
resource "keycloak_generic_protocol_mapper" "broker_amr_session" {
  realm_id   = keycloak_realm.dive_v3_broker.id
  client_id  = keycloak_openid_client.dive_v3_app_broker.id
  name       = "amr-from-session"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usersessionmodel-note-mapper"

  config = {
    "user.session.note" = "AUTH_METHODS_REF"  # ✅ Keycloak's internal AMR storage
    "claim.name"        = "amr"
    "jsonType.label"    = "String"
    "id.token.claim"    = "true"
    "access.token.claim" = "true"
  }
}
```

**How It Works**:
1. Keycloak's authentication flow automatically sets `AUTH_CONTEXT_CLASS_REF` based on:
   - Password-only = ACR level 0
   - Password + OTP = ACR level 1 (AAL2)
   - WebAuthn = ACR level 2 (AAL3)
2. The session note mapper reads this value and adds it to the token
3. **No custom SPI modifications needed**

---

#### Option B: Update Custom SPI to Set Session Notes

If you want to keep your custom Direct Grant OTP flow, update it to set the session notes:

```java
// keycloak/extensions/src/main/java/com/dive/keycloak/authenticator/DirectGrantOTPAuthenticator.java

@Override
public void authenticate(AuthenticationFlowContext context) {
    // ... existing OTP validation logic ...
    
    if (otpValid) {
        // ✅ Set ACR in session notes (Keycloak's native storage)
        context.getAuthenticationSession().setAuthNote("AUTH_CONTEXT_CLASS_REF", "1");  // AAL2
        
        // ✅ Set AMR in session notes
        context.getAuthenticationSession().setAuthNote("AUTH_METHODS_REF", "[\"pwd\",\"otp\"]");
        
        context.success();
    }
}
```

**Then** use the session note mappers from Option A.

---

### Fix #3: Apply to All Realms

Your configuration has the **same issue across all realms**:

| Realm | File | Line | Status |
|-------|------|------|--------|
| `dive-v3-broker` | `terraform/realms/broker-realm.tf` | 205-237 | ❌ Broken |
| `dive-v3-usa` | `terraform/realms/usa-realm.tf` | 204-236 | ❌ Broken |
| `dive-v3-fra` | `terraform/realms/fra-realm.tf` | 196-228 | ❌ Broken |
| `dive-v3-can` | `terraform/realms/can-realm.tf` | 168-200 | ❌ Broken |
| `dive-v3-industry` | `terraform/realms/industry-realm.tf` | 203-235 | ❌ Broken |

You need to apply the fixes to **ALL realm configurations**.

---

## 🧪 Verification Steps

### Step 1: Check Current Token Claims

```bash
# Login and get token
TOKEN=$(curl -s -X POST http://localhost:8081/realms/dive-v3-broker/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=dive-v3-client-broker" \
  -d "client_secret=YOUR_SECRET" \
  -d "username=admin-dive" \
  -d "password=DiveAdmin2025!" \
  -d "grant_type=password" | jq -r '.access_token')

# Decode token
echo "$TOKEN" | cut -d'.' -f2 | base64 -d | jq '{acr, amr, auth_time, sub}'
```

**Expected Current Output** (BROKEN):
```json
{
  "acr": null,        // ❌ Missing
  "amr": null,        // ❌ Missing
  "auth_time": null,  // ❌ Missing
  "sub": "5c16b28d-8c5a-46d0-8dd6-2fc3779d74f6"  // ✅ Likely present
}
```

**Expected After Fix**:
```json
{
  "acr": "1",                    // ✅ AAL2
  "amr": ["pwd", "otp"],         // ✅ Multi-factor
  "auth_time": 1730068923,       // ✅ Unix timestamp
  "sub": "5c16b28d-8c5a-46d0-8dd6-2fc3779d74f6"
}
```

---

### Step 2: Test Backend Validation

```bash
# Try accessing a classified resource
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:4000/api/resources/doc-generated-1761226224287-1305 \
  | jq
```

**Current Output** (BROKEN):
```json
{
  "error": "Forbidden",
  "message": "Authentication strength insufficient",
  "details": {
    "reason": "Classified resources require AAL2 (MFA). Current ACR: missing, AMR factors: 0"
  }
}
```

**After Fix**:
```json
{
  "resourceId": "doc-generated-1761226224287-1305",
  "classification": "SECRET",
  "content": "..."
}
```

---

## 📝 Implementation Checklist

### Immediate (Emergency Fix)

- [ ] **Backup Keycloak database** before any changes
- [ ] Add `basic` client scope to all realm clients (Fix #1)
- [ ] Update ACR/AMR mappers to use session notes (Fix #2 Option A)
- [ ] Run `terraform apply` for all realms
- [ ] Test token claims with verification script
- [ ] Test backend AAL2 validation

### Short-Term (Proper Fix)

- [ ] Update custom Direct Grant SPI to set session notes (Fix #2 Option B)
- [ ] Rebuild and redeploy Keycloak SPI JAR
- [ ] Remove workaround script (`fix-aal2-claims.sh`)
- [ ] Update E2E tests to verify ACR/AMR claims
- [ ] Document the new authentication flow

### Long-Term (Best Practice)

- [ ] Consider migrating to **Keycloak's native browser flow** instead of Direct Grant
  - Native flows have better ACR/AMR support
  - Step-up authentication built-in
  - No custom SPI maintenance
- [ ] Implement automated monitoring for missing claims
- [ ] Add CI/CD checks to verify token claims in all environments

---

## 🔄 Migration Script

Create `scripts/fix-keycloak-26-aal2.sh`:

```bash
#!/bin/bash
set -euo pipefail

echo "🔧 Fixing Keycloak 26 AAL2/FAL2 Claims..."

# 1. Add 'basic' scope to all clients
echo "📋 Step 1: Adding 'basic' client scope..."
cd terraform
terraform init
terraform plan -target=keycloak_openid_client_default_scopes.broker_client_scopes
terraform apply -target=keycloak_openid_client_default_scopes.broker_client_scopes -auto-approve

# 2. Update ACR/AMR mappers
echo "📋 Step 2: Updating ACR/AMR protocol mappers..."
terraform plan \
  -target=keycloak_generic_protocol_mapper.broker_acr_session \
  -target=keycloak_generic_protocol_mapper.broker_amr_session
terraform apply \
  -target=keycloak_generic_protocol_mapper.broker_acr_session \
  -target=keycloak_generic_protocol_mapper.broker_amr_session \
  -auto-approve

# 3. Verify token claims
echo "📋 Step 3: Verifying token claims..."
./scripts/verify-token-claims.sh

echo "✅ Keycloak 26 AAL2/FAL2 fix complete!"
```

---

## 🚨 Other Keycloak 26 Issues to Address

### 1. **Session State Removed**

If your frontend uses `session_state` in the JWT:

```terraform
# Add session_state mapper (backwards compatibility)
resource "keycloak_generic_protocol_mapper" "session_state_compat" {
  realm_id   = keycloak_realm.dive_v3_broker.id
  client_id  = keycloak_openid_client.dive_v3_app_broker.id
  name       = "session-state-compat"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usersessionmodel-note-mapper"

  config = {
    "user.session.note" = "SESSION_STATE"
    "claim.name"        = "session_state"
    "jsonType.label"    = "String"
    "id.token.claim"    = "true"
    "access.token.claim" = "true"
  }
}
```

---

### 2. **nonce Claim Only in ID Token**

**From Keycloak-LLMS.txt (Line 1343-1346)**:
> "The `nonce` claim is now only added to the ID token strictly following the OpenID Connect Core 1.0 specification."

**Impact**: If you validate `nonce` in access tokens, it will fail.

**Fix**: Only validate `nonce` in ID tokens, not access tokens.

---

### 3. **JWT Audience Validation Stricter**

**From Keycloak-LLMS.txt (Line 523-531)**:
> "The revised OIDC Core specification uses a stricter audience check: The Audience value MUST be the OP's Issuer Identifier passed as a string, and not a single-element array."

**Your Backend**: `backend/src/middleware/authz.middleware.ts:54`
```typescript
aud?: string | string[];  // ✅ Already handles both
```

**Action**: Verify your JWT validation supports single string `aud` (not just arrays).

---

## 📚 References

### Keycloak 26 Documentation
- **Breaking Changes**: Lines 12-31 (Keycloak-LLMS.txt)
- **New `basic` Client Scope**: Lines 1311-1339 (Keycloak-LLMS.txt)
- **session_state Removal**: Lines 1323-1330 (Keycloak-LLMS.txt)
- **ACR/AMR Changes**: Lines 432-514 (Keycloak-LLMS.txt)

### DIVE V3 Implementation
- **Backend AAL2 Validation**: `backend/src/middleware/authz.middleware.ts:444-514`
- **Terraform ACR/AMR Mappers**: `terraform/realms/broker-realm.tf:205-237`
- **AAL2 Fix Document**: `AAL2-AUTHENTICATION-STRENGTH-FIX.md`

### Standards
- **NIST SP 800-63B**: Authentication Assurance Levels
  - https://pages.nist.gov/800-63-3/sp800-63b.html
- **OpenID Connect Core 1.0**: ACR/AMR Claims
  - https://openid.net/specs/openid-connect-core-1_0.html#acrSemantics

---

## ✅ Success Criteria

| Test | Current | Target |
|------|---------|--------|
| `acr` claim in token | ❌ null | ✅ "1" (AAL2) |
| `amr` claim in token | ❌ null | ✅ ["pwd","otp"] |
| `auth_time` in token | ❌ null | ✅ Unix timestamp |
| AAL2 validation passes | ❌ 403 Forbidden | ✅ 200 OK |
| Access SECRET resources | ❌ Denied | ✅ Allowed |
| Access TOP_SECRET resources | ❌ Denied | ✅ Allowed |

---

**Status**: 🚨 **ACTION REQUIRED IMMEDIATELY**  
**Next Step**: Run Fix #1 and Fix #2 Option A  
**Estimated Time**: 30 minutes to implement, 1 hour to test  

---

**Document Owner**: DIVE V3 Development Team  
**Last Updated**: October 27, 2025  
**Next Review**: After fixes applied and tested

