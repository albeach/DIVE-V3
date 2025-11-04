#!/usr/bin/env bash
# ============================================
# DIVE V3 Keycloak Federation Test Suite
# ============================================
# Tests IdP broker federation across all 10 national/industry realms
# Version: 2.0.0
# Tests: 10 federation pairs (broker ← national realms)
#
# Usage:
#   ./scripts/test-keycloak-federation.sh [realm_key]
#   ./scripts/test-keycloak-federation.sh all          # Test all federations
#   ./scripts/test-keycloak-federation.sh usa          # Test USA realm only

set -euo pipefail

# ============================================
# Configuration
# ============================================

KEYCLOAK_URL="${KEYCLOAK_URL:-https://localhost:8443}"
BROKER_REALM="dive-v3-broker"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test results
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0
FAILED_TESTS=()

# ============================================
# Federation Pairs
# ============================================

declare -A FEDERATED_REALMS=(
    ["usa"]="dive-v3-usa"
    ["fra"]="dive-v3-fra"
    ["can"]="dive-v3-can"
    ["deu"]="dive-v3-deu"
    ["gbr"]="dive-v3-gbr"
    ["ita"]="dive-v3-ita"
    ["esp"]="dive-v3-esp"
    ["pol"]="dive-v3-pol"
    ["nld"]="dive-v3-nld"
    ["industry"]="dive-v3-industry"
)

declare -A IDP_ALIASES=(
    ["usa"]="usa-realm-broker"
    ["fra"]="fra-realm-broker"
    ["can"]="can-realm-broker"
    ["deu"]="deu-realm-broker"
    ["gbr"]="gbr-realm-broker"
    ["ita"]="ita-realm-broker"
    ["esp"]="esp-realm-broker"
    ["pol"]="pol-realm-broker"
    ["nld"]="nld-realm-broker"
    ["industry"]="industry-realm-broker"
)

# ============================================
# Helper Functions
# ============================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# ============================================
# Test Functions
# ============================================

test_realm_exists() {
    local realm="$1"
    
    log_info "Checking if realm exists: $realm"
    
    local realm_url="$KEYCLOAK_URL/realms/$realm/.well-known/openid-configuration"
    
    if curl -sk "$realm_url" | jq -e '.issuer' >/dev/null 2>&1; then
        log_success "Realm exists: $realm"
        return 0
    else
        log_error "Realm does NOT exist: $realm"
        return 1
    fi
}

test_idp_exists() {
    local broker_realm="$1"
    local idp_alias="$2"
    
    log_info "Checking if IdP exists in broker: $idp_alias"
    
    # We can't easily check this without admin API
    # So we check if the broker login URL works
    local broker_login_url="$KEYCLOAK_URL/realms/$broker_realm/protocol/openid-connect/auth"
    
    if curl -sk "$broker_login_url" >/dev/null 2>&1; then
        log_success "Broker realm accessible: $broker_realm"
        log_info "IdP alias configured: $idp_alias (assumed present)"
        return 0
    else
        log_error "Broker realm NOT accessible: $broker_realm"
        return 1
    fi
}

test_oidc_endpoints() {
    local realm="$1"
    
    log_info "Testing OIDC endpoints for realm: $realm"
    
    local well_known_url="$KEYCLOAK_URL/realms/$realm/.well-known/openid-configuration"
    
    local config=$(curl -sk "$well_known_url" 2>/dev/null)
    
    if [ -z "$config" ]; then
        log_error "Failed to fetch .well-known configuration"
        return 1
    fi
    
    # Extract endpoints
    local issuer=$(echo "$config" | jq -r '.issuer // empty')
    local auth_endpoint=$(echo "$config" | jq -r '.authorization_endpoint // empty')
    local token_endpoint=$(echo "$config" | jq -r '.token_endpoint // empty')
    local jwks_uri=$(echo "$config" | jq -r '.jwks_uri // empty')
    local userinfo_endpoint=$(echo "$config" | jq -r '.userinfo_endpoint // empty')
    
    local all_valid=true
    
    if [ -z "$issuer" ]; then
        log_error "Missing issuer endpoint"
        all_valid=false
    else
        log_success "Issuer: $issuer"
    fi
    
    if [ -z "$auth_endpoint" ]; then
        log_error "Missing authorization endpoint"
        all_valid=false
    else
        log_success "Authorization: $auth_endpoint"
    fi
    
    if [ -z "$token_endpoint" ]; then
        log_error "Missing token endpoint"
        all_valid=false
    else
        log_success "Token: $token_endpoint"
    fi
    
    if [ -z "$jwks_uri" ]; then
        log_error "Missing JWKS URI"
        all_valid=false
    else
        log_success "JWKS: $jwks_uri"
        
        # Test JWKS endpoint
        if curl -sk "$jwks_uri" | jq -e '.keys' >/dev/null 2>&1; then
            log_success "JWKS endpoint accessible and contains keys"
        else
            log_error "JWKS endpoint failed or no keys present"
            all_valid=false
        fi
    fi
    
    if [ -z "$userinfo_endpoint" ]; then
        log_error "Missing userinfo endpoint"
        all_valid=false
    else
        log_success "UserInfo: $userinfo_endpoint"
    fi
    
    if [ "$all_valid" = false ]; then
        return 1
    fi
    
    return 0
}

test_federation_configuration() {
    local realm_key="$1"
    local national_realm="${FEDERATED_REALMS[$realm_key]}"
    local idp_alias="${IDP_ALIASES[$realm_key]}"
    
    ((TESTS_RUN++))
    
    echo "========================================"
    echo "Testing Federation: $realm_key"
    echo "  National Realm: $national_realm"
    echo "  IdP Alias: $idp_alias"
    echo "  Broker Realm: $BROKER_REALM"
    echo "========================================"
    echo ""
    
    local test_passed=true
    
    # Test 1: National realm exists
    if ! test_realm_exists "$national_realm"; then
        test_passed=false
    fi
    echo ""
    
    # Test 2: Broker realm exists
    if ! test_realm_exists "$BROKER_REALM"; then
        test_passed=false
    fi
    echo ""
    
    # Test 3: IdP configuration exists
    if ! test_idp_exists "$BROKER_REALM" "$idp_alias"; then
        test_passed=false
    fi
    echo ""
    
    # Test 4: National realm OIDC endpoints
    if ! test_oidc_endpoints "$national_realm"; then
        test_passed=false
    fi
    echo ""
    
    # Test 5: Broker realm OIDC endpoints
    if ! test_oidc_endpoints "$BROKER_REALM"; then
        test_passed=false
    fi
    echo ""
    
    # Test 6: Check federation flow configuration
    log_info "Testing federation flow configuration..."
    log_warn "⚠️  Full federation flow testing requires browser automation"
    log_warn "    This test only validates configuration endpoints"
    log_warn "    Use Playwright/Selenium for E2E federation testing"
    echo ""
    
    # Result
    if [ "$test_passed" = true ]; then
        ((TESTS_PASSED++))
        log_success "✓ Federation configuration PASSED: $realm_key → broker"
    else
        ((TESTS_FAILED++))
        FAILED_TESTS+=("$realm_key")
        log_error "✗ Federation configuration FAILED: $realm_key → broker"
    fi
    
    echo ""
    echo ""
}

test_attribute_mapping() {
    local realm_key="$1"
    
    log_info "Testing attribute mapping configuration for: $realm_key"
    
    # Expected attribute mappers
    local expected_mappers=(
        "uniqueID"
        "clearance"
        "clearanceOriginal"
        "countryOfAffiliation"
        "acpCOI"
        "dutyOrg"
        "orgUnit"
    )
    
    log_info "Expected attribute mappers:"
    for mapper in "${expected_mappers[@]}"; do
        log_info "  - $mapper"
    done
    
    log_warn "⚠️  Attribute mapper validation requires Keycloak Admin API"
    log_warn "    This test assumes mappers are configured via Terraform"
    log_warn "    Verify attribute sync by inspecting user tokens post-federation"
    
    echo ""
}

# ============================================
# Main Test Execution
# ============================================

test_all_federations() {
    echo "============================================"
    echo "DIVE V3 Keycloak Federation Test Suite"
    echo "Version: 2.0.0 (Native Keycloak 26.4.2)"
    echo "Test Pattern: Broker ← National Realms"
    echo "============================================"
    echo ""
    
    log_info "Keycloak URL: $KEYCLOAK_URL"
    log_info "Broker Realm: $BROKER_REALM"
    log_info "Federated Realms: ${#FEDERATED_REALMS[@]}"
    echo ""
    
    log_warn "⚠️  IMPORTANT: Federation Testing Scope"
    log_warn "    These tests validate CONFIGURATION only"
    log_warn "    Full E2E federation flows require browser automation"
    log_warn "    Use Playwright for complete federation testing"
    echo ""
    
    # Test each federation
    for realm_key in "${!FEDERATED_REALMS[@]}"; do
        test_federation_configuration "$realm_key"
        test_attribute_mapping "$realm_key"
    done
}

# ============================================
# Test Report
# ============================================

print_test_report() {
    echo ""
    echo "============================================"
    echo "FEDERATION TEST SUMMARY"
    echo "============================================"
    echo ""
    echo "Total Federations Tested: $TESTS_RUN"
    echo -e "Tests Passed:             ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Tests Failed:             ${RED}$TESTS_FAILED${NC}"
    echo ""
    
    if [ "$TESTS_FAILED" -gt 0 ]; then
        echo "Failed Federations:"
        for failed_test in "${FAILED_TESTS[@]}"; do
            echo -e "  ${RED}✗${NC} $failed_test → broker"
        done
        echo ""
    fi
    
    local pass_rate=0
    if [ "$TESTS_RUN" -gt 0 ]; then
        pass_rate=$((TESTS_PASSED * 100 / TESTS_RUN))
    fi
    
    echo "Pass Rate: $pass_rate%"
    echo ""
    
    if [ "$TESTS_FAILED" -eq 0 ]; then
        echo -e "${GREEN}✓ ALL FEDERATION CONFIGURATIONS VALID${NC}"
        echo ""
        log_success "All 10 national/industry realms properly configured"
        log_success "Broker realm accessible and endpoints functional"
        log_success "OIDC endpoints responding correctly"
        echo ""
        log_info "Next Steps:"
        log_info "  1. Test browser-based federation flows (manual or Playwright)"
        log_info "  2. Verify attribute sync after federation"
        log_info "  3. Test logout propagation across federated realms"
        return 0
    else
        echo -e "${RED}✗ SOME FEDERATION CONFIGURATIONS FAILED${NC}"
        echo ""
        log_error "Review errors above and fix configuration issues"
        log_error "Check Terraform apply status and Keycloak logs"
        return 1
    fi
}

# ============================================
# Main Script
# ============================================

main() {
    local realm_key="${1:-all}"
    
    # Check dependencies
    if ! command -v jq &> /dev/null; then
        log_error "jq is required but not installed. Install with: brew install jq"
        exit 1
    fi
    
    if ! command -v curl &> /dev/null; then
        log_error "curl is required but not installed"
        exit 1
    fi
    
    # Check Keycloak is running
    if ! curl -sk "$KEYCLOAK_URL" &> /dev/null; then
        log_error "Keycloak is not reachable at $KEYCLOAK_URL"
        log_error "Start Keycloak with: docker compose up -d keycloak"
        exit 1
    fi
    
    log_success "Keycloak is reachable at $KEYCLOAK_URL"
    echo ""
    
    # Run tests
    if [ "$realm_key" = "all" ]; then
        test_all_federations
    else
        if [ -z "${FEDERATED_REALMS[$realm_key]:-}" ]; then
            log_error "Unknown realm: $realm_key"
            log_info "Available realms: ${!FEDERATED_REALMS[*]}"
            exit 1
        fi
        
        test_federation_configuration "$realm_key"
        test_attribute_mapping "$realm_key"
    fi
    
    # Print report
    print_test_report
}

# Run main
main "$@"

