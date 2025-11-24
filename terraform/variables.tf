variable "keycloak_url" {
  description = "The URL of the Keycloak server for Terraform provider connection (admin API)"
  type        = string
  default     = "https://localhost:8443" # Use HTTPS for admin operations, always localhost for Terraform
}

variable "keycloak_public_url" {
  description = "The public-facing URL of Keycloak for client redirects and browser access"
  type        = string
  default     = "https://localhost:8443" # Defaults to localhost, override with custom hostname for remote access
}

variable "keycloak_admin_username" {
  description = "The admin username for Keycloak"
  type        = string
  default     = "admin"
}

variable "keycloak_admin_password" {
  description = "The admin password for Keycloak"
  type        = string
  default     = "admin"
  sensitive   = true
}

variable "realm_name" {
  description = "The name of the Keycloak realm for DIVE V3"
  type        = string
  default     = "dive-v3-broker"
}

variable "client_id" {
  description = "The client ID for the Next.js application"
  type        = string
  default     = "dive-v3-client"
}

variable "app_url" {
  description = "The URL of the Next.js application"
  type        = string
  default     = "http://localhost:3000"
}

variable "create_test_users" {
  description = "Whether to create test users for each IdP"
  type        = bool
  default     = true
}

variable "backend_url" {
  description = "The URL of the DIVE V3 backend API"
  type        = string
  default     = "http://localhost:4000"
}

variable "create_example_sp" {
  description = "Whether to create an example external SP for testing"
  type        = bool
  default     = false
}

