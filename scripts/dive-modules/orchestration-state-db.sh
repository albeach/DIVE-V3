#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Orchestration State Management - Database Backend
# =============================================================================
# ADR-001: State Management Consolidation (2026-01-18)
#
# This module implements PostgreSQL-backed state management for the DIVE V3
# orchestration framework. Database is the sole source of truth (SSOT).
#
# Modes (controlled by environment variables):
#   - ORCH_DB_ONLY_MODE=true  (default) - Database-only, fail-fast
#   - ORCH_DB_DUAL_WRITE=true (deprecated) - Legacy dual-write mode
#
# CLI Commands:
#   ./scripts/orch-db-cli.sh migrate   - Migrate file state to database
#   ./scripts/orch-db-cli.sh validate  - Check state consistency
#   ./scripts/orch-db-cli.sh status    - Show deployment states
#
# See: docs/architecture/adr/ADR-001-state-management-consolidation.md
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

# NOTE: File-based state (deployment-state.sh) has been REMOVED as part of
# the database-only state management refactoring (ADR-001).
# All state is now stored in PostgreSQL. See:
#   - docs/architecture/adr/ADR-001-state-management-consolidation.md
#
# The .dive-state/ directory is no longer used.

# Load state recovery module for consistency validation
if [ -f "$(dirname "${BASH_SOURCE[0]}")/orchestration-state-recovery.sh" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/orchestration-state-recovery.sh"
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

# =============================================================================
# ADR-001: State Management Consolidation (2026-01-22)
# =============================================================================
# PostgreSQL is the SOLE state store. No file-based fallbacks.
#   - No file writes (eliminates dual-write complexity)
#   - Fail-fast if database unavailable (no silent degradation)
#   - No backward compatibility with file-based state
#
# BREAKING CHANGE: File-based state has been REMOVED
#   - .dive-state/ directory is no longer used
#   - deployment-state.sh is DEPRECATED and no longer loaded
#   - ORCH_DB_DUAL_WRITE is no longer supported
#
# This is a non-reversible change to establish clear SSOT.
# =============================================================================
ORCH_DB_ONLY_MODE="true"   # MANDATORY: Database-only mode (cannot be disabled)
# REMOVED: ORCH_DB_DUAL_WRITE - dual-write mode no longer supported
# REMOVED: ORCH_DB_SOURCE_OF_TRUTH - database is always SSOT

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
    # CRITICAL: Don't suppress stderr - we need to see actual errors
    # Note: psql outputs "BEGIN" and "COMMIT" on stdout which is normal
    docker exec dive-hub-postgres psql -U postgres -d orchestration -t -c "$query" 2>&1
    
    # Return psql exit code directly
    return $?
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
# STATE MACHINE VALIDATION
# =============================================================================
# Strict enforcement of valid state transitions
# Invalid transitions trigger automatic rollback
# =============================================================================

# Valid deployment states (only set if not already defined)
# PARTIAL: Containers deployed but configuration incomplete (realm missing, federation not setup)
[ -z "${VALID_STATES:-}" ] && readonly VALID_STATES="UNKNOWN INITIALIZING DEPLOYING CONFIGURING VERIFYING COMPLETE PARTIAL FAILED ROLLING_BACK CLEANUP"

# Valid state transitions (from -> to)
# Format: "FROM_STATE:TO_STATE1,TO_STATE2,..."
declare -A VALID_TRANSITIONS=(
    ["UNKNOWN"]="INITIALIZING,FAILED"
    ["INITIALIZING"]="DEPLOYING,FAILED,CLEANUP"
    ["DEPLOYING"]="CONFIGURING,PARTIAL,FAILED,ROLLING_BACK"
    ["CONFIGURING"]="VERIFYING,PARTIAL,FAILED,ROLLING_BACK"
    ["VERIFYING"]="COMPLETE,PARTIAL,FAILED,ROLLING_BACK"
    ["PARTIAL"]="CONFIGURING,FAILED,ROLLING_BACK,CLEANUP"
    ["COMPLETE"]="INITIALIZING,CLEANUP,FAILED"
    ["FAILED"]="INITIALIZING,CLEANUP,ROLLING_BACK"
    ["ROLLING_BACK"]="FAILED,CLEANUP,UNKNOWN"
    ["CLEANUP"]="UNKNOWN,INITIALIZING"
)

##
# Validate state transition
#
# Arguments:
#   $1 - From state
#   $2 - To state
#
# Returns:
#   0 - Valid transition
#   1 - Invalid transition
##
orch_validate_state_transition() {
    local from_state="$1"
    local to_state="$2"

    # Allow any transition to FAILED (emergency)
    if [ "$to_state" = "FAILED" ]; then
        return 0
    fi

    # Check if from_state has valid transitions defined
    local valid_targets="${VALID_TRANSITIONS[$from_state]:-}"
    if [ -z "$valid_targets" ]; then
        log_warn "Unknown from_state: $from_state (allowing transition)"
        return 0
    fi

    # Check if to_state is in the list of valid targets
    if [[ ",$valid_targets," =~ ",$to_state," ]]; then
        return 0
    fi

    log_error "Invalid state transition: $from_state → $to_state"
    log_error "Valid transitions from $from_state: $valid_targets"
    return 1
}

##
# Get valid transitions for a state
#
# Arguments:
#   $1 - Current state
#
# Returns:
#   Comma-separated list of valid target states
##
orch_get_valid_transitions() {
    local current_state="$1"
    echo "${VALID_TRANSITIONS[$current_state]:-FAILED}"
}

##
# Check if state is terminal
#
# Arguments:
#   $1 - State
#
# Returns:
#   0 - Is terminal state
#   1 - Not terminal state
##
orch_is_terminal_state() {
    local state="$1"
    case "$state" in
        COMPLETE|FAILED|CLEANUP)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

# =============================================================================
# STATE MANAGEMENT FUNCTIONS (Database Backend)
# =============================================================================

##
# Set deployment state with strict validation
#
# ADR-001 Implementation:
#   - ORCH_DB_ONLY_MODE=true: Database is sole state store (mandatory)
#   - Strict state machine enforcement
#   - Automatic rollback on invalid transitions
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

    # ==========================================================================
    # ADR-001: Database-Only Mode (ORCH_DB_ONLY_MODE=true)
    # ==========================================================================
    # This is the recommended mode. Database is the sole state store.
    # No file writes, no fallbacks, fail-fast on database errors.
    # ==========================================================================
    if [ "$ORCH_DB_ONLY_MODE" = "true" ]; then
        # CRITICAL FIX (2026-01-18): Allow Hub (USA) to deploy without database
        # Hub deployment CREATES the orchestration database, so it can't depend on it
        # Spokes and other instances require the database to exist
        local code_upper=$(upper "$instance_code")
        if [ "$code_upper" != "USA" ]; then
            # Require database connection for non-Hub instances - fail fast if unavailable
            if ! orch_db_check_connection; then
                log_error "FATAL: Orchestration database unavailable (ORCH_DB_ONLY_MODE=true)"
                log_error "  → Deployment cannot proceed without database"
                log_error "  → Ensure Hub is running: ./dive hub up"
                return 1
            fi
        else
            # Hub deployment - database may not exist yet (will be created)
            # Try to connect but don't fail if unavailable
            if ! orch_db_check_connection; then
                log_verbose "Orchestration database not yet available (Hub will create it)"
                # Skip database write, return success
                return 0
            fi
        fi

        # Get previous state from database
        local prev_state
        prev_state=$(orch_db_exec "SELECT state FROM deployment_states WHERE instance_code='$code_lower' ORDER BY timestamp DESC LIMIT 1" 2>/dev/null | xargs)
        prev_state="${prev_state:-UNKNOWN}"

        # ==========================================================================
        # STATE MACHINE VALIDATION
        # ==========================================================================
        # Validate state transition before proceeding
        if ! orch_validate_state_transition "$prev_state" "$new_state"; then
            local valid_targets
            valid_targets=$(orch_get_valid_transitions "$prev_state")
            log_error "State transition blocked: $prev_state → $new_state"
            log_error "Valid transitions from $prev_state: $valid_targets"

            # Record invalid transition attempt
            orch_db_exec "
INSERT INTO orchestration_errors (instance_code, error_code, severity, component, message, remediation)
VALUES ('$code_lower', 'INVALID_STATE_TRANSITION', 2, 'state-machine',
        'Invalid transition: $prev_state → $new_state',
        'Use one of: $valid_targets');" >/dev/null 2>&1 || true

            return 1
        fi

        # Prepare SQL-safe values
        local escaped_reason="${reason//\'/\'\'}"
        local metadata_sql="NULL"
        if [ -n "$metadata" ] && [ "$metadata" != "null" ]; then
            if echo "$metadata" | jq empty >/dev/null 2>&1; then
                local escaped_json="${metadata//\'/\'\'}"
                metadata_sql="'$escaped_json'::jsonb"
            fi
        fi

        # Execute atomic transaction
        local sql_transaction="BEGIN;
INSERT INTO deployment_states (instance_code, state, previous_state, reason, metadata, created_by)
VALUES ('$code_lower', '$new_state', '$prev_state', '$escaped_reason', $metadata_sql, 'system');

INSERT INTO state_transitions (instance_code, from_state, to_state, metadata, initiated_by)
VALUES ('$code_lower', '$prev_state', '$new_state', $metadata_sql, 'system');
COMMIT;"

        local sql_result
        sql_result=$(orch_db_exec "$sql_transaction" 2>&1)
        local exit_code=$?

        # psql outputs "BEGIN" and "COMMIT" which are normal, not errors
        # Only check for actual ERROR messages from PostgreSQL
        if [ $exit_code -eq 0 ] && [[ ! "$sql_result" =~ ERROR ]]; then
            log_verbose "✓ State persisted: $instance_code → $new_state (DB-only)"
            # Record metric (non-blocking)
            orch_db_exec "INSERT INTO orchestration_metrics (instance_code, metric_name, metric_value) VALUES ('$code_lower', 'state_transition_success', 1)" >/dev/null 2>&1 || true
            return 0
        elif [ $exit_code -eq 0 ]; then
            # Exit code 0 but output contains text - check if it's just BEGIN/COMMIT
            if [[ "$sql_result" =~ ^(BEGIN|COMMIT|INSERT|SELECT)[[:space:]]*$ ]]; then
                # This is normal psql output, not an error
                log_verbose "✓ State persisted: $instance_code → $new_state (DB-only)"
                return 0
            else
                # Has other content - might be an error
                log_error "Database transaction failed: $instance_code → $new_state"
                log_error "DB Error: $sql_result"
                return 1
            fi
        else
            log_error "Database transaction failed: $instance_code → $new_state (exit code: $exit_code)"
            [ -n "$sql_result" ] && log_verbose "DB Output: $sql_result"
            return 1
        fi
    fi

    # NOTE: ORCH_DB_ONLY_MODE is always true - the above block is always executed
    # The code below is unreachable but kept as documentation of what was removed:
    #
    # REMOVED (2026-01-22):
    #   - ORCH_DB_DUAL_WRITE mode: No longer writes to both DB and files
    #   - File-only fallback: No longer writes state to .dive-state/ files
    #   - set_deployment_state_enhanced: File-based function no longer called
    #
    # All state is now in PostgreSQL only. Fail-fast if database unavailable.
}

##
# Get current deployment state
#
# ADR-001 Implementation:
#   - ORCH_DB_ONLY_MODE=true: Database is sole source (fail-fast if unavailable)
#   - ORCH_DB_SOURCE_OF_TRUTH=db: Legacy SSOT mode (deprecated)
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   State name on stdout (UNKNOWN if no state exists)
#   Returns 1 if database unavailable in DB-only mode
##
orch_db_get_state() {
    local instance_code="$1"
    local code_lower
    code_lower=$(lower "$instance_code")

    # ==========================================================================
    # ADR-001: Database-Only Mode (MANDATORY)
    # ==========================================================================
    # CRITICAL FIX: Allow Hub to read state without database during initial deployment
    # Hub deployment CREATES the orchestration database, so it can't depend on it
    local code_upper=$(upper "$instance_code")
    if [ "$code_upper" != "USA" ]; then
        # Non-Hub instances require database
        if ! orch_db_check_connection; then
            log_error "FATAL: Cannot read state - database unavailable"
            log_error "  → Ensure Hub is running: ./dive hub up"
            echo "ERROR"
            return 1
        fi
    else
        # Hub - database may not exist yet during initial deployment
        if ! orch_db_check_connection; then
            log_verbose "Orchestration database not available (returning UNKNOWN state)"
            echo "UNKNOWN"
            return 0
        fi
    fi

    local state
    state=$(orch_db_exec "SELECT state FROM deployment_states WHERE instance_code='$code_lower' ORDER BY timestamp DESC LIMIT 1" 2>/dev/null | xargs)

    if [ -n "$state" ] && [ "$state" != "" ]; then
        echo "$state"
    else
        echo "UNKNOWN"
    fi
    return 0

    # NOTE: File-based fallback has been REMOVED (2026-01-22)
    # All state is now in PostgreSQL only. No .dive-state/ files are used.
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
# DEPLOYMENT LOCK MANAGEMENT (GAP-001 Fix - PostgreSQL Advisory Locks)
# =============================================================================

##
# Acquire PostgreSQL advisory lock for deployment
#
# Arguments:
#   $1 - Instance code
#   $2 - Timeout seconds (optional, 0 = try once and return)
#
# Returns:
#   0 - Lock acquired
#   1 - Lock not available
##
orch_db_acquire_lock() {
    local instance_code="$1"
    local timeout="${2:-30}"
    local code_lower
    code_lower=$(lower "$instance_code")

    if ! orch_db_check_connection; then
        log_verbose "Database not available for advisory lock"
        return 1
    fi

    # Generate unique lock ID from instance code (hash to integer)
    local lock_id=$(echo -n "deployment_${code_lower}" | cksum | cut -d' ' -f1)

    log_verbose "Attempting PostgreSQL advisory lock for $instance_code (lock_id: $lock_id, timeout: ${timeout}s)..."

    # Try to acquire lock
    if [ "$timeout" -eq 0 ]; then
        # Non-blocking try
        local acquired=$(orch_db_exec "SELECT pg_try_advisory_lock($lock_id);" 2>/dev/null | xargs)
        if [ "$acquired" = "t" ]; then
            log_verbose "PostgreSQL advisory lock acquired for $instance_code"
            # Record lock acquisition
            orch_db_exec "INSERT INTO deployment_locks (instance_code, lock_id, acquired_at, acquired_by) VALUES ('$code_lower', $lock_id, NOW(), '${USER:-system}')" >/dev/null 2>&1 || true
            return 0
        else
            log_verbose "PostgreSQL advisory lock not available for $instance_code"
            return 1
        fi
    else
        # Blocking with timeout (poll-based since pg_advisory_lock doesn't support timeout)
        local start_time=$(date +%s)
        local elapsed=0

        while [ $elapsed -lt "$timeout" ]; do
            local acquired=$(orch_db_exec "SELECT pg_try_advisory_lock($lock_id);" 2>/dev/null | xargs)
            if [ "$acquired" = "t" ]; then
                log_success "PostgreSQL advisory lock acquired for $instance_code (after ${elapsed}s)"
                # Record lock acquisition
                orch_db_exec "INSERT INTO deployment_locks (instance_code, lock_id, acquired_at, acquired_by) VALUES ('$code_lower', $lock_id, NOW(), '${USER:-system}')" >/dev/null 2>&1 || true
                return 0
            fi

            sleep 1
            elapsed=$(($(date +%s) - start_time))
        done

        log_error "Failed to acquire PostgreSQL advisory lock for $instance_code (timeout)"
        return 1
    fi
}

##
# Release PostgreSQL advisory lock for deployment
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Lock released
#   1 - Lock was not held
##
orch_db_release_lock() {
    local instance_code="$1"
    local code_lower
    code_lower=$(lower "$instance_code")

    if ! orch_db_check_connection; then
        return 0  # Non-blocking
    fi

    # Generate same lock ID
    local lock_id=$(echo -n "deployment_${code_lower}" | cksum | cut -d' ' -f1)

    log_verbose "Releasing PostgreSQL advisory lock for $instance_code (lock_id: $lock_id)..."

    # Release lock
    local released=$(orch_db_exec "SELECT pg_advisory_unlock($lock_id);" 2>/dev/null | xargs)

    if [ "$released" = "t" ]; then
        log_verbose "PostgreSQL advisory lock released for $instance_code"
        # Record lock release
        orch_db_exec "UPDATE deployment_locks SET released_at = NOW() WHERE instance_code = '$code_lower' AND lock_id = $lock_id AND released_at IS NULL" >/dev/null 2>&1 || true
        return 0
    else
        log_verbose "PostgreSQL advisory lock was not held for $instance_code"
        return 1
    fi
}

##
# Check if deployment lock is held for instance
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Lock is held
#   1 - Lock is not held
##
orch_db_check_lock_status() {
    local instance_code="$1"
    local code_lower
    code_lower=$(lower "$instance_code")

    if ! orch_db_check_connection; then
        return 1
    fi

    # Check if lock is held in database
    local lock_count=$(orch_db_exec "
        SELECT COUNT(*)
        FROM deployment_locks
        WHERE instance_code = '$code_lower'
        AND released_at IS NULL
    " 2>/dev/null | xargs || echo "0")

    [ "$lock_count" -gt 0 ]
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
        local code_lower=$(lower "$instance_code")
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
        local start_time=$(date +%s)
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
        docker exec dive-hub-postgres psql -U postgres -d orchestration -c \
            "SELECT pg_advisory_unlock($schema_lock_id);" >/dev/null 2>&1 || true
        return 0
    fi

    # ==========================================================================
    # Step 4: Apply migration (idempotent SQL with IF NOT EXISTS)
    # ==========================================================================
    log_verbose "Step 4: Applying schema migration ($existing_tables/8 tables exist)..."
    local migration_output
    local migration_exit_code=0

    # Copy migration file to container and execute
    docker cp "$migration_file" dive-hub-postgres:/tmp/migration.sql 2>/dev/null || {
        log_error "Failed to copy migration file to container"
        docker exec dive-hub-postgres psql -U postgres -d orchestration -c \
            "SELECT pg_advisory_unlock($schema_lock_id);" >/dev/null 2>&1 || true
        return 1
    }

    migration_output=$(docker exec dive-hub-postgres psql -U postgres -d orchestration -f /tmp/migration.sql 2>&1) || migration_exit_code=$?

    # Cleanup temp file
    docker exec dive-hub-postgres rm -f /tmp/migration.sql 2>/dev/null || true

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
    docker exec dive-hub-postgres psql -U postgres -d orchestration -c \
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
    if ! docker exec dive-hub-postgres pg_isready -U postgres -d orchestration >/dev/null 2>&1; then
        log_verbose "Database not ready, waiting..."
        local retry_count=0
        local max_retries=10
        while [ $retry_count -lt $max_retries ]; do
            sleep 1
            ((retry_count++))
            if docker exec dive-hub-postgres pg_isready -U postgres -d orchestration >/dev/null 2>&1; then
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
        docker exec dive-hub-postgres psql -U postgres -c "CREATE DATABASE orchestration;" >/dev/null 2>&1 || {
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
