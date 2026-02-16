#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Orchestration Checkpoint Recovery
# =============================================================================
# Extracted from orchestration/checkpoint.sh (Phase 13e)
# =============================================================================

[ -n "${DIVE_ORCH_CHECKPOINT_RECOVERY_LOADED:-}" ] && return 0

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
readonly PREDICTIVE_ANALYSIS_ENABLED="true"

##
# Initialize metrics collection for deployment
#
# Arguments:
#   $1 - Instance code
##
orch_init_metrics() {
    local instance_code="$1"

    # Ensure DEPLOYMENT_METRICS exists
    if ! declare -p DEPLOYMENT_METRICS &>/dev/null; then
        declare -gA DEPLOYMENT_METRICS=()
    fi

    local key_start="${instance_code}_start_time"
    local key_phase="${instance_code}_phase_start"
    local key_errors="${instance_code}_error_count"
    local key_retries="${instance_code}_retry_count"

    DEPLOYMENT_METRICS[$key_start]=$(date +%s)
    DEPLOYMENT_METRICS[$key_phase]=$(date +%s)
    DEPLOYMENT_METRICS[$key_errors]=0
    DEPLOYMENT_METRICS[$key_retries]=0

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
    ORCH_CONTEXT[metrics_pid]=$!
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

    local key_start="${instance_code}_start_time"
    if [ -n "${DEPLOYMENT_METRICS[$key_start]:-}" ]; then
        deployment_duration=$(( $(date +%s) - DEPLOYMENT_METRICS[$key_start] ))
    fi

    # Container metrics
    local container_count=$(docker ps -q --filter "name=dive-spoke-${instance_code}" 2>/dev/null | wc -l | tr -d ' ')
    local healthy_containers=$(orch_count_healthy_containers "$instance_code")
    local total_memory=$(orch_get_instance_memory_usage "$instance_code")

    # Error metrics
    local error_rate=0
    if [ "$deployment_duration" -gt 0 ]; then
        error_rate=$(( (ORCH_CONTEXT[errors_critical] + ORCH_CONTEXT[errors_high]) * 60 / deployment_duration ))
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
    "current_phase": "${ORCH_CONTEXT[current_phase]}",
    "container_count": $container_count,
    "healthy_containers": $healthy_containers,
    "total_memory_mb": $total_memory,
    "error_rate_per_minute": $error_rate,
    "network_status": "$network_status",
    "failure_probability": $failure_probability,
    "circuit_breakers_open": $(orch_count_open_circuit_breakers),
    "orchestration_errors": {
        "critical": ${ORCH_CONTEXT[errors_critical]},
        "high": ${ORCH_CONTEXT[errors_high]},
        "medium": ${ORCH_CONTEXT[errors_medium]},
        "low": ${ORCH_CONTEXT[errors_low]}
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
    local error_rate=$(( (ORCH_CONTEXT[errors_critical] + ORCH_CONTEXT[errors_high]) * 60 / ($(date +%s) - ORCH_CONTEXT[start_time]) ))
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
        sed -i.bak "s/PHASE/${ORCH_CONTEXT[current_phase]}/g" "$dashboard_file" && rm -f "${dashboard_file}.bak" 2>/dev/null || log_warn "Failed to replace PHASE in dashboard"
        sed -i.bak "s/DURATION/$(( $(date +%s) - ORCH_CONTEXT[start_time] ))s/g" "$dashboard_file" && rm -f "${dashboard_file}.bak" 2>/dev/null || log_warn "Failed to replace DURATION in dashboard"
        sed -i.bak "s/STATUS/$(get_deployment_state_enhanced "$instance_code" 2>/dev/null || echo "UNKNOWN")/g" "$dashboard_file" && rm -f "${dashboard_file}.bak" 2>/dev/null || log_warn "Failed to replace STATUS in dashboard"
        sed -i.bak "s/TOTAL/$(docker ps -q --filter "name=dive-spoke-${instance_code}" 2>/dev/null | wc -l | tr -d ' ')/g" "$dashboard_file" && rm -f "${dashboard_file}.bak" 2>/dev/null || log_warn "Failed to replace TOTAL in dashboard"
        sed -i.bak "s/HEALTHY/$(orch_count_healthy_containers "$instance_code")/g" "$dashboard_file" && rm -f "${dashboard_file}.bak" 2>/dev/null || log_warn "Failed to replace HEALTHY in dashboard"
        sed -i.bak "s/MEMORY/$(orch_get_instance_memory_usage "$instance_code") MB/g" "$dashboard_file" && rm -f "${dashboard_file}.bak" 2>/dev/null || log_warn "Failed to replace MEMORY in dashboard"
        sed -i.bak "s/CRITICAL/${ORCH_CONTEXT[errors_critical]}/g" "$dashboard_file" && rm -f "${dashboard_file}.bak" 2>/dev/null || log_warn "Failed to replace CRITICAL in dashboard"
        sed -i.bak "s/HIGH/${ORCH_CONTEXT[errors_high]}/g" "$dashboard_file" && rm -f "${dashboard_file}.bak" 2>/dev/null || log_warn "Failed to replace HIGH in dashboard"
        sed -i.bak "s/RATE/$(( (ORCH_CONTEXT[errors_critical] + ORCH_CONTEXT[errors_high]) * 60 / ($(date +%s) - ORCH_CONTEXT[start_time]) ))/g" "$dashboard_file" && rm -f "${dashboard_file}.bak" 2>/dev/null || log_warn "Failed to replace RATE in dashboard"
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

export DIVE_ORCH_CHECKPOINT_RECOVERY_LOADED=1
