#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Federation Health Monitoring (Consolidated)
# =============================================================================
# Federation health monitoring, heartbeat, and status tracking
# =============================================================================
# Version: 5.0.0 (Module Consolidation)
# Date: 2026-01-22
#
# Consolidates:
#   - federation-state.sh
#   - federation-state-db.sh
# =============================================================================

# Prevent multiple sourcing
[ -n "$DIVE_FEDERATION_HEALTH_LOADED" ] && return 0
export DIVE_FEDERATION_HEALTH_LOADED=1

# =============================================================================
# LOAD DEPENDENCIES
# =============================================================================

FEDERATION_DIR="$(dirname "${BASH_SOURCE[0]}")"
MODULES_DIR="$(dirname "$FEDERATION_DIR")"

if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "${MODULES_DIR}/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load state module for database
if [ -f "${MODULES_DIR}/orchestration-state-db.sh" ]; then
    source "${MODULES_DIR}/orchestration-state-db.sh"
fi

# =============================================================================
# CONFIGURATION
# =============================================================================

# Heartbeat configuration
HEARTBEAT_INTERVAL="${HEARTBEAT_INTERVAL:-60}"  # seconds
HEARTBEAT_TIMEOUT="${HEARTBEAT_TIMEOUT:-180}"   # seconds (3x interval)

# =============================================================================
# FEDERATION STATE TRACKING
# =============================================================================

##
# Record federation heartbeat
#
# Arguments:
#   $1 - Spoke instance code
##
federation_record_heartbeat() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")

    if ! type orch_db_check_connection &>/dev/null || ! orch_db_check_connection; then
        log_verbose "Database not available - heartbeat not recorded"
        return 1
    fi

    orch_db_exec "
        INSERT INTO federation_heartbeats (spoke_code, timestamp, status, metadata)
        VALUES ('$code_upper', NOW(), 'OK', '{}'::jsonb)
    " >/dev/null 2>&1

    log_verbose "Heartbeat recorded for $code_upper"
    return 0
}

##
# Get last heartbeat for a spoke
#
# Arguments:
#   $1 - Spoke instance code
##
federation_get_last_heartbeat() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")

    if ! type orch_db_check_connection &>/dev/null || ! orch_db_check_connection; then
        echo "unknown"
        return 1
    fi

    local last_heartbeat
    last_heartbeat=$(orch_db_exec "
        SELECT timestamp FROM federation_heartbeats
        WHERE spoke_code='$code_upper'
        ORDER BY timestamp DESC
        LIMIT 1
    " 2>/dev/null | xargs)

    echo "${last_heartbeat:-never}"
}

##
# Check if spoke is considered alive (heartbeat within timeout)
#
# Arguments:
#   $1 - Spoke instance code
##
federation_is_spoke_alive() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")

    if ! type orch_db_check_connection &>/dev/null || ! orch_db_check_connection; then
        return 1
    fi

    local alive
    alive=$(orch_db_exec "
        SELECT COUNT(*) FROM federation_heartbeats
        WHERE spoke_code='$code_upper'
        AND timestamp > NOW() - INTERVAL '${HEARTBEAT_TIMEOUT} seconds'
    " 2>/dev/null | xargs)

    [ "${alive:-0}" -gt 0 ]
}

# =============================================================================
# FEDERATION HEALTH DASHBOARD
# =============================================================================

##
# Show federation health for all spokes
##
federation_health_dashboard() {
    echo "=== Federation Health Dashboard ==="
    echo ""
    echo "Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    echo ""

    if ! type orch_db_check_connection &>/dev/null || ! orch_db_check_connection; then
        echo "Database not available - cannot show federation health"
        return 1
    fi

    printf "%-10s %-15s %-20s %-10s\n" "SPOKE" "STATUS" "LAST HEARTBEAT" "AGE"
    printf "%-10s %-15s %-20s %-10s\n" "─────" "──────" "──────────────" "───"

    # Get all federation links
    local spokes
    spokes=$(orch_db_exec "
        SELECT DISTINCT spoke_code FROM federation_links WHERE status='ACTIVE'
    " 2>/dev/null)

    for spoke in $spokes; do
        spoke=$(echo "$spoke" | xargs)
        [ -z "$spoke" ] && continue

        local last_hb=$(federation_get_last_heartbeat "$spoke")
        local alive="UNKNOWN"
        local age=""

        if federation_is_spoke_alive "$spoke"; then
            alive="HEALTHY"
        else
            alive="STALE"
        fi

        # Calculate age
        if [ "$last_hb" != "never" ] && [ "$last_hb" != "unknown" ]; then
            local hb_epoch=$(date -d "$last_hb" +%s 2>/dev/null || date -j -f "%Y-%m-%d %H:%M:%S" "$last_hb" +%s 2>/dev/null)
            local now_epoch=$(date +%s)
            local age_secs=$((now_epoch - hb_epoch))

            if [ $age_secs -lt 60 ]; then
                age="${age_secs}s"
            elif [ $age_secs -lt 3600 ]; then
                age="$((age_secs / 60))m"
            else
                age="$((age_secs / 3600))h"
            fi
        else
            age="N/A"
        fi

        printf "%-10s %-15s %-20s %-10s\n" "$spoke" "$alive" "${last_hb:0:19}" "$age"
    done

    echo ""
}

##
# Get federation health as JSON
##
federation_health_json() {
    if ! type orch_db_check_connection &>/dev/null || ! orch_db_check_connection; then
        echo '{"error": "database_unavailable"}'
        return 1
    fi

    local spokes_json="["
    local first=true

    local spokes
    spokes=$(orch_db_exec "
        SELECT DISTINCT spoke_code FROM federation_links WHERE status='ACTIVE'
    " 2>/dev/null)

    for spoke in $spokes; do
        spoke=$(echo "$spoke" | xargs)
        [ -z "$spoke" ] && continue

        local last_hb=$(federation_get_last_heartbeat "$spoke")
        local alive="false"
        federation_is_spoke_alive "$spoke" && alive="true"

        [ "$first" != "true" ] && spokes_json+=","
        first=false

        spokes_json+="{\"code\":\"$spoke\",\"alive\":$alive,\"last_heartbeat\":\"$last_hb\"}"
    done

    spokes_json+="]"

    cat << EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "heartbeat_timeout_seconds": ${HEARTBEAT_TIMEOUT},
  "spokes": $spokes_json
}
EOF
}

# =============================================================================
# FEDERATION LINK STATE
# =============================================================================

##
# Get federation link state
#
# Arguments:
#   $1 - Spoke instance code
##
federation_get_link_state() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")

    if ! type orch_db_check_connection &>/dev/null || ! orch_db_check_connection; then
        echo "UNKNOWN"
        return 1
    fi

    local state
    state=$(orch_db_exec "
        SELECT status FROM federation_links
        WHERE spoke_code='$code_upper'
        ORDER BY updated_at DESC
        LIMIT 1
    " 2>/dev/null | xargs)

    echo "${state:-NOT_LINKED}"
}

##
# Update federation link state
#
# Arguments:
#   $1 - Spoke instance code
#   $2 - New state
#   $3 - Reason (optional)
##
federation_set_link_state() {
    local instance_code="$1"
    local new_state="$2"
    local reason="${3:-State update}"
    local code_upper=$(upper "$instance_code")

    if ! type orch_db_check_connection &>/dev/null || ! orch_db_check_connection; then
        log_warn "Database not available - state not updated"
        return 1
    fi

    orch_db_exec "
        UPDATE federation_links
        SET status='$new_state', updated_at=NOW(),
            metadata=jsonb_set(COALESCE(metadata,'{}'), '{last_reason}', '\"$reason\"')
        WHERE spoke_code='$code_upper'
    " >/dev/null 2>&1

    log_verbose "Federation link state for $code_upper: $new_state"
    return 0
}

# =============================================================================
# STALE FEDERATION DETECTION
# =============================================================================

##
# Find all stale federation links
#
# Arguments:
#   $1 - Timeout in seconds (default: HEARTBEAT_TIMEOUT)
##
federation_find_stale() {
    local timeout="${1:-$HEARTBEAT_TIMEOUT}"

    if ! type orch_db_check_connection &>/dev/null || ! orch_db_check_connection; then
        return 1
    fi

    echo "=== Stale Federation Links (>${timeout}s without heartbeat) ==="
    echo ""

    orch_db_exec "
        SELECT fl.spoke_code, fl.status,
               to_char(MAX(fh.timestamp), 'YYYY-MM-DD HH24:MI:SS') as last_heartbeat,
               EXTRACT(EPOCH FROM (NOW() - MAX(fh.timestamp)))::integer as age_seconds
        FROM federation_links fl
        LEFT JOIN federation_heartbeats fh ON fl.spoke_code = fh.spoke_code
        WHERE fl.status = 'ACTIVE'
        GROUP BY fl.spoke_code, fl.status
        HAVING MAX(fh.timestamp) IS NULL
           OR MAX(fh.timestamp) < NOW() - INTERVAL '${timeout} seconds'
    " 2>/dev/null
}

##
# Mark stale federations as degraded
#
# Arguments:
#   $1 - Timeout in seconds (default: HEARTBEAT_TIMEOUT)
##
federation_mark_stale() {
    local timeout="${1:-$HEARTBEAT_TIMEOUT}"

    if ! type orch_db_check_connection &>/dev/null || ! orch_db_check_connection; then
        return 1
    fi

    log_info "Marking stale federation links as DEGRADED..."

    local marked
    marked=$(orch_db_exec "
        UPDATE federation_links fl
        SET status='DEGRADED', updated_at=NOW(),
            metadata=jsonb_set(COALESCE(metadata,'{}'), '{degraded_reason}', '\"heartbeat_timeout\"')
        WHERE fl.status = 'ACTIVE'
        AND fl.spoke_code IN (
            SELECT fl2.spoke_code
            FROM federation_links fl2
            LEFT JOIN federation_heartbeats fh ON fl2.spoke_code = fh.spoke_code
            WHERE fl2.status = 'ACTIVE'
            GROUP BY fl2.spoke_code
            HAVING MAX(fh.timestamp) IS NULL
               OR MAX(fh.timestamp) < NOW() - INTERVAL '${timeout} seconds'
        )
        RETURNING spoke_code
    " 2>/dev/null | wc -l | xargs)

    log_info "Marked ${marked:-0} federation links as DEGRADED"
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f federation_record_heartbeat
export -f federation_get_last_heartbeat
export -f federation_is_spoke_alive
export -f federation_health_dashboard
export -f federation_health_json
export -f federation_get_link_state
export -f federation_set_link_state
export -f federation_find_stale
export -f federation_mark_stale

log_verbose "Federation health module loaded"
