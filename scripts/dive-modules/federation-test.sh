#!/usr/local/bin/bash
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
if [ -z "$DIVE_COMMON_LOADED" ]; then
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
    eval "$(_get_spoke_ports "$source_spoke")"
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

    # Test 1: Source user can authenticate locally
    ((tests_total++))
    echo -n "[$source_upper→$target_upper] Source user authentication: "
    local source_token=$(curl -sk --max-time 5 -X POST \
        "https://localhost:${source_kc_port}/realms/dive-v3-broker-${source_lower}/protocol/openid-connect/token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "client_id=dive-v3-broker-${source_lower}&client_secret=dive-v3-broker-${source_lower}-secret&username=testuser-${source_lower}-1&password=testuser-${source_lower}-1&grant_type=password" 2>/dev/null | jq -r '.access_token // empty')

    if [ -n "$source_token" ] && [ "$source_token" != "null" ]; then
        echo -e "${GREEN}✓ PASS${NC} (Token obtained)"
        ((tests_passed++))
    else
        echo -e "${RED}✗ FAIL${NC} (Cannot authenticate $source_upper user)"
        return 1
    fi

    # Test 2: Source user can access target protected resource
    ((tests_total++))
    echo -n "[$source_upper→$target_upper] Cross-spoke resource access: "
    local cross_access=$(curl -sk --max-time 5 \
        -H "Authorization: Bearer $source_token" \
        "https://localhost:${target_port}/api/auth/session" 2>/dev/null | jq -r '.user.name // empty')

    if [ -n "$cross_access" ] && [ "$cross_access" != "null" ]; then
        echo -e "${GREEN}✓ PASS${NC} (User: $cross_access)"
        ((tests_passed++))
    else
        echo -e "${RED}✗ FAIL${NC} ($source_upper user cannot access $target_upper resource)"
    fi

    # Test 3: Target user can authenticate locally
    ((tests_total++))
    echo -n "[$target_upper→$source_upper] Target user authentication: "
    local target_token=$(curl -sk --max-time 5 -X POST \
        "https://localhost:${target_kc_port}/realms/dive-v3-broker-${target_lower}/protocol/openid-connect/token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "client_id=dive-v3-broker-${target_lower}&client_secret=dive-v3-broker-${target_lower}-secret&username=testuser-${target_lower}-1&password=testuser-${target_lower}-1&grant_type=password" 2>/dev/null | jq -r '.access_token // empty')

    if [ -n "$target_token" ] && [ "$target_token" != "null" ]; then
        echo -e "${GREEN}✓ PASS${NC} (Token obtained)"
        ((tests_passed++))
    else
        echo -e "${RED}✗ FAIL${NC} (Cannot authenticate $target_upper user)"
    fi

    # Test 4: Target user can access source protected resource
    ((tests_total++))
    echo -n "[$target_upper→$source_upper] Cross-spoke resource access: "
    local reverse_access=$(curl -sk --max-time 5 \
        -H "Authorization: Bearer $target_token" \
        "https://localhost:${source_port}/api/auth/session" 2>/dev/null | jq -r '.user.name // empty')

    if [ -n "$reverse_access" ] && [ "$reverse_access" != "null" ]; then
        echo -e "${GREEN}✓ PASS${NC} (User: $reverse_access)"
        ((tests_passed++))
    else
        echo -e "${RED}✗ FAIL${NC} ($target_upper user cannot access $source_upper resource)"
    fi

    # Test 5: Check Hub IdP configuration
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

    echo ""
    echo "Bidirectional SSO Test Results: $tests_passed/$tests_total passed"

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
