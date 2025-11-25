# Variables for Federated Instance Deployment
# These are set per-workspace via .tfvars files

# Keycloak Connection (different per instance)
variable "keycloak_url" {
  description = "Keycloak admin URL (e.g., https://localhost:8443 for USA, https://localhost:8444 for FRA)"
  type        = string
}

variable "keycloak_admin_username" {
  description = "Keycloak admin username"
  type        = string
  default     = "admin"
}

variable "keycloak_admin_password" {
  description = "Keycloak admin password"
  type        = string
  sensitive   = true
  default     = "admin"
}

# Public URLs (Cloudflare tunnel URLs)
variable "app_url" {
  description = "Frontend application URL (e.g., https://usa-app.dive25.com)"
  type        = string
}

variable "api_url" {
  description = "Backend API URL (e.g., https://usa-api.dive25.com)"
  type        = string
}

variable "idp_url" {
  description = "Keycloak public URL (e.g., https://usa-idp.dive25.com)"
  type        = string
}

# Test users
variable "create_test_users" {
  description = "Whether to create test users"
  type        = bool
  default     = true
}

# Federation partners
variable "federation_partners" {
  description = "Map of partner instances for IdP federation"
  type = map(object({
    instance_code  = string
    instance_name  = string
    idp_url        = string
    enabled        = bool
    client_secret  = optional(string)
  }))
  default = {}
}

