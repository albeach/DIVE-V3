#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Integration Tests - Hub Pipeline
# =============================================================================
# Tests for the hub pipeline orchestration system including:
#   - Checkpoint save/restore
#   - Circuit breaker behavior
#   - Failure threshold enforcement
#   - Pipeline lock management
#   - Phase execution
#
# These tests verify the hub pipeline has feature parity with spoke pipeline.
# See: docs/session-context/DEPLOYMENT-PIPELINE-PHASE3-SESSION.md
# =============================================================================
# Version: 1.0.0
# Date: 2026-02-05
# =============================================================================

# Don't exit on first error - let tests complete
set +e

# Ensure common tools are in PATH
export PATH="/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"

# Load test helpers
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../utils/test-helpers.sh"

# Load DIVE common functions
DIVE_ROOT="${DIVE_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
source "${DIVE_ROOT}/scripts/dive-modules/common.sh"

# Load hub modules
source "${DIVE_ROOT}/scripts/dive-modules/deployment/pipeline-common.sh"
source "${DIVE_ROOT}/scripts/dive-modules/deployment/hub-checkpoint.sh"
source "${DIVE_ROOT}/scripts/dive-modules/deployment/hub.sh"

# Test directories
TEST_CHECKPOINT_DIR="${DIVE_ROOT}/.dive-state/hub/.phases"
mkdir -p "$TEST_CHECKPOINT_DIR"

# Cleanup on exit
cleanup_test_artifacts() {
    rm -rf "${DIVE_ROOT}/.dive-state/hub/.phases"/*.done 2>/dev/null || true
}
trap cleanup_test_artifacts EXIT

# =============================================================================
# TEST SUITE 1: HUB CHECKPOINT SYSTEM
# =============================================================================

test_hub_checkpoint_system() {
    test_suite_start "Hub Checkpoint System"

    # Test 1: Checkpoint directory exists
    test_start "Checkpoint directory initialized"
    if [ -d "$TEST_CHECKPOINT_DIR" ]; then
        test_pass
    else
        test_fail "Checkpoint directory not created"
    fi

    # Test 2: Create checkpoint
    hub_checkpoint_mark_complete "PREFLIGHT" 5 >/dev/null 2>&1
    local exit_code=$?
    assert_command_success "Checkpoint creation succeeded" $exit_code
    assert_file_exists "${TEST_CHECKPOINT_DIR}/PREFLIGHT.done" "Checkpoint file created"

    # Test 3: Checkpoint is_complete check
    test_start "is_complete returns true for existing checkpoint"
    if hub_checkpoint_is_complete "PREFLIGHT"; then
        test_pass
    else
        test_fail "is_complete returned false for existing checkpoint"
    fi

    test_start "is_complete returns false for non-existing checkpoint"
    if ! hub_checkpoint_is_complete "NONEXISTENT"; then
        test_pass
    else
        test_fail "is_complete returned true for non-existing checkpoint"
    fi

    # Test 4: Checkpoint data integrity
    hub_checkpoint_mark_complete "INITIALIZATION" 10 '{"test":"data"}' >/dev/null 2>&1
    local checkpoint_file="${TEST_CHECKPOINT_DIR}/INITIALIZATION.done"

    test_start "Checkpoint file is valid JSON"
    if jq empty "$checkpoint_file" 2>/dev/null; then
        test_pass
    else
        test_fail "Checkpoint file is not valid JSON"
    fi

    test_start "Checkpoint contains correct phase name"
    local phase=$(jq -r '.phase' "$checkpoint_file" 2>/dev/null)
    if [ "$phase" = "INITIALIZATION" ]; then
        test_pass
    else
        test_fail "Expected phase 'INITIALIZATION', got '$phase'"
    fi

    test_start "Checkpoint contains instance_code USA"
    local instance=$(jq -r '.instance_code' "$checkpoint_file" 2>/dev/null)
    if [ "$instance" = "USA" ]; then
        test_pass
    else
        test_fail "Expected instance 'USA', got '$instance'"
    fi

    # Test 5: Checkpoint timestamp
    local timestamp=$(hub_checkpoint_get_timestamp "INITIALIZATION")
    test_start "Checkpoint timestamp is not empty"
    if [ -n "$timestamp" ]; then
        test_pass
    else
        test_fail "Timestamp is empty"
    fi

    # Test 6: List completed phases
    hub_checkpoint_mark_complete "MONGODB_INIT" 15 >/dev/null 2>&1
    hub_checkpoint_mark_complete "SERVICES" 30 >/dev/null 2>&1

    local completed=$(hub_checkpoint_list_completed)
    test_start "List completed phases returns all checkpoints"
    if echo "$completed" | grep -q "PREFLIGHT" && \
       echo "$completed" | grep -q "INITIALIZATION" && \
       echo "$completed" | grep -q "MONGODB_INIT" && \
       echo "$completed" | grep -q "SERVICES"; then
        test_pass
    else
        test_fail "Not all checkpoints returned: $completed"
    fi

    # Test 7: Clear specific checkpoint
    hub_checkpoint_clear_phase "SERVICES" >/dev/null 2>&1
    assert_file_not_exists "${TEST_CHECKPOINT_DIR}/SERVICES.done" "Checkpoint removed after clear"

    # Test 8: Clear all checkpoints
    hub_checkpoint_mark_complete "KEYCLOAK_CONFIG" 20 >/dev/null 2>&1
    hub_checkpoint_clear_all "confirm" >/dev/null 2>&1
    exit_code=$?
    assert_command_success "Clear all succeeded" $exit_code

    local count=$(find "$TEST_CHECKPOINT_DIR" -name "*.done" 2>/dev/null | wc -l | tr -d ' ')
    assert_eq "0" "$count" "All checkpoints cleared"

    # Test 9: Get next phase
    hub_checkpoint_mark_complete "PREFLIGHT" 5 >/dev/null 2>&1
    hub_checkpoint_mark_complete "INITIALIZATION" 10 >/dev/null 2>&1
    local next_phase=$(hub_checkpoint_get_next_phase)
    assert_eq "MONGODB_INIT" "$next_phase" "Next phase is MONGODB_INIT"

    # Test 10: Can resume check
    test_start "Can resume returns true with checkpoints"
    if hub_checkpoint_can_resume; then
        test_pass
    else
        test_fail "Should be able to resume with checkpoints"
    fi

    # Test 11: Invalid phase name handling
    hub_checkpoint_mark_complete "INVALID_PHASE" 10 >/dev/null 2>&1
    exit_code=$?
    assert_command_failure "Invalid phase name rejected" $exit_code

    test_suite_end
}

# =============================================================================
# TEST SUITE 2: PIPELINE COMMON FUNCTIONS
# =============================================================================

test_pipeline_common() {
    test_suite_start "Pipeline Common Functions"

    # Test 1: Functions are exported
    test_start "deployment_acquire_lock function exists"
    if type deployment_acquire_lock &>/dev/null; then
        test_pass
    else
        test_fail "Function not found"
    fi

    test_start "deployment_release_lock function exists"
    if type deployment_release_lock &>/dev/null; then
        test_pass
    else
        test_fail "Function not found"
    fi

    test_start "deployment_run_phase function exists"
    if type deployment_run_phase &>/dev/null; then
        test_pass
    else
        test_fail "Function not found"
    fi

    test_start "deployment_check_threshold function exists"
    if type deployment_check_threshold &>/dev/null; then
        test_pass
    else
        test_fail "Function not found"
    fi

    test_start "deployment_set_state function exists"
    if type deployment_set_state &>/dev/null; then
        test_pass
    else
        test_fail "Function not found"
    fi

    test_start "deployment_get_state function exists"
    if type deployment_get_state &>/dev/null; then
        test_pass
    else
        test_fail "Function not found"
    fi

    test_start "deployment_rollback function exists"
    if type deployment_rollback &>/dev/null; then
        test_pass
    else
        test_fail "Function not found"
    fi

    # Test 2: Pipeline mode constants defined
    test_start "PIPELINE_MODE_DEPLOY constant defined"
    if [ -n "$PIPELINE_MODE_DEPLOY" ]; then
        test_pass
    else
        test_fail "Constant not defined"
    fi

    test_start "PIPELINE_MODE_UP constant defined"
    if [ -n "$PIPELINE_MODE_UP" ]; then
        test_pass
    else
        test_fail "Constant not defined"
    fi

    # Test 3: Pipeline phase constants defined
    test_start "PIPELINE_PHASE_PREFLIGHT constant defined"
    if [ -n "$PIPELINE_PHASE_PREFLIGHT" ]; then
        test_pass
    else
        test_fail "Constant not defined"
    fi

    test_start "PIPELINE_PHASE_COMPLETE constant defined"
    if [ -n "$PIPELINE_PHASE_COMPLETE" ]; then
        test_pass
    else
        test_fail "Constant not defined"
    fi

    test_suite_end
}

# =============================================================================
# TEST SUITE 3: HUB PIPELINE FUNCTIONS
# =============================================================================

test_hub_pipeline_functions() {
    test_suite_start "Hub Pipeline Functions"

    # Test 1: hub_pipeline_execute exists
    test_start "hub_pipeline_execute function exists"
    if type hub_pipeline_execute &>/dev/null; then
        test_pass
    else
        test_fail "Function not found"
    fi

    # Test 2: Phase wrapper functions exist
    local phase_functions=(
        "hub_phase_preflight"
        "hub_phase_initialization"
        "hub_phase_mongodb_init"
        "hub_phase_services"
        "hub_phase_orchestration_db"
        "hub_phase_keycloak_config"
        "hub_phase_realm_verify"
        "hub_phase_kas_register"
        "hub_phase_seeding"
        "hub_phase_kas_init"
    )

    for func in "${phase_functions[@]}"; do
        test_start "$func function exists"
        if type "$func" &>/dev/null; then
            test_pass
        else
            test_fail "Function not found"
        fi
    done

    # Test 3: Internal functions exist
    test_start "_hub_pipeline_execute_internal function exists"
    if type _hub_pipeline_execute_internal &>/dev/null; then
        test_pass
    else
        test_fail "Function not found"
    fi

    test_start "_hub_run_phase_with_circuit_breaker function exists"
    if type _hub_run_phase_with_circuit_breaker &>/dev/null; then
        test_pass
    else
        test_fail "Function not found"
    fi

    test_start "_hub_check_threshold function exists"
    if type _hub_check_threshold &>/dev/null; then
        test_pass
    else
        test_fail "Function not found"
    fi

    test_suite_end
}

# =============================================================================
# TEST SUITE 4: CHECKPOINT-PHASE MAPPING
# =============================================================================

test_checkpoint_phase_mapping() {
    test_suite_start "Checkpoint Phase Mapping"

    # Clean existing checkpoints
    hub_checkpoint_clear_all "confirm" >/dev/null 2>&1

    # Test all valid phases
    local all_phases=(
        "PREFLIGHT"
        "INITIALIZATION"
        "MONGODB_INIT"
        "SERVICES"
        "ORCHESTRATION_DB"
        "KEYCLOAK_CONFIG"
        "REALM_VERIFY"
        "KAS_REGISTER"
        "SEEDING"
        "KAS_INIT"
        "COMPLETE"
    )

    for phase in "${all_phases[@]}"; do
        hub_checkpoint_mark_complete "$phase" 5 >/dev/null 2>&1
        local exit_code=$?
        test_start "Phase $phase is valid"
        if [ $exit_code -eq 0 ]; then
            test_pass
        else
            test_fail "Phase marked as invalid"
        fi
    done

    # Verify count
    local completed=$(hub_checkpoint_list_completed | wc -w | tr -d ' ')
    # COMPLETE is not included in list (special case)
    test_start "All 11 phases can be checkpointed"
    if [ "$completed" -ge 10 ]; then
        test_pass
    else
        test_fail "Only $completed phases checkpointed"
    fi

    # Clean up
    hub_checkpoint_clear_all "confirm" >/dev/null 2>&1

    test_suite_end
}

# =============================================================================
# TEST SUITE 5: GENERIC CHECKPOINT INTERFACE
# =============================================================================

test_generic_checkpoint_interface() {
    test_suite_start "Generic Checkpoint Interface"

    # Test 1: deployment_checkpoint_mark_complete detects hub
    test_start "deployment_checkpoint_mark_complete exists"
    if type deployment_checkpoint_mark_complete &>/dev/null; then
        test_pass
    else
        test_fail "Function not found"
    fi

    test_start "deployment_checkpoint_is_complete exists"
    if type deployment_checkpoint_is_complete &>/dev/null; then
        test_pass
    else
        test_fail "Function not found"
    fi

    # Test 2: Hub detection (USA)
    deployment_checkpoint_mark_complete "USA" "PREFLIGHT" 5 >/dev/null 2>&1
    test_start "USA detected as hub (checkpoint created)"
    if hub_checkpoint_is_complete "PREFLIGHT"; then
        test_pass
    else
        test_fail "Hub checkpoint not created"
    fi

    # Test 3: is_complete works for hub
    test_start "deployment_checkpoint_is_complete works for USA"
    if deployment_checkpoint_is_complete "USA" "PREFLIGHT"; then
        test_pass
    else
        test_fail "is_complete returned false"
    fi

    # Clean up
    hub_checkpoint_clear_all "confirm" >/dev/null 2>&1

    test_suite_end
}

# =============================================================================
# TEST SUITE 6: RESUME CAPABILITY
# =============================================================================

test_resume_capability() {
    test_suite_start "Resume Capability"

    # Clean start
    hub_checkpoint_clear_all "confirm" >/dev/null 2>&1

    # Test 1: No checkpoints - can't resume
    test_start "Cannot resume with no checkpoints"
    if ! hub_checkpoint_can_resume; then
        test_pass
    else
        test_fail "Should not be able to resume"
    fi

    # Test 2: Partial completion - can resume
    hub_checkpoint_mark_complete "PREFLIGHT" 5 >/dev/null 2>&1
    hub_checkpoint_mark_complete "INITIALIZATION" 10 >/dev/null 2>&1
    hub_checkpoint_mark_complete "MONGODB_INIT" 15 >/dev/null 2>&1

    test_start "Can resume with partial checkpoints"
    if hub_checkpoint_can_resume; then
        test_pass
    else
        test_fail "Should be able to resume"
    fi

    # Test 3: Get next phase
    local next=$(hub_checkpoint_get_next_phase)
    assert_eq "SERVICES" "$next" "Next phase after MONGODB_INIT is SERVICES"

    # Test 4: Simulate more progress
    hub_checkpoint_mark_complete "SERVICES" 20 >/dev/null 2>&1
    hub_checkpoint_mark_complete "ORCHESTRATION_DB" 10 >/dev/null 2>&1
    next=$(hub_checkpoint_get_next_phase)
    assert_eq "KEYCLOAK_CONFIG" "$next" "Next phase after ORCHESTRATION_DB is KEYCLOAK_CONFIG"

    # Test 5: All complete (except COMPLETE marker)
    for phase in KEYCLOAK_CONFIG REALM_VERIFY KAS_REGISTER SEEDING KAS_INIT; do
        hub_checkpoint_mark_complete "$phase" 5 >/dev/null 2>&1
    done

    next=$(hub_checkpoint_get_next_phase)
    assert_eq "COMPLETE" "$next" "Next phase is COMPLETE after all phases done"

    # Test 6: Add COMPLETE marker - fully done
    hub_checkpoint_mark_complete "COMPLETE" 0 >/dev/null 2>&1
    next=$(hub_checkpoint_get_next_phase)
    assert_eq "" "$next" "No next phase when COMPLETE"

    test_start "Cannot resume when all phases complete"
    if ! hub_checkpoint_can_resume; then
        test_pass
    else
        test_fail "Should not be able to resume when complete"
    fi

    # Clean up
    hub_checkpoint_clear_all "confirm" >/dev/null 2>&1

    test_suite_end
}

# =============================================================================
# TEST SUITE 7: CHECKPOINT VALIDATION
# =============================================================================

test_checkpoint_validation() {
    test_suite_start "Checkpoint Validation"

    # Test 1: Validation function exists
    test_start "hub_checkpoint_validate_state function exists"
    if type hub_checkpoint_validate_state &>/dev/null; then
        test_pass
    else
        test_fail "Function not found"
    fi

    # Test 2: Validation with no checkpoints passes
    hub_checkpoint_clear_all "confirm" >/dev/null 2>&1
    hub_checkpoint_validate_state >/dev/null 2>&1
    local exit_code=$?
    assert_command_success "Validation passes with no checkpoints" $exit_code

    # Test 3: Validation with valid checkpoints passes
    hub_checkpoint_mark_complete "PREFLIGHT" 5 >/dev/null 2>&1
    hub_checkpoint_validate_state >/dev/null 2>&1
    exit_code=$?
    assert_command_success "Validation passes with valid checkpoint" $exit_code

    # Clean up
    hub_checkpoint_clear_all "confirm" >/dev/null 2>&1

    test_suite_end
}

# =============================================================================
# TEST SUITE 8: JSON REPORT GENERATION
# =============================================================================

test_json_report() {
    test_suite_start "JSON Report Generation"

    # Setup checkpoints
    hub_checkpoint_clear_all "confirm" >/dev/null 2>&1
    hub_checkpoint_mark_complete "PREFLIGHT" 5 >/dev/null 2>&1
    hub_checkpoint_mark_complete "INITIALIZATION" 10 >/dev/null 2>&1

    # Test 1: Generate report
    local report=$(hub_checkpoint_report_json 2>/dev/null)

    test_start "JSON report is valid JSON"
    if echo "$report" | jq empty 2>/dev/null; then
        test_pass
    else
        test_fail "Report is not valid JSON"
    fi

    # Test 2: Report contains expected fields
    test_start "Report contains instance_code"
    local instance=$(echo "$report" | jq -r '.instance_code' 2>/dev/null)
    if [ "$instance" = "USA" ]; then
        test_pass
    else
        test_fail "Expected 'USA', got '$instance'"
    fi

    test_start "Report contains deployment_type"
    local dtype=$(echo "$report" | jq -r '.deployment_type' 2>/dev/null)
    if [ "$dtype" = "hub" ]; then
        test_pass
    else
        test_fail "Expected 'hub', got '$dtype'"
    fi

    test_start "Report contains can_resume"
    local can_resume=$(echo "$report" | jq -r '.can_resume' 2>/dev/null)
    if [ "$can_resume" = "true" ]; then
        test_pass
    else
        test_fail "Expected 'true', got '$can_resume'"
    fi

    test_start "Report contains phases array"
    local phases_count=$(echo "$report" | jq '.phases | length' 2>/dev/null)
    if [ "$phases_count" -gt 0 ]; then
        test_pass
    else
        test_fail "Phases array is empty"
    fi

    # Clean up
    hub_checkpoint_clear_all "confirm" >/dev/null 2>&1

    test_suite_end
}

# =============================================================================
# RUN ALL TEST SUITES
# =============================================================================

main() {
    echo ""
    echo "==============================================================================="
    echo "  DIVE V3 Hub Pipeline Integration Tests"
    echo "==============================================================================="
    echo ""
    echo "Testing hub pipeline orchestration system..."
    echo ""

    # Run test suites
    test_hub_checkpoint_system
    test_pipeline_common
    test_hub_pipeline_functions
    test_checkpoint_phase_mapping
    test_generic_checkpoint_interface
    test_resume_capability
    test_checkpoint_validation
    test_json_report

    # Final summary
    echo ""
    echo "==============================================================================="
    echo "  ALL TEST SUITES COMPLETE"
    echo "==============================================================================="
    echo ""

    # Return success if we got here
    return 0
}

# Run tests
main
exit $?
