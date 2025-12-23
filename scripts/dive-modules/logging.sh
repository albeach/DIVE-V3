#!/usr/bin/env bash
# =============================================================================
# Structured JSON Logging
# =============================================================================
# Centralized structured logging for federation operations
# =============================================================================

# Log directory
LOG_DIR="${DIVE_ROOT}/logs"
mkdir -p "$LOG_DIR"

##
# Write structured JSON log entry
#
# Arguments:
#   $1 - Operation name
#   $2 - Status (success|failure|info|warn|error)
#   $3 - Optional message
#   $4 - Optional JSON data (as string)
#   $5 - Optional duration in seconds
##
log_json() {
    local operation="$1"
    local status="$2"
    local message="${3:-}"
    local data="${4:-{}}"
    local duration="${5:-}"

    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local log_file="${LOG_DIR}/federation-$(date +%Y%m%d).log"

    local json_entry
    json_entry=$(cat <<EOF
{
  "timestamp": "$timestamp",
  "operation": "$operation",
  "status": "$status",
  "message": "$message",
  "data": $data$( [ -n "$duration" ] && echo ", \"duration_seconds\": $duration" || echo "" )
}
EOF
)

    echo "$json_entry" >> "$log_file"
}

##
# Log operation start
#
# Arguments:
#   $1 - Operation name
#   $2 - Optional context data (JSON string)
##
log_operation_start() {
    local operation="$1"
    local context="${2:-{}}"
    log_json "$operation" "info" "Operation started" "$context"
}

##
# Log operation success
#
# Arguments:
#   $1 - Operation name
#   $2 - Optional message
#   $3 - Optional result data (JSON string)
#   $4 - Optional duration in seconds
##
log_operation_success() {
    local operation="$1"
    local message="${2:-Operation completed successfully}"
    local result="${3:-{}}"
    local duration="${4:-}"
    log_json "$operation" "success" "$message" "$result" "$duration"
}

##
# Log operation failure
#
# Arguments:
#   $1 - Operation name
#   $2 - Error message
#   $3 - Optional error details (JSON string)
#   $4 - Optional duration in seconds
##
log_operation_failure() {
    local operation="$1"
    local message="$2"
    local details="${3:-{}}"
    local duration="${4:-}"
    log_json "$operation" "failure" "$message" "$details" "$duration"
}

##
# Log operation warning
#
# Arguments:
#   $1 - Operation name
#   $2 - Warning message
#   $3 - Optional context data (JSON string)
##
log_operation_warn() {
    local operation="$1"
    local message="$2"
    local context="${3:-{}}"
    log_json "$operation" "warn" "$message" "$context"
}

