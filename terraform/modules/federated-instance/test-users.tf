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
      clearance    = "UNCLASSIFIED"
      coi          = []
      display_name = "Level 1 - Unclassified"
    }
    "2" = {
      clearance    = "CONFIDENTIAL"
      coi          = []
      display_name = "Level 2 - Confidential"
    }
    "3" = {
      clearance    = "SECRET"
      coi          = ["NATO"]
      display_name = "Level 3 - Secret"
    }
    "4" = {
      clearance    = "TOP_SECRET"
      coi          = ["FVEY", "NATO-COSMIC"]
      display_name = "Level 4 - Top Secret"
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
    userType     = "military"
    organization = "${var.instance_name} Defense"
    acpCOI       = jsonencode(each.value.coi)
    
    # Pilot metadata
    pilot_user     = "true"
    clearance_level = each.key
    created_by     = "terraform"
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
      username  = "testuser-${lower(var.instance_code)}-${level}"
      clearance = config.clearance
      password  = local.pilot_password
    }
  } : {}
  sensitive = true
}

output "pilot_user_credentials" {
  description = "Quick reference for demo credentials"
  value = var.create_test_users ? "testuser-${lower(var.instance_code)}-{1,2,3,4} / DiveDemo2025! (1=UNCLASSIFIED, 4=TOP_SECRET)" : "Test users not created"
}
