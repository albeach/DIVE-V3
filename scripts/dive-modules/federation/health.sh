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
[ -n "${DIVE_FEDERATION_HEALTH_LOADED:-}" ] && return 0
export DIVE_FEDERATION_HEALTH_LOADED=1

# =============================================================================
# LOAD DEPENDENCIES
# =============================================================================

FEDERATION_DIR="$(dirname "${BASH_SOURCE[0]}")"
MODULES_DIR="$(dirname "$FEDERATION_DIR")"

if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "${MODULES_DIR}/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load state module for database
if [ -f "${MODULES_DIR}/orchestration/state.sh" ]; then
    source "${MODULES_DIR}/orchestration/state.sh"
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
    local code_upper
    code_upper=$(upper "$instance_code")

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
    local code_upper
    code_upper=$(upper "$instance_code")

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
    local code_upper
    code_upper=$(upper "$instance_code")

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

    local db_available=false
    if type orch_db_check_connection &>/dev/null && orch_db_check_connection 2>/dev/null; then
        db_available=true
    fi

    printf "%-8s %-12s %-10s %-20s %-8s %-25s\n" "SPOKE" "STATUS" "MODE" "LAST HEARTBEAT" "AGE" "DOMAIN"
    printf "%-8s %-12s %-10s %-20s %-8s %-25s\n" "─────" "──────" "────" "──────────────" "───" "──────"

    local spoke_count=0

    # Source 1: Database (for spokes with DB-tracked federation links)
    if [ "$db_available" = true ]; then
        local spokes
        spokes=$(orch_db_exec "
            SELECT DISTINCT spoke_code FROM federation_links WHERE status='ACTIVE'
        " 2>/dev/null)

        for spoke in $spokes; do
            spoke=$(echo "$spoke" | xargs)
            [ -z "$spoke" ] && continue

            local last_hb alive age mode domain
            last_hb=$(federation_get_last_heartbeat "$spoke")
            alive="UNKNOWN"
            federation_is_spoke_alive "$spoke" && alive="HEALTHY" || alive="STALE"

            # Detect mode (local vs external)
            local _domain_var="SPOKE_$(echo "$spoke" | tr '[:lower:]' '[:upper:]')_DOMAIN"
            domain="${!_domain_var:-}"
            if [ -n "$domain" ]; then
                mode="external"
            elif type is_spoke_local &>/dev/null && is_spoke_local "$spoke" 2>/dev/null; then
                mode="local"
            else
                mode="remote"
            fi

            # Calculate age
            age="N/A"
            if [ "$last_hb" != "never" ] && [ "$last_hb" != "unknown" ]; then
                local hb_epoch now_epoch age_secs
                hb_epoch=$(date -d "$last_hb" +%s 2>/dev/null || date -j -f "%Y-%m-%d %H:%M:%S" "$last_hb" +%s 2>/dev/null || echo 0)
                now_epoch=$(date +%s)
                age_secs=$((now_epoch - hb_epoch))
                if [ $age_secs -lt 60 ]; then
                    age="${age_secs}s"
                elif [ $age_secs -lt 3600 ]; then
                    age="$((age_secs / 60))m"
                else
                    age="$((age_secs / 3600))h"
                fi
            fi

            printf "%-8s %-12s %-10s %-20s %-8s %-25s\n" "$spoke" "$alive" "$mode" "${last_hb:0:19}" "$age" "${domain:---}"
            spoke_count=$((spoke_count + 1))
        done
    fi

    # Source 2: IdP aliases on Hub (catches spokes not in DB, e.g., external)
    if type keycloak_admin_api &>/dev/null; then
        local hub_idps
        hub_idps=$(keycloak_admin_api "USA" "GET" \
            "realms/${HUB_REALM:-dive-v3-broker-usa}/identity-provider/instances" 2>/dev/null | \
            jq -r '.[].alias' 2>/dev/null)

        for idp_alias in $hub_idps; do
            # Extract spoke code from alias (e.g., "gbr-idp" → "GBR")
            local _spoke_code
            _spoke_code=$(echo "$idp_alias" | sed 's/-idp$//' | tr '[:lower:]' '[:upper:]')
            [ "$_spoke_code" = "USA" ] && continue

            # Skip if already listed from DB
            if [ "$db_available" = true ]; then
                local _already_listed=false
                local _db_check
                _db_check=$(orch_db_exec "SELECT 1 FROM federation_links WHERE spoke_code='$_spoke_code' AND status='ACTIVE' LIMIT 1" 2>/dev/null)
                [ -n "$_db_check" ] && _already_listed=true
                [ "$_already_listed" = true ] && continue
            fi

            # External spoke detected via IdP alias but not in DB
            local _ext_domain_var="SPOKE_${_spoke_code}_DOMAIN"
            local _ext_domain="${!_ext_domain_var:-}"
            local _ext_mode="external"

            # Quick HTTPS health probe
            local _ext_status="UNKNOWN"
            if [ -n "$_ext_domain" ]; then
                if curl -skf --max-time 5 "https://api.${_ext_domain}/api/health" >/dev/null 2>&1; then
                    _ext_status="HEALTHY"
                else
                    _ext_status="UNREACHABLE"
                fi
            fi

            printf "%-8s %-12s %-10s %-20s %-8s %-25s\n" "$_spoke_code" "$_ext_status" "$_ext_mode" "N/A" "N/A" "${_ext_domain:---}"
            spoke_count=$((spoke_count + 1))
        done
    fi

    if [ $spoke_count -eq 0 ]; then
        echo "  No federation links found"
    fi

    echo ""
    echo "Total federated spokes: $spoke_count"
    echo ""
}

##
# Deep diagnostic for a single federation link
#
# Arguments:
#   $1 - Spoke instance code
##
federation_diagnose() {
    local spoke_code="${1:?Spoke code required}"
    local code_upper code_lower
    code_upper=$(upper "$spoke_code")
    code_lower=$(lower "$spoke_code")

    echo "=== Federation Diagnostic: ${code_upper} ==="
    echo ""
    echo "Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    echo ""

    local checks_passed=0 checks_total=0

    # Detect mode
    local _domain_var="SPOKE_${code_upper}_DOMAIN"
    local _spoke_domain="${!_domain_var:-${SPOKE_CUSTOM_DOMAIN:-}}"
    local mode="local"
    if [ -n "$_spoke_domain" ]; then
        mode="external (${_spoke_domain})"
    elif type is_spoke_local &>/dev/null && ! is_spoke_local "$code_upper" 2>/dev/null; then
        mode="remote"
    fi
    echo "  Mode: ${mode}"
    echo ""

    # Check 1: DNS (for external spokes)
    if [ -n "$_spoke_domain" ]; then
        checks_total=$((checks_total + 1))
        printf "  %-30s" "1. DNS Resolution:"
        local _dns_ok=true
        local _svc
        for _svc in app api idp; do
            local _result=""
            if command -v dig &>/dev/null; then
                _result=$(dig +short "${_svc}.${_spoke_domain}" A 2>/dev/null | head -1)
            fi
            [ -z "$_result" ] && _dns_ok=false
        done
        if [ "$_dns_ok" = true ]; then
            echo -e "${GREEN}PASS${NC} All subdomains resolve"
            checks_passed=$((checks_passed + 1))
        else
            echo -e "${RED}FAIL${NC} Some subdomains don't resolve"
            echo "    Fix: Create A records for app/api/idp.${_spoke_domain}"
        fi
    fi

    # Check 2: TLS
    if [ -n "$_spoke_domain" ]; then
        checks_total=$((checks_total + 1))
        printf "  %-30s" "2. TLS Certificate:"
        if echo | openssl s_client -connect "app.${_spoke_domain}:443" -servername "app.${_spoke_domain}" 2>/dev/null | \
           openssl x509 -noout -dates 2>/dev/null | grep -q "notAfter"; then
            echo -e "${GREEN}PASS${NC} TLS valid"
            checks_passed=$((checks_passed + 1))
        else
            echo -e "${YELLOW}WARN${NC} Cannot verify TLS"
            echo "    Fix: Check certificate for app.${_spoke_domain}"
            checks_passed=$((checks_passed + 1))
        fi
    fi

    # Check 3: OIDC Discovery
    checks_total=$((checks_total + 1))
    printf "  %-30s" "3. OIDC Discovery:"
    local _idp_url
    if [ -n "$_spoke_domain" ]; then
        _idp_url="https://idp.${_spoke_domain}"
    else
        _idp_url=$(resolve_spoke_public_url "$code_upper" "idp" 2>/dev/null || echo "https://localhost:8443")
    fi
    local _discovery_url="${_idp_url}/realms/dive-v3-broker-${code_lower}/.well-known/openid-configuration"
    local _discovery
    _discovery=$(curl -sf --max-time 10 --insecure "$_discovery_url" 2>/dev/null)
    if [ -n "$_discovery" ] && echo "$_discovery" | jq -e '.issuer' >/dev/null 2>&1; then
        echo -e "${GREEN}PASS${NC} $(echo "$_discovery" | jq -r '.issuer')"
        checks_passed=$((checks_passed + 1))
    else
        echo -e "${RED}FAIL${NC} Unreachable: ${_discovery_url}"
        echo "    Fix: Check Keycloak is running and accessible at ${_idp_url}"
    fi

    # Check 4: Keycloak Admin API
    checks_total=$((checks_total + 1))
    printf "  %-30s" "4. Admin API:"
    if type keycloak_admin_api_available &>/dev/null && keycloak_admin_api_available "$code_upper" 2>/dev/null; then
        echo -e "${GREEN}PASS${NC} Reachable"
        checks_passed=$((checks_passed + 1))
    else
        echo -e "${RED}FAIL${NC} Keycloak admin API unreachable"
        echo "    Fix: Verify Keycloak container is healthy"
    fi

    # Check 5: Hub IdP on Spoke
    checks_total=$((checks_total + 1))
    printf "  %-30s" "5. Hub IdP on Spoke:"
    if type keycloak_admin_api &>/dev/null; then
        local _hub_idp
        _hub_idp=$(keycloak_admin_api "$code_upper" "GET" \
            "realms/dive-v3-broker-${code_lower}/identity-provider/instances/usa-idp" 2>/dev/null)
        if echo "$_hub_idp" | grep -q '"alias"'; then
            echo -e "${GREEN}PASS${NC} usa-idp exists"
            checks_passed=$((checks_passed + 1))
        else
            echo -e "${RED}FAIL${NC} usa-idp not found"
            echo "    Fix: ./dive federation link ${code_upper}"
        fi
    else
        echo -e "${YELLOW}WARN${NC} Cannot check (API not available)"
        checks_passed=$((checks_passed + 1))
    fi

    # Check 6: Spoke IdP on Hub
    checks_total=$((checks_total + 1))
    printf "  %-30s" "6. Spoke IdP on Hub:"
    if type keycloak_admin_api &>/dev/null; then
        local _spoke_idp
        _spoke_idp=$(keycloak_admin_api "USA" "GET" \
            "realms/${HUB_REALM:-dive-v3-broker-usa}/identity-provider/instances/${code_lower}-idp" 2>/dev/null)
        if echo "$_spoke_idp" | grep -q '"alias"'; then
            echo -e "${GREEN}PASS${NC} ${code_lower}-idp exists"
            checks_passed=$((checks_passed + 1))
        else
            echo -e "${RED}FAIL${NC} ${code_lower}-idp not found"
            echo "    Fix: ./dive federation register-spoke ${code_upper} --idp-url URL --secret SECRET"
        fi
    else
        echo -e "${YELLOW}WARN${NC} Cannot check (API not available)"
        checks_passed=$((checks_passed + 1))
    fi

    # Check 7: Policy Sync
    checks_total=$((checks_total + 1))
    printf "  %-30s" "7. Policy Sync:"
    local _opa_url
    if [ -n "$_spoke_domain" ]; then
        _opa_url="https://api.${_spoke_domain}"
    else
        local _opa_port
        eval "$(get_instance_ports "$code_upper" 2>/dev/null)" 2>/dev/null || true
        _opa_port="${SPOKE_OPA_PORT:-8181}"
        _opa_url="https://localhost:${_opa_port}"
    fi
    local _policy_count
    _policy_count=$(curl -skf "${_opa_url}/v1/policies" --max-time 5 2>/dev/null | grep -o '"id"' | wc -l | tr -d ' ')
    if [ "${_policy_count:-0}" -gt 0 ]; then
        echo -e "${GREEN}PASS${NC} ${_policy_count} policies loaded"
        checks_passed=$((checks_passed + 1))
    else
        echo -e "${YELLOW}WARN${NC} No policies loaded"
        echo "    Fix: Check OPAL client connectivity to Hub OPAL server"
    fi

    # Summary
    echo ""
    echo "  Results: ${checks_passed}/${checks_total} checks passed"
    echo ""

    [ $checks_passed -eq $checks_total ] && return 0 || return 1
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

        local last_hb
        last_hb=$(federation_get_last_heartbeat "$spoke")
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
    local code_upper
    code_upper=$(upper "$instance_code")

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
    local code_upper
    code_upper=$(upper "$instance_code")

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
# FEDERATION STATE DATABASE (consolidated from federation-state-db.sh)
# =============================================================================

# Allow backward-compat guard check
export FEDERATION_STATE_DB_LOADED=1

FED_DB_MAX_RETRIES="${FED_DB_MAX_RETRIES:-3}"
FED_DB_RETRY_DELAY="${FED_DB_RETRY_DELAY:-5}"

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
    if fed_db_schema_exists; then
        log_verbose "Federation schema already exists"
        return 0
    fi
    local output_redirect=">/dev/null 2>&1"
    [ "${VERBOSE:-false}" = "true" ] && output_redirect=""
    if eval "docker exec -i dive-hub-postgres psql -U postgres -d orchestration < \"$schema_file\" $output_redirect"; then
        log_success "Federation schema initialized"
        return 0
    else
        log_error "Failed to initialize federation schema"
        return 1
    fi
}

fed_db_schema_exists() {
    orch_db_check_connection || return 1
    local table_count
    table_count=$(orch_db_exec "SELECT COUNT(*) FROM information_schema.tables WHERE table_name IN ('federation_links', 'federation_health', 'federation_operations')" 2>/dev/null | xargs)
    [ "$table_count" -eq 3 ]
}

fed_db_upsert_link() {
    local source_code
    source_code=$(lower "$1") target_code=$(lower "$2") direction="$3" idp_alias="$4"
    local status="${5:-PENDING}" client_id="${6:-}" metadata="${7:-}"
    orch_db_check_connection || { log_verbose "Database not available - federation link not persisted"; return 1; }
    local metadata_sql="NULL"
    if [ -n "$metadata" ] && [ "$metadata" != "null" ]; then
        echo "$metadata" | jq empty >/dev/null 2>&1 && metadata_sql="'${metadata//\'/\'\'}'::jsonb"
    fi
    local client_id_sql="NULL"
    [ -n "$client_id" ] && client_id_sql="'$client_id'"
    local result
    result=$(orch_db_exec "
INSERT INTO federation_links (source_code, target_code, direction, idp_alias, status, client_id, metadata)
VALUES ('$source_code', '$target_code', '$direction', '$idp_alias', '$status', $client_id_sql, $metadata_sql)
ON CONFLICT (source_code, target_code, direction) DO UPDATE SET
    idp_alias = EXCLUDED.idp_alias, status = EXCLUDED.status,
    client_id = COALESCE(EXCLUDED.client_id, federation_links.client_id),
    metadata = COALESCE(EXCLUDED.metadata, federation_links.metadata), updated_at = NOW()
RETURNING id;" 2>/dev/null)
    if [ -n "$result" ]; then
        log_verbose "Federation link upserted: $source_code -> $target_code ($direction)"
        return 0
    else
        log_error "Failed to upsert federation link: $source_code -> $target_code"
        return 1
    fi
}

fed_db_update_status() {
    local source_code
    source_code=$(lower "$1") target_code=$(lower "$2") direction="$3" status="$4"
    local error_message="${5:-}" error_code="${6:-}"
    orch_db_check_connection || { log_verbose "Database not available for federation status update"; return 1; }
    if ! fed_db_schema_exists; then
        fed_db_init_schema || return 1
    fi
    local escaped_error="${error_message//\'/\'\'}"
    local error_clause=""
    [ -n "$error_message" ] && error_clause=", error_message = '$escaped_error'"
    [ -n "$error_code" ] && error_clause="$error_clause, last_error_code = '$error_code'"
    local retry_clause=""
    [ "$status" = "FAILED" ] && retry_clause=", retry_count = COALESCE(federation_links.retry_count, 0) + 1"
    [ "$status" = "ACTIVE" ] && retry_clause=", retry_count = 0, last_verified_at = NOW()"
    local idp_alias="${source_code}-idp"
    [ "$direction" = "HUB_TO_SPOKE" ] && idp_alias="${target_code}-idp"
    [ "$direction" = "SPOKE_TO_HUB" ] && idp_alias="usa-idp"
    local sql
    sql="
INSERT INTO federation_links (source_code, target_code, direction, idp_alias, status, updated_at $([ -n "$error_message" ] && echo ", error_message") $([ -n "$error_code" ] && echo ", last_error_code"))
VALUES ('$source_code', '$target_code', '$direction', '$idp_alias', '$status', NOW() $([ -n "$error_message" ] && echo ", '$escaped_error'") $([ -n "$error_code" ] && echo ", '$error_code'"))
ON CONFLICT (source_code, target_code, direction) DO UPDATE SET
    status = EXCLUDED.status, updated_at = NOW() $error_clause $retry_clause;"
    if orch_db_exec "$sql" >/dev/null 2>&1; then
        log_verbose "Federation link status updated: $source_code -> $target_code = $status"
        return 0
    else
        log_verbose "Failed to update federation link status in orchestration DB (non-blocking)"
        return 1
    fi
}

fed_db_get_link() {
    local source_code
    source_code=$(lower "$1") target_code=$(lower "$2") direction="$3"
    orch_db_check_connection || return 1
    orch_db_exec "SELECT id, source_code, target_code, direction, idp_alias, status, retry_count, last_verified_at, error_message FROM federation_links WHERE source_code = '$source_code' AND target_code = '$target_code' AND direction = '$direction';" 2>/dev/null
}

fed_db_get_link_status() {
    local source_code
    source_code=$(lower "$1") target_code=$(lower "$2") direction="$3"
    orch_db_check_connection || { echo "UNKNOWN"; return 1; }
    local status
    status=$(orch_db_exec "SELECT status FROM federation_links WHERE source_code = '$source_code' AND target_code = '$target_code' AND direction = '$direction';" 2>/dev/null | xargs)
    echo "${status:-UNKNOWN}"
}

fed_db_list_links() {
    local instance_code
    instance_code=$(lower "$1")
    orch_db_check_connection || return 1
    orch_db_exec "SELECT source_code, target_code, direction, idp_alias, status, last_verified_at FROM federation_links WHERE source_code = '$instance_code' OR target_code = '$instance_code' ORDER BY direction, target_code;" 2>/dev/null
}

fed_db_get_failed_links() {
    local max_retries="${1:-$FED_DB_MAX_RETRIES}"
    orch_db_check_connection || return 1
    orch_db_exec "SELECT source_code, target_code, direction, idp_alias, retry_count, last_error_code, error_message FROM federation_links WHERE status = 'FAILED' AND retry_count < $max_retries ORDER BY updated_at ASC;" 2>/dev/null
}

fed_db_delete_link() {
    local source_code
    source_code=$(lower "$1") target_code=$(lower "$2") direction="$3"
    orch_db_check_connection || return 1
    if orch_db_exec "DELETE FROM federation_links WHERE source_code = '$source_code' AND target_code = '$target_code' AND direction = '$direction';" >/dev/null 2>&1; then
        log_info "Federation link deleted: $source_code -> $target_code ($direction)"
        return 0
    else
        return 1
    fi
}

fed_db_record_health() {
    local source_code
    source_code=$(lower "$1") target_code=$(lower "$2") direction="$3"
    local src_idp_exists="$4" src_idp_enabled="$5" tgt_idp_exists="$6" tgt_idp_enabled="$7"
    local sso_passed="${8:-}" sso_latency="${9:-}" error_message="${10:-}"
    orch_db_check_connection || return 1
    src_idp_exists=$([ "$src_idp_exists" = "true" ] && echo "TRUE" || echo "FALSE")
    src_idp_enabled=$([ "$src_idp_enabled" = "true" ] && echo "TRUE" || echo "FALSE")
    tgt_idp_exists=$([ "$tgt_idp_exists" = "true" ] && echo "TRUE" || echo "FALSE")
    tgt_idp_enabled=$([ "$tgt_idp_enabled" = "true" ] && echo "TRUE" || echo "FALSE")
    local sso_passed_sql="NULL" sso_attempted="FALSE"
    if [ -n "$sso_passed" ]; then
        sso_attempted="TRUE"
        sso_passed_sql=$([ "$sso_passed" = "true" ] && echo "TRUE" || echo "FALSE")
    fi
    local latency_sql="NULL"
    [ -n "$sso_latency" ] && latency_sql="$sso_latency"
    local escaped_error="${error_message//\'/\'\'}" error_sql="NULL"
    [ -n "$error_message" ] && error_sql="'$escaped_error'"
    if orch_db_exec "
INSERT INTO federation_health (source_code, target_code, direction, source_idp_exists, source_idp_enabled, target_idp_exists, target_idp_enabled, sso_test_attempted, sso_test_passed, sso_latency_ms, error_message)
VALUES ('$source_code', '$target_code', '$direction', $src_idp_exists, $src_idp_enabled, $tgt_idp_exists, $tgt_idp_enabled, $sso_attempted, $sso_passed_sql, $latency_sql, $error_sql);" >/dev/null 2>&1; then
        [ "$sso_passed" = "true" ] && fed_db_update_status "$source_code" "$target_code" "$direction" "ACTIVE"
        log_verbose "Health check recorded: $source_code -> $target_code"
        return 0
    else
        return 1
    fi
}

fed_db_get_latest_health() {
    local source_code
    source_code=$(lower "$1") target_code=$(lower "$2") direction="$3"
    orch_db_check_connection || return 1
    orch_db_exec "SELECT check_timestamp, source_idp_exists, source_idp_enabled, target_idp_exists, target_idp_enabled, sso_test_passed, sso_latency_ms, error_message FROM federation_health WHERE source_code = '$source_code' AND target_code = '$target_code' AND direction = '$direction' ORDER BY check_timestamp DESC LIMIT 1;" 2>/dev/null
}

fed_db_get_instance_status() {
    local instance_code
    instance_code=$(lower "$1")
    if ! orch_db_check_connection; then
        echo '{"error": "database_unavailable"}'
        return 1
    fi
    local hub_to_spoke_status spoke_to_hub_status
    hub_to_spoke_status=$(orch_db_exec "SELECT status FROM federation_links WHERE source_code = 'usa' AND target_code = '$instance_code' AND direction = 'HUB_TO_SPOKE'" 2>/dev/null | xargs)
    spoke_to_hub_status=$(orch_db_exec "SELECT status FROM federation_links WHERE source_code = '$instance_code' AND target_code = 'usa' AND direction = 'SPOKE_TO_HUB'" 2>/dev/null | xargs)
    local bidirectional="false" overall_status="UNKNOWN"
    if [ "$hub_to_spoke_status" = "ACTIVE" ] && [ "$spoke_to_hub_status" = "ACTIVE" ]; then
        bidirectional="true"; overall_status="ACTIVE"
    elif [ "$hub_to_spoke_status" = "ACTIVE" ] || [ "$spoke_to_hub_status" = "ACTIVE" ]; then
        overall_status="PARTIAL"
    elif [ "$hub_to_spoke_status" = "FAILED" ] || [ "$spoke_to_hub_status" = "FAILED" ]; then
        overall_status="FAILED"
    elif [ "$hub_to_spoke_status" = "PENDING" ] || [ "$spoke_to_hub_status" = "PENDING" ]; then
        overall_status="PENDING"
    fi
    cat << EOF
{"instance":"$instance_code","overall_status":"$overall_status","bidirectional":$bidirectional,"hub_to_spoke":"${hub_to_spoke_status:-NONE}","spoke_to_hub":"${spoke_to_hub_status:-NONE}","timestamp":"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"}
EOF
}

fed_db_list_all_links() {
    orch_db_check_connection || return 1
    orch_db_exec "SELECT source_code, target_code, direction, idp_alias, status, retry_count, last_verified_at, error_message FROM federation_links ORDER BY source_code, target_code, direction;" 2>/dev/null
}

fed_db_query_status_view() {
    local instance_code="${1:-}"
    orch_db_check_connection || return 1
    local where_clause=""
    if [ -n "$instance_code" ]; then
        instance_code=$(lower "$instance_code")
        where_clause="WHERE source_code = '$instance_code' OR target_code = '$instance_code'"
    fi
    orch_db_exec "SELECT * FROM federation_status $where_clause ORDER BY source_code, target_code;" 2>/dev/null
}

fed_db_get_pairs() {
    orch_db_check_connection || return 1
    orch_db_exec "SELECT * FROM federation_pairs ORDER BY spoke_code;" 2>/dev/null
}

fed_db_mark_for_retry() {
    local source_code
    source_code=$(lower "$1") target_code=$(lower "$2") direction="$3"
    orch_db_check_connection || return 1
    if orch_db_exec "UPDATE federation_links SET status = 'PENDING', error_message = NULL, updated_at = NOW() WHERE source_code = '$source_code' AND target_code = '$target_code' AND direction = '$direction' AND status = 'FAILED';" >/dev/null 2>&1; then
        log_info "Federation link marked for retry: $source_code -> $target_code"
        return 0
    else
        return 1
    fi
}

fed_db_reset_failed() {
    local instance_code
    instance_code=$(lower "$1")
    orch_db_check_connection || return 1
    local count
    count=$(orch_db_exec "UPDATE federation_links SET status = 'PENDING', retry_count = 0, error_message = NULL, updated_at = NOW() WHERE (source_code = '$instance_code' OR target_code = '$instance_code') AND status = 'FAILED' RETURNING id;" 2>/dev/null | wc -l | xargs)
    log_info "Reset $count failed federation links for $instance_code"
    return 0
}

fed_db_record_operation() {
    local source_code
    source_code=$(lower "$1") target_code=$(lower "$2") direction="$3"
    local op_type="$4" op_status="$5" triggered_by="${6:-system}" error_message="${7:-}" context="${8:-}"
    orch_db_check_connection || return 1
    local escaped_error="${error_message//\'/\'\'}" context_sql="NULL"
    if [ -n "$context" ] && [ "$context" != "null" ]; then
        echo "$context" | jq empty >/dev/null 2>&1 && context_sql="'${context//\'/\'\'}'::jsonb"
    fi
    orch_db_exec "INSERT INTO federation_operations (source_code, target_code, direction, operation_type, operation_status, triggered_by, error_message, context) VALUES ('$source_code', '$target_code', '$direction', '$op_type', '$op_status', '$triggered_by', '$escaped_error', $context_sql) RETURNING operation_id;" 2>/dev/null | xargs
}

fed_db_cleanup_health_history() {
    local days="${1:-30}"
    orch_db_check_connection || return 1
    local count
    count=$(orch_db_exec "DELETE FROM federation_health WHERE check_timestamp < NOW() - INTERVAL '$days days' RETURNING id;" 2>/dev/null | wc -l | xargs)
    log_info "Cleaned up $count old health check records (older than $days days)"
    echo "$count"
}

fed_db_cleanup_operations() {
    local days="${1:-90}"
    orch_db_check_connection || return 1
    local count
    count=$(orch_db_exec "DELETE FROM federation_operations WHERE started_at < NOW() - INTERVAL '$days days' AND operation_status IN ('COMPLETED', 'FAILED', 'CANCELLED') RETURNING id;" 2>/dev/null | wc -l | xargs)
    log_info "Cleaned up $count old operation records (older than $days days)"
    echo "$count"
}

# =============================================================================
# FEDERATION STATE VERIFICATION (consolidated from federation-state.sh)
# =============================================================================

verify_federation_state() {
    local spoke_code="${1:?Spoke code required}"
    local code_lower
    code_lower=$(lower "$spoke_code")
    local code_upper
    code_upper=$(upper "$spoke_code")

    ensure_dive_root
    log_step "Verifying federation state for $code_upper..."

    # Load keycloak-api.sh for cross-network support
    local _api_module="${FEDERATION_DIR}/keycloak-api.sh"
    if [ -f "$_api_module" ] && [ -z "${KEYCLOAK_API_LOADED:-}" ]; then
        source "$_api_module"
    fi

    local checks_passed=0 checks_failed=0
    local issues=()
    local realm="dive-v3-broker-${code_lower}"

    # Check 1: Hub IdP exists in spoke Keycloak
    echo -n "  Hub IdP in Spoke:          "
    if type keycloak_admin_api &>/dev/null; then
        local hub_idp_check
        hub_idp_check=$(keycloak_admin_api "$code_upper" "GET" \
            "realms/${realm}/identity-provider/instances/usa-idp" 2>/dev/null)
        if echo "$hub_idp_check" | grep -q '"alias"'; then
            echo -e "${GREEN}✓${NC}"; checks_passed=$((checks_passed + 1))
        else
            echo -e "${RED}✗${NC}"; checks_failed=$((checks_failed + 1))
            issues+=("Hub IdP (usa-idp) missing in ${code_upper} Keycloak")
        fi
    else
        # Legacy fallback: direct docker exec
        local spoke_token=""
        if type -t get_spoke_admin_token &>/dev/null; then
            spoke_token=$(get_spoke_admin_token "$spoke_code" 2>/dev/null)
        fi
        local kc_container="dive-spoke-${code_lower}-keycloak"
        if [ -n "$spoke_token" ]; then
            local hub_idp_check
            hub_idp_check=$(docker exec "$kc_container" curl -sf \
                -H "Authorization: Bearer $spoke_token" \
                "http://localhost:8080/admin/realms/${realm}/identity-provider/instances/usa-idp" 2>/dev/null)
            if echo "$hub_idp_check" | grep -q '"alias"'; then
                echo -e "${GREEN}✓${NC}"; checks_passed=$((checks_passed + 1))
            else
                echo -e "${RED}✗${NC}"; checks_failed=$((checks_failed + 1))
                issues+=("Hub IdP (usa-idp) missing in ${code_upper} Keycloak")
            fi
        else
            echo -e "${RED}✗${NC} (cannot authenticate)"; checks_failed=$((checks_failed + 1))
            issues+=("Cannot authenticate to ${code_upper} Keycloak")
        fi
    fi

    # Check 2: Spoke IdP exists in Hub Keycloak
    echo -n "  Spoke IdP in Hub:          "
    if type keycloak_admin_api &>/dev/null; then
        local spoke_idp_check
        spoke_idp_check=$(keycloak_admin_api "USA" "GET" \
            "realms/${HUB_REALM:-dive-v3-broker-usa}/identity-provider/instances/${code_lower}-idp" 2>/dev/null)
        if echo "$spoke_idp_check" | grep -q '"alias"'; then
            echo -e "${GREEN}✓${NC}"; checks_passed=$((checks_passed + 1))
        else
            echo -e "${RED}✗${NC}"; checks_failed=$((checks_failed + 1))
            issues+=("Spoke IdP (${code_lower}-idp) missing in Hub Keycloak")
        fi
    else
        # Legacy fallback
        local hub_kc_container="${HUB_KEYCLOAK_CONTAINER:-dive-hub-keycloak}"
        local hub_pass
        hub_pass=$(docker exec "$hub_kc_container" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
        if [ -n "$hub_pass" ]; then
            local hub_token
            hub_token=$(docker exec "$hub_kc_container" curl -sf \
                -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
                -d "grant_type=password" -d "username=admin" -d "password=${hub_pass}" \
                -d "client_id=admin-cli" 2>/dev/null | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)
            if [ -n "$hub_token" ]; then
                local spoke_idp_check
                spoke_idp_check=$(docker exec "$hub_kc_container" curl -sf \
                    -H "Authorization: Bearer $hub_token" \
                    "http://localhost:8080/admin/realms/${HUB_REALM:-dive-v3-broker-usa}/identity-provider/instances/${code_lower}-idp" 2>/dev/null)
                if echo "$spoke_idp_check" | grep -q '"alias"'; then
                    echo -e "${GREEN}✓${NC}"; checks_passed=$((checks_passed + 1))
                else
                    echo -e "${RED}✗${NC}"; checks_failed=$((checks_failed + 1))
                    issues+=("Spoke IdP (${code_lower}-idp) missing in Hub Keycloak")
                fi
            else
                echo -e "${RED}✗${NC} (cannot authenticate)"; checks_failed=$((checks_failed + 1))
                issues+=("Cannot authenticate to Hub Keycloak")
            fi
        else
            echo -e "${RED}✗${NC} (password not found)"; checks_failed=$((checks_failed + 1))
            issues+=("Hub Keycloak password not found")
        fi
    fi

    # Check 3: Client secrets match
    if [ $checks_failed -eq 0 ]; then
        echo -n "  Client secrets match:      "
        echo -e "${GREEN}✓${NC} (assumed if IdPs exist)"; checks_passed=$((checks_passed + 1))
    else
        echo -n "  Client secrets match:      "
        echo -e "${YELLOW}⚠${NC} (skipped - IdP checks failed)"
    fi

    # Check 4: Redirect URIs
    echo -n "  Redirect URIs configured:  "
    if type keycloak_admin_api &>/dev/null; then
        local client_check
        client_check=$(keycloak_admin_api "$code_upper" "GET" \
            "realms/${realm}/clients?clientId=dive-v3-broker-${code_lower}" 2>/dev/null)
        if echo "$client_check" | grep -q '"redirectUris"'; then
            echo -e "${GREEN}✓${NC}"; checks_passed=$((checks_passed + 1))
        else
            echo -e "${YELLOW}⚠${NC}"; issues+=("Redirect URIs may not be configured")
        fi
    else
        echo -e "${YELLOW}⚠${NC} (keycloak_admin_api not available)"
    fi

    echo ""
    if [ $checks_failed -eq 0 ]; then
        log_success "All federation checks passed ($checks_passed/$checks_passed)"
        return 0
    else
        log_warn "Federation checks: $checks_passed passed, $checks_failed failed"
        if [ ${#issues[@]} -gt 0 ]; then
            echo "  Issues found:"
            local issue
            for issue in "${issues[@]}"; do echo "    - $issue"; done
        fi
        return 1
    fi
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f federation_record_heartbeat
export -f federation_get_last_heartbeat
export -f federation_is_spoke_alive
export -f federation_health_dashboard
export -f federation_diagnose
export -f federation_health_json
export -f federation_get_link_state
export -f federation_set_link_state
export -f federation_find_stale
export -f federation_mark_stale
export -f fed_db_init_schema
export -f fed_db_schema_exists
export -f fed_db_upsert_link
export -f fed_db_update_status
export -f fed_db_get_link
export -f fed_db_get_link_status
export -f fed_db_list_links
export -f fed_db_get_failed_links
export -f fed_db_delete_link
export -f fed_db_record_health
export -f fed_db_get_latest_health
export -f fed_db_get_instance_status
export -f fed_db_list_all_links
export -f fed_db_query_status_view
export -f fed_db_get_pairs
export -f fed_db_mark_for_retry
export -f fed_db_reset_failed
export -f fed_db_record_operation
export -f fed_db_cleanup_health_history
export -f fed_db_cleanup_operations
export -f verify_federation_state

log_verbose "Federation health module loaded (includes federation-state-db + federation-state)"
