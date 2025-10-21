#!/bin/bash
# ============================================
# Diagnose admin-dive JWT Token Issues
# ============================================

set -e

echo "🔍 DIVE V3 - Admin-Dive JWT Diagnostic Tool"
echo "==========================================="
echo ""

KEYCLOAK_URL="http://localhost:8081"
REALM="dive-v3-broker"
CLIENT_ID="dive-v3-client-broker"
CLIENT_SECRET="8AcfbgtdNIZp3tbrcmc2voiUfxNb8d6L"

# Get admin token from master realm
echo "1️⃣  Getting Keycloak admin token..."
ADMIN_TOKEN=$(curl -s -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r '.access_token')

if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "null" ]; then
  echo "❌ Failed to get admin token"
  exit 1
fi
echo "✅ Got admin token"
echo ""

# Check if admin-dive user exists
echo "2️⃣  Checking admin-dive user in $REALM..."
USER_DATA=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users?username=admin-dive&exact=true" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.[0]')

if [ -z "$USER_DATA" ] || [ "$USER_DATA" = "null" ]; then
  echo "❌ admin-dive user not found in $REALM"
  exit 1
fi

USER_ID=$(echo "$USER_DATA" | jq -r '.id')
echo "✅ Found user: $USER_ID"
echo ""

# Display user attributes
echo "3️⃣  User Attributes:"
echo "$USER_DATA" | jq '.attributes'
echo ""

# Check client configuration
echo "4️⃣  Checking client configuration..."
CLIENT_DATA=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/clients?clientId=${CLIENT_ID}" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.[0]')

if [ -z "$CLIENT_DATA" ] || [ "$CLIENT_DATA" = "null" ]; then
  echo "❌ Client $CLIENT_ID not found"
  exit 1
fi

echo "Client ID: $(echo "$CLIENT_DATA" | jq -r '.clientId')"
echo "Direct Access Grants Enabled: $(echo "$CLIENT_DATA" | jq -r '.directAccessGrantsEnabled')"
echo "Standard Flow Enabled: $(echo "$CLIENT_DATA" | jq -r '.standardFlowEnabled')"
echo "Service Accounts Enabled: $(echo "$CLIENT_DATA" | jq -r '.serviceAccountsEnabled')"
echo ""

# Check protocol mappers
echo "5️⃣  Checking protocol mappers for custom attributes..."
PROTOCOL_MAPPERS=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/clients/$(echo "$CLIENT_DATA" | jq -r '.id')/protocol-mappers/models" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

echo "Protocol Mappers for DIVE attributes:"
echo "$PROTOCOL_MAPPERS" | jq '[.[] | select(.name == "uniqueID" or .name == "clearance" or .name == "countryOfAffiliation" or .name == "acpCOI")] | map({name, protocolMapper, config: .config."claim.name"})'
echo ""

# Test token generation via authorization code flow simulation
echo "6️⃣  Testing standard authorization flow (browser-based)..."
echo "   Note: Direct access grants are disabled, so we can't test password grant here"
echo "   The admin-dive user must log in via the browser at:"
echo "   ${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/auth?client_id=${CLIENT_ID}&redirect_uri=http://localhost:3000/api/auth/callback/keycloak&response_type=code&scope=openid%20profile%20email%20offline_access"
echo ""

# Check realm token settings
echo "7️⃣  Realm token settings..."
REALM_DATA=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

echo "Access Token Lifespan: $(echo "$REALM_DATA" | jq -r '.accessTokenLifespan')s"
echo "SSO Session Idle: $(echo "$REALM_DATA" | jq -r '.ssoSessionIdleTimeout')s"
echo "SSO Session Max: $(echo "$REALM_DATA" | jq -r '.ssoSessionMaxLifespan')s"
echo "Offline Session Idle: $(echo "$REALM_DATA" | jq -r '.offlineSessionIdleTimeout')s"
echo ""

# Check if user has required roles
echo "8️⃣  Checking user roles..."
USER_ROLES=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}/role-mappings/realm" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

echo "User Realm Roles:"
echo "$USER_ROLES" | jq '[.[] | .name]'
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 DIAGNOSTIC SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "User: admin-dive"
echo "Realm: $REALM"
echo "Client: $CLIENT_ID"
echo ""
echo "Next Steps for Troubleshooting:"
echo "1. Ensure the user can log in via browser (standard OAuth flow)"
echo "2. Check browser console for any NextAuth errors"
echo "3. Verify JWT token contains all required claims (uniqueID, clearance, countryOfAffiliation)"
echo "4. Check backend logs for JWT verification errors"
echo ""
echo "To test login:"
echo "  1. Visit: http://localhost:3000"
echo "  2. Click 'Login as Super Administrator' (Broker Realm)"
echo "  3. Login with: admin-dive / DiveAdmin2025!"
echo "  4. Open browser console and check session: await fetch('/api/auth/session').then(r => r.json())"
echo ""

