#!/bin/bash

# Quick Test: Access a Resource with JWT
# Date: October 21, 2025

echo "🔍 Testing Resource Access with JWT Authentication"
echo "===================================================="
echo ""

# Step 1: Check if user is logged in
echo "Step 1: Checking if you're logged in..."
SESSION_COUNT=$(docker exec dive-v3-postgres psql -U postgres -d dive_v3_app -t -c 'SELECT COUNT(*) FROM session;' | tr -d ' ')

if [ "$SESSION_COUNT" = "0" ]; then
    echo "❌ NO SESSION FOUND - You need to login first!"
    echo ""
    echo "📋 Quick Login Steps:"
    echo "1. Open browser: http://localhost:3000"
    echo "2. Click 'Login' button"
    echo "3. Choose any IdP (us-idp, france-idp, canada-idp)"
    echo "4. Login with credentials (testuser-us / Password123!)"
    echo "5. Once logged in, run this script again"
    echo ""
    exit 1
fi

echo "✅ Active sessions found: $SESSION_COUNT"
echo ""

# Step 2: Extract JWT from database
echo "Step 2: Extracting JWT token from session..."
ACCESS_TOKEN=$(docker exec dive-v3-postgres psql -U postgres -d dive_v3_app -t -c 'SELECT access_token FROM account ORDER BY expires_at DESC LIMIT 1;' | tr -d ' \n')

if [ -z "$ACCESS_TOKEN" ] || [ "$ACCESS_TOKEN" = "" ]; then
    echo "❌ No access token found in database"
    echo ""
    echo "This usually means:"
    echo "1. Session expired - try logging in again"
    echo "2. Token not stored properly - check NextAuth configuration"
    echo ""
    exit 1
fi

TOKEN_LENGTH=${#ACCESS_TOKEN}
echo "✅ Token extracted (length: $TOKEN_LENGTH chars)"
echo ""

# Step 3: Test API with token
echo "Step 3: Testing resource access..."
echo "GET /api/resources/doc-generated-1761024050043-0028"
echo ""

RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:4000/api/resources/doc-generated-1761024050043-0028)

HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS/d')

echo "HTTP Status: $HTTP_STATUS"
echo ""

if [ "$HTTP_STATUS" = "200" ]; then
    echo "✅ SUCCESS! Resource accessed successfully"
    echo ""
    echo "Resource Details:"
    echo "$BODY" | jq '{
        resourceId: .resourceId,
        title: .title,
        classification: .classification,
        displayMarking: .displayMarking,
        decision: .decision
    }'
    echo ""
    echo "✅ Authorization Decision:"
    echo "$BODY" | jq '.decision'
    
elif [ "$HTTP_STATUS" = "403" ]; then
    echo "🚫 FORBIDDEN - OPA denied access"
    echo ""
    echo "Reason:"
    echo "$BODY" | jq -r '.message'
    echo ""
    echo "This is EXPECTED if your user doesn't have the required:"
    echo "  • Clearance level"
    echo "  • Country affiliation"
    echo "  • COI membership"
    echo ""
    echo "To test with a valid user:"
    echo "1. Login with: testuser-us (has SECRET clearance, USA country, FVEY COI)"
    echo "2. Access a US-ONLY or FVEY document"
    
elif [ "$HTTP_STATUS" = "401" ]; then
    echo "❌ UNAUTHORIZED - Token invalid or expired"
    echo ""
    echo "Error:"
    echo "$BODY" | jq
    echo ""
    echo "Solution: Login again to get fresh token"
    echo "Visit: http://localhost:3000/login"
    
else
    echo "❌ Unexpected HTTP status: $HTTP_STATUS"
    echo ""
    echo "Response:"
    echo "$BODY" | jq
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📚 Testing Tips:"
echo ""
echo "1. List all resources (no auth required):"
echo "   curl http://localhost:4000/api/resources | jq '.resources[] | {resourceId, classification, COI}' | head -20"
echo ""
echo "2. Find resources you can access:"
echo "   - US-ONLY documents: Need USA country"
echo "   - FVEY documents: Need FVEY COI membership"
echo "   - SECRET documents: Need SECRET clearance"
echo ""
echo "3. Access via frontend UI:"
echo "   http://localhost:3000/resources"
echo ""

