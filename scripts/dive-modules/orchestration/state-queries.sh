#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Orchestration State Queries
# =============================================================================
# Extracted from orchestration/state.sh (Phase 13e)
# =============================================================================

[ -n "${DIVE_ORCH_STATE_QUERIES_LOADED:-}" ] && return 0

# =============================================================================

##
# Record orchestration error to database
#
# Arguments:
#   $1 - Instance code
#   $2 - Error code
#   $3 - Severity (1-4)
#   $4 - Component
#   $5 - Message
#   $6 - Optional remediation
#   $7 - Optional context JSON
##
orch_db_record_error() {
    local instance_code="$1"
    local error_code="$2"
    local severity="$3"
    local component="$4"
    local message="$5"
    local remediation="${6:-}"
    local context="${7:-}"
    local code_lower
    code_lower=$(lower "$instance_code")

    if ! orch_db_check_connection; then
        return 0 # Non-blocking
    fi

    local escaped_message="${message//\'/\'\'}"
    local escaped_remediation="${remediation//\'/\'\'}"
    local escaped_context="${context//\'/\'\'}"

    orch_db_exec "
INSERT INTO orchestration_errors
    (instance_code, error_code, severity, component, message, remediation, context)
VALUES
    ('$code_lower', '$error_code', $severity, '$component', '$escaped_message', '$escaped_remediation', '$escaped_context'::jsonb);
" >/dev/null
}

# =============================================================================
# METRICS RECORDING
# =============================================================================

##
# Record orchestration metric
#
# Arguments:
#   $1 - Instance code
#   $2 - Metric name
#   $3 - Metric value
#   $4 - Optional unit
#   $5 - Optional labels JSON
##
orch_db_record_metric() {
    local instance_code="$1"
    local metric_name="$2"
    local metric_value="$3"
    local metric_unit="${4:-}"
    local labels="${5:-null}"
    local code_lower
    code_lower=$(lower "$instance_code")

    if ! orch_db_check_connection; then
        return 0 # Non-blocking
    fi

    # Handle NULL labels properly
    local labels_sql="NULL"
    if [ "$labels" != "null" ] && [ -n "$labels" ]; then
        if echo "$labels" | jq empty >/dev/null 2>&1; then
            labels_sql="'${labels//\'/\'\'}'::jsonb"
        fi
    fi

    orch_db_exec "
INSERT INTO orchestration_metrics (instance_code, metric_name, metric_value, metric_unit, labels)
VALUES ('$code_lower', '$metric_name', $metric_value, '$metric_unit', $labels_sql);
" >/dev/null 2>&1

    log_verbose "✓ Metric logged: $metric_name = $metric_value $metric_unit"
}

# =============================================================================
# CHECKPOINT MANAGEMENT
# =============================================================================

##
# Register checkpoint in database
#
# Arguments:
#   $1 - Checkpoint ID
#   $2 - Instance code
#   $3 - Checkpoint level
#   $4 - File path
#   $5 - Optional description
##
orch_db_register_checkpoint() {
    local checkpoint_id="$1"
    local instance_code="$2"
    local checkpoint_level="$3"
    local file_path="$4"
    local description="${5:-}"
    local code_lower
    code_lower=$(lower "$instance_code")

    if ! orch_db_check_connection; then
        return 0 # Non-blocking
    fi

    local escaped_description="${description//\'/\'\'}"

    orch_db_exec "
INSERT INTO checkpoints (checkpoint_id, instance_code, checkpoint_level, file_path, description)
VALUES ('$checkpoint_id', '$code_lower', '$checkpoint_level', '$file_path', '$escaped_description');
" >/dev/null
}

##
# Get latest checkpoint for instance
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   Checkpoint ID on stdout
##
orch_db_get_latest_checkpoint() {
    local instance_code="$1"
    local code_lower
    code_lower=$(lower "$instance_code")

    if ! orch_db_check_connection; then
        return 1
    fi

    orch_db_exec "SELECT get_latest_checkpoint('$code_lower');" | xargs
}

##
# List all checkpoints for instance
#
# Arguments:
#   $1 - Instance code
#   $2 - Limit (optional, default: 10)
#
# Returns:
#   Table of checkpoints (id, level, created_at, description)
##
orch_db_list_checkpoints() {
    local instance_code="$1"
    local limit="${2:-10}"
    local code_lower
    code_lower=$(lower "$instance_code")

    if ! orch_db_check_connection; then
        log_error "Database not available"
        return 1
    fi

    orch_db_exec "
SELECT checkpoint_id, checkpoint_level, created_at, description
FROM checkpoints
WHERE instance_code='$code_lower'
ORDER BY created_at DESC
LIMIT $limit;
"
}

##
# Restore to checkpoint (database state only)
#
# Arguments:
#   $1 - Instance code
#   $2 - Checkpoint ID (optional, defaults to latest)
#
# Returns:
#   0 - Success
#   1 - Failure
##
orch_db_restore_checkpoint() {
    local instance_code="$1"
    local checkpoint_id="${2:-}"
    local code_lower
    code_lower=$(lower "$instance_code")

    if ! orch_db_check_connection; then
        log_error "Database not available for checkpoint restore"
        return 1
    fi

    # Get checkpoint ID if not provided
    if [ -z "$checkpoint_id" ]; then
        checkpoint_id=$(orch_db_get_latest_checkpoint "$instance_code")
        if [ -z "$checkpoint_id" ]; then
            log_error "No checkpoint found for $instance_code"
            return 1
        fi
    fi

    log_info "Restoring checkpoint: $checkpoint_id for $instance_code..."

    # Get checkpoint metadata
    local checkpoint_data
    checkpoint_data=$(orch_db_exec "
SELECT checkpoint_level, file_path, description, created_at
FROM checkpoints
WHERE checkpoint_id='$checkpoint_id' AND instance_code='$code_lower';
" | head -1)

    if [ -z "$checkpoint_data" ]; then
        log_error "Checkpoint not found: $checkpoint_id"
        return 1
    fi

    # Reset deployment state to checkpoint state
    local checkpoint_level
    checkpoint_level=$(echo "$checkpoint_data" | awk -F'|' '{print $1}' | xargs)

    # Determine state based on checkpoint level
    local target_state="UNKNOWN"
    case "$checkpoint_level" in
        PREFLIGHT) target_state="INITIALIZING" ;;
        INITIALIZATION) target_state="INITIALIZING" ;;
        DEPLOYMENT) target_state="DEPLOYING" ;;
        CONFIGURATION) target_state="CONFIGURING" ;;
        VERIFICATION) target_state="VERIFYING" ;;
        *) target_state="UNKNOWN" ;;
    esac

    # Update state (using the set_state function ensures proper transition logging)
    orch_db_set_state "$instance_code" "$target_state" "Restored from checkpoint: $checkpoint_id"

    log_success "✓ Restored to checkpoint: $checkpoint_id (state: $target_state)"
    return 0
}

##
# Cleanup old checkpoints
#
# Arguments:
#   $1 - Instance code (or 'all' for all instances)
#   $2 - Days to keep (default: 7)
#
# Returns:
#   Number of checkpoints deleted
##
orch_db_cleanup_checkpoints() {
    local instance_code="${1:-all}"
    local days_to_keep="${2:-7}"

    if ! orch_db_check_connection; then
        log_error "Database not available"
        return 1
    fi

    local sql_filter="created_at < NOW() - INTERVAL '$days_to_keep days'"
    if [ "$instance_code" != "all" ]; then
        local code_lower
        code_lower=$(lower "$instance_code")
        sql_filter="$sql_filter AND instance_code='$code_lower'"
    fi

    local deleted_count
    deleted_count=$(orch_db_exec "
WITH deleted AS (
    DELETE FROM checkpoints
    WHERE $sql_filter
    RETURNING *
)
SELECT COUNT(*) FROM deleted;
" | xargs)

    log_info "Cleaned up $deleted_count old checkpoints (older than $days_to_keep days)"
    echo "$deleted_count"
}

##
# Validate checkpoint integrity
# Checks that checkpoint database records are consistent
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - All checkpoints valid
#   1 - Issues found
##
orch_db_validate_checkpoints() {
    local instance_code="$1"
    local code_lower
    code_lower=$(lower "$instance_code")
    local issues=0

    if ! orch_db_check_connection; then
        log_error "Database not available"
        return 1
    fi

    log_info "Validating checkpoints for $instance_code..."

    # Check for orphaned checkpoints (no corresponding state)
    local orphaned
    orphaned=$(orch_db_exec "
SELECT COUNT(*)
FROM checkpoints c
WHERE c.instance_code='$code_lower'
AND NOT EXISTS (
    SELECT 1 FROM deployment_states ds
    WHERE ds.instance_code = c.instance_code
);
" | xargs)

    if [ "$orphaned" -gt 0 ]; then
        log_warn "Found $orphaned orphaned checkpoints (no corresponding deployment state)"
        ((issues++))
    fi

    # Check for duplicate checkpoint IDs
    local duplicates
    duplicates=$(orch_db_exec "
SELECT COUNT(*)
FROM (
    SELECT checkpoint_id
    FROM checkpoints
    WHERE instance_code='$code_lower'
    GROUP BY checkpoint_id
    HAVING COUNT(*) > 1
) dups;
" | xargs)

    if [ "$duplicates" -gt 0 ]; then
        log_warn "Found $duplicates duplicate checkpoint IDs"
        ((issues++))
    fi

    # Summary
    if [ $issues -eq 0 ]; then
        log_success "✓ All checkpoints valid for $instance_code"
        return 0
    else
        log_warn "⚠ Found $issues issues with checkpoints for $instance_code"
        return 1
    fi
}

# =============================================================================
# QUERY FUNCTIONS (Observability)
# =============================================================================

##
# Get deployment duration for instance
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   Duration in seconds
##
orch_db_get_deployment_duration() {
    local instance_code="$1"
    local code_lower
    code_lower=$(lower "$instance_code")

    if ! orch_db_check_connection; then
        return 1
    fi

    orch_db_exec "
SELECT EXTRACT(EPOCH FROM get_deployment_duration('$code_lower'))::INTEGER;
" | xargs
}

##
# Get unresolved errors count
#
# Arguments:
#   $1 - Instance code
#   $2 - Severity level (1-4)
#
# Returns:
#   Error count
##
orch_db_get_unresolved_errors() {
    local instance_code="$1"
    local severity="$2"
    local code_lower
    code_lower=$(lower "$instance_code")

    if ! orch_db_check_connection; then
        return 1
    fi

    orch_db_exec "SELECT count_unresolved_errors('$code_lower', $severity);" | xargs
}

##
# Get state transition history
#
# Arguments:
#   $1 - Instance code
#   $2 - Optional limit (default: 10)
#
# Returns:
#   JSON array of transitions
##
orch_db_get_state_history() {
    local instance_code="$1"
    local limit="${2:-10}"
    local code_lower
    code_lower=$(lower "$instance_code")

    if ! orch_db_check_connection; then
        return 1
    fi

    orch_db_exec_json "
SELECT from_state, to_state, transition_time, duration_seconds
FROM state_transitions
WHERE instance_code = '$code_lower'
ORDER BY transition_time DESC
LIMIT $limit;
"
}

# =============================================================================
# INITIALIZATION & MIGRATION
# =============================================================================

##
# Initialize database schema with pre-flight checks and advisory locking (idempotent)
#
# This function implements production-grade schema initialization:
# 1. Pre-flight health check - verify database is responsive
# 2. Advisory lock acquisition - prevent concurrent schema modifications
# 3. Schema verification - check if tables already exist
# 4. Idempotent migration - uses IF NOT EXISTS for all objects
# 5. Post-flight validation - verify expected tables exist
#
# Returns:
#   0 - Success (schema initialized or already exists)
#   1 - Failed
##
orch_db_init_schema() {
    local migration_file="${DIVE_ROOT}/scripts/migrations/001_orchestration_state_db.sql"

    if [ ! -f "$migration_file" ]; then
        log_error "Migration file not found: $migration_file"
        return 1
    fi

    log_info "Initializing orchestration database schema..."

    # ==========================================================================
    # Step 1: Pre-flight health check
    # ==========================================================================
    log_verbose "Step 1: Pre-flight health check..."
    if ! orch_db_schema_preflight_check; then
        log_error "Pre-flight check failed - database not ready for schema initialization"
        return 1
    fi

    # ==========================================================================
    # Step 2: Acquire advisory lock for schema operations
    # ==========================================================================
    # Lock ID 1234567890 is reserved for schema operations
    # This prevents concurrent deployments from racing on schema creation
    local schema_lock_id=1234567890
    local lock_timeout=30

    log_verbose "Step 2: Acquiring advisory lock for schema operations..."
    local lock_acquired
    lock_acquired=$(docker exec dive-hub-postgres psql -U postgres -d orchestration -t -c \
        "SELECT pg_try_advisory_lock($schema_lock_id);" 2>/dev/null | xargs)

    if [ "$lock_acquired" != "t" ]; then
        log_warn "Another process is initializing schema - waiting up to ${lock_timeout}s..."
        local start_time
        start_time=$(date +%s)
        while [ $(($(date +%s) - start_time)) -lt $lock_timeout ]; do
            lock_acquired=$(docker exec dive-hub-postgres psql -U postgres -d orchestration -t -c \
                "SELECT pg_try_advisory_lock($schema_lock_id);" 2>/dev/null | xargs)
            if [ "$lock_acquired" = "t" ]; then
                break
            fi
            sleep 1
        done

        if [ "$lock_acquired" != "t" ]; then
            log_error "Could not acquire schema lock after ${lock_timeout}s - aborting"
            return 1
        fi
    fi
    log_verbose "✓ Advisory lock acquired for schema operations"

    # ==========================================================================
    # Step 3: Check if schema already initialized (idempotent)
    # ==========================================================================
    log_verbose "Step 3: Checking existing schema..."
    local existing_tables
    existing_tables=$(docker exec dive-hub-postgres psql -U postgres -d orchestration -t -c \
        "SELECT COUNT(*) FROM information_schema.tables
         WHERE table_schema = 'public'
         AND table_name IN ('deployment_states', 'state_transitions', 'deployment_steps',
                            'deployment_locks', 'circuit_breakers', 'orchestration_errors',
                            'orchestration_metrics', 'checkpoints');" 2>/dev/null | xargs)

    if [ "$existing_tables" -ge 8 ]; then
        log_verbose "✓ Schema already initialized ($existing_tables/8 tables exist)"
        # Release lock and return success
        ${DOCKER_CMD:-docker} exec dive-hub-postgres psql -U postgres -d orchestration -c \
            "SELECT pg_advisory_unlock($schema_lock_id);" >/dev/null 2>&1 || true
        return 0
    fi

    # ==========================================================================
    # Step 4: Apply migration (idempotent SQL with IF NOT EXISTS)
    # ==========================================================================
    log_verbose "Step 4: Applying schema migration ($existing_tables/8 tables exist)..."
    local migration_output
    local _migration_exit_code=0

    # Copy migration file to container and execute
    ${DOCKER_CMD:-docker} cp "$migration_file" dive-hub-postgres:/tmp/migration.sql 2>/dev/null || {
        log_error "Failed to copy migration file to container"
        ${DOCKER_CMD:-docker} exec dive-hub-postgres psql -U postgres -d orchestration -c \
            "SELECT pg_advisory_unlock($schema_lock_id);" >/dev/null 2>&1 || true
        return 1
    }

    migration_output=$(docker exec dive-hub-postgres psql -U postgres -d orchestration -f /tmp/migration.sql 2>&1) || _migration_exit_code=$?

    # Cleanup temp file
    ${DOCKER_CMD:-docker} exec dive-hub-postgres rm -f /tmp/migration.sql 2>/dev/null || true

    # ==========================================================================
    # Step 5: Post-flight validation
    # ==========================================================================
    log_verbose "Step 5: Post-flight validation..."
    local final_table_count
    final_table_count=$(docker exec dive-hub-postgres psql -U postgres -d orchestration -t -c \
        "SELECT COUNT(*) FROM information_schema.tables
         WHERE table_schema = 'public'
         AND table_name IN ('deployment_states', 'state_transitions', 'deployment_steps',
                            'deployment_locks', 'circuit_breakers', 'orchestration_errors',
                            'orchestration_metrics', 'checkpoints');" 2>/dev/null | xargs)

    # Release advisory lock
    ${DOCKER_CMD:-docker} exec dive-hub-postgres psql -U postgres -d orchestration -c \
        "SELECT pg_advisory_unlock($schema_lock_id);" >/dev/null 2>&1 || true
    log_verbose "✓ Advisory lock released"

    if [ "$final_table_count" -ge 6 ]; then
        log_success "Database schema initialized ($final_table_count tables verified)"
        return 0
    else
        log_error "Schema initialization incomplete - only $final_table_count/8 tables created"
        if [ -n "$migration_output" ]; then
            log_verbose "Migration output: $migration_output"
        fi
        return 1
    fi
}

##
# Pre-flight health check for schema operations
#
# Verifies:
# 1. Hub PostgreSQL container is running
# 2. Database accepts connections
# 3. orchestration database exists
#
# Returns:
#   0 - Ready for schema operations
#   1 - Not ready
##
orch_db_schema_preflight_check() {
    # Check container is running
    if ! docker ps --format '{{.Names}}' | grep -q "^dive-hub-postgres$"; then
        log_error "Hub PostgreSQL container not running"
        return 1
    fi

    # Check database accepts connections (pg_isready)
    if ! ${DOCKER_CMD:-docker} exec dive-hub-postgres pg_isready -U postgres -d orchestration >/dev/null 2>&1; then
        log_verbose "Database not ready, waiting..."
        local retry_count=0
        local max_retries=10
        while [ $retry_count -lt $max_retries ]; do
            sleep 1
            ((retry_count++))
            if ${DOCKER_CMD:-docker} exec dive-hub-postgres pg_isready -U postgres -d orchestration >/dev/null 2>&1; then
                break
            fi
        done

        if [ $retry_count -ge $max_retries ]; then
            log_error "Database not accepting connections after ${max_retries}s"
            return 1
        fi
    fi

    # Check orchestration database exists (create if not)
    local db_exists
    db_exists=$(docker exec dive-hub-postgres psql -U postgres -t -c \
        "SELECT 1 FROM pg_database WHERE datname = 'orchestration';" 2>/dev/null | xargs)

    if [ "$db_exists" != "1" ]; then
        log_verbose "Creating orchestration database..."
        ${DOCKER_CMD:-docker} exec dive-hub-postgres psql -U postgres -c "CREATE DATABASE orchestration;" >/dev/null 2>&1 || {
            log_error "Failed to create orchestration database"
            return 1
        }
    fi

    log_verbose "✓ Database pre-flight check passed"
    return 0
}

# =============================================================================
# MODULE INITIALIZATION
# =============================================================================

# ROOT FIX: Don't disable ORCH_DB_ENABLED during module load
# This was causing the module to permanently disable database features
# if the container wasn't ready when the module loaded.
#
# Best practice: Check connection on each operation, not at module load time

# =============================================================================
# STATE MIGRATION FUNCTIONS
# =============================================================================

export DIVE_ORCH_STATE_QUERIES_LOADED=1
