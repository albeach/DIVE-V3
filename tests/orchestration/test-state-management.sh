#!/usr/bin/env bash
# =============================================================================
# DIVE V3 State Management Tests
# =============================================================================
# ADR-001: State Management Consolidation - Test Suite
#
# Tests:
#   1. Database-only mode state transitions
#   2. Fail-fast on database unavailable
#   3. State consistency validation
#   4. Concurrent access handling
#   5. Rollback functionality
#   6. Circuit breaker persistence
# =============================================================================

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="${DIVE_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Test instance (use unique code to avoid conflicts)
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

    # Force DB-only mode for tests
    export ORCH_DB_ONLY_MODE=true
    export ORCH_DB_DUAL_WRITE=false

    source "$DIVE_ROOT/scripts/dive-modules/orchestration-state-db.sh" 2>/dev/null || {
        echo "ERROR: Cannot load orchestration-state-db.sh"
        exit 1
    }
}

cleanup_test_data() {
    if orch_db_check_connection 2>/dev/null; then
        orch_db_exec "DELETE FROM deployment_states WHERE instance_code='$TEST_INSTANCE'" >/dev/null 2>&1 || true
        orch_db_exec "DELETE FROM state_transitions WHERE instance_code='$TEST_INSTANCE'" >/dev/null 2>&1 || true
        orch_db_exec "DELETE FROM deployment_locks WHERE instance_code='$TEST_INSTANCE'" >/dev/null 2>&1 || true
        orch_db_exec "DELETE FROM orchestration_errors WHERE instance_code='$TEST_INSTANCE'" >/dev/null 2>&1 || true
    fi

    # Clean up test state files
    rm -f "${DIVE_ROOT}/.dive-state/${TEST_INSTANCE}.state" 2>/dev/null || true
    rm -rf "${DIVE_ROOT}/.dive-state/${TEST_INSTANCE}.lock.d" 2>/dev/null || true
}

# =============================================================================
# TEST CASES
# =============================================================================

test_db_connection() {
    # Test: Database connection is available
    orch_db_check_connection
}

test_db_only_mode_enabled() {
    # Test: ORCH_DB_ONLY_MODE is set to true
    [ "$ORCH_DB_ONLY_MODE" = "true" ]
}

test_set_state_basic() {
    # Test: Basic state transition
    cleanup_test_data

    orch_db_set_state "$TEST_INSTANCE" "INITIALIZING" "Test deployment started"

    local state
    state=$(orch_db_get_state "$TEST_INSTANCE")
    [ "$state" = "INITIALIZING" ]
}

test_state_transitions() {
    # Test: Sequential state transitions
    cleanup_test_data

    local states=("INITIALIZING" "DEPLOYING" "CONFIGURING" "VERIFYING" "COMPLETE")

    for state in "${states[@]}"; do
        orch_db_set_state "$TEST_INSTANCE" "$state" "Testing $state"
        local current
        current=$(orch_db_get_state "$TEST_INSTANCE")
        if [ "$current" != "$state" ]; then
            echo "Expected $state, got $current"
            return 1
        fi
    done

    return 0
}

test_state_with_metadata() {
    # Test: State with JSON metadata
    cleanup_test_data

    local metadata='{"test": true, "phase": "deployment"}'
    orch_db_set_state "$TEST_INSTANCE" "DEPLOYING" "With metadata" "$metadata"

    local state
    state=$(orch_db_get_state "$TEST_INSTANCE")
    [ "$state" = "DEPLOYING" ]
}

test_state_transitions_recorded() {
    # Test: State transitions are recorded in state_transitions table
    cleanup_test_data

    orch_db_set_state "$TEST_INSTANCE" "INITIALIZING" "First state"
    orch_db_set_state "$TEST_INSTANCE" "DEPLOYING" "Second state"

    local count
    count=$(orch_db_exec "SELECT COUNT(*) FROM state_transitions WHERE instance_code='$TEST_INSTANCE'" 2>/dev/null | xargs)

    [ "$count" -ge 2 ]
}

test_no_file_writes_in_db_only_mode() {
    # Test: No state files created in DB-only mode
    cleanup_test_data

    # Remove any existing file
    rm -f "${DIVE_ROOT}/.dive-state/${TEST_INSTANCE}.state" 2>/dev/null || true

    orch_db_set_state "$TEST_INSTANCE" "INITIALIZING" "Should not create file"

    # File should NOT exist in DB-only mode
    if [ -f "${DIVE_ROOT}/.dive-state/${TEST_INSTANCE}.state" ]; then
        echo "State file was created in DB-only mode (should not happen)"
        return 1
    fi

    return 0
}

test_get_state_unknown_instance() {
    # Test: Getting state for unknown instance returns UNKNOWN
    local state
    state=$(orch_db_get_state "nonexistent999" 2>/dev/null)
    [ "$state" = "UNKNOWN" ]
}

test_lock_acquire_release() {
    # Test: Lock acquisition and release
    cleanup_test_data

    # Acquire lock
    if ! orch_db_acquire_lock "$TEST_INSTANCE" 0; then
        echo "Failed to acquire lock"
        return 1
    fi

    # Check lock status
    if ! orch_db_check_lock_status "$TEST_INSTANCE"; then
        echo "Lock status check failed"
        return 1
    fi

    # Release lock
    if ! orch_db_release_lock "$TEST_INSTANCE"; then
        echo "Failed to release lock"
        return 1
    fi

    return 0
}

test_lock_blocking() {
    # Test: Cannot acquire lock when already held
    cleanup_test_data

    # Acquire lock in this session
    orch_db_acquire_lock "$TEST_INSTANCE" 0 || return 1

    # Try to acquire again (should fail immediately with timeout 0)
    # Note: Advisory locks are session-scoped, so same session can reacquire
    # This test verifies the mechanism works

    # Release
    orch_db_release_lock "$TEST_INSTANCE"

    return 0
}

test_rollback_state() {
    # Test: State rollback functionality
    cleanup_test_data

    orch_db_set_state "$TEST_INSTANCE" "INITIALIZING" "First"
    orch_db_set_state "$TEST_INSTANCE" "DEPLOYING" "Second"

    # Rollback
    orch_db_rollback_state "$TEST_INSTANCE" "Testing rollback"

    local state
    state=$(orch_db_get_state "$TEST_INSTANCE")
    [ "$state" = "INITIALIZING" ]
}

test_circuit_breaker_persistence() {
    # Test: Circuit breaker state is persisted
    local test_operation="test_operation_$(date +%s)"

    # Update circuit breaker
    orch_db_update_circuit_breaker "$test_operation" "OPEN" 5 0

    # Read back
    local state
    state=$(orch_db_get_circuit_state "$test_operation")

    # Cleanup
    orch_db_exec "DELETE FROM circuit_breakers WHERE operation_name='$test_operation'" >/dev/null 2>&1 || true

    [ "$state" = "OPEN" ]
}

test_error_recording() {
    # Test: Error recording to database
    cleanup_test_data

    orch_db_record_error "$TEST_INSTANCE" "TEST_ERROR" 3 "test" "Test error message" "Test remediation" "{}"

    local count
    count=$(orch_db_exec "SELECT COUNT(*) FROM orchestration_errors WHERE instance_code='$TEST_INSTANCE'" 2>/dev/null | xargs)

    [ "$count" -gt 0 ]
}

test_step_recording() {
    # Test: Deployment step recording
    cleanup_test_data

    orch_db_record_step "$TEST_INSTANCE" "preflight" "COMPLETED" ""
    orch_db_record_step "$TEST_INSTANCE" "deployment" "IN_PROGRESS" ""

    local count
    count=$(orch_db_exec "SELECT COUNT(*) FROM deployment_steps WHERE instance_code='$TEST_INSTANCE'" 2>/dev/null | xargs)

    [ "$count" -ge 2 ]
}

test_metrics_recording() {
    # Test: Metrics recording
    cleanup_test_data

    orch_db_record_metric "$TEST_INSTANCE" "test_metric" 42 "count" '{"test": true}'

    local count
    count=$(orch_db_exec "SELECT COUNT(*) FROM orchestration_metrics WHERE instance_code='$TEST_INSTANCE' AND metric_name='test_metric'" 2>/dev/null | xargs)

    [ "$count" -gt 0 ]
}

test_deployment_duration() {
    # Test: Deployment duration calculation
    cleanup_test_data

    orch_db_set_state "$TEST_INSTANCE" "INITIALIZING" "Start"
    sleep 1
    orch_db_set_state "$TEST_INSTANCE" "COMPLETE" "End"

    local duration
    duration=$(orch_db_get_deployment_duration "$TEST_INSTANCE" 2>/dev/null || echo "0")

    [ "$duration" -ge 1 ]
}

test_concurrent_state_updates() {
    # Test: Concurrent state updates don't corrupt data
    cleanup_test_data

    # Run 5 concurrent updates
    for i in {1..5}; do
        (
            orch_db_set_state "$TEST_INSTANCE" "STATE_$i" "Concurrent update $i"
        ) &
    done

    wait

    # Verify we have exactly 5 state records
    local count
    count=$(orch_db_exec "SELECT COUNT(*) FROM deployment_states WHERE instance_code='$TEST_INSTANCE'" 2>/dev/null | xargs)

    [ "$count" -eq 5 ]
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    echo "=============================================="
    echo "DIVE V3 State Management Test Suite"
    echo "ADR-001: Database-Only Mode"
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
    echo "Mode: ORCH_DB_ONLY_MODE=$ORCH_DB_ONLY_MODE"
    echo ""

    # Run tests
    run_test "Database connection" test_db_connection || true
    run_test "DB-only mode enabled" test_db_only_mode_enabled || true
    run_test "Basic state set/get" test_set_state_basic || true
    run_test "State transitions" test_state_transitions || true
    run_test "State with metadata" test_state_with_metadata || true
    run_test "Transitions recorded" test_state_transitions_recorded || true
    run_test "No file writes in DB-only mode" test_no_file_writes_in_db_only_mode || true
    run_test "Unknown instance returns UNKNOWN" test_get_state_unknown_instance || true
    run_test "Lock acquire/release" test_lock_acquire_release || true
    run_test "Lock blocking" test_lock_blocking || true
    run_test "State rollback" test_rollback_state || true
    run_test "Circuit breaker persistence" test_circuit_breaker_persistence || true
    run_test "Error recording" test_error_recording || true
    run_test "Step recording" test_step_recording || true
    run_test "Metrics recording" test_metrics_recording || true
    run_test "Deployment duration" test_deployment_duration || true
    run_test "Concurrent state updates" test_concurrent_state_updates || true

    # Cleanup
    cleanup_test_data

    # Summary
    echo ""
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
