#!/bin/bash
# =============================================================================
# DIVE V3 CLI - Hub Management Module
# =============================================================================
# Comprehensive Hub-in-a-Box management for the DIVE V3 federation.
#
# Commands:
#   deploy      - Full hub deployment (init → up → wait → configure)
#   init        - Initialize hub directories and configuration
#   up          - Start hub services
#   down        - Stop hub services
#   status      - Show comprehensive hub status
#   logs        - View hub service logs
#   spokes      - Manage spoke registrations (list, pending, approve, reject)
#   push-policy - Push policy update to all connected spokes
#   health      - Check hub health (all services)
#
# Usage:
#   ./dive hub deploy              # Full deployment
#   ./dive hub status              # Show hub status
#   ./dive hub spokes list         # List registered spokes
#   ./dive hub spokes approve FRA  # Approve a spoke
# =============================================================================

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# CONSTANTS
# =============================================================================

HUB_COMPOSE_FILE="${DIVE_ROOT}/docker-compose.hub.yml"
HUB_DATA_DIR="${DIVE_ROOT}/data/hub"
HUB_CERTS_DIR="${DIVE_ROOT}/keycloak/certs"
HUB_LOGS_DIR="${DIVE_ROOT}/logs/hub"

# Hub API endpoints
HUB_BACKEND_URL="https://localhost:${BACKEND_PORT:-4000}"
HUB_OPAL_URL="https://localhost:${OPAL_PORT:-7002}"
HUB_KEYCLOAK_URL="https://localhost:${KEYCLOAK_HTTPS_PORT:-8443}"
HUB_OPA_URL="https://localhost:${OPA_PORT:-8181}"

# Federation admin key (for API calls)
FEDERATION_ADMIN_KEY="${FEDERATION_ADMIN_KEY:-dive-hub-admin-key}"

# =============================================================================
# HUB INITIALIZATION
# =============================================================================

hub_init() {
    print_header
    echo -e "${BOLD}Initializing DIVE Hub${NC}"
    echo ""
    
    ensure_dive_root
    
    # 1. Create hub data directories
    log_step "Creating hub directories..."
    if [ "$DRY_RUN" = true ]; then
        log_dry "mkdir -p ${HUB_DATA_DIR}/{config,certs,policies,audit}"
        log_dry "mkdir -p ${HUB_LOGS_DIR}"
    else
        mkdir -p "${HUB_DATA_DIR}"/{config,certs,policies,audit}
        mkdir -p "${HUB_LOGS_DIR}"
        log_success "Hub directories created"
    fi
    
    # 2. Generate secrets if not present
    log_step "Checking secrets..."
    if [ -z "$KEYCLOAK_ADMIN_PASSWORD" ] || [ -z "$POSTGRES_PASSWORD" ]; then
        log_info "Generating ephemeral secrets for hub..."
        _hub_generate_secrets
    else
        log_success "Secrets already configured"
    fi
    
    # 3. Generate certificates if not present
    log_step "Checking certificates..."
    if [ ! -f "${HUB_CERTS_DIR}/certificate.pem" ] || [ ! -f "${HUB_CERTS_DIR}/key.pem" ]; then
        log_info "Generating TLS certificates..."
        if [ "$DRY_RUN" = true ]; then
            log_dry "Running generate-dev-certs.sh"
        else
            _hub_generate_certs
        fi
    else
        log_success "TLS certificates present"
    fi
    
    # 4. Create hub configuration file
    log_step "Creating hub configuration..."
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would create ${HUB_DATA_DIR}/config/hub.json"
    else
        _hub_create_config
    fi
    
    # 5. Verify compose file
    log_step "Verifying docker-compose.hub.yml..."
    if [ ! -f "$HUB_COMPOSE_FILE" ]; then
        log_error "Hub compose file not found at ${HUB_COMPOSE_FILE}"
        return 1
    else
        log_success "Compose file verified"
    fi
    
    echo ""
    log_success "Hub initialization complete"
    echo ""
    echo "  Config: ${HUB_DATA_DIR}/config/hub.json"
    echo "  Certs:  ${HUB_CERTS_DIR}"
    echo "  Logs:   ${HUB_LOGS_DIR}"
    echo ""
    echo "Next: Run './dive hub up' to start services"
}

_hub_generate_secrets() {
    export KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-$(openssl rand -base64 16 | tr -d '/+=')}"
    export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(openssl rand -base64 12 | tr -d '/+=')}"
    export MONGO_PASSWORD="${MONGO_PASSWORD:-$(openssl rand -base64 12 | tr -d '/+=')}"
    export AUTH_SECRET="${AUTH_SECRET:-$(openssl rand -base64 32)}"
    export KEYCLOAK_CLIENT_SECRET="${KEYCLOAK_CLIENT_SECRET:-$(openssl rand -base64 24 | tr -d '/+=')}"
    export FEDERATION_ADMIN_KEY="${FEDERATION_ADMIN_KEY:-$(openssl rand -base64 24 | tr -d '/+=')}"
    
    # Save to .env.hub for reference (do not commit)
    cat > "${DIVE_ROOT}/.env.hub" << EOF
# Hub Secrets (auto-generated, do not commit)
KEYCLOAK_ADMIN_PASSWORD=${KEYCLOAK_ADMIN_PASSWORD}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
MONGO_PASSWORD=${MONGO_PASSWORD}
AUTH_SECRET=${AUTH_SECRET}
KEYCLOAK_CLIENT_SECRET=${KEYCLOAK_CLIENT_SECRET}
FEDERATION_ADMIN_KEY=${FEDERATION_ADMIN_KEY}
EOF
    chmod 600 "${DIVE_ROOT}/.env.hub"
    log_info "Secrets saved to .env.hub (gitignored)"
}

_hub_generate_certs() {
    mkdir -p "${HUB_CERTS_DIR}"
    
    # Check for mkcert
    if command -v mkcert >/dev/null 2>&1; then
        log_info "Using mkcert for certificate generation..."
        (
            cd "${HUB_CERTS_DIR}"
            mkcert -install 2>/dev/null || true
            mkcert -key-file key.pem -cert-file certificate.pem \
                localhost 127.0.0.1 \
                hub.dive25.com usa-idp.dive25.com \
                keycloak backend opa opal-server \
                2>/dev/null
        )
        log_success "Certificates generated with mkcert"
    else
        # Fallback to openssl self-signed
        log_warn "mkcert not found, using self-signed certificate"
        openssl req -x509 -newkey rsa:4096 -sha256 -days 365 \
            -nodes -keyout "${HUB_CERTS_DIR}/key.pem" \
            -out "${HUB_CERTS_DIR}/certificate.pem" \
            -subj "/CN=localhost" \
            -addext "subjectAltName=DNS:localhost,DNS:keycloak,DNS:backend,DNS:opa,DNS:opal-server,IP:127.0.0.1" \
            2>/dev/null
        log_success "Self-signed certificates generated"
    fi
}

_hub_create_config() {
    local config_file="${HUB_DATA_DIR}/config/hub.json"
    local hub_id="hub-$(openssl rand -hex 4)"
    
    cat > "$config_file" << EOF
{
  "identity": {
    "hubId": "${hub_id}",
    "name": "DIVE V3 Federation Hub",
    "description": "Central policy management and federation hub",
    "version": "1.0.0"
  },
  "endpoints": {
    "baseUrl": "https://hub.dive25.com",
    "apiUrl": "https://hub.dive25.com/api",
    "opalUrl": "https://hub.dive25.com:7002",
    "keycloakUrl": "https://hub.dive25.com:8443"
  },
  "federation": {
    "enabled": true,
    "allowAutoApproval": false,
    "requireCertificate": false,
    "defaultTrustLevel": "development",
    "defaultScopes": ["policy:read", "heartbeat:write"],
    "tokenValidityMs": 86400000
  },
  "policy": {
    "gitRepo": "",
    "branch": "main",
    "syncIntervalMs": 60000,
    "layers": ["base", "coalition", "tenant"]
  },
  "security": {
    "requireMTLS": false,
    "allowedCipherSuites": ["TLS_AES_256_GCM_SHA384", "TLS_CHACHA20_POLY1305_SHA256"],
    "minTLSVersion": "1.2"
  },
  "monitoring": {
    "metricsEnabled": true,
    "healthCheckIntervalMs": 30000,
    "alertWebhookUrl": ""
  },
  "metadata": {
    "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "lastModified": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  }
}
EOF
    
    log_success "Hub configuration created: ${config_file}"
}

# =============================================================================
# HUB DEPLOYMENT
# =============================================================================

hub_deploy() {
    print_header
    echo -e "${BOLD}DIVE Hub Deployment${NC}"
    echo ""
    
    ensure_dive_root
    check_docker || return 1
    
    # Step 1: Initialize
    log_step "Step 1/6: Initializing hub..."
    hub_init || return 1
    
    # Step 2: Load secrets
    log_step "Step 2/6: Loading secrets..."
    if [ -f "${DIVE_ROOT}/.env.hub" ]; then
        set -a
        source "${DIVE_ROOT}/.env.hub"
        set +a
        log_success "Secrets loaded from .env.hub"
    else
        load_secrets || return 1
    fi
    
    # Step 3: Start services
    log_step "Step 3/6: Starting hub services..."
    hub_up || return 1
    
    # Step 4: Wait for services
    log_step "Step 4/6: Waiting for services to be healthy..."
    _hub_wait_all_healthy || return 1
    
    # Step 5: Apply Terraform (if available)
    log_step "Step 5/6: Applying Keycloak configuration..."
    if [ -d "${DIVE_ROOT}/terraform/pilot" ]; then
        _hub_apply_terraform || log_warn "Terraform apply skipped or failed"
    else
        log_info "No Terraform config found, skipping"
    fi
    
    # Step 6: Verify deployment
    log_step "Step 6/6: Verifying deployment..."
    _hub_verify_deployment || log_warn "Some verification checks failed"
    
    echo ""
    log_success "Hub deployment complete!"
    echo ""
    hub_status_brief
}

hub_up() {
    ensure_dive_root
    check_docker || return 1
    
    if [ ! -f "$HUB_COMPOSE_FILE" ]; then
        log_error "Hub compose file not found: ${HUB_COMPOSE_FILE}"
        log_info "Run 'hub init' first to set up the hub"
        return 1
    fi
    
    # Load secrets
    if [ -f "${DIVE_ROOT}/.env.hub" ]; then
        set -a
        source "${DIVE_ROOT}/.env.hub"
        set +a
    fi
    
    export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-dive-hub}"
    
    log_step "Starting DIVE Hub services..."
    if [ "$DRY_RUN" = true ]; then
        log_dry "docker compose -f ${HUB_COMPOSE_FILE} up -d"
        return 0
    fi
    
    docker compose -f "$HUB_COMPOSE_FILE" up -d || {
        log_error "Failed to start hub services"
        return 1
    }
    
    log_success "Hub services started"
    echo ""
    echo "  Keycloak: ${HUB_KEYCLOAK_URL}"
    echo "  Backend:  ${HUB_BACKEND_URL}"
    echo "  OPA:      ${HUB_OPA_URL}"
    echo "  OPAL:     ${HUB_OPAL_URL}"
}

hub_down() {
    ensure_dive_root
    check_docker || return 1
    
    export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-dive-hub}"
    
    log_step "Stopping DIVE Hub services..."
    if [ "$DRY_RUN" = true ]; then
        log_dry "docker compose -f ${HUB_COMPOSE_FILE} down"
        return 0
    fi
    
    docker compose -f "$HUB_COMPOSE_FILE" down
    log_success "Hub services stopped"
}

_hub_wait_all_healthy() {
    local timeout=180
    local elapsed=0
    local services=("keycloak" "backend" "opal-server" "opa" "mongodb" "postgres" "redis")
    
    log_info "Waiting for all services to be healthy (up to ${timeout}s)..."
    
    while [ $elapsed -lt $timeout ]; do
        local all_healthy=true
        
        for service in "${services[@]}"; do
            local container="${COMPOSE_PROJECT_NAME:-dive-hub}-${service}"
            local health=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "not_found")
            
            if [ "$health" != "healthy" ]; then
                all_healthy=false
                break
            fi
        done
        
        if [ "$all_healthy" = true ]; then
            log_success "All services healthy"
            return 0
        fi
        
        sleep 5
        elapsed=$((elapsed + 5))
        echo "  ${elapsed}s elapsed..."
    done
    
    log_warn "Timeout waiting for services to be healthy"
    return 1
}

_hub_apply_terraform() {
    local tf_dir="${DIVE_ROOT}/terraform/pilot"
    
    if [ ! -d "$tf_dir" ]; then
        log_info "No Terraform directory found at ${tf_dir}"
        return 0
    fi
    
    log_info "Applying Terraform configuration..."
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "cd ${tf_dir} && terraform init && terraform apply -auto-approve"
        return 0
    fi
    
    (
        cd "$tf_dir"
        [ ! -d ".terraform" ] && terraform init -input=false
        TF_VAR_client_secret="${KEYCLOAK_CLIENT_SECRET}" \
        TF_VAR_keycloak_admin_password="${KEYCLOAK_ADMIN_PASSWORD}" \
        KEYCLOAK_USER="${KEYCLOAK_ADMIN_USERNAME:-admin}" \
        KEYCLOAK_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD}" \
        terraform apply -input=false -auto-approve
    ) || {
        log_warn "Terraform apply failed"
        return 1
    }
    
    log_success "Terraform configuration applied"
}

_hub_verify_deployment() {
    local errors=0
    
    # Check Keycloak
    if curl -kfs --max-time 5 "${HUB_KEYCLOAK_URL}/health" >/dev/null 2>&1; then
        log_success "Keycloak: healthy"
    else
        log_error "Keycloak: not responding"
        ((errors++))
    fi
    
    # Check Backend
    if curl -kfs --max-time 5 "${HUB_BACKEND_URL}/health" >/dev/null 2>&1; then
        log_success "Backend: healthy"
    else
        log_error "Backend: not responding"
        ((errors++))
    fi
    
    # Check OPA
    if curl -kfs --max-time 5 "${HUB_OPA_URL}/health" >/dev/null 2>&1; then
        log_success "OPA: healthy"
    else
        log_error "OPA: not responding"
        ((errors++))
    fi
    
    # Check OPAL
    if curl -kfs --max-time 5 "${HUB_OPAL_URL}/healthcheck" >/dev/null 2>&1; then
        log_success "OPAL Server: healthy"
    else
        log_warn "OPAL Server: not responding (may still be starting)"
    fi
    
    # Check Federation API
    if curl -kfs --max-time 5 "${HUB_BACKEND_URL}/api/federation/health" >/dev/null 2>&1; then
        log_success "Federation API: healthy"
    else
        log_warn "Federation API: not responding"
    fi
    
    return $errors
}

# =============================================================================
# HUB STATUS
# =============================================================================

hub_status() {
    print_header
    echo -e "${BOLD}DIVE Hub Status${NC}"
    echo ""
    
    # Service status
    echo -e "${CYAN}Services:${NC}"
    _hub_check_service "Keycloak" "${HUB_KEYCLOAK_URL}/health"
    _hub_check_service "Backend"  "${HUB_BACKEND_URL}/health"
    _hub_check_service "OPA"      "${HUB_OPA_URL}/health"
    _hub_check_service "OPAL"     "${HUB_OPAL_URL}/healthcheck"
    echo ""
    
    # Docker container status
    echo -e "${CYAN}Containers:${NC}"
    docker compose -f "$HUB_COMPOSE_FILE" ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "  (compose not running)"
    echo ""
    
    # Federation stats
    echo -e "${CYAN}Federation:${NC}"
    _hub_get_federation_stats
    echo ""
    
    # Policy version
    echo -e "${CYAN}Policy:${NC}"
    _hub_get_policy_version
}

hub_status_brief() {
    echo -e "${CYAN}Hub Endpoints:${NC}"
    echo "  Keycloak: ${HUB_KEYCLOAK_URL}"
    echo "  Backend:  ${HUB_BACKEND_URL}"
    echo "  OPA:      ${HUB_OPA_URL}"
    echo "  OPAL:     ${HUB_OPAL_URL}"
    echo ""
    echo -e "${CYAN}Admin Credentials:${NC}"
    echo "  Keycloak: admin / \$KEYCLOAK_ADMIN_PASSWORD"
    echo "  API Key:  \$FEDERATION_ADMIN_KEY"
    echo ""
    echo "Run './dive hub status' for detailed status"
}

_hub_check_service() {
    local name="$1"
    local url="$2"
    
    local status_code=$(curl -kso /dev/null -w '%{http_code}' --max-time 3 "$url" 2>/dev/null || echo "000")
    
    if [ "$status_code" = "200" ]; then
        echo -e "  ${name}: ${GREEN}healthy${NC} (${status_code})"
    elif [ "$status_code" = "000" ]; then
        echo -e "  ${name}: ${RED}offline${NC}"
    else
        echo -e "  ${name}: ${YELLOW}degraded${NC} (${status_code})"
    fi
}

_hub_get_federation_stats() {
    local response=$(curl -kfs --max-time 5 \
        -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
        "${HUB_BACKEND_URL}/api/federation/health" 2>/dev/null)
    
    if [ -n "$response" ]; then
        echo "$response" | jq -r '
            "  Total Spokes: \(.statistics.totalSpokes // 0)",
            "  Active: \(.statistics.activeSpokes // 0)",
            "  Pending: \(.statistics.pendingApprovals // 0)",
            "  Unhealthy: \(.unhealthySpokes | length // 0)"
        ' 2>/dev/null || echo "  (unable to parse federation stats)"
    else
        echo "  (federation API not available)"
    fi
}

_hub_get_policy_version() {
    local response=$(curl -kfs --max-time 5 \
        "${HUB_BACKEND_URL}/api/federation/policy/version" 2>/dev/null)
    
    if [ -n "$response" ]; then
        echo "$response" | jq -r '
            "  Version: \(.version // "unknown")",
            "  Updated: \(.timestamp // "unknown")"
        ' 2>/dev/null || echo "  (unable to parse policy version)"
    else
        echo "  (policy API not available)"
    fi
}

hub_health() {
    echo -e "${BOLD}Hub Health Check${NC}"
    echo ""
    
    local exit_code=0
    
    # Check all services
    for service in keycloak backend opa opal-server mongodb postgres redis; do
        local container="${COMPOSE_PROJECT_NAME:-dive-hub}-${service}"
        local status=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null || echo "not_found")
        local health=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "N/A")
        
        if [ "$status" = "running" ] && [ "$health" = "healthy" ]; then
            echo -e "  ${service}: ${GREEN}✓${NC} running (healthy)"
        elif [ "$status" = "running" ]; then
            echo -e "  ${service}: ${YELLOW}○${NC} running (${health})"
        else
            echo -e "  ${service}: ${RED}✗${NC} ${status}"
            exit_code=1
        fi
    done
    
    return $exit_code
}

# =============================================================================
# SPOKE MANAGEMENT
# =============================================================================

hub_spokes() {
    local action="${1:-list}"
    shift || true
    
    case "$action" in
        list)    hub_spokes_list "$@" ;;
        pending) hub_spokes_pending "$@" ;;
        approve) hub_spokes_approve "$@" ;;
        reject)  hub_spokes_reject "$@" ;;
        suspend) hub_spokes_suspend "$@" ;;
        revoke)  hub_spokes_revoke "$@" ;;
        token)   hub_spokes_token "$@" ;;
        *)       hub_spokes_help ;;
    esac
}

hub_spokes_list() {
    echo -e "${BOLD}Registered Spokes${NC}"
    echo ""
    
    local response=$(curl -kfs --max-time 10 \
        -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
        "${HUB_BACKEND_URL}/api/federation/spokes" 2>/dev/null)
    
    if [ -z "$response" ]; then
        log_error "Failed to fetch spokes (is the hub running?)"
        return 1
    fi
    
    echo "$response" | jq -r '
        .spokes[] | 
        "  \(.instanceCode)\t\(.status)\t\(.trustLevel // "N/A")\t\(.name)"
    ' 2>/dev/null | column -t -s $'\t' || echo "  (no spokes registered)"
    
    echo ""
    echo "$response" | jq -r '
        .statistics |
        "Total: \(.totalSpokes) | Active: \(.activeSpokes) | Pending: \(.pendingApprovals)"
    ' 2>/dev/null
}

hub_spokes_pending() {
    echo -e "${BOLD}Pending Spoke Approvals${NC}"
    echo ""
    
    local response=$(curl -kfs --max-time 10 \
        -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
        "${HUB_BACKEND_URL}/api/federation/spokes/pending" 2>/dev/null)
    
    if [ -z "$response" ]; then
        log_error "Failed to fetch pending spokes"
        return 1
    fi
    
    local count=$(echo "$response" | jq '.pending | length' 2>/dev/null || echo "0")
    
    if [ "$count" = "0" ]; then
        echo "  No pending approvals"
        return 0
    fi
    
    echo "$response" | jq -r '
        .pending[] | 
        "  \(.spokeId)\n    Instance: \(.instanceCode)\n    Name: \(.name)\n    URL: \(.baseUrl)\n    Registered: \(.registeredAt)\n"
    ' 2>/dev/null
    
    echo ""
    echo "To approve: ./dive hub spokes approve <spoke-id>"
}

hub_spokes_approve() {
    local spoke_id="$1"
    
    if [ -z "$spoke_id" ]; then
        echo "Usage: ./dive hub spokes approve <spoke-id> [options]"
        echo ""
        echo "Options:"
        echo "  --scopes <scopes>       Comma-separated scopes (default: policy:read)"
        echo "  --trust <level>         Trust level: development|partner|bilateral|national"
        echo "  --classification <max>  Max classification: UNCLASSIFIED|CONFIDENTIAL|SECRET|TOP_SECRET"
        return 1
    fi
    
    # Parse options
    local scopes="${2:-policy:read,heartbeat:write}"
    local trust_level="${3:-partner}"
    local max_class="${4:-CONFIDENTIAL}"
    
    log_step "Approving spoke: ${spoke_id}"
    
    local payload=$(cat << EOF
{
    "allowedScopes": $(echo "$scopes" | jq -R 'split(",")'),
    "trustLevel": "${trust_level}",
    "maxClassification": "${max_class}",
    "dataIsolationLevel": "filtered"
}
EOF
)
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "POST ${HUB_BACKEND_URL}/api/federation/spokes/${spoke_id}/approve"
        log_dry "Payload: ${payload}"
        return 0
    fi
    
    local response=$(curl -kfs --max-time 10 \
        -X POST \
        -H "Content-Type: application/json" \
        -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
        -d "$payload" \
        "${HUB_BACKEND_URL}/api/federation/spokes/${spoke_id}/approve" 2>/dev/null)
    
    if [ -z "$response" ]; then
        log_error "Failed to approve spoke"
        return 1
    fi
    
    local success=$(echo "$response" | jq -r '.success' 2>/dev/null)
    
    if [ "$success" = "true" ]; then
        log_success "Spoke approved successfully"
        echo ""
        echo "Token for spoke (provide to spoke admin):"
        echo "$response" | jq -r '.token.token' 2>/dev/null
        echo ""
        echo "Token expires: $(echo "$response" | jq -r '.token.expiresAt' 2>/dev/null)"
    else
        log_error "Approval failed: $(echo "$response" | jq -r '.error // .message' 2>/dev/null)"
        return 1
    fi
}

hub_spokes_reject() {
    local spoke_id="$1"
    local reason="${2:-Rejected by administrator}"
    
    if [ -z "$spoke_id" ]; then
        echo "Usage: ./dive hub spokes reject <spoke-id> [reason]"
        return 1
    fi
    
    log_step "Rejecting spoke: ${spoke_id}"
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "POST ${HUB_BACKEND_URL}/api/federation/spokes/${spoke_id}/revoke"
        return 0
    fi
    
    local response=$(curl -kfs --max-time 10 \
        -X POST \
        -H "Content-Type: application/json" \
        -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
        -d "{\"reason\": \"${reason}\"}" \
        "${HUB_BACKEND_URL}/api/federation/spokes/${spoke_id}/revoke" 2>/dev/null)
    
    if echo "$response" | jq -e '.success' >/dev/null 2>&1; then
        log_success "Spoke rejected"
    else
        log_error "Failed to reject spoke"
        return 1
    fi
}

hub_spokes_suspend() {
    local spoke_id="$1"
    local reason="${2:-Suspended by administrator}"
    
    if [ -z "$spoke_id" ]; then
        echo "Usage: ./dive hub spokes suspend <spoke-id> [reason]"
        return 1
    fi
    
    log_step "Suspending spoke: ${spoke_id}"
    
    local response=$(curl -kfs --max-time 10 \
        -X POST \
        -H "Content-Type: application/json" \
        -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
        -d "{\"reason\": \"${reason}\"}" \
        "${HUB_BACKEND_URL}/api/federation/spokes/${spoke_id}/suspend" 2>/dev/null)
    
    if echo "$response" | jq -e '.success' >/dev/null 2>&1; then
        log_success "Spoke suspended"
    else
        log_error "Failed to suspend spoke"
        return 1
    fi
}

hub_spokes_revoke() {
    local spoke_id="$1"
    local reason="${2:-Revoked by administrator}"
    
    if [ -z "$spoke_id" ]; then
        echo "Usage: ./dive hub spokes revoke <spoke-id> [reason]"
        return 1
    fi
    
    log_warn "This will permanently revoke the spoke. All tokens will be invalidated."
    read -p "Continue? (y/N) " confirm
    
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        echo "Cancelled"
        return 0
    fi
    
    log_step "Revoking spoke: ${spoke_id}"
    
    local response=$(curl -kfs --max-time 10 \
        -X POST \
        -H "Content-Type: application/json" \
        -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
        -d "{\"reason\": \"${reason}\"}" \
        "${HUB_BACKEND_URL}/api/federation/spokes/${spoke_id}/revoke" 2>/dev/null)
    
    if echo "$response" | jq -e '.success' >/dev/null 2>&1; then
        log_success "Spoke revoked permanently"
    else
        log_error "Failed to revoke spoke"
        return 1
    fi
}

hub_spokes_token() {
    local spoke_id="$1"
    
    if [ -z "$spoke_id" ]; then
        echo "Usage: ./dive hub spokes token <spoke-id>"
        return 1
    fi
    
    log_step "Generating new token for spoke: ${spoke_id}"
    
    local response=$(curl -kfs --max-time 10 \
        -X POST \
        -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
        "${HUB_BACKEND_URL}/api/federation/spokes/${spoke_id}/token" 2>/dev/null)
    
    if [ -z "$response" ]; then
        log_error "Failed to generate token"
        return 1
    fi
    
    local success=$(echo "$response" | jq -r '.success' 2>/dev/null)
    
    if [ "$success" = "true" ]; then
        log_success "New token generated"
        echo ""
        echo "Token: $(echo "$response" | jq -r '.token.token' 2>/dev/null)"
        echo "Expires: $(echo "$response" | jq -r '.token.expiresAt' 2>/dev/null)"
        echo "Scopes: $(echo "$response" | jq -r '.token.scopes | join(", ")' 2>/dev/null)"
    else
        log_error "Token generation failed: $(echo "$response" | jq -r '.error' 2>/dev/null)"
        return 1
    fi
}

hub_spokes_help() {
    echo -e "${BOLD}Spoke Management Commands:${NC}"
    echo "  list              List all registered spokes"
    echo "  pending           Show spokes pending approval"
    echo "  approve <id>      Approve a pending spoke"
    echo "  reject <id>       Reject a pending spoke"
    echo "  suspend <id>      Temporarily suspend a spoke"
    echo "  revoke <id>       Permanently revoke a spoke"
    echo "  token <id>        Generate new token for a spoke"
}

# =============================================================================
# POLICY MANAGEMENT
# =============================================================================

hub_push_policy() {
    local layers="${1:-base,coalition,tenant}"
    local description="${2:-Manual policy push}"
    
    log_step "Pushing policy update to all spokes..."
    
    local payload=$(cat << EOF
{
    "layers": $(echo "$layers" | jq -R 'split(",")'),
    "priority": "normal",
    "description": "${description}"
}
EOF
)
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "POST ${HUB_BACKEND_URL}/api/federation/policy/push"
        log_dry "Payload: ${payload}"
        return 0
    fi
    
    local response=$(curl -kfs --max-time 30 \
        -X POST \
        -H "Content-Type: application/json" \
        -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
        -d "$payload" \
        "${HUB_BACKEND_URL}/api/federation/policy/push" 2>/dev/null)
    
    if [ -z "$response" ]; then
        log_error "Failed to push policy update"
        return 1
    fi
    
    local success=$(echo "$response" | jq -r '.success' 2>/dev/null)
    
    if [ "$success" = "true" ]; then
        log_success "Policy update pushed"
        echo ""
        echo "Update ID: $(echo "$response" | jq -r '.update.updateId' 2>/dev/null)"
        echo "Version:   $(echo "$response" | jq -r '.update.version' 2>/dev/null)"
    else
        log_error "Policy push failed: $(echo "$response" | jq -r '.error' 2>/dev/null)"
        return 1
    fi
}

# =============================================================================
# HUB LOGS
# =============================================================================

hub_logs() {
    local service="${1:-}"
    local follow="${2:-}"
    
    export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-dive-hub}"
    
    if [ -n "$service" ]; then
        if [ "$follow" = "-f" ] || [ "$follow" = "--follow" ]; then
            docker compose -f "$HUB_COMPOSE_FILE" logs -f "$service"
        else
            docker compose -f "$HUB_COMPOSE_FILE" logs --tail=100 "$service"
        fi
    else
        docker compose -f "$HUB_COMPOSE_FILE" logs --tail=50
    fi
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

module_hub() {
    local action="${1:-help}"
    shift || true
    
    case "$action" in
        deploy)      hub_deploy "$@" ;;
        init)        hub_init "$@" ;;
        up|start)    hub_up "$@" ;;
        down|stop)   hub_down "$@" ;;
        status)      hub_status "$@" ;;
        health)      hub_health "$@" ;;
        logs)        hub_logs "$@" ;;
        spokes)      hub_spokes "$@" ;;
        push-policy) hub_push_policy "$@" ;;
        
        # Legacy compatibility
        bootstrap)   hub_deploy "$@" ;;
        instances)   hub_spokes list "$@" ;;
        
        help|*)      module_hub_help ;;
    esac
}

module_hub_help() {
    echo -e "${BOLD}DIVE Hub Commands:${NC}"
    echo ""
    echo -e "${CYAN}Deployment:${NC}"
    echo "  deploy              Full hub deployment (init → up → configure)"
    echo "  init                Initialize hub directories and config"
    echo "  up, start           Start hub services"
    echo "  down, stop          Stop hub services"
    echo ""
    echo -e "${CYAN}Status:${NC}"
    echo "  status              Show comprehensive hub status"
    echo "  health              Check all service health"
    echo "  logs [service] [-f] View logs (optionally follow)"
    echo ""
    echo -e "${CYAN}Spoke Management:${NC}"
    echo "  spokes list         List all registered spokes"
    echo "  spokes pending      Show spokes pending approval"
    echo "  spokes approve <id> Approve a spoke"
    echo "  spokes reject <id>  Reject a spoke"
    echo "  spokes suspend <id> Suspend a spoke"
    echo "  spokes revoke <id>  Permanently revoke a spoke"
    echo "  spokes token <id>   Generate new token for spoke"
    echo ""
    echo -e "${CYAN}Policy:${NC}"
    echo "  push-policy [layers] Push policy update to all spokes"
    echo ""
    echo -e "${CYAN}Examples:${NC}"
    echo "  ./dive hub deploy"
    echo "  ./dive hub spokes approve spoke-fra-abc123"
    echo "  ./dive hub logs backend -f"
}
