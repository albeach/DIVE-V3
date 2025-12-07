# Phase 4: Client Attribute Release Module

This Terraform module implements client-specific attribute release policies for DIVE V3 federation partners, in compliance with ADatP-5663 §5.2.

## Overview

The module creates three Keycloak client scopes with different attribute release levels:

1. **Minimal Attributes** - Industry partners (pseudonymous only)
2. **Standard Attributes** - NATO partners (security attributes)
3. **Full Attributes** - FVEY partners (all attributes + PII)

## Usage

```hcl
module "client_attribute_release" {
  source = "./modules/client-attribute-release"

  realm_id = "dive-v3-broker"
}
```

## Client Scopes

### Level 1: Minimal Attributes (Industry)
- `uniqueID` (pseudonymous identifier only)
- No security clearance, no country, no PII
- Use case: Contractor portals, industry partners

### Level 2: Standard Attributes (NATO)
- `uniqueID`
- `clearance`
- `countryOfAffiliation`
- `acpCOI`
- No personal information (givenName, surname, email)
- Use case: NATO coalition partners

### Level 3: Full Attributes (FVEY)
- All standard attributes
- `givenName`, `surname`, `email`
- Complete attribute set
- Use case: Five Eyes intelligence sharing

## Assigning Scopes to Clients

To assign a scope to a specific client:

```hcl
resource "keycloak_openid_client_default_scopes" "industry_client" {
  realm_id  = "dive-v3-broker"
  client_id = "industry-contractor-portal"

  default_scopes = [
    "openid",
    "profile",
    module.client_attribute_release.client_scopes.minimal.name,
  ]
}
```

## Compliance

- **Standard:** ADatP-5663 §5.2 (SP Attribute Requirements)
- **Phase:** 4, Task 4.4
- **Status:** Client-specific attribute release policies implemented

## Testing

1. Apply the Terraform configuration:
```bash
cd terraform/modules/client-attribute-release
terraform init
terraform plan
terraform apply
```

2. Verify scopes in Keycloak Admin Console:
   - Navigate to: Realm Settings → Client Scopes
   - Verify: `minimal-attributes`, `standard-attributes`, `full-attributes`

3. Test token claims:
```bash
# Industry client (minimal)
jwt decode $INDUSTRY_TOKEN
# Expected: sub, uniqueID only

# NATO client (standard)
jwt decode $NATO_TOKEN
# Expected: uniqueID, clearance, countryOfAffiliation, acpCOI

# FVEY client (full)
jwt decode $FVEY_TOKEN
# Expected: All attributes + givenName, surname, email
```

## Integration with Federation Agreements

This module works in conjunction with:
- `backend/src/models/federation-agreement.model.ts`
- `backend/src/middleware/federation-agreement.middleware.ts`

The backend enforces attribute filtering based on the `releaseAttributes` field in each federation agreement.









