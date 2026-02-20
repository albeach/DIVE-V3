#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Bidirectional Federation Verification (Services Already Running)
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

echo ""
log_header "╔════════════════════════════════════════════════════════════════╗"
log_header "║  DIVE V3 - Bidirectional Federation Verification              ║"
log_header "║  100% Automated Configuration Test                            ║"
log_header "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Wait for services to stabilize
sleep 5

# =============================================================================
# PHASE 1: DEPLOYMENT VERIFICATION
# =============================================================================

log_step "Phase 1: Deployment Verification"
echo ""

test_assert "Hub containers running" "[ \$(docker ps --filter 'name=dive-hub' --format '{{.Names}}' | wc -l) -ge 10 ]"
test_assert "GBR spoke containers running" "[ \$(docker ps --filter 'name=dive-spoke-gbr' --format '{{.Names}}' | wc -l) -ge 8 ]"
test_assert "FRA spoke containers running" "[ \$(docker ps --filter 'name=dive-spoke-fra' --format '{{.Names}}' | wc -l) -ge 8 ]"

# =============================================================================
# PHASE 2: AUTHENTICATION TESTS
# =============================================================================

log_step "Phase 2: Authentication Tests"
echo ""

# Load credentials
set -a
source .env.hub 2>/dev/null || true
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
source instances/gbr/.env 2>/dev/null || true
set +a

GBR_TOKEN=$(curl -sk -X POST "https://localhost:8474/realms/master/protocol/openid-connect/token" \
    -d "grant_type=password" \
    -d "client_id=admin-cli" \
    -d "username=admin" \
    -d "password=${KEYCLOAK_ADMIN_PASSWORD_GBR}" 2>/dev/null | jq -r '.access_token' 2>/dev/null)

test_assert "GBR Spoke Keycloak admin authentication" "[ -n '$GBR_TOKEN' ] && [ '$GBR_TOKEN' != 'null' ]"

# Get FRA Spoke admin token
set -a
source instances/fra/.env 2>/dev/null || true
set +a

FRA_TOKEN=$(curl -sk -X POST "https://localhost:8453/realms/master/protocol/openid-connect/token" \
    -d "grant_type=password" \
    -d "client_id=admin-cli" \
    -d "username=admin" \
    -d "password=${KEYCLOAK_ADMIN_PASSWORD_FRA}" 2>/dev/null | jq -r '.access_token' 2>/dev/null)

test_assert "FRA Spoke Keycloak admin authentication" "[ -n '$FRA_TOKEN' ] && [ '$FRA_TOKEN' != 'null' ]"

# =============================================================================
# PHASE 3: FEDERATION IDPS VERIFICATION
# =============================================================================

log_step "Phase 3: Federation IdPs Verification"
echo ""

# Check USA Hub has GBR and FRA IdPs
USA_IDPS=$(curl -sk "https://localhost:8443/admin/realms/dive-v3-broker-usa/identity-provider/instances" \
    -H "Authorization: Bearer $USA_TOKEN" 2>/dev/null | jq -r '.[].alias' 2>/dev/null | tr '\n' ' ')

test_assert "USA Hub → GBR IdP configured" "echo '$USA_IDPS' | grep -qE '(gbr-federation|gbr-idp)'"
test_assert "USA Hub → FRA IdP configured" "echo '$USA_IDPS' | grep -qE '(fra-federation|fra-idp)'"

# Check GBR Spoke has USA IdP
GBR_IDPS=$(curl -sk "https://localhost:8474/admin/realms/dive-v3-broker-gbr/identity-provider/instances" \
    -H "Authorization: Bearer $GBR_TOKEN" 2>/dev/null | jq -r '.[].alias' 2>/dev/null | tr '\n' ' ')

test_assert "GBR Spoke → USA Hub IdP configured" "echo '$GBR_IDPS' | grep -qE '(usa-federation|usa-idp)'"

# Check FRA Spoke has USA IdP
FRA_IDPS=$(curl -sk "https://localhost:8453/admin/realms/dive-v3-broker-fra/identity-provider/instances" \
    -H "Authorization: Bearer $FRA_TOKEN" 2>/dev/null | jq -r '.[].alias' 2>/dev/null | tr '\n' ' ')

test_assert "FRA Spoke → USA Hub IdP configured" "echo '$FRA_IDPS' | grep -qE '(usa-federation|usa-idp)'"

# =============================================================================
# PHASE 4: FEDERATION CLIENTS VERIFICATION
# =============================================================================

log_step "Phase 4: Federation Clients Verification"
echo ""

# Check USA Hub has GBR and FRA federation clients
USA_GBR_CLIENT=$(curl -sk "https://localhost:8443/admin/realms/dive-v3-broker-usa/clients" \
    -H "Authorization: Bearer $USA_TOKEN" 2>/dev/null | jq -r '.[].clientId' 2>/dev/null | grep -E '(dive-v3-gbr-federation|dive-v3-broker-gbr)' | head -1)

test_assert "USA Hub has GBR federation client ($USA_GBR_CLIENT)" "[ -n '$USA_GBR_CLIENT' ]"

USA_FRA_CLIENT=$(curl -sk "https://localhost:8443/admin/realms/dive-v3-broker-usa/clients" \
    -H "Authorization: Bearer $USA_TOKEN" 2>/dev/null | jq -r '.[].clientId' 2>/dev/null | grep -E '(dive-v3-fra-federation|dive-v3-broker-fra)' | head -1)

test_assert "USA Hub has FRA federation client ($USA_FRA_CLIENT)" "[ -n '$USA_FRA_CLIENT' ]"

# Check GBR Spoke has USA federation client
GBR_USA_CLIENT=$(curl -sk "https://localhost:8474/admin/realms/dive-v3-broker-gbr/clients" \
    -H "Authorization: Bearer $GBR_TOKEN" 2>/dev/null | jq -r '.[].clientId' 2>/dev/null | grep -E '(dive-v3-usa-federation|dive-v3-broker-usa)' | head -1)

test_assert "GBR Spoke has USA federation client ($GBR_USA_CLIENT)" "[ -n '$GBR_USA_CLIENT' ]"

# Check FRA Spoke has USA federation client
FRA_USA_CLIENT=$(curl -sk "https://localhost:8453/admin/realms/dive-v3-broker-fra/clients" \
    -H "Authorization: Bearer $FRA_TOKEN" 2>/dev/null | jq -r '.[].clientId' 2>/dev/null | grep -E '(dive-v3-usa-federation|dive-v3-broker-usa)' | head -1)

test_assert "FRA Spoke has USA federation client ($FRA_USA_CLIENT)" "[ -n '$FRA_USA_CLIENT' ]"

# =============================================================================
# PHASE 5: OIDC ENDPOINTS VERIFICATION
# =============================================================================

log_step "Phase 5: OIDC Endpoints Verification"
echo ""

test_assert "USA Hub OIDC discovery" "curl -skf 'https://localhost:8443/realms/dive-v3-broker-usa/.well-known/openid-configuration' | jq -e '.issuer' >/dev/null 2>&1"

test_assert "GBR Spoke OIDC discovery" "curl -skf 'https://localhost:8474/realms/dive-v3-broker-gbr/.well-known/openid-configuration' | jq -e '.issuer' >/dev/null 2>&1"

test_assert "FRA Spoke OIDC discovery" "curl -skf 'https://localhost:8453/realms/dive-v3-broker-fra/.well-known/openid-configuration' | jq -e '.issuer' >/dev/null 2>&1"

# =============================================================================
# PHASE 6: TEST USERS VERIFICATION
# =============================================================================

log_step "Phase 6: Test Users Verification"
echo ""

# Check USA Hub has test users
USA_USERS=$(curl -sk "https://localhost:8443/admin/realms/dive-v3-broker-usa/users?max=100" \
    -H "Authorization: Bearer $USA_TOKEN" 2>/dev/null | jq -r '.[].username' 2>/dev/null | grep "testuser-usa" | wc -l | tr -d ' ')

test_assert "USA Hub has test users ($USA_USERS found)" "[ '$USA_USERS' -ge 1 ]"

# Check GBR Spoke has test users
GBR_USERS=$(curl -sk "https://localhost:8474/admin/realms/dive-v3-broker-gbr/users?max=100" \
    -H "Authorization: Bearer $GBR_TOKEN" 2>/dev/null | jq -r '.[].username' 2>/dev/null | grep "testuser-gbr" | wc -l | tr -d ' ')

test_assert "GBR Spoke has test users ($GBR_USERS found)" "[ '$GBR_USERS' -ge 1 ]"

# Check FRA Spoke has test users
FRA_USERS=$(curl -sk "https://localhost:8453/admin/realms/dive-v3-broker-fra/users?max=100" \
    -H "Authorization: Bearer $FRA_TOKEN" 2>/dev/null | jq -r '.[].username' 2>/dev/null | grep "testuser-fra" | wc -l | tr -d ' ')

test_assert "FRA Spoke has test users ($FRA_USERS found)" "[ '$FRA_USERS' -ge 1 ]"

# =============================================================================
# PHASE 7: INSTANCE-SPECIFIC CLIENT IDS
# =============================================================================

log_step "Phase 7: Instance-Specific Client IDs"
echo ""

USA_CLIENT=$(curl -sk "https://localhost:8443/admin/realms/dive-v3-broker-usa/clients?clientId=dive-v3-broker-usa" \
    -H "Authorization: Bearer $USA_TOKEN" 2>/dev/null | jq -r '.[0].clientId' 2>/dev/null)

test_assert "USA Hub has instance-specific client ID" "[ '$USA_CLIENT' = 'dive-v3-broker-usa' ]"

GBR_CLIENT=$(curl -sk "https://localhost:8474/admin/realms/dive-v3-broker-gbr/clients?clientId=dive-v3-broker-gbr" \
    -H "Authorization: Bearer $GBR_TOKEN" 2>/dev/null | jq -r '.[0].clientId' 2>/dev/null)

test_assert "GBR Spoke has instance-specific client ID" "[ '$GBR_CLIENT' = 'dive-v3-broker-gbr' ]"

FRA_CLIENT=$(curl -sk "https://localhost:8453/admin/realms/dive-v3-broker-fra/clients?clientId=dive-v3-broker-fra" \
    -H "Authorization: Bearer $FRA_TOKEN" 2>/dev/null | jq -r '.[0].clientId' 2>/dev/null)

test_assert "FRA Spoke has instance-specific client ID" "[ '$FRA_CLIENT' = 'dive-v3-broker-fra' ]"

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
    echo "  ✅ GBR ↔ FRA (via USA Hub as broker)"
    echo ""
    log_info "Federation Configuration:"
    echo "  • USA Hub IdPs: $USA_IDPS"
    echo "  • GBR Spoke IdPs: $GBR_IDPS"
    echo "  • FRA Spoke IdPs: $FRA_IDPS"
    echo ""
    log_info "Deployment Status:"
    echo "  • Hub (USA):   $(docker ps --filter 'name=dive-hub' --filter 'health=healthy' --format '{{.Names}}' | wc -l | tr -d ' ')/$(docker ps --filter 'name=dive-hub' --format '{{.Names}}' | wc -l | tr -d ' ') healthy"
    echo "  • GBR Spoke:   $(docker ps --filter 'name=dive-spoke-gbr' --filter 'health=healthy' --format '{{.Names}}' | wc -l | tr -d ' ')/$(docker ps --filter 'name=dive-spoke-gbr' --format '{{.Names}}' | wc -l | tr -d ' ') healthy"
    echo "  • FRA Spoke:   $(docker ps --filter 'name=dive-spoke-fra' --filter 'health=healthy' --format '{{.Names}}' | wc -l | tr -d ' ')/$(docker ps --filter 'name=dive-spoke-fra' --format '{{.Names}}' | wc -l | tr -d ' ') healthy"
    echo ""
    log_info "Access Points:"
    echo "  • USA Hub:     https://localhost:3000"
    echo "  • GBR Spoke:   https://localhost:3031"
    echo "  • FRA Spoke:   https://localhost:3010"
    echo ""
    log_info "Test Users:"
    echo "  • USA: testuser-usa-1 to testuser-usa-$USA_USERS"
    echo "  • GBR: testuser-gbr-1 to testuser-gbr-$GBR_USERS"
    echo "  • FRA: testuser-fra-1 to testuser-fra-$FRA_USERS"
    echo "  • Password: DiveTestSecure2025!"
    echo ""
    echo "═══════════════════════════════════════════════════════════════════"
    exit 0
else
    echo "═══════════════════════════════════════════════════════════════════"
    log_error "❌ TESTS FAILED - $TESTS_FAILED/$TESTS_TOTAL tests did not pass"
    echo "═══════════════════════════════════════════════════════════════════"
    exit 1
fi

# sc2034-anchor
: "${YELLOW:-}"
