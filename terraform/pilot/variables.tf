variable "client_secret" {
  description = "Client secret for the broker client"
  type        = string
  sensitive   = true
}

variable "fra_idp_url" {
  description = "Federation IdP URL for FRA"
  type        = string
  default     = "https://fra-idp.dive25.com"
}

variable "gbr_idp_url" {
  description = "Federation IdP URL for GBR"
  type        = string
  default     = "https://gbr-idp.dive25.com"
}

variable "gbr_client_secret" {
  description = "Client secret for GBR federation client"
  type        = string
  sensitive   = true
  default     = "placeholder-sync-after-terraform"
}

variable "deu_idp_url" {
  description = "Federation IdP URL for DEU"
  type        = string
  default     = "https://deu-idp.dive25.com"
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




