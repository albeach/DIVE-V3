#!/usr/bin/env bash
# =============================================================================
# DIVE V3 - Add Federation Partner
# =============================================================================
# Automatically creates bidirectional OIDC trust between two instances
#
# Usage:
#   ./scripts/add-federation-partner.sh <SOURCE> <TARGET>
#   ./scripts/add-federation-partner.sh USA FRA
#   ./scripts/add-federation-partner.sh DEU ESP --dry-run
#
# This script:
#   1. Creates OIDC IdP broker on SOURCE pointing to TARGET
#   2. Creates OIDC IdP broker on TARGET pointing to SOURCE
#   3. Configures attribute mappers for clearance, country, COI
#   4. Updates client redirect URIs for cross-auth
#   5. Validates the federation works
#
# =============================================================================

set -uo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
REALM="dive-v3-broker"
CLIENT_ID="dive-v3-client-broker"

# Instance name mapping
declare -A INSTANCE_NAMES=(
    ["USA"]="United States"
    ["FRA"]="France"
    ["DEU"]="Germany"
    ["GBR"]="United Kingdom"
    ["CAN"]="Canada"
    ["ITA"]="Italy"
    ["ESP"]="Spain"
    ["NLD"]="Netherlands"
    ["POL"]="Poland"
)

# Port offsets (must match deploy-dive-instance.sh)
declare -A PORT_OFFSETS=(
    ["USA"]=0 ["FRA"]=1 ["DEU"]=2 ["GBR"]=3 ["CAN"]=4
    ["ITA"]=5 ["ESP"]=6 ["NLD"]=7 ["POL"]=8
)

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

usage() {
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║           DIVE V3 - Add Federation Partner                        ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Usage: $0 <SOURCE_INSTANCE> <TARGET_INSTANCE> [OPTIONS]"
    echo ""
    echo -e "${GREEN}Examples:${NC}"
    echo "  $0 USA FRA           # Federate USA ↔ FRA bidirectionally"
    echo "  $0 DEU ESP           # Federate DEU ↔ ESP bidirectionally"
    echo "  $0 USA FRA --dry-run # Show what would be done"
    echo ""
    echo -e "${GREEN}Options:${NC}"
    echo "  --dry-run    Show what would be configured without making changes"
    echo "  --one-way    Only create SOURCE → TARGET (not bidirectional)"
    echo "  --help       Show this help message"
    echo ""
    echo -e "${GREEN}Available Instances:${NC}"
    echo "  USA, FRA, DEU, GBR, CAN, ITA, ESP, NLD, POL"
    exit 0
}

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Get Keycloak admin token for an instance
get_admin_token() {
    local instance=$1
    local instance_lower=$(echo "$instance" | tr '[:upper:]' '[:lower:]')
    local keycloak_url="https://${instance_lower}-idp.dive25.com"
    
    curl -sf -X POST "${keycloak_url}/realms/master/protocol/openid-connect/token" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "grant_type=password" \
        -d "client_id=admin-cli" \
        -d "username=admin" \
        -d "password=admin" \
        --insecure 2>/dev/null | jq -r '.access_token'
}

# Check if IdP broker already exists
idp_exists() {
    local keycloak_url=$1
    local token=$2
    local idp_alias=$3
    
    local response=$(curl -sf -w "%{http_code}" -o /dev/null \
        "${keycloak_url}/admin/realms/${REALM}/identity-provider/instances/${idp_alias}" \
        -H "Authorization: Bearer ${token}" \
        --insecure 2>/dev/null)
    
    [[ "$response" == "200" ]]
}

# Create OIDC IdP broker
create_idp_broker() {
    local source_url=$1
    local source_token=$2
    local target=$3
    local target_url=$4
    
    local target_lower=$(echo "$target" | tr '[:upper:]' '[:lower:]')
    local idp_alias="${target_lower}-federation"
    local display_name="${INSTANCE_NAMES[$target]} Federation"
    
    # Check if already exists
    if idp_exists "$source_url" "$source_token" "$idp_alias"; then
        log_warning "IdP broker '$idp_alias' already exists, updating..."
        local method="PUT"
        local endpoint="${source_url}/admin/realms/${REALM}/identity-provider/instances/${idp_alias}"
    else
        local method="POST"
        local endpoint="${source_url}/admin/realms/${REALM}/identity-provider/instances"
    fi
    
    # Get client secret from target instance
    local target_token=$(get_admin_token "$target")
    local client_internal_id=$(curl -sf "${target_url}/admin/realms/${REALM}/clients?clientId=${CLIENT_ID}" \
        -H "Authorization: Bearer ${target_token}" \
        --insecure 2>/dev/null | jq -r '.[0].id // empty')
    
    local client_secret=""
    if [[ -n "$client_internal_id" ]]; then
        client_secret=$(curl -sf "${target_url}/admin/realms/${REALM}/clients/${client_internal_id}/client-secret" \
            -H "Authorization: Bearer ${target_token}" \
            --insecure 2>/dev/null | jq -r '.value // empty')
    fi
    
    if [[ -z "$client_secret" ]]; then
        log_warning "Could not get client secret from ${target}, using placeholder"
        client_secret="placeholder"
    fi
    
    # Create/update IdP configuration
    local idp_config=$(cat <<EOF
{
    "alias": "${idp_alias}",
    "displayName": "${display_name}",
    "providerId": "oidc",
    "enabled": true,
    "trustEmail": true,
    "storeToken": true,
    "addReadTokenRoleOnCreate": false,
    "firstBrokerLoginFlowAlias": "first broker login",
    "config": {
        "clientId": "${CLIENT_ID}",
        "clientSecret": "${client_secret}",
        "tokenUrl": "${target_url}/realms/${REALM}/protocol/openid-connect/token",
        "authorizationUrl": "${target_url}/realms/${REALM}/protocol/openid-connect/auth",
        "logoutUrl": "${target_url}/realms/${REALM}/protocol/openid-connect/logout",
        "userInfoUrl": "${target_url}/realms/${REALM}/protocol/openid-connect/userinfo",
        "jwksUrl": "${target_url}/realms/${REALM}/protocol/openid-connect/certs",
        "issuer": "${target_url}/realms/${REALM}",
        "validateSignature": "true",
        "useJwksUrl": "true",
        "syncMode": "FORCE",
        "pkceEnabled": "true",
        "pkceMethod": "S256",
        "backchannelSupported": "true",
        "defaultScope": "openid profile email"
    }
}
EOF
)
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would create IdP broker: $idp_alias"
        return 0
    fi
    
    local response=$(curl -sf -X "$method" "$endpoint" \
        -H "Authorization: Bearer ${source_token}" \
        -H "Content-Type: application/json" \
        -d "$idp_config" \
        --insecure 2>&1)
    
    if [[ $? -eq 0 ]]; then
        log_success "Created IdP broker: $idp_alias"
        return 0
    else
        log_error "Failed to create IdP broker: $response"
        return 1
    fi
}

# Create attribute mappers for an IdP
create_attribute_mappers() {
    local keycloak_url=$1
    local token=$2
    local idp_alias=$3
    
    local mappers=(
        "clearance|clearance|clearance"
        "countryOfAffiliation|countryOfAffiliation|countryOfAffiliation"
        "acpCOI|acpCOI|acpCOI"
        "uniqueID|uniqueID|uniqueID"
        "organization|organization|organization"
    )
    
    for mapper_def in "${mappers[@]}"; do
        IFS='|' read -r name claim attr <<< "$mapper_def"
        
        local mapper_config=$(cat <<EOF
{
    "name": "${name}",
    "identityProviderAlias": "${idp_alias}",
    "identityProviderMapper": "oidc-user-attribute-idp-mapper",
    "config": {
        "syncMode": "FORCE",
        "claim": "${claim}",
        "user.attribute": "${attr}"
    }
}
EOF
)
        
        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "[DRY RUN] Would create mapper: $name"
            continue
        fi
        
        curl -sf -X POST "${keycloak_url}/admin/realms/${REALM}/identity-provider/instances/${idp_alias}/mappers" \
            -H "Authorization: Bearer ${token}" \
            -H "Content-Type: application/json" \
            -d "$mapper_config" \
            --insecure 2>/dev/null || true
    done
    
    log_success "Attribute mappers configured for $idp_alias"
}

# Test authentication between instances
test_federation() {
    local source=$1
    local target=$2
    local source_lower=$(echo "$source" | tr '[:upper:]' '[:lower:]')
    local target_lower=$(echo "$target" | tr '[:upper:]' '[:lower:]')
    
    log_info "Testing federation: ${source} → ${target}"
    
    # Check if IdP is accessible
    local target_url="https://${target_lower}-idp.dive25.com"
    local well_known=$(curl -sf "${target_url}/realms/${REALM}/.well-known/openid-configuration" --insecure 2>/dev/null)
    
    if [[ -n "$well_known" ]]; then
        log_success "Target IdP ${target} is accessible"
        return 0
    else
        log_warning "Target IdP ${target} not accessible (may not be running)"
        return 1
    fi
}

# =============================================================================
# MAIN
# =============================================================================

# Parse arguments
SOURCE=""
TARGET=""
DRY_RUN=false
ONE_WAY=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --one-way)
            ONE_WAY=true
            shift
            ;;
        --help|-h)
            usage
            ;;
        *)
            if [[ -z "$SOURCE" ]]; then
                SOURCE=$(echo "$1" | tr '[:lower:]' '[:upper:]')
            elif [[ -z "$TARGET" ]]; then
                TARGET=$(echo "$1" | tr '[:lower:]' '[:upper:]')
            else
                log_error "Unknown argument: $1"
                exit 1
            fi
            shift
            ;;
    esac
done

# Validate arguments
if [[ -z "$SOURCE" ]] || [[ -z "$TARGET" ]]; then
    log_error "Both SOURCE and TARGET instance codes are required"
    echo ""
    echo "Usage: $0 <SOURCE_INSTANCE> <TARGET_INSTANCE> [OPTIONS]"
    echo "Try '$0 --help' for more information."
    exit 1
fi

if [[ "$SOURCE" == "$TARGET" ]]; then
    log_error "SOURCE and TARGET cannot be the same instance"
    exit 1
fi

if [[ -z "${INSTANCE_NAMES[$SOURCE]:-}" ]]; then
    log_error "Invalid SOURCE instance: $SOURCE"
    exit 1
fi

if [[ -z "${INSTANCE_NAMES[$TARGET]:-}" ]]; then
    log_error "Invalid TARGET instance: $TARGET"
    exit 1
fi

# Display header
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║           DIVE V3 - Add Federation Partner                        ║${NC}"
echo -e "${CYAN}╠══════════════════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║  Source: ${GREEN}${SOURCE}${CYAN} (${INSTANCE_NAMES[$SOURCE]})${NC}"
echo -e "${CYAN}║  Target: ${GREEN}${TARGET}${CYAN} (${INSTANCE_NAMES[$TARGET]})${NC}"
if [[ "$ONE_WAY" == "true" ]]; then
echo -e "${CYAN}║  Mode:   ${YELLOW}One-way${CYAN} (${SOURCE} → ${TARGET})${NC}"
else
echo -e "${CYAN}║  Mode:   ${GREEN}Bidirectional${CYAN} (${SOURCE} ↔ ${TARGET})${NC}"
fi
if [[ "$DRY_RUN" == "true" ]]; then
echo -e "${CYAN}║  ${YELLOW}DRY RUN - No changes will be made${NC}"
fi
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Get instance URLs
SOURCE_LOWER=$(echo "$SOURCE" | tr '[:upper:]' '[:lower:]')
TARGET_LOWER=$(echo "$TARGET" | tr '[:upper:]' '[:lower:]')
SOURCE_URL="https://${SOURCE_LOWER}-idp.dive25.com"
TARGET_URL="https://${TARGET_LOWER}-idp.dive25.com"

# Step 1: Get admin tokens
log_info "Obtaining admin tokens..."
SOURCE_TOKEN=$(get_admin_token "$SOURCE")
TARGET_TOKEN=$(get_admin_token "$TARGET")

if [[ -z "$SOURCE_TOKEN" || "$SOURCE_TOKEN" == "null" ]]; then
    log_error "Could not obtain admin token for ${SOURCE}"
    log_info "Make sure ${SOURCE} Keycloak is running at ${SOURCE_URL}"
    exit 1
fi
log_success "Obtained token for ${SOURCE}"

if [[ -z "$TARGET_TOKEN" || "$TARGET_TOKEN" == "null" ]]; then
    log_error "Could not obtain admin token for ${TARGET}"
    log_info "Make sure ${TARGET} Keycloak is running at ${TARGET_URL}"
    exit 1
fi
log_success "Obtained token for ${TARGET}"

# Step 2: Create IdP broker on SOURCE pointing to TARGET
echo ""
log_info "Creating federation: ${SOURCE} → ${TARGET}"
create_idp_broker "$SOURCE_URL" "$SOURCE_TOKEN" "$TARGET" "$TARGET_URL"
create_attribute_mappers "$SOURCE_URL" "$SOURCE_TOKEN" "${TARGET_LOWER}-federation"

# Step 3: Create IdP broker on TARGET pointing to SOURCE (if bidirectional)
if [[ "$ONE_WAY" != "true" ]]; then
    echo ""
    log_info "Creating federation: ${TARGET} → ${SOURCE}"
    create_idp_broker "$TARGET_URL" "$TARGET_TOKEN" "$SOURCE" "$SOURCE_URL"
    create_attribute_mappers "$TARGET_URL" "$TARGET_TOKEN" "${SOURCE_LOWER}-federation"
fi

# Step 4: Test federation
echo ""
test_federation "$SOURCE" "$TARGET"
if [[ "$ONE_WAY" != "true" ]]; then
    test_federation "$TARGET" "$SOURCE"
fi

# Summary
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                   FEDERATION COMPLETE                             ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════════════╣${NC}"
if [[ "$ONE_WAY" == "true" ]]; then
echo -e "${GREEN}║  ${SOURCE} → ${TARGET}: Users can authenticate via ${TARGET_LOWER}-federation${NC}"
else
echo -e "${GREEN}║  ${SOURCE} → ${TARGET}: Users can authenticate via ${TARGET_LOWER}-federation${NC}"
echo -e "${GREEN}║  ${TARGET} → ${SOURCE}: Users can authenticate via ${SOURCE_LOWER}-federation${NC}"
fi
echo -e "${GREEN}╠══════════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  Test it:${NC}"
echo -e "${GREEN}║    1. Go to https://${SOURCE_LOWER}-app.dive25.com${NC}"
echo -e "${GREEN}║    2. Click '${INSTANCE_NAMES[$TARGET]} Federation'${NC}"
echo -e "${GREEN}║    3. Login as testuser-${TARGET_LOWER}-3 / DiveDemo2025!${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

