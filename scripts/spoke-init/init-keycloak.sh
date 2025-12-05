#!/bin/bash
# =============================================================================
# DIVE V3 Spoke Keycloak Initialization
# =============================================================================
# Creates realm, client, scopes, and test users in Keycloak
# Usage: ./init-keycloak.sh <INSTANCE_CODE> [KEYCLOAK_URL] [ADMIN_PASSWORD]
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTANCE_CODE="${1:-}"
PUBLIC_KEYCLOAK_URL="${2:-}"
ADMIN_PASSWORD="${3:-}"

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
    echo "Usage: $0 <INSTANCE_CODE> [KEYCLOAK_URL] [ADMIN_PASSWORD]"
    echo "Example: $0 FRA https://fra-idp.dive25.com"
    exit 1
fi

CODE_LOWER=$(echo "$INSTANCE_CODE" | tr '[:upper:]' '[:lower:]')
CODE_UPPER=$(echo "$INSTANCE_CODE" | tr '[:lower:]' '[:upper:]')
REALM_NAME="dive-v3-broker-${CODE_LOWER}"
CLIENT_ID="dive-v3-client-${CODE_LOWER}"

# Load configuration from .env
INSTANCE_DIR="instances/${CODE_LOWER}"
if [[ -f "${INSTANCE_DIR}/.env" ]]; then
    source "${INSTANCE_DIR}/.env"
fi

# Set defaults
PUBLIC_KEYCLOAK_URL="${PUBLIC_KEYCLOAK_URL:-https://${CODE_LOWER}-idp.dive25.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-${KEYCLOAK_ADMIN_PASSWORD:-admin}}"
CLIENT_SECRET="${KEYCLOAK_CLIENT_SECRET:-$(openssl rand -hex 32)}"
FRONTEND_URL="${FRONTEND_URL:-https://${CODE_LOWER}-app.dive25.com}"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         DIVE V3 Spoke Keycloak Initialization                ║"
echo "║                Instance: ${CODE_UPPER}                                    ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
log_info "Keycloak URL: ${PUBLIC_KEYCLOAK_URL}"
log_info "Realm: ${REALM_NAME}"
log_info "Client: ${CLIENT_ID}"
echo ""

# =============================================================================
# Get Admin Token
# =============================================================================
log_step "Authenticating with Keycloak Admin API..."

TOKEN=$(curl -sk -X POST "${PUBLIC_KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
    -d "client_id=admin-cli" \
    -d "username=admin" \
    -d "password=${ADMIN_PASSWORD}" \
    -d "grant_type=password" 2>/dev/null | jq -r '.access_token')

if [[ -z "$TOKEN" || "$TOKEN" == "null" ]]; then
    log_error "Failed to get admin token. Check Keycloak URL and credentials."
    exit 1
fi
log_success "Admin authentication successful"

# =============================================================================
# Create Realm (if not exists)
# =============================================================================
log_step "Creating realm: ${REALM_NAME}..."

REALM_EXISTS=$(curl -sk -H "Authorization: Bearer $TOKEN" \
    "${PUBLIC_KEYCLOAK_URL}/admin/realms/${REALM_NAME}" 2>/dev/null | jq -r '.realm // empty')

if [[ -n "$REALM_EXISTS" ]]; then
    log_warn "Realm already exists, skipping creation"
else
    curl -sk -X POST "${PUBLIC_KEYCLOAK_URL}/admin/realms" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"realm\": \"${REALM_NAME}\",
            \"enabled\": true,
            \"displayName\": \"DIVE V3 - ${CODE_UPPER} Instance\",
            \"registrationAllowed\": false,
            \"loginWithEmailAllowed\": true,
            \"duplicateEmailsAllowed\": false,
            \"resetPasswordAllowed\": true,
            \"editUsernameAllowed\": false,
            \"bruteForceProtected\": true,
            \"accessTokenLifespan\": 900,
            \"ssoSessionMaxLifespan\": 28800,
            \"offlineSessionMaxLifespan\": 2592000
        }" 2>/dev/null
    log_success "Realm created: ${REALM_NAME}"
fi

# =============================================================================
# Create OAuth Scopes
# =============================================================================
log_step "Creating OAuth scopes..."

for SCOPE in openid profile email; do
    SCOPE_EXISTS=$(curl -sk -H "Authorization: Bearer $TOKEN" \
        "${PUBLIC_KEYCLOAK_URL}/admin/realms/${REALM_NAME}/client-scopes" 2>/dev/null | \
        jq -r ".[] | select(.name==\"${SCOPE}\") | .name")
    
    if [[ -z "$SCOPE_EXISTS" ]]; then
        curl -sk -X POST "${PUBLIC_KEYCLOAK_URL}/admin/realms/${REALM_NAME}/client-scopes" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "{
                \"name\": \"${SCOPE}\",
                \"protocol\": \"openid-connect\",
                \"attributes\": {
                    \"include.in.token.scope\": \"true\",
                    \"display.on.consent.screen\": \"true\"
                }
            }" 2>/dev/null
        log_success "Created scope: ${SCOPE}"
    else
        log_info "Scope exists: ${SCOPE}"
    fi
done

# =============================================================================
# Create OAuth Client
# =============================================================================
log_step "Creating OAuth client: ${CLIENT_ID}..."

CLIENT_EXISTS=$(curl -sk -H "Authorization: Bearer $TOKEN" \
    "${PUBLIC_KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients?clientId=${CLIENT_ID}" 2>/dev/null | \
    jq -r '.[0].id // empty')

if [[ -n "$CLIENT_EXISTS" ]]; then
    log_warn "Client already exists, updating..."
    CLIENT_UUID="$CLIENT_EXISTS"
else
    # Create client
    curl -sk -X POST "${PUBLIC_KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"clientId\": \"${CLIENT_ID}\",
            \"name\": \"DIVE V3 Frontend - ${CODE_UPPER}\",
            \"enabled\": true,
            \"clientAuthenticatorType\": \"client-secret\",
            \"secret\": \"${CLIENT_SECRET}\",
            \"redirectUris\": [
                \"${FRONTEND_URL}/*\",
                \"https://localhost:3000/*\"
            ],
            \"webOrigins\": [
                \"${FRONTEND_URL}\",
                \"https://localhost:3000\"
            ],
            \"standardFlowEnabled\": true,
            \"directAccessGrantsEnabled\": false,
            \"publicClient\": false,
            \"protocol\": \"openid-connect\",
            \"attributes\": {
                \"pkce.code.challenge.method\": \"S256\",
                \"post.logout.redirect.uris\": \"${FRONTEND_URL}/*\"
            }
        }" 2>/dev/null
    
    # Get client UUID
    CLIENT_UUID=$(curl -sk -H "Authorization: Bearer $TOKEN" \
        "${PUBLIC_KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients?clientId=${CLIENT_ID}" 2>/dev/null | \
        jq -r '.[0].id')
    
    log_success "Client created: ${CLIENT_ID}"
fi

# =============================================================================
# Assign Default Scopes to Client
# =============================================================================
log_step "Assigning default scopes to client..."

for SCOPE in openid profile email; do
    SCOPE_ID=$(curl -sk -H "Authorization: Bearer $TOKEN" \
        "${PUBLIC_KEYCLOAK_URL}/admin/realms/${REALM_NAME}/client-scopes" 2>/dev/null | \
        jq -r ".[] | select(.name==\"${SCOPE}\") | .id")
    
    if [[ -n "$SCOPE_ID" ]]; then
        curl -sk -X PUT "${PUBLIC_KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/default-client-scopes/${SCOPE_ID}" \
            -H "Authorization: Bearer $TOKEN" 2>/dev/null
    fi
done
log_success "Default scopes assigned"

# =============================================================================
# Create Protocol Mappers for DIVE Attributes
# =============================================================================
log_step "Creating DIVE attribute mappers..."

# Clearance mapper
curl -sk -X POST "${PUBLIC_KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/protocol-mappers/models" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "name": "clearance",
        "protocol": "openid-connect",
        "protocolMapper": "oidc-usermodel-attribute-mapper",
        "config": {
            "user.attribute": "clearance",
            "claim.name": "clearance",
            "id.token.claim": "true",
            "access.token.claim": "true",
            "userinfo.token.claim": "true",
            "jsonType.label": "String"
        }
    }' 2>/dev/null || true

# Country mapper
curl -sk -X POST "${PUBLIC_KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/protocol-mappers/models" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "name": "countryOfAffiliation",
        "protocol": "openid-connect",
        "protocolMapper": "oidc-usermodel-attribute-mapper",
        "config": {
            "user.attribute": "countryOfAffiliation",
            "claim.name": "countryOfAffiliation",
            "id.token.claim": "true",
            "access.token.claim": "true",
            "userinfo.token.claim": "true",
            "jsonType.label": "String"
        }
    }' 2>/dev/null || true

# UniqueID mapper
curl -sk -X POST "${PUBLIC_KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/protocol-mappers/models" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "name": "uniqueID",
        "protocol": "openid-connect",
        "protocolMapper": "oidc-usermodel-attribute-mapper",
        "config": {
            "user.attribute": "uniqueID",
            "claim.name": "uniqueID",
            "id.token.claim": "true",
            "access.token.claim": "true",
            "userinfo.token.claim": "true",
            "jsonType.label": "String"
        }
    }' 2>/dev/null || true

# COI mapper
curl -sk -X POST "${PUBLIC_KEYCLOAK_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/protocol-mappers/models" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "name": "acpCOI",
        "protocol": "openid-connect",
        "protocolMapper": "oidc-usermodel-attribute-mapper",
        "config": {
            "user.attribute": "acpCOI",
            "claim.name": "acpCOI",
            "id.token.claim": "true",
            "access.token.claim": "true",
            "userinfo.token.claim": "true",
            "jsonType.label": "JSON"
        }
    }' 2>/dev/null || true

log_success "DIVE attribute mappers created"

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              Keycloak Initialization Complete                ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Realm: ${REALM_NAME}                               ║"
echo "║  Client: ${CLIENT_ID}                               ║"
echo "║  Client Secret: ${CLIENT_SECRET:0:20}...            ║"
echo "║                                                              ║"
echo "║  Scopes: openid, profile, email                              ║"
echo "║  Mappers: clearance, countryOfAffiliation, uniqueID, acpCOI  ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Save client secret to .env if not already there
if [[ -f "${INSTANCE_DIR}/.env" ]]; then
    if ! grep -q "KEYCLOAK_CLIENT_SECRET" "${INSTANCE_DIR}/.env"; then
        echo "KEYCLOAK_CLIENT_SECRET=${CLIENT_SECRET}" >> "${INSTANCE_DIR}/.env"
        log_info "Client secret saved to ${INSTANCE_DIR}/.env"
    fi
fi

log_info "Next: Run ./scripts/spoke-init/seed-users.sh ${INSTANCE_CODE}"

