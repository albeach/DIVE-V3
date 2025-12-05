#!/bin/bash
# =============================================================================
# DIVE V3 CLI - Spoke Commands Module
# =============================================================================
# Commands: init, register, status, sync, heartbeat
# For distributed spoke deployments (disabled in pilot mode)
# =============================================================================

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# SPOKE COMMANDS
# =============================================================================

spoke_init() {
    local instance_code="${1:-}"
    local instance_name="${2:-}"
    
    if [ -z "$instance_code" ] || [ -z "$instance_name" ]; then
        log_error "Usage: ./dive spoke init <CODE> <NAME>"
        echo ""
        echo "Example: ./dive spoke init NZL 'New Zealand Defence Force'"
        return 1
    fi
    
    # Validate code is 3 letters
    if [ ${#instance_code} -ne 3 ]; then
        log_error "Instance code must be exactly 3 characters (ISO 3166-1 alpha-3)"
        return 1
    fi
    
    local code_upper=$(upper "$instance_code")
    
    echo -e "${BOLD}Initializing DIVE V3 Spoke Instance:${NC} $code_upper"
    echo ""
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would create spoke configuration for: $code_upper"
        log_dry "  Name: $instance_name"
        log_dry "  Code: $code_upper"
        log_dry ""
        log_dry "Would create:"
        log_dry "  - instances/$code_upper/docker-compose.yml"
        log_dry "  - instances/$code_upper/config.json"
        log_dry "  - instances/$code_upper/.env"
        return 0
    fi
    
    ensure_dive_root
    local spoke_dir="${DIVE_ROOT}/instances/${code_upper,,}"
    
    # Create directory structure
    log_step "Creating instance directory: $spoke_dir"
    mkdir -p "$spoke_dir"
    
    # Generate unique IDs
    local spoke_id="spoke-${code_upper,,}-$(openssl rand -hex 4)"
    
    # Create config.json
    log_step "Creating spoke configuration"
    cat > "$spoke_dir/config.json" << EOF
{
  "spokeId": "$spoke_id",
  "instanceCode": "$code_upper",
  "name": "$instance_name",
  "description": "DIVE V3 Spoke Instance for $instance_name",
  "baseUrl": "https://${code_upper,,}-app.dive25.com",
  "apiUrl": "https://${code_upper,,}-api.dive25.com",
  "idpUrl": "https://${code_upper,,}-idp.dive25.com",
  "hubUrl": "https://hub.dive25.com",
  "status": "unregistered",
  "requestedScopes": [
    "policy:base",
    "data:federation_matrix",
    "data:trusted_issuers"
  ],
  "createdAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
    
    # Create docker-compose.yml from template
    log_step "Creating Docker Compose configuration"
    cat > "$spoke_dir/docker-compose.yml" << EOF
# DIVE V3 Spoke Instance: $code_upper ($instance_name)
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: keycloak
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
      POSTGRES_DB: keycloak
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U keycloak"]
      interval: 10s
      timeout: 5s
      retries: 5

  keycloak:
    image: quay.io/keycloak/keycloak:26.0.4
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres:5432/keycloak
      KC_DB_USERNAME: keycloak
      KC_DB_PASSWORD: \${POSTGRES_PASSWORD}
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: \${KEYCLOAK_ADMIN_PASSWORD}
      KC_HOSTNAME: ${code_upper,,}-idp.dive25.com
      KC_HOSTNAME_STRICT: "false"
      KC_HTTP_ENABLED: "true"
    command: start --optimized
    ports:
      - "8443:8443"
    depends_on:
      postgres:
        condition: service_healthy

  mongo:
    image: mongo:7-jammy
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: \${MONGO_PASSWORD}
    volumes:
      - mongo_data:/data/db

  opa:
    image: openpolicyagent/opa:0.68.0
    command: run --server --addr :8181
    ports:
      - "8181:8181"

  opal-client:
    image: permitio/opal-client:latest
    environment:
      OPAL_SERVER_URL: \${HUB_OPAL_URL:-https://hub.dive25.com:7002}
      OPAL_CLIENT_TOKEN: \${SPOKE_OPAL_TOKEN}
      OPAL_INLINE_OPA_ENABLED: "false"
      OPAL_OPA_URL: http://opa:8181
      OPAL_SUBSCRIPTION_ID: $spoke_id
    depends_on:
      - opa

volumes:
  postgres_data:
  mongo_data:
EOF

    # Create .env template
    log_step "Creating environment template"
    cat > "$spoke_dir/.env.template" << EOF
# DIVE V3 Spoke: $code_upper
# Copy this to .env and fill in the values

# Database Passwords (use GCP Secret Manager in production)
POSTGRES_PASSWORD=
MONGO_PASSWORD=

# Keycloak Admin
KEYCLOAK_ADMIN_PASSWORD=

# Hub Connection
HUB_URL=https://hub.dive25.com
HUB_OPAL_URL=https://hub.dive25.com:7002

# Spoke Token (received after registration approval)
SPOKE_OPAL_TOKEN=
EOF

    echo ""
    log_success "Spoke instance initialized: $code_upper"
    echo ""
    echo -e "${BOLD}Next Steps:${NC}"
    echo "  1. Copy .env.template to .env and fill in passwords"
    echo "  2. Register with hub: ./dive spoke register"
    echo "  3. Wait for hub admin approval"
    echo "  4. Start services: cd $spoke_dir && docker compose up -d"
    echo ""
    echo -e "${BOLD}Files Created:${NC}"
    echo "  - $spoke_dir/config.json"
    echo "  - $spoke_dir/docker-compose.yml"
    echo "  - $spoke_dir/.env.template"
}

spoke_register() {
    ensure_dive_root
    local config_file="${DIVE_ROOT}/instances/$(echo $INSTANCE | tr '[:upper:]' '[:lower:]')/config.json"
    
    if [ ! -f "$config_file" ]; then
        log_error "Spoke not initialized. Run: ./dive spoke init <CODE> <NAME>"
        return 1
    fi
    
    local spoke_config=$(cat "$config_file")
    local hub_url=$(echo "$spoke_config" | grep -o '"hubUrl"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
    
    log_step "Registering spoke with hub: $hub_url"
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would POST to: $hub_url/api/federation/register"
        log_dry "Request body:"
        log_dry "  $(echo "$spoke_config" | head -c 200)..."
        return 0
    fi
    
    local response=$(curl -s -X POST "$hub_url/api/federation/register" \
        -H "Content-Type: application/json" \
        -d "$spoke_config" 2>&1)
    
    if echo "$response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        log_success "Registration request submitted!"
        echo ""
        echo "Response: $response"
        echo ""
        echo -e "${YELLOW}⏳ Waiting for hub admin approval...${NC}"
        echo "   Once approved, you'll receive a token to add to your .env file"
    else
        log_error "Registration failed"
        echo "Response: $response"
        return 1
    fi
}

spoke_status() {
    echo -e "${BOLD}Spoke Federation Status:${NC}"
    echo ""
    
    ensure_dive_root
    local config_file="${DIVE_ROOT}/instances/$(echo $INSTANCE | tr '[:upper:]' '[:lower:]')/config.json"
    
    if [ ! -f "$config_file" ]; then
        echo "  Status: Not initialized"
        echo ""
        echo "  Run: ./dive spoke init <CODE> <NAME>"
        return 0
    fi
    
    local config=$(cat "$config_file")
    local spoke_id=$(echo "$config" | grep -o '"spokeId"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
    local instance_code=$(echo "$config" | grep -o '"instanceCode"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
    local status=$(echo "$config" | grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
    local hub_url=$(echo "$config" | grep -o '"hubUrl"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
    
    echo "  Spoke ID:      $spoke_id"
    echo "  Instance Code: $instance_code"
    echo "  Status:        $status"
    echo "  Hub URL:       $hub_url"
}

spoke_sync() {
    log_step "Forcing policy sync from hub..."
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would trigger OPAL client to pull latest policies"
        return 0
    fi
    
    curl -X POST http://localhost:7000/policy-refresh 2>/dev/null && {
        log_success "Policy refresh triggered"
    } || {
        log_warn "OPAL client not running or refresh endpoint not available"
    }
}

spoke_heartbeat() {
    ensure_dive_root
    local config_file="${DIVE_ROOT}/instances/$(echo $INSTANCE | tr '[:upper:]' '[:lower:]')/config.json"
    
    if [ ! -f "$config_file" ]; then
        log_error "Spoke not initialized"
        return 1
    fi
    
    local config=$(cat "$config_file")
    local spoke_id=$(echo "$config" | grep -o '"spokeId"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
    local hub_url=$(echo "$config" | grep -o '"hubUrl"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
    
    log_step "Sending heartbeat to hub..."
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would POST to: $hub_url/api/federation/heartbeat"
        return 0
    fi
    
    local opa_healthy="true"
    curl -s http://localhost:8181/health >/dev/null 2>&1 || opa_healthy="false"
    
    local response=$(curl -s -X POST "$hub_url/api/federation/heartbeat" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${SPOKE_TOKEN:-}" \
        -d "{
            \"spokeId\": \"$spoke_id\",
            \"opaHealthy\": $opa_healthy
        }" 2>&1)
    
    echo "Response: $response"
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

module_spoke() {
    local action="${1:-help}"
    shift || true
    
    # Check if pilot mode is enabled - spoke commands are disabled
    if [ "$PILOT_MODE" = true ] && [ "$action" != "help" ] && [ "$action" != "status" ]; then
        log_error "Spoke deployment commands are disabled in pilot mode"
        echo ""
        echo -e "${YELLOW}In pilot mode, partners register as SP Clients, not full Spokes.${NC}"
        echo ""
        echo "To register as an SP Client (OAuth/OIDC), use:"
        echo "  ./dive sp register"
        echo ""
        echo "To disable pilot mode (for full spoke deployment):"
        echo "  export DIVE_PILOT_MODE=false"
        echo "  ./dive spoke init <CODE> <NAME>"
        return 1
    fi
    
    case "$action" in
        init)      spoke_init "$@" ;;
        register)  spoke_register "$@" ;;
        status)    spoke_status ;;
        sync)      spoke_sync ;;
        heartbeat) spoke_heartbeat ;;
        *)         module_spoke_help ;;
    esac
}

module_spoke_help() {
    echo -e "${BOLD}Spoke Commands (for distributed instances):${NC}"
    echo ""
    if [ "$PILOT_MODE" = true ]; then
        echo -e "${YELLOW}⚠️  Pilot mode is enabled. Spoke deployment is disabled.${NC}"
        echo "   Use './dive sp register' to register as an SP Client instead."
        echo ""
    fi
    echo "  init <code> <name>   Initialize a new spoke instance"
    echo "  register             Register this spoke with the hub"
    echo "  status               Show spoke federation status"
    echo "  sync                 Force policy sync from hub"
    echo "  heartbeat            Send heartbeat to hub"
    echo ""
    echo "Examples:"
    echo "  ./dive spoke init NZL 'New Zealand Defence'"
    echo "  ./dive spoke register"
    echo "  ./dive spoke sync"
}

