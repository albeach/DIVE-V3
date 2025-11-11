#!/bin/bash

# Set ACR/AMR attributes for john.doe user via Keycloak Admin API

set -e

KEYCLOAK_URL="https://localhost:8443"
REALM="dive-v3-usa"
USERNAME="john.doe"
ADMIN_USER="admin"
ADMIN_PASS="admin"

echo "Getting admin token..."
ADMIN_TOKEN=$(curl -k -s -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli" \
  -d "username=$ADMIN_USER" \
  -d "password=$ADMIN_PASS" \
  -d "grant_type=password" | jq -r '.access_token')

if [ "$ADMIN_TOKEN" == "null" ] || [ -z "$ADMIN_TOKEN" ]; then
  echo "Failed to get admin token"
  exit 1
fi

echo "Getting user ID..."
USER_ID=$(curl -k -s -X GET "$KEYCLOAK_URL/admin/realms/$REALM/users?username=$USERNAME&exact=true" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '.[0].id')

if [ "$USER_ID" == "null" ] || [ -z "$USER_ID" ]; then
  echo "User not found: $USERNAME"
  exit 1
fi

echo "User ID: $USER_ID"

echo "Updating user attributes..."
curl -k -s -X PUT "$KEYCLOAK_URL/admin/realms/$REALM/users/$USER_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "attributes": {
      "uniqueID": ["550e8400-e29b-41d4-a716-446655440001"],
      "clearance": ["SECRET"],
      "countryOfAffiliation": ["USA"],
      "acpCOI": ["[\"NATO-COSMIC\",\"FVEY\"]"],
      "dutyOrg": ["US_ARMY"],
      "orgUnit": ["CYBER_DEFENSE"],
      "acr": ["1"],
      "amr": ["[\"pwd\",\"otp\"]"]
    }
  }'

echo ""
echo "✓ User attributes updated successfully"
echo ""
echo "Now please:"
echo "1. Logout from the web UI"
echo "2. Clear browser cookies/cache"
echo "3. Login again"
echo "4. Try accessing the document again"



