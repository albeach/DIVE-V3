#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Error Recovery Tests
# =============================================================================
# Phase 3: Error Handling & Circuit Breakers - Test Suite
#
# Tests:
#   1. Error classification
#   2. Circuit breaker state persistence (GAP-ER-001)
#   3. Circuit breaker state transitions
#   4. Auto-recovery procedures (GAP-ER-002)
#   5. Error correlation
#   6. Failure threshold policy
# =============================================================================

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="${DIVE_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Test operation name (unique per test run)
TEST_OPERATION="test_op_$(date +%s)"
TEST_INSTANCE="tst"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# =============================================================================
# TEST HELPERS
# =============================================================================

log_test() {
    echo -e "${YELLOW}[TEST]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

run_test() {
    local test_name="$1"
    local test_func="$2"

    ((TESTS_RUN++))
    log_test "$test_name"

    if $test_func; then
        log_pass "$test_name"
        return 0
    else
        log_fail "$test_name"
        return 1
    fi
}

setup_test_env() {
    # Source dependencies
    source "$DIVE_ROOT/scripts/dive-modules/common.sh" 2>/dev/null || {
        echo "ERROR: Cannot load common.sh"
        exit 1
    }

    source "$DIVE_ROOT/scripts/dive-modules/orchestration-state-db.sh" 2>/dev/null || {
        echo "ERROR: Cannot load orchestration-state-db.sh"
        exit 1
    }

    source "$DIVE_ROOT/scripts/dive-modules/error-recovery.sh" 2>/dev/null || {
        echo "ERROR: Cannot load error-recovery.sh"
        exit 1
    }
}

cleanup_test_data() {
    if orch_db_check_connection 2>/dev/null; then
        orch_db_exec "DELETE FROM circuit_breakers WHERE operation_name LIKE 'test_%'" >/dev/null 2>&1 || true
        orch_db_exec "DELETE FROM orchestration_errors WHERE instance_code='$TEST_INSTANCE'" >/dev/null 2>&1 || true
        orch_db_exec "DELETE FROM orchestration_metrics WHERE instance_code='$TEST_INSTANCE'" >/dev/null 2>&1 || true
    fi
}

# =============================================================================
# ERROR CLASSIFICATION TESTS
# =============================================================================

test_classify_transient() {
    # Test: Transient errors are classified correctly
    local result
    result=$(classify_error 1002)
    [ "$result" = "TRANSIENT" ]
}

test_classify_permanent() {
    # Test: Permanent errors are classified correctly
    local result
    result=$(classify_error 1001)
    [ "$result" = "PERMANENT" ]
}

test_classify_recoverable() {
    # Test: Recoverable errors are classified correctly
    local result
    result=$(classify_error 1101)
    [ "$result" = "RECOVERABLE" ]
}

test_classify_new_recoverable_1201() {
    # Test: New recoverable error 1201 (Container start failure)
    local result
    result=$(classify_error 1201)
    [ "$result" = "RECOVERABLE" ]
}

test_classify_new_recoverable_1401() {
    # Test: New recoverable error 1401 (Health check timeout)
    local result
    result=$(classify_error 1401)
    [ "$result" = "RECOVERABLE" ]
}

test_classify_new_recoverable_1501() {
    # Test: New recoverable error 1501 (Database connection failure)
    local result
    result=$(classify_error 1501)
    [ "$result" = "RECOVERABLE" ]
}

test_classify_new_recoverable_1106() {
    # Test: New recoverable error 1106 (Keycloak config error)
    local result
    result=$(classify_error 1106)
    [ "$result" = "RECOVERABLE" ]
}

test_classify_unknown() {
    # Test: Unknown errors are classified as UNKNOWN
    local result
    result=$(classify_error 9999)
    [ "$result" = "UNKNOWN" ]
}

# =============================================================================
# CIRCUIT BREAKER TESTS
# =============================================================================

test_circuit_breaker_init() {
    # Test: Circuit breaker initialization
    cleanup_test_data

    orch_circuit_breaker_init "${TEST_OPERATION}_init"

    local state
    state=$(orch_db_get_circuit_state "${TEST_OPERATION}_init")
    [ "$state" = "CLOSED" ]
}

test_circuit_breaker_persistence() {
    # Test: Circuit breaker state persists to database (GAP-ER-001)
    cleanup_test_data

    local op="${TEST_OPERATION}_persist"

    # Update to OPEN state
    orch_db_update_circuit_breaker "$op" "OPEN" 5 0

    # Load from database
    local loaded_state
    loaded_state=$(orch_circuit_breaker_load "$op" | cut -d'|' -f1)

    [ "$loaded_state" = "OPEN" ]
}

test_circuit_breaker_transitions() {
    # Test: Circuit breaker state transitions
    cleanup_test_data

    local op="${TEST_OPERATION}_transition"

    # CLOSED -> OPEN
    orch_db_update_circuit_breaker "$op" "CLOSED" 0 0
    orch_db_update_circuit_breaker "$op" "OPEN" 5 0
    local state1=$(orch_db_get_circuit_state "$op")

    # OPEN -> HALF_OPEN
    orch_db_exec "UPDATE circuit_breakers SET state='HALF_OPEN' WHERE operation_name='$op'" >/dev/null 2>&1
    local state2=$(orch_db_get_circuit_state "$op")

    # HALF_OPEN -> CLOSED
    orch_db_update_circuit_breaker "$op" "CLOSED" 0 3
    local state3=$(orch_db_get_circuit_state "$op")

    [ "$state1" = "OPEN" ] && [ "$state2" = "HALF_OPEN" ] && [ "$state3" = "CLOSED" ]
}

test_circuit_breaker_reset() {
    # Test: Circuit breaker reset
    cleanup_test_data

    local op="${TEST_OPERATION}_reset"

    # Set to OPEN
    orch_db_update_circuit_breaker "$op" "OPEN" 5 0

    # Reset
    orch_circuit_breaker_reset "$op"

    local state
    state=$(orch_db_get_circuit_state "$op")
    [ "$state" = "CLOSED" ]
}

test_circuit_breaker_status() {
    # Test: Circuit breaker status query
    cleanup_test_data

    local op="${TEST_OPERATION}_status"
    orch_db_update_circuit_breaker "$op" "CLOSED" 0 10

    local status_output
    status_output=$(orch_circuit_breaker_status "table" 2>&1)

    echo "$status_output" | grep -q "$op"
}

test_circuit_breaker_execute_success() {
    # Test: Circuit breaker executes command on CLOSED circuit
    cleanup_test_data

    local op="${TEST_OPERATION}_exec_success"
    orch_circuit_breaker_init "$op"

    # Execute a successful command
    local result
    result=$(orch_circuit_breaker_execute "$op" echo "success")
    local exit_code=$?

    [ $exit_code -eq 0 ]
}

test_circuit_breaker_open_fast_fail() {
    # Test: Circuit breaker fast-fails when OPEN
    cleanup_test_data

    local op="${TEST_OPERATION}_fast_fail"

    # Set circuit to OPEN with recent failure (no cooldown elapsed)
    orch_db_exec "
        INSERT INTO circuit_breakers (operation_name, state, failure_count, last_failure_time, last_state_change)
        VALUES ('$op', 'OPEN', 5, NOW(), NOW())
    " >/dev/null 2>&1

    # This should fail immediately without executing the command
    orch_circuit_breaker_execute "$op" echo "should not execute" >/dev/null 2>&1
    local exit_code=$?

    [ $exit_code -eq 2 ]  # Exit code 2 = circuit open
}

test_circuit_breaker_failure_threshold() {
    # Test: Circuit breaker opens after failure threshold
    cleanup_test_data

    local op="${TEST_OPERATION}_threshold"
    orch_circuit_breaker_init "$op"

    # Simulate failures up to threshold
    for i in {1..5}; do
        orch_circuit_breaker_execute "$op" false 2>/dev/null || true
    done

    local state
    state=$(orch_db_get_circuit_state "$op")
    [ "$state" = "OPEN" ]
}

# =============================================================================
# AUTO-RECOVERY TESTS
# =============================================================================

test_auto_recover_returns_1_for_unknown() {
    # Test: Auto-recovery returns 1 for unknown error codes
    local result
    orch_auto_recover "$TEST_INSTANCE" 9999 "{}" 2>/dev/null
    result=$?
    [ $result -eq 1 ]
}

test_auto_recover_exists_for_1201() {
    # Test: Auto-recovery procedure exists for error 1201
    # We don't actually run it (would need running containers)
    # Just verify the case exists in the code
    grep -q "1201)" "$DIVE_ROOT/scripts/dive-modules/error-recovery.sh"
}

test_auto_recover_exists_for_1401() {
    # Test: Auto-recovery procedure exists for error 1401
    grep -q "1401)" "$DIVE_ROOT/scripts/dive-modules/error-recovery.sh"
}

test_auto_recover_exists_for_1501() {
    # Test: Auto-recovery procedure exists for error 1501
    grep -q "1501)" "$DIVE_ROOT/scripts/dive-modules/error-recovery.sh"
}

test_auto_recover_exists_for_1106() {
    # Test: Auto-recovery procedure exists for error 1106
    grep -q "1106)" "$DIVE_ROOT/scripts/dive-modules/error-recovery.sh"
}

test_auto_recover_exists_for_1402() {
    # Test: Auto-recovery procedure exists for error 1402
    grep -q "1402)" "$DIVE_ROOT/scripts/dive-modules/error-recovery.sh"
}

# =============================================================================
# ERROR RECORDING TESTS
# =============================================================================

test_error_recording() {
    # Test: Errors are recorded to database
    cleanup_test_data

    orch_db_record_error "$TEST_INSTANCE" "TEST_ERR" 3 "test" "Test error" "Test remediation" "{}"

    local count
    count=$(orch_db_exec "SELECT COUNT(*) FROM orchestration_errors WHERE instance_code='$TEST_INSTANCE'" 2>/dev/null | xargs)

    [ "$count" -gt 0 ]
}

test_recovery_recording() {
    # Test: Recovery attempts are recorded as metrics
    cleanup_test_data

    orch_record_recovery "$TEST_INSTANCE" 1101 "test_recovery" "SUCCESS"

    local count
    count=$(orch_db_exec "SELECT COUNT(*) FROM orchestration_metrics WHERE instance_code='$TEST_INSTANCE' AND metric_name='auto_recovery'" 2>/dev/null | xargs)

    [ "$count" -gt 0 ]
}

# =============================================================================
# RETRY LOGIC TESTS
# =============================================================================

test_retry_succeeds_first_attempt() {
    # Test: Retry succeeds on first attempt
    local result
    result=$(orch_retry_with_backoff "test_success" echo "success")
    local exit_code=$?

    [ $exit_code -eq 0 ]
}

test_retry_fails_after_max() {
    # Test: Retry fails after max attempts
    export ORCH_MAX_RETRIES=2
    export ORCH_INITIAL_DELAY=0.1

    orch_retry_with_backoff "test_fail" false 2>/dev/null
    local exit_code=$?

    # Reset
    unset ORCH_MAX_RETRIES
    unset ORCH_INITIAL_DELAY

    [ $exit_code -eq 1 ]
}

# =============================================================================
# FAILURE THRESHOLD TESTS
# =============================================================================

test_failure_threshold_below() {
    # Test: Deployment continues when below threshold
    cleanup_test_data

    # Add some errors but below threshold
    orch_db_record_error "$TEST_INSTANCE" "LOW_ERR" 4 "test" "Low error" "" "{}"
    orch_db_record_error "$TEST_INSTANCE" "LOW_ERR" 4 "test" "Low error" "" "{}"

    orch_check_failure_threshold "$TEST_INSTANCE"
    local result=$?

    [ $result -eq 0 ]
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    echo "=============================================="
    echo "DIVE V3 Error Recovery Test Suite"
    echo "Phase 3: Error Handling & Circuit Breakers"
    echo "=============================================="
    echo ""

    # Setup
    setup_test_env

    # Check database is available
    if ! orch_db_check_connection 2>/dev/null; then
        echo -e "${RED}ERROR: Database not available. Ensure Hub is running.${NC}"
        echo "  ./dive hub up"
        exit 1
    fi

    echo "Database: Connected"
    echo ""

    # Error Classification Tests
    echo "--- Error Classification ---"
    run_test "Classify transient error" test_classify_transient || true
    run_test "Classify permanent error" test_classify_permanent || true
    run_test "Classify recoverable error" test_classify_recoverable || true
    run_test "Classify new recoverable 1201" test_classify_new_recoverable_1201 || true
    run_test "Classify new recoverable 1401" test_classify_new_recoverable_1401 || true
    run_test "Classify new recoverable 1501" test_classify_new_recoverable_1501 || true
    run_test "Classify new recoverable 1106" test_classify_new_recoverable_1106 || true
    run_test "Classify unknown error" test_classify_unknown || true
    echo ""

    # Circuit Breaker Tests
    echo "--- Circuit Breaker (GAP-ER-001) ---"
    run_test "Circuit breaker init" test_circuit_breaker_init || true
    run_test "Circuit breaker persistence" test_circuit_breaker_persistence || true
    run_test "Circuit breaker transitions" test_circuit_breaker_transitions || true
    run_test "Circuit breaker reset" test_circuit_breaker_reset || true
    run_test "Circuit breaker status" test_circuit_breaker_status || true
    run_test "Circuit breaker execute success" test_circuit_breaker_execute_success || true
    run_test "Circuit breaker open fast fail" test_circuit_breaker_open_fast_fail || true
    run_test "Circuit breaker failure threshold" test_circuit_breaker_failure_threshold || true
    echo ""

    # Auto-Recovery Tests
    echo "--- Auto-Recovery (GAP-ER-002) ---"
    run_test "Auto-recover returns 1 for unknown" test_auto_recover_returns_1_for_unknown || true
    run_test "Auto-recover exists for 1201" test_auto_recover_exists_for_1201 || true
    run_test "Auto-recover exists for 1401" test_auto_recover_exists_for_1401 || true
    run_test "Auto-recover exists for 1501" test_auto_recover_exists_for_1501 || true
    run_test "Auto-recover exists for 1106" test_auto_recover_exists_for_1106 || true
    run_test "Auto-recover exists for 1402" test_auto_recover_exists_for_1402 || true
    echo ""

    # Error Recording Tests
    echo "--- Error Recording ---"
    run_test "Error recording" test_error_recording || true
    run_test "Recovery recording" test_recovery_recording || true
    echo ""

    # Retry Logic Tests
    echo "--- Retry Logic ---"
    run_test "Retry succeeds first attempt" test_retry_succeeds_first_attempt || true
    run_test "Retry fails after max" test_retry_fails_after_max || true
    echo ""

    # Failure Threshold Tests
    echo "--- Failure Threshold ---"
    run_test "Failure threshold below" test_failure_threshold_below || true
    echo ""

    # Cleanup
    cleanup_test_data

    # Summary
    echo "=============================================="
    echo "Test Results"
    echo "=============================================="
    echo "Total:  $TESTS_RUN"
    echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
    echo ""

    if [ "$TESTS_FAILED" -gt 0 ]; then
        echo -e "${RED}SOME TESTS FAILED${NC}"
        exit 1
    else
        echo -e "${GREEN}ALL TESTS PASSED${NC}"
        exit 0
    fi
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
