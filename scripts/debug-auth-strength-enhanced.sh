#!/bin/bash

# ============================================
# Enhanced Authentication Strength Debugger
# ============================================
# Comprehensive debugging for ACR/AMR authentication issues
# Usage: ./debug-auth-strength-enhanced.sh [username] [password] [resourceId]

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

USERNAME="${1:-john.doe}"
PASSWORD="${2:-Password123!}"
RESOURCE_ID="${3:-doc-generated-1762442164745-10321}"

KEYCLOAK_URL="https://localhost:8443"
BACKEND_URL="https://localhost:4000"
REALM="dive-v3-usa"

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}ENHANCED AUTHENTICATION STRENGTH DEBUGGER${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""
echo "Testing user: $USERNAME"
echo "Resource: $RESOURCE_ID"
echo ""

# ============================================
# STEP 1: Check User Attributes in Keycloak
# ============================================
echo -e "${CYAN}━━━ STEP 1: Keycloak User Attributes ━━━${NC}"

echo "Getting admin token..."
ADMIN_TOKEN=$(curl -k -s -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli" \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password" | jq -r '.access_token')

if [ "$ADMIN_TOKEN" == "null" ] || [ -z "$ADMIN_TOKEN" ]; then
  echo -e "${RED}❌ Failed to get admin token${NC}"
  exit 1
fi

echo "Fetching user attributes..."
USER_DATA=$(curl -k -s -X GET "$KEYCLOAK_URL/admin/realms/$REALM/users?username=$USERNAME&exact=true" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

USER_ID=$(echo "$USER_DATA" | jq -r '.[0].id')
USER_ATTRS=$(echo "$USER_DATA" | jq -r '.[0].attributes')

echo ""
echo "User ID: $USER_ID"
echo "User Attributes:"
echo "$USER_ATTRS" | jq '{
  uniqueID,
  clearance,
  countryOfAffiliation,
  acpCOI,
  acr,
  amr,
  dutyOrg,
  orgUnit
}'

# Check if ACR/AMR are set
ACR_ATTR=$(echo "$USER_ATTRS" | jq -r '.acr // empty')
AMR_ATTR=$(echo "$USER_ATTRS" | jq -r '.amr // empty')

if [ -z "$ACR_ATTR" ]; then
  echo -e "${RED}❌ ACR attribute is MISSING or EMPTY${NC}"
else
  echo -e "${GREEN}✓ ACR attribute is set: $ACR_ATTR${NC}"
fi

if [ -z "$AMR_ATTR" ]; then
  echo -e "${RED}❌ AMR attribute is MISSING or EMPTY${NC}"
else
  echo -e "${GREEN}✓ AMR attribute is set: $AMR_ATTR${NC}"
fi

echo ""

# ============================================
# STEP 2: Get Fresh Token via Direct Grant
# ============================================
echo -e "${CYAN}━━━ STEP 2: Obtaining Fresh Token ━━━${NC}"

TOKEN_RESPONSE=$(curl -k -s -X POST "$KEYCLOAK_URL/realms/$REALM/protocol/openid-connect/token" \
  -d "client_id=dive-v3-broker-client" \
  -d "client_secret=9gnp6rWxk3aqEUJbKfYzvGmx9P5K3hRv" \
  -d "grant_type=password" \
  -d "username=$USERNAME" \
  -d "password=$PASSWORD")

if echo "$TOKEN_RESPONSE" | grep -q "error"; then
  echo -e "${RED}❌ Token request failed${NC}"
  echo "$TOKEN_RESPONSE" | jq .
  exit 1
fi

ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token')
ID_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.id_token')

echo -e "${GREEN}✓ Token obtained successfully${NC}"
echo ""

# ============================================
# STEP 3: Decode and Analyze Token Claims
# ============================================
echo -e "${CYAN}━━━ STEP 3: Token Claims Analysis ━━━${NC}"

# Decode ID token payload
ID_PAYLOAD=$(echo "$ID_TOKEN" | cut -d'.' -f2 | base64 -d 2>/dev/null)

echo "Token Claims:"
echo "$ID_PAYLOAD" | jq '{
  sub,
  uniqueID,
  clearance,
  countryOfAffiliation,
  acpCOI,
  acr,
  amr,
  iss,
  aud,
  exp,
  iat
}'

# Extract and validate claims
TOKEN_ACR=$(echo "$ID_PAYLOAD" | jq -r '.acr // "missing"')
TOKEN_AMR=$(echo "$ID_PAYLOAD" | jq -r '.amr // []')
TOKEN_CLEARANCE=$(echo "$ID_PAYLOAD" | jq -r '.clearance // "missing"')
TOKEN_COUNTRY=$(echo "$ID_PAYLOAD" | jq -r '.countryOfAffiliation // "missing"')

echo ""
echo "Validation:"

# Check ACR
if [ "$TOKEN_ACR" == "missing" ] || [ "$TOKEN_ACR" == "null" ]; then
  echo -e "${RED}❌ CRITICAL: ACR claim is MISSING from token${NC}"
  echo "   This means the protocol mapper is not working!"
elif [ "$TOKEN_ACR" == "otp" ] || [ "$TOKEN_ACR" == "pwd" ]; then
  echo -e "${RED}❌ CRITICAL: ACR has invalid value: $TOKEN_ACR${NC}"
  echo "   Expected: numeric (0, 1, 2)"
  echo "   This will cause AAL validation to fail!"
elif [[ "$TOKEN_ACR" =~ ^[0-9]+$ ]]; then
  echo -e "${GREEN}✓ ACR is numeric: $TOKEN_ACR${NC}"
  if [ "$TOKEN_ACR" -ge 1 ]; then
    echo -e "${GREEN}  → AAL${TOKEN_ACR}+ (sufficient for classified)${NC}"
  else
    echo -e "${YELLOW}  → AAL1 (insufficient for classified)${NC}"
  fi
else
  echo -e "${YELLOW}⚠ ACR is non-numeric: $TOKEN_ACR${NC}"
  echo "   Checking if it's a valid URN format..."
  if echo "$TOKEN_ACR" | grep -qi "silver\|gold\|aal2\|aal3"; then
    echo -e "${GREEN}  → Valid URN format (should work)${NC}"
  else
    echo -e "${RED}  → Invalid format (will fail validation)${NC}"
  fi
fi

# Check AMR
if [ "$TOKEN_AMR" == "[]" ] || [ "$TOKEN_AMR" == "null" ]; then
  echo -e "${RED}❌ CRITICAL: AMR claim is MISSING or empty${NC}"
else
  AMR_COUNT=$(echo "$TOKEN_AMR" | jq 'length')
  echo -e "${GREEN}✓ AMR present with $AMR_COUNT factor(s): $TOKEN_AMR${NC}"
  if [ "$AMR_COUNT" -ge 2 ]; then
    echo -e "${GREEN}  → 2+ factors (MFA, sufficient for AAL2)${NC}"
  else
    echo -e "${YELLOW}  → Only 1 factor (no MFA, may fail AAL2)${NC}"
  fi
fi

echo ""

# ============================================
# STEP 4: Check Resource Metadata
# ============================================
echo -e "${CYAN}━━━ STEP 4: Resource Metadata ━━━${NC}"

echo "Querying MongoDB for resource..."
RESOURCE_DATA=$(docker exec dive-v3-mongo mongosh dive-v3 --quiet --eval "
  JSON.stringify(db.resources.findOne({resourceId: '$RESOURCE_ID'}, {
    resourceId: 1,
    title: 1,
    classification: 1,
    releasabilityTo: 1,
    COI: 1,
    encrypted: 1,
    'ztdf.policy.securityLabel.classification': 1,
    'ztdf.policy.securityLabel.releasabilityTo': 1,
    _id: 0
  }))
" 2>/dev/null)

if [ "$RESOURCE_DATA" == "null" ] || [ -z "$RESOURCE_DATA" ]; then
  echo -e "${RED}❌ Resource not found in MongoDB${NC}"
  exit 1
fi

echo "Resource Data:"
echo "$RESOURCE_DATA" | jq .

RESOURCE_CLASSIFICATION=$(echo "$RESOURCE_DATA" | jq -r '.classification // .ztdf.policy.securityLabel.classification // "UNKNOWN"')
RESOURCE_RELEASABILITY=$(echo "$RESOURCE_DATA" | jq -r '.releasabilityTo // .ztdf.policy.securityLabel.releasabilityTo // []')

echo ""
echo "Resource Requirements:"
echo "  Classification: $RESOURCE_CLASSIFICATION"
echo "  Releasable to: $RESOURCE_RELEASABILITY"

# Determine AAL requirement
if [ "$RESOURCE_CLASSIFICATION" == "UNCLASSIFIED" ]; then
  echo -e "${GREEN}  → AAL1 required (any authentication)${NC}"
elif [ "$RESOURCE_CLASSIFICATION" == "RESTRICTED" ]; then
  echo -e "${YELLOW}  → Treated as classified (AAL2 required)${NC}"
else
  echo -e "${YELLOW}  → AAL2 required (MFA mandatory)${NC}"
fi

echo ""

# ============================================
# STEP 5: Test Backend API Access
# ============================================
echo -e "${CYAN}━━━ STEP 5: Backend API Test ━━━${NC}"

echo "Making request to backend..."
BACKEND_RESPONSE=$(curl -k -s -w "\nHTTP_CODE:%{http_code}" \
  "$BACKEND_URL/api/resources/$RESOURCE_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "X-Request-Id: debug-$(date +%s)")

HTTP_CODE=$(echo "$BACKEND_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
RESPONSE_BODY=$(echo "$BACKEND_RESPONSE" | sed '/HTTP_CODE:/d')

echo "HTTP Status: $HTTP_CODE"
echo ""

if [ "$HTTP_CODE" == "200" ]; then
  echo -e "${GREEN}✅ SUCCESS: Access granted${NC}"
  echo ""
  echo "Resource Details:"
  echo "$RESPONSE_BODY" | jq '{
    resourceId,
    title,
    classification,
    releasabilityTo,
    encrypted
  }'
elif [ "$HTTP_CODE" == "403" ]; then
  echo -e "${RED}❌ DENIED: Access forbidden${NC}"
  echo ""
  echo "Error Details:"
  echo "$RESPONSE_BODY" | jq .
  
  # Check specific error
  if echo "$RESPONSE_BODY" | grep -q "Authentication strength insufficient"; then
    echo ""
    echo -e "${RED}════════════════════════════════════════${NC}"
    echo -e "${RED}AUTHENTICATION STRENGTH ERROR DETECTED${NC}"
    echo -e "${RED}════════════════════════════════════════${NC}"
    echo ""
    echo "This means the backend rejected the token due to insufficient AAL."
    echo ""
    echo "Diagnosis:"
    echo "  User Token ACR: $TOKEN_ACR"
    echo "  User Token AMR: $TOKEN_AMR"
    echo "  Resource Classification: $RESOURCE_CLASSIFICATION"
    echo ""
    
    # Specific diagnosis
    if [ "$TOKEN_ACR" == "missing" ] || [ "$TOKEN_ACR" == "null" ]; then
      echo -e "${RED}ROOT CAUSE: ACR claim is missing from token${NC}"
      echo "Fix: Protocol mapper is not including ACR claim"
      echo "Action: Check protocol mapper configuration in Keycloak"
    elif [ "$TOKEN_ACR" == "otp" ] || [ "$TOKEN_ACR" == "pwd" ]; then
      echo -e "${RED}ROOT CAUSE: ACR has invalid format: $TOKEN_ACR${NC}"
      echo "Fix: ACR must be numeric (0, 1, 2) or valid URN"
      echo "Action: User attributes or mapper are incorrectly configured"
    elif [ "$TOKEN_ACR" == "0" ]; then
      echo -e "${RED}ROOT CAUSE: ACR=0 (AAL1) insufficient for classified${NC}"
      echo "Fix: User needs AAL2+ (ACR >= 1)"
      echo "Action: Set user acr attribute to '1' or '2'"
    else
      echo -e "${YELLOW}UNEXPECTED: ACR looks valid but still failing${NC}"
      echo "This might be an AMR issue or backend logic problem"
    fi
  fi
else
  echo -e "${RED}❌ ERROR: Unexpected status code${NC}"
  echo "$RESPONSE_BODY"
fi

echo ""

# ============================================
# STEP 6: Check Backend Logs
# ============================================
echo -e "${CYAN}━━━ STEP 6: Recent Backend Logs ━━━${NC}"

echo "Last 30 lines with AAL/ACR/AMR mentions..."
docker logs dive-v3-backend 2>&1 | grep -E "AAL|ACR|AMR|Authentication strength" | tail -30

echo ""

# ============================================
# STEP 7: Summary and Recommendations
# ============================================
echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${MAGENTA}SUMMARY & RECOMMENDATIONS${NC}"
echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo "Token Claims:"
echo "  ✓ ACR in token: $TOKEN_ACR"
echo "  ✓ AMR in token: $TOKEN_AMR"
echo ""

echo "Backend Result: HTTP $HTTP_CODE"

if [ "$HTTP_CODE" == "200" ]; then
  echo -e "${GREEN}✅ Everything working correctly!${NC}"
elif [ "$HTTP_CODE" == "403" ]; then
  echo -e "${RED}❌ Access denied - troubleshooting needed${NC}"
  echo ""
  echo "Next Steps:"
  echo "1. Verify user logged out and back in (fresh token)"
  echo "2. Clear browser cookies completely"
  echo "3. Check Keycloak protocol mapper configuration"
  echo "4. Verify user attributes in Keycloak have acr='1' and amr='[\"pwd\",\"otp\"]'"
  echo "5. Check backend normalizeACR() function is parsing correctly"
fi

echo ""
echo "Detailed logs saved. Review above output for specific issues."



