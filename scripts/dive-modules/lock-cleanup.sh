#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Lock Cleanup Module
# =============================================================================
# Cleans stale deployment locks (PostgreSQL advisory locks only)
# Part of orchestration reliability improvements
#
# NOTE (2026-01-22): File-based locks have been REMOVED as part of
# database-only state management. Only PostgreSQL advisory locks are used.
# =============================================================================

# Prevent multiple sourcing
if [ -n "${LOCK_CLEANUP_LOADED:-}" ]; then
    return 0
fi
export LOCK_CLEANUP_LOADED=1

# Ensure common functions are loaded
if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load orchestration state database for DB lock cleanup
if [ -f "$(dirname "${BASH_SOURCE[0]}")/orchestration-state-db.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/orchestration-state-db.sh"
fi

##
# Clean all stale deployment locks (PostgreSQL advisory locks only)
#
# Arguments:
#   $1 - Optional: specific instance code (cleans all if not provided)
#   $2 - Optional: age threshold in minutes (default: 60)
#
# Returns:
#   0 - Success
#   1 - Failure
##
orch_cleanup_stale_locks() {
    local instance_code="${1:-}"
    local age_minutes="${2:-60}"

    log_info "Cleaning stale deployment locks (age threshold: ${age_minutes} minutes)..."

    local db_locks_cleaned=0
    local advisory_locks_cleaned=0

    # Require database connection - fail fast if unavailable
    if ! orch_db_check_connection; then
        log_error "FATAL: Database not available - cannot clean locks"
        log_error "  → Ensure Hub is running: ./dive hub up"
        return 1
    fi

    # Clean database lock records
    log_step "Cleaning database lock records..."

    local sql_filter="released_at IS NULL AND acquired_at < NOW() - INTERVAL '${age_minutes} minutes'"

    if [ -n "$instance_code" ]; then
        local code_lower=$(lower "$instance_code")
        sql_filter="$sql_filter AND instance_code='$code_lower'"
    fi

    db_locks_cleaned=$(orch_db_exec "
    UPDATE deployment_locks
    SET released_at = NOW()
    WHERE $sql_filter
    RETURNING instance_code
    " 2>/dev/null | wc -l | xargs || echo "0")

    log_success "✓ Database lock records cleaned: $db_locks_cleaned"

    # Clean PostgreSQL advisory locks
    log_step "Cleaning PostgreSQL advisory locks..."

    # Get all active advisory locks
    local active_locks=$(orch_db_exec "
    SELECT objid
    FROM pg_locks
    WHERE locktype = 'advisory'
    AND granted = true
    " 2>/dev/null | grep -v "^$" | wc -l | xargs || echo "0")

    if [ "$active_locks" -gt 0 ]; then
        log_info "Found $active_locks active PostgreSQL advisory locks"

        # Force unlock all (they'll be re-acquired if needed)
        orch_db_exec "SELECT pg_advisory_unlock_all();" >/dev/null 2>&1 || true
        advisory_locks_cleaned=$active_locks

        log_success "✓ PostgreSQL advisory locks released"
    else
        log_verbose "No active PostgreSQL advisory locks"
    fi

    # Summary
    echo ""
    log_success "Lock Cleanup Complete"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Database lock records cleaned:  $db_locks_cleaned"
    echo "  Advisory locks released:        $advisory_locks_cleaned"
    echo "  Age threshold:                  $age_minutes minutes"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    return 0
}

##
# Force unlock a specific instance (emergency use)
#
# Arguments:
#   $1 - Instance code
##
orch_force_unlock() {
    local instance_code="${1:?Instance code required}"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_warn "Force unlocking $code_upper (emergency cleanup)..."

    # Require database connection
    if ! orch_db_check_connection; then
        log_error "FATAL: Database not available - cannot release lock"
        log_error "  → Ensure Hub is running: ./dive hub up"
        return 1
    fi

    # Release database lock record
    orch_db_exec "
    UPDATE deployment_locks
    SET released_at = NOW()
    WHERE instance_code='$code_lower'
    AND released_at IS NULL
    " >/dev/null 2>&1

    log_success "✓ Released database lock record"

    # Release PostgreSQL advisory lock
    local lock_id=$(echo -n "deployment_${code_lower}" | cksum | cut -d' ' -f1)
    orch_db_exec "SELECT pg_advisory_unlock($lock_id);" >/dev/null 2>&1 || true

    log_success "✓ Released PostgreSQL advisory lock"

    log_success "✅ Force unlock complete for $code_upper"
    return 0
}

# Export functions
export -f orch_cleanup_stale_locks
export -f orch_force_unlock

log_verbose "Lock cleanup module loaded (2 functions)"
