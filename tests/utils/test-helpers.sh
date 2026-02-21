#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Test Helpers
# =============================================================================
# Shared utilities for unit and E2E tests
# Provides assertion functions, test framework, and reporting utilities
# =============================================================================
# Version: 1.0.0
# Date: 2026-01-25
# =============================================================================

# =============================================================================
# COLOR CODES FOR TEST OUTPUT
# =============================================================================

readonly TEST_GREEN='\033[0;32m'
readonly TEST_RED='\033[0;31m'
readonly TEST_YELLOW='\033[1;33m'
readonly TEST_BLUE='\033[0;34m'
readonly TEST_NC='\033[0m'  # No Color

# =============================================================================
# TEST COUNTERS
# =============================================================================

TESTS_TOTAL=0
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Test results array
declare -a TEST_RESULTS=()

# =============================================================================
# TEST FRAMEWORK
# =============================================================================

##
# Start a test suite
#
# Arguments:
#   $1 - Suite name
##
test_suite_start() {
    local suite_name="$1"
    echo ""
    echo -e "${TEST_BLUE}╔══════════════════════════════════════════════════════════════════════════╗${TEST_NC}"
    echo -e "${TEST_BLUE}║  TEST SUITE: ${suite_name}${TEST_NC}"
    echo -e "${TEST_BLUE}╚══════════════════════════════════════════════════════════════════════════╝${TEST_NC}"
    echo ""

    # Reset counters for new suite
    TESTS_TOTAL=0
    TESTS_PASSED=0
    TESTS_FAILED=0
    TESTS_SKIPPED=0
    TEST_RESULTS=()
}

##
# Start an individual test
#
# Arguments:
#   $1 - Test name
##
test_start() {
    local test_name="$1"
    ((TESTS_TOTAL++))
    echo -n "  [$TESTS_TOTAL] $test_name ... "
}

##
# Mark test as passed
##
test_pass() {
    ((TESTS_PASSED++))
    echo -e "${TEST_GREEN}✓ PASS${TEST_NC}"
    TEST_RESULTS+=("PASS: $test_name")
}

##
# Mark test as failed
#
# Arguments:
#   $1 - Failure message
##
test_fail() {
    local message="$1"
    ((TESTS_FAILED++))
    echo -e "${TEST_RED}✗ FAIL${TEST_NC}"
    echo -e "${TEST_RED}       $message${TEST_NC}"
    TEST_RESULTS+=("FAIL: $test_name - $message")
}

##
# Mark test as skipped
#
# Arguments:
#   $1 - Reason
##
test_skip() {
    local reason="$1"
    ((TESTS_SKIPPED++))
    echo -e "${TEST_YELLOW}⊘ SKIP${TEST_NC} ($reason)"
    TEST_RESULTS+=("SKIP: $test_name - $reason")
}

##
# Print test summary
##
test_suite_end() {
    echo ""
    echo -e "${TEST_BLUE}═══════════════════════════════════════════════════════════════════════════${TEST_NC}"
    echo -e "${TEST_BLUE}  TEST SUMMARY${TEST_NC}"
    echo -e "${TEST_BLUE}═══════════════════════════════════════════════════════════════════════════${TEST_NC}"
    echo ""
    echo "  Total:   $TESTS_TOTAL"
    echo -e "  ${TEST_GREEN}Passed:  $TESTS_PASSED${TEST_NC}"
    [ $TESTS_FAILED -gt 0 ] && echo -e "  ${TEST_RED}Failed:  $TESTS_FAILED${TEST_NC}"
    [ $TESTS_SKIPPED -gt 0 ] && echo -e "  ${TEST_YELLOW}Skipped: $TESTS_SKIPPED${TEST_NC}"
    echo ""

    # Calculate pass rate
    if [ $TESTS_TOTAL -gt 0 ]; then
        local pass_rate=$((TESTS_PASSED * 100 / TESTS_TOTAL))
        echo "  Pass rate: $pass_rate%"
    fi

    echo ""

    # Exit with error if any tests failed
    if [ $TESTS_FAILED -gt 0 ]; then
        echo -e "${TEST_RED}✗ TEST SUITE FAILED${TEST_NC}"
        echo ""
        return 1
    else
        echo -e "${TEST_GREEN}✓ TEST SUITE PASSED${TEST_NC}"
        echo ""
        return 0
    fi
}

##
# Print summary (alias for backward compatibility)
##
print_test_summary() {
    test_suite_end
}

# =============================================================================
# ASSERTION FUNCTIONS
# =============================================================================

##
# Assert two values are equal
#
# Arguments:
#   $1 - Expected value
#   $2 - Actual value
#   $3 - Test name/description
#
# Returns:
#   0 - Values equal (test passes)
#   1 - Values not equal (test fails)
##
assert_eq() {
    local expected="$1"
    local actual="$2"
    local test_name="${3:-Equality check}"

    test_start "$test_name"

    if [ "$expected" = "$actual" ]; then
        test_pass
        return 0
    else
        test_fail "Expected: '$expected', Got: '$actual'"
        return 1
    fi
}

##
# Assert two values are not equal
#
# Arguments:
#   $1 - First value
#   $2 - Second value
#   $3 - Test name/description
##
assert_ne() {
    local first="$1"
    local second="$2"
    local test_name="${3:-Inequality check}"

    test_start "$test_name"

    if [ "$first" != "$second" ]; then
        test_pass
        return 0
    else
        test_fail "Values should not be equal: '$first'"
        return 1
    fi
}

##
# Assert file exists
#
# Arguments:
#   $1 - File path
#   $2 - Test name/description
##
assert_file_exists() {
    local filepath="$1"
    local test_name="${2:-File exists: $filepath}"

    test_start "$test_name"

    if [ -f "$filepath" ]; then
        test_pass
        return 0
    else
        test_fail "File not found: $filepath"
        return 1
    fi
}

##
# Assert file does not exist
#
# Arguments:
#   $1 - File path
#   $2 - Test name/description
##
assert_file_not_exists() {
    local filepath="$1"
    local test_name="${2:-File does not exist: $filepath}"

    test_start "$test_name"

    if [ ! -f "$filepath" ]; then
        test_pass
        return 0
    else
        test_fail "File exists but shouldn't: $filepath"
        return 1
    fi
}

##
# Assert path is not a directory
#
# Arguments:
#   $1 - File path
#   $2 - Test name/description
##
assert_file_not_directory() {
    local filepath="$1"
    local test_name="${2:-Path is not directory: $filepath}"

    test_start "$test_name"

    if [ -d "$filepath" ]; then
        test_fail "Path is a directory: $filepath"
        return 1
    else
        test_pass
        return 0
    fi
}

##
# Assert directory exists
#
# Arguments:
#   $1 - Directory path
#   $2 - Test name/description
##
assert_dir_exists() {
    local dirpath="$1"
    local test_name="${2:-Directory exists: $dirpath}"

    test_start "$test_name"

    if [ -d "$dirpath" ]; then
        test_pass
        return 0
    else
        test_fail "Directory not found: $dirpath"
        return 1
    fi
}

##
# Assert command succeeded
#
# Arguments:
#   $1 - Test name/description
#   $2 - Exit code to check
##
assert_command_success() {
    local test_name="$1"
    local exit_code="$2"

    test_start "$test_name"

    if [ "$exit_code" -eq 0 ]; then
        test_pass
        return 0
    else
        test_fail "Command failed with exit code: $exit_code"
        return 1
    fi
}

##
# Assert command failed
#
# Arguments:
#   $1 - Test name/description
#   $2 - Exit code to check
##
assert_command_failure() {
    local test_name="$1"
    local exit_code="$2"

    test_start "$test_name"

    if [ "$exit_code" -ne 0 ]; then
        test_pass
        return 0
    else
        test_fail "Command should have failed but succeeded"
        return 1
    fi
}

##
# Assert HTTP status code
#
# Arguments:
#   $1 - URL
#   $2 - Expected HTTP status code
#   $3 - Test name/description
##
assert_http_status() {
    local url="$1"
    local expected_code="$2"
    local test_name="${3:-HTTP status check: $url}"

    test_start "$test_name"

    local actual_code=$(curl -sk -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)

    if [ "$actual_code" = "$expected_code" ]; then
        test_pass
        return 0
    else
        test_fail "Expected HTTP $expected_code, got HTTP $actual_code"
        return 1
    fi
}

##
# Assert string contains substring
#
# Arguments:
#   $1 - Haystack (string to search in)
#   $2 - Needle (substring to find)
#   $3 - Test name/description
##
assert_contains() {
    local haystack="$1"
    local needle="$2"
    local test_name="${3:-String contains check}"

    test_start "$test_name"

    if [[ "$haystack" == *"$needle"* ]]; then
        test_pass
        return 0
    else
        test_fail "String does not contain: '$needle'"
        return 1
    fi
}

##
# Assert container is running
#
# Arguments:
#   $1 - Container name
#   $2 - Test name/description
##
assert_container_running() {
    local container="$1"
    local test_name="${2:-Container running: $container}"

    test_start "$test_name"

    if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        test_pass
        return 0
    else
        test_fail "Container not running: $container"
        return 1
    fi
}

##
# Assert container is healthy
#
# Arguments:
#   $1 - Container name
#   $2 - Test name/description
##
assert_container_healthy() {
    local container="$1"
    local test_name="${2:-Container healthy: $container}"

    test_start "$test_name"

    local health=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "not-found")

    if [ "$health" = "healthy" ]; then
        test_pass
        return 0
    else
        test_fail "Container not healthy: $container (status: $health)"
        return 1
    fi
}

##
# Assert JSON path has expected value
#
# Arguments:
#   $1 - JSON string
#   $2 - JQ path (e.g., ".realm")
#   $3 - Expected value
#   $4 - Test name/description
##
assert_json_value() {
    local json="$1"
    local jq_path="$2"
    local expected="$3"
    local test_name="${4:-JSON value check: $jq_path}"

    test_start "$test_name"

    local actual=$(echo "$json" | jq -r "$jq_path" 2>/dev/null)

    if [ "$actual" = "$expected" ]; then
        test_pass
        return 0
    else
        test_fail "Expected: '$expected', Got: '$actual'"
        return 1
    fi
}

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

##
# Wait for service to be ready
#
# Arguments:
#   $1 - Service URL
#   $2 - Max wait time in seconds
#
# Returns:
#   0 - Service ready
#   1 - Timeout
##
wait_for_service() {
    local url="$1"
    local max_wait="${2:-60}"
    local waited=0

    while [ $waited -lt $max_wait ]; do
        if curl -sf "$url" >/dev/null 2>&1; then
            return 0
        fi
        sleep 2
        waited=$((waited + 2))
    done

    return 1
}

##
# Wait for container to be healthy
#
# Arguments:
#   $1 - Container name
#   $2 - Max wait time in seconds
#
# Returns:
#   0 - Container healthy
#   1 - Timeout
##
wait_for_container_healthy() {
    local container="$1"
    local max_wait="${2:-60}"
    local waited=0

    while [ $waited -lt $max_wait ]; do
        local health=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "not-found")
        if [ "$health" = "healthy" ]; then
            return 0
        fi
        sleep 2
        waited=$((waited + 2))
    done

    return 1
}

##
# Cleanup test resources
#
# Arguments:
#   $1 - Instance code (to clean up test spoke)
##
test_cleanup() {
    local instance_code="$1"

    if [ -n "$instance_code" ]; then
        echo "Cleaning up test resources for $instance_code..."
        docker compose -f "${DIVE_ROOT}/instances/$(lower "$instance_code")/docker-compose.yml" down -v 2>/dev/null || true
        rm -rf "${DIVE_ROOT}/instances/$(lower "$instance_code")/.phases" 2>/dev/null || true
    fi
}

##
# Run command with timeout
#
# Arguments:
#   $1 - Timeout in seconds
#   $2 - Command to run
#
# Returns:
#   Exit code of command (or 124 for timeout)
##
run_with_timeout() {
    local timeout="$1"
    shift
    timeout "$timeout" "$@"
}

# =============================================================================
# EXPORT FUNCTIONS
# =============================================================================

export -f test_suite_start
export -f test_suite_end
export -f test_start
export -f test_pass
export -f test_fail
export -f test_skip
export -f assert_eq
export -f assert_ne
export -f assert_file_exists
export -f assert_file_not_exists
export -f assert_file_not_directory
export -f assert_dir_exists
export -f assert_command_success
export -f assert_command_failure
export -f assert_http_status
export -f assert_contains
export -f assert_container_running
export -f assert_container_healthy
export -f assert_json_value
export -f wait_for_service
export -f wait_for_container_healthy
export -f test_cleanup
export -f run_with_timeout
