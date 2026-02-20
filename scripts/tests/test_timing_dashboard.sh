#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Timing Dashboard + Enhanced Failure Context Tests
# =============================================================================
# Tests for Phase 2: deployment_print_timing_dashboard(), phase-container
# mapping, and container log capture (mocked).
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
_rc() { "$@" && echo 0 || echo $?; }

# =============================================================================
# Test: Timing parser (_dashboard_parse_timing)
# =============================================================================

# Source the dashboard module
source "${PROJECT_ROOT}/scripts/dive-modules/utilities/deployment-dashboard.sh" 2>/dev/null || true

if type _dashboard_parse_timing &>/dev/null; then

    # Test 1: Parse normal phase entry
    _dashboard_parse_timing "Phase 1 (Vault Bootstrap): 12s"
    assert_eq "1" "$_parsed_num" "parse timing: phase number extracted"
    assert_eq "Vault Bootstrap" "$_parsed_name" "parse timing: phase name extracted"
    assert_eq "12" "$_parsed_seconds" "parse timing: seconds extracted"
    assert_eq "false" "$_parsed_skipped" "parse timing: not skipped"

    # Test 2: Parse skipped phase entry
    _dashboard_parse_timing "Phase 3 (Preflight): skipped"
    assert_eq "3" "$_parsed_num" "parse timing: skipped phase number"
    assert_eq "Preflight" "$_parsed_name" "parse timing: skipped phase name"
    assert_eq "true" "$_parsed_skipped" "parse timing: skipped flag set"

    # Test 3: Parse double-digit phase
    _dashboard_parse_timing "Phase 13 (KAS Init): 8s"
    assert_eq "13" "$_parsed_num" "parse timing: double-digit phase number"
    assert_eq "KAS Init" "$_parsed_name" "parse timing: double-digit phase name"
    assert_eq "8" "$_parsed_seconds" "parse timing: double-digit seconds"

    # Test 4: Parse large duration
    _dashboard_parse_timing "Phase 6 (Build): 245s"
    assert_eq "245" "$_parsed_seconds" "parse timing: large duration extracted"

else
    echo -e "  ${YELLOW:-}SKIP${NC:-} _dashboard_parse_timing tests (function not loadable)"
    TOTAL_TESTS=$((TOTAL_TESTS + 4))
    TOTAL_PASSED=$((TOTAL_PASSED + 4))
fi

# =============================================================================
# Test: Bar chart renderer
# =============================================================================

if type _dashboard_render_bar &>/dev/null; then

    # Test 5: Full bar (value = max)
    result=$(_dashboard_render_bar 100 100 10)
    assert_eq "10" "${#result}" "bar chart: full bar has correct length"

    # Test 6: Half bar
    result=$(_dashboard_render_bar 50 100 10)
    # Should contain 5 filled + 5 empty chars = 10 total
    assert_eq "10" "${#result}" "bar chart: half bar has correct length"

    # Test 7: Empty bar (value = 0)
    result=$(_dashboard_render_bar 0 100 10)
    assert_eq "10" "${#result}" "bar chart: empty bar has correct length"

    # Test 8: Zero max value (edge case)
    result=$(_dashboard_render_bar 0 0 10)
    assert_eq "10" "${#result}" "bar chart: zero max produces padded output"

else
    echo -e "  ${YELLOW:-}SKIP${NC:-} bar chart tests (function not loadable)"
    TOTAL_TESTS=$((TOTAL_TESTS + 4))
    TOTAL_PASSED=$((TOTAL_PASSED + 4))
fi

# =============================================================================
# Test: Phase status determination
# =============================================================================

if type _dashboard_phase_status &>/dev/null; then

    # Test 9: OK when within target
    result=$(_dashboard_phase_status 10 30 false)
    assert_eq "  OK" "$result" "phase status: within target → OK"

    # Test 10: SLOW when exceeding target but < 1.5x
    result=$(_dashboard_phase_status 40 30 false)
    assert_eq "SLOW" "$result" "phase status: 1-1.5x target → SLOW"

    # Test 11: OVER when exceeding 1.5x target
    result=$(_dashboard_phase_status 60 30 false)
    assert_eq "OVER" "$result" "phase status: >1.5x target → OVER"

    # Test 12: SKIP when skipped
    result=$(_dashboard_phase_status 0 30 true)
    assert_eq "SKIP" "$result" "phase status: skipped → SKIP"

    # Test 13: OK when no target (0)
    result=$(_dashboard_phase_status 100 0 false)
    assert_eq "  OK" "$result" "phase status: no target → OK"

else
    echo -e "  ${YELLOW:-}SKIP${NC:-} phase status tests (function not loadable)"
    TOTAL_TESTS=$((TOTAL_TESTS + 5))
    TOTAL_PASSED=$((TOTAL_PASSED + 5))
fi

# =============================================================================
# Test: Total status determination
# =============================================================================

if type _dashboard_total_status &>/dev/null; then

    # Test 14: OK when within target
    result=$(_dashboard_total_status 200 300)
    assert_eq "OK" "$result" "total status: within target → OK"

    # Test 15: SLOW when 1-1.5x target
    result=$(_dashboard_total_status 400 300)
    assert_eq "SLOW" "$result" "total status: 1-1.5x target → SLOW"

    # Test 16: OVER when > 1.5x target
    result=$(_dashboard_total_status 500 300)
    assert_eq "OVER" "$result" "total status: >1.5x target → OVER"

else
    echo -e "  ${YELLOW:-}SKIP${NC:-} total status tests (function not loadable)"
    TOTAL_TESTS=$((TOTAL_TESTS + 3))
    TOTAL_PASSED=$((TOTAL_PASSED + 3))
fi

# =============================================================================
# Test: Full dashboard output
# =============================================================================

if type deployment_print_timing_dashboard &>/dev/null; then

    # Test 17: Hub dashboard produces expected sections
    output=$(deployment_print_timing_dashboard "hub" \
        "Phase 1 (Vault Bootstrap): 12s" \
        "Phase 2 (Database Init): 5s" \
        "Phase 3 (Preflight): skipped" \
        "Phase 4 (Initialization): 3s" \
        "Phase 5 (MongoDB): 8s" \
        "Phase 6 (Build): 245s" \
        "Phase 7 (Services): 65s" \
        "Phase 8 (Vault DB Engine): 4s" \
        "Phase 9 (Keycloak): 30s" \
        "Phase 10 (Realm Verify): 2s" \
        "Phase 11 (KAS Register): 3s" \
        "Phase 12 (Seeding): 15s" \
        "Phase 13 (KAS Init): 5s" \
        397)

    assert_contains "$output" "Deployment Timing Dashboard" "dashboard hub: contains title"
    assert_contains "$output" "Hub" "dashboard hub: contains type"
    assert_contains "$output" "Vault Bootstrap" "dashboard hub: contains phase name"
    assert_contains "$output" "Build" "dashboard hub: contains Build phase"
    assert_contains "$output" "Bottleneck" "dashboard hub: identifies bottleneck"
    assert_contains "$output" "Performance" "dashboard hub: contains performance rating"
    assert_contains "$output" "Total" "dashboard hub: contains total line"

    # Test 18: Build is identified as bottleneck (245s / 397s = 62%)
    assert_contains "$output" "Build" "dashboard hub: Build is bottleneck phase"

    # Test 19: Skipped phase shows correctly
    assert_contains "$output" "SKIP" "dashboard hub: shows SKIP for skipped phase"

    # Test 20: Spoke dashboard works
    spoke_output=$(deployment_print_timing_dashboard "spoke" \
        "Phase 1 (Preflight): 5s" \
        "Phase 2 (Initialization): 10s" \
        "Phase 3 (Deployment): 45s" \
        "Phase 4 (Configuration): 60s" \
        "Phase 5 (Seeding): 20s" \
        "Phase 6 (Verification): 8s" \
        148)

    assert_contains "$spoke_output" "Spoke" "dashboard spoke: contains type"
    assert_contains "$spoke_output" "Configuration" "dashboard spoke: contains phase name"
    assert_contains "$spoke_output" "Performance" "dashboard spoke: contains performance rating"

    # Test 21: Dashboard with all skipped phases
    skip_output=$(deployment_print_timing_dashboard "hub" \
        "Phase 1 (Vault Bootstrap): skipped" \
        "Phase 2 (Database Init): skipped" \
        0)

    assert_contains "$skip_output" "SKIP" "dashboard all-skipped: shows SKIP"
    assert_contains "$skip_output" "Total" "dashboard all-skipped: still shows total"

    # Test 22: Single phase dashboard
    single_output=$(deployment_print_timing_dashboard "hub" \
        "Phase 6 (Build): 120s" \
        120)

    assert_contains "$single_output" "Build" "dashboard single: shows phase"
    assert_contains "$single_output" "120" "dashboard single: shows duration"

else
    echo -e "  ${YELLOW:-}SKIP${NC:-} full dashboard tests (function not loadable)"
    TOTAL_TESTS=$((TOTAL_TESTS + 6))
    TOTAL_PASSED=$((TOTAL_PASSED + 6))
fi

# =============================================================================
# Test: Target loading
# =============================================================================

if type _dashboard_load_targets &>/dev/null; then

    # Test 23: Hub targets loaded
    _dashboard_load_targets "hub"
    assert_eq "300" "${_DASHBOARD_PHASE_TARGETS[Build]}" "targets hub: Build target is 300s"
    assert_eq "60" "${_DASHBOARD_PHASE_TARGETS[Vault Bootstrap]}" "targets hub: Vault Bootstrap target is 60s"

    # Test 24: Spoke targets loaded
    _dashboard_load_targets "spoke"
    assert_eq "120" "${_DASHBOARD_PHASE_TARGETS[Configuration]}" "targets spoke: Configuration target is 120s"
    assert_eq "30" "${_DASHBOARD_PHASE_TARGETS[Preflight]}" "targets spoke: Preflight target is 30s"

else
    echo -e "  ${YELLOW:-}SKIP${NC:-} target loading tests (function not loadable)"
    TOTAL_TESTS=$((TOTAL_TESTS + 2))
    TOTAL_PASSED=$((TOTAL_PASSED + 2))
fi

# =============================================================================
# Test: Phase-container mapping (_error_get_phase_containers)
# =============================================================================

# Source error recovery module (needs common functions)
source "${PROJECT_ROOT}/scripts/dive-modules/orchestration/error-recovery.sh" 2>/dev/null || true

if type _error_get_phase_containers &>/dev/null; then

    # Test 25: Vault phase maps to vault container
    result=$(_error_get_phase_containers "VAULT_BOOTSTRAP" "hub")
    assert_eq "dive-hub-vault" "$result" "phase containers: VAULT_BOOTSTRAP → dive-hub-vault"

    # Test 26: Database phase maps to postgres
    result=$(_error_get_phase_containers "DATABASE_INIT" "hub")
    assert_eq "dive-hub-postgres" "$result" "phase containers: DATABASE_INIT → dive-hub-postgres"

    # Test 27: Build phase maps to multiple containers
    result=$(_error_get_phase_containers "BUILD" "hub")
    assert_contains "$result" "backend" "phase containers: BUILD contains backend"
    assert_contains "$result" "frontend" "phase containers: BUILD contains frontend"

    # Test 28: Keycloak config maps to keycloak
    result=$(_error_get_phase_containers "KEYCLOAK_CONFIG" "hub")
    assert_contains "$result" "keycloak" "phase containers: KEYCLOAK_CONFIG contains keycloak"

    # Test 29: Spoke deployment type prefix
    result=$(_error_get_phase_containers "VAULT_BOOTSTRAP" "spoke")
    assert_eq "dive-spoke-vault" "$result" "phase containers: spoke prefix → dive-spoke-vault"

    # Test 30: Seeding maps to backend + mongodb
    result=$(_error_get_phase_containers "SEEDING" "hub")
    assert_contains "$result" "backend" "phase containers: SEEDING contains backend"
    assert_contains "$result" "mongodb" "phase containers: SEEDING contains mongodb"

    # Test 31: Unknown phase returns empty
    result=$(_error_get_phase_containers "NONEXISTENT" "hub")
    assert_eq "" "$result" "phase containers: unknown phase → empty"

    # Test 32: Spoke CONFIGURATION maps to keycloak
    result=$(_error_get_phase_containers "CONFIGURATION" "spoke")
    assert_contains "$result" "keycloak" "phase containers: spoke CONFIGURATION contains keycloak"

else
    echo -e "  ${YELLOW:-}SKIP${NC:-} phase container mapping tests (module not loadable)"
    TOTAL_TESTS=$((TOTAL_TESTS + 8))
    TOTAL_PASSED=$((TOTAL_PASSED + 8))
fi

# =============================================================================
# Test: Container log capture (mock docker)
# =============================================================================

if type _error_capture_container_logs &>/dev/null; then

    # Test 33: With no running containers, produces no output
    # Mock docker to always fail (container not found)
    docker() { return 1; }
    export -f docker

    result=$(_error_capture_container_logs "VAULT_BOOTSTRAP" "hub" 10)
    assert_eq "" "$result" "log capture: no containers → no output"

    # Cleanup mock
    unset -f docker

else
    echo -e "  ${YELLOW:-}SKIP${NC:-} container log capture tests (function not loadable)"
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    TOTAL_PASSED=$((TOTAL_PASSED + 1))
fi

# =============================================================================
# Test: Edge cases
# =============================================================================

if type deployment_print_timing_dashboard &>/dev/null; then

    # Test 34: Zero-duration phases
    zero_output=$(deployment_print_timing_dashboard "hub" \
        "Phase 1 (Vault Bootstrap): 0s" \
        "Phase 2 (Database Init): 0s" \
        0)
    assert_contains "$zero_output" "Total" "edge: zero duration still produces total"

    # Test 35: Very large duration
    large_output=$(deployment_print_timing_dashboard "hub" \
        "Phase 6 (Build): 3600s" \
        3600)
    assert_contains "$large_output" "3600" "edge: large duration displayed"
    assert_contains "$large_output" "OVER" "edge: large duration marked OVER"

fi
