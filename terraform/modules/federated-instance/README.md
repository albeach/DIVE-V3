# Federated Instance Module

Creates a complete DIVE V3 federated instance including Keycloak realm, OIDC client, protocol mappers, and federation client configurations.

## Overview

This is the primary module for deploying a DIVE V3 NATO country instance. It creates:

- **Broker Realm** with NIST 800-63B compliant security policies
- **OIDC Client** for the DIVE V3 application
- **Protocol Mappers** for identity attributes (clearance, countryOfAffiliation, uniqueID, acpCOI)
- **WebAuthn Policies** for AAL2 and AAL3 authentication
- **Federation Clients** for partner NATO instances
- **Admin User** with super_admin role

## Usage

### Pilot Deployment (USA)

```hcl
module "instance" {
  source = "../modules/federated-instance"

  instance_code = "USA"
  instance_name = "United States (Pilot)"

  app_url = "https://localhost:3000"
  api_url = "https://localhost:4000"
  idp_url = "https://localhost:8443"

  realm_name    = "dive-v3-broker"
  client_id     = "dive-v3-client-broker"
  client_secret = var.client_secret

  create_test_users  = true
  test_user_password = var.test_user_password

  federation_partners = {
    fra = {
      instance_code = "FRA"
      instance_name = "France"
      idp_url       = "https://fra-idp.dive25.com"
      enabled       = true
    }
  }

  login_theme    = "dive-v3-usa"
  webauthn_rp_id = "localhost"
}
```

### Spoke Deployment (NATO Country)

```hcl
module "instance" {
  source = "../modules/federated-instance"

  instance_code = var.instance_code  # e.g., "POL"
  instance_name = var.instance_name  # e.g., "Poland"

  app_url = var.app_url
  api_url = var.api_url
  idp_url = var.idp_url

  realm_name    = "dive-v3-broker-${lower(var.instance_code)}"
  client_id     = var.client_id
  client_secret = var.client_secret

  create_test_users  = var.create_test_users
  test_user_password = var.test_user_password

  federation_partners = var.federation_partners

  login_theme    = var.login_theme
  webauthn_rp_id = var.webauthn_rp_id
}
```

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| `instance_code` | ISO 3166-1 alpha-3 country code (USA, FRA, DEU, etc.) | `string` | n/a | yes |
| `instance_name` | Human-readable instance name | `string` | n/a | yes |
| `app_url` | Frontend application URL | `string` | n/a | yes |
| `api_url` | Backend API URL | `string` | n/a | yes |
| `idp_url` | Keycloak IdP URL | `string` | n/a | yes |
| `realm_name` | Name of the broker realm | `string` | `"dive-v3-broker"` | no |
| `client_id` | OIDC client ID | `string` | `"dive-v3-client-broker"` | no |
| `client_secret` | OIDC client secret (from GCP Secret Manager) | `string` | `null` | no |
| `federation_partners` | Map of partner instances for IdP federation | `map(object)` | `{}` | no |
| `create_test_users` | Whether to create test users | `bool` | `true` | no |
| `test_user_password` | Password for test users | `string` | `null` | conditional |
| `admin_user_password` | Password for admin user | `string` | `null` | no |
| `login_theme` | Keycloak login theme | `string` | `"dive-v3"` | no |
| `webauthn_rp_id` | WebAuthn Relying Party ID | `string` | `""` | no |
| `browser_flow_override_id` | MFA flow ID to override browser flow | `string` | `null` | no |

## Outputs

| Name | Description |
|------|-------------|
| `realm_id` | The Keycloak realm ID |
| `realm_name` | The Keycloak realm name |
| `client_id` | The OIDC client ID |
| `client_secret` | The OIDC client secret (sensitive) |
| `federation_idp_aliases` | List of configured federation IdP aliases |

## Security Features

### NIST 800-63B Compliance

- **Password Policy**: 16+ characters, uppercase, lowercase, digits, special chars
- **Password History**: Cannot reuse last 5 passwords
- **Brute Force Protection**: Account lockout after 5 failed attempts

### WebAuthn Policies

- **AAL2 (Standard)**: Hardware keys or platform authenticators for CONFIDENTIAL/SECRET
- **AAL3 (Passwordless)**: Discoverable credentials with biometric for TOP_SECRET

### Security Headers

- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- X-XSS-Protection: 1; mode=block
- Strict-Transport-Security: max-age=31536000

## Files

| File | Purpose |
|------|---------|
| `main.tf` | Realm, client, protocol mappers, federation clients |
| `idp-brokers.tf` | External IdP broker configurations |
| `test-users.tf` | Test user creation (4 clearance levels) |
| `user-profile.tf` | User profile attribute definitions |
| `variables.tf` | Module input variables |
| `variables-incoming-secrets.tf` | Federation secret variables |
| `outputs.tf` | Module outputs |
| `versions.tf` | Provider version constraints |

## Dependencies

- Keycloak provider >= 5.6.0
- Terraform >= 1.5.0

## Related Modules

- `realm-mfa` - Add MFA authentication flows to the realm
