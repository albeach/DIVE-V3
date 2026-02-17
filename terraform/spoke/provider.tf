# =============================================================================
# DIVE V3 Spoke - Terraform Provider Configuration
# =============================================================================

terraform {
  required_version = ">= 1.0.0"

  required_providers {
    keycloak = {
      source  = "keycloak/keycloak"
      version = "~> 5.6.0"
    }
  }
}

provider "keycloak" {
  client_id                = "admin-cli"
  username                 = var.keycloak_admin_username
  password                 = var.keycloak_admin_password
  url                      = coalesce(var.keycloak_url, var.idp_url)
  tls_insecure_skip_verify = true
}

