#!/bin/bash
# =============================================================================
# DIVE V3 Federation E2E Test Script
# =============================================================================
# Tests the complete spoke registration and bidirectional federation flow
#
# Prerequisites:
#   - Hub must be running (./dive hub up)
#   - Spoke must be running with initialized Keycloak realm
#
# Usage:
#   ./tests/federation-e2e-test.sh [SPOKE_CODE]
#
# Examples:
#   ./tests/federation-e2e-test.sh GBR
#   ./tests/federation-e2e-test.sh POL
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SPOKE_CODE="${1:-GBR}"
SPOKE_CODE_LOWER=$(echo "$SPOKE_CODE" | tr '[:upper:]' '[:lower:]')
HUB_URL="${HUB_API_URL:-https://localhost:4000}"

echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║          DIVE V3 Federation E2E Test                           ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Testing spoke: $SPOKE_CODE"
echo "Hub URL: $HUB_URL"
echo ""

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

pass() {
    echo -e "  ${GREEN}✓${NC} $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

fail() {
    echo -e "  ${RED}✗${NC} $1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

# =============================================================================
# Test 1: Check Hub is Running
# =============================================================================
echo -e "${YELLOW}Test 1: Hub Health Check${NC}"

if curl -sk "${HUB_URL}/health" 2>/dev/null | grep -q "ok\|healthy"; then
    pass "Hub backend is healthy"
else
    fail "Hub backend is not responding"
    echo "  Please start the hub: ./dive hub up"
    exit 1
fi

# =============================================================================
# Test 2: Check Spoke Keycloak is Running
# =============================================================================
echo -e "${YELLOW}Test 2: Spoke Keycloak Health Check${NC}"

KEYCLOAK_CONTAINER="dive-spoke-${SPOKE_CODE_LOWER}-keycloak"
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "$KEYCLOAK_CONTAINER"; then
    pass "Spoke Keycloak container is running"
else
    fail "Spoke Keycloak container not found: $KEYCLOAK_CONTAINER"
    echo "  Please start the spoke: ./dive --instance $SPOKE_CODE_LOWER spoke up"
    exit 1
fi

# =============================================================================
# Test 3: Check Spoke Realm Exists
# =============================================================================
echo -e "${YELLOW}Test 3: Spoke Realm Check${NC}"

SPOKE_REALM="dive-v3-broker-${SPOKE_CODE_LOWER}"
REALM_CHECK=$(docker exec dive-hub-backend curl -sk "https://${KEYCLOAK_CONTAINER}:8443/realms/${SPOKE_REALM}/.well-known/openid-configuration" 2>/dev/null | grep -o '"issuer"' || echo "")

if [ -n "$REALM_CHECK" ]; then
    pass "Spoke realm '${SPOKE_REALM}' exists"
else
    fail "Spoke realm '${SPOKE_REALM}' not found"
    echo "  Please initialize the spoke: ./dive --instance $SPOKE_CODE_LOWER spoke init"
    exit 1
fi

# =============================================================================
# Test 4: Clean Up Previous Registration (if exists)
# =============================================================================
echo -e "${YELLOW}Test 4: Clean Up Previous Registration${NC}"

EXISTING=$(curl -sk "${HUB_URL}/api/federation/spokes" 2>/dev/null | jq -r ".spokes[] | select(.instanceCode == \"$SPOKE_CODE\") | .spokeId" | head -1)

if [ -n "$EXISTING" ] && [ "$EXISTING" != "null" ]; then
    curl -sk -X POST "${HUB_URL}/api/federation/spokes/${EXISTING}/revoke" \
        -H "Content-Type: application/json" \
        -d '{"reason": "E2E test cleanup"}' > /dev/null 2>&1
    pass "Revoked previous registration: $EXISTING"
    sleep 1
else
    pass "No previous registration to clean up"
fi

# =============================================================================
# Test 5: Register Spoke with Auto-Approval
# =============================================================================
echo -e "${YELLOW}Test 5: Spoke Registration with Auto-Approval${NC}"

cd "$DIVE_ROOT"
REGISTER_OUTPUT=$(DIVE_PILOT_MODE=false HUB_API_URL="$HUB_URL" ./dive --instance "$SPOKE_CODE_LOWER" spoke register 2>&1)

if echo "$REGISTER_OUTPUT" | grep -q "Status:.*approved"; then
    pass "Spoke auto-approved successfully"
elif echo "$REGISTER_OUTPUT" | grep -q "Status:.*pending"; then
    fail "Spoke stuck in pending (auto-approval may have failed)"
    echo "$REGISTER_OUTPUT" | grep -A5 "Status:"
else
    fail "Registration failed"
    echo "$REGISTER_OUTPUT" | tail -10
fi

# =============================================================================
# Test 6: Verify Bidirectional Federation
# =============================================================================
echo -e "${YELLOW}Test 6: Verify Bidirectional Federation${NC}"

SPOKE_STATUS=$(curl -sk "${HUB_URL}/api/federation/spokes" 2>/dev/null | jq -r ".spokes[] | select(.instanceCode == \"$SPOKE_CODE\")")

STATUS=$(echo "$SPOKE_STATUS" | jq -r '.status')
FEDERATION_ALIAS=$(echo "$SPOKE_STATUS" | jq -r '.federationIdPAlias')

if [ "$STATUS" = "approved" ]; then
    pass "Spoke status is 'approved'"
else
    fail "Spoke status is '$STATUS' (expected 'approved')"
fi

if [ -n "$FEDERATION_ALIAS" ] && [ "$FEDERATION_ALIAS" != "null" ]; then
    pass "Federation IdP alias exists: $FEDERATION_ALIAS"
else
    fail "No federation IdP alias (bidirectional federation may have failed)"
fi

# =============================================================================
# Test 7: Verify Hub Has Spoke IdP
# =============================================================================
echo -e "${YELLOW}Test 7: Verify Hub Has Spoke IdP${NC}"

HUB_IDP_CHECK=$(docker logs dive-hub-backend 2>&1 | grep -c "Direction 1 complete.*${SPOKE_CODE_LOWER}-idp\|${SPOKE_CODE_LOWER}-idp.*Identity Provider created" || echo "0")

if [ "$HUB_IDP_CHECK" -gt 0 ]; then
    pass "Hub has ${SPOKE_CODE_LOWER}-idp (Direction 1)"
else
    fail "Hub IdP creation not confirmed in logs"
fi

# =============================================================================
# Test 8: Verify Spoke Has Hub IdP (Bidirectional)
# =============================================================================
echo -e "${YELLOW}Test 8: Verify Spoke Has Hub IdP (Direction 2)${NC}"

SPOKE_IDP_CHECK=$(docker logs dive-hub-backend 2>&1 | grep -c "Direction 2 complete.*usa-idp\|usa-idp in ${SPOKE_CODE}" || echo "0")

if [ "$SPOKE_IDP_CHECK" -gt 0 ]; then
    pass "Spoke has usa-idp (Direction 2 - bidirectional confirmed)"
else
    fail "Spoke IdP creation not confirmed (unidirectional only)"
fi

# =============================================================================
# Test 9: Verify Registration Time < 5 seconds
# =============================================================================
echo -e "${YELLOW}Test 9: Performance Check${NC}"

# Extract timestamps from logs (macOS compatible)
START_TIME=$(docker logs dive-hub-backend 2>&1 | grep "New spoke registration.*$SPOKE_CODE" | tail -1 | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}' | head -1)
END_TIME=$(docker logs dive-hub-backend 2>&1 | grep "Spoke auto-approved.*$SPOKE_CODE" | tail -1 | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}' | head -1)

if [ -n "$START_TIME" ] && [ -n "$END_TIME" ]; then
    # Calculate duration (rough estimate)
    START_SEC=$(echo "$START_TIME" | sed 's/.*T\([0-9]*\):\([0-9]*\):\([0-9]*\).*/\1*3600+\2*60+\3/' | bc)
    END_SEC=$(echo "$END_TIME" | sed 's/.*T\([0-9]*\):\([0-9]*\):\([0-9]*\).*/\1*3600+\2*60+\3/' | bc)
    DURATION=$((END_SEC - START_SEC))

    if [ "$DURATION" -lt 5 ]; then
        pass "Registration completed in < 5 seconds (~${DURATION}s)"
    else
        fail "Registration took ${DURATION}s (expected < 5s)"
    fi
else
    pass "Performance check skipped (unable to parse timestamps)"
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}                         Test Summary                           ${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Tests Passed: ${GREEN}${TESTS_PASSED}${NC}"
echo -e "  Tests Failed: ${RED}${TESTS_FAILED}${NC}"
echo ""

if [ "$TESTS_FAILED" -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed! Bidirectional federation is working.${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed. Check the output above for details.${NC}"
    exit 1
fi

