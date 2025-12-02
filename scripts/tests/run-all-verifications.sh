#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Run All Verification Tests
# =============================================================================
# Executes all verification test suites:
#   1. Federated search across instances
#   2. Resource access with different clearance levels
#   3. OPA authorization policies
#   4. Multi-KAS resource access patterns
#
# Usage:
#   ./scripts/tests/run-all-verifications.sh [--skip-opa] [--skip-kas]
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
cd "$PROJECT_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

SKIP_OPA=false
SKIP_KAS=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-opa) SKIP_OPA=true; shift ;;
        --skip-kas) SKIP_KAS=true; shift ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

log_header() {
    echo -e "\n${CYAN}╔══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║  $1${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════╝${NC}\n"
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

main() {
    log_header "DIVE V3 - Complete Verification Test Suite"
    echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo ""
    
    local total_passed=0
    local total_failed=0
    
    # Test 0: Comprehensive Federation (includes all clearance levels × all countries)
    log_header "0. Comprehensive Federation Verification"
    if timeout 300 ./scripts/tests/verify-comprehensive-federation.sh 2>&1; then
        ((total_passed++))
        echo -e "${GREEN}✅ Comprehensive federation tests passed${NC}"
    else
        ((total_failed++))
        echo -e "${RED}❌ Comprehensive federation tests failed${NC}"
    fi
    echo ""
    
    # Test 1: Federated Search
    log_header "1. Federated Search Verification"
    if timeout 180 ./scripts/tests/verify-federated-search.sh 2>&1; then
        ((total_passed++))
        echo -e "${GREEN}✅ Federated search tests passed${NC}"
    else
        ((total_failed++))
        echo -e "${RED}❌ Federated search tests failed${NC}"
    fi
    echo ""
    
    # Test 2: Resource Access
    log_header "2. Resource Access Verification"
    if ./scripts/tests/verify-resource-access.sh 2>&1; then
        ((total_passed++))
        echo -e "${GREEN}✅ Resource access tests passed${NC}"
    else
        ((total_failed++))
        echo -e "${RED}❌ Resource access tests failed${NC}"
    fi
    echo ""
    
    # Test 3: OPA Policies
    if [ "$SKIP_OPA" = false ]; then
        log_header "3. OPA Authorization Policy Verification"
        if ./scripts/tests/verify-opa-policies.sh 2>&1; then
            ((total_passed++))
            echo -e "${GREEN}✅ OPA policy tests passed${NC}"
        else
            ((total_failed++))
            echo -e "${RED}❌ OPA policy tests failed${NC}"
        fi
        echo ""
    else
        echo -e "${YELLOW}⏭️  Skipping OPA tests${NC}"
        echo ""
    fi
    
    # Test 4: Multi-KAS
    if [ "$SKIP_KAS" = false ]; then
        log_header "4. Multi-KAS Resource Access Verification"
        if ./scripts/tests/verify-multi-kas.sh 2>&1; then
            ((total_passed++))
            echo -e "${GREEN}✅ Multi-KAS tests passed${NC}"
        else
            ((total_failed++))
            echo -e "${RED}❌ Multi-KAS tests failed${NC}"
        fi
        echo ""
    else
        echo -e "${YELLOW}⏭️  Skipping Multi-KAS tests${NC}"
        echo ""
    fi
    
    # Final Summary
    log_header "Final Summary"
    echo "Test Suites:"
    echo -e "  ${GREEN}Passed:       $total_passed${NC}"
    echo -e "  ${RED}Failed:       $total_failed${NC}"
    echo ""
    
    if [ "$total_failed" -eq 0 ]; then
        echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║  ✅ ALL VERIFICATION TESTS PASSED!                              ║${NC}"
        echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════╝${NC}"
        exit 0
    else
        echo -e "${RED}╔══════════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${RED}║  ❌ SOME VERIFICATION TESTS FAILED                              ║${NC}"
        echo -e "${RED}╚══════════════════════════════════════════════════════════════════╝${NC}"
        exit 1
    fi
}

main "$@"

