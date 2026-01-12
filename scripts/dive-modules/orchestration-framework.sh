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

# Load enhanced state management
if [ -f "$(dirname "${BASH_SOURCE[0]}")/deployment-state.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/deployment-state.sh"
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

# Service startup timeouts (seconds)
declare -A SERVICE_TIMEOUTS=(
    ["postgres"]=60
    ["mongodb"]=60
    ["redis"]=30
    ["keycloak"]=180
    ["backend"]=120
    ["frontend"]=60
    ["opa"]=30
    ["kas"]=60
    ["opal-client"]=30
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
)

# Error tracking
declare -a ORCHESTRATION_ERRORS=()

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
# SERVICE HEALTH MANAGEMENT
# =============================================================================

##
# Check service health with intelligent retry logic
#
# Arguments:
#   $1 - Instance code (lowercase)
#   $2 - Service name
#   $3 - Timeout seconds (optional, uses SERVICE_TIMEOUTS default)
#
# Returns:
#   0 - Service is healthy
#   1 - Service failed health check
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
        # Check if container exists
        if ! docker ps --format '{{.Names}}' | grep -q "^${container_name}$"; then
            sleep 2
            elapsed=$((elapsed + 2))
            continue
        fi

        # Get health status
        local health_status
        health_status=$(docker inspect --format='{{.State.Health.Status}}' "$container_name" 2>/dev/null || echo "unknown")

        case "$health_status" in
            healthy)
                local total_time=$(( $(date +%s) - start_time ))
                log_verbose "Service $service healthy after ${total_time}s"
                return 0
                ;;
            unhealthy)
                log_warn "Service $service reported unhealthy"
                return 1
                ;;
            starting)
                # Still starting, continue waiting
                ;;
            *)
                # For services without health checks, check if container is running
                local container_status
                container_status=$(docker inspect --format='{{.State.Status}}' "$container_name" 2>/dev/null || echo "missing")

                if [ "$container_status" = "running" ]; then
                    log_verbose "Service $service running (no health check)"
                    return 0
                fi
                ;;
        esac

        sleep 2
        elapsed=$((elapsed + 2))
    done

    log_error "Service $service failed to become healthy within ${timeout}s"
    return 1
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

# Circuit breaker states
readonly CIRCUIT_CLOSED="CLOSED"      # Normal operation, requests pass through
readonly CIRCUIT_OPEN="OPEN"         # Failing, requests fail immediately
readonly CIRCUIT_HALF_OPEN="HALF_OPEN" # Testing if service recovered

# Circuit breaker configuration
declare -A CIRCUIT_BREAKERS=()
declare -A CIRCUIT_FAILURE_COUNTS=()
declare -A CIRCUIT_LAST_FAILURE_TIME=()
declare -A CIRCUIT_SUCCESS_COUNTS=()

# Circuit breaker defaults
readonly CIRCUIT_FAILURE_THRESHOLD=3     # Open circuit after N failures
readonly CIRCUIT_TIMEOUT_SECONDS=60      # Auto-close after N seconds
readonly CIRCUIT_SUCCESS_THRESHOLD=2     # Close circuit after N successes in half-open

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

    local checkpoint_id="$(date +%Y%m%d_%H%M%S)_${instance_code}_${level}"
    local checkpoint_dir="${DIVE_ROOT}/.dive-checkpoints/${checkpoint_id}"

    # Create checkpoint directory
    mkdir -p "$checkpoint_dir"

    log_info "Creating $level checkpoint: $checkpoint_id"

    # Layer 1: Container state (always included)
    if [[ "$level" =~ ^($CHECKPOINT_CONTAINER|$CHECKPOINT_CONFIG|$CHECKPOINT_KEYCLOAK|$CHECKPOINT_FEDERATION|$CHECKPOINT_COMPLETE)$ ]]; then
        orch_checkpoint_containers "$instance_code" "$checkpoint_dir"
    fi

    # Layer 2: Configuration files
    if [[ "$level" =~ ^($CHECKPOINT_CONFIG|$CHECKPOINT_KEYCLOAK|$CHECKPOINT_FEDERATION|$CHECKPOINT_COMPLETE)$ ]]; then
        orch_checkpoint_configuration "$instance_code" "$checkpoint_dir"
    fi

    # Layer 3: Keycloak realm state
    if [[ "$level" =~ ^($CHECKPOINT_KEYCLOAK|$CHECKPOINT_FEDERATION|$CHECKPOINT_COMPLETE)$ ]]; then
        orch_checkpoint_keycloak "$instance_code" "$checkpoint_dir"
    fi

    # Layer 4: Federation state
    if [[ "$level" =~ ^($CHECKPOINT_FEDERATION|$CHECKPOINT_COMPLETE)$ ]]; then
        orch_checkpoint_federation "$instance_code" "$checkpoint_dir"
    fi

    # Create metadata
    cat > "${checkpoint_dir}/metadata.json" << EOF
{
    "checkpoint_id": "$checkpoint_id",
    "instance_code": "$instance_code",
    "level": "$level",
    "description": "$description",
    "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "created_by": "${USER:-system}",
    "orchestration_version": "3.0"
}
EOF

    # Register checkpoint
    CHECKPOINT_REGISTRY["$checkpoint_id"]="$checkpoint_dir"
    CHECKPOINT_METADATA["$checkpoint_id"]="$level"

    log_success "Checkpoint created: $checkpoint_id"
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

    # Find checkpoints for this instance, sorted by creation time (newest first)
    local checkpoints=($(find "${DIVE_ROOT}/.dive-checkpoints" -name "*_${instance_code}_*" -type d 2>/dev/null | sort -r))

    if [ ${#checkpoints[@]} -eq 0 ]; then
        echo ""
        return 1
    fi

    # Return the newest checkpoint
    basename "${checkpoints[0]}"
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
    local checkpoint_dir="${DIVE_ROOT}/.dive-checkpoints/${checkpoint_id}"

    log_info "Restoring configuration files..."

    local instance_dir="${DIVE_ROOT}/instances/${instance_code}"

    # Restore configuration files
    cp "${checkpoint_dir}/.env" "${instance_dir}/.env" 2>/dev/null || true
    cp "${checkpoint_dir}/config.json" "${instance_dir}/config.json" 2>/dev/null || true
    cp "${checkpoint_dir}/docker-compose.yml" "${instance_dir}/docker-compose.yml" 2>/dev/null || true

    log_success "Configuration files restored"
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

    log_info "Recreating containers from checkpoint..."

    # Stop existing containers
    orch_rollback_stop_services "$instance_code"

    # Restart with checkpoint configuration
    cd "${DIVE_ROOT}/instances/${instance_code}"
    docker compose up -d 2>/dev/null || true

    log_success "Containers recreated"
}

##
# Complete system rollback
#
# Arguments:
#   $1 - Instance code
#   $2 - Checkpoint ID
##
orch_rollback_complete() {
    local instance_code="$1"
    local checkpoint_id="$2"

    log_info "Executing complete system rollback..."

    # Restore configuration
    orch_rollback_configuration "$instance_code" "$checkpoint_id"

    # Recreate containers
    orch_rollback_containers "$instance_code" "$checkpoint_id"

    # Note: Keycloak and federation rollback would require additional implementation
    # for complete system restoration

    log_success "Complete rollback executed"
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
        local collection_pid=$$
        local metrics_file="${DIVE_ROOT}/logs/orchestration-metrics-${instance_code}.json"

        # Create metrics file
        echo "[" > "$metrics_file"

        while true; do
            # Check if deployment is still active
            if ! docker ps --format '{{.Names}}' | grep -q "dive-spoke-${instance_code}"; then
                break
            fi

            # Collect metrics
            local metrics
            metrics=$(orch_collect_current_metrics "$instance_code")

            # Append to metrics file (JSON Lines format)
            if [ -n "$metrics" ]; then
                echo "$metrics," >> "$metrics_file"
            fi

            sleep $METRICS_POLLING_INTERVAL
        done

        # Close JSON array
        sed -i '$ s/,$//' "$metrics_file"
        echo "]" >> "$metrics_file"

        log_verbose "Metrics collection completed for $instance_code"

    ) &
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
    local cutoff_time=$(date -d "$METRICS_RETENTION_HOURS hours ago" +%s)

    log_verbose "Cleaning up old orchestration data..."

    # Clean old checkpoints
    find "${DIVE_ROOT}/.dive-checkpoints" -type d -name "*" -exec stat -c '%Y %n' {} \; 2>/dev/null | \
        awk -v cutoff="$cutoff_time" '$1 < cutoff {print $2}' | \
        xargs -r rm -rf 2>/dev/null || true

    # Clean old metrics
    find "${DIVE_ROOT}/logs" -name "orchestration-metrics-*.json" -exec stat -c '%Y %n' {} \; 2>/dev/null | \
        awk -v cutoff="$cutoff_time" '$1 < cutoff {print $2}' | \
        xargs -r rm -f 2>/dev/null || true

    # Clean old dashboards
    find "${DIVE_ROOT}/logs" -name "orchestration-dashboard-*.html" -exec stat -c '%Y %n' {} \; 2>/dev/null | \
        awk -v cutoff="$cutoff_time" '$1 < cutoff {print $2}' | \
        xargs -r rm -f 2>/dev/null || true

    log_verbose "Old orchestration data cleanup completed"
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
# Main orchestration entry point
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

    # Initialize context
    orch_init_context "$instance_code" "$instance_name"

    log_info "Starting orchestrated deployment for $instance_code ($instance_name)"

    # Phase execution with error handling
    local phases=(
        "$PHASE_PREFLIGHT:orch_phase_preflight"
        "$PHASE_INITIALIZATION:orch_phase_initialization"
        "$PHASE_DEPLOYMENT:$deployment_function"
        "$PHASE_CONFIGURATION:orch_phase_configuration"
        "$PHASE_VERIFICATION:orch_phase_verification"
        "$PHASE_COMPLETION:orch_phase_completion"
    )

    for phase_spec in "${phases[@]}"; do
        IFS=':' read -r phase_name phase_function <<< "$phase_spec"

        if ! orch_execute_phase "$phase_name" "$phase_function"; then
            # Check if we should continue
            if ! orch_should_continue; then
                log_error "Orchestration stopped due to error threshold"
                set_deployment_state_enhanced "$instance_code" "FAILED" "Orchestration failed in phase $phase_name"
                orch_generate_error_summary "$instance_code"
                return 1
            fi
        fi
    done

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
    # Implement preflight checks
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