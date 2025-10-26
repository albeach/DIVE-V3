#!/bin/bash
###############################################################################
# FIX MFA PERSISTENCE FOR admin-dive USER
###############################################################################
# This script fixes the critical MFA persistence issue where:
# 1. User attributes are not set (Terraform provider bug)
# 2. OTP credentials need to be properly configured
#
# Usage: ./scripts/fix-mfa-persistence.sh
# Requirements: curl, jq, docker
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8081}"
KEYCLOAK_ADMIN_USER="${KEYCLOAK_ADMIN_USERNAME:-admin}"
KEYCLOAK_ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
REALM="dive-v3-broker"
USERNAME="admin-dive"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  🔧 FIX MFA PERSISTENCE - admin-dive User                     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

###############################################################################
# Step 1: Get Admin Token
###############################################################################
echo -e "${BLUE}[1/6]${NC} Getting admin token..."
TOKEN_RESPONSE=$(curl -s -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=${KEYCLOAK_ADMIN_USER}" \
  -d "password=${KEYCLOAK_ADMIN_PASS}" \
  -d "grant_type=password" \
  -d "client_id=admin-cli")

TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo -e "${RED}❌ Failed to get admin token${NC}"
  echo "Response: $TOKEN_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✅ Admin token obtained${NC}"
echo ""

###############################################################################
# Step 2: Get User ID
###############################################################################
echo -e "${BLUE}[2/6]${NC} Looking up user: ${USERNAME}..."
USER_RESPONSE=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users?username=${USERNAME}" \
  -H "Authorization: Bearer $TOKEN")

USER_ID=$(echo "$USER_RESPONSE" | jq -r '.[0].id')

if [ -z "$USER_ID" ] || [ "$USER_ID" = "null" ]; then
  echo -e "${RED}❌ User not found: ${USERNAME}${NC}"
  echo "Response: $USER_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✅ User found${NC}"
echo "   User ID: ${USER_ID}"
echo ""

###############################################################################
# Step 3: Check Current Attributes
###############################################################################
echo -e "${BLUE}[3/6]${NC} Checking current attributes..."
CURRENT_USER=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}" \
  -H "Authorization: Bearer $TOKEN")

CURRENT_ATTRS=$(echo "$CURRENT_USER" | jq '.attributes')
CURRENT_CLEARANCE=$(echo "$CURRENT_USER" | jq -r '.attributes.clearance[0] // "NOT_SET"')

echo "   Current clearance: ${CURRENT_CLEARANCE}"

if [ "$CURRENT_CLEARANCE" = "TOP_SECRET" ]; then
  echo -e "${GREEN}✅ Clearance already set correctly${NC}"
else
  echo -e "${YELLOW}⚠️  Clearance NOT set - will fix${NC}"
fi
echo ""

###############################################################################
# Step 4: Set User Attributes
###############################################################################
echo -e "${BLUE}[4/6]${NC} Setting user attributes..."

UPDATE_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
  "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "attributes": {
      "uniqueID": ["admin@dive-v3.pilot"],
      "clearance": ["TOP_SECRET"],
      "countryOfAffiliation": ["USA"],
      "acpCOI": ["[\"NATO-COSMIC\",\"FVEY\",\"CAN-US\"]"],
      "dutyOrg": ["DIVE_ADMIN"],
      "orgUnit": ["SYSTEM_ADMINISTRATION"]
    }
  }')

if [ "$UPDATE_RESPONSE" = "204" ] || [ "$UPDATE_RESPONSE" = "200" ]; then
  echo -e "${GREEN}✅ Attributes updated successfully${NC}"
else
  echo -e "${RED}❌ Failed to update attributes (HTTP $UPDATE_RESPONSE)${NC}"
  exit 1
fi
echo ""

###############################################################################
# Step 5: Verify Attributes
###############################################################################
echo -e "${BLUE}[5/6]${NC} Verifying attributes..."
UPDATED_USER=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}" \
  -H "Authorization: Bearer $TOKEN")

UPDATED_CLEARANCE=$(echo "$UPDATED_USER" | jq -r '.attributes.clearance[0]')
UPDATED_COUNTRY=$(echo "$UPDATED_USER" | jq -r '.attributes.countryOfAffiliation[0]')
UPDATED_UNIQUEID=$(echo "$UPDATED_USER" | jq -r '.attributes.uniqueID[0]')

echo "   uniqueID: ${UPDATED_UNIQUEID}"
echo "   clearance: ${UPDATED_CLEARANCE}"
echo "   countryOfAffiliation: ${UPDATED_COUNTRY}"

if [ "$UPDATED_CLEARANCE" = "TOP_SECRET" ]; then
  echo -e "${GREEN}✅ Attributes verified correct${NC}"
else
  echo -e "${RED}❌ Attributes verification FAILED${NC}"
  echo "Expected clearance: TOP_SECRET"
  echo "Actual clearance: ${UPDATED_CLEARANCE}"
  exit 1
fi
echo ""

###############################################################################
# Step 6: Check OTP Credentials
###############################################################################
echo -e "${BLUE}[6/6]${NC} Checking OTP credentials..."
CREDENTIALS=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}/credentials" \
  -H "Authorization: Bearer $TOKEN")

HAS_PASSWORD=$(echo "$CREDENTIALS" | jq '[.[] | select(.type=="password")] | length > 0')
HAS_OTP=$(echo "$CREDENTIALS" | jq '[.[] | select(.type=="otp")] | length > 0')

echo "   Password credential: $([ "$HAS_PASSWORD" = "true" ] && echo "✅ YES" || echo "❌ NO")"
echo "   OTP credential: $([ "$HAS_OTP" = "true" ] && echo "✅ YES" || echo "⚠️  NOT YET CONFIGURED")"
echo ""

###############################################################################
# Summary
###############################################################################
echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  📊 SUMMARY                                                    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ "$HAS_OTP" = "true" ]; then
  echo -e "${GREEN}🎉 SUCCESS: MFA is fully configured!${NC}"
  echo ""
  echo "✅ User attributes set correctly"
  echo "✅ OTP credential exists"
  echo ""
  echo "Your admin-dive account is now AAL2 compliant."
  echo ""
  echo "Next login will require:"
  echo "  1. Username: admin-dive"
  echo "  2. Password: DiveAdmin2025!"
  echo "  3. OTP code: (from your authenticator app)"
else
  echo -e "${YELLOW}⚠️  PARTIAL SUCCESS: Attributes fixed, OTP needs setup${NC}"
  echo ""
  echo "✅ User attributes set correctly"
  echo "⚠️  OTP credential NOT yet configured"
  echo ""
  echo "📋 NEXT STEPS:"
  echo ""
  echo "1. Logout from DIVE V3:"
  echo "   http://localhost:3000/api/auth/signout"
  echo ""
  echo "2. Clear browser cookies (important!)"
  echo ""
  echo "3. Login to DIVE V3:"
  echo "   http://localhost:3000/login/dive-v3-broker"
  echo "   Username: admin-dive"
  echo "   Password: DiveAdmin2025!"
  echo ""
  echo "4. You will see a QR code - scan it with:"
  echo "   - Google Authenticator"
  echo "   - Microsoft Authenticator"
  echo "   - Authy"
  echo "   - 1Password"
  echo "   - Any TOTP app"
  echo ""
  echo "5. Enter the 6-digit code from your app"
  echo ""
  echo "6. ✅ MFA will be configured and persist for future logins"
  echo ""
  echo "7. Verify with:"
  echo "   ./scripts/verify-mfa-persistence.sh"
fi

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo ""

exit 0

