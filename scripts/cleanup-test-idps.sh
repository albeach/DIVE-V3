#!/bin/bash

##############################################################################
# Cleanup Test IdPs from Keycloak
##############################################################################
# This script removes rogue test IdPs that were manually created and
# are not managed by Terraform.
#
# Safe to run: Only deletes IdPs NOT in the expected list.
#
# Usage: ./scripts/cleanup-test-idps.sh
##############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "════════════════════════════════════════════"
echo " DIVE V3 - Test IdP Cleanup Script"
echo "════════════════════════════════════════════"
echo ""

# Expected IdPs (managed by Terraform)
EXPECTED_IDPS=("canada-idp" "france-idp" "industry-idp")

# Keycloak configuration
KEYCLOAK_URL="http://localhost:8081"
REALM="dive-v3-pilot"
ADMIN_USER="admin"
ADMIN_PASSWORD="admin"

echo "📡 Connecting to Keycloak..."
echo "   URL: $KEYCLOAK_URL"
echo "   Realm: $REALM"
echo ""

# Get admin token
echo "🔐 Authenticating as admin..."
ADMIN_TOKEN=$(curl -s -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=$ADMIN_USER" \
  -d "password=$ADMIN_PASSWORD" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r '.access_token')

if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "null" ]; then
  echo -e "${RED}❌ Failed to get admin token${NC}"
  echo "   Check that Keycloak is running: docker ps | grep keycloak"
  exit 1
fi

echo -e "${GREEN}✅ Authenticated successfully${NC}"
echo ""

# Get all IdPs from Keycloak
echo "📋 Fetching all IdPs from Keycloak..."
IDPS_JSON=$(curl -s "$KEYCLOAK_URL/admin/realms/$REALM/identity-providers/instances" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

if echo "$IDPS_JSON" | jq empty 2>/dev/null; then
  # Valid JSON
  IDPS_COUNT=$(echo "$IDPS_JSON" | jq 'length')
  echo -e "${GREEN}✅ Found $IDPS_COUNT IdPs${NC}"
  echo ""
else
  echo -e "${RED}❌ Failed to fetch IdPs: $IDPS_JSON${NC}"
  exit 1
fi

# List all IdPs
echo "════════════════════════════════════════════"
echo "Current IdPs:"
echo "════════════════════════════════════════════"
echo "$IDPS_JSON" | jq -r '.[] | "  • \(.alias) - \(.displayName) [\(.providerId)] enabled=\(.enabled)"'
echo ""

# Identify rogue IdPs
ROGUE_IDPS=()
for alias in $(echo "$IDPS_JSON" | jq -r '.[].alias'); do
  # Check if in expected list
  if [[ ! " ${EXPECTED_IDPS[@]} " =~ " ${alias} " ]]; then
    ROGUE_IDPS+=("$alias")
  fi
done

# Display findings
if [ ${#ROGUE_IDPS[@]} -eq 0 ]; then
  echo -e "${GREEN}✅ No rogue IdPs found - all IdPs are managed by Terraform${NC}"
  echo ""
  echo "Expected IdPs present:"
  for idp in "${EXPECTED_IDPS[@]}"; do
    echo "  ✅ $idp"
  done
  exit 0
else
  echo -e "${YELLOW}⚠️  Found ${#ROGUE_IDPS[@]} rogue IdP(s) NOT managed by Terraform:${NC}"
  for idp in "${ROGUE_IDPS[@]}"; do
    echo -e "  ${RED}❌ $idp${NC}"
  done
  echo ""
fi

# Confirm deletion
echo "════════════════════════════════════════════"
echo "⚠️  WARNING: The following IdPs will be DELETED:"
for idp in "${ROGUE_IDPS[@]}"; do
  echo "   - $idp"
done
echo ""
read -p "Continue with deletion? (yes/no): " -r
echo ""

if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
  echo "❌ Cancelled by user"
  exit 0
fi

# Delete rogue IdPs
echo "🗑️  Deleting rogue IdPs..."
for idp_alias in "${ROGUE_IDPS[@]}"; do
  echo -n "   Deleting $idp_alias... "
  
  RESULT=$(curl -s -X DELETE "$KEYCLOAK_URL/admin/realms/$REALM/identity-providers/instances/$idp_alias" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -w "%{http_code}")
  
  if [ "$RESULT" = "204" ] || [ "$RESULT" = "200" ]; then
    echo -e "${GREEN}✅ Deleted${NC}"
  else
    echo -e "${RED}❌ Failed (HTTP $RESULT)${NC}"
  fi
done

echo ""
echo "════════════════════════════════════════════"
echo "✅ Cleanup complete!"
echo ""

# Verify via backend API
echo "📡 Verifying via backend API..."
curl -s http://localhost:4000/api/idps/public | jq '.idps[] | {alias, displayName}'

echo ""
echo -e "${GREEN}✅ Script complete${NC}"
echo ""
echo "Next steps:"
echo "  1. Refresh browser (Cmd+Shift+R)"
echo "  2. Verify only 3 IdPs shown + Direct Login button"
echo "  3. Test that Direct Login works (testuser-us)"
echo ""

