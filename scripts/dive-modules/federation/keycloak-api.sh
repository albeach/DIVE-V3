#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Keycloak Admin API Abstraction Layer
# =============================================================================
# Provides a unified interface for Keycloak admin API calls that works both
# locally (via docker exec) and remotely (via HTTPS).
#
# This replaces all hardcoded `docker exec ... curl http://localhost:8080/admin/...`
# patterns throughout the federation codebase, enabling federation setup
# across completely separate networks.
#
# Usage:
#   keycloak_admin_api "GBR" "GET" "realms/dive-v3-broker-gbr/identity-provider/instances"
#   keycloak_admin_api "USA" "POST" "realms/dive-v3-broker-usa/clients" "$json_body"
# =============================================================================

[ -n "${KEYCLOAK_API_LOADED:-}" ] && return 0
export KEYCLOAK_API_LOADED=1

# Token cache (associative array: instance_code -> "token|expiry_epoch")
declare -gA _KC_TOKEN_CACHE 2>/dev/null || true

# =============================================================================
# ADMIN TOKEN MANAGEMENT
# =============================================================================

##
# Get Keycloak admin token for any instance (hub or spoke).
# Caches tokens for 50s (Keycloak tokens last 60s).
#
# Arguments:
#   $1 - Instance code (e.g., USA, GBR)
#
# Returns:
#   Access token on stdout
##
keycloak_get_admin_token() {
    local instance_code="${1:?Instance code required}"
    local code_upper
    code_upper=$(upper "$instance_code")
    local code_lower
    code_lower=$(lower "$instance_code")

    # Check cache
    local cached="${_KC_TOKEN_CACHE[$code_upper]:-}"
    if [ -n "$cached" ]; then
        local cached_token="${cached%%|*}"
        local cached_expiry="${cached##*|}"
        local now
        now=$(date +%s)
        if [ "$now" -lt "$cached_expiry" ]; then
            echo "$cached_token"
            return 0
        fi
    fi

    # Resolve admin password
    local admin_pass=""

    # Try SSOT helper first
    if type _get_keycloak_admin_password_ssot &>/dev/null; then
        local container_name
        if [ "$code_upper" = "USA" ]; then
            container_name="${HUB_KEYCLOAK_CONTAINER:-dive-hub-keycloak}"
        else
            container_name="dive-spoke-${code_lower}-keycloak"
        fi
        admin_pass=$(_get_keycloak_admin_password_ssot "$container_name" "$code_lower" 2>/dev/null) || true
    fi

    # Fallback: explicit env var or get_keycloak_admin_password helper
    if [ -z "$admin_pass" ]; then
        if [ "$code_upper" = "USA" ]; then
            admin_pass="${KEYCLOAK_ADMIN_PASSWORD:-}"
        fi
    fi
    if [ -z "$admin_pass" ] && type get_keycloak_admin_password &>/dev/null; then
        admin_pass=$(get_keycloak_admin_password "$code_upper" 2>/dev/null) || true
    fi

    # Fallback: container env (local only)
    if [ -z "$admin_pass" ] && is_spoke_local "$instance_code" 2>/dev/null; then
        local container_name
        if [ "$code_upper" = "USA" ]; then
            container_name="${HUB_KEYCLOAK_CONTAINER:-dive-hub-keycloak}"
        else
            container_name="dive-spoke-${code_lower}-keycloak"
        fi
        admin_pass=$(docker exec "$container_name" printenv KC_BOOTSTRAP_ADMIN_PASSWORD 2>/dev/null || \
                    docker exec "$container_name" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null) || true
    fi

    if [ -z "$admin_pass" ]; then
        log_error "Cannot resolve admin password for $code_upper Keycloak"
        return 1
    fi

    # Determine token endpoint
    local admin_url
    admin_url=$(resolve_keycloak_admin_url "$instance_code")

    local token=""

    if [[ "$admin_url" == local://* ]]; then
        # Local: docker exec path
        local container_name="${admin_url#local://}"
        token=$(docker exec "$container_name" curl -sf --max-time 10 \
            -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
            -d "grant_type=password" -d "username=admin" -d "password=${admin_pass}" \
            -d "client_id=admin-cli" 2>/dev/null | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)
    else
        # Remote: HTTPS path
        token=$(curl -sf --max-time 10 -X POST \
            "${admin_url}/realms/master/protocol/openid-connect/token" \
            -H "Content-Type: application/x-www-form-urlencoded" \
            -d "grant_type=password" -d "username=admin" -d "password=${admin_pass}" \
            -d "client_id=admin-cli" \
            --insecure 2>/dev/null | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)
    fi

    if [ -z "$token" ]; then
        log_error "Failed to get admin token for $code_upper Keycloak"
        return 1
    fi

    # Cache token (50s TTL, tokens last 60s)
    local expiry
    expiry=$(( $(date +%s) + 50 ))
    _KC_TOKEN_CACHE[$code_upper]="${token}|${expiry}"

    echo "$token"
}
export -f keycloak_get_admin_token

# =============================================================================
# UNIFIED ADMIN API CALL
# =============================================================================

##
# Execute a Keycloak admin API call against any instance (local or remote).
#
# Arguments:
#   $1 - Instance code (e.g., USA, GBR)
#   $2 - HTTP method (GET, POST, PUT, DELETE)
#   $3 - API path relative to /admin/ (e.g., "realms/dive-v3-broker-usa/clients")
#   $4 - Request body (optional, for POST/PUT)
#   $5 - Extra curl flags (optional, e.g., "-w \nHTTP_CODE:%{http_code}")
#
# Returns:
#   Response body on stdout, exit code 0 on success, 1 on failure
##
keycloak_admin_api() {
    local instance_code="${1:?Instance code required}"
    local method="${2:?HTTP method required}"
    local api_path="${3:?API path required}"
    local body="${4:-}"
    local extra_flags="${5:-}"

    local code_upper
    code_upper=$(upper "$instance_code")

    # Get admin token (with caching)
    local token
    token=$(keycloak_get_admin_token "$instance_code")
    if [ -z "$token" ]; then
        return 1
    fi

    local admin_url
    admin_url=$(resolve_keycloak_admin_url "$instance_code")

    local result=""
    local exit_code=0
    local max_retries=3
    local retry_delay=2

    local attempt
    for ((attempt=1; attempt<=max_retries; attempt++)); do
        if [[ "$admin_url" == local://* ]]; then
            # Local: docker exec path
            local container_name="${admin_url#local://}"
            local curl_cmd="curl -sf --max-time 15"
            curl_cmd+=" -X ${method}"
            curl_cmd+=" -H 'Authorization: Bearer ${token}'"

            if [ -n "$body" ]; then
                curl_cmd+=" -H 'Content-Type: application/json'"
                # Use stdin for body to avoid quoting issues in docker exec
                result=$(echo "$body" | docker exec -i "$container_name" bash -c \
                    "${curl_cmd} ${extra_flags} 'http://localhost:8080/admin/${api_path}' -d @-" 2>/dev/null)
                exit_code=$?
            else
                result=$(docker exec "$container_name" bash -c \
                    "${curl_cmd} ${extra_flags} 'http://localhost:8080/admin/${api_path}'" 2>/dev/null)
                exit_code=$?
            fi
        else
            # Remote: HTTPS path
            local curl_args=(-sf --max-time 15 -X "$method" --insecure)
            curl_args+=(-H "Authorization: Bearer ${token}")

            if [ -n "$body" ]; then
                curl_args+=(-H "Content-Type: application/json")
                curl_args+=(-d "$body")
            fi

            # shellcheck disable=SC2086
            result=$(curl "${curl_args[@]}" ${extra_flags} "${admin_url}/admin/${api_path}" 2>/dev/null)
            exit_code=$?
        fi

        # Success
        if [ $exit_code -eq 0 ]; then
            echo "$result"
            return 0
        fi

        # On 401 (token expired), refresh and retry
        if [ $exit_code -ne 0 ] && [ $attempt -lt $max_retries ]; then
            # Invalidate cache and get fresh token
            unset "_KC_TOKEN_CACHE[$code_upper]"
            token=$(keycloak_get_admin_token "$instance_code" 2>/dev/null) || true
            if [ -z "$token" ]; then
                log_warn "Token refresh failed for $code_upper (attempt $attempt/$max_retries)"
            fi
            sleep $retry_delay
            retry_delay=$((retry_delay * 2))
        fi
    done

    # All retries exhausted
    echo "$result"
    return 1
}
export -f keycloak_admin_api

##
# Execute a Keycloak admin API call with HTTP status code capture.
# Returns body on stdout, HTTP code appended as "HTTP_CODE:NNN" on last line.
#
# Arguments: same as keycloak_admin_api
##
keycloak_admin_api_with_status() {
    local instance_code="${1:?Instance code required}"
    local method="${2:?HTTP method required}"
    local api_path="${3:?API path required}"
    local body="${4:-}"

    keycloak_admin_api "$instance_code" "$method" "$api_path" "$body" "-w \nHTTP_CODE:%{http_code}"
}
export -f keycloak_admin_api_with_status

##
# Pre-flight check: is the Keycloak admin API reachable for a given instance?
#
# Arguments:
#   $1 - Instance code (e.g., USA, GBR)
#
# Returns:
#   0 if reachable, 1 if not
##
keycloak_admin_api_available() {
    local instance_code="${1:?Instance code required}"

    local admin_url
    admin_url=$(resolve_keycloak_admin_url "$instance_code")

    if [[ "$admin_url" == local://* ]]; then
        local container_name="${admin_url#local://}"
        # Check container exists and is running
        docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${container_name}$" || return 1
        # Check admin API responds
        docker exec "$container_name" curl -sf --max-time 5 \
            "http://localhost:8080/health/ready" >/dev/null 2>&1
        return $?
    else
        # Remote: check HTTPS health endpoint
        curl -sf --max-time 5 --insecure "${admin_url}/health/ready" >/dev/null 2>&1
        return $?
    fi
}
export -f keycloak_admin_api_available
