#!/bin/bash
# ============================================
# Manual Event Listener Configuration Script
# ============================================
# Purpose: Enable dive-amr-enrichment event listener in all realms
# Usage: ./scripts/enable-event-listeners-manual.sh
#
# This script uses Keycloak Admin API to configure event listeners
# Use this if Terraform keycloak_realm_events resource has issues

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

KEYCLOAK_URL="https://localhost:8443"
ADMIN_USER="admin"
ADMIN_PASS="admin"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Enabling Event Listeners in All Realms${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Get admin token
echo -e "${YELLOW}[1/2] Obtaining admin token...${NC}"
TOKEN=$(curl -s -k -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=$ADMIN_USER" \
  -d "password=$ADMIN_PASS" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r '.access_token')

if [ "$TOKEN" == "null" ] || [ -z "$TOKEN" ]; then
  echo -e "${RED}❌ Failed to obtain admin token${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Admin token obtained${NC}"
echo ""

# Realms to configure
REALMS=(
  "dive-v3-broker"
  "dive-v3-usa"
  "dive-v3-fra"
  "dive-v3-can"
  "dive-v3-gbr"
  "dive-v3-deu"
  "dive-v3-ita"
  "dive-v3-esp"
  "dive-v3-pol"
  "dive-v3-nld"
  "dive-v3-industry"
)

echo -e "${YELLOW}[2/2] Configuring event listeners...${NC}"
echo ""

for REALM in "${REALMS[@]}"; do
  echo -n "  Configuring $REALM..."
  
  # Get current realm configuration
  REALM_CONFIG=$(curl -s -k -X GET "$KEYCLOAK_URL/admin/realms/$REALM" \
    -H "Authorization: Bearer $TOKEN")
  
  # Update with event listeners
  curl -s -k -X PUT "$KEYCLOAK_URL/admin/realms/$REALM" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$REALM_CONFIG" \
    --data-binary "@-" <<EOF
{
  "realm": "$REALM",
  "eventsEnabled": true,
  "eventsExpiration": 604800,
  "eventsListeners": ["jboss-logging", "dive-amr-enrichment"],
  "enabledEventTypes": ["LOGIN", "LOGIN_ERROR", "LOGOUT", "UPDATE_TOTP", "REMOVE_TOTP", "UPDATE_PASSWORD", "UPDATE_PROFILE", "SEND_RESET_PASSWORD"],
  "adminEventsEnabled": true,
  "adminEventsDetailsEnabled": true
}
EOF
  
  # Verify
  LISTENERS=$(curl -s -k -X GET "$KEYCLOAK_URL/admin/realms/$REALM" \
    -H "Authorization: Bearer $TOKEN" | jq -r '.eventsListeners[]' 2>/dev/null)
  
  if echo "$LISTENERS" | grep -q "dive-amr-enrichment"; then
    echo -e " ${GREEN}✅${NC}"
  else
    echo -e " ${YELLOW}⚠️  (may need manual verification)${NC}"
  fi
done

echo ""
echo -e "${GREEN}✅ Event listener configuration complete${NC}"
echo ""
echo -e "${BLUE}Verification:${NC}"
echo "  curl -s -k https://localhost:8443/realms/dive-v3-broker | jq '.eventsListeners'"
echo ""
echo -e "${BLUE}Test MFA Flow:${NC}"
echo "  1. Login to Keycloak: https://localhost:8443/admin"
echo "  2. Select dive-v3-broker realm"
echo "  3. Navigate: Realm Settings → Events → Event Listeners"
echo "  4. Verify 'dive-amr-enrichment' is in the list"
echo ""












