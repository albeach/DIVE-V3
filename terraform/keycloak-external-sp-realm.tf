# DIVE V3 External SP Realm Configuration
# Phase 1: OAuth 2.0 Authorization Server for external Service Providers

resource "keycloak_realm" "external_sp" {
  realm             = "dive-v3-external-sp"
  enabled           = true
  display_name      = "DIVE V3 External Service Providers"
  display_name_html = "<b>DIVE V3</b> External Service Providers"

  # Session configuration
  sso_session_idle_timeout     = "30m"
  sso_session_max_lifespan     = "10h"
  offline_session_max_lifespan = "720h" # 30 days

  # Token configuration
  access_token_lifespan                   = "15m"
  access_token_lifespan_for_implicit_flow = "15m"
  access_code_lifespan                    = "1m"
  access_code_lifespan_user_action        = "5m"

  # Security
  password_policy = "upperCase(2) and lowerCase(2) and digits(2) and specialChars(2) and length(12) and notUsername"
  # Brute force protection managed via Keycloak admin console
  # (Terraform provider v5.5.0 doesn't support all brute force attributes)

  # Login settings
  login_with_email_allowed = false
  duplicate_emails_allowed = false

  # OAuth 2.0 specific
  default_signature_algorithm = "RS256"

  attributes = {
    # Federation metadata
    "dive.federation.enabled" = "true"
    "dive.federation.type"    = "sp"
    "dive.federation.version" = "1.0"

    # OAuth specific attributes
    "oauth.pkce.required"               = "true"
    "oauth.token.introspection.enabled" = "true"
  }
}

# External SP realm roles
resource "keycloak_role" "sp_admin" {
  realm_id    = keycloak_realm.external_sp.id
  name        = "sp-admin"
  description = "Service Provider Administrator"
}

resource "keycloak_role" "sp_user" {
  realm_id    = keycloak_realm.external_sp.id
  name        = "sp-user"
  description = "Service Provider User"
}

# Client scope for SCIM
resource "keycloak_openid_client_scope" "scim" {
  realm_id               = keycloak_realm.external_sp.id
  name                   = "scim"
  description            = "SCIM 2.0 user provisioning"
  include_in_token_scope = true
}

resource "keycloak_openid_client_scope" "scim_read" {
  realm_id               = keycloak_realm.external_sp.id
  name                   = "scim:read"
  description            = "Read SCIM users"
  include_in_token_scope = true
}

resource "keycloak_openid_client_scope" "scim_write" {
  realm_id               = keycloak_realm.external_sp.id
  name                   = "scim:write"
  description            = "Write SCIM users"
  include_in_token_scope = true
}

# Client scope for resource access
resource "keycloak_openid_client_scope" "resource_read" {
  realm_id               = keycloak_realm.external_sp.id
  name                   = "resource:read"
  description            = "Read DIVE V3 resources"
  include_in_token_scope = true
}

resource "keycloak_openid_client_scope" "resource_search" {
  realm_id               = keycloak_realm.external_sp.id
  name                   = "resource:search"
  description            = "Search DIVE V3 resources"
  include_in_token_scope = true
}

# DIVE V3 API Client (for OAuth AS)
resource "keycloak_openid_client" "dive_v3_oauth_api" {
  realm_id    = keycloak_realm.external_sp.id
  client_id   = "dive-v3-oauth-api"
  name        = "DIVE V3 OAuth API"
  description = "OAuth 2.0 Authorization Server API"

  enabled = true

  # OAuth settings
  access_type                  = "CONFIDENTIAL"
  standard_flow_enabled        = false
  implicit_flow_enabled        = false
  direct_access_grants_enabled = false
  service_accounts_enabled     = true

  # PKCE settings
  pkce_code_challenge_method = "S256"

  # Note: valid_redirect_uris and web_origins removed because standard_flow_enabled = false
  # These settings only needed when standard or implicit flow is enabled
}

# Protocol mappers for OAuth API client
resource "keycloak_openid_user_attribute_protocol_mapper" "oauth_api_service_account" {
  realm_id            = keycloak_realm.external_sp.id
  client_id           = keycloak_openid_client.dive_v3_oauth_api.id
  name                = "service-account"
  user_attribute      = "service_account"
  claim_name          = "service_account"
  claim_value_type    = "String"
  add_to_id_token     = true
  add_to_access_token = true
  add_to_userinfo     = true
}

# Example External SP Client (template for dynamic creation)
resource "keycloak_openid_client" "example_external_sp" {
  count = var.create_example_sp ? 1 : 0

  realm_id    = keycloak_realm.external_sp.id
  client_id   = "sp-example-gbr"
  name        = "Example UK Service Provider"
  description = "Example external SP for testing"

  enabled = false # Disabled by default until approved

  access_type                  = "CONFIDENTIAL"
  standard_flow_enabled        = true
  implicit_flow_enabled        = false
  direct_access_grants_enabled = false
  service_accounts_enabled     = true

  # PKCE required
  pkce_code_challenge_method = "S256"

  valid_redirect_uris = [
    "https://sp.example.mod.uk/callback"
  ]

  # SP metadata in attributes
  extra_config = {
    "dive.sp.country"       = "GBR"
    "dive.sp.org.type"      = "MILITARY"
    "dive.sp.contact.email" = "admin@example.mod.uk"
    "dive.sp.rate.limit"    = "60"
    "dive.sp.rate.burst"    = "10"
  }
}

# Attach optional client scopes to example SP
resource "keycloak_openid_client_optional_scopes" "example_sp_optional_scopes" {
  count = var.create_example_sp ? 1 : 0

  realm_id  = keycloak_realm.external_sp.id
  client_id = keycloak_openid_client.example_external_sp[0].id

  optional_scopes = [
    keycloak_openid_client_scope.resource_read.name,
    keycloak_openid_client_scope.resource_search.name,
    keycloak_openid_client_scope.scim_read.name
  ]
}

# Outputs for external SP realm
output "external_sp_realm_id" {
  value = keycloak_realm.external_sp.id
}

output "oauth_api_client_id" {
  value = keycloak_openid_client.dive_v3_oauth_api.client_id
}

output "oauth_api_client_secret" {
  value     = keycloak_openid_client.dive_v3_oauth_api.client_secret
  sensitive = true
}
