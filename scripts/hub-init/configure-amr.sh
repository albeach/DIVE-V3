#!/bin/bash
# =============================================================================
# DIVE V3 AMR Configuration Script
#
# Purpose: Ensures AMR (Authentication Methods Reference) is properly configured
#          in Keycloak after startup. This script is idempotent and can be run
#          multiple times safely.
#
# Background: Keycloak 26's native oidc-amr-mapper doesn't populate AMR claims
#             because standard authenticators lack "reference" config properties.
#             WORKAROUND: Use user attribute mapper for AMR claim.
#
# This script:
#   1. Ensures User Profile has AMR attribute defined
#   2. Ensures client has AMR user attribute mapper (not oidc-amr-mapper)
#   3. Syncs AMR attributes for users with OTP credentials
#
# Usage: Called automatically by ./dive hub up, or manually:
#        ./scripts/hub-init/configure-amr.sh [--sync-users]
#
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_step()    { echo -e "${BLUE}▶${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warn()    { echo -e "${YELLOW}⚠${NC} $1"; }
log_error()   { echo -e "${RED}✗${NC} $1"; }
log_info()    { echo -e "${CYAN}ℹ${NC} $1"; }

# Parse arguments
SYNC_USERS=false
while [[ $# -gt 0 ]]; do
    case "$1" in
        --sync-users)
            SYNC_USERS=true
            shift
            ;;
        *)
            shift
            ;;
    esac
done

# Configuration
KEYCLOAK_URL="${KEYCLOAK_URL:-https://localhost:8443}"
REALM_NAME="${REALM_NAME:-dive-v3-broker}"
CLIENT_ID="${CLIENT_ID:-dive-v3-client-broker}"
ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-}"

# Get admin password from container if not set
if [ -z "$ADMIN_PASSWORD" ]; then
    ADMIN_PASSWORD=$(docker exec dive-hub-keycloak printenv KEYCLOAK_ADMIN_PASSWORD 2>/dev/null || echo "")
fi

if [ -z "$ADMIN_PASSWORD" ]; then
    log_error "KEYCLOAK_ADMIN_PASSWORD not found"
    exit 1
fi

log_step "Configuring AMR for DIVE V3..."

# Authenticate with Keycloak
TOKEN=$(curl -sk -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
    -d "grant_type=password" \
    -d "client_id=admin-cli" \
    -d "username=${ADMIN_USER}" \
    -d "password=${ADMIN_PASSWORD}" 2>/dev/null | jq -r '.access_token')

if [ -z "$TOKEN" ] || [ "$TOKEN" == "null" ]; then
    log_error "Failed to authenticate with Keycloak"
    exit 1
fi

# Get client UUID
CLIENT_UUID=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients?clientId=${CLIENT_ID}" \
    -H "Authorization: Bearer $TOKEN" | jq -r '.[0].id')

if [ -z "$CLIENT_UUID" ] || [ "$CLIENT_UUID" == "null" ]; then
    log_error "Client not found: ${CLIENT_ID}"
    exit 1
fi

# =============================================================================
# Step 1: Ensure User Profile has AMR attribute
# =============================================================================
log_step "Checking User Profile configuration..."

EXISTING_ATTRS=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users/profile" \
    -H "Authorization: Bearer $TOKEN" | jq -r '.attributes[].name' 2>/dev/null | tr '\n' ' ')

if [[ ! "$EXISTING_ATTRS" =~ "amr" ]]; then
    log_info "Adding AMR to User Profile..."

    # Get current profile and add AMR attribute
    CURRENT_PROFILE=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users/profile" \
        -H "Authorization: Bearer $TOKEN")

    UPDATED_PROFILE=$(echo "$CURRENT_PROFILE" | jq '.attributes += [{
        "name": "amr",
        "displayName": "Authentication Methods Reference",
        "permissions": {"view": ["admin"], "edit": ["admin"]},
        "multivalued": true
    }]')

    curl -sk -X PUT "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users/profile" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "$UPDATED_PROFILE" > /dev/null 2>&1

    log_success "AMR attribute added to User Profile"
else
    log_success "User Profile already has AMR attribute"
fi

# =============================================================================
# Step 2: Ensure AMR mapper uses user attribute (not oidc-amr-mapper)
# =============================================================================
log_step "Checking AMR protocol mapper..."

# Get existing AMR mappers
EXISTING_AMR=$(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/protocol-mappers/models" \
    -H "Authorization: Bearer $TOKEN" | jq -r '.[] | select(.name | test("amr"; "i"))')

AMR_MAPPER_TYPE=$(echo "$EXISTING_AMR" | jq -r '.protocolMapper // empty' | head -1)

if [ "$AMR_MAPPER_TYPE" == "oidc-amr-mapper" ]; then
    log_warn "Found oidc-amr-mapper (doesn't work with standard authenticators)"
    log_info "Replacing with user attribute mapper..."

    # Delete existing oidc-amr-mapper
    for mapper_id in $(curl -sk "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/protocol-mappers/models" \
        -H "Authorization: Bearer $TOKEN" | jq -r '.[] | select(.protocolMapper == "oidc-amr-mapper") | .id'); do
        curl -sk -X DELETE "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/protocol-mappers/models/${mapper_id}" \
            -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1
    done

    # Create user attribute mapper
    curl -sk -X POST "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/protocol-mappers/models" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
            "name": "amr (user attribute)",
            "protocol": "openid-connect",
            "protocolMapper": "oidc-usermodel-attribute-mapper",
            "consentRequired": false,
            "config": {
                "user.attribute": "amr",
                "claim.name": "amr",
                "id.token.claim": "true",
                "access.token.claim": "true",
                "userinfo.token.claim": "true",
                "introspection.token.claim": "true",
                "multivalued": "true",
                "aggregate.attrs": "false",
                "jsonType.label": "String"
            }
        }' > /dev/null 2>&1

    log_success "AMR mapper updated to user attribute mapper"
elif [ "$AMR_MAPPER_TYPE" == "oidc-usermodel-attribute-mapper" ]; then
    log_success "AMR mapper already using user attribute mapper"
elif [ -z "$AMR_MAPPER_TYPE" ]; then
    log_info "No AMR mapper found, creating user attribute mapper..."

    curl -sk -X POST "${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/protocol-mappers/models" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
            "name": "amr (user attribute)",
            "protocol": "openid-connect",
            "protocolMapper": "oidc-usermodel-attribute-mapper",
            "consentRequired": false,
            "config": {
                "user.attribute": "amr",
                "claim.name": "amr",
                "id.token.claim": "true",
                "access.token.claim": "true",
                "userinfo.token.claim": "true",
                "introspection.token.claim": "true",
                "multivalued": "true",
                "aggregate.attrs": "false",
                "jsonType.label": "String"
            }
        }' > /dev/null 2>&1

    log_success "AMR user attribute mapper created"
fi

# =============================================================================
# Step 3: Optionally sync AMR for users with OTP credentials
# =============================================================================
if [ "$SYNC_USERS" == "true" ]; then
    log_step "Syncing AMR attributes for users..."
    bash "${PROJECT_ROOT}/scripts/sync-amr-attributes.sh"
fi

log_success "AMR configuration complete"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  AMR Configuration Summary:"
echo "    ✓ User Profile: AMR attribute defined"
echo "    ✓ Protocol Mapper: Using user attribute mapper"
echo ""
echo "  To sync AMR for all users based on credentials:"
echo "    ./dive hub amr sync"
echo "═══════════════════════════════════════════════════════════════"


