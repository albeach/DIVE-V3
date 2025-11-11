#!/bin/bash

# Get fresh token and test with correct secret

REALM="dive-v3-usa"
USERNAME="${1:-john.doe}"
PASSWORD="${2:-Password123!}"
RESOURCE_ID="${3:-doc-generated-1762442164745-10321}"

# Get client secret from Terraform
cd /home/mike/Desktop/DIVE-V3/DIVE-V3/terraform
CLIENT_SECRET=$(terraform output -raw usa_client_secret 2>/dev/null)

if [ -z "$CLIENT_SECRET" ]; then
  echo "❌ Could not get client secret from Terraform"
  exit 1
fi

echo "🔑 Getting fresh token with correct client secret..."
TOKEN_RESPONSE=$(curl -k -s -X POST \
  "https://localhost:8443/realms/$REALM/protocol/openid-connect/token" \
  -d "client_id=dive-v3-broker-client" \
  -d "client_secret=$CLIENT_SECRET" \
  -d "grant_type=password" \
  -d "username=$USERNAME" \
  -d "password=$PASSWORD")

if echo "$TOKEN_RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
  echo "❌ Token request failed:"
  echo "$TOKEN_RESPONSE" | jq .
  exit 1
fi

ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token')
ID_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.id_token')

echo "✅ Token obtained!"
echo ""

# Decode and check claims
echo "📋 Token Claims:"
ID_PAYLOAD=$(echo "$ID_TOKEN" | cut -d'.' -f2 | base64 -d 2>/dev/null)
echo "$ID_PAYLOAD" | jq '{acr, amr, clearance, countryOfAffiliation}'

ACR=$(echo "$ID_PAYLOAD" | jq -r '.acr')
AMR=$(echo "$ID_PAYLOAD" | jq -r '.amr')

echo ""
if [ "$ACR" == "1" ] || [ "$ACR" == "2" ]; then
  echo "✅ ACR is correct: $ACR (AAL2+)"
else
  echo "❌ ACR is wrong: $ACR (should be 1 or 2)"
  echo "   This token will still fail!"
  exit 1
fi

echo ""
echo "🌐 Testing backend access..."
RESPONSE=$(curl -k -s -w "\n%{http_code}" \
  "https://localhost:4000/api/resources/$RESOURCE_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$ d')

if [ "$HTTP_CODE" == "200" ]; then
  echo "✅ SUCCESS! Access granted (HTTP 200)"
  echo ""
  echo "Resource:"
  echo "$BODY" | jq '{resourceId, title, classification, releasabilityTo}'
elif [ "$HTTP_CODE" == "403" ]; then
  echo "❌ DENIED (HTTP 403)"
  echo "$BODY" | jq .
else
  echo "❌ Error: HTTP $HTTP_CODE"
  echo "$BODY"
fi



