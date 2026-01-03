#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Debug GBR IdP Connectivity Issue
# =============================================================================
# Hypotheses:
# H1: GBR Keycloak is down/unhealthy
# H2: Network connectivity issue
# H3: Wrong URLs in IdP configuration
# H4: SSL/TLS certificate validation failing
# H5: Client secret mismatch
# =============================================================================

set -e

LOG_FILE="/Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3/.cursor/debug.log"
USA_PASS="i8mE9Gjsg3x0KsCCZaG9tQ"
GBR_PASS="JvbyzBXVHVdf3ViAcieTMdpO"

log_debug() {
  local hypothesis="$1"
  local location="$2"
  local message="$3"
  local data="$4"
  echo "{\"runId\":\"connectivity\",\"hypothesisId\":\"$hypothesis\",\"location\":\"$location\",\"message\":\"$message\",\"data\":$data,\"timestamp\":$(date +%s)000}" >> "$LOG_FILE"
}

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║      Debug: Identity Provider Unavailable Error             ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# =============================================================================
# H1: Check GBR Keycloak health
# =============================================================================
echo "[H1: Container Health] Checking GBR Keycloak status..."
GBR_STATUS=$(docker ps --filter "name=gbr-keycloak-gbr-1" --format "{{.Status}}")
GBR_RUNNING=$(echo "$GBR_STATUS" | grep -c "Up" || echo "0")

if [ "$GBR_RUNNING" == "0" ]; then
  echo "  ✗ GBR Keycloak NOT RUNNING"
  log_debug "H1" "check:10" "GBR Keycloak down" "{\"status\":\"stopped\",\"critical\":true}"
  exit 1
else
  echo "  ✓ GBR Keycloak running: $GBR_STATUS"
  log_debug "H1" "check:15" "GBR Keycloak running" "{\"status\":\"$GBR_STATUS\"}"
fi

# Test GBR health endpoint
GBR_HEALTH=$(docker exec gbr-keycloak-gbr-1 curl -sf http://localhost:8080/health/ready 2>/dev/null || echo "unhealthy")
if [ "$GBR_HEALTH" == "unhealthy" ]; then
  echo "  ✗ GBR Keycloak not ready"
  log_debug "H1" "check:22" "GBR Keycloak unhealthy" "{\"health\":\"not_ready\",\"critical\":true}"
else
  echo "  ✓ GBR Keycloak healthy"
  log_debug "H1" "check:25" "GBR Keycloak healthy" "{\"health\":\"ready\"}"
fi

# =============================================================================
# H2: Check network connectivity
# =============================================================================
echo ""
echo "[H2: Network] Testing connectivity USA → GBR..."

# Can USA Hub reach GBR via internal hostname?
USA_TO_GBR=$(docker exec dive-hub-keycloak curl -sf --max-time 5 https://gbr-keycloak-gbr-1:8443/realms/dive-v3-broker-gbr/.well-known/openid-configuration 2>/dev/null || echo "unreachable")

if [ "$USA_TO_GBR" == "unreachable" ]; then
  echo "  ✗ CRITICAL: USA Hub cannot reach GBR internal hostname"
  log_debug "H2" "check:37" "Network unreachable" "{\"target\":\"gbr-keycloak-gbr-1:8443\",\"reachable\":false,\"critical\":true}"
  
  # Try to diagnose
  echo "  Checking Docker network..."
  USA_NETWORK=$(docker inspect dive-hub-keycloak -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}')
  GBR_NETWORK=$(docker inspect gbr-keycloak-gbr-1 -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}')
  echo "    USA Hub networks: $USA_NETWORK"
  echo "    GBR networks: $GBR_NETWORK"
  log_debug "H2" "check:47" "Network diagnosis" "{\"usa_networks\":\"$USA_NETWORK\",\"gbr_networks\":\"$GBR_NETWORK\"}"
else
  echo "  ✓ USA Hub can reach GBR internal hostname"
  ISSUER=$(echo "$USA_TO_GBR" | jq -r '.issuer')
  echo "    Issuer: $ISSUER"
  log_debug "H2" "check:52" "Network reachable" "{\"target\":\"gbr-keycloak-gbr-1:8443\",\"reachable\":true,\"issuer\":\"$ISSUER\"}"
fi

# =============================================================================
# H3: Check IdP configuration URLs
# =============================================================================
echo ""
echo "[H3: IdP Config] Checking gbr-idp URLs..."

USA_TOKEN=$(docker exec dive-hub-keycloak curl -sk -X POST "https://localhost:8443/realms/master/protocol/openid-connect/token" -d "client_id=admin-cli" -d "username=admin" -d "password=${USA_PASS}" -d "grant_type=password" 2>/dev/null | jq -r '.access_token')

IDP_CONFIG=$(docker exec dive-hub-keycloak curl -sk -H "Authorization: Bearer $USA_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker/identity-provider/instances/gbr-idp" 2>/dev/null)

AUTH_URL=$(echo "$IDP_CONFIG" | jq -r '.config.authorizationUrl')
TOKEN_URL=$(echo "$IDP_CONFIG" | jq -r '.config.tokenUrl')
ISSUER=$(echo "$IDP_CONFIG" | jq -r '.config.issuer')

echo "  Authorization URL: $AUTH_URL"
echo "  Token URL: $TOKEN_URL"
echo "  Issuer: $ISSUER"

log_debug "H3" "check:76" "IdP URLs" "{\"authUrl\":\"$AUTH_URL\",\"tokenUrl\":\"$TOKEN_URL\",\"issuer\":\"$ISSUER\"}"

# Check for URL mismatch (browser vs internal)
if [[ "$AUTH_URL" == *"gbr-keycloak-gbr-1"* ]]; then
  echo "  ✗ ERROR: Authorization URL uses internal hostname (browser cannot reach)"
  log_debug "H3" "check:82" "Authorization URL wrong" "{\"url\":\"$AUTH_URL\",\"issue\":\"internal_hostname_in_browser_url\",\"critical\":true}"
fi

if [[ "$TOKEN_URL" == *"localhost"* ]]; then
  echo "  ✗ ERROR: Token URL uses localhost (container cannot reach)"
  log_debug "H3" "check:87" "Token URL wrong" "{\"url\":\"$TOKEN_URL\",\"issue\":\"localhost_in_container_url\",\"critical\":true}"
fi

# =============================================================================
# H4: Check SSL/TLS settings
# =============================================================================
echo ""
echo "[H4: SSL/TLS] Checking certificate validation..."

VALIDATE_SIG=$(echo "$IDP_CONFIG" | jq -r '.config.validateSignature')
DISABLE_TRUST=$(echo "$IDP_CONFIG" | jq -r '.config."disable-trust-manager"')

echo "  Validate Signature: $VALIDATE_SIG"
echo "  Disable Trust Manager: $DISABLE_TRUST"

if [ "$VALIDATE_SIG" == "true" ]; then
  echo "  ⚠️ WARNING: Signature validation enabled (may fail with self-signed certs)"
  log_debug "H4" "check:106" "SSL validation" "{\"validateSignature\":true,\"warning\":true}"
fi

if [ "$DISABLE_TRUST" != "true" ]; then
  echo "  ✗ ERROR: Trust manager not disabled (will fail with self-signed certs)"
  log_debug "H4" "check:111" "Trust manager enabled" "{\"disableTrustManager\":false,\"critical\":true}"
fi

# =============================================================================
# H5: Check client secret
# =============================================================================
echo ""
echo "[H5: Client Auth] Checking client secret..."

CLIENT_SECRET=$(echo "$IDP_CONFIG" | jq -r '.config.clientSecret')
echo "  Client secret (USA IdP): ${CLIENT_SECRET:0:10}..."

# Get GBR client secret
GBR_TOKEN=$(docker exec gbr-keycloak-gbr-1 curl -sk -X POST "https://localhost:8443/realms/master/protocol/openid-connect/token" -d "client_id=admin-cli" -d "username=admin" -d "password=${GBR_PASS}" -d "grant_type=password" 2>/dev/null | jq -r '.access_token')

GBR_CLIENT=$(docker exec gbr-keycloak-gbr-1 curl -sk -H "Authorization: Bearer $GBR_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker-gbr/clients?clientId=dive-v3-cross-border-client" 2>/dev/null)
GBR_CLIENT_UUID=$(echo "$GBR_CLIENT" | jq -r '.[0].id')
GBR_SECRET=$(docker exec gbr-keycloak-gbr-1 curl -sk -H "Authorization: Bearer $GBR_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker-gbr/clients/${GBR_CLIENT_UUID}/client-secret" 2>/dev/null | jq -r '.value')

echo "  Client secret (GBR client): ${GBR_SECRET:0:10}..."

if [ "$CLIENT_SECRET" != "$GBR_SECRET" ]; then
  echo "  ✗ CRITICAL: Client secrets DO NOT MATCH"
  log_debug "H5" "check:137" "Secret mismatch" "{\"usa_secret\":\"${CLIENT_SECRET:0:10}...\",\"gbr_secret\":\"${GBR_SECRET:0:10}...\",\"match\":false,\"critical\":true}"
else
  echo "  ✓ Client secrets match"
  log_debug "H5" "check:140" "Secret match" "{\"match\":true}"
fi

# =============================================================================
# Test token exchange
# =============================================================================
echo ""
echo "[Token Test] Attempting token exchange..."

TEST_RESULT=$(docker exec dive-hub-keycloak curl -sk -X POST "$TOKEN_URL" \
  -d "client_id=dive-v3-cross-border-client" \
  -d "client_secret=$CLIENT_SECRET" \
  -d "grant_type=password" \
  -d "username=testuser-gbr-1" \
  -d "password=TestUser2025!Pilot" 2>/dev/null)

if echo "$TEST_RESULT" | jq -e '.access_token' >/dev/null 2>&1; then
  echo "  ✓ Token exchange successful"
  log_debug "H2" "check:158" "Token exchange success" "{\"success\":true}"
else
  ERROR=$(echo "$TEST_RESULT" | jq -r '.error // "unknown"')
  ERROR_DESC=$(echo "$TEST_RESULT" | jq -r '.error_description // "unknown"')
  echo "  ✗ Token exchange failed: $ERROR - $ERROR_DESC"
  log_debug "H2" "check:163" "Token exchange failed" "{\"error\":\"$ERROR\",\"description\":\"$ERROR_DESC\",\"critical\":true}"
fi

echo ""
echo "Debug complete - check debug.log for evidence"
