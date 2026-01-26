#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Test Helper Utilities
# =============================================================================
# Common functions for bats tests
# =============================================================================

# Load common test assertions
load_test_helpers() {
    # Add bats-support and bats-assert if available
    if [ -d "/opt/homebrew/lib" ]; then
        export BATS_LIB_PATH="/opt/homebrew/lib"
    fi
}

# Check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Assert file exists
assert_file_exists() {
    local file="$1"
    if [ ! -f "$file" ]; then
        echo "File does not exist: $file"
        return 1
    fi
}

# Assert directory exists
assert_dir_exists() {
    local dir="$1"
    if [ ! -d "$dir" ]; then
        echo "Directory does not exist: $dir"
        return 1
    fi
}

# Assert string contains substring
assert_contains() {
    local haystack="$1"
    local needle="$2"
    if [[ ! "$haystack" =~ "$needle" ]]; then
        echo "String does not contain expected substring"
        echo "Expected: $needle"
        echo "Got: $haystack"
        return 1
    fi
}

# Skip test if not in CI environment
skip_if_not_ci() {
    if [ -z "$CI" ]; then
        skip "Test requires CI environment"
    fi
}

# Skip test if Docker is not running
skip_if_no_docker() {
    if ! command_exists docker; then
        skip "Docker not installed"
    fi
    
    if ! docker ps >/dev/null 2>&1; then
        skip "Docker daemon not running"
    fi
}

# Setup test environment
setup_test_env() {
    export DIVE_TEST_MODE=true
    export VERBOSE=false
    export QUIET=true
}

# Cleanup test environment
teardown_test_env() {
    unset DIVE_TEST_MODE
    unset VERBOSE
    unset QUIET
}

# Print test section header
test_header() {
    local message="$1"
    echo "==================================="
    echo "$message"
    echo "==================================="
}

# Measure execution time
time_execution() {
    local start=$(date +%s)
    "$@"
    local end=$(date +%s)
    local duration=$((end - start))
    echo "Execution time: ${duration}s"
}

# Export functions for use in tests
export -f command_exists
export -f assert_file_exists
export -f assert_dir_exists
export -f assert_contains
export -f skip_if_not_ci
export -f skip_if_no_docker
export -f setup_test_env
export -f teardown_test_env
export -f test_header
export -f time_execution
