#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - ACR/AMR Mapper Verification Script
# =============================================================================
# Verifies that all Keycloak instances have the correct ACR/AMR mappers
# configured for proper federation.
#
# Usage: ./scripts/verify-acr-amr-mappers.sh
#
# Exit codes:
#   0 - All checks passed
#   1 - One or more checks failed
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

log_pass() { echo -e "${GREEN}✓${NC} $1"; ((PASS_COUNT++)); }
log_fail() { echo -e "${RED}✗${NC} $1"; ((FAIL_COUNT++)); }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; ((WARN_COUNT++)); }
log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_header() { echo -e "\n${CYAN}═══ $1 ═══${NC}"; }

# Get admin token for a Keycloak container
get_token() {
    local container=$1
    local pass=$(docker exec $container printenv KC_BOOTSTRAP_ADMIN_PASSWORD 2>/dev/null || docker exec $container printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null)
    docker exec $container curl -sf -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
        -d "grant_type=password" -d "username=admin" -d "password=${pass}" -d "client_id=admin-cli" 2>/dev/null | \
        grep -o '"access_token":"[^"]*' | cut -d'"' -f4
}

# Check if container is running
is_running() {
    docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^$1$"
}

# =============================================================================
# HUB VERIFICATION
# =============================================================================

verify_hub() {
    log_header "HUB (USA) Verification"
    
    local container="dive-hub-keycloak"
    if ! is_running "$container"; then
        log_fail "Hub Keycloak not running"
        return 1
    fi
    
    local token=$(get_token $container)
    if [ -z "$token" ]; then
        log_fail "Cannot authenticate to Hub Keycloak"
        return 1
    fi
    
    # Get broker client UUID
    local client_uuid=$(docker exec $container curl -sf "http://localhost:8080/admin/realms/dive-v3-broker-usa/clients?clientId=dive-v3-broker-usa" \
        -H "Authorization: Bearer $token" | jq -r '.[0].id // empty')
    
    if [ -z "$client_uuid" ]; then
        log_fail "dive-v3-broker-usa client not found on Hub"
        return 1
    fi
    
    log_pass "dive-v3-broker-usa client exists"
    
    # Check mappers
    local mappers=$(docker exec $container curl -sf "http://localhost:8080/admin/realms/dive-v3-broker-usa/clients/${client_uuid}/protocol-mappers/models" \
        -H "Authorization: Bearer $token")
    
    # Check for AMR fallback mapper with correct type
    local amr_fallback=$(echo "$mappers" | jq -r '.[] | select(.name == "amr-user-attribute-fallback")')
    if [ -n "$amr_fallback" ]; then
        local json_type=$(echo "$amr_fallback" | jq -r '.config["jsonType.label"] // "not set"')
        if [ "$json_type" == "String" ]; then
            log_pass "amr-user-attribute-fallback mapper: jsonType=String (correct)"
        else
            log_fail "amr-user-attribute-fallback mapper: jsonType=$json_type (should be String)"
        fi
    else
        log_fail "amr-user-attribute-fallback mapper NOT FOUND"
    fi
    
    # Check for ACR fallback mapper with correct type
    local acr_fallback=$(echo "$mappers" | jq -r '.[] | select(.name == "acr-user-attribute-fallback")')
    if [ -n "$acr_fallback" ]; then
        local json_type=$(echo "$acr_fallback" | jq -r '.config["jsonType.label"] // "not set"')
        if [ "$json_type" == "String" ]; then
            log_pass "acr-user-attribute-fallback mapper: jsonType=String (correct)"
        else
            log_fail "acr-user-attribute-fallback mapper: jsonType=$json_type (should be String)"
        fi
    else
        log_fail "acr-user-attribute-fallback mapper NOT FOUND"
    fi
    
    # Check for native session mappers
    local native_amr=$(echo "$mappers" | jq -r '.[] | select(.protocolMapper == "oidc-amr-mapper") | .name')
    if [ -n "$native_amr" ]; then
        log_pass "Native oidc-amr-mapper present"
    else
        log_warn "Native oidc-amr-mapper not found (OK for federated-only scenarios)"
    fi
}

# =============================================================================
# SPOKE VERIFICATION
# =============================================================================

verify_spoke() {
    local code=$1
    local code_lower=$(echo "$code" | tr '[:upper:]' '[:lower:]')
    local code_upper=$(echo "$code" | tr '[:lower:]' '[:upper:]')
    
    log_header "SPOKE ($code_upper) Verification"
    
    local container="dive-spoke-${code_lower}-keycloak"
    if ! is_running "$container"; then
        log_warn "Spoke $code_upper Keycloak not running (skipping)"
        return 0
    fi
    
    local token=$(get_token $container)
    if [ -z "$token" ]; then
        log_fail "Cannot authenticate to $code_upper Keycloak"
        return 1
    fi
    
    # Get dive-v3-broker-usa client UUID (the client Hub uses to federate TO this spoke)
    local usa_client=$(docker exec $container curl -sf "http://localhost:8080/admin/realms/dive-v3-broker-${code_lower}/clients?clientId=dive-v3-broker-usa" \
        -H "Authorization: Bearer $token" | jq -r '.[0].id // empty')
    
    if [ -z "$usa_client" ]; then
        log_fail "dive-v3-broker-usa client not found on $code_upper"
        return 1
    fi
    
    log_pass "dive-v3-broker-usa client exists"
    
    # Check mappers
    local mappers=$(docker exec $container curl -sf "http://localhost:8080/admin/realms/dive-v3-broker-${code_lower}/clients/${usa_client}/protocol-mappers/models" \
        -H "Authorization: Bearer $token")
    
    # Check for AMR user-attribute mapper with correct type
    local amr_mapper=$(echo "$mappers" | jq -r '.[] | select(.protocolMapper == "oidc-usermodel-attribute-mapper" and (.name | test("amr"; "i")))')
    if [ -n "$amr_mapper" ]; then
        local json_type=$(echo "$amr_mapper" | jq -r '.config["jsonType.label"] // "not set"')
        local multivalued=$(echo "$amr_mapper" | jq -r '.config["multivalued"] // "not set"')
        if [ "$json_type" == "String" ] && [ "$multivalued" == "true" ]; then
            log_pass "AMR user-attribute mapper: jsonType=String, multivalued=true (correct)"
        else
            log_fail "AMR user-attribute mapper: jsonType=$json_type, multivalued=$multivalued (should be String, true)"
        fi
    else
        log_fail "AMR user-attribute mapper NOT FOUND"
    fi
    
    # Check frontendUrl matches exposed port
    local frontend_url=$(docker exec $container curl -sf "http://localhost:8080/admin/realms/dive-v3-broker-${code_lower}" \
        -H "Authorization: Bearer $token" | jq -r '.attributes.frontendUrl // "not set"')
    local exposed_port=$(docker port "$container" 8443 2>/dev/null | cut -d: -f2 || echo "unknown")
    
    if [[ "$frontend_url" == *":$exposed_port"* ]]; then
        log_pass "frontendUrl ($frontend_url) matches exposed port ($exposed_port)"
    else
        log_fail "frontendUrl ($frontend_url) does NOT match exposed port ($exposed_port)"
    fi
}

# =============================================================================
# MAIN
# =============================================================================

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "  DIVE V3 - ACR/AMR Mapper Verification"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""
echo "This script verifies that all Keycloak instances have the correct"
echo "ACR/AMR mappers configured for proper federation."
echo ""
echo "Key requirements:"
echo "  1. Hub must have amr/acr-user-attribute-fallback mappers with jsonType=String"
echo "  2. Spokes must have AMR user-attribute mapper on dive-v3-broker-usa client"
echo "  3. Spoke frontendUrl must match the exposed Docker port"
echo ""

# Verify Hub
verify_hub

# Find and verify all running spokes
SPOKE_CONTAINERS=$(docker ps --format '{{.Names}}' | grep 'dive-spoke-.*-keycloak' | sed 's/dive-spoke-\(.*\)-keycloak/\1/' || true)

if [ -n "$SPOKE_CONTAINERS" ]; then
    for spoke in $SPOKE_CONTAINERS; do
        verify_spoke "$spoke"
    done
else
    log_info "No spoke containers found running"
fi

# Summary
log_header "Summary"
echo ""
echo "  Passed:   $PASS_COUNT"
echo "  Failed:   $FAIL_COUNT"
echo "  Warnings: $WARN_COUNT"
echo ""

if [ $FAIL_COUNT -gt 0 ]; then
    echo -e "${RED}❌ Verification FAILED - $FAIL_COUNT issue(s) found${NC}"
    echo ""
    echo "To fix issues, see: HANDOFF_ACR_AMR_COMPLETE_FIX.md"
    exit 1
else
    echo -e "${GREEN}✅ Verification PASSED - All checks OK${NC}"
    exit 0
fi
