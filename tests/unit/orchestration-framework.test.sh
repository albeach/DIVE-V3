#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Orchestration Framework - Unit Test Suite
# =============================================================================
# Sprint 4: Testing Framework (TAP Format)
# Test coverage for orchestration/framework.sh and orchestration/state.sh
# =============================================================================
# Test Anything Protocol (TAP) format for CI/CD integration
# Run with: bash tests/unit/orchestration-framework.test.sh
# =============================================================================

# Strict error handling for tests
set -euo pipefail

# Test environment setup
export DIVE_ROOT="${DIVE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
export DIVE_TEST_MODE=true

# Load modules under test
source "${DIVE_ROOT}/scripts/dive-modules/orchestration/framework.sh"
source "${DIVE_ROOT}/scripts/dive-modules/deployment-state.sh"
source "${DIVE_ROOT}/scripts/dive-modules/orchestration/state.sh"

# Test counters
TEST_COUNT=0
PASS_COUNT=0
FAIL_COUNT=0

# Test fixtures
TEST_INSTANCE="TST"
TEST_STATE_DIR="${DIVE_ROOT}/.dive-state-test"
TEST_CHECKPOINT_DIR="${DIVE_ROOT}/.dive-checkpoints-test"

# =============================================================================
# TEST FRAMEWORK FUNCTIONS
# =============================================================================

##
# Run a test case
#
# Arguments:
#   $1 - Test name
#   $2 - Test command (bash code)
##
test() {
    local name="$1"
    local command="$2"

    ((TEST_COUNT++))

    # Execute test in subshell to isolate state
    if (eval "$command") 2>/dev/null; then
        ((PASS_COUNT++))
        echo "ok $TEST_COUNT - $name"
        return 0
    else
        ((FAIL_COUNT++))
        echo "not ok $TEST_COUNT - $name"
        return 1
    fi
}

##
# Setup test environment
##
setup() {
    # Create test directories
    mkdir -p "$TEST_STATE_DIR"
    mkdir -p "$TEST_CHECKPOINT_DIR"

    # Override state directories for testing
    export DIVE_ROOT="${DIVE_ROOT}"

    # Initialize test instance state
    orch_init_context "$TEST_INSTANCE" "Test Instance"
}

##
# Teardown test environment
##
teardown() {
    # Clean up test directories
    rm -rf "$TEST_STATE_DIR"
    rm -rf "$TEST_CHECKPOINT_DIR"
    rm -f "${DIVE_ROOT}/.dive-state/${TEST_INSTANCE}.state"
}

# =============================================================================
# TEST SUITE 1: STATE MANAGEMENT
# =============================================================================

echo "# Test Suite 1: State Management"

test "State transition validation - valid UNKNOWN→INITIALIZING" \
    "validate_state_transition 'UNKNOWN' 'INITIALIZING'"

test "State transition validation - valid INITIALIZING→DEPLOYING" \
    "validate_state_transition 'INITIALIZING' 'DEPLOYING'"

test "State transition validation - valid DEPLOYING→CONFIGURING" \
    "validate_state_transition 'DEPLOYING' 'CONFIGURING'"

test "State transition validation - valid CONFIGURING→VERIFYING" \
    "validate_state_transition 'CONFIGURING' 'VERIFYING'"

test "State transition validation - valid VERIFYING→COMPLETE" \
    "validate_state_transition 'VERIFYING' 'COMPLETE'"

test "State transition validation - valid ANY→FAILED" \
    "validate_state_transition 'DEPLOYING' 'FAILED'"

test "State transition validation - invalid COMPLETE→DEPLOYING" \
    "! validate_state_transition 'COMPLETE' 'DEPLOYING'"

test "State transition validation - invalid UNKNOWN→COMPLETE" \
    "! validate_state_transition 'UNKNOWN' 'COMPLETE'"

test "Set deployment state creates state file" \
    "set_deployment_state_enhanced '$TEST_INSTANCE' 'DEPLOYING' && [ -f .dive-state/tst.state ]"

test "Get deployment state returns correct value" \
    "set_deployment_state_enhanced '$TEST_INSTANCE' 'DEPLOYING' && [ \$(get_deployment_state '$TEST_INSTANCE') = 'DEPLOYING' ]"

test "State file contains version field" \
    "set_deployment_state_enhanced '$TEST_INSTANCE' 'DEPLOYING' && grep -q 'version=2.0' .dive-state/tst.state"

test "State file contains checksum" \
    "set_deployment_state_enhanced '$TEST_INSTANCE' 'DEPLOYING' && grep -q 'checksum=' .dive-state/tst.state"

test "State integrity validation succeeds for valid state" \
    "set_deployment_state_enhanced '$TEST_INSTANCE' 'DEPLOYING' && validate_state_integrity '$TEST_INSTANCE'"

test "Mark step complete creates step marker" \
    "mark_step_complete '$TEST_INSTANCE' 'test_step' && grep -q 'step_test_step=' .dive-state/tst.state"

test "Should skip step returns true for completed step" \
    "mark_step_complete '$TEST_INSTANCE' 'test_step' && should_skip_step '$TEST_INSTANCE' 'test_step'"

test "Should skip step returns false for pending step" \
    "! should_skip_step '$TEST_INSTANCE' 'pending_step'"

# =============================================================================
# TEST SUITE 2: CIRCUIT BREAKERS
# =============================================================================

echo "# Test Suite 2: Circuit Breakers"

test "Initialize circuit breaker sets CLOSED state" \
    "orch_init_circuit_breaker 'test_op' && [ \"\${CIRCUIT_BREAKERS['test_op']}\" = 'CLOSED' ]"

test "Initialize circuit breaker sets zero failure count" \
    "orch_init_circuit_breaker 'test_op' && [ \"\${CIRCUIT_FAILURE_COUNTS['test_op']}\" -eq 0 ]"

test "Record circuit success resets failure count" \
    "orch_init_circuit_breaker 'test_op' && \
     CIRCUIT_FAILURE_COUNTS['test_op']=2 && \
     orch_record_circuit_success 'test_op' && \
     [ \"\${CIRCUIT_FAILURE_COUNTS['test_op']}\" -eq 0 ]"

test "Circuit opens after threshold failures (3)" \
    "orch_init_circuit_breaker 'test_op' && \
     orch_record_circuit_failure 'test_op' && \
     orch_record_circuit_failure 'test_op' && \
     orch_record_circuit_failure 'test_op' && \
     [ \"\${CIRCUIT_BREAKERS['test_op']}\" = 'OPEN' ]"

test "Circuit remains closed after 2 failures" \
    "orch_init_circuit_breaker 'test_op' && \
     orch_record_circuit_failure 'test_op' && \
     orch_record_circuit_failure 'test_op' && \
     [ \"\${CIRCUIT_BREAKERS['test_op']}\" = 'CLOSED' ]"

test "Circuit transitions to half-open after timeout" \
    "orch_init_circuit_breaker 'test_op' && \
     CIRCUIT_BREAKERS['test_op']='OPEN' && \
     CIRCUIT_LAST_FAILURE_TIME['test_op']=\$((\$(date +%s) - 61)) && \
     ! orch_is_circuit_open 'test_op' && \
     [ \"\${CIRCUIT_BREAKERS['test_op']}\" = 'HALF_OPEN' ]"

test "Half-open failure immediately opens circuit" \
    "orch_init_circuit_breaker 'test_op' && \
     CIRCUIT_BREAKERS['test_op']='HALF_OPEN' && \
     orch_record_circuit_failure 'test_op' && \
     [ \"\${CIRCUIT_BREAKERS['test_op']}\" = 'OPEN' ]"

test "Half-open success closes circuit after threshold (2)" \
    "orch_init_circuit_breaker 'test_op' && \
     CIRCUIT_BREAKERS['test_op']='HALF_OPEN' && \
     orch_record_circuit_success 'test_op' && \
     orch_record_circuit_success 'test_op' && \
     [ \"\${CIRCUIT_BREAKERS['test_op']}\" = 'CLOSED' ]"

test "Count open circuit breakers returns correct count" \
    "orch_init_circuit_breaker 'op1' && \
     orch_init_circuit_breaker 'op2' && \
     orch_init_circuit_breaker 'op3' && \
     CIRCUIT_BREAKERS['op1']='OPEN' && \
     CIRCUIT_BREAKERS['op2']='OPEN' && \
     [ \$(orch_count_open_circuit_breakers) -eq 2 ]"

# =============================================================================
# TEST SUITE 3: DEPENDENCY RESOLUTION
# =============================================================================

echo "# Test Suite 3: Dependency Resolution"

test "Service with no dependencies resolves to itself" \
    "[ \"\$(orch_resolve_dependencies 'postgres')\" = 'postgres' ]"

test "Service with single dependency resolves correctly" \
    "deps=\$(orch_resolve_dependencies 'keycloak') && \
     echo \"\$deps\" | grep -q 'postgres' && \
     echo \"\$deps\" | grep -q 'keycloak'"

test "Backend dependencies include all required services" \
    "deps=\$(orch_resolve_dependencies 'backend') && \
     echo \"\$deps\" | grep -q 'postgres' && \
     echo \"\$deps\" | grep -q 'mongodb' && \
     echo \"\$deps\" | grep -q 'redis' && \
     echo \"\$deps\" | grep -q 'keycloak' && \
     echo \"\$deps\" | grep -q 'backend'"

test "Frontend dependencies include backend" \
    "deps=\$(orch_resolve_dependencies 'frontend') && \
     echo \"\$deps\" | grep -q 'backend' && \
     echo \"\$deps\" | grep -q 'frontend'"

test "KAS dependencies include mongodb and backend" \
    "deps=\$(orch_resolve_dependencies 'kas') && \
     echo \"\$deps\" | grep -q 'mongodb' && \
     echo \"\$deps\" | grep -q 'backend' && \
     echo \"\$deps\" | grep -q 'kas'"

test "All services deployment order is valid" \
    "order=\$(orch_resolve_dependencies 'all') && \
     echo \"\$order\" | grep -q 'postgres' && \
     echo \"\$order\" | grep -q 'keycloak' && \
     echo \"\$order\" | grep -q 'backend'"

# =============================================================================
# TEST SUITE 4: ERROR RECORDING
# =============================================================================

echo "# Test Suite 4: Error Recording"

test "Record critical error increases counter" \
    "ORCH_CONTEXT['errors_critical']=0 && \
     orch_record_error 'TEST_ERR' \$ORCH_SEVERITY_CRITICAL 'Test error' 'test_component' && \
     [ \${ORCH_CONTEXT['errors_critical']} -eq 1 ]"

test "Record high error increases counter" \
    "ORCH_CONTEXT['errors_high']=0 && \
     orch_record_error 'TEST_ERR' \$ORCH_SEVERITY_HIGH 'Test error' 'test_component' && \
     [ \${ORCH_CONTEXT['errors_high']} -eq 1 ]"

test "Record medium error increases counter" \
    "ORCH_CONTEXT['errors_medium']=0 && \
     orch_record_error 'TEST_ERR' \$ORCH_SEVERITY_MEDIUM 'Test error' 'test_component' && \
     [ \${ORCH_CONTEXT['errors_medium']} -eq 1 ]"

test "Record low error increases counter" \
    "ORCH_CONTEXT['errors_low']=0 && \
     orch_record_error 'TEST_ERR' \$ORCH_SEVERITY_LOW 'Test error' 'test_component' && \
     [ \${ORCH_CONTEXT['errors_low']} -eq 1 ]"

test "Orchestration should stop on critical error" \
    "ORCH_CONTEXT['errors_critical']=1 && ! orch_should_continue"

test "Orchestration should stop on 4 high errors" \
    "ORCH_CONTEXT['errors_high']=4 && ORCH_CONTEXT['errors_critical']=0 && ! orch_should_continue"

test "Orchestration should continue on 3 high errors" \
    "ORCH_CONTEXT['errors_high']=3 && ORCH_CONTEXT['errors_critical']=0 && orch_should_continue"

test "Orchestration should continue on medium errors" \
    "ORCH_CONTEXT['errors_medium']=10 && ORCH_CONTEXT['errors_critical']=0 && ORCH_CONTEXT['errors_high']=0 && orch_should_continue"

# =============================================================================
# TEST SUITE 5: CHECKPOINT MANAGEMENT
# =============================================================================

echo "# Test Suite 5: Checkpoint Management"

test "Create checkpoint succeeds" \
    "checkpoint_id=\$(orch_create_checkpoint '$TEST_INSTANCE' \$CHECKPOINT_CONTAINER 'Test checkpoint') && \
     [ -n \"\$checkpoint_id\" ]"

test "Create checkpoint creates directory" \
    "checkpoint_id=\$(orch_create_checkpoint '$TEST_INSTANCE' \$CHECKPOINT_CONTAINER 'Test checkpoint') && \
     [ -d \".dive-checkpoints/\$checkpoint_id\" ]"

test "Create checkpoint creates metadata file" \
    "checkpoint_id=\$(orch_create_checkpoint '$TEST_INSTANCE' \$CHECKPOINT_CONTAINER 'Test checkpoint') && \
     [ -f \".dive-checkpoints/\$checkpoint_id/metadata.json\" ]"

test "Checkpoint metadata contains required fields" \
    "checkpoint_id=\$(orch_create_checkpoint '$TEST_INSTANCE' \$CHECKPOINT_COMPLETE 'Test') && \
     jq -e '.checkpoint_id and .instance_code and .level and .created_at' \".dive-checkpoints/\$checkpoint_id/metadata.json\" >/dev/null"

test "Find latest checkpoint returns most recent" \
    "orch_create_checkpoint '$TEST_INSTANCE' \$CHECKPOINT_CONTAINER 'Test 1' >/dev/null && \
     sleep 1 && \
     checkpoint_id2=\$(orch_create_checkpoint '$TEST_INSTANCE' \$CHECKPOINT_CONTAINER 'Test 2') && \
     latest=\$(orch_find_latest_checkpoint '$TEST_INSTANCE') && \
     [ \"\$latest\" = \"\$checkpoint_id2\" ]"

# =============================================================================
# TEST SUITE 6: RETRY LOGIC
# =============================================================================

echo "# Test Suite 6: Smart Retry Logic"

test "Calculate retry delay for keycloak uses progressive backoff" \
    "delay=\$(orch_calculate_retry_delay 'keycloak_health' 2 5) && \
     [ \$delay -gt 10 ]"  # Progressive: 5*2 + (2*2*2) = 10 + 8 = 18

test "Calculate retry delay for federation uses fixed + jitter" \
    "delay=\$(orch_calculate_retry_delay 'federation_config' 2 5) && \
     [ \$delay -ge 5 ] && [ \$delay -le 15 ]"  # Fixed 5 + jitter (0-5)

test "Calculate retry delay for secret uses exponential backoff" \
    "delay=\$(orch_calculate_retry_delay 'secret_fetch' 3 5) && \
     [ \$delay -ge 20 ]"  # Exponential: 5 * 2^(3-1) = 5 * 4 = 20

test "Calculate retry delay for health uses linear backoff" \
    "delay=\$(orch_calculate_retry_delay 'health_check' 3 5) && \
     [ \$delay -eq 15 ]"  # Linear: 5 * 3 = 15

test "Calculate retry delay for default uses exponential" \
    "delay=\$(orch_calculate_retry_delay 'unknown_op' 4 5) && \
     [ \$delay -ge 40 ]"  # Exponential: 5 * 2^(4-1) = 5 * 8 = 40

# =============================================================================
# TEST SUITE 7: METRICS & OBSERVABILITY
# =============================================================================

echo "# Test Suite 7: Metrics & Observability"

test "Initialize metrics sets start time" \
    "orch_init_metrics '$TEST_INSTANCE' && \
     [ -n \"\${DEPLOYMENT_METRICS[${TEST_INSTANCE}_start_time]}\" ]"

test "Initialize metrics sets error count to zero" \
    "orch_init_metrics '$TEST_INSTANCE' && \
     [ \"\${DEPLOYMENT_METRICS[${TEST_INSTANCE}_error_count]}\" -eq 0 ]"

test "Calculate failure probability returns 0-100 range" \
    "ORCH_CONTEXT['errors_critical']=0 && \
     ORCH_CONTEXT['errors_high']=0 && \
     prob=\$(orch_calculate_failure_probability '$TEST_INSTANCE') && \
     [ \$prob -ge 0 ] && [ \$prob -le 100 ]"

test "High error count increases failure probability" \
    "ORCH_CONTEXT['errors_critical']=2 && \
     ORCH_CONTEXT['errors_high']=3 && \
     ORCH_CONTEXT['start_time']=\$((\$(date +%s) - 60)) && \
     prob=\$(orch_calculate_failure_probability '$TEST_INSTANCE') && \
     [ \$prob -gt 50 ]"

test "Open circuit breakers increase failure probability" \
    "orch_init_circuit_breaker 'op1' && \
     orch_init_circuit_breaker 'op2' && \
     CIRCUIT_BREAKERS['op1']='OPEN' && \
     CIRCUIT_BREAKERS['op2']='OPEN' && \
     ORCH_CONTEXT['errors_critical']=0 && \
     ORCH_CONTEXT['errors_high']=0 && \
     ORCH_CONTEXT['start_time']=\$(date +%s) && \
     prob=\$(orch_calculate_failure_probability '$TEST_INSTANCE') && \
     [ \$prob -ge 30 ]"

# =============================================================================
# TEST SUMMARY
# =============================================================================

echo "1..$TEST_COUNT"
echo "# Tests run: $TEST_COUNT"
echo "# Passed: $PASS_COUNT"
echo "# Failed: $FAIL_COUNT"

# Cleanup
teardown

# Exit with failure if any tests failed
[ $FAIL_COUNT -eq 0 ]
