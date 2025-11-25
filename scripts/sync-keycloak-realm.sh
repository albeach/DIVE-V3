#!/bin/bash
#
# DIVE V3 - Keycloak Realm Sync Script
#
# Syncs the dive-v3-broker realm from a source instance to a target instance.
# Updates IdP URLs to point to the correct Cloudflare hostnames.
#
# Usage:
#   ./scripts/sync-keycloak-realm.sh <SOURCE_CODE> <TARGET_CODE>
#
# Examples:
#   ./scripts/sync-keycloak-realm.sh usa fra   # Sync from USA to France
#   ./scripts/sync-keycloak-realm.sh usa deu   # Sync from USA to Germany
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SOURCE_CODE=$(echo "${1:-}" | tr '[:upper:]' '[:lower:]')
TARGET_CODE=$(echo "${2:-}" | tr '[:upper:]' '[:lower:]')

# Helper function for uppercase
to_upper() { echo "$1" | tr '[:lower:]' '[:upper:]'; }

if [[ -z "$SOURCE_CODE" || -z "$TARGET_CODE" ]]; then
  echo -e "${RED}Error: Source and target country codes required${NC}"
  echo "Usage: $0 <SOURCE_CODE> <TARGET_CODE>"
  exit 1
fi

# Port mapping
get_keycloak_port() {
  local code=$1
  case "$code" in
    usa) echo 8443 ;;
    fra) echo 8444 ;;
    deu) echo 8445 ;;
    gbr) echo 8446 ;;
    *) 
      local offset=$(echo -n "$code" | md5sum | tr -d -c '0-9' | cut -c1-2)
      offset=$((10#$offset % 90 + 10))
      echo $((8443 + offset))
      ;;
  esac
}

SOURCE_PORT=$(get_keycloak_port "$SOURCE_CODE")
TARGET_PORT=$(get_keycloak_port "$TARGET_CODE")
SOURCE_IDP="${SOURCE_CODE}-idp.dive25.com"
TARGET_IDP="${TARGET_CODE}-idp.dive25.com"
TARGET_APP="${TARGET_CODE}-app.dive25.com"
TARGET_API="${TARGET_CODE}-api.dive25.com"

echo -e "${CYAN}══════════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  DIVE V3 - Keycloak Realm Sync${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════════════════${NC}"
echo ""
echo "  Source: $(to_upper "$SOURCE_CODE") (localhost:${SOURCE_PORT})"
echo "  Target: $(to_upper "$TARGET_CODE") (localhost:${TARGET_PORT})"
echo ""

# Get admin tokens
echo -e "${CYAN}[1/5] Authenticating to Keycloak instances...${NC}"

SOURCE_TOKEN=$(curl -sk "https://localhost:${SOURCE_PORT}/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli" \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password" | jq -r '.access_token')

TARGET_TOKEN=$(curl -sk "https://localhost:${TARGET_PORT}/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli" \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password" | jq -r '.access_token')

if [[ -z "$SOURCE_TOKEN" || "$SOURCE_TOKEN" == "null" ]]; then
  echo -e "${RED}✗ Failed to authenticate to source Keycloak${NC}"
  exit 1
fi

if [[ -z "$TARGET_TOKEN" || "$TARGET_TOKEN" == "null" ]]; then
  echo -e "${RED}✗ Failed to authenticate to target Keycloak${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Authenticated to both instances${NC}"

# Export realm from source
echo -e "${CYAN}[2/5] Exporting realm from $(to_upper "$SOURCE_CODE")...${NC}"

curl -sk "https://localhost:${SOURCE_PORT}/admin/realms/dive-v3-broker/partial-export?exportClients=true&exportGroupsAndRoles=true" \
  -H "Authorization: Bearer $SOURCE_TOKEN" \
  -X POST > /tmp/realm-export.json

EXPORT_SIZE=$(wc -c < /tmp/realm-export.json)
echo -e "${GREEN}✓ Exported realm (${EXPORT_SIZE} bytes)${NC}"

# Check if realm exists in target
echo -e "${CYAN}[3/5] Checking target realm...${NC}"

REALM_EXISTS=$(curl -sk "https://localhost:${TARGET_PORT}/admin/realms/dive-v3-broker" \
  -H "Authorization: Bearer $TARGET_TOKEN" | jq -r '.realm // empty')

if [[ -n "$REALM_EXISTS" ]]; then
  echo "  Deleting existing realm in target..."
  curl -sk -X DELETE "https://localhost:${TARGET_PORT}/admin/realms/dive-v3-broker" \
    -H "Authorization: Bearer $TARGET_TOKEN"
  sleep 2
fi

# Import realm to target
echo -e "${CYAN}[4/5] Importing realm to $(to_upper "$TARGET_CODE")...${NC}"

curl -sk -X POST "https://localhost:${TARGET_PORT}/admin/realms" \
  -H "Authorization: Bearer $TARGET_TOKEN" \
  -H "Content-Type: application/json" \
  -d @/tmp/realm-export.json

# Refresh token after import
sleep 2
TARGET_TOKEN=$(curl -sk "https://localhost:${TARGET_PORT}/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli" \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password" | jq -r '.access_token')

echo -e "${GREEN}✓ Realm imported${NC}"

# Update configurations for target instance
echo -e "${CYAN}[5/5] Updating configurations for $(to_upper "$TARGET_CODE")...${NC}"

# Update IdP URLs
echo "  Updating IdP authorization URLs..."
IDPS=$(curl -sk "https://localhost:${TARGET_PORT}/admin/realms/dive-v3-broker/identity-provider/instances" \
  -H "Authorization: Bearer $TARGET_TOKEN" | jq -r '.[].alias')

for IDP in $IDPS; do
  CONFIG=$(curl -sk "https://localhost:${TARGET_PORT}/admin/realms/dive-v3-broker/identity-provider/instances/$IDP" \
    -H "Authorization: Bearer $TARGET_TOKEN")
  
  # Update URLs to point to source IdP (national realms are on source instance)
  UPDATED=$(echo "$CONFIG" | jq --arg src "$SOURCE_IDP" '
    .config.authorizationUrl = (.config.authorizationUrl // "" | gsub("localhost:[0-9]+"; $src) | gsub("[a-z]{3}-idp.dive25.com"; $src)) |
    .config.tokenUrl = (.config.tokenUrl // "" | gsub("localhost:[0-9]+"; $src) | gsub("[a-z]{3}-idp.dive25.com"; $src)) |
    .config.jwksUrl = (.config.jwksUrl // "" | gsub("localhost:[0-9]+"; $src) | gsub("[a-z]{3}-idp.dive25.com"; $src))
  ' 2>/dev/null)
  
  if [[ -n "$UPDATED" ]]; then
    curl -sk -X PUT "https://localhost:${TARGET_PORT}/admin/realms/dive-v3-broker/identity-provider/instances/$IDP" \
      -H "Authorization: Bearer $TARGET_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$UPDATED" > /dev/null 2>&1
  fi
done

echo -e "${GREEN}✓ IdP URLs updated${NC}"

# Update client redirect URIs
echo "  Updating client redirect URIs..."
CLIENT_UUID=$(curl -sk "https://localhost:${TARGET_PORT}/admin/realms/dive-v3-broker/clients" \
  -H "Authorization: Bearer $TARGET_TOKEN" | jq -r '.[] | select(.clientId == "dive-v3-client-broker") | .id')

if [[ -n "$CLIENT_UUID" ]]; then
  curl -sk -X PUT "https://localhost:${TARGET_PORT}/admin/realms/dive-v3-broker/clients/$CLIENT_UUID" \
    -H "Authorization: Bearer $TARGET_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"clientId\": \"dive-v3-client-broker\",
      \"enabled\": true,
      \"publicClient\": false,
      \"standardFlowEnabled\": true,
      \"directAccessGrantsEnabled\": true,
      \"redirectUris\": [
        \"https://${TARGET_APP}/*\",
        \"https://${TARGET_APP}/dashboard\",
        \"https://${TARGET_APP}/api/auth/callback/keycloak\",
        \"https://localhost:${TARGET_PORT}/*\"
      ],
      \"webOrigins\": [
        \"https://${TARGET_APP}\",
        \"https://${TARGET_API}\",
        \"+\"
      ]
    }" > /dev/null 2>&1
  echo -e "${GREEN}✓ Client redirect URIs updated${NC}"
fi

# Cleanup
rm -f /tmp/realm-export.json

echo ""
echo -e "${GREEN}══════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ Realm Sync Complete!${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════════════════════${NC}"
echo ""
echo "  $(to_upper "$TARGET_CODE") Keycloak now has:"
echo "  ✓ dive-v3-broker realm imported from $(to_upper "$SOURCE_CODE")"
echo "  ✓ IdP URLs pointing to ${SOURCE_IDP}"
echo "  ✓ Client redirects configured for ${TARGET_APP}"
echo ""

