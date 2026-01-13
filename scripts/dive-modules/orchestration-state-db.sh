#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Orchestration State Management - Database Backend
# =============================================================================
# Sprint 1: State Management Enhancement
# PostgreSQL-backed state management with dual-write (file + DB)
# =============================================================================

# ROOT FIX: Don't return early - let functions get defined
# Multiple sourcing is harmless (functions just get redefined)
# The early return was preventing functions from being available
export ORCHESTRATION_STATE_DB_LOADED=1

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load deployment-state.sh for file-based fallback
if [ -f "$(dirname "${BASH_SOURCE[0]}")/deployment-state.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/deployment-state.sh"
fi

# =============================================================================
# DATABASE CONNECTION CONFIGURATION
# =============================================================================

# PostgreSQL connection parameters
ORCH_DB_HOST="${ORCH_DB_HOST:-localhost}"
ORCH_DB_PORT="${ORCH_DB_PORT:-5432}"
ORCH_DB_NAME="${ORCH_DB_NAME:-orchestration}"
ORCH_DB_USER="${ORCH_DB_USER:-postgres}"
ORCH_DB_PASSWORD="${ORCH_DB_PASSWORD:-}" # Load from GCP Secret Manager

# Connection string
ORCH_DB_CONN="postgresql://${ORCH_DB_USER}:${ORCH_DB_PASSWORD}@${ORCH_DB_HOST}:${ORCH_DB_PORT}/${ORCH_DB_NAME}"

# Feature flags
ORCH_DB_ENABLED="${ORCH_DB_ENABLED:-true}"
ORCH_DB_DUAL_WRITE="${ORCH_DB_DUAL_WRITE:-true}"  # Write to both file and DB
ORCH_DB_SOURCE_OF_TRUTH="${ORCH_DB_SOURCE_OF_TRUTH:-file}" # file or db

# =============================================================================
# DATABASE CONNECTION HELPERS
# =============================================================================

##
# Check if database connection is available
#
# Returns:
#   0 - Connection successful
#   1 - Connection failed
##
orch_db_check_connection() {
    if [ "$ORCH_DB_ENABLED" != "true" ]; then
        return 1
    fi

    # Use docker exec for reliable connection (no need for exposed ports)
    docker exec dive-hub-postgres psql -U postgres -d orchestration -c "SELECT 1" >/dev/null 2>&1
}

##
# Execute SQL query against orchestration database
#
# Arguments:
#   $1 - SQL query
#
# Returns:
#   Query output on stdout
##
orch_db_exec() {
    local query="$1"

    if ! orch_db_check_connection; then
        log_verbose "Database not available, skipping query"
        return 1
    fi

    # Use docker exec for reliable execution
    docker exec dive-hub-postgres psql -U postgres -d orchestration -t -c "$query" 2>/dev/null || return 1
}

##
# Execute SQL query and return JSON result
#
# Arguments:
#   $1 - SQL query
#
# Returns:
#   JSON output on stdout
##
orch_db_exec_json() {
    local query="$1"

    if ! orch_db_check_connection; then
        return 1
    fi

    # Use docker exec with JSON output
    docker exec dive-hub-postgres psql -U postgres -d orchestration -t -c "COPY ($query) TO STDOUT WITH (FORMAT json)" 2>/dev/null || return 1
}

# =============================================================================
# STATE MANAGEMENT FUNCTIONS (Database Backend)
# =============================================================================

##
# Set deployment state (dual-write: file + database)
#
# Arguments:
#   $1 - Instance code (spoke code or "usa" for hub)
#   $2 - New state
#   $3 - Optional reason (for FAILED state)
#   $4 - Optional metadata JSON
##
orch_db_set_state() {
    local instance_code="$1"
    local new_state="$2"
    local reason="${3:-}"
    local metadata="${4:-null}"
    local code_lower
    code_lower=$(lower "$instance_code")

    # Get previous state (from DB if enabled, else from file)
    local prev_state="UNKNOWN"
    if [ "$ORCH_DB_ENABLED" = "true" ]; then
        prev_state=$(orch_db_get_state "$instance_code" 2>/dev/null || echo "UNKNOWN")
    elif type -t get_deployment_state >/dev/null 2>&1; then
        prev_state=$(get_deployment_state "$instance_code" 2>/dev/null || echo "UNKNOWN")
    fi

    # Dual-write phase: Write to both file and database
    if [ "$ORCH_DB_DUAL_WRITE" = "true" ]; then
        # Write to file (existing function - non-blocking)
        if type -t set_deployment_state_enhanced >/dev/null 2>&1; then
            set_deployment_state_enhanced "$instance_code" "$new_state" "$reason" "$metadata" 2>/dev/null || true
        fi

        # Write to database with proper error handling
        if orch_db_check_connection; then
            # Escape SQL strings properly
            local escaped_reason="${reason//\'/\'\'}"
            local escaped_metadata="$metadata"

            # Handle JSON metadata - ROOT FIX: Proper NULL handling
            if [ "$metadata" = "null" ] || [ -z "$metadata" ]; then
                escaped_metadata="NULL"
            else
                # Validate JSON before inserting
                if echo "$metadata" | jq empty >/dev/null 2>&1; then
                    escaped_metadata="'${metadata//\'/\'\'}'"
                else
                    log_warn "Invalid JSON metadata, using NULL"
                    escaped_metadata="NULL"
                fi
            fi

            # Execute atomic transaction with rollback capability
            local sql_transaction="BEGIN; INSERT INTO deployment_states (instance_code, state, previous_state, reason, metadata, created_by) VALUES ('$code_lower', '$new_state', '$prev_state', '$escaped_reason', CASE WHEN '$escaped_metadata' = 'NULL' THEN NULL ELSE '$escaped_metadata'::jsonb END, 'system'); INSERT INTO state_transitions (instance_code, from_state, to_state, metadata, initiated_by) VALUES ('$code_lower', '$prev_state', '$new_state', CASE WHEN '$escaped_metadata' = 'NULL' THEN NULL ELSE '$escaped_metadata'::jsonb END, 'system'); COMMIT;"

            # Execute the transaction
            local sql_error_log
            sql_error_log=$(orch_db_exec "$sql_transaction" 2>&1)

            local db_exit_code=$?
            if [ $db_exit_code -eq 0 ]; then
                log_verbose "✓ State atomically persisted to database: $instance_code -> $new_state"
                # Record successful transition
                orch_db_exec "INSERT INTO orchestration_metrics (instance_code, metric_name, metric_value, labels) VALUES ('$code_lower', 'state_transition_success', 1, '{\"from_state\": \"$prev_state\", \"to_state\": \"$new_state\"}')" >/dev/null 2>&1 || true
            else
                # Transaction failed - rollback occurred automatically
                log_error "Database transaction failed for $instance_code -> $new_state"
                log_error "Transaction Error: $sql_error_log"
                # Record failure for monitoring
                orch_db_exec "INSERT INTO orchestration_errors (instance_code, error_code, severity, component, message, context) VALUES ('$code_lower', 'STATE_TRANSITION_FAILED', 3, 'orchestration-db', 'Failed to persist state transition', '{\"from_state\": \"$prev_state\", \"to_state\": \"$new_state\", \"error\": \"$sql_error_log\"}')" >/dev/null 2>&1 || true
            fi
        else
            log_verbose "Database connection not available - state written to file only"
        fi
    elif [ "$ORCH_DB_ENABLED" = "true" ]; then
        # Database-only mode (Phase 3)
        if orch_db_check_connection; then
            local escaped_reason="${reason//\'/\'\'}"
            local escaped_metadata="$metadata"

            # Handle JSON metadata properly
            if [ "$metadata" = "null" ] || [ -z "$metadata" ]; then
                escaped_metadata="NULL"
            elif echo "$metadata" | jq empty >/dev/null 2>&1; then
                escaped_metadata="'${metadata//\'/\'\'}'"
            else
                log_warn "Invalid JSON metadata in DB-only mode, using NULL"
                escaped_metadata="NULL"
            fi

            # Execute atomic transaction
            local sql_transaction="BEGIN; INSERT INTO deployment_states (instance_code, state, previous_state, reason, metadata, created_by) VALUES ('$code_lower', '$new_state', '$prev_state', '$escaped_reason', CASE WHEN '$escaped_metadata' = 'NULL' THEN NULL ELSE '$escaped_metadata'::jsonb END, 'system'); INSERT INTO state_transitions (instance_code, from_state, to_state, metadata, initiated_by) VALUES ('$code_lower', '$prev_state', '$new_state', CASE WHEN '$escaped_metadata' = 'NULL' THEN NULL ELSE '$escaped_metadata'::jsonb END, 'system'); COMMIT;"

            if orch_db_exec "$sql_transaction" >/dev/null 2>&1; then
                log_verbose "✓ State atomically persisted to database (DB-only mode): $instance_code -> $new_state"
            else
                log_error "Database transaction failed (DB-only mode) for $instance_code -> $new_state"
                return 1 # Fail in DB-only mode since there's no fallback
            fi
        else
            log_error "Database unavailable and file-only mode disabled"
            return 1
        fi
    else
        # File-only mode (legacy)
        set_deployment_state_enhanced "$instance_code" "$new_state" "$reason" "$metadata"
    fi
}

##
# Get current deployment state
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   State name on stdout
##
orch_db_get_state() {
    local instance_code="$1"
    local code_lower
    code_lower=$(lower "$instance_code")

    # Choose source based on configuration
    if [ "$ORCH_DB_SOURCE_OF_TRUTH" = "db" ] && orch_db_check_connection; then
        # Database is source of truth
        local state
        state=$(orch_db_exec "SELECT get_current_state('$code_lower');" | xargs)

        if [ -n "$state" ] && [ "$state" != "UNKNOWN" ]; then
            echo "$state"
            return 0
        fi

        # Fallback to file if DB returns UNKNOWN
        get_deployment_state "$instance_code"
    else
        # File is source of truth (default for dual-write phase)
        get_deployment_state "$instance_code"
    fi
}

##
# Record deployment step progress
#
# Arguments:
#   $1 - Instance code
#   $2 - Step name
#   $3 - Status (PENDING, IN_PROGRESS, COMPLETED, FAILED, SKIPPED)
#   $4 - Optional error message
##
orch_db_record_step() {
    local instance_code="$1"
    local step_name="$2"
    local status="$3"
    local error_message="${4:-}"
    local code_lower
    code_lower=$(lower "$instance_code")

    if ! orch_db_check_connection; then
        return 0 # Non-blocking - database optional
    fi

    local escaped_error="${error_message//\'/\'\'}"

    # Use simpler INSERT without ON CONFLICT (started_at makes it unique each time)
    orch_db_exec "
INSERT INTO deployment_steps (instance_code, step_name, status, started_at, completed_at, error_message)
VALUES ('$code_lower', '$step_name', '$status', NOW(),
        CASE WHEN '$status' IN ('COMPLETED', 'FAILED', 'SKIPPED') THEN NOW() ELSE NULL END,
        '$escaped_error');
" >/dev/null 2>&1

    log_verbose "✓ Step logged: $step_name -> $status"
}

# =============================================================================
# CIRCUIT BREAKER PERSISTENCE
# =============================================================================

##
# Record circuit breaker state change
#
# Arguments:
#   $1 - Operation name
#   $2 - New state (CLOSED, OPEN, HALF_OPEN)
#   $3 - Failure count
#   $4 - Success count
##
orch_db_update_circuit_breaker() {
    local operation="$1"
    local state="$2"
    local failure_count="$3"
    local success_count="$4"

    if ! orch_db_check_connection; then
        return 0 # Non-blocking
    fi

    orch_db_exec "
INSERT INTO circuit_breakers (operation_name, state, failure_count, success_count, last_state_change)
VALUES ('$operation', '$state', $failure_count, $success_count, NOW())
ON CONFLICT (operation_name)
DO UPDATE SET
    state = EXCLUDED.state,
    failure_count = EXCLUDED.failure_count,
    success_count = EXCLUDED.success_count,
    last_state_change = NOW(),
    last_failure_time = CASE WHEN '$state' = 'OPEN' THEN NOW() ELSE circuit_breakers.last_failure_time END,
    last_success_time = CASE WHEN '$state' = 'CLOSED' THEN NOW() ELSE circuit_breakers.last_success_time END;
" >/dev/null
}

##
# Get circuit breaker state from database
#
# Arguments:
#   $1 - Operation name
#
# Returns:
#   State on stdout (CLOSED, OPEN, HALF_OPEN, or empty if not found)
##
orch_db_get_circuit_state() {
    local operation="$1"

    if ! orch_db_check_connection; then
        return 1
    fi

    orch_db_exec "SELECT state FROM circuit_breakers WHERE operation_name = '$operation';" | xargs
}

# =============================================================================
# ERROR RECORDING
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
# Initialize database schema (idempotent)
#
# Returns:
#   0 - Success
#   1 - Failed
##
orch_db_init_schema() {
    local migration_file="${DIVE_ROOT}/scripts/migrations/001_orchestration_state_db.sql"

    if [ ! -f "$migration_file" ]; then
        log_error "Migration file not found: $migration_file"
        return 1
    fi

    log_info "Initializing orchestration database schema..."

    if psql "$ORCH_DB_CONN" -f "$migration_file" >/dev/null 2>&1; then
        log_success "Database schema initialized"
        return 0
    else
        log_error "Failed to initialize database schema"
        return 1
    fi
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

##
# Migrate existing .dive-state files to PostgreSQL database
#
# Arguments:
#   None
#
# Returns:
#   0 - Migration successful
#   1 - Migration failed
##
orch_db_migrate_state_files() {
    # Ensure DIVE_ROOT is set
    if [ -z "$DIVE_ROOT" ]; then
        DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
        export DIVE_ROOT
    fi

    local state_dir="${DIVE_ROOT}/.dive-state"
    local migrated_count=0
    local skipped_count=0
    local failed_count=0

    log_info "Starting migration of existing .dive-state files to PostgreSQL database..."
    log_verbose "Looking in: $state_dir"

    if [ ! -d "$state_dir" ]; then
        log_info "No .dive-state directory found at $state_dir, nothing to migrate"
        return 0
    fi

    # Ensure database is available
    if ! orch_db_check_connection; then
        log_error "Database not available for migration"
        return 1
    fi

    # Process each .state file
    while IFS= read -r -d '' state_file; do
        local instance_code
        instance_code=$(basename "$state_file" .state)

        # Skip special files and invalid instance codes
        if [[ "$instance_code" =~ ^\. ]] || [ "$instance_code" = "status" ] || [ ${#instance_code} -gt 3 ]; then
            log_verbose "Skipping special/non-instance file: $instance_code"
            continue
        fi

        log_verbose "Processing state file: $instance_code"

        # Read state file content
        if [ ! -f "$state_file" ]; then
            log_warn "State file disappeared: $state_file"
            continue
        fi

        # Parse state file (simple key=value format)
        local state="" timestamp="" version="" reason="" metadata="" checksum=""

        while IFS='=' read -r key value; do
            case "$key" in
                state) state="$value" ;;
                timestamp) timestamp="$value" ;;
                version) version="$value" ;;
                reason) reason="$value" ;;
                metadata) metadata="$value" ;;
                checksum) checksum="$value" ;;
            esac
        done < "$state_file"

        # Validate required fields
        if [ -z "$state" ] || [ -z "$timestamp" ]; then
            log_warn "Invalid state file $instance_code: missing required fields"
            ((failed_count++))
            continue
        fi

        # Check if state already exists in database
        local existing_count
        existing_count=$(orch_db_exec "SELECT COUNT(*) FROM deployment_states WHERE instance_code = '$instance_code' AND state = '$state'" 2>/dev/null || echo "0")

        if [ "$existing_count" -gt 0 ]; then
            log_verbose "State already exists in database: $instance_code/$state"
            ((skipped_count++))
            continue
        fi

        # Convert timestamp to PostgreSQL format if needed
        local pg_timestamp="$timestamp"
        if [[ "$timestamp" == *Z ]]; then
            # Convert ISO 8601 with Z to PostgreSQL timestamp
            pg_timestamp=$(echo "$timestamp" | sed 's/Z/+00/')
        fi

        # Escape strings for SQL
        local escaped_reason="${reason//\'/\'\'}"
        local escaped_metadata="$metadata"

        # Handle null metadata
        if [ "$metadata" = "null" ] || [ -z "$metadata" ]; then
            escaped_metadata="NULL"
        else
            escaped_metadata="'$escaped_metadata'"
        fi

        # Insert into database
        local sql="INSERT INTO deployment_states (instance_code, state, timestamp, reason, metadata, created_by) VALUES ('$instance_code', '$state', '$pg_timestamp'::timestamptz, '$escaped_reason', $escaped_metadata, 'migration_system')"

        if orch_db_exec "$sql" >/dev/null 2>&1; then
            log_info "Migrated state: $instance_code -> $state"
            ((migrated_count++))
        else
            log_error "Failed to migrate state: $instance_code"
            ((failed_count++))
        fi

    done < <(find "$state_dir" -name "*.state" -type f -print0)

    # Create migration record
    if [ "$migrated_count" -gt 0 ]; then
        local migration_metadata="{\"migrated_files\": $migrated_count, \"skipped_files\": $skipped_count, \"failed_files\": $failed_count, \"migration_timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
        orch_db_exec "INSERT INTO orchestration_metrics (instance_code, metric_name, metric_value, labels) VALUES ('system', 'state_migration', $migrated_count, '$migration_metadata')" >/dev/null 2>&1 || true
    fi

    log_info "State migration complete: $migrated_count migrated, $skipped_count skipped, $failed_count failed"

    # Return success if no failures
    [ "$failed_count" -eq 0 ]
}

##
# Validate consistency between file-based and database state
#
# Arguments:
#   $1 - Instance code (optional, validates all if not specified)
#
# Returns:
#   0 - States are consistent
#   1 - Inconsistencies found
##
orch_db_validate_consistency() {
    local instance_code="${1:-}"
    local inconsistencies=0

    log_info "Validating state consistency between files and database..."

    if ! orch_db_check_connection; then
        log_error "Database not available for consistency check"
        return 1
    fi

    # Get list of instances to check
    local instances
    if [ -n "$instance_code" ]; then
        instances="$instance_code"
    else
        # Get all instances from both files and database
        local file_instances db_instances
        file_instances=$(find "${DIVE_ROOT}/.dive-state" -name "*.state" -type f -exec basename {} .state \; 2>/dev/null | grep -v '^\.' | sort | uniq)
        db_instances=$(orch_db_exec "SELECT DISTINCT instance_code FROM deployment_states ORDER BY instance_code" 2>/dev/null | sort | uniq)

        # Combine and deduplicate
        instances=$(echo -e "$file_instances\n$db_instances" | sort | uniq)
    fi

    for instance in $instances; do
        # Skip special instances
        if [[ "$instance" =~ ^\. ]]; then
            continue
        fi

        # Get current state from file
        local file_state=""
        local state_file="${DIVE_ROOT}/.dive-state/${instance}.state"
        if [ -f "$state_file" ]; then
            file_state=$(grep '^state=' "$state_file" | cut -d'=' -f2)
        fi

        # Get current state from database
        local db_state=""
        db_state=$(orch_db_exec "SELECT state FROM deployment_states WHERE instance_code = '$instance' ORDER BY timestamp DESC LIMIT 1" 2>/dev/null | xargs) # Trim whitespace

        # Compare states
        if [ "$file_state" != "$db_state" ] && [ -n "$file_state" ] && [ -n "$db_state" ]; then
            log_error "State inconsistency for $instance: file='$file_state', db='$db_state'"
            ((inconsistencies++))
        elif [ -z "$file_state" ] && [ -n "$db_state" ]; then
            log_warn "State missing from file for $instance: db='$db_state'"
        elif [ -n "$file_state" ] && [ -z "$db_state" ]; then
            log_warn "State missing from database for $instance: file='$file_state'"
        else
            log_verbose "State consistent for $instance: '$file_state'"
        fi
    done

    if [ "$inconsistencies" -gt 0 ]; then
        log_error "Found $inconsistencies state inconsistencies"
        return 1
    else
        log_info "All states are consistent between files and database"
        return 0
    fi
}

##
# Rollback state transition to previous state
#
# Arguments:
#   $1 - Instance code
#   $2 - Optional rollback reason
#
# Returns:
#   0 - Rollback successful
#   1 - Rollback failed
##
orch_db_rollback_state() {
    local instance_code="$1"
    local rollback_reason="${2:-Manual rollback}"
    local code_lower
    code_lower=$(lower "$instance_code")

    log_info "Rolling back last state transition for $instance_code..."

    if ! orch_db_check_connection; then
        log_error "Database not available for rollback"
        return 1
    fi

    # Get the last two states to determine rollback target
    local last_states
    last_states=$(orch_db_exec "SELECT state FROM deployment_states WHERE instance_code = '$code_lower' ORDER BY timestamp DESC LIMIT 2" 2>/dev/null)

    if [ -z "$last_states" ]; then
        log_error "No state history found for $instance_code"
        return 1
    fi

    # Parse the states (most recent first)
    local current_state previous_state
    current_state=$(echo "$last_states" | head -1)
    previous_state=$(echo "$last_states" | tail -1)

    if [ "$current_state" = "$previous_state" ]; then
        log_warn "No rollback needed - already at target state: $current_state"
        return 0
    fi

    # Execute rollback transaction
    local rollback_metadata="{\"rollback_from\": \"$current_state\", \"rollback_to\": \"$previous_state\", \"reason\": \"$rollback_reason\"}"
    local sql_rollback="BEGIN; INSERT INTO deployment_states (instance_code, state, previous_state, reason, metadata, created_by) VALUES ('$code_lower', '$previous_state', '$current_state', '$rollback_reason', '$rollback_metadata'::jsonb, 'rollback_system'); INSERT INTO state_transitions (instance_code, from_state, to_state, metadata, initiated_by) VALUES ('$code_lower', '$current_state', '$previous_state', '$rollback_metadata'::jsonb, 'rollback_system'); COMMIT;"

    if orch_db_exec "$sql_rollback" >/dev/null 2>&1; then
        log_info "✅ State rolled back: $instance_code ($current_state → $previous_state)"
        # Record rollback in errors table for audit
        orch_db_exec "INSERT INTO orchestration_errors (instance_code, error_code, severity, component, message, context, resolved) VALUES ('$code_lower', 'STATE_ROLLBACK', 2, 'orchestration-db', 'State manually rolled back', '$rollback_metadata', true)" >/dev/null 2>&1 || true
        return 0
    else
        log_error "Failed to rollback state for $instance_code"
        return 1
    fi
}

# Note: Database password not needed when using docker exec
# Connection happens via docker exec dive-hub-postgres, not TCP connection

# Log module load
if [ "$ORCH_DB_ENABLED" = "true" ]; then
    log_verbose "Orchestration database backend enabled (docker exec mode)"
fi
