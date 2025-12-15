#!/usr/bin/env bash
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

# Detect local dev hostname from instance.json (if present)
IDP_HOST_FROM_INSTANCE=""
BASE_URL_FROM_INSTANCE=""
KEYCLOAK_HTTPS_PORT_FROM_INSTANCE=""
if command -v jq >/dev/null 2>&1 && [[ -f "${INSTANCE_DIR}/instance.json" ]]; then
    IDP_HOST_FROM_INSTANCE=$(jq -r '.hostnames.idp // empty' "${INSTANCE_DIR}/instance.json")
    BASE_URL_FROM_INSTANCE=$(jq -r '.baseUrl // empty' "${INSTANCE_DIR}/instance.json")
    KEYCLOAK_HTTPS_PORT_FROM_INSTANCE=$(jq -r '.ports.keycloak_https // empty' "${INSTANCE_DIR}/instance.json")
fi

# Set defaults - dynamically check for instance-specific password variable
# Look for KEYCLOAK_ADMIN_PASSWORD_<CODE> first, then fallback to generic KEYCLOAK_ADMIN_PASSWORD
INSTANCE_PASSWORD_VAR="KEYCLOAK_ADMIN_PASSWORD_${CODE_UPPER}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-${!INSTANCE_PASSWORD_VAR:-${KEYCLOAK_ADMIN_PASSWORD:-admin}}}"

# Use backend container for API calls (has curl, on same network)
PROJECT_PREFIX="${COMPOSE_PROJECT_NAME:-$CODE_LOWER}"
API_CONTAINER="${PROJECT_PREFIX}-backend-${CODE_LOWER}-1"
KC_CONTAINER="${PROJECT_PREFIX}-keycloak-${CODE_LOWER}-1"

# Internal URL for API calls (via Docker network using Keycloak container name)
KEYCLOAK_INTERNAL_URL="https://keycloak-${CODE_LOWER}:8443"
# Default public URL:
# Determine the public Keycloak URL for frontendUrl (issuer in tokens)
# Priority:
#   1. Explicit PUBLIC_KEYCLOAK_URL environment variable
#   2. DIVE_LOCAL_DEV=true -> use localhost with port offset
#   3. instance.json detection (localhost in baseUrl or hostnames.idp)
#   4. Fallback to cloud hostname (requires Cloudflare tunnel)
BASE_HOST_FROM_INSTANCE=""
if [[ -n "${BASE_URL_FROM_INSTANCE}" ]]; then
    BASE_HOST_FROM_INSTANCE=$(echo "${BASE_URL_FROM_INSTANCE}" | sed -E 's#https?://([^/:]+).*#\1#')
fi

# Calculate port for this instance using NATO countries database (single source of truth)
# Load NATO database if available
NATO_DB_PATH="${SCRIPT_DIR}/../nato-countries.sh"
if [[ -f "$NATO_DB_PATH" ]]; then
    source "$NATO_DB_PATH"
fi

# Get port offset from NATO database or fall back to legacy offsets
if type -t get_country_offset >/dev/null 2>&1 && is_nato_country "$CODE_UPPER" 2>/dev/null; then
    local_port_offset=$(get_country_offset "$CODE_UPPER")
    log_info "Using NATO database port offset: $local_port_offset for $CODE_UPPER"
else
    # Legacy fallback for non-NATO or when database not loaded
    case "$CODE_UPPER" in
        USA) local_port_offset=0 ;;
        *)   local_port_offset=$(( ($(echo "$CODE_UPPER" | cksum | cut -d' ' -f1) % 20) + 15 )) ;;
    esac
    log_warn "NATO database not loaded, using fallback offset: $local_port_offset"
fi
local_kc_port=$((8443 + local_port_offset))

# Detect local development mode
IS_LOCAL_DEV=false
if [[ "${DIVE_LOCAL_DEV}" == "true" || "${IDP_HOST_FROM_INSTANCE}" == "localhost" || "${BASE_HOST_FROM_INSTANCE}" == "localhost" || "${BASE_HOST_FROM_INSTANCE}" == "127.0.0.1" ]]; then
    IS_LOCAL_DEV=true
fi

# Also detect if we're running in Docker Compose on localhost (no tunnel)
if [[ -z "${CLOUDFLARE_TUNNEL_TOKEN}" && -z "${TUNNEL_TOKEN}" ]]; then
    IS_LOCAL_DEV=true
fi

if [[ "$IS_LOCAL_DEV" == "true" ]]; then
    PUBLIC_KEYCLOAK_URL="${PUBLIC_KEYCLOAK_URL:-https://localhost:${local_kc_port}}"
    log_info "Local dev mode: Using frontendUrl=${PUBLIC_KEYCLOAK_URL}"
else
    PUBLIC_KEYCLOAK_URL="${PUBLIC_KEYCLOAK_URL:-https://${CODE_LOWER}-idp.dive25.com}"
fi

# Helper function to call Keycloak API via Docker exec (uses backend container)
kc_curl() {
    docker exec "$API_CONTAINER" curl -sk "$@" 2>/dev/null
}

CLIENT_SECRET="${KEYCLOAK_CLIENT_SECRET:-$(openssl rand -hex 32)}"
FRONTEND_URL="${FRONTEND_URL:-https://${CODE_LOWER}-app.dive25.com}"

# Calculate the correct localhost port for this spoke using port offset
# This ensures redirect URIs work correctly for local development
LOCAL_FRONTEND_PORT=$((3000 + local_port_offset))
LOCAL_BACKEND_PORT=$((4000 + local_port_offset))

# Derive localhost fallback - use calculated port offset, not parsed from URL
# CRITICAL: This fixes the "Invalid parameter: redirect_uri" error for spokes
if [[ "$IS_LOCAL_DEV" == "true" ]]; then
    LOCALHOST_FALLBACK="https://localhost:${LOCAL_FRONTEND_PORT}"
else
    # For production, still include localhost:3000 as common fallback
    LOCALHOST_FALLBACK="https://localhost:${LOCAL_FRONTEND_PORT}"
fi
log_info "Localhost fallback URL: ${LOCALHOST_FALLBACK}"

# Keycloak expects post logout redirect URIs as a single string delimited by "##" (realm export format).
# IMPORTANT: Do NOT use spaces as delimiters — Keycloak will treat it as one value and reject logout redirects.
# CRITICAL FIX: Include both the calculated port-based localhost URL AND common fallback ports
POST_LOGOUT_REDIRECT_URIS="${FRONTEND_URL}##${FRONTEND_URL}/*##${FRONTEND_URL}/api/auth/logout-callback##${LOCALHOST_FALLBACK}##${LOCALHOST_FALLBACK}/*##${LOCALHOST_FALLBACK}/api/auth/logout-callback##https://localhost:3000##https://localhost:3000/*##https://localhost:3000/api/auth/logout-callback##http://localhost:3000##http://localhost:3000/*##http://localhost:3000/api/auth/logout-callback"

# Map country codes to full names for Keycloak theme detection (POSIX-friendly)
case "$CODE_LOWER" in
    usa) COUNTRY_FULL_NAME="United States" ;;
    fra) COUNTRY_FULL_NAME="France" ;;
    gbr) COUNTRY_FULL_NAME="United Kingdom" ;;
    deu) COUNTRY_FULL_NAME="Germany" ;;
    can) COUNTRY_FULL_NAME="Canada" ;;
    esp) COUNTRY_FULL_NAME="Spain" ;;
    ita) COUNTRY_FULL_NAME="Italy" ;;
    nld) COUNTRY_FULL_NAME="Netherlands" ;;
    pol) COUNTRY_FULL_NAME="Poland" ;;
    *)   COUNTRY_FULL_NAME="$CODE_UPPER" ;;
esac
REALM_DISPLAY_NAME="DIVE V3 - ${COUNTRY_FULL_NAME} Instance"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         DIVE V3 Spoke Keycloak Initialization                ║"
echo "║                Instance: ${CODE_UPPER}                                    ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
log_info "Keycloak URL: ${KEYCLOAK_INTERNAL_URL}"
log_info "Realm: ${REALM_NAME}"
log_info "Client: ${CLIENT_ID}"
echo ""

# =============================================================================
# Get Admin Token
# =============================================================================
log_step "Authenticating with Keycloak Admin API..."

# Use Docker exec to call Keycloak API (bypasses network issues)
TOKEN=$(kc_curl -X POST "${KEYCLOAK_INTERNAL_URL}/realms/master/protocol/openid-connect/token" \
    -d "client_id=admin-cli" \
    -d "username=admin" \
    -d "password=${ADMIN_PASSWORD}" \
    -d "grant_type=password" | jq -r '.access_token')

if [[ -z "$TOKEN" || "$TOKEN" == "null" ]]; then
    log_error "Failed to get admin token. Check Keycloak credentials."
    log_info "Trying to verify Keycloak is running..."
    docker ps --filter "name=${KC_CONTAINER}" --format '{{.Names}}: {{.Status}}'
    exit 1
fi
log_success "Admin authentication successful"

# =============================================================================
# Determine Theme
# =============================================================================
# Check if country-specific theme exists
THEME_NAME="dive-v3-${CODE_LOWER}"
THEME_DIR="keycloak/themes/${THEME_NAME}"

if [[ -d "${THEME_DIR}" ]]; then
    log_info "Found custom theme: ${THEME_NAME}"
else
    # Fall back to default dive-v3 theme
    THEME_NAME="dive-v3"
    log_info "Using default theme: ${THEME_NAME}"
fi

# =============================================================================
# Create Realm (if not exists)
# =============================================================================
log_step "Creating realm: ${REALM_NAME}..."

REALM_EXISTS=$(kc_curl -H "Authorization: Bearer $TOKEN" \
    "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}" 2>/dev/null | jq -r '.realm // empty')

if [[ -n "$REALM_EXISTS" ]]; then
    log_warn "Realm already exists, updating theme, display name, and frontend URL..."
    # Update the theme, display name, and frontendUrl on existing realm
    # CRITICAL: frontendUrl controls the issuer claim in tokens
    kc_curl -X PUT "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"displayName\": \"${REALM_DISPLAY_NAME}\",
            \"loginTheme\": \"${THEME_NAME}\",
            \"accountTheme\": \"${THEME_NAME}\",
            \"adminTheme\": \"keycloak.v2\",
            \"emailTheme\": \"keycloak\",
            \"attributes\": {
                \"frontendUrl\": \"${PUBLIC_KEYCLOAK_URL}\",
                \"backchannelLogoutUrl\": \"${PUBLIC_KEYCLOAK_URL}/realms/${REALM_NAME}/protocol/openid-connect/logout\"
            }
        }" 2>/dev/null
    log_success "Updated: displayName='${REALM_DISPLAY_NAME}', theme='${THEME_NAME}', frontendUrl='${PUBLIC_KEYCLOAK_URL}'"
else
    # CRITICAL: Set frontendUrl to ensure correct issuer in tokens
    # Without this, tokens may include internal port (8443) instead of public URL
    kc_curl -X POST "${KEYCLOAK_INTERNAL_URL}/admin/realms" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"realm\": \"${REALM_NAME}\",
            \"enabled\": true,
            \"displayName\": \"${REALM_DISPLAY_NAME}\",
            \"loginTheme\": \"${THEME_NAME}\",
            \"accountTheme\": \"${THEME_NAME}\",
            \"adminTheme\": \"keycloak.v2\",
            \"emailTheme\": \"keycloak\",
            \"registrationAllowed\": false,
            \"loginWithEmailAllowed\": true,
            \"duplicateEmailsAllowed\": false,
            \"resetPasswordAllowed\": true,
            \"editUsernameAllowed\": false,
            \"bruteForceProtected\": true,
            \"accessTokenLifespan\": 900,
            \"ssoSessionMaxLifespan\": 28800,
            \"offlineSessionMaxLifespan\": 2592000,
            \"attributes\": {
                \"frontendUrl\": \"${PUBLIC_KEYCLOAK_URL}\",
                \"backchannelLogoutUrl\": \"${PUBLIC_KEYCLOAK_URL}/realms/${REALM_NAME}/protocol/openid-connect/logout\"
            }
        }" 2>/dev/null
    log_success "Realm created: ${REALM_NAME} (${COUNTRY_FULL_NAME}) with theme: ${THEME_NAME}, frontendUrl: ${PUBLIC_KEYCLOAK_URL}"
fi

# =============================================================================
# Initialize User Profile (Multi-Valued COI Support)
# =============================================================================
log_step "Initializing User Profile with multi-valued attributes..."

# Call the TypeScript init script from backend
BACKEND_CONTAINER="${PROJECT_PREFIX}-backend-${CODE_LOWER}-1"
USER_PROFILE_SCRIPT="/app/src/scripts/init-user-profiles.ts"

# Check if backend container is running
if docker ps --filter "name=${BACKEND_CONTAINER}" --format '{{.Names}}' | grep -q "${BACKEND_CONTAINER}"; then
    # Run the User Profile init script inside the backend container
    # NOTE: Must not abort the whole init script if this step fails (set -e is enabled).
    if docker exec "$BACKEND_CONTAINER" npx ts-node "$USER_PROFILE_SCRIPT" "$CODE_UPPER" 2>/dev/null; then
        log_success "User Profile initialized with multi-valued COI support"
    else
        log_warn "User Profile initialization failed (non-blocking; continuing)"
    fi
else
    log_warn "Backend container not running, skipping User Profile init"
    log_info "Run manually: cd backend && npx ts-node src/scripts/init-user-profiles.ts ${CODE_UPPER}"
fi

# =============================================================================
# Create OAuth Scopes
# =============================================================================
log_step "Creating OAuth scopes..."

for SCOPE in openid profile email; do
    SCOPE_EXISTS=$(kc_curl -H "Authorization: Bearer $TOKEN" \
        "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/client-scopes" 2>/dev/null | \
        jq -r ".[] | select(.name==\"${SCOPE}\") | .name")
    
    if [[ -z "$SCOPE_EXISTS" ]]; then
        kc_curl -X POST "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/client-scopes" \
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

CLIENT_EXISTS=$(kc_curl -H "Authorization: Bearer $TOKEN" \
    "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/clients?clientId=${CLIENT_ID}" 2>/dev/null | \
    jq -r '.[0].id // empty')

if [[ -n "$CLIENT_EXISTS" ]]; then
    log_warn "Client already exists, updating..."
    CLIENT_UUID="$CLIENT_EXISTS"
    # CRITICAL FIX: Include both port-offset localhost URLs AND common fallbacks
    # This fixes "Invalid parameter: redirect_uri" for spokes on non-default ports
    kc_curl -X PUT "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"redirectUris\": [
                \"${FRONTEND_URL}\",
                \"${FRONTEND_URL}/*\",
                \"${FRONTEND_URL}/api/auth/callback/keycloak\",
                \"${LOCALHOST_FALLBACK}\",
                \"${LOCALHOST_FALLBACK}/*\",
                \"${LOCALHOST_FALLBACK}/api/auth/callback/keycloak\",
                \"https://localhost:3000\",
                \"https://localhost:3000/*\",
                \"https://localhost:3000/api/auth/callback/keycloak\",
                \"http://localhost:3000\",
                \"http://localhost:3000/*\",
                \"http://localhost:3000/api/auth/callback/keycloak\"
            ],
            \"webOrigins\": [
                \"${FRONTEND_URL}\",
                \"${LOCALHOST_FALLBACK}\",
                \"https://localhost:3000\",
                \"http://localhost:3000\"
            ],
            \"attributes\": {
                \"pkce.code.challenge.method\": \"S256\",
                \"post.logout.redirect.uris\": \"${POST_LOGOUT_REDIRECT_URIS}\",
                \"frontchannel.logout.url\": \"${LOCALHOST_FALLBACK}/api/auth/logout-callback\",
                \"backchannel.logout.session.required\": \"true\",
                \"backchannel.logout.revoke.offline.tokens\": \"false\"
            },
            \"frontchannelLogout\": true
        }" 2>/dev/null
else
    # Create client with comprehensive redirect URIs including port-offset localhost
    kc_curl -X POST "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/clients" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"clientId\": \"${CLIENT_ID}\",
            \"name\": \"DIVE V3 Frontend - ${CODE_UPPER}\",
            \"enabled\": true,
            \"clientAuthenticatorType\": \"client-secret\",
            \"secret\": \"${CLIENT_SECRET}\",
            \"redirectUris\": [
                \"${FRONTEND_URL}\",
                \"${FRONTEND_URL}/*\",
                \"${FRONTEND_URL}/api/auth/callback/keycloak\",
                \"${LOCALHOST_FALLBACK}\",
                \"${LOCALHOST_FALLBACK}/*\",
                \"${LOCALHOST_FALLBACK}/api/auth/callback/keycloak\",
                \"https://localhost:3000\",
                \"https://localhost:3000/*\",
                \"https://localhost:3000/api/auth/callback/keycloak\"
            ],
            \"webOrigins\": [
                \"${FRONTEND_URL}\",
                \"${LOCALHOST_FALLBACK}\",
                \"https://localhost:3000\",
                \"http://localhost:3000\"
            ],
            \"standardFlowEnabled\": true,
            \"directAccessGrantsEnabled\": false,
            \"publicClient\": false,
            \"protocol\": \"openid-connect\",
            \"attributes\": {
                \"pkce.code.challenge.method\": \"S256\",
                \"post.logout.redirect.uris\": \"${POST_LOGOUT_REDIRECT_URIS}\",
                \"frontchannel.logout.url\": \"${LOCALHOST_FALLBACK}/api/auth/logout-callback\",
                \"backchannel.logout.session.required\": \"true\",
                \"backchannel.logout.revoke.offline.tokens\": \"false\"
            },
            \"frontchannelLogout\": true
        }" 2>/dev/null
    
    # Get client UUID
    CLIENT_UUID=$(kc_curl -H "Authorization: Bearer $TOKEN" \
        "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/clients?clientId=${CLIENT_ID}" 2>/dev/null | \
        jq -r '.[0].id')
    
    log_success "Client created: ${CLIENT_ID}"
fi

# =============================================================================
# Assign Default Scopes to Client
# =============================================================================
log_step "Assigning default scopes to client..."

for SCOPE in openid profile email; do
    SCOPE_ID=$(kc_curl -H "Authorization: Bearer $TOKEN" \
        "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/client-scopes" 2>/dev/null | \
        jq -r ".[] | select(.name==\"${SCOPE}\") | .id")
    
    if [[ -n "$SCOPE_ID" ]]; then
        kc_curl -X PUT "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/default-client-scopes/${SCOPE_ID}" \
            -H "Authorization: Bearer $TOKEN" 2>/dev/null
    fi
done
log_success "Default scopes assigned"

# =============================================================================
# Create Protocol Mappers for DIVE Attributes
# =============================================================================
log_step "Creating DIVE attribute mappers..."

# Clearance mapper
kc_curl -X POST "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/protocol-mappers/models" \
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
kc_curl -X POST "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/protocol-mappers/models" \
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
kc_curl -X POST "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/protocol-mappers/models" \
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

# COI mapper (CRITICAL: must be multivalued for users with multiple COIs)
# jsonType must be "String" not "JSON" for multivalued string arrays
kc_curl -X POST "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/clients/${CLIENT_UUID}/protocol-mappers/models" \
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
            "jsonType.label": "String",
            "multivalued": "true"
        }
    }' 2>/dev/null || true

log_success "DIVE attribute mappers created"

# =============================================================================
# Ensure Cross-Border Federation Client (for other instances to federate TO us)
# =============================================================================
log_step "Ensuring cross-border federation client (dive-v3-cross-border-client)..."

HUB_IDP_URL="${HUB_IDP_URL:-https://localhost:8443}"
CROSS_BORDER_CLIENT_ID="dive-v3-cross-border-client"
# Use well-known dev secret for local development (MUST be overridden in production via GCP)
CROSS_BORDER_SECRET="${CROSS_BORDER_CLIENT_SECRET:-${KEYCLOAK_CLIENT_SECRET:-cross-border-secret-2025}}"

# Redirect URIs for cross-border: Keycloak only supports wildcards at the END of URIs
# Include explicit hub broker endpoint + broad wildcard patterns
# CRITICAL: Include both default ports AND port-offset ports for all scenarios
# Use calculated port for this instance
CROSS_BORDER_REDIRECT_URIS="[\"https://localhost:8443/*\",\"https://localhost:8443/realms/dive-v3-broker/broker/${CODE_LOWER}-idp/endpoint\",\"https://localhost:8443/realms/dive-v3-broker/broker/${CODE_LOWER}-idp/endpoint/*\",\"https://localhost:3000/*\",\"https://localhost:${local_kc_port}/*\",\"https://localhost:${local_kc_port}/realms/dive-v3-broker-${CODE_LOWER}/broker/usa-idp/endpoint\",\"https://localhost:${local_kc_port}/realms/dive-v3-broker-${CODE_LOWER}/broker/usa-idp/endpoint/*\",\"https://${CODE_LOWER}-idp.dive25.com/*\"]"

EXISTING_CB_CLIENT=$(kc_curl -H "Authorization: Bearer $TOKEN" \
    "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/clients?clientId=${CROSS_BORDER_CLIENT_ID}" 2>/dev/null | jq -r '.[0].id // empty')
CB_CLIENT_UUID="$EXISTING_CB_CLIENT"

if [[ -n "$EXISTING_CB_CLIENT" ]]; then
    kc_curl -X PUT "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/clients/${EXISTING_CB_CLIENT}" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"redirectUris\": ${CROSS_BORDER_REDIRECT_URIS},
            \"webOrigins\": [\"*\"],
            \"publicClient\": false,
            \"clientAuthenticatorType\": \"client-secret\",
            \"attributes\": {
                \"pkce.code.challenge.method\": \"S256\"
            }
        }" 2>/dev/null
    log_info "Cross-border client exists: ${CROSS_BORDER_CLIENT_ID} (updated)"
else
    kc_curl -X POST "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/clients" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"clientId\": \"${CROSS_BORDER_CLIENT_ID}\",
            \"name\": \"DIVE V3 Cross-Border Federation\",
            \"enabled\": true,
            \"publicClient\": false,
            \"clientAuthenticatorType\": \"client-secret\",
            \"secret\": \"${CROSS_BORDER_SECRET}\",
            \"redirectUris\": ${CROSS_BORDER_REDIRECT_URIS},
            \"webOrigins\": [\"*\"],
            \"protocol\": \"openid-connect\",
            \"standardFlowEnabled\": true,
            \"directAccessGrantsEnabled\": false,
            \"serviceAccountsEnabled\": false,
            \"attributes\": {
                \"pkce.code.challenge.method\": \"S256\"
            }
        }" 2>/dev/null
    log_success "Cross-border client created: ${CROSS_BORDER_CLIENT_ID}"
    CB_CLIENT_UUID=$(kc_curl -H "Authorization: Bearer $TOKEN" \
        "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/clients?clientId=${CROSS_BORDER_CLIENT_ID}" 2>/dev/null | jq -r '.[0].id // empty')
fi

# For backwards compatibility, also keep the FED_CLIENT_UUID reference
FED_CLIENT_UUID="$CB_CLIENT_UUID"

# Ensure the federation client exposes GBR attributes to the hub
if [[ -n "$FED_CLIENT_UUID" ]]; then
    ensure_mapper() {
        local mapper_name="$1"
        local user_attr="$2"
        local claim_name="$3"
        local multivalued="${4:-false}"
        local json_type="${5:-String}"
        local existing
        existing=$(kc_curl -H "Authorization: Bearer $TOKEN" \
            "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/clients/${FED_CLIENT_UUID}/protocol-mappers/models" 2>/dev/null | \
            jq -r --arg name "$mapper_name" '.[] | select(.name==$name) | .id // empty')
        local payload
        payload=$(cat <<EOF
{
  "name": "${mapper_name}",
  "protocol": "openid-connect",
  "protocolMapper": "oidc-usermodel-attribute-mapper",
  "config": {
    "user.attribute": "${user_attr}",
    "claim.name": "${claim_name}",
    "id.token.claim": "true",
    "access.token.claim": "true",
    "userinfo.token.claim": "true",
    "jsonType.label": "${json_type}",
    "multivalued": "${multivalued}"
  }
}
EOF
)
        if [[ -n "$existing" ]]; then
            kc_curl -X PUT "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/clients/${FED_CLIENT_UUID}/protocol-mappers/models/${existing}" \
                -H "Authorization: Bearer $TOKEN" \
                -H "Content-Type: application/json" \
                -d "${payload}" >/dev/null 2>&1
        else
            kc_curl -X POST "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/clients/${FED_CLIENT_UUID}/protocol-mappers/models" \
                -H "Authorization: Bearer $TOKEN" \
                -H "Content-Type: application/json" \
                -d "${payload}" >/dev/null 2>&1
        fi
    }
    ensure_mapper "clearance" "clearance" "clearance" "false" "String"
    ensure_mapper "countryOfAffiliation" "countryOfAffiliation" "countryOfAffiliation" "false" "String"
    ensure_mapper "uniqueID" "uniqueID" "uniqueID" "false" "String"
    ensure_mapper "acpCOI" "acpCOI" "acpCOI" "true" "String"
fi

# =============================================================================
# Ensure USA Hub Identity Provider (so spoke can federate to hub)
# =============================================================================
log_step "Ensuring USA hub IdP (usa-idp) is configured..."

USA_IDP_ALIAS="usa-idp"
USA_IDP_DISPLAY="United States"
HUB_IDP_PUBLIC_URL="${HUB_IDP_URL:-https://localhost:8443}"
HUB_IDP_INTERNAL_URL="${HUB_IDP_INTERNAL_URL:-${HUB_IDP_PUBLIC_URL}}"
HUB_IDP_DISABLE_TRUST="${HUB_IDP_DISABLE_TRUST:-true}"
# Use the hub's cross-border client (must exist in USA Keycloak's dive-v3-broker realm)
USA_IDP_CLIENT_ID="${USA_IDP_CLIENT_ID:-dive-v3-cross-border-client}"
# Allow multiple env var fallbacks for the client secret
USA_IDP_CLIENT_SECRET="${USA_IDP_CLIENT_SECRET:-${CROSS_BORDER_CLIENT_SECRET:-${HUB_IDP_CLIENT_SECRET:-${KEYCLOAK_CLIENT_SECRET:-}}}}"

if [[ -z "${USA_IDP_CLIENT_SECRET}" ]]; then
    log_warn "Hub federation client secret not set (USA_IDP_CLIENT_SECRET / FEDERATION_CLIENT_SECRET_*). Skipping IdP create/update."
else
    USA_IDP_PAYLOAD="{
        \"alias\": \"${USA_IDP_ALIAS}\",
        \"displayName\": \"${USA_IDP_DISPLAY}\",
        \"providerId\": \"oidc\",
        \"enabled\": true,
        \"updateProfileFirstLoginMode\": \"off\",
        \"storeToken\": true,
        \"addReadTokenRoleOnCreate\": true,
        \"trustEmail\": true,
        \"firstBrokerLoginFlowAlias\": \"first broker login\",
        \"config\": {
            \"clientId\": \"${USA_IDP_CLIENT_ID}\",
            \"clientSecret\": \"${USA_IDP_CLIENT_SECRET}\",
            \"defaultScope\": \"openid profile email\",
            \"authorizationUrl\": \"${HUB_IDP_PUBLIC_URL}/realms/dive-v3-broker/protocol/openid-connect/auth\",
            \"tokenUrl\": \"${HUB_IDP_INTERNAL_URL}/realms/dive-v3-broker/protocol/openid-connect/token\",
            \"logoutUrl\": \"${HUB_IDP_PUBLIC_URL}/realms/dive-v3-broker/protocol/openid-connect/logout\",
            \"userInfoUrl\": \"${HUB_IDP_INTERNAL_URL}/realms/dive-v3-broker/protocol/openid-connect/userinfo\",
            \"issuer\": \"${HUB_IDP_PUBLIC_URL}/realms/dive-v3-broker\",
            \"jwksUrl\": \"${HUB_IDP_INTERNAL_URL}/realms/dive-v3-broker/protocol/openid-connect/certs\",
            \"validateSignature\": \"true\",
            \"useJwksUrl\": \"true\",
            \"backchannelSupported\": \"true\",
            \"syncMode\": \"INHERIT\",
            \"pkceEnabled\": \"true\",
            \"pkceMethod\": \"S256\"
        }
    }"

    EXISTING_USA_IDP=$(kc_curl -H "Authorization: Bearer $TOKEN" \
        "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/identity-provider/instances/${USA_IDP_ALIAS}" 2>/dev/null | jq -r '.alias // empty')

    if [[ -n "${EXISTING_USA_IDP}" ]]; then
        kc_curl -X PUT "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/identity-provider/instances/${USA_IDP_ALIAS}" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "${USA_IDP_PAYLOAD}" 2>/dev/null
        log_info "Updated existing IdP: ${USA_IDP_ALIAS}"
    else
        kc_curl -X POST "${KEYCLOAK_INTERNAL_URL}/admin/realms/${REALM_NAME}/identity-provider/instances" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "${USA_IDP_PAYLOAD}" 2>/dev/null
        log_success "Created IdP: ${USA_IDP_ALIAS}"
    fi
fi

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

# =============================================================================
# AUTO-SEED USERS AND RESOURCES
# =============================================================================
log_info "Auto-seeding users and resources..."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Seed users (pass Keycloak URL and password)
if [[ -x "${SCRIPT_DIR}/seed-users.sh" ]]; then
    log_info "Running seed-users.sh..."
    "${SCRIPT_DIR}/seed-users.sh" "${INSTANCE_CODE}" "${PUBLIC_KEYCLOAK_URL}" "${ADMIN_PASSWORD}" || {
        log_warn "User seeding failed - you can run manually: ./scripts/spoke-init/seed-users.sh ${INSTANCE_CODE}"
    }
else
    log_warn "seed-users.sh not found or not executable"
fi

# Seed resources (needs MONGO_PASSWORD from container)
if [[ -x "${SCRIPT_DIR}/seed-resources.sh" ]]; then
    log_info "Running seed-resources.sh..."
    MONGO_CONTAINER="${CODE_LOWER}-mongodb-${CODE_LOWER}-1"
    MONGO_PWD=$(docker exec "$MONGO_CONTAINER" printenv MONGO_INITDB_ROOT_PASSWORD 2>/dev/null || echo "")
    if [[ -n "$MONGO_PWD" ]]; then
        MONGO_PASSWORD="$MONGO_PWD" "${SCRIPT_DIR}/seed-resources.sh" "${INSTANCE_CODE}" || {
            log_warn "Resource seeding failed - you can run manually: ./scripts/spoke-init/seed-resources.sh ${INSTANCE_CODE}"
        }
    else
        log_warn "Could not get MongoDB password from container - skipping resource seeding"
    fi
else
    log_warn "seed-resources.sh not found or not executable"
fi

log_info "Keycloak initialization complete for ${INSTANCE_CODE}"

