# Archived Terraform Configurations

This directory contains deprecated and legacy Terraform configurations that have been superseded by the modular architecture.

## Directory Structure

### 2025-12-14-cleanup/

Archived during the Terraform refactoring cleanup on December 14, 2025.

#### Root-Level Disabled Files
- `provider.tf.disabled` - Legacy provider configuration
- `versions.tf.disabled` - Legacy version constraints
- `dive-v3-theme.tf.disabled` - Theme configuration (replaced by keycloak/themes/)
- `main.tf.disabled-legacy` - Monolithic main.tf (1,271 lines)
- `main.tf.legacy-all-resources.disabled` - Another monolithic version (1,303 lines)
- `usa-test-users.tf.disabled` - Test users (now in federated-instance module)
- `idp-brokers.tf.disabled` - IdP broker config from federated-instance module

#### Legacy Infrastructure
- `infrastructure/` - Legacy backend.tf, main.tf, outputs.tf, variables.tf
- `instances/` - Legacy instance deployment configuration
- `realms/` - Standalone realm definitions (broker, can, fra, industry, usa)
- `policy-engine/` - Legacy policy engine with environment subdirectories

#### Per-Country Archives
- `archive/` - Contains per-country broker and realm files:
  - `*-broker.tf` files for: can, deu, esp, fra, gbr, ita, nld, pol, usa, industry
  - `*-realm.tf` files for corresponding realms
  - `all-test-users.tf` - Combined test users

#### Other Files
- `keycloak-mfa-flows.tf` - MFA flow configuration (now in realm-mfa module)
- `user-profile-schema.tf` - User profile schema (now in federated-instance)
- `add-webauthn-all-realms.sh` - WebAuthn setup script
- `terraform.tfvars.example` - Example variable values
- `terraform.tfstate` - Root-level state file (orphaned)
- `terraform.tfvars` - Root-level variables (orphaned)

## Why Archived?

These files were archived because:

1. **Modular Architecture**: The new `modules/` structure provides reusable, testable components
2. **Cleaner Directory**: Disabled files cluttered the active terraform directory
3. **Historical Reference**: Kept for reference during migration, can be deleted after pilot
4. **Single Source of Truth**: Active configs now live in `pilot/` and `spoke/` only

## Current Active Structure

```
terraform/
├── pilot/         # USA pilot deployment
├── spoke/         # Generic spoke deployment  
├── modules/       # Reusable Terraform modules
├── countries/     # Per-country tfvars (generated)
└── tfvars-examples/  # Example configurations
```

### unused-modules/

Terraform modules that are not currently used by any active configuration:

- `client-attribute-release/` - Attribute release configuration (reference only)
- `external-idp-oidc/` - External OIDC IdP integration
- `external-idp-saml/` - External SAML IdP integration
- `policy-engine/` - OPA policy engine configuration
- `policy-rollout/` - Policy distribution configuration
- `realm-direct-grant-client/` - Direct grant client module
- `realm-mfa-stepup/` - Step-up MFA with ACR mapping
- `secrets-manager/` - GCP Secret Manager integration
- `shared-mappers/` - Shared protocol mapper definitions

These modules may be useful for future enhancements but are not required for the current pilot.

## DO NOT USE

These archived configurations are **not maintained** and may contain:
- Hardcoded values that violate security policies
- Outdated provider versions
- Incompatible resource definitions

Use the active `pilot/` and `spoke/` configurations instead.
