variable "client_secret" {
  description = "Client secret for the broker client"
  type        = string
  sensitive   = true
}

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

variable "test_user_password" {
  description = "Password for pilot/test users (set via TF_VAR_test_user_password from GCP Secret Manager)"
  type        = string
  sensitive   = true
}

variable "admin_user_password" {
  description = "Password for admin-[INSTANCE] super_admin user (set via TF_VAR_admin_user_password from GCP Secret Manager). Falls back to test_user_password if unset."
  type        = string
  sensitive   = true
}




