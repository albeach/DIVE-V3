#!/bin/bash
# Fix AAL2 Claims for admin-dive User
# This script sets ACR and AMR user attributes to enable AAL2 authentication
#
# Date: October 26, 2025
# Issue: "Authentication strength insufficient" errors

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}  DIVE V3: AAL2 Claims Fix for admin-dive${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# Configuration
KEYCLOAK_URL="http://localhost:8081"
REALM="dive-v3-broker"
USERNAME="admin-dive"
ADMIN_USER="admin"
ADMIN_PASS="admin"

echo -e "${CYAN}📋 Configuration:${NC}"
echo "   Keycloak URL: $KEYCLOAK_URL"
echo "   Realm: $REALM"
echo "   Target User: $USERNAME"
echo ""

# Step 1: Get admin token
echo -e "${CYAN}🔐 Step 1: Authenticating as admin...${NC}"
TOKEN=$(curl -s -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=$ADMIN_USER" \
  -d "password=$ADMIN_PASS" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r '.access_token')

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
  echo -e "${RED}❌ Failed to get admin token${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Admin token obtained${NC}"
echo ""

# Step 2: Get user ID
echo -e "${CYAN}🔍 Step 2: Finding user '$USERNAME'...${NC}"
USER_ID=$(curl -s -X GET "$KEYCLOAK_URL/admin/realms/$REALM/users?username=$USERNAME" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.[0].id')

if [ "$USER_ID" = "null" ] || [ -z "$USER_ID" ]; then
  echo -e "${RED}❌ User not found${NC}"
  exit 1
fi
echo -e "${GREEN}✅ User found: $USER_ID${NC}"
echo ""

# Step 3: Check current attributes
echo -e "${CYAN}📊 Step 3: Checking current attributes...${NC}"
CURRENT_ATTRS=$(curl -s -X GET "$KEYCLOAK_URL/admin/realms/$REALM/users/$USER_ID" \
  -H "Authorization: Bearer $TOKEN" | jq '.attributes')

echo "Current attributes:"
echo "$CURRENT_ATTRS" | jq '.'
echo ""

# Step 4: Check OTP credential
echo -e "${CYAN}🔑 Step 4: Checking OTP credential...${NC}"
CREDS=$(curl -s -X GET "$KEYCLOAK_URL/admin/realms/$REALM/users/$USER_ID/credentials" \
  -H "Authorization: Bearer $TOKEN")

HAS_OTP=$(echo "$CREDS" | jq -r '.[] | select(.type=="otp") | .type')
HAS_PASSWORD=$(echo "$CREDS" | jq -r '.[] | select(.type=="password") | .type')

if [ -n "$HAS_PASSWORD" ]; then
  echo -e "${GREEN}✅ Password credential exists${NC}"
else
  echo -e "${YELLOW}⚠️  No password credential${NC}"
fi

if [ -n "$HAS_OTP" ]; then
  echo -e "${GREEN}✅ OTP credential exists${NC}"
  OTP_CONFIGURED="true"
else
  echo -e "${YELLOW}⚠️  No OTP credential (using custom SPI)${NC}"
  # Check if totp_secret is in attributes
  HAS_TOTP_SECRET=$(echo "$CURRENT_ATTRS" | jq -r '.totp_secret // empty')
  if [ -n "$HAS_TOTP_SECRET" ]; then
    echo -e "${GREEN}✅ TOTP secret found in user attributes${NC}"
    OTP_CONFIGURED="true"
  else
    echo -e "${RED}❌ No TOTP secret in user attributes${NC}"
    OTP_CONFIGURED="false"
  fi
fi
echo ""

# Step 5: Set AAL2 attributes
echo -e "${CYAN}🛠️  Step 5: Setting AAL2 attributes...${NC}"

if [ "$OTP_CONFIGURED" = "true" ]; then
  ACR_VALUE="1"  # AAL2 (MFA completed)
  AMR_VALUE='["pwd","otp"]'
  echo "   Setting ACR to: $ACR_VALUE (AAL2)"
  echo "   Setting AMR to: $AMR_VALUE (password + OTP)"
else
  ACR_VALUE="0"  # AAL1 (password only)
  AMR_VALUE='["pwd"]'
  echo "   Setting ACR to: $ACR_VALUE (AAL1 - no MFA)"
  echo "   Setting AMR to: $AMR_VALUE (password only)"
fi

# Prepare the attributes update
# Get current user data first, then merge attributes
CURRENT_USER=$(curl -s -X GET "$KEYCLOAK_URL/admin/realms/$REALM/users/$USER_ID" \
  -H "Authorization: Bearer $TOKEN")

# Extract existing totp_secret if present
TOTP_SECRET=$(echo "$CURRENT_USER" | jq -r '.attributes.totp_secret[0] // empty')

# Build attributes JSON preserving existing values
if [ -n "$TOTP_SECRET" ]; then
  ATTRIBUTES_JSON=$(jq -n \
    --arg uniqueID "admin@dive-v3.pilot" \
    --arg clearance "TOP_SECRET" \
    --arg country "USA" \
    --arg coi '["NATO-COSMIC","FVEY","CAN-US"]' \
    --arg dutyOrg "DIVE_ADMIN" \
    --arg orgUnit "SYSTEM_ADMINISTRATION" \
    --arg acr "$ACR_VALUE" \
    --arg amr "$AMR_VALUE" \
    --arg totpSecret "$TOTP_SECRET" \
    --arg totpConfigured "true" \
    '{
      attributes: {
        uniqueID: [$uniqueID],
        clearance: [$clearance],
        countryOfAffiliation: [$country],
        acpCOI: [$coi],
        dutyOrg: [$dutyOrg],
        orgUnit: [$orgUnit],
        acr: [$acr],
        amr: [$amr],
        totp_secret: [$totpSecret],
        totp_configured: [$totpConfigured]
      }
    }')
else
  ATTRIBUTES_JSON=$(jq -n \
    --arg uniqueID "admin@dive-v3.pilot" \
    --arg clearance "TOP_SECRET" \
    --arg country "USA" \
    --arg coi '["NATO-COSMIC","FVEY","CAN-US"]' \
    --arg dutyOrg "DIVE_ADMIN" \
    --arg orgUnit "SYSTEM_ADMINISTRATION" \
    --arg acr "$ACR_VALUE" \
    --arg amr "$AMR_VALUE" \
    '{
      attributes: {
        uniqueID: [$uniqueID],
        clearance: [$clearance],
        countryOfAffiliation: [$country],
        acpCOI: [$coi],
        dutyOrg: [$dutyOrg],
        orgUnit: [$orgUnit],
        acr: [$acr],
        amr: [$amr]
      }
    }')
fi

# Update user attributes
RESPONSE=$(curl -s -w "\n%{http_code}" -X PUT "$KEYCLOAK_URL/admin/realms/$REALM/users/$USER_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$ATTRIBUTES_JSON")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

if [ "$HTTP_CODE" = "204" ]; then
  echo -e "${GREEN}✅ Attributes updated successfully${NC}"
else
  echo -e "${RED}❌ Failed to update attributes (HTTP $HTTP_CODE)${NC}"
  echo "Response: $RESPONSE"
  exit 1
fi
echo ""

# Step 6: Verify attributes
echo -e "${CYAN}✅ Step 6: Verifying attributes...${NC}"
UPDATED_ATTRS=$(curl -s -X GET "$KEYCLOAK_URL/admin/realms/$REALM/users/$USER_ID" \
  -H "Authorization: Bearer $TOKEN" | jq '.attributes')

echo "Updated attributes:"
echo "$UPDATED_ATTRS" | jq '.'
echo ""

# Step 7: Check ACR and AMR specifically
ACR_VALUE_CHECK=$(echo "$UPDATED_ATTRS" | jq -r '.acr[0] // "missing"')
AMR_VALUE_CHECK=$(echo "$UPDATED_ATTRS" | jq -r '.amr[0] // "missing"')
CLEARANCE_CHECK=$(echo "$UPDATED_ATTRS" | jq -r '.clearance[0] // "missing"')

echo -e "${CYAN}🔍 Validation:${NC}"
echo "   ACR (Authentication Context): $ACR_VALUE_CHECK"
echo "   AMR (Authentication Methods): $AMR_VALUE_CHECK"
echo "   Clearance: $CLEARANCE_CHECK"
echo ""

if [ "$ACR_VALUE_CHECK" = "1" ] || [ "$ACR_VALUE_CHECK" = "2" ]; then
  echo -e "${GREEN}✅ ACR set correctly (AAL2 or higher)${NC}"
elif [ "$ACR_VALUE_CHECK" = "0" ]; then
  echo -e "${YELLOW}⚠️  ACR set to 0 (AAL1 - password only)${NC}"
else
  echo -e "${RED}❌ ACR not set correctly${NC}"
fi

if [[ "$AMR_VALUE_CHECK" == *"pwd"* ]] && [[ "$AMR_VALUE_CHECK" == *"otp"* ]]; then
  echo -e "${GREEN}✅ AMR includes both password and OTP${NC}"
elif [[ "$AMR_VALUE_CHECK" == *"pwd"* ]]; then
  echo -e "${YELLOW}⚠️  AMR includes only password${NC}"
else
  echo -e "${RED}❌ AMR not set correctly${NC}"
fi

if [ "$CLEARANCE_CHECK" = "TOP_SECRET" ]; then
  echo -e "${GREEN}✅ Clearance set to TOP_SECRET${NC}"
else
  echo -e "${YELLOW}⚠️  Clearance: $CLEARANCE_CHECK${NC}"
fi
echo ""

# Final summary
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}  Summary${NC}"
echo -e "${CYAN}============================================${NC}"

if [ "$OTP_CONFIGURED" = "true" ]; then
  echo -e "${GREEN}✅ User has MFA configured${NC}"
  echo -e "${GREEN}✅ AAL2 claims (ACR, AMR) set${NC}"
  echo ""
  echo -e "${GREEN}🎉 SUCCESS! User can now access classified resources${NC}"
  echo ""
  echo "Next steps:"
  echo "1. Logout from all sessions:"
  echo "   curl -X POST http://localhost:3000/api/auth/signout"
  echo ""
  echo "2. Clear browser cookies"
  echo ""
  echo "3. Login again at:"
  echo "   http://localhost:3000/login/dive-v3-broker"
  echo ""
  echo "4. Try accessing a classified resource - should work now!"
else
  echo -e "${YELLOW}⚠️  User does NOT have MFA configured${NC}"
  echo -e "${YELLOW}⚠️  AAL1 claims (password only) set${NC}"
  echo ""
  echo "To enable AAL2 (required for classified resources):"
  echo "1. Complete OTP setup via the login flow"
  echo "2. Run this script again to set AAL2 claims"
fi

echo ""
echo -e "${CYAN}============================================${NC}"

