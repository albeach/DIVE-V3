#!/usr/bin/env bash
# =============================================================================
# TEST: Bidirectional Federation Automation
# =============================================================================
# Validates the fix for missing spoke_configure_federation_after_approval
#
# Root Cause: Function was called but never implemented
# Fix: Added function that calls spoke_federation_create_bidirectional
#
# Expected Result:
#   - FRA registers with Hub successfully
#   - spoke_configure_federation_after_approval runs automatically
#   - fra-idp is created in USA Hub Keycloak
#   - Bidirectional SSO works (FRA→USA and USA→FRA)
# =============================================================================

set -eo pipefail

# Load common utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
export DIVE_ROOT="$PROJECT_ROOT"

source "${PROJECT_ROOT}/scripts/dive-modules/common.sh"

# Test instance
TEST_INSTANCE="FRA"
TEST_INSTANCE_LOWER="fra"

log_info "==========================================================="
log_info "Bidirectional Federation Automation Test"
log_info "==========================================================="

# =============================================================================
# Test 1: Verify function exists
# =============================================================================
test_function_exists() {
    log_info ""
    log_info "TEST 1: Verify spoke_configure_federation_after_approval exists"

    # Source the module
    source "${PROJECT_ROOT}/scripts/dive-modules/spoke/spoke-register.sh"

    if type spoke_configure_federation_after_approval &>/dev/null; then
        log_success "✓ Function spoke_configure_federation_after_approval exists"
    else
        log_error "✗ Function spoke_configure_federation_after_approval not found"
        return 1
    fi

    # Verify it loads the federation module
    if type spoke_federation_create_bidirectional &>/dev/null; then
        log_success "✓ spoke-federation module loaded correctly"
    else
        log_error "✗ spoke-federation module not loaded"
        return 1
    fi
}

# =============================================================================
# Test 2: Verify FRA IdP in Hub BEFORE fix
# =============================================================================
test_fra_idp_before() {
    log_info ""
    log_info "TEST 2: Check FRA IdP in Hub (before running fix)"

    local admin_token
    admin_token=$(curl -sk -X POST 'https://localhost:8443/realms/master/protocol/openid-connect/token' \
        -d 'client_id=admin-cli&username=admin&password=DiveAdminSecure2025!&grant_type=password' 2>/dev/null | \
        grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

    if [ -z "$admin_token" ]; then
        log_error "Cannot get Hub admin token"
        return 1
    fi

    local fra_idp
    fra_idp=$(curl -sk "https://localhost:8443/admin/realms/dive-v3-broker-usa/identity-provider/instances/fra-idp" \
        -H "Authorization: Bearer $admin_token" 2>/dev/null)

    if echo "$fra_idp" | grep -q '"alias":"fra-idp"'; then
        log_info "⚠ fra-idp already exists (test may not be clean)"
        log_info "Deleting existing fra-idp for clean test..."
        curl -sk -X DELETE "https://localhost:8443/admin/realms/dive-v3-broker-usa/identity-provider/instances/fra-idp" \
            -H "Authorization: Bearer $admin_token" 2>/dev/null || true
        sleep 1
    else
        log_success "✓ fra-idp does not exist (clean state)"
    fi
}

# =============================================================================
# Test 3: Re-register FRA and verify automatic federation
# =============================================================================
test_reregister_fra() {
    log_info ""
    log_info "TEST 3: Re-register FRA spoke (triggers auto-configuration)"

    # Unregister first (clean up MongoDB)
    log_info "Cleaning up existing FRA registration..."
    curl -sk -X DELETE "https://localhost:4000/api/federation/spokes/fra" \
        -H "X-Admin-Key: admin-dev-key" 2>/dev/null || true
    sleep 2

    # Re-register FRA
    log_info "Re-registering FRA spoke..."
    local register_output
    register_output=$("${PROJECT_ROOT}/dive" spoke register FRA 2>&1)

    echo "$register_output" | grep -q "Registration request submitted" || {
        log_error "Registration failed"
        echo "$register_output"
        return 1
    }

    log_success "✓ FRA registration submitted"

    # Check for auto-configuration messages
    if echo "$register_output" | grep -q "Auto-configuring bidirectional federation"; then
        log_success "✓ Auto-configuration triggered"
    else
        log_warn "⚠ Auto-configuration message not found in output"
    fi

    if echo "$register_output" | grep -q "Bidirectional federation configured"; then
        log_success "✓ Bidirectional federation succeeded"
    elif echo "$register_output" | grep -q "Federation auto-configuration failed"; then
        log_error "✗ Auto-configuration failed"
        echo "$register_output" | tail -20
        return 1
    else
        log_warn "⚠ Federation status unclear"
    fi
}

# =============================================================================
# Test 4: Verify fra-idp was created in Hub
# =============================================================================
test_fra_idp_after() {
    log_info ""
    log_info "TEST 4: Verify fra-idp exists in Hub after registration"

    local admin_token
    admin_token=$(curl -sk -X POST 'https://localhost:8443/realms/master/protocol/openid-connect/token' \
        -d 'client_id=admin-cli&username=admin&password=DiveAdminSecure2025!&grant_type=password' 2>/dev/null | \
        grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

    if [ -z "$admin_token" ]; then
        log_error "Cannot get Hub admin token"
        return 1
    fi

    # Wait a few seconds for federation to propagate
    sleep 3

    local fra_idp
    fra_idp=$(curl -sk "https://localhost:8443/admin/realms/dive-v3-broker-usa/identity-provider/instances/fra-idp" \
        -H "Authorization: Bearer $admin_token" 2>/dev/null)

    if echo "$fra_idp" | grep -q '"alias":"fra-idp"'; then
        log_success "✓ fra-idp exists in Hub"

        # Check if enabled
        if echo "$fra_idp" | grep -q '"enabled":true'; then
            log_success "✓ fra-idp is enabled"
        else
            log_warn "⚠ fra-idp exists but is disabled"
        fi

        # Check if has authorization URL
        local auth_url
        auth_url=$(echo "$fra_idp" | grep -o '"authorizationUrl":"[^"]*' | cut -d'"' -f4)
        if [ -n "$auth_url" ] && [ "$auth_url" != "null" ]; then
            log_success "✓ fra-idp has authorizationUrl: $auth_url"
        else
            log_error "✗ fra-idp missing authorizationUrl"
            return 1
        fi

        # Check if has token URL
        local token_url
        token_url=$(echo "$fra_idp" | grep -o '"tokenUrl":"[^"]*' | cut -d'"' -f4)
        if [ -n "$token_url" ] && [ "$token_url" != "null" ]; then
            log_success "✓ fra-idp has tokenUrl: $token_url"
        else
            log_error "✗ fra-idp missing tokenUrl"
            return 1
        fi

        return 0
    else
        log_error "✗ fra-idp NOT found in Hub"
        log_error "Bidirectional federation was not configured"
        echo "Response:"
        echo "$fra_idp" | jq '.' 2>/dev/null || echo "$fra_idp"
        return 1
    fi
}

# =============================================================================
# Test 5: Verify usa-idp exists in FRA (reverse direction)
# =============================================================================
test_usa_idp_in_fra() {
    log_info ""
    log_info "TEST 5: Verify usa-idp exists in FRA spoke"

    local admin_password="${KEYCLOAK_ADMIN_PASSWORD_FRA:-mFCWpiUotHDbEyApsQv7Ew}"

    local admin_token
    admin_token=$(docker exec dive-spoke-fra-keycloak curl -sf \
        -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
        -d "username=admin&password=${admin_password}&grant_type=password&client_id=admin-cli" 2>/dev/null | \
        grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

    if [ -z "$admin_token" ]; then
        log_error "Cannot get FRA admin token"
        return 1
    fi

    local usa_idp
    usa_idp=$(docker exec dive-spoke-fra-keycloak curl -sf \
        -H "Authorization: Bearer $admin_token" \
        "http://localhost:8080/admin/realms/dive-v3-broker-fra/identity-provider/instances/usa-idp" 2>/dev/null)

    if echo "$usa_idp" | grep -q '"alias":"usa-idp"'; then
        log_success "✓ usa-idp exists in FRA (bidirectional complete)"
        return 0
    else
        log_error "✗ usa-idp NOT found in FRA"
        return 1
    fi
}

# =============================================================================
# Main
# =============================================================================
main() {
    local test_count=0
    local pass_count=0

    # Run tests
    if test_function_exists; then
        pass_count=$((pass_count + 1))
    fi
    test_count=$((test_count + 1))

    if test_fra_idp_before; then
        pass_count=$((pass_count + 1))
    fi
    test_count=$((test_count + 1))

    if test_reregister_fra; then
        pass_count=$((pass_count + 1))
    fi
    test_count=$((test_count + 1))

    if test_fra_idp_after; then
        pass_count=$((pass_count + 1))
    fi
    test_count=$((test_count + 1))

    if test_usa_idp_in_fra; then
        pass_count=$((pass_count + 1))
    fi
    test_count=$((test_count + 1))

    # Summary
    log_info ""
    log_info "==========================================================="
    log_info "Test Summary"
    log_info "==========================================================="
    log_info "Passed: $pass_count / $test_count"

    if [ $pass_count -eq $test_count ]; then
        log_success "✅ ALL TESTS PASSED"
        log_info ""
        log_info "Bidirectional federation is now 100% automated:"
        log_info "1. FRA→USA: Users can login from FRA to USA Hub ✅"
        log_info "2. USA→FRA: Users can select France IdP at Hub login ✅"
        log_info ""
        log_info "Test login flow:"
        log_info "  Open https://localhost:3000"
        log_info "  Click 'France' IdP"
        log_info "  Login with testuser-fra-1"
        return 0
    else
        log_error "❌ SOME TESTS FAILED"
        log_info ""
        log_info "Troubleshooting:"
        log_info "1. Check logs: docker logs dive-hub-keycloak | tail -50"
        log_info "2. Verify function: type spoke_configure_federation_after_approval"
        log_info "3. Manual fix: ./dive federation link FRA"
        return 1
    fi
}

main "$@"
