# MFA Federation Architecture for DIVE V3

## Executive Summary

This document describes the **working solution** for enforcing Multi-Factor Authentication (MFA) based on clearance levels for federated users in the DIVE V3 coalition identity platform.

**Date Resolved:** November 29, 2025

## Problem Statement

The original goal was to enforce different Authentication Assurance Levels (AAL) based on user clearance:

| Clearance | AAL | MFA Requirement |
|-----------|-----|-----------------|
| UNCLASSIFIED | AAL1 | None (password only) |
| CONFIDENTIAL | AAL2 | OTP (Time-based One-Time Password) |
| SECRET | AAL2 | OTP (Time-based One-Time Password) |
| TOP_SECRET | AAL3 | WebAuthn/Passkey (hardware-backed) |

## Root Cause Analysis

### Failed Approaches

Multiple approaches were attempted and failed:

1. **Conditional Authentication Flows in `postBrokerLoginFlowAlias`**
   - Used `conditional-user-attribute` authenticator to check clearance
   - **FAILED**: `userId=null` in post-broker-login context
   - Error: `IDENTITY_PROVIDER_POST_LOGIN_ERROR, error="invalid_user_credentials"`

2. **WebAuthn Authenticator in Post-Broker Flow**
   - Used `webauthn-authenticator-passwordless` with `REQUIRED` requirement
   - **FAILED**: Authenticator cannot validate credentials without user context
   - Error: `AuthenticationFlowException: authenticator: webauthn-authenticator-passwordless`

3. **Nested Conditional Subflows**
   - Complex flow structure with conditions and authenticators
   - **FAILED**: Same `userId=null` issue

### Root Cause

**The `postBrokerLoginFlowAlias` flow executes BEFORE the user is fully established in the realm.**

During post-broker-login:
- The federated identity has been received from the external IdP
- But the user object in the local realm is not yet fully contextualized
- `conditional-user-attribute` and credential-validating authenticators require `userId`
- Without `userId`, these authenticators fail with `invalid_user_credentials`

## Working Solution

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    MFA for Federated Users - Working Solution            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. User initiates login at USA App                                      │
│                    ↓                                                     │
│  2. User selects France federation                                       │
│                    ↓                                                     │
│  3. Redirect to France IdP → User authenticates with password            │
│                    ↓                                                     │
│  4. France IdP redirects back to USA IdP (OIDC callback)                 │
│                    ↓                                                     │
│  5. USA IdP executes "first broker login" flow (Keycloak default)        │
│     ├─ Review Profile (if needed)                                        │
│     ├─ Create User (if new) or Link Existing User                        │
│     └─ User is NOW fully established in realm                            │
│                    ↓                                                     │
│  6. postBrokerLoginFlowAlias = NULL (disabled!)                          │
│     └─ No additional authentication flow executed                        │
│                    ↓                                                     │
│  7. Required Actions are processed (user context IS available)           │
│     ├─ TOP_SECRET users: webauthn-register-passwordless                  │
│     ├─ SECRET users: CONFIGURE_TOTP                                      │
│     ├─ CONFIDENTIAL users: CONFIGURE_TOTP                                │
│     └─ UNCLASSIFIED users: (none)                                        │
│                    ↓                                                     │
│  8. User completes Required Action (registers Passkey or OTP)            │
│                    ↓                                                     │
│  9. Authentication complete → Redirect to application                    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Configuration Changes

#### 1. Identity Provider Configuration

For each federated IdP, set:
```
postBrokerLoginFlowAlias = null (empty/disabled)
firstBrokerLoginFlowAlias = "first broker login" (Keycloak default)
```

#### 2. Required Actions by Clearance

| User Clearance | Required Action | Effect |
|----------------|-----------------|--------|
| TOP_SECRET | `webauthn-register-passwordless` | Forces Passkey/WebAuthn registration |
| SECRET | `CONFIGURE_TOTP` | Forces OTP setup |
| CONFIDENTIAL | `CONFIGURE_TOTP` | Forces OTP setup |
| UNCLASSIFIED | (none) | No MFA required |

#### 3. WebAuthn Passwordless Policy (for AAL3)

Configure realm's WebAuthn Passwordless Policy for NIST AAL3 compliance:
```
webAuthnPolicyPasswordlessRpEntityName = "DIVE V3 Coalition - AAL3 - {instance_name}"
webAuthnPolicyPasswordlessAuthenticatorAttachment = "not specified"  # Allows ALL types (platform, cross-platform, hybrid/QR)
webAuthnPolicyPasswordlessUserVerificationRequirement = "required"
webAuthnPolicyPasswordlessRequireResidentKey = "Yes"
webAuthnPolicyPasswordlessAttestationConveyancePreference = "direct"
```

**IMPORTANT**: Setting `authenticatorAttachment = "not specified"` enables:
- ✅ Hardware Security Keys (YubiKey, Titan Key)
- ✅ Platform Authenticators (TouchID, FaceID, Windows Hello)
- ✅ QR Code / Hybrid Flow (scan with phone to use phone's secure enclave)

This provides user flexibility while maintaining AAL3 compliance (all options use hardware-backed secure enclaves).

## Implementation Steps

### Step 1: Disable Post-Broker-Login Flow

For each IdP on each instance:
```bash
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh update \
  identity-provider/instances/{idp-alias} -r dive-v3-broker \
  --server http://localhost:8080 \
  --realm master \
  --user admin \
  --password {admin-password} \
  -s 'postBrokerLoginFlowAlias='
```

### Step 2: Configure Required Actions for Users

For TOP_SECRET users (AAL3 - WebAuthn):
```bash
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh update \
  "users/{user-id}" -r dive-v3-broker \
  --server http://localhost:8080 \
  --realm master \
  --user admin \
  --password {admin-password} \
  -s 'requiredActions=["webauthn-register-passwordless"]'
```

For SECRET/CONFIDENTIAL users (AAL2 - OTP):
```bash
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh update \
  "users/{user-id}" -r dive-v3-broker \
  --server http://localhost:8080 \
  --realm master \
  --user admin \
  --password {admin-password} \
  -s 'requiredActions=["CONFIGURE_TOTP"]'
```

### Step 3: Configure WebAuthn Passwordless Policy (MANAGED VIA TERRAFORM)

**This step is now 100% managed via Terraform IaC. No manual configuration required.**

The WebAuthn Passwordless Policy is configured in:
`terraform/modules/federated-instance/main.tf`

```hcl
# WebAuthn Passwordless Policy (AAL3 - TOP_SECRET)
web_authn_passwordless_policy {
  relying_party_entity_name         = "DIVE V3 Coalition - AAL3 - ${var.instance_name}"
  relying_party_id                  = "" # Use default (hostname)
  signature_algorithms              = ["ES256", "RS256"]
  attestation_conveyance_preference = "direct"
  authenticator_attachment          = "not specified"  # Allows ALL types
  require_resident_key              = "Yes"
  user_verification_requirement     = "required"
  create_timeout                    = 120
  avoid_same_authenticator_register = false
}
```

To apply changes, run:
```bash
cd terraform/instances
terraform workspace select {usa|fra|gbr|deu}
terraform plan -var-file={instance}.tfvars
terraform apply
```

## Verification

### Test Case: TOP_SECRET User (AAL3)

1. Navigate to USA App: `https://usa-app.dive25.com`
2. Click France federation
3. Login as `testuser-fra-4` (TOP_SECRET) at France IdP
4. **Expected Result**: Redirected to WebAuthn/Passkey registration page
5. URL should contain: `required-action?execution=webauthn-register-passwordless`

### Test Case: SECRET User (AAL2)

1. Navigate to USA App: `https://usa-app.dive25.com`
2. Click France federation
3. Login as `testuser-fra-3` (SECRET) at France IdP
4. **Expected Result**: Redirected to OTP setup page
5. URL should contain: `required-action?execution=CONFIGURE_TOTP`

### Test Case: UNCLASSIFIED User (AAL1)

1. Navigate to USA App: `https://usa-app.dive25.com`
2. Click France federation
3. Login as `testuser-fra-1` (UNCLASSIFIED) at France IdP
4. **Expected Result**: Direct redirect to application (no MFA prompt)

## Limitations

1. **Required Actions are per-user, not per-login**: Once a user completes the Required Action (registers Passkey/OTP), the action is removed. Subsequent logins will use the registered credential automatically.

2. **Cannot use conditional logic in post-broker-login**: The `conditional-user-attribute` authenticator does not work in post-broker-login flows due to `userId=null`.

3. **Required Action assignment must be managed**: Either:
   - Manually assign Required Actions based on clearance
   - Use Terraform to manage user Required Actions
   - Implement a custom Keycloak extension for automatic assignment

## NIST SP 800-63B Compliance

| AAL | NIST Requirement | DIVE V3 Implementation |
|-----|------------------|------------------------|
| AAL1 | Single factor (password) | Password authentication at IdP |
| AAL2 | Two factors, one must be "something you have" | OTP (TOTP) via authenticator app |
| AAL3 | Hardware-based, phishing-resistant, non-exportable keys | WebAuthn with `not specified` attachment, `required` user verification, and `direct` attestation |


### AAL3 Authenticator Options

With `authenticatorAttachment = "not specified"`, users can choose:

| Option | Device | AAL3 Compliant? |
|--------|--------|-----------------|
| Hardware Security Key | YubiKey, Titan Key (USB/NFC) | ✅ Yes |
| Platform Authenticator | TouchID, FaceID, Windows Hello | ✅ Yes (uses Secure Enclave/TPM) |
| QR Code / Hybrid | Phone's Passkey via QR scan | ✅ Yes (uses phone's Secure Enclave) |

## Persistence & Resilience (IaC)

**All WebAuthn policy configurations are 100% managed via Terraform:**

- **Terraform Module**: `terraform/modules/federated-instance/main.tf`
- **Workspaces**: usa, fra, gbr, deu
- **Applied**: November 29, 2025

To verify or re-apply configuration:
```bash
cd terraform/instances
terraform workspace select {usa|fra|gbr|deu}
terraform plan -var-file={instance}.tfvars
terraform apply
```

## Files Modified

- `terraform/modules/federated-instance/idp-brokers-vault.tf` - IdP configuration
- `terraform/modules/realm-mfa/main.tf` - Authentication flows (for reference, not used for federated MFA)
- User records in Keycloak - Required Actions

## Troubleshooting

### Error: `invalid_user_credentials` with `userId=null`

**Cause**: Post-broker-login flow is executing authenticators that require user context.

**Solution**: Disable `postBrokerLoginFlowAlias` for the IdP.

### Error: `AuthenticationFlowException: authenticator: webauthn-authenticator-passwordless`

**Cause**: WebAuthn authenticator cannot validate credentials without user context.

**Solution**: Use Required Actions instead of authentication flows for MFA.

### User not prompted for MFA

**Cause**: Required Action not assigned to user.

**Solution**: Verify user has appropriate Required Action assigned based on clearance.

## References

- [Keycloak Authentication Flows Documentation](https://www.keycloak.org/docs/latest/server_admin/#_authentication-flows)
- [NIST SP 800-63B Digital Identity Guidelines](https://pages.nist.gov/800-63-3/sp800-63b.html)
- [WebAuthn Specification](https://www.w3.org/TR/webauthn-2/)

