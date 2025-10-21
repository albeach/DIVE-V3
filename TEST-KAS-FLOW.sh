#!/bin/bash

# Test KAS Decryption Flow
# Date: October 21, 2025

echo "🔑 Testing KAS Decryption Flow"
echo "==============================="
echo ""

# Get token from database
TOKEN=$(docker exec dive-v3-postgres psql -U postgres -d dive_v3_app -t -c 'SELECT access_token FROM account LIMIT 1;' | tr -d ' \n' | head -c 2000)

if [ -z "$TOKEN" ]; then
    echo "❌ No token found - login first"
    exit 1
fi

echo "✅ Token extracted from database"
echo ""

# Test 1: Verify KAS environment
echo "1. Checking KAS environment..."
docker exec dive-v3-kas sh -c 'echo "  KEYCLOAK_URL=$KEYCLOAK_URL"; echo "  KEYCLOAK_REALM=$KEYCLOAK_REALM"; echo "  OPA_URL=$OPA_URL"'
echo ""

# Test 2: Check KAS health
echo "2. Checking KAS health..."
curl -s http://localhost:8080/health | jq -r '.status, .message'
echo ""

# Test 3: Test KAS key request
echo "3. Testing KAS key request..."
RESPONSE=$(curl -s -w "\nHTTP:%{http_code}" -X POST http://localhost:8080/request-key \
  -H "Content-Type: application/json" \
  -d "{
    \"resourceId\": \"doc-multi-1-1760612060056\",
    \"kaoId\": \"kao-doc-multi-1-1760612060056\",
    \"wrappedKey\": \"test-wrapped-key\",
    \"bearerToken\": \"$TOKEN\"
  }")

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP:/d')

echo "HTTP Status: $HTTP_CODE"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ KAS Key Released Successfully"
    echo "$BODY" | jq -r '.success, .denialReason // "N/A"'
elif [ "$HTTP_CODE" = "401" ]; then
    echo "❌ JWT Verification Failed"
    echo "$BODY" | jq '.'
elif [ "$HTTP_CODE" = "403" ]; then
    echo "⚠️  Policy Denied (but JWT validated)"
    echo "$BODY" | jq '.denialReason'
else
    echo "❌ Unexpected response"
    echo "$BODY"
fi

echo ""
echo "==============================="
echo ""

# Check KAS logs
echo "Recent KAS logs:"
docker logs dive-v3-kas 2>&1 | tail -30 | grep -E "KAS key request|JWT verification|Policy Re-Evaluation|error"
echo ""

