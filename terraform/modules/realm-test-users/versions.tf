terraform {
  required_version = ">= 1.13.4"
  
  required_providers {
    keycloak = {
      source  = "keycloak/keycloak"
      version = "~> 5.0"
    }
  }
}

