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
    local ports=$(get_instance_ports "$instance_code" 2>/dev/null)
    local kc_port=$(echo "$ports" | jq -r '.keycloak // 8443')
    local spoke_url="https://localhost:${kc_port}"
    local spoke_realm="dive-v3-broker-${code_lower}"
    local idp_alias="${code_lower}-idp"

    # Check 1: Hub accessibility
    ((total++))
    log_info "Check 1: Hub Keycloak accessibility..."
    if curl -sf "${HUB_KC_URL}/realms/master" --insecure >/dev/null 2>&1; then
        ((passed++))
        log_success "  Hub Keycloak is accessible"
    else
        ((failed++))
        log_error "  Hub Keycloak is not accessible"
    fi

    # Check 2: Spoke accessibility
    ((total++))
    log_info "Check 2: Spoke Keycloak accessibility..."
    if curl -sf "${spoke_url}/realms/master" --insecure >/dev/null 2>&1; then
        ((passed++))
        log_success "  Spoke Keycloak is accessible"
    else
        ((failed++))
        log_error "  Spoke Keycloak is not accessible"
    fi

    # Check 3: Hub realm exists
    ((total++))
    log_info "Check 3: Hub broker realm exists..."
    if curl -sf "${HUB_KC_URL}/realms/${HUB_REALM}" --insecure >/dev/null 2>&1; then
        ((passed++))
        log_success "  Hub broker realm exists"
    else
        ((failed++))
        log_error "  Hub broker realm not found"
    fi

    # Check 4: Spoke realm exists
    ((total++))
    log_info "Check 4: Spoke broker realm exists..."
    if curl -sf "${spoke_url}/realms/${spoke_realm}" --insecure >/dev/null 2>&1; then
        ((passed++))
        log_success "  Spoke broker realm exists"
    else
        ((failed++))
        log_error "  Spoke broker realm not found"
    fi

    # Check 5: IdP configured on Hub
    ((total++))
    log_info "Check 5: IdP configured on Hub..."
    local hub_token=$(get_hub_admin_token 2>/dev/null)
    if [ -n "$hub_token" ]; then
        local idp_exists=$(curl -sf "${HUB_KC_URL}/admin/realms/${HUB_REALM}/identity-provider/instances/${idp_alias}" \
            -H "Authorization: Bearer $hub_token" \
            --insecure 2>/dev/null | jq -r '.alias // empty')

        if [ "$idp_exists" = "$idp_alias" ]; then
            ((passed++))
            log_success "  IdP '${idp_alias}' configured on Hub"
        else
            ((failed++))
            log_error "  IdP '${idp_alias}' not found on Hub"
        fi
    else
        ((failed++))
        log_error "  Cannot verify IdP (no Hub token)"
    fi

    # Check 6: Federation client on Spoke
    ((total++))
    log_info "Check 6: Federation client on Spoke..."
    local spoke_token=$(get_spoke_admin_token "$instance_code" 2>/dev/null)
    if [ -n "$spoke_token" ]; then
        local client_exists=$(curl -sf "${spoke_url}/admin/realms/${spoke_realm}/clients" \
            -H "Authorization: Bearer $spoke_token" \
            --insecure 2>/dev/null | jq -r '.[] | select(.clientId=="dive-hub-federation") | .clientId')

        if [ "$client_exists" = "dive-hub-federation" ]; then
            ((passed++))
            log_success "  Federation client exists on Spoke"
        else
            ((failed++))
            log_error "  Federation client not found on Spoke"
        fi
    else
        ((failed++))
        log_error "  Cannot verify client (no Spoke token)"
    fi

    # Check 7: IdP metadata accessible
    ((total++))
    log_info "Check 7: IdP OIDC metadata accessible..."
    if curl -sf "${spoke_url}/realms/${spoke_realm}/.well-known/openid-configuration" --insecure >/dev/null 2>&1; then
        ((passed++))
        log_success "  OIDC metadata is accessible"
    else
        ((failed++))
        log_error "  OIDC metadata not accessible"
    fi

    # Check 8: JWKS endpoint
    ((total++))
    log_info "Check 8: JWKS endpoint accessible..."
    if curl -sf "${spoke_url}/realms/${spoke_realm}/protocol/openid-connect/certs" --insecure >/dev/null 2>&1; then
        ((passed++))
        log_success "  JWKS endpoint is accessible"
    else
        ((failed++))
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

    local ports=$(get_instance_ports "$instance_code" 2>/dev/null)
    local kc_port=$(echo "$ports" | jq -r '.keycloak // 8443')
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

    local ports=$(get_instance_ports "$instance_code" 2>/dev/null)
    local kc_port=$(echo "$ports" | jq -r '.keycloak // 8443')
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
# MODULE EXPORTS
# =============================================================================

export -f federation_verify
export -f federation_health_check
export -f federation_test_sso_flow

log_verbose "Federation verification module loaded"
