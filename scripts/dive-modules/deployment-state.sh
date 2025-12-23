#!/usr/bin/env bash
# =============================================================================
# Deployment State Machine
# =============================================================================
# Track deployment state and prevent duplicate operations
# =============================================================================

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

