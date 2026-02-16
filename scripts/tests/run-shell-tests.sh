#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Shell Script Unit Test Framework
# =============================================================================
# Lightweight test harness for pure shell functions (no Docker required).
#
# Usage:
#   ./scripts/tests/run-shell-tests.sh           # Run all tests
#   ./scripts/tests/run-shell-tests.sh common     # Run only common.sh tests
#   ./scripts/tests/run-shell-tests.sh cli        # Run only CLI tests
#
# Test files: scripts/tests/test_*.sh
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Counters
TOTAL_TESTS=0
TOTAL_PASSED=0
TOTAL_FAILED=0
TOTAL_SUITES=0
SUITE_FAILURES=()

# ─── Test Framework Functions ─────────────────────────────────────────────────

assert_eq() {
    local expected="$1"
    local actual="$2"
    local message="${3:-}"
    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    if [ "$expected" = "$actual" ]; then
        TOTAL_PASSED=$((TOTAL_PASSED + 1))
        echo -e "  ${GREEN}PASS${NC} ${message}"
    else
        TOTAL_FAILED=$((TOTAL_FAILED + 1))
        echo -e "  ${RED}FAIL${NC} ${message}"
        echo -e "       Expected: '${expected}'"
        echo -e "       Actual:   '${actual}'"
    fi
}

assert_contains() {
    local haystack="$1"
    local needle="$2"
    local message="${3:-}"
    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    if echo "$haystack" | grep -q "$needle"; then
        TOTAL_PASSED=$((TOTAL_PASSED + 1))
        echo -e "  ${GREEN}PASS${NC} ${message}"
    else
        TOTAL_FAILED=$((TOTAL_FAILED + 1))
        echo -e "  ${RED}FAIL${NC} ${message}"
        echo -e "       Expected to contain: '${needle}'"
        echo -e "       In: '${haystack}'"
    fi
}

assert_exit_code() {
    local expected_code="$1"
    shift
    local message="${*: -1}"
    local cmd_args=("${@:1:$#-1}")
    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    local actual_code=0
    "${cmd_args[@]}" >/dev/null 2>&1 || actual_code=$?

    if [ "$expected_code" = "$actual_code" ]; then
        TOTAL_PASSED=$((TOTAL_PASSED + 1))
        echo -e "  ${GREEN}PASS${NC} ${message}"
    else
        TOTAL_FAILED=$((TOTAL_FAILED + 1))
        echo -e "  ${RED}FAIL${NC} ${message}"
        echo -e "       Expected exit code: ${expected_code}"
        echo -e "       Actual exit code:   ${actual_code}"
    fi
}

assert_not_empty() {
    local value="$1"
    local message="${2:-}"
    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    if [ -n "$value" ]; then
        TOTAL_PASSED=$((TOTAL_PASSED + 1))
        echo -e "  ${GREEN}PASS${NC} ${message}"
    else
        TOTAL_FAILED=$((TOTAL_FAILED + 1))
        echo -e "  ${RED}FAIL${NC} ${message}"
        echo -e "       Expected non-empty value"
    fi
}

run_suite() {
    local suite_name="$1"
    local suite_file="$2"
    TOTAL_SUITES=$((TOTAL_SUITES + 1))

    echo -e "\n${BLUE}Suite: ${suite_name}${NC}"
    echo "  ─────────────────────────────────────"

    local before_failed=$TOTAL_FAILED
    source "$suite_file"

    if [ $TOTAL_FAILED -gt "$before_failed" ]; then
        SUITE_FAILURES+=("$suite_name")
    fi
}

# ─── Run Tests ────────────────────────────────────────────────────────────────

echo -e "${BLUE}=============================================${NC}"
echo -e "${BLUE} DIVE V3 Shell Script Unit Tests${NC}"
echo -e "${BLUE}=============================================${NC}"

FILTER="${1:-all}"

for test_file in "$SCRIPT_DIR"/test_*.sh; do
    [ -f "$test_file" ] || continue

    suite_name="$(basename "$test_file" .sh)"

    # Apply filter
    if [ "$FILTER" != "all" ]; then
        if ! echo "$suite_name" | grep -qi "$FILTER"; then
            continue
        fi
    fi

    run_suite "$suite_name" "$test_file"
done

# ─── Summary ──────────────────────────────────────────────────────────────────

echo -e "\n${BLUE}=============================================${NC}"
echo -e "${BLUE} Results${NC}"
echo -e "${BLUE}=============================================${NC}"
echo -e "  Suites: ${TOTAL_SUITES} run"
echo -e "  Tests:  ${TOTAL_PASSED}/${TOTAL_TESTS} passed"

if [ $TOTAL_FAILED -gt 0 ]; then
    echo -e "  ${RED}Failed: ${TOTAL_FAILED}${NC}"
    for suite in "${SUITE_FAILURES[@]}"; do
        echo -e "    ${RED}- ${suite}${NC}"
    done
    echo ""
    exit 1
else
    echo -e "  ${GREEN}All tests passed!${NC}"
    echo ""
    exit 0
fi
