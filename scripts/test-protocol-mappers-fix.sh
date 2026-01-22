#!/usr/local/bin/bash
# =============================================================================
# Protocol Mappers Fix - Verification Script
# =============================================================================
# Tests that Hub Terraform correctly creates incoming federation clients
# with protocol mappers for attribute exchange.
#
# Usage:
#   ./test-protocol-mappers-fix.sh
#
# Prerequisites:
#   - Hub deployed: ./dive hub deploy
#   - At least one spoke deployed: ./dive spoke deploy FRA
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="${SCRIPT_DIR}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# =============================================================================
# Helper Functions
# =============================================================================

log_test() {
    echo -e "${CYAN}TEST ${TESTS_RUN}:${NC} $1"
}

log_pass() {
    echo -e "  ${GREEN}✓ PASS:${NC} $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

log_fail() {
    echo -e "  ${RED}✗ FAIL:${NC} $1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

log_info() {
    echo -e "  ${CYAN}ℹ${NC} $1"
}

# =============================================================================
# Test Suite
# =============================================================================

echo -e "${BOLD}==============================================================================${NC}"
echo -e "${BOLD}Protocol Mappers Fix - Verification Test Suite${NC}"
echo -e "${BOLD}==============================================================================${NC}"
echo ""

# -----------------------------------------------------------------------------
# TEST 1: Check Hub Terraform uses federated-instance module
# -----------------------------------------------------------------------------
TESTS_RUN=$((TESTS_RUN + 1))
log_test "Hub main.tf uses federated-instance module"

if grep -q 'module "instance"' "${DIVE_ROOT}/terraform/hub/main.tf" && \
   grep -q 'source = "../modules/federated-instance"' "${DIVE_ROOT}/terraform/hub/main.tf"; then
    log_pass "Hub Terraform uses federated-instance module"
else
    log_fail "Hub Terraform does NOT use federated-instance module"
fi

# -----------------------------------------------------------------------------
# TEST 2: Check federation_partners variable exists
# -----------------------------------------------------------------------------
TESTS_RUN=$((TESTS_RUN + 1))
log_test "Hub variables.tf defines federation_partners"

if grep -q 'variable "federation_partners"' "${DIVE_ROOT}/terraform/hub/variables.tf"; then
    log_pass "federation_partners variable defined"
else
    log_fail "federation_partners variable NOT defined"
fi

# -----------------------------------------------------------------------------
# TEST 3: Check incoming_federation_secrets variable exists
# -----------------------------------------------------------------------------
TESTS_RUN=$((TESTS_RUN + 1))
log_test "Hub variables.tf defines incoming_federation_secrets"

if grep -q 'variable "incoming_federation_secrets"' "${DIVE_ROOT}/terraform/hub/variables.tf"; then
    log_pass "incoming_federation_secrets variable defined"
else
    log_fail "incoming_federation_secrets variable NOT defined"
fi

# -----------------------------------------------------------------------------
# TEST 4: Check Terraform configuration is valid
# -----------------------------------------------------------------------------
TESTS_RUN=$((TESTS_RUN + 1))
log_test "Terraform configuration is valid"

cd "${DIVE_ROOT}/terraform/hub"
if terraform validate >/dev/null 2>&1; then
    log_pass "Terraform validate passes"
else
    log_fail "Terraform validate failed"
fi

# -----------------------------------------------------------------------------
# TEST 5: Check if instances directory exists with spokes
# -----------------------------------------------------------------------------
TESTS_RUN=$((TESTS_RUN + 1))
log_test "Instances directory contains deployed spokes"

if [ -d "${DIVE_ROOT}/instances" ]; then
    spoke_count=$(find "${DIVE_ROOT}/instances" -maxdepth 1 -type d -name '[A-Z][A-Z][A-Z]' 2>/dev/null | wc -l | tr -d ' ')
    if [ "$spoke_count" -gt 0 ]; then
        log_pass "Found ${spoke_count} spoke(s) in instances/"
        for spoke_dir in "${DIVE_ROOT}/instances/"*/; do
            [ ! -d "$spoke_dir" ] && continue
            spoke_code=$(basename "$spoke_dir")
            if [ -f "${spoke_dir}config.json" ]; then
                log_info "  - ${spoke_code}: config.json present"
            fi
        done
    else
        log_fail "No spokes found in instances/ (deploy at least one spoke first)"
    fi
else
    log_fail "instances/ directory does not exist"
fi

# -----------------------------------------------------------------------------
# TEST 6: Check Hub Terraform state for incoming federation clients
# -----------------------------------------------------------------------------
TESTS_RUN=$((TESTS_RUN + 1))
log_test "Hub Terraform state contains incoming federation clients"

cd "${DIVE_ROOT}/terraform/hub"
if [ -f "terraform.tfstate" ]; then
    incoming_clients=$(terraform state list 2>/dev/null | grep 'module.instance.keycloak_openid_client.incoming_federation' | wc -l | tr -d ' ')
    if [ "$incoming_clients" -gt 0 ]; then
        log_pass "Found ${incoming_clients} incoming federation client(s) in Terraform state"
        terraform state list 2>/dev/null | grep 'module.instance.keycloak_openid_client.incoming_federation' | while read -r resource; do
            spoke=$(echo "$resource" | sed -n 's/.*incoming_federation\["\([^"]*\)"\].*/\1/p')
            log_info "  - dive-v3-broker-${spoke}"
        done
    else
        log_fail "No incoming federation clients in Terraform state (run './dive hub deploy' after deploying spokes)"
    fi
else
    log_fail "terraform.tfstate not found (Hub not deployed via Terraform)"
fi

# -----------------------------------------------------------------------------
# TEST 7: Check Hub Terraform state for protocol mappers
# -----------------------------------------------------------------------------
TESTS_RUN=$((TESTS_RUN + 1))
log_test "Hub Terraform state contains protocol mappers"

cd "${DIVE_ROOT}/terraform/hub"
if [ -f "terraform.tfstate" ]; then
    mapper_count=$(terraform state list 2>/dev/null | grep 'module.instance.keycloak_openid_user_attribute_protocol_mapper.federation_' | wc -l | tr -d ' ')
    if [ "$mapper_count" -gt 0 ]; then
        log_pass "Found ${mapper_count} protocol mapper(s) in Terraform state"

        # Count mappers per attribute type
        clearance=$(terraform state list 2>/dev/null | grep 'federation_clearance' | wc -l | tr -d ' ')
        country=$(terraform state list 2>/dev/null | grep 'federation_country' | wc -l | tr -d ' ')
        coi=$(terraform state list 2>/dev/null | grep 'federation_coi' | wc -l | tr -d ' ')
        unique_id=$(terraform state list 2>/dev/null | grep 'federation_unique_id' | wc -l | tr -d ' ')
        amr=$(terraform state list 2>/dev/null | grep 'federation_amr' | wc -l | tr -d ' ')

        log_info "  - clearance: ${clearance}"
        log_info "  - countryOfAffiliation: ${country}"
        log_info "  - acpCOI: ${coi}"
        log_info "  - uniqueID: ${unique_id}"
        log_info "  - amr: ${amr}"

        if [ "$clearance" -gt 0 ] && [ "$country" -gt 0 ] && [ "$unique_id" -gt 0 ]; then
            log_pass "All critical protocol mappers present"
        else
            log_fail "Missing critical protocol mappers"
        fi
    else
        log_fail "No protocol mappers in Terraform state"
    fi
else
    log_fail "terraform.tfstate not found"
fi

# -----------------------------------------------------------------------------
# TEST 8: Check if hub.auto.tfvars is generated
# -----------------------------------------------------------------------------
TESTS_RUN=$((TESTS_RUN + 1))
log_test "hub.auto.tfvars is generated with federation config"

if [ -f "${DIVE_ROOT}/terraform/hub/hub.auto.tfvars" ]; then
    log_pass "hub.auto.tfvars exists"

    if grep -q 'federation_partners' "${DIVE_ROOT}/terraform/hub/hub.auto.tfvars"; then
        log_pass "hub.auto.tfvars contains federation_partners"
    else
        log_fail "hub.auto.tfvars missing federation_partners"
    fi

    if grep -q 'incoming_federation_secrets' "${DIVE_ROOT}/terraform/hub/hub.auto.tfvars"; then
        log_pass "hub.auto.tfvars contains incoming_federation_secrets"
    else
        log_fail "hub.auto.tfvars missing incoming_federation_secrets"
    fi
else
    log_fail "hub.auto.tfvars not generated (run './dive hub deploy')"
fi

# -----------------------------------------------------------------------------
# TEST 9: Check Hub Keycloak for incoming federation clients (API)
# -----------------------------------------------------------------------------
TESTS_RUN=$((TESTS_RUN + 1))
log_test "Hub Keycloak has incoming federation clients"

if docker ps --format '{{.Names}}' 2>/dev/null | grep -q 'dive-hub-keycloak'; then
    # Get admin password
    KEYCLOAK_ADMIN_PASSWORD=$(docker exec dive-hub-keycloak printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null || echo "")

    if [ -n "$KEYCLOAK_ADMIN_PASSWORD" ]; then
        # Get admin token
        ADMIN_TOKEN=$(curl -sk -X POST "https://localhost:8443/realms/master/protocol/openid-connect/token" \
            -d "grant_type=password" \
            -d "client_id=admin-cli" \
            -d "username=admin" \
            -d "password=${KEYCLOAK_ADMIN_PASSWORD}" 2>/dev/null | jq -r '.access_token' 2>/dev/null || echo "")

        if [ -n "$ADMIN_TOKEN" ] && [ "$ADMIN_TOKEN" != "null" ]; then
            # Check for incoming clients
            federation_clients=$(curl -sk "https://localhost:8443/admin/realms/dive-v3-broker-usa/clients" \
                -H "Authorization: Bearer $ADMIN_TOKEN" 2>/dev/null | \
                jq -r '[.[] | select(.clientId | startswith("dive-v3-broker-") and (.clientId != "dive-v3-broker-usa"))] | length' 2>/dev/null || echo "0")

            if [ "$federation_clients" -gt 0 ]; then
                log_pass "Found ${federation_clients} incoming federation client(s) in Keycloak"

                # List them
                curl -sk "https://localhost:8443/admin/realms/dive-v3-broker-usa/clients" \
                    -H "Authorization: Bearer $ADMIN_TOKEN" 2>/dev/null | \
                    jq -r '.[] | select(.clientId | startswith("dive-v3-broker-") and (.clientId != "dive-v3-broker-usa")) | .clientId' 2>/dev/null | \
                    while read -r client_id; do
                        log_info "  - ${client_id}"
                    done
            else
                log_fail "No incoming federation clients in Keycloak"
            fi
        else
            log_fail "Could not authenticate to Keycloak API"
        fi
    else
        log_fail "Could not get Keycloak admin password"
    fi
else
    log_fail "Hub Keycloak container not running"
fi

# =============================================================================
# Summary
# =============================================================================

echo ""
echo -e "${BOLD}==============================================================================${NC}"
echo -e "${BOLD}Test Summary${NC}"
echo -e "${BOLD}==============================================================================${NC}"
echo ""
echo "  Tests Run:    ${TESTS_RUN}"
echo -e "  Tests Passed: ${GREEN}${TESTS_PASSED}${NC}"
echo -e "  Tests Failed: ${RED}${TESTS_FAILED}${NC}"
echo ""

if [ "$TESTS_FAILED" -eq 0 ]; then
    echo -e "${GREEN}${BOLD}✓ ALL TESTS PASSED${NC}"
    echo ""
    echo "The protocol mappers fix is working correctly!"
    echo ""
    echo "Next steps:"
    echo "  1. Run './dive federation verify <SPOKE_CODE>' to verify end-to-end"
    echo "  2. Test federation flow: Hub → Spoke → Hub"
    echo "  3. Check token contents for user attributes"
    exit 0
else
    echo -e "${RED}${BOLD}✗ SOME TESTS FAILED${NC}"
    echo ""
    echo "Troubleshooting:"
    echo "  1. Ensure Hub is deployed: ./dive hub deploy"
    echo "  2. Ensure at least one spoke is deployed: ./dive spoke deploy FRA"
    echo "  3. Re-run hub deployment to pick up spokes: ./dive hub deploy"
    echo "  4. Check logs: ./dive hub logs backend"
    exit 1
fi
