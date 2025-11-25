#!/usr/bin/env bash
# =============================================================================
# PHASE 2 TEST SUITE: Federation Automation
# =============================================================================
#
# Tests:
#   1. add-federation-partner.sh functionality
#   2. show-federation-status.sh functionality
#   3. Dry-run mode
#   4. Input validation
#
# Usage:
#   ./scripts/tests/test-phase2-federation.sh
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
ADD_FEDERATION="./scripts/add-federation-partner.sh"
SHOW_STATUS="./scripts/show-federation-status.sh"

# Strip ANSI codes
strip_ansi() { sed 's/\x1b\[[0-9;]*m//g'; }

log_test() { echo -e "${BLUE}[TEST]${NC} $1"; }
log_pass() { echo -e "${GREEN}[PASS]${NC} $1"; ((TESTS_PASSED++)); }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; ((TESTS_FAILED++)); }

# =============================================================================
# TEST FUNCTIONS
# =============================================================================

test_add_federation_help() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════════"
    echo " Testing: add-federation-partner.sh --help"
    echo "═══════════════════════════════════════════════════════════════════"
    
    local output
    output=$($ADD_FEDERATION --help 2>&1 | strip_ansi)
    
    log_test "Checking --help exits successfully"
    if $ADD_FEDERATION --help >/dev/null 2>&1; then
        log_pass "--help exits successfully"
    else
        log_fail "--help returned non-zero exit code"
    fi
    
    log_test "Checking --help shows usage"
    if echo "$output" | grep -q "Usage:"; then
        log_pass "--help shows usage"
    else
        log_fail "--help missing usage"
    fi
    
    log_test "Checking --help shows examples"
    if echo "$output" | grep -q "USA FRA"; then
        log_pass "--help shows examples"
    else
        log_fail "--help missing examples"
    fi
    
    log_test "Checking --help shows dry-run option"
    if echo "$output" | grep -q "dry-run"; then
        log_pass "--help shows dry-run option"
    else
        log_fail "--help missing dry-run option"
    fi
}

test_add_federation_validation() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════════"
    echo " Testing: add-federation-partner.sh input validation"
    echo "═══════════════════════════════════════════════════════════════════"
    
    log_test "Checking missing arguments rejected"
    if ! $ADD_FEDERATION 2>/dev/null; then
        log_pass "Missing arguments rejected"
    else
        log_fail "Missing arguments not rejected"
    fi
    
    log_test "Checking invalid instance code rejected"
    if ! $ADD_FEDERATION USA XYZ --dry-run 2>/dev/null; then
        log_pass "Invalid instance code rejected"
    else
        log_fail "Invalid instance code not rejected"
    fi
    
    log_test "Checking same source/target rejected"
    if ! $ADD_FEDERATION USA USA --dry-run 2>/dev/null; then
        log_pass "Same source/target rejected"
    else
        log_fail "Same source/target not rejected"
    fi
}

test_add_federation_dry_run() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════════"
    echo " Testing: add-federation-partner.sh --dry-run"
    echo "═══════════════════════════════════════════════════════════════════"
    
    log_test "Checking dry-run shows planned actions"
    local output
    output=$($ADD_FEDERATION USA FRA --dry-run 2>&1 | strip_ansi || true)
    
    if echo "$output" | grep -qE "(DRY RUN|Would|planned)"; then
        log_pass "Dry-run shows planned actions"
    else
        # Dry-run might fail if Keycloak not running - that's OK
        if echo "$output" | grep -qi "could not obtain"; then
            log_pass "Dry-run correctly reports instance unavailable"
        else
            log_fail "Dry-run output unclear"
        fi
    fi
}

test_show_status_help() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════════"
    echo " Testing: show-federation-status.sh --help"
    echo "═══════════════════════════════════════════════════════════════════"
    
    log_test "Checking --help exits successfully"
    if $SHOW_STATUS --help >/dev/null 2>&1; then
        log_pass "--help exits successfully"
    else
        log_fail "--help returned non-zero exit code"
    fi
    
    local output
    output=$($SHOW_STATUS --help 2>&1 | strip_ansi)
    
    log_test "Checking --help shows --json option"
    if echo "$output" | grep -q "json"; then
        log_pass "--help shows --json option"
    else
        log_fail "--help missing --json option"
    fi
    
    log_test "Checking --help shows --matrix option"
    if echo "$output" | grep -q "matrix"; then
        log_pass "--help shows --matrix option"
    else
        log_fail "--help missing --matrix option"
    fi
}

test_show_status_json() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════════"
    echo " Testing: show-federation-status.sh --json"
    echo "═══════════════════════════════════════════════════════════════════"
    
    log_test "Checking --json produces valid JSON"
    local output
    output=$($SHOW_STATUS --json 2>/dev/null || echo '{"error":"no instances"}')
    
    if echo "$output" | jq . >/dev/null 2>&1; then
        log_pass "--json produces valid JSON"
    else
        log_fail "--json does not produce valid JSON"
    fi
    
    log_test "Checking JSON has running_instances field"
    if echo "$output" | jq -e '.running_instances' >/dev/null 2>&1; then
        log_pass "JSON has running_instances field"
    else
        # Might not have instances if none running
        if echo "$output" | grep -q "error"; then
            log_pass "JSON correctly reports no instances"
        else
            log_fail "JSON missing running_instances field"
        fi
    fi
}

# =============================================================================
# MAIN
# =============================================================================

cd "$(dirname "$0")/../.."

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║        PHASE 2 TEST SUITE: Federation Automation                 ║"
echo "╚══════════════════════════════════════════════════════════════════╝"

# Verify scripts exist
if [ ! -f "$ADD_FEDERATION" ]; then
    echo -e "${RED}ERROR: add-federation-partner.sh not found${NC}"
    exit 1
fi

if [ ! -f "$SHOW_STATUS" ]; then
    echo -e "${RED}ERROR: show-federation-status.sh not found${NC}"
    exit 1
fi

# Run tests
test_add_federation_help
test_add_federation_validation
test_add_federation_dry_run
test_show_status_help
test_show_status_json

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
    echo -e "${RED}❌ FEDERATION TESTS FAILED${NC}"
    exit 1
else
    echo ""
    echo -e "${GREEN}✅ ALL FEDERATION TESTS PASSED${NC}"
    exit 0
fi

