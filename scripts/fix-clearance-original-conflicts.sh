#!/usr/bin/env bash
# ============================================
# Fix clearanceOriginal for 5 Users with Email Conflicts
# ============================================
# These users already existed with the same email, so terraform couldn't
# add the clearanceOriginal attribute. This script manually adds it via
# Keycloak Admin API.
#
# Usage: ./scripts/fix-clearance-original-conflicts.sh
# ============================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  DIVE V3 - Fix clearanceOriginal for Conflicted Users         ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Keycloak configuration
KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8081}"
KEYCLOAK_ADMIN="${KEYCLOAK_ADMIN:-admin}"
KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-admin}"

echo -e "${YELLOW}→ Keycloak URL:${NC} $KEYCLOAK_URL"
echo ""

# Get admin access token
echo -e "${YELLOW}→ Getting admin access token...${NC}"
ADMIN_TOKEN=$(curl -s -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=$KEYCLOAK_ADMIN" \
  -d "password=$KEYCLOAK_ADMIN_PASSWORD" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r '.access_token')

if [ "$ADMIN_TOKEN" == "null" ] || [ -z "$ADMIN_TOKEN" ]; then
  echo -e "${RED}✗ Failed to get admin token${NC}"
  echo -e "${YELLOW}  Check KEYCLOAK_URL, KEYCLOAK_ADMIN, KEYCLOAK_ADMIN_PASSWORD${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Admin token obtained${NC}"
echo ""

# Function to add clearanceOriginal attribute to a user
add_clearance_original() {
  local realm=$1
  local username=$2
  local clearance_original=$3
  
  echo -e "${YELLOW}→ Processing: ${NC}${username}@${realm} → clearanceOriginal='${clearance_original}'"
  
  # Get user ID
  USER_ID=$(curl -s -X GET "$KEYCLOAK_URL/admin/realms/${realm}/users?username=${username}&exact=true" \
    -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '.[0].id')
  
  if [ "$USER_ID" == "null" ] || [ -z "$USER_ID" ]; then
    echo -e "${RED}  ✗ User not found: ${username}${NC}"
    return 1
  fi
  
  # Get current user attributes
  USER_DATA=$(curl -s -X GET "$KEYCLOAK_URL/admin/realms/${realm}/users/${USER_ID}" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
  
  # Extract current attributes and add clearanceOriginal
  UPDATED_ATTRIBUTES=$(echo "$USER_DATA" | jq --arg co "$clearance_original" \
    '.attributes.clearanceOriginal = [$co] | .attributes')
  
  # Update user with new attribute
  UPDATE_RESULT=$(curl -s -w "%{http_code}" -o /dev/null -X PUT \
    "$KEYCLOAK_URL/admin/realms/${realm}/users/${USER_ID}" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$(echo "$USER_DATA" | jq --argjson attrs "$UPDATED_ATTRIBUTES" '.attributes = $attrs')")
  
  if [ "$UPDATE_RESULT" == "204" ]; then
    echo -e "${GREEN}  ✓ Successfully added clearanceOriginal='${clearance_original}'${NC}"
    return 0
  else
    echo -e "${RED}  ✗ Failed to update user (HTTP ${UPDATE_RESULT})${NC}"
    return 1
  fi
}

# Process each of the 5 conflicted users
echo -e "${YELLOW}════════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}Processing 5 users with email conflicts...${NC}"
echo -e "${YELLOW}════════════════════════════════════════════════════════════════${NC}"
echo ""

SUCCESS_COUNT=0
FAIL_COUNT=0

# 1. james.smith@mod.uk (GBR - SECRET)
if add_clearance_original "dive-v3-gbr" "james.smith" "SECRET"; then
  ((SUCCESS_COUNT++))
else
  ((FAIL_COUNT++))
fi
echo ""

# 2. marco.rossi@difesa.it (ITA - SEGRETO)
if add_clearance_original "dive-v3-ita" "marco.rossi" "SEGRETO"; then
  ((SUCCESS_COUNT++))
else
  ((FAIL_COUNT++))
fi
echo ""

# 3. pieter.devries@defensie.nl (NLD - GEHEIM)
if add_clearance_original "dive-v3-nld" "pieter.devries" "GEHEIM"; then
  ((SUCCESS_COUNT++))
else
  ((FAIL_COUNT++))
fi
echo ""

# 4. jan.kowalski@mon.gov.pl (POL - TAJNY)
if add_clearance_original "dive-v3-pol" "jan.kowalski" "TAJNY"; then
  ((SUCCESS_COUNT++))
else
  ((FAIL_COUNT++))
fi
echo ""

# 5. bob.contractor@lockheed.com (Industry - SENSITIVE)
if add_clearance_original "dive-v3-industry" "bob.contractor" "SENSITIVE"; then
  ((SUCCESS_COUNT++))
else
  ((FAIL_COUNT++))
fi
echo ""

# Summary
echo -e "${YELLOW}════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ Successfully updated: ${SUCCESS_COUNT}/5 users${NC}"
if [ $FAIL_COUNT -gt 0 ]; then
  echo -e "${RED}✗ Failed: ${FAIL_COUNT}/5 users${NC}"
fi
echo -e "${YELLOW}════════════════════════════════════════════════════════════════${NC}"
echo ""

# Verification instructions
echo -e "${YELLOW}Next Steps - Verify the fix:${NC}"
echo ""
echo -e "1. Login to Keycloak Admin Console:"
echo -e "   ${GREEN}http://localhost:8081/admin${NC}"
echo ""
echo -e "2. Navigate to each realm and check user attributes:"
echo -e "   • ${GREEN}dive-v3-gbr${NC} → Users → james.smith → Attributes → clearanceOriginal=SECRET"
echo -e "   • ${GREEN}dive-v3-ita${NC} → Users → marco.rossi → Attributes → clearanceOriginal=SEGRETO"
echo -e "   • ${GREEN}dive-v3-nld${NC} → Users → pieter.devries → Attributes → clearanceOriginal=GEHEIM"
echo -e "   • ${GREEN}dive-v3-pol${NC} → Users → jan.kowalski → Attributes → clearanceOriginal=TAJNY"
echo -e "   • ${GREEN}dive-v3-industry${NC} → Users → bob.contractor → Attributes → clearanceOriginal=SENSITIVE"
echo ""
echo -e "3. Test with user login and JWT token verification:"
echo -e "   ${GREEN}./scripts/verify-clearance-original.sh james.smith Password123!${NC}"
echo ""

if [ $SUCCESS_COUNT -eq 5 ]; then
  echo -e "${GREEN}✅ All users successfully updated!${NC}"
  exit 0
else
  echo -e "${YELLOW}⚠️  Some users failed to update. Check logs above.${NC}"
  exit 1
fi

