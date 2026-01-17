#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Federation State Database Module
# =============================================================================
# Provides database-driven federation state management
# Part of Orchestration Architecture Review Phase 3
# =============================================================================
# Features:
# - Create/update/delete federation links in PostgreSQL
# - Record federation health checks
# - Query federation status
# - Support for retry and auto-recovery
# =============================================================================
# Version: 1.0.0
# Date: 2026-01-16
# =============================================================================

# Prevent multiple sourcing (but allow reload if functions not available)
if [ -n "$FEDERATION_STATE_DB_LOADED" ]; then
    if type fed_db_upsert_link &>/dev/null; then
        return 0
    fi
    unset FEDERATION_STATE_DB_LOADED
fi
export FEDERATION_STATE_DB_LOADED=1

# =============================================================================
# DEPENDENCIES
# =============================================================================

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load orchestration state database module for orch_db_exec
if [ -z "$ORCHESTRATION_STATE_DB_LOADED" ]; then
    if [ -f "$(dirname "${BASH_SOURCE[0]}")/orchestration-state-db.sh" ]; then
        source "$(dirname "${BASH_SOURCE[0]}")/orchestration-state-db.sh"
    fi
fi

# =============================================================================
# CONFIGURATION
# =============================================================================

# Default retry configuration
FED_DB_MAX_RETRIES="${FED_DB_MAX_RETRIES:-3}"
FED_DB_RETRY_DELAY="${FED_DB_RETRY_DELAY:-5}"

# =============================================================================
# SCHEMA INITIALIZATION
# =============================================================================

##
# Initialize federation database schema
# Idempotent - safe to run multiple times
#
# Returns:
#   0 - Success
#   1 - Database not available or schema creation failed
##
fed_db_init_schema() {
    log_info "Initializing federation database schema..."

    if ! orch_db_check_connection; then
        log_error "Database not available for federation schema initialization"
        return 1
    fi

    local schema_file="${DIVE_ROOT}/scripts/sql/002_federation_schema.sql"

    if [ ! -f "$schema_file" ]; then
        log_error "Federation schema file not found: $schema_file"
        return 1
    fi

    # Execute schema file
    if docker exec -i dive-hub-postgres psql -U postgres -d orchestration < "$schema_file" >/dev/null 2>&1; then
        log_success "Federation schema initialized"
        return 0
    else
        log_error "Failed to initialize federation schema"
        return 1
    fi
}

##
# Check if federation schema exists
#
# Returns:
#   0 - Schema exists
#   1 - Schema missing or database unavailable
##
fed_db_schema_exists() {
    if ! orch_db_check_connection; then
        return 1
    fi

    local table_count
    table_count=$(orch_db_exec "SELECT COUNT(*) FROM information_schema.tables WHERE table_name IN ('federation_links', 'federation_health', 'federation_operations')" 2>/dev/null | xargs)

    [ "$table_count" -eq 3 ]
}

# =============================================================================
# FEDERATION LINK OPERATIONS
# =============================================================================

##
# Create or update a federation link
#
# Arguments:
#   $1 - Source instance code (e.g., 'usa', 'svk')
#   $2 - Target instance code
#   $3 - Direction ('HUB_TO_SPOKE' or 'SPOKE_TO_HUB')
#   $4 - IdP alias (e.g., 'svk-idp', 'usa-idp')
#   $5 - Status (default: 'PENDING')
#   $6 - Client ID (optional)
#   $7 - Metadata JSON (optional)
#
# Returns:
#   0 - Success
#   1 - Failure
##
fed_db_upsert_link() {
    local source_code="$1"
    local target_code="$2"
    local direction="$3"
    local idp_alias="$4"
    local status="${5:-PENDING}"
    local client_id="${6:-}"
    local metadata="${7:-}"

    # Normalize to lowercase
    source_code=$(lower "$source_code")
    target_code=$(lower "$target_code")

    if ! orch_db_check_connection; then
        log_verbose "Database not available - federation link not persisted"
        return 1
    fi

    # Build metadata JSON
    local metadata_sql="NULL"
    if [ -n "$metadata" ] && [ "$metadata" != "null" ]; then
        if echo "$metadata" | jq empty >/dev/null 2>&1; then
            metadata_sql="'${metadata//\'/\'\'}'::jsonb"
        fi
    fi

    # Build client_id clause
    local client_id_sql="NULL"
    if [ -n "$client_id" ]; then
        client_id_sql="'$client_id'"
    fi

    local sql="
INSERT INTO federation_links (source_code, target_code, direction, idp_alias, status, client_id, metadata)
VALUES ('$source_code', '$target_code', '$direction', '$idp_alias', '$status', $client_id_sql, $metadata_sql)
ON CONFLICT (source_code, target_code, direction)
DO UPDATE SET
    idp_alias = EXCLUDED.idp_alias,
    status = EXCLUDED.status,
    client_id = COALESCE(EXCLUDED.client_id, federation_links.client_id),
    metadata = COALESCE(EXCLUDED.metadata, federation_links.metadata),
    updated_at = NOW()
RETURNING id;
"

    local result
    result=$(orch_db_exec "$sql" 2>/dev/null)

    if [ -n "$result" ]; then
        log_verbose "Federation link upserted: $source_code -> $target_code ($direction)"
        return 0
    else
        log_error "Failed to upsert federation link: $source_code -> $target_code"
        return 1
    fi
}

##
# Update federation link status
#
# Arguments:
#   $1 - Source instance code
#   $2 - Target instance code
#   $3 - Direction
#   $4 - New status
#   $5 - Error message (optional)
#   $6 - Error code (optional)
#
# Returns:
#   0 - Success
#   1 - Failure
##
fed_db_update_status() {
    local source_code="$1"
    local target_code="$2"
    local direction="$3"
    local status="$4"
    local error_message="${5:-}"
    local error_code="${6:-}"

    # Normalize to lowercase
    source_code=$(lower "$source_code")
    target_code=$(lower "$target_code")

    if ! orch_db_check_connection; then
        return 1
    fi

    # Escape error message
    local escaped_error="${error_message//\'/\'\'}"

    # Build update clauses
    local error_clause=""
    if [ -n "$error_message" ]; then
        error_clause=", error_message = '$escaped_error'"
    fi
    if [ -n "$error_code" ]; then
        error_clause="$error_clause, last_error_code = '$error_code'"
    fi

    # Update retry count based on status
    local retry_clause=""
    if [ "$status" = "FAILED" ]; then
        retry_clause=", retry_count = retry_count + 1"
    elif [ "$status" = "ACTIVE" ]; then
        retry_clause=", retry_count = 0, last_verified_at = NOW()"
    fi

    local sql="
UPDATE federation_links
SET status = '$status', updated_at = NOW() $error_clause $retry_clause
WHERE source_code = '$source_code'
  AND target_code = '$target_code'
  AND direction = '$direction';
"

    if orch_db_exec "$sql" >/dev/null 2>&1; then
        log_verbose "Federation link status updated: $source_code -> $target_code = $status"
        return 0
    else
        log_error "Failed to update federation link status"
        return 1
    fi
}

##
# Get federation link details
#
# Arguments:
#   $1 - Source instance code
#   $2 - Target instance code
#   $3 - Direction
#
# Returns:
#   Link details on stdout (pipe-separated: id|source|target|direction|idp_alias|status|retry_count)
##
fed_db_get_link() {
    local source_code="$1"
    local target_code="$2"
    local direction="$3"

    source_code=$(lower "$source_code")
    target_code=$(lower "$target_code")

    if ! orch_db_check_connection; then
        return 1
    fi

    orch_db_exec "
SELECT id, source_code, target_code, direction, idp_alias, status, retry_count, last_verified_at, error_message
FROM federation_links
WHERE source_code = '$source_code'
  AND target_code = '$target_code'
  AND direction = '$direction';
" 2>/dev/null
}

##
# Get federation link status only
#
# Arguments:
#   $1 - Source instance code
#   $2 - Target instance code
#   $3 - Direction
#
# Returns:
#   Status string on stdout
##
fed_db_get_link_status() {
    local source_code="$1"
    local target_code="$2"
    local direction="$3"

    source_code=$(lower "$source_code")
    target_code=$(lower "$target_code")

    if ! orch_db_check_connection; then
        echo "UNKNOWN"
        return 1
    fi

    local status
    status=$(orch_db_exec "
SELECT status FROM federation_links
WHERE source_code = '$source_code'
  AND target_code = '$target_code'
  AND direction = '$direction';
" 2>/dev/null | xargs)

    echo "${status:-UNKNOWN}"
}

##
# List all federation links for an instance
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   List of links on stdout
##
fed_db_list_links() {
    local instance_code="$1"
    instance_code=$(lower "$instance_code")

    if ! orch_db_check_connection; then
        return 1
    fi

    orch_db_exec "
SELECT source_code, target_code, direction, idp_alias, status, last_verified_at
FROM federation_links
WHERE source_code = '$instance_code' OR target_code = '$instance_code'
ORDER BY direction, target_code;
" 2>/dev/null
}

##
# Get failed links needing retry
#
# Arguments:
#   $1 - Maximum retry count (default: 3)
#
# Returns:
#   List of failed links on stdout
##
fed_db_get_failed_links() {
    local max_retries="${1:-$FED_DB_MAX_RETRIES}"

    if ! orch_db_check_connection; then
        return 1
    fi

    orch_db_exec "
SELECT source_code, target_code, direction, idp_alias, retry_count, last_error_code, error_message
FROM federation_links
WHERE status = 'FAILED' AND retry_count < $max_retries
ORDER BY updated_at ASC;
" 2>/dev/null
}

##
# Delete federation link
#
# Arguments:
#   $1 - Source instance code
#   $2 - Target instance code
#   $3 - Direction
#
# Returns:
#   0 - Success
#   1 - Failure
##
fed_db_delete_link() {
    local source_code="$1"
    local target_code="$2"
    local direction="$3"

    source_code=$(lower "$source_code")
    target_code=$(lower "$target_code")

    if ! orch_db_check_connection; then
        return 1
    fi

    if orch_db_exec "
DELETE FROM federation_links
WHERE source_code = '$source_code'
  AND target_code = '$target_code'
  AND direction = '$direction';
" >/dev/null 2>&1; then
        log_info "Federation link deleted: $source_code -> $target_code ($direction)"
        return 0
    else
        return 1
    fi
}

# =============================================================================
# HEALTH CHECK OPERATIONS
# =============================================================================

##
# Record a federation health check result
#
# Arguments:
#   $1 - Source instance code
#   $2 - Target instance code
#   $3 - Direction
#   $4 - Source IdP exists (true/false)
#   $5 - Source IdP enabled (true/false)
#   $6 - Target IdP exists (true/false)
#   $7 - Target IdP enabled (true/false)
#   $8 - SSO test passed (true/false/null)
#   $9 - SSO latency ms (optional)
#   $10 - Error message (optional)
#
# Returns:
#   0 - Success
#   1 - Failure
##
fed_db_record_health() {
    local source_code="$1"
    local target_code="$2"
    local direction="$3"
    local src_idp_exists="$4"
    local src_idp_enabled="$5"
    local tgt_idp_exists="$6"
    local tgt_idp_enabled="$7"
    local sso_passed="${8:-}"
    local sso_latency="${9:-}"
    local error_message="${10:-}"

    source_code=$(lower "$source_code")
    target_code=$(lower "$target_code")

    if ! orch_db_check_connection; then
        return 1
    fi

    # Convert bash booleans to SQL booleans
    src_idp_exists=$([ "$src_idp_exists" = "true" ] && echo "TRUE" || echo "FALSE")
    src_idp_enabled=$([ "$src_idp_enabled" = "true" ] && echo "TRUE" || echo "FALSE")
    tgt_idp_exists=$([ "$tgt_idp_exists" = "true" ] && echo "TRUE" || echo "FALSE")
    tgt_idp_enabled=$([ "$tgt_idp_enabled" = "true" ] && echo "TRUE" || echo "FALSE")

    # Handle SSO test result
    local sso_passed_sql="NULL"
    local sso_attempted="FALSE"
    if [ -n "$sso_passed" ]; then
        sso_attempted="TRUE"
        sso_passed_sql=$([ "$sso_passed" = "true" ] && echo "TRUE" || echo "FALSE")
    fi

    # Handle latency
    local latency_sql="NULL"
    if [ -n "$sso_latency" ]; then
        latency_sql="$sso_latency"
    fi

    # Escape error message
    local escaped_error="${error_message//\'/\'\'}"
    local error_sql="NULL"
    if [ -n "$error_message" ]; then
        error_sql="'$escaped_error'"
    fi

    local sql="
INSERT INTO federation_health (
    source_code, target_code, direction,
    source_idp_exists, source_idp_enabled,
    target_idp_exists, target_idp_enabled,
    sso_test_attempted, sso_test_passed, sso_latency_ms,
    error_message
) VALUES (
    '$source_code', '$target_code', '$direction',
    $src_idp_exists, $src_idp_enabled,
    $tgt_idp_exists, $tgt_idp_enabled,
    $sso_attempted, $sso_passed_sql, $latency_sql,
    $error_sql
);
"

    if orch_db_exec "$sql" >/dev/null 2>&1; then
        # Update link status if SSO passed
        if [ "$sso_passed" = "true" ]; then
            fed_db_update_status "$source_code" "$target_code" "$direction" "ACTIVE"
        fi
        log_verbose "Health check recorded: $source_code -> $target_code"
        return 0
    else
        return 1
    fi
}

##
# Get latest health check for a federation link
#
# Arguments:
#   $1 - Source instance code
#   $2 - Target instance code
#   $3 - Direction
#
# Returns:
#   Health check details on stdout
##
fed_db_get_latest_health() {
    local source_code="$1"
    local target_code="$2"
    local direction="$3"

    source_code=$(lower "$source_code")
    target_code=$(lower "$target_code")

    if ! orch_db_check_connection; then
        return 1
    fi

    orch_db_exec "
SELECT check_timestamp, source_idp_exists, source_idp_enabled,
       target_idp_exists, target_idp_enabled,
       sso_test_passed, sso_latency_ms, error_message
FROM federation_health
WHERE source_code = '$source_code'
  AND target_code = '$target_code'
  AND direction = '$direction'
ORDER BY check_timestamp DESC
LIMIT 1;
" 2>/dev/null
}

# =============================================================================
# QUERY FUNCTIONS
# =============================================================================

##
# Get federation status summary for an instance
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   JSON status summary on stdout
##
fed_db_get_instance_status() {
    local instance_code="$1"
    instance_code=$(lower "$instance_code")

    if ! orch_db_check_connection; then
        echo '{"error": "database_unavailable"}'
        return 1
    fi

    # Get all links for this instance
    local hub_to_spoke_status spoke_to_hub_status

    hub_to_spoke_status=$(orch_db_exec "
SELECT status FROM federation_links
WHERE source_code = 'usa' AND target_code = '$instance_code' AND direction = 'HUB_TO_SPOKE'
" 2>/dev/null | xargs)

    spoke_to_hub_status=$(orch_db_exec "
SELECT status FROM federation_links
WHERE source_code = '$instance_code' AND target_code = 'usa' AND direction = 'SPOKE_TO_HUB'
" 2>/dev/null | xargs)

    # Determine overall status
    local bidirectional="false"
    local overall_status="UNKNOWN"

    if [ "$hub_to_spoke_status" = "ACTIVE" ] && [ "$spoke_to_hub_status" = "ACTIVE" ]; then
        bidirectional="true"
        overall_status="ACTIVE"
    elif [ "$hub_to_spoke_status" = "ACTIVE" ] || [ "$spoke_to_hub_status" = "ACTIVE" ]; then
        overall_status="PARTIAL"
    elif [ "$hub_to_spoke_status" = "FAILED" ] || [ "$spoke_to_hub_status" = "FAILED" ]; then
        overall_status="FAILED"
    elif [ "$hub_to_spoke_status" = "PENDING" ] || [ "$spoke_to_hub_status" = "PENDING" ]; then
        overall_status="PENDING"
    fi

    cat << EOF
{
    "instance": "$instance_code",
    "overall_status": "$overall_status",
    "bidirectional": $bidirectional,
    "hub_to_spoke": "${hub_to_spoke_status:-NONE}",
    "spoke_to_hub": "${spoke_to_hub_status:-NONE}",
    "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
}

##
# Get all federation links with status
#
# Returns:
#   List of all links on stdout
##
fed_db_list_all_links() {
    if ! orch_db_check_connection; then
        return 1
    fi

    orch_db_exec "
SELECT source_code, target_code, direction, idp_alias, status,
       retry_count, last_verified_at, error_message
FROM federation_links
ORDER BY source_code, target_code, direction;
" 2>/dev/null
}

##
# Get federation status using the view
#
# Arguments:
#   $1 - Instance code (optional, all if not provided)
#
# Returns:
#   Federation status from view
##
fed_db_query_status_view() {
    local instance_code="${1:-}"

    if ! orch_db_check_connection; then
        return 1
    fi

    local where_clause=""
    if [ -n "$instance_code" ]; then
        instance_code=$(lower "$instance_code")
        where_clause="WHERE source_code = '$instance_code' OR target_code = '$instance_code'"
    fi

    orch_db_exec "
SELECT * FROM federation_status
$where_clause
ORDER BY source_code, target_code;
" 2>/dev/null
}

##
# Get bidirectional federation pairs
#
# Returns:
#   List of spoke codes with their bidirectional status
##
fed_db_get_pairs() {
    if ! orch_db_check_connection; then
        return 1
    fi

    orch_db_exec "SELECT * FROM federation_pairs ORDER BY spoke_code;" 2>/dev/null
}

# =============================================================================
# RECOVERY OPERATIONS
# =============================================================================

##
# Mark a failed link for retry
#
# Arguments:
#   $1 - Source instance code
#   $2 - Target instance code
#   $3 - Direction
#
# Returns:
#   0 - Success
#   1 - Failure
##
fed_db_mark_for_retry() {
    local source_code="$1"
    local target_code="$2"
    local direction="$3"

    source_code=$(lower "$source_code")
    target_code=$(lower "$target_code")

    if ! orch_db_check_connection; then
        return 1
    fi

    # Reset status to PENDING for retry
    if orch_db_exec "
UPDATE federation_links
SET status = 'PENDING', error_message = NULL, updated_at = NOW()
WHERE source_code = '$source_code'
  AND target_code = '$target_code'
  AND direction = '$direction'
  AND status = 'FAILED';
" >/dev/null 2>&1; then
        log_info "Federation link marked for retry: $source_code -> $target_code"
        return 0
    else
        return 1
    fi
}

##
# Reset all failed links for an instance
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Success
#   1 - Failure
##
fed_db_reset_failed() {
    local instance_code="$1"
    instance_code=$(lower "$instance_code")

    if ! orch_db_check_connection; then
        return 1
    fi

    local count
    count=$(orch_db_exec "
UPDATE federation_links
SET status = 'PENDING', retry_count = 0, error_message = NULL, updated_at = NOW()
WHERE (source_code = '$instance_code' OR target_code = '$instance_code')
  AND status = 'FAILED'
RETURNING id;
" 2>/dev/null | wc -l | xargs)

    log_info "Reset $count failed federation links for $instance_code"
    return 0
}

# =============================================================================
# OPERATION LOGGING
# =============================================================================

##
# Record a federation operation (audit trail)
#
# Arguments:
#   $1 - Source instance code
#   $2 - Target instance code
#   $3 - Direction
#   $4 - Operation type (CREATE_IDP, CREATE_CLIENT, VERIFY, etc.)
#   $5 - Operation status (PENDING, IN_PROGRESS, COMPLETED, FAILED)
#   $6 - Triggered by (deployment, manual, recovery, etc.)
#   $7 - Error message (optional)
#   $8 - Context JSON (optional)
#
# Returns:
#   Operation ID on stdout
##
fed_db_record_operation() {
    local source_code="$1"
    local target_code="$2"
    local direction="$3"
    local op_type="$4"
    local op_status="$5"
    local triggered_by="${6:-system}"
    local error_message="${7:-}"
    local context="${8:-}"

    source_code=$(lower "$source_code")
    target_code=$(lower "$target_code")

    if ! orch_db_check_connection; then
        return 1
    fi

    # Escape strings
    local escaped_error="${error_message//\'/\'\'}"

    # Handle context JSON
    local context_sql="NULL"
    if [ -n "$context" ] && [ "$context" != "null" ]; then
        if echo "$context" | jq empty >/dev/null 2>&1; then
            context_sql="'${context//\'/\'\'}'::jsonb"
        fi
    fi

    # Handle completed_at based on status
    local completed_clause=""
    if [ "$op_status" = "COMPLETED" ] || [ "$op_status" = "FAILED" ]; then
        completed_clause=", completed_at = NOW()"
    fi

    local sql="
INSERT INTO federation_operations (
    source_code, target_code, direction, operation_type, operation_status,
    triggered_by, error_message, context
) VALUES (
    '$source_code', '$target_code', '$direction', '$op_type', '$op_status',
    '$triggered_by', '$escaped_error', $context_sql
)
RETURNING operation_id;
"

    orch_db_exec "$sql" 2>/dev/null | xargs
}

# =============================================================================
# CLEANUP OPERATIONS
# =============================================================================

##
# Clean up old health check records
#
# Arguments:
#   $1 - Days to retain (default: 30)
#
# Returns:
#   Number of records deleted
##
fed_db_cleanup_health_history() {
    local days="${1:-30}"

    if ! orch_db_check_connection; then
        return 1
    fi

    local count
    count=$(orch_db_exec "
DELETE FROM federation_health
WHERE check_timestamp < NOW() - INTERVAL '$days days'
RETURNING id;
" 2>/dev/null | wc -l | xargs)

    log_info "Cleaned up $count old health check records (older than $days days)"
    echo "$count"
}

##
# Clean up old operation records
#
# Arguments:
#   $1 - Days to retain (default: 90)
#
# Returns:
#   Number of records deleted
##
fed_db_cleanup_operations() {
    local days="${1:-90}"

    if ! orch_db_check_connection; then
        return 1
    fi

    local count
    count=$(orch_db_exec "
DELETE FROM federation_operations
WHERE started_at < NOW() - INTERVAL '$days days'
  AND operation_status IN ('COMPLETED', 'FAILED', 'CANCELLED')
RETURNING id;
" 2>/dev/null | wc -l | xargs)

    log_info "Cleaned up $count old operation records (older than $days days)"
    echo "$count"
}

# =============================================================================
# MODULE INITIALIZATION
# =============================================================================

log_verbose "Federation state database module loaded"
