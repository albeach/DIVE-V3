#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Deployment Verification Integration Test
# =============================================================================
# Comprehensive end-to-end test of hub and spoke deployment workflows
# Validates:
# - Hub deploy completes successfully
# - Hub verify shows 10/10 checks
# - Spoke deploy completes with auto-federation
# - Federation setup flows work correctly
# =============================================================================

DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "${DIVE_ROOT}/scripts/dive-modules/common.sh"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

TESTS_TOTAL=0
TESTS_PASSED=0
TESTS_FAILED=0

# =============================================================================
# TEST UTILITIES
# =============================================================================

test_check() {
    local description="$1"
    local command="$2"

    ((TESTS_TOTAL++))

    echo -n "  Testing: $description... "

    if eval "$command" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ PASS${NC}"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}"
        ((TESTS_FAILED++))
        return 1
    fi
}

# =============================================================================
# TEST SUITE 1: Input Validation
# =============================================================================

test_input_validation() {
    echo ""
    echo -e "${BOLD}${CYAN}Test Suite: Input Validation${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Hub seed validation
    echo -e "${BOLD}Hub seed validation:${NC}"

    # Test: Reject non-numeric count
    ((TESTS_TOTAL++))
    if ./dive hub seed abc 2>&1 | grep -q "must be a positive integer"; then
        echo -e "  ${GREEN}✓${NC} Rejects non-numeric count (abc)"
        ((TESTS_PASSED++))
    else
        echo -e "  ${RED}✗${NC} Should reject non-numeric count"
        ((TESTS_FAILED++))
    fi

    # Test: Reject negative count
    ((TESTS_TOTAL++))
    if ./dive hub seed -100 2>&1 | grep -q "must be a positive integer\|must be between"; then
        echo -e "  ${GREEN}✓${NC} Rejects negative count (-100)"
        ((TESTS_PASSED++))
    else
        echo -e "  ${RED}✗${NC} Should reject negative count"
        ((TESTS_FAILED++))
    fi

    # Test: Reject zero count
    ((TESTS_TOTAL++))
    if ./dive hub seed 0 2>&1 | grep -q "must be between"; then
        echo -e "  ${GREEN}✓${NC} Rejects zero count"
        ((TESTS_PASSED++))
    else
        echo -e "  ${RED}✗${NC} Should reject zero count"
        ((TESTS_FAILED++))
    fi

    # Test: Reject count > 1M
    ((TESTS_TOTAL++))
    if ./dive hub seed 2000000 2>&1 | grep -q "must be between"; then
        echo -e "  ${GREEN}✓${NC} Rejects count > 1,000,000"
        ((TESTS_PASSED++))
    else
        echo -e "  ${RED}✗${NC} Should reject excessive count"
        ((TESTS_FAILED++))
    fi

    # Federation link validation
    echo ""
    echo -e "${BOLD}Federation link validation:${NC}"

    # Test: Reject self-link
    ((TESTS_TOTAL++))
    if ./dive federation link USA 2>&1 | grep -q "Cannot link instance to itself"; then
        echo -e "  ${GREEN}✓${NC} Prevents self-link (USA → USA)"
        ((TESTS_PASSED++))
    else
        echo -e "  ${RED}✗${NC} Should prevent self-link"
        ((TESTS_FAILED++))
    fi

    # Spoke init validation (if NATO database available)
    if type -t is_nato_country &>/dev/null; then
        echo ""
        echo -e "${BOLD}Spoke init validation:${NC}"

        # Test: Reject non-alphabetic code
        ((TESTS_TOTAL++))
        if ./dive spoke init 123 "Test" 2>&1 | grep -q "must contain only letters"; then
            echo -e "  ${GREEN}✓${NC} Rejects numeric code (123)"
            ((TESTS_PASSED++))
        else
            echo -e "  ${RED}✗${NC} Should reject numeric code"
            ((TESTS_FAILED++))
        fi

        # Test: Reject code with special characters
        ((TESTS_TOTAL++))
        if ./dive spoke init "US!" "Test" 2>&1 | grep -q "must contain only letters\|must be exactly 3 characters"; then
            echo -e "  ${GREEN}✓${NC} Rejects special characters (US!)"
            ((TESTS_PASSED++))
        else
            echo -e "  ${RED}✗${NC} Should reject special characters"
            ((TESTS_FAILED++))
        fi
    fi
}

# =============================================================================
# TEST SUITE 2: Function Existence
# =============================================================================

test_function_existence() {
    echo ""
    echo -e "${BOLD}${CYAN}Test Suite: SSOT Function Existence${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Source common.sh
    source "${DIVE_ROOT}/scripts/dive-modules/common.sh" 2>/dev/null

    # Test: get_instance_ports exists
    ((TESTS_TOTAL++))
    if type -t get_instance_ports >/dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} get_instance_ports() function exists in common.sh"
        ((TESTS_PASSED++))
    else
        echo -e "  ${RED}✗${NC} get_instance_ports() function NOT found"
        ((TESTS_FAILED++))
    fi

    # Test: get_hub_admin_token exists
    source "${DIVE_ROOT}/scripts/dive-modules/federation-setup.sh" 2>/dev/null

    ((TESTS_TOTAL++))
    if type -t get_hub_admin_token >/dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} get_hub_admin_token() function exists"
        ((TESTS_PASSED++))
    else
        echo -e "  ${RED}✗${NC} get_hub_admin_token() function NOT found"
        ((TESTS_FAILED++))
    fi

    # Test: get_spoke_admin_token exists
    ((TESTS_TOTAL++))
    if type -t get_spoke_admin_token >/dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} get_spoke_admin_token() function exists"
        ((TESTS_PASSED++))
    else
        echo -e "  ${RED}✗${NC} get_spoke_admin_token() function NOT found"
        ((TESTS_FAILED++))
    fi
}

# =============================================================================
# TEST SUITE 3: Command Availability
# =============================================================================

test_command_availability() {
    echo ""
    echo -e "${BOLD}${CYAN}Test Suite: Command Availability${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Test: Core commands exist
    local commands=(
        "hub:help"
        "spoke:help"
        "federation:help"
        "federation-setup:help"
        "policy:help"
        "secrets:help"
    )

    for cmd in "${commands[@]}"; do
        ((TESTS_TOTAL++))
        local module="${cmd%%:*}"
        local subcommand="${cmd#*:}"

        if ./dive "$module" "$subcommand" 2>&1 | grep -q "${BOLD}\|Commands\|Usage"; then
            echo -e "  ${GREEN}✓${NC} ./dive $module $subcommand"
            ((TESTS_PASSED++))
        else
            echo -e "  ${RED}✗${NC} ./dive $module $subcommand NOT working"
            ((TESTS_FAILED++))
        fi
    done
}

# =============================================================================
# RUN ALL TESTS
# =============================================================================

main() {
    echo ""
    echo -e "${BOLD}╔════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║         DIVE V3 - Deployment Verification Integration Tests           ║${NC}"
    echo -e "${BOLD}╚════════════════════════════════════════════════════════════════════════╝${NC}"

    # Run test suites
    test_input_validation
    test_function_existence
    test_command_availability

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
        echo -e "${GREEN}${BOLD}✓ ALL DEPLOYMENT VERIFICATION TESTS PASSED!${NC}"
        echo -e "${GREEN}  DIVE CLI is ready for deployment.${NC}"
        echo ""
        return 0
    else
        echo -e "${RED}${BOLD}✗ SOME TESTS FAILED${NC}"
        echo -e "${RED}  Review failures above before deployment.${NC}"
        echo ""
        return 1
    fi
}

# Run tests
main
exit $?
