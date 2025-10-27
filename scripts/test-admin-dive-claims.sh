#!/bin/bash
# Quick script to test admin-dive token claims

set -e

echo "🔍 Testing admin-dive user in dive-v3-broker realm..."
echo ""

# Get token via backend API
RESPONSE=$(curl -s -X POST http://localhost:4000/api/auth/custom-login \
  -H "Content-Type: application/json" \
  -d '{
    "idpAlias": "dive-v3-broker",
    "username": "admin-dive",
    "password": "DiveAdmin2025!"
  }')

# Check if successful
if ! echo "$RESPONSE" | jq -e '.success' > /dev/null 2>&1; then
    echo "❌ Authentication failed:"
    echo "$RESPONSE" | jq
    exit 1
fi

TOKEN=$(echo "$RESPONSE" | jq -r '.data.accessToken')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
    echo "❌ No access token received"
    exit 1
fi

echo "✅ Token received!"
echo ""

# Decode JWT payload
PAYLOAD=$(echo "$TOKEN" | cut -d'.' -f2)

# Add padding if needed
case $((${#PAYLOAD} % 4)) in
    2) PAYLOAD="${PAYLOAD}==" ;;
    3) PAYLOAD="${PAYLOAD}=" ;;
esac

DECODED=$(echo "$PAYLOAD" | base64 -d 2>/dev/null || echo "$PAYLOAD" | base64 -D 2>/dev/null)

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔐 AAL2/FAL2 Claims Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

ACR=$(echo "$DECODED" | jq -r '.acr // "MISSING"')
AMR=$(echo "$DECODED" | jq -r '.amr // "MISSING"')
AUTH_TIME=$(echo "$DECODED" | jq -r '.auth_time // "MISSING"')

echo "  acr (Authentication Context):     $ACR"
echo "  amr (Authentication Methods):     $AMR"
echo "  auth_time (Auth Timestamp):       $AUTH_TIME"
echo ""

# Also check other DIVE attributes
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 DIVE Attributes"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

UNIQUE_ID=$(echo "$DECODED" | jq -r '.uniqueID // "MISSING"')
CLEARANCE=$(echo "$DECODED" | jq -r '.clearance // "MISSING"')
COUNTRY=$(echo "$DECODED" | jq -r '.countryOfAffiliation // "MISSING"')
COI=$(echo "$DECODED" | jq -r '.acpCOI // "MISSING"')

echo "  uniqueID:                         $UNIQUE_ID"
echo "  clearance:                        $CLEARANCE"
echo "  countryOfAffiliation:             $COUNTRY"
echo "  acpCOI:                           $COI"
echo ""

# Validation
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
    echo "  ❌ ACR claim MISSING - Protocol mapper may not be configured"
    FAIL_COUNT=$((FAIL_COUNT + 1))
fi

if [ "$AMR" != "MISSING" ] && [ "$AMR" != "null" ]; then
    echo "  ✅ AMR claim present: $AMR"
    PASS_COUNT=$((PASS_COUNT + 1))
else
    echo "  ❌ AMR claim MISSING - Protocol mapper may not be configured"
    FAIL_COUNT=$((FAIL_COUNT + 1))
fi

if [ "$AUTH_TIME" != "MISSING" ] && [ "$AUTH_TIME" != "null" ]; then
    echo "  ✅ auth_time claim present: $AUTH_TIME"
    PASS_COUNT=$((PASS_COUNT + 1))
else
    echo "  ❌ auth_time claim MISSING - 'basic' scope may not be included"
    FAIL_COUNT=$((FAIL_COUNT + 1))
fi

echo ""

if [ $FAIL_COUNT -eq 0 ]; then
    echo "🎉 SUCCESS! All Keycloak 26 migration fixes are working correctly!"
    echo ""
    echo "The admin-dive user now has:"
    echo "  - ACR claim for AAL2 validation"
    echo "  - AMR claim showing authentication methods"
    echo "  - auth_time claim for NIST SP 800-63B compliance"
    echo ""
    exit 0
else
    echo "⚠️  FAILURE: $FAIL_COUNT claim(s) missing"
    echo ""
    echo "This means the Keycloak 26 migration is NOT complete."
    echo ""
    echo "Troubleshooting steps:"
    echo "  1. Check protocol mappers in Keycloak Admin Console"
    echo "  2. Verify 'basic' scope is in default scopes"
    echo "  3. Ensure Terraform changes were applied"
    echo "  4. Restart Keycloak after changes"
    echo ""
    echo "Review: KEYCLOAK-26-QUICK-FIX.md"
    exit 1
fi

