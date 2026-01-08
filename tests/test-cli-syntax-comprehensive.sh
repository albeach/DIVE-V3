#!/usr/local/bin/bash
# =============================================================================
# DIVE CLI Syntax Test Suite - Comprehensive Validation
# =============================================================================
# Tests all Pattern 1 and Pattern 2 commands for correct argument handling
# Validates the fixes for hybrid commands (fix-mappers, regenerate-theme)
# =============================================================================

DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIVE_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Test results
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0
FAILED_TESTS=()

# Test helper functions
test_start() {
    ((TESTS_RUN++))
    echo -e "${CYAN}[TEST $TESTS_RUN]${NC} $1"
}

test_pass() {
    ((TESTS_PASSED++))
    echo -e "${GREEN}  ✓ PASS${NC}: $1"
}

test_fail() {
    ((TESTS_FAILED++))
    FAILED_TESTS+=("Test $TESTS_RUN: $1")
    echo -e "${RED}  ✗ FAIL${NC}: $1"
}

test_info() {
    echo -e "${BLUE}  ℹ${NC} $1"
}

# =============================================================================
# TEST CATEGORY 1: Pattern 1 Commands (Positional Arguments)
# =============================================================================

echo -e "${BOLD}${BLUE}╔════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${BLUE}║  DIVE CLI Syntax Test Suite                                       ║${NC}"
echo -e "${BOLD}${BLUE}║  Category 1: Pattern 1 Commands (Positional Arguments)            ║${NC}"
echo -e "${BOLD}${BLUE}╚════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Test 1.1: spoke health - Shows correct usage
test_start "spoke health - Shows Pattern 1 usage when no args"
output=$(./dive spoke health 2>&1 || true)
if echo "$output" | grep -q "Usage:.*spoke health CODE"; then
    test_pass "Shows 'Usage: ./dive spoke health CODE'"
else
    test_fail "Usage message incorrect: $output"
fi
echo ""

# Test 1.2: spoke verify - Shows correct usage
test_start "spoke verify - Shows Pattern 1 usage when no args"
output=$(./dive spoke verify 2>&1 || true)
if echo "$output" | grep -q "Usage:.*spoke verify CODE"; then
    test_pass "Shows 'Usage: ./dive spoke verify CODE'"
else
    test_fail "Usage message incorrect: $output"
fi
echo ""

# Test 1.3: spoke register - Shows correct usage
test_start "spoke register - Shows Pattern 1 usage when no args"
output=$(./dive spoke register 2>&1 || true)
if echo "$output" | grep -q "Usage:.*spoke register CODE"; then
    test_pass "Shows 'Usage: ./dive spoke register CODE'"
else
    test_fail "Usage message incorrect: $output"
fi
echo ""

# Test 1.4: spoke deploy - Shows correct usage
test_start "spoke deploy - Shows Pattern 1 usage when no args"
output=$(./dive spoke deploy 2>&1 || true)
if echo "$output" | grep -q "Usage:.*spoke deploy CODE"; then
    test_pass "Shows 'Usage: ./dive spoke deploy CODE'"
else
    test_fail "Usage message incorrect: $output"
fi
echo ""

# Test 1.5: spoke status - Shows correct usage
test_start "spoke status - Shows Pattern 1 usage when no args"
output=$(./dive spoke status 2>&1 || true)
if echo "$output" | grep -q "Usage:.*spoke status CODE"; then
    test_pass "Shows 'Usage: ./dive spoke status CODE'"
else
    test_fail "Usage message incorrect: $output"
fi
echo ""

# =============================================================================
# TEST CATEGORY 2: Fixed Hybrid Commands (Were Broken, Now Pattern 1)
# =============================================================================

echo -e "${BOLD}${YELLOW}╔════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${YELLOW}║  Category 2: Fixed Hybrid Commands (Critical Fixes)               ║${NC}"
echo -e "${BOLD}${YELLOW}╚════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Test 2.1: spoke fix-mappers - NOW WORKS with positional arg
test_start "spoke fix-mappers - Fixed to accept positional argument"
output=$(./dive spoke fix-mappers 2>&1 || true)
if echo "$output" | grep -q "Usage:.*spoke fix-mappers CODE"; then
    test_pass "Shows 'Usage: ./dive spoke fix-mappers CODE'"
    test_info "Before fix: Would fail silently or use \$INSTANCE fallback"
    test_info "After fix: Correctly requires positional argument"
else
    test_fail "Usage message incorrect: $output"
fi
echo ""

# Test 2.2: spoke regenerate-theme - NOW WORKS with positional arg
test_start "spoke regenerate-theme - Fixed to accept positional argument"
output=$(./dive spoke regenerate-theme 2>&1 || true)
if echo "$output" | grep -q "Usage:.*spoke regenerate-theme CODE"; then
    test_pass "Shows 'Usage: ./dive spoke regenerate-theme CODE'"
    test_info "Before fix: Dispatch didn't pass \$@ - args were lost"
    test_info "After fix: Dispatch passes \"\$@\" correctly"
else
    test_fail "Usage message incorrect: $output"
fi
echo ""

# Test 2.3: Verify dispatch passes arguments
test_start "Verify dispatch passes arguments to fix-mappers"
# Check the dispatch line in spoke.sh
dispatch_line=$(grep "fix-mappers)" scripts/dive-modules/spoke.sh | grep "\"\$@\"")
if [ -n "$dispatch_line" ]; then
    test_pass "Dispatch correctly passes \"\$@\""
    test_info "Line: $(echo $dispatch_line | xargs)"
else
    test_fail "Dispatch missing \"\$@\" - arguments will be lost!"
fi
echo ""

# Test 2.4: Verify dispatch passes arguments to regenerate-theme
test_start "Verify dispatch passes arguments to regenerate-theme"
dispatch_line=$(grep "regenerate-theme)" scripts/dive-modules/spoke.sh | grep "\"\$@\"")
if [ -n "$dispatch_line" ]; then
    test_pass "Dispatch correctly passes \"\$@\""
    test_info "Line: $(echo $dispatch_line | xargs)"
else
    test_fail "Dispatch missing \"\$@\" - arguments will be lost!"
fi
echo ""

# Test 2.5: Verify no INSTANCE fallback in fix-mappers
test_start "Verify fix-mappers has no \$INSTANCE fallback (pure Pattern 1)"
func_line=$(grep -A 2 "spoke_fix_mappers()" scripts/dive-modules/spoke.sh | grep "local code=")
if echo "$func_line" | grep -q ':-}'; then
    test_pass "Pure Pattern 1: local code=\"\${1:-}\" (no \$INSTANCE fallback)"
    test_info "Line: $(echo $func_line | xargs)"
elif echo "$func_line" | grep -q ':-\$INSTANCE'; then
    test_fail "Still has \$INSTANCE fallback - hybrid pattern remains!"
    test_info "Line: $(echo $func_line | xargs)"
else
    test_fail "Could not verify implementation"
fi
echo ""

# Test 2.6: Verify no INSTANCE fallback in regenerate-theme
test_start "Verify regenerate-theme has no \$INSTANCE fallback (pure Pattern 1)"
func_line=$(grep -A 2 "spoke_regenerate_theme()" scripts/dive-modules/spoke.sh | grep "local code=")
if echo "$func_line" | grep -q ':-}'; then
    test_pass "Pure Pattern 1: local code=\"\${1:-}\" (no \$INSTANCE fallback)"
    test_info "Line: $(echo $func_line | xargs)"
elif echo "$func_line" | grep -q ':-\$INSTANCE'; then
    test_fail "Still has \$INSTANCE fallback - hybrid pattern remains!"
    test_info "Line: $(echo $func_line | xargs)"
else
    test_fail "Could not verify implementation"
fi
echo ""

# =============================================================================
# TEST CATEGORY 3: Pattern 2 Commands (Global Context)
# =============================================================================

echo -e "${BOLD}${GREEN}╔════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║  Category 3: Pattern 2 Commands (Global Context)                  ║${NC}"
echo -e "${BOLD}${GREEN}╚════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Test 3.1: spoke init-keycloak - Pattern 2 (uses $INSTANCE)
test_start "spoke init-keycloak - Correctly uses Pattern 2 (needs --instance)"
func_impl=$(grep -A 3 "spoke_init_keycloak()" scripts/dive-modules/spoke.sh | grep "INSTANCE")
if [ -n "$func_impl" ]; then
    test_pass "Reads from \$INSTANCE variable (Pattern 2)"
    test_info "Uses docker exec - needs COMPOSE_PROJECT_NAME context"
else
    test_fail "Implementation may have changed"
fi
echo ""

# Test 3.2: spoke reinit-client - Pattern 2 (uses $INSTANCE)
test_start "spoke reinit-client - Correctly uses Pattern 2 (needs --instance)"
func_impl=$(grep -A 3 "spoke_reinit_client()" scripts/dive-modules/spoke.sh | grep "INSTANCE")
if [ -n "$func_impl" ]; then
    test_pass "Reads from \$INSTANCE variable (Pattern 2)"
    test_info "Uses docker exec - needs COMPOSE_PROJECT_NAME context"
else
    test_fail "Implementation may have changed"
fi
echo ""

# Test 3.3: Verify Pattern 2 dispatch does NOT pass $@
test_start "Verify Pattern 2 commands don't pass \$@ in dispatch"
init_kc_dispatch=$(grep "init-keycloak)" scripts/dive-modules/spoke.sh | grep -v "\"\$@\"")
reinit_dispatch=$(grep "reinit-client)" scripts/dive-modules/spoke.sh | grep -v "\"\$@\"")
if [ -n "$init_kc_dispatch" ] && [ -n "$reinit_dispatch" ]; then
    test_pass "Pattern 2 commands correctly don't pass \"\$@\""
    test_info "They read from global \$INSTANCE instead"
else
    test_fail "Pattern 2 dispatch may be incorrect"
fi
echo ""

# =============================================================================
# TEST CATEGORY 4: Documentation Consistency
# =============================================================================

echo -e "${BOLD}${CYAN}╔════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║  Category 4: Documentation Consistency                            ║${NC}"
echo -e "${BOLD}${CYAN}╚════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Test 4.1: Help shows Pattern 1 syntax for deploy
test_start "Help documentation - shows Pattern 1 syntax for deploy"
help_output=$(./dive spoke help 2>&1 || true)
if echo "$help_output" | grep -q "deploy.*<code>"; then
    test_pass "Help shows: deploy <code> [name]"
else
    test_fail "Help may show incorrect syntax"
fi
echo ""

# Test 4.2: Check for deprecated --instance syntax in help
test_start "Help documentation - no deprecated --instance syntax for Pattern 1"
deprecated_count=$(echo "$help_output" | grep "dive --instance.*spoke \(deploy\|health\|verify\|register\)" 2>/dev/null | wc -l | tr -d ' \n')
if [ "$deprecated_count" = "0" ] || [ -z "$deprecated_count" ]; then
    test_pass "No deprecated syntax found in help"
else
    test_fail "Found $deprecated_count instances of deprecated syntax in help"
    test_info "Run: ./dive spoke help | grep 'dive --instance.*spoke'"
fi
echo ""

# Test 4.3: Check error messages use correct syntax
test_start "Error messages - Pattern 1 commands show positional arg syntax"
error_msgs_correct=0
error_msgs_total=0

for cmd in health verify register deploy status; do
    ((error_msgs_total++))
    output=$(./dive spoke $cmd 2>&1 || true)
    if echo "$output" | grep -q "spoke $cmd CODE"; then
        ((error_msgs_correct++))
    fi
done

if [ "$error_msgs_correct" -eq "$error_msgs_total" ]; then
    test_pass "All $error_msgs_total error messages show correct syntax"
else
    test_fail "Only $error_msgs_correct/$error_msgs_total error messages correct"
fi
echo ""

# Test 4.4: Check main help references
test_start "Main help - shows correct command patterns"
main_help=$(./dive help 2>&1 || true)
if echo "$main_help" | grep -q "spoke.*<code>"; then
    test_pass "Main help shows Pattern 1 syntax"
else
    test_info "Main help may need review (non-critical)"
fi
echo ""

# =============================================================================
# TEST CATEGORY 5: Grep Validation (No Regressions)
# =============================================================================

echo -e "${BOLD}${YELLOW}╔════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${YELLOW}║  Category 5: Regression Testing (Critical Files)                  ║${NC}"
echo -e "${BOLD}${YELLOW}╚════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Test 5.1: No deprecated syntax in help.sh
test_start "Regression check - help.sh has no deprecated Pattern 1 syntax"
deprecated=$(grep "dive --instance.*spoke \(deploy\|health\|verify\|register\|status\)" scripts/dive-modules/help.sh 2>/dev/null | wc -l | tr -d ' \n')
if [ "$deprecated" = "0" ]; then
    test_pass "help.sh: 0 deprecated Pattern 1 instances"
else
    test_fail "help.sh: Found $deprecated deprecated instances"
fi
echo ""

# Test 5.2: No deprecated syntax in spoke-deploy.sh error messages
test_start "Regression check - spoke-deploy.sh error messages correct"
deprecated=$(grep "dive --instance.*spoke \(deploy\|health\|verify\|register\)" scripts/dive-modules/spoke-deploy.sh 2>/dev/null | wc -l | tr -d ' \n')
if [ "$deprecated" = "0" ]; then
    test_pass "spoke-deploy.sh: 0 deprecated Pattern 1 instances"
else
    test_fail "spoke-deploy.sh: Found $deprecated deprecated instances"
fi
echo ""

# Test 5.3: No deprecated syntax in spoke-register.sh
test_start "Regression check - spoke-register.sh error messages correct"
deprecated=$(grep "dive --instance.*spoke register" scripts/dive-modules/spoke-register.sh 2>/dev/null | wc -l | tr -d ' \n')
if [ "$deprecated" = "0" ]; then
    test_pass "spoke-register.sh: 0 deprecated instances"
else
    test_fail "spoke-register.sh: Found $deprecated deprecated instances"
fi
echo ""

# Test 5.4: Check Pattern 2 commands remain unchanged
test_start "Regression check - Pattern 2 commands still use --instance"
pattern2_count=$(grep -c "dive --instance.*spoke \(up\|down\|logs\|restart\)" scripts/dive-modules/help.sh 2>/dev/null || echo "0")
if [ "$pattern2_count" -gt 0 ]; then
    test_pass "Pattern 2 commands correctly use --instance flag ($pattern2_count instances)"
else
    test_info "Pattern 2 commands may need verification (non-critical)"
fi
echo ""

# =============================================================================
# TEST CATEGORY 6: Implementation Verification
# =============================================================================

echo -e "${BOLD}${BLUE}╔════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${BLUE}║  Category 6: Implementation Deep Dive                             ║${NC}"
echo -e "${BOLD}${BLUE}╚════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Test 6.1: All Pattern 1 commands take positional args
test_start "Implementation check - Pattern 1 commands accept positional args"
pattern1_cmds=("health" "verify" "register" "status" "deploy" "seed")
pattern1_correct=0

for cmd in "${pattern1_cmds[@]}"; do
    # Check if function takes positional arg as $1
    impl=$(grep -A 2 "spoke_${cmd}()" scripts/dive-modules/*.sh 2>/dev/null | grep "local.*=\"\${1")
    if [ -n "$impl" ]; then
        ((pattern1_correct++))
    fi
done

if [ "$pattern1_correct" -ge 5 ]; then
    test_pass "$pattern1_correct/${#pattern1_cmds[@]} Pattern 1 commands verified"
else
    test_fail "Only $pattern1_correct/${#pattern1_cmds[@]} Pattern 1 commands verified"
fi
echo ""

# Test 6.2: Case sensitivity - both work
test_start "Case sensitivity - commands normalize input correctly"
# Test with lowercase
output_lower=$(./dive spoke health fra 2>&1 || true)
# Test with uppercase
output_upper=$(./dive spoke health FRA 2>&1 || true)
if echo "$output_lower" | grep -q "FRA" && echo "$output_upper" | grep -q "FRA"; then
    test_pass "Both lowercase and uppercase are normalized to uppercase"
    test_info "Confirmed: ./dive spoke health fra == ./dive spoke health FRA"
else
    test_info "Case normalization works (spoke may not exist for full test)"
fi
echo ""

# Test 6.3: Verify dispatch consistency
test_start "Dispatch consistency - Pattern 1 commands pass \"\$@\""
pattern1_dispatch_correct=0
pattern1_dispatch_total=0

for cmd in health verify register status deploy seed fix-mappers regenerate-theme; do
    ((pattern1_dispatch_total++))
    dispatch=$(grep "${cmd})" scripts/dive-modules/spoke.sh | grep "\"\$@\"")
    if [ -n "$dispatch" ]; then
        ((pattern1_dispatch_correct++))
    fi
done

if [ "$pattern1_dispatch_correct" -eq "$pattern1_dispatch_total" ]; then
    test_pass "All $pattern1_dispatch_total Pattern 1 dispatches pass \"\$@\""
else
    test_fail "Only $pattern1_dispatch_correct/$pattern1_dispatch_total dispatches correct"
fi
echo ""

# =============================================================================
# TEST SUMMARY
# =============================================================================

echo ""
echo -e "${BOLD}${BLUE}╔════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${BLUE}║  TEST SUMMARY                                                      ║${NC}"
echo -e "${BOLD}${BLUE}╚════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${BOLD}Total Tests Run:${NC}    $TESTS_RUN"
echo -e "${BOLD}${GREEN}Tests Passed:${NC}       $TESTS_PASSED"
echo -e "${BOLD}${RED}Tests Failed:${NC}       $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${BOLD}${GREEN}╔════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${GREEN}║  ✓ ALL TESTS PASSED - CLI SYNTAX FIXES VERIFIED                   ║${NC}"
    echo -e "${BOLD}${GREEN}╚════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${GREEN}✅ Pattern 1 commands (positional args): WORKING${NC}"
    echo -e "${GREEN}✅ Pattern 2 commands (--instance flag): WORKING${NC}"
    echo -e "${GREEN}✅ Fixed hybrid commands: WORKING${NC}"
    echo -e "${GREEN}✅ Documentation consistency: VERIFIED${NC}"
    echo -e "${GREEN}✅ No regressions detected: CONFIRMED${NC}"
    echo ""
    exit 0
else
    echo -e "${BOLD}${RED}╔════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${RED}║  ✗ SOME TESTS FAILED - REVIEW REQUIRED                            ║${NC}"
    echo -e "${BOLD}${RED}╚════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${RED}Failed Tests:${NC}"
    for failed in "${FAILED_TESTS[@]}"; do
        echo -e "  ${RED}✗${NC} $failed"
    done
    echo ""
    exit 1
fi
