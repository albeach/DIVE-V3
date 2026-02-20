#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Orchestration Database CLI
# =============================================================================
# ADR-001: State Management Consolidation
#
# Commands:
#   migrate     - Migrate file-based state to PostgreSQL database
#   validate    - Validate consistency between file and database state
#   status      - Show current state for all or specific instances
#   rollback    - Rollback state to previous state
#   unlock      - Force release deployment locks
#   circuit-reset - Reset circuit breaker to CLOSED state
#   cleanup     - Remove orphaned state files (after migration)
# =============================================================================

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="${DIVE_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"

# Source dependencies
source "$DIVE_ROOT/scripts/dive-modules/common.sh" 2>/dev/null || {
    echo "ERROR: Cannot load common.sh"
    exit 1
}

source "$DIVE_ROOT/scripts/dive-modules/orchestration/state.sh" 2>/dev/null || {
    echo "ERROR: Cannot load orchestration/state.sh"
    exit 1
}

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

print_usage() {
    cat << 'EOF'
DIVE V3 Orchestration Database CLI

Usage: ./scripts/orch-db-cli.sh <command> [options]

Commands:
  migrate [--dry-run]          Migrate file-based state to database
  validate [instance]          Validate state consistency
  status [instance]            Show deployment state(s)
  rollback <instance> [reason] Rollback to previous state
  unlock <instance>            Force release deployment lock
  circuit-reset <operation>    Reset circuit breaker to CLOSED
  cleanup [--force]            Remove orphaned state files
  history <instance> [limit]   Show state transition history

Environment Variables:
  ORCH_DB_ONLY_MODE=true       Database-only mode (recommended)
  ORCH_DB_DUAL_WRITE=true      Legacy dual-write mode (deprecated)

Examples:
  # Migrate existing state files to database
  ./scripts/orch-db-cli.sh migrate

  # Dry-run migration (see what would be migrated)
  ./scripts/orch-db-cli.sh migrate --dry-run

  # Validate all instances
  ./scripts/orch-db-cli.sh validate

  # Check specific instance state
  ./scripts/orch-db-cli.sh status deu

  # Rollback failed deployment
  ./scripts/orch-db-cli.sh rollback deu "Deployment failed, reverting"

  # Force unlock stuck deployment
  ./scripts/orch-db-cli.sh unlock deu

  # Reset circuit breaker
  ./scripts/orch-db-cli.sh circuit-reset keycloak_health

  # Remove state files after migration
  ./scripts/orch-db-cli.sh cleanup --force
EOF
}

ensure_database() {
    if ! orch_db_check_connection; then
        log_error "Database not available. Ensure Hub is running:"
        log_error "  ./dive hub up"
        exit 1
    fi
}

# =============================================================================
# MIGRATE COMMAND
# =============================================================================

cmd_migrate() {
    local dry_run=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --dry-run)
                dry_run=true
                shift
                ;;
            *)
                log_error "Unknown option: $1"
                return 1
                ;;
        esac
    done

    ensure_database

    local state_dir="${DIVE_ROOT}/.dive-state"
    local migrated=0
    local skipped=0
    local errors=0

    log_info "=== State Migration: File → Database ==="
    log_info "Source: $state_dir"
    log_info "Mode: $([ "$dry_run" = true ] && echo "DRY-RUN" || echo "LIVE")"
    echo ""

    if [ ! -d "$state_dir" ]; then
        log_info "No .dive-state directory found. Nothing to migrate."
        return 0
    fi

    # Find all state files
    while IFS= read -r state_file; do
        [ -z "$state_file" ] && continue

        local instance_code
        instance_code=$(basename "$state_file" .state)

        # Skip invalid entries
        if [[ "$instance_code" =~ ^\. ]] || [ ${#instance_code} -gt 3 ]; then
            continue
        fi

        # Parse state file
        local state="" timestamp="" reason="" metadata=""
        while IFS='=' read -r key value; do
            case "$key" in
                state) state="$value" ;;
                timestamp) timestamp="$value" ;;
                reason) reason="$value" ;;
                metadata) metadata="$value" ;;
            esac
        done < "$state_file"

        if [ -z "$state" ]; then
            log_warn "Skipping invalid state file: $instance_code"
            ((errors++))
            continue
        fi

        # Check if already in database
        local db_state
        db_state=$(orch_db_exec "SELECT state FROM deployment_states WHERE instance_code='$instance_code' ORDER BY timestamp DESC LIMIT 1" 2>/dev/null | xargs)

        if [ -n "$db_state" ]; then
            if [ "$state" = "$db_state" ]; then
                log_verbose "✓ Already in sync: $instance_code ($state)"
                ((skipped++))
            else
                log_warn "⚠ State mismatch: $instance_code (file=$state, db=$db_state)"
                ((errors++))
            fi
            continue
        fi

        # Migrate to database
        if [ "$dry_run" = true ]; then
            log_info "[DRY-RUN] Would migrate: $instance_code → $state"
            ((migrated++))
        else
            if orch_db_set_state "$instance_code" "$state" "$reason" "$metadata" 2>/dev/null; then
                log_success "✓ Migrated: $instance_code → $state"
                ((migrated++))
            else
                log_error "✗ Failed to migrate: $instance_code"
                ((errors++))
            fi
        fi
    done < <(find "$state_dir" -name "*.state" -type f 2>/dev/null)

    echo ""
    log_info "=== Migration Summary ==="
    log_info "Migrated: $migrated"
    log_info "Skipped:  $skipped (already in database)"
    log_info "Errors:   $errors"

    if [ "$dry_run" = true ]; then
        echo ""
        log_info "This was a dry run. Run without --dry-run to perform migration."
    fi

    [ "$errors" -eq 0 ]
}

# =============================================================================
# VALIDATE COMMAND
# =============================================================================

cmd_validate() {
    local instance="${1:-}"

    ensure_database

    log_info "=== State Consistency Validation ==="
    echo ""

    local inconsistencies=0
    local checked=0

    # Get instances to check
    local instances
    if [ -n "$instance" ]; then
        instances="$instance"
    else
        # Combine from both sources
        local file_instances db_instances
        file_instances=$(find "${DIVE_ROOT}/.dive-state" -name "*.state" -type f -exec basename {} .state \; 2>/dev/null | grep -v '^\.' | sort | uniq || true)
        db_instances=$(orch_db_exec "SELECT DISTINCT instance_code FROM deployment_states" 2>/dev/null | sort | uniq || true)
        instances=$(echo -e "$file_instances\n$db_instances" | sort | uniq | grep -v '^$' || true)
    fi

    for inst in $instances; do
        ((checked++))

        # Get file state
        local file_state=""
        local state_file="${DIVE_ROOT}/.dive-state/${inst}.state"
        if [ -f "$state_file" ]; then
            file_state=$(grep '^state=' "$state_file" | cut -d'=' -f2)
        fi

        # Get database state
        local db_state
        db_state=$(orch_db_exec "SELECT state FROM deployment_states WHERE instance_code='$inst' ORDER BY timestamp DESC LIMIT 1" 2>/dev/null | xargs)

        # Compare
        if [ "$file_state" = "$db_state" ]; then
            log_success "✓ $inst: consistent ($db_state)"
        elif [ -z "$file_state" ] && [ -n "$db_state" ]; then
            log_info "  $inst: DB only ($db_state) - this is expected in DB-only mode"
        elif [ -n "$file_state" ] && [ -z "$db_state" ]; then
            log_warn "⚠ $inst: File only ($file_state) - needs migration"
            ((inconsistencies++))
        else
            log_error "✗ $inst: MISMATCH (file=$file_state, db=$db_state)"
            ((inconsistencies++))
        fi
    done

    echo ""
    log_info "Checked: $checked instances"

    if [ "$inconsistencies" -gt 0 ]; then
        log_error "Found $inconsistencies inconsistencies"
        log_info "Run './scripts/orch-db-cli.sh migrate' to resolve"
        return 1
    else
        log_success "All states are consistent"
        return 0
    fi
}

# =============================================================================
# STATUS COMMAND
# =============================================================================

cmd_status() {
    local instance="${1:-}"

    ensure_database

    log_info "=== Deployment Status ==="
    echo ""

    if [ -n "$instance" ]; then
        # Single instance status
        local state
        state=$(orch_db_get_state "$instance")

        local last_transition
        last_transition=$(orch_db_exec "SELECT to_char(timestamp, 'YYYY-MM-DD HH24:MI:SS') FROM deployment_states WHERE instance_code='$(lower "$instance")' ORDER BY timestamp DESC LIMIT 1" 2>/dev/null | xargs)

        local lock_status="unlocked"
        if orch_db_check_lock_status "$instance"; then
            lock_status="LOCKED"
        fi

        echo "Instance:     $(upper "$instance")"
        echo "State:        $state"
        echo "Last Updated: ${last_transition:-never}"
        echo "Lock Status:  $lock_status"
        echo ""
        echo "Recent History:"
        orch_db_exec "SELECT to_char(timestamp, 'YYYY-MM-DD HH24:MI:SS') as time, state, reason FROM deployment_states WHERE instance_code='$(lower "$instance")' ORDER BY timestamp DESC LIMIT 5" 2>/dev/null || echo "  No history"
    else
        # All instances
        printf "%-6s %-12s %-20s %-8s\n" "INST" "STATE" "LAST UPDATED" "LOCKED"
        printf "%-6s %-12s %-20s %-8s\n" "----" "-----" "------------" "------"

        local instances
        instances=$(orch_db_exec "SELECT DISTINCT instance_code FROM deployment_states ORDER BY instance_code" 2>/dev/null || true)

        for inst in $instances; do
            [ -z "$inst" ] && continue
            local state last_update lock_status
            state=$(orch_db_exec "SELECT state FROM deployment_states WHERE instance_code='$inst' ORDER BY timestamp DESC LIMIT 1" | xargs)
            last_update=$(orch_db_exec "SELECT to_char(timestamp, 'MM-DD HH24:MI') FROM deployment_states WHERE instance_code='$inst' ORDER BY timestamp DESC LIMIT 1" | xargs)
            lock_status="no"
            orch_db_check_lock_status "$inst" && lock_status="YES"

            printf "%-6s %-12s %-20s %-8s\n" "$(upper "$inst")" "$state" "${last_update:-never}" "$lock_status"
        done
    fi
}

# =============================================================================
# ROLLBACK COMMAND
# =============================================================================

cmd_rollback() {
    local instance="${1:-}"
    local reason="${2:-Manual rollback via CLI}"

    if [ -z "$instance" ]; then
        log_error "Usage: rollback <instance> [reason]"
        return 1
    fi

    ensure_database

    log_info "Rolling back state for $(upper "$instance")..."

    if orch_db_rollback_state "$instance" "$reason"; then
        log_success "Rollback complete"
        cmd_status "$instance"
    else
        log_error "Rollback failed"
        return 1
    fi
}

# =============================================================================
# UNLOCK COMMAND
# =============================================================================

cmd_unlock() {
    local instance="${1:-}"

    if [ -z "$instance" ]; then
        log_error "Usage: unlock <instance>"
        return 1
    fi

    ensure_database

    log_info "Force releasing lock for $(upper "$instance")..."

    # Release PostgreSQL advisory lock
    local code_lower
    code_lower=$(lower "$instance")
    local lock_id
    lock_id=$(echo -n "deployment_${code_lower}" | cksum | cut -d' ' -f1)

    # Try to release (may fail if we don't hold it, which is fine)
    orch_db_exec "SELECT pg_advisory_unlock_all()" >/dev/null 2>&1 || true

    # Update lock record
    orch_db_exec "UPDATE deployment_locks SET released_at = NOW() WHERE instance_code = '$code_lower' AND released_at IS NULL" >/dev/null 2>&1 || true

    # Also clean up file-based locks if they exist
    local lock_dir="${DIVE_ROOT}/.dive-state/${code_lower}.lock.d"
    if [ -d "$lock_dir" ]; then
        rm -rf "$lock_dir"
        log_verbose "Removed file-based lock: $lock_dir"
    fi

    log_success "Lock released for $(upper "$instance")"
}

# =============================================================================
# CIRCUIT-RESET COMMAND
# =============================================================================

cmd_circuit_reset() {
    local operation="${1:-}"

    if [ -z "$operation" ]; then
        log_error "Usage: circuit-reset <operation>"
        log_info "Available operations:"
        orch_db_exec "SELECT operation_name, state, failure_count FROM circuit_breakers" 2>/dev/null || echo "  No circuit breakers found"
        return 1
    fi

    ensure_database

    log_info "Resetting circuit breaker: $operation"

    if orch_db_exec "UPDATE circuit_breakers SET state='CLOSED', failure_count=0, success_count=0, last_state_change=NOW() WHERE operation_name='$operation'" 2>/dev/null; then
        log_success "Circuit breaker reset to CLOSED: $operation"
    else
        log_error "Failed to reset circuit breaker"
        return 1
    fi
}

# =============================================================================
# CLEANUP COMMAND
# =============================================================================

cmd_cleanup() {
    local force=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --force)
                force=true
                shift
                ;;
            *)
                log_error "Unknown option: $1"
                return 1
                ;;
        esac
    done

    local state_dir="${DIVE_ROOT}/.dive-state"

    if [ ! -d "$state_dir" ]; then
        log_info "No .dive-state directory found. Nothing to clean."
        return 0
    fi

    # Count files
    local file_count
    file_count=$(find "$state_dir" -name "*.state" -type f 2>/dev/null | wc -l | tr -d ' ')

    if [ "$file_count" -eq 0 ]; then
        log_info "No state files found. Nothing to clean."
        return 0
    fi

    log_warn "Found $file_count state files in $state_dir"

    if [ "$force" = false ]; then
        log_warn "This will remove all .state files after confirming they're in the database."
        log_warn "Run with --force to proceed, or validate first:"
        log_info "  ./scripts/orch-db-cli.sh validate"
        return 1
    fi

    ensure_database

    # Validate before cleanup
    if ! cmd_validate >/dev/null 2>&1; then
        log_error "State validation failed. Cannot cleanup until states are consistent."
        log_error "Run './scripts/orch-db-cli.sh migrate' first."
        return 1
    fi

    # Archive state files
    local archive_dir
    archive_dir="${DIVE_ROOT}/.dive-state.archive.$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$archive_dir"

    log_info "Archiving state files to: $archive_dir"
    mv "$state_dir"/*.state "$archive_dir/" 2>/dev/null || true

    # Clean lock directories
    find "$state_dir" -name "*.lock.d" -type d -exec rm -rf {} \; 2>/dev/null || true

    log_success "Cleanup complete. State files archived to: $archive_dir"
    log_info "You can safely delete the archive after verifying the system works correctly."
}

# =============================================================================
# HISTORY COMMAND
# =============================================================================

cmd_history() {
    local instance="${1:-}"
    local limit="${2:-20}"

    if [ -z "$instance" ]; then
        log_error "Usage: history <instance> [limit]"
        return 1
    fi

    ensure_database

    log_info "State transition history for $(upper "$instance") (last $limit):"
    echo ""

    printf "%-20s %-12s %-12s %s\n" "TIMESTAMP" "FROM" "TO" "REASON"
    printf "%-20s %-12s %-12s %s\n" "---------" "----" "--" "------"

    orch_db_exec "
        SELECT
            to_char(timestamp, 'YYYY-MM-DD HH24:MI:SS'),
            COALESCE(previous_state, '-'),
            state,
            COALESCE(LEFT(reason, 40), '-')
        FROM deployment_states
        WHERE instance_code='$(lower "$instance")'
        ORDER BY timestamp DESC
        LIMIT $limit
    " 2>/dev/null | while IFS='|' read -r ts from_state to_state reason; do
        printf "%-20s %-12s %-12s %s\n" "$ts" "$from_state" "$to_state" "$reason"
    done
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    local command="${1:-}"
    shift || true

    case "$command" in
        migrate)
            cmd_migrate "$@"
            ;;
        validate)
            cmd_validate "$@"
            ;;
        status)
            cmd_status "$@"
            ;;
        rollback)
            cmd_rollback "$@"
            ;;
        unlock)
            cmd_unlock "$@"
            ;;
        circuit-reset)
            cmd_circuit_reset "$@"
            ;;
        cleanup)
            cmd_cleanup "$@"
            ;;
        history)
            cmd_history "$@"
            ;;
        help|--help|-h|"")
            print_usage
            ;;
        *)
            log_error "Unknown command: $command"
            print_usage
            exit 1
            ;;
    esac
}

main "$@"
