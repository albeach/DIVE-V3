# =============================================================================
# Policy Engine Root Variables
# =============================================================================
# Variables for the policy engine Terraform configuration.
# Override via terraform.tfvars or -var flags.
# =============================================================================

# -----------------------------------------------------------------------------
# GCP Configuration
# -----------------------------------------------------------------------------

variable "gcp_project_id" {
  description = "GCP project ID for resources"
  type        = string
  default     = "dive25"
}

variable "gcp_region" {
  description = "GCP region for resources"
  type        = string
  default     = "us-east4"
}

# -----------------------------------------------------------------------------
# Deployment Configuration
# -----------------------------------------------------------------------------

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

variable "tenant_code" {
  description = "Tenant identifier (ISO 3166-1 alpha-3)"
  type        = string
  default     = "USA"

  validation {
    condition     = can(regex("^[A-Z]{3}$", var.tenant_code))
    error_message = "Tenant code must be a 3-letter uppercase code."
  }
}

# -----------------------------------------------------------------------------
# OPAL Configuration
# -----------------------------------------------------------------------------

variable "enable_opal" {
  description = "Enable OPAL for dynamic policy/data management"
  type        = bool
  default     = true
}

variable "opal_policy_repo_url" {
  description = "Git repository URL for policy source"
  type        = string
  default     = ""
}

variable "opal_log_level" {
  description = "OPAL log level"
  type        = string
  default     = "INFO"
}

# -----------------------------------------------------------------------------
# OPA Configuration
# -----------------------------------------------------------------------------

variable "opa_log_level" {
  description = "OPA log level"
  type        = string
  default     = "info"
}

variable "enable_decision_logging" {
  description = "Enable OPA decision logging"
  type        = bool
  default     = true
}

# -----------------------------------------------------------------------------
# Canary Deployment
# -----------------------------------------------------------------------------

variable "canary_percentage" {
  description = "Percentage of traffic to route to canary"
  type        = number
  default     = 0
}

variable "policy_version" {
  description = "Version of the policy bundle"
  type        = string
  default     = "v1.0.0"
}

# -----------------------------------------------------------------------------
# Paths
# -----------------------------------------------------------------------------

variable "policies_path" {
  description = "Path to policies directory"
  type        = string
  default     = "../../policies"
}

variable "policy_data_path" {
  description = "Path to policy data directory"
  type        = string
  default     = "../../policies/data"
}

variable "backend_data_path" {
  description = "Path to backend OPAL data"
  type        = string
  default     = "../../backend/data/opal"
}






