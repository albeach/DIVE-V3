# ============================================
# Test Users Module - Variables
# ============================================

variable "realm_id" {
  description = "Keycloak realm ID"
  type        = string
}

variable "realm_name" {
  description = "Realm name (e.g., 'dive-v3-usa')"
  type        = string
}

variable "country_code" {
  description = "ISO 3166-1 alpha-3 country code (e.g., 'USA', 'FRA', 'CAN')"
  type        = string
}

variable "country_code_lower" {
  description = "Lowercase country code for usernames (e.g., 'usa', 'fra', 'can')"
  type        = string
}

variable "email_domain" {
  description = "Email domain for test users (e.g., 'example.mil', 'example.fr')"
  type        = string
  default     = "example.mil"
}

variable "default_password" {
  description = "Default password for all test users (must meet password policy: upper+lower+digit+special+12chars)"
  type        = string
  default     = "Password123!"  # Meets policy: uppercase, lowercase, digit, special char, 12+ chars
  sensitive   = true
}

variable "duty_org" {
  description = "Duty organization (e.g., 'US_ARMY', 'FRENCH_AIR_FORCE')"
  type        = string
}

# ============================================
# Clearance Mappings (Country-Specific)
# ============================================

variable "clearance_mappings" {
  description = "Mapping of standard clearance to country-specific clearance names"
  type        = map(string)
  default = {
    "UNCLASSIFIED" = "UNCLASSIFIED"
    "CONFIDENTIAL" = "CONFIDENTIAL"
    "SECRET"       = "SECRET"
    "TOP_SECRET"   = "TOP SECRET"
  }
}

# ============================================
# COI (Community of Interest) Tags by Clearance
# ============================================

variable "coi_confidential" {
  description = "COI tags for CONFIDENTIAL users"
  type        = list(string)
  default     = []  # Basic access, no special COI
}

variable "coi_secret" {
  description = "COI tags for SECRET users"
  type        = list(string)
  default     = ["NATO-COSMIC"]  # NATO classified access
}

variable "coi_top_secret" {
  description = "COI tags for TOP_SECRET users"
  type        = list(string)
  default     = ["NATO-COSMIC", "FVEY"]  # Full coalition access
}

