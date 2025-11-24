#!/bin/bash
# Test script to diagnose IdP API response

echo "🧪 Testing IdP API Endpoint"
echo "============================"
echo ""

# Step 1: Get admin token from Keycloak
echo "1️⃣  Getting admin token from Keycloak..."
KEYCLOAK_TOKEN=$(curl -s -X POST \
  "http://localhost:8081/realms/dive-v3-broker/protocol/openid-connect/token" \
  -d "client_id=dive-v3-client" \
  -d "username=john.doe@mil" \
  -d "password=Password123!" \
  -d "grant_type=password" \
  | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$KEYCLOAK_TOKEN" ]; then
    echo "❌ Failed to get Keycloak token"
    exit 1
fi

echo "✅ Got token: ${KEYCLOAK_TOKEN:0:20}..."
echo ""

# Step 2: Call backend API
echo "2️⃣  Calling backend /api/admin/idps..."
RESPONSE=$(curl -s \
  "http://localhost:3001/api/admin/idps" \
  -H "Authorization: Bearer $KEYCLOAK_TOKEN" \
  -H "Content-Type: application/json")

echo "📦 Response:"
echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
echo ""

# Step 3: Check protocol values
echo "3️⃣  Checking protocol values..."
echo "$RESPONSE" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    if data.get('success') and data.get('data', {}).get('idps'):
        idps = data['data']['idps']
        print(f'Found {len(idps)} IdPs:')
        for idp in idps:
            protocol = idp.get('protocol', 'UNDEFINED')
            status = '✅' if protocol in ['oidc', 'saml'] else '❌'
            print(f'  {status} {idp.get(\"alias\")}: protocol={protocol} (enabled={idp.get(\"enabled\")})')
    else:
        print('❌ No IdP data in response')
except Exception as e:
    print(f'❌ Error parsing response: {e}')
"

echo ""
echo "✅ Test complete!"

