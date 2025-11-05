terraform {
  required_providers {
    keycloak = {
      source  = "keycloak/keycloak"
      version = "~> 5.0" # Official Keycloak provider - Use latest 5.x
    }
  }
  required_version = ">= 1.13.4"
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

# ============================================
# Local Variables for Dynamic URL Construction
# ============================================
# Constructs Keycloak URLs dynamically based on keycloak_url variable
# This allows the same Terraform code to work with localhost or custom hostnames

locals {
  # Extract hostname from keycloak_url (e.g., "https://localhost:8443" → "localhost:8443")
  keycloak_base = var.keycloak_url
  
  # Construct realm URLs dynamically
  realm_urls = {
    usa      = "${local.keycloak_base}/realms/dive-v3-usa"
    fra      = "${local.keycloak_base}/realms/dive-v3-fra"
    can      = "${local.keycloak_base}/realms/dive-v3-can"
    gbr      = "${local.keycloak_base}/realms/dive-v3-gbr"
    deu      = "${local.keycloak_base}/realms/dive-v3-deu"
    esp      = "${local.keycloak_base}/realms/dive-v3-esp"
    ita      = "${local.keycloak_base}/realms/dive-v3-ita"
    nld      = "${local.keycloak_base}/realms/dive-v3-nld"
    pol      = "${local.keycloak_base}/realms/dive-v3-pol"
    industry = "${local.keycloak_base}/realms/dive-v3-industry"
  }
  
  # Common OIDC endpoint paths
  oidc_auth_path      = "/protocol/openid-connect/auth"
  oidc_token_path     = "/protocol/openid-connect/token"
  oidc_certs_path     = "/protocol/openid-connect/certs"
  oidc_userinfo_path  = "/protocol/openid-connect/userinfo"
  oidc_logout_path    = "/protocol/openid-connect/logout"
}

# ============================================
# DIVE V3 Multi-Realm Architecture (v2.0.0)
# ============================================
# The multi-realm configuration files are loaded automatically:
#
# Core Realms:
#   - broker-realm.tf        (Federation Hub - dive-v3-broker realm)
#   - usa-realm.tf           (United States - dive-v3-usa realm)
#   - fra-realm.tf           (France - dive-v3-fra realm)
#   - can-realm.tf           (Canada - dive-v3-can realm)
#   - gbr-realm.tf           (United Kingdom - dive-v3-gbr realm)
#   - deu-realm.tf           (Germany - dive-v3-deu realm)
#   - esp-realm.tf           (Spain - dive-v3-esp realm)
#   - ita-realm.tf           (Italy - dive-v3-ita realm)
#   - nld-realm.tf           (Netherlands - dive-v3-nld realm)
#   - pol-realm.tf           (Poland - dive-v3-pol realm)
#   - industry-realm.tf      (Industry Partners - dive-v3-industry realm)
#
# Brokers (IdP connections to broker realm):
#   - usa-broker.tf          (USA realm → broker realm)
#   - fra-broker.tf          (FRA realm → broker realm)
#   - can-broker.tf          (CAN realm → broker realm)
#   - gbr-broker.tf          (GBR realm → broker realm)
#   - deu-broker.tf          (DEU realm → broker realm)
#   - esp-broker.tf          (ESP realm → broker realm)
#   - ita-broker.tf          (ITA realm → broker realm)
#   - nld-broker.tf          (NLD realm → broker realm)
#   - pol-broker.tf          (POL realm → broker realm)
#   - industry-broker.tf     (Industry realm → broker realm)
#
# Test Users:
#   - all-test-users.tf      (44 test users across all realms)
#
# External IdPs (Optional):
#   - external-idp-spain-saml.tf  (External SAML IdP for Spain)
#
# Terraform automatically loads all *.tf files in this directory.
# No explicit includes needed.
#
# ============================================
# LEGACY CONFIGURATION (DEPRECATED)
# ============================================
# The old single-realm configuration (dive-v3-pilot) has been disabled:
#   - main.tf.disabled-legacy   (Contains old dive-v3-pilot realm with 40+ resources)
#
# DO NOT re-enable the legacy configuration - it conflicts with multi-realm architecture.
# For historical reference only.
