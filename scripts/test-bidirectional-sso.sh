#!/usr/bin/env bash
# Test bidirectional SSO between spokes
# Reuses existing federation logic from simulate-federation-flow.sh and test.sh

set -e

# Load common functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -z "$DIVE_COMMON_LOADED" ]; then
    source "${SCRIPT_DIR}/scripts/dive-modules/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

test_bidirectional_sso() {
    local source_spoke="${1:-ALB}"
    local target_spoke="${2:-FRA}"
    local source_lower
    source_lower=$(lower "$source_spoke")
    local target_lower
    target_lower=$(lower "$target_spoke")
    local source_upper
    source_upper=$(upper "$source_spoke")
    local target_upper
    target_upper=$(upper "$target_spoke")

    echo "🔄 Testing Bidirectional SSO: $source_upper ↔ $target_upper"
    echo "=================================================="

    # Get spoke configurations
    eval "$(get_instance_ports "$source_spoke")"
    local source_port="${SPOKE_BACKEND_HTTPS_PORT:-4000}"
    local source_kc_port="${SPOKE_KEYCLOAK_HTTPS_PORT:-8443}"

    eval "$(get_instance_ports "$target_spoke")"
    local target_port="${SPOKE_BACKEND_HTTPS_PORT:-4000}"
    local target_kc_port="${SPOKE_KEYCLOAK_HTTPS_PORT:-8443}"

    echo "Source ($source_upper): Backend port $source_port, Keycloak port $source_kc_port"
    echo "Target ($target_upper): Backend port $target_port, Keycloak port $target_kc_port"
    echo ""

    local tests_passed=0
    local tests_total=0

    # Test 1: Source user can authenticate locally
    ((tests_total++))
    echo -n "[$source_upper→$target_upper] Source user authentication: "
    local source_token
    source_token=$(curl -sk --max-time 5 -X POST \
        "https://localhost:${source_kc_port}/realms/dive-v3-broker-${source_lower}/protocol/openid-connect/token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "client_id=dive-v3-broker-${source_lower}&client_secret=dive-v3-broker-${source_lower}-secret&username=testuser-${source_lower}-1&password=testuser-${source_lower}-1&grant_type=password" 2>/dev/null | jq -r '.access_token // empty')

    if [ -n "$source_token" ] && [ "$source_token" != "null" ]; then
        echo -e "${GREEN}✓ PASS${NC} (Token obtained)"
        ((tests_passed++))
    else
        echo -e "${RED}✗ FAIL${NC} (Cannot authenticate $source_upper user)"
    fi

    # Test 2: Source user can access target protected resource
    ((tests_total++))
    echo -n "[$source_upper→$target_upper] Cross-spoke resource access: "
    local cross_access
    cross_access=$(curl -sk --max-time 5 \
        -H "Authorization: Bearer $source_token" \
        "https://localhost:${target_port}/api/auth/session" 2>/dev/null | jq -r '.user.name // empty')

    if [ -n "$cross_access" ] && [ "$cross_access" != "null" ]; then
        echo -e "${GREEN}✓ PASS${NC} (User: $cross_access)"
        ((tests_passed++))
    else
        echo -e "${RED}✗ FAIL${NC} ($source_upper user cannot access $target_upper resource)"
    fi

    # Test 3: Target user can authenticate locally
    ((tests_total++))
    echo -n "[$target_upper→$source_upper] Target user authentication: "
    local target_token
    target_token=$(curl -sk --max-time 5 -X POST \
        "https://localhost:${target_kc_port}/realms/dive-v3-broker-${target_lower}/protocol/openid-connect/token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "client_id=dive-v3-broker-${target_lower}&client_secret=dive-v3-broker-${target_lower}-secret&username=testuser-${target_lower}-1&password=testuser-${target_lower}-1&grant_type=password" 2>/dev/null | jq -r '.access_token // empty')

    if [ -n "$target_token" ] && [ "$target_token" != "null" ]; then
        echo -e "${GREEN}✓ PASS${NC} (Token obtained)"
        ((tests_passed++))
    else
        echo -e "${RED}✗ FAIL${NC} (Cannot authenticate $target_upper user)"
    fi

    # Test 4: Target user can access source protected resource
    ((tests_total++))
    echo -n "[$target_upper→$source_upper] Cross-spoke resource access: "
    local reverse_access
    reverse_access=$(curl -sk --max-time 5 \
        -H "Authorization: Bearer $target_token" \
        "https://localhost:${source_port}/api/auth/session" 2>/dev/null | jq -r '.user.name // empty')

    if [ -n "$reverse_access" ] && [ "$reverse_access" != "null" ]; then
        echo -e "${GREEN}✓ PASS${NC} (User: $reverse_access)"
        ((tests_passed++))
    else
        echo -e "${RED}✗ FAIL${NC} ($target_upper user cannot access $source_upper resource)"
    fi

    # Test 5: Check Hub IdP configuration
    ((tests_total++))
    echo -n "[$source_upper↔$target_upper] Hub federation configuration: "
    local hub_token
    hub_token=$(curl -sk --max-time 5 -X POST \
        "https://localhost:8443/realms/master/protocol/openid-connect/token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "client_id=admin-cli&username=admin&password=KeycloakAdminSecure123!&grant_type=password" 2>/dev/null | jq -r '.access_token // empty')

    if [ -n "$hub_token" ]; then
        local source_idp
        source_idp=$(curl -sk --max-time 5 \
            -H "Authorization: Bearer $hub_token" \
            "https://localhost:8443/admin/realms/dive-v3-broker-usa/identity-provider/instances/${source_lower}-idp" 2>/dev/null | jq -r '.alias // empty')

        local target_idp
        target_idp=$(curl -sk --max-time 5 \
            -H "Authorization: Bearer $hub_token" \
            "https://localhost:8443/admin/realms/dive-v3-broker-usa/identity-provider/instances/${target_lower}-idp" 2>/dev/null | jq -r '.alias // empty')

        if [ "$source_idp" = "${source_lower}-idp" ] && [ "$target_idp" = "${target_lower}-idp" ]; then
            echo -e "${GREEN}✓ PASS${NC} (Both IdPs configured)"
            ((tests_passed++))
        else
            echo -e "${RED}✗ FAIL${NC} (Missing IdPs: $source_idp, $target_idp)"
        fi
    else
        echo -e "${RED}✗ FAIL${NC} (Cannot access Hub admin)"
    fi

    echo ""
    echo "Bidirectional SSO Test Results: $tests_passed/$tests_total passed"

    if [ $tests_passed -eq $tests_total ]; then
        echo -e "${GREEN}🎉 SUCCESS: $source_upper ↔ $target_upper bidirectional SSO is working!${NC}"
        return 0
    else
        echo -e "${RED}❌ FAILURE: $source_upper ↔ $target_upper bidirectional SSO is NOT working${NC}"
        echo ""
        echo "Troubleshooting:"
        echo "1. Ensure both spokes are running: ./dive spoke up $source_upper && ./dive spoke up $target_upper"
        echo "2. Check federation setup: ./dive federation-setup register-hub $source_upper && ./dive federation-setup register-hub $target_upper"
        echo "3. Verify users exist: Check instances/$source_lower/test-credentials.txt and instances/$target_lower/test-credentials.txt"
        return 1
    fi
}

# Main execution
if [ $# -lt 2 ]; then
    echo "Usage: $0 <source_spoke> <target_spoke>"
    echo "Example: $0 ALB FRA"
    exit 1
fi

test_bidirectional_sso "$1" "$2"
