#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Fix Missing Basic Profile Fields
# =============================================================================
# Fixes:
# 1. Set email/firstName/lastName on testuser-gbr-1 in GBR
# 2. Add email/firstName/lastName mappers to gbr-idp
# 3. Add username mapper to gbr-idp
# =============================================================================

set -e

LOG_FILE="/Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/.cursor/debug.log"
GBR_PASS="JvbyzBXVHVdf3ViAcieTMdpO"
USA_PASS="i8mE9Gjsg3x0KsCCZaG9tQ"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        DIVE V3 - Fix Missing Basic Profile Fields           ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

GBR_TOKEN=$(docker exec gbr-keycloak-gbr-1 curl -sk -X POST "https://localhost:8443/realms/master/protocol/openid-connect/token" -d "client_id=admin-cli" -d "username=admin" -d "password=${GBR_PASS}" -d "grant_type=password" 2>/dev/null | jq -r '.access_token')
USA_TOKEN=$(docker exec dive-hub-keycloak curl -sk -X POST "https://localhost:8443/realms/master/protocol/openid-connect/token" -d "client_id=admin-cli" -d "username=admin" -d "password=${USA_PASS}" -d "grant_type=password" 2>/dev/null | jq -r '.access_token')

# =============================================================================
# FIX 1: Set email/firstName/lastName on testuser-gbr-1
# =============================================================================
echo -e "${YELLOW}[1/3]${NC} Setting basic profile fields on testuser-gbr-1..."

USER_DATA=$(docker exec gbr-keycloak-gbr-1 curl -sk -H "Authorization: Bearer $GBR_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker-gbr/users?username=testuser-gbr-1&exact=true" 2>/dev/null)
USER_ID=$(echo "$USER_DATA" | jq -r '.[0].id')

docker exec gbr-keycloak-gbr-1 curl -sk -X PUT \
  -H "Authorization: Bearer $GBR_TOKEN" \
  -H "Content-Type: application/json" \
  "https://localhost:8443/admin/realms/dive-v3-broker-gbr/users/${USER_ID}" \
  -d '{
    "email": "testuser-gbr-1@gbr.dive25.com",
    "emailVerified": true,
    "firstName": "Test",
    "lastName": "GBR-1"
  }' 2>/dev/null > /dev/null

echo -e "${GREEN}✓ Set basic profile fields${NC}"
echo "  email: testuser-gbr-1@gbr.dive25.com"
echo "  firstName: Test"
echo "  lastName: GBR-1"
echo "{\"runId\":\"fix3\",\"hypothesisId\":\"K\",\"location\":\"fix-profile:50\",\"message\":\"Set user profile\",\"data\":{\"user_id\":\"$USER_ID\",\"email\":\"testuser-gbr-1@gbr.dive25.com\"},\"timestamp\":$(date +%s)000}" >> "$LOG_FILE"

# =============================================================================
# FIX 2: Add basic profile mappers to gbr-idp
# =============================================================================
echo ""
echo -e "${YELLOW}[2/3]${NC} Adding basic profile mappers to gbr-idp..."

# Username mapper (preferred_username → username)
docker exec dive-hub-keycloak curl -sk -X POST \
  -H "Authorization: Bearer $USA_TOKEN" \
  -H "Content-Type: application/json" \
  "https://localhost:8443/admin/realms/dive-v3-broker/identity-provider/instances/gbr-idp/mappers" \
  -d '{
    "name": "username-mapper",
    "identityProviderAlias": "gbr-idp",
    "identityProviderMapper": "oidc-username-idp-mapper",
    "config": {
      "syncMode": "FORCE",
      "template": "${CLAIM.preferred_username}"
    }
  }' 2>/dev/null > /dev/null

echo "  ✓ Added username-mapper"

# Email mapper
docker exec dive-hub-keycloak curl -sk -X POST \
  -H "Authorization: Bearer $USA_TOKEN" \
  -H "Content-Type: application/json" \
  "https://localhost:8443/admin/realms/dive-v3-broker/identity-provider/instances/gbr-idp/mappers" \
  -d '{
    "name": "email-mapper",
    "identityProviderAlias": "gbr-idp",
    "identityProviderMapper": "oidc-user-attribute-idp-mapper",
    "config": {
      "syncMode": "FORCE",
      "claim": "email",
      "user.attribute": "email"
    }
  }' 2>/dev/null > /dev/null

echo "  ✓ Added email-mapper"

# First name mapper
docker exec dive-hub-keycloak curl -sk -X POST \
  -H "Authorization: Bearer $USA_TOKEN" \
  -H "Content-Type: application/json" \
  "https://localhost:8443/admin/realms/dive-v3-broker/identity-provider/instances/gbr-idp/mappers" \
  -d '{
    "name": "firstName-mapper",
    "identityProviderAlias": "gbr-idp",
    "identityProviderMapper": "oidc-user-attribute-idp-mapper",
    "config": {
      "syncMode": "FORCE",
      "claim": "given_name",
      "user.attribute": "firstName"
    }
  }' 2>/dev/null > /dev/null

echo "  ✓ Added firstName-mapper (given_name → firstName)"

# Last name mapper
docker exec dive-hub-keycloak curl -sk -X POST \
  -H "Authorization: Bearer $USA_TOKEN" \
  -H "Content-Type: application/json" \
  "https://localhost:8443/admin/realms/dive-v3-broker/identity-provider/instances/gbr-idp/mappers" \
  -d '{
    "name": "lastName-mapper",
    "identityProviderAlias": "gbr-idp",
    "identityProviderMapper": "oidc-user-attribute-idp-mapper",
    "config": {
      "syncMode": "FORCE",
      "claim": "family_name",
      "user.attribute": "lastName"
    }
  }' 2>/dev/null > /dev/null

echo "  ✓ Added lastName-mapper (family_name → lastName)"

echo -e "${GREEN}✓ Added 4 basic profile mappers${NC}"
echo "{\"runId\":\"fix3\",\"hypothesisId\":\"L\",\"location\":\"fix-profile:136\",\"message\":\"Added profile mappers\",\"data\":{\"mappers\":[\"username\",\"email\",\"firstName\",\"lastName\"]},\"timestamp\":$(date +%s)000}" >> "$LOG_FILE"

# =============================================================================
# FIX 3: Add profile mappers to GBR cross-border client
# =============================================================================
echo ""
echo -e "${YELLOW}[3/3]${NC} Adding profile mappers to GBR cross-border client..."

CLIENT_DATA=$(docker exec gbr-keycloak-gbr-1 curl -sk -H "Authorization: Bearer $GBR_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker-gbr/clients?clientId=dive-v3-cross-border-client" 2>/dev/null)
CLIENT_UUID=$(echo "$CLIENT_DATA" | jq -r '.[0].id')

# Email mapper on client
docker exec gbr-keycloak-gbr-1 curl -sk -X POST \
  -H "Authorization: Bearer $GBR_TOKEN" \
  -H "Content-Type: application/json" \
  "https://localhost:8443/admin/realms/dive-v3-broker-gbr/clients/${CLIENT_UUID}/protocol-mappers/models" \
  -d '{
    "name": "email",
    "protocol": "openid-connect",
    "protocolMapper": "oidc-usermodel-property-mapper",
    "config": {
      "user.attribute": "email",
      "claim.name": "email",
      "id.token.claim": "true",
      "access.token.claim": "true",
      "userinfo.token.claim": "true",
      "jsonType.label": "String"
    }
  }' 2>/dev/null > /dev/null

# given_name mapper
docker exec gbr-keycloak-gbr-1 curl -sk -X POST \
  -H "Authorization: Bearer $GBR_TOKEN" \
  -H "Content-Type: application/json" \
  "https://localhost:8443/admin/realms/dive-v3-broker-gbr/clients/${CLIENT_UUID}/protocol-mappers/models" \
  -d '{
    "name": "given_name",
    "protocol": "openid-connect",
    "protocolMapper": "oidc-usermodel-property-mapper",
    "config": {
      "user.attribute": "firstName",
      "claim.name": "given_name",
      "id.token.claim": "true",
      "access.token.claim": "true",
      "userinfo.token.claim": "true",
      "jsonType.label": "String"
    }
  }' 2>/dev/null > /dev/null

# family_name mapper
docker exec gbr-keycloak-gbr-1 curl -sk -X POST \
  -H "Authorization: Bearer $GBR_TOKEN" \
  -H "Content-Type: application/json" \
  "https://localhost:8443/admin/realms/dive-v3-broker-gbr/clients/${CLIENT_UUID}/protocol-mappers/models" \
  -d '{
    "name": "family_name",
    "protocol": "openid-connect",
    "protocolMapper": "oidc-usermodel-property-mapper",
    "config": {
      "user.attribute": "lastName",
      "claim.name": "family_name",
      "id.token.claim": "true",
      "access.token.claim": "true",
      "userinfo.token.claim": "true",
      "jsonType.label": "String"
    }
  }' 2>/dev/null > /dev/null

# preferred_username mapper
docker exec gbr-keycloak-gbr-1 curl -sk -X POST \
  -H "Authorization: Bearer $GBR_TOKEN" \
  -H "Content-Type: application/json" \
  "https://localhost:8443/admin/realms/dive-v3-broker-gbr/clients/${CLIENT_UUID}/protocol-mappers/models" \
  -d '{
    "name": "preferred_username",
    "protocol": "openid-connect",
    "protocolMapper": "oidc-usermodel-property-mapper",
    "config": {
      "user.attribute": "username",
      "claim.name": "preferred_username",
      "id.token.claim": "true",
      "access.token.claim": "true",
      "userinfo.token.claim": "true",
      "jsonType.label": "String"
    }
  }' 2>/dev/null > /dev/null

echo -e "${GREEN}✓ Added profile mappers to GBR client${NC}"

# =============================================================================
# VERIFICATION
# =============================================================================
echo ""
echo -e "${YELLOW}Verification:${NC}"

# Check GBR user
USER_DATA=$(docker exec gbr-keycloak-gbr-1 curl -sk -H "Authorization: Bearer $GBR_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker-gbr/users?username=testuser-gbr-1&exact=true" 2>/dev/null)
EMAIL=$(echo "$USER_DATA" | jq -r '.[0].email')
echo "  GBR user email: $EMAIL"

# Check GBR client mappers
MAPPERS=$(docker exec gbr-keycloak-gbr-1 curl -sk -H "Authorization: Bearer $GBR_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker-gbr/clients/${CLIENT_UUID}/protocol-mappers/models" 2>/dev/null)
MAPPER_COUNT=$(echo "$MAPPERS" | jq 'length')
echo "  GBR client mappers: $MAPPER_COUNT"

# Check USA IdP mappers
IDP_MAPPERS=$(docker exec dive-hub-keycloak curl -sk -H "Authorization: Bearer $USA_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker/identity-provider/instances/gbr-idp/mappers" 2>/dev/null)
IDP_MAPPER_COUNT=$(echo "$IDP_MAPPERS" | jq 'length')
echo "  USA IdP mappers: $IDP_MAPPER_COUNT"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              Basic Profile Fix Complete ✓                    ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  Fixed:                                                      ║${NC}"
echo -e "${GREEN}║  1. Set email/firstName/lastName on testuser-gbr-1           ║${NC}"
echo -e "${GREEN}║  2. Added 4 basic profile mappers to gbr-idp                 ║${NC}"
echo -e "${GREEN}║  3. Added 4 profile mappers to GBR client                    ║${NC}"
echo -e "${GREEN}║                                                              ║${NC}"
echo -e "${GREEN}║  Total mappers now:                                          ║${NC}"
echo -e "${GREEN}║    GBR client: ${MAPPER_COUNT} (DIVE + profile)                          ║${NC}"
echo -e "${GREEN}║    USA IdP: ${IDP_MAPPER_COUNT} (DIVE + profile)                           ║${NC}"
echo -e "${GREEN}║                                                              ║${NC}"
echo -e "${GREEN}║  Ready for final test!                                       ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "{\"runId\":\"fix3\",\"location\":\"fix-profile:277\",\"message\":\"All profile fixes complete\",\"data\":{\"gbr_client_mappers\":$MAPPER_COUNT,\"usa_idp_mappers\":$IDP_MAPPER_COUNT},\"timestamp\":$(date +%s)000}" >> "$LOG_FILE"
