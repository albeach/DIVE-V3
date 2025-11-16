# ============================================
# Terraform Module: Required Providers
# ============================================

terraform {
  required_version = ">= 1.13.4"

  required_providers {
    keycloak = {
      source  = "keycloak/keycloak"
      version = "~> 5.0" # Official Keycloak provider - Use latest 5.x
    }
  }
}

