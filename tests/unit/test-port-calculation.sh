#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Port Calculation SSOT Test Suite
# =============================================================================
# Tests the consolidated get_instance_ports() function in common.sh
# Verifies:
# - All 32 NATO countries have unique, conflict-free ports
# - Partner nations use offsets 32-39
# - Unknown countries use hash-based offsets (48+)
# - Port ranges are within expected bounds
# =============================================================================

# Source common functions
DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "${DIVE_ROOT}/scripts/dive-modules/common.sh"
source "${DIVE_ROOT}/scripts/nato-countries.sh"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Test counters
TESTS_TOTAL=0
TESTS_PASSED=0
TESTS_FAILED=0

# Track used ports for conflict detection
declare -A USED_FRONTEND_PORTS
declare -A USED_BACKEND_PORTS
declare -A USED_KEYCLOAK_PORTS

# =============================================================================
# TEST UTILITIES
# =============================================================================

test_assert() {
    local condition="$1"
    local message="$2"

    ((TESTS_TOTAL++))

    if eval "$condition"; then
        echo -e "  ${GREEN}✓${NC} $message"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "  ${RED}✗${NC} $message"
        ((TESTS_FAILED++))
        return 1
    fi
}

test_assert_eq() {
    local actual="$1"
    local expected="$2"
    local message="$3"

    test_assert '[ "$actual" = "$expected" ]' "$message (expected: $expected, got: $actual)"
}

test_assert_in_range() {
    local value="$1"
    local min="$2"
    local max="$3"
    local message="$4"

    test_assert '[ "$value" -ge "$min" ] && [ "$value" -le "$max" ]' \
        "$message (value: $value, range: $min-$max)"
}

test_assert_unique_port() {
    local code="$1"
    local port="$2"
    local port_type="$3"
    local array_name="$4"

    # Check if port already used
    local existing
    eval "existing=\${${array_name}[${port}]}"

    if [ -z "$existing" ]; then
        # Port not used - record it
        eval "${array_name}[${port}]=\"${code}\""
        echo -e "  ${GREEN}✓${NC} ${code} ${port_type}: ${port} (unique)"
        ((TESTS_PASSED++))
        ((TESTS_TOTAL++))
        return 0
    else
        echo -e "  ${RED}✗${NC} ${code} ${port_type}: ${port} CONFLICT with ${existing}"
        ((TESTS_FAILED++))
        ((TESTS_TOTAL++))
        return 1
    fi
}

# =============================================================================
# TEST SUITE 1: ALL 32 NATO COUNTRIES
# =============================================================================

test_nato_countries() {
    echo ""
    echo -e "${BOLD}${CYAN}Test Suite 1: All 32 NATO Countries${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Note: AUT (Austria) and CHE (Switzerland) are NOT NATO members (they're neutral)
    # 32 NATO members as of 2024 (with Finland and Sweden, soon Ukraine)
    # Croatia is HRV (not CRO), Iceland is ISL, Luxembourg is LUX
    local nato_codes=(USA GBR FRA DEU CAN ITA ESP NLD BEL DNK NOR SWE POL ROU CZE HUN SVN HRV BGR GRC PRT FIN EST LVA LTU SVK ALB MNE MKD TUR ISL LUX)

    for code in "${nato_codes[@]}"; do
        echo -e "${BOLD}Testing ${code}:${NC}"

        # Get ports using SSOT function
        eval "$(get_instance_ports "$code")"

        # Test 1: Port offset is valid
        test_assert_in_range "$SPOKE_PORT_OFFSET" 0 31 "  Port offset in NATO range (0-31)"

        # Test 2: Frontend port uniqueness
        test_assert_unique_port "$code" "$SPOKE_FRONTEND_PORT" "Frontend" "USED_FRONTEND_PORTS"

        # Test 3: Backend port uniqueness
        test_assert_unique_port "$code" "$SPOKE_BACKEND_PORT" "Backend" "USED_BACKEND_PORTS"

        # Test 4: Keycloak port uniqueness
        test_assert_unique_port "$code" "$SPOKE_KEYCLOAK_HTTPS_PORT" "Keycloak" "USED_KEYCLOAK_PORTS"

        # Test 5: Frontend in valid range
        test_assert_in_range "$SPOKE_FRONTEND_PORT" 3000 3099 "  Frontend port range"

        # Test 6: Backend in valid range
        test_assert_in_range "$SPOKE_BACKEND_PORT" 4000 4099 "  Backend port range"

        # Test 7: Keycloak in valid range
        test_assert_in_range "$SPOKE_KEYCLOAK_HTTPS_PORT" 8443 8543 "  Keycloak port range"

        # Test 8: KAS port calculated correctly
        local expected_kas=$((9000 + SPOKE_PORT_OFFSET))
        test_assert_eq "$SPOKE_KAS_PORT" "$expected_kas" "  KAS port calculation"

        echo ""
    done
}

# =============================================================================
# TEST SUITE 2: PARTNER NATIONS
# =============================================================================

test_partner_nations() {
    echo ""
    echo -e "${BOLD}${CYAN}Test Suite 2: Partner Nations${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    local partners=(AUS NZL JPN KOR ISR UKR)

    for code in "${partners[@]}"; do
        echo -e "${BOLD}Testing ${code}:${NC}"

        eval "$(get_instance_ports "$code")"

        # Test: Port offset in partner range (32-39)
        test_assert_in_range "$SPOKE_PORT_OFFSET" 32 39 "  Partner nation offset range"

        # Test: No conflicts with NATO countries
        test_assert_unique_port "$code" "$SPOKE_FRONTEND_PORT" "Frontend" "USED_FRONTEND_PORTS"
        test_assert_unique_port "$code" "$SPOKE_BACKEND_PORT" "Backend" "USED_BACKEND_PORTS"
        test_assert_unique_port "$code" "$SPOKE_KEYCLOAK_HTTPS_PORT" "Keycloak" "USED_KEYCLOAK_PORTS"

        echo ""
    done
}

# =============================================================================
# TEST SUITE 3: UNKNOWN COUNTRIES
# =============================================================================

test_unknown_countries() {
    echo ""
    echo -e "${BOLD}${CYAN}Test Suite 3: Unknown Countries (Hash-Based)${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    local unknown=(XXX YYY ZZZ)

    for code in "${unknown[@]}"; do
        echo -e "${BOLD}Testing ${code}:${NC}"

        eval "$(get_instance_ports "$code")"

        # Test: Port offset is >= 48 (hash-based range)
        test_assert '[ "$SPOKE_PORT_OFFSET" -ge 48 ]' "  Hash-based offset >= 48 (got: $SPOKE_PORT_OFFSET)"

        # Test: Ports still in valid ranges
        test_assert_in_range "$SPOKE_FRONTEND_PORT" 3000 3100 "  Frontend port range"
        test_assert_in_range "$SPOKE_BACKEND_PORT" 4000 4100 "  Backend port range"
        test_assert_in_range "$SPOKE_KEYCLOAK_HTTPS_PORT" 8443 8543 "  Keycloak port range"

        echo ""
    done
}

# =============================================================================
# TEST SUITE 4: PORT CALCULATION CONSISTENCY
# =============================================================================

test_port_calculation_consistency() {
    echo ""
    echo -e "${BOLD}${CYAN}Test Suite 4: Port Calculation Consistency${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Test same code multiple times - should get same results
    local test_codes=(FRA POL EST)

    for code in "${test_codes[@]}"; do
        echo -e "${BOLD}Testing ${code} consistency (3 calls):${NC}"

        # Call 1
        eval "$(get_instance_ports "$code")"
        local frontend1=$SPOKE_FRONTEND_PORT
        local backend1=$SPOKE_BACKEND_PORT
        local keycloak1=$SPOKE_KEYCLOAK_HTTPS_PORT

        # Call 2
        eval "$(get_instance_ports "$code")"
        local frontend2=$SPOKE_FRONTEND_PORT
        local backend2=$SPOKE_BACKEND_PORT
        local keycloak2=$SPOKE_KEYCLOAK_HTTPS_PORT

        # Call 3
        eval "$(get_instance_ports "$code")"
        local frontend3=$SPOKE_FRONTEND_PORT
        local backend3=$SPOKE_BACKEND_PORT
        local keycloak3=$SPOKE_KEYCLOAK_HTTPS_PORT

        # Test: All calls return same values
        test_assert_eq "$frontend1" "$frontend2" "  Frontend consistent (call 1 vs 2)"
        test_assert_eq "$frontend2" "$frontend3" "  Frontend consistent (call 2 vs 3)"
        test_assert_eq "$backend1" "$backend2" "  Backend consistent (call 1 vs 2)"
        test_assert_eq "$backend2" "$backend3" "  Backend consistent (call 2 vs 3)"
        test_assert_eq "$keycloak1" "$keycloak2" "  Keycloak consistent (call 1 vs 2)"
        test_assert_eq "$keycloak2" "$keycloak3" "  Keycloak consistent (call 2 vs 3)"

        echo ""
    done
}

# =============================================================================
# TEST SUITE 5: EDGE CASES
# =============================================================================

test_edge_cases() {
    echo ""
    echo -e "${BOLD}${CYAN}Test Suite 5: Edge Cases${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Test lowercase input
    echo -e "${BOLD}Testing lowercase input:${NC}"
    eval "$(get_instance_ports "fra")"
    test_assert '[ "$SPOKE_FRONTEND_PORT" = "3010" ]' "  Lowercase 'fra' → Frontend port 3010"

    # Test mixed case input
    echo -e "${BOLD}Testing mixed case input:${NC}"
    eval "$(get_instance_ports "FrA")"
    test_assert '[ "$SPOKE_FRONTEND_PORT" = "3010" ]' "  Mixed 'FrA' → Frontend port 3010"

    # Test USA (always offset 0)
    echo -e "${BOLD}Testing USA (hub):${NC}"
    eval "$(get_instance_ports "USA")"
    test_assert_eq "$SPOKE_PORT_OFFSET" "0" "  USA port offset is 0"
    test_assert_eq "$SPOKE_FRONTEND_PORT" "3000" "  USA Frontend port"
    test_assert_eq "$SPOKE_BACKEND_PORT" "4000" "  USA Backend port"
    test_assert_eq "$SPOKE_KEYCLOAK_HTTPS_PORT" "8443" "  USA Keycloak port"

    echo ""
}

# =============================================================================
# RUN ALL TESTS
# =============================================================================

main() {
    echo ""
    echo -e "${BOLD}╔════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║              DIVE V3 - Port Calculation SSOT Test Suite                ║${NC}"
    echo -e "${BOLD}╚════════════════════════════════════════════════════════════════════════╝${NC}"

    # Run test suites
    test_nato_countries
    test_partner_nations
    test_unknown_countries
    test_port_calculation_consistency
    test_edge_cases

    # Summary
    echo ""
    echo -e "${BOLD}╔════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║                           TEST SUMMARY                                 ║${NC}"
    echo -e "${BOLD}╚════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "  Total Tests:   $TESTS_TOTAL"
    echo -e "  Passed:        ${GREEN}$TESTS_PASSED${NC}"
    echo -e "  Failed:        ${RED}$TESTS_FAILED${NC}"
    echo ""

    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}${BOLD}✓ ALL TESTS PASSED!${NC}"
        echo -e "${GREEN}  Port calculation SSOT is working correctly.${NC}"
        echo ""
        return 0
    else
        echo -e "${RED}${BOLD}✗ SOME TESTS FAILED${NC}"
        echo -e "${RED}  Port calculation has issues that need fixing.${NC}"
        echo ""
        return 1
    fi
}

# Run tests
main
exit $?
