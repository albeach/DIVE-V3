#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 Orchestration State Management (Consolidated)
# =============================================================================
# PostgreSQL-backed state management (SSOT)
# =============================================================================
# Version: 5.0.0 (Module Consolidation)
# Date: 2026-01-22
#
# Consolidates:
#   - orchestration-state-db.sh (database state)
#   - orchestration-state-recovery.sh (recovery functions)
#
# ADR-001: Database is the SOLE source of truth
# =============================================================================

# Prevent multiple sourcing
[ -n "$DIVE_ORCHESTRATION_STATE_LOADED" ] && return 0
export DIVE_ORCHESTRATION_STATE_LOADED=1

# =============================================================================
# LOAD DEPENDENCIES
# =============================================================================

ORCH_DIR="$(dirname "${BASH_SOURCE[0]}")"
MODULES_DIR="$(dirname "$ORCH_DIR")"

if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "${MODULES_DIR}/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# DATABASE CONFIGURATION
# =============================================================================

ORCH_DB_HOST="${ORCH_DB_HOST:-localhost}"
ORCH_DB_PORT="${ORCH_DB_PORT:-5432}"
ORCH_DB_NAME="${ORCH_DB_NAME:-orchestration}"
ORCH_DB_USER="${ORCH_DB_USER:-postgres}"
ORCH_DB_ENABLED="${ORCH_DB_ENABLED:-true}"

# ADR-001: Database-only mode is MANDATORY
ORCH_DB_ONLY_MODE="true"

# =============================================================================
# VALID STATE TRANSITIONS (State Machine)
# =============================================================================

declare -A VALID_TRANSITIONS=(
    ["UNKNOWN"]="INITIALIZING FAILED"
    ["INITIALIZING"]="DEPLOYING FAILED CLEANUP"
    ["DEPLOYING"]="CONFIGURING FAILED ROLLING_BACK"
    ["CONFIGURING"]="VERIFYING FAILED ROLLING_BACK"
    ["VERIFYING"]="COMPLETE FAILED ROLLING_BACK"
    ["COMPLETE"]="INITIALIZING CLEANUP FAILED"
    ["FAILED"]="INITIALIZING CLEANUP ROLLING_BACK"
    ["ROLLING_BACK"]="FAILED CLEANUP UNKNOWN"
    ["CLEANUP"]="UNKNOWN INITIALIZING"
)

# Only declare if not already set (avoid conflict with orchestration-state-db.sh)
[ -z "${VALID_STATES:-}" ] && readonly VALID_STATES="UNKNOWN INITIALIZING DEPLOYING CONFIGURING VERIFYING COMPLETE FAILED ROLLING_BACK CLEANUP"

# =============================================================================
# DATABASE CONNECTION
# =============================================================================

##
# Check if database connection is available
##
orch_db_check_connection() {
    [ "$ORCH_DB_ENABLED" != "true" ] && return 1
    docker exec dive-hub-postgres psql -U postgres -d orchestration -c "SELECT 1" >/dev/null 2>&1
}

##
# Execute SQL query against orchestration database
##
orch_db_exec() {
    local query="$1"
    orch_db_check_connection || return 1
    docker exec dive-hub-postgres psql -U postgres -d orchestration -t -c "$query" 2>/dev/null || return 1
}

# =============================================================================
# STATE MACHINE VALIDATION
# =============================================================================

##
# Validate a state transition is allowed
#
# Arguments:
#   $1 - Current state
#   $2 - Target state
#
# Returns:
#   0 - Transition valid
#   1 - Transition invalid
##
orch_validate_state_transition() {
    local current_state="$1"
    local target_state="$2"

    # State machine defined inline (bash arrays don't export)
    local valid_targets=""
    case "$current_state" in
        UNKNOWN)      valid_targets="INITIALIZING FAILED" ;;
        INITIALIZING) valid_targets="DEPLOYING FAILED CLEANUP" ;;
        DEPLOYING)    valid_targets="CONFIGURING FAILED ROLLING_BACK" ;;
        CONFIGURING)  valid_targets="VERIFYING FAILED ROLLING_BACK" ;;
        VERIFYING)    valid_targets="COMPLETE FAILED ROLLING_BACK" ;;
        COMPLETE)     valid_targets="INITIALIZING CLEANUP FAILED" ;;
        FAILED)       valid_targets="INITIALIZING CLEANUP ROLLING_BACK" ;;
        ROLLING_BACK) valid_targets="FAILED CLEANUP UNKNOWN" ;;
        CLEANUP)      valid_targets="UNKNOWN INITIALIZING" ;;
        *)
            log_error "Unknown current state: $current_state"
            return 1
            ;;
    esac

    if [[ " $valid_targets " =~ " $target_state " ]]; then
        log_verbose "Valid transition: $current_state -> $target_state"
        return 0
    else
        log_error "Invalid transition: $current_state -> $target_state"
        log_error "Valid targets from $current_state: $valid_targets"
        return 1
    fi
}

# =============================================================================
# STATE OPERATIONS
# =============================================================================

##
# Get current deployment state
#
# Arguments:
#   $1 - Instance code
##
orch_db_get_state() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    if ! orch_db_check_connection; then
        echo "UNKNOWN"
        return 1
    fi

    local state=$(orch_db_exec "
        SELECT state FROM deployment_states
        WHERE instance_code='$code_lower'
        ORDER BY timestamp DESC LIMIT 1
    " 2>/dev/null | xargs)

    echo "${state:-UNKNOWN}"
}

##
# Set deployment state with validation
#
# Arguments:
#   $1 - Instance code
#   $2 - New state
#   $3 - Reason (optional)
##
orch_db_set_state() {
    local instance_code="$1"
    local new_state="$2"
    local reason="${3:-State update}"
    local code_lower=$(lower "$instance_code")

    if ! orch_db_check_connection; then
        log_error "FATAL: Database not available - cannot update state"
        return 1
    fi

    # Get current state
    local current_state=$(orch_db_get_state "$instance_code")

    # Validate transition
    if ! orch_validate_state_transition "$current_state" "$new_state"; then
        log_error "State transition blocked: $current_state -> $new_state"
        return 1
    fi

    # Insert new state
    orch_db_exec "
        INSERT INTO deployment_states (instance_code, state, previous_state, reason)
        VALUES ('$code_lower', '$new_state', '$current_state', '$reason')
    " >/dev/null 2>&1

    # Log transition
    orch_db_exec "
        INSERT INTO state_transitions (instance_code, from_state, to_state, initiated_by)
        VALUES ('$code_lower', '$current_state', '$new_state', '${USER:-unknown}')
    " >/dev/null 2>&1

    log_verbose "State transition: $current_state -> $new_state ($reason)"
    return 0
}

##
# Get state history
#
# Arguments:
#   $1 - Instance code
#   $2 - Limit (default: 10)
##
orch_db_get_state_history() {
    local instance_code="$1"
    local limit="${2:-10}"
    local code_lower=$(lower "$instance_code")

    orch_db_exec "
        SELECT timestamp, state, previous_state, reason
        FROM deployment_states
        WHERE instance_code='$code_lower'
        ORDER BY timestamp DESC
        LIMIT $limit
    " 2>/dev/null
}

# =============================================================================
# CHECKPOINT OPERATIONS
# =============================================================================

##
# Create a deployment checkpoint
#
# Arguments:
#   $1 - Instance code
#   $2 - Checkpoint name
#   $3 - Metadata (optional JSON)
##
orch_db_create_checkpoint() {
    local instance_code="$1"
    local checkpoint_name="$2"
    local metadata="${3:-{}}"
    local code_lower=$(lower "$instance_code")

    if ! orch_db_check_connection; then
        log_error "Database not available - cannot create checkpoint"
        return 1
    fi

    local current_state=$(orch_db_get_state "$instance_code")

    orch_db_exec "
        INSERT INTO checkpoints (instance_code, checkpoint_name, state_at_checkpoint, metadata)
        VALUES ('$code_lower', '$checkpoint_name', '$current_state', '$metadata'::jsonb)
    " >/dev/null 2>&1

    log_success "Checkpoint created: $checkpoint_name (state: $current_state)"
    return 0
}

##
# List checkpoints for an instance
#
# Arguments:
#   $1 - Instance code
##
orch_db_list_checkpoints() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    orch_db_exec "
        SELECT id, checkpoint_name, state_at_checkpoint, created_at
        FROM checkpoints
        WHERE instance_code='$code_lower'
        ORDER BY created_at DESC
    " 2>/dev/null
}

##
# Restore from checkpoint
#
# Arguments:
#   $1 - Instance code
#   $2 - Checkpoint name or ID
##
orch_db_restore_checkpoint() {
    local instance_code="$1"
    local checkpoint_ref="$2"
    local code_lower=$(lower "$instance_code")

    local checkpoint_state
    if [[ "$checkpoint_ref" =~ ^[0-9]+$ ]]; then
        checkpoint_state=$(orch_db_exec "
            SELECT state_at_checkpoint FROM checkpoints
            WHERE id=$checkpoint_ref AND instance_code='$code_lower'
        " 2>/dev/null | xargs)
    else
        checkpoint_state=$(orch_db_exec "
            SELECT state_at_checkpoint FROM checkpoints
            WHERE checkpoint_name='$checkpoint_ref' AND instance_code='$code_lower'
            ORDER BY created_at DESC LIMIT 1
        " 2>/dev/null | xargs)
    fi

    if [ -z "$checkpoint_state" ]; then
        log_error "Checkpoint not found: $checkpoint_ref"
        return 1
    fi

    # Force state update (bypass validation for restore)
    orch_db_exec "
        INSERT INTO deployment_states (instance_code, state, reason)
        VALUES ('$code_lower', '$checkpoint_state', 'Restored from checkpoint: $checkpoint_ref')
    " >/dev/null 2>&1

    log_success "Restored to checkpoint: $checkpoint_ref (state: $checkpoint_state)"
    return 0
}

##
# Cleanup old checkpoints
#
# Arguments:
#   $1 - Instance code
#   $2 - Keep count (default: 5)
##
orch_db_cleanup_checkpoints() {
    local instance_code="$1"
    local keep_count="${2:-5}"
    local code_lower=$(lower "$instance_code")

    local deleted=$(orch_db_exec "
        DELETE FROM checkpoints
        WHERE instance_code='$code_lower'
        AND id NOT IN (
            SELECT id FROM checkpoints
            WHERE instance_code='$code_lower'
            ORDER BY created_at DESC
            LIMIT $keep_count
        )
        RETURNING id
    " 2>/dev/null | wc -l | xargs)

    log_verbose "Cleaned up $deleted old checkpoints"
    return 0
}

# =============================================================================
# STATE RECOVERY
# =============================================================================

##
# Infer state from running containers
#
# Arguments:
#   $1 - Instance code
##
orch_infer_state_from_containers() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    # Check container status
    local running_containers=$(docker ps --filter "name=dive-spoke-${code_lower}" --format '{{.Names}}' 2>/dev/null | wc -l)
    local healthy_containers=$(docker ps --filter "name=dive-spoke-${code_lower}" --filter "health=healthy" --format '{{.Names}}' 2>/dev/null | wc -l)

    if [ "$running_containers" -eq 0 ]; then
        echo "UNKNOWN"
    elif [ "$healthy_containers" -ge 5 ]; then
        echo "COMPLETE"
    elif [ "$running_containers" -gt 0 ]; then
        echo "DEPLOYING"
    else
        echo "FAILED"
    fi
}

##
# Recover state from container status
#
# Arguments:
#   $1 - Instance code
#   $2 - Mode: "infer" or "force"
##
orch_state_recover() {
    local instance_code="$1"
    local mode="${2:-infer}"

    local inferred_state=$(orch_infer_state_from_containers "$instance_code")

    log_info "Inferred state for $instance_code: $inferred_state"

    if [ "$mode" = "force" ]; then
        orch_db_exec "
            INSERT INTO deployment_states (instance_code, state, reason)
            VALUES ('$(lower "$instance_code")', '$inferred_state', 'Recovered via container inference')
        " >/dev/null 2>&1
        log_success "State forcefully set to: $inferred_state"
    fi

    return 0
}

# =============================================================================
# VALIDATION
# =============================================================================

##
# Validate state consistency
#
# Arguments:
#   $1 - Instance code (optional, validates all if not provided)
##
orch_db_validate_state() {
    local instance_code="$1"

    if ! orch_db_check_connection; then
        log_error "Database not available for validation"
        return 1
    fi

    log_step "Validating orchestration state..."

    local issues=0

    # Check for orphaned states
    local orphaned=$(orch_db_exec "
        SELECT COUNT(*) FROM deployment_states ds
        WHERE NOT EXISTS (
            SELECT 1 FROM state_transitions st
            WHERE st.instance_code = ds.instance_code
            AND st.to_state = ds.state
        )
        AND ds.state != 'UNKNOWN'
    " 2>/dev/null | xargs)

    if [ "${orphaned:-0}" -gt 0 ]; then
        log_warn "Found $orphaned orphaned state records"
        ((issues++))
    fi

    # Check for stuck deployments (>30 min in transitional state)
    local stuck=$(orch_db_exec "
        SELECT COUNT(*) FROM deployment_states
        WHERE state IN ('INITIALIZING', 'DEPLOYING', 'CONFIGURING', 'VERIFYING')
        AND timestamp < NOW() - INTERVAL '30 minutes'
    " 2>/dev/null | xargs)

    if [ "${stuck:-0}" -gt 0 ]; then
        log_warn "Found $stuck potentially stuck deployments"
        ((issues++))
    fi

    if [ $issues -eq 0 ]; then
        log_success "State validation passed"
        return 0
    else
        log_warn "State validation found $issues issues"
        return 1
    fi
}

# =============================================================================
# CLI MODULE INTERFACE
# =============================================================================

##
# Orchestration database CLI module
##
module_orch_db() {
    local action="${1:-status}"
    shift || true

    case "$action" in
        migrate)
            log_info "Database migration not required (schema created by Hub)"
            ;;
        validate)
            orch_db_validate_state "$@"
            ;;
        status)
            if orch_db_check_connection; then
                echo "Database: Connected"
                echo "Mode: Database-only (SSOT)"
                echo ""
                echo "Recent states:"
                orch_db_exec "
                    SELECT instance_code, state, timestamp
                    FROM deployment_states
                    ORDER BY timestamp DESC
                    LIMIT 10
                " 2>/dev/null
            else
                echo "Database: Disconnected"
                echo "Start Hub first: ./dive hub deploy"
            fi
            ;;
        get)
            local instance="$1"
            [ -z "$instance" ] && { log_error "Instance code required"; return 1; }
            orch_db_get_state "$instance"
            ;;
        set)
            local instance="$1"
            local state="$2"
            local reason="${3:-Manual state update}"
            [ -z "$instance" ] || [ -z "$state" ] && { log_error "Instance and state required"; return 1; }
            orch_db_set_state "$instance" "$state" "$reason"
            ;;
        history)
            local instance="$1"
            [ -z "$instance" ] && { log_error "Instance code required"; return 1; }
            orch_db_get_state_history "$instance"
            ;;
        checkpoint)
            local sub_action="$1"
            shift || true
            case "$sub_action" in
                create)
                    orch_db_create_checkpoint "$@"
                    ;;
                list)
                    orch_db_list_checkpoints "$@"
                    ;;
                restore)
                    orch_db_restore_checkpoint "$@"
                    ;;
                cleanup)
                    orch_db_cleanup_checkpoints "$@"
                    ;;
                *)
                    echo "Usage: ./dive orch-db checkpoint <create|list|restore|cleanup> [args]"
                    ;;
            esac
            ;;
        recover)
            orch_state_recover "$@"
            ;;
        *)
            echo "Usage: ./dive orch-db <migrate|validate|status|get|set|history|checkpoint|recover>"
            ;;
    esac
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f orch_db_check_connection
export -f orch_db_exec
export -f orch_validate_state_transition
export -f orch_db_get_state
export -f orch_db_set_state
export -f orch_db_get_state_history
export -f orch_db_create_checkpoint
export -f orch_db_list_checkpoints
export -f orch_db_restore_checkpoint
export -f orch_db_cleanup_checkpoints
export -f orch_infer_state_from_containers
export -f orch_state_recover
export -f orch_db_validate_state
export -f module_orch_db

log_verbose "Orchestration state module loaded (consolidated, database-only)"
