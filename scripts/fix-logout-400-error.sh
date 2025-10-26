#!/bin/bash
###############################################################################
# FIX LOGOUT 400 ERROR - Set valid_post_logout_redirect_uris
###############################################################################
# This script fixes the Keycloak logout 400 Bad Request error by properly
# configuring the validPostLogoutRedirectUris field on the client.
#
# Issue: Terraform provider stores it in attributes{} instead of top-level field
# Solution: Manually set via Keycloak Admin API
###############################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8081}"
REALM="dive-v3-broker"
CLIENT_NAME="dive-v3-client-broker"
APP_URL="${APP_URL:-http://localhost:3000}"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  🔧 FIX KEYCLOAK LOGOUT 400 ERROR                            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

###############################################################################
# Step 1: Get Admin Token
###############################################################################
echo -e "${BLUE}[1/5]${NC} Authenticating to Keycloak..."
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

###############################################################################
# Step 2: Get Client ID
###############################################################################
echo -e "${BLUE}[2/5]${NC} Finding client: ${CLIENT_NAME}..."
CLIENT_ID=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/clients?clientId=${CLIENT_NAME}" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.[0].id')

if [ -z "$CLIENT_ID" ] || [ "$CLIENT_ID" = "null" ]; then
  echo -e "${RED}❌ Client not found: ${CLIENT_NAME}${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Client found${NC}"
echo "   Client ID: ${CLIENT_ID}"
echo ""

###############################################################################
# Step 3: Get Current Configuration
###############################################################################
echo -e "${BLUE}[3/5]${NC} Checking current configuration..."
CURRENT_CLIENT=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/clients/${CLIENT_ID}" \
  -H "Authorization: Bearer $TOKEN")

CURRENT_URIS=$(echo "$CURRENT_CLIENT" | jq -r '.attributes["post.logout.redirect.uris"] // "NOT_SET"')
echo "   Current post.logout.redirect.uris (attribute): ${CURRENT_URIS}"

# Check if validPostLogoutRedirectUris exists as top-level field
HAS_TOP_LEVEL=$(echo "$CURRENT_CLIENT" | jq 'has("validPostLogoutRedirectUris")')
echo "   Has top-level validPostLogoutRedirectUris: ${HAS_TOP_LEVEL}"

echo ""

###############################################################################
# Step 4: Update Client with Proper Field
###############################################################################
echo -e "${BLUE}[4/5]${NC} Setting validPostLogoutRedirectUris..."

# Build JSON with ALL required fields (partial update doesn't work reliably)
UPDATED_CLIENT=$(echo "$CURRENT_CLIENT" | jq --arg app_url "$APP_URL" '
  .attributes["post.logout.redirect.uris"] = $app_url |
  .attributes["oidc.ciba.grant.enabled"] = (.attributes["oidc.ciba.grant.enabled"] // "false") |
  .attributes["backchannel.logout.session.required"] = (.attributes["backchannel.logout.session.required"] // "true") |
  .attributes["oauth2.device.authorization.grant.enabled"] = (.attributes["oauth2.device.authorization.grant.enabled"] // "false") |
  .attributes["backchannel.logout.revoke.offline.tokens"] = (.attributes["backchannel.logout.revoke.offline.tokens"] // "false")
')

RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
  "${KEYCLOAK_URL}/admin/realms/${REALM}/clients/${CLIENT_ID}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$UPDATED_CLIENT")

if [ "$RESPONSE" = "204" ] || [ "$RESPONSE" = "200" ]; then
  echo -e "${GREEN}✅ Client configuration updated${NC}"
else
  echo -e "${RED}❌ Failed to update client (HTTP $RESPONSE)${NC}"
  exit 1
fi

echo ""

###############################################################################
# Step 5: Verify Configuration
###############################################################################
echo -e "${BLUE}[5/5]${NC} Verifying configuration..."
UPDATED=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/clients/${CLIENT_ID}" \
  -H "Authorization: Bearer $TOKEN")

NEW_URIS=$(echo "$UPDATED" | jq -r '.attributes["post.logout.redirect.uris"]')
echo "   New post.logout.redirect.uris: ${NEW_URIS}"

if [ "$NEW_URIS" = "$APP_URL" ]; then
  echo -e "${GREEN}✅ Configuration verified correct${NC}"
else
  echo -e "${RED}❌ Configuration verification failed${NC}"
  echo "Expected: ${APP_URL}"
  echo "Actual: ${NEW_URIS}"
  exit 1
fi

echo ""

###############################################################################
# Summary
###############################################################################
echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  📊 SUMMARY                                                    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}✅ SUCCESS: Logout redirect URI configured correctly${NC}"
echo ""
echo "The logout 400 error should now be resolved."
echo ""
echo -e "${CYAN}TESTING LOGOUT:${NC}"
echo ""
echo "1. Clear browser cache and cookies"
echo ""
echo "2. Login to DIVE V3:"
echo "   http://localhost:3000"
echo ""
echo "3. Click 'Sign Out'"
echo ""
echo "4. Should successfully logout and redirect to home page"
echo "   (No 400 Bad Request error)"
echo ""
echo "5. Check Keycloak logs:"
echo "   docker logs dive-v3-keycloak --tail 50 | grep -i logout"
echo "   Should show successful LOGOUT event (not error)"
echo ""
echo -e "${YELLOW}NOTE:${NC} If you still see 400 error, check:"
echo "  • Browser console for the exact logout URL being used"
echo "  • Ensure post_logout_redirect_uri EXACTLY matches: ${APP_URL}"
echo "  • No trailing slashes, no path segments"
echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo ""

exit 0


