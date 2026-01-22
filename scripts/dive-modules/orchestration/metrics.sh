#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 Orchestration Metrics (Consolidated)
# =============================================================================
# Prometheus metrics collection and observability
# =============================================================================
# Version: 5.0.0 (Module Consolidation)
# Date: 2026-01-22
#
# NEW module for Phase 5 observability
# =============================================================================

# Prevent multiple sourcing
[ -n "$DIVE_ORCHESTRATION_METRICS_LOADED" ] && return 0
export DIVE_ORCHESTRATION_METRICS_LOADED=1

# =============================================================================
# LOAD DEPENDENCIES
# =============================================================================

ORCH_DIR="$(dirname "${BASH_SOURCE[0]}")"
MODULES_DIR="$(dirname "$ORCH_DIR")"

if [ -z "$DIVE_COMMON_LOADED" ]; then
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

METRICS_DIR="${DIVE_ROOT}/logs/metrics"
mkdir -p "$METRICS_DIR"

# Prometheus metrics file (node_exporter textfile collector format)
METRICS_FILE="${METRICS_DIR}/dive_metrics.prom"

# =============================================================================
# METRIC RECORDING
# =============================================================================

##
# Record a deployment duration metric
#
# Arguments:
#   $1 - Instance code
#   $2 - Component (hub, spoke, federation)
#   $3 - Phase (preflight, deployment, configuration, verification)
#   $4 - Duration in seconds
##
metrics_record_deployment_duration() {
    local instance_code="$1"
    local component="$2"
    local phase="$3"
    local duration="$4"
    local code_lower=$(lower "$instance_code")

    # Record to database
    if type orch_db_check_connection &>/dev/null && orch_db_check_connection; then
        orch_db_exec "
            INSERT INTO orchestration_metrics (instance_code, metric_name, metric_value, labels)
            VALUES ('$code_lower', 'deployment_duration_seconds', $duration,
                    '{\"component\":\"$component\",\"phase\":\"$phase\"}'::jsonb)
        " >/dev/null 2>&1
    fi

    # Write to Prometheus format
    echo "# HELP dive_deployment_duration_seconds Duration of deployment phases in seconds" >> "$METRICS_FILE.tmp"
    echo "# TYPE dive_deployment_duration_seconds gauge" >> "$METRICS_FILE.tmp"
    echo "dive_deployment_duration_seconds{instance=\"$code_lower\",component=\"$component\",phase=\"$phase\"} $duration" >> "$METRICS_FILE.tmp"

    log_verbose "Metric recorded: deployment_duration_seconds{$code_lower,$component,$phase} = $duration"
}

##
# Record a deployment error metric
#
# Arguments:
#   $1 - Instance code
#   $2 - Component
#   $3 - Error type
##
metrics_record_deployment_error() {
    local instance_code="$1"
    local component="$2"
    local error_type="$3"
    local code_lower=$(lower "$instance_code")

    # Record to database
    if type orch_db_check_connection &>/dev/null && orch_db_check_connection; then
        orch_db_exec "
            INSERT INTO orchestration_metrics (instance_code, metric_name, metric_value, labels)
            VALUES ('$code_lower', 'deployment_errors_total', 1,
                    '{\"component\":\"$component\",\"error_type\":\"$error_type\"}'::jsonb)
        " >/dev/null 2>&1
    fi

    log_verbose "Metric recorded: deployment_errors_total{$code_lower,$component,$error_type}"
}

##
# Record federation health metric
#
# Arguments:
#   $1 - Source instance
#   $2 - Target instance
#   $3 - Status (1=healthy, 0=unhealthy)
##
metrics_record_federation_health() {
    local source="$1"
    local target="$2"
    local status="$3"

    echo "# HELP dive_federation_health Federation link health status" >> "$METRICS_FILE.tmp"
    echo "# TYPE dive_federation_health gauge" >> "$METRICS_FILE.tmp"
    echo "dive_federation_health{source=\"$source\",target=\"$target\"} $status" >> "$METRICS_FILE.tmp"
}

##
# Record circuit breaker state metric
#
# Arguments:
#   $1 - Circuit name
#   $2 - State (0=closed, 1=open, 2=half_open)
##
metrics_record_circuit_breaker_state() {
    local circuit="$1"
    local state="$2"

    echo "# HELP dive_circuit_breaker_state Circuit breaker state (0=closed, 1=open, 2=half_open)" >> "$METRICS_FILE.tmp"
    echo "# TYPE dive_circuit_breaker_state gauge" >> "$METRICS_FILE.tmp"
    echo "dive_circuit_breaker_state{circuit=\"$circuit\"} $state" >> "$METRICS_FILE.tmp"
}

##
# Record lock status metric
#
# Arguments:
#   $1 - Instance code
#   $2 - Status (1=locked, 0=unlocked)
##
metrics_record_lock_status() {
    local instance_code="$1"
    local status="$2"
    local code_lower=$(lower "$instance_code")

    echo "# HELP dive_orchestration_locks Current lock status" >> "$METRICS_FILE.tmp"
    echo "# TYPE dive_orchestration_locks gauge" >> "$METRICS_FILE.tmp"
    echo "dive_orchestration_locks{instance=\"$code_lower\"} $status" >> "$METRICS_FILE.tmp"
}

# =============================================================================
# METRIC COLLECTION
# =============================================================================

##
# Collect all current metrics and write to Prometheus format
##
metrics_collect_all() {
    log_info "Collecting all orchestration metrics..."

    # Start fresh metrics file
    > "$METRICS_FILE.tmp"

    # Add metadata
    echo "# DIVE V3 Orchestration Metrics" >> "$METRICS_FILE.tmp"
    echo "# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")" >> "$METRICS_FILE.tmp"
    echo "" >> "$METRICS_FILE.tmp"

    # Collect deployment states
    if type orch_db_check_connection &>/dev/null && orch_db_check_connection; then
        echo "# HELP dive_deployment_state Current deployment state (enum)" >> "$METRICS_FILE.tmp"
        echo "# TYPE dive_deployment_state gauge" >> "$METRICS_FILE.tmp"

        local states=$(orch_db_exec "
            SELECT DISTINCT ON (instance_code) instance_code, state
            FROM deployment_states
            ORDER BY instance_code, timestamp DESC
        " 2>/dev/null)

        while IFS='|' read -r instance state; do
            instance=$(echo "$instance" | xargs)
            state=$(echo "$state" | xargs)
            [ -z "$instance" ] && continue

            # Convert state to numeric value
            local state_value=0
            case "$state" in
                UNKNOWN)      state_value=0 ;;
                INITIALIZING) state_value=1 ;;
                DEPLOYING)    state_value=2 ;;
                CONFIGURING)  state_value=3 ;;
                VERIFYING)    state_value=4 ;;
                COMPLETE)     state_value=5 ;;
                FAILED)       state_value=-1 ;;
                ROLLING_BACK) state_value=-2 ;;
                CLEANUP)      state_value=-3 ;;
            esac

            echo "dive_deployment_state{instance=\"$instance\",state=\"$state\"} $state_value" >> "$METRICS_FILE.tmp"
        done <<< "$states"

        # Collect circuit breaker states
        echo "" >> "$METRICS_FILE.tmp"
        echo "# HELP dive_circuit_breaker_state Circuit breaker state" >> "$METRICS_FILE.tmp"
        echo "# TYPE dive_circuit_breaker_state gauge" >> "$METRICS_FILE.tmp"

        local circuits=$(orch_db_exec "
            SELECT operation_name, state, failure_count
            FROM circuit_breakers
        " 2>/dev/null)

        while IFS='|' read -r op state failures; do
            op=$(echo "$op" | xargs)
            state=$(echo "$state" | xargs)
            failures=$(echo "$failures" | xargs)
            [ -z "$op" ] && continue

            local state_value=0
            case "$state" in
                CLOSED)    state_value=0 ;;
                OPEN)      state_value=1 ;;
                HALF_OPEN) state_value=2 ;;
            esac

            echo "dive_circuit_breaker_state{circuit=\"$op\"} $state_value" >> "$METRICS_FILE.tmp"
            echo "dive_circuit_breaker_failures{circuit=\"$op\"} ${failures:-0}" >> "$METRICS_FILE.tmp"
        done <<< "$circuits"

        # Collect lock count
        echo "" >> "$METRICS_FILE.tmp"
        echo "# HELP dive_active_locks Number of active deployment locks" >> "$METRICS_FILE.tmp"
        echo "# TYPE dive_active_locks gauge" >> "$METRICS_FILE.tmp"

        local active_locks=$(orch_db_exec "
            SELECT COUNT(*) FROM deployment_locks WHERE released_at IS NULL
        " 2>/dev/null | xargs)

        echo "dive_active_locks ${active_locks:-0}" >> "$METRICS_FILE.tmp"

        # Collect error rates (last hour)
        echo "" >> "$METRICS_FILE.tmp"
        echo "# HELP dive_errors_hourly Errors in the last hour" >> "$METRICS_FILE.tmp"
        echo "# TYPE dive_errors_hourly gauge" >> "$METRICS_FILE.tmp"

        local hourly_errors=$(orch_db_exec "
            SELECT instance_code, COUNT(*) as count
            FROM orchestration_errors
            WHERE timestamp > NOW() - INTERVAL '1 hour'
            GROUP BY instance_code
        " 2>/dev/null)

        while IFS='|' read -r instance count; do
            instance=$(echo "$instance" | xargs)
            count=$(echo "$count" | xargs)
            [ -z "$instance" ] && continue
            echo "dive_errors_hourly{instance=\"$instance\"} $count" >> "$METRICS_FILE.tmp"
        done <<< "$hourly_errors"
    fi

    # Atomically move temp file to final location
    mv "$METRICS_FILE.tmp" "$METRICS_FILE"

    log_success "Metrics collected: $METRICS_FILE"
}

##
# Get metrics summary
##
metrics_summary() {
    echo "=== DIVE V3 Metrics Summary ==="
    echo ""

    if type orch_db_check_connection &>/dev/null && orch_db_check_connection; then
        echo "Deployment Metrics (last 24h):"
        orch_db_exec "
            SELECT
                labels->>'component' as component,
                COUNT(*) as deployments,
                ROUND(AVG(metric_value)::numeric, 2) as avg_duration,
                ROUND(MIN(metric_value)::numeric, 2) as min_duration,
                ROUND(MAX(metric_value)::numeric, 2) as max_duration
            FROM orchestration_metrics
            WHERE metric_name = 'deployment_duration_seconds'
            AND timestamp > NOW() - INTERVAL '24 hours'
            GROUP BY labels->>'component'
        " 2>/dev/null

        echo ""
        echo "Error Metrics (last 24h):"
        orch_db_exec "
            SELECT
                instance_code,
                COUNT(*) as error_count,
                COUNT(DISTINCT error_code) as unique_errors
            FROM orchestration_errors
            WHERE timestamp > NOW() - INTERVAL '24 hours'
            GROUP BY instance_code
            ORDER BY error_count DESC
        " 2>/dev/null
    else
        echo "Database not available - cannot retrieve metrics"
    fi

    echo ""
    echo "Prometheus metrics file: $METRICS_FILE"
    if [ -f "$METRICS_FILE" ]; then
        echo "Last updated: $(stat -f "%Sm" "$METRICS_FILE" 2>/dev/null || stat -c "%y" "$METRICS_FILE" 2>/dev/null)"
        echo "Line count: $(wc -l < "$METRICS_FILE")"
    else
        echo "File not found - run 'metrics_collect_all' to generate"
    fi
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f metrics_record_deployment_duration
export -f metrics_record_deployment_error
export -f metrics_record_federation_health
export -f metrics_record_circuit_breaker_state
export -f metrics_record_lock_status
export -f metrics_collect_all
export -f metrics_summary

log_verbose "Orchestration metrics module loaded"
