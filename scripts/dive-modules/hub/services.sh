#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Hub Services Sub-Module
# =============================================================================
# Hub service management: up, down, and related functions
# Loaded on-demand via lazy loading
# =============================================================================

# Mark services module as loaded
export DIVE_HUB_SERVICES_LOADED=1

# =============================================================================
# CONSTANTS
# =============================================================================

HUB_COMPOSE_FILE="${DIVE_ROOT}/docker-compose.hub.yml"
HUB_KEYCLOAK_URL="https://localhost:${KEYCLOAK_HTTPS_PORT:-8443}"
HUB_BACKEND_URL="https://localhost:${BACKEND_PORT:-4000}"

# =============================================================================
# SERVICE MANAGEMENT FUNCTIONS
# =============================================================================

hub_up() {
    ensure_dive_root
    check_docker || return 1

    if [ ! -f "$HUB_COMPOSE_FILE" ]; then
        log_error "Hub compose file not found: ${HUB_COMPOSE_FILE}"
        log_info "Run 'hub init' first to set up the hub"
        return 1
    fi

    # Ensure shared network exists
    ensure_shared_network

    # Load secrets
    if [ -f "${DIVE_ROOT}/.env.hub" ]; then
        set -a
        source "${DIVE_ROOT}/.env.hub"
        set +a
    else
        log_error ".env.hub file not found - run 'hub init' first"
        return 1
    fi

    # Validate client ID configuration
    log_step "Validating client ID configuration..."
    _hub_validate_client_ids || log_warn "Client ID validation completed with warnings"

    export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-dive-hub}"

    log_step "Starting DIVE Hub services..."
    if [ "$DRY_RUN" = true ]; then
        log_dry "docker compose -f ${HUB_COMPOSE_FILE} --env-file .env.hub up -d"
        return 0
    fi

    # Start services
    docker compose -f "$HUB_COMPOSE_FILE" --env-file "${DIVE_ROOT}/.env.hub" up -d --build || {
        log_error "Failed to start hub services"
        return 1
    }

    log_success "Hub services started"
    echo ""
    echo "  Keycloak: ${HUB_KEYCLOAK_URL}"
    echo "  Backend:  ${HUB_BACKEND_URL}"
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

_hub_validate_client_ids() {
    local env_file="${DIVE_ROOT}/.env.hub"
    local errors=0

    # Check 1: Ensure .env.hub has correct KEYCLOAK_CLIENT_ID
    if [ -f "$env_file" ]; then
        local env_client_id=$(grep "^KEYCLOAK_CLIENT_ID=" "$env_file" 2>/dev/null | cut -d= -f2 | tr -d '"' || echo "")
        if [ "$env_client_id" = "dive-v3-broker" ]; then
            log_warn "Found generic client ID in .env.hub, updating to instance-specific..."
            sed -i.bak 's/^KEYCLOAK_CLIENT_ID=dive-v3-client-broker$/KEYCLOAK_CLIENT_ID=dive-v3-broker-usa/' "$env_file"
            rm -f "${env_file}.bak"
            log_success "Updated .env.hub with correct client ID"
        fi
    fi

    return $errors
}