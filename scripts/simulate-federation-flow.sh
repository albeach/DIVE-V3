#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Simulate Complete Federation Flow
# =============================================================================
# Simulates the browser-based OIDC federation flow:
# 1. USA Hub → Redirect to GBR IdP
# 2. GBR IdP → User login
# 3. GBR IdP → Authorization code back to USA
# 4. USA Hub → Exchange code for token
# 5. USA Hub → Create/update federated user
# =============================================================================

set -e

LOG_FILE="/Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/.cursor/debug.log"

log_debug() {
  local step="$1"
  local location="$2"
  local message="$3"
  local data="$4"
  echo "{\"runId\":\"simulate\",\"step\":\"$step\",\"location\":\"$location\",\"message\":\"$message\",\"data\":$data,\"timestamp\":$(date +%s)000}" >> "$LOG_FILE"
}

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║       Simulating Federation Flow (Programmatic)              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# =============================================================================
# Step 1: Get USA Hub IdP configuration
# =============================================================================
echo "[Step 1/6] Retrieving USA Hub IdP configuration..."

USA_PASS="i8mE9Gjsg3x0KsCCZaG9tQ"
USA_TOKEN=$(docker exec dive-hub-keycloak curl -sk -X POST "https://localhost:8443/realms/master/protocol/openid-connect/token" -d "client_id=admin-cli" -d "username=admin" -d "password=${USA_PASS}" -d "grant_type=password" 2>/dev/null | jq -r '.access_token')

IDP_CONFIG=$(docker exec dive-hub-keycloak curl -sk -H "Authorization: Bearer $USA_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker/identity-provider/instances/gbr-idp" 2>/dev/null)

AUTH_URL=$(echo "$IDP_CONFIG" | jq -r '.config.authorizationUrl')
TOKEN_URL=$(echo "$IDP_CONFIG" | jq -r '.config.tokenUrl')
CLIENT_ID=$(echo "$IDP_CONFIG" | jq -r '.config.clientId')
CLIENT_SECRET=$(echo "$IDP_CONFIG" | jq -r '.config.clientSecret')

echo "  Authorization URL: $AUTH_URL"
echo "  Token URL: $TOKEN_URL"
echo "  Client ID: $CLIENT_ID"
echo "  Client Secret: ${CLIENT_SECRET:0:15}..."

log_debug "1" "config:28" "IdP configuration retrieved" "{\"authUrl\":\"$AUTH_URL\",\"tokenUrl\":\"$TOKEN_URL\",\"clientId\":\"$CLIENT_ID\"}"

# =============================================================================
# Step 2: Simulate browser authentication at GBR
# =============================================================================
echo ""
echo "[Step 2/6] Authenticating with GBR IdP..."

# We'll use the GBR realm's userinfo endpoint to verify user can authenticate
GBR_PASS="JvbyzBXVHVdf3ViAcieTMdpO"
GBR_TOKEN=$(docker exec gbr-keycloak-gbr-1 curl -sk -X POST "https://localhost:8443/realms/master/protocol/openid-connect/token" -d "client_id=admin-cli" -d "username=admin" -d "password=${GBR_PASS}" -d "grant_type=password" 2>/dev/null | jq -r '.access_token')

# Check if user exists and has attributes
USER_DATA=$(docker exec gbr-keycloak-gbr-1 curl -sk -H "Authorization: Bearer $GBR_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker-gbr/users?username=testuser-gbr-1&exact=true" 2>/dev/null)
USER_EXISTS=$(echo "$USER_DATA" | jq 'length')

if [ "$USER_EXISTS" == "0" ]; then
  echo "  ✗ testuser-gbr-1 NOT FOUND in GBR"
  log_debug "2" "auth:49" "User not found" "{\"username\":\"testuser-gbr-1\",\"critical\":true}"
  exit 1
fi

USER_EMAIL=$(echo "$USER_DATA" | jq -r '.[0].email')
USER_FIRST=$(echo "$USER_DATA" | jq -r '.[0].firstName')
USER_LAST=$(echo "$USER_DATA" | jq -r '.[0].lastName')

echo "  ✓ User found: $USER_EMAIL"
echo "  ✓ Profile: $USER_FIRST $USER_LAST"

log_debug "2" "auth:60" "User authenticated" "{\"email\":\"$USER_EMAIL\",\"firstName\":\"$USER_FIRST\",\"lastName\":\"$USER_LAST\"}"

# =============================================================================
# Step 3: Check GBR client configuration
# =============================================================================
echo ""
echo "[Step 3/6] Verifying GBR client configuration..."

GBR_CLIENT=$(docker exec gbr-keycloak-gbr-1 curl -sk -H "Authorization: Bearer $GBR_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker-gbr/clients?clientId=$CLIENT_ID" 2>/dev/null)
GBR_CLIENT_UUID=$(echo "$GBR_CLIENT" | jq -r '.[0].id')

if [ "$GBR_CLIENT_UUID" == "null" ] || [ -z "$GBR_CLIENT_UUID" ]; then
  echo "  ✗ Client $CLIENT_ID NOT FOUND in GBR"
  log_debug "3" "client:77" "Client not found" "{\"clientId\":\"$CLIENT_ID\",\"critical\":true}"
  exit 1
fi

GBR_CLIENT_SECRET=$(docker exec gbr-keycloak-gbr-1 curl -sk -H "Authorization: Bearer $GBR_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker-gbr/clients/${GBR_CLIENT_UUID}/client-secret" 2>/dev/null | jq -r '.value')

echo "  ✓ Client found: $GBR_CLIENT_UUID"
echo "  ✓ Client secret: ${GBR_CLIENT_SECRET:0:15}..."

# Check if secrets match
if [ "$CLIENT_SECRET" != "$GBR_CLIENT_SECRET" ]; then
  echo "  ✗ CRITICAL: Client secrets don't match!"
  echo "    USA IdP secret: ${CLIENT_SECRET:0:15}..."
  echo "    GBR client secret: ${GBR_CLIENT_SECRET:0:15}..."
  log_debug "3" "client:93" "Secret mismatch" "{\"match\":false,\"critical\":true}"
else
  echo "  ✓ Client secrets match"
  log_debug "3" "client:96" "Secret match" "{\"match\":true}"
fi

# Check protocol mappers
PROTOCOL_MAPPERS=$(docker exec gbr-keycloak-gbr-1 curl -sk -H "Authorization: Bearer $GBR_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker-gbr/clients/${GBR_CLIENT_UUID}/protocol-mappers/models" 2>/dev/null)
MAPPER_COUNT=$(echo "$PROTOCOL_MAPPERS" | jq 'length')

echo "  ✓ Protocol mappers: $MAPPER_COUNT"
log_debug "3" "client:105" "Protocol mappers checked" "{\"count\":$MAPPER_COUNT}"

# =============================================================================
# Step 4: Test token endpoint connectivity
# =============================================================================
echo ""
echo "[Step 4/6] Testing USA Hub → GBR connectivity..."

# From USA Hub container, can we reach GBR's token endpoint?
CONN_TEST=$(docker exec dive-hub-keycloak curl -sk --max-time 5 -o /dev/null -w "%{http_code}" "$TOKEN_URL" 2>/dev/null || echo "000")

if [ "$CONN_TEST" == "000" ]; then
  echo "  ✗ CRITICAL: Cannot reach GBR token endpoint from USA Hub"
  echo "    Token URL: $TOKEN_URL"
  log_debug "4" "connectivity:119" "Token endpoint unreachable" "{\"tokenUrl\":\"$TOKEN_URL\",\"httpCode\":\"000\",\"critical\":true}"
  
  # Try to diagnose network issue
  echo ""
  echo "  Diagnosing network issue..."
  docker exec dive-hub-keycloak ping -c 2 gbr-keycloak-gbr-1 2>&1 | tail -3
  
elif [ "$CONN_TEST" == "405" ] || [ "$CONN_TEST" == "400" ]; then
  echo "  ✓ Token endpoint reachable (HTTP $CONN_TEST - expected for GET request)"
  log_debug "4" "connectivity:129" "Token endpoint reachable" "{\"httpCode\":\"$CONN_TEST\"}"
else
  echo "  ⚠️ Token endpoint responded with HTTP $CONN_TEST"
  log_debug "4" "connectivity:132" "Token endpoint unexpected response" "{\"httpCode\":\"$CONN_TEST\"}"
fi

# =============================================================================
# Step 5: Check redirect URIs
# =============================================================================
echo ""
echo "[Step 5/6] Checking redirect URI configuration..."

REDIRECT_URIS=$(echo "$GBR_CLIENT" | jq -r '.[0].redirectUris[]')
EXPECTED_REDIRECT="https://localhost:8443/realms/dive-v3-broker/broker/gbr-idp/endpoint"

echo "  Configured redirect URIs:"
echo "$REDIRECT_URIS" | sed 's/^/    /'

if echo "$REDIRECT_URIS" | grep -q "gbr-idp/endpoint"; then
  echo "  ✓ gbr-idp redirect URI found"
  log_debug "5" "redirect:150" "Redirect URI configured" "{\"found\":true}"
else
  echo "  ✗ CRITICAL: Missing redirect URI for gbr-idp"
  echo "    Expected: $EXPECTED_REDIRECT"
  log_debug "5" "redirect:154" "Redirect URI missing" "{\"expected\":\"$EXPECTED_REDIRECT\",\"critical\":true}"
fi

# =============================================================================
# Step 6: Attempt token exchange simulation
# =============================================================================
echo ""
echo "[Step 6/6] Testing authorization code flow..."

# We can't get a real authorization code without browser, but we can test
# the token endpoint with client credentials to see if auth works
TEST_TOKEN=$(docker exec dive-hub-keycloak curl -sk -X POST "$TOKEN_URL" \
  -d "client_id=$CLIENT_ID" \
  -d "client_secret=$CLIENT_SECRET" \
  -d "grant_type=client_credentials" 2>/dev/null)

if echo "$TEST_TOKEN" | jq -e '.access_token' >/dev/null 2>&1; then
  echo "  ✓ Client authentication successful"
  log_debug "6" "token:175" "Client auth success" "{\"grantType\":\"client_credentials\",\"success\":true}"
elif echo "$TEST_TOKEN" | jq -e '.error' >/dev/null 2>&1; then
  ERROR=$(echo "$TEST_TOKEN" | jq -r '.error')
  ERROR_DESC=$(echo "$TEST_TOKEN" | jq -r '.error_description')
  echo "  ⚠️ Client auth test: $ERROR - $ERROR_DESC"
  log_debug "6" "token:181" "Client auth test" "{\"error\":\"$ERROR\",\"description\":\"$ERROR_DESC\"}"
else
  echo "  ⚠️ Unexpected response from token endpoint"
  log_debug "6" "token:184" "Unexpected token response" "{\"response\":\"unknown\"}"
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                 Simulation Complete                          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Check recent Keycloak logs for actual errors
echo "Checking recent USA Hub Keycloak logs for federation errors..."
RECENT_ERRORS=$(docker logs dive-hub-keycloak --since 5m 2>&1 | grep -i "gbr-idp\|IDENTITY_PROVIDER\|LOGIN_ERROR" | tail -10)

if [ -n "$RECENT_ERRORS" ]; then
  echo ""
  echo "Recent federation-related logs:"
  echo "════════════════════════════════════════════════════════════════"
  echo "$RECENT_ERRORS"
  echo ""
  
  # Parse and log specific errors
  if echo "$RECENT_ERRORS" | grep -q "error="; then
    LAST_ERROR=$(echo "$RECENT_ERRORS" | grep "error=" | tail -1 | grep -oP 'error="[^"]*"' | cut -d'"' -f2)
    echo "Last error: $LAST_ERROR"
    log_debug "summary" "logs:212" "Recent error found" "{\"error\":\"$LAST_ERROR\"}"
  fi
fi

echo ""
echo "Simulation log: $LOG_FILE"
echo "Run: ./scripts/analyze-federation-flow.sh to see detailed analysis"

