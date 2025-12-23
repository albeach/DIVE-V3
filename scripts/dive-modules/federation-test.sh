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
# PORT OFFSET HELPER
# =============================================================================

##
# Get port offset for a spoke instance (for local development)
##
_get_spoke_port_offset() {
    local spoke="${1:-}"

    # Try NATO countries database first
    if [ -f "${DIVE_ROOT}/scripts/nato-countries.sh" ]; then
        if ! type get_country_offset &>/dev/null; then
            source "${DIVE_ROOT}/scripts/nato-countries.sh"
        fi
        local offset=$(get_country_offset "${spoke^^}" 2>/dev/null)
        if [[ -n "$offset" && "$offset" =~ ^[0-9]+$ ]]; then
            echo "$offset"
            return
        fi
    fi

    # Fallback for known spokes
    case "$spoke" in
        fra) echo 10 ;;
        est) echo 8 ;;
        gbr) echo 2 ;;
        deu) echo 3 ;;
        *) echo 0 ;;
    esac
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
    if curl -sk --max-time 5 "${kc_url}/realms/dive-v3-broker/.well-known/openid-connect-configuration" >/dev/null 2>&1; then
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
    if curl -sk --max-time 5 "${keycloak_url}/realms/dive-v3-broker/.well-known/openid-connect-configuration" >/dev/null 2>&1; then
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

