#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Core Logging (Consolidated)
# =============================================================================
# Enhanced structured JSON logging with request correlation
# =============================================================================
# Version: 5.0.0 (Module Consolidation)
# Date: 2026-01-22
#
# Merges: logging.sh (existing), enhanced with request-context.ts patterns
# =============================================================================

# Prevent multiple sourcing
[ -n "${DIVE_CORE_LOGGING_LOADED:-}" ] && return 0
export DIVE_CORE_LOGGING_LOADED=1

# =============================================================================
# LOAD BASE LOGGING
# =============================================================================

CORE_DIR="$(dirname "${BASH_SOURCE[0]}")"
MODULES_DIR="$(dirname "$CORE_DIR")"

# Source original logging module to get base functions
if [ -f "${MODULES_DIR}/logging.sh" ] && [ -z "${DIVE_LOGGING_LOADED:-}" ]; then
    source "${MODULES_DIR}/logging.sh"
    export DIVE_LOGGING_LOADED=1
fi

# =============================================================================
# REQUEST CONTEXT (mirrors request-context.ts)
# =============================================================================

# Context variables for request correlation
DIVE_REQUEST_ID=""
DIVE_OPERATION=""
DIVE_COMPONENT=""
DIVE_INSTANCE=""
DIVE_PARENT_ID=""
DIVE_OPERATION_START=""

##
# Initialize a new request context for operation tracking
#
# Arguments:
#   $1 - Operation name (e.g., "hub:deploy", "spoke:verify")
#   $2 - Component (e.g., "deployment", "federation")
#   $3 - Instance code (optional)
##
init_request_context() {
    local operation="$1"
    local component="$2"
    local instance="${3:-}"

    # Generate unique request ID
    DIVE_REQUEST_ID="req-$(date +%s%N | md5sum | head -c 12)"
    DIVE_OPERATION="$operation"
    DIVE_COMPONENT="$component"
    DIVE_INSTANCE="$instance"
    DIVE_PARENT_ID="${DIVE_REQUEST_ID:-}"
    DIVE_OPERATION_START=$(date +%s%N)

    # Export for child processes
    export DIVE_REQUEST_ID DIVE_OPERATION DIVE_COMPONENT DIVE_INSTANCE DIVE_PARENT_ID

    log_debug "Request context initialized: $DIVE_REQUEST_ID (op=$operation, comp=$component)"
}

##
# Create a child context (for nested operations)
#
# Arguments:
#   $1 - Operation name
##
create_child_context() {
    local operation="$1"
    local parent_id="$DIVE_REQUEST_ID"

    DIVE_PARENT_ID="$parent_id"
    DIVE_REQUEST_ID="req-$(date +%s%N | md5sum | head -c 12)"
    DIVE_OPERATION="$operation"
    DIVE_OPERATION_START=$(date +%s%N)

    export DIVE_REQUEST_ID DIVE_PARENT_ID DIVE_OPERATION

    log_debug "Child context created: $DIVE_REQUEST_ID (parent=$parent_id, op=$operation)"
}

##
# Clear the current request context
##
clear_request_context() {
    unset DIVE_REQUEST_ID DIVE_OPERATION DIVE_COMPONENT DIVE_INSTANCE DIVE_PARENT_ID DIVE_OPERATION_START
}

# =============================================================================
# STRUCTURED JSON LOGGING
# =============================================================================

##
# Log a structured JSON message
#
# Arguments:
#   $1 - Log level (INFO, WARN, ERROR, DEBUG)
#   $2 - Message
#   $3 - Additional JSON fields (optional, e.g., '{"key":"value"}')
##
log_json_structured() {
    local level="$1"
    local message="$2"
    local extra_fields="${3:-{}}"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")
    local duration_ns=0

    # Calculate duration if we have a start time
    if [ -n "$DIVE_OPERATION_START" ]; then
        local now=$(date +%s%N)
        duration_ns=$((now - DIVE_OPERATION_START))
    fi
    local duration_ms=$((duration_ns / 1000000))

    # Build JSON log entry
    local json_log=$(cat <<EOF
{
  "timestamp": "$timestamp",
  "level": "$level",
  "message": "$message",
  "requestId": "${DIVE_REQUEST_ID:-unknown}",
  "parentId": "${DIVE_PARENT_ID:-}",
  "operation": "${DIVE_OPERATION:-unknown}",
  "component": "${DIVE_COMPONENT:-unknown}",
  "instance": "${DIVE_INSTANCE:-}",
  "durationMs": $duration_ms,
  "hostname": "$(hostname)",
  "pid": $$,
  "extra": $extra_fields
}
EOF
)

    # Output based on log level
    local log_dir="${DIVE_ROOT}/logs"
    mkdir -p "$log_dir"
    local log_file="$log_dir/dive-structured.log"

    # Write to structured log file
    echo "$json_log" >> "$log_file"

    # Also write to console in non-JSON format for readability
    case "$level" in
        ERROR)
            echo -e "\033[31m[$timestamp] [$DIVE_REQUEST_ID] ERROR: $message\033[0m" >&2
            ;;
        WARN)
            echo -e "\033[33m[$timestamp] [$DIVE_REQUEST_ID] WARN: $message\033[0m" >&2
            ;;
        INFO)
            [ "${QUIET:-false}" != "true" ] && echo -e "\033[36m[$timestamp] [$DIVE_REQUEST_ID] INFO: $message\033[0m"
            ;;
        DEBUG)
            [ "${VERBOSE:-false}" = "true" ] && echo -e "\033[90m[$timestamp] [$DIVE_REQUEST_ID] DEBUG: $message\033[0m"
            ;;
    esac
}

##
# Log operation completion with metrics
#
# Arguments:
#   $1 - Success (true/false)
#   $2 - Result message
##
log_operation_complete() {
    local success="$1"
    local result="$2"
    local level="INFO"
    local status="SUCCESS"

    if [ "$success" != "true" ]; then
        level="ERROR"
        status="FAILED"
    fi

    local duration_ns=0
    if [ -n "$DIVE_OPERATION_START" ]; then
        local now=$(date +%s%N)
        duration_ns=$((now - DIVE_OPERATION_START))
    fi
    local duration_ms=$((duration_ns / 1000000))

    log_json_structured "$level" "Operation completed: $DIVE_OPERATION" \
        "{\"status\":\"$status\",\"result\":\"$result\",\"totalDurationMs\":$duration_ms}"

    # Record metric if available
    if type metrics_record_deployment_duration &>/dev/null; then
        metrics_record_deployment_duration "$DIVE_INSTANCE" "$DIVE_COMPONENT" "$DIVE_OPERATION" "$((duration_ms / 1000))"
    fi
}

##
# Log an error with context and stack trace
#
# Arguments:
#   $1 - Error message
#   $2 - Error code (optional)
#   $3 - Recoverable (true/false, optional)
##
log_error_with_context() {
    local message="$1"
    local error_code="${2:-UNKNOWN}"
    local recoverable="${3:-false}"

    # Capture stack trace
    local stack_trace=""
    local frame=0
    while caller $frame; do
        ((frame++))
    done 2>/dev/null | while read -r line func file; do
        stack_trace="$stack_trace\n  at $func ($file:$line)"
    done

    log_json_structured "ERROR" "$message" \
        "{\"errorCode\":\"$error_code\",\"recoverable\":$recoverable,\"stackTrace\":\"$stack_trace\"}"

    # Record error metric if available
    if type metrics_record_deployment_error &>/dev/null; then
        metrics_record_deployment_error "$DIVE_INSTANCE" "$DIVE_COMPONENT" "$error_code"
    fi
}

# =============================================================================
# AUDIT LOGGING
# =============================================================================

##
# Log an audit event (for compliance and security tracking)
#
# Arguments:
#   $1 - Action (e.g., "DEPLOY", "FEDERATION_LINK", "SECRET_ACCESS")
#   $2 - Target (e.g., instance code, resource ID)
#   $3 - Result (SUCCESS, DENIED, FAILED)
#   $4 - Details (optional JSON)
##
log_audit() {
    local action="$1"
    local target="$2"
    local result="$3"
    local details="${4:-{}}"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")

    local audit_log="${DIVE_ROOT}/logs/audit.log"

    local audit_entry=$(cat <<EOF
{
  "timestamp": "$timestamp",
  "type": "AUDIT",
  "action": "$action",
  "target": "$target",
  "result": "$result",
  "requestId": "${DIVE_REQUEST_ID:-unknown}",
  "operation": "${DIVE_OPERATION:-unknown}",
  "user": "${USER:-unknown}",
  "hostname": "$(hostname)",
  "details": $details
}
EOF
)

    echo "$audit_entry" >> "$audit_log"

    # Also log to standard structured log
    log_json_structured "INFO" "Audit: $action on $target - $result" "$details"
}

# =============================================================================
# LOG AGGREGATION
# =============================================================================

##
# Tail structured logs with optional filtering
#
# Arguments:
#   $1 - Filter (optional, e.g., "ERROR", "hub", request ID)
#   $2 - Number of lines (optional, default 100)
##
log_tail() {
    local filter="${1:-}"
    local lines="${2:-100}"
    local log_file="${DIVE_ROOT}/logs/dive-structured.log"

    if [ ! -f "$log_file" ]; then
        echo "No structured logs found"
        return 1
    fi

    if [ -n "$filter" ]; then
        tail -n "$lines" "$log_file" | grep -i "$filter" | jq -r '. | "\(.timestamp) [\(.level)] \(.message)"' 2>/dev/null || \
            tail -n "$lines" "$log_file" | grep -i "$filter"
    else
        tail -n "$lines" "$log_file" | jq -r '. | "\(.timestamp) [\(.level)] \(.message)"' 2>/dev/null || \
            tail -n "$lines" "$log_file"
    fi
}

##
# Search logs by request ID
#
# Arguments:
#   $1 - Request ID
##
log_trace_request() {
    local request_id="$1"
    local log_file="${DIVE_ROOT}/logs/dive-structured.log"

    if [ ! -f "$log_file" ]; then
        echo "No structured logs found"
        return 1
    fi

    echo "=== Tracing request: $request_id ==="
    echo ""

    grep -E "\"requestId\":\"$request_id\"|\"parentId\":\"$request_id\"" "$log_file" | \
        jq -r '. | "\(.timestamp) [\(.level)] \(.operation): \(.message) (duration: \(.durationMs)ms)"' 2>/dev/null || \
        grep "$request_id" "$log_file"
}

##
# Get log statistics
##
log_stats() {
    local log_file="${DIVE_ROOT}/logs/dive-structured.log"

    if [ ! -f "$log_file" ]; then
        echo "No structured logs found"
        return 1
    fi

    echo "=== Log Statistics ==="
    echo ""
    echo "Total entries: $(wc -l < "$log_file")"
    echo ""
    echo "By level:"
    jq -r '.level' "$log_file" 2>/dev/null | sort | uniq -c | sort -rn
    echo ""
    echo "By component:"
    jq -r '.component' "$log_file" 2>/dev/null | sort | uniq -c | sort -rn
    echo ""
    echo "Recent errors:"
    grep '"level":"ERROR"' "$log_file" | tail -5 | jq -r '.message' 2>/dev/null || echo "None"
}

# =============================================================================
# CONVENIENCE WRAPPERS
# =============================================================================

# Override standard log functions to include request context
log_info_ctx() {
    log_json_structured "INFO" "$1" "${2:-{}}"
}

log_warn_ctx() {
    log_json_structured "WARN" "$1" "${2:-{}}"
}

log_error_ctx() {
    log_json_structured "ERROR" "$1" "${2:-{}}"
}

log_debug_ctx() {
    log_json_structured "DEBUG" "$1" "${2:-{}}"
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f init_request_context
export -f create_child_context
export -f clear_request_context
export -f log_json_structured
export -f log_operation_complete
export -f log_error_with_context
export -f log_audit
export -f log_tail
export -f log_trace_request
export -f log_stats
export -f log_info_ctx
export -f log_warn_ctx
export -f log_error_ctx
export -f log_debug_ctx

echo "Core logging module loaded (with request correlation)"
