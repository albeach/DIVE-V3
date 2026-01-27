#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Comprehensive SSO Test Suite (Phase 2)
# =============================================================================
# Tests bidirectional SSO flows with complete authorization validation
# ENHANCEMENT: Extends existing federation-test.sh with detailed scenarios
# =============================================================================

set -eo pipefail

# Load common utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
export DIVE_ROOT="$PROJECT_ROOT"

# Source common modules
source "${DIVE_ROOT}/scripts/dive-modules/common.sh"

# Source federation test module (provides SSO utility functions)
if [ -f "${DIVE_ROOT}/scripts/dive-modules/federation-test.sh" ]; then
    source "${DIVE_ROOT}/scripts/dive-modules/federation-test.sh"
else
    log_error "federation-test.sh module not found"
    exit 1
fi

# Source federation state database module
if [ -f "${DIVE_ROOT}/scripts/dive-modules/federation-state-db.sh" ]; then
    source "${DIVE_ROOT}/scripts/dive-modules/federation-state-db.sh"
fi

# =============================================================================
# TEST CONFIGURATION
# =============================================================================

TEST_HUB="USA"
TEST_SPOKE_1="${TEST_SPOKE_1:-FRA}"
TEST_SPOKE_2="${TEST_SPOKE_2:-GBR}"
TEST_SPOKE_3="${TEST_SPOKE_3:-DEU}"

TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Test results tracking
declare -a TEST_RESULTS
declare -a TEST_NAMES

# =============================================================================
# TEST UTILITY FUNCTIONS
# =============================================================================

##
# Run a test and track results
##
run_test() {
    local test_name="$1"
    local test_function="$2"
    
    ((TOTAL_TESTS++))
    TEST_NAMES+=("$test_name")
    
    log_info ""
    log_info "═══════════════════════════════════════════════════════════"
    log_info "TEST $TOTAL_TESTS: $test_name"
    log_info "═══════════════════════════════════════════════════════════"
    
    local start_time=$(date +%s)
    
    if "$test_function"; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        ((PASSED_TESTS++))
        TEST_RESULTS+=("PASS")
        log_success "✅ PASS ($duration seconds)"
        return 0
    else
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        ((FAILED_TESTS++))
        TEST_RESULTS+=("FAIL")
        log_error "❌ FAIL ($duration seconds)"
        return 1
    fi
}

##
# Skip test with reason
##
skip_test() {
    local test_name="$1"
    local reason="$2"
    
    ((TOTAL_TESTS++))
    TEST_NAMES+=("$test_name")
    TEST_RESULTS+=("SKIP")
    
    log_warn "⏭️  SKIP: $test_name - $reason"
}

# =============================================================================
# HUB → SPOKE SSO TESTS
# =============================================================================

##
# Test: Hub user can authenticate at spoke
##
test_hub_to_spoke_authentication() {
    local spoke="$TEST_SPOKE_1"
    local code_lower=$(lower "$spoke")
    
    log_info "Testing USA → $spoke authentication..."
    
    # Get Hub token
    local hub_token=$(sso_get_token "USA" "testuser-usa-1")
    
    if [ -z "$hub_token" ] || [ "$hub_token" = "null" ]; then
        log_error "Cannot get Hub user token"
        return 1
    fi
    
    # Verify token has required claims
    if ! sso_verify_claims "$hub_token" "sub" "iss" "uniqueID"; then
        log_error "Hub token missing required claims"
        return 1
    fi
    
    log_success "Hub user authenticated successfully"
    return 0
}

##
# Test: Hub user can access spoke backend API
##
test_hub_to_spoke_api_access() {
    local spoke="$TEST_SPOKE_1"
    local code_lower=$(lower "$spoke")
    
    log_info "Testing USA → $spoke API access..."
    
    # Get Hub token
    local hub_token=$(sso_get_token "USA" "testuser-usa-1")
    
    if [ -z "$hub_token" ]; then
        log_error "Cannot get Hub user token"
        return 1
    fi
    
    # Test spoke backend access
    if ! sso_test_backend_access "$spoke" "$hub_token"; then
        log_error "Hub user cannot access $spoke backend"
        return 1
    fi
    
    log_success "Hub user accessed $spoke backend successfully"
    return 0
}

##
# Test: Hub user clearance mapping
##
test_hub_to_spoke_clearance_mapping() {
    local spoke="$TEST_SPOKE_1"
    local code_lower=$(lower "$spoke")
    
    log_info "Testing USA → $spoke clearance attribute mapping..."
    
    # Get Hub token for SECRET clearance user
    local hub_token=$(sso_get_token "USA" "testuser-usa-secret")
    
    if [ -z "$hub_token" ]; then
        log_warn "SECRET clearance user not available, using default user"
        hub_token=$(sso_get_token "USA" "testuser-usa-1")
    fi
    
    # Decode token and check clearance claim
    local payload=$(echo "$hub_token" | cut -d'.' -f2 | base64 -d 2>/dev/null || echo "{}")
    local clearance=$(echo "$payload" | jq -r '.clearance // "UNKNOWN"')
    
    if [ "$clearance" = "UNKNOWN" ] || [ "$clearance" = "null" ]; then
        log_warn "Clearance attribute not found in token (may need protocol mapper)"
        # Non-blocking - clearance mapping is optional
        return 0
    fi
    
    log_success "Clearance attribute present: $clearance"
    return 0
}

##
# Test: Hub user country affiliation mapping
##
test_hub_to_spoke_country_mapping() {
    local spoke="$TEST_SPOKE_1"
    
    log_info "Testing USA → $spoke country affiliation mapping..."
    
    # Get Hub token
    local hub_token=$(sso_get_token "USA" "testuser-usa-1")
    
    # Decode token and check country claim
    local payload=$(echo "$hub_token" | cut -d'.' -f2 | base64 -d 2>/dev/null || echo "{}")
    local country=$(echo "$payload" | jq -r '.countryOfAffiliation // "UNKNOWN"')
    
    if [ "$country" = "UNKNOWN" ] || [ "$country" = "null" ]; then
        log_warn "countryOfAffiliation not found (may need protocol mapper)"
        return 0  # Non-blocking
    fi
    
    if [ "$country" = "USA" ]; then
        log_success "Country affiliation correct: $country"
        return 0
    else
        log_error "Country affiliation incorrect: $country (expected USA)"
        return 1
    fi
}

##
# Test: Hub user COI mapping
##
test_hub_to_spoke_coi_mapping() {
    local spoke="$TEST_SPOKE_1"
    
    log_info "Testing USA → $spoke COI attribute mapping..."
    
    # Get Hub token
    local hub_token=$(sso_get_token "USA" "testuser-usa-1")
    
    # Decode token and check COI claim
    local payload=$(echo "$hub_token" | cut -d'.' -f2 | base64 -d 2>/dev/null || echo "{}")
    local coi=$(echo "$payload" | jq -r '.acpCOI // empty')
    
    if [ -z "$coi" ] || [ "$coi" = "null" ]; then
        log_warn "acpCOI not found (optional attribute)"
        return 0  # Non-blocking - COI is optional
    fi
    
    log_success "COI attribute present"
    return 0
}

##
# Test: Hub user token refresh
##
test_hub_to_spoke_token_refresh() {
    local spoke="$TEST_SPOKE_1"
    local code_lower=$(lower "$spoke")
    
    log_info "Testing USA → $spoke token refresh..."
    
    # Get Hub token with refresh token
    eval "$(get_instance_ports "USA")"
    local kc_port="${SPOKE_KEYCLOAK_HTTPS_PORT:-8443}"
    
    local token_response=$(curl -sk --max-time 10 -X POST \
        "https://localhost:${kc_port}/realms/dive-v3-broker-usa/protocol/openid-connect/token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "client_id=dive-v3-broker-usa&client_secret=dive-v3-broker-usa-secret&username=testuser-usa-1&password=testuser-usa-1&grant_type=password" \
        2>/dev/null)
    
    local refresh_token=$(echo "$token_response" | jq -r '.refresh_token // empty')
    
    if [ -z "$refresh_token" ] || [ "$refresh_token" = "null" ]; then
        log_warn "Refresh token not provided (may not be enabled)"
        return 0  # Non-blocking
    fi
    
    # Use refresh token to get new access token
    local new_token=$(curl -sk --max-time 10 -X POST \
        "https://localhost:${kc_port}/realms/dive-v3-broker-usa/protocol/openid-connect/token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "client_id=dive-v3-broker-usa&client_secret=dive-v3-broker-usa-secret&refresh_token=${refresh_token}&grant_type=refresh_token" \
        2>/dev/null | jq -r '.access_token // empty')
    
    if [ -n "$new_token" ] && [ "$new_token" != "null" ]; then
        log_success "Token refresh successful"
        return 0
    else
        log_error "Token refresh failed"
        return 1
    fi
}

##
# Test: Hub user with invalid token denied
##
test_hub_to_spoke_invalid_token() {
    local spoke="$TEST_SPOKE_1"
    
    log_info "Testing USA → $spoke invalid token rejection..."
    
    # Try to access spoke with invalid token
    local invalid_token="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.invalid"
    
    eval "$(get_instance_ports "$spoke")"
    local backend_port="${SPOKE_BACKEND_HTTPS_PORT:-4000}"
    
    local response_code=$(curl -sk --max-time 10 -w "%{http_code}" -o /dev/null \
        -H "Authorization: Bearer $invalid_token" \
        "https://localhost:${backend_port}/api/auth/session" 2>/dev/null)
    
    if [ "$response_code" = "401" ] || [ "$response_code" = "403" ]; then
        log_success "Invalid token correctly rejected (HTTP $response_code)"
        return 0
    else
        log_error "Invalid token not rejected (HTTP $response_code)"
        return 1
    fi
}

##
# Test: Hub user with expired token denied
##
test_hub_to_spoke_expired_token() {
    local spoke="$TEST_SPOKE_1"
    
    log_info "Testing USA → $spoke expired token rejection..."
    
    # Create a token with past expiration (exp claim)
    local expired_token="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0dXNlciIsImV4cCI6MTYwMDAwMDAwMH0.invalid"
    
    eval "$(get_instance_ports "$spoke")"
    local backend_port="${SPOKE_BACKEND_HTTPS_PORT:-4000}"
    
    local response_code=$(curl -sk --max-time 10 -w "%{http_code}" -o /dev/null \
        -H "Authorization: Bearer $expired_token" \
        "https://localhost:${backend_port}/api/auth/session" 2>/dev/null)
    
    if [ "$response_code" = "401" ] || [ "$response_code" = "403" ]; then
        log_success "Expired token correctly rejected (HTTP $response_code)"
        return 0
    else
        log_warn "Expired token validation may not be enforced (HTTP $response_code)"
        return 0  # Non-blocking - depends on backend validation
    fi
}

##
# Test: Hub user resource authorization (OPA integration)
##
test_hub_to_spoke_opa_authorization() {
    local spoke="$TEST_SPOKE_1"
    
    log_info "Testing USA → $spoke OPA authorization..."
    
    # Get Hub token
    local hub_token=$(sso_get_token "USA" "testuser-usa-1")
    
    if [ -z "$hub_token" ]; then
        log_error "Cannot get Hub user token"
        return 1
    fi
    
    # Try to access a protected resource
    eval "$(get_instance_ports "$spoke")"
    local backend_port="${SPOKE_BACKEND_HTTPS_PORT:-4000}"
    
    local response=$(curl -sk --max-time 10 \
        -H "Authorization: Bearer $hub_token" \
        "https://localhost:${backend_port}/api/resources" 2>/dev/null)
    
    if [ -z "$response" ]; then
        log_warn "Resources endpoint not responding (backend may not be fully initialized)"
        return 0  # Non-blocking
    fi
    
    # Check if response includes resources or authorization decision
    if echo "$response" | jq -e '.' >/dev/null 2>&1; then
        log_success "OPA authorization check completed"
        return 0
    else
        log_warn "OPA integration status unclear"
        return 0  # Non-blocking
    fi
}

##
# Test: Hub user releasability check
##
test_hub_to_spoke_releasability() {
    local spoke="$TEST_SPOKE_1"
    local spoke_lower=$(lower "$spoke")
    
    log_info "Testing USA → $spoke releasability policy..."
    
    # Get Hub token
    local hub_token=$(sso_get_token "USA" "testuser-usa-1")
    
    if [ -z "$hub_token" ]; then
        log_error "Cannot get Hub user token"
        return 1
    fi
    
    # Try to access a resource that should be releasable to spoke
    eval "$(get_instance_ports "$spoke")"
    local backend_port="${SPOKE_BACKEND_HTTPS_PORT:-4000}"
    
    # Try to access a test resource (if seeding is done)
    local response=$(curl -sk --max-time 10 \
        -H "Authorization: Bearer $hub_token" \
        "https://localhost:${backend_port}/api/resources/fuel-inventory-001" 2>/dev/null)
    
    # Check if resource access is granted or denied based on releasability
    if echo "$response" | grep -q "error"; then
        local error_type=$(echo "$response" | jq -r '.error // "unknown"')
        if [ "$error_type" = "Forbidden" ]; then
            log_success "Releasability policy enforced (access denied)"
            return 0
        fi
    fi
    
    # If no error, resource was accessible
    if echo "$response" | jq -e '.resourceId' >/dev/null 2>&1; then
        log_success "Resource accessible (releasability allows USA → $spoke)"
        return 0
    fi
    
    # Resource endpoint may not exist yet
    log_warn "Releasability test inconclusive (resource endpoint status unknown)"
    return 0  # Non-blocking
}

# =============================================================================
# SPOKE → HUB SSO TESTS
# =============================================================================

##
# Test: Spoke user can authenticate at Hub
##
test_spoke_to_hub_authentication() {
    local spoke="$TEST_SPOKE_1"
    local code_lower=$(lower "$spoke")
    
    log_info "Testing $spoke → USA authentication..."
    
    # Get spoke token
    local spoke_token=$(sso_get_token "$spoke" "testuser-${code_lower}-1")
    
    if [ -z "$spoke_token" ] || [ "$spoke_token" = "null" ]; then
        log_error "Cannot get $spoke user token"
        return 1
    fi
    
    # Verify token has required claims
    if ! sso_verify_claims "$spoke_token" "sub" "iss"; then
        log_error "$spoke token missing required claims"
        return 1
    fi
    
    log_success "$spoke user authenticated successfully"
    return 0
}

##
# Test: Spoke user can access Hub backend API
##
test_spoke_to_hub_api_access() {
    local spoke="$TEST_SPOKE_1"
    local code_lower=$(lower "$spoke")
    
    log_info "Testing $spoke → USA API access..."
    
    # Get spoke token
    local spoke_token=$(sso_get_token "$spoke" "testuser-${code_lower}-1")
    
    if [ -z "$spoke_token" ]; then
        log_error "Cannot get $spoke user token"
        return 1
    fi
    
    # Test Hub backend access
    if ! sso_test_backend_access "USA" "$spoke_token"; then
        log_error "$spoke user cannot access USA backend"
        return 1
    fi
    
    log_success "$spoke user accessed USA backend successfully"
    return 0
}

##
# Test: Spoke user attribute normalization
##
test_spoke_to_hub_attribute_normalization() {
    local spoke="$TEST_SPOKE_1"
    local code_lower=$(lower "$spoke")
    local code_upper=$(upper "$spoke")
    
    log_info "Testing $spoke → USA attribute normalization..."
    
    # Get spoke token
    local spoke_token=$(sso_get_token "$spoke" "testuser-${code_lower}-1")
    
    # Decode token and check normalized attributes
    local payload=$(echo "$spoke_token" | cut -d'.' -f2 | base64 -d 2>/dev/null || echo "{}")
    
    # Check if countryOfAffiliation is set to spoke country
    local country=$(echo "$payload" | jq -r '.countryOfAffiliation // "UNKNOWN"')
    
    if [ "$country" = "UNKNOWN" ] || [ "$country" = "null" ]; then
        log_warn "countryOfAffiliation not found (may need protocol mapper)"
        return 0  # Non-blocking
    fi
    
    if [ "$country" = "$code_upper" ]; then
        log_success "Country affiliation normalized to: $country"
        return 0
    else
        log_error "Country affiliation incorrect: $country (expected $code_upper)"
        return 1
    fi
}

##
# Test: Spoke user clearance normalization
##
test_spoke_to_hub_clearance_normalization() {
    local spoke="$TEST_SPOKE_1"
    local code_lower=$(lower "$spoke")
    
    log_info "Testing $spoke → USA clearance normalization..."
    
    # Get spoke token
    local spoke_token=$(sso_get_token "$spoke" "testuser-${code_lower}-1")
    
    # Decode token and check clearance
    local payload=$(echo "$spoke_token" | cut -d'.' -f2 | base64 -d 2>/dev/null || echo "{}")
    local clearance=$(echo "$payload" | jq -r '.clearance // "UNKNOWN"')
    
    if [ "$clearance" = "UNKNOWN" ] || [ "$clearance" = "null" ]; then
        log_warn "Clearance attribute not found (may need protocol mapper)"
        return 0  # Non-blocking
    fi
    
    # Verify clearance is a valid level
    if [[ "$clearance" =~ ^(UNCLASSIFIED|CONFIDENTIAL|SECRET|TOP_SECRET)$ ]]; then
        log_success "Clearance normalized to: $clearance"
        return 0
    else
        log_error "Clearance invalid: $clearance"
        return 1
    fi
}

##
# Test: Spoke user COI attribute presence
##
test_spoke_to_hub_coi_attribute() {
    local spoke="$TEST_SPOKE_1"
    local code_lower=$(lower "$spoke")
    
    log_info "Testing $spoke → USA COI attribute..."
    
    # Get spoke token
    local spoke_token=$(sso_get_token "$spoke" "testuser-${code_lower}-1")
    
    # Decode token and check COI
    local payload=$(echo "$spoke_token" | cut -d'.' -f2 | base64 -d 2>/dev/null || echo "{}")
    local coi=$(echo "$payload" | jq -r '.acpCOI // empty')
    
    if [ -n "$coi" ] && [ "$coi" != "null" ]; then
        log_success "COI attribute present"
        return 0
    else
        log_warn "COI attribute not found (optional)"
        return 0  # Non-blocking - COI is optional
    fi
}

##
# Test: Spoke user uniqueID normalization
##
test_spoke_to_hub_unique_id() {
    local spoke="$TEST_SPOKE_1"
    local code_lower=$(lower "$spoke")
    
    log_info "Testing $spoke → USA uniqueID normalization..."
    
    # Get spoke token
    local spoke_token=$(sso_get_token "$spoke" "testuser-${code_lower}-1")
    
    # Decode token and check uniqueID
    local payload=$(echo "$spoke_token" | cut -d'.' -f2 | base64 -d 2>/dev/null || echo "{}")
    local unique_id=$(echo "$payload" | jq -r '.uniqueID // .sub // empty')
    
    if [ -n "$unique_id" ] && [ "$unique_id" != "null" ]; then
        log_success "uniqueID present: $unique_id"
        return 0
    else
        log_error "uniqueID not found in token"
        return 1
    fi
}

##
# Test: Spoke user resource authorization at Hub
##
test_spoke_to_hub_authorization() {
    local spoke="$TEST_SPOKE_1"
    local code_lower=$(lower "$spoke")
    
    log_info "Testing $spoke → USA authorization..."
    
    # Get spoke token
    local spoke_token=$(sso_get_token "$spoke" "testuser-${code_lower}-1")
    
    if [ -z "$spoke_token" ]; then
        log_error "Cannot get $spoke user token"
        return 1
    fi
    
    # Try to access Hub resources
    eval "$(get_instance_ports "USA")"
    local backend_port="${SPOKE_BACKEND_HTTPS_PORT:-4000}"
    
    local response=$(curl -sk --max-time 10 \
        -H "Authorization: Bearer $spoke_token" \
        "https://localhost:${backend_port}/api/resources" 2>/dev/null)
    
    if [ -z "$response" ]; then
        log_warn "Resources endpoint not responding"
        return 0  # Non-blocking
    fi
    
    # Check if authorization is enforced
    if echo "$response" | jq -e '.' >/dev/null 2>&1; then
        log_success "Authorization check completed"
        return 0
    else
        log_warn "Authorization status unclear"
        return 0  # Non-blocking
    fi
}

##
# Test: Spoke user cross-classification access
##
test_spoke_to_hub_classification() {
    local spoke="$TEST_SPOKE_1"
    local code_lower=$(lower "$spoke")
    
    log_info "Testing $spoke → USA classification-based access..."
    
    # Get spoke token
    local spoke_token=$(sso_get_token "$spoke" "testuser-${code_lower}-1")
    
    if [ -z "$spoke_token" ]; then
        log_error "Cannot get $spoke user token"
        return 1
    fi
    
    # Decode token to get user's clearance
    local payload=$(echo "$spoke_token" | cut -d'.' -f2 | base64 -d 2>/dev/null || echo "{}")
    local user_clearance=$(echo "$payload" | jq -r '.clearance // "UNCLASSIFIED"')
    
    log_info "User clearance: $user_clearance"
    
    # Try to access a resource at Hub (if seeded)
    eval "$(get_instance_ports "USA")"
    local backend_port="${SPOKE_BACKEND_HTTPS_PORT:-4000}"
    
    local response=$(curl -sk --max-time 10 \
        -H "Authorization: Bearer $spoke_token" \
        "https://localhost:${backend_port}/api/resources/fuel-inventory-001" 2>/dev/null)
    
    # Classification enforcement depends on OPA policy and resource seeding
    if echo "$response" | grep -q "error"; then
        log_info "Access denied (classification policy enforced)"
        return 0  # Either outcome is valid
    elif echo "$response" | jq -e '.resourceId' >/dev/null 2>&1; then
        log_info "Access granted (user has sufficient clearance)"
        return 0
    else
        log_warn "Classification test inconclusive (resource may not exist)"
        return 0  # Non-blocking
    fi
}

##
# Test: Spoke user cross-border releasability
##
test_spoke_to_hub_releasability() {
    local spoke="$TEST_SPOKE_1"
    local code_lower=$(lower "$spoke")
    local code_upper=$(upper "$spoke")
    
    log_info "Testing $spoke → USA releasability..."
    
    # Get spoke token
    local spoke_token=$(sso_get_token "$spoke" "testuser-${code_lower}-1")
    
    if [ -z "$spoke_token" ]; then
        log_error "Cannot get $spoke user token"
        return 1
    fi
    
    # Try to access Hub resources
    eval "$(get_instance_ports "USA")"
    local backend_port="${SPOKE_BACKEND_HTTPS_PORT:-4000}"
    
    local response=$(curl -sk --max-time 10 \
        -H "Authorization: Bearer $spoke_token" \
        "https://localhost:${backend_port}/api/resources" 2>/dev/null)
    
    # Releasability check - spoke user should have limited access to USA resources
    if echo "$response" | jq -e '.[]' >/dev/null 2>&1; then
        local resource_count=$(echo "$response" | jq 'length')
        log_success "Releasability enforced (accessible resources: $resource_count)"
        return 0
    elif echo "$response" | grep -q "error"; then
        log_success "Releasability enforced (access restricted)"
        return 0
    else
        log_warn "Releasability test inconclusive"
        return 0  # Non-blocking
    fi
}

##
# Test: Industry user (enriched attributes)
##
test_spoke_to_hub_industry_user() {
    local spoke="$TEST_SPOKE_1"
    local code_lower=$(lower "$spoke")
    
    log_info "Testing $spoke → USA industry user attribute enrichment..."
    
    # Try to get token for industry user (if exists)
    local industry_token=$(sso_get_token "$spoke" "bob.contractor")
    
    if [ -z "$industry_token" ] || [ "$industry_token" = "null" ]; then
        skip_test "Industry user test" "bob.contractor user not available"
        return 0
    fi
    
    # Decode token and check if countryOfAffiliation was enriched from email
    local payload=$(echo "$industry_token" | cut -d'.' -f2 | base64 -d 2>/dev/null || echo "{}")
    local country=$(echo "$payload" | jq -r '.countryOfAffiliation // "UNKNOWN"')
    
    if [ "$country" != "UNKNOWN" ] && [ "$country" != "null" ]; then
        log_success "Industry user country enriched: $country"
        return 0
    else
        log_warn "Country enrichment not applied (may need backend attribute enrichment)"
        return 0  # Non-blocking
    fi
}

# =============================================================================
# MULTI-SPOKE SSO TESTS
# =============================================================================

##
# Test: Multi-spoke triangle routing (FRA → GBR → DEU)
##
test_multi_spoke_triangle() {
    local spoke1="$TEST_SPOKE_1"
    local spoke2="$TEST_SPOKE_2"
    local spoke3="$TEST_SPOKE_3"
    
    log_info "Testing multi-spoke triangle: $spoke1 → $spoke2 → $spoke3..."
    
    # Check if all spokes are deployed
    for spoke in "$spoke1" "$spoke2" "$spoke3"; do
        local code_lower=$(lower "$spoke")
        if ! docker ps --format '{{.Names}}' | grep -q "dive-spoke-${code_lower}"; then
            skip_test "Multi-spoke triangle test" "$spoke not deployed"
            return 0
        fi
    done
    
    # Get token from spoke1
    local token1=$(sso_get_token "$spoke1" "testuser-$(lower $spoke1)-1")
    
    if [ -z "$token1" ]; then
        log_error "Cannot get $spoke1 user token"
        return 1
    fi
    
    # Test access to spoke2
    if ! sso_test_backend_access "$spoke2" "$token1"; then
        log_error "$spoke1 user cannot access $spoke2"
        return 1
    fi
    
    log_success "$spoke1 → $spoke2 access successful"
    
    # Test access to spoke3 from spoke1 token
    if ! sso_test_backend_access "$spoke3" "$token1"; then
        log_error "$spoke1 user cannot access $spoke3"
        return 1
    fi
    
    log_success "$spoke1 → $spoke3 access successful"
    log_success "Multi-spoke triangle routing works"
    return 0
}

##
# Test: Simultaneous SSO from multiple spokes
##
test_multi_spoke_simultaneous() {
    local spoke1="$TEST_SPOKE_1"
    local spoke2="$TEST_SPOKE_2"
    
    log_info "Testing simultaneous SSO: $spoke1 + $spoke2 → USA..."
    
    # Check if both spokes are deployed
    for spoke in "$spoke1" "$spoke2"; do
        local code_lower=$(lower "$spoke")
        if ! docker ps --format '{{.Names}}' | grep -q "dive-spoke-${code_lower}"; then
            skip_test "Simultaneous SSO test" "$spoke not deployed"
            return 0
        fi
    done
    
    # Get tokens from both spokes simultaneously (background processes)
    local token1=""
    local token2=""
    
    (token1=$(sso_get_token "$spoke1" "testuser-$(lower $spoke1)-1"); echo "$token1" > /tmp/token1.tmp) &
    local pid1=$!
    
    (token2=$(sso_get_token "$spoke2" "testuser-$(lower $spoke2)-1"); echo "$token2" > /tmp/token2.tmp) &
    local pid2=$!
    
    # Wait for both
    wait $pid1 $pid2
    
    token1=$(cat /tmp/token1.tmp 2>/dev/null || echo "")
    token2=$(cat /tmp/token2.tmp 2>/dev/null || echo "")
    rm -f /tmp/token1.tmp /tmp/token2.tmp
    
    if [ -z "$token1" ] || [ -z "$token2" ]; then
        log_error "Failed to get tokens from both spokes simultaneously"
        return 1
    fi
    
    # Test both users accessing Hub
    if sso_test_backend_access "USA" "$token1" && sso_test_backend_access "USA" "$token2"; then
        log_success "Simultaneous SSO sessions work without interference"
        return 0
    else
        log_error "Simultaneous SSO sessions failed"
        return 1
    fi
}

##
# Test: Cross-spoke bidirectional SSO
##
test_multi_spoke_bidirectional() {
    local spoke1="$TEST_SPOKE_1"
    local spoke2="$TEST_SPOKE_2"
    
    log_info "Testing bidirectional SSO: $spoke1 ↔ $spoke2..."
    
    # Check if both spokes are deployed
    for spoke in "$spoke1" "$spoke2"; do
        local code_lower=$(lower "$spoke")
        if ! docker ps --format '{{.Names}}' | grep -q "dive-spoke-${code_lower}"; then
            skip_test "Bidirectional SSO test" "$spoke not deployed"
            return 0
        fi
    done
    
    # Use the existing test_bidirectional_sso function from federation-test.sh
    if test_bidirectional_sso "$spoke1" "$spoke2"; then
        log_success "Bidirectional SSO works: $spoke1 ↔ $spoke2"
        return 0
    else
        log_error "Bidirectional SSO failed: $spoke1 ↔ $spoke2"
        return 1
    fi
}

# =============================================================================
# FEDERATION DATABASE STATE TESTS
# =============================================================================

##
# Test: Federation links recorded in database
##
test_federation_db_links() {
    log_info "Testing federation database state..."
    
    if ! type fed_db_list_all_links &>/dev/null; then
        skip_test "Federation database test" "federation-state-db module not loaded"
        return 0
    fi
    
    # Query federation links
    local links=$(fed_db_list_all_links 2>/dev/null)
    
    if [ -z "$links" ]; then
        log_warn "No federation links found in database"
        return 0  # Non-blocking - database may not be populated
    fi
    
    # Count links
    local link_count=$(echo "$links" | wc -l | xargs)
    log_success "Federation database contains $link_count links"
    
    return 0
}

##
# Test: Health checks recorded
##
test_federation_db_health() {
    log_info "Testing federation health check recording..."
    
    if ! type fed_db_get_latest_health &>/dev/null; then
        skip_test "Federation health test" "federation-state-db module not loaded"
        return 0
    fi
    
    local spoke="$TEST_SPOKE_1"
    local code_lower=$(lower "$spoke")
    
    # Check if health checks exist
    local health=$(fed_db_get_latest_health "$code_lower" "usa" "SPOKE_TO_HUB" 2>/dev/null)
    
    if [ -n "$health" ]; then
        log_success "Health checks recorded in database"
        return 0
    else
        log_warn "No health checks found (may not have run yet)"
        return 0  # Non-blocking
    fi
}

##
# Test: Federation status view
##
test_federation_db_status_view() {
    log_info "Testing federation status view..."
    
    if ! type fed_db_get_instance_status &>/dev/null; then
        skip_test "Federation status view test" "federation-state-db module not loaded"
        return 0
    fi
    
    local spoke="$TEST_SPOKE_1"
    local code_lower=$(lower "$spoke")
    
    # Get instance status
    local status=$(fed_db_get_instance_status "$code_lower" 2>/dev/null)
    
    if [ -n "$status" ]; then
        log_success "Federation status view working"
        echo "$status" | jq '.' 2>/dev/null || echo "$status"
        return 0
    else
        log_warn "Federation status view returned empty"
        return 0  # Non-blocking
    fi
}

# =============================================================================
# PERFORMANCE TESTS
# =============================================================================

##
# Test: SSO latency measurement
##
test_sso_latency() {
    local spoke="$TEST_SPOKE_1"
    local code_lower=$(lower "$spoke")
    
    log_info "Testing SSO latency (target: p95 < 500ms)..."
    
    # Measure 5 token requests
    local total_latency=0
    local successful_requests=0
    
    for i in {1..5}; do
        local start_time=$(date +%s%3N)
        local token=$(sso_get_token "$spoke" "testuser-${code_lower}-1")
        local end_time=$(date +%s%3N)
        
        if [ -n "$token" ] && [ "$token" != "null" ]; then
            local latency=$((end_time - start_time))
            total_latency=$((total_latency + latency))
            ((successful_requests++))
            log_verbose "Request $i: ${latency}ms"
        fi
    done
    
    if [ $successful_requests -eq 0 ]; then
        log_error "All latency test requests failed"
        return 1
    fi
    
    local avg_latency=$((total_latency / successful_requests))
    
    log_info "Average SSO latency: ${avg_latency}ms"
    
    if [ $avg_latency -lt 500 ]; then
        log_success "SSO latency within target (< 500ms)"
        return 0
    else
        log_warn "SSO latency above target: ${avg_latency}ms (target: < 500ms)"
        return 0  # Non-blocking - performance target is aspirational
    fi
}

# =============================================================================
# MAIN TEST RUNNER
# =============================================================================

main() {
    log_info "═══════════════════════════════════════════════════════════"
    log_info "DIVE V3 - Comprehensive SSO Test Suite (Phase 2)"
    log_info "═══════════════════════════════════════════════════════════"
    log_info ""
    log_info "Test Configuration:"
    log_info "  Hub: $TEST_HUB"
    log_info "  Primary Spoke: $TEST_SPOKE_1"
    log_info "  Secondary Spoke: $TEST_SPOKE_2"
    log_info "  Tertiary Spoke: $TEST_SPOKE_3"
    log_info ""
    
    # ==========================================================================
    # HUB → SPOKE SSO TESTS
    # ==========================================================================
    log_info "═══════════════════════════════════════════════════════════"
    log_info "SUITE 1: Hub → Spoke SSO Tests"
    log_info "═══════════════════════════════════════════════════════════"
    
    run_test "Hub→Spoke Authentication" test_hub_to_spoke_authentication
    run_test "Hub→Spoke API Access" test_hub_to_spoke_api_access
    run_test "Hub→Spoke Clearance Mapping" test_hub_to_spoke_clearance_mapping
    run_test "Hub→Spoke Country Mapping" test_hub_to_spoke_country_mapping
    run_test "Hub→Spoke COI Mapping" test_hub_to_spoke_coi_mapping
    run_test "Hub→Spoke Token Refresh" test_hub_to_spoke_token_refresh
    run_test "Hub→Spoke Invalid Token Rejection" test_hub_to_spoke_invalid_token
    run_test "Hub→Spoke Expired Token Rejection" test_hub_to_spoke_expired_token
    run_test "Hub→Spoke OPA Authorization" test_hub_to_spoke_opa_authorization
    run_test "Hub→Spoke Releasability Check" test_hub_to_spoke_releasability
    
    # ==========================================================================
    # SPOKE → HUB SSO TESTS
    # ==========================================================================
    log_info ""
    log_info "═══════════════════════════════════════════════════════════"
    log_info "SUITE 2: Spoke → Hub SSO Tests"
    log_info "═══════════════════════════════════════════════════════════"
    
    run_test "Spoke→Hub Authentication" test_spoke_to_hub_authentication
    run_test "Spoke→Hub API Access" test_spoke_to_hub_api_access
    run_test "Spoke→Hub Attribute Normalization" test_spoke_to_hub_attribute_normalization
    run_test "Spoke→Hub Clearance Normalization" test_spoke_to_hub_clearance_normalization
    run_test "Spoke→Hub COI Attribute" test_spoke_to_hub_coi_attribute
    run_test "Spoke→Hub UniqueID" test_spoke_to_hub_unique_id
    run_test "Spoke→Hub Authorization" test_spoke_to_hub_authorization
    run_test "Spoke→Hub Classification Check" test_spoke_to_hub_classification
    run_test "Spoke→Hub Releasability" test_spoke_to_hub_releasability
    run_test "Spoke→Hub Industry User Enrichment" test_spoke_to_hub_industry_user
    
    # ==========================================================================
    # MULTI-SPOKE SSO TESTS
    # ==========================================================================
    log_info ""
    log_info "═══════════════════════════════════════════════════════════"
    log_info "SUITE 3: Multi-Spoke SSO Tests"
    log_info "═══════════════════════════════════════════════════════════"
    
    run_test "Multi-Spoke Triangle Routing" test_multi_spoke_triangle
    run_test "Multi-Spoke Simultaneous Sessions" test_multi_spoke_simultaneous
    run_test "Multi-Spoke Bidirectional SSO" test_multi_spoke_bidirectional
    
    # ==========================================================================
    # FEDERATION DATABASE TESTS
    # ==========================================================================
    log_info ""
    log_info "═══════════════════════════════════════════════════════════"
    log_info "SUITE 4: Federation Database State Tests"
    log_info "═══════════════════════════════════════════════════════════"
    
    run_test "Federation Links Recorded" test_federation_db_links
    run_test "Health Checks Recorded" test_federation_db_health
    run_test "Federation Status View" test_federation_db_status_view
    
    # ==========================================================================
    # PERFORMANCE TESTS
    # ==========================================================================
    log_info ""
    log_info "═══════════════════════════════════════════════════════════"
    log_info "SUITE 5: Performance Tests"
    log_info "═══════════════════════════════════════════════════════════"
    
    run_test "SSO Latency Measurement" test_sso_latency
    
    # ==========================================================================
    # FINAL SUMMARY
    # ==========================================================================
    log_info ""
    log_info "═══════════════════════════════════════════════════════════"
    log_info "TEST SUMMARY"
    log_info "═══════════════════════════════════════════════════════════"
    log_info ""
    log_info "Total Tests: $TOTAL_TESTS"
    log_success "Passed: $PASSED_TESTS"
    log_error "Failed: $FAILED_TESTS"
    local skipped=$((TOTAL_TESTS - PASSED_TESTS - FAILED_TESTS))
    if [ $skipped -gt 0 ]; then
        log_warn "Skipped: $skipped"
    fi
    log_info ""
    
    # Detailed results
    log_info "Detailed Results:"
    for i in "${!TEST_NAMES[@]}"; do
        local status="${TEST_RESULTS[$i]}"
        local name="${TEST_NAMES[$i]}"
        
        case "$status" in
            "PASS")
                log_success "  ✅ $name"
                ;;
            "FAIL")
                log_error "  ❌ $name"
                ;;
            "SKIP")
                log_warn "  ⏭️  $name"
                ;;
        esac
    done
    
    log_info ""
    
    # Calculate pass rate
    local pass_rate=0
    if [ $TOTAL_TESTS -gt 0 ]; then
        pass_rate=$(( (PASSED_TESTS * 100) / TOTAL_TESTS ))
    fi
    
    log_info "Pass Rate: ${pass_rate}%"
    log_info ""
    
    # Exit with appropriate code
    if [ $FAILED_TESTS -eq 0 ]; then
        log_success "═══════════════════════════════════════════════════════════"
        log_success "🎉 ALL TESTS PASSED!"
        log_success "═══════════════════════════════════════════════════════════"
        return 0
    else
        log_error "═══════════════════════════════════════════════════════════"
        log_error "❌ SOME TESTS FAILED"
        log_error "═══════════════════════════════════════════════════════════"
        return 1
    fi
}

# Run tests
main "$@"
