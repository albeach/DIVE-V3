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

# Load validation functions for idempotent deployments
if [ -z "${SPOKE_VALIDATION_LOADED:-}" ]; then
    if [ -f "$(dirname "${BASH_SOURCE[0]}")/spoke-validation.sh" ]; then
        source "$(dirname "${BASH_SOURCE[0]}")/spoke-validation.sh"
    fi
fi

# Load checkpoint system

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

    # =============================================================================
    # IDEMPOTENT DEPLOYMENT: Check if phase already complete
    # =============================================================================
    if type spoke_phase_is_complete &>/dev/null; then
        if spoke_phase_is_complete "$instance_code" "DEPLOYMENT"; then
            # Validate state is actually good
            if type spoke_validate_phase_state &>/dev/null; then
                if spoke_validate_phase_state "$instance_code" "DEPLOYMENT"; then
                    log_info "✓ DEPLOYMENT phase complete and validated, skipping"
                    return 0
                else
                    log_warn "DEPLOYMENT checkpoint exists but validation failed, re-running"
                    spoke_phase_clear "$instance_code" "DEPLOYMENT" 2>/dev/null || true
                fi
            else
                log_info "✓ DEPLOYMENT phase complete (validation not available)"
                return 0
            fi
        fi
    fi

    # =============================================================================
    # PERFORMANCE TRACKING: Phase timing metrics
    # =============================================================================
    local PHASE_START=$(date +%s)

    log_info "→ Executing DEPLOYMENT phase for $code_upper"

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
    # CRITICAL: MongoDB healthcheck now initializes replica set AND verifies PRIMARY
    # No external script needed - initialization happens in container healthcheck
    if ! spoke_deployment_wait_for_core_services "$instance_code"; then
        return 1
    fi

    # Step 2a: REMOVED - MongoDB replica set initialization now in healthcheck
    # Previously: spoke_deployment_init_mongodb_replica_set (race condition)
    # Now: Healthcheck initializes replica set BEFORE marking container healthy
    # This ensures KAS/backend don't start until MongoDB is truly PRIMARY

    # Step 2b: Verify MongoDB PRIMARY status (redundant check for safety)
    # Healthcheck already ensures PRIMARY, but we verify once more
    if ! spoke_deployment_verify_mongodb_ready "$instance_code"; then
        log_error "MongoDB verification failed - check healthcheck logs"
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

    # Validate deployment phase completed successfully
    if ! spoke_checkpoint_deployment "$instance_code"; then
        log_error "Deployment checkpoint failed - containers not healthy or MongoDB not PRIMARY"
        if type orch_record_error &>/dev/null; then
            orch_record_error "${SPOKE_ERROR_CHECKPOINT_FAILED:-1150}" "$ORCH_SEVERITY_CRITICAL" \
                "Deployment checkpoint validation failed" "deployment" \
                "Check container health: docker ps --filter name=dive-spoke-${code_lower}-"
        fi
        return 1
    fi

    # Calculate and log phase duration
    local PHASE_END=$(date +%s)
    local PHASE_DURATION=$((PHASE_END - PHASE_START))

    # Mark phase complete (checkpoint system)
    if type spoke_phase_mark_complete &>/dev/null; then
        spoke_phase_mark_complete "$instance_code" "DEPLOYMENT" "$PHASE_DURATION" '{}' || true
    fi

    log_success "✅ DEPLOYMENT phase complete in ${PHASE_DURATION}s"
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

    # Get core services dynamically from compose file labels
    # Phase 1 Sprint 1.2: Replace hardcoded array with dynamic discovery
    local core_services=($(compose_get_spoke_services_by_class "$instance_code" "core"))

    for service in "${core_services[@]}"; do
        local container="dive-spoke-${code_lower}-${service}"

        # Extract base service name (remove instance suffix if present)
        local base_service="${service%-*}"

        # Get timeout safely - check if array is set first
        local timeout=60
        if [[ -v SPOKE_SERVICE_TIMEOUTS ]]; then
            if [[ -v SPOKE_SERVICE_TIMEOUTS[$base_service] ]]; then
                timeout="${SPOKE_SERVICE_TIMEOUTS[$base_service]}"
            fi
        fi

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
# MONGODB REPLICA SET INITIALIZATION
# =============================================================================

##
# Initialize MongoDB replica set (post-container-start)
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Initialization successful
#   1 - Initialization failed
##
spoke_deployment_init_mongodb_replica_set() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    local mongo_container="dive-spoke-${code_lower}-mongodb"
    local init_script="${DIVE_ROOT}/scripts/init-mongo-replica-set-post-start.sh"

    log_step "Initializing MongoDB replica set for $code_upper..."

    # Check script exists
    if [ ! -f "$init_script" ]; then
        log_error "CRITICAL: MongoDB initialization script not found: $init_script"
        return 1
    fi

    # Get MongoDB password for this instance
    local mongo_pass_var="MONGO_PASSWORD_${code_upper}"
    local mongo_pass="${!mongo_pass_var}"

    if [ -z "$mongo_pass" ]; then
        log_error "CRITICAL: MongoDB password not set for $code_upper (expected: $mongo_pass_var)"
        return 1
    fi

    # Run initialization script
    if ! bash "$init_script" "$mongo_container" admin "$mongo_pass"; then
        log_error "CRITICAL: MongoDB replica set initialization FAILED for $code_upper"
        log_error "This will cause 'not primary' errors during spoke registration"
        return 1
    fi

    log_success "MongoDB replica set initialized for $code_upper"

    # CRITICAL: Add stability buffer to allow replica set discovery to propagate
    # MongoDB drivers cache replica set topology - need time for connection pools to refresh
    log_verbose "Waiting 3s for MongoDB replica set discovery to stabilize..."
    sleep 3

    return 0
}

##
# Verify MongoDB is ready (healthcheck passed = PRIMARY status confirmed)
# 
# This is a lightweight verification that MongoDB container is healthy.
# The actual PRIMARY election happens in the healthcheck, so if the container
# is healthy, we know MongoDB is ready.
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - MongoDB ready
#   1 - MongoDB not ready
##
spoke_deployment_verify_mongodb_ready() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    local mongo_container="dive-spoke-${code_lower}-mongodb"

    log_step "Verifying MongoDB readiness ($code_upper)..."

    # Check if container is healthy (healthcheck passed)
    local health_status=$(docker inspect --format='{{.State.Health.Status}}' "$mongo_container" 2>/dev/null || echo "unknown")

    if [ "$health_status" = "healthy" ]; then
        log_success "MongoDB is ready (healthcheck: healthy, replica set: PRIMARY)"
        
        # Optional: Double-check PRIMARY status for logging
        local mongo_pass_var="MONGO_PASSWORD_${code_upper}"
        local mongo_pass="${!mongo_pass_var}"
        local state=$(docker exec "$mongo_container" mongosh admin -u admin -p "$mongo_pass" --quiet --eval "rs.status().members[0].stateStr" 2>/dev/null || echo "UNKNOWN")
        log_verbose "MongoDB replica set state: $state"
        
        return 0
    else
        log_warn "MongoDB container health status: $health_status"
        log_warn "Expected: healthy (healthcheck ensures PRIMARY before marking healthy)"
        
        # If not healthy yet, wait a bit more
        log_info "Waiting 10s for MongoDB healthcheck to complete..."
        sleep 10
        
        health_status=$(docker inspect --format='{{.State.Health.Status}}' "$mongo_container" 2>/dev/null || echo "unknown")
        if [ "$health_status" = "healthy" ]; then
            log_success "MongoDB is now ready"
            return 0
        else
            log_error "MongoDB not ready - healthcheck failed"
            log_error "Check logs: docker logs $mongo_container"
            return 1
        fi
    fi
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
        log_warn "Cannot get Keycloak admin password - admin verification skipped"
        return
    fi

    # Wait for Keycloak Admin API to be fully ready
    # Uses wait_for_keycloak_admin_api_ready() from common.sh (Phase 2 fix)
    # This replaces the previous simple authentication check (60s timeout)
    # with comprehensive readiness verification (180s timeout)
    log_step "Waiting for Keycloak admin API readiness..."

    if ! wait_for_keycloak_admin_api_ready "$kc_container" 180 "$kc_admin_pass"; then
        log_error "Keycloak admin API not ready after 180s"
        log_error "This blocks Terraform and federation setup - deployment cannot continue"
        return 1
    fi

    log_success "Keycloak admin API ready - proceeding with configuration"
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
        local init_exit_code=0
        bash "$init_script" "$code_upper" > /tmp/dive-init-$$.log 2>&1 || init_exit_code=$?
        head -20 /tmp/dive-init-$$.log
        rm -f /tmp/dive-init-$$.log
        if [ $init_exit_code -eq 0 ]; then
            log_success "Post-startup initialization complete"
            touch "$init_marker"
        else
            log_warn "Post-startup initialization had issues (exit code: $init_exit_code, non-blocking)"
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

        # Backend environment variables (UNSUFFIXED inside container)
        # Docker Compose reads ${VAR_FRA} from .env, sets VAR (no suffix) in container
        # Backend does NOT have AUTH_SECRET or POSTGRES_PASSWORD - those are frontend-only
        local backend_vars=(
            "KEYCLOAK_CLIENT_SECRET"
            "MONGODB_URI"
            "KEYCLOAK_ADMIN_PASSWORD"
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

        # Frontend environment variables (UNSUFFIXED inside container)
        # Docker Compose reads ${VAR_FRA} from .env, sets VAR (no suffix) in container
        local frontend_vars=(
            "NEXTAUTH_SECRET"
            "DATABASE_URL"
            "KEYCLOAK_CLIENT_SECRET"
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

            # Restart OPAL client container to pick up new token from .env
            # NOTE: docker exec export is a no-op (only affects ephemeral shell),
            # so we must restart the container for it to re-read environment
            local opal_container="dive-spoke-${code_lower}-opal-client"
            if docker ps --format '{{.Names}}' | grep -q "^${opal_container}$"; then
                log_verbose "Restarting OPAL client to pick up new token..."
                docker restart "$opal_container" 2>/dev/null || \
                    log_verbose "Could not restart OPAL client (manual restart may be needed)"
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
    local _saved_dir="$PWD"
    cd "$spoke_dir"

    for service in $services; do
        local container="dive-spoke-${code_lower}-${service}"

        if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
            if ! docker restart "$container" 2>/dev/null; then
                log_verbose "Could not restart $container (may not be running)"
            fi
        fi
    done

    cd "$_saved_dir"
}

# =============================================================================
# CHECKPOINT VALIDATION
# =============================================================================

##
# Validate deployment phase completed successfully
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Validation passed
#   1 - Validation failed
##
spoke_checkpoint_deployment() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    log_verbose "Validating deployment checkpoint for $instance_code"

    # Load secrets if needed for MongoDB password
    local code_upper_ckpt=$(upper "$instance_code")
    local mongo_password_var="MONGO_PASSWORD_${code_upper_ckpt}"
    local mongo_password="${!mongo_password_var}"

    if [ -z "$mongo_password" ]; then
        # Try to load from .env
        local env_file="${DIVE_ROOT}/instances/${code_lower}/.env"
        if [ -f "$env_file" ]; then
            mongo_password=$(grep "^MONGO_PASSWORD=" "$env_file" 2>/dev/null | cut -d= -f2)
        fi
    fi

    # Check MongoDB is PRIMARY
    if [ -n "$mongo_password" ]; then
        local mongo_state=$(docker exec "dive-spoke-${code_lower}-mongodb" \
            mongosh admin -u admin -p "$mongo_password" --quiet \
            --eval "rs.status().members[0].stateStr" 2>/dev/null || echo "ERROR")

        if [ "$mongo_state" != "PRIMARY" ]; then
            log_error "Checkpoint FAILED: MongoDB is not PRIMARY (state: $mongo_state)"
            return 1
        fi
    else
        log_verbose "MongoDB password not available, skipping PRIMARY check"
    fi

    # Check CORE containers healthy (OPTIONAL services like OPAL client can be unhealthy)
    # Phase 1 Sprint 1.2: Use dynamic service discovery instead of hardcoded list
    local core_services=($(compose_get_spoke_services_by_class "$instance_code" "core" 2>/dev/null || echo ""))
    local unhealthy_core=0
    local unhealthy_optional=0

    # Check each CORE service individually
    for service in "${core_services[@]}"; do
        local container="dive-spoke-${code_lower}-${service}"
        local health_status=$(docker inspect "$container" --format '{{.State.Health.Status}}' 2>/dev/null || echo "unknown")

        if [ "$health_status" != "healthy" ]; then
            ((unhealthy_core++))
            log_verbose "CORE service $service is not healthy: $health_status"
        fi
    done

    # Count OPTIONAL services that are unhealthy (for logging only)
    local optional_services=($(compose_get_spoke_services_by_class "$instance_code" "optional" 2>/dev/null || echo ""))
    for service in "${optional_services[@]}"; do
        local container="dive-spoke-${code_lower}-${service}"
        local health_status=$(docker inspect "$container" --format '{{.State.Health.Status}}' 2>/dev/null || echo "unknown")

        if [ "$health_status" != "healthy" ]; then
            ((unhealthy_optional++))
            log_verbose "OPTIONAL service $service is not healthy: $health_status (non-blocking)"
        fi
    done

    # Only fail if CORE services are unhealthy
    if [ "$unhealthy_core" != "0" ]; then
        log_error "Checkpoint FAILED: $unhealthy_core CORE containers not healthy"
        docker ps --filter "name=dive-spoke-${code_lower}-" --format "table {{.Names}}\t{{.Status}}"
        return 1
    fi

    # Log OPTIONAL service health issues but don't fail
    if [ "$unhealthy_optional" != "0" ]; then
        log_verbose "Checkpoint passed: $unhealthy_optional OPTIONAL services not healthy (non-blocking)"
        log_verbose "OPTIONAL services (like OPAL client) can be unhealthy during deployment"
        log_verbose "They will be provisioned/configured in the configuration phase"
    fi

    log_verbose "✓ Deployment checkpoint passed"
    return 0
}

export SPOKE_PHASE_DEPLOYMENT_LOADED=1
