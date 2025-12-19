#!/bin/bash
# =============================================================================
# DIVE V3 - Local Deployment E2E Test
# =============================================================================
# Tests the complete local deployment lifecycle:
# 1. Nuke (clean slate)
# 2. Deploy
# 3. Health verification
# 4. API endpoint tests
# 5. Cleanup
#
# Usage:
#   ./tests/e2e/local-deploy.test.sh [--skip-cleanup] [--verbose]
#
# Exit codes:
#   0 - All tests passed
#   1 - Tests failed
# =============================================================================

set -e

# ============================================================================
# Configuration
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Test results
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Options
SKIP_CLEANUP=false
VERBOSE=false

# ============================================================================
# Argument Parsing
# ============================================================================

for arg in "$@"; do
    case "$arg" in
        --skip-cleanup) SKIP_CLEANUP=true ;;
        --verbose|-v)   VERBOSE=true ;;
        --help|-h)
            echo "DIVE V3 Local Deployment E2E Test"
            echo ""
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --skip-cleanup    Don't nuke after test"
            echo "  --verbose, -v     Show detailed output"
            echo "  --help, -h        Show this help"
            exit 0
            ;;
    esac
done

# ============================================================================
# Helper Functions
# ============================================================================

log_info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
log_success() { echo -e "${GREEN}[PASS]${NC} $*"; }
log_fail()    { echo -e "${RED}[FAIL]${NC} $*"; }
log_skip()    { echo -e "${YELLOW}[SKIP]${NC} $*"; }
log_verbose() { [ "$VERBOSE" = true ] && echo -e "${CYAN}[DEBUG]${NC} $*"; }

test_pass() {
    log_success "$1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

test_fail() {
    log_fail "$1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

test_skip() {
    log_skip "$1"
    TESTS_SKIPPED=$((TESTS_SKIPPED + 1))
}

wait_for_url() {
    local url="$1"
    local timeout="${2:-120}"
    local elapsed=0

    while [ $elapsed -lt $timeout ]; do
        if curl -sfk --max-time 5 "$url" >/dev/null 2>&1; then
            return 0
        fi
        sleep 5
        elapsed=$((elapsed + 5))
        log_verbose "Waiting for $url... (${elapsed}s/${timeout}s)"
    done

    return 1
}

# ============================================================================
# Test Suite
# ============================================================================

cd "$DIVE_ROOT"

echo ""
echo "=============================================="
echo " DIVE V3 - Local Deployment E2E Test"
echo "=============================================="
echo ""
echo "Root: $DIVE_ROOT"
echo ""

# ============================================================================
# Test 1: Nuke (Clean Slate)
# ============================================================================

log_info "Test 1: Nuke (clean slate)"

if [ "$VERBOSE" = true ]; then
    ./dive nuke --confirm
else
    ./dive nuke --confirm >/dev/null 2>&1
fi

# Verify clean slate
containers=$(docker ps -aq --filter 'name=dive' 2>/dev/null | wc -l | tr -d ' ')
volumes=$(docker volume ls -q --filter 'name=dive' 2>/dev/null | wc -l | tr -d ' ')

if [ "$containers" -eq 0 ] && [ "$volumes" -eq 0 ]; then
    test_pass "Clean slate achieved (0 containers, 0 volumes)"
else
    test_fail "Residual resources remain (containers: $containers, volumes: $volumes)"
fi

# ============================================================================
# Test 2: Deploy
# ============================================================================

log_info "Test 2: Deploy"

# Set test secrets
export POSTGRES_PASSWORD="DiveTestSecure2025!"
export KEYCLOAK_ADMIN_PASSWORD="DiveTestSecure2025!"
export MONGO_PASSWORD="DiveTestSecure2025!"
export AUTH_SECRET="test-auth-secret-for-e2e-testing"
export KEYCLOAK_CLIENT_SECRET="test-keycloak-client-secret"
export REDIS_PASSWORD="DiveTestSecure2025!"

if [ "$VERBOSE" = true ]; then
    ./dive deploy
else
    ./dive deploy 2>&1 | tail -20
fi

deploy_result=$?

if [ $deploy_result -eq 0 ]; then
    test_pass "Deploy command completed successfully"
else
    test_fail "Deploy command failed with exit code $deploy_result"
fi

# ============================================================================
# Test 3: Service Health Checks
# ============================================================================

log_info "Test 3: Service health checks"

# Wait for services to be ready
log_info "Waiting for services to be healthy (up to 180s)..."
sleep 30

# Check Keycloak
if wait_for_url "https://localhost:8443/realms/master" 120; then
    test_pass "Keycloak is healthy (https://localhost:8443)"
else
    test_fail "Keycloak failed to respond"
fi

# Check Backend
if wait_for_url "https://localhost:4000/health" 60; then
    test_pass "Backend is healthy (https://localhost:4000)"
else
    test_fail "Backend failed to respond"
fi

# Check Frontend
if wait_for_url "https://localhost:3000" 60; then
    test_pass "Frontend is healthy (https://localhost:3000)"
else
    test_fail "Frontend failed to respond"
fi

# ============================================================================
# Test 4: Docker Container Status
# ============================================================================

log_info "Test 4: Docker container status"

required_containers=("keycloak" "backend" "frontend" "postgres" "mongo" "redis")

for svc in "${required_containers[@]}"; do
    container=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -E "dive.*${svc}" | head -1)
    if [ -n "$container" ]; then
        state=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null || echo "unknown")
        if [ "$state" = "running" ]; then
            test_pass "Container $svc is running ($container)"
        else
            test_fail "Container $svc is in state: $state"
        fi
    else
        test_fail "Container $svc not found"
    fi
done

# ============================================================================
# Test 5: Health Command JSON Output
# ============================================================================

log_info "Test 5: Health command JSON output"

health_json=$(./dive health --json 2>/dev/null)

if echo "$health_json" | jq -e '.status' >/dev/null 2>&1; then
    status=$(echo "$health_json" | jq -r '.status')
    if [ "$status" = "healthy" ]; then
        test_pass "Health JSON reports status: healthy"
    else
        test_fail "Health JSON reports status: $status (expected healthy)"
    fi
else
    test_fail "Health --json did not return valid JSON"
fi

# ============================================================================
# Test 6: Checkpoint and Rollback (Optional)
# ============================================================================

log_info "Test 6: Checkpoint functionality"

./dive checkpoint create test-checkpoint >/dev/null 2>&1
if [ -d ".dive-checkpoint/test-checkpoint" ]; then
    test_pass "Checkpoint created successfully"
else
    test_skip "Checkpoint creation failed (may need volumes)"
fi

# ============================================================================
# Cleanup
# ============================================================================

if [ "$SKIP_CLEANUP" = false ]; then
    log_info "Cleaning up..."
    ./dive nuke --confirm >/dev/null 2>&1 || true
fi

# ============================================================================
# Summary
# ============================================================================

echo ""
echo "=============================================="
echo " Test Summary"
echo "=============================================="
echo ""
echo -e "  ${GREEN}Passed:${NC}  $TESTS_PASSED"
echo -e "  ${RED}Failed:${NC}  $TESTS_FAILED"
echo -e "  ${YELLOW}Skipped:${NC} $TESTS_SKIPPED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed.${NC}"
    exit 1
fi
