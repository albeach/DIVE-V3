# ============================================
# DIVE V3 Test Users Module
# ============================================
# Creates 4 test users per realm with varied clearances and acpCOI tags
# Version: 2.0.0
#
# Test Matrix per Realm:
# 1. UNCLASSIFIED user (AAL1: password only)
# 2. CONFIDENTIAL user (AAL2: password + OTP)
# 3. SECRET user (AAL2: password + OTP)
# 4. TOP_SECRET user (AAL3: password + WebAuthn)

# ============================================
# User 1: UNCLASSIFIED (AAL1 - Password Only)
# ============================================

resource "keycloak_user" "test_user_unclass" {
  realm_id = var.realm_id
  # Short username for easy login - uniqueID stored as attribute
  username = "testuser-${var.country_code_lower}-unclass"
  enabled  = true

  email          = "testuser-${var.country_code_lower}-unclass@${var.email_domain}"
  email_verified = true
  first_name     = "Test"
  last_name      = "User Unclassified"

  initial_password {
    value     = var.default_password
    temporary = false
  }

  attributes = {
    uniqueID             = "testuser-${var.country_code_lower}-unclass@${var.email_domain}"
    clearance            = "UNCLASSIFIED"
    clearanceOriginal    = var.clearance_mappings["UNCLASSIFIED"] # Country-specific
    countryOfAffiliation = var.country_code
    acpCOI               = jsonencode([]) # No COI for unclassified
    dutyOrg              = var.duty_org
    orgUnit              = "OPERATIONS"
    # AAL1 - Password only (sufficient for UNCLASSIFIED)
    acr = "0"                 # AAL1
    amr = jsonencode(["pwd"]) # Password only
  }
}

# ============================================
# User 2: CONFIDENTIAL (AAL2 - Password + OTP)
# ============================================

resource "keycloak_user" "test_user_confidential" {
  realm_id = var.realm_id
  # Short username for easy login - uniqueID stored as attribute
  username = "testuser-${var.country_code_lower}-confidential"
  enabled  = true

  email          = "testuser-${var.country_code_lower}-confidential@${var.email_domain}"
  email_verified = true
  first_name     = "Test"
  last_name      = "User Confidential"

  initial_password {
    value     = var.default_password
    temporary = false
  }

  # Require OTP setup on first login
  required_actions = [
    "CONFIGURE_TOTP" # Native Keycloak required action
  ]

  attributes = {
    uniqueID             = "testuser-${var.country_code_lower}-confidential@${var.email_domain}"
    clearance            = "CONFIDENTIAL"
    clearanceOriginal    = var.clearance_mappings["CONFIDENTIAL"]
    countryOfAffiliation = var.country_code
    acpCOI               = jsonencode(var.coi_confidential) # Basic COI
    dutyOrg              = var.duty_org
    orgUnit              = "INTELLIGENCE"
    # AAL2 - Password + OTP (required for CONFIDENTIAL)
    acr = "1"                        # AAL2
    amr = jsonencode(["pwd", "otp"]) # Password + OTP
  }
}

# ============================================
# User 3: SECRET (AAL2 - Password + OTP)
# ============================================

resource "keycloak_user" "test_user_secret" {
  realm_id = var.realm_id
  # Short username for easy login - uniqueID stored as attribute
  username = "testuser-${var.country_code_lower}-secret"
  enabled  = true

  email          = "testuser-${var.country_code_lower}-secret@${var.email_domain}"
  email_verified = true
  first_name     = "Test"
  last_name      = "User Secret"

  initial_password {
    value     = var.default_password
    temporary = false
  }

  # Require OTP setup on first login
  required_actions = [
    "CONFIGURE_TOTP"
  ]

  attributes = {
    uniqueID             = "testuser-${var.country_code_lower}-secret@${var.email_domain}"
    clearance            = "SECRET"
    clearanceOriginal    = var.clearance_mappings["SECRET"]
    countryOfAffiliation = var.country_code
    acpCOI               = jsonencode(var.coi_secret) # Enhanced COI
    dutyOrg              = var.duty_org
    orgUnit              = "CYBER_DEFENSE"
    # AAL2 - Password + OTP (required for SECRET)
    acr = "1"                        # AAL2
    amr = jsonencode(["pwd", "otp"]) # Password + OTP
  }
}

# ============================================
# User 4: TOP_SECRET (AAL3 - Password + WebAuthn)
# ============================================

resource "keycloak_user" "test_user_top_secret" {
  realm_id = var.realm_id
  # Short username for easy login - uniqueID stored as attribute
  username = "testuser-${var.country_code_lower}-ts"
  enabled  = true

  email          = "testuser-${var.country_code_lower}-ts@${var.email_domain}"
  email_verified = true
  first_name     = "Test"
  last_name      = "User Top Secret"

  initial_password {
    value     = var.default_password
    temporary = false
  }

  # Require WebAuthn (passkey) setup on first login
  required_actions = [
    "webauthn-register" # Native Keycloak WebAuthn registration
  ]

  attributes = {
    uniqueID             = "testuser-${var.country_code_lower}-ts@${var.email_domain}"
    clearance            = "TOP_SECRET"
    clearanceOriginal    = var.clearance_mappings["TOP_SECRET"]
    countryOfAffiliation = var.country_code
    acpCOI               = jsonencode(var.coi_top_secret) # Full COI access
    dutyOrg              = var.duty_org
    orgUnit              = "SPECIAL_OPERATIONS"
    # AAL3 - Password + WebAuthn (required for TOP_SECRET)
    acr = "2"                        # AAL3
    amr = jsonencode(["pwd", "hwk"]) # Password + Hardware Key (WebAuthn)
  }
}

# ============================================
# Outputs
# ============================================

output "test_users_created" {
  description = "List of test users created in this realm"
  value = {
    unclassified = keycloak_user.test_user_unclass.username
    confidential = keycloak_user.test_user_confidential.username
    secret       = keycloak_user.test_user_secret.username
    top_secret   = keycloak_user.test_user_top_secret.username
  }
}

