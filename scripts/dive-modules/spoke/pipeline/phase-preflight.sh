#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Spoke Pipeline Preflight Phase
# =============================================================================
# Handles pre-deployment checks:
#   - Hub infrastructure detection
#   - Secret loading
#   - Network setup
#   - Instance conflict detection
#
# Consolidates logic from spoke_deploy() lines 467-618 and spoke_up() lines 62-211
# =============================================================================
# Version: 1.0.0
# Date: 2026-01-13
# =============================================================================

# Prevent multiple sourcing
if [ -n "$SPOKE_PHASE_PREFLIGHT_LOADED" ]; then
    return 0
fi
export SPOKE_PHASE_PREFLIGHT_LOADED=1

# =============================================================================
# MAIN PREFLIGHT PHASE FUNCTION
# =============================================================================

##
# Execute the preflight phase
#
# Arguments:
#   $1 - Instance code
#   $2 - Pipeline mode (deploy|up|redeploy)
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_phase_preflight() {
    local instance_code="$1"
    local pipeline_mode="${2:-deploy}"

    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    log_info "Preflight checks for $code_upper (mode: $pipeline_mode)"

    # Step 1: Check for deployment conflicts
    if ! spoke_preflight_check_conflicts "$instance_code"; then
        return 1
    fi

    # Step 2: Hub detection (required for deploy mode, optional for up mode)
    if [ "$pipeline_mode" = "deploy" ]; then
        if ! spoke_preflight_check_hub "$instance_code"; then
            return 1
        fi
    else
        spoke_preflight_check_hub "$instance_code" || \
            log_warn "Hub not detected (federation features may be limited)"
    fi

    # Step 3: Load secrets
    local secrets_changed=false
    if [ "$pipeline_mode" = "deploy" ]; then
        # Full deployment: load or generate secrets
        if ! spoke_secrets_load "$instance_code" "load"; then
            # Try generating new secrets
            if ! spoke_secrets_load "$instance_code" "generate"; then
                return 1
            fi
            secrets_changed=true
        else
            # Check if secrets have changed (password rotation scenario)
            secrets_changed=$(spoke_preflight_check_secret_changes "$instance_code")
        fi
    else
        # Quick start: just load existing secrets
        if ! spoke_secrets_load "$instance_code" "load"; then
            log_error "Cannot start spoke without secrets. Run deployment first."
            return 1
        fi
    fi

    # Step 4: Validate secrets
    if ! spoke_secrets_validate "$instance_code"; then
        if [ "$pipeline_mode" = "deploy" ]; then
            log_warn "Secret validation failed, but continuing deployment"
        else
            return 1
        fi
    fi

    # Step 5: Ensure shared network exists
    if ! spoke_preflight_ensure_network; then
        return 1
    fi

    # Step 6: Configure Hub hostname resolution
    spoke_preflight_configure_hub_connectivity "$instance_code"

    # Step 7: Check for stale containers (cleanup)
    if [ "$pipeline_mode" != "up" ]; then
        spoke_preflight_cleanup_stale_containers "$instance_code"
    fi

    # Step 8: Clean volumes if secrets changed (prevents password mismatch)
    if [ "$secrets_changed" = "true" ]; then
        log_warn "Secrets changed - cleaning database volumes to prevent password mismatch"
        spoke_preflight_clean_database_volumes "$instance_code"
    fi

    # Create preflight checkpoint
    if type orch_create_checkpoint &>/dev/null; then
        orch_create_checkpoint "$instance_code" "PREFLIGHT" "Preflight phase completed"
    fi

    log_success "Preflight checks passed"
    return 0
}

# =============================================================================
# CONFLICT DETECTION
# =============================================================================

##
# Check for deployment conflicts (another deployment in progress)
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - No conflicts
#   1 - Conflict detected
##
spoke_preflight_check_conflicts() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")

    # Check current state in database
    local current_state
    current_state=$(orch_db_get_state "$code_upper" 2>/dev/null || echo "UNKNOWN")

    case "$current_state" in
        INITIALIZING|DEPLOYING|CONFIGURING|VERIFYING)
            log_error "Deployment already in progress for $code_upper (state: $current_state)"
            echo ""
            echo "  To force restart, clean the state first:"
            echo "  ./dive --instance $(lower "$code_upper") spoke clean"
            echo ""

            orch_record_error "$SPOKE_ERROR_INSTANCE_CONFLICT" "$ORCH_SEVERITY_CRITICAL" \
                "Instance $code_upper deployment already in progress" "preflight" \
                "$(spoke_error_get_remediation $SPOKE_ERROR_INSTANCE_CONFLICT $instance_code)"
            return 1
            ;;
        FAILED)
            log_warn "Previous deployment failed, will clean up before retry"
            spoke_preflight_cleanup_failed_state "$instance_code"
            ;;
        COMPLETE)
            log_info "Previous deployment completed successfully"
            ;;
        *)
            log_verbose "No prior deployment state for $code_upper"
            ;;
    esac

    return 0
}

##
# Clean up after failed deployment
##
spoke_preflight_cleanup_failed_state() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_verbose "Cleaning up failed deployment state for $code_upper"

    # Reset state to allow new deployment
    orch_db_set_state "$code_upper" "CLEANUP" "Cleaning up after failed deployment"

    # Clean up orphaned containers
    spoke_preflight_cleanup_stale_containers "$instance_code"
}

# =============================================================================
# HUB DETECTION
# =============================================================================

##
# Check if Hub infrastructure is running
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Hub detected and healthy
#   1 - Hub not detected or unhealthy
##
spoke_preflight_check_hub() {
    local instance_code="$1"

    log_step "Checking Hub infrastructure..."

    # Check if Hub containers are running
    local hub_containers
    hub_containers=$(docker ps -q --filter "name=dive-hub" 2>/dev/null | wc -l | tr -d ' ')

    if [ "$hub_containers" -eq 0 ]; then
        log_error "No Hub infrastructure detected"
        echo ""
        echo "  SOLUTION:"
        echo "    1. Deploy the Hub first: ./dive hub deploy"
        echo "    2. Wait for Hub to be healthy: ./dive hub status"
        echo "    3. Then deploy spokes: ./dive spoke deploy $instance_code"
        echo ""

        orch_record_error "$SPOKE_ERROR_HUB_NOT_FOUND" "$ORCH_SEVERITY_CRITICAL" \
            "Hub infrastructure not detected" "preflight" \
            "$(spoke_error_get_remediation $SPOKE_ERROR_HUB_NOT_FOUND $instance_code)"
        return 1
    fi

    log_success "Hub infrastructure detected ($hub_containers containers)"

    # Check Hub OPAL server (required for federation)
    if ! docker ps -q --filter "name=dive-hub-opal-server" 2>/dev/null | grep -q .; then
        log_error "Hub OPAL server not running - required for spoke federation"

        orch_record_error "$SPOKE_ERROR_HUB_UNHEALTHY" "$ORCH_SEVERITY_CRITICAL" \
            "Hub OPAL server not running" "preflight" \
            "$(spoke_error_get_remediation $SPOKE_ERROR_HUB_UNHEALTHY $instance_code)"
        return 1
    fi

    log_success "Hub OPAL server available"

    # Check Hub Keycloak
    local hub_kc_container="${HUB_KEYCLOAK_CONTAINER:-dive-hub-keycloak}"
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${hub_kc_container}$"; then
        log_success "Hub Keycloak available"
    else
        log_warn "Hub Keycloak not detected - federation setup may fail"
    fi

    return 0
}

# =============================================================================
# NETWORK SETUP
# =============================================================================

##
# Ensure the shared federation network exists
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_preflight_ensure_network() {
    log_step "Ensuring federation network exists..."

    local network_name="dive-shared"

    if docker network ls --format '{{.Name}}' | grep -q "^${network_name}$"; then
        log_success "Federation network exists: $network_name"
        return 0
    fi

    log_info "Creating federation network: $network_name"

    if docker network create "$network_name" 2>/dev/null; then
        log_success "Federation network created: $network_name"
        return 0
    else
        log_error "Failed to create federation network"

        orch_record_error "$SPOKE_ERROR_NETWORK_SETUP" "$ORCH_SEVERITY_CRITICAL" \
            "Failed to create Docker network $network_name" "preflight" \
            "$(spoke_error_get_remediation $SPOKE_ERROR_NETWORK_SETUP)"
        return 1
    fi
}

##
# Configure Hub hostname resolution for the spoke
#
# Arguments:
#   $1 - Instance code
##
spoke_preflight_configure_hub_connectivity() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")
    local env_file="${DIVE_ROOT}/instances/${code_lower}/.env"

    # Hub connectivity is handled through Docker networks (dive-shared)
    # Containers communicate using container names

    if [ -f "$env_file" ]; then
        # Ensure HUB_IDP_URL is set
        if ! grep -q "^HUB_IDP_URL=" "$env_file"; then
            echo "HUB_IDP_URL=https://hub.dive25.com:8443" >> "$env_file"
            log_verbose "Added HUB_IDP_URL to .env"
        fi

        # Ensure HUB_OPAL_URL is set
        if ! grep -q "^HUB_OPAL_URL=" "$env_file"; then
            echo "HUB_OPAL_URL=https://hub.dive25.com:8080" >> "$env_file"
            log_verbose "Added HUB_OPAL_URL to .env"
        fi
    fi

    log_verbose "Hub connectivity configured via dive-shared network"
}

# =============================================================================
# CONTAINER CLEANUP
# =============================================================================

##
# Clean up stale/orphaned containers before deployment
#
# Arguments:
#   $1 - Instance code
##
spoke_preflight_cleanup_stale_containers() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    log_verbose "Cleaning up stale containers for $code_lower..."

    # Get all containers matching this spoke (running or stopped)
    local all_containers
    all_containers=$(docker ps -a --format '{{.Names}}' | grep "dive-spoke-${code_lower}-" 2>/dev/null || true)

    if [ -n "$all_containers" ]; then
        for container in $all_containers; do
            local container_status
            container_status=$(docker inspect "$container" --format '{{.State.Status}}' 2>/dev/null)

            # Remove if exited, dead, or orphaned
            if [[ "$container_status" == "exited" ]] || [[ "$container_status" == "dead" ]]; then
                log_verbose "Removing stopped container: $container"
                docker rm -f "$container" 2>/dev/null || true
            else
                # Check if container's network still exists
                local expected_network="${code_lower}_dive-${code_lower}-network"
                if ! docker network inspect "$expected_network" >/dev/null 2>&1; then
                    # Check if on dive-shared network
                    local on_shared
                    on_shared=$(docker inspect "$container" --format '{{range .NetworkSettings.Networks}}{{.NetworkID}}{{end}}' 2>/dev/null)

                    if [ -z "$on_shared" ]; then
                        log_verbose "Removing orphaned container (no network): $container"
                        docker rm -f "$container" 2>/dev/null || true
                    fi
                fi
            fi
        done
    fi

    # Clean up containers stuck in "Created" state
    local services="frontend backend redis keycloak postgres mongodb opa kas opal-client"
    for service in $services; do
        local container="dive-spoke-${code_lower}-${service}"
        if docker ps -a --format '{{.Names}}' | grep -q "^${container}$"; then
            local status
            status=$(docker inspect "$container" --format '{{.State.Status}}' 2>/dev/null)
            if [[ "$status" != "running" ]]; then
                log_verbose "Removing non-running container: $container ($status)"
                docker rm -f "$container" 2>/dev/null || true
            fi
        fi
    done

    log_verbose "Stale container cleanup complete"
}

# =============================================================================
# SECRET CHANGE DETECTION AND VOLUME CLEANUP
# =============================================================================

##
# Check if secrets have changed since last deployment
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   "true" if secrets changed, "false" otherwise
##
spoke_preflight_check_secret_changes() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    # Check if secret hash file exists
    local secret_hash_file="$spoke_dir/.secret-hash"

    if [ ! -f "$secret_hash_file" ]; then
        # No previous hash - assume changed
        spoke_preflight_save_secret_hash "$instance_code"
        echo "true"
        return 0
    fi

    # Calculate current secret hash
    local current_hash
    current_hash=$(spoke_preflight_calculate_secret_hash "$instance_code")

    # Compare with saved hash
    local saved_hash
    saved_hash=$(cat "$secret_hash_file" 2>/dev/null || echo "")

    if [ "$current_hash" != "$saved_hash" ]; then
        log_info "Secrets have changed (hash mismatch)"
        spoke_preflight_save_secret_hash "$instance_code"
        echo "true"
    else
        log_verbose "Secrets unchanged"
        echo "false"
    fi
}

##
# Calculate hash of current secrets
##
spoke_preflight_calculate_secret_hash() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")

    # Concatenate all secret values and hash
    local secrets_concat=""
    for secret in "POSTGRES_PASSWORD" "MONGO_PASSWORD" "REDIS_PASSWORD" "KEYCLOAK_ADMIN_PASSWORD"; do
        local var_name="${secret}_${code_upper}"
        local value="${!var_name}"
        secrets_concat="${secrets_concat}${value}"
    done

    echo -n "$secrets_concat" | md5sum | cut -d' ' -f1
}

##
# Save current secret hash
##
spoke_preflight_save_secret_hash() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    mkdir -p "$spoke_dir"
    spoke_preflight_calculate_secret_hash "$instance_code" > "$spoke_dir/.secret-hash"
}

##
# Clean database volumes when secrets change
#
# Arguments:
#   $1 - Instance code
##
spoke_preflight_clean_database_volumes() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    log_step "Cleaning database volumes due to secret change..."

    # Stop containers first
    local containers=("dive-spoke-${code_lower}-postgres" "dive-spoke-${code_lower}-mongodb" "dive-spoke-${code_lower}-redis")

    for container in "${containers[@]}"; do
        if docker ps -a --format '{{.Names}}' | grep -q "^${container}$"; then
            log_verbose "Stopping $container"
            docker stop "$container" 2>/dev/null || true
            docker rm "$container" 2>/dev/null || true
        fi
    done

    # Remove database volumes
    local project_name="dive-spoke-${code_lower}"
    local volumes=(
        "${project_name}_postgres_data"
        "${project_name}_mongodb_data"
        "${project_name}_mongodb_config"
        "${project_name}_redis_data"
    )

    for volume in "${volumes[@]}"; do
        if docker volume ls --format '{{.Name}}' | grep -q "^${volume}$"; then
            log_verbose "Removing volume: $volume"
            docker volume rm "$volume" 2>/dev/null || true
        fi
    done

    log_success "Database volumes cleaned - containers will initialize with new passwords"
}
