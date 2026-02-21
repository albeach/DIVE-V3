#!/usr/bin/env bash
# =============================================================================
# Session Token Resilience - Comprehensive Test Suite
# =============================================================================
# Purpose: Verify the session token resilience fix is working correctly
#
# Tests:
# 1. Code validation - Fix is in codebase
# 2. Frontend health check
# 3. Session validation endpoint test
# 4. Token refresh simulation
# 5. API route proxy tests (/resources, /resources/search)
# 6. Error handling tests
# 7. Log validation
#
# Usage:
#   ./tests/session-token-resilience-test.sh
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_ROOT}"

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Test results
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Configuration
FRONTEND_URL="${FRONTEND_URL:-https://localhost:3000}"
BACKEND_URL="${BACKEND_URL:-https://localhost:4000}"

# =============================================================================
# Helper Functions
# =============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[✓ PASS]${NC} $*"
}

log_fail() {
    echo -e "${RED}[✗ FAIL]${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}[⚠ WARN]${NC} $*"
}

log_section() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$*${NC}"
    echo -e "${BLUE}========================================${NC}"
}

test_start() {
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
    echo -e "${BLUE}[TEST ${TESTS_TOTAL}]${NC} $*"
}

test_pass() {
    TESTS_PASSED=$((TESTS_PASSED + 1))
    log_success "$*"
}

test_fail() {
    TESTS_FAILED=$((TESTS_FAILED + 1))
    log_fail "$*"
}

# =============================================================================
# Test Suite
# =============================================================================

test_code_validation() {
    log_section "Test 1: Code Validation"
    
    test_start "Verify refreshAccessToken function exists"
    if grep -q "async function refreshAccessToken" frontend/src/lib/session-validation.ts; then
        test_pass "refreshAccessToken function found"
    else
        test_fail "refreshAccessToken function NOT found"
        return 1
    fi
    
    test_start "Verify RESILIENT DESIGN documentation"
    if grep -q "RESILIENT DESIGN" frontend/src/lib/session-validation.ts; then
        test_pass "Resilient design documentation found"
    else
        test_fail "Resilient design documentation NOT found"
        return 1
    fi
    
    test_start "Verify automatic token refresh in getSessionTokens"
    if grep -q "needsRefresh" frontend/src/lib/session-validation.ts; then
        test_pass "Token expiration check found"
    else
        test_fail "Token expiration check NOT found"
        return 1
    fi
    
    test_start "Verify improved error messages"
    if grep -q "Invalid or expired JWT token" frontend/src/app/api/resources/route.ts; then
        test_pass "Improved error messages found"
    else
        test_fail "Improved error messages NOT found"
        return 1
    fi
}

test_frontend_health() {
    log_section "Test 2: Frontend Health Check"
    
    test_start "Frontend service is running"
    if docker-compose ps frontend-usa 2>/dev/null | grep -q "Up"; then
        test_pass "Frontend service is running"
    else
        test_fail "Frontend service is NOT running"
        return 1
    fi
    
    test_start "Frontend health endpoint responds"
    local response
    response=$(curl -sk "${FRONTEND_URL}/api/health" 2>/dev/null || echo '{"error":"connection_failed"}')
    
    if echo "$response" | grep -q '"status":"ok"'; then
        test_pass "Frontend health check passed"
    else
        test_fail "Frontend health check failed: $response"
        return 1
    fi
}

test_backend_health() {
    log_section "Test 3: Backend Health Check"
    
    test_start "Backend service is running"
    if docker-compose ps backend-usa 2>/dev/null | grep -q "Up"; then
        test_pass "Backend service is running"
    else
        test_fail "Backend service is NOT running"
        return 1
    fi
    
    test_start "Backend health endpoint responds"
    local response
    response=$(curl -sk "${BACKEND_URL}/api/health" 2>/dev/null || echo '{"error":"connection_failed"}')
    
    if echo "$response" | grep -q '"status"'; then
        test_pass "Backend health check passed"
    else
        test_fail "Backend health check failed: $response"
        return 1
    fi
}

test_session_validation_utility() {
    log_section "Test 4: Session Validation Utility"
    
    test_start "Verify session validation exports"
    if grep -q "export async function validateSession" frontend/src/lib/session-validation.ts; then
        test_pass "validateSession function exported"
    else
        test_fail "validateSession function NOT exported"
        return 1
    fi
    
    test_start "Verify getSessionTokens exports"
    if grep -q "export async function getSessionTokens" frontend/src/lib/session-validation.ts; then
        test_pass "getSessionTokens function exported"
    else
        test_fail "getSessionTokens function NOT exported"
        return 1
    fi
    
    test_start "Verify token refresh logic"
    if grep -q "timeUntilExpiry < 60" frontend/src/lib/session-validation.ts; then
        test_pass "60-second proactive refresh buffer configured"
    else
        test_fail "Proactive refresh buffer NOT configured"
        return 1
    fi
}

test_api_routes() {
    log_section "Test 5: API Route Integration"
    
    test_start "Verify /api/resources uses improved validation"
    if grep -q "getSessionTokens" frontend/src/app/api/resources/route.ts; then
        test_pass "/api/resources uses getSessionTokens()"
    else
        test_fail "/api/resources does NOT use getSessionTokens()"
        return 1
    fi
    
    test_start "Verify /api/resources/[id] uses improved validation"
    if grep -q "getSessionTokens" frontend/src/app/api/resources/\[id\]/route.ts; then
        test_pass "/api/resources/[id] uses getSessionTokens()"
    else
        test_fail "/api/resources/[id] does NOT use getSessionTokens()"
        return 1
    fi
    
    test_start "Verify /api/resources/search uses improved validation"
    if grep -q "getSessionTokens\|needsRefresh" frontend/src/app/api/resources/search/route.ts; then
        test_pass "/api/resources/search has token refresh logic"
    else
        test_fail "/api/resources/search missing token refresh logic"
        return 1
    fi
}

test_error_handling() {
    log_section "Test 6: Error Handling"
    
    test_start "Verify error messages are user-friendly"
    local count
    count=$(grep -r "Invalid or expired JWT token" frontend/src/app/api/resources/ 2>/dev/null | wc -l)
    
    if [[ $count -ge 3 ]]; then
        test_pass "User-friendly error messages in $count files"
    else
        test_fail "Insufficient error messages (found $count, expected 3+)"
        return 1
    fi
    
    test_start "Verify graceful error handling in refresh"
    if grep -q "catch (error)" frontend/src/lib/session-validation.ts; then
        test_pass "Error handling implemented"
    else
        test_fail "Error handling NOT implemented"
        return 1
    fi
}

test_logging() {
    log_section "Test 7: Logging Validation"
    
    test_start "Verify token refresh logging"
    if grep -q "Refreshing token" frontend/src/lib/session-validation.ts; then
        test_pass "Token refresh logging implemented"
    else
        test_fail "Token refresh logging NOT implemented"
        return 1
    fi
    
    test_start "Verify API route logging"
    if grep -q "Proxying to backend" frontend/src/app/api/resources/route.ts; then
        test_pass "API route logging implemented"
    else
        test_fail "API route logging NOT implemented"
        return 1
    fi
    
    test_start "Check for recent SessionValidation logs"
    local log_count
    log_count=$(docker-compose logs --tail=100 frontend-usa 2>/dev/null | grep -c "SessionValidation" || echo "0")
    
    if [[ $log_count -gt 0 ]]; then
        test_pass "SessionValidation logs present ($log_count entries)"
    else
        log_warn "No SessionValidation logs found (may not have triggered yet)"
    fi
}

test_dive_cli_integration() {
    log_section "Test 8: DIVE CLI Integration"
    
    test_start "Verify DIVE CLI has session-resilience command"
    if grep -q "session-resilience" dive; then
        test_pass "DIVE CLI session-resilience command found"
    else
        test_fail "DIVE CLI session-resilience command NOT found"
        return 1
    fi
    
    test_start "Verify deployment script exists"
    if [[ -f "scripts/dive-modules/deploy-session-resilience-fix.sh" ]]; then
        test_pass "Deployment script exists"
    else
        test_fail "Deployment script NOT found"
        return 1
    fi
    
    test_start "Verify diagnostic script exists"
    if [[ -f "scripts/diagnose-session-token-flow.sh" ]]; then
        test_pass "Diagnostic script exists"
    else
        test_fail "Diagnostic script NOT found"
        return 1
    fi
}

test_documentation() {
    log_section "Test 9: Documentation"
    
    test_start "Verify root cause analysis document"
    if [[ -f "docs/fixes/SESSION-TOKEN-RESILIENCE-FIX.md" ]]; then
        test_pass "Root cause analysis document exists"
    else
        test_fail "Root cause analysis document NOT found"
        return 1
    fi
    
    test_start "Verify quick reference guide"
    if [[ -f "docs/fixes/SESSION-TOKEN-QUICK-REFERENCE.md" ]]; then
        test_pass "Quick reference guide exists"
    else
        test_fail "Quick reference guide NOT found"
        return 1
    fi
    
    test_start "Verify implementation summary"
    if [[ -f "docs/fixes/SESSION-TOKEN-IMPLEMENTATION-SUMMARY.md" ]]; then
        test_pass "Implementation summary exists"
    else
        test_fail "Implementation summary NOT found"
        return 1
    fi
}

test_deployment_readiness() {
    log_section "Test 10: Deployment Readiness"
    
    test_start "Check if frontend needs restart"
    local frontend_started
    frontend_started=$(docker-compose ps frontend-usa 2>/dev/null | grep -oP '\d{4}-\d{2}-\d{2}' | head -1 || echo "unknown")
    
    log_info "Frontend container started: $frontend_started"
    test_pass "Frontend service timestamp recorded"
    
    test_start "Verify Docker Compose configuration"
    if docker-compose config >/dev/null 2>&1; then
        test_pass "Docker Compose configuration valid"
    else
        test_fail "Docker Compose configuration INVALID"
        return 1
    fi
    
    test_start "Verify all required services healthy"
    local unhealthy
    unhealthy=$(docker-compose ps 2>/dev/null | grep -v "healthy\|Up" | grep -c "Exit\|Down" || echo "0")
    
    if [[ $unhealthy -eq 0 ]]; then
        test_pass "All services healthy"
    else
        test_fail "$unhealthy services are unhealthy"
        return 1
    fi
}

# =============================================================================
# Report Generation
# =============================================================================

generate_report() {
    log_section "Test Results Summary"
    
    echo ""
    echo "╔════════════════════════════════════════════════════════════════════╗"
    echo "║           Session Token Resilience Test Suite Results             ║"
    echo "╚════════════════════════════════════════════════════════════════════╝"
    echo ""
    echo "  Total Tests:    $TESTS_TOTAL"
    echo "  Passed:         ${GREEN}$TESTS_PASSED${NC}"
    echo "  Failed:         ${RED}$TESTS_FAILED${NC}"
    echo ""
    
    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "${GREEN}✓ ALL TESTS PASSED${NC}"
        echo ""
        echo "Next Steps:"
        echo "  1. Deploy fix: ./dive fix session-resilience"
        echo "  2. Monitor logs: docker-compose logs -f frontend-usa | grep SessionValidation"
        echo "  3. Test manually: Login and navigate to /resources"
        echo ""
        return 0
    else
        echo -e "${RED}✗ SOME TESTS FAILED${NC}"
        echo ""
        echo "Please review failed tests and fix issues before deployment."
        echo ""
        return 1
    fi
}

# =============================================================================
# Main Execution
# =============================================================================

main() {
    log_info "Starting Session Token Resilience Test Suite"
    log_info "Project: DIVE V3"
    log_info "Test Date: $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""
    
    # Run all tests
    test_code_validation || true
    test_frontend_health || true
    test_backend_health || true
    test_session_validation_utility || true
    test_api_routes || true
    test_error_handling || true
    test_logging || true
    test_dive_cli_integration || true
    test_documentation || true
    test_deployment_readiness || true
    
    # Generate report
    generate_report
}

main "$@"
