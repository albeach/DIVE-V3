#!/bin/bash
#
# generate-tunnel-configs.sh
# 
# Generates Cloudflare tunnel configuration files from federation-registry.json
# This ensures tunnel configs are ALWAYS in sync with the deployment configuration.
#
# SSOT: config/federation-registry.json
# OUTPUT: cloudflared/config-{instance}.yml (generated, do not hand-edit)
#
# The registry defines EVERYTHING:
#   - Service names (exact Docker service names)
#   - Internal ports (what container listens on - used by tunnel)
#   - External ports (host mapping for local dev access)
#   - Hostnames (Cloudflare-routed domains)
#   - Protocol (http/https)
#
# Usage:
#   ./scripts/federation/generate-tunnel-configs.sh [instance]
#   ./scripts/federation/generate-tunnel-configs.sh          # Generate all
#   ./scripts/federation/generate-tunnel-configs.sh usa      # Generate USA only
#   ./scripts/federation/generate-tunnel-configs.sh fra gbr  # Generate FRA and GBR
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
REGISTRY_FILE="$PROJECT_ROOT/config/federation-registry.json"
OUTPUT_DIR="$PROJECT_ROOT/cloudflared"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  DIVE V3 - Cloudflare Tunnel Config Generator${NC}"
echo -e "${CYAN}  SSOT: config/federation-registry.json v3.0${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check dependencies
if ! command -v jq &> /dev/null; then
    echo -e "${RED}✗ Error: jq is required but not installed${NC}"
    echo "  Install with: brew install jq (macOS) or apt install jq (Linux)"
    exit 1
fi

# Verify registry file exists
if [[ ! -f "$REGISTRY_FILE" ]]; then
    echo -e "${RED}✗ Error: Registry file not found: $REGISTRY_FILE${NC}"
    exit 1
fi

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

# Get list of instances to process
if [[ $# -eq 0 ]]; then
    # No arguments - process all enabled instances
    INSTANCES=$(jq -r '.instances | to_entries[] | select(.value.enabled == true) | .key' "$REGISTRY_FILE")
else
    # Process specified instances
    INSTANCES="$@"
fi

# Function to generate config for a single instance
generate_config() {
    local instance="$1"
    local instance_upper=$(echo "$instance" | tr '[:lower:]' '[:upper:]')
    
    echo -e "${BLUE}→ Generating config for: ${instance_upper}${NC}"
    
    # Extract instance data from registry
    local tunnel_id=$(jq -r ".instances.${instance}.cloudflare.tunnelId // empty" "$REGISTRY_FILE")
    local metrics_port=$(jq -r ".instances.${instance}.cloudflare.metricsPort // 9126" "$REGISTRY_FILE")
    local config_file=$(jq -r ".instances.${instance}.cloudflare.configFile // empty" "$REGISTRY_FILE")
    local instance_code=$(jq -r ".instances.${instance}.code // empty" "$REGISTRY_FILE")
    local instance_name=$(jq -r ".instances.${instance}.name // empty" "$REGISTRY_FILE")
    local domain=$(jq -r ".instances.${instance}.deployment.domain // empty" "$REGISTRY_FILE")
    
    # Get service definitions - ALL from registry (no assumptions!)
    local frontend_name=$(jq -r ".instances.${instance}.services.frontend.name // empty" "$REGISTRY_FILE")
    local frontend_port=$(jq -r ".instances.${instance}.services.frontend.internalPort // empty" "$REGISTRY_FILE")
    local frontend_protocol=$(jq -r ".instances.${instance}.services.frontend.protocol // empty" "$REGISTRY_FILE")
    local frontend_hostname=$(jq -r ".instances.${instance}.services.frontend.hostname // empty" "$REGISTRY_FILE")
    
    local backend_name=$(jq -r ".instances.${instance}.services.backend.name // empty" "$REGISTRY_FILE")
    local backend_port=$(jq -r ".instances.${instance}.services.backend.internalPort // empty" "$REGISTRY_FILE")
    local backend_protocol=$(jq -r ".instances.${instance}.services.backend.protocol // empty" "$REGISTRY_FILE")
    local backend_hostname=$(jq -r ".instances.${instance}.services.backend.hostname // empty" "$REGISTRY_FILE")
    
    local keycloak_name=$(jq -r ".instances.${instance}.services.keycloak.name // empty" "$REGISTRY_FILE")
    local keycloak_port=$(jq -r ".instances.${instance}.services.keycloak.internalPort // empty" "$REGISTRY_FILE")
    local keycloak_protocol=$(jq -r ".instances.${instance}.services.keycloak.protocol // empty" "$REGISTRY_FILE")
    local keycloak_hostname=$(jq -r ".instances.${instance}.services.keycloak.hostname // empty" "$REGISTRY_FILE")
    
    local kas_name=$(jq -r ".instances.${instance}.services.kas.name // empty" "$REGISTRY_FILE")
    local kas_port=$(jq -r ".instances.${instance}.services.kas.internalPort // empty" "$REGISTRY_FILE")
    local kas_protocol=$(jq -r ".instances.${instance}.services.kas.protocol // empty" "$REGISTRY_FILE")
    local kas_hostname=$(jq -r ".instances.${instance}.services.kas.hostname // empty" "$REGISTRY_FILE")
    
    # Validate required fields
    local validation_failed=false
    
    if [[ -z "$tunnel_id" ]]; then
        echo -e "${RED}  ✗ Missing: cloudflare.tunnelId${NC}"
        validation_failed=true
    fi
    
    if [[ -z "$frontend_name" || -z "$frontend_port" || -z "$frontend_hostname" ]]; then
        echo -e "${RED}  ✗ Missing: services.frontend (name, internalPort, or hostname)${NC}"
        validation_failed=true
    fi
    
    if [[ -z "$backend_name" || -z "$backend_port" || -z "$backend_hostname" ]]; then
        echo -e "${RED}  ✗ Missing: services.backend (name, internalPort, or hostname)${NC}"
        validation_failed=true
    fi
    
    if [[ -z "$keycloak_name" || -z "$keycloak_port" || -z "$keycloak_hostname" ]]; then
        echo -e "${RED}  ✗ Missing: services.keycloak (name, internalPort, or hostname)${NC}"
        validation_failed=true
    fi
    
    if [[ -z "$kas_name" || -z "$kas_port" || -z "$kas_hostname" ]]; then
        echo -e "${RED}  ✗ Missing: services.kas (name, internalPort, or hostname)${NC}"
        validation_failed=true
    fi
    
    if [[ "$validation_failed" == "true" ]]; then
        echo -e "${RED}  ✗ Validation failed for instance: $instance${NC}"
        return 1
    fi
    
    # Determine output filename from registry
    local output_file="$PROJECT_ROOT/$config_file"
    
    # Generate the config file
    cat > "$output_file" << EOF
# ============================================================================
# Cloudflare Tunnel Configuration - ${instance_code} Instance (${instance_name})
# ============================================================================
#
# AUTO-GENERATED FROM SSOT - DO NOT EDIT MANUALLY
#
# Source: config/federation-registry.json
# Generator: scripts/federation/generate-tunnel-configs.sh
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
#
# To modify this configuration:
#   1. Edit config/federation-registry.json
#   2. Run: ./scripts/federation/generate-tunnel-configs.sh ${instance}
#   3. Restart tunnel: docker compose -p ${instance} up -d --force-recreate cloudflared
#
# ============================================================================

tunnel: ${tunnel_id}
credentials-file: /etc/cloudflared/tunnel-credentials.json

# Force HTTP/2 to avoid QUIC timeout issues on restricted networks
protocol: http2

# Metrics endpoint for monitoring (accessible at localhost:${metrics_port})
metrics: 0.0.0.0:${metrics_port}

ingress:
  # ─────────────────────────────────────────────────────────────────────────
  # Frontend (Next.js)
  # Docker Service: ${frontend_name}
  # Internal Port:  ${frontend_port}
  # Hostname:       ${frontend_hostname}
  # ─────────────────────────────────────────────────────────────────────────
  - hostname: ${frontend_hostname}
    service: ${frontend_protocol}://${frontend_name}:${frontend_port}
    originRequest:
      noTLSVerify: true
      connectTimeout: 60s
      httpHostHeader: ${frontend_hostname}
  
  # ─────────────────────────────────────────────────────────────────────────
  # Backend API (Express.js)
  # Docker Service: ${backend_name}
  # Internal Port:  ${backend_port}
  # Hostname:       ${backend_hostname}
  # ─────────────────────────────────────────────────────────────────────────
  - hostname: ${backend_hostname}
    service: ${backend_protocol}://${backend_name}:${backend_port}
    originRequest:
      noTLSVerify: true
      connectTimeout: 60s
      httpHostHeader: ${backend_hostname}
  
  # ─────────────────────────────────────────────────────────────────────────
  # Keycloak IdP
  # Docker Service: ${keycloak_name}
  # Internal Port:  ${keycloak_port}
  # Hostname:       ${keycloak_hostname}
  # ─────────────────────────────────────────────────────────────────────────
  - hostname: ${keycloak_hostname}
    service: ${keycloak_protocol}://${keycloak_name}:${keycloak_port}
    originRequest:
      noTLSVerify: true
      connectTimeout: 60s
      httpHostHeader: ${keycloak_hostname}
  
  # ─────────────────────────────────────────────────────────────────────────
  # Key Access Service (KAS)
  # Docker Service: ${kas_name}
  # Internal Port:  ${kas_port}
  # Hostname:       ${kas_hostname}
  # ─────────────────────────────────────────────────────────────────────────
  - hostname: ${kas_hostname}
    service: ${kas_protocol}://${kas_name}:${kas_port}
    originRequest:
      connectTimeout: 60s
      httpHostHeader: ${kas_hostname}
  
  # ─────────────────────────────────────────────────────────────────────────
  # Catch-all (required by Cloudflare)
  # ─────────────────────────────────────────────────────────────────────────
  - service: http_status:404
EOF

    echo -e "${GREEN}  ✓ Generated: ${output_file}${NC}"
    echo -e "    Frontend:  ${frontend_name}:${frontend_port} → ${frontend_hostname}"
    echo -e "    Backend:   ${backend_name}:${backend_port} → ${backend_hostname}"
    echo -e "    Keycloak:  ${keycloak_name}:${keycloak_port} → ${keycloak_hostname}"
    echo -e "    KAS:       ${kas_name}:${kas_port} → ${kas_hostname}"
}

# Main execution
echo "Registry: $REGISTRY_FILE"
echo "Output:   $OUTPUT_DIR"
echo ""

# Verify registry version
REGISTRY_VERSION=$(jq -r '.version // "unknown"' "$REGISTRY_FILE")
if [[ ! "$REGISTRY_VERSION" =~ ^3\. ]]; then
    echo -e "${RED}✗ Error: Registry version $REGISTRY_VERSION not supported${NC}"
    echo -e "${RED}  This generator requires registry v3.x with services schema${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Registry version: $REGISTRY_VERSION${NC}"
echo ""

# Track success/failure
GENERATED=0
FAILED=0

for instance in $INSTANCES; do
    # Normalize to lowercase
    instance=$(echo "$instance" | tr '[:upper:]' '[:lower:]')
    
    # Check if instance exists in registry
    if ! jq -e ".instances.${instance}" "$REGISTRY_FILE" > /dev/null 2>&1; then
        echo -e "${RED}✗ Instance not found in registry: $instance${NC}"
        ((FAILED++))
        continue
    fi
    
    # Check if instance is enabled
    if [[ $(jq -r ".instances.${instance}.enabled" "$REGISTRY_FILE") != "true" ]]; then
        echo -e "${YELLOW}⚠ Skipping disabled instance: $instance${NC}"
        continue
    fi
    
    if generate_config "$instance"; then
        ((GENERATED++))
    else
        ((FAILED++))
    fi
    echo ""
done

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
if [[ $FAILED -eq 0 ]]; then
    echo -e "${GREEN}✓ Successfully generated $GENERATED tunnel configs${NC}"
else
    echo -e "${GREEN}✓ Generated: $GENERATED configs${NC}"
    echo -e "${RED}✗ Failed: $FAILED configs${NC}"
fi
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "  1. Restart tunnels to apply changes:"
echo -e "     docker compose -p <instance> up -d --force-recreate cloudflared"
echo ""
echo -e "${YELLOW}Remember:${NC}"
echo -e "  • Tunnel configs are auto-generated from federation-registry.json"
echo -e "  • To modify routing, update the registry and re-run this script"
echo -e "  • NEVER edit cloudflared/config*.yml files directly"

exit $FAILED
