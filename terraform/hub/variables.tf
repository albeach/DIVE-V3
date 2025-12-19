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

variable "app_url" {
  description = "Frontend application URL"
  type        = string
  default     = "https://localhost:3000"
}

variable "api_url" {
  description = "Backend API URL"
  type        = string
  default     = "https://localhost:4000"
}

variable "idp_url" {
  description = "Keycloak IdP URL"
  type        = string
  default     = "https://localhost:8443"
}

variable "client_secret" {
  description = "OIDC client secret"
  type        = string
  sensitive   = true
}

variable "test_user_password" {
  description = "Test user password"
  type        = string
  sensitive   = true
  default     = "DiveTestSecure2025!"
}

variable "admin_user_password" {
  description = "Admin user password"
  type        = string
  sensitive   = true
  default     = "DiveAdminSecure2025!"
}

variable "webauthn_rp_id" {
  description = "WebAuthn Relying Party ID"
  type        = string
  default     = "localhost"
}

