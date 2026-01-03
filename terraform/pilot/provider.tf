terraform {
  required_providers {
    keycloak = {
      source  = "keycloak/keycloak"
      version = ">= 5.6.0"
    }
  }
}

# Keycloak provider - only initialize after VM is provisioned
provider "keycloak" {
  client_id                = "admin-cli"
  username                 = var.keycloak_admin_username
  password                 = var.keycloak_admin_password
  url                      = var.keycloak_url
  tls_insecure_skip_verify = true # Self-signed certs
}

