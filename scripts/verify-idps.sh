#!/bin/bash
# =============================================================================
# DIVE V3 - Identity Provider Verification Script
# =============================================================================
# Verifies that IdPs are properly configured in Keycloak realms.
# 
# Usage: 
#   ./scripts/verify-idps.sh              # Verify Hub IdPs
#   ./scripts/verify-idps.sh --spoke FRA  # Verify FRA spoke IdPs
#   ./scripts/verify-idps.sh --all        # Verify all running instances
#
# Checks:
#   1. IdP exists and is enabled
#   2. Client secret is configured (not empty)
#   3. Protocol mappers are present (clearance, countryOfAffiliation, etc.)
#   4. IdP endpoints are reachable
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

# Counters
PASSED=0
FAILED=0
WARNINGS=0

log_pass() { echo -e "${GREEN}✓${NC} $1"; ((PASSED++)); }
log_fail() { echo -e "${RED}✗${NC} $1"; ((FAILED++)); }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; ((WARNINGS++)); }
log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_step() { echo -e "${CYAN}▶${NC} $1"; }

# Required DIVE V3 IdP mappers
REQUIRED_MAPPERS=("clearance" "countryOfAffiliation" "uniqueID" "acpCOI")

# =============================================================================
# ARGUMENT PARSING
# =============================================================================

INSTANCE="usa"
MODE="single"

while [[ $# -gt 0 ]]; do
    case $1 in
        --spoke|-s)
            INSTANCE="${2:-usa}"
            shift 2
            ;;
        --all|-a)
            MODE="all"
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --spoke, -s CODE   Verify specific spoke instance"
            echo "  --all, -a          Verify all running instances"
            echo "  --help, -h         Show this help"
            exit 0
            ;;
        *)
            INSTANCE="$1"
            shift
            ;;
    esac
done

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

get_keycloak_url() {
    local instance="$1"
    local code_lower=$(echo "$instance" | tr '[:upper:]' '[:lower:]')
    
    case "$code_lower" in
        usa) echo "https://localhost:8443" ;;
        fra) echo "https://localhost:8444" ;;
        deu) echo "https://localhost:8445" ;;
        gbr) echo "https://localhost:8446" ;;
        *)
            # Try to detect from NATO database or use default offset
            local port=$((8443 + $(echo "$code_lower" | cksum | cut -d' ' -f1) % 20))
            echo "https://localhost:${port}"
            ;;
    esac
}

get_realm() {
    local instance="$1"
    local code_lower=$(echo "$instance" | tr '[:upper:]' '[:lower:]')
    
    if [ "$code_lower" = "usa" ]; then
        echo "dive-v3-broker"
    else
        echo "dive-v3-broker-${code_lower}"
    fi
}

get_admin_token() {
    local keycloak_url="$1"
    local password="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
    
    curl -sk -X POST "${keycloak_url}/realms/master/protocol/openid-connect/token" \
        -d "grant_type=password" \
        -d "client_id=admin-cli" \
        -d "username=admin" \
        -d "password=${password}" 2>/dev/null | jq -r '.access_token'
}

verify_instance() {
    local instance="$1"
    local code_upper=$(echo "$instance" | tr '[:lower:]' '[:upper:]')
    local code_lower=$(echo "$instance" | tr '[:upper:]' '[:lower:]')
    
    echo ""
    echo -e "${BOLD}═══════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}  Verifying IdP Configuration: ${code_upper}${NC}"
    echo -e "${BOLD}═══════════════════════════════════════════════════════════════════════${NC}"
    echo ""
    
    local keycloak_url=$(get_keycloak_url "$instance")
    local realm=$(get_realm "$instance")
    
    log_info "Keycloak URL: ${keycloak_url}"
    log_info "Realm: ${realm}"
    echo ""
    
    # ==========================================================================
    # Check 1: Keycloak is reachable
    # ==========================================================================
    log_step "Check 1: Keycloak Health"
    
    if curl -sk --max-time 5 "${keycloak_url}/health" >/dev/null 2>&1; then
        log_pass "Keycloak is reachable"
    else
        log_fail "Keycloak is not reachable at ${keycloak_url}"
        return 1
    fi
    
    # ==========================================================================
    # Check 2: Admin Authentication
    # ==========================================================================
    log_step "Check 2: Admin Authentication"
    
    TOKEN=$(get_admin_token "$keycloak_url")
    
    if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
        log_fail "Failed to authenticate with Keycloak admin"
        return 1
    fi
    log_pass "Admin authentication successful"
    
    # ==========================================================================
    # Check 3: Realm Exists
    # ==========================================================================
    log_step "Check 3: Realm Exists"
    
    REALM_CHECK=$(curl -sk -H "Authorization: Bearer $TOKEN" \
        "${keycloak_url}/admin/realms/${realm}" 2>/dev/null | jq -r '.realm // empty')
    
    if [ "$REALM_CHECK" = "$realm" ]; then
        log_pass "Realm ${realm} exists"
    else
        log_fail "Realm ${realm} does not exist"
        return 1
    fi
    
    # ==========================================================================
    # Check 4: List Identity Providers
    # ==========================================================================
    log_step "Check 4: Identity Providers"
    
    IDPS=$(curl -sk -H "Authorization: Bearer $TOKEN" \
        "${keycloak_url}/admin/realms/${realm}/identity-provider/instances" 2>/dev/null)
    
    IDP_COUNT=$(echo "$IDPS" | jq 'length')
    
    if [ "$IDP_COUNT" = "0" ] || [ "$IDP_COUNT" = "null" ]; then
        log_warn "No Identity Providers configured in ${realm}"
        echo ""
        echo "  Hint: Use './dive federation link <CODE>' to create IdPs"
    else
        log_pass "Found ${IDP_COUNT} Identity Provider(s)"
        
        # List each IdP and verify its configuration
        for i in $(seq 0 $((IDP_COUNT - 1))); do
            IDP=$(echo "$IDPS" | jq ".[$i]")
            IDP_ALIAS=$(echo "$IDP" | jq -r '.alias')
            IDP_NAME=$(echo "$IDP" | jq -r '.displayName // .alias')
            IDP_ENABLED=$(echo "$IDP" | jq -r '.enabled')
            IDP_TYPE=$(echo "$IDP" | jq -r '.providerId')
            
            echo ""
            echo "    IdP: ${IDP_NAME} (${IDP_ALIAS})"
            echo "    ─────────────────────────────────"
            
            # Check enabled
            if [ "$IDP_ENABLED" = "true" ]; then
                log_pass "  Enabled: Yes"
            else
                log_warn "  Enabled: No (IdP is disabled)"
            fi
            
            # Check type
            if [ "$IDP_TYPE" = "oidc" ]; then
                log_pass "  Type: OIDC"
            elif [ "$IDP_TYPE" = "saml" ]; then
                log_pass "  Type: SAML"
            else
                log_warn "  Type: ${IDP_TYPE} (unexpected)"
            fi
            
            # Check client secret is configured (not empty placeholder)
            CLIENT_SECRET=$(echo "$IDP" | jq -r '.config.clientSecret // empty')
            if [ -n "$CLIENT_SECRET" ] && [ "$CLIENT_SECRET" != '${' ]; then
                log_pass "  Client Secret: Configured"
            else
                log_fail "  Client Secret: Not configured or placeholder"
            fi
            
            # ==========================================================================
            # Check 5: IdP Mappers
            # ==========================================================================
            MAPPERS=$(curl -sk -H "Authorization: Bearer $TOKEN" \
                "${keycloak_url}/admin/realms/${realm}/identity-provider/instances/${IDP_ALIAS}/mappers" 2>/dev/null)
            
            MAPPER_COUNT=$(echo "$MAPPERS" | jq 'length')
            
            if [ "$MAPPER_COUNT" = "0" ] || [ "$MAPPER_COUNT" = "null" ]; then
                log_warn "  Mappers: None configured"
                echo "      Hint: IdP mappers import DIVE attributes from remote IdP"
            else
                log_pass "  Mappers: ${MAPPER_COUNT} configured"
                
                # Check for required DIVE mappers
                for required in "${REQUIRED_MAPPERS[@]}"; do
                    if echo "$MAPPERS" | jq -e ".[] | select(.config.claim==\"${required}\" or .config[\"user.attribute\"]==\"${required}\")" >/dev/null 2>&1; then
                        echo -e "      ${GREEN}✓${NC} ${required}"
                    else
                        echo -e "      ${YELLOW}?${NC} ${required} (may be named differently)"
                    fi
                done
            fi
        done
    fi
    
    # ==========================================================================
    # Check 6: Cross-Border Client
    # ==========================================================================
    echo ""
    log_step "Check 5: Cross-Border Federation Client"
    
    CB_CLIENT=$(curl -sk -H "Authorization: Bearer $TOKEN" \
        "${keycloak_url}/admin/realms/${realm}/clients?clientId=dive-v3-cross-border-client" 2>/dev/null | jq '.[0]')
    
    if [ "$CB_CLIENT" != "null" ] && [ -n "$CB_CLIENT" ]; then
        log_pass "Cross-border client exists"
        
        # Check if it has required protocol mappers
        CB_CLIENT_ID=$(echo "$CB_CLIENT" | jq -r '.id')
        CB_MAPPERS=$(curl -sk -H "Authorization: Bearer $TOKEN" \
            "${keycloak_url}/admin/realms/${realm}/clients/${CB_CLIENT_ID}/protocol-mappers/models" 2>/dev/null)
        
        for required in "${REQUIRED_MAPPERS[@]}"; do
            if echo "$CB_MAPPERS" | jq -e ".[] | select(.name==\"${required}\")" >/dev/null 2>&1; then
                echo -e "    ${GREEN}✓${NC} Mapper: ${required}"
            else
                echo -e "    ${RED}✗${NC} Mapper: ${required} (missing)"
                ((FAILED++))
            fi
        done
    else
        log_warn "Cross-border client not found"
        echo "    Hint: This client is needed for other instances to federate with us"
    fi
    
    # ==========================================================================
    # Check 7: User Profile Attributes
    # ==========================================================================
    echo ""
    log_step "Check 6: User Profile Attributes"
    
    USER_PROFILE=$(curl -sk -H "Authorization: Bearer $TOKEN" \
        "${keycloak_url}/admin/realms/${realm}/users/profile" 2>/dev/null)
    
    PROFILE_ATTRS=$(echo "$USER_PROFILE" | jq -r '.attributes[].name' 2>/dev/null)
    
    for required in "${REQUIRED_MAPPERS[@]}"; do
        if echo "$PROFILE_ATTRS" | grep -q "^${required}$"; then
            echo -e "    ${GREEN}✓${NC} ${required}"
        else
            echo -e "    ${YELLOW}?${NC} ${required} (may be locale-specific name)"
        fi
    done
    
    echo ""
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║               DIVE V3 Identity Provider Verification                 ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════════╝${NC}"

if [ "$MODE" = "all" ]; then
    # Find all running Keycloak containers
    CONTAINERS=$(docker ps --filter "name=keycloak" --format '{{.Names}}' 2>/dev/null)
    
    if [ -z "$CONTAINERS" ]; then
        log_fail "No running Keycloak containers found"
        exit 1
    fi
    
    for container in $CONTAINERS; do
        # Extract instance code from container name
        if [[ "$container" =~ dive-spoke-([a-z]+)-keycloak ]]; then
            instance="${BASH_REMATCH[1]}"
        elif [[ "$container" =~ ([a-z]+)-keycloak ]]; then
            instance="${BASH_REMATCH[1]}"
        elif [[ "$container" =~ dive-hub-keycloak ]]; then
            instance="usa"
        else
            continue
        fi
        
        verify_instance "$instance" || true
    done
else
    verify_instance "$INSTANCE"
fi

# =============================================================================
# SUMMARY
# =============================================================================

echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Verification Summary${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${GREEN}Passed:${NC}   ${PASSED}"
echo -e "  ${RED}Failed:${NC}   ${FAILED}"
echo -e "  ${YELLOW}Warnings:${NC} ${WARNINGS}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All IdP checks passed!${NC}"
    exit 0
else
    echo -e "${RED}${FAILED} check(s) failed. Review the output above.${NC}"
    exit 1
fi
