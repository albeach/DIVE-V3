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
#
# Prerequisites:
# - Backend must be running (docker-compose up -d)
# - User must be logged in as super_admin (testuser-us)
##############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "════════════════════════════════════════════"
echo " DIVE V3 - Test IdP Cleanup Script"
echo "════════════════════════════════════════════"
echo ""

# Expected IdPs (managed by Terraform)
EXPECTED_IDPS=("canada-idp" "france-idp" "industry-idp")

# Backend API configuration
BACKEND_URL="http://localhost:4000"

echo "📡 Connecting to Backend API..."
echo "   URL: $BACKEND_URL"
echo ""

# Check if backend is reachable
if ! curl -s -f "$BACKEND_URL/health" >/dev/null 2>&1; then
  echo -e "${RED}❌ Backend is not reachable${NC}"
  echo "   Please start services: docker-compose up -d"
  exit 1
fi

echo -e "${GREEN}✅ Backend is reachable${NC}"
echo ""

# Get admin token
echo "🔐 Authentication Required"
echo ""
echo "To delete IdPs, you need a super_admin access token."
echo ""
echo "How to get token:"
echo "  1. Login to DIVE at: http://localhost:3000"
echo "  2. Login as: testuser-us / Password123!"
echo "  3. Visit: http://localhost:3000/api/auth/session"
echo "  4. Copy the 'accessToken' value"
echo "  5. Paste it below"
echo ""
read -p "Enter your admin access token: " -r ADMIN_TOKEN
echo ""

if [ -z "$ADMIN_TOKEN" ]; then
  echo -e "${RED}❌ No token provided${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Token received${NC}"
echo ""

# Get all IdPs from backend (which uses Keycloak Admin Client)
echo "📋 Fetching all IdPs via Backend API..."
IDPS_RESPONSE=$(curl -s "$BACKEND_URL/api/admin/idps" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

# Check if response is valid
if ! echo "$IDPS_RESPONSE" | jq empty 2>/dev/null; then
  echo -e "${RED}❌ Invalid response from backend${NC}"
  echo "Response: $IDPS_RESPONSE"
  exit 1
fi

# Check for errors
if echo "$IDPS_RESPONSE" | jq -e '.success == false' >/dev/null 2>&1; then
  ERROR_MSG=$(echo "$IDPS_RESPONSE" | jq -r '.error')
  echo -e "${RED}❌ API Error: $ERROR_MSG${NC}"
  echo ""
  echo "Troubleshooting:"
  echo "  1. Verify you're logged in as super_admin (testuser-us)"
  echo "  2. Check token is not expired (re-login if needed)"
  echo "  3. Verify backend is running: docker ps | grep backend"
  exit 1
fi

# Extract IdPs array from response
IDPS_JSON=$(echo "$IDPS_RESPONSE" | jq -r '.data.idps')
IDPS_COUNT=$(echo "$IDPS_JSON" | jq 'length')

if [ "$IDPS_COUNT" -eq 0 ]; then
  echo -e "${YELLOW}⚠️  No IdPs found${NC}"
  echo ""
  echo "This could mean:"
  echo "  1. IdPs haven't been created yet (run: cd terraform && terraform apply)"
  echo "  2. All IdPs were recently deleted"
  echo ""
  echo "Expected IdPs (from Terraform):"
  for idp in "${EXPECTED_IDPS[@]}"; do
    echo "  • $idp"
  done
  exit 0
fi

echo -e "${GREEN}✅ Found $IDPS_COUNT IdPs${NC}"
echo ""

# List all IdPs
echo "════════════════════════════════════════════"
echo "Current IdPs:"
echo "════════════════════════════════════════════"
echo "$IDPS_JSON" | jq -r '.[] | "  • \(.alias) - \(.displayName) [\(.protocol)] enabled=\(.enabled)"'
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

# Delete rogue IdPs via backend API
echo "🗑️  Deleting rogue IdPs..."
for idp_alias in "${ROGUE_IDPS[@]}"; do
  echo -n "   Deleting $idp_alias... "
  
  DELETE_RESPONSE=$(curl -s -X DELETE "$BACKEND_URL/api/admin/idps/$idp_alias" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json")
  
  if echo "$DELETE_RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Deleted${NC}"
  else
    ERROR_MSG=$(echo "$DELETE_RESPONSE" | jq -r '.error // .message')
    echo -e "${RED}❌ Failed: $ERROR_MSG${NC}"
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

