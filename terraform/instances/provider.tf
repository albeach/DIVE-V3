# Terraform Provider Configuration for Federated Instances
# Each workspace targets a different Keycloak instance

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
  url       = var.keycloak_url

  # TLS settings for self-signed certs in development
  tls_insecure_skip_verify = true
}





