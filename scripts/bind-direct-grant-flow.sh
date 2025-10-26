#!/bin/bash
###############################################################################
# BIND DIRECT GRANT FLOW TO REALM
###############################################################################
# Binds the custom Direct Grant MFA flow to the realm
# This is required for custom login pages to enforce MFA
###############################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8081}"
REALM="dive-v3-broker"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  🔧 BIND DIRECT GRANT FLOW TO REALM                          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Get admin token
echo -e "${BLUE}[1/4]${NC} Authenticating..."
TOKEN=$(curl -s -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r '.access_token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo -e "${RED}❌ Failed to get admin token${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Authenticated${NC}"
echo ""

# Get Direct Grant MFA flow alias
echo -e "${BLUE}[2/4]${NC} Finding Direct Grant MFA flow..."
FLOW_ALIAS=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/authentication/flows" \
  -H "Authorization: Bearer $TOKEN" | \
  jq -r '.[] | select(.alias | contains("Direct Grant with Conditional MFA")) | .alias')

if [ -z "$FLOW_ALIAS" ] || [ "$FLOW_ALIAS" = "null" ]; then
  echo -e "${RED}❌ Direct Grant MFA flow not found${NC}"
  echo "Available flows:"
  curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/authentication/flows" \
    -H "Authorization: Bearer $TOKEN" | jq -r '.[] | .alias'
  exit 1
fi

echo -e "${GREEN}✅ Found flow: ${FLOW_ALIAS}${NC}"
echo ""

# Get current realm configuration
echo -e "${BLUE}[3/4]${NC} Getting current realm configuration..."
CURRENT_FLOW=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.directGrantFlow')

echo "Current Direct Grant flow: ${CURRENT_FLOW}"
echo ""

# Update realm to use Direct Grant MFA flow
echo -e "${BLUE}[4/4]${NC} Binding Direct Grant MFA flow to realm..."
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
  "${KEYCLOAK_URL}/admin/realms/${REALM}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"directGrantFlow\": \"${FLOW_ALIAS}\"
  }")

if [ "$RESPONSE" = "204" ] || [ "$RESPONSE" = "200" ]; then
  echo -e "${GREEN}✅ Direct Grant flow bound successfully${NC}"
else
  echo -e "${RED}❌ Failed to bind flow (HTTP $RESPONSE)${NC}"
  exit 1
fi

# Verify
NEW_FLOW=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.directGrantFlow')

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅ SUCCESS                                                    ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Before: ${CURRENT_FLOW}"
echo "After:  ${NEW_FLOW}"
echo ""

