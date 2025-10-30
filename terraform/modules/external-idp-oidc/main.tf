# DIVE V3 - External OIDC IdP Terraform Module
# This module automates the onboarding of external OIDC identity providers into Keycloak broker

terraform {
  required_version = ">= 1.0"
  required_providers {
    keycloak = {
      source  = "mrparkers/keycloak"
      version = "~> 4.0"
    }
  }
}

variable "realm_id" {
  description = "Keycloak realm ID for the broker"
  type        = string
  default     = "dive-v3-broker"
}

variable "idp_alias" {
  description = "Unique alias for the OIDC IdP (e.g., usa-external)"
  type        = string
  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.idp_alias))
    error_message = "IdP alias must contain only lowercase letters, numbers, and hyphens"
  }
}

variable "idp_display_name" {
  description = "Human-readable display name for the IdP"
  type        = string
}

variable "authorization_url" {
  description = "OIDC Authorization endpoint URL (auto-discovered if using discovery_url)"
  type        = string
  default     = ""
}

variable "token_url" {
  description = "OIDC Token endpoint URL (auto-discovered if using discovery_url)"
  type        = string
  default     = ""
}

variable "userinfo_url" {
  description = "OIDC UserInfo endpoint URL (auto-discovered if using discovery_url)"
  type        = string
  default     = ""
}

variable "jwks_url" {
  description = "OIDC JWKS endpoint URL (auto-discovered if using discovery_url)"
  type        = string
  default     = ""
}

variable "logout_url" {
  description = "OIDC Logout endpoint URL (auto-discovered if using discovery_url)"
  type        = string
  default     = ""
}

variable "issuer" {
  description = "OIDC Issuer URL (auto-discovered if using discovery_url)"
  type        = string
  default     = ""
}

variable "discovery_url" {
  description = "OIDC Discovery URL (.well-known/openid-configuration)"
  type        = string
  default     = ""
}

variable "client_id" {
  description = "OAuth2/OIDC Client ID"
  type        = string
}

variable "client_secret" {
  description = "OAuth2/OIDC Client Secret"
  type        = string
  sensitive   = true
}

variable "client_auth_method" {
  description = "Client authentication method"
  type        = string
  default     = "client_secret_post"
  validation {
    condition     = contains(["client_secret_post", "client_secret_basic", "client_secret_jwt", "private_key_jwt"], var.client_auth_method)
    error_message = "Invalid client authentication method"
  }
}

variable "validate_signature" {
  description = "Validate JWT signature"
  type        = bool
  default     = true
}

variable "use_jwks_url" {
  description = "Use JWKS URL for signature validation"
  type        = bool
  default     = true
}

variable "pkce_enabled" {
  description = "Enable PKCE (Proof Key for Code Exchange)"
  type        = bool
  default     = true
}

variable "pkce_method" {
  description = "PKCE method (S256 or plain)"
  type        = string
  default     = "S256"
  validation {
    condition     = contains(["S256", "plain"], var.pkce_method)
    error_message = "PKCE method must be S256 or plain"
  }
}

variable "enabled" {
  description = "Enable the IdP"
  type        = bool
  default     = true
}

variable "trust_email" {
  description = "Trust email from external IdP"
  type        = bool
  default     = true
}

variable "store_token" {
  description = "Store external IdP tokens"
  type        = bool
  default     = false
}

variable "link_only" {
  description = "Link only mode (don't create users automatically)"
  type        = bool
  default     = false
}

variable "first_broker_login_flow_alias" {
  description = "Authentication flow for first broker login"
  type        = string
  default     = "first broker login"
}

variable "post_broker_login_flow_alias" {
  description = "Authentication flow after broker login"
  type        = string
  default     = ""
}

variable "default_scopes" {
  description = "Default OAuth scopes to request"
  type        = string
  default     = "openid profile email"
}

variable "prompt" {
  description = "OIDC prompt parameter"
  type        = string
  default     = ""
}

variable "accepts_prompt_none_forward_from_client" {
  description = "Accept prompt=none forwarding from client"
  type        = bool
  default     = false
}

variable "disable_user_info" {
  description = "Disable UserInfo endpoint calls"
  type        = bool
  default     = false
}

variable "hide_on_login_page" {
  description = "Hide on login page"
  type        = bool
  default     = false
}

variable "country_code" {
  description = "ISO 3166-1 alpha-3 country code (ESP, USA, etc.)"
  type        = string
  validation {
    condition     = length(var.country_code) == 3 && can(regex("^[A-Z]+$", var.country_code))
    error_message = "Country code must be 3 uppercase letters (ISO 3166-1 alpha-3)"
  }
}

variable "claim_mappings" {
  description = "Map of OIDC claims to Keycloak user attributes"
  type = map(object({
    claim_name     = string
    user_attribute = string
    sync_mode      = string
  }))
  default = {}
}

# Create OIDC Identity Provider
resource "keycloak_oidc_identity_provider" "external_idp" {
  realm        = var.realm_id
  alias        = var.idp_alias
  display_name = var.idp_display_name
  enabled      = var.enabled

  # OIDC Endpoints (discovery or manual)
  authorization_url = var.discovery_url != "" ? null : var.authorization_url
  token_url         = var.discovery_url != "" ? null : var.token_url
  user_info_url     = var.discovery_url != "" ? null : var.userinfo_url
  jwks_url          = var.discovery_url != "" ? null : var.jwks_url
  logout_url        = var.discovery_url != "" ? null : var.logout_url
  issuer            = var.discovery_url != "" ? null : var.issuer
  
  # Discovery endpoint (if provided, overrides manual endpoints)
  discovery_url = var.discovery_url != "" ? var.discovery_url : null

  # OAuth2/OIDC Configuration
  client_id                  = var.client_id
  client_secret              = var.client_secret
  client_auth_method         = var.client_auth_method
  validate_signature         = var.validate_signature
  use_jwks_url              = var.use_jwks_url
  pkce_enabled              = var.pkce_enabled
  pkce_method               = var.pkce_method
  default_scopes            = var.default_scopes
  prompt                    = var.prompt != "" ? var.prompt : null
  accepts_prompt_none_forward_from_client = var.accepts_prompt_none_forward_from_client
  disable_user_info         = var.disable_user_info
  hide_on_login_page        = var.hide_on_login_page

  # User Management
  trust_email                    = var.trust_email
  store_token                    = var.store_token
  link_only                      = var.link_only
  first_broker_login_flow_alias  = var.first_broker_login_flow_alias
  post_broker_login_flow_alias   = var.post_broker_login_flow_alias != "" ? var.post_broker_login_flow_alias : null

  # Additional Configuration
  gui_order = 1
  
  # Advanced settings
  extra_config = {
    "clientAssertionSigningAlg" = "RS256"
  }
}

# Claim Mapper: uniqueID
resource "keycloak_custom_identity_provider_mapper" "unique_id" {
  realm                   = var.realm_id
  name                    = "${var.idp_alias}-uniqueID-mapper"
  identity_provider_alias = keycloak_oidc_identity_provider.external_idp.alias
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    syncMode         = "INHERIT"
    claim            = "uniqueID"
    "user.attribute" = "uniqueID"
  }
}

# Claim Mapper: Email (with fallback to preferred_username)
resource "keycloak_custom_identity_provider_mapper" "email" {
  realm                   = var.realm_id
  name                    = "${var.idp_alias}-email-mapper"
  identity_provider_alias = keycloak_oidc_identity_provider.external_idp.alias
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    syncMode         = "INHERIT"
    claim            = "email"
    "user.attribute" = "email"
  }
}

# Hardcoded Mapper: Country of Affiliation
resource "keycloak_hardcoded_attribute_identity_provider_mapper" "country" {
  realm                   = var.realm_id
  name                    = "${var.idp_alias}-country-mapper"
  identity_provider_alias = keycloak_oidc_identity_provider.external_idp.alias

  attribute_name  = "countryOfAffiliation"
  attribute_value = var.country_code

  extra_config = {
    syncMode = "INHERIT"
  }
}

# Dynamic Claim Mappers (from variable)
resource "keycloak_custom_identity_provider_mapper" "custom_claims" {
  for_each = var.claim_mappings

  realm                   = var.realm_id
  name                    = "${var.idp_alias}-${each.key}-mapper"
  identity_provider_alias = keycloak_oidc_identity_provider.external_idp.alias
  identity_provider_mapper = "oidc-user-attribute-idp-mapper"

  extra_config = {
    syncMode         = each.value.sync_mode
    claim            = each.value.claim_name
    "user.attribute" = each.value.user_attribute
  }
}

# Outputs
output "idp_alias" {
  description = "The alias of the created OIDC IdP"
  value       = keycloak_oidc_identity_provider.external_idp.alias
}

output "idp_internal_id" {
  description = "The internal ID of the created OIDC IdP"
  value       = keycloak_oidc_identity_provider.external_idp.internal_id
}

output "idp_redirect_uri" {
  description = "The redirect URI for this IdP (for external IdP configuration)"
  value       = "https://keycloak.example.com/realms/${var.realm_id}/broker/${var.idp_alias}/endpoint"
}

output "claim_mappers" {
  description = "List of created claim mappers"
  value = concat(
    [keycloak_custom_identity_provider_mapper.unique_id.id],
    [keycloak_custom_identity_provider_mapper.email.id],
    [keycloak_hardcoded_attribute_identity_provider_mapper.country.id],
    [for mapper in keycloak_custom_identity_provider_mapper.custom_claims : mapper.id]
  )
}


