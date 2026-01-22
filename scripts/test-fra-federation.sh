#!/usr/local/bin/bash
# =============================================================================
# FRA Federation Comprehensive Test Script
# =============================================================================
# Tests all aspects of FRA spoke federation including:
# - Secret synchronization
# - Frontend/Backend health
# - Keycloak client configuration
# - Bidirectional SSO readiness
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

echo -e "${BOLD}${CYAN}"
echo "═══════════════════════════════════════════════════════════"
echo "  FRA FEDERATION COMPREHENSIVE TEST"
echo "═══════════════════════════════════════════════════════════"
echo -e "${NC}"

PASSED=0
FAILED=0

test_pass() {
    echo -e "  ${GREEN}✓${NC} $1"
    PASSED=$((PASSED + 1))
}

test_fail() {
    echo -e "  ${RED}✗${NC} $1"
    FAILED=$((FAILED + 1))
}

test_header() {
    echo ""
    echo -e "${BOLD}$1${NC}"
}

# =============================================================================
# TEST 1: Container Health
# =============================================================================
test_header "1. Container Health Checks"

if docker ps --format '{{.Names}}' | grep -q "dive-spoke-fra-frontend"; then
    test_pass "FRA Frontend container running"
else
    test_fail "FRA Frontend container NOT running"
fi

if docker ps --format '{{.Names}}' | grep -q "dive-spoke-fra-keycloak"; then
    test_pass "FRA Keycloak container running"
else
    test_fail "FRA Keycloak container NOT running"
fi

if docker ps --format '{{.Names}}' | grep -q "dive-spoke-fra-backend"; then
    test_pass "FRA Backend container running"
else
    test_fail "FRA Backend container NOT running"
fi

# =============================================================================
# TEST 2: Secret Synchronization
# =============================================================================
test_header "2. Secret Synchronization Checks"

# Get frontend secret
FRONTEND_SECRET=$(docker exec dive-spoke-fra-frontend printenv AUTH_KEYCLOAK_SECRET 2>/dev/null)
if [ -n "$FRONTEND_SECRET" ]; then
    test_pass "Frontend has AUTH_KEYCLOAK_SECRET"
else
    test_fail "Frontend missing AUTH_KEYCLOAK_SECRET"
fi

# Get Keycloak admin password
KC_ADMIN_PASS=$(docker exec dive-spoke-fra-keycloak printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null)
if [ -n "$KC_ADMIN_PASS" ] && [ ${#KC_ADMIN_PASS} -gt 10 ]; then
    test_pass "Keycloak has valid admin password"
else
    test_fail "Keycloak admin password invalid"
fi

# Check if secrets match
docker exec dive-spoke-fra-keycloak /opt/keycloak/bin/kcadm.sh config credentials \
    --server http://localhost:8080 --realm master --user admin --password "$KC_ADMIN_PASS" 2>/dev/null

KC_CLIENT_SECRET=$(docker exec dive-spoke-fra-keycloak /opt/keycloak/bin/kcadm.sh \
    get clients/668bfc48-3934-4efe-8671-0a19b455e1f3/client-secret -r dive-v3-broker-fra 2>/dev/null | jq -r '.value')

if [ "$FRONTEND_SECRET" = "$KC_CLIENT_SECRET" ]; then
    test_pass "Frontend secret MATCHES Keycloak (dive-v3-broker-fra)"
else
    test_fail "Frontend secret MISMATCH (Frontend: ${FRONTEND_SECRET:0:10}..., KC: ${KC_CLIENT_SECRET:0:10}...)"
fi

# =============================================================================
# TEST 3: Keycloak Clients
# =============================================================================
test_header "3. Keycloak Client Configuration"

CLIENTS=$(docker exec dive-spoke-fra-keycloak /opt/keycloak/bin/kcadm.sh get clients \
    -r dive-v3-broker-fra --fields clientId 2>/dev/null | jq -r '.[].clientId')

for client in "dive-v3-broker-fra" "dive-v3-broker-usa" "dive-v3-broker-fra" "dive-v3-cross-border-client"; do
    if echo "$CLIENTS" | grep -q "^${client}$"; then
        test_pass "Client exists: $client"
    else
        test_fail "Client MISSING: $client"
    fi
done

# =============================================================================
# TEST 4: Identity Providers
# =============================================================================
test_header "4. Identity Provider Configuration"

IDPS=$(docker exec dive-spoke-fra-keycloak /opt/keycloak/bin/kcadm.sh \
    get identity-provider/instances -r dive-v3-broker-fra 2>/dev/null | jq -r '.[].alias')

if echo "$IDPS" | grep -q "^usa-idp$"; then
    test_pass "usa-idp configured in FRA Keycloak"

    # Check usa-idp client secret
    USA_IDP_CONFIG=$(docker exec dive-spoke-fra-keycloak /opt/keycloak/bin/kcadm.sh \
        get identity-provider/instances/usa-idp -r dive-v3-broker-fra 2>/dev/null)

    USA_IDP_CLIENT=$(echo "$USA_IDP_CONFIG" | jq -r '.config.clientId')
    if [ "$USA_IDP_CLIENT" = "dive-v3-broker-fra" ]; then
        test_pass "usa-idp uses correct client: dive-v3-broker-fra"
    else
        test_fail "usa-idp uses wrong client: $USA_IDP_CLIENT"
    fi
else
    test_fail "usa-idp NOT configured"
fi

# =============================================================================
# TEST 5: Hub Federation
# =============================================================================
test_header "5. Hub Federation Configuration"

if docker ps --format '{{.Names}}' | grep -q "dive-hub-keycloak"; then
    test_pass "Hub Keycloak running"

    # Get Hub admin password
    HUB_ADMIN_PASS=$(cat .env.hub | grep KEYCLOAK_ADMIN_PASSWORD | cut -d= -f2)
    docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh config credentials \
        --server http://localhost:8080 --realm master --user admin --password "$HUB_ADMIN_PASS" 2>/dev/null

    # Check for fra-idp in Hub
    HUB_IDPS=$(docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh \
        get identity-provider/instances -r dive-v3-broker-usa 2>/dev/null | jq -r '.[].alias')

    if echo "$HUB_IDPS" | grep -q "^fra-idp$"; then
        test_pass "fra-idp configured in Hub Keycloak"
    else
        test_fail "fra-idp NOT configured in Hub"
    fi

    # Check for dive-v3-broker-fra client in Hub
    HUB_CLIENTS=$(docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh \
        get clients -r dive-v3-broker-usa --fields clientId 2>/dev/null | jq -r '.[].clientId')

    if echo "$HUB_CLIENTS" | grep -q "^dive-v3-broker-fra$"; then
        test_pass "dive-v3-broker-fra client exists in Hub"
    else
        test_fail "dive-v3-broker-fra client MISSING in Hub"
    fi
else
    test_fail "Hub Keycloak NOT running"
fi

# =============================================================================
# TEST 6: API Health
# =============================================================================
test_header "6. API Health Checks"

FRONTEND_HEALTH=$(curl -sk "https://localhost:3010/api/auth/providers" 2>/dev/null)
if echo "$FRONTEND_HEALTH" | jq -e '.keycloak' >/dev/null 2>&1; then
    test_pass "FRA Frontend API responsive"
else
    test_fail "FRA Frontend API not responding"
fi

BACKEND_HEALTH=$(curl -sk "https://localhost:4010/health" 2>/dev/null)
if echo "$BACKEND_HEALTH" | jq -e '.status == "healthy"' >/dev/null 2>&1; then
    test_pass "FRA Backend API healthy"
else
    test_fail "FRA Backend API unhealthy"
fi

KC_HEALTH=$(curl -sk "https://localhost:8453/health/ready" 2>/dev/null)
if echo "$KC_HEALTH" | jq -e '.status == "UP"' >/dev/null 2>&1; then
    test_pass "FRA Keycloak API ready"
else
    test_fail "FRA Keycloak API not ready"
fi

# =============================================================================
# TEST 7: Federation Secret Verification
# =============================================================================
test_header "7. Federation Secret Verification"

# Get Hub's dive-v3-broker-fra client secret
HUB_FRA_SECRET=$(docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh \
    get clients -r dive-v3-broker-usa 2>/dev/null | \
    jq -r '.[] | select(.clientId == "dive-v3-broker-fra") | .id' | \
    xargs -I {} docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh \
    get clients/{}/client-secret -r dive-v3-broker-usa 2>/dev/null | jq -r '.value')

# Get FRA's usa-idp configuration (not directly readable, but we can verify it exists)
if docker exec dive-spoke-fra-keycloak /opt/keycloak/bin/kcadm.sh \
    get identity-provider/instances/usa-idp -r dive-v3-broker-fra 2>/dev/null | \
    jq -e '.config.clientSecret' >/dev/null 2>&1; then
    test_pass "usa-idp has client secret configured"
else
    test_fail "usa-idp missing client secret"
fi

# Get FRA's dive-v3-broker-usa client secret
FRA_USA_SECRET=$(docker exec dive-spoke-fra-keycloak /opt/keycloak/bin/kcadm.sh \
    get clients -r dive-v3-broker-fra 2>/dev/null | \
    jq -r '.[] | select(.clientId == "dive-v3-broker-usa") | .id' | \
    xargs -I {} docker exec dive-spoke-fra-keycloak /opt/keycloak/bin/kcadm.sh \
    get clients/{}/client-secret -r dive-v3-broker-fra 2>/dev/null | jq -r '.value')

# Verify Hub's fra-idp has a client secret
if docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh \
    get identity-provider/instances/fra-idp -r dive-v3-broker-usa 2>/dev/null | \
    jq -e '.config.clientSecret' >/dev/null 2>&1; then
    test_pass "Hub's fra-idp has client secret configured"
else
    test_fail "Hub's fra-idp missing client secret"
fi

# =============================================================================
# SUMMARY
# =============================================================================
echo ""
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  TEST SUMMARY${NC}"
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Total Tests: $((PASSED + FAILED))"
echo -e "  ${GREEN}Passed: $PASSED${NC}"
echo -e "  ${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}${BOLD}✓ ALL TESTS PASSED${NC}"
    echo ""
    echo -e "${CYAN}Federation Status: OPERATIONAL${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Test login at: https://localhost:3010"
    echo "  2. Test FRA→Hub SSO flow"
    echo "  3. Test Hub→FRA SSO flow"
    echo ""
    exit 0
else
    echo -e "${RED}${BOLD}✗ SOME TESTS FAILED${NC}"
    echo ""
    echo "Remediation:"
    echo "  1. Review failed tests above"
    echo "  2. Run: ./dive --instance fra spoke sync-secrets"
    echo "  3. Check: ./dive --instance fra spoke status"
    echo "  4. Re-run: ./test-fra-federation.sh"
    echo ""
    exit 1
fi
