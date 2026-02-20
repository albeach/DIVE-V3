#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Deployment Log File Management
# =============================================================================
# Captures all deployment output to timestamped log files for post-mortem
# analysis and debugging. Log files persist across sessions.
#
# Usage:
#   deployment_log_start "hub" "USA"     # Returns log file path
#   deployment_log_start "spoke" "GBR"   # Returns log file path
#   deployment_log_path                   # Get current log file path
#   deployment_log_stop                   # Stop tee capture
# =============================================================================

# Prevent multiple sourcing
if [ -n "${DEPLOYMENT_LOGGING_LOADED:-}" ]; then
    return 0
fi
export DEPLOYMENT_LOGGING_LOADED=1

# =============================================================================
# LOG FILE MANAGEMENT
# =============================================================================

# Current log file path (set by deployment_log_start)
DEPLOYMENT_LOG_FILE=""
DEPLOYMENT_LOG_TEE_PID=""

##
# Initialize deployment log file and start capturing output
#
# Arguments:
#   $1 - Deployment type: "hub" or "spoke"
#   $2 - Instance code (e.g., USA, GBR)
#
# Returns:
#   0 - Log file created and capture started
#   1 - Failed (non-fatal, deployment continues without logging)
#
# Side effects:
#   Sets DEPLOYMENT_LOG_FILE to the log file path
#   Redirects stdout/stderr through tee to log file
##
deployment_log_start() {
    local deploy_type="${1:?Deployment type required (hub|spoke)}"
    local instance_code="${2:-USA}"
    local code_lower
    code_lower=$(echo "$instance_code" | tr '[:upper:]' '[:lower:]')

    local log_dir="${DIVE_ROOT:-.}/logs/deployments"
    local timestamp
    timestamp=$(date +%Y%m%d-%H%M%S)

    # Create log directory
    if ! mkdir -p "$log_dir" 2>/dev/null; then
        # Non-fatal: deployment continues without log file
        return 1
    fi

    # Generate log file name
    if [ "$deploy_type" = "hub" ]; then
        DEPLOYMENT_LOG_FILE="${log_dir}/hub-${timestamp}.log"
    else
        DEPLOYMENT_LOG_FILE="${log_dir}/spoke-${code_lower}-${timestamp}.log"
    fi

    # Write log header
    {
        echo "==============================================================================="
        echo "  DIVE V3 Deployment Log"
        echo "==============================================================================="
        echo "  Type:      $deploy_type"
        echo "  Instance:  $instance_code"
        echo "  Started:   $(date '+%Y-%m-%d %H:%M:%S %Z')"
        echo "  Command:   $0 $*"
        echo "==============================================================================="
        echo ""
    } > "$DEPLOYMENT_LOG_FILE"

    # Start tee capture: duplicate stdout+stderr to log file
    # Uses process substitution to avoid subshell issues
    exec > >(tee -a "$DEPLOYMENT_LOG_FILE") 2>&1
    DEPLOYMENT_LOG_TEE_PID=$!

    export DEPLOYMENT_LOG_FILE

    return 0
}

##
# Get current deployment log file path
#
# Returns:
#   Log file path on stdout, or empty if no active log
##
deployment_log_path() {
    echo "${DEPLOYMENT_LOG_FILE:-}"
}

##
# Stop log capture and finalize log file
#
# Arguments:
#   $1 - Exit status (0=success, 1=failure)
#   $2 - Duration in seconds
##
deployment_log_stop() {
    local exit_status="${1:-0}"
    local duration="${2:-0}"

    if [ -z "$DEPLOYMENT_LOG_FILE" ] || [ ! -f "$DEPLOYMENT_LOG_FILE" ]; then
        return 0
    fi

    # Append footer to log file (write directly, not through tee)
    {
        echo ""
        echo "==============================================================================="
        echo "  Deployment Log Footer"
        echo "==============================================================================="
        echo "  Finished:  $(date '+%Y-%m-%d %H:%M:%S %Z')"
        echo "  Duration:  ${duration}s"
        echo "  Status:    $([ "$exit_status" -eq 0 ] && echo "SUCCESS" || echo "FAILED")"
        echo "==============================================================================="
    } >> "$DEPLOYMENT_LOG_FILE"
}

##
# Clean old deployment logs (keep last N days)
#
# Arguments:
#   $1 - Days to keep (default: 30)
##
deployment_log_cleanup() {
    local days="${1:-30}"
    local log_dir="${DIVE_ROOT:-.}/logs/deployments"

    if [ -d "$log_dir" ]; then
        find "$log_dir" -name "*.log" -mtime +"$days" -delete 2>/dev/null || true
    fi
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f deployment_log_start
export -f deployment_log_path
export -f deployment_log_stop
export -f deployment_log_cleanup

# sc2034-anchor
: "${DEPLOYMENT_LOG_TEE_PID:-}"
