#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Orchestration State Recovery Module
# =============================================================================
# Implements state consistency validation, auto-reconciliation, and recovery
# Part of Phase 3 Orchestration Architecture Review (2026-01-15)
# =============================================================================
# Features:
# - State consistency validation (file vs database)
# - Automatic reconciliation based on SSOT
# - Multi-strategy state recovery (infer, restore-db, restore-file)
# - Garbage collection (90-day retention)
# - Schema migration framework
# =============================================================================

# Prevent multiple sourcing
if [ -n "${ORCHESTRATION_STATE_RECOVERY_LOADED:-}" ]; then
    return 0
fi
export ORCHESTRATION_STATE_RECOVERY_LOADED=1

# Ensure common functions are loaded
if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load state database functions
if [ -f "$(dirname "${BASH_SOURCE[0]}")/orchestration-state-db.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/orchestration-state-db.sh"
fi

# Load deployment state functions (file-based)
if [ -f "$(dirname "${BASH_SOURCE[0]}")/deployment-state.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/deployment-state.sh"
fi

# =============================================================================
# STATE CONSISTENCY VALIDATION
# =============================================================================

##
# Validate that file state matches database state
# Auto-reconciles if divergent (based on ORCH_DB_SOURCE_OF_TRUTH)
#
# Arguments:
#   $1 - Instance code
#   $2 - Auto-fix (default: true) - Auto-reconcile if divergent
#
# Returns:
#   0 - States consistent
#   1 - States divergent (fixed if auto_fix=true)
#   2 - Validation failed (DB unavailable)
##
orch_state_validate_consistency() {
    local instance_code="$1"
    local auto_fix="${2:-true}"
    local code_lower=$(lower "$instance_code")

    log_verbose "Validating state consistency for $instance_code..."

    # Check database connection
    if ! orch_db_check_connection; then
        log_verbose "Database unavailable - cannot validate consistency"
        return 2
    fi

    # Get state from both sources
    local db_state=$(orch_db_exec "SELECT state FROM deployment_states WHERE instance_code='$code_lower' ORDER BY timestamp DESC LIMIT 1" 2>/dev/null | xargs)
    local file_state=""

    if [ -f "${DIVE_ROOT}/.dive-state/${code_lower}.state" ]; then
        file_state=$(grep "^state=" "${DIVE_ROOT}/.dive-state/${code_lower}.state" 2>/dev/null | cut -d= -f2)
    fi

    # Handle missing states (fresh instance)
    if [ -z "$db_state" ] && [ -z "$file_state" ]; then
        log_verbose "No state exists for $instance_code (fresh instance)"
        return 0
    fi

    # Handle partial states
    if [ -z "$db_state" ]; then
        log_warn "Database state missing for $instance_code (file: $file_state)"

        # Log divergence
        orch_db_exec "INSERT INTO state_consistency_log (instance_code, file_state, db_state, consistent, action_taken) VALUES ('$code_lower', '$file_state', NULL, FALSE, 'restore_to_db')" >/dev/null 2>&1 || true

        if [ "$auto_fix" = "true" ]; then
            orch_state_restore_to_db "$instance_code" "$file_state"
            return 1
        fi
        return 1
    fi

    if [ -z "$file_state" ]; then
        log_warn "File state missing for $instance_code (DB: $db_state)"

        # Log divergence
        orch_db_exec "INSERT INTO state_consistency_log (instance_code, file_state, db_state, consistent, action_taken) VALUES ('$code_lower', NULL, '$db_state', FALSE, 'restore_to_file')" >/dev/null 2>&1 || true

        if [ "$auto_fix" = "true" ]; then
            orch_state_restore_to_file "$instance_code" "$db_state"
            return 1
        fi
        return 1
    fi

    # Compare states
    if [ "$db_state" = "$file_state" ]; then
        log_verbose "✓ State consistent for $instance_code: $db_state"

        # Log successful validation
        orch_db_exec "INSERT INTO state_consistency_log (instance_code, file_state, db_state, consistent) VALUES ('$code_lower', '$file_state', '$db_state', TRUE)" >/dev/null 2>&1 || true

        return 0
    else
        log_warn "❌ State divergence detected for $instance_code"
        log_warn "  Database (SSOT): $db_state"
        log_warn "  File:            $file_state"

        # Log divergence
        orch_db_exec "INSERT INTO state_consistency_log (instance_code, file_state, db_state, consistent, action_taken) VALUES ('$code_lower', '$file_state', '$db_state', FALSE, 'reconcile')" >/dev/null 2>&1 || true

        if [ "$auto_fix" = "true" ]; then
            orch_state_reconcile "$instance_code" "$db_state"
            log_success "✓ State reconciled: $instance_code → $db_state"
            return 1  # Was inconsistent, now fixed
        fi

        return 1
    fi
}

# =============================================================================
# STATE RECONCILIATION
# =============================================================================

##
# Reconcile divergent state based on SSOT configuration
#
# Arguments:
#   $1 - Instance code
#   $2 - Authoritative state (optional, defaults to SSOT)
#
# Returns:
#   0 - Reconciliation successful
#   1 - Reconciliation failed
##
orch_state_reconcile() {
    local instance_code="$1"
    local authoritative_state="${2:-}"
    local code_lower=$(lower "$instance_code")

    # Determine authoritative state
    if [ -z "$authoritative_state" ]; then
        if [ "$ORCH_DB_SOURCE_OF_TRUTH" = "db" ]; then
            authoritative_state=$(orch_db_exec "SELECT state FROM deployment_states WHERE instance_code='$code_lower' ORDER BY timestamp DESC LIMIT 1" 2>/dev/null | xargs)
        else
            authoritative_state=$(grep "^state=" "${DIVE_ROOT}/.dive-state/${code_lower}.state" 2>/dev/null | cut -d= -f2)
        fi
    fi

    if [ -z "$authoritative_state" ]; then
        log_error "Cannot determine authoritative state for $instance_code"
        return 1
    fi

    log_info "Reconciling state for $instance_code to: $authoritative_state"

    # Update both sources to match authoritative state
    if [ "$ORCH_DB_SOURCE_OF_TRUTH" = "db" ]; then
        # Database is SSOT → Update file from DB
        orch_state_restore_to_file "$instance_code" "$authoritative_state"
    else
        # File is SSOT → Update DB from file
        orch_state_restore_to_db "$instance_code" "$authoritative_state"
    fi

    # Validate reconciliation succeeded
    if orch_state_validate_consistency "$instance_code" "false"; then
        log_success "✓ State reconciled successfully: $instance_code → $authoritative_state"

        # Record reconciliation event
        orch_db_exec "INSERT INTO state_transitions (instance_code, from_state, to_state, metadata, initiated_by) VALUES ('$code_lower', 'DIVERGED', '$authoritative_state', '{\"action\":\"reconciliation\"}'::jsonb, 'system')" >/dev/null 2>&1 || true

        # Update consistency log
        orch_db_exec "UPDATE state_consistency_log SET auto_fixed=TRUE WHERE instance_code='$code_lower' AND consistent=FALSE AND action_taken='reconcile' ORDER BY check_timestamp DESC LIMIT 1" >/dev/null 2>&1 || true

        return 0
    else
        log_error "✗ State reconciliation failed for $instance_code"
        return 1
    fi
}

# =============================================================================
# STATE RESTORATION (Database ↔ File)
# =============================================================================

##
# Restore file state from database
#
# Arguments:
#   $1 - Instance code
#   $2 - State to restore (optional, queries DB if not provided)
#
# Returns:
#   0 - Restoration successful
#   1 - Restoration failed
##
orch_state_restore_to_file() {
    local instance_code="$1"
    local db_state="${2:-}"
    local code_lower=$(lower "$instance_code")

    # Query database if state not provided
    if [ -z "$db_state" ]; then
        db_state=$(orch_db_exec "SELECT state FROM deployment_states WHERE instance_code='$code_lower' ORDER BY timestamp DESC LIMIT 1" 2>/dev/null | xargs)
    fi

    if [ -z "$db_state" ]; then
        log_error "No database state found for $instance_code"
        return 1
    fi

    log_info "Restoring file state from database: $db_state"

    # Create state directory if needed
    mkdir -p "${DIVE_ROOT}/.dive-state"

    # Write state file
    cat > "${DIVE_ROOT}/.dive-state/${code_lower}.state" << STATE_EOF
state=$db_state
timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
version=2.0
metadata={"recovered":true,"source":"database"}
checksum=$(echo -n "$db_state$(date +%s)" | shasum -a 256 | cut -d' ' -f1)
STATE_EOF

    if [ $? -eq 0 ]; then
        log_success "✓ State restored to file from database: $instance_code → $db_state"
        return 0
    else
        log_error "✗ Failed to write state file for $instance_code"
        return 1
    fi
}

##
# Restore database state from file
#
# Arguments:
#   $1 - Instance code
#   $2 - File state (optional, reads from file if not provided)
#
# Returns:
#   0 - Restoration successful
#   1 - Restoration failed
##
orch_state_restore_to_db() {
    local instance_code="$1"
    local file_state="${2:-}"
    local code_lower=$(lower "$instance_code")

    # Read from file if not provided
    if [ -z "$file_state" ]; then
        if [ -f "${DIVE_ROOT}/.dive-state/${code_lower}.state" ]; then
            file_state=$(grep "^state=" "${DIVE_ROOT}/.dive-state/${code_lower}.state" 2>/dev/null | cut -d= -f2)
        fi
    fi

    if [ -z "$file_state" ]; then
        log_error "No file state found for $instance_code"
        return 1
    fi

    log_info "Restoring database state from file: $file_state"

    # Insert into database
    local sql="INSERT INTO deployment_states (instance_code, state, reason, metadata, created_by) VALUES ('$code_lower', '$file_state', 'Recovered from file', '{\"recovered\":true,\"source\":\"file\"}'::jsonb, 'recovery')"

    if orch_db_exec "$sql" >/dev/null 2>&1; then
        log_success "✓ State restored to database from file: $instance_code → $file_state"
        return 0
    else
        log_error "✗ Failed to restore state to database for $instance_code"
        return 1
    fi
}

# =============================================================================
# STATE RECOVERY (Multi-Strategy)
# =============================================================================

##
# Recover state from corruption or inconsistency
# Supports multiple recovery strategies
#
# Arguments:
#   $1 - Instance code
#   $2 - Recovery mode: auto, infer, restore-db, restore-file (default: auto)
#
# Returns:
#   0 - Recovery successful
#   1 - Recovery failed (manual intervention required)
##
orch_state_recover() {
    local instance_code="$1"
    local recovery_mode="${2:-auto}"
    local code_lower=$(lower "$instance_code")

    log_info "Initiating state recovery for $instance_code (mode: $recovery_mode)"

    case "$recovery_mode" in
        "infer")
            # Strategy: Infer state from running containers
            orch_state_infer_from_containers "$instance_code"
            ;;

        "restore-db")
            # Strategy: Restore file from database
            orch_state_restore_from_db "$instance_code"
            ;;

        "restore-file")
            # Strategy: Restore database from file
            orch_state_restore_to_db "$instance_code"
            ;;

        "auto")
            # Strategy: Automatic recovery (intelligent decision)
            log_info "Using automatic recovery strategy..."

            # Check database availability
            if orch_db_check_connection; then
                # Database available - check both sources
                local db_state=$(orch_db_exec "SELECT state FROM deployment_states WHERE instance_code='$code_lower' ORDER BY timestamp DESC LIMIT 1" 2>/dev/null | xargs)
                local file_state=""

                if [ -f "${DIVE_ROOT}/.dive-state/${code_lower}.state" ]; then
                    file_state=$(grep "^state=" "${DIVE_ROOT}/.dive-state/${code_lower}.state" 2>/dev/null | cut -d= -f2)
                fi

                # Decision tree
                if [ -n "$db_state" ] && [ -z "$file_state" ]; then
                    # DB has state, file missing → Restore from DB
                    log_info "Decision: Restore file from database"
                    orch_state_restore_from_db "$instance_code"

                elif [ -z "$db_state" ] && [ -n "$file_state" ]; then
                    # File has state, DB missing → Restore to DB
                    log_info "Decision: Restore database from file"
                    orch_state_restore_to_db "$instance_code" "$file_state"

                elif [ -z "$db_state" ] && [ -z "$file_state" ]; then
                    # Both missing → Infer from containers
                    log_info "Decision: Infer state from running containers"
                    orch_state_infer_from_containers "$instance_code"

                else
                    # Both exist but divergent → Use SSOT
                    log_info "Decision: Reconcile based on SSOT ($ORCH_DB_SOURCE_OF_TRUTH)"
                    if [ "$ORCH_DB_SOURCE_OF_TRUTH" = "db" ]; then
                        orch_state_reconcile "$instance_code" "$db_state"
                    else
                        orch_state_reconcile "$instance_code" "$file_state"
                    fi
                fi
            else
                # Database unavailable - file-only mode
                log_warn "Database unavailable, operating in file-only mode"

                if [ ! -f "${DIVE_ROOT}/.dive-state/${code_lower}.state" ]; then
                    log_info "No file state found, inferring from containers"
                    orch_state_infer_from_containers "$instance_code"
                else
                    log_info "File state exists, no recovery needed"
                    return 0
                fi
            fi
            ;;

        *)
            log_error "Invalid recovery mode: $recovery_mode"
            log_error "Valid modes: auto, infer, restore-db, restore-file"
            return 1
            ;;
    esac

    # Final validation
    if orch_state_validate_consistency "$instance_code" "false"; then
        log_success "✓ State recovery successful: $instance_code"

        # Record successful recovery
        orch_db_exec "INSERT INTO orchestration_metrics (instance_code, metric_name, metric_value, labels) VALUES ('$code_lower', 'state_recovery_success', 1, '{\"mode\":\"$recovery_mode\"}'::jsonb)" >/dev/null 2>&1 || true

        return 0
    else
        log_error "✗ State recovery failed for $instance_code"
        log_error ""
        log_error "Manual intervention required:"
        log_error "  1. Check database state:"
        log_error "     docker exec dive-hub-postgres psql -U postgres -d orchestration -c \"SELECT * FROM deployment_states WHERE instance_code='$code_lower' ORDER BY timestamp DESC LIMIT 5\""
        log_error ""
        log_error "  2. Check file state:"
        log_error "     cat .dive-state/${code_lower}.state"
        log_error ""
        log_error "  3. Check running containers:"
        log_error "     docker ps --filter 'name=dive-spoke-${code_lower}'"
        log_error ""
        log_error "  4. Manually set correct state:"
        log_error "     ./dive orch-db set-state $instance_code COMPLETE"
        log_error ""

        # Record failed recovery
        orch_db_exec "INSERT INTO orchestration_metrics (instance_code, metric_name, metric_value, labels) VALUES ('$code_lower', 'state_recovery_failure', 1, '{\"mode\":\"$recovery_mode\"}'::jsonb)" >/dev/null 2>&1 || true

        return 1
    fi
}

# =============================================================================
# STATE INFERENCE FROM CONTAINERS
# =============================================================================

##
# Infer deployment state from running container status
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - State inferred and set successfully
#   1 - Inference failed
##
orch_state_infer_from_containers() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    log_info "Inferring state from container status for $instance_code..."

    # Count containers
    local container_count=$(docker ps -a -q --filter "name=dive-spoke-${code_lower}" 2>/dev/null | wc -l | xargs)
    local running_count=$(docker ps -q --filter "name=dive-spoke-${code_lower}" 2>/dev/null | wc -l | xargs)
    local healthy_count=$(docker ps --filter "name=dive-spoke-${code_lower}" --filter "health=healthy" -q 2>/dev/null | wc -l | xargs)

    log_verbose "Container analysis: Total=$container_count, Running=$running_count, Healthy=$healthy_count"

    # Expected service count for a complete spoke (adjust if needed)
    local expected_services=9  # keycloak, backend, frontend, kas, postgres, mongo, redis, opa, opal-client

    # Infer state based on container status
    local inferred_state="UNKNOWN"
    local reason=""

    if [ "$container_count" -eq 0 ]; then
        inferred_state="UNKNOWN"
        reason="No containers found - clean slate"

    elif [ "$healthy_count" -eq "$expected_services" ]; then
        inferred_state="COMPLETE"
        reason="All $expected_services services healthy"

    elif [ "$healthy_count" -ge $(( expected_services / 2 )) ]; then
        inferred_state="DEPLOYING"
        reason="Partial deployment - $healthy_count/$expected_services services healthy"

    elif [ "$running_count" -gt 0 ] && [ "$healthy_count" -eq 0 ]; then
        inferred_state="FAILED"
        reason="Containers running but none healthy"

    else
        inferred_state="DEPLOYING"
        reason="Some services present - $healthy_count/$expected_services healthy"
    fi

    log_info "Inferred state: $inferred_state ($reason)"

    # Set state in both file and database
    if type orch_db_set_state &>/dev/null; then
        orch_db_set_state "$instance_code" "$inferred_state" "$reason" "{\"inferred\":true,\"container_count\":$container_count,\"healthy_count\":$healthy_count}"
    elif type set_deployment_state_enhanced &>/dev/null; then
        set_deployment_state_enhanced "$instance_code" "$inferred_state" "$reason" "{\"inferred\":true}"
    else
        log_error "No state setting function available"
        return 1
    fi

    log_success "✓ State inferred and set: $instance_code → $inferred_state"
    return 0
}

# =============================================================================
# STATE RESTORATION HELPERS
# =============================================================================

##
# Restore file state from database (wrapper for orch_state_restore_to_file)
# Queries database to get latest state
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Restoration successful
#   1 - Restoration failed
##
orch_state_restore_from_db() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    log_info "Restoring state from database for $instance_code..."

    # Query latest state
    local db_state=$(orch_db_exec "SELECT state FROM deployment_states WHERE instance_code='$code_lower' ORDER BY timestamp DESC LIMIT 1" 2>/dev/null | xargs)

    if [ -z "$db_state" ]; then
        log_error "No database state found for $instance_code"
        return 1
    fi

    orch_state_restore_to_file "$instance_code" "$db_state"
}

# =============================================================================
# STATE GARBAGE COLLECTION
# =============================================================================

##
# Archive old states and cleanup orphaned files
#
# Arguments:
#   $1 - Retention days (default: 90)
#
# Returns:
#   0 - Cleanup successful
#   1 - Cleanup failed
##
orch_state_cleanup_old() {
    local retention_days="${1:-90}"

    log_info "Starting state garbage collection (retention: $retention_days days)..."

    local archived_db=0
    local archived_files=0
    local orphaned_markers=0
    local orphaned_federation=0

    # 1. Archive old database states
    if orch_db_check_connection; then
        log_step "Archiving database states older than $retention_days days..."

        # Create archive table if doesn't exist
        orch_db_exec "CREATE TABLE IF NOT EXISTS deployment_states_archive (LIKE deployment_states INCLUDING ALL);" >/dev/null 2>&1

        # Move old records to archive
        archived_db=$(orch_db_exec "
        WITH archived AS (
            DELETE FROM deployment_states
            WHERE timestamp < NOW() - INTERVAL '$retention_days days'
            RETURNING *
        ),
        inserted AS (
            INSERT INTO deployment_states_archive SELECT * FROM archived RETURNING 1
        )
        SELECT COUNT(*) FROM inserted;
        " 2>/dev/null | xargs || echo "0")

        log_success "✓ Archived $archived_db old database state records"
    fi

    # 2. Remove orphaned cleanup marker files
    log_step "Removing orphaned cleanup marker files..."

    for marker in "${DIVE_ROOT}"/.dive-state/*.cleanup_scheduled; do
        if [ -f "$marker" ]; then
            # Check age (macOS vs Linux stat compatibility)
            local age_days=0
            if stat -f %m "$marker" >/dev/null 2>&1; then
                # macOS
                local file_mtime=$(stat -f %m "$marker")
                local now=$(date +%s)
                age_days=$(( ($now - $file_mtime) / 86400 ))
            elif stat -c %Y "$marker" >/dev/null 2>&1; then
                # Linux
                local file_mtime=$(stat -c %Y "$marker")
                local now=$(date +%s)
                age_days=$(( ($now - $file_mtime) / 86400 ))
            fi

            # Remove if older than 7 days (aggressive cleanup for markers)
            if [ "$age_days" -ge 7 ]; then
                log_verbose "Removing orphaned marker: $(basename "$marker") (age: $age_days days)"
                rm -f "$marker"
                ((orphaned_markers++))
            fi
        fi
    done

    log_success "✓ Removed $orphaned_markers orphaned cleanup markers"

    # 3. Archive old state files
    log_step "Archiving old state files..."

    mkdir -p "${DIVE_ROOT}/.dive-state/archive"

    for state_file in "${DIVE_ROOT}"/.dive-state/*.state; do
        if [ ! -f "$state_file" ]; then continue; fi
        if [ "$(basename "$state_file")" = ".state" ]; then continue; fi  # Skip system .state file

        # Extract timestamp
        local timestamp=$(grep "^timestamp=" "$state_file" 2>/dev/null | cut -d= -f2)
        if [ -z "$timestamp" ]; then continue; fi

        # Calculate age (date parsing - macOS vs Linux compatible)
        local file_epoch=0
        if date -j -f "%Y-%m-%dT%H:%M:%SZ" "$timestamp" +%s >/dev/null 2>&1; then
            # macOS
            file_epoch=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$timestamp" +%s 2>/dev/null)
        elif date -d "$timestamp" +%s >/dev/null 2>&1; then
            # Linux
            file_epoch=$(date -d "$timestamp" +%s 2>/dev/null)
        fi

        local now_epoch=$(date +%s)
        local age_days=$(( ($now_epoch - $file_epoch) / 86400 ))

        # Archive if older than retention policy
        if [ "$age_days" -ge "$retention_days" ]; then
            local basename=$(basename "$state_file")
            log_verbose "Archiving old state file: $basename (age: $age_days days)"

            # Compress and move to archive
            gzip -c "$state_file" > "${DIVE_ROOT}/.dive-state/archive/${basename}.gz" 2>/dev/null
            if [ $? -eq 0 ]; then
                rm -f "$state_file"
                ((archived_files++))
            fi
        fi
    done

    log_success "✓ Archived $archived_files old state files"

    # 4. Cleanup old federation state files
    log_step "Cleaning up old federation state files..."

    for fed_file in "${DIVE_ROOT}"/.dive-state/federation-*.json; do
        if [ ! -f "$fed_file" ]; then continue; fi

        # Check file age (fallback to modification time)
        local age_days=0
        if stat -f %m "$fed_file" >/dev/null 2>&1; then
            local file_mtime=$(stat -f %m "$fed_file")
            local now=$(date +%s)
            age_days=$(( ($now - $file_mtime) / 86400 ))
        elif stat -c %Y "$fed_file" >/dev/null 2>&1; then
            local file_mtime=$(stat -c %Y "$fed_file")
            local now=$(date +%s)
            age_days=$(( ($now - $file_mtime) / 86400 ))
        fi

        if [ "$age_days" -ge "$retention_days" ]; then
            log_verbose "Archiving old federation state: $(basename "$fed_file") (age: $age_days days)"
            gzip -c "$fed_file" > "${DIVE_ROOT}/.dive-state/archive/$(basename "$fed_file").gz" 2>/dev/null
            if [ $? -eq 0 ]; then
                rm -f "$fed_file"
                ((orphaned_federation++))
            fi
        fi
    done

    log_success "✓ Archived $orphaned_federation old federation state files"

    # 5. Summary report
    echo ""
    log_success "State Garbage Collection Complete"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Database records archived:  $archived_db"
    echo "  Orphaned markers removed:   $orphaned_markers"
    echo "  State files archived:       $archived_files"
    echo "  Federation files archived:  $orphaned_federation"
    echo "  Retention policy:           $retention_days days"
    echo "  Archive location:           .dive-state/archive/"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    return 0
}

# =============================================================================
# CHECKSUM VALIDATION
# =============================================================================

##
# Validate state file checksum (detect tampering/corruption)
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Checksum valid
#   1 - Checksum invalid (file corrupted)
##
orch_state_validate_checksum() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")
    local state_file="${DIVE_ROOT}/.dive-state/${code_lower}.state"

    if [ ! -f "$state_file" ]; then
        log_verbose "No state file to validate for $instance_code"
        return 0
    fi

    # Extract stored checksum
    local stored_checksum=$(grep "^checksum=" "$state_file" 2>/dev/null | cut -d= -f2)

    if [ -z "$stored_checksum" ]; then
        log_warn "No checksum found in state file (old format)"
        return 0  # Don't fail on old format files
    fi

    # Calculate current checksum (exclude checksum line itself)
    local current_checksum=$(grep -v "^checksum=" "$state_file" | shasum -a 256 | cut -d' ' -f1)

    if [ "$stored_checksum" = "$current_checksum" ]; then
        log_verbose "✓ Checksum valid for $instance_code"
        return 0
    else
        log_error "❌ Checksum mismatch for $instance_code (file may be corrupted or tampered)"
        log_error "  Stored:  $stored_checksum"
        log_error "  Current: $current_checksum"
        return 1
    fi
}

# =============================================================================
# CLI COMMANDS
# =============================================================================

##
# CLI command handler for state recovery operations
#
# Usage:
#   ./dive orch-state validate <CODE>
#   ./dive orch-state recover <CODE> [mode]
#   ./dive orch-state cleanup [retention_days]
##
orch_state_cli() {
    local command="$1"
    shift

    case "$command" in
        "validate")
            local instance_code="${1:?Instance code required}"
            orch_state_validate_consistency "$instance_code" "false"
            ;;

        "recover")
            local instance_code="${1:?Instance code required}"
            local mode="${2:-auto}"
            orch_state_recover "$instance_code" "$mode"
            ;;

        "cleanup")
            local retention="${1:-90}"
            orch_state_cleanup_old "$retention"
            ;;

        "reconcile")
            local instance_code="${1:?Instance code required}"
            orch_state_reconcile "$instance_code"
            ;;

        *)
            echo "Usage: ./dive orch-state <command> [args]"
            echo ""
            echo "Commands:"
            echo "  validate <CODE>           - Validate state consistency"
            echo "  recover <CODE> [mode]     - Recover corrupted state"
            echo "  reconcile <CODE>          - Force reconciliation"
            echo "  cleanup [retention_days]  - Garbage collection (default: 90 days)"
            echo ""
            echo "Recovery modes:"
            echo "  auto          - Automatic (default)"
            echo "  infer         - Infer from containers"
            echo "  restore-db    - Restore file from database"
            echo "  restore-file  - Restore database from file"
            echo ""
            return 1
            ;;
    esac
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

# Export functions for use by other modules
export -f orch_state_validate_consistency
export -f orch_state_reconcile
export -f orch_state_recover
export -f orch_state_infer_from_containers
export -f orch_state_restore_from_db
export -f orch_state_restore_to_file
export -f orch_state_restore_to_db
export -f orch_state_cleanup_old
export -f orch_state_validate_checksum
export -f orch_state_cli

log_verbose "State recovery module loaded (9 functions)"
