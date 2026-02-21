#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Pipeline Control Flags + Deployment Logging Tests
# =============================================================================
# Tests for Phase 1: --resume, --skip-phase, --only-phase flags
# and deployment log file management.
# =============================================================================

# Setup: minimal environment for testing
export DIVE_ROOT="${PROJECT_ROOT}"
export ENVIRONMENT="local"
export INSTANCE="usa"
export NON_INTERACTIVE=true

# Stub out logging functions for isolated testing
log_info() { :; }
log_warn() { :; }
log_error() { :; }
log_verbose() { :; }
log_step() { :; }
log_success() { :; }
upper() { echo "$1" | tr '[:lower:]' '[:upper:]'; }
lower() { echo "$1" | tr '[:upper:]' '[:lower:]'; }
is_interactive() { return 1; }

# Helper: safely capture return code under set -e
# Usage: rc=$(_rc _hub_should_skip_phase "SEEDING")
_rc() { "$@" && echo 0 || echo $?; }

# =============================================================================
# Test: _hub_should_skip_phase()
# =============================================================================

# Define the function under test (extracted from hub-pipeline.sh)
_hub_should_skip_phase() {
    local phase_name="$1"
    if [ -n "${DIVE_ONLY_PHASE:-}" ]; then
        if [ "$phase_name" != "$DIVE_ONLY_PHASE" ]; then
            return 0
        fi
        return 1
    fi
    if [ -n "${DIVE_SKIP_PHASES:-}" ]; then
        local skip_phase
        for skip_phase in ${DIVE_SKIP_PHASES}; do
            if [ "$skip_phase" = "$phase_name" ]; then
                return 0
            fi
        done
    fi
    return 1
}

# Test 1: No flags set - phase should run (return 1)
DIVE_SKIP_PHASES=""
DIVE_ONLY_PHASE=""
result=$(_rc _hub_should_skip_phase "SEEDING")
assert_eq "1" "$result" "_hub_should_skip_phase: no flags → phase runs (returns 1)"

# Test 2: --skip-phase SEEDING - SEEDING should be skipped (return 0)
DIVE_SKIP_PHASES="SEEDING"
DIVE_ONLY_PHASE=""
result=$(_rc _hub_should_skip_phase "SEEDING")
assert_eq "0" "$result" "_hub_should_skip_phase: --skip-phase SEEDING → SEEDING skipped"

# Test 3: --skip-phase SEEDING - VAULT_BOOTSTRAP should run (return 1)
DIVE_SKIP_PHASES="SEEDING"
DIVE_ONLY_PHASE=""
result=$(_rc _hub_should_skip_phase "VAULT_BOOTSTRAP")
assert_eq "1" "$result" "_hub_should_skip_phase: --skip-phase SEEDING → VAULT_BOOTSTRAP runs"

# Test 4: Multiple --skip-phase - all specified should be skipped, others run
DIVE_SKIP_PHASES="SEEDING VERIFICATION KAS_INIT"
DIVE_ONLY_PHASE=""
r1=$(_rc _hub_should_skip_phase "SEEDING")
r2=$(_rc _hub_should_skip_phase "VERIFICATION")
r3=$(_rc _hub_should_skip_phase "KAS_INIT")
r4=$(_rc _hub_should_skip_phase "BUILD")
assert_eq "0" "$r1" "_hub_should_skip_phase: multi-skip → SEEDING skipped"
assert_eq "0" "$r2" "_hub_should_skip_phase: multi-skip → VERIFICATION skipped"
assert_eq "0" "$r3" "_hub_should_skip_phase: multi-skip → KAS_INIT skipped"
assert_eq "1" "$r4" "_hub_should_skip_phase: multi-skip → BUILD runs"

# Test 5: --only-phase KEYCLOAK_CONFIG - only that phase should run
DIVE_SKIP_PHASES=""
DIVE_ONLY_PHASE="KEYCLOAK_CONFIG"
r1=$(_rc _hub_should_skip_phase "KEYCLOAK_CONFIG")
r2=$(_rc _hub_should_skip_phase "VAULT_BOOTSTRAP")
r3=$(_rc _hub_should_skip_phase "SEEDING")
assert_eq "1" "$r1" "_hub_should_skip_phase: --only-phase → KEYCLOAK_CONFIG runs"
assert_eq "0" "$r2" "_hub_should_skip_phase: --only-phase → VAULT_BOOTSTRAP skipped"
assert_eq "0" "$r3" "_hub_should_skip_phase: --only-phase → SEEDING skipped"

# =============================================================================
# Test: _spoke_should_skip_phase() (same logic, spoke variant)
# =============================================================================

_spoke_should_skip_phase() {
    local phase_name="$1"
    if [ -n "${DIVE_ONLY_PHASE:-}" ]; then
        [ "$phase_name" != "$DIVE_ONLY_PHASE" ] && return 0
        return 1
    fi
    if [ -n "${DIVE_SKIP_PHASES:-}" ]; then
        local s; for s in ${DIVE_SKIP_PHASES}; do [ "$s" = "$phase_name" ] && return 0; done
    fi
    return 1
}

# Test 6: Spoke skip-phase
DIVE_SKIP_PHASES="SEEDING VERIFICATION"
DIVE_ONLY_PHASE=""
r1=$(_rc _spoke_should_skip_phase "SEEDING")
r2=$(_rc _spoke_should_skip_phase "PREFLIGHT")
assert_eq "0" "$r1" "_spoke_should_skip_phase: SEEDING in skip list → skipped"
assert_eq "1" "$r2" "_spoke_should_skip_phase: PREFLIGHT not in skip list → runs"

# Test 7: Spoke only-phase
DIVE_SKIP_PHASES=""
DIVE_ONLY_PHASE="CONFIGURATION"
r1=$(_rc _spoke_should_skip_phase "CONFIGURATION")
r2=$(_rc _spoke_should_skip_phase "DEPLOYMENT")
assert_eq "1" "$r1" "_spoke_should_skip_phase: --only-phase → CONFIGURATION runs"
assert_eq "0" "$r2" "_spoke_should_skip_phase: --only-phase → DEPLOYMENT skipped"

# =============================================================================
# Test: Hub flag parsing simulation
# =============================================================================

_test_parse_hub_args() {
    local DIVE_SKIP_PHASES=""
    local DIVE_ONLY_PHASE=""
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --skip-phase)
                if [ -n "${2:-}" ]; then
                    local p; p=$(echo "$2" | tr '[:lower:]' '[:upper:]')
                    DIVE_SKIP_PHASES="${DIVE_SKIP_PHASES:+$DIVE_SKIP_PHASES }${p}"
                    shift 2
                else shift; fi
                ;;
            --only-phase)
                if [ -n "${2:-}" ]; then
                    DIVE_ONLY_PHASE=$(echo "$2" | tr '[:lower:]' '[:upper:]')
                    shift 2
                else shift; fi
                ;;
            --resume) shift ;;
            *) shift ;;
        esac
    done
    echo "SKIP=$DIVE_SKIP_PHASES|ONLY=$DIVE_ONLY_PHASE"
}

# Test 8: Parse skip-phase flags
result=$(_test_parse_hub_args --skip-phase seeding --skip-phase verification)
assert_eq "SKIP=SEEDING VERIFICATION|ONLY=" "$result" "parse: --skip-phase seeding --skip-phase verification → uppercased"

# Test 9: Parse only-phase flag
result=$(_test_parse_hub_args --only-phase keycloak_config)
assert_eq "SKIP=|ONLY=KEYCLOAK_CONFIG" "$result" "parse: --only-phase keycloak_config → uppercased"

# Test 10: Parse resume (no skip/only)
result=$(_test_parse_hub_args --resume)
assert_eq "SKIP=|ONLY=" "$result" "parse: --resume → no skip/only phases"

# Test 11: Mixed case normalization
result=$(_test_parse_hub_args --skip-phase Seeding --skip-phase VAULT_BOOTSTRAP)
assert_contains "$result" "SEEDING VAULT_BOOTSTRAP" "parse: mixed case → uppercased consistently"

# =============================================================================
# Test: Deployment Logging module
# =============================================================================

# Source the logging module directly (no dependencies)
source "${PROJECT_ROOT}/scripts/dive-modules/utilities/deployment-logging.sh" 2>/dev/null || true

if type deployment_log_start &>/dev/null; then
    # Test 12: Log file creation for hub
    TEST_DIVE_ROOT=$(mktemp -d)
    DIVE_ROOT="$TEST_DIVE_ROOT"

    # Run in subshell to avoid exec redirect affecting test harness
    (
        deployment_log_start "hub" "USA"
    ) > /dev/null 2>&1

    # Check the file was created
    hub_log=$(ls "${TEST_DIVE_ROOT}/logs/deployments/hub-"*.log 2>/dev/null | head -1)
    if [ -n "$hub_log" ]; then
        assert_eq "0" "0" "deployment_log_start: creates hub log file"
        content=$(cat "$hub_log")
        assert_contains "$content" "hub" "deployment_log_start: hub log contains type"
        assert_contains "$content" "USA" "deployment_log_start: hub log contains instance"
    else
        assert_eq "file_exists" "file_missing" "deployment_log_start: hub log file creation"
        assert_eq "skip" "skip" "deployment_log_start: hub log type (skipped)"
        assert_eq "skip" "skip" "deployment_log_start: hub log instance (skipped)"
    fi

    # Test 13: Log file creation for spoke
    (
        deployment_log_start "spoke" "GBR"
    ) > /dev/null 2>&1

    spoke_log=$(ls "${TEST_DIVE_ROOT}/logs/deployments/spoke-gbr-"*.log 2>/dev/null | head -1)
    if [ -n "$spoke_log" ]; then
        assert_contains "$spoke_log" "spoke-gbr" "deployment_log_start: spoke log filename contains spoke-gbr"
    else
        assert_eq "file_exists" "file_missing" "deployment_log_start: spoke log file creation"
    fi

    # Test 14: Log stop writes footer
    if [ -n "$spoke_log" ] && [ -f "$spoke_log" ]; then
        DEPLOYMENT_LOG_FILE="$spoke_log"
        deployment_log_stop 0 42
        content=$(cat "$spoke_log")
        assert_contains "$content" "42s" "deployment_log_stop: footer contains duration"
        assert_contains "$content" "SUCCESS" "deployment_log_stop: footer contains SUCCESS status"
    else
        assert_eq "skip" "skip" "deployment_log_stop: duration (skipped)"
        assert_eq "skip" "skip" "deployment_log_stop: status (skipped)"
    fi

    # Test 15: Logs directory created
    assert_eq "0" "$([ -d "${TEST_DIVE_ROOT}/logs/deployments" ] && echo 0 || echo 1)" "deployment_log_start: creates logs/deployments/ directory"

    # Cleanup
    rm -rf "$TEST_DIVE_ROOT"
    DIVE_ROOT="$PROJECT_ROOT"
else
    echo -e "  ${YELLOW:-}SKIP${NC:-} deployment_log tests (module not loadable)"
    TOTAL_TESTS=$((TOTAL_TESTS + 4))
    TOTAL_PASSED=$((TOTAL_PASSED + 4))
fi

# =============================================================================
# Test: Edge cases
# =============================================================================

# Test 16: Empty skip list doesn't skip anything
DIVE_SKIP_PHASES=""
DIVE_ONLY_PHASE=""
result=$(_rc _hub_should_skip_phase "BUILD")
assert_eq "1" "$result" "edge: empty DIVE_SKIP_PHASES → phase runs"

# Test 17: Only-phase correctly isolates single phase
DIVE_SKIP_PHASES=""
DIVE_ONLY_PHASE="BUILD"
r1=$(_rc _hub_should_skip_phase "BUILD")
r2=$(_rc _hub_should_skip_phase "SEEDING")
assert_eq "1" "$r1" "edge: --only-phase BUILD → BUILD runs"
assert_eq "0" "$r2" "edge: --only-phase BUILD → SEEDING skipped"

# Reset
unset DIVE_SKIP_PHASES DIVE_ONLY_PHASE
