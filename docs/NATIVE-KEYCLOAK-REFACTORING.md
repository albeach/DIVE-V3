# Native Keycloak 26.4.2 Refactoring Guide
## DIVE V3 Coalition ICAM Platform

**Date:** November 4, 2025  
**Version:** 2.0.0  
**Status:** 🚀 **READY FOR EXECUTION**  
**Risk Level:** 🟢 **LOW** (replacing custom code with native features)

---

## Executive Summary

This document outlines the complete removal of custom Keycloak SPIs and migration to native Keycloak 26.4.2 features. This refactoring will **eliminate all custom Java code** while maintaining AAL2/FAL2 and ACP-240 compliance.

### Key Findings from Research

✅ **Keycloak 26.4.2 Native Features Discovered:**

1. **ACR (Authentication Context Class Reference)**
   - Native ACR to LoA (Level of Authentication) mapping at realm level
   - Automatic ACR claim generation based on authentication flow execution
   - `acr_level` configuration on authenticator executions
   - ✅ **No custom Event Listener needed!**

2. **AMR (Authentication Methods Reference)**
   - Built-in **Authentication Method Reference (AMR)** protocol mapper
   - Automatic AMR tracking for all authenticators
   - Conforms to RFC-8176 spec
   - ✅ **No custom protocol mapper needed!**

3. **Direct Grant Flow**
   - ⚠️ **LIMITATION**: Direct Grant does NOT support conditional flows or MFA natively
   - **Recommendation**: Deprecate Direct Grant, use browser-based flows exclusively
   - **Rationale**: AAL2 compliance requires interactive authentication

---

## Custom SPIs to Remove

### 1. DirectGrantOTPAuthenticator.java ❌ REMOVE
**Current Purpose:** MFA for Direct Grant (Resource Owner Password) flow  
**Native Alternative:** **DEPRECATE Direct Grant** - Use browser flows only  
**Rationale:**
- Direct Grant is inherently insecure for AAL2 (password passed via POST)
- Keycloak does not support conditional MFA in Direct Grant natively
- NIST SP 800-63B recommends browser-based flows for AAL2

**Migration Steps:**
1. Remove custom `direct-grant-otp-setup` authenticator
2. Update frontend to use ONLY browser-based OIDC Authorization Code flow
3. Remove Direct Grant binding from all realms
4. Update documentation to reflect browser-only authentication

---

### 2. ConfigureOTPRequiredAction.java ❌ REMOVE
**Current Purpose:** Force OTP setup for classified users (clearance != UNCLASSIFIED)  
**Native Alternative:** Use built-in `CONFIGURE_TOTP` required action + conditional checks  
**Rationale:**
- Keycloak's built-in `CONFIGURE_TOTP` action is production-ready
- Conditional logic can be handled via attribute-based default required actions

**Migration Steps:**
1. Enable built-in `CONFIGURE_TOTP` required action in realm settings
2. For classified users, add `CONFIGURE_TOTP` to required actions list
3. Use Terraform `keycloak_user` resource to set required actions conditionally
4. Remove custom `dive-configure-otp` references

**Terraform Example:**
```hcl
resource "keycloak_user" "classified_user" {
  realm_id = var.realm_id
  username = "john.doe"
  
  required_actions = [
    "CONFIGURE_TOTP"  # Built-in action
  ]
  
  attributes = {
    clearance = "SECRET"
    # ... other attributes
  }
}
```

---

### 3. AMREnrichmentEventListener.java ❌ REMOVE
**Current Purpose:** Set `AUTH_METHODS_REF` session note based on authentication  
**Native Alternative:** **Built-in AMR tracking** (Keycloak 26.4+)  
**Rationale:**
- Keycloak automatically sets AMR for all authenticators
- Each authenticator can define its AMR reference value
- RFC-8176 compliant out of the box

**Migration Steps:**
1. Remove custom Event Listener SPI
2. Configure AMR reference values on authenticator executions:
   - Password: `pwd`
   - OTP: `otp`
   - WebAuthn: `hwk` (hardware key)
3. Use built-in `oidc-usersessionmodel-note-mapper` to map `amr` claim

**Terraform Example:**
```hcl
# Password authenticator with AMR
resource "keycloak_authentication_execution_config" "password_amr" {
  realm_id     = var.realm_id
  execution_id = keycloak_authentication_execution.browser_forms.id
  alias        = "Password AMR"
  config = {
    reference = "pwd"  # Sets AMR to ["pwd"]
  }
}

# OTP authenticator with AMR
resource "keycloak_authentication_execution_config" "otp_amr" {
  realm_id     = var.realm_id
  execution_id = keycloak_authentication_execution.browser_otp_form.id
  alias        = "OTP AMR"
  config = {
    reference = "otp"  # Sets AMR to ["pwd","otp"]
  }
}
```

---

### 4. AMRProtocolMapper.java ❌ REMOVE
**Current Purpose:** Map AMR session note to JWT `amr` claim  
**Native Alternative:** **Built-in protocol mapper** (oidc-usersessionmodel-note-mapper)  
**Rationale:**
- Native mapper already exists for session notes
- No custom code needed

**Migration Steps:**
1. Remove custom AMR protocol mapper
2. Use existing `oidc-usersessionmodel-note-mapper` for `amr` claim
3. Ensure mapper configuration:
   - Session Note: `AUTH_METHODS_REF`
   - Token Claim Name: `amr`
   - Claim JSON Type: Array

**Terraform Example:**
```hcl
resource "keycloak_generic_protocol_mapper" "amr_mapper" {
  realm_id        = var.realm_id
  client_id       = var.client_id
  name            = "amr"
  protocol        = "openid-connect"
  protocol_mapper = "oidc-usersessionmodel-note-mapper"
  
  config = {
    "user.session.note" = "AUTH_METHODS_REF"
    "claim.name"        = "amr"
    "jsonType.label"    = "JSON"
    "id.token.claim"    = "true"
    "access.token.claim" = "true"
  }
}
```

---

### 5. RedisOTPStore.java ❌ REMOVE
**Current Purpose:** Temporary OTP secret storage for Direct Grant flow  
**Native Alternative:** **DEPRECATE** (no longer needed without Direct Grant OTP)  
**Rationale:**
- Browser flows use Keycloak's built-in credential storage
- No temporary storage needed for standard TOTP

**Migration Steps:**
1. Remove Redis OTP storage code
2. Remove Jedis dependency from `pom.xml`
3. Remove Redis volume mount if ONLY used for OTP storage
4. Keycloak's credential storage handles all OTP secrets

---

## Native Keycloak Features to Leverage

### Feature 1: ACR to LoA Mapping (Realm-Level)

**Configuration Location:** Realm Settings → Client Policies → ACR to LoA

**Purpose:** Map ACR values to numeric LoA levels for authentication flow conditions

**DIVE V3 Mapping:**
```
ACR Value → LoA Level → Meaning
"0"       → 0         → AAL1 (Password only)
"1"       → 1         → AAL2 (Password + OTP)
"2"       → 2         → AAL3 (Hardware key - future)
```

**Terraform Configuration:**
```hcl
resource "keycloak_realm" "dive_v3" {
  realm = "dive-v3-broker"
  
  # ACR to LoA mapping (native KC 26.4 feature)
  attributes = {
    "acr.loa.map" = jsonencode({
      "0" = 0  # AAL1
      "1" = 1  # AAL2
      "2" = 2  # AAL3 (future)
    })
  }
}
```

---

### Feature 2: Built-in AMR Protocol Mapper

**Mapper Type:** `oidc-usersessionmodel-note-mapper`  
**Session Note:** `AUTH_METHODS_REF` (automatically set by Keycloak)  
**Claim Name:** `amr`  
**Claim Type:** JSON Array

**How It Works:**
1. User authenticates with password → Keycloak sets session note `AUTH_METHODS_REF = ["pwd"]`
2. User completes OTP → Keycloak appends to session note `AUTH_METHODS_REF = ["pwd","otp"]`
3. Protocol mapper reads session note and adds `amr` claim to token

**No custom code required!** ✅

---

### Feature 3: Authenticator AMR Reference Values

**Configuration:** Each authenticator execution can define its AMR reference value

**Common AMR Values (RFC-8176):**
- `pwd` - Password
- `otp` - One-time password (TOTP)
- `hwk` - Hardware key (WebAuthn/FIDO2)
- `sms` - SMS verification
- `mfa` - Multiple factor authentication

**DIVE V3 Usage:**
- Password form: `reference = "pwd"`
- OTP form: `reference = "otp"`
- WebAuthn (future): `reference = "hwk"`

---

## Refactored Authentication Flow Architecture

### Browser Flow (Simplified - Native Only)

```
Flow: "Classified Access Browser Flow"
├─ Cookie (ALTERNATIVE)
│  └─ reference: none (SSO reuse)
├─ Username+Password Form (ALTERNATIVE)
│  ├─ acr_level: 0 (AAL1)
│  └─ reference: "pwd"
└─ Conditional OTP (CONDITIONAL)
   ├─ Condition: conditional-user-attribute
   │  └─ attribute: clearance != "UNCLASSIFIED"
   └─ OTP Form (REQUIRED)
      ├─ acr_level: 1 (AAL2)
      └─ reference: "otp"
```

**Token Claims Generated:**
- UNCLASSIFIED user: `acr = "0"`, `amr = ["pwd"]`
- SECRET user: `acr = "1"`, `amr = ["pwd","otp"]`

**All Native Keycloak Features!** ✅

---

### Direct Grant Flow: DEPRECATED

**Decision:** ❌ **REMOVE Direct Grant flow entirely**

**Rationale:**
1. **Security**: Direct Grant sends password via POST (not AAL2 compliant)
2. **MFA Limitation**: Keycloak does not support conditional MFA in Direct Grant
3. **Best Practice**: NIST SP 800-63B recommends browser-based flows for AAL2
4. **Federation**: Direct Grant bypasses IdP federation (breaks multi-realm architecture)

**Migration Path:**
1. Update frontend to use ONLY Authorization Code flow (browser-based)
2. Remove Direct Grant client credentials
3. Update documentation to remove Direct Grant references
4. Remove custom Direct Grant OTP authenticator

**Frontend Impact:**
- Remove custom login page (if using Direct Grant)
- Use Keycloak-hosted login pages (or custom theme)
- Implement standard OIDC Authorization Code flow with PKCE

---

## Terraform Refactoring Plan

### Phase 1: Update MFA Module

**File:** `terraform/modules/realm-mfa/main.tf`

**Changes:**
1. Remove custom authenticator references
2. Add AMR reference values to authenticators
3. Configure ACR levels on executions
4. Remove Direct Grant flow module

**Refactored Browser Flow:**
```hcl
resource "keycloak_authentication_flow" "classified_browser" {
  realm_id    = var.realm_id
  alias       = "Classified Access Browser Flow - ${var.realm_display_name}"
  description = "AAL2 enforcement using NATIVE Keycloak 26.4 features"
}

# Cookie (SSO reuse)
resource "keycloak_authentication_execution" "browser_cookie" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_flow.classified_browser.alias
  authenticator     = "auth-cookie"
  requirement       = "ALTERNATIVE"
}

# Password form with ACR and AMR
resource "keycloak_authentication_execution" "browser_forms" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_flow.classified_browser.alias
  authenticator     = "auth-username-password-form"
  requirement       = "ALTERNATIVE"
  
  depends_on = [keycloak_authentication_execution.browser_cookie]
}

resource "keycloak_authentication_execution_config" "browser_password_config" {
  realm_id     = var.realm_id
  execution_id = keycloak_authentication_execution.browser_forms.id
  alias        = "Password Authentication Config"
  config = {
    acr_level = "0"        # AAL1 level
    reference = "pwd"      # AMR reference (NATIVE KC 26.4)
  }
}

# Conditional OTP subflow
resource "keycloak_authentication_subflow" "browser_conditional_otp" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_flow.classified_browser.alias
  alias             = "Conditional OTP"
  requirement       = "CONDITIONAL"
  
  depends_on = [keycloak_authentication_execution.browser_forms]
}

# Condition: clearance attribute check
resource "keycloak_authentication_execution" "browser_condition_user_attribute" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.browser_conditional_otp.alias
  authenticator     = "conditional-user-attribute"
  requirement       = "REQUIRED"
}

resource "keycloak_authentication_execution_config" "browser_condition_config" {
  realm_id     = var.realm_id
  execution_id = keycloak_authentication_execution.browser_condition_user_attribute.id
  alias        = "Clearance Check"
  config = {
    attribute_name  = "clearance"
    attribute_value = "^(CONFIDENTIAL|SECRET|TOP_SECRET)$"  # Regex
    negate          = "false"
  }
}

# OTP form with ACR and AMR
resource "keycloak_authentication_execution" "browser_otp_form" {
  realm_id          = var.realm_id
  parent_flow_alias = keycloak_authentication_subflow.browser_conditional_otp.alias
  authenticator     = "auth-otp-form"
  requirement       = "REQUIRED"
  
  depends_on = [keycloak_authentication_execution.browser_condition_user_attribute]
}

resource "keycloak_authentication_execution_config" "browser_otp_config" {
  realm_id     = var.realm_id
  execution_id = keycloak_authentication_execution.browser_otp_form.id
  alias        = "OTP Authentication Config"
  config = {
    acr_level = "1"        # AAL2 level
    reference = "otp"      # AMR reference (NATIVE KC 26.4)
  }
}
```

---

### Phase 2: Update Protocol Mappers

**File:** `terraform/modules/shared-mappers/main.tf`

**Changes:**
1. Remove custom AMR mapper
2. Update ACR mapper to use session note
3. Verify AMR mapper uses `AUTH_METHODS_REF` session note

**Refactored ACR Mapper:**
```hcl
resource "keycloak_generic_protocol_mapper" "acr_mapper" {
  realm_id        = var.realm_id
  client_id       = var.client_id
  name            = "acr"
  protocol        = "openid-connect"
  protocol_mapper = "oidc-usersessionmodel-note-mapper"
  
  config = {
    "user.session.note"  = "AUTH_CONTEXT_CLASS_REF"  # Set by KC automatically
    "claim.name"         = "acr"
    "jsonType.label"     = "String"
    "id.token.claim"     = "true"
    "access.token.claim" = "true"
  }
}
```

**Refactored AMR Mapper:**
```hcl
resource "keycloak_generic_protocol_mapper" "amr_mapper" {
  realm_id        = var.realm_id
  client_id       = var.client_id
  name            = "amr"
  protocol        = "openid-connect"
  protocol_mapper = "oidc-usersessionmodel-note-mapper"
  
  config = {
    "user.session.note"  = "AUTH_METHODS_REF"  # Set by KC automatically
    "claim.name"         = "amr"
    "jsonType.label"     = "JSON"  # JSON array
    "id.token.claim"     = "true"
    "access.token.claim" = "true"
  }
}
```

---

### Phase 3: Remove SPI Files

**Files to Delete:**
```
keycloak/extensions/
├── src/main/java/com/dive/keycloak/
│   ├── action/
│   │   ├── ConfigureOTPRequiredAction.java          ❌ DELETE
│   │   └── ConfigureOTPRequiredActionFactory.java   ❌ DELETE
│   ├── authenticator/
│   │   ├── DirectGrantOTPAuthenticator.java         ❌ DELETE
│   │   └── DirectGrantOTPAuthenticatorFactory.java  ❌ DELETE
│   ├── event/
│   │   ├── AMREnrichmentEventListener.java          ❌ DELETE
│   │   └── AMREnrichmentEventListenerFactory.java   ❌ DELETE
│   ├── mapper/
│   │   └── AMRProtocolMapper.java                   ❌ DELETE
│   └── redis/
│       └── RedisOTPStore.java                       ❌ DELETE
├── pom.xml                                           ❌ DELETE ENTIRE DIRECTORY
└── ...

keycloak/providers/
├── dive-keycloak-extensions.jar                     ❌ DELETE
└── dive-keycloak-spi.jar                            ❌ DELETE
```

**Update Keycloak Dockerfile:**
```diff
- # Copy Custom SPI JARs
- COPY --chown=1000:1000 providers/*.jar /opt/keycloak/providers/
```

**Update docker-compose.yml:**
```diff
- # Remove SPI volume mounts (if any)
```

---

## Testing Strategy

### Test Matrix: 11 Realms × 4 Clearances = 44 Tests

**Realms:**
1. dive-v3-broker (direct login)
2. dive-v3-usa (federated)
3. dive-v3-fra (federated)
4. dive-v3-can (federated)
5. dive-v3-deu (federated)
6. dive-v3-gbr (federated)
7. dive-v3-ita (federated)
8. dive-v3-esp (federated)
9. dive-v3-pol (federated)
10. dive-v3-nld (federated)
11. dive-v3-industry (federated)

**Clearances:**
- UNCLASSIFIED (AAL1: password only)
- CONFIDENTIAL (AAL2: password + OTP)
- SECRET (AAL2: password + OTP)
- TOP_SECRET (AAL2: password + OTP)

### Test Cases per Realm

**Test 1: UNCLASSIFIED User (AAL1)**
```
Given: User with clearance = "UNCLASSIFIED"
When: User authenticates
Then:
  - MFA NOT required
  - Token contains: acr = "0", amr = ["pwd"]
  - Authentication succeeds
```

**Test 2: CONFIDENTIAL User (AAL2)**
```
Given: User with clearance = "CONFIDENTIAL"
When: User authenticates
Then:
  - MFA REQUIRED (OTP prompt shown)
  - User completes OTP
  - Token contains: acr = "1", amr = ["pwd","otp"]
  - Authentication succeeds
```

**Test 3: SECRET User (AAL2)**
```
Given: User with clearance = "SECRET"
When: User authenticates
Then:
  - MFA REQUIRED (OTP prompt shown)
  - User completes OTP
  - Token contains: acr = "1", amr = ["pwd","otp"]
  - Authentication succeeds
```

**Test 4: TOP_SECRET User (AAL2)**
```
Given: User with clearance = "TOP_SECRET"
When: User authenticates
Then:
  - MFA REQUIRED (OTP prompt shown)
  - User completes OTP
  - Token contains: acr = "1", amr = ["pwd","otp"]
  - Authentication succeeds
```

### Token Validation Tests

**Verify All Required Claims:**
```json
{
  "sub": "uuid",
  "uniqueID": "john.doe@mil",
  "clearance": "SECRET",
  "countryOfAffiliation": "USA",
  "acpCOI": ["NATO-COSMIC", "FVEY"],
  "acr": "1",
  "amr": ["pwd", "otp"],
  "auth_time": 1730764800,
  "exp": 1730765700,
  "iat": 1730764800
}
```

**Validation Checks:**
- ✅ `acr` is "0" for UNCLASSIFIED, "1" for classified
- ✅ `amr` is ["pwd"] for AAL1, ["pwd","otp"] for AAL2
- ✅ `auth_time` is recent (within 5 minutes)
- ✅ All DIVE attributes present

---

## Rollback Plan

### Scenario 1: Native Features Don't Work

**Symptoms:**
- ACR/AMR claims missing from tokens
- MFA not triggering correctly
- Authentication flows broken

**Rollback Steps:**
1. Restore `keycloak/extensions/` directory from backup
2. Restore `keycloak/providers/*.jar` files
3. Revert Terraform MFA module to previous version
4. `terraform apply` to restore custom SPIs
5. Restart Keycloak

**Time to Rollback:** 15 minutes

---

### Scenario 2: Federation Breaks

**Symptoms:**
- Broker → National realm federation fails
- Attribute sync not working

**Rollback Steps:**
1. Revert authentication flow bindings
2. National realms: Set browser flow to "browser" (standard)
3. Broker realm: Revert to previous custom flow
4. `terraform apply`

**Time to Rollback:** 10 minutes

---

### Scenario 3: Compliance Violation

**Symptoms:**
- AAL2 requirements not met
- Token claims missing or incorrect

**Rollback Steps:**
1. FULL ROLLBACK to previous version
2. Restore database backup
3. Restore Terraform state
4. Redeploy stack

**Time to Rollback:** 30 minutes

---

## Success Criteria

### Technical Metrics

- [ ] Zero custom Java code in `keycloak/extensions/`
- [ ] Zero .jar files in `keycloak/providers/`
- [ ] All 44 test cases passing (11 realms × 4 clearances)
- [ ] All token claims present and correct
- [ ] ACR = "0" for UNCLASSIFIED, "1" for classified
- [ ] AMR = ["pwd"] for AAL1, ["pwd","otp"] for AAL2
- [ ] All 10 federations working
- [ ] MFA triggers correctly for classified users
- [ ] Login latency < 2 seconds
- [ ] No errors in Keycloak logs

### Compliance Metrics

- [ ] AAL2 requirements met (password + OTP for classified)
- [ ] FAL2 requirements met (HTTPS, signed tokens)
- [ ] ACP-240 attributes present (uniqueID, clearance, countryOfAffiliation, acpCOI)
- [ ] Token lifetimes compliant (≤ 15 minutes)
- [ ] Audit logging functional
- [ ] All security headers configured

---

## Benefits of Native Approach

### 1. Reduced Maintenance Burden
- ❌ No custom Java code to maintain
- ❌ No Maven builds required
- ❌ No SPI version compatibility issues
- ✅ Keycloak upgrades easier

### 2. Improved Reliability
- ✅ Native features are battle-tested
- ✅ Better error handling
- ✅ Faster bug fixes (from Keycloak team)
- ✅ No custom code failure points

### 3. Better Performance
- ✅ No Redis dependency for OTP storage
- ✅ No custom Event Listener overhead
- ✅ Optimized native code paths

### 4. Enhanced Security
- ✅ Browser-based flows only (more secure)
- ✅ No Direct Grant password transmission
- ✅ Fewer custom code attack surfaces

### 5. Compliance
- ✅ NIST SP 800-63B compliant
- ✅ RFC-8176 compliant (AMR)
- ✅ OIDC spec compliant (ACR)

---

## References

### Keycloak Documentation
- [ACR to LoA Mapping](https://www.keycloak.org/docs/26.4/server_admin/#_mapping-acr-to-loa-realm)
- [Authentication Flows](https://www.keycloak.org/docs/26.4/server_admin/#_authentication-flows)
- [AMR Protocol Mapper](https://www.keycloak.org/docs/26.4/server_admin/#_authentication-flows)

### Standards
- [NIST SP 800-63B](https://pages.nist.gov/800-63-3/sp800-63b.html) - Authentication Assurance Levels
- [RFC-8176](https://www.rfc-editor.org/rfc/rfc8176.html) - Authentication Method Reference Values
- [OIDC Core Spec](https://openid.net/specs/openid-connect-core-1_0.html#acrSemantics) - ACR Semantics

### Internal Documents
- `KEYCLOAK-26-UPGRADE-AUDIT.md` - Full configuration audit
- `docs/DIVE-V3-IMPLEMENTATION-PLAN.md` - Overall project plan
- `docs/MFA-OTP-IMPLEMENTATION.md` - Current MFA design

---

## Approval & Sign-Off

**Technical Lead Approval:**
- [ ] Native approach reviewed and approved
- [ ] Direct Grant deprecation approved
- [ ] Test plan approved
- [ ] Rollback plan approved

**Signature:** ________________________ Date: ____________

**Security Team Approval:**
- [ ] AAL2/FAL2 compliance verified
- [ ] Browser-only authentication approved
- [ ] Token claim structure approved

**Signature:** ________________________ Date: ____________

---

## Next Steps

1. ✅ **Phase 1: Analysis Complete** - Native features documented
2. 🔄 **Phase 2: Terraform Refactoring** - Update MFA modules
3. 🔄 **Phase 3: Testing** - Execute full test matrix
4. 🔄 **Phase 4: Documentation** - Update README, CHANGELOG
5. 🔄 **Phase 5: Deployment** - Production rollout

---

**Document Version:** 1.0  
**Last Updated:** November 4, 2025  
**Next Review:** After Phase 2 completion


