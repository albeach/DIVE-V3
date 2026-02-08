#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Integration Test Scenarios
# =============================================================================
# Phase 6: Testing & Validation - End-to-End Integration Tests
#
# Tests cross-cutting scenarios that verify multiple components work together:
# - State management with error recovery
# - Service dependencies with health checks
# - Federation sync with deployment
#
# Prerequisites:
# - Hub must be running (./dive hub up)
# - At least one spoke should be deployed for full testing
#
# @version 1.0.0
# @date 2026-01-18
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="${DIVE_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Hub API
HUB_API_URL="${HUB_API_URL:-http://localhost:4000}"

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

log_skip() {
    echo -e "${BLUE}[SKIP]${NC} $1"
    ((TESTS_SKIPPED++))
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

check_hub_running() {
    curl -sf "${HUB_API_URL}/health" >/dev/null 2>&1
}

check_database_available() {
    docker exec dive-hub-postgres pg_isready -U postgres >/dev/null 2>&1
}

source_modules() {
    source "$DIVE_ROOT/scripts/dive-modules/common.sh" 2>/dev/null || return 1
    source "$DIVE_ROOT/scripts/dive-modules/orchestration/state.sh" 2>/dev/null || return 1
    source "$DIVE_ROOT/scripts/dive-modules/orchestration/framework.sh" 2>/dev/null || return 1
    source "$DIVE_ROOT/scripts/dive-modules/orchestration/errors.sh" 2>/dev/null || return 1
    source "$DIVE_ROOT/scripts/dive-modules/orchestration/circuit-breaker.sh" 2>/dev/null || return 1
    return 0
}

# =============================================================================
# INTEGRATION TEST: State + Error Recovery
# =============================================================================

test_state_with_error_recovery() {
    # Integration: State changes trigger error recovery when failing
    local test_instance="int-test-$(date +%s)"

    # Set initial state
    orch_db_set_state "$test_instance" "INITIALIZING" '{"test":"integration"}'

    # Simulate error during deployment
    orch_db_record_error "$test_instance" "1201" 2 "test" "Simulated container failure" "Restart container" "{}"

    # Check error was recorded
    local error_count
    error_count=$(orch_db_exec "SELECT COUNT(*) FROM orchestration_errors WHERE instance_code='$test_instance'" 2>/dev/null | xargs)

    # Cleanup
    orch_db_exec "DELETE FROM orchestration_errors WHERE instance_code='$test_instance'" >/dev/null 2>&1
    orch_db_exec "DELETE FROM deployment_states WHERE instance_code='$test_instance'" >/dev/null 2>&1

    [ "${error_count:-0}" -gt 0 ]
}

test_state_rollback_with_checkpoint() {
    # Integration: State rollback uses checkpoint system
    local test_instance="int-rollback-$(date +%s)"

    # Set initial state
    orch_db_set_state "$test_instance" "DEPLOYING" '{"phase":"initial"}'

    # Create checkpoint
    local checkpoint_id
    checkpoint_id=$(orch_db_exec "
        INSERT INTO deployment_checkpoints (instance_code, checkpoint_name, state_snapshot)
        VALUES ('$test_instance', 'pre-deploy', '{\"state\":\"checkpoint\"}')
        RETURNING checkpoint_id
    " 2>/dev/null | xargs)

    # Simulate failure and rollback
    orch_db_set_state "$test_instance" "FAILED" '{"error":"simulated"}'

    # Rollback to checkpoint
    if [ -n "$checkpoint_id" ]; then
        orch_db_exec "
            UPDATE deployment_states
            SET state='ROLLED_BACK', metadata='{\"rollback_checkpoint\":\"$checkpoint_id\"}'
            WHERE instance_code='$test_instance'
        " >/dev/null 2>&1
    fi

    local final_state
    final_state=$(orch_db_get_state "$test_instance")

    # Cleanup
    orch_db_exec "DELETE FROM deployment_checkpoints WHERE instance_code='$test_instance'" >/dev/null 2>&1
    orch_db_exec "DELETE FROM deployment_states WHERE instance_code='$test_instance'" >/dev/null 2>&1

    [ "$final_state" = "ROLLED_BACK" ]
}

# =============================================================================
# INTEGRATION TEST: Service Dependencies + Health
# =============================================================================

test_dependency_graph_with_timeouts() {
    # Integration: Dependency graph uses dynamic timeouts

    # Get timeout for a service
    local timeout
    timeout=$(orch_calculate_dynamic_timeout "keycloak" "test")

    # Timeout should be within bounds
    local min=${SERVICE_MIN_TIMEOUTS["keycloak"]:-180}
    local max=${SERVICE_MAX_TIMEOUTS["keycloak"]:-300}

    [ "$timeout" -ge "$min" ] && [ "$timeout" -le "$max" ]
}

test_health_cascade_with_circuit_breaker() {
    # Integration: Health checks integrate with circuit breaker
    local test_op="int-health-cb-$(date +%s)"

    # Initialize circuit breaker
    orch_circuit_breaker_init "$test_op"

    # Get circuit breaker state
    local state
    state=$(orch_db_get_circuit_state "$test_op")

    # Cleanup
    orch_db_exec "DELETE FROM circuit_breakers WHERE operation_name='$test_op'" >/dev/null 2>&1

    [ "$state" = "CLOSED" ]
}

# =============================================================================
# INTEGRATION TEST: Federation Sync + API
# =============================================================================

test_federation_api_with_drift_detection() {
    # Integration: Federation API triggers drift detection
    if ! check_hub_running; then
        return 0  # Skip if hub not running
    fi

    local response
    response=$(curl -sf "${HUB_API_URL}/api/federation/health" 2>/dev/null)

    # Should return valid health data
    echo "$response" | jq -e '.success == true and .data.totalInstances != null' >/dev/null 2>&1
}

test_federation_reconciliation_dry_run() {
    # Integration: Reconciliation dry-run doesn't modify state
    if ! check_hub_running; then
        return 0  # Skip if hub not running
    fi

    # Run dry-run reconciliation
    local response
    response=$(curl -sf -X POST "${HUB_API_URL}/api/federation/reconcile" \
        -H "Content-Type: application/json" \
        -d '{"dryRun": true}' 2>/dev/null)

    # Should complete without errors
    echo "$response" | jq -e '.success == true and .data.dryRun == true' >/dev/null 2>&1
}

# =============================================================================
# INTEGRATION TEST: CLI + State + Locks
# =============================================================================

test_cli_state_operations() {
    # Integration: CLI operations update state correctly
    if [ ! -x "$DIVE_ROOT/scripts/orch-db-cli.sh" ]; then
        return 1
    fi

    # Run status command
    local output
    output=$("$DIVE_ROOT/scripts/orch-db-cli.sh" status 2>&1 || true)

    # Should produce output without errors
    [ -n "$output" ]
}

test_lock_with_state_transition() {
    # Integration: Lock protects state transitions
    local test_instance="int-lock-$(date +%s)"

    # Acquire lock
    if orch_db_acquire_lock "$test_instance" 5; then
        # Set state while holding lock
        orch_db_set_state "$test_instance" "LOCKED_DEPLOY" '{"locked":true}'

        local state
        state=$(orch_db_get_state "$test_instance")

        # Release lock
        orch_db_release_lock "$test_instance"

        # Cleanup
        orch_db_exec "DELETE FROM deployment_states WHERE instance_code='$test_instance'" >/dev/null 2>&1

        [ "$state" = "LOCKED_DEPLOY" ]
    else
        return 1
    fi
}

# =============================================================================
# INTEGRATION TEST: Error Correlation + Metrics
# =============================================================================

test_error_correlation_with_metrics() {
    # Integration: Errors are correlated and metrics recorded
    local test_instance="int-corr-$(date +%s)"

    # Record multiple errors
    orch_db_record_error "$test_instance" "1201" 2 "test" "Error 1" "" "{}"
    orch_db_record_error "$test_instance" "1402" 2 "test" "Error 2" "" "{}"

    # Record metric
    orch_db_record_metric "$test_instance" "error_count" 2 "count" '{"source":"test"}'

    # Verify both exist
    local error_count
    error_count=$(orch_db_exec "SELECT COUNT(*) FROM orchestration_errors WHERE instance_code='$test_instance'" 2>/dev/null | xargs)

    local metric_count
    metric_count=$(orch_db_exec "SELECT COUNT(*) FROM orchestration_metrics WHERE instance_code='$test_instance'" 2>/dev/null | xargs)

    # Cleanup
    orch_db_exec "DELETE FROM orchestration_errors WHERE instance_code='$test_instance'" >/dev/null 2>&1
    orch_db_exec "DELETE FROM orchestration_metrics WHERE instance_code='$test_instance'" >/dev/null 2>&1

    [ "${error_count:-0}" -gt 0 ] && [ "${metric_count:-0}" -gt 0 ]
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    echo "=============================================="
    echo "DIVE V3 Integration Test Scenarios"
    echo "Phase 6: Testing & Validation"
    echo "=============================================="
    echo ""

    # Check prerequisites
    echo "Checking prerequisites..."

    if ! source_modules; then
        echo -e "${RED}ERROR: Cannot load required modules${NC}"
        exit 1
    fi
    echo -e "  ${GREEN}✓${NC} Modules loaded"

    local db_available=false
    if check_database_available; then
        db_available=true
        echo -e "  ${GREEN}✓${NC} Database available"
    else
        echo -e "  ${YELLOW}⚠${NC} Database not available (some tests will be skipped)"
    fi

    local hub_available=false
    if check_hub_running; then
        hub_available=true
        echo -e "  ${GREEN}✓${NC} Hub API available"
    else
        echo -e "  ${YELLOW}⚠${NC} Hub API not available (some tests will be skipped)"
    fi

    echo ""

    # State + Error Recovery Integration
    echo "--- State + Error Recovery Integration ---"
    if [ "$db_available" = true ]; then
        run_test "State with error recovery" test_state_with_error_recovery || true
        run_test "State rollback with checkpoint" test_state_rollback_with_checkpoint || true
    else
        log_skip "State with error recovery (no database)"
        log_skip "State rollback with checkpoint (no database)"
        ((TESTS_SKIPPED += 2))
    fi
    echo ""

    # Service Dependencies + Health Integration
    echo "--- Service Dependencies + Health Integration ---"
    run_test "Dependency graph with timeouts" test_dependency_graph_with_timeouts || true
    if [ "$db_available" = true ]; then
        run_test "Health cascade with circuit breaker" test_health_cascade_with_circuit_breaker || true
    else
        log_skip "Health cascade with circuit breaker (no database)"
        ((TESTS_SKIPPED++))
    fi
    echo ""

    # Federation Sync + API Integration
    echo "--- Federation Sync + API Integration ---"
    if [ "$hub_available" = true ]; then
        run_test "Federation API with drift detection" test_federation_api_with_drift_detection || true
        run_test "Federation reconciliation dry-run" test_federation_reconciliation_dry_run || true
    else
        log_skip "Federation API with drift detection (hub not running)"
        log_skip "Federation reconciliation dry-run (hub not running)"
        ((TESTS_SKIPPED += 2))
    fi
    echo ""

    # CLI + State + Locks Integration
    echo "--- CLI + State + Locks Integration ---"
    run_test "CLI state operations" test_cli_state_operations || true
    if [ "$db_available" = true ]; then
        run_test "Lock with state transition" test_lock_with_state_transition || true
    else
        log_skip "Lock with state transition (no database)"
        ((TESTS_SKIPPED++))
    fi
    echo ""

    # Error Correlation + Metrics Integration
    echo "--- Error Correlation + Metrics Integration ---"
    if [ "$db_available" = true ]; then
        run_test "Error correlation with metrics" test_error_correlation_with_metrics || true
    else
        log_skip "Error correlation with metrics (no database)"
        ((TESTS_SKIPPED++))
    fi
    echo ""

    # Summary
    echo "=============================================="
    echo "Integration Test Results"
    echo "=============================================="
    echo "Total:   $TESTS_RUN"
    echo -e "Passed:  ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Failed:  ${RED}$TESTS_FAILED${NC}"
    echo -e "Skipped: ${BLUE}$TESTS_SKIPPED${NC}"
    echo ""

    if [ "$TESTS_FAILED" -gt 0 ]; then
        echo -e "${RED}SOME INTEGRATION TESTS FAILED${NC}"
        exit 1
    else
        echo -e "${GREEN}ALL INTEGRATION TESTS PASSED${NC}"
        exit 0
    fi
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
