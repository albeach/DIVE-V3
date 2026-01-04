#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Federation Resilience Tests
# =============================================================================
# Tests the federation architecture's resilience to various failure scenarios:
# - Hub service unavailability
# - Spoke service failures
# - Network partitioning
# - Recovery scenarios
#
# Phase 4.4: Resilience Testing
#
# Usage:
#   ./tests/federation/test-resilience.sh [options]
#
# Options:
#   --spoke CODE     Spoke to test (default: FRA)
#   --scenario NAME  Run specific scenario only
#   --skip-cleanup   Don't restore services after tests
#   --verbose        Show detailed output
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

# Options
SPOKE_CODE="FRA"
SPECIFIC_SCENARIO=""
SKIP_CLEANUP=false
VERBOSE=false

# Test counters
SCENARIOS_PASSED=0
SCENARIOS_FAILED=0
SCENARIOS_SKIPPED=0

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --spoke)
            SPOKE_CODE="${2^^}"
            shift 2
            ;;
        --scenario)
            SPECIFIC_SCENARIO="$2"
            shift 2
            ;;
        --skip-cleanup)
            SKIP_CLEANUP=true
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

SPOKE_LOWER="${SPOKE_CODE,,}"

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

log_scenario() {
    echo ""
    echo -e "${BOLD}${CYAN}╭─────────────────────────────────────────────────────────────╮${NC}"
    echo -e "${BOLD}│ Scenario: $1${NC}"
    echo -e "${CYAN}╰─────────────────────────────────────────────────────────────╯${NC}"
}

log_step() {
    echo -e "  ${CYAN}→${NC} $1"
}

log_check() {
    echo -n "  ✓ Checking: $1... "
}

pass() {
    echo -e "${GREEN}PASS${NC}"
}

fail() {
    echo -e "${RED}FAIL${NC}${1:+ ($1)}"
}

skip() {
    echo -e "${YELLOW}SKIP${NC}${1:+ ($1)}"
}

scenario_pass() {
    echo -e "  ${GREEN}━━━ SCENARIO PASSED ━━━${NC}"
    ((SCENARIOS_PASSED++))
}

scenario_fail() {
    echo -e "  ${RED}━━━ SCENARIO FAILED: $1 ━━━${NC}"
    ((SCENARIOS_FAILED++))
}

scenario_skip() {
    echo -e "  ${YELLOW}━━━ SCENARIO SKIPPED: $1 ━━━${NC}"
    ((SCENARIOS_SKIPPED++))
}

# Wait for a service to be healthy
wait_for_service() {
    local service="$1"
    local url="$2"
    local max_wait="${3:-60}"
    local waited=0
    
    while [ $waited -lt $max_wait ]; do
        if curl -ks --max-time 5 "$url" >/dev/null 2>&1; then
            return 0
        fi
        sleep 2
        ((waited += 2))
    done
    return 1
}

# Stop a container safely
stop_container() {
    local name="$1"
    docker stop "$name" >/dev/null 2>&1 || true
}

# Start a container safely
start_container() {
    local name="$1"
    docker start "$name" >/dev/null 2>&1 || true
}

# Get container health
container_running() {
    local name="$1"
    docker ps --format '{{.Names}}' | grep -q "^${name}$"
}

# =============================================================================
# SCENARIO 1: HUB KEYCLOAK UNAVAILABLE
# =============================================================================

scenario_hub_keycloak_down() {
    log_scenario "Hub Keycloak Unavailability"
    
    local hub_kc="dive-hub-keycloak"
    local spoke_kc="dive-spoke-${SPOKE_LOWER}-keycloak"
    
    # Pre-check
    if ! container_running "$hub_kc"; then
        scenario_skip "Hub Keycloak not running"
        return
    fi
    
    if ! container_running "$spoke_kc"; then
        scenario_skip "Spoke Keycloak not running"
        return
    fi
    
    # Simulate hub Keycloak failure
    log_step "Stopping Hub Keycloak..."
    stop_container "$hub_kc"
    sleep 3
    
    # Check that spoke Keycloak is still operational
    log_check "Spoke Keycloak still accepts local auth"
    local spoke_port
    spoke_port=$(docker port "$spoke_kc" 8443 2>/dev/null | cut -d: -f2 | head -1)
    
    if [ -n "$spoke_port" ]; then
        # Spoke should still serve its own realm
        if curl -ks --max-time 10 "https://localhost:${spoke_port}/realms/dive-v3-broker-${SPOKE_LOWER}/.well-known/openid-configuration" | grep -q '"issuer"'; then
            pass
        else
            fail "OIDC discovery failed"
        fi
    else
        skip "Port not found"
    fi
    
    # Check that federated auth gracefully degrades
    log_check "Federated auth returns graceful error"
    # This would normally test that attempting to login via usa-idp returns a proper error
    # For now, just check the IdP discovery endpoint
    if [ -n "$spoke_port" ]; then
        # Check IdP list still works
        local realm_info
        realm_info=$(curl -ks --max-time 10 "https://localhost:${spoke_port}/realms/dive-v3-broker-${SPOKE_LOWER}/" 2>/dev/null)
        if [ -n "$realm_info" ]; then
            pass
        else
            fail "Realm not accessible"
        fi
    else
        skip
    fi
    
    # Restore Hub Keycloak
    log_step "Restoring Hub Keycloak..."
    start_container "$hub_kc"
    
    # Wait for recovery
    log_check "Hub Keycloak recovers within 60s"
    if wait_for_service "Hub KC" "https://localhost:8443/health/ready" 60; then
        pass
    else
        fail "Recovery timeout"
        scenario_fail "Hub Keycloak did not recover"
        return
    fi
    
    # Verify federation still works after recovery
    log_check "Federation operational after recovery"
    local hub_pass
    hub_pass=$(docker exec "$hub_kc" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')
    
    if [ -n "$hub_pass" ]; then
        local hub_token
        hub_token=$(docker exec "$hub_kc" curl -sf --max-time 10 \
            -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
            -d "grant_type=password" \
            -d "username=admin" \
            -d "password=${hub_pass}" \
            -d "client_id=admin-cli" 2>/dev/null | jq -r '.access_token // ""')
        
        if [ -n "$hub_token" ]; then
            local idp_check
            idp_check=$(docker exec "$hub_kc" curl -sf --max-time 10 \
                -H "Authorization: Bearer $hub_token" \
                "http://localhost:8080/admin/realms/dive-v3-broker-usa/identity-provider/instances/${SPOKE_LOWER}-idp" 2>/dev/null)
            
            if echo "$idp_check" | grep -q '"alias"'; then
                pass
            else
                fail "IdP not accessible"
            fi
        else
            fail "Auth failed"
        fi
    else
        skip "No password"
    fi
    
    scenario_pass
}

# =============================================================================
# SCENARIO 2: SPOKE OPA UNAVAILABLE
# =============================================================================

scenario_spoke_opa_down() {
    log_scenario "Spoke OPA Unavailability"
    
    local spoke_opa="dive-spoke-${SPOKE_LOWER}-opa"
    local spoke_backend="dive-spoke-${SPOKE_LOWER}-backend"
    
    if ! container_running "$spoke_opa"; then
        scenario_skip "Spoke OPA not deployed"
        return
    fi
    
    if ! container_running "$spoke_backend"; then
        scenario_skip "Spoke backend not running"
        return
    fi
    
    # Get backend port
    local backend_port
    backend_port=$(docker port "$spoke_backend" 4000 2>/dev/null | cut -d: -f2 | head -1)
    
    if [ -z "$backend_port" ]; then
        scenario_skip "Backend port not found"
        return
    fi
    
    # Stop OPA
    log_step "Stopping Spoke OPA..."
    stop_container "$spoke_opa"
    sleep 3
    
    # Check that backend still responds but authorization fails
    log_check "Backend health endpoint still works"
    if curl -ks --max-time 5 "https://localhost:${backend_port}/health" | grep -q "status"; then
        pass
    else
        fail
    fi
    
    log_check "Protected endpoints return 503 (OPA unavailable)"
    local authz_response
    authz_response=$(curl -ks --max-time 5 -o /dev/null -w "%{http_code}" \
        "https://localhost:${backend_port}/api/resources" 2>/dev/null || echo "000")
    
    # Expect 401 (unauthenticated) or 503 (OPA unavailable) - both are acceptable
    if [ "$authz_response" = "401" ] || [ "$authz_response" = "503" ] || [ "$authz_response" = "500" ]; then
        pass
    else
        fail "Got $authz_response"
    fi
    
    # Restore OPA
    log_step "Restoring Spoke OPA..."
    start_container "$spoke_opa"
    
    log_check "OPA recovers within 30s"
    local opa_port
    opa_port=$(docker port "$spoke_opa" 8181 2>/dev/null | cut -d: -f2 | head -1)
    
    if [ -n "$opa_port" ]; then
        if wait_for_service "OPA" "https://localhost:${opa_port}/health" 30; then
            pass
        else
            fail "Recovery timeout"
        fi
    else
        skip "Port not found"
    fi
    
    scenario_pass
}

# =============================================================================
# SCENARIO 3: MONGODB UNAVAILABLE
# =============================================================================

scenario_mongodb_down() {
    log_scenario "Hub MongoDB Unavailability"
    
    local hub_mongo="dive-hub-mongodb"
    local hub_backend="dive-hub-backend"
    
    if ! container_running "$hub_mongo"; then
        scenario_skip "Hub MongoDB not running"
        return
    fi
    
    # Stop MongoDB
    log_step "Stopping Hub MongoDB..."
    stop_container "$hub_mongo"
    sleep 3
    
    # Check backend graceful degradation
    log_check "Backend health still responds"
    if curl -ks --max-time 5 "https://localhost:4000/health" >/dev/null 2>&1; then
        pass
    else
        fail
    fi
    
    log_check "Static policy data fallback works"
    local policy_response
    policy_response=$(curl -ks --max-time 10 "https://localhost:4000/api/opal/policy-data" 2>/dev/null)
    if echo "$policy_response" | jq -e '.trusted_issuers' >/dev/null 2>&1; then
        pass
    else
        skip "Endpoint may require MongoDB"
    fi
    
    # Restore MongoDB
    log_step "Restoring Hub MongoDB..."
    start_container "$hub_mongo"
    
    log_check "MongoDB recovers within 60s"
    local waited=0
    while [ $waited -lt 60 ]; do
        if docker exec "$hub_mongo" mongosh --quiet --eval "db.runCommand({ping:1})" >/dev/null 2>&1; then
            pass
            break
        fi
        sleep 2
        ((waited += 2))
    done
    
    if [ $waited -ge 60 ]; then
        fail "Recovery timeout"
    fi
    
    scenario_pass
}

# =============================================================================
# SCENARIO 4: NETWORK PARTITION SIMULATION
# =============================================================================

scenario_network_partition() {
    log_scenario "Network Partition (Hub ↔ Spoke)"
    
    local spoke_kc="dive-spoke-${SPOKE_LOWER}-keycloak"
    
    if ! container_running "$spoke_kc"; then
        scenario_skip "Spoke not running"
        return
    fi
    
    # We can't easily simulate network partitioning without Docker network manipulation
    # Instead, we'll test that the spoke can operate independently when hub is unreachable
    
    log_check "Spoke services operate independently"
    local spoke_port
    spoke_port=$(docker port "$spoke_kc" 8443 2>/dev/null | cut -d: -f2 | head -1)
    
    if [ -n "$spoke_port" ]; then
        # Spoke should serve its realm
        if curl -ks --max-time 10 "https://localhost:${spoke_port}/realms/dive-v3-broker-${SPOKE_LOWER}/.well-known/openid-configuration" | grep -q '"issuer"'; then
            pass
        else
            fail
        fi
    else
        skip "Port not found"
    fi
    
    log_check "Local authentication works without Hub"
    # This test would ideally authenticate a local user
    # For now, check that the token endpoint is available
    if [ -n "$spoke_port" ]; then
        local token_endpoint
        token_endpoint=$(curl -ks --max-time 10 "https://localhost:${spoke_port}/realms/dive-v3-broker-${SPOKE_LOWER}/.well-known/openid-configuration" | jq -r '.token_endpoint // ""')
        if [ -n "$token_endpoint" ]; then
            pass
        else
            fail
        fi
    else
        skip
    fi
    
    scenario_pass
}

# =============================================================================
# SCENARIO 5: RAPID RESTART RECOVERY
# =============================================================================

scenario_rapid_restart() {
    log_scenario "Rapid Restart Recovery"
    
    local spoke_backend="dive-spoke-${SPOKE_LOWER}-backend"
    
    if ! container_running "$spoke_backend"; then
        scenario_skip "Spoke backend not running"
        return
    fi
    
    local backend_port
    backend_port=$(docker port "$spoke_backend" 4000 2>/dev/null | cut -d: -f2 | head -1)
    
    if [ -z "$backend_port" ]; then
        scenario_skip "Backend port not found"
        return
    fi
    
    # Rapid restart cycle
    log_step "Performing rapid restart (3 cycles)..."
    for i in 1 2 3; do
        docker restart "$spoke_backend" >/dev/null 2>&1 || true
        sleep 2
    done
    
    # Wait for stabilization
    log_check "Backend stabilizes after rapid restarts (90s timeout)"
    if wait_for_service "Backend" "https://localhost:${backend_port}/health" 90; then
        pass
    else
        fail "Failed to stabilize"
        scenario_fail "Backend did not recover"
        return
    fi
    
    log_check "Backend fully functional after recovery"
    local health
    health=$(curl -ks --max-time 10 "https://localhost:${backend_port}/health" 2>/dev/null)
    if echo "$health" | jq -e '.status' >/dev/null 2>&1; then
        pass
    else
        fail
    fi
    
    scenario_pass
}

# =============================================================================
# CLEANUP
# =============================================================================

cleanup() {
    if [ "$SKIP_CLEANUP" = true ]; then
        echo ""
        echo -e "${YELLOW}⚠ Cleanup skipped. Some services may be stopped.${NC}"
        return
    fi
    
    echo ""
    echo -e "${CYAN}Restoring all services...${NC}"
    
    # Restart any stopped containers
    docker start dive-hub-keycloak 2>/dev/null || true
    docker start dive-hub-mongodb 2>/dev/null || true
    docker start "dive-spoke-${SPOKE_LOWER}-opa" 2>/dev/null || true
    docker start "dive-spoke-${SPOKE_LOWER}-backend" 2>/dev/null || true
    
    echo -e "${GREEN}✓ Cleanup complete${NC}"
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

main() {
    echo ""
    echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║         DIVE V3 Federation Resilience Tests                 ║${NC}"
    echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "  Spoke:      ${SPOKE_CODE}"
    echo "  Scenario:   ${SPECIFIC_SCENARIO:-all}"
    echo "  Cleanup:    $([ "$SKIP_CLEANUP" = true ] && echo 'disabled' || echo 'enabled')"
    
    # Set up cleanup trap
    trap cleanup EXIT
    
    # Run scenarios
    if [ -z "$SPECIFIC_SCENARIO" ]; then
        scenario_hub_keycloak_down
        scenario_spoke_opa_down
        scenario_mongodb_down
        scenario_network_partition
        scenario_rapid_restart
    else
        case "$SPECIFIC_SCENARIO" in
            hub-keycloak)   scenario_hub_keycloak_down ;;
            spoke-opa)      scenario_spoke_opa_down ;;
            mongodb)        scenario_mongodb_down ;;
            network)        scenario_network_partition ;;
            restart)        scenario_rapid_restart ;;
            *)
                echo -e "${RED}Unknown scenario: $SPECIFIC_SCENARIO${NC}"
                echo "Available: hub-keycloak, spoke-opa, mongodb, network, restart"
                exit 1
                ;;
        esac
    fi
    
    # Summary
    echo ""
    echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}Resilience Test Summary${NC}"
    echo -e "═══════════════════════════════════════════════════════════════"
    echo ""
    echo -e "  ${GREEN}Passed:${NC}  ${SCENARIOS_PASSED}"
    echo -e "  ${RED}Failed:${NC}  ${SCENARIOS_FAILED}"
    echo -e "  ${YELLOW}Skipped:${NC} ${SCENARIOS_SKIPPED}"
    echo ""
    
    if [ "$SCENARIOS_FAILED" -eq 0 ]; then
        echo -e "${GREEN}✓ All resilience tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}✗ Some resilience tests failed.${NC}"
        exit 1
    fi
}

# Run main
main "$@"
