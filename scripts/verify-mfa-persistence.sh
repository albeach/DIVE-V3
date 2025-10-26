#!/bin/bash
###############################################################################
# VERIFY MFA PERSISTENCE FOR admin-dive USER
###############################################################################
# This script verifies that MFA is properly configured and persisting
#
# Usage: ./scripts/verify-mfa-persistence.sh
# Requirements: curl, jq, docker
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8081}"
KEYCLOAK_ADMIN_USER="${KEYCLOAK_ADMIN_USERNAME:-admin}"
KEYCLOAK_ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
REALM="dive-v3-broker"
USERNAME="admin-dive"

echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  🔍 MFA PERSISTENCE VERIFICATION - admin-dive User            ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

###############################################################################
# Get Admin Token
###############################################################################
echo -e "${BLUE}[1/5]${NC} Authenticating with Keycloak..."
TOKEN_RESPONSE=$(curl -s -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=${KEYCLOAK_ADMIN_USER}" \
  -d "password=${KEYCLOAK_ADMIN_PASS}" \
  -d "grant_type=password" \
  -d "client_id=admin-cli")

TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo -e "${RED}❌ FAIL: Cannot authenticate with Keycloak${NC}"
  exit 1
fi

echo -e "${GREEN}✅ PASS: Admin token obtained${NC}"
echo ""

###############################################################################
# Get User ID
###############################################################################
echo -e "${BLUE}[2/5]${NC} Looking up user..."
USER_RESPONSE=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users?username=${USERNAME}" \
  -H "Authorization: Bearer $TOKEN")

USER_ID=$(echo "$USER_RESPONSE" | jq -r '.[0].id')

if [ -z "$USER_ID" ] || [ "$USER_ID" = "null" ]; then
  echo -e "${RED}❌ FAIL: User ${USERNAME} not found${NC}"
  exit 1
fi

echo -e "${GREEN}✅ PASS: User found (ID: ${USER_ID})${NC}"
echo ""

###############################################################################
# Verify Attributes
###############################################################################
echo -e "${BLUE}[3/5]${NC} Verifying user attributes..."

USER_DATA=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}" \
  -H "Authorization: Bearer $TOKEN")

UNIQUEID=$(echo "$USER_DATA" | jq -r '.attributes.uniqueID[0] // "NOT_SET"')
CLEARANCE=$(echo "$USER_DATA" | jq -r '.attributes.clearance[0] // "NOT_SET"')
COUNTRY=$(echo "$USER_DATA" | jq -r '.attributes.countryOfAffiliation[0] // "NOT_SET"')
COI=$(echo "$USER_DATA" | jq -r '.attributes.acpCOI[0] // "NOT_SET"')

echo ""
echo "   📋 User Attributes:"
echo "   ├─ uniqueID: ${UNIQUEID}"
echo "   ├─ clearance: ${CLEARANCE}"
echo "   ├─ countryOfAffiliation: ${COUNTRY}"
echo "   └─ acpCOI: ${COI}"
echo ""

# Check each attribute
ATTR_PASS=true

if [ "$UNIQUEID" = "admin@dive-v3.pilot" ]; then
  echo -e "   ${GREEN}✅ PASS: uniqueID is correct${NC}"
else
  echo -e "   ${RED}❌ FAIL: uniqueID is incorrect (expected: admin@dive-v3.pilot, got: $UNIQUEID)${NC}"
  ATTR_PASS=false
fi

if [ "$CLEARANCE" = "TOP_SECRET" ]; then
  echo -e "   ${GREEN}✅ PASS: clearance is correct${NC}"
else
  echo -e "   ${RED}❌ FAIL: clearance is incorrect (expected: TOP_SECRET, got: $CLEARANCE)${NC}"
  ATTR_PASS=false
fi

if [ "$COUNTRY" = "USA" ]; then
  echo -e "   ${GREEN}✅ PASS: countryOfAffiliation is correct${NC}"
else
  echo -e "   ${RED}❌ FAIL: countryOfAffiliation is incorrect (expected: USA, got: $COUNTRY)${NC}"
  ATTR_PASS=false
fi

echo ""

###############################################################################
# Verify Credentials
###############################################################################
echo -e "${BLUE}[4/5]${NC} Verifying credentials..."

CREDENTIALS=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}/credentials" \
  -H "Authorization: Bearer $TOKEN")

HAS_PASSWORD=$(echo "$CREDENTIALS" | jq '[.[] | select(.type=="password")] | length > 0')
HAS_OTP=$(echo "$CREDENTIALS" | jq '[.[] | select(.type=="otp")] | length > 0')
PASSWORD_DATE=$(echo "$CREDENTIALS" | jq -r '[.[] | select(.type=="password")][0].createdDate // 0')
OTP_DATE=$(echo "$CREDENTIALS" | jq -r '[.[] | select(.type=="otp")][0].createdDate // 0')

echo ""
echo "   🔐 Credentials:"

CRED_PASS=true

if [ "$HAS_PASSWORD" = "true" ]; then
  PASSWORD_TIMESTAMP=$(date -r $(($PASSWORD_DATE / 1000)) '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo "N/A")
  echo "   ├─ Password: ✅ Present (created: $PASSWORD_TIMESTAMP)"
else
  echo -e "   ├─ Password: ${RED}❌ MISSING${NC}"
  CRED_PASS=false
fi

if [ "$HAS_OTP" = "true" ]; then
  OTP_TIMESTAMP=$(date -r $(($OTP_DATE / 1000)) '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo "N/A")
  echo "   └─ OTP: ✅ Present (created: $OTP_TIMESTAMP)"
else
  echo -e "   └─ OTP: ${RED}❌ MISSING${NC}"
  CRED_PASS=false
fi

echo ""

if [ "$HAS_PASSWORD" = "true" ]; then
  echo -e "   ${GREEN}✅ PASS: Password credential exists${NC}"
else
  echo -e "   ${RED}❌ FAIL: Password credential missing${NC}"
fi

if [ "$HAS_OTP" = "true" ]; then
  echo -e "   ${GREEN}✅ PASS: OTP credential exists${NC}"
else
  echo -e "   ${RED}❌ FAIL: OTP credential missing${NC}"
fi

echo ""

###############################################################################
# Verify Authentication Flow
###############################################################################
echo -e "${BLUE}[5/5]${NC} Verifying authentication flow binding..."

REALM_INFO=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}" \
  -H "Authorization: Bearer $TOKEN")

BROWSER_FLOW=$(echo "$REALM_INFO" | jq -r '.browserFlow // "NOT_SET"')

echo ""
echo "   🔀 Authentication Flow:"
echo "   └─ Browser Flow: ${BROWSER_FLOW}"
echo ""

FLOW_PASS=true

if echo "$BROWSER_FLOW" | grep -q "Classified"; then
  echo -e "   ${GREEN}✅ PASS: Custom MFA flow is bound${NC}"
else
  echo -e "   ${RED}❌ FAIL: Custom MFA flow NOT bound (using: $BROWSER_FLOW)${NC}"
  FLOW_PASS=false
fi

echo ""

###############################################################################
# AAL Compliance Check
###############################################################################
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}🔐 AAL COMPLIANCE CHECK${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Determine AAL level
if [ "$CLEARANCE" = "UNCLASSIFIED" ]; then
  REQUIRED_AAL="AAL1"
  REQUIRED_MFA=false
else
  REQUIRED_AAL="AAL2"
  REQUIRED_MFA=true
fi

if [ "$HAS_PASSWORD" = "true" ] && [ "$HAS_OTP" = "true" ]; then
  CURRENT_AAL="AAL2"
elif [ "$HAS_PASSWORD" = "true" ]; then
  CURRENT_AAL="AAL1"
else
  CURRENT_AAL="AAL0 (INVALID)"
fi

echo "   📊 Authentication Assurance Level (AAL):"
echo "   ├─ Clearance: ${CLEARANCE}"
echo "   ├─ Required AAL: ${REQUIRED_AAL}"
echo "   ├─ Current AAL: ${CURRENT_AAL}"
echo "   └─ MFA Required: $([ "$REQUIRED_MFA" = true ] && echo "YES" || echo "NO")"
echo ""

AAL_PASS=false
if [ "$CLEARANCE" = "TOP_SECRET" ] && [ "$CURRENT_AAL" = "AAL2" ]; then
  echo -e "   ${GREEN}✅ PASS: AAL2 compliance met (TOP_SECRET + MFA)${NC}"
  AAL_PASS=true
elif [ "$CLEARANCE" = "UNCLASSIFIED" ] && [ "$CURRENT_AAL" = "AAL1" ]; then
  echo -e "   ${GREEN}✅ PASS: AAL1 sufficient for UNCLASSIFIED${NC}"
  AAL_PASS=true
elif [ "$CLEARANCE" = "TOP_SECRET" ] && [ "$CURRENT_AAL" = "AAL1" ]; then
  echo -e "   ${RED}❌ FAIL: AAL2 REQUIRED for TOP_SECRET (MFA missing)${NC}"
else
  echo -e "   ${YELLOW}⚠️  WARNING: Unexpected AAL configuration${NC}"
fi

echo ""

###############################################################################
# Final Summary
###############################################################################
echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  📊 FINAL RESULTS                                              ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Count passes
TOTAL_TESTS=5
PASSED_TESTS=0

[ "$ATTR_PASS" = true ] && ((PASSED_TESTS++))
[ "$CRED_PASS" = true ] && ((PASSED_TESTS++))
[ "$FLOW_PASS" = true ] && ((PASSED_TESTS++))
[ "$AAL_PASS" = true ] && ((PASSED_TESTS++))
[ "$HAS_PASSWORD" = "true" ] && ((PASSED_TESTS++))

echo "   📈 Test Results: ${PASSED_TESTS}/${TOTAL_TESTS} passed"
echo ""

if [ "$ATTR_PASS" = true ] && [ "$CRED_PASS" = true ] && [ "$AAL_PASS" = true ]; then
  echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  🎉 SUCCESS: MFA PERSISTENCE VERIFIED                         ║${NC}"
  echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo "✅ All checks passed!"
  echo "✅ MFA is properly configured and persisting"
  echo "✅ AAL2 compliance achieved"
  echo ""
  echo "Your admin-dive account is secure and ready for use."
  echo ""
  exit 0
elif [ "$ATTR_PASS" = true ] && [ "$CRED_PASS" = false ]; then
  echo -e "${YELLOW}╔════════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${YELLOW}║  ⚠️  PARTIAL: Attributes OK, OTP Not Configured               ║${NC}"
  echo -e "${YELLOW}╚════════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo "✅ User attributes are correct"
  echo "⚠️  OTP credential not configured"
  echo ""
  echo "📋 Next Steps:"
  echo "1. Login to DIVE V3: http://localhost:3000/login/dive-v3-broker"
  echo "2. You will be prompted to scan a QR code"
  echo "3. Use an authenticator app to scan the QR code"
  echo "4. Enter the 6-digit code"
  echo "5. Run this verification script again"
  echo ""
  exit 1
else
  echo -e "${RED}╔════════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${RED}║  ❌ FAILURE: MFA CONFIGURATION ISSUES DETECTED                 ║${NC}"
  echo -e "${RED}╚════════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  
  [ "$ATTR_PASS" = false ] && echo "❌ User attributes are incorrect or missing"
  [ "$CRED_PASS" = false ] && echo "❌ OTP credential not configured"
  [ "$FLOW_PASS" = false ] && echo "❌ Authentication flow not bound correctly"
  [ "$AAL_PASS" = false ] && echo "❌ AAL2 compliance not met"
  
  echo ""
  echo "📋 Action Required:"
  echo "   Run the fix script: ./scripts/fix-mfa-persistence.sh"
  echo ""
  exit 1
fi

