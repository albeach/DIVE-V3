#!/usr/bin/env bash
# Federation Smoke Test - Automated
# Tests USA ↔ GBR bidirectional federation

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "============================================"
echo "  DIVE V3 - Federation Smoke Test"
echo "  USA Hub ↔ GBR Spoke"
echo "============================================"
echo ""

# Test counters
PASSED=0
FAILED=0
TOTAL=0

test_step() {
    local step_name="$1"
    local expected="$2"
    local actual="$3"

    TOTAL=$((TOTAL + 1))

    if [ "$expected" = "$actual" ]; then
        echo -e "${GREEN}✅ PASS${NC} - $step_name"
        PASSED=$((PASSED + 1))
        return 0
    else
        echo -e "${RED}❌ FAIL${NC} - $step_name"
        echo -e "   Expected: $expected"
        echo -e "   Actual: $actual"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Phase 1: Service Health Checks"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test 1: USA Hub Backend Health
USA_HEALTH=$(curl -sk https://localhost:4000/health 2>&1 | jq -r '.status' 2>/dev/null || echo "error")
test_step "USA Hub Backend Health" "healthy" "$USA_HEALTH"

# Test 2: GBR Spoke Backend Health
GBR_HEALTH=$(curl -sk https://localhost:4003/health 2>&1 | jq -r '.status' 2>/dev/null || echo "error")
test_step "GBR Spoke Backend Health" "healthy" "$GBR_HEALTH"

# Test 3: USA Keycloak Realm
USA_KC=$(curl -sk https://localhost:8443/realms/dive-v3-broker/.well-known/openid-configuration 2>&1 | jq -r '.issuer' 2>/dev/null | grep -c "dive-v3-broker" || echo "0")
test_step "USA Keycloak Realm Active" "1" "$USA_KC"

# Test 4: GBR Keycloak Realm
GBR_KC=$(curl -sk https://localhost:8446/realms/dive-v3-broker-gbr/.well-known/openid-configuration 2>&1 | jq -r '.issuer' 2>/dev/null | grep -c "dive-v3-broker-gbr" || echo "0")
test_step "GBR Keycloak Realm Active" "1" "$GBR_KC"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Phase 2: Federation Configuration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test 5: USA Hub has gbr-idp
USA_IDP_COUNT=$(curl -sk https://localhost:4000/api/idps/public 2>&1 | jq '.idps | length')
test_step "USA Hub IdP Count" "1" "$USA_IDP_COUNT"

USA_IDP_ALIAS=$(curl -sk https://localhost:4000/api/idps/public 2>&1 | jq -r '.idps[0].alias')
test_step "USA Hub IdP Alias" "gbr-idp" "$USA_IDP_ALIAS"

# Test 6: GBR Spoke has usa-idp
GBR_IDP_COUNT=$(curl -sk https://localhost:4003/api/idps/public 2>&1 | jq '.idps | length')
test_step "GBR Spoke IdP Count" "1" "$GBR_IDP_COUNT"

GBR_IDP_ALIAS=$(curl -sk https://localhost:4003/api/idps/public 2>&1 | jq -r '.idps[0].alias')
test_step "GBR Spoke IdP Alias" "usa-idp" "$GBR_IDP_ALIAS"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Phase 3: OIDC Discovery Endpoints"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test 7: GBR OIDC Discovery
GBR_AUTHZ_URL=$(curl -sk https://localhost:8446/realms/dive-v3-broker-gbr/.well-known/openid-configuration 2>&1 | jq -r '.authorization_endpoint')
if [[ "$GBR_AUTHZ_URL" == *"localhost:8446"* ]]; then
    test_step "GBR OIDC Authorization Endpoint" "localhost:8446" "localhost:8446"
else
    test_step "GBR OIDC Authorization Endpoint" "localhost:8446" "$GBR_AUTHZ_URL"
fi

# Test 8: USA OIDC Discovery
USA_AUTHZ_URL=$(curl -sk https://localhost:8443/realms/dive-v3-broker/.well-known/openid-configuration 2>&1 | jq -r '.authorization_endpoint')
if [[ "$USA_AUTHZ_URL" == *"localhost:8443"* ]]; then
    test_step "USA OIDC Authorization Endpoint" "localhost:8443" "localhost:8443"
else
    test_step "USA OIDC Authorization Endpoint" "localhost:8443" "$USA_AUTHZ_URL"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Phase 4: Keycloak IdP Configuration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test 9: Check gbr-idp in USA Hub Keycloak
echo -e "${BLUE}Checking gbr-idp configuration in USA Hub...${NC}"
docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 \
  --realm master \
  --user admin \
  --password i8mE9Gjsg3x0KsCCZaG9tQ 2>&1 > /dev/null

GBR_IDP_CONFIG=$(docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh \
  get identity-provider/instances/gbr-idp \
  -r dive-v3-broker 2>&1 | jq '{alias, enabled, authUrl: .config.authorizationUrl, clientId: .config.clientId}')

echo "$GBR_IDP_CONFIG"

GBR_IDP_ENABLED=$(echo "$GBR_IDP_CONFIG" | jq -r '.enabled')
test_step "gbr-idp Enabled in USA" "true" "$GBR_IDP_ENABLED"

GBR_IDP_AUTH_URL=$(echo "$GBR_IDP_CONFIG" | jq -r '.authUrl')
if [[ "$GBR_IDP_AUTH_URL" == *"localhost:8446"* ]]; then
    test_step "gbr-idp Uses localhost:8446" "localhost:8446" "localhost:8446"
else
    test_step "gbr-idp Uses localhost:8446" "localhost:8446" "$GBR_IDP_AUTH_URL"
fi

GBR_IDP_CLIENT=$(echo "$GBR_IDP_CONFIG" | jq -r '.clientId')
test_step "gbr-idp Uses cross-border client" "dive-v3-cross-border-client" "$GBR_IDP_CLIENT"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Phase 5: Cross-Border Client Configuration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test 10: Cross-border client in GBR has DIVE scopes
echo -e "${BLUE}Checking cross-border client scopes in GBR...${NC}"
docker exec gbr-keycloak-gbr-1 /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 \
  --realm master \
  --user admin \
  --password Eao30nMhapCE4BmA0W9a 2>&1 > /dev/null

CLIENT_UUID=$(docker exec gbr-keycloak-gbr-1 /opt/keycloak/bin/kcadm.sh \
  get clients -r dive-v3-broker-gbr \
  -q clientId=dive-v3-cross-border-client 2>&1 | jq -r '.[0].id')

CLIENT_SCOPES=$(docker exec gbr-keycloak-gbr-1 /opt/keycloak/bin/kcadm.sh \
  get "clients/$CLIENT_UUID/optional-client-scopes" \
  -r dive-v3-broker-gbr 2>&1 | jq -r '.[].name' | grep -E "clearance|country|acpCOI|uniqueID" | wc -l | tr -d ' ')

test_step "GBR Cross-Border Client Has DIVE Scopes" "4" "$CLIENT_SCOPES"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Phase 6: Test User Availability"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test 11: GBR test user exists
echo -e "${BLUE}Checking if testuser-gbr-4 exists...${NC}"
GBR_USER_CHECK=$(docker exec gbr-keycloak-gbr-1 /opt/keycloak/bin/kcadm.sh \
  get users -r dive-v3-broker-gbr \
  -q username=testuser-gbr-4 2>&1 | jq -r '.[0].username' 2>/dev/null || echo "not_found")

test_step "GBR Test User Exists (testuser-gbr-4)" "testuser-gbr-4" "$GBR_USER_CHECK"

# Test 12: USA test user exists
echo -e "${BLUE}Checking if testuser-usa-4 exists...${NC}"
USA_USER_CHECK=$(docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh \
  get users -r dive-v3-broker \
  -q username=testuser-usa-4 2>&1 | jq -r '.[0].username' 2>/dev/null || echo "not_found")

test_step "USA Test User Exists (testuser-usa-4)" "testuser-usa-4" "$USA_USER_CHECK"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Phase 7: Frontend Accessibility"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test 13: USA Hub Frontend
USA_FRONTEND=$(curl -sk https://localhost:3000 2>&1 | grep -c "DIVE" || echo "0")
if [ "$USA_FRONTEND" -gt 0 ]; then
    test_step "USA Hub Frontend Accessible" "accessible" "accessible"
else
    test_step "USA Hub Frontend Accessible" "accessible" "not accessible"
fi

# Test 14: GBR Spoke Frontend
GBR_FRONTEND=$(curl -sk https://localhost:3003 2>&1 | grep -c "DIVE" || echo "0")
if [ "$GBR_FRONTEND" -gt 0 ]; then
    test_step "GBR Spoke Frontend Accessible" "accessible" "accessible"
else
    test_step "GBR Spoke Frontend Accessible" "accessible" "not accessible"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Phase 8: Network Connectivity"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test 15: Hub can reach GBR Keycloak (internal)
echo -e "${BLUE}Testing hub backend → GBR Keycloak connectivity...${NC}"
HUB_TO_GBR=$(docker exec dive-hub-backend curl -skI https://gbr-keycloak-gbr-1:8443/realms/dive-v3-broker-gbr 2>&1 | grep -c "HTTP/2 200" || echo "0")
test_step "Hub Backend Can Reach GBR Keycloak" "1" "$HUB_TO_GBR"

echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}⚠️  OAuth Flow Requires Browser Session${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Automated testing complete. Manual browser test required:"
echo ""
echo "1. Open: https://localhost:3000"
echo "2. Click 'United Kingdom' button"
echo "3. Login with: testuser-gbr-4 / TestUser2025!Pilot"
echo "4. Verify return to USA Hub dashboard"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test Results Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "Total Tests:  $TOTAL"
echo -e "${GREEN}Passed:       $PASSED${NC}"
echo -e "${RED}Failed:       $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}✅ ALL TESTS PASSED - Federation Ready!${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "🎉 Federation smoke test complete!"
    echo ""
    echo "Next Steps:"
    echo "  1. Open browser: https://localhost:3000"
    echo "  2. Click 'United Kingdom' button"
    echo "  3. Login with: testuser-gbr-4 / TestUser2025!Pilot"
    echo "  4. Verify return to USA Hub dashboard"
    exit 0
else
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}❌ SOME TESTS FAILED - Review Above${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    exit 1
fi
