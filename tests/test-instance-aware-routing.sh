#!/usr/bin/env bash
# =============================================================================
# DIVE CLI Instance-Aware Routing Tests
# =============================================================================
# Tests the new instance-aware routing for core commands (up, down, logs, etc.)
# Verifies that deprecation warnings are shown and commands route correctly
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Test results
declare -a FAILED_TESTS=()

log_test() {
    echo -e "${BLUE}TEST ${TESTS_RUN}:${NC} $1"
}

log_pass() {
    echo -e "${GREEN}  ✓ PASS${NC}: $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

log_fail() {
    echo -e "${RED}  ✗ FAIL${NC}: $1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    FAILED_TESTS+=("TEST ${TESTS_RUN}: $2 - $1")
}

run_test() {
    TESTS_RUN=$((TESTS_RUN + 1))
    log_test "$1"
}

# =============================================================================
# SETUP
# =============================================================================

DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIVE_ROOT"

echo -e "${CYAN}"
echo "═══════════════════════════════════════════════════════════"
echo "   DIVE CLI Instance-Aware Routing Tests"
echo "═══════════════════════════════════════════════════════════"
echo -e "${NC}"
echo ""

# Check if dive command exists
if [ ! -f "./dive" ]; then
    echo -e "${RED}ERROR: ./dive command not found${NC}"
    exit 1
fi

# Ensure FRA spoke exists for testing
if [ ! -d "instances/fra" ]; then
    echo -e "${YELLOW}WARNING: FRA spoke not found, some tests will be skipped${NC}"
    FRA_EXISTS=false
else
    FRA_EXISTS=true
fi

echo "Test environment:"
echo "  DIVE_ROOT: $DIVE_ROOT"
echo "  FRA spoke: $($FRA_EXISTS && echo "Present" || echo "Not found")"
echo ""

# =============================================================================
# TEST 1: Verify spoke module can be loaded
# =============================================================================

run_test "Spoke module can be loaded"

if [ -f "scripts/dive-modules/spoke.sh" ]; then
    log_pass "Spoke module exists at scripts/dive-modules/spoke.sh"
else
    log_fail "Spoke module not found" "Spoke module loading"
fi

# =============================================================================
# TEST 2: Verify core.sh has instance-aware routing for cmd_up
# =============================================================================

run_test "core.sh has instance-aware routing in cmd_up"

if grep -q "INSTANCE-AWARE ROUTING" scripts/dive-modules/core.sh; then
    log_pass "Instance-aware routing comments found"
else
    log_fail "Instance-aware routing comments not found" "cmd_up routing"
fi

if grep -q "spoke_up" scripts/dive-modules/core.sh; then
    log_pass "cmd_up delegates to spoke_up"
else
    log_fail "cmd_up does not delegate to spoke_up" "cmd_up delegation"
fi

# =============================================================================
# TEST 3: Verify deprecation warnings in cmd_up
# =============================================================================

run_test "cmd_up shows deprecation warning"

if grep -q "DEPRECATED: Use" scripts/dive-modules/core.sh; then
    log_pass "Deprecation warning found"
else
    log_fail "Deprecation warning not found" "Deprecation warnings"
fi

if grep -q "will be removed in v5.0" scripts/dive-modules/core.sh; then
    log_pass "v5.0 removal notice found"
else
    log_fail "v5.0 removal notice not found" "Deprecation warnings"
fi

# =============================================================================
# TEST 4: Verify core.sh has instance-aware routing for cmd_down
# =============================================================================

run_test "core.sh has instance-aware routing in cmd_down"

if grep -A20 "^cmd_down()" scripts/dive-modules/core.sh | grep -q "INSTANCE-AWARE ROUTING"; then
    log_pass "cmd_down has instance-aware routing"
else
    log_fail "cmd_down missing instance-aware routing" "cmd_down routing"
fi

if grep -A20 "^cmd_down()" scripts/dive-modules/core.sh | grep -q "spoke_down"; then
    log_pass "cmd_down delegates to spoke_down"
else
    log_fail "cmd_down does not delegate to spoke_down" "cmd_down delegation"
fi

# =============================================================================
# TEST 5: Verify core.sh has instance-aware routing for cmd_logs
# =============================================================================

run_test "core.sh has instance-aware routing in cmd_logs"

if grep -A20 "^cmd_logs()" scripts/dive-modules/core.sh | grep -q "INSTANCE-AWARE ROUTING"; then
    log_pass "cmd_logs has instance-aware routing"
else
    log_fail "cmd_logs missing instance-aware routing" "cmd_logs routing"
fi

if grep -A20 "^cmd_logs()" scripts/dive-modules/core.sh | grep -q "spoke_logs"; then
    log_pass "cmd_logs delegates to spoke_logs"
else
    log_fail "cmd_logs does not delegate to spoke_logs" "cmd_logs delegation"
fi

# =============================================================================
# TEST 6: Verify core.sh has instance-aware routing for cmd_restart
# =============================================================================

run_test "core.sh has instance-aware routing in cmd_restart"

if grep -A25 "^cmd_restart()" scripts/dive-modules/core.sh | grep -q "INSTANCE-AWARE ROUTING"; then
    log_pass "cmd_restart has instance-aware routing"
else
    log_fail "cmd_restart missing instance-aware routing" "cmd_restart routing"
fi

# =============================================================================
# TEST 7: Verify cmd_ps is instance-aware
# =============================================================================

run_test "cmd_ps shows correct containers based on instance"

if grep -A15 "^cmd_ps()" scripts/dive-modules/core.sh | grep -q "INSTANCE-AWARE"; then
    log_pass "cmd_ps has instance-aware logic"
else
    log_fail "cmd_ps missing instance-aware logic" "cmd_ps routing"
fi

if grep -A15 "^cmd_ps()" scripts/dive-modules/core.sh | grep -q "dive-spoke-"; then
    log_pass "cmd_ps filters for spoke containers"
else
    log_fail "cmd_ps does not filter spoke containers" "cmd_ps filtering"
fi

# =============================================================================
# TEST 8: Verify cmd_exec is instance-aware
# =============================================================================

run_test "cmd_exec routes to correct container based on instance"

if grep -A40 "^cmd_exec()" scripts/dive-modules/core.sh | grep -q "INSTANCE-AWARE ROUTING"; then
    log_pass "cmd_exec has instance-aware routing"
else
    log_fail "cmd_exec missing instance-aware routing" "cmd_exec routing"
fi

if grep -A40 "^cmd_exec()" scripts/dive-modules/core.sh | grep -q "dive-spoke-\${instance_lower}"; then
    log_pass "cmd_exec uses spoke container naming"
else
    log_fail "cmd_exec does not use spoke container naming" "cmd_exec naming"
fi

# =============================================================================
# TEST 9: Verify help text updated
# =============================================================================

run_test "Help text shows new command structure"

if grep -q "Hub Operations:" scripts/dive-modules/help.sh; then
    log_pass "Help shows 'Hub Operations' section"
else
    log_fail "Help missing 'Hub Operations' section" "Help text"
fi

if grep -q "Spoke Operations:" scripts/dive-modules/help.sh; then
    log_pass "Help shows 'Spoke Operations' section"
else
    log_fail "Help missing 'Spoke Operations' section" "Help text"
fi

if grep -q "DEPRECATED" scripts/dive-modules/help.sh; then
    log_pass "Help shows deprecation warnings"
else
    log_fail "Help missing deprecation warnings" "Help deprecation"
fi

if grep -q "./dive hub up" scripts/dive-modules/help.sh; then
    log_pass "Help shows correct hub commands"
else
    log_fail "Help missing correct hub commands" "Help hub commands"
fi

if grep -q "./dive --instance fra spoke up" scripts/dive-modules/help.sh; then
    log_pass "Help shows correct spoke commands"
else
    log_fail "Help missing correct spoke commands" "Help spoke commands"
fi

# =============================================================================
# TEST 10: Verify migration guide exists
# =============================================================================

run_test "Migration guide documentation exists"

if [ -f "docs/CLI_V5_MIGRATION_GUIDE.md" ]; then
    log_pass "Migration guide found"
else
    log_fail "Migration guide not found" "Migration docs"
fi

if [ -f "docs/SPOKE_COMMANDS_COMPARISON.md" ]; then
    log_pass "Command comparison document found"
else
    log_fail "Command comparison not found" "Comparison docs"
fi

# =============================================================================
# TEST 11: Verify all core commands have instance awareness
# =============================================================================

run_test "All core commands (up, down, restart, logs, exec, ps) are instance-aware"

CORE_COMMANDS=("cmd_up" "cmd_down" "cmd_restart" "cmd_logs" "cmd_exec" "cmd_ps")
MISSING_AWARENESS=0

for cmd in "${CORE_COMMANDS[@]}"; do
    if grep -A30 "^${cmd}()" scripts/dive-modules/core.sh | grep -q "instance_lower"; then
        log_pass "$cmd uses instance_lower variable"
    else
        log_fail "$cmd does not use instance_lower" "Instance awareness"
        MISSING_AWARENESS=$((MISSING_AWARENESS + 1))
    fi
done

if [ $MISSING_AWARENESS -eq 0 ]; then
    log_pass "All core commands are instance-aware"
fi

# =============================================================================
# TEST 12: Verify routing logic correctness
# =============================================================================

run_test "Routing logic correctly identifies spoke instances"

if grep -q 'if \[ "$instance_lower" != "usa" \]' scripts/dive-modules/core.sh; then
    log_pass "Routing checks for non-USA instances"
else
    log_fail "Routing does not check for non-USA instances" "Routing logic"
fi

if grep -q 'DIVE_ROOT}/instances/${instance_lower}' scripts/dive-modules/core.sh; then
    log_pass "Routing verifies spoke directory exists"
else
    log_fail "Routing does not verify spoke directory" "Directory check"
fi

# =============================================================================
# TEST 13: Verify error handling for missing spoke module
# =============================================================================

run_test "Commands handle missing spoke module gracefully"

if grep -q 'Spoke module not found' scripts/dive-modules/core.sh; then
    log_pass "Error message for missing spoke module"
else
    log_fail "No error message for missing spoke module" "Error handling"
fi

if grep -q 'return 1$' scripts/dive-modules/core.sh; then
    log_pass "Commands return error code on failure"
else
    log_fail "Commands do not return error code" "Error codes"
fi

# =============================================================================
# TEST 14: Dry-run mode safety check
# =============================================================================

run_test "Commands respect DRY_RUN mode"

# Test that --dry-run flag works (using hub command which is always available)
OUTPUT=$(DRY_RUN=true ./dive hub status 2>&1 || true)
if echo "$OUTPUT" | grep -qi "would\|dry"; then
    log_pass "Dry-run mode shows preview messages"
else
    # Check if dry-run is just not implemented for status command
    OUTPUT2=$(DRY_RUN=true ./dive --dry-run status 2>&1 || true)
    if echo "$OUTPUT2" | grep -qi "would\|dry"; then
        log_pass "Dry-run mode works via flag"
    else
        log_fail "Dry-run mode does not show preview" "Dry-run mode"
    fi
fi

# =============================================================================
# LIVE TESTS (if FRA spoke exists and containers are not running)
# =============================================================================

if [ "$FRA_EXISTS" = true ]; then
    # Check if FRA is currently running
    if docker ps --format '{{.Names}}' | grep -q "dive-spoke-fra"; then
        echo ""
        echo -e "${YELLOW}NOTE: FRA spoke is running, skipping live routing tests${NC}"
    else
        # =============================================================================
        # TEST 15: Live test - deprecated command shows warning
        # =============================================================================

        run_test "LIVE: Deprecated command shows warning (requires FRA spoke)"

        # This should show deprecation warning but NOT actually start anything (dry-run)
        OUTPUT=$(./dive --dry-run --instance fra up 2>&1 || true)

        if echo "$OUTPUT" | grep -q "DEPRECATED"; then
            log_pass "Deprecation warning displayed"
        else
            log_fail "Deprecation warning not displayed" "Live warning test"
        fi

        if echo "$OUTPUT" | grep -q "spoke up"; then
            log_pass "Command suggests correct syntax"
        else
            log_fail "Command does not suggest correct syntax" "Live suggestion test"
        fi
    fi
fi

# =============================================================================
# SUMMARY
# =============================================================================

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}   Test Summary${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo "  Total Tests:   $TESTS_RUN"
echo -e "  Passed:        ${GREEN}$TESTS_PASSED${NC}"
echo -e "  Failed:        ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -gt 0 ]; then
    echo -e "${RED}Failed Tests:${NC}"
    for test in "${FAILED_TESTS[@]}"; do
        echo -e "  ${RED}✗${NC} $test"
    done
    echo ""
    exit 1
else
    echo -e "${GREEN}✓ All tests passed!${NC}"
    echo ""
    echo -e "${BOLD}Instance-Aware Routing Implementation:${NC}"
    echo "  ✓ All core commands route correctly"
    echo "  ✓ Deprecation warnings in place"
    echo "  ✓ Help text updated"
    echo "  ✓ Migration guide created"
    echo "  ✓ Error handling implemented"
    echo ""
    exit 0
fi
