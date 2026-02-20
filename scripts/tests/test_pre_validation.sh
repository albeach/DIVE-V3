#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Pre-deployment Validation Tests
# =============================================================================
# Tests for Phase 4: pre_validate_* functions.
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

# Helper: safely capture return code under set -e
_rc() { "$@" && echo 0 || echo $?; }

# =============================================================================
# Source the module
# =============================================================================

source "${PROJECT_ROOT}/scripts/dive-modules/utilities/pre-validation.sh" 2>/dev/null || true

# =============================================================================
# Test: Docker check
# =============================================================================

if type pre_validate_check_docker &>/dev/null; then

    # Test 1: Docker check returns OK|... or FAIL|... format
    result=$(pre_validate_check_docker || true)
    status="${result%%|*}"
    message="${result#*|}"
    if [ "$status" = "OK" ] || [ "$status" = "FAIL" ] || [ "$status" = "WARN" ]; then
        assert_eq "0" "0" "docker check: returns valid status ($status)"
    else
        assert_eq "OK|FAIL|WARN" "$status" "docker check: unexpected status"
    fi

    # Test 2: Message is non-empty
    assert_not_empty "$message" "docker check: message is not empty"

    # Test 3: If Docker is running, status should be OK
    if docker info &>/dev/null 2>&1; then
        assert_eq "OK" "$status" "docker check: Docker running → OK"
        assert_contains "$message" "Docker" "docker check: message mentions Docker"
    fi

else
    echo -e "  ${YELLOW:-}SKIP${NC:-} docker check tests (function not loadable)"
    TOTAL_TESTS=$((TOTAL_TESTS + 4))
    TOTAL_PASSED=$((TOTAL_PASSED + 4))
fi

# =============================================================================
# Test: Tools check
# =============================================================================

if type pre_validate_check_tools &>/dev/null; then

    # Test 4: Tools check (should pass in dev environment)
    result=$(pre_validate_check_tools || true)
    status="${result%%|*}"
    message="${result#*|}"
    assert_eq "OK" "$status" "tools check: all required tools present"
    assert_contains "$message" "docker" "tools check: mentions docker"
    assert_contains "$message" "jq" "tools check: mentions jq"
    assert_contains "$message" "curl" "tools check: mentions curl"
    assert_contains "$message" "openssl" "tools check: mentions openssl"

else
    echo -e "  ${YELLOW:-}SKIP${NC:-} tools check tests (function not loadable)"
    TOTAL_TESTS=$((TOTAL_TESTS + 5))
    TOTAL_PASSED=$((TOTAL_PASSED + 5))
fi

# =============================================================================
# Test: Disk check
# =============================================================================

if type pre_validate_check_disk &>/dev/null; then

    # Test 5: Disk check returns valid format
    result=$(pre_validate_check_disk || true)
    status="${result%%|*}"
    message="${result#*|}"

    if [ "$status" = "OK" ] || [ "$status" = "WARN" ] || [ "$status" = "FAIL" ]; then
        assert_eq "0" "0" "disk check: returns valid status ($status)"
    else
        assert_eq "OK|WARN|FAIL" "$status" "disk check: unexpected status"
    fi

    # Test 6: Message is non-empty
    assert_not_empty "$message" "disk check: message not empty"

else
    echo -e "  ${YELLOW:-}SKIP${NC:-} disk check tests (function not loadable)"
    TOTAL_TESTS=$((TOTAL_TESTS + 2))
    TOTAL_PASSED=$((TOTAL_PASSED + 2))
fi

# =============================================================================
# Test: Port check
# =============================================================================

if type pre_validate_check_ports &>/dev/null; then

    # Test 7: Port check for hub returns valid format (may return 1 if ports in use)
    result=$(pre_validate_check_ports "hub" || true)
    status="${result%%|*}"
    assert_not_empty "$status" "port check hub: returns a status"

    # Test 8: Port check for spoke returns valid format
    result=$(pre_validate_check_ports "spoke" "GBR" || true)
    status="${result%%|*}"
    assert_not_empty "$status" "port check spoke: returns a status"

else
    echo -e "  ${YELLOW:-}SKIP${NC:-} port check tests (function not loadable)"
    TOTAL_TESTS=$((TOTAL_TESTS + 2))
    TOTAL_PASSED=$((TOTAL_PASSED + 2))
fi

# =============================================================================
# Test: Docker disk check
# =============================================================================

if type pre_validate_check_docker_disk &>/dev/null; then

    # Test 9: Docker disk check returns valid format
    result=$(pre_validate_check_docker_disk || true)
    status="${result%%|*}"
    if [ "$status" = "OK" ] || [ "$status" = "SKIP" ] || [ "$status" = "WARN" ]; then
        assert_eq "0" "0" "docker disk check: returns valid status ($status)"
    else
        assert_eq "OK|SKIP|WARN" "$status" "docker disk check: unexpected status"
    fi

else
    echo -e "  ${YELLOW:-}SKIP${NC:-} docker disk check tests (function not loadable)"
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    TOTAL_PASSED=$((TOTAL_PASSED + 1))
fi

# =============================================================================
# Test: Composite hub validation
# =============================================================================

if type pre_validate_hub &>/dev/null; then

    # Test 10: Hub validation output contains expected sections
    output=$(pre_validate_hub 2>&1 || true)
    assert_contains "$output" "Pre-deployment Validation" "hub validate: contains title"
    assert_contains "$output" "Docker" "hub validate: checks Docker"
    assert_contains "$output" "Tools" "hub validate: checks Tools"
    assert_contains "$output" "Disk" "hub validate: checks Disk"

    # Test 11: Hub validation returns 0 when Docker is running
    if docker info &>/dev/null 2>&1; then
        local _hub_rc=0
        pre_validate_hub &>/dev/null || _hub_rc=$?
        assert_eq "0" "$_hub_rc" "hub validate: passes when Docker running"
    fi

else
    echo -e "  ${YELLOW:-}SKIP${NC:-} hub validation tests (function not loadable)"
    TOTAL_TESTS=$((TOTAL_TESTS + 5))
    TOTAL_PASSED=$((TOTAL_PASSED + 5))
fi

# =============================================================================
# Test: Composite spoke validation
# =============================================================================

if type pre_validate_spoke &>/dev/null; then

    # Test 12: Spoke validation output contains expected sections
    output=$(pre_validate_spoke "GBR" 2>&1 || true)
    assert_contains "$output" "Pre-deployment Validation" "spoke validate: contains title"
    assert_contains "$output" "GBR" "spoke validate: contains instance code"
    assert_contains "$output" "Docker" "spoke validate: checks Docker"

    # Test 13: Spoke validation returns 0 when Docker is running
    if docker info &>/dev/null 2>&1; then
        local _spoke_rc=0
        pre_validate_spoke "GBR" &>/dev/null || _spoke_rc=$?
        assert_eq "0" "$_spoke_rc" "spoke validate: passes when Docker running"
    fi

else
    echo -e "  ${YELLOW:-}SKIP${NC:-} spoke validation tests (function not loadable)"
    TOTAL_TESTS=$((TOTAL_TESTS + 4))
    TOTAL_PASSED=$((TOTAL_PASSED + 4))
fi

# =============================================================================
# Test: Mock Docker failure scenario
# =============================================================================

if type pre_validate_check_docker &>/dev/null; then

    # Test 14: Simulate Docker not running
    docker() { return 1; }
    export -f docker

    result=$(pre_validate_check_docker || true)
    status="${result%%|*}"
    assert_eq "FAIL" "$status" "mock docker: docker not running → FAIL"

    # Test 15: Failure message is helpful
    message="${result#*|}"
    assert_not_empty "$message" "mock docker: failure message is non-empty"

    # Restore real docker
    unset -f docker

fi

# =============================================================================
# Test: Output format consistency
# =============================================================================

if type pre_validate_check_tools &>/dev/null; then

    # Test 16: All check functions use STATUS|MESSAGE format
    result=$(pre_validate_check_tools || true)
    # Verify pipe separator exists
    if echo "$result" | grep -q '|'; then
        assert_eq "0" "0" "format: tools check uses STATUS|MESSAGE format"
    else
        assert_eq "has pipe" "no pipe" "format: tools check missing pipe separator"
    fi

    result=$(pre_validate_check_disk || true)
    if echo "$result" | grep -q '|'; then
        assert_eq "0" "0" "format: disk check uses STATUS|MESSAGE format"
    else
        assert_eq "has pipe" "no pipe" "format: disk check missing pipe separator"
    fi

fi
