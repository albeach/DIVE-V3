# Federated Instance Configuration
# This file is used with different .tfvars files per instance
# 
# Usage:
#   # USA instance
#   terraform workspace select usa
#   terraform apply -var-file=usa.tfvars
#
#   # FRA instance  
#   terraform workspace select fra
#   terraform apply -var-file=fra.tfvars
#
#   # New instance (e.g., DEU)
#   terraform workspace new deu
#   terraform apply -var-file=deu.tfvars

module "instance" {
  source = "../modules/federated-instance"

  # Instance identification - derived from workspace name
  instance_code = upper(terraform.workspace)
  instance_name = lookup(local.instance_names, upper(terraform.workspace), terraform.workspace)

  # URLs from variables
  app_url = var.app_url
  api_url = var.api_url
  idp_url = var.idp_url

  # Realm configuration
  realm_name = "dive-v3-broker"
  client_id  = "dive-v3-client-broker"

  # Test users
  create_test_users = var.create_test_users

  # Theme - use instance-specific if exists, otherwise default
  login_theme = lookup(local.instance_themes, upper(terraform.workspace), "dive-v3")

  # Federation partners
  federation_partners = var.federation_partners
}

# Instance name lookup
locals {
  instance_names = {
    "USA"      = "United States"
    "FRA"      = "France"
    "DEU"      = "Germany"
    "GBR"      = "United Kingdom"
    "CAN"      = "Canada"
    "ITA"      = "Italy"
    "ESP"      = "Spain"
    "NLD"      = "Netherlands"
    "POL"      = "Poland"
    "INDUSTRY" = "Industry Partners"
  }

  instance_themes = {
    "USA"      = "dive-v3-usa"
    "FRA"      = "dive-v3-fra"
    "DEU"      = "dive-v3-deu"
    "GBR"      = "dive-v3-gbr"
    "CAN"      = "dive-v3-can"
    "ITA"      = "dive-v3-ita"
    "ESP"      = "dive-v3-esp"
    "NLD"      = "dive-v3-nld"
    "POL"      = "dive-v3-pol"
    "INDUSTRY" = "dive-v3-industry"
  }
}

# ============================================================================
# OUTPUTS
# ============================================================================

output "realm_id" {
  description = "The broker realm ID"
  value       = module.instance.realm_id
}

output "client_id" {
  description = "The OIDC client ID"
  value       = module.instance.client_id
}

output "client_secret" {
  description = "The OIDC client secret"
  value       = module.instance.client_secret
  sensitive   = true
}

output "issuer" {
  description = "Token issuer URL"
  value       = module.instance.issuer
}

output "token_url" {
  description = "OAuth2 token endpoint"
  value       = module.instance.token_url
}

output "jwks_uri" {
  description = "JWKS URI for token validation"
  value       = module.instance.jwks_uri
}

output "instance_code" {
  description = "Instance code (ISO 3166-1 alpha-3)"
  value       = module.instance.instance_code
}

