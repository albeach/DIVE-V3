#!/bin/bash

# Test Document Access - Verify JWT flow works
# Date: October 21, 2025

echo "🧪 Testing Document Access Flow"
echo "================================"
echo ""

# Check database session
echo "1. Checking database session..."
SESSION=$(docker exec dive-v3-postgres psql -U postgres -d dive_v3_app -t -c 'SELECT "sessionToken" FROM session LIMIT 1;' | tr -d ' ')

if [ -z "$SESSION" ]; then
    echo "❌ NO SESSION FOUND - You need to login first!"
    echo ""
    echo "Go to: http://localhost:3000/login"
    echo "Login with any IdP, then run this test again"
    exit 1
fi

echo "✅ Session found: ${SESSION:0:20}..."
echo ""

# Check account tokens
echo "2. Checking account tokens..."
TOKEN_LEN=$(docker exec dive-v3-postgres psql -U postgres -d dive_v3_app -t -c 'SELECT LENGTH(access_token) FROM account LIMIT 1;' | tr -d ' ')

if [ -z "$TOKEN_LEN" ] || [ "$TOKEN_LEN" -lt "100" ]; then
    echo "❌ NO ACCESS TOKEN FOUND"
    exit 1
fi

echo "✅ Access token exists (${TOKEN_LEN} chars)"
echo ""

# Extract token from database
echo "3. Extracting token from database..."
DB_TOKEN=$(docker exec dive-v3-postgres psql -U postgres -d dive_v3_app -t -c 'SELECT access_token FROM account LIMIT 1;' | tr -d ' \n')

if [ -z "$DB_TOKEN" ]; then
    echo "❌ Could not extract token"
    exit 1
fi

echo "✅ Token extracted"
echo ""

# Test backend with token
echo "4. Testing backend API with database token..."
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  -H "Authorization: Bearer $DB_TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:4000/api/resources/doc-001 2>&1)

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE/d')

echo "HTTP Status: $HTTP_CODE"
echo ""

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "403" ]; then
    echo "✅ Backend JWT validation WORKING"
    echo ""
    echo "Response preview:"
    echo "$BODY" | head -20
    echo ""
    
    if [ "$HTTP_CODE" = "403" ]; then
        echo "Note: 403 Forbidden is OK - means JWT validated but authorization denied"
    fi
elif [ "$HTTP_CODE" = "401" ]; then
    echo "❌ Backend returned 401 Unauthorized"
    echo ""
    echo "Error response:"
    echo "$BODY"
    echo ""
    echo "This means JWT validation failed. Check:"
    echo "  1. Token issuer matches validIssuers in backend"
    echo "  2. Backend is using dual-issuer code"
    echo "  3. Backend restarted after code changes"
else
    echo "❌ Unexpected HTTP code: $HTTP_CODE"
    echo "$BODY"
fi

echo ""
echo "================================"
echo "Test complete"
echo ""
echo "Next: Test from browser"
echo "  1. Go to: http://localhost:3000/resources"
echo "  2. Click on any document"
echo "  3. Should load (or show 403 if not authorized)"
echo ""

