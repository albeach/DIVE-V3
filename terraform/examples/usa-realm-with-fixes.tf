# ============================================
# EXAMPLE: USA Realm with v2.0.0 Fixes
# ============================================
# This example shows how to use the fixed modules
# with proper authentication flow and test users

# ============================================
# 1. Apply MFA Module (Fixed Flow Structure)
# ============================================

module "usa_mfa" {
  source = "../modules/realm-mfa"
  
  realm_id           = keycloak_realm.dive_v3_usa.id
  realm_name         = "dive-v3-usa"
  realm_display_name = "United States"
  
  # Clearance-based MFA configuration
  clearance_attribute_name       = "clearance"
  clearance_attribute_value_regex = "^(?!UNCLASSIFIED$).*"  # Not used anymore (split into specific conditions)
  
  # Direct Grant DEPRECATED in v2.0.0
  enable_direct_grant_mfa = false
  
  # Use custom flow (not standard browser flow)
  use_standard_browser_flow = false
}

# ============================================
# 2. Create Test Users (4 per realm)
# ============================================

module "usa_test_users" {
  source = "../modules/realm-test-users"
  
  realm_id           = keycloak_realm.dive_v3_usa.id
  realm_name         = "dive-v3-usa"
  country_code       = "USA"
  country_code_lower = "usa"
  email_domain       = "example.mil"
  duty_org           = "US_ARMY"
  
  # Country-specific clearance mapping (USA uses standard names)
  clearance_mappings = {
    "UNCLASSIFIED" = "UNCLASSIFIED"
    "CONFIDENTIAL" = "CONFIDENTIAL"
    "SECRET"       = "SECRET"
    "TOP_SECRET"   = "TOP SECRET"
  }
  
  # COI tags by clearance level
  coi_confidential = []  # Basic access, no special COI
  coi_secret       = ["NATO-COSMIC"]
  coi_top_secret   = ["NATO-COSMIC", "FVEY", "CAN-US"]
}

# ============================================
# 3. Authentication Flow Visual
# ============================================

# The resulting flow structure:
#
# Classified Access Browser Flow - United States
# ├─ Cookie (ALTERNATIVE)
# │  └─ Reuses existing SSO session
# └─ Forms (ALTERNATIVE) ← NEW: Subflow containing auth + MFA
#    ├─ Username-Password (REQUIRED) ← Authenticates user FIRST
#    ├─ Conditional WebAuthn (CONDITIONAL)
#    │  ├─ Condition: clearance == "TOP_SECRET"
#    │  └─ WebAuthn Authenticator (REQUIRED)
#    │     └─ ACR=2, AMR=hwk (AAL3)
#    └─ Conditional OTP (CONDITIONAL)
#       ├─ Condition: clearance in (CONFIDENTIAL, SECRET)
#       └─ OTP Form (REQUIRED)
#          └─ ACR=1, AMR=otp (AAL2)
#
# UNCLASSIFIED users: Neither conditional triggers → AAL1 (password only)

# ============================================
# 4. Test Users Created
# ============================================

# The module creates these users:
#
# 1. testuser-usa-unclass
#    - Clearance: UNCLASSIFIED
#    - AAL: 1 (password only)
#    - COI: []
#
# 2. testuser-usa-confidential
#    - Clearance: CONFIDENTIAL
#    - AAL: 2 (password + OTP)
#    - COI: []
#    - Required Action: CONFIGURE_TOTP
#
# 3. testuser-usa-secret
#    - Clearance: SECRET
#    - AAL: 2 (password + OTP)
#    - COI: ["NATO-COSMIC"]
#    - Required Action: CONFIGURE_TOTP
#
# 4. testuser-usa-ts
#    - Clearance: TOP_SECRET
#    - AAL: 3 (password + WebAuthn)
#    - COI: ["NATO-COSMIC", "FVEY", "CAN-US"]
#    - Required Action: webauthn-register

# ============================================
# 5. Expected Token Claims
# ============================================

# UNCLASSIFIED user token:
# {
#   "acr": "0",
#   "amr": ["pwd"],
#   "clearance": "UNCLASSIFIED",
#   "uniqueID": "testuser-usa-unclass@example.mil",
#   "countryOfAffiliation": "USA",
#   "acpCOI": []
# }

# SECRET user token:
# {
#   "acr": "1",
#   "amr": ["pwd", "otp"],
#   "clearance": "SECRET",
#   "uniqueID": "testuser-usa-secret@example.mil",
#   "countryOfAffiliation": "USA",
#   "acpCOI": ["NATO-COSMIC"]
# }

# TOP_SECRET user token:
# {
#   "acr": "2",
#   "amr": ["pwd", "hwk"],
#   "clearance": "TOP_SECRET",
#   "uniqueID": "testuser-usa-ts@example.mil",
#   "countryOfAffiliation": "USA",
#   "acpCOI": ["NATO-COSMIC", "FVEY", "CAN-US"]
# }

