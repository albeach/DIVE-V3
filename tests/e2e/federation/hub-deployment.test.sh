#!/bin/bash
# =============================================================================
# DIVE V3 - Hub Deployment Integration Tests
# =============================================================================
# Tests for the hub deployment workflow including:
# - Hub initialization
# - Service startup
# - Health checks
# - Federation API availability
# - Spoke registration workflow
#
# Usage:
#   ./tests/e2e/federation/hub-deployment.test.sh
#   ./tests/e2e/federation/hub-deployment.test.sh --quick  # Skip long waits
#
# Prerequisites:
#   - Docker running
#   - curl, jq installed
#   - Port 8443, 4000, 8181, 7002 available
# =============================================================================

set -e

# Test configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="${SCRIPT_DIR}/../../.."
QUICK_MODE="${1:-}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Hub endpoints
HUB_BACKEND_URL="https://localhost:4000"
HUB_KEYCLOAK_URL="https://localhost:8443"
HUB_OPA_URL="https://localhost:8181"
HUB_OPAL_URL="https://localhost:7002"

# Admin key (should match .env.hub or FEDERATION_ADMIN_KEY)
ADMIN_KEY="${FEDERATION_ADMIN_KEY:-dive-hub-admin-key}"

# =============================================================================
# TEST UTILITIES
# =============================================================================

log_test() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

log_skip() {
    echo -e "${YELLOW}[SKIP]${NC} $1"
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

assert_eq() {
    local expected="$1"
    local actual="$2"
    local message="$3"
    
    ((TESTS_RUN++))
    if [ "$expected" = "$actual" ]; then
        log_pass "$message"
        return 0
    else
        log_fail "$message (expected: $expected, got: $actual)"
        return 1
    fi
}

assert_contains() {
    local haystack="$1"
    local needle="$2"
    local message="$3"
    
    ((TESTS_RUN++))
    if echo "$haystack" | grep -q "$needle"; then
        log_pass "$message"
        return 0
    else
        log_fail "$message (expected to contain: $needle)"
        return 1
    fi
}

assert_http_status() {
    local url="$1"
    local expected_status="$2"
    local message="$3"
    
    ((TESTS_RUN++))
    local actual_status=$(curl -kso /dev/null -w '%{http_code}' --max-time 10 "$url" 2>/dev/null || echo "000")
    
    if [ "$actual_status" = "$expected_status" ]; then
        log_pass "$message (HTTP $actual_status)"
        return 0
    else
        log_fail "$message (expected HTTP $expected_status, got $actual_status)"
        return 1
    fi
}

wait_for_service() {
    local url="$1"
    local timeout="${2:-120}"
    local name="${3:-service}"
    
    log_info "Waiting for $name at $url (up to ${timeout}s)..."
    
    local elapsed=0
    while [ $elapsed -lt $timeout ]; do
        if curl -kfs --max-time 5 "$url" >/dev/null 2>&1; then
            log_info "$name is ready after ${elapsed}s"
            return 0
        fi
        sleep 5
        elapsed=$((elapsed + 5))
    done
    
    log_fail "$name not ready after ${timeout}s"
    return 1
}

# =============================================================================
# CLEANUP
# =============================================================================

cleanup() {
    log_info "Cleaning up test environment..."
    
    cd "$DIVE_ROOT"
    
    # Stop hub if running
    if docker compose -f docker-compose.hub.yml ps -q 2>/dev/null | grep -q .; then
        docker compose -f docker-compose.hub.yml down -v 2>/dev/null || true
    fi
    
    # Remove test artifacts
    rm -rf "${DIVE_ROOT}/data/hub" 2>/dev/null || true
    rm -f "${DIVE_ROOT}/.env.hub" 2>/dev/null || true
}

# =============================================================================
# TEST: Hub Initialization
# =============================================================================

test_hub_init() {
    log_test "Testing hub initialization..."
    
    cd "$DIVE_ROOT"
    
    # Run hub init
    ./dive hub init 2>&1 || {
        log_fail "Hub init command failed"
        return 1
    }
    
    # Check directories created
    ((TESTS_RUN++))
    if [ -d "${DIVE_ROOT}/data/hub/config" ]; then
        log_pass "Hub config directory created"
    else
        log_fail "Hub config directory not created"
    fi
    
    # Check config file
    ((TESTS_RUN++))
    if [ -f "${DIVE_ROOT}/data/hub/config/hub.json" ]; then
        log_pass "Hub config file created"
    else
        log_fail "Hub config file not created"
    fi
    
    # Check secrets file
    ((TESTS_RUN++))
    if [ -f "${DIVE_ROOT}/.env.hub" ]; then
        log_pass "Hub secrets file created"
    else
        log_fail "Hub secrets file not created"
    fi
    
    # Check certificates
    ((TESTS_RUN++))
    if [ -f "${DIVE_ROOT}/keycloak/certs/certificate.pem" ]; then
        log_pass "TLS certificate present"
    else
        log_fail "TLS certificate not found"
    fi
}

# =============================================================================
# TEST: Hub Service Startup
# =============================================================================

test_hub_up() {
    log_test "Testing hub service startup..."
    
    cd "$DIVE_ROOT"
    
    # Start hub services
    ./dive hub up 2>&1 || {
        log_fail "Hub up command failed"
        return 1
    }
    
    # Wait for services if not in quick mode
    if [ "$QUICK_MODE" != "--quick" ]; then
        wait_for_service "${HUB_KEYCLOAK_URL}/health" 180 "Keycloak" || return 1
        wait_for_service "${HUB_BACKEND_URL}/health" 120 "Backend" || return 1
        wait_for_service "${HUB_OPA_URL}/health" 60 "OPA" || return 1
    else
        log_skip "Skipping service wait in quick mode"
        sleep 10
    fi
    
    log_pass "Hub services started"
}

# =============================================================================
# TEST: Health Endpoints
# =============================================================================

test_health_endpoints() {
    log_test "Testing health endpoints..."
    
    # Keycloak health
    assert_http_status "${HUB_KEYCLOAK_URL}/health" "200" "Keycloak health endpoint"
    
    # Backend health
    assert_http_status "${HUB_BACKEND_URL}/health" "200" "Backend health endpoint"
    
    # OPA health
    assert_http_status "${HUB_OPA_URL}/health" "200" "OPA health endpoint"
    
    # OPAL health (may take longer to start)
    local opal_status=$(curl -kso /dev/null -w '%{http_code}' --max-time 10 "${HUB_OPAL_URL}/healthcheck" 2>/dev/null || echo "000")
    ((TESTS_RUN++))
    if [ "$opal_status" = "200" ]; then
        log_pass "OPAL health endpoint (HTTP $opal_status)"
    else
        log_skip "OPAL not ready yet (HTTP $opal_status) - may still be starting"
    fi
}

# =============================================================================
# TEST: Federation API
# =============================================================================

test_federation_api() {
    log_test "Testing federation API endpoints..."
    
    # Metadata endpoint (public)
    local metadata=$(curl -kfs --max-time 10 "${HUB_BACKEND_URL}/api/federation/metadata" 2>/dev/null)
    ((TESTS_RUN++))
    if echo "$metadata" | jq -e '.entity.id' >/dev/null 2>&1; then
        log_pass "Federation metadata endpoint returns valid JSON"
    else
        log_fail "Federation metadata endpoint failed"
    fi
    
    # Policy version endpoint (public)
    local version=$(curl -kfs --max-time 10 "${HUB_BACKEND_URL}/api/federation/policy/version" 2>/dev/null)
    ((TESTS_RUN++))
    if echo "$version" | jq -e '.version' >/dev/null 2>&1; then
        log_pass "Policy version endpoint returns valid JSON"
    else
        log_fail "Policy version endpoint failed"
    fi
    
    # Health endpoint
    local health=$(curl -kfs --max-time 10 "${HUB_BACKEND_URL}/api/federation/health" 2>/dev/null)
    ((TESTS_RUN++))
    if echo "$health" | jq -e '.statistics' >/dev/null 2>&1; then
        log_pass "Federation health endpoint returns valid JSON"
    else
        log_fail "Federation health endpoint failed"
    fi
    
    # Spokes list (admin)
    local spokes=$(curl -kfs --max-time 10 \
        -H "X-Admin-Key: ${ADMIN_KEY}" \
        "${HUB_BACKEND_URL}/api/federation/spokes" 2>/dev/null)
    ((TESTS_RUN++))
    if echo "$spokes" | jq -e '.spokes' >/dev/null 2>&1; then
        log_pass "Spokes list endpoint returns valid JSON"
    else
        log_fail "Spokes list endpoint failed"
    fi
}

# =============================================================================
# TEST: Spoke Registration Workflow
# =============================================================================

test_spoke_registration() {
    log_test "Testing spoke registration workflow..."
    
    # Register a test spoke
    local reg_payload=$(cat << 'EOF'
{
    "instanceCode": "TST",
    "name": "Test Spoke Instance",
    "description": "Integration test spoke",
    "baseUrl": "https://test-app.dive25.com",
    "apiUrl": "https://test-api.dive25.com",
    "idpUrl": "https://test-idp.dive25.com",
    "requestedScopes": ["policy:read", "heartbeat:write"],
    "contactEmail": "test@dive25.com"
}
EOF
)
    
    local reg_response=$(curl -kfs --max-time 10 \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$reg_payload" \
        "${HUB_BACKEND_URL}/api/federation/register" 2>/dev/null)
    
    ((TESTS_RUN++))
    local spoke_id=$(echo "$reg_response" | jq -r '.spoke.spokeId' 2>/dev/null)
    if [ -n "$spoke_id" ] && [ "$spoke_id" != "null" ]; then
        log_pass "Spoke registration successful (ID: $spoke_id)"
    else
        log_fail "Spoke registration failed: $reg_response"
        return 1
    fi
    
    # Verify spoke is pending
    local status=$(echo "$reg_response" | jq -r '.spoke.status' 2>/dev/null)
    assert_eq "pending" "$status" "Spoke status is pending"
    
    # Check pending list
    local pending=$(curl -kfs --max-time 10 \
        -H "X-Admin-Key: ${ADMIN_KEY}" \
        "${HUB_BACKEND_URL}/api/federation/spokes/pending" 2>/dev/null)
    
    ((TESTS_RUN++))
    if echo "$pending" | jq -e '.pending[] | select(.instanceCode == "TST")' >/dev/null 2>&1; then
        log_pass "Spoke appears in pending list"
    else
        log_fail "Spoke not found in pending list"
    fi
    
    # Approve the spoke
    local approve_payload=$(cat << 'EOF'
{
    "allowedScopes": ["policy:read", "data:read"],
    "trustLevel": "partner",
    "maxClassification": "SECRET",
    "dataIsolationLevel": "filtered"
}
EOF
)
    
    local approve_response=$(curl -kfs --max-time 10 \
        -X POST \
        -H "Content-Type: application/json" \
        -H "X-Admin-Key: ${ADMIN_KEY}" \
        -d "$approve_payload" \
        "${HUB_BACKEND_URL}/api/federation/spokes/${spoke_id}/approve" 2>/dev/null)
    
    ((TESTS_RUN++))
    local approved_status=$(echo "$approve_response" | jq -r '.spoke.status' 2>/dev/null)
    if [ "$approved_status" = "approved" ]; then
        log_pass "Spoke approval successful"
    else
        log_fail "Spoke approval failed: $approve_response"
    fi
    
    # Verify token was generated
    local token=$(echo "$approve_response" | jq -r '.token.token' 2>/dev/null)
    ((TESTS_RUN++))
    if [ -n "$token" ] && [ "$token" != "null" ] && [ ${#token} -gt 20 ]; then
        log_pass "Spoke token generated (${#token} chars)"
    else
        log_fail "Spoke token not generated"
    fi
    
    # Generate a new token
    local new_token_response=$(curl -kfs --max-time 10 \
        -X POST \
        -H "X-Admin-Key: ${ADMIN_KEY}" \
        "${HUB_BACKEND_URL}/api/federation/spokes/${spoke_id}/token" 2>/dev/null)
    
    ((TESTS_RUN++))
    local new_token=$(echo "$new_token_response" | jq -r '.token.token' 2>/dev/null)
    if [ -n "$new_token" ] && [ "$new_token" != "null" ]; then
        log_pass "New token generation successful"
    else
        log_fail "New token generation failed"
    fi
    
    # Suspend the spoke
    local suspend_response=$(curl -kfs --max-time 10 \
        -X POST \
        -H "Content-Type: application/json" \
        -H "X-Admin-Key: ${ADMIN_KEY}" \
        -d '{"reason": "Integration test suspension"}' \
        "${HUB_BACKEND_URL}/api/federation/spokes/${spoke_id}/suspend" 2>/dev/null)
    
    ((TESTS_RUN++))
    local suspended_status=$(echo "$suspend_response" | jq -r '.spoke.status' 2>/dev/null)
    if [ "$suspended_status" = "suspended" ]; then
        log_pass "Spoke suspension successful"
    else
        log_fail "Spoke suspension failed: $suspend_response"
    fi
    
    # Revoke the spoke
    local revoke_response=$(curl -kfs --max-time 10 \
        -X POST \
        -H "Content-Type: application/json" \
        -H "X-Admin-Key: ${ADMIN_KEY}" \
        -d '{"reason": "Integration test revocation"}' \
        "${HUB_BACKEND_URL}/api/federation/spokes/${spoke_id}/revoke" 2>/dev/null)
    
    ((TESTS_RUN++))
    if echo "$revoke_response" | jq -e '.success' >/dev/null 2>&1; then
        log_pass "Spoke revocation successful"
    else
        log_fail "Spoke revocation failed: $revoke_response"
    fi
}

# =============================================================================
# TEST: Hub CLI Commands
# =============================================================================

test_hub_cli() {
    log_test "Testing hub CLI commands..."
    
    cd "$DIVE_ROOT"
    
    # Hub status
    ((TESTS_RUN++))
    if ./dive hub status 2>&1 | grep -q "Services\|Status"; then
        log_pass "Hub status command works"
    else
        log_fail "Hub status command failed"
    fi
    
    # Hub health
    ((TESTS_RUN++))
    if ./dive hub health 2>&1 | grep -q "keycloak\|backend"; then
        log_pass "Hub health command works"
    else
        log_fail "Hub health command failed"
    fi
    
    # Hub spokes list
    ((TESTS_RUN++))
    if ./dive hub spokes list 2>&1 | grep -q "Registered\|Total"; then
        log_pass "Hub spokes list command works"
    else
        log_fail "Hub spokes list command failed"
    fi
    
    # Hub help
    ((TESTS_RUN++))
    if ./dive hub help 2>&1 | grep -q "deploy\|status\|spokes"; then
        log_pass "Hub help command works"
    else
        log_fail "Hub help command failed"
    fi
}

# =============================================================================
# TEST: Hub Shutdown
# =============================================================================

test_hub_down() {
    log_test "Testing hub shutdown..."
    
    cd "$DIVE_ROOT"
    
    # Stop hub services
    ./dive hub down 2>&1 || {
        log_fail "Hub down command failed"
        return 1
    }
    
    # Verify services stopped
    sleep 5
    
    ((TESTS_RUN++))
    local running=$(docker compose -f docker-compose.hub.yml ps -q 2>/dev/null | wc -l | tr -d ' ')
    if [ "$running" = "0" ]; then
        log_pass "All hub services stopped"
    else
        log_fail "$running services still running"
    fi
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    echo ""
    echo "=============================================="
    echo " DIVE V3 Hub Deployment Integration Tests"
    echo "=============================================="
    echo ""
    
    # Check prerequisites
    if ! command -v docker >/dev/null 2>&1; then
        log_fail "Docker not found"
        exit 1
    fi
    
    if ! command -v curl >/dev/null 2>&1; then
        log_fail "curl not found"
        exit 1
    fi
    
    if ! command -v jq >/dev/null 2>&1; then
        log_fail "jq not found"
        exit 1
    fi
    
    # Run tests
    trap cleanup EXIT
    
    # Clean any previous state
    cleanup
    
    # Run test suites
    test_hub_init
    test_hub_up
    
    # Only run API tests if services are up
    if [ "$QUICK_MODE" != "--quick" ]; then
        test_health_endpoints
        test_federation_api
        test_spoke_registration
        test_hub_cli
    else
        log_skip "Skipping API tests in quick mode"
    fi
    
    test_hub_down
    
    # Summary
    echo ""
    echo "=============================================="
    echo " Test Results"
    echo "=============================================="
    echo ""
    echo -e "  Total:  ${TESTS_RUN}"
    echo -e "  Passed: ${GREEN}${TESTS_PASSED}${NC}"
    echo -e "  Failed: ${RED}${TESTS_FAILED}${NC}"
    echo ""
    
    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}All tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}Some tests failed${NC}"
        exit 1
    fi
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
