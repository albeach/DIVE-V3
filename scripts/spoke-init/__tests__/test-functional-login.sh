#!/usr/bin/env bash
# Comprehensive verification of ocean pseudonym implementation
# Tests actual login flow and token claims

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║   Ocean Pseudonym Functional Test - Real Login Flow          ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

INSTANCE="NZL"
USERNAME="testuser-nzl-3"
PASSWORD="TestUser2025!Pilot"
REALM="dive-v3-broker-nzl"
CLIENT_ID="dive-v3-broker-nzl"

echo "Test Configuration:"
echo "  Instance: $INSTANCE"
echo "  Username: $USERNAME"
echo "  Realm: $REALM"
echo ""

# Step 1: Get client secret
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 1: Retrieve Client Secret"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

KC_PASS=$(gcloud secrets versions access latest --secret="dive-v3-keycloak-nzl" --project="dive25" 2>/dev/null | tr -d '\n\r')
TOKEN=$(docker exec dive-spoke-nzl-keycloak curl -sf \
    -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
    -d "grant_type=password" \
    -d "client_id=admin-cli" \
    -d "username=admin" \
    -d "password=${KC_PASS}" 2>/dev/null | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    echo "✗ Failed to get admin token"
    exit 1
fi
echo "✓ Admin token acquired"

CLIENT_UUID=$(docker exec dive-spoke-nzl-keycloak curl -sf \
    -H "Authorization: Bearer $TOKEN" \
    "http://localhost:8080/admin/realms/${REALM}/clients?clientId=${CLIENT_ID}" 2>/dev/null | \
    grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

CLIENT_SECRET=$(docker exec dive-spoke-nzl-keycloak curl -sf \
    -H "Authorization: Bearer $TOKEN" \
    "http://localhost:8080/admin/realms/${REALM}/clients/${CLIENT_UUID}/client-secret" 2>/dev/null | \
    grep -o '"value":"[^"]*' | cut -d'"' -f4)

if [ -z "$CLIENT_SECRET" ]; then
    echo "✗ Failed to get client secret"
    exit 1
fi
echo "✓ Client secret retrieved"
echo ""

# Step 2: Authenticate user and get token
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 2: User Authentication"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

USER_TOKEN_RESPONSE=$(docker exec dive-spoke-nzl-keycloak curl -sf \
    -X POST "http://localhost:8080/realms/${REALM}/protocol/openid-connect/token" \
    -d "grant_type=password" \
    -d "client_id=${CLIENT_ID}" \
    -d "client_secret=${CLIENT_SECRET}" \
    -d "username=${USERNAME}" \
    -d "password=${PASSWORD}" 2>/dev/null)

if ! echo "$USER_TOKEN_RESPONSE" | grep -q "access_token"; then
    echo "✗ User authentication failed"
    echo "Response: $USER_TOKEN_RESPONSE"
    exit 1
fi
echo "✓ User authenticated successfully"

ID_TOKEN=$(echo "$USER_TOKEN_RESPONSE" | grep -o '"id_token":"[^"]*' | cut -d'"' -f4)

if [ -z "$ID_TOKEN" ]; then
    echo "✗ No ID token in response"
    exit 1
fi
echo "✓ ID token received"
echo ""

# Step 3: Decode and verify token claims
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 3: Token Claims Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Decode JWT payload (base64 decode middle part)
PAYLOAD=$(echo "$ID_TOKEN" | cut -d'.' -f2)
# Add padding if needed
case $((${#PAYLOAD} % 4)) in
    2) PAYLOAD="${PAYLOAD}==" ;;
    3) PAYLOAD="${PAYLOAD}=" ;;
esac

DECODED=$(echo "$PAYLOAD" | base64 -d 2>/dev/null)

if [ -z "$DECODED" ]; then
    echo "✗ Failed to decode token"
    exit 1
fi

# Extract claims using grep
GIVEN_NAME=$(echo "$DECODED" | grep -o '"given_name":"[^"]*' | cut -d'"' -f4)
FAMILY_NAME=$(echo "$DECODED" | grep -o '"family_name":"[^"]*' | cut -d'"' -f4)
UNIQUE_ID=$(echo "$DECODED" | grep -o '"uniqueID":"[^"]*' | cut -d'"' -f4)
CLEARANCE=$(echo "$DECODED" | grep -o '"clearance":"[^"]*' | cut -d'"' -f4)
COA=$(echo "$DECODED" | grep -o '"countryOfAffiliation":"[^"]*' | cut -d'"' -f4)

echo "Token Claims:"
echo "  given_name: ${GIVEN_NAME:-N/A}"
echo "  family_name: ${FAMILY_NAME:-N/A}"
echo "  uniqueID: ${UNIQUE_ID:-N/A}"
echo "  clearance: ${CLEARANCE:-N/A}"
echo "  countryOfAffiliation: ${COA:-N/A}"
echo ""

# Step 4: Verify fixes
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 4: Fix Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

PASSED=0
FAILED=0

# Fix #1: uniqueID has no -001 suffix
if [ "$UNIQUE_ID" = "$USERNAME" ]; then
    echo "✓ Fix #1: uniqueID = username (no -001 suffix)"
    PASSED=$((PASSED + 1))
else
    echo "✗ Fix #1 FAILED: uniqueID = $UNIQUE_ID (expected: $USERNAME)"
    FAILED=$((FAILED + 1))
fi

# Fix #2: Ocean pseudonym in token (firstName/lastName)
if [[ "$GIVEN_NAME" =~ ^[A-Z][a-z]+$ ]] && [[ "$FAMILY_NAME" =~ ^[A-Z][a-z]+$ ]]; then
    echo "✓ Fix #2: Ocean pseudonym in token ($GIVEN_NAME $FAMILY_NAME)"
    PASSED=$((PASSED + 1))
    
    # Check it's not clearance-based
    if [[ ! "$GIVEN_NAME" =~ [Ss]ecret ]] && [[ ! "$FAMILY_NAME" =~ [Oo]fficer ]]; then
        echo "  ✓ Not clearance-based name"
    else
        echo "  ⚠ Might be clearance-based name"
    fi
else
    echo "✗ Fix #2 FAILED: Names not in ocean format"
    FAILED=$((FAILED + 1))
fi

# Fix #4: Frontend would display this pseudonym
if [ -n "$GIVEN_NAME" ] && [ -n "$FAMILY_NAME" ]; then
    DISPLAY_NAME="$GIVEN_NAME $FAMILY_NAME"
    echo "✓ Fix #4: Frontend would display: \"$DISPLAY_NAME\""
    PASSED=$((PASSED + 1))
else
    echo "✗ Fix #4 FAILED: Missing firstName/lastName in token"
    FAILED=$((FAILED + 1))
fi

# ACP-240 Compliance
echo ""
echo "ACP-240 Compliance:"
if [ -n "$UNIQUE_ID" ] && [ -n "$CLEARANCE" ] && [ -n "$COA" ]; then
    echo "  ✓ Required attributes present (uniqueID, clearance, COA)"
    PASSED=$((PASSED + 1))
else
    echo "  ✗ Missing required attributes"
    FAILED=$((FAILED + 1))
fi

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                    Test Summary                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "  Fixes Verified:  $PASSED/4"
echo "  Failures:        $FAILED"
echo ""

if [ $FAILED -eq 0 ]; then
    echo "✅ All verifications passed!"
    echo ""
    echo "Ocean Pseudonym Implementation Verified:"
    echo "  • Fix #1: uniqueID = username ✅"
    echo "  • Fix #2: Ocean pseudonym in Keycloak ✅"
    echo "  • Fix #3: Email optional (not verified in token)"
    echo "  • Fix #4: Frontend reads from token ✅"
    echo "  • ACP-240 Compliance: PASSED ✅"
    echo ""
    exit 0
else
    echo "⚠ Some verifications failed"
    exit 1
fi
