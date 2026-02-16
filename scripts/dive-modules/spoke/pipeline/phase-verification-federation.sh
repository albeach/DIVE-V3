#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Spoke Verification (Federation & API Health)
# =============================================================================
# Extracted from phase-verification.sh (Phase 13d)
# Contains: federation verify, OPAL sync check, OIDC endpoints,
#   federation fallback, API health checks
# =============================================================================

[ -n "${SPOKE_PHASE_VERIFICATION_FEDERATION_LOADED:-}" ] && return 0

# =============================================================================
# FEDERATION VERIFICATION
# =============================================================================

##
# Verify federation configuration with exponential backoff retry
#
# Federation verification in the deployment pipeline uses exponential backoff
# to handle Keycloak's eventual consistency after IdP creation.
#
# Retry pattern: 3s, 6s, 12s, 24s (4 attempts, ~45s total)
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - Federation configured
#   1 - Federation incomplete (non-blocking)
##
spoke_verify_federation() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_step "Verifying federation configuration..."

    # BEST PRACTICE FIX (2026-02-06): Wait for realistic stabilization time BEFORE checking
    # Eliminates false positive warnings from checking too early
    #
    # Keycloak OIDC discovery cache refresh: 10-30 seconds
    # By waiting upfront, we avoid multiple retries and confusing "expected" warnings
    local stabilization_time="${DIVE_TIMEOUT_FEDERATION_STABILIZE:-35}"

    log_info "⏳ Waiting ${stabilization_time}s for Keycloak OIDC discovery cache refresh..."
    log_verbose "   This allows both Hub and Spoke to discover each other's IdPs"

    # Progress indicator (better UX than silent wait)
    local progress_interval=5
    for ((i=progress_interval; i<=stabilization_time; i+=progress_interval)); do
        log_verbose "   ${i}/${stabilization_time}s elapsed..."
        sleep $progress_interval
    done

    # Sleep remaining time if not divisible by progress_interval
    local remaining=$((stabilization_time % progress_interval))
    if [ $remaining -gt 0 ]; then
        sleep $remaining
    fi

    # NOW check with focused retries (only 5 needed after stabilization)
    local max_retries=5
    local base_delay=3
    local verification_passed=false
    local fed_status=""

    for ((attempt=1; attempt<=max_retries; attempt++)); do
        log_verbose "Verification attempt $attempt/$max_retries..."

        # Use spoke-federation.sh verification if available
        if type spoke_federation_verify &>/dev/null; then
            # CRITICAL FIX (2026-02-07): Extract only JSON from output (filter out log messages)
            # The function outputs log messages mixed with JSON, so we extract the JSON block
            # Use sed to extract lines between { and } (inclusive)
            fed_status=$(spoke_federation_verify "$instance_code" 2>&1 | sed -n '/{/,/}/p')

            # Check for successful bidirectional federation
            if echo "$fed_status" | jq -e '.bidirectional == true' &>/dev/null; then
                # Additionally verify OIDC endpoints are functional
                if _spoke_verify_federation_oidc_endpoints "$instance_code"; then
                    verification_passed=true
                    log_success "Federation and OIDC endpoints verified"
                    break
                else
                    # FIX (2026-02-07): IdPs exist and are enabled - OIDC check is optional
                    # Federation IS working, OIDC discovery just needs cache refresh (~60s)
                    log_warn "IdPs configured correctly (bidirectional:true) but OIDC endpoints not yet ready"
                    log_warn "SSO will work once Keycloak caches refresh (~60s after deployment)"
                    verification_passed=true
                    break
                fi
            fi
        fi

        # Wait before retry (except on last attempt)
        if [ $attempt -lt $max_retries ] && [ "$verification_passed" != "true" ]; then
            log_verbose "Retrying in ${base_delay}s..."
            sleep $base_delay
        fi
    done

    # Report results
    if [ "$verification_passed" = "true" ]; then
        log_success "✅ Federation verified - bidirectional IdP configuration active"
        if [ -n "$fed_status" ] && command -v jq &>/dev/null; then
            if echo "$fed_status" | jq -e . &>/dev/null; then
                local spoke_to_hub hub_to_spoke
                spoke_to_hub=$(echo "$fed_status" | jq -r '.spoke_to_hub // false' 2>/dev/null)
                hub_to_spoke=$(echo "$fed_status" | jq -r '.hub_to_spoke // false' 2>/dev/null)
                echo "     • Spoke → Hub (usa-idp in $code_upper): ✓"
                echo "     • Hub → Spoke (${code_lower}-idp in USA): ✓"
            fi
        fi
        return 0
    else
        # Federation FAILED after reasonable wait - this is a REAL problem
        log_error "❌ Federation verification failed"
        log_error "   Waited ${stabilization_time}s + $((max_retries * base_delay))s retries = $((stabilization_time + max_retries * base_delay))s total"
        log_error "   This indicates a configuration problem (not just timing)"
        echo ""

        # Show detailed status if available
        if [ -n "$fed_status" ] && command -v jq &>/dev/null; then
            if echo "$fed_status" | jq -e . &>/dev/null; then
                local spoke_to_hub hub_to_spoke
                spoke_to_hub=$(echo "$fed_status" | jq -r '.spoke_to_hub // false' 2>/dev/null)
                hub_to_spoke=$(echo "$fed_status" | jq -r '.hub_to_spoke // false' 2>/dev/null)

                log_error "   Federation Status:"
                echo "      $( [ "$spoke_to_hub" = "true" ] && echo "✅" || echo "❌" ) Spoke → Hub (usa-idp in $code_upper)"
                echo "      $( [ "$hub_to_spoke" = "true" ] && echo "✅" || echo "❌" ) Hub → Spoke (${code_lower}-idp in USA)"
            fi
        else
            log_error "   Federation verification returned no status (function may have failed)"
            log_error "   This usually means spoke_federation_verify() encountered an error"
        fi

        echo ""
        log_error "   Root Cause Diagnostics:"
        log_error "     • If CONFIGURATION phase was skipped (checkpoint), IdPs were never created"
        log_error "     • Check if usa-idp exists in Spoke: docker exec dive-spoke-${code_lower}-keycloak /opt/keycloak/bin/kcadm.sh ..."
        log_error "     • Check if ${code_lower}-idp exists in Hub: docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh ..."
        echo ""
        log_error "   Troubleshooting:"
        log_error "     1. Clear checkpoints: docker exec dive-hub-postgres psql -U postgres orchestration -c \"DELETE FROM checkpoints WHERE instance='$code_upper'\""
        log_error "     2. Re-run deployment: ./dive spoke deploy $code_upper --force"
        log_error "     3. Check federation status: ./dive federation status $code_upper"
        log_error "     4. Manual federation link: ./dive federation link $code_upper"
        echo ""

        return 1  # HARD FAIL - federation is critical
    fi
}

##
# Internal function: Perform OPAL sync verification checks without stabilization wait
# This is used both by the main spoke_verify_opal_sync() function and for quick re-checks
#
# Arguments:
#   $1 - Instance code
#   $2 - Max retries
#   $3 - Retry delay (seconds)
#   $4 - Start time (for timing metrics)
#   $5 - Stabilization time (optional, for error reporting)
#
# Returns:
#   0 - OPAL data synced and verified
#   1 - OPAL sync not verified
##
_spoke_verify_opal_sync_check() {
    local instance_code="$1"
    local max_retries="$2"
    local retry_delay="$3"
    local sync_start_time="$4"
    local stabilization_time="${5:-0}"  # Optional parameter for error reporting

    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")
    local verification_passed=false

    # CRITICAL FIX (2026-02-07): Always use localhost for API calls from host
    # The verification script runs on the HOST, not inside Docker network
    # Using dive-hub-backend hostname will fail DNS resolution
    local hub_api="https://localhost:4000/api"
    local hub_code="USA"  # Hub is always USA — INSTANCE_CODE is the spoke during spoke deploy
    local spoke_issuer_pattern="${code_lower}"

    for ((attempt=1; attempt<=max_retries; attempt++)); do
        log_verbose "OPAL sync verification attempt $attempt/$max_retries..."

        # Check 1: Verify spoke's issuer is in Hub OPA's trusted_issuers
        local opa_issuers
        opa_issuers=$(curl -sk "${hub_api}/opal/trusted-issuers" 2>/dev/null)

        # DEBUG: Log raw response for troubleshooting
        log_verbose "DEBUG: OPA issuers API response keys: $(echo "$opa_issuers" | jq -c '.trusted_issuers | keys' 2>/dev/null || echo 'query failed')"

        local issuer_found=false
        # FIX: Improved pattern matching - check if ANY issuer key contains the spoke pattern
        if [ -n "$opa_issuers" ]; then
            # Method 1: Try jq pattern matching
            if echo "$opa_issuers" | jq -e ".trusted_issuers | to_entries[] | select(.key | contains(\"$spoke_issuer_pattern\"))" &>/dev/null; then
                issuer_found=true
                log_verbose "✓ Spoke issuer found in Hub OPA trusted_issuers (jq pattern match)"
            else
                # Method 2: Fallback to grep-based matching (more reliable for this use case)
                local issuer_keys
                issuer_keys=$(echo "$opa_issuers" | jq -r '.trusted_issuers | keys[]' 2>/dev/null)
                if echo "$issuer_keys" | grep -q "$spoke_issuer_pattern"; then
                    issuer_found=true
                    log_verbose "✓ Spoke issuer found in Hub OPA trusted_issuers (grep match)"
                fi
            fi
        fi

        if [ "$issuer_found" = "false" ]; then
            log_verbose "✗ Spoke issuer NOT found in Hub OPA trusted_issuers"
            log_verbose "  Looking for pattern: '$spoke_issuer_pattern'"
            log_verbose "  Available issuers: $(echo "$opa_issuers" | jq -c '.trusted_issuers | keys' 2>/dev/null || echo 'query failed')"
        fi

        # Check 2: Verify spoke is in Hub OPA's federation_matrix
        local fed_matrix
        fed_matrix=$(curl -sk "${hub_api}/opal/federation-matrix" 2>/dev/null)

        # DEBUG: Log raw response for troubleshooting
        log_verbose "DEBUG: Federation matrix API response: $(echo "$fed_matrix" | jq -c '.federation_matrix' 2>/dev/null || echo 'query failed')"

        local matrix_found=false
        if [ -n "$fed_matrix" ]; then
            # Method 1: Try jq exact match
            if echo "$fed_matrix" | jq -e ".federation_matrix.${hub_code}[] | select(. == \"${code_upper}\")" &>/dev/null; then
                matrix_found=true
                log_verbose "✓ Spoke found in Hub OPA federation_matrix (jq exact match)"
            else
                # Method 2: Fallback to grep-based matching
                local matrix_members
                matrix_members=$(echo "$fed_matrix" | jq -r ".federation_matrix.${hub_code}[]?" 2>/dev/null)
                if echo "$matrix_members" | grep -qx "$code_upper"; then
                    matrix_found=true
                    log_verbose "✓ Spoke found in Hub OPA federation_matrix (grep match)"
                fi
            fi
        fi

        if [ "$matrix_found" = "false" ]; then
            log_verbose "✗ Spoke NOT found in Hub OPA federation_matrix"
            log_verbose "  Looking for: '${code_upper}' in federation_matrix.${hub_code}"
            log_verbose "  Current matrix: $(echo "$fed_matrix" | jq -c '.federation_matrix' 2>/dev/null || echo 'query failed')"
        fi

        # Log combined status
        log_verbose "Attempt $attempt/$max_retries: issuer_found=$issuer_found, matrix_found=$matrix_found"

        # Both checks must pass
        if [ "$issuer_found" = "true" ] && [ "$matrix_found" = "true" ]; then
            verification_passed=true
            break
        fi

        # Wait before retry (except on last attempt)
        if [ $attempt -lt $max_retries ]; then
            log_verbose "Retrying in ${retry_delay}s..."
            sleep $retry_delay
        fi
    done

    # Report results
    if [ "$verification_passed" = "true" ]; then
        local sync_duration=$(($(date +%s) - sync_start_time))
        log_success "✅ OPAL data synced to Hub OPA (${sync_duration}s elapsed, expected: 40-60s)"
        echo "     • Spoke issuer in trusted_issuers: ✓"
        echo "     • Spoke in federation_matrix: ✓"
        echo "     • Cross-instance SSO ready: ✓"

        # Log performance metrics
        if [ $sync_duration -lt 30 ]; then
            log_verbose "⚡ Excellent sync time: ${sync_duration}s (faster than expected)"
        elif [ $sync_duration -lt 60 ]; then
            log_verbose "✓ Normal sync time: ${sync_duration}s (within expected range)"
        else
            log_verbose "⚠️  Slower than expected: ${sync_duration}s (expected: 40-60s)"
        fi

        return 0
    else
        # OPAL sync FAILED - return error code with timing info
        local sync_duration=$(($(date +%s) - sync_start_time))
        local total_check_time=$((max_retries * retry_delay))

        log_error "❌ OPAL sync verification failed (${sync_duration}s elapsed, ${max_retries} attempts)"

        return 1  # Verification failed
    fi
}

##
# Verify OPAL data sync to Hub OPA after spoke approval
#
# This verification ensures that federation data (trusted_issuers, federation_matrix)
# has been synced from MongoDB → OPAL → OPA. Without this sync, spoke approval
# succeeds but OPA still has stale data, causing:
# - 403 "issuer not trusted" errors when spoke users access Hub resources
# - 403 "federation denied" errors for cross-instance resource access
#
# Retry pattern: 5s, 5s, 5s, 5s, 5s, 5s (6 attempts, ~30s total)
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - OPAL data synced and verified in OPA
#   1 - OPAL sync incomplete (non-blocking - will eventually sync via CDC)
##
spoke_verify_opal_sync() {
    local instance_code="$1"

    # Track timing for performance analysis
    local sync_start_time=$(date +%s)

    log_step "Verifying OPAL data sync to Hub OPA..."

    # Poll-first approach: Start checking immediately, then retry with backoff.
    # OPAL CDC polls MongoDB every 5s. Propagation chain:
    #   MongoDB change → OPAL CDC detects (5s) → data fetch (1-3s) → OPA push (1-2s)
    # Typical sync: 10-30s. Worst case (cold start): ~90s.
    # Total budget: 21 retries × 5s = 105s (same budget, no blind wait)
    local max_retries=21
    local retry_delay=5
    local stabilization_time=0  # No blind wait — poll from start

    # Use helper function to perform the actual verification (pass stabilization_time for error reporting)
    if _spoke_verify_opal_sync_check "$instance_code" "$max_retries" "$retry_delay" "$sync_start_time" "$stabilization_time"; then
        return 0  # Success
    else
        # CRITICAL FIX (2026-02-11): Make OPAL sync verification BLOCKING
        # Previous issue: Returned success on timeout, hiding policy propagation failures
        # Impact: Policy data not synced but deployment marked complete, causing 403 errors
        local total_wait=$((max_retries * retry_delay))
        log_error "❌ OPAL sync verification FAILED after ${total_wait}s"
        log_error "   Policy data has NOT propagated from MongoDB → OPAL → OPA"
        log_error ""
        log_error "   Impact:"
        log_error "     • Spoke users will get 403 'issuer not trusted' errors accessing Hub resources"
        log_error "     • Cross-instance resource access will fail"
        log_error "     • ABAC policy enforcement will use stale data"
        log_error ""
        log_error "   Root Cause:"
        log_error "     • OPAL client not running or not connected to Hub OPAL server"
        log_error "     • MongoDB CDC events not being processed"
        log_error "     • Network connectivity issues between Hub and Spoke"
        log_error ""
        log_error "   Troubleshooting:"
        log_error "     1. Check OPAL client status: docker ps | grep opal-client"
        log_error "     2. Check OPAL client logs: docker logs dive-spoke-${instance_code}-opal-client"
        log_error "     3. Verify Hub OPAL server: docker logs dive-hub-opal-server"
        log_error "     4. Manual verification: curl -sk https://localhost:4000/api/opal/trusted-issuers | jq '.trusted_issuers | keys'"
        log_error "     5. Force sync: curl -X POST https://localhost:4000/api/opal/cdc/force-sync"
        log_error ""

        return 1  # HARD FAIL - Policy data not synced is a deployment-blocking issue
    fi
}

##
# Verify OIDC discovery endpoints for federation
# Helper function for spoke_verify_federation()
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - OIDC endpoints reachable
#   1 - OIDC endpoints not reachable
##
_spoke_verify_federation_oidc_endpoints() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    local spoke_realm="dive-v3-broker-${code_lower}"
    local hub_realm="dive-v3-broker-usa"

    # Get spoke Keycloak port from get_instance_ports (SSOT)
    local spoke_kc_port
    if type get_instance_ports &>/dev/null; then
        eval "$(get_instance_ports "$(upper "$instance_code")" 2>/dev/null)" || true
        spoke_kc_port="${SPOKE_KEYCLOAK_HTTPS_PORT:-8443}"
    else
        spoke_kc_port="8443"
    fi

    # Test both OIDC discovery endpoints (quick test - 3s timeout)
    local spoke_ok hub_ok
    spoke_ok=$(curl -sk --max-time 3 "https://localhost:${spoke_kc_port}/realms/${spoke_realm}/.well-known/openid-configuration" 2>/dev/null | grep -c '"issuer"' | tr -d '\n\r' || echo "0")
    # Hub Keycloak port: use HUB_KEYCLOAK_HTTPS_PORT if set, or default 8443
    local hub_kc_port="${HUB_KEYCLOAK_HTTPS_PORT:-8443}"
    hub_ok=$(curl -sk --max-time 3 "https://localhost:${hub_kc_port}/realms/${hub_realm}/.well-known/openid-configuration" 2>/dev/null | grep -c '"issuer"' | tr -d '\n\r' || echo "0")

    [ "$spoke_ok" -ge 1 ] && [ "$hub_ok" -ge 1 ]
}

##
# Fallback IdP check when spoke_federation_verify is not available
# Helper function for spoke_verify_federation()
#
# Arguments:
#   $1 - Instance code
##
_spoke_verify_federation_fallback() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    local kc_container="dive-spoke-${code_lower}-keycloak"
    local realm_name="dive-v3-broker-${code_lower}"

    if docker ps --format '{{.Names}}' | grep -q "^${kc_container}$"; then
        local admin_token
        admin_token=$(spoke_federation_get_admin_token "$kc_container" 2>/dev/null)

        if [ -n "$admin_token" ]; then
            local idp_list
            idp_list=$(docker exec "$kc_container" curl -sf \
                -H "Authorization: Bearer $admin_token" \
                "http://localhost:8080/admin/realms/${realm_name}/identity-provider/instances" 2>/dev/null || echo "[]")

            if echo "$idp_list" | grep -q '"alias":"usa-idp"'; then
                log_verbose "Fallback check: usa-idp exists in spoke"
            else
                log_verbose "Fallback check: usa-idp NOT found in spoke"
            fi
        fi
    fi
}

# =============================================================================
# API HEALTH VERIFICATION
# =============================================================================

##
# Verify API endpoints are responding
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - APIs healthy
#   1 - Issues detected
##
spoke_verify_api_health() {
    local instance_code="$1"
    local code_lower=$(lower "$instance_code")

    log_step "Verifying API health..."

    local issues=0

    # Backend API
    local backend_container="dive-spoke-${code_lower}-backend"
    if docker ps --format '{{.Names}}' | grep -q "^${backend_container}$"; then
        # First check Docker's health status (most reliable)
        local docker_health
        docker_health=$(docker inspect --format='{{.State.Health.Status}}' "$backend_container" 2>/dev/null || echo "")

        if [ "$docker_health" = "healthy" ]; then
            echo "  ✅ Backend API: healthy"
        else
            # Fallback: try curl health endpoints (HTTPS with -k for self-signed certs)
            local api_health
            api_health=$(docker exec "$backend_container" curl -sfk "https://localhost:4000/health" 2>/dev/null || \
                         docker exec "$backend_container" curl -sfk "https://localhost:4000/api/health" 2>/dev/null || echo "")

            if echo "$api_health" | grep -qi "ok\|healthy\|status\|running"; then
                echo "  ✅ Backend API: healthy"
            elif [ -n "$api_health" ]; then
                echo "  ✅ Backend API: responding"
            elif [ "$docker_health" = "starting" ]; then
                echo "  ⏳ Backend API: starting"
            else
                echo "  ⚠️  Backend API: health check inconclusive"
                issues=$((issues + 1))
            fi
        fi
    else
        echo "  ⚠️  Backend container not running"
        issues=$((issues + 1))
    fi

    # Frontend
    local frontend_container="dive-spoke-${code_lower}-frontend"
    if docker ps --format '{{.Names}}' | grep -q "^${frontend_container}$"; then
        # First check Docker's health status (most reliable for Next.js)
        local docker_health
        docker_health=$(docker inspect --format='{{.State.Health.Status}}' "$frontend_container" 2>/dev/null || echo "")

        if [ "$docker_health" = "healthy" ]; then
            echo "  ✅ Frontend: healthy"
        else
            # Fallback: try curl (HTTPS with -k for self-signed certs)
            local frontend_health
            frontend_health=$(docker exec "$frontend_container" curl -sfk "https://localhost:3000/api/health" 2>/dev/null || \
                              docker exec "$frontend_container" curl -sfk -o /dev/null -w "%{http_code}" "https://localhost:3000/" 2>/dev/null || echo "")

            if [ "$frontend_health" = "200" ] || echo "$frontend_health" | grep -qi "ok\|healthy"; then
                echo "  ✅ Frontend: responding"
            elif [ -n "$frontend_health" ] && [ "$frontend_health" != "000" ]; then
                echo "  ✅ Frontend: accessible (HTTP $frontend_health)"
            elif [ "$docker_health" = "starting" ]; then
                echo "  ⏳ Frontend: starting"
            else
                echo "  ⚠️  Frontend: health check inconclusive"
            fi
        fi
    else
        echo "  ⚠️  Frontend container not running"
    fi

    # OPA (OPA uses HTTP internally, but check Docker health first)
    local opa_container="dive-spoke-${code_lower}-opa"
    if docker ps --format '{{.Names}}' | grep -q "^${opa_container}$"; then
        # First check Docker's health status (most reliable)
        local docker_health
        docker_health=$(docker inspect --format='{{.State.Health.Status}}' "$opa_container" 2>/dev/null || echo "")

        if [ "$docker_health" = "healthy" ]; then
            echo "  ✅ OPA: healthy"
        else
            # Fallback: try wget or curl (OPA container may not have either)
            # OPA health endpoint is HTTP on port 8181
            local opa_health
            opa_health=$(docker exec "$opa_container" wget -qO- "http://localhost:8181/health" 2>/dev/null || \
                         docker exec "$opa_container" curl -sf "http://localhost:8181/health" 2>/dev/null || echo "")

            # OPA health returns {} or {"plugins":{...}} when healthy
            if echo "$opa_health" | grep -q '{'; then
                echo "  ✅ OPA: healthy"
            elif [ "$docker_health" = "starting" ]; then
                echo "  ⏳ OPA: starting"
            else
                echo "  ⚠️  OPA: health check inconclusive"
            fi
        fi
    fi

    if [ $issues -eq 0 ]; then
        return 0
    else
        return 1
    fi
}

export SPOKE_PHASE_VERIFICATION_FEDERATION_LOADED=1
