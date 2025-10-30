#!/bin/bash
set -e

echo "=========================================="
echo "DIVE V3 - Verify Attribute Fix Complete"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

KEYCLOAK_URL="http://localhost:8081"
REALM="dive-v3-broker"
USER_ID="d665c142-1822-41b6-992a-76975b1facd5"

echo "Step 1: Verify attributes in PostgreSQL database..."
ATTRIBUTE_COUNT=$(docker exec -i dive-v3-postgres psql -U postgres -d keycloak_db -t -c "SELECT COUNT(*) FROM user_attribute WHERE user_id = '${USER_ID}';")
ATTRIBUTE_COUNT=$(echo $ATTRIBUTE_COUNT | xargs)

echo "Found $ATTRIBUTE_COUNT attributes in database"
docker exec -i dive-v3-postgres psql -U postgres -d keycloak_db <<EOF
SELECT name, value FROM user_attribute WHERE user_id = '${USER_ID}' ORDER BY name;
EOF
echo ""

if [ "$ATTRIBUTE_COUNT" -ge "6" ]; then
  echo -e "${GREEN}✅ Attributes persisted to database!${NC}"
else
  echo -e "${RED}❌ Attributes NOT in database (expected 6, found $ATTRIBUTE_COUNT)${NC}"
  exit 1
fi
echo ""

echo "Step 2: Verify attributes via Admin API..."
ADMIN_TOKEN=$(curl -s -X POST ${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r '.access_token')

USER_ATTRS=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}" | jq '.attributes')

echo "$USER_ATTRS" | jq '.'
echo ""

echo "Step 3: Test JWT token generation..."
TOKEN_RESPONSE=$(curl -s -X POST http://localhost:4000/api/auth/custom-login \
  -H "Content-Type: application/json" \
  -d '{
    "idpAlias": "dive-v3-broker",
    "username": "admin-dive",
    "password": "DiveAdmin2025!"
  }')

ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.data.accessToken // .accessToken // empty')

if [ -z "$ACCESS_TOKEN" ] || [ "$ACCESS_TOKEN" = "null" ]; then
  echo -e "${RED}❌ Failed to get access token${NC}"
  echo "Response: $TOKEN_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✅ Access token obtained${NC}"
echo ""

echo "Step 4: Decode and validate JWT claims..."
TOKEN_PAYLOAD=$(echo "$ACCESS_TOKEN" | cut -d'.' -f2 | base64 -d 2>/dev/null | jq '.')

echo "Full JWT payload:"
echo "$TOKEN_PAYLOAD" | jq '.'
echo ""

echo "Critical claims check:"
echo "===================="

# Check uniqueID
UNIQUE_ID=$(echo "$TOKEN_PAYLOAD" | jq -r '.uniqueID // empty')
echo -n "uniqueID: "
if [ -n "$UNIQUE_ID" ]; then
  echo -e "${GREEN}✅ $UNIQUE_ID${NC}"
else
  echo -e "${RED}❌ MISSING${NC}"
fi

# Check clearance
CLEARANCE=$(echo "$TOKEN_PAYLOAD" | jq -r '.clearance // empty')
echo -n "clearance: "
if [ -n "$CLEARANCE" ]; then
  echo -e "${GREEN}✅ $CLEARANCE${NC}"
else
  echo -e "${RED}❌ MISSING${NC}"
fi

# Check countryOfAffiliation
COUNTRY=$(echo "$TOKEN_PAYLOAD" | jq -r '.countryOfAffiliation // empty')
echo -n "countryOfAffiliation: "
if [ -n "$COUNTRY" ]; then
  echo -e "${GREEN}✅ $COUNTRY${NC}"
else
  echo -e "${RED}❌ MISSING${NC}"
fi

# Check acpCOI
ACP_COI=$(echo "$TOKEN_PAYLOAD" | jq -r '.acpCOI // empty')
echo -n "acpCOI: "
if [ -n "$ACP_COI" ]; then
  echo -e "${GREEN}✅ $ACP_COI${NC}"
else
  echo -e "${RED}❌ MISSING${NC}"
fi

# Check ACR (session note)
ACR=$(echo "$TOKEN_PAYLOAD" | jq -r '.acr // empty')
echo -n "acr (AAL): "
if [ -n "$ACR" ]; then
  echo -e "${GREEN}✅ $ACR (AAL1 - password only)${NC}"
else
  echo -e "${RED}❌ MISSING${NC}"
fi

# Check AMR (session note)
AMR=$(echo "$TOKEN_PAYLOAD" | jq -r '.amr // empty')
echo -n "amr (methods): "
if [ -n "$AMR" ]; then
  echo -e "${GREEN}✅ $AMR${NC}"
else
  echo -e "${RED}❌ MISSING${NC}"
fi

# Check auth_time
AUTH_TIME=$(echo "$TOKEN_PAYLOAD" | jq -r '.auth_time // empty')
echo -n "auth_time: "
if [ -n "$AUTH_TIME" ]; then
  echo -e "${GREEN}✅ $AUTH_TIME${NC}"
else
  echo -e "${RED}❌ MISSING${NC}"
fi

echo ""
echo "Step 5: Test classified resource access..."
RESOURCE_ID="doc-generated-1761226224287-1305"
RESOURCE_RESPONSE=$(curl -s -H "Authorization: Bearer $ACCESS_TOKEN" \
  http://localhost:4000/api/resources/${RESOURCE_ID})

RESOURCE_STATUS=$(echo "$RESOURCE_RESPONSE" | jq -r '.error // "success"')

if [ "$RESOURCE_STATUS" = "success" ]; then
  echo -e "${GREEN}✅ Classified resource access GRANTED${NC}"
  echo "$RESOURCE_RESPONSE" | jq '{resourceId, classification, releasabilityTo, COI}'
else
  echo -e "${YELLOW}⚠️  Resource access result:${NC} $RESOURCE_STATUS"
  echo "$RESOURCE_RESPONSE" | jq '.'
fi

echo ""
echo "=========================================="
echo "Phase 1 Complete Summary"
echo "=========================================="
echo ""

# Final validation
ALL_PASS=true

if [ "$ATTRIBUTE_COUNT" -lt "6" ]; then ALL_PASS=false; fi
if [ -z "$UNIQUE_ID" ]; then ALL_PASS=false; fi
if [ -z "$CLEARANCE" ]; then ALL_PASS=false; fi
if [ -z "$COUNTRY" ]; then ALL_PASS=false; fi
if [ -z "$ACP_COI" ]; then ALL_PASS=false; fi
if [ -z "$ACR" ]; then ALL_PASS=false; fi
if [ -z "$AMR" ]; then ALL_PASS=false; fi
if [ -z "$AUTH_TIME" ]; then ALL_PASS=false; fi

if [ "$ALL_PASS" = true ]; then
  echo -e "${GREEN}✅✅✅ SUCCESS - All Phase 1 tests passed!${NC}"
  echo ""
  echo "Verified:"
  echo "  - User attributes persist in database"
  echo "  - JWT tokens contain all required claims"
  echo "  - ACR/AMR session notes working"
  echo "  - auth_time claim present"
  echo "  - DIVE attributes (uniqueID, clearance, country, COI) working"
  echo ""
  echo "Ready for Phase 2: OTP MFA Configuration"
else
  echo -e "${RED}❌ FAILED - Some tests did not pass${NC}"
  exit 1
fi

