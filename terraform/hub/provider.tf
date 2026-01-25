terraform {
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
  url                      = var.keycloak_url
  tls_insecure_skip_verify = true # Self-signed certs (mkcert)
  
  # =============================================================================
  # PERFORMANCE OPTIMIZATION: Provider timeouts
  # =============================================================================
  # Set reasonable timeouts for Keycloak API operations
  # Prevents hanging on slow API responses during complex realm configurations
  # =============================================================================
  timeout = 300  # 5 minutes for API operations
}



