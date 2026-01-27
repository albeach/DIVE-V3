#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Orchestration Framework (Consolidated)
# =============================================================================
# Central orchestration with dependency management, health checks, and
# deployment coordination
# =============================================================================
# Version: 5.0.0 (Module Consolidation)
# Date: 2026-01-22
#
# Consolidates:
#   - orchestration-framework.sh (core orchestration logic)
#   - orchestration-dependencies.sh (dependency validation)
# =============================================================================

# Prevent multiple sourcing
[ -n "${DIVE_ORCHESTRATION_FRAMEWORK_LOADED:-}" ] && return 0
export DIVE_ORCHESTRATION_FRAMEWORK_LOADED=1

# =============================================================================
# LOAD DEPENDENCIES
# =============================================================================

ORCH_DIR="$(dirname "${BASH_SOURCE[0]}")"
MODULES_DIR="$(dirname "$ORCH_DIR")"

# Load core modules
if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "${MODULES_DIR}/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load error recovery for circuit breaker
if [ -f "${ORCH_DIR}/errors.sh" ]; then
    source "${ORCH_DIR}/errors.sh"
elif [ -f "${MODULES_DIR}/error-recovery.sh" ]; then
    source "${MODULES_DIR}/error-recovery.sh"
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

# =============================================================================
# DEPENDENCY CONFIGURATION
# =============================================================================

# Health check retry configuration
HEALTH_CHECK_RETRY_INTERVAL="${HEALTH_CHECK_RETRY_INTERVAL:-5}"
HEALTH_CHECK_MAX_CONSECUTIVE_FAILURES="${HEALTH_CHECK_MAX_CONSECUTIVE_FAILURES:-3}"
HEALTH_CHECK_REQUIRED_SUCCESSES="${HEALTH_CHECK_REQUIRED_SUCCESSES:-2}"

# Parallel startup configuration
PARALLEL_STARTUP_ENABLED="${PARALLEL_STARTUP_ENABLED:-true}"

# =============================================================================
# CIRCULAR DEPENDENCY DETECTION
# =============================================================================

##
# Check for cycle starting from a service
# Internal function for cycle detection
##
_orch_check_cycle() {
    local service="$1"
    local path="$2"

    # Check if service already in path (cycle)
    if [[ " $path " =~ " $service " ]]; then
        echo "$path $service" >&2
        return 1
    fi

    local deps="${SERVICE_DEPENDENCIES[$service]}"
    if [ "$deps" = "none" ] || [ -z "$deps" ]; then
        return 0
    fi

    IFS=',' read -ra DEP_ARRAY <<< "$deps"
    for dep in "${DEP_ARRAY[@]}"; do
        dep=$(echo "$dep" | xargs)
        _orch_check_cycle "$dep" "$path $service" || return 1
    done

    return 0
}

##
# Calculate dependency level for a service (for parallel startup)
##
orch_calculate_dependency_level() {
    local service="$1"
    local deps="${SERVICE_DEPENDENCIES[$service]}"

    if [ "$deps" = "none" ] || [ -z "$deps" ]; then
        echo 0
        return
    fi

    local max_level=0
    IFS=',' read -ra DEP_ARRAY <<< "$deps"
    for dep in "${DEP_ARRAY[@]}"; do
        dep=$(echo "$dep" | xargs)
        local dep_level=$(orch_calculate_dependency_level "$dep")
        [ $dep_level -ge $max_level ] && max_level=$((dep_level + 1))
    done

    echo $max_level
}

##
# Detect circular dependencies in service dependency graph
##
orch_detect_circular_dependencies() {
    log_verbose "Validating service dependency graph for circular dependencies..."

    local visited_services=""
    local cycles_found=0

    for service in "${!SERVICE_DEPENDENCIES[@]}"; do
        if [[ " $visited_services " =~ " $service " ]]; then
            continue
        fi

        local cycle_result
        cycle_result=$(_orch_check_cycle "$service" "" 2>&1)
        local cycle_exit=$?

        if [ $cycle_exit -ne 0 ]; then
            ((cycles_found++))
            log_error "Circular dependency detected: $cycle_result"
        fi

        visited_services="$visited_services $service"
    done

    if [ $cycles_found -gt 0 ]; then
        log_error "Found $cycles_found circular dependency chain(s)"
        return 1
    fi

    log_success "No circular dependencies found"
    return 0
}

# =============================================================================
# DEPENDENCY VALIDATION
# =============================================================================

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
    if [ "$code_upper" != "USA" ] && [ "$code_upper" != "HUB" ]; then
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

    # 5. Check mkcert
    if ! command -v mkcert >/dev/null 2>&1; then
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

# =============================================================================
# SMART HEALTH CHECK RETRY
# =============================================================================

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

# =============================================================================
# PARALLEL TIER STARTUP
# =============================================================================

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

# =============================================================================
# HUB HEALTH CHECK
# =============================================================================

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

# =============================================================================
# TIERED SERVICE STARTUP
# =============================================================================

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
# ERROR RECORDING
# =============================================================================

##
# Record orchestration error to database
#
# Arguments:
#   $1 - Instance code
#   $2 - Error code
#   $3 - Error message
#   $4 - Severity (1-4)
#   $5 - Context (optional JSON)
##
orch_record_error() {
    local instance_code="$1"
    local error_code="$2"
    local message="$3"
    local severity="${4:-3}"
    local context="${5:-{}}"

    if type orch_db_check_connection &>/dev/null && orch_db_check_connection; then
        orch_db_exec "
        INSERT INTO orchestration_errors (instance_code, error_code, message, severity, context)
        VALUES ('$(lower "$instance_code")', $error_code, '$message', $severity, '$context'::jsonb)
        " >/dev/null 2>&1 || true
    fi
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f orch_detect_circular_dependencies
export -f orch_calculate_dependency_level
export -f orch_validate_dependencies
export -f orch_wait_healthy_with_retry
export -f orch_parallel_tier_startup
export -f check_hub_healthy
export -f orch_start_services_tiered
export -f orch_record_error

log_verbose "Orchestration framework module loaded (consolidated)"
