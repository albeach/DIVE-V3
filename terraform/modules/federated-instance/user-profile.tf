# Federated Instance Module - User Profile Configuration
# Keycloak 26+ requires User Profile to define allowed custom attributes
#
# CRITICAL: Without this, custom user attributes (clearance, countryOfAffiliation, etc.)
# cannot be set on users. The User Profile must be configured BEFORE creating users
# with custom attributes.

# ============================================================================
# USER PROFILE - Define allowed custom attributes
# ============================================================================
resource "keycloak_realm_user_profile" "dive_attributes" {
  realm_id = keycloak_realm.broker.id

  # ============================================
  # STANDARD KEYCLOAK ATTRIBUTES
  # ============================================
  attribute {
    name         = "username"
    display_name = "$${username}"

    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }

    validator {
      name = "length"
      config = {
        min = "3"
        max = "255"
      }
    }

    validator {
      name = "username-prohibited-characters"
    }

    validator {
      name = "up-username-not-idn-homograph"
    }
  }

  # ============================================
  # PII FIELDS - NOT REQUIRED (ACP-240 Compliance)
  # ============================================
  # ACP-240 requires PII minimization. DIVE V3 uses pseudonymous identities
  # with uniqueID as the primary identifier. Email, firstName, lastName are
  # OPTIONAL and should NOT trigger VERIFY_PROFILE required actions.

  attribute {
    name         = "email"
    display_name = "$${email}"

    # NOT required - ACP-240 PII minimization
    # required_for_roles = ["user"]  # REMOVED

    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }

    validator {
      name = "email"
    }

    validator {
      name = "length"
      config = {
        max = "255"
      }
    }
  }

  attribute {
    name         = "firstName"
    display_name = "$${firstName}"

    # NOT required - ACP-240 PII minimization
    # required_for_roles = ["user"]  # REMOVED

    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }

    validator {
      name = "length"
      config = {
        max = "255"
      }
    }

    validator {
      name = "person-name-prohibited-characters"
    }
  }

  attribute {
    name         = "lastName"
    display_name = "$${lastName}"

    # NOT required - ACP-240 PII minimization
    # required_for_roles = ["user"]  # REMOVED

    permissions {
      view = ["admin", "user"]
      edit = ["admin", "user"]
    }

    validator {
      name = "length"
      config = {
        max = "255"
      }
    }

    validator {
      name = "person-name-prohibited-characters"
    }
  }

  # ============================================
  # DIVE V3 CUSTOM ATTRIBUTES
  # ============================================

  # Security Clearance (UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET)
  attribute {
    name         = "clearance"
    display_name = "Security Clearance"
    group        = "dive-attributes"

    permissions {
      view = ["admin"]
      edit = ["admin"]
    }

    validator {
      name = "options"
      config = {
        options = "[\"UNCLASSIFIED\",\"CONFIDENTIAL\",\"SECRET\",\"TOP_SECRET\"]"
      }
    }
  }

  # Country of Affiliation (ISO 3166-1 alpha-3)
  attribute {
    name         = "countryOfAffiliation"
    display_name = "Country of Affiliation"
    group        = "dive-attributes"

    permissions {
      view = ["admin"]
      edit = ["admin"]
    }

    validator {
      name = "length"
      config = {
        min = "3"
        max = "3"
      }
    }
  }

  # Unique ID (user identifier for audit logs)
  attribute {
    name         = "uniqueID"
    display_name = "Unique ID"
    group        = "dive-attributes"

    permissions {
      view = ["admin"]
      edit = ["admin"]
    }

    validator {
      name = "length"
      config = {
        min = "3"
        max = "255"
      }
    }
  }

  # User Type (military, civilian, contractor)
  attribute {
    name         = "userType"
    display_name = "User Type"
    group        = "dive-attributes"

    permissions {
      view = ["admin"]
      edit = ["admin"]
    }
  }

  # Organization
  attribute {
    name         = "organization"
    display_name = "Organization"
    group        = "dive-attributes"

    permissions {
      view = ["admin"]
      edit = ["admin"]
    }
  }

  # Organization Type (GOV, MIL, INDUSTRY) - ACP-240 Section 4.2
  attribute {
    name         = "organizationType"
    display_name = "Organization Type"
    group        = "dive-attributes"

    permissions {
      view = ["admin"]
      edit = ["admin"]
    }

    validator {
      name = "options"
      config = {
        options = "[\"GOV\",\"MIL\",\"INDUSTRY\"]"
      }
    }
  }

  # Original Country-Specific Clearance (audit trail)
  attribute {
    name         = "clearanceOriginal"
    display_name = "Original Clearance"
    group        = "dive-attributes"

    permissions {
      view = ["admin"]
      edit = ["admin"]
    }
  }

  # Duty Organization (from IdP)
  attribute {
    name         = "dutyOrg"
    display_name = "Duty Organization"
    group        = "dive-attributes"

    permissions {
      view = ["admin"]
      edit = ["admin"]
    }
  }

  # Organizational Unit (from IdP)
  attribute {
    name         = "orgUnit"
    display_name = "Organizational Unit"
    group        = "dive-attributes"

    permissions {
      view = ["admin"]
      edit = ["admin"]
    }
  }

  # Communities of Interest (multi-valued for coalition access)
  # Users may belong to multiple COIs: NATO, FVEY, NATO-COSMIC, EU-RESTRICTED, etc.
  attribute {
    name         = "acpCOI"
    display_name = "Communities of Interest"
    group        = "dive-attributes"

    # Allow multiple COI values (0 to 10 values)
    multi_valued = true

    annotations = {
      "inputType" = "multiselect"
    }

    permissions {
      view = ["admin"]
      edit = ["admin"]
    }

    validator {
      name = "length"
      config = {
        min = "0"  # COI is optional
        max = "50" # Max COI name length
      }
    }
  }

  # ============================================
  # AUTHENTICATION CONTEXT ATTRIBUTES (AMR/ACR)
  # ============================================
  # These attributes store authentication method references (AMR) and
  # authentication context class reference (ACR) for federated users.
  # Set by the dive-amr-enrichment event listener on login.

  # Authentication Methods Reference (AMR)
  # Values: pwd (password), otp (TOTP), hwk (WebAuthn)
  attribute {
    name         = "amr"
    display_name = "Authentication Methods"
    group        = "dive-attributes"

    multi_valued = true

    permissions {
      view = ["admin"]
      edit = ["admin"]
    }
  }

  # Authentication Context Class Reference (ACR)
  # Values: 0 (AAL1), 1 (AAL2 - but event listener uses this), 2 (AAL2/3)
  attribute {
    name         = "acr"
    display_name = "Authentication Context"
    group        = "dive-attributes"

    permissions {
      view = ["admin"]
      edit = ["admin"]
    }
  }

  # Pilot User Flag
  attribute {
    name         = "pilot_user"
    display_name = "Pilot User"
    group        = "dive-attributes"

    permissions {
      view = ["admin"]
      edit = ["admin"]
    }
  }

  # Clearance Level (numeric 1-4)
  attribute {
    name         = "clearance_level"
    display_name = "Clearance Level"
    group        = "dive-attributes"

    permissions {
      view = ["admin"]
      edit = ["admin"]
    }

    validator {
      name = "pattern"
      config = {
        "pattern"       = "^[1-4]$"
        "error-message" = "Clearance level must be 1-4"
      }
    }
  }

  # Created By (terraform, manual, etc.)
  attribute {
    name         = "created_by"
    display_name = "Created By"
    group        = "dive-attributes"

    permissions {
      view = ["admin"]
      edit = ["admin"]
    }
  }

  # Primary Endorser (for industry users)
  attribute {
    name         = "primaryEndorser"
    display_name = "Primary Endorser"
    group        = "dive-attributes"

    permissions {
      view = ["admin"]
      edit = ["admin"]
    }
  }

  # Industry User Flag
  attribute {
    name         = "industry_user"
    display_name = "Industry User"
    group        = "dive-attributes"

    permissions {
      view = ["admin"]
      edit = ["admin"]
    }
  }

  # ============================================
  # ATTRIBUTE GROUPS
  # ============================================
  group {
    name                = "user-metadata"
    display_header      = "User Metadata"
    display_description = "Attributes which refer to user metadata"
  }

  group {
    name                = "dive-attributes"
    display_header      = "DIVE V3 Attributes"
    display_description = "Security clearance and coalition attributes for DIVE V3"
  }
}




