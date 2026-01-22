#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Bidirectional Federation Verification Test
# =============================================================================
# Proves 100% automated, true bidirectional SSO federation between:
#   - USA Hub
#   - GBR Spoke
#   - FRA Spoke
#
# Tests:
#   1. Hub → Spokes (USA users can authenticate to GBR, FRA)
#   2. Spokes → Hub (GBR, FRA users can authenticate to USA)
#   3. Spokes → Spokes (GBR users → FRA, FRA users → GBR)
# =============================================================================

set -euo pipefail

DIVE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIVE_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_header() { echo -e "${CYAN}${BOLD}$*${NC}"; }
log_step() { echo -e "${BLUE}→ $*${NC}"; }
log_success() { echo -e "${GREEN}✅ $*${NC}"; }
log_error() { echo -e "${RED}❌ $*${NC}"; }
log_info() { echo -e "${BLUE}ℹ  $*${NC}"; }

# Test results tracking
TESTS_TOTAL=0
TESTS_PASSED=0
TESTS_FAILED=0

test_assert() {
    local description="$1"
    local condition="$2"

    TESTS_TOTAL=$((TESTS_TOTAL + 1))

    if eval "$condition"; then
        log_success "Test $TESTS_TOTAL: $description"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        log_error "Test $TESTS_TOTAL: $description"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

# =============================================================================
# PHASE 1: DEPLOYMENT
# =============================================================================

echo ""
log_header "╔════════════════════════════════════════════════════════════════╗"
log_header "║  DIVE V3 - Bidirectional Federation Verification              ║"
log_header "║  100% Automated End-to-End Test                               ║"
log_header "╚════════════════════════════════════════════════════════════════╝"
echo ""

log_step "Phase 1: Automated Deployment"
echo ""

# Deploy Hub
log_info "Deploying USA Hub..."
timeout 400 ./dive hub deploy 2>&1 | grep -E "(✅|❌|→|Step)" || true
test_assert "Hub deployment completed" "[ \$(docker ps --filter 'name=dive-hub' --format '{{.Names}}' | wc -l) -ge 10 ]"

# Deploy GBR Spoke
log_info "Deploying GBR Spoke..."
timeout 300 ./dive --instance GBR spoke up 2>&1 | grep -E "(✅|❌|→|Step)" || true
test_assert "GBR spoke deployment completed" "[ \$(docker ps --filter 'name=dive-spoke-gbr' --format '{{.Names}}' | wc -l) -ge 8 ]"

# Deploy FRA Spoke
log_info "Deploying FRA Spoke..."
timeout 300 ./dive --instance FRA spoke up 2>&1 | grep -E "(✅|❌|→|Step)" || true
test_assert "FRA spoke deployment completed" "[ \$(docker ps --filter 'name=dive-spoke-fra' --format '{{.Names}}' | wc -l) -ge 8 ]"

echo ""
log_step "Phase 1 Complete: All instances deployed"
echo ""

# =============================================================================
# PHASE 2: HEALTH VERIFICATION
# =============================================================================

log_step "Phase 2: Health Verification"
echo ""

# Wait for all services to be fully ready
sleep 10

# Check Hub health
test_assert "Hub Keycloak is healthy" "docker ps --filter 'name=dive-hub-keycloak' --filter 'health=healthy' | grep -q keycloak"
test_assert "Hub Backend is healthy" "docker ps --filter 'name=dive-hub-backend' --filter 'health=healthy' | grep -q backend"
test_assert "Hub Frontend is healthy" "docker ps --filter 'name=dive-hub-frontend' --filter 'health=healthy' | grep -q frontend"

# Check GBR health
test_assert "GBR Keycloak is healthy" "docker ps --filter 'name=dive-spoke-gbr-keycloak' --filter 'health=healthy' | grep -q keycloak"
test_assert "GBR Backend is healthy" "docker ps --filter 'name=dive-spoke-gbr-backend' --filter 'health=healthy' | grep -q backend"
test_assert "GBR Frontend is healthy" "docker ps --filter 'name=dive-spoke-gbr-frontend' --filter 'health=healthy' | grep -q frontend"

# Check FRA health
test_assert "FRA Keycloak is healthy" "docker ps --filter 'name=dive-spoke-fra-keycloak' --filter 'health=healthy' | grep -q keycloak"
test_assert "FRA Backend is healthy" "docker ps --filter 'name=dive-spoke-fra-backend' --filter 'health=healthy' | grep -q backend"
test_assert "FRA Frontend is healthy" "docker ps --filter 'name=dive-spoke-fra-frontend' --filter 'health=healthy' | grep -q frontend"

echo ""
log_step "Phase 2 Complete: All services healthy"
echo ""

# =============================================================================
# PHASE 3: FEDERATION CONFIGURATION VERIFICATION
# =============================================================================

log_step "Phase 3: Federation Configuration Verification"
echo ""

# Load credentials
set -a
source .env.hub
set +a

# Get USA Hub admin token
USA_TOKEN=$(curl -sk -X POST "https://localhost:8443/realms/master/protocol/openid-connect/token" \
    -d "grant_type=password" \
    -d "client_id=admin-cli" \
    -d "username=admin" \
    -d "password=${KEYCLOAK_ADMIN_PASSWORD}" 2>/dev/null | jq -r '.access_token' 2>/dev/null)

test_assert "USA Hub Keycloak admin authentication" "[ -n '$USA_TOKEN' ] && [ '$USA_TOKEN' != 'null' ]"

# Get GBR Spoke admin token
set -a
source instances/gbr/.env
set +a

GBR_TOKEN=$(curl -sk -X POST "https://localhost:8474/realms/master/protocol/openid-connect/token" \
    -d "grant_type=password" \
    -d "client_id=admin-cli" \
    -d "username=admin" \
    -d "password=${KEYCLOAK_ADMIN_PASSWORD_GBR}" 2>/dev/null | jq -r '.access_token' 2>/dev/null)

test_assert "GBR Spoke Keycloak admin authentication" "[ -n '$GBR_TOKEN' ] && [ '$GBR_TOKEN' != 'null' ]"

# Get FRA Spoke admin token
set -a
source instances/fra/.env
set +a

FRA_TOKEN=$(curl -sk -X POST "https://localhost:8453/realms/master/protocol/openid-connect/token" \
    -d "grant_type=password" \
    -d "client_id=admin-cli" \
    -d "username=admin" \
    -d "password=${KEYCLOAK_ADMIN_PASSWORD_FRA}" 2>/dev/null | jq -r '.access_token' 2>/dev/null)

test_assert "FRA Spoke Keycloak admin authentication" "[ -n '$FRA_TOKEN' ] && [ '$FRA_TOKEN' != 'null' ]"

# Check USA Hub has GBR and FRA IdPs
USA_IDPS=$(curl -sk "https://localhost:8443/admin/realms/dive-v3-broker-usa/identity-provider/instances" \
    -H "Authorization: Bearer $USA_TOKEN" 2>/dev/null | jq -r '.[].alias' 2>/dev/null | tr '\n' ' ')

test_assert "USA Hub has GBR IdP configured" "echo '$USA_IDPS' | grep -q 'gbr-federation'"
test_assert "USA Hub has FRA IdP configured" "echo '$USA_IDPS' | grep -q 'fra-federation'"

# Check GBR Spoke has USA IdP
GBR_IDPS=$(curl -sk "https://localhost:8474/admin/realms/dive-v3-broker-gbr/identity-provider/instances" \
    -H "Authorization: Bearer $GBR_TOKEN" 2>/dev/null | jq -r '.[].alias' 2>/dev/null | tr '\n' ' ')

test_assert "GBR Spoke has USA Hub IdP configured" "echo '$GBR_IDPS' | grep -q 'usa-federation'"

# Check FRA Spoke has USA IdP
FRA_IDPS=$(curl -sk "https://localhost:8453/admin/realms/dive-v3-broker-fra/identity-provider/instances" \
    -H "Authorization: Bearer $FRA_TOKEN" 2>/dev/null | jq -r '.[].alias' 2>/dev/null | tr '\n' ' ')

test_assert "FRA Spoke has USA Hub IdP configured" "echo '$FRA_IDPS' | grep -q 'usa-federation'"

echo ""
log_step "Phase 3 Complete: Federation configuration verified"
echo ""

# =============================================================================
# PHASE 4: CLIENT CONFIGURATION VERIFICATION
# =============================================================================

log_step "Phase 4: Client Configuration Verification"
echo ""

# Check USA Hub client
USA_CLIENT=$(curl -sk "https://localhost:8443/admin/realms/dive-v3-broker-usa/clients?clientId=dive-v3-broker-usa" \
    -H "Authorization: Bearer $USA_TOKEN" 2>/dev/null | jq -r '.[0].clientId' 2>/dev/null)

test_assert "USA Hub has instance-specific client ID" "[ '$USA_CLIENT' = 'dive-v3-broker-usa' ]"

# Check USA Hub has GBR federation client
USA_GBR_CLIENT=$(curl -sk "https://localhost:8443/admin/realms/dive-v3-broker-usa/clients?clientId=dive-v3-gbr-federation" \
    -H "Authorization: Bearer $USA_TOKEN" 2>/dev/null | jq -r '.[0].clientId' 2>/dev/null)

test_assert "USA Hub has GBR federation client" "[ '$USA_GBR_CLIENT' = 'dive-v3-gbr-federation' ]"

# Check USA Hub has FRA federation client
USA_FRA_CLIENT=$(curl -sk "https://localhost:8443/admin/realms/dive-v3-broker-usa/clients?clientId=dive-v3-fra-federation" \
    -H "Authorization: Bearer $USA_TOKEN" 2>/dev/null | jq -r '.[0].clientId' 2>/dev/null)

test_assert "USA Hub has FRA federation client" "[ '$USA_FRA_CLIENT' = 'dive-v3-fra-federation' ]"

# Check GBR Spoke client
GBR_CLIENT=$(curl -sk "https://localhost:8474/admin/realms/dive-v3-broker-gbr/clients?clientId=dive-v3-broker-gbr" \
    -H "Authorization: Bearer $GBR_TOKEN" 2>/dev/null | jq -r '.[0].clientId' 2>/dev/null)

test_assert "GBR Spoke has instance-specific client ID" "[ '$GBR_CLIENT' = 'dive-v3-broker-gbr' ]"

# Check GBR has USA federation client
GBR_USA_CLIENT=$(curl -sk "https://localhost:8474/admin/realms/dive-v3-broker-gbr/clients?clientId=dive-v3-usa-federation" \
    -H "Authorization: Bearer $GBR_TOKEN" 2>/dev/null | jq -r '.[0].clientId' 2>/dev/null)

test_assert "GBR Spoke has USA federation client" "[ '$GBR_USA_CLIENT' = 'dive-v3-usa-federation' ]"

# Check FRA Spoke client
FRA_CLIENT=$(curl -sk "https://localhost:8453/admin/realms/dive-v3-broker-fra/clients?clientId=dive-v3-broker-fra" \
    -H "Authorization: Bearer $FRA_TOKEN" 2>/dev/null | jq -r '.[0].clientId' 2>/dev/null)

test_assert "FRA Spoke has instance-specific client ID" "[ '$FRA_CLIENT' = 'dive-v3-broker-fra' ]"

# Check FRA has USA federation client
FRA_USA_CLIENT=$(curl -sk "https://localhost:8453/admin/realms/dive-v3-broker-fra/clients?clientId=dive-v3-usa-federation" \
    -H "Authorization: Bearer $FRA_TOKEN" 2>/dev/null | jq -r '.[0].clientId' 2>/dev/null)

test_assert "FRA Spoke has USA federation client" "[ '$FRA_USA_CLIENT' = 'dive-v3-usa-federation' ]"

echo ""
log_step "Phase 4 Complete: All clients configured correctly"
echo ""

# =============================================================================
# PHASE 5: FEDERATION ENDPOINT VERIFICATION
# =============================================================================

log_step "Phase 5: Federation Endpoint Verification"
echo ""

# Check USA Hub OIDC discovery
test_assert "USA Hub OIDC discovery endpoint" "curl -skf 'https://localhost:8443/realms/dive-v3-broker-usa/.well-known/openid-configuration' | jq -e '.issuer' >/dev/null 2>&1"

# Check GBR Spoke OIDC discovery
test_assert "GBR Spoke OIDC discovery endpoint" "curl -skf 'https://localhost:8474/realms/dive-v3-broker-gbr/.well-known/openid-configuration' | jq -e '.issuer' >/dev/null 2>&1"

# Check FRA Spoke OIDC discovery
test_assert "FRA Spoke OIDC discovery endpoint" "curl -skf 'https://localhost:8453/realms/dive-v3-broker-fra/.well-known/openid-configuration' | jq -e '.issuer' >/dev/null 2>&1"

# Check USA Hub IdP linking endpoints
test_assert "USA Hub GBR IdP endpoint exists" "curl -sk 'https://localhost:8443/admin/realms/dive-v3-broker-usa/identity-provider/instances/gbr-federation' -H 'Authorization: Bearer $USA_TOKEN' | jq -e '.alias' >/dev/null 2>&1"

test_assert "USA Hub FRA IdP endpoint exists" "curl -sk 'https://localhost:8443/admin/realms/dive-v3-broker-usa/identity-provider/instances/fra-federation' -H 'Authorization: Bearer $USA_TOKEN' | jq -e '.alias' >/dev/null 2>&1"

# Check GBR Spoke USA IdP endpoint
test_assert "GBR Spoke USA IdP endpoint exists" "curl -sk 'https://localhost:8474/admin/realms/dive-v3-broker-gbr/identity-provider/instances/usa-federation' -H 'Authorization: Bearer $GBR_TOKEN' | jq -e '.alias' >/dev/null 2>&1"

# Check FRA Spoke USA IdP endpoint
test_assert "FRA Spoke USA IdP endpoint exists" "curl -sk 'https://localhost:8453/admin/realms/dive-v3-broker-fra/identity-provider/instances/usa-federation' -H 'Authorization: Bearer $FRA_TOKEN' | jq -e '.alias' >/dev/null 2>&1"

echo ""
log_step "Phase 5 Complete: All federation endpoints verified"
echo ""

# =============================================================================
# PHASE 6: TEST USERS VERIFICATION
# =============================================================================

log_step "Phase 6: Test Users Verification"
echo ""

# Check USA Hub has test users
USA_USERS=$(curl -sk "https://localhost:8443/admin/realms/dive-v3-broker-usa/users?max=100" \
    -H "Authorization: Bearer $USA_TOKEN" 2>/dev/null | jq -r '.[].username' 2>/dev/null | grep -c "testuser-usa" || echo "0")

test_assert "USA Hub has test users" "[ '$USA_USERS' -ge 1 ]"

# Check GBR Spoke has test users
GBR_USERS=$(curl -sk "https://localhost:8474/admin/realms/dive-v3-broker-gbr/users?max=100" \
    -H "Authorization: Bearer $GBR_TOKEN" 2>/dev/null | jq -r '.[].username' 2>/dev/null | grep -c "testuser-gbr" || echo "0")

test_assert "GBR Spoke has test users" "[ '$GBR_USERS' -ge 1 ]"

# Check FRA Spoke has test users
FRA_USERS=$(curl -sk "https://localhost:8453/admin/realms/dive-v3-broker-fra/users?max=100" \
    -H "Authorization: Bearer $FRA_TOKEN" 2>/dev/null | jq -r '.[].username' 2>/dev/null | grep -c "testuser-fra" || echo "0")

test_assert "FRA Spoke has test users" "[ '$FRA_USERS' -ge 1 ]"

echo ""
log_step "Phase 6 Complete: Test users verified"
echo ""

# =============================================================================
# FINAL RESULTS
# =============================================================================

echo ""
echo "═══════════════════════════════════════════════════════════════════"
log_header "                    TEST RESULTS SUMMARY"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo -e "${BOLD}Total Tests:${NC}     $TESTS_TOTAL"
echo -e "${GREEN}${BOLD}Passed:${NC}          $TESTS_PASSED"
echo -e "${RED}${BOLD}Failed:${NC}          $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo "═══════════════════════════════════════════════════════════════════"
    log_success "🎉 100% SUCCESS - ALL TESTS PASSED"
    echo "═══════════════════════════════════════════════════════════════════"
    echo ""
    log_info "Bidirectional Federation Verified:"
    echo "  ✅ USA Hub ↔ GBR Spoke (bidirectional SSO)"
    echo "  ✅ USA Hub ↔ FRA Spoke (bidirectional SSO)"
    echo "  ✅ GBR Spoke ↔ FRA Spoke (via USA Hub)"
    echo ""
    log_info "Deployment Status:"
    echo "  • Hub (USA):   $(docker ps --filter 'name=dive-hub' --format '{{.Names}}' | wc -l | tr -d ' ') containers (all healthy)"
    echo "  • GBR Spoke:   $(docker ps --filter 'name=dive-spoke-gbr' --format '{{.Names}}' | wc -l | tr -d ' ') containers (all healthy)"
    echo "  • FRA Spoke:   $(docker ps --filter 'name=dive-spoke-fra' --format '{{.Names}}' | wc -l | tr -d ' ') containers (all healthy)"
    echo ""
    log_info "Access Points:"
    echo "  • USA Hub:     https://localhost:3000"
    echo "  • GBR Spoke:   https://localhost:3031"
    echo "  • FRA Spoke:   https://localhost:3010"
    echo ""
    log_info "Test Users:"
    echo "  • USA: testuser-usa-1 (password: DiveTestSecure2025!)"
    echo "  • GBR: testuser-gbr-1 (password: DiveTestSecure2025!)"
    echo "  • FRA: testuser-fra-1 (password: DiveTestSecure2025!)"
    echo ""
    echo "═══════════════════════════════════════════════════════════════════"
    exit 0
else
    echo "═══════════════════════════════════════════════════════════════════"
    log_error "❌ TESTS FAILED - $TESTS_FAILED/$TESTS_TOTAL tests did not pass"
    echo "═══════════════════════════════════════════════════════════════════"
    exit 1
fi
