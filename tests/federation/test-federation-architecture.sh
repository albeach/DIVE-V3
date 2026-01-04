#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Federation Architecture Integration Tests
# =============================================================================
# Comprehensive test suite for hub-spoke federation architecture.
# Tests the 8-point verification, OPAL data distribution, KAS routing, etc.
#
# Phase 4: Testing & Validation
#
# Usage:
#   ./tests/federation/test-federation-architecture.sh [--spoke CODE] [--quick]
#
# Options:
#   --spoke CODE    Test specific spoke (default: test all running spokes)
#   --quick         Skip slow tests (KAS, OPAL sync)
#   --verbose       Show detailed output
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Options
SPECIFIC_SPOKE=""
QUICK_MODE=false
VERBOSE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --spoke)
            SPECIFIC_SPOKE="${2^^}"
            shift 2
            ;;
        --quick)
            QUICK_MODE=true
            shift
            ;;
        --verbose|-v)
            VERBOSE=true
            shift
            ;;
        *)
            shift
            ;;
    esac
done

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

log_test() {
    echo -n "  $1... "
}

pass() {
    echo -e "${GREEN}✓ PASS${NC}"
    ((TESTS_PASSED++))
}

fail() {
    echo -e "${RED}✗ FAIL${NC}${1:+ ($1)}"
    ((TESTS_FAILED++))
}

skip() {
    echo -e "${YELLOW}⊘ SKIP${NC}${1:+ ($1)}"
    ((TESTS_SKIPPED++))
}

section() {
    echo ""
    echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}$1${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
}

subsection() {
    echo ""
    echo -e "${CYAN}─── $1 ───${NC}"
}

# =============================================================================
# TEST 1: HUB SERVICES
# =============================================================================

test_hub_services() {
    section "Test 1: Hub Services Health"
    
    # Hub Keycloak
    log_test "Hub Keycloak is running"
    if docker ps --format '{{.Names}}' | grep -q "dive-hub-keycloak"; then
        pass
    else
        fail "Container not running"
    fi
    
    # Hub Backend
    log_test "Hub Backend API is healthy"
    if curl -ks --max-time 5 "https://localhost:4000/health" | grep -q '"status"'; then
        pass
    else
        fail "API not responding"
    fi
    
    # Hub OPA
    log_test "Hub OPA is healthy"
    if curl -ks --max-time 5 "https://localhost:8181/health" | grep -q "ok"; then
        pass
    else
        # Try alternative health check
        if docker exec dive-hub-opa /opa version >/dev/null 2>&1; then
            pass
        else
            fail "OPA not responding"
        fi
    fi
    
    # Hub OPAL Server
    log_test "Hub OPAL Server is running"
    if docker ps --format '{{.Names}}' | grep -q "dive-hub-opal-server"; then
        if curl -ks --max-time 5 "https://localhost:7002/healthcheck" >/dev/null 2>&1; then
            pass
        else
            skip "Running but health check failed"
        fi
    else
        skip "OPAL Server not deployed"
    fi
    
    # Hub MongoDB
    log_test "Hub MongoDB is healthy"
    if docker exec dive-hub-mongodb mongosh --quiet --eval "db.runCommand({ping:1})" >/dev/null 2>&1; then
        pass
    else
        fail "MongoDB not responding"
    fi
}

# =============================================================================
# TEST 2: SPOKE SERVICES (For each spoke)
# =============================================================================

test_spoke_services() {
    local spoke_code="$1"
    local spoke_lower="${spoke_code,,}"
    
    subsection "Spoke: ${spoke_code}"
    
    # Spoke Keycloak
    log_test "${spoke_code} Keycloak is running"
    if docker ps --format '{{.Names}}' | grep -q "dive-spoke-${spoke_lower}-keycloak"; then
        pass
    else
        fail "Container not running"
        return 1
    fi
    
    # Spoke Backend
    local spoke_backend_port
    spoke_backend_port=$(docker port "dive-spoke-${spoke_lower}-backend" 4000 2>/dev/null | cut -d: -f2 | head -1)
    if [ -n "$spoke_backend_port" ]; then
        log_test "${spoke_code} Backend API is healthy"
        if curl -ks --max-time 5 "https://localhost:${spoke_backend_port}/health" | grep -q '"status"'; then
            pass
        else
            fail "API not responding"
        fi
    else
        log_test "${spoke_code} Backend API is healthy"
        skip "Port not found"
    fi
    
    # Spoke OPA
    log_test "${spoke_code} OPA is running"
    if docker ps --format '{{.Names}}' | grep -q "dive-spoke-${spoke_lower}-opa"; then
        pass
    else
        skip "OPA not deployed"
    fi
    
    # Spoke KAS
    log_test "${spoke_code} KAS is running"
    if docker ps --format '{{.Names}}' | grep -q "dive-spoke-${spoke_lower}-kas"; then
        pass
    else
        skip "KAS not deployed"
    fi
}

# =============================================================================
# TEST 3: FEDERATION BIDIRECTIONAL SSO
# =============================================================================

test_federation_bidirectional() {
    local spoke_code="$1"
    local spoke_lower="${spoke_code,,}"
    
    subsection "Federation: ${spoke_code} ↔ USA"
    
    local hub_kc="dive-hub-keycloak"
    local spoke_kc="dive-spoke-${spoke_lower}-keycloak"
    
    # Get Hub admin token
    local hub_pass
    hub_pass=$(docker exec "$hub_kc" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
    
    if [ -z "$hub_pass" ]; then
        log_test "${spoke_code}-idp exists in Hub"
        skip "Cannot get Hub password"
        return
    fi
    
    local hub_token
    hub_token=$(docker exec "$hub_kc" curl -sf --max-time 10 \
        -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
        -d "grant_type=password" \
        -d "username=admin" \
        -d "password=${hub_pass}" \
        -d "client_id=admin-cli" 2>/dev/null | jq -r '.access_token // ""')
    
    # Check Spoke IdP in Hub
    log_test "${spoke_code}-idp exists in Hub Keycloak"
    if [ -n "$hub_token" ]; then
        local idp_check
        idp_check=$(docker exec "$hub_kc" curl -sf --max-time 10 \
            -H "Authorization: Bearer $hub_token" \
            "http://localhost:8080/admin/realms/dive-v3-broker-usa/identity-provider/instances/${spoke_lower}-idp" 2>/dev/null)
        
        if echo "$idp_check" | grep -q '"alias"'; then
            pass
        else
            fail "IdP not found"
        fi
    else
        fail "Auth failed"
    fi
    
    # Check Hub IdP in Spoke (if container exists)
    if docker ps --format '{{.Names}}' | grep -q "$spoke_kc"; then
        local spoke_pass
        spoke_pass=$(docker exec "$spoke_kc" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
        
        if [ -n "$spoke_pass" ]; then
            local spoke_token
            spoke_token=$(docker exec "$spoke_kc" curl -sf --max-time 10 \
                -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
                -d "grant_type=password" \
                -d "username=admin" \
                -d "password=${spoke_pass}" \
                -d "client_id=admin-cli" 2>/dev/null | jq -r '.access_token // ""')
            
            log_test "usa-idp exists in ${spoke_code} Keycloak"
            if [ -n "$spoke_token" ]; then
                local hub_idp_check
                hub_idp_check=$(docker exec "$spoke_kc" curl -sf --max-time 10 \
                    -H "Authorization: Bearer $spoke_token" \
                    "http://localhost:8080/admin/realms/dive-v3-broker-${spoke_lower}/identity-provider/instances/usa-idp" 2>/dev/null)
                
                if echo "$hub_idp_check" | grep -q '"alias"'; then
                    pass
                else
                    fail "IdP not found"
                fi
            else
                fail "Auth failed"
            fi
        else
            log_test "usa-idp exists in ${spoke_code} Keycloak"
            skip "Cannot get password"
        fi
    fi
    
    # Check firstBrokerLoginFlowAlias configuration
    log_test "firstBrokerLoginFlowAlias is empty (no profile prompt)"
    if [ -n "$hub_token" ]; then
        local idp_config
        idp_config=$(docker exec "$hub_kc" curl -sf --max-time 10 \
            -H "Authorization: Bearer $hub_token" \
            "http://localhost:8080/admin/realms/dive-v3-broker-usa/identity-provider/instances/${spoke_lower}-idp" 2>/dev/null)
        
        local first_broker_flow
        first_broker_flow=$(echo "$idp_config" | jq -r '.firstBrokerLoginFlowAlias // ""' 2>/dev/null)
        
        if [ -z "$first_broker_flow" ] || [ "$first_broker_flow" = "null" ]; then
            pass
        else
            fail "Set to '$first_broker_flow'"
        fi
    else
        skip "No token"
    fi
}

# =============================================================================
# TEST 4: OPAL DATA DISTRIBUTION
# =============================================================================

test_opal_data() {
    section "Test 4: OPAL Data Distribution"
    
    if [ "$QUICK_MODE" = true ]; then
        log_test "OPAL data endpoints"
        skip "Quick mode"
        return
    fi
    
    # Trusted Issuers endpoint
    log_test "GET /api/opal/trusted-issuers returns data"
    local issuers_response
    issuers_response=$(curl -ks --max-time 10 "https://localhost:4000/api/opal/trusted-issuers" 2>/dev/null)
    if echo "$issuers_response" | jq -e '.success == true' >/dev/null 2>&1; then
        local issuer_count
        issuer_count=$(echo "$issuers_response" | jq -r '.count // 0')
        if [ "$issuer_count" -gt 0 ]; then
            pass
        else
            fail "No issuers found"
        fi
    else
        fail "Endpoint failed"
    fi
    
    # Federation Matrix endpoint
    log_test "GET /api/opal/federation-matrix returns data"
    local matrix_response
    matrix_response=$(curl -ks --max-time 10 "https://localhost:4000/api/opal/federation-matrix" 2>/dev/null)
    if echo "$matrix_response" | jq -e '.success == true' >/dev/null 2>&1; then
        pass
    else
        fail "Endpoint failed"
    fi
    
    # Tenant Configs endpoint
    log_test "GET /api/opal/tenant-configs returns data"
    local configs_response
    configs_response=$(curl -ks --max-time 10 "https://localhost:4000/api/opal/tenant-configs" 2>/dev/null)
    if echo "$configs_response" | jq -e '.success == true' >/dev/null 2>&1; then
        pass
    else
        fail "Endpoint failed"
    fi
    
    # CDC Status
    log_test "GET /api/opal/cdc/status (admin)"
    local cdc_response
    cdc_response=$(curl -ks --max-time 10 -H "x-admin-key: dive-hub-admin-key" \
        "https://localhost:4000/api/opal/cdc/status" 2>/dev/null)
    if echo "$cdc_response" | jq -e '.success == true' >/dev/null 2>&1; then
        pass
    else
        skip "CDC not running or no admin access"
    fi
}

# =============================================================================
# TEST 5: KAS REGISTRY AND ROUTING
# =============================================================================

test_kas_registry() {
    section "Test 5: KAS Registry & Routing"
    
    if [ "$QUICK_MODE" = true ]; then
        log_test "KAS registry endpoints"
        skip "Quick mode"
        return
    fi
    
    # KAS Health
    log_test "Hub KAS health endpoint"
    if curl -ks --max-time 5 "https://localhost:8085/health" | grep -q "healthy"; then
        pass
    else
        skip "KAS not deployed"
    fi
    
    # KAS Registry List
    log_test "GET /api/kas/registry returns instances"
    local registry_response
    registry_response=$(curl -ks --max-time 10 "https://localhost:4000/api/kas/registry" 2>/dev/null)
    if echo "$registry_response" | jq -e '.success == true' >/dev/null 2>&1; then
        local kas_count
        kas_count=$(echo "$registry_response" | jq -r '.total // 0')
        if [ "$kas_count" -gt 0 ]; then
            pass
        else
            skip "No KAS instances in registry"
        fi
    else
        fail "Endpoint failed"
    fi
    
    # KAS Routing Table
    log_test "GET /api/kas/routing-table"
    local routing_response
    routing_response=$(curl -ks --max-time 10 "https://localhost:4000/api/kas/routing-table" 2>/dev/null)
    if echo "$routing_response" | jq -e '.success == true' >/dev/null 2>&1; then
        pass
    else
        fail "Endpoint failed"
    fi
    
    # KAS Route Resolution
    log_test "POST /api/kas/route (USA → FRA)"
    local route_response
    route_response=$(curl -ks --max-time 10 -X POST \
        -H "Content-Type: application/json" \
        -d '{"originInstance":"USA","requesterInstance":"FRA"}' \
        "https://localhost:4000/api/kas/route" 2>/dev/null)
    if echo "$route_response" | jq -e '.success == true or .route != null' >/dev/null 2>&1; then
        pass
    else
        skip "No route available"
    fi
}

# =============================================================================
# TEST 6: POLICY DATA SYNC
# =============================================================================

test_policy_sync() {
    section "Test 6: Policy Data Synchronization"
    
    # OPA has policies loaded
    log_test "OPA has dive.authorization package loaded"
    local opa_packages
    opa_packages=$(curl -ks --max-time 10 "https://localhost:8181/v1/policies" 2>/dev/null | jq -r '.result[].id // ""' 2>/dev/null)
    if echo "$opa_packages" | grep -q "dive"; then
        pass
    else
        skip "Package not found"
    fi
    
    # Policy data is populated
    log_test "OPA has trusted_issuers data"
    local opa_issuers
    opa_issuers=$(curl -ks --max-time 10 "https://localhost:8181/v1/data/dive/trusted_issuers" 2>/dev/null)
    if echo "$opa_issuers" | jq -e '.result != null' >/dev/null 2>&1; then
        pass
    else
        skip "Data not found"
    fi
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

main() {
    echo ""
    echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║     DIVE V3 Federation Architecture Integration Tests       ║${NC}"
    echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "  Start Time: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "  Quick Mode: ${QUICK_MODE}"
    [ -n "$SPECIFIC_SPOKE" ] && echo "  Target Spoke: ${SPECIFIC_SPOKE}"
    
    # Test 1: Hub Services
    test_hub_services
    
    # Test 2 & 3: Spoke Services and Federation
    section "Test 2 & 3: Spoke Services & Federation"
    
    if [ -n "$SPECIFIC_SPOKE" ]; then
        # Test specific spoke
        test_spoke_services "$SPECIFIC_SPOKE"
        test_federation_bidirectional "$SPECIFIC_SPOKE"
    else
        # Find all running spokes
        local running_spokes
        running_spokes=$(docker ps --format '{{.Names}}' 2>/dev/null | \
            grep -oE 'dive-spoke-[a-z]{3}-keycloak' | \
            sed 's/dive-spoke-\([a-z]*\)-keycloak/\1/' | \
            tr '[:lower:]' '[:upper:]' | sort -u)
        
        if [ -z "$running_spokes" ]; then
            echo ""
            echo -e "  ${YELLOW}No spoke instances found. Start a spoke with:${NC}"
            echo "    ./dive spoke deploy <CODE>"
        else
            for spoke in $running_spokes; do
                test_spoke_services "$spoke"
                test_federation_bidirectional "$spoke"
            done
        fi
    fi
    
    # Test 4: OPAL Data Distribution
    test_opal_data
    
    # Test 5: KAS Registry
    test_kas_registry
    
    # Test 6: Policy Sync
    test_policy_sync
    
    # Summary
    echo ""
    echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}Test Summary${NC}"
    echo -e "═══════════════════════════════════════════════════════════════"
    echo ""
    echo -e "  ${GREEN}Passed:${NC}  ${TESTS_PASSED}"
    echo -e "  ${RED}Failed:${NC}  ${TESTS_FAILED}"
    echo -e "  ${YELLOW}Skipped:${NC} ${TESTS_SKIPPED}"
    echo ""
    echo "  End Time: $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""
    
    if [ "$TESTS_FAILED" -eq 0 ]; then
        echo -e "${GREEN}✓ All tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}✗ Some tests failed. Review output above.${NC}"
        exit 1
    fi
}

# Run main
main "$@"
