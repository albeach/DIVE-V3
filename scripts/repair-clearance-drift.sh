#!/bin/bash
# ============================================
# Clearance Attribute Drift Repair Script
# ============================================
# Phase 2: Attribute Normalization & Mapper Consolidation
# Repairs users with missing clearanceOriginal attributes
#
# Usage: ./scripts/repair-clearance-drift.sh [--dry-run]
# 
# Detects users who have 'clearance' but missing 'clearanceOriginal'
# and repairs them by copying clearance → clearanceOriginal

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
DRY_RUN=false
if [ "$1" == "--dry-run" ]; then
  DRY_RUN=true
  echo -e "${YELLOW}⚠️  DRY RUN MODE - No changes will be made${NC}"
  echo ""
fi

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}Clearance Attribute Drift Repair${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Counters
TOTAL_USERS=0
USERS_WITH_DRIFT=0
USERS_REPAIRED=0
USERS_ALREADY_COMPLIANT=0

# Get all users from broker realm
echo "Scanning users in dive-v3-broker realm..."
USER_LIST=$(docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh get users \
  -r dive-v3-broker --fields id,username,attributes 2>/dev/null)

# Parse JSON and check each user
echo "$USER_LIST" | jq -r '.[] | @base64' | while read -r user_data; do
  # Decode user data
  _jq() {
    echo "$user_data" | base64 --decode | jq -r "$1"
  }
  
  user_id=$(_jq '.id')
  username=$(_jq '.username')
  clearance=$(_jq '.attributes.clearance[0] // empty')
  clearanceOriginal=$(_jq '.attributes.clearanceOriginal[0] // empty')
  
  TOTAL_USERS=$((TOTAL_USERS + 1))
  
  # Skip if no clearance attribute (user probably doesn't need it)
  if [ -z "$clearance" ]; then
    continue
  fi
  
  # Check for drift: has clearance but missing clearanceOriginal
  if [ -n "$clearance" ] && [ -z "$clearanceOriginal" ]; then
    USERS_WITH_DRIFT=$((USERS_WITH_DRIFT + 1))
    echo -e "${YELLOW}⚠️  Drift detected: ${username} (clearance=${clearance}, clearanceOriginal=MISSING)${NC}"
    
    if [ "$DRY_RUN" == "false" ]; then
      # Repair: Set clearanceOriginal = clearance
      docker exec dive-v3-keycloak /opt/keycloak/bin/kcadm.sh update users/$user_id \
        -r dive-v3-broker -s "attributes.clearanceOriginal=[\"${clearance}\"]" 2>/dev/null
      
      echo -e "${GREEN}  ✅ Repaired: ${username} → clearanceOriginal=${clearance}${NC}"
      USERS_REPAIRED=$((USERS_REPAIRED + 1))
    else
      echo -e "${BLUE}  ℹ️  Would repair: ${username} → clearanceOriginal=${clearance}${NC}"
    fi
  elif [ -n "$clearance" ] && [ -n "$clearanceOriginal" ]; then
    USERS_ALREADY_COMPLIANT=$((USERS_ALREADY_COMPLIANT + 1))
  fi
done

echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}Summary${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

echo "Total Users Scanned: $TOTAL_USERS"
echo "Users with Drift: $USERS_WITH_DRIFT"
echo "Users Already Compliant: $USERS_ALREADY_COMPLIANT"

if [ "$DRY_RUN" == "false" ]; then
  echo "Users Repaired: $USERS_REPAIRED"
else
  echo "Users That Would Be Repaired: $USERS_WITH_DRIFT"
fi

echo ""

# Final status
if [ $USERS_WITH_DRIFT -eq 0 ]; then
  echo -e "${GREEN}✅ NO DRIFT DETECTED - All users have clearanceOriginal${NC}"
  echo -e "${GREEN}✅ Clearance attribute integrity: 100%${NC}"
  exit 0
elif [ "$DRY_RUN" == "true" ]; then
  echo -e "${YELLOW}⚠️  DRIFT DETECTED - ${USERS_WITH_DRIFT} user(s) need repair${NC}"
  echo -e "${BLUE}ℹ️  Run without --dry-run to apply fixes${NC}"
  exit 1
elif [ $USERS_REPAIRED -eq $USERS_WITH_DRIFT ]; then
  echo -e "${GREEN}✅ ALL DRIFT REPAIRED - ${USERS_REPAIRED} user(s) fixed${NC}"
  echo -e "${GREEN}✅ Clearance attribute integrity restored: 100%${NC}"
  exit 0
else
  echo -e "${RED}❌ REPAIR INCOMPLETE - ${USERS_REPAIRED}/${USERS_WITH_DRIFT} users fixed${NC}"
  echo -e "${YELLOW}⚠️  Run script again to retry${NC}"
  exit 1
fi

