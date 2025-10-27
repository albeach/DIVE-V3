#!/bin/bash
# ============================================
# Check Claims in Current Browser Session
# ============================================
# This script helps you decode the JWT token from your current browser session
# to verify ACR, AMR, and auth_time claims are present.
#
# Usage:
#   1. Login to http://localhost:3000
#   2. Open browser DevTools → Application/Storage → Cookies
#   3. Copy the value of the session cookie
#   4. Run: ./scripts/check-current-session-claims.sh

set -e

echo "🔍 DIVE V3 - Session Token Claims Checker"
echo "==========================================="
echo ""
echo "Since the broker realm uses Authorization Code Flow (not Direct Grant),"
echo "you need to extract the token from your current browser session."
echo ""
echo "📋 Steps to Check Your Current Session Claims:"
echo ""
echo "1. Open http://localhost:3000 in your browser"
echo "2. Make sure you're logged in as admin-dive"
echo "3. Open Browser DevTools (F12 or Cmd+Option+I)"
echo "4. Go to: Application tab → Cookies → http://localhost:3000"
echo "5. Look for cookie named: 'authjs.session-token' or similar"
echo "6. Copy the cookie value"
echo ""
echo "OR - Use the Backend API:"
echo ""
echo "If you can access the backend logs, the JWT token is logged on each request."
echo "Run: docker logs dive-v3-backend --tail=50 | grep 'access_token'"
echo ""
echo "---"
echo ""
echo "🔧 Alternative: Test with USA Realm (Direct Grant Enabled)"
echo ""
echo "The USA realm has direct_access_grants_enabled = true, so you can test there:"
echo ""

# Get client secret from terraform
USA_CLIENT_SECRET=$(cd terraform && terraform output -raw client_secret 2>/dev/null || echo "")

if [ -z "$USA_CLIENT_SECRET" ]; then
    echo "⚠️  Could not read client secret from terraform output"
    echo "   Run: cd terraform && terraform output client_secret"
    exit 1
fi

echo "Getting token from USA realm..."
echo ""

RESPONSE=$(curl -s -X POST http://localhost:8081/realms/dive-v3-usa/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=dive-v3-broker-client" \
  -d "client_secret=$USA_CLIENT_SECRET" \
  -d "username=john.doe" \
  -d "password=Password123!" \
  -d "grant_type=password")

# Check if we got an error
if echo "$RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
    echo "❌ Token request failed:"
    echo "$RESPONSE" | jq
    echo ""
    echo "This might be because:"
    echo "  1. User john.doe doesn't exist in dive-v3-usa realm"
    echo "  2. Password is incorrect"
    echo "  3. Client credentials are wrong"
    echo "  4. MFA is required but OTP not provided"
    exit 1
fi

TOKEN=$(echo "$RESPONSE" | jq -r '.access_token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
    echo "❌ No access token received"
    echo "Response:"
    echo "$RESPONSE" | jq
    exit 1
fi

echo "✅ Token received from USA realm!"
echo ""
echo "Decoding JWT payload..."
echo ""

# Decode JWT (split by . and decode the payload part)
PAYLOAD=$(echo "$TOKEN" | cut -d'.' -f2)

# Add padding if needed (JWT base64 doesn't use padding)
case $((${#PAYLOAD} % 4)) in
    2) PAYLOAD="${PAYLOAD}==" ;;
    3) PAYLOAD="${PAYLOAD}=" ;;
esac

DECODED=$(echo "$PAYLOAD" | base64 -d 2>/dev/null || echo "$PAYLOAD" | base64 -D 2>/dev/null)

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎫 JWT Token Claims"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Pretty print the full payload
echo "$DECODED" | jq '.'

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔐 AAL2/FAL2 Relevant Claims"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

ACR=$(echo "$DECODED" | jq -r '.acr // "MISSING"')
AMR=$(echo "$DECODED" | jq -r '.amr // "MISSING"')
AUTH_TIME=$(echo "$DECODED" | jq -r '.auth_time // "MISSING"')

echo "  acr (Authentication Context):     $ACR"
echo "  amr (Authentication Methods):     $AMR"
echo "  auth_time (Auth Timestamp):       $AUTH_TIME"
echo ""

# Validate
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Validation Results"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

PASS_COUNT=0
FAIL_COUNT=0

if [ "$ACR" != "MISSING" ] && [ "$ACR" != "null" ]; then
    echo "  ✅ ACR claim present: $ACR"
    PASS_COUNT=$((PASS_COUNT + 1))
else
    echo "  ❌ ACR claim MISSING"
    FAIL_COUNT=$((FAIL_COUNT + 1))
fi

if [ "$AMR" != "MISSING" ] && [ "$AMR" != "null" ]; then
    echo "  ✅ AMR claim present: $AMR"
    PASS_COUNT=$((PASS_COUNT + 1))
else
    echo "  ❌ AMR claim MISSING"
    FAIL_COUNT=$((FAIL_COUNT + 1))
fi

if [ "$AUTH_TIME" != "MISSING" ] && [ "$AUTH_TIME" != "null" ]; then
    echo "  ✅ auth_time claim present: $AUTH_TIME"
    PASS_COUNT=$((PASS_COUNT + 1))
else
    echo "  ❌ auth_time claim MISSING"
    FAIL_COUNT=$((FAIL_COUNT + 1))
fi

echo ""

if [ $FAIL_COUNT -eq 0 ]; then
    echo "🎉 SUCCESS! All required claims are present."
    echo ""
    echo "Next steps:"
    echo "  1. Test with broker realm (admin-dive user)"
    echo "  2. Test classified resource access"
    echo "  3. Verify AAL2 validation passes"
    exit 0
else
    echo "⚠️  FAILURE: $FAIL_COUNT claim(s) missing"
    echo ""
    echo "Troubleshooting:"
    echo "  1. Check Keycloak protocol mappers in Admin Console"
    echo "  2. Verify 'basic' scope is in default scopes"
    echo "  3. Check session notes are being set by SPI"
    echo "  4. Review: KEYCLOAK-26-QUICK-FIX.md"
    exit 1
fi

