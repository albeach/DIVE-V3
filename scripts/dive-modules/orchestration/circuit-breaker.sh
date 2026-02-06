#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Circuit Breaker Pattern (Consolidated)
# =============================================================================
# Resilience patterns: circuit breaker, retry, exponential backoff
# =============================================================================
# Version: 5.0.0 (Module Consolidation)
# Date: 2026-01-22
#
# Extracted from error-recovery.sh for better separation of concerns
# =============================================================================

# Prevent multiple sourcing
[ -n "${DIVE_CIRCUIT_BREAKER_LOADED:-}" ] && return 0
export DIVE_CIRCUIT_BREAKER_LOADED=1

# =============================================================================
# LOAD DEPENDENCIES
# =============================================================================

ORCH_DIR="$(dirname "${BASH_SOURCE[0]}")"
MODULES_DIR="$(dirname "$ORCH_DIR")"

if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "${MODULES_DIR}/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load state module for database
if [ -f "${ORCH_DIR}/state.sh" ]; then
    source "${ORCH_DIR}/state.sh"
elif [ -f "${MODULES_DIR}/orchestration-state-db.sh" ]; then
    source "${MODULES_DIR}/orchestration-state-db.sh"
fi

# =============================================================================
# CONFIGURATION
# =============================================================================

# Circuit breaker configuration
CIRCUIT_FAILURE_THRESHOLD="${CIRCUIT_FAILURE_THRESHOLD:-5}"
CIRCUIT_COOLDOWN_PERIOD="${CIRCUIT_COOLDOWN_PERIOD:-60}"  # seconds

# Circuit breaker states
readonly CIRCUIT_CLOSED="CLOSED"
readonly CIRCUIT_OPEN="OPEN"
readonly CIRCUIT_HALF_OPEN="HALF_OPEN"

# =============================================================================
# CIRCUIT BREAKER IMPLEMENTATION
# =============================================================================

##
# Execute operation through circuit breaker
#
# Arguments:
#   $1 - Operation name (unique identifier)
#   $@ - Command to execute
#
# Returns:
#   0 - Succeeded
#   1 - Failed
#   2 - Circuit OPEN (fast fail)
##
orch_circuit_breaker_execute() {
    local operation_name="$1"
    shift
    local command=("$@")

    # Get circuit state from database
    local circuit_data=""
    if type orch_db_check_connection &>/dev/null && orch_db_check_connection; then
        circuit_data=$(orch_db_exec "
            SELECT state, failure_count,
                   COALESCE(EXTRACT(EPOCH FROM (NOW() - last_failure_time))::integer, 999999) as elapsed
            FROM circuit_breakers
            WHERE operation_name='$operation_name'
        " 2>/dev/null | tr -d ' ')
    fi

    if [ -z "$circuit_data" ]; then
        # Create new circuit in CLOSED state
        orch_db_exec "
            INSERT INTO circuit_breakers (operation_name, state, failure_count, success_count)
            VALUES ('$operation_name', 'CLOSED', 0, 0)
        " >/dev/null 2>&1
        circuit_data="CLOSED|0|999999"
    fi

    local state=$(echo "$circuit_data" | cut -d'|' -f1)
    local failure_count=$(echo "$circuit_data" | cut -d'|' -f2)
    local elapsed=$(echo "$circuit_data" | cut -d'|' -f3)

    # Handle circuit states
    case "$state" in
        "OPEN")
            if [ "$elapsed" -ge "$CIRCUIT_COOLDOWN_PERIOD" ]; then
                log_info "Circuit cooldown complete, entering HALF_OPEN: $operation_name"
                orch_db_exec "
                    UPDATE circuit_breakers
                    SET state='HALF_OPEN', last_state_change=NOW()
                    WHERE operation_name='$operation_name'
                " >/dev/null 2>&1
                state="HALF_OPEN"
            else
                log_warn "Circuit breaker OPEN for $operation_name (cooldown: ${elapsed}/${CIRCUIT_COOLDOWN_PERIOD}s) - FAST FAIL"
                return 2
            fi
            ;;
        "HALF_OPEN")
            log_info "Circuit HALF_OPEN for $operation_name (test request)"
            ;;
        "CLOSED")
            log_verbose "Circuit CLOSED for $operation_name (normal operation)"
            ;;
    esac

    # Execute operation
    local start_time=$(date +%s)
    local exit_code
    
    # ARCHITECTURE DECISION: Stream vs Capture
    # - BUILD operations: Generate gigabytes → MUST stream
    # - SERVICE operations: Start containers, long health checks → MUST stream  
    # - Quick operations: Can capture for error reporting
    case "$operation_name" in
        *_build|*_BUILD|hub_phase_build|*_SERVICES|*_services|hub_phase_services)
            # Stream directly - no output capture
            "${command[@]}"
            exit_code=$?
            ;;
        *)
            # Quick operations: capture for error reporting
            local output
            output=$("${command[@]}" 2>&1)
            exit_code=$?
            ;;
    esac

    if [ $exit_code -eq 0 ]; then
        local duration=$(($(date +%s) - start_time))
        log_success "$operation_name succeeded (${duration}s)"

        # Record success - close circuit
        orch_db_exec "
            UPDATE circuit_breakers
            SET success_count = success_count + 1,
                failure_count = 0,
                last_success_time = NOW(),
                state = 'CLOSED',
                last_state_change = CASE WHEN state != 'CLOSED' THEN NOW() ELSE last_state_change END
            WHERE operation_name='$operation_name'
        " >/dev/null 2>&1

        return 0
    else
        log_warn "$operation_name failed (exit code: $exit_code)"
        # Only log output if it was captured
        if [ -n "${output:-}" ]; then
            log_verbose "Error output: $output"
        fi

        local new_failure_count=$((failure_count + 1))

        if [ $new_failure_count -ge $CIRCUIT_FAILURE_THRESHOLD ]; then
            log_error "Circuit breaker OPENING for $operation_name (failures: $new_failure_count/$CIRCUIT_FAILURE_THRESHOLD)"
            orch_db_exec "
                UPDATE circuit_breakers
                SET failure_count = $new_failure_count,
                    state = 'OPEN',
                    last_failure_time = NOW(),
                    last_state_change = NOW()
                WHERE operation_name='$operation_name'
            " >/dev/null 2>&1
        else
            orch_db_exec "
                UPDATE circuit_breakers
                SET failure_count = $new_failure_count,
                    last_failure_time = NOW()
                WHERE operation_name='$operation_name'
            " >/dev/null 2>&1
        fi

        return 1
    fi
}

##
# Check if circuit breaker is open
#
# Arguments:
#   $1 - Operation name
#
# Returns:
#   0 - Circuit is OPEN
#   1 - Circuit is not OPEN
##
orch_circuit_breaker_is_open() {
    local operation_name="$1"

    if ! type orch_db_check_connection &>/dev/null || ! orch_db_check_connection; then
        return 1
    fi

    local state=$(orch_db_exec "
        SELECT state FROM circuit_breakers WHERE operation_name='$operation_name'
    " 2>/dev/null | xargs)

    [ "$state" = "OPEN" ]
}

##
# Manually reset circuit breaker
#
# Arguments:
#   $1 - Operation name
##
orch_circuit_breaker_reset() {
    local operation_name="$1"

    log_info "Resetting circuit breaker: $operation_name"

    orch_db_exec "
        UPDATE circuit_breakers
        SET state='CLOSED', failure_count=0, success_count=0, last_state_change=NOW()
        WHERE operation_name='$operation_name'
    " >/dev/null 2>&1

    log_success "Circuit breaker reset: $operation_name"
}

##
# Initialize circuit breaker for operation
#
# Arguments:
#   $1 - Operation name
#   $2 - Initial state (default: CLOSED)
##
orch_circuit_breaker_init() {
    local operation_name="$1"
    local initial_state="${2:-CLOSED}"

    if type orch_db_check_connection &>/dev/null && orch_db_check_connection; then
        orch_db_exec "
            INSERT INTO circuit_breakers (operation_name, state, failure_count, success_count, last_state_change)
            VALUES ('$operation_name', '$initial_state', 0, 0, NOW())
            ON CONFLICT (operation_name) DO NOTHING
        " >/dev/null 2>&1
    fi
}

##
# Get status of all circuit breakers
#
# Arguments:
#   $1 - Output format: "table" or "json"
##
orch_circuit_breaker_status() {
    local format="${1:-table}"

    if ! type orch_db_check_connection &>/dev/null || ! orch_db_check_connection; then
        echo "Database unavailable"
        return 1
    fi

    case "$format" in
        json)
            orch_db_exec "
                SELECT json_agg(row_to_json(cb))
                FROM (
                    SELECT operation_name, state, failure_count, success_count,
                           to_char(last_state_change, 'YYYY-MM-DD HH24:MI:SS') as last_change
                    FROM circuit_breakers
                    ORDER BY operation_name
                ) cb
            " 2>/dev/null
            ;;
        table|*)
            echo "=== Circuit Breaker Status ==="
            printf "%-30s %-10s %-8s %-8s %-20s\n" "OPERATION" "STATE" "FAILURES" "SUCCESS" "LAST CHANGE"
            printf "%-30s %-10s %-8s %-8s %-20s\n" "─────────" "─────" "────────" "───────" "───────────"

            orch_db_exec "
                SELECT operation_name, state, failure_count, success_count,
                       to_char(last_state_change, 'MM-DD HH24:MI')
                FROM circuit_breakers
                ORDER BY
                    CASE state WHEN 'OPEN' THEN 0 WHEN 'HALF_OPEN' THEN 1 ELSE 2 END,
                    operation_name
            " 2>/dev/null | while IFS='|' read -r op state fail succ change; do
                op=$(echo "$op" | xargs)
                state=$(echo "$state" | xargs)
                fail=$(echo "$fail" | xargs)
                succ=$(echo "$succ" | xargs)
                change=$(echo "$change" | xargs)

                case "$state" in
                    OPEN)      state_display="⚡ OPEN" ;;
                    HALF_OPEN) state_display="⏳ HALF" ;;
                    CLOSED)    state_display="✓ CLOSED" ;;
                    *)         state_display="$state" ;;
                esac

                printf "%-30s %-10s %-8s %-8s %-20s\n" "$op" "$state_display" "$fail" "$succ" "$change"
            done
            ;;
    esac
}

##
# Reset all OPEN circuit breakers
##
orch_circuit_breaker_reset_all_open() {
    if ! type orch_db_check_connection &>/dev/null || ! orch_db_check_connection; then
        log_error "Database unavailable"
        return 1
    fi

    local reset_count=$(orch_db_exec "
        UPDATE circuit_breakers
        SET state='CLOSED', failure_count=0, success_count=0, last_state_change=NOW()
        WHERE state='OPEN'
        RETURNING operation_name
    " 2>/dev/null | wc -l | xargs)

    log_info "Reset $reset_count OPEN circuit breakers to CLOSED"
    echo "$reset_count"
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f orch_circuit_breaker_execute
export -f orch_circuit_breaker_is_open
export -f orch_circuit_breaker_reset
export -f orch_circuit_breaker_init
export -f orch_circuit_breaker_status
export -f orch_circuit_breaker_reset_all_open

log_verbose "Circuit breaker module loaded"
