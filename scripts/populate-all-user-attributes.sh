#!/bin/bash
# ============================================
# Populate User Attributes for All Realms
# ============================================
# Workaround for Terraform Keycloak Provider v5.5.0 bug
# Sets clearance, clearanceOriginal, countryOfAffiliation for all 40 test users
#
# Usage: ./scripts/populate-all-user-attributes.sh [--dry-run]

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Parse arguments
DRY_RUN=false
if [ "$1" == "--dry-run" ]; then
  DRY_RUN=true
  echo -e "${YELLOW}⚠️  DRY RUN MODE - No changes will be made${NC}"
fi

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}Populate User Attributes Across All Realms${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Get admin token
echo "Authenticating to Keycloak..."
TOKEN=$(docker exec dive-v3-keycloak curl -s -X POST \
  http://localhost:8080/realms/master/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=admin-cli" \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password" | jq -r '.access_token')

if [ -z "$TOKEN" ] || [ "$TOKEN" == "null" ]; then
  echo -e "${RED}❌ Failed to get admin token${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Authenticated successfully${NC}"
echo ""

# Counters
TOTAL_USERS=0
USERS_UPDATED=0
USERS_FAILED=0

# Function to update user attributes
update_user_attributes() {
  local realm=$1
  local username=$2
  local clearance=$3
  local clearance_original=$4
  local country=$5
  local coi=$6  # Comma-separated list or empty
  local unique_id=$7
  
  TOTAL_USERS=$((TOTAL_USERS + 1))
  
  echo -e "${BLUE}Processing: $username ($realm) - $clearance${NC}"
  
  # Get user ID
  USER_ID=$(docker exec dive-v3-keycloak curl -s -X GET \
    "http://localhost:8080/admin/realms/$realm/users?username=$username&exact=true" \
    -H "Authorization: Bearer $TOKEN" | jq -r '.[0].id // empty')
  
  if [ -z "$USER_ID" ]; then
    echo -e "${RED}  ❌ User not found: $username${NC}"
    USERS_FAILED=$((USERS_FAILED + 1))
    return 1
  fi
  
  # Build COI array JSON
  if [ -n "$coi" ]; then
    COI_JSON="[\"$(echo $coi | sed 's/,/","/g')\"]"
  else
    COI_JSON="[]"
  fi
  
  if [ "$DRY_RUN" == "true" ]; then
    echo -e "${YELLOW}  ℹ️  Would update: $username (ID: ${USER_ID:0:8}...) with clearance=$clearance${NC}"
    return 0
  fi
  
  # Get current user object
  USER_DATA=$(docker exec dive-v3-keycloak curl -s -X GET \
    "http://localhost:8080/admin/realms/$realm/users/$USER_ID" \
    -H "Authorization: Bearer $TOKEN")
  
  # Update user with attributes (merge with existing user data)
  UPDATED_DATA=$(echo "$USER_DATA" | jq \
    --arg clearance "$clearance" \
    --arg clearance_orig "$clearance_original" \
    --arg country "$country" \
    --arg uid "$unique_id" \
    --argjson coi "$COI_JSON" \
    '. + {
      "attributes": {
        "uniqueID": [$uid],
        "clearance": [$clearance],
        "clearanceOriginal": [$clearance_orig],
        "countryOfAffiliation": [$country],
        "acpCOI": $coi
      }
    }')
  
  # Apply update
  RESULT=$(docker exec dive-v3-keycloak curl -s -w "\n%{http_code}" -X PUT \
    "http://localhost:8080/admin/realms/$realm/users/$USER_ID" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$UPDATED_DATA")
  
  HTTP_CODE=$(echo "$RESULT" | tail -n 1)
  
  if [ "$HTTP_CODE" == "204" ] || [ "$HTTP_CODE" == "200" ]; then
    echo -e "${GREEN}  ✅ Updated: $username${NC}"
    USERS_UPDATED=$((USERS_UPDATED + 1))
  else
    echo -e "${RED}  ❌ Failed: $username (HTTP $HTTP_CODE)${NC}"
    echo "$RESULT" | head -n -1
    USERS_FAILED=$((USERS_FAILED + 1))
  fi
}

# ============================================
# USA Realm (dive-v3-usa) - 4 Users
# ============================================
echo -e "${BLUE}🇺🇸 United States Realm${NC}"
update_user_attributes "dive-v3-usa" "bob.contractor" "UNCLASSIFIED" "UNCLASSIFIED" "USA" "" "550e8400-e29b-41d4-a716-446655440001"
update_user_attributes "dive-v3-usa" "jane.smith" "CONFIDENTIAL" "CONFIDENTIAL" "USA" "NATO-COSMIC" "550e8400-e29b-41d4-a716-446655440003"
update_user_attributes "dive-v3-usa" "john.doe" "SECRET" "SECRET" "USA" "FVEY" "550e8400-e29b-41d4-a716-446655440002"
update_user_attributes "dive-v3-usa" "alice.general" "TOP_SECRET" "TOP_SECRET" "USA" "NATO-COSMIC,FVEY,CAN-US" "550e8400-e29b-41d4-a716-446655440004"
echo ""

# ============================================
# Spain Realm (dive-v3-esp) - 4 Users
# ============================================
echo -e "${BLUE}🇪🇸 Spain Realm${NC}"
update_user_attributes "dive-v3-esp" "juan.contractor" "NO CLASIFICADO" "NO CLASIFICADO" "ESP" "" "550e8400-e29b-41d4-a716-446655440011"
update_user_attributes "dive-v3-esp" "maria.lopez" "CONFIDENCIAL" "CONFIDENCIAL" "ESP" "NATO-COSMIC" "550e8400-e29b-41d4-a716-446655440012"
update_user_attributes "dive-v3-esp" "carlos.garcia" "SECRETO" "SECRETO" "ESP" "NATO-COSMIC" "550e8400-e29b-41d4-a716-446655440013"
update_user_attributes "dive-v3-esp" "isabel.general" "ALTO SECRETO" "ALTO SECRETO" "ESP" "NATO-COSMIC,FVEY" "550e8400-e29b-41d4-a716-446655440014"
echo ""

# ============================================
# France Realm (dive-v3-fra) - 4 Users
# ============================================
echo -e "${BLUE}🇫🇷 France Realm${NC}"
update_user_attributes "dive-v3-fra" "pierre.contractor" "NON PROTÉGÉ" "NON PROTÉGÉ" "FRA" "" "550e8400-e29b-41d4-a716-446655440021"
update_user_attributes "dive-v3-fra" "marie.dupont" "CONFIDENTIEL DÉFENSE" "CONFIDENTIEL DÉFENSE" "FRA" "NATO-COSMIC" "550e8400-e29b-41d4-a716-446655440022"
update_user_attributes "dive-v3-fra" "jacques.martin" "SECRET DÉFENSE" "SECRET DÉFENSE" "FRA" "NATO-COSMIC,FVEY" "550e8400-e29b-41d4-a716-446655440023"
update_user_attributes "dive-v3-fra" "sophie.general" "TRÈS SECRET DÉFENSE" "TRÈS SECRET DÉFENSE" "FRA" "NATO-COSMIC,FVEY" "550e8400-e29b-41d4-a716-446655440024"
echo ""

# ============================================
# UK Realm (dive-v3-gbr) - 4 Users
# ============================================
echo -e "${BLUE}🇬🇧 United Kingdom Realm${NC}"
update_user_attributes "dive-v3-gbr" "james.contractor" "OFFICIAL" "OFFICIAL" "GBR" "" "550e8400-e29b-41d4-a716-446655440031"
update_user_attributes "dive-v3-gbr" "emma.wilson" "CONFIDENTIAL" "CONFIDENTIAL" "GBR" "FVEY" "550e8400-e29b-41d4-a716-446655440032"
update_user_attributes "dive-v3-gbr" "oliver.brown" "SECRET" "SECRET" "GBR" "NATO-COSMIC,FVEY" "550e8400-e29b-41d4-a716-446655440033"
update_user_attributes "dive-v3-gbr" "charlotte.general" "TOP SECRET" "TOP SECRET" "GBR" "NATO-COSMIC,FVEY,CAN-US" "550e8400-e29b-41d4-a716-446655440034"
echo ""

# ============================================
# Germany Realm (dive-v3-deu) - 4 Users
# ============================================
echo -e "${BLUE}🇩🇪 Germany Realm${NC}"
update_user_attributes "dive-v3-deu" "hans.contractor" "OFFEN" "OFFEN" "DEU" "" "550e8400-e29b-41d4-a716-446655440041"
update_user_attributes "dive-v3-deu" "anna.schmidt" "VS-VERTRAULICH" "VS-VERTRAULICH" "DEU" "NATO-COSMIC" "550e8400-e29b-41d4-a716-446655440042"
update_user_attributes "dive-v3-deu" "hans.mueller" "GEHEIM" "GEHEIM" "DEU" "NATO-COSMIC" "550e8400-e29b-41d4-a716-446655440043"
update_user_attributes "dive-v3-deu" "friedrich.general" "STRENG GEHEIM" "STRENG GEHEIM" "DEU" "NATO-COSMIC,FVEY" "550e8400-e29b-41d4-a716-446655440044"
echo ""

# ============================================
# Italy Realm (dive-v3-ita) - 4 Users
# ============================================
echo -e "${BLUE}🇮🇹 Italy Realm${NC}"
update_user_attributes "dive-v3-ita" "giuseppe.contractor" "NON CLASSIFICATO" "NON CLASSIFICATO" "ITA" "" "550e8400-e29b-41d4-a716-446655440051"
update_user_attributes "dive-v3-ita" "giulia.bianchi" "RISERVATO" "RISERVATO" "ITA" "NATO-COSMIC" "550e8400-e29b-41d4-a716-446655440052"
update_user_attributes "dive-v3-ita" "marco.rossi" "SEGRETO" "SEGRETO" "ITA" "NATO-COSMIC" "550e8400-e29b-41d4-a716-446655440053"
update_user_attributes "dive-v3-ita" "francesca.general" "SEGRETISSIMO" "SEGRETISSIMO" "ITA" "NATO-COSMIC,FVEY" "550e8400-e29b-41d4-a716-446655440054"
echo ""

# ============================================
# Netherlands Realm (dive-v3-nld) - 4 Users
# ============================================
echo -e "${BLUE}🇳🇱 Netherlands Realm${NC}"
update_user_attributes "dive-v3-nld" "jan.contractor" "NIET GERUBRICEERD" "NIET GERUBRICEERD" "NLD" "" "550e8400-e29b-41d4-a716-446655440061"
update_user_attributes "dive-v3-nld" "lisa.devries" "VERTROUWELIJK" "VERTROUWELIJK" "NLD" "NATO-COSMIC" "550e8400-e29b-41d4-a716-446655440062"
update_user_attributes "dive-v3-nld" "pieter.jansen" "GEHEIM" "GEHEIM" "NLD" "NATO-COSMIC" "550e8400-e29b-41d4-a716-446655440063"
update_user_attributes "dive-v3-nld" "emma.general" "ZEER GEHEIM" "ZEER GEHEIM" "NLD" "NATO-COSMIC,FVEY" "550e8400-e29b-41d4-a716-446655440064"
echo ""

# ============================================
# Poland Realm (dive-v3-pol) - 4 Users
# ============================================
echo -e "${BLUE}🇵🇱 Poland Realm${NC}"
update_user_attributes "dive-v3-pol" "jan.contractor" "JAWNY" "JAWNY" "POL" "" "550e8400-e29b-41d4-a716-446655440071"
update_user_attributes "dive-v3-pol" "anna.nowak" "POUFNE" "POUFNE" "POL" "NATO-COSMIC" "550e8400-e29b-41d4-a716-446655440072"
update_user_attributes "dive-v3-pol" "jan.kowalski" "TAJNE" "TAJNE" "POL" "NATO-COSMIC" "550e8400-e29b-41d4-a716-446655440073"
update_user_attributes "dive-v3-pol" "katarzyna.general" "ŚCIŚLE TAJNE" "ŚCIŚLE TAJNE" "POL" "NATO-COSMIC,FVEY" "550e8400-e29b-41d4-a716-446655440074"
echo ""

# ============================================
# Canada Realm (dive-v3-can) - 4 Users
# ============================================
echo -e "${BLUE}🇨🇦 Canada Realm${NC}"
update_user_attributes "dive-v3-can" "robert.contractor" "UNCLASSIFIED" "UNCLASSIFIED" "CAN" "" "550e8400-e29b-41d4-a716-446655440081"
update_user_attributes "dive-v3-can" "sarah.tremblay" "PROTECTED B" "PROTECTED B" "CAN" "FVEY,CAN-US" "550e8400-e29b-41d4-a716-446655440082"
update_user_attributes "dive-v3-can" "michael.roy" "SECRET" "SECRET" "CAN" "NATO-COSMIC,FVEY,CAN-US" "550e8400-e29b-41d4-a716-446655440083"
update_user_attributes "dive-v3-can" "jennifer.general" "TOP SECRET" "TOP SECRET" "CAN" "NATO-COSMIC,FVEY,CAN-US" "550e8400-e29b-41d4-a716-446655440084"
echo ""

# ============================================
# Industry Realm (dive-v3-industry) - 4 Users
# ============================================
echo -e "${BLUE}🏢 Industry Realm${NC}"
update_user_attributes "dive-v3-industry" "bob.contractor" "PUBLIC" "PUBLIC" "INDUSTRY" "" "550e8400-e29b-41d4-a716-446655440091"
update_user_attributes "dive-v3-industry" "alice.engineer" "PROPRIETARY" "PROPRIETARY" "INDUSTRY" "" "550e8400-e29b-41d4-a716-446655440092"
update_user_attributes "dive-v3-industry" "charlie.analyst" "TRADE SECRET" "TRADE SECRET" "INDUSTRY" "" "550e8400-e29b-41d4-a716-446655440093"
update_user_attributes "dive-v3-industry" "diana.executive" "HIGHLY SENSITIVE" "HIGHLY SENSITIVE" "INDUSTRY" "" "550e8400-e29b-41d4-a716-446655440094"
echo ""

# ============================================
# Summary
# ============================================
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}Summary${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

echo "Total Users Processed: $TOTAL_USERS"
echo "Users Updated: $USERS_UPDATED"
echo "Users Failed: $USERS_FAILED"
echo ""

if [ $USERS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ ALL USERS UPDATED SUCCESSFULLY${NC}"
  echo -e "${GREEN}✅ Clearance attributes now populated for all realms${NC}"
  echo ""
  echo -e "${GREEN}Next Step: Test login as alice.general - should show TOP_SECRET${NC}"
  exit 0
else
  echo -e "${YELLOW}⚠️  SOME UPDATES FAILED${NC}"
  echo -e "${YELLOW}⚠️  Check errors above and retry${NC}"
  exit 1
fi

