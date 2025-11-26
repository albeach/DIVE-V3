# Federated Instance Module - Test Users
# Creates standardized test users for pilot demonstrations
#
# PILOT STANDARD:
#   - 4 users per instance with predictable naming
#   - Format: testuser-{code}-{level}
#   - Level 1-4 corresponds to clearance (higher = more access)
#   - Single password for all: DiveDemo2025!
#
# Quick Reference:
#   testuser-usa-1 / DiveDemo2025! → UNCLASSIFIED
#   testuser-usa-2 / DiveDemo2025! → CONFIDENTIAL
#   testuser-usa-3 / DiveDemo2025! → SECRET
#   testuser-usa-4 / DiveDemo2025! → TOP_SECRET
#
# Cross-border example:
#   Login to FRA instance as testuser-deu-3 → German SECRET user on French system

# ============================================================================
# LOCAL VARIABLES
# ============================================================================

locals {
  # Standard password for all pilot test users
  pilot_password = "DiveDemo2025!"

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
  # Format: testuser-{code}-industry-{level}
  # Level 1-2 = UNCLASSIFIED/CONFIDENTIAL (typical industry clearances)
  industry_users = {
    "1" = {
      clearance         = "UNCLASSIFIED"
      coi               = []
      display_name      = "Industry Level 1 - Unclassified"
      organization_type = "INDUSTRY"
    }
    "2" = {
      clearance         = "CONFIDENTIAL"
      coi               = []
      display_name      = "Industry Level 2 - Confidential"
      organization_type = "INDUSTRY"
    }
    "3" = {
      clearance         = "SECRET"
      coi               = ["NATO"]
      display_name      = "Industry Level 3 - Secret (Cleared Contractor)"
      organization_type = "INDUSTRY"
    }
  }
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
# Cleared contractors and industry partners for testing industry access control
# Format: testuser-{code}-industry-{level}
# Example: testuser-deu-industry-2 = German industry partner with CONFIDENTIAL clearance

resource "keycloak_user" "industry_users" {
  for_each = var.create_test_users ? local.industry_users : {}

  realm_id   = keycloak_realm.broker.id
  username   = "testuser-${lower(var.instance_code)}-industry-${each.key}"
  enabled    = true
  email      = "testuser-${lower(var.instance_code)}-industry-${each.key}@contractor.example"
  first_name = "Industry Partner"
  last_name  = "${upper(var.instance_code)}-${each.key}"

  initial_password {
    value     = local.pilot_password
    temporary = false
  }

  attributes = {
    # Core DIVE attributes
    clearance            = each.value.clearance
    countryOfAffiliation = var.instance_code
    uniqueID             = "testuser-${lower(var.instance_code)}-industry-${each.key}"

    # Extended attributes - INDUSTRY type
    userType         = "contractor"
    organization     = "${var.instance_name} Industry Partner"
    organizationType = each.value.organization_type # INDUSTRY
    acpCOI           = jsonencode(each.value.coi)

    # Pilot metadata
    pilot_user      = "true"
    clearance_level = each.key
    industry_user   = "true" # Flag for easy identification
    created_by      = "terraform"
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

output "industry_users" {
  description = "Industry partner test users created for this instance"
  value = var.create_test_users ? {
    for level, config in local.industry_users : "industry_${level}" => {
      username          = "testuser-${lower(var.instance_code)}-industry-${level}"
      clearance         = config.clearance
      organization_type = config.organization_type
      password          = local.pilot_password
    }
  } : {}
  sensitive = true
}

output "pilot_user_credentials" {
  description = "Quick reference for demo credentials"
  value       = var.create_test_users ? "GOV: testuser-${lower(var.instance_code)}-{1,2,3,4} / DiveDemo2025! | INDUSTRY: testuser-${lower(var.instance_code)}-industry-{1,2,3} / DiveDemo2025!" : "Test users not created"
}
