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
  description = "OIDC client ID for the application. Pattern: dive-v3-broker-{instance}"
  type        = string
  # Default follows naming convention from config/naming-conventions.json
  # Pattern: dive-v3-broker-{instance} (e.g., dive-v3-broker-fra)
  default     = "dive-v3-broker"
}

variable "client_secret" {
  description = "OIDC client secret from GCP Secret Manager. If null, Keycloak will generate one (NOT RECOMMENDED - causes drift)."
  type        = string
  sensitive   = true
  default     = null
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
    # Optional: internal/back-channel URL (e.g., http://keycloak-gbr:8080 for local spoke)
    idp_internal_url = optional(string, null)
    # Optional: disable trust manager for self-signed local certs (keeps validate_signature=true)
    disable_trust_manager = optional(bool, false)
  }))
  default = {}
}

# Test users
variable "create_test_users" {
  description = "Whether to create test users for this instance"
  type        = bool
  default     = true
}

variable "test_user_password" {
  description = "Password for pilot/test users (supply via TF_VAR_test_user_password from GCP Secret Manager)"
  type        = string
  sensitive   = true
  default     = null

  validation {
    condition     = var.create_test_users == false || (var.test_user_password != null && length(var.test_user_password) >= 12)
    error_message = "test_user_password must be set (>=12 chars) when create_test_users is true."
  }
}

variable "admin_user_password" {
  description = "Password for admin-[INSTANCE] super_admin user (supply via TF_VAR_admin_user_password from GCP Secret Manager). Falls back to test_user_password if not set."
  type        = string
  sensitive   = true
  default     = null
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
  description = "WebAuthn Relying Party ID. Empty for localhost, override in tfvars/ENV for CF host (e.g., usa-idp.dive25.com). Must match the origin effective domain."
  type        = string
  default     = ""
} # NOTE: incoming_federation_secrets is defined in variables-incoming-secrets.tf

# ============================================
# ⚠️ DEPRECATED - Cross-Border Federation Client
# ============================================
# This variable is deprecated as of Jan 2, 2026.
# The dive-v3-cross-border-client is NOT used for actual federation.
# See cross-border-client.tf for migration instructions.
# PENDING REMOVAL in v5.0
# ============================================
variable "cross_border_client_secret" {
  description = "[DEPRECATED] Client secret for the cross-border federation client. If null, Keycloak generates one."
  type        = string
  sensitive   = true
  default     = null
}

# ============================================
# Local Development Port Configuration
# ============================================
variable "local_keycloak_port" {
  description = "Local Keycloak HTTPS port for this spoke (e.g., 8453 for FRA, 8475 for DEU). Used for port-offset redirect URIs in local dev. Set to null for production."
  type        = number
  default     = null
}

variable "local_frontend_port" {
  description = "Local frontend port for this spoke (e.g., 3010 for FRA). Used for redirect URIs in local dev. Set to null for production."
  type        = number
  default     = null
}
