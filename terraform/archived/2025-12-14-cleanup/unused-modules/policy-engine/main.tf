# =============================================================================
# Policy Engine Module - Main Resources
# =============================================================================
# This module deploys the OPA + OPAL policy engine infrastructure for DIVE V3.
#
# Architecture:
#   - OPA: Open Policy Agent for policy evaluation
#   - OPAL Server: Central hub for policy/data distribution
#   - OPAL Client: Sidecar for OPA, receives updates from OPAL Server
#
# The module supports both standalone OPA and OPAL-managed deployments.
# For OPAL, policies are synced from Git and data from MongoDB/config files.
#
# Usage:
#   module "policy_engine" {
#     source      = "../modules/policy-engine"
#     environment = "dev"
#     tenant_code = "USA"
#   }
#
# References:
#   - OPA: https://www.openpolicyagent.org/docs/latest/
#   - OPAL: https://docs.opal.ac/
#   - DIVE V3 Policy Spec: docs/PHASE-2-IMPLEMENTATION-PROMPT.md
# =============================================================================

# -----------------------------------------------------------------------------
# Local Values
# -----------------------------------------------------------------------------

locals {
  # Resource naming convention: dive-v3-{tenant}-{component}-{env}
  resource_prefix = "dive-v3-${lower(var.tenant_code)}"

  # Container names
  opa_container_name         = "${local.resource_prefix}-opa"
  opal_server_container_name = "${local.resource_prefix}-opal-server"
  opal_client_container_name = "${local.resource_prefix}-opal-client"

  # Common labels
  common_labels = merge({
    "dive.environment" = var.environment
    "dive.tenant"      = var.tenant_code
    "dive.component"   = "policy-engine"
    "dive.managed-by"  = "terraform"
    "dive.project"     = "dive-v3"
  }, var.labels)

  # OPA configuration for OPAL client
  opa_config = {
    addr       = "0.0.0.0:${var.opa_port}"
    log_level  = var.opa_log_level
    log_format = "json"
    decision_logs = var.enable_decision_logging ? {
      console = true
    } : null
  }

  # Environment-specific settings
  is_production = var.environment == "prod"

  # Resource limits (only apply in production)
  apply_resource_limits = local.is_production
}

# -----------------------------------------------------------------------------
# Docker Network Reference
# -----------------------------------------------------------------------------
# The network should be created by the main docker-compose stack.
# This module expects the network to exist.

data "docker_network" "dive_network" {
  count = var.docker_network_external ? 1 : 0
  name  = var.docker_network_name
}

# Create network if not external
resource "docker_network" "dive_network" {
  count = var.docker_network_external ? 0 : 1
  name  = var.docker_network_name

  labels {
    label = "dive.component"
    value = "network"
  }
}

# -----------------------------------------------------------------------------
# OPA Container (Standalone Mode)
# -----------------------------------------------------------------------------
# Deployed when OPAL is disabled. Policies are loaded from mounted volume.

resource "docker_container" "opa_standalone" {
  count = var.enable_opal ? 0 : 1

  name  = local.opa_container_name
  image = var.opa_image

  # Run OPA server with bundle and decision logging
  command = [
    "run",
    "--server",
    "--addr=0.0.0.0:${var.opa_port}",
    "--log-level=${var.opa_log_level}",
    "--log-format=json",
    var.enable_decision_logging ? "--set=decision_logs.console=true" : "",
    "/policies"
  ]

  restart = "unless-stopped"

  # Network configuration
  networks_advanced {
    name = var.docker_network_external ? data.docker_network.dive_network[0].name : docker_network.dive_network[0].name
  }

  # Port mapping
  ports {
    internal = var.opa_port
    external = var.opa_port
  }

  # Mount policies directory
  volumes {
    host_path      = abspath(var.policies_path)
    container_path = "/policies"
    read_only      = true
  }

  # Health check
  healthcheck {
    test         = ["CMD", "wget", "-q", "--spider", "http://localhost:${var.opa_port}/health"]
    interval     = "${var.health_check_interval}s"
    timeout      = "${var.health_check_timeout}s"
    retries      = var.health_check_retries
    start_period = "${var.health_check_start_period}s"
  }

  # Labels
  dynamic "labels" {
    for_each = local.common_labels
    content {
      label = labels.key
      value = labels.value
    }
  }

  # Memory limit (production only)
  memory = local.apply_resource_limits ? parseint(replace(var.opa_memory_limit, "m", ""), 10) : null
}

# -----------------------------------------------------------------------------
# Docker Compose Override Generation (OPAL Mode)
# -----------------------------------------------------------------------------
# Generates docker-compose override when OPAL is enabled.

resource "local_file" "docker_compose_opal" {
  count    = var.enable_opal ? 1 : 0
  filename = "${path.root}/docker-compose.policy-engine.yml"
  content  = <<-YAML
# =============================================================================
# DIVE V3 Policy Engine - OPAL Mode
# Generated by Terraform
# Environment: ${var.environment} | Tenant: ${var.tenant_code}
# =============================================================================

version: '3.8'

networks:
  dive-network:
    external: true
    name: ${var.docker_network_name}

services:
  # OPAL Server - Policy/Data distribution hub
  opal-server:
    image: ${var.opal_server_image}
    container_name: ${local.opal_server_container_name}
    restart: unless-stopped
    stop_grace_period: 30s
    environment:
      OPAL_BROADCAST_URI: "http://${local.opal_server_container_name}:${var.opal_server_port}"
      OPAL_DATA_CONFIG_SOURCES: '{"config": {"entries": [{"url": "http://${local.opal_server_container_name}:${var.opal_server_port}/policy-data", "topics": ["policy_data"], "dst_path": "/"}]}}'
      OPAL_POLICY_REPO_URL: "${var.opal_policy_repo_url}"
      OPAL_POLICY_REPO_POLLING_INTERVAL: ${var.opal_policy_polling_interval}
      OPAL_POLICY_REPO_MAIN_BRANCH: "${var.opal_policy_repo_branch}"
      OPAL_INLINE_OPA_CONFIG: "true"
      OPAL_LOG_LEVEL: ${var.opal_log_level}
      OPAL_LOG_FORMAT: json
      UVICORN_PORT: ${var.opal_server_port}
      UVICORN_HOST: "0.0.0.0"
      OPAL_DATA_TOPICS_DEFAULT: "policy_data"
      OPAL_STATISTICS_ENABLED: "true"
    ports:
      - "${var.opal_server_port}:${var.opal_server_port}"
    volumes:
      - ${var.policies_path}:/policies:ro
      - ${var.policy_data_path}:/policy-data:ro
    networks:
      - dive-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:${var.opal_server_port}/healthcheck"]
      interval: ${var.health_check_interval}s
      timeout: ${var.health_check_timeout}s
      retries: ${var.health_check_retries}
      start_period: ${var.health_check_start_period}s
    labels:
%{for key, value in local.common_labels~}
      ${key}: "${value}"
%{endfor~}
      dive.service: "opal-server"

  # OPAL Client with embedded OPA
  opal-client:
    image: ${var.opal_client_image}
    container_name: ${local.opal_client_container_name}
    restart: unless-stopped
    stop_grace_period: 30s
    environment:
      OPAL_SERVER_URL: "http://${local.opal_server_container_name}:${var.opal_server_port}"
      OPAL_INLINE_OPA_ENABLED: "true"
      OPAL_INLINE_OPA_CONFIG: '${jsonencode(local.opa_config)}'
      OPAL_DATA_TOPICS: "policy_data"
      OPAL_DEFAULT_UPDATE_CALLBACKS: '{"callbacks": []}'
      OPAL_LOG_LEVEL: ${var.opal_log_level}
      OPAL_LOG_FORMAT: json
      OPAL_CLIENT_TOKEN: ""
      OPAL_DATA_UPDATER_ENABLED: "true"
    ports:
      - "${var.opa_port}:8181"
      - "${var.opal_client_port}:${var.opal_client_port}"
    volumes:
      - ${var.policies_path}:/policies:ro
      - ${var.policy_data_path}:/policy-data:ro
    networks:
      - dive-network
    depends_on:
      opal-server:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8181/health"]
      interval: ${var.health_check_interval}s
      timeout: ${var.health_check_timeout}s
      retries: ${var.health_check_retries}
      start_period: ${var.health_check_start_period}s
    labels:
%{for key, value in local.common_labels~}
      ${key}: "${value}"
%{endfor~}
      dive.service: "opal-client"
YAML
}

# -----------------------------------------------------------------------------
# Docker Compose Override Generation (Standalone OPA Mode)
# -----------------------------------------------------------------------------
# Generates docker-compose override when OPAL is disabled.

resource "local_file" "docker_compose_standalone" {
  count    = var.enable_opal ? 0 : 1
  filename = "${path.root}/docker-compose.policy-engine.yml"
  content  = <<-YAML
# =============================================================================
# DIVE V3 Policy Engine - Standalone OPA Mode
# Generated by Terraform
# Environment: ${var.environment} | Tenant: ${var.tenant_code}
# =============================================================================

version: '3.8'

networks:
  dive-network:
    external: true
    name: ${var.docker_network_name}

services:
  # Standalone OPA
  opa:
    image: ${var.opa_image}
    container_name: ${local.opa_container_name}
    restart: unless-stopped
    command:
      - run
      - --server
      - --addr=0.0.0.0:${var.opa_port}
      - --log-level=${var.opa_log_level}
      - --log-format=json
      - --set=decision_logs.console=true
      - /policies
    ports:
      - "${var.opa_port}:${var.opa_port}"
    volumes:
      - ${var.policies_path}:/policies:ro
    networks:
      - dive-network
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:${var.opa_port}/health"]
      interval: ${var.health_check_interval}s
      timeout: ${var.health_check_timeout}s
      retries: ${var.health_check_retries}
    labels:
%{for key, value in local.common_labels~}
      ${key}: "${value}"
%{endfor~}
YAML
}

# -----------------------------------------------------------------------------
# Health Check Script
# -----------------------------------------------------------------------------
# Generates a health check script for monitoring.

resource "local_file" "health_check_script" {
  filename = "${path.root}/scripts/policy-engine-health.sh"
  content  = <<-EOF
#!/bin/bash
# =============================================================================
# Policy Engine Health Check Script
# Generated by Terraform - ${timestamp()}
# =============================================================================

set -e

ENVIRONMENT="${var.environment}"
TENANT="${var.tenant_code}"

echo "Checking policy engine health for $TENANT ($ENVIRONMENT)..."

# Check OPA health
OPA_URL="http://localhost:${var.opa_port}/health"
echo -n "OPA: "
if curl -sf "$OPA_URL" > /dev/null; then
    echo "✓ Healthy"
else
    echo "✗ Unhealthy"
    exit 1
fi

%{if var.enable_opal}
# Check OPAL Server health
OPAL_SERVER_URL="http://localhost:${var.opal_server_port}/healthcheck"
echo -n "OPAL Server: "
if curl -sf "$OPAL_SERVER_URL" > /dev/null; then
    echo "✓ Healthy"
else
    echo "✗ Unhealthy"
    exit 1
fi
%{endif}

# Test policy evaluation
echo -n "Policy Test: "
DECISION_URL="http://localhost:${var.opa_port}/v1/data/dive/authz/decision"
TEST_INPUT='{"input":{"subject":{"authenticated":true,"uniqueID":"test","clearance":"SECRET","countryOfAffiliation":"USA"},"action":"read","resource":{"classification":"UNCLASSIFIED","releasabilityTo":["USA"]}}}'

RESULT=$(curl -sf -X POST "$DECISION_URL" -H "Content-Type: application/json" -d "$TEST_INPUT" 2>/dev/null || echo '{"error":"failed"}')

if echo "$RESULT" | grep -q '"allow"'; then
    echo "✓ Policy evaluation working"
else
    echo "✗ Policy evaluation failed"
    echo "Response: $RESULT"
    exit 1
fi

echo ""
echo "All health checks passed!"
EOF

  file_permission = "0755"
}

# -----------------------------------------------------------------------------
# Null Resource for Docker Compose Validation
# -----------------------------------------------------------------------------

resource "null_resource" "validate_compose" {
  depends_on = [
    local_file.docker_compose_opal,
    local_file.docker_compose_standalone
  ]

  triggers = {
    enable_opal = var.enable_opal
  }

  provisioner "local-exec" {
    command = "echo 'Docker Compose override generated at ${path.root}/docker-compose.policy-engine.yml'"
  }
}
