#!/usr/bin/env bash
# =============================================================================
# Sprint 3: New Commands Integration Test Suite
# =============================================================================
# Tests the 4 new commands added in Sprint 3:
#   1. spoke seed
#   2. spoke list-peers
#   3. federation diagnose
#   4. hub reset
# =============================================================================

DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$DIVE_ROOT" || exit 1

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Test counters
tests_run=0
tests_passed=0
tests_failed=0

# Test functions
pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((tests_passed++))
    ((tests_run++))
}

fail() {
    echo -e "${RED}✗${NC} $1"
    ((tests_failed++))
    ((tests_run++))
}

test_header() {
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
}

# =============================================================================
# TEST 1: spoke seed command
# =============================================================================

test_spoke_seed() {
    test_header "TEST 1: spoke seed command"

    # Test 1.1: Help shows spoke seed
    if ./dive spoke help 2>&1 | grep -q "seed \[count\]"; then
        pass "spoke seed in help text"
    else
        fail "spoke seed not in help text"
    fi

    # Test 1.2: Validation - non-numeric count
    if ./dive --instance test spoke seed abc 2>&1 | grep -q "must be a positive integer"; then
        pass "Rejects non-numeric count"
    else
        fail "Should reject non-numeric count"
    fi

    # Test 1.3: Validation - zero count
    if ./dive --instance test spoke seed 0 2>&1 | grep -q "between 1 and 1,000,000"; then
        pass "Rejects zero count"
    else
        fail "Should reject zero count"
    fi

    # Test 1.4: Validation - negative count
    if ./dive --instance test spoke seed -100 2>&1 | grep -q "must be a positive integer"; then
        pass "Rejects negative count"
    else
        fail "Should reject negative count"
    fi

    # Test 1.5: Validation - too large count
    if ./dive --instance test spoke seed 2000000 2>&1 | grep -q "between 1 and 1,000,000"; then
        pass "Rejects count > 1M"
    else
        fail "Should reject count > 1M"
    fi
}

# =============================================================================
# TEST 2: spoke list-peers command
# =============================================================================

test_spoke_list_peers() {
    test_header "TEST 2: spoke list-peers command"

    # Test 2.1: Help shows list-peers
    if ./dive spoke help 2>&1 | grep -q "list-peers"; then
        pass "list-peers in help text"
    else
        fail "list-peers not in help text"
    fi

    # Test 2.2: Command exists (dispatch works)
    # Just check it doesn't show "unknown command"
    if ! ./dive --instance test spoke list-peers 2>&1 | grep -q "Unknown command"; then
        pass "Command dispatch works"
    else
        fail "Command not in dispatch"
    fi

    # Test 2.3: Shows proper error when hub unreachable
    # (This test assumes hub is not running for test isolation)
    if ./dive --instance test spoke list-peers 2>&1 | grep -q -E "(Could not reach hub|Querying hub)"; then
        pass "Provides appropriate error/status message"
    else
        fail "Should show hub connectivity status"
    fi
}

# =============================================================================
# TEST 3: federation diagnose command
# =============================================================================

test_federation_diagnose() {
    test_header "TEST 3: federation diagnose command"

    # Test 3.1: Help shows diagnose
    if ./dive federation help 2>&1 | grep -q "diagnose"; then
        pass "diagnose in help text"
    else
        fail "diagnose not in help text"
    fi

    # Test 3.2: Command requires spoke code argument
    if ./dive federation diagnose 2>&1 | grep -q -E "(required|Usage)"; then
        pass "Requires spoke code argument"
    else
        fail "Should require spoke code"
    fi

    # Test 3.3: Lazy loading works (module loads)
    if ! ./dive federation diagnose test 2>&1 | grep -q "Failed to load.*diagnose"; then
        pass "Module loads successfully"
    else
        fail "Module failed to load"
    fi

    # Test 3.4: Shows diagnostic header
    if ./dive federation diagnose TEST 2>&1 | grep -q "Federation Diagnostic"; then
        pass "Shows diagnostic header"
    else
        fail "Should show diagnostic header"
    fi

    # Test 3.5: Runs multiple checks (should show check numbers)
    if ./dive federation diagnose TEST 2>&1 | grep -q "\[1/8\]"; then
        pass "Shows check progress"
    else
        fail "Should show check numbers"
    fi
}

# =============================================================================
# TEST 4: hub reset command
# =============================================================================

test_hub_reset() {
    test_header "TEST 4: hub reset command"

    # Test 4.1: Help shows reset
    if ./dive hub help 2>&1 | grep -q "reset"; then
        pass "reset in help text"
    else
        fail "reset not in help text"
    fi

    # Test 4.2: Command exists in dispatch
    if ! ./dive hub reset 2>&1 | grep -q "Unknown command"; then
        pass "Command dispatch works"
    else
        fail "Command not in dispatch"
    fi

    # Test 4.3: Shows warning message
    if echo "cancel" | ./dive hub reset 2>&1 | grep -q "WARNING.*destroy ALL"; then
        pass "Shows warning message"
    else
        fail "Should show warning"
    fi

    # Test 4.4: Requires confirmation
    if echo "cancel" | ./dive hub reset 2>&1 | grep -q "Type 'RESET'"; then
        pass "Requires RESET confirmation"
    else
        fail "Should require confirmation"
    fi

    # Test 4.5: Cancels on wrong confirmation
    if echo "cancel" | ./dive hub reset 2>&1 | grep -q "cancelled"; then
        pass "Cancels on non-RESET input"
    else
        fail "Should cancel without RESET"
    fi
}

# =============================================================================
# TEST 5: Integration - Command consistency
# =============================================================================

test_consistency() {
    test_header "TEST 5: Command Consistency"

    # Test 5.1: All commands have help text
    local commands_with_help=0
    if ./dive spoke help | grep -q "seed"; then ((commands_with_help++)); fi
    if ./dive spoke help | grep -q "list-peers"; then ((commands_with_help++)); fi
    if ./dive federation help | grep -q "diagnose"; then ((commands_with_help++)); fi
    if ./dive hub help | grep -q "reset"; then ((commands_with_help++)); fi

    if [ $commands_with_help -eq 4 ]; then
        pass "All 4 commands have help text"
    else
        fail "Only $commands_with_help/4 commands have help text"
    fi

    # Test 5.2: spoke seed matches hub seed validation pattern
    local hub_validation=$(./dive hub seed abc 2>&1 | grep -o "must be a positive integer" | head -1)
    local spoke_validation=$(./dive --instance test spoke seed abc 2>&1 | grep -o "must be a positive integer" | head -1)

    if [ "$hub_validation" = "$spoke_validation" ]; then
        pass "spoke seed uses same validation as hub seed"
    else
        fail "spoke seed validation differs from hub seed"
    fi
}

# =============================================================================
# RUN ALL TESTS
# =============================================================================

main() {
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║       Sprint 3: New Commands Integration Tests            ║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"

    test_spoke_seed
    test_spoke_list_peers
    test_federation_diagnose
    test_hub_reset
    test_consistency

    # Summary
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}                    Test Summary                           ${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo ""

    echo "  Total Tests:  $tests_run"
    echo -e "  ${GREEN}Passed:       $tests_passed${NC}"

    if [ $tests_failed -gt 0 ]; then
        echo -e "  ${RED}Failed:       $tests_failed${NC}"
        echo ""
        echo -e "${RED}✗ Some tests failed${NC}"
        return 1
    else
        echo "  Failed:       0"
        echo ""
        echo -e "${GREEN}✓ All tests passed!${NC}"
        return 0
    fi
}

# Run tests
main
exit $?
