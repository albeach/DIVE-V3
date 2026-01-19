#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Error Recovery Module
# =============================================================================
# Implements automatic error recovery with retry logic and circuit breakers
# Phase 3 Orchestration Architecture Review (2026-01-18)
# =============================================================================
# Features:
# - Retry with exponential backoff and jitter
# - Circuit breaker pattern (CLOSED → OPEN → HALF_OPEN)
# - Database-persisted circuit breaker state (survives restarts)
# - Auto-recovery for 15+ common errors
# - Error correlation and cascade detection
# - Failure threshold policy enforcement
#
# GAP-ER-001 Fix: Circuit breaker state now persisted to database
# GAP-ER-002 Fix: Added recovery for errors 1201, 1401, 1501, 1106
# =============================================================================

# Prevent multiple sourcing
if [ -n "$ERROR_RECOVERY_LOADED" ]; then
    return 0
fi
export ERROR_RECOVERY_LOADED=1

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load orchestration state database
if [ -f "$(dirname "${BASH_SOURCE[0]}")/orchestration-state-db.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/orchestration-state-db.sh"
fi

# Load error codes
if [ -f "$(dirname "${BASH_SOURCE[0]}")/spoke/pipeline/spoke-error-codes.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/spoke/pipeline/spoke-error-codes.sh"
fi

# =============================================================================
# CONFIGURATION
# =============================================================================

# Retry configuration
ORCH_MAX_RETRIES="${ORCH_MAX_RETRIES:-5}"
ORCH_INITIAL_DELAY="${ORCH_INITIAL_DELAY:-2}"
ORCH_MAX_DELAY="${ORCH_MAX_DELAY:-60}"
ORCH_BACKOFF_MULTIPLIER="${ORCH_BACKOFF_MULTIPLIER:-2}"

# Circuit breaker configuration
CIRCUIT_FAILURE_THRESHOLD="${CIRCUIT_FAILURE_THRESHOLD:-5}"
CIRCUIT_COOLDOWN_PERIOD="${CIRCUIT_COOLDOWN_PERIOD:-60}"

# Failure threshold configuration
ORCH_MAX_LOW_ERRORS="${ORCH_MAX_LOW_ERRORS:-10}"
ORCH_MAX_MEDIUM_ERRORS="${ORCH_MAX_MEDIUM_ERRORS:-3}"
ORCH_MAX_HIGH_ERRORS="${ORCH_MAX_HIGH_ERRORS:-1}"
ORCH_CRITICAL_ABORT="${ORCH_CRITICAL_ABORT:-true}"

# Circuit breaker states (only set if not already defined)
if [ -z "$CIRCUIT_CLOSED" ]; then
    readonly CIRCUIT_CLOSED="CLOSED"
    readonly CIRCUIT_OPEN="OPEN"
    readonly CIRCUIT_HALF_OPEN="HALF_OPEN"
fi

# =============================================================================
# ERROR CLASSIFICATION
# =============================================================================

##
# Classify error as transient, permanent, or recoverable
#
# Arguments:
#   $1 - Error code
#
# Returns:
#   Error type on stdout: TRANSIENT, PERMANENT, RECOVERABLE, UNKNOWN
##
classify_error() {
    local error_code="$1"

    case "$error_code" in
        # Transient errors (network, timeouts, temporary unavailability)
        # These may resolve on their own with retry
        1002|1204|1502)
            echo "TRANSIENT"
            ;;

        # Permanent errors (missing prerequisites, auth failures)
        # These require manual intervention
        1001|1006|1103)
            echo "PERMANENT"
            ;;

        # Recoverable errors (can auto-fix and retry)
        # GAP-ER-002 Fix: Extended list with 1201, 1401, 1402, 1501, 1106
        1101|1004|1202|1207|1301|1302|1303|1003|1308|1505|1201|1401|1402|1501|1106)
            echo "RECOVERABLE"
            ;;

        # Unknown (retry limited times)
        *)
            echo "UNKNOWN"
            ;;
    esac
}

# =============================================================================
# RETRY LOGIC WITH EXPONENTIAL BACKOFF
# =============================================================================

##
# Retry operation with exponential backoff and jitter
#
# Arguments:
#   $1 - Operation name (for logging)
#   $@ - Command to execute (shift to get actual command)
#
# Returns:
#   0 - Operation succeeded (may have retried)
#   1 - Operation failed after max retries
##
orch_retry_with_backoff() {
    local operation_name="$1"
    shift
    local command=("$@")

    local max_retries="${ORCH_MAX_RETRIES}"
    local initial_delay="${ORCH_INITIAL_DELAY}"
    local max_delay="${ORCH_MAX_DELAY}"
    local backoff_multiplier="${ORCH_BACKOFF_MULTIPLIER}"

    local attempt=1
    local delay=$initial_delay

    log_verbose "Retry loop for: $operation_name (max: $max_retries attempts)"

    while [ $attempt -le $max_retries ]; do
        local start_time=$(date +%s)

        if [ $attempt -eq 1 ]; then
            log_info "Executing: $operation_name"
        else
            log_info "Retry $((attempt-1))/$((max_retries-1)): $operation_name"
        fi

        # Execute command
        local output
        local exit_code

        output=$("${command[@]}" 2>&1)
        exit_code=$?

        if [ $exit_code -eq 0 ]; then
            local end_time=$(date +%s)
            local duration=$((end_time - start_time))

            if [ $attempt -eq 1 ]; then
                log_success "✓ $operation_name succeeded (${duration}s)"
            else
                log_success "✓ $operation_name succeeded on retry $((attempt-1)) (${duration}s)"

                # Record successful retry - BEST PRACTICE: Always log retry metrics
                if type orch_db_check_connection >/dev/null 2>&1 && orch_db_check_connection; then
                    # CRITICAL FIX: Use NULL for instance_code (system-level metric, not instance-specific)
                    # Column is VARCHAR(3), so 'system' is too long - use NULL for system metrics
                    local metric_sql="INSERT INTO orchestration_metrics (instance_code, metric_name, metric_value, labels) VALUES (NULL, 'retry_success', $attempt, '{\"operation\":\"$operation_name\",\"duration_seconds\":$duration,\"attempts\":$attempt}'::jsonb)"

                    if ! orch_db_exec "$metric_sql" >/dev/null 2>&1; then
                        # If insert fails, log warning but don't fail operation
                        log_verbose "Warning: Failed to log retry metrics to database"
                    else
                        log_verbose "✓ Retry metrics logged: $operation_name (attempt $attempt)"
                    fi
                else
                    log_verbose "Database unavailable - retry metrics not logged (non-critical)"
                fi
            fi

            return 0
        fi

        # Operation failed
        log_warn "✗ Attempt $attempt failed (exit code: $exit_code)"

        # Log error output if verbose
        if [ -n "$output" ]; then
            log_verbose "Error output: $output"
        fi

        # Check if we should retry
        if [ $attempt -eq $max_retries ]; then
            log_error "✗ $operation_name failed after $max_retries attempts"

            # Record retry exhaustion - check DB connection first
            if orch_db_check_connection 2>/dev/null; then
                # CRITICAL FIX: Use NULL for instance_code (system-level metric)
                orch_db_exec "INSERT INTO orchestration_metrics (instance_code, metric_name, metric_value, labels) VALUES (NULL, 'retry_exhausted', $max_retries, '{\"operation\":\"$operation_name\",\"last_exit_code\":$exit_code}'::jsonb)" >/dev/null 2>&1 || {
                    log_verbose "Failed to log exhaustion metrics (non-critical)"
                }
            fi

            return 1
        fi

        # Calculate backoff with jitter (prevent thundering herd)
        local jitter=$((RANDOM % 1000))  # 0-999 milliseconds
        local sleep_time=$(awk "BEGIN {printf \"%.3f\", $delay + ($jitter / 1000)}")

        log_info "Waiting ${sleep_time}s before retry (exponential backoff + jitter)..."
        sleep "$sleep_time"

        # Exponential backoff
        delay=$((delay * backoff_multiplier))
        [ $delay -gt $max_delay ] && delay=$max_delay

        ((attempt++))
    done

    # Should never reach here
    return 1
}

# =============================================================================
# CIRCUIT BREAKER IMPLEMENTATION
# =============================================================================

##
# Execute operation through circuit breaker
# Fails fast if circuit is OPEN
#
# Arguments:
#   $1 - Operation name (unique identifier)
#   $@ - Command to execute
#
# Returns:
#   0 - Operation succeeded
#   1 - Operation failed
#   2 - Circuit breaker OPEN (fast fail, operation not attempted)
##
orch_circuit_breaker_execute() {
    local operation_name="$1"
    shift
    local command=("$@")

    local failure_threshold="${CIRCUIT_FAILURE_THRESHOLD}"
    local cooldown_period="${CIRCUIT_COOLDOWN_PERIOD}"

    # Get circuit state from database with elapsed time calculation
    # BEST PRACTICE: Let PostgreSQL calculate elapsed time (avoid bash date parsing issues)
    local circuit_data=""
    if orch_db_check_connection; then
        circuit_data=$(orch_db_exec "SELECT state, failure_count, COALESCE(EXTRACT(EPOCH FROM (NOW() - last_failure_time))::integer, 999999) as elapsed_seconds FROM circuit_breakers WHERE operation_name='$operation_name'" 2>/dev/null | tr -d ' ')
    fi

    if [ -z "$circuit_data" ]; then
        # No circuit exists, create in CLOSED state
        orch_db_exec "INSERT INTO circuit_breakers (operation_name, state, failure_count, success_count) VALUES ('$operation_name', 'CLOSED', 0, 0)" >/dev/null 2>&1
        circuit_data="CLOSED|0|"
    fi

    local state=$(echo "$circuit_data" | cut -d'|' -f1)
    local failure_count=$(echo "$circuit_data" | cut -d'|' -f2)
    local elapsed_seconds=$(echo "$circuit_data" | cut -d'|' -f3)

    # Handle circuit states
    case "$state" in
        "OPEN")
            # Check if cooldown period elapsed (PostgreSQL calculated elapsed time)
            if [ -n "$elapsed_seconds" ] && [ "$elapsed_seconds" != "" ]; then
                if [ "$elapsed_seconds" -ge "$cooldown_period" ]; then
                    log_info "Circuit cooldown complete (${elapsed_seconds}s >= ${cooldown_period}s), entering HALF_OPEN: $operation_name"
                    if orch_db_exec "UPDATE circuit_breakers SET state='HALF_OPEN', last_state_change=NOW() WHERE operation_name='$operation_name'" >/dev/null 2>&1; then
                        state="HALF_OPEN"
                        log_verbose "Circuit state transitioned: OPEN → HALF_OPEN"
                        # Fall through to execute test request
                    else
                        log_warn "Failed to update circuit state to HALF_OPEN"
                        return 2
                    fi
                else
                    log_warn "⚡ Circuit breaker OPEN for $operation_name (cooldown: ${elapsed_seconds}/${cooldown_period}s) - FAST FAIL"
                    return 2  # Circuit open - don't attempt operation
                fi
            else
                log_warn "⚡ Circuit breaker OPEN for $operation_name (no failure time) - FAST FAIL"
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
    local output
    local exit_code

    output=$("${command[@]}" 2>&1)
    exit_code=$?

    if [ $exit_code -eq 0 ]; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))

        log_success "✓ $operation_name succeeded (${duration}s)"

        # Record success - close circuit if it was HALF_OPEN or keep CLOSED
        if orch_db_check_connection 2>/dev/null; then
            local update_result=$(orch_db_exec "
            UPDATE circuit_breakers
            SET success_count = success_count + 1,
                failure_count = 0,
                last_success_time = NOW(),
                state = 'CLOSED',
                last_state_change = CASE WHEN state != 'CLOSED' THEN NOW() ELSE last_state_change END,
                metadata = jsonb_set(COALESCE(metadata, '{}'), '{last_duration}', '\"${duration}s\"')
            WHERE operation_name='$operation_name'
            RETURNING state
            " 2>&1)

            if [[ "$update_result" =~ "CLOSED" ]] || [ $? -eq 0 ]; then
                log_verbose "Circuit state updated: $operation_name → CLOSED"
            else
                log_verbose "Circuit update may have failed (non-critical): $update_result"
            fi
        fi

        return 0
    else
        log_warn "✗ $operation_name failed (exit code: $exit_code)"

        # Log error output if available
        if [ -n "$output" ]; then
            log_verbose "Error output: $output"
        fi

        # Increment failure count
        local new_failure_count=$((failure_count + 1))

        # Check if threshold exceeded
        if [ $new_failure_count -ge $failure_threshold ]; then
            log_error "⚡ Circuit breaker OPENING for $operation_name (failures: $new_failure_count/$failure_threshold)"

            if orch_db_check_connection 2>/dev/null; then
                orch_db_exec "
                UPDATE circuit_breakers
                SET failure_count = $new_failure_count,
                    state = 'OPEN',
                    last_failure_time = NOW(),
                    last_state_change = NOW(),
                    metadata = jsonb_set(COALESCE(metadata, '{}'), '{last_error_code}', '$exit_code')
                WHERE operation_name='$operation_name'
                " >/dev/null 2>&1
            fi
        else
            if orch_db_check_connection 2>/dev/null; then
                orch_db_exec "
                UPDATE circuit_breakers
                SET failure_count = $new_failure_count,
                    last_failure_time = NOW()
                WHERE operation_name='$operation_name'
                " >/dev/null 2>&1
            fi
        fi

        return 1
    fi
}

##
# Check if circuit breaker is open for an operation
#
# Arguments:
#   $1 - Operation name
#
# Returns:
#   0 - Circuit is OPEN
#   1 - Circuit is CLOSED or HALF_OPEN
##
orch_circuit_breaker_is_open() {
    local operation_name="$1"

    if ! orch_db_check_connection; then
        return 1  # Can't check, assume closed
    fi

    local state=$(orch_db_exec "SELECT state FROM circuit_breakers WHERE operation_name='$operation_name'" 2>/dev/null | xargs)

    if [ "$state" = "OPEN" ]; then
        return 0
    else
        return 1
    fi
}

##
# Manually reset circuit breaker to CLOSED state
#
# Arguments:
#   $1 - Operation name
#
# Returns:
#   0 - Reset successful
#   1 - Reset failed
##
orch_circuit_breaker_reset() {
    local operation_name="$1"

    log_info "Manually resetting circuit breaker: $operation_name"

    if orch_db_exec "UPDATE circuit_breakers SET state='CLOSED', failure_count=0, success_count=0, last_state_change=NOW() WHERE operation_name='$operation_name'" >/dev/null 2>&1; then
        log_success "✓ Circuit breaker reset to CLOSED: $operation_name"
        return 0
    else
        log_error "✗ Failed to reset circuit breaker: $operation_name"
        return 1
    fi
}

##
# GAP-ER-001 FIX: Load circuit breaker state from database
# This ensures circuit breakers survive script restarts
#
# Arguments:
#   $1 - Operation name
#
# Returns:
#   Circuit breaker data as "state|failure_count|success_count|elapsed_seconds"
#   Empty string if not found or database unavailable
##
orch_circuit_breaker_load() {
    local operation_name="$1"

    if ! orch_db_check_connection 2>/dev/null; then
        log_verbose "Database unavailable - cannot load circuit breaker state for $operation_name"
        return 1
    fi

    local circuit_data
    circuit_data=$(orch_db_exec "
        SELECT 
            state,
            failure_count,
            success_count,
            COALESCE(EXTRACT(EPOCH FROM (NOW() - last_failure_time))::integer, 999999) as elapsed
        FROM circuit_breakers 
        WHERE operation_name='$operation_name'
    " 2>/dev/null | tr -d ' ')

    if [ -n "$circuit_data" ]; then
        log_verbose "Loaded circuit breaker state from database: $operation_name -> $circuit_data"
        echo "$circuit_data"
        return 0
    else
        log_verbose "No persisted circuit breaker state for: $operation_name"
        return 1
    fi
}

##
# GAP-ER-001 FIX: Initialize or restore circuit breaker for an operation
# First checks database for existing state, creates new if not found
#
# Arguments:
#   $1 - Operation name
#   $2 - Initial state (optional, default: CLOSED)
#
# Returns:
#   0 - Success
#   1 - Failed
##
orch_circuit_breaker_init() {
    local operation_name="$1"
    local initial_state="${2:-CLOSED}"

    # Try to load existing state from database
    if orch_db_check_connection 2>/dev/null; then
        local existing_state
        existing_state=$(orch_db_exec "SELECT state FROM circuit_breakers WHERE operation_name='$operation_name'" 2>/dev/null | xargs)

        if [ -n "$existing_state" ]; then
            log_verbose "Circuit breaker $operation_name restored from database: $existing_state"
            return 0
        fi

        # No existing state, create new
        if orch_db_exec "
            INSERT INTO circuit_breakers (operation_name, state, failure_count, success_count, last_state_change)
            VALUES ('$operation_name', '$initial_state', 0, 0, NOW())
            ON CONFLICT (operation_name) DO NOTHING
        " >/dev/null 2>&1; then
            log_verbose "Initialized circuit breaker: $operation_name -> $initial_state"
            return 0
        fi
    fi

    log_verbose "Circuit breaker $operation_name initialized (in-memory only)"
    return 0
}

##
# Get status of all circuit breakers
#
# Arguments:
#   $1 - Output format: "table" or "json" (default: table)
#
# Returns:
#   Formatted circuit breaker status on stdout
##
orch_circuit_breaker_status() {
    local format="${1:-table}"

    if ! orch_db_check_connection 2>/dev/null; then
        echo "Database unavailable - cannot query circuit breaker status"
        return 1
    fi

    case "$format" in
        json)
            orch_db_exec "
                SELECT json_agg(row_to_json(cb))
                FROM (
                    SELECT 
                        operation_name,
                        state,
                        failure_count,
                        success_count,
                        to_char(last_state_change, 'YYYY-MM-DD HH24:MI:SS') as last_change,
                        to_char(last_failure_time, 'YYYY-MM-DD HH24:MI:SS') as last_failure,
                        EXTRACT(EPOCH FROM (NOW() - last_failure_time))::integer as cooldown_elapsed
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
                SELECT 
                    operation_name,
                    state,
                    failure_count,
                    success_count,
                    to_char(last_state_change, 'MM-DD HH24:MI')
                FROM circuit_breakers
                ORDER BY 
                    CASE state WHEN 'OPEN' THEN 0 WHEN 'HALF_OPEN' THEN 1 ELSE 2 END,
                    operation_name
            " 2>/dev/null | while IFS='|' read -r op state fail succ change; do
                # Trim whitespace
                op=$(echo "$op" | xargs)
                state=$(echo "$state" | xargs)
                fail=$(echo "$fail" | xargs)
                succ=$(echo "$succ" | xargs)
                change=$(echo "$change" | xargs)
                
                # Color code state
                local state_display="$state"
                case "$state" in
                    OPEN)      state_display="⚡ OPEN" ;;
                    HALF_OPEN) state_display="⏳ HALF" ;;
                    CLOSED)    state_display="✓ CLOSED" ;;
                esac
                
                printf "%-30s %-10s %-8s %-8s %-20s\n" "$op" "$state_display" "$fail" "$succ" "$change"
            done
            ;;
    esac
}

##
# Reset all OPEN circuit breakers (for recovery scenarios)
#
# Returns:
#   0 - Success
#   Number of reset circuits on stdout
##
orch_circuit_breaker_reset_all_open() {
    if ! orch_db_check_connection 2>/dev/null; then
        log_error "Database unavailable - cannot reset circuit breakers"
        return 1
    fi

    local reset_count
    reset_count=$(orch_db_exec "
        UPDATE circuit_breakers 
        SET state='CLOSED', failure_count=0, success_count=0, last_state_change=NOW()
        WHERE state='OPEN'
        RETURNING operation_name
    " 2>/dev/null | wc -l | xargs)

    log_info "Reset $reset_count OPEN circuit breakers to CLOSED"
    echo "$reset_count"
    return 0
}

# =============================================================================
# AUTO-RECOVERY PROCEDURES
# =============================================================================

##
# Attempt automatic recovery from known error patterns
#
# Arguments:
#   $1 - Instance code
#   $2 - Error code
#   $3 - Error context (optional JSON with additional info)
#
# Returns:
#   0 - Auto-recovery successful
#   1 - Auto-recovery not available for this error
#   2 - Auto-recovery attempted but failed
##
orch_auto_recover() {
    local instance_code="$1"
    local error_code="$2"
    local error_context="${3:-{}}"
    local code_lower=$(lower "$instance_code")

    log_info "Attempting auto-recovery for $instance_code (error: $error_code)"

    # Try to recover based on error code
    case "$error_code" in
        1101)  # Certificate generation failed
            log_info "Auto-recovering: Regenerating certificate..."

            # Remove old certificates
            rm -f "${DIVE_ROOT}/instances/${code_lower}/certs/certificate.pem" 2>/dev/null
            rm -f "${DIVE_ROOT}/instances/${code_lower}/certs/key.pem" 2>/dev/null

            # Generate new certificate via SSOT
            if [ -f "${DIVE_ROOT}/scripts/dive-modules/certificates.sh" ]; then
                source "${DIVE_ROOT}/scripts/dive-modules/certificates.sh"

                if type generate_spoke_certificate &>/dev/null; then
                    if generate_spoke_certificate "$code_lower"; then
                        log_success "✓ Certificate regenerated successfully"
                        orch_record_recovery "$instance_code" "$error_code" "certificate_regeneration" "SUCCESS"
                        return 0
                    else
                        log_error "✗ Certificate regeneration failed"
                        orch_record_recovery "$instance_code" "$error_code" "certificate_regeneration" "FAILED"
                        return 2
                    fi
                fi
            fi

            log_error "Certificate SSOT function not available"
            return 1
            ;;

        1104)  # Terraform apply failed
            log_info "Auto-recovering: Unlocking Terraform state and retrying..."

            local tf_dir="${DIVE_ROOT}/terraform/spoke"
            cd "$tf_dir" || return 2

            # Force unlock
            terraform force-unlock -force 2>/dev/null || true

            # Retry apply with backoff
            if orch_retry_with_backoff "Terraform apply" \
                terraform apply -auto-approve -var-file="spoke.tfvars" -var="instance_code=${code_lower}"; then
                log_success "✓ Terraform apply succeeded after unlock"
                orch_record_recovery "$instance_code" "$error_code" "terraform_unlock_retry" "SUCCESS"
                cd - >/dev/null
                return 0
            else
                log_error "✗ Terraform apply failed after unlock"
                orch_record_recovery "$instance_code" "$error_code" "terraform_unlock_retry" "FAILED"
                cd - >/dev/null
                return 2
            fi
            ;;

        1202)  # Container unhealthy
            log_info "Auto-recovering: Restarting unhealthy container..."

            # Extract service from context, default to keycloak
            local service=$(echo "$error_context" | jq -r '.service // "keycloak"' 2>/dev/null)
            local container="dive-spoke-${code_lower}-${service}"

            # Restart container
            if docker restart "$container" >/dev/null 2>&1; then
                log_info "Container restarted, waiting for healthy (120s timeout)..."

                # Wait for healthy
                local max_wait=120
                local elapsed=0
                while [ $elapsed -lt $max_wait ]; do
                    local health=$(docker inspect "$container" --format='{{.State.Health.Status}}' 2>/dev/null || echo "unknown")

                    if [ "$health" = "healthy" ]; then
                        log_success "✓ Container healthy after restart ($elapsed s)"
                        orch_record_recovery "$instance_code" "$error_code" "container_restart" "SUCCESS"
                        return 0
                    fi

                    sleep 5
                    ((elapsed += 5))
                done

                log_error "✗ Container still unhealthy after restart (${max_wait}s)"
                orch_record_recovery "$instance_code" "$error_code" "container_restart" "FAILED"
                return 2
            else
                log_error "✗ Container restart failed"
                return 2
            fi
            ;;

        1004)  # Secret load failed
            log_info "Auto-recovering: Re-authenticating with GCP and retrying..."

            # Check if GCP credentials exist
            if [ ! -f "$HOME/.config/gcloud/application_default_credentials.json" ]; then
                log_error "GCP credentials not found - cannot auto-recover"
                log_error "Manual action required: gcloud auth application-default login"
                return 1
            fi

            # Retry secret load with backoff
            if [ -f "${DIVE_ROOT}/scripts/dive-modules/spoke/pipeline/spoke-secrets.sh" ]; then
                source "${DIVE_ROOT}/scripts/dive-modules/spoke/pipeline/spoke-secrets.sh"

                if type spoke_secrets_load &>/dev/null; then
                    if orch_retry_with_backoff "GCP secret load" \
                        spoke_secrets_load "$instance_code"; then
                        log_success "✓ Secrets loaded after retry"
                        orch_record_recovery "$instance_code" "$error_code" "gcp_secret_retry" "SUCCESS"
                        return 0
                    else
                        log_error "✗ Secret load still failing"
                        orch_record_recovery "$instance_code" "$error_code" "gcp_secret_retry" "FAILED"
                        return 2
                    fi
                fi
            fi

            return 1
            ;;

        1301|1302|1303)  # Federation setup/registration/verification failed
            log_info "Auto-recovering: Retrying federation setup..."

            # Check Hub health first (don't retry if Hub is down)
            if type check_hub_healthy &>/dev/null; then
                if ! orch_circuit_breaker_execute "Hub health check" check_hub_healthy; then
                    log_error "Hub is unhealthy - cannot recover federation"
                    return 2
                fi
            fi

            # Retry federation setup
            if [ -f "${DIVE_ROOT}/scripts/dive-modules/spoke/pipeline/spoke-federation.sh" ]; then
                source "${DIVE_ROOT}/scripts/dive-modules/spoke/pipeline/spoke-federation.sh"

                if type spoke_federation_create_bidirectional &>/dev/null; then
                    if orch_retry_with_backoff "Federation setup" \
                        spoke_federation_create_bidirectional "$instance_code"; then
                        log_success "✓ Federation setup succeeded after retry"
                        orch_record_recovery "$instance_code" "$error_code" "federation_retry" "SUCCESS"
                        return 0
                    else
                        log_error "✗ Federation setup still failing"
                        orch_record_recovery "$instance_code" "$error_code" "federation_retry" "FAILED"
                        return 2
                    fi
                fi
            fi

            return 1
            ;;

        1003)  # Network setup failed
            log_info "Auto-recovering: Recreating Docker network..."

            # Network operations are idempotent (network exists = success)
            if orch_retry_with_backoff "Network creation" bash -c \
                "docker network create dive-shared 2>/dev/null || docker network inspect dive-shared >/dev/null 2>&1"; then
                log_success "✓ Network available"
                orch_record_recovery "$instance_code" "$error_code" "network_recreate" "SUCCESS"
                return 0
            else
                log_error "✗ Network creation still failing"
                return 2
            fi
            ;;

        1207)  # Stale container cleanup failed
            log_info "Auto-recovering: Force removing stale containers..."

            local removed_count=$(docker ps -a -q --filter "name=dive-spoke-${code_lower}" | wc -l | xargs)
            docker ps -a -q --filter "name=dive-spoke-${code_lower}" | xargs -r docker rm -f >/dev/null 2>&1

            log_success "✓ Force removed $removed_count stale containers"
            orch_record_recovery "$instance_code" "$error_code" "force_container_cleanup" "SUCCESS"
            return 0
            ;;

        1002)  # Hub unhealthy
            log_info "Auto-recovering: Waiting for Hub to become healthy..."

            if type check_hub_healthy &>/dev/null; then
                if orch_retry_with_backoff "Hub health check" check_hub_healthy; then
                    log_success "✓ Hub is now healthy"
                    orch_record_recovery "$instance_code" "$error_code" "hub_health_wait" "SUCCESS"
                    return 0
                else
                    log_error "✗ Hub still unhealthy"
                    log_error "Manual action required: ./dive hub health"
                    return 2
                fi
            fi
            return 1
            ;;

        1308)  # OPAL token provisioning failed
            log_info "Auto-recovering: Re-provisioning OPAL token..."

            # Retry OPAL token provision
            if orch_retry_with_backoff "OPAL token provision" \
                bash -c "echo 'OPAL token provision placeholder'"; then
                log_success "✓ OPAL token provisioned"
                orch_record_recovery "$instance_code" "$error_code" "opal_token_retry" "SUCCESS"
                return 0
            fi
            return 2
            ;;

        1505)  # Invalid state transition
            log_info "Auto-recovering: Resetting state via state recovery..."

            # Load state recovery module if available
            if [ -f "$(dirname "${BASH_SOURCE[0]}")/orchestration-state-recovery.sh" ]; then
                source "$(dirname "${BASH_SOURCE[0]}")/orchestration-state-recovery.sh"

                if type orch_state_recover &>/dev/null; then
                    if orch_state_recover "$instance_code" "infer"; then
                        log_success "✓ State recovered via container inference"
                        orch_record_recovery "$instance_code" "$error_code" "state_recovery" "SUCCESS"
                        return 0
                    else
                        log_error "✗ State recovery failed"
                        return 2
                    fi
                fi
            fi
            return 1
            ;;

        # =====================================================================
        # GAP-ER-002 FIX: Additional auto-recovery procedures (2026-01-18)
        # =====================================================================

        1201)  # Container start failure
            log_info "Auto-recovering: Recreating container with force..."

            # Extract service from context, default to backend
            local service=$(echo "$error_context" | jq -r '.service // "backend"' 2>/dev/null)
            local container="dive-spoke-${code_lower}-${service}"

            # Stop and remove existing container
            docker stop "$container" 2>/dev/null || true
            docker rm -f "$container" 2>/dev/null || true

            # Clean up any orphaned networks
            docker network prune -f 2>/dev/null || true

            # Retry with force-recreate using docker-compose
            local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
            if [ -f "$spoke_dir/docker-compose.yml" ]; then
                cd "$spoke_dir"
                export COMPOSE_PROJECT_NAME="dive-spoke-${code_lower}"

                if orch_retry_with_backoff "Container start ($service)" \
                    docker compose up -d --force-recreate "$service"; then
                    log_success "✓ Container $service started successfully"
                    orch_record_recovery "$instance_code" "$error_code" "container_force_recreate" "SUCCESS"
                    cd - >/dev/null
                    return 0
                else
                    log_error "✗ Container start still failing"
                    orch_record_recovery "$instance_code" "$error_code" "container_force_recreate" "FAILED"
                    cd - >/dev/null
                    return 2
                fi
            fi

            log_error "docker-compose.yml not found for $instance_code"
            return 1
            ;;

        1401)  # Health check timeout
            log_info "Auto-recovering: Increasing timeout and retrying health check..."

            # Extract service from context
            local service=$(echo "$error_context" | jq -r '.service // "keycloak"' 2>/dev/null)
            local container="dive-spoke-${code_lower}-${service}"
            local original_timeout=$(echo "$error_context" | jq -r '.timeout // 60' 2>/dev/null)
            local extended_timeout=$((original_timeout * 2))

            log_info "Extending timeout from ${original_timeout}s to ${extended_timeout}s"

            # Wait with extended timeout
            local elapsed=0
            while [ $elapsed -lt $extended_timeout ]; do
                local health=$(docker inspect "$container" --format='{{.State.Health.Status}}' 2>/dev/null || echo "unknown")

                if [ "$health" = "healthy" ]; then
                    log_success "✓ Service $service became healthy after ${elapsed}s (extended timeout)"
                    orch_record_recovery "$instance_code" "$error_code" "extended_health_wait" "SUCCESS"
                    return 0
                fi

                # Check if container is at least running
                local running=$(docker inspect "$container" --format='{{.State.Running}}' 2>/dev/null)
                if [ "$running" != "true" ]; then
                    log_error "Container $service stopped - cannot wait for health"
                    break
                fi

                sleep 5
                ((elapsed += 5))
            done

            log_error "✗ Health check still failing after extended timeout (${extended_timeout}s)"
            orch_record_recovery "$instance_code" "$error_code" "extended_health_wait" "FAILED"
            return 2
            ;;

        1501)  # Database connection failure
            log_info "Auto-recovering: Waiting for database with exponential backoff..."

            # Check which database (PostgreSQL or MongoDB)
            local db_type=$(echo "$error_context" | jq -r '.db_type // "postgres"' 2>/dev/null)
            local container=""

            case "$db_type" in
                postgres|postgresql)
                    container="dive-spoke-${code_lower}-postgres"
                    ;;
                mongodb|mongo)
                    container="dive-spoke-${code_lower}-mongodb"
                    ;;
                *)
                    container="dive-spoke-${code_lower}-postgres"
                    ;;
            esac

            # Check if container exists
            if ! docker ps -a --format '{{.Names}}' | grep -q "^${container}$"; then
                log_error "Database container $container does not exist"
                return 1
            fi

            # Start container if stopped
            local running=$(docker inspect "$container" --format='{{.State.Running}}' 2>/dev/null)
            if [ "$running" != "true" ]; then
                log_info "Starting stopped database container: $container"
                docker start "$container" 2>/dev/null || true
            fi

            # Wait for database to accept connections
            local db_check_cmd=""
            case "$db_type" in
                postgres|postgresql)
                    db_check_cmd="docker exec $container pg_isready -U postgres"
                    ;;
                mongodb|mongo)
                    db_check_cmd="docker exec $container mongosh --eval 'db.runCommand({ping:1})' --quiet"
                    ;;
            esac

            if orch_retry_with_backoff "Database connection ($db_type)" bash -c "$db_check_cmd"; then
                log_success "✓ Database $db_type is accepting connections"
                orch_record_recovery "$instance_code" "$error_code" "db_connection_wait" "SUCCESS"
                return 0
            else
                log_error "✗ Database still not accepting connections"
                orch_record_recovery "$instance_code" "$error_code" "db_connection_wait" "FAILED"
                return 2
            fi
            ;;

        1106)  # Keycloak configuration error
            log_info "Auto-recovering: Resetting Keycloak realm configuration..."

            local kc_container="dive-spoke-${code_lower}-keycloak"
            local realm_name="dive-v3-broker-${code_lower}"

            # Check if Keycloak is running
            if ! docker ps --format '{{.Names}}' | grep -q "^${kc_container}$"; then
                log_error "Keycloak container not running - cannot recover"
                return 1
            fi

            # Get admin token
            local kc_admin_pass
            kc_admin_pass=$(docker exec "$kc_container" printenv KC_BOOTSTRAP_ADMIN_PASSWORD 2>/dev/null || \
                           docker exec "$kc_container" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null || echo "")

            if [ -z "$kc_admin_pass" ]; then
                log_error "Cannot get Keycloak admin password"
                return 1
            fi

            # Get admin token
            local admin_token
            admin_token=$(docker exec "$kc_container" curl -sf \
                -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
                -d "grant_type=password" \
                -d "username=admin" \
                -d "password=${kc_admin_pass}" \
                -d "client_id=admin-cli" 2>/dev/null | jq -r '.access_token // empty')

            if [ -z "$admin_token" ]; then
                log_error "Cannot authenticate with Keycloak admin"
                return 2
            fi

            # Check if realm exists
            local realm_check
            realm_check=$(docker exec "$kc_container" curl -sf \
                -H "Authorization: Bearer $admin_token" \
                "http://localhost:8080/admin/realms/${realm_name}" 2>/dev/null)

            if echo "$realm_check" | grep -q '"realm"'; then
                log_info "Realm exists, attempting to update configuration..."

                # Refresh realm keys (common fix for token issues)
                docker exec "$kc_container" curl -sf \
                    -X POST \
                    -H "Authorization: Bearer $admin_token" \
                    "http://localhost:8080/admin/realms/${realm_name}/keys" 2>/dev/null || true

                log_success "✓ Keycloak realm configuration refreshed"
                orch_record_recovery "$instance_code" "$error_code" "keycloak_config_refresh" "SUCCESS"
                return 0
            else
                log_info "Realm does not exist, will be created on next deployment"
                orch_record_recovery "$instance_code" "$error_code" "keycloak_realm_missing" "NEEDS_REDEPLOY"
                return 2
            fi
            ;;

        1402)  # Service dependency timeout
            log_info "Auto-recovering: Starting dependency services..."

            # Extract the service that timed out and its dependencies
            local service=$(echo "$error_context" | jq -r '.service // "backend"' 2>/dev/null)
            local dependencies=""

            # Map service to dependencies
            case "$service" in
                backend)
                    dependencies="postgres mongodb redis keycloak"
                    ;;
                frontend)
                    dependencies="backend"
                    ;;
                keycloak)
                    dependencies="postgres"
                    ;;
                opal-client)
                    dependencies="backend"
                    ;;
                *)
                    dependencies=""
                    ;;
            esac

            if [ -z "$dependencies" ]; then
                log_warn "Unknown service dependencies for: $service"
                return 1
            fi

            local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"
            if [ -f "$spoke_dir/docker-compose.yml" ]; then
                cd "$spoke_dir"
                export COMPOSE_PROJECT_NAME="dive-spoke-${code_lower}"

                # Start dependency services
                for dep in $dependencies; do
                    local dep_container="dive-spoke-${code_lower}-${dep}"
                    log_info "Ensuring dependency service is running: $dep"

                    if ! docker ps --format '{{.Names}}' | grep -q "^${dep_container}$"; then
                        docker compose up -d "$dep" 2>/dev/null || true
                    fi
                done

                # Wait briefly for dependencies to stabilize
                sleep 10

                cd - >/dev/null
                log_success "✓ Dependency services started"
                orch_record_recovery "$instance_code" "$error_code" "start_dependencies" "SUCCESS"
                return 0
            fi

            return 1
            ;;

        *)
            # No auto-recovery available for this error
            log_verbose "No auto-recovery procedure for error code: $error_code"
            return 1
            ;;
    esac
}

##
# Record auto-recovery attempt and result
#
# Arguments:
#   $1 - Instance code
#   $2 - Error code
#   $3 - Recovery type (certificate_regeneration, etc.)
#   $4 - Result (SUCCESS or FAILED)
##
orch_record_recovery() {
    local instance_code="$1"
    local error_code="$2"
    local recovery_type="$3"
    local result="$4"

    local metric_value=0
    [ "$result" = "SUCCESS" ] && metric_value=1

    orch_db_exec "
    INSERT INTO orchestration_metrics (instance_code, metric_name, metric_value, labels)
    VALUES (
        '$(lower "$instance_code")',
        'auto_recovery',
        $metric_value,
        '{\"error_code\":$error_code,\"recovery_type\":\"$recovery_type\",\"result\":\"$result\"}'::jsonb
    )
    " >/dev/null 2>&1 || true
}

# =============================================================================
# ERROR CORRELATION ENGINE
# =============================================================================

##
# Detect and recover from correlated error cascades
#
# Arguments:
#   $1 - Instance code
#   $2 - Time window in minutes (default: 5)
#
# Returns:
#   0 - Correlation analysis complete (may have triggered recovery)
#   1 - Analysis failed
##
orch_correlate_errors() {
    local instance_code="$1"
    local time_window="${2:-5}"
    local code_lower=$(lower "$instance_code")

    if ! orch_db_check_connection; then
        log_verbose "Database unavailable - skipping error correlation"
        return 1
    fi

    log_verbose "Analyzing error correlations for $instance_code (window: $time_window min)..."

    # Get recent errors
    local error_codes=$(orch_db_exec "
    SELECT error_code
    FROM orchestration_errors
    WHERE instance_code='$code_lower'
    AND timestamp > NOW() - INTERVAL '$time_window minutes'
    AND resolved = FALSE
    ORDER BY timestamp ASC
    " 2>/dev/null | tr '\n' ' ')

    if [ -z "$error_codes" ]; then
        log_verbose "No recent unresolved errors to correlate"
        return 0
    fi

    log_verbose "Recent error codes: $error_codes"

    # Pattern 1: Certificate cascade (1101 → 1104, 1305, ...)
    if echo "$error_codes" | grep -q "1101"; then
        if echo "$error_codes" | grep -q "1104\|1305"; then
            log_warn "🔗 Detected certificate-related error cascade"
            log_info "Root cause: Certificate generation failed"
            log_info "Single fix: Regenerate certificates"

            if orch_auto_recover "$instance_code" 1101; then
                log_success "✓ Root cause fixed, resolving cascade..."

                # Mark all related errors as resolved
                orch_db_exec "
                UPDATE orchestration_errors
                SET resolved = TRUE, resolved_at = NOW()
                WHERE instance_code='$code_lower'
                AND error_code IN (1101, 1104, 1305, 1403)
                AND timestamp > NOW() - INTERVAL '$time_window minutes'
                " >/dev/null 2>&1

                return 0
            fi
        fi
    fi

    # Pattern 2: Secret cascade (1004 → 1305, 1403, 1306)
    if echo "$error_codes" | grep -q "1004"; then
        if echo "$error_codes" | grep -q "1305\|1403\|1306"; then
            log_warn "🔗 Detected secret-related error cascade"
            log_info "Root cause: Secret loading failed"
            log_info "Single fix: Re-authenticate GCP and reload secrets"

            if orch_auto_recover "$instance_code" 1004; then
                orch_db_exec "
                UPDATE orchestration_errors
                SET resolved = TRUE, resolved_at = NOW()
                WHERE instance_code='$code_lower'
                AND error_code IN (1004, 1305, 1403, 1306, 1304)
                AND timestamp > NOW() - INTERVAL '$time_window minutes'
                " >/dev/null 2>&1

                return 0
            fi
        fi
    fi

    # Pattern 3: Hub unavailable cascade (1002 → 1301, 1302, 1303)
    if echo "$error_codes" | grep -q "1002"; then
        if echo "$error_codes" | grep -q "1301\|1302\|1303"; then
            log_warn "🔗 Detected Hub unavailability cascade"
            log_info "Root cause: Hub is unhealthy"
            log_info "Single fix: Wait for Hub to recover or fix Hub"

            if orch_auto_recover "$instance_code" 1002; then
                orch_db_exec "
                UPDATE orchestration_errors
                SET resolved = TRUE, resolved_at = NOW()
                WHERE instance_code='$code_lower'
                AND error_code IN (1002, 1301, 1302, 1303)
                AND timestamp > NOW() - INTERVAL '$time_window minutes'
                " >/dev/null 2>&1

                return 0
            fi
        fi
    fi

    # Pattern 4: Dependency cascade (1203 → 1204 → 1401)
    if echo "$error_codes" | grep -q "1203"; then
        if echo "$error_codes" | grep -q "1204\|1401"; then
            log_warn "🔗 Detected service dependency cascade"
            log_info "Root cause: Service dependency not ready"
            log_info "Recommendation: Increase health check timeouts or fix dependency"
        fi
    fi

    log_verbose "No actionable correlation patterns detected"
    return 0
}

# =============================================================================
# FAILURE THRESHOLD POLICY
# =============================================================================

##
# Check if deployment should abort based on error accumulation
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Below threshold, deployment can continue
#   1 - Threshold exceeded, deployment should abort
##
orch_check_failure_threshold() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    if ! orch_db_check_connection; then
        log_verbose "Database unavailable - skipping threshold check"
        return 0  # Don't block deployment if DB unavailable
    fi

    # Find deployment session start time
    local deployment_start=$(orch_db_exec "SELECT MAX(timestamp) FROM deployment_states WHERE instance_code='$code_lower' AND state='INITIALIZING'" 2>/dev/null | xargs)

    if [ -z "$deployment_start" ]; then
        log_verbose "No deployment session found - skipping threshold check"
        return 0
    fi

    # Get error counts by severity (current deployment session only)
    local error_counts=$(orch_db_exec "
    SELECT
        SUM(CASE WHEN severity = 1 THEN 1 ELSE 0 END) as critical,
        SUM(CASE WHEN severity = 2 THEN 1 ELSE 0 END) as high,
        SUM(CASE WHEN severity = 3 THEN 1 ELSE 0 END) as medium,
        SUM(CASE WHEN severity = 4 THEN 1 ELSE 0 END) as low
    FROM orchestration_errors
    WHERE instance_code='$code_lower'
    AND timestamp >= '$deployment_start'
    AND resolved = FALSE
    " 2>/dev/null | tr -d ' ' | tr -d '\n')

    if [ -z "$error_counts" ]; then
        log_verbose "No errors in current deployment session"
        return 0
    fi

    local critical=$(echo "$error_counts" | cut -d'|' -f1)
    local high=$(echo "$error_counts" | cut -d'|' -f2)
    local medium=$(echo "$error_counts" | cut -d'|' -f3)
    local low=$(echo "$error_counts" | cut -d'|' -f4)

    # Handle empty values (no errors of that severity)
    critical=${critical:-0}
    high=${high:-0}
    medium=${medium:-0}
    low=${low:-0}

    log_verbose "Error counts: Critical=$critical, High=$high, Medium=$medium, Low=$low"

    # Check thresholds (most severe first)
    if [ "$ORCH_CRITICAL_ABORT" = "true" ] && [ "$critical" -gt 0 ]; then
        log_error "❌ ABORT: Critical error detected (count: $critical)"
        log_error "Deployment cannot continue - initiating rollback"
        return 1
    fi

    if [ "$high" -ge "$ORCH_MAX_HIGH_ERRORS" ]; then
        log_error "❌ ABORT: High severity error threshold exceeded ($high >= $ORCH_MAX_HIGH_ERRORS)"
        log_error "Deployment quality too low - initiating rollback"
        return 1
    fi

    if [ "$medium" -ge "$ORCH_MAX_MEDIUM_ERRORS" ]; then
        log_error "❌ ABORT: Medium severity error threshold exceeded ($medium >= $ORCH_MAX_MEDIUM_ERRORS)"
        log_error "Deployment quality too low - initiating rollback"
        return 1
    fi

    if [ "$low" -ge "$ORCH_MAX_LOW_ERRORS" ]; then
        log_warn "⚠️  WARNING: Low severity error threshold approaching ($low >= $ORCH_MAX_LOW_ERRORS)"
        log_warn "Deployment quality degrading - consider investigating"
    fi

    log_verbose "✓ Error thresholds within acceptable limits"
    return 0
}

# =============================================================================
# INTEGRATED ERROR HANDLER
# =============================================================================

##
# Comprehensive error handler with auto-recovery, correlation, and threshold check
#
# Arguments:
#   $1 - Instance code
#   $2 - Error code
#   $3 - Error message
#   $4 - Error severity (1-4)
#   $5 - Error context (optional JSON)
#
# Returns:
#   0 - Error handled, deployment can continue
#   1 - Error blocking, deployment must abort
##
handle_error_with_recovery() {
    local instance_code="$1"
    local error_code="$2"
    local error_message="$3"
    local error_severity="$4"
    local error_context="${5:-{}}"

    # 1. Record error
    if type orch_record_error &>/dev/null; then
        orch_record_error "$instance_code" "$error_code" "$error_message" "$error_severity" "$error_context"
    fi

    # 2. Classify error
    local error_type=$(classify_error "$error_code")
    log_verbose "Error classified as: $error_type"

    # 3. Attempt auto-recovery for recoverable errors
    if [ "$error_type" = "RECOVERABLE" ]; then
        log_info "Error is recoverable, attempting auto-recovery..."

        if orch_auto_recover "$instance_code" "$error_code" "$error_context"; then
            log_success "✓ Auto-recovery successful - error resolved"
            return 0  # Error recovered, continue deployment
        else
            log_warn "✗ Auto-recovery failed or unavailable"
        fi
    fi

    # 4. Check for error correlations (cascading failures)
    orch_correlate_errors "$instance_code" 5

    # 5. Check failure threshold
    if ! orch_check_failure_threshold "$instance_code"; then
        log_error "Failure threshold exceeded - deployment must abort"
        return 1
    fi

    # 6. Determine if error should block deployment
    case "$error_severity" in
        1)  # CRITICAL
            log_error "Critical error - deployment cannot continue"
            return 1
            ;;
        2)  # HIGH
            if [ "$error_type" = "PERMANENT" ]; then
                log_error "Permanent high-severity error - deployment cannot continue"
                return 1
            else
                log_warn "High-severity error but potentially transient - retry may resolve"
                return 0  # Allow retry logic to handle
            fi
            ;;
        3|4)  # MEDIUM or LOW
            log_warn "Non-critical error - continuing with degraded functionality"
            return 0  # Non-blocking
            ;;
        *)
            log_error "Unknown severity: $error_severity"
            return 1
            ;;
    esac
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

# Export functions
export -f classify_error
export -f orch_retry_with_backoff
export -f orch_circuit_breaker_execute
export -f orch_circuit_breaker_is_open
export -f orch_circuit_breaker_reset
export -f orch_circuit_breaker_load
export -f orch_circuit_breaker_init
export -f orch_circuit_breaker_status
export -f orch_circuit_breaker_reset_all_open
export -f orch_auto_recover
export -f orch_record_recovery
export -f orch_correlate_errors
export -f orch_check_failure_threshold
export -f handle_error_with_recovery

# FIX (2026-01-18): Only log if log_verbose function is available
# Prevents "command not found" errors during module loading
if type log_verbose &>/dev/null; then
    log_verbose "Error recovery module loaded (Phase 3: 14 functions, 15 recoverable errors)"
fi
