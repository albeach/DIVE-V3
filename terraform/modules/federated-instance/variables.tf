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

