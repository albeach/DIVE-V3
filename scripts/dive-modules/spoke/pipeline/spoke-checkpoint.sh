#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Spoke Checkpoint Module
# =============================================================================
# Provides checkpoint management for the spoke deployment pipeline.
# Bridges pipeline resume/checkpoint functions to the orchestration DB
# via spoke-validation.sh primitives (spoke_phase_is_complete, etc.).
#
# Functions defined here:
#   spoke_checkpoint_can_resume        - Check if a previous deployment can be resumed
#   spoke_checkpoint_validate_state    - Validate checkpoint consistency
#   spoke_checkpoint_print_resume_info - Display resume information
#   spoke_checkpoint_is_complete       - Check if a specific phase is complete
#   spoke_checkpoint_mark_complete     - Mark a phase as complete
#   spoke_checkpoint_clear_all         - Clear all checkpoints for an instance
# =============================================================================

# Prevent multiple sourcing
if [ -n "${SPOKE_CHECKPOINT_LOADED:-}" ]; then
    return 0
fi
export SPOKE_CHECKPOINT_LOADED=1

# Pipeline phases in execution order
readonly _SPOKE_CHECKPOINT_PHASES=(
    "PREFLIGHT"
    "INITIALIZATION"
    "DEPLOYMENT"
    "CONFIGURATION"
    "SEEDING"
    "VERIFICATION"
)

# =============================================================================
# RESUME SUPPORT
# =============================================================================

##
# Check if a previous deployment can be resumed
#
# A deployment is resumable if at least one phase completed successfully
# and the deployment is not in a terminal state (COMPLETE or UNKNOWN).
#
# Arguments:
#   $1 - Instance code (uppercase)
#
# Returns:
#   0 - Can resume
#   1 - Cannot resume
##
spoke_checkpoint_can_resume() {
    local instance_code="$1"

    # Check current deployment state
    local current_state
    current_state=$(get_deployment_state "$instance_code" 2>/dev/null || echo "UNKNOWN")

    # Cannot resume from terminal or unknown states
    case "$current_state" in
        COMPLETE)
            log_verbose "Deployment already complete — nothing to resume"
            return 1
            ;;
        UNKNOWN)
            log_verbose "No prior deployment found — nothing to resume"
            return 1
            ;;
    esac

    # Check if any phase has been completed
    for phase in "${_SPOKE_CHECKPOINT_PHASES[@]}"; do
        if spoke_checkpoint_is_complete "$instance_code" "$phase"; then
            log_verbose "Resumable: phase $phase is complete"
            return 0
        fi
    done

    log_verbose "No completed phases found — cannot resume"
    return 1
}

##
# Validate checkpoint consistency
#
# Ensures phases are completed in order (no gaps). If phase N is complete
# but phase N-1 is not, clears phase N to force sequential re-execution.
#
# Arguments:
#   $1 - Instance code (uppercase)
#
# Returns:
#   0 - Consistent (or corrected)
#   1 - Inconsistency found and corrected
##
spoke_checkpoint_validate_state() {
    local instance_code="$1"
    local inconsistency_found=false

    local prev_complete=true
    for phase in "${_SPOKE_CHECKPOINT_PHASES[@]}"; do
        local this_complete=false
        if spoke_checkpoint_is_complete "$instance_code" "$phase"; then
            this_complete=true
        fi

        # Gap detection: this phase complete but previous was not
        if [ "$this_complete" = true ] && [ "$prev_complete" = false ]; then
            log_warn "Checkpoint gap: $phase is complete but a prior phase is not — clearing $phase"
            if type spoke_phase_clear &>/dev/null; then
                spoke_phase_clear "$instance_code" "$phase" 2>/dev/null || true
            fi
            inconsistency_found=true
        fi

        prev_complete="$this_complete"
    done

    if [ "$inconsistency_found" = true ]; then
        return 1
    fi
    return 0
}

##
# Print resume information showing which phases will be skipped/re-run
#
# Arguments:
#   $1 - Instance code (uppercase)
##
spoke_checkpoint_print_resume_info() {
    local instance_code="$1"

    echo ""
    echo "  Resume status for $instance_code:"
    echo "  ─────────────────────────────────"

    for phase in "${_SPOKE_CHECKPOINT_PHASES[@]}"; do
        if spoke_checkpoint_is_complete "$instance_code" "$phase"; then
            echo "    [DONE] $phase — will be skipped"
        else
            echo "    [TODO] $phase — will be executed"
        fi
    done

    echo ""
}

# =============================================================================
# PHASE CHECKPOINT OPERATIONS
# =============================================================================

##
# Check if a specific phase is complete
#
# Delegates to spoke_phase_is_complete from spoke-validation.sh
#
# Arguments:
#   $1 - Instance code (uppercase)
#   $2 - Phase name
#
# Returns:
#   0 - Phase is complete
#   1 - Phase is not complete
##
spoke_checkpoint_is_complete() {
    local instance_code="$1"
    local phase="$2"

    if type spoke_phase_is_complete &>/dev/null; then
        spoke_phase_is_complete "$instance_code" "$phase"
    else
        return 1
    fi
}

##
# Mark a phase as complete
#
# Delegates to spoke_phase_mark_complete from spoke-validation.sh
#
# Arguments:
#   $1 - Instance code (uppercase)
#   $2 - Phase name
#   $3 - Duration in seconds (optional)
#   $4 - Metadata JSON (optional, unused — kept for hub-checkpoint.sh compat)
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_checkpoint_mark_complete() {
    local instance_code="$1"
    local phase="$2"
    local duration="${3:-0}"

    if type spoke_phase_mark_complete &>/dev/null; then
        spoke_phase_mark_complete "$instance_code" "$phase" "$duration"
    else
        log_warn "spoke_phase_mark_complete not available"
        return 1
    fi
}

##
# Clear all checkpoints for an instance
#
# Arguments:
#   $1 - Instance code (uppercase)
#   $2 - Confirmation string (must be "confirm")
#
# Returns:
#   0 - Cleared
#   1 - Not confirmed or error
##
spoke_checkpoint_clear_all() {
    local instance_code="$1"
    local confirm="${2:-}"

    if [ "$confirm" != "confirm" ]; then
        log_error "spoke_checkpoint_clear_all requires 'confirm' as second argument"
        return 1
    fi

    local cleared=0

    for phase in "${_SPOKE_CHECKPOINT_PHASES[@]}"; do
        if type spoke_phase_clear &>/dev/null; then
            if spoke_phase_clear "$instance_code" "$phase" 2>/dev/null; then
                ((cleared++))
            fi
        fi
    done

    log_verbose "Cleared $cleared checkpoints for $instance_code"
    return 0
}
