# ============================================
# Shared Mappers Module - Version Configuration
# ============================================

terraform {
  required_version = ">= 1.0"

  required_providers {
    keycloak = {
      source  = "keycloak/keycloak"
      version = "~> 5.0"
    }
  }
}

