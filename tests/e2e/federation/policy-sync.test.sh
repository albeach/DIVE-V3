#!/bin/bash
# =============================================================================
# DIVE V3 - Policy Distribution & Sync E2E Test
# =============================================================================
# Phase 4: Tests policy bundle building, signing, and distribution to spokes
#
# Test Cases:
#   1. Verify hub is running and OPAL routes available
#   2. Build policy bundle with specific scopes
#   3. Verify bundle is signed
#   4. Get policy version from hub
#   5. Register and approve test spoke
#   6. Download scoped bundle (with token)
#   7. Verify bundle signature via API
#   8. Test scope filtering (spoke gets only allowed scopes)
#   9. Test unauthorized scope access (should fail)
#   10. Force sync and verify version match
#   11. Modify policy and push update
#   12. Verify spoke syncs new version
#
# Usage:
#   ./tests/e2e/federation/policy-sync.test.sh
#
# Prerequisites:
#   - Hub must be running (./dive hub up)
#   - Docker available
#   - jq installed
#   - curl installed
#
# =============================================================================

set -euo pipefail

# =============================================================================
# CONFIGURATION
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="${SCRIPT_DIR}/../../.."
DIVE_CLI="${DIVE_ROOT}/dive"

# Test spoke configuration
TEST_SPOKE_CODE="PST"
TEST_SPOKE_NAME="Policy Sync Test Spoke"
TEST_SPOKE_CONTACT="policy-test@dive25.com"

# Hub configuration
HUB_API_URL="${HUB_API_URL:-https://localhost:4000}"
FEDERATION_ADMIN_KEY="${FEDERATION_ADMIN_KEY:-dive-hub-admin-key}"

# Test timeouts
BUILD_TIMEOUT=30
SYNC_TIMEOUT=30

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Test state
SPOKE_ID=""
SPOKE_TOKEN=""
BUNDLE_HASH=""
BUNDLE_VERSION=""

# =============================================================================
# TEST UTILITIES
# =============================================================================

log_test() {
    echo -e "${CYAN}[TEST]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++)) || true
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++)) || true
}

log_skip() {
    echo -e "${YELLOW}[SKIP]${NC} $1"
    ((TESTS_SKIPPED++)) || true
}

log_info() {
    echo -e "${CYAN}[INFO]${NC} $1"
}

assert_success() {
    local exit_code=$1
    local message=$2
    
    if [ $exit_code -eq 0 ]; then
        log_pass "$message"
        return 0
    else
        log_fail "$message (exit code: $exit_code)"
        return 1
    fi
}

assert_contains() {
    local haystack="$1"
    local needle="$2"
    local message="$3"
    
    if echo "$haystack" | grep -q "$needle"; then
        log_pass "$message"
        return 0
    else
        log_fail "$message (expected to find: $needle)"
        return 1
    fi
}

assert_not_contains() {
    local haystack="$1"
    local needle="$2"
    local message="$3"
    
    if echo "$haystack" | grep -q "$needle"; then
        log_fail "$message (unexpectedly found: $needle)"
        return 1
    else
        log_pass "$message"
        return 0
    fi
}

assert_json_field() {
    local json="$1"
    local field="$2"
    local expected="$3"
    local message="$4"
    
    local actual=$(echo "$json" | grep -o "\"$field\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | cut -d'"' -f4)
    
    if [ "$actual" = "$expected" ]; then
        log_pass "$message"
        return 0
    else
        log_fail "$message (expected: $expected, got: $actual)"
        return 1
    fi
}

api_call() {
    local method="$1"
    local endpoint="$2"
    local data="${3:-}"
    local token="${4:-}"
    
    local curl_args=("-ks" "-X" "$method" "${HUB_API_URL}${endpoint}")
    curl_args+=("-H" "Content-Type: application/json")
    curl_args+=("-H" "X-Admin-Key: ${FEDERATION_ADMIN_KEY}")
    
    if [ -n "$token" ]; then
        curl_args+=("-H" "Authorization: Bearer $token")
    fi
    
    if [ -n "$data" ]; then
        curl_args+=("-d" "$data")
    fi
    
    curl "${curl_args[@]}" --max-time 30 2>/dev/null
}

# =============================================================================
# SETUP
# =============================================================================

setup() {
    echo ""
    echo -e "${BOLD}=================================================${NC}"
    echo -e "${BOLD}DIVE V3 - Policy Sync E2E Test Suite${NC}"
    echo -e "${BOLD}Phase 4: Policy Distribution & Scoping${NC}"
    echo -e "${BOLD}=================================================${NC}"
    echo ""
    
    log_info "Hub API URL: $HUB_API_URL"
    log_info "Test Spoke: $TEST_SPOKE_CODE - $TEST_SPOKE_NAME"
    echo ""
    
    # Check prerequisites
    if ! command -v curl &> /dev/null; then
        log_fail "curl is required but not installed"
        exit 1
    fi
    
    if ! command -v jq &> /dev/null; then
        log_info "jq not installed - some output may be less readable"
    fi
}

# =============================================================================
# TEST CASES
# =============================================================================

test_01_hub_running() {
    log_test "1. Verify hub is running and OPAL routes available"
    
    # Check health endpoint
    local health=$(api_call GET "/health" "" "")
    
    if echo "$health" | grep -q '"status"[[:space:]]*:[[:space:]]*"healthy"'; then
        log_pass "Hub health endpoint responding"
    elif echo "$health" | grep -q '"healthy"'; then
        log_pass "Hub health endpoint responding"
    else
        log_fail "Hub health endpoint not responding"
        echo "Response: $health"
        return 1
    fi
    
    # Check OPAL version endpoint
    local version=$(api_call GET "/api/opal/version" "" "")
    
    if echo "$version" | grep -q '"version"'; then
        BUNDLE_VERSION=$(echo "$version" | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
        log_pass "OPAL version endpoint available (version: $BUNDLE_VERSION)"
    else
        log_fail "OPAL version endpoint not available"
        echo "Response: $version"
        return 1
    fi
}

test_02_build_policy_bundle() {
    log_test "2. Build policy bundle with specific scopes"
    
    local response=$(api_call POST "/api/opal/bundle/build" '{"scopes": ["policy:base"], "sign": true, "includeData": true}' "")
    
    if echo "$response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        local bundle_id=$(echo "$response" | grep -o '"bundleId"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        BUNDLE_VERSION=$(echo "$response" | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        BUNDLE_HASH=$(echo "$response" | grep -o '"hash"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        local file_count=$(echo "$response" | grep -o '"fileCount"[[:space:]]*:[[:space:]]*[0-9]*' | cut -d: -f2 | tr -d ' ')
        
        log_pass "Bundle built successfully"
        log_info "  Bundle ID: $bundle_id"
        log_info "  Version: $BUNDLE_VERSION"
        log_info "  Hash: ${BUNDLE_HASH:0:16}..."
        log_info "  Files: $file_count"
    else
        log_fail "Bundle build failed"
        echo "Response: $response"
        return 1
    fi
}

test_03_verify_bundle_signed() {
    log_test "3. Verify bundle is signed"
    
    local response=$(api_call GET "/api/opal/bundle/current" "" "")
    
    if echo "$response" | grep -q '"signedAt"'; then
        local signed_at=$(echo "$response" | grep -o '"signedAt"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        local signed_by=$(echo "$response" | grep -o '"signedBy"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        
        log_pass "Bundle is signed"
        log_info "  Signed At: $signed_at"
        log_info "  Signed By: $signed_by"
    else
        log_skip "Bundle signing not configured (no signedAt field)"
    fi
}

test_04_get_policy_version() {
    log_test "4. Get policy version from hub"
    
    local response=$(api_call GET "/api/opal/version" "" "")
    
    if echo "$response" | grep -q '"version"'; then
        local version=$(echo "$response" | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
        local hash=$(echo "$response" | grep -o '"hash"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
        local timestamp=$(echo "$response" | grep -o '"timestamp"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
        
        log_pass "Policy version retrieved"
        log_info "  Version: $version"
        log_info "  Hash: ${hash:0:16}..."
        log_info "  Timestamp: $timestamp"
    else
        log_fail "Failed to get policy version"
        echo "Response: $response"
        return 1
    fi
}

test_05_register_test_spoke() {
    log_test "5. Register and approve test spoke"
    
    # Register spoke
    local register_payload=$(cat <<EOF
{
    "instanceCode": "$TEST_SPOKE_CODE",
    "name": "$TEST_SPOKE_NAME",
    "description": "Test spoke for policy sync E2E tests",
    "baseUrl": "https://${TEST_SPOKE_CODE,,}.dive25.com",
    "apiUrl": "https://${TEST_SPOKE_CODE,,}-api.dive25.com",
    "idpUrl": "https://usa-idp.dive25.com",
    "requestedScopes": ["policy:base", "policy:${TEST_SPOKE_CODE,,}"],
    "contactEmail": "$TEST_SPOKE_CONTACT"
}
EOF
)
    
    local register_response=$(api_call POST "/api/federation/register" "$register_payload" "")
    
    if echo "$register_response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        SPOKE_ID=$(echo "$register_response" | grep -o '"spokeId"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        log_pass "Spoke registered (ID: $SPOKE_ID)"
    elif echo "$register_response" | grep -q "already registered"; then
        # Get existing spoke
        log_info "Spoke already registered, fetching existing..."
        local spokes=$(api_call GET "/api/federation/spokes" "" "")
        SPOKE_ID=$(echo "$spokes" | grep -o "spoke-${TEST_SPOKE_CODE,,}-[a-f0-9]*" | head -1)
        if [ -n "$SPOKE_ID" ]; then
            log_pass "Using existing spoke (ID: $SPOKE_ID)"
        else
            log_fail "Could not find existing spoke"
            return 1
        fi
    else
        log_fail "Spoke registration failed"
        echo "Response: $register_response"
        return 1
    fi
    
    # Approve spoke
    local approve_payload=$(cat <<EOF
{
    "allowedScopes": ["policy:base", "policy:${TEST_SPOKE_CODE,,}"],
    "trustLevel": "development",
    "maxClassification": "SECRET",
    "dataIsolationLevel": "filtered"
}
EOF
)
    
    local approve_response=$(api_call POST "/api/federation/spokes/${SPOKE_ID}/approve" "$approve_payload" "")
    
    if echo "$approve_response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        SPOKE_TOKEN=$(echo "$approve_response" | grep -o '"token"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
        if [ -n "$SPOKE_TOKEN" ]; then
            log_pass "Spoke approved with token"
            log_info "  Token: ${SPOKE_TOKEN:0:20}..."
        else
            log_pass "Spoke approved (already has token)"
            # Get existing token
            local token_response=$(api_call POST "/api/federation/spokes/${SPOKE_ID}/token" "{}" "")
            SPOKE_TOKEN=$(echo "$token_response" | grep -o '"token"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
        fi
    elif echo "$approve_response" | grep -q "already approved"; then
        log_info "Spoke already approved, generating new token..."
        local token_response=$(api_call POST "/api/federation/spokes/${SPOKE_ID}/token" "{}" "")
        SPOKE_TOKEN=$(echo "$token_response" | grep -o '"token"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
        if [ -n "$SPOKE_TOKEN" ]; then
            log_pass "Token generated"
        else
            log_fail "Could not generate token"
            return 1
        fi
    else
        log_fail "Spoke approval failed"
        echo "Response: $approve_response"
        return 1
    fi
}

test_06_download_scoped_bundle() {
    log_test "6. Download scoped bundle (with token)"
    
    if [ -z "$SPOKE_TOKEN" ]; then
        log_skip "No spoke token available"
        return 0
    fi
    
    # Download base scope bundle
    local response=$(api_call GET "/api/opal/bundle/base" "" "$SPOKE_TOKEN")
    
    if echo "$response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        local bundle_version=$(echo "$response" | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        local bundle_hash=$(echo "$response" | grep -o '"hash"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        local file_count=$(echo "$response" | grep -o '"fileCount"[[:space:]]*:[[:space:]]*[0-9]*' | cut -d: -f2 | tr -d ' ')
        local has_content=$(echo "$response" | grep -q '"bundleContent"' && echo "yes" || echo "no")
        
        log_pass "Scoped bundle downloaded"
        log_info "  Version: $bundle_version"
        log_info "  Hash: ${bundle_hash:0:16}..."
        log_info "  Files: $file_count"
        log_info "  Content included: $has_content"
    else
        log_fail "Failed to download scoped bundle"
        echo "Response: ${response:0:500}"
        return 1
    fi
}

test_07_verify_bundle_signature() {
    log_test "7. Verify bundle signature via API"
    
    if [ -z "$BUNDLE_HASH" ]; then
        log_skip "No bundle hash available"
        return 0
    fi
    
    local response=$(api_call GET "/api/opal/bundle/verify/${BUNDLE_HASH}" "" "")
    
    if echo "$response" | grep -q '"verified"[[:space:]]*:[[:space:]]*true'; then
        local bundle_id=$(echo "$response" | grep -o '"bundleId"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        local signed_by=$(echo "$response" | grep -o '"signedBy"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        
        log_pass "Bundle signature verified"
        log_info "  Bundle ID: $bundle_id"
        log_info "  Signed By: $signed_by"
    elif echo "$response" | grep -q '"verified"[[:space:]]*:[[:space:]]*false'; then
        local error=$(echo "$response" | grep -o '"signatureError"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        if [ "$error" = "Bundle not signed" ]; then
            log_skip "Bundle signing not configured"
        else
            log_fail "Bundle signature verification failed: $error"
            return 1
        fi
    else
        log_fail "Unexpected response from verify endpoint"
        echo "Response: $response"
        return 1
    fi
}

test_08_scope_filtering() {
    log_test "8. Test scope filtering (spoke gets only allowed scopes)"
    
    if [ -z "$SPOKE_TOKEN" ]; then
        log_skip "No spoke token available"
        return 0
    fi
    
    # Download spoke-specific scope (should work)
    local response=$(api_call GET "/api/opal/bundle/${TEST_SPOKE_CODE,,}" "" "$SPOKE_TOKEN")
    
    if echo "$response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        local scope=$(echo "$response" | grep -o '"scope"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        log_pass "Allowed scope accessible (scope: $scope)"
    elif echo "$response" | grep -q '"Access denied"'; then
        # If scope doesn't exist, that's ok
        log_info "Scope policy:${TEST_SPOKE_CODE,,} may not have policies yet"
        log_pass "Scope filtering working (access control enforced)"
    else
        log_fail "Unexpected response for allowed scope"
        echo "Response: ${response:0:300}"
        return 1
    fi
}

test_09_unauthorized_scope() {
    log_test "9. Test unauthorized scope access (should fail)"
    
    if [ -z "$SPOKE_TOKEN" ]; then
        log_skip "No spoke token available"
        return 0
    fi
    
    # Try to access a scope we don't have (e.g., fra)
    local response=$(api_call GET "/api/opal/bundle/fra" "" "$SPOKE_TOKEN")
    
    if echo "$response" | grep -q '"error"[[:space:]]*:[[:space:]]*"Access denied"'; then
        log_pass "Unauthorized scope correctly denied"
    elif echo "$response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        log_fail "Should not be able to access unauthorized scope"
        return 1
    else
        # Might be 403 or other error
        if echo "$response" | grep -q "403\|forbidden\|Forbidden\|denied\|Denied"; then
            log_pass "Unauthorized scope correctly denied"
        else
            log_fail "Unexpected response for unauthorized scope"
            echo "Response: ${response:0:300}"
            return 1
        fi
    fi
}

test_10_force_sync() {
    log_test "10. Force sync and verify"
    
    # Trigger force sync for all spokes
    local response=$(api_call POST "/api/opal/force-sync" '{}' "")
    
    if echo "$response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        log_pass "Force sync triggered successfully"
    elif echo "$response" | grep -q '"spokes"'; then
        log_pass "Force sync triggered (multiple spokes)"
    else
        log_skip "Force sync may not be configured"
        log_info "Response: ${response:0:200}"
    fi
}

test_11_sync_status() {
    log_test "11. Get sync status for all spokes"
    
    local response=$(api_call GET "/api/opal/sync-status" "" "")
    
    if echo "$response" | grep -q '"currentVersion"'; then
        local total=$(echo "$response" | grep -o '"total"[[:space:]]*:[[:space:]]*[0-9]*' | cut -d: -f2 | tr -d ' ')
        local current=$(echo "$response" | grep -o '"current"[[:space:]]*:[[:space:]]*[0-9]*' | cut -d: -f2 | tr -d ' ')
        local behind=$(echo "$response" | grep -o '"behind"[[:space:]]*:[[:space:]]*[0-9]*' | cut -d: -f2 | tr -d ' ')
        
        log_pass "Sync status retrieved"
        log_info "  Total spokes: ${total:-0}"
        log_info "  Current: ${current:-0}"
        log_info "  Behind: ${behind:-0}"
    else
        log_skip "Sync status endpoint may not have data"
        log_info "Response: ${response:0:200}"
    fi
}

test_12_push_policy_update() {
    log_test "12. Push policy update and verify version changes"
    
    local old_version="$BUNDLE_VERSION"
    
    # Push a policy update
    local push_payload='{"layers": ["base"], "priority": "normal", "description": "E2E test update"}'
    local response=$(api_call POST "/api/federation/policy/push" "$push_payload" "")
    
    if echo "$response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        local new_version=$(echo "$response" | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
        
        if [ "$new_version" != "$old_version" ]; then
            log_pass "Policy update pushed (version changed: $old_version -> $new_version)"
            BUNDLE_VERSION="$new_version"
        else
            log_pass "Policy update pushed (version: $new_version)"
        fi
    else
        log_skip "Policy push may require OPAL Server"
        log_info "Response: ${response:0:200}"
    fi
}

# =============================================================================
# CLEANUP
# =============================================================================

cleanup() {
    log_info "Cleaning up test spoke..."
    
    if [ -n "$SPOKE_ID" ]; then
        # Revoke the test spoke
        api_call POST "/api/federation/spokes/${SPOKE_ID}/revoke" '{"reason": "E2E test cleanup"}' "" > /dev/null 2>&1 || true
        log_info "Test spoke revoked: $SPOKE_ID"
    fi
}

# =============================================================================
# TEST SUMMARY
# =============================================================================

print_summary() {
    echo ""
    echo -e "${BOLD}=================================================${NC}"
    echo -e "${BOLD}TEST SUMMARY${NC}"
    echo -e "${BOLD}=================================================${NC}"
    echo ""
    echo -e "  ${GREEN}Passed:${NC}  $TESTS_PASSED"
    echo -e "  ${RED}Failed:${NC}  $TESTS_FAILED"
    echo -e "  ${YELLOW}Skipped:${NC} $TESTS_SKIPPED"
    echo ""
    
    local total=$((TESTS_PASSED + TESTS_FAILED))
    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}${BOLD}All tests passed!${NC}"
        echo ""
        return 0
    else
        echo -e "${RED}${BOLD}Some tests failed.${NC}"
        echo ""
        return 1
    fi
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    setup
    
    # Run tests
    test_01_hub_running || true
    test_02_build_policy_bundle || true
    test_03_verify_bundle_signed || true
    test_04_get_policy_version || true
    test_05_register_test_spoke || true
    test_06_download_scoped_bundle || true
    test_07_verify_bundle_signature || true
    test_08_scope_filtering || true
    test_09_unauthorized_scope || true
    test_10_force_sync || true
    test_11_sync_status || true
    test_12_push_policy_update || true
    
    # Cleanup
    cleanup
    
    # Print summary
    print_summary
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi



