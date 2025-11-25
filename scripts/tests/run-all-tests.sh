#!/usr/bin/env bash

# =============================================================================
# DIVE V3 Pilot - Comprehensive Test Suite
# =============================================================================
# Runs all phase test suites and generates a comprehensive report.
# 
# Usage:
#   ./scripts/tests/run-all-tests.sh [--verbose] [--json]
#
# Options:
#   --verbose    Show full output from each test suite
#   --json       Output results in JSON format
# =============================================================================

set +e  # Don't exit on individual test failures

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Options
VERBOSE=false
JSON_OUTPUT=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --verbose|-v)
            VERBOSE=true
            shift
            ;;
        --json)
            JSON_OUTPUT=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [--verbose] [--json]"
            echo ""
            echo "Options:"
            echo "  --verbose, -v   Show full output from each test suite"
            echo "  --json          Output results in JSON format"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Track results
declare -a PHASE_NAMES=()
declare -a PHASE_RESULTS=()
declare -a PHASE_TESTS=()
declare -a PHASE_PASSED=()
declare -a PHASE_FAILED=()
declare -a PHASE_TIMES=()

TOTAL_TESTS=0
TOTAL_PASSED=0
TOTAL_FAILED=0
START_TIME=$(date +%s)

# Function to run a test suite
run_test_suite() {
    local name="$1"
    local script="$2"
    
    if [[ ! -f "$script" ]]; then
        PHASE_NAMES+=("$name")
        PHASE_RESULTS+=("SKIP")
        PHASE_TESTS+=(0)
        PHASE_PASSED+=(0)
        PHASE_FAILED+=(0)
        PHASE_TIMES+=(0)
        return
    fi
    
    local suite_start=$(date +%s)
    local output
    local exit_code
    
    if [[ "$VERBOSE" == "true" ]]; then
        echo -e "\n${CYAN}Running: $name${NC}"
        output=$("$script" 2>&1)
        exit_code=$?
        echo "$output"
    else
        output=$("$script" 2>&1)
        exit_code=$?
    fi
    
    local suite_end=$(date +%s)
    local suite_time=$((suite_end - suite_start))
    
    # Parse results from output
    local tests=$(echo "$output" | grep -oE "Tests Run:\s+[0-9]+" | grep -oE "[0-9]+" | tail -1)
    local passed=$(echo "$output" | grep -oE "Passed:\s+[^\s0-9]*[0-9]+" | grep -oE "[0-9]+" | tail -1)
    local failed=$(echo "$output" | grep -oE "Failed:\s+[^\s0-9]*[0-9]+" | grep -oE "[0-9]+" | tail -1)
    
    # Default values if parsing failed
    tests=${tests:-0}
    passed=${passed:-0}
    failed=${failed:-0}
    
    PHASE_NAMES+=("$name")
    if [[ $exit_code -eq 0 ]]; then
        PHASE_RESULTS+=("PASS")
    else
        PHASE_RESULTS+=("FAIL")
    fi
    PHASE_TESTS+=("$tests")
    PHASE_PASSED+=("$passed")
    PHASE_FAILED+=("$failed")
    PHASE_TIMES+=("$suite_time")
    
    TOTAL_TESTS=$((TOTAL_TESTS + tests))
    TOTAL_PASSED=$((TOTAL_PASSED + passed))
    TOTAL_FAILED=$((TOTAL_FAILED + failed))
}

# Header
if [[ "$JSON_OUTPUT" != "true" ]]; then
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║           DIVE V3 PILOT - COMPREHENSIVE TEST SUITE                    ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "Project Root: ${CYAN}$PROJECT_ROOT${NC}"
    echo -e "Started: ${CYAN}$(date)${NC}"
    echo ""
fi

# Run all test suites
if [[ "$JSON_OUTPUT" != "true" ]]; then
    echo -e "${BLUE}Running test suites...${NC}"
    echo ""
fi

run_test_suite "Phase 1: Deploy Script" "$SCRIPT_DIR/test-phase1-deploy.sh"
run_test_suite "Phase 1: Test Users" "$SCRIPT_DIR/test-phase1-users.sh"
run_test_suite "Phase 2: Federation" "$SCRIPT_DIR/test-phase2-federation.sh"
run_test_suite "Phase 3: Management" "$SCRIPT_DIR/test-phase3-management.sh"
run_test_suite "Phase 4: UI Components" "$SCRIPT_DIR/test-phase4-ui.sh"

END_TIME=$(date +%s)
TOTAL_TIME=$((END_TIME - START_TIME))

# Output results
if [[ "$JSON_OUTPUT" == "true" ]]; then
    # JSON output
    echo "{"
    echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
    echo "  \"duration_seconds\": $TOTAL_TIME,"
    echo "  \"summary\": {"
    echo "    \"total_tests\": $TOTAL_TESTS,"
    echo "    \"passed\": $TOTAL_PASSED,"
    echo "    \"failed\": $TOTAL_FAILED,"
    echo "    \"success_rate\": \"$(awk "BEGIN {printf \"%.1f\", ($TOTAL_PASSED/$TOTAL_TESTS)*100}")%\""
    echo "  },"
    echo "  \"suites\": ["
    for i in "${!PHASE_NAMES[@]}"; do
        echo "    {"
        echo "      \"name\": \"${PHASE_NAMES[$i]}\","
        echo "      \"result\": \"${PHASE_RESULTS[$i]}\","
        echo "      \"tests\": ${PHASE_TESTS[$i]},"
        echo "      \"passed\": ${PHASE_PASSED[$i]},"
        echo "      \"failed\": ${PHASE_FAILED[$i]},"
        echo "      \"duration_seconds\": ${PHASE_TIMES[$i]}"
        if [[ $i -lt $((${#PHASE_NAMES[@]} - 1)) ]]; then
            echo "    },"
        else
            echo "    }"
        fi
    done
    echo "  ]"
    echo "}"
else
    # Human-readable output
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  TEST RESULTS                                                            ${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    # Results table
    printf "  %-30s %-10s %-8s %-8s %-8s %-6s\n" "Suite" "Result" "Tests" "Passed" "Failed" "Time"
    printf "  %-30s %-10s %-8s %-8s %-8s %-6s\n" "------------------------------" "----------" "--------" "--------" "--------" "------"
    
    for i in "${!PHASE_NAMES[@]}"; do
        result_color="${GREEN}"
        if [[ "${PHASE_RESULTS[$i]}" == "FAIL" ]]; then
            result_color="${RED}"
        elif [[ "${PHASE_RESULTS[$i]}" == "SKIP" ]]; then
            result_color="${YELLOW}"
        fi
        
        printf "  %-30s ${result_color}%-10s${NC} %-8s %-8s %-8s %-6s\n" \
            "${PHASE_NAMES[$i]}" \
            "${PHASE_RESULTS[$i]}" \
            "${PHASE_TESTS[$i]}" \
            "${PHASE_PASSED[$i]}" \
            "${PHASE_FAILED[$i]}" \
            "${PHASE_TIMES[$i]}s"
    done
    
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  SUMMARY                                                                 ${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "  Total Tests:    ${CYAN}$TOTAL_TESTS${NC}"
    echo -e "  Passed:         ${GREEN}$TOTAL_PASSED${NC}"
    echo -e "  Failed:         ${RED}$TOTAL_FAILED${NC}"
    echo -e "  Success Rate:   ${CYAN}$(awk "BEGIN {printf \"%.1f\", ($TOTAL_PASSED/$TOTAL_TESTS)*100}")%${NC}"
    echo -e "  Duration:       ${CYAN}${TOTAL_TIME}s${NC}"
    echo ""
    
    # Final verdict
    if [[ $TOTAL_FAILED -eq 0 ]]; then
        echo -e "${GREEN}╔════════════════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║                    ALL TESTS PASSED! ✓                                 ║${NC}"
        echo -e "${GREEN}║              Pilot is ready for demonstration.                         ║${NC}"
        echo -e "${GREEN}╚════════════════════════════════════════════════════════════════════════╝${NC}"
    else
        echo -e "${RED}╔════════════════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${RED}║                    SOME TESTS FAILED                                   ║${NC}"
        echo -e "${RED}║              Please review failed tests before demo.                   ║${NC}"
        echo -e "${RED}╚════════════════════════════════════════════════════════════════════════╝${NC}"
    fi
    echo ""
fi

# Exit with appropriate code
if [[ $TOTAL_FAILED -eq 0 ]]; then
    exit 0
else
    exit 1
fi

