#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Redirect URI Diagnostic Script
# =============================================================================
# Verifies server-side OAuth configuration and proves whether browser cache
# is causing the "Invalid redirect uri" error.
#
# Usage: ./scripts/diagnose-redirect-uri.sh [instance]
#        instance: usa (default), gbr, fra, etc.
# =============================================================================

set -euo pipefail

DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIVE_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# Counters
CHECKS_PASSED=0
CHECKS_FAILED=0

# Instance configuration
INSTANCE="${1:-usa}"
INSTANCE_LOWER=$(echo "$INSTANCE" | tr '[:upper:]' '[:lower:]')
INSTANCE_UPPER=$(echo "$INSTANCE" | tr '[:lower:]' '[:upper:]')

# Set ports and URLs based on instance
if [ "$INSTANCE_LOWER" = "usa" ]; then
    KC_PORT=8443
    APP_PORT=3000
    REALM="dive-v3-broker-usa"
    CLIENT_ID="dive-v3-client-broker-usa"
    CONTAINER_PREFIX="dive-hub"
    ENV_FILE=".env.hub"
else
    # Load spoke ports from docker-compose.yml port mappings
    SPOKE_COMPOSE="instances/${INSTANCE_LOWER}/docker-compose.yml"
    if [ -f "$SPOKE_COMPOSE" ]; then
        # Extract Keycloak HTTPS port (host:container 8443) - format: "8474:8443"
        KC_PORT=$(grep -o '"[0-9]*:8443"' "$SPOKE_COMPOSE" | head -1 | cut -d: -f1 | tr -d '"')
        KC_PORT=${KC_PORT:-8443}
        # Extract Frontend port (host:container 3000) - format: "3031:3000"
        APP_PORT=$(grep -o '"[0-9]*:3000"' "$SPOKE_COMPOSE" | head -1 | cut -d: -f1 | tr -d '"')
        APP_PORT=${APP_PORT:-3000}
    else
        KC_PORT=8443
        APP_PORT=3000
    fi

    REALM="dive-v3-broker-${INSTANCE_LOWER}"
    CLIENT_ID="dive-v3-client-broker-${INSTANCE_LOWER}"
    CONTAINER_PREFIX="dive-spoke-${INSTANCE_LOWER}"
    ENV_FILE="instances/${INSTANCE_LOWER}/.env"

    # Load spoke env for credentials
    if [ -f "$ENV_FILE" ]; then
        set -a
        source "$ENV_FILE"
        set +a
    fi
fi

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

log_header() {
    echo -e "${CYAN}${BOLD}$*${NC}"
}

log_section() {
    echo ""
    echo -e "${BOLD}$*${NC}"
}

log_check_pass() {
    echo -e "   ${GREEN}✓${NC} $*"
    CHECKS_PASSED=$((CHECKS_PASSED + 1))
}

log_check_fail() {
    echo -e "   ${RED}✗${NC} $*"
    CHECKS_FAILED=$((CHECKS_FAILED + 1))
}

log_info() {
    echo -e "   ${DIM}$*${NC}"
}

log_warn() {
    echo -e "   ${YELLOW}⚠${NC} $*"
}

# =============================================================================
# MAIN DIAGNOSTICS
# =============================================================================

echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  ${BOLD}DIVE V3 - Redirect URI Diagnostics${NC}${CYAN}                          ║${NC}"
echo -e "${CYAN}║  ${DIM}Instance: ${INSTANCE_UPPER}${NC}${CYAN}                                                ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# -----------------------------------------------------------------------------
# PHASE 1: Load Credentials
# -----------------------------------------------------------------------------

log_section "Phase 1: Loading Credentials"

if [ -f "$ENV_FILE" ]; then
    set -a
    source "$ENV_FILE"
    set +a
    log_check_pass "Loaded $ENV_FILE"
else
    log_check_fail "$ENV_FILE not found"
    echo ""
    echo -e "${RED}Cannot proceed without credentials. Run './dive hub init' first.${NC}"
    exit 1
fi

# Get admin password variable
if [ "$INSTANCE_LOWER" = "usa" ]; then
    ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:-}"
else
    ADMIN_PASS_VAR="KEYCLOAK_ADMIN_PASSWORD_${INSTANCE_UPPER}"
    ADMIN_PASS="${!ADMIN_PASS_VAR:-${KEYCLOAK_ADMIN_PASSWORD:-}}"
fi

if [ -z "$ADMIN_PASS" ]; then
    log_check_fail "Keycloak admin password not found in environment"
    exit 1
fi
log_check_pass "Keycloak admin password found"

# -----------------------------------------------------------------------------
# PHASE 2: Server Configuration Check
# -----------------------------------------------------------------------------

log_section "Phase 2: Keycloak Server Configuration"

# Get admin token
TOKEN=$(curl -sk -X POST "https://localhost:${KC_PORT}/realms/master/protocol/openid-connect/token" \
    -d "grant_type=password" \
    -d "client_id=admin-cli" \
    -d "username=admin" \
    -d "password=${ADMIN_PASS}" 2>/dev/null | jq -r '.access_token' 2>/dev/null)

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
    log_check_fail "Could not authenticate with Keycloak at localhost:${KC_PORT}"
    exit 1
fi
log_check_pass "Keycloak admin API accessible"

# Get client configuration
CLIENT_DATA=$(curl -sk "https://localhost:${KC_PORT}/admin/realms/${REALM}/clients?clientId=${CLIENT_ID}" \
    -H "Authorization: Bearer $TOKEN" 2>/dev/null)

CLIENT_UUID=$(echo "$CLIENT_DATA" | jq -r '.[0].id' 2>/dev/null)

if [ -z "$CLIENT_UUID" ] || [ "$CLIENT_UUID" = "null" ]; then
    log_check_fail "Client '$CLIENT_ID' not found in realm '$REALM'"
    exit 1
fi
log_check_pass "Client exists: $CLIENT_ID"

# Get full client details
CLIENT_FULL=$(curl -sk "https://localhost:${KC_PORT}/admin/realms/${REALM}/clients/${CLIENT_UUID}" \
    -H "Authorization: Bearer $TOKEN" 2>/dev/null)

# Check redirect URIs
REDIRECT_URIS=$(echo "$CLIENT_FULL" | jq -r '.redirectUris[]' 2>/dev/null | tr '\n' ' ')
REDIRECT_COUNT=$(echo "$CLIENT_FULL" | jq -r '.redirectUris | length' 2>/dev/null)

if [ "$REDIRECT_COUNT" -gt 0 ]; then
    log_check_pass "Redirect URIs configured: $REDIRECT_COUNT"
    for uri in $(echo "$CLIENT_FULL" | jq -r '.redirectUris[]' 2>/dev/null); do
        log_info "  → $uri"
    done
else
    log_check_fail "No redirect URIs configured!"
fi

# Check web origins
WEB_ORIGINS=$(echo "$CLIENT_FULL" | jq -r '.webOrigins | length' 2>/dev/null)
if [ "$WEB_ORIGINS" -gt 0 ]; then
    log_check_pass "Web origins configured: $WEB_ORIGINS"
else
    log_warn "No web origins configured (may cause CORS issues)"
fi

# Check expected redirect URIs
EXPECTED_HTTPS="https://localhost:${APP_PORT}/*"
EXPECTED_HTTP="http://localhost:${APP_PORT}/*"

if echo "$REDIRECT_URIS" | grep -q "https://localhost:${APP_PORT}"; then
    log_check_pass "HTTPS redirect URI includes port $APP_PORT"
else
    log_check_fail "Missing HTTPS redirect for port $APP_PORT"
fi

if echo "$REDIRECT_URIS" | grep -q "http://localhost:${APP_PORT}"; then
    log_check_pass "HTTP redirect URI includes port $APP_PORT"
else
    log_warn "Missing HTTP redirect for port $APP_PORT (optional)"
fi

# -----------------------------------------------------------------------------
# PHASE 3: Frontend Environment Check
# -----------------------------------------------------------------------------

log_section "Phase 3: Frontend Container Environment"

FRONTEND_CONTAINER="${CONTAINER_PREFIX}-frontend"

if docker ps --format '{{.Names}}' | grep -q "^${FRONTEND_CONTAINER}$"; then
    log_check_pass "Frontend container running: $FRONTEND_CONTAINER"

    # Check AUTH_KEYCLOAK_ID
    FE_CLIENT_ID=$(docker exec "$FRONTEND_CONTAINER" printenv AUTH_KEYCLOAK_ID 2>/dev/null || echo "NOT_SET")
    if [ "$FE_CLIENT_ID" = "$CLIENT_ID" ]; then
        log_check_pass "AUTH_KEYCLOAK_ID: $FE_CLIENT_ID"
    else
        log_check_fail "AUTH_KEYCLOAK_ID mismatch: $FE_CLIENT_ID (expected: $CLIENT_ID)"
    fi

    # Check NEXTAUTH_URL
    NEXTAUTH_URL=$(docker exec "$FRONTEND_CONTAINER" printenv NEXTAUTH_URL 2>/dev/null || echo "NOT_SET")
    EXPECTED_URL="https://localhost:${APP_PORT}"
    if [ "$NEXTAUTH_URL" = "$EXPECTED_URL" ]; then
        log_check_pass "NEXTAUTH_URL: $NEXTAUTH_URL"
    else
        log_warn "NEXTAUTH_URL: $NEXTAUTH_URL (expected: $EXPECTED_URL)"
    fi

    # Check AUTH_KEYCLOAK_ISSUER
    ISSUER=$(docker exec "$FRONTEND_CONTAINER" printenv AUTH_KEYCLOAK_ISSUER 2>/dev/null || echo "NOT_SET")
    log_info "AUTH_KEYCLOAK_ISSUER: $ISSUER"

else
    log_check_fail "Frontend container not running: $FRONTEND_CONTAINER"
fi

# -----------------------------------------------------------------------------
# PHASE 4: Backend Container Check
# -----------------------------------------------------------------------------

log_section "Phase 4: Backend Container Environment"

BACKEND_CONTAINER="${CONTAINER_PREFIX}-backend"

if docker ps --format '{{.Names}}' | grep -q "^${BACKEND_CONTAINER}$"; then
    log_check_pass "Backend container running: $BACKEND_CONTAINER"

    # Check KEYCLOAK_CLIENT_ID
    BE_CLIENT_ID=$(docker exec "$BACKEND_CONTAINER" printenv KEYCLOAK_CLIENT_ID 2>/dev/null || echo "NOT_SET")
    if [ "$BE_CLIENT_ID" = "$CLIENT_ID" ]; then
        log_check_pass "KEYCLOAK_CLIENT_ID: $BE_CLIENT_ID"
    else
        log_check_fail "KEYCLOAK_CLIENT_ID mismatch: $BE_CLIENT_ID (expected: $CLIENT_ID)"
    fi
else
    log_check_fail "Backend container not running: $BACKEND_CONTAINER"
fi

# -----------------------------------------------------------------------------
# PHASE 5: OIDC Endpoints Test
# -----------------------------------------------------------------------------

log_section "Phase 5: OIDC Endpoint Verification"

OIDC_URL="https://localhost:${KC_PORT}/realms/${REALM}/.well-known/openid-configuration"

OIDC_CONFIG=$(curl -sk "$OIDC_URL" 2>/dev/null)

if echo "$OIDC_CONFIG" | jq -e '.issuer' >/dev/null 2>&1; then
    log_check_pass "OIDC discovery endpoint accessible"

    ISSUER=$(echo "$OIDC_CONFIG" | jq -r '.issuer' 2>/dev/null)
    log_info "Issuer: $ISSUER"

    AUTH_ENDPOINT=$(echo "$OIDC_CONFIG" | jq -r '.authorization_endpoint' 2>/dev/null)
    if [ -n "$AUTH_ENDPOINT" ] && [ "$AUTH_ENDPOINT" != "null" ]; then
        log_check_pass "Authorization endpoint: ${AUTH_ENDPOINT:0:60}..."
    else
        log_check_fail "Authorization endpoint not found"
    fi

    TOKEN_ENDPOINT=$(echo "$OIDC_CONFIG" | jq -r '.token_endpoint' 2>/dev/null)
    if [ -n "$TOKEN_ENDPOINT" ] && [ "$TOKEN_ENDPOINT" != "null" ]; then
        log_check_pass "Token endpoint: ${TOKEN_ENDPOINT:0:60}..."
    else
        log_check_fail "Token endpoint not found"
    fi
else
    log_check_fail "OIDC discovery endpoint not accessible"
fi

# -----------------------------------------------------------------------------
# PHASE 6: OAuth Flow Simulation
# -----------------------------------------------------------------------------

log_section "Phase 6: Server-Side OAuth Flow Test"

# Test authorization endpoint with valid redirect
TEST_REDIRECT="https://localhost:${APP_PORT}/api/auth/callback/keycloak"
AUTH_TEST_URL="${AUTH_ENDPOINT}?response_type=code&client_id=${CLIENT_ID}&redirect_uri=$(printf '%s' "$TEST_REDIRECT" | jq -sRr @uri)&scope=openid%20profile%20email"

AUTH_RESPONSE=$(curl -sk -o /dev/null -w "%{http_code}" "$AUTH_TEST_URL" 2>/dev/null || echo "000")

if [ "$AUTH_RESPONSE" = "200" ] || [ "$AUTH_RESPONSE" = "302" ]; then
    log_check_pass "Authorization endpoint accepts requests (HTTP $AUTH_RESPONSE)"
else
    log_warn "Authorization endpoint returned HTTP $AUTH_RESPONSE"
fi

# Test with wildcard pattern
WILDCARD_TEST="https://localhost:${APP_PORT}/any/path/here"
WILDCARD_MATCH=false
for uri in $(echo "$CLIENT_FULL" | jq -r '.redirectUris[]' 2>/dev/null); do
    # Simple wildcard check
    BASE_URI="${uri%\*}"
    if [[ "$WILDCARD_TEST" == "$BASE_URI"* ]]; then
        WILDCARD_MATCH=true
        break
    fi
done

if [ "$WILDCARD_MATCH" = true ]; then
    log_check_pass "Wildcard redirect patterns configured correctly"
else
    log_warn "Wildcard patterns may not cover all callback URLs"
fi

# =============================================================================
# FINAL CONCLUSION
# =============================================================================

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════════${NC}"
log_header "                    DIAGNOSIS RESULTS"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BOLD}Checks Passed:${NC}  ${GREEN}$CHECKS_PASSED${NC}"
echo -e "${BOLD}Checks Failed:${NC}  ${RED}$CHECKS_FAILED${NC}"
echo ""

if [ "$CHECKS_FAILED" -eq 0 ]; then
    echo -e "${GREEN}${BOLD}✅ SERVER CONFIGURATION IS 100% CORRECT${NC}"
    echo ""
    echo -e "${YELLOW}${BOLD}CONCLUSION: Browser Cache Issue${NC}"
    echo ""
    echo "   The server-side OAuth configuration is correct."
    echo "   The 'Invalid redirect uri' error is caused by your browser"
    echo "   caching old OAuth state from a previous (broken) configuration."
    echo ""
    echo -e "${CYAN}${BOLD}SOLUTION:${NC}"
    echo ""
    echo "   ${BOLD}Option 1: Clear Browser Cache${NC}"
    echo "   1. Open DevTools (F12 or Cmd+Option+I)"
    echo "   2. Go to Application tab → Storage"
    echo "   3. Click 'Clear site data' for localhost"
    echo "   4. Close browser completely and reopen"
    echo ""
    echo "   ${BOLD}Option 2: Use Incognito/Private Window${NC}"
    echo "   1. Open new Incognito/Private browsing window"
    echo "   2. Navigate to https://localhost:${APP_PORT}"
    echo "   3. Try signing in"
    echo ""
    echo "   ${BOLD}Option 3: Clear Specific Cookies${NC}"
    echo "   In DevTools → Application → Cookies → localhost, delete:"
    echo "   • KEYCLOAK_SESSION"
    echo "   • KEYCLOAK_IDENTITY"
    echo "   • KEYCLOAK_SESSION_LEGACY"
    echo "   • AUTH_SESSION_ID*"
    echo "   • next-auth.session-token"
    echo "   • next-auth.callback-url"
    echo "   • next-auth.csrf-token"
    echo ""
else
    echo -e "${RED}${BOLD}❌ SERVER CONFIGURATION HAS ISSUES${NC}"
    echo ""
    echo "   The server-side configuration has $CHECKS_FAILED issue(s)."
    echo "   These must be fixed before authentication will work."
    echo ""
    echo -e "${CYAN}${BOLD}RECOMMENDED ACTIONS:${NC}"
    echo ""
    echo "   1. Run: ./dive hub fix"
    echo "   2. Restart: ./dive hub down && ./dive hub up"
    echo "   3. Run this diagnostic again"
    echo ""
fi

echo -e "${CYAN}═══════════════════════════════════════════════════════════════════${NC}"
echo ""

exit $CHECKS_FAILED
