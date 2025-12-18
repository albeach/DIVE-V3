variable "keycloak_url" {
  description = "Keycloak URL"
  type        = string
  default     = "https://localhost:8443"
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
}

