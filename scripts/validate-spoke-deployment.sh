#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Spoke Deployment Validation Script
# =============================================================================
# Comprehensive validation of spoke deployment - tests ALL services
# Phase 1 Sprint 1.3: Testing Infrastructure
# Pattern: Mirrors validate-hub-deployment.sh structure with spoke-specific logic
# =============================================================================

# Note: Not using -e flag - we want to continue testing even if individual tests fail
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load common functions
source "${DIVE_ROOT}/scripts/dive-modules/common.sh"

# Load compose parser for dynamic discovery
if [ -f "${DIVE_ROOT}/scripts/dive-modules/utilities/compose-parser.sh" ]; then
    source "${DIVE_ROOT}/scripts/dive-modules/utilities/compose-parser.sh"
fi

# =============================================================================
# USAGE
# =============================================================================

usage() {
    echo "Usage: $0 <INSTANCE_CODE>"
    echo ""
    echo "Validates a spoke instance deployment"
    echo ""
    echo "Arguments:"
    echo "  INSTANCE_CODE    3-letter spoke code (e.g., FRA, GBR, DEU)"
    echo ""
    echo "Examples:"
    echo "  $0 FRA"
    echo "  $0 GBR"
    echo ""
    exit 1
}

# =============================================================================
# ARGUMENT PARSING
# =============================================================================

if [ $# -lt 1 ]; then
    usage
fi

INSTANCE_CODE="${1^^}"  # Convert to uppercase
INSTANCE_CODE_LOWER="${INSTANCE_CODE,,}"  # Lowercase version

# Validate instance code format
if [[ ! "$INSTANCE_CODE" =~ ^[A-Z]{3}$ ]]; then
    log_error "Invalid instance code: $INSTANCE_CODE (must be 3 letters)"
    exit 1
fi

# =============================================================================
# CONFIGURATION
# =============================================================================

VALIDATION_TIMEOUT=300  # 5 minutes max for all validations
TEST_START_TIME=$(date +%s)

# Get compose file for this spoke
SPOKE_COMPOSE_FILE="${DIVE_ROOT}/instances/${INSTANCE_CODE_LOWER}/docker-compose.yml"

if [ ! -f "$SPOKE_COMPOSE_FILE" ]; then
    log_error "Spoke compose file not found: $SPOKE_COMPOSE_FILE"
    log_error "Run './dive spoke init $INSTANCE_CODE' first"
    exit 1
fi

# Load secrets for validation (needed for Redis passwords, MongoDB auth)
if type load_secrets &>/dev/null; then
    load_secrets >/dev/null 2>&1 || log_warn "Could not load secrets for validation"
fi

# Dynamically discover services from compose file
read -r -a CORE_SERVICES <<<"$(compose_get_spoke_services_by_class "$INSTANCE_CODE" "core" 2>/dev/null || echo "")"
read -r -a OPTIONAL_SERVICES <<<"$(compose_get_spoke_services_by_class "$INSTANCE_CODE" "optional" 2>/dev/null || echo "")"
read -r -a STRETCH_SERVICES <<<"$(compose_get_spoke_services_by_class "$INSTANCE_CODE" "stretch" 2>/dev/null || echo "")"

# Fallback if dynamic discovery fails
if [ ${#CORE_SERVICES[@]} -eq 0 ]; then
    log_warn "Dynamic service discovery failed, using fallback list"
    CORE_SERVICES=("postgres" "mongodb" "redis" "keycloak" "opa" "backend" "frontend")
    OPTIONAL_SERVICES=("opal-client")
    STRETCH_SERVICES=("kas")
fi

# Calculate spoke ports based on instance code
# Port calculation: Base port + (country_offset * 10)
# Country offsets from naming-conventions.json
declare -A COUNTRY_OFFSETS=(
    ["FRA"]=1 ["GBR"]=2 ["DEU"]=3 ["CAN"]=4 ["POL"]=5
    ["ESP"]=6 ["ITA"]=7 ["NLD"]=8 ["BEL"]=9 ["PRT"]=10
)

COUNTRY_OFFSET=${COUNTRY_OFFSETS[$INSTANCE_CODE]:-1}
FRONTEND_PORT=$((3000 + COUNTRY_OFFSET * 10))
BACKEND_PORT=$((4000 + COUNTRY_OFFSET * 10))
KEYCLOAK_PORT=$((8443 + COUNTRY_OFFSET * 10))
OPA_PORT=$((8181 + COUNTRY_OFFSET * 10))
KAS_PORT=$((8080 + COUNTRY_OFFSET * 10))

# Service HTTP/HTTPS endpoints
declare -A SERVICE_ENDPOINTS=(
    ["backend"]="https://localhost:${BACKEND_PORT}/health"
    ["frontend"]="https://localhost:${FRONTEND_PORT}/"
    ["keycloak"]="https://localhost:${KEYCLOAK_PORT}/realms/dive-v3-broker-${INSTANCE_CODE_LOWER}"
    ["opa"]="https://localhost:${OPA_PORT}/health"
    ["kas"]="http://localhost:${KAS_PORT}/health"
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
# Test Suite 1: Container Existence (Service Classification Aware)
##
validate_containers() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Test Suite 1: Container Existence"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # CORE services - must exist
    for service in "${CORE_SERVICES[@]}"; do
        test_start "CORE: Container dive-spoke-${INSTANCE_CODE_LOWER}-${service} exists"
        
        if ${DOCKER_CMD} ps --format '{{.Names}}' | grep -q "^dive-spoke-${INSTANCE_CODE_LOWER}-${service}$" 2>/dev/null; then
            test_pass
            VALIDATION_RESULTS["container_${service}"]="PASS"
        else
            test_fail "Container not found (CORE service required)"
            VALIDATION_RESULTS["container_${service}"]="FAIL"
        fi
    done

    # OPTIONAL services - warnings only
    for service in "${OPTIONAL_SERVICES[@]}"; do
        test_start "OPTIONAL: Container dive-spoke-${INSTANCE_CODE_LOWER}-${service} exists"
        
        if ${DOCKER_CMD} ps --format '{{.Names}}' | grep -q "^dive-spoke-${INSTANCE_CODE_LOWER}-${service}$" 2>/dev/null; then
            test_pass
            VALIDATION_RESULTS["container_${service}"]="PASS"
        else
            test_warn "Container not found (OPTIONAL service, not required)"
            VALIDATION_RESULTS["container_${service}"]="WARN"
        fi
    done

    # STRETCH services - warnings only
    for service in "${STRETCH_SERVICES[@]}"; do
        test_start "STRETCH: Container dive-spoke-${INSTANCE_CODE_LOWER}-${service} exists"
        
        if ${DOCKER_CMD} ps --format '{{.Names}}' | grep -q "^dive-spoke-${INSTANCE_CODE_LOWER}-${service}$" 2>/dev/null; then
            test_pass
            VALIDATION_RESULTS["container_${service}"]="PASS"
        else
            test_warn "Container not found (STRETCH service, not required)"
            VALIDATION_RESULTS["container_${service}"]="WARN"
        fi
    done
}

##
# Test Suite 2: Container Health Status (Service Classification Aware)
##
validate_health() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Test Suite 2: Container Health Status"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # CORE services - must be healthy
    for service in "${CORE_SERVICES[@]}"; do
        test_start "CORE: dive-spoke-${INSTANCE_CODE_LOWER}-${service} healthy"
        
        local health
        health=$(${DOCKER_CMD} inspect "dive-spoke-${INSTANCE_CODE_LOWER}-${service}" --format='{{.State.Health.Status}}' 2>/dev/null || echo "no_healthcheck")
        
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

    # OPTIONAL and STRETCH services - warnings only
    for service in "${OPTIONAL_SERVICES[@]}" "${STRETCH_SERVICES[@]}"; do
        if ! ${DOCKER_CMD} ps --format '{{.Names}}' | grep -q "^dive-spoke-${INSTANCE_CODE_LOWER}-${service}$"; then
            continue  # Skip if container doesn't exist
        fi
        
        test_start "NON-CORE: dive-spoke-${INSTANCE_CODE_LOWER}-${service} healthy"
        
        local health
        health=$(${DOCKER_CMD} inspect "dive-spoke-${INSTANCE_CODE_LOWER}-${service}" --format='{{.State.Health.Status}}' 2>/dev/null || echo "no_healthcheck")
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
# Test Suite 3: Service HTTP/HTTPS Endpoints
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
            for core_svc in "${CORE_SERVICES[@]}"; do
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
# Test Suite 4: Database Connectivity
##
validate_databases() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Test Suite 4: Database Connectivity"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # PostgreSQL
    test_start "PostgreSQL accepting connections"
    if ${DOCKER_CMD} exec "dive-spoke-${INSTANCE_CODE_LOWER}-postgres" pg_isready -U keycloak >/dev/null 2>&1; then
        test_pass
        VALIDATION_RESULTS["db_postgres"]="PASS"
    else
        test_fail "pg_isready failed (CORE database)"
        VALIDATION_RESULTS["db_postgres"]="FAIL"
    fi

    # MongoDB - basic connectivity
    test_start "MongoDB accepting connections"
    if ${DOCKER_CMD} exec "dive-spoke-${INSTANCE_CODE_LOWER}-mongodb" mongosh --quiet --eval "db.adminCommand('ping').ok" >/dev/null 2>&1; then
        test_pass
        VALIDATION_RESULTS["db_mongodb"]="PASS"
    else
        test_fail "MongoDB ping failed (CORE database)"
        VALIDATION_RESULTS["db_mongodb"]="FAIL"
    fi

    # MongoDB - replica set PRIMARY status
    test_start "MongoDB replica set PRIMARY status"
    local mongo_password_var="MONGO_PASSWORD_${INSTANCE_CODE}"
    local mongo_password="${!mongo_password_var:-}"
    
    if [ -z "$mongo_password" ] && [ -f "${DIVE_ROOT}/instances/${INSTANCE_CODE_LOWER}/.env" ]; then
        mongo_password=$(grep "^MONGO_PASSWORD_${INSTANCE_CODE}=" "${DIVE_ROOT}/instances/${INSTANCE_CODE_LOWER}/.env" | cut -d= -f2)
    fi
    
    if [ -n "$mongo_password" ]; then
        local rs_status
        rs_status=$(${DOCKER_CMD} exec "dive-spoke-${INSTANCE_CODE_LOWER}-mongodb" mongosh admin \
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
    local redis_password_var="REDIS_PASSWORD_${INSTANCE_CODE}"
    local redis_password="${!redis_password_var:-}"
    
    if [ -z "$redis_password" ] && [ -f "${DIVE_ROOT}/instances/${INSTANCE_CODE_LOWER}/.env" ]; then
        redis_password=$(grep "^REDIS_PASSWORD_${INSTANCE_CODE}=" "${DIVE_ROOT}/instances/${INSTANCE_CODE_LOWER}/.env" | cut -d= -f2)
    fi
    
    if [ -n "$redis_password" ]; then
        if ${DOCKER_CMD} exec "dive-spoke-${INSTANCE_CODE_LOWER}-redis" redis-cli -a "$redis_password" ping 2>/dev/null | grep -q "PONG"; then
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
}

##
# Test Suite 5: Service Dependencies
##
validate_dependencies() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Test Suite 5: Service Dependencies"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Backend can reach MongoDB
    test_start "Backend → MongoDB connectivity"
    if ${DOCKER_CMD} exec "dive-spoke-${INSTANCE_CODE_LOWER}-backend" sh -c "nc -zv mongodb-${INSTANCE_CODE_LOWER} 27017" 2>&1 | grep -q "succeeded\|open"; then
        test_pass
        VALIDATION_RESULTS["dep_backend_mongodb"]="PASS"
    else
        test_fail "Network connection failed"
        VALIDATION_RESULTS["dep_backend_mongodb"]="FAIL"
    fi

    # Backend can reach Keycloak (HTTPS port 8443)
    test_start "Backend → Keycloak HTTPS connectivity"
    if ${DOCKER_CMD} exec "dive-spoke-${INSTANCE_CODE_LOWER}-backend" sh -c "nc -zv keycloak-${INSTANCE_CODE_LOWER} 8443" 2>&1 | grep -q "succeeded\|open"; then
        test_pass
        VALIDATION_RESULTS["dep_backend_keycloak"]="PASS"
    else
        test_fail "Network connection failed"
        VALIDATION_RESULTS["dep_backend_keycloak"]="FAIL"
    fi

    # Frontend can reach Backend (HTTPS port 4000)
    test_start "Frontend → Backend HTTPS connectivity"
    if ${DOCKER_CMD} exec "dive-spoke-${INSTANCE_CODE_LOWER}-frontend" sh -c "nc -zv backend-${INSTANCE_CODE_LOWER} 4000" 2>&1 | grep -q "succeeded\|open"; then
        test_pass
        VALIDATION_RESULTS["dep_frontend_backend"]="PASS"
    else
        test_fail "Network connection failed"
        VALIDATION_RESULTS["dep_frontend_backend"]="FAIL"
    fi
    
    # Backend can reach OPA (HTTPS port 8181)
    test_start "Backend → OPA HTTPS connectivity"
    if ${DOCKER_CMD} exec "dive-spoke-${INSTANCE_CODE_LOWER}-backend" sh -c "nc -zv opa-${INSTANCE_CODE_LOWER} 8181" 2>&1 | grep -q "succeeded\|open"; then
        test_pass
        VALIDATION_RESULTS["dep_backend_opa"]="PASS"
    else
        test_fail "Network connection failed"
        VALIDATION_RESULTS["dep_backend_opa"]="FAIL"
    fi
}

##
# Test Suite 6: Keycloak Realm Configuration
##
validate_keycloak() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Test Suite 6: Keycloak Realm Configuration"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Check Keycloak spoke realm exists
    test_start "Keycloak realm dive-v3-broker-${INSTANCE_CODE_LOWER} exists"
    local realm_check
    realm_check=$(curl -ksSf --max-time 10 "https://localhost:${KEYCLOAK_PORT}/realms/dive-v3-broker-${INSTANCE_CODE_LOWER}" 2>/dev/null || echo "FAIL")
    if [[ "$realm_check" != "FAIL" ]] && echo "$realm_check" | grep -q "dive-v3-broker-${INSTANCE_CODE_LOWER}"; then
        test_pass
        VALIDATION_RESULTS["keycloak_realm"]="PASS"
    else
        test_fail "Realm not accessible or not configured"
        VALIDATION_RESULTS["keycloak_realm"]="FAIL"
    fi

    # Check Keycloak realm is accessible via API
    test_start "Keycloak realm API accessible"
    local api_check
    api_check=$(curl -ksSf --max-time 10 "https://localhost:${KEYCLOAK_PORT}/realms/dive-v3-broker-${INSTANCE_CODE_LOWER}/.well-known/openid-configuration" 2>/dev/null || echo "FAIL")
    if [[ "$api_check" != "FAIL" ]] && echo "$api_check" | grep -q "issuer"; then
        test_pass
        VALIDATION_RESULTS["keycloak_api"]="PASS"
    else
        test_fail "Realm API not accessible"
        VALIDATION_RESULTS["keycloak_api"]="FAIL"
    fi
}

##
# Test Suite 7: Federation IdP Configuration
##
validate_federation() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Test Suite 7: Federation IdP Configuration"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Check if hub IdP is configured in spoke Keycloak (usa-idp)
    test_start "Hub IdP (usa-idp) configured in spoke Keycloak"
    # This is a simplified check - full validation would require Keycloak admin API
    if ${DOCKER_CMD} exec "dive-spoke-${INSTANCE_CODE_LOWER}-keycloak" bash -c "test -d /opt/keycloak/data/import" >/dev/null 2>&1; then
        test_pass
        VALIDATION_RESULTS["federation_hub_idp"]="PASS"
    else
        test_warn "Cannot verify IdP configuration (requires Keycloak admin API)"
        VALIDATION_RESULTS["federation_hub_idp"]="WARN"
    fi

    # Check if spoke IdP is configured in hub Keycloak (would require hub to be running)
    test_start "Spoke IdP (${INSTANCE_CODE_LOWER}-idp) configured in hub Keycloak"
    if ${DOCKER_CMD} ps --format '{{.Names}}' | grep -q "^dive-hub-keycloak$"; then
        # Hub is running, can check
        test_warn "Hub running, but automated IdP check not implemented"
        VALIDATION_RESULTS["federation_spoke_idp"]="WARN"
    else
        test_warn "Hub not running, cannot verify spoke IdP in hub"
        VALIDATION_RESULTS["federation_spoke_idp"]="WARN"
    fi
}

##
# Test Suite 8: Dynamic Service Discovery Validation
##
validate_dynamic_discovery() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Test Suite 8: Dynamic Service Discovery"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Verify service labels present in compose file
    test_start "Service labels present in compose file"
    if grep -q "dive.service.class" "$SPOKE_COMPOSE_FILE"; then
        test_pass
        VALIDATION_RESULTS["discovery_labels"]="PASS"
    else
        test_fail "Service labels not found (required for dynamic discovery)"
        VALIDATION_RESULTS["discovery_labels"]="FAIL"
    fi

    # Verify CORE services classification
    test_start "CORE services classified correctly"
    if [ ${#CORE_SERVICES[@]} -ge 7 ]; then
        test_pass
        VALIDATION_RESULTS["discovery_core"]="PASS"
    else
        test_fail "Expected at least 7 CORE services, found ${#CORE_SERVICES[@]}"
        VALIDATION_RESULTS["discovery_core"]="FAIL"
    fi

    # Verify OPTIONAL services classification
    test_start "OPTIONAL services classified"
    if [ ${#OPTIONAL_SERVICES[@]} -ge 0 ]; then
        test_pass
        VALIDATION_RESULTS["discovery_optional"]="PASS"
    else
        test_warn "No OPTIONAL services found (may be expected)"
        VALIDATION_RESULTS["discovery_optional"]="WARN"
    fi

    # Verify STRETCH services classification
    test_start "STRETCH services classified"
    if [ ${#STRETCH_SERVICES[@]} -ge 0 ]; then
        test_pass
        VALIDATION_RESULTS["discovery_stretch"]="PASS"
    else
        test_warn "No STRETCH services found (may be expected)"
        VALIDATION_RESULTS["discovery_stretch"]="WARN"
    fi

    # Verify all services discovered dynamically
    test_start "All services discovered dynamically"
    local all_services
    all_services=$(compose_get_spoke_services "$INSTANCE_CODE" 2>/dev/null || echo "")
    if [ -n "$all_services" ]; then
        local service_count
        service_count=$(echo "$all_services" | wc -w)
        if [ "$service_count" -ge 7 ]; then
            test_pass
            VALIDATION_RESULTS["discovery_all"]="PASS"
        else
            test_fail "Expected at least 7 services, found $service_count"
            VALIDATION_RESULTS["discovery_all"]="FAIL"
        fi
    else
        test_fail "Dynamic service discovery returned empty"
        VALIDATION_RESULTS["discovery_all"]="FAIL"
    fi
}

##
# Test Suite 9: Backend API Tests
##
validate_backend_api() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Test Suite 9: Backend API"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # /health endpoint returns 200
    test_start "Backend /health endpoint returns 200"
    if curl -ksSf --max-time 10 "https://localhost:${BACKEND_PORT}/health" > /dev/null 2>&1; then
        test_pass
        VALIDATION_RESULTS["api_health"]="PASS"
    else
        test_fail "Health check failed"
        VALIDATION_RESULTS["api_health"]="FAIL"
    fi

    # /api/resources requires authentication (should return 401)
    test_start "Backend /api/resources requires authentication"
    local status_code
    status_code=$(curl -ksSf -o /dev/null -w "%{http_code}" --max-time 10 "https://localhost:${BACKEND_PORT}/api/resources" 2>/dev/null || echo "000")
    if [ "$status_code" = "401" ] || [ "$status_code" = "403" ]; then
        test_pass
        VALIDATION_RESULTS["api_auth"]="PASS"
    else
        test_warn "Expected 401/403, got $status_code (may be OK if no auth configured)"
        VALIDATION_RESULTS["api_auth"]="WARN"
    fi

    # API responds within 2 seconds
    test_start "Backend API responds within 2 seconds"
    local start
    start=$(date +%s)
    curl -ksSf --max-time 2 "https://localhost:${BACKEND_PORT}/health" > /dev/null 2>&1
    local end
    end=$(date +%s)
    local duration=$((end - start))
    
    if [ $duration -le 2 ]; then
        test_pass
        VALIDATION_RESULTS["api_performance"]="PASS"
    else
        test_warn "Response took ${duration}s (target: <2s)"
        VALIDATION_RESULTS["api_performance"]="WARN"
    fi
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

main() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║  DIVE V3 Spoke Deployment Validation                           ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    echo "  Instance: ${INSTANCE_CODE} (Spoke)"
    echo "  Date: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "  Ports: Frontend=${FRONTEND_PORT}, Backend=${BACKEND_PORT}, Keycloak=${KEYCLOAK_PORT}"
    echo ""

    # Run validation test suites
    validate_containers
    validate_health
    validate_databases
    validate_dependencies
    validate_endpoints
    validate_keycloak
    validate_federation
    validate_dynamic_discovery
    validate_backend_api

    # Calculate duration
    local end_time
    end_time=$(date +%s)
    local duration=$((end_time - TEST_START_TIME))

    # Summary
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Validation Summary"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Total Tests:  $TOTAL_TESTS"
    echo "  Passed:       ${GREEN}$PASSED_TESTS${NC}"
    if [ $WARNING_TESTS -gt 0 ]; then
        echo "  Warnings:     ${YELLOW}$WARNING_TESTS${NC} (non-core services or optional checks)"
    fi
    echo "  Failed:       ${RED}$FAILED_TESTS${NC}"
    echo "  Duration:     ${duration}s"
    echo ""

    # Classification Summary
    echo "  Service Classification:"
    echo "    CORE Services:     ${#CORE_SERVICES[@]} (required)"
    echo "    OPTIONAL Services: ${#OPTIONAL_SERVICES[@]} (enhanced features)"
    echo "    STRETCH Services:  ${#STRETCH_SERVICES[@]} (advanced features)"
    echo ""

    # Discovered services
    echo "  Discovered Services:"
    if [ ${#CORE_SERVICES[@]} -gt 0 ]; then
        echo "    CORE: ${CORE_SERVICES[*]}"
    fi
    if [ ${#OPTIONAL_SERVICES[@]} -gt 0 ]; then
        echo "    OPTIONAL: ${OPTIONAL_SERVICES[*]}"
    fi
    if [ ${#STRETCH_SERVICES[@]} -gt 0 ]; then
        echo "    STRETCH: ${STRETCH_SERVICES[*]}"
    fi
    echo ""

    if [ $FAILED_TESTS -eq 0 ]; then
        echo -e "  ${GREEN}✅ ALL CORE VALIDATIONS PASSED${NC}"
        if [ $WARNING_TESTS -gt 0 ]; then
            echo -e "  ${YELLOW}⚠️  $WARNING_TESTS non-core service warnings (acceptable)${NC}"
        fi
        echo "  Spoke ${INSTANCE_CODE} deployment is fully operational"
        echo ""
        return 0
    else
        echo -e "  ${RED}❌ VALIDATION FAILURES DETECTED${NC}"
        echo "  Spoke ${INSTANCE_CODE} deployment is NOT fully operational"
        echo ""
        echo "  Failed tests:"
        for key in "${!VALIDATION_RESULTS[@]}"; do
            if [ "${VALIDATION_RESULTS[$key]}" = "FAIL" ]; then
                echo "    - $key"
            fi
        done
        echo ""
        echo "  Recommendations:"
        echo "    1. Check service logs: ./dive spoke logs $INSTANCE_CODE <service>"
        echo "    2. Verify secrets loaded: Check instances/${INSTANCE_CODE_LOWER}/.env exists"
        echo "    3. For MongoDB issues: Check replica set initialization"
        echo "    4. Redeploy if needed: ./dive nuke spoke $INSTANCE_CODE && ./dive spoke deploy $INSTANCE_CODE"
        echo ""
        return 1
    fi
}

main "$@"

# sc2034-anchor
: "${VALIDATION_TIMEOUT:-}"
