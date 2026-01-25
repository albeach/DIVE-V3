#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Hub Deployment Smoke Test
# =============================================================================
# Purpose: Quick validation that hub deployment works end-to-end
# Usage: ./tests/smoke/hub-deploy-smoke.sh
# Exit Codes:
#   0 - All tests passed
#   1 - One or more tests failed
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0
START_TIME=$(date +%s)

# =============================================================================
# HELPER FUNCTIONS
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

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Run a test and check exit code
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    ((TESTS_RUN++))
    log_test "$test_name"
    
    if eval "$test_command" >/dev/null 2>&1; then
        log_pass "$test_name"
        return 0
    else
        log_fail "$test_name"
        return 1
    fi
}

# =============================================================================
# MAIN SMOKE TEST
# =============================================================================

main() {
    echo -e "${BOLD}========================================${NC}"
    echo -e "${BOLD}DIVE V3 Hub Deployment Smoke Test${NC}"
    echo -e "${BOLD}========================================${NC}"
    echo ""
    
    # Change to DIVE root directory
    cd "$(dirname "${BASH_SOURCE[0]}")/../.."
    DIVE_ROOT="$(pwd)"
    export DIVE_ROOT
    
    log_info "DIVE Root: $DIVE_ROOT"
    log_info "Timestamp: $(date)"
    echo ""
    
    # ==========================================================================
    # TEST 1: Clean slate (nuke all)
    # ==========================================================================
    log_test "Test 1: Clean slate - nuke all containers"
    
    if ./dive nuke all --confirm; then
        log_pass "Successfully nuked all containers"
    else
        log_fail "Failed to nuke containers"
        exit 1
    fi
    
    sleep 5
    
    # Verify no containers running
    ((TESTS_RUN++))
    RUNNING_CONTAINERS=$(docker ps -q | wc -l | tr -d ' ')
    if [ "$RUNNING_CONTAINERS" -eq 0 ]; then
        log_pass "Verified no containers running"
    else
        log_fail "Found $RUNNING_CONTAINERS containers still running"
    fi
    
    echo ""
    
    # ==========================================================================
    # TEST 2: Hub deployment
    # ==========================================================================
    log_test "Test 2: Hub deployment"
    
    DEPLOY_START=$(date +%s)
    if timeout 600 ./dive hub deploy; then
        DEPLOY_END=$(date +%s)
        DEPLOY_TIME=$((DEPLOY_END - DEPLOY_START))
        log_pass "Hub deployment completed in ${DEPLOY_TIME}s"
        
        # Check if under target time (5 minutes)
        ((TESTS_RUN++))
        if [ "$DEPLOY_TIME" -lt 300 ]; then
            log_pass "Deployment time under 5 minute target (${DEPLOY_TIME}s)"
        else
            log_fail "Deployment time exceeded 5 minute target (${DEPLOY_TIME}s)"
        fi
    else
        DEPLOY_END=$(date +%s)
        DEPLOY_TIME=$((DEPLOY_END - DEPLOY_START))
        log_fail "Hub deployment failed or timed out (${DEPLOY_TIME}s)"
        
        # Show logs for debugging
        log_error "Recent logs:"
        docker compose -f docker-compose.hub.yml logs --tail=50
        exit 1
    fi
    
    echo ""
    
    # ==========================================================================
    # TEST 3: Container health checks
    # ==========================================================================
    log_test "Test 3: Verify all containers are healthy"
    
    sleep 10  # Give health checks time to settle
    
    # List of expected healthy services
    EXPECTED_SERVICES=(
        "dive-hub-postgres"
        "dive-hub-mongodb"
        "dive-hub-redis"
        "dive-hub-redis-blacklist"
        "dive-hub-keycloak"
        "dive-hub-opa"
        "dive-hub-backend"
        "dive-hub-frontend"
        "dive-hub-otel-collector"
    )
    
    for service in "${EXPECTED_SERVICES[@]}"; do
        ((TESTS_RUN++))
        
        # Check if container exists
        if ! docker ps --filter "name=$service" --format "{{.Names}}" | grep -q "$service"; then
            log_fail "$service container not found"
            continue
        fi
        
        # Check health status
        HEALTH_STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$service" 2>/dev/null || echo "no-healthcheck")
        
        if [ "$HEALTH_STATUS" = "healthy" ]; then
            log_pass "$service is healthy"
        elif [ "$HEALTH_STATUS" = "no-healthcheck" ]; then
            # Check if running
            STATE=$(docker inspect --format='{{.State.Status}}' "$service")
            if [ "$STATE" = "running" ]; then
                log_pass "$service is running (no health check)"
            else
                log_fail "$service is $STATE (expected running)"
            fi
        else
            log_fail "$service is $HEALTH_STATUS (expected healthy)"
        fi
    done
    
    echo ""
    
    # ==========================================================================
    # TEST 4: Service connectivity
    # ==========================================================================
    log_test "Test 4: Verify service connectivity"
    
    # Test backend health endpoint
    ((TESTS_RUN++))
    if curl -ksf https://localhost:4000/health -o /dev/null; then
        log_pass "Backend health endpoint responding"
    else
        log_fail "Backend health endpoint not responding"
    fi
    
    # Test frontend
    ((TESTS_RUN++))
    if curl -ksf https://localhost:3000/ -o /dev/null; then
        log_pass "Frontend homepage accessible"
    else
        log_fail "Frontend homepage not accessible"
    fi
    
    # Test Keycloak
    ((TESTS_RUN++))
    if curl -ksf https://localhost:8443/realms/master -o /dev/null; then
        log_pass "Keycloak master realm accessible"
    else
        log_fail "Keycloak master realm not accessible"
    fi
    
    # Test OPA
    ((TESTS_RUN++))
    if docker exec dive-hub-opa /opa version >/dev/null 2>&1; then
        log_pass "OPA responding to commands"
    else
        log_fail "OPA not responding"
    fi
    
    echo ""
    
    # ==========================================================================
    # TEST 5: Policy loading
    # ==========================================================================
    log_test "Test 5: Verify OPA policies loaded"
    
    ((TESTS_RUN++))
    # Check if policies directory is mounted
    if docker exec dive-hub-opa ls /policies/base >/dev/null 2>&1; then
        log_pass "OPA policies directory mounted"
    else
        log_fail "OPA policies directory not mounted"
    fi
    
    ((TESTS_RUN++))
    # Check if hierarchy policy loaded without recursion error
    if docker exec dive-hub-opa /opa check /policies/base/coi/hierarchy.rego 2>&1 | grep -q "rego_recursion_error"; then
        log_fail "OPA hierarchy policy has recursion error"
    else
        log_pass "OPA hierarchy policy loaded without recursion errors"
    fi
    
    echo ""
    
    # ==========================================================================
    # TEST 6: Database connectivity
    # ==========================================================================
    log_test "Test 6: Verify database connectivity"
    
    # Test PostgreSQL
    ((TESTS_RUN++))
    if docker exec dive-hub-postgres psql -U postgres -d keycloak_db -c "SELECT 1" >/dev/null 2>&1; then
        log_pass "PostgreSQL database accessible"
    else
        log_fail "PostgreSQL database not accessible"
    fi
    
    # Test MongoDB
    ((TESTS_RUN++))
    MONGO_PASSWORD=$(grep "^MONGO_PASSWORD=" .env.hub | cut -d= -f2)
    if docker exec dive-hub-mongodb mongosh admin -u admin -p "$MONGO_PASSWORD" --quiet --eval "db.adminCommand('ping')" 2>/dev/null | grep -q "ok"; then
        log_pass "MongoDB database accessible"
    else
        log_fail "MongoDB database not accessible"
    fi
    
    # Test Redis
    ((TESTS_RUN++))
    REDIS_PASSWORD=$(grep "^REDIS_PASSWORD_USA=" .env.hub | cut -d= -f2)
    if docker exec dive-hub-redis redis-cli -a "$REDIS_PASSWORD" ping 2>/dev/null | grep -q "PONG"; then
        log_pass "Redis accessible"
    else
        log_fail "Redis not accessible"
    fi
    
    echo ""
    
    # ==========================================================================
    # SUMMARY
    # ==========================================================================
    END_TIME=$(date +%s)
    TOTAL_TIME=$((END_TIME - START_TIME))
    
    echo -e "${BOLD}========================================${NC}"
    echo -e "${BOLD}SMOKE TEST RESULTS${NC}"
    echo -e "${BOLD}========================================${NC}"
    echo ""
    echo -e "Tests Run:    ${BOLD}$TESTS_RUN${NC}"
    echo -e "Tests Passed: ${GREEN}${BOLD}$TESTS_PASSED${NC}"
    echo -e "Tests Failed: ${RED}${BOLD}$TESTS_FAILED${NC}"
    echo -e "Success Rate: ${BOLD}$(( TESTS_PASSED * 100 / TESTS_RUN ))%${NC}"
    echo -e "Total Time:   ${BOLD}${TOTAL_TIME}s${NC}"
    echo ""
    
    if [ "$TESTS_FAILED" -eq 0 ]; then
        echo -e "${GREEN}${BOLD}✓ ALL TESTS PASSED${NC}"
        echo ""
        return 0
    else
        echo -e "${RED}${BOLD}✗ SOME TESTS FAILED${NC}"
        echo ""
        return 1
    fi
}

# Run main function
main
EXIT_CODE=$?

exit $EXIT_CODE
