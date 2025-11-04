# ============================================
# Terraform & Provider Configuration - v2.0.0
# ============================================

terraform {
  required_version = ">= 1.13.4"
  
  required_providers {
    keycloak = {
      source  = "keycloak/keycloak"
      version = "~> 5.0"
    }
  }
}

provider "keycloak" {
  client_id     = "admin-cli"
  username      = var.keycloak_admin_username
  password      = var.keycloak_admin_password
  url           = var.keycloak_url
  realm         = "master"
  initial_login = true

  # Development: Skip TLS verification for self-signed certificates
  tls_insecure_skip_verify = true
}
