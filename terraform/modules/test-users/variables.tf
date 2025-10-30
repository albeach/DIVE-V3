# ============================================
# Test Users Module Variables
# ============================================

variable "realm_id" {
  description = "Keycloak realm ID where test users will be created"
  type        = string
}

variable "unclass_password" {
  description = "Password for testuser-unclass"
  type        = string
  default     = "Unclass123!"
  sensitive   = true
}

variable "secret_password" {
  description = "Password for testuser-secret"
  type        = string
  default     = "Secret123!"
  sensitive   = true
}

variable "confidential_password" {
  description = "Password for testuser-confidential"
  type        = string
  default     = "Confidential123!"
  sensitive   = true
}

