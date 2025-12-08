# =============================================================================
# Policy Rollout Module - Outputs
# =============================================================================
# Outputs for monitoring deployments and integrating with CI/CD.
# =============================================================================

# -----------------------------------------------------------------------------
# Deployment State
# -----------------------------------------------------------------------------

output "deployment_id" {
  description = "Unique identifier for this deployment"
  value       = local.deployment_id
}

output "deployment_status" {
  description = "Current deployment status"
  value = {
    environment       = var.environment
    tenant            = var.tenant_code
    policy_version    = var.policy_version
    strategy          = var.deployment_strategy
    active_slot       = var.active_slot
    canary_percentage = var.canary_percentage
    timestamp         = timestamp()
  }
}

output "active_slot" {
  description = "Currently active deployment slot"
  value       = var.active_slot
}

output "canary_slot" {
  description = "Canary deployment slot (opposite of active)"
  value       = var.active_slot == "blue" ? "green" : "blue"
}

# -----------------------------------------------------------------------------
# Canary Status
# -----------------------------------------------------------------------------

output "canary_status" {
  description = "Current canary deployment status"
  value = {
    enabled         = var.canary_percentage > 0
    percentage      = var.canary_percentage
    next_percentage = min(var.canary_percentage + var.canary_increment, 100)
    steps_remaining = ceil((100 - var.canary_percentage) / var.canary_increment)
    promotion_delay = var.canary_promotion_delay
    auto_rollback   = var.enable_auto_rollback
  }
}

# -----------------------------------------------------------------------------
# Validation Results
# -----------------------------------------------------------------------------

output "validation_config" {
  description = "Validation configuration for CI/CD"
  value = {
    require_tests_pass  = var.require_tests_pass
    minimum_coverage    = var.minimum_test_coverage
    baseline_comparison = var.enable_baseline_comparison
    baseline_tolerance  = var.baseline_tolerance
    opa_path            = var.opa_binary_path
    policy_path         = var.policy_bundle_path
  }
}

# -----------------------------------------------------------------------------
# Rollback Configuration
# -----------------------------------------------------------------------------

output "rollback_config" {
  description = "Rollback configuration"
  value = {
    auto_rollback_enabled = var.enable_auto_rollback
    error_rate_threshold  = var.rollback_on_error_rate
    latency_threshold_ms  = var.rollback_on_latency_p95
    grace_period_seconds  = var.health_check_grace_period
    rollback_command      = "terraform apply -var='canary_percentage=0' -var='active_slot=${var.active_slot == "blue" ? "blue" : "green"}'"
  }
}

# -----------------------------------------------------------------------------
# Scripts and Commands
# -----------------------------------------------------------------------------

output "deployment_scripts" {
  description = "Generated deployment script paths"
  value = {
    pre_deploy_validation = local_file.pre_deploy_script.filename
    deploy                = local_file.deploy_script.filename
    promote_canary        = local_file.promote_script.filename
    rollback              = local_file.rollback_script.filename
    health_check          = local_file.health_check_script.filename
  }
}

output "promotion_command" {
  description = "Command to promote canary to next percentage"
  value       = "terraform apply -var='canary_percentage=${min(var.canary_percentage + var.canary_increment, 100)}'"
}

output "full_promotion_command" {
  description = "Command to fully promote canary (100%)"
  value       = "terraform apply -var='canary_percentage=100'"
}

output "switch_slot_command" {
  description = "Command to switch active slot (blue/green)"
  value       = "terraform apply -var='active_slot=${var.active_slot == "blue" ? "green" : "blue"}'"
}

# -----------------------------------------------------------------------------
# Monitoring Integration
# -----------------------------------------------------------------------------

output "metrics_labels" {
  description = "Labels for metrics and monitoring"
  value = {
    deployment_id  = local.deployment_id
    environment    = var.environment
    tenant         = var.tenant_code
    policy_version = var.policy_version
    strategy       = var.deployment_strategy
    active_slot    = var.active_slot
    canary_active  = var.canary_percentage > 0
  }
}

output "notification_config" {
  description = "Notification configuration (webhook omitted)"
  value = {
    webhook_configured = var.notification_webhook != ""
    notify_on_events   = var.notify_on_events
  }
}







