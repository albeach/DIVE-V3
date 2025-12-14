# ============================================
# Shared Mappers Module - Input Variables
# ============================================

variable "realm_id" {
  description = "Keycloak realm ID (usually dive-v3-broker)"
  type        = string
}

variable "idp_alias" {
  description = "Identity Provider alias (e.g., usa-realm-broker, esp-realm-broker)"
  type        = string
}

variable "idp_prefix" {
  description = "Prefix for mapper names (e.g., usa, esp, fra)"
  type        = string
}

variable "unique_id_claim" {
  description = "JWT claim to map to uniqueID (usually 'uniqueID' or 'email')"
  type        = string
  default     = "uniqueID"
}

