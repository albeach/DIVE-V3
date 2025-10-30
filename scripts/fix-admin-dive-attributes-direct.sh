#!/bin/bash
set -e

echo "=========================================="
echo "DIVE V3 - Direct Admin API Attribute Fix"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

KEYCLOAK_URL="http://localhost:8081"
REALM="dive-v3-broker"

echo "Step 1: Get Keycloak admin token..."
ADMIN_TOKEN=$(curl -s -X POST ${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r '.access_token')

if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "null" ]; then
  echo -e "${RED}❌ Failed to get admin token${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Admin token obtained${NC}"
echo ""

echo "Step 2: Find admin-dive user..."
USER_DATA=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "${KEYCLOAK_URL}/admin/realms/${REALM}/users?username=admin-dive&exact=true")

USER_ID=$(echo "$USER_DATA" | jq -r '.[0].id')
CURRENT_ATTRS=$(echo "$USER_DATA" | jq -r '.[0].attributes')

if [ -z "$USER_ID" ] || [ "$USER_ID" = "null" ]; then
  echo -e "${RED}❌ User not found${NC}"
  exit 1
fi

echo -e "${GREEN}✅ User found: ${USER_ID}${NC}"
echo "Current attributes: $CURRENT_ATTRS"
echo ""

echo "Step 3: Set attributes via PUT request (full user update)..."
UPDATE_PAYLOAD=$(cat <<EOF
{
  "id": "${USER_ID}",
  "username": "admin-dive",
  "email": "admin@dive-v3.pilot",
  "firstName": "DIVE",
  "lastName": "Administrator",
  "enabled": true,
  "emailVerified": false,
  "attributes": {
    "uniqueID": ["admin@dive-v3.pilot"],
    "clearance": ["TOP_SECRET"],
    "countryOfAffiliation": ["USA"],
    "acpCOI": ["NATO-COSMIC", "FVEY", "CAN-US"],
    "dutyOrg": ["DIVE_ADMIN"],
    "orgUnit": ["SYSTEM_ADMINISTRATION"]
  }
}
EOF
)

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}" \
  -d "$UPDATE_PAYLOAD")

if [ "$HTTP_CODE" = "204" ]; then
  echo -e "${GREEN}✅ User updated successfully${NC}"
else
  echo -e "${RED}❌ Update failed (HTTP $HTTP_CODE)${NC}"
  exit 1
fi
echo ""

echo "Step 4: Wait for database sync..."
sleep 3
echo ""

echo "Step 5: Verify via Admin API..."
UPDATED_USER=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}")

UPDATED_ATTRS=$(echo "$UPDATED_USER" | jq '.attributes')
echo "$UPDATED_ATTRS" | jq '.'
echo ""

echo "Step 6: Verify in PostgreSQL database..."
docker exec -i dive-v3-postgres psql -U postgres -d keycloak_db <<EOF
SELECT ua.name, ua.value 
FROM user_attribute ua
WHERE ua.user_id = '${USER_ID}'
ORDER BY ua.name;
EOF
echo ""

echo "Step 7: Test JWT token generation..."
echo "Getting token for admin-dive..."

TOKEN_RESPONSE=$(curl -s -X POST http://localhost:4000/api/auth/custom-login \
  -H "Content-Type: application/json" \
  -d '{
    "idpAlias": "dive-v3-broker",
    "username": "admin-dive",
    "password": "DiveAdmin2025!"
  }')

echo "Token response:"
echo "$TOKEN_RESPONSE" | jq '.'
echo ""

ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.data.accessToken // .accessToken // empty')

if [ -n "$ACCESS_TOKEN" ] && [ "$ACCESS_TOKEN" != "null" ]; then
  echo -e "${GREEN}✅ Token obtained${NC}"
  echo ""
  
  echo "Step 8: Decode JWT token..."
  TOKEN_PAYLOAD=$(echo "$ACCESS_TOKEN" | cut -d'.' -f2 | base64 -d 2>/dev/null | jq '.')
  
  echo "Token claims:"
  echo "$TOKEN_PAYLOAD" | jq '{
    sub,
    uniqueID,
    clearance,
    countryOfAffiliation,
    acpCOI,
    acr,
    amr,
    auth_time
  }'
  
  # Check for required claims
  echo ""
  echo "Validation:"
  echo -n "  uniqueID: "
  if echo "$TOKEN_PAYLOAD" | jq -e '.uniqueID' > /dev/null 2>&1; then
    echo -e "${GREEN}✅${NC}"
  else
    echo -e "${RED}❌ MISSING${NC}"
  fi
  
  echo -n "  clearance: "
  if echo "$TOKEN_PAYLOAD" | jq -e '.clearance' > /dev/null 2>&1; then
    echo -e "${GREEN}✅${NC}"
  else
    echo -e "${RED}❌ MISSING${NC}"
  fi
  
  echo -n "  countryOfAffiliation: "
  if echo "$TOKEN_PAYLOAD" | jq -e '.countryOfAffiliation' > /dev/null 2>&1; then
    echo -e "${GREEN}✅${NC}"
  else
    echo -e "${RED}❌ MISSING${NC}"
  fi
  
  echo -n "  acpCOI: "
  if echo "$TOKEN_PAYLOAD" | jq -e '.acpCOI' > /dev/null 2>&1; then
    echo -e "${GREEN}✅${NC}"
  else
    echo -e "${RED}❌ MISSING${NC}"
  fi
  
  echo -n "  acr: "
  if echo "$TOKEN_PAYLOAD" | jq -e '.acr' > /dev/null 2>&1; then
    echo -e "${GREEN}✅${NC}"
  else
    echo -e "${RED}❌ MISSING${NC}"
  fi
  
  echo -n "  amr: "
  if echo "$TOKEN_PAYLOAD" | jq -e '.amr' > /dev/null 2>&1; then
    echo -e "${GREEN}✅${NC}"
  else
    echo -e "${RED}❌ MISSING${NC}"
  fi
  
  echo -n "  auth_time: "
  if echo "$TOKEN_PAYLOAD" | jq -e '.auth_time' > /dev/null 2>&1; then
    echo -e "${GREEN}✅${NC}"
  else
    echo -e "${RED}❌ MISSING${NC}"
  fi
else
  echo -e "${RED}❌ Failed to get token${NC}"
fi

echo ""
echo "=========================================="
echo "Phase 1 Attribute Fix Complete!"
echo "=========================================="

