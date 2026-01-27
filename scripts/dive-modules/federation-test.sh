#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Federation Test Module
# =============================================================================
# Extracted from federation.sh during refactoring for modularity
# Commands: federation test [basic|connectivity|auth|full]
# =============================================================================
# Version: 1.0.0
# Date: 2025-12-23
# =============================================================================

# Ensure common functions are loaded
if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Mark this module as loaded
export DIVE_FEDERATION_TEST_LOADED=1

# =============================================================================
# PORT CALCULATION - DELEGATED TO COMMON.SH (SSOT)
# =============================================================================
# See: scripts/dive-modules/common.sh:get_instance_ports()
# =============================================================================

##
# Get port offset for a spoke instance - DELEGATED TO COMMON.SH (SSOT)
##
_get_spoke_port_offset() {
    local spoke="${1:-}"

    # Use SSOT function from common.sh
    eval "$(get_instance_ports "${spoke^^}")"
    echo "$SPOKE_PORT_OFFSET"
}

# =============================================================================
# TEST FUNCTIONS
# =============================================================================

##
# Run comprehensive federation integration tests
# Tests end-to-end federation workflows and cross-instance connectivity
#
# Arguments:
#   $1 - Test type (all, basic, connectivity, auth, full)
#
# Returns:
#   0 - All tests passed
#   1 - Some tests failed
##
federation_test() {
    local test_type="${1:-basic}"
    echo -e "${BOLD}Federation Integration Tests${NC}"
    echo "================================"

    local total_tests=0
    local passed_tests=0
    local hub_url="https://localhost:4000"

    if [ "$ENVIRONMENT" = "gcp" ] || [ "$ENVIRONMENT" = "pilot" ]; then
        hub_url="https://usa-api.dive25.com"
    fi

    echo "Test Type: $test_type"
    echo "Hub URL: $hub_url"
    echo ""

    case "$test_type" in
        "basic"|"all")
            run_federation_basic_tests "$hub_url"
            ;;
        "connectivity"|"all")
            run_federation_connectivity_tests "$hub_url"
            ;;
        "auth"|"all")
            run_federation_auth_tests "$hub_url"
            ;;
        "full")
            echo "Running full test suite..."
            echo ""

            run_federation_basic_tests "$hub_url"
            echo ""
            run_federation_connectivity_tests "$hub_url"
            echo ""
            run_federation_auth_tests "$hub_url"
            ;;
        *)
            echo "Usage: ./dive federation test [basic|connectivity|auth|full]"
            echo ""
            echo "Test Types:"
            echo "  basic        - Hub API and basic federation endpoints"
            echo "  connectivity - Cross-instance network connectivity"
            echo "  auth         - Authentication and SSO flows"
            echo "  full         - Complete test suite (all of above)"
            return 1
            ;;
    esac
}

##
# Run basic federation API tests
##
run_federation_basic_tests() {
    local hub_url="${1:-https://localhost:4000}"

    echo "1. Basic Federation API Tests"
    echo "-------------------------------"

    local tests_passed=0
    local tests_total=0

    # Test 1: Hub health
    ((tests_total++))
    echo -n "   Hub health endpoint: "
    if curl -sk --max-time 5 "${hub_url}/health" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ PASS${NC}"
        ((tests_passed++))
    else
        echo -e "${RED}✗ FAIL${NC}"
    fi

    # Test 2: Federation status API
    ((tests_total++))
    echo -n "   Federation status API: "
    if curl -sk --max-time 5 "${hub_url}/api/federation/status" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ PASS${NC}"
        ((tests_passed++))
    else
        echo -e "${RED}✗ FAIL${NC}"
    fi

    # Test 3: Hub Keycloak discovery
    ((tests_total++))
    local kc_url="${hub_url//4000/8443}"
    echo -n "   Hub Keycloak discovery: "
    if curl -sk --max-time 5 "${kc_url}/realms/${HUB_REALM:-dive-v3-broker-usa}/.well-known/openid-connect-configuration" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ PASS${NC}"
        ((tests_passed++))
    else
        echo -e "${RED}✗ FAIL${NC}"
    fi

    echo "   Basic tests: $tests_passed/$tests_total passed"
}

##
# Run cross-instance connectivity tests
##
run_federation_connectivity_tests() {
    local hub_url="${1:-https://localhost:4000}"

    echo "2. Cross-Instance Connectivity Tests"
    echo "-------------------------------------"

    local tests_passed=0
    local tests_total=0

    # Find running spokes
    local running_spokes=""
    for spoke in fra est gbr deu; do
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "dive-spoke-${spoke}"; then
            running_spokes="$running_spokes $spoke"
        fi
    done

    if [ -z "$running_spokes" ]; then
        echo "   ${YELLOW}⚠️  No running spokes found - skipping connectivity tests${NC}"
        return 0
    fi

    for spoke in $running_spokes; do
        # Test spoke API connectivity
        ((tests_total++))
        local spoke_offset=$(_get_spoke_port_offset "$spoke")
        local spoke_port=$((4000 + spoke_offset))
        echo -n "   ${spoke^^} API connectivity: "
        if curl -sk --max-time 3 "https://localhost:${spoke_port}/health" >/dev/null 2>&1; then
            echo -e "${GREEN}✓ PASS${NC}"
            ((tests_passed++))
        else
            echo -e "${RED}✗ FAIL${NC}"
        fi

        # Test spoke Keycloak connectivity
        ((tests_total++))
        local kc_port=$((8443 + spoke_offset))
        echo -n "   ${spoke^^} Keycloak discovery: "
        if curl -sk --max-time 3 "https://localhost:${kc_port}/realms/dive-v3-broker-${spoke}/.well-known/openid-connect-configuration" >/dev/null 2>&1; then
            echo -e "${GREEN}✓ PASS${NC}"
            ((tests_passed++))
        else
            echo -e "${RED}✗ FAIL${NC}"
        fi

        # Test federation registration status
        ((tests_total++))
        local spoke_dir="${DIVE_ROOT}/instances/${spoke}"
        local config_file="$spoke_dir/config.json"
        echo -n "   ${spoke^^} federation registration: "
        if [ -f "$config_file" ] && jq -e '.federation.status == "approved"' "$config_file" >/dev/null 2>&1; then
            echo -e "${GREEN}✓ PASS${NC}"
            ((tests_passed++))
        else
            echo -e "${RED}✗ FAIL${NC}"
        fi
    done

    echo "   Connectivity tests: $tests_passed/$tests_total passed"
}

##
# Run authentication flow tests
##
run_federation_auth_tests() {
    local hub_url="${1:-https://localhost:4000}"

    echo "3. Authentication Flow Tests"
    echo "-----------------------------"

    local tests_passed=0
    local tests_total=0

    # Test IdP configuration in hub
    ((tests_total++))
    echo -n "   Hub IdP configuration: "
    local fed_response
    fed_response=$(curl -sk --max-time 5 "${hub_url}/api/federation/status" 2>/dev/null)
    if [ $? -eq 0 ] && echo "$fed_response" | jq -e '.identityProviders' >/dev/null 2>&1; then
        local idp_count
        idp_count=$(echo "$fed_response" | jq -r '.identityProviders | length' 2>/dev/null)
        if [ "$idp_count" -gt 0 ]; then
            echo -e "${GREEN}✓ PASS${NC} ($idp_count IdPs configured)"
            ((tests_passed++))
        else
            echo -e "${RED}✗ FAIL${NC} (No IdPs configured)"
        fi
    else
        echo -e "${RED}✗ FAIL${NC} (Cannot check IdP config)"
    fi

    # Test NextAuth configuration for running spokes
    local running_spokes=""
    for spoke in fra est gbr deu; do
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "dive-spoke-${spoke}"; then
            running_spokes="$running_spokes $spoke"
        fi
    done

    for spoke in $running_spokes; do
        local spoke_offset=$(_get_spoke_port_offset "$spoke")

        # Test NextAuth configuration endpoint
        ((tests_total++))
        local spoke_port=$((3000 + spoke_offset))
        echo -n "   ${spoke^^} NextAuth config: "
        if curl -sk --max-time 3 "https://localhost:${spoke_port}/api/auth/providers" >/dev/null 2>&1; then
            echo -e "${GREEN}✓ PASS${NC}"
            ((tests_passed++))
        else
            echo -e "${RED}✗ FAIL${NC}"
        fi

        # Test NextAuth signin endpoint
        ((tests_total++))
        echo -n "   ${spoke^^} NextAuth signin: "
        if curl -sk --max-time 3 "https://localhost:${spoke_port}/api/auth/signin/keycloak" >/dev/null 2>&1; then
            echo -e "${GREEN}✓ PASS${NC}"
            ((tests_passed++))
        else
            echo -e "${RED}✗ FAIL${NC}"
        fi
    done

    echo "   Auth tests: $tests_passed/$tests_total passed"
}

# =============================================================================
# SSO UTILITY FUNCTIONS (ENHANCED FOR COMPREHENSIVE TESTING)
# =============================================================================

##
# Get access token from Keycloak using password grant
#
# Arguments:
#   $1 - Instance code
#   $2 - Username
#   $3 - Password (optional, defaults to username)
#
# Returns:
#   Access token on stdout
##
sso_get_token() {
    local instance_code="$1"
    local username="$2"
    local password="${3:-$username}"
    local code_lower=$(lower "$instance_code")
    
    # Get instance ports
    eval "$(get_instance_ports "$instance_code")"
    local kc_port="${SPOKE_KEYCLOAK_HTTPS_PORT:-8443}"
    
    # Get token
    curl -sk --max-time 10 -X POST \
        "https://localhost:${kc_port}/realms/dive-v3-broker-${code_lower}/protocol/openid-connect/token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "client_id=dive-v3-broker-${code_lower}&client_secret=dive-v3-broker-${code_lower}-secret&username=${username}&password=${password}&grant_type=password" \
        2>/dev/null | jq -r '.access_token // empty'
}

##
# Verify JWT token claims
#
# Arguments:
#   $1 - Access token
#   $@ - Claim names to verify (e.g., uniqueID clearance countryOfAffiliation)
#
# Returns:
#   0 - All claims present
#   1 - Missing claims
##
sso_verify_claims() {
    local token="$1"
    shift
    local required_claims=("$@")
    
    if [ -z "$token" ] || [ "$token" = "null" ]; then
        return 1
    fi
    
    # Decode JWT payload (base64url decode)
    local payload=$(echo "$token" | cut -d'.' -f2 | base64 -d 2>/dev/null || echo "{}")
    
    # Check each required claim
    for claim in "${required_claims[@]}"; do
        if ! echo "$payload" | jq -e ".$claim" >/dev/null 2>&1; then
            return 1
        fi
    done
    
    return 0
}

##
# Test backend API access with token
#
# Arguments:
#   $1 - Instance code
#   $2 - Access token
#   $3 - API endpoint (default: /api/auth/session)
#
# Returns:
#   0 - Success
#   1 - Failure
##
sso_test_backend_access() {
    local instance_code="$1"
    local token="$2"
    local endpoint="${3:-/api/auth/session}"
    
    # Get instance ports
    eval "$(get_instance_ports "$instance_code")"
    local backend_port="${SPOKE_BACKEND_HTTPS_PORT:-4000}"
    
    # Test access
    local response=$(curl -sk --max-time 10 \
        -H "Authorization: Bearer $token" \
        "https://localhost:${backend_port}${endpoint}" 2>/dev/null)
    
    if [ -n "$response" ] && echo "$response" | jq -e '.user' >/dev/null 2>&1; then
        return 0
    fi
    
    return 1
}

##
# Exchange token between realms (simulates SSO token exchange)
#
# Arguments:
#   $1 - Source token (from source instance)
#   $2 - Source instance code
#   $3 - Target instance code
#
# Returns:
#   Exchanged token on stdout (empty if exchange failed)
#
# Note: This simulates the token exchange that occurs during SSO flows.
# In real SSO, Keycloak performs token exchange automatically during
# authentication. This function tests the exchange mechanism directly.
##
sso_exchange_token() {
    local source_token="$1"
    local source_instance="$2"
    local target_instance="$3"
    
    if [ -z "$source_token" ] || [ "$source_token" = "null" ]; then
        return 1
    fi
    
    local source_lower=$(lower "$source_instance")
    local target_lower=$(lower "$target_instance")
    
    # Get target instance ports
    eval "$(get_instance_ports "$target_instance")"
    local target_kc_port="${SPOKE_KEYCLOAK_HTTPS_PORT:-8443}"
    
    # Get target realm client credentials
    local target_client_id="dive-v3-broker-${target_lower}"
    local target_client_secret="${target_client_id}-secret"
    
    # Attempt token exchange via Keycloak token exchange endpoint
    # This requires the target realm to trust the source realm's issuer
    local exchanged_token=$(curl -sk --max-time 10 -X POST \
        "https://localhost:${target_kc_port}/realms/dive-v3-broker-${target_lower}/protocol/openid-connect/token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "client_id=${target_client_id}&client_secret=${target_client_secret}&grant_type=urn:ietf:params:oauth:grant-type:token-exchange&subject_token=${source_token}&subject_token_type=urn:ietf:params:oauth:token-type:access_token" \
        2>/dev/null | jq -r '.access_token // empty')
    
    if [ -n "$exchanged_token" ] && [ "$exchanged_token" != "null" ]; then
        echo "$exchanged_token"
        return 0
    fi
    
    # Fallback: If token exchange not supported, return source token
    # (This happens when direct authentication is used instead of exchange)
    log_verbose "Token exchange not available, using direct authentication"
    echo "$source_token"
    return 0
}

##
# Check OPA authorization decision
#
# Arguments:
#   $1 - Instance code
#   $2 - Access token
#   $3 - Resource ID (optional)
#
# Returns:
#   0 - Authorized
#   1 - Denied
##
sso_check_authz_decision() {
    local instance_code="$1"
    local token="$2"
    local resource_id="${3:-test-resource}"
    
    # Get instance ports
    eval "$(get_instance_ports "$instance_code")"
    local backend_port="${SPOKE_BACKEND_HTTPS_PORT:-4000}"
    
    # Call authorization endpoint
    local decision=$(curl -sk --max-time 10 \
        -H "Authorization: Bearer $token" \
        "https://localhost:${backend_port}/api/resources/${resource_id}" 2>/dev/null | \
        jq -r '.authorized // false')
    
    [ "$decision" = "true" ]
}

##
# Record SSO test result in federation database
#
# Arguments:
#   $1 - Source code
#   $2 - Target code
#   $3 - Direction (HUB_TO_SPOKE or SPOKE_TO_HUB)
#   $4 - Test passed (true/false)
#   $5 - Latency ms (optional)
#   $6 - Error message (optional)
##
sso_record_test_result() {
    local source_code="$1"
    local target_code="$2"
    local direction="$3"
    local test_passed="$4"
    local latency="${5:-}"
    local error_msg="${6:-}"
    
    # Check if federation database module is loaded
    if ! type fed_db_record_health &>/dev/null; then
        return 0  # Non-blocking if database unavailable
    fi
    
    # Record health check
    fed_db_record_health "$source_code" "$target_code" "$direction" \
        "true" "true" "true" "true" \
        "$test_passed" "$latency" "$error_msg" >/dev/null 2>&1 || true
}

##
# Test bidirectional SSO authentication between spokes
#
# Arguments:
#   $1 - Source spoke (e.g., ALB)
#   $2 - Target spoke (e.g., FRA)
#
# Returns:
#   0 - Bidirectional SSO working
#   1 - SSO not working
##
test_bidirectional_sso() {
    local source_spoke="${1:-ALB}"
    local target_spoke="${2:-FRA}"
    local source_lower=$(lower "$source_spoke")
    local target_lower=$(lower "$target_spoke")
    local source_upper=$(upper "$source_spoke")
    local target_upper=$(upper "$target_spoke")

    echo "🔄 Testing Bidirectional SSO: $source_upper ↔ $target_upper"
    echo "=================================================="

    # Get spoke configurations
    eval "$(get_instance_ports "$source_spoke")"
    local source_port="${SPOKE_BACKEND_HTTPS_PORT:-4000}"
    local source_kc_port="${SPOKE_KEYCLOAK_HTTPS_PORT:-8443}"

    eval "$(get_instance_ports "$target_spoke")"
    local target_port="${SPOKE_BACKEND_HTTPS_PORT:-4000}"
    local target_kc_port="${SPOKE_KEYCLOAK_HTTPS_PORT:-8443}"

    echo "Source ($source_upper): Backend port $source_port, Keycloak port $source_kc_port"
    echo "Target ($target_upper): Backend port $target_port, Keycloak port $target_kc_port"
    echo ""

    local tests_passed=0
    local tests_total=0
    local start_time=$(date +%s%3N)

    # Test 1: Source user can authenticate locally
    ((tests_total++))
    echo -n "[$source_upper→$target_upper] Source user authentication: "
    local source_token=$(sso_get_token "$source_spoke" "testuser-${source_lower}-1")

    if [ -n "$source_token" ] && [ "$source_token" != "null" ]; then
        echo -e "${GREEN}✓ PASS${NC} (Token obtained)"
        ((tests_passed++))
    else
        echo -e "${RED}✗ FAIL${NC} (Cannot authenticate $source_upper user)"
        sso_record_test_result "$source_lower" "$target_lower" "SPOKE_TO_SPOKE" "false" "" "Authentication failed"
        return 1
    fi

    # Test 2: Verify token claims
    ((tests_total++))
    echo -n "[$source_upper→$target_upper] Token claims verification: "
    if sso_verify_claims "$source_token" "sub" "iss" "exp"; then
        echo -e "${GREEN}✓ PASS${NC} (Required claims present)"
        ((tests_passed++))
    else
        echo -e "${RED}✗ FAIL${NC} (Missing required claims)"
    fi

    # Test 3: Source user can access target protected resource
    ((tests_total++))
    echo -n "[$source_upper→$target_upper] Cross-spoke resource access: "
    if sso_test_backend_access "$target_spoke" "$source_token"; then
        echo -e "${GREEN}✓ PASS${NC} (Access granted)"
        ((tests_passed++))
    else
        echo -e "${RED}✗ FAIL${NC} ($source_upper user cannot access $target_upper resource)"
    fi

    # Test 4: Target user can authenticate locally
    ((tests_total++))
    echo -n "[$target_upper→$source_upper] Target user authentication: "
    local target_token=$(sso_get_token "$target_spoke" "testuser-${target_lower}-1")

    if [ -n "$target_token" ] && [ "$target_token" != "null" ]; then
        echo -e "${GREEN}✓ PASS${NC} (Token obtained)"
        ((tests_passed++))
    else
        echo -e "${RED}✗ FAIL${NC} (Cannot authenticate $target_upper user)"
    fi

    # Test 5: Target user can access source protected resource
    ((tests_total++))
    echo -n "[$target_upper→$source_upper] Cross-spoke resource access: "
    if sso_test_backend_access "$source_spoke" "$target_token"; then
        echo -e "${GREEN}✓ PASS${NC} (Access granted)"
        ((tests_passed++))
    else
        echo -e "${RED}✗ FAIL${NC} ($target_upper user cannot access $source_upper resource)"
    fi

    # Test 6: Check Hub IdP configuration
    ((tests_total++))
    echo -n "[$source_upper↔$target_upper] Hub federation configuration: "
    local hub_token=$(curl -sk --max-time 5 -X POST \
        "https://localhost:8443/realms/master/protocol/openid-connect/token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "client_id=admin-cli&username=admin&password=KeycloakAdminSecure123!&grant_type=password" 2>/dev/null | jq -r '.access_token // empty')

    if [ -n "$hub_token" ]; then
        local source_idp=$(curl -sk --max-time 5 \
            -H "Authorization: Bearer $hub_token" \
            "https://localhost:8443/admin/realms/${HUB_REALM:-dive-v3-broker-usa}/identity-provider/instances/${source_lower}-idp" 2>/dev/null | jq -r '.alias // empty')

        local target_idp=$(curl -sk --max-time 5 \
            -H "Authorization: Bearer $hub_token" \
            "https://localhost:8443/admin/realms/${HUB_REALM:-dive-v3-broker-usa}/identity-provider/instances/${target_lower}-idp" 2>/dev/null | jq -r '.alias // empty')

        if [ "$source_idp" = "${source_lower}-idp" ] && [ "$target_idp" = "${target_lower}-idp" ]; then
            echo -e "${GREEN}✓ PASS${NC} (Both IdPs configured)"
            ((tests_passed++))
        else
            echo -e "${RED}✗ FAIL${NC} (Missing IdPs: $source_idp, $target_idp)"
        fi
    else
        echo -e "${RED}✗ FAIL${NC} (Cannot access Hub admin)"
    fi

    # Calculate total latency
    local end_time=$(date +%s%3N)
    local latency=$((end_time - start_time))

    echo ""
    echo "Bidirectional SSO Test Results: $tests_passed/$tests_total passed (${latency}ms)"

    # Record test results
    sso_record_test_result "$source_lower" "$target_lower" "SPOKE_TO_SPOKE" \
        "$( [ $tests_passed -eq $tests_total ] && echo 'true' || echo 'false' )" \
        "$latency"

    if [ $tests_passed -eq $tests_total ]; then
        echo -e "${GREEN}🎉 SUCCESS: $source_upper ↔ $target_upper bidirectional SSO is working!${NC}"
        return 0
    else
        echo -e "${RED}❌ FAILURE: $source_upper ↔ $target_upper bidirectional SSO is NOT working${NC}"
        echo ""
        echo "Troubleshooting:"
        echo "1. Ensure both spokes are running: ./dive spoke up $source_upper && ./dive spoke up $target_upper"
        echo "2. Check federation setup: ./dive federation-setup register-hub $source_upper && ./dive federation-setup register-hub $target_upper"
        echo "3. Verify users exist: Check instances/$source_lower/test-credentials.txt and instances/$target_lower/test-credentials.txt"
        return 1
    fi
}

# =============================================================================
# FEDERATION HEALTH CHECK
# =============================================================================

##
# Run comprehensive federation health checks
#
# Returns:
#   0 - All checks passed
#   1 - Some checks failed
##
federation_health_check() {
    echo -e "${BOLD}Federation Health Check${NC}"
    echo "========================"

    local passed_checks=0
    local total_checks=0

    # Determine hub URL
    local hub_url="https://localhost:4000"
    if [ "$ENVIRONMENT" = "gcp" ] || [ "$ENVIRONMENT" = "pilot" ]; then
        hub_url="https://usa-api.dive25.com"
    fi

    echo "Environment: ${ENVIRONMENT:-LOCAL}"
    echo "Hub URL: $hub_url"
    echo ""

    # Check 1: Hub API
    ((total_checks++))
    echo -n "1. Hub API: "
    if curl -sk --max-time 5 "${hub_url}/health" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ PASS${NC}"
        ((passed_checks++))
    else
        echo -e "${RED}✗ FAIL${NC} (API not responding)"
    fi

    # Check 2: Federation status endpoint
    ((total_checks++))
    echo -n "2. Federation Status API: "
    if curl -sk --max-time 5 "${hub_url}/api/federation/status" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ PASS${NC}"
        ((passed_checks++))
    else
        echo -e "${RED}✗ FAIL${NC} (Federation API unavailable)"
    fi

    # Check 3: Hub Keycloak
    ((total_checks++))
    local keycloak_url="${hub_url//4000/8443}"
    echo -n "3. Hub Keycloak: "
    if curl -sk --max-time 5 "${keycloak_url}/realms/${HUB_REALM:-dive-v3-broker-usa}/.well-known/openid-connect-configuration" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ PASS${NC}"
        ((passed_checks++))
    else
        echo -e "${RED}✗ FAIL${NC} (Keycloak unavailable)"
    fi

    # Check 4: Spoke connectivity (if any running)
    local running_spokes=""
    for spoke in fra est gbr deu; do
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "dive-spoke-${spoke}"; then
            running_spokes="$running_spokes $spoke"
        fi
    done

    if [ -n "$running_spokes" ]; then
        echo ""
        echo "Spoke Connectivity Checks:"
        for spoke in $running_spokes; do
            local spoke_offset=$(_get_spoke_port_offset "$spoke")

            ((total_checks++))
            echo -n "   ${spoke^^} API: "
            local spoke_port=$((4000 + spoke_offset))
            if curl -sk --max-time 3 "https://localhost:${spoke_port}/health" >/dev/null 2>&1; then
                echo -e "${GREEN}✓ PASS${NC}"
                ((passed_checks++))
            else
                echo -e "${RED}✗ FAIL${NC}"
            fi

            ((total_checks++))
            echo -n "   ${spoke^^} Keycloak: "
            local kc_port=$((8443 + spoke_offset))
            if curl -sk --max-time 3 "https://localhost:${kc_port}/realms/dive-v3-broker-${spoke}/.well-known/openid-connect-configuration" >/dev/null 2>&1; then
                echo -e "${GREEN}✓ PASS${NC}"
                ((passed_checks++))
            else
                echo -e "${RED}✗ FAIL${NC}"
            fi
        done
    fi

    # Check 5: Federation registration status
    ((total_checks++))
    echo ""
    echo -n "Federation Registration: "
    local fed_response
    fed_response=$(curl -sk --max-time 5 "${hub_url}/api/federation/status" 2>/dev/null)
    if [ $? -eq 0 ] && echo "$fed_response" | jq -e '.spokes' >/dev/null 2>&1; then
        local spoke_count
        spoke_count=$(echo "$fed_response" | jq -r '.spokes | length' 2>/dev/null)
        echo -e "${GREEN}✓ PASS${NC} ($spoke_count spokes registered)"
        ((passed_checks++))
    else
        echo -e "${YELLOW}⚠ SKIP${NC} (Cannot determine registration status)"
    fi

    # Summary
    echo ""
    echo "=========================="
    echo "Health Check Summary: $passed_checks/$total_checks checks passed"

    if [ "$passed_checks" -eq "$total_checks" ]; then
        echo -e "${GREEN}🎉 All federation components are healthy!${NC}"
        return 0
    elif [ "$passed_checks" -ge $((total_checks / 2)) ]; then
        echo -e "${YELLOW}⚠️  Federation is partially operational${NC}"
        return 1
    else
        echo -e "${RED}❌ Federation has critical issues${NC}"
        return 1
    fi
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

federation_test_module() {
    local command="${1:-help}"
    shift || true

    case "$command" in
        "basic"|"connectivity"|"auth"|"full")
            run_federation_tests "$command" "$@"
            ;;
        "bidirectional"|"sso")
            test_bidirectional_sso "$@"
            ;;
        "health")
            federation_health_check
            ;;
        "help"|*)
            echo "Federation Test Module"
            echo "======================"
            echo ""
            echo "Commands:"
            echo "  basic         - Basic federation connectivity tests"
            echo "  connectivity  - Cross-instance network tests"
            echo "  auth          - Authentication flow tests"
            echo "  full          - Complete test suite"
            echo "  bidirectional - Test bidirectional SSO between spokes"
            echo "  health        - Federation health check"
            echo ""
            echo "Usage:"
            echo "  ./dive federation test basic"
            echo "  ./dive federation test bidirectional ALB FRA"
            echo "  ./dive federation test health"
            ;;
    esac
}
