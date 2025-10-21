# DIVE V3 Attribute Schema Specification

**Version**: 1.0  
**Date**: October 20, 2025  
**Status**: Official Schema Definition  
**Authority**: DIVE V3 Technical Team  
**Purpose**: Canonical attribute schema for federated identity and authorization

---

## Executive Summary

This document defines the **canonical attribute schema** for DIVE V3, ensuring consistent attribute naming, data types, and mappings across all identity providers (IdPs), protocols (SAML/OIDC), and consuming services (Frontend, Backend API, KAS, OPA).

**Key Goals**:
1. **Consistency**: Same attribute names across all 4 IdPs (U.S., France, Canada, Industry)
2. **Interoperability**: Clear mappings between SAML and OIDC claim names
3. **Compliance**: Alignment with NATO ACP-240 Section 2.1 requirements
4. **Governance**: Version-controlled schema with change management process

---

## Table of Contents

1. [Core Identity Attributes](#1-core-identity-attributes)
2. [Authentication Context Attributes](#2-authentication-context-attributes)
3. [Resource Attributes](#3-resource-attributes)
4. [Context Attributes](#4-context-attributes)
5. [SAML Attribute Mappings](#5-saml-attribute-mappings)
6. [OIDC Claim Mappings](#6-oidc-claim-mappings)
7. [Data Type Specifications](#7-data-type-specifications)
8. [Enrichment Rules](#8-enrichment-rules)
9. [Validation Rules](#9-validation-rules)
10. [Version Control & Change Management](#10-version-control--change-management)

---

## 1. Core Identity Attributes

These attributes **uniquely identify** and **authorize** users across the coalition.

### 1.1 uniqueID

**Definition**: Globally unique identifier for the user

**Data Type**: String (RFC 4122 UUID format)

**Required**: ✅ Yes (mandatory)

**ACP-240 Reference**: Section 2.1 - Unique Identifier

**Format**:
```
UUID v4: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
Example: 550e8400-e29b-41d4-a716-446655440000
```

**OIDC Claim Name**: `uniqueID`

**SAML Attribute Name**: `uniqueID` (Basic format)

**SAML Attribute URN**: `urn:oid:0.9.2342.19200300.100.1.1` (uid) - optional alternate mapping

**Validation**:
- ✅ Must match RFC 4122 UUID format
- ✅ Must be globally unique across all coalition partners
- ❌ Must NOT be email address (deprecated pattern)
- ❌ Must NOT be username (not globally unique)

**Current Status**: ⚠️ PARTIAL COMPLIANCE (Gap #5)
- Test users use email format (`john.doe@mil`)
- Production requires UUID format enforcement

**Migration Path**:
```typescript
// Generate UUID v4 for new users
import { v4 as uuidv4 } from 'uuid';
const uniqueID = uuidv4();  // "550e8400-e29b-41d4-a716-446655440000"

// Migrate existing email-based IDs
// Map email → UUID, store in identity mapping table
```

---

### 1.2 clearance

**Definition**: User's security clearance level

**Data Type**: Enum (String)

**Required**: ✅ Yes (mandatory)

**ACP-240 Reference**: Section 2.1 - Clearance Level (STANAG 4774)

**Allowed Values**:
```
- UNCLASSIFIED
- CONFIDENTIAL
- SECRET
- TOP_SECRET
```

**OIDC Claim Name**: `clearance`

**SAML Attribute Name**: `clearance` (Basic format)

**SAML Attribute URN**: `urn:nato:stanag:4774:clearance` (preferred)

**Validation**:
- ✅ Must be one of the 4 allowed values (case-sensitive)
- ❌ Must NOT be null or empty string
- ❌ Must NOT use alternate spellings (e.g., "Top Secret" vs "TOP_SECRET")

**Cross-National Harmonization**:

| Nation | Native Clearance | Normalized to DIVE |
|--------|-----------------|-------------------|
| USA | CONFIDENTIAL | CONFIDENTIAL |
| USA | SECRET | SECRET |
| USA | TOP SECRET | TOP_SECRET |
| France | CONFIDENTIEL DEFENSE | CONFIDENTIAL |
| France | SECRET DEFENSE | SECRET |
| France | TRES SECRET DEFENSE | TOP_SECRET |
| UK | CONFIDENTIAL | CONFIDENTIAL |
| UK | SECRET | SECRET |
| UK | TOP SECRET | TOP_SECRET |
| Canada | CONFIDENTIAL | CONFIDENTIAL |
| Canada | SECRET | SECRET |
| Canada | TOP SECRET | TOP_SECRET |

**Enrichment Rule**: Default to `UNCLASSIFIED` if missing (for industry users only)

**Current Status**: ✅ COMPLIANT
- All test users have valid clearance values
- Backend validates against enum

---

### 1.3 countryOfAffiliation

**Definition**: User's country of affiliation (citizenship or employment)

**Data Type**: String (ISO 3166-1 alpha-3 format)

**Required**: ✅ Yes (mandatory)

**ACP-240 Reference**: Section 2.1 - Country of Affiliation

**Format**: ISO 3166-1 alpha-3 (3-letter country codes)

**OIDC Claim Name**: `countryOfAffiliation`

**SAML Attribute Name**: `countryOfAffiliation` (Basic format)

**SAML Attribute URN**: `urn:oid:2.5.4.6` (c - country) - alternate mapping

**Allowed Values** (Coalition Partners):
```
USA - United States
GBR - United Kingdom
FRA - France
CAN - Canada
DEU - Germany
AUS - Australia
NZL - New Zealand
ITA - Italy
ESP - Spain
```

**Validation**:
- ✅ Must be ISO 3166-1 alpha-3 format (3 uppercase letters)
- ✅ Must be from approved coalition partner list
- ❌ Must NOT use alpha-2 codes (US, GB, FR)
- ❌ Must NOT use numeric codes (840, 826, 250)

**Enrichment Rule**: Infer from email domain for industry users
```typescript
// Email domain → Country mapping
const domainToCountry: Record<string, string> = {
  'mil': 'USA',
  'gov': 'USA',
  'defense.gouv.fr': 'FRA',
  'forces.gc.ca': 'CAN',
  'mod.uk': 'GBR',
  'lockheed.com': 'USA',
  'bae.com': 'GBR'
};
```

**Current Status**: ✅ COMPLIANT
- All test users have ISO 3166-1 alpha-3 codes
- Backend validates against allowed list

---

### 1.4 acpCOI

**Definition**: Community of Interest memberships

**Data Type**: Array of Strings

**Required**: ⚠️ Optional (but recommended)

**ACP-240 Reference**: Section 2.1 - Organization/Unit & Role (COI membership)

**Format**: Array of COI identifiers

**OIDC Claim Name**: `acpCOI`

**SAML Attribute Name**: `acpCOI` (multi-valued attribute)

**SAML Attribute URN**: `urn:dive:coi` (custom URN)

**Allowed Values** (Predefined COIs):
```
- NATO-COSMIC         # NATO Cosmic Top Secret
- FVEY                # Five Eyes (USA, GBR, CAN, AUS, NZL)
- CAN-US              # Canada-US Bilateral
- FRA-US              # France-US Bilateral
- GBR-US              # UK-US Bilateral
- US-ONLY             # US National only
- NATO-RESTRICTED     # NATO Restricted
```

**Validation**:
- ✅ Must be an array (can be empty `[]`)
- ✅ Each element must be from allowed COI list
- ❌ Must NOT be null or string (must be array)
- ❌ Must NOT contain duplicate values

**Enrichment Rule**: Default to empty array `[]` if missing

**Keycloak Encoding Issue**:
```typescript
// Keycloak may double-encode as JSON string
// Backend must handle both formats:

// Format 1 (ideal): ["FVEY", "NATO-COSMIC"]
// Format 2 (Keycloak): "[\"FVEY\",\"NATO-COSMIC\"]"

// Backend parsing logic (authz.middleware.ts lines 589-620)
if (Array.isArray(decodedToken.acpCOI)) {
    if (typeof decodedToken.acpCOI[0] === 'string') {
        try {
            const parsed = JSON.parse(decodedToken.acpCOI[0]);
            if (Array.isArray(parsed)) {
                acpCOI = parsed;  // Double-encoded, parse it
            } else {
                acpCOI = decodedToken.acpCOI;  // Normal array
            }
        } catch {
            acpCOI = decodedToken.acpCOI;  // Parse failed, use as-is
        }
    } else {
        acpCOI = decodedToken.acpCOI;  // Normal array
    }
}
```

**Current Status**: ✅ COMPLIANT
- All test users have valid COI arrays
- Backend handles double-encoding issue

---

### 1.5 dutyOrg

**Definition**: User's duty organization (military branch, agency, company)

**Data Type**: String

**Required**: ⚠️ Optional (but recommended for org-specific policies)

**ACP-240 Reference**: Section 2.1 - Organization/Unit & Role

**Format**: Structured organization identifier

**OIDC Claim Name**: `dutyOrg`

**SAML Attribute Name**: `dutyOrg` (Basic format)

**SAML Attribute URN**: `urn:oid:2.5.4.10` (o - organization)

**Examples**:
```
US_ARMY
US_NAVY
US_AIR_FORCE
US_MARINE_CORPS
FR_DEFENSE_MINISTRY
UK_MOD
CAN_FORCES
LOCKHEED_MARTIN
BAE_SYSTEMS
```

**Validation**:
- ✅ Must be alphanumeric with underscores only
- ✅ Recommended format: `{COUNTRY}_{ORG_NAME}`
- ❌ Must NOT contain spaces or special characters

**Enrichment Rule**: Infer from email domain or leave empty

**Current Status**: ❌ **GAP #4** (NOT IMPLEMENTED)
- No test users have `dutyOrg` attribute
- Keycloak protocol mappers missing
- Required for organization-specific policies (e.g., "only US_NAVY can access submarine plans")

**Implementation Required**: See Gap #4 remediation (1 hour effort)

---

### 1.6 orgUnit

**Definition**: User's organizational unit (division, department, team)

**Data Type**: String

**Required**: ⚠️ Optional

**ACP-240 Reference**: Section 2.1 - Organization/Unit & Role

**Format**: Organizational unit identifier

**OIDC Claim Name**: `orgUnit`

**SAML Attribute Name**: `orgUnit` (Basic format)

**SAML Attribute URN**: `urn:oid:2.5.4.11` (ou - organizational unit)

**Examples**:
```
CYBER_DEFENSE
INTELLIGENCE
LOGISTICS
OPERATIONS
RESEARCH_DEV
```

**Validation**:
- ✅ Must be alphanumeric with underscores only
- ❌ Must NOT contain spaces or special characters

**Enrichment Rule**: Leave empty if not provided by IdP

**Current Status**: ❌ **GAP #4** (NOT IMPLEMENTED)
- No test users have `orgUnit` attribute
- Keycloak protocol mappers missing

---

## 2. Authentication Context Attributes

These attributes describe **how** the user authenticated (multi-factor, device, etc.) per NIST SP 800-63B/C.

### 2.1 acr

**Definition**: Authentication Context Class Reference (NIST AAL level)

**Data Type**: String (URI format)

**Required**: ⚠️ Optional (but enforced for classified resources)

**NIST Reference**: SP 800-63C (Federation and Assertions)

**Format**: URN or URL indicating authentication assurance level

**OIDC Claim Name**: `acr`

**SAML Attribute Name**: `AuthnContextClassRef` (in SAML Assertion)

**Allowed Values** (InCommon IAP Mapping):
```
urn:mace:incommon:iap:bronze  → AAL1 (password only)
urn:mace:incommon:iap:silver  → AAL2 (MFA - password + OTP/SMS)
urn:mace:incommon:iap:gold    → AAL3 (MFA - password + PIV/CAC/Hardware token)
```

**AAL Level Mapping**:

| ACR Value | AAL Level | Factors Required | Use Cases |
|-----------|-----------|------------------|-----------|
| bronze | AAL1 | Password only | UNCLASSIFIED resources |
| silver | AAL2 | Password + OTP/SMS | CONFIDENTIAL, SECRET resources |
| gold | AAL3 | Password + PIV/CAC | TOP_SECRET resources |

**Validation**:
- ✅ Classified resources **require** AAL2+ (`silver` or `gold`)
- ✅ Backend validates ACR before authorization (`authz.middleware.ts` lines 248-271)
- ❌ Must reject AAL1 (`bronze`) for classified resources

**Current Status**: ⚠️ **GAP #6** (PARTIAL COMPLIANCE)
- Test users have hardcoded ACR values
- Keycloak does NOT dynamically set ACR based on authentication method
- Production requires Keycloak SPI to detect MFA and enrich ACR

**Implementation Required**: See Gap #6 remediation (8-10 hours effort)

---

### 2.2 amr

**Definition**: Authentication Methods Reference (list of authentication factors used)

**Data Type**: Array of Strings

**Required**: ⚠️ Optional (but enforced for classified resources)

**NIST Reference**: SP 800-63B (Authentication and Lifecycle Management)

**Format**: Array of authentication method identifiers

**OIDC Claim Name**: `amr`

**SAML Attribute Name**: N/A (encoded in SAML AuthnContext)

**Allowed Values** (RFC 8176):
```
pwd          # Password
otp          # One-time password (TOTP/HOTP)
sms          # SMS-based OTP
hwk          # Proof-of-possession of hardware key
swk          # Proof-of-possession of software key
pin          # PIN
smartcard    # Smartcard (PIV/CAC)
mfa          # Multiple-factor authentication performed
```

**Common Combinations**:
```
["pwd"]                    # AAL1 - Password only
["pwd", "otp"]             # AAL2 - Password + Authenticator app
["pwd", "sms"]             # AAL2 - Password + SMS code
["pwd", "smartcard"]       # AAL3 - Password + PIV/CAC
```

**Validation**:
- ✅ Classified resources **require** 2+ factors (`amr.length >= 2`)
- ✅ Backend validates AMR count (`authz.middleware.ts` lines 273-283)
- ❌ Must reject single-factor for classified resources

**Current Status**: ⚠️ **GAP #6** (PARTIAL COMPLIANCE)
- Test users have hardcoded AMR values
- Keycloak does NOT dynamically populate AMR
- Production requires Keycloak SPI to track authentication methods

---

### 2.3 auth_time

**Definition**: Time of authentication (Unix timestamp)

**Data Type**: Number (Unix timestamp in seconds)

**Required**: ⚠️ Optional (but recommended for freshness checks)

**NIST Reference**: SP 800-63C (FAL2 - Federation Assurance Level 2)

**Format**: Unix timestamp (seconds since epoch)

**OIDC Claim Name**: `auth_time`

**SAML Attribute Name**: `AuthnInstant` (in SAML Assertion)

**Example**:
```
1697817600  # October 20, 2024 12:00:00 UTC
```

**Validation**:
- ✅ Classified resources may require re-authentication if `auth_time` > 1 hour old
- ⚠️ Recommended: Force re-auth if token issued >1 hour ago for TOP_SECRET

**Current Status**: ✅ COMPLIANT
- Keycloak automatically tracks `AUTH_TIME` in session
- Protocol mapper configured (`terraform/main.tf` lines 285-300)

---

## 3. Resource Attributes

These attributes describe **resources** (documents, files, data) that users want to access.

### 3.1 resourceId

**Definition**: Unique identifier for the resource

**Data Type**: String

**Required**: ✅ Yes (mandatory)

**Format**: Alphanumeric with hyphens

**Example**: `doc-nato-ops-001`, `file-12345-abcdef`

**Validation**:
- ✅ Must be unique across all resources
- ✅ Should be URL-safe (no spaces, special characters)

---

### 3.2 classification

**Definition**: Security classification level of the resource

**Data Type**: Enum (String)

**Required**: ✅ Yes (mandatory)

**Allowed Values**: Same as user `clearance` attribute
```
- UNCLASSIFIED
- CONFIDENTIAL
- SECRET
- TOP_SECRET
```

**Validation**:
- ✅ Must match one of the 4 classification levels
- ✅ User clearance must be >= resource classification for access

---

### 3.3 releasabilityTo

**Definition**: Countries authorized to access the resource

**Data Type**: Array of Strings (ISO 3166-1 alpha-3)

**Required**: ✅ Yes (mandatory)

**Format**: Array of country codes

**Example**: `["USA", "GBR", "CAN"]`

**Validation**:
- ✅ Must be non-empty array (empty = deny all)
- ✅ Each element must be valid ISO 3166-1 alpha-3 code
- ✅ User's `countryOfAffiliation` must be in `releasabilityTo` for access

---

### 3.4 COI

**Definition**: Communities of Interest required to access the resource

**Data Type**: Array of Strings

**Required**: ⚠️ Optional (empty array if not COI-restricted)

**Format**: Array of COI identifiers

**Example**: `["FVEY"]`, `["NATO-COSMIC"]`

**Validation**:
- ✅ Can be empty array `[]` (no COI restriction)
- ✅ If non-empty, user's `acpCOI` must intersect with resource `COI`

---

### 3.5 creationDate

**Definition**: Resource creation date (for embargo enforcement)

**Data Type**: String (ISO 8601 format)

**Required**: ⚠️ Optional

**Format**: `YYYY-MM-DDTHH:mm:ss.sssZ`

**Example**: `2025-10-20T14:30:00.000Z`

**Validation**:
- ✅ If present, OPA may enforce embargo (e.g., "no access until 30 days after creation")
- ⚠️ Clock skew tolerance: ±5 minutes

---

### 3.6 encrypted

**Definition**: Whether the resource is encrypted (requires KAS for decryption)

**Data Type**: Boolean

**Required**: ✅ Yes (defaults to `false` if missing)

**Values**: `true` or `false`

**Validation**:
- ✅ If `true`, OPA must return KAS obligation
- ✅ Frontend must call KAS to get DEK before decryption

---

## 4. Context Attributes

These attributes describe the **request context** (time, IP, device, etc.) for dynamic authorization.

### 4.1 currentTime

**Definition**: Current time of the request

**Data Type**: String (ISO 8601 format)

**Required**: ✅ Yes (auto-populated by PEP)

**Format**: `YYYY-MM-DDTHH:mm:ss.sssZ`

**Example**: `2025-10-20T14:30:00.123Z`

---

### 4.2 sourceIP

**Definition**: Client IP address

**Data Type**: String (IPv4 or IPv6)

**Required**: ✅ Yes (auto-populated by PEP)

**Example**: `192.168.1.100`, `2001:db8::1`

---

### 4.3 deviceCompliant

**Definition**: Whether the client device meets security requirements

**Data Type**: Boolean

**Required**: ⚠️ Optional (defaults to `true` for pilot)

**Values**: `true` or `false`

**Future Enhancement**: Integrate with device compliance service (e.g., Intune, Jamf)

---

### 4.4 requestId

**Definition**: Unique identifier for the request (for audit correlation)

**Data Type**: String (UUID or auto-generated ID)

**Required**: ✅ Yes (auto-populated by middleware)

**Example**: `req-abc-12345-xyz`

---

## 5. SAML Attribute Mappings

Mapping from **SAML attribute names** to **DIVE canonical names**.

| DIVE Canonical Name | SAML Attribute Name | SAML Attribute URN (Preferred) | Notes |
|---------------------|---------------------|-------------------------------|-------|
| uniqueID | uniqueID | `urn:oid:0.9.2342.19200300.100.1.1` | uid attribute |
| email | email | `urn:oid:0.9.2342.19200300.100.1.3` | mail attribute |
| firstName | firstName | `urn:oid:2.5.4.42` | givenName |
| lastName | lastName | `urn:oid:2.5.4.4` | sn (surname) |
| clearance | clearance | `urn:nato:stanag:4774:clearance` | Custom URN |
| countryOfAffiliation | countryOfAffiliation | `urn:oid:2.5.4.6` | c (country) |
| acpCOI | acpCOI | `urn:dive:coi` | Custom multi-valued |
| **dutyOrg** | **dutyOrg** | **`urn:oid:2.5.4.10`** | **o (organization)** - **GAP #4** |
| **orgUnit** | **orgUnit** | **`urn:oid:2.5.4.11`** | **ou (organizational unit)** - **GAP #4** |

**Keycloak SAML IdP Broker Configuration**:
```terraform
# Example for France SAML IdP (terraform/main.tf)

resource "keycloak_custom_identity_provider_mapper" "france_dutyorg_mapper" {
  realm                    = keycloak_realm.dive_v3.id
  identity_provider_alias  = "france-idp"
  name                     = "france-dutyOrg-mapper"
  identity_provider_mapper = "saml-user-attribute-idp-mapper"
  
  extra_config = {
    "syncMode"       = "INHERIT"
    "attribute.name" = "urn:oid:2.5.4.10"  # SAML organization attribute
    "user.attribute" = "dutyOrg"           # Keycloak user attribute
  }
}
```

---

## 6. OIDC Claim Mappings

Mapping from **IdP OIDC claims** to **DIVE canonical names**.

| DIVE Canonical Name | OIDC Claim Name (IdP) | OIDC Claim Name (JWT) | Notes |
|---------------------|------------------------|----------------------|-------|
| uniqueID | uniqueID | uniqueID | Preferred |
| uniqueID (alt) | sub | sub | Fallback if uniqueID missing |
| email | email | email | Standard OIDC |
| firstName | given_name | given_name | Standard OIDC |
| lastName | family_name | family_name | Standard OIDC |
| clearance | clearance | clearance | Custom claim |
| countryOfAffiliation | countryOfAffiliation | countryOfAffiliation | Custom claim |
| acpCOI | acpCOI | acpCOI | Custom claim (array) |
| **dutyOrg** | **dutyOrg** | **dutyOrg** | **Custom claim - GAP #4** |
| **orgUnit** | **orgUnit** | **orgUnit** | **Custom claim - GAP #4** |
| acr | acr | acr | Standard OIDC (auth context) |
| amr | amr | amr | Standard OIDC (auth methods) |
| auth_time | auth_time | auth_time | Standard OIDC |

**Keycloak OIDC Client Protocol Mappers**:
```terraform
# Example for dive-v3-client (terraform/main.tf)

resource "keycloak_generic_protocol_mapper" "dutyorg_mapper" {
  realm_id   = keycloak_realm.dive_v3.id
  client_id  = keycloak_openid_client.dive_v3_app.id
  name       = "dutyOrg"
  protocol   = "openid-connect"
  protocol_mapper = "oidc-usermodel-attribute-mapper"

  config = {
    "user.attribute"       = "dutyOrg"
    "claim.name"           = "dutyOrg"
    "jsonType.label"       = "String"
    "id.token.claim"       = "true"
    "access.token.claim"   = "true"
    "userinfo.token.claim" = "true"
  }
}
```

---

## 7. Data Type Specifications

### 7.1 String Types

| Attribute | Max Length | Character Set | Format |
|-----------|-----------|---------------|--------|
| uniqueID | 36 | UUID: [0-9a-f-] | `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx` |
| email | 255 | RFC 5322 | `user@domain.tld` |
| clearance | 20 | UPPERCASE, UNDERSCORE | `TOP_SECRET` |
| countryOfAffiliation | 3 | UPPERCASE [A-Z] | `USA` |
| dutyOrg | 100 | UPPERCASE, UNDERSCORE | `US_ARMY` |
| orgUnit | 100 | UPPERCASE, UNDERSCORE | `CYBER_DEFENSE` |

### 7.2 Array Types

| Attribute | Element Type | Max Elements | Can Be Empty? |
|-----------|-------------|--------------|---------------|
| acpCOI | String | 10 | Yes `[]` |
| amr | String (enum) | 5 | No (at least 1 for AAL1+) |
| releasabilityTo | String (ISO 3166-1) | 20 | No (must have ≥1 country) |
| COI | String | 10 | Yes `[]` |

### 7.3 Numeric Types

| Attribute | Type | Range | Units |
|-----------|------|-------|-------|
| auth_time | Integer (Unix timestamp) | 0 to 2^31-1 | Seconds since epoch |
| exp | Integer (Unix timestamp) | 0 to 2^31-1 | Seconds since epoch |
| iat | Integer (Unix timestamp) | 0 to 2^31-1 | Seconds since epoch |

### 7.4 Boolean Types

| Attribute | True | False | Default |
|-----------|------|-------|---------|
| encrypted | true | false | false |
| deviceCompliant | true | false | true |
| authenticated | true | false | false |

---

## 8. Enrichment Rules

When IdP doesn't provide an attribute, backend may **enrich** with default or inferred value.

| Attribute | Enrichment Rule | Applies To |
|-----------|----------------|------------|
| **clearance** | Default to `UNCLASSIFIED` | Industry users only |
| **countryOfAffiliation** | Infer from email domain | Industry users with company email |
| **acpCOI** | Default to `[]` (empty array) | All users if missing |
| **dutyOrg** | Infer from email domain or leave empty | Industry users (optional) |
| **orgUnit** | Leave empty if not provided | All users (optional) |
| **uniqueID** | Use `preferred_username` or `sub` as fallback | Legacy users (migrate to UUID) |

**Enrichment Logic Example**:
```typescript
// backend/src/middleware/enrichment.middleware.ts

// Country inference from email domain
const emailDomain = email.split('@')[1];
if (emailDomain === 'lockheed.com' || emailDomain === 'lmco.com') {
    countryOfAffiliation = 'USA';
    dutyOrg = 'LOCKHEED_MARTIN';
} else if (emailDomain === 'defense.gouv.fr') {
    countryOfAffiliation = 'FRA';
    dutyOrg = 'FR_DEFENSE_MINISTRY';
}

// Clearance default
if (!clearance && emailDomain.endsWith('.com')) {
    clearance = 'UNCLASSIFIED';  // Contractors default to UNCLASSIFIED
}
```

---

## 9. Validation Rules

### 9.1 Required Attribute Validation

**OPA Policy** (`policies/fuel_inventory_abac_policy.rego` lines 49-93):
```rego
# Check 2: Missing Required Attributes
is_missing_required_attributes := msg if {
  not input.subject.uniqueID
  msg := "Missing required attribute: uniqueID"
}

is_missing_required_attributes := msg if {
  not input.subject.clearance
  msg := "Missing required attribute: clearance"
}

is_missing_required_attributes := msg if {
  not input.subject.countryOfAffiliation
  msg := "Missing required attribute: countryOfAffiliation"
}
```

### 9.2 Empty String Validation

**OPA Policy** (lines 80-93):
```rego
# Check 2b: Empty String Attributes
is_missing_required_attributes := msg if {
  input.subject.uniqueID == ""
  msg := "Empty uniqueID is not allowed"
}

is_missing_required_attributes := msg if {
  input.subject.clearance == ""
  msg := "Empty clearance is not allowed"
}

is_missing_required_attributes := msg if {
  input.subject.countryOfAffiliation == ""
  msg := "Empty countryOfAffiliation is not allowed"
}
```

### 9.3 Country Code Validation

**OPA Policy** (lines 95-137):
```rego
# Check 2c: Invalid Country Codes (ISO 3166-1 alpha-3)
valid_countries := {
  "USA", "GBR", "FRA", "CAN", "DEU", 
  "AUS", "NZL", "ITA", "ESP", "NOR"
}

is_missing_required_attributes := msg if {
  input.subject.countryOfAffiliation
  input.subject.countryOfAffiliation != ""
  not valid_countries[input.subject.countryOfAffiliation]
  msg := sprintf("Invalid country code: %s (must be ISO 3166-1 alpha-3)", [input.subject.countryOfAffiliation])
}
```

### 9.4 UUID Format Validation (Gap #5 - To Be Implemented)

**Required Validation** (not yet implemented):
```typescript
// backend/src/middleware/uuid-validation.middleware.ts

import { validate as isValidUUID } from 'uuid';

export const validateUUID = (req: Request, res: Response, next: NextFunction): void => {
    const uniqueID = (req as any).user?.uniqueID;
    
    if (!uniqueID) {
        res.status(401).json({ error: 'Unauthorized', message: 'Missing uniqueID' });
        return;
    }
    
    if (!isValidUUID(uniqueID)) {
        res.status(400).json({
            error: 'Bad Request',
            message: 'uniqueID must be RFC 4122 UUID format',
            details: {
                received: uniqueID,
                expected: '550e8400-e29b-41d4-a716-446655440000',
                reference: 'ACP-240 Section 2.1'
            }
        });
        return;
    }
    
    next();
};
```

---

## 10. Version Control & Change Management

### Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | Oct 20, 2025 | Initial schema definition | DIVE V3 Team |
| 1.1 | TBD | Add dutyOrg/orgUnit (Gap #4) | TBD |
| 1.2 | TBD | UUID validation enforcement (Gap #5) | TBD |
| 1.3 | TBD | ACR/AMR enrichment (Gap #6) | TBD |

### Change Management Process

1. **Propose Change**: Create GitHub issue with schema change proposal
2. **Review**: Technical team reviews for compatibility and compliance
3. **Approve**: Requires 2 approvals from team leads
4. **Implement**: Update Terraform, backend validators, OPA policies
5. **Test**: Run full test suite (809+ tests)
6. **Deploy**: Staged rollout (dev → staging → production)
7. **Document**: Update this specification + CHANGELOG

### Breaking vs Non-Breaking Changes

**Non-Breaking Changes** (no migration needed):
- Adding new optional attributes
- Expanding allowed value sets (e.g., adding new COI)
- Adding enrichment rules for new IdPs

**Breaking Changes** (requires migration):
- Changing data types (e.g., String → Array)
- Renaming attributes
- Removing attributes
- Changing validation rules (stricter requirements)

**Migration Strategy for Breaking Changes**:
1. **Dual-Write Phase**: Support both old and new attribute names
2. **Migration Phase**: Convert existing data to new format
3. **Dual-Read Phase**: Accept both formats, prefer new
4. **Deprecation Phase**: Mark old format deprecated (6 months notice)
5. **Removal Phase**: Remove old format support

---

## Appendix A: Complete Attribute Reference Table

| Attribute | Type | Required | Source | Validation | Status |
|-----------|------|----------|--------|------------|--------|
| **Identity** |
| uniqueID | String (UUID) | Yes | IdP | RFC 4122 format | ⚠️ Gap #5 |
| clearance | Enum | Yes | IdP | 4 levels | ✅ Compliant |
| countryOfAffiliation | String (ISO 3166-1) | Yes | IdP | Alpha-3 codes | ✅ Compliant |
| acpCOI | Array[String] | Optional | IdP | Predefined COIs | ✅ Compliant |
| dutyOrg | String | Optional | IdP | Alphanumeric+_ | ❌ Gap #4 |
| orgUnit | String | Optional | IdP | Alphanumeric+_ | ❌ Gap #4 |
| **Authentication** |
| acr | String (URN) | Optional | IdP/Keycloak | AAL mapping | ⚠️ Gap #6 |
| amr | Array[String] | Optional | IdP/Keycloak | RFC 8176 | ⚠️ Gap #6 |
| auth_time | Number (Unix) | Optional | Keycloak | Timestamp | ✅ Compliant |
| **Profile** |
| email | String | Optional | IdP | RFC 5322 | ✅ Compliant |
| firstName | String | Optional | IdP | - | ✅ Compliant |
| lastName | String | Optional | IdP | - | ✅ Compliant |
| **Resource** |
| resourceId | String | Yes | Backend/DB | Alphanumeric+- | ✅ Compliant |
| classification | Enum | Yes | Backend/DB | 4 levels | ✅ Compliant |
| releasabilityTo | Array[String] | Yes | Backend/DB | ISO 3166-1 | ✅ Compliant |
| COI | Array[String] | Optional | Backend/DB | Predefined COIs | ✅ Compliant |
| creationDate | String (ISO 8601) | Optional | Backend/DB | ISO format | ✅ Compliant |
| encrypted | Boolean | Yes | Backend/DB | true/false | ✅ Compliant |
| **Context** |
| currentTime | String (ISO 8601) | Yes | PEP | ISO format | ✅ Compliant |
| sourceIP | String | Yes | PEP | IPv4/IPv6 | ✅ Compliant |
| deviceCompliant | Boolean | Optional | PEP | true/false | ✅ Compliant |
| requestId | String | Yes | PEP | UUID/Generated | ✅ Compliant |

---

## Appendix B: Keycloak Test User Attribute Examples

### U.S. User (Direct Keycloak User)

```json
{
  "username": "testuser-us",
  "email": "john.doe@army.mil",
  "firstName": "John",
  "lastName": "Doe",
  "attributes": {
    "uniqueID": "550e8400-e29b-41d4-a716-446655440000",
    "clearance": "SECRET",
    "countryOfAffiliation": "USA",
    "acpCOI": "[\"NATO-COSMIC\",\"FVEY\"]",
    "dutyOrg": "US_ARMY",
    "orgUnit": "CYBER_DEFENSE",
    "acr": "urn:mace:incommon:iap:silver",
    "amr": "[\"pwd\",\"otp\"]"
  }
}
```

### France User (SAML Federated)

```json
{
  "username": "testuser-fra",
  "email": "pierre.dubois@defense.gouv.fr",
  "firstName": "Pierre",
  "lastName": "Dubois",
  "attributes": {
    "uniqueID": "660f9511-f39c-52e5-b827-557766551111",
    "clearance": "SECRET",
    "countryOfAffiliation": "FRA",
    "acpCOI": "[\"NATO-COSMIC\"]",
    "dutyOrg": "FR_DEFENSE_MINISTRY",
    "orgUnit": "INTELLIGENCE",
    "acr": "urn:mace:incommon:iap:silver",
    "amr": "[\"pwd\",\"otp\"]"
  }
}
```

### Industry User (OIDC Federated)

```json
{
  "username": "bob.contractor",
  "email": "bob.contractor@lockheed.com",
  "firstName": "Bob",
  "lastName": "Contractor",
  "attributes": {
    "uniqueID": "770fa622-g49d-63f6-c938-668877662222",
    "clearance": "UNCLASSIFIED",  // Enriched (default)
    "countryOfAffiliation": "USA",  // Enriched (from email)
    "acpCOI": "[]",  // Enriched (empty)
    "dutyOrg": "LOCKHEED_MARTIN",  // Enriched (from email)
    "orgUnit": "",  // Not provided
    "acr": "urn:mace:incommon:iap:bronze",
    "amr": "[\"pwd\"]"
  }
}
```

---

## Appendix C: References

**Standards**:
- **ACP-240 (A)**: NATO Data-Centric Security specification (Section 2.1)
- **STANAG 4774**: NATO Security Classification Labels
- **ISO 3166-1**: Country codes (alpha-3)
- **RFC 4122**: UUID specification
- **RFC 5322**: Email address format
- **RFC 8176**: Authentication Method Reference Values
- **NIST SP 800-63B**: Digital Identity Guidelines (AAL)
- **NIST SP 800-63C**: Digital Identity Guidelines (FAL)

**DIVE V3 Documents**:
- `docs/KEYCLOAK-CONFIGURATION-AUDIT.md` (Gap analysis)
- `docs/IDENTITY-ASSURANCE-LEVELS.md` (AAL/FAL implementation)
- `ACP240-GAP-ANALYSIS-REPORT.md` (Compliance audit)
- `notes/ACP240-llms.txt` (ACP-240 requirements summary)
- `terraform/main.tf` (Keycloak configuration)
- `policies/fuel_inventory_abac_policy.rego` (OPA validation rules)

---

**Document Status**: ✅ **APPROVED**  
**Version**: 1.0  
**Date**: October 20, 2025  
**Next Review**: Upon Gap #4, #5, #6 remediation


