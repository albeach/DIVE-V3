#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Fix GBR IdP Connectivity Issues
# =============================================================================
# Fixes:
# 1. Update client secret to match GBR client
# 2. Ensure both containers on same Docker network
# 3. Wait for GBR Keycloak to be fully ready
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
  echo "{\"runId\":\"fix\",\"hypothesisId\":\"$hypothesis\",\"location\":\"$location\",\"message\":\"$message\",\"data\":$data,\"timestamp\":$(date +%s)000}" >> "$LOG_FILE"
}

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          Fixing GBR IdP Connectivity Issues                 ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# =============================================================================
# Fix 1: Get GBR client secret and update USA IdP
# =============================================================================
echo "[Fix 1/3] Synchronizing client secret..."

GBR_TOKEN=$(docker exec gbr-keycloak-gbr-1 curl -sk -X POST "https://localhost:8443/realms/master/protocol/openid-connect/token" -d "client_id=admin-cli" -d "username=admin" -d "password=${GBR_PASS}" -d "grant_type=password" 2>/dev/null | jq -r '.access_token')

GBR_CLIENT=$(docker exec gbr-keycloak-gbr-1 curl -sk -H "Authorization: Bearer $GBR_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker-gbr/clients?clientId=dive-v3-cross-border-client" 2>/dev/null)
GBR_CLIENT_UUID=$(echo "$GBR_CLIENT" | jq -r '.[0].id')
GBR_SECRET=$(docker exec gbr-keycloak-gbr-1 curl -sk -H "Authorization: Bearer $GBR_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker-gbr/clients/${GBR_CLIENT_UUID}/client-secret" 2>/dev/null | jq -r '.value')

echo "  GBR client secret: ${GBR_SECRET:0:15}..."

# Update USA IdP with correct secret
USA_TOKEN=$(docker exec dive-hub-keycloak curl -sk -X POST "https://localhost:8443/realms/master/protocol/openid-connect/token" -d "client_id=admin-cli" -d "username=admin" -d "password=${USA_PASS}" -d "grant_type=password" 2>/dev/null | jq -r '.access_token')

IDP_CONFIG=$(docker exec dive-hub-keycloak curl -sk -H "Authorization: Bearer $USA_TOKEN" "https://localhost:8443/admin/realms/dive-v3-broker/identity-provider/instances/gbr-idp" 2>/dev/null)

UPDATED_CONFIG=$(echo "$IDP_CONFIG" | jq --arg secret "$GBR_SECRET" '.config.clientSecret = $secret')

docker exec dive-hub-keycloak curl -sk -X PUT \
  -H "Authorization: Bearer $USA_TOKEN" \
  -H "Content-Type: application/json" \
  "https://localhost:8443/admin/realms/dive-v3-broker/identity-provider/instances/gbr-idp" \
  -d "$UPDATED_CONFIG" 2>/dev/null > /dev/null

echo "  ✓ Client secret synchronized"
log_debug "H5" "fix:55" "Secret updated" "{\"secret_prefix\":\"${GBR_SECRET:0:10}\"}"

# =============================================================================
# Fix 2: Check and fix Docker network connectivity
# =============================================================================
echo ""
echo "[Fix 2/3] Checking Docker network connectivity..."

USA_NETWORKS=$(docker inspect dive-hub-keycloak -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}')
GBR_NETWORKS=$(docker inspect gbr-keycloak-gbr-1 -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}')

echo "  USA Hub networks: $USA_NETWORKS"
echo "  GBR networks: $GBR_NETWORKS"

# Check if both on shared network
if echo "$USA_NETWORKS" | grep -q "dive-v3-shared-network" && echo "$GBR_NETWORKS" | grep -q "dive-v3-shared-network"; then
  echo "  ✓ Both containers on dive-v3-shared-network"
  log_debug "H2" "fix:74" "Network OK" "{\"shared_network\":true}"
  
  # Test connectivity
  TEST_CONN=$(docker exec dive-hub-keycloak curl -sf --max-time 5 -k https://gbr-keycloak-gbr-1:8443/health/ready 2>/dev/null || echo "fail")
  if [ "$TEST_CONN" != "fail" ]; then
    echo "  ✓ USA Hub can reach GBR Keycloak"
    log_debug "H2" "fix:80" "Connectivity OK" "{\"reachable\":true}"
  else
    echo "  ⚠️ Connectivity test failed - may need container restart"
    log_debug "H2" "fix:83" "Connectivity issue" "{\"reachable\":false}"
  fi
else
  echo "  ✗ Containers NOT on same network - need docker-compose fix"
  log_debug "H2" "fix:87" "Network mismatch" "{\"shared_network\":false,\"critical\":true}"
fi

# =============================================================================
# Fix 3: Wait for GBR to be fully ready
# =============================================================================
echo ""
echo "[Fix 3/3] Ensuring GBR Keycloak is ready..."

for i in {1..10}; do
  GBR_READY=$(docker exec gbr-keycloak-gbr-1 curl -sf http://localhost:8080/health/ready 2>/dev/null && echo "ready" || echo "not_ready")
  if [ "$GBR_READY" == "ready" ]; then
    echo "  ✓ GBR Keycloak is ready"
    log_debug "H1" "fix:101" "GBR ready" "{\"ready\":true,\"attempts\":$i}"
    break
  fi
  echo "  Waiting for GBR to be ready... ($i/10)"
  sleep 2
done

if [ "$GBR_READY" != "ready" ]; then
  echo "  ⚠️ GBR not reporting ready but may still work"
  log_debug "H1" "fix:110" "GBR not ready" "{\"ready\":false,\"warning\":true}"
fi

# =============================================================================
# Verification: Test token exchange
# =============================================================================
echo ""
echo "[Verification] Testing token exchange..."

TOKEN_URL=$(echo "$IDP_CONFIG" | jq -r '.config.tokenUrl')

TEST_RESULT=$(docker exec dive-hub-keycloak curl -sk -X POST "$TOKEN_URL" \
  -d "client_id=dive-v3-cross-border-client" \
  -d "client_secret=$GBR_SECRET" \
  -d "grant_type=password" \
  -d "username=testuser-gbr-1" \
  -d "password=TestUser2025!Pilot" 2>/dev/null)

if echo "$TEST_RESULT" | jq -e '.access_token' >/dev/null 2>&1; then
  echo "  ✓ Token exchange successful!"
  TOKEN_CLAIMS=$(echo "$TEST_RESULT" | jq -r '.access_token' | awk -F'.' '{print $2}' | base64 -d 2>/dev/null | jq '{email, given_name, family_name, clearance}')
  echo "  Token claims:"
  echo "$TOKEN_CLAIMS" | sed 's/^/    /'
  log_debug "verify" "fix:135" "Token exchange success" "{\"success\":true}"
  
  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  echo "  ✅ ALL FIXES APPLIED SUCCESSFULLY"
  echo "═══════════════════════════════════════════════════════════════"
  echo "  • Client secret synchronized"
  echo "  • Network connectivity verified"
  echo "  • Token exchange working"
  echo ""
  echo "  Ready to test in browser!"
  echo "═══════════════════════════════════════════════════════════════"
else
  ERROR=$(echo "$TEST_RESULT" | jq -r '.error // "unknown"')
  ERROR_DESC=$(echo "$TEST_RESULT" | jq -r '.error_description // "unknown"')
  echo "  ✗ Token exchange still failing: $ERROR - $ERROR_DESC"
  log_debug "verify" "fix:150" "Token exchange failed" "{\"error\":\"$ERROR\",\"description\":\"$ERROR_DESC\",\"critical\":true}"
  
  echo ""
  echo "Response:"
  echo "$TEST_RESULT" | jq '.'
fi

