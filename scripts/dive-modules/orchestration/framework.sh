#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Enterprise Orchestration Framework (Consolidated)
# =============================================================================
# Fail-fast orchestration with intelligent error handling,
# service dependency management, and comprehensive observability.
#
# Consolidates:
#   - orchestration-framework.sh (core orchestration logic)
#   - orchestration-dependencies.sh (dependency validation)
# =============================================================================

# Prevent multiple sourcing
if [ -n "${ORCHESTRATION_FRAMEWORK_LOADED:-}" ]; then
    # Check if critical data structures exist
    if declare -p ORCH_CONTEXT &>/dev/null; then
        return 0
    else
        # Guard set but array missing - force reload
        unset ORCHESTRATION_FRAMEWORK_LOADED
    fi
fi
export ORCHESTRATION_FRAMEWORK_LOADED=1
export DIVE_ORCHESTRATION_FRAMEWORK_LOADED=1

# Ensure common functions are loaded
ORCH_DIR="$(dirname "${BASH_SOURCE[0]}")"
MODULES_DIR="$(dirname "$ORCH_DIR")"

if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "${MODULES_DIR}/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load orchestration sub-modules
if [ -f "${ORCH_DIR}/errors.sh" ]; then
    source "${ORCH_DIR}/errors.sh"
fi
if [ -f "${ORCH_DIR}/circuit-breaker.sh" ]; then
    source "${ORCH_DIR}/circuit-breaker.sh"
fi
if [ -f "${ORCH_DIR}/metrics.sh" ]; then
    source "${ORCH_DIR}/metrics.sh"
fi
if [ -f "${ORCH_DIR}/locks.sh" ]; then
    source "${ORCH_DIR}/locks.sh"
fi

# Load enhanced state management
if [ -f "${ORCH_DIR}/state.sh" ]; then
    source "${ORCH_DIR}/state.sh"
fi

# Load deployment-state.sh for backward compatibility (deprecated)
if [ -f "${MODULES_DIR}/deployment-state.sh" ]; then
    source "${MODULES_DIR}/deployment-state.sh"
fi

# =============================================================================
# ORCHESTRATION CONSTANTS
# =============================================================================

# Error severity levels (fail-fast framework)
readonly ORCH_SEVERITY_CRITICAL=1    # Stop immediately, no recovery
readonly ORCH_SEVERITY_HIGH=2        # Attempt recovery once, then stop
readonly ORCH_SEVERITY_MEDIUM=3      # Log warning, continue with degraded functionality
readonly ORCH_SEVERITY_LOW=4         # Log info, continue normally

# Service health states
readonly HEALTH_UNKNOWN="UNKNOWN"
readonly HEALTH_STARTING="STARTING"
readonly HEALTH_HEALTHY="HEALTHY"
readonly HEALTH_UNHEALTHY="UNHEALTHY"
readonly HEALTH_FAILED="FAILED"

# Deployment phases
readonly PHASE_PREFLIGHT="PREFLIGHT"
readonly PHASE_INITIALIZATION="INITIALIZATION"
readonly PHASE_DEPLOYMENT="DEPLOYMENT"
readonly PHASE_CONFIGURATION="CONFIGURATION"
readonly PHASE_VERIFICATION="VERIFICATION"
readonly PHASE_COMPLETION="COMPLETION"

# =============================================================================
# LOAD TIMEOUT CONFIGURATION
# =============================================================================

# Load centralized timeout configuration (Phase 2 Enhancement)
TIMEOUT_CONFIG="${DIVE_ROOT}/config/deployment-timeouts.env"
if [ -f "$TIMEOUT_CONFIG" ]; then
    # Load timeout values, allowing environment variable overrides
    set +u  # Allow unset variables during config load
    source "$TIMEOUT_CONFIG"
    set -u
    log_verbose "Loaded timeout configuration from $TIMEOUT_CONFIG"
else
    log_verbose "Timeout config not found at $TIMEOUT_CONFIG, using defaults"
fi

# =============================================================================
# SERVICE DEPENDENCY GRAPH
# =============================================================================

# Service startup order and dependencies
declare -A SERVICE_DEPENDENCIES=(
    ["postgres"]="none"
    ["mongodb"]="none"
    ["redis"]="none"
    ["keycloak"]="postgres"
    ["backend"]="postgres,mongodb,redis,keycloak"
    ["frontend"]="backend"
    ["opa"]="none"
    ["kas"]="mongodb,backend"
    ["opal-client"]="backend"
)

# Export array for subshells (required for parallel startup functions)
export SERVICE_DEPENDENCIES

# =============================================================================
# SERVICE DEPENDENCY VALIDATION (GAP-SD-001 Fix - Phase 4)
# =============================================================================
# Enhanced circular dependency detection with:
# - Visual dependency graph output
# - Detailed cycle path reporting
# - Dependency level calculation for parallel startup
# =============================================================================

##
# Detect circular dependencies in service dependency graph
#
# Returns:
#   0 - No circular dependencies
#   1 - Circular dependency detected
##

# =============================================================================
# SOURCE SUB-MODULES
# =============================================================================
_ORCH_DIR="$(dirname "${BASH_SOURCE[0]}")"
source "${_ORCH_DIR}/dependency.sh"   # Dependency graph, context, locking
source "${_ORCH_DIR}/execution.sh"    # Health checks, circuit breaker, retry, parallel
source "${_ORCH_DIR}/checkpoint.sh"   # Checkpoints, rollback, metrics, validation
unset _ORCH_DIR

orch_execute_phase() {
    local phase_name="$1"
    local phase_function="$2"

    ORCH_CONTEXT[current_phase]="$phase_name"

    log_info "Starting phase: $phase_name"

    # Set deployment state
    set_deployment_state_enhanced "${ORCH_CONTEXT[instance_code]}" "$phase_name" 2>/dev/null || true

    # Execute phase function
    if $phase_function; then
        log_success "Phase $phase_name completed successfully"
        return 0
    else
        orch_record_error "PHASE_FAIL" \
            "$ORCH_SEVERITY_HIGH" \
            "Phase $phase_name failed" \
            "orchestration" \
            "Check logs and retry, or check phase-specific error details"
        return 1
    fi
}

##
# Main orchestration entry point (with concurrent deployment protection)
#
# Arguments:
#   $1 - Instance code
#   $2 - Instance name
#   $3 - Deployment function to execute
#
# Returns:
#   0 - Orchestration completed successfully
#   1 - Orchestration failed
##
orch_execute_deployment() {
    local instance_code="$1"
    local instance_name="$2"
    local deployment_function="$3"

    # GAP-001 FIX: Acquire deployment lock to prevent concurrent deployments
    if ! orch_acquire_deployment_lock "$instance_code"; then
        log_error "Cannot start deployment for $instance_code - lock acquisition failed"
        log_error "Another deployment is in progress or lock cleanup needed"
        log_error ""
        log_error "To force deployment (if lock is stale):"
        log_error "  rm -f ${DIVE_ROOT}/.dive-state/${instance_code}.lock"
        log_error "  ./dive spoke deploy $instance_code"
        return 1
    fi

    # Ensure lock is released on exit (even if error occurs)
    trap "orch_release_deployment_lock '$instance_code'" EXIT ERR INT TERM

    # Initialize context
    orch_init_context "$instance_code" "$instance_name"

    log_info "Starting orchestrated deployment for $instance_code ($instance_name)"
    log_info "Deployment lock acquired - no other deployments of this instance can run concurrently"

    # Phase execution with error handling
    local phases=(
        "$PHASE_PREFLIGHT:orch_phase_preflight"
        "$PHASE_INITIALIZATION:orch_phase_initialization"
        "$PHASE_DEPLOYMENT:$deployment_function"
        "$PHASE_CONFIGURATION:orch_phase_configuration"
        "$PHASE_VERIFICATION:orch_phase_verification"
        "$PHASE_COMPLETION:orch_phase_completion"
    )

    local deployment_failed="false"
    for phase_spec in "${phases[@]}"; do
        IFS=':' read -r phase_name phase_function <<< "$phase_spec"

        if ! orch_execute_phase "$phase_name" "$phase_function"; then
            # Check if we should continue
            if ! orch_should_continue; then
                log_error "Orchestration stopped due to error threshold"
                set_deployment_state_enhanced "$instance_code" "FAILED" "Orchestration failed in phase $phase_name"
                orch_generate_error_summary "$instance_code"
                deployment_failed="true"
                break
            fi
        fi
    done

    # Release lock before returning
    orch_release_deployment_lock "$instance_code"
    trap - EXIT ERR INT TERM

    if [ "$deployment_failed" = true ]; then
        return 1
    fi

    # Final success
    local total_time=$(($(date +%s) - ORCH_CONTEXT[start_time]))
    log_success "Orchestrated deployment completed successfully in ${total_time}s"
    set_deployment_state_enhanced "$instance_code" "COMPLETE"

    orch_generate_error_summary "$instance_code"
    return 0
}

# =============================================================================
# PHASE IMPLEMENTATIONS (PLACEHOLDER)
# =============================================================================

orch_phase_preflight() {
    log_info "Executing preflight checks..."

    # GAP-005 FIX: Validate service dependency graph
    if ! orch_detect_circular_dependencies; then
        orch_record_error "CIRCULAR_DEPENDENCY" \
            "$ORCH_SEVERITY_CRITICAL" \
            "Circular dependency detected in service configuration" \
            "preflight" \
            "Fix SERVICE_DEPENDENCIES in orchestration-framework.sh"
        return 1
    fi

    # Validate Docker is running
    if ! docker info >/dev/null 2>&1; then
        orch_record_error "DOCKER_UNAVAILABLE" \
            "$ORCH_SEVERITY_CRITICAL" \
            "Docker daemon is not running" \
            "preflight" \
            "Start Docker: systemctl start docker (Linux) or start Docker Desktop (Mac)"
        return 1
    fi

    # Validate DIVE_ROOT is set
    if [ -z "$DIVE_ROOT" ]; then
        orch_record_error "DIVE_ROOT_UNSET" \
            "$ORCH_SEVERITY_CRITICAL" \
            "DIVE_ROOT environment variable not set" \
            "preflight" \
            "Run from DIVE V3 root directory"
        return 1
    fi

    # Check required directories exist
    local required_dirs=(".dive-state" ".dive-checkpoints" "logs" "instances")
    for dir in "${required_dirs[@]}"; do
        if [ ! -d "${DIVE_ROOT}/$dir" ]; then
            log_verbose "Creating required directory: $dir"
            mkdir -p "${DIVE_ROOT}/$dir"
        fi
    done

    log_success "Preflight checks passed"
    return 0
}

orch_phase_initialization() {
    log_info "Executing initialization..."
    # Implement initialization
    return 0
}

orch_phase_configuration() {
    log_info "Executing configuration..."
    # Implement configuration
    return 0
}

orch_phase_verification() {
    log_info "Executing verification..."
    # Implement verification
    return 0
}

orch_phase_completion() {
    log_info "Executing completion..."
    # Implement completion
    return 0
}

# =============================================================================
# DEPENDENCY VALIDATION (from orchestration-dependencies.sh consolidation)
# =============================================================================

# Health check retry configuration
HEALTH_CHECK_RETRY_INTERVAL="${HEALTH_CHECK_RETRY_INTERVAL:-5}"
HEALTH_CHECK_MAX_CONSECUTIVE_FAILURES="${HEALTH_CHECK_MAX_CONSECUTIVE_FAILURES:-3}"
HEALTH_CHECK_REQUIRED_SUCCESSES="${HEALTH_CHECK_REQUIRED_SUCCESSES:-2}"

# Parallel startup configuration
PARALLEL_STARTUP_ENABLED="${PARALLEL_STARTUP_ENABLED:-true}"

##
# Validate all deployment dependencies before starting
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - All dependencies satisfied
#   1 - Critical dependencies missing
##
orch_validate_dependencies() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")
    local code_upper=$(upper "$instance_code")

    log_step "Validating deployment dependencies for $instance_code..."

    local validation_failed=false
    local warnings=0
    local errors=0

    # 1. Check Docker daemon
    log_verbose "Checking Docker daemon..."
    if ! docker info >/dev/null 2>&1; then
        log_error "Docker daemon not running"
        ((errors++))
        validation_failed=true
    else
        log_verbose "Docker daemon running"
    fi

    # 2. Check Hub availability (for spoke deployments)
    # Skip for remote/standalone — no local Hub containers expected
    if [ "$code_upper" != "USA" ] && [ "$code_upper" != "HUB" ] && \
       [ "${DEPLOYMENT_MODE:-local}" != "remote" ] && [ "${DEPLOYMENT_MODE:-local}" != "standalone" ]; then
        log_verbose "Checking Hub availability..."
        if ! docker ps --filter "name=dive-hub-keycloak" --format '{{.Names}}' | grep -q "dive-hub-keycloak"; then
            log_error "Hub not running (required for spoke deployment)"
            ((errors++))
            validation_failed=true
        else
            local hub_health=$(docker inspect dive-hub-keycloak --format='{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
            if [ "$hub_health" != "healthy" ]; then
                log_warn "Hub is not healthy (status: $hub_health)"
                ((warnings++))
            fi
        fi
    elif [ "${DEPLOYMENT_MODE:-local}" = "remote" ]; then
        log_verbose "Remote mode — Hub availability checked via HTTPS (not local Docker)"
    fi

    # 3. Check required commands
    log_verbose "Checking required commands..."
    local required_commands=("docker" "jq" "curl" "openssl")
    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            log_error "Required command not found: $cmd"
            ((errors++))
            validation_failed=true
        fi
    done

    # 4. Check Docker Compose
    if ! docker compose version >/dev/null 2>&1; then
        log_error "Docker Compose v2 not available"
        ((errors++))
        validation_failed=true
    fi

    # 5. Check mkcert (local dev only — cloud/EC2 uses OpenSSL/Vault PKI)
    if ! is_cloud_environment 2>/dev/null && ! command -v mkcert >/dev/null 2>&1; then
        log_warn "mkcert not found - certificate generation may fail"
        ((warnings++))
    fi

    # Summary
    if [ "$validation_failed" = true ]; then
        log_error "Dependency validation failed ($errors errors, $warnings warnings)"
        return 1
    elif [ "$warnings" -gt 0 ]; then
        log_warn "Dependency validation passed with $warnings warnings"
        return 0
    else
        log_success "All dependencies satisfied"
        return 0
    fi
}

##
# Wait for service to become healthy with intelligent retry
#
# Arguments:
#   $1 - Service/container name
#   $2 - Max wait time in seconds (default: 300)
#   $3 - Instance code (optional, for metrics)
#
# Returns:
#   0 - Service became healthy
#   1 - Service failed to become healthy (timeout)
#   2 - Service permanently failed
##
orch_wait_healthy_with_retry() {
    local service="$1"
    local max_wait="${2:-300}"
    local instance_code="${3:-}"

    local retry_interval="${HEALTH_CHECK_RETRY_INTERVAL}"
    local max_failures="${HEALTH_CHECK_MAX_CONSECUTIVE_FAILURES}"
    local required_successes="${HEALTH_CHECK_REQUIRED_SUCCESSES}"

    local elapsed=0
    local consecutive_failures=0
    local consecutive_successes=0
    local recovery_attempts=0

    log_info "Waiting for $service to become healthy (max: ${max_wait}s)..."

    while [ $elapsed -lt $max_wait ]; do
        local health_status=$(docker inspect "$service" --format='{{.State.Health.Status}}' 2>/dev/null || echo "not_found")

        case "$health_status" in
            "healthy")
                consecutive_failures=0
                ((consecutive_successes++))
                if [ $consecutive_successes -ge $required_successes ]; then
                    log_success "$service is healthy (verified $required_successes times in ${elapsed}s)"
                    return 0
                fi
                ;;
            "unhealthy")
                consecutive_successes=0
                ((consecutive_failures++))
                if [ $consecutive_failures -ge $max_failures ]; then
                    if [ $recovery_attempts -lt 2 ]; then
                        log_warn "Attempting recovery: Restarting $service..."
                        ((recovery_attempts++))
                        docker restart "$service" >/dev/null 2>&1 || true
                        consecutive_failures=0
                        sleep 10
                    else
                        log_error "Service permanently failed after $recovery_attempts restarts"
                        return 2
                    fi
                fi
                ;;
            "not_found")
                log_error "Service not found: $service"
                return 2
                ;;
        esac

        sleep $retry_interval
        ((elapsed += retry_interval))
    done

    log_error "Timeout waiting for $service (${max_wait}s)"
    return 1
}

##
# Start services in parallel within a dependency tier
#
# Arguments:
#   $1 - Tier number
#   $2 - Instance code
#   $@ - Service names
#
# Returns:
#   0 - All services healthy
#   1 - One or more services failed
##
orch_parallel_tier_startup() {
    local tier_number="$1"
    local instance_code="$2"
    shift 2
    local services=("$@")

    local code_lower=$(lower "$instance_code")

    log_info "Starting Tier $tier_number services in parallel..."

    if [ "$PARALLEL_STARTUP_ENABLED" != "true" ]; then
        # Sequential fallback
        for service in "${services[@]}"; do
            docker compose up -d "$service" || return 1
            orch_wait_healthy_with_retry "dive-spoke-${code_lower}-${service}" 300 "$instance_code" || return 1
        done
        return 0
    fi

    # Start all services simultaneously
    for service in "${services[@]}"; do
        docker compose up -d "$service" >/dev/null 2>&1 &
    done
    wait

    # Wait for all to become healthy
    local all_healthy=true
    for service in "${services[@]}"; do
        local container="dive-spoke-${code_lower}-${service}"
        if ! orch_wait_healthy_with_retry "$container" 300 "$instance_code"; then
            all_healthy=false
        fi
    done

    [ "$all_healthy" = true ]
}

##
# Check if Hub is healthy and accessible
##
check_hub_healthy() {
    log_verbose "Checking Hub health..."

    if ! docker ps --filter "name=dive-hub-keycloak" --format '{{.Names}}' | grep -q "dive-hub-keycloak"; then
        log_error "Hub Keycloak not running"
        return 1
    fi

    local hub_health=$(docker inspect dive-hub-keycloak --format='{{.State.Health.Status}}' 2>/dev/null || echo "unknown")

    if [ "$hub_health" = "healthy" ]; then
        log_verbose "Hub Keycloak is healthy"
        return 0
    else
        log_warn "Hub Keycloak status: $hub_health"
        return 1
    fi
}

##
# Orchestrate complete spoke service startup with tiered parallel approach
#
# Arguments:
#   $1 - Instance code
#   $2 - Compose file path (optional)
##
orch_start_services_tiered() {
    local instance_code="$1"
    local compose_file="${2:-docker-compose.yml}"
    local code_lower=$(lower "$instance_code")

    log_step "Starting services with tiered parallel approach..."

    local instance_dir="${DIVE_ROOT}/instances/${code_lower}"
    cd "$instance_dir" || return 1

    local start_time=$(date +%s)

    # Tier 0: Base infrastructure
    log_info "TIER 0: Base Infrastructure"
    if ! orch_parallel_tier_startup 0 "$instance_code" postgres mongodb redis opa; then
        log_error "Tier 0 failed"
        return 1
    fi

    # Tier 1: Identity & policy
    log_info "TIER 1: Identity & Policy"
    if ! orch_parallel_tier_startup 1 "$instance_code" keycloak opal-client; then
        log_error "Tier 1 failed"
        return 1
    fi

    # Tier 2: Applications
    log_info "TIER 2: Applications"
    if ! orch_parallel_tier_startup 2 "$instance_code" backend kas; then
        log_error "Tier 2 failed"
        return 1
    fi

    # Tier 3: Frontend
    log_info "TIER 3: Frontend"
    docker compose up -d frontend >/dev/null 2>&1 || return 1
    if ! orch_wait_healthy_with_retry "dive-spoke-${code_lower}-frontend" 120 "$instance_code"; then
        log_error "Frontend failed"
        return 1
    fi

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    log_success "All services started and healthy (${duration}s)"

    cd - >/dev/null
    return 0
}

# =============================================================================
# FUNCTION EXPORTS FOR SUBSHELLS
# =============================================================================
# Export all public orchestration functions so they're available in background
# processes and subshells (e.g., parallel startup in hub_parallel_startup())

# Core dependency management functions (CRITICAL for parallel startup)
export -f orch_detect_circular_dependencies
export -f orch_get_max_dependency_level
export -f orch_get_services_at_level
export -f orch_calculate_dependency_level
export -f orch_print_dependency_graph

# Health check functions
export -f orch_check_service_health
export -f orch_get_service_health_details
export -f orch_get_health_check_dependencies
export -f orch_check_health_with_cascade

# Service startup functions
export -f orch_wait_for_dependencies
export -f orch_start_service
export -f orch_parallel_startup

# Lock management
export -f orch_acquire_deployment_lock
export -f orch_release_deployment_lock
export -f orch_with_deployment_lock

# Context and error handling
export -f orch_init_context
export -f orch_record_error
export -f orch_should_continue
export -f orch_generate_error_summary

# Circuit breaker functions
export -f orch_init_circuit_breaker
export -f orch_is_circuit_open
export -f orch_record_circuit_success
export -f orch_record_circuit_failure
export -f orch_execute_with_circuit_breaker

# Retry and timeout functions
export -f orch_execute_with_smart_retry
export -f orch_calculate_retry_delay
export -f orch_calculate_dynamic_timeout

# Checkpoint and rollback functions
export -f orch_create_checkpoint
export -f orch_checkpoint_containers
export -f orch_checkpoint_configuration
export -f orch_checkpoint_keycloak
export -f orch_checkpoint_federation
export -f orch_execute_rollback
export -f orch_find_latest_checkpoint
export -f orch_rollback_stop_services
export -f orch_rollback_configuration
export -f orch_rollback_containers
export -f orch_rollback_complete

# Metrics and monitoring functions
export -f orch_init_metrics
export -f orch_start_metrics_collection
export -f orch_collect_current_metrics
export -f orch_count_healthy_containers
export -f orch_get_instance_memory_usage
export -f orch_check_network_status
export -f orch_count_open_circuit_breakers
export -f orch_calculate_failure_probability
export -f orch_generate_dashboard
export -f orch_cleanup_old_data

# State management functions
export -f orch_validate_state_consistency
export -f orch_determine_actual_state

# Deployment execution functions
export -f orch_execute_phase
export -f orch_execute_deployment
export -f orch_phase_preflight
export -f orch_phase_initialization
export -f orch_phase_configuration
export -f orch_phase_verification
export -f orch_phase_completion

# Dependency validation functions (from orchestration-dependencies.sh)
export -f orch_validate_dependencies
export -f orch_wait_healthy_with_retry
export -f orch_parallel_tier_startup
export -f check_hub_healthy
export -f orch_start_services_tiered

