#!/bin/bash
# ============================================
# Keycloak 26 Claims Verification Script
# ============================================
# Verifies ACR, AMR, and auth_time claims are present in JWT tokens
# Reference: KEYCLOAK-26-MIGRATION-CRITICAL-ISSUES.md

set -euo pipefail

echo "🔍 Keycloak 26 AAL2/FAL2 Claims Verification"
echo "=============================================="
echo ""

# Configuration
KEYCLOAK_URL=${KEYCLOAK_URL:-"http://localhost:8081"}
REALM=${REALM:-"dive-v3-broker"}
CLIENT_ID=${CLIENT_ID:-"dive-v3-client-broker"}
CLIENT_SECRET=${CLIENT_SECRET:-""}
USERNAME=${USERNAME:-"admin-dive"}
PASSWORD=${PASSWORD:-""}

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check dependencies
for cmd in jq curl base64; do
    if ! command -v $cmd &> /dev/null; then
        echo -e "${RED}❌ Error: $cmd is not installed${NC}"
        exit 1
    fi
done

# Prompt for credentials if not set
if [ -z "$CLIENT_SECRET" ]; then
    echo -n "Enter client secret for $CLIENT_ID: "
    read -s CLIENT_SECRET
    echo ""
fi

if [ -z "$PASSWORD" ]; then
    echo -n "Enter password for $USERNAME: "
    read -s PASSWORD
    echo ""
fi

echo ""
echo "📋 Configuration:"
echo "  Keycloak URL: $KEYCLOAK_URL"
echo "  Realm: $REALM"
echo "  Client ID: $CLIENT_ID"
echo "  Username: $USERNAME"
echo ""

# Step 1: Get access token
echo "🔑 Step 1: Obtaining access token..."

TOKEN_RESPONSE=$(curl -s -X POST \
  "$KEYCLOAK_URL/realms/$REALM/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=$CLIENT_ID" \
  -d "client_secret=$CLIENT_SECRET" \
  -d "username=$USERNAME" \
  -d "password=$PASSWORD" \
  -d "grant_type=password" \
  -d "scope=openid profile email")

# Check for errors
if echo "$TOKEN_RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
    ERROR=$(echo "$TOKEN_RESPONSE" | jq -r '.error')
    ERROR_DESC=$(echo "$TOKEN_RESPONSE" | jq -r '.error_description')
    echo -e "${RED}❌ Failed to obtain token${NC}"
    echo "Error: $ERROR"
    echo "Description: $ERROR_DESC"
    exit 1
fi

ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token')
ID_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.id_token')

if [ "$ACCESS_TOKEN" == "null" ] || [ -z "$ACCESS_TOKEN" ]; then
    echo -e "${RED}❌ Failed to obtain access token${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Token obtained successfully${NC}"
echo ""

# Step 2: Decode and check access token claims
echo "🔍 Step 2: Checking ACCESS TOKEN claims..."
echo ""

# Decode JWT payload (second part of JWT)
ACCESS_PAYLOAD=$(echo "$ACCESS_TOKEN" | cut -d'.' -f2 | base64 -d 2>/dev/null || echo "$ACCESS_TOKEN" | cut -d'.' -f2 | base64 -D 2>/dev/null)

# Extract claims
ACR=$(echo "$ACCESS_PAYLOAD" | jq -r '.acr // "null"')
AMR=$(echo "$ACCESS_PAYLOAD" | jq -r '.amr // "null"')
AUTH_TIME=$(echo "$ACCESS_PAYLOAD" | jq -r '.auth_time // "null"')
SUB=$(echo "$ACCESS_PAYLOAD" | jq -r '.sub // "null"')
CLEARANCE=$(echo "$ACCESS_PAYLOAD" | jq -r '.clearance // "null"')

# Display claims
echo "Claim Verification Results:"
echo "----------------------------"

# Check ACR
if [ "$ACR" == "null" ] || [ -z "$ACR" ]; then
    echo -e "  acr (Authentication Context):     ${RED}❌ MISSING${NC}"
    ACR_STATUS="FAIL"
else
    echo -e "  acr (Authentication Context):     ${GREEN}✅ $ACR${NC}"
    ACR_STATUS="PASS"
fi

# Check AMR
if [ "$AMR" == "null" ] || [ -z "$AMR" ]; then
    echo -e "  amr (Authentication Methods):     ${RED}❌ MISSING${NC}"
    AMR_STATUS="FAIL"
else
    echo -e "  amr (Authentication Methods):     ${GREEN}✅ $AMR${NC}"
    AMR_STATUS="PASS"
fi

# Check auth_time
if [ "$AUTH_TIME" == "null" ] || [ -z "$AUTH_TIME" ]; then
    echo -e "  auth_time (Auth Timestamp):       ${RED}❌ MISSING${NC}"
    AUTH_TIME_STATUS="FAIL"
else
    # Convert Unix timestamp to human-readable date
    AUTH_DATE=$(date -r "$AUTH_TIME" 2>/dev/null || date -d "@$AUTH_TIME" 2>/dev/null || echo "Invalid date")
    echo -e "  auth_time (Auth Timestamp):       ${GREEN}✅ $AUTH_TIME ($AUTH_DATE)${NC}"
    AUTH_TIME_STATUS="PASS"
fi

# Check sub (should always be present)
if [ "$SUB" == "null" ] || [ -z "$SUB" ]; then
    echo -e "  sub (Subject):                    ${YELLOW}⚠️  MISSING (WARNING)${NC}"
    SUB_STATUS="WARN"
else
    echo -e "  sub (Subject):                    ${GREEN}✅ $SUB${NC}"
    SUB_STATUS="PASS"
fi

# Check clearance (DIVE-specific)
if [ "$CLEARANCE" != "null" ] && [ -n "$CLEARANCE" ]; then
    echo -e "  clearance (DIVE attribute):       ${GREEN}✅ $CLEARANCE${NC}"
fi

echo ""

# Step 3: Check ID token
echo "🔍 Step 3: Checking ID TOKEN claims..."
echo ""

ID_PAYLOAD=$(echo "$ID_TOKEN" | cut -d'.' -f2 | base64 -d 2>/dev/null || echo "$ID_TOKEN" | cut -d'.' -f2 | base64 -D 2>/dev/null)

ID_ACR=$(echo "$ID_PAYLOAD" | jq -r '.acr // "null"')
ID_AMR=$(echo "$ID_PAYLOAD" | jq -r '.amr // "null"')
ID_AUTH_TIME=$(echo "$ID_PAYLOAD" | jq -r '.auth_time // "null"')

echo "ID Token Claims:"
echo "----------------"
echo "  acr:       $ID_ACR"
echo "  amr:       $ID_AMR"
echo "  auth_time: $ID_AUTH_TIME"
echo ""

# Step 4: AAL2 Validation
echo "🛡️  Step 4: AAL2 Validation (NIST SP 800-63B)..."
echo ""

AAL_LEVEL="UNKNOWN"
AAL_SUFFICIENT="NO"

# Check if AAL2 requirements are met
if [ "$ACR" != "null" ] && [ -n "$ACR" ]; then
    # Check for AAL2+ indicators
    if [[ "$ACR" == *"silver"* ]] || [[ "$ACR" == *"aal2"* ]] || [[ "$ACR" == "1" ]] || [[ "$ACR" == "2" ]] || [[ "$ACR" == "3" ]]; then
        AAL_LEVEL="AAL2+"
        AAL_SUFFICIENT="YES"
    else
        AAL_LEVEL="AAL1"
    fi
fi

# Fallback: Check AMR for 2+ factors
if [ "$AMR" != "null" ] && [ -n "$AMR" ]; then
    FACTOR_COUNT=$(echo "$AMR" | jq 'length' 2>/dev/null || echo "0")
    if [ "$FACTOR_COUNT" -ge 2 ]; then
        AAL_LEVEL="AAL2 (via AMR)"
        AAL_SUFFICIENT="YES"
    fi
fi

echo "AAL Level Assessment:"
echo "---------------------"
echo "  Determined Level: $AAL_LEVEL"

if [ "$AAL_SUFFICIENT" == "YES" ]; then
    echo -e "  AAL2 Sufficient:  ${GREEN}✅ YES${NC}"
    echo "  Access to classified resources: ALLOWED"
else
    echo -e "  AAL2 Sufficient:  ${RED}❌ NO${NC}"
    echo "  Access to classified resources: DENIED"
fi

echo ""

# Step 5: Summary
echo "📊 Summary"
echo "=========="
echo ""

PASS_COUNT=0
FAIL_COUNT=0

if [ "$ACR_STATUS" == "PASS" ]; then ((PASS_COUNT++)); else ((FAIL_COUNT++)); fi
if [ "$AMR_STATUS" == "PASS" ]; then ((PASS_COUNT++)); else ((FAIL_COUNT++)); fi
if [ "$AUTH_TIME_STATUS" == "PASS" ]; then ((PASS_COUNT++)); else ((FAIL_COUNT++)); fi
if [ "$SUB_STATUS" == "PASS" ]; then ((PASS_COUNT++)); fi

echo "Tests Passed: $PASS_COUNT/3 (sub excluded from count)"

if [ $FAIL_COUNT -eq 0 ] && [ "$AAL_SUFFICIENT" == "YES" ]; then
    echo -e "${GREEN}✅ ALL CHECKS PASSED - Keycloak 26 migration successful!${NC}"
    echo ""
    echo "Your AAL2/FAL2 implementation is working correctly."
    exit 0
elif [ $FAIL_COUNT -gt 0 ]; then
    echo -e "${RED}❌ FAILURES DETECTED - Migration incomplete${NC}"
    echo ""
    echo "Required actions:"
    if [ "$ACR_STATUS" == "FAIL" ]; then
        echo "  1. Add 'basic' client scope to your client configuration"
        echo "  2. Update ACR mapper to use session notes (AUTH_CONTEXT_CLASS_REF)"
    fi
    if [ "$AMR_STATUS" == "FAIL" ]; then
        echo "  3. Update AMR mapper to use session notes (AUTH_METHODS_REF)"
    fi
    if [ "$AUTH_TIME_STATUS" == "FAIL" ]; then
        echo "  4. Ensure 'basic' client scope is included (provides auth_time)"
    fi
    echo ""
    echo "See: KEYCLOAK-26-MIGRATION-CRITICAL-ISSUES.md"
    exit 1
else
    echo -e "${YELLOW}⚠️  PARTIAL SUCCESS - AAL2 validation may fail${NC}"
    echo ""
    echo "Claims are present but AAL2 level is insufficient."
    echo "Users may not be able to access classified resources."
    exit 1
fi

