# =============================================================================
# DIVE V3 Policy Engine Infrastructure
# =============================================================================
# Main Terraform configuration for deploying OPA + OPAL policy infrastructure.
#
# Usage:
#   # Initialize (first time)
#   cd terraform/policy-engine
#   terraform init
#
#   # Select environment
#   terraform workspace select dev  # or staging, prod
#
#   # Plan changes
#   terraform plan -var-file=environments/$(terraform workspace show)/terraform.tfvars
#
#   # Apply changes
#   terraform apply -var-file=environments/$(terraform workspace show)/terraform.tfvars
#
# Environments:
#   - dev: Development (local Docker, verbose logging)
#   - staging: Pre-production (production-like config)
#   - prod: Production (resource limits, TLS enabled)
# =============================================================================

# -----------------------------------------------------------------------------
# Local Values
# -----------------------------------------------------------------------------

locals {
  # Use workspace name as environment if not overridden
  effective_environment = terraform.workspace != "default" ? terraform.workspace : var.environment

  # Environment-specific settings
  env_config = {
    dev = {
      opa_log_level   = "debug"
      opal_log_level  = "DEBUG"
      enable_tls      = false
      resource_limits = false
    }
    staging = {
      opa_log_level   = "info"
      opal_log_level  = "INFO"
      enable_tls      = false
      resource_limits = false
    }
    prod = {
      opa_log_level   = "warn"
      opal_log_level  = "WARNING"
      enable_tls      = true
      resource_limits = true
    }
  }

  # Get config for current environment
  current_env_config = local.env_config[local.effective_environment]
}

# -----------------------------------------------------------------------------
# Policy Engine Module
# -----------------------------------------------------------------------------

module "policy_engine" {
  source = "../modules/policy-engine"

  # Core configuration
  environment = local.effective_environment
  tenant_code = var.tenant_code

  # GCP configuration
  gcp_project_id = var.gcp_project_id
  gcp_region     = var.gcp_region

  # OPAL configuration
  enable_opal          = var.enable_opal
  opal_policy_repo_url = var.opal_policy_repo_url
  opal_log_level       = coalesce(var.opal_log_level, local.current_env_config.opal_log_level)

  # OPA configuration
  opa_log_level           = coalesce(var.opa_log_level, local.current_env_config.opa_log_level)
  enable_decision_logging = var.enable_decision_logging

  # TLS configuration (production)
  enable_tls = local.current_env_config.enable_tls

  # Paths
  policies_path     = var.policies_path
  policy_data_path  = var.policy_data_path
  backend_data_path = var.backend_data_path

  # Labels
  labels = {
    "dive.terraform-workspace" = terraform.workspace
    "dive.deployed-at"         = timestamp()
  }
}

# -----------------------------------------------------------------------------
# Policy Rollout Module
# -----------------------------------------------------------------------------

module "policy_rollout" {
  source = "../modules/policy-rollout"

  # Core configuration
  environment    = local.effective_environment
  tenant_code    = var.tenant_code
  policy_version = var.policy_version

  # Canary configuration
  canary_percentage = var.canary_percentage

  # Validation configuration
  policy_bundle_path    = var.policies_path
  minimum_test_coverage = 73 # Match current coverage

  # Labels
  labels = {
    "dive.terraform-workspace" = terraform.workspace
  }
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "policy_engine" {
  description = "Policy engine configuration"
  value       = module.policy_engine
}

output "policy_rollout" {
  description = "Policy rollout configuration"
  value       = module.policy_rollout
  sensitive   = true  # Contains notification_webhook
}

output "environment" {
  description = "Current deployment environment"
  value       = local.effective_environment
}

output "workspace" {
  description = "Current Terraform workspace"
  value       = terraform.workspace
}

output "deployment_info" {
  description = "Deployment information summary"
  value = {
    environment    = local.effective_environment
    tenant         = var.tenant_code
    policy_version = var.policy_version
    opal_enabled   = var.enable_opal
    canary_pct     = var.canary_percentage
    workspace      = terraform.workspace
  }
}

