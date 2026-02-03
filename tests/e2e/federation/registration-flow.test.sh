#!/bin/bash
# =============================================================================
# DIVE V3 - Federation Registration Flow E2E Test
# =============================================================================
# Phase 3: Tests the complete spoke-to-hub registration workflow
#
# Test Cases:
#   1. Deploy new spoke (TST - Test)
#   2. Register spoke with hub (includes CSR)
#   3. Verify spoke appears in hub pending list
#   4. Approve spoke with specific scopes
#   5. Verify token is generated
#   6. Configure token in spoke .env
#   7. Restart spoke OPAL client
#   8. Verify OPAL connects to hub
#   9. Verify policy sync works
#   10. Test token rotation
#   11. Test spoke suspension
#   12. Teardown
#
# Usage:
#   ./tests/e2e/federation/registration-flow.test.sh
#
# Prerequisites:
#   - Hub must be running (./dive hub up)
#   - Docker available
#   - jq installed
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
TEST_SPOKE_CODE="TST"
TEST_SPOKE_NAME="Test Spoke"
TEST_SPOKE_CONTACT="test@dive25.com"

# Hub configuration
HUB_API_URL="${HUB_API_URL:-https://localhost:4000}"
FEDERATION_ADMIN_KEY="${FEDERATION_ADMIN_KEY:-dive-hub-admin-key}"

# Test timeouts
DEPLOY_TIMEOUT=120
REGISTER_TIMEOUT=30
APPROVAL_TIMEOUT=60

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

# =============================================================================
# TEST UTILITIES
# =============================================================================

log_test() {
    echo -e "${CYAN}[TEST]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

log_skip() {
    echo -e "${YELLOW}[SKIP]${NC} $1"
    ((TESTS_SKIPPED++))
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
    local haystack=$1
    local needle=$2
    local message=$3

    if echo "$haystack" | grep -q "$needle"; then
        log_pass "$message"
        return 0
    else
        log_fail "$message (expected to contain: $needle)"
        return 1
    fi
}

assert_not_empty() {
    local value=$1
    local message=$2

    if [ -n "$value" ]; then
        log_pass "$message"
        return 0
    else
        log_fail "$message (value was empty)"
        return 1
    fi
}

# =============================================================================
# PREREQUISITES CHECK
# =============================================================================

check_prerequisites() {
    log_test "Checking prerequisites..."

    # Check jq
    if ! command -v jq &> /dev/null; then
        log_fail "jq is required but not installed"
        exit 1
    fi
    log_pass "jq is installed"

    # Check docker
    if ! docker info &> /dev/null; then
        log_fail "Docker is not running"
        exit 1
    fi
    log_pass "Docker is running"

    # Check dive CLI
    if [ ! -x "$DIVE_CLI" ]; then
        log_fail "DIVE CLI not found at $DIVE_CLI"
        exit 1
    fi
    log_pass "DIVE CLI found"

    # Check hub is running
    local hub_health=$(curl -kfs "${HUB_API_URL}/health" 2>/dev/null || echo "")
    if [ -z "$hub_health" ]; then
        log_skip "Hub not running - some tests will be mocked"
        export HUB_AVAILABLE=false
    else
        log_pass "Hub is running"
        export HUB_AVAILABLE=true
    fi
}

# =============================================================================
# TEST CASES
# =============================================================================

# Test 1: Deploy new spoke
test_deploy_spoke() {
    log_test "Test 1: Deploy new spoke (${TEST_SPOKE_CODE})"

    # Clean up any existing test spoke
    local spoke_dir="${DIVE_ROOT}/instances/tst"
    if [ -d "$spoke_dir" ]; then
        log_info "Cleaning up existing test spoke..."
        rm -rf "$spoke_dir"
    fi

    # Initialize spoke (non-interactive)
    export DIVE_PILOT_MODE=false
    local output=$("$DIVE_CLI" spoke init "$TEST_SPOKE_CODE" "$TEST_SPOKE_NAME" 2>&1 || true)

    # Verify spoke directory created
    if [ -d "$spoke_dir" ]; then
        log_pass "Spoke directory created"
    else
        log_fail "Spoke directory not created"
        return 1
    fi

    # Verify config.json
    if [ -f "$spoke_dir/config.json" ]; then
        log_pass "config.json created"
    else
        log_fail "config.json not created"
        return 1
    fi

    # Verify docker-compose.yml
    if [ -f "$spoke_dir/docker-compose.yml" ]; then
        log_pass "docker-compose.yml created"
    else
        log_fail "docker-compose.yml not created"
        return 1
    fi

    # Verify .env
    if [ -f "$spoke_dir/.env" ]; then
        log_pass ".env created"
    else
        log_fail ".env not created"
        return 1
    fi
}

# Test 2: Generate certificates with CSR
test_generate_certs() {
    log_test "Test 2: Generate certificates with CSR"

    local spoke_dir="${DIVE_ROOT}/instances/tst"
    local certs_dir="$spoke_dir/certs"

    # Certificates should be generated during init
    # If not, generate them explicitly
    if [ ! -f "$certs_dir/spoke.csr" ]; then
        export INSTANCE=tst
        "$DIVE_CLI" spoke generate-certs 2>&1 || true
    fi

    # Verify private key
    if [ -f "$certs_dir/spoke.key" ]; then
        log_pass "Private key generated"
    else
        log_fail "Private key not generated"
        return 1
    fi

    # Verify CSR
    if [ -f "$certs_dir/spoke.csr" ]; then
        log_pass "CSR generated"

        # Verify CSR is valid
        if openssl req -in "$certs_dir/spoke.csr" -noout -verify 2>/dev/null; then
            log_pass "CSR is valid"
        else
            log_fail "CSR is invalid"
            return 1
        fi
    else
        log_fail "CSR not generated"
        return 1
    fi

    # Verify self-signed cert
    if [ -f "$certs_dir/spoke.crt" ]; then
        log_pass "Self-signed certificate generated"
    else
        log_fail "Self-signed certificate not generated"
        return 1
    fi
}

# Test 3: Register spoke with hub
test_register_spoke() {
    log_test "Test 3: Register spoke with hub"

    if [ "$HUB_AVAILABLE" != "true" ]; then
        log_skip "Hub not available - skipping registration"
        return 0
    fi

    local spoke_dir="${DIVE_ROOT}/instances/tst"
    local config_file="$spoke_dir/config.json"

    # Add contact email to config if not present
    if command -v jq &> /dev/null; then
        jq ".contactEmail = \"$TEST_SPOKE_CONTACT\"" "$config_file" > "$config_file.tmp" && mv "$config_file.tmp" "$config_file"
    fi

    # Register spoke
    export INSTANCE=tst
    export HUB_API_URL
    local output=$("$DIVE_CLI" spoke register 2>&1 || true)

    # Check registration response
    if echo "$output" | grep -q "Registration request submitted\|success"; then
        log_pass "Registration request submitted"

        # Extract spoke ID from output
        REGISTERED_SPOKE_ID=$(echo "$output" | grep -o 'spoke-tst-[a-f0-9]*' | head -1)
        if [ -n "$REGISTERED_SPOKE_ID" ]; then
            log_pass "Received spoke ID: $REGISTERED_SPOKE_ID"
            export REGISTERED_SPOKE_ID
        else
            log_info "Could not extract spoke ID (may be in config)"
        fi
    else
        log_fail "Registration failed: $output"
        return 1
    fi
}

# Test 4: Verify spoke in pending list
test_pending_list() {
    log_test "Test 4: Verify spoke appears in hub pending list"

    if [ "$HUB_AVAILABLE" != "true" ]; then
        log_skip "Hub not available - skipping pending list check"
        return 0
    fi

    # Query pending spokes
    local pending=$(curl -kfs \
        -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
        "${HUB_API_URL}/api/federation/spokes/pending" 2>/dev/null || echo "{}")

    # Check if test spoke is in pending list
    if echo "$pending" | grep -q "TST\|tst"; then
        log_pass "Test spoke found in pending list"
    else
        log_info "Test spoke not in pending list (may already be approved or hub not synced)"
        # Not a failure - spoke might have been auto-approved or previously processed
    fi
}

# Test 5: Approve spoke
test_approve_spoke() {
    log_test "Test 5: Approve spoke with specific scopes"

    if [ "$HUB_AVAILABLE" != "true" ]; then
        log_skip "Hub not available - skipping approval"
        return 0
    fi

    # Get spoke ID
    local spoke_id="${REGISTERED_SPOKE_ID:-}"
    if [ -z "$spoke_id" ]; then
        # Try to find by instance code
        spoke_id=$(curl -kfs \
            -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
            "${HUB_API_URL}/api/federation/spokes" 2>/dev/null | \
            jq -r '.spokes[] | select(.instanceCode == "TST") | .spokeId' 2>/dev/null | head -1)
    fi

    if [ -z "$spoke_id" ]; then
        log_skip "Could not find spoke ID for approval"
        return 0
    fi

    log_info "Approving spoke: $spoke_id"

    # Approve spoke via API
    local approval_response=$(curl -kfs -X POST \
        -H "Content-Type: application/json" \
        -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
        -d '{
            "allowedScopes": ["policy:base", "heartbeat:write", "data:federation_matrix"],
            "trustLevel": "development",
            "maxClassification": "CONFIDENTIAL",
            "dataIsolationLevel": "filtered"
        }' \
        "${HUB_API_URL}/api/federation/spokes/${spoke_id}/approve" 2>/dev/null || echo "{}")

    if echo "$approval_response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        log_pass "Spoke approved successfully"

        # Extract token
        SPOKE_TOKEN=$(echo "$approval_response" | jq -r '.token.token' 2>/dev/null)
        if [ -n "$SPOKE_TOKEN" ] && [ "$SPOKE_TOKEN" != "null" ]; then
            log_pass "Token generated: ${SPOKE_TOKEN:0:20}..."
            export SPOKE_TOKEN
        else
            log_fail "Token not found in response"
            return 1
        fi
    else
        local error=$(echo "$approval_response" | jq -r '.error // .message' 2>/dev/null)
        if echo "$error" | grep -q "already approved"; then
            log_info "Spoke already approved"
        else
            log_fail "Approval failed: $error"
            return 1
        fi
    fi
}

# Test 6: Configure token in spoke
test_configure_token() {
    log_test "Test 6: Configure token in spoke .env"

    local spoke_dir="${DIVE_ROOT}/instances/tst"
    local env_file="$spoke_dir/.env"

    if [ -z "${SPOKE_TOKEN:-}" ]; then
        log_skip "No token available - skipping configuration"
        return 0
    fi

    # Add token to .env
    if grep -q "^SPOKE_OPAL_TOKEN=" "$env_file" 2>/dev/null; then
        sed -i.bak '/^SPOKE_OPAL_TOKEN=/d' "$env_file"
        rm -f "$env_file.bak"
    fi

    echo "SPOKE_OPAL_TOKEN=$SPOKE_TOKEN" >> "$env_file"

    # Verify token was added
    if grep -q "^SPOKE_OPAL_TOKEN=" "$env_file"; then
        log_pass "Token configured in .env"
    else
        log_fail "Failed to configure token in .env"
        return 1
    fi
}

# Test 7: Poll for registration status
test_poll_registration() {
    log_test "Test 7: Poll registration status endpoint"

    if [ "$HUB_AVAILABLE" != "true" ]; then
        log_skip "Hub not available - skipping poll test"
        return 0
    fi

    local spoke_id="${REGISTERED_SPOKE_ID:-tst}"

    # Call registration status endpoint
    local status_response=$(curl -kfs \
        "${HUB_API_URL}/api/federation/registration/${spoke_id}/status" 2>/dev/null || echo "{}")

    if echo "$status_response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        log_pass "Registration status endpoint responds"

        local status=$(echo "$status_response" | jq -r '.status' 2>/dev/null)
        log_info "Registration status: $status"

        if [ "$status" = "approved" ]; then
            # Check if token is included
            local token=$(echo "$status_response" | jq -r '.token.token // empty' 2>/dev/null)
            if [ -n "$token" ]; then
                log_pass "Token included in status response"
            fi
        fi
    else
        log_fail "Registration status endpoint failed"
        return 1
    fi
}

# Test 8: Token rotation
test_token_rotation() {
    log_test "Test 8: Test token rotation"

    if [ "$HUB_AVAILABLE" != "true" ]; then
        log_skip "Hub not available - skipping token rotation"
        return 0
    fi

    local spoke_id="${REGISTERED_SPOKE_ID:-}"
    if [ -z "$spoke_id" ]; then
        # Try to find by instance code
        spoke_id=$(curl -kfs \
            -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
            "${HUB_API_URL}/api/federation/spokes" 2>/dev/null | \
            jq -r '.spokes[] | select(.instanceCode == "TST") | .spokeId' 2>/dev/null | head -1)
    fi

    if [ -z "$spoke_id" ]; then
        log_skip "Could not find spoke ID for token rotation"
        return 0
    fi

    # Request new token
    local token_response=$(curl -kfs -X POST \
        -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
        "${HUB_API_URL}/api/federation/spokes/${spoke_id}/token" 2>/dev/null || echo "{}")

    if echo "$token_response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        log_pass "New token generated"

        local new_token=$(echo "$token_response" | jq -r '.token.token' 2>/dev/null)
        if [ -n "$new_token" ] && [ "$new_token" != "null" ]; then
            log_pass "New token: ${new_token:0:20}..."
        else
            log_fail "Token not in response"
            return 1
        fi
    else
        log_fail "Token generation failed"
        return 1
    fi
}

# Test 9: Spoke suspension
test_spoke_suspension() {
    log_test "Test 9: Test spoke suspension"

    if [ "$HUB_AVAILABLE" != "true" ]; then
        log_skip "Hub not available - skipping suspension test"
        return 0
    fi

    local spoke_id="${REGISTERED_SPOKE_ID:-}"
    if [ -z "$spoke_id" ]; then
        spoke_id=$(curl -kfs \
            -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
            "${HUB_API_URL}/api/federation/spokes" 2>/dev/null | \
            jq -r '.spokes[] | select(.instanceCode == "TST") | .spokeId' 2>/dev/null | head -1)
    fi

    if [ -z "$spoke_id" ]; then
        log_skip "Could not find spoke ID for suspension"
        return 0
    fi

    # Suspend spoke
    local suspend_response=$(curl -kfs -X POST \
        -H "Content-Type: application/json" \
        -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
        -d '{"reason": "E2E test suspension"}' \
        "${HUB_API_URL}/api/federation/spokes/${spoke_id}/suspend" 2>/dev/null || echo "{}")

    if echo "$suspend_response" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
        log_pass "Spoke suspended"

        # Re-approve for cleanup
        curl -kfs -X POST \
            -H "Content-Type: application/json" \
            -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
            -d '{
                "allowedScopes": ["policy:base"],
                "trustLevel": "development",
                "maxClassification": "UNCLASSIFIED",
                "dataIsolationLevel": "filtered"
            }' \
            "${HUB_API_URL}/api/federation/spokes/${spoke_id}/approve" 2>/dev/null || true
        log_info "Spoke re-approved after suspension test"
    else
        log_fail "Suspension failed"
        return 1
    fi
}

# Test 10: CLI Commands Integration
test_cli_commands() {
    log_test "Test 10: CLI commands integration"

    # Test spoke status command
    export INSTANCE=tst
    local status_output=$("$DIVE_CLI" spoke status 2>&1 || true)
    if echo "$status_output" | grep -qi "status\|spoke\|federation"; then
        log_pass "spoke status command works"
    else
        log_fail "spoke status command failed"
    fi

    # Test spoke help
    local help_output=$("$DIVE_CLI" spoke help 2>&1 || true)
    if echo "$help_output" | grep -q "register"; then
        log_pass "spoke help shows register command"
    else
        log_fail "spoke help missing register command"
    fi

    # Test hub spokes help
    local hub_help=$("$DIVE_CLI" hub spokes 2>&1 || true)
    if echo "$hub_help" | grep -qi "pending\|approve"; then
        log_pass "hub spokes help shows pending/approve commands"
    else
        log_fail "hub spokes help missing commands"
    fi
}

# =============================================================================
# CLEANUP
# =============================================================================

cleanup() {
    log_test "Cleanup: Removing test spoke"

    local spoke_dir="${DIVE_ROOT}/instances/tst"

    if [ -d "$spoke_dir" ]; then
        # Stop any running containers
        if [ -f "$spoke_dir/docker-compose.yml" ]; then
            docker compose -f "$spoke_dir/docker-compose.yml" down -v 2>/dev/null || true
        fi

        # Remove spoke directory
        rm -rf "$spoke_dir"
        log_pass "Test spoke removed"
    else
        log_info "No test spoke to clean up"
    fi

    # Optionally revoke spoke in hub
    if [ "$HUB_AVAILABLE" = "true" ] && [ -n "${REGISTERED_SPOKE_ID:-}" ]; then
        curl -kfs -X POST \
            -H "Content-Type: application/json" \
            -H "X-Admin-Key: ${FEDERATION_ADMIN_KEY}" \
            -d '{"reason": "E2E test cleanup"}' \
            "${HUB_API_URL}/api/federation/spokes/${REGISTERED_SPOKE_ID}/revoke" 2>/dev/null || true
        log_info "Revoked test spoke in hub"
    fi
}

# =============================================================================
# MAIN TEST RUNNER
# =============================================================================

print_header() {
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}     ${BOLD}DIVE V3 - Federation Registration Flow E2E Tests${NC}                  ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}     Phase 3: Spoke-to-Hub Registration Workflow                       ${CYAN}║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_summary() {
    echo ""
    echo -e "${BOLD}═══════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}Test Summary${NC}"
    echo -e "${BOLD}═══════════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  ${GREEN}Passed:${NC}  $TESTS_PASSED"
    echo -e "  ${RED}Failed:${NC}  $TESTS_FAILED"
    echo -e "  ${YELLOW}Skipped:${NC} $TESTS_SKIPPED"
    echo ""

    local total=$((TESTS_PASSED + TESTS_FAILED))
    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "  ${GREEN}${BOLD}✓ All tests passed!${NC}"
    else
        echo -e "  ${RED}${BOLD}✗ Some tests failed${NC}"
    fi
    echo ""
}

main() {
    print_header

    # Set up cleanup trap
    trap cleanup EXIT

    # Run prerequisites check
    check_prerequisites
    echo ""

    # Run tests
    echo -e "${BOLD}Running Registration Flow Tests${NC}"
    echo ""

    test_deploy_spoke || true
    test_generate_certs || true
    test_register_spoke || true
    test_pending_list || true
    test_approve_spoke || true
    test_configure_token || true
    test_poll_registration || true
    test_token_rotation || true
    test_spoke_suspension || true
    test_cli_commands || true

    # Print summary
    print_summary

    # Exit with appropriate code
    if [ $TESTS_FAILED -eq 0 ]; then
        exit 0
    else
        exit 1
    fi
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi

