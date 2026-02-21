# Realm MFA Module

Adds Multi-Factor Authentication (MFA) flows to a DIVE V3 Keycloak realm, including clearance-based conditional MFA enforcement.

## Overview

This module creates Keycloak authentication flows for:

- **Classified Access Browser Flow** - Enforces MFA based on user clearance level
- **Simple Post-Broker OTP Flow** - MFA for federated users
- **WebAuthn Policies** - Hardware key and passkey configuration
- **Direct Grant MFA** - Optional MFA for direct grant (password) flows

## Usage

```hcl
module "mfa" {
  source = "../modules/realm-mfa"

  realm_id           = module.instance.realm_id
  realm_name         = "dive-v3-broker"
  realm_display_name = "DIVE V3 - USA Pilot"

  use_standard_browser_flow = false
  enable_direct_grant_mfa   = false
}
```

### With Federated Instance

```hcl
module "instance" {
  source = "../modules/federated-instance"
  # ... instance configuration ...

  # Connect MFA flows to the instance
  browser_flow_override_id          = module.mfa.browser_flow_id
  simple_post_broker_otp_flow_alias = module.mfa.simple_post_broker_otp_flow_alias
}

module "mfa" {
  source = "../modules/realm-mfa"

  realm_id           = module.instance.realm_id
  realm_name         = "dive-v3-broker"
  realm_display_name = "DIVE V3 - ${var.instance_name}"

  use_standard_browser_flow = false
  enable_direct_grant_mfa   = false
}
```

## Authentication Flows Created

### 1. Classified Access Browser Flow

Enforces MFA based on user's `clearance` attribute:

| Clearance | MFA Requirement |
|-----------|-----------------|
| UNCLASSIFIED | No MFA required |
| CONFIDENTIAL | OTP/TOTP required (AAL2) |
| SECRET | OTP/TOTP required (AAL2) |
| TOP_SECRET | WebAuthn required (AAL3) |

### 2. Simple Post-Broker OTP Flow

Used for federated users who authenticate via partner IdPs. Enforces OTP after broker authentication.

**Important**: This flow uses only a single OTP Form authenticator as REQUIRED, which is the only pattern that works reliably for federated users.

### 3. Direct Grant MFA (Optional)

Adds MFA enforcement to the direct grant (password) authentication flow.

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| `realm_id` | Keycloak realm ID | `string` | n/a | yes |
| `realm_name` | Keycloak realm name | `string` | n/a | yes |
| `realm_display_name` | Human-readable realm display name | `string` | n/a | yes |
| `use_standard_browser_flow` | Use standard browser flow instead of custom | `bool` | `false` | no |
| `enable_direct_grant_mfa` | Enable MFA for direct grant flow | `bool` | `false` | no |

## Outputs

| Name | Description |
|------|-------------|
| `browser_flow_id` | ID of the Classified Access Browser Flow |
| `browser_flow_alias` | Alias of the Classified Access Browser Flow |
| `simple_post_broker_otp_flow_alias` | Alias of the Simple Post-Broker OTP Flow |
| `direct_grant_flow_id` | ID of the Direct Grant MFA Flow (if enabled) |

## Files

| File | Purpose |
|------|---------|
| `main.tf` | Classified Access Browser Flow with clearance-based MFA |
| `post-broker-flow.tf` | Post-broker MFA flow (DEPRECATED) |
| `simple-post-broker-otp.tf` | Simple Post-Broker OTP Flow (RECOMMENDED) |
| `direct-grant.tf` | Direct Grant MFA flow (optional) |
| `webauthn-policy.tf` | WebAuthn authenticator registration |
| `event-listeners.tf` | Authentication event listeners |
| `variables.tf` | Module input variables |
| `outputs.tf` | Module outputs |
| `versions.tf` | Provider version constraints |

## Important Notes

### ACR/AMR Claims (v3.1.0 - December 2025)

This module configures ACR (Authentication Context Class Reference) and AMR (Authentication Methods Reference) claims via:

1. **Native oidc-acr-mapper and oidc-amr-mapper** - Protocol mappers on the broker client
2. **dive-amr-enrichment event listener** - Custom SPI for WebAuthn/OTP credential detection
3. **Authenticator execution configs** - Each authenticator has `acr_level` and `reference` set

**ACR/AMR Mapping:**
| Authentication Method | AMR Claims | ACR Level | AAL |
|----------------------|------------|-----------|-----|
| Password only | `["pwd"]` | `0` | AAL1 |
| Password + OTP | `["pwd", "otp"]` | `1` | AAL2 |
| Password + WebAuthn | `["pwd", "hwk"]` | `3` | AAL3 |

**Common Issues:**
- If tokens show `amr: ["pwd"]` and `acr: "1"` after WebAuthn login, ensure:
  1. Native protocol mappers (`oidc-amr-mapper`, `oidc-acr-mapper`) are on the client
  2. `dive-amr-enrichment` event listener is enabled in the realm
  3. Authenticator execution configs have `acr_level` and `reference` set

**Hub Configuration Note:**
The hub uses only this `realm-mfa` module (not `federated-instance`), so AMR/ACR protocol mappers must be added separately in `terraform/hub/main.tf`.

### Federated User MFA

For federated users (those who authenticate via a partner IdP), use the `simple_post_broker_otp_flow_alias` output and set it on the IdP broker configuration. Complex conditional flows **do not work** for federated users due to Keycloak limitations.

### WebAuthn Configuration

WebAuthn policies are defined at the realm level in the `federated-instance` module. This module creates the authentication flows that use those policies.

### Clearance Attribute

The clearance-based MFA enforcement relies on the user's `clearance` attribute. Ensure this attribute is properly mapped from the IdP or set on local users.

## Dependencies

- Keycloak provider >= 5.6.0
- Terraform >= 1.5.0
- A realm created by the `federated-instance` module

## Related Modules

- `federated-instance` - Creates the realm and WebAuthn policies
