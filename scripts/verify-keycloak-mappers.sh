#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Keycloak Protocol Mapper Verification Script
# =============================================================================
# Verifies that all required protocol mappers are configured in Keycloak
# for proper attribute flow in federation.
#
# Usage: ./scripts/verify-keycloak-mappers.sh <COUNTRY_CODE> [OPTIONS]
#
# Examples:
#   ./scripts/verify-keycloak-mappers.sh POL         # Verify Poland mappers
#   ./scripts/verify-keycloak-mappers.sh USA         # Verify USA hub mappers
#   ./scripts/verify-keycloak-mappers.sh --all       # Verify all running instances
#   ./scripts/verify-keycloak-mappers.sh POL --fix   # Verify and fix missing mappers
#
# Required mappers:
#   - clearance           (user attribute → token claim)
#   - countryOfAffiliation(user attribute → token claim)
#   - uniqueID            (user attribute → token claim)
#   - acpCOI              (user attribute → token claim, multivalued)
#   - organization        (user attribute → token claim)
#   - organizationType    (user attribute → token claim)
#   - realm roles         (realm_access.roles)
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Load NATO countries database if available
if [[ -f "$SCRIPT_DIR/nato-countries.sh" ]]; then
    source "$SCRIPT_DIR/nato-countries.sh"
fi

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# Required mappers for DIVE V3 attribute flow
REQUIRED_MAPPERS=(
    "clearance"
    "countryOfAffiliation"
    "uniqueID"
    "acpCOI"
    "organization"
    "organizationType"
)

# Optional but recommended mappers
OPTIONAL_MAPPERS=(
    "realm roles"
    "acr"
    "amr"
    "auth_time"
)

# Parse arguments
COUNTRY_CODE=""
FIX_MODE=false
VERBOSE=false
ALL_MODE=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --fix|-f)
            FIX_MODE=true
            shift
            ;;
        --verbose|-v)
            VERBOSE=true
            shift
            ;;
        --all|-a)
            ALL_MODE=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 <COUNTRY_CODE> [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --fix, -f      Fix missing mappers automatically"
            echo "  --verbose, -v  Show detailed output"
            echo "  --all, -a      Verify all running instances"
            echo "  --help, -h     Show this help"
            echo ""
            echo "Examples:"
            echo "  $0 POL             Verify Poland instance"
            echo "  $0 USA             Verify USA hub"
            echo "  $0 POL --fix       Verify and fix Poland"
            echo "  $0 --all           Verify all running instances"
            exit 0
            ;;
        *)
            COUNTRY_CODE="${1^^}"
            shift
            ;;
    esac
done

# =============================================================================
# Helper Functions
# =============================================================================

log_info() { echo -e "${CYAN}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }
log_header() { 
    echo ""
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}  $1${NC}"
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

get_keycloak_url() {
    local code="$1"
    local code_lower="${code,,}"
    
    if [[ "$code" == "USA" ]]; then
        echo "https://localhost:8443"
    elif is_nato_country "$code" 2>/dev/null; then
        eval "$(get_country_ports "$code")"
        echo "https://localhost:${SPOKE_KEYCLOAK_HTTPS_PORT}"
    else
        # Fallback: try to detect from running container
        local port=$(docker port "${code_lower}-keycloak-${code_lower}-1" 8443 2>/dev/null | cut -d: -f2 || echo "")
        if [[ -n "$port" ]]; then
            echo "https://localhost:${port}"
        else
            echo ""
        fi
    fi
}

get_admin_token() {
    local kc_url="$1"
    local password="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
    
    curl -sk -X POST "${kc_url}/realms/master/protocol/openid-connect/token" \
        -d "client_id=admin-cli" \
        -d "username=admin" \
        -d "password=${password}" \
        -d "grant_type=password" 2>/dev/null | jq -r '.access_token // empty'
}

get_realm_name() {
    local code="$1"
    local code_lower="${code,,}"
    
    if [[ "$code" == "USA" ]]; then
        echo "dive-v3-broker-usa"
    else
        echo "dive-v3-broker-${code_lower}"
    fi
}

get_client_id() {
    local code="$1"
    local code_lower="${code,,}"
    
    echo "dive-v3-broker-usa"
}

# =============================================================================
# Mapper Verification
# =============================================================================

verify_mappers() {
    local code="$1"
    local code_lower="${code,,}"
    local name=""
    local flag=""
    
    # Get country info
    if is_nato_country "$code" 2>/dev/null; then
        name=$(get_country_name "$code")
        flag=$(get_country_flag "$code")
    else
        name="$code"
        flag="🏳️"
    fi
    
    log_header "$name ($code) $flag - Protocol Mappers"
    
    # Get Keycloak URL
    local kc_url=$(get_keycloak_url "$code")
    if [[ -z "$kc_url" ]]; then
        log_error "Could not determine Keycloak URL for $code"
        return 1
    fi
    log_info "Keycloak URL: $kc_url"
    
    # Get admin token
    local token=$(get_admin_token "$kc_url")
    if [[ -z "$token" || "$token" == "null" ]]; then
        log_error "Failed to authenticate with Keycloak"
        log_info "Try setting KEYCLOAK_ADMIN_PASSWORD environment variable"
        return 1
    fi
    log_success "Admin authentication successful"
    
    # Get realm and client info
    local realm=$(get_realm_name "$code")
    local client_id=$(get_client_id "$code")
    
    log_info "Realm: $realm"
    log_info "Client: $client_id"
    
    # Check if realm exists
    local realm_exists=$(curl -sk -H "Authorization: Bearer $token" \
        "${kc_url}/admin/realms/${realm}" 2>/dev/null | jq -r '.realm // empty')
    
    if [[ -z "$realm_exists" ]]; then
        log_error "Realm '$realm' does not exist"
        return 1
    fi
    log_success "Realm exists: $realm"
    
    # Get client UUID
    local client_uuid=$(curl -sk -H "Authorization: Bearer $token" \
        "${kc_url}/admin/realms/${realm}/clients?clientId=${client_id}" 2>/dev/null | \
        jq -r '.[0].id // empty')
    
    if [[ -z "$client_uuid" ]]; then
        log_error "Client '$client_id' not found in realm"
        return 1
    fi
    log_success "Client found: $client_id"
    
    # Get all mappers for the client
    local mappers_json=$(curl -sk -H "Authorization: Bearer $token" \
        "${kc_url}/admin/realms/${realm}/clients/${client_uuid}/protocol-mappers/models" 2>/dev/null)
    
    local mapper_names=$(echo "$mappers_json" | jq -r '.[].name // empty' 2>/dev/null)
    
    echo ""
    echo -e "  ${CYAN}Required Mappers:${NC}"
    
    local missing_required=0
    local found_required=0
    
    for mapper in "${REQUIRED_MAPPERS[@]}"; do
        if echo "$mapper_names" | grep -qw "$mapper"; then
            log_success "  $mapper"
            ((found_required++))
        else
            log_error "  $mapper (MISSING)"
            ((missing_required++))
            
            if [[ "$FIX_MODE" == "true" ]]; then
                create_mapper "$kc_url" "$token" "$realm" "$client_uuid" "$mapper"
            fi
        fi
    done
    
    echo ""
    echo -e "  ${CYAN}Optional Mappers:${NC}"
    
    local missing_optional=0
    local found_optional=0
    
    for mapper in "${OPTIONAL_MAPPERS[@]}"; do
        if echo "$mapper_names" | grep -qw "$mapper"; then
            echo -e "    ${GREEN}✓${NC} $mapper"
            ((found_optional++))
        else
            echo -e "    ${DIM}○${NC} $mapper (optional, not present)"
            ((missing_optional++))
        fi
    done
    
    # Verbose: show all mappers
    if [[ "$VERBOSE" == "true" ]]; then
        echo ""
        echo -e "  ${CYAN}All Mappers Found:${NC}"
        echo "$mappers_json" | jq -r '.[] | "    - \(.name) (\(.protocolMapper))"' 2>/dev/null
    fi
    
    # Verify IdP mappers if federation partners exist
    echo ""
    echo -e "  ${CYAN}Federation IdP Mappers:${NC}"
    
    local idps=$(curl -sk -H "Authorization: Bearer $token" \
        "${kc_url}/admin/realms/${realm}/identity-provider/instances" 2>/dev/null)
    
    local idp_count=$(echo "$idps" | jq 'length' 2>/dev/null || echo "0")
    
    if [[ "$idp_count" -gt 0 ]]; then
        log_info "  Found $idp_count identity provider(s)"
        
        for alias in $(echo "$idps" | jq -r '.[].alias' 2>/dev/null); do
            local idp_mappers=$(curl -sk -H "Authorization: Bearer $token" \
                "${kc_url}/admin/realms/${realm}/identity-provider/instances/${alias}/mappers" 2>/dev/null)
            
            local idp_mapper_count=$(echo "$idp_mappers" | jq 'length' 2>/dev/null || echo "0")
            
            if [[ "$idp_mapper_count" -ge 4 ]]; then
                log_success "  $alias: $idp_mapper_count mappers"
            else
                log_warn "  $alias: $idp_mapper_count mappers (should have at least 4)"
            fi
        done
    else
        log_info "  No identity providers configured (OK for hub)"
    fi
    
    # Summary
    echo ""
    echo -e "${BOLD}  Summary:${NC}"
    echo "    Required: $found_required/${#REQUIRED_MAPPERS[@]} present"
    echo "    Optional: $found_optional/${#OPTIONAL_MAPPERS[@]} present"
    
    if [[ $missing_required -gt 0 ]]; then
        echo ""
        log_error "$missing_required required mapper(s) missing!"
        if [[ "$FIX_MODE" != "true" ]]; then
            log_info "Run with --fix to create missing mappers"
        fi
        return 1
    else
        echo ""
        log_success "All required mappers present"
        return 0
    fi
}

create_mapper() {
    local kc_url="$1"
    local token="$2"
    local realm="$3"
    local client_uuid="$4"
    local mapper_name="$5"
    
    local multivalued="false"
    local json_type="String"
    
    # Special handling for acpCOI (multivalued)
    if [[ "$mapper_name" == "acpCOI" ]]; then
        multivalued="true"
    fi
    
    local payload=$(cat <<EOF
{
    "name": "${mapper_name}",
    "protocol": "openid-connect",
    "protocolMapper": "oidc-usermodel-attribute-mapper",
    "config": {
        "user.attribute": "${mapper_name}",
        "claim.name": "${mapper_name}",
        "id.token.claim": "true",
        "access.token.claim": "true",
        "userinfo.token.claim": "true",
        "jsonType.label": "${json_type}",
        "multivalued": "${multivalued}"
    }
}
EOF
)
    
    local result=$(curl -sk -X POST "${kc_url}/admin/realms/${realm}/clients/${client_uuid}/protocol-mappers/models" \
        -H "Authorization: Bearer $token" \
        -H "Content-Type: application/json" \
        -d "$payload" 2>/dev/null)
    
    if [[ -z "$result" || "$result" == "{}" ]]; then
        log_success "    Created mapper: $mapper_name"
    else
        local error=$(echo "$result" | jq -r '.errorMessage // empty')
        if [[ -n "$error" ]]; then
            log_error "    Failed to create $mapper_name: $error"
        fi
    fi
}

# =============================================================================
# Token Verification
# =============================================================================

verify_token_claims() {
    local code="$1"
    local code_lower="${code,,}"
    
    log_header "Token Claim Verification - $code"
    
    local kc_url=$(get_keycloak_url "$code")
    local realm=$(get_realm_name "$code")
    local client_id=$(get_client_id "$code")
    
    log_info "Attempting to fetch a test token..."
    log_info "Looking for test user: pilot-${code_lower}-l2"
    
    # Try to get a token for a test user
    local token_response=$(curl -sk -X POST "${kc_url}/realms/${realm}/protocol/openid-connect/token" \
        -d "grant_type=password" \
        -d "client_id=${client_id}" \
        -d "client_secret=${KEYCLOAK_CLIENT_SECRET:-}" \
        -d "username=pilot-${code_lower}-l2" \
        -d "password=${TEST_USER_PASSWORD:-TestPassword123!}" \
        2>/dev/null)
    
    local access_token=$(echo "$token_response" | jq -r '.access_token // empty')
    
    if [[ -z "$access_token" ]]; then
        log_warn "Could not fetch test token (this is normal if direct grants are disabled)"
        log_info "To test token claims, authenticate via browser and inspect the token"
        return 0
    fi
    
    # Decode and verify claims
    local claims=$(echo "$access_token" | cut -d. -f2 | base64 -d 2>/dev/null | jq '.')
    
    echo ""
    echo -e "  ${CYAN}Token Claims:${NC}"
    
    for claim in clearance countryOfAffiliation uniqueID acpCOI organization organizationType; do
        local value=$(echo "$claims" | jq -r ".${claim} // empty")
        if [[ -n "$value" ]]; then
            log_success "  $claim: $value"
        else
            log_error "  $claim: NOT PRESENT"
        fi
    done
    
    return 0
}

# =============================================================================
# Main Execution
# =============================================================================

echo "═══════════════════════════════════════════════════════════════════════"
echo "  DIVE V3 - Keycloak Protocol Mapper Verification"
echo "═══════════════════════════════════════════════════════════════════════"

if [[ "$ALL_MODE" == "true" ]]; then
    # Verify all running instances
    log_info "Verifying all running instances..."
    
    # Always verify hub
    verify_mappers "USA" || true
    
    # Find running spokes
    for code in $(echo "${!NATO_COUNTRIES[@]:-}" | tr ' ' '\n' | sort); do
        if [[ "$code" == "USA" ]]; then continue; fi
        
        local code_lower="${code,,}"
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "${code_lower}-keycloak\|keycloak-${code_lower}"; then
            verify_mappers "$code" || true
        fi
    done
    
elif [[ -n "$COUNTRY_CODE" ]]; then
    verify_mappers "$COUNTRY_CODE"
    
    if [[ "$VERBOSE" == "true" ]]; then
        verify_token_claims "$COUNTRY_CODE"
    fi
else
    echo ""
    echo "Usage: $0 <COUNTRY_CODE> [OPTIONS]"
    echo ""
    echo "Run with --help for more information"
    exit 1
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "  Verification Complete"
echo "═══════════════════════════════════════════════════════════════════════"
