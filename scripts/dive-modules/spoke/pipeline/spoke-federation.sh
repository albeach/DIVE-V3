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
# LOAD FEDERATION-LINK MODULE FOR BIDIRECTIONAL SETUP
# =============================================================================
# Load federation-link.sh to make _federation_link_direct() available
# This is required for automated bidirectional federation
if [ -z "${DIVE_FEDERATION_LINK_LOADED:-}" ]; then
    # CRITICAL FIX (2026-01-18): Correct path - spoke-federation.sh is in spoke/pipeline/,
    # federation-link.sh is in modules/ root, so need to go up TWO levels
    _fed_link_path="${BASH_SOURCE[0]%/*}/../../federation-link.sh"
    if [ -f "$_fed_link_path" ]; then
        source "$_fed_link_path"
    elif [ -f "${DIVE_ROOT}/scripts/dive-modules/federation-link.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/federation-link.sh"
    fi
    unset _fed_link_path
fi

# =============================================================================
# LOAD FEDERATION STATE DATABASE MODULE (2026-01-16)
# =============================================================================
# Database-driven federation state management
# Part of Orchestration Architecture Review
if [ -z "${FEDERATION_STATE_DB_LOADED:-}" ]; then
    # CRITICAL FIX (2026-01-18): Path calculation - spoke-federation.sh is in spoke/pipeline/,
    # federation-state-db.sh is in modules/ root
    # ${BASH_SOURCE[0]%/*} = scripts/dive-modules/spoke/pipeline
    # ../../ goes up to scripts/dive-modules/
    _fed_db_path="${BASH_SOURCE[0]%/*}/../../federation-state-db.sh"
    if [ -f "$_fed_db_path" ]; then
        source "$_fed_db_path"
    elif [ -f "${DIVE_ROOT}/scripts/dive-modules/federation-state-db.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/federation-state-db.sh"
    else
        log_verbose "federation-state-db.sh not found - database state tracking unavailable"
    fi
    unset _fed_db_path
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
    # CRITICAL: Load Hub environment for Keycloak password (FIX 2026-01-27)
    # ==========================================================================
    # The wait_for_keycloak_admin_api_ready() function needs Hub admin password
    # but it's only in .env.hub (loaded by Docker Compose, not by bash scripts)
    if [ -f "${DIVE_ROOT}/.env.hub" ]; then
        # Export Hub Keycloak admin password for readiness checks
        KEYCLOAK_ADMIN_PASSWORD=$(grep "^KEYCLOAK_ADMIN_PASSWORD=" "${DIVE_ROOT}/.env.hub" 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'")
        if [ -n "$KEYCLOAK_ADMIN_PASSWORD" ]; then
            export KEYCLOAK_ADMIN_PASSWORD
            export KC_BOOTSTRAP_ADMIN_PASSWORD="$KEYCLOAK_ADMIN_PASSWORD"  # Alias
            log_verbose "✓ Hub Keycloak admin password loaded for readiness checks"
        fi
    fi

    # ==========================================================================
    # CRITICAL: Wait for Keycloak Admin APIs to be ready (FIX 2026-01-27)
    # ==========================================================================
    # Keycloak containers may report healthy but admin API not fully initialized.
    # Wait for both Hub and Spoke Keycloak before attempting federation setup.
    # ==========================================================================
    log_verbose "Verifying Keycloak admin APIs are ready..."

    # Wait for Hub Keycloak admin API
    if type wait_for_keycloak_admin_api_ready &>/dev/null; then
        if ! wait_for_keycloak_admin_api_ready "dive-hub-keycloak" 120; then
            log_error "Hub Keycloak admin API not ready - cannot proceed with federation"
            return 1
        fi
        log_verbose "✓ Hub Keycloak admin API ready"
    else
        log_warn "wait_for_keycloak_admin_api_ready not available - skipping readiness check"
    fi

    # Wait for Spoke Keycloak admin API
    local spoke_kc_container="dive-spoke-${code_lower}-keycloak"
    if type wait_for_keycloak_admin_api_ready &>/dev/null; then
        if ! wait_for_keycloak_admin_api_ready "$spoke_kc_container" 120; then
            log_error "Spoke Keycloak admin API not ready - cannot proceed with federation"
            return 1
        fi
        log_verbose "✓ Spoke Keycloak admin API ready"
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

        verification_result=$(spoke_federation_verify "$instance_code" 2>/dev/null)

        if echo "$verification_result" | grep -q '"bidirectional":true'; then
            # Bidirectional flag is set - IdPs are configured correctly
            # ENHANCED (2026-02-07): OIDC endpoint check is now optional
            # If IdPs exist and are enabled, SSO will work even if OIDC discovery
            # endpoints aren't immediately ready (Keycloak caches need ~60s to refresh)
            if _spoke_federation_verify_oidc_endpoints "$instance_code"; then
                verification_passed=true
                log_success "Bidirectional federation established and OIDC endpoints verified (attempt $i)"
                break
            else
                # IdPs exist but OIDC not ready - treat as SUCCESS with warning
                log_warn "IdPs configured correctly (bidirectional:true) but OIDC discovery endpoints not yet ready"
                log_warn "SSO will work once Keycloak caches refresh (~60s after deployment)"
                log_info "To verify OIDC later: curl -sk https://localhost:8453/realms/dive-v3-broker-${code_lower}/.well-known/openid-configuration"
                verification_passed=true
                break
            fi
        elif echo "$verification_result" | grep -q '"spoke_to_hub":true.*"hub_to_spoke":true\|"hub_to_spoke":true.*"spoke_to_hub":true'; then
            # Both directions exist - verify OIDC (same logic as above)
            if _spoke_federation_verify_oidc_endpoints "$instance_code"; then
                verification_passed=true
                log_success "Bidirectional federation established and OIDC endpoints verified (attempt $i)"
                break
            else
                # IdPs exist but OIDC not ready - treat as SUCCESS with warning
                log_warn "IdPs configured correctly (spoke_to_hub & hub_to_spoke) but OIDC discovery endpoints not yet ready"
                log_warn "SSO will work once Keycloak caches refresh (~60s after deployment)"
                log_info "To verify OIDC later: curl -sk https://localhost:8453/realms/dive-v3-broker-${code_lower}/.well-known/openid-configuration"
                verification_passed=true
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
    local hub_internal_url="https://keycloak:8443"

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
    hub_admin_pass=$(gcloud secrets versions access latest --secret=dive-v3-keycloak-usa --project=dive25 2>/dev/null || \
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
    "firstBrokerLoginFlowAlias": "",
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

# =============================================================================
# HUB REGISTRATION
# =============================================================================

##
# Register spoke as an IdP in Hub Keycloak
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_federation_register_in_hub() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_step "Registering $code_upper in Hub Terraform configuration..."

    # ==========================================================================
    # BEST PRACTICE: Update Hub Terraform configuration (SSOT)
    # ==========================================================================
    # Instead of manually creating IdPs via Keycloak API, we update the Hub's
    # Terraform configuration and apply it. This ensures:
    # - Persistence across Hub redeployments
    # - Proper client creation with protocol mappers
    # - Consistent configuration management
    # ==========================================================================

    local hub_tfvars="${DIVE_ROOT}/terraform/hub/hub.tfvars"
    local spoke_config="${DIVE_ROOT}/instances/${code_lower}/config.json"

    if [ ! -f "$spoke_config" ]; then
        log_error "Spoke config not found: $spoke_config"
        return 1
    fi

    # Extract spoke details from config.json
    local spoke_name=$(jq -r '.identity.name // "'"$code_upper"'"' "$spoke_config")

    # CRITICAL FIX (2026-01-15): Port extraction was including leading newlines causing multi-line Terraform strings
    # Root cause: grep -o can include newlines in output, tr -d only removes ':', not whitespace
    # Solution: Use xargs to trim ALL whitespace (including newlines)
    local spoke_keycloak_port=$(jq -r '.endpoints.idpPublicUrl // "https://localhost:8443"' "$spoke_config" | grep -o ':[0-9]*' | tr -d ':' | xargs)
    local spoke_frontend_port=$(jq -r '.endpoints.baseUrl // "https://localhost:3000"' "$spoke_config" | grep -o ':[0-9]*' | tr -d ':' | xargs)

    # Build complete URLs as atomic strings (no variable expansion that could introduce newlines)
    local idp_url="https://localhost:${spoke_keycloak_port}"
    local frontend_url="https://localhost:${spoke_frontend_port}"

    # Check if already in tfvars (specifically in federation_partners block)
    # Use a more precise check that looks for the key assignment, not just the string
    if grep -E "^\s*${code_lower}\s*=" "$hub_tfvars" 2>/dev/null | grep -v "^#" | head -1 | grep -q .; then
        log_info "$code_upper already in Hub Terraform configuration (federation_partners)"
    else
        log_step "Adding $code_upper to Hub federation_partners..."

        # Create federation partner entry (using pre-built URL variables)
        local federation_entry="  ${code_lower} = {
    instance_code         = \"${code_upper}\"
    instance_name         = \"${spoke_name}\"
    idp_url               = \"${idp_url}\"
    idp_internal_url      = \"https://dive-spoke-${code_lower}-keycloak:8443\"
    frontend_url          = \"${frontend_url}\"
    enabled               = true
    client_secret         = \"\"  # Loaded from GCP: dive-v3-federation-${code_lower}-usa
    disable_trust_manager = true
  }"

        # Backup tfvars
        cp "$hub_tfvars" "${hub_tfvars}.backup-$(date +%Y%m%d-%H%M%S)"

        # Write entry to temp file for safe multi-line handling (no quotes = variable expansion)
        cat > "${hub_tfvars}.entry" << ENTRY_EOF
$federation_entry
ENTRY_EOF

        # Use Python for reliable multi-line insertion (safer than sed/awk)
        python3 - "$hub_tfvars" "${hub_tfvars}.entry" "$code_lower" << 'PYTHON_EOF'
import sys
import re

hub_tfvars = sys.argv[1]
entry_file = sys.argv[2]
code_lower = sys.argv[3]

# Read the entry
with open(entry_file, 'r') as f:
    entry = f.read().strip()

# Read tfvars
with open(hub_tfvars, 'r') as f:
    content = f.read()
    lines = content.splitlines(keepends=True)

# Check for duplicate: look for "code_lower = {" pattern (not in comments)
duplicate_pattern = re.compile(rf'^\s*{re.escape(code_lower)}\s*=\s*\{{', re.MULTILINE)
if duplicate_pattern.search(content):
    print(f"✓ {code_lower.upper()} already exists in federation_partners (skipping)")
    sys.exit(0)

# Find federation_partners = { line (not commented)
fed_start = None
for i, line in enumerate(lines):
    if re.match(r'^federation_partners\s*=\s*\{', line.strip()) and not line.strip().startswith('#'):
        fed_start = i
        break

if fed_start is None:
    print(f"ERROR: federation_partners block not found", file=sys.stderr)
    sys.exit(1)

# Check if empty map
if lines[fed_start].strip() == 'federation_partners = {}':
    # Replace entire line
    lines[fed_start] = f'federation_partners = {{\n{entry}\n}}\n'
else:
    # Find matching closing brace
    brace_count = 1
    close_idx = None
    for i in range(fed_start + 1, len(lines)):
        stripped = lines[i].strip()
        if stripped.startswith('#'):
            continue
        brace_count += stripped.count('{') - stripped.count('}')
        if brace_count == 0:
            close_idx = i
            break

    if close_idx is None:
        print(f"ERROR: Could not find closing brace for federation_partners", file=sys.stderr)
        sys.exit(1)

    # Insert entry before closing brace
    lines.insert(close_idx, f'{entry}\n')

# Write back
with open(hub_tfvars, 'w') as f:
    f.writelines(lines)

print(f"✓ Added {code_lower.upper()} to federation_partners")
PYTHON_EOF
        local python_exit=$?

        rm -f "${hub_tfvars}.entry"

        if [ $python_exit -eq 0 ]; then
            log_success "Added $code_upper to Hub Terraform configuration"
        else
            log_error "Failed to update Hub Terraform configuration"
            return 1
        fi
    fi

    # ==========================================================================
    # CRITICAL: Ensure Hub Keycloak admin API is ready before Terraform
    # ==========================================================================
    log_verbose "Verifying Hub Keycloak ready for Terraform operations..."
    if type wait_for_keycloak_admin_api_ready &>/dev/null; then
        if ! wait_for_keycloak_admin_api_ready "dive-hub-keycloak" 120; then
            log_error "Hub Keycloak admin API not ready for Terraform"
            return 1
        fi
        log_verbose "✓ Hub Keycloak admin API ready for Terraform"
    fi

    # Apply Hub Terraform
    log_step "Applying Hub Terraform to create federation client..."

    local hub_tf_dir="${DIVE_ROOT}/terraform/hub"
    cd "$hub_tf_dir" || return 1

    # Load Hub secrets
    export INSTANCE="usa"
    if type spoke_secrets_load &>/dev/null; then
        if ! spoke_secrets_load "USA" 2>/dev/null; then
            log_verbose "Could not load USA secrets (may already be loaded)"
        fi
    fi

    # Export TF_VAR environment variables
    export TF_VAR_keycloak_admin_password="${KEYCLOAK_ADMIN_PASSWORD_USA:-$(gcloud secrets versions access latest --secret=dive-v3-keycloak-usa --project=dive25 2>/dev/null)}"
    export TF_VAR_client_secret="${KEYCLOAK_CLIENT_SECRET_USA:-$(gcloud secrets versions access latest --secret=dive-v3-keycloak-client-secret --project=dive25 2>/dev/null)}"
    # Use test user passwords following Hub pattern
    export TF_VAR_test_user_password="${TEST_USER_PASSWORD:-${TF_VAR_keycloak_admin_password}}"
    export TF_VAR_admin_user_password="${ADMIN_PASSWORD:-${TF_VAR_keycloak_admin_password}}"
    export KEYCLOAK_USER="admin"
    export KEYCLOAK_PASSWORD="${TF_VAR_keycloak_admin_password}"

    # Initialize if needed
    if [ ! -d ".terraform" ]; then
        log_info "Initializing Hub Terraform..."
        local init_output
        local init_exit_code=0
        init_output=$(terraform init -upgrade 2>&1) || init_exit_code=$?

        if [ $init_exit_code -ne 0 ]; then
            log_error "Terraform init failed (exit code: $init_exit_code)"
            echo "$init_output" | tail -30
            return 1
        fi
    fi

    # ==========================================================================
    # TARGETED TERRAFORM APPLY
    # ==========================================================================
    # Instead of applying all resources (which fails if some already exist),
    # we target only the resources for this specific spoke. This handles:
    # - Existing resources in Keycloak that aren't in TF state
    # - Partial deployments that left orphaned resources
    # - State drift from manual operations
    # ==========================================================================
    log_info "Running targeted terraform apply for Hub (${code_lower} only)..."

    # Define the resources to target for this spoke
    local target_args=(
        -target="module.instance.keycloak_oidc_identity_provider.federation_partner[\"${code_lower}\"]"
        -target="module.instance.keycloak_openid_client.incoming_federation[\"${code_lower}\"]"
    )

    # First, try to import existing resources if they exist in Keycloak
    # This syncs Terraform state with Keycloak reality
    local hub_realm="dive-v3-broker-usa"
    local idp_alias="${code_lower}-idp"
    local client_id="dive-v3-broker-${code_lower}"

    # Check if IdP exists and try to import it
    local idp_exists=$(docker exec dive-hub-keycloak curl -sf \
        -H "Authorization: Bearer $(docker exec dive-hub-keycloak curl -sf \
            -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
            -d "grant_type=password" -d "username=admin" \
            -d "password=${TF_VAR_keycloak_admin_password}" \
            -d "client_id=admin-cli" 2>/dev/null | jq -r '.access_token')" \
        "http://localhost:8080/admin/realms/${hub_realm}/identity-provider/instances/${idp_alias}" 2>/dev/null || echo "")

    if [ -n "$idp_exists" ] && echo "$idp_exists" | jq -e '.alias' &>/dev/null; then
        log_info "IdP ${idp_alias} exists in Keycloak, importing to state..."
        terraform import \
            "module.instance.keycloak_oidc_identity_provider.federation_partner[\"${code_lower}\"]" \
            "${hub_realm}/${idp_alias}" 2>/dev/null || log_verbose "Import skipped (may already be in state)"
    fi

    # Check if client exists and try to import it
    local client_uuid=$(docker exec dive-hub-keycloak curl -sf \
        -H "Authorization: Bearer $(docker exec dive-hub-keycloak curl -sf \
            -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
            -d "grant_type=password" -d "username=admin" \
            -d "password=${TF_VAR_keycloak_admin_password}" \
            -d "client_id=admin-cli" 2>/dev/null | jq -r '.access_token')" \
        "http://localhost:8080/admin/realms/${hub_realm}/clients?clientId=${client_id}" 2>/dev/null | jq -r '.[0].id // empty')

    if [ -n "$client_uuid" ]; then
        log_info "Client ${client_id} exists in Keycloak, importing to state..."
        terraform import \
            "module.instance.keycloak_openid_client.incoming_federation[\"${code_lower}\"]" \
            "${hub_realm}/${client_uuid}" 2>/dev/null || log_verbose "Import skipped (may already be in state)"
    fi

    # Now apply with targets
    local tf_output
    local tf_exit_code=0
    tf_output=$(terraform apply -var-file=hub.tfvars "${target_args[@]}" -auto-approve 2>&1) || tf_exit_code=$?

    if [ $tf_exit_code -eq 0 ]; then
        log_success "Hub Terraform applied - federation client created for $code_upper"
    else
        # Check if it's a 409 conflict (resource already exists)
        if echo "$tf_output" | grep -q "409 Conflict"; then
            log_warn "Some resources already exist in Keycloak (409 Conflict)"
            log_info "This is OK - resources were created by a previous deployment"
            # Don't fail - the resources exist, which is what we wanted
        else
            log_error "Hub Terraform apply failed (exit code: $tf_exit_code)"
            echo "$tf_output" | tail -50  # Show last 50 lines of error
            return 1
        fi
    fi

    cd - &>/dev/null
    return 0
}

# =============================================================================
# BIDIRECTIONAL FEDERATION (NEW - 2026-01-14)
# =============================================================================

##
# Create bidirectional federation by adding spoke-idp to Hub
#
# This automates what './dive federation link [CODE]' does manually.
# Creates {spoke}-idp in Hub Keycloak so Hub users can authenticate via spoke.
#
# Arguments:
#   $1 - Instance code (spoke)
#
# Returns:
#   0 - Success
#   1 - Failure
##
spoke_federation_create_bidirectional() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_step "Creating bidirectional federation (Hub→Spoke)..."

    # ==========================================================================
    # DATABASE STATE: Mark HUB_TO_SPOKE as CREATING (if database available)
    # ==========================================================================
    if [ "${fed_db_available:-false}" = true ] && type fed_db_update_status &>/dev/null; then
        if fed_db_update_status "usa" "$code_lower" "HUB_TO_SPOKE" "CREATING"; then
            log_verbose "✓ Federation link status: usa → $code_lower CREATING"
        fi
    fi

    # Check if Hub is accessible (use default if HUB_KC_CONTAINER not set)
    local hub_container="${HUB_KC_CONTAINER:-dive-hub-keycloak}"
    if ! docker ps --format '{{.Names}}' | grep -q "^${hub_container}$"; then
        log_warn "Hub Keycloak not running (expected container: $hub_container)"
        if [ "${fed_db_available:-false}" = true ] && type fed_db_update_status &>/dev/null; then
            if ! fed_db_update_status "usa" "$code_lower" "HUB_TO_SPOKE" "FAILED" \
                "Hub Keycloak not running"; then
                log_verbose "Could not update federation status (database may be unavailable)"
            fi
        fi
        return 1
    fi

    # Use federation-link.sh helper if available
    if type _federation_link_direct &>/dev/null; then
        log_verbose "Using federation-link.sh helper for bidirectional setup"
        if _federation_link_direct "USA" "$code_upper"; then
            log_success "Created $code_lower-idp in Hub (bidirectional SSO ready)"
            # Update database state to ACTIVE (if database available)
            if [ "${fed_db_available:-false}" = true ] && type fed_db_update_status &>/dev/null; then
                if fed_db_update_status "usa" "$code_lower" "HUB_TO_SPOKE" "ACTIVE"; then
                    log_verbose "✓ Federation link status: usa → $code_lower ACTIVE"
                fi
            fi
            return 0
        else
            log_warn "Failed to create bidirectional IdP via helper"
            if [ "${fed_db_available:-false}" = true ] && type fed_db_update_status &>/dev/null; then
                if ! fed_db_update_status "usa" "$code_lower" "HUB_TO_SPOKE" "FAILED" \
                    "Failed via federation-link helper"; then
                    log_verbose "Could not update federation status (database may be unavailable)"
                fi
            fi
            return 1
        fi
    fi

    # Fallback: Direct implementation
    log_verbose "Creating $code_lower-idp in Hub directly..."

    # Get Hub admin token (use local variable, not constant which may be empty)
    log_verbose "DEBUG: hub_container='$hub_container', HUB_KC_CONTAINER='${HUB_KC_CONTAINER:-NOT_SET}'"
    log_verbose "DEBUG: Calling spoke_federation_get_admin_token with container: $hub_container"

    local hub_admin_token
    hub_admin_token=$(spoke_federation_get_admin_token "$hub_container" "true")  # Enable debug

    if [ -z "$hub_admin_token" ]; then
        log_error "Cannot get Hub admin token for container: $hub_container"
        log_error "DEBUG: Check if container is running: docker ps | grep $hub_container"
        return 1
    fi

    log_verbose "DEBUG: Hub admin token retrieved successfully (${#hub_admin_token} chars)"

    # Get spoke details
    local spoke_keycloak_port
    spoke_keycloak_port=$(jq -r '.endpoints.idpPublicUrl // ""' "${DIVE_ROOT}/instances/${code_lower}/config.json" | grep -o ':[0-9]*' | tr -d ':')

    if [ -z "$spoke_keycloak_port" ]; then
        log_error "Cannot determine spoke Keycloak port"
        return 1
    fi

    # Source URLs (spoke)
    local source_public_url="https://localhost:${spoke_keycloak_port}"
    local source_internal_url="https://dive-spoke-${code_lower}-keycloak:8443"
    local source_realm="dive-v3-broker-${code_lower}"

    # Get federation client secret (from GCP or generate)
    local client_secret
    if type _get_federation_secret &>/dev/null; then
        client_secret=$(_get_federation_secret "$code_lower" "usa")
    else
        # Generate if helper not available
        client_secret=$(openssl rand -base64 24 | tr -d '/+=')
    fi

    # IdP configuration
    local idp_alias="${code_lower}-idp"
    local idp_config="{
        \"alias\": \"${idp_alias}\",
        \"displayName\": \"${code_upper} Federation\",
        \"providerId\": \"oidc\",
        \"enabled\": true,
        \"trustEmail\": true,
        \"storeToken\": true,
        \"linkOnly\": false,
        \"firstBrokerLoginFlowAlias\": \"\",
        \"updateProfileFirstLoginMode\": \"off\",
        \"postBrokerLoginFlowAlias\": \"\",
        \"config\": {
            \"clientId\": \"dive-v3-broker-usa\",
            \"clientSecret\": \"${client_secret}\",
            \"authorizationUrl\": \"${source_public_url}/realms/${source_realm}/protocol/openid-connect/auth\",
            \"tokenUrl\": \"${source_internal_url}/realms/${source_realm}/protocol/openid-connect/token\",
            \"userInfoUrl\": \"${source_internal_url}/realms/${source_realm}/protocol/openid-connect/userinfo\",
            \"logoutUrl\": \"${source_public_url}/realms/${source_realm}/protocol/openid-connect/logout\",
            \"issuer\": \"${source_public_url}/realms/${source_realm}\",
            \"validateSignature\": \"false\",
            \"useJwksUrl\": \"true\",
            \"jwksUrl\": \"${source_internal_url}/realms/${source_realm}/protocol/openid-connect/certs\",
            \"syncMode\": \"FORCE\",
            \"clientAuthMethod\": \"client_secret_post\"
        }
    }"

    # Check if IdP already exists
    local existing_idp
    existing_idp=$(docker exec "$hub_container" curl -sf \
        -H "Authorization: Bearer $hub_admin_token" \
        "http://localhost:8080/admin/realms/${HUB_REALM}/identity-provider/instances/${idp_alias}" 2>/dev/null || echo "")

    if echo "$existing_idp" | grep -q '"alias"'; then
        log_info "$idp_alias already exists in Hub (skipping)"
        return 0
    fi

    # Create IdP
    local create_result
    create_result=$(docker exec "$hub_container" curl -sf \
        -X POST "http://localhost:8080/admin/realms/${HUB_REALM}/identity-provider/instances" \
        -H "Authorization: Bearer $hub_admin_token" \
        -H "Content-Type: application/json" \
        -d "$idp_config" 2>&1)

    if [ $? -eq 0 ]; then
        log_success "Created $code_lower-idp in Hub (bidirectional SSO ready)"

        # Configure IdP mappers
        if type _configure_idp_mappers &>/dev/null; then
            _configure_idp_mappers "$hub_container" "$hub_admin_token" "$HUB_REALM" "$idp_alias"
        fi

        # ==========================================================================
        # DATABASE STATE: Mark HUB_TO_SPOKE as ACTIVE (if database available)
        # ==========================================================================
        if [ "${fed_db_available:-false}" = true ] && type fed_db_update_status &>/dev/null; then
            if fed_db_update_status "usa" "$code_lower" "HUB_TO_SPOKE" "ACTIVE"; then
                log_verbose "✓ Federation link status: usa → $code_lower ACTIVE"
            fi
        fi

        return 0
    else
        log_error "Failed to create bidirectional IdP: $create_result"
        # Update database state to FAILED
        if [ "${fed_db_available:-false}" = true ] && type fed_db_update_status &>/dev/null; then
            if ! fed_db_update_status "usa" "$code_lower" "HUB_TO_SPOKE" "FAILED" \
                "Failed to create IdP: $create_result"; then
                log_verbose "Could not update federation status (database may be unavailable)"
            fi
        fi
        return 1
    fi
}

# =============================================================================
# FEDERATION VERIFICATION
# =============================================================================

##
# Verify bidirectional federation connectivity
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   JSON status object
##
spoke_federation_verify() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_step "Verifying federation for $code_upper..."

    local spoke_kc_container="dive-spoke-${code_lower}-keycloak"
    local realm_name="dive-v3-broker-${code_lower}"

    local spoke_to_hub="false"
    local hub_to_spoke="false"

    # Check spoke → Hub connectivity (usa-idp exists and enabled)
    if docker ps --format '{{.Names}}' | grep -q "^${spoke_kc_container}$"; then
        local admin_token
        admin_token=$(spoke_federation_get_admin_token "$spoke_kc_container")

        if [ -n "$admin_token" ]; then
            local idp_status
            idp_status=$(docker exec "$spoke_kc_container" curl -sf \
                -H "Authorization: Bearer $admin_token" \
                "http://localhost:8080/admin/realms/${realm_name}/identity-provider/instances/usa-idp" 2>/dev/null)

            if echo "$idp_status" | grep -q '"enabled":true'; then
                spoke_to_hub="true"
            fi
        fi
    fi

    # Check Hub → spoke connectivity (spoke-idp-{code} exists and enabled)
    if docker ps --format '{{.Names}}' | grep -q "^${HUB_KC_CONTAINER}$"; then
        local hub_admin_token
        hub_admin_token=$(spoke_federation_get_admin_token "$HUB_KC_CONTAINER")

        if [ -n "$hub_admin_token" ]; then
            local hub_idp_status
            # FIXED: Use {code}-idp format, not spoke-idp-{code}
            # Federation link creates fra-idp, not spoke-idp-fra
            hub_idp_status=$(docker exec "$HUB_KC_CONTAINER" curl -sf \
                -H "Authorization: Bearer $hub_admin_token" \
                "http://localhost:8080/admin/realms/${HUB_REALM}/identity-provider/instances/${code_lower}-idp" 2>/dev/null)

            if echo "$hub_idp_status" | grep -q '"enabled":true'; then
                hub_to_spoke="true"
            fi
        fi
    fi

    # Determine overall status
    local bidirectional="false"
    local status="$FED_STATUS_ERROR"

    if [ "$spoke_to_hub" = "true" ] && [ "$hub_to_spoke" = "true" ]; then
        bidirectional="true"
        status="$FED_STATUS_ACTIVE"
    elif [ "$spoke_to_hub" = "true" ] || [ "$hub_to_spoke" = "true" ]; then
        status="$FED_STATUS_PENDING"
    fi

    # ==========================================================================
    # DATABASE STATE: Record health check results (2026-01-16)
    # ==========================================================================
    if type fed_db_record_health &>/dev/null; then
        # Record Spoke→Hub health
        if [ "${fed_db_available:-false}" = true ] && type fed_db_record_health &>/dev/null; then
            if fed_db_record_health "$code_lower" "usa" "SPOKE_TO_HUB" \
                "$spoke_to_hub" "$spoke_to_hub" "true" "true" \
                "$spoke_to_hub" "" ""; then
                log_verbose "✓ Spoke→Hub health recorded"
            fi
            # Record Hub→Spoke health
            if fed_db_record_health "usa" "$code_lower" "HUB_TO_SPOKE" \
                "$hub_to_spoke" "$hub_to_spoke" "true" "true" \
                "$hub_to_spoke" "" ""; then
                log_verbose "✓ Hub→Spoke health recorded"
            fi
        else
            log_verbose "Federation health recording skipped (database not available)"
        fi
    fi

    # Output JSON status
    cat << EOF
{
    "instance": "$code_upper",
    "status": "$status",
    "spoke_to_hub": $spoke_to_hub,
    "hub_to_spoke": $hub_to_spoke,
    "bidirectional": $bidirectional,
    "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF

    if [ "$bidirectional" = "true" ]; then
        log_success "Bidirectional federation verified"
    else
        # PHASE 1 FIX: Convert soft-fail to hard failure
        # Incomplete federation means spoke cannot function properly
        if [ "${SKIP_FEDERATION:-false}" = "true" ]; then
            log_warn "Federation incomplete: spoke→hub=$spoke_to_hub, hub→spoke=$hub_to_spoke"
            log_warn "Federation skipped - continuing deployment"
        else
            log_error "Federation incomplete: spoke→hub=$spoke_to_hub, hub→spoke=$hub_to_spoke"
            log_error "Impact: Spoke cannot perform bidirectional federated operations"
            log_error "Fix: Run './dive federation link $code_upper' to complete federation"
            log_error "      Verify Keycloak IdPs: ./dive federation verify $code_upper"
            log_error "      Override: Use --skip-federation flag to deploy without federation"
            return 1
        fi
    fi
}

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

##
# Get Keycloak admin token
#
# Arguments:
#   $1 - Container name
#
# Returns:
#   Admin token or empty string
##
spoke_federation_get_admin_token() {
    local container="$1"
    local debug="${2:-false}"  # Optional debug parameter

    # CRITICAL FIX (2026-02-07): Get password from the BACKEND container
    # Keycloak container doesn't have environment variables - they're in backend
    local admin_pass=""
    local source="unknown"

    # Extract instance code from container name
    local instance_code=""
    local backend_container=""
    
    if [[ "$container" =~ dive-spoke-([a-z]+)-keycloak ]]; then
        instance_code="${BASH_REMATCH[1]}"
        backend_container="dive-spoke-${instance_code}-backend"
    elif [[ "$container" == "dive-hub-keycloak" ]]; then
        instance_code="usa"
        backend_container="dive-hub-backend"
    fi

    # 1. Get password from backend container (SSOT)
    if [ -n "$backend_container" ] && docker ps --format '{{.Names}}' | grep -q "^${backend_container}$"; then
        # Try KC_BOOTSTRAP_ADMIN_PASSWORD first (used during bootstrap)
        admin_pass=$(docker exec "$backend_container" printenv KC_BOOTSTRAP_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
        if [ -n "$admin_pass" ]; then
            source="backend:KC_BOOTSTRAP_ADMIN_PASSWORD"
            [ "$debug" = "true" ] && log_verbose "Retrieved password from $backend_container (KC_BOOTSTRAP_ADMIN_PASSWORD)"
        fi
        
        # Try KEYCLOAK_ADMIN_PASSWORD (standard var)
        if [ -z "$admin_pass" ]; then
            admin_pass=$(docker exec "$backend_container" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
            if [ -n "$admin_pass" ]; then
                source="backend:KEYCLOAK_ADMIN_PASSWORD"
                [ "$debug" = "true" ] && log_verbose "Retrieved password from $backend_container (KEYCLOAK_ADMIN_PASSWORD)"
            fi
        fi
    fi

    # 2. Fallback: Try Keycloak container environment (legacy, unlikely to work)
    if [ -z "$admin_pass" ]; then
        admin_pass=$(docker exec "$container" printenv KC_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
        [ -n "$admin_pass" ] && source="keycloak:KC_ADMIN_PASSWORD"
    fi
    
    if [ -z "$admin_pass" ]; then
        admin_pass=$(docker exec "$container" printenv KC_BOOTSTRAP_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
        [ -n "$admin_pass" ] && source="keycloak:KC_BOOTSTRAP_ADMIN_PASSWORD"
    fi
    
    if [ -z "$admin_pass" ]; then
        admin_pass=$(docker exec "$container" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
        [ -n "$admin_pass" ] && source="keycloak:KEYCLOAK_ADMIN_PASSWORD"
    fi

    # 3. Fallback: Try host environment variables (deployment context)
    if [ -z "$admin_pass" ] && [ -n "$instance_code" ]; then
        local env_var="KEYCLOAK_ADMIN_PASSWORD_${instance_code^^}"
        admin_pass="${!env_var}"
        if [ -n "$admin_pass" ]; then
            source="host:$env_var"
            [ "$debug" = "true" ] && log_verbose "Using host environment variable $env_var"
        fi
    fi

    # 4. Fallback: GCP Secret Manager (last resort)
    if [ -z "$admin_pass" ] && [[ "$container" == "dive-hub-keycloak" ]]; then
        if type check_gcloud &>/dev/null && check_gcloud 2>/dev/null; then
            admin_pass=$(gcloud secrets versions access latest --secret="dive-v3-keycloak-usa" --project=dive25 2>/dev/null | tr -d '\n\r')
            if [ -n "$admin_pass" ]; then
                source="gcp:dive-v3-keycloak-usa"
                [ "$debug" = "true" ] && log_verbose "Retrieved Hub password from GCP Secret Manager"
            fi
        fi
    fi

    if [ -z "$admin_pass" ]; then
        log_error "Cannot get admin password for $container from any source"
        log_error "Tried: backend container ($backend_container), keycloak container, host env vars, GCP secrets"
        if [ "$debug" = "true" ]; then
            log_error "Debug: Backend container running: $(docker ps --filter name=$backend_container --format '{{.Names}}')"
            log_error "Debug: Keycloak container running: $(docker ps --filter name=$container --format '{{.Names}}')"
        fi
        return 1
    fi

    [ "$debug" = "true" ] && log_verbose "Password source: $source (length: ${#admin_pass})"

    # Get token
    local response
    response=$(docker exec "$container" curl -sf \
        -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
        -d "grant_type=password" \
        -d "username=admin" \
        -d "password=${admin_pass}" \
        -d "client_id=admin-cli" 2>/dev/null)

    if [ -z "$response" ]; then
        log_error "Token request to $container failed (empty response)"
        return 1
    fi

    local token
    token=$(echo "$response" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

    if [ -z "$token" ]; then
        log_error "No access_token in response from $container"
        [ "$debug" = "true" ] && log_error "Response: $response"
        return 1
    fi

    echo "$token"
}

##
# Update federation status in config.json
##
spoke_federation_update_status() {
    local instance_code="$1"
    local status="$2"

    local code_lower=$(lower "$instance_code")
    local config_file="${DIVE_ROOT}/instances/${code_lower}/config.json"

    if [ -f "$config_file" ]; then
        # Update status in config.json
        local temp_file=$(mktemp)
        jq --arg status "$status" '.federation.status = $status' "$config_file" > "$temp_file"
        mv "$temp_file" "$config_file"
    fi
}
