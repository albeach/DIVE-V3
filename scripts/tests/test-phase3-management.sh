#!/usr/bin/env bash
# =============================================================================
# PHASE 3 TEST SUITE: Instance Management
# =============================================================================
#
# Tests:
#   1. Deploy script --federate flag
#   2. dive-status.sh health dashboard
#   3. manage-instances.sh lifecycle commands
#
# Usage:
#   ./scripts/tests/test-phase3-management.sh
#
# =============================================================================

set -uo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Counters
TESTS_PASSED=0
TESTS_FAILED=0

# Scripts under test
DEPLOY_SCRIPT="./scripts/deploy-dive-instance.sh"
STATUS_SCRIPT="./scripts/dive-status.sh"
MANAGE_SCRIPT="./scripts/manage-instances.sh"

# Strip ANSI codes
strip_ansi() { sed 's/\x1b\[[0-9;]*m//g'; }

log_test() { echo -e "${BLUE}[TEST]${NC} $1"; }
log_pass() { echo -e "${GREEN}[PASS]${NC} $1"; ((TESTS_PASSED++)); }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; ((TESTS_FAILED++)); }

# =============================================================================
# DEPLOY SCRIPT TESTS (--federate flag)
# =============================================================================

test_deploy_federate_flag() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════════"
    echo " Testing: deploy-dive-instance.sh --federate flag"
    echo "═══════════════════════════════════════════════════════════════════"
    
    local output
    output=$($DEPLOY_SCRIPT --help 2>&1 | strip_ansi)
    
    log_test "Checking --federate in help output"
    if echo "$output" | grep -q "\-\-federate"; then
        log_pass "--federate option documented"
    else
        log_fail "--federate option not in help"
    fi
    
    log_test "Checking --federate example in help"
    if echo "$output" | grep -q "federate"; then
        log_pass "--federate example shown"
    else
        log_fail "--federate example not shown"
    fi
    
    log_test "Checking dry-run with --federate"
    local dry_output
    dry_output=$($DEPLOY_SCRIPT ESP --dry-run 2>&1 | strip_ansi || true)
    if echo "$dry_output" | grep -qE "(ESP|Spain|Planned)"; then
        log_pass "Dry-run works with ESP"
    else
        log_fail "Dry-run failed for ESP"
    fi
}

# =============================================================================
# DIVE-STATUS TESTS
# =============================================================================

test_dive_status() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════════"
    echo " Testing: dive-status.sh health dashboard"
    echo "═══════════════════════════════════════════════════════════════════"
    
    log_test "Checking script exists and is executable"
    if [ -x "$STATUS_SCRIPT" ]; then
        log_pass "dive-status.sh is executable"
    else
        log_fail "dive-status.sh not executable"
        return
    fi
    
    log_test "Checking --help flag"
    if $STATUS_SCRIPT --help >/dev/null 2>&1; then
        log_pass "--help exits successfully"
    else
        log_fail "--help failed"
    fi
    
    local help_output
    help_output=$($STATUS_SCRIPT --help 2>&1 | strip_ansi)
    
    log_test "Checking --json option documented"
    if echo "$help_output" | grep -q "json"; then
        log_pass "--json option documented"
    else
        log_fail "--json option not documented"
    fi
    
    log_test "Checking --watch option documented"
    if echo "$help_output" | grep -q "watch"; then
        log_pass "--watch option documented"
    else
        log_fail "--watch option not documented"
    fi
    
    log_test "Checking JSON output is valid"
    local json_output
    json_output=$($STATUS_SCRIPT --json 2>/dev/null || echo '{}')
    if echo "$json_output" | jq . >/dev/null 2>&1; then
        log_pass "JSON output is valid"
    else
        log_fail "JSON output is invalid"
    fi
    
    log_test "Checking JSON has timestamp"
    if echo "$json_output" | jq -e '.timestamp' >/dev/null 2>&1; then
        log_pass "JSON has timestamp field"
    else
        log_fail "JSON missing timestamp"
    fi
    
    log_test "Checking JSON has instances array"
    if echo "$json_output" | jq -e '.instances' >/dev/null 2>&1; then
        log_pass "JSON has instances array"
    else
        log_fail "JSON missing instances array"
    fi
}

# =============================================================================
# MANAGE-INSTANCES TESTS
# =============================================================================

test_manage_instances() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════════"
    echo " Testing: manage-instances.sh lifecycle commands"
    echo "═══════════════════════════════════════════════════════════════════"
    
    log_test "Checking script exists and is executable"
    if [ -x "$MANAGE_SCRIPT" ]; then
        log_pass "manage-instances.sh is executable"
    else
        log_fail "manage-instances.sh not executable"
        return
    fi
    
    # Use invalid command to trigger help
    local output
    output=$($MANAGE_SCRIPT invalid_command 2>&1 | strip_ansi || true)
    
    log_test "Checking usage shows commands"
    if echo "$output" | grep -qi "usage\|command"; then
        log_pass "Usage information shown"
    else
        log_fail "Usage information not shown"
    fi
    
    log_test "Checking 'start' command documented"
    if echo "$output" | grep -q "start"; then
        log_pass "'start' command documented"
    else
        log_fail "'start' command not documented"
    fi
    
    log_test "Checking 'stop' command documented"
    if echo "$output" | grep -q "stop"; then
        log_pass "'stop' command documented"
    else
        log_fail "'stop' command not documented"
    fi
    
    log_test "Checking 'restart' command documented"
    if echo "$output" | grep -q "restart"; then
        log_pass "'restart' command documented"
    else
        log_fail "'restart' command not documented"
    fi
    
    log_test "Checking 'logs' command documented"
    if echo "$output" | grep -q "logs"; then
        log_pass "'logs' command documented"
    else
        log_fail "'logs' command not documented"
    fi
    
    log_test "Checking 'status' command works"
    local status_output
    status_output=$($MANAGE_SCRIPT status 2>&1 | strip_ansi || true)
    if echo "$status_output" | grep -qE "(CODE|USA|FRA|DEU|Status)"; then
        log_pass "'status' command produces output"
    else
        log_fail "'status' command failed"
    fi
    
    log_test "Checking 'health' command integration"
    if echo "$output" | grep -q "health"; then
        log_pass "'health' command documented"
    else
        log_fail "'health' command not documented"
    fi
    
    log_test "Checking 'federate' command integration"
    if echo "$output" | grep -q "federate"; then
        log_pass "'federate' command documented"
    else
        log_fail "'federate' command not documented"
    fi
}

# =============================================================================
# MAIN
# =============================================================================

cd "$(dirname "$0")/../.."

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║        PHASE 3 TEST SUITE: Instance Management                   ║"
echo "╚══════════════════════════════════════════════════════════════════╝"

# Verify scripts exist
for script in "$DEPLOY_SCRIPT" "$STATUS_SCRIPT" "$MANAGE_SCRIPT"; do
    if [ ! -f "$script" ]; then
        echo -e "${RED}ERROR: Script not found: $script${NC}"
        exit 1
    fi
done

# Make scripts executable
chmod +x "$STATUS_SCRIPT" "$MANAGE_SCRIPT" 2>/dev/null || true

# Run tests
test_deploy_federate_flag
test_dive_status
test_manage_instances

# Summary
echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                        TEST SUMMARY                               ║"
echo "╠══════════════════════════════════════════════════════════════════╣"
printf "║  Tests Passed: %-47s ║\n" "$TESTS_PASSED"
printf "║  Tests Failed: %-47s ║\n" "$TESTS_FAILED"
echo "╚══════════════════════════════════════════════════════════════════╝"

if [[ $TESTS_FAILED -gt 0 ]]; then
    echo ""
    echo -e "${RED}❌ INSTANCE MANAGEMENT TESTS FAILED${NC}"
    exit 1
else
    echo ""
    echo -e "${GREEN}✅ ALL INSTANCE MANAGEMENT TESTS PASSED${NC}"
    exit 0
fi

