#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Test Runner
# =============================================================================
# Runs all test suites (unit, integration, E2E)
# Phase 3: Testing Infrastructure
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Test results
TOTAL_SUITES=0
PASSED_SUITES=0
FAILED_SUITES=0

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

print_header() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║  DIVE V3 Test Runner                                           ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
}

run_test_suite() {
    local suite_name="$1"
    local test_file="$2"
    
    TOTAL_SUITES=$((TOTAL_SUITES + 1))
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${CYAN}Running: $suite_name${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    if [ ! -f "$test_file" ]; then
        echo -e "${RED}✗ Test file not found: $test_file${NC}"
        FAILED_SUITES=$((FAILED_SUITES + 1))
        return 1
    fi
    
    local start_time=$(date +%s)
    
    if bats "$test_file"; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        echo -e "${GREEN}✓ $suite_name passed (${duration}s)${NC}"
        PASSED_SUITES=$((PASSED_SUITES + 1))
        return 0
    else
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        echo -e "${RED}✗ $suite_name failed (${duration}s)${NC}"
        FAILED_SUITES=$((FAILED_SUITES + 1))
        return 1
    fi
}

print_summary() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Test Summary"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Total Suites:  $TOTAL_SUITES"
    echo -e "  Passed:        ${GREEN}$PASSED_SUITES${NC}"
    echo -e "  Failed:        ${RED}$FAILED_SUITES${NC}"
    echo ""
    
    if [ $FAILED_SUITES -eq 0 ]; then
        echo -e "  ${GREEN}✅ ALL TEST SUITES PASSED${NC}"
        echo ""
        return 0
    else
        echo -e "  ${RED}❌ SOME TEST SUITES FAILED${NC}"
        echo ""
        return 1
    fi
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

main() {
    print_header
    
    echo "Test Environment:"
    echo "  DIVE_ROOT: $DIVE_ROOT"
    echo "  bats version: $(bats --version 2>/dev/null || echo 'not installed')"
    echo "  yq version: $(yq --version 2>/dev/null || echo 'not installed')"
    
    # Run test suites
    run_test_suite "Unit Tests (Dynamic Orchestration)" "${DIVE_ROOT}/tests/unit/test_dynamic_orchestration.bats"
    run_test_suite "Integration Tests (Deployment)" "${DIVE_ROOT}/tests/integration/test_deployment.bats"
    
    # Print summary
    print_summary
}

main "$@"
