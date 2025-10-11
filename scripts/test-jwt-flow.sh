#!/bin/bash

echo "=== DIVE V3 Complete JWT Flow Test ==="
echo ""

# Get client secret
CLIENT_SECRET=$(cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/terraform && terraform output -raw client_secret 2>/dev/null)

if [ -z "$CLIENT_SECRET" ]; then
    echo "❌ Could not get client secret from Terraform"
    exit 1
fi

echo "1. Get tokens from Keycloak directly:"
echo "=================================="
TOKEN_RESPONSE=$(curl -s -X POST "http://localhost:8081/realms/dive-v3-pilot/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=dive-v3-client" \
  -d "client_secret=$CLIENT_SECRET" \
  -d "username=testuser-us" \
  -d "password=Password123!")

ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token')
ID_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.id_token')

if [ "$ACCESS_TOKEN" = "null" ] || [ -z "$ACCESS_TOKEN" ]; then
    echo "❌ Failed to get access token:"
    echo "$TOKEN_RESPONSE" | jq
    exit 1
fi

echo "✅ Got access token (${#ACCESS_TOKEN} bytes)"
echo "✅ Got ID token (${#ID_TOKEN} bytes)"

echo ""
echo "2. Decode token headers:"
echo "=================================="
ACCESS_HEADER=$(echo "$ACCESS_TOKEN" | cut -d. -f1 | base64 -d 2>/dev/null | jq)
echo "Access token header:"
echo "$ACCESS_HEADER" | jq '{kid, alg, typ}'

ID_HEADER=$(echo "$ID_TOKEN" | cut -d. -f1 | base64 -d 2>/dev/null | jq)
echo ""
echo "ID token header:"
echo "$ID_HEADER" | jq '{kid, alg, typ}'

echo ""
echo "3. Check JWKS endpoint:"
echo "=================================="
echo "Available signing keys in JWKS:"
curl -s http://localhost:8081/realms/dive-v3-pilot/protocol/openid-connect/certs | jq '.keys[] | {kid, alg, use, kty}'

echo ""
echo "4. Verify key IDs match:"
echo "=================================="
ACCESS_KID=$(echo "$ACCESS_TOKEN" | cut -d. -f1 | base64 -d 2>/dev/null | jq -r '.kid')
JWKS_KIDS=$(curl -s http://localhost:8081/realms/dive-v3-pilot/protocol/openid-connect/certs | jq -r '.keys[].kid')

echo "Access token kid: $ACCESS_KID"
echo "Available JWKS kids:"
echo "$JWKS_KIDS"

if echo "$JWKS_KIDS" | grep -q "$ACCESS_KID"; then
    echo "✅ Token kid matches JWKS"
else
    echo "❌ Token kid NOT in JWKS - this is the problem!"
fi

echo ""
echo "5. Test backend JWT verification:"
echo "=================================="
BACKEND_RESPONSE=$(curl -s -X GET "http://localhost:4000/api/resources/doc-nato-ops-001" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json")

if echo "$BACKEND_RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
    echo "❌ Backend rejected token:"
    echo "$BACKEND_RESPONSE" | jq
else
    echo "✅ Backend accepted token:"
    echo "$BACKEND_RESPONSE" | jq '.resourceId, .classification' 2>/dev/null
fi

echo ""
echo "6. Decode token payload (custom claims):"
echo "=================================="
echo "$ACCESS_TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq '{
  sub,
  preferred_username,
  uniqueID,
  clearance,
  countryOfAffiliation,
  acpCOI,
  exp,
  iat
}'

echo ""
echo "=== End Test ==="

