#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Enhanced Error Handling Module for Spoke Deployment
# =============================================================================
# Provides structured error handling with severity levels and rollback capabilities
# Prevents deployment continuation when critical failures occur
# =============================================================================

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Mark this module as loaded (guard against multiple sourcing)
if [ -z "$DIVE_SPOKE_ERROR_HANDLING_LOADED" ]; then
export DIVE_SPOKE_ERROR_HANDLING_LOADED=1

# =============================================================================
# ERROR SEVERITY LEVELS
# =============================================================================

# Error severity constants
readonly ERROR_SEVERITY_CRITICAL=1    # Stop deployment immediately
readonly ERROR_SEVERITY_HIGH=2        # Attempt recovery, fail if unsuccessful
readonly ERROR_SEVERITY_MEDIUM=3      # Log warning, continue deployment
readonly ERROR_SEVERITY_LOW=4         # Log info, continue deployment

# Error codes
readonly ERROR_CONTAINER_START=100    # Container failed to start
readonly ERROR_SERVICE_HEALTH=101     # Service failed health check
readonly ERROR_FEDERATION_SETUP=102   # Federation configuration failed
readonly ERROR_SECRET_LOAD=103        # Secret loading failed
readonly ERROR_CERT_GENERATION=104    # Certificate generation failed
readonly ERROR_DATABASE_INIT=105      # Database initialization failed
readonly ERROR_KEYCLOAK_CONFIG=106    # Keycloak configuration failed

# =============================================================================
# ERROR CONTEXT TRACKING
# =============================================================================

# Global error tracking
declare -a DEPLOYMENT_ERRORS=()
declare -i CRITICAL_ERROR_COUNT=0
declare -i RECOVERABLE_ERROR_COUNT=0

##
# Initialize error tracking for a new deployment
#
# Arguments:
#   $1 - instance code
##
spoke_init_error_tracking() {
    local instance_code="$1"
    DEPLOYMENT_ERRORS=()
    CRITICAL_ERROR_COUNT=0
    RECOVERABLE_ERROR_COUNT=0

    log_verbose "Initialized error tracking for $instance_code deployment"
}

##
# Record a deployment error with context
#
# Arguments:
#   $1 - error code
#   $2 - severity level
#   $3 - error message
#   $4 - component (e.g., "keycloak", "backend", "federation")
#   $5 - recovery action (optional)
##
spoke_record_error() {
    local error_code="$1"
    local severity="$2"
    local message="$3"
    local component="$4"
    local recovery="${5:-}"

    local timestamp=$(date +%Y-%m-%dT%H:%M:%S%z)
    local error_record="$timestamp|$error_code|$severity|$component|$message|$recovery"

    DEPLOYMENT_ERRORS+=("$error_record")

    case "$severity" in
        $ERROR_SEVERITY_CRITICAL)
            CRITICAL_ERROR_COUNT=$((CRITICAL_ERROR_COUNT + 1))
            log_error "CRITICAL ERROR [$component]: $message"
            if [ -n "$recovery" ]; then
                log_error "Recovery needed: $recovery"
            fi
            ;;
        $ERROR_SEVERITY_HIGH)
            RECOVERABLE_ERROR_COUNT=$((RECOVERABLE_ERROR_COUNT + 1))
            log_warn "HIGH PRIORITY ERROR [$component]: $message"
            if [ -n "$recovery" ]; then
                log_warn "Will attempt recovery: $recovery"
            fi
            ;;
        $ERROR_SEVERITY_MEDIUM)
            log_warn "MEDIUM PRIORITY [$component]: $message"
            ;;
        $ERROR_SEVERITY_LOW)
            log_info "NOTICE [$component]: $message"
            ;;
        *)
            log_error "UNKNOWN ERROR SEVERITY [$component]: $message"
            ;;
    esac
}

##
# Check if deployment should continue based on error state
#
# Returns:
#   0 - Continue deployment
#   1 - Stop deployment (critical errors)
#   2 - Stop deployment (too many recoverable errors)
##
spoke_should_continue_deployment() {
    # Always stop on critical errors
    if [ "$CRITICAL_ERROR_COUNT" -gt 0 ]; then
        log_error "Stopping deployment due to $CRITICAL_ERROR_COUNT critical error(s)"
        return 1
    fi

    # Stop if too many recoverable errors (configurable threshold)
    local max_recoverable_errors="${MAX_RECOVERABLE_ERRORS:-3}"
    if [ "$RECOVERABLE_ERROR_COUNT" -gt "$max_recoverable_errors" ]; then
        log_error "Stopping deployment due to $RECOVERABLE_ERROR_COUNT recoverable errors (threshold: $max_recoverable_errors)"
        return 2
    fi

    return 0
}

##
# Generate deployment error summary
#
# Arguments:
#   $1 - instance code
##
spoke_generate_error_summary() {
    local instance_code="$1"
    local error_log="${DIVE_ROOT}/logs/spoke-deploy-errors-${instance_code}-$(date +%Y%m%d-%H%M%S).log"

    echo "=== DIVE V3 Spoke Deployment Error Summary ===" > "$error_log"
    echo "Instance: $instance_code" >> "$error_log"
    echo "Timestamp: $(date)" >> "$error_log"
    echo "Critical Errors: $CRITICAL_ERROR_COUNT" >> "$error_log"
    echo "Recoverable Errors: $RECOVERABLE_ERROR_COUNT" >> "$error_log"
    echo "" >> "$error_log"
    echo "Error Details:" >> "$error_log"

    for error in "${DEPLOYMENT_ERRORS[@]}"; do
        echo "$error" >> "$error_log"
    done

    echo "" >> "$error_log"
    echo "=== End Error Summary ===" >> "$error_log"

    if [ "${#DEPLOYMENT_ERRORS[@]}" -gt 0 ]; then
        log_info "Error summary saved to: $error_log"
    fi
}

# =============================================================================
# ENHANCED ERROR-WRAPPED FUNCTIONS
# =============================================================================

##
# Enhanced container start with error handling
#
# Arguments:
#   $1 - instance code (lowercase)
#   $2 - service name (optional, default: all services)
#
# Returns:
#   0 - Success
#   1 - Failed
##
spoke_start_containers_with_error_handling() {
    local code_lower="$1"
    local service="${2:-}"
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    log_verbose "Starting containers with enhanced error handling..."

    cd "$spoke_dir"

    local start_command="docker compose up -d"
    if [ -n "$service" ]; then
        start_command="$start_command $service"
    fi

    # Attempt to start containers
    if $start_command 2>&1 | tee /tmp/container-start.log; then
        log_verbose "Container start command completed"

        # Wait for containers to be running
        sleep 5

        # Check if containers actually started
        local running_count=$(docker compose ps -q 2>/dev/null | wc -l | tr -d ' ')
        local expected_count=$(docker compose config --services 2>/dev/null | wc -l | tr -d ' ')

        if [ "$running_count" -eq "$expected_count" ]; then
            log_verbose "All $expected_count containers started successfully"
            return 0
        else
            spoke_record_error "$ERROR_CONTAINER_START" "$ERROR_SEVERITY_HIGH" \
                "Only $running_count of $expected_count containers started" \
                "containers" \
                "Check container logs and docker compose status"
            return 1
        fi
    else
        local error_msg=$(tail -5 /tmp/container-start.log 2>/dev/null || echo "Container start failed")
        spoke_record_error "$ERROR_CONTAINER_START" "$ERROR_SEVERITY_CRITICAL" \
            "Container start failed: $error_msg" \
            "containers" \
            "Check docker compose configuration and system resources"
        return 1
    fi
}

##
# Enhanced health check with error handling
#
# Arguments:
#   $1 - instance code (lowercase)
#   $2 - timeout seconds (optional, default: 120)
#
# Returns:
#   0 - All services healthy
#   1 - Health check failed
##
spoke_health_check_with_error_handling() {
    local code_lower="$1"
    local timeout="${2:-120}"

    log_verbose "Performing health check with enhanced error handling..."

    local health_result
    if type _spoke_wait_for_services &>/dev/null; then
        _spoke_wait_for_services "$code_lower" "$timeout"
        health_result=$?
    else
        # Fallback health check
        sleep 10
        health_result=0
    fi

    if [ $health_result -ne 0 ]; then
        spoke_record_error "$ERROR_SERVICE_HEALTH" "$ERROR_SEVERITY_HIGH" \
            "Services failed to become healthy within ${timeout}s" \
            "health-check" \
            "Check service logs and resource allocation"
        return 1
    fi

    log_verbose "Health check passed"
    return 0
}

##
# Enhanced federation setup with error handling
#
# Arguments:
#   $1 - instance code (lowercase)
#
# Returns:
#   0 - Success
#   1 - Failed
##
spoke_federation_setup_with_error_handling() {
    local code_lower="$1"

    log_verbose "Performing federation setup with enhanced error handling..."

    if type configure_spoke_federation &>/dev/null; then
        if configure_spoke_federation "$code_lower"; then
            log_verbose "Federation setup completed successfully"
            return 0
        else
            spoke_record_error "$ERROR_FEDERATION_SETUP" "$ERROR_SEVERITY_HIGH" \
                "Federation configuration failed" \
                "federation" \
                "Run './dive federation-setup configure $code_lower' manually"
            return 1
        fi
    else
        spoke_record_error "$ERROR_FEDERATION_SETUP" "$ERROR_SEVERITY_MEDIUM" \
            "Federation setup module not available" \
            "federation" \
            "Federation setup will be skipped"
        return 0  # Not critical, continue deployment
    fi
}

##
# Enhanced secret loading with error handling
#
# Arguments:
#   $1 - instance code (lowercase)
#
# Returns:
#   0 - Success
#   1 - Failed
##
spoke_secret_loading_with_error_handling() {
    local code_lower="$1"

    log_verbose "Loading secrets with enhanced error handling..."

    if ! load_gcp_secrets "$code_lower" 2>/dev/null; then
        log_warn "GCP secrets unavailable, trying local defaults..."
        if ! load_local_defaults 2>/dev/null; then
            spoke_record_error "$ERROR_SECRET_LOAD" "$ERROR_SEVERITY_HIGH" \
                "Failed to load secrets from both GCP and local defaults" \
                "secrets" \
                "Ensure GCP credentials are configured or check local .env files"
            return 1
        fi
    fi

    log_verbose "Secrets loaded successfully"
    return 0
}

# =============================================================================
# ROLLBACK CAPABILITIES
# =============================================================================

##
# Create deployment checkpoint for rollback
#
# Arguments:
#   $1 - instance code (lowercase)
#   $2 - checkpoint name (optional)
##
spoke_create_checkpoint() {
    local code_lower="$1"
    local checkpoint_name="${2:-pre-deployment}"
    local checkpoint_dir="${DIVE_ROOT}/.dive-checkpoints/${code_lower}/${checkpoint_name}-$(date +%Y%m%d-%H%M%S)"

    mkdir -p "$checkpoint_dir"

    # Save current state
    docker ps -a --filter "name=dive-spoke-${code_lower}" --format "{{.Names}},{{.Status}},{{.Ports}}" > "${checkpoint_dir}/containers.csv" 2>/dev/null || true
    docker compose config > "${checkpoint_dir}/docker-compose.yml" 2>/dev/null || true

    # Save configuration files
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
    cp "$spoke_dir/docker-compose.yml" "${checkpoint_dir}/" 2>/dev/null || true
    cp "$spoke_dir/.env" "${checkpoint_dir}/" 2>/dev/null || true

    log_verbose "Created deployment checkpoint: $checkpoint_dir"
    echo "$checkpoint_dir"
}

##
# Rollback to checkpoint
#
# Arguments:
#   $1 - checkpoint directory
##
spoke_rollback_to_checkpoint() {
    local checkpoint_dir="$1"

    if [ ! -d "$checkpoint_dir" ]; then
        log_error "Checkpoint directory does not exist: $checkpoint_dir"
        return 1
    fi

    log_warn "Rolling back deployment to checkpoint: $checkpoint_dir"

    # Restore configuration files
    if [ -f "$checkpoint_dir/docker-compose.yml" ]; then
        local instance_code=$(basename "$checkpoint_dir" | cut -d'-' -f1)
        local spoke_dir="${DIVE_ROOT}/instances/${instance_code}"
        cp "$checkpoint_dir/docker-compose.yml" "$spoke_dir/" 2>/dev/null || true
        cp "$checkpoint_dir/.env" "$spoke_dir/" 2>/dev/null || true
    fi

    # Stop and restart containers
    cd "${DIVE_ROOT}/instances/$(basename "$checkpoint_dir" | cut -d'-' -f1)"
    docker compose down 2>/dev/null || true
    docker compose up -d 2>/dev/null || true

    log_info "Rollback completed"
}

# =============================================================================
# INTEGRATION FUNCTIONS
# =============================================================================

##
# Enhanced deployment wrapper that includes error handling
# This replaces the main spoke_deploy function's error handling
#
# Arguments:
#   $1 - instance code
#   $2 - instance name
##
spoke_deploy_with_error_handling() {
    local instance_code="$1"
    local instance_name="$2"
    local code_lower=$(lower "$instance_code")

    # Initialize error tracking
    spoke_init_error_tracking "$instance_code"

    # Create initial checkpoint
    local checkpoint_dir
    checkpoint_dir=$(spoke_create_checkpoint "$code_lower" "pre-deploy")

    log_info "Starting enhanced deployment with error handling for $instance_code"

    # Phase 1: Secret Loading
    if ! spoke_secret_loading_with_error_handling "$code_lower"; then
        if ! spoke_should_continue_deployment; then
            spoke_generate_error_summary "$instance_code"
            log_error "Deployment stopped due to critical errors in secret loading"
            return 1
        fi
    fi

    # Phase 2: Certificate Setup
    if type prepare_federation_certificates &>/dev/null; then
        if ! prepare_federation_certificates "$code_lower"; then
            spoke_record_error "$ERROR_CERT_GENERATION" "$ERROR_SEVERITY_MEDIUM" \
                "Certificate preparation failed" \
                "certificates" \
                "Certificates may need manual generation"
        fi
    fi

    # Phase 3: Container Startup
    if ! spoke_start_containers_with_error_handling "$code_lower"; then
        if ! spoke_should_continue_deployment; then
            spoke_generate_error_summary "$instance_code"
            log_error "Deployment stopped due to container startup failures"
            return 1
        fi
    fi

    # Phase 4: Health Checks
    if ! spoke_health_check_with_error_handling "$code_lower"; then
        if ! spoke_should_continue_deployment; then
            spoke_generate_error_summary "$instance_code"
            log_error "Deployment stopped due to service health failures"
            return 1
        fi
    fi

    # Phase 5: Federation Setup
    if ! spoke_federation_setup_with_error_handling "$code_lower"; then
        if ! spoke_should_continue_deployment; then
            spoke_generate_error_summary "$instance_code"
            log_error "Deployment stopped due to federation setup failures"
            return 1
        fi
    fi

    # Generate final error summary
    spoke_generate_error_summary "$instance_code"

    # Report results
    if [ "$CRITICAL_ERROR_COUNT" -gt 0 ]; then
        log_error "Deployment completed with $CRITICAL_ERROR_COUNT critical error(s)"
        return 1
    elif [ "$RECOVERABLE_ERROR_COUNT" -gt 0 ]; then
        log_warn "Deployment completed with $RECOVERABLE_ERROR_COUNT recoverable error(s)"
        return 0
    else
        log_success "Deployment completed successfully with no errors"
        return 0
    fi
}

fi  # End guard against multiple sourcing