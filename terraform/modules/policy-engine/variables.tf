# =============================================================================
# Policy Engine Module - Variables
# =============================================================================
# Input variables for OPA + OPAL deployment configuration.
#
# Required variables:
#   - environment: Deployment environment (dev, staging, prod)
#   - tenant_code: Tenant identifier (USA, FRA, GBR, DEU)
#
# Optional variables have sensible defaults for DIVE V3 infrastructure.
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
  description = "Tenant identifier using ISO 3166-1 alpha-3 (USA, FRA, GBR, DEU)"
  type        = string

  validation {
    condition     = can(regex("^[A-Z]{3}$", var.tenant_code))
    error_message = "Tenant code must be a 3-letter uppercase code (ISO 3166-1 alpha-3)."
  }
}

# -----------------------------------------------------------------------------
# GCP Configuration
# -----------------------------------------------------------------------------

variable "gcp_project_id" {
  description = "GCP project ID for Secret Manager integration"
  type        = string
  default     = "dive25"
}

variable "gcp_region" {
  description = "GCP region for resources"
  type        = string
  default     = "us-east4"
}

# -----------------------------------------------------------------------------
# Docker Network Configuration
# -----------------------------------------------------------------------------

variable "docker_network_name" {
  description = "Docker network name for service communication"
  type        = string
  default     = "dive-v3_dive-network"
}

variable "docker_network_external" {
  description = "Whether the Docker network is external (pre-existing)"
  type        = bool
  default     = true
}

# -----------------------------------------------------------------------------
# OPA Configuration
# -----------------------------------------------------------------------------

variable "opa_image" {
  description = "OPA Docker image and tag"
  type        = string
  default     = "openpolicyagent/opa:0.68.0-static"
}

variable "opa_port" {
  description = "OPA REST API port"
  type        = number
  default     = 8181

  validation {
    condition     = var.opa_port >= 1024 && var.opa_port <= 65535
    error_message = "OPA port must be between 1024 and 65535."
  }
}

variable "opa_log_level" {
  description = "OPA log level (debug, info, warn, error)"
  type        = string
  default     = "info"

  validation {
    condition     = contains(["debug", "info", "warn", "error"], var.opa_log_level)
    error_message = "OPA log level must be one of: debug, info, warn, error."
  }
}

variable "opa_decision_logging" {
  description = "Enable OPA decision logging to console"
  type        = bool
  default     = true
}

# -----------------------------------------------------------------------------
# OPAL Server Configuration
# -----------------------------------------------------------------------------

variable "opal_server_image" {
  description = "OPAL Server Docker image and tag"
  type        = string
  default     = "permitio/opal-server:0.7.6"
}

variable "opal_server_port" {
  description = "OPAL Server API and broadcast port"
  type        = number
  default     = 7002

  validation {
    condition     = var.opal_server_port >= 1024 && var.opal_server_port <= 65535
    error_message = "OPAL Server port must be between 1024 and 65535."
  }
}

variable "opal_policy_repo_url" {
  description = "Git repository URL for policy source (empty for local development)"
  type        = string
  default     = ""
}

variable "opal_policy_repo_branch" {
  description = "Git branch for policy source"
  type        = string
  default     = "main"
}

variable "opal_policy_polling_interval" {
  description = "Policy repository polling interval in seconds"
  type        = number
  default     = 30

  validation {
    condition     = var.opal_policy_polling_interval >= 10
    error_message = "Polling interval must be at least 10 seconds."
  }
}

variable "opal_log_level" {
  description = "OPAL log level (DEBUG, INFO, WARNING, ERROR)"
  type        = string
  default     = "INFO"

  validation {
    condition     = contains(["DEBUG", "INFO", "WARNING", "ERROR"], var.opal_log_level)
    error_message = "OPAL log level must be one of: DEBUG, INFO, WARNING, ERROR."
  }
}

# -----------------------------------------------------------------------------
# OPAL Client Configuration
# -----------------------------------------------------------------------------

variable "opal_client_image" {
  description = "OPAL Client Docker image and tag"
  type        = string
  default     = "permitio/opal-client:0.7.6"
}

variable "opal_client_port" {
  description = "OPAL Client API port"
  type        = number
  default     = 7000

  validation {
    condition     = var.opal_client_port >= 1024 && var.opal_client_port <= 65535
    error_message = "OPAL Client port must be between 1024 and 65535."
  }
}

# -----------------------------------------------------------------------------
# Policy & Data Paths
# -----------------------------------------------------------------------------

variable "policies_path" {
  description = "Host path to policies directory"
  type        = string
  default     = "./policies"
}

variable "policy_data_path" {
  description = "Host path to policy data directory (JSON files)"
  type        = string
  default     = "./policies/data"
}

variable "backend_data_path" {
  description = "Host path to backend OPAL data directory"
  type        = string
  default     = "./backend/data/opal"
}

# -----------------------------------------------------------------------------
# Health Check Configuration
# -----------------------------------------------------------------------------

variable "health_check_interval" {
  description = "Health check interval in seconds"
  type        = number
  default     = 15
}

variable "health_check_timeout" {
  description = "Health check timeout in seconds"
  type        = number
  default     = 10
}

variable "health_check_retries" {
  description = "Number of health check retries before marking unhealthy"
  type        = number
  default     = 5
}

variable "health_check_start_period" {
  description = "Initial grace period for health checks in seconds"
  type        = number
  default     = 30
}

# -----------------------------------------------------------------------------
# Resource Limits (Production)
# -----------------------------------------------------------------------------

variable "opa_memory_limit" {
  description = "OPA container memory limit (e.g., '512m', '1g')"
  type        = string
  default     = "512m"
}

variable "opal_server_memory_limit" {
  description = "OPAL Server container memory limit"
  type        = string
  default     = "512m"
}

variable "opal_client_memory_limit" {
  description = "OPAL Client container memory limit"
  type        = string
  default     = "256m"
}

# -----------------------------------------------------------------------------
# Feature Flags
# -----------------------------------------------------------------------------

variable "enable_opal" {
  description = "Enable OPAL for dynamic policy/data management"
  type        = bool
  default     = true
}

variable "enable_decision_logging" {
  description = "Enable OPA decision logging"
  type        = bool
  default     = true
}

variable "enable_tls" {
  description = "Enable TLS for OPAL Server (production)"
  type        = bool
  default     = false
}

# -----------------------------------------------------------------------------
# Labels and Tags
# -----------------------------------------------------------------------------

variable "labels" {
  description = "Additional labels to apply to resources"
  type        = map(string)
  default     = {}
}







