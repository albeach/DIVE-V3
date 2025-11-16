# DIVE V3 - External SAML IdP Module Variables

variable "realm_id" {
  description = "Keycloak realm ID for the broker"
  type        = string
  default     = "dive-v3-broker"
}

variable "idp_alias" {
  description = "Unique alias for the SAML IdP (e.g., spain-external)"
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

variable "idp_entity_id" {
  description = "SAML Entity ID from the external IdP"
  type        = string
}

variable "idp_sso_url" {
  description = "SAML Single Sign-On Service URL"
  type        = string
}

variable "idp_slo_url" {
  description = "SAML Single Logout Service URL (optional)"
  type        = string
  default     = ""
}

variable "idp_certificate" {
  description = "X.509 certificate from the SAML IdP (PEM format, no headers)"
  type        = string
  sensitive   = true
}

variable "name_id_policy_format" {
  description = "SAML NameID format (keycloak/keycloak v5.x accepts: Transient, Persistent, Email, Kerberos, X.509 Subject Name, Unspecified, Windows Domain Qualified Name)"
  type        = string
  default     = "Transient"

  validation {
    condition = contains([
      "Transient",
      "Persistent",
      "Email",
      "Kerberos",
      "X.509 Subject Name",
      "Unspecified",
      "Windows Domain Qualified Name"
    ], var.name_id_policy_format)
    error_message = "name_id_policy_format must be one of: Transient, Persistent, Email, Kerberos, X.509 Subject Name, Unspecified, Windows Domain Qualified Name"
  }
}

variable "signature_algorithm" {
  description = "SAML signature algorithm"
  type        = string
  default     = "RSA_SHA256"
}

variable "want_assertions_signed" {
  description = "Require signed SAML assertions"
  type        = bool
  default     = true
}

variable "want_assertions_encrypted" {
  description = "Require encrypted SAML assertions"
  type        = bool
  default     = false
}

variable "force_authn" {
  description = "Force re-authentication on each request"
  type        = bool
  default     = false
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

variable "attribute_mappings" {
  description = "Map of SAML attributes to Keycloak user attributes"
  type = map(object({
    saml_attribute_name        = string
    saml_attribute_name_format = string
    user_attribute_name        = string
    sync_mode                  = string
  }))
  default = {}
}

variable "country_code" {
  description = "ISO 3166-1 alpha-3 country code (ESP, USA, etc.)"
  type        = string
  validation {
    condition     = length(var.country_code) == 3 && can(regex("^[A-Z]+$", var.country_code))
    error_message = "Country code must be 3 uppercase letters (ISO 3166-1 alpha-3)"
  }
}

variable "default_scopes" {
  description = "Default OAuth scopes to request"
  type        = list(string)
  default     = ["openid", "profile", "email"]
}


