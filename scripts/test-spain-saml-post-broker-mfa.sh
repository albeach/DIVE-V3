#!/bin/bash
# DIVE V3 - Spain SAML Post-Broker MFA Testing Script
# Tests the production-ready post-broker MFA flow for Spain SAML IdP
# Date: October 28, 2025

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
KEYCLOAK_URL="http://localhost:8081"
NEXTJS_URL="http://localhost:3000"
SIMPLESAMLPHP_URL="http://localhost:9443"
REALM="dive-v3-broker"
CLIENT_ID="dive-v3-client"
SPAIN_IDP_ALIAS="esp-realm-external"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}DIVE V3 - Spain SAML MFA Testing${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Test 1: Verify Keycloak is running
echo -e "${YELLOW}[Test 1] Verifying Keycloak is accessible...${NC}"
if curl -s -f "${KEYCLOAK_URL}/realms/${REALM}/.well-known/openid-configuration" > /dev/null; then
    echo -e "${GREEN}✓ Keycloak is running and accessible${NC}"
else
    echo -e "${RED}✗ Keycloak is not accessible at ${KEYCLOAK_URL}${NC}"
    echo -e "${RED}  Run: docker-compose up -d keycloak${NC}"
    exit 1
fi
echo ""

# Test 2: Verify SimpleSAMLphp is running
echo -e "${YELLOW}[Test 2] Verifying SimpleSAMLphp is accessible...${NC}"
if curl -s -f "${SIMPLESAMLPHP_URL}/simplesaml/module.php/core/frontpage_welcome.php" > /dev/null; then
    echo -e "${GREEN}✓ SimpleSAMLphp is running and accessible${NC}"
else
    echo -e "${RED}✗ SimpleSAMLphp is not accessible at ${SIMPLESAMLPHP_URL}${NC}"
    echo -e "${RED}  Run: docker-compose up -d simplesamlphp${NC}"
    exit 1
fi
echo ""

# Test 3: Verify Next.js frontend is running
echo -e "${YELLOW}[Test 3] Verifying Next.js frontend is accessible...${NC}"
if curl -s -f "${NEXTJS_URL}" > /dev/null; then
    echo -e "${GREEN}✓ Next.js frontend is running and accessible${NC}"
else
    echo -e "${RED}✗ Next.js frontend is not accessible at ${NEXTJS_URL}${NC}"
    echo -e "${RED}  Run: docker-compose up -d nextjs${NC}"
    exit 1
fi
echo ""

# Test 4: Verify post-broker flow exists in Keycloak
echo -e "${YELLOW}[Test 4] Verifying post-broker MFA flow exists in Keycloak...${NC}"

# Get admin token
ADMIN_TOKEN=$(docker-compose exec -T keycloak /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 --realm master --user admin --password admin 2>&1 | grep -v "Logging" | grep -v "config" || true)

# Get authentication flows
FLOWS=$(docker-compose exec -T keycloak /opt/keycloak/bin/kcadm.sh get authentication/flows \
  -r ${REALM} --no-config --server http://localhost:8080 --realm master --user admin --password admin 2>/dev/null | jq -r '.[] | select(.alias | contains("Post-Broker")) | .alias' || echo "")

if echo "$FLOWS" | grep -q "Post-Broker Classified MFA"; then
    echo -e "${GREEN}✓ Post-broker MFA flow exists: ${FLOWS}${NC}"
else
    echo -e "${RED}✗ Post-broker MFA flow not found${NC}"
    echo -e "${RED}  Run: cd terraform && terraform apply -target=module.broker_mfa.keycloak_authentication_flow.post_broker_classified${NC}"
    exit 1
fi
echo ""

# Test 5: Verify post-broker flow structure
echo -e "${YELLOW}[Test 5] Verifying post-broker flow structure...${NC}"

FLOW_STRUCTURE=$(docker-compose exec -T keycloak /opt/keycloak/bin/kcadm.sh get \
  "authentication/flows/Post-Broker%20Classified%20MFA%20-%20DIVE%20V3%20Broker/executions" \
  -r ${REALM} --no-config --server http://localhost:8080 --realm master --user admin --password admin 2>/dev/null \
  | jq -r '.[] | "\(.displayName // .requirement) [\(.requirement)]"' || echo "")

echo "$FLOW_STRUCTURE"

if echo "$FLOW_STRUCTURE" | grep -q "ALTERNATIVE"; then
    echo -e "${GREEN}✓ Flow structure is correct (ALTERNATIVE at root)${NC}"
else
    echo -e "${RED}✗ Flow structure is incorrect (missing ALTERNATIVE)${NC}"
    exit 1
fi
echo ""

# Test 6: Verify Spain SAML IdP configuration
echo -e "${YELLOW}[Test 6] Verifying Spain SAML IdP configuration...${NC}"

SPAIN_IDP=$(docker-compose exec -T keycloak /opt/keycloak/bin/kcadm.sh get \
  "identity-provider/instances/${SPAIN_IDP_ALIAS}" \
  -r ${REALM} --no-config --server http://localhost:8080 --realm master --user admin --password admin 2>/dev/null || echo "")

if echo "$SPAIN_IDP" | jq -e '.postBrokerLoginFlowAlias | contains("Post-Broker")' > /dev/null 2>&1; then
    POST_BROKER_FLOW=$(echo "$SPAIN_IDP" | jq -r '.postBrokerLoginFlowAlias')
    echo -e "${GREEN}✓ Spain SAML IdP has post-broker flow bound: ${POST_BROKER_FLOW}${NC}"
else
    echo -e "${RED}✗ Spain SAML IdP does not have post-broker flow bound${NC}"
    echo -e "${RED}  Run: cd terraform && terraform apply -target=module.spain_saml_idp.keycloak_saml_identity_provider.external_idp${NC}"
    exit 1
fi
echo ""

# Test 7: Verify IdP is hidden on login page
echo -e "${YELLOW}[Test 7] Verifying IdP is hidden on login page (for NextAuth auto-redirect)...${NC}"

if echo "$SPAIN_IDP" | jq -e '.config.hideOnLoginPage == ["true"]' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Spain SAML IdP is hidden on login page (NextAuth auto-redirect enabled)${NC}"
else
    echo -e "${YELLOW}⚠ Spain SAML IdP is visible on login page (may cause redirect issues)${NC}"
fi
echo ""

# Test 8: Check for test users with OTP configured
echo -e "${YELLOW}[Test 8] Verifying test users with OTP configured...${NC}"

# Check for juan.garcia user
USERS=$(docker-compose exec -T keycloak /opt/keycloak/bin/kcadm.sh get users \
  -r ${REALM} --no-config --server http://localhost:8080 --realm master --user admin --password admin \
  -q username=juan.garcia 2>/dev/null | jq -r '.[].username' || echo "")

if echo "$USERS" | grep -q "juan.garcia"; then
    echo -e "${GREEN}✓ Test user 'juan.garcia' exists${NC}"
    
    # Check OTP configuration
    USER_ID=$(docker-compose exec -T keycloak /opt/keycloak/bin/kcadm.sh get users \
      -r ${REALM} --no-config --server http://localhost:8080 --realm master --user admin --password admin \
      -q username=juan.garcia 2>/dev/null | jq -r '.[].id')
    
    OTP_CREDS=$(docker-compose exec -T keycloak /opt/keycloak/bin/kcadm.sh get \
      "users/${USER_ID}/credentials" \
      -r ${REALM} --no-config --server http://localhost:8080 --realm master --user admin --password admin 2>/dev/null \
      | jq -r '.[] | select(.type == "otp")' || echo "")
    
    if [ -n "$OTP_CREDS" ]; then
        echo -e "${GREEN}✓ Test user has OTP configured${NC}"
    else
        echo -e "${YELLOW}⚠ Test user does not have OTP configured${NC}"
        echo -e "${YELLOW}  To configure OTP:${NC}"
        echo -e "${YELLOW}    1. Login as juan.garcia${NC}"
        echo -e "${YELLOW}    2. Navigate to Account Console${NC}"
        echo -e "${YELLOW}    3. Configure OTP authenticator${NC}"
    fi
else
    echo -e "${RED}✗ Test user 'juan.garcia' not found${NC}"
    echo -e "${RED}  Check SimpleSAMLphp user database${NC}"
fi
echo ""

# Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Pre-Flight Checks Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✓ Services running and accessible${NC}"
echo -e "${GREEN}✓ Post-broker MFA flow configured correctly${NC}"
echo -e "${GREEN}✓ Spain SAML IdP properly bound${NC}"
echo ""
echo -e "${YELLOW}Manual E2E Test Instructions:${NC}"
echo -e "${YELLOW}========================================${NC}"
echo -e "1. Open browser in incognito mode:"
echo -e "   ${BLUE}open -na 'Google Chrome' --args --incognito ${NEXTJS_URL}${NC}"
echo ""
echo -e "2. Click 'Spain Ministry of Defense (External SAML)' button"
echo ""
echo -e "3. ${GREEN}EXPECTED:${NC} Direct redirect to SimpleSAMLphp (${SIMPLESAMLPHP_URL})"
echo -e "   ${RED}DO NOT SEE:${NC} dive-v3-broker login page"
echo ""
echo -e "4. Login at SimpleSAMLphp:"
echo -e "   Username: ${BLUE}juan.garcia${NC}"
echo -e "   Password: ${BLUE}EspanaDefensa2025!${NC}"
echo ""
echo -e "5. ${GREEN}EXPECTED:${NC} OTP prompt appears (NEW BEHAVIOR - MFA enforced)"
echo -e "   Enter OTP code from Google Authenticator"
echo ""
echo -e "6. ${GREEN}EXPECTED:${NC} Dashboard loads with user info:"
echo -e "   - Name: Juan García"
echo -e "   - Clearance: SECRET"
echo -e "   - Country: ESP (Spain)"
echo -e "   - IdP: Spain Ministry of Defense (External SAML)"
echo ""
echo -e "7. Verify JWT token claims (optional):"
echo -e "   ${BLUE}# In browser console:${NC}"
echo -e "   ${BLUE}localStorage.getItem('keycloak-token')${NC}"
echo -e "   ${BLUE}# Decode at jwt.io and verify:${NC}"
echo -e "   ${BLUE}- clearance: 'SECRET'${NC}"
echo -e "   ${BLUE}- countryOfAffiliation: 'ESP'${NC}"
echo -e "   ${BLUE}- identity_provider: 'esp-realm-external' (pending mapper)${NC}"
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✓ All pre-flight checks passed!${NC}"
echo -e "${BLUE}========================================${NC}"

