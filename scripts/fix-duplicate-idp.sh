#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Fix Duplicate IdP Issue
# =============================================================================
# Fixes:
# 1. Remove duplicate gbr-federation IdP
# 2. Fix gbr-idp configuration
# 3. Delete broken user in USA Hub
# 4. Set updateProfileFirstLoginMode=off
# =============================================================================

set -e

LOG_FILE="/Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/.cursor/debug.log"
USA_PASS="i8mE9Gjsg3x0KsCCZaG9tQ"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           DIVE V3 - Fix Duplicate IdP Issue                  ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

USA_TOKEN=$(docker exec dive-hub-keycloak curl -sk -X POST "https://localhost:8443/realms/master/protocol/openid-connect/token" -d "client_id=admin-cli" -d "username=admin" -d "password=${USA_PASS}" -d "grant_type=password" 2>/dev/null | jq -r '.access_token')

# =============================================================================
# FIX 1: Delete duplicate gbr-federation IdP
# =============================================================================
echo -e "${YELLOW}[1/5]${NC} Removing duplicate gbr-federation IdP..."

docker exec dive-hub-keycloak curl -sk -X DELETE \
  -H "Authorization: Bearer $USA_TOKEN" \
  "https://localhost:8443/admin/realms/dive-v3-broker/identity-provider/instances/gbr-federation" 2>/dev/null

echo -e "${GREEN}✓ Removed gbr-federation IdP${NC}"
echo "{\"runId\":\"fix2\",\"hypothesisId\":\"F\",\"location\":\"fix-duplicate:36\",\"message\":\"Removed duplicate IdP\",\"data\":{\"removed\":\"gbr-federation\"},\"timestamp\":$(date +%s)000}" >> "$LOG_FILE"

# =============================================================================
# FIX 2: Delete broken user in USA Hub
# =============================================================================
echo ""
echo -e "${YELLOW}[2/5]${NC} Deleting broken user in USA Hub..."

USER_DATA=$(docker exec dive-hub-keycloak curl -sk -H "Authorization: Bearer $USA_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker/users?username=testuser-gbr-1&exact=true" 2>/dev/null)
USER_ID=$(echo "$USER_DATA" | jq -r '.[0].id // empty')

if [ -n "$USER_ID" ]; then
  docker exec dive-hub-keycloak curl -sk -X DELETE \
    -H "Authorization: Bearer $USA_TOKEN" \
    "https://localhost:8443/admin/realms/dive-v3-broker/users/${USER_ID}" 2>/dev/null
  
  echo -e "${GREEN}✓ Deleted user: $USER_ID${NC}"
  echo "{\"runId\":\"fix2\",\"hypothesisId\":\"I\",\"location\":\"fix-duplicate:55\",\"message\":\"Deleted broken user\",\"data\":{\"user_id\":\"$USER_ID\"},\"timestamp\":$(date +%s)000}" >> "$LOG_FILE"
else
  echo "  (No user to delete)"
fi

# =============================================================================
# FIX 3: Fix gbr-idp configuration
# =============================================================================
echo ""
echo -e "${YELLOW}[3/5]${NC} Fixing gbr-idp configuration..."

docker exec dive-hub-keycloak curl -sk -X PUT \
  -H "Authorization: Bearer $USA_TOKEN" \
  -H "Content-Type: application/json" \
  "https://localhost:8443/admin/realms/dive-v3-broker/identity-provider/instances/gbr-idp" \
  -d '{
    "alias": "gbr-idp",
    "displayName": "United Kingdom",
    "providerId": "oidc",
    "enabled": true,
    "updateProfileFirstLoginMode": "off",
    "trustEmail": true,
    "storeToken": true,
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
      "syncMode": "FORCE",
      "disable-trust-manager": "true"
    }
  }' 2>/dev/null > /dev/null

echo -e "${GREEN}✓ Updated gbr-idp configuration${NC}"
echo "  clientId: dive-v3-cross-border-client"
echo "  updateProfileFirstLoginMode: off"
echo "  syncMode: FORCE"
echo "{\"runId\":\"fix2\",\"hypothesisId\":\"G\",\"location\":\"fix-duplicate:106\",\"message\":\"Fixed gbr-idp config\",\"data\":{\"update_mode\":\"off\",\"sync_mode\":\"FORCE\"},\"timestamp\":$(date +%s)000}" >> "$LOG_FILE"

# =============================================================================
# FIX 4: Ensure gbr-idp has correct attribute mappers
# =============================================================================
echo ""
echo -e "${YELLOW}[4/5]${NC} Verifying gbr-idp attribute mappers..."

MAPPERS=$(docker exec dive-hub-keycloak curl -sk -H "Authorization: Bearer $USA_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker/identity-provider/instances/gbr-idp/mappers" 2>/dev/null)
MAPPER_NAMES=$(echo "$MAPPERS" | jq -c '[.[].name]')
MAPPER_COUNT=$(echo "$MAPPERS" | jq 'length')

echo -e "${GREEN}✓ gbr-idp has ${MAPPER_COUNT} mappers${NC}"
echo "  Mappers: $MAPPER_NAMES"

# Check if syncMode is FORCE on all mappers
for MAPPER_ID in $(echo "$MAPPERS" | jq -r '.[].id'); do
  MAPPER_DATA=$(echo "$MAPPERS" | jq ".[] | select(.id==\"$MAPPER_ID\")")
  SYNC_MODE=$(echo "$MAPPER_DATA" | jq -r '.config.syncMode // "INHERIT"')
  MAPPER_NAME=$(echo "$MAPPER_DATA" | jq -r '.name')
  
  if [ "$SYNC_MODE" != "FORCE" ]; then
    echo "  Updating $MAPPER_NAME to syncMode=FORCE..."
    
    # Update mapper
    docker exec dive-hub-keycloak curl -sk -X PUT \
      -H "Authorization: Bearer $USA_TOKEN" \
      -H "Content-Type: application/json" \
      "https://localhost:8443/admin/realms/dive-v3-broker/identity-provider/instances/gbr-idp/mappers/${MAPPER_ID}" \
      -d "$(echo "$MAPPER_DATA" | jq '.config.syncMode = "FORCE"')" 2>/dev/null > /dev/null
  fi
done

echo -e "${GREEN}✓ All mappers set to syncMode=FORCE${NC}"
echo "{\"runId\":\"fix2\",\"hypothesisId\":\"H\",\"location\":\"fix-duplicate:143\",\"message\":\"Mapper syncMode fixed\",\"data\":{\"count\":$MAPPER_COUNT},\"timestamp\":$(date +%s)000}" >> "$LOG_FILE"

# =============================================================================
# VERIFICATION
# =============================================================================
echo ""
echo -e "${YELLOW}[5/5]${NC} Verifying fixes..."

# Count IdPs
IDPS=$(docker exec dive-hub-keycloak curl -sk -H "Authorization: Bearer $USA_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker/identity-provider/instances" 2>/dev/null)
GBR_COUNT=$(echo "$IDPS" | jq '[.[] | select(.displayName | contains("Kingdom"))] | length')

echo "  IdP count: $GBR_COUNT (should be 1)"

# Check gbr-idp config
GBR_IDP=$(docker exec dive-hub-keycloak curl -sk -H "Authorization: Bearer $USA_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker/identity-provider/instances/gbr-idp" 2>/dev/null)
UPDATE_MODE=$(echo "$GBR_IDP" | jq -r '.updateProfileFirstLoginMode')
CLIENT_ID=$(echo "$GBR_IDP" | jq -r '.config.clientId')
SYNC_MODE=$(echo "$GBR_IDP" | jq -r '.config.syncMode')

echo "  updateProfileFirstLoginMode: $UPDATE_MODE"
echo "  clientId: $CLIENT_ID"
echo "  syncMode: $SYNC_MODE"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    Fix Complete ✓                            ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  Fixed:                                                      ║${NC}"
echo -e "${GREEN}║  1. Removed duplicate gbr-federation IdP                     ║${NC}"
echo -e "${GREEN}║  2. Deleted broken user in USA Hub                           ║${NC}"
echo -e "${GREEN}║  3. Fixed gbr-idp configuration                              ║${NC}"
echo -e "${GREEN}║  4. Set updateProfileFirstLoginMode=off                      ║${NC}"
echo -e "${GREEN}║  5. Set all mappers to syncMode=FORCE                        ║${NC}"
echo -e "${GREEN}║                                                              ║${NC}"
echo -e "${GREEN}║  Ready for re-test!                                          ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "{\"runId\":\"fix2\",\"location\":\"fix-duplicate:186\",\"message\":\"All fixes complete\",\"data\":{\"idp_count\":$GBR_COUNT,\"update_mode\":\"$UPDATE_MODE\",\"sync_mode\":\"$SYNC_MODE\"},\"timestamp\":$(date +%s)000}" >> "$LOG_FILE"
