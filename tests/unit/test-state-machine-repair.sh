#!/usr/bin/env bash
# =============================================================================
# DIVE V3 State Machine Repair — Test Suite
# =============================================================================
# Phase 4: Validates that orch_execute_phase uses valid deployment states
# (not raw phase names), state transitions are properly validated, and
# phase metadata is recorded correctly.
#
# Run with: bash tests/unit/test-state-machine-repair.sh
# =============================================================================

set -euo pipefail

# Test environment setup — DIVE_ROOT always points to real project root
export DIVE_ROOT="${DIVE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
export DIVE_TEST_MODE=true

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

# Test counters
TEST_COUNT=0
PASS_COUNT=0
FAIL_COUNT=0

# Shared modules path
MODULES_DIR="${DIVE_ROOT}/scripts/dive-modules"

# =============================================================================
# TEST FRAMEWORK
# =============================================================================

assert_pass() {
    local name="$1"
    ((TEST_COUNT++)) || true
    ((PASS_COUNT++)) || true
    echo -e "  ${GREEN}PASS${NC} $name"
}

assert_fail() {
    local name="$1"
    local detail="${2:-}"
    ((TEST_COUNT++)) || true
    ((FAIL_COUNT++)) || true
    echo -e "  ${RED}FAIL${NC} $name"
    [ -n "$detail" ] && echo -e "       ${detail}"
}

# Create a temp dir for file-mode state tests (does NOT modify global DIVE_ROOT)
make_temp_state_dir() {
    local tmpdir
    tmpdir=$(mktemp -d)
    mkdir -p "${tmpdir}/.dive-state"
    echo "$tmpdir"
}

# =============================================================================
# TEST 1: Valid states list is correct
# =============================================================================

echo ""
echo "=== State Machine Repair Tests ==="
echo ""
echo "--- Test Group 1: Valid States Definition ---"

VALID_STATES_CHECK=$(bash -c "
    source '${MODULES_DIR}/common.sh' 2>/dev/null
    export DIVE_COMMON_LOADED=1
    source '${MODULES_DIR}/orchestration/state.sh' 2>/dev/null
    echo \"\$VALID_STATES\"
" 2>/dev/null || echo "LOAD_FAILED")

if [[ "$VALID_STATES_CHECK" == *"UNKNOWN"* ]] && \
   [[ "$VALID_STATES_CHECK" == *"INITIALIZING"* ]] && \
   [[ "$VALID_STATES_CHECK" == *"DEPLOYING"* ]] && \
   [[ "$VALID_STATES_CHECK" == *"CONFIGURING"* ]] && \
   [[ "$VALID_STATES_CHECK" == *"VERIFYING"* ]] && \
   [[ "$VALID_STATES_CHECK" == *"COMPLETE"* ]]; then
    assert_pass "VALID_STATES contains all deployment lifecycle states"
else
    assert_fail "VALID_STATES contains all deployment lifecycle states" "Got: $VALID_STATES_CHECK"
fi

# Verify phase names are NOT in VALID_STATES
for phase_name in PREFLIGHT INITIALIZATION DEPLOYMENT CONFIGURATION VERIFICATION COMPLETION; do
    if [[ " $VALID_STATES_CHECK " == *" $phase_name "* ]]; then
        assert_fail "Phase name '$phase_name' is NOT a valid state" "Found in VALID_STATES"
    else
        assert_pass "Phase name '$phase_name' is NOT a valid state"
    fi
done

# =============================================================================
# TEST 2: DEPLOYING→DEPLOYING self-transition is allowed
# =============================================================================

echo ""
echo "--- Test Group 2: State Transitions ---"

TRANSITIONS_CHECK=$(bash -c "
    source '${MODULES_DIR}/common.sh' 2>/dev/null
    export DIVE_COMMON_LOADED=1
    source '${MODULES_DIR}/orchestration/state.sh' 2>/dev/null
    echo \"\${VALID_TRANSITIONS[DEPLOYING]}\"
" 2>/dev/null || echo "LOAD_FAILED")

if [[ "$TRANSITIONS_CHECK" == *"DEPLOYING"* ]]; then
    assert_pass "DEPLOYING→DEPLOYING self-transition is valid"
else
    assert_fail "DEPLOYING→DEPLOYING self-transition is valid" "Transitions from DEPLOYING: $TRANSITIONS_CHECK"
fi

# Verify standard transition chain
TRANSITIONS_OK=$(bash -c "
    source '${MODULES_DIR}/common.sh' 2>/dev/null
    export DIVE_COMMON_LOADED=1
    source '${MODULES_DIR}/orchestration/state.sh' 2>/dev/null
    orch_validate_state_transition 'UNKNOWN' 'INITIALIZING' && \
    orch_validate_state_transition 'INITIALIZING' 'DEPLOYING' && \
    orch_validate_state_transition 'DEPLOYING' 'CONFIGURING' && \
    orch_validate_state_transition 'CONFIGURING' 'VERIFYING' && \
    orch_validate_state_transition 'VERIFYING' 'COMPLETE' && \
    echo 'ALL_VALID'
" 2>/dev/null || echo "FAILED")

if [[ "$TRANSITIONS_OK" == *"ALL_VALID"* ]]; then
    assert_pass "Full chain UNKNOWN→INITIALIZING→DEPLOYING→CONFIGURING→VERIFYING→COMPLETE is valid"
else
    assert_fail "Full deployment chain is valid" "Got: $TRANSITIONS_OK"
fi

# Verify DEPLOYING→DEPLOYING→CONFIGURING chain (phase-to-phase within deployment)
MULTI_DEPLOY_OK=$(bash -c "
    source '${MODULES_DIR}/common.sh' 2>/dev/null
    export DIVE_COMMON_LOADED=1
    source '${MODULES_DIR}/orchestration/state.sh' 2>/dev/null
    orch_validate_state_transition 'DEPLOYING' 'DEPLOYING' && \
    orch_validate_state_transition 'DEPLOYING' 'CONFIGURING' && \
    echo 'CHAIN_VALID'
" 2>/dev/null || echo "FAILED")

if [[ "$MULTI_DEPLOY_OK" == *"CHAIN_VALID"* ]]; then
    assert_pass "DEPLOYING→DEPLOYING→CONFIGURING chain is valid"
else
    assert_fail "DEPLOYING→DEPLOYING→CONFIGURING chain is valid" "Got: $MULTI_DEPLOY_OK"
fi

# =============================================================================
# TEST 3: Invalid states are rejected
# =============================================================================

echo ""
echo "--- Test Group 3: Invalid State Rejection ---"

for invalid_state in VAULT_BOOTSTRAP MONGODB_INIT PREFLIGHT DEPLOYMENT; do
    REJECTED=$(bash -c "
        source '${MODULES_DIR}/common.sh' 2>/dev/null
        export DIVE_COMMON_LOADED=1
        export ORCH_DB_ENABLED=false
        export DEPLOYMENT_MODE=remote
        export ORCH_DB_ONLY_MODE=true
        export DIVE_ROOT='${DIVE_ROOT}'
        source '${MODULES_DIR}/orchestration/state.sh' 2>/dev/null
        if orch_db_set_state 'gbr' '$invalid_state' 2>&1; then
            echo 'ACCEPTED'
        else
            echo 'REJECTED'
        fi
    " 2>/dev/null || echo "REJECTED")

    if [[ "$REJECTED" == *"REJECTED"* ]]; then
        assert_pass "Invalid state '$invalid_state' is rejected by orch_db_set_state"
    else
        assert_fail "Invalid state '$invalid_state' is rejected by orch_db_set_state" "Was accepted"
    fi
done

# =============================================================================
# TEST 4: framework.sh uses valid states (source code verification)
# =============================================================================

echo ""
echo "--- Test Group 4: Source Code Verification ---"

FRAMEWORK_FILE="${MODULES_DIR}/orchestration/framework.sh"

# Check that orch_execute_phase maps phase names to valid states
PHASE_MAP_COUNT=$(grep -c '"DEPLOYING"\|"INITIALIZING"\|"CONFIGURING"\|"VERIFYING"' "$FRAMEWORK_FILE" || true)
if [ "$PHASE_MAP_COUNT" -ge 4 ]; then
    assert_pass "framework.sh maps phases to valid states ($PHASE_MAP_COUNT mappings)"
else
    assert_fail "framework.sh maps phases to valid states" "Found only $PHASE_MAP_COUNT mappings (expected >= 4)"
fi

# Check that the old broken pattern (phase_name directly as state) is gone
OLD_PATTERN_COUNT=$(grep -c 'orch_db_set_state.*\$phase_name.*2>/dev/null || true' "$FRAMEWORK_FILE" || true)
if [ "$OLD_PATTERN_COUNT" -eq 0 ]; then
    assert_pass "Old broken pattern (phase_name as state with silent suppression) is removed"
else
    assert_fail "Old broken pattern removed" "Found $OLD_PATTERN_COUNT occurrences"
fi

# Check that metadata includes phase name (file literal: {\"phase\":...})
METADATA_COUNT=$(grep -c 'phase.*\$phase_name' "$FRAMEWORK_FILE" || true)
if [ "$METADATA_COUNT" -ge 4 ]; then
    assert_pass "Phase metadata includes phase name ($METADATA_COUNT references)"
else
    assert_fail "Phase metadata includes phase name" "Found only $METADATA_COUNT references"
fi

# Check orch_db_update_phase_metadata is called after phase success
if grep -q 'orch_db_update_phase_metadata.*complete' "$FRAMEWORK_FILE"; then
    assert_pass "orch_db_update_phase_metadata called on phase completion"
else
    assert_fail "orch_db_update_phase_metadata called on phase completion"
fi

# =============================================================================
# TEST 5: orch_db_update_phase_metadata function exists and works
# =============================================================================

echo ""
echo "--- Test Group 5: Phase Metadata Function ---"

STATE_FILE="${MODULES_DIR}/orchestration/state.sh"

if grep -q 'orch_db_update_phase_metadata()' "$STATE_FILE"; then
    assert_pass "orch_db_update_phase_metadata() function defined in state.sh"
else
    assert_fail "orch_db_update_phase_metadata() function defined in state.sh"
fi

# Test that the function works in remote/file mode
TEMP_DIR=$(make_temp_state_dir)
METADATA_RESULT=$(bash -c "
    source '${MODULES_DIR}/common.sh' 2>/dev/null
    export DIVE_COMMON_LOADED=1
    source '${MODULES_DIR}/orchestration/state.sh' 2>/dev/null
    export DIVE_ROOT='$TEMP_DIR'
    export ORCH_DB_ENABLED=false
    export DEPLOYMENT_MODE=remote
    export ORCH_DB_ONLY_MODE=true
    orch_db_update_phase_metadata 'gbr' 'VAULT_BOOTSTRAP' 'complete' && echo 'OK'
" 2>/dev/null || echo "FAILED")

if [[ "$METADATA_RESULT" == *"OK"* ]]; then
    assert_pass "orch_db_update_phase_metadata works in remote/file mode"
else
    assert_fail "orch_db_update_phase_metadata works in remote/file mode" "Got: $METADATA_RESULT"
fi

# Check that .phases file was created
if [ -f "${TEMP_DIR}/.dive-state/gbr.phases" ]; then
    PHASE_CONTENT=$(cat "${TEMP_DIR}/.dive-state/gbr.phases")
    if [[ "$PHASE_CONTENT" == *"VAULT_BOOTSTRAP|complete|"* ]]; then
        assert_pass "Phase metadata written to .phases file correctly"
    else
        assert_fail "Phase metadata written to .phases file correctly" "Content: $PHASE_CONTENT"
    fi
else
    assert_fail "Phase metadata .phases file created"
fi
rm -rf "$TEMP_DIR"

# Test input validation
VALIDATION_RESULT=$(bash -c "
    source '${MODULES_DIR}/common.sh' 2>/dev/null
    export DIVE_COMMON_LOADED=1
    export ORCH_DB_ENABLED=false
    export DEPLOYMENT_MODE=remote
    export ORCH_DB_ONLY_MODE=true
    source '${MODULES_DIR}/orchestration/state.sh' 2>/dev/null
    if orch_db_update_phase_metadata 'invalid123' 'TEST' 2>&1; then
        echo 'ACCEPTED'
    else
        echo 'REJECTED'
    fi
" 2>/dev/null || echo "REJECTED")

if [[ "$VALIDATION_RESULT" == *"REJECTED"* ]]; then
    assert_pass "orch_db_update_phase_metadata rejects invalid instance codes"
else
    assert_fail "orch_db_update_phase_metadata rejects invalid instance codes"
fi

# =============================================================================
# TEST 6: spoke-pipeline.sh wildcard case fixed
# =============================================================================

echo ""
echo "--- Test Group 6: Spoke Pipeline Fix ---"

SPOKE_FILE="${MODULES_DIR}/spoke/pipeline/spoke-pipeline.sh"

# Extract the wildcard (*) case block from the phase-to-state mapping section (around line 720)
# Use sed to extract from the first standalone *) to its ;;
SPOKE_WILDCARD=$(sed -n '720,726p' "$SPOKE_FILE" 2>/dev/null || true)

if echo "$SPOKE_WILDCARD" | grep -q 'orch_db_update_phase_metadata'; then
    assert_pass "Spoke pipeline wildcard case uses orch_db_update_phase_metadata"
else
    assert_fail "Spoke pipeline wildcard case uses orch_db_update_phase_metadata" "Found: $SPOKE_WILDCARD"
fi

if echo "$SPOKE_WILDCARD" | grep -q 'orch_db_set_state'; then
    assert_fail "Spoke pipeline wildcard case still calls orch_db_set_state with raw phase name"
else
    assert_pass "Spoke pipeline wildcard case no longer calls orch_db_set_state with raw phase name"
fi

# =============================================================================
# TEST 7: State transition validation in file mode (end-to-end)
# =============================================================================

echo ""
echo "--- Test Group 7: End-to-End File Mode ---"

TEMP_DIR=$(make_temp_state_dir)

# Simulate a full deployment lifecycle in file mode
E2E_RESULT=$(bash -c "
    source '${MODULES_DIR}/common.sh' 2>/dev/null
    export DIVE_COMMON_LOADED=1
    source '${MODULES_DIR}/orchestration/state.sh' 2>/dev/null
    export DIVE_ROOT='$TEMP_DIR'
    export ORCH_DB_ENABLED=false
    export DEPLOYMENT_MODE=remote
    export ORCH_DB_ONLY_MODE=true

    # Simulate deployment lifecycle
    orch_db_set_state 'gbr' 'INITIALIZING' '' '{\"phase\":\"INITIALIZATION\"}' && \
    orch_db_set_state 'gbr' 'DEPLOYING' '' '{\"phase\":\"DEPLOYMENT\"}' && \
    orch_db_set_state 'gbr' 'CONFIGURING' '' '{\"phase\":\"CONFIGURATION\"}' && \
    orch_db_set_state 'gbr' 'VERIFYING' '' '{\"phase\":\"VERIFICATION\"}' && \
    orch_db_set_state 'gbr' 'COMPLETE' '' '' && \
    echo 'LIFECYCLE_COMPLETE'
" 2>/dev/null || echo "FAILED")

if [[ "$E2E_RESULT" == *"LIFECYCLE_COMPLETE"* ]]; then
    assert_pass "Full deployment lifecycle in file mode succeeds"
else
    assert_fail "Full deployment lifecycle in file mode" "Got: $E2E_RESULT"
fi

# Verify state file content
if [ -f "${TEMP_DIR}/.dive-state/gbr.state" ]; then
    STATE_LINES=$(wc -l < "${TEMP_DIR}/.dive-state/gbr.state")
    LAST_STATE=$(tail -1 "${TEMP_DIR}/.dive-state/gbr.state" | cut -d'|' -f1)
    if [ "$STATE_LINES" -eq 5 ] && [ "$LAST_STATE" = "COMPLETE" ]; then
        assert_pass "State file records all 5 transitions, ending in COMPLETE"
    else
        assert_fail "State file records all 5 transitions" "Lines: $STATE_LINES, Last: $LAST_STATE"
    fi
else
    assert_fail "State file created during lifecycle"
fi

# Test invalid transition is blocked
INVALID_RESULT=$(bash -c "
    source '${MODULES_DIR}/common.sh' 2>/dev/null
    export DIVE_COMMON_LOADED=1
    source '${MODULES_DIR}/orchestration/state.sh' 2>/dev/null
    export DIVE_ROOT='$TEMP_DIR'
    export ORCH_DB_ENABLED=false
    export DEPLOYMENT_MODE=remote
    export ORCH_DB_ONLY_MODE=true

    # From COMPLETE, only INITIALIZING/CLEANUP/FAILED are valid
    if orch_db_set_state 'gbr' 'DEPLOYING' 2>&1; then
        echo 'ALLOWED'
    else
        echo 'BLOCKED'
    fi
" 2>/dev/null || echo "BLOCKED")

if [[ "$INVALID_RESULT" == *"BLOCKED"* ]]; then
    assert_pass "Invalid transition COMPLETE→DEPLOYING is blocked"
else
    assert_fail "Invalid transition COMPLETE→DEPLOYING is blocked" "Was allowed"
fi

rm -rf "$TEMP_DIR"

# =============================================================================
# SUMMARY
# =============================================================================

echo ""
echo "=== Test Summary ==="
echo -e "Total: $TEST_COUNT  ${GREEN}Pass: $PASS_COUNT${NC}  ${RED}Fail: $FAIL_COUNT${NC}"
echo ""

if [ "$FAIL_COUNT" -gt 0 ]; then
    echo -e "${RED}FAILED${NC}: $FAIL_COUNT test(s) failed"
    exit 1
else
    echo -e "${GREEN}ALL TESTS PASSED${NC}"
    exit 0
fi
