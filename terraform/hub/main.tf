# DIVE V3 Hub Configuration
# Hub-in-a-Box deployment for local development and federation coordinator
# This configuration adds MFA flows to an EXISTING realm

# Data source: Import existing realm (created by docker-compose)
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

# ============================================
# ACR/AMR Protocol Mappers (Native Keycloak 26.4)
# ============================================
# CRITICAL FIX (December 2025):
# The realm JSON template used oidc-usersessionmodel-note-mapper with wrong
# session note names ("amr", "acr"). Native Keycloak authenticators use:
# - AUTH_METHODS_REF (for AMR)
# - AUTH_CONTEXT_CLASS_REF (for ACR)
#
# Solution: Use native oidc-amr-mapper and oidc-acr-mapper which automatically
# read the correct session notes set by authentication flow execution configs.

resource "keycloak_generic_protocol_mapper" "amr_mapper" {
  realm_id        = data.keycloak_realm.hub.id
  client_id       = data.keycloak_openid_client.broker_client.id
  name            = "amr (auth methods reference)"
  protocol        = "openid-connect"
  protocol_mapper = "oidc-amr-mapper"

  config = {
    "id.token.claim"           = "true"
    "access.token.claim"       = "true"
    "userinfo.token.claim"     = "true"
    "introspection.token.claim" = "true"
    "claim.name"               = "amr"
  }
}

resource "keycloak_generic_protocol_mapper" "acr_mapper" {
  realm_id        = data.keycloak_realm.hub.id
  client_id       = data.keycloak_openid_client.broker_client.id
  name            = "acr (authn context)"
  protocol        = "openid-connect"
  protocol_mapper = "oidc-acr-mapper"

  config = {
    "id.token.claim"           = "true"
    "access.token.claim"       = "true"
    "userinfo.token.claim"     = "true"
    "introspection.token.claim" = "true"
    "claim.name"               = "acr"
  }
}

# Update realm authentication bindings (handled by mfa module)
# The keycloak_authentication_bindings resource in the MFA module
# will automatically bind the custom browser flow to the realm

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

