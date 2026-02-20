#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Common Port & Environment Helpers
# =============================================================================
# Extracted from common.sh (Phase 13e)
# =============================================================================

[ -n "${DIVE_COMMON_ENV_LOADED:-}" ] && return 0

# =============================================================================

get_instance_ports() {
    local code="$1"
    local code_upper
    code_upper=$(upper "$code")
    local port_offset=0

    # SSOT: Always load NATO database for port calculations
    if [ -z "${NATO_COUNTRIES_LOADED:-}" ]; then
        local nato_script="${DIVE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}/scripts/nato-countries.sh"
        if [ -f "$nato_script" ]; then
            # shellcheck source=../../nato-countries.sh
            source "$nato_script" 2>/dev/null
            export NATO_COUNTRIES_LOADED=1
        fi
    fi

    # Check if it's a NATO country (uses centralized database)
    if type -t is_nato_country &>/dev/null && is_nato_country "$code_upper" 2>/dev/null; then
        # Use centralized NATO port offset
        if type -t get_country_offset &>/dev/null; then
            port_offset=$(get_country_offset "$code_upper" 2>/dev/null || echo "0")
        fi
    elif type -t is_partner_nation &>/dev/null && is_partner_nation "$code_upper" 2>/dev/null; then
        # Partner nations get offsets 32-39
        case "$code_upper" in
            AUS) port_offset=32 ;;
            NZL) port_offset=33 ;;
            JPN) port_offset=34 ;;
            KOR) port_offset=35 ;;
            ISR) port_offset=36 ;;
            UKR) port_offset=37 ;;
            *)   port_offset=$(( ($(echo "$code_upper" | cksum | cut -d' ' -f1) % 10) + 38 )) ;;
        esac
    elif type -t is_custom_test_code &>/dev/null && is_custom_test_code "$code_upper" 2>/dev/null; then
        # Custom test codes (TST, DEV, QAA, etc.) get offsets 200+ from iso-countries.sh
        if type -t get_custom_test_offset &>/dev/null; then
            port_offset=$(get_custom_test_offset "$code_upper" 2>/dev/null || echo "200")
        else
            port_offset=200  # Default for test codes if function not available
        fi
    elif type -t is_iso_country &>/dev/null && is_iso_country "$code_upper" 2>/dev/null; then
        # ISO countries (non-NATO, non-Partner) use calculated offsets 40-199
        if type -t get_iso_country_offset &>/dev/null; then
            port_offset=$(get_iso_country_offset "$code_upper" 2>/dev/null || echo "40")
        fi
    else
        # Unknown countries: use hash-based offset (48+) to avoid conflicts
        port_offset=$(( ($(echo "$code_upper" | cksum | cut -d' ' -f1) % 20) + 48 ))
        # FIXED (Dec 2025): Redirect warning to stderr to avoid polluting stdout
        # This function's stdout is captured by eval, so logging must go to stderr
        log_warn "Country '$code_upper' not in NATO database, using hash-based port offset: $port_offset" >&2
    fi

    # Export calculated ports (can be sourced or eval'd)
    # Port scheme ensures no conflicts for 100+ simultaneous spokes
    # SSOT: Formulas MUST match get_country_ports() in nato-countries.sh
    echo "export SPOKE_PORT_OFFSET=$port_offset"
    echo "export SPOKE_FRONTEND_PORT=$((3000 + port_offset))"
    echo "export SPOKE_BACKEND_PORT=$((4000 + port_offset))"
    echo "export SPOKE_KEYCLOAK_HTTPS_PORT=$((8443 + port_offset))"
    echo "export SPOKE_KEYCLOAK_HTTP_PORT=$((8080 + port_offset))"
    echo "export SPOKE_POSTGRES_PORT=$((5432 + port_offset))"
    echo "export SPOKE_MONGODB_PORT=$((27017 + port_offset))"
    echo "export SPOKE_REDIS_PORT=$((6379 + port_offset))"
    echo "export SPOKE_OPA_PORT=$((8181 + port_offset * 10))"
    echo "export SPOKE_KAS_PORT=$((9000 + port_offset))"
}

##
# Wait for Keycloak Admin API to be fully ready
#
# This function ensures Keycloak is not just "healthy" according to Docker,
# but that the admin API is fully initialized and ready to accept requests.
#
# Background:
# Docker healthchecks often pass before Keycloak admin console is ready,
# causing authentication failures during federation setup. This was masked
# by retry logic (removed in Phase 1) which was a bandaid fix.
#
# Arguments:
#   $1 - Container name (e.g., "dive-hub-keycloak" or "dive-spoke-est-keycloak")
#   $2 - Max wait time in seconds (default: 180)
#   $3 - Admin password (optional, will try to retrieve if not provided)
#
# Returns:
#   0 - Admin API ready
#   1 - Timeout or error
#
# Usage:
#   wait_for_keycloak_admin_api_ready "dive-spoke-est-keycloak" 180
#   wait_for_keycloak_admin_api_ready "dive-hub-keycloak" 120 "$admin_password"
##
wait_for_keycloak_admin_api_ready() {
    local container_name="${1:?container name required}"
    local max_wait="${2:-$DIVE_TIMEOUT_KEYCLOAK_READY}"
    local admin_password="${3:-}"

    log_verbose "Waiting for Keycloak admin API to be ready: $container_name (max ${max_wait}s)"

    # Extract instance type and code from container name
    local instance_type="hub"
    local instance_code=""
    if [[ "$container_name" =~ spoke-([a-z]+)-keycloak ]]; then
        instance_type="spoke"
        instance_code="${BASH_REMATCH[1]}"
    fi

    # Check 1: Container must be running
    if ! docker ps --format '{{.Names}}' | grep -q "^${container_name}$"; then
        log_error "Container not running: $container_name"
        return 1
    fi

    # Check 2: Container must be healthy
    local start_time
    start_time=$(date +%s)
    local elapsed=0
    local healthy=false

    # PERFORMANCE FIX (2026-02-11): Skip wait loop if already healthy
    # By CONFIGURATION phase, containers are already healthy from DEPLOYMENT phase
    local health_status
    health_status=$(docker inspect --format='{{.State.Health.Status}}' "$container_name" 2>/dev/null || echo "unknown")
    if [ "$health_status" = "healthy" ]; then
        healthy=true
        log_verbose "Container already healthy (0s)"
    else
        # Original wait loop for containers that aren't healthy yet
        while [ $elapsed -lt $max_wait ]; do
            health_status=$(docker inspect --format='{{.State.Health.Status}}' "$container_name" 2>/dev/null || echo "unknown")

            if [ "$health_status" = "healthy" ]; then
                healthy=true
                log_verbose "Container healthy after ${elapsed}s"
                break
            fi

            sleep 2
            elapsed=$(( $(date +%s) - start_time ))

            if [ $((elapsed % 10)) -eq 0 ]; then
                log_verbose "Waiting for container health... ${elapsed}s elapsed (status: $health_status)"
            fi
        done
    fi

    if [ "$healthy" = "false" ]; then
        log_error "Container did not become healthy within ${max_wait}s"
        return 1
    fi

    # Check 3: Admin user can authenticate
    # Get admin password if not provided
    if [ -z "$admin_password" ]; then
        if [ "$instance_type" = "hub" ]; then
            # Hub: Try suffixed _USA variants first (normalized), then unsuffixed (backward compat)
            admin_password="${KEYCLOAK_ADMIN_PASSWORD:-}"

            # Try to get from GCP if still empty
            if [ -z "$admin_password" ] && command -v gcloud &>/dev/null; then
                admin_password=$(gcloud secrets versions access latest --secret=dive-v3-keycloak-usa --project="${GCP_PROJECT:-dive25}" 2>/dev/null || echo "")
            fi
        else
            # Spoke: Get from GCP or environment
            local code_upper
            code_upper=$(echo "$instance_code" | tr '[:lower:]' '[:upper:]')
            local pass_var="KEYCLOAK_ADMIN_PASSWORD_${code_upper}"
            admin_password="${!pass_var:-}"

            # CRITICAL FIX (2026-01-28): Use correct GCP secret name with "admin-password"
            if [ -z "$admin_password" ] && command -v gcloud &>/dev/null; then
                admin_password=$(gcloud secrets versions access latest \
                    --secret="dive-v3-keycloak-admin-password-${instance_code}" \
                    --project="${GCP_PROJECT:-dive25}" 2>/dev/null || echo "")
            fi
        fi
    fi

    if [ -z "$admin_password" ]; then
        log_error "Cannot verify admin API readiness: admin password not available"
        log_verbose "Checked: function argument, ${pass_var:-KEYCLOAK_ADMIN_PASSWORD}, GCP secret"
        log_verbose "GCP secret name should be: dive-v3-keycloak-admin-password-${instance_code:-hub}"
        return 1
    fi

    # Check 4: Can authenticate and get token
    local authenticated=false
    start_time=$(date +%s)
    elapsed=0

    while [ $elapsed -lt $max_wait ]; do
        # Try to get admin token
        local auth_response
        auth_response=$(docker exec "$container_name" curl -s --max-time "$DIVE_TIMEOUT_CURL_DEFAULT" \
            -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
            -d "grant_type=password" \
            -d "username=admin" \
            -d "password=${admin_password}" \
            -d "client_id=admin-cli" 2>&1)

        # Check if we got a token
        local access_token
        access_token=$(echo "$auth_response" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

        if [ -n "$access_token" ]; then
            authenticated=true
            log_verbose "Admin API authenticated successfully after ${elapsed}s"
            break
        fi

        # Log errors for debugging (verbose only)
        if echo "$auth_response" | grep -q "error"; then
            local error_desc
            error_desc=$(echo "$auth_response" | grep -o '"error_description":"[^"]*' | cut -d'"' -f4)
            if [ -n "$error_desc" ] && [ $((elapsed % 30)) -eq 0 ]; then
                log_verbose "Authentication error: $error_desc (will retry)"
            fi
        fi

        sleep 2
        elapsed=$(( $(date +%s) - start_time ))

        if [ $((elapsed % 15)) -eq 0 ]; then
            log_verbose "Waiting for admin API authentication... ${elapsed}s elapsed"
        fi
    done

    if [ "$authenticated" = "false" ]; then
        log_error "Admin API did not become ready within ${max_wait}s"
        log_error "Container is healthy but authentication fails - Keycloak may still be initializing"
        return 1
    fi

    # Check 5: Master realm is accessible
    local realm_check
    realm_check=$(docker exec "$container_name" curl -s --max-time "$DIVE_TIMEOUT_CURL_QUICK" \
        "http://localhost:8080/realms/master" 2>&1)

    if ! echo "$realm_check" | grep -q '"realm":"master"'; then
        log_warn "Master realm not fully accessible yet, but authentication works"
        # Don't fail - authentication working is sufficient
    fi

    log_success "Keycloak admin API ready: $container_name (total wait: ${elapsed}s)"
    return 0
}

# Ensure DIVE_ROOT is set
ensure_dive_root() {
    if [ -z "$DIVE_ROOT" ]; then
        local root_path
        root_path="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
        export DIVE_ROOT="$root_path"
    fi
}

##
# Detect and return Docker command location
# Handles Docker Desktop on macOS where docker may not be in PATH
# Returns full path to docker binary or 'docker' if in PATH
##
detect_docker_command() {
    # Check if docker is in PATH
    if command -v docker >/dev/null 2>&1; then
        echo "docker"
        return 0
    fi

    # Try common Docker Desktop locations
    local docker_paths=(
        "/usr/local/bin/docker"
        "/Applications/Docker.app/Contents/Resources/bin/docker"
        "/opt/homebrew/bin/docker"
    )

    for docker_path in "${docker_paths[@]}"; do
        if [ -x "$docker_path" ]; then
            echo "$docker_path"
            return 0
        fi
    done

    # Docker not found
    return 1
}

# Initialize Docker command (called once at module load)
if [ -z "${DOCKER_CMD:-}" ]; then
    if DOCKER_CMD=$(detect_docker_command); then
        export DOCKER_CMD
    else
        # Don't fail here - let individual commands handle the error
        export DOCKER_CMD="docker"
    fi
fi

# =============================================================================

export DIVE_COMMON_ENV_LOADED=1
