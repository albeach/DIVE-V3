# ============================================
# Step-Up Authentication Module Variables
# ============================================
# NIST SP 800-63B Compliant LoA/ACR Configuration
# Reference: Keycloak 26.4.2 Step-Up Authentication
# https://www.keycloak.org/docs/latest/server_admin/index.html#_step-up-flow

variable "realm_id" {
  description = "Keycloak realm ID"
  type        = string
}

variable "realm_name" {
  description = "Keycloak realm name (e.g., dive-v3-usa)"
  type        = string
}

variable "realm_display_name" {
  description = "Human-readable realm display name (e.g., United States)"
  type        = string
}

variable "clearance_attribute_name" {
  description = "User attribute name for clearance level (default: clearance)"
  type        = string
  default     = "clearance"
}

# ============================================
# ACR / LoA Configuration
# ============================================

variable "acr_loa_mappings" {
  description = "Map of ACR values to LoA numeric levels"
  type = map(object({
    acr_value = string
    loa_level = number
    max_age   = number
  }))
  default = {
    aal1 = {
      acr_value = "urn:mace:incommon:iap:silver" # NIST AAL1
      loa_level = 1
      max_age   = 300 # 5 minutes for basic auth
    }
    aal2 = {
      acr_value = "urn:mace:incommon:iap:gold" # NIST AAL2 (OTP/SMS)
      loa_level = 2
      max_age   = 0 # Always require MFA on explicit request
    }
    aal3 = {
      acr_value = "urn:mace:incommon:iap:platinum" # NIST AAL3 (WebAuthn/hardware)
      loa_level = 3
      max_age   = 0 # Always require hardware key on explicit request
    }
  }
}



