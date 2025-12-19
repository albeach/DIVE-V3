#!/usr/bin/env bash
# =============================================================================
# DIVE V3 Federation Secret Sync
# =============================================================================
# Syncs cross-border client secrets between spokes and the Hub
# This ensures federation works after spoke initialization
#
# Usage: ./sync-federation-secrets.sh <INSTANCE_CODE>
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTANCE_CODE="${1:-}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }
log_step() { echo -e "${CYAN}▶${NC} $1"; }

if [[ -z "$INSTANCE_CODE" ]]; then
    echo "Usage: $0 <INSTANCE_CODE>"
    echo "Example: $0 BEL"
    exit 1
fi

CODE_LOWER=$(echo "$INSTANCE_CODE" | tr '[:upper:]' '[:lower:]')
CODE_UPPER=$(echo "$INSTANCE_CODE" | tr '[:lower:]' '[:upper:]')

# Skip if this is the Hub (USA)
if [[ "$CODE_UPPER" == "USA" ]]; then
    log_info "Skipping Hub (USA) - no federation sync needed"
    exit 0
fi

log_step "Syncing federation secrets for ${CODE_UPPER}..."

# Load instance configuration - try multiple sources
INSTANCE_DIR="instances/${CODE_LOWER}"
SPOKE_KC_PORT=""

# Source 1: instance.json
if [[ -f "${INSTANCE_DIR}/instance.json" ]]; then
    SPOKE_KC_PORT=$(jq -r '.ports.keycloak_https // empty' "${INSTANCE_DIR}/instance.json")
fi

# Source 2: Detect from running container port mapping
if [[ -z "$SPOKE_KC_PORT" ]]; then
    SPOKE_KC_PORT=$(docker port "dive-spoke-${CODE_LOWER}-keycloak" 8443/tcp 2>/dev/null | sed 's/.*://' | head -1)
fi

# Source 3: Use nato-countries.sh port offsets
if [[ -z "$SPOKE_KC_PORT" ]] && [[ -f "${SCRIPT_DIR}/../nato-countries.sh" ]]; then
    source "${SCRIPT_DIR}/../nato-countries.sh"
    OFFSET=$(get_country_offset "$CODE_UPPER" 2>/dev/null || echo "")
    if [[ -n "$OFFSET" ]]; then
        SPOKE_KC_PORT=$((8443 + OFFSET))
    fi
fi

# Source 4: Hardcoded fallbacks for known countries
if [[ -z "$SPOKE_KC_PORT" ]]; then
    case "$CODE_UPPER" in
        ALB) SPOKE_KC_PORT=8444 ;;
        BEL) SPOKE_KC_PORT=8445 ;;
        DNK) SPOKE_KC_PORT=8449 ;;
        NOR) SPOKE_KC_PORT=8456 ;;
        POL) SPOKE_KC_PORT=8458 ;;
        FRA) SPOKE_KC_PORT=8446 ;;
        GBR) SPOKE_KC_PORT=8447 ;;
        DEU) SPOKE_KC_PORT=8448 ;;
        *) SPOKE_KC_PORT=8444 ;;  # Default offset 1
    esac
fi

log_info "Using Keycloak port: ${SPOKE_KC_PORT}"

# Container names (new naming pattern: dive-spoke-lva-keycloak)
SPOKE_KC_CONTAINER="dive-spoke-${CODE_LOWER}-keycloak"
HUB_BACKEND_CONTAINER="dive-hub-backend"

# Get spoke admin password
SPOKE_KC_PASSWORD=$(docker exec "$SPOKE_KC_CONTAINER" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null)
if [[ -z "$SPOKE_KC_PASSWORD" ]]; then
    log_error "Could not get Keycloak admin password from ${SPOKE_KC_CONTAINER}"
    exit 1
fi

# Get Hub admin password
HUB_KC_PASSWORD=$(docker exec "$HUB_BACKEND_CONTAINER" printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null)
if [[ -z "$HUB_KC_PASSWORD" ]]; then
    log_error "Could not get Hub Keycloak admin password"
    exit 1
fi

log_info "Getting admin tokens..."

# Get spoke admin token
SPOKE_TOKEN=$(curl -sk -X POST "https://localhost:${SPOKE_KC_PORT}/realms/master/protocol/openid-connect/token" \
    -d "username=admin" \
    -d "password=${SPOKE_KC_PASSWORD}" \
    -d "grant_type=password" \
    -d "client_id=admin-cli" | jq -r '.access_token')

if [[ -z "$SPOKE_TOKEN" || "$SPOKE_TOKEN" == "null" ]]; then
    log_error "Could not get spoke admin token (port ${SPOKE_KC_PORT})"
    exit 1
fi

# Get Hub admin token
HUB_TOKEN=$(curl -sk -X POST "https://localhost:8443/realms/master/protocol/openid-connect/token" \
    -d "username=admin" \
    -d "password=${HUB_KC_PASSWORD}" \
    -d "grant_type=password" \
    -d "client_id=admin-cli" | jq -r '.access_token')

if [[ -z "$HUB_TOKEN" || "$HUB_TOKEN" == "null" ]]; then
    log_error "Could not get Hub admin token"
    exit 1
fi

log_success "Got admin tokens"

# Get the spoke's cross-border client secret
log_info "Getting spoke's cross-border client secret..."
SPOKE_REALM="dive-v3-broker-${CODE_LOWER}"
CLIENT_UUID=$(curl -sk "https://localhost:${SPOKE_KC_PORT}/admin/realms/${SPOKE_REALM}/clients" \
    -H "Authorization: Bearer ${SPOKE_TOKEN}" | jq -r '.[] | select(.clientId == "dive-v3-cross-border-client") | .id')

if [[ -z "$CLIENT_UUID" || "$CLIENT_UUID" == "null" ]]; then
    log_error "Cross-border client not found in ${SPOKE_REALM}"
    exit 1
fi

SPOKE_SECRET=$(curl -sk "https://localhost:${SPOKE_KC_PORT}/admin/realms/${SPOKE_REALM}/clients/${CLIENT_UUID}/client-secret" \
    -H "Authorization: Bearer ${SPOKE_TOKEN}" | jq -r '.value')

if [[ -z "$SPOKE_SECRET" || "$SPOKE_SECRET" == "null" ]]; then
    log_error "Could not get cross-border client secret"
    exit 1
fi

log_success "Got spoke client secret: ${SPOKE_SECRET:0:10}..."

# Update the Hub's IdP with the correct secret
log_info "Updating Hub's ${CODE_LOWER}-idp with correct secret..."
IDP_ALIAS="${CODE_LOWER}-idp"

# Get current IdP config
CURRENT_IDP=$(curl -sk "https://localhost:8443/admin/realms/dive-v3-broker/identity-provider/instances/${IDP_ALIAS}" \
    -H "Authorization: Bearer ${HUB_TOKEN}")

if [[ -z "$CURRENT_IDP" || "$CURRENT_IDP" == "null" || $(echo "$CURRENT_IDP" | jq -r '.alias // empty') == "" ]]; then
    log_warn "IdP ${IDP_ALIAS} not found on Hub - it may need to be created first"
    log_info "Run: ./dive --instance ${CODE_UPPER} federation approve"
    exit 0
fi

# Update with correct secret
UPDATED_IDP=$(echo "$CURRENT_IDP" | jq --arg secret "$SPOKE_SECRET" '.config.clientSecret = $secret')

# PUT the update
HTTP_CODE=$(curl -sk -o /dev/null -w "%{http_code}" -X PUT \
    "https://localhost:8443/admin/realms/dive-v3-broker/identity-provider/instances/${IDP_ALIAS}" \
    -H "Authorization: Bearer ${HUB_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$UPDATED_IDP")

if [[ "$HTTP_CODE" == "204" || "$HTTP_CODE" == "200" ]]; then
    log_success "Updated Hub's ${IDP_ALIAS} with correct client secret"
else
    log_error "Failed to update Hub IdP (HTTP ${HTTP_CODE})"
    exit 1
fi

# Also sync the Hub's cross-border client secret TO the spoke's usa-idp
log_info "Syncing Hub's client secret to spoke's usa-idp..."

# Get Hub's cross-border client secret
HUB_CLIENT_UUID=$(curl -sk "https://localhost:8443/admin/realms/dive-v3-broker/clients" \
    -H "Authorization: Bearer ${HUB_TOKEN}" | jq -r '.[] | select(.clientId == "dive-v3-cross-border-client") | .id')

if [[ -n "$HUB_CLIENT_UUID" && "$HUB_CLIENT_UUID" != "null" ]]; then
    HUB_SECRET=$(curl -sk "https://localhost:8443/admin/realms/dive-v3-broker/clients/${HUB_CLIENT_UUID}/client-secret" \
        -H "Authorization: Bearer ${HUB_TOKEN}" | jq -r '.value')

    if [[ -n "$HUB_SECRET" && "$HUB_SECRET" != "null" ]]; then
        # Update spoke's usa-idp
        SPOKE_USA_IDP=$(curl -sk "https://localhost:${SPOKE_KC_PORT}/admin/realms/${SPOKE_REALM}/identity-provider/instances/usa-idp" \
            -H "Authorization: Bearer ${SPOKE_TOKEN}")

        if [[ -n "$SPOKE_USA_IDP" && $(echo "$SPOKE_USA_IDP" | jq -r '.alias // empty') != "" ]]; then
            UPDATED_USA_IDP=$(echo "$SPOKE_USA_IDP" | jq --arg secret "$HUB_SECRET" '.config.clientSecret = $secret')

            HTTP_CODE=$(curl -sk -o /dev/null -w "%{http_code}" -X PUT \
                "https://localhost:${SPOKE_KC_PORT}/admin/realms/${SPOKE_REALM}/identity-provider/instances/usa-idp" \
                -H "Authorization: Bearer ${SPOKE_TOKEN}" \
                -H "Content-Type: application/json" \
                -d "$UPDATED_USA_IDP")

            if [[ "$HTTP_CODE" == "204" || "$HTTP_CODE" == "200" ]]; then
                log_success "Updated spoke's usa-idp with Hub's client secret"
            else
                log_warn "Could not update spoke's usa-idp (HTTP ${HTTP_CODE})"
            fi
        else
            log_info "Spoke doesn't have usa-idp configured (that's OK for some setups)"
        fi
    fi
fi

echo ""
log_success "Federation secrets synced for ${CODE_UPPER}!"
echo ""
echo "You can now authenticate:"
echo "  • Hub → ${CODE_UPPER}: Go to https://localhost:3000, click ${CODE_UPPER}"
echo "  • ${CODE_UPPER} → Hub: Go to spoke frontend, click USA"
