# =============================================================================
# Policy Engine Module - Outputs
# =============================================================================
# Outputs for integration with other Terraform modules and Docker Compose.
# =============================================================================

# -----------------------------------------------------------------------------
# OPA Outputs
# -----------------------------------------------------------------------------

output "opa_container_name" {
  description = "Name of the OPA container"
  value       = local.opa_container_name
}

output "opa_endpoint" {
  description = "OPA REST API endpoint"
  value       = "http://${local.opa_container_name}:${var.opa_port}"
}

output "opa_health_url" {
  description = "OPA health check URL"
  value       = "http://${local.opa_container_name}:${var.opa_port}/health"
}

output "opa_decision_url" {
  description = "OPA authorization decision URL (dive.authz)"
  value       = "http://${local.opa_container_name}:${var.opa_port}/v1/data/dive/authz/decision"
}

output "opa_decision_url_v1_compat" {
  description = "OPA authorization decision URL (v1 compatibility shim)"
  value       = "http://${local.opa_container_name}:${var.opa_port}/v1/data/dive/authorization/decision"
}

# -----------------------------------------------------------------------------
# OPAL Server Outputs
# -----------------------------------------------------------------------------

output "opal_server_container_name" {
  description = "Name of the OPAL Server container"
  value       = var.enable_opal ? local.opal_server_container_name : null
}

output "opal_server_endpoint" {
  description = "OPAL Server API endpoint"
  value       = var.enable_opal ? "http://${local.opal_server_container_name}:${var.opal_server_port}" : null
}

output "opal_server_health_url" {
  description = "OPAL Server health check URL"
  value       = var.enable_opal ? "http://${local.opal_server_container_name}:${var.opal_server_port}/healthcheck" : null
}

output "opal_server_broadcast_url" {
  description = "OPAL Server broadcast URL for clients"
  value       = var.enable_opal ? "http://${local.opal_server_container_name}:${var.opal_server_port}" : null
}

# -----------------------------------------------------------------------------
# OPAL Client Outputs
# -----------------------------------------------------------------------------

output "opal_client_container_name" {
  description = "Name of the OPAL Client container"
  value       = var.enable_opal ? local.opal_client_container_name : null
}

output "opal_client_endpoint" {
  description = "OPAL Client API endpoint"
  value       = var.enable_opal ? "http://${local.opal_client_container_name}:${var.opal_client_port}" : null
}

# -----------------------------------------------------------------------------
# Configuration Outputs (for Docker Compose integration)
# -----------------------------------------------------------------------------

output "docker_compose_config" {
  description = "Docker Compose configuration fragment"
  value = {
    networks = {
      name     = var.docker_network_name
      external = var.docker_network_external
    }
    opa = {
      image          = var.opa_image
      container_name = local.opa_container_name
      port           = var.opa_port
      log_level      = var.opa_log_level
    }
    opal_server = var.enable_opal ? {
      image          = var.opal_server_image
      container_name = local.opal_server_container_name
      port           = var.opal_server_port
      log_level      = var.opal_log_level
    } : null
    opal_client = var.enable_opal ? {
      image          = var.opal_client_image
      container_name = local.opal_client_container_name
      client_port    = var.opal_client_port
      opa_port       = var.opa_port
    } : null
  }
}

# -----------------------------------------------------------------------------
# Environment-specific Outputs
# -----------------------------------------------------------------------------

output "environment" {
  description = "Deployment environment"
  value       = var.environment
}

output "tenant_code" {
  description = "Tenant identifier"
  value       = var.tenant_code
}

output "resource_prefix" {
  description = "Resource naming prefix"
  value       = local.resource_prefix
}

# -----------------------------------------------------------------------------
# Health Check Configuration Output
# -----------------------------------------------------------------------------

output "health_check_config" {
  description = "Health check configuration for monitoring"
  value = {
    opa = {
      endpoint = "http://${local.opa_container_name}:${var.opa_port}/health"
      interval = var.health_check_interval
      timeout  = var.health_check_timeout
      retries  = var.health_check_retries
    }
    opal_server = var.enable_opal ? {
      endpoint = "http://${local.opal_server_container_name}:${var.opal_server_port}/healthcheck"
      interval = var.health_check_interval
      timeout  = var.health_check_timeout
      retries  = var.health_check_retries
    } : null
  }
}



