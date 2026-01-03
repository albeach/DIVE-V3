#!/usr/bin/env bash
# Complete E2E Federation Test - USA → GBR

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  E2E Federation Test: USA → GBR"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test 1: IdP configuration
echo -e "${BLUE}Test 1: Verify IdP Configuration${NC}"
IDP_ALIAS=$(curl -sk https://localhost:4000/api/idps/public | jq -r '.idps[0].alias')
if [ "$IDP_ALIAS" = "gbr-idp" ]; then
    echo -e "${GREEN}✅ PASS${NC} - gbr-idp configured"
else
    echo -e "${RED}❌ FAIL${NC} - Expected gbr-idp, got: $IDP_ALIAS"
    exit 1
fi

# Test 2: Network connectivity
echo -e "${BLUE}Test 2: Network Connectivity${NC}"
NETWORK_TEST=$(docker exec dive-hub-keycloak curl -sk -o /dev/null -w "%{http_code}" https://gbr-keycloak-gbr-1:8443/realms/dive-v3-broker-gbr/.well-known/openid-configuration)
if [ "$NETWORK_TEST" = "200" ]; then
    echo -e "${GREEN}✅ PASS${NC} - USA Hub Keycloak can reach GBR Keycloak"
else
    echo -e "${RED}❌ FAIL${NC} - Network test returned: $NETWORK_TEST"
    exit 1
fi

# Test 3: Root CA trust
echo -e "${BLUE}Test 3: Root CA Trust${NC}"
CA_CHECK=$(docker exec -u root dive-hub-keycloak keytool -list \
  -keystore /etc/java/java-21-openjdk/java-21-openjdk-21.0.9.0.10-1.el9.aarch64/lib/security/cacerts \
  -storepass changeit \
  -alias mkcert-root-ca 2>&1 | grep -c "trustedCertEntry" || echo "0")
if [ "$CA_CHECK" = "1" ]; then
    echo -e "${GREEN}✅ PASS${NC} - mkcert root CA is trusted"
else
    echo -e "${RED}❌ FAIL${NC} - Root CA not found in truststore"
    exit 1
fi

# Test 4: OAuth redirect
echo -e "${BLUE}Test 4: OAuth Redirect Chain${NC}"
REDIRECT_URL=$(curl -sk -i "https://localhost:8443/realms/dive-v3-broker/protocol/openid-connect/auth?kc_idp_hint=gbr-idp&response_type=code&client_id=dive-v3-broker&redirect_uri=https://localhost:3000/callback&scope=openid" 2>&1 | grep -i "location:" | head -1 | sed 's/location: //i' | tr -d '\r\n')

if [[ "$REDIRECT_URL" == *"gbr-idp"* ]]; then
    echo -e "${GREEN}✅ PASS${NC} - OAuth redirect configured correctly"
else
    echo -e "${RED}❌ FAIL${NC} - Unexpected redirect: ${REDIRECT_URL:0:100}"
    exit 1
fi

# Test 5: SSL errors check
echo -e "${BLUE}Test 5: Check for SSL Errors${NC}"
sleep 3
SSL_ERRORS=$(docker logs dive-hub-keycloak --tail 50 2>&1 | grep -c "PKIX path building failed" || echo "0")
if [ "$SSL_ERRORS" = "0" ]; then
    echo -e "${GREEN}✅ PASS${NC} - No SSL certificate errors"
else
    echo -e "${RED}❌ FAIL${NC} - Found $SSL_ERRORS SSL errors in logs"
    exit 1
fi

# Test 6: Token endpoint accessibility
echo -e "${BLUE}Test 6: GBR Token Endpoint (Backend)${NC}"
TOKEN_ENDPOINT=$(docker exec dive-hub-keycloak curl -sk -o /dev/null -w "%{http_code}" https://gbr-keycloak-gbr-1:8443/realms/dive-v3-broker-gbr/protocol/openid-connect/token)
if [ "$TOKEN_ENDPOINT" = "405" ] || [ "$TOKEN_ENDPOINT" = "400" ]; then
    # 405 (Method Not Allowed) or 400 (Bad Request) are expected without proper POST data
    echo -e "${GREEN}✅ PASS${NC} - Token endpoint is reachable (HTTP $TOKEN_ENDPOINT)"
else
    echo -e "${RED}❌ FAIL${NC} - Token endpoint returned: $TOKEN_ENDPOINT"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ ALL E2E TESTS PASSED${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Federation is properly configured with:"
echo "  ✅ mkcert Root CA trusted"
echo "  ✅ Network connectivity working"
echo "  ✅ IdP configuration correct"
echo "  ✅ OAuth flow functional"
echo "  ✅ No SSL errors"
echo ""
echo "Ready for browser test!"
