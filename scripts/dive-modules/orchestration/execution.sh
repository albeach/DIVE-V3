#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Orchestration Execution Engine
# =============================================================================
# Sourced by orchestration/framework.sh — do not execute directly.
#
# Service health checks, circuit breaker, retry logic, timeout calculation,
# parallel startup, health cascade
# =============================================================================

if ! declare -p ORCH_CONTEXT &>/dev/null; then
    declare -A ORCH_CONTEXT=()
fi
: "${PHASE_PREFLIGHT:=PREFLIGHT}"

orch_init_context() {
    local instance_code="$1"
    local instance_name="$2"

    ORCH_CONTEXT[instance_code]="$instance_code"
    ORCH_CONTEXT[instance_name]="$instance_name"
    ORCH_CONTEXT[start_time]=$(date +%s)
    ORCH_CONTEXT[current_phase]="$PHASE_PREFLIGHT"
    ORCH_CONTEXT[errors_critical]=0
    ORCH_CONTEXT[errors_high]=0
    ORCH_CONTEXT[errors_medium]=0
    ORCH_CONTEXT[errors_low]=0
    ORCH_CONTEXT[retry_count]=0
    ORCH_CONTEXT[checkpoint_enabled]="true"

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

    local timestamp
    timestamp=$(date +%s)
    local error_record="$timestamp|$error_code|$severity|$component|$message|$remediation|$context"

    ORCHESTRATION_ERRORS+=("$error_record")

    # Update error counters
    case "$severity" in
        "$ORCH_SEVERITY_CRITICAL")
            ((ORCH_CONTEXT[errors_critical]++))
            ;;
        "$ORCH_SEVERITY_HIGH")
            ((ORCH_CONTEXT[errors_high]++))
            ;;
        "$ORCH_SEVERITY_MEDIUM")
            ((ORCH_CONTEXT[errors_medium]++))
            ;;
        "$ORCH_SEVERITY_LOW")
            ((ORCH_CONTEXT[errors_low]++))
            ;;
    esac

    # Log based on severity
    case "$severity" in
        "$ORCH_SEVERITY_CRITICAL")
            log_error "CRITICAL [$component]: $message"
            [ -n "$remediation" ] && log_error "REMEDIATION: $remediation"
            ;;
        "$ORCH_SEVERITY_HIGH")
            log_error "HIGH PRIORITY [$component]: $message"
            [ -n "$remediation" ] && log_error "REMEDIATION: $remediation"
            ;;
        "$ORCH_SEVERITY_MEDIUM")
            log_warn "MEDIUM PRIORITY [$component]: $message"
            [ -n "$remediation" ] && log_info "NOTE: $remediation"
            ;;
        "$ORCH_SEVERITY_LOW")
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
    if [ "${ORCH_CONTEXT[errors_critical]}" -gt "$max_critical" ]; then
        log_error "Stopping orchestration due to ${ORCH_CONTEXT[errors_critical]} critical errors"
        return 1
    fi

    # Stop on too many high-priority errors
    if [ "${ORCH_CONTEXT[errors_high]}" -gt "$max_high" ]; then
        log_error "Stopping orchestration due to ${ORCH_CONTEXT[errors_high]} high-priority errors"
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
    local error_log
    error_log="${DIVE_ROOT}/logs/orchestration-errors-${instance_code}-$(date +%Y%m%d-%H%M%S).log"

    {
        echo "=== DIVE V3 Orchestration Error Summary ==="
        echo "Instance: $instance_code"
        echo "Timestamp: $(date)"
        echo "Duration: $(($(date +%s) - ORCH_CONTEXT[start_time])) seconds"
        echo "Current Phase: ${ORCH_CONTEXT[current_phase]}"
        echo ""
        echo "Error Counts:"
        echo "  Critical: ${ORCH_CONTEXT[errors_critical]}"
        echo "  High: ${ORCH_CONTEXT[errors_high]}"
        echo "  Medium: ${ORCH_CONTEXT[errors_medium]}"
        echo "  Low: ${ORCH_CONTEXT[errors_low]}"
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
    local start_time
    start_time=$(date +%s)
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
    local container_status
    container_status=$(docker inspect --format='{{.State.Status}}' "$container_name" 2>/dev/null || echo "unknown")
    local health_status
    health_status=$(docker inspect --format='{{.State.Health.Status}}' "$container_name" 2>/dev/null || echo "none")
    local started_at
    started_at=$(docker inspect --format='{{.State.StartedAt}}' "$container_name" 2>/dev/null || echo "unknown")

    # Try HTTP health check if available
    local http_healthy="null"
    local http_status="null"
    local health_url="${SERVICE_HEALTH_URLS[$service]}"
    local health_port="${SERVICE_HEALTH_PORTS[$service]}"

    if [ -n "$health_url" ] && [ -n "$health_port" ]; then
        local health_endpoint="http://localhost:${health_port}${health_url}"
        local http_response
        http_response=$(curl -kfs --max-time 3 -w "\n%{http_code}" "$health_endpoint" 2>/dev/null || echo "")
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


# Load circuit breaker functions
source "$(dirname "${BASH_SOURCE[0]}")/circuit-breaker.sh"

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
    local code_lower
    code_lower=$(lower "$instance_code")

    log_info "Starting parallel service startup for $instance_code"

    # Validate no circular dependencies first
    if ! orch_detect_circular_dependencies; then
        log_error "Cannot proceed with parallel startup - circular dependencies detected"
        return 1
    fi

    local max_level
    max_level=$(orch_get_max_dependency_level)
    local total_started=0
    local total_failed=0

    log_verbose "Service graph has $((max_level + 1)) dependency levels"

    # Start services level by level
    for ((level=0; level<=max_level; level++)); do
        local level_services
        level_services=$(orch_get_services_at_level $level)

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
                local timeout
                timeout=$(orch_calculate_dynamic_timeout "$service" "$instance_code")
                local container="dive-spoke-${code_lower}-${service}"

                # Check if already running
                if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
                    log_verbose "Service $service already running"
                    exit 0
                fi

                # Start service
                local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
                if [ -f "$spoke_dir/docker-compose.yml" ]; then
                    cd "$spoke_dir" || return 1
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
            pids+=("$pid")
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
        local deps
        deps=$(orch_get_health_check_dependencies "$service")

        for dep in $deps; do
            log_verbose "Checking health cascade: $service depends on $dep"

            local dep_timeout
            dep_timeout=$(orch_calculate_dynamic_timeout "$dep" "$instance_code")
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

# sc2034-anchor
: "${CHECKPOINT_COMPLETE:-}" "${CHECKPOINT_CONFIG:-}" "${CHECKPOINT_CONTAINER:-}" "${CHECKPOINT_FEDERATION:-}" "${CHECKPOINT_KEYCLOAK:-}" "${CHECKPOINT_METADATA:-}"
: "${CHECKPOINT_REGISTRY:-}" "${ROLLBACK_COMPLETE:-}" "${ROLLBACK_CONFIG:-}" "${ROLLBACK_CONTAINERS:-}" "${ROLLBACK_STOP:-}"
