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

  # Incoming federation secrets (for clients that other instances use to federate TO this instance)
  incoming_federation_secrets = var.incoming_federation_secrets

  # ============================================
  # WEBAUTHN / PASSKEY CONFIGURATION - CRITICAL!
  # ============================================
  # The WebAuthn Relying Party ID MUST be set to the parent domain for production.
  # Empty string ("") only works for localhost and causes "Your device can't be used 
  # with this site" errors on subdomains like usa-idp.dive25.com.
  #
  # Priority: explicit variable > instance lookup > module default ("dive25.com")
  webauthn_rp_id = var.webauthn_rp_id != "" ? var.webauthn_rp_id : lookup(local.instance_rp_ids, upper(terraform.workspace), "dive25.com")

  # ============================================
  # MFA FLOW BINDING - CRITICAL FOR SECURITY
  # ============================================
  # Bind the clearance-based MFA flow to the broker client
  # This enforces:
  #   - AAL2 (OTP) for CONFIDENTIAL and SECRET users
  #   - AAL3 (WebAuthn) for TOP_SECRET users
  # Without this, higher clearance users can bypass MFA enrollment!
  browser_flow_override_id = module.mfa.browser_flow_id

  # ============================================
  # SIMPLE POST-BROKER OTP FLOW - THE WORKING SOLUTION
  # ============================================
  # This is the KEY to making MFA work for FEDERATED users!
  # 
  # IMPORTANT: Use the SIMPLE flow, not the complex conditional flow!
  # Complex flows with conditional subflows cause:
  # "REQUIRED and ALTERNATIVE elements at same level! Those alternative executions will be ignored"
  #
  # The simple_post_broker_otp flow contains ONLY:
  #   - OTP Form (REQUIRED)
  # That's it. No user creation steps. No conditions.
  #
  # Reference: https://www.keycloak.org/docs/latest/server_admin/index.html#requesting-2-factor-authentication-after-identity-provider-login
  simple_post_broker_otp_flow_alias = module.mfa.simple_post_broker_otp_flow_alias
}

# ============================================
# MFA MODULE - Clearance-Based Authentication Flows
# ============================================
# Creates the "Classified Access Browser Flow" with conditional MFA:
# - UNCLASSIFIED: Password only (AAL1)
# - CONFIDENTIAL/SECRET: Password + OTP (AAL2)
# - TOP_SECRET: Password + WebAuthn (AAL3)
#
# CRITICAL: This module MUST be included for MFA enforcement to work!
# The flow is created and then bound to the client via browser_flow_override_id

module "mfa" {
  source = "../modules/realm-mfa"

  realm_id           = module.instance.realm_id
  realm_name         = "dive-v3-broker"
  realm_display_name = lookup(local.instance_names, upper(terraform.workspace), terraform.workspace)

  # Use the custom MFA flow (not standard browser)
  # This enables clearance-based conditional authentication
  use_standard_browser_flow = false

  # Direct Grant MFA is disabled - use browser-based flows only
  # (Custom SPI was removed in v2.0.0)
  enable_direct_grant_mfa = false
}

# Instance configuration lookups
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

  # WebAuthn Relying Party IDs per instance
  # CRITICAL: Must be the parent domain of the IdP subdomain
  # e.g., "dive25.com" works for usa-idp.dive25.com, fra-idp.dive25.com, etc.
  # e.g., "prosecurity.biz" works for deu-idp.prosecurity.biz
  #
  # Reference: https://www.keycloak.org/docs/latest/server_admin/#webauthn_server_administration_guide
  # "The ID must be the origin's effective domain"
  instance_rp_ids = {
    "USA"      = "dive25.com"
    "FRA"      = "dive25.com"
    "GBR"      = "dive25.com"
    "DEU"      = "prosecurity.biz"
    "CAN"      = "dive25.com"
    "ITA"      = "dive25.com"
    "ESP"      = "dive25.com"
    "NLD"      = "dive25.com"
    "POL"      = "dive25.com"
    "INDUSTRY" = "dive25.com"
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

