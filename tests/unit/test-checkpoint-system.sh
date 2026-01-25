#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Unit Tests - Checkpoint System
# =============================================================================
# Tests for checkpoint-based deployment resume functionality
# =============================================================================

# Don't exit on first error - let tests complete
set +e

# Ensure common tools are in PATH (portable for macOS + Linux)
export PATH="/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"

# Load test helpers
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../utils/test-helpers.sh"

# Load DIVE common functions
DIVE_ROOT="${DIVE_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
source "${DIVE_ROOT}/scripts/dive-modules/common.sh"

# Load checkpoint module
source "${DIVE_ROOT}/scripts/dive-modules/spoke/pipeline/spoke-checkpoint.sh"

# Test instance
TEST_INSTANCE="TST"
TEST_DIR="${DIVE_ROOT}/instances/tst"
mkdir -p "$TEST_DIR"

# Cleanup on exit
trap "rm -rf '$TEST_DIR'" EXIT

# =============================================================================
# TEST SUITE
# =============================================================================

test_suite_start "Checkpoint System"

# Test 1: Checkpoint creation
test_checkpoint_create() {
    spoke_checkpoint_mark_complete "$TEST_INSTANCE" "INITIALIZATION" 10 >/dev/null 2>&1
    local exit_code=$?
    
    assert_command_success "Checkpoint creation succeeded" $exit_code
    assert_file_exists "$TEST_DIR/.phases/INITIALIZATION.done" "Checkpoint file created"
}

# Test 2: Checkpoint is_complete check
test_checkpoint_is_complete() {
    # Create checkpoint first
    spoke_checkpoint_mark_complete "$TEST_INSTANCE" "DEPLOYMENT" 20 >/dev/null 2>&1
    
    test_start "Checkpoint is_complete returns true for existing checkpoint"
    if spoke_checkpoint_is_complete "$TEST_INSTANCE" "DEPLOYMENT"; then
        test_pass
    else
        test_fail "is_complete returned false for existing checkpoint"
    fi
    
    test_start "Checkpoint is_complete returns false for non-existing checkpoint"
    if ! spoke_checkpoint_is_complete "$TEST_INSTANCE" "NONEXISTENT"; then
        test_pass
    else
        test_fail "is_complete returned true for non-existing checkpoint"
    fi
}

# Test 3: Checkpoint data integrity
test_checkpoint_data() {
    spoke_checkpoint_mark_complete "$TEST_INSTANCE" "CONFIGURATION" 30 '{"test":"data"}' >/dev/null 2>&1
    
    local checkpoint_file="$TEST_DIR/.phases/CONFIGURATION.done"
    
    # Debug: show file content
    if [ -f "$checkpoint_file" ]; then
        test_start "Checkpoint file is valid JSON"
        
        # Use explicit jq path and check file exists first
        if /usr/bin/jq empty "$checkpoint_file" 2>/dev/null; then
            test_pass
        else
            # Try to show what's wrong
            local content=$(cat "$checkpoint_file" 2>/dev/null)
            test_fail "Checkpoint file is not valid JSON. Content: ${content:0:100}"
        fi
    else
        test_fail "Checkpoint file does not exist: $checkpoint_file"
    fi
    
    # Verify contains required fields
    if command -v jq &>/dev/null && [ -f "$checkpoint_file" ]; then
        local phase=$(/usr/bin/jq -r '.phase' "$checkpoint_file" 2>/dev/null)
        assert_eq "CONFIGURATION" "$phase" "Checkpoint contains correct phase name"
    else
        test_skip "jq not available or checkpoint file missing"
    fi
}

# Test 4: Checkpoint timestamp
test_checkpoint_timestamp() {
    spoke_checkpoint_mark_complete "$TEST_INSTANCE" "VERIFICATION" 40 >/dev/null 2>&1
    
    local timestamp=$(spoke_checkpoint_get_timestamp "$TEST_INSTANCE" "VERIFICATION")
    
    test_start "Checkpoint timestamp is not empty"
    if [ -n "$timestamp" ]; then
        test_pass
    else
        test_fail "Timestamp is empty"
    fi
}

# Test 5: List completed phases
test_checkpoint_list() {
    # Clear any existing checkpoints first
    rm -rf "$TEST_DIR/.phases" 2>/dev/null
    mkdir -p "$TEST_DIR/.phases"
    
    # Create multiple checkpoints
    spoke_checkpoint_mark_complete "$TEST_INSTANCE" "INITIALIZATION" 10 >/dev/null 2>&1
    spoke_checkpoint_mark_complete "$TEST_INSTANCE" "DEPLOYMENT" 20 >/dev/null 2>&1
    spoke_checkpoint_mark_complete "$TEST_INSTANCE" "CONFIGURATION" 30 >/dev/null 2>&1
    
    local completed=$(spoke_checkpoint_list_completed "$TEST_INSTANCE")
    
    test_start "List completed phases returns all checkpoints"
    if echo "$completed" | grep -q "INITIALIZATION" && \
       echo "$completed" | grep -q "DEPLOYMENT" && \
       echo "$completed" | grep -q "CONFIGURATION"; then
        test_pass
    else
        test_fail "Not all checkpoints returned: $completed"
    fi
}

# Test 6: Clear specific checkpoint
test_checkpoint_clear_phase() {
    spoke_checkpoint_mark_complete "$TEST_INSTANCE" "SEEDING" 50 >/dev/null 2>&1
    
    # Verify it exists
    assert_file_exists "$TEST_DIR/.phases/SEEDING.done" "Checkpoint exists before clear"
    
    # Clear it
    spoke_checkpoint_clear_phase "$TEST_INSTANCE" "SEEDING" >/dev/null 2>&1
    
    assert_file_not_exists "$TEST_DIR/.phases/SEEDING.done" "Checkpoint removed after clear"
}

# Test 7: Clear all checkpoints
test_checkpoint_clear_all() {
    # Create multiple checkpoints
    spoke_checkpoint_mark_complete "$TEST_INSTANCE" "PREFLIGHT" 5 >/dev/null 2>&1
    spoke_checkpoint_mark_complete "$TEST_INSTANCE" "INITIALIZATION" 10 >/dev/null 2>&1
    
    # Clear all with confirm flag
    spoke_checkpoint_clear_all "$TEST_INSTANCE" "confirm" >/dev/null 2>&1
    local exit_code=$?
    
    assert_command_success "Clear all succeeded" $exit_code
    
    # Verify checkpoints are gone
    local count=$(find "$TEST_DIR/.phases" -name "*.done" 2>/dev/null | wc -l | tr -d ' ')
    assert_eq "0" "$count" "All checkpoints cleared"
}

# Test 8: Get next phase
test_checkpoint_next_phase() {
    # Clear existing
    rm -rf "$TEST_DIR/.phases" 2>/dev/null
    mkdir -p "$TEST_DIR/.phases"
    
    # Create some checkpoints
    spoke_checkpoint_mark_complete "$TEST_INSTANCE" "PREFLIGHT" 5 >/dev/null 2>&1
    spoke_checkpoint_mark_complete "$TEST_INSTANCE" "INITIALIZATION" 10 >/dev/null 2>&1
    
    local next_phase=$(spoke_checkpoint_get_next_phase "$TEST_INSTANCE")
    
    assert_eq "DEPLOYMENT" "$next_phase" "Next phase is DEPLOYMENT"
}

# Test 9: Can resume check
test_checkpoint_can_resume() {
    # Clear existing
    rm -rf "$TEST_DIR/.phases" 2>/dev/null
    mkdir -p "$TEST_DIR/.phases"
    
    # No checkpoints - can't resume
    test_start "Can resume returns false with no checkpoints"
    if ! spoke_checkpoint_can_resume "$TEST_INSTANCE"; then
        test_pass
    else
        test_fail "Should not be able to resume with no checkpoints"
    fi
    
    # Create checkpoint - can resume
    spoke_checkpoint_mark_complete "$TEST_INSTANCE" "INITIALIZATION" 10 >/dev/null 2>&1
    
    test_start "Can resume returns true with checkpoint"
    if spoke_checkpoint_can_resume "$TEST_INSTANCE"; then
        test_pass
    else
        test_fail "Should be able to resume with checkpoint"
    fi
}

# Test 10: Invalid phase name handling
test_checkpoint_invalid_phase() {
    local exit_code=0
    spoke_checkpoint_mark_complete "$TEST_INSTANCE" "INVALID_PHASE" 10 >/dev/null 2>&1 || exit_code=$?
    
    assert_command_failure "Invalid phase name rejected" $exit_code
}

# Test 11: Checkpoint persistence
test_checkpoint_persistence() {
    spoke_checkpoint_mark_complete "$TEST_INSTANCE" "DEPLOYMENT" 25 >/dev/null 2>&1
    
    # Verify checkpoint survives "reload"
    local timestamp1=$(spoke_checkpoint_get_timestamp "$TEST_INSTANCE" "DEPLOYMENT")
    
    # Reload module (simulates script restart)
    unset SPOKE_CHECKPOINT_LOADED
    source "${DIVE_ROOT}/scripts/dive-modules/spoke/pipeline/spoke-checkpoint.sh"
    
    local timestamp2=$(spoke_checkpoint_get_timestamp "$TEST_INSTANCE" "DEPLOYMENT")
    
    assert_eq "$timestamp1" "$timestamp2" "Checkpoint persists across module reload"
}

# Run all tests
test_checkpoint_create
test_checkpoint_is_complete
test_checkpoint_data
test_checkpoint_timestamp
test_checkpoint_list
test_checkpoint_clear_phase
test_checkpoint_clear_all
test_checkpoint_next_phase
test_checkpoint_can_resume
test_checkpoint_invalid_phase
test_checkpoint_persistence

# Print summary
test_suite_end
