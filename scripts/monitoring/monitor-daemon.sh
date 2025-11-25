#!/usr/bin/env bash
# ============================================
# DIVE V3 - Continuous Monitoring Daemon
# ============================================
# Runs health checks at configurable intervals
# and maintains a status history
#
# Usage:
#   ./scripts/monitoring/monitor-daemon.sh start   # Start daemon
#   ./scripts/monitoring/monitor-daemon.sh stop    # Stop daemon
#   ./scripts/monitoring/monitor-daemon.sh status  # Show status
#   ./scripts/monitoring/monitor-daemon.sh logs    # Show logs
#
# Configuration:
#   CHECK_INTERVAL  - Seconds between checks (default: 60)
#   HISTORY_SIZE    - Number of checks to keep (default: 1440 = 24h)
#
# ============================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
PID_FILE="/tmp/dive-v3-monitor.pid"
LOG_FILE="${PROJECT_ROOT}/logs/monitoring/daemon.log"
STATUS_FILE="${PROJECT_ROOT}/logs/monitoring/current-status.json"
HISTORY_FILE="${PROJECT_ROOT}/logs/monitoring/status-history.json"

CHECK_INTERVAL="${CHECK_INTERVAL:-60}"
HISTORY_SIZE="${HISTORY_SIZE:-1440}"

mkdir -p "$(dirname "$LOG_FILE")"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

start_daemon() {
    if [[ -f "$PID_FILE" ]]; then
        local pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            echo "Daemon already running (PID: $pid)"
            exit 1
        fi
    fi
    
    log "Starting DIVE V3 monitoring daemon..."
    log "Check interval: ${CHECK_INTERVAL}s"
    
    # Initialize history file
    [[ ! -f "$HISTORY_FILE" ]] && echo "[]" > "$HISTORY_FILE"
    
    # Run in background
    (
        echo $$ > "$PID_FILE"
        
        while true; do
            # Run health check
            local result=$("$SCRIPT_DIR/health-check.sh" --json 2>/dev/null) || result='{"error":"check_failed"}'
            
            # Update current status
            echo "$result" > "$STATUS_FILE"
            
            # Append to history (keep last N entries)
            local history=$(cat "$HISTORY_FILE")
            local new_history=$(echo "$history" | jq --argjson new "$result" '. + [$new] | .[-'"$HISTORY_SIZE"':]')
            echo "$new_history" > "$HISTORY_FILE"
            
            # Log summary
            local timestamp=$(echo "$result" | jq -r '.timestamp // "unknown"')
            local statuses=$(echo "$result" | jq -r '.instances[]? | "\(.instance): \(.status)"' 2>/dev/null | tr '\n' ', ')
            log "Check complete: $statuses"
            
            sleep "$CHECK_INTERVAL"
        done
    ) &
    
    disown
    sleep 1
    
    if [[ -f "$PID_FILE" ]]; then
        local pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            log "Daemon started (PID: $pid)"
            echo "Monitoring daemon started (PID: $pid)"
            echo "Status file: $STATUS_FILE"
            echo "History file: $HISTORY_FILE"
        else
            log "Failed to start daemon"
            exit 1
        fi
    fi
}

stop_daemon() {
    if [[ ! -f "$PID_FILE" ]]; then
        echo "No daemon running"
        exit 0
    fi
    
    local pid=$(cat "$PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
        log "Stopping daemon (PID: $pid)..."
        kill "$pid"
        rm -f "$PID_FILE"
        echo "Daemon stopped"
    else
        echo "Daemon not running (stale PID file)"
        rm -f "$PID_FILE"
    fi
}

show_status() {
    echo "=== DIVE V3 Monitoring Daemon Status ==="
    
    if [[ -f "$PID_FILE" ]]; then
        local pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            echo "Status: RUNNING (PID: $pid)"
        else
            echo "Status: STOPPED (stale PID file)"
        fi
    else
        echo "Status: STOPPED"
    fi
    
    echo ""
    echo "Current Status:"
    if [[ -f "$STATUS_FILE" ]]; then
        cat "$STATUS_FILE" | jq '.' 2>/dev/null || cat "$STATUS_FILE"
    else
        echo "  No status available"
    fi
    
    echo ""
    echo "History entries: $(cat "$HISTORY_FILE" 2>/dev/null | jq 'length' 2>/dev/null || echo 0)"
}

show_logs() {
    if [[ -f "$LOG_FILE" ]]; then
        tail -50 "$LOG_FILE"
    else
        echo "No logs available"
    fi
}

case "${1:-status}" in
    start) start_daemon ;;
    stop) stop_daemon ;;
    status) show_status ;;
    logs) show_logs ;;
    restart) stop_daemon; sleep 1; start_daemon ;;
    *)
        echo "Usage: $0 {start|stop|status|logs|restart}"
        exit 1
        ;;
esac

