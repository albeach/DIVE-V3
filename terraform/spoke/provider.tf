# =============================================================================
# DIVE V3 Spoke - Terraform Provider Configuration
# =============================================================================

terraform {
  required_version = ">= 1.0.0"
  
  required_providers {
    keycloak = {
      source  = "keycloak/keycloak"
      version = ">= 4.0.0"
    }
  }
}

provider "keycloak" {
  client_id = "admin-cli"
  username  = var.keycloak_admin_username
  password  = var.keycloak_admin_password
  # Use keycloak_url if provided, otherwise fall back to idp_url
  url       = coalesce(var.keycloak_url, var.idp_url)
  
  # Self-signed certs in local development
  tls_insecure_skip_verify = true
}

