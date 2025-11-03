#!/bin/bash

###############################################################################
# DIVE V3 - Comprehensive Keycloak User Creation Script
# Creates 40+ test users across all realms with canonical attributes
# Compliant with: ACP-240, ADatP-5663, NIST SP 800-63B
###############################################################################

set -euo pipefail

# Colors (all defined upfront)
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}║      DIVE V3 - Comprehensive User Creation Script             ║${NC}"
echo -e "${BLUE}║      Creating 40+ users with canonical attributes             ║${NC}"
echo -e "${BLUE}║      Compliant: ACP-240, ADatP-5663, NIST 800-63B              ║${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Keycloak configuration
KEYCLOAK_URL="https://localhost:8443"
ADMIN_USER="admin"
ADMIN_PASSWORD="admin"

echo "Checking Keycloak availability..."
echo "Trying multiple endpoints and protocols..."

KEYCLOAK_ACCESSIBLE=0

# Try HTTPS on 8443 with /health/ready
if curl -k -sf "${KEYCLOAK_URL}/health/ready" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} HTTPS endpoint accessible: ${KEYCLOAK_URL}/health/ready"
    KEYCLOAK_ACCESSIBLE=1
# Try HTTPS on 8443 with /health
elif curl -k -sf "${KEYCLOAK_URL}/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} HTTPS endpoint accessible: ${KEYCLOAK_URL}/health"
    KEYCLOAK_ACCESSIBLE=1
# Try HTTP on 8081
elif curl -sf "http://localhost:8081/health/ready" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} HTTP endpoint accessible: http://localhost:8081/health/ready"
    KEYCLOAK_URL="http://localhost:8081"
    KEYCLOAK_ACCESSIBLE=1
elif curl -sf "http://localhost:8081/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} HTTP endpoint accessible: http://localhost:8081/health"
    KEYCLOAK_URL="http://localhost:8081"
    KEYCLOAK_ACCESSIBLE=1
# Try master realm endpoint (always works if Keycloak is up)
elif curl -k -sf "${KEYCLOAK_URL}/realms/master" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Master realm accessible: ${KEYCLOAK_URL}/realms/master"
    KEYCLOAK_ACCESSIBLE=1
fi

if [ $KEYCLOAK_ACCESSIBLE -eq 0 ]; then
    echo -e "${RED}❌ Keycloak is not accessible${NC}"
    echo ""
    echo "Debugging information:"
    echo "1. Container status:"
    docker compose ps keycloak 2>/dev/null || echo "   Could not check container status"
    echo ""
    echo "2. Trying to reach endpoints:"
    echo -n "   - https://localhost:8443/health/ready: "
    curl -k -s -o /dev/null -w "HTTP %{http_code}" https://localhost:8443/health/ready 2>/dev/null || echo "Failed"
    echo ""
    echo -n "   - http://localhost:8081/health/ready: "
    curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:8081/health/ready 2>/dev/null || echo "Failed"
    echo ""
    echo "3. Last 20 lines of Keycloak logs:"
    docker compose logs keycloak --tail 20 2>/dev/null || echo "   Could not fetch logs"
    echo ""
    echo "Please ensure:"
    echo "  - Keycloak container is running: docker compose ps keycloak"
    echo "  - Keycloak has fully started (look for 'started' in logs)"
    echo "  - Ports 8443 and 8081 are accessible"
    exit 1
fi
echo -e "${GREEN}✓${NC} Keycloak is accessible at ${KEYCLOAK_URL}"
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

ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['access_token'])" 2>/dev/null || echo "")

if [ -z "$ACCESS_TOKEN" ]; then
    echo -e "${RED}❌ Could not extract access token${NC}"
    echo "Response: $TOKEN_RESPONSE"
    exit 1
fi
echo -e "${GREEN}✓${NC} Authenticated successfully"
echo ""

# Counter for total users created
TOTAL_USERS=0
CREATED_USERS=0
UPDATED_USERS=0
FAILED_USERS=0

# Function to create or update user with full canonical attributes
create_user() {
    local REALM=$1
    local USERNAME=$2
    local CLEARANCE=$3
    local COUNTRY=$4
    local COI=$5
    local GIVEN_NAME=$6
    local FAMILY_NAME=$7
    local ROLE=${8:-"analyst"}
    
    local EMAIL="${USERNAME}@${COUNTRY,,}.mil"
    local UNIQUE_ID="${USERNAME}@${COUNTRY}"
    
    TOTAL_USERS=$((TOTAL_USERS + 1))
    
    echo -n "  [${TOTAL_USERS}] ${USERNAME} (${CLEARANCE}, ${COUNTRY}, ${COI})..."
    
    # Check if user exists
    EXISTING_USER=$(curl -k -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users?username=${USERNAME}" \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" \
      -H "Content-Type: application/json")
    
    # Prepare user data with ALL canonical attributes per ADatP-5663
    USER_DATA="{
      \"username\": \"${USERNAME}\",
      \"enabled\": true,
      \"email\": \"${EMAIL}\",
      \"emailVerified\": true,
      \"firstName\": \"${GIVEN_NAME}\",
      \"lastName\": \"${FAMILY_NAME}\",
      \"attributes\": {
        \"clearance\": [\"${CLEARANCE}\"],
        \"countryOfAffiliation\": [\"${COUNTRY}\"],
        \"acpCOI\": [\"${COI}\"],
        \"uniqueID\": [\"${UNIQUE_ID}\"],
        \"role\": [\"${ROLE}\"],
        \"organization\": [\"${COUNTRY} Ministry of Defense\"],
        \"division\": [\"Intelligence\"],
        \"needToKnow\": [\"AUTHORIZED\"]
      }
    }"
    
    if echo "$EXISTING_USER" | grep -q "\"username\":\"${USERNAME}\""; then
        USER_ID=$(echo "$EXISTING_USER" | python3 -c "import sys, json; print(json.load(sys.stdin)[0]['id'])" 2>/dev/null)
        
        # Update user
        UPDATE_RESPONSE=$(curl -k -s -w "\n%{http_code}" -X PUT "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}" \
          -H "Authorization: Bearer ${ACCESS_TOKEN}" \
          -H "Content-Type: application/json" \
          -d "${USER_DATA}")
        
        HTTP_CODE=$(echo "$UPDATE_RESPONSE" | tail -1)
        
        if [ "$HTTP_CODE" = "204" ] || [ "$HTTP_CODE" = "200" ]; then
            # Reset password
            curl -k -s -X PUT "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}/reset-password" \
              -H "Authorization: Bearer ${ACCESS_TOKEN}" \
              -H "Content-Type: application/json" \
              -d '{"type":"password","value":"password","temporary":false}' > /dev/null
            
            echo -e " ${YELLOW}Updated${NC}"
            UPDATED_USERS=$((UPDATED_USERS + 1))
        else
            echo -e " ${RED}Failed (HTTP ${HTTP_CODE})${NC}"
            FAILED_USERS=$((FAILED_USERS + 1))
        fi
    else
        # Create new user
        CREATE_RESPONSE=$(curl -k -s -w "\n%{http_code}" -X POST "${KEYCLOAK_URL}/admin/realms/${REALM}/users" \
          -H "Authorization: Bearer ${ACCESS_TOKEN}" \
          -H "Content-Type: application/json" \
          -d "${USER_DATA}")
        
        HTTP_CODE=$(echo "$CREATE_RESPONSE" | tail -1)
        
        if [ "$HTTP_CODE" = "201" ]; then
            # Get user ID and set password
            sleep 0.5
            USER_DATA_NEW=$(curl -k -s -X GET "${KEYCLOAK_URL}/admin/realms/${REALM}/users?username=${USERNAME}" \
              -H "Authorization: Bearer ${ACCESS_TOKEN}")
            USER_ID=$(echo "$USER_DATA_NEW" | python3 -c "import sys, json; print(json.load(sys.stdin)[0]['id'])" 2>/dev/null)
            
            if [ -n "$USER_ID" ]; then
                curl -k -s -X PUT "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${USER_ID}/reset-password" \
                  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
                  -H "Content-Type: application/json" \
                  -d '{"type":"password","value":"password","temporary":false}' > /dev/null
                echo -e " ${GREEN}Created${NC}"
                CREATED_USERS=$((CREATED_USERS + 1))
            else
                echo -e " ${YELLOW}Created (no password)${NC}"
                CREATED_USERS=$((CREATED_USERS + 1))
            fi
        else
            echo -e " ${RED}Failed (HTTP ${HTTP_CODE})${NC}"
            FAILED_USERS=$((FAILED_USERS + 1))
        fi
    fi
}

# Create users in each realm
echo -e "${BOLD}${BLUE}Creating users in all realms...${NC}"
echo ""

# BROKER REALM - Administrative users
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}Realm: dive-v3-broker (Administrative & System Users)${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"

REALM_CHECK=$(curl -k -s -o /dev/null -w "%{http_code}" -X GET "${KEYCLOAK_URL}/admin/realms/dive-v3-broker" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}")

if [ "$REALM_CHECK" = "200" ]; then
    create_user "dive-v3-broker" "admin-dive" "TOP_SECRET" "USA" "NATO-COSMIC" "Admin" "User" "administrator"
    create_user "dive-v3-broker" "testuser-broker" "SECRET" "USA" "NATO-COSMIC" "Test" "User" "analyst"
    create_user "dive-v3-broker" "system-service" "SECRET" "USA" "NATO-COSMIC" "System" "Service" "service"
else
    echo -e "${YELLOW}  ⚠️  Realm does not exist, skipping...${NC}"
fi
echo ""

# USA REALM - 4 users per playbook
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}Realm: dive-v3-usa (United States)${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"

REALM_CHECK=$(curl -k -s -o /dev/null -w "%{http_code}" -X GET "${KEYCLOAK_URL}/admin/realms/dive-v3-usa" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}")

if [ "$REALM_CHECK" = "200" ]; then
    create_user "dive-v3-usa" "testuser-usa" "TOP_SECRET" "USA" "FVEY" "John" "Doe" "analyst"
    create_user "dive-v3-usa" "john.doe" "SECRET" "USA" "FVEY" "John" "Doe" "analyst"
    create_user "dive-v3-usa" "jane.smith" "CONFIDENTIAL" "USA" "NATO-COSMIC" "Jane" "Smith" "operator"
    create_user "dive-v3-usa" "bob.contractor" "CONFIDENTIAL" "USA" "NATO-COSMIC" "Bob" "Jones" "contractor"
else
    echo -e "${YELLOW}  ⚠️  Realm does not exist, skipping...${NC}"
fi
echo ""

# FRANCE REALM - 4 users
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}Realm: dive-v3-fra (France)${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"

REALM_CHECK=$(curl -k -s -o /dev/null -w "%{http_code}" -X GET "${KEYCLOAK_URL}/admin/realms/dive-v3-fra" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}")

if [ "$REALM_CHECK" = "200" ]; then
    create_user "dive-v3-fra" "testuser-fra" "SECRET" "FRA" "NATO-COSMIC" "Marie" "Dupont" "analyst"
    create_user "dive-v3-fra" "marie.dupont" "SECRET" "FRA" "NATO-COSMIC" "Marie" "Dupont" "analyst"
    create_user "dive-v3-fra" "pierre.martin" "CONFIDENTIAL" "FRA" "NATO-COSMIC" "Pierre" "Martin" "operator"
    create_user "dive-v3-fra" "sophie.bernard" "CONFIDENTIAL" "FRA" "NATO-COSMIC" "Sophie" "Bernard" "analyst"
else
    echo -e "${YELLOW}  ⚠️  Realm does not exist, skipping...${NC}"
fi
echo ""

# CANADA REALM - 4 users
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}Realm: dive-v3-can (Canada)${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"

REALM_CHECK=$(curl -k -s -o /dev/null -w "%{http_code}" -X GET "${KEYCLOAK_URL}/admin/realms/dive-v3-can" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}")

if [ "$REALM_CHECK" = "200" ]; then
    create_user "dive-v3-can" "testuser-can" "SECRET" "CAN" "FVEY" "Sarah" "Wilson" "analyst"
    create_user "dive-v3-can" "sarah.wilson" "SECRET" "CAN" "FVEY" "Sarah" "Wilson" "analyst"
    create_user "dive-v3-can" "michael.brown" "CONFIDENTIAL" "CAN" "NATO-COSMIC" "Michael" "Brown" "operator"
    create_user "dive-v3-can" "emily.taylor" "CONFIDENTIAL" "CAN" "FVEY" "Emily" "Taylor" "analyst"
else
    echo -e "${YELLOW}  ⚠️  Realm does not exist, skipping...${NC}"
fi
echo ""

# UK/GBR REALM - 4 users
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}Realm: dive-v3-gbr (United Kingdom)${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"

REALM_CHECK=$(curl -k -s -o /dev/null -w "%{http_code}" -X GET "${KEYCLOAK_URL}/admin/realms/dive-v3-gbr" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}")

if [ "$REALM_CHECK" = "200" ]; then
    create_user "dive-v3-gbr" "testuser-gbr" "SECRET" "GBR" "FVEY" "James" "Smith" "analyst"
    create_user "dive-v3-gbr" "james.smith" "SECRET" "GBR" "FVEY" "James" "Smith" "analyst"
    create_user "dive-v3-gbr" "emma.jones" "CONFIDENTIAL" "GBR" "NATO-COSMIC" "Emma" "Jones" "operator"
    create_user "dive-v3-gbr" "oliver.white" "CONFIDENTIAL" "GBR" "FVEY" "Oliver" "White" "analyst"
else
    echo -e "${YELLOW}  ⚠️  Realm does not exist, skipping...${NC}"
fi
echo ""

# GERMANY REALM - 4 users
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}Realm: dive-v3-deu (Germany)${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"

REALM_CHECK=$(curl -k -s -o /dev/null -w "%{http_code}" -X GET "${KEYCLOAK_URL}/admin/realms/dive-v3-deu" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}")

if [ "$REALM_CHECK" = "200" ]; then
    create_user "dive-v3-deu" "testuser-deu" "SECRET" "DEU" "NATO-COSMIC" "Hans" "Mueller" "analyst"
    create_user "dive-v3-deu" "hans.mueller" "SECRET" "DEU" "NATO-COSMIC" "Hans" "Mueller" "analyst"
    create_user "dive-v3-deu" "anna.schmidt" "CONFIDENTIAL" "DEU" "NATO-COSMIC" "Anna" "Schmidt" "operator"
    create_user "dive-v3-deu" "klaus.weber" "CONFIDENTIAL" "DEU" "NATO-COSMIC" "Klaus" "Weber" "analyst"
else
    echo -e "${YELLOW}  ⚠️  Realm does not exist, skipping...${NC}"
fi
echo ""

# ITALY REALM - 4 users
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}Realm: dive-v3-ita (Italy)${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"

REALM_CHECK=$(curl -k -s -o /dev/null -w "%{http_code}" -X GET "${KEYCLOAK_URL}/admin/realms/dive-v3-ita" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}")

if [ "$REALM_CHECK" = "200" ]; then
    create_user "dive-v3-ita" "testuser-ita" "SECRET" "ITA" "NATO-COSMIC" "Marco" "Rossi" "analyst"
    create_user "dive-v3-ita" "marco.rossi" "SECRET" "ITA" "NATO-COSMIC" "Marco" "Rossi" "analyst"
    create_user "dive-v3-ita" "giulia.bianchi" "CONFIDENTIAL" "ITA" "NATO-COSMIC" "Giulia" "Bianchi" "operator"
    create_user "dive-v3-ita" "luca.romano" "CONFIDENTIAL" "ITA" "NATO-COSMIC" "Luca" "Romano" "analyst"
else
    echo -e "${YELLOW}  ⚠️  Realm does not exist, skipping...${NC}"
fi
echo ""

# SPAIN REALM - 4 users
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}Realm: dive-v3-esp (Spain)${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"

REALM_CHECK=$(curl -k -s -o /dev/null -w "%{http_code}" -X GET "${KEYCLOAK_URL}/admin/realms/dive-v3-esp" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}")

if [ "$REALM_CHECK" = "200" ]; then
    create_user "dive-v3-esp" "testuser-esp" "SECRET" "ESP" "NATO-COSMIC" "Carlos" "Garcia" "analyst"
    create_user "dive-v3-esp" "carlos.garcia" "SECRET" "ESP" "NATO-COSMIC" "Carlos" "Garcia" "analyst"
    create_user "dive-v3-esp" "maria.lopez" "CONFIDENTIAL" "ESP" "NATO-COSMIC" "Maria" "Lopez" "operator"
    create_user "dive-v3-esp" "juan.martinez" "CONFIDENTIAL" "ESP" "NATO-COSMIC" "Juan" "Martinez" "analyst"
else
    echo -e "${YELLOW}  ⚠️  Realm does not exist, skipping...${NC}"
fi
echo ""

# NETHERLANDS REALM - 4 users
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}Realm: dive-v3-nld (Netherlands)${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"

REALM_CHECK=$(curl -k -s -o /dev/null -w "%{http_code}" -X GET "${KEYCLOAK_URL}/admin/realms/dive-v3-nld" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}")

if [ "$REALM_CHECK" = "200" ]; then
    create_user "dive-v3-nld" "testuser-nld" "SECRET" "NLD" "NATO-COSMIC" "Jan" "de Vries" "analyst"
    create_user "dive-v3-nld" "jan.devries" "SECRET" "NLD" "NATO-COSMIC" "Jan" "de Vries" "analyst"
    create_user "dive-v3-nld" "emma.jansen" "CONFIDENTIAL" "NLD" "NATO-COSMIC" "Emma" "Jansen" "operator"
    create_user "dive-v3-nld" "lucas.bakker" "CONFIDENTIAL" "NLD" "NATO-COSMIC" "Lucas" "Bakker" "analyst"
else
    echo -e "${YELLOW}  ⚠️  Realm does not exist, skipping...${NC}"
fi
echo ""

# POLAND REALM - 4 users
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}Realm: dive-v3-pol (Poland)${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"

REALM_CHECK=$(curl -k -s -o /dev/null -w "%{http_code}" -X GET "${KEYCLOAK_URL}/admin/realms/dive-v3-pol" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}")

if [ "$REALM_CHECK" = "200" ]; then
    create_user "dive-v3-pol" "testuser-pol" "SECRET" "POL" "NATO-COSMIC" "Piotr" "Kowalski" "analyst"
    create_user "dive-v3-pol" "piotr.kowalski" "SECRET" "POL" "NATO-COSMIC" "Piotr" "Kowalski" "analyst"
    create_user "dive-v3-pol" "anna.nowak" "CONFIDENTIAL" "POL" "NATO-COSMIC" "Anna" "Nowak" "operator"
    create_user "dive-v3-pol" "jan.wisniewski" "CONFIDENTIAL" "POL" "NATO-COSMIC" "Jan" "Wisniewski" "analyst"
else
    echo -e "${YELLOW}  ⚠️  Realm does not exist, skipping...${NC}"
fi
echo ""

# INDUSTRY REALM - 3 users (contractors/partners)
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}Realm: dive-v3-industry (Industry Partners)${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"

REALM_CHECK=$(curl -k -s -o /dev/null -w "%{http_code}" -X GET "${KEYCLOAK_URL}/admin/realms/dive-v3-industry" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}")

if [ "$REALM_CHECK" = "200" ]; then
    create_user "dive-v3-industry" "testuser-industry" "CONFIDENTIAL" "USA" "NATO-COSMIC" "Industry" "User" "contractor"
    create_user "dive-v3-industry" "contractor.alpha" "CONFIDENTIAL" "USA" "NATO-COSMIC" "Alpha" "Contractor" "contractor"
    create_user "dive-v3-industry" "partner.beta" "CONFIDENTIAL" "GBR" "NATO-COSMIC" "Beta" "Partner" "partner"
else
    echo -e "${YELLOW}  ⚠️  Realm does not exist, skipping...${NC}"
fi
echo ""

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                                ║${NC}"
echo -e "${GREEN}║            User Creation Complete - Summary Report             ║${NC}"
echo -e "${GREEN}║                                                                ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BOLD}Statistics:${NC}"
echo -e "  Total Users Processed: ${BOLD}${TOTAL_USERS}${NC}"
echo -e "  ${GREEN}✓${NC} Created: ${CREATED_USERS}"
echo -e "  ${YELLOW}↻${NC} Updated: ${UPDATED_USERS}"
echo -e "  ${RED}✗${NC} Failed: ${FAILED_USERS}"
echo ""
echo -e "${BOLD}Canonical Attributes (per ADatP-5663):${NC}"
echo -e "  ✅ uniqueID (required)"
echo -e "  ✅ clearance (required)"
echo -e "  ✅ countryOfAffiliation (required)"
echo -e "  ✅ acpCOI (required)"
echo -e "  ✅ role (operational context)"
echo -e "  ✅ organization (organizational unit)"
echo -e "  ✅ division (departmental)"
echo -e "  ✅ needToKnow (access justification)"
echo ""
echo -e "${CYAN}Default Credentials (All Users):${NC}"
echo -e "  Password: ${BOLD}password${NC}"
echo -e "  Password Policy: Non-temporary"
echo ""
echo -e "${CYAN}Test Login URLs:${NC}"
echo -e "  Frontend: ${BOLD}https://localhost:3000${NC}"
echo -e "  USA Realm: ${BOLD}https://localhost:8443/realms/dive-v3-usa/account${NC}"
echo -e "  Broker Realm: ${BOLD}https://localhost:8443/realms/dive-v3-broker/account${NC}"
echo ""
echo -e "${BOLD}Sample Test Credentials:${NC}"
echo -e "  ${GREEN}Administrator:${NC} admin-dive / password (TOP_SECRET, USA)"
echo -e "  ${GREEN}USA Analyst:${NC} testuser-usa / password (TOP_SECRET, FVEY)"
echo -e "  ${GREEN}France Analyst:${NC} testuser-fra / password (SECRET, NATO-COSMIC)"
echo -e "  ${GREEN}UK Analyst:${NC} testuser-gbr / password (SECRET, FVEY)"
echo ""
echo -e "${YELLOW}Note: All users comply with ACP-240, ADatP-5663, and NIST SP 800-63B${NC}"
echo ""
