#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Orchestration Error Handling (Consolidated)
# =============================================================================
# Error recovery, auto-recovery, and failure threshold management
# =============================================================================
# Version: 5.0.0 (Module Consolidation)
# Date: 2026-01-22
#
# Consolidates:
#   - error-recovery.sh
#   - error-analytics.sh
# =============================================================================

# Prevent multiple sourcing
[ -n "${DIVE_ORCHESTRATION_ERRORS_LOADED:-}" ] && return 0
export DIVE_ORCHESTRATION_ERRORS_LOADED=1

# =============================================================================
# LOAD DEPENDENCIES
# =============================================================================

ORCH_DIR="$(dirname "${BASH_SOURCE[0]}")"
MODULES_DIR="$(dirname "$ORCH_DIR")"

if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "${MODULES_DIR}/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# CONFIGURATION
# =============================================================================

# Retry configuration
ORCH_MAX_RETRIES="${ORCH_MAX_RETRIES:-5}"
ORCH_INITIAL_DELAY="${ORCH_INITIAL_DELAY:-2}"
ORCH_MAX_DELAY="${ORCH_MAX_DELAY:-60}"
ORCH_BACKOFF_MULTIPLIER="${ORCH_BACKOFF_MULTIPLIER:-2}"

# Failure threshold configuration
ORCH_MAX_LOW_ERRORS="${ORCH_MAX_LOW_ERRORS:-10}"
ORCH_MAX_MEDIUM_ERRORS="${ORCH_MAX_MEDIUM_ERRORS:-3}"
ORCH_MAX_HIGH_ERRORS="${ORCH_MAX_HIGH_ERRORS:-1}"
ORCH_CRITICAL_ABORT="${ORCH_CRITICAL_ABORT:-true}"

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
#   Error type: TRANSIENT, PERMANENT, RECOVERABLE, UNKNOWN
##
classify_error() {
    local error_code="$1"

    case "$error_code" in
        # Transient errors (network, timeouts)
        1002|1204|1502)
            echo "TRANSIENT"
            ;;
        # Permanent errors (missing prerequisites)
        1001|1006|1103)
            echo "PERMANENT"
            ;;
        # Recoverable errors (can auto-fix)
        1101|1004|1202|1207|1301|1302|1303|1003|1308|1505|1201|1401|1402|1501|1106)
            echo "RECOVERABLE"
            ;;
        *)
            echo "UNKNOWN"
            ;;
    esac
}

# =============================================================================
# RETRY LOGIC
# =============================================================================

##
# Retry operation with exponential backoff and jitter
#
# Arguments:
#   $1 - Operation name
#   $@ - Command to execute
#
# Returns:
#   0 - Succeeded
#   1 - Failed after max retries
##
orch_retry_with_backoff() {
    local operation_name="$1"
    shift
    local command=("$@")

    local attempt=1
    local delay=$ORCH_INITIAL_DELAY

    log_verbose "Retry loop for: $operation_name (max: $ORCH_MAX_RETRIES attempts)"

    while [ $attempt -le $ORCH_MAX_RETRIES ]; do
        local start_time
        start_time=$(date +%s)

        if [ $attempt -eq 1 ]; then
            log_info "Executing: $operation_name"
        else
            log_info "Retry $((attempt-1))/$((ORCH_MAX_RETRIES-1)): $operation_name"
        fi

        local output exit_code
        output=$("${command[@]}" 2>&1)
        exit_code=$?

        if [ $exit_code -eq 0 ]; then
            local duration=$(($(date +%s) - start_time))
            if [ $attempt -gt 1 ]; then
                log_success "$operation_name succeeded on retry $((attempt-1)) (${duration}s)"
            else
                log_success "$operation_name succeeded (${duration}s)"
            fi
            return 0
        fi

        log_warn "Attempt $attempt failed (exit code: $exit_code)"
        [ -n "$output" ] && log_verbose "Error output: $output"

        if [ $attempt -eq $ORCH_MAX_RETRIES ]; then
            log_error "$operation_name failed after $ORCH_MAX_RETRIES attempts"
            return 1
        fi

        # Exponential backoff with jitter
        local jitter=$((RANDOM % 1000))
        local sleep_time
        sleep_time=$(awk "BEGIN {printf \"%.3f\", $delay + ($jitter / 1000)}")
        log_info "Waiting ${sleep_time}s before retry..."
        sleep "$sleep_time"

        delay=$((delay * ORCH_BACKOFF_MULTIPLIER))
        [ $delay -gt $ORCH_MAX_DELAY ] && delay=$ORCH_MAX_DELAY

        ((attempt++))
    done

    return 1
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
#   $3 - Error context (optional JSON)
#
# Returns:
#   0 - Recovery successful
#   1 - No recovery available
#   2 - Recovery failed
##
orch_auto_recover() {
    local instance_code="$1"
    local error_code="$2"
    local error_context="${3:-{}}"
    local code_lower
    code_lower=$(lower "$instance_code")

    log_info "Attempting auto-recovery for $instance_code (error: $error_code)"

    case "$error_code" in
        1101)  # Certificate generation failed
            log_info "Auto-recovering: Regenerating certificate..."
            rm -f "${DIVE_ROOT}/instances/${code_lower}/certs/certificate.pem" 2>/dev/null
            rm -f "${DIVE_ROOT}/instances/${code_lower}/certs/key.pem" 2>/dev/null

            if [ -f "${MODULES_DIR}/certificates.sh" ]; then
                source "${MODULES_DIR}/certificates.sh"
                if type generate_spoke_certificate &>/dev/null; then
                    generate_spoke_certificate "$code_lower" && return 0
                fi
            fi
            return 2
            ;;

        1202)  # Container unhealthy
            log_info "Auto-recovering: Restarting unhealthy container..."
            local service
            service=$(echo "$error_context" | jq -r '.service // "keycloak"' 2>/dev/null)
            local container="dive-spoke-${code_lower}-${service}"

            if docker restart "$container" >/dev/null 2>&1; then
                sleep 30
                local health
                health=$(docker inspect "$container" --format='{{.State.Health.Status}}' 2>/dev/null)
                [ "$health" = "healthy" ] && return 0
            fi
            return 2
            ;;

        1004)  # Secret load failed
            log_info "Auto-recovering: Retrying secret load..."
            if [ -f "${MODULES_DIR}/spoke/pipeline/spoke-secrets.sh" ]; then
                source "${MODULES_DIR}/spoke/pipeline/spoke-secrets.sh"
                if type spoke_secrets_load &>/dev/null; then
                    orch_retry_with_backoff "GCP secret load" spoke_secrets_load "$instance_code" && return 0
                fi
            fi
            return 2
            ;;

        1301|1302|1303)  # Federation failed
            log_info "Auto-recovering: Retrying federation setup..."
            if type check_hub_healthy &>/dev/null && ! check_hub_healthy; then
                log_error "Hub is unhealthy - cannot recover federation"
                return 2
            fi

            if [ -f "${MODULES_DIR}/spoke/pipeline/spoke-federation.sh" ]; then
                source "${MODULES_DIR}/spoke/pipeline/spoke-federation.sh"
                if type spoke_federation_create_bidirectional &>/dev/null; then
                    orch_retry_with_backoff "Federation setup" spoke_federation_create_bidirectional "$instance_code" && return 0
                fi
            fi
            return 2
            ;;

        1003)  # Network setup failed
            log_info "Auto-recovering: Recreating Docker network..."
            orch_retry_with_backoff "Network creation" bash -c \
                "docker network create dive-shared 2>/dev/null || docker network inspect dive-shared >/dev/null 2>&1" && return 0
            return 2
            ;;

        1207)  # Stale container cleanup failed
            log_info "Auto-recovering: Force removing stale containers..."
            docker ps -a -q --filter "name=dive-spoke-${code_lower}" | grep . | xargs docker rm -f >/dev/null 2>&1
            return 0
            ;;

        *)
            log_verbose "No auto-recovery procedure for error code: $error_code"
            return 1
            ;;
    esac
}

##
# Record auto-recovery attempt
##
orch_record_recovery() {
    local instance_code="$1"
    local error_code="$2"
    local recovery_type="$3"
    local result="$4"

    if type orch_db_check_connection &>/dev/null && orch_db_check_connection; then
        local metric_value=0
        [ "$result" = "SUCCESS" ] && metric_value=1

        orch_db_exec "
            INSERT INTO orchestration_metrics (instance_code, metric_name, metric_value, labels)
            VALUES ('$(lower "$instance_code")', 'auto_recovery', $metric_value,
                    '{\"error_code\":$error_code,\"recovery_type\":\"$recovery_type\",\"result\":\"$result\"}'::jsonb)
        " >/dev/null 2>&1 || true
    fi
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
#   0 - Below threshold
#   1 - Threshold exceeded
##
orch_check_failure_threshold() {
    local instance_code="$1"
    local code_lower
    code_lower=$(lower "$instance_code")

    if ! type orch_db_check_connection &>/dev/null || ! orch_db_check_connection; then
        return 0  # Don't block if DB unavailable
    fi

    local deployment_start
    deployment_start=$(orch_db_exec "
        SELECT MAX(timestamp) FROM deployment_states
        WHERE instance_code='$code_lower' AND state='INITIALIZING'
    " 2>/dev/null | xargs)

    [ -z "$deployment_start" ] && return 0

    local error_counts
    error_counts=$(orch_db_exec "
        SELECT
            SUM(CASE WHEN severity = 1 THEN 1 ELSE 0 END) as critical,
            SUM(CASE WHEN severity = 2 THEN 1 ELSE 0 END) as high,
            SUM(CASE WHEN severity = 3 THEN 1 ELSE 0 END) as medium,
            SUM(CASE WHEN severity = 4 THEN 1 ELSE 0 END) as low
        FROM orchestration_errors
        WHERE instance_code='$code_lower'
        AND timestamp >= '$deployment_start'
        AND resolved = FALSE
    " 2>/dev/null | tr -d ' ')

    [ -z "$error_counts" ] && return 0

    local critical
    critical=$(echo "$error_counts" | cut -d'|' -f1)
    local high
    high=$(echo "$error_counts" | cut -d'|' -f2)

    critical=${critical:-0}
    high=${high:-0}

    if [ "$ORCH_CRITICAL_ABORT" = "true" ] && [ "$critical" -gt 0 ]; then
        log_error "ABORT: Critical error detected"
        return 1
    fi

    if [ "$high" -ge "$ORCH_MAX_HIGH_ERRORS" ]; then
        log_error "ABORT: High severity error threshold exceeded ($high >= $ORCH_MAX_HIGH_ERRORS)"
        return 1
    fi

    return 0
}

# =============================================================================
# INTEGRATED ERROR HANDLER
# =============================================================================

##
# Comprehensive error handler with auto-recovery
#
# Arguments:
#   $1 - Instance code
#   $2 - Error code
#   $3 - Error message
#   $4 - Error severity (1-4)
#   $5 - Error context (optional JSON)
#
# Returns:
#   0 - Error handled, can continue
#   1 - Error blocking, must abort
##
handle_error_with_recovery() {
    local instance_code="$1"
    local error_code="$2"
    local error_message="$3"
    local error_severity="$4"
    local error_context="${5:-{}}"

    # Record error
    if type orch_record_error &>/dev/null; then
        orch_record_error "$error_code" "$error_severity" "$error_message" "$instance_code" "" "$error_context"
    fi

    # Classify error
    local error_type
    error_type=$(classify_error "$error_code")
    log_verbose "Error classified as: $error_type"

    # Attempt auto-recovery for recoverable errors
    if [ "$error_type" = "RECOVERABLE" ]; then
        log_info "Attempting auto-recovery..."
        if orch_auto_recover "$instance_code" "$error_code" "$error_context"; then
            log_success "Auto-recovery successful"
            return 0
        fi
    fi

    # Check failure threshold
    if ! orch_check_failure_threshold "$instance_code"; then
        return 1
    fi

    # Determine if error should block
    case "$error_severity" in
        1) return 1 ;;  # CRITICAL
        2) [ "$error_type" = "PERMANENT" ] && return 1 ;;  # HIGH + PERMANENT
        *) return 0 ;;  # Non-blocking
    esac
}

# =============================================================================
# ERROR ANALYTICS
# =============================================================================

##
# Get error summary for an instance
#
# Arguments:
#   $1 - Instance code
#   $2 - Time window in hours (default: 24)
##
orch_error_summary() {
    local instance_code="$1"
    local hours="${2:-24}"
    local code_lower
    code_lower=$(lower "$instance_code")

    if ! type orch_db_check_connection &>/dev/null || ! orch_db_check_connection; then
        log_error "Database not available"
        return 1
    fi

    echo "=== Error Summary: $instance_code (last ${hours}h) ==="

    orch_db_exec "
        SELECT
            error_code,
            COUNT(*) as count,
            MAX(timestamp) as last_seen,
            CASE
                WHEN severity = 1 THEN 'CRITICAL'
                WHEN severity = 2 THEN 'HIGH'
                WHEN severity = 3 THEN 'MEDIUM'
                ELSE 'LOW'
            END as severity
        FROM orchestration_errors
        WHERE instance_code='$code_lower'
        AND timestamp > NOW() - INTERVAL '$hours hours'
        GROUP BY error_code, severity
        ORDER BY severity, count DESC
    " 2>/dev/null
}

##
# Get top errors across all instances
#
# Arguments:
#   $1 - Limit (default: 10)
##
orch_top_errors() {
    local limit="${1:-10}"

    if ! type orch_db_check_connection &>/dev/null || ! orch_db_check_connection; then
        log_error "Database not available"
        return 1
    fi

    echo "=== Top $limit Errors (last 24h) ==="

    orch_db_exec "
        SELECT
            error_code,
            COUNT(*) as count,
            COUNT(DISTINCT instance_code) as affected_instances,
            ARRAY_AGG(DISTINCT instance_code) as instances
        FROM orchestration_errors
        WHERE timestamp > NOW() - INTERVAL '24 hours'
        GROUP BY error_code
        ORDER BY count DESC
        LIMIT $limit
    " 2>/dev/null
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f classify_error
export -f orch_retry_with_backoff
export -f orch_auto_recover
export -f orch_record_recovery
export -f orch_check_failure_threshold
export -f handle_error_with_recovery
export -f orch_error_summary
export -f orch_top_errors

log_verbose "Orchestration errors module loaded (consolidated)"
