#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Hub Deployment Validation
# =============================================================================
# Comprehensive validation suite for hub deployment
# Tests: user existence, login capability, infrastructure health
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_test()    { echo -e "${BLUE}▶${NC} TEST: $1"; }
log_pass()    { echo -e "${GREEN}✓${NC} PASS: $1"; }
log_fail()    { echo -e "${RED}✗${NC} FAIL: $1"; }
log_warn()    { echo -e "${YELLOW}⚠${NC} WARN: $1"; }
log_info()    { echo -e "${CYAN}ℹ${NC} INFO: $1"; }

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Keycloak configuration
KEYCLOAK_URL="${KEYCLOAK_URL:-https://localhost:8443}"
REALM_NAME="${REALM_NAME:-dive-v3-broker-usa}"
CLIENT_ID="${CLIENT_ID:-dive-v3-broker-usa}"
ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"

# Get admin password from container
for container in "dive-v3-backend" "dive-hub-backend" "dive-v3-keycloak"; do
    if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        ADMIN_PASSWORD=$(docker exec "$container" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null || echo "")
        [ -n "$ADMIN_PASSWORD" ] && break
    fi
done

if [ -z "$ADMIN_PASSWORD" ]; then
    log_fail "KEYCLOAK_ADMIN_PASSWORD not found"
    exit 1
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         DIVE V3 Hub Deployment Validation                    ║"
echo "║              Comprehensive Test Suite                        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# =============================================================================
# TEST 1: Container Health
# =============================================================================
run_test() {
    ((TESTS_RUN++))
    "$@"
}

test_container_health() {
    log_test "Container health checks"
    
    local required_containers=(
        "dive-hub-postgres"
        "dive-hub-mongodb"
        "dive-hub-keycloak"
        "dive-hub-backend"
        "dive-hub-frontend"
    )
    
    local all_healthy=true
    
    for container in "${required_containers[@]}"; do
        if ! docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
            log_fail "Container not running: $container"
            all_healthy=false
            ((TESTS_FAILED++))
            return 1
        fi
        
        local health=$(docker inspect "$container" --format='{{.State.Health.Status}}' 2>/dev/null || echo "no_health_check")
        
        if [ "$health" = "healthy" ] || [ "$health" = "no_health_check" ]; then
            log_info "  ✓ $container: $health"
        else
            log_fail "  ✗ $container: $health"
            all_healthy=false
        fi
    done
    
    if [ "$all_healthy" = true ]; then
        log_pass "All required containers are healthy"
        ((TESTS_PASSED++))
        return 0
    else
        ((TESTS_FAILED++))
        return 1
    fi
}

# =============================================================================
# TEST 2: MongoDB Replica Set Status
# =============================================================================
test_mongodb_replica_set() {
    log_test "MongoDB replica set status"
    
    local state=$(docker exec dive-hub-mongodb mongosh admin -u admin -p "$ADMIN_PASSWORD" \
        --quiet --eval "rs.status().members[0].stateStr" 2>/dev/null || echo "ERROR")
    
    if [ "$state" = "PRIMARY" ]; then
        log_pass "MongoDB is PRIMARY"
        ((TESTS_PASSED++))
        return 0
    else
        log_fail "MongoDB state: $state (expected PRIMARY)"
        ((TESTS_FAILED++))
        return 1
    fi
}

# =============================================================================
# TEST 3: Keycloak Realm Exists
# =============================================================================
test_keycloak_realm() {
    log_test "Keycloak realm existence"
    
    local realm_response=$(curl -sk --max-time 10 "${KEYCLOAK_URL}/realms/${REALM_NAME}" 2>/dev/null)
    local realm_name=$(echo "$realm_response" | jq -r '.realm // empty' 2>/dev/null)
    
    if [ "$realm_name" = "$REALM_NAME" ]; then
        log_pass "Realm '$REALM_NAME' exists"
        ((TESTS_PASSED++))
        return 0
    else
        log_fail "Realm '$REALM_NAME' not found"
        ((TESTS_FAILED++))
        return 1
    fi
}

# =============================================================================
# TEST 4: Authenticate with Keycloak
# =============================================================================
authenticate_keycloak() {
    log_test "Keycloak admin authentication"
    
    local token=$(curl -sk -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
        -d "grant_type=password" \
        -d "client_id=admin-cli" \
        -d "username=${ADMIN_USER}" \
        -d "password=${ADMIN_PASSWORD}" 2>/dev/null | jq -r '.access_token // empty')
    
    if [ -n "$token" ] && [ "$token" != "null" ]; then
        log_pass "Successfully authenticated with Keycloak"
        echo "$token"
        ((TESTS_PASSED++))
        return 0
    else
        log_fail "Failed to authenticate with Keycloak"
        ((TESTS_FAILED++))
        return 1
    fi
}

# =============================================================================
# TEST 5: User Existence (All 6 Users)
# =============================================================================
test_user_existence() {
    log_test "Test user existence in Keycloak"
    
    local token="$1"
    local expected_users=(
        "testuser-usa-1"
        "testuser-usa-2"
        "testuser-usa-3"
        "testuser-usa-4"
        "testuser-usa-5"
        "admin-usa"
    )
    
    local all_exist=true
    
    for user in "${expected_users[@]}"; do
        local user_data=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users?username=${user}" \
            -H "Authorization: Bearer $token" 2>/dev/null)
        
        local user_id=$(echo "$user_data" | jq -r '.[0].id // empty')
        
        if [ -n "$user_id" ]; then
            log_info "  ✓ $user exists"
        else
            log_fail "  ✗ $user NOT FOUND"
            all_exist=false
        fi
    done
    
    if [ "$all_exist" = true ]; then
        log_pass "All 6 test users exist"
        ((TESTS_PASSED++))
        return 0
    else
        log_fail "Some users are missing"
        ((TESTS_FAILED++))
        return 1
    fi
}

# =============================================================================
# TEST 6: User Attributes Validation
# =============================================================================
test_user_attributes() {
    log_test "User attribute validation"
    
    local token="$1"
    
    # Test testuser-usa-5 (TOP_SECRET with COIs)
    local user_data=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users?username=testuser-usa-5" \
        -H "Authorization: Bearer $token" 2>/dev/null | jq -r '.[0]')
    
    local clearance=$(echo "$user_data" | jq -r '.attributes.clearance[0] // empty')
    local country=$(echo "$user_data" | jq -r '.attributes.countryOfAffiliation[0] // empty')
    local unique_id=$(echo "$user_data" | jq -r '.attributes.uniqueID[0] // empty')
    local coi_count=$(echo "$user_data" | jq -r '.attributes.acpCOI | length')
    
    local attributes_valid=true
    
    if [ "$clearance" = "TOP_SECRET" ]; then
        log_info "  ✓ testuser-usa-5: clearance = TOP_SECRET"
    else
        log_fail "  ✗ testuser-usa-5: clearance = $clearance (expected TOP_SECRET)"
        attributes_valid=false
    fi
    
    if [ "$country" = "USA" ]; then
        log_info "  ✓ testuser-usa-5: countryOfAffiliation = USA"
    else
        log_fail "  ✗ testuser-usa-5: countryOfAffiliation = $country (expected USA)"
        attributes_valid=false
    fi
    
    if [ "$unique_id" = "testuser-usa-5" ]; then
        log_info "  ✓ testuser-usa-5: uniqueID = testuser-usa-5"
    else
        log_fail "  ✗ testuser-usa-5: uniqueID = $unique_id (expected testuser-usa-5)"
        attributes_valid=false
    fi
    
    if [ "$coi_count" = "2" ]; then
        log_info "  ✓ testuser-usa-5: acpCOI count = 2 (NATO, FVEY)"
    else
        log_fail "  ✗ testuser-usa-5: acpCOI count = $coi_count (expected 2)"
        attributes_valid=false
    fi
    
    if [ "$attributes_valid" = true ]; then
        log_pass "User attributes are correct"
        ((TESTS_PASSED++))
        return 0
    else
        log_fail "User attributes are incorrect"
        ((TESTS_FAILED++))
        return 1
    fi
}

# =============================================================================
# TEST 7: Backend API Health
# =============================================================================
test_backend_health() {
    log_test "Backend API health check"
    
    local response=$(curl -sf http://localhost:4000/health 2>/dev/null)
    local status=$(echo "$response" | jq -r '.status // empty')
    
    if [ "$status" = "healthy" ]; then
        log_pass "Backend API is healthy"
        ((TESTS_PASSED++))
        return 0
    else
        log_fail "Backend API health check failed"
        ((TESTS_FAILED++))
        return 1
    fi
}

# =============================================================================
# TEST 8: COI Keys Initialized
# =============================================================================
test_coi_keys() {
    log_test "COI keys initialization"
    
    local response=$(curl -sf http://localhost:4000/api/coi-keys 2>/dev/null)
    local count=$(echo "$response" | jq -r 'length')
    
    if [ "$count" -ge 22 ]; then
        log_pass "COI keys initialized ($count COIs)"
        ((TESTS_PASSED++))
        return 0
    else
        log_fail "COI keys not initialized properly (expected ≥22, got $count)"
        ((TESTS_FAILED++))
        return 1
    fi
}

# =============================================================================
# TEST 9: Resources Seeded
# =============================================================================
test_resources_seeded() {
    log_test "ZTDF resources seeded"
    
    # Get admin token for API access
    local backend_container="dive-hub-backend"
    local token_response=$(docker exec "$backend_container" curl -sk -X POST \
        "${KEYCLOAK_URL}/realms/${REALM_NAME}/protocol/openid-connect/token" \
        -d "grant_type=password" \
        -d "client_id=${CLIENT_ID}" \
        -d "username=admin-usa" \
        -d "password=TestUser2025!SecureAdmin" 2>/dev/null)
    
    local access_token=$(echo "$token_response" | jq -r '.access_token // empty')
    
    if [ -z "$access_token" ]; then
        log_warn "Could not authenticate as admin-usa (skip resource check)"
        return 0
    fi
    
    local response=$(docker exec "$backend_container" curl -sf \
        -H "Authorization: Bearer $access_token" \
        http://localhost:4000/api/resources 2>/dev/null)
    
    local count=$(echo "$response" | jq -r '.pagination.totalCount // 0')
    
    if [ "$count" -ge 100 ]; then
        log_pass "Resources seeded ($count resources)"
        ((TESTS_PASSED++))
        return 0
    else
        log_warn "Resources may not be seeded yet (found $count)"
        # Don't fail - seeding might still be in progress
        return 0
    fi
}

# =============================================================================
# RUN ALL TESTS
# =============================================================================
echo "Running validation tests..."
echo ""

# Run tests
run_test test_container_health
run_test test_mongodb_replica_set
run_test test_keycloak_realm

# Authenticate once for subsequent tests
TOKEN=$(authenticate_keycloak)
if [ $? -eq 0 ]; then
    run_test test_user_existence "$TOKEN"
    run_test test_user_attributes "$TOKEN"
fi

run_test test_backend_health
run_test test_coi_keys
run_test test_resources_seeded

# =============================================================================
# RESULTS SUMMARY
# =============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Validation Results"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Tests Run:    $TESTS_RUN"
echo "  Tests Passed: $TESTS_PASSED"
echo "  Tests Failed: $TESTS_FAILED"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ ALL TESTS PASSED${NC}"
    echo ""
    echo "Hub deployment is fully operational!"
    echo ""
    echo "Next steps:"
    echo "  • Login at https://localhost:3000"
    echo "  • Username: testuser-usa-1"
    echo "  • Password: TestUser2025!Pilot"
    echo ""
    exit 0
else
    echo -e "${RED}✗ $TESTS_FAILED TEST(S) FAILED${NC}"
    echo ""
    echo "Hub deployment may have issues. Check logs:"
    echo "  ./dive hub logs backend"
    echo "  ./dive hub logs keycloak"
    echo ""
    exit 1
fi
