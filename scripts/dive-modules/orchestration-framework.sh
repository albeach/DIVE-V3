#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Enterprise Orchestration Framework
# =============================================================================
# Fail-fast orchestration with intelligent error handling,
# service dependency management, and comprehensive observability
# =============================================================================

# Prevent multiple sourcing
if [ -n "$ORCHESTRATION_FRAMEWORK_LOADED" ]; then
    return 0
fi
export ORCHESTRATION_FRAMEWORK_LOADED=1

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load orchestration sub-modules (Phase 2 Enhancement)
ORCHESTRATION_DIR="$(dirname "${BASH_SOURCE[0]}")/orchestration"
if [ -f "${ORCHESTRATION_DIR}/errors.sh" ]; then
    source "${ORCHESTRATION_DIR}/errors.sh"
fi
if [ -f "${ORCHESTRATION_DIR}/circuit-breaker.sh" ]; then
    source "${ORCHESTRATION_DIR}/circuit-breaker.sh"
fi
if [ -f "${ORCHESTRATION_DIR}/metrics.sh" ]; then
    source "${ORCHESTRATION_DIR}/metrics.sh"
fi
if [ -f "${ORCHESTRATION_DIR}/locks.sh" ]; then
    source "${ORCHESTRATION_DIR}/locks.sh"
fi

# Load enhanced state management
if [ -f "$(dirname "${BASH_SOURCE[0]}")/orchestration-state-db.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/orchestration-state-db.sh"
fi

# Load deployment-state.sh for backward compatibility (deprecated)
if [ -f "$(dirname "${BASH_SOURCE[0]}")/deployment-state.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/deployment-state.sh"
fi

# Load error recovery module (for shared circuit breaker configuration)
if [ -f "$(dirname "${BASH_SOURCE[0]}")/error-recovery.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/error-recovery.sh"
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
orch_detect_circular_dependencies() {
    log_verbose "Validating service dependency graph for circular dependencies..."

    local visited_services=""
    local cycles_found=0

    for service in "${!SERVICE_DEPENDENCIES[@]}"; do
        # Check if already visited
        if [[ " $visited_services " =~ " $service " ]]; then
            continue
        fi

        # Check this service and its dependencies
        # Capture cycle path from stderr if cycle detected
        local cycle_result
        cycle_result=$(_orch_check_cycle "$service" "" 2>&1)
        local cycle_exit=$?

        if [ $cycle_exit -ne 0 ]; then
            # Cycle detected
            ((cycles_found++))
            log_error "❌ Circular dependency detected!"
            log_error "Dependency cycle: $cycle_result"

            # Parse and display the cycle clearly
            local cycle_services=($cycle_result)
            log_error ""
            log_error "  Cycle visualization:"
            local prev=""
            for svc in "${cycle_services[@]}"; do
                if [ -n "$prev" ]; then
                    log_error "    $prev → $svc"
                fi
                prev="$svc"
            done
            log_error ""
        fi

        # Mark as visited
        visited_services="$visited_services $service"
    done

    if [ $cycles_found -gt 0 ]; then
        log_error "Found $cycles_found circular dependency chain(s)"
        log_error "Please fix SERVICE_DEPENDENCIES in orchestration-framework.sh"
        return 1
    fi

    log_success "✅ No circular dependencies found in service dependency graph"
    return 0
}

##
# Print visual dependency graph
#
# Arguments:
#   $1 - Output format: "text" or "mermaid" (default: text)
##
orch_print_dependency_graph() {
    local format="${1:-text}"

    case "$format" in
        mermaid)
            echo "```mermaid"
            echo "graph TD"
            for service in "${!SERVICE_DEPENDENCIES[@]}"; do
                local deps="${SERVICE_DEPENDENCIES[$service]}"
                if [ "$deps" = "none" ] || [ -z "$deps" ]; then
                    echo "    ${service}[${service}]"
                else
                    IFS=',' read -ra DEP_ARRAY <<< "$deps"
                    for dep in "${DEP_ARRAY[@]}"; do
                        dep=$(echo "$dep" | xargs)
                        echo "    ${dep} --> ${service}"
                    done
                fi
            done
            echo "```"
            ;;
        text|*)
            echo "=== Service Dependency Graph ==="
            echo ""

            # Group by dependency level
            local max_level=0
            declare -A service_levels

            for service in "${!SERVICE_DEPENDENCIES[@]}"; do
                local level=$(orch_calculate_dependency_level "$service")
                service_levels["$service"]=$level
                [ $level -gt $max_level ] && max_level=$level
            done

            for ((lvl=0; lvl<=max_level; lvl++)); do
                echo "Level $lvl ($([ $lvl -eq 0 ] && echo "no dependencies" || echo "depends on level $((lvl-1))"))):"
                for service in "${!service_levels[@]}"; do
                    if [ "${service_levels[$service]}" -eq $lvl ]; then
                        local deps="${SERVICE_DEPENDENCIES[$service]}"
                        if [ "$deps" = "none" ] || [ -z "$deps" ]; then
                            echo "  • $service"
                        else
                            echo "  • $service ← [$deps]"
                        fi
                    fi
                done
                echo ""
            done
            ;;
    esac
}

##
# Get services at a specific dependency level
#
# Arguments:
#   $1 - Dependency level (0, 1, 2, ...)
#
# Returns:
#   Space-separated list of services at that level
##
orch_get_services_at_level() {
    local target_level="$1"
    local services=""

    for service in "${!SERVICE_DEPENDENCIES[@]}"; do
        local level=$(orch_calculate_dependency_level "$service")
        if [ "$level" -eq "$target_level" ]; then
            services="$services $service"
        fi
    done

    echo "$services" | xargs
}

##
# Get maximum dependency level in the graph
#
# Returns:
#   Maximum level number
##
orch_get_max_dependency_level() {
    local max_level=0

    for service in "${!SERVICE_DEPENDENCIES[@]}"; do
        local level=$(orch_calculate_dependency_level "$service")
        [ $level -gt $max_level ] && max_level=$level
    done

    echo $max_level
}

##
# Check for circular dependency (internal helper)
#
# Arguments:
#   $1 - Current service
#   $2 - Path so far (space-separated)
#
# Returns:
#   0 - No cycle
#   1 - Cycle detected (prints cycle path to stderr)
##
_orch_check_cycle() {
    local service="$1"
    local path="$2"

    # Check if service is in current path (cycle!)
    if [[ " $path " =~ " $service " ]]; then
        # Cycle detected - output the cycle path
        echo "$path $service" >&2
        return 1  # Cycle detected
    fi

    # Add to path
    local new_path="$path $service"

    # Get dependencies
    local deps="${SERVICE_DEPENDENCIES[$service]}"

    # Process dependencies
    if [ "$deps" != "none" ] && [ -n "$deps" ]; then
        IFS=',' read -ra DEP_ARRAY <<< "$deps"
        for dep in "${DEP_ARRAY[@]}"; do
            dep=$(echo "$dep" | xargs)  # Trim whitespace

            # Validate dependency exists
            if [ -z "${SERVICE_DEPENDENCIES[$dep]}" ]; then
                log_verbose "Service $service depends on undefined service: $dep (will be treated as leaf)"
                continue
            fi

            # Recurse - if returns 1 (cycle), propagate up
            if ! _orch_check_cycle "$dep" "$new_path"; then
                return 1  # Cycle found in recursion
            fi
        done
    fi

    return 0  # No cycle found
}

##
# Calculate dependency level for a service (for parallel startup)
#
# Arguments:
#   $1 - Service name
#
# Returns:
#   Dependency level (0 = no deps, 1 = depends on level 0, etc.)
##
orch_calculate_dependency_level() {
    local service="$1"
    _orch_calc_level "$service" ""
}

##
# Recursive dependency level calculation (internal helper)
#
# Arguments:
#   $1 - Service name
#   $2 - Already calculated levels (space-separated "service:level")
#
# Returns:
#   Dependency level (via echo)
##
_orch_calc_level() {
    local service="$1"
    local calculated="$2"

    # Check if already calculated
    for entry in $calculated; do
        local svc="${entry%%:*}"
        local lvl="${entry##*:}"
        if [ "$svc" = "$service" ]; then
            echo "$lvl"
            return 0
        fi
    done

    local deps="${SERVICE_DEPENDENCIES[$service]}"

    # No dependencies = level 0
    if [ "$deps" = "none" ] || [ -z "$deps" ]; then
        echo "0"
        return 0
    fi

    # Calculate max dependency level + 1
    local max_dep_level=0
    IFS=',' read -ra DEP_ARRAY <<< "$deps"
    for dep in "${DEP_ARRAY[@]}"; do
        dep=$(echo "$dep" | xargs)

        # Recurse to get dependency's level
        local dep_level=$(_orch_calc_level "$dep" "$calculated")
        calculated="$calculated $dep:$dep_level"

        if [ "$dep_level" -gt "$max_dep_level" ]; then
            max_dep_level=$dep_level
        fi
    done

    echo $((max_dep_level + 1))
}

# Service startup timeouts (seconds)
# Updated 2026-01-25: Migrated to config/deployment-timeouts.env (Phase 2)
# Values can be overridden via environment variables before deployment
# Rationale: Each timeout calculated as P99 startup time + safety margin
declare -A SERVICE_TIMEOUTS=(
    ["postgres"]="${TIMEOUT_POSTGRES:-60}"
    ["mongodb"]="${TIMEOUT_MONGODB:-90}"
    ["redis"]="${TIMEOUT_REDIS:-30}"
    ["redis-blacklist"]="${TIMEOUT_REDIS_BLACKLIST:-30}"
    ["keycloak"]="${TIMEOUT_KEYCLOAK:-180}"
    ["backend"]="${TIMEOUT_BACKEND:-120}"
    ["frontend"]="${TIMEOUT_FRONTEND:-90}"
    ["opa"]="${TIMEOUT_OPA:-30}"
    ["kas"]="${TIMEOUT_KAS:-60}"
    ["opal-client"]="${TIMEOUT_OPAL_CLIENT:-30}"
    ["opal-server"]="${TIMEOUT_OPAL_SERVER:-60}"
    ["opal-data-source"]="${TIMEOUT_OPAL_DATA_SOURCE:-30}"
    ["authzforce"]="${TIMEOUT_AUTHZFORCE:-90}"
    ["otel-collector"]="${TIMEOUT_OTEL_COLLECTOR:-30}"
    ["prometheus"]="${TIMEOUT_PROMETHEUS:-45}"
    ["grafana"]="${TIMEOUT_GRAFANA:-45}"
    ["loki"]="${TIMEOUT_LOKI:-45}"
    ["tempo"]="${TIMEOUT_TEMPO:-45}"
    ["nginx"]="${TIMEOUT_NGINX:-20}"
    ["cloudflared"]="${TIMEOUT_CLOUDFLARED:-30}"
)

# Timeout bounds for dynamic calculation (Phase 3 enhancement)
declare -A SERVICE_MIN_TIMEOUTS=(
    ["keycloak"]="${TIMEOUT_KEYCLOAK_MIN:-180}"
    ["backend"]="${TIMEOUT_BACKEND_MIN:-90}"
    ["frontend"]="${TIMEOUT_FRONTEND_MIN:-45}"
)

declare -A SERVICE_MAX_TIMEOUTS=(
    ["keycloak"]="${TIMEOUT_KEYCLOAK_MAX:-300}"
    ["backend"]="${TIMEOUT_BACKEND_MAX:-180}"
    ["frontend"]="${TIMEOUT_FRONTEND_MAX:-90}"
)

# =============================================================================
# ORCHESTRATION CONTEXT MANAGEMENT
# =============================================================================

# Global orchestration context
declare -A ORCH_CONTEXT=(
    ["instance_code"]=""
    ["instance_name"]=""
    ["start_time"]=""
    ["current_phase"]=""
    ["errors_critical"]=0
    ["errors_high"]=0
    ["errors_medium"]=0
    ["errors_low"]=0
    ["retry_count"]=0
    ["checkpoint_enabled"]=true
    ["lock_acquired"]=false
    ["lock_fd"]=0
)

# Error tracking
declare -a ORCHESTRATION_ERRORS=()

# =============================================================================
# CONCURRENT DEPLOYMENT PROTECTION (GAP-001 Fix - PostgreSQL Only)
# =============================================================================
# Uses PostgreSQL advisory locks exclusively to prevent concurrent deployments
# of the same instance from corrupting state.
#
# NOTE (2026-01-22): File-based locking has been REMOVED as part of the
# database-only state management refactoring. PostgreSQL advisory locks
# are now the SOLE locking mechanism.
#
# For Hub (USA) deployments where the database doesn't exist yet:
# - Lock is skipped (Hub creates the database)
# - Concurrent Hub deployments are prevented by Docker container names
# =============================================================================

##
# Acquire deployment lock for instance (PostgreSQL advisory lock only)
#
# Arguments:
#   $1 - Instance code
#   $2 - Timeout seconds (optional, default: 30)
#
# Returns:
#   0 - Lock acquired
#   1 - Lock acquisition failed (another deployment in progress)
##
orch_acquire_deployment_lock() {
    local instance_code="$1"
    local timeout="${2:-30}"
    local code_upper=$(upper "$instance_code")

    log_verbose "Attempting to acquire deployment lock for $instance_code (timeout: ${timeout}s)..."

    # SPECIAL CASE: Hub (USA) deployment
    # Hub creates the orchestration database, so it can't use database locking initially
    if [ "$code_upper" = "USA" ]; then
        if ! type -t orch_db_check_connection >/dev/null 2>&1 || ! orch_db_check_connection; then
            log_verbose "Hub deployment - database not yet available, skipping database lock"
            ORCH_CONTEXT["lock_acquired"]=true
            ORCH_CONTEXT["lock_type"]="hub-bootstrap"
            log_success "Deployment lock acquired for $instance_code (hub-bootstrap mode)"
            return 0
        fi
    fi

    # PostgreSQL advisory locking (MANDATORY for non-Hub instances)
    if type -t orch_db_acquire_lock >/dev/null 2>&1; then
        if orch_db_acquire_lock "$instance_code" "$timeout"; then
            ORCH_CONTEXT["lock_acquired"]=true
            ORCH_CONTEXT["lock_type"]="database"
            log_success "Deployment lock acquired for $instance_code (PostgreSQL advisory lock)"
            return 0
        else
            # Database locking failed - fail fast, no file-based fallback
            if orch_db_check_connection 2>/dev/null; then
                log_error "Failed to acquire deployment lock for $instance_code (timeout)"
                # Show current database lock holder
                local db_locks=$(docker exec dive-hub-postgres psql -U postgres -d orchestration -t -c "SELECT instance_code, acquired_at, acquired_by FROM deployment_locks WHERE instance_code = '$(lower "$instance_code")';" 2>/dev/null | head -1)
                if [ -n "$db_locks" ]; then
                    log_error "Current lock holder:"
                    echo "$db_locks" | tr '|' '\n' | xargs -I {} echo "  {}"
                fi
                log_error ""
                log_error "To force-release the lock (if deployment crashed):"
                log_error "  ./dive spoke clean-locks $instance_code"
                return 1
            else
                log_error "FATAL: Orchestration database unavailable"
                log_error "  → Deployment cannot proceed without database"
                log_error "  → Ensure Hub is running: ./dive hub up"
                return 1
            fi
        fi
    else
        log_error "FATAL: Database locking function not available"
        log_error "  → Source orchestration-state-db.sh first"
        return 1
    fi
}

##
# Release deployment lock for instance (PostgreSQL advisory lock only)
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Lock released
#   1 - Lock was not acquired
##
orch_release_deployment_lock() {
    local instance_code="$1"

    if [ "${ORCH_CONTEXT["lock_acquired"]}" != "true" ]; then
        log_verbose "No lock to release for $instance_code"
        return 1
    fi

    log_verbose "Releasing deployment lock for $instance_code..."

    local lock_type="${ORCH_CONTEXT["lock_type"]:-database}"

    # Release PostgreSQL advisory lock
    if [ "$lock_type" = "database" ]; then
        if type -t orch_db_release_lock >/dev/null 2>&1; then
            orch_db_release_lock "$instance_code" 2>/dev/null || true
        fi
    fi
    # hub-bootstrap mode doesn't have a lock to release

    # Reset context
    ORCH_CONTEXT["lock_acquired"]=false
    ORCH_CONTEXT["lock_type"]=""

    log_success "Deployment lock released for $instance_code"
    return 0
}

##
# Execute function with deployment lock protection (PostgreSQL advisory lock)
#
# Arguments:
#   $1 - Instance code
#   $2 - Function to execute
#   $@ - Arguments to pass to function
#
# Returns:
#   Function exit code
##
orch_with_deployment_lock() {
    local instance_code="$1"
    local func="$2"
    shift 2
    local func_args=("$@")

    # Acquire PostgreSQL advisory lock
    if ! orch_acquire_deployment_lock "$instance_code"; then
        orch_record_error "LOCK_ACQUISITION_FAILED" \
            "$ORCH_SEVERITY_CRITICAL" \
            "Could not acquire deployment lock for $instance_code" \
            "deployment-lock" \
            "Wait for current deployment to complete or run: ./dive spoke clean-locks $instance_code" \
            "{\"instance_code\":\"$instance_code\"}"
        return 1
    fi

    # Set up cleanup trap
    trap "orch_release_deployment_lock '$instance_code'" EXIT ERR INT TERM

    # Execute function
    local exit_code=0
    $func "${func_args[@]}" || exit_code=$?

    # Release lock
    orch_release_deployment_lock "$instance_code"

    # Clear trap
    trap - EXIT ERR INT TERM

    return $exit_code
}

##
# Initialize orchestration context
#
# Arguments:
#   $1 - Instance code
#   $2 - Instance name
##
orch_init_context() {
    local instance_code="$1"
    local instance_name="$2"

    ORCH_CONTEXT["instance_code"]="$instance_code"
    ORCH_CONTEXT["instance_name"]="$instance_name"
    ORCH_CONTEXT["start_time"]=$(date +%s)
    ORCH_CONTEXT["current_phase"]="$PHASE_PREFLIGHT"
    ORCH_CONTEXT["errors_critical"]=0
    ORCH_CONTEXT["errors_high"]=0
    ORCH_CONTEXT["errors_medium"]=0
    ORCH_CONTEXT["errors_low"]=0
    ORCH_CONTEXT["retry_count"]=0
    ORCH_CONTEXT["checkpoint_enabled"]=true

    ORCHESTRATION_ERRORS=()

    log_info "Initialized orchestration context for $instance_code"
}

##
# Record orchestration error with severity and remediation
#
# Arguments:
#   $1 - Error code
#   $2 - Severity level
#   $3 - Error message
#   $4 - Component
#   $5 - Remediation action
#   $6 - Additional context JSON
##
orch_record_error() {
    local error_code="$1"
    local severity="$2"
    local message="$3"
    local component="$4"
    local remediation="${5:-}"
    local context="${6:-}"

    local timestamp=$(date +%s)
    local error_record="$timestamp|$error_code|$severity|$component|$message|$remediation|$context"

    ORCHESTRATION_ERRORS+=("$error_record")

    # Update error counters
    case "$severity" in
        $ORCH_SEVERITY_CRITICAL)
            ((ORCH_CONTEXT["errors_critical"]++))
            ;;
        $ORCH_SEVERITY_HIGH)
            ((ORCH_CONTEXT["errors_high"]++))
            ;;
        $ORCH_SEVERITY_MEDIUM)
            ((ORCH_CONTEXT["errors_medium"]++))
            ;;
        $ORCH_SEVERITY_LOW)
            ((ORCH_CONTEXT["errors_low"]++))
            ;;
    esac

    # Log based on severity
    case "$severity" in
        $ORCH_SEVERITY_CRITICAL)
            log_error "CRITICAL [$component]: $message"
            [ -n "$remediation" ] && log_error "REMEDIATION: $remediation"
            ;;
        $ORCH_SEVERITY_HIGH)
            log_error "HIGH PRIORITY [$component]: $message"
            [ -n "$remediation" ] && log_error "REMEDIATION: $remediation"
            ;;
        $ORCH_SEVERITY_MEDIUM)
            log_warn "MEDIUM PRIORITY [$component]: $message"
            [ -n "$remediation" ] && log_info "NOTE: $remediation"
            ;;
        $ORCH_SEVERITY_LOW)
            log_info "NOTICE [$component]: $message"
            ;;
    esac
}

##
# Check if orchestration should continue based on error state
#
# Returns:
#   0 - Continue orchestration
#   1 - Stop due to critical errors
#   2 - Stop due to too many high-priority errors
##
orch_should_continue() {
    local max_critical="${MAX_CRITICAL_ERRORS:-0}"
    local max_high="${MAX_HIGH_ERRORS:-3}"

    # Always stop on critical errors
    if [ "${ORCH_CONTEXT["errors_critical"]}" -gt "$max_critical" ]; then
        log_error "Stopping orchestration due to ${ORCH_CONTEXT["errors_critical"]} critical errors"
        return 1
    fi

    # Stop on too many high-priority errors
    if [ "${ORCH_CONTEXT["errors_high"]}" -gt "$max_high" ]; then
        log_error "Stopping orchestration due to ${ORCH_CONTEXT["errors_high"]} high-priority errors"
        return 2
    fi

    return 0
}

##
# Generate orchestration error summary
#
# Arguments:
#   $1 - Instance code
##
orch_generate_error_summary() {
    local instance_code="$1"
    local error_log="${DIVE_ROOT}/logs/orchestration-errors-${instance_code}-$(date +%Y%m%d-%H%M%S).log"

    {
        echo "=== DIVE V3 Orchestration Error Summary ==="
        echo "Instance: $instance_code"
        echo "Timestamp: $(date)"
        echo "Duration: $(($(date +%s) - ORCH_CONTEXT["start_time"])) seconds"
        echo "Current Phase: ${ORCH_CONTEXT["current_phase"]}"
        echo ""
        echo "Error Counts:"
        echo "  Critical: ${ORCH_CONTEXT["errors_critical"]}"
        echo "  High: ${ORCH_CONTEXT["errors_high"]}"
        echo "  Medium: ${ORCH_CONTEXT["errors_medium"]}"
        echo "  Low: ${ORCH_CONTEXT["errors_low"]}"
        echo ""
        echo "Error Details (timestamp|code|severity|component|message|remediation|context):"
        printf '%s\n' "${ORCHESTRATION_ERRORS[@]}"
        echo ""
        echo "=== End Error Summary ==="
    } > "$error_log"

    if [ "${#ORCHESTRATION_ERRORS[@]}" -gt 0 ]; then
        log_info "Orchestration error summary saved to: $error_log"
    fi
}

# =============================================================================
# SERVICE HEALTH MANAGEMENT (GAP-007 Fix - Standardized Health Checks)
# =============================================================================

# Service health URL registry
declare -A SERVICE_HEALTH_URLS=(
    ["keycloak"]="/health"
    ["backend"]="/health"
    ["frontend"]="/"
    ["opa"]="/health"
    ["opal-server"]="/healthcheck"
    ["opal-client"]="/ready"
    ["kas"]="/health"
)

# Service health port configuration
declare -A SERVICE_HEALTH_PORTS=(
    ["keycloak"]="8443"
    ["backend"]="4000"
    ["frontend"]="3000"
    ["opa"]="8181"
    ["opal-server"]="7002"
    ["opal-client"]="7000"
    ["kas"]="8080"
)

##
# Standardized health check with multi-level validation
#
# Arguments:
#   $1 - Instance code (lowercase)
#   $2 - Service name
#   $3 - Timeout seconds (optional, uses SERVICE_TIMEOUTS default)
#
# Returns:
#   0 - Service is healthy
#   1 - Service failed health check
#
# Outputs:
#   JSON health status to stderr (for logging)
##
orch_check_service_health() {
    local instance_code="$1"
    local service="$2"
    local timeout="${3:-${SERVICE_TIMEOUTS[$service]}}"
    local code_lower="$instance_code"

    local container_name="dive-spoke-${code_lower}-${service}"
    local start_time=$(date +%s)
    local elapsed=0

    log_verbose "Checking health of $container_name (timeout: ${timeout}s)"

    while [ $elapsed -lt "$timeout" ]; do
        # Level 1: Container exists
        if ! docker ps --format '{{.Names}}' | grep -q "^${container_name}$"; then
            sleep 2
            elapsed=$((elapsed + 2))
            continue
        fi

        # Level 2: Docker health status
        local health_status
        health_status=$(docker inspect --format='{{.State.Health.Status}}' "$container_name" 2>/dev/null || echo "none")

        case "$health_status" in
            healthy)
                # Docker health check passed
                local total_time=$(( $(date +%s) - start_time ))
                log_verbose "Service $service healthy after ${total_time}s (Docker health check)"

                # Record metric
                orch_db_record_metric "$instance_code" "service_startup_time" "$total_time" "seconds" \
                    "{\"service\":\"$service\",\"health_check\":\"docker\"}" 2>/dev/null || true

                return 0
                ;;
            unhealthy)
                # Docker health check explicitly failed
                log_warn "Service $service reported unhealthy (Docker health check)"
                return 1
                ;;
            starting)
                # Still starting, continue waiting
                sleep 2
                elapsed=$((elapsed + 2))
                continue
                ;;
            none)
                # No Docker health check, try HTTP health endpoint
                local health_url="${SERVICE_HEALTH_URLS[$service]}"
                local health_port="${SERVICE_HEALTH_PORTS[$service]}"

                if [ -n "$health_url" ] && [ -n "$health_port" ]; then
                    # Level 3: HTTP health endpoint
                    local health_endpoint="http://localhost:${health_port}${health_url}"

                    if curl -kfs --max-time 3 "$health_endpoint" >/dev/null 2>&1; then
                        local total_time=$(( $(date +%s) - start_time ))
                        log_verbose "Service $service healthy after ${total_time}s (HTTP health check)"

                        # Record metric
                        orch_db_record_metric "$instance_code" "service_startup_time" "$total_time" "seconds" \
                            "{\"service\":\"$service\",\"health_check\":\"http\"}" 2>/dev/null || true

                        return 0
                    fi
                fi

                # Level 4: Fallback - check if container is running
                local container_status
                container_status=$(docker inspect --format='{{.State.Status}}' "$container_name" 2>/dev/null || echo "missing")

                if [ "$container_status" = "running" ]; then
                    local total_time=$(( $(date +%s) - start_time ))
                    log_verbose "Service $service running after ${total_time}s (no health check available)"

                    # Record metric with warning flag
                    orch_db_record_metric "$instance_code" "service_startup_time" "$total_time" "seconds" \
                        "{\"service\":\"$service\",\"health_check\":\"none\",\"warning\":\"no_health_check_defined\"}" 2>/dev/null || true

                    return 0
                fi
                ;;
        esac

        sleep 2
        elapsed=$((elapsed + 2))
    done

    # Timeout reached
    log_error "Service $service failed to become healthy within ${timeout}s"

    # Record failure metric
    orch_db_record_metric "$instance_code" "service_startup_timeout" "1" "count" \
        "{\"service\":\"$service\",\"timeout_seconds\":$timeout}" 2>/dev/null || true

    return 1
}

##
# Get detailed health status for service (JSON output)
#
# Arguments:
#   $1 - Instance code (lowercase)
#   $2 - Service name
#
# Returns:
#   JSON health status object
##
orch_get_service_health_details() {
    local instance_code="$1"
    local service="$2"
    local container_name="dive-spoke-${instance_code}-${service}"

    # Check container exists
    if ! docker ps --format '{{.Names}}' | grep -q "^${container_name}$"; then
        echo '{"status": "MISSING", "healthy": false, "message": "Container not found"}'
        return 1
    fi

    # Get container details
    local container_status=$(docker inspect --format='{{.State.Status}}' "$container_name" 2>/dev/null || echo "unknown")
    local health_status=$(docker inspect --format='{{.State.Health.Status}}' "$container_name" 2>/dev/null || echo "none")
    local started_at=$(docker inspect --format='{{.State.StartedAt}}' "$container_name" 2>/dev/null || echo "unknown")

    # Try HTTP health check if available
    local http_healthy="null"
    local http_status="null"
    local health_url="${SERVICE_HEALTH_URLS[$service]}"
    local health_port="${SERVICE_HEALTH_PORTS[$service]}"

    if [ -n "$health_url" ] && [ -n "$health_port" ]; then
        local health_endpoint="http://localhost:${health_port}${health_url}"
        local http_response=$(curl -kfs --max-time 3 -w "\n%{http_code}" "$health_endpoint" 2>/dev/null || echo "")
        http_status=$(echo "$http_response" | tail -1)

        if [ "$http_status" = "200" ]; then
            http_healthy="true"
        else
            http_healthy="false"
        fi
    fi

    # Determine overall health
    local overall_healthy="false"
    local overall_status="UNHEALTHY"

    if [ "$health_status" = "healthy" ] || [ "$http_healthy" = "true" ]; then
        overall_healthy="true"
        overall_status="HEALTHY"
    elif [ "$health_status" = "starting" ]; then
        overall_status="STARTING"
    elif [ "$container_status" = "running" ] && [ "$health_status" = "none" ]; then
        overall_healthy="true"
        overall_status="RUNNING_NO_HEALTH_CHECK"
    fi

    # Generate JSON
    cat <<EOF
{
    "service": "$service",
    "instance_code": "$instance_code",
    "container": "$container_name",
    "status": "$overall_status",
    "healthy": $overall_healthy,
    "container_status": "$container_status",
    "docker_health": "$health_status",
    "http_health": $http_healthy,
    "http_status": $http_status,
    "started_at": "$started_at",
    "checked_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
}

##
# Wait for service dependencies to be healthy
#
# Arguments:
#   $1 - Instance code (lowercase)
#   $2 - Service name
#
# Returns:
#   0 - All dependencies healthy
#   1 - Dependency failure
##
orch_wait_for_dependencies() {
    local instance_code="$1"
    local service="$2"
    local dependencies="${SERVICE_DEPENDENCIES[$service]}"

    if [ "$dependencies" = "none" ] || [ -z "$dependencies" ]; then
        return 0
    fi

    log_verbose "Waiting for dependencies of $service: $dependencies"

    # Split dependencies by comma
    IFS=',' read -ra DEP_ARRAY <<< "$dependencies"

    for dep in "${DEP_ARRAY[@]}"; do
        dep=$(echo "$dep" | xargs)  # Trim whitespace

        if ! orch_check_service_health "$instance_code" "$dep"; then
            orch_record_error "DEP_$(echo "$dep" | tr '[:lower:]' '[:upper:]')_FAIL" \
                "$ORCH_SEVERITY_HIGH" \
                "Dependency $dep failed health check" \
                "dependencies" \
                "Check $dep service logs and configuration" \
                "{\"service\":\"$service\",\"dependency\":\"$dep\"}"
            return 1
        fi
    done

    return 0
}

##
# Orchestrated service startup with dependency management
#
# Arguments:
#   $1 - Instance code (lowercase)
#   $2 - Service name
#
# Returns:
#   0 - Service started successfully
#   1 - Service startup failed
##
orch_start_service() {
    local instance_code="$1"
    local service="$2"

    log_info "Starting service: $service"

    # Wait for dependencies first
    if ! orch_wait_for_dependencies "$instance_code" "$service"; then
        orch_record_error "DEP_WAIT_FAIL" \
            "$ORCH_SEVERITY_HIGH" \
            "Failed waiting for dependencies of $service" \
            "orchestration" \
            "Check dependency services and restart sequence"
        return 1
    fi

    # Start the service (this would integrate with existing docker-compose logic)
    log_verbose "Service $service dependencies satisfied, starting..."

    # Check service health after startup
    if ! orch_check_service_health "$instance_code" "$service"; then
        orch_record_error "STARTUP_FAIL" \
            "$ORCH_SEVERITY_HIGH" \
            "Service $service failed to start properly" \
            "startup" \
            "Check service logs: docker logs dive-spoke-${instance_code}-$service"
        return 1
    fi

    log_success "Service $service started and healthy"
    return 0
}

# =============================================================================
# SMART RETRY & CIRCUIT BREAKER PATTERNS (Phase 3)
# =============================================================================

# Circuit breaker states (only set if not already defined by error-recovery.sh)
if [ -z "$CIRCUIT_CLOSED" ]; then
    readonly CIRCUIT_CLOSED="CLOSED"      # Normal operation, requests pass through
    readonly CIRCUIT_OPEN="OPEN"         # Failing, requests fail immediately
    readonly CIRCUIT_HALF_OPEN="HALF_OPEN" # Testing if service recovered
fi

# Circuit breaker configuration
declare -A CIRCUIT_BREAKERS=()
declare -A CIRCUIT_FAILURE_COUNTS=()
declare -A CIRCUIT_LAST_FAILURE_TIME=()
declare -A CIRCUIT_SUCCESS_COUNTS=()

# Circuit breaker defaults (NOTE: Authoritative values now in error-recovery.sh)
# Using fallback values here for backward compatibility if error-recovery.sh not loaded
CIRCUIT_FAILURE_THRESHOLD="${CIRCUIT_FAILURE_THRESHOLD:-3}"     # Open circuit after N failures
CIRCUIT_TIMEOUT_SECONDS="${CIRCUIT_TIMEOUT_SECONDS:-60}"        # Auto-close after N seconds
CIRCUIT_SUCCESS_THRESHOLD="${CIRCUIT_SUCCESS_THRESHOLD:-2}"     # Close circuit after N successes in half-open

##
# Initialize circuit breaker for an operation
#
# Arguments:
#   $1 - Operation name (e.g., "keycloak_health", "federation_config")
##
orch_init_circuit_breaker() {
    local operation="$1"

    CIRCUIT_BREAKERS["$operation"]="$CIRCUIT_CLOSED"
    CIRCUIT_FAILURE_COUNTS["$operation"]=0
    CIRCUIT_LAST_FAILURE_TIME["$operation"]=0
    CIRCUIT_SUCCESS_COUNTS["$operation"]=0

    log_verbose "Initialized circuit breaker for $operation"
}

##
# Check if circuit breaker is open
#
# Arguments:
#   $1 - Operation name
#
# Returns:
#   0 - Circuit is closed (allow operation)
#   1 - Circuit is open (fail fast)
##
orch_is_circuit_open() {
    local operation="$1"

    # Initialize if not exists
    if [ -z "${CIRCUIT_BREAKERS[$operation]}" ]; then
        orch_init_circuit_breaker "$operation"
    fi

    local state="${CIRCUIT_BREAKERS[$operation]}"
    local last_failure="${CIRCUIT_LAST_FAILURE_TIME[$operation]}"
    local now=$(date +%s)

    case "$state" in
        "$CIRCUIT_OPEN")
            # Check if timeout has elapsed (auto-transition to half-open)
            if [ $((now - last_failure)) -gt $CIRCUIT_TIMEOUT_SECONDS ]; then
                CIRCUIT_BREAKERS["$operation"]="$CIRCUIT_HALF_OPEN"
                CIRCUIT_SUCCESS_COUNTS["$operation"]=0
                log_info "Circuit breaker for $operation transitioning to HALF_OPEN (timeout)"
                return 0  # Allow one test request
            else
                log_warn "Circuit breaker for $operation is OPEN (fail fast)"
                return 1  # Fail fast
            fi
            ;;
        "$CIRCUIT_HALF_OPEN")
            # In half-open, allow requests but monitor closely
            return 0
            ;;
        "$CIRCUIT_CLOSED"|*)
            return 0  # Allow operation
            ;;
    esac
}

##
# Record operation success for circuit breaker
#
# Arguments:
#   $1 - Operation name
##
orch_record_circuit_success() {
    local operation="$1"

    case "${CIRCUIT_BREAKERS[$operation]}" in
        "$CIRCUIT_HALF_OPEN")
            # In half-open state, count successes
            ((CIRCUIT_SUCCESS_COUNTS["$operation"]++))
            if [ "${CIRCUIT_SUCCESS_COUNTS[$operation]}" -ge $CIRCUIT_SUCCESS_THRESHOLD ]; then
                CIRCUIT_BREAKERS["$operation"]="$CIRCUIT_CLOSED"
                CIRCUIT_FAILURE_COUNTS["$operation"]=0
                log_success "Circuit breaker for $operation closed (recovery confirmed)"
            fi
            ;;
        "$CIRCUIT_CLOSED")
            # Reset failure count on success
            CIRCUIT_FAILURE_COUNTS["$operation"]=0
            ;;
    esac
}

##
# Record operation failure for circuit breaker
#
# Arguments:
#   $1 - Operation name
##
orch_record_circuit_failure() {
    local operation="$1"

    CIRCUIT_LAST_FAILURE_TIME["$operation"]=$(date +%s)

    case "${CIRCUIT_BREAKERS[$operation]}" in
        "$CIRCUIT_HALF_OPEN")
            # Half-open failure -> immediately open
            CIRCUIT_BREAKERS["$operation"]="$CIRCUIT_OPEN"
            CIRCUIT_SUCCESS_COUNTS["$operation"]=0
            log_error "Circuit breaker for $operation opened (half-open failure)"
            ;;
        "$CIRCUIT_CLOSED")
            # Closed failure -> increment counter
            ((CIRCUIT_FAILURE_COUNTS["$operation"]++))
            if [ "${CIRCUIT_FAILURE_COUNTS[$operation]}" -ge $CIRCUIT_FAILURE_THRESHOLD ]; then
                CIRCUIT_BREAKERS["$operation"]="$CIRCUIT_OPEN"
                log_error "Circuit breaker for $operation opened (failure threshold exceeded)"
            fi
            ;;
    esac
}

##
# Execute operation with circuit breaker protection
#
# Arguments:
#   $1 - Operation name
#   $2 - Operation command/function
#
# Returns:
#   Operation exit code
##
orch_execute_with_circuit_breaker() {
    local operation="$1"
    local operation_cmd="$2"

    # Check circuit breaker
    if ! orch_is_circuit_open "$operation"; then
        orch_record_error "CIRCUIT_OPEN" "$ORCH_SEVERITY_HIGH" \
            "Circuit breaker is open for $operation" "circuit_breaker" \
            "Operation will fail fast until circuit closes" \
            "{\"operation\":\"$operation\",\"state\":\"${CIRCUIT_BREAKERS[$operation]}\"}"
        return 1
    fi

    # Execute operation
    if $operation_cmd; then
        orch_record_circuit_success "$operation"
        return 0
    else
        orch_record_circuit_failure "$operation"
        return 1
    fi
}

##
# Smart retry with context-aware backoff strategies
#
# Arguments:
#   $1 - Operation name
#   $2 - Operation command/function
#   $3 - Max attempts (optional, default: 3)
#   $4 - Base delay seconds (optional, default: 5)
#
# Returns:
#   Operation exit code
##
orch_execute_with_smart_retry() {
    local operation="$1"
    local operation_cmd="$2"
    local max_attempts="${3:-3}"
    local base_delay="${4:-5}"

    local attempt=1
    local last_exit_code=1

    while [ $attempt -le $max_attempts ]; do
        log_verbose "Smart retry attempt $attempt/$max_attempts for $operation"

        # Use circuit breaker protection
        if orch_execute_with_circuit_breaker "$operation" "$operation_cmd"; then
            log_verbose "Operation $operation succeeded on attempt $attempt"
            return 0
        fi

        last_exit_code=$?
        attempt=$((attempt + 1))

        if [ $attempt -le $max_attempts ]; then
            # Calculate context-aware delay
            local delay=$(orch_calculate_retry_delay "$operation" $attempt $base_delay)

            log_warn "Operation $operation failed (attempt $((attempt-1))), retrying in ${delay}s..."
            sleep $delay
        fi
    done

    log_error "Operation $operation failed after $max_attempts attempts"
    return $last_exit_code
}

##
# Calculate context-aware retry delay
#
# Arguments:
#   $1 - Operation name
#   $2 - Attempt number
#   $3 - Base delay
#
# Returns:
#   Delay in seconds
##
orch_calculate_retry_delay() {
    local operation="$1"
    local attempt="$2"
    local base_delay="$3"

    # Context-aware delay calculation
    case "$operation" in
        *keycloak*)
            # Keycloak operations: progressive backoff (takes time to start)
            echo $((base_delay * attempt + (attempt * attempt * 2)))
            ;;
        *federation*)
            # Federation operations: fixed delay with jitter (usually permanent failures)
            echo $((base_delay + (RANDOM % 5)))
            ;;
        *secret*)
            # Secret operations: exponential backoff with jitter (GCP may be transient)
            echo $((base_delay * (2 ** (attempt - 1)) + (RANDOM % 3)))
            ;;
        *health*)
            # Health checks: linear backoff (services need time to stabilize)
            echo $((base_delay * attempt))
            ;;
        *)
    # Default: exponential backoff
    echo $((base_delay * (2 ** (attempt - 1))))
    ;;
    esac
}

##
# Calculate dynamic timeout based on historical startup times
# GAP-SD-002 Fix: Now integrated into health check flow
#
# Arguments:
#   $1 - Service name
#   $2 - Instance code (optional)
#   $3 - Force recalculation (optional, default: false)
#
# Returns:
#   Dynamic timeout in seconds
##
orch_calculate_dynamic_timeout() {
    local service="$1"
    local instance_code="${2:-}"
    local force_recalc="${3:-false}"

    local static_timeout="${SERVICE_TIMEOUTS[$service]:-60}"

    # Check if database is available for metrics
    if ! orch_db_check_connection 2>/dev/null; then
        log_verbose "Dynamic timeout: Database unavailable, using static timeout (${static_timeout}s) for $service"
        echo "$static_timeout"
        return 0
    fi

    # Query P95 startup time from deployment steps
    local p95_startup=0
    local sample_count=0

    if [ -n "$instance_code" ]; then
        # Instance-specific query
        local result
        result=$(orch_db_exec "
            SELECT
                COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_seconds), 0)::INTEGER as p95,
                COUNT(*) as samples
            FROM deployment_steps
            WHERE step_name = 'start_${service}'
            AND instance_code = '$(lower "$instance_code")'
            AND status = 'COMPLETED'
            AND started_at > NOW() - INTERVAL '30 days'
        " 2>/dev/null | tail -n 1)

        p95_startup=$(echo "$result" | cut -d'|' -f1 | xargs)
        sample_count=$(echo "$result" | cut -d'|' -f2 | xargs)
    else
        # Global query across all instances
        local result
        result=$(orch_db_exec "
            SELECT
                COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_seconds), 0)::INTEGER as p95,
                COUNT(*) as samples
            FROM deployment_steps
            WHERE step_name = 'start_${service}'
            AND status = 'COMPLETED'
            AND started_at > NOW() - INTERVAL '30 days'
        " 2>/dev/null | tail -n 1)

        p95_startup=$(echo "$result" | cut -d'|' -f1 | xargs)
        sample_count=$(echo "$result" | cut -d'|' -f2 | xargs)
    fi

    # Need at least 3 samples for confidence
    if [ "${p95_startup:-0}" -eq 0 ] || [ "${sample_count:-0}" -lt 3 ]; then
        log_verbose "Dynamic timeout: Insufficient data ($sample_count samples), using static timeout (${static_timeout}s) for $service"
        echo "$static_timeout"
        return 0
    fi

    # Calculate dynamic timeout = P95 + 50% margin
    local dynamic_timeout=$((p95_startup + (p95_startup * 50 / 100)))

    # Clamp to min/max bounds
    local min_timeout=${SERVICE_MIN_TIMEOUTS[$service]:-30}
    local max_timeout=${SERVICE_MAX_TIMEOUTS[$service]:-300}

    if [ "$dynamic_timeout" -lt "$min_timeout" ]; then
        log_verbose "Dynamic timeout: Clamped to min (${min_timeout}s) for $service (calculated: ${dynamic_timeout}s)"
        echo "$min_timeout"
    elif [ "$dynamic_timeout" -gt "$max_timeout" ]; then
        log_verbose "Dynamic timeout: Clamped to max (${max_timeout}s) for $service (calculated: ${dynamic_timeout}s)"
        echo "$max_timeout"
    else
        log_verbose "Dynamic timeout: Using calculated value (${dynamic_timeout}s) for $service (P95: ${p95_startup}s, samples: $sample_count)"
        echo "$dynamic_timeout"
    fi
}

# =============================================================================
# PARALLEL SERVICE STARTUP (GAP-SD-001 Fix - Phase 4)
# =============================================================================
# Starts services in parallel within each dependency level
# Level 0 services (no deps) start first, then level 1, etc.
# =============================================================================

##
# Start all services for an instance using parallel startup by level
#
# Arguments:
#   $1 - Instance code
#   $2 - Services to start (space-separated, or "all" for all services)
#
# Returns:
#   0 - All services started successfully
#   1 - Some services failed to start
##
orch_parallel_startup() {
    local instance_code="$1"
    local services="${2:-all}"
    local code_lower=$(lower "$instance_code")

    log_info "Starting parallel service startup for $instance_code"

    # Validate no circular dependencies first
    if ! orch_detect_circular_dependencies; then
        log_error "Cannot proceed with parallel startup - circular dependencies detected"
        return 1
    fi

    local max_level=$(orch_get_max_dependency_level)
    local total_started=0
    local total_failed=0

    log_verbose "Service graph has $((max_level + 1)) dependency levels"

    # Start services level by level
    for ((level=0; level<=max_level; level++)); do
        local level_services=$(orch_get_services_at_level $level)

        if [ -z "$level_services" ]; then
            continue
        fi

        log_info "Starting level $level services: $level_services"

        # Start all services at this level in parallel
        local pids=()
        local service_pid_map=""

        for service in $level_services; do
            # Skip if not in requested services list
            if [ "$services" != "all" ]; then
                if ! echo " $services " | grep -q " $service "; then
                    continue
                fi
            fi

            # Start service in background
            (
                local timeout=$(orch_calculate_dynamic_timeout "$service" "$instance_code")
                local container="dive-spoke-${code_lower}-${service}"

                # Check if already running
                if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
                    log_verbose "Service $service already running"
                    exit 0
                fi

                # Start service
                local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
                if [ -f "$spoke_dir/docker-compose.yml" ]; then
                    cd "$spoke_dir"
                    export COMPOSE_PROJECT_NAME="dive-spoke-${code_lower}"
                    docker compose up -d "$service" >/dev/null 2>&1
                fi

                # Wait for health
                if orch_check_service_health "$instance_code" "$service" "$timeout"; then
                    exit 0
                else
                    exit 1
                fi
            ) &

            local pid=$!
            pids+=($pid)
            service_pid_map="$service_pid_map $service:$pid"
        done

        # Wait for all services at this level
        local level_failed=0
        for pid in "${pids[@]}"; do
            if wait $pid; then
                ((total_started++))
            else
                ((total_failed++))
                ((level_failed++))

                # Find which service failed
                for mapping in $service_pid_map; do
                    local svc="${mapping%%:*}"
                    local spid="${mapping##*:}"
                    if [ "$spid" = "$pid" ]; then
                        log_error "Service $svc failed to start at level $level"
                    fi
                done
            fi
        done

        # If any service failed at this level, subsequent levels will likely fail
        if [ $level_failed -gt 0 ]; then
            log_warn "Level $level had $level_failed failures - subsequent services may fail"
        fi
    done

    # Summary
    log_info "Parallel startup complete: $total_started started, $total_failed failed"

    if [ $total_failed -gt 0 ]; then
        return 1
    fi
    return 0
}

##
# Get health check dependencies for cascade awareness
# Returns which services must be healthy before checking a given service
#
# Arguments:
#   $1 - Service name
#
# Returns:
#   Space-separated list of health check dependencies
##
orch_get_health_check_dependencies() {
    local service="$1"
    local deps="${SERVICE_DEPENDENCIES[$service]}"

    if [ "$deps" = "none" ] || [ -z "$deps" ]; then
        echo ""
        return 0
    fi

    # Convert comma-separated to space-separated
    echo "$deps" | tr ',' ' ' | xargs
}

##
# Check service health with cascade awareness
# Verifies dependencies are healthy before checking target service
#
# Arguments:
#   $1 - Instance code
#   $2 - Service name
#   $3 - Timeout (optional, uses dynamic calculation)
#   $4 - Skip dependency check (optional, default: false)
#
# Returns:
#   0 - Service is healthy
#   1 - Service or dependency unhealthy
##
orch_check_health_with_cascade() {
    local instance_code="$1"
    local service="$2"
    local timeout="${3:-}"
    local skip_deps="${4:-false}"

    # Get dynamic timeout if not specified
    if [ -z "$timeout" ]; then
        timeout=$(orch_calculate_dynamic_timeout "$service" "$instance_code")
    fi

    # Check dependencies first (cascade awareness)
    if [ "$skip_deps" != "true" ]; then
        local deps=$(orch_get_health_check_dependencies "$service")

        for dep in $deps; do
            log_verbose "Checking health cascade: $service depends on $dep"

            local dep_timeout=$(orch_calculate_dynamic_timeout "$dep" "$instance_code")
            if ! orch_check_service_health "$instance_code" "$dep" "$dep_timeout"; then
                log_error "Health cascade failed: $dep (dependency of $service) is unhealthy"
                return 1
            fi
        done
    fi

    # Now check the target service
    orch_check_service_health "$instance_code" "$service" "$timeout"
}

# =============================================================================
# AUTOMATIC ROLLBACK & CHECKPOINTING (Phase 3)
# =============================================================================

# Checkpoint levels
readonly CHECKPOINT_CONTAINER="CONTAINER"    # Container states only
readonly CHECKPOINT_CONFIG="CONFIG"          # Configuration files
readonly CHECKPOINT_KEYCLOAK="KEYCLOAK"     # Keycloak realm state
readonly CHECKPOINT_FEDERATION="FEDERATION"  # Federation configuration
readonly CHECKPOINT_COMPLETE="COMPLETE"     # Full system state

# Rollback strategies
readonly ROLLBACK_STOP="STOP"                # Stop services only
readonly ROLLBACK_CONFIG="CONFIG"            # Restore configuration
readonly ROLLBACK_CONTAINERS="CONTAINERS"    # Recreate containers
readonly ROLLBACK_COMPLETE="COMPLETE"        # Full rollback

# Checkpoint registry
declare -A CHECKPOINT_REGISTRY=()
declare -A CHECKPOINT_METADATA=()

##
# Create comprehensive deployment checkpoint
#
# Arguments:
#   $1 - Instance code
#   $2 - Checkpoint level (optional, default: COMPLETE)
#   $3 - Checkpoint description (optional)
#
# Returns:
#   Checkpoint ID on stdout
##
orch_create_checkpoint() {
    local instance_code="$1"
    local level="${2:-$CHECKPOINT_COMPLETE}"
    local description="${3:-Auto checkpoint}"

    # CRITICAL SIMPLIFICATION (2026-01-15): Database-only checkpoints
    # Root cause: Dual file/database system is flaky and causes issues
    # Previous: Created .dive-checkpoints/ files + database records
    # Fixed: Database ONLY - single source of truth
    #
    # Benefits:
    # - No file synchronization issues
    # - No stale checkpoint cleanup needed
    # - No disk I/O for checkpoint storage
    # - Database transactions ensure consistency
    # - Simpler rollback logic

    local checkpoint_id="$(date +%Y%m%d_%H%M%S)_${instance_code}_${level}"

    log_verbose "Creating $level checkpoint: $checkpoint_id (database-only)" >&2

    # Store checkpoint in database ONLY
    if orch_db_check_connection; then
        local code_lower=$(lower "$instance_code")
        local escaped_description="${description//\'/\'\'}"

        # CRITICAL FIX (2026-01-22): Use correct table name 'checkpoints' not 'orchestration_checkpoints'
        # ROOT CAUSE: Table name mismatch between schema and code caused INSERT failures
        orch_db_exec "
        INSERT INTO checkpoints (
            checkpoint_id, instance_code, checkpoint_level, description, created_at
        ) VALUES (
            '$checkpoint_id', '$code_lower', '$level', '$escaped_description', NOW()
        )" >/dev/null 2>&1 || true
    fi

    # Return checkpoint ID on stdout (no logging)
    echo "$checkpoint_id"
}

##
# Checkpoint container states
#
# Arguments:
#   $1 - Instance code
#   $2 - Checkpoint directory
##
orch_checkpoint_containers() {
    local instance_code="$1"
    local checkpoint_dir="$2"

    log_verbose "Checkpointing container states..."

    # Container status
    docker ps -a --filter "name=dive-spoke-${instance_code}" \
        --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" \
        > "${checkpoint_dir}/containers.tsv" 2>/dev/null || true

    # Container images (for recreation)
    docker ps -a --filter "name=dive-spoke-${instance_code}" \
        --format "table {{.Names}}\t{{.Image}}" \
        > "${checkpoint_dir}/container_images.tsv" 2>/dev/null || true

    # Network connections
    docker inspect $(docker ps -q --filter "name=dive-spoke-${instance_code}" 2>/dev/null || true) \
        --format='{{.Name}}: {{range .NetworkSettings.Networks}}{{.NetworkID}} {{end}}' \
        > "${checkpoint_dir}/networks.txt" 2>/dev/null || true
}

##
# Checkpoint configuration files
#
# Arguments:
#   $1 - Instance code
#   $2 - Checkpoint directory
##
orch_checkpoint_configuration() {
    local instance_code="$1"
    local checkpoint_dir="$2"

    log_verbose "Checkpointing configuration files..."

    local instance_dir="${DIVE_ROOT}/instances/${instance_code}"

    # Copy configuration files
    cp "${instance_dir}/.env" "${checkpoint_dir}/.env" 2>/dev/null || true
    cp "${instance_dir}/config.json" "${checkpoint_dir}/config.json" 2>/dev/null || true
    cp "${instance_dir}/docker-compose.yml" "${checkpoint_dir}/docker-compose.yml" 2>/dev/null || true

    # Backup environment file with timestamp
    cp "${instance_dir}/.env" "${checkpoint_dir}/.env.$(date +%Y%m%d_%H%M%S)" 2>/dev/null || true
}

##
# Checkpoint Keycloak realm state
#
# Arguments:
#   $1 - Instance code
#   $2 - Checkpoint directory
##
orch_checkpoint_keycloak() {
    local instance_code="$1"
    local checkpoint_dir="$2"

    log_verbose "Checkpointing Keycloak realm state..."

    local kc_container="dive-spoke-${instance_code}-keycloak"
    local realm="dive-v3-broker-${instance_code}"

    # Export realm configuration
    if docker ps --format '{{.Names}}' | grep -q "^${kc_container}$"; then
        docker exec "$kc_container" /opt/keycloak/bin/kcadm.sh get realms/"$realm" \
            >/dev/null 2>&1 && \
        docker exec "$kc_container" /opt/keycloak/bin/kcadm.sh get realms/"$realm" \
            > "${checkpoint_dir}/keycloak_realm.json" 2>/dev/null || true

        # Export client configurations
        docker exec "$kc_container" /opt/keycloak/bin/kcadm.sh get clients -r "$realm" \
            --fields id,clientId,enabled,redirectUris,webOrigins \
            > "${checkpoint_dir}/keycloak_clients.json" 2>/dev/null || true
    fi
}

##
# Checkpoint federation configuration
#
# Arguments:
#   $1 - Instance code
#   $2 - Checkpoint directory
##
orch_checkpoint_federation() {
    local instance_code="$1"
    local checkpoint_dir="$2"

    log_verbose "Checkpointing federation configuration..."

    local config_file="${DIVE_ROOT}/instances/${instance_code}/config.json"

    # Copy federation-related configuration
    if [ -f "$config_file" ]; then
        cp "$config_file" "${checkpoint_dir}/federation_config.json"
    fi

    # Export federation registry entries
    if [ -f "${DIVE_ROOT}/config/federation-registry.json" ]; then
        jq ".instances.\"${instance_code}\"" "${DIVE_ROOT}/config/federation-registry.json" \
            > "${checkpoint_dir}/federation_registry.json" 2>/dev/null || true
    fi
}

##
# Execute automatic rollback on failure
#
# Arguments:
#   $1 - Instance code
#   $2 - Failure reason
#   $3 - Rollback strategy (optional, default: CONFIG)
##
orch_execute_rollback() {
    local instance_code="$1"
    local failure_reason="$2"
    local strategy="${3:-$ROLLBACK_CONFIG}"

    log_error "Executing automatic rollback for $instance_code"
    log_error "Failure reason: $failure_reason"
    log_error "Rollback strategy: $strategy"

    # Find latest checkpoint
    local latest_checkpoint
    latest_checkpoint=$(orch_find_latest_checkpoint "$instance_code")

    if [ -z "$latest_checkpoint" ]; then
        log_error "No checkpoint available for rollback"
        return 1
    fi

    log_info "Rolling back to checkpoint: $latest_checkpoint"

    # Execute rollback based on strategy
    case "$strategy" in
        "$ROLLBACK_STOP")
            orch_rollback_stop_services "$instance_code"
            ;;
        "$ROLLBACK_CONFIG")
            orch_rollback_configuration "$instance_code" "$latest_checkpoint"
            ;;
        "$ROLLBACK_CONTAINERS")
            orch_rollback_containers "$instance_code" "$latest_checkpoint"
            ;;
        "$ROLLBACK_COMPLETE")
            orch_rollback_complete "$instance_code" "$latest_checkpoint"
            ;;
        *)
            log_error "Unknown rollback strategy: $strategy"
            return 1
            ;;
    esac

    # Update state
    set_deployment_state_enhanced "$instance_code" "ROLLED_BACK" "$failure_reason" \
        "{\"rollback_checkpoint\":\"$latest_checkpoint\",\"strategy\":\"$strategy\"}"

    orch_record_error "ROLLBACK_EXECUTED" "$ORCH_SEVERITY_MEDIUM" \
        "Automatic rollback completed" "rollback" \
        "Verify system state and retry deployment if needed" \
        "{\"instance_code\":\"$instance_code\",\"checkpoint\":\"$latest_checkpoint\",\"strategy\":\"$strategy\"}"

    log_warn "Rollback completed. Manual verification recommended."
}

##
# Find latest checkpoint for instance
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   Latest checkpoint ID, or empty string if none found
##
orch_find_latest_checkpoint() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    # CRITICAL FIX (2026-01-15): Database-only checkpoints
    # Previous: Searched .dive-checkpoints/ filesystem
    # Fixed: Query database for latest checkpoint

    if ! orch_db_check_connection; then
        echo ""
        return 1
    fi

    local checkpoint_id
    # CRITICAL FIX (2026-01-22): Use correct table name 'checkpoints'
    checkpoint_id=$(orch_db_exec "
        SELECT checkpoint_id
        FROM checkpoints
        WHERE instance_code = '$code_lower'
        ORDER BY created_at DESC
        LIMIT 1
    " 2>/dev/null | xargs)

    if [ -n "$checkpoint_id" ]; then
        echo "$checkpoint_id"
        return 0
    fi

    echo ""
    return 1
}

##
# Rollback: Stop services only
#
# Arguments:
#   $1 - Instance code
##
orch_rollback_stop_services() {
    local instance_code="$1"

    log_info "Stopping services for rollback..."

    cd "${DIVE_ROOT}/instances/${instance_code}"
    docker compose down 2>/dev/null || true

    log_success "Services stopped"
}

##
# Rollback: Restore configuration files
#
# Arguments:
#   $1 - Instance code
#   $2 - Checkpoint ID
##
orch_rollback_configuration() {
    local instance_code="$1"
    local checkpoint_id="$2"

    # CRITICAL SIMPLIFICATION (2026-01-15): Database-only rollback
    # Root cause: File-based checkpoint restoration is flaky and unnecessary
    # Previous: Restored .env, config.json, docker-compose.yml from checkpoint files
    # Fixed: These files are regenerated from SSOT (templates) on redeployment
    #
    # Best Practice: Don't restore config files - regenerate from authoritative sources
    # - .env: Generated from template + secrets from GCP
    # - config.json: Generated from instance parameters
    # - docker-compose.yml: Generated from template

    log_info "Configuration rollback skipped - files regenerated from templates on redeploy"

    # Note: Actual rollback is handled by stopping containers and redeploying
    # Database state tracks deployment phase for recovery
    return 0
}

##
# Rollback: Recreate containers
#
# Arguments:
#   $1 - Instance code
#   $2 - Checkpoint ID
##
orch_rollback_containers() {
    local instance_code="$1"
    local checkpoint_id="$2"

    # CRITICAL SIMPLIFICATION (2026-01-15): Database-only rollback
    # Rollback = stop containers, database tracks state for recovery
    # Previous: Stopped + restarted containers from checkpoint files
    # Fixed: Just stop containers, redeployment handles recreation

    log_info "Stopping containers for rollback..."

    # Stop existing containers
    orch_rollback_stop_services "$instance_code"

    log_success "Containers stopped for rollback"
    log_info "To recover: redeploy the spoke instance"
}

##
# Complete system rollback
#
# Arguments:
#   $1 - Instance code
#   $2 - Checkpoint ID
##
##
# Complete system rollback with comprehensive cleanup
#
# This function performs a complete rollback including:
# 1. Stop and remove all containers
# 2. Remove Docker networks
# 3. Clean Terraform state
# 4. Remove orchestration database entries
# 5. Clear checkpoints
# 6. Optionally remove instance directory (--clean-slate)
#
# Arguments:
#   $1 - Instance code
#   $2 - Checkpoint ID (unused, kept for compatibility)
#   $3 - Clean slate flag (optional: "clean-slate" to remove instance directory)
##
orch_rollback_complete() {
    local instance_code="$1"
    local checkpoint_id="$2"
    local clean_slate="${3:-}"

    log_info "Executing comprehensive rollback for $instance_code..."
    local code_lower=$(lower "$instance_code")
    local instance_dir="${DIVE_ROOT}/instances/${code_lower}"

    # Track what was cleaned
    local cleaned=0
    local total_steps=6

    # Step 1: Stop and remove all containers with volumes
    log_step "1/$total_steps: Stopping and removing containers..."
    if [ -d "$instance_dir" ] && [ -f "$instance_dir/docker-compose.yml" ]; then
        cd "$instance_dir"
        if docker compose down -v --remove-orphans 2>&1 | grep -q "Removed\|Stopped"; then
            log_success "✓ Containers stopped and removed"
            ((cleaned++))
        else
            # Fallback: manually remove containers
            docker ps -a --filter "name=dive-spoke-${code_lower}-" -q | grep . | xargs docker rm -f 2>/dev/null && ((cleaned++))
        fi
        cd "$DIVE_ROOT"
    else
        log_verbose "No docker-compose.yml found - skipping container cleanup"
    fi

    # Step 2: Remove Docker networks
    log_step "2/$total_steps: Cleaning Docker networks..."
    local networks=$(docker network ls --filter "name=dive-spoke-${code_lower}" -q 2>/dev/null)
    if [ -n "$networks" ]; then
        echo "$networks" | grep . | xargs docker network rm 2>/dev/null && {
            log_success "✓ Docker networks removed"
            ((cleaned++))
        }
    else
        log_verbose "No networks to clean"
    fi

    # Step 3: Clean Terraform state
    log_step "3/$total_steps: Cleaning Terraform state..."
    local tf_spoke_dir="${DIVE_ROOT}/terraform/spoke"
    if [ -d "$tf_spoke_dir" ]; then
        cd "$tf_spoke_dir"

        # Remove workspace if it exists
        if terraform workspace list 2>/dev/null | grep -q "$code_lower"; then
            terraform workspace select default 2>/dev/null || true
            terraform workspace delete "$code_lower" 2>/dev/null && {
                log_success "✓ Terraform workspace deleted"
                ((cleaned++))
            }
        else
            log_verbose "No Terraform workspace to clean"
        fi

        # Remove state files
        rm -f "terraform.tfstate.d/${code_lower}/terraform.tfstate" 2>/dev/null
        rm -rf ".terraform" 2>/dev/null

        cd "$DIVE_ROOT"
    else
        log_verbose "Terraform directory not found"
    fi

    # Step 4: Remove orchestration state
    log_step "4/$total_steps: Cleaning orchestration database..."
    if type orch_db_delete_instance &>/dev/null && orch_db_check_connection 2>/dev/null; then
        if orch_db_delete_instance "$instance_code"; then
            log_success "✓ Orchestration state removed"
            ((cleaned++))
        fi
    else
        log_verbose "Database not available or function not found"
    fi

    # Step 5: Clear checkpoints
    log_step "5/$total_steps: Clearing checkpoints..."
    if type spoke_checkpoint_clear_all &>/dev/null; then
        if spoke_checkpoint_clear_all "$instance_code" "confirm"; then
            log_success "✓ Checkpoints cleared"
            ((cleaned++))
        fi
    else
        # Manual checkpoint cleanup
        if [ -d "$instance_dir/.phases" ]; then
            rm -rf "$instance_dir/.phases" 2>/dev/null && {
                log_success "✓ Checkpoints cleared (manual)"
                ((cleaned++))
            }
        fi
    fi

    # Step 6: Optionally remove instance directory
    if [ "$clean_slate" = "clean-slate" ]; then
        log_step "6/$total_steps: Removing instance directory (clean slate)..."
        if [ -d "$instance_dir" ]; then
            # Backup critical files before removal
            local backup_dir="${DIVE_ROOT}/.rollback-backups/${code_lower}-$(date +%Y%m%d-%H%M%S)"
            mkdir -p "$backup_dir"

            # Backup config files if they exist
            [ -f "$instance_dir/config.json" ] && cp "$instance_dir/config.json" "$backup_dir/" 2>/dev/null
            [ -f "$instance_dir/.env" ] && cp "$instance_dir/.env" "$backup_dir/" 2>/dev/null

            # Remove instance directory
            rm -rf "$instance_dir" 2>/dev/null && {
                log_success "✓ Instance directory removed (backup: $backup_dir)"
                ((cleaned++))
            }
        else
            log_verbose "No instance directory to remove"
        fi
    else
        log_verbose "6/$total_steps: Instance directory preserved (use --clean-slate to remove)"
    fi

    # Summary
    echo ""
    if [ $cleaned -gt 0 ]; then
        log_success "Rollback complete: $cleaned/$total_steps steps completed"
    else
        log_warn "Rollback complete: No cleanup performed (nothing to clean)"
    fi

    # Update database state to FAILED
    if orch_db_check_connection 2>/dev/null; then
        orch_db_set_state "$instance_code" "FAILED" "Rollback executed - manual redeploy required" \
            "{\"rollback_timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"clean_slate\":\"$clean_slate\"}"
    fi

    echo ""
    log_info "Recovery options:"
    log_info "  • Full redeploy: ./dive spoke deploy $instance_code"
    if [ "$clean_slate" != "clean-slate" ]; then
        log_info "  • Clean slate:   ./dive spoke rollback $instance_code --clean-slate"
    fi
    echo ""

    return 0
}

# =============================================================================
# REAL-TIME OBSERVABILITY & METRICS (Phase 3)
# =============================================================================

# Metrics storage
declare -A DEPLOYMENT_METRICS=()
declare -A PERFORMANCE_METRICS=()
declare -A PREDICTIVE_METRICS=()

# Metrics configuration
readonly METRICS_RETENTION_HOURS=24
readonly METRICS_POLLING_INTERVAL=5
readonly PREDICTIVE_ANALYSIS_ENABLED=true

##
# Initialize metrics collection for deployment
#
# Arguments:
#   $1 - Instance code
##
orch_init_metrics() {
    local instance_code="$1"

    DEPLOYMENT_METRICS["${instance_code}_start_time"]=$(date +%s)
    DEPLOYMENT_METRICS["${instance_code}_phase_start"]=$(date +%s)
    DEPLOYMENT_METRICS["${instance_code}_error_count"]=0
    DEPLOYMENT_METRICS["${instance_code}_retry_count"]=0

    # Start background metrics collection
    if [ "$PREDICTIVE_ANALYSIS_ENABLED" = true ]; then
        orch_start_metrics_collection "$instance_code" &
    fi

    log_verbose "Metrics collection initialized for $instance_code"
}

##
# Start background metrics collection
#
# Arguments:
#   $1 - Instance code
##
orch_start_metrics_collection() {
    local instance_code="$1"

    # Background metrics collection
    (
        # Disable exit on error for background process
        set +e

        local collection_pid=$$
        local metrics_file="${DIVE_ROOT}/logs/orchestration-metrics-${instance_code}.json"

        # Ensure logs directory exists
        mkdir -p "$(dirname "$metrics_file")" 2>/dev/null || true

        # Create metrics file
        echo "[" > "$metrics_file" 2>/dev/null || exit 0

        # Wait for deployment to actually start (containers to appear)
        local wait_count=0
        local max_wait=60  # Wait up to 60 seconds for deployment to start

        while [ $wait_count -lt $max_wait ]; do
            if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "dive-spoke-${instance_code}"; then
                break  # Containers found, start collecting
            fi
            sleep 1
            ((wait_count++))
        done

        # If no containers after max_wait, exit gracefully
        if [ $wait_count -ge $max_wait ]; then
            echo "[]" > "$metrics_file" 2>/dev/null || true
            exit 0
        fi

        # Collect metrics while deployment is active
        while true; do
            # Check if deployment is still active
            if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "dive-spoke-${instance_code}"; then
                # No containers running, deployment may be complete or failed
                sleep 2
                # Double-check
                if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "dive-spoke-${instance_code}"; then
                    break
                fi
            fi

            # Collect metrics
            local metrics
            metrics=$(orch_collect_current_metrics "$instance_code" 2>/dev/null || echo "")

            # Append to metrics file (JSON Lines format)
            if [ -n "$metrics" ]; then
                echo "$metrics," >> "$metrics_file" 2>/dev/null || true
            fi

            sleep $METRICS_POLLING_INTERVAL
        done

        # Close JSON array
        if grep -q "," "$metrics_file" 2>/dev/null; then
            # Remove trailing comma from last JSON object
            sed -i.bak '$ s/,$//' "$metrics_file" 2>/dev/null && rm -f "${metrics_file}.bak"
        else
            # No metrics collected
            echo "[]" > "$metrics_file" 2>/dev/null || true
        fi
        echo "]" >> "$metrics_file" 2>/dev/null || true

        # Don't log completion (can confuse parent process)
        exit 0

    ) >/dev/null 2>&1 &

    # Store background PID for potential cleanup
    ORCH_CONTEXT["metrics_pid"]=$!
}

##
# Collect current deployment metrics
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   JSON metrics string
##
orch_collect_current_metrics() {
    local instance_code="$1"

    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    local deployment_duration=0

    if [ -n "${DEPLOYMENT_METRICS[${instance_code}_start_time]}" ]; then
        deployment_duration=$(( $(date +%s) - DEPLOYMENT_METRICS["${instance_code}_start_time"] ))
    fi

    # Container metrics
    local container_count=$(docker ps -q --filter "name=dive-spoke-${instance_code}" 2>/dev/null | wc -l | tr -d ' ')
    local healthy_containers=$(orch_count_healthy_containers "$instance_code")
    local total_memory=$(orch_get_instance_memory_usage "$instance_code")

    # Error metrics
    local error_rate=0
    if [ "$deployment_duration" -gt 0 ]; then
        error_rate=$(( (ORCH_CONTEXT["errors_critical"] + ORCH_CONTEXT["errors_high"]) * 60 / deployment_duration ))
    fi

    # Network metrics
    local network_status=$(orch_check_network_status "$instance_code")

    # Predictive metrics
    local failure_probability=$(orch_calculate_failure_probability "$instance_code")

    cat << EOF
{
    "timestamp": "$timestamp",
    "instance_code": "$instance_code",
    "deployment_duration_seconds": $deployment_duration,
    "current_phase": "${ORCH_CONTEXT["current_phase"]}",
    "container_count": $container_count,
    "healthy_containers": $healthy_containers,
    "total_memory_mb": $total_memory,
    "error_rate_per_minute": $error_rate,
    "network_status": "$network_status",
    "failure_probability": $failure_probability,
    "circuit_breakers_open": $(orch_count_open_circuit_breakers),
    "orchestration_errors": {
        "critical": ${ORCH_CONTEXT["errors_critical"]},
        "high": ${ORCH_CONTEXT["errors_high"]},
        "medium": ${ORCH_CONTEXT["errors_medium"]},
        "low": ${ORCH_CONTEXT["errors_low"]}
    }
}
EOF
}

##
# Count healthy containers for instance
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   Number of healthy containers
##
orch_count_healthy_containers() {
    local instance_code="$1"

    local healthy=0
    local containers=$(docker ps -q --filter "name=dive-spoke-${instance_code}" 2>/dev/null || true)

    for container in $containers; do
        local health_status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "unknown")
        if [ "$health_status" = "healthy" ]; then
            ((healthy++))
        fi
    done

    echo $healthy
}

##
# Get total memory usage for instance
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   Memory usage in MB
##
orch_get_instance_memory_usage() {
    local instance_code="$1"

    # Get memory usage for all containers in instance
    local total_memory=0
    local containers=$(docker ps -q --filter "name=dive-spoke-${instance_code}" 2>/dev/null || true)

    for container in $containers; do
        local mem_usage=$(docker stats --no-stream --format "table {{.MemUsage}}" "$container" 2>/dev/null | tail -1 | sed 's/[^0-9]*\([0-9]*\)MiB.*/\1/' || echo "0")
        total_memory=$((total_memory + mem_usage))
    done

    echo $total_memory
}

##
# Check network connectivity status
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   Network status string
##
orch_check_network_status() {
    local instance_code="$1"

    # Check if instance network exists
    if docker network ls --format '{{.Name}}' | grep -q "^${instance_code}_dive-${instance_code}-network$"; then
        # Check if shared network is connected
        if docker network ls --format '{{.Name}}' | grep -q "^dive-shared$"; then
            echo "CONNECTED"
        else
            echo "INSTANCE_ONLY"
        fi
    else
        echo "DISCONNECTED"
    fi
}

##
# Count currently open circuit breakers
#
# Returns:
#   Number of open circuit breakers
##
orch_count_open_circuit_breakers() {
    local open_count=0

    for operation in "${!CIRCUIT_BREAKERS[@]}"; do
        if [ "${CIRCUIT_BREAKERS[$operation]}" = "$CIRCUIT_OPEN" ]; then
            ((open_count++))
        fi
    done

    echo $open_count
}

##
# Calculate failure probability using predictive analytics
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   Failure probability as percentage (0-100)
##
orch_calculate_failure_probability() {
    local instance_code="$1"

    # Simple predictive model based on current metrics
    local probability=0

    # Factor 1: Error rate (>5 errors/minute = high risk)
    local error_rate=$(( (ORCH_CONTEXT["errors_critical"] + ORCH_CONTEXT["errors_high"]) * 60 / ($(date +%s) - ORCH_CONTEXT["start_time"]) ))
    if [ "$error_rate" -gt 5 ]; then
        probability=$((probability + 40))
    elif [ "$error_rate" -gt 2 ]; then
        probability=$((probability + 20))
    fi

    # Factor 2: Circuit breakers open (>2 open = high risk)
    local open_circuits=$(orch_count_open_circuit_breakers)
    if [ "$open_circuits" -gt 2 ]; then
        probability=$((probability + 30))
    elif [ "$open_circuits" -gt 0 ]; then
        probability=$((probability + 10))
    fi

    # Factor 3: Network issues
    local network_status=$(orch_check_network_status "$instance_code")
    if [ "$network_status" = "DISCONNECTED" ]; then
        probability=$((probability + 20))
    elif [ "$network_status" = "INSTANCE_ONLY" ]; then
        probability=$((probability + 10))
    fi

    # Factor 4: Container health
    local total_containers=$(docker ps -q --filter "name=dive-spoke-${instance_code}" 2>/dev/null | wc -l | tr -d ' ')
    local healthy_containers=$(orch_count_healthy_containers "$instance_code")

    if [ "$total_containers" -gt 0 ]; then
        local health_ratio=$((healthy_containers * 100 / total_containers))
        if [ "$health_ratio" -lt 50 ]; then
            probability=$((probability + 30))
        elif [ "$health_ratio" -lt 80 ]; then
            probability=$((probability + 10))
        fi
    fi

    # Cap at 100%
    if [ "$probability" -gt 100 ]; then
        probability=100
    fi

    echo $probability
}

##
# Generate real-time deployment dashboard
#
# Arguments:
#   $1 - Instance code
##
orch_generate_dashboard() {
    local instance_code="$1"

    local dashboard_file="${DIVE_ROOT}/logs/orchestration-dashboard-${instance_code}.html"

    # Generate HTML dashboard
    cat > "$dashboard_file" << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>DIVE V3 Orchestration Dashboard</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .metric { background: #f0f0f0; padding: 10px; margin: 10px 0; border-radius: 5px; }
        .healthy { color: green; }
        .warning { color: orange; }
        .critical { color: red; }
        .chart { width: 100%; height: 200px; background: #e0e0e0; margin: 10px 0; }
    </style>
    <script>
        function refresh() {
            location.reload();
        }
        setInterval(refresh, 5000); // Refresh every 5 seconds
    </script>
</head>
<body>
    <h1>DIVE V3 Orchestration Dashboard</h1>
    <p>Instance: <strong>INSTANCE_CODE</strong> | Auto-refresh: 5s</p>

    <div class="metric">
        <h3>Deployment Status</h3>
        <p>Phase: <span id="phase">PHASE</span></p>
        <p>Duration: <span id="duration">DURATION</span></p>
        <p>Status: <span id="status">STATUS</span></p>
    </div>

    <div class="metric">
        <h3>Container Health</h3>
        <p>Total: <span id="total-containers">TOTAL</span></p>
        <p>Healthy: <span class="healthy" id="healthy-containers">HEALTHY</span></p>
        <p>Memory Usage: <span id="memory-usage">MEMORY</span></p>
    </div>

    <div class="metric">
        <h3>Error Metrics</h3>
        <p>Critical: <span class="critical" id="errors-critical">CRITICAL</span></p>
        <p>High: <span class="warning" id="errors-high">HIGH</span></p>
        <p>Error Rate: <span id="error-rate">RATE</span>/min</p>
    </div>

    <div class="metric">
        <h3>Circuit Breakers</h3>
        <p>Open Circuits: <span id="open-circuits">OPEN</span></p>
        <p>Failure Prediction: <span id="failure-probability">PROBABILITY</span>%</p>
    </div>

    <div class="chart">
        <h4>Performance Trends</h4>
        <p>Real-time metrics chart would be displayed here</p>
    </div>
</body>
</html>
EOF

    # Replace placeholders with actual values (handle paths with spaces)
    if [ -f "$dashboard_file" ]; then
        sed -i.bak "s/INSTANCE_CODE/$instance_code/g" "$dashboard_file" && rm -f "${dashboard_file}.bak" 2>/dev/null || log_warn "Failed to replace INSTANCE_CODE in dashboard"
    else
        log_warn "Dashboard file not found: $dashboard_file"
    fi
    if [ -f "$dashboard_file" ]; then
        sed -i.bak "s/PHASE/${ORCH_CONTEXT["current_phase"]}/g" "$dashboard_file" && rm -f "${dashboard_file}.bak" 2>/dev/null || log_warn "Failed to replace PHASE in dashboard"
        sed -i.bak "s/DURATION/$(( $(date +%s) - ORCH_CONTEXT["start_time"] ))s/g" "$dashboard_file" && rm -f "${dashboard_file}.bak" 2>/dev/null || log_warn "Failed to replace DURATION in dashboard"
        sed -i.bak "s/STATUS/$(get_deployment_state_enhanced "$instance_code" 2>/dev/null || echo "UNKNOWN")/g" "$dashboard_file" && rm -f "${dashboard_file}.bak" 2>/dev/null || log_warn "Failed to replace STATUS in dashboard"
        sed -i.bak "s/TOTAL/$(docker ps -q --filter "name=dive-spoke-${instance_code}" 2>/dev/null | wc -l | tr -d ' ')/g" "$dashboard_file" && rm -f "${dashboard_file}.bak" 2>/dev/null || log_warn "Failed to replace TOTAL in dashboard"
        sed -i.bak "s/HEALTHY/$(orch_count_healthy_containers "$instance_code")/g" "$dashboard_file" && rm -f "${dashboard_file}.bak" 2>/dev/null || log_warn "Failed to replace HEALTHY in dashboard"
        sed -i.bak "s/MEMORY/$(orch_get_instance_memory_usage "$instance_code") MB/g" "$dashboard_file" && rm -f "${dashboard_file}.bak" 2>/dev/null || log_warn "Failed to replace MEMORY in dashboard"
        sed -i.bak "s/CRITICAL/${ORCH_CONTEXT["errors_critical"]}/g" "$dashboard_file" && rm -f "${dashboard_file}.bak" 2>/dev/null || log_warn "Failed to replace CRITICAL in dashboard"
        sed -i.bak "s/HIGH/${ORCH_CONTEXT["errors_high"]}/g" "$dashboard_file" && rm -f "${dashboard_file}.bak" 2>/dev/null || log_warn "Failed to replace HIGH in dashboard"
        sed -i.bak "s/RATE/$(( (ORCH_CONTEXT["errors_critical"] + ORCH_CONTEXT["errors_high"]) * 60 / ($(date +%s) - ORCH_CONTEXT["start_time"]) ))/g" "$dashboard_file" && rm -f "${dashboard_file}.bak" 2>/dev/null || log_warn "Failed to replace RATE in dashboard"
        sed -i.bak "s/OPEN/$(orch_count_open_circuit_breakers)/g" "$dashboard_file" && rm -f "${dashboard_file}.bak" 2>/dev/null || log_warn "Failed to replace OPEN in dashboard"
        sed -i.bak "s/PROBABILITY/$(orch_calculate_failure_probability "$instance_code")/g" "$dashboard_file" && rm -f "${dashboard_file}.bak" 2>/dev/null || log_warn "Failed to replace PROBABILITY in dashboard"
    fi

    log_info "Dashboard generated: $dashboard_file"
}

##
# Cleanup old metrics and checkpoints
##
orch_cleanup_old_data() {
    # Portable date calculation (macOS + Linux)
    local cutoff_time
    if date -v-"${METRICS_RETENTION_HOURS}H" +%s >/dev/null 2>&1; then
        # macOS
        cutoff_time=$(date -v-"${METRICS_RETENTION_HOURS}H" +%s)
    else
        # Linux
        cutoff_time=$(date -d "$METRICS_RETENTION_HOURS hours ago" +%s)
    fi

    log_verbose "Cleaning up old orchestration data..."

    # Clean old checkpoints (portable stat for macOS + Linux)
    if command -v stat >/dev/null 2>&1; then
        if stat -f %m . >/dev/null 2>&1; then
            # macOS: use -f %m
            find "${DIVE_ROOT}/.dive-checkpoints" -type d -name "*" 2>/dev/null | while read -r dir; do
                local mtime=$(stat -f %m "$dir" 2>/dev/null || echo 0)
                if [ "$mtime" -lt "$cutoff_time" ]; then
                    rm -rf "$dir" 2>/dev/null || true
                fi
            done
        else
            # Linux: use -c %Y
            find "${DIVE_ROOT}/.dive-checkpoints" -type d -name "*" -exec stat -c '%Y %n' {} \; 2>/dev/null | \
                awk -v cutoff="$cutoff_time" '$1 < cutoff {print $2}' | \
                grep . | xargs rm -rf 2>/dev/null || true
        fi
    fi

    # Clean old metrics (portable stat)
    if command -v stat >/dev/null 2>&1; then
        if stat -f %m . >/dev/null 2>&1; then
            # macOS
            find "${DIVE_ROOT}/logs" -name "orchestration-metrics-*.json" 2>/dev/null | while read -r file; do
                local mtime=$(stat -f %m "$file" 2>/dev/null || echo 0)
                if [ "$mtime" -lt "$cutoff_time" ]; then
                    rm -f "$file" 2>/dev/null || true
                fi
            done
        else
            # Linux
            find "${DIVE_ROOT}/logs" -name "orchestration-metrics-*.json" -exec stat -c '%Y %n' {} \; 2>/dev/null | \
                awk -v cutoff="$cutoff_time" '$1 < cutoff {print $2}' | \
                grep . | xargs rm -f 2>/dev/null || true
        fi
    fi

    # Clean old dashboards (portable stat)
    if command -v stat >/dev/null 2>&1; then
        if stat -f %m . >/dev/null 2>&1; then
            # macOS
            find "${DIVE_ROOT}/logs" -name "orchestration-dashboard-*.html" 2>/dev/null | while read -r file; do
                local mtime=$(stat -f %m "$file" 2>/dev/null || echo 0)
                if [ "$mtime" -lt "$cutoff_time" ]; then
                    rm -f "$file" 2>/dev/null || true
                fi
            done
        else
            # Linux
            find "${DIVE_ROOT}/logs" -name "orchestration-dashboard-*.html" -exec stat -c '%Y %n' {} \; 2>/dev/null | \
                awk -v cutoff="$cutoff_time" '$1 < cutoff {print $2}' | \
                grep . | xargs rm -f 2>/dev/null || true
        fi
    fi

    log_verbose "Old orchestration data cleanup completed"
}

# =============================================================================
# STATE CONSISTENCY VALIDATION (Phase 3.3)
# =============================================================================
# Validates that orchestration DB state matches actual system state.
# Detects and corrects inconsistencies like:
# - DB shows "deployed" but containers not running
# - DB shows "unregistered" but containers running
# - DB shows "complete" but realm missing
# =============================================================================

##
# Validate state consistency between orchestration DB and actual system
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - State consistent or corrected
#   1 - Fatal inconsistency that requires manual intervention
##
orch_validate_state_consistency() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    log_verbose "Validating state consistency for $instance_code..."

    # Get current DB state
    local db_state="UNKNOWN"
    if type orch_db_get_state &>/dev/null && orch_db_check_connection 2>/dev/null; then
        db_state=$(orch_db_get_state "$instance_code" 2>/dev/null || echo "UNKNOWN")
    fi

    # Determine actual system state
    local actual_state=$(orch_determine_actual_state "$instance_code")

    log_verbose "DB state: $db_state | Actual state: $actual_state"

    # If states match, we're good
    if [ "$db_state" = "$actual_state" ]; then
        log_verbose "State consistent: $db_state"
        return 0
    fi

    # States don't match - auto-correct if possible
    log_warn "State inconsistency detected:"
    log_warn "  DB shows: $db_state"
    log_warn "  Actual:   $actual_state"

    # Auto-correct the DB state
    if type orch_db_set_state &>/dev/null && orch_db_check_connection 2>/dev/null; then
        if orch_db_set_state "$instance_code" "$actual_state" "Auto-corrected from $db_state" \
            "{\"previous_state\":\"$db_state\",\"corrected_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"; then
            log_success "✓ State corrected: $db_state → $actual_state"
            return 0
        else
            log_error "Failed to correct state in database"
            return 1
        fi
    else
        log_warn "Cannot auto-correct - database unavailable"
        return 1
    fi
}

##
# Determine actual deployment state by inspecting the system
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   State name on stdout (UNKNOWN, PARTIAL, COMPLETE, FAILED, etc.)
##
orch_determine_actual_state() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    # Check 1: Do containers exist?
    local container_count=$(docker ps -a --filter "name=dive-spoke-${code_lower}-" --format "{{.Names}}" 2>/dev/null | wc -l | tr -d ' ')

    if [ "$container_count" -eq 0 ]; then
        # No containers = not deployed
        echo "UNKNOWN"
        return 0
    fi

    # Check 2: Are containers running?
    local running_count=$(docker ps --filter "name=dive-spoke-${code_lower}-" --format "{{.Names}}" 2>/dev/null | wc -l | tr -d ' ')

    if [ "$running_count" -eq 0 ]; then
        # Containers exist but none running = failed or rolled back
        echo "FAILED"
        return 0
    fi

    # Check 3: Are core services healthy?
    local core_services=("keycloak" "backend" "postgres")
    local healthy_core=0

    for service in "${core_services[@]}"; do
        local container="dive-spoke-${code_lower}-${service}"
        if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
            local health=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "no-healthcheck")
            if [ "$health" = "healthy" ] || [ "$health" = "no-healthcheck" ]; then
                ((healthy_core++))
            fi
        fi
    done

    if [ $healthy_core -lt 2 ]; then
        # Core services not healthy = deploying or failed
        echo "DEPLOYING"
        return 0
    fi

    # Check 4: Does Keycloak realm exist?
    local kc_container="dive-spoke-${code_lower}-keycloak"
    local realm="dive-v3-broker-${code_lower}"

    if docker ps --format '{{.Names}}' | grep -q "^${kc_container}$"; then
        local realm_check=$(docker exec "$kc_container" curl -sf \
            "http://localhost:8080/realms/${realm}" 2>/dev/null | \
            jq -r '.realm // empty' 2>/dev/null)

        if [ "$realm_check" != "$realm" ]; then
            # Containers healthy but realm missing = PARTIAL deployment
            echo "PARTIAL"
            return 0
        fi
    fi

    # Check 5: Is spoke registered in Hub?
    local backend_container="dive-spoke-${code_lower}-backend"
    if docker ps --format '{{.Names}}' | grep -q "^${backend_container}$"; then
        # Check if backend can reach Hub (indicates federation)
        local hub_check=$(docker exec "$backend_container" curl -sf \
            "https://dive-hub-backend:4000/health" 2>/dev/null | \
            jq -r '.status // empty' 2>/dev/null)

        if [ -z "$hub_check" ]; then
            # Backend running but can't reach Hub = PARTIAL (federation not setup)
            echo "PARTIAL"
            return 0
        fi
    fi

    # All checks passed = COMPLETE
    echo "COMPLETE"
    return 0
}

# =============================================================================
# PHASE MANAGEMENT
# =============================================================================

##
# Execute orchestration phase with error handling
#
# Arguments:
#   $1 - Phase name
#   $2 - Phase function to execute
#
# Returns:
#   0 - Phase completed successfully
#   1 - Phase failed
##
orch_execute_phase() {
    local phase_name="$1"
    local phase_function="$2"

    ORCH_CONTEXT["current_phase"]="$phase_name"

    log_info "Starting phase: $phase_name"

    # Set deployment state
    set_deployment_state_enhanced "${ORCH_CONTEXT["instance_code"]}" "$phase_name" 2>/dev/null || true

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

    local deployment_failed=false
    for phase_spec in "${phases[@]}"; do
        IFS=':' read -r phase_name phase_function <<< "$phase_spec"

        if ! orch_execute_phase "$phase_name" "$phase_function"; then
            # Check if we should continue
            if ! orch_should_continue; then
                log_error "Orchestration stopped due to error threshold"
                set_deployment_state_enhanced "$instance_code" "FAILED" "Orchestration failed in phase $phase_name"
                orch_generate_error_summary "$instance_code"
                deployment_failed=true
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
    local total_time=$(($(date +%s) - ORCH_CONTEXT["start_time"]))
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