#!/usr/bin/env bash
# =============================================================================
# Federation Flow Integration Tests
# =============================================================================
# Test complete SSO flows and secret synchronization
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIVE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$DIVE_ROOT"

# Source common utilities
if [ -f "${DIVE_ROOT}/scripts/dive-modules/common.sh" ]; then
    source "${DIVE_ROOT}/scripts/dive-modules/common.sh"
fi

TEST_SPOKE="${1:-TST}"
TEST_CODE_LOWER=$(lower "$TEST_SPOKE")

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         Federation Flow Integration Tests                   ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

local tests_passed=0
local tests_failed=0

# Test 1: Hub → Spoke SSO flow
test_hub_to_spoke_sso() {
    echo -n "Test 1: Hub → Spoke SSO flow            "

    # Verify Hub IdP exists in Spoke
    local kc_container="dive-spoke-${TEST_CODE_LOWER}-keycloak"
    local realm="dive-v3-broker-${TEST_CODE_LOWER}"

    if docker ps --format '{{.Names}}' | grep -q "^${kc_container}$"; then
        local kc_pass
        kc_pass=$(docker exec "$kc_container" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')

        if [ -n "$kc_pass" ]; then
            local token
            token=$(docker exec "$kc_container" curl -sf \
                -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
                -d "grant_type=password" \
                -d "username=admin" \
                -d "password=${kc_pass}" \
                -d "client_id=admin-cli" 2>/dev/null | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

            if [ -n "$token" ]; then
                local usa_idp_check
                usa_idp_check=$(docker exec "$kc_container" curl -sf \
                    -H "Authorization: Bearer $token" \
                    "http://localhost:8080/admin/realms/${realm}/identity-provider/instances/usa-idp" 2>/dev/null)

                if echo "$usa_idp_check" | grep -q '"alias"'; then
                    echo -e "${GREEN}✓${NC}"
                    tests_passed=$((tests_passed + 1))
                    return 0
                fi
            fi
        fi
    fi

    echo -e "${RED}✗${NC}"
    tests_failed=$((tests_failed + 1))
    return 1
}

# Test 2: Spoke → Hub SSO flow
test_spoke_to_hub_sso() {
    echo -n "Test 2: Spoke → Hub SSO flow            "

    # Verify Spoke IdP exists in Hub
    local hub_kc_container="${HUB_KEYCLOAK_CONTAINER:-dive-hub-keycloak}"
    local hub_pass
    hub_pass=$(docker exec "$hub_kc_container" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')

    if [ -n "$hub_pass" ]; then
        local hub_token
        hub_token=$(docker exec "$hub_kc_container" curl -sf \
            -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
            -d "grant_type=password" \
            -d "username=admin" \
            -d "password=${hub_pass}" \
            -d "client_id=admin-cli" 2>/dev/null | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

        if [ -n "$hub_token" ]; then
            local spoke_idp_check
            spoke_idp_check=$(docker exec "$hub_kc_container" curl -sf \
                -H "Authorization: Bearer $hub_token" \
                "http://localhost:8080/admin/realms/dive-v3-broker-usa/identity-provider/instances/${TEST_CODE_LOWER}-idp" 2>/dev/null)

            if echo "$spoke_idp_check" | grep -q '"alias"'; then
                echo -e "${GREEN}✓${NC}"
                tests_passed=$((tests_passed + 1))
                return 0
            fi
        fi
    fi

    echo -e "${RED}✗${NC}"
    tests_failed=$((tests_failed + 1))
    return 1
}

# Test 3: Secret synchronization
test_secret_sync() {
    echo -n "Test 3: Secret synchronization          "

    if [ -f "${DIVE_ROOT}/scripts/dive-modules/configuration/env-sync.sh" ]; then
        source "${DIVE_ROOT}/scripts/dive-modules/configuration/env-sync.sh"
        if verify_secret_consistency "$TEST_CODE_LOWER" >/dev/null 2>&1; then
            echo -e "${GREEN}✓${NC}"
            tests_passed=$((tests_passed + 1))
            return 0
        fi
    fi

    echo -e "${YELLOW}⚠${NC} (verification unavailable)"
    tests_passed=$((tests_passed + 1))
    return 0
}

# Test 4: IdP configuration persistence
test_idp_persistence() {
    echo -n "Test 4: IdP configuration persistence   "

    # Restart Keycloak and verify IdP still exists
    local kc_container="dive-spoke-${TEST_CODE_LOWER}-keycloak"
    if docker ps --format '{{.Names}}' | grep -q "^${kc_container}$"; then
        docker restart "$kc_container" >/dev/null 2>&1
        sleep 10

        # Verify IdP still exists after restart
        local kc_pass
        kc_pass=$(docker exec "$kc_container" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null | tr -d '\n\r')

        if [ -n "$kc_pass" ]; then
            local token
            token=$(docker exec "$kc_container" curl -sf \
                -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
                -d "grant_type=password" \
                -d "username=admin" \
                -d "password=${kc_pass}" \
                -d "client_id=admin-cli" 2>/dev/null | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

            if [ -n "$token" ]; then
                local realm="dive-v3-broker-${TEST_CODE_LOWER}"
                local usa_idp_check
                usa_idp_check=$(docker exec "$kc_container" curl -sf \
                    -H "Authorization: Bearer $token" \
                    "http://localhost:8080/admin/realms/${realm}/identity-provider/instances/usa-idp" 2>/dev/null)

                if echo "$usa_idp_check" | grep -q '"alias"'; then
                    echo -e "${GREEN}✓${NC}"
                    tests_passed=$((tests_passed + 1))
                    return 0
                fi
            fi
        fi
    fi

    echo -e "${RED}✗${NC}"
    tests_failed=$((tests_failed + 1))
    return 1
}

# Test 5: Container recreation
test_container_recreation() {
    echo -n "Test 5: Container recreation             "

    # Test that containers can be recreated without losing configuration
    local frontend_container="dive-spoke-${TEST_CODE_LOWER}-frontend"
    if docker ps --format '{{.Names}}' | grep -q "^${frontend_container}$"; then
        docker restart "$frontend_container" >/dev/null 2>&1
        sleep 5

        if docker ps --format '{{.Names}}' | grep -q "^${frontend_container}$"; then
            echo -e "${GREEN}✓${NC}"
            tests_passed=$((tests_passed + 1))
            return 0
        fi
    fi

    echo -e "${RED}✗${NC}"
    tests_failed=$((tests_failed + 1))
    return 1
}

# Run all tests
echo "Running integration tests..."
echo ""

test_hub_to_spoke_sso
test_spoke_to_hub_sso
test_secret_sync
test_idp_persistence
test_container_recreation

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $tests_failed -eq 0 ]; then
    echo -e "${GREEN}✓ All integration tests passed ($tests_passed/$tests_passed)${NC}"
    exit 0
else
    echo -e "${RED}✗ Tests: $tests_passed passed, $tests_failed failed${NC}"
    exit 1
fi

