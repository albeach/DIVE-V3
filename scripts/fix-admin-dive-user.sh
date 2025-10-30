#!/bin/bash
set -e

echo "=========================================="
echo "DIVE V3 - Fix admin-dive User Attributes"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

KEYCLOAK_URL="http://localhost:8081"
USER_ID="50242513-9d1c-4842-909d-fa1c0800c3a1"
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

echo "Step 2: Verify user exists..."
USER_EXISTS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  ${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID})

if [ "$USER_EXISTS" = "200" ]; then
  echo -e "${YELLOW}⚠️  User exists - deleting...${NC}"
  
  DELETE_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    ${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID})
  
  if [ "$DELETE_RESPONSE" = "204" ]; then
    echo -e "${GREEN}✅ User deleted successfully${NC}"
  else
    echo -e "${RED}❌ Failed to delete user (HTTP $DELETE_RESPONSE)${NC}"
    exit 1
  fi
else
  echo -e "${YELLOW}⚠️  User not found (will create new)${NC}"
fi
echo ""

echo "Step 3: Remove user from Terraform state..."
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/terraform
terraform state rm 'keycloak_user.broker_super_admin[0]' 2>/dev/null || echo -e "${YELLOW}⚠️  User not in Terraform state${NC}"
echo ""

echo "Step 4: Recreate user via Terraform..."
terraform apply -target=keycloak_user.broker_super_admin -auto-approve

if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Terraform apply failed${NC}"
  exit 1
fi
echo -e "${GREEN}✅ User recreated via Terraform${NC}"
echo ""

echo "Step 5: Get new user ID..."
sleep 2  # Give Keycloak time to sync
NEW_USER_ID=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "${KEYCLOAK_URL}/admin/realms/${REALM}/users?username=admin-dive&exact=true" | jq -r '.[0].id')

if [ -z "$NEW_USER_ID" ] || [ "$NEW_USER_ID" = "null" ]; then
  echo -e "${RED}❌ Failed to get new user ID${NC}"
  exit 1
fi
echo -e "${GREEN}✅ New user ID: ${NEW_USER_ID}${NC}"
echo ""

echo "Step 6: Verify attributes in database..."
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3
docker exec -i dive-v3-postgres psql -U postgres -d keycloak_db <<EOF
SELECT name, value FROM user_attribute WHERE user_id = '${NEW_USER_ID}' ORDER BY name;
EOF

echo ""
echo "Step 7: Verify attributes via Admin API..."
USER_ATTRS=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  ${KEYCLOAK_URL}/admin/realms/${REALM}/users/${NEW_USER_ID} | jq '.attributes')

echo "$USER_ATTRS" | jq '.'
echo ""

# Check for required attributes
REQUIRED_ATTRS=("uniqueID" "clearance" "countryOfAffiliation" "acpCOI")
MISSING_ATTRS=()

for attr in "${REQUIRED_ATTRS[@]}"; do
  if ! echo "$USER_ATTRS" | jq -e "has(\"$attr\")" > /dev/null; then
    MISSING_ATTRS+=("$attr")
  fi
done

if [ ${#MISSING_ATTRS[@]} -eq 0 ]; then
  echo -e "${GREEN}✅✅✅ SUCCESS: All required attributes present!${NC}"
  echo ""
  echo "Next steps:"
  echo "  1. Run: ./scripts/test-admin-dive-claims.sh"
  echo "  2. Test resource access"
  echo "  3. Configure OTP for AAL2 testing"
else
  echo -e "${RED}❌ MISSING ATTRIBUTES: ${MISSING_ATTRS[*]}${NC}"
  echo ""
  echo "Manual fix required - setting attributes via Admin API..."
  
  # Set missing attributes
  curl -X PUT -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    ${KEYCLOAK_URL}/admin/realms/${REALM}/users/${NEW_USER_ID} \
    -d '{
      "attributes": {
        "uniqueID": ["admin-dive"],
        "clearance": ["TOP_SECRET"],
        "countryOfAffiliation": ["USA"],
        "acpCOI": ["NATO-COSMIC", "FVEY", "US-ONLY"]
      }
    }'
  
  echo ""
  echo "Attributes set via Admin API - verifying..."
  sleep 2
  
  USER_ATTRS=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
    ${KEYCLOAK_URL}/admin/realms/${REALM}/users/${NEW_USER_ID} | jq '.attributes')
  echo "$USER_ATTRS" | jq '.'
fi

echo ""
echo "=========================================="
echo "Fix Complete!"
echo "=========================================="

