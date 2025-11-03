#!/bin/bash

###############################################################################
# DIVE V3 - Keycloak User Creation Script
# Creates test users in all realms for testing authentication
###############################################################################

set -euo pipefail

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}║           DIVE V3 - Keycloak User Creation Script             ║${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Keycloak configuration
KEYCLOAK_URL="https://localhost:8443"
ADMIN_USER="admin"
ADMIN_PASSWORD="admin"

echo "Checking Keycloak availability..."
if ! curl -k -sf "${KEYCLOAK_URL}/health/ready" > /dev/null 2>&1; then
    echo -e "${RED}❌ Keycloak is not accessible at ${KEYCLOAK_URL}${NC}"
    echo "Please ensure Keycloak is running: docker compose ps keycloak"
    exit 1
fi
echo -e "${GREEN}✓${NC} Keycloak is accessible"
echo ""

# Get admin token
echo "Authenticating with Keycloak..."
TOKEN_RESPONSE=$(curl -k -s -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=${ADMIN_USER}" \
  -d "password=${ADMIN_PASSWORD}" \
  -d "grant_type=password" \
  -d "client_id=admin-cli")

if [ $? -ne 0 ] || [ -z "$TOKEN_RESPONSE" ]; then
    echo -e "${RED}❌ Failed to authenticate with Keycloak${NC}"
    echo "Response: $TOKEN_RESPONSE"
    exit 1
fi

ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

if [ -z "$ACCESS_TOKEN" ]; then
    echo -e "${RED}❌ Could not extract access token${NC}"
    echo "Response: $TOKEN_RESPONSE"
    exit 1
fi
echo -e "${GREEN}✓${NC} Authenticated successfully"
echo ""

# Define realms and their test users
declare -A REALMS=(
    ["dive-v3-broker"]="testuser-broker"
    ["dive-v3-usa"]="testuser-usa john.doe jane.smith bob.contractor"
    ["dive-v3-fra"]="testuser-fra marie.dupont pierre.martin"
    ["dive-v3-can"]="testuser-can sarah.wilson michael.brown"
    ["dive-v3-gbr"]="testuser-gbr james.smith emma.jones"
)

# User attributes by country
declare -A CLEARANCES=(
    ["testuser-broker"]="SECRET"
    ["testuser-usa"]="TOP_SECRET"
    ["john.doe"]="SECRET"
    ["jane.smith"]="CONFIDENTIAL"
    ["bob.contractor"]="CONFIDENTIAL"
    ["testuser-fra"]="SECRET"
    ["marie.dupont"]="SECRET"
    ["pierre.martin"]="CONFIDENTIAL"
    ["testuser-can"]="SECRET"
    ["sarah.wilson"]="SECRET"
    ["michael.brown"]="CONFIDENTIAL"
    ["testuser-gbr"]="SECRET"
    ["james.smith"]="SECRET"
    ["emma.jones"]="CONFIDENTIAL"
)

declare -A COUNTRIES=(
    ["testuser-broker"]="USA"
    ["testuser-usa"]="USA"
    ["john.doe"]="USA"
    ["jane.smith"]="USA"
    ["bob.contractor"]="USA"
    ["testuser-fra"]="FRA"
    ["marie.dupont"]="FRA"
    ["pierre.martin"]="FRA"
    ["testuser-can"]="CAN"
    ["sarah.wilson"]="CAN"
    ["michael.brown"]="CAN"
    ["testuser-gbr"]="GBR"
    ["james.smith"]="GBR"
    ["emma.jones"]="GBR"
)

# Function to create or update user
create_user() {
    local REALM=$1
    local USERNAME=$2
    local CLEARANCE=${CLEARANCES[$USERNAME]}
    local COUNTRY=${COUNTRIES[$USERNAME]}
    local EMAIL="${USERNAME}@${COUNTRY,,}.mil"
    local FIRSTNAME=$(echo $USERNAME | cut -d. -f1 | sed 's/.*/\u&/')
    local LASTNAME=$(echo $USERNAME | cut -d. -f2 | sed 's/.*/\u&/' 2>/dev/null || echo "User")
    
    echo -n "  Creating user: ${USERNAME} (${CLEARANCE}, ${COUNTRY})..."
    
    # Check if user exists
    EXISTING_USER=$(curl -k -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users?username=${USERNAME}" \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" \
      -H "Content-Type: application/json")
    
    if echo "$EXISTING_USER" | grep -q "\"username\":\"${USERNAME}\""; then
        echo -e " ${YELLOW}Already exists, updating...${NC}"
        USER_ID=$(echo "$EXISTING_USER" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
        
        # Update user
        curl -k -s -X PUT "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}" \
          -H "Authorization: Bearer ${ACCESS_TOKEN}" \
          -H "Content-Type: application/json" \
          -d "{
            \"enabled\": true,
            \"email\": \"${EMAIL}\",
            \"firstName\": \"${FIRSTNAME}\",
            \"lastName\": \"${LASTNAME}\",
            \"attributes\": {
              \"clearance\": [\"${CLEARANCE}\"],
              \"countryOfAffiliation\": [\"${COUNTRY}\"],
              \"acpCOI\": [\"NATO-COSMIC\"],
              \"uniqueID\": [\"${USERNAME}@${COUNTRY}\"]
            }
          }" > /dev/null
        
        # Reset password
        curl -k -s -X PUT "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}/reset-password" \
          -H "Authorization: Bearer ${ACCESS_TOKEN}" \
          -H "Content-Type: application/json" \
          -d "{
            \"type\": \"password\",
            \"value\": \"password\",
            \"temporary\": false
          }" > /dev/null
        
        echo -e "    ${GREEN}✓${NC} Updated"
    else
        # Create new user
        CREATE_RESPONSE=$(curl -k -s -w "\n%{http_code}" -X POST "${KEYCLOAK_URL}/admin/realms/${REALM}/users" \
          -H "Authorization: Bearer ${ACCESS_TOKEN}" \
          -H "Content-Type: application/json" \
          -d "{
            \"username\": \"${USERNAME}\",
            \"enabled\": true,
            \"email\": \"${EMAIL}\",
            \"firstName\": \"${FIRSTNAME}\",
            \"lastName\": \"${LASTNAME}\",
            \"attributes\": {
              \"clearance\": [\"${CLEARANCE}\"],
              \"countryOfAffiliation\": [\"${COUNTRY}\"],
              \"acpCOI\": [\"NATO-COSMIC\"],
              \"uniqueID\": [\"${USERNAME}@${COUNTRY}\"]
            }
          }")
        
        HTTP_CODE=$(echo "$CREATE_RESPONSE" | tail -1)
        
        if [ "$HTTP_CODE" = "201" ]; then
            # Get user ID and set password
            sleep 1
            USER_DATA=$(curl -k -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users?username=${USERNAME}" \
              -H "Authorization: Bearer ${ACCESS_TOKEN}")
            USER_ID=$(echo "$USER_DATA" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
            
            if [ -n "$USER_ID" ]; then
                curl -k -s -X PUT "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}/reset-password" \
                  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
                  -H "Content-Type: application/json" \
                  -d "{
                    \"type\": \"password\",
                    \"value\": \"password\",
                    \"temporary\": false
                  }" > /dev/null
                echo -e " ${GREEN}✓${NC}"
            else
                echo -e " ${YELLOW}⚠️  Created but could not set password${NC}"
            fi
        else
            echo -e " ${RED}✗${NC} (HTTP ${HTTP_CODE})"
        fi
    fi
}

# Create users in each realm
for REALM in "${!REALMS[@]}"; do
    echo -e "${BLUE}Realm: ${REALM}${NC}"
    
    # Check if realm exists
    REALM_CHECK=$(curl -k -s -o /dev/null -w "%{http_code}" -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}" \
      -H "Authorization: Bearer ${ACCESS_TOKEN}")
    
    if [ "$REALM_CHECK" != "200" ]; then
        echo -e "${YELLOW}  ⚠️  Realm does not exist, skipping...${NC}"
        continue
    fi
    
    # Create users for this realm
    USERS="${REALMS[$REALM]}"
    for USERNAME in $USERS; do
        create_user "$REALM" "$USERNAME"
    done
    echo ""
done

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                                ║${NC}"
echo -e "${GREEN}║                    User Creation Complete!                     ║${NC}"
echo -e "${GREEN}║                                                                ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Test Credentials (all use password: 'password'):${NC}"
echo ""
echo "USA Realm:"
echo "  - testuser-usa / password (TOP_SECRET, USA)"
echo "  - john.doe / password (SECRET, USA)"
echo "  - jane.smith / password (CONFIDENTIAL, USA)"
echo ""
echo "France Realm:"
echo "  - testuser-fra / password (SECRET, FRA)"
echo "  - marie.dupont / password (SECRET, FRA)"
echo ""
echo "Canada Realm:"
echo "  - testuser-can / password (SECRET, CAN)"
echo "  - sarah.wilson / password (SECRET, CAN)"
echo ""
echo "UK Realm:"
echo "  - testuser-gbr / password (SECRET, GBR)"
echo ""
echo -e "${YELLOW}Now test login at: ${KEYCLOAK_URL}/realms/dive-v3-usa/account${NC}"
echo ""

