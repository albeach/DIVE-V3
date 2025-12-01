# Federated Instance Module - Variables
# This module creates a DIVE V3 instance with broker realm for federation

variable "instance_code" {
  description = "ISO 3166-1 alpha-3 country code (USA, FRA, DEU, CAN, GBR, etc.)"
  type        = string
  validation {
    condition     = length(var.instance_code) == 3 && upper(var.instance_code) == var.instance_code
    error_message = "Instance code must be a 3-letter uppercase ISO 3166-1 alpha-3 code."
  }
}

variable "instance_name" {
  description = "Human-readable instance name (e.g., 'United States', 'France')"
  type        = string
}

# URLs for this instance
variable "app_url" {
  description = "Frontend application URL (e.g., https://usa-app.dive25.com)"
  type        = string
}

variable "api_url" {
  description = "Backend API URL (e.g., https://usa-api.dive25.com)"
  type        = string
}

variable "idp_url" {
  description = "Keycloak IdP URL (e.g., https://usa-idp.dive25.com)"
  type        = string
}

# Realm configuration
variable "realm_name" {
  description = "Name of the broker realm"
  type        = string
  default     = "dive-v3-broker"
}

variable "client_id" {
  description = "OIDC client ID for the application"
  type        = string
  default     = "dive-v3-client-broker"
}

# Federation partners - other DIVE instances this instance federates with
variable "federation_partners" {
  description = "Map of partner instances for IdP federation"
  type = map(object({
    instance_code = string
    instance_name = string
    idp_url       = string
    enabled       = bool
    client_secret = optional(string, "placeholder-sync-after-terraform") # Set by sync-federation-secrets.sh
  }))
  default = {}
}

# Test users
variable "create_test_users" {
  description = "Whether to create test users for this instance"
  type        = bool
  default     = true
}

# Theme
variable "login_theme" {
  description = "Login theme for the broker realm"
  type        = string
  default     = "dive-v3"
}

# ============================================
# MFA / Authentication Flow Configuration
# ============================================
variable "browser_flow_override_id" {
  description = "ID of the authentication flow to use for the broker client (for clearance-based MFA). If null, uses realm default."
  type        = string
  default     = null
}

# ============================================
# Post-Broker MFA Flow (DEPRECATED - DO NOT USE)
# ============================================
# WARNING: Complex Post-Broker flows with conditional subflows DO NOT WORK
# for federated users. They cause "REQUIRED and ALTERNATIVE elements at same level"
# errors. Use simple_post_broker_otp_flow_alias instead.
variable "post_broker_mfa_flow_alias" {
  description = "DEPRECATED - Use simple_post_broker_otp_flow_alias instead"
  type        = string
  default     = null
}

# ============================================
# Simple Post-Broker OTP Flow (THE WORKING SOLUTION)
# ============================================
# This is the CORRECT way to enforce MFA for federated users.
# The flow should contain ONLY a single OTP Form authenticator as REQUIRED.
#
# Reference: https://www.keycloak.org/docs/latest/server_admin/index.html#requesting-2-factor-authentication-after-identity-provider-login
# "The easiest way is to enforce authentication with one particular 2-factor method.
#  For example, when requesting OTP, the flow can look like this with only a single
#  authenticator configured."
variable "simple_post_broker_otp_flow_alias" {
  description = "Alias of the Simple Post-Broker OTP flow. Contains only OTP Form (REQUIRED). This is what makes MFA work for federated users."
  type        = string
  default     = "Simple Post-Broker OTP"
}

# ============================================
# WebAuthn / Passkey Configuration
# ============================================
variable "webauthn_rp_id" {
  description = "WebAuthn Relying Party ID. Must be the effective domain for production (e.g., 'dive25.com' works for all *.dive25.com subdomains). Empty string only works for localhost."
  type        = string
  default     = "dive25.com"
}

# NOTE: incoming_federation_secrets is defined in variables-incoming-secrets.tf

