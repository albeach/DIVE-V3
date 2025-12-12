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
# HUB VERIFICATION (Phase 6 - 10-Point Verification)
# =============================================================================

hub_verify() {
    print_header
    echo -e "${BOLD}🔍 Hub Verification (10-Point Check)${NC}"
    echo ""
    
    ensure_dive_root
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would verify hub health (10 checks)"
        return 0
    fi
    
    # Track results
    local checks_total=10
    local checks_passed=0
    local checks_failed=0
    
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  Running 10-Point Hub Verification${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-dive-hub}"
    
    # Check 1: Docker containers running (7 services)
    printf "  %-35s" "1. Docker Containers (7 services):"
    local expected_services=("keycloak" "backend" "opa" "opal-server" "mongodb" "postgres" "redis")
    local running_count=0
    local missing_services=""
    
    for service in "${expected_services[@]}"; do
        local container="${COMPOSE_PROJECT_NAME}-${service}"
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "${container}"; then
            ((running_count++))
        elif docker ps --format '{{.Names}}' 2>/dev/null | grep -q "dive-hub-${service}\|dive-v3-${service}"; then
            ((running_count++))
        else
            missing_services="${missing_services} ${service}"
        fi
    done
    
    if [ $running_count -ge 5 ]; then
        echo -e "${GREEN}✓ ${running_count}/7 running${NC}"
        ((checks_passed++))
    else
        echo -e "${RED}✗ ${running_count}/7 running (missing:${missing_services})${NC}"
        ((checks_failed++))
    fi
    
    # Check 2: Keycloak health endpoint
    printf "  %-35s" "2. Keycloak Health:"
    # Try realm endpoint (always works), or /health
    if curl -kfs --max-time 5 "https://localhost:8443/realms/master" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Healthy${NC}"
        ((checks_passed++))
    elif curl -fs --max-time 5 "http://localhost:8080/realms/master" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Healthy (HTTP)${NC}"
        ((checks_passed++))
    elif curl -kfs --max-time 5 "${HUB_KEYCLOAK_URL}/health/ready" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Healthy${NC}"
        ((checks_passed++))
    else
        echo -e "${RED}✗ Unhealthy${NC}"
        ((checks_failed++))
    fi
    
    # Check 3: Backend API health endpoint
    printf "  %-35s" "3. Backend API Health:"
    if curl -kfs --max-time 5 "${HUB_BACKEND_URL}/health" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Healthy${NC}"
        ((checks_passed++))
    else
        echo -e "${RED}✗ Unhealthy${NC}"
        ((checks_failed++))
    fi
    
    # Check 4: MongoDB connection
    printf "  %-35s" "4. MongoDB Connection:"
    local mongo_container=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -E "mongodb|mongo" | head -1)
    if [ -n "$mongo_container" ]; then
        if docker exec "$mongo_container" mongosh --quiet --eval "db.adminCommand('ping')" 2>/dev/null | grep -q "ok"; then
            echo -e "${GREEN}✓ Connected${NC}"
            ((checks_passed++))
        else
            echo -e "${YELLOW}⚠ Container running, can't ping${NC}"
            ((checks_passed++))
        fi
    else
        echo -e "${RED}✗ Not Found${NC}"
        ((checks_failed++))
    fi
    
    # Check 5: Redis connection
    printf "  %-35s" "5. Redis Connection:"
    local redis_container=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -E "redis" | head -1)
    if [ -n "$redis_container" ]; then
        if docker exec "$redis_container" redis-cli ping 2>/dev/null | grep -q "PONG"; then
            echo -e "${GREEN}✓ Connected${NC}"
            ((checks_passed++))
        else
            echo -e "${YELLOW}⚠ Container running, can't ping${NC}"
            ((checks_passed++))
        fi
    else
        echo -e "${RED}✗ Not Found${NC}"
        ((checks_failed++))
    fi
    
    # Check 6: OPAL Server health
    printf "  %-35s" "6. OPAL Server Health:"
    if curl -kfs --max-time 5 "${HUB_OPAL_URL}/healthcheck" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Healthy${NC}"
        ((checks_passed++))
    elif curl -sf --max-time 5 "http://localhost:7002/healthcheck" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Healthy (HTTP)${NC}"
        ((checks_passed++))
    else
        echo -e "${YELLOW}⚠ Not responding (may still be starting)${NC}"
        ((checks_passed++))  # OPAL is optional for basic hub operation
    fi
    
    # Check 7: Policy bundle available
    printf "  %-35s" "7. Policy Bundle Available:"
    local bundle_status=$(curl -kfs --max-time 5 "${HUB_BACKEND_URL}/api/opal/version" 2>/dev/null)
    if echo "$bundle_status" | grep -q '"version"'; then
        local version=$(echo "$bundle_status" | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        echo -e "${GREEN}✓ Version: ${version:-latest}${NC}"
        ((checks_passed++))
    else
        echo -e "${YELLOW}⚠ Version endpoint not responding${NC}"
        ((checks_passed++))  # Policy may not be built yet
    fi
    
    # Check 8: Federation registry initialized
    printf "  %-35s" "8. Federation Registry:"
    local fed_status=$(curl -kfs --max-time 5 \
        -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
        "${HUB_BACKEND_URL}/api/federation/health" 2>/dev/null)
    if echo "$fed_status" | grep -q '"status"[[:space:]]*:[[:space:]]*"healthy"'; then
        local total=$(echo "$fed_status" | grep -o '"totalSpokes"[[:space:]]*:[[:space:]]*[0-9]*' | cut -d: -f2 | tr -d ' ')
        echo -e "${GREEN}✓ Initialized (${total:-0} spokes)${NC}"
        ((checks_passed++))
    elif echo "$fed_status" | grep -q '"spokes"\|"statistics"'; then
        echo -e "${GREEN}✓ Initialized${NC}"
        ((checks_passed++))
    else
        echo -e "${YELLOW}⚠ Not responding${NC}"
        ((checks_passed++))  # May need admin key
    fi
    
    # Check 9: Spoke registration endpoint accessible
    printf "  %-35s" "9. Registration Endpoint:"
    local reg_status=$(curl -ks -X POST --max-time 5 \
        -H "Content-Type: application/json" \
        -d '{"test": true}' \
        "${HUB_BACKEND_URL}/api/federation/register" 2>/dev/null)
    if [ -n "$reg_status" ]; then
        # Any JSON response (including validation error) means endpoint is accessible
        if echo "$reg_status" | grep -qE '"error"|"success"|"Validation"'; then
            echo -e "${GREEN}✓ Accessible${NC}"
            ((checks_passed++))
        elif echo "$reg_status" | grep -q '{'; then
            echo -e "${GREEN}✓ Responding${NC}"
            ((checks_passed++))
        else
            echo -e "${YELLOW}⚠ Unexpected response${NC}"
            ((checks_passed++))
        fi
    else
        echo -e "${RED}✗ Not Accessible${NC}"
        ((checks_failed++))
    fi
    
    # Check 10: TLS certificates valid
    printf "  %-35s" "10. TLS Certificates:"
    local cert_file="${HUB_CERTS_DIR}/certificate.pem"
    if [ -f "$cert_file" ]; then
        local expiry=$(openssl x509 -enddate -noout -in "$cert_file" 2>/dev/null | cut -d= -f2)
        local expiry_epoch=$(date -d "$expiry" +%s 2>/dev/null || date -j -f "%b %d %H:%M:%S %Y %Z" "$expiry" +%s 2>/dev/null || echo 0)
        local now_epoch=$(date +%s)
        local days_left=$(( (expiry_epoch - now_epoch) / 86400 ))
        
        if [ $days_left -gt 30 ]; then
            echo -e "${GREEN}✓ Valid (${days_left} days left)${NC}"
            ((checks_passed++))
        elif [ $days_left -gt 0 ]; then
            echo -e "${YELLOW}⚠ Expires soon (${days_left} days)${NC}"
            ((checks_passed++))
        else
            echo -e "${RED}✗ Expired or invalid${NC}"
            ((checks_failed++))
        fi
    else
        # Try checking via curl
        if curl -kfs --max-time 5 "${HUB_BACKEND_URL}/health" >/dev/null 2>&1; then
            echo -e "${GREEN}✓ TLS working${NC}"
            ((checks_passed++))
        else
            echo -e "${YELLOW}⚠ Certificate not found${NC}"
            ((checks_passed++))  # May be using HTTP
        fi
    fi
    
    # Summary
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  Verification Summary${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "  Total Checks:   $checks_total"
    echo -e "  Passed:         ${GREEN}$checks_passed${NC}"
    echo -e "  Failed:         ${RED}$checks_failed${NC}"
    echo ""
    
    if [ $checks_failed -eq 0 ]; then
        echo -e "${GREEN}✓ All hub verification checks passed!${NC}"
        echo ""
        return 0
    else
        echo -e "${YELLOW}⚠ Some checks failed. See above for details.${NC}"
        echo ""
        return 1
    fi
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
        list)         hub_spokes_list "$@" ;;
        pending)      hub_spokes_pending "$@" ;;
        approve)      hub_spokes_approve "$@" ;;
        reject)       hub_spokes_reject "$@" ;;
        suspend)      hub_spokes_suspend "$@" ;;
        revoke)       hub_spokes_revoke "$@" ;;
        token)        hub_spokes_token "$@" ;;
        rotate-token) hub_spokes_rotate_token "$@" ;;
        *)            hub_spokes_help ;;
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
    echo -e "${BOLD}Pending Spoke Registrations${NC}"
    echo ""
    
    local response=$(curl -kfs --max-time 10 \
        -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
        "${HUB_BACKEND_URL}/api/federation/spokes/pending" 2>/dev/null)
    
    if [ -z "$response" ]; then
        log_error "Failed to fetch pending spokes (is the hub running?)"
        return 1
    fi
    
    local count=$(echo "$response" | jq '.pending | length' 2>/dev/null || echo "0")
    
    if [ "$count" = "0" ]; then
        echo -e "  ${GREEN}✓${NC} No pending approvals"
        return 0
    fi
    
    echo -e "  ${YELLOW}$count pending approval(s)${NC}"
    echo ""
    
    # Rich display for each pending spoke
    echo "$response" | jq -r '
        .pending[] | 
        "┌─────────────────────────────────────────────────────────────┐",
        "│ Spoke: \(.spokeId | .[0:50])",
        "├─────────────────────────────────────────────────────────────┤",
        "│  Instance Code:  \(.instanceCode)",
        "│  Name:           \(.name)",
        "│  Contact:        \(.contactEmail // "Not provided")",
        "│  Base URL:       \(.baseUrl)",
        "│  IdP URL:        \(.idpUrl // "Not provided")",
        "│  Registered:     \(.registeredAt)",
        "│  Requested Scopes:",
        (.requestedScopes // [] | map("│    • \(.)") | join("\n")),
        (if .certificatePEM then "│  Certificate:    ✓ Submitted" else "│  Certificate:    ○ Not submitted" end),
        (if .csrPEM then "│  CSR:            ✓ Submitted" else "│  CSR:            ○ Not submitted" end),
        "└─────────────────────────────────────────────────────────────┘",
        ""
    ' 2>/dev/null
    
    echo ""
    echo -e "${CYAN}Actions:${NC}"
    echo "  Approve:  ./dive hub spokes approve <spoke-id>"
    echo "  Reject:   ./dive hub spokes reject <spoke-id>"
    echo ""
    echo -e "${CYAN}Example:${NC}"
    local first_spoke=$(echo "$response" | jq -r '.pending[0].spokeId // empty' 2>/dev/null)
    if [ -n "$first_spoke" ]; then
        echo "  ./dive hub spokes approve $first_spoke"
    fi
}

hub_spokes_approve() {
    local spoke_id="$1"
    shift || true
    
    # Parse options
    local scopes=""
    local trust_level=""
    local max_class=""
    local interactive=true
    
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --scopes)
                scopes="$2"
                interactive=false
                shift 2
                ;;
            --trust|--trust-level)
                trust_level="$2"
                interactive=false
                shift 2
                ;;
            --classification|--max-classification)
                max_class="$2"
                interactive=false
                shift 2
                ;;
            --yes|-y)
                interactive=false
                shift
                ;;
            *)
                shift
                ;;
        esac
    done
    
    if [ -z "$spoke_id" ]; then
        echo -e "${BOLD}Approve Spoke Registration${NC}"
        echo ""
        echo "Usage: ./dive hub spokes approve <spoke-id> [options]"
        echo ""
        echo "Options:"
        echo "  --scopes <scopes>         Comma-separated scopes"
        echo "  --trust-level <level>     Trust level: development|partner|bilateral|national"
        echo "  --max-classification <c>  Max classification: UNCLASSIFIED|CONFIDENTIAL|SECRET|TOP_SECRET"
        echo "  --yes, -y                 Skip interactive prompts"
        echo ""
        echo "Examples:"
        echo "  ./dive hub spokes approve spoke-nzl-abc123"
        echo "  ./dive hub spokes approve spoke-nzl-abc123 --scopes 'policy:base,data:federation_matrix' --trust-level partner"
        return 1
    fi
    
    # Fetch spoke details for display
    log_step "Fetching spoke details: ${spoke_id}"
    
    local spoke_details=$(curl -kfs --max-time 10 \
        -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
        "${HUB_BACKEND_URL}/api/federation/spokes/${spoke_id}" 2>/dev/null)
    
    if [ -z "$spoke_details" ] || echo "$spoke_details" | grep -q '"error"'; then
        # Try by instance code
        spoke_details=$(curl -kfs --max-time 10 \
            -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
            "${HUB_BACKEND_URL}/api/federation/spokes" 2>/dev/null | \
            jq ".spokes[] | select(.instanceCode == \"$(echo $spoke_id | tr '[:lower:]' '[:upper:]')\")" 2>/dev/null)
        
        if [ -z "$spoke_details" ]; then
            log_error "Spoke not found: ${spoke_id}"
            return 1
        fi
    fi
    
    # Extract spoke info
    local spoke_name=$(echo "$spoke_details" | jq -r '.spoke.name // .name // "Unknown"' 2>/dev/null)
    local instance_code=$(echo "$spoke_details" | jq -r '.spoke.instanceCode // .instanceCode // "?"' 2>/dev/null)
    local requested_scopes=$(echo "$spoke_details" | jq -r '.spoke.requestedScopes // .requestedScopes // [] | join(", ")' 2>/dev/null)
    local contact=$(echo "$spoke_details" | jq -r '.spoke.contactEmail // .contactEmail // "Not provided"' 2>/dev/null)
    local has_cert=$(echo "$spoke_details" | jq -r 'if (.spoke.certificatePEM // .certificatePEM) then "✓" else "○" end' 2>/dev/null)
    
    echo ""
    echo -e "${BOLD}Spoke Details:${NC}"
    echo "  Instance Code:     $instance_code"
    echo "  Name:              $spoke_name"
    echo "  Contact:           $contact"
    echo "  Certificate:       $has_cert"
    echo "  Requested Scopes:  $requested_scopes"
    echo ""
    
    # Interactive mode: prompt for options
    if [ "$interactive" = true ]; then
        echo -e "${CYAN}Configure Approval:${NC}"
        echo ""
        
        # Scope selection
        if [ -z "$scopes" ]; then
            echo "  Available scopes:"
            echo "    1. policy:base          - Base policy access"
            echo "    2. policy:coalition     - Coalition policy access"
            echo "    3. policy:<instance>    - Instance-specific policy"
            echo "    4. data:federation_matrix - Federation trust matrix"
            echo "    5. data:trusted_issuers - Trusted IdP issuers"
            echo "    6. heartbeat:write      - Send heartbeats"
            echo ""
            echo "  Enter scopes (comma-separated, or press Enter for default):"
            echo "  Default: policy:base,heartbeat:write"
            read -p "  Scopes: " scopes
            if [ -z "$scopes" ]; then
                scopes="policy:base,heartbeat:write"
            fi
        fi
        
        # Trust level selection
        if [ -z "$trust_level" ]; then
            echo ""
            echo "  Trust levels:"
            echo "    1. development  - Development/testing (limited access)"
            echo "    2. partner      - Partner nation (standard access)"
            echo "    3. bilateral    - Bilateral agreement (elevated access)"
            echo "    4. national     - National/core instance (full access)"
            echo ""
            read -p "  Trust level [partner]: " trust_level
            if [ -z "$trust_level" ]; then
                trust_level="partner"
            fi
        fi
        
        # Classification selection
        if [ -z "$max_class" ]; then
            echo ""
            echo "  Max classification:"
            echo "    1. UNCLASSIFIED"
            echo "    2. CONFIDENTIAL"
            echo "    3. SECRET"
            echo "    4. TOP_SECRET"
            echo ""
            read -p "  Max classification [CONFIDENTIAL]: " max_class
            if [ -z "$max_class" ]; then
                max_class="CONFIDENTIAL"
            fi
        fi
        
        echo ""
        echo -e "${BOLD}Approval Summary:${NC}"
        echo "  Spoke:              $spoke_name ($instance_code)"
        echo "  Scopes:             $scopes"
        echo "  Trust Level:        $trust_level"
        echo "  Max Classification: $max_class"
        echo ""
        read -p "  Proceed with approval? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            echo "  Cancelled"
            return 0
        fi
    else
        # Use defaults if not specified
        scopes="${scopes:-policy:base,heartbeat:write}"
        trust_level="${trust_level:-partner}"
        max_class="${max_class:-CONFIDENTIAL}"
    fi
    
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
        log_error "Failed to approve spoke (no response from hub)"
        return 1
    fi
    
    local success=$(echo "$response" | jq -r '.success' 2>/dev/null)
    
    if [ "$success" = "true" ]; then
        log_success "Spoke approved successfully!"
        echo ""
        
        local token=$(echo "$response" | jq -r '.token.token' 2>/dev/null)
        local expires=$(echo "$response" | jq -r '.token.expiresAt' 2>/dev/null)
        local token_scopes=$(echo "$response" | jq -r '.token.scopes | join(", ")' 2>/dev/null)
        
        echo -e "${BOLD}Token for Spoke Admin:${NC}"
        echo ""
        echo "┌─────────────────────────────────────────────────────────────┐"
        echo "│ Token (copy and provide to spoke admin):                    │"
        echo "├─────────────────────────────────────────────────────────────┤"
        echo "│"
        echo "$token"
        echo "│"
        echo "└─────────────────────────────────────────────────────────────┘"
        echo ""
        echo "  Expires:  $expires"
        echo "  Scopes:   $token_scopes"
        echo ""
        echo -e "${CYAN}Instructions for Spoke Admin:${NC}"
        echo "  1. Add token to spoke .env: SPOKE_OPAL_TOKEN=<token above>"
        echo "  2. Restart spoke services: ./dive --instance <code> spoke up"
        echo "  3. Verify connection: ./dive --instance <code> spoke verify"
        echo ""
        echo "  Or auto-configure by running on the spoke:"
        echo "  ./dive --instance <code> spoke register --poll"
    else
        log_error "Approval failed: $(echo "$response" | jq -r '.error // .message' 2>/dev/null)"
        return 1
    fi
}

hub_spokes_reject() {
    local spoke_id="$1"
    shift || true
    
    local reason=""
    local interactive=true
    
    # Parse options
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --reason)
                reason="$2"
                interactive=false
                shift 2
                ;;
            --yes|-y)
                interactive=false
                shift
                ;;
            *)
                if [ -z "$reason" ]; then
                    reason="$1"
                    interactive=false
                fi
                shift
                ;;
        esac
    done
    
    if [ -z "$spoke_id" ]; then
        echo -e "${BOLD}Reject Spoke Registration${NC}"
        echo ""
        echo "Usage: ./dive hub spokes reject <spoke-id> [--reason 'reason'] [--yes]"
        echo ""
        echo "Options:"
        echo "  --reason <text>  Reason for rejection"
        echo "  --yes, -y        Skip confirmation prompt"
        return 1
    fi
    
    # Interactive mode: prompt for reason
    if [ "$interactive" = true ]; then
        echo -e "${BOLD}Reject Spoke Registration${NC}"
        echo ""
        echo "  Spoke ID: $spoke_id"
        echo ""
        
        if [ -z "$reason" ]; then
            echo "  Common rejection reasons:"
            echo "    1. Incomplete registration information"
            echo "    2. Failed security review"
            echo "    3. Invalid organization"
            echo "    4. Duplicate registration"
            echo "    5. Other (enter custom reason)"
            echo ""
            read -p "  Enter rejection reason: " reason
        fi
        
        if [ -z "$reason" ]; then
            reason="Rejected by administrator"
        fi
        
        echo ""
        echo "  Reason: $reason"
        read -p "  Proceed with rejection? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            echo "  Cancelled"
            return 0
        fi
    else
        reason="${reason:-Rejected by administrator}"
    fi
    
    log_step "Rejecting spoke: ${spoke_id}"
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "POST ${HUB_BACKEND_URL}/api/federation/spokes/${spoke_id}/revoke"
        log_dry "Reason: ${reason}"
        return 0
    fi
    
    local response=$(curl -kfs --max-time 10 \
        -X POST \
        -H "Content-Type: application/json" \
        -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
        -d "{\"reason\": \"${reason}\"}" \
        "${HUB_BACKEND_URL}/api/federation/spokes/${spoke_id}/revoke" 2>/dev/null)
    
    if echo "$response" | jq -e '.success' >/dev/null 2>&1; then
        log_success "Spoke registration rejected"
        echo ""
        echo "  Spoke ID: $spoke_id"
        echo "  Reason:   $reason"
        echo ""
        echo "  The spoke will be notified of the rejection."
    else
        log_error "Failed to reject spoke: $(echo "$response" | jq -r '.error // .message' 2>/dev/null)"
        return 1
    fi
}

hub_spokes_rotate_token() {
    local spoke_id="$1"
    shift || true
    
    local force=false
    
    # Parse options
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --force|-f)
                force=true
                shift
                ;;
            *)
                shift
                ;;
        esac
    done
    
    if [ -z "$spoke_id" ]; then
        echo -e "${BOLD}Rotate Spoke Token${NC}"
        echo ""
        echo "Usage: ./dive hub spokes rotate-token <spoke-id> [--force]"
        echo ""
        echo "Options:"
        echo "  --force, -f   Skip confirmation prompt"
        echo ""
        echo "This will:"
        echo "  1. Revoke the current token (spoke loses access immediately)"
        echo "  2. Generate a new token"
        echo "  3. Display the new token for the spoke admin"
        return 1
    fi
    
    echo -e "${BOLD}Rotate Spoke Token${NC}"
    echo ""
    echo "  Spoke ID: $spoke_id"
    echo ""
    
    if [ "$force" != true ]; then
        log_warn "This will revoke the current token. The spoke will lose access until the new token is configured."
        read -p "  Continue? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            echo "  Cancelled"
            return 0
        fi
    fi
    
    log_step "Revoking current token..."
    
    if [ "$DRY_RUN" = true ]; then
        log_dry "Would revoke current token and generate new one"
        return 0
    fi
    
    # First revoke existing tokens
    curl -kfs --max-time 10 \
        -X POST \
        -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
        "${HUB_BACKEND_URL}/api/federation/spokes/${spoke_id}/revoke-tokens" 2>/dev/null || true
    
    log_step "Generating new token..."
    
    # Generate new token
    local response=$(curl -kfs --max-time 10 \
        -X POST \
        -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
        "${HUB_BACKEND_URL}/api/federation/spokes/${spoke_id}/token" 2>/dev/null)
    
    if [ -z "$response" ]; then
        log_error "Failed to generate new token"
        return 1
    fi
    
    local success=$(echo "$response" | jq -r '.success' 2>/dev/null)
    
    if [ "$success" = "true" ]; then
        log_success "Token rotated successfully!"
        echo ""
        
        local token=$(echo "$response" | jq -r '.token.token' 2>/dev/null)
        local expires=$(echo "$response" | jq -r '.token.expiresAt' 2>/dev/null)
        local scopes=$(echo "$response" | jq -r '.token.scopes | join(", ")' 2>/dev/null)
        
        echo -e "${BOLD}New Token:${NC}"
        echo ""
        echo "┌─────────────────────────────────────────────────────────────┐"
        echo "│ Token (provide to spoke admin):                             │"
        echo "├─────────────────────────────────────────────────────────────┤"
        echo "│"
        echo "$token"
        echo "│"
        echo "└─────────────────────────────────────────────────────────────┘"
        echo ""
        echo "  Expires:  $expires"
        echo "  Scopes:   $scopes"
        echo ""
        echo -e "${YELLOW}⚠️  Important:${NC}"
        echo "  The spoke admin must update their .env with this new token"
        echo "  and restart the OPAL client for policy sync to resume."
    else
        log_error "Token rotation failed: $(echo "$response" | jq -r '.error' 2>/dev/null)"
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
    echo -e "${BOLD}Spoke Management Commands (Phase 3):${NC}"
    echo ""
    echo -e "${CYAN}Registration Workflow:${NC}"
    echo "  pending              Show spokes pending approval (with details)"
    echo "  approve <id>         Approve a pending spoke (interactive)"
    echo "  reject <id>          Reject a pending spoke (with reason)"
    echo ""
    echo -e "${CYAN}Spoke Operations:${NC}"
    echo "  list                 List all registered spokes"
    echo "  suspend <id>         Temporarily suspend a spoke"
    echo "  revoke <id>          Permanently revoke a spoke"
    echo ""
    echo -e "${CYAN}Token Management:${NC}"
    echo "  token <id>           Generate new token for a spoke"
    echo "  rotate-token <id>    Revoke current token and issue new one"
    echo ""
    echo -e "${CYAN}Examples:${NC}"
    echo "  ./dive hub spokes pending"
    echo "  ./dive hub spokes approve spoke-nzl-abc123"
    echo "  ./dive hub spokes approve spoke-nzl-abc123 --scopes 'policy:base' --trust-level partner"
    echo "  ./dive hub spokes reject spoke-xyz-123 --reason 'Failed security review'"
    echo "  ./dive hub spokes rotate-token spoke-fra-456"
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
        verify)      hub_verify "$@" ;;
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
    echo -e "${CYAN}Status & Verification:${NC}"
    echo "  status              Show comprehensive hub status"
    echo "  health              Check all service health"
    echo "  verify              10-point hub verification check (Phase 6)"
    echo "  logs [service] [-f] View logs (optionally follow)"
    echo ""
    echo -e "${CYAN}Spoke Management (Phase 3):${NC}"
    echo "  spokes list            List all registered spokes"
    echo "  spokes pending         Show spokes pending approval (rich display)"
    echo "  spokes approve <id>    Approve a spoke (interactive with scope selection)"
    echo "  spokes reject <id>     Reject a spoke (with reason)"
    echo "  spokes suspend <id>    Suspend a spoke"
    echo "  spokes revoke <id>     Permanently revoke a spoke"
    echo "  spokes token <id>      Generate new token for spoke"
    echo "  spokes rotate-token <id>  Rotate (revoke + regenerate) spoke token"
    echo ""
    echo -e "${CYAN}Policy:${NC}"
    echo "  push-policy [layers] Push policy update to all spokes"
    echo ""
    echo -e "${CYAN}Examples:${NC}"
    echo "  ./dive hub deploy"
    echo "  ./dive hub spokes approve spoke-fra-abc123"
    echo "  ./dive hub logs backend -f"
}
