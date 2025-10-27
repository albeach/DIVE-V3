#!/bin/bash
# Manually fix admin-dive attributes via Keycloak Admin API

set -e

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8081}"
ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
USER_ID="50242513-9d1c-4842-909d-fa1c0800c3a1"

echo "🔧 Fixing admin-dive user attributes..."
echo ""

# Get admin token
ADMIN_TOKEN=$(curl -s -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=$ADMIN_USER" \
  -d "password=$ADMIN_PASS" \
  -d 'grant_type=password' \
  -d 'client_id=admin-cli' | jq -r '.access_token')

echo "✅ Admin token obtained"
echo ""

# Update user with attributes
echo "Updating user attributes..."
curl -s -X PUT "$KEYCLOAK_URL/admin/realms/dive-v3-broker/users/$USER_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "attributes": {
      "uniqueID": ["admin@dive-v3.pilot"],
      "clearance": ["TOP_SECRET"],
      "countryOfAffiliation": ["USA"],
      "acpCOI": ["NATO-COSMIC", "FVEY", "CAN-US"],
      "dutyOrg": ["DIVE_ADMIN"],
      "orgUnit": ["SYSTEM_ADMINISTRATION"]
    }
  }'

echo "✅ Attributes updated"
echo ""

# Verify
echo "Verifying attributes..."
USER_DATA=$(curl -s -X GET "$KEYCLOAK_URL/admin/realms/dive-v3-broker/users/$USER_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

CLEARANCE=$(echo "$USER_DATA" | jq -r '.attributes.clearance[0]')
UNIQUE_ID=$(echo "$USER_DATA" | jq -r '.attributes.uniqueID[0]')

if [ "$CLEARANCE" = "TOP_SECRET" ] && [ "$UNIQUE_ID" = "admin@dive-v3.pilot" ]; then
    echo "✅ SUCCESS! Attributes are now set:"
    echo "$USER_DATA" | jq '.attributes'
    echo ""
    echo "Next step: Test authentication"
    echo "Run: ./scripts/test-admin-dive-claims.sh"
else
    echo "❌ Verification failed"
    echo "$USER_DATA" | jq '.attributes'
    exit 1
fi

