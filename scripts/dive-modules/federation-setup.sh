#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 CLI - Federation Setup Module (Refactored)
# =============================================================================
# Commands: configure, register-hub, verify, sync-opa, fix-idp-urls
#
# Handles bidirectional federation between Hub (USA) and Spokes:
# - Hub→Spoke: User at Hub clicks spoke → redirects to spoke → returns
# - Spoke→Hub: User at spoke clicks USA → redirects to Hub → returns
#
# Refactored from 4,390 lines to ~1,800 lines by:
# - Extracting common helpers (_kc_api, _get_client_uuid, etc.)
# - Consolidating secret sync functions
# - Unifying retry logic
# - Removing duplicate code
# =============================================================================
# Version: 2.0.0
# Date: 2025-12-23
# =============================================================================

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load NATO countries database for port offsets
if [ -z "$NATO_COUNTRIES_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/../nato-countries.sh" 2>/dev/null || true
    export NATO_COUNTRIES_LOADED=1
fi

# =============================================================================
# CONSTANTS
# =============================================================================

# Container naming - SSOT defined in common.sh (HUB_*_CONTAINER variables)
# CRITICAL: Do NOT redefine these here - common.sh is always loaded first
# and exports HUB_KEYCLOAK_CONTAINER, HUB_BACKEND_CONTAINER, etc.
# See: scripts/dive-modules/common.sh for authoritative definitions
HUB_REALM="dive-v3-broker-usa"

# =============================================================================
# CORE HELPERS - Unified Keycloak API, Retry, and Parsing
# =============================================================================

##
# Unified Keycloak API call with retry and error handling
#
# Arguments:
#   $1 - HTTP method (GET, POST, PUT, DELETE)
#   $2 - Container to execute from
#   $3 - URL (relative to Keycloak, e.g., /admin/realms/...)
#   $4 - Bearer token
#   $5 - Request body (optional, for POST/PUT)
#   $6 - Use HTTPS (optional, default: false)
#
# Outputs:
#   Response body on success
#
# Returns:
#   0 - Success
#   1 - Failed after retries
##
_kc_api() {
    local method="$1"
    local container="$2"
    local url="$3"
    local token="$4"
    local data="${5:-}"
    local use_https="${6:-false}"

    local max_attempts=3
    local delay=1
    local attempt=1
    local response=""
    local http_code=""

    # Build curl command
    local curl_opts="-s"
    [ "$use_https" = "true" ] && curl_opts="$curl_opts -k"

    while [ $attempt -le $max_attempts ]; do
        if [ -n "$data" ]; then
            response=$(docker exec "$container" curl $curl_opts -X "$method" \
                "$url" \
                -H "Authorization: Bearer ${token}" \
                -H "Content-Type: application/json" \
                -d "$data" 2>/dev/null)
        else
            response=$(docker exec "$container" curl $curl_opts -X "$method" \
                "$url" \
                -H "Authorization: Bearer ${token}" 2>/dev/null)
        fi

        # Check for valid response (not empty and not error)
        if [ -n "$response" ]; then
            # Check if it's an error response
            if ! echo "$response" | jq -e 'type == "object" and (.error != null or .errorMessage != null)' >/dev/null 2>&1; then
                echo "$response"
            return 0
            fi
        fi

        if [ $attempt -lt $max_attempts ]; then
            log_verbose "API retry $attempt/$max_attempts, waiting ${delay}s..."
            sleep $delay
            delay=$((delay * 2))
        fi
        attempt=$((attempt + 1))
    done

    [ -n "$response" ] && echo "$response"
    return 1
}

##
# Keycloak API call that returns HTTP status code
#
# Arguments:
#   $1-$6 - Same as _kc_api
#
# Outputs:
#   HTTP status code
##
_kc_api_status() {
    local method="$1"
    local container="$2"
    local url="$3"
    local token="$4"
    local data="${5:-}"
    local use_https="${6:-false}"

    local curl_opts="-s -o /dev/null -w %{http_code}"
    [ "$use_https" = "true" ] && curl_opts="-k $curl_opts"

    if [ -n "$data" ]; then
        docker exec "$container" curl $curl_opts -X "$method" \
            "$url" \
            -H "Authorization: Bearer ${token}" \
            -H "Content-Type: application/json" \
            -d "$data" 2>/dev/null
    else
        docker exec "$container" curl $curl_opts -X "$method" \
            "$url" \
            -H "Authorization: Bearer ${token}" 2>/dev/null
    fi
}

##
# Get client UUID by clientId
#
# Arguments:
#   $1 - Container to execute from
#   $2 - Keycloak host (e.g., dive-hub-keycloak, keycloak-fra)
#   $3 - Port
#   $4 - Realm name
#   $5 - Client ID (e.g., dive-v3-broker-fra)
#   $6 - Bearer token
#   $7 - Use HTTPS (optional)
#
# Outputs:
#   Client UUID on success
#
# Returns:
#   0 - Found
#   1 - Not found
##
_get_client_uuid() {
    local container="$1"
    local kc_host="$2"
    local port="$3"
    local realm="$4"
    local client_id="$5"
    local token="$6"
    local use_https="${7:-false}"

    local protocol="http"
    local curl_opts="-s"
    [ "$use_https" = "true" ] && protocol="https" && curl_opts="-s -k"

    local url="${protocol}://${kc_host}:${port}/admin/realms/${realm}/clients?clientId=${client_id}"

    local response
    response=$(docker exec "$container" curl $curl_opts "$url" \
        -H "Authorization: Bearer ${token}" 2>/dev/null)

    if [ -z "$response" ]; then
        return 1
    fi

    # Check if array and has elements
    if ! echo "$response" | jq -e 'type == "array" and length > 0' >/dev/null 2>&1; then
    return 1
    fi

    local uuid
    uuid=$(echo "$response" | jq -r '.[0].id // empty')

    if [ -z "$uuid" ] || [ "$uuid" = "null" ]; then
        return 1
    fi

    echo "$uuid"
    return 0
}

##
# Get IdP configuration
#
# Arguments:
#   $1 - Container
#   $2 - Keycloak host
#   $3 - Port
#   $4 - Realm
#   $5 - IdP alias
#   $6 - Token
#   $7 - Use HTTPS (optional)
#
# Outputs:
#   IdP JSON config
##
_get_idp_config() {
    local container="$1"
    local kc_host="$2"
    local port="$3"
    local realm="$4"
    local idp_alias="$5"
    local token="$6"
    local use_https="${7:-false}"

    local protocol="http"
    local curl_opts="-s"
    [ "$use_https" = "true" ] && protocol="https" && curl_opts="-s -k"

    local url="${protocol}://${kc_host}:${port}/admin/realms/${realm}/identity-provider/instances/${idp_alias}"

    docker exec "$container" curl $curl_opts "$url" \
        -H "Authorization: Bearer ${token}" 2>/dev/null
}

##
# Create or update IdP
#
# Arguments:
#   $1 - Container
#   $2 - Keycloak host
#   $3 - Port
#   $4 - Realm
#   $5 - IdP alias
#   $6 - IdP config JSON
#   $7 - Token
#   $8 - Use HTTPS (optional)
#
# Returns:
#   0 - Success
#   1 - Failed
##
_create_or_update_idp() {
    local container="$1"
    local kc_host="$2"
    local port="$3"
    local realm="$4"
    local idp_alias="$5"
    local idp_config="$6"
    local token="$7"
    local use_https="${8:-false}"

    local protocol="http"
    local curl_opts="-s -o /dev/null -w %{http_code}"
    [ "$use_https" = "true" ] && protocol="https" && curl_opts="-k $curl_opts"

    # Check if IdP exists
    local existing
    existing=$(_get_idp_config "$container" "$kc_host" "$port" "$realm" "$idp_alias" "$token" "$use_https")

    local http_code
    if echo "$existing" | jq -e ".alias == \"$idp_alias\"" >/dev/null 2>&1; then
        # Update existing
        http_code=$(docker exec "$container" curl $curl_opts -X PUT \
            "${protocol}://${kc_host}:${port}/admin/realms/${realm}/identity-provider/instances/${idp_alias}" \
            -H "Authorization: Bearer ${token}" \
            -H "Content-Type: application/json" \
            -d "$idp_config" 2>/dev/null)
        [ "$http_code" = "204" ] || [ "$http_code" = "200" ]
    else
        # Create new
        http_code=$(docker exec "$container" curl $curl_opts -X POST \
            "${protocol}://${kc_host}:${port}/admin/realms/${realm}/identity-provider/instances" \
            -H "Authorization: Bearer ${token}" \
            -H "Content-Type: application/json" \
            -d "$idp_config" 2>/dev/null)
        [ "$http_code" = "201" ] || [ "$http_code" = "200" ]
    fi
}

##
# Safe JSON parsing with error detection
#
# Arguments:
#   $1 - JSON string
#   $2 - jq query
#   $3 - Fallback value (optional)
#
# Outputs:
#   Parsed value
##
_safe_jq() {
    local json="$1"
    local query="$2"
    local fallback="${3:-}"

    if [ -z "$json" ]; then
        [ -n "$fallback" ] && echo "$fallback"
        return 1
    fi

    # Check for error response
    if echo "$json" | jq -e 'type == "object" and (.error != null or .errorMessage != null)' >/dev/null 2>&1; then
        [ -n "$fallback" ] && echo "$fallback"
        return 1
    fi

    local result
    result=$(echo "$json" | jq -r "$query" 2>/dev/null)

    if [ -z "$result" ] || [ "$result" = "null" ]; then
        [ -n "$fallback" ] && echo "$fallback"
        return 1
    fi

    echo "$result"
}

##
# Resolve spoke container name dynamically
#
# Arguments:
#   $1 - Spoke code (lowercase)
#   $2 - Service (backend, keycloak, frontend)
#
# Outputs:
#   Container name
##
resolve_spoke_container() {
    local code_lower="$1"
    local service="$2"

    local patterns=(
        "dive-spoke-${code_lower}-${service}"
        "${code_lower}-${service}-${code_lower}-1"
        "dive-v3-${service}-${code_lower}"
        "${service}-${code_lower}"
    )

    for pattern in "${patterns[@]}"; do
        if docker ps --format '{{.Names}}' | grep -q "^${pattern}$"; then
            echo "$pattern"
            return 0
        fi
    done

        return 1
}

##
# Get spoke ports - DELEGATED TO COMMON.SH (SSOT)
#
# This function now delegates to common.sh:get_instance_ports()
# See: scripts/dive-modules/common.sh for authoritative implementation
#
# Arguments:
#   $1 - Spoke code (uppercase)
#
# Outputs:
#   Exports SPOKE_FRONTEND_PORT, SPOKE_KEYCLOAK_HTTPS_PORT, etc.
##
_get_spoke_ports() {
    # Delegate to common.sh (SSOT)
    get_instance_ports "$@"
}

# =============================================================================
# STATE PERSISTENCE
# =============================================================================

_get_federation_state_file() {
    local code_lower="$1"
    echo "${DIVE_ROOT}/.dive-state/federation-${code_lower}.json"
}

_load_federation_state() {
    local code_lower="$1"
    local state_file
    state_file=$(_get_federation_state_file "$code_lower")

    if [ -f "$state_file" ]; then
        cat "$state_file"
    else
        echo '{"steps": {}, "lastUpdate": null, "checksums": {}, "version": 1}'
    fi
}

_save_federation_state() {
    local code_lower="$1"
    local state="$2"
    local state_file
    state_file=$(_get_federation_state_file "$code_lower")

    mkdir -p "$(dirname "$state_file")"
    state=$(echo "$state" | jq ".lastUpdate = \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"")
    echo "$state" | jq '.' > "$state_file" 2>/dev/null
}

_mark_step_complete() {
    local code_lower="$1"
    local step="$2"
    local details="${3:-{}}"
    local state
    state=$(_load_federation_state "$code_lower")

    local timestamp
    timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    state=$(echo "$state" | jq ".steps[\"$step\"] = {\"status\": \"complete\", \"timestamp\": \"$timestamp\", \"details\": $details}")
    _save_federation_state "$code_lower" "$state"
}

_mark_step_failed() {
    local code_lower="$1"
    local step="$2"
    local error_msg="$3"
    local state
    state=$(_load_federation_state "$code_lower")

    local timestamp
    timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    state=$(echo "$state" | jq ".steps[\"$step\"] = {\"status\": \"failed\", \"timestamp\": \"$timestamp\", \"error\": \"$error_msg\"}")
    _save_federation_state "$code_lower" "$state"
}

_is_step_complete() {
    local code_lower="$1"
    local step="$2"
    local state
    state=$(_load_federation_state "$code_lower")
    echo "$state" | jq -e ".steps[\"$step\"].status == \"complete\"" >/dev/null 2>&1
}

_clear_federation_state() {
    local code_lower="$1"
    local step="${2:-}"

    if [ -n "$step" ]; then
        local state
        state=$(_load_federation_state "$code_lower")
        state=$(echo "$state" | jq "del(.steps[\"$step\"])")
        _save_federation_state "$code_lower" "$state"
    else
        rm -f "$(_get_federation_state_file "$code_lower")"
    fi
}

# =============================================================================
# AUTHENTICATION HELPERS
# =============================================================================

##
# Get Hub Keycloak admin token (with 15-retry logic for resilience)
##
get_hub_admin_token() {
    ensure_dive_root
    local max_attempts=15
    local delay=3
    local admin_pass=""

    local hub_files=(
        "${DIVE_ROOT}/.env.hub"
        "${DIVE_ROOT}/instances/usa/.env"
        "${DIVE_ROOT}/instances/hub/.env"
    )

    for hub_env in "${hub_files[@]}"; do
        if [ -f "$hub_env" ]; then
            admin_pass=$(grep -E '^KEYCLOAK_ADMIN_PASSWORD=' "$hub_env" | cut -d'=' -f2 | tr -d '"' | tr -d "'")
            [ -z "$admin_pass" ] && admin_pass=$(grep -E '^KEYCLOAK_ADMIN_PASSWORD_USA=' "$hub_env" | cut -d'=' -f2 | tr -d '"' | tr -d "'")
            [ -n "$admin_pass" ] && break
        fi
    done

    # If not in files, try container with retry
    if [ -z "$admin_pass" ] || [ ${#admin_pass} -lt 10 ]; then
        log_verbose "Retrieving Hub password from container..."
        for attempt in $(seq 1 $max_attempts); do
            admin_pass=$(docker exec "$HUB_KEYCLOAK_CONTAINER" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')

            if [ -n "$admin_pass" ] && [ ${#admin_pass} -gt 10 ] && [[ ! "$admin_pass" =~ ^(admin|password|KeycloakAdmin|test|default)$ ]]; then
                log_verbose "Retrieved Hub password from container (attempt $attempt)"
                break
            fi

            [ $attempt -lt $max_attempts ] && sleep $delay
        done
    fi

    if [ -z "$admin_pass" ] || [ ${#admin_pass} -lt 10 ]; then
        log_error "Could not find valid Hub Keycloak admin password after $max_attempts attempts"
        return 1
    fi

    local token
    token=$(docker exec "$HUB_BACKEND_CONTAINER" curl -s -X POST \
        'http://dive-hub-keycloak:8080/realms/master/protocol/openid-connect/token' \
        -d "client_id=admin-cli" \
        -d "username=admin" \
        -d "password=${admin_pass}" \
        -d "grant_type=password" 2>/dev/null | jq -r '.access_token')

    if [ -z "$token" ] || [ "$token" = "null" ]; then
        return 1
    fi

    echo "$token"
}

##
# Get super_admin token for Hub DIVE application (not Keycloak master admin)
# This token can be used to authenticate with backend API endpoints requiring super_admin role
##
get_hub_super_admin_token() {
    ensure_dive_root
    local admin_user="admin-usa"
    local admin_pass="DiveV3Admin2026Secure!"  # Reset password (2026-01-05)
    local client_id="dive-v3-broker-usa"

    # Get client secret from Keycloak
    local admin_token
    admin_token=$(get_hub_admin_token) || return 1

    local client_secret
    client_secret=$(docker exec "$HUB_BACKEND_CONTAINER" curl -s \
        -H "Authorization: Bearer ${admin_token}" \
        "http://dive-hub-keycloak:8080/admin/realms/dive-v3-broker-usa/clients" 2>/dev/null \
        | jq -r '.[] | select(.clientId == "dive-v3-broker-usa") | .id' \
        | xargs -I {} docker exec "$HUB_BACKEND_CONTAINER" curl -s \
        -H "Authorization: Bearer ${admin_token}" \
        "http://dive-hub-keycloak:8080/admin/realms/dive-v3-broker-usa/clients/{}/client-secret" 2>/dev/null \
        | jq -r '.value')

    if [ -z "$client_secret" ] || [ "$client_secret" = "null" ]; then
        log_error "Failed to retrieve client secret for ${client_id}"
        return 1
    fi

    local token
    token=$(docker exec "$HUB_BACKEND_CONTAINER" curl -s -X POST \
        'http://dive-hub-keycloak:8080/realms/dive-v3-broker-usa/protocol/openid-connect/token' \
        -d "client_id=${client_id}" \
        -d "client_secret=${client_secret}" \
        -d "username=${admin_user}" \
        -d "password=${admin_pass}" \
        -d "grant_type=password" 2>/dev/null | jq -r '.access_token')

    if [ -z "$token" ] || [ "$token" = "null" ]; then
        log_error "Failed to get super_admin token for ${admin_user}"
        return 1
    fi

    echo "$token"
}

##
# Get spoke Keycloak admin token (with 15-retry logic for resilience)
##
get_spoke_admin_token() {
    local spoke_code="${1:?Spoke code required}"
    local code_lower=$(lower "$spoke_code")
    local code_upper=$(upper "$spoke_code")
    local max_attempts=5
    local delay=2

    ensure_dive_root

    local admin_pass=""
    local keycloak_container="dive-spoke-${code_lower}-keycloak"
    local backend_container
    backend_container=$(resolve_spoke_container "$code_lower" "backend") || return 1

    # FIXED (Dec 2025): ALWAYS prefer container password - it's authoritative
    # .env files can become stale after container restart/redeploy
    # NOTE: All log output MUST go to stderr >&2 since stdout is captured for return value
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${keycloak_container}$"; then
        admin_pass=$(docker exec "$keycloak_container" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
        log_verbose "Retrieved ${code_upper} password from container (len: ${#admin_pass})" >&2
    fi

    # Fallback to .env file only if container password not available
    if [ -z "$admin_pass" ] || [ ${#admin_pass} -lt 10 ]; then
        local spoke_env="${DIVE_ROOT}/instances/${code_lower}/.env"
        if [ -f "$spoke_env" ]; then
            admin_pass=$(grep -E "^KEYCLOAK_ADMIN_PASSWORD_${code_upper}=" "$spoke_env" | cut -d'=' -f2 | tr -d '"' | tr -d "'")
            [ -z "$admin_pass" ] && admin_pass=$(grep -E "^KEYCLOAK_ADMIN_PASSWORD=" "$spoke_env" | cut -d'=' -f2 | tr -d '"' | tr -d "'")
            log_verbose "Using ${code_upper} password from .env file (len: ${#admin_pass})" >&2
        fi
    fi

    if [ -z "$admin_pass" ] || [ ${#admin_pass} -lt 10 ]; then
        log_error "Could not find valid spoke Keycloak admin password for $code_upper" >&2
        return 1
    fi

    # Get admin token with retry
    local token=""
    for attempt in $(seq 1 $max_attempts); do
        token=$(docker exec "$backend_container" curl -s -k -X POST \
            "https://${keycloak_container}:8443/realms/master/protocol/openid-connect/token" \
            -d "client_id=admin-cli" \
            -d "username=admin" \
            -d "password=${admin_pass}" \
            -d "grant_type=password" 2>/dev/null | jq -r '.access_token // empty')

        if [ -n "$token" ] && [ "$token" != "null" ]; then
            echo "$token"
            return 0
        fi

        if [ $attempt -lt $max_attempts ]; then
            log_verbose "Token fetch attempt $attempt failed, retrying..." >&2
            sleep $delay
        fi
    done

    log_error "Failed to get admin token for $code_upper after $max_attempts attempts" >&2
    return 1
}

# =============================================================================
# SECRET MANAGEMENT (Consolidated)
# =============================================================================

##
# Get Hub client secret for a spoke (used by usa-idp in spoke)
# This retrieves the secret for dive-v3-broker-{spoke} client in the Hub
##
get_hub_client_secret() {
    local spoke_code="${1:?Spoke code required}"
    local code_lower=$(lower "$spoke_code")
    # The usa-idp in spoke authenticates as dive-v3-broker-{spoke} to the Hub
    local client_id="dive-v3-broker-${code_lower}"

    local token
    token=$(get_hub_admin_token) || return 1

    local client_uuid
    client_uuid=$(_get_client_uuid "$HUB_BACKEND_CONTAINER" "dive-hub-keycloak" "8080" "$HUB_REALM" "$client_id" "$token") || return 1

    local secret_response
        secret_response=$(docker exec "$HUB_BACKEND_CONTAINER" curl -s \
            "http://dive-hub-keycloak:8080/admin/realms/${HUB_REALM}/clients/${client_uuid}/client-secret" \
            -H "Authorization: Bearer ${token}" 2>/dev/null)

    _safe_jq "$secret_response" '.value'
}

##
# Get spoke local client secret
##
get_spoke_local_client_secret() {
    local spoke_code="${1:?Spoke code required}"
    local code_lower=$(lower "$spoke_code")
    local client_id="dive-v3-broker-${code_lower}"
    local realm="dive-v3-broker-${code_lower}"

    local token
    token=$(get_spoke_admin_token "$spoke_code") || return 1

    local backend_container
    backend_container=$(resolve_spoke_container "$code_lower" "backend") || return 1
    local keycloak_container="dive-spoke-${code_lower}-keycloak"

    local client_uuid
    client_uuid=$(_get_client_uuid "$backend_container" "$keycloak_container" "8443" "$realm" "$client_id" "$token" "true") || return 1

    local secret_response
        secret_response=$(docker exec "$backend_container" curl -s -k \
            "https://${keycloak_container}:8443/admin/realms/${realm}/clients/${client_uuid}/client-secret" \
            -H "Authorization: Bearer ${token}" 2>/dev/null)

    _safe_jq "$secret_response" '.value'
}

##
# Sync all secrets for Hub→Spoke federation
# FIXED (Dec 2025): Read secret directly from spoke Keycloak, not from .env file
# The .env file can be stale if the client secret was regenerated in Keycloak
##
sync_hub_to_spoke_secrets() {
    local spoke_code="${1:?Spoke code required}"
    local code_lower=$(lower "$spoke_code")
    local code_upper=$(upper "$spoke_code")

    log_verbose "Syncing Hub→Spoke secrets for ${code_upper}..."

    local spoke_realm="dive-v3-broker-${code_lower}"
    local federation_client_id="dive-v3-broker-usa"
    local spoke_kc_container="dive-spoke-${code_lower}-keycloak"

    # Get spoke admin password (SSOT: try KC_BOOTSTRAP_ADMIN_PASSWORD first)
    local spoke_admin_pass
    spoke_admin_pass=$(get_keycloak_password "$spoke_kc_container")
    if [ -z "$spoke_admin_pass" ]; then
        log_error "Could not get spoke Keycloak admin password"
        return 1
    fi

    # Authenticate with spoke Keycloak
    docker exec "$spoke_kc_container" /opt/keycloak/bin/kcadm.sh config credentials \
        --server http://localhost:8080 --realm master --user admin --password "$spoke_admin_pass" 2>/dev/null || {
        log_error "Could not authenticate with spoke Keycloak"
        return 1
    }

    # Get the actual client secret from spoke Keycloak
    local client_uuid
    client_uuid=$(docker exec "$spoke_kc_container" /opt/keycloak/bin/kcadm.sh get clients \
        -r "$spoke_realm" --fields id,clientId 2>/dev/null | \
        jq -r ".[] | select(.clientId==\"${federation_client_id}\") | .id")

    if [ -z "$client_uuid" ]; then
        log_error "Federation client ${federation_client_id} not found in ${spoke_realm}"
        return 1
    fi

    local spoke_client_secret
    spoke_client_secret=$(docker exec "$spoke_kc_container" /opt/keycloak/bin/kcadm.sh get \
        "clients/${client_uuid}/client-secret" -r "$spoke_realm" 2>/dev/null | jq -r '.value')

    if [ -z "$spoke_client_secret" ] || [ "$spoke_client_secret" = "null" ]; then
        log_error "Could not get client secret for ${federation_client_id}"
        return 1
    fi

    log_verbose "Retrieved ${code_upper} client secret (len: ${#spoke_client_secret})"

    # Update Hub's IdP to use spoke's actual client secret
    # SSOT: Get Hub password from container environment
    local hub_admin_pass
    hub_admin_pass=$(get_keycloak_password "${HUB_KEYCLOAK_CONTAINER}")
    if [ -z "$hub_admin_pass" ]; then
        # Fallback to .env.hub
        source "${DIVE_ROOT}/.env.hub" 2>/dev/null || true
        hub_admin_pass="${KEYCLOAK_ADMIN_PASSWORD:-}"
    fi
    if [ -z "$hub_admin_pass" ]; then
        log_error "Could not get Hub Keycloak admin password"
        return 1
    fi

    docker exec "$HUB_KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh config credentials \
        --server http://localhost:8080 --realm master --user admin --password "$hub_admin_pass" 2>/dev/null || return 1

    local idp_alias="${code_lower}-idp"

    if docker exec "$HUB_KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh update \
        "identity-provider/instances/${idp_alias}" -r "$HUB_REALM" \
        -s "config.clientSecret=$spoke_client_secret" 2>/dev/null; then
        log_success "Hub ${idp_alias} secret synced"
        return 0
    else
        log_error "Failed to sync Hub ${idp_alias} secret"
        return 1
    fi
}

##
# Sync spoke's local secrets
# Consolidates: sync_spoke_env_secrets + sync_spoke_frontend_secret
##
sync_spoke_local_secrets() {
    local spoke_code="${1:?Spoke code required}"
    local code_lower=$(lower "$spoke_code")
    local code_upper=$(upper "$spoke_code")

    ensure_dive_root
    local spoke_env="${DIVE_ROOT}/instances/${code_lower}/.env"

    log_step "Syncing local secrets for spoke ${code_upper}..."

    if [ ! -f "$spoke_env" ]; then
        log_error "Spoke .env not found: $spoke_env"
        return 1
    fi

    # Get local client secret
    local local_secret
    local_secret=$(get_spoke_local_client_secret "$spoke_code") || return 1

    # Backup and update .env
    cp "$spoke_env" "${spoke_env}.bak.$(date +%Y%m%d-%H%M%S)"

    local secret_var="KEYCLOAK_CLIENT_SECRET_${code_upper}"
    if grep -q "^${secret_var}=" "$spoke_env"; then
        sed -i.tmp "s/^${secret_var}=.*/${secret_var}=${local_secret}/" "$spoke_env"
        rm -f "${spoke_env}.tmp"
    else
        echo "${secret_var}=${local_secret}" >> "$spoke_env"
    fi

    log_success "Updated $secret_var in .env"
    return 0
}

# =============================================================================
# CLIENT MANAGEMENT
# =============================================================================

##
# Create Hub's federation client in spoke realm (for Hub→Spoke flow)
##
ensure_hub_client_in_spoke() {
    local spoke_code="${1:?Spoke code required}"
    local code_lower=$(lower "$spoke_code")
    local code_upper=$(upper "$spoke_code")

    log_verbose "Creating Hub federation client in ${code_upper} realm..." >&2

    local keycloak_container="dive-spoke-${code_lower}-keycloak"
    local realm="dive-v3-broker-${code_lower}"
    local client_id="dive-v3-broker-usa"

    # FIXED (Dec 2025): Get password from container (authoritative)
    local spoke_admin_password=""
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${keycloak_container}$"; then
        spoke_admin_password=$(docker exec "$keycloak_container" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
    fi

    # Fallback to .env file
    if [ -z "$spoke_admin_password" ] || [ ${#spoke_admin_password} -lt 10 ]; then
        local spoke_env_file="${DIVE_ROOT}/instances/${code_lower}/.env"
        if [ -f "$spoke_env_file" ]; then
            spoke_admin_password=$(grep "^KEYCLOAK_ADMIN_PASSWORD_${code_upper}=" "$spoke_env_file" | cut -d= -f2 | tr -d '\n\r"')
        fi
    fi

    if [ -z "$spoke_admin_password" ]; then
        log_error "Cannot find Keycloak admin password for ${code_upper}" >&2
        return 1
    fi

    # Get Hub client secret for spoke
    local usa_idp_secret=""
    usa_idp_secret=$(get_hub_client_secret "$spoke_code" 2>/dev/null)
    if [ -z "$usa_idp_secret" ]; then
        local spoke_env_file="${DIVE_ROOT}/instances/${code_lower}/.env"
        if [ -f "$spoke_env_file" ]; then
            usa_idp_secret=$(grep "^USA_IDP_CLIENT_SECRET=" "$spoke_env_file" | cut -d= -f2 | tr -d '\n\r"')
        fi
    fi

    if [ -z "$usa_idp_secret" ]; then
        log_error "USA_IDP_CLIENT_SECRET not found" >&2
        return 1
    fi

    docker exec "$keycloak_container" /opt/keycloak/bin/kcadm.sh config credentials \
        --server http://localhost:8080 --realm master --user admin --password "$spoke_admin_password" 2>/dev/null || return 1

    # Check if client exists
    local existing_client
    existing_client=$(docker exec "$keycloak_container" /opt/keycloak/bin/kcadm.sh get clients -r "$realm" 2>/dev/null | \
        jq -r ".[] | select(.clientId == \"$client_id\") | .id")

    if [ -n "$existing_client" ]; then
        docker exec "$keycloak_container" /opt/keycloak/bin/kcadm.sh update "clients/$existing_client" -r "$realm" \
            -s "secret=$usa_idp_secret" 2>/dev/null
        log_success "Updated $client_id secret"
        return 0
    fi

    # Create client
    local redirect_uris='["https://localhost:8443/realms/dive-v3-broker-usa/broker/'${code_lower}'-idp/endpoint","https://localhost:8443/realms/dive-v3-broker-usa/broker/'${code_lower}'-idp/endpoint/*","https://hub.dive25.com/*"]'
    local web_origins='["https://localhost:8443","https://localhost:3000","https://hub.dive25.com"]'

    if docker exec "$keycloak_container" /opt/keycloak/bin/kcadm.sh create clients -r "$realm" \
        -s "clientId=$client_id" \
        -s "name=USA Hub Federation Client" \
        -s "enabled=true" \
        -s "protocol=openid-connect" \
        -s "publicClient=false" \
        -s "secret=$usa_idp_secret" \
        -s "standardFlowEnabled=true" \
        -s "directAccessGrantsEnabled=false" \
        -s "redirectUris=$redirect_uris" \
        -s "webOrigins=$web_origins" 2>/dev/null; then
        log_success "Created $client_id in $realm"
        return 0
    else
        log_error "Failed to create $client_id"
        return 1
    fi
}

##
# Create the Hub's IdP client in spoke realm (for Hub→Spoke flow)
# When Hub redirects to spoke via {spoke}-idp, it uses dive-v3-client-{spoke}
# This client MUST exist in the spoke's Keycloak realm
##
ensure_hub_idp_client_in_spoke() {
    local spoke_code="${1:?Spoke code required}"
    local code_lower=$(lower "$spoke_code")
    local code_upper=$(upper "$spoke_code")

    log_step "Creating Hub IdP client in ${code_upper} spoke..."

    local spoke_realm="dive-v3-broker-${code_lower}"
    local client_id="dive-v3-broker-${code_lower}"  # This is what Hub's IdP uses

    # Get spoke admin password
    local spoke_env_file="${DIVE_ROOT}/instances/${code_lower}/.env"
    local spoke_admin_password=""
    if [ -f "$spoke_env_file" ]; then
        spoke_admin_password=$(grep "^KEYCLOAK_ADMIN_PASSWORD_${code_upper}=" "$spoke_env_file" | cut -d= -f2 | tr -d '\n\r"')
    fi

    if [ -z "$spoke_admin_password" ]; then
        log_error "Cannot find Keycloak admin password for ${code_upper}"
        return 1
    fi

    eval "$(_get_spoke_ports "$spoke_code")"
    local kc_port="${SPOKE_KEYCLOAK_HTTPS_PORT:-8443}"

    # Get token via API (more reliable than kcadm.sh)
    local spoke_token
    spoke_token=$(curl -sk -X POST "https://localhost:${kc_port}/realms/master/protocol/openid-connect/token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "grant_type=password" \
        -d "client_id=admin-cli" \
        -d "username=admin" \
        -d "password=${spoke_admin_password}" | jq -r '.access_token')

    if [ -z "$spoke_token" ] || [ "$spoke_token" = "null" ]; then
        log_error "Failed to get admin token for ${code_upper} Keycloak"
        return 1
    fi

    # Check if client exists
    local existing_client
    existing_client=$(curl -sk "https://localhost:${kc_port}/admin/realms/${spoke_realm}/clients?clientId=${client_id}" \
        -H "Authorization: Bearer $spoke_token" | jq -r '.[0].id // empty')

    # Get the client secret from Hub's IdP config
    source "${DIVE_ROOT}/.env.hub" 2>/dev/null || true
    local hub_token
    hub_token=$(curl -sk -X POST "https://localhost:8443/realms/master/protocol/openid-connect/token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "grant_type=password" \
        -d "client_id=admin-cli" \
        -d "username=admin" \
        -d "password=${KEYCLOAK_ADMIN_PASSWORD}" | jq -r '.access_token')

    local hub_idp_secret=""
    if [ -n "$hub_token" ] && [ "$hub_token" != "null" ]; then
        hub_idp_secret=$(curl -sk "https://localhost:8443/admin/realms/dive-v3-broker-usa/identity-provider/instances/${code_lower}-idp" \
            -H "Authorization: Bearer $hub_token" | jq -r '.config.clientSecret // empty')
    fi

    # Generate secret if not found
    if [ -z "$hub_idp_secret" ]; then
        hub_idp_secret=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)
        log_warn "Generated new client secret (Hub IdP may need update)"
    fi

    # Calculate spoke's frontend port using SSOT
    eval "$(_get_spoke_ports "$spoke_code")"
    local frontend_port="${SPOKE_FRONTEND_PORT:-3000}"
    local backend_port="${SPOKE_BACKEND_PORT:-4000}"

    # Federation-specific redirect URIs (Hub→Spoke broker callbacks)
    local fed_redirect_uris=(
        "https://localhost:8443/realms/dive-v3-broker-usa/broker/${code_lower}-idp/endpoint"
        "https://localhost:8443/realms/dive-v3-broker-usa/broker/${code_lower}-idp/endpoint/*"
        "https://usa-idp.dive25.com/realms/dive-v3-broker-usa/broker/${code_lower}-idp/endpoint"
        "https://usa-idp.dive25.com/realms/dive-v3-broker-usa/broker/${code_lower}-idp/endpoint/*"
    )

    # Frontend-specific redirect URIs (CRITICAL: Required for login to work!)
    local frontend_redirect_uris=(
        "https://localhost:${frontend_port}"
        "https://localhost:${frontend_port}/*"
        "https://localhost:${frontend_port}/api/auth/callback/keycloak"
        "https://${code_lower}-app.dive25.com"
        "https://${code_lower}-app.dive25.com/*"
        "https://${code_lower}-app.dive25.com/api/auth/callback/keycloak"
        "https://localhost:3000"
        "https://localhost:3000/*"
        "*"
    )

    # Web origins (frontend + Hub)
    local web_origins=(
        "https://localhost:${frontend_port}"
        "https://localhost:${backend_port}"
        "https://${code_lower}-app.dive25.com"
        "https://localhost:8443"
        "https://localhost:3000"
        "https://localhost:4000"
        "https://usa-idp.dive25.com"
        "https://usa-app.dive25.com"
        "*"
    )

    if [ -n "$existing_client" ]; then
        # CRITICAL FIX: When client exists, MERGE redirect URIs instead of replacing
        # This preserves frontend login URIs while adding federation URIs
        log_info "Client exists - merging redirect URIs to preserve frontend login"

        # Get existing redirect URIs
        local existing_uris
        existing_uris=$(curl -sk "https://localhost:${kc_port}/admin/realms/${spoke_realm}/clients/${existing_client}" \
            -H "Authorization: Bearer $spoke_token" | jq -r '.redirectUris // []')

        # Combine all URIs (frontend + federation), remove duplicates
        local all_redirect_uris=$(printf '%s\n' "${frontend_redirect_uris[@]}" "${fed_redirect_uris[@]}" | sort -u | jq -R . | jq -s .)
        local all_web_origins=$(printf '%s\n' "${web_origins[@]}" | sort -u | jq -R . | jq -s .)

        # Update client with merged URIs AND secret
        curl -sk -X PUT "https://localhost:${kc_port}/admin/realms/${spoke_realm}/clients/${existing_client}" \
            -H "Authorization: Bearer $spoke_token" \
            -H "Content-Type: application/json" \
            -d "{
                \"secret\": \"${hub_idp_secret}\",
                \"redirectUris\": ${all_redirect_uris},
                \"webOrigins\": ${all_web_origins}
            }" >/dev/null

        log_success "Updated ${client_id} with merged redirect URIs in ${spoke_realm}"
        return 0
    fi

    # Create new client with BOTH frontend AND federation redirect URIs
    # CRITICAL: The main broker client is used by BOTH:
    #   1. The spoke's frontend for login (localhost:${frontend_port})
    #   2. The Hub for federation callbacks
    local all_redirect_uris=$(printf '%s\n' "${frontend_redirect_uris[@]}" "${fed_redirect_uris[@]}" | sort -u | jq -R . | jq -s .)
    local all_web_origins=$(printf '%s\n' "${web_origins[@]}" | sort -u | jq -R . | jq -s .)

    local client_payload=$(cat <<EOF
{
    "clientId": "${client_id}",
    "name": "DIVE V3 Application - ${code_upper}",
    "description": "Main application client for ${code_upper} instance (frontend + federation)",
    "enabled": true,
    "protocol": "openid-connect",
    "publicClient": false,
    "clientAuthenticatorType": "client-secret",
    "secret": "${hub_idp_secret}",
    "standardFlowEnabled": true,
    "directAccessGrantsEnabled": true,
    "serviceAccountsEnabled": false,
    "redirectUris": ${all_redirect_uris},
    "webOrigins": ${all_web_origins},
    "attributes": {
        "pkce.code.challenge.method": "S256",
        "post.logout.redirect.uris": "https://localhost:${frontend_port}##https://localhost:${frontend_port}/*##https://${code_lower}-app.dive25.com##https://${code_lower}-app.dive25.com/*",
        "backchannel.logout.session.required": "true"
    }
}
EOF
)

    local result
    result=$(curl -sk -X POST "https://localhost:${kc_port}/admin/realms/${spoke_realm}/clients" \
        -H "Authorization: Bearer $spoke_token" \
        -H "Content-Type: application/json" \
        -d "$client_payload" -w "%{http_code}" -o /dev/null)

    if [ "$result" = "201" ] || [ "$result" = "409" ]; then
        log_success "Created ${client_id} in ${spoke_realm}"
        return 0
    else
        log_error "Failed to create ${client_id} in ${spoke_realm} (HTTP $result)"
        return 1
    fi
}

##
# Create spoke's federation client in Hub realm (for Spoke→Hub flow)
##
ensure_spoke_client_in_hub() {
    local spoke_code="${1:?Spoke code required}"
    local code_lower=$(lower "$spoke_code")
    local code_upper=$(upper "$spoke_code")

    log_step "Creating spoke ${code_upper} client in Hub realm..."

    eval "$(_get_spoke_ports "$code_upper")"
    local kc_https_port=$SPOKE_KEYCLOAK_HTTPS_PORT
    local frontend_port=$SPOKE_FRONTEND_PORT

    local client_id="dive-v3-broker-${code_lower}"
    local spoke_realm="dive-v3-broker-${code_lower}"

    source "${DIVE_ROOT}/.env.hub" 2>/dev/null || true
    # KEYCLOAK 26+ UPDATE: Use KC_BOOTSTRAP_ADMIN_PASSWORD_USA (Hub normalized naming)
    local admin_password="${KC_BOOTSTRAP_ADMIN_PASSWORD_USA:-${KEYCLOAK_ADMIN_PASSWORD}}"
    if [ -z "$admin_password" ]; then
        log_error "KC_BOOTSTRAP_ADMIN_PASSWORD_USA not set (or legacy KEYCLOAK_ADMIN_PASSWORD)"
        return 1
    fi

    docker exec "$HUB_KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh config credentials \
        --server http://localhost:8080 --realm master --user admin --password "$admin_password" 2>/dev/null || return 1

    local existing_client
    existing_client=$(docker exec "$HUB_KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh get clients \
        -r "$HUB_REALM" 2>/dev/null | jq -r ".[] | select(.clientId == \"$client_id\") | .id")

    if [ -n "$existing_client" ]; then
        log_info "Client $client_id already exists"
        # Ensure secret is synced from GCP even if client exists
        _sync_federation_client_secret_from_gcp "$spoke_code"
        return 0
    fi

    # CRITICAL: Use GCP Secret Manager as SSOT for federation secrets
    local spoke_client_secret
    local gcp_secret_name="dive-v3-federation-${code_lower}-usa"

    # Try to get from GCP first
    spoke_client_secret=$(gcloud secrets versions access latest --secret="${gcp_secret_name}" --project=dive25 2>/dev/null)

    if [ -z "$spoke_client_secret" ]; then
        # Create new secret and store in GCP
        spoke_client_secret=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)
        echo -n "$spoke_client_secret" | gcloud secrets create "${gcp_secret_name}" --data-file=- --project=dive25 2>/dev/null || \
        echo -n "$spoke_client_secret" | gcloud secrets versions add "${gcp_secret_name}" --data-file=- --project=dive25 2>/dev/null
        log_success "✓ Created federation secret in GCP (SSOT): ${gcp_secret_name}"
    else
        log_info "Using existing federation secret from GCP: ${gcp_secret_name}"
    fi

    local redirect_uris="[\"https://localhost:${kc_https_port}/realms/${spoke_realm}/broker/usa-idp/endpoint\",\"https://localhost:${kc_https_port}/realms/${spoke_realm}/broker/usa-idp/endpoint/*\",\"https://localhost:${frontend_port}/*\"]"
    local web_origins="[\"https://localhost:${kc_https_port}\",\"https://localhost:${frontend_port}\"]"

    if docker exec "$HUB_KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh create clients -r "$HUB_REALM" \
        -s "clientId=$client_id" \
        -s "name=${code_upper} Spoke Federation Client" \
        -s "enabled=true" \
        -s "protocol=openid-connect" \
        -s "publicClient=false" \
        -s "secret=$spoke_client_secret" \
        -s "standardFlowEnabled=true" \
        -s "directAccessGrantsEnabled=false" \
        -s "redirectUris=$redirect_uris" \
        -s "webOrigins=$web_origins" 2>/dev/null; then
        log_success "Created $client_id in Hub with GCP secret"

        # Add protocol mappers to the new client (CRITICAL for federation)
        ensure_protocol_mappers_on_hub_federation_client "$spoke_code"

        return 0
    else
        log_error "Failed to create $client_id in Hub"
        return 1
    fi
}

##
# Sync federation client secret from GCP to Keycloak
# Ensures existing clients have the correct secret from GCP SSOT
##
_sync_federation_client_secret_from_gcp() {
    local spoke_code="${1:?Spoke code required}"
    local code_lower=$(lower "$spoke_code")
    local code_upper=$(upper "$spoke_code")

    local client_id="dive-v3-broker-${code_lower}"
    local gcp_secret_name="dive-v3-federation-${code_lower}-usa"

    # Get secret from GCP
    local gcp_secret
    gcp_secret=$(gcloud secrets versions access latest --secret="${gcp_secret_name}" --project=dive25 2>/dev/null)

    if [ -z "$gcp_secret" ]; then
        log_warn "No GCP secret found for ${gcp_secret_name}, skipping sync"
        return 0
    fi

    # Get client UUID
    source "${DIVE_ROOT}/.env.hub" 2>/dev/null || true
    local token
    token=$(curl -sk -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
        -d "grant_type=password&client_id=admin-cli&username=admin&password=${KEYCLOAK_ADMIN_PASSWORD}" | jq -r '.access_token')

    local client_uuid
    client_uuid=$(curl -sk "http://localhost:8080/admin/realms/${HUB_REALM}/clients" \
        -H "Authorization: Bearer $token" | jq -r ".[] | select(.clientId==\"${client_id}\") | .id")

    if [ -z "$client_uuid" ]; then
        log_warn "Client ${client_id} not found in Hub"
        return 1
    fi

    # Update client secret
    curl -sk -X PUT "http://localhost:8080/admin/realms/${HUB_REALM}/clients/${client_uuid}" \
        -H "Authorization: Bearer $token" \
        -H "Content-Type: application/json" \
        -d "{\"id\": \"${client_uuid}\", \"clientId\": \"${client_id}\", \"secret\": \"${gcp_secret}\"}" >/dev/null

    log_verbose "Synced GCP secret to Hub client: ${client_id}"
}

##
# Ensure protocol mappers exist on Hub's federation client for a spoke
# This client (e.g., dive-v3-broker-nzl in USA Hub) issues tokens to the spoke
# Without these mappers, the spoke won't receive user attributes!
##
ensure_protocol_mappers_on_hub_federation_client() {
    local spoke_code="${1:?Spoke code required}"
    local code_lower=$(lower "$spoke_code")
    local code_upper=$(upper "$spoke_code")

    local client_id="dive-v3-broker-${code_lower}"

    log_verbose "Adding protocol mappers to ${client_id} in Hub realm..."

    # Get Hub admin token
    source "${DIVE_ROOT}/.env.hub" 2>/dev/null || true
    if [ -z "$KEYCLOAK_ADMIN_PASSWORD" ]; then
        log_warn "Cannot add mappers: KEYCLOAK_ADMIN_PASSWORD not set"
        return 1
    fi

    docker exec "$HUB_KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh config credentials \
        --server http://localhost:8080 --realm master --user admin --password "$KEYCLOAK_ADMIN_PASSWORD" 2>/dev/null || return 1

    # Get client UUID
    local client_uuid
    client_uuid=$(docker exec "$HUB_KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh get clients \
        -r "$HUB_REALM" --fields id,clientId 2>/dev/null | jq -r ".[] | select(.clientId==\"${client_id}\") | .id")

    if [ -z "$client_uuid" ]; then
        log_warn "Client ${client_id} not found in Hub - mappers not created"
        return 1
    fi

    # Standard attributes to include in tokens (core DIVE V3 + AMR for MFA)
    local standard_attrs=("clearance" "countryOfAffiliation" "acpCOI" "uniqueID" "amr")
    local created=0

    for attr in "${standard_attrs[@]}"; do
        local mapper_name="federation-std-${attr}"

        # Check if mapper exists
        local existing
        existing=$(docker exec "$HUB_KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh get \
            "clients/${client_uuid}/protocol-mappers/models" -r "$HUB_REALM" --fields id,name 2>/dev/null | \
            jq -r --arg name "$mapper_name" '.[] | select(.name==$name) | .id // empty' 2>/dev/null)

        if [ -n "$existing" ]; then
            log_verbose "Mapper '${mapper_name}' already exists"
            continue
        fi

        # Determine if multivalued
        local multivalued="false"
        [[ "$attr" == "acpCOI" || "$attr" == "amr" ]] && multivalued="true"

        # Create mapper
        docker exec "$HUB_KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh create \
            "clients/${client_uuid}/protocol-mappers/models" -r "$HUB_REALM" \
            -s "name=${mapper_name}" \
            -s "protocol=openid-connect" \
            -s "protocolMapper=oidc-usermodel-attribute-mapper" \
            -s "consentRequired=false" \
            -s "config.\"userinfo.token.claim\"=true" \
            -s "config.\"id.token.claim\"=true" \
            -s "config.\"access.token.claim\"=true" \
            -s "config.\"claim.name\"=${attr}" \
            -s "config.\"user.attribute\"=${attr}" \
            -s "config.\"jsonType.label\"=String" \
            -s "config.multivalued=${multivalued}" 2>/dev/null && created=$((created + 1))
    done

    [ $created -gt 0 ] && log_success "Created $created protocol mappers on ${client_id} in Hub"
    return 0
}

# =============================================================================
# IDP MANAGEMENT
# =============================================================================

##
# Configure usa-idp in spoke with correct Hub client secret
##
configure_spoke_usa_idp() {
    local spoke_code="${1:?Spoke code required}"
    local code_lower=$(lower "$spoke_code")
    local code_upper=$(upper "$spoke_code")

    log_step "Configuring usa-idp in spoke ${code_upper}..."

    local hub_client_secret
    hub_client_secret=$(get_hub_client_secret "$spoke_code") || return 1

    local token
    token=$(get_spoke_admin_token "$spoke_code") || return 1

    local backend_container
    backend_container=$(resolve_spoke_container "$code_lower" "backend") || return 1
    local keycloak_container="dive-spoke-${code_lower}-keycloak"
    local realm="dive-v3-broker-${code_lower}"
    local client_id="dive-v3-broker-${code_lower}"

    local idp_config
    # Server-to-server URLs use container names (dive-hub-keycloak is in the certificate SANs)
    # Browser-facing URLs use localhost for user access
    idp_config=$(cat <<EOF
{
    "alias": "usa-idp",
    "providerId": "oidc",
    "enabled": true,
    "displayName": "United States",
    "config": {
        "clientId": "${client_id}",
        "clientSecret": "${hub_client_secret}",
        "tokenUrl": "https://localhost:${kc_https_port}/realms/${HUB_REALM}/protocol/openid-connect/token",
        "authorizationUrl": "https://localhost:${kc_https_port}/realms/${HUB_REALM}/protocol/openid-connect/auth?kc_idp_hint=",
        "logoutUrl": "https://localhost:${kc_https_port}/realms/${HUB_REALM}/protocol/openid-connect/logout",
        "backchannelSupported": "true",
        "useJwksUrl": "true",
        "jwksUrl": "https://localhost:${kc_https_port}/realms/${HUB_REALM}/protocol/openid-connect/certs",
        "validateSignature": "true",
        "pkceEnabled": "true",
        "pkceMethod": "S256"
    }
}
EOF
)

    if _create_or_update_idp "$backend_container" "$keycloak_container" "8443" "$realm" "usa-idp" "$idp_config" "$token" "true"; then
        log_success "usa-idp configured with Hub client secret"
        return 0
    else
        log_error "Failed to configure usa-idp"
        return 1
    fi
}

##
# Create spoke IdP in Hub
##
create_spoke_idp_in_hub() {
    local spoke_code="${1:?Spoke code required}"
    local code_lower=$(lower "$spoke_code")
    local code_upper=$(upper "$spoke_code")
    local spoke_realm="dive-v3-broker-${code_lower}"
    # Hub→Spoke federation uses dive-v3-broker-usa ON the spoke
    # This is the client the spoke created for the hub (USA) to authenticate
    local spoke_client="dive-v3-broker-usa"
    local spoke_idp="${code_lower}-idp"
    local spoke_display_name=$(get_country_name "$code_upper" 2>/dev/null || echo "$code_upper")

    eval "$(_get_spoke_ports "$spoke_code")"
    local kc_port="${SPOKE_KEYCLOAK_HTTPS_PORT:-8443}"

    source "${DIVE_ROOT}/.env.hub" 2>/dev/null || true
    if [ -z "$KEYCLOAK_ADMIN_PASSWORD" ]; then
        return 1
    fi

    docker exec "$HUB_KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh config credentials \
        --server http://localhost:8080 --realm master --user admin --password "$KEYCLOAK_ADMIN_PASSWORD" 2>/dev/null || return 1

    # Get client secret from spoke
    local client_secret
    client_secret=$(get_spoke_local_client_secret "$spoke_code" 2>/dev/null)
    if [ -z "$client_secret" ]; then
        local hub_client_secret
        hub_client_secret=$(get_hub_client_secret "$spoke_code" 2>/dev/null)
        client_secret="$hub_client_secret"
    fi

    # Check if IdP exists
    local existing_idp
    existing_idp=$(docker exec "$HUB_KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh get \
        "identity-provider/instances/${spoke_idp}" -r "$HUB_REALM" 2>/dev/null | jq -r '.alias // empty')

    if [ -n "$existing_idp" ]; then
        docker exec "$HUB_KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh update \
            "identity-provider/instances/${spoke_idp}" -r "$HUB_REALM" \
            -s "config.clientSecret=${client_secret}" 2>/dev/null
        log_info "Updated existing IdP: ${spoke_idp}"
        return 0
    fi

    # Create IdP
    # FIXED (Dec 2025): Use host.docker.internal for server-to-server URLs
    # The container name (dive-spoke-{code}-keycloak) is NOT in the SSL certificate SAN
    # host.docker.internal IS in the certificate SAN and resolves to the host from containers
    # Browser-facing URLs use localhost:{port}

    if docker exec "$HUB_KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh create identity-provider/instances \
        -r "$HUB_REALM" \
        -s "alias=${spoke_idp}" \
        -s providerId=oidc \
        -s enabled=true \
        -s "displayName=${spoke_display_name}" \
        -s trustEmail=true \
        -s "config.authorizationUrl=https://localhost:${kc_port}/realms/${spoke_realm}/protocol/openid-connect/auth" \
        -s "config.tokenUrl=https://host.docker.internal:${kc_port}/realms/${spoke_realm}/protocol/openid-connect/token" \
        -s "config.userInfoUrl=https://host.docker.internal:${kc_port}/realms/${spoke_realm}/protocol/openid-connect/userinfo" \
        -s "config.logoutUrl=https://localhost:${kc_port}/realms/${spoke_realm}/protocol/openid-connect/logout" \
        -s "config.jwksUrl=https://host.docker.internal:${kc_port}/realms/${spoke_realm}/protocol/openid-connect/certs" \
        -s "config.issuer=https://localhost:${kc_port}/realms/${spoke_realm}" \
        -s "config.clientId=${spoke_client}" \
        -s "config.clientSecret=${client_secret}" \
        -s "config.defaultScope=openid profile email" \
        -s "config.syncMode=FORCE" \
        -s "config.validateSignature=true" \
        -s "config.useJwksUrl=true" \
        -s "config.pkceEnabled=true" \
        -s "config.pkceMethod=S256" \
        -s firstBrokerLoginFlowAlias="" \
        -s updateProfileFirstLoginMode=off 2>/dev/null; then
        log_success "Created IdP: ${spoke_idp}"
        return 0
    else
        log_error "Failed to create IdP: ${spoke_idp}"
        return 1
    fi
}

##
# Create IdP mappers in Hub for spoke
##
create_hub_idp_mappers() {
    local spoke_code="${1:?Spoke code required}"
    local code_lower=$(lower "$spoke_code")
    local spoke_idp="${code_lower}-idp"

    local hub_token
    hub_token=$(get_hub_admin_token) || return 1

    local mappers=("uniqueID" "clearance" "countryOfAffiliation" "acpCOI" "amr")
    local created=0

    for mapper in "${mappers[@]}"; do
        local existing
        existing=$(docker exec "$HUB_BACKEND_CONTAINER" curl -sk \
            "http://dive-hub-keycloak:8080/admin/realms/${HUB_REALM}/identity-provider/instances/${spoke_idp}/mappers" \
            -H "Authorization: Bearer ${hub_token}" 2>/dev/null | jq -r ".[] | select(.name==\"${mapper}\") | .name // empty")

        [ -n "$existing" ] && continue

        local mapper_json="{\"name\": \"${mapper}\", \"identityProviderMapper\": \"oidc-user-attribute-idp-mapper\", \"identityProviderAlias\": \"${spoke_idp}\", \"config\": {\"syncMode\": \"FORCE\", \"claim\": \"${mapper}\", \"user.attribute\": \"${mapper}\"}}"

        local result
        result=$(docker exec "$HUB_BACKEND_CONTAINER" curl -sk -o /dev/null -w "%{http_code}" \
            -X POST "http://dive-hub-keycloak:8080/admin/realms/${HUB_REALM}/identity-provider/instances/${spoke_idp}/mappers" \
            -H "Authorization: Bearer ${hub_token}" \
            -H "Content-Type: application/json" \
            -d "$mapper_json" 2>/dev/null)

        [ "$result" = "201" ] && created=$((created + 1))
    done

    [ $created -gt 0 ] && log_success "Created $created IdP mappers"
        return 0
}

##
# Ensure protocol mappers exist on the spoke's federation client (dive-v3-broker-usa)
# These mappers expose user attributes in the tokens issued by the spoke
# Without these, the Hub's IdP mappers have nothing to import!
##
ensure_protocol_mappers_on_spoke_client() {
    local spoke_code="${1:?Spoke code required}"
    local code_lower=$(lower "$spoke_code")
    local code_upper=$(upper "$spoke_code")

    local spoke_realm="dive-v3-broker-${code_lower}"
    local federation_client_id="dive-v3-broker-usa"
    local spoke_kc_container="dive-spoke-${code_lower}-keycloak"

    log_verbose "Adding protocol mappers to ${federation_client_id} in ${spoke_realm}..."

    # Get spoke admin password
    local admin_pass
    admin_pass=$(docker exec "$spoke_kc_container" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
    if [ -z "$admin_pass" ]; then
        log_error "Could not get spoke Keycloak admin password"
        return 1
    fi

    # Configure kcadm credentials
    docker exec "$spoke_kc_container" /opt/keycloak/bin/kcadm.sh config credentials \
        --server http://localhost:8080 --realm master --user admin --password "$admin_pass" 2>/dev/null || {
        log_error "Could not authenticate with spoke Keycloak"
        return 1
    }

    # Get client UUID
    local client_uuid
    client_uuid=$(docker exec "$spoke_kc_container" /opt/keycloak/bin/kcadm.sh get clients \
        -r "$spoke_realm" --fields id,clientId 2>/dev/null | jq -r ".[] | select(.clientId==\"${federation_client_id}\") | .id")

    if [ -z "$client_uuid" ]; then
        log_error "Federation client ${federation_client_id} not found in ${spoke_realm}"
        return 1
    fi

    # Define standard attribute mappings (core DIVE V3 + AMR for MFA)
    local standard_attrs=("clearance" "countryOfAffiliation" "acpCOI" "uniqueID" "amr")

    # Define localized attribute mappings based on spoke country
    # Format: "source_attribute:claim_name"
    local localized_attrs=()
    case "$code_upper" in
        FRA)
            localized_attrs=(
                "pays_affiliation:countryOfAffiliation"
                "niveau_habilitation:clearance"
                "communaute_interet:acpCOI"
                "identifiant_unique:uniqueID"
            )
            ;;
        DEU)
            localized_attrs=(
                "land_zugehoerigkeit:countryOfAffiliation"
                "sicherheitsstufe:clearance"
                "interessengemeinschaft:acpCOI"
                "eindeutige_id:uniqueID"
            )
            ;;
        # Add more country mappings as needed
    esac

    local created=0

    # Create mappers for standard attributes
    for attr in "${standard_attrs[@]}"; do
        _create_spoke_protocol_mapper_kcadm "$spoke_kc_container" "$spoke_realm" "$client_uuid" "$attr" "$attr" "federation-std-${attr}"
        ((created++))
    done

    # Create mappers for localized attributes
    for mapping in "${localized_attrs[@]}"; do
        local source_attr="${mapping%%:*}"
        local claim_name="${mapping##*:}"
        _create_spoke_protocol_mapper_kcadm "$spoke_kc_container" "$spoke_realm" "$client_uuid" "$source_attr" "$claim_name" "federation-${source_attr}"
        ((created++))
    done

    log_success "Created/verified $created protocol mappers on ${federation_client_id}"
    return 0
}

##
# Helper: Create a single protocol mapper on a spoke's federation client using kcadm.sh
##
_create_spoke_protocol_mapper_kcadm() {
    local kc_container="$1"
    local realm="$2"
    local client_uuid="$3"
    local user_attr="$4"
    local claim_name="$5"
    local mapper_name="$6"

    # Check if mapper already exists
    local existing
    existing=$(docker exec "$kc_container" /opt/keycloak/bin/kcadm.sh get \
        "clients/${client_uuid}/protocol-mappers/models" -r "$realm" --fields id,name 2>/dev/null | \
        jq -r --arg name "$mapper_name" '.[] | select(.name==$name) | .id // empty' 2>/dev/null)

    if [ -n "$existing" ]; then
        # Update existing mapper
        docker exec "$kc_container" /opt/keycloak/bin/kcadm.sh update \
            "clients/${client_uuid}/protocol-mappers/models/${existing}" -r "$realm" \
            -s "name=${mapper_name}" \
            -s "protocol=openid-connect" \
            -s "protocolMapper=oidc-usermodel-attribute-mapper" \
            -s "consentRequired=false" \
            -s "config.\"userinfo.token.claim\"=true" \
            -s "config.\"id.token.claim\"=true" \
            -s "config.\"access.token.claim\"=true" \
            -s "config.\"claim.name\"=${claim_name}" \
            -s "config.\"user.attribute\"=${user_attr}" \
            -s "config.\"jsonType.label\"=String" \
            -s "config.multivalued=false" 2>/dev/null || true
    else
        # Create new mapper
        docker exec "$kc_container" /opt/keycloak/bin/kcadm.sh create \
            "clients/${client_uuid}/protocol-mappers/models" -r "$realm" \
            -s "name=${mapper_name}" \
            -s "protocol=openid-connect" \
            -s "protocolMapper=oidc-usermodel-attribute-mapper" \
            -s "consentRequired=false" \
            -s "config.\"userinfo.token.claim\"=true" \
            -s "config.\"id.token.claim\"=true" \
            -s "config.\"access.token.claim\"=true" \
            -s "config.\"claim.name\"=${claim_name}" \
            -s "config.\"user.attribute\"=${user_attr}" \
            -s "config.\"jsonType.label\"=String" \
            -s "config.multivalued=false" 2>/dev/null || true
    fi
}

# =============================================================================
# URI MANAGEMENT
# =============================================================================

##
# Update spoke client redirect URIs
##
update_spoke_redirect_uris() {
    local spoke_code="${1:?Spoke code required}"
    local code_lower=$(lower "$spoke_code")
    local code_upper=$(upper "$spoke_code")

    eval "$(_get_spoke_ports "$code_upper")"
    local frontend_port=$SPOKE_FRONTEND_PORT

    local token
    token=$(get_spoke_admin_token "$spoke_code") || return 1

    local backend_container
    backend_container=$(resolve_spoke_container "$code_lower" "backend") || return 1
    local keycloak_container="dive-spoke-${code_lower}-keycloak"
    local realm="dive-v3-broker-${code_lower}"
    local client_id="dive-v3-broker-${code_lower}"

    local client_uuid
    client_uuid=$(_get_client_uuid "$backend_container" "$keycloak_container" "8443" "$realm" "$client_id" "$token" "true") || return 1

    local redirect_uris="[
        \"https://localhost:${frontend_port}/*\",
        \"https://localhost:${frontend_port}/api/auth/callback/keycloak\",
        \"https://localhost:${frontend_port}/api/auth/callback/*\",
        \"https://localhost:${frontend_port}\",
        \"https://${code_lower}-app.dive25.com/*\",
        \"https://localhost:3000/*\",
        \"https://localhost:3000/api/auth/callback/keycloak\"
    ]"

    local result
    result=$(docker exec "$backend_container" curl -s -k -o /dev/null -w "%{http_code}" -X PUT \
        "https://${keycloak_container}:8443/admin/realms/${realm}/clients/${client_uuid}" \
        -H "Authorization: Bearer ${token}" \
        -H "Content-Type: application/json" \
        -d "{\"redirectUris\": $redirect_uris}" 2>/dev/null)

    if [ "$result" = "204" ] || [ "$result" = "200" ]; then
        log_success "Spoke client redirect URIs updated"
        return 0
    else
        log_warn "Failed to update spoke client URIs (HTTP $result)"
        return 1
    fi
}

##
# Update Hub client redirect URIs for spoke
##
update_hub_redirect_uris() {
    local spoke_code="${1:?Spoke code required}"
    local code_lower=$(lower "$spoke_code")
    local code_upper=$(upper "$spoke_code")

    eval "$(_get_spoke_ports "$code_upper")"
    local kc_https_port=$SPOKE_KEYCLOAK_HTTPS_PORT

    local token
    token=$(get_hub_admin_token) || return 1

    # FIXED (Dec 2025): Use correct client naming - dive-v3-broker-{code}
    # This matches what's created during spoke registration in Hub
    local client_id="dive-v3-broker-${code_lower}"

    local client_uuid
    client_uuid=$(_get_client_uuid "$HUB_BACKEND_CONTAINER" "dive-hub-keycloak" "8080" "$HUB_REALM" "$client_id" "$token") || return 1

    local redirect_uris="[
        \"https://localhost:${kc_https_port}/realms/dive-v3-broker-${code_lower}/broker/usa-idp/endpoint\",
        \"https://localhost:${kc_https_port}/*\",
        \"https://${code_lower}-idp.dive25.com/*\"
    ]"

    local result
    result=$(docker exec "$HUB_BACKEND_CONTAINER" curl -s -o /dev/null -w "%{http_code}" -X PUT \
        "http://dive-hub-keycloak:8080/admin/realms/${HUB_REALM}/clients/${client_uuid}" \
        -H "Authorization: Bearer ${token}" \
        -H "Content-Type: application/json" \
        -d "{\"redirectUris\": $redirect_uris}" 2>/dev/null)

    if [ "$result" = "204" ] || [ "$result" = "200" ]; then
        log_success "Hub client redirect URIs updated"
        return 0
    else
        log_warn "Failed to update Hub client URIs (HTTP $result)"
        return 1
    fi
}

##
# Fix Hub IdP URLs (host.docker.internal → localhost)
##
fix_hub_idp_urls() {
    local spoke="${1:-all}"

    echo ""
    log_step "Fixing Hub IdP URLs (host.docker.internal → localhost)"

    source "${DIVE_ROOT}/.env.hub" 2>/dev/null || true
    docker exec "$HUB_KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh config credentials \
        --server http://localhost:8080 --realm master --user admin --password "$KEYCLOAK_ADMIN_PASSWORD" 2>/dev/null || return 1

    local idps=()
    if [ "$spoke" = "all" ]; then
        local all_idps
        all_idps=$(docker exec "$HUB_KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh get identity-provider/instances \
            -r "$HUB_REALM" 2>/dev/null | jq -r '.[].alias')
        for idp in $all_idps; do
            idps+=("$idp")
        done
    else
        idps+=("${spoke}-idp")
    fi

    local fixed=0
    for idp in "${idps[@]}"; do
        local idp_config
        idp_config=$(docker exec "$HUB_KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh get identity-provider/instances/"$idp" \
            -r "$HUB_REALM" 2>/dev/null)

        [ -z "$idp_config" ] && continue

        local auth_url
        auth_url=$(echo "$idp_config" | jq -r '.config.authorizationUrl // empty')

        [[ ! "$auth_url" == *"host.docker.internal"* ]] && continue

        local port
        port=$(echo "$auth_url" | sed 's|https://host.docker.internal:\([0-9]*\)/.*|\1|')
        local spoke_code
        spoke_code=$(echo "$idp" | sed 's/-idp$//')

        docker exec "$HUB_KEYCLOAK_CONTAINER" /opt/keycloak/bin/kcadm.sh update identity-provider/instances/"$idp" \
            -r "$HUB_REALM" \
            -s "config.authorizationUrl=https://localhost:${port}/realms/dive-v3-broker-${spoke_code}/protocol/openid-connect/auth" \
            -s "config.issuer=https://localhost:${port}/realms/dive-v3-broker-${spoke_code}" \
            -s "config.logoutUrl=https://localhost:${port}/realms/dive-v3-broker-${spoke_code}/protocol/openid-connect/logout" 2>/dev/null && fixed=$((fixed + 1))
    done

    log_success "Fixed $fixed IdP(s)"
    return 0
}

# =============================================================================
# SCOPE/MAPPER SETUP
# =============================================================================

##
# Ensure DIVE attributes scope exists in a realm
##
_ensure_dive_scope() {
    local container="$1"
    local realm="$2"
    local client_id="$3"

    local scope_id
    scope_id=$(docker exec "$container" /opt/keycloak/bin/kcadm.sh get client-scopes -r "$realm" 2>/dev/null | \
        jq -r '.[] | select(.name == "dive-attributes") | .id')

    if [ -z "$scope_id" ]; then
        docker exec "$container" /opt/keycloak/bin/kcadm.sh create client-scopes -r "$realm" \
            -s name=dive-attributes \
            -s description="DIVE V3 user attributes" \
            -s protocol=openid-connect \
            -s 'attributes={"include.in.token.scope":"true"}' 2>/dev/null

        scope_id=$(docker exec "$container" /opt/keycloak/bin/kcadm.sh get client-scopes -r "$realm" 2>/dev/null | \
            jq -r '.[] | select(.name == "dive-attributes") | .id')

        [ -z "$scope_id" ] && return 1

        # Create mappers
        for attr in countryOfAffiliation clearance uniqueID acpCOI; do
            docker exec "$container" /opt/keycloak/bin/kcadm.sh create "client-scopes/$scope_id/protocol-mappers/models" -r "$realm" \
                -s "name=$attr" \
                -s protocol=openid-connect \
                -s protocolMapper=oidc-usermodel-attribute-mapper \
                -s "config={\"claim.name\":\"$attr\",\"user.attribute\":\"$attr\",\"id.token.claim\":\"true\",\"access.token.claim\":\"true\",\"userinfo.token.claim\":\"true\"}" 2>/dev/null
        done
    fi

    # Assign to client
    if [ -n "$client_id" ]; then
        local client_uuid
        client_uuid=$(docker exec "$container" /opt/keycloak/bin/kcadm.sh get clients -r "$realm" 2>/dev/null | \
            jq -r ".[] | select(.clientId == \"$client_id\") | .id")

        [ -n "$client_uuid" ] && [ -n "$scope_id" ] && \
            docker exec "$container" /opt/keycloak/bin/kcadm.sh update "clients/$client_uuid/default-client-scopes/$scope_id" -r "$realm" 2>/dev/null
    fi

    return 0
}

##
# Setup complete claim passthrough for a spoke
##
setup_claims() {
    local spoke="${1:-}"
    [ -z "$spoke" ] && return 1

    local spoke_lower=$(lower "$spoke")
    local spoke_upper=$(upper "$spoke")

    log_step "Setting up claim passthrough for ${spoke_upper}..."

    # Hub side: Assign DIVE scopes to Hub client
    local hub_token
    hub_token=$(get_hub_admin_token) || return 1

    local client_id="dive-v3-broker-${spoke_lower}"
    local client_uuid
    client_uuid=$(docker exec "$HUB_BACKEND_CONTAINER" curl -s \
        "http://dive-hub-keycloak:8080/admin/realms/${HUB_REALM}/clients?clientId=${client_id}" \
        -H "Authorization: Bearer ${hub_token}" 2>/dev/null | jq -r '.[0].id')

    if [ -n "$client_uuid" ] && [ "$client_uuid" != "null" ]; then
        local scopes=("clearance" "countryOfAffiliation" "acpCOI" "uniqueID")
        for scope_name in "${scopes[@]}"; do
            local scope_id
            scope_id=$(docker exec "$HUB_BACKEND_CONTAINER" curl -s \
                "http://dive-hub-keycloak:8080/admin/realms/${HUB_REALM}/client-scopes?first=0&max=100" \
                -H "Authorization: Bearer ${hub_token}" 2>/dev/null | \
                jq -r ".[] | select(.name==\"${scope_name}\") | .id")

            [ -n "$scope_id" ] && [ "$scope_id" != "null" ] && \
                docker exec "$HUB_BACKEND_CONTAINER" curl -s -o /dev/null -X PUT \
                    "http://dive-hub-keycloak:8080/admin/realms/${HUB_REALM}/clients/${client_uuid}/default-client-scopes/${scope_id}" \
                    -H "Authorization: Bearer ${hub_token}" 2>/dev/null
        done
        log_success "Hub client scopes assigned"
    fi

    # Spoke side: Create IdP mappers for usa-idp
    local spoke_token
    spoke_token=$(get_spoke_admin_token "$spoke") || return 1

    local keycloak_container="dive-spoke-${spoke_lower}-keycloak"
    local realm="dive-v3-broker-${spoke_lower}"

    # Core DIVE V3 attributes + AMR for MFA propagation
    local mappers=("clearance" "countryOfAffiliation" "uniqueID" "acpCOI" "amr")
    local created=0

    for mapper in "${mappers[@]}"; do
        # Check if mapper already exists
        local existing
        existing=$(docker exec "$keycloak_container" curl -sk \
            "https://localhost:8443/admin/realms/${realm}/identity-provider/instances/usa-idp/mappers" \
            -H "Authorization: Bearer ${spoke_token}" 2>/dev/null | jq -r ".[] | select(.name==\"${mapper}\") | .name // empty")

        if [ -n "$existing" ]; then
            log_verbose "IdP mapper '$mapper' already exists, skipping"
            continue
        fi

        local mapper_json="{\"name\": \"${mapper}\", \"identityProviderMapper\": \"oidc-user-attribute-idp-mapper\", \"identityProviderAlias\": \"usa-idp\", \"config\": {\"claim\": \"${mapper}\", \"user.attribute\": \"${mapper}\", \"syncMode\": \"FORCE\"}}"

        local result
        result=$(docker exec "$keycloak_container" curl -sk -o /dev/null -w "%{http_code}" \
            -X POST "https://localhost:8443/admin/realms/${realm}/identity-provider/instances/usa-idp/mappers" \
            -H "Authorization: Bearer ${spoke_token}" \
            -H "Content-Type: application/json" \
            -d "${mapper_json}" 2>/dev/null)

        if [ "$result" = "201" ]; then
            created=$((created + 1))
        fi
    done

    if [ $created -gt 0 ]; then
        log_success "Created $created IdP mappers for usa-idp"
    else
        log_success "Spoke IdP mappers already configured"
    fi

    return 0
}

# =============================================================================
# OPA SYNC
# =============================================================================

##
# Sync spoke to OPA trusted issuers
##
sync_opa_trusted_issuers() {
    local spoke="${1:-}"
    [ -z "$spoke" ] && return 1

    local spoke_lower=$(lower "$spoke")
    local spoke_upper=$(upper "$spoke")

    eval "$(_get_spoke_ports "$spoke_upper")"
    local keycloak_port="${SPOKE_KEYCLOAK_HTTPS_PORT:-8443}"

    local realm="dive-v3-broker-${spoke_lower}"
    local issuer_url="https://localhost:${keycloak_port}/realms/${realm}"

    log_step "Syncing OPA trusted issuers for ${spoke_upper}..."

    # Update trusted_issuers.json
    local trusted_issuers_file="${DIVE_ROOT}/backend/data/opal/trusted_issuers.json"
    if [ -f "$trusted_issuers_file" ]; then
        local tmp_file="${trusted_issuers_file}.tmp"
        jq --arg url "$issuer_url" --arg tenant "$spoke_upper" --arg name "${spoke_upper} Keycloak" --arg country "$spoke_upper" \
            '.[$url] = {"tenant": $tenant, "name": $name, "country": $country, "trust_level": "DEVELOPMENT", "enabled": true}' \
            "$trusted_issuers_file" > "$tmp_file" && mv "$tmp_file" "$trusted_issuers_file"
    fi

    # Update policy_data.json
    local policy_data_file="${DIVE_ROOT}/policies/policy_data.json"
    if [ -f "$policy_data_file" ]; then
        local tmp_file="${policy_data_file}.tmp"
        jq --arg url "$issuer_url" --arg tenant "$spoke_upper" --arg name "${spoke_upper} Keycloak" --arg country "$spoke_upper" \
            '.trusted_issuers[$url] = {"tenant": $tenant, "name": $name, "country": $country, "trust_level": "DEVELOPMENT"}
            | .federation_matrix.USA += [$tenant] | .federation_matrix.USA |= unique' \
            "$policy_data_file" > "$tmp_file" && mv "$tmp_file" "$policy_data_file"
    fi

    # Restart OPA containers
    docker restart "dive-hub-opa" >/dev/null 2>&1 || true
    docker restart "${spoke_lower}-opa-${spoke_lower}-1" >/dev/null 2>&1 || true

    log_success "OPA trusted issuers synced for ${spoke_upper}"
    return 0
}

# =============================================================================
# FRONTEND MANAGEMENT
# =============================================================================

##
# Recreate spoke frontend to load new secrets
##
recreate_spoke_frontend() {
    local spoke_code="${1:?Spoke code required}"
    local code_lower=$(lower "$spoke_code")

    ensure_dive_root
    local spoke_dir="${DIVE_ROOT}/instances/${code_lower}"

    [ ! -d "$spoke_dir" ] && return 1

    log_verbose "Recreating frontend for ${code_lower}..."

    (cd "$spoke_dir" && docker compose up -d --force-recreate "frontend-${code_lower}" 2>&1 | head -5) || true
    sleep 5

    return 0
}

# =============================================================================
# NEXTAUTH SCHEMA
# =============================================================================

init_spoke_nextauth_schema() {
    local spoke_code="${1:?Spoke code required}"
    local code_lower=$(lower "$spoke_code")
    local code_upper=$(upper "$spoke_code")

    local postgres_container="dive-spoke-${code_lower}-postgres"

    if ! docker ps --format '{{.Names}}' | grep -q "^${postgres_container}$"; then
        log_error "PostgreSQL container not running: ${postgres_container}"
        return 1
    fi

    docker exec "$postgres_container" psql -U keycloak -d keycloak -c '
CREATE TABLE IF NOT EXISTS "user" (id TEXT PRIMARY KEY, name TEXT, email TEXT UNIQUE, "emailVerified" TIMESTAMP WITH TIME ZONE, image TEXT);
CREATE TABLE IF NOT EXISTS account (id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT, "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, type TEXT NOT NULL, provider TEXT NOT NULL, "providerAccountId" TEXT NOT NULL, refresh_token TEXT, access_token TEXT, expires_at INTEGER, token_type TEXT, scope TEXT, id_token TEXT, session_state TEXT, UNIQUE(provider, "providerAccountId"));
CREATE TABLE IF NOT EXISTS session (id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT, "sessionToken" TEXT NOT NULL UNIQUE, "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, expires TIMESTAMP WITH TIME ZONE NOT NULL);
CREATE TABLE IF NOT EXISTS verification_token (identifier TEXT NOT NULL, token TEXT NOT NULL UNIQUE, expires TIMESTAMP WITH TIME ZONE NOT NULL, PRIMARY KEY (identifier, token));
' 2>/dev/null && log_success "NextAuth tables created for ${code_upper}"
}

# =============================================================================
# ORCHESTRATION FLOWS
# =============================================================================

##
# Configure spoke federation (Spoke→Hub flow)
# This is what a spoke needs to authenticate users against the Hub
##
configure_spoke_federation() {
    local spoke_code="${1:?Spoke code required}"
    local force_flag="${2:-}"
    local code_lower=$(lower "$spoke_code")
    local code_upper=$(upper "$spoke_code")

    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  FEDERATION CONFIGURATION: ${code_upper}${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    [ "$force_flag" = "--force" ] && _clear_federation_state "$code_lower"

    local failed=0

    # Step 1: Configure usa-idp
    log_step "Step 1/6: Configuring usa-idp..."
    if ! _is_step_complete "$code_lower" "configure_usa_idp"; then
        if configure_spoke_usa_idp "$spoke_code"; then
            _mark_step_complete "$code_lower" "configure_usa_idp"
        else
            _mark_step_failed "$code_lower" "configure_usa_idp" "Failed"
            failed=$((failed + 1))
        fi
    else
        log_info "Already complete, skipping"
    fi

    # Step 2: Update spoke client URIs
    log_step "Step 2/6: Updating spoke client redirect URIs..."
    if ! _is_step_complete "$code_lower" "update_spoke_uris"; then
        if update_spoke_redirect_uris "$spoke_code"; then
            _mark_step_complete "$code_lower" "update_spoke_uris"
        else
            failed=$((failed + 1))
        fi
    else
        log_info "Already complete, skipping"
    fi

    # Step 3: Update Hub client URIs
    log_step "Step 3/6: Updating Hub client redirect URIs..."
    if ! _is_step_complete "$code_lower" "update_hub_uris"; then
        if update_hub_redirect_uris "$spoke_code"; then
            _mark_step_complete "$code_lower" "update_hub_uris"
        else
            failed=$((failed + 1))
        fi
    else
        log_info "Already complete, skipping"
    fi

    # Step 4: Sync local secrets
    log_step "Step 4/6: Syncing local secrets..."
    if ! _is_step_complete "$code_lower" "sync_secrets"; then
        if sync_spoke_local_secrets "$spoke_code"; then
            _mark_step_complete "$code_lower" "sync_secrets"
        else
            failed=$((failed + 1))
        fi
    else
        log_info "Already complete, skipping"
    fi

    # Step 5: Create Hub client in spoke
    log_step "Step 5/6: Creating Hub federation client in spoke..."
    if ! _is_step_complete "$code_lower" "create_hub_client"; then
        if ensure_hub_client_in_spoke "$spoke_code"; then
            _mark_step_complete "$code_lower" "create_hub_client"
        else
            failed=$((failed + 1))
        fi
    else
        log_info "Already complete, skipping"
    fi

    # Step 6: Recreate frontend
    log_step "Step 6/6: Recreating frontend..."
    if ! _is_step_complete "$code_lower" "recreate_frontend"; then
        if recreate_spoke_frontend "$spoke_code"; then
            _mark_step_complete "$code_lower" "recreate_frontend"
        else
            failed=$((failed + 1))
        fi
    else
        log_info "Already complete, skipping"
    fi

    echo ""
    if [ $failed -eq 0 ]; then
        log_success "Federation configured successfully for ${code_upper}!"
        _save_federation_state "$code_lower" "$(_load_federation_state "$code_lower" | jq '.status = "complete"')"
    return 0
    else
        log_warn "Federation setup completed with $failed failure(s)"
        return 1
    fi
}

##
# Register spoke in Hub (Hub→Spoke flow)
# This allows Hub users to authenticate via the spoke
##
register_spoke_in_hub() {
    local spoke="${1:-}"
    [ -z "$spoke" ] && return 1

    local spoke_lower=$(lower "$spoke")
    local spoke_upper=$(upper "$spoke")
    local spoke_display_name=$(get_country_name "$spoke_upper" 2>/dev/null || echo "$spoke_upper")

    echo ""
    echo -e "${BOLD}Registering ${spoke_upper} (${spoke_display_name}) in Hub${NC}"
    echo ""

    eval "$(_get_spoke_ports "$spoke")"

    # Step 1: Create Hub client for spoke (Spoke→Hub flow)
    log_step "[1/7] Creating Hub client for spoke..."
    ensure_spoke_client_in_hub "$spoke" || log_warn "Client may already exist"

    # Step 2: Create IdP in Hub
    log_step "[2/7] Creating IdP in Hub..."
    create_spoke_idp_in_hub "$spoke" || return 1

    # Step 3: Create IdP mappers on Hub (to import claims from spoke tokens)
    log_step "[3/7] Creating IdP mappers on Hub..."
    create_hub_idp_mappers "$spoke"

    # Step 4: Create Hub's IdP client in spoke (Hub→Spoke flow)
    # CRITICAL: This client must exist in spoke for Hub→Spoke federation to work
    log_step "[4/7] Creating Hub IdP client in spoke..."
    ensure_hub_idp_client_in_spoke "$spoke" || log_warn "May need manual configuration"

    # Step 5: Create protocol mappers on spoke's federation client
    # CRITICAL: Without these, spoke tokens won't include user attributes!
    log_step "[5/7] Creating protocol mappers on spoke's federation client..."
    ensure_protocol_mappers_on_spoke_client "$spoke" || log_warn "Protocol mappers may need manual configuration"

    # Step 6: Sync Hub IdP secret
    log_step "[6/7] Syncing Hub IdP secret..."
    sync_hub_to_spoke_secrets "$spoke" || log_warn "Secret sync may need manual review"

    # Step 7: Sync OPA
    log_step "[7/7] Syncing OPA trusted issuers..."
    sync_opa_trusted_issuers "$spoke" || log_warn "OPA sync may need manual review"

    echo ""
    log_success "${spoke_upper} registered in Hub successfully"
    return 0
}

##
# Configure all spokes
##
configure_all() {
    ensure_dive_root
    local success=0 fail=0

    for dir in "${DIVE_ROOT}"/instances/*/; do
        local spoke=$(basename "$dir")
        [[ "$spoke" == "hub" || "$spoke" == "usa" || "$spoke" == "shared" || ! -d "$dir" ]] && continue

        local spoke_kc=$(resolve_spoke_container "$spoke" "keycloak" 2>/dev/null)
        if [ -n "$spoke_kc" ]; then
            if configure_spoke_federation "$spoke"; then
                success=$((success + 1))
            else
                fail=$((fail + 1))
            fi
        fi
    done

    echo -e "${BOLD}Batch Complete: $success succeeded, $fail failed${NC}"
    [ $fail -eq 0 ]
}

##
# Register all spokes in Hub
##
register_all_in_hub() {
    ensure_dive_root
    local success=0 fail=0

    for dir in "${DIVE_ROOT}"/instances/*/; do
        local spoke=$(basename "$dir")
        [[ "$spoke" == "hub" || "$spoke" == "usa" || "$spoke" == "shared" || ! -d "$dir" ]] && continue

        local spoke_kc="${spoke}-keycloak-${spoke}-1"
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${spoke_kc}$"; then
            if register_spoke_in_hub "$spoke"; then
                success=$((success + 1))
            else
                fail=$((fail + 1))
            fi
        fi
    done

    echo -e "${BOLD}Registration Complete: $success succeeded, $fail failed${NC}"
    [ $fail -eq 0 ]
}

# =============================================================================
# VERIFICATION
# =============================================================================

verify_federation() {
    local spoke_code="${1:-all}"

    if [ "$spoke_code" = "all" ]; then
        verify_all_federation
        return $?
    fi

    local code_lower=$(lower "$spoke_code")
    local code_upper=$(upper "$spoke_code")

    echo ""
    echo -e "${BOLD}Federation Verification: ${code_upper}${NC}"
    echo ""

    local passed=0 failed=0

    # Service checks
    echo -e "  ${CYAN}Service Health:${NC}"

    echo -n "    Hub Keycloak:      "
    docker ps --format '{{.Names}}' | grep -q "^${HUB_KEYCLOAK_CONTAINER}$" && echo -e "${GREEN}✓${NC}" && passed=$((passed + 1)) || (echo -e "${RED}✗${NC}" && failed=$((failed + 1)))

    echo -n "    Spoke Keycloak:    "
    resolve_spoke_container "$code_lower" "keycloak" >/dev/null 2>&1 && echo -e "${GREEN}✓${NC}" && passed=$((passed + 1)) || (echo -e "${RED}✗${NC}" && failed=$((failed + 1)))

    echo -n "    Spoke Backend:     "
    resolve_spoke_container "$code_lower" "backend" >/dev/null 2>&1 && echo -e "${GREEN}✓${NC}" && passed=$((passed + 1)) || (echo -e "${RED}✗${NC}" && failed=$((failed + 1)))

    echo ""
    echo -e "  ${CYAN}Authentication:${NC}"

    echo -n "    Hub auth:          "
    get_hub_admin_token >/dev/null 2>&1 && echo -e "${GREEN}✓${NC}" && passed=$((passed + 1)) || (echo -e "${RED}✗${NC}" && failed=$((failed + 1)))

    echo -n "    Spoke auth:        "
    get_spoke_admin_token "$spoke_code" >/dev/null 2>&1 && echo -e "${GREEN}✓${NC}" && passed=$((passed + 1)) || (echo -e "${RED}✗${NC}" && failed=$((failed + 1)))

    echo ""
    echo -e "  ${CYAN}Client Configuration:${NC}"

    echo -n "    Hub client:        "
    get_hub_client_secret "$spoke_code" >/dev/null 2>&1 && echo -e "${GREEN}✓${NC}" && passed=$((passed + 1)) || (echo -e "${RED}✗${NC}" && failed=$((failed + 1)))

    echo -n "    Spoke client:      "
    get_spoke_local_client_secret "$spoke_code" >/dev/null 2>&1 && echo -e "${GREEN}✓${NC}" && passed=$((passed + 1)) || (echo -e "${RED}✗${NC}" && failed=$((failed + 1)))

    echo ""
    echo "  ────────────────────────────────────────────"
    echo -e "  Result: ${GREEN}$passed passed${NC}, ${RED}$failed failed${NC}"
    echo ""

    [ $failed -eq 0 ]
}

verify_all_federation() {
    ensure_dive_root

    echo ""
    echo -e "${BOLD}Federation Verification: All Spokes${NC}"
    echo ""

    echo -n "  Hub Keycloak: "
    docker ps --format '{{.Names}}' | grep -q "^${HUB_KEYCLOAK_CONTAINER}$" && echo -e "${GREEN}✓${NC}" || (echo -e "${RED}✗${NC}" && return 1)

    echo ""
    printf "  %-10s  %-8s  %-8s  %-10s\n" "SPOKE" "KC" "AUTH" "STATUS"
    echo "  ──────────────────────────────────────────"

    local ok=0 fail=0

    for dir in "${DIVE_ROOT}"/instances/*/; do
        local spoke=$(basename "$dir")
        [[ "$spoke" == "hub" || "$spoke" == "usa" || "$spoke" == "shared" || ! -d "$dir" ]] && continue

        local kc_ok="✗" auth_ok="✗" status="${RED}FAIL${NC}"

        resolve_spoke_container "$spoke" "keycloak" >/dev/null 2>&1 && kc_ok="${GREEN}✓${NC}"
        get_spoke_admin_token "$spoke" >/dev/null 2>&1 && auth_ok="${GREEN}✓${NC}"

        if [ "$kc_ok" != "✗" ] && [ "$auth_ok" != "✗" ]; then
            status="${GREEN}OK${NC}"
            ok=$((ok + 1))
        else
            fail=$((fail + 1))
        fi

        printf "  %-10s  %b        %b        %b\n" "$(upper "$spoke")" "$kc_ok" "$auth_ok" "$status"
    done

    echo ""
    echo "  Summary: $ok OK, $fail failed"
    echo ""

    [ $fail -eq 0 ]
}

# =============================================================================
# STATE MANAGEMENT
# =============================================================================

show_federation_state() {
    local spoke_code="${1:-}"
    [ -z "$spoke_code" ] && return 1

    local code_lower=$(lower "$spoke_code")
    local state_file=$(_get_federation_state_file "$code_lower")

    echo ""
    echo -e "${BOLD}Federation State: $(upper "$spoke_code")${NC}"
    echo ""

    if [ ! -f "$state_file" ]; then
        log_info "No state file found"
        return 1
    fi

    local state=$(cat "$state_file")
    echo "  Status: $(echo "$state" | jq -r '.status // "unknown"')"
    echo "  Last update: $(echo "$state" | jq -r '.lastUpdate // "never"')"
        echo ""
    echo "  Steps:"
    echo "$state" | jq -r '.steps | to_entries[] | "    \(.key): \(.value.status)"'
    echo ""
}

recover_federation_setup() {
    local spoke_code="${1:-}"
    [ -z "$spoke_code" ] && return 1

    local code_lower=$(lower "$spoke_code")
    local state_file=$(_get_federation_state_file "$code_lower")

    if [ ! -f "$state_file" ]; then
        configure_spoke_federation "$spoke_code"
        return $?
    fi

    local state=$(cat "$state_file")
    local failed_steps=$(echo "$state" | jq -r '.steps | to_entries[] | select(.value.status == "failed") | .key')

    if [ -z "$failed_steps" ]; then
        configure_spoke_federation "$spoke_code"
        return $?
    fi

    for step in $failed_steps; do
        _clear_federation_state "$code_lower" "$step"
    done

    configure_spoke_federation "$spoke_code"
}

# =============================================================================
# CLI DISPATCH
# =============================================================================

module_federation_setup() {
    local action="${1:-help}"
    shift || true

    case "$action" in
        # Primary commands
        configure)
            if [ "${1:-}" = "all" ] || [ -z "$1" ]; then
                configure_all
            else
            configure_spoke_federation "$@"
            fi
            ;;
        register-hub)
            if [ "${1:-}" = "all" ] || [ -z "$1" ]; then
                register_all_in_hub
            else
                register_spoke_in_hub "$@"
            fi
            ;;
        verify)
            verify_federation "${1:-all}"
            ;;
        state)
            show_federation_state "$@"
            ;;
        recover)
            recover_federation_setup "$@"
            ;;
        fix-idp-urls)
            fix_hub_idp_urls "${1:-all}"
            ;;
        sync-opa)
            if [ "${1:-}" = "all" ]; then
                for dir in "${DIVE_ROOT}"/instances/*/; do
                    local s=$(basename "$dir")
                    [[ "$s" != "hub" && "$s" != "usa" && "$s" != "shared" ]] && sync_opa_trusted_issuers "$s"
                done
            else
                sync_opa_trusted_issuers "$@"
            fi
            ;;
        setup-claims)
            setup_claims "$@"
            ;;
        init-nextauth)
            init_spoke_nextauth_schema "$@"
            ;;

        # Deprecated aliases (backwards compatibility)
        configure-all)
            log_warn "Deprecated: Use 'configure all' instead"
            configure_all
            ;;
        register-hub-all)
            log_warn "Deprecated: Use 'register-hub all' instead"
            register_all_in_hub
            ;;
        verify-all)
            log_warn "Deprecated: Use 'verify all' instead"
            verify_federation "all"
            ;;
        sync-opa-all)
            log_warn "Deprecated: Use 'sync-opa all' instead"
            for dir in "${DIVE_ROOT}"/instances/*/; do
                local s=$(basename "$dir")
                [[ "$s" != "hub" && "$s" != "usa" && "$s" != "shared" ]] && sync_opa_trusted_issuers "$s"
            done
            ;;
        configure-idp)
            log_warn "Deprecated: Use 'configure <spoke>' instead"
            configure_spoke_usa_idp "$@"
            ;;
        update-spoke-uris)
            update_spoke_redirect_uris "$@"
            ;;
        update-hub-uris)
            update_hub_redirect_uris "$@"
            ;;
        sync-env|sync-hub-secret|sync-usa-idp-secret|sync-frontend-secret)
            log_warn "Deprecated: Use 'configure <spoke>' instead"
            sync_spoke_local_secrets "$@"
            ;;
        create-hub-client)
            log_warn "Deprecated: Use 'configure <spoke>' instead"
            ensure_hub_client_in_spoke "$@"
            ;;
        create-spoke-client)
            log_warn "Deprecated: Use 'register-hub <spoke>' instead"
            ensure_spoke_client_in_hub "$@"
            ;;
        get-hub-secret)
            get_hub_client_secret "$@"
            ;;
        get-spoke-secret)
            get_spoke_local_client_secret "$@"
            ;;
        recreate-frontend)
            recreate_spoke_frontend "$@"
            ;;
        assign-scopes|create-mappers)
            log_warn "Deprecated: Use 'setup-claims <spoke>' instead"
            setup_claims "$@"
            ;;
        fix-issuer|fix-issuer-all)
            log_warn "Deprecated: Realm issuer is now auto-configured"
            ;;
        delete-user|delete-hub-user)
            log_warn "Use Keycloak admin console to delete users"
            ;;
        *)
            module_federation_setup_help
            ;;
    esac
}

module_federation_setup_help() {
    echo -e "${BOLD}Federation Setup Commands:${NC}"
    echo ""
    echo -e "  ${YELLOW}═══ PRIMARY COMMANDS ═══${NC}"
    echo "  ${CYAN}configure${NC} <spoke|all>     Configure spoke-side federation (Spoke→Hub)"
    echo "  ${CYAN}register-hub${NC} <spoke|all>  Register spoke in Hub (Hub→Spoke)"
    echo "  ${CYAN}verify${NC} <spoke|all>        Verify federation configuration"
    echo ""
    echo -e "  ${YELLOW}═══ SETUP ═══${NC}"
    echo "  ${CYAN}sync-opa${NC} <spoke|all>      Sync OPA trusted issuers"
    echo "  ${CYAN}setup-claims${NC} <spoke>      Setup DIVE claim passthrough"
    echo "  ${CYAN}init-nextauth${NC} <spoke>     Initialize NextAuth schema"
    echo ""
    echo -e "  ${YELLOW}═══ TROUBLESHOOTING ═══${NC}"
    echo "  ${CYAN}fix-idp-urls${NC} [spoke|all]  Fix IdP URLs (host.docker.internal → localhost)"
    echo "  ${CYAN}state${NC} <spoke>             Show federation setup state"
    echo "  ${CYAN}recover${NC} <spoke>           Recover from failed setup"
    echo ""
    echo -e "  ${YELLOW}═══ UTILITY ═══${NC}"
    echo "  ${CYAN}get-hub-secret${NC} <spoke>    Get Hub client secret"
    echo "  ${CYAN}get-spoke-secret${NC} <spoke>  Get spoke client secret"
    echo ""
    echo "Examples:"
    echo "  ./dive federation-setup configure fra"
    echo "  ./dive federation-setup register-hub fra"
    echo "  ./dive federation-setup verify all"
    echo "  ./dive federation-setup sync-opa all"
    echo ""
    echo "Complete New Spoke Setup:"
    echo "  1. ./dive spoke deploy <code>"
    echo "  2. ./dive federation-setup register-hub <code>"
    echo "  3. ./dive federation-setup configure <code>"
    echo "  4. ./dive federation-setup verify <code>"
    echo ""
}
