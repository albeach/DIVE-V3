#!/bin/bash
# Manually fix admin-dive attributes via Keycloak Admin API (Full Update)

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

# Get current user data
echo "Fetching current user data..."
CURRENT_USER=$(curl -s -X GET "$KEYCLOAK_URL/admin/realms/dive-v3-broker/users/$USER_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

echo "Current attributes: $(echo "$CURRENT_USER" | jq '.attributes')"
echo ""

# Update user with full object + new attributes
echo "Updating user with attributes..."
UPDATED_USER=$(echo "$CURRENT_USER" | jq '.attributes = {
  "uniqueID": ["admin@dive-v3.pilot"],
  "clearance": ["TOP_SECRET"],
  "countryOfAffiliation": ["USA"],
  "acpCOI": ["NATO-COSMIC", "FVEY", "CAN-US"],
  "dutyOrg": ["DIVE_ADMIN"],
  "orgUnit": ["SYSTEM_ADMINISTRATION"]
}')

curl -s -X PUT "$KEYCLOAK_URL/admin/realms/dive-v3-broker/users/$USER_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$UPDATED_USER"

echo "✅ User updated"
echo ""

# Verify
echo "Verifying attributes..."
sleep 2
USER_DATA=$(curl -s -X GET "$KEYCLOAK_URL/admin/realms/dive-v3-broker/users/$USER_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

ATTRIBUTES=$(echo "$USER_DATA" | jq '.attributes')
CLEARANCE=$(echo "$USER_DATA" | jq -r '.attributes.clearance[0] // "MISSING"')
UNIQUE_ID=$(echo "$USER_DATA" | jq -r '.attributes.uniqueID[0] // "MISSING"')

echo "Attributes after update:"
echo "$ATTRIBUTES" | jq
echo ""

if [ "$CLEARANCE" = "TOP_SECRET" ] && [ "$UNIQUE_ID" = "admin@dive-v3.pilot" ]; then
    echo "✅ SUCCESS! Attributes are now set"
    echo ""
    echo "Next step: Test authentication"
    echo "Run: ./scripts/test-admin-dive-claims.sh"
    exit 0
else
    echo "❌ Verification failed"
    echo "   Clearance: $CLEARANCE (expected TOP_SECRET)"
    echo "   uniqueID: $UNIQUE_ID (expected admin@dive-v3.pilot)"
    exit 1
fi

