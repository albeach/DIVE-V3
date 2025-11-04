# ============================================
# Keycloak Provider Configuration
# ============================================
# v2.0.0: Extracted from main.tf for better organization

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

