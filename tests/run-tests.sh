#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Test Runner
# =============================================================================
# Runs all test suites (unit, integration, E2E)
# Phase 3: Testing Infrastructure
# Enhanced Phase 1 Sprint 1.3: Added spoke test support
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

# Test mode (all, hub, spoke)
TEST_MODE="${1:-all}"

# Spoke instance for testing (default: FRA)
export SPOKE_TEST_INSTANCE="${SPOKE_TEST_INSTANCE:-FRA}"

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
    echo "  Test Mode: $TEST_MODE"
    if [ "$TEST_MODE" = "spoke" ] || [ "$TEST_MODE" = "all" ]; then
        echo "  Spoke Instance: $SPOKE_TEST_INSTANCE"
    fi
    echo ""
}

print_usage() {
    echo "Usage: $0 [MODE]"
    echo ""
    echo "Modes:"
    echo "  all         Run all tests (hub + spoke) [default]"
    echo "  hub         Run hub tests only"
    echo "  spoke       Run spoke tests only"
    echo "  --help      Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  SPOKE_TEST_INSTANCE    Spoke instance to test (default: FRA)"
    echo ""
    echo "Examples:"
    echo "  $0                           # Run all tests"
    echo "  $0 hub                       # Run hub tests only"
    echo "  $0 spoke                     # Run spoke tests only"
    echo "  SPOKE_TEST_INSTANCE=GBR $0 spoke  # Test GBR spoke"
    echo ""
    exit 0
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
    # Check for help flag
    if [ "$TEST_MODE" = "--help" ] || [ "$TEST_MODE" = "-h" ]; then
        print_usage
    fi
    
    # Validate test mode
    if [ "$TEST_MODE" != "all" ] && [ "$TEST_MODE" != "hub" ] && [ "$TEST_MODE" != "spoke" ]; then
        echo -e "${RED}Error: Invalid test mode '$TEST_MODE'${NC}"
        echo ""
        print_usage
    fi
    
    print_header
    
    echo "Test Environment:"
    echo "  DIVE_ROOT: $DIVE_ROOT"
    echo "  bats version: $(bats --version 2>/dev/null || echo 'not installed')"
    echo "  yq version: $(yq --version 2>/dev/null || echo 'not installed')"
    echo "  docker version: $(docker --version 2>/dev/null || echo 'not installed')"
    
    # Run hub tests
    if [ "$TEST_MODE" = "all" ] || [ "$TEST_MODE" = "hub" ]; then
        echo ""
        echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
        echo -e "${CYAN}   HUB TESTS${NC}"
        echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
        
        run_test_suite "Hub Unit Tests (Dynamic Orchestration)" \
            "${DIVE_ROOT}/tests/unit/test_dynamic_orchestration.bats"
        
        run_test_suite "Hub Integration Tests (Deployment)" \
            "${DIVE_ROOT}/tests/integration/test_deployment.bats"
    fi
    
    # Run spoke tests
    if [ "$TEST_MODE" = "all" ] || [ "$TEST_MODE" = "spoke" ]; then
        echo ""
        echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
        echo -e "${CYAN}   SPOKE TESTS (Instance: $SPOKE_TEST_INSTANCE)${NC}"
        echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
        
        run_test_suite "Spoke Unit Tests (Orchestration)" \
            "${DIVE_ROOT}/tests/unit/test-spoke-orchestration.bats"
        
        run_test_suite "Spoke Integration Tests (Deployment)" \
            "${DIVE_ROOT}/tests/integration/test-spoke-deployment.bats"
    fi
    
    # Print summary
    print_summary
}

main "$@"
