#!/bin/bash
###############################################################################
# SWITCH TO STANDARD BROWSER FLOW (Option A - Quick Fix)
###############################################################################
# This script implements the immediate fix for MFA persistence:
# - Terminates all Keycloak SSO sessions
# - Provides instructions to switch from Direct Grant to Browser Flow
#
# After running this script, MFA setup will work correctly via Keycloak's
# native browser flow (requires code changes in frontend).
###############################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8081}"
REALM="dive-v3-broker"
USER_ID="5c16b28d-8c5a-46d0-8dd6-2fc3779d74f6"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  🔧 SWITCH TO STANDARD BROWSER FLOW (MFA Fix)                ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

###############################################################################
# Step 1: Get Admin Token
###############################################################################
echo -e "${BLUE}[1/3]${NC} Authenticating to Keycloak..."
TOKEN=$(curl -s -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r '.access_token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo -e "${RED}❌ Failed to get admin token${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Authenticated${NC}"
echo ""

###############################################################################
# Step 2: Terminate All Sessions for admin-dive
###############################################################################
echo -e "${BLUE}[2/3]${NC} Terminating all active sessions for admin-dive..."

SESSIONS=$(curl -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}/sessions" \
  -H "Authorization: Bearer $TOKEN")

SESSION_COUNT=$(echo "$SESSIONS" | jq '. | length')

if [ "$SESSION_COUNT" -gt 0 ]; then
  echo "   Found ${SESSION_COUNT} active session(s)"
  
  # Delete all sessions
  DELETE_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
    "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}/sessions" \
    -H "Authorization: Bearer $TOKEN")
  
  if [ "$DELETE_RESPONSE" = "204" ] || [ "$DELETE_RESPONSE" = "200" ]; then
    echo -e "${GREEN}✅ All sessions terminated${NC}"
  else
    echo -e "${RED}❌ Failed to terminate sessions (HTTP $DELETE_RESPONSE)${NC}"
  fi
else
  echo -e "${GREEN}✅ No active sessions found${NC}"
fi

echo ""

###############################################################################
# Step 3: Instructions for Code Changes
###############################################################################
echo -e "${BLUE}[3/3]${NC} ${CYAN}CODE CHANGES REQUIRED${NC}"
echo ""
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}⚠️  MANUAL CODE CHANGES NEEDED${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "To fix MFA persistence, you need to temporarily disable the custom"
echo "login page and use Keycloak's standard browser flow."
echo ""
echo -e "${CYAN}OPTION 1: Comment Out Custom Login Route${NC}"
echo ""
echo "File: ${BLUE}frontend/src/middleware.ts${NC} (or auth configuration)"
echo ""
echo "Find the line that redirects to custom login page:"
echo "  ${RED}// return Response.redirect(new URL(\"/login/dive-v3-broker\", nextUrl));${NC}"
echo ""
echo "Replace with standard Keycloak redirect:"
echo "  ${GREEN}return Response.redirect(new URL(\"/api/auth/signin/keycloak\", nextUrl));${NC}"
echo ""
echo -e "${CYAN}OPTION 2: Update IdP Selector${NC}"
echo ""
echo "File: ${BLUE}frontend/src/components/auth/idp-selector.tsx${NC}"
echo ""
echo "Change the login button to use NextAuth signIn instead of custom page:"
echo "  ${RED}// router.push(\"/login/\${idp.alias}\")${NC}"
echo "  ${GREEN}signIn(\"keycloak\", { callbackUrl: \"/dashboard\", kc_idp_hint: idp.alias })${NC}"
echo ""
echo -e "${CYAN}OPTION 3: Redirect from Custom Login Page${NC}"
echo ""
echo "File: ${BLUE}frontend/src/app/login/[idpAlias]/page.tsx${NC}"
echo ""
echo "At the top of the component, add immediate redirect:"
echo "  ${GREEN}useEffect(() => {${NC}"
echo "  ${GREEN}  signIn(\"keycloak\", { callbackUrl: \"/dashboard\" });${NC}"
echo "  ${GREEN}}, []);${NC}"
echo ""
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${CYAN}WHY THIS FIX IS NEEDED:${NC}"
echo ""
echo "Direct Grant flow (used by custom login page) CANNOT handle OTP setup."
echo "Keycloak's browser flow is required for:"
echo "  • QR code display"
echo "  • OTP credential enrollment"
echo "  • Required actions (CONFIGURE_TOTP)"
echo ""
echo "See: ${BLUE}ROOT-CAUSE-DIRECT-GRANT-INCOMPATIBILITY.md${NC} for full details"
echo ""
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${GREEN}TESTING STEPS AFTER CODE CHANGES:${NC}"
echo ""
echo "1. Restart Next.js frontend:"
echo "   ${BLUE}cd frontend && npm run dev${NC}"
echo ""
echo "2. Clear all browser cookies"
echo ""
echo "3. Navigate to: ${BLUE}http://localhost:3000${NC}"
echo ""
echo "4. Click on DIVE V3 Broker IdP"
echo ""
echo "5. Should redirect to Keycloak login page (not custom page)"
echo ""
echo "6. Enter credentials:"
echo "   Username: ${BLUE}admin-dive${NC}"
echo "   Password: ${BLUE}DiveAdmin2025!${NC}"
echo ""
echo "7. Keycloak should display QR code page"
echo ""
echo "8. Scan QR code with authenticator app"
echo ""
echo "9. Enter 6-digit OTP code"
echo ""
echo "10. Verify OTP credential persisted:"
echo "    ${BLUE}docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get users/${USER_ID}/credentials -r ${REALM}${NC}"
echo "    Should show BOTH password AND otp credentials"
echo ""
echo "11. Logout and login again - should prompt for OTP (not QR)"
echo ""
echo -e "${GREEN}✅ If step 11 succeeds, MFA is working correctly!${NC}"
echo ""
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${CYAN}LONG-TERM SOLUTION:${NC}"
echo ""
echo "Consider developing a custom Keycloak theme to match DIVE V3 design"
echo "while keeping the benefits of Keycloak's native authentication flows."
echo ""
echo "See Option D in: ${BLUE}ROOT-CAUSE-DIRECT-GRANT-INCOMPATIBILITY.md${NC}"
echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo ""


