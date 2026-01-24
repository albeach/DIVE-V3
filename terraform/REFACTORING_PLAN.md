# Terraform Module Refactoring Plan

## Status: Ready for Implementation

This document outlines the complete restructuring of the `terraform/modules/federated-instance` module as part of the Keycloak 26.5.2 modernization effort.

## Current State (Pre-Refactoring)

### File Structure
```
terraform/modules/federated-instance/
├── main.tf (1116 lines)              # Realm, clients, IdPs, protocol mappers (MIXED)
├── acr-amr-session-mappers.tf (184 lines) # ACR/AMR mappers (DUPLICATES MAIN.TF)
├── idp-brokers.tf (290 lines)        # IdP configurations
├── dive-client-scopes.tf (290 lines) # Client scopes
├── variables.tf
├── outputs.tf
└── versions.tf
```

### Identified Duplications

**1. Broker Client AMR Mappers (CRITICAL DUPLICATION)**
- Location 1: `main.tf` lines 641-660 - `amr_mapper` (native oidc-amr-mapper)
- Location 2: `acr-amr-session-mappers.tf` lines 123-145 - `broker_amr_mapper` (DUPLICATE)
- **Action**: Remove from `acr-amr-session-mappers.tf`, keep consolidated version

**2. Broker Client AMR User Attribute Fallback**
- Location 1: `main.tf` lines 662-674 - `amr_user_attribute_fallback`
- Location 2: `acr-amr-session-mappers.tf` lines 147-168 - `broker_amr_user_attribute` (DUPLICATE)
- **Action**: Remove from `acr-amr-session-mappers.tf`, keep consolidated version

**3. Broker Client ACR Mapper**
- Location 1: `main.tf` lines 676-689 - `acr_mapper` (native oidc-acr-mapper)
- Location 2: `acr-amr-session-mappers.tf` lines 170-184 - `broker_acr_user_attribute` (NOT duplicate - different purpose)
- **Action**: Keep both (native session + user attribute fallback)

## Target State (Post-Refactoring)

### New File Structure
```
terraform/modules/federated-instance/
├── main.tf                    # Realm configuration ONLY
├── clients.tf                 # ALL client definitions (broker, backend, federation)
├── idp-brokers.tf            # IdP broker configurations (keep as-is, minimal changes)
├── protocol-mappers.tf        # ALL protocol mappers (consolidated, DRY)
├── client-scopes.tf          # Client scopes (renamed from dive-client-scopes.tf)
├── authentication-flows.tf    # Authentication flows (absorbed from realm-mfa module)
├── realm-settings.tf         # Password policy, i18n, security, events
├── webauthn-policies.tf      # WebAuthn AAL2/AAL3 policies (from realm-mfa)
├── variables.tf
├── outputs.tf
└── versions.tf
```

### Protocol Mappers Consolidation (protocol-mappers.tf)

**Architecture:**
```
1. Core User Attribute Mappers (for broker client)
   - uniqueID
   - clearance
   - countryOfAffiliation
   - acpCOI
   - organization
   - organizationType

2. ACR/AMR Mappers (broker client)
   - ACR native session mapper (oidc-acr-mapper)
   - AMR native session mapper (oidc-amr-mapper)
   - AMR user attribute fallback (for federated users)
   - ACR user attribute fallback (for federated users)

3. Realm Roles Mapper (broker client)
   - Standard realm role mapper

4. Federation Client Mappers (for_each federation_partners)
   - ACR native session mapper
   - AMR native session mapper
   - AMR user attribute fallback
   - ACR user attribute fallback
   - Core attribute mappers (uniqueID, clearance, etc.)

5. IdP Attribute Mappers (for_each IdPs)
   - Incoming claim → Keycloak user attribute mappings
```

### Files to Delete/Archive
```
terraform/modules/federated-instance/acr-amr-session-mappers.tf  # Consolidated into protocol-mappers.tf
terraform/modules/realm-mfa/                                      # Absorbed into federated-instance
  ├── main.tf                                                     # → authentication-flows.tf
  ├── direct-grant.tf                                             # → DELETED (deprecated)
  ├── post-broker-flow.tf                                         # → authentication-flows.tf (simplified)
  ├── simple-post-broker-otp.tf                                   # → authentication-flows.tf
  ├── webauthn-policy.tf                                          # → webauthn-policies.tf
  ├── event-listeners.tf                                          # → DELETED (custom listeners removed)
  └── variables.tf                                                # → merged into main variables.tf
```

## Implementation Steps

### Step 1: Create New Files

**1.1 clients.tf**
Move all client resources from main.tf:
- `keycloak_openid_client.broker_client`
- `keycloak_openid_client.backend_service_account`
- `keycloak_openid_client.incoming_federation` (for_each)

**1.2 protocol-mappers.tf**
Consolidate all mappers with DRY principles:
```hcl
# Define mapper configurations as locals for reusability
locals {
  core_attribute_mappers = {
    uniqueID = {
      user_attribute   = "uniqueID"
      claim_name       = "uniqueID"
      claim_value_type = "String"
    }
    clearance = {
      user_attribute   = "clearance"
      claim_name       = "clearance"
      claim_value_type = "String"
    }
    # ... etc
  }
  
  acr_amr_config = {
    native_session = {
      acr = { claim_name = "acr" }
      amr = { claim_name = "amr" }
    }
    user_attribute_fallback = {
      acr = { user_attribute = "acr", claim_name = "user_acr" }
      amr = { user_attribute = "amr", claim_name = "user_amr", multivalued = true }
    }
  }
}

# Broker client mappers (single source of truth)
resource "keycloak_generic_protocol_mapper" "broker_acr" {
  realm_id        = keycloak_realm.broker.id
  client_id       = keycloak_openid_client.broker_client.id
  name            = "acr (native session)"
  protocol        = "openid-connect"
  protocol_mapper = "oidc-acr-mapper"
  
  config = {
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "true"
    "claim.name"           = "acr"
  }
}

# ... (consolidate all mappers)

# Federation client mappers (DRY with for_each)
resource "keycloak_generic_protocol_mapper" "federation_acr" {
  for_each = var.federation_partners
  
  realm_id        = keycloak_realm.broker.id
  client_id       = keycloak_openid_client.incoming_federation[each.key].id
  name            = "acr (native session)"
  protocol        = "openid-connect"
  protocol_mapper = "oidc-acr-mapper"
  
  config = {
    "id.token.claim"            = "true"
    "access.token.claim"        = "true"
    "userinfo.token.claim"      = "true"
    "introspection.token.claim" = "true"
    "claim.name"                = "acr"
  }
}
```

**1.3 authentication-flows.tf**
Absorb from realm-mfa module:
- Classified-Access-Browser-Flow (AAL1/AAL2/AAL3)
- Simple Post-Broker OTP Flow
- Remove deprecated direct grant flows

**1.4 realm-settings.tf**
Extract from main.tf:
- Password policy
- Internationalization
- Security headers
- Event listeners configuration
- Browser security headers

**1.5 webauthn-policies.tf**
Copy from realm-mfa/webauthn-policy.tf with updates:
- WebAuthn policy (standard - AAL2)
- WebAuthn passwordless policy (AAL3)

### Step 2: Update main.tf
Slim down to ONLY realm configuration:
```hcl
resource "keycloak_realm" "broker" {
  realm             = var.realm_name
  display_name      = var.realm_display_name
  enabled           = true
  login_with_email_allowed = false
  
  # Reference settings from realm-settings.tf via locals
  # Remove all client, mapper, flow definitions
}
```

### Step 3: Update Variables
Consolidate variables from realm-mfa module:
- Remove deprecated variables (direct_grant_enabled, complex_post_broker_flow)
- Add validation for country codes, clearance levels
- Add descriptions for all variables

### Step 4: Testing Checklist
- [ ] `terraform init -upgrade` (refresh provider)
- [ ] `terraform plan -out=refactor.tfplan` (should show resource moves, no recreations)
- [ ] Verify no duplicate resources
- [ ] Verify all mappers present in tokens
- [ ] Test authentication flows (AAL1/AAL2/AAL3)
- [ ] Test federation (Hub ↔ Spoke)

## Benefits of Refactoring

### Maintainability
- Single source of truth for each resource type
- No duplications → easier debugging
- Clear file organization → faster navigation

### DRY Principles
- Reusable mapper configurations in locals
- for_each for federation partners → less code, more scalability
- Consistent naming conventions

### Best Practices
- Lifecycle management (prevent_destroy for critical resources)
- Variable validation
- Output descriptions
- Inline documentation

### Performance
- Smaller token sizes (no duplicate claims)
- Faster Terraform applies (fewer resources)
- Better state management

## Risk Mitigation

### Terraform State Challenges
- Use `terraform state mv` for resource renaming (NOT delete + recreate)
- Backup state before refactoring: `terraform state pull > backup-$(date +%Y%m%d).json`
- Test in isolated environment first

### Zero Downtime
- No resource deletions (only moves and consolidations)
- Validate with `terraform plan` before apply
- Incremental approach: one file at a time

### Rollback Plan
```bash
# If issues discovered during refactoring:
terraform state push backup-YYYYMMDD.json
git checkout terraform/modules/federated-instance/
terraform init
terraform plan  # Verify state matches code
```

## Timeline
- File creation: 2 hours
- Resource migration: 4-6 hours
- Testing: 2 hours
- Documentation: 1 hour
**Total: 1-2 days** (versus 5-7 days for full rewrite)

## Next Steps
1. Create new file structure (clients.tf, protocol-mappers.tf, etc.)
2. Migrate resources with `terraform state mv` where needed
3. Remove duplicate resources
4. Test with `terraform plan`
5. Deploy to Hub
6. Verify no regressions
7. Archive old realm-mfa module
