# DIVE V3 - External OIDC IdP Module Variables
# Full variable definitions for OIDC IdP configuration

variable "realm_id" {
  description = "Keycloak realm ID for the broker"
  type        = string
  default     = "dive-v3-broker"
}

variable "idp_alias" {
  description = "Unique alias for the OIDC IdP"
  type        = string
}

variable "idp_display_name" {
  description = "Human-readable display name"
  type        = string
}

variable "discovery_url" {
  description = "OIDC Discovery URL"
  type        = string
  default     = ""
}

variable "authorization_url" {
  description = "OIDC Authorization endpoint"
  type        = string
  default     = ""
}

variable "token_url" {
  description = "OIDC Token endpoint"
  type        = string
  default     = ""
}

variable "userinfo_url" {
  description = "OIDC UserInfo endpoint"
  type        = string
  default     = ""
}

variable "jwks_url" {
  description = "OIDC JWKS endpoint"
  type        = string
  default     = ""
}

variable "logout_url" {
  description = "OIDC Logout endpoint"
  type        = string
  default     = ""
}

variable "issuer" {
  description = "OIDC Issuer URL"
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
}

variable "validate_signature" {
  description = "Validate JWT signature"
  type        = bool
  default     = true
}

variable "use_jwks_url" {
  description = "Use JWKS URL for validation"
  type        = bool
  default     = true
}

variable "pkce_enabled" {
  description = "Enable PKCE"
  type        = bool
  default     = true
}

variable "pkce_method" {
  description = "PKCE method"
  type        = string
  default     = "S256"
}

variable "enabled" {
  description = "Enable the IdP"
  type        = bool
  default     = true
}

variable "trust_email" {
  description = "Trust email from IdP"
  type        = bool
  default     = true
}

variable "store_token" {
  description = "Store IdP tokens"
  type        = bool
  default     = false
}

variable "link_only" {
  description = "Link-only mode"
  type        = bool
  default     = false
}

variable "first_broker_login_flow_alias" {
  description = "First broker login flow"
  type        = string
  default     = "first broker login"
}

variable "post_broker_login_flow_alias" {
  description = "Post broker login flow"
  type        = string
  default     = ""
}

variable "default_scopes" {
  description = "Default OAuth scopes"
  type        = string
  default     = "openid profile email"
}

variable "prompt" {
  description = "OIDC prompt parameter"
  type        = string
  default     = ""
}

variable "accepts_prompt_none_forward_from_client" {
  description = "Accept prompt=none forwarding"
  type        = bool
  default     = false
}

variable "disable_user_info" {
  description = "Disable UserInfo endpoint"
  type        = bool
  default     = false
}

variable "hide_on_login_page" {
  description = "Hide on login page"
  type        = bool
  default     = false
}

variable "country_code" {
  description = "ISO 3166-1 alpha-3 country code"
  type        = string
}

variable "claim_mappings" {
  description = "OIDC claim mappings"
  type = map(object({
    claim_name     = string
    user_attribute = string
    sync_mode      = string
  }))
  default = {}
}


