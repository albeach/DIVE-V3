#!/bin/bash
# Check admin-dive user attributes and claims

set -e

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8081}"
ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:-admin}"

echo "🔍 Checking admin-dive user configuration..."
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

# Get admin-dive user
echo "Finding admin-dive user..."
USER_DATA=$(curl -s -X GET "$KEYCLOAK_URL/admin/realms/dive-v3-broker/users?username=admin-dive" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

USER_ID=$(echo "$USER_DATA" | jq -r '.[0].id')
USERNAME=$(echo "$USER_DATA" | jq -r '.[0].username')

if [ -z "$USER_ID" ] || [ "$USER_ID" = "null" ]; then
    echo "❌ admin-dive user not found"
    exit 1
fi

echo "✅ Found user: $USERNAME (ID: $USER_ID)"
echo ""

# Get full user details
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 User Attributes"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
FULL_USER=$(curl -s -X GET "$KEYCLOAK_URL/admin/realms/dive-v3-broker/users/$USER_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

echo "$FULL_USER" | jq '.attributes'
echo ""

# Check for required attributes
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Required Attribute Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
UNIQUE_ID=$(echo "$FULL_USER" | jq -r '.attributes.uniqueID[0] // "MISSING"')
CLEARANCE=$(echo "$FULL_USER" | jq -r '.attributes.clearance[0] // "MISSING"')
COUNTRY=$(echo "$FULL_USER" | jq -r '.attributes.countryOfAffiliation[0] // "MISSING"')
COI=$(echo "$FULL_USER" | jq -r '.attributes.acpCOI // "MISSING"')

echo "  uniqueID:             $UNIQUE_ID"
echo "  clearance:            $CLEARANCE"
echo "  countryOfAffiliation: $COUNTRY"
echo "  acpCOI:               $COI"
echo ""

if [ "$UNIQUE_ID" = "MISSING" ] || [ "$CLEARANCE" = "MISSING" ]; then
    echo "⚠️  USER ATTRIBUTES ARE MISSING!"
    echo ""
    echo "This is the root cause of the problem."
    echo "The user needs attributes for the protocol mappers to work."
    echo ""
    echo "Fix: Run Terraform attribute sync script"
    echo "  terraform/scripts/terraform-sync-attributes.sh"
    exit 1
fi

echo "✅ User has required attributes"
echo ""

# Check client scopes
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Client Scopes for dive-v3-client-broker"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

CLIENT_DATA=$(curl -s -X GET "$KEYCLOAK_URL/admin/realms/dive-v3-broker/clients?clientId=dive-v3-client-broker" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

CLIENT_ID=$(echo "$CLIENT_DATA" | jq -r '.[0].id')
echo "Client ID: $CLIENT_ID"
echo ""

# Get default scopes
DEFAULT_SCOPES=$(curl -s -X GET "$KEYCLOAK_URL/admin/realms/dive-v3-broker/clients/$CLIENT_ID/default-client-scopes" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

echo "Default scopes:"
echo "$DEFAULT_SCOPES" | jq -r '.[].name' | while read scope; do
    echo "  - $scope"
done
echo ""

# Check if 'basic' scope is included
HAS_BASIC=$(echo "$DEFAULT_SCOPES" | jq -r '.[].name' | grep -c "^basic$" || true)

if [ "$HAS_BASIC" -eq 0 ]; then
    echo "❌ 'basic' scope is MISSING!"
    echo "   This scope provides the auth_time claim"
    echo "   Fix: Add 'basic' to default scopes in Terraform"
else
    echo "✅ 'basic' scope is present"
fi

