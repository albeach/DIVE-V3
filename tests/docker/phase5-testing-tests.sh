#!/usr/bin/env bash
# =============================================================================
# Phase 5: Testing & Code Coverage Regression Tests
# =============================================================================
# Validates testing infrastructure is properly configured
# Does NOT run full test suites (too slow for quick regression)
# 
# For full test verification, run:
#   cd backend && npm test
#   cd kas && npm test
#   opa test policies/ -v
# =============================================================================

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASSED=0
FAILED=0
SKIPPED=0

log_test() {
    echo -e "${BLUE}[TEST]${NC} $1..."
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    PASSED=$((PASSED + 1))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    FAILED=$((FAILED + 1))
}

log_skip() {
    echo -e "${YELLOW}[SKIP]${NC} $1"
    SKIPPED=$((SKIPPED + 1))
}

# =============================================================================
# Backend Test Infrastructure
# =============================================================================
echo -e "\n${YELLOW}=== Backend Test Infrastructure ===${NC}"

log_test "Checking auth.types.ts module exists"
if [[ -f "${PROJECT_ROOT}/backend/src/types/auth.types.ts" ]]; then
    log_pass "auth.types.ts module exists"
else
    log_fail "auth.types.ts module missing"
fi

log_test "Checking Jest config exists"
if [[ -f "${PROJECT_ROOT}/backend/jest.config.js" ]]; then
    log_pass "Jest config exists"
else
    log_fail "Jest config missing"
fi

log_test "Checking test global setup exists"
if [[ -f "${PROJECT_ROOT}/backend/src/__tests__/globalSetup.ts" ]]; then
    log_pass "Test global setup exists"
else
    log_skip "Test global setup not found (may use different pattern)"
fi

log_test "Checking test directory structure"
if [[ -d "${PROJECT_ROOT}/backend/src/__tests__" ]]; then
    TEST_COUNT=$(find "${PROJECT_ROOT}/backend/src/__tests__" -name "*.test.ts" | wc -l | tr -d ' ')
    if [[ "$TEST_COUNT" -gt 50 ]]; then
        log_pass "Backend has ${TEST_COUNT} test files (>50)"
    else
        log_fail "Backend has ${TEST_COUNT} test files (expected >50)"
    fi
else
    log_fail "Backend __tests__ directory missing"
fi

# =============================================================================
# KAS Test Infrastructure
# =============================================================================
echo -e "\n${YELLOW}=== KAS Test Infrastructure ===${NC}"

log_test "Checking KAS test directory exists"
if [[ -d "${PROJECT_ROOT}/kas/src/__tests__" ]]; then
    KAS_TEST_COUNT=$(find "${PROJECT_ROOT}/kas/src/__tests__" -name "*.test.ts" | wc -l | tr -d ' ')
    log_pass "KAS has ${KAS_TEST_COUNT} test files"
else
    log_fail "KAS __tests__ directory missing"
fi

log_test "Checking KAS Jest config exists"
if [[ -f "${PROJECT_ROOT}/kas/jest.config.js" ]]; then
    log_pass "KAS Jest config exists"
else
    log_fail "KAS Jest config missing"
fi

# =============================================================================
# OPA Policy Tests
# =============================================================================
echo -e "\n${YELLOW}=== OPA Policy Tests ===${NC}"

log_test "Checking policy test files exist"
POLICY_TEST_COUNT=$(find "${PROJECT_ROOT}/policies" -name "*_test.rego" 2>/dev/null | wc -l | tr -d ' ')
if [[ "$POLICY_TEST_COUNT" -gt 0 ]]; then
    log_pass "Found ${POLICY_TEST_COUNT} OPA test files"
else
    log_fail "No OPA test files found"
fi

log_test "Checking base clearance policy exists"
if [[ -f "${PROJECT_ROOT}/policies/base/clearance/clearance.rego" ]]; then
    log_pass "Base clearance policy exists"
else
    log_fail "Base clearance policy missing"
fi

# =============================================================================
# Docker Phase Tests
# =============================================================================
echo -e "\n${YELLOW}=== Docker Phase Tests ===${NC}"

PHASE_FILES=("phase0-baseline-tests.sh" "phase1-compose-tests.sh" "phase2-secrets-tests.sh" "phase3-resilience-tests.sh" "phase4-observability-tests.sh")
for i in 0 1 2 3 4; do
    log_test "Checking Phase ${i} tests exist"
    if [[ -f "${PROJECT_ROOT}/tests/docker/${PHASE_FILES[$i]}" ]]; then
        log_pass "Phase ${i} tests exist (${PHASE_FILES[$i]})"
    else
        log_fail "Phase ${i} tests missing"
    fi
done

# =============================================================================
# CI Configuration
# =============================================================================
echo -e "\n${YELLOW}=== CI Configuration ===${NC}"

log_test "Checking CI workflow exists"
if [[ -f "${PROJECT_ROOT}/.github/workflows/ci-pr.yml" ]]; then
    log_pass "CI workflow exists"
else
    log_fail "CI workflow missing"
fi

log_test "Checking CI includes backend tests job"
if grep -q "backend-tests" "${PROJECT_ROOT}/.github/workflows/ci-pr.yml" 2>/dev/null; then
    log_pass "CI includes backend tests job"
else
    log_fail "CI missing backend tests job"
fi

log_test "Checking CI includes OPA tests job"
if grep -q "opa-tests" "${PROJECT_ROOT}/.github/workflows/ci-pr.yml" 2>/dev/null; then
    log_pass "CI includes OPA tests job"
else
    log_fail "CI missing OPA tests job"
fi

log_test "Checking CI includes secrets lint job"
if grep -q "secrets-lint" "${PROJECT_ROOT}/.github/workflows/ci-pr.yml" 2>/dev/null; then
    log_pass "CI includes secrets lint job"
else
    log_fail "CI missing secrets lint job"
fi

# =============================================================================
# Type Safety
# =============================================================================
echo -e "\n${YELLOW}=== Type Safety ===${NC}"

log_test "Checking IAuthenticatedRequest is defined"
if grep -q "export interface IAuthenticatedRequest" "${PROJECT_ROOT}/backend/src/types/auth.types.ts" 2>/dev/null; then
    log_pass "IAuthenticatedRequest interface exported"
else
    log_fail "IAuthenticatedRequest interface missing"
fi

log_test "Checking compliance-reporting.service has no import errors"
if grep -q "decryptEvents" "${PROJECT_ROOT}/backend/src/services/compliance-reporting.service.ts" 2>/dev/null; then
    if ! grep -q "_decryptEvents" "${PROJECT_ROOT}/backend/src/services/compliance-reporting.service.ts" 2>/dev/null; then
        log_pass "compliance-reporting.service uses decryptEvents"
    else
        log_fail "compliance-reporting.service has unused _decryptEvents"
    fi
else
    log_fail "compliance-reporting.service missing decryptEvents"
fi

# =============================================================================
# Test Summary
# =============================================================================
echo -e "\n=============================================="
echo " TEST SUMMARY"
echo "=============================================="
echo -e "  ${GREEN}PASSED:${NC}  $PASSED"
echo -e "  ${RED}FAILED:${NC}  $FAILED"
echo -e "  ${YELLOW}SKIPPED:${NC} $SKIPPED"
echo "=============================================="

if [[ $FAILED -eq 0 ]]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed${NC}"
    exit 1
fi
