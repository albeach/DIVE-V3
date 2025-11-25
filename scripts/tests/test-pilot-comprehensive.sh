#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Comprehensive Pilot Test Suite
# =============================================================================
# Tests all instances for:
# - Service health
# - Keycloak realms and users
# - Backend API endpoints
# - IdP federation
# - Authentication flows
# =============================================================================

set -uo pipefail
# Note: Not using set -e to allow tests to continue after failures

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# =============================================================================
# TEST UTILITIES
# =============================================================================

log_test() { echo -e "${BLUE}[TEST]${NC} $1"; }
log_pass() { echo -e "${GREEN}[PASS]${NC} $1"; ((TESTS_PASSED++)); }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; ((TESTS_FAILED++)); }
log_skip() { echo -e "${YELLOW}[SKIP]${NC} $1"; ((TESTS_SKIPPED++)); }
log_section() { echo -e "\n${CYAN}═══════════════════════════════════════════════════════════════${NC}"; echo -e "${CYAN}  $1${NC}"; echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}\n"; }

assert_eq() {
    local expected="$1"
    local actual="$2"
    local msg="$3"
    if [[ "$expected" == "$actual" ]]; then
        log_pass "$msg"
        return 0
    else
        log_fail "$msg (expected: $expected, got: $actual)"
        return 1
    fi
}

assert_contains() {
    local haystack="$1"
    local needle="$2"
    local msg="$3"
    if [[ "$haystack" == *"$needle"* ]]; then
        log_pass "$msg"
        return 0
    else
        log_fail "$msg (expected to contain: $needle)"
        return 1
    fi
}

http_status() {
    local result
    result=$(curl -sk "$1" -o /dev/null -w "%{http_code}" --max-time 5 2>/dev/null)
    [[ -z "$result" ]] && result="000"
    echo "$result"
}

# =============================================================================
# INSTANCE CONFIGURATION
# =============================================================================

# Using indexed arrays for reliable iteration order
INSTANCE_NAMES=("USA" "FRA" "DEU")
INSTANCE_CONFIGS=("3000|4000|8443|usa" "3001|4001|8444|fra" "3002|4002|8445|deu")

# =============================================================================
# PHASE 1: SERVICE HEALTH TESTS
# =============================================================================

test_service_health() {
    log_section "PHASE 1: SERVICE HEALTH TESTS"
    
    for i in "${!INSTANCE_NAMES[@]}"; do
        name="${INSTANCE_NAMES[$i]}"
        IFS='|' read -r fp bp kp code <<< "${INSTANCE_CONFIGS[$i]}"
        
        echo -e "${YELLOW}━━━ Testing $name Instance ━━━${NC}"
        
        # Frontend
        log_test "$name Frontend (localhost:$fp)"
        status=$(http_status "https://localhost:$fp")
        assert_eq "200" "$status" "$name Frontend returns 200" || true
        
        # Backend health
        log_test "$name Backend Health (localhost:$bp/health)"
        status=$(http_status "https://localhost:$bp/health")
        assert_eq "200" "$status" "$name Backend returns 200" || true
        
        # Keycloak realm
        log_test "$name Keycloak Realm (localhost:$kp/realms/dive-v3-broker)"
        status=$(http_status "https://localhost:$kp/realms/dive-v3-broker")
        assert_eq "200" "$status" "$name Keycloak realm exists" || true
        
        echo ""
    done
}

# =============================================================================
# PHASE 2: KEYCLOAK CONFIGURATION TESTS
# =============================================================================

get_admin_token() {
    local port="$1"
    curl -sk -X POST "https://localhost:$port/realms/master/protocol/openid-connect/token" \
        -d "client_id=admin-cli" -d "username=admin" -d "password=admin" -d "grant_type=password" \
        --max-time 5 2>/dev/null | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4
}

test_keycloak_config() {
    log_section "PHASE 2: KEYCLOAK CONFIGURATION TESTS"
    
    for i in "${!INSTANCE_NAMES[@]}"; do
        name="${INSTANCE_NAMES[$i]}"
        IFS='|' read -r fp bp kp code <<< "${INSTANCE_CONFIGS[$i]}"
        
        echo -e "${YELLOW}━━━ Testing $name Keycloak ━━━${NC}"
        
        # Get admin token
        log_test "$name Admin Authentication"
        token=$(get_admin_token "$kp")
        if [[ -n "$token" ]]; then
            log_pass "$name Admin token obtained"
        else
            log_fail "$name Admin token failed"
            continue
        fi
        
        # Check users exist
        log_test "$name Test Users"
        users=$(curl -sk "https://localhost:$kp/admin/realms/dive-v3-broker/users" \
            -H "Authorization: Bearer $token" --max-time 5 2>/dev/null)
        
        user_count=$(echo "$users" | grep -o '"username"' | wc -l | tr -d ' ')
        if [[ "$user_count" -gt 0 ]]; then
            log_pass "$name has $user_count users"
        else
            log_fail "$name has no users"
        fi
        
        # Check for testuser-{code}-1
        if echo "$users" | grep -q "testuser-${code,,}-1"; then
            log_pass "$name has testuser-${code,,}-1"
        else
            log_fail "$name missing testuser-${code,,}-1"
        fi
        
        # Check client exists
        log_test "$name Client Configuration"
        clients=$(curl -sk "https://localhost:$kp/admin/realms/dive-v3-broker/clients" \
            -H "Authorization: Bearer $token" --max-time 5 2>/dev/null)
        
        if echo "$clients" | grep -q "dive-v3-client-broker"; then
            log_pass "$name has dive-v3-client-broker client"
        else
            log_fail "$name missing dive-v3-client-broker client"
        fi
        
        echo ""
    done
}

# =============================================================================
# PHASE 3: BACKEND API TESTS
# =============================================================================

test_backend_api() {
    log_section "PHASE 3: BACKEND API TESTS"
    
    for i in "${!INSTANCE_NAMES[@]}"; do
        name="${INSTANCE_NAMES[$i]}"
        IFS='|' read -r fp bp kp code <<< "${INSTANCE_CONFIGS[$i]}"
        
        echo -e "${YELLOW}━━━ Testing $name Backend API ━━━${NC}"
        
        # IdP list endpoint
        log_test "$name IdP List Endpoint"
        response=$(curl -sk "https://localhost:$bp/api/idps/public" --max-time 5 2>/dev/null)
        
        if echo "$response" | grep -q '"success":true'; then
            log_pass "$name IdP endpoint returns success"
            
            # Count IdPs
            idp_count=$(echo "$response" | grep -o '"total":[0-9]*' | cut -d: -f2)
            if [[ -n "$idp_count" && "$idp_count" -gt 0 ]]; then
                log_pass "$name has $idp_count IdPs configured"
            else
                log_fail "$name has no IdPs"
            fi
        else
            log_fail "$name IdP endpoint failed"
            echo "  Response: $(echo "$response" | head -c 200)"
        fi
        
        # Health endpoint details
        log_test "$name Health Endpoint Details"
        health=$(curl -sk "https://localhost:$bp/health" --max-time 5 2>/dev/null)
        
        if echo "$health" | grep -q '"status"'; then
            log_pass "$name Health endpoint returns status"
        else
            log_skip "$name Health endpoint format unknown"
        fi
        
        echo ""
    done
}

# =============================================================================
# PHASE 4: FEDERATION TESTS
# =============================================================================

test_federation() {
    log_section "PHASE 4: FEDERATION TESTS"
    
    for i in "${!INSTANCE_NAMES[@]}"; do
        name="${INSTANCE_NAMES[$i]}"
        IFS='|' read -r fp bp kp code <<< "${INSTANCE_CONFIGS[$i]}"
        
        echo -e "${YELLOW}━━━ Testing $name Federation ━━━${NC}"
        
        # Check IdP brokers
        token=$(get_admin_token "$kp")
        if [[ -z "$token" ]]; then
            log_skip "$name Federation tests (no admin token)"
            continue
        fi
        
        idps=$(curl -sk "https://localhost:$kp/admin/realms/dive-v3-broker/identity-provider/instances" \
            -H "Authorization: Bearer $token" --max-time 5 2>/dev/null)
        
        # USA should have federation to FRA and DEU
        if [[ "$name" == "USA" ]]; then
            if echo "$idps" | grep -q "fra-federation"; then
                log_pass "$name has FRA federation IdP"
            else
                log_skip "$name missing FRA federation (may not be configured)"
            fi
            
            if echo "$idps" | grep -q "deu-federation"; then
                log_pass "$name has DEU federation IdP"
            else
                log_skip "$name missing DEU federation (may not be configured)"
            fi
        fi
        
        # FRA should have federation to USA and DEU
        if [[ "$name" == "FRA" ]]; then
            if echo "$idps" | grep -q "usa-federation"; then
                log_pass "$name has USA federation IdP"
            else
                log_fail "$name missing USA federation"
            fi
            
            if echo "$idps" | grep -q "deu-federation"; then
                log_pass "$name has DEU federation IdP"
            else
                log_skip "$name missing DEU federation (may not be configured)"
            fi
        fi
        
        # DEU should have federation to USA and FRA
        if [[ "$name" == "DEU" ]]; then
            if echo "$idps" | grep -q "usa-federation"; then
                log_pass "$name has USA federation IdP"
            else
                log_fail "$name missing USA federation"
            fi
            
            if echo "$idps" | grep -q "fra-federation"; then
                log_pass "$name has FRA federation IdP"
            else
                log_skip "$name missing FRA federation (may not be configured)"
            fi
        fi
        
        echo ""
    done
}

# =============================================================================
# PHASE 5: AUTHENTICATION FLOW TESTS
# =============================================================================

test_auth_flows() {
    log_section "PHASE 5: AUTHENTICATION FLOW TESTS"
    
    for i in "${!INSTANCE_NAMES[@]}"; do
        name="${INSTANCE_NAMES[$i]}"
        IFS='|' read -r fp bp kp code <<< "${INSTANCE_CONFIGS[$i]}"
        
        echo -e "${YELLOW}━━━ Testing $name Auth Flows ━━━${NC}"
        
        # Get admin token first to retrieve client secret
        admin_token=$(get_admin_token "$kp")
        if [[ -z "$admin_token" ]]; then
            log_skip "$name Auth test (no admin token)"
            continue
        fi
        
        # Get client secret
        client_info=$(curl -sk "https://localhost:$kp/admin/realms/dive-v3-broker/clients?clientId=dive-v3-client-broker" \
            -H "Authorization: Bearer $admin_token" --max-time 5 2>/dev/null)
        client_uuid=$(echo "$client_info" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
        
        if [[ -n "$client_uuid" ]]; then
            client_secret_response=$(curl -sk "https://localhost:$kp/admin/realms/dive-v3-broker/clients/$client_uuid/client-secret" \
                -H "Authorization: Bearer $admin_token" --max-time 5 2>/dev/null)
            client_secret=$(echo "$client_secret_response" | grep -o '"value":"[^"]*"' | cut -d'"' -f4)
        fi
        
        # Test user authentication with client secret
        log_test "$name User Authentication (testuser-${code,,}-1)"
        
        if [[ -n "$client_secret" ]]; then
            token_response=$(curl -sk -X POST "https://localhost:$kp/realms/dive-v3-broker/protocol/openid-connect/token" \
                -d "client_id=dive-v3-client-broker" \
                -d "client_secret=$client_secret" \
                -d "username=testuser-${code,,}-1" \
                -d "password=DiveDemo2025!" \
                -d "grant_type=password" \
                --max-time 5 2>/dev/null)
        else
            token_response=$(curl -sk -X POST "https://localhost:$kp/realms/dive-v3-broker/protocol/openid-connect/token" \
                -d "client_id=dive-v3-client-broker" \
                -d "username=testuser-${code,,}-1" \
                -d "password=DiveDemo2025!" \
                -d "grant_type=password" \
                --max-time 5 2>/dev/null)
        fi
        
        if echo "$token_response" | grep -q '"access_token"'; then
            log_pass "$name testuser-${code,,}-1 can authenticate"
            
            # Verify token claims
            access_token=$(echo "$token_response" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
            if [[ -n "$access_token" ]]; then
                # Decode JWT payload (base64)
                payload=$(echo "$access_token" | cut -d'.' -f2 | base64 -d 2>/dev/null || echo "")
                
                if echo "$payload" | grep -q "clearance"; then
                    log_pass "$name Token contains clearance claim"
                else
                    log_skip "$name Token clearance claim not found (may need protocol mapper)"
                fi
            fi
        else
            error=$(echo "$token_response" | grep -o '"error_description":"[^"]*"' | cut -d'"' -f4)
            if [[ -z "$error" ]]; then
                error=$(echo "$token_response" | grep -o '"error":"[^"]*"' | cut -d'"' -f4)
            fi
            log_fail "$name testuser-${code,,}-1 authentication failed: $error"
        fi
        
        echo ""
    done
}

# =============================================================================
# PHASE 6: EXTERNAL ACCESS TESTS
# =============================================================================

test_external_access() {
    log_section "PHASE 6: EXTERNAL ACCESS TESTS (Cloudflare)"
    
    # Quick check if any tunnel is working
    local tunnel_check=$(curl -sk "https://usa-app.dive25.com" -o /dev/null -w "%{http_code}" --max-time 3 2>/dev/null)
    
    if [[ "$tunnel_check" != "200" ]]; then
        log_skip "External access tests (Cloudflare tunnels may not be running)"
        return 0
    fi
    
    for i in "${!INSTANCE_NAMES[@]}"; do
        name="${INSTANCE_NAMES[$i]}"
        IFS='|' read -r fp bp kp code <<< "${INSTANCE_CONFIGS[$i]}"
        
        echo -e "${YELLOW}━━━ Testing $name External URLs ━━━${NC}"
        
        # Test app URL (3 second timeout)
        log_test "$name Frontend (https://${code}-app.dive25.com)"
        status=$(curl -sk "https://${code}-app.dive25.com" -o /dev/null -w "%{http_code}" --max-time 3 2>/dev/null)
        [[ -z "$status" ]] && status="timeout"
        if [[ "$status" == "200" ]]; then
            log_pass "$name External frontend accessible"
        else
            log_skip "$name External frontend (status: $status)"
        fi
        
        # Test API URL (3 second timeout)
        log_test "$name Backend (https://${code}-api.dive25.com/health)"
        status=$(curl -sk "https://${code}-api.dive25.com/health" -o /dev/null -w "%{http_code}" --max-time 3 2>/dev/null)
        [[ -z "$status" ]] && status="timeout"
        if [[ "$status" == "200" ]]; then
            log_pass "$name External backend accessible"
        else
            log_skip "$name External backend (status: $status)"
        fi
        
        echo ""
    done
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║         DIVE V3 - Comprehensive Pilot Test Suite              ║${NC}"
    echo -e "${CYAN}║                     $(date '+%Y-%m-%d %H:%M:%S')                      ║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    
    # Run all test phases
    test_service_health
    test_keycloak_config
    test_backend_api
    test_federation
    test_auth_flows
    test_external_access
    
    # Summary
    log_section "TEST SUMMARY"
    
    local total=$((TESTS_PASSED + TESTS_FAILED + TESTS_SKIPPED))
    
    echo -e "  ${GREEN}Passed:${NC}  $TESTS_PASSED"
    echo -e "  ${RED}Failed:${NC}  $TESTS_FAILED"
    echo -e "  ${YELLOW}Skipped:${NC} $TESTS_SKIPPED"
    echo -e "  ─────────────"
    echo -e "  Total:   $total"
    echo ""
    
    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "${GREEN}✓ All critical tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}✗ Some tests failed. Review output above.${NC}"
        exit 1
    fi
}

main "$@"

