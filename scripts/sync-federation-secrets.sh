#!/bin/bash
#
# DIVE V3 - Federation Client Secret Synchronization
#
# Synchronizes federation client secrets across all instances to ensure
# cross-instance authentication (federation) works correctly.
#
# Usage:
#   ./scripts/sync-federation-secrets.sh [SOURCE_INSTANCE]
#
# Examples:
#   ./scripts/sync-federation-secrets.sh           # Sync all instances
#   ./scripts/sync-federation-secrets.sh usa       # Only sync from USA
#
# This script addresses the "Invalid client credentials" error that occurs
# when federation client secrets don't match between instances.
#
# LESSON LEARNED (DEU Deployment 2025-11-25):
# Federation fails with 401 "unauthorized_client" errors when client secrets
# in IdP broker configurations don't match the actual client secrets on the
# partner Keycloak instance. This script automates the synchronization.

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Load federation registry
REGISTRY_FILE="$PROJECT_ROOT/config/federation-registry.json"

if [[ ! -f "$REGISTRY_FILE" ]]; then
  echo -e "${RED}Error: Federation registry not found at ${REGISTRY_FILE}${NC}"
  echo "Create it first or run: ./scripts/federation/generate-tfvars.sh"
  exit 1
fi

SOURCE_FILTER="${1:-}"

echo -e "${CYAN}══════════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  DIVE V3 - Federation Client Secret Synchronization${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════════════════${NC}"
echo ""

# Parse instances from registry
INSTANCES=$(cat "$REGISTRY_FILE" | grep -oP '"[a-z]{3}":' | tr -d '":')

# Get admin token for an instance
get_admin_token() {
  local KEYCLOAK_URL="$1"
  local PASSWORD="${2:-admin}"
  
  curl -sk -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "username=admin" \
    -d "password=${PASSWORD}" \
    -d "grant_type=password" \
    -d "client_id=admin-cli" 2>/dev/null | grep -o '"access_token":"[^"]*' | cut -d'"' -f4
}

# Get client secret from a Keycloak instance
get_client_secret() {
  local KEYCLOAK_URL="$1"
  local TOKEN="$2"
  local CLIENT_ID="$3"
  
  # First get the internal client UUID
  local CLIENT_UUID=$(curl -sk "${KEYCLOAK_URL}/admin/realms/dive-v3-broker/clients?clientId=${CLIENT_ID}" \
    -H "Authorization: Bearer $TOKEN" 2>/dev/null | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
  
  if [[ -n "$CLIENT_UUID" && "$CLIENT_UUID" != "null" ]]; then
    # Then get the secret
    curl -sk "${KEYCLOAK_URL}/admin/realms/dive-v3-broker/clients/${CLIENT_UUID}/client-secret" \
      -H "Authorization: Bearer $TOKEN" 2>/dev/null | grep -o '"value":"[^"]*' | cut -d'"' -f4
  fi
}

# Update IdP broker secret
update_idp_secret() {
  local KEYCLOAK_URL="$1"
  local TOKEN="$2"
  local IDP_ALIAS="$3"
  local NEW_SECRET="$4"
  
  # Get current IdP config
  local IDP_CONFIG=$(curl -sk "${KEYCLOAK_URL}/admin/realms/dive-v3-broker/identity-provider/instances/${IDP_ALIAS}" \
    -H "Authorization: Bearer $TOKEN" 2>/dev/null)
  
  if [[ -z "$IDP_CONFIG" || "$IDP_CONFIG" == "null" ]]; then
    return 1
  fi
  
  # Update the secret in the config
  local UPDATED_CONFIG=$(echo "$IDP_CONFIG" | sed "s/\"clientSecret\":\"[^\"]*\"/\"clientSecret\":\"${NEW_SECRET}\"/g")
  
  # Push the updated config
  local HTTP_CODE=$(curl -sk -w "%{http_code}" -o /dev/null -X PUT \
    "${KEYCLOAK_URL}/admin/realms/dive-v3-broker/identity-provider/instances/${IDP_ALIAS}" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$UPDATED_CONFIG" 2>/dev/null)
  
  [[ "$HTTP_CODE" == "204" ]]
}

# Process each instance
echo -e "${BLUE}Step 1: Collecting client secrets from all instances${NC}"
echo ""

declare -A INSTANCE_URLS
declare -A INSTANCE_TOKENS
declare -A INSTANCE_SECRETS

# First pass: get tokens and collect secrets
for INSTANCE in $INSTANCES; do
  INSTANCE_UPPER=$(echo "$INSTANCE" | tr '[:lower:]' '[:upper:]')
  
  # Skip if filter specified and doesn't match
  if [[ -n "$SOURCE_FILTER" && "$INSTANCE" != "$SOURCE_FILTER" ]]; then
    continue
  fi
  
  # Get IdP URL from registry
  IDP_URL=$(cat "$REGISTRY_FILE" | grep -A5 "\"${INSTANCE}\":" | grep "idp_url" | grep -o 'https://[^"]*')
  
  if [[ -z "$IDP_URL" ]]; then
    echo -e "  ${YELLOW}⚠ Skipping ${INSTANCE_UPPER}: No IdP URL found${NC}"
    continue
  fi
  
  INSTANCE_URLS[$INSTANCE]="$IDP_URL"
  
  # Determine password (DEU uses 'admin', others use 'DivePilot2025!')
  if [[ "$INSTANCE" == "deu" ]]; then
    KC_PASSWORD="admin"
  else
    KC_PASSWORD="DivePilot2025!"
  fi
  
  # Try to get admin token
  echo -n "  ${INSTANCE_UPPER} (${IDP_URL}): "
  TOKEN=$(get_admin_token "$IDP_URL" "$KC_PASSWORD")
  
  if [[ -z "$TOKEN" || "$TOKEN" == "null" ]]; then
    echo -e "${YELLOW}No access (instance may be down)${NC}"
    continue
  fi
  
  INSTANCE_TOKENS[$INSTANCE]="$TOKEN"
  echo -e "${GREEN}✓ Connected${NC}"
  
  # Collect secrets for federation clients on this instance
  for PARTNER in $INSTANCES; do
    if [[ "$PARTNER" != "$INSTANCE" ]]; then
      CLIENT_ID="dive-v3-${PARTNER}-federation"
      SECRET=$(get_client_secret "$IDP_URL" "$TOKEN" "$CLIENT_ID")
      
      if [[ -n "$SECRET" && "$SECRET" != "null" ]]; then
        # Store as: INSTANCE_SECRETS[source_partner]=secret
        INSTANCE_SECRETS["${INSTANCE}_${PARTNER}"]="$SECRET"
        echo "    → ${CLIENT_ID}: $(echo "$SECRET" | head -c 8)..."
      fi
    fi
  done
done

echo ""
echo -e "${BLUE}Step 2: Synchronizing secrets to IdP broker configurations${NC}"
echo ""

# Second pass: update IdP broker configurations
for INSTANCE in $INSTANCES; do
  INSTANCE_UPPER=$(echo "$INSTANCE" | tr '[:lower:]' '[:upper:]')
  TOKEN="${INSTANCE_TOKENS[$INSTANCE]}"
  IDP_URL="${INSTANCE_URLS[$INSTANCE]}"
  
  if [[ -z "$TOKEN" ]]; then
    continue
  fi
  
  echo "  Updating ${INSTANCE_UPPER}:"
  
  for PARTNER in $INSTANCES; do
    if [[ "$PARTNER" != "$INSTANCE" ]]; then
      PARTNER_UPPER=$(echo "$PARTNER" | tr '[:lower:]' '[:upper:]')
      IDP_ALIAS="${PARTNER}-federation"
      
      # The secret we need is from the PARTNER's client for THIS instance
      SECRET="${INSTANCE_SECRETS[${PARTNER}_${INSTANCE}]}"
      
      if [[ -n "$SECRET" && "$SECRET" != "null" ]]; then
        if update_idp_secret "$IDP_URL" "$TOKEN" "$IDP_ALIAS" "$SECRET"; then
          echo -e "    → ${IDP_ALIAS}: ${GREEN}✓ Updated${NC}"
        else
          echo -e "    → ${IDP_ALIAS}: ${YELLOW}⚠ IdP not found or update failed${NC}"
        fi
      else
        echo -e "    → ${IDP_ALIAS}: ${YELLOW}⚠ No secret available (partner may be down)${NC}"
      fi
    fi
  done
done

echo ""
echo -e "${GREEN}══════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ Federation Secret Synchronization Complete${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${CYAN}Next Steps:${NC}"
echo "  1. Test federation by logging into each instance"
echo "  2. Verify with: ./scripts/federation/validate-federation.sh"
echo "  3. Monitor Keycloak logs for 'unauthorized_client' errors"
echo ""
echo -e "${YELLOW}Note: Run this script after any Keycloak restart or client regeneration${NC}"

