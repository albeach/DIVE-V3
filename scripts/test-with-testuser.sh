#!/bin/bash
# Test with testuser-usa-unclass (properly configured user)

set -e

USERNAME="testuser-usa-unclass"
PASSWORD="Password123!"
RESOURCE_ID="${1:-doc-generated-1762442164745-10321}"

cd /home/mike/Desktop/DIVE-V3/DIVE-V3/terraform
CLIENT_SECRET=$(terraform output -raw usa_client_secret)
cd ..

echo "🔐 Testing with $USERNAME..."
echo ""

# Get token
TOKEN_RESPONSE=$(curl -k -s -X POST \
  "https://localhost:8443/realms/dive-v3-usa/protocol/openid-connect/token" \
  -d "client_id=dive-v3-broker-client" \
  -d "client_secret=$CLIENT_SECRET" \
  -d "grant_type=password" \
  -d "username=$USERNAME" \
  -d "password=$PASSWORD")

ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token')

# Decode access token
echo "📋 Token Claims:"
echo "$ACCESS_TOKEN" | awk -F'.' '{print $2}' | base64 -d 2>/dev/null | jq '{
  acr,
  amr,
  clearance,
  countryOfAffiliation,
  acpCOI,
  uniqueID,
  sub
}' 2>/dev/null || echo "Could not decode"

ACR=$(echo "$ACCESS_TOKEN" | awk -F'.' '{print $2}' | base64 -d 2>/dev/null | jq -r '.acr' 2>/dev/null)
echo ""
echo "✓ ACR value: $ACR"

# Test resource access
echo ""
echo "🌐 Testing resource access..."
RESPONSE=$(curl -k -s -w "\nHTTP_STATUS:%{http_code}" \
  "https://localhost:4000/api/resources/$RESOURCE_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN")

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS:/d')

echo "Status: HTTP $HTTP_CODE"
echo ""

if [ "$HTTP_CODE" == "200" ]; then
  echo "✅ SUCCESS! Access granted"
  echo "$BODY" | jq '{resourceId, title, classification, releasabilityTo, COI}' 2>/dev/null || echo "$BODY"
elif [ "$HTTP_CODE" == "403" ]; then
  echo "❌ Access DENIED"
  echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
else
  echo "⚠️  Unexpected status: $HTTP_CODE"
  echo "$BODY"
fi

echo ""
echo "📊 Recent backend logs:"
docker logs dive-v3-backend 2>&1 | grep -E "AAL|ACR|testuser-usa-unclass" | tail -5





