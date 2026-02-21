#!/usr/bin/env bash
# =============================================================================
# DIVE V3 E2E Tests - Full Deployment Pipeline
# =============================================================================
# Comprehensive end-to-end tests for Hub and Spoke deployment with:
# - Clean deployment
# - Resume after timeout
# - Rollback after failure
# - State consistency validation
# =============================================================================

# Don't exit on first error - let tests complete
set +e

# Load test helpers
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../utils/test-helpers.sh"

# Load DIVE common functions
DIVE_ROOT="${DIVE_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
export DIVE_ROOT
source "${DIVE_ROOT}/scripts/dive-modules/common.sh"

# Test configuration
TEST_SPOKE_CODE="TST"
TEST_SPOKE_NAME="Test Instance"
TEST_TIMEOUT=600  # 10 minutes max per test

# =============================================================================
# TEST SETUP & CLEANUP
# =============================================================================

cleanup_test_environment() {
    echo "Cleaning up test environment..."
    
    # Stop test spoke if running
    if [ -d "${DIVE_ROOT}/instances/tst" ]; then
        cd "${DIVE_ROOT}/instances/tst"
        docker compose down -v 2>/dev/null || true
        cd "$DIVE_ROOT"
    fi
    
    # Remove test instance directory
    rm -rf "${DIVE_ROOT}/instances/tst" 2>/dev/null || true
    
    # Clean Docker networks
    docker network rm dive-spoke-tst 2>/dev/null || true
    
    # Clean Terraform state
    cd "${DIVE_ROOT}/terraform/spoke" 2>/dev/null || true
    terraform workspace select default 2>/dev/null || true
    terraform workspace delete tst 2>/dev/null || true
    cd "$DIVE_ROOT"
    
    echo "Cleanup complete"
}

# Cleanup before tests
trap cleanup_test_environment EXIT

# =============================================================================
# TEST SUITE
# =============================================================================

test_suite_start "Full Deployment Pipeline E2E Tests"

# =============================================================================
# TEST 1: Clean Spoke Deployment
# =============================================================================

test_clean_spoke_deployment() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════════════════"
    echo "TEST 1: Clean Spoke Deployment"
    echo "═══════════════════════════════════════════════════════════════════════════"
    echo ""
    
    # Ensure clean slate
    cleanup_test_environment
    
    # Deploy spoke
    test_start "Deploy spoke from clean slate"
    
    local deploy_start=$(date +%s)
    local deploy_output
    deploy_output=$(run_with_timeout $TEST_TIMEOUT "${DIVE_ROOT}/dive" spoke deploy "$TEST_SPOKE_CODE" "$TEST_SPOKE_NAME" 2>&1)
    local deploy_exit=$?
    local deploy_duration=$(($(date +%s) - deploy_start))
    
    if [ $deploy_exit -eq 0 ]; then
        test_pass
        echo "       Deployment took ${deploy_duration}s"
    else
        test_fail "Deployment failed with exit code $deploy_exit"
        echo "       Last 20 lines of output:"
        echo "$deploy_output" | tail -20
        return 1
    fi
    
    # Verify containers running
    assert_container_running "dive-spoke-tst-keycloak" "Keycloak container running"
    assert_container_running "dive-spoke-tst-backend" "Backend container running"
    assert_container_running "dive-spoke-tst-frontend" "Frontend container running"
    assert_container_running "dive-spoke-tst-postgres" "PostgreSQL container running"
    assert_container_running "dive-spoke-tst-mongodb" "MongoDB container running"
    
    # Verify keyfile is a file
    assert_file_exists "${DIVE_ROOT}/instances/tst/mongo-keyfile" "MongoDB keyfile exists"
    assert_file_not_directory "${DIVE_ROOT}/instances/tst/mongo-keyfile" "MongoDB keyfile is not directory"
    
    # Verify config files generated
    assert_file_exists "${DIVE_ROOT}/instances/tst/config.json" "config.json generated"
    assert_file_exists "${DIVE_ROOT}/instances/tst/.env" ".env generated"
    assert_file_exists "${DIVE_ROOT}/instances/tst/docker-compose.yml" "docker-compose.yml generated"
    
    # Verify Keycloak realm exists (best effort - requires containers healthy)
    sleep 10  # Wait for Keycloak to fully start
    
    test_start "Keycloak realm accessible"
    local realm_check=$(docker exec dive-spoke-tst-keycloak curl -sf \
        "http://localhost:8080/realms/dive-v3-broker-tst" 2>/dev/null | \
        jq -r '.realm // empty' 2>/dev/null)
    
    if [ "$realm_check" = "dive-v3-broker-tst" ]; then
        test_pass
    else
        test_fail "Realm not accessible"
    fi
    
    # Verify deployment time is reasonable (<5 minutes target)
    test_start "Deployment completed in reasonable time (<5 minutes)"
    if [ $deploy_duration -lt 300 ]; then
        test_pass
    else
        test_fail "Deployment took ${deploy_duration}s (target: <300s)"
    fi
}

# =============================================================================
# TEST 2: Checkpoint Functionality
# =============================================================================

test_checkpoint_functionality() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════════════════"
    echo "TEST 2: Checkpoint Functionality"
    echo "═══════════════════════════════════════════════════════════════════════════"
    echo ""
    
    # Verify checkpoints were created during deployment
    assert_file_exists "${DIVE_ROOT}/instances/tst/.phases/INITIALIZATION.done" "INITIALIZATION checkpoint created"
    assert_file_exists "${DIVE_ROOT}/instances/tst/.phases/DEPLOYMENT.done" "DEPLOYMENT checkpoint created"
    assert_file_exists "${DIVE_ROOT}/instances/tst/.phases/CONFIGURATION.done" "CONFIGURATION checkpoint created"
    
    # Test checkpoint validation
    test_start "Checkpoint state validation passes"
    
    # Load checkpoint module
    source "${DIVE_ROOT}/scripts/dive-modules/spoke/pipeline/spoke-checkpoint.sh"
    
    if spoke_checkpoint_validate_state "$TEST_SPOKE_CODE" >/dev/null 2>&1; then
        test_pass
    else
        test_fail "Checkpoint validation failed"
    fi
}

# =============================================================================
# TEST 3: Resume Capability (Simulated)
# =============================================================================

test_resume_capability() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════════════════"
    echo "TEST 3: Resume Capability"
    echo "═══════════════════════════════════════════════════════════════════════════"
    echo ""
    
    # Clear CONFIGURATION checkpoint to simulate incomplete deployment
    source "${DIVE_ROOT}/scripts/dive-modules/spoke/pipeline/spoke-checkpoint.sh"
    spoke_checkpoint_clear_phase "$TEST_SPOKE_CODE" "CONFIGURATION" >/dev/null 2>&1
    spoke_checkpoint_clear_phase "$TEST_SPOKE_CODE" "VERIFICATION" >/dev/null 2>&1
    spoke_checkpoint_clear_phase "$TEST_SPOKE_CODE" "COMPLETE" >/dev/null 2>&1
    
    # Verify can resume
    test_start "Can resume after clearing later checkpoints"
    if spoke_checkpoint_can_resume "$TEST_SPOKE_CODE"; then
        test_pass
    else
        test_fail "Cannot resume"
    fi
    
    # Get next phase
    local next_phase=$(spoke_checkpoint_get_next_phase "$TEST_SPOKE_CODE")
    assert_eq "CONFIGURATION" "$next_phase" "Next phase is CONFIGURATION"
    
    # Test resume (will skip INITIALIZATION and DEPLOYMENT)
    test_start "Resume deployment skips completed phases"
    
    local resume_output
    resume_output=$(run_with_timeout $TEST_TIMEOUT "${DIVE_ROOT}/dive" spoke deploy "$TEST_SPOKE_CODE" --resume 2>&1)
    local resume_exit=$?
    
    if [ $resume_exit -eq 0 ]; then
        test_pass
    else
        test_fail "Resume deployment failed"
        echo "       Output: $(echo "$resume_output" | tail -10)"
    fi
    
    # Verify deployment is complete
    test_start "Deployment marked complete after resume"
    if spoke_checkpoint_is_complete "$TEST_SPOKE_CODE" "COMPLETE"; then
        test_pass
    else
        test_fail "COMPLETE checkpoint not created"
    fi
}

# =============================================================================
# TEST 4: Rollback Functionality
# =============================================================================

test_rollback_functionality() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════════════════"
    echo "TEST 4: Rollback Functionality"
    echo "═══════════════════════════════════════════════════════════════════════════"
    echo ""
    
    # Deploy a spoke first (use existing TST spoke)
    # Containers should already be running from previous test
    
    # Execute rollback
    test_start "Rollback stops all containers"
    
    # Load orchestration framework
    source "${DIVE_ROOT}/scripts/dive-modules/orchestration/framework.sh"
    
    if orch_rollback_complete "$TEST_SPOKE_CODE" "" "" >/dev/null 2>&1; then
        test_pass
    else
        test_fail "Rollback function failed"
    fi
    
    # Verify containers stopped
    local running_count=$(docker ps --filter "name=dive-spoke-tst-" --format "{{.Names}}" 2>/dev/null | wc -l | tr -d ' ')
    assert_eq "0" "$running_count" "All containers stopped after rollback"
    
    # Verify checkpoints cleared
    test_start "Rollback clears checkpoints"
    local checkpoint_count=$(find "${DIVE_ROOT}/instances/tst/.phases" -name "*.done" 2>/dev/null | wc -l | tr -d ' ')
    if [ "$checkpoint_count" -eq 0 ]; then
        test_pass
    else
        test_fail "Found $checkpoint_count remaining checkpoints"
    fi
}

# =============================================================================
# TEST 5: Clean Slate Rollback
# =============================================================================

test_clean_slate_rollback() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════════════════"
    echo "TEST 5: Clean Slate Rollback"
    echo "═══════════════════════════════════════════════════════════════════════════"
    echo ""
    
    # Deploy spoke again
    echo "Deploying test spoke for clean slate test..."
    run_with_timeout $TEST_TIMEOUT "${DIVE_ROOT}/dive" spoke deploy "$TEST_SPOKE_CODE" "$TEST_SPOKE_NAME" >/dev/null 2>&1
    
    # Execute clean slate rollback
    test_start "Clean slate rollback removes instance directory"
    
    source "${DIVE_ROOT}/scripts/dive-modules/orchestration/framework.sh"
    orch_rollback_complete "$TEST_SPOKE_CODE" "" "clean-slate" >/dev/null 2>&1
    
    # Verify instance directory removed
    if [ ! -d "${DIVE_ROOT}/instances/tst" ]; then
        test_pass
    else
        test_fail "Instance directory still exists"
    fi
    
    # Verify networks removed
    test_start "Clean slate removes Docker networks"
    local network_count=$(docker network ls --filter "name=dive-spoke-tst" -q 2>/dev/null | wc -l | tr -d ' ')
    if [ "$network_count" -eq 0 ]; then
        test_pass
    else
        test_fail "Found $network_count remaining networks"
    fi
}

# =============================================================================
# TEST 6: State Consistency Validation
# =============================================================================

test_state_consistency() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════════════════"
    echo "TEST 6: State Consistency Validation"
    echo "═══════════════════════════════════════════════════════════════════════════"
    echo ""
    
    # This test requires Hub to be running for DB connection
    # Skip if Hub not available
    if ! docker ps --format '{{.Names}}' | grep -q "dive-hub-postgres"; then
        test_skip "Hub not running (database required)"
        return 0
    fi
    
    # Deploy spoke
    echo "Deploying test spoke for state consistency test..."
    run_with_timeout $TEST_TIMEOUT "${DIVE_ROOT}/dive" spoke deploy "$TEST_SPOKE_CODE" "$TEST_SPOKE_NAME" >/dev/null 2>&1
    
    # Load orchestration framework
    source "${DIVE_ROOT}/scripts/dive-modules/orchestration/framework.sh"
    source "${DIVE_ROOT}/scripts/dive-modules/orchestration/state.sh"
    
    # Test 1: Determine actual state
    test_start "Can determine actual deployment state"
    local actual_state=$(orch_determine_actual_state "$TEST_SPOKE_CODE" 2>/dev/null)
    if [ -n "$actual_state" ] && [ "$actual_state" != "UNKNOWN" ]; then
        test_pass
        echo "       Detected state: $actual_state"
    else
        test_fail "Could not determine state"
    fi
    
    # Test 2: Validate state consistency
    test_start "State consistency validation runs"
    if orch_validate_state_consistency "$TEST_SPOKE_CODE" >/dev/null 2>&1; then
        test_pass
    else
        test_fail "State validation failed"
    fi
    
    # Test 3: Detect PARTIAL state
    # Stop containers but leave config files
    docker compose -f "${DIVE_ROOT}/instances/tst/docker-compose.yml" stop keycloak 2>/dev/null || true
    
    local state_with_stopped=$(orch_determine_actual_state "$TEST_SPOKE_CODE" 2>/dev/null)
    
    test_start "Detects degraded state when services stopped"
    if [ "$state_with_stopped" != "COMPLETE" ]; then
        test_pass
        echo "       Detected: $state_with_stopped"
    else
        test_fail "Should detect non-COMPLETE state"
    fi
    
    # Cleanup
    cleanup_test_environment
}

# =============================================================================
# TEST 7: Performance Benchmarking
# =============================================================================

test_performance_benchmarking() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════════════════"
    echo "TEST 7: Performance Benchmarking"
    echo "═══════════════════════════════════════════════════════════════════════════"
    echo ""
    
    # This test measures deployment timing
    cleanup_test_environment
    
    test_start "Spoke deployment completes in target time (<5 minutes)"
    
    local start_time=$(date +%s)
    run_with_timeout $TEST_TIMEOUT "${DIVE_ROOT}/dive" spoke deploy "$TEST_SPOKE_CODE" "$TEST_SPOKE_NAME" >/dev/null 2>&1
    local deploy_exit=$?
    local duration=$(($(date +%s) - start_time))
    
    if [ $deploy_exit -eq 0 ]; then
        if [ $duration -lt 300 ]; then
            test_pass
            echo "       Deployment took ${duration}s (target: <300s)"
        else
            test_fail "Deployment took ${duration}s (exceeds 300s target)"
        fi
    else
        test_fail "Deployment failed"
    fi
    
    # Check individual phase timings from logs
    echo ""
    echo "  Phase Timing Breakdown:"
    
    if [ -d "${DIVE_ROOT}/instances/tst/.phases" ]; then
        for phase_file in "${DIVE_ROOT}/instances/tst/.phases"/*.done; do
            if [ -f "$phase_file" ]; then
                local phase=$(basename "$phase_file" .done)
                local phase_duration=$(jq -r '.duration_seconds // 0' "$phase_file" 2>/dev/null)
                echo "    • $phase: ${phase_duration}s"
            fi
        done
    fi
}

# =============================================================================
# RUN ALL TESTS
# =============================================================================

echo ""
echo "════════════════════════════════════════════════════════════════════════════"
echo "  DIVE V3 Deployment Pipeline E2E Test Suite"
echo "  Testing: Hub + Spoke deployment, resume, rollback, state validation"
echo "════════════════════════════════════════════════════════════════════════════"
echo ""

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v docker &>/dev/null; then
    echo "ERROR: docker not found"
    exit 1
fi

if ! command -v jq &>/dev/null; then
    echo "ERROR: jq not found (required for JSON parsing)"
    exit 1
fi

if [ ! -f "${DIVE_ROOT}/dive" ]; then
    echo "ERROR: DIVE CLI not found at ${DIVE_ROOT}/dive"
    exit 1
fi

echo "✓ All prerequisites met"
echo ""

# Run tests
test_clean_spoke_deployment
test_checkpoint_functionality
test_resume_capability
test_rollback_functionality
test_clean_slate_rollback
test_state_consistency
test_performance_benchmarking

# Print final summary
test_suite_end

# Return exit code
exit $?
