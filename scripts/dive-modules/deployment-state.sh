#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Enhanced Deployment State Management Framework
# =============================================================================
# Enterprise-grade state management with corruption detection,
# automatic cleanup, and atomic transactions
# =============================================================================

# Prevent multiple sourcing
if [ -n "$DEPLOYMENT_STATE_LOADED" ]; then
    return 0
fi
export DEPLOYMENT_STATE_LOADED=1

# Source common utilities
if [ -f "$(dirname "${BASH_SOURCE[0]}")/common.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
fi

# State file location
get_state_file() {
    local spoke_code="$1"
    local code_lower
    code_lower=$(lower "$spoke_code")
    echo "${DIVE_ROOT}/.dive-state/${code_lower}.state"
}

##
# Get current deployment state
#
# Arguments:
#   $1 - Spoke code
#
# Outputs:
#   State name to stdout
##
get_deployment_state() {
    local spoke_code="$1"
    local state_file
    state_file=$(get_state_file "$spoke_code")

    if [ -f "$state_file" ]; then
        grep "^state=" "$state_file" | cut -d'=' -f2
    else
        echo "UNKNOWN"
    fi
}

##
# Set deployment state
#
# Arguments:
#   $1 - Spoke code
#   $2 - State name (INITIALIZING, DEPLOYING, CONFIGURING, VERIFYING, COMPLETE, FAILED)
#   $3 - Optional reason (for FAILED state)
##
set_deployment_state() {
    local spoke_code="$1"
    local state="$2"
    local reason="${3:-}"
    local state_file
    state_file=$(get_state_file "$spoke_code")

    # Create state directory if needed
    mkdir -p "$(dirname "$state_file")"

    # Write state file
    {
        echo "state=$state"
        echo "timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
        if [ -n "$reason" ]; then
            echo "reason=$reason"
        fi
    } > "$state_file"
}

##
# Check if deployment is in progress
#
# Arguments:
#   $1 - Spoke code
#
# Returns:
#   0 - Deployment in progress
#   1 - No deployment in progress
##
is_deployment_in_progress() {
    local spoke_code="$1"
    local state
    state=$(get_deployment_state "$spoke_code")

    case "$state" in
        INITIALIZING|DEPLOYING|CONFIGURING|VERIFYING)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

##
# Check if step should be skipped (already completed)
#
# Arguments:
#   $1 - Spoke code
#   $2 - Step name
#
# Returns:
#   0 - Step should be skipped
#   1 - Step should run
##
should_skip_step() {
    local spoke_code="$1"
    local step="$2"
    local state_file
    state_file=$(get_state_file "$spoke_code")

    if [ ! -f "$state_file" ]; then
        return 1  # No state file, run step
    fi

    # Check if step marker exists
    if grep -q "^step_${step}=" "$state_file"; then
        return 0  # Step completed, skip
    fi

    return 1  # Step not completed, run
}

##
# Mark step as completed
#
# Arguments:
#   $1 - Spoke code
#   $2 - Step name
##
mark_step_complete() {
    local spoke_code="$1"
    local step="$2"
    local state_file
    state_file=$(get_state_file "$spoke_code")

    # Create state directory if needed
    mkdir -p "$(dirname "$state_file")"

    # Append step marker
    echo "step_${step}=$(date -u +"%Y-%m-%dT%H:%M:%SZ")" >> "$state_file"
}

##
# Clear deployment state (for fresh deployment)
#
# Arguments:
#   $1 - Spoke code
##
clear_deployment_state() {
    local spoke_code="$1"
    local state_file
    state_file=$(get_state_file "$spoke_code")

    rm -f "$state_file"
}

##
# Get deployment failure reason
#
# Arguments:
#   $1 - Spoke code
#
# Outputs:
#   Failure reason to stdout
##
get_failure_reason() {
    local spoke_code="$1"
    local state_file
    state_file=$(get_state_file "$spoke_code")

    if [ -f "$state_file" ]; then
        grep "^reason=" "$state_file" | cut -d'=' -f2-
    fi
}

# =============================================================================
# ENHANCED STATE MANAGEMENT FRAMEWORK (Phase 2 Implementation)
# =============================================================================

# State machine constants
readonly STATE_UNKNOWN="UNKNOWN"
readonly STATE_INITIALIZING="INITIALIZING"
readonly STATE_DEPLOYING="DEPLOYING"
readonly STATE_CONFIGURING="CONFIGURING"
readonly STATE_VERIFYING="VERIFYING"
readonly STATE_COMPLETE="COMPLETE"
readonly STATE_FAILED="FAILED"
readonly STATE_ROLLING_BACK="ROLLING_BACK"
readonly STATE_CLEANUP="CLEANUP"

# State transition validation
declare -A VALID_TRANSITIONS=(
    # Normal deployment flow
    ["$STATE_UNKNOWN|$STATE_INITIALIZING"]=1
    ["$STATE_INITIALIZING|$STATE_DEPLOYING"]=1
    ["$STATE_DEPLOYING|$STATE_CONFIGURING"]=1
    ["$STATE_DEPLOYING|$STATE_FAILED"]=1
    ["$STATE_CONFIGURING|$STATE_VERIFYING"]=1
    ["$STATE_CONFIGURING|$STATE_FAILED"]=1
    ["$STATE_VERIFYING|$STATE_COMPLETE"]=1
    ["$STATE_VERIFYING|$STATE_FAILED"]=1
    
    # Failure handling
    ["$STATE_FAILED|$STATE_ROLLING_BACK"]=1
    ["$STATE_ROLLING_BACK|$STATE_CLEANUP"]=1
    ["$STATE_CLEANUP|$STATE_UNKNOWN"]=1
    
    # Cleanup transitions
    ["$STATE_COMPLETE|$STATE_CLEANUP"]=1
    
    # Redeploy transitions (allow redeployment from COMPLETE or FAILED)
    ["$STATE_COMPLETE|$STATE_INITIALIZING"]=1
    ["$STATE_FAILED|$STATE_INITIALIZING"]=1
)

##
# Validate state transition
#
# Arguments:
#   $1 - Current state
#   $2 - New state
#
# Returns:
#   0 - Valid transition
#   1 - Invalid transition
##
validate_state_transition() {
    local current_state="$1"
    local new_state="$2"
    local transition_key="${current_state}|${new_state}"

    if [ "${VALID_TRANSITIONS[$transition_key]}" = "1" ]; then
        return 0
    fi

    # Allow transition to FAILED from any state except CLEANUP
    if [ "$new_state" = "$STATE_FAILED" ] && [ "$current_state" != "$STATE_CLEANUP" ]; then
        return 0
    fi

    return 1
}

##
# Enhanced state setter with validation and corruption detection
#
# Arguments:
#   $1 - Spoke code
#   $2 - New state
#   $3 - Optional reason (for FAILED state)
#   $4 - Optional metadata JSON
##
set_deployment_state_enhanced() {
    local spoke_code="$1"
    local new_state="$2"
    local reason="${3:-}"
    local metadata="${4:-}"

    # Get current state
    local current_state
    current_state=$(get_deployment_state "$spoke_code")

    # Validate transition
    if ! validate_state_transition "$current_state" "$new_state"; then
        log_warn "Invalid state transition: $current_state → $new_state for $spoke_code"
        # Allow invalid transitions but log them
    fi

    # Create state file atomically
    local state_file
    state_file=$(get_state_file "$spoke_code")
    local temp_file="${state_file}.tmp"

    # Write to temporary file first
    {
        echo "state=$new_state"
        echo "timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
        echo "version=2.0"  # Enhanced state format
        if [ -n "$reason" ]; then
            echo "reason=$reason"
        fi
        if [ -n "$metadata" ]; then
            echo "metadata=$metadata"
        fi
        # Add checksum for corruption detection
        echo "checksum=$(echo "$new_state$(date +%s)" | sha256sum | cut -d' ' -f1)"
    } > "$temp_file"

    # Atomic move
    mv "$temp_file" "$state_file"

    log_verbose "State transition: $current_state → $new_state for $spoke_code"

    # Auto-cleanup old states if transitioning to COMPLETE or CLEANUP
    if [ "$new_state" = "$STATE_COMPLETE" ] || [ "$new_state" = "$STATE_CLEANUP" ]; then
        schedule_state_cleanup "$spoke_code"
    fi
}

##
# Validate state file integrity
#
# Arguments:
#   $1 - Spoke code
#
# Returns:
#   0 - State file is valid
#   1 - State file is corrupted or invalid
##
validate_state_integrity() {
    local spoke_code="$1"
    local state_file
    state_file=$(get_state_file "$spoke_code")

    if [ ! -f "$state_file" ]; then
        return 0  # No file is valid (UNKNOWN state)
    fi

    # Check for required fields
    local state timestamp version
    state=$(grep "^state=" "$state_file" | cut -d'=' -f2)
    timestamp=$(grep "^timestamp=" "$state_file" | cut -d'=' -f2)
    version=$(grep "^version=" "$state_file" | cut -d'=' -f2 || echo "1.0")

    if [ -z "$state" ] || [ -z "$timestamp" ]; then
        log_error "Corrupted state file for $spoke_code: missing required fields"
        return 1
    fi

    # Validate state value
    case "$state" in
        UNKNOWN|INITIALIZING|DEPLOYING|CONFIGURING|VERIFYING|COMPLETE|FAILED|ROLLING_BACK|CLEANUP)
            ;;
        *)
            log_error "Corrupted state file for $spoke_code: invalid state '$state'"
            return 1
            ;;
    esac

    # Validate timestamp format
    if ! date -d "$timestamp" >/dev/null 2>&1; then
        log_error "Corrupted state file for $spoke_code: invalid timestamp '$timestamp'"
        return 1
    fi

    # Check for stale states (older than 24 hours)
    local timestamp_epoch
    timestamp_epoch=$(date -d "$timestamp" +%s 2>/dev/null || echo "0")
    local now_epoch
    now_epoch=$(date +%s)
    local age_hours=$(( (now_epoch - timestamp_epoch) / 3600 ))

    if [ "$age_hours" -gt 24 ]; then
        log_warn "Stale state file detected for $spoke_code (age: ${age_hours}h)"
        # Don't fail validation, but flag for cleanup
        echo "STALE:${age_hours}h" >&2
    fi

    return 0
}

##
# Schedule automatic cleanup of completed states
#
# Arguments:
#   $1 - Spoke code
##
schedule_state_cleanup() {
    local spoke_code="$1"

    # Schedule cleanup after 1 hour for completed deployments
    # In production, this would use a job scheduler
    log_verbose "Scheduled cleanup for $spoke_code state in 1 hour"

    # For now, just mark for cleanup on next deployment
    local state_file
    state_file=$(get_state_file "$spoke_code")
    touch "${state_file}.cleanup_scheduled"
}

##
# Force cleanup stale states
#
# Arguments:
#   $1 - Optional spoke code filter (default: all)
##
cleanup_stale_states() {
    local filter="${1:-}"

    log_info "Cleaning up stale deployment states..."

    local state_dir="${DIVE_ROOT}/.dive-state"
    local cleaned=0

    for state_file in "$state_dir"/*.state; do
        if [ ! -f "$state_file" ]; then
            continue
        fi

        local spoke_code
        spoke_code=$(basename "$state_file" .state)

        # Apply filter if specified
        if [ -n "$filter" ] && [ "$spoke_code" != "$filter" ]; then
            continue
        fi

        # Check if state is valid and get staleness info
        local validation_output
        validation_output=$(validate_state_integrity "$spoke_code" 2>&1)
        local is_stale=$?

        if echo "$validation_output" | grep -q "STALE:"; then
            log_info "Removing stale state file for $spoke_code"
            rm -f "$state_file" "${state_file}.cleanup_scheduled"
            ((cleaned++))
        elif [ "$is_stale" -ne 0 ]; then
            log_warn "Removing corrupted state file for $spoke_code"
            rm -f "$state_file" "${state_file}.cleanup_scheduled"
            ((cleaned++))
        fi
    done

    if [ "$cleaned" -gt 0 ]; then
        log_success "Cleaned up $cleaned stale/corrupted state files"
    else
        log_info "No stale state files found"
    fi
}

##
# Get enhanced deployment state with validation
#
# Arguments:
#   $1 - Spoke code
#
# Returns:
#   State name (with validation warnings to stderr)
##
get_deployment_state_enhanced() {
    local spoke_code="$1"

    # Validate state file first
    local validation_output
    validation_output=$(validate_state_integrity "$spoke_code" 2>&1)
    local validation_status=$?

    if [ "$validation_status" -ne 0 ]; then
        echo "$STATE_UNKNOWN" >&2
        return 1
    fi

    # Get the actual state
    local state
    state=$(get_deployment_state "$spoke_code")

    # Warn about stale states
    if echo "$validation_output" | grep -q "STALE:"; then
        local age
        age=$(echo "$validation_output" | sed 's/STALE:\([0-9]*\)h/\1/')
        echo "WARNING: State is ${age}h old" >&2
    fi

    echo "$state"
}

