#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Clearance Claims E2E Test
# =============================================================================
# Verifies that JWT tokens contain proper clearance claims for German users
# =============================================================================

set -e

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

echo ""
echo "=================================================="
echo "  DIVE V3 Clearance Claims E2E Test"
echo "=================================================="
echo ""

# Get Keycloak port for DEU
KC_PORT=$(docker port dive-spoke-deu-keycloak 8443/tcp 2>/dev/null | cut -d: -f2)
if [ -z "$KC_PORT" ]; then
    fail "DEU Keycloak not running" "Container dive-spoke-deu-keycloak not found"
    exit 1
fi

info "Testing DEU Keycloak on port $KC_PORT"
echo ""

# Test users with expected clearances
# NOTE (2026-02-09): Only country-specific clearance stored in Keycloak
# Backend clearance-mapper.service.ts normalizes for policy evaluation (SSOT)
declare -A TEST_USERS_CLEARANCE=(
    ["testuser-deu-1"]="OFFEN"
    ["testuser-deu-2"]="VS-NUR FÜR DEN DIENSTGEBRAUCH"
    ["testuser-deu-3"]="VS-VERTRAULICH"
    ["testuser-deu-4"]="GEHEIM"
    ["testuser-deu-5"]="STRENG GEHEIM"
)

for username in "${!TEST_USERS_CLEARANCE[@]}"; do
    expected_clearance="${TEST_USERS_CLEARANCE[$username]}"

    info "Testing $username (expected: $expected_clearance)"

    # Get token (using broker client with DIVE scopes)
    # CRITICAL (2026-02-09): Use broker client which has DIVE scopes assigned as defaults
    CLIENT_SECRET=$(grep "KEYCLOAK_CLIENT_SECRET_DEU" "${SCRIPT_DIR}/../../instances/deu/.env" | cut -d= -f2)
    TOKEN_RESPONSE=$(curl -sk -X POST "https://localhost:${KC_PORT}/realms/dive-v3-broker-deu/protocol/openid-connect/token" \
        -d "client_id=dive-v3-broker-deu" \
        -d "client_secret=${CLIENT_SECRET}" \
        -d "username=$username" \
        -d "password=TestUser2025!Pilot" \
        -d "grant_type=password" 2>/dev/null)

    TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token // empty')

    if [ -z "$TOKEN" ]; then
        fail "$username: Failed to get token" "Response: $TOKEN_RESPONSE"
        continue
    fi

    # Decode token
    TOKEN_PAYLOAD=$(echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null)

    # Extract claims
    CLEARANCE=$(echo "$TOKEN_PAYLOAD" | jq -r '.clearance // empty')
    COUNTRY=$(echo "$TOKEN_PAYLOAD" | jq -r '.countryOfAffiliation // empty')
    UNIQUE_ID=$(echo "$TOKEN_PAYLOAD" | jq -r '.uniqueID // empty')

    # Verify country-specific clearance exists
    if [ -z "$CLEARANCE" ]; then
        fail "$username: Clearance claim missing" "Token payload: $TOKEN_PAYLOAD"
        continue
    fi

    # Verify country-specific clearance value
    if [ "$CLEARANCE" != "$expected_clearance" ]; then
        fail "$username: Wrong clearance" "Expected: $expected_clearance, Got: $CLEARANCE"
        continue
    fi

    # Verify country
    if [ "$COUNTRY" != "DEU" ]; then
        fail "$username: Wrong country" "Expected: DEU, Got: $COUNTRY"
        continue
    fi

    # Verify uniqueID
    if [ -z "$UNIQUE_ID" ]; then
        fail "$username: uniqueID claim missing" "Token payload: $TOKEN_PAYLOAD"
        continue
    fi

    pass "$username: All claims valid (clearance=$CLEARANCE, country=$COUNTRY, uniqueID=$UNIQUE_ID)"
done

echo ""
echo "=================================================="
echo "  Test Summary"
echo "=================================================="
echo -e "  Total:  $TESTS_RUN"
echo -e "  ${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "  ${RED}Failed: $TESTS_FAILED${NC}"
echo "=================================================="
echo ""

if [ $TESTS_FAILED -gt 0 ]; then
    exit 1
fi

exit 0
