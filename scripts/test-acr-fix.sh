#!/bin/bash

# ============================================
# Test ACR/AMR Fix
# ============================================
# Validates that the ACR/AMR mapper fix is working
# Tests authentication and authorization with corrected tokens
#
# Usage:
#   ./scripts/test-acr-fix.sh [username] [password]
#
# Default: john.doe / Password123!

set -e

USERNAME="${1:-john.doe}"
PASSWORD="${2:-Password123!}"
RESOURCE_ID="${3:-doc-generated-1762442164745-10321}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}Testing ACR/AMR Mapper Fix${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Step 1: Get token via Direct Grant
echo -e "${YELLOW}Step 1: Authenticating user...${NC}"
TOKEN_RESPONSE=$(curl -k -s -X POST \
  'https://localhost:8443/realms/dive-v3-usa/protocol/openid-connect/token' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d "client_id=dive-v3-broker-client" \
  -d "client_secret=9gnp6rWxk3aqEUJbKfYzvGmx9P5K3hRv" \
  -d "grant_type=password" \
  -d "username=$USERNAME" \
  -d "password=$PASSWORD")

# Check for error
if echo "$TOKEN_RESPONSE" | grep -q "error"; then
  echo -e "${RED}❌ Authentication failed${NC}"
  echo "$TOKEN_RESPONSE" | jq .
  exit 1
fi

ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token')
ID_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.id_token')

if [ "$ACCESS_TOKEN" == "null" ] || [ -z "$ACCESS_TOKEN" ]; then
  echo -e "${RED}❌ No access token received${NC}"
  echo "$TOKEN_RESPONSE" | jq .
  exit 1
fi

echo -e "${GREEN}✅ Authentication successful${NC}"
echo ""

# Step 2: Decode and verify token claims
echo -e "${YELLOW}Step 2: Verifying token claims...${NC}"

# Decode ID token payload
ID_PAYLOAD=$(echo "$ID_TOKEN" | cut -d'.' -f2 | base64 -d 2>/dev/null | jq .)

# Extract claims
ACR=$(echo "$ID_PAYLOAD" | jq -r '.acr // "missing"')
AMR=$(echo "$ID_PAYLOAD" | jq -r '.amr // []')
CLEARANCE=$(echo "$ID_PAYLOAD" | jq -r '.clearance // "missing"')
COUNTRY=$(echo "$ID_PAYLOAD" | jq -r '.countryOfAffiliation // "missing"')

echo "Token Claims:"
echo "  ACR: $ACR"
echo "  AMR: $AMR"
echo "  Clearance: $CLEARANCE"
echo "  Country: $COUNTRY"
echo ""

# Validate ACR
if [ "$ACR" == "1" ] || [ "$ACR" == "2" ]; then
  echo -e "${GREEN}✅ ACR is numeric (AAL2/AAL3)${NC}"
elif [ "$ACR" == "0" ]; then
  echo -e "${YELLOW}⚠️  ACR is 0 (AAL1) - expected 1 or 2 for classified access${NC}"
else
  echo -e "${RED}❌ ACR is invalid: $ACR (expected numeric 0, 1, or 2)${NC}"
  exit 1
fi

# Validate AMR
AMR_COUNT=$(echo "$AMR" | jq 'length')
if [ "$AMR_COUNT" -ge 2 ]; then
  echo -e "${GREEN}✅ AMR has $AMR_COUNT factors (MFA)${NC}"
elif [ "$AMR_COUNT" -eq 1 ]; then
  echo -e "${YELLOW}⚠️  AMR has only 1 factor: $AMR${NC}"
else
  echo -e "${RED}❌ AMR is invalid or empty${NC}"
  exit 1
fi

echo ""

# Step 3: Test backend API access
echo -e "${YELLOW}Step 3: Testing resource access...${NC}"
echo "Resource ID: $RESOURCE_ID"
echo ""

RESOURCE_RESPONSE=$(curl -k -s -w "\n%{http_code}" \
  "https://localhost:4000/api/resources/$RESOURCE_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "X-Request-Id: test-acr-fix-$(date +%s)")

HTTP_CODE=$(echo "$RESOURCE_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$RESOURCE_RESPONSE" | sed '$ d')

echo "HTTP Status: $HTTP_CODE"

if [ "$HTTP_CODE" == "200" ]; then
  echo -e "${GREEN}✅ Access granted (200 OK)${NC}"
  echo ""
  echo "Resource Details:"
  echo "$RESPONSE_BODY" | jq '{
    resourceId: .resourceId,
    title: .title,
    classification: .classification,
    releasabilityTo: .releasabilityTo,
    encrypted: .encrypted
  }'
elif [ "$HTTP_CODE" == "403" ]; then
  echo -e "${RED}❌ Access denied (403 Forbidden)${NC}"
  echo ""
  echo "Error Details:"
  echo "$RESPONSE_BODY" | jq '{
    error: .error,
    message: .message,
    reason: .reason,
    details: .details
  }'
  
  # Check if still AAL2 error
  if echo "$RESPONSE_BODY" | grep -q "Authentication strength insufficient"; then
    echo ""
    echo -e "${RED}⚠️  Still getting AAL2 error!${NC}"
    echo "Possible causes:"
    echo "  1. User hasn't logged out and back in (old token cached)"
    echo "  2. Token was issued before Terraform apply"
    echo "  3. Keycloak hasn't picked up new mapper configuration"
    echo ""
    echo "Solutions:"
    echo "  1. User: Logout and login again in the web UI"
    echo "  2. Wait 60 seconds for cache to expire"
    echo "  3. Restart Keycloak: docker restart dive-v3-keycloak"
  fi
  exit 1
elif [ "$HTTP_CODE" == "401" ]; then
  echo -e "${RED}❌ Unauthorized (401)${NC}"
  echo "Token may be invalid or expired"
  exit 1
else
  echo -e "${RED}❌ Unexpected status code${NC}"
  echo "$RESPONSE_BODY"
  exit 1
fi

echo ""

# Step 4: Check backend logs
echo -e "${YELLOW}Step 4: Checking backend logs...${NC}"
docker logs dive-v3-backend 2>&1 | tail -20 | grep -E "(AAL|ACR|Authentication strength)" || echo "No recent AAL logs"

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}Test Complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "Summary:"
echo "  ✅ Token obtained with corrected ACR/AMR"
echo "  ✅ ACR is numeric: $ACR"
echo "  ✅ AMR has $AMR_COUNT factors"
echo "  ✅ Resource access granted (HTTP $HTTP_CODE)"
echo ""
echo "Next steps:"
echo "  1. Have all users logout and login again"
echo "  2. Monitor backend logs for any remaining AAL2 errors"
echo "  3. Consider implementing proper MFA flow (Option A in implementation doc)"





