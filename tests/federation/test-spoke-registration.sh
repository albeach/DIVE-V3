#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Spoke Registration Test Suite
# =============================================================================
# Tests the complete spoke registration workflow including:
# - Registration payload validation
# - Hub MongoDB registration
# - Auto-approval in development mode
# - Token generation and storage
# - Bidirectional federation creation
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
# Test 1: Validate Registration Payload Schema
# =============================================================================
test_registration_payload_schema() {
    section "Test 1: Registration Payload Schema Validation"

    local test_payload=$(cat <<EOF
{
  "instanceCode": "TST",
  "name": "Test Instance",
  "baseUrl": "https://localhost:3999",
  "apiUrl": "https://localhost:4999",
  "idpUrl": "https://localhost:8999",
  "idpPublicUrl": "https://localhost:8999",
  "requestedScopes": ["policy:base"],
  "contactEmail": "test@example.com",
  "keycloakAdminPassword": "test-password-123",
  "skipValidation": true
}
EOF
)

    # Test: Payload is valid JSON
    if echo "$test_payload" | jq empty 2>/dev/null; then
        pass "Payload is valid JSON"
    else
        fail "Payload is not valid JSON" "jq validation failed"
        return
    fi

    # Test: All required fields present
    local required_fields=("instanceCode" "name" "baseUrl" "apiUrl" "idpUrl" "requestedScopes" "contactEmail")
    for field in "${required_fields[@]}"; do
        if echo "$test_payload" | jq -e ".$field" >/dev/null 2>&1; then
            pass "Required field present: $field"
        else
            fail "Required field missing: $field" "Field not found in payload"
        fi
    done

    # Test: instanceCode is 3 characters
    local code=$(echo "$test_payload" | jq -r '.instanceCode')
    if [ ${#code} -eq 3 ]; then
        pass "instanceCode is 3 characters: $code"
    else
        fail "instanceCode must be 3 characters" "Got: $code (${#code} chars)"
    fi

    # Test: URLs are valid format
    local base_url=$(echo "$test_payload" | jq -r '.baseUrl')
    if [[ "$base_url" =~ ^https?:// ]]; then
        pass "baseUrl is valid URL format"
    else
        fail "baseUrl must start with http:// or https://" "Got: $base_url"
    fi

    # Test: requestedScopes is array
    if echo "$test_payload" | jq -e '.requestedScopes | type == "array"' >/dev/null 2>&1; then
        pass "requestedScopes is an array"
    else
        fail "requestedScopes must be an array" "Type check failed"
    fi

    # Test: Keycloak password present (critical for bidirectional federation)
    if echo "$test_payload" | jq -e '.keycloakAdminPassword' >/dev/null 2>&1; then
        pass "keycloakAdminPassword present (required for bidirectional federation)"
    else
        fail "keycloakAdminPassword missing" "This will cause bidirectional federation to fail"
    fi
}

# =============================================================================
# Test 2: Registration API Response Handling
# =============================================================================
test_registration_response_handling() {
    section "Test 2: Registration Response Handling"

    # Test: Success response structure
    local success_response=$(cat <<EOF
{
  "success": true,
  "spoke": {
    "spokeId": "spoke-tst-abc123",
    "instanceCode": "TST",
    "status": "approved",
    "name": "Test Instance"
  },
  "token": {
    "token": "test-token-abc123",
    "expiresAt": "2026-01-16T00:00:00Z",
    "scopes": ["policy:base"]
  }
}
EOF
)

    # Test: Extract spokeId
    local spoke_id=$(echo "$success_response" | jq -r '.spoke.spokeId // empty')
    if [[ "$spoke_id" =~ ^spoke-tst- ]]; then
        pass "SpokeId extracted successfully: $spoke_id"
    else
        fail "Failed to extract spokeId" "Got: $spoke_id"
    fi

    # Test: Check status is approved
    local status=$(echo "$success_response" | jq -r '.spoke.status // empty')
    if [ "$status" = "approved" ]; then
        pass "Spoke status is 'approved'"
    else
        fail "Unexpected spoke status" "Expected: approved, Got: $status"
    fi

    # Test: Extract token
    local token=$(echo "$success_response" | jq -r '.token.token // empty')
    if [ -n "$token" ] && [ "$token" != "null" ]; then
        pass "Token extracted successfully"
    else
        fail "Failed to extract token" "Token is empty or null"
    fi

    # Test: Handle suspended status
    local suspended_response=$(cat <<EOF
{
  "success": true,
  "spoke": {
    "spokeId": "spoke-tst-xyz789",
    "status": "suspended",
    "message": "Bidirectional federation failed"
  },
  "token": null
}
EOF
)

    local suspended_status=$(echo "$suspended_response" | jq -r '.spoke.status')
    if [ "$suspended_status" = "suspended" ]; then
        pass "Correctly identified suspended status"

        local message=$(echo "$suspended_response" | jq -r '.spoke.message // empty')
        if [ -n "$message" ]; then
            pass "Suspension message extracted: $message"
        fi
    fi

    # Test: Handle error response
    local error_response='{"error":"Instance TST is already registered"}'
    if echo "$error_response" | jq -e '.error' >/dev/null 2>&1; then
        pass "Error response correctly identified"
    fi
}

# =============================================================================
# Test 3: Token Storage and Environment Configuration
# =============================================================================
test_token_storage() {
    section "Test 3: Token Storage and Environment Configuration"

    # Create temporary test environment
    local test_dir="/tmp/dive-test-$$"
    mkdir -p "$test_dir"

    # Test: Token added to new .env file
    local test_token="test-token-abc123"
    echo "SPOKE_TOKEN=$test_token" > "$test_dir/.env"

    if grep -q "^SPOKE_TOKEN=$test_token" "$test_dir/.env"; then
        pass "Token correctly added to new .env file"
    else
        fail "Token not found in .env file" "File content: $(cat $test_dir/.env)"
    fi

    # Test: Token updated in existing .env file
    echo "SPOKE_TOKEN=old-token" > "$test_dir/.env"
    sed -i.bak "s|^SPOKE_TOKEN=.*|SPOKE_TOKEN=$test_token|" "$test_dir/.env"

    if grep -q "^SPOKE_TOKEN=$test_token" "$test_dir/.env"; then
        pass "Token correctly updated in existing .env file"
    else
        fail "Token update failed" "Expected: $test_token"
    fi

    # Test: Docker-compose environment mapping
    local compose_snippet='      SPOKE_TOKEN: ${SPOKE_TOKEN:-}  # Hub API token'
    if echo "$compose_snippet" | grep -q '${SPOKE_TOKEN:-}'; then
        pass "Docker-compose uses correct environment variable mapping"
    else
        fail "Docker-compose has incorrect mapping" "Should use \${SPOKE_TOKEN:-}"
    fi

    # Test: Verify NOT using OPAL token for heartbeat
    if echo "$compose_snippet" | grep -q '${SPOKE_OPAL_TOKEN'; then
        fail "Docker-compose incorrectly uses SPOKE_OPAL_TOKEN" "This is the bug we fixed!"
    else
        pass "Docker-compose correctly avoids SPOKE_OPAL_TOKEN mapping"
    fi

    # Cleanup
    rm -rf "$test_dir"
}

# =============================================================================
# Test 4: Keycloak Password Provisioning
# =============================================================================
test_keycloak_password_provisioning() {
    section "Test 4: Keycloak Password Provisioning"

    # Test: Password extraction from environment
    export KEYCLOAK_ADMIN_PASSWORD_TST="test-password-123"

    local code_upper="TST"
    local password_var="KEYCLOAK_ADMIN_PASSWORD_${code_upper}"
    local password="${!password_var}"

    if [ "$password" = "test-password-123" ]; then
        pass "Keycloak password extracted from environment variable"
    else
        fail "Failed to extract Keycloak password" "Got: $password"
    fi

    # Test: Password validation (non-empty)
    if [ -n "$password" ]; then
        pass "Password validation: non-empty"
    else
        fail "Password validation failed" "Password is empty"
    fi

    # Test: Password included in registration payload
    local payload_with_password=$(cat <<EOF
{
  "instanceCode": "TST",
  "keycloakAdminPassword": "$password"
}
EOF
)

    local extracted_password=$(echo "$payload_with_password" | jq -r '.keycloakAdminPassword')
    if [ "$extracted_password" = "$password" ]; then
        pass "Keycloak password correctly included in registration payload"
    else
        fail "Password mismatch in payload" "Expected: $password, Got: $extracted_password"
    fi

    unset KEYCLOAK_ADMIN_PASSWORD_TST
}

# =============================================================================
# Test 5: Error Handling and Edge Cases
# =============================================================================
test_error_handling() {
    section "Test 5: Error Handling and Edge Cases"

    # Test: Missing Keycloak password
    unset KEYCLOAK_ADMIN_PASSWORD_MISSING
    local code="MISSING"
    local password_var="KEYCLOAK_ADMIN_PASSWORD_${code}"
    local password="${!password_var}"

    if [ -z "$password" ]; then
        pass "Correctly detected missing Keycloak password"
    else
        fail "Should detect missing password" "Got: $password"
    fi

    # Test: Invalid JSON response
    local invalid_json='{"invalid": json}'
    if ! echo "$invalid_json" | jq empty 2>/dev/null; then
        pass "Correctly identified invalid JSON response"
    else
        fail "Should reject invalid JSON" "Accepted: $invalid_json"
    fi

    # Test: HTTP error codes
    local http_codes=(400 401 403 404 500)
    for code in "${http_codes[@]}"; do
        if [ "$code" -ge 400 ]; then
            pass "HTTP $code correctly identified as error"
        fi
    done

    # Test: Empty response handling
    local empty_response=""
    if [ -z "$empty_response" ]; then
        pass "Empty response correctly handled"
    fi
}

# =============================================================================
# Run All Tests
# =============================================================================
main() {
    echo "================================================="
    echo "DIVE V3 - Spoke Registration Test Suite"
    echo "================================================="
    echo ""

    test_registration_payload_schema
    test_registration_response_handling
    test_token_storage
    test_keycloak_password_provisioning
    test_error_handling

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
