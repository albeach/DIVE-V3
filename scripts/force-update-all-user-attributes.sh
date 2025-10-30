#!/usr/bin/env bash
# Force update ALL user attributes via Keycloak Admin API
# Workaround for Terraform attribute update bug

set -e

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8081}"
ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:-admin}"

# Get admin token
TOKEN=$(curl -s -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -d "username=$ADMIN_USER" \
  -d "password=$ADMIN_PASS" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r '.access_token')

if [ "$TOKEN" == "null" ]; then
  echo "❌ Failed to get admin token"
  exit 1
fi

# Function to update user attributes
update_user() {
  local realm=$1
  local username=$2
  local clearance=$3
  local clearanceOriginal=$4
  local country=$5
  local coi=$6
  local dutyOrg=$7
  local orgUnit=$8
  local uniqueID=$9
  
  echo "Updating: $username in $realm → clearance=$clearance"
  
  # Get user ID
  USER_ID=$(curl -s "$KEYCLOAK_URL/admin/realms/$realm/users?username=$username&exact=true" \
    -H "Authorization: Bearer $TOKEN" | jq -r '.[0].id')
  
  if [ "$USER_ID" == "null" ]; then
    echo "  ❌ User not found: $username"
    return 1
  fi
  
  # Update attributes
  curl -s -X PUT "$KEYCLOAK_URL/admin/realms/$realm/users/$USER_ID" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"attributes\": {
        \"uniqueID\": [\"$uniqueID\"],
        \"clearance\": [\"$clearance\"],
        \"clearanceOriginal\": [\"$clearanceOriginal\"],
        \"countryOfAffiliation\": [\"$country\"],
        \"acpCOI\": [\"$coi\"],
        \"dutyOrg\": [\"$dutyOrg\"],
        \"orgUnit\": [\"$orgUnit\"]
      }
    }" > /dev/null
  
  echo "  ✅ Updated"
}

# Italy users
update_user "dive-v3-ita" "marco.rossi" "SEGRETO" "SEGRETO" "ITA" "[\"NATO-COSMIC\"]" "IT_DEFENSE" "CYBER_DEFENSE" "550e8400-e29b-41d4-a716-446655440303"
update_user "dive-v3-ita" "elena.generale" "SEGRETISSIMO" "SEGRETISSIMO" "ITA" "[\"NATO-COSMIC\"]" "IT_STRATEGIC_COMMAND" "JOINT_OPERATIONS" "550e8400-e29b-41d4-a716-446655440304"
update_user "dive-v3-ita" "francesca.ferrari" "RISERVATO" "RISERVATO" "ITA" "[\"NATO-COSMIC\"]" "IT_NAVY" "INTELLIGENCE" "550e8400-e29b-41d4-a716-446655440302"
update_user "dive-v3-ita" "giuseppe.contractor" "NON CLASSIFICATO" "NON CLASSIFICATO" "ITA" "[]" "IT_DEFENSE_LOGISTICS" "SUPPLY_CHAIN" "550e8400-e29b-41d4-a716-446655440301"

echo ""
echo "✅ All Italy users updated with Italian clearances"

