# Realm MFA Module

This Terraform module provides reusable MFA authentication flow configuration for DIVE V3 Keycloak realms.

## Features

- ✅ **Browser Flow**: Conditional MFA based on user clearance level
- ✅ **Direct Grant Flow**: MFA support for custom login pages (ROPC flow)
- ✅ **AAL2 Compliance**: NIST SP 800-63B compliant authentication assurance
- ✅ **Multi-Realm Support**: Works with USA, France, Canada, Industry realms

## Usage

```hcl
module "usa_mfa" {
  source = "./modules/realm-mfa"
  
  realm_id           = keycloak_realm.dive_v3_usa.id
  realm_name         = "dive-v3-usa"
  realm_display_name = "United States"
}
```

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|----------|
| `realm_id` | Keycloak realm ID | string | n/a | yes |
| `realm_name` | Realm name for resource naming | string | n/a | yes |
| `realm_display_name` | Human-readable realm name | string | n/a | yes |
| `clearance_attribute_name` | User attribute name for clearance level | string | `"clearance"` | no |
| `clearance_attribute_value_regex` | Regex for matching classified clearances | string | `"^(?!UNCLASSIFIED$).*"` | no |
| `enable_direct_grant_mfa` | Enable MFA for Direct Grant flow | bool | `true` | no |

## Outputs

| Name | Description |
|------|-------------|
| `browser_flow_id` | ID of the classified browser flow |
| `browser_flow_alias` | Alias of the classified browser flow |
| `direct_grant_flow_id` | ID of the Direct Grant MFA flow |
| `direct_grant_flow_alias` | Alias of the Direct Grant MFA flow |
| `otp_conditional_flow_alias` | Alias of the conditional OTP subflow |

## Authentication Flow Diagram

```
Browser Flow:
  ├─ Cookie (SSO) [ALTERNATIVE]
  └─ Classified User Conditional [ALTERNATIVE]
      ├─ Username + Password [REQUIRED]
      └─ Conditional OTP [CONDITIONAL]
          ├─ Condition: clearance != UNCLASSIFIED [REQUIRED]
          └─ OTP Form [REQUIRED]

Direct Grant Flow:
  ├─ Username Validation [REQUIRED]
  ├─ Password Validation [REQUIRED]
  └─ Conditional OTP [CONDITIONAL]
      ├─ Condition: clearance != UNCLASSIFIED [REQUIRED]
      └─ OTP Validation [REQUIRED]
```

## Requirements

- Terraform >= 1.0
- Keycloak provider >= 4.0
- Keycloak >= 21.0 (for conditional execution support)

## Notes

**OTP Policy Configuration**: This module creates authentication flows but does NOT configure the OTP policy. OTP policy must be configured at the realm level using the `security_defenses` block in your realm resource:

```hcl
resource "keycloak_realm" "my_realm" {
  # ... other configuration ...
  
  # OTP Policy (required for MFA flows)
  security_defenses {
    otp_policy {
      digits         = 6
      period         = 30
      algorithm      = "HmacSHA256"
      type           = "totp"
      look_ahead     = 1
    }
  }
}
```

## License

Part of DIVE V3 Coalition-Friendly ICAM Pilot

