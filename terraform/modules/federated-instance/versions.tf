# Federated Instance Module - Required Providers

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    keycloak = {
      source  = "keycloak/keycloak"
      version = ">= 5.6.0"
    }
  }
}












