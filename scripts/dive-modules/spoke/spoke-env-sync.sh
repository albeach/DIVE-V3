#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Environment Variable Synchronization Module
# =============================================================================
# Handles environment variable synchronization between .env files and running containers
# Ensures containers are recreated when docker-compose.yml environment changes
# =============================================================================

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Mark this module as loaded
export DIVE_SPOKE_ENV_SYNC_LOADED=1

# =============================================================================
# ENVIRONMENT VARIABLE SYNCHRONIZATION FUNCTIONS
# =============================================================================

##
# Check if docker-compose.yml has changes that require container recreation
# Compares current docker-compose.yml hash with stored hash
#
# Arguments:
#   $1 - instance code (lowercase)
#
# Returns:
#   0 - No changes, containers can be restarted
#   1 - Changes detected, containers need recreation
##
spoke_needs_recreation() {
    local code_lower="$1"
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    local compose_file="$spoke_dir/docker-compose.yml"
    local hash_file="$spoke_dir/.compose.hash"

    if [ ! -f "$compose_file" ]; then
        log_error "Docker compose file not found: $compose_file"
        return 1
    fi

    # Calculate current hash (excluding comments and blank lines for stability)
    local current_hash
    current_hash=$(grep -v '^#' "$compose_file" | grep -v '^$' | md5sum | cut -d' ' -f1)

    # Read stored hash
    local stored_hash=""
    if [ -f "$hash_file" ]; then
        stored_hash=$(cat "$hash_file")
    fi

    # Compare hashes
    if [ "$current_hash" != "$stored_hash" ]; then
        log_info "Docker compose configuration changed (hash: $current_hash vs $stored_hash)"
        echo "$current_hash" > "$hash_file"
        return 1  # Needs recreation
    else
        log_verbose "Docker compose configuration unchanged"
        return 0  # Can restart
    fi
}

##
# Validate that containers have correct environment variables
# Checks critical environment variables in running containers
#
# Arguments:
#   $1 - instance code (lowercase)
#
# Returns:
#   0 - All environment variables correct
#   1 - Environment variables mismatch
##
spoke_validate_env_vars() {
    local code_lower="$1"
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    log_verbose "Validating environment variables in running containers..."

    # Critical environment variables to check
    local critical_vars=(
        "KEYCLOAK_URL"
        "KEYCLOAK_REALM"
        "POSTGRES_PASSWORD"
        "MONGO_PASSWORD"
        "AUTH_SECRET"
    )

    local validation_failed=false

    # Check each service that should have environment variables
    local services=("backend" "keycloak")

    for service in "${services[@]}"; do
        local container_name="dive-spoke-${code_lower}-${service}"

        if docker ps --format '{{.Names}}' | grep -q "^${container_name}$"; then
            log_verbose "Checking environment variables in $container_name..."

            for var in "${critical_vars[@]}"; do
                # Get value from container
                local container_value
                container_value=$(docker exec "$container_name" env | grep "^${var}=" | cut -d= -f2 | tr -d '\n\r"')

                # Get expected value from docker-compose.yml
                local expected_value=""
                case "$var" in
                    "KEYCLOAK_URL")
                        # For backend, should be internal container name
                        if [[ "$service" == backend-* ]]; then
                            expected_value="https://keycloak-${code_lower}:8443"
                        fi
                        ;;
                    "KEYCLOAK_REALM")
                        expected_value="dive-v3-broker-${code_lower}"
                        ;;
                    "POSTGRES_PASSWORD")
                        expected_value=$(grep "^POSTGRES_PASSWORD_${code_lower}=" "$spoke_dir/.env" 2>/dev/null | cut -d= -f2 | tr -d '"')
                        ;;
                    "MONGO_PASSWORD")
                        expected_value=$(grep "^MONGO_PASSWORD_${code_lower}=" "$spoke_dir/.env" 2>/dev/null | cut -d= -f2 | tr -d '"')
                        ;;
                    "AUTH_SECRET")
                        expected_value=$(grep "^AUTH_SECRET_${code_lower}=" "$spoke_dir/.env" 2>/dev/null | cut -d= -f2 | tr -d '"')
                        ;;
                esac

                # Compare values
                if [ -n "$expected_value" ] && [ "$container_value" != "$expected_value" ]; then
                    log_warn "Environment variable mismatch in $container_name:"
                    log_warn "  $var: container='$container_value', expected='$expected_value'"
                    validation_failed=true
                fi
            done
        else
            log_verbose "Container $container_name not running, skipping env validation"
        fi
    done

    if [ "$validation_failed" = true ]; then
        log_warn "Environment variable validation failed - containers may need recreation"
        return 1
    else
        log_verbose "Environment variables validated successfully"
        return 0
    fi
}

##
# Smart container management - restart or recreate based on configuration changes
# This replaces the simple "already running" check in spoke_up
#
# Arguments:
#   $1 - instance code (lowercase)
#
# Returns:
#   0 - Success
#   1 - Failed
##
spoke_smart_container_management() {
    local code_lower="$1"
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    log_verbose "Performing smart container management for $code_lower..."

    cd "$spoke_dir"

    # Check if services are running
    local running_count=$(docker compose ps -q 2>/dev/null | wc -l | tr -d ' ')

    if [ "$running_count" -eq 0 ]; then
        log_info "No containers running, starting fresh..."
        return 0  # Let the calling function handle starting
    fi

    # Check if recreation is needed
    if spoke_needs_recreation "$code_lower"; then
        log_info "Configuration changed, recreating containers..."
        log_step "Stopping existing containers..."
        docker compose down 2>/dev/null || true

        log_step "Starting containers with new configuration..."
        # Use --force-recreate to ensure clean start
        docker compose up -d --force-recreate 2>&1 | tail -5

        if [ $? -ne 0 ]; then
            log_error "Failed to recreate containers"
            return 1
        fi

        log_success "Containers recreated successfully"
        return 0
    fi

    # Check if environment variables are correct
    if ! spoke_validate_env_vars "$code_lower"; then
        log_info "Environment variables incorrect, recreating containers..."
        log_step "Stopping existing containers..."
        docker compose down 2>/dev/null || true

        log_step "Starting containers with corrected environment..."
        docker compose up -d --force-recreate 2>&1 | tail -5

        if [ $? -ne 0 ]; then
            log_error "Failed to recreate containers for env fix"
            return 1
        fi

        log_success "Containers recreated with corrected environment"
        return 0
    fi

    # Containers are running and configuration is correct
    log_info "Containers already running with correct configuration"
    return 0
}

##
# Enhanced spoke up function that handles environment synchronization
# Replaces the container management logic in the main spoke_up function
#
# Arguments:
#   $1 - instance code (lowercase)
#
# Returns:
#   0 - Success
#   1 - Failed
##
spoke_up_enhanced() {
    local code_lower="$1"
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    log_step "🔧 Performing enhanced container management..."

    # Load secrets first (required for container recreation)
    if ! load_gcp_secrets "$code_lower" 2>/dev/null; then
        log_warn "Falling back to local defaults for secrets"
        load_local_defaults
    fi

    # Perform smart container management
    if ! spoke_smart_container_management "$code_lower"; then
        log_error "Container management failed"
        return 1
    fi

    # CRITICAL: Actually start the containers if they're not running
    cd "$spoke_dir"
    local running_count=$(docker compose ps -q 2>/dev/null | wc -l | tr -d ' ')

    if [ "$running_count" -eq 0 ]; then
        log_step "Starting Docker Compose services..."
        # Use --build to ensure custom images are rebuilt
        # CRITICAL: Use --env-file to load environment variables
        if ! docker compose --env-file .env up -d --build 2>&1 | tail -5; then
            log_error "Failed to start Docker Compose services"
            return 1
        else
            log_success "Services started"
        fi
    else
        log_info "Services already running ($running_count containers)"
    fi

    log_success "Container management completed successfully"
    return 0
}

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

##
# Force recreation of all containers for a spoke
# Useful for troubleshooting or when you know recreation is needed
#
# Arguments:
#   $1 - instance code (lowercase)
##
spoke_force_recreate() {
    local code_lower="$1"
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    log_info "Force recreating all containers for $code_lower..."

    cd "$spoke_dir"

    # Stop existing containers
    docker compose down 2>/dev/null || true

    # Remove hash file to force recreation detection
    rm -f "$spoke_dir/.compose.hash"

    # Start fresh
    log_step "Starting containers with fresh configuration..."
    docker compose up -d --force-recreate 2>&1 | tail -5

    if [ $? -eq 0 ]; then
        log_success "Force recreation completed successfully"
    else
        log_error "Force recreation failed"
        return 1
    fi
}

##
# Display environment variable status for troubleshooting
#
# Arguments:
#   $1 - instance code (lowercase, optional - uses INSTANCE if not provided)
##
spoke_env_status() {
    local code_lower="${1:-$INSTANCE}"
    if [ -z "$code_lower" ]; then
        log_error "Instance code required. Use --instance <CODE> or provide as parameter"
        return 1
    fi
    local code_lower=$(lower "$code_lower")
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    echo ""
    echo "🔍 Environment Variable Status for $code_lower"
    echo "=============================================="

    # Show docker-compose.yml hash
    if [ -f "$spoke_dir/.compose.hash" ]; then
        echo "Compose Hash: $(cat "$spoke_dir/.compose.hash")"
    else
        echo "Compose Hash: Not tracked"
    fi

    echo ""
    echo "Critical Environment Variables:"
    echo "-------------------------------"

    # Check each service
    local services=("backend" "keycloak")

    for service in "${services[@]}"; do
        local container_name="dive-spoke-${code_lower}-${service}"
        echo ""
        echo "Service: $service (Container: $container_name)"

        if docker ps --format '{{.Names}}' | grep -q "^${container_name}$"; then
            echo "Status: Running"

            # Show key environment variables
            local vars=("KEYCLOAK_URL" "KEYCLOAK_REALM" "POSTGRES_PASSWORD" "MONGO_PASSWORD")
            for var in "${vars[@]}"; do
                local value
                value=$(docker exec "$container_name" env | grep "^${var}=" | cut -d= -f2 | tr -d '\n\r"' | head -c 20)
                if [ -n "$value" ]; then
                    echo "  $var: ${value}..."
                else
                    echo "  $var: Not set"
                fi
            done
        else
            echo "Status: Not running"
        fi
    done

    echo ""
    echo "💡 Use './dive spoke env-sync force-recreate $code_lower' to force recreation"
}