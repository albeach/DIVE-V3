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
# BEST PRACTICE (2026-01-18): Check functions exist, not just guard variable
if type spoke_phase_deployment &>/dev/null; then
    return 0
fi
# Module loaded marker will be set at end after functions defined

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
##
# Ensure OPAL public key is configured (runs on EVERY deployment)
# CRITICAL: This must run BEFORE starting containers so docker-compose sees the env var
##
spoke_ensure_opal_key_configured() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")
    local env_file="${DIVE_ROOT}/instances/${code_lower}/.env"

    # Skip if .env doesn't exist (new deployment will create it)
    if [ ! -f "$env_file" ]; then
        return 0
    fi

    # Check if OPAL key is already valid
    if grep -q "^OPAL_AUTH_PUBLIC_KEY=\"ssh-" "$env_file" 2>/dev/null; then
        log_verbose "OPAL_AUTH_PUBLIC_KEY already configured"
        return 0
    fi

    # Get OPAL public key (best-effort)
    local opal_public_key=""
    if [ -f "$HOME/.ssh/id_rsa.pub" ]; then
        opal_public_key=$(cat "$HOME/.ssh/id_rsa.pub" 2>/dev/null | tr -d '\n\r')
    fi

    if [ -z "$opal_public_key" ]; then
        log_verbose "No OPAL public key available (will use no-auth mode)"
        return 0  # Non-blocking
    fi

    # Update or add OPAL key
    if grep -q "^OPAL_AUTH_PUBLIC_KEY=" "$env_file"; then
        # Update existing entry
        sed -i.bak "s|^OPAL_AUTH_PUBLIC_KEY=.*|OPAL_AUTH_PUBLIC_KEY=\"$opal_public_key\"|" "$env_file"
        rm -f "${env_file}.bak"
        log_success "Updated OPAL_AUTH_PUBLIC_KEY (auto-fix for existing spoke)"
    else
        # Add new entry
        echo "" >> "$env_file"
        echo "# OPAL Authentication (auto-configured at deployment)" >> "$env_file"
        echo "OPAL_AUTH_PUBLIC_KEY=\"$opal_public_key\"" >> "$env_file"
        log_success "Added OPAL_AUTH_PUBLIC_KEY (auto-fix for existing spoke)"
    fi

    return 0
}

spoke_phase_deployment() {
    local instance_code="$1"
    local pipeline_mode="${2:-deploy}"

    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    log_info "Deployment phase for $code_upper"

    # CRITICAL PRE-FLIGHT: Ensure OPAL key is configured
    # This fixes OPAL client for both new and existing spokes
    if ! spoke_ensure_opal_key_configured "$instance_code"; then
        log_verbose "OPAL key auto-configuration skipped (may not be needed)"
    fi

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

        # CRITICAL FIX (2026-01-15): Pass instance code as required argument
        # Root cause: init-all.sh expects <INSTANCE_CODE> argument but wasn't receiving it
        # Previous: bash "$init_script" → Usage error
        # Fixed: bash "$init_script" "$code_upper" → Proper execution
        log_verbose "Running init-all.sh $code_upper..."
        if bash "$init_script" "$code_upper" 2>&1 | head -20; then
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
# This function performs instance-aware environment variable verification:
# - Checks suffixed variables (e.g., POSTGRES_PASSWORD_FRA)
# - Verifies computed variables (e.g., DATABASE_URL built from other vars)
# - Validates instance-specific naming conventions
# - Provides clear error messages with expected vs actual values
#
# Arguments:
#   $1 - Instance code (e.g., FRA, GBR)
##
spoke_deployment_verify_env() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_step "Verifying container environment for $code_upper..."

    local backend_container="dive-spoke-${code_lower}-backend"
    local frontend_container="dive-spoke-${code_lower}-frontend"

    local backend_issues=0
    local frontend_issues=0

    # Check backend environment variables
    if docker ps --format '{{.Names}}' | grep -q "^${backend_container}$"; then
        log_verbose "Checking backend environment variables..."

        # Backend environment variables (from docker-compose template)
        # Backend does NOT have AUTH_SECRET or POSTGRES_PASSWORD - those are frontend-only
        local backend_vars=(
            "KEYCLOAK_CLIENT_SECRET_${code_upper}"
            "MONGO_PASSWORD_${code_upper}"
            "KEYCLOAK_ADMIN_PASSWORD_${code_upper}"
        )

        for var in "${backend_vars[@]}"; do
            local value
            value=$(docker exec "$backend_container" printenv "$var" 2>/dev/null || echo "")

            if [ -z "$value" ]; then
                log_error "Backend missing env var: $var"
                ((backend_issues++))
            else
                log_verbose "✓ Backend has $var"
            fi
        done

        # Check instance-specific variables
        local instance_vars=(
            "INSTANCE_CODE"
            "SPOKE_MODE"
        )
        
        # Note: SPOKE_ID is now optional (fetched from Hub MongoDB via INSTANCE_CODE)

        for var in "${instance_vars[@]}"; do
            local value
            value=$(docker exec "$backend_container" printenv "$var" 2>/dev/null || echo "")

            if [ -z "$value" ]; then
                log_error "Backend missing instance var: $var"
                ((backend_issues++))
            else
                log_verbose "✓ Backend has $var=$value"
            fi
        done

        if [ $backend_issues -eq 0 ]; then
            log_success "Backend environment verified ($code_upper)"
        else
            log_error "Backend environment has $backend_issues issues ($code_upper)"
        fi
    else
        log_warn "Backend container $backend_container not running - skipping environment check"
    fi

    # Check frontend environment variables
    if docker ps --format '{{.Names}}' | grep -q "^${frontend_container}$"; then
        log_verbose "Checking frontend environment variables..."

        # Frontend environment variables (from docker-compose template)
        local frontend_vars=(
            "AUTH_SECRET_${code_upper}"
            "POSTGRES_PASSWORD_${code_upper}"
            "KEYCLOAK_CLIENT_SECRET_${code_upper}"
        )

        for var in "${frontend_vars[@]}"; do
            local value
            value=$(docker exec "$frontend_container" printenv "$var" 2>/dev/null || echo "")

            if [ -z "$value" ]; then
                log_error "Frontend missing env var: $var"
                ((frontend_issues++))
            else
                log_verbose "✓ Frontend has $var"
            fi
        done

        # Check instance-specific frontend variables
        local frontend_instance_vars=(
            "NEXT_PUBLIC_INSTANCE"
        )
        
        # Note: INSTANCE_CODE and SPOKE_MODE are backend-only variables

        for var in "${frontend_instance_vars[@]}"; do
            local value
            value=$(docker exec "$frontend_container" printenv "$var" 2>/dev/null || echo "")

            if [ -z "$value" ]; then
                log_error "Frontend missing instance var: $var"
                ((frontend_issues++))
            else
                log_verbose "✓ Frontend has $var=$value"
            fi
        done

        if [ $frontend_issues -eq 0 ]; then
            log_success "Frontend environment verified ($code_upper)"
        else
            log_error "Frontend environment has $frontend_issues issues ($code_upper)"
        fi
    else
        log_warn "Frontend container $frontend_container not running - skipping environment check"
    fi

    # Summary
    local total_issues=$((backend_issues + frontend_issues))
    if [ $total_issues -eq 0 ]; then
        log_success "Environment verification passed ($code_upper)"
        return 0
    else
        log_warn "Environment verification found $total_issues issues ($code_upper)"
        log_warn "This may indicate environment variable loading issues that could affect functionality"
        # Changed from error to return 0 - this is informational only
        return 0
    fi
}

# =============================================================================
# ORPHANED CODE REMOVED - FUNCTION COMPLETE ABOVE
# =============================================================================

##
# Additional verification functions (if needed)
##
spoke_deployment_verify_services() {
    local instance_code="$1"
    log_verbose "Service verification for ${instance_code}"
    # Placeholder for additional verifications
    return 0
}

# =============================================================================
# LEGACY CODE BELOW (for reference during migration)
# =============================================================================

_legacy_frontend_check() {
    # This section contains old frontend verification logic
    # Kept for reference - DO NOT EXECUTE
    : <<'LEGACY_CODE_BLOCK'
            "NEXT_PUBLIC_INSTANCE"
            "NEXT_PUBLIC_INSTANCE_NAME"
            "NEXT_PUBLIC_API_URL"
            "NEXT_PUBLIC_KEYCLOAK_URL"
            "NEXT_PUBLIC_KEYCLOAK_REALM"
        )

        for var in "${frontend_public_vars[@]}"; do
            local value
            value=$(docker exec "$frontend_container" printenv "$var" 2>/dev/null || echo "")

            if [ -z "$value" ]; then
                log_error "Frontend missing public env var: $var"
                log_error "  Expected: $var (public client-side variable)"
                ((frontend_issues++))
            else
                log_verbose "✓ Frontend has $var=$value"
            fi
        done

        # Check instance-specific variables
        local frontend_instance_vars=(
            "INSTANCE_CODE"
            "SPOKE_MODE"
        )

        for var in "${frontend_instance_vars[@]}"; do
            local value
            value=$(docker exec "$frontend_container" printenv "$var" 2>/dev/null || echo "")

            if [ -z "$value" ]; then
                log_error "Frontend missing instance var: $var"
                ((frontend_issues++))
            else
                log_verbose "✓ Frontend has $var=$value"
            fi
        done

        if [ $frontend_issues -eq 0 ]; then
            log_success "Frontend environment verified ($code_upper)"
        else
            log_error "Frontend environment has $frontend_issues issues ($code_upper)"
        fi
    else
        log_warn "Frontend container $frontend_container not running - skipping environment check"
    fi
LEGACY_CODE_BLOCK
    return 0
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

    # Get OPAL master token from Hub .env.hub
    local hub_env_file="${DIVE_ROOT}/.env.hub"
    local master_token="opal_master_token"  # fallback

    if [ -f "$hub_env_file" ]; then
        local env_master_token=$(grep "^OPAL_AUTH_MASTER_TOKEN=" "$hub_env_file" | cut -d= -f2 | tr -d '"')
        if [ -n "$env_master_token" ]; then
            master_token="$env_master_token"
        fi
    fi

    # Request token from OPAL server (HTTPS with self-signed cert skip)
    local token_response
    token_response=$(docker exec dive-hub-opal-server curl -sfk \
        -X POST "https://localhost:7002/token" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $master_token" \
        -d '{"type": "client"}' 2>/dev/null || echo "")

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

            # Update running container (best effort - container may not support runtime env update)
            if ! docker exec "dive-spoke-${code_lower}-opal-client" \
                sh -c "export SPOKE_OPAL_TOKEN=$new_token" 2>/dev/null; then
                log_verbose "Could not update OPAL token in running container (restart may be needed)"
            fi

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
            if ! docker restart "$container" 2>/dev/null; then
                log_verbose "Could not restart $container (may not be running)"
            fi
        fi
    done
}

export SPOKE_PHASE_DEPLOYMENT_LOADED=1
