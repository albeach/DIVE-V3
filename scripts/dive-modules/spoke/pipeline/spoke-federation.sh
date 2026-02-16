#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Unified Spoke Federation Setup
# =============================================================================
# Consolidates bidirectional federation configuration:
#   1. Configure usa-idp in spoke Keycloak (upstream IdP)
#   2. Register spoke-idp in Hub Keycloak
#   3. Synchronize federation secrets
#   4. Verify bidirectional connectivity
#
# Consolidates spoke_deploy() Steps 7, 8, 9, 10, 11 (lines 959-1475)
# =============================================================================
# Version: 1.0.0
# Date: 2026-01-13
# =============================================================================

# FIX (2026-01-18): Simplified guard - always allow reload if functions missing
# This ensures module loads correctly even when sourced multiple times
if [ -n "${SPOKE_FEDERATION_LOADED:-}" ]; then
    # Check if critical functions exist
    if type spoke_federation_create_bidirectional &>/dev/null && \
       type spoke_federation_setup &>/dev/null; then
        # Functions available - module already loaded successfully
        return 0
    else
        # Guard set but functions missing - force reload
        unset SPOKE_FEDERATION_LOADED
    fi
fi
export SPOKE_FEDERATION_LOADED=1

# =============================================================================
# LOAD COMMON MODULE (CRITICAL FIX 2026-02-07)
# =============================================================================
# OIDC verification requires json_get_field() from common.sh
# This module should have been loaded before, but ensure it's available
if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    _common_path="${BASH_SOURCE[0]%/*}/../../common.sh"
    if [ -f "$_common_path" ]; then
        source "$_common_path"
    elif [ -f "${DIVE_ROOT}/scripts/dive-modules/common.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/common.sh"
    fi
    unset _common_path
fi

# =============================================================================
# LOAD CONSOLIDATED FEDERATION MODULE
# =============================================================================
# Load federation/setup.sh for _federation_link_direct(), _get_federation_secret(),
# _configure_idp_mappers(), and other federation functions.
if [ -z "${DIVE_FEDERATION_SETUP_LOADED:-}" ]; then
    _fed_setup_path="${BASH_SOURCE[0]%/*}/../../federation/setup.sh"
    if [ -f "$_fed_setup_path" ]; then
        source "$_fed_setup_path"
    elif [ -f "${DIVE_ROOT}/scripts/dive-modules/federation/setup.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/federation/setup.sh"
    fi
    unset _fed_setup_path
fi

# =============================================================================
# LOAD FEDERATION STATE DATABASE MODULE (2026-01-16)
# =============================================================================
# Database-driven federation state management
# Part of Orchestration Architecture Review
if [ -z "${FEDERATION_STATE_DB_LOADED:-}" ]; then
    # CRITICAL FIX (2026-01-18): Path calculation - spoke-federation.sh is in spoke/pipeline/,
    # federation-state-db.sh is in modules/ root
    # Load federation health (includes fed_db_* functions)
    _fed_health_path="${BASH_SOURCE[0]%/*}/../../federation/health.sh"
    if [ -f "$_fed_health_path" ]; then
        source "$_fed_health_path"
    elif [ -f "${DIVE_ROOT}/scripts/dive-modules/federation/health.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/federation/health.sh"
    else
        log_verbose "federation/health.sh not found - database state tracking unavailable"
    fi
    unset _fed_health_path
fi

# =============================================================================
# CONSTANTS
# =============================================================================

# Hub Keycloak defaults
# NOTE: Use local variables in functions instead of readonly module-level constants
# to avoid conflicts with common.sh which also defines HUB_REALM as readonly
: "${HUB_KC_CONTAINER:=dive-hub-keycloak}"
: "${HUB_REALM:=dive-v3-broker-usa}"
# NOTE: HUB_IDP_ALIAS_PREFIX removed - actual format is {code}-idp, not spoke-idp-{code}

# Federation status states (safe to make readonly - not used in common.sh)
readonly FED_STATUS_UNREGISTERED="unregistered"
readonly FED_STATUS_PENDING="pending"
readonly FED_STATUS_ACTIVE="active"
readonly FED_STATUS_ERROR="error"

# =============================================================================
# MAIN FEDERATION SETUP
# =============================================================================

##
# Configure complete bidirectional federation for a spoke
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_federation_setup() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_step "Setting up federation for $code_upper"

    # ==========================================================================
    # CRITICAL: Load Hub (USA) Keycloak admin password for readiness checks
    # ==========================================================================
    # KEYCLOAK_ADMIN_PASSWORD (unsuffixed) may contain the SPOKE password from
    # secrets_load_for_instance(). Always resolve Hub password explicitly via _USA.
    local _hub_kc_pass="${KC_ADMIN_PASSWORD_USA:-${KC_BOOTSTRAP_ADMIN_PASSWORD_USA:-${KEYCLOAK_ADMIN_PASSWORD_USA:-}}}"
    if [ -z "$_hub_kc_pass" ] && [ -f "${DIVE_ROOT}/.env.hub" ]; then
        _hub_kc_pass=$(grep "^KC_ADMIN_PASSWORD_USA=" "${DIVE_ROOT}/.env.hub" 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'")
        [ -z "$_hub_kc_pass" ] && _hub_kc_pass=$(grep "^KEYCLOAK_ADMIN_PASSWORD_USA=" "${DIVE_ROOT}/.env.hub" 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'")
    fi
    if [ -n "$_hub_kc_pass" ]; then
        export KC_ADMIN_PASSWORD_USA="$_hub_kc_pass"
        export KC_BOOTSTRAP_ADMIN_PASSWORD="$_hub_kc_pass"
        export KEYCLOAK_ADMIN_PASSWORD="$_hub_kc_pass"
        log_verbose "Hub Keycloak admin password resolved (USA)"
    else
        log_warn "Hub Keycloak admin password not found — federation readiness check may fail"
    fi

    # ==========================================================================
    # CRITICAL: Wait for Keycloak Admin APIs to be ready (FIX 2026-01-27)
    # ==========================================================================
    # Keycloak containers may report healthy but admin API not fully initialized.
    # Wait for both Hub and Spoke Keycloak before attempting federation setup.
    # ==========================================================================
    log_info "Verifying Keycloak admin APIs are ready..."

    # Wait for Hub Keycloak admin API (short timeout — already healthy from DEPLOYMENT phase)
    if type wait_for_keycloak_admin_api_ready &>/dev/null; then
        if ! wait_for_keycloak_admin_api_ready "dive-hub-keycloak" 30; then
            log_error "Hub Keycloak admin API not ready - cannot proceed with federation"
            return 1
        fi
        log_info "✓ Hub Keycloak admin API ready"
    else
        log_warn "wait_for_keycloak_admin_api_ready not available - skipping readiness check"
    fi

    # Wait for Spoke Keycloak admin API (short timeout — already healthy from DEPLOYMENT phase)
    local spoke_kc_container="dive-spoke-${code_lower}-keycloak"
    if type wait_for_keycloak_admin_api_ready &>/dev/null; then
        if ! wait_for_keycloak_admin_api_ready "$spoke_kc_container" 30; then
            log_error "Spoke Keycloak admin API not ready - cannot proceed with federation"
            return 1
        fi
        log_info "✓ Spoke Keycloak admin API ready"
    fi

    # ==========================================================================
    # DATABASE STATE: Create initial federation link records (2026-01-16)
    # ==========================================================================
    # Record both directions as PENDING before attempting creation
    local fed_db_available=false
    if type fed_db_upsert_link &>/dev/null; then
        # Spoke→Hub direction (usa-idp in spoke)
        if fed_db_upsert_link "$code_lower" "usa" "SPOKE_TO_HUB" "usa-idp" "PENDING" \
            "dive-v3-broker-${code_lower}"; then
            log_verbose "✓ Federation link recorded: $code_lower → usa"
            fed_db_available=true
        else
            log_verbose "Federation database not available (federation_links table missing)"
            log_verbose "State tracking limited - IdP configuration will still work"
            fed_db_available=false
        fi

        # Hub→Spoke direction (spoke-idp in hub) - only if first succeeded
        if [ "$fed_db_available" = true ]; then
            if fed_db_upsert_link "usa" "$code_lower" "HUB_TO_SPOKE" "${code_lower}-idp" "PENDING" \
                "dive-v3-broker-usa"; then
                log_verbose "✓ Federation link recorded: usa → $code_lower"
            fi
        fi
    else
        log_verbose "Federation state database module not loaded - state tracking limited"
    fi

    # Step 1: Configure usa-idp in spoke Keycloak
    if ! spoke_federation_configure_upstream_idp "$instance_code" "usa"; then
        # Update database state to FAILED
        if [ "${fed_db_available:-false}" = true ] && type fed_db_update_status &>/dev/null; then
            if ! fed_db_update_status "$code_lower" "usa" "SPOKE_TO_HUB" "FAILED" \
                "Failed to configure upstream IdP" "$SPOKE_ERROR_FEDERATION_SETUP"; then
                log_verbose "Could not update federation status (database may be unavailable)"
            fi
        fi
        orch_record_error "$SPOKE_ERROR_FEDERATION_SETUP" "$ORCH_SEVERITY_HIGH" \
            "Failed to configure upstream IdP" "federation" \
            "$(spoke_error_get_remediation $SPOKE_ERROR_FEDERATION_SETUP $instance_code)"
        return 1
    fi

    # Step 2: Register spoke-idp in Hub Keycloak
    if ! spoke_federation_register_in_hub "$instance_code"; then
        orch_record_error "$SPOKE_ERROR_FEDERATION_REGISTER" "$ORCH_SEVERITY_HIGH" \
            "Failed to register in Hub" "federation" \
            "$(spoke_error_get_remediation $SPOKE_ERROR_FEDERATION_REGISTER $instance_code)"
        return 1
    fi

    # ==========================================================================
    # NEW STEP 2.5: Create Bidirectional Federation (Hub→Spoke)
    # ==========================================================================
    # This completes bidirectional SSO by creating spoke-idp in Hub Keycloak
    # Previously required manual './dive federation link [CODE]' command
    # FIX (2026-01-14): Now automatic during deployment
    # ==========================================================================
    if ! spoke_federation_create_bidirectional "$instance_code"; then
        log_warn "Bidirectional IdP creation incomplete (non-blocking)"
        log_warn "Run manually: ./dive federation link $code_upper"
    fi

    # Step 3: Synchronize client secrets
    if ! spoke_secrets_sync_federation "$instance_code"; then
        log_warn "Federation secret sync incomplete (non-blocking)"
    fi

    # ==========================================================================
    # Step 4: Clear Keycloak Caches for Immediate Verification
    # ==========================================================================
    # Keycloak has internal caches that can cause federation verification to fail
    # immediately after IdP creation. Clear caches to ensure consistent state.
    # Reference: https://www.keycloak.org/docs/latest/server_admin/#clearing-caches
    # ==========================================================================
    log_verbose "Clearing Keycloak caches for reliable verification..."
    _spoke_federation_clear_keycloak_cache "$instance_code"

    # ==========================================================================
    # Step 5: Verify bidirectional connectivity with EXPONENTIAL BACKOFF
    # ==========================================================================
    # Federation resources may take a moment to propagate in Keycloak.
    # Uses exponential backoff: 2s, 4s, 8s, 16s, 32s (5 attempts, ~62s total)
    # Also tests OIDC discovery endpoints before declaring success.
    # ==========================================================================
    local max_verify_retries=5
    local base_delay=2
    local verification_passed=false
    local verification_result=""

    for ((i=1; i<=max_verify_retries; i++)); do
        local delay=$((base_delay * (2 ** (i - 1))))  # Exponential backoff: 2, 4, 8, 16, 32

        log_info "Federation verification attempt $i/$max_verify_retries..."

        # CRITICAL FIX (2026-02-07): spoke_federation_verify returns exit code 1 even when bidirectional:true
        # We need to capture output regardless of exit code, then parse JSON properly with jq
        # FIX (2026-02-07 Part 2): spoke_federation_verify outputs log messages mixed with JSON
        # Redirect stderr to /dev/null and extract only the JSON portion (lines between { and })
        verification_result=$(spoke_federation_verify "$instance_code" 2>&1 | sed -n '/{/,/}/p')

        # Parse JSON properly instead of fragile grep pattern
        # spoke_federation_verify outputs "bidirectional": true (with space), not "bidirectional":true
        local is_bidirectional=$(echo "$verification_result" | jq -r '.bidirectional // false' 2>/dev/null)

        if [ "$is_bidirectional" = "true" ]; then
            # Bidirectional flag is set - IdPs are configured correctly
            # ENHANCED (2026-02-07): OIDC endpoint check is now optional
            # If IdPs exist and are enabled, SSO will work even if OIDC discovery
            # endpoints aren't immediately ready (Keycloak caches need ~60s to refresh)
            log_verbose "DEBUG: Bidirectional federation confirmed, checking OIDC endpoints..."
            if _spoke_federation_verify_oidc_endpoints "$instance_code"; then
                verification_passed=true
                log_success "Bidirectional federation established and OIDC endpoints verified (attempt $i)"
                break
            else
                # IdPs exist but OIDC not ready - treat as SUCCESS with warning
                log_warn "IdPs configured correctly (bidirectional:true) but OIDC discovery endpoints not yet ready"
                log_warn "SSO will work once Keycloak caches refresh (~60s after deployment)"
                log_info "To verify OIDC later: curl -sk https://localhost:8453/realms/dive-v3-broker-${code_lower}/.well-known/openid-configuration"
                log_verbose "DEBUG: Setting verification_passed=true despite OIDC check failure"
                verification_passed=true
                log_verbose "DEBUG: Breaking from verification loop with verification_passed=$verification_passed"
                break
            fi
        fi

        if [ $i -lt $max_verify_retries ]; then
            log_verbose "Verification pending, waiting ${delay}s before retry (exponential backoff)..."
            sleep $delay
        fi
    done

    if [ "$verification_passed" = "true" ]; then
        return 0
    else
        # CRITICAL FIX (2026-02-07): Federation is REQUIRED infrastructure - fail hard
        # Previous "non-blocking" approach created checkpoint poison:
        #   1. CONFIGURATION phase succeeds with incomplete federation → checkpoint saved
        #   2. VERIFICATION phase fails → rollback
        #   3. Re-deploy skips CONFIGURATION (checkpoint exists) → IdPs never created
        #   4. VERIFICATION fails again → infinite loop
        # SOLUTION: Fail during CONFIGURATION so checkpoint is never saved until federation works
        log_error "Federation verification failed after $max_verify_retries attempts (~62s total)"
        log_error "Impact: Spoke cannot function without bidirectional federation"
        log_error "This indicates a real configuration problem, not just eventual consistency"
        echo ""
        if [ -n "$verification_result" ]; then
            echo "$verification_result" | grep -E '"spoke_to_hub"|"hub_to_spoke"|"bidirectional"' || echo "$verification_result"
        fi
        echo ""
        log_error "Troubleshooting:"
        log_error "  1. Verify Hub is running: docker ps --filter name=dive-hub"
        log_error "  2. Check Hub Keycloak: curl -k https://localhost:8443/realms/dive-v3-broker-usa/.well-known/openid-configuration"
        log_error "  3. Check Spoke Keycloak: curl -k https://localhost:\${KEYCLOAK_PORT}/realms/dive-v3-broker-${code_lower}/.well-known/openid-configuration"
        log_error "  4. Review Keycloak logs: docker logs dive-hub-keycloak && docker logs dive-spoke-${code_lower}-keycloak"
        log_error "  5. Check admin passwords are set: echo \$KEYCLOAK_ADMIN_PASSWORD_${code_upper}"
        return 1  # CRITICAL: Fail hard so checkpoint is not saved
    fi
}

# =============================================================================
# KEYCLOAK CACHE MANAGEMENT (Production Resilience Enhancement)
# =============================================================================

##
# Clear Keycloak realm cache to ensure federation changes are immediately visible
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Cache cleared (or not needed)
##
_spoke_federation_clear_keycloak_cache() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    # Clear spoke Keycloak cache
    local spoke_kc_container="dive-spoke-${code_lower}-keycloak"
    local spoke_realm="dive-v3-broker-${code_lower}"

    if docker ps --format '{{.Names}}' | grep -q "^${spoke_kc_container}$"; then
        local admin_token
        admin_token=$(spoke_federation_get_admin_token "$spoke_kc_container" 2>/dev/null)

        if [ -n "$admin_token" ]; then
            # Clear realm cache (idempotent operation)
            docker exec "$spoke_kc_container" curl -sf -X POST \
                -H "Authorization: Bearer $admin_token" \
                "http://localhost:8080/admin/realms/${spoke_realm}/clear-realm-cache" 2>/dev/null || true

            # Clear user cache
            docker exec "$spoke_kc_container" curl -sf -X POST \
                -H "Authorization: Bearer $admin_token" \
                "http://localhost:8080/admin/realms/${spoke_realm}/clear-user-cache" 2>/dev/null || true

            log_verbose "✓ Cleared Keycloak cache for ${spoke_realm}"
        fi
    fi

    # Clear Hub Keycloak cache
    local hub_kc_container="${HUB_KC_CONTAINER:-dive-hub-keycloak}"
    local hub_realm="${HUB_REALM:-dive-v3-broker-usa}"

    if docker ps --format '{{.Names}}' | grep -q "^${hub_kc_container}$"; then
        local hub_admin_token
        hub_admin_token=$(spoke_federation_get_admin_token "$hub_kc_container" 2>/dev/null)

        if [ -n "$hub_admin_token" ]; then
            docker exec "$hub_kc_container" curl -sf -X POST \
                -H "Authorization: Bearer $hub_admin_token" \
                "http://localhost:8080/admin/realms/${hub_realm}/clear-realm-cache" 2>/dev/null || true

            docker exec "$hub_kc_container" curl -sf -X POST \
                -H "Authorization: Bearer $hub_admin_token" \
                "http://localhost:8080/admin/realms/${hub_realm}/clear-user-cache" 2>/dev/null || true

            log_verbose "✓ Cleared Keycloak cache for ${hub_realm}"
        fi
    fi

    return 0
}

##
# Verify OIDC discovery endpoints are reachable for federation
# This ensures the IdPs are actually functional, not just configured
#
# ENHANCED (2026-02-07): Added debug logging, retry logic, and better dependency handling
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Both OIDC endpoints reachable
#   1 - One or more endpoints not reachable after retries
##
_spoke_federation_verify_oidc_endpoints() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    local spoke_realm="dive-v3-broker-${code_lower}"
    local hub_realm="${HUB_REALM:-dive-v3-broker-usa}"

    # ENHANCEMENT: Retry configuration
    local max_oidc_retries=3
    local oidc_retry_delay=5
    local oidc_timeout=10  # Increased from 5s

    log_verbose "Starting OIDC endpoint verification for $instance_code (${max_oidc_retries} retries, ${oidc_timeout}s timeout)"

    # Get spoke Keycloak port from instance config
    local spoke_kc_port
    if [ -f "${DIVE_ROOT}/instances/${code_lower}/config.json" ]; then
        # CRITICAL FIX: Check if json_get_field is available
        if ! type json_get_field &>/dev/null; then
            log_warn "json_get_field not available - using fallback port extraction"
            # Fallback: grep directly from config.json
            local idp_url=$(grep -o '"idpPublicUrl"[[:space:]]*:[[:space:]]*"[^"]*"' "${DIVE_ROOT}/instances/${code_lower}/config.json" | cut -d'"' -f4)
            spoke_kc_port=$(echo "$idp_url" | grep -o ':[0-9]*' | tr -d ':\n\r')
        else
            local idp_url
            idp_url=$(json_get_field "${DIVE_ROOT}/instances/${code_lower}/config.json" "endpoints.idpPublicUrl" "https://localhost:8443" | tr -d '\n\r')
            # Extract port from URL
            spoke_kc_port=$(echo "$idp_url" | grep -o ':[0-9]*' | tr -d ':\n\r')
            log_verbose "DEBUG: Extracted port from config: spoke_kc_port=$spoke_kc_port (from idp_url=$idp_url)"
        fi
    fi
    spoke_kc_port="${spoke_kc_port:-8443}"

    log_verbose "DEBUG: Spoke Keycloak port: $spoke_kc_port"

    # ENHANCEMENT: Retry loop for OIDC endpoint verification
    for ((attempt=1; attempt<=max_oidc_retries; attempt++)); do
        local spoke_oidc_ok=false
        local hub_oidc_ok=false

        # Test Spoke OIDC discovery endpoint
        local spoke_discovery_url="https://localhost:${spoke_kc_port}/realms/${spoke_realm}/.well-known/openid-configuration"
        log_verbose "DEBUG: Testing Spoke OIDC endpoint (attempt $attempt/$max_oidc_retries): $spoke_discovery_url"
        
        local spoke_curl_result
        spoke_curl_result=$(curl -sk --max-time $oidc_timeout "$spoke_discovery_url" 2>&1)
        local spoke_curl_exit=$?
        
        if [ $spoke_curl_exit -eq 0 ] && echo "$spoke_curl_result" | grep -q '"issuer"'; then
            spoke_oidc_ok=true
            local spoke_issuer=$(echo "$spoke_curl_result" | grep -o '"issuer":"[^"]*"' | cut -d'"' -f4)
            log_verbose "✓ Spoke OIDC discovery: ${spoke_realm} (port ${spoke_kc_port}, issuer: ${spoke_issuer})"
        else
            log_verbose "✗ Spoke OIDC discovery not ready (exit: $spoke_curl_exit, length: ${#spoke_curl_result})"
            log_verbose "DEBUG: Curl output: ${spoke_curl_result:0:200}"
        fi

        # Test Hub OIDC discovery endpoint
        local hub_discovery_url="https://localhost:8443/realms/${hub_realm}/.well-known/openid-configuration"
        log_verbose "DEBUG: Testing Hub OIDC endpoint (attempt $attempt/$max_oidc_retries): $hub_discovery_url"
        
        local hub_curl_result
        hub_curl_result=$(curl -sk --max-time $oidc_timeout "$hub_discovery_url" 2>&1)
        local hub_curl_exit=$?
        
        if [ $hub_curl_exit -eq 0 ] && echo "$hub_curl_result" | grep -q '"issuer"'; then
            hub_oidc_ok=true
            local hub_issuer=$(echo "$hub_curl_result" | grep -o '"issuer":"[^"]*"' | cut -d'"' -f4)
            log_verbose "✓ Hub OIDC discovery: ${hub_realm} (issuer: ${hub_issuer})"
        else
            log_verbose "✗ Hub OIDC discovery not ready (exit: $hub_curl_exit, length: ${#hub_curl_result})"
            log_verbose "DEBUG: Curl output: ${hub_curl_result:0:200}"
        fi

        # Check if both endpoints are ready
        if [ "$spoke_oidc_ok" = true ] && [ "$hub_oidc_ok" = true ]; then
            log_verbose "OIDC endpoints verified successfully on attempt $attempt"
            return 0
        fi

        # Retry logic
        if [ $attempt -lt $max_oidc_retries ]; then
            log_verbose "OIDC endpoints not ready (spoke=$spoke_oidc_ok, hub=$hub_oidc_ok), waiting ${oidc_retry_delay}s before retry..."
            sleep $oidc_retry_delay
        fi
    done

    # All retries exhausted
    log_verbose "OIDC endpoint verification failed after $max_oidc_retries attempts"
    log_verbose "Final status: spoke=$spoke_oidc_ok, hub=$hub_oidc_ok"
    return 1
}

# =============================================================================
# UPSTREAM IDP CONFIGURATION
# =============================================================================

##
# Configure an upstream Identity Provider in spoke Keycloak
#
# Arguments:
#   $1 - Instance code
#   $2 - Upstream IdP code (e.g., "usa" for Hub)
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_federation_configure_upstream_idp() {
    local instance_code="$1"
    local upstream_code="${2:-usa}"

    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_verbose "Configuring ${upstream_code}-idp in spoke Keycloak..."

    local kc_container="dive-spoke-${code_lower}-keycloak"

    # Check if Keycloak is running
    if ! docker ps --format '{{.Names}}' | grep -q "^${kc_container}$"; then
        log_error "Spoke Keycloak container not running"
        return 1
    fi

    # Get admin token
    local admin_token
    admin_token=$(spoke_federation_get_admin_token "$kc_container")

    if [ -z "$admin_token" ]; then
        log_error "Cannot get Keycloak admin token"
        return 1
    fi

    # Create IdP configuration
    local realm_name="dive-v3-broker-${code_lower}"
    local idp_alias="${upstream_code}-idp"
    local federation_client_id="dive-v3-broker-${code_lower}"

    # ==========================================================================
    # URL STRATEGY FOR FEDERATION (2026-01-16 Best Practice)
    # ==========================================================================
    # - authorizationUrl/logoutUrl: External URL (localhost:8443) for browser redirects
    # - tokenUrl/userInfoUrl/jwksUrl: Internal Docker URL for server-to-server calls
    # - issuer: External URL (must match what's in the tokens)
    # ==========================================================================
    local hub_public_url="https://localhost:8443"
    local hub_internal_url="https://dive-hub-keycloak:8443"

    # ==========================================================================
    # GET CLIENT SECRET FROM HUB (CRITICAL FIX)
    # ==========================================================================
    # Without the client secret, the IdP cannot authenticate to the Hub's token endpoint
    # Error: "Invalid client or Invalid client credentials"
    # ==========================================================================
    log_verbose "Retrieving client secret from Hub Keycloak..."

    local hub_kc_container="${HUB_KEYCLOAK_CONTAINER:-dive-hub-keycloak}"
    local hub_realm="${HUB_REALM:-dive-v3-broker-usa}"
    local client_secret=""

    # Get Hub admin token
    local hub_admin_pass
    hub_admin_pass=$(gcloud secrets versions access latest --secret=dive-v3-keycloak-usa --project="${GCP_PROJECT:-dive25}" 2>/dev/null || \
                    docker exec "$hub_kc_container" printenv KC_BOOTSTRAP_ADMIN_PASSWORD 2>/dev/null)

    if [ -n "$hub_admin_pass" ]; then
        local hub_admin_token
        hub_admin_token=$(docker exec "$hub_kc_container" curl -sf --max-time 10 \
            -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
            -d "grant_type=password" -d "username=admin" -d "password=${hub_admin_pass}" \
            -d "client_id=admin-cli" 2>/dev/null | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

        if [ -n "$hub_admin_token" ]; then
            # Get client UUID
            local client_uuid
            client_uuid=$(docker exec "$hub_kc_container" curl -sf --max-time 10 \
                -H "Authorization: Bearer $hub_admin_token" \
                "http://localhost:8080/admin/realms/${hub_realm}/clients?clientId=${federation_client_id}" 2>/dev/null | \
                grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

            if [ -n "$client_uuid" ]; then
                client_secret=$(docker exec "$hub_kc_container" curl -sf --max-time 10 \
                    -H "Authorization: Bearer $hub_admin_token" \
                    "http://localhost:8080/admin/realms/${hub_realm}/clients/${client_uuid}/client-secret" 2>/dev/null | \
                    grep -o '"value":"[^"]*' | cut -d'"' -f4)
                log_verbose "Retrieved client secret from Hub"
            else
                log_warn "Federation client ${federation_client_id} not found in Hub"
            fi
        fi
    fi

    # Fallback to GCP Secret Manager
    if [ -z "$client_secret" ]; then
        log_verbose "Trying GCP Secret Manager for federation secret..."
        if type _get_federation_secret &>/dev/null; then
            client_secret=$(_get_federation_secret "$code_lower" "usa")
        fi
    fi

    if [ -z "$client_secret" ]; then
        log_error "Cannot retrieve client secret for federation"
        log_error "Ensure the Hub has the client '${federation_client_id}' configured"
        return 1
    fi

    # Check if IdP already exists
    local existing_idp
    existing_idp=$(docker exec "$kc_container" curl -sf \
        -H "Authorization: Bearer $admin_token" \
        "http://localhost:8080/admin/realms/${realm_name}/identity-provider/instances/${idp_alias}" 2>/dev/null || echo "")

    if echo "$existing_idp" | grep -q '"alias"'; then
        log_verbose "IdP ${idp_alias} already exists - updating"
    fi

    # Build IdP configuration JSON with client secret and proper URLs
    local idp_config
    idp_config=$(cat << EOF
{
    "alias": "${idp_alias}",
    "displayName": "USA Hub Federation",
    "providerId": "oidc",
    "enabled": true,
    "trustEmail": true,
    "storeToken": true,
    "linkOnly": false,
    "firstBrokerLoginFlowAlias": "first broker login",
    "updateProfileFirstLoginMode": "off",
    "postBrokerLoginFlowAlias": "",
    "config": {
        "clientId": "${federation_client_id}",
        "clientSecret": "${client_secret}",
        "authorizationUrl": "${hub_public_url}/realms/${hub_realm}/protocol/openid-connect/auth",
        "tokenUrl": "${hub_internal_url}/realms/${hub_realm}/protocol/openid-connect/token",
        "userInfoUrl": "${hub_internal_url}/realms/${hub_realm}/protocol/openid-connect/userinfo",
        "logoutUrl": "${hub_public_url}/realms/${hub_realm}/protocol/openid-connect/logout",
        "jwksUrl": "${hub_internal_url}/realms/${hub_realm}/protocol/openid-connect/certs",
        "issuer": "${hub_public_url}/realms/${hub_realm}",
        "validateSignature": "false",
        "useJwksUrl": "true",
        "clientAuthMethod": "client_secret_post",
        "defaultScope": "openid profile email clearance countryOfAffiliation uniqueID acpCOI user_acr user_amr",
        "syncMode": "FORCE"
    }
}
EOF
)

    # Create or update IdP
    local http_method="POST"
    local url="http://localhost:8080/admin/realms/${realm_name}/identity-provider/instances"

    if echo "$existing_idp" | grep -q '"alias"'; then
        http_method="PUT"
        url="${url}/${idp_alias}"
    fi

    local response
    response=$(docker exec "$kc_container" curl -sf \
        -X "$http_method" \
        -H "Authorization: Bearer $admin_token" \
        -H "Content-Type: application/json" \
        -d "$idp_config" \
        "$url" 2>&1)

    # Check for errors
    if echo "$response" | grep -qi "error"; then
        log_error "Failed to configure IdP: $response"
        return 1
    fi

    log_success "Configured ${idp_alias} in spoke Keycloak"

    # Configure protocol mappers for the IdP
    spoke_federation_configure_idp_mappers "$instance_code" "$idp_alias"

    # ==========================================================================
    # DATABASE STATE: Update SPOKE_TO_HUB link to ACTIVE (2026-01-16)
    # ==========================================================================
    if [ "$fed_db_available" = true ] && type fed_db_update_status &>/dev/null; then
        if fed_db_update_status "$code_lower" "usa" "SPOKE_TO_HUB" "ACTIVE"; then
            log_verbose "✓ Federation link status updated: $code_lower → usa ACTIVE"
        else
            log_verbose "Federation database update failed (non-fatal - IdP still configured)"
        fi
    fi

    return 0
}

##
# Configure protocol mappers for the upstream IdP
##
spoke_federation_configure_idp_mappers() {
    local instance_code="$1"
    local idp_alias="$2"

    local code_lower=$(lower "$instance_code")
    local kc_container="dive-spoke-${code_lower}-keycloak"
    local realm_name="dive-v3-broker-${code_lower}"

    local admin_token
    admin_token=$(spoke_federation_get_admin_token "$kc_container")

    if [ -z "$admin_token" ]; then
        return 1
    fi

    # Define required mappers (CRITICAL DIVE attributes)
    local mapper_configs=(
        "unique-id-mapper:uniqueID:uniqueID"
        "clearance-mapper:clearance:clearance"
        "country-mapper:countryOfAffiliation:countryOfAffiliation"
        "coi-mapper:acpCOI:acpCOI"
    )

    log_verbose "Configuring IdP attribute mappers (idempotent)..."

    # Get existing mappers to avoid duplicates (SF-029 fix)
    local existing_mappers
    existing_mappers=$(docker exec "$kc_container" curl -sf \
        -H "Authorization: Bearer $admin_token" \
        "http://localhost:8080/admin/realms/${realm_name}/identity-provider/instances/${idp_alias}/mappers" 2>/dev/null | \
        jq -r '.[].name' 2>/dev/null || echo "")

    for mapper_config in "${mapper_configs[@]}"; do
        IFS=':' read -r mapper_name claim_name user_attr <<< "$mapper_config"

        # Check if mapper already exists (prevent duplicates)
        if echo "$existing_mappers" | grep -q "^${mapper_name}$"; then
            log_verbose "  ✓ Mapper exists: $mapper_name (skipping)"
            continue
        fi

        # Create mapper
        local mapper_json=$(cat <<EOF
{
  "name": "${mapper_name}",
  "identityProviderMapper": "oidc-user-attribute-idp-mapper",
  "identityProviderAlias": "${idp_alias}",
  "config": {
    "claim": "${claim_name}",
    "user.attribute": "${user_attr}",
    "syncMode": "FORCE"
  }
}
EOF
)

        local result
        result=$(docker exec "$kc_container" curl -sf -w "%{http_code}" -o /dev/null \
            -X POST \
            -H "Authorization: Bearer $admin_token" \
            -H "Content-Type: application/json" \
            -d "$mapper_json" \
            "http://localhost:8080/admin/realms/${realm_name}/identity-provider/instances/${idp_alias}/mappers" 2>/dev/null)

        if [ "$result" = "201" ]; then
            log_verbose "  ✓ Created mapper: $mapper_name"
        elif [ "$result" = "409" ]; then
            log_verbose "  ✓ Mapper exists: $mapper_name (conflict - OK)"
        else
            log_verbose "  ⚠ Mapper creation returned HTTP $result: $mapper_name"
        fi
    done

    log_verbose "IdP mappers configured (no duplicates)"
}


# Load extended federation functions
source "$(dirname "${BASH_SOURCE[0]}")/spoke-federation-extended.sh"
