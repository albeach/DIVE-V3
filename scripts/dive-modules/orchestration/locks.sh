#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Orchestration Lock Management (Consolidated)
# =============================================================================
# PostgreSQL advisory locks only (ADR-001)
# =============================================================================
# Version: 5.0.0 (Module Consolidation)
# Date: 2026-01-22
#
# Consolidates:
#   - lock-cleanup.sh
#
# NOTE: File-based locks have been REMOVED
# =============================================================================

# Prevent multiple sourcing
[ -n "${DIVE_ORCHESTRATION_LOCKS_LOADED:-}" ] && return 0
export DIVE_ORCHESTRATION_LOCKS_LOADED=1

# =============================================================================
# LOAD DEPENDENCIES
# =============================================================================

ORCH_DIR="$(dirname "${BASH_SOURCE[0]}")"
MODULES_DIR="$(dirname "$ORCH_DIR")"

if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "${MODULES_DIR}/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load state module for database functions
if [ -f "${ORCH_DIR}/state.sh" ]; then
    source "${ORCH_DIR}/state.sh"
fi

# =============================================================================
# LOCK MANAGEMENT
# =============================================================================

##
# Acquire deployment lock for an instance
#
# Arguments:
#   $1 - Instance code
#   $2 - Timeout in seconds (default: 300)
#
# Returns:
#   0 - Lock acquired
#   1 - Failed to acquire lock
##
orch_acquire_lock() {
    local instance_code="$1"
    local timeout="${2:-300}"
    local code_lower
    code_lower=$(lower "$instance_code")

    if ! orch_db_check_connection; then
        log_error "FATAL: Database not available - cannot acquire lock"
        return 1
    fi

    # Generate lock ID from instance code
    local lock_id
    lock_id=$(echo -n "deployment_${code_lower}" | cksum | cut -d' ' -f1)

    log_verbose "Acquiring lock for $code_lower (lock_id: $lock_id, timeout: ${timeout}s)..."

    # Try to acquire advisory lock with timeout
    local acquired
    acquired=$(orch_db_exec "
        SELECT pg_try_advisory_lock($lock_id)
    " 2>/dev/null | xargs)

    if [ "$acquired" = "t" ]; then
        # Record lock acquisition
        orch_db_exec "
            INSERT INTO deployment_locks (instance_code, lock_id, acquired_by)
            VALUES ('$code_lower', $lock_id, '${USER:-unknown}')
        " >/dev/null 2>&1

        log_success "Lock acquired for $code_lower"
        return 0
    else
        log_error "Failed to acquire lock for $code_lower (already held)"
        return 1
    fi
}

##
# Release deployment lock for an instance
#
# Arguments:
#   $1 - Instance code
##
orch_release_lock() {
    local instance_code="$1"
    local code_lower
    code_lower=$(lower "$instance_code")

    if ! orch_db_check_connection; then
        log_warn "Database not available - lock may not be properly released"
        return 1
    fi

    local lock_id
    lock_id=$(echo -n "deployment_${code_lower}" | cksum | cut -d' ' -f1)

    # Release advisory lock
    orch_db_exec "SELECT pg_advisory_unlock($lock_id)" >/dev/null 2>&1

    # Update lock record
    orch_db_exec "
        UPDATE deployment_locks
        SET released_at = NOW()
        WHERE instance_code='$code_lower'
        AND lock_id=$lock_id
        AND released_at IS NULL
    " >/dev/null 2>&1

    log_verbose "Lock released for $code_lower"
    return 0
}

##
# Check if lock is held for an instance
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Lock is held
#   1 - Lock is not held
##
orch_check_lock() {
    local instance_code="$1"
    local code_lower
    code_lower=$(lower "$instance_code")

    if ! orch_db_check_connection; then
        return 1
    fi

    local lock_id
    lock_id=$(echo -n "deployment_${code_lower}" | cksum | cut -d' ' -f1)

    local is_locked
    is_locked=$(orch_db_exec "
        SELECT COUNT(*) FROM pg_locks
        WHERE locktype = 'advisory'
        AND objid = $lock_id
        AND granted = true
    " 2>/dev/null | xargs)

    [ "${is_locked:-0}" -gt 0 ]
}

##
# Alias for orch_check_lock (more intuitive name)
##
orch_has_deployment_lock() {
    orch_check_lock "$@"
}

##
# Clean all stale deployment locks
#
# Arguments:
#   $1 - Optional: specific instance code
#   $2 - Optional: age threshold in minutes (default: 60)
##
orch_cleanup_stale_locks() {
    local instance_code="${1:-}"
    local age_minutes="${2:-60}"
    local age_seconds=$((age_minutes * 60))

    log_info "Cleaning stale deployment locks (age threshold: ${age_minutes} minutes)..."

    if ! orch_db_check_connection; then
        log_error "FATAL: Database not available - cannot clean locks"
        return 1
    fi

    local db_locks_cleaned=0

    # Clean database lock records
    log_step "Cleaning database lock records..."

    local sql_filter="released_at IS NULL AND acquired_at < NOW() - INTERVAL '${age_minutes} minutes'"

    if [ -n "$instance_code" ]; then
        local code_lower
        code_lower=$(lower "$instance_code")
        sql_filter="$sql_filter AND instance_code='$code_lower'"
    fi

    db_locks_cleaned=$(orch_db_exec "
        UPDATE deployment_locks
        SET released_at = NOW()
        WHERE $sql_filter
        RETURNING instance_code
    " 2>/dev/null | wc -l | xargs || echo "0")

    log_success "Database lock records cleaned: $db_locks_cleaned"

    # Clean PostgreSQL advisory locks
    local active_locks
    active_locks=$(orch_db_exec "
        SELECT COUNT(*) FROM pg_locks
        WHERE locktype = 'advisory' AND granted = true
    " 2>/dev/null | xargs || echo "0")

    if [ "${active_locks:-0}" -gt 0 ]; then
        log_info "Found $active_locks active PostgreSQL advisory locks"
        orch_db_exec "SELECT pg_advisory_unlock_all();" >/dev/null 2>&1 || true
        log_success "PostgreSQL advisory locks released"
    fi

    # Clean stale file-based locks (used in remote/no-DB lock mode)
    local lock_dir="${DIVE_ROOT}/.dive-state"
    if [ -d "$lock_dir" ]; then
        local lock_file lock_mtime lock_age removed_file_locks
        removed_file_locks=0

        for lock_file in "$lock_dir"/*.lock; do
            [ -e "$lock_file" ] || continue

            if [ -n "$instance_code" ]; then
                local expected_lock
                expected_lock="$(upper "$instance_code").lock"
                [ "$(basename "$lock_file")" = "$expected_lock" ] || continue
            fi

            lock_mtime=$(stat -f %m "$lock_file" 2>/dev/null || stat -c %Y "$lock_file" 2>/dev/null || echo 0)
            lock_age=$(( $(date +%s) - lock_mtime ))
            if [ "$lock_age" -ge "$age_seconds" ]; then
                rm -f "$lock_file" 2>/dev/null || true
                removed_file_locks=$((removed_file_locks + 1))
            fi
        done

        log_success "File lock records cleaned: $removed_file_locks"
    fi

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
    local code_upper
    code_upper=$(upper "$instance_code")
    local code_lower
    code_lower=$(lower "$instance_code")

    log_warn "Force unlocking $code_upper (emergency cleanup)..."

    if ! orch_db_check_connection; then
        log_error "FATAL: Database not available - cannot release lock"
        return 1
    fi

    # Release database lock record
    orch_db_exec "
        UPDATE deployment_locks
        SET released_at = NOW()
        WHERE instance_code='$code_lower'
        AND released_at IS NULL
    " >/dev/null 2>&1

    # Release PostgreSQL advisory lock
    local lock_id
    lock_id=$(echo -n "deployment_${code_lower}" | cksum | cut -d' ' -f1)
    orch_db_exec "SELECT pg_advisory_unlock($lock_id);" >/dev/null 2>&1 || true

    # Release file-based lock (remote/no-DB lock mode)
    rm -f "${DIVE_ROOT}/.dive-state/${code_upper}.lock" 2>/dev/null || true

    log_success "Force unlock complete for $code_upper"
    return 0
}

##
# List all active locks
##
orch_list_locks() {
    if ! orch_db_check_connection; then
        log_error "Database not available"
        return 1
    fi

    echo "=== Active Deployment Locks ==="
    orch_db_exec "
        SELECT instance_code, acquired_at, acquired_by
        FROM deployment_locks
        WHERE released_at IS NULL
        ORDER BY acquired_at
    " 2>/dev/null

    echo ""
    echo "=== PostgreSQL Advisory Locks ==="
    orch_db_exec "
        SELECT objid as lock_id, granted
        FROM pg_locks
        WHERE locktype = 'advisory'
    " 2>/dev/null
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f orch_acquire_lock
export -f orch_release_lock
export -f orch_check_lock
export -f orch_has_deployment_lock
export -f orch_cleanup_stale_locks
export -f orch_force_unlock
export -f orch_list_locks

log_verbose "Orchestration locks module loaded (PostgreSQL advisory locks only)"
