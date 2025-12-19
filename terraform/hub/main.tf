# DIVE V3 Hub Configuration
# Hub-in-a-Box deployment for local development and federation coordinator
# This configuration adds MFA flows to an EXISTING realm (imported via JSON)

# Data source: Import existing realm (created by Keycloak JSON import on startup)
data "keycloak_realm" "hub" {
  realm = "dive-v3-broker"
}

# Data source: Get broker client for protocol mapper configuration
data "keycloak_openid_client" "broker_client" {
  realm_id  = data.keycloak_realm.hub.id
  client_id = "dive-v3-client-broker"
}

# MFA Module: Add clearance-based authentication flows
module "mfa" {
  source = "../modules/realm-mfa"

  realm_id           = data.keycloak_realm.hub.id
  realm_name         = "dive-v3-broker"
  realm_display_name = "DIVE V3 - Hub"

  use_standard_browser_flow = false
  enable_direct_grant_mfa   = false
}

# Outputs
output "realm_id" {
  value       = data.keycloak_realm.hub.id
  description = "Hub realm ID"
}

output "browser_flow_alias" {
  value       = module.mfa.browser_flow_alias
  description = "Classified Access Browser Flow alias"
}

output "mfa_enabled" {
  value       = true
  description = "MFA flows deployed successfully"
}

