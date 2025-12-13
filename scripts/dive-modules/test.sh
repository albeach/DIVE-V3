#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 CLI - Test Commands Module
# =============================================================================
# Phase 6: Testing & Verification Suite
#
# Commands:
#   federation    Run all federation E2E tests
#   unit          Run backend unit tests
#   all           Run all tests (unit + e2e)
#
# Usage:
#   ./dive test federation               # Run federation E2E tests
#   ./dive test federation --verbose     # Verbose output
#   ./dive test federation --fail-fast   # Stop on first failure
#   ./dive test unit                     # Run backend unit tests
# =============================================================================

# Ensure common functions are loaded
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# CONFIGURATION
# =============================================================================

TESTS_DIR="${DIVE_ROOT}/tests"
E2E_FEDERATION_DIR="${TESTS_DIR}/e2e/federation"
BACKEND_DIR="${DIVE_ROOT}/backend"

# Test results
TOTAL_PASSED=0
TOTAL_FAILED=0
TOTAL_SKIPPED=0
TEST_START_TIME=""

# Options
VERBOSE=false
FAIL_FAST=false
OUTPUT_FORMAT="summary"  # summary, junit, json

# Colors (ensure they're set)
GREEN="${GREEN:-\033[0;32m}"
RED="${RED:-\033[0;31m}"
YELLOW="${YELLOW:-\033[1;33m}"
CYAN="${CYAN:-\033[0;36m}"
BOLD="${BOLD:-\033[1m}"
NC="${NC:-\033[0m}"

# =============================================================================
# TEST UTILITIES
# =============================================================================

test_log_header() {
    echo ""
    echo -e "${BOLD}╔════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║                    DIVE V3 - Federation Test Suite                     ║${NC}"
    echo -e "${BOLD}║                           Phase 6 Testing                              ║${NC}"
    echo -e "${BOLD}╚════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

test_log_section() {
    local name="$1"
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  ${name}${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

test_log_result() {
    local name="$1"
    local passed="$2"
    local failed="$3"
    local skipped="${4:-0}"
    local duration="${5:-0}"
    
    if [ "$failed" -eq 0 ]; then
        echo -e "  ${GREEN}✓${NC} ${name}: ${GREEN}PASS${NC} (${passed} passed, ${skipped} skipped, ${duration}s)"
    else
        echo -e "  ${RED}✗${NC} ${name}: ${RED}FAIL${NC} (${passed} passed, ${failed} failed, ${duration}s)"
    fi
}

parse_test_output() {
    local output="$1"
    
    # Try to extract pass/fail counts from test output
    # Format varies by test script, so we try multiple patterns
    
    # Pattern 1: "Passed: X", "Failed: Y"
    local passed=$(echo "$output" | grep -oE 'Passed:[[:space:]]*[0-9]+' | tail -1 | grep -oE '[0-9]+')
    local failed=$(echo "$output" | grep -oE 'Failed:[[:space:]]*[0-9]+' | tail -1 | grep -oE '[0-9]+')
    local skipped=$(echo "$output" | grep -oE 'Skipped:[[:space:]]*[0-9]+' | tail -1 | grep -oE '[0-9]+')
    
    # Pattern 2: "[PASS]" and "[FAIL]" counts
    if [ -z "$passed" ]; then
        passed=$(echo "$output" | grep -c '\[PASS\]' || echo "0")
    fi
    if [ -z "$failed" ]; then
        failed=$(echo "$output" | grep -c '\[FAIL\]' || echo "0")
    fi
    if [ -z "$skipped" ]; then
        skipped=$(echo "$output" | grep -c '\[SKIP\]' || echo "0")
    fi
    
    echo "${passed:-0}:${failed:-0}:${skipped:-0}"
}

# =============================================================================
# FEDERATION E2E TESTS
# =============================================================================

test_federation() {
    local start_time=$(date +%s)
    
    test_log_header
    
    echo -e "${CYAN}Configuration:${NC}"
    echo "  Tests Directory: ${E2E_FEDERATION_DIR}"
    echo "  Verbose: ${VERBOSE}"
    echo "  Fail Fast: ${FAIL_FAST}"
    echo ""
    
    # Check if tests directory exists
    if [ ! -d "$E2E_FEDERATION_DIR" ]; then
        log_error "Federation tests directory not found: ${E2E_FEDERATION_DIR}"
        return 1
    fi
    
    # Find all test scripts
    local test_files=(
        "hub-deployment.test.sh"
        "spoke-deployment.test.sh"
        "registration-flow.test.sh"
        "policy-sync.test.sh"
        "failover.test.sh"
        "multi-spoke.test.sh"
    )
    
    local available_tests=()
    for test_file in "${test_files[@]}"; do
        if [ -f "${E2E_FEDERATION_DIR}/${test_file}" ]; then
            available_tests+=("$test_file")
        fi
    done
    
    if [ ${#available_tests[@]} -eq 0 ]; then
        log_error "No test files found in ${E2E_FEDERATION_DIR}"
        return 1
    fi
    
    echo -e "${CYAN}Available Tests:${NC}"
    for test_file in "${available_tests[@]}"; do
        echo "  • ${test_file}"
    done
    echo ""
    
    # Run each test
    local suite_passed=0
    local suite_failed=0
    local suite_results=()
    
    for test_file in "${available_tests[@]}"; do
        local test_name="${test_file%.test.sh}"
        local test_path="${E2E_FEDERATION_DIR}/${test_file}"
        
        test_log_section "Running: ${test_name}"
        
        local test_start=$(date +%s)
        local output=""
        local exit_code=0
        
        # Run the test
        if [ "$VERBOSE" = true ]; then
            # Show output in real-time
            bash "$test_path" 2>&1 | tee /tmp/dive-test-output.txt
            exit_code=${PIPESTATUS[0]}
            output=$(cat /tmp/dive-test-output.txt)
        else
            output=$(bash "$test_path" 2>&1)
            exit_code=$?
        fi
        
        local test_end=$(date +%s)
        local test_duration=$((test_end - test_start))
        
        # Parse results
        local results=$(parse_test_output "$output")
        local passed=$(echo "$results" | cut -d: -f1)
        local failed=$(echo "$results" | cut -d: -f2)
        local skipped=$(echo "$results" | cut -d: -f3)
        
        # Update totals
        TOTAL_PASSED=$((TOTAL_PASSED + passed))
        TOTAL_FAILED=$((TOTAL_FAILED + failed))
        TOTAL_SKIPPED=$((TOTAL_SKIPPED + skipped))
        
        # Record result
        if [ $exit_code -eq 0 ] && [ "$failed" -eq 0 ]; then
            ((suite_passed++))
            suite_results+=("PASS:${test_name}:${passed}:${failed}:${skipped}:${test_duration}")
        else
            ((suite_failed++))
            suite_results+=("FAIL:${test_name}:${passed}:${failed}:${skipped}:${test_duration}")
            
            # Show failure output if not verbose
            if [ "$VERBOSE" != true ]; then
                echo "$output" | tail -30
            fi
            
            # Stop if fail-fast
            if [ "$FAIL_FAST" = true ]; then
                log_error "Stopping due to test failure (--fail-fast)"
                break
            fi
        fi
    done
    
    # Summary
    local end_time=$(date +%s)
    local total_duration=$((end_time - start_time))
    
    echo ""
    echo -e "${BOLD}╔════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║                           TEST SUMMARY                                 ║${NC}"
    echo -e "${BOLD}╚════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    echo -e "${CYAN}Suite Results:${NC}"
    for result in "${suite_results[@]}"; do
        local status=$(echo "$result" | cut -d: -f1)
        local name=$(echo "$result" | cut -d: -f2)
        local p=$(echo "$result" | cut -d: -f3)
        local f=$(echo "$result" | cut -d: -f4)
        local s=$(echo "$result" | cut -d: -f5)
        local d=$(echo "$result" | cut -d: -f6)
        
        test_log_result "$name" "$p" "$f" "$s" "$d"
    done
    
    echo ""
    echo -e "${CYAN}Totals:${NC}"
    echo "  Total Duration: ${total_duration}s"
    echo -e "  Tests Passed:   ${GREEN}${TOTAL_PASSED}${NC}"
    echo -e "  Tests Failed:   ${RED}${TOTAL_FAILED}${NC}"
    echo -e "  Tests Skipped:  ${YELLOW}${TOTAL_SKIPPED}${NC}"
    echo ""
    
    if [ $suite_failed -eq 0 ]; then
        echo -e "${GREEN}${BOLD}════════════════════════════════════════════════════════════════════════${NC}"
        echo -e "${GREEN}${BOLD}  ✓ ALL ${suite_passed} TEST SUITES PASSED!${NC}"
        echo -e "${GREEN}${BOLD}════════════════════════════════════════════════════════════════════════${NC}"
        echo ""
        return 0
    else
        echo -e "${RED}${BOLD}════════════════════════════════════════════════════════════════════════${NC}"
        echo -e "${RED}${BOLD}  ✗ ${suite_failed} TEST SUITE(S) FAILED${NC}"
        echo -e "${RED}${BOLD}════════════════════════════════════════════════════════════════════════${NC}"
        echo ""
        return 1
    fi
}

# =============================================================================
# UNIT TESTS
# =============================================================================

test_unit() {
    test_log_header
    
    echo -e "${CYAN}Running Backend Unit Tests${NC}"
    echo ""
    
    if [ ! -d "$BACKEND_DIR" ]; then
        log_error "Backend directory not found: ${BACKEND_DIR}"
        return 1
    fi
    
    cd "$BACKEND_DIR"
    
    if [ ! -f "package.json" ]; then
        log_error "No package.json found in backend directory"
        return 1
    fi
    
    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        log_info "Installing dependencies..."
        npm install
    fi
    
    # Run tests
    if [ "$VERBOSE" = true ]; then
        npm test -- --verbose
    else
        npm test
    fi
    
    local exit_code=$?
    
    cd "$DIVE_ROOT"
    
    return $exit_code
}

# =============================================================================
# ALL TESTS
# =============================================================================

test_all() {
    local unit_result=0
    local federation_result=0
    
    test_log_header
    echo -e "${BOLD}Running All Tests${NC}"
    echo ""
    
    # Run unit tests
    test_log_section "Unit Tests"
    test_unit
    unit_result=$?
    
    # Run federation tests
    test_log_section "Federation E2E Tests"
    test_federation
    federation_result=$?
    
    # Summary
    echo ""
    echo -e "${BOLD}Final Results:${NC}"
    if [ $unit_result -eq 0 ]; then
        echo -e "  Unit Tests:       ${GREEN}PASS${NC}"
    else
        echo -e "  Unit Tests:       ${RED}FAIL${NC}"
    fi
    if [ $federation_result -eq 0 ]; then
        echo -e "  Federation Tests: ${GREEN}PASS${NC}"
    else
        echo -e "  Federation Tests: ${RED}FAIL${NC}"
    fi
    
    if [ $unit_result -eq 0 ] && [ $federation_result -eq 0 ]; then
        return 0
    else
        return 1
    fi
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

module_test() {
    local command="${1:-help}"
    shift || true
    
    # Parse options
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
            --output|-o)
                OUTPUT_FORMAT="$2"
                shift 2
                ;;
            *)
                shift
                ;;
        esac
    done
    
    case "$command" in
        federation|fed|e2e)
            test_federation
            ;;
        unit|backend)
            test_unit
            ;;
        all)
            test_all
            ;;
        help|*)
            module_test_help
            ;;
    esac
}

module_test_help() {
    echo -e "${BOLD}DIVE Test Commands (Phase 6):${NC}"
    echo ""
    echo -e "${CYAN}Test Suites:${NC}"
    echo "  federation          Run all federation E2E tests"
    echo "  unit                Run backend unit tests (Jest)"
    echo "  all                 Run all tests (unit + e2e)"
    echo ""
    echo -e "${CYAN}Options:${NC}"
    echo "  --verbose, -v       Show detailed test output"
    echo "  --fail-fast, -f     Stop on first failure"
    echo ""
    echo -e "${CYAN}Examples:${NC}"
    echo "  ./dive test federation"
    echo "  ./dive test federation --verbose"
    echo "  ./dive test federation --fail-fast"
    echo "  ./dive test unit"
    echo "  ./dive test all"
    echo ""
    echo -e "${CYAN}Federation Test Suites:${NC}"
    echo "  • hub-deployment      Hub deployment and health"
    echo "  • spoke-deployment    Spoke deployment and verification"
    echo "  • registration-flow   Spoke registration and approval"
    echo "  • policy-sync         Policy distribution and scoping"
    echo "  • failover            Circuit breaker and resilience"
    echo "  • multi-spoke         Multi-spoke concurrent testing"
}
