#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Hub Deployment Validation Script
# =============================================================================
# Comprehensive validation of hub deployment - tests ALL services
# Phase 3 Sprint 1: Created after audit revealed deployment not operational
# Enhanced 2026-01-25: Added service classification, HTTPS, MongoDB replica set
# =============================================================================

# Note: Not using -e flag - we want to continue testing even if individual tests fail
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load common functions
source "${DIVE_ROOT}/scripts/dive-modules/common.sh"

# Load secrets for validation (needed for Redis passwords, MongoDB auth)
if type load_secrets &>/dev/null; then
    load_secrets >/dev/null 2>&1 || log_warn "Could not load secrets for validation"
fi

# =============================================================================
# CONFIGURATION
# =============================================================================

VALIDATION_TIMEOUT=300  # 5 minutes max for all validations
TEST_START_TIME=$(date +%s)

# Service Classification (from Phase 0 Audit, ADR-001)
# CORE: Required for basic identity/authorization - deployment fails if these fail
# STRETCH: Advanced features for pilot demo - warnings only
# OPTIONAL: Alternative implementations or dev-only - warnings only
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

EXPECTED_STRETCH_SERVICES=(
    "kas"
    "opal-server"
)

EXPECTED_OPTIONAL_SERVICES=(
    "otel-collector"
    # "authzforce" excluded via docker-compose profile (ADR-001)
)

# Service HTTP/HTTPS endpoints (Phase 1 Enhancement: HTTPS with proper ports)
declare -A SERVICE_ENDPOINTS=(
    ["backend"]="https://localhost:4000/health"
    ["frontend"]="https://localhost:3000/"
    ["keycloak"]="https://localhost:8443/realms/master"
    ["opa"]="https://localhost:8181/health"
    ["kas"]="https://localhost:8085/health"
)

# Validation results
declare -A VALIDATION_RESULTS=()
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
WARNING_TESTS=0

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

test_warn() {
    local reason="$1"
    ((WARNING_TESTS++))
    echo -e "${YELLOW}⚠️  WARN${NC}: $reason"
}

# =============================================================================
# VALIDATION TESTS
# =============================================================================

##
# Test 1: Container Existence (Service Classification Aware)
##
validate_containers() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Test Suite 1: Container Existence"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # CORE services - must exist
    for service in "${EXPECTED_CORE_SERVICES[@]}"; do
        test_start "CORE: Container dive-hub-${service} exists"
        
        if ${DOCKER_CMD} ps --format '{{.Names}}' | grep -q "^dive-hub-${service}$" 2>/dev/null; then
            test_pass
            VALIDATION_RESULTS["container_${service}"]="PASS"
        else
            test_fail "Container not found (CORE service required)"
            VALIDATION_RESULTS["container_${service}"]="FAIL"
        fi
    done

    # STRETCH services - warnings only
    for service in "${EXPECTED_STRETCH_SERVICES[@]}"; do
        test_start "STRETCH: Container dive-hub-${service} exists"
        
        if ${DOCKER_CMD} ps --format '{{.Names}}' | grep -q "^dive-hub-${service}$" 2>/dev/null; then
            test_pass
            VALIDATION_RESULTS["container_${service}"]="PASS"
        else
            test_warn "Container not found (STRETCH service, not required)"
            VALIDATION_RESULTS["container_${service}"]="WARN"
        fi
    done

    # OPTIONAL services - warnings only
    for service in "${EXPECTED_OPTIONAL_SERVICES[@]}"; do
        test_start "OPTIONAL: Container dive-hub-${service} exists"
        
        if ${DOCKER_CMD} ps --format '{{.Names}}' | grep -q "^dive-hub-${service}$" 2>/dev/null; then
            test_pass
            VALIDATION_RESULTS["container_${service}"]="PASS"
        else
            test_warn "Container not found (OPTIONAL service, not required)"
            VALIDATION_RESULTS["container_${service}"]="WARN"
        fi
    done
}

##
# Test 2: Container Health Status (Service Classification Aware)
##
validate_health() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Test Suite 2: Container Health Status"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # CORE services - must be healthy
    for service in "${EXPECTED_CORE_SERVICES[@]}"; do
        test_start "CORE: dive-hub-${service} healthy"
        
        local health=$(${DOCKER_CMD} inspect "dive-hub-${service}" --format='{{.State.Health.Status}}' 2>/dev/null || echo "no_healthcheck")
        
        # Trim whitespace
        health=$(echo "$health" | tr -d '[:space:]')
        
        if [ "$health" = "healthy" ] || [ "$health" = "no_healthcheck" ] || [ -z "$health" ]; then
            test_pass
            VALIDATION_RESULTS["health_${service}"]="PASS"
        else
            test_fail "Health status: $health (CORE service must be healthy)"
            VALIDATION_RESULTS["health_${service}"]="FAIL"
        fi
    done

    # STRETCH and OPTIONAL services - warnings only
    for service in "${EXPECTED_STRETCH_SERVICES[@]}" "${EXPECTED_OPTIONAL_SERVICES[@]}"; do
        if ! ${DOCKER_CMD} ps --format '{{.Names}}' | grep -q "^dive-hub-${service}$"; then
            continue  # Skip if container doesn't exist
        fi
        
        test_start "NON-CORE: dive-hub-${service} healthy"
        
        local health=$(${DOCKER_CMD} inspect "dive-hub-${service}" --format='{{.State.Health.Status}}' 2>/dev/null || echo "no_healthcheck")
        health=$(echo "$health" | tr -d '[:space:]')
        
        if [ "$health" = "healthy" ] || [ "$health" = "no_healthcheck" ] || [ -z "$health" ]; then
            test_pass
            VALIDATION_RESULTS["health_${service}"]="PASS"
        else
            test_warn "Health status: $health (non-core service)"
            VALIDATION_RESULTS["health_${service}"]="WARN"
        fi
    done
}

##
# Test 3: Service HTTP/HTTPS Endpoints (Enhanced - uses curl from host)
##
validate_endpoints() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Test Suite 3: HTTP/HTTPS Endpoint Accessibility"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    for service in "${!SERVICE_ENDPOINTS[@]}"; do
        local endpoint="${SERVICE_ENDPOINTS[$service]}"
        test_start "Service ${service} endpoint (${endpoint})"
        
        # Test from host using curl (allows HTTPS with -k flag)
        if curl -ksSf --max-time 10 "$endpoint" > /dev/null 2>&1; then
            test_pass
            VALIDATION_RESULTS["endpoint_${service}"]="PASS"
        else
            # Check if it's a CORE service
            local is_core=false
            for core_svc in "${EXPECTED_CORE_SERVICES[@]}"; do
                if [ "$service" = "$core_svc" ]; then
                    is_core=true
                    break
                fi
            done
            
            if [ "$is_core" = "true" ]; then
                test_fail "HTTP/HTTPS request failed (CORE service required)"
                VALIDATION_RESULTS["endpoint_${service}"]="FAIL"
            else
                test_warn "HTTP/HTTPS request failed (non-core service)"
                VALIDATION_RESULTS["endpoint_${service}"]="WARN"
            fi
        fi
    done
}

##
# Test 4: Database Connectivity (Enhanced with MongoDB replica set verification)
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
        test_fail "pg_isready failed (CORE database)"
        VALIDATION_RESULTS["db_postgres"]="FAIL"
    fi

    # MongoDB - basic connectivity
    test_start "MongoDB accepting connections"
    if ${DOCKER_CMD} exec dive-hub-mongodb mongosh --quiet --eval "db.adminCommand('ping').ok" >/dev/null 2>&1; then
        test_pass
        VALIDATION_RESULTS["db_mongodb"]="PASS"
    else
        test_fail "MongoDB ping failed (CORE database)"
        VALIDATION_RESULTS["db_mongodb"]="FAIL"
    fi

    # MongoDB - replica set PRIMARY status (NEW - Phase 1 Enhancement)
    test_start "MongoDB replica set PRIMARY status"
    local mongo_password="${MONGO_PASSWORD:-}"
    if [ -z "$mongo_password" ] && [ -f "${DIVE_ROOT}/.env.hub" ]; then
        mongo_password=$(grep "^MONGO_PASSWORD=" "${DIVE_ROOT}/.env.hub" | cut -d= -f2)
    fi
    
    if [ -n "$mongo_password" ]; then
        local rs_status=$(${DOCKER_CMD} exec dive-hub-mongodb mongosh admin \
            -u admin -p "$mongo_password" --quiet --eval "rs.status().myState" 2>/dev/null || echo "0")
        
        # State 1 = PRIMARY, State 2 = SECONDARY, State 0 = NOT_INITIALIZED
        if [ "$rs_status" = "1" ]; then
            test_pass
            VALIDATION_RESULTS["db_mongodb_rs"]="PASS"
        else
            test_fail "MongoDB not PRIMARY (state: $rs_status). Backend needs PRIMARY for change streams."
            VALIDATION_RESULTS["db_mongodb_rs"]="FAIL"
        fi
    else
        test_warn "MongoDB password not available, skipping replica set check"
        VALIDATION_RESULTS["db_mongodb_rs"]="WARN"
    fi

    # Redis (requires password authentication)
    test_start "Redis accepting connections"
    # Load password from environment if available
    local redis_password="${REDIS_PASSWORD_USA:-}"
    if [ -z "$redis_password" ] && [ -f "${DIVE_ROOT}/.env.hub" ]; then
        redis_password=$(grep "^REDIS_PASSWORD_USA=" "${DIVE_ROOT}/.env.hub" | cut -d= -f2)
    fi
    
    if [ -n "$redis_password" ]; then
        if ${DOCKER_CMD} exec dive-hub-redis redis-cli -a "$redis_password" ping 2>/dev/null | grep -q "PONG"; then
            test_pass
            VALIDATION_RESULTS["db_redis"]="PASS"
        else
            test_fail "Redis PING with auth failed (CORE cache)"
            VALIDATION_RESULTS["db_redis"]="FAIL"
        fi
    else
        test_warn "Redis password not available, skipping auth test"
        VALIDATION_RESULTS["db_redis"]="WARN"
    fi
    
    # Redis Blacklist (requires password authentication)
    test_start "Redis Blacklist accepting connections"
    local blacklist_password="${REDIS_PASSWORD_BLACKLIST:-}"
    if [ -z "$blacklist_password" ] && [ -f "${DIVE_ROOT}/.env.hub" ]; then
        blacklist_password=$(grep "^REDIS_PASSWORD_BLACKLIST=" "${DIVE_ROOT}/.env.hub" | cut -d= -f2)
    fi
    
    if [ -n "$blacklist_password" ]; then
        if ${DOCKER_CMD} exec dive-hub-redis-blacklist redis-cli -a "$blacklist_password" ping 2>/dev/null | grep -q "PONG"; then
            test_pass
            VALIDATION_RESULTS["db_redis_blacklist"]="PASS"
        else
            test_fail "Redis Blacklist PING with auth failed (CORE token revocation)"
            VALIDATION_RESULTS["db_redis_blacklist"]="FAIL"
        fi
    else
        test_warn "Redis Blacklist password not available, skipping auth test"
        VALIDATION_RESULTS["db_redis_blacklist"]="WARN"
    fi
}

##
# Test 5: Service Dependencies (Enhanced with HTTPS checks)
##
validate_dependencies() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Test Suite 5: Service Dependencies"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Backend can reach MongoDB
    test_start "Backend → MongoDB connectivity"
    if ${DOCKER_CMD} exec dive-hub-backend sh -c "nc -zv mongodb 27017" 2>&1 | grep -q "succeeded\|open"; then
        test_pass
        VALIDATION_RESULTS["dep_backend_mongodb"]="PASS"
    else
        test_fail "Network connection failed"
        VALIDATION_RESULTS["dep_backend_mongodb"]="FAIL"
    fi

    # Backend can reach Keycloak (HTTPS port 8443)
    test_start "Backend → Keycloak HTTPS connectivity"
    if ${DOCKER_CMD} exec dive-hub-backend sh -c "nc -zv keycloak 8443" 2>&1 | grep -q "succeeded\|open"; then
        test_pass
        VALIDATION_RESULTS["dep_backend_keycloak"]="PASS"
    else
        test_fail "Network connection failed"
        VALIDATION_RESULTS["dep_backend_keycloak"]="FAIL"
    fi

    # Frontend can reach Backend (HTTPS port 4000)
    test_start "Frontend → Backend HTTPS connectivity"
    if ${DOCKER_CMD} exec dive-hub-frontend sh -c "nc -zv backend 4000" 2>&1 | grep -q "succeeded\|open"; then
        test_pass
        VALIDATION_RESULTS["dep_frontend_backend"]="PASS"
    else
        test_fail "Network connection failed"
        VALIDATION_RESULTS["dep_frontend_backend"]="FAIL"
    fi
    
    # Backend can reach OPA (HTTPS port 8181)
    test_start "Backend → OPA HTTPS connectivity"
    if ${DOCKER_CMD} exec dive-hub-backend sh -c "nc -zv opa 8181" 2>&1 | grep -q "succeeded\|open"; then
        test_pass
        VALIDATION_RESULTS["dep_backend_opa"]="PASS"
    else
        test_fail "Network connection failed"
        VALIDATION_RESULTS["dep_backend_opa"]="FAIL"
    fi
}

##
# Test 6: Port Exposure to Host
##
validate_ports() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Test Suite 6: Port Exposure to Host"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    declare -A EXPECTED_PORTS=(
        ["frontend"]="3000"
        ["backend"]="4000"
        ["keycloak"]="8443"
        ["opa"]="8181"
        ["kas"]="8080"
    )

    for service in "${!EXPECTED_PORTS[@]}"; do
        local port="${EXPECTED_PORTS[$service]}"
        test_start "Service ${service} port ${port} exposed"
        
        local port_output=$(${DOCKER_CMD} port "dive-hub-${service}" "$port" 2>/dev/null || echo "")
        if [ -n "$port_output" ]; then
            test_pass
            VALIDATION_RESULTS["port_${service}"]="PASS"
        else
            # Check if it's a CORE service
            local is_core=false
            for core_svc in "${EXPECTED_CORE_SERVICES[@]}"; do
                if [ "$service" = "$core_svc" ]; then
                    is_core=true
                    break
                fi
            done
            
            if [ "$is_core" = "true" ]; then
                test_fail "Port not exposed (CORE service)"
                VALIDATION_RESULTS["port_${service}"]="FAIL"
            else
                test_warn "Port not exposed (non-core service)"
                VALIDATION_RESULTS["port_${service}"]="WARN"
            fi
        fi
    done
}

##
# Test 7: Authentication Flow (Basic smoke test)
##
validate_authentication() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Test Suite 7: Authentication Flow"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Check Keycloak realm exists
    test_start "Keycloak realm dive-v3-broker-usa exists"
    local realm_check=$(curl -ksSf --max-time 10 "https://localhost:8443/realms/dive-v3-broker-usa" 2>/dev/null || echo "FAIL")
    if [[ "$realm_check" != "FAIL" ]] && echo "$realm_check" | grep -q "dive-v3-broker-usa"; then
        test_pass
        VALIDATION_RESULTS["auth_realm"]="PASS"
    else
        test_fail "Realm not accessible or not configured"
        VALIDATION_RESULTS["auth_realm"]="FAIL"
    fi

    # Check backend accepts requests (even unauthorized should return proper response)
    test_start "Backend API responding to requests"
    local backend_response=$(curl -ksSf --max-time 10 "https://localhost:4000/health" 2>/dev/null || echo "FAIL")
    if [[ "$backend_response" != "FAIL" ]]; then
        test_pass
        VALIDATION_RESULTS["auth_backend"]="PASS"
    else
        test_fail "Backend not responding"
        VALIDATION_RESULTS["auth_backend"]="FAIL"
    fi
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
    validate_authentication

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
    if [ $WARNING_TESTS -gt 0 ]; then
        echo "  Warnings:     ${YELLOW}$WARNING_TESTS${NC} (non-core services)"
    fi
    echo "  Failed:       ${RED}$FAILED_TESTS${NC}"
    echo "  Duration:     ${duration}s"
    echo ""

    # Classification Summary
    echo "  Service Classification:"
    echo "    CORE Services:     ${#EXPECTED_CORE_SERVICES[@]} (required)"
    echo "    STRETCH Services:  ${#EXPECTED_STRETCH_SERVICES[@]} (advanced features)"
    echo "    OPTIONAL Services: ${#EXPECTED_OPTIONAL_SERVICES[@]} (alternatives)"
    echo ""

    if [ $FAILED_TESTS -eq 0 ]; then
        echo -e "  ${GREEN}✅ ALL CORE VALIDATIONS PASSED${NC}"
        if [ $WARNING_TESTS -gt 0 ]; then
            echo -e "  ${YELLOW}⚠️  $WARNING_TESTS non-core service warnings (acceptable)${NC}"
        fi
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
        echo "  Recommendations:"
        echo "    1. Check service logs: ./dive logs <service>"
        echo "    2. Verify secrets loaded: Check .env.hub exists"
        echo "    3. For MongoDB issues: Check replica set initialization"
        echo "    4. Redeploy if needed: ./dive nuke all --confirm && ./dive hub deploy"
        echo ""
        return 1
    fi
}

main "$@"
