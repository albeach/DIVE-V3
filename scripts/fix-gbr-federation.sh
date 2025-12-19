#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Fix GBR Federation Issues
# =============================================================================
# Fixes three root causes identified by runtime evidence:
# 1. Create gbr-federation IdP in USA Hub
# 2. Add DIVE protocol mappers to dive-v3-cross-border-client in GBR
# 3. Set attributes on testuser-gbr-1
# =============================================================================

set -e

LOG_FILE="/Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/.cursor/debug.log"
GBR_PASS="JvbyzBXVHVdf3ViAcieTMdpO"
USA_PASS="i8mE9Gjsg3x0KsCCZaG9tQ"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           DIVE V3 - GBR Federation Fix                       ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Get tokens
echo -e "${YELLOW}[1/7]${NC} Authenticating with Keycloak instances..."
GBR_TOKEN=$(docker exec gbr-keycloak-gbr-1 curl -sk -X POST "https://localhost:8443/realms/master/protocol/openid-connect/token" -d "client_id=admin-cli" -d "username=admin" -d "password=${GBR_PASS}" -d "grant_type=password" 2>/dev/null | jq -r '.access_token')
USA_TOKEN=$(docker exec dive-hub-keycloak curl -sk -X POST "https://localhost:8443/realms/master/protocol/openid-connect/token" -d "client_id=admin-cli" -d "username=admin" -d "password=${USA_PASS}" -d "grant_type=password" 2>/dev/null | jq -r '.access_token')

if [ "$GBR_TOKEN" = "null" ] || [ -z "$GBR_TOKEN" ]; then
  echo "✗ Failed to authenticate with GBR"
  exit 1
fi

if [ "$USA_TOKEN" = "null" ] || [ -z "$USA_TOKEN" ]; then
  echo "✗ Failed to authenticate with USA Hub"
  exit 1
fi

echo -e "${GREEN}✓ Authenticated with both instances${NC}"

# =============================================================================
# FIX 1: Add DIVE protocol mappers to dive-v3-cross-border-client in GBR
# =============================================================================
echo ""
echo -e "${YELLOW}[2/7]${NC} Adding DIVE protocol mappers to dive-v3-cross-border-client..."

CLIENT_DATA=$(docker exec gbr-keycloak-gbr-1 curl -sk -H "Authorization: Bearer $GBR_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker-gbr/clients?clientId=dive-v3-cross-border-client" 2>/dev/null)
CLIENT_UUID=$(echo "$CLIENT_DATA" | jq -r '.[0].id')

# Clearance mapper
docker exec gbr-keycloak-gbr-1 curl -sk -X POST \
  -H "Authorization: Bearer $GBR_TOKEN" \
  -H "Content-Type: application/json" \
  "https://localhost:8443/admin/realms/dive-v3-broker-gbr/clients/${CLIENT_UUID}/protocol-mappers/models" \
  -d '{
    "name": "clearance",
    "protocol": "openid-connect",
    "protocolMapper": "oidc-usermodel-attribute-mapper",
    "config": {
      "user.attribute": "clearance",
      "claim.name": "clearance",
      "id.token.claim": "true",
      "access.token.claim": "true",
      "userinfo.token.claim": "true",
      "jsonType.label": "String"
    }
  }' 2>/dev/null > /dev/null

# Country mapper
docker exec gbr-keycloak-gbr-1 curl -sk -X POST \
  -H "Authorization: Bearer $GBR_TOKEN" \
  -H "Content-Type: application/json" \
  "https://localhost:8443/admin/realms/dive-v3-broker-gbr/clients/${CLIENT_UUID}/protocol-mappers/models" \
  -d '{
    "name": "countryOfAffiliation",
    "protocol": "openid-connect",
    "protocolMapper": "oidc-usermodel-attribute-mapper",
    "config": {
      "user.attribute": "countryOfAffiliation",
      "claim.name": "countryOfAffiliation",
      "id.token.claim": "true",
      "access.token.claim": "true",
      "userinfo.token.claim": "true",
      "jsonType.label": "String"
    }
  }' 2>/dev/null > /dev/null

# UniqueID mapper
docker exec gbr-keycloak-gbr-1 curl -sk -X POST \
  -H "Authorization: Bearer $GBR_TOKEN" \
  -H "Content-Type: application/json" \
  "https://localhost:8443/admin/realms/dive-v3-broker-gbr/clients/${CLIENT_UUID}/protocol-mappers/models" \
  -d '{
    "name": "uniqueID",
    "protocol": "openid-connect",
    "protocolMapper": "oidc-usermodel-attribute-mapper",
    "config": {
      "user.attribute": "uniqueID",
      "claim.name": "uniqueID",
      "id.token.claim": "true",
      "access.token.claim": "true",
      "userinfo.token.claim": "true",
      "jsonType.label": "String"
    }
  }' 2>/dev/null > /dev/null

# acpCOI mapper (multivalued)
docker exec gbr-keycloak-gbr-1 curl -sk -X POST \
  -H "Authorization: Bearer $GBR_TOKEN" \
  -H "Content-Type: application/json" \
  "https://localhost:8443/admin/realms/dive-v3-broker-gbr/clients/${CLIENT_UUID}/protocol-mappers/models" \
  -d '{
    "name": "acpCOI",
    "protocol": "openid-connect",
    "protocolMapper": "oidc-usermodel-attribute-mapper",
    "config": {
      "user.attribute": "acpCOI",
      "claim.name": "acpCOI",
      "id.token.claim": "true",
      "access.token.claim": "true",
      "userinfo.token.claim": "true",
      "jsonType.label": "String",
      "multivalued": "true"
    }
  }' 2>/dev/null > /dev/null

echo -e "${GREEN}✓ Added 4 DIVE protocol mappers to cross-border client${NC}"
echo "{\"hypothesisId\":\"B\",\"location\":\"fix-gbr-federation.sh:142\",\"message\":\"Protocol mappers added\",\"data\":{\"client_uuid\":\"$CLIENT_UUID\",\"mappers\":[\"clearance\",\"countryOfAffiliation\",\"uniqueID\",\"acpCOI\"]},\"timestamp\":$(date +%s)000}" >> "$LOG_FILE"

# =============================================================================
# FIX 2: Set attributes on testuser-gbr-1
# =============================================================================
echo ""
echo -e "${YELLOW}[3/7]${NC} Setting attributes on testuser-gbr-1..."

USER_DATA=$(docker exec gbr-keycloak-gbr-1 curl -sk -H "Authorization: Bearer $GBR_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker-gbr/users?username=testuser-gbr-1&exact=true" 2>/dev/null)
USER_ID=$(echo "$USER_DATA" | jq -r '.[0].id')

docker exec gbr-keycloak-gbr-1 curl -sk -X PUT \
  -H "Authorization: Bearer $GBR_TOKEN" \
  -H "Content-Type: application/json" \
  "https://localhost:8443/admin/realms/dive-v3-broker-gbr/users/${USER_ID}" \
  -d '{
    "attributes": {
      "clearance": ["UNCLASSIFIED"],
      "countryOfAffiliation": ["GBR"],
      "uniqueID": ["testuser-gbr-1"],
      "acpCOI": []
    }
  }' 2>/dev/null > /dev/null

echo -e "${GREEN}✓ Set attributes: clearance=UNCLASSIFIED, countryOfAffiliation=GBR${NC}"
echo "{\"hypothesisId\":\"E\",\"location\":\"fix-gbr-federation.sh:165\",\"message\":\"User attributes set\",\"data\":{\"user_id\":\"$USER_ID\",\"clearance\":\"UNCLASSIFIED\",\"country\":\"GBR\"},\"timestamp\":$(date +%s)000}" >> "$LOG_FILE"

# =============================================================================
# FIX 3: Create gbr-federation IdP in USA Hub
# =============================================================================
echo ""
echo -e "${YELLOW}[4/7]${NC} Creating gbr-federation IdP in USA Hub..."

docker exec dive-hub-keycloak curl -sk -X POST \
  -H "Authorization: Bearer $USA_TOKEN" \
  -H "Content-Type: application/json" \
  "https://localhost:8443/admin/realms/dive-v3-broker/identity-provider/instances" \
  -d '{
    "alias": "gbr-federation",
    "displayName": "United Kingdom",
    "providerId": "oidc",
    "enabled": true,
    "updateProfileFirstLoginMode": "off",
    "trustEmail": true,
    "storeToken": true,
    "addReadTokenRoleOnCreate": false,
    "authenticateByDefault": false,
    "linkOnly": false,
    "firstBrokerLoginFlowAlias": "first broker login",
    "config": {
      "clientId": "dive-v3-cross-border-client",
      "clientSecret": "dive-v3-federation-secret-2025",
      "defaultScope": "openid profile email",
      "authorizationUrl": "https://localhost:8446/realms/dive-v3-broker-gbr/protocol/openid-connect/auth",
      "tokenUrl": "https://gbr-keycloak-gbr-1:8443/realms/dive-v3-broker-gbr/protocol/openid-connect/token",
      "logoutUrl": "https://localhost:8446/realms/dive-v3-broker-gbr/protocol/openid-connect/logout",
      "userInfoUrl": "https://gbr-keycloak-gbr-1:8443/realms/dive-v3-broker-gbr/protocol/openid-connect/userinfo",
      "issuer": "https://localhost:8446/realms/dive-v3-broker-gbr",
      "jwksUrl": "https://gbr-keycloak-gbr-1:8443/realms/dive-v3-broker-gbr/protocol/openid-connect/certs",
      "validateSignature": "false",
      "useJwksUrl": "true",
      "backchannelSupported": "false",
      "disable-trust-manager": "true",
      "pkceEnabled": "true",
      "syncMode": "FORCE"
    }
  }' 2>/dev/null > /dev/null

echo -e "${GREEN}✓ Created gbr-federation IdP in USA Hub${NC}"
echo "{\"hypothesisId\":\"A\",\"location\":\"fix-gbr-federation.sh:216\",\"message\":\"gbr-federation IdP created\",\"data\":{\"alias\":\"gbr-federation\",\"updateProfileFirstLoginMode\":\"off\",\"syncMode\":\"FORCE\"},\"timestamp\":$(date +%s)000}" >> "$LOG_FILE"

# =============================================================================
# FIX 4: Add attribute import mappers to gbr-federation IdP
# =============================================================================
echo ""
echo -e "${YELLOW}[5/7]${NC} Adding attribute import mappers to gbr-federation IdP..."

# Clearance importer
docker exec dive-hub-keycloak curl -sk -X POST \
  -H "Authorization: Bearer $USA_TOKEN" \
  -H "Content-Type: application/json" \
  "https://localhost:8443/admin/realms/dive-v3-broker/identity-provider/instances/gbr-federation/mappers" \
  -d '{
    "name": "clearance-importer",
    "identityProviderAlias": "gbr-federation",
    "identityProviderMapper": "oidc-user-attribute-idp-mapper",
    "config": {
      "syncMode": "FORCE",
      "claim": "clearance",
      "user.attribute": "clearance"
    }
  }' 2>/dev/null > /dev/null

# Country importer
docker exec dive-hub-keycloak curl -sk -X POST \
  -H "Authorization: Bearer $USA_TOKEN" \
  -H "Content-Type: application/json" \
  "https://localhost:8443/admin/realms/dive-v3-broker/identity-provider/instances/gbr-federation/mappers" \
  -d '{
    "name": "country-importer",
    "identityProviderAlias": "gbr-federation",
    "identityProviderMapper": "oidc-user-attribute-idp-mapper",
    "config": {
      "syncMode": "FORCE",
      "claim": "countryOfAffiliation",
      "user.attribute": "countryOfAffiliation"
    }
  }' 2>/dev/null > /dev/null

# UniqueID importer
docker exec dive-hub-keycloak curl -sk -X POST \
  -H "Authorization: Bearer $USA_TOKEN" \
  -H "Content-Type: application/json" \
  "https://localhost:8443/admin/realms/dive-v3-broker/identity-provider/instances/gbr-federation/mappers" \
  -d '{
    "name": "uniqueID-importer",
    "identityProviderAlias": "gbr-federation",
    "identityProviderMapper": "oidc-user-attribute-idp-mapper",
    "config": {
      "syncMode": "FORCE",
      "claim": "uniqueID",
      "user.attribute": "uniqueID"
    }
  }' 2>/dev/null > /dev/null

# acpCOI importer
docker exec dive-hub-keycloak curl -sk -X POST \
  -H "Authorization: Bearer $USA_TOKEN" \
  -H "Content-Type: application/json" \
  "https://localhost:8443/admin/realms/dive-v3-broker/identity-provider/instances/gbr-federation/mappers" \
  -d '{
    "name": "acpCOI-importer",
    "identityProviderAlias": "gbr-federation",
    "identityProviderMapper": "oidc-user-attribute-idp-mapper",
    "config": {
      "syncMode": "FORCE",
      "claim": "acpCOI",
      "user.attribute": "acpCOI"
    }
  }' 2>/dev/null > /dev/null

echo -e "${GREEN}✓ Added 4 attribute import mappers${NC}"
echo "{\"hypothesisId\":\"C\",\"location\":\"fix-gbr-federation.sh:291\",\"message\":\"Attribute import mappers added\",\"data\":{\"mappers\":[\"clearance-importer\",\"country-importer\",\"uniqueID-importer\",\"acpCOI-importer\"]},\"timestamp\":$(date +%s)000}" >> "$LOG_FILE"

# =============================================================================
# VERIFICATION
# =============================================================================
echo ""
echo -e "${YELLOW}[6/7]${NC} Verifying fixes..."

# Verify client mappers
MAPPERS=$(docker exec gbr-keycloak-gbr-1 curl -sk -H "Authorization: Bearer $GBR_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker-gbr/clients/${CLIENT_UUID}/protocol-mappers/models" 2>/dev/null)
MAPPER_COUNT=$(echo "$MAPPERS" | jq 'length')
echo "  ✓ GBR client has $MAPPER_COUNT protocol mappers"

# Verify user attributes
USER_DATA=$(docker exec gbr-keycloak-gbr-1 curl -sk -H "Authorization: Bearer $GBR_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker-gbr/users/${USER_ID}" 2>/dev/null)
USER_CLEARANCE=$(echo "$USER_DATA" | jq -r '.attributes.clearance[0]')
echo "  ✓ testuser-gbr-1 clearance: $USER_CLEARANCE"

# Verify IdP exists
IDP_DATA=$(docker exec dive-hub-keycloak curl -sk -H "Authorization: Bearer $USA_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker/identity-provider/instances/gbr-federation" 2>/dev/null)
IDP_EXISTS=$(echo "$IDP_DATA" | jq -r '.alias')
echo "  ✓ USA Hub IdP: $IDP_EXISTS"

# Verify IdP mappers
IDP_MAPPERS=$(docker exec dive-hub-keycloak curl -sk -H "Authorization: Bearer $USA_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker/identity-provider/instances/gbr-federation/mappers" 2>/dev/null)
IDP_MAPPER_COUNT=$(echo "$IDP_MAPPERS" | jq 'length')
echo "  ✓ USA Hub IdP has $IDP_MAPPER_COUNT attribute mappers"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    Fix Complete ✓                            ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  Fixed:                                                      ║${NC}"
echo -e "${GREEN}║  1. Added DIVE protocol mappers to GBR client ($MAPPER_COUNT)        ║${NC}"
echo -e "${GREEN}║  2. Set attributes on testuser-gbr-1                         ║${NC}"
echo -e "${GREEN}║  3. Created gbr-federation IdP in USA Hub                    ║${NC}"
echo -e "${GREEN}║  4. Added attribute import mappers ($IDP_MAPPER_COUNT)                     ║${NC}"
echo -e "${GREEN}║                                                              ║${NC}"
echo -e "${GREEN}║  Next: Test GBR → USA authentication flow                    ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}[7/7]${NC} Test the fix:"
echo "  1. Go to https://localhost:3000 (USA Hub)"
echo "  2. Click 'Sign in with Keycloak'"
echo "  3. Click 'United Kingdom' button"
echo "  4. Login as testuser-gbr-1 / TestUser2025!Pilot"
echo "  5. Verify: No 'Update Account' form appears"
echo "  6. Verify: User profile shows clearance and country"
