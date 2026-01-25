#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Testing Utilities Module (Consolidated)
# =============================================================================
# Testing utilities and test framework helpers
# =============================================================================
# Version: 5.0.0 (Module Consolidation)
# Date: 2026-01-22
#
# Consolidates:
#   - orchestration-test-framework.sh
# =============================================================================

# Prevent multiple sourcing
[ -n "$DIVE_UTILITIES_TESTING_LOADED" ] && return 0
export DIVE_UTILITIES_TESTING_LOADED=1

# =============================================================================
# LOAD DEPENDENCIES
# =============================================================================

UTILITIES_DIR="$(dirname "${BASH_SOURCE[0]}")"
MODULES_DIR="$(dirname "$UTILITIES_DIR")"

if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "${MODULES_DIR}/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# TEST FRAMEWORK
# =============================================================================

# Test counters
TEST_TOTAL=0
TEST_PASSED=0
TEST_FAILED=0
TEST_SKIPPED=0

# Test output
TEST_OUTPUT=""
CURRENT_TEST=""

##
# Start a test suite
#
# Arguments:
#   $1 - Suite name
##
test_suite_start() {
    local suite_name="$1"

    TEST_TOTAL=0
    TEST_PASSED=0
    TEST_FAILED=0
    TEST_SKIPPED=0
    TEST_OUTPUT=""

    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "TEST SUITE: $suite_name"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
}

##
# End a test suite and report results
##
test_suite_end() {
    echo ""
    echo "───────────────────────────────────────────────────────────────"
    echo "RESULTS: $TEST_PASSED passed, $TEST_FAILED failed, $TEST_SKIPPED skipped (total: $TEST_TOTAL)"
    echo "───────────────────────────────────────────────────────────────"

    if [ $TEST_FAILED -gt 0 ]; then
        return 1
    fi
    return 0
}

##
# Start a test case
#
# Arguments:
#   $1 - Test name
##
test_start() {
    local test_name="$1"
    CURRENT_TEST="$test_name"
    ((TEST_TOTAL++))

    printf "  %-50s " "$test_name"
}

##
# Mark test as passed
##
test_pass() {
    ((TEST_PASSED++))
    echo "✓ PASS"
}

##
# Mark test as failed
#
# Arguments:
#   $1 - Failure reason (optional)
##
test_fail() {
    local reason="${1:-}"
    ((TEST_FAILED++))
    echo "✗ FAIL"
    [ -n "$reason" ] && echo "    Reason: $reason"
}

##
# Mark test as skipped
#
# Arguments:
#   $1 - Skip reason (optional)
##
test_skip() {
    local reason="${1:-}"
    ((TEST_SKIPPED++))
    echo "○ SKIP"
    [ -n "$reason" ] && echo "    Reason: $reason"
}

##
# Assert equality
#
# Arguments:
#   $1 - Expected value
#   $2 - Actual value
#   $3 - Message (optional)
##
assert_equals() {
    local expected="$1"
    local actual="$2"
    local message="${3:-Values should be equal}"

    if [ "$expected" = "$actual" ]; then
        test_pass
    else
        test_fail "$message (expected: $expected, actual: $actual)"
    fi
}

##
# Assert not empty
#
# Arguments:
#   $1 - Value
#   $2 - Message (optional)
##
assert_not_empty() {
    local value="$1"
    local message="${2:-Value should not be empty}"

    if [ -n "$value" ]; then
        test_pass
    else
        test_fail "$message"
    fi
}

##
# Assert command succeeds
#
# Arguments:
#   $1 - Command to run
#   $2 - Message (optional)
##
assert_success() {
    local command="$1"
    local message="${2:-Command should succeed}"

    if eval "$command" >/dev/null 2>&1; then
        test_pass
    else
        test_fail "$message"
    fi
}

##
# Assert command fails
#
# Arguments:
#   $1 - Command to run
#   $2 - Message (optional)
##
assert_failure() {
    local command="$1"
    local message="${2:-Command should fail}"

    if eval "$command" >/dev/null 2>&1; then
        test_fail "$message"
    else
        test_pass
    fi
}

##
# Assert file exists
#
# Arguments:
#   $1 - File path
#   $2 - Message (optional)
##
assert_file_exists() {
    local file="$1"
    local message="${2:-File should exist}"

    if [ -f "$file" ]; then
        test_pass
    else
        test_fail "$message ($file)"
    fi
}

##
# Assert directory exists
#
# Arguments:
#   $1 - Directory path
#   $2 - Message (optional)
##
assert_dir_exists() {
    local dir="$1"
    local message="${2:-Directory should exist}"

    if [ -d "$dir" ]; then
        test_pass
    else
        test_fail "$message ($dir)"
    fi
}

##
# Assert container is running
#
# Arguments:
#   $1 - Container name
#   $2 - Message (optional)
##
assert_container_running() {
    local container="$1"
    local message="${2:-Container should be running}"

    if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        test_pass
    else
        test_fail "$message ($container)"
    fi
}

##
# Assert container is healthy
#
# Arguments:
#   $1 - Container name
#   $2 - Message (optional)
##
assert_container_healthy() {
    local container="$1"
    local message="${2:-Container should be healthy}"

    local health=$(docker inspect "$container" --format='{{.State.Health.Status}}' 2>/dev/null || echo "not_found")

    if [ "$health" = "healthy" ]; then
        test_pass
    else
        test_fail "$message ($container status: $health)"
    fi
}

##
# Assert HTTP endpoint responds
#
# Arguments:
#   $1 - URL
#   $2 - Expected status (default: 200)
#   $3 - Message (optional)
##
assert_http_ok() {
    local url="$1"
    local expected="${2:-200}"
    local message="${3:-HTTP endpoint should respond}"

    local status=$(curl -sf -o /dev/null -w "%{http_code}" "$url" --insecure 2>/dev/null)

    if [ "$status" = "$expected" ]; then
        test_pass
    else
        test_fail "$message (status: $status, expected: $expected)"
    fi
}

# =============================================================================
# TEST UTILITIES
# =============================================================================

##
# Wait with timeout for condition
#
# Arguments:
#   $1 - Condition command
#   $2 - Timeout seconds
#   $3 - Description
##
wait_for_condition() {
    local condition="$1"
    local timeout="$2"
    local description="${3:-condition}"

    local elapsed=0
    while [ $elapsed -lt $timeout ]; do
        if eval "$condition" >/dev/null 2>&1; then
            return 0
        fi
        sleep 2
        ((elapsed += 2))
    done

    return 1
}

##
# Generate test data
#
# Arguments:
#   $1 - Type (user, resource, etc.)
#   $2 - Count
##
generate_test_data() {
    local type="$1"
    local count="${2:-1}"

    case "$type" in
        user)
            for ((i=1; i<=count; i++)); do
                echo "{\"username\":\"testuser$i\",\"email\":\"testuser$i@test.local\",\"clearance\":\"SECRET\"}"
            done
            ;;
        resource)
            for ((i=1; i<=count; i++)); do
                echo "{\"resourceId\":\"test-$i\",\"classification\":\"SECRET\",\"releasabilityTo\":[\"USA\",\"GBR\"]}"
            done
            ;;
    esac
}

##
# Clean up test artifacts
##
test_cleanup() {
    log_verbose "Cleaning up test artifacts..."

    # Remove test containers
    docker ps -a --filter "name=test-" -q | grep . | xargs docker rm -f 2>/dev/null || true

    # Remove test volumes
    docker volume ls -q --filter "name=test-" | grep . | xargs docker volume rm 2>/dev/null || true
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f test_suite_start
export -f test_suite_end
export -f test_start
export -f test_pass
export -f test_fail
export -f test_skip
export -f assert_equals
export -f assert_not_empty
export -f assert_success
export -f assert_failure
export -f assert_file_exists
export -f assert_dir_exists
export -f assert_container_running
export -f assert_container_healthy
export -f assert_http_ok
export -f wait_for_condition
export -f generate_test_data
export -f test_cleanup

log_verbose "Testing utilities module loaded"
