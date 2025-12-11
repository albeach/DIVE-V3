#!/bin/bash
# =============================================================================
# DIVE V3 - Generate Instance Configuration from Federation Registry
# =============================================================================
# Best practice: Single source of truth (federation-registry.json)
# generates all instance-specific configuration.
#
# Usage:
#   ./generate-from-registry.sh              # Generate all instances
#   ./generate-from-registry.sh usa          # Generate specific instance
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
REGISTRY_FILE="$ROOT_DIR/config/federation-registry.json"
DOCKER_DIR="$ROOT_DIR/docker"
INSTANCES_DIR="$DOCKER_DIR/instances"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

# -----------------------------------------------------------------------------
# Generate .env file for an instance
# -----------------------------------------------------------------------------
generate_env() {
    local instance=$1
    local instance_upper=$(echo "$instance" | tr '[:lower:]' '[:upper:]')
    local instance_dir="$INSTANCES_DIR/$instance"
    
    log_info "Generating .env for $instance_upper..."
    
    # Read instance config from registry
    local config=$(python3 -c "
import json
import sys

with open('$REGISTRY_FILE') as f:
    registry = json.load(f)

instance_code = '$instance_upper'
instance = next((i for i in registry['instances'] if i['code'] == instance_code), None)

if not instance:
    print(f'Instance {instance_code} not found in registry', file=sys.stderr)
    sys.exit(1)

# Output instance config
print(f\"IDP_HOSTNAME={instance['urls']['idp'].replace('https://', '')}\")
print(f\"API_HOSTNAME={instance['urls']['api'].replace('https://', '')}\")
print(f\"APP_HOSTNAME={instance['urls']['app'].replace('https://', '')}\")
print(f\"REALM={instance['code']}\")
print(f\"COUNTRY_CODE={instance['code']}\")
")
    
    if [[ $? -ne 0 ]]; then
        log_warn "Failed to read instance config from registry"
        return 1
    fi
    
    # Generate .env file
    cat > "$instance_dir/.env" << EOF
# =============================================================================
# DIVE V3 - ${instance_upper} Instance Environment Configuration
# =============================================================================
# AUTO-GENERATED from federation-registry.json
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# =============================================================================

# Instance Identity
COMPOSE_PROJECT_NAME=dive-v3-${instance}
${config}

# Port Assignments (from registry or defaults)
$(get_ports "$instance")

# Keycloak Configuration
KEYCLOAK_ADMIN_PASSWORD=DivePilot2025!SecureAdmin
KEYCLOAK_CLIENT_ID=dive-v3-client-broker
KEYCLOAK_CLIENT_SECRET=$(get_client_secret "$instance")

# Database Credentials
POSTGRES_PASSWORD=postgres-${instance}-secret-2025
MONGO_PASSWORD=mongo-${instance}-secret-2025

# Shared Services
BLACKLIST_REDIS_PASSWORD=DiveBlacklist2025!

# Security
AUTH_SECRET=$(openssl rand -base64 32 2>/dev/null || echo "${instance}-secret-key-change-in-production")

# CORS Configuration
CORS_ORIGINS=https://\${APP_HOSTNAME},https://\${API_HOSTNAME},https://\${IDP_HOSTNAME},http://localhost:\${FRONTEND_PORT},https://localhost:\${FRONTEND_PORT}
EOF

    log_success ".env generated for $instance_upper"
}

# -----------------------------------------------------------------------------
# Get port assignments for instance
# -----------------------------------------------------------------------------
get_ports() {
    local instance=$1
    
    case "$instance" in
        usa)
            echo "KEYCLOAK_HTTP_PORT=8081"
            echo "KEYCLOAK_HTTPS_PORT=8443"
            echo "KEYCLOAK_MGMT_PORT=9081"
            echo "OPA_PORT=8181"
            echo "OPA_METRICS_PORT=9181"
            echo "KAS_PORT=8080"
            echo "BACKEND_PORT=4000"
            echo "FRONTEND_PORT=3000"
            ;;
        fra)
            echo "KEYCLOAK_HTTP_PORT=8082"
            echo "KEYCLOAK_HTTPS_PORT=8444"
            echo "KEYCLOAK_MGMT_PORT=9082"
            echo "OPA_PORT=8182"
            echo "OPA_METRICS_PORT=9182"
            echo "KAS_PORT=8083"
            echo "BACKEND_PORT=4001"
            echo "FRONTEND_PORT=3001"
            ;;
        gbr)
            echo "KEYCLOAK_HTTP_PORT=8183"
            echo "KEYCLOAK_HTTPS_PORT=8445"
            echo "KEYCLOAK_MGMT_PORT=9183"
            echo "OPA_PORT=8283"
            echo "OPA_METRICS_PORT=9283"
            echo "KAS_PORT=8084"
            echo "BACKEND_PORT=4002"
            echo "FRONTEND_PORT=3002"
            ;;
        *)
            # Calculate ports dynamically based on instance index
            local idx=$(get_instance_index "$instance")
            local base_keycloak=$((8081 + idx))
            echo "KEYCLOAK_HTTP_PORT=$base_keycloak"
            echo "KEYCLOAK_HTTPS_PORT=$((8443 + idx))"
            echo "KEYCLOAK_MGMT_PORT=$((9081 + idx))"
            echo "OPA_PORT=$((8181 + idx))"
            echo "OPA_METRICS_PORT=$((9181 + idx))"
            echo "KAS_PORT=$((8080 + idx))"
            echo "BACKEND_PORT=$((4000 + idx))"
            echo "FRONTEND_PORT=$((3000 + idx))"
            ;;
    esac
}

# -----------------------------------------------------------------------------
# Get Keycloak client secret for instance
# -----------------------------------------------------------------------------
get_client_secret() {
    local instance=$1
    
    case "$instance" in
        usa) echo "8AcfbgtdNIZp3tbrcmc2voiUfxNb8d6L" ;;
        fra) echo "y9YPayqbnOLRqemXhrLNMzDi9G9VMYrB" ;;
        gbr) echo "WeUC1RPtrxEOjvQeZbS2tETKat8RMWwV" ;;
        *)   echo "change-me-in-production-$(openssl rand -hex 16 2>/dev/null || echo 'default')" ;;
    esac
}

# -----------------------------------------------------------------------------
# Get instance index from registry
# -----------------------------------------------------------------------------
get_instance_index() {
    local instance=$1
    python3 -c "
import json
with open('$REGISTRY_FILE') as f:
    registry = json.load(f)
instance_upper = '$instance'.upper()
for i, inst in enumerate(registry['instances']):
    if inst['code'] == instance_upper:
        print(i)
        break
else:
    print(0)
"
}

# -----------------------------------------------------------------------------
# Generate Cloudflare tunnel config
# -----------------------------------------------------------------------------
generate_cloudflared_config() {
    local instance=$1
    local instance_upper=$(echo "$instance" | tr '[:lower:]' '[:upper:]')
    local instance_dir="$INSTANCES_DIR/$instance"
    
    log_info "Generating Cloudflare tunnel config for $instance_upper..."
    
    # Read tunnel config from registry or use placeholder
    mkdir -p "$instance_dir/config"
    
    cat > "$instance_dir/config/cloudflared.yml" << EOF
# Cloudflare Tunnel Configuration for ${instance_upper}
# Update tunnel UUID and credentials in production

tunnel: ${instance}-tunnel-uuid
credentials-file: /etc/cloudflared/tunnel-credentials.json

ingress:
  - hostname: ${instance}-idp.dive25.com
    service: https://keycloak:8443
    originRequest:
      noTLSVerify: true
  - hostname: ${instance}-api.dive25.com
    service: https://backend:4000
    originRequest:
      noTLSVerify: true
  - hostname: ${instance}-app.dive25.com
    service: https://frontend:3000
    originRequest:
      noTLSVerify: true
  - service: http_status:404
EOF

    # Create placeholder credentials file
    cat > "$instance_dir/config/tunnel-credentials.json" << EOF
{
  "AccountTag": "your-account-tag",
  "TunnelSecret": "your-tunnel-secret",
  "TunnelID": "${instance}-tunnel-uuid"
}
EOF

    log_success "Cloudflared config generated for $instance_upper"
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
main() {
    local target=${1:-"all"}
    
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "  DIVE V3 - Configuration Generator"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    
    # Check registry file exists
    if [[ ! -f "$REGISTRY_FILE" ]]; then
        echo "Error: Federation registry not found at $REGISTRY_FILE"
        exit 1
    fi
    
    log_info "Reading from: $REGISTRY_FILE"
    echo ""
    
    if [[ "$target" == "all" ]]; then
        # Get all instances from registry
        local instances=$(python3 -c "
import json
with open('$REGISTRY_FILE') as f:
    registry = json.load(f)
for inst in registry['instances']:
    print(inst['code'].lower())
")
        
        for instance in $instances; do
            generate_env "$instance"
            generate_cloudflared_config "$instance"
            echo ""
        done
    else
        generate_env "$target"
        generate_cloudflared_config "$target"
    fi
    
    echo ""
    log_success "Configuration generation complete!"
    echo ""
}

main "$@"












