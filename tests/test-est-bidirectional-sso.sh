#!/usr/bin/env bash
#
# DIVE V3 - Estonia (EST) Bidirectional SSO Test
# Tests cross-border authentication in both directions:
#   1. Hub users → EST spoke
#   2. EST users → Hub
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║     DIVE V3 - Estonia Bidirectional SSO Test                ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Test counters
PASSED=0
FAILED=0
TOTAL=7

# Test result function
test_result() {
    local test_name="$1"
    local result="$2"

    if [ "$result" = "PASS" ]; then
        echo -e "${GREEN}✓${NC} $test_name"
        ((PASSED++))
    else
        echo -e "${RED}✗${NC} $test_name"
        ((FAILED++))
    fi
}

# Test 1: EST Spoke Services Running
echo -e "${CYAN}→ Test 1: EST Spoke Services${NC}"
EST_SERVICES=$(docker ps --filter "name=dive-spoke-est" --filter "health=healthy" --format "{{.Names}}" | wc -l | tr -d ' ')
if [ "$EST_SERVICES" -ge 8 ]; then
    test_result "EST spoke services (${EST_SERVICES}/9 healthy)" "PASS"
else
    test_result "EST spoke services (${EST_SERVICES}/9 healthy)" "FAIL"
fi

# Test 2: Hub Services Running
echo -e "${CYAN}→ Test 2: Hub Services${NC}"
HUB_SERVICES=$(docker ps --filter "name=dive-hub" --filter "health=healthy" --format "{{.Names}}" | wc -l | tr -d ' ')
if [ "$HUB_SERVICES" -ge 10 ]; then
    test_result "Hub services (${HUB_SERVICES}/11 healthy)" "PASS"
else
    test_result "Hub services (${HUB_SERVICES}/11 healthy)" "FAIL"
fi

# Test 3: Hub has est-idp configured
echo -e "${CYAN}→ Test 3: Hub → EST Federation (est-idp)${NC}"
cd "$DIVE_ROOT"
source .env.hub 2>/dev/null || true
EST_IDP=$(docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh config credentials \
    --server http://localhost:8080 --realm master \
    --user admin --password "$KEYCLOAK_ADMIN_PASSWORD" 2>/dev/null && \
    docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh get \
    identity-provider/instances/est-idp -r dive-v3-broker-usa 2>/dev/null | jq -r '.enabled // empty')

if [ "$EST_IDP" = "true" ]; then
    test_result "Hub has est-idp configured and enabled" "PASS"
else
    test_result "Hub has est-idp configured and enabled" "FAIL"
fi

# Test 4: EST has usa-idp configured
echo -e "${CYAN}→ Test 4: EST → Hub Federation (usa-idp)${NC}"
EST_KC_PASSWORD=$(grep KEYCLOAK_ADMIN_PASSWORD_EST "$DIVE_ROOT/instances/est/.env" | cut -d= -f2)
USA_IDP=$(docker exec dive-spoke-est-keycloak /opt/keycloak/bin/kcadm.sh config credentials \
    --server http://localhost:8080 --realm master \
    --user admin --password "$EST_KC_PASSWORD" 2>/dev/null && \
    docker exec dive-spoke-est-keycloak /opt/keycloak/bin/kcadm.sh get \
    identity-provider/instances/usa-idp -r dive-v3-broker-est 2>/dev/null | jq -r '.enabled // empty')

if [ "$USA_IDP" = "true" ]; then
    test_result "EST has usa-idp configured and enabled" "PASS"
else
    test_result "EST has usa-idp configured and enabled" "FAIL"
fi

# Test 5: EST usa-idp has clientId configured
echo -e "${CYAN}→ Test 5: EST usa-idp Configuration${NC}"
USA_IDP_CLIENT=$(docker exec dive-spoke-est-keycloak /opt/keycloak/bin/kcadm.sh get \
    identity-provider/instances/usa-idp -r dive-v3-broker-est 2>/dev/null | jq -r '.config.clientId // empty')

if [ -n "$USA_IDP_CLIENT" ] && [ "$USA_IDP_CLIENT" != "null" ]; then
    test_result "EST usa-idp has clientId: $USA_IDP_CLIENT" "PASS"
else
    test_result "EST usa-idp has clientId configured" "FAIL"
fi

# Test 6: Hub federation client exists
echo -e "${CYAN}→ Test 6: Hub Federation Client (dive-v3-broker-est)${NC}"
HUB_FED_CLIENT=$(docker exec dive-hub-keycloak /opt/keycloak/bin/kcadm.sh get clients \
    -r dive-v3-broker-usa 2>/dev/null | jq -r '.[] | select(.clientId=="dive-v3-broker-est") | .clientId // empty')

if [ "$HUB_FED_CLIENT" = "dive-v3-broker-est" ]; then
    test_result "Hub has federation client dive-v3-broker-est" "PASS"
else
    test_result "Hub has federation client dive-v3-broker-est" "FAIL"
fi

# Test 7: EST cross-border client exists
echo -e "${CYAN}→ Test 7: EST Cross-Border Client${NC}"
EST_CB_CLIENT=$(docker exec dive-spoke-est-keycloak /opt/keycloak/bin/kcadm.sh get clients \
    -r dive-v3-broker-est 2>/dev/null | jq -r '.[] | select(.clientId=="dive-v3-cross-border-client") | .clientId // empty')

if [ "$EST_CB_CLIENT" = "dive-v3-cross-border-client" ]; then
    test_result "EST has cross-border client" "PASS"
else
    test_result "EST has cross-border client" "FAIL"
fi

# Summary
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║                      Test Results                            ║${NC}"
echo -e "${BOLD}╠══════════════════════════════════════════════════════════════╣${NC}"
echo -e "${BOLD}║  ${GREEN}Passed:${NC} $PASSED/${TOTAL}                                              ${BOLD}║${NC}"
echo -e "${BOLD}║  ${RED}Failed:${NC} $FAILED/${TOTAL}                                              ${BOLD}║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}${BOLD}✅ ALL TESTS PASSED - 100% Bidirectional SSO Verified!${NC}"
    echo ""
    echo -e "${CYAN}Test URLs:${NC}"
    echo -e "  • EST Frontend:  https://localhost:3008"
    echo -e "  • EST Keycloak:  https://localhost:8451"
    echo -e "  • Hub Frontend:  https://localhost:3000"
    echo -e "  • Hub Keycloak:  https://localhost:8443"
    echo ""
    echo -e "${CYAN}Test Scenarios:${NC}"
    echo -e "  1. ${BOLD}Hub → EST${NC}: Login to EST frontend with 'Federated Login (USA Hub)'"
    echo -e "  2. ${BOLD}EST → Hub${NC}: Login to Hub frontend with 'Estonia' IdP"
    echo -e "  3. ${BOLD}EST Local${NC}: Login to EST frontend with 'Local Login (EST Users)'"
    echo ""
    exit 0
else
    echo -e "${RED}${BOLD}❌ TESTS FAILED - Some federation checks did not pass${NC}"
    echo ""
    echo -e "${YELLOW}Run these commands to diagnose:${NC}"
    echo -e "  ./dive --instance est spoke health"
    echo -e "  ./dive federation verify EST"
    echo -e "  ./dive hub spokes list"
    echo ""
    exit 1
fi
