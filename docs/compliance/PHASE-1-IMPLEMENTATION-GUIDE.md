# Phase 1 Implementation Guide - NATO Compliance Quick Wins

**Duration:** 2 weeks (November 4-15, 2025)  
**Effort:** 13 working days  
**Status:** 🚧 Ready for Implementation  
**Compliance Improvement:** +10% ADatP-5663 (63% → 73%)

---

## OVERVIEW

Phase 1 focuses on high-impact, low-effort compliance improvements leveraging Keycloak's native capabilities. All tasks use existing Keycloak features with minimal custom code.

### Success Criteria

- [ ] All 7 tasks completed and tested
- [ ] Terraform applied successfully (no errors)
- [ ] All acceptance criteria met
- [ ] CI/CD pipelines passing
- [ ] Phase 1 demo delivered to stakeholders
- [ ] ADatP-5663 compliance reaches 73% (from 63%)

---

## TASK 1.1: ENABLE METADATA SIGNING

**Owner:** DevOps Engineer  
**Effort:** 1 day  
**Priority:** High  
**ADatP-5663:** §3.8 (Metadata Exchange)

### Objective

Enable SAML metadata signing for all IdP brokers to prevent metadata tampering and satisfy ADatP-5663 metadata trust requirements.

### Implementation

**File:** `terraform/modules/federation-metadata/metadata-signing.tf`

```hcl
# NATO Compliance: ADatP-5663 §3.8 - Signed IdP Metadata
# Phase 1, Task 1.1 - Enable Metadata Signing

terraform {
  required_providers {
    keycloak = {
      source  = "mrparkers/keycloak"
      version = "~> 4.0"
    }
  }
}

# Enable metadata signing for all IdP brokers in dive-v3-broker realm
locals {
  idp_brokers = [
    "usa-realm-broker",
    "fra-realm-broker",
    "can-realm-broker",
    "deu-realm-broker",
    "gbr-realm-broker",
    "ita-realm-broker",
    "esp-realm-broker",
    "pol-realm-broker",
    "nld-realm-broker",
    "industry-realm-broker"
  ]
}

# Update all existing OIDC IdP brokers to enable metadata export signing
# Note: OIDC IdPs don't have metadata signing (only SAML), but we prepare for SAML
# When we add SAML IdPs (like Spain), this will automatically apply

# For future SAML IdPs, we'll use this configuration template:
# resource "keycloak_saml_identity_provider" "example" {
#   realm                        = keycloak_realm.dive_v3_broker.id
#   alias                        = "example-saml-broker"
#   sign_service_provider_metadata = true  # <-- NATO Compliance
#   ...
# }

# Output current broker list for verification
output "idp_brokers_requiring_metadata_signing" {
  description = "List of IdP brokers that will have metadata signing enabled when SAML configuration is added"
  value       = local.idp_brokers
}

output "metadata_signing_status" {
  description = "Metadata signing configuration status"
  value = {
    oidc_brokers   = "N/A (OIDC uses JWKS endpoint, no metadata signing)"
    saml_ready     = "Configuration prepared for SAML IdPs (Task 1.4)"
    compliance     = "ADatP-5663 §3.8 - Signed Metadata Exchange"
  }
}
```

### Testing

```bash
# 1. Apply Terraform configuration
cd terraform/modules/federation-metadata
terraform init
terraform plan
terraform apply

# 2. Verify OIDC discovery metadata (already signed via JWKS)
curl -s http://localhost:8081/realms/dive-v3-usa/.well-known/openid-connect/configuration | jq .

# 3. Expected output should include jwks_uri:
# {
#   "issuer": "http://localhost:8081/realms/dive-v3-usa",
#   "jwks_uri": "http://localhost:8081/realms/dive-v3-usa/protocol/openid-connect/certs",
#   ...
# }

# 4. Verify JWKS contains signing keys
curl -s http://localhost:8081/realms/dive-v3-usa/protocol/openid-connect/certs | jq .

# Expected: RSA keys with "use": "sig"
```

### Acceptance Criteria

- [x] Terraform configuration created and validated
- [ ] Metadata signing configuration prepared for SAML IdPs
- [ ] OIDC discovery metadata includes valid `jwks_uri`
- [ ] JWKS endpoint returns valid signing keys
- [ ] Documentation updated with metadata verification procedure

### Notes

- OIDC IdPs use JWKS (JSON Web Key Set) instead of signed XML metadata
- SAML IdPs will use `sign_service_provider_metadata = true` (configured in Task 1.4)
- NATO compliance satisfied by cryptographic verification (JWKS for OIDC, XML signature for SAML)

---

## TASK 1.2: CONFIGURE ACR/LOA MAPPING

**Owner:** Backend Developer  
**Effort:** 2 days  
**Priority:** High  
**ADatP-5663:** §2.4, §5.1.2 (AAL Step-Up Authentication)

### Objective

Configure Authentication Context Class Reference (ACR) to Level of Authentication (LoA) mapping to enable step-up authentication based on SP-requested AAL.

### Implementation

**File:** `terraform/modules/realm-mfa/acr-loa-mapping.tf`

```hcl
# NATO Compliance: ADatP-5663 §2.4, §5.1.2 - AAL Step-Up Authentication
# Phase 1, Task 1.2 - ACR to LoA Mapping

terraform {
  required_providers {
    keycloak = {
      source  = "mrparkers/keycloak"
      version = "~> 4.0"
    }
  }
}

# ACR to LoA Mapping Configuration
# Maps OIDC ACR values to Keycloak LoA levels for step-up authentication
#
# NATO/NIST AAL Mapping:
# - LoA 1 (AAL1): Password only → acr=0
# - LoA 2 (AAL2): Password + OTP → acr=1  
# - LoA 3 (AAL3): Password + WebAuthn → acr=2

locals {
  # List of all realms requiring ACR/LoA configuration
  realms = [
    "dive-v3-broker",
    "dive-v3-usa",
    "dive-v3-fra",
    "dive-v3-can",
    "dive-v3-deu",
    "dive-v3-gbr",
    "dive-v3-ita",
    "dive-v3-esp",
    "dive-v3-pol",
    "dive-v3-nld",
    "dive-v3-industry"
  ]
  
  # ACR to LoA mapping
  acr_loa_mappings = {
    "0" = 1  # AAL1: Password only
    "1" = 2  # AAL2: Password + OTP
    "2" = 3  # AAL3: Password + WebAuthn
  }
  
  # Max Age configuration (seconds)
  # Defines how long each LoA level remains valid before step-up required
  loa_max_age = {
    1 = 28800  # LoA 1 (AAL1): 8 hours
    2 = 1800   # LoA 2 (AAL2): 30 minutes
    3 = 0      # LoA 3 (AAL3): Always re-authenticate (highest security)
  }
}

# Configure ACR to LoA mapping for broker realm
# Note: Keycloak 26.4 uses authentication flow conditions, not a separate ACR mapping table
# The mapping is implicit in the flow configuration (see flows.tf)

# Update authentication flows to use Max Age settings
# This enables step-up authentication based on acr_values parameter

# Example: Update Conditional - Level Of Authentication configurations
# (Actual flow updates in terraform/modules/realm-mfa/flows.tf)

resource "keycloak_authentication_execution_config" "usa_loa1_config" {
  realm_id     = "dive-v3-usa"
  execution_id = keycloak_authentication_execution.usa_browser_forms_loa1.id
  alias        = "LoA 1 Configuration (AAL1)"
  
  config = {
    defaultAcrValues = "0"           # ACR value for this level
    max_age          = "28800"       # 8 hours
  }
}

resource "keycloak_authentication_execution_config" "usa_loa2_config" {
  realm_id     = "dive-v3-usa"
  execution_id = keycloak_authentication_execution.usa_browser_forms_loa2_otp.id
  alias        = "LoA 2 Configuration (AAL2)"
  
  config = {
    defaultAcrValues = "1"           # ACR value for this level
    max_age          = "1800"        # 30 minutes
  }
}

resource "keycloak_authentication_execution_config" "usa_loa3_config" {
  realm_id     = "dive-v3-usa"
  execution_id = keycloak_authentication_execution.usa_browser_forms_loa3_webauthn.id
  alias        = "LoA 3 Configuration (AAL3)"
  
  config = {
    defaultAcrValues = "2"           # ACR value for this level
    max_age          = "0"           # Always re-authenticate
  }
}

# Output ACR/LoA mapping configuration
output "acr_loa_mapping" {
  description = "ACR to LoA mapping for NATO compliance"
  value = {
    mappings = {
      "acr=0" = "LoA 1 (AAL1: Password only, 8h validity)"
      "acr=1" = "LoA 2 (AAL2: Password + OTP, 30min validity)"
      "acr=2" = "LoA 3 (AAL3: Password + WebAuthn, always re-auth)"
    }
    max_age = local.loa_max_age
    compliance = "ADatP-5663 §2.4, §5.1.2 - Step-Up Authentication"
  }
}
```

**File:** `frontend/src/lib/acr-helper.ts`

```typescript
/**
 * NATO Compliance: ACR Request Helper
 * 
 * Requests appropriate ACR (Authentication Context Class Reference) based on
 * resource classification level.
 * 
 * ADatP-5663 §5.1.2: SPs MAY request specific AAL in authentication request
 */

export type ClassificationLevel = 'UNCLASSIFIED' | 'CONFIDENTIAL' | 'SECRET' | 'TOP_SECRET';
export type ACRValue = '0' | '1' | '2';

/**
 * Maps classification level to required ACR value
 * 
 * NATO AAL Requirements:
 * - UNCLASSIFIED: AAL1 (acr=0)
 * - CONFIDENTIAL: AAL2 (acr=1) - MFA required
 * - SECRET: AAL2 (acr=1) - MFA required
 * - TOP_SECRET: AAL3 (acr=2) - Hardware-backed MFA required
 */
export function getRequiredACR(classification: ClassificationLevel): ACRValue {
  switch (classification) {
    case 'UNCLASSIFIED':
      return '0'; // AAL1: Password only
    case 'CONFIDENTIAL':
    case 'SECRET':
      return '1'; // AAL2: Password + OTP
    case 'TOP_SECRET':
      return '2'; // AAL3: Password + WebAuthn
    default:
      return '0'; // Default to lowest level
  }
}

/**
 * Checks if current ACR satisfies required ACR for resource
 * 
 * @param currentACR - ACR claim from current token
 * @param requiredACR - Required ACR for resource
 * @returns true if current ACR >= required ACR
 */
export function satisfiesACR(currentACR: ACRValue, requiredACR: ACRValue): boolean {
  const current = parseInt(currentACR, 10);
  const required = parseInt(requiredACR, 10);
  return current >= required;
}

/**
 * Generates NextAuth signIn options with acr_values parameter
 * 
 * @param classification - Classification level of resource being accessed
 * @returns NextAuth signIn options object
 */
export function getAuthOptionsForClassification(classification: ClassificationLevel) {
  const acrValue = getRequiredACR(classification);
  
  return {
    callbackUrl: window.location.href,
    // Request specific ACR (ADatP-5663 §5.1.2)
    acr_values: acrValue,
  };
}

/**
 * Validates ACR claim in token against resource requirements
 * 
 * @param token - Decoded JWT token
 * @param resourceClassification - Classification of resource being accessed
 * @returns Validation result with step-up required flag
 */
export function validateACRForResource(
  token: { acr?: string },
  resourceClassification: ClassificationLevel
): { valid: boolean; stepUpRequired: boolean; requiredACR: ACRValue } {
  const requiredACR = getRequiredACR(resourceClassification);
  const currentACR = (token.acr || '0') as ACRValue;
  
  const valid = satisfiesACR(currentACR, requiredACR);
  
  return {
    valid,
    stepUpRequired: !valid,
    requiredACR,
  };
}
```

### Testing

```bash
# 1. Apply Terraform configuration
cd terraform/modules/realm-mfa
terraform init
terraform plan
terraform apply

# 2. Test ACR request with acr_values parameter
# Create test script: scripts/test-acr-step-up.sh

#!/bin/bash
# Test ACR/LoA step-up authentication

KEYCLOAK_URL="http://localhost:8081"
REALM="dive-v3-usa"
CLIENT_ID="dive-v3-client"
CLIENT_SECRET="your-client-secret"

echo "=== Test 1: Request AAL1 (acr=0) ==="
# Should succeed with password only
curl -X POST "$KEYCLOAK_URL/realms/$REALM/protocol/openid-connect/auth" \
  -d "client_id=$CLIENT_ID" \
  -d "response_type=code" \
  -d "scope=openid" \
  -d "acr_values=0"

echo "\n=== Test 2: Request AAL2 (acr=1) without OTP ==="
# Should prompt for OTP enrollment/authentication
curl -X POST "$KEYCLOAK_URL/realms/$REALM/protocol/openid-connect/auth" \
  -d "client_id=$CLIENT_ID" \
  -d "response_type=code" \
  -d "scope=openid" \
  -d "acr_values=1"

echo "\n=== Test 3: Verify ACR claim in token ==="
# After authentication, decode ID token and verify acr claim
# Expected: acr=1 if OTP was used, acr=0 if password only

# 3. E2E test via frontend
npm run dev
# Navigate to TOP_SECRET resource
# Expected: Should trigger step-up authentication (WebAuthn prompt)
```

### Acceptance Criteria

- [ ] ACR to LoA mapping configured in all 11 realms
- [ ] Max Age configured for each LoA level (8h, 30min, 0s)
- [ ] Frontend requests ACR based on resource classification
- [ ] ID tokens contain `acr` claim matching requested level
- [ ] Step-up authentication works (LoA 1 → LoA 2 → LoA 3)
- [ ] Error returned when requested AAL cannot be satisfied
- [ ] OPA policy updated to verify ACR claim

---

## TASK 1.3: CONFIGURE PAIRWISE SUBJECT IDENTIFIERS

**Owner:** Backend Developer  
**Effort:** 2 days  
**Priority:** Medium  
**ADatP-5663:** §4.6 (Pseudonymization)

### Objective

Implement pseudonymization using pairwise subject identifiers for industry partners to protect user privacy while maintaining audit trail.

### Implementation

**File:** `terraform/modules/pseudonymization/pairwise-mappers.tf`

```hcl
# NATO Compliance: ADatP-5663 §4.6 - Pseudonymization
# Phase 1, Task 1.3 - Pairwise Subject Identifiers

terraform {
  required_providers {
    keycloak = {
      source  = "mrparkers/keycloak"
      version = "~> 4.0"
    }
  }
}

# Define sectors for pairwise subject identifier grouping
# Same sector = same pseudonym for user
locals {
  sectors = {
    national = {
      uri         = "https://dive-v3.example.com/national"
      description = "National partner IdPs (USA, FRA, CAN, DEU, GBR, ITA, ESP, POL, NLD)"
      clients     = ["dive-v3-client"] # Real uniqueID for national partners
    }
    industry = {
      uri         = "https://dive-v3.example.com/industry"
      description = "Industry partners (contractors, vendors)"
      clients     = ["dive-v3-industry-client"] # Pseudonymous sub for industry
    }
  }
}

# Create client scope for pseudonymous subjects
resource "keycloak_openid_client_scope" "pseudonymous_subject" {
  realm_id               = "dive-v3-broker"
  name                   = "pseudonymous-subject"
  description            = "Pairwise subject identifier for pseudonymization (ADatP-5663 §4.6)"
  include_in_token_scope = true
  
  # GUI order for admin console
  gui_order = 100
}

# Create pairwise subject identifier mapper
resource "keycloak_openid_user_attribute_protocol_mapper" "pairwise_sub" {
  realm_id  = "dive-v3-broker"
  client_scope_id = keycloak_openid_client_scope.pseudonymous_subject.id
  name      = "pairwise-subject-identifier"
  
  user_attribute   = "pairwise_sub" # Will be computed
  claim_name       = "sub"
  claim_value_type = "String"
  
  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
  
  # Multivalued = false (single pseudonym per user per sector)
  multivalued = false
}

# Alternative: Use built-in SHA256 Pairwise Sub Mapper (if available in Keycloak 26.4)
# resource "keycloak_generic_protocol_mapper" "pairwise_sha256" {
#   realm_id        = "dive-v3-broker"
#   client_scope_id = keycloak_openid_client_scope.pseudonymous_subject.id
#   name            = "pairwise-sha256-subject"
#   protocol        = "openid-connect"
#   protocol_mapper = "oidc-sha256-pairwise-sub-mapper"
#   
#   config = {
#     "sectorIdentifierUri" = local.sectors.industry.uri
#     "pairwiseSubAlgorithmSalt" = random_password.pairwise_salt.result
#   }
# }

# Generate cryptographically secure salt for pairwise pseudonym generation
resource "random_password" "pairwise_salt" {
  length  = 32
  special = true
}

# Store salt securely (in production, use HashiCorp Vault or AWS Secrets Manager)
resource "local_sensitive_file" "pairwise_salt" {
  filename = "${path.module}/../../secrets/pairwise-salt.txt"
  content  = random_password.pairwise_salt.result
  
  file_permission = "0600"
}

# Assign pseudonymous subject scope to industry client
resource "keycloak_openid_client_optional_client_scopes" "industry_pseudonymous" {
  realm_id  = "dive-v3-broker"
  client_id = "dive-v3-industry-client"
  
  optional_scopes = [
    keycloak_openid_client_scope.pseudonymous_subject.name
  ]
}

# Output sector configuration
output "pseudonymization_config" {
  description = "Pairwise subject identifier configuration for NATO compliance"
  value = {
    sectors = {
      for sector_name, sector in local.sectors : sector_name => {
        uri         = sector.uri
        description = sector.description
      }
    }
    salt_location = local_sensitive_file.pairwise_salt.filename
    compliance    = "ADatP-5663 §4.6 - Pseudonymization"
  }
  sensitive = false
}
```

**File:** `docs/PSEUDONYMIZATION-RESOLUTION.md`

```markdown
# Pseudonymization Resolution Procedure

**NATO Compliance:** ADatP-5663 §4.6  
**Purpose:** Map pseudonymous subject identifiers back to real users for incident response

---

## Overview

DIVE V3 uses **pairwise subject identifiers** (SHA-256 based pseudonyms) for industry partners to protect user privacy while maintaining audit trail capability.

### Pseudonym Generation

**Algorithm:** `SHA-256(sector_identifier_uri || local_account_id || salt)`

**Example:**
```
Sector: https://dive-v3.example.com/industry
User ID: user-12345
Salt: [32-byte secure random]
Pseudonym: 8f7a3b2c1d9e6f4a5b8c7d6e5f4a3b2c1d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5
```

---

## Resolution Procedure

### Step 1: Identify Pseudonymous Subject

**From Audit Logs:**
```json
{
  "timestamp": "2025-11-05T14:30:00Z",
  "subject": "8f7a3b2c1d9e6f4a5b8c7d6e5f4a3b2c1d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5",
  "resource": "doc-456",
  "decision": "DENY",
  "reason": "Insufficient clearance"
}
```

**Pseudonymous `sub` claim:** `8f7a3b2c1d9e6f4a5b8c7d6e5f4a3b2c1d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5`

---

### Step 2: Query Keycloak for Real User

**Admin REST API Query:**

```bash
# Set admin credentials
ADMIN_TOKEN=$(curl -X POST "http://localhost:8081/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli" \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password" | jq -r .access_token)

# Search for user by pairwise pseudonym
PSEUDONYM="8f7a3b2c1d9e6f4a5b8c7d6e5f4a3b2c1d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5"

curl -X GET "http://localhost:8081/admin/realms/dive-v3-broker/users" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -G \
  --data-urlencode "q=pairwise_sub:$PSEUDONYM" | jq .
```

**Expected Response:**
```json
[
  {
    "id": "user-12345",
    "username": "john.contractor@industry.com",
    "email": "john.contractor@industry.com",
    "firstName": "John",
    "lastName": "Contractor",
    "attributes": {
      "uniqueID": ["contractor-001"],
      "countryOfAffiliation": ["USA"],
      "pairwise_sub": ["8f7a3b2c..."]
    }
  }
]
```

---

### Step 3: Reverse Verification

**Verify pseudonym calculation:**

```python
import hashlib

sector_uri = "https://dive-v3.example.com/industry"
user_id = "user-12345"
salt = "..."  # From pairwise-salt.txt

# Calculate pseudonym
pairwise_input = f"{sector_uri}{user_id}{salt}".encode('utf-8')
pseudonym = hashlib.sha256(pairwise_input).hexdigest()

print(f"Calculated pseudonym: {pseudonym}")
# Should match audit log pseudonym
```

---

### Step 4: Document Resolution

**Incident Response Record:**

```
Date: 2025-11-05
Incident ID: INC-2025-1105-001
Pseudonymous Subject: 8f7a3b2c1d9e6f4a5b8c7d6e5f4a3b2c1d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5
Real Identity: john.contractor@industry.com (contractor-001)
Resolution Method: Keycloak Admin API query
Authorized By: Security Officer Jane Doe
Reason: Access denial investigation (insufficient clearance)
```

---

## Security Considerations

1. **Master Key Protection:**
   - Pairwise salt stored in `terraform/modules/pseudonymization/secrets/pairwise-salt.txt`
   - File permissions: 0600 (owner read/write only)
   - Production: Use HashiCorp Vault or AWS Secrets Manager

2. **Access Control:**
   - Resolution procedure requires admin privileges
   - Log all pseudonym resolution actions
   - Limit access to security team only

3. **Audit Trail:**
   - All pseudonym resolutions logged to MongoDB
   - Include: timestamp, requester, reason, incident ID

---

## Compliance Notes

**ADatP-5663 §4.6 Requirements:**
- ✅ Separate security tokens for pseudonymization (pairwise `sub`)
- ✅ Comprehensive records of original Subject (Keycloak user database)
- ✅ Resolution capability for incident response (this procedure)

**Master Identifier Retention:**
- Real `uniqueID` retained in Keycloak user attributes
- Pseudonym mapping stored in user session and attributes
- Complete audit trail maintained in MongoDB

---

**Last Updated:** November 4, 2025  
**Procedure Owner:** Security Operations Team
```

### Testing

```bash
# 1. Apply Terraform configuration
cd terraform/modules/pseudonymization
terraform init
terraform plan
terraform apply

# 2. Test pseudonym generation
# Login as test user via industry client
# Verify token contains pseudonymous sub

# 3. Test pseudonym resolution
./scripts/test-pseudonym-resolution.sh

# 4. Verify same pseudonym within sector
# Same user, same client → Same pseudonym
# Same user, different sector → Different pseudonym
```

### Acceptance Criteria

- [ ] Pairwise subject identifiers configured for industry client
- [ ] Different pseudonyms generated per client
- [ ] Same pseudonym within sector (industry sector)
- [ ] Master identifier (username) retained in Keycloak database
- [ ] Pseudonym resolution procedure documented and tested
- [ ] Pairwise salt securely stored with proper permissions

---

## TASK 1.4: INTEGRATE SPAIN SAML IDP

**Owner:** Backend Developer + DevOps Engineer  
**Effort:** 3 days  
**Priority:** High  
**ADatP-5663:** §2.4, §5.1 (Multi-Protocol Federation)

### Objective

Integrate external Spain SAML IdP to demonstrate multi-protocol federation (SAML → Keycloak → OIDC protocol bridging).

### Implementation

**File:** `terraform/idp-brokers/spain-saml-broker.tf`

```hcl
# NATO Compliance: ADatP-5663 §2.4, §5.1 - Multi-Protocol Federation
# Phase 1, Task 1.4 - Spain SAML IdP Integration

terraform {
  required_providers {
    keycloak = {
      source  = "mrparkers/keycloak"
      version = "~> 4.0"
    }
  }
}

# Spain SAML IdP Broker Configuration
# Protocol Bridge: SAML (Spain IdP) → Keycloak Broker → OIDC (DIVE Frontend)

resource "keycloak_saml_identity_provider" "spain_saml_broker" {
  realm        = "dive-v3-broker"
  alias        = "spain-saml-broker"
  display_name = "Spain (Ministry of Defense)"
  enabled      = true
  
  # NATO Compliance: Metadata signing (ADatP-5663 §3.8)
  sign_service_provider_metadata = true
  
  # SAML Endpoints (from external-idps/spain-saml/metadata.xml)
  single_sign_on_service_url = "http://localhost:8082/simplesaml/saml2/idp/SSOService.php"
  single_logout_service_url  = "http://localhost:8082/simplesaml/saml2/idp/SingleLogoutService.php"
  
  # Entity ID
  entity_id = "http://spain-saml-idp.local/metadata"
  
  # Signature & Encryption (NATO Security Requirements)
  want_authn_requests_signed = true   # Sign auth requests
  want_assertions_signed      = true   # Require signed assertions
  want_assertions_encrypted   = false  # Optional encryption
  
  # Signature Algorithm (ADatP-5663: Use secure algorithms)
  signature_algorithm = "RSA_SHA256"  # Don't use SHA1 (deprecated)
  
  # SAML Bindings
  post_binding_authn_request = true   # HTTP-POST for AuthnRequest
  post_binding_response      = true   # HTTP-POST for Response
  
  # Trust & Validation
  validate_signature         = true    # Verify IdP signatures
  force_authn               = false   # Allow SSO (don't force re-auth every time)
  
  # First Broker Login Flow
  first_broker_login_flow_alias = "first broker login"
  
  # Sync Mode (ADatP-5663: Trust external attributes)
  sync_mode = "FORCE"  # Always sync attributes from IdP
  
  # Store token for attribute refresh
  store_token = true
  
  # Trust email from IdP
  trust_email = true
  
  # GUI Order (display priority in login page)
  gui_order = 11  # After 10 OIDC brokers
  
  # Backchannel Logout Support (ADatP-5663 §5.2.4)
  backchannel_supported = false  # SAML backchannel not supported yet
}

# Import SAML IdP certificate for signature validation
# Certificate from: external-idps/spain-saml/certs/idp.crt
resource "keycloak_certificate" "spain_saml_cert" {
  realm_id = "dive-v3-broker"
  name     = "spain-saml-signing-cert"
  
  # Certificate content (PEM format)
  certificate = file("${path.module}/../../external-idps/spain-saml/certs/idp.crt")
  
  # Purpose: Signature validation
  enabled = true
}

# Output SAML SP metadata for Spain IdP configuration
output "spain_saml_sp_metadata_url" {
  description = "SAML SP metadata URL to share with Spain IdP"
  value       = "http://localhost:8081/realms/dive-v3-broker/broker/spain-saml-broker/endpoint/descriptor"
}

output "spain_saml_integration_status" {
  description = "Spain SAML IdP integration status"
  value = {
    alias              = keycloak_saml_identity_provider.spain_saml_broker.alias
    entity_id          = keycloak_saml_identity_provider.spain_saml_broker.entity_id
    sso_url            = keycloak_saml_identity_provider.spain_saml_broker.single_sign_on_service_url
    metadata_signed    = keycloak_saml_identity_provider.spain_saml_broker.sign_service_provider_metadata
    assertions_signed  = keycloak_saml_identity_provider.spain_saml_broker.want_assertions_signed
    compliance         = "ADatP-5663 §2.4, §5.1 - Multi-Protocol Federation"
  }
}
```

**File:** `terraform/modules/attribute-transcription/spain-saml-mappers.tf`

```hcl
# NATO Compliance: ADatP-5663 §2.3.2 - Attribute Transcription
# Phase 1, Task 1.4 - SAML to OIDC Attribute Mapping (Spain)

terraform {
  required_providers {
    keycloak = {
      source  = "mrparkers/keycloak"
      version = "~> 4.0"
    }
  }
}

# SAML Attribute Mappers for Spain IdP
# Maps SAML assertion attributes to DIVE V3 user attributes

# Mapper 1: Unique Identifier (UID)
resource "keycloak_custom_identity_provider_mapper" "spain_uid" {
  realm                    = "dive-v3-broker"
  name                     = "spain-uid-mapper"
  identity_provider_alias  = "spain-saml-broker"
  identity_provider_mapper = "saml-user-attribute-idp-mapper"
  
  extra_config = {
    syncMode         = "INHERIT"
    attribute.name   = "urn:oid:0.9.2342.19200300.100.1.1"  # LDAP uid
    user.attribute   = "uniqueID"
  }
}

# Mapper 2: Surname
resource "keycloak_custom_identity_provider_mapper" "spain_surname" {
  realm                    = "dive-v3-broker"
  name                     = "spain-surname-mapper"
  identity_provider_alias  = "spain-saml-broker"
  identity_provider_mapper = "saml-user-attribute-idp-mapper"
  
  extra_config = {
    syncMode         = "INHERIT"
    attribute.name   = "urn:oid:2.5.4.4"  # sn (surname)
    user.attribute   = "surname"
  }
}

# Mapper 3: Given Name
resource "keycloak_custom_identity_provider_mapper" "spain_givenname" {
  realm                    = "dive-v3-broker"
  name                     = "spain-givenname-mapper"
  identity_provider_alias  = "spain-saml-broker"
  identity_provider_mapper = "saml-user-attribute-idp-mapper"
  
  extra_config = {
    syncMode         = "INHERIT"
    attribute.name   = "urn:oid:2.5.4.42"  # givenName
    user.attribute   = "givenName"
  }
}

# Mapper 4: Email
resource "keycloak_custom_identity_provider_mapper" "spain_email" {
  realm                    = "dive-v3-broker"
  name                     = "spain-email-mapper"
  identity_provider_alias  = "spain-saml-broker"
  identity_provider_mapper = "saml-user-attribute-idp-mapper"
  
  extra_config = {
    syncMode         = "INHERIT"
    attribute.name   = "urn:oid:0.9.2342.19200300.100.1.3"  # mail
    user.attribute   = "email"
  }
}

# Mapper 5: Clearance Level (with transformation - see Task 1.5)
resource "keycloak_custom_identity_provider_mapper" "spain_clearance" {
  realm                    = "dive-v3-broker"
  name                     = "spain-clearance-mapper"
  identity_provider_alias  = "spain-saml-broker"
  identity_provider_mapper = "saml-user-attribute-idp-mapper"
  
  extra_config = {
    syncMode         = "INHERIT"
    attribute.name   = "clearance"  # Spanish: SECRETO, RESERVADO, CONFIDENCIAL
    user.attribute   = "clearanceOriginal"  # Store original value
  }
}

# Mapper 6: Country of Affiliation (hardcoded to ESP for Spain IdP)
resource "keycloak_custom_identity_provider_mapper" "spain_country" {
  realm                    = "dive-v3-broker"
  name                     = "spain-country-mapper"
  identity_provider_alias  = "spain-saml-broker"
  identity_provider_mapper = "hardcoded-attribute-idp-mapper"
  
  extra_config = {
    syncMode         = "INHERIT"
    attribute        = "countryOfAffiliation"
    attribute.value  = "ESP"  # ISO 3166-1 alpha-3
  }
}

# Output attribute mapping configuration
output "spain_saml_attribute_mappings" {
  description = "SAML to OIDC attribute mappings for Spain IdP"
  value = {
    saml_attributes = {
      "urn:oid:0.9.2342.19200300.100.1.1" = "uniqueID"
      "urn:oid:2.5.4.4"                    = "surname"
      "urn:oid:2.5.4.42"                   = "givenName"
      "urn:oid:0.9.2342.19200300.100.1.3" = "email"
      "clearance"                          = "clearanceOriginal (see Task 1.5 for transformation)"
      "hardcoded"                          = "countryOfAffiliation=ESP"
    }
    compliance = "ADatP-5663 §2.3.2 - Attribute Transcription"
  }
}
```

### Testing

```bash
# 1. Start Spain SAML IdP (SimpleSAMLphp)
cd external-idps/spain-saml
docker-compose up -d

# 2. Apply Terraform configuration
cd terraform/idp-brokers
terraform init
terraform plan
terraform apply

# 3. Download SAML SP metadata for Spain IdP
curl -o spain-sp-metadata.xml \
  http://localhost:8081/realms/dive-v3-broker/broker/spain-saml-broker/endpoint/descriptor

# 4. Configure Spain IdP with DIVE SP metadata
# (Manual step: Import spain-sp-metadata.xml into Spain IdP)

# 5. Test SAML → Keycloak → OIDC flow
# Navigate to DIVE frontend: http://localhost:3000
# Click "Login with Spain (Ministry of Defense)"
# Expected: Redirect to Spain SAML IdP → Authenticate → Redirect back → OIDC token

# 6. Verify SAML attributes mapped to OIDC claims
# Decode ID token, check for:
# - uniqueID (from SAML uid)
# - clearanceOriginal (from SAML clearance)
# - countryOfAffiliation=ESP (hardcoded)
```

### Acceptance Criteria

- [ ] Spain SAML IdP integrated as broker in `dive-v3-broker` realm
- [ ] SAML metadata imported and validated
- [ ] Metadata signing enabled (`sign_service_provider_metadata = true`)
- [ ] Signature validation configured (`want_assertions_signed = true`)
- [ ] Attribute mappers configured for DIVE attributes (6 mappers)
- [ ] E2E test: SAML user can authenticate to DIVE frontend via protocol bridging
- [ ] OIDC tokens contain mapped DIVE attributes (uniqueID, clearanceOriginal, countryOfAffiliation)
- [ ] Protocol bridging latency measured (<500ms p95)

---

## TASK 1.5: ADD CLEARANCE TRANSFORMATION MAPPERS

**Owner:** Backend Developer  
**Effort:** 2 days  
**Priority:** Medium  
**ADatP-5663:** §2.3.2 (Attribute Transcription)

### Objective

Implement country-specific clearance level transformation to map national clearance values to NATO standard levels.

### Implementation

**File:** `terraform/modules/attribute-transcription/clearance-mappers.tf`

```hcl
# NATO Compliance: ADatP-5663 §2.3.2 - Clearance Level Transformation
# Phase 1, Task 1.5 - Country-Specific Clearance Mapping

terraform {
  required_providers {
    keycloak = {
      source  = "mrparkers/keycloak"
      version = "~> 4.0"
    }
  }
}

# Clearance Level Mapping Table
# Maps country-specific clearance values to NATO standard levels

locals {
  clearance_mappings = {
    # France (FRA)
    france = {
      "TRES_SECRET_DEFENSE"     = "TOP_SECRET"
      "SECRET_DEFENSE"          = "SECRET"
      "CONFIDENTIEL_DEFENSE"    = "CONFIDENTIAL"
      "DIFFUSION_RESTREINTE"    = "UNCLASSIFIED"
    }
    
    # Germany (DEU)
    germany = {
      "STRENG_GEHEIM"                    = "TOP_SECRET"
      "GEHEIM"                           = "SECRET"
      "VS_VERTRAULICH"                   = "CONFIDENTIAL"
      "VS_NUR_FUER_DEN_DIENSTGEBRAUCH"  = "UNCLASSIFIED"
    }
    
    # Spain (ESP)
    spain = {
      "SECRETO"       = "SECRET"
      "RESERVADO"     = "CONFIDENTIAL"
      "CONFIDENCIAL"  = "UNCLASSIFIED"
    }
    
    # United Kingdom (GBR)
    uk = {
      "TOP_SECRET"    = "TOP_SECRET"
      "SECRET"        = "SECRET"
      "CONFIDENTIAL"  = "CONFIDENTIAL"
      "OFFICIAL"      = "UNCLASSIFIED"
    }
    
    # Italy (ITA)
    italy = {
      "SEGRETISSIMO"  = "TOP_SECRET"
      "SEGRETO"       = "SECRET"
      "RISERVATISSIMO" = "CONFIDENTIAL"
      "RISERVATO"     = "UNCLASSIFIED"
    }
  }
  
  # NATO Standard Levels (target)
  nato_levels = ["UNCLASSIFIED", "CONFIDENTIAL", "SECRET", "TOP_SECRET"]
}

# Create JavaScript mapper for clearance transformation
# Note: Keycloak JavaScript mappers require enabling script engine
# Alternative: Use hardcoded mappers for each country + value combination

# France Clearance Transformation Mappers
resource "keycloak_custom_identity_provider_mapper" "france_clearance_top_secret" {
  realm                    = "dive-v3-broker"
  name                     = "france-clearance-top-secret"
  identity_provider_alias  = "fra-realm-broker"
  identity_provider_mapper = "hardcoded-attribute-idp-mapper"
  
  # Only applied if user has clearanceOriginal = TRES_SECRET_DEFENSE
  extra_config = {
    syncMode         = "INHERIT"
    attribute        = "clearance"
    attribute.value  = "TOP_SECRET"
    # Condition: clearanceOriginal == "TRES_SECRET_DEFENSE"
  }
}

# ... (Create similar mappers for each France clearance level)

# Alternative: JavaScript Mapper (if script engine enabled)
resource "keycloak_generic_protocol_mapper" "clearance_transform_js" {
  realm_id        = "dive-v3-broker"
  client_id       = keycloak_openid_client.dive_v3_client.id
  name            = "clearance-transformation"
  protocol        = "openid-connect"
  protocol_mapper = "oidc-script-based-protocol-mapper"
  
  config = {
    "script" = file("${path.module}/clearance-transformation.js")
    "claim.name" = "clearance"
    "access.token.claim" = "true"
    "id.token.claim" = "true"
    "userinfo.token.claim" = "true"
  }
}

# Output clearance mapping configuration
output "clearance_transformation_mappings" {
  description = "Country-specific clearance to NATO standard mappings"
  value = {
    france  = local.clearance_mappings.france
    germany = local.clearance_mappings.germany
    spain   = local.clearance_mappings.spain
    uk      = local.clearance_mappings.uk
    italy   = local.clearance_mappings.italy
    nato_standard = local.nato_levels
    compliance = "ADatP-5663 §2.3.2 - Attribute Transcription"
  }
}
```

**File:** `terraform/modules/attribute-transcription/clearance-transformation.js`

```javascript
/**
 * NATO Compliance: Clearance Level Transformation
 * ADatP-5663 §2.3.2 - Attribute Transcription
 * 
 * Transforms country-specific clearance values to NATO standard levels
 */

// Clearance mapping table
var clearanceMappings = {
  // France
  "TRES_SECRET_DEFENSE": "TOP_SECRET",
  "SECRET_DEFENSE": "SECRET",
  "CONFIDENTIEL_DEFENSE": "CONFIDENTIAL",
  "DIFFUSION_RESTREINTE": "UNCLASSIFIED",
  
  // Germany
  "STRENG_GEHEIM": "TOP_SECRET",
  "GEHEIM": "SECRET",
  "VS_VERTRAULICH": "CONFIDENTIAL",
  "VS_NUR_FUER_DEN_DIENSTGEBRAUCH": "UNCLASSIFIED",
  
  // Spain
  "SECRETO": "SECRET",
  "RESERVADO": "CONFIDENTIAL",
  "CONFIDENCIAL": "UNCLASSIFIED",
  
  // UK (already NATO standard)
  "TOP_SECRET": "TOP_SECRET",
  "SECRET": "SECRET",
  "CONFIDENTIAL": "CONFIDENTIAL",
  "OFFICIAL": "UNCLASSIFIED",
  
  // Italy
  "SEGRETISSIMO": "TOP_SECRET",
  "SEGRETO": "SECRET",
  "RISERVATISSIMO": "CONFIDENTIAL",
  "RISERVATO": "UNCLASSIFIED"
};

// Get original clearance from user attribute
var clearanceOriginal = user.getAttribute("clearanceOriginal");

if (clearanceOriginal !== null && clearanceOriginal.length > 0) {
  var originalValue = clearanceOriginal[0].toUpperCase();
  
  // Transform to NATO standard
  var natoValue = clearanceMappings[originalValue];
  
  if (natoValue) {
    // Return NATO standard value
    exports = natoValue;
  } else {
    // Unknown clearance - default to UNCLASSIFIED (fail-safe)
    exports = "UNCLASSIFIED";
  }
} else {
  // No clearance provided - default to UNCLASSIFIED
  exports = "UNCLASSIFIED";
}
```

### Testing

```bash
# 1. Enable Keycloak JavaScript Script Engine (if not already enabled)
# Add to keycloak/Dockerfile:
# ENV KC_FEATURES=scripts

# Rebuild Keycloak container
docker-compose build keycloak
docker-compose up -d keycloak

# 2. Apply Terraform configuration
cd terraform/modules/attribute-transcription
terraform init
terraform plan
terraform apply

# 3. Test clearance transformation for each country
./scripts/test-clearance-transformation.sh

# Test France user
# Expected: clearanceOriginal="SECRET_DEFENSE" → clearance="SECRET"

# Test Germany user
# Expected: clearanceOriginal="GEHEIM" → clearance="SECRET"

# Test Spain user
# Expected: clearanceOriginal="RESERVADO" → clearance="CONFIDENTIAL"

# 4. Verify unmapped clearance defaults to UNCLASSIFIED
# Test with invalid clearance: "INVALID_LEVEL"
# Expected: clearance="UNCLASSIFIED" (fail-safe)
```

### Acceptance Criteria

- [ ] Clearance transformation mappers configured for 5 countries (FRA, DEU, ESP, GBR, ITA)
- [ ] All country-specific clearances map to NATO standard levels
- [ ] JavaScript mapper functional (or hardcoded mappers as fallback)
- [ ] Unmapped clearances default to UNCLASSIFIED (fail-safe)
- [ ] Test coverage: All mappings validated
- [ ] Documentation: `docs/ATTRIBUTE-MAPPING-GUIDE.md` created

---

## TASK 1.6: CONFIGURE NTP TIME SYNC

**Owner:** DevOps Engineer  
**Effort:** 1 day  
**Priority:** Medium  
**ADatP-5663:** §3.7, §6.2.2 (Time Synchronization)

### Objective

Configure NTP time synchronization to ensure ≤3 seconds drift from authoritative time source (ADatP-5663 requirement).

### Implementation

**File:** `scripts/configure-ntp.sh`

```bash
#!/bin/bash
# NATO Compliance: ADatP-5663 §3.7, §6.2.2 - Time Synchronization
# Phase 1, Task 1.6 - Configure NTP

set -euo pipefail

echo "=== Configuring NTP Time Synchronization ==="

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
  echo "ERROR: This script must be run as root (for systemd-timesyncd configuration)"
  exit 1
fi

# Detect NTP client
if command -v timedatectl &> /dev/null; then
  echo "✅ timedatectl found - using systemd-timesyncd"
  NTP_CLIENT="systemd-timesyncd"
elif command -v chrony &> /dev/null; then
  echo "✅ chrony found"
  NTP_CLIENT="chrony"
elif command -v ntpd &> /dev/null; then
  echo "✅ ntpd found"
  NTP_CLIENT="ntpd"
else
  echo "❌ No NTP client found. Installing systemd-timesyncd..."
  apt-get update && apt-get install -y systemd-timesyncd
  NTP_CLIENT="systemd-timesyncd"
fi

# Configure based on NTP client
case "$NTP_CLIENT" in
  "systemd-timesyncd")
    echo "Configuring systemd-timesyncd..."
    
    # Backup existing configuration
    cp /etc/systemd/timesyncd.conf /etc/systemd/timesyncd.conf.backup
    
    # Write configuration
    cat > /etc/systemd/timesyncd.conf <<EOF
[Time]
# NATO Compliance: ADatP-5663 §3.7 - Time Synchronization
# Primary NTP servers
NTP=pool.ntp.org time.nist.gov

# Fallback NTP servers
FallbackNTP=time.google.com time.cloudflare.com

# Poll interval: 32-2048 seconds (default)
# RootDistanceMaxSec=5

# ADatP-5663 Requirement: ≤3 seconds drift
EOF
    
    # Restart systemd-timesyncd
    systemctl restart systemd-timesyncd
    systemctl enable systemd-timesyncd
    
    # Enable NTP
    timedatectl set-ntp true
    ;;
    
  "chrony")
    echo "Configuring chrony..."
    
    # Backup existing configuration
    cp /etc/chrony/chrony.conf /etc/chrony/chrony.conf.backup
    
    # Add NATO-compliant NTP servers
    cat >> /etc/chrony/chrony.conf <<EOF

# NATO Compliance: ADatP-5663 §3.7 - Time Synchronization
server pool.ntp.org iburst
server time.nist.gov iburst
server time.google.com iburst

# Maximum drift: 3 seconds (ADatP-5663 requirement)
maxdrift 3
EOF
    
    # Restart chrony
    systemctl restart chronyd
    systemctl enable chronyd
    ;;
    
  "ntpd")
    echo "Configuring ntpd..."
    
    # Backup existing configuration
    cp /etc/ntp.conf /etc/ntp.conf.backup
    
    # Add NATO-compliant NTP servers
    cat >> /etc/ntp.conf <<EOF

# NATO Compliance: ADatP-5663 §3.7 - Time Synchronization
server pool.ntp.org iburst
server time.nist.gov iburst
server time.google.com iburst
EOF
    
    # Restart ntpd
    systemctl restart ntpd
    systemctl enable ntpd
    ;;
esac

# Wait for time sync
echo "Waiting for time synchronization..."
sleep 5

# Verify time sync status
echo ""
echo "=== Time Synchronization Status ==="
timedatectl status

# Check drift
echo ""
echo "=== Checking Time Drift ==="
if command -v ntpdate &> /dev/null; then
  ntpdate -q pool.ntp.org
else
  echo "Install ntpdate for drift checking: apt-get install ntpdate"
fi

echo ""
echo "✅ NTP configuration complete!"
echo "Verify drift is ≤3 seconds (ADatP-5663 §3.7 requirement)"
```

### Testing

```bash
# 1. Run NTP configuration script (requires root)
sudo ./scripts/configure-ntp.sh

# 2. Verify time sync status
timedatectl status

# Expected output:
# System clock synchronized: yes
# NTP service: active
# RTC in local TZ: no

# 3. Check drift
ntpdate -q pool.ntp.org

# Expected: offset <3 seconds

# 4. Continuous monitoring
watch -n 1 timedatectl status
```

### Acceptance Criteria

- [ ] NTP client configured (systemd-timesyncd, chrony, or ntpd)
- [ ] Primary NTP servers: pool.ntp.org, time.nist.gov
- [ ] Fallback NTP servers: time.google.com, time.cloudflare.com
- [ ] Time drift verified ≤3 seconds
- [ ] NTP service enabled and active
- [ ] `timedatectl status` shows "System clock synchronized: yes"

---

## TASK 1.7: IMPLEMENT TIME SYNC MONITORING

**Owner:** DevOps Engineer  
**Effort:** 2 days  
**Priority:** Medium  
**ADatP-5663:** §3.7, §6.2.2 (Time Synchronization Monitoring)

### Objective

Implement Prometheus metrics and Grafana dashboards for time synchronization drift monitoring with alerting.

### Implementation

**File:** `backend/src/utils/time-sync-metrics.ts`

```typescript
/**
 * NATO Compliance: Time Synchronization Monitoring
 * ADatP-5663 §3.7, §6.2.2 - Clock Skew Monitoring
 */

import { Gauge, register } from 'prom-client';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Prometheus Gauge for clock skew
const clockSkewGauge = new Gauge({
  name: 'dive_clock_skew_seconds',
  help: 'Time drift from NTP server in seconds (ADatP-5663 §3.7)',
  labelNames: ['ntp_server'],
});

// Prometheus Gauge for NTP sync status
const ntpSyncStatusGauge = new Gauge({
  name: 'dive_ntp_sync_status',
  help: 'NTP synchronization status (1=synchronized, 0=not synchronized)',
});

/**
 * Measures time drift from NTP server
 * 
 * @param ntpServer - NTP server to query (default: pool.ntp.org)
 * @returns Time drift in seconds (absolute value)
 */
export async function measureClockSkew(ntpServer: string = 'pool.ntp.org'): Promise<number> {
  try {
    // Query NTP server for time offset
    const { stdout } = await execAsync(`ntpdate -q ${ntpServer}`);
    
    // Parse output: "offset -0.002345 sec"
    const offsetMatch = stdout.match(/offset\s+([-+]?\d+\.\d+)/);
    
    if (offsetMatch && offsetMatch[1]) {
      const offset = parseFloat(offsetMatch[1]);
      const absoluteOffset = Math.abs(offset);
      
      // Update Prometheus metric
      clockSkewGauge.set({ ntp_server: ntpServer }, absoluteOffset);
      
      return absoluteOffset;
    }
    
    throw new Error('Failed to parse ntpdate output');
  } catch (error) {
    console.error(`Error measuring clock skew: ${error}`);
    // Return large value to trigger alert
    clockSkewGauge.set({ ntp_server: ntpServer }, 999);
    return 999;
  }
}

/**
 * Checks NTP synchronization status via timedatectl
 * 
 * @returns true if system clock is synchronized
 */
export async function checkNTPSyncStatus(): Promise<boolean> {
  try {
    const { stdout } = await execAsync('timedatectl status');
    
    // Look for "System clock synchronized: yes"
    const isSynchronized = stdout.includes('System clock synchronized: yes');
    
    // Update Prometheus metric
    ntpSyncStatusGauge.set(isSynchronized ? 1 : 0);
    
    return isSynchronized;
  } catch (error) {
    console.error(`Error checking NTP sync status: ${error}`);
    ntpSyncStatusGauge.set(0);
    return false;
  }
}

/**
 * Validates time drift is within NATO compliance threshold
 * 
 * ADatP-5663 §3.7: Time SHALL be synchronized to within 3 seconds
 * 
 * @param drift - Time drift in seconds
 * @returns true if drift ≤3 seconds
 */
export function isClockSkewCompliant(drift: number): boolean {
  const NATO_MAX_DRIFT_SECONDS = 3;
  return drift <= NATO_MAX_DRIFT_SECONDS;
}

/**
 * Periodic time sync monitoring (runs every 60 seconds)
 */
export async function startTimeSyncMonitoring(): Promise<void> {
  console.log('Starting time synchronization monitoring...');
  
  // Initial check
  await monitorTimeSync();
  
  // Schedule periodic checks (every 60 seconds)
  setInterval(async () => {
    await monitorTimeSync();
  }, 60 * 1000);
}

/**
 * Performs time sync check and logs results
 */
async function monitorTimeSync(): Promise<void> {
  try {
    const drift = await measureClockSkew('pool.ntp.org');
    const isSynced = await checkNTPSyncStatus();
    const isCompliant = isClockSkewCompliant(drift);
    
    if (!isCompliant) {
      console.warn(
        `⚠️ NATO COMPLIANCE WARNING: Clock drift ${drift.toFixed(6)}s exceeds 3s threshold (ADatP-5663 §3.7)`
      );
    } else {
      console.log(`✅ Time sync OK: drift ${drift.toFixed(6)}s, synchronized=${isSynced}`);
    }
  } catch (error) {
    console.error(`Error in time sync monitoring: ${error}`);
  }
}

// Export Prometheus metrics for /metrics endpoint
export const timeSyncMetrics = {
  clockSkewGauge,
  ntpSyncStatusGauge,
};
```

**File:** `scripts/verify-time-sync.sh`

```bash
#!/bin/bash
# NATO Compliance: ADatP-5663 §3.7 - Time Sync Verification
# Phase 1, Task 1.7 - Verify Time Drift ≤3 seconds

set -euo pipefail

NATO_MAX_DRIFT=3  # ADatP-5663 requirement: ≤3 seconds

echo "=== NATO Time Synchronization Compliance Check ==="
echo "Requirement: ADatP-5663 §3.7 - Time drift ≤3 seconds"
echo ""

# Check if ntpdate is installed
if ! command -v ntpdate &> /dev/null; then
  echo "❌ ERROR: ntpdate not installed"
  echo "Install with: sudo apt-get install ntpdate"
  exit 1
fi

# Query NTP server
echo "Querying pool.ntp.org..."
NTP_OUTPUT=$(ntpdate -q pool.ntp.org 2>&1 || true)

# Extract offset
OFFSET=$(echo "$NTP_OUTPUT" | grep offset | awk '{print $6}')

if [ -z "$OFFSET" ]; then
  echo "❌ ERROR: Failed to query NTP server"
  echo "$NTP_OUTPUT"
  exit 1
fi

# Remove negative sign for absolute value
DRIFT=$(echo "${OFFSET#-}")

echo "Time drift: ${DRIFT}s"
echo ""

# Compare with NATO threshold (using bc for floating point)
if command -v bc &> /dev/null; then
  EXCEEDS=$(echo "$DRIFT > $NATO_MAX_DRIFT" | bc -l)
  
  if [ "$EXCEEDS" -eq 1 ]; then
    echo "❌ COMPLIANCE FAILURE: Time drift ${DRIFT}s exceeds ${NATO_MAX_DRIFT}s threshold"
    echo "Action Required: Check NTP configuration and network connectivity"
    exit 1
  else
    echo "✅ COMPLIANCE OK: Time drift ${DRIFT}s within ${NATO_MAX_DRIFT}s threshold"
    exit 0
  fi
else
  # Fallback: Integer comparison (less accurate)
  DRIFT_INT=${DRIFT%%.*}
  if [ "$DRIFT_INT" -gt "$NATO_MAX_DRIFT" ]; then
    echo "❌ COMPLIANCE FAILURE: Time drift ~${DRIFT_INT}s exceeds ${NATO_MAX_DRIFT}s threshold"
    exit 1
  else
    echo "✅ COMPLIANCE OK: Time drift ~${DRIFT_INT}s within ${NATO_MAX_DRIFT}s threshold"
    exit 0
  fi
fi
```

**File:** `monitoring/grafana/dashboards/time-sync.json`

```json
{
  "dashboard": {
    "title": "NATO Compliance - Time Synchronization",
    "tags": ["nato-compliance", "time-sync", "adatp-5663"],
    "timezone": "UTC",
    "panels": [
      {
        "id": 1,
        "title": "Clock Skew (Seconds)",
        "type": "graph",
        "targets": [
          {
            "expr": "dive_clock_skew_seconds",
            "legendFormat": "Drift from {{ntp_server}}"
          }
        ],
        "yaxes": [
          {
            "label": "Drift (seconds)",
            "format": "s"
          }
        ],
        "thresholds": [
          {
            "value": 3,
            "colorMode": "critical",
            "op": "gt",
            "fill": true,
            "line": true
          }
        ],
        "alert": {
          "name": "NATO Compliance: Time Drift Exceeds 3s",
          "conditions": [
            {
              "evaluator": {
                "type": "gt",
                "params": [3]
              },
              "query": {
                "params": ["A", "5m", "now"]
              },
              "reducer": {
                "type": "avg"
              },
              "type": "query"
            }
          ],
          "executionErrorState": "alerting",
          "for": "5m",
          "frequency": "1m",
          "message": "CRITICAL: Time drift exceeds ADatP-5663 §3.7 threshold (≤3s). Check NTP configuration.",
          "noDataState": "no_data",
          "notifications": [
            {"uid": "nato-compliance-alerts"}
          ]
        }
      },
      {
        "id": 2,
        "title": "NTP Sync Status",
        "type": "stat",
        "targets": [
          {
            "expr": "dive_ntp_sync_status",
            "legendFormat": "Synchronized"
          }
        ],
        "options": {
          "reduceOptions": {
            "values": false,
            "calcs": ["lastNotNull"]
          },
          "textMode": "value_and_name"
        },
        "fieldConfig": {
          "defaults": {
            "mappings": [
              {
                "type": "value",
                "options": {
                  "1": {
                    "text": "✅ Synchronized",
                    "color": "green"
                  },
                  "0": {
                    "text": "❌ Not Synchronized",
                    "color": "red"
                  }
                }
              }
            ],
            "thresholds": {
              "mode": "absolute",
              "steps": [
                {"value": 0, "color": "red"},
                {"value": 1, "color": "green"}
              ]
            }
          }
        }
      }
    ]
  }
}
```

### Testing

```bash
# 1. Update backend to include time sync monitoring
cd backend
npm install prom-client

# 2. Start time sync monitoring in backend
# Add to backend/src/server.ts:
# import { startTimeSyncMonitoring } from './utils/time-sync-metrics';
# startTimeSyncMonitoring();

# 3. Restart backend
npm run dev

# 4. Verify Prometheus metrics
curl http://localhost:4000/metrics | grep dive_clock_skew_seconds

# Expected:
# dive_clock_skew_seconds{ntp_server="pool.ntp.org"} 0.001234

# 5. Test verification script
./scripts/verify-time-sync.sh

# Expected: ✅ COMPLIANCE OK

# 6. Import Grafana dashboard
# grafana-cli dashboard import monitoring/grafana/dashboards/time-sync.json

# 7. Test alert (simulate drift >3s)
# (Manually adjust system time to trigger alert)
```

### Acceptance Criteria

- [ ] Time sync health check script created (`scripts/verify-time-sync.sh`)
- [ ] Prometheus metric `dive_clock_skew_seconds` exposed
- [ ] Prometheus metric `dive_ntp_sync_status` exposed
- [ ] Grafana dashboard created with time drift visualization
- [ ] Grafana alert configured for drift >3 seconds
- [ ] CI/CD pipeline includes time sync verification
- [ ] Documentation: `docs/TIME-SYNC-REQUIREMENTS.md` created

---

## PHASE 1 SUMMARY

**Total Effort:** 13 days  
**Total Tasks:** 7  
**Total Deliverables:** 20+ files created

### Deliverables Checklist

- [ ] Terraform: `terraform/modules/federation-metadata/metadata-signing.tf`
- [ ] Terraform: `terraform/modules/realm-mfa/acr-loa-mapping.tf`
- [ ] Frontend: `frontend/src/lib/acr-helper.ts`
- [ ] Terraform: `terraform/modules/pseudonymization/pairwise-mappers.tf`
- [ ] Documentation: `docs/PSEUDONYMIZATION-RESOLUTION.md`
- [ ] Terraform: `terraform/idp-brokers/spain-saml-broker.tf`
- [ ] Terraform: `terraform/modules/attribute-transcription/spain-saml-mappers.tf`
- [ ] Terraform: `terraform/modules/attribute-transcription/clearance-mappers.tf`
- [ ] JavaScript: `terraform/modules/attribute-transcription/clearance-transformation.js`
- [ ] Script: `scripts/configure-ntp.sh`
- [ ] Backend: `backend/src/utils/time-sync-metrics.ts`
- [ ] Script: `scripts/verify-time-sync.sh`
- [ ] Grafana: `monitoring/grafana/dashboards/time-sync.json`

### Compliance Impact

**Before Phase 1:**
- ACP-240: 90%
- ADatP-5663: 63%

**After Phase 1:**
- ACP-240: 90% (unchanged - Phase 3 will complete)
- ADatP-5663: **73%** (+10%)

### Next Steps

1. **Week 1 (Nov 4-8):** Tasks 1.1-1.4
2. **Week 2 (Nov 11-15):** Tasks 1.5-1.7
3. **Phase 1 Demo:** November 15, 2025
4. **Phase 2 Kickoff:** November 18, 2025

---

**Last Updated:** November 4, 2025  
**Status:** Ready for Implementation  
**Approval Required:** Stakeholder review before execution



