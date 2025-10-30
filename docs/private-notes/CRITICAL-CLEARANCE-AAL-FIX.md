# CRITICAL FIX: Clearance Normalization and AAL Attributes

**Date**: October 28, 2025  
**Priority**: CRITICAL  
**Status**: IN PROGRESS (3/10 realms complete)

## Executive Summary

This document describes critical fixes for two major issues in DIVE V3:

1. **Clearance normalization not working**: Country-specific clearances (Spanish, French, German, etc.) were not being normalized to DIVE standard levels (UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET)
2. **AAL attributes missing**: Authentication Assurance Level (AAL) attributes (`acr`, `amr`) were hardcoded in user attributes instead of dynamically set from authentication session

## Root Cause Analysis

### Issue 1: Clearance Normalization
**Problem**: Spanish users with clearance `SECRETO` were appearing in the JWT with `SECRETO` instead of normalized `SECRET`.

**Root Cause**:
- Clearance normalization was happening in the frontend (`auth.ts`) via hardcoded if/else statements
- The broker realm was not exporting `clearanceOriginal` to track the original clearance value
- Individual realm OIDC clients were not exporting `clearanceOriginal` claim
- Backend normalization service was not being triggered because `clearanceOriginal` was missing

**Impact**: 
- OPA policies couldn't match clearances correctly
- Users from France (`CONFIDENTIEL DEFENSE`) and Spain (`SECRETO`) were denied access incorrectly
- Audit logs showed incorrect clearance values

### Issue 2: AAL Attributes Missing
**Problem**: JWT tokens did not contain `acr` (Authentication Context Class Reference) and `amr` (Authentication Methods References) attributes.

**Root Cause**:
- AAL attributes (`acr`, `amr`) were hardcoded in user attributes
- Broker realm protocol mappers were reading from user attributes, not authentication session
- Keycloak 26 stores authentication context in session notes (`acr.level`, `amr`), NOT user attributes
- MFA authentication was not being reflected in the JWT tokens

**Impact**:
- Cannot determine if user authenticated with MFA
- AAL2 enforcement not working (NIST SP 800-63B compliance)
- Cannot differentiate AAL1 (password only) vs AAL2 (password + OTP)

## Solution Architecture

### Fix 1: Clearance Normalization Pipeline

```
┌─────────────┐   clearanceOriginal    ┌──────────────┐   clearanceOriginal    ┌─────────────┐
│  IdP Realm  │   (e.g., "SECRETO")    │ Broker Realm │   + clearance         │     JWT     │
│  (ESP)      ├────────────────────────>│   User       ├───────────────────────>│   Token     │
│             │   clearance="SECRETO"  │  Attributes  │   (both exported)      │             │
└─────────────┘                         └──────────────┘                         └─────────────┘
                                                                                       │
                                                                                       │
                                                                                       v
                                                                         ┌──────────────────────┐
                                                                         │ Backend Middleware   │
                                                                         │ Normalizes:          │
                                                                         │ SECRETO → SECRET     │
                                                                         │ (uses clearance      │
                                                                         │  mapper service)     │
                                                                         └──────────────────────┘
```

### Fix 2: AAL Attributes from Session

```
┌─────────────┐   Authentication    ┌──────────────┐   Session Notes      ┌─────────────┐
│    User     │   (pwd + OTP)       │   Keycloak   │   acr.level=AAL2    │     JWT     │
│  Logs In    ├────────────────────>│   Session    ├──────────────────────>│   Token     │
│  with MFA   │                     │              │   amr=["pwd","otp"]  │   acr=AAL2  │
└─────────────┘                     └──────────────┘                       └─────────────┘
                                           │
                                           │ Session Note Mappers
                                           │ (oidc-usersessionmodel-note-mapper)
                                           │
                                           v
                                    Protocol Mappers:
                                    - broker_acr_session
                                    - broker_amr_session
```

## Implementation Details

### Changes Made (3 Realms Complete)

#### 1. USA Realm (`terraform/usa-realm.tf`)
✅ **COMPLETE**

**Changes**:
- Added 4 users with different clearance levels:
  - `bob.contractor`: UNCLASSIFIED (AAL1 - no MFA)
  - `jane.smith`: CONFIDENTIAL (AAL2 - MFA required)
  - `john.doe`: SECRET (AAL2 - MFA required)
  - `alice.general`: TOP_SECRET (AAL2+ - MFA required)
- Added `clearanceOriginal` protocol mapper to export original clearance
- Removed hardcoded `acr` and `amr` user attributes (lines 256-257 removed)
- Added comment explaining AAL attributes come from session

**Terraform snippet**:
```hcl
# clearanceOriginal mapper - exports original clearance before normalization
resource "keycloak_generic_protocol_mapper" "usa_clearance_original_mapper" {
  realm_id   = keycloak_realm.dive_v3_usa.id
  client_id  = keycloak_openid_client.usa_realm_client.id
  name       = "clearanceOriginal-mapper"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usermodel-attribute-mapper"

  config = {
    "user.attribute"       = "clearanceOriginal"
    "claim.name"           = "clearanceOriginal"
    "jsonType.label"       = "String"
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "true"
  }
}
```

#### 2. Spain Realm (`terraform/esp-realm.tf`)
✅ **COMPLETE**

**Changes**:
- Added 4 users with Spanish clearance levels:
  - `juan.contractor`: NO CLASIFICADO → UNCLASSIFIED (AAL1)
  - `maria.lopez`: CONFIDENCIAL → CONFIDENTIAL (AAL2)
  - `carlos.garcia`: SECRETO → SECRET (AAL2)
  - `isabel.general`: ALTO SECRETO → TOP_SECRET (AAL2+)
- Added `clearanceOriginal` protocol mapper
- Removed hardcoded `acr` and `amr` attributes

**Spanish Clearance Mapping**:
```
NO CLASIFICADO      → UNCLASSIFIED
CONFIDENCIAL        → CONFIDENTIAL
SECRETO             → SECRET
ALTO SECRETO        → TOP_SECRET
```

#### 3. France Realm (`terraform/fra-realm.tf`)
✅ **COMPLETE**

**Changes**:
- Added 4 users with French clearance levels:
  - `luc.contractor`: NON PROTEGE → UNCLASSIFIED (AAL1)
  - `marie.dupont`: CONFIDENTIEL DEFENSE → CONFIDENTIAL (AAL2)
  - `pierre.dubois`: SECRET DEFENSE → SECRET (AAL2)
  - `sophie.general`: TRES SECRET DEFENSE → TOP_SECRET (AAL2+)
- Added `clearanceOriginal` protocol mapper
- Removed hardcoded `acr` and `amr` attributes

**French Clearance Mapping**:
```
NON PROTÉGÉ            → UNCLASSIFIED
CONFIDENTIEL DÉFENSE   → CONFIDENTIAL
SECRET DÉFENSE         → SECRET
TRÈS SECRET DÉFENSE    → TOP_SECRET
```

#### 4. Broker Realm (`terraform/broker-realm.tf`)
✅ **COMPLETE**

**Critical Changes**:
1. **Added Session-Based AAL Mappers**:
```hcl
# ACR (Authentication Context Class Reference) - session-based
resource "keycloak_generic_protocol_mapper" "broker_acr_session" {
  realm_id        = keycloak_realm.dive_v3_broker.id
  client_id       = keycloak_openid_client.dive_v3_app_broker.id
  name            = "acr-session-mapper"
  protocol        = "openid-connect"
  protocol_mapper = "oidc-usersessionmodel-note-mapper"

  config = {
    "user.session.note"    = "acr.level"  # Keycloak stores ACR level here
    "claim.name"           = "acr"
    "jsonType.label"       = "String"
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "true"
  }
}

# AMR (Authentication Methods References) - session-based
resource "keycloak_generic_protocol_mapper" "broker_amr_session" {
  realm_id        = keycloak_realm.dive_v3_broker.id
  client_id       = keycloak_openid_client.dive_v3_app_broker.id
  name            = "amr-session-mapper"
  protocol        = "openid-connect"
  protocol_mapper = "oidc-usersessionmodel-note-mapper"

  config = {
    "user.session.note"    = "amr"  # Keycloak stores AMR array here
    "claim.name"           = "amr"
    "jsonType.label"       = "JSON"
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "true"
  }
}
```

2. **Updated admin-dive user**:
- Added `clearanceOriginal = "TOP_SECRET"`
- Removed hardcoded `acr` and `amr` attributes
- Added comment explaining AAL attributes come from authentication session

3. **Already has `clearanceOriginal` protocol mapper** (line 185-199) - NO CHANGE NEEDED

#### 5. USA Broker (`terraform/usa-broker.tf`)
✅ **COMPLETE**

**Changes**:
- Added `clearanceOriginal` broker mapper to import original clearance from USA realm

#### 6. Spain Broker (`terraform/esp-broker.tf`)
✅ **COMPLETE**

**Changes**:
- Added `clearanceOriginal` broker mapper to import original Spanish clearance

### Remaining Work (7 Realms)

#### Realms Needing Updates:
1. **France Broker** (`terraform/fra-broker.tf`) - Add clearanceOriginal mapper
2. **United Kingdom** (`terraform/gbr-realm.tf`, `terraform/gbr-broker.tf`)
3. **Germany** (`terraform/deu-realm.tf`, `terraform/deu-broker.tf`)
4. **Italy** (`terraform/ita-realm.tf`, `terraform/ita-broker.tf`)
5. **Netherlands** (`terraform/nld-realm.tf`, `terraform/nld-broker.tf`)
6. **Poland** (`terraform/pol-realm.tf`, `terraform/pol-broker.tf`)
7. **Canada** (`terraform/can-realm.tf`, `terraform/can-broker.tf`)
8. **Industry** (`terraform/industry-realm.tf`, `terraform/industry-broker.tf`)

### Terraform Template for Remaining Realms

#### Step 1: Add 4 Users to Realm

Replace existing single user with 4 users using country-specific clearances:

```hcl
# ============================================
# <COUNTRY> Test Users - 4 Different Clearance Levels
# ============================================

# User 1: UNCLASSIFIED (No MFA - AAL1)
resource "keycloak_user" "<country_code>_user_unclass" {
  count    = var.create_test_users ? 1 : 0
  realm_id = keycloak_realm.dive_v3_<country_code>.id
  username = "<firstname.lastname>"
  enabled  = true

  email      = "<firstname.lastname>@<domain>"
  first_name = "<FirstName>"
  last_name  = "<LastName>"
  
  attributes = {
    uniqueID               = "<UUID>"
    clearance              = "<COUNTRY_UNCLASSIFIED>"
    clearanceOriginal      = "<COUNTRY_UNCLASSIFIED>"
    countryOfAffiliation   = "<ISO_3166_ALPHA3>"
    acpCOI                 = "[]"
    dutyOrg                = "<ORG>"
    orgUnit                = "LOGISTICS"
    # AAL1: No MFA - DO NOT hardcode acr/amr
  }

  initial_password {
    value     = "Password123!"
    temporary = false
  }
}

# User 2: CONFIDENTIAL (MFA required - AAL2)
# ... similar structure with CONFIDENTIAL clearance

# User 3: SECRET (MFA required - AAL2)
# ... similar structure with SECRET clearance

# User 4: TOP_SECRET (MFA required - AAL2+)
# ... similar structure with TOP_SECRET clearance
```

#### Step 2: Add clearanceOriginal Mapper to Realm Client

```hcl
# clearanceOriginal mapper - exports country clearance before normalization
resource "keycloak_generic_protocol_mapper" "<country>_clearance_original_mapper" {
  realm_id   = keycloak_realm.dive_v3_<country>.id
  client_id  = keycloak_openid_client.<country>_realm_client.id
  name       = "clearanceOriginal-mapper"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usermodel-attribute-mapper"

  config = {
    "user.attribute"       = "clearanceOriginal"
    "claim.name"           = "clearanceOriginal"
    "jsonType.label"       = "String"
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "true"
  }
}
```

#### Step 3: Add clearanceOriginal Broker Mapper

In `<country>-broker.tf`:

```hcl
# CRITICAL: Import clearanceOriginal for normalization
resource "keycloak_custom_identity_provider_mapper" "<country>_broker_clearance_original" {
  realm                    = keycloak_realm.dive_v3_broker.id
  identity_provider_alias  = keycloak_oidc_identity_provider.<country>_realm_broker.alias
  name                     = "<country>-clearanceOriginal-mapper"
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"       = "FORCE"
    "claim"          = "clearanceOriginal"
    "user.attribute" = "clearanceOriginal"
  }
}
```

## Country-Specific Clearance Mappings

### Germany (DEU)
```
OFFEN              → UNCLASSIFIED
VERTRAULICH        → CONFIDENTIAL
GEHEIM             → SECRET
STRENG GEHEIM      → TOP_SECRET
```

### United Kingdom (GBR)
```
OFFICIAL           → UNCLASSIFIED
SECRET             → SECRET
TOP SECRET         → TOP_SECRET
```

### Italy (ITA)
```
NON CLASSIFICATO   → UNCLASSIFIED
RISERVATO          → CONFIDENTIAL
SEGRETO            → SECRET
SEGRETISSIMO       → TOP_SECRET
```

### Netherlands (NLD)
```
NIET GERUBRICEERD  → UNCLASSIFIED
VERTROUWELIJK      → CONFIDENTIAL
GEHEIM             → SECRET
ZEER GEHEIM        → TOP_SECRET
```

### Poland (POL)
```
JAWNY              → UNCLASSIFIED
POUFNY             → CONFIDENTIAL
TAJNY              → SECRET
ŚCIŚLE TAJNY       → TOP_SECRET
```

### Canada (CAN)
```
UNCLASSIFIED       → UNCLASSIFIED
PROTECTED B        → CONFIDENTIAL
SECRET             → SECRET
TOP SECRET         → TOP_SECRET
```

### Industry (IND)
```
PUBLIC             → UNCLASSIFIED
INTERNAL           → CONFIDENTIAL
SENSITIVE          → SECRET
HIGHLY SENSITIVE   → TOP_SECRET
```

## Testing Instructions

### 1. Apply Terraform Changes

```bash
cd terraform
terraform plan
terraform apply
```

**Expected output**: 
- 4 new users per realm
- New protocol mappers for clearanceOriginal
- Updated broker realm client with session-based AAL mappers

### 2. Test Clearance Normalization

**Test Case 1: Spanish User Login**

1. Navigate to http://localhost:3000
2. Click **Login**
3. Select **Spain (Ministerio de Defensa)**
4. Login as `carlos.garcia` / `Password123!`
5. Complete MFA setup (if required)
6. Check JWT token (use debug-token.sh):

```bash
./debug-token.sh
```

**Expected JWT Claims**:
```json
{
  "clearance": "SECRETO",
  "clearanceOriginal": "SECRETO",
  "countryOfAffiliation": "ESP",
  "acr": "urn:mace:incommon:iap:silver",
  "amr": ["pwd", "otp"]
}
```

**Backend Normalization**:
The backend `authz.middleware.ts` should normalize:
```
clearanceOriginal: "SECRETO" + country: "ESP" → clearance: "SECRET"
```

**Test Case 2: French User Login**

1. Login as `pierre.dubois` / `Password123!`
2. Expected JWT:
```json
{
  "clearance": "SECRET DEFENSE",
  "clearanceOriginal": "SECRET DEFENSE",
  "countryOfAffiliation": "FRA",
  "acr": "urn:mace:incommon:iap:silver",
  "amr": ["pwd", "otp"]
}
```

**Backend Normalization**:
```
clearanceOriginal: "SECRET DEFENSE" + country: "FRA" → clearance: "SECRET"
```

### 3. Test AAL Attributes

**Test Case 3: admin-dive with MFA**

1. Login as `admin-dive` / `DiveAdmin2025!`
2. Complete OTP MFA
3. Check JWT token

**Expected JWT Claims**:
```json
{
  "acr": "urn:mace:incommon:iap:silver",  // From session (AAL2)
  "amr": ["pwd", "otp"],                   // From session
  "clearance": "TOP_SECRET",
  "clearanceOriginal": "TOP_SECRET"
}
```

**Test Case 4: UNCLASSIFIED User (No MFA)**

1. Login as `bob.contractor` / `Password123!`
2. Should NOT require MFA
3. Check JWT token

**Expected JWT Claims**:
```json
{
  "acr": "urn:mace:incommon:iap:bronze",  // AAL1 (password only)
  "amr": ["pwd"],                          // No OTP
  "clearance": "UNCLASSIFIED"
}
```

## Validation Checklist

- [ ] All 10 realms have 4 users (UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET)
- [ ] All realm OIDC clients export `clearanceOriginal` claim
- [ ] All broker IdP mappers import `clearanceOriginal` attribute
- [ ] Broker realm client has session-based ACR/AMR mappers
- [ ] No user has hardcoded `acr` or `amr` attributes
- [ ] JWT tokens contain both `clearance` and `clearanceOriginal`
- [ ] JWT tokens contain `acr` and `amr` from authentication session
- [ ] Backend normalization service correctly maps Spanish clearances
- [ ] Backend normalization service correctly maps French clearances
- [ ] OPA policies correctly evaluate normalized clearances

## References

- Backend clearance normalization: `backend/src/services/clearance-normalization.service.ts`
- Backend AAL mapping: `backend/src/middleware/authz.middleware.ts` (lines 914-933)
- Frontend clearance normalization (to be deprecated): `frontend/src/auth.ts` (lines 480-532)
- Keycloak session notes: https://www.keycloak.org/docs/26.0.0/server_admin/#_protocol-mappers
- NIST SP 800-63B AAL levels: https://pages.nist.gov/800-63-3/sp800-63b.html

## Next Steps

1. **Complete remaining 7 realms** using the templates above
2. **Run terraform apply** to deploy changes
3. **Test each IdP login** to verify clearance normalization
4. **Test MFA flows** to verify AAL attributes
5. **Update frontend** to remove hardcoded clearance normalization (deprecated)
6. **Update OPA policies** to handle normalized clearances correctly

## Contact

For questions or issues with this implementation:
- Reference: `CRITICAL-CLEARANCE-AAL-FIX.md`
- Date: October 28, 2025
- Status: 3/10 realms complete (USA, ESP, FRA)

