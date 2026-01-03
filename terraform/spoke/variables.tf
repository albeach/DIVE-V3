# =============================================================================
# DIVE V3 Spoke Configuration - Variables
# =============================================================================
# These variables are supplied via country-specific tfvars files
# from terraform/countries/<code>.tfvars
# =============================================================================

# Instance identification (from tfvars)
variable "instance_code" {
  description = "ISO 3166-1 alpha-3 country code (e.g., POL, NOR, ALB)"
  type        = string
}

variable "instance_name" {
  description = "Human-readable instance name (e.g., 'Poland')"
  type        = string
}

# URLs (from tfvars)
variable "app_url" {
  description = "Frontend application URL"
  type        = string
}

variable "api_url" {
  description = "Backend API URL"
  type        = string
}

variable "idp_url" {
  description = "Keycloak IdP URL"
  type        = string
}

# Client configuration
# NOTE: client_id is now computed in main.tf as "dive-v3-broker-${instance_code}"
# This variable is kept for backwards compatibility but its value is ignored
variable "client_id" {
  description = "OIDC client ID (DEPRECATED - computed in main.tf, this value is ignored)"
  type        = string
  default     = null  # No default - value is computed in main.tf
}

variable "client_secret" {
  description = "OIDC client secret (from GCP Secret Manager via TF_VAR_client_secret)"
  type        = string
  sensitive   = true
}

# Theme
variable "login_theme" {
  description = "Login theme name (e.g., dive-v3-pol)"
  type        = string
  default     = "dive-v3"
}

# WebAuthn
variable "webauthn_rp_id" {
  description = "WebAuthn Relying Party ID (empty for localhost)"
  type        = string
  default     = ""
}

# User configuration
variable "create_test_users" {
  description = "Whether to create test users"
  type        = bool
  default     = true
}

variable "test_user_password" {
  description = "Password for test users (from GCP Secret Manager)"
  type        = string
  sensitive   = true
}

variable "admin_user_password" {
  description = "Password for admin user (from GCP Secret Manager)"
  type        = string
  sensitive   = true
  default     = null
}

# Federation partners
variable "federation_partners" {
  description = "Map of partner instances for IdP federation"
  type = map(object({
    instance_code         = string
    instance_name         = string
    idp_url               = string
    enabled               = bool
    client_secret         = optional(string, "placeholder-sync-after-terraform")
    idp_internal_url      = optional(string, null)
    disable_trust_manager = optional(bool, false)
  }))
  default = {}
}

# Incoming federation secrets
variable "incoming_federation_secrets" {
  description = "Map of secrets for partners federating TO this instance"
  type        = map(string)
  default     = {}
}

# MFA configuration
variable "enable_mfa" {
  description = "Whether to enable MFA flows"
  type        = bool
  default     = true
}

# =============================================================================
# Keycloak Provider Variables
# =============================================================================

variable "keycloak_url" {
  description = "Keycloak URL (defaults to instance's idp_url)"
  type        = string
  default     = ""
}

variable "keycloak_admin_username" {
  description = "Keycloak admin username"
  type        = string
  default     = "admin"
}

variable "keycloak_admin_password" {
  description = "Keycloak admin password (from GCP Secret Manager)"
  type        = string
  sensitive   = true
}

