#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Hub Pipeline Checkpoint Management
# =============================================================================
# Provides checkpoint-based deployment resume capability for Hub deployments.
# Modeled after spoke-checkpoint.sh to ensure consistent behavior.
#
# Checkpoints are stored in ${DIVE_ROOT}/.dive-state/hub/.phases/ and track
# completion of each pipeline phase:
#   - PREFLIGHT
#   - INITIALIZATION
#   - MONGODB_INIT
#   - SERVICES
#   - ORCHESTRATION_DB
#   - KEYCLOAK_CONFIG
#   - REALM_VERIFY
#   - KAS_REGISTER
#   - SEEDING
#   - KAS_INIT
#   - COMPLETE
#
# This enables --resume functionality to skip completed phases.
# =============================================================================
# Version: 1.0.0
# Date: 2026-02-05
# =============================================================================

# Prevent multiple sourcing
if [ -n "${HUB_CHECKPOINT_LOADED:-}" ]; then
    return 0
fi
export HUB_CHECKPOINT_LOADED=1

# Ensure common functions are loaded
if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# HUB CHECKPOINT CONSTANTS
# =============================================================================

# Hub checkpoint directory
readonly HUB_CHECKPOINT_BASE="${DIVE_ROOT}/.dive-state/hub"
readonly HUB_CHECKPOINT_DIR="${HUB_CHECKPOINT_BASE}/.phases"

# Valid hub phases (in execution order)
readonly HUB_VALID_PHASES=(
    "VAULT_BOOTSTRAP"    # Phase 1: Vault start, init, setup, seed
    "DATABASE_INIT"      # Phase 2: PostgreSQL + Orchestration DB
    "PREFLIGHT"          # Phase 3
    "INITIALIZATION"     # Phase 4
    "MONGODB_INIT"       # Phase 5
    "BUILD"              # Phase 6
    "SERVICES"           # Phase 7
    "VAULT_DB_ENGINE"    # Phase 8: Dynamic credentials + service restart
    "KEYCLOAK_CONFIG"    # Phase 9
    "REALM_VERIFY"       # Phase 10
    "KAS_REGISTER"       # Phase 11
    "SEEDING"            # Phase 12
    "KAS_INIT"           # Phase 13
    "COMPLETE"           # Final
)

# =============================================================================
# CHECKPOINT CREATION
# =============================================================================

##
# Mark a hub phase as complete
#
# Arguments:
#   $1 - Phase name
#   $2 - Optional: Duration in seconds
#   $3 - Optional: Additional metadata (JSON string)
#
# Returns:
#   0 - Checkpoint created
#   1 - Invalid arguments or IO error
##
hub_checkpoint_mark_complete() {
    local phase="$1"
    local duration="${2:-0}"
    local metadata="${3:-{}}"

    # Validate phase name
    local phase_valid=false
    for valid_phase in "${HUB_VALID_PHASES[@]}"; do
        if [ "$phase" = "$valid_phase" ]; then
            phase_valid=true
            break
        fi
    done

    if [ "$phase_valid" = false ]; then
        log_error "Invalid hub phase name: $phase"
        return 1
    fi

    # Create checkpoint directory if needed
    if ! mkdir -p "$HUB_CHECKPOINT_DIR" 2>/dev/null; then
        log_error "Cannot create hub checkpoint directory: $HUB_CHECKPOINT_DIR"
        return 1
    fi

    local checkpoint_file="${HUB_CHECKPOINT_DIR}/${phase}.done"

    # Build checkpoint data
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local hostname=$(hostname)
    local username=$(whoami)

    # Create checkpoint file with metadata
    cat > "$checkpoint_file" <<EOF
{
  "phase": "$phase",
  "instance_code": "USA",
  "deployment_type": "hub",
  "completed_at": "$timestamp",
  "hostname": "$hostname",
  "user": "$username",
  "duration_seconds": $duration,
  "metadata": $metadata
}
EOF

    if [ $? -eq 0 ]; then
        log_verbose "Hub checkpoint marked: $phase"
        return 0
    else
        log_error "Failed to create hub checkpoint file: $checkpoint_file"
        return 1
    fi
}

# =============================================================================
# CHECKPOINT QUERYING
# =============================================================================

##
# Check if a hub phase is complete
#
# Arguments:
#   $1 - Phase name
#
# Returns:
#   0 - Phase is complete (checkpoint exists and valid)
#   1 - Phase is not complete or checkpoint invalid
##
hub_checkpoint_is_complete() {
    local phase="$1"

    if [ -z "$phase" ]; then
        return 1
    fi

    local checkpoint_file="${HUB_CHECKPOINT_DIR}/${phase}.done"

    # Check if checkpoint file exists
    if [ ! -f "$checkpoint_file" ]; then
        return 1
    fi

    # Validate checkpoint file is valid JSON
    if ! jq empty "$checkpoint_file" 2>/dev/null; then
        log_warn "Hub checkpoint file corrupted: $checkpoint_file"
        return 1
    fi

    # Checkpoint exists and is valid
    return 0
}

##
# Get hub checkpoint completion timestamp
#
# Arguments:
#   $1 - Phase name
#
# Returns:
#   Timestamp string on stdout (ISO 8601), or empty if not complete
##
hub_checkpoint_get_timestamp() {
    local phase="$1"

    if ! hub_checkpoint_is_complete "$phase"; then
        echo ""
        return 1
    fi

    local checkpoint_file="${HUB_CHECKPOINT_DIR}/${phase}.done"
    jq -r '.completed_at // empty' "$checkpoint_file" 2>/dev/null
}

##
# Get list of completed hub phases
#
# Returns:
#   Space-separated list of completed phase names on stdout
##
hub_checkpoint_list_completed() {
    if [ ! -d "$HUB_CHECKPOINT_DIR" ]; then
        echo ""
        return 0
    fi

    # List .done files and extract phase names
    local completed_phases=""
    for checkpoint_file in "$HUB_CHECKPOINT_DIR"/*.done; do
        if [ -f "$checkpoint_file" ]; then
            local basename=$(basename "$checkpoint_file" .done)
            completed_phases="$completed_phases $basename"
        fi
    done

    echo "$completed_phases" | xargs
}

##
# Get hub checkpoint summary for logging
#
# Returns:
#   Human-readable summary on stdout
##
hub_checkpoint_get_summary() {
    local completed=$(hub_checkpoint_list_completed)

    if [ -z "$completed" ]; then
        echo "No completed phases"
        return 0
    fi

    local total=${#HUB_VALID_PHASES[@]}
    local count=$(echo "$completed" | wc -w | tr -d ' ')

    echo "Completed $count/$total phases: $completed"
}

# =============================================================================
# CHECKPOINT CLEANUP
# =============================================================================

##
# Clear all hub checkpoints
#
# Arguments:
#   $1 - Optional: Confirmation flag (set to "confirm" to skip prompt)
#
# Returns:
#   0 - Checkpoints cleared
#   1 - User cancelled or error
##
hub_checkpoint_clear_all() {
    local confirm_flag="${1:-}"

    if [ ! -d "$HUB_CHECKPOINT_DIR" ]; then
        log_verbose "No hub checkpoints to clear"
        return 0
    fi

    # Check if there are any checkpoints
    local checkpoint_count=$(find "$HUB_CHECKPOINT_DIR" -name "*.done" 2>/dev/null | wc -l | tr -d ' ')
    if [ "$checkpoint_count" -eq 0 ]; then
        log_verbose "No hub checkpoints to clear"
        return 0
    fi

    # Confirm before clearing (unless confirm flag passed)
    if [ "$confirm_flag" != "confirm" ]; then
        log_warn "This will remove all hub checkpoints"
        log_warn "Next hub deployment will run from scratch"
        read -p "Are you sure? (yes/no): " -r
        if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
            log_info "Hub checkpoint clear cancelled"
            return 1
        fi
    fi

    # Remove all checkpoint files
    if rm -f "$HUB_CHECKPOINT_DIR"/*.done 2>/dev/null; then
        log_success "Cleared $checkpoint_count hub checkpoint(s)"
        return 0
    else
        log_error "Failed to clear hub checkpoints"
        return 1
    fi
}

##
# Clear a specific hub checkpoint
#
# Arguments:
#   $1 - Phase name
#
# Returns:
#   0 - Checkpoint cleared
#   1 - Error or checkpoint doesn't exist
##
hub_checkpoint_clear_phase() {
    local phase="$1"

    if [ -z "$phase" ]; then
        log_error "hub_checkpoint_clear_phase: phase required"
        return 1
    fi

    local checkpoint_file="${HUB_CHECKPOINT_DIR}/${phase}.done"

    if [ ! -f "$checkpoint_file" ]; then
        log_verbose "No checkpoint to clear for hub phase $phase"
        return 0
    fi

    if rm -f "$checkpoint_file" 2>/dev/null; then
        log_verbose "Cleared hub checkpoint: $phase"
        return 0
    else
        log_error "Failed to clear hub checkpoint: $checkpoint_file"
        return 1
    fi
}

# =============================================================================
# CHECKPOINT VALIDATION
# =============================================================================

##
# Validate hub checkpoint consistency with actual system state
#
# Checks if checkpoints accurately reflect the actual deployment state:
#   - SERVICES: Check hub containers exist
#   - KEYCLOAK_CONFIG: Check realm exists
#   - ORCHESTRATION_DB: Check database tables exist
#
# Returns:
#   0 - Checkpoints consistent with system state
#   1 - Inconsistencies detected (auto-corrected)
##
hub_checkpoint_validate_state() {
    local issues=0

    log_verbose "Validating hub checkpoint state consistency..."

    # Check SERVICES checkpoint
    if hub_checkpoint_is_complete "SERVICES"; then
        # Verify hub containers exist
        local container_count=$(docker ps -a --filter "name=dive-hub-" --format "{{.Names}}" 2>/dev/null | wc -l | tr -d ' ')

        if [ "$container_count" -eq 0 ]; then
            log_warn "SERVICES checkpoint exists but no hub containers found"
            log_warn "Clearing SERVICES checkpoint - will recreate containers"
            hub_checkpoint_clear_phase "SERVICES"
            ((issues++))
        fi
    fi

    # Check KEYCLOAK_CONFIG checkpoint
    if hub_checkpoint_is_complete "KEYCLOAK_CONFIG"; then
        # Verify Keycloak is running
        local kc_container="dive-hub-keycloak"
        local realm="dive-v3-broker-usa"

        if docker ps --format '{{.Names}}' | grep -q "^${kc_container}$"; then
            local realm_check=$(curl -sk --max-time 5 "https://localhost:${KEYCLOAK_HTTPS_PORT:-8443}/realms/${realm}" 2>/dev/null | \
                jq -r '.realm // empty' 2>/dev/null)

            if [ "$realm_check" != "$realm" ]; then
                log_warn "KEYCLOAK_CONFIG checkpoint exists but realm '$realm' not accessible"
                log_warn "Clearing KEYCLOAK_CONFIG checkpoint - will reapply Terraform"
                hub_checkpoint_clear_phase "KEYCLOAK_CONFIG"
                ((issues++))
            fi
        else
            log_verbose "Keycloak not running - skipping realm validation"
        fi
    fi

    # Check ORCHESTRATION_DB checkpoint
    if hub_checkpoint_is_complete "ORCHESTRATION_DB"; then
        # Verify database tables exist
        local postgres_container="dive-hub-postgres"
        if docker ps --format '{{.Names}}' | grep -q "^${postgres_container}$"; then
            local table_count=$(docker exec "$postgres_container" psql -U postgres -d orchestration -t -c \
                "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'" 2>/dev/null | xargs || echo "0")

            if [ "$table_count" -lt 6 ]; then
                log_warn "ORCHESTRATION_DB checkpoint exists but only $table_count tables found"
                log_warn "Clearing ORCHESTRATION_DB checkpoint - will reinitialize"
                hub_checkpoint_clear_phase "ORCHESTRATION_DB"
                ((issues++))
            fi
        else
            log_verbose "PostgreSQL not running - skipping database validation"
        fi
    fi

    if [ $issues -eq 0 ]; then
        log_verbose "Hub checkpoint state consistent"
        return 0
    else
        log_warn "Found $issues hub checkpoint inconsistencies (auto-corrected)"
        return 1
    fi
}

# =============================================================================
# RESUME CAPABILITY
# =============================================================================

##
# Get the next hub phase to execute for resume
#
# Returns:
#   Phase name on stdout, or empty string if all phases complete
##
hub_checkpoint_get_next_phase() {
    # Check each phase in order
    for phase in "${HUB_VALID_PHASES[@]}"; do
        if [ "$phase" = "COMPLETE" ]; then
            # Special case - if COMPLETE checkpoint exists, deployment is done
            if hub_checkpoint_is_complete "COMPLETE"; then
                echo ""
                return 0
            fi
            continue
        fi

        if ! hub_checkpoint_is_complete "$phase"; then
            echo "$phase"
            return 0
        fi
    done

    # All phases complete
    echo ""
    return 0
}

##
# Check if hub deployment can be resumed
#
# Returns:
#   0 - Deployment can be resumed (at least one phase complete)
#   1 - Cannot resume (no checkpoints or all complete)
##
hub_checkpoint_can_resume() {
    local completed=$(hub_checkpoint_list_completed)

    if [ -z "$completed" ]; then
        return 1  # No checkpoints
    fi

    local next_phase=$(hub_checkpoint_get_next_phase)
    if [ -z "$next_phase" ]; then
        return 1  # All phases complete
    fi

    return 0
}

##
# Print hub resume summary
##
hub_checkpoint_print_resume_info() {
    local completed=$(hub_checkpoint_list_completed)
    local next_phase=$(hub_checkpoint_get_next_phase)

    echo ""
    echo "=== Hub Resume Information ==="
    echo ""
    echo "Completed phases:"
    for phase in $completed; do
        local timestamp=$(hub_checkpoint_get_timestamp "$phase")
        echo "  + $phase (completed: $timestamp)"
    done

    if [ -n "$next_phase" ]; then
        echo ""
        echo "Next phase to execute: $next_phase"
        echo ""
        echo "To resume hub deployment:"
        echo "  ./dive hub deploy --resume"
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
# Generate hub checkpoint report (JSON)
#
# Returns:
#   JSON report on stdout
##
hub_checkpoint_report_json() {
    # Build phase array
    local phases_json="["
    local first=true

    for phase in "${HUB_VALID_PHASES[@]}"; do
        if [ "$phase" = "COMPLETE" ]; then
            continue
        fi

        local checkpoint_file="${HUB_CHECKPOINT_DIR}/${phase}.done"

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
  "instance_code": "USA",
  "deployment_type": "hub",
  "checkpoint_directory": "$HUB_CHECKPOINT_DIR",
  "phases": $phases_json,
  "can_resume": $(hub_checkpoint_can_resume && echo "true" || echo "false"),
  "next_phase": "$(hub_checkpoint_get_next_phase)"
}
EOF
}

# =============================================================================
# GENERIC INTERFACE (for pipeline-common.sh compatibility)
# =============================================================================

##
# Generic checkpoint mark complete (detects hub vs spoke)
##
deployment_checkpoint_mark_complete() {
    local instance_code="$1"
    local phase="$2"
    local duration="${3:-0}"
    local metadata="${4:-{}}"

    local code_upper=$(upper "$instance_code")

    if [ "$code_upper" = "USA" ]; then
        hub_checkpoint_mark_complete "$phase" "$duration" "$metadata"
    else
        # Delegate to spoke checkpoint if available
        if type spoke_checkpoint_mark_complete &>/dev/null; then
            spoke_checkpoint_mark_complete "$code_upper" "$phase" "$duration" "$metadata"
        else
            log_warn "Spoke checkpoint module not loaded"
            return 1
        fi
    fi
}

##
# Generic checkpoint is complete (detects hub vs spoke)
##
deployment_checkpoint_is_complete() {
    local instance_code="$1"
    local phase="$2"

    local code_upper=$(upper "$instance_code")

    if [ "$code_upper" = "USA" ]; then
        hub_checkpoint_is_complete "$phase"
    else
        # Delegate to spoke checkpoint if available
        if type spoke_checkpoint_is_complete &>/dev/null; then
            spoke_checkpoint_is_complete "$code_upper" "$phase"
        else
            return 1
        fi
    fi
}

# =============================================================================
# MODULE INITIALIZATION
# =============================================================================

# Ensure hub checkpoint directory exists
_hub_checkpoint_init() {
    mkdir -p "$HUB_CHECKPOINT_DIR" 2>/dev/null || true
}

# Run initialization on module load
_hub_checkpoint_init

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f hub_checkpoint_mark_complete
export -f hub_checkpoint_is_complete
export -f hub_checkpoint_clear_all
export -f hub_checkpoint_validate_state
export -f hub_checkpoint_can_resume
export -f hub_checkpoint_get_next_phase
export -f hub_checkpoint_print_resume_info
export -f deployment_checkpoint_mark_complete
export -f deployment_checkpoint_is_complete

log_verbose "Hub checkpoint module loaded"
