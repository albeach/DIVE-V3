#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Federation Verification Module (Consolidated)
# =============================================================================
# Federation verification and SSO testing
# =============================================================================
# Version: 5.0.0 (Module Consolidation)
# Date: 2026-01-22
#
# Consolidates:
#   - federation-test.sh
#   - spoke/spoke-federation-health.sh
# =============================================================================

# Prevent multiple sourcing
[ -n "${DIVE_FEDERATION_VERIFICATION_LOADED:-}" ] && return 0
export DIVE_FEDERATION_VERIFICATION_LOADED=1

# =============================================================================
# LOAD DEPENDENCIES
# =============================================================================

FEDERATION_DIR="$(dirname "${BASH_SOURCE[0]}")"
MODULES_DIR="$(dirname "$FEDERATION_DIR")"

if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "${MODULES_DIR}/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Load setup module for token functions
if [ -f "${FEDERATION_DIR}/setup.sh" ]; then
    source "${FEDERATION_DIR}/setup.sh"
fi

# =============================================================================
# CONFIGURATION
# =============================================================================

HUB_KC_URL="${HUB_KC_URL:-https://localhost:8443}"
HUB_REALM="${HUB_REALM:-dive-v3-broker}"

# =============================================================================
# VERIFICATION FUNCTIONS
# =============================================================================

##
# Comprehensive federation verification
#
# Arguments:
#   $1 - Instance code
#
# Returns:
#   0 - All checks passed
#   1 - Some checks failed
##
federation_verify() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_step "Verifying federation for $code_upper..."

    local passed=0
    local failed=0
    local total=0

    # Get spoke configuration
    eval "$(get_instance_ports "$instance_code" 2>/dev/null)"
    local kc_port="${SPOKE_KEYCLOAK_HTTPS_PORT:-8443}"
    local spoke_url="https://localhost:${kc_port}"
    local spoke_realm="dive-v3-broker-${code_lower}"
    local idp_alias="${code_lower}-idp"

    # Check 1: Hub accessibility
    ((total++)) || true
    log_info "Check 1: Hub Keycloak accessibility..."
    if curl -sf "${HUB_KC_URL}/realms/master" --insecure >/dev/null 2>&1; then
        ((passed++)) || true || true
        log_success "  Hub Keycloak is accessible"
    else
        ((failed++)) || true
        log_error "  Hub Keycloak is not accessible"
    fi

    # Check 2: Spoke accessibility
    ((total++)) || true
    log_info "Check 2: Spoke Keycloak accessibility..."
    if curl -sf "${spoke_url}/realms/master" --insecure >/dev/null 2>&1; then
        ((passed++)) || true || true
        log_success "  Spoke Keycloak is accessible"
    else
        ((failed++)) || true
        log_error "  Spoke Keycloak is not accessible"
    fi

    # Check 3: Hub realm exists
    ((total++)) || true
    log_info "Check 3: Hub broker realm exists..."
    if curl -sf "${HUB_KC_URL}/realms/${HUB_REALM}" --insecure >/dev/null 2>&1; then
        ((passed++)) || true || true
        log_success "  Hub broker realm exists"
    else
        ((failed++)) || true
        log_error "  Hub broker realm not found"
    fi

    # Check 4: Spoke realm exists
    ((total++)) || true
    log_info "Check 4: Spoke broker realm exists..."
    if curl -sf "${spoke_url}/realms/${spoke_realm}" --insecure >/dev/null 2>&1; then
        ((passed++)) || true || true
        log_success "  Spoke broker realm exists"
    else
        ((failed++)) || true
        log_error "  Spoke broker realm not found"
    fi

    # Check 5: IdP configured on Hub
    ((total++)) || true
    log_info "Check 5: IdP configured on Hub..."
    local hub_token=$(get_hub_admin_token 2>/dev/null)
    if [ -n "$hub_token" ]; then
        local idp_exists=$(curl -sf "${HUB_KC_URL}/admin/realms/${HUB_REALM}/identity-provider/instances/${idp_alias}" \
            -H "Authorization: Bearer $hub_token" \
            --insecure 2>/dev/null | jq -r '.alias // empty')

        if [ "$idp_exists" = "$idp_alias" ]; then
            ((passed++)) || true
            log_success "  IdP '${idp_alias}' configured on Hub"
        else
            ((failed++)) || true
            log_error "  IdP '${idp_alias}' not found on Hub"
        fi
    else
        ((failed++)) || true
        log_error "  Cannot verify IdP (no Hub token)"
    fi

    # Check 6: Federation client on Spoke
    ((total++)) || true
    log_info "Check 6: Federation client on Spoke..."
    local spoke_token=$(get_spoke_admin_token "$instance_code" 2>/dev/null)
    if [ -n "$spoke_token" ]; then
        # The spoke should have an incoming federation client named dive-v3-broker-usa
        # This is the client the Hub uses to authenticate to the spoke
        local client_exists=$(curl -sf "${spoke_url}/admin/realms/${spoke_realm}/clients" \
            -H "Authorization: Bearer $spoke_token" \
            --insecure 2>/dev/null | jq -r '.[] | select(.clientId=="dive-v3-broker-usa") | .clientId')

        if [ "$client_exists" = "dive-v3-broker-usa" ]; then
            ((passed++)) || true
            log_success "  Federation client (dive-v3-broker-usa) exists on Spoke"
        else
            ((failed++)) || true
            log_error "  Federation client (dive-v3-broker-usa) not found on Spoke"
        fi
    else
        ((failed++)) || true
        log_error "  Cannot verify client (no Spoke token)"
    fi

    # Check 7: IdP metadata accessible
    ((total++)) || true
    log_info "Check 7: IdP OIDC metadata accessible..."
    if curl -sf "${spoke_url}/realms/${spoke_realm}/.well-known/openid-configuration" --insecure >/dev/null 2>&1; then
        ((passed++)) || true || true
        log_success "  OIDC metadata is accessible"
    else
        ((failed++)) || true
        log_error "  OIDC metadata not accessible"
    fi

    # Check 8: JWKS endpoint
    ((total++)) || true
    log_info "Check 8: JWKS endpoint accessible..."
    if curl -sf "${spoke_url}/realms/${spoke_realm}/protocol/openid-connect/certs" --insecure >/dev/null 2>&1; then
        ((passed++)) || true || true
        log_success "  JWKS endpoint is accessible"
    else
        ((failed++)) || true
        log_error "  JWKS endpoint not accessible"
    fi

    # Summary
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Federation Verification: $code_upper"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Passed: $passed / $total"
    echo "  Failed: $failed / $total"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    if [ $failed -eq 0 ]; then
        log_success "All federation checks passed!"
        echo ""
        echo "SSO should now work between Hub and $code_upper"
        return 0
    else
        log_error "Some federation checks failed"
        echo ""
        echo "Troubleshooting:"
        echo "  1. Check Hub: ./dive hub status"
        echo "  2. Check Spoke: ./dive spoke status $code_upper"
        echo "  3. Re-link: ./dive federation link $code_upper"
        return 1
    fi
}

##
# Quick federation health check
#
# Arguments:
#   $1 - Instance code
##
federation_health_check() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    eval "$(get_instance_ports "$instance_code" 2>/dev/null)"
    local kc_port="${SPOKE_KEYCLOAK_HTTPS_PORT:-8443}"
    local spoke_url="https://localhost:${kc_port}"
    local spoke_realm="dive-v3-broker-${code_lower}"

    local hub_ok=false
    local spoke_ok=false
    local federation_ok=false

    # Hub check
    if curl -sf "${HUB_KC_URL}/realms/${HUB_REALM}" --insecure >/dev/null 2>&1; then
        hub_ok=true
    fi

    # Spoke check
    if curl -sf "${spoke_url}/realms/${spoke_realm}" --insecure >/dev/null 2>&1; then
        spoke_ok=true
    fi

    # Federation check
    local hub_token=$(get_hub_admin_token 2>/dev/null)
    if [ -n "$hub_token" ]; then
        local idp_alias="${code_lower}-idp"
        if curl -sf "${HUB_KC_URL}/admin/realms/${HUB_REALM}/identity-provider/instances/${idp_alias}" \
            -H "Authorization: Bearer $hub_token" \
            --insecure 2>/dev/null | jq -e '.enabled' >/dev/null 2>&1; then
            federation_ok=true
        fi
    fi

    # Output JSON health status
    cat << EOF
{
  "instance_code": "${code_upper}",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "hub_healthy": $hub_ok,
  "spoke_healthy": $spoke_ok,
  "federation_active": $federation_ok,
  "overall_status": "$([ "$hub_ok" = true ] && [ "$spoke_ok" = true ] && [ "$federation_ok" = true ] && echo "healthy" || echo "degraded")"
}
EOF
}

##
# Test SSO flow (simulation)
#
# Arguments:
#   $1 - Instance code
##
federation_test_sso_flow() {
    local instance_code="$1"
    local code_upper=$(upper "$instance_code")
    local code_lower=$(lower "$instance_code")

    log_info "Testing SSO flow for $code_upper..."

    eval "$(get_instance_ports "$instance_code" 2>/dev/null)"
    local kc_port="${SPOKE_KEYCLOAK_HTTPS_PORT:-8443}"
    local spoke_url="https://localhost:${kc_port}"
    local spoke_realm="dive-v3-broker-${code_lower}"
    local idp_alias="${code_lower}-idp"

    # Step 1: Get auth URL from Hub for this IdP
    log_verbose "Step 1: Getting authentication URL..."

    local auth_url="${HUB_KC_URL}/realms/${HUB_REALM}/protocol/openid-connect/auth"
    auth_url="${auth_url}?client_id=dive-frontend"
    auth_url="${auth_url}&redirect_uri=http://localhost:3000/api/auth/callback/keycloak"
    auth_url="${auth_url}&response_type=code"
    auth_url="${auth_url}&scope=openid%20profile%20email"
    auth_url="${auth_url}&kc_idp_hint=${idp_alias}"

    log_verbose "Auth URL: $auth_url"

    # Step 2: Check if redirect happens
    log_verbose "Step 2: Testing redirect to IdP..."

    local redirect_response
    redirect_response=$(curl -sf -I "$auth_url" --insecure 2>/dev/null | grep -i "location:")

    if echo "$redirect_response" | grep -qi "$spoke_url"; then
        log_success "SSO redirect to Spoke IdP is working"
        return 0
    else
        log_warn "SSO redirect may not be configured correctly"
        log_verbose "Response: $redirect_response"
        return 1
    fi
}

# =============================================================================
# MULTI-SPOKE FEDERATION TESTS
# =============================================================================

##
# Verify federation for all provisioned spokes
#
# Returns:
#   0 - All spokes passed
#   1 - One or more failed
##
federation_verify_all() {
    local spokes=()
    if type -t dive_get_provisioned_spokes &>/dev/null; then
        for s in $(dive_get_provisioned_spokes 2>/dev/null); do
            [ -n "$s" ] && spokes+=("$(upper "$s")")
        done
    fi

    # Fallback: scan instances/ directories
    if [ ${#spokes[@]} -eq 0 ] && [ -d "${DIVE_ROOT}/instances" ]; then
        for dir in "${DIVE_ROOT}"/instances/*/; do
            [ -d "$dir" ] || continue
            local code
            code=$(basename "$dir")
            [ "$code" = "usa" ] && continue
            [[ "$code" == .* ]] && continue
            spokes+=("$(upper "$code")")
        done
    fi

    if [ ${#spokes[@]} -eq 0 ]; then
        log_warn "No provisioned spokes found"
        return 1
    fi

    local passed=0
    local failed=0
    for code in "${spokes[@]}"; do
        if federation_verify "$code"; then
            passed=$((passed + 1))
        else
            failed=$((failed + 1))
        fi
    done

    echo ""
    echo "Federation Verify All: $passed passed, $failed failed (${#spokes[@]} total)"
    [ $failed -eq 0 ] && return 0 || return 1
}

##
# Verify OPAL data sync for all provisioned spokes
#
# Checks that each spoke's OPA instance has federation_matrix
# or trusted_issuers data from OPAL sync.
#
# Returns:
#   0 - All spokes have OPAL data
#   1 - One or more missing
##
federation_verify_opal_all() {
    local spokes=()
    if type -t dive_get_provisioned_spokes &>/dev/null; then
        for s in $(dive_get_provisioned_spokes 2>/dev/null); do
            [ -n "$s" ] && spokes+=("$(upper "$s")")
        done
    fi

    # Fallback: scan instances/ directories
    if [ ${#spokes[@]} -eq 0 ] && [ -d "${DIVE_ROOT}/instances" ]; then
        for dir in "${DIVE_ROOT}"/instances/*/; do
            [ -d "$dir" ] || continue
            local code
            code=$(basename "$dir")
            [ "$code" = "usa" ] && continue
            [[ "$code" == .* ]] && continue
            spokes+=("$(upper "$code")")
        done
    fi

    if [ ${#spokes[@]} -eq 0 ]; then
        log_warn "No provisioned spokes found"
        return 1
    fi

    local passed=0
    local failed=0
    for code in "${spokes[@]}"; do
        eval "$(get_instance_ports "$code" 2>/dev/null)" || true
        local opa_port="${SPOKE_OPA_PORT:-8181}"

        local opa_data
        opa_data=$(curl -skf --max-time "${DIVE_TIMEOUT_CURL_DEFAULT:-10}" \
            "https://localhost:${opa_port}/v1/data" 2>/dev/null)

        if echo "$opa_data" | jq -e '.result.federation_matrix // .result.trusted_issuers' >/dev/null 2>&1; then
            log_success "  $code: OPAL data present in OPA"
            passed=$((passed + 1))
        else
            log_warn "  $code: No federation data in OPA (port $opa_port)"
            failed=$((failed + 1))
        fi
    done

    echo ""
    echo "OPAL Verify All: $passed with data, $failed missing (${#spokes[@]} total)"
    [ $failed -eq 0 ] && return 0 || return 1
}

##
# Master federation integration test suite
#
# Runs comprehensive federation tests across all spokes:
#   - Per-spoke 8-check federation verification
#   - Per-spoke federation health endpoint
#   - Per-spoke OPAL data presence
#   - Hub federation registry check
##
federation_integration_test() {
    # Load test framework
    local _test_path="${FEDERATION_DIR}/../utilities/testing.sh"
    if [ -f "$_test_path" ]; then
        source "$_test_path"
    elif [ -f "${DIVE_ROOT}/scripts/dive-modules/utilities/testing.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/utilities/testing.sh"
    else
        log_error "Testing framework not found"
        return 1
    fi

    test_suite_start "Federation Integration Tests"

    # Discover spokes
    local spokes=()
    if type -t dive_get_provisioned_spokes &>/dev/null; then
        for s in $(dive_get_provisioned_spokes 2>/dev/null); do
            [ -n "$s" ] && spokes+=("$(upper "$s")")
        done
    fi

    # Fallback: scan instances/ directories
    if [ ${#spokes[@]} -eq 0 ] && [ -d "${DIVE_ROOT}/instances" ]; then
        for dir in "${DIVE_ROOT}"/instances/*/; do
            [ -d "$dir" ] || continue
            local code
            code=$(basename "$dir")
            [ "$code" = "usa" ] && continue
            [[ "$code" == .* ]] && continue
            spokes+=("$(upper "$code")")
        done
    fi

    if [ ${#spokes[@]} -eq 0 ]; then
        test_start "Spoke discovery"
        test_fail "No provisioned spokes found"
        test_suite_end
        return 1
    fi

    # Test 1: Hub health
    test_start "Hub backend health"
    if curl -skf --max-time "${DIVE_TIMEOUT_CURL_DEFAULT:-10}" "https://localhost:4000/api/health" >/dev/null 2>&1; then
        test_pass
    else
        test_fail "Hub backend unreachable"
    fi

    # Test 2: Hub federation registry
    test_start "Hub spoke registry accessible"
    local registry_resp
    registry_resp=$(curl -sk -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY:-dive-hub-admin-key}" \
        --max-time "${DIVE_TIMEOUT_CURL_DEFAULT:-10}" \
        "https://localhost:4000/api/federation/spokes" 2>/dev/null)
    local spoke_count
    spoke_count=$(echo "$registry_resp" | jq '.spokes | length' 2>/dev/null || echo "0")
    if [ "$spoke_count" -ge "${#spokes[@]}" ]; then
        test_pass
    else
        test_fail "Expected ${#spokes[@]} spokes, found $spoke_count"
    fi

    # Per-spoke tests
    for code in "${spokes[@]}"; do
        local code_lower=$(lower "$code")

        # Resolve ports
        eval "$(get_instance_ports "$code" 2>/dev/null)" || true
        local kc_port="${SPOKE_KEYCLOAK_HTTPS_PORT:-8443}"
        local be_port="${SPOKE_BACKEND_PORT:-4000}"
        local opa_port="${SPOKE_OPA_PORT:-8181}"

        # Test: Spoke Keycloak realm exists
        test_start "$code: Keycloak realm exists"
        if curl -skf --max-time "${DIVE_TIMEOUT_CURL_DEFAULT:-10}" \
            "https://localhost:${kc_port}/realms/dive-v3-broker-${code_lower}" >/dev/null 2>&1; then
            test_pass
        else
            test_fail "Realm not accessible on port $kc_port"
        fi

        # Test: Spoke backend federation health
        test_start "$code: Backend API health"
        if curl -skf --max-time "${DIVE_TIMEOUT_CURL_DEFAULT:-10}" \
            "https://localhost:${be_port}/api/health" >/dev/null 2>&1; then
            test_pass
        else
            test_fail "Backend unreachable on port $be_port"
        fi

        # Test: Hub has IdP for this spoke
        test_start "$code: Hub has ${code_lower}-idp"
        local hub_token
        if type -t get_hub_admin_token &>/dev/null; then
            hub_token=$(get_hub_admin_token 2>/dev/null)
        fi
        if [ -n "$hub_token" ]; then
            local idp_check
            idp_check=$(curl -sf "https://localhost:8443/admin/realms/dive-v3-broker-usa/identity-provider/instances/${code_lower}-idp" \
                -H "Authorization: Bearer $hub_token" --insecure 2>/dev/null | jq -r '.alias // empty')
            if [ "$idp_check" = "${code_lower}-idp" ]; then
                test_pass
            else
                test_fail "IdP not found in Hub Keycloak"
            fi
        else
            test_skip "No hub admin token"
        fi

        # Test: Spoke registered and approved in Hub
        test_start "$code: Registered and approved in Hub"
        local spoke_status
        spoke_status=$(echo "$registry_resp" | jq -r ".spokes[] | select(.instanceCode==\"$code\") | .status" 2>/dev/null)
        if [ "$spoke_status" = "approved" ]; then
            test_pass
        else
            test_fail "Status: ${spoke_status:-not found}"
        fi

        # Test: OPA has policies
        test_start "$code: OPA has policies loaded"
        local policy_count
        policy_count=$(curl -sk --max-time 5 "https://localhost:${opa_port}/v1/policies" 2>/dev/null | jq '.result | length' 2>/dev/null)
        policy_count="${policy_count:-0}"
        if [ "$policy_count" -gt 0 ] 2>/dev/null; then
            test_pass
        else
            test_fail "No policies in OPA"
        fi
    done

    test_suite_end
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f federation_verify
export -f federation_health_check
export -f federation_test_sso_flow
export -f federation_verify_all
export -f federation_verify_opal_all
export -f federation_integration_test

log_verbose "Federation verification module loaded"
