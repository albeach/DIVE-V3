# Federated Instance Module - Test Users
# Creates standardized test users for pilot demonstrations
#
# PILOT STANDARD:
#   - 4 users per instance with predictable naming
#   - Format: testuser-{code}-{level}
#   - Level 1-4 corresponds to clearance (higher = more access)
#   - Single password for all: TestUser2025!Pilot
#
# Quick Reference:
#   testuser-usa-1 / TestUser2025!Pilot → UNCLASSIFIED
#   testuser-usa-2 / TestUser2025!Pilot → CONFIDENTIAL
#   testuser-usa-3 / TestUser2025!Pilot → SECRET
#   testuser-usa-4 / TestUser2025!Pilot → TOP_SECRET
#
# Cross-border example:
#   Login to FRA instance as testuser-deu-3 → German SECRET user on French system

# ============================================================================
# LOCAL VARIABLES
# ============================================================================

locals {
  # NIST 800-63B Compliant Passwords (Phase 1 - Nov 27, 2025)
  # Admin: 26 chars, high entropy, rotated quarterly
  # Test users: 19 chars, memorable for demos, secure
  admin_password     = "DivePilot2025!SecureAdmin"
  pilot_password     = "TestUser2025!Pilot"

  # Clearance levels mapped to numbers (1=lowest, 4=highest)
  clearance_levels = {
    "1" = {
      clearance         = "UNCLASSIFIED"
      coi               = []
      display_name      = "Level 1 - Unclassified"
      organization_type = "GOV" # Government by default
    }
    "2" = {
      clearance         = "CONFIDENTIAL"
      coi               = []
      display_name      = "Level 2 - Confidential"
      organization_type = "GOV"
    }
    "3" = {
      clearance         = "SECRET"
      coi               = ["NATO"]
      display_name      = "Level 3 - Secret"
      organization_type = "GOV"
    }
    "4" = {
      clearance         = "TOP_SECRET"
      coi               = ["FVEY", "NATO-COSMIC"]
      display_name      = "Level 4 - Top Secret"
      organization_type = "GOV"
    }
  }

  # Industry partner test users (ACP-240 Section 4.2)
  # Real company names per country for realistic pilot demos
  # Each country has ONE endorsed industry partner
  industry_partners = {
    "USA" = {
      company_name  = "Booz Allen Hamilton"
      company_short = "bah"
      email_domain  = "bah.com"
      clearance     = "SECRET"
      coi           = ["NATO"]
    }
    "DEU" = {
      company_name  = "IABG"
      company_short = "iabg"
      email_domain  = "iabg.de"
      clearance     = "SECRET"
      coi           = ["NATO"]
    }
    "FRA" = {
      company_name  = "Thales"
      company_short = "thales"
      email_domain  = "thalesgroup.com"
      clearance     = "SECRET"
      coi           = ["NATO"]
    }
  }

  # Get this instance's industry partner (if defined)
  this_industry_partner = lookup(local.industry_partners, var.instance_code, null)
}

# ============================================================================
# TEST USERS RESOURCE
# ============================================================================

resource "keycloak_user" "pilot_users" {
  for_each = var.create_test_users ? local.clearance_levels : {}

  realm_id   = keycloak_realm.broker.id
  username   = "testuser-${lower(var.instance_code)}-${each.key}"
  enabled    = true
  email      = "testuser-${lower(var.instance_code)}-${each.key}@dive-demo.example"
  first_name = "Test User"
  last_name  = "${upper(var.instance_code)}-${each.key}"

  initial_password {
    value     = local.pilot_password
    temporary = false
  }

  attributes = {
    # Core DIVE attributes
    clearance            = each.value.clearance
    countryOfAffiliation = var.instance_code
    uniqueID             = "testuser-${lower(var.instance_code)}-${each.key}"

    # Extended attributes
    userType         = "military"
    organization     = "${var.instance_name} Defense"
    organizationType = each.value.organization_type # ACP-240 Section 4.2
    acpCOI           = jsonencode(each.value.coi)

    # Pilot metadata
    pilot_user      = "true"
    clearance_level = each.key
    created_by      = "terraform"
  }

  lifecycle {
    ignore_changes = [initial_password]
  }
}

# ============================================================================
# INDUSTRY PARTNER TEST USERS (ACP-240 Section 4.2)
# ============================================================================
# Named industry partners per country for realistic pilot demos:
#   USA: Booz Allen Hamilton (BAH) - contractor.bah@bah.com
#   DEU: IABG - contractor.iabg@iabg.de
#   FRA: Thales - contractor.thales@thalesgroup.com
#
# Each industry user is endorsed by their home country (primaryEndorser)

resource "keycloak_user" "industry_partner" {
  count = var.create_test_users && local.this_industry_partner != null ? 1 : 0

  realm_id   = keycloak_realm.broker.id
  username   = "contractor.${local.this_industry_partner.company_short}"
  enabled    = true
  email      = "contractor.${local.this_industry_partner.company_short}@${local.this_industry_partner.email_domain}"
  first_name = "Contractor"
  last_name  = local.this_industry_partner.company_name

  initial_password {
    value     = local.pilot_password
    temporary = false
  }

  attributes = {
    # Core DIVE attributes
    clearance            = local.this_industry_partner.clearance
    countryOfAffiliation = var.instance_code
    uniqueID             = "contractor.${local.this_industry_partner.company_short}@${local.this_industry_partner.email_domain}"

    # Industry-specific attributes (Primary Endorser Model)
    organizationType = "INDUSTRY"
    organization     = local.this_industry_partner.company_name
    primaryEndorser  = var.instance_code # This country endorses this contractor
    userType         = "contractor"
    acpCOI           = jsonencode(local.this_industry_partner.coi)

    # Pilot metadata
    pilot_user    = "true"
    industry_user = "true"
    created_by    = "terraform"
  }

  lifecycle {
    ignore_changes = [initial_password]
  }
}

# ============================================================================
# OUTPUTS
# ============================================================================

output "pilot_users" {
  description = "Pilot test users created for this instance"
  value = var.create_test_users ? {
    for level, config in local.clearance_levels : "level_${level}" => {
      username          = "testuser-${lower(var.instance_code)}-${level}"
      clearance         = config.clearance
      organization_type = config.organization_type
      password          = local.pilot_password
    }
  } : {}
  sensitive = true
}

output "industry_partner" {
  description = "Industry partner for this instance"
  value = var.create_test_users && local.this_industry_partner != null ? {
    username  = "contractor.${local.this_industry_partner.company_short}"
    company   = local.this_industry_partner.company_name
    clearance = local.this_industry_partner.clearance
    endorser  = var.instance_code
    password  = local.pilot_password
  } : null
  sensitive = true
}

output "pilot_user_credentials" {
  description = "Quick reference for demo credentials"
  value = var.create_test_users ? (
    local.this_industry_partner != null
    ? "GOV: testuser-${lower(var.instance_code)}-{1,2,3,4} / DiveDemo2025! | INDUSTRY: contractor.${local.this_industry_partner.company_short} / DiveDemo2025!"
    : "GOV: testuser-${lower(var.instance_code)}-{1,2,3,4} / DiveDemo2025!"
  ) : "Test users not created"
}
