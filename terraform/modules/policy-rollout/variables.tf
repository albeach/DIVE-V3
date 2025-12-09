# =============================================================================
# Policy Rollout Module - Variables
# =============================================================================
# Input variables for canary deployment configuration.
#
# The module supports:
#   - Canary percentage configuration (0-100%)
#   - Blue/Green slot management
#   - Rollback triggers
#   - Health validation before promotion
# =============================================================================

# -----------------------------------------------------------------------------
# Required Variables
# -----------------------------------------------------------------------------

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

variable "tenant_code" {
  description = "Tenant identifier using ISO 3166-1 alpha-3"
  type        = string

  validation {
    condition     = can(regex("^[A-Z]{3}$", var.tenant_code))
    error_message = "Tenant code must be a 3-letter uppercase code."
  }
}

variable "policy_version" {
  description = "Version identifier for the policy bundle being deployed"
  type        = string

  validation {
    condition     = can(regex("^v?[0-9]+\\.[0-9]+\\.[0-9]+", var.policy_version))
    error_message = "Policy version must follow semver format (e.g., v1.2.3 or 1.2.3)."
  }
}

# -----------------------------------------------------------------------------
# Canary Configuration
# -----------------------------------------------------------------------------

variable "canary_percentage" {
  description = "Percentage of traffic to route to canary (0-100)"
  type        = number
  default     = 0

  validation {
    condition     = var.canary_percentage >= 0 && var.canary_percentage <= 100
    error_message = "Canary percentage must be between 0 and 100."
  }
}

variable "canary_increment" {
  description = "Percentage increment for each canary promotion step"
  type        = number
  default     = 10

  validation {
    condition     = var.canary_increment >= 1 && var.canary_increment <= 50
    error_message = "Canary increment must be between 1 and 50."
  }
}

variable "canary_promotion_delay" {
  description = "Minimum delay between canary promotion steps (seconds)"
  type        = number
  default     = 300

  validation {
    condition     = var.canary_promotion_delay >= 60
    error_message = "Canary promotion delay must be at least 60 seconds."
  }
}

# -----------------------------------------------------------------------------
# Deployment Strategy
# -----------------------------------------------------------------------------

variable "deployment_strategy" {
  description = "Deployment strategy: canary, blue-green, or rolling"
  type        = string
  default     = "canary"

  validation {
    condition     = contains(["canary", "blue-green", "rolling"], var.deployment_strategy)
    error_message = "Deployment strategy must be one of: canary, blue-green, rolling."
  }
}

variable "active_slot" {
  description = "Currently active deployment slot (blue or green)"
  type        = string
  default     = "blue"

  validation {
    condition     = contains(["blue", "green"], var.active_slot)
    error_message = "Active slot must be either 'blue' or 'green'."
  }
}

# -----------------------------------------------------------------------------
# Rollback Configuration
# -----------------------------------------------------------------------------

variable "enable_auto_rollback" {
  description = "Enable automatic rollback on deployment failure"
  type        = bool
  default     = true
}

variable "rollback_on_error_rate" {
  description = "Error rate threshold (%) to trigger rollback"
  type        = number
  default     = 5

  validation {
    condition     = var.rollback_on_error_rate >= 0 && var.rollback_on_error_rate <= 100
    error_message = "Error rate threshold must be between 0 and 100."
  }
}

variable "rollback_on_latency_p95" {
  description = "P95 latency threshold (ms) to trigger rollback"
  type        = number
  default     = 200

  validation {
    condition     = var.rollback_on_latency_p95 >= 10
    error_message = "Latency threshold must be at least 10ms."
  }
}

variable "health_check_grace_period" {
  description = "Grace period (seconds) before health checks start"
  type        = number
  default     = 30
}

# -----------------------------------------------------------------------------
# Validation Configuration
# -----------------------------------------------------------------------------

variable "require_tests_pass" {
  description = "Require policy tests to pass before deployment"
  type        = bool
  default     = true
}

variable "minimum_test_coverage" {
  description = "Minimum test coverage (%) required for deployment"
  type        = number
  default     = 73

  validation {
    condition     = var.minimum_test_coverage >= 0 && var.minimum_test_coverage <= 100
    error_message = "Minimum test coverage must be between 0 and 100."
  }
}

variable "policy_bundle_path" {
  description = "Path to the policy bundle for validation"
  type        = string
  default     = "./policies"
}

variable "opa_binary_path" {
  description = "Path to OPA binary for testing"
  type        = string
  default     = "./bin/opa"
}

# -----------------------------------------------------------------------------
# Baseline Comparison
# -----------------------------------------------------------------------------

variable "enable_baseline_comparison" {
  description = "Enable baseline decision comparison before promotion"
  type        = bool
  default     = true
}

variable "baseline_path" {
  description = "Path to baseline decisions for comparison"
  type        = string
  default     = "./policies/baselines"
}

variable "baseline_tolerance" {
  description = "Maximum allowed difference from baseline (%)"
  type        = number
  default     = 0

  validation {
    condition     = var.baseline_tolerance >= 0 && var.baseline_tolerance <= 100
    error_message = "Baseline tolerance must be between 0 and 100."
  }
}

# -----------------------------------------------------------------------------
# Notification Configuration
# -----------------------------------------------------------------------------

variable "notification_webhook" {
  description = "Webhook URL for deployment notifications (optional)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "notify_on_events" {
  description = "Events to trigger notifications"
  type        = list(string)
  default     = ["deploy_start", "deploy_complete", "rollback", "error"]
}

# -----------------------------------------------------------------------------
# Labels and Tags
# -----------------------------------------------------------------------------

variable "labels" {
  description = "Additional labels to apply to resources"
  type        = map(string)
  default     = {}
}








