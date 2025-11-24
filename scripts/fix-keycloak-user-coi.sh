#!/bin/bash

# ============================================
# Fix Keycloak User COI Attributes
# ============================================
# Keycloak 23.0.7 Admin REST API Script
# Properly sets acpCOI as array, not JSON string

set -e

echo "=== Fixing Keycloak User COI Attributes ==="
echo ""

KEYCLOAK_URL="http://localhost:8081"
REALM="dive-v3-broker"
ADMIN_USER="admin"
ADMIN_PASS="admin"

# Step 1: Get admin access token for master realm
echo "1. Getting admin access token..."
ADMIN_TOKEN=$(curl -s -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=${ADMIN_USER}" \
  -d "password=${ADMIN_PASS}" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r '.access_token')

if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "null" ]; then
  echo "❌ Failed to get admin token"
  exit 1
fi

echo "✅ Got admin token"

# Step 2: Get user ID for testuser-us
echo ""
echo "2. Getting user ID for testuser-us..."
USER_DATA=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users?username=testuser-us&exact=true" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json")

USER_ID=$(echo "$USER_DATA" | jq -r '.[0].id')

if [ -z "$USER_ID" ] || [ "$USER_ID" = "null" ]; then
  echo "❌ User not found"
  echo "Response: $USER_DATA"
  exit 1
fi

echo "✅ Found user: $USER_ID"

# Step 3: Get current attributes
echo ""
echo "3. Current user attributes:"
CURRENT_ATTRS=$(echo "$USER_DATA" | jq '.[0].attributes')
echo "$CURRENT_ATTRS" | jq

# Step 4: Update user attributes with proper array format
echo ""
echo "4. Updating acpCOI attribute (proper array format)..."

# Build the update payload
# Keycloak expects user attributes as key-value pairs where values are arrays of strings
UPDATE_PAYLOAD=$(cat <<EOF
{
  "attributes": {
    "uniqueID": ["john.doe@mil"],
    "clearance": ["SECRET"],
    "countryOfAffiliation": ["USA"],
    "acpCOI": ["NATO-COSMIC", "FVEY"]
  }
}
EOF
)

echo "Update payload:"
echo "$UPDATE_PAYLOAD" | jq

# Apply the update
UPDATE_RESPONSE=$(curl -s -w "\n%{http_code}" -X PUT "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$UPDATE_PAYLOAD")

HTTP_CODE=$(echo "$UPDATE_RESPONSE" | tail -1)
RESPONSE_BODY=$(echo "$UPDATE_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "204" ] || [ "$HTTP_CODE" = "200" ]; then
  echo "✅ User updated successfully (HTTP $HTTP_CODE)"
else
  echo "❌ Update failed (HTTP $HTTP_CODE)"
  echo "Response: $RESPONSE_BODY"
  exit 1
fi

# Step 5: Verify the update
echo ""
echo "5. Verifying updated attributes..."
UPDATED_DATA=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}")

echo "Updated acpCOI:"
echo "$UPDATED_DATA" | jq '.attributes.acpCOI'

# Step 6: Update other test users
echo ""
echo "6. Updating testuser-us-confid..."
USER_CONFID_DATA=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users?username=testuser-us-confid&exact=true" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}")
USER_CONFID_ID=$(echo "$USER_CONFID_DATA" | jq -r '.[0].id')

if [ -n "$USER_CONFID_ID" ] && [ "$USER_CONFID_ID" != "null" ]; then
  curl -s -X PUT "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_CONFID_ID}" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{
      "attributes": {
        "uniqueID": ["jane.smith@mil"],
        "clearance": ["CONFIDENTIAL"],
        "countryOfAffiliation": ["USA"],
        "acpCOI": ["FVEY"]
      }
    }' > /dev/null
  echo "✅ Updated testuser-us-confid"
else
  echo "⚠️  testuser-us-confid not found"
fi

echo ""
echo "7. Updating testuser-us-unclass..."
USER_UNCLASS_DATA=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users?username=testuser-us-unclass&exact=true" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}")
USER_UNCLASS_ID=$(echo "$USER_UNCLASS_DATA" | jq -r '.[0].id')

if [ -n "$USER_UNCLASS_ID" ] && [ "$USER_UNCLASS_ID" != "null" ]; then
  curl -s -X PUT "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_UNCLASS_ID}" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{
      "attributes": {
        "uniqueID": ["bob.jones@mil"],
        "clearance": ["UNCLASSIFIED"],
        "countryOfAffiliation": ["USA"],
        "acpCOI": []
      }
    }' > /dev/null
  echo "✅ Updated testuser-us-unclass"
else
  echo "⚠️  testuser-us-unclass not found"
fi

echo ""
echo "=== Fix Complete ==="
echo ""
echo "Next steps:"
echo "1. Logout from the application"
echo "2. Clear database sessions: docker exec dive-v3-postgres psql -U postgres -d dive_v3_app -c \"DELETE FROM account; DELETE FROM session;\""
echo "3. Login fresh to get new tokens with correct COI format"
echo "4. Test document access"
echo ""

