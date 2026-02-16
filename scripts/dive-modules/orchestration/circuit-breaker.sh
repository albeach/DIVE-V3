#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Orchestration Circuit Breaker
# =============================================================================
# Extracted from orchestration/execution.sh (Phase 13e)
# =============================================================================

[ -n "${DIVE_ORCH_CIRCUIT_BREAKER_LOADED:-}" ] && return 0

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

export DIVE_ORCH_CIRCUIT_BREAKER_LOADED=1
