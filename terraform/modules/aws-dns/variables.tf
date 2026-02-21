# =============================================================================
# DIVE V3 — AWS DNS Module Variables
# =============================================================================

variable "environment" {
  description = "Environment: dev or staging"
  type        = string
}

variable "base_domain" {
  description = "Base domain (e.g., dive25.com)"
  type        = string
  default     = "dive25.com"
}

variable "hub_public_ip" {
  description = "Public IP address of the hub instance"
  type        = string
}

variable "spoke_ips" {
  description = "Map of spoke code -> public IP"
  type        = map(string)
  default     = {}
}

variable "tags" {
  description = "Additional tags"
  type        = map(string)
  default     = {}
}
