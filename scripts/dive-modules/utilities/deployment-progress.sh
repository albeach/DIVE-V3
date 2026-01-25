#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Real-Time Deployment Progress Display
# =============================================================================
# Phase 3 Sprint 2: Real-time observability for deployment operations
# Provides live progress updates during hub/spoke deployments
# =============================================================================

# Prevent multiple sourcing
if [ -n "$DEPLOYMENT_PROGRESS_LOADED" ]; then
    return 0
fi
export DEPLOYMENT_PROGRESS_LOADED=1

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# CONFIGURATION
# =============================================================================

# Progress update interval (seconds)
PROGRESS_UPDATE_INTERVAL=${PROGRESS_UPDATE_INTERVAL:-2}

# Progress display width
PROGRESS_BAR_WIDTH=${PROGRESS_BAR_WIDTH:-40}

# Enable/disable real-time progress
ENABLE_REALTIME_PROGRESS=${ENABLE_REALTIME_PROGRESS:-true}

# =============================================================================
# PROGRESS STATE MANAGEMENT
# =============================================================================

# Global progress state (stored in temp file for inter-process communication)
declare -g PROGRESS_STATE_FILE=""
declare -g PROGRESS_MONITOR_PID=""

##
# Initialize progress tracking for a deployment
#
# Arguments:
#   $1 - Deployment type (hub|spoke)
#   $2 - Instance code (USA, GBR, etc.)
#   $3 - Total phases
##
progress_init() {
    local deploy_type="$1"
    local instance="$2"
    local total_phases="$3"

    # Create temp file for progress state
    PROGRESS_STATE_FILE=$(mktemp /tmp/dive-progress-XXXXXX)
    
    # Initialize state
    cat > "$PROGRESS_STATE_FILE" <<EOF
{
  "deploy_type": "$deploy_type",
  "instance": "$instance",
  "total_phases": $total_phases,
  "current_phase": 0,
  "phase_name": "Initializing",
  "services_healthy": 0,
  "services_total": 0,
  "start_time": $(date +%s),
  "phase_start_time": $(date +%s),
  "status": "running"
}
EOF

    # Start progress monitor if real-time display is enabled
    if [ "$ENABLE_REALTIME_PROGRESS" = "true" ] && [ -t 1 ]; then
        progress_start_monitor &
        PROGRESS_MONITOR_PID=$!
        
        # Ensure cleanup on exit
        trap "progress_cleanup" EXIT INT TERM
    fi

    log_verbose "Progress tracking initialized (state: $PROGRESS_STATE_FILE, monitor: $PROGRESS_MONITOR_PID)"
}

##
# Update progress state
#
# Arguments:
#   $1 - Field name (current_phase|phase_name|services_healthy|services_total|status)
#   $2 - New value
##
progress_update() {
    local field="$1"
    local value="$2"

    if [ -z "$PROGRESS_STATE_FILE" ] || [ ! -f "$PROGRESS_STATE_FILE" ]; then
        return 0
    fi

    # Read current state
    local current_state=$(cat "$PROGRESS_STATE_FILE")

    # Update field using jq
    local updated_state=$(echo "$current_state" | jq \
        --arg field "$field" \
        --arg value "$value" \
        'if ($field == "services_healthy" or $field == "services_total" or $field == "current_phase" or $field == "total_phases") then
            .[$field] = ($value | tonumber)
         else
            .[$field] = $value
         end')

    # Write back
    echo "$updated_state" > "$PROGRESS_STATE_FILE"
}

##
# Update current phase
#
# Arguments:
#   $1 - Phase number (1-based)
#   $2 - Phase name
##
progress_set_phase() {
    local phase_num="$1"
    local phase_name="$2"

    progress_update "current_phase" "$phase_num"
    progress_update "phase_name" "$phase_name"
    progress_update "phase_start_time" "$(date +%s)"
}

##
# Update service counts
#
# Arguments:
#   $1 - Number of healthy services
#   $2 - Total services
##
progress_set_services() {
    local healthy="$1"
    local total="$2"

    progress_update "services_healthy" "$healthy"
    progress_update "services_total" "$total"
}

##
# Mark progress as complete
##
progress_complete() {
    progress_update "status" "complete"
    
    # Stop monitor
    if [ -n "$PROGRESS_MONITOR_PID" ]; then
        kill "$PROGRESS_MONITOR_PID" 2>/dev/null || true
        wait "$PROGRESS_MONITOR_PID" 2>/dev/null || true
    fi

    # Show final newline to preserve output
    if [ "$ENABLE_REALTIME_PROGRESS" = "true" ] && [ -t 1 ]; then
        echo ""
    fi
}

##
# Mark progress as failed
#
# Arguments:
#   $1 - Error message
##
progress_fail() {
    local error_msg="$1"

    progress_update "status" "failed"
    progress_update "error" "$error_msg"
    
    # Stop monitor
    if [ -n "$PROGRESS_MONITOR_PID" ]; then
        kill "$PROGRESS_MONITOR_PID" 2>/dev/null || true
        wait "$PROGRESS_MONITOR_PID" 2>/dev/null || true
    fi

    # Show final newline
    if [ "$ENABLE_REALTIME_PROGRESS" = "true" ] && [ -t 1 ]; then
        echo ""
    fi
}

##
# Cleanup progress tracking
##
progress_cleanup() {
    # Stop monitor
    if [ -n "$PROGRESS_MONITOR_PID" ]; then
        kill "$PROGRESS_MONITOR_PID" 2>/dev/null || true
        wait "$PROGRESS_MONITOR_PID" 2>/dev/null || true
    fi

    # Remove state file
    if [ -n "$PROGRESS_STATE_FILE" ] && [ -f "$PROGRESS_STATE_FILE" ]; then
        rm -f "$PROGRESS_STATE_FILE"
    fi
}

# =============================================================================
# REAL-TIME DISPLAY
# =============================================================================

##
# Background monitor that displays progress in real-time
# Updates display every PROGRESS_UPDATE_INTERVAL seconds
##
progress_start_monitor() {
    while true; do
        # Read current state
        if [ ! -f "$PROGRESS_STATE_FILE" ]; then
            break
        fi

        local state=$(cat "$PROGRESS_STATE_FILE" 2>/dev/null)
        if [ -z "$state" ]; then
            sleep "$PROGRESS_UPDATE_INTERVAL"
            continue
        fi

        # Extract state fields
        local status=$(echo "$state" | jq -r '.status')
        if [ "$status" = "complete" ] || [ "$status" = "failed" ]; then
            break
        fi

        local deploy_type=$(echo "$state" | jq -r '.deploy_type')
        local instance=$(echo "$state" | jq -r '.instance')
        local current_phase=$(echo "$state" | jq -r '.current_phase')
        local total_phases=$(echo "$state" | jq -r '.total_phases')
        local phase_name=$(echo "$state" | jq -r '.phase_name')
        local services_healthy=$(echo "$state" | jq -r '.services_healthy')
        local services_total=$(echo "$state" | jq -r '.services_total')
        local start_time=$(echo "$state" | jq -r '.start_time')
        local phase_start_time=$(echo "$state" | jq -r '.phase_start_time')

        # Calculate elapsed time
        local now=$(date +%s)
        local total_elapsed=$((now - start_time))
        local phase_elapsed=$((now - phase_start_time))

        # Calculate ETA (simple linear projection)
        local eta="..."
        if [ "$current_phase" -gt 0 ] && [ "$total_phases" -gt 0 ]; then
            local avg_phase_time=$((total_elapsed / current_phase))
            local remaining_phases=$((total_phases - current_phase))
            local eta_seconds=$((remaining_phases * avg_phase_time))
            eta="${eta_seconds}s"
        fi

        # Build progress line
        local progress_line=""

        # Phase progress
        if [ "$total_phases" -gt 0 ]; then
            progress_line="⏳ Phase ${current_phase}/${total_phases}: ${phase_name}"
        else
            progress_line="⏳ ${phase_name}"
        fi

        # Service progress (if applicable)
        if [ "$services_total" -gt 0 ]; then
            progress_line="${progress_line} (${services_healthy}/${services_total} healthy)"
        fi

        # Timing
        progress_line="${progress_line} | ${total_elapsed}s elapsed"

        # ETA
        if [ "$eta" != "..." ]; then
            progress_line="${progress_line} | ETA: ~${eta}"
        fi

        # Display with cursor line rewrite (ANSI escape: \r clears line, no newline)
        printf "\r\033[K%s" "$progress_line" >&2

        # Wait before next update
        sleep "$PROGRESS_UPDATE_INTERVAL"
    done
}

##
# Generate ASCII progress bar
#
# Arguments:
#   $1 - Current value
#   $2 - Maximum value
#   $3 - Bar width (optional, default: PROGRESS_BAR_WIDTH)
#
# Returns:
#   ASCII progress bar string
##
progress_bar() {
    local current="$1"
    local max="$2"
    local width="${3:-$PROGRESS_BAR_WIDTH}"

    if [ "$max" -eq 0 ]; then
        echo "[$(printf '%*s' "$width" '' | tr ' ' '-')]"
        return
    fi

    local percent=$((current * 100 / max))
    local filled=$((current * width / max))
    local empty=$((width - filled))

    local bar="["
    if [ "$filled" -gt 0 ]; then
        bar="${bar}$(printf '%*s' "$filled" '' | tr ' ' '=')"
    fi
    if [ "$empty" -gt 0 ]; then
        bar="${bar}$(printf '%*s' "$empty" '' | tr ' ' '-')"
    fi
    bar="${bar}] ${percent}%"

    echo "$bar"
}

##
# Display deployment progress (one-time, not real-time)
# Used for manual progress display or final summary
#
# Arguments:
#   $1 - Current phase
#   $2 - Total phases
#   $3 - Services healthy
#   $4 - Services total
#   $5 - Elapsed seconds
##
show_deployment_progress() {
    local current_phase="$1"
    local total_phases="$2"
    local services_healthy="$3"
    local services_total="$4"
    local elapsed="$5"

    local phase_percent=$((current_phase * 100 / total_phases))
    local service_percent=0
    if [ "$services_total" -gt 0 ]; then
        service_percent=$((services_healthy * 100 / services_total))
    fi

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Deployment Progress"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Phases:   $(progress_bar "$current_phase" "$total_phases" 30)"
    echo "            ${current_phase}/${total_phases} phases complete"
    
    if [ "$services_total" -gt 0 ]; then
        echo "  Services: $(progress_bar "$services_healthy" "$services_total" 30)"
        echo "            ${services_healthy}/${services_total} services healthy"
    fi
    
    echo "  Time:     ${elapsed}s elapsed"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
}

# =============================================================================
# PHASE TRACKING HELPERS
# =============================================================================

##
# Start a deployment phase
#
# Arguments:
#   $1 - Phase number
#   $2 - Phase name
##
phase_start() {
    local phase_num="$1"
    local phase_name="$2"

    progress_set_phase "$phase_num" "$phase_name"
    log_info "Phase ${phase_num}: ${phase_name}"
}

##
# Complete a deployment phase
#
# Arguments:
#   $1 - Phase number
#   $2 - Duration in seconds (optional)
##
phase_complete() {
    local phase_num="$1"
    local duration="${2:-}"

    if [ -n "$duration" ]; then
        log_success "Phase ${phase_num} completed in ${duration}s"
    else
        log_success "Phase ${phase_num} completed"
    fi
}

##
# Fail a deployment phase
#
# Arguments:
#   $1 - Phase number
#   $2 - Error message
##
phase_fail() {
    local phase_num="$1"
    local error_msg="$2"

    progress_fail "$error_msg"
    log_error "Phase ${phase_num} failed: ${error_msg}"
}

# Export functions for subshells
export -f progress_init
export -f progress_update
export -f progress_set_phase
export -f progress_set_services
export -f progress_complete
export -f progress_fail
export -f progress_cleanup
export -f progress_start_monitor
export -f progress_bar
export -f show_deployment_progress
export -f phase_start
export -f phase_complete
export -f phase_fail
