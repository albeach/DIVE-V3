#!/bin/bash
# ============================================
# Quick Fix: Disable Problematic Conditional Flow
# ============================================
# Purpose: Temporarily disable conditional-user-attribute check
#          to restore broker authentication functionality
# Usage: ./scripts/fix-broker-auth-flow.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

KEYCLOAK_URL="https://localhost:8443"
ADMIN_USER="admin"
ADMIN_PASS="admin"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Fixing Broker Authentication Flow${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

echo -e "${YELLOW}Issue:${NC} conditional-user-attribute fails before user authentication"
echo -e "${YELLOW}Fix:${NC} Simplify authentication flow structure"
echo ""

# Get admin token
echo -e "${YELLOW}[1/3] Obtaining admin token...${NC}"
TOKEN=$(curl -s -k -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=$ADMIN_USER" \
  -d "password=$ADMIN_PASS" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r '.access_token')

if [ "$TOKEN" == "null" ] || [ -z "$TOKEN" ]; then
  echo -e "${RED}❌ Failed to obtain admin token${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Admin token obtained${NC}"
echo ""

# Realms to fix
REALMS=(
  "dive-v3-usa"
  "dive-v3-fra"
  "dive-v3-can"
  "dive-v3-gbr"
  "dive-v3-deu"
  "dive-v3-ita"
  "dive-v3-esp"
  "dive-v3-pol"
  "dive-v3-nld"
  "dive-v3-industry"
)

echo -e "${YELLOW}[2/3] Switching to standard browser flow temporarily...${NC}"
echo ""

for REALM in "${REALMS[@]}"; do
  echo -n "  Configuring $REALM..."
  
  # Switch to built-in browser flow (no MFA, but works with broker)
  curl -s -k -X PUT "$KEYCLOAK_URL/admin/realms/$REALM" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"realm\": \"$REALM\",
      \"browserFlow\": \"browser\"
    }" > /dev/null
  
  echo -e " ${GREEN}✅${NC}"
done

echo ""
echo -e "${YELLOW}[3/3] Keeping broker realm with custom flow...${NC}"
echo ""

# Broker realm can keep custom flow since it's the entry point
echo "  dive-v3-broker: Keeping custom MFA flow (no federation redirect issue)"

echo ""
echo -e "${GREEN}✅ Broker authentication flow fixed${NC}"
echo ""
echo -e "${BLUE}What was changed:${NC}"
echo "  • Federated realms (USA, FRA, CAN, etc.) switched to standard browser flow"
echo "  • Removes conditional-user-attribute check that was failing"
echo "  • Broker realm keeps custom MFA flow"
echo ""
echo -e "${YELLOW}⚠️  Trade-off:${NC}"
echo "  • Federated realms no longer enforce MFA automatically"
echo "  • MFA enforcement still active in broker realm"
echo "  • Users will be prompted for OTP after broker redirect"
echo ""
echo -e "${BLUE}Test the fix:${NC}"
echo "  1. Clear browser cookies"
echo "  2. Go to: https://localhost:3000"
echo "  3. Click Login → Select 'United States'"
echo "  4. Should see USA realm login page (not 400 error)"
echo "  5. Enter credentials"
echo "  6. Should redirect back to broker successfully"
echo ""
echo -e "${BLUE}Permanent fix:${NC}"
echo "  Update terraform/modules/realm-mfa/main.tf to restructure flow"
echo "  See: AAL-MFA-BROKER-AUTH-FIX.md for details"
echo ""











