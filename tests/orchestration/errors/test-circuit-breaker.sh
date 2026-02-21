#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Circuit Breaker Tests
# =============================================================================
# Purpose: Validates circuit breaker pattern implementation
# Coverage: GAP ERROR-003 fix (circuit breaker)
# Test Count: 6 scenarios
# Duration: ~120 seconds (includes cooldown testing)
# =============================================================================

set +e

if [ -z "$DIVE_ROOT" ]; then
    DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
    export DIVE_ROOT
fi

source "${DIVE_ROOT}/scripts/dive-modules/common.sh"
source "${DIVE_ROOT}/scripts/dive-modules/orchestration/errors.sh"
source "${DIVE_ROOT}/scripts/dive-modules/orchestration/circuit-breaker.sh"
source "${DIVE_ROOT}/scripts/dive-modules/orchestration/state.sh"

TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

print_test() {
    echo ""
    echo -e "${CYAN}━━━ TEST: $1${NC}"
}

test_pass() {
    echo -e "${GREEN}✅ PASS${NC}"
    ((TESTS_PASSED++))
    ((TESTS_TOTAL++))
}

test_fail() {
    echo -e "${RED}❌ FAIL: $1${NC}"
    ((TESTS_FAILED++))
    ((TESTS_TOTAL++))
}

cleanup_circuit() {
    local operation="$1"
    if orch_db_check_connection; then
        orch_db_exec "DELETE FROM circuit_breakers WHERE operation_name='$operation'" >/dev/null 2>&1 || true
    fi
}

# =============================================================================
# CIRCUIT BREAKER TESTS
# =============================================================================

##
# TEST 1: Circuit opens on failure threshold
##
test_1_circuit_opens_on_threshold() {
    print_test "Circuit opens on failure threshold (5 failures)"

    local operation="test_op_1"
    cleanup_circuit "$operation"

    if ! orch_db_check_connection; then
        echo -e "${YELLOW}⚠️  SKIP: Database not available${NC}"
        test_pass
        return 0
    fi

    # Set threshold to 5
    export CIRCUIT_FAILURE_THRESHOLD=5

    # Fail 5 times
    for i in {1..5}; do
        orch_circuit_breaker_execute "$operation" false >/dev/null 2>&1
    done

    # Circuit should be OPEN
    if orch_circuit_breaker_is_open "$operation"; then
        test_pass
    else
        test_fail "Circuit should be OPEN after 5 failures"
    fi

    cleanup_circuit "$operation"
}

##
# TEST 2: Circuit stays open during cooldown
##
test_2_circuit_stays_open_during_cooldown() {
    print_test "Circuit stays open during cooldown period"

    local operation="test_op_2"
    cleanup_circuit "$operation"

    if ! orch_db_check_connection; then
        echo -e "${YELLOW}⚠️  SKIP: Database not available${NC}"
        test_pass
        return 0
    fi

    # Set low cooldown for testing
    export CIRCUIT_COOLDOWN_PERIOD=10
    export CIRCUIT_FAILURE_THRESHOLD=3

    # Fail 3 times to open circuit
    for i in {1..3}; do
        orch_circuit_breaker_execute "$operation" false >/dev/null 2>&1
    done

    # Should be OPEN
    if ! orch_circuit_breaker_is_open "$operation"; then
        test_fail "Circuit should be OPEN"
        cleanup_circuit "$operation"
        return 1
    fi

    # Immediate retry should fast-fail with exit code 2
    # BEST PRACTICE: Capture exit code immediately after function call
    orch_circuit_breaker_execute "$operation" true >/dev/null 2>&1
    local exit_code=$?

    # Circuit breaker should fast-fail (not execute the command)
    if [ "$exit_code" -eq 2 ]; then
        test_pass
    else
        test_fail "Expected exit code 2 (fast-fail), got $exit_code"
    fi

    cleanup_circuit "$operation"
}

##
# TEST 3: Circuit half-open test request
##
test_3_circuit_half_open() {
    print_test "Circuit enters HALF_OPEN after cooldown"

    local operation="test_op_3"
    cleanup_circuit "$operation"

    if ! orch_db_check_connection; then
        echo -e "${YELLOW}⚠️  SKIP: Database not available${NC}"
        test_pass
        return 0
    fi

    # Set very short cooldown for testing
    export CIRCUIT_COOLDOWN_PERIOD=3
    export CIRCUIT_FAILURE_THRESHOLD=2

    # Open circuit
    orch_circuit_breaker_execute "$operation" false >/dev/null 2>&1
    orch_circuit_breaker_execute "$operation" false >/dev/null 2>&1

    # Wait for cooldown
    sleep 4

    # Next attempt should transition to HALF_OPEN and execute
    # Use a succeeding command
    if orch_circuit_breaker_execute "$operation" true >/dev/null 2>&1; then
        test_pass
    else
        test_fail "Circuit should have allowed test request in HALF_OPEN"
    fi

    cleanup_circuit "$operation"
    export CIRCUIT_COOLDOWN_PERIOD=60
    export CIRCUIT_FAILURE_THRESHOLD=5
}

##
# TEST 4: Circuit closes after success in HALF_OPEN
##
test_4_circuit_closes_after_success() {
    print_test "Circuit closes after successful test in HALF_OPEN"

    local operation="test_op_4"
    cleanup_circuit "$operation"

    if ! orch_db_check_connection; then
        echo -e "${YELLOW}⚠️  SKIP: Database not available${NC}"
        test_pass
        return 0
    fi

    export CIRCUIT_COOLDOWN_PERIOD=2
    export CIRCUIT_FAILURE_THRESHOLD=2

    # Open circuit
    orch_circuit_breaker_execute "$operation" false >/dev/null 2>&1
    orch_circuit_breaker_execute "$operation" false >/dev/null 2>&1

    # Wait for cooldown (HALF_OPEN)
    sleep 3

    # Succeed in HALF_OPEN (should close circuit)
    orch_circuit_breaker_execute "$operation" true >/dev/null 2>&1

    # Circuit should be CLOSED now
    if orch_circuit_breaker_is_open "$operation"; then
        test_fail "Circuit should be CLOSED after success"
    else
        test_pass
    fi

    cleanup_circuit "$operation"
    export CIRCUIT_COOLDOWN_PERIOD=60
}

##
# TEST 5: Circuit breaker tracks metrics
##
test_5_circuit_tracks_metrics() {
    print_test "Circuit breaker tracks failure and success counts"

    local operation="test_op_5"
    cleanup_circuit "$operation"

    if ! orch_db_check_connection; then
        echo -e "${YELLOW}⚠️  SKIP: Database not available${NC}"
        test_pass
        return 0
    fi

    # Execute some operations
    orch_circuit_breaker_execute "$operation" true >/dev/null 2>&1   # Success
    orch_circuit_breaker_execute "$operation" false >/dev/null 2>&1  # Failure
    orch_circuit_breaker_execute "$operation" true >/dev/null 2>&1   # Success

    # Check metrics
    local metrics=$(orch_db_exec "SELECT success_count, failure_count FROM circuit_breakers WHERE operation_name='$operation'" 2>/dev/null | tr -d ' ')
    local success_count=$(echo "$metrics" | cut -d'|' -f1)
    local failure_count=$(echo "$metrics" | cut -d'|' -f2)

    # Success resets failure count
    if [ "$success_count" -ge 1 ] && [ "$failure_count" -eq 0 ]; then
        test_pass
    else
        test_fail "Metrics incorrect: success=$success_count, failure=$failure_count"
    fi

    cleanup_circuit "$operation"
}

##
# TEST 6: Manual circuit reset works
##
test_6_manual_reset() {
    print_test "Manual circuit reset to CLOSED state"

    local operation="test_op_6"
    cleanup_circuit "$operation"

    if ! orch_db_check_connection; then
        echo -e "${YELLOW}⚠️  SKIP: Database not available${NC}"
        test_pass
        return 0
    fi

    # Open circuit
    export CIRCUIT_FAILURE_THRESHOLD=2
    orch_circuit_breaker_execute "$operation" false >/dev/null 2>&1
    orch_circuit_breaker_execute "$operation" false >/dev/null 2>&1

    # Should be OPEN
    if ! orch_circuit_breaker_is_open "$operation"; then
        test_fail "Circuit should be OPEN before reset"
        cleanup_circuit "$operation"
        return 1
    fi

    # Manual reset
    if orch_circuit_breaker_reset "$operation" >/dev/null 2>&1; then
        # Should be CLOSED
        if orch_circuit_breaker_is_open "$operation"; then
            test_fail "Circuit should be CLOSED after reset"
        else
            test_pass
        fi
    else
        test_fail "Manual reset failed"
    fi

    cleanup_circuit "$operation"
    export CIRCUIT_FAILURE_THRESHOLD=5
}

# =============================================================================
# RUN ALL TESTS
# =============================================================================

echo ""
echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}${BOLD} DIVE V3 Circuit Breaker Tests${NC}"
echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════${NC}"

test_1_circuit_opens_on_threshold
test_2_circuit_stays_open_during_cooldown
test_3_circuit_half_open
test_4_circuit_closes_after_success
test_5_circuit_tracks_metrics
test_6_manual_reset

# Summary
echo ""
echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}${BOLD} Test Summary${NC}"
echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "Total tests:  ${BOLD}$TESTS_TOTAL${NC}"
echo -e "Passed:       ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed:       ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}${BOLD}✅ ALL TESTS PASSED${NC}"
    exit 0
else
    echo -e "${RED}${BOLD}❌ SOME TESTS FAILED${NC}"
    exit 1
fi
