#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Spoke Pipeline Checkpoint Management
# =============================================================================
# Provides checkpoint-based deployment resume capability for resilient
# deployments that can recover from timeouts and failures.
#
# Checkpoints are stored in the instance's .phases/ directory and track
# completion of each pipeline phase:
#   - PREFLIGHT
#   - INITIALIZATION
#   - DEPLOYMENT
#   - CONFIGURATION
#   - SEEDING
#   - VERIFICATION
#
# This enables --resume functionality to skip completed phases.
# =============================================================================
# Version: 1.0.0
# Date: 2026-01-25
# =============================================================================

# Prevent multiple sourcing
if [ -n "${SPOKE_CHECKPOINT_LOADED:-}" ]; then
    return 0
fi
export SPOKE_CHECKPOINT_LOADED=1

# =============================================================================
# CHECKPOINT CONSTANTS
# =============================================================================

# Checkpoint directory (relative to instance directory)
readonly CHECKPOINT_DIR=".phases"

# Valid phase names
readonly VALID_PHASES=(
    "PREFLIGHT"
    "INITIALIZATION"
    "DEPLOYMENT"
    "CONFIGURATION"
    "SEEDING"
    "VERIFICATION"
    "COMPLETE"
)

# =============================================================================
# CHECKPOINT CREATION
# =============================================================================

##
# Mark a phase as complete
#
# Creates a checkpoint marker file indicating the phase completed successfully.
# Marker files contain: timestamp, hostname, user, duration, and optional metadata.
#
# Arguments:
#   $1 - Instance code (e.g., FRA, USA)
#   $2 - Phase name (PREFLIGHT, INITIALIZATION, etc.)
#   $3 - Optional: Duration in seconds
#   $4 - Optional: Additional metadata (JSON string)
#
# Returns:
#   0 - Checkpoint created
#   1 - Invalid arguments or IO error
##
spoke_checkpoint_mark_complete() {
    local instance_code="$1"
    local phase="$2"
    local duration="$3"
    local metadata="$4"
    
    # Set defaults
    [ -z "$duration" ] && duration=0
    [ -z "$metadata" ] && metadata="{}"

    # Validate arguments
    if [ -z "$instance_code" ] || [ -z "$phase" ]; then
        log_error "spoke_checkpoint_mark_complete: instance_code and phase required"
        return 1
    fi

    # Validate phase name
    local phase_valid=false
    for valid_phase in "${VALID_PHASES[@]}"; do
        if [ "$phase" = "$valid_phase" ]; then
            phase_valid=true
            break
        fi
    done

    if [ "$phase_valid" = false ]; then
        log_error "Invalid phase name: $phase"
        return 1
    fi

    local code_lower=$(lower "$instance_code")
    local instance_dir="${DIVE_ROOT}/instances/${code_lower}"
    local checkpoint_dir="${instance_dir}/${CHECKPOINT_DIR}"
    local checkpoint_file="${checkpoint_dir}/${phase}.done"

    # Create checkpoint directory if needed
    if ! mkdir -p "$checkpoint_dir" 2>/dev/null; then
        log_error "Cannot create checkpoint directory: $checkpoint_dir"
        return 1
    fi

    # Build checkpoint data
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local hostname=$(hostname)
    local username=$(whoami)

    # Create checkpoint file with metadata
    cat > "$checkpoint_file" <<EOF
{
  "phase": "$phase",
  "instance_code": "$instance_code",
  "completed_at": "$timestamp",
  "hostname": "$hostname",
  "user": "$username",
  "duration_seconds": $duration,
  "metadata": $metadata
}
EOF

    if [ $? -eq 0 ]; then
        log_verbose "Checkpoint marked: $phase for $instance_code"
        return 0
    else
        log_error "Failed to create checkpoint file: $checkpoint_file"
        return 1
    fi
}

# =============================================================================
# CHECKPOINT QUERYING
# =============================================================================

##
# Check if a phase is complete
#
# Arguments:
#   $1 - Instance code
#   $2 - Phase name
#
# Returns:
#   0 - Phase is complete (checkpoint exists and valid)
#   1 - Phase is not complete or checkpoint invalid
##
spoke_checkpoint_is_complete() {
    local instance_code="$1"
    local phase="$2"

    if [ -z "$instance_code" ] || [ -z "$phase" ]; then
        return 1
    fi

    local code_lower=$(lower "$instance_code")
    local instance_dir="${DIVE_ROOT}/instances/${code_lower}"
    local checkpoint_file="${instance_dir}/${CHECKPOINT_DIR}/${phase}.done"

    # Check if checkpoint file exists and is a regular file
    if [ ! -f "$checkpoint_file" ]; then
        return 1
    fi

    # Validate checkpoint file is valid JSON
    if ! jq empty "$checkpoint_file" 2>/dev/null; then
        log_warn "Checkpoint file corrupted: $checkpoint_file"
        return 1
    fi

    # Checkpoint exists and is valid
    return 0
}

##
# Get checkpoint completion timestamp
#
# Arguments:
#   $1 - Instance code
#   $2 - Phase name
#
# Returns:
#   Timestamp string on stdout (ISO 8601), or empty if not complete
##
spoke_checkpoint_get_timestamp() {
    local instance_code="$1"
    local phase="$2"

    if ! spoke_checkpoint_is_complete "$instance_code" "$phase"; then
        echo ""
        return 1
    fi

    local code_lower=$(lower "$instance_code")
    local instance_dir="${DIVE_ROOT}/instances/${code_lower}"
    local checkpoint_file="${instance_dir}/${CHECKPOINT_DIR}/${phase}.done"

    jq -r '.completed_at // empty' "$checkpoint_file" 2>/dev/null
}

##
# Get list of completed phases
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   Space-separated list of completed phase names on stdout
##
spoke_checkpoint_list_completed() {
    local instance_code="$1"

    if [ -z "$instance_code" ]; then
        echo ""
        return 1
    fi

    local code_lower=$(lower "$instance_code")
    local instance_dir="${DIVE_ROOT}/instances/${code_lower}"
    local checkpoint_dir="${instance_dir}/${CHECKPOINT_DIR}"

    if [ ! -d "$checkpoint_dir" ]; then
        echo ""
        return 0
    fi

    # List .done files and extract phase names
    local completed_phases=""
    for checkpoint_file in "$checkpoint_dir"/*.done; do
        if [ -f "$checkpoint_file" ]; then
            local basename=$(basename "$checkpoint_file" .done)
            completed_phases="$completed_phases $basename"
        fi
    done

    echo "$completed_phases" | xargs
}

##
# Get checkpoint summary for logging
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   Human-readable summary on stdout
##
spoke_checkpoint_get_summary() {
    local instance_code="$1"
    local completed=$(spoke_checkpoint_list_completed "$instance_code")

    if [ -z "$completed" ]; then
        echo "No completed phases"
        return 0
    fi

    local total=${#VALID_PHASES[@]}
    local count=$(echo "$completed" | wc -w | tr -d ' ')

    echo "Completed $count/$total phases: $completed"
}

# =============================================================================
# CHECKPOINT CLEANUP
# =============================================================================

##
# Clear all checkpoints for an instance
#
# This removes ALL checkpoint markers, forcing a full redeployment on next run.
# Use with caution - typically only needed for troubleshooting or starting fresh.
#
# Arguments:
#   $1 - Instance code
#   $2 - Optional: Confirmation flag (set to "confirm" to skip prompt)
#
# Returns:
#   0 - Checkpoints cleared
#   1 - User cancelled or error
##
spoke_checkpoint_clear_all() {
    local instance_code="$1"
    local confirm_flag="${2:-}"

    if [ -z "$instance_code" ]; then
        log_error "spoke_checkpoint_clear_all: instance_code required"
        return 1
    fi

    local code_lower=$(lower "$instance_code")
    local instance_dir="${DIVE_ROOT}/instances/${code_lower}"
    local checkpoint_dir="${instance_dir}/${CHECKPOINT_DIR}"

    if [ ! -d "$checkpoint_dir" ]; then
        log_verbose "No checkpoints to clear for $instance_code"
        return 0
    fi

    # Check if there are any checkpoints
    local checkpoint_count=$(find "$checkpoint_dir" -name "*.done" 2>/dev/null | wc -l | tr -d ' ')
    if [ "$checkpoint_count" -eq 0 ]; then
        log_verbose "No checkpoints to clear for $instance_code"
        return 0
    fi

    # Confirm before clearing (unless confirm flag passed)
    if [ "$confirm_flag" != "confirm" ]; then
        log_warn "This will remove all checkpoints for $instance_code"
        log_warn "Next deployment will run from scratch"
        read -p "Are you sure? (yes/no): " -r
        if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
            log_info "Checkpoint clear cancelled"
            return 1
        fi
    fi

    # Remove all checkpoint files
    if rm -f "$checkpoint_dir"/*.done 2>/dev/null; then
        log_success "Cleared $checkpoint_count checkpoint(s) for $instance_code"
        return 0
    else
        log_error "Failed to clear checkpoints"
        return 1
    fi
}

##
# Clear a specific checkpoint
#
# Arguments:
#   $1 - Instance code
#   $2 - Phase name
#
# Returns:
#   0 - Checkpoint cleared
#   1 - Error or checkpoint doesn't exist
##
spoke_checkpoint_clear_phase() {
    local instance_code="$1"
    local phase="$2"

    if [ -z "$instance_code" ] || [ -z "$phase" ]; then
        log_error "spoke_checkpoint_clear_phase: instance_code and phase required"
        return 1
    fi

    local code_lower=$(lower "$instance_code")
    local instance_dir="${DIVE_ROOT}/instances/${code_lower}"
    local checkpoint_file="${instance_dir}/${CHECKPOINT_DIR}/${phase}.done"

    if [ ! -f "$checkpoint_file" ]; then
        log_verbose "No checkpoint to clear for phase $phase"
        return 0
    fi

    if rm -f "$checkpoint_file" 2>/dev/null; then
        log_verbose "Cleared checkpoint: $phase for $instance_code"
        return 0
    else
        log_error "Failed to clear checkpoint: $checkpoint_file"
        return 1
    fi
}

# =============================================================================
# CHECKPOINT VALIDATION
# =============================================================================

##
# Validate checkpoint consistency with actual system state
#
# Checks if checkpoints accurately reflect the actual deployment state:
#   - INITIALIZATION: Check config files exist
#   - DEPLOYMENT: Check containers running
#   - CONFIGURATION: Check Keycloak realm exists
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Checkpoints consistent with system state
#   1 - Inconsistencies detected (requires cleanup or full redeploy)
##
spoke_checkpoint_validate_state() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")
    local issues=0

    log_verbose "Validating checkpoint state consistency for $instance_code..."

    # Check INITIALIZATION checkpoint
    if spoke_checkpoint_is_complete "$instance_code" "INITIALIZATION"; then
        # Verify config files exist
        local config_file="${DIVE_ROOT}/instances/${code_lower}/config.json"
        local compose_file="${DIVE_ROOT}/instances/${code_lower}/docker-compose.yml"
        local env_file="${DIVE_ROOT}/instances/${code_lower}/.env"

        if [ ! -f "$config_file" ] || [ ! -f "$compose_file" ] || [ ! -f "$env_file" ]; then
            log_warn "INITIALIZATION checkpoint exists but config files missing"
            log_warn "Clearing INITIALIZATION checkpoint - will regenerate"
            spoke_checkpoint_clear_phase "$instance_code" "INITIALIZATION"
            ((issues++))
        fi
    fi

    # Check DEPLOYMENT checkpoint
    if spoke_checkpoint_is_complete "$instance_code" "DEPLOYMENT"; then
        # Verify containers exist (don't need to be running - may have been stopped)
        local container_count=$(docker ps -a --filter "name=dive-spoke-${code_lower}-" --format "{{.Names}}" 2>/dev/null | wc -l | tr -d ' ')

        if [ "$container_count" -eq 0 ]; then
            log_warn "DEPLOYMENT checkpoint exists but no containers found"
            log_warn "Clearing DEPLOYMENT checkpoint - will recreate containers"
            spoke_checkpoint_clear_phase "$instance_code" "DEPLOYMENT"
            ((issues++))
        fi
    fi

    # Check CONFIGURATION checkpoint
    if spoke_checkpoint_is_complete "$instance_code" "CONFIGURATION"; then
        # Verify Keycloak realm exists (best-effort - requires Keycloak running)
        local kc_container="dive-spoke-${code_lower}-keycloak"
        local realm="dive-v3-broker-${code_lower}"

        if docker ps --format '{{.Names}}' | grep -q "^${kc_container}$"; then
            local realm_check=$(docker exec "$kc_container" curl -sf \
                "http://localhost:8080/realms/${realm}" 2>/dev/null | \
                jq -r '.realm // empty' 2>/dev/null)

            if [ "$realm_check" != "$realm" ]; then
                log_warn "CONFIGURATION checkpoint exists but realm '$realm' not accessible"
                log_warn "Clearing CONFIGURATION checkpoint - will reapply Terraform"
                spoke_checkpoint_clear_phase "$instance_code" "CONFIGURATION"
                ((issues++))
            fi
        else
            log_verbose "Keycloak not running - skipping realm validation"
        fi
    fi

    if [ $issues -eq 0 ]; then
        log_verbose "Checkpoint state consistent"
        return 0
    else
        log_warn "Found $issues checkpoint inconsistencies (auto-corrected)"
        return 1
    fi
}

# =============================================================================
# RESUME CAPABILITY
# =============================================================================

##
# Get the next phase to execute for resume
#
# Determines which phase should run next based on completed checkpoints.
# Returns the first incomplete phase in the pipeline order.
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   Phase name on stdout, or empty string if all phases complete
##
spoke_checkpoint_get_next_phase() {
    local instance_code="$1"

    # Check each phase in order
    for phase in "${VALID_PHASES[@]}"; do
        if [ "$phase" = "COMPLETE" ]; then
            # Special case - if COMPLETE checkpoint exists, deployment is done
            if spoke_checkpoint_is_complete "$instance_code" "COMPLETE"; then
                echo ""
                return 0
            fi
            continue
        fi

        if ! spoke_checkpoint_is_complete "$instance_code" "$phase"; then
            echo "$phase"
            return 0
        fi
    done

    # All phases complete
    echo ""
    return 0
}

##
# Check if deployment can be resumed
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Deployment can be resumed (at least one phase complete)
#   1 - Cannot resume (no checkpoints or all complete)
##
spoke_checkpoint_can_resume() {
    local instance_code="$1"
    local completed=$(spoke_checkpoint_list_completed "$instance_code")

    if [ -z "$completed" ]; then
        return 1  # No checkpoints
    fi

    local next_phase=$(spoke_checkpoint_get_next_phase "$instance_code")
    if [ -z "$next_phase" ]; then
        return 1  # All phases complete
    fi

    return 0
}

##
# Print resume summary
#
# Arguments:
#   $1 - Instance code
##
spoke_checkpoint_print_resume_info() {
    local instance_code="$1"
    local completed=$(spoke_checkpoint_list_completed "$instance_code")
    local next_phase=$(spoke_checkpoint_get_next_phase "$instance_code")

    echo ""
    echo "=== Resume Information for $instance_code ==="
    echo ""
    echo "Completed phases:"
    for phase in $completed; do
        local timestamp=$(spoke_checkpoint_get_timestamp "$instance_code" "$phase")
        echo "  ✓ $phase (completed: $timestamp)"
    done

    if [ -n "$next_phase" ]; then
        echo ""
        echo "Next phase to execute: $next_phase"
        echo ""
        echo "To resume deployment:"
        echo "  ./dive spoke deploy $instance_code --resume"
    else
        echo ""
        echo "Status: All phases complete"
    fi
    echo ""
}

# =============================================================================
# CHECKPOINT REPORTING
# =============================================================================

##
# Generate checkpoint report (JSON)
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   JSON report on stdout
##
spoke_checkpoint_report_json() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")
    local checkpoint_dir="${DIVE_ROOT}/instances/${code_lower}/${CHECKPOINT_DIR}"

    # Build phase array
    local phases_json="["
    local first=true

    for phase in "${VALID_PHASES[@]}"; do
        if [ "$phase" = "COMPLETE" ]; then
            continue
        fi

        local checkpoint_file="${checkpoint_dir}/${phase}.done"

        if [ "$first" = false ]; then
            phases_json="${phases_json},"
        fi
        first=false

        if [ -f "$checkpoint_file" ] && jq empty "$checkpoint_file" 2>/dev/null; then
            # Read checkpoint data
            local phase_data=$(cat "$checkpoint_file")
            phases_json="${phases_json}${phase_data}"
        else
            # Phase not complete
            phases_json="${phases_json}{\"phase\":\"$phase\",\"completed\":false}"
        fi
    done

    phases_json="${phases_json}]"

    # Build final report
    cat <<EOF
{
  "instance_code": "$instance_code",
  "checkpoint_directory": "$checkpoint_dir",
  "phases": $phases_json,
  "can_resume": $(spoke_checkpoint_can_resume "$instance_code" && echo "true" || echo "false"),
  "next_phase": "$(spoke_checkpoint_get_next_phase "$instance_code")"
}
EOF
}

# =============================================================================
# CLI HELPER FUNCTIONS
# =============================================================================

##
# Clear checkpoints via CLI
#
# Usage: ./dive spoke clear-checkpoints <instance>
##
spoke_checkpoint_cli_clear() {
    local instance_code="$1"

    if [ -z "$instance_code" ]; then
        log_error "Usage: ./dive spoke clear-checkpoints <instance>"
        return 1
    fi

    local code_upper=$(upper "$instance_code")
    spoke_checkpoint_clear_all "$code_upper"
}

##
# Show checkpoint status via CLI
#
# Usage: ./dive spoke checkpoint-status <instance>
##
spoke_checkpoint_cli_status() {
    local instance_code="$1"

    if [ -z "$instance_code" ]; then
        log_error "Usage: ./dive spoke checkpoint-status <instance>"
        return 1
    fi

    local code_upper=$(upper "$instance_code")
    spoke_checkpoint_print_resume_info "$code_upper"
}

# =============================================================================
# INTEGRATION WITH ORCHESTRATION FRAMEWORK
# =============================================================================

##
# Integration point: Mark phase complete after successful execution
#
# This is called by the pipeline controller after each phase completes.
#
# Arguments:
#   $1 - Instance code
#   $2 - Phase name
#   $3 - Duration in seconds
##
spoke_checkpoint_on_phase_complete() {
    local instance_code="$1"
    local phase="$2"
    local duration="$3"

    # Create checkpoint
    if ! spoke_checkpoint_mark_complete "$instance_code" "$phase" "$duration"; then
        log_warn "Failed to create checkpoint for $phase"
        # Non-fatal - continue deployment
    fi

    # Also record in orchestration DB if available
    if type orch_db_record_step &>/dev/null; then
        orch_db_record_step "$instance_code" "$phase" "COMPLETED" "" 2>/dev/null || true
    fi
}

##
# Integration point: Determine if phase should be skipped during resume
#
# Arguments:
#   $1 - Instance code
#   $2 - Phase name
#
# Returns:
#   0 - Phase should be skipped (already complete)
#   1 - Phase should be executed
##
spoke_checkpoint_should_skip_phase() {
    local instance_code="$1"
    local phase="$2"

    if spoke_checkpoint_is_complete "$instance_code" "$phase"; then
        log_info "Skipping $phase (already complete - resuming)"
        return 0
    fi

    return 1
}

# =============================================================================
# MODULE INITIALIZATION
# =============================================================================

# Ensure checkpoint directories exist for active instances
_spoke_checkpoint_init() {
    if [ -d "${DIVE_ROOT}/instances" ]; then
        for instance_dir in "${DIVE_ROOT}/instances"/*/; do
            if [ -d "$instance_dir" ]; then
                mkdir -p "${instance_dir}${CHECKPOINT_DIR}" 2>/dev/null || true
            fi
        done
    fi
}

# Run initialization on module load
_spoke_checkpoint_init

# Export key functions for external use
export -f spoke_checkpoint_mark_complete
export -f spoke_checkpoint_is_complete
export -f spoke_checkpoint_clear_all
export -f spoke_checkpoint_validate_state
export -f spoke_checkpoint_can_resume
export -f spoke_checkpoint_get_next_phase
