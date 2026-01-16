#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Lock Cleanup Module
# =============================================================================
# Cleans stale deployment locks (file-based and database)
# Part of orchestration reliability improvements
# =============================================================================

# Prevent multiple sourcing
if [ -n "$LOCK_CLEANUP_LOADED" ]; then
    return 0
fi
export LOCK_CLEANUP_LOADED=1

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load orchestration state database for DB lock cleanup
if [ -f "$(dirname "${BASH_SOURCE[0]}")/orchestration-state-db.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/orchestration-state-db.sh"
fi

##
# Clean all stale deployment locks (file-based and database)
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

    local file_locks_cleaned=0
    local db_locks_cleaned=0

    # Clean file-based locks (.lock.d directories)
    log_step "Cleaning file-based locks..."

    if [ -n "$instance_code" ]; then
        # Clean specific instance
        local code_upper=$(upper "$instance_code")
        local lock_dir="${DIVE_ROOT}/.dive-state/${code_upper}.lock.d"

        if [ -d "$lock_dir" ]; then
            # Check age
            if stat -f %m "$lock_dir" >/dev/null 2>&1; then
                # macOS
                local lock_mtime=$(stat -f %m "$lock_dir")
                local now=$(date +%s)
                local age_seconds=$(( now - lock_mtime ))
                local age_mins=$(( age_seconds / 60 ))

                if [ $age_mins -ge $age_minutes ]; then
                    log_info "Removing stale lock: $code_upper (age: ${age_mins} minutes)"
                    rm -rf "$lock_dir"
                    ((file_locks_cleaned++))
                else
                    log_verbose "Lock is recent ($age_mins minutes), keeping it"
                fi
            fi
        fi
    else
        # Clean all instances
        for lock_dir in "${DIVE_ROOT}"/.dive-state/*.lock.d; do
            if [ ! -d "$lock_dir" ]; then continue; fi

            local instance=$(basename "$lock_dir" .lock.d)

            # Check age (macOS vs Linux compatible)
            local age_mins=9999
            if stat -f %m "$lock_dir" >/dev/null 2>&1; then
                # macOS
                local lock_mtime=$(stat -f %m "$lock_dir")
                local now=$(date +%s)
                age_mins=$(( (now - lock_mtime) / 60 ))
            elif stat -c %Y "$lock_dir" >/dev/null 2>&1; then
                # Linux
                local lock_mtime=$(stat -c %Y "$lock_dir")
                local now=$(date +%s)
                age_mins=$(( (now - lock_mtime) / 60 ))
            fi

            if [ $age_mins -ge $age_minutes ]; then
                log_info "Removing stale lock: $instance (age: ${age_mins} minutes)"
                rm -rf "$lock_dir"
                ((file_locks_cleaned++))
            fi
        done
    fi

    log_success "✓ File-based locks cleaned: $file_locks_cleaned"

    # Clean database locks
    if orch_db_check_connection; then
        log_step "Cleaning database locks..."

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

        log_success "✓ Database locks cleaned: $db_locks_cleaned"
    else
        log_warn "Database not available - skipping database lock cleanup"
    fi

    # Clean PostgreSQL advisory locks (force unlock all)
    if orch_db_check_connection; then
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

            log_success "✓ PostgreSQL advisory locks released"
        else
            log_verbose "No active PostgreSQL advisory locks"
        fi
    fi

    # Summary
    echo ""
    log_success "Lock Cleanup Complete"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  File-based locks cleaned:    $file_locks_cleaned"
    echo "  Database locks cleaned:      $db_locks_cleaned"
    echo "  Age threshold:               $age_minutes minutes"
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

    # Remove file-based lock
    local lock_dir="${DIVE_ROOT}/.dive-state/${code_upper}.lock.d"
    if [ -d "$lock_dir" ]; then
        rm -rf "$lock_dir"
        log_success "✓ Removed file-based lock"
    fi

    # Release database lock
    if orch_db_check_connection; then
        orch_db_exec "
        UPDATE deployment_locks
        SET released_at = NOW()
        WHERE instance_code='$code_lower'
        AND released_at IS NULL
        " >/dev/null 2>&1

        log_success "✓ Released database lock"

        # Release PostgreSQL advisory lock
        local lock_id=$(echo -n "deployment_${code_lower}" | cksum | cut -d' ' -f1)
        orch_db_exec "SELECT pg_advisory_unlock($lock_id);" >/dev/null 2>&1 || true

        log_success "✓ Released PostgreSQL advisory lock"
    fi

    log_success "✅ Force unlock complete for $code_upper"
    return 0
}

# Export functions
export -f orch_cleanup_stale_locks
export -f orch_force_unlock

log_verbose "Lock cleanup module loaded (2 functions)"
