#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - SSOT Compliance Integration Test
# =============================================================================
# Validates that all modules use the centralized SSOT functions correctly
# Tests:
# - All modules call get_instance_ports() instead of duplicating logic
# - All modules use get_hub_admin_token() / get_spoke_admin_token()
# - No hardcoded port values remain
# - Hub verify has 10 checks
# =============================================================================

DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "${DIVE_ROOT}/scripts/dive-modules/common.sh"

# Colors
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
# TEST: No Hardcoded Port Values
# =============================================================================

test_no_hardcoded_ports() {
    echo ""
    echo -e "${BOLD}${CYAN}Test: No Hardcoded Ports in Modules${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    local modules_dir="${DIVE_ROOT}/scripts/dive-modules"
    local violations=()

    # Search for hardcoded port patterns (excluding comments and get_instance_ports itself)
    # Pattern: keycloak_port=8453 or similar
    local hardcoded_patterns=(
        'keycloak_port=84[0-9][0-9]'
        'backend_port=40[0-9][0-9]'
        'frontend_port=30[0-9][0-9]'
        'kc_port=84[0-9][0-9]'
    )

    for pattern in "${hardcoded_patterns[@]}"; do
        while IFS= read -r match; do
            # Skip lines in get_instance_ports (the SSOT itself)
            if echo "$match" | grep -q "get_instance_ports\|# Port ranges\|Test"; then
                continue
            fi
            violations+=("$match")
        done < <(grep -rn "$pattern" "$modules_dir" 2>/dev/null | grep -v "^#" || true)
    done

    ((TESTS_TOTAL++))
    if [ ${#violations[@]} -eq 0 ]; then
        echo -e "  ${GREEN}✓${NC} No hardcoded ports found in modules"
        ((TESTS_PASSED++))
    else
        echo -e "  ${RED}✗${NC} Found ${#violations[@]} hardcoded port violations:"
        for violation in "${violations[@]}"; do
            echo "    - $violation"
        done
        ((TESTS_FAILED++))
    fi
}

# =============================================================================
# TEST: All Modules Use get_instance_ports
# =============================================================================

test_modules_use_ssot() {
    echo ""
    echo -e "${BOLD}${CYAN}Test: Modules Use SSOT Functions${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    local modules=(
        "spoke.sh"
        "federation/setup.sh"
        "spoke-kas.sh"
        "federation-test.sh"
    )

    for module in "${modules[@]}"; do
        ((TESTS_TOTAL++))

        local file="${DIVE_ROOT}/scripts/dive-modules/${module}"

        if grep -q "get_instance_ports" "$file"; then
            echo -e "  ${GREEN}✓${NC} ${module} uses get_instance_ports()"
            ((TESTS_PASSED++))
        else
            echo -e "  ${RED}✗${NC} ${module} does NOT use get_instance_ports()"
            ((TESTS_FAILED++))
        fi
    done
}

# =============================================================================
# TEST: Hub Verify Has 10 Checks
# =============================================================================

test_hub_verify_checks() {
    echo ""
    echo -e "${BOLD}${CYAN}Test: Hub Verify Has 10 Checks${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    local hub_file="${DIVE_ROOT}/scripts/dive-modules/hub.sh"

    # Count printf statements in hub_verify function (each check has a printf)
    local check_count=$(sed -n '/^hub_verify()/,/^}/p' "$hub_file" | grep -c 'printf.*"%-.*s"' || echo "0")

    ((TESTS_TOTAL++))
    if [ "$check_count" -eq 10 ]; then
        echo -e "  ${GREEN}✓${NC} Hub verify has 10 checks (found $check_count)"
        ((TESTS_PASSED++))
    else
        echo -e "  ${RED}✗${NC} Hub verify should have 10 checks (found $check_count)"
        ((TESTS_FAILED++))
    fi

    # Verify hub_verify doesn't just call status
    ((TESTS_TOTAL++))
    if grep -A5 "^hub_verify()" "$hub_file" | grep -q "./dive hub status"; then
        echo -e "  ${RED}✗${NC} Hub verify still calls './dive hub status' (should have detailed checks)"
        ((TESTS_FAILED++))
    else
        echo -e "  ${GREEN}✓${NC} Hub verify has independent implementation (doesn't just wrap status)"
        ((TESTS_PASSED++))
    fi
}

# =============================================================================
# TEST: No Stub Commands Remain
# =============================================================================

test_no_stubs() {
    echo ""
    echo -e "${BOLD}${CYAN}Test: No Stub Commands${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    local fed_file="${DIVE_ROOT}/scripts/dive-modules/federation.sh"

    # Check that stub functions are gone
    local stubs=("federation_sync_policies" "federation_sync_idps" "federation_push_audit")

    for stub in "${stubs[@]}"; do
        ((TESTS_TOTAL++))

        if grep -q "^${stub}()" "$fed_file"; then
            echo -e "  ${RED}✗${NC} Stub function still exists: ${stub}()"
            ((TESTS_FAILED++))
        else
            echo -e "  ${GREEN}✓${NC} Stub function removed: ${stub}()"
            ((TESTS_PASSED++))
        fi
    done

    # Check dispatch has helpful messages instead
    ((TESTS_TOTAL++))
    if grep -q "Command.*has been removed" "$fed_file"; then
        echo -e "  ${GREEN}✓${NC} Dispatch has helpful error messages for removed commands"
        ((TESTS_PASSED++))
    else
        echo -e "  ${YELLOW}⚠${NC} Dispatch may not have helpful messages"
    fi
}

# =============================================================================
# TEST: Admin Token Functions Have Retry Logic
# =============================================================================

test_admin_token_retry() {
    echo ""
    echo -e "${BOLD}${CYAN}Test: Admin Token Functions Have Retry${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    local fed_setup="${DIVE_ROOT}/scripts/dive-modules/federation/setup.sh"

    # Check get_hub_admin_token has retry
    ((TESTS_TOTAL++))
    if sed -n '/^get_hub_admin_token()/,/^}/p' "$fed_setup" | grep -q "max_attempts=15"; then
        echo -e "  ${GREEN}✓${NC} get_hub_admin_token() has 15-retry logic"
        ((TESTS_PASSED++))
    else
        echo -e "  ${RED}✗${NC} get_hub_admin_token() missing 15-retry logic"
        ((TESTS_FAILED++))
    fi

    # Check get_spoke_admin_token has retry
    ((TESTS_TOTAL++))
    if sed -n '/^get_spoke_admin_token()/,/^}/p' "$fed_setup" | grep -q "max_attempts=15"; then
        echo -e "  ${GREEN}✓${NC} get_spoke_admin_token() has 15-retry logic"
        ((TESTS_PASSED++))
    else
        echo -e "  ${RED}✗${NC} get_spoke_admin_token() missing 15-retry logic"
        ((TESTS_FAILED++))
    fi

    # Check password quality validation
    ((TESTS_TOTAL++))
    if sed -n '/^get_hub_admin_token()/,/^}/p' "$fed_setup" | grep -q "admin|password|KeycloakAdmin"; then
        echo -e "  ${GREEN}✓${NC} get_hub_admin_token() validates password quality"
        ((TESTS_PASSED++))
    else
        echo -e "  ${YELLOW}⚠${NC} get_hub_admin_token() may not validate password quality"
    fi
}

# =============================================================================
# RUN ALL TESTS
# =============================================================================

main() {
    echo ""
    echo -e "${BOLD}╔════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║            DIVE V3 - SSOT Compliance Integration Test Suite           ║${NC}"
    echo -e "${BOLD}╚════════════════════════════════════════════════════════════════════════╝${NC}"

    # Run test suites
    test_no_hardcoded_ports
    test_modules_use_ssot
    test_hub_verify_checks
    test_no_stubs
    test_admin_token_retry

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
        echo -e "${GREEN}${BOLD}✓ ALL SSOT COMPLIANCE TESTS PASSED!${NC}"
        echo -e "${GREEN}  DIVE CLI is following SSOT best practices.${NC}"
        echo ""
        return 0
    else
        echo -e "${RED}${BOLD}✗ SOME TESTS FAILED${NC}"
        echo -e "${RED}  SSOT violations detected - review output above.${NC}"
        echo ""
        return 1
    fi
}

# Run tests
main
exit $?
