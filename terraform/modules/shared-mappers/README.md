# Shared Identity Provider Mappers Module

## Overview

This Terraform module provides a DRY (Don't Repeat Yourself) implementation of canonical attribute mappers for all DIVE V3 Identity Providers.

**Phase 2: Attribute Normalization & Mapper Consolidation**  
**Date**: October 29, 2025

## Purpose

Consolidates 200+ lines of duplicate mapper configuration across 10 IdPs into a single reusable module, ensuring:
- Consistent attribute mapping across all coalition partners
- Enforcement of canonical attribute schema
- Proper sync modes (FORCE vs IMPORT)
- Compliance with NIST SP 800-63B and NATO ACP-240 standards

## Mappers Included

| Attribute | Sync Mode | Type | Required | Notes |
|-----------|-----------|------|----------|-------|
| `uniqueID` | FORCE | String | ✅ | Email or URN identifier |
| `clearance` | FORCE | Enum | ✅ | Normalized clearance level |
| `clearanceOriginal` | FORCE | String | ✅ | Original country clearance (audit trail) |
| `countryOfAffiliation` | FORCE | String (ISO 3166-1 alpha-3) | ✅ | USA, FRA, ESP, etc. |
| `acpCOI` | **IMPORT** | Array\<String\> | ❌ | NATO-COSMIC, FVEY, etc. |
| `dutyOrg` | FORCE | String | ❌ | Organizational affiliation |
| `orgUnit` | FORCE | String | ❌ | Organizational unit |

**Total**: 7 mappers per IdP

## Usage

### Basic Example (USA IdP)

```hcl
module "usa_mappers" {
  source = "./modules/shared-mappers"
  
  realm_id   = keycloak_realm.dive_v3_broker.id
  idp_alias  = keycloak_oidc_identity_provider.usa_realm_broker.alias
  idp_prefix = "usa"
}
```

### Custom uniqueID Claim

```hcl
module "fra_mappers" {
  source = "./modules/shared-mappers"
  
  realm_id        = keycloak_realm.dive_v3_broker.id
  idp_alias       = keycloak_oidc_identity_provider.fra_realm_broker.alias
  idp_prefix      = "fra"
  unique_id_claim = "email"  # Override default
}
```

## Variables

### Required

- `realm_id` (string): Keycloak realm ID (usually `dive-v3-broker`)
- `idp_alias` (string): Identity Provider alias (e.g., `usa-realm-broker`)
- `idp_prefix` (string): Prefix for mapper names (e.g., `usa`, `esp`, `fra`)

### Optional

- `unique_id_claim` (string): JWT claim to map to uniqueID  
  **Default**: `"uniqueID"`  
  **Alternatives**: `"email"`, `"sub"`, custom claim name

## Outputs

- `mapper_count`: Number of mappers created (always 7)
- `idp_alias`: Identity Provider alias these mappers are attached to
- `mappers`: Map of all created mapper IDs (for dependency management)

## Migration from Legacy Configuration

**Before** (200+ lines per IdP):
```hcl
resource "keycloak_custom_identity_provider_mapper" "usa_broker_uniqueid" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.usa_realm_broker.alias
  name                     = "usa-uniqueID-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "uniqueID"
    "user.attribute" = "uniqueID"
  }
}
# ... repeat for 8 more attributes
```

**After** (3 lines per IdP):
```hcl
module "usa_mappers" {
  source     = "./modules/shared-mappers"
  realm_id   = keycloak_realm.dive_v3_broker.id
  idp_alias  = keycloak_oidc_identity_provider.usa_realm_broker.alias
  idp_prefix = "usa"
}
```

**Benefits**:
- ✅ 97% reduction in code duplication
- ✅ Single source of truth for mapper configuration
- ✅ Easier to update all IdPs consistently
- ✅ Reduced risk of mapper drift

## Important Notes

### ACR/AMR Not Included

**ACR** (Authentication Context Class Reference) and **AMR** (Authentication Methods Reference) are **session-based** attributes, NOT user attributes.

They are managed by:
- Authentication flow session notes
- Protocol mappers (session note → token claim)

Previous implementation incorrectly included ACR/AMR as IdP mappers. This has been corrected in Phase 2.

### Sync Mode Strategy

**FORCE Sync** (security-critical attributes):
- `uniqueID`: Always sync latest identity
- `clearance`: Always sync current clearance level
- `clearanceOriginal`: Always sync for audit trail
- `countryOfAffiliation`: Always sync current country
- `dutyOrg`: Always sync organizational changes
- `orgUnit`: Always sync unit changes

**IMPORT Sync** (user-managed attributes):
- `acpCOI`: Only set on first login, preserve user-managed COIs

### Clearance Normalization

The `clearanceOriginal` mapper is **CRITICAL** for audit compliance:
- Preserves original country-specific clearance (e.g., "GEHEIM", "SECRETO")
- Provides full audit trail of clearance transformations
- Required for NATO ACP-240 compliance (90-day audit log)
- Backend normalization service uses this for mappings

## Compliance

This module implements:
- ✅ **NIST SP 800-63B**: Proper attribute handling
- ✅ **NATO ACP-240**: Clearance audit trail (clearanceOriginal)
- ✅ **ISO 3166-1 alpha-3**: Country code standard (USA, FRA, ESP, etc.)

## Testing

After applying this module, verify mappers:

```bash
# Check conformance
./scripts/verify-mapper-conformance.sh

# Manual verification
docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get components \
  -r dive-v3-broker --fields name,providerId,config | grep "usa.*mapper"
```

Expected: 7 mappers per IdP with correct sync modes.

## Support

For issues or questions:
- **Playbook**: `DIVE-V3-IMPLEMENTATION-PLAYBOOK-PART-1.md` (Phase 2)
- **Completion Report**: `PHASE-2-COMPLETION-REPORT.md` (when complete)
- **Attribute Schema**: `FINAL-CLEARANCE-NORMALIZATION-SUMMARY.md`

---

**Module Version**: 1.0.0  
**Created**: Phase 2 - October 29, 2025  
**Terraform**: >= 1.0  
**Keycloak Provider**: >= 5.0

