#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Health Sentinel
# =============================================================================
# Background health monitor that watches Docker container health during
# deployment configuration phases. Detects service crashes mid-deployment
# and optionally auto-restarts failed containers.
#
# Usage:
#   health_sentinel_start "hub" "backend keycloak vault"
#   # ... deployment phases run ...
#   health_sentinel_stop
#   health_sentinel_report
#
# Configuration:
#   HEALTH_SENTINEL_ENABLED=true       # Enable/disable (default: true)
#   HEALTH_SENTINEL_INTERVAL=10        # Poll interval in seconds
#   HEALTH_SENTINEL_AUTO_RESTART=false  # Auto-restart crashed containers
# =============================================================================

# Prevent multiple sourcing
if [ -n "${HEALTH_SENTINEL_LOADED:-}" ]; then
    return 0
fi
export HEALTH_SENTINEL_LOADED=1

# =============================================================================
# CONFIGURATION
# =============================================================================

HEALTH_SENTINEL_ENABLED="${HEALTH_SENTINEL_ENABLED:-true}"
HEALTH_SENTINEL_INTERVAL="${HEALTH_SENTINEL_INTERVAL:-10}"
HEALTH_SENTINEL_AUTO_RESTART="${HEALTH_SENTINEL_AUTO_RESTART:-false}"
HEALTH_SENTINEL_PID_FILE="/tmp/dive-health-sentinel-$$.pid"
HEALTH_SENTINEL_ALERT_FILE="/tmp/dive-health-sentinel-$$.alerts"
HEALTH_SENTINEL_LOG_FILE="/tmp/dive-health-sentinel-$$.log"

# =============================================================================
# CORE SERVICES TO MONITOR
# =============================================================================

# Get core services for a deployment type
_sentinel_get_services() {
    local deploy_type="${1:-hub}"
    local compose_project="${2:-dive-hub}"

    if [ "$deploy_type" = "hub" ]; then
        # Detect Vault naming: HA mode uses vault-1, dev mode uses vault-dev
        local vault_svc="vault-1"
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "${compose_project}-vault-dev"; then
            vault_svc="vault-dev"
        fi
        echo "postgres mongodb redis ${vault_svc} keycloak backend frontend kas opal-server"
    else
        echo "keycloak backend frontend"
    fi
}

# Get Docker container name from service name
_sentinel_container_name() {
    local compose_project="${1:-dive-hub}"
    local service="$2"
    echo "${compose_project}-${service}"
}

# =============================================================================
# HEALTH CHECK
# =============================================================================

##
# Check a single container's health status
#
# Arguments:
#   $1 - Container name or ID
#
# Output:
#   One of: healthy, unhealthy, starting, none, missing
##
_sentinel_check_container() {
    local container="$1"

    # Check if container exists and is running
    local state
    state=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null)

    if [ -z "$state" ]; then
        echo "missing"
        return
    fi

    if [ "$state" != "running" ]; then
        echo "exited"
        return
    fi

    # Check health status if container has a healthcheck
    local health
    health=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container" 2>/dev/null || echo "none")
    echo "$health"
}

##
# Run one health check cycle across all monitored services
#
# Arguments:
#   $1 - Compose project name
#   $2... - Service names to check
#
# Output to alert file:
#   TIMESTAMP|SERVICE|STATUS|MESSAGE
##
_sentinel_check_cycle() {
    local compose_project="$1"
    shift
    local services="$*"
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local had_alert=false

    for service in $services; do
        local container
        container=$(_sentinel_container_name "$compose_project" "$service")
        local status
        status=$(_sentinel_check_container "$container")

        case "$status" in
            healthy|none|starting)
                # OK — no alert needed
                ;;
            unhealthy)
                echo "$timestamp|$service|UNHEALTHY|Container $container is unhealthy" >> "$HEALTH_SENTINEL_ALERT_FILE"
                had_alert=true

                # Auto-restart if enabled
                if [ "$HEALTH_SENTINEL_AUTO_RESTART" = "true" ]; then
                    echo "$timestamp|$service|RESTART|Attempting restart of $container" >> "$HEALTH_SENTINEL_ALERT_FILE"
                    docker restart "$container" >> "$HEALTH_SENTINEL_LOG_FILE" 2>&1 || true
                fi
                ;;
            exited|missing)
                echo "$timestamp|$service|DOWN|Container $container is $status" >> "$HEALTH_SENTINEL_ALERT_FILE"
                had_alert=true

                if [ "$HEALTH_SENTINEL_AUTO_RESTART" = "true" ] && [ "$status" = "exited" ]; then
                    echo "$timestamp|$service|RESTART|Attempting restart of $container" >> "$HEALTH_SENTINEL_ALERT_FILE"
                    docker start "$container" >> "$HEALTH_SENTINEL_LOG_FILE" 2>&1 || true
                fi
                ;;
        esac
    done

    if [ "$had_alert" = true ]; then
        return 1
    fi
    return 0
}

# =============================================================================
# BACKGROUND SENTINEL PROCESS
# =============================================================================

##
# Background monitoring loop (runs as a subshell)
#
# Arguments:
#   $1 - Compose project name
#   $2 - Space-separated service names
#   $3 - Poll interval
##
_sentinel_monitor_loop() {
    local compose_project="$1"
    local services="$2"
    local interval="$3"

    while true; do
        _sentinel_check_cycle "$compose_project" $services || true
        sleep "$interval"
    done
}

# =============================================================================
# PUBLIC API
# =============================================================================

##
# Start the health sentinel background monitor
#
# Arguments:
#   $1 - Deploy type: "hub" or "spoke"
#   $2 - Compose project name (e.g., "dive-hub", "dive-spoke-gbr")
#   $3 - (Optional) Space-separated service names to monitor
#
# Returns:
#   0 - Sentinel started
#   1 - Sentinel disabled or already running
##
health_sentinel_start() {
    local deploy_type="${1:-hub}"
    local compose_project="${2:-dive-hub}"
    local services="${3:-}"

    if [ "$HEALTH_SENTINEL_ENABLED" != "true" ]; then
        return 1
    fi

    # Don't start if already running
    if [ -f "$HEALTH_SENTINEL_PID_FILE" ]; then
        local existing_pid
        existing_pid=$(cat "$HEALTH_SENTINEL_PID_FILE" 2>/dev/null)
        if [ -n "$existing_pid" ] && kill -0 "$existing_pid" 2>/dev/null; then
            return 1
        fi
    fi

    # Use default services if none specified
    if [ -z "$services" ]; then
        services=$(_sentinel_get_services "$deploy_type" "$compose_project")
    fi

    # Clear previous alert file
    : > "$HEALTH_SENTINEL_ALERT_FILE"
    : > "$HEALTH_SENTINEL_LOG_FILE"

    # Start background monitor
    _sentinel_monitor_loop "$compose_project" "$services" "$HEALTH_SENTINEL_INTERVAL" &
    local sentinel_pid=$!
    echo "$sentinel_pid" > "$HEALTH_SENTINEL_PID_FILE"

    if type log_verbose &>/dev/null; then
        log_verbose "Health sentinel started (PID: $sentinel_pid, interval: ${HEALTH_SENTINEL_INTERVAL}s)"
    fi

    return 0
}

##
# Stop the health sentinel background monitor
#
# Returns:
#   0 - Sentinel stopped
#   1 - No sentinel running
##
health_sentinel_stop() {
    if [ ! -f "$HEALTH_SENTINEL_PID_FILE" ]; then
        return 1
    fi

    local sentinel_pid
    sentinel_pid=$(cat "$HEALTH_SENTINEL_PID_FILE" 2>/dev/null)

    if [ -n "$sentinel_pid" ] && kill -0 "$sentinel_pid" 2>/dev/null; then
        kill "$sentinel_pid" 2>/dev/null || true
        # Wait briefly for process to exit
        local wait_count=0
        while kill -0 "$sentinel_pid" 2>/dev/null && [ $wait_count -lt 5 ]; do
            sleep 0.2
            wait_count=$((wait_count + 1))
        done
        # Force kill if still running
        if kill -0 "$sentinel_pid" 2>/dev/null; then
            kill -9 "$sentinel_pid" 2>/dev/null || true
        fi
    fi

    rm -f "$HEALTH_SENTINEL_PID_FILE"

    if type log_verbose &>/dev/null; then
        log_verbose "Health sentinel stopped"
    fi

    return 0
}

##
# Check if the sentinel is currently running
#
# Returns:
#   0 - Running
#   1 - Not running
##
health_sentinel_is_running() {
    if [ ! -f "$HEALTH_SENTINEL_PID_FILE" ]; then
        return 1
    fi
    local sentinel_pid
    sentinel_pid=$(cat "$HEALTH_SENTINEL_PID_FILE" 2>/dev/null)
    if [ -n "$sentinel_pid" ] && kill -0 "$sentinel_pid" 2>/dev/null; then
        return 0
    fi
    return 1
}

##
# Get the number of alerts recorded
#
# Output:
#   Alert count
##
health_sentinel_alert_count() {
    if [ ! -f "$HEALTH_SENTINEL_ALERT_FILE" ]; then
        echo "0"
        return
    fi
    local count
    count=$(wc -l < "$HEALTH_SENTINEL_ALERT_FILE" 2>/dev/null | tr -d ' ')
    echo "${count:-0}"
}

##
# Print a health sentinel report
#
# Shows: alerts detected, services affected, and any restarts attempted
##
health_sentinel_report() {
    local alert_count
    alert_count=$(health_sentinel_alert_count)

    if [ "$alert_count" = "0" ]; then
        echo "  Health Sentinel: No issues detected during deployment"
        return 0
    fi

    echo ""
    echo "  ─────────────────────────────────────────────────────────────────"
    echo "  Health Sentinel Report ($alert_count alert(s))"
    echo "  ─────────────────────────────────────────────────────────────────"

    # Summarize by service
    local services_affected=""

    while IFS='|' read -r timestamp service status message; do
        if [ -n "$service" ]; then
            case "$services_affected" in
                *"$service"*) ;;
                *) services_affected="${services_affected:+$services_affected }$service" ;;
            esac
            echo "  [$status] $timestamp: $message"
        fi
    done < "$HEALTH_SENTINEL_ALERT_FILE"

    echo "  ─────────────────────────────────────────────────────────────────"
    echo "  Services affected: ${services_affected:-none}"

    local restart_count=0
    if [ -f "$HEALTH_SENTINEL_ALERT_FILE" ]; then
        restart_count=$(grep -c '|RESTART|' "$HEALTH_SENTINEL_ALERT_FILE" 2>/dev/null || true)
        restart_count="${restart_count:-0}"
    fi
    if [ "$restart_count" -gt 0 ]; then
        echo "  Auto-restarts attempted: $restart_count"
    fi
    echo ""

    return 1
}

##
# Check for alerts and print inline warning if any detected
# Intended to be called between phases for quick status check
#
# Returns:
#   0 - No new alerts
#   1 - Alerts detected (warning printed)
##
health_sentinel_check_alerts() {
    local alert_count
    alert_count=$(health_sentinel_alert_count)

    if [ "$alert_count" != "0" ]; then
        if type log_warn &>/dev/null; then
            log_warn "Health sentinel: $alert_count alert(s) — service health issues detected"
        fi
        return 1
    fi
    return 0
}

##
# Cleanup sentinel temp files
##
health_sentinel_cleanup() {
    health_sentinel_stop 2>/dev/null || true
    rm -f "$HEALTH_SENTINEL_ALERT_FILE" "$HEALTH_SENTINEL_LOG_FILE" "$HEALTH_SENTINEL_PID_FILE"
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f health_sentinel_start
export -f health_sentinel_stop
export -f health_sentinel_is_running
export -f health_sentinel_alert_count
export -f health_sentinel_report
export -f health_sentinel_check_alerts
export -f health_sentinel_cleanup
export -f _sentinel_get_services
export -f _sentinel_container_name
export -f _sentinel_check_container
export -f _sentinel_check_cycle
export -f _sentinel_monitor_loop
