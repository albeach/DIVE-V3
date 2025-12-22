#!/usr/local/bin/bash
# =============================================================================
# DIVE V3 CLI - Test Commands Module
# =============================================================================
# Phase 6: Testing & Verification Suite
#
# Commands:
#   federation    Run all federation E2E tests
#   unit          Run backend unit tests
#   playwright    Run dynamic Playwright E2E tests
#   instances     Test all running hub-spoke instances
#   all           Run all tests (unit + e2e + playwright)
#
# Usage:
#   ./dive test federation               # Run federation E2E tests
#   ./dive test federation --verbose     # Verbose output
#   ./dive test federation --fail-fast   # Stop on first failure
#   ./dive test unit                     # Run backend unit tests
#   ./dive test playwright               # Run dynamic Playwright tests
#   ./dive test instances                # Test all running instances
#   ./dive test instances --parallel     # Test in parallel
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

    # Pattern 1: "Passed: X", "Failed: Y" (from hub-deployment.test.sh)
    local passed=$(echo "$output" | grep -E 'Passed:[[:space:]]*[0-9]+' | sed -E 's/.*Passed:[[:space:]]*([0-9]+).*/\1/' | tail -1)
    local failed=$(echo "$output" | grep -E 'Failed:[[:space:]]*[0-9]+' | sed -E 's/.*Failed:[[:space:]]*([0-9]+).*/\1/' | tail -1)
    local skipped=$(echo "$output" | grep -E 'Skipped:[[:space:]]*[0-9]+' | sed -E 's/.*Skipped:[[:space:]]*([0-9]+).*/\1/' | tail -1)

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

    # Ensure we have numeric values
    passed=${passed:-0}
    failed=${failed:-0}
    skipped=${skipped:-0}

    echo "${passed}:${failed}:${skipped}"
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
# DYNAMIC PLAYWRIGHT TESTS
# =============================================================================

test_playwright() {
    local playwright_script="${DIVE_ROOT}/scripts/dynamic-test-runner.sh"

    if [ ! -f "$playwright_script" ]; then
        log_error "Dynamic test runner not found: ${playwright_script}"
        log_info "Run: git pull && chmod +x scripts/dynamic-test-runner.sh"
        return 1
    fi

    log_info "Running Dynamic Playwright E2E Tests..."
    echo ""

    # Forward all arguments to the dynamic runner
    bash "$playwright_script" "$@"
}

test_instances() {
    echo "DEBUG: test_instances called with $# arguments: $@"

    local parallel=false
    local specific_instance=""
    local dry_run=false

    # Parse instance-specific options and positional arguments
    while [[ $# -gt 0 ]]; do
        echo "DEBUG: Processing argument: '$1'"
        case $1 in
            --parallel|-p)
                parallel=true
                echo "DEBUG: Set parallel=true"
                shift
                ;;
            --dry-run|-d)
                dry_run=true
                echo "DEBUG: Set dry_run=true"
                shift
                ;;
            # Handle instance code as positional argument (ALB, DNK, GBR, etc.)
            [A-Z][A-Z][A-Z])
                if [ -z "$specific_instance" ]; then
                    specific_instance="$1"
                    echo "DEBUG: Found instance code: $specific_instance"
                fi
                shift
                ;;
            *)
                echo "DEBUG: Unknown argument in test_instances: '$1'"
                shift
                ;;
        esac
    done

    echo ""
    echo -e "${BOLD}${CYAN}Testing All Running Hub-Spoke Instances${NC}"
    echo -e "${CYAN}$(printf '%.0s=' {1..50})${NC}"

    log_info "Parsed: parallel=$parallel, instance=$specific_instance, dry_run=$dry_run"

    # Build arguments for the dynamic runner
    local args=()
    if [ "$parallel" = true ]; then
        args+=("--parallel")
    fi
    if [ "$dry_run" = true ]; then
        args+=("--dry-run")
    fi
    if [ -n "$specific_instance" ]; then
        args+=("--instance")
        args+=("$specific_instance")
    fi

    log_info "Number of args: ${#args[@]}"
    for i in "${!args[@]}"; do
        log_info "  args[$i]: '${args[$i]}'"
    done

    # Run the dynamic test runner
    test_playwright "${args[@]}"
}

test_instances() {
    local parallel=false
    local specific_instance=""
    local dry_run=false

    # Parse instance-specific options and positional arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --parallel|-p)
                parallel=true
                shift
                ;;
            --dry-run|-d)
                dry_run=true
                shift
                ;;
            # Handle instance code as positional argument (ALB, DNK, GBR, etc.)
            [A-Z][A-Z][A-Z])
                if [ -z "$specific_instance" ]; then
                    specific_instance="$1"
                fi
                shift
                ;;
            *)
                shift
                ;;
        esac
    done

    echo ""
    echo -e "${BOLD}${CYAN}Testing All Running Hub-Spoke Instances${NC}"
    echo -e "${CYAN}$(printf '%.0s=' {1..50})${NC}"

    # Build arguments array for the dynamic runner
    local args=()
    if [ "$parallel" = true ]; then
        args+=("--parallel")
    fi
    if [ "$dry_run" = true ]; then
        args+=("--dry-run")
    fi
    if [ -n "$specific_instance" ]; then
        args+=("--instance")
        args+=("$specific_instance")
    fi

    # Run the dynamic test runner
    test_playwright "${args[@]}"
}

# =============================================================================
# ALL TESTS
# =============================================================================

test_all() {
    local unit_result=0
    local federation_result=0
    local playwright_result=0

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

    # Run Playwright tests
    test_log_section "Dynamic Playwright E2E Tests"
    test_playwright --parallel
    playwright_result=$?

    # Summary
    echo ""
    echo -e "${BOLD}Final Results:${NC}"
    if [ $unit_result -eq 0 ]; then
        echo -e "  Unit Tests:         ${GREEN}PASS${NC}"
    else
        echo -e "  Unit Tests:         ${RED}FAIL${NC}"
    fi
    if [ $federation_result -eq 0 ]; then
        echo -e "  Federation Tests:   ${GREEN}PASS${NC}"
    else
        echo -e "  Federation Tests:   ${RED}FAIL${NC}"
    fi
    if [ $playwright_result -eq 0 ]; then
        echo -e "  Playwright Tests:   ${GREEN}PASS${NC}"
    else
        echo -e "  Playwright Tests:   ${RED}FAIL${NC}"
    fi

    if [ $unit_result -eq 0 ] && [ $federation_result -eq 0 ] && [ $playwright_result -eq 0 ]; then
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

    # Parse options - handle test-specific flags that might conflict with global CLI flags
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
            --parallel|-p)
                PARALLEL=true
                shift
                ;;
            --dry-run|-d)
                DRY_RUN=true
                shift
                ;;
            # Handle instance flag carefully (might conflict with global --instance)
            instance|--instance|-i)
                if [[ "$2" != --* && -n "$2" ]]; then
                    SPECIFIC_INSTANCE="$2"
                    shift 2
                else
                    shift
                fi
                ;;
            *)
                # Pass through unrecognized options to the underlying test runner
                break
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
        playwright|e2e-new|dynamic)
            test_playwright "$@"
            ;;
        instances|hub-spoke)
            test_instances "$@"
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
    echo "  playwright          Run dynamic Playwright E2E tests"
    echo "  instances           Test all running hub-spoke instances"
    echo "  all                 Run all tests (unit + e2e + playwright)"
    echo ""
    echo -e "${CYAN}Options:${NC}"
    echo "  --verbose, -v       Show detailed test output"
    echo "  --fail-fast, -f     Stop on first failure"
    echo "  --parallel, -p      Run tests in parallel (instances command)"
    echo "  --dry-run, -d       Show what would run without executing"
    echo ""
    echo -e "${CYAN}Arguments:${NC}"
    echo "  <CODE>              NATO country code (ALB, DNK, GBR, ROU, etc.) for instances command"
    echo ""
    echo -e "${CYAN}Examples:${NC}"
    echo "  ./dive test federation"
    echo "  ./dive test federation --verbose"
    echo "  ./dive test federation --fail-fast"
    echo "  ./dive test unit"
    echo "  ./dive test playwright"
    echo "  ./dive test instances"
    echo "  ./dive test instances --parallel"
    echo "  ./dive test instances ALB"
    echo "  ./dive test instances --dry-run --verbose"
    echo "  ./dive test all"
    echo ""
    echo -e "${CYAN}Federation Test Suites:${NC}"
    echo "  • hub-deployment      Hub deployment and health"
    echo "  • spoke-deployment    Spoke deployment and verification"
    echo "  • registration-flow   Spoke registration and approval"
    echo "  • policy-sync         Policy distribution and scoping"
    echo "  • failover            Circuit breaker and resilience"
    echo "  • multi-spoke         Multi-spoke concurrent testing"
    echo ""
    echo -e "${CYAN}Dynamic Playwright Features:${NC}"
    echo "  • Auto-detects running Docker instances"
    echo "  • Tests hub (USA) and all NATO spoke instances"
    echo "  • Generates instance-specific test configurations"
    echo "  • Parallel execution across multiple instances"
    echo "  • Federation testing across hub-spoke boundaries"
}
