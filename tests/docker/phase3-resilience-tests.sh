#!/bin/bash
# =============================================================================
# DIVE V3 Phase 3 - Resilience Tests
# =============================================================================
# Tests hub container health, restart policies, and service recovery
#
# Usage:
#   ./tests/docker/phase3-resilience-tests.sh
#
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Counters
PASSED=0
FAILED=0
SKIPPED=0

# Expected hub services
HUB_SERVICES=(
    "dive-hub-postgres"
    "dive-hub-mongodb"
    "dive-hub-redis"
    "dive-hub-keycloak"
    "dive-hub-opa"
    "dive-hub-backend"
    "dive-hub-authzforce"
    "dive-hub-kas"
    "dive-hub-frontend"
    "dive-hub-opal-server"
)

# =============================================================================
# TEST UTILITIES
# =============================================================================

log_test() {
    echo -e "${BLUE}[TEST]${NC} $1"
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
# TEST 1: All Hub Containers Running
# =============================================================================
test_hub_containers_running() {
    log_test "Checking all hub containers are running..."
    
    local all_running=true
    for service in "${HUB_SERVICES[@]}"; do
        if docker ps --format "{{.Names}}" | grep -q "^${service}$"; then
            echo "  ✓ $service is running"
        else
            echo "  ✗ $service is NOT running"
            all_running=false
        fi
    done
    
    if [ "$all_running" = true ]; then
        log_pass "All ${#HUB_SERVICES[@]} hub containers are running"
    else
        log_fail "Some hub containers are not running"
    fi
}

# =============================================================================
# TEST 2: All Hub Containers Healthy
# =============================================================================
test_hub_containers_healthy() {
    log_test "Checking all hub containers are healthy..."
    
    local all_healthy=true
    for service in "${HUB_SERVICES[@]}"; do
        local health=$(docker inspect --format='{{.State.Health.Status}}' "$service" 2>/dev/null || echo "unknown")
        if [ "$health" = "healthy" ]; then
            echo "  ✓ $service is healthy"
        elif [ "$health" = "starting" ]; then
            echo "  ⏳ $service is starting"
            all_healthy=false
        else
            echo "  ✗ $service health: $health"
            all_healthy=false
        fi
    done
    
    if [ "$all_healthy" = true ]; then
        log_pass "All hub containers are healthy"
    else
        log_fail "Some hub containers are not healthy"
    fi
}

# =============================================================================
# TEST 3: Restart Policies Configured
# =============================================================================
test_restart_policies() {
    log_test "Checking restart policies are configured..."
    
    local all_configured=true
    for service in "${HUB_SERVICES[@]}"; do
        local restart=$(docker inspect --format='{{.HostConfig.RestartPolicy.Name}}' "$service" 2>/dev/null || echo "none")
        if [ "$restart" = "unless-stopped" ]; then
            echo "  ✓ $service: $restart"
        else
            echo "  ✗ $service: $restart (expected: unless-stopped)"
            all_configured=false
        fi
    done
    
    if [ "$all_configured" = true ]; then
        log_pass "All containers have restart: unless-stopped"
    else
        log_fail "Some containers missing restart policy"
    fi
}

# =============================================================================
# TEST 4: Health Check Configurations
# =============================================================================
test_health_checks_configured() {
    log_test "Checking health checks are configured..."
    
    local all_configured=true
    for service in "${HUB_SERVICES[@]}"; do
        local has_check=$(docker inspect --format='{{if .State.Health}}yes{{else}}no{{end}}' "$service" 2>/dev/null || echo "unknown")
        if [ "$has_check" = "yes" ]; then
            echo "  ✓ $service has health check"
        else
            echo "  ✗ $service missing health check"
            all_configured=false
        fi
    done
    
    if [ "$all_configured" = true ]; then
        log_pass "All containers have health checks"
    else
        log_fail "Some containers missing health checks"
    fi
}

# =============================================================================
# TEST 5: Network Connectivity
# =============================================================================
test_network_connectivity() {
    log_test "Checking inter-service network connectivity..."
    
    local tests_passed=0
    local tests_total=5
    
    # Test backend -> postgres
    if docker exec dive-hub-backend sh -c "nc -z dive-hub-postgres 5432" 2>/dev/null; then
        echo "  ✓ backend -> postgres:5432"
        tests_passed=$((tests_passed + 1))
    else
        echo "  ✗ backend -> postgres:5432"
    fi
    
    # Test backend -> mongodb
    if docker exec dive-hub-backend sh -c "nc -z dive-hub-mongodb 27017" 2>/dev/null; then
        echo "  ✓ backend -> mongodb:27017"
        tests_passed=$((tests_passed + 1))
    else
        echo "  ✗ backend -> mongodb:27017"
    fi
    
    # Test backend -> redis
    if docker exec dive-hub-backend sh -c "nc -z dive-hub-redis 6379" 2>/dev/null; then
        echo "  ✓ backend -> redis:6379"
        tests_passed=$((tests_passed + 1))
    else
        echo "  ✗ backend -> redis:6379"
    fi
    
    # Test backend -> opa
    if docker exec dive-hub-backend sh -c "nc -z dive-hub-opa 8181" 2>/dev/null; then
        echo "  ✓ backend -> opa:8181"
        tests_passed=$((tests_passed + 1))
    else
        echo "  ✗ backend -> opa:8181"
    fi
    
    # Test backend -> keycloak
    if docker exec dive-hub-backend sh -c "nc -z dive-hub-keycloak 8080" 2>/dev/null; then
        echo "  ✓ backend -> keycloak:8080"
        tests_passed=$((tests_passed + 1))
    else
        echo "  ✗ backend -> keycloak:8080"
    fi
    
    if [ "$tests_passed" -eq "$tests_total" ]; then
        log_pass "All network connectivity tests passed ($tests_passed/$tests_total)"
    else
        log_fail "Some network tests failed ($tests_passed/$tests_total)"
    fi
}

# =============================================================================
# TEST 6: Service Endpoints Responding
# =============================================================================
test_service_endpoints() {
    log_test "Checking service endpoints are responding..."
    
    local tests_passed=0
    local tests_total=6
    
    # Backend health
    if curl -ksf https://localhost:4000/health >/dev/null 2>&1; then
        echo "  ✓ Backend: https://localhost:4000/health"
        tests_passed=$((tests_passed + 1))
    else
        echo "  ✗ Backend: https://localhost:4000/health"
    fi
    
    # Frontend
    if curl -ksf https://localhost:3000/ >/dev/null 2>&1; then
        echo "  ✓ Frontend: https://localhost:3000/"
        tests_passed=$((tests_passed + 1))
    else
        echo "  ✗ Frontend: https://localhost:3000/"
    fi
    
    # Keycloak (port 8080)
    if curl -sf http://localhost:8080/realms/master >/dev/null 2>&1; then
        echo "  ✓ Keycloak: http://localhost:8080/realms/master"
        tests_passed=$((tests_passed + 1))
    else
        echo "  ✗ Keycloak: http://localhost:8080/realms/master"
    fi
    
    # OPA (port 8181, HTTPS)
    if curl -ksf https://localhost:8181/health >/dev/null 2>&1; then
        echo "  ✓ OPA: https://localhost:8181/health"
        tests_passed=$((tests_passed + 1))
    else
        echo "  ✗ OPA: https://localhost:8181/health"
    fi
    
    # OPAL Server (port 7002)
    if curl -ksf https://localhost:7002/healthcheck >/dev/null 2>&1; then
        echo "  ✓ OPAL Server: https://localhost:7002/healthcheck"
        tests_passed=$((tests_passed + 1))
    else
        echo "  ✗ OPAL Server: https://localhost:7002/healthcheck"
    fi
    
    # KAS (port 8085)
    if curl -ksf https://localhost:8085/health >/dev/null 2>&1; then
        echo "  ✓ KAS: https://localhost:8085/health"
        tests_passed=$((tests_passed + 1))
    else
        echo "  ✗ KAS: https://localhost:8085/health"
    fi
    
    if [ "$tests_passed" -eq "$tests_total" ]; then
        log_pass "All service endpoints responding ($tests_passed/$tests_total)"
    else
        log_fail "Some endpoints not responding ($tests_passed/$tests_total)"
    fi
}

# =============================================================================
# TEST 7: No Unhealthy Containers
# =============================================================================
test_no_unhealthy_containers() {
    log_test "Checking for unhealthy containers..."
    
    local unhealthy=$(docker ps --filter "health=unhealthy" --format "{{.Names}}" | grep "dive-hub" | wc -l | tr -d ' ')
    
    if [ "$unhealthy" -eq 0 ]; then
        log_pass "No unhealthy hub containers"
    else
        echo "  Unhealthy containers:"
        docker ps --filter "health=unhealthy" --format "{{.Names}}" | grep "dive-hub" | while read name; do
            echo "    ✗ $name"
        done
        log_fail "$unhealthy unhealthy hub container(s) found"
    fi
}

# =============================================================================
# TEST 8: Container Restart Count (Stability)
# =============================================================================
test_container_stability() {
    log_test "Checking container stability (restart counts)..."
    
    local high_restarts=0
    for service in "${HUB_SERVICES[@]}"; do
        local restarts=$(docker inspect --format='{{.RestartCount}}' "$service" 2>/dev/null || echo "0")
        if [ "$restarts" -gt 3 ]; then
            echo "  ⚠ $service has restarted $restarts times"
            high_restarts=$((high_restarts + 1))
        fi
    done
    
    if [ "$high_restarts" -eq 0 ]; then
        log_pass "All containers stable (low restart counts)"
    else
        log_fail "$high_restarts container(s) have high restart counts"
    fi
}

# =============================================================================
# MAIN
# =============================================================================

echo ""
echo "=============================================="
echo " DIVE V3 Phase 3 - Resilience Tests"
echo "=============================================="
echo ""

# Run tests
test_hub_containers_running
echo ""
test_hub_containers_healthy
echo ""
test_restart_policies
echo ""
test_health_checks_configured
echo ""
test_network_connectivity
echo ""
test_service_endpoints
echo ""
test_no_unhealthy_containers
echo ""
test_container_stability

# Summary
echo ""
echo "=============================================="
echo " TEST SUMMARY"
echo "=============================================="
echo -e "  ${GREEN}PASSED:${NC}  $PASSED"
echo -e "  ${RED}FAILED:${NC}  $FAILED"
echo -e "  ${YELLOW}SKIPPED:${NC} $SKIPPED"
echo "=============================================="

if [ "$FAILED" -gt 0 ]; then
    echo -e "${RED}Some tests failed!${NC}"
    exit 1
else
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
fi
