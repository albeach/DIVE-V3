# ============================================
# Terraform Module: Realm MFA Configuration
# ============================================
# Reusable module for configuring MFA authentication flows
# and OTP policies for DIVE V3 realms
#
# Usage:
#   module "usa_mfa" {
#     source = "./modules/realm-mfa"
#     realm_id = keycloak_realm.dive_v3_usa.id
#     realm_name = "dive-v3-usa"
#     realm_display_name = "United States"
#   }

variable "realm_id" {
  description = "Keycloak realm ID (e.g., keycloak_realm.dive_v3_usa.id)"
  type        = string
}

variable "realm_name" {
  description = "Realm name for resource naming (e.g., 'dive-v3-usa')"
  type        = string
}

variable "realm_display_name" {
  description = "Human-readable realm name for flow descriptions (e.g., 'United States')"
  type        = string
}

variable "clearance_attribute_name" {
  description = "User attribute name for clearance level"
  type        = string
  default     = "clearance"
}

variable "clearance_attribute_value_regex" {
  description = "Regex pattern for matching classified clearances requiring MFA (CONFIDENTIAL, SECRET, TOP_SECRET). UNCLASSIFIED and RESTRICTED both remain AAL1 (no MFA required)."
  type        = string
  default     = "^(CONFIDENTIAL|SECRET|TOP_SECRET)$"
}

variable "otp_policy" {
  description = "OTP policy configuration (note: applied at realm level, not in module)"
  type = object({
    digits     = number
    period     = number
    algorithm  = string
    type       = string
    look_ahead = number
  })
  default = {
    digits     = 6
    period     = 30
    algorithm  = "HmacSHA256"
    type       = "totp"
    look_ahead = 1
  }
}

variable "enable_direct_grant_mfa" {
  description = "⚠️ DEPRECATED: Enable MFA for Direct Grant (ROPC) flow. Default is FALSE (disabled). Use browser-based flows only. See docs/NATIVE-KEYCLOAK-REFACTORING.md"
  type        = bool
  default     = false # CHANGED in v2.0.0: Direct Grant is DEPRECATED
}

variable "use_standard_browser_flow" {
  description = "Use standard Keycloak browser flow instead of custom MFA flow (for federated realms)"
  type        = bool
  default     = false
}

