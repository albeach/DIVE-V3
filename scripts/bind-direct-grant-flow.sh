#!/bin/bash
# Fix Keycloak 26 Direct Grant - Bind Custom Flow

set -e

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8081}"
ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:-admin}"

echo "🔧 Binding Direct Grant MFA flow to dive-v3-broker realm..."
echo ""

# Step 1: Get admin token
echo "Getting admin token..."
ADMIN_TOKEN=$(curl -s -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=$ADMIN_USER" \
  -d "password=$ADMIN_PASS" \
  -d 'grant_type=password' \
  -d 'client_id=admin-cli' | jq -r '.access_token')

if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "null" ]; then
    echo "❌ Failed to get admin token"
    exit 1
fi

echo "✅ Admin token obtained"
echo ""

# Step 2: Get the Direct Grant MFA flow ID
echo "Finding Direct Grant MFA flow..."
FLOW_ALIAS="Direct%20Grant%20with%20Conditional%20MFA%20-%20DIVE%20V3%20Broker"
FLOW_DATA=$(curl -s -X GET "$KEYCLOAK_URL/admin/realms/dive-v3-broker/authentication/flows" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

FLOW_ID=$(echo "$FLOW_DATA" | jq -r '.[] | select(.alias == "Direct Grant with Conditional MFA - DIVE V3 Broker") | .id')

if [ -z "$FLOW_ID" ] || [ "$FLOW_ID" = "null" ]; then
    echo "❌ Direct Grant MFA flow not found"
    echo "Available flows:"
    echo "$FLOW_DATA" | jq -r '.[].alias'
    exit 1
fi

echo "✅ Found flow ID: $FLOW_ID"
echo ""

# Step 3: Update realm to use this flow for Direct Grant
echo "Binding flow to realm..."
curl -s -X PUT "$KEYCLOAK_URL/admin/realms/dive-v3-broker" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"directGrantFlow\": \"Direct Grant with Conditional MFA - DIVE V3 Broker\"
  }"

echo "✅ Flow bound to realm"
echo ""

# Step 4: Verify
echo "Verifying configuration..."
REALM_DATA=$(curl -s -X GET "$KEYCLOAK_URL/admin/realms/dive-v3-broker" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

CURRENT_FLOW=$(echo "$REALM_DATA" | jq -r '.directGrantFlow')

if [ "$CURRENT_FLOW" = "Direct Grant with Conditional MFA - DIVE V3 Broker" ]; then
    echo "✅ SUCCESS! Direct Grant flow is now: $CURRENT_FLOW"
    echo ""
    echo "Next step: Test authentication to verify ACR/AMR claims"
    echo "Run: ./scripts/test-admin-dive-claims.sh"
else
    echo "⚠️  Flow binding may have failed"
    echo "Current flow: $CURRENT_FLOW"
    exit 1
fi
