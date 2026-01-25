#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Hub Deployment Validation Script
# =============================================================================
# Comprehensive validation of hub deployment - tests ALL services
# Phase 3 Sprint 1: Created after audit revealed deployment not operational
# =============================================================================

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load common functions
source "${DIVE_ROOT}/scripts/dive-modules/common.sh"

# =============================================================================
# CONFIGURATION
# =============================================================================

VALIDATION_TIMEOUT=300  # 5 minutes max for all validations
TEST_START_TIME=$(date +%s)

# Expected services (from docker-compose.hub.yml)
EXPECTED_CORE_SERVICES=(
    "postgres"
    "mongodb"
    "redis"
    "redis-blacklist"
    "keycloak"
    "opa"
    "backend"
    "frontend"
)

# Optional/stretch services (may not be running)
EXPECTED_OPTIONAL_SERVICES=(
    "kas"
    "authzforce"
    "opal-server"
    "otel-collector"
)

# Service health endpoints
declare -A SERVICE_ENDPOINTS=(
    ["backend"]="http://localhost:4000/health"
    ["frontend"]="http://localhost:3000"
    ["keycloak"]="http://localhost:8080/health"
    ["opa"]="http://localhost:8181/health"
)

# Validation results
declare -A VALIDATION_RESULTS=()
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

test_start() {
    local test_name="$1"
    ((TOTAL_TESTS++))
    echo -n "  Testing: ${test_name}... "
}

test_pass() {
    ((PASSED_TESTS++))
    echo -e "${GREEN}✅ PASS${NC}"
}

test_fail() {
    local reason="$1"
    ((FAILED_TESTS++))
    echo -e "${RED}❌ FAIL${NC}: $reason"
}

# =============================================================================
# VALIDATION TESTS
# =============================================================================

##
# Test 1: Container Existence
##
validate_containers() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Test Suite 1: Container Existence"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    for service in "${EXPECTED_CORE_SERVICES[@]}"; do
        test_start "Container dive-hub-${service} exists"
        
        if ${DOCKER_CMD} ps --format '{{.Names}}' | grep -q "^dive-hub-${service}$"; then
            test_pass
            VALIDATION_RESULTS["container_${service}"]="PASS"
        else
            test_fail "Container not found"
            VALIDATION_RESULTS["container_${service}"]="FAIL"
        fi
    done
}

##
# Test 2: Container Health Status
##
validate_health() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Test Suite 2: Container Health Status"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    for service in "${EXPECTED_CORE_SERVICES[@]}"; do
        test_start "Container dive-hub-${service} healthy"
        
        local health=$(${DOCKER_CMD} inspect "dive-hub-${service}" --format='{{.State.Health.Status}}' 2>/dev/null || echo "no_healthcheck")
        
        if [ "$health" = "healthy" ] || [ "$health" = "no_healthcheck" ]; then
            test_pass
            VALIDATION_RESULTS["health_${service}"]="PASS"
        else
            test_fail "Health status: $health"
            VALIDATION_RESULTS["health_${service}"]="FAIL"
        fi
    done
}

##
# Test 3: Service HTTP Endpoints
##
validate_endpoints() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Test Suite 3: HTTP Endpoint Accessibility"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    for service in "${!SERVICE_ENDPOINTS[@]}"; do
        local endpoint="${SERVICE_ENDPOINTS[$service]}"
        test_start "Service ${service} HTTP endpoint (${endpoint})"
        
        # Test from inside the container network
        local container="dive-hub-${service}"
        local test_url=$(echo "$endpoint" | sed 's/localhost/127.0.0.1/')
        
        if ${DOCKER_CMD} exec "$container" sh -c "command -v curl >/dev/null 2>&1 && curl -sf --max-time 5 $test_url >/dev/null 2>&1"; then
            test_pass
            VALIDATION_RESULTS["endpoint_${service}"]="PASS"
        elif ${DOCKER_CMD} exec "$container" sh -c "command -v wget >/dev/null 2>&1 && wget -q --timeout=5 -O /dev/null $test_url 2>&1"; then
            test_pass
            VALIDATION_RESULTS["endpoint_${service}"]="PASS"
        else
            test_fail "HTTP request failed or timed out"
            VALIDATION_RESULTS["endpoint_${service}"]="FAIL"
        fi
    done
}

##
# Test 4: Database Connectivity
##
validate_databases() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Test Suite 4: Database Connectivity"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # PostgreSQL
    test_start "PostgreSQL accepting connections"
    if ${DOCKER_CMD} exec dive-hub-postgres pg_isready -U postgres >/dev/null 2>&1; then
        test_pass
        VALIDATION_RESULTS["db_postgres"]="PASS"
    else
        test_fail "pg_isready failed"
        VALIDATION_RESULTS["db_postgres"]="FAIL"
    fi

    # MongoDB
    test_start "MongoDB accepting connections"
    if ${DOCKER_CMD} exec dive-hub-mongodb mongosh --quiet --eval "db.adminCommand('ping').ok" >/dev/null 2>&1; then
        test_pass
        VALIDATION_RESULTS["db_mongodb"]="PASS"
    else
        test_fail "MongoDB ping failed"
        VALIDATION_RESULTS["db_mongodb"]="FAIL"
    fi

    # Redis
    test_start "Redis accepting connections"
    if ${DOCKER_CMD} exec dive-hub-redis redis-cli ping | grep -q "PONG"; then
        test_pass
        VALIDATION_RESULTS["db_redis"]="PASS"
    else
        test_fail "Redis PING failed"
        VALIDATION_RESULTS["db_redis"]="FAIL"
    fi
}

##
# Test 5: Service Dependencies
##
validate_dependencies() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Test Suite 5: Service Dependencies"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Backend can reach MongoDB
    test_start "Backend → MongoDB connectivity"
    if ${DOCKER_CMD} exec dive-hub-backend sh -c "nc -zv dive-hub-mongodb 27017" 2>&1 | grep -q "succeeded\|open"; then
        test_pass
        VALIDATION_RESULTS["dep_backend_mongodb"]="PASS"
    else
        test_fail "Network connection failed"
        VALIDATION_RESULTS["dep_backend_mongodb"]="FAIL"
    fi

    # Backend can reach Keycloak
    test_start "Backend → Keycloak connectivity"
    if ${DOCKER_CMD} exec dive-hub-backend sh -c "nc -zv dive-hub-keycloak 8080" 2>&1 | grep -q "succeeded\|open"; then
        test_pass
        VALIDATION_RESULTS["dep_backend_keycloak"]="PASS"
    else
        test_fail "Network connection failed"
        VALIDATION_RESULTS["dep_backend_keycloak"]="FAIL"
    fi

    # Frontend can reach Backend
    test_start "Frontend → Backend connectivity"
    if ${DOCKER_CMD} exec dive-hub-frontend sh -c "nc -zv dive-hub-backend 4000" 2>&1 | grep -q "succeeded\|open"; then
        test_pass
        VALIDATION_RESULTS["dep_frontend_backend"]="PASS"
    else
        test_fail "Network connection failed"
        VALIDATION_RESULTS["dep_frontend_backend"]="FAIL"
    fi
}

##
# Test 6: Port Exposure
##
validate_ports() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Test Suite 6: Port Exposure to Host"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    declare -A EXPECTED_PORTS=(
        ["frontend"]="3000"
        ["backend"]="4000"
        ["keycloak"]="8080,8443"
        ["opa"]="8181"
    )

    for service in "${!EXPECTED_PORTS[@]}"; do
        local ports="${EXPECTED_PORTS[$service]}"
        test_start "Service ${service} ports exposed (${ports})"
        
        local port_output=$(${DOCKER_CMD} port "dive-hub-${service}" 2>/dev/null || echo "")
        if [ -n "$port_output" ]; then
            test_pass
            VALIDATION_RESULTS["port_${service}"]="PASS"
        else
            test_fail "No ports exposed"
            VALIDATION_RESULTS["port_${service}"]="FAIL"
        fi
    done
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

main() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║  DIVE V3 Hub Deployment Validation                             ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    echo "  Instance: USA (Hub)"
    echo "  Date: $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""

    # Run validation test suites
    validate_containers
    validate_health
    validate_databases
    validate_dependencies
    validate_endpoints
    validate_ports

    # Calculate duration
    local end_time=$(date +%s)
    local duration=$((end_time - TEST_START_TIME))

    # Summary
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Validation Summary"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Total Tests:  $TOTAL_TESTS"
    echo "  Passed:       ${GREEN}$PASSED_TESTS${NC}"
    echo "  Failed:       ${RED}$FAILED_TESTS${NC}"
    echo "  Duration:     ${duration}s"
    echo ""

    if [ $FAILED_TESTS -eq 0 ]; then
        echo -e "  ${GREEN}✅ ALL VALIDATIONS PASSED${NC}"
        echo "  Hub deployment is fully operational"
        echo ""
        return 0
    else
        echo -e "  ${RED}❌ VALIDATION FAILURES DETECTED${NC}"
        echo "  Hub deployment is NOT fully operational"
        echo ""
        echo "  Failed tests:"
        for key in "${!VALIDATION_RESULTS[@]}"; do
            if [ "${VALIDATION_RESULTS[$key]}" = "FAIL" ]; then
                echo "    - $key"
            fi
        done
        echo ""
        return 1
    fi
}

main "$@"
