# 🔧 Spain SAML Post-Authentication Issues - Root Cause Analysis & Fixes

**Date**: October 28, 2025  
**Status**: 🔴 **CRITICAL BUGS IDENTIFIED**

---

## 🐛 Issues Identified

### Issue 1: Identity Provider Shows "Canada" Instead of "Spain"
**Symptom**: Dashboard displays IdP as "Canada" (CAN) instead of "Spain" (ESP)  
**Root Cause**: No `identity_provider` claim mapper in broker realm configuration  
**Impact**: ❌ **CRITICAL** - Breaks audit trail, compliance reporting

### Issue 2: Protocol Shows "OIDC" Instead of "SAML"
**Symptom**: Dashboard displays protocol as "OIDC" instead of "SAML"  
**Root Cause**: No `identity_provider_protocol` claim mapper  
**Impact**: ❌ **CRITICAL** - Misrepresents authentication flow

### Issue 3: Missing `auth_time` Claim
**Symptom**: `auth_time` shows "N/A" on dashboard  
**Root Cause**: Broker realm has session note mapper but Keycloak 26 changed session note name  
**Impact**: ⚠️ **HIGH** - Breaks session timeout calculations

### Issue 4: Missing `acr` (Authentication Assurance Level) Claim
**Symptom**: `acr` shows "N/A" on dashboard  
**Root Cause**: Session note mapper configured but not populated during SAML broker flow  
**Impact**: 🔴 **CRITICAL** - Breaks AAL compliance requirements

### Issue 5: Missing `amr` (Authentication Methods Reference) Claim
**Symptom**: `amr` shows "N/A" on dashboard  
**Root Cause**: Session note mapper configured but not populated during SAML broker flow  
**Impact**: 🔴 **CRITICAL** - Breaks MFA verification

### Issue 6: MFA Not Triggered for SECRET Clearance User
**Symptom**: Juan Garcia (SECRET clearance) not prompted for OTP during login  
**Root Cause**: Identity Provider Redirector bypasses entire authentication flow including MFA conditional  
**Impact**: 🔴 **CRITICAL SECURITY VULNERABILITY** - Violates ACP-240 AAL2 requirement

---

## 🔍 Root Cause Analysis

### Problem 1: Identity Provider Claim Not Mapped

**What's Missing**:
```terraform
# broker-realm.tf - NO identity_provider mapper exists!
# Keycloak stores IdP alias in session note: "identity_provider"
# We need to map this to a JWT claim
```

**Expected Token**:
```json
{
  "identity_provider": "esp-realm-external",  // ← MISSING
  "identity_provider_identity": "juan.garcia@defensa.gob.es"  // ← MISSING
}
```

---

### Problem 2: Auth Context Claims Not Populated in Broker Flow

**Keycloak 26 Breaking Change**:
- In direct authentication: ACR/AMR set by authentication flow
- In broker authentication: **ACR/AMR NOT set automatically**
- Solution: Need **Identity Provider Mappers** to copy from upstream IdP

**Current Configuration** (broker-realm.tf):
```terraform
resource "keycloak_generic_protocol_mapper" "broker_acr" {
  protocol_mapper = "oidc-usersessionmodel-note-mapper"
  config = {
    "user.session.note" = "AUTH_CONTEXT_CLASS_REF"  // ← EMPTY in broker flow!
  }
}
```

**Why it's empty**:
1. User logs in at SimpleSAMLphp (external SAML IdP)
2. SAML assertion sent to Keycloak broker
3. Keycloak creates user session **WITHOUT setting ACR/AMR session notes**
4. Protocol mapper tries to read session notes → finds nothing → claim is NULL

---

### Problem 3: MFA Bypassed by Identity Provider Redirector

**Current Authentication Flow** (terraform/modules/realm-mfa/main.tf):
```
Classified Access Browser Flow
├─ Identity Provider Redirector [ALTERNATIVE]
│  └─ Reads kc_idp_hint → Auto-redirects to SAML IdP
└─ Classified User Conditional [ALTERNATIVE]
    ├─ Username/Password Form [REQUIRED]
    └─ Conditional OTP [CONDITIONAL]
```

**What Happens**:
1. User clicks "Spain SAML" button with `kc_idp_hint=esp-realm-external`
2. Identity Provider Redirector executes **FIRST**
3. Redirects to SimpleSAMLphp **IMMEDIATELY**
4. **SKIPS** Conditional MFA subflow entirely! ⚠️
5. User returns from SimpleSAMLphp authenticated without OTP

**Security Risk**:
- SECRET/TOP_SECRET users authenticating via SAML never see OTP prompt
- Violates ACP-240 requirement: "AAL2 for CONFIDENTIAL and above"
- SAML users downgraded from AAL2 to AAL1

---

## ✅ Solutions

### Solution 1: Add Identity Provider Claim Mappers

**File**: `terraform/realms/broker-realm.tf`

Add these protocol mappers to expose IdP information in JWT:

```terraform
# Identity Provider Alias (which IdP was used)
resource "keycloak_generic_protocol_mapper" "broker_identity_provider" {
  realm_id   = keycloak_realm.dive_v3_broker.id
  client_id  = keycloak_openid_client.dive_v3_app_broker.id
  name       = "identity-provider-mapper"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usersessionmodel-note-mapper"

  config = {
    "user.session.note"    = "identity_provider"  # Keycloak stores IdP alias here
    "claim.name"           = "identity_provider"
    "jsonType.label"       = "String"
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "false"
  }
}

# Identity Provider Identity (user ID at upstream IdP)
resource "keycloak_generic_protocol_mapper" "broker_identity_provider_identity" {
  realm_id   = keycloak_realm.dive_v3_broker.id
  client_id  = keycloak_openid_client.dive_v3_app_broker.id
  name       = "identity-provider-identity-mapper"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usersessionmodel-note-mapper"

  config = {
    "user.session.note"    = "identity_provider_identity"  # User ID from upstream IdP
    "claim.name"           = "identity_provider_identity"
    "jsonType.label"       = "String"
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "false"
  }
}
```

---

### Solution 2: Fix auth_time Mapper

**Current Issue**: Keycloak 26 changed session note name

**Fix**:
```terraform
resource "keycloak_generic_protocol_mapper" "broker_auth_time" {
  realm_id   = keycloak_realm.dive_v3_broker.id
  client_id  = keycloak_openid_client.dive_v3_app_broker.id
  name       = "auth-time-mapper"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usersessionmodel-note-mapper"

  config = {
    # Keycloak 26 uses lowercase "auth_time" session note
    "user.session.note"    = "auth_time"  # Changed from "AUTH_TIME"
    "claim.name"           = "auth_time"
    "jsonType.label"       = "long"
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "false"
  }
}
```

---

### Solution 3: Add ACR/AMR via Authentication Flow (Custom SPI)

**Problem**: Broker flow doesn't set ACR/AMR session notes

**Solution Options**:

#### Option A: Custom Authenticator SPI (RECOMMENDED)
Create a custom Keycloak authenticator that sets ACR/AMR based on clearance:

```java
public class ACREnrichmentAuthenticator implements Authenticator {
    @Override
    public void authenticate(AuthenticationFlowContext context) {
        UserModel user = context.getUser();
        String clearance = user.getFirstAttribute("clearance");
        
        // Set ACR based on clearance
        String acr = determinedACR(clearance);  // SECRET/TOP_SECRET → AAL2
        context.getAuthenticationSession().setAuthNote("AUTH_CONTEXT_CLASS_REF", acr);
        
        // Set AMR based on authentication method
        String amr = determineAMR(context);  // SAML → "saml", OTP → "otp,pwd"
        context.getAuthenticationSession().setAuthNote("AUTH_METHODS_REF", amr);
        
        context.success();
    }
}
```

#### Option B: Post-Broker Authentication Subflow (SIMPLER)
Add a subflow AFTER IdP Redirector to set ACR/AMR:

```terraform
# Modify: terraform/modules/realm-mfa/main.tf

resource "keycloak_authentication_flow" "classified_browser" {
  realm_id = var.realm_id
  alias    = "Classified Access Browser Flow - ${var.realm_display_name}"
  provider_id = "basic-flow"
}

# Step 1: Identity Provider Redirector
resource "keycloak_authentication_execution" "idp_redirector" {
  # ... existing config ...
}

# Step 2: ACR Enrichment (NEW - sets ACR/AMR after broker login)
resource "keycloak_authentication_execution" "acr_enrichment" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_flow.classified_browser.alias
  authenticator     = "dive-acr-enrichment"  # Custom SPI
  requirement       = "REQUIRED"  # Always execute

  depends_on = [keycloak_authentication_execution.idp_redirector]
}

# Step 3: Conditional MFA (existing - for manual login)
resource "keycloak_authentication_subflow" "classified_conditional" {
  # ... existing config ...
}
```

---

### Solution 4: Fix MFA for SAML Users (POST-BROKER MFA)

**Problem**: IdP Redirector bypasses MFA conditional

**Solution**: Add **Post-Broker Login Flow** with MFA enforcement

**Architecture**:
```
Main Browser Flow
├─ Identity Provider Redirector [ALTERNATIVE]
│  └─ Redirects to SAML IdP
└─ Manual Login Conditional [ALTERNATIVE]
    ├─ Username/Password
    └─ Conditional MFA

Post-Broker Login Flow (executed AFTER SAML login)
├─ Check Clearance Level
└─ Conditional OTP [CONDITIONAL]
    └─ OTP Form [REQUIRED] if clearance >= CONFIDENTIAL
```

**Implementation**:
```terraform
# New post-broker flow
resource "keycloak_authentication_flow" "post_broker_classified" {
  realm_id = var.realm_id
  alias    = "Post-Broker Classified MFA - ${var.realm_display_name}"
  provider_id = "basic-flow"
}

# Conditional MFA for broker users
resource "keycloak_authentication_subflow" "post_broker_conditional" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_flow.post_broker_classified.alias
  alias             = "Post-Broker MFA Conditional - ${var.realm_display_name}"
  requirement       = "CONDITIONAL"
  provider_id       = "basic-flow"
}

# User attribute condition (check clearance)
resource "keycloak_authentication_execution" "post_broker_clearance_check" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.post_broker_conditional.alias
  authenticator     = "conditional-user-attribute"
  requirement       = "REQUIRED"
}

resource "keycloak_authentication_execution_config" "post_broker_clearance_check_config" {
  realm_id     = var.realm_id
  execution_id = keycloak_authentication_execution.post_broker_clearance_check.id
  alias        = "Clearance >= CONFIDENTIAL"
  config = {
    attribute_name  = "clearance"
    attribute_value = "^(CONFIDENTIAL|SECRET|TOP_SECRET)$"  # Regex match
    include_group_attributes = "false"
  }
}

# OTP form
resource "keycloak_authentication_execution" "post_broker_otp" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.post_broker_conditional.alias
  authenticator     = "auth-otp-form"
  requirement       = "REQUIRED"

  depends_on = [keycloak_authentication_execution.post_broker_clearance_check]
}

# Bind post-broker flow to all SAML IdPs
resource "keycloak_saml_identity_provider" "esp_realm_external" {
  # ... existing config ...
  
  # Add post-broker login flow
  post_broker_login_flow_alias = keycloak_authentication_flow.post_broker_classified.alias
}
```

---

## 🎯 Implementation Priority

1. **CRITICAL (Deploy Immediately)**:
   - [ ] Add identity_provider claim mappers (Solution 1)
   - [ ] Add post-broker MFA flow (Solution 4)

2. **HIGH (Deploy Within 24h)**:
   - [ ] Fix auth_time mapper (Solution 2)
   - [ ] Add ACR/AMR enrichment SPI (Solution 3)

3. **MEDIUM (Next Sprint)**:
   - [ ] Update frontend to display IdP name from `identity_provider` claim
   - [ ] Update frontend to detect protocol from IdP alias
   - [ ] Add audit logging for post-broker MFA events

---

## 📊 Expected Results After Fixes

### JWT Token Claims (After Fixes):
```json
{
  "sub": "93054324-7563-43a8-a60b-7081eca0ac7e",
  "email": "juan.garcia@defensa.gob.es",
  "uniqueID": "juan.garcia",
  "clearance": "SECRET",
  "countryOfAffiliation": "ESP",
  "acpCOI": ["NATO-COSMIC"],
  
  // FIXED ✅
  "identity_provider": "esp-realm-external",
  "identity_provider_identity": "juan.garcia@defensa.gob.es",
  "auth_time": 1761686396,
  "acr": "http://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-63B.pdf#AAL2",
  "amr": ["otp", "saml"]
}
```

### Dashboard Display (After Fixes):
```
Identity Provider: Spain Ministry of Defense (External SAML) ✅
Protocol: SAML ✅
auth_time: 2025-10-28T21:19:56Z ✅
acr (AAL): AAL2 ✅
amr: ["otp", "saml"] ✅
```

### Authentication Flow (After Fixes):
```
1. User clicks "Spain SAML" button
2. Identity Provider Redirector → SimpleSAMLphp
3. User authenticates at SimpleSAMLphp
4. SAML assertion → Keycloak
5. Post-Broker Flow executes:
   - ACR Enrichment: Sets ACR=AAL2 for SECRET clearance
   - Conditional MFA: Checks clearance attribute
   - OTP Form: Prompts for OTP code ✅ (FIXED!)
6. User enters OTP
7. OAuth callback → NextAuth
8. Dashboard with full claims ✅
```

---

## 🚨 Security Impact

### Before Fixes:
- ❌ SAML users bypass MFA (AAL1 instead of AAL2)
- ❌ No audit trail of which IdP was used
- ❌ Cannot verify authentication assurance level
- ❌ ACP-240 compliance VIOLATION

### After Fixes:
- ✅ SAML users subject to MFA (AAL2 enforced)
- ✅ Full audit trail with IdP and protocol
- ✅ ACR/AMR claims verify authentication strength
- ✅ ACP-240 compliant

---

**Document Version**: 1.0  
**Last Updated**: October 28, 2025  
**Status**: 🔴 **CRITICAL - IMMEDIATE ACTION REQUIRED**

