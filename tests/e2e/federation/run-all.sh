#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Federation Test Suite Runner
# =============================================================================
# Note: Requires bash 4+ for associative arrays. On macOS, install via:
#   brew install bash
# =============================================================================
# Phase 6: Unified test runner for all federation E2E tests
#
# Features:
#   - Runs all federation E2E tests
#   - Captures output and timing
#   - Generates summary report
#   - Optional JUnit XML output for CI
#   - Cleanup after tests
#
# Usage:
#   ./tests/e2e/federation/run-all.sh
#   ./tests/e2e/federation/run-all.sh --verbose
#   ./tests/e2e/federation/run-all.sh --junit output.xml
#   ./tests/e2e/federation/run-all.sh --fail-fast
#
# Exit codes:
#   0 = All tests passed
#   1 = One or more tests failed
#
# =============================================================================

set -euo pipefail

# Check bash version (need 4+ for associative arrays)
if ((BASH_VERSINFO[0] < 4)); then
    echo "Error: This script requires bash 4 or higher."
    echo "Current version: $BASH_VERSION"
    echo ""
    echo "On macOS, install modern bash with: brew install bash"
    echo "Then run with: /opt/homebrew/bin/bash $0"
    exit 1
fi

# =============================================================================
# CONFIGURATION
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="${SCRIPT_DIR}/../../.."

# Test files in order
TEST_FILES=(
    "hub-deployment.test.sh"
    "spoke-deployment.test.sh"
    "registration-flow.test.sh"
    "policy-sync.test.sh"
    "failover.test.sh"
    "multi-spoke.test.sh"
)

# Options
VERBOSE=false
FAIL_FAST=false
JUNIT_OUTPUT=""
QUIET=false

# Results (bash 4+ associative arrays)
declare -A TEST_RESULTS
declare -A TEST_DURATIONS
declare -A TEST_PASSED
declare -A TEST_FAILED
TOTAL_PASSED=0
TOTAL_FAILED=0
TOTAL_SKIPPED=0
TOTAL_DURATION=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# =============================================================================
# ARGUMENT PARSING
# =============================================================================

while [[ $# -gt 0 ]]; do
    case "$1" in
        --verbose|-v)
            VERBOSE=true
            shift
            ;;
        --fail-fast|-f)
            FAIL_FAST=true
            shift
            ;;
        --junit|-j)
            JUNIT_OUTPUT="$2"
            shift 2
            ;;
        --quiet|-q)
            QUIET=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --verbose, -v      Show detailed test output"
            echo "  --fail-fast, -f    Stop on first failure"
            echo "  --junit, -j FILE   Output JUnit XML to FILE"
            echo "  --quiet, -q        Minimal output"
            echo "  --help, -h         Show this help"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# =============================================================================
# UTILITIES
# =============================================================================

log_header() {
    if [ "$QUIET" = false ]; then
        echo ""
        echo -e "${BOLD}╔════════════════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${BOLD}║           DIVE V3 - Federation E2E Test Suite Runner                  ║${NC}"
        echo -e "${BOLD}║                         Phase 6 Testing                                ║${NC}"
        echo -e "${BOLD}╚════════════════════════════════════════════════════════════════════════╝${NC}"
        echo ""
    fi
}

log_info() {
    if [ "$QUIET" = false ]; then
        echo -e "${CYAN}[INFO]${NC} $1"
    fi
}

log_test_start() {
    if [ "$QUIET" = false ]; then
        echo ""
        echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${CYAN}  Running: $1${NC}"
        echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo ""
    fi
}

parse_test_output() {
    local output="$1"
    
    # Extract pass/fail/skip counts - ensure we get just one number
    local passed=""
    local failed=""
    local skipped=""
    
    # Try pattern "Passed: X"
    passed=$(echo "$output" | grep -oE 'Passed:[[:space:]]*[0-9]+' | tail -1 | grep -oE '[0-9]+' | head -1 || true)
    failed=$(echo "$output" | grep -oE 'Failed:[[:space:]]*[0-9]+' | tail -1 | grep -oE '[0-9]+' | head -1 || true)
    skipped=$(echo "$output" | grep -oE 'Skipped:[[:space:]]*[0-9]+' | tail -1 | grep -oE '[0-9]+' | head -1 || true)
    
    # Fallback: count [PASS] and [FAIL] markers
    if [ -z "$passed" ]; then
        passed=$(echo "$output" | grep -c '\[PASS\]' 2>/dev/null || echo "0")
    fi
    if [ -z "$failed" ]; then
        failed=$(echo "$output" | grep -c '\[FAIL\]' 2>/dev/null || echo "0")
    fi
    if [ -z "$skipped" ]; then
        skipped=$(echo "$output" | grep -c '\[SKIP\]' 2>/dev/null || echo "0")
    fi
    
    # Ensure we have valid numbers (no newlines)
    passed=$(echo "$passed" | tr -d '\n' | tr -d ' ')
    failed=$(echo "$failed" | tr -d '\n' | tr -d ' ')
    skipped=$(echo "$skipped" | tr -d '\n' | tr -d ' ')
    
    echo "${passed:-0}:${failed:-0}:${skipped:-0}"
}

# =============================================================================
# TEST RUNNER
# =============================================================================

run_tests() {
    local start_time=$(date +%s)
    local tests_run=0
    local tests_passed=0
    local tests_failed=0
    
    log_header
    
    log_info "Test Directory: ${SCRIPT_DIR}"
    log_info "Verbose: ${VERBOSE}"
    log_info "Fail Fast: ${FAIL_FAST}"
    echo ""
    
    # Find available tests
    local available_tests=()
    for test_file in "${TEST_FILES[@]}"; do
        if [ -f "${SCRIPT_DIR}/${test_file}" ]; then
            available_tests+=("$test_file")
        fi
    done
    
    log_info "Available Tests: ${#available_tests[@]}"
    for test in "${available_tests[@]}"; do
        log_info "  • ${test}"
    done
    
    # Run each test
    for test_file in "${available_tests[@]}"; do
        local test_name="${test_file%.test.sh}"
        local test_path="${SCRIPT_DIR}/${test_file}"
        
        log_test_start "$test_name"
        
        local test_start=$(date +%s)
        local output=""
        local exit_code=0
        
        # Run the test
        if [ "$VERBOSE" = true ]; then
            if bash "$test_path" 2>&1 | tee /tmp/dive-runner-output.txt; then
                exit_code=0
            else
                exit_code=1
            fi
            output=$(cat /tmp/dive-runner-output.txt)
        else
            if output=$(bash "$test_path" 2>&1); then
                exit_code=0
            else
                exit_code=1
            fi
        fi
        
        local test_end=$(date +%s)
        local test_duration=$((test_end - test_start))
        
        # Parse results
        local results=$(parse_test_output "$output")
        local passed=$(echo "$results" | cut -d: -f1)
        local failed=$(echo "$results" | cut -d: -f2)
        local skipped=$(echo "$results" | cut -d: -f3)
        
        # Store results
        TEST_DURATIONS[$test_name]=$test_duration
        TEST_PASSED[$test_name]=$passed
        TEST_FAILED[$test_name]=$failed
        
        # Update totals
        TOTAL_PASSED=$((TOTAL_PASSED + passed))
        TOTAL_FAILED=$((TOTAL_FAILED + failed))
        TOTAL_SKIPPED=$((TOTAL_SKIPPED + skipped))
        
        ((tests_run++))
        
        # Determine result
        if [ $exit_code -eq 0 ] && [ "$failed" -eq 0 ]; then
            TEST_RESULTS[$test_name]="PASS"
            ((tests_passed++))
            if [ "$QUIET" = false ]; then
                echo -e "  ${GREEN}✓ PASSED${NC} (${passed} tests, ${test_duration}s)"
            fi
        else
            TEST_RESULTS[$test_name]="FAIL"
            ((tests_failed++))
            if [ "$QUIET" = false ]; then
                echo -e "  ${RED}✗ FAILED${NC} (${passed} passed, ${failed} failed, ${test_duration}s)"
                
                # Show failure details if not verbose
                if [ "$VERBOSE" = false ]; then
                    echo ""
                    echo "  Last 20 lines of output:"
                    echo "$output" | tail -20 | sed 's/^/    /'
                fi
            fi
            
            # Stop if fail-fast
            if [ "$FAIL_FAST" = true ]; then
                log_info "Stopping due to test failure (--fail-fast)"
                break
            fi
        fi
    done
    
    local end_time=$(date +%s)
    TOTAL_DURATION=$((end_time - start_time))
    
    # Generate JUnit XML if requested
    if [ -n "$JUNIT_OUTPUT" ]; then
        generate_junit_xml > "$JUNIT_OUTPUT"
        log_info "JUnit XML written to: $JUNIT_OUTPUT"
    fi
    
    # Print summary
    print_summary
    
    # Return appropriate exit code
    if [ $tests_failed -eq 0 ]; then
        return 0
    else
        return 1
    fi
}

# =============================================================================
# SUMMARY
# =============================================================================

print_summary() {
    echo ""
    echo -e "${BOLD}╔════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║                           TEST SUMMARY                                 ║${NC}"
    echo -e "${BOLD}╚════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    # Suite results
    echo -e "${CYAN}Suite Results:${NC}"
    for test_name in "${!TEST_RESULTS[@]}"; do
        local result="${TEST_RESULTS[$test_name]}"
        local duration="${TEST_DURATIONS[$test_name]:-0}"
        local passed="${TEST_PASSED[$test_name]:-0}"
        local failed="${TEST_FAILED[$test_name]:-0}"
        
        if [ "$result" = "PASS" ]; then
            printf "  ${GREEN}✓${NC} %-25s ${GREEN}PASS${NC} (%d tests, %ds)\n" "$test_name" "$passed" "$duration"
        else
            printf "  ${RED}✗${NC} %-25s ${RED}FAIL${NC} (%d passed, %d failed, %ds)\n" "$test_name" "$passed" "$failed" "$duration"
        fi
    done
    
    echo ""
    echo -e "${CYAN}Totals:${NC}"
    echo "  Total Duration: ${TOTAL_DURATION}s"
    echo -e "  Tests Passed:   ${GREEN}${TOTAL_PASSED}${NC}"
    echo -e "  Tests Failed:   ${RED}${TOTAL_FAILED}${NC}"
    echo -e "  Tests Skipped:  ${YELLOW}${TOTAL_SKIPPED}${NC}"
    echo ""
    
    local suites_passed=0
    local suites_failed=0
    for result in "${TEST_RESULTS[@]}"; do
        if [ "$result" = "PASS" ]; then
            ((suites_passed++))
        else
            ((suites_failed++))
        fi
    done
    
    if [ $suites_failed -eq 0 ]; then
        echo -e "${GREEN}${BOLD}════════════════════════════════════════════════════════════════════════${NC}"
        echo -e "${GREEN}${BOLD}  ✓ ALL ${suites_passed} TEST SUITES PASSED!${NC}"
        echo -e "${GREEN}${BOLD}════════════════════════════════════════════════════════════════════════${NC}"
    else
        echo -e "${RED}${BOLD}════════════════════════════════════════════════════════════════════════${NC}"
        echo -e "${RED}${BOLD}  ✗ ${suites_failed} TEST SUITE(S) FAILED${NC}"
        echo -e "${RED}${BOLD}════════════════════════════════════════════════════════════════════════${NC}"
    fi
    echo ""
}

# =============================================================================
# JUNIT XML OUTPUT
# =============================================================================

generate_junit_xml() {
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    local suites_count=${#TEST_RESULTS[@]}
    local failures_count=0
    for result in "${TEST_RESULTS[@]}"; do
        if [ "$result" = "FAIL" ]; then
            ((failures_count++))
        fi
    done
    
    cat << EOF
<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="DIVE V3 Federation Tests" tests="${TOTAL_PASSED}" failures="${TOTAL_FAILED}" time="${TOTAL_DURATION}" timestamp="${timestamp}">
EOF
    
    for test_name in "${!TEST_RESULTS[@]}"; do
        local result="${TEST_RESULTS[$test_name]}"
        local duration="${TEST_DURATIONS[$test_name]:-0}"
        local passed="${TEST_PASSED[$test_name]:-0}"
        local failed="${TEST_FAILED[$test_name]:-0}"
        local total=$((passed + failed))
        
        cat << EOF
  <testsuite name="${test_name}" tests="${total}" failures="${failed}" time="${duration}">
    <testcase name="${test_name}" classname="federation" time="${duration}">
EOF
        
        if [ "$result" = "FAIL" ]; then
            cat << EOF
      <failure message="Test suite failed with ${failed} failures"/>
EOF
        fi
        
        cat << EOF
    </testcase>
  </testsuite>
EOF
    done
    
    cat << EOF
</testsuites>
EOF
}

# =============================================================================
# MAIN
# =============================================================================

# Cleanup temp files on exit
cleanup() {
    rm -f /tmp/dive-runner-output.txt
}
trap cleanup EXIT

# Run the tests
run_tests
