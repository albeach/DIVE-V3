variable "keycloak_url" {
  description = "The URL of the Keycloak server"
  type        = string
  default     = "http://localhost:8081"
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
  default     = "dive-v3-pilot"
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

