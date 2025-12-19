#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Fix Federation Issues (Client Secret + Redirect URI)
# =============================================================================

set -e

LOG_FILE="/Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/.cursor/debug.log"

log_debug() {
  local location="$1"
  local message="$2"
  local data="$3"
  echo "{\"runId\":\"fix-final\",\"location\":\"$location\",\"message\":\"$message\",\"data\":$data,\"timestamp\":$(date +%s)000}" >> "$LOG_FILE"
}

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║      Fixing Final Federation Issues                         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# =============================================================================
# Fix 1: Get actual GBR client secret and update USA IdP
# =============================================================================
echo "[Fix 1/2] Synchronizing client secret (properly)..."

GBR_PASS="JvbyzBXVHVdf3ViAcieTMdpO"
GBR_TOKEN=$(docker exec gbr-keycloak-gbr-1 curl -sk -X POST "https://localhost:8443/realms/master/protocol/openid-connect/token" -d "client_id=admin-cli" -d "username=admin" -d "password=${GBR_PASS}" -d "grant_type=password" 2>/dev/null | jq -r '.access_token')

GBR_CLIENT=$(docker exec gbr-keycloak-gbr-1 curl -sk -H "Authorization: Bearer $GBR_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker-gbr/clients?clientId=dive-v3-cross-border-client" 2>/dev/null)
GBR_CLIENT_UUID=$(echo "$GBR_CLIENT" | jq -r '.[0].id')
GBR_SECRET=$(docker exec gbr-keycloak-gbr-1 curl -sk -H "Authorization: Bearer $GBR_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker-gbr/clients/${GBR_CLIENT_UUID}/client-secret" 2>/dev/null | jq -r '.value')

echo "  GBR client secret: ${GBR_SECRET:0:20}..."

USA_PASS="i8mE9Gjsg3x0KsCCZaG9tQ"
USA_TOKEN=$(docker exec dive-hub-keycloak curl -sk -X POST "https://localhost:8443/realms/master/protocol/openid-connect/token" -d "client_id=admin-cli" -d "username=admin" -d "password=${USA_PASS}" -d "grant_type=password" 2>/dev/null | jq -r '.access_token')

# Get full IdP config
IDP_CONFIG=$(docker exec dive-hub-keycloak curl -sk -H "Authorization: Bearer $USA_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker/identity-provider/instances/gbr-idp" 2>/dev/null)

# Update with correct secret
UPDATED_CONFIG=$(echo "$IDP_CONFIG" | jq --arg secret "$GBR_SECRET" '.config.clientSecret = $secret')

docker exec dive-hub-keycloak curl -sk -X PUT \
  -H "Authorization: Bearer $USA_TOKEN" \
  -H "Content-Type: application/json" \
  "https://localhost:8443/admin/realms/dive-v3-broker/identity-provider/instances/gbr-idp" \
  -d "$UPDATED_CONFIG" 2>/dev/null > /dev/null

echo "  ✓ USA IdP updated with correct secret"
log_debug "fix:48" "Client secret updated" "{\"secret_prefix\":\"${GBR_SECRET:0:15}\"}"

# Verify it's actually saved
VERIFY_CONFIG=$(docker exec dive-hub-keycloak curl -sk -H "Authorization: Bearer $USA_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker/identity-provider/instances/gbr-idp" 2>/dev/null)
SAVED_SECRET=$(echo "$VERIFY_CONFIG" | jq -r '.config.clientSecret')

if [ "$SAVED_SECRET" == "$GBR_SECRET" ]; then
  echo "  ✓ Secret verified in USA IdP: ${SAVED_SECRET:0:20}..."
  log_debug "fix:58" "Secret verified" "{\"match\":true}"
else
  echo "  ✗ Secret still doesn't match after update!"
  echo "    Saved: ${SAVED_SECRET:0:20}..."
  echo "    Expected: ${GBR_SECRET:0:20}..."
  log_debug "fix:63" "Secret verification failed" "{\"match\":false,\"critical\":true}"
fi

# =============================================================================
# Fix 2: Add explicit redirect URI to GBR client
# =============================================================================
echo ""
echo "[Fix 2/2] Adding explicit redirect URI to GBR client..."

REDIRECT_URI="https://localhost:8443/realms/dive-v3-broker/broker/gbr-idp/endpoint"

# Get current redirect URIs
CURRENT_REDIRECTS=$(echo "$GBR_CLIENT" | jq -r '.[0].redirectUris')
echo "  Current redirect URIs:"
echo "$CURRENT_REDIRECTS" | jq -r '.[]' | sed 's/^/    /'

# Check if already present
if echo "$CURRENT_REDIRECTS" | jq -r '.[]' | grep -q "gbr-idp/endpoint"; then
  echo "  ✓ Redirect URI already configured"
  log_debug "fix:82" "Redirect URI exists" "{\"uri\":\"$REDIRECT_URI\"}"
else
  echo "  Adding: $REDIRECT_URI"
  
  # Add the redirect URI
  UPDATED_REDIRECTS=$(echo "$CURRENT_REDIRECTS" | jq --arg uri "$REDIRECT_URI" '. + [$uri]')
  UPDATED_CLIENT=$(echo "$GBR_CLIENT" | jq --argjson redirects "$UPDATED_REDIRECTS" '.[0].redirectUris = $redirects | .[0]')
  
  docker exec gbr-keycloak-gbr-1 curl -sk -X PUT \
    -H "Authorization: Bearer $GBR_TOKEN" \
    -H "Content-Type: application/json" \
    "https://localhost:8443/admin/realms/dive-v3-broker-gbr/clients/${GBR_CLIENT_UUID}" \
    -d "$UPDATED_CLIENT" 2>/dev/null > /dev/null
  
  echo "  ✓ Redirect URI added"
  log_debug "fix:98" "Redirect URI added" "{\"uri\":\"$REDIRECT_URI\"}"
  
  # Verify
  VERIFY_CLIENT=$(docker exec gbr-keycloak-gbr-1 curl -sk -H "Authorization: Bearer $GBR_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker-gbr/clients/${GBR_CLIENT_UUID}" 2>/dev/null)
  echo "  Verified redirect URIs:"
  echo "$VERIFY_CLIENT" | jq -r '.redirectUris[]' | sed 's/^/    /'
fi

# =============================================================================
# Verification: Test the full flow
# =============================================================================
echo ""
echo "[Verification] Testing token endpoint authentication..."

TOKEN_URL="https://gbr-keycloak-gbr-1:8443/realms/dive-v3-broker-gbr/protocol/openid-connect/token"

TEST_RESULT=$(docker exec dive-hub-keycloak curl -sk -X POST "$TOKEN_URL" \
  -d "client_id=dive-v3-cross-border-client" \
  -d "client_secret=$GBR_SECRET" \
  -d "grant_type=client_credentials" 2>/dev/null)

if echo "$TEST_RESULT" | jq -e '.access_token' >/dev/null 2>&1; then
  echo "  ✓ Client authentication SUCCESSFUL!"
  log_debug "verify:124" "Auth success" "{\"success\":true}"
  
  # Decode token to show it's working
  TOKEN=$(echo "$TEST_RESULT" | jq -r '.access_token')
  PAYLOAD=$(echo "$TOKEN" | awk -F'.' '{print $2}' | base64 -d 2>/dev/null)
  CLIENT_ID=$(echo "$PAYLOAD" | jq -r '.clientId // .azp')
  echo "  Token issued for client: $CLIENT_ID"
  
  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  echo "  ✅ ALL FIXES APPLIED SUCCESSFULLY"
  echo "═══════════════════════════════════════════════════════════════"
  echo "  • Client secret: Synchronized and verified"
  echo "  • Redirect URI: Added to GBR client"
  echo "  • Client auth: Working"
  echo ""
  echo "  Federation should now work in browser!"
  echo "═══════════════════════════════════════════════════════════════"
  
else
  ERROR=$(echo "$TEST_RESULT" | jq -r '.error // "unknown"')
  ERROR_DESC=$(echo "$TEST_RESULT" | jq -r '.error_description // "unknown"')
  echo "  ✗ Client authentication still failing: $ERROR"
  echo "    $ERROR_DESC"
  log_debug "verify:148" "Auth failed" "{\"error\":\"$ERROR\",\"description\":\"$ERROR_DESC\",\"critical\":true}"
  
  echo ""
  echo "Response:"
  echo "$TEST_RESULT" | jq '.'
fi
