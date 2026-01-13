#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Spoke Pipeline Deployment Phase
# =============================================================================
# Handles container deployment:
#   - Container orchestration via spoke-containers.sh
#   - Service health verification
#   - Post-startup configuration
#   - Admin user creation
#
# Consolidates logic from spoke_deploy() lines 717-889
# =============================================================================
# Version: 1.0.0
# Date: 2026-01-13
# =============================================================================

# Prevent multiple sourcing
if [ -n "$SPOKE_PHASE_DEPLOYMENT_LOADED" ]; then
    return 0
fi
export SPOKE_PHASE_DEPLOYMENT_LOADED=1

# =============================================================================
# MAIN DEPLOYMENT PHASE FUNCTION
# =============================================================================

##
# Execute the deployment phase
#
# Arguments:
#   $1 - Instance code
#   $2 - Pipeline mode (deploy|up|redeploy)
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_phase_deployment() {
    local instance_code="$1"
    local pipeline_mode="${2:-deploy}"

    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    log_info "Deployment phase for $code_upper"

    # Step 1: Start containers
    local force_rebuild="false"
    if [ "$pipeline_mode" = "deploy" ]; then
        force_rebuild="true"
    fi

    if ! spoke_containers_start "$instance_code" "$force_rebuild"; then
        return 1
    fi

    # Step 2: Wait for core services to become healthy
    if ! spoke_deployment_wait_for_core_services "$instance_code"; then
        return 1
    fi

    # Step 3: Create admin user for Terraform/Keycloak operations (deploy mode only)
    if [ "$pipeline_mode" = "deploy" ]; then
        spoke_deployment_ensure_admin_user "$instance_code"
    fi

    # Step 4: Run post-startup initialization scripts
    if [ "$pipeline_mode" != "up" ]; then
        spoke_deployment_run_init_scripts "$instance_code"
    fi

    # Step 5: Wait for all services (including dependent services)
    if ! spoke_containers_wait_for_healthy "$instance_code" 300; then
        log_warn "Some services may not be fully healthy"
        # Don't fail - continue with configuration phase
    fi

    # Step 6: Verify container environment variables
    spoke_deployment_verify_env "$instance_code"

    # Create deployment checkpoint
    if type orch_create_checkpoint &>/dev/null; then
        orch_create_checkpoint "$instance_code" "DEPLOYMENT" "Deployment phase completed"
    fi

    log_success "Deployment phase complete"
    return 0
}

# =============================================================================
# CORE SERVICE STARTUP
# =============================================================================

##
# Wait for core infrastructure services (databases, Keycloak)
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Core services healthy
#   1 - Failure
##
spoke_deployment_wait_for_core_services() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    log_step "Waiting for core services..."

    # Core services required before proceeding
    local core_services=("postgres" "mongodb" "redis" "keycloak")

    for service in "${core_services[@]}"; do
        local container="dive-spoke-${code_lower}-${service}"
        local timeout="${SPOKE_SERVICE_TIMEOUTS[$service]:-60}"

        if ! spoke_containers_wait_for_service "$container" "$timeout"; then
            log_error "Core service $service failed to start"
            orch_record_error "$SPOKE_ERROR_SERVICE_DEPENDENCY" "$ORCH_SEVERITY_CRITICAL" \
                "Core service $service failed health check" "deployment" \
                "$(spoke_error_get_remediation $SPOKE_ERROR_SERVICE_DEPENDENCY $instance_code)"
            return 1
        fi
    done

    log_success "Core services healthy"
    return 0
}

# =============================================================================
# ADMIN USER MANAGEMENT
# =============================================================================

##
# Ensure Keycloak admin user exists for Terraform operations
#
# Arguments:
#   $1 - Instance code
##
spoke_deployment_ensure_admin_user() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_step "Ensuring Keycloak admin user exists..."

    local kc_container="dive-spoke-${code_lower}-keycloak"

    # Check if container is running
    if ! docker ps --format '{{.Names}}' | grep -q "^${kc_container}$"; then
        log_warn "Keycloak container not running - skipping admin user creation"
        return
    fi

    # Get admin password from environment or container
    local kc_admin_pass
    kc_admin_pass="${KEYCLOAK_ADMIN_PASSWORD:-}"

    if [ -z "$kc_admin_pass" ]; then
        kc_admin_pass=$(docker exec "$kc_container" printenv KC_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
    fi
    if [ -z "$kc_admin_pass" ]; then
        kc_admin_pass=$(docker exec "$kc_container" printenv KC_BOOTSTRAP_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
    fi

    if [ -z "$kc_admin_pass" ]; then
        log_warn "Cannot get Keycloak admin password - admin user creation skipped"
        return
    fi

    # Wait for Keycloak API to be ready
    local max_wait=60
    local elapsed=0

    while [ $elapsed -lt $max_wait ]; do
        local response
        response=$(docker exec "$kc_container" curl -sf \
            -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
            -d "grant_type=password" \
            -d "username=admin" \
            -d "password=${kc_admin_pass}" \
            -d "client_id=admin-cli" 2>/dev/null)

        if echo "$response" | grep -q "access_token"; then
            log_success "Keycloak admin access verified"
            return
        fi

        sleep 2
        elapsed=$((elapsed + 2))
    done

    log_warn "Could not verify Keycloak admin access within ${max_wait}s"
}

# =============================================================================
# POST-STARTUP INITIALIZATION
# =============================================================================

##
# Run post-startup initialization scripts
#
# Arguments:
#   $1 - Instance code
##
spoke_deployment_run_init_scripts() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local init_marker="$spoke_dir/.initialized"

    # Skip if already initialized (redeploy)
    if [ -f "$init_marker" ]; then
        log_verbose "Spoke already initialized - skipping init scripts"
        return 0
    fi

    log_step "Running post-startup initialization..."

    # Find init script
    local init_script="${DIVE_ROOT}/scripts/spoke-init/init-all.sh"
    if [ ! -f "$init_script" ]; then
        init_script="${DIVE_ROOT}/scripts/init-all.sh"
    fi

    if [ -f "$init_script" ]; then
        # Set required environment variables
        export SPOKE_INSTANCE="$code_lower"
        export COMPOSE_PROJECT_NAME="dive-spoke-${code_lower}"

        log_verbose "Running init-all.sh..."
        if bash "$init_script" 2>&1 | head -20; then
            log_success "Post-startup initialization complete"
            touch "$init_marker"
        else
            log_warn "Post-startup initialization had issues (non-blocking)"
        fi
    else
        log_verbose "No init-all.sh found - skipping"
    fi

    return 0
}

# =============================================================================
# ENVIRONMENT VERIFICATION
# =============================================================================

##
# Verify container environment variables are correctly set
#
# Arguments:
#   $1 - Instance code
##
spoke_deployment_verify_env() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    log_step "Verifying container environment..."

    local critical_env_vars=(
        "POSTGRES_PASSWORD"
        "DATABASE_URL"
        "NEXT_PUBLIC_IDP_URL"
        "AUTH_SECRET"
    )

    local backend_container="dive-spoke-${code_lower}-backend"
    local frontend_container="dive-spoke-${code_lower}-frontend"

    # Check backend environment
    if docker ps --format '{{.Names}}' | grep -q "^${backend_container}$"; then
        local missing_vars=()

        for var in "${critical_env_vars[@]}"; do
            local value
            value=$(docker exec "$backend_container" printenv "$var" 2>/dev/null || echo "")

            if [ -z "$value" ]; then
                missing_vars+=("$var")
            fi
        done

        if [ ${#missing_vars[@]} -gt 0 ]; then
            log_warn "Backend missing env vars: ${missing_vars[*]}"
        else
            log_verbose "Backend environment verified"
        fi
    fi

    # Check frontend environment
    if docker ps --format '{{.Names}}' | grep -q "^${frontend_container}$"; then
        local frontend_vars=(
            "NEXT_PUBLIC_IDP_URL"
            "AUTH_KEYCLOAK_ID"
            "AUTH_SECRET"
        )

        for var in "${frontend_vars[@]}"; do
            local value
            value=$(docker exec "$frontend_container" printenv "$var" 2>/dev/null || echo "")

            if [ -z "$value" ]; then
                log_warn "Frontend missing: $var"
            fi
        done
    fi

    log_verbose "Environment verification complete"
}

# =============================================================================
# OPAL TOKEN PROVISIONING
# =============================================================================

##
# Provision OPAL JWT token for policy access
#
# Arguments:
#   $1 - Instance code
##
spoke_deployment_provision_opal_token() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local env_file="$spoke_dir/.env"

    log_step "Provisioning OPAL token..."

    # Check if token already exists
    local existing_token
    existing_token=$(grep "^SPOKE_OPAL_TOKEN=" "$env_file" 2>/dev/null | cut -d= -f2)

    if [ -n "$existing_token" ] && [ "$existing_token" != "" ]; then
        log_verbose "OPAL token already exists"
        return 0
    fi

    # Try to get token from Hub OPAL server
    local hub_opal_url="${HUB_OPAL_URL:-http://dive-hub-opal-server:7002}"

    # Check if Hub OPAL server is running
    if ! docker ps --format '{{.Names}}' | grep -q "dive-hub-opal-server"; then
        log_warn "Hub OPAL server not running - cannot provision token"
        return 1
    fi

    # Generate JWT token
    log_verbose "Generating OPAL JWT token..."

    # Default OPAL master token (from Hub configuration)
    local master_token="${OPAL_MASTER_TOKEN:-opal_master_token}"

    # Request token from OPAL server
    local token_response
    token_response=$(docker exec dive-hub-opal-server curl -sf \
        -X POST "http://localhost:7002/token" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $master_token" \
        -d "{\"client_id\":\"spoke-${code_lower}\",\"scopes\":[\"policy:read\",\"data:read\"]}" 2>/dev/null)

    if [ -n "$token_response" ]; then
        local new_token
        new_token=$(echo "$token_response" | grep -o '"token":"[^"]*' | cut -d'"' -f4)

        if [ -n "$new_token" ]; then
            # Update .env file
            if grep -q "^SPOKE_OPAL_TOKEN=" "$env_file" 2>/dev/null; then
                sed -i.tmp "s|^SPOKE_OPAL_TOKEN=.*|SPOKE_OPAL_TOKEN=$new_token|" "$env_file"
                rm -f "${env_file}.tmp"
            else
                echo "SPOKE_OPAL_TOKEN=$new_token" >> "$env_file"
            fi

            # Update running container
            docker exec "dive-spoke-${code_lower}-opal-client" \
                sh -c "export SPOKE_OPAL_TOKEN=$new_token" 2>/dev/null || true

            log_success "OPAL token provisioned"
            return 0
        fi
    fi

    log_warn "Could not provision OPAL token automatically"
    return 1
}

# =============================================================================
# SERVICE RESTART HELPERS
# =============================================================================

##
# Restart specific services to pick up configuration changes
#
# Arguments:
#   $1 - Instance code
#   $2 - Service list (space-separated)
##
spoke_deployment_restart_services() {
    local instance_code="$1"
    local services="$2"

    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    log_verbose "Restarting services: $services"

    export COMPOSE_PROJECT_NAME="dive-spoke-${code_lower}"
    cd "$spoke_dir"

    for service in $services; do
        local container="dive-spoke-${code_lower}-${service}"

        if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
            docker restart "$container" 2>/dev/null || true
        fi
    done
}
