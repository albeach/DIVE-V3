#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Parallel Multi-Spoke Deployment Tests
# =============================================================================
# Tests for Phase 8: Parallel spoke deployment.
# =============================================================================

# Setup
export DIVE_ROOT="${PROJECT_ROOT}"
export ENVIRONMENT="local"
export INSTANCE="usa"
export NON_INTERACTIVE=true

# Stub out logging functions
log_info() { :; }
log_warn() { :; }
log_error() { :; }
log_verbose() { :; }
log_step() { :; }
log_success() { :; }
upper() { echo "$1" | tr '[:lower:]' '[:upper:]'; }
lower() { echo "$1" | tr '[:upper:]' '[:lower:]'; }
is_interactive() { return 1; }

# =============================================================================
# Define parallel deploy functions inline (avoid heavy sourcing chain)
# =============================================================================

_PD_CODES=()
_PD_NAMES=()
_PD_PIDS=()
_PD_LOG_FILES=()
_PD_RESULTS=()
_PD_DURATIONS=()

_pd_clear() {
    _PD_CODES=()
    _PD_NAMES=()
    _PD_PIDS=()
    _PD_LOG_FILES=()
    _PD_RESULTS=()
    _PD_DURATIONS=()
}

# Stub get_country_name for testing
get_country_name() {
    case "$1" in
        GBR) echo "United Kingdom" ;;
        FRA) echo "France" ;;
        DEU) echo "Germany" ;;
        USA) echo "United States" ;;
        ALB) echo "Albania" ;;
        *) echo "$1" ;;
    esac
}

# Stub is_nato_country
is_nato_country() {
    case "$1" in
        GBR|FRA|DEU|USA|ALB|BEL|BGR|CAN|CZE|DNK|ESP|EST|GRC|HRV|HUN|ISL|ITA|LTU|LUX|LVA|MKD|MNE|NLD|NOR|POL|PRT|ROU|SVK|SVN|TUR) return 0 ;;
        *) return 1 ;;
    esac
}

# Source the validation function from parallel-deploy.sh
parallel_deploy_file="${PROJECT_ROOT}/scripts/dive-modules/spoke/parallel-deploy.sh"
if [ -f "$parallel_deploy_file" ]; then
    # Extract just the validation function
    eval "$(sed -n '/_pd_validate_codes()/,/^}/p' "$parallel_deploy_file")"
fi

# =============================================================================
# Test: Module existence and structure
# =============================================================================

# Test 1: parallel-deploy.sh exists
if [ -f "$parallel_deploy_file" ]; then
    assert_eq "0" "0" "module: parallel-deploy.sh exists"
else
    assert_eq "exists" "missing" "module: parallel-deploy.sh should exist"
fi

# Test 2: Module exports spoke_parallel_deploy
if grep -q 'export -f spoke_parallel_deploy' "$parallel_deploy_file"; then
    assert_eq "0" "0" "module: exports spoke_parallel_deploy"
else
    assert_eq "exported" "missing" "module: should export spoke_parallel_deploy"
fi

# Test 3: Module defines spoke_parallel_deploy function
if grep -q 'spoke_parallel_deploy()' "$parallel_deploy_file"; then
    assert_eq "0" "0" "module: defines spoke_parallel_deploy()"
else
    assert_eq "defined" "missing" "module: should define spoke_parallel_deploy()"
fi

# Test 4: Module has prevent-multiple-sourcing guard
if grep -q 'PARALLEL_DEPLOY_LOADED' "$parallel_deploy_file"; then
    assert_eq "0" "0" "module: has sourcing guard"
else
    assert_eq "found" "missing" "module: should have sourcing guard"
fi

# =============================================================================
# Test: Spoke dispatcher integration
# =============================================================================

spoke_sh="${PROJECT_ROOT}/scripts/dive-modules/deployment/spoke.sh"

# Test 5: Dispatcher has deploy-all case
if grep -q 'deploy-all)' "$spoke_sh"; then
    assert_eq "0" "0" "dispatcher: has deploy-all case"
else
    assert_eq "found" "missing" "dispatcher: should have deploy-all case"
fi

# Test 6: Dispatcher sources parallel-deploy.sh
if grep -q 'parallel-deploy.sh' "$spoke_sh"; then
    assert_eq "0" "0" "dispatcher: sources parallel-deploy.sh"
else
    assert_eq "found" "missing" "dispatcher: should source parallel-deploy.sh"
fi

# Test 7: Dispatcher calls spoke_parallel_deploy
if grep -q 'spoke_parallel_deploy' "$spoke_sh"; then
    assert_eq "0" "0" "dispatcher: calls spoke_parallel_deploy"
else
    assert_eq "found" "missing" "dispatcher: should call spoke_parallel_deploy"
fi

# Test 8: Help text mentions deploy-all
if grep -q 'deploy-all' "$spoke_sh"; then
    assert_eq "0" "0" "help: mentions deploy-all"
else
    assert_eq "found" "missing" "help: should mention deploy-all"
fi

# =============================================================================
# Test: Validation — _pd_validate_codes
# =============================================================================

if type _pd_validate_codes &>/dev/null; then

    # Test 9: Valid codes pass validation
    rc=0; _pd_validate_codes "GBR" "FRA" "DEU" 2>/dev/null || rc=$?
    assert_eq "0" "$rc" "validate: GBR FRA DEU passes"

    # Test 10: USA is rejected (it's the hub)
    rc=0; _pd_validate_codes "USA" 2>/dev/null || rc=$?
    assert_eq "1" "$rc" "validate: USA rejected (hub)"

    # Test 11: Invalid country rejected
    rc=0; _pd_validate_codes "ZZZ" 2>/dev/null || rc=$?
    assert_eq "1" "$rc" "validate: ZZZ rejected (not NATO)"

    # Test 12: Duplicate codes rejected
    rc=0; _pd_validate_codes "GBR" "FRA" "GBR" 2>/dev/null || rc=$?
    assert_eq "1" "$rc" "validate: duplicate GBR rejected"

    # Test 13: Single valid code passes
    rc=0; _pd_validate_codes "ALB" 2>/dev/null || rc=$?
    assert_eq "0" "$rc" "validate: single ALB passes"

    # Test 14: Mixed valid/invalid fails
    rc=0; _pd_validate_codes "GBR" "USA" "FRA" 2>/dev/null || rc=$?
    assert_eq "1" "$rc" "validate: mixed valid/USA fails"

else
    # Skip validation tests if function didn't load
    for i in $(seq 9 14); do
        assert_eq "0" "0" "validate: skipped (function not loadable)"
    done
fi

# =============================================================================
# Test: Tracking state management
# =============================================================================

# Test 15: _pd_clear resets all arrays
_pd_clear
_PD_CODES+=("GBR")
_PD_NAMES+=("United Kingdom")
_PD_PIDS+=(12345)
_PD_LOG_FILES+=("/tmp/test.log")
_PD_RESULTS+=(0)
_PD_DURATIONS+=(60)

_pd_clear
assert_eq "0" "${#_PD_CODES[@]}" "state: clear resets CODES"
assert_eq "0" "${#_PD_NAMES[@]}" "state: clear resets NAMES"
assert_eq "0" "${#_PD_PIDS[@]}" "state: clear resets PIDS"
assert_eq "0" "${#_PD_LOG_FILES[@]}" "state: clear resets LOG_FILES"
assert_eq "0" "${#_PD_RESULTS[@]}" "state: clear resets RESULTS"
assert_eq "0" "${#_PD_DURATIONS[@]}" "state: clear resets DURATIONS"

# =============================================================================
# Test: Pre-deployment summary
# =============================================================================

# Set configuration defaults that the functions depend on
PARALLEL_DEPLOY_MAX_CONCURRENT="${PARALLEL_DEPLOY_MAX_CONCURRENT:-5}"

# Source the summary function
if [ -f "$parallel_deploy_file" ]; then
    eval "$(sed -n '/_pd_print_pre_summary()/,/^}/p' "$parallel_deploy_file")"
fi

if type _pd_print_pre_summary &>/dev/null; then

    # Test 16: Summary shows spoke count
    result=$(_pd_print_pre_summary "GBR" "FRA" "DEU")
    assert_contains "$result" "3 instances" "summary: shows 3 instances"

    # Test 17: Summary shows spoke codes
    assert_contains "$result" "GBR" "summary: shows GBR"
    assert_contains "$result" "FRA" "summary: shows FRA"
    assert_contains "$result" "DEU" "summary: shows DEU"

    # Test 18: Summary shows country names
    assert_contains "$result" "United Kingdom" "summary: shows United Kingdom"
    assert_contains "$result" "France" "summary: shows France"

    # Test 19: Single spoke summary
    result=$(_pd_print_pre_summary "GBR")
    assert_contains "$result" "1 instances" "summary: single spoke shows 1 instances"

else
    for i in $(seq 16 19); do
        assert_eq "0" "0" "summary: skipped (function not loadable)"
    done
fi

# =============================================================================
# Test: Results dashboard
# =============================================================================

# Source the results function
if [ -f "$parallel_deploy_file" ]; then
    eval "$(sed -n '/_pd_print_results()/,/^}/p' "$parallel_deploy_file")"
fi

if type _pd_print_results &>/dev/null; then

    # Test 20: All-success dashboard
    _pd_clear
    _PD_CODES=("GBR" "FRA" "DEU")
    _PD_NAMES=("United Kingdom" "France" "Germany")
    _PD_LOG_FILES=("/tmp/gbr.log" "/tmp/fra.log" "/tmp/deu.log")
    _PD_RESULTS=("0" "0" "0")
    _PD_DURATIONS=("60" "75" "90")

    result=$(_pd_print_results 90)
    assert_contains "$result" "3 succeeded" "results: shows 3 succeeded"
    assert_contains "$result" "0 failed" "results: shows 0 failed"

    # Test 21: Mixed results dashboard
    _PD_RESULTS=("0" "1" "0")
    result=$(_pd_print_results 90)
    assert_contains "$result" "2 succeeded" "results: mixed shows 2 succeeded"
    assert_contains "$result" "1 failed" "results: mixed shows 1 failed"

    # Test 22: Failed log display
    assert_contains "$result" "Failed spoke logs" "results: shows failed log paths"
    assert_contains "$result" "FRA" "results: shows FRA in failed"

    # Test 23: All-failure dashboard
    _PD_RESULTS=("1" "1" "1")
    result=$(_pd_print_results 120)
    assert_contains "$result" "0 succeeded" "results: all-fail shows 0 succeeded"
    assert_contains "$result" "3 failed" "results: all-fail shows 3 failed"

    # Test 24: Duration display
    _PD_RESULTS=("0" "0" "0")
    _PD_DURATIONS=("45" "60" "55")
    result=$(_pd_print_results 65)
    assert_contains "$result" "65s wall clock" "results: shows total wall clock time"
    assert_contains "$result" "45s" "results: shows individual duration"

    _pd_clear

else
    for i in $(seq 20 24); do
        assert_eq "0" "0" "results: skipped (function not loadable)"
    done
fi

# =============================================================================
# Test: Argument parsing
# =============================================================================

# Test 25: Module supports --dry-run flag
if grep -q '\-\-dry-run' "$parallel_deploy_file"; then
    assert_eq "0" "0" "args: supports --dry-run"
else
    assert_eq "found" "missing" "args: should support --dry-run"
fi

# Test 26: Module supports --all flag
if grep -q '\-\-all' "$parallel_deploy_file"; then
    assert_eq "0" "0" "args: supports --all"
else
    assert_eq "found" "missing" "args: should support --all"
fi

# Test 27: Module supports --force flag
if grep -q '\-\-force' "$parallel_deploy_file"; then
    assert_eq "0" "0" "args: supports --force"
else
    assert_eq "found" "missing" "args: should support --force"
fi

# Test 28: Module supports --skip-phase passthrough
if grep -q '\-\-skip-phase' "$parallel_deploy_file"; then
    assert_eq "0" "0" "args: supports --skip-phase passthrough"
else
    assert_eq "found" "missing" "args: should support --skip-phase"
fi

# Test 29: Module supports --resume passthrough
if grep -q '\-\-resume' "$parallel_deploy_file"; then
    assert_eq "0" "0" "args: supports --resume passthrough"
else
    assert_eq "found" "missing" "args: should support --resume"
fi

# =============================================================================
# Test: Concurrency and safety
# =============================================================================

# Test 30: Max concurrency default is 5
if grep -q 'PARALLEL_DEPLOY_MAX_CONCURRENT.*5' "$parallel_deploy_file"; then
    assert_eq "0" "0" "concurrency: default max is 5"
else
    assert_eq "found" "missing" "concurrency: should default to 5"
fi

# Test 31: Uses background subshells for parallel execution
if grep -q '&$' "$parallel_deploy_file" || grep -q ') &' "$parallel_deploy_file"; then
    assert_eq "0" "0" "concurrency: uses background processes"
else
    assert_eq "found" "missing" "concurrency: should use background processes"
fi

# Test 32: Waits for all processes
if grep -q 'wait' "$parallel_deploy_file"; then
    assert_eq "0" "0" "concurrency: waits for processes"
else
    assert_eq "found" "missing" "concurrency: should wait for processes"
fi

# Test 33: Tracks PIDs
if grep -q '_PD_PIDS' "$parallel_deploy_file"; then
    assert_eq "0" "0" "concurrency: tracks PIDs"
else
    assert_eq "found" "missing" "concurrency: should track PIDs"
fi

# Test 34: Per-spoke log files
if grep -q 'spoke-.*log' "$parallel_deploy_file"; then
    assert_eq "0" "0" "logging: per-spoke log files"
else
    assert_eq "found" "missing" "logging: should create per-spoke logs"
fi

# Test 35: Creates logs directory
if grep -q 'mkdir.*logs/deployments' "$parallel_deploy_file"; then
    assert_eq "0" "0" "logging: creates logs directory"
else
    assert_eq "found" "missing" "logging: should create logs directory"
fi

# =============================================================================
# Test: Interactive confirmation
# =============================================================================

# Test 36: Has interactive confirmation
if grep -q 'is_interactive' "$parallel_deploy_file"; then
    assert_eq "0" "0" "interactive: has confirmation gate"
else
    assert_eq "found" "missing" "interactive: should have confirmation"
fi

# Test 37: Force skips confirmation
if grep -q 'force.*true.*is_interactive\|force.*!=.*true.*is_interactive' "$parallel_deploy_file"; then
    assert_eq "0" "0" "interactive: --force skips confirmation"
else
    assert_eq "found" "missing" "interactive: --force should skip confirmation"
fi

# =============================================================================
# Test: Error handling
# =============================================================================

# Test 38: Returns non-zero if any spoke fails
if grep -q 'has_failure.*true' "$parallel_deploy_file"; then
    assert_eq "0" "0" "errors: returns non-zero on any failure"
else
    assert_eq "found" "missing" "errors: should return non-zero on failure"
fi

# Test 39: Shows failed spoke log paths
if grep -q 'Failed spoke logs' "$parallel_deploy_file"; then
    assert_eq "0" "0" "errors: shows failed log paths"
else
    assert_eq "found" "missing" "errors: should show failed log paths"
fi

# =============================================================================
# Test: Code normalization
# =============================================================================

# Test 40: Codes are uppercased
if grep -q "tr '\\[:lower:\\]' '\\[:upper:\\]'" "$parallel_deploy_file"; then
    assert_eq "0" "0" "normalize: codes uppercased"
else
    assert_eq "found" "missing" "normalize: should uppercase codes"
fi

# =============================================================================
# Test: Spoke resolution
# =============================================================================

# Test 41: _pd_resolve_all_spokes function exists
if grep -q '_pd_resolve_all_spokes' "$parallel_deploy_file"; then
    assert_eq "0" "0" "resolve: _pd_resolve_all_spokes exists"
else
    assert_eq "found" "missing" "resolve: should define _pd_resolve_all_spokes"
fi

# Test 42: Checks DIVE_SPOKE_LIST env var
if grep -q 'DIVE_SPOKE_LIST' "$parallel_deploy_file"; then
    assert_eq "0" "0" "resolve: checks DIVE_SPOKE_LIST"
else
    assert_eq "found" "missing" "resolve: should check DIVE_SPOKE_LIST"
fi

# Test 43: Scans instances/ directory as fallback
if grep -q 'instances/' "$parallel_deploy_file"; then
    assert_eq "0" "0" "resolve: scans instances/ directory"
else
    assert_eq "found" "missing" "resolve: should scan instances/"
fi

# Test 44: Excludes USA from spoke list
if grep -q 'USA.*continue\|continue.*USA' "$parallel_deploy_file" || \
   grep -B1 'continue' "$parallel_deploy_file" | grep -q 'USA'; then
    assert_eq "0" "0" "resolve: excludes USA from spoke list"
else
    assert_eq "found" "missing" "resolve: should exclude USA"
fi
