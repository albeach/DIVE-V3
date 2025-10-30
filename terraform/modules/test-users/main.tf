# ============================================
# Test Users Module
# ============================================
# Creates test users for E2E testing with proper clearance levels
# and MFA configuration

terraform {
  required_providers {
    keycloak = {
      source  = "keycloak/keycloak"
      version = "~> 5.0"
    }
  }
}

# ============================================
# UNCLASSIFIED User - No MFA Required
# ============================================
resource "keycloak_user" "testuser_unclass" {
  realm_id   = var.realm_id
  username   = "testuser-unclass"
  enabled    = true
  
  email      = "testuser-unclass@dive-v3.pilot"
  email_verified = true
  first_name = "Unclass"
  last_name  = "User"
  
  initial_password {
    value     = var.unclass_password
    temporary = false
  }
  
  attributes = {
    clearance              = "UNCLASSIFIED"
    countryOfAffiliation   = "USA"
    uniqueID               = "testuser-unclass"
  }
}

# ============================================
# SECRET User - MFA Required, OTP Pre-configured
# ============================================
resource "keycloak_user" "testuser_secret" {
  realm_id   = var.realm_id
  username   = "testuser-secret"
  enabled    = true
  
  email      = "testuser-secret@dive-v3.pilot"
  email_verified = true
  first_name = "Secret"
  last_name  = "User"
  
  initial_password {
    value     = var.secret_password
    temporary = false
  }
  
  attributes = {
    clearance              = "SECRET"
    countryOfAffiliation   = "USA"
    uniqueID               = "testuser-secret"
    # Pre-configured OTP secret for E2E tests
    # Secret: ONSWG4TFOQFA====
    # This allows the test to generate valid codes
  }
  
  # Note: OTP configuration must be done via Keycloak Admin API
  # after user creation, as Terraform doesn't support OTP credentials directly
}

# ============================================
# CONFIDENTIAL User - MFA Required, No OTP Yet
# ============================================
resource "keycloak_user" "testuser_confidential" {
  realm_id   = var.realm_id
  username   = "testuser-confidential"
  enabled    = true
  
  email      = "testuser-confidential@dive-v3.pilot"
  email_verified = true
  first_name = "Confidential"
  last_name  = "User"
  
  initial_password {
    value     = var.confidential_password
    temporary = false
  }
  
  attributes = {
    clearance              = "CONFIDENTIAL"
    countryOfAffiliation   = "USA"
    uniqueID               = "testuser-confidential"
  }
}

# ============================================
# Outputs
# ============================================
output "testuser_unclass_id" {
  description = "Keycloak user ID for testuser-unclass"
  value       = keycloak_user.testuser_unclass.id
}

output "testuser_secret_id" {
  description = "Keycloak user ID for testuser-secret"
  value       = keycloak_user.testuser_secret.id
}

output "testuser_confidential_id" {
  description = "Keycloak user ID for testuser-confidential"
  value       = keycloak_user.testuser_confidential.id
}

