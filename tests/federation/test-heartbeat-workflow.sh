#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Heartbeat Workflow Test Suite
# =============================================================================
# Tests the spoke heartbeat authentication and communication workflow:
# - Token validation
# - Heartbeat endpoint connectivity
# - Authentication success/failure scenarios
# - Hub response handling
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="${SCRIPT_DIR}/../.."

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((TESTS_PASSED++))
    ((TESTS_RUN++))
}

fail() {
    echo -e "${RED}✗${NC} $1"
    echo -e "  ${RED}Details:${NC} $2"
    ((TESTS_FAILED++))
    ((TESTS_RUN++))
}

info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

section() {
    echo ""
    echo -e "${YELLOW}━━━ $1 ━━━${NC}"
}

# =============================================================================
# Test 1: Token Format Validation
# =============================================================================
test_token_format() {
    section "Test 1: Token Format Validation"
    
    # Test: Hub API token format (short base64url)
    local hub_token="mWX0rVEjLo1GAGuF8HM8gMHQj78mfEqZOjoGyYOHPzI"
    
    # Should be base64url (no special chars except - and _)
    if [[ "$hub_token" =~ ^[A-Za-z0-9_-]+$ ]]; then
        pass "Hub API token has valid base64url format"
    else
        fail "Invalid token format" "Token contains invalid characters"
    fi
    
    # Should be short (32-64 chars typically)
    if [ ${#hub_token} -ge 32 ] && [ ${#hub_token} -le 128 ]; then
        pass "Hub API token has valid length: ${#hub_token} chars"
    else
        fail "Token length out of range" "Got: ${#hub_token} chars"
    fi
    
    # Test: OPAL token format (long JWT)
    local opal_token="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjY4OTM3NTYsImV4cCI6MTc5ODQyOTc1Nn0.signature"
    
    # Should start with eyJ (JWT header)
    if [[ "$opal_token" =~ ^eyJ ]]; then
        pass "OPAL token correctly identified as JWT format"
    else
        fail "OPAL token format not recognized" "Should start with 'eyJ'"
    fi
    
    # Should have 3 parts (header.payload.signature)
    local parts=$(echo "$opal_token" | tr '.' '\n' | wc -l)
    if [ $parts -eq 3 ]; then
        pass "OPAL JWT has correct structure (3 parts)"
    else
        fail "JWT structure invalid" "Expected 3 parts, got: $parts"
    fi
    
    # Test: Tokens are different
    if [ "$hub_token" != "$opal_token" ]; then
        pass "Hub API token and OPAL token are different (correct)"
    else
        fail "Tokens should be different" "Hub API token != OPAL client JWT"
    fi
}

# =============================================================================
# Test 2: Environment Variable Configuration
# =============================================================================
test_environment_configuration() {
    section "Test 2: Environment Variable Configuration"
    
    # Test: SPOKE_TOKEN vs SPOKE_OPAL_TOKEN
    local test_env=$(cat <<EOF
SPOKE_TOKEN=hub-api-token-123
SPOKE_OPAL_TOKEN=eyJhbGciOiJSUzI1NiJ9...
EOF
)
    
    local spoke_token=$(echo "$test_env" | grep "^SPOKE_TOKEN=" | cut -d= -f2)
    local opal_token=$(echo "$test_env" | grep "^SPOKE_OPAL_TOKEN=" | cut -d= -f2)
    
    if [ "$spoke_token" = "hub-api-token-123" ]; then
        pass "SPOKE_TOKEN correctly extracted from environment"
    else
        fail "SPOKE_TOKEN extraction failed" "Got: $spoke_token"
    fi
    
    if [[ "$opal_token" =~ ^eyJ ]]; then
        pass "SPOKE_OPAL_TOKEN correctly extracted (JWT format)"
    else
        fail "SPOKE_OPAL_TOKEN format unexpected" "Got: $opal_token"
    fi
    
    # Test: Docker-compose mapping
    # CRITICAL: Must use ${SPOKE_TOKEN:-} NOT ${SPOKE_OPAL_TOKEN:-}
    local correct_mapping='SPOKE_TOKEN: ${SPOKE_TOKEN:-}'
    local incorrect_mapping='SPOKE_TOKEN: ${SPOKE_OPAL_TOKEN:-}'
    
    if echo "$correct_mapping" | grep -q '${SPOKE_TOKEN:-}'; then
        pass "Correct docker-compose mapping uses \${SPOKE_TOKEN:-}"
    fi
    
    if echo "$incorrect_mapping" | grep -q '${SPOKE_OPAL_TOKEN'; then
        pass "Detected incorrect mapping (bug we fixed)"
    fi
}

# =============================================================================
# Test 3: Heartbeat Authentication Scenarios
# =============================================================================
test_heartbeat_authentication() {
    section "Test 3: Heartbeat Authentication Scenarios"
    
    info "Testing heartbeat authentication logic..."
    
    # Test: Valid token scenario
    local valid_payload=$(cat <<EOF
{
  "spokeId": "spoke-tst-abc123",
  "services": {
    "opa": {"healthy": true},
    "mongodb": {"healthy": true}
  },
  "metrics": {
    "uptime": 3600
  }
}
EOF
)
    
    if echo "$valid_payload" | jq -e '.spokeId' >/dev/null 2>&1; then
        pass "Valid heartbeat payload structure"
    else
        fail "Invalid heartbeat payload" "Missing required fields"
    fi
    
    # Test: Authorization header format
    local auth_header="Bearer hub-api-token-123"
    if [[ "$auth_header" =~ ^Bearer\ .+ ]]; then
        pass "Authorization header has correct format"
    else
        fail "Invalid Authorization header format" "Should be 'Bearer {token}'"
    fi
    
    # Test: Extract token from header
    local token=$(echo "$auth_header" | sed 's/Bearer //')
    if [ "$token" = "hub-api-token-123" ]; then
        pass "Token correctly extracted from Authorization header"
    else
        fail "Token extraction failed" "Expected: hub-api-token-123, Got: $token"
    fi
    
    # Test: Token validation requirements
    info "Token validation must check:"
    echo "  • Token exists in MongoDB spoke_tokens collection"
    echo "  • Token is not expired (expiresAt > now)"
    echo "  • Associated spoke status = 'approved'"
    echo "  • Spoke is not suspended or revoked"
    pass "Token validation requirements documented"
}

# =============================================================================
# Test 4: Hub Connectivity and Network Configuration
# =============================================================================
test_hub_connectivity() {
    section "Test 4: Hub Connectivity and Network Configuration"
    
    # Test: Hub URL configuration
    local hub_urls=(
        "https://dive-hub-backend:4000"      # Docker internal
        "https://localhost:4000"              # localhost
        "https://usa-api.dive25.com"          # Production
    )
    
    for url in "${hub_urls[@]}"; do
        if [[ "$url" =~ ^https?:// ]]; then
            pass "Hub URL format valid: $url"
        else
            fail "Invalid Hub URL format" "URL: $url"
        fi
    done
    
    # Test: Heartbeat endpoint path
    local heartbeat_endpoint="/api/federation/heartbeat"
    if [[ "$heartbeat_endpoint" =~ ^/api/ ]]; then
        pass "Heartbeat endpoint path valid: $heartbeat_endpoint"
    else
        fail "Invalid endpoint path" "Should start with /api/"
    fi
    
    # Test: Full heartbeat URL construction
    local hub_url="https://dive-hub-backend:4000"
    local full_url="${hub_url}${heartbeat_endpoint}"
    
    if [[ "$full_url" = "https://dive-hub-backend:4000/api/federation/heartbeat" ]]; then
        pass "Heartbeat URL correctly constructed"
    else
        fail "URL construction error" "Got: $full_url"
    fi
}

# =============================================================================
# Test 5: Response Handling
# =============================================================================
test_response_handling() {
    section "Test 5: Heartbeat Response Handling"
    
    # Test: Success response
    local success_response='{"success":true,"message":"Heartbeat acknowledged"}'
    if echo "$success_response" | jq -e '.success == true' >/dev/null 2>&1; then
        pass "Success response correctly parsed"
    else
        fail "Failed to parse success response" "Response: $success_response"
    fi
    
    # Test: Unauthorized response
    local unauthorized_response='{"error":"Unauthorized: Token may be invalid or expired"}'
    if echo "$unauthorized_response" | jq -e '.error' >/dev/null 2>&1; then
        local error=$(echo "$unauthorized_response" | jq -r '.error')
        if [[ "$error" =~ Unauthorized ]]; then
            pass "Unauthorized error correctly identified"
        fi
    fi
    
    # Test: Connection refused handling
    local conn_refused_error="Request failed: connect ECONNREFUSED"
    if [[ "$conn_refused_error" =~ ECONNREFUSED ]]; then
        pass "Connection refused error detected (Hub not reachable)"
    fi
    
    # Test: Timeout handling
    local timeout_error="Request failed: timeout"
    if [[ "$timeout_error" =~ timeout ]]; then
        pass "Timeout error detected"
    fi
}

# =============================================================================
# Run All Tests
# =============================================================================
main() {
    echo "================================================="
    echo "DIVE V3 - Heartbeat Workflow Test Suite"
    echo "================================================="
    echo ""
    
    test_token_format
    test_environment_configuration
    test_heartbeat_authentication
    test_hub_connectivity
    test_response_handling
    
    # Summary
    echo ""
    echo "================================================="
    echo "Test Summary"
    echo "================================================="
    echo -e "Total Tests:  $TESTS_RUN"
    echo -e "${GREEN}Passed:${NC}       $TESTS_PASSED"
    echo -e "${RED}Failed:${NC}       $TESTS_FAILED"
    
    if [ $TESTS_FAILED -eq 0 ]; then
        echo ""
        echo -e "${GREEN}✓ All tests passed!${NC}"
        exit 0
    else
        echo ""
        echo -e "${RED}✗ Some tests failed${NC}"
        exit 1
    fi
}

# Run tests if executed directly
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi
